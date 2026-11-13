/**
 * Data layer of the Admin UI (state + async dispatch + load status), backed by the real API.
 *
 *   - Summaries first. The case list, dashboard and map are built from GET /cases/summaries and GET /cases/work-queue (one
 *     short row per case and the open follow-ups, claims, referrals and warnings). A case's full record (assessment,
 *     referrals, follow-ups, timeline, photos, notes) is read when the case is opened (`loadCase`).
 *   - The server is the authority. Every action is one or two requests (actions.ts); nothing is applied optimistically. After a
 *     change the provider re-reads what it touched, so the screen shows what the server holds. A refresh that fails after a
 *     change was saved never turns the change into an error (that would invite a duplicate).
 *   - No sample data, ever. A request that fails leaves its part empty and says so (`issues`, `loadError`, `detailStatus`).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { caseRef, reportIdOf } from '../../live/refs';
import { AdminApiError, errorMessage } from '../../preview/lib/errors';
import { clearLiveGeography, setLiveGeography } from '../../preview/geo';
import { addDays } from '../../preview/lib/format';
import { useAuth } from '../auth/context';
import { AdminDataContext, type AdminCapabilities, type DetailStatus, type LoadIssue, type LoadStatus } from '../data/context';
import type { AdminAction } from '../data/actions';
import type { DateRange } from '../data/selectors';
import type { AdminState, Case, Notice, Resident, Settings } from '../data/types';
import { runAction, type ActionContext, type ActionResult } from './actions';
import * as ad from './adapters';
import { adminApi, type ApiCaseSettings, type ApiUser } from './api';
import { fromServer } from '../../live/dates';

const LIVE_CAPABILITIES: AdminCapabilities = {
  changeResidentStatus: false, editProfileTitle: false, editSubdivisionIdentity: false, petMatchDecisions: false, warningTerms: false, noticeWithoutCase: false,
  acceptConfirmsOwnership: false,
};

const REFRESH_AFTER_MS = 60_000;
const NOTIFICATION_POLL_MS = 60_000;

const blankSettings = (): Settings => ({
  subdivision: { name: '', city: '', address: '', officePhone: '', officeEmail: '', officeHours: '' },
  notifications: { newReports: true, urgent: true, followUps: true, claims: true, caseActivity: true, channels: { inApp: true, email: true, push: true } },
  categories: { lost_pet: true, found_animal: true, nuisance: true, safety: true, injured: true, other: true },
  policies: [], privacy: { lostPetPublication: 'review', foundPublication: 'review' },
});

const emptyState = (name: string, email: string, userId: string): AdminState => ({
  admin: { id: userId, name, title: 'Subdivision Leader', email, phone: '', role: 'Subdivision Leader', subdivision: '', memberSince: '' },
  cases: [], residents: [], pets: [], notices: [], notifications: [], matches: [], settings: blankSettings(), seq: 0,
});

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const unique = <T,>(items: T[]) => [...new Set(items)];

interface Directory { names: Map<number, string>; residents: Map<number, Resident> }

export function LiveAdminDataProvider({ children }: { children: ReactNode }) {
  const { session, expireSession } = useAuth();
  const userId = Number(session?.userId ?? 0);
  const subdivisionId = session?.subdivisionId ?? null;

  const [state, setState] = useState<AdminState>(() => emptyState(session?.name ?? 'Subdivision Leader', session?.email ?? '', session?.userId ?? ''));
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [loadError, setLoadError] = useState<string | undefined>();
  const [issues, setIssues] = useState<LoadIssue[]>([]);
  const [details, setDetails] = useState<Record<string, { status: DetailStatus; error?: string }>>({});

  // What the adapters and actions read at the moment they run (never stale, never a render dependency).
  const stateRef = useRef(state);
  const directory = useRef<Directory>({ names: new Map(), residents: new Map() });
  const refs = useRef<Map<number, string>>(new Map());
  const stored = useRef<ApiCaseSettings | null>(null);
  const opened = useRef<Set<string>>(new Set());
  const loadToken = useRef(0);
  const lastLoadAt = useRef(0);
  const expired = useRef(false);
  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => () => clearLiveGeography(), []);       // the maps use the sample area again only outside the connected app

  const lookup = useCallback((): ad.Lookup => ({
    nameOf: (id) => (id === null || id === undefined ? undefined : directory.current.names.get(id)),
    resident: (id) => (id === null || id === undefined ? undefined : directory.current.residents.get(id)),
    refOf: (reportId) => refs.current.get(reportId) ?? caseRef(reportId, null),
  }), []);

  /** A 401 that the shared client could not renew: ask the person to sign in again, once. */
  const sessionEnded = useCallback((err: unknown): boolean => {
    if (err instanceof AdminApiError && err.kind === 'session') {
      if (!expired.current) { expired.current = true; expireSession(); }
      return true;
    }
    return false;
  }, [expireSession]);

  const setIssue = useCallback((section: string, message: string | null) => {
    setIssues((prev) => { const rest = prev.filter((i) => i.section !== section); return message ? [...rest, { section, message }] : rest; });
  }, []);

  // ------------------------------------------------------------------------------------------------ the first load
  const loadAll = useCallback(async (silent: boolean) => {
    if (subdivisionId === null) return;           // shown as an error by the value below, without setting state here
    const token = ++loadToken.current;           // (the 'loading' state is set by reload(); the first load starts in it)

    const [sum, queue, users, pets, alerts, anns, notifs, cs, cats, prefs, me, coverage, matchList] = await Promise.allSettled([
      adminApi.caseSummaries(), adminApi.workQueue(), adminApi.users(), adminApi.pets(subdivisionId), adminApi.alerts(), adminApi.announcements(subdivisionId),
      adminApi.notifications(), adminApi.settings(subdivisionId), adminApi.categories(), adminApi.preferences(), adminApi.user(userId), adminApi.coverage(),
      adminApi.lostFoundMatches(),
    ]);
    if (token !== loadToken.current) return;                       // a newer load has started; this answer is out of date

    for (const r of [sum, queue, users, pets, alerts, anns, notifs, cs, cats, prefs, me, coverage, matchList]) if (r.status === 'rejected' && sessionEnded(r.reason)) return;

    // The case list is the heart of the interface: without it there is nothing to show, and nothing is invented in its place.
    if (sum.status === 'rejected') {
      if (!silent) { setLoadError(errorMessage(sum.reason)); setStatus('error'); } else setIssue('cases', `The case list could not be refreshed. ${errorMessage(sum.reason)}`);
      return;
    }

    const problems: LoadIssue[] = [];
    const part = <T,>(name: string, label: string, r: PromiseSettledResult<T>): T | null => {
      if (r.status === 'fulfilled') return r.value;
      problems.push({ section: name, message: `${label} could not be loaded. ${errorMessage(r.reason)}` });
      return null;
    };

    const userList = part<ApiUser[]>('residents', 'The resident directory', users);
    if (userList) {
      directory.current = {
        names: new Map(userList.map((u) => [u.user_id, u.name])),
        residents: new Map(),       // filled below, once the pets are known (a resident record lists its pets)
      };
    }
    const petList = part('pets', 'The pet directory', pets);
    const petsByOwner = ad.petIdsByOwner(petList ?? []);
    if (userList) {
      directory.current.residents = new Map(userList.filter((u) => u.role_id === 1).map((u) => [u.user_id, ad.residentFromUser(u, petsByOwner.get(u.user_id) ?? [])]));
    }

    refs.current = new Map(sum.value.items.map((s) => [s.report_id, caseRef(s.report_id, fromServer(s.reported_at))]));
    const lk = lookup();
    const prev = new Map(stateRef.current.cases.map((c) => [c.id, c]));
    let cases: Case[] = sum.value.items.map((s) => {
      const fresh = ad.caseFromSummary(s, lk);
      // A case that is open on screen keeps its full record until its own refresh lands, so nothing blanks mid-read.
      return opened.current.has(fresh.id) && prev.has(fresh.id) ? { ...prev.get(fresh.id) as Case, status: fresh.status, priority: fresh.priority, updatedAt: fresh.updatedAt } : fresh;
    });
    const q = part('queue', 'Follow-ups, claims and referrals', queue);
    if (q) cases = ad.applyQueue(cases, q, opened.current, lk);
    if (sum.value.truncated) problems.push({ section: 'cases', message: `Only the ${sum.value.items.length} newest of ${sum.value.total} cases are shown here.` });

    const alertList = part('notices', 'Lost-pet and found-animal notices', alerts);
    const annList = part('advisories', 'Safety advisories', anns);
    const notices: Notice[] = [
      ...(alertList?.results ?? []).map((a) => ad.noticeFromAlert(a, lk)),
      ...(annList ?? []).filter((a) => ad.ADVISORY_CATEGORIES.has(a.category)).map(ad.noticeFromAnnouncement),
    ];
    const notifList = part('notifications', 'Notifications', notifs);
    const matchRows = part('matches', 'The possible matches between lost and found reports', matchList);

    const csv = part('settings', 'The settings', cs);
    const catv = part('settings', 'The settings', cats);
    const prefv = part('settings', 'The notification preferences', prefs);
    if (csv) stored.current = csv;
    const meUser = part('profile', 'Your profile', me);

    // The case maps draw the server's own reporting area. The Admin has no use for the landmark list, so none is offered.
    const area = part('area', 'The reporting area', coverage);
    if (area) {
      setLiveGeography({
        coverage: { id: 0, subdivision_id: subdivisionId, center_label: area.center_label, center_latitude: area.center_latitude, center_longitude: area.center_longitude, radius_meters: area.radius_meters, boundary_polygon: area.boundary_polygon, is_active: area.is_active },
        landmarks: [],
      });
    }

    // De-duplicate problems that name the same section (the three settings reads count once)
    const seen = new Set<string>();
    const distinct = problems.filter((p) => (seen.has(p.section) ? false : (seen.add(p.section), true)));
    setIssues(distinct);

    const now = new Date();
    setState((s) => ({
      ...s,
      admin: meUser ? ad.profileFromUser(meUser) : s.admin,
      // A case that was opened in full while this refresh was still running (its own read can finish first) keeps that full record: `prev` above was taken
      // before it landed, so the newest state is read here. Only its status, priority and update time come from this refresh.
      cases: cases.map((c) => {
        const open = opened.current.has(c.id) ? s.cases.find((x) => x.id === c.id) : undefined;
        return open ? { ...open, status: c.status, priority: c.priority, updatedAt: c.updatedAt } : c;
      }),
      residents: userList ? [...directory.current.residents.values()] : s.residents,
      pets: petList ? petList.map((p) => ad.petFromApi(p, now)) : s.pets,
      notices: alertList || annList ? notices.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) : s.notices,
      notifications: notifList ? notifList.map(ad.notificationFromApi).sort((a, b) => b.at.localeCompare(a.at)) : s.notifications,
      matches: matchRows ? matchRows.map((m) => ad.matchFromApi(m, lk)) : s.matches,
      settings: csv && catv && prefv ? ad.settingsFrom(csv, catv, prefv) : s.settings,
    }));
    lastLoadAt.current = Date.now();
    setStatus('ready');
  }, [lookup, sessionEnded, setIssue, subdivisionId, userId]);

  // The first read of the server's data starts here; state is set only after the server has answered.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadAll(false); }, [loadAll]);

  // ------------------------------------------------------------------------------------------------ one case, in full
  const setDetail = useCallback((id: string, value: { status: DetailStatus; error?: string }) => setDetails((d) => ({ ...d, [id]: value })), []);

  const loadCase = useCallback(async (id: string) => {
    const rid = reportIdOf(id);
    if (rid === null) { setDetail(id, { status: 'error', error: 'That case could not be found.' }); return; }
    setDetails((d) => (d[id]?.status === 'ready' ? d : { ...d, [id]: { status: 'loading' } }));     // an open case keeps showing while it refreshes
    const [d, r, n] = await Promise.allSettled([adminApi.caseDetail(rid), adminApi.report(rid), adminApi.notes(rid)]);
    for (const x of [d, r, n]) if (x.status === 'rejected' && sessionEnded(x.reason)) return;
    if (d.status === 'rejected') { setDetail(id, { status: 'error', error: errorMessage(d.reason) }); return; }

    const lk = lookup();
    const detail = d.value;
    const own = caseRef(rid, fromServer(detail.reported_at));
    refs.current.set(rid, own);
    setState((s) => {
      const existing = s.cases.find((c) => c.id === own);
      const base = existing ?? ad.caseFromSummary(ad.summaryFromDetail(detail), lk);
      const full = ad.applyDetail(base, detail, r.status === 'fulfilled' ? r.value : null, n.status === 'fulfilled' ? n.value.notes : [], lk);
      return { ...s, cases: existing ? s.cases.map((c) => (c.id === own ? full : c)) : [full, ...s.cases] };
    });
    opened.current.add(own);
    const partial = r.status === 'rejected' || n.status === 'rejected';
    const state: { status: DetailStatus; error?: string } = partial ? { status: 'ready', error: 'The photos, history or notes of this case could not be loaded. What is shown may be incomplete.' } : { status: 'ready' };
    setDetails((x) => ({ ...x, [id]: state, [own]: state }));
  }, [lookup, sessionEnded, setDetail]);

  const detailStatus = useCallback((id: string) => details[id] ?? { status: 'idle' as DetailStatus }, [details]);

  // ----------------------------------------------------------------------------------------- the smaller re-reads
  const refreshNotices = useCallback(async () => {
    if (subdivisionId === null) return;
    const [alerts, anns] = await Promise.allSettled([adminApi.alerts(), adminApi.announcements(subdivisionId)]);
    for (const x of [alerts, anns]) if (x.status === 'rejected' && sessionEnded(x.reason)) return;
    const lk = lookup();
    setState((s) => ({
      ...s,
      notices: [
        ...(alerts.status === 'fulfilled' ? alerts.value.results.map((a) => ad.noticeFromAlert(a, lk)) : s.notices.filter((n) => n.type !== 'safety_advisory')),
        ...(anns.status === 'fulfilled' ? anns.value.filter((a) => ad.ADVISORY_CATEGORIES.has(a.category)).map(ad.noticeFromAnnouncement) : s.notices.filter((n) => n.type === 'safety_advisory')),
      ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    }));
    setIssue('notices', alerts.status === 'rejected' || anns.status === 'rejected' ? 'The notices could not be refreshed after your change. Reload to see their latest state.' : null);
  }, [lookup, sessionEnded, setIssue, subdivisionId]);

  const refreshNotifications = useCallback(async () => {
    try {
      const list = await adminApi.notifications();
      setState((s) => ({ ...s, notifications: list.map(ad.notificationFromApi).sort((a, b) => b.at.localeCompare(a.at)) }));
    } catch (err) { sessionEnded(err); }          // a missed poll is not worth a message; the next one tries again
  }, [sessionEnded]);

  /** The possible matches again (a Leader decided one). A decision is saved before this runs: a failed re-read is only said, never turned into a failure. */
  const refreshMatches = useCallback(async () => {
    try {
      const list = await adminApi.lostFoundMatches();
      const lk = lookup();
      setState((s) => ({ ...s, matches: list.map((m) => ad.matchFromApi(m, lk)) }));
      setIssue('matches', null);
    } catch (err) {
      if (!sessionEnded(err)) setIssue('matches', 'Your decision was saved, but the possible matches could not be read back. Reload to see them.');
    }
  }, [lookup, sessionEnded, setIssue]);

  /** The pet registry again (a pet record was touched). */
  const refreshPets = useCallback(async () => {
    if (subdivisionId === null) return;
    try {
      const list = await adminApi.pets(subdivisionId);
      const byOwner = ad.petIdsByOwner(list);
      const now = new Date();
      directory.current.residents = new Map([...directory.current.residents].map(([id, r]) => [id, { ...r, petIds: byOwner.get(id) ?? [] }]));
      setState((s) => ({ ...s, pets: list.map((p) => ad.petFromApi(p, now)), residents: [...directory.current.residents.values()] }));
    } catch (err) { sessionEnded(err); }          // the change is saved; the next full load shows the registry as it is
  }, [sessionEnded, subdivisionId]);

  const refreshSettings = useCallback(async () => {
    if (subdivisionId === null) return;
    const [cs, cats, prefs, me] = await Promise.allSettled([adminApi.settings(subdivisionId), adminApi.categories(), adminApi.preferences(), adminApi.user(userId)]);
    for (const x of [cs, cats, prefs, me]) if (x.status === 'rejected' && sessionEnded(x.reason)) return;
    if (cs.status === 'fulfilled') stored.current = cs.value;
    setState((s) => ({
      ...s,
      settings: cs.status === 'fulfilled' && cats.status === 'fulfilled' && prefs.status === 'fulfilled' ? ad.settingsFrom(cs.value, cats.value, prefs.value) : s.settings,
      admin: me.status === 'fulfilled' ? ad.profileFromUser(me.value) : s.admin,
    }));
    const failed = cs.status === 'rejected' || cats.status === 'rejected' || prefs.status === 'rejected' || me.status === 'rejected';
    setIssue('settings', failed ? 'Your settings were saved, but could not be read back. Reload to see them.' : null);
  }, [sessionEnded, setIssue, subdivisionId, userId]);

  // ------------------------------------------------------------------------------------------------------- actions
  const dispatch = useCallback(async (action: AdminAction) => {
    if (subdivisionId === null) throw new AdminApiError('server', 'Your account is not assigned to a subdivision.', 403);
    const ctx: ActionContext = {
      userId, subdivisionId,
      caseOf: (id) => stateRef.current.cases.find((c) => c.id === id),
      noticeOf: (id) => stateRef.current.notices.find((n) => n.id === id),
      settings: () => stateRef.current.settings,
      storedSettings: () => stored.current,
      residents: () => stateRef.current.residents,
    };
    let result: ActionResult;
    try {
      result = await runAction(action, ctx);
    } catch (err) {
      sessionEnded(err);
      throw err instanceof AdminApiError ? err : new AdminApiError('server');
    }
    // The change is recorded. Read back what it touched; a failure here must not make the saved change look failed.
    await Promise.all([
      ...unique(result.cases).map((id) => loadCase(id)),
      result.notices ? refreshNotices() : undefined,
      result.notifications ? refreshNotifications() : undefined,
      result.pets ? refreshPets() : undefined,
      result.matches ? refreshMatches() : undefined,
      result.settings || result.profile ? refreshSettings() : undefined,
    ]);
    if (result.warnings?.length) setIssue('after-save', `${result.warnings.join(' ')} What you saved is kept.`);
  }, [loadCase, refreshMatches, refreshNotices, refreshNotifications, refreshPets, refreshSettings, sessionEnded, setIssue, subdivisionId, userId]);

  const reload = useCallback(() => {
    setStatus('loading');
    setLoadError(undefined);
    void loadAll(false).then(() => Promise.all([...opened.current].slice(-3).map((id) => loadCase(id))));
  }, [loadAll, loadCase]);

  // ------------------------------------------------------------------------------------------ staying up to date
  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void refreshNotifications(); }, NOTIFICATION_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastLoadAt.current < REFRESH_AFTER_MS) return;
      void loadAll(true).then(() => Promise.all([...opened.current].slice(-3).map((id) => loadCase(id))));
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [loadAll, loadCase, refreshNotifications]);

  const matchDetail = useCallback(async (matchId: string) => {
    try {
      return ad.matchFromApi(await adminApi.lostFoundMatch(Number(matchId)), lookup());
    } catch (err) {
      sessionEnded(err);
      throw err instanceof AdminApiError ? err : new AdminApiError('server');
    }
  }, [lookup, sessionEnded]);

  const fetchAnalytics = useCallback(async (range: DateRange) => {
    try {
      const last = addDays(range.to, -1);
      const end = last.getTime() > Date.now() ? new Date() : last;      // the server does not read a future end date
      return ad.analyticsFromApi(await adminApi.analytics(ymd(range.from), ymd(end)));
    } catch (err) {
      sessionEnded(err);
      throw err instanceof AdminApiError ? err : new AdminApiError('server');
    }
  }, [sessionEnded]);

  const alertAudience = useCallback(async (caseId: string) => {
    try {
      const n = await adminApi.caseAlertAudience(reportIdOf(caseId) ?? 0);
      return { all: n.all, helpers: n.helpers, residents: n.residents, turnedOff: n.turned_off, pushReady: n.push_ready === true };
    } catch (err) {
      sessionEnded(err);
      throw err instanceof AdminApiError ? err : new AdminApiError('server');
    }
  }, [sessionEnded]);

  // A Leader with no subdivision has nothing to load: say so, rather than showing an empty app as if it were a quiet day.
  const unassigned = subdivisionId === null;
  const value = useMemo(() => ({
    state, status: unassigned ? 'error' as const : status,
    loadError: unassigned ? 'Your account is not assigned to a subdivision, so there is nothing to show yet. Ask the system administrator to assign one.' : loadError,
    issues, dispatch, reload, loadCase, detailStatus, matchDetail, alertAudience, fetchAnalytics, capabilities: LIVE_CAPABILITIES,
  }), [state, status, unassigned, loadError, issues, dispatch, reload, loadCase, detailStatus, matchDetail, alertAudience, fetchAnalytics]);

  return <AdminDataContext.Provider value={value}>{children}</AdminDataContext.Provider>;
}
