/**
 * Data layer of the Resident UI (state + async dispatch + load status), backed by the real API.
 *
 *   - Summaries first. "My reports", Community, claims, pets and notifications are read in parallel when the app opens. A
 *     report's full record (its timeline, photos and case chat) and a notice's sightings are read when they are opened.
 *   - The server decides what a resident may see. Reports arrive already redacted (your own exact pin; neighbours' notices are
 *     rounded to an area; no staff notes, no priority, no other resident's name), and nothing here adds to that.
 *   - The server is the authority on every change (actions.ts). Nothing is applied optimistically, except marking a
 *     notification as read, which is cosmetic and corrected by the next read.
 *   - No sample data, ever. A request that fails leaves its part empty and says so (`issues`, `loadError`, `reportStatus`).
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { fromServer } from '../../live/dates';
import { caseRef, reportIdOf } from '../../live/refs';
import { AdminApiError, errorMessage } from '../../preview/lib/errors';
import { clearLiveGeography, setLiveGeography, type Landmark } from '../../preview/geo';
import type { CoverageAreaInfo } from '../../utils/coverageArea';
import { useAuth } from '../auth/context';
import type { ResidentSession } from '../auth/gateway';
import { ResidentDataContext, type ActionOutcome, type DetailStatus, type LoadIssue, type LoadStatus, type ResidentCapabilities } from '../data/context';
import { reducer, type ResidentAction } from '../data/reducer';
import type { CategoryId, Claim, Notice, Report, ResidentState, Settings } from '../data/types';
import { runAction, type ResidentActionContext } from './actions';
import * as ad from './adapters';
import { residentApi, type ApiResidentAlert, type ApiResidentCategories, type ApiResidentClaim, type CommunityQuery } from './api';

const LIVE_CAPABILITIES: ResidentCapabilities = { messageOffice: false, communityToggles: false, smsChannel: false };
const REFRESH_AFTER_MS = 60_000;
const NOTIFICATION_POLL_MS = 60_000;
const CONVERSATION_POLL_MS = 15_000;
/** With no radius known (the reporting area could not be read) the screen does not refuse a spot; the server checks every report itself. */
const UNKNOWN_RADIUS_M = 100_000;

const defaultSettings = (): Settings => ({
  notifications: { reportUpdates: true, sightings: true, claims: true, community: true, advisories: true, lostFoundAlerts: true },
  channels: { push: true, email: true, sms: false },
});

function emptyState(session: ResidentSession): ResidentState {
  const { unit, street } = ad.splitAddress(session.address);
  return {
    profile: { id: session.userId, name: session.name, email: session.email, phone: session.phone ?? '', unit, street, memberSince: '' },
    office: null, settings: defaultSettings(), reports: [], notices: [], claims: [], pets: [], notifications: [], conversations: [], draft: null, nextRef: 1, seq: 0,
  };
}

type Detail = { status: DetailStatus; error?: string };
const unique = <T,>(items: T[]) => [...new Set(items)];

/** Local actions (a report being written, a read mark) go through the reducer (data/reducer.ts); everything else is the server's. */
type Patch = { type: 'live/patch'; patch: (s: ResidentState) => ResidentState };
const liveReducer = (state: ResidentState, a: (ResidentAction & { now: string }) | Patch): ResidentState => (a.type === 'live/patch' ? a.patch(state) : reducer(state, a));

function Loaded({ session, children }: { session: ResidentSession; children: ReactNode }) {
  const { expireSession } = useAuth();
  const userId = Number(session.userId);
  const subdivisionId = session.subdivisionId ?? null;

  const [state, rawDispatch] = useReducer(liveReducer, session, emptyState);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [loadError, setLoadError] = useState<string | undefined>();
  const [issues, setIssues] = useState<LoadIssue[]>([]);
  const [reportDetails, setReportDetails] = useState<Record<string, Detail>>({});
  const [noticeDetails, setNoticeDetails] = useState<Record<string, Detail>>({});

  const stateRef = useRef(state);
  const refs = useRef<Map<number, string>>(new Map());
  const families = useRef<Map<number, CategoryId>>(new Map());
  const categoryIds = useRef<Map<CategoryId, number>>(new Map());
  const claimsByReport = useRef<Map<number, string>>(new Map());
  const alertsByReport = useRef<Map<number, ApiResidentAlert>>(new Map());
  /** The notices read in full (with their sightings and conversations). The lists hold each one without those, so a change reads them again. */
  const readNotices = useRef<Set<string>>(new Set());
  const mineReports = useRef<Set<number>>(new Set());
  const opened = useRef<Set<string>>(new Set());
  const loadToken = useRef(0);
  const conversationToken = useRef(0);
  const lastLoadAt = useRef(0);
  const expired = useRef(false);
  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => () => clearLiveGeography(), []);

  const patch = useCallback((fn: (s: ResidentState) => ResidentState) => rawDispatch({ type: 'live/patch', patch: fn }), []);
  const refOf = useCallback((n: number) => refs.current.get(n) ?? caseRef(n, null), []);
  const lookup = useCallback((): ad.ResidentLookup => ({
    refOf, familyOf: (id) => (id === null ? 'other' : families.current.get(id) ?? 'other'), claimOfReport: (n) => claimsByReport.current.get(n),
  }), [refOf]);

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

  const refreshConversations = useCallback(async () => {
    const turn = ++conversationToken.current;
    try {
      const list = await residentApi.conversations();
      if (turn !== conversationToken.current) return;
      patch((s) => ({ ...s, conversations: list.map(ad.conversationFromApi) }));
      setIssue('conversations', null);
    } catch (err) {
      if (turn !== conversationToken.current) return;
      if (!sessionEnded(err)) setIssue('conversations', 'Your conversations could not be refreshed. Try again from Home.');
    }
  }, [patch, sessionEnded, setIssue]);

  const applyCategories = useCallback((cats: ApiResidentCategories) => {
    const f = new Map<number, CategoryId>();
    const ids = new Map<CategoryId, number>();
    for (const c of cats.categories) if (c.category_id !== null) { f.set(c.category_id, c.id as CategoryId); ids.set(c.id as CategoryId, c.category_id); }
    // A report keeps the category it was filed under, so an older report is Injured, Aggressive, Roaming Animal...: the server says what kind each is.
    for (const s of cats.stored_categories ?? []) if (!f.has(s.category_id)) f.set(s.category_id, s.family as CategoryId);
    families.current = f;
    categoryIds.current = ids;
  }, []);

  /** What the server said, outside the load (a report about to be sent asked again): the ids to file under and what is accepted. */
  const categoriesRead = useCallback((cats: ApiResidentCategories) => {
    applyCategories(cats);
    patch((s) => ({ ...s, accepting: ad.acceptingFrom(cats) }));
  }, [applyCategories, patch]);

  const applyClaims = useCallback((list: ApiResidentClaim[]): Claim[] => {
    claimsByReport.current = new Map(list.filter((c) => c.status !== 'withdrawn').map((c) => [c.report_id, String(c.claim_id)]));
    return list.map(ad.claimFromApi).filter((c): c is Claim => c !== null);
  }, []);

  // ------------------------------------------------------------------------------------------------ the first load
  const loadAll = useCallback(async (silent: boolean) => {
    const token = ++loadToken.current;           // (the 'loading' state is set by reload(); the first load starts in it)
    const conversationTurn = ++conversationToken.current;
    const [me, reports, active, mine, anns, claims, pets, notifs, prefs, cats, coverage, landmarks, owns, conversations] = await Promise.allSettled([
      residentApi.user(userId), residentApi.myReports(), residentApi.communitySummary(), residentApi.alertsMine(), residentApi.announcements(userId), residentApi.claims(),
      residentApi.pets(), residentApi.notifications(), residentApi.preferences(), residentApi.categories(), residentApi.coverage(),
      subdivisionId === null ? Promise.resolve([]) : residentApi.landmarks(subdivisionId), residentApi.ownershipRequests(), residentApi.conversations(),
    ]);
    if (token !== loadToken.current) return;
    for (const r of [me, reports, active, mine, anns, claims, pets, notifs, prefs, cats, coverage, landmarks, owns, conversations]) if (r.status === 'rejected' && sessionEnded(r.reason)) return;

    // "My reports" is the heart of the app: without it there is nothing to show, and nothing is invented in its place.
    if (reports.status === 'rejected') {
      if (!silent) { setLoadError(errorMessage(reports.reason)); setStatus('error'); } else setIssue('reports', `Your reports could not be refreshed. ${errorMessage(reports.reason)}`);
      return;
    }

    const problems: LoadIssue[] = [];
    const part = <T,>(section: string, label: string, r: PromiseSettledResult<T>): T | null => {
      if (r.status === 'fulfilled') return r.value;
      problems.push({ section, message: `${label} could not be loaded. ${errorMessage(r.reason)}` });
      return null;
    };

    const categories = part('categories', 'The kinds of report', cats);
    if (categories) applyCategories(categories);
    const claimList = part('claims', 'Your ownership claims', claims);
    const claimsState = claimList ? applyClaims(claimList) : null;

    // The reporting area and the landmarks are the server's own; when they cannot be read the screen does not guess (the server still checks every report).
    const cov = part('area', 'The reporting area', coverage);
    const marks = part('area', 'The landmarks', landmarks);
    const info: CoverageAreaInfo | null = cov ? { id: 0, subdivision_id: subdivisionId ?? 0, center_label: cov.center_label, center_latitude: cov.center_latitude, center_longitude: cov.center_longitude, radius_meters: cov.radius_meters, boundary_polygon: cov.boundary_polygon, is_active: cov.is_active } : null;
    const marked: Landmark[] = (marks ?? []).filter((l) => !l.is_holding_facility).map((l) => ({ id: l.landmark_id, name: l.name, lat: l.latitude, lng: l.longitude }));
    setLiveGeography({ coverage: info ?? { id: 0, subdivision_id: subdivisionId ?? 0, center_label: '', center_latitude: 14.801042, center_longitude: 121.003648, radius_meters: UNKNOWN_RADIUS_M, boundary_polygon: [], is_active: true }, landmarks: marked });

    const alertList = part('notices', 'Lost-pet and found-animal notices', active);
    const mineList = part('notices', 'Your notices', mine);
    const annList = part('advisories', 'Safety advisories', anns);
    alertsByReport.current = new Map((mineList?.results ?? []).map((a) => [a.report_id, a]));

    refs.current = new Map(reports.value.items.map((r) => [r.report_id, caseRef(r.report_id, fromServer(r.created_at))]));
    mineReports.current = new Set(reports.value.items.map((r) => r.report_id));
    const lk = lookup();
    const prev = new Map(stateRef.current.reports.map((r) => [r.id, r]));
    const reportList: Report[] = reports.value.items.map((r) => {
      const fresh = ad.reportFromApi(r, lk, { alert: alertsByReport.current.get(r.report_id), me: userId });
      // A report that is open on screen keeps its full record (its case chat) until its own refresh lands, so nothing blanks mid-read.
      return opened.current.has(fresh.id) && prev.has(fresh.id) ? { ...fresh, updates: prev.get(fresh.id)?.updates ?? fresh.updates } : fresh;
    });
    if (reports.value.truncated) problems.push({ section: 'reports', message: `Only your ${reportList.length} newest reports are shown here.` });

    const alerts = new Map<number, ApiResidentAlert>();
    for (const a of [...(mineList?.results ?? []), ...(alertList?.lost.results ?? []), ...(alertList?.found.results ?? [])]) alerts.set(a.alert_id, a);
    const notices: Notice[] = [
      ...[...alerts.values()].map((a) => ad.noticeFromAlert(a, lk, mineReports.current)),
      ...(annList ?? []).filter((a) => ad.ADVISORY_CATEGORIES.has(a.category)).map(ad.noticeFromAnnouncement),
    ];
    const petList = part('pets', 'Your pets', pets);
    const ownList = part('pets', 'The pets your subdivision office linked to you', owns);
    const notifList = part('notifications', 'Notifications', notifs);
    const prefList = part('settings', 'Your notification settings', prefs);
    const meUser = part('profile', 'Your profile', me);
    const conversationList = part('conversations', 'Your conversations', conversations);

    const seen = new Set<string>();
    setIssues(problems.filter((p) => (seen.has(p.section + p.message) ? false : (seen.add(p.section + p.message), true))));

    patch((s) => ({
      ...s,
      profile: meUser ? ad.profileFromUser(meUser) : s.profile,
      office: categories ? ad.officeFrom(categories) : s.office,
      subdivisionName: categories ? categories.subdivision.name : s.subdivisionName,
      publication: categories ? categories.publication : s.publication,
      accepting: categories ? ad.acceptingFrom(categories) : s.accepting,
      reports: reportList,
      notices: mineList || alertList || annList ? notices.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)) : s.notices,
      community: alertList ? { lostTotal: alertList.lost.total, foundTotal: alertList.found.total } : s.community,
      claims: claimsState ?? s.claims,
      pets: petList ? petList.map(ad.petFromApi) : s.pets,
      ownershipRequests: ownList ? ownList.map(ad.ownershipRequestFromApi) : s.ownershipRequests,
      notifications: notifList ? notifList.map((n) => ad.notificationFromApi(n, lk)).sort((a, b) => b.at.localeCompare(a.at)) : s.notifications,
      conversations: conversationList && conversationTurn === conversationToken.current ? conversationList.map(ad.conversationFromApi) : s.conversations,
      settings: prefList ? ad.settingsFrom(prefList) : s.settings,
    }));
    lastLoadAt.current = Date.now();
    setStatus('ready');
  }, [applyCategories, applyClaims, lookup, patch, sessionEnded, setIssue, subdivisionId, userId]);

  useEffect(() => { void loadAll(false); }, [loadAll]);

  // ------------------------------------------------------------------------------------------ one report, in full
  const loadReport = useCallback(async (id: string) => {
    const n = reportIdOf(id);
    if (n === null) { setReportDetails((d) => ({ ...d, [id]: { status: 'error', error: 'That report could not be found.' } })); return; }
    setReportDetails((d) => (d[id]?.status === 'ready' ? d : { ...d, [id]: { status: 'loading' } }));
    const [r, chat] = await Promise.allSettled([residentApi.report(n), residentApi.chat(n)]);
    for (const x of [r, chat]) if (x.status === 'rejected' && sessionEnded(x.reason)) return;
    if (r.status === 'rejected') { setReportDetails((d) => ({ ...d, [id]: { status: 'error', error: errorMessage(r.reason) } })); return; }
    const ref = caseRef(n, r.value.created_at);
    refs.current.set(n, ref);
    mineReports.current.add(n);
    const lk = lookup();
    const full = ad.reportFromApi(r.value, lk, { alert: alertsByReport.current.get(n), chat: chat.status === 'fulfilled' ? chat.value : [], me: userId });
    patch((s) => ({ ...s, reports: s.reports.some((x) => x.id === ref) ? s.reports.map((x) => (x.id === ref ? full : x)) : [full, ...s.reports] }));
    opened.current.add(ref);
    const detail: Detail = chat.status === 'rejected' ? { status: 'ready', error: 'The messages on this report could not be loaded. What is shown may be incomplete.' } : { status: 'ready' };
    setReportDetails((d) => ({ ...d, [id]: detail, [ref]: detail }));
  }, [lookup, patch, sessionEnded, userId]);

  const reportStatus = useCallback((id: string): Detail => reportDetails[id] ?? { status: 'idle' }, [reportDetails]);

  // ------------------------------------------------------------------------------------------ one notice, in full
  const loadNotice = useCallback(async (id: string) => {
    const ref = ad.noticeRef(id);
    if (!ref || ref.kind !== 'alert') { setNoticeDetails((d) => ({ ...d, [id]: { status: 'ready' } })); return; }     // an advisory has nothing more to read
    setNoticeDetails((d) => (d[id]?.status === 'ready' ? d : { ...d, [id]: { status: 'loading' } }));
    try {
      const a = await residentApi.alert(ref.id);
      const full = ad.noticeFromAlert(a, lookup(), mineReports.current);
      patch((s) => ({ ...s, notices: s.notices.some((n) => n.id === full.id) ? s.notices.map((n) => (n.id === full.id ? full : n)) : [full, ...s.notices] }));
      readNotices.current.add(id);
      setNoticeDetails((d) => ({ ...d, [id]: { status: 'ready' } }));
    } catch (err) {
      if (sessionEnded(err)) return;
      setNoticeDetails((d) => ({ ...d, [id]: { status: 'error', error: errorMessage(err) } }));
    }
  }, [lookup, patch, sessionEnded]);

  const noticeStatus = useCallback((id: string): Detail => noticeDetails[id] ?? { status: 'idle' }, [noticeDetails]);

  // ------------------------------------------------------------------------------------ the Community, a page at a time
  /**
   * One page of the directory, searched and filtered by the server. The notices are kept in the app's own list as well, so opening one finds it
   * already read; a notice that is already there (perhaps read in full, with its sightings) is kept as it is.
   */
  const loadCommunityPage = useCallback(async (query: CommunityQuery) => {
    let page;
    try { page = await residentApi.communityPage(query); } catch (err) { sessionEnded(err); throw err; }       // the directory shows its own retry
    const lk = lookup();
    const notices = page.results.map((a) => ad.noticeFromAlert(a, lk, mineReports.current));
    patch((s) => {
      const have = new Map(s.notices.map((n) => [n.id, n]));
      for (const n of notices) if (!have.has(n.id)) have.set(n.id, n);
      return { ...s, notices: [...have.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)) };
    });
    return { notices, total: page.total };
  }, [lookup, patch, sessionEnded]);

  // ----------------------------------------------------------------------------------------- the smaller re-reads
  const refreshNotices = useCallback(async () => {
    const [active, mine, anns] = await Promise.allSettled([residentApi.communitySummary(), residentApi.alertsMine(), residentApi.announcements(userId)]);
    for (const x of [active, mine, anns]) if (x.status === 'rejected' && sessionEnded(x.reason)) return;
    if (mine.status === 'fulfilled') alertsByReport.current = new Map(mine.value.results.map((a) => [a.report_id, a]));
    const lk = lookup();
    patch((s) => {
      const keep = (type: Notice['type']) => s.notices.filter((n) => (type === 'safety_advisory' ? n.type === 'safety_advisory' : n.type !== 'safety_advisory'));
      const alerts = new Map<number, ApiResidentAlert>();
      for (const a of [...(mine.status === 'fulfilled' ? mine.value.results : []), ...(active.status === 'fulfilled' ? [...active.value.lost.results, ...active.value.found.results] : [])]) alerts.set(a.alert_id, a);
      const fromAlerts = active.status === 'fulfilled' || mine.status === 'fulfilled' ? [...alerts.values()].map((a) => ad.noticeFromAlert(a, lk, mineReports.current)) : keep('lost_pet');
      const fromAnns = anns.status === 'fulfilled' ? anns.value.filter((a) => ad.ADVISORY_CATEGORIES.has(a.category)).map(ad.noticeFromAnnouncement) : keep('safety_advisory');
      return {
        ...s, notices: [...fromAlerts, ...fromAnns].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)),
        community: active.status === 'fulfilled' ? { lostTotal: active.value.lost.total, foundTotal: active.value.found.total } : s.community,
      };
    });
    setIssue('notices', [active, mine, anns].some((x) => x.status === 'rejected') ? 'The notices could not be refreshed after your change. Reload to see their latest state.' : null);
    // The lists hold each notice without its sightings and conversations: the ones this person had open are read in full again, so a change to one
    // (agreeing to message, asking the Leader to help, a sighting) shows on the screen they are looking at, not only after they leave it.
    await Promise.all([...readNotices.current].map((id) => loadNotice(id)));
  }, [loadNotice, lookup, patch, sessionEnded, setIssue, userId]);

  const refreshClaims = useCallback(async () => {
    try {
      const list = await residentApi.claims();
      const claims = applyClaims(list);
      patch((s) => ({ ...s, claims }));
    } catch (err) { if (!sessionEnded(err)) setIssue('claims', 'Your claims could not be refreshed after your change. Reload to see them.'); }
  }, [applyClaims, patch, sessionEnded, setIssue]);

  const refreshPets = useCallback(async () => {
    try { const list = await residentApi.pets(); patch((s) => ({ ...s, pets: list.map(ad.petFromApi) })); }
    catch (err) { if (!sessionEnded(err)) setIssue('pets', 'Your pets could not be refreshed after your change. Reload to see them.'); }
  }, [patch, sessionEnded, setIssue]);

  const refreshOwnership = useCallback(async () => {
    try { const list = await residentApi.ownershipRequests(); patch((s) => ({ ...s, ownershipRequests: list.map(ad.ownershipRequestFromApi) })); }
    catch (err) { if (!sessionEnded(err)) setIssue('pets', 'Your pet requests could not be refreshed after your change. Reload to see them.'); }
  }, [patch, sessionEnded, setIssue]);

  const refreshProfileAndSettings = useCallback(async () => {
    const [me, prefs] = await Promise.allSettled([residentApi.user(userId), residentApi.preferences()]);
    for (const x of [me, prefs]) if (x.status === 'rejected' && sessionEnded(x.reason)) return;
    patch((s) => ({ ...s, profile: me.status === 'fulfilled' ? ad.profileFromUser(me.value) : s.profile, settings: prefs.status === 'fulfilled' ? ad.settingsFrom(prefs.value) : s.settings }));
    setIssue('profile', me.status === 'rejected' || prefs.status === 'rejected' ? 'Your changes were saved, but could not be read back. Reload to see them.' : null);
  }, [patch, sessionEnded, setIssue, userId]);

  const refreshNotifications = useCallback(async () => {
    try {
      const list = await residentApi.notifications();
      const lk = lookup();
      const known = new Set(stateRef.current.notifications.map((n) => n.id));
      const changedLostPet = list.filter((n) => !known.has(String(n.notification_id)) && (n.type ?? '').startsWith('lost_pet_'));
      const changedConversation = list.some((n) => !known.has(String(n.notification_id)) && ['case_message', 'lost_found_bridge', 'lost_found_unlinked'].includes(n.type ?? ''));
      patch((s) => ({ ...s, notifications: list.map((n) => ad.notificationFromApi(n, lk)).sort((a, b) => b.at.localeCompare(a.at)) }));
      if (changedLostPet.length) {
        await refreshNotices();
        await Promise.all([...opened.current].slice(-3).map((id) => loadReport(id)));
        if (changedLostPet.some((n) => n.type === 'lost_pet_recovered' || /recovered/i.test(n.title))) await refreshPets();
      }
      if (changedConversation) await refreshConversations();
    } catch (err) { sessionEnded(err); }                // a missed poll is not worth a message; the next one tries again
  }, [loadReport, lookup, patch, refreshConversations, refreshNotices, refreshPets, sessionEnded]);

  // ------------------------------------------------------------------------------------------------------- actions
  const dispatch = useCallback(async (action: ResidentAction): Promise<ActionOutcome | void> => {
    const ctx: ResidentActionContext = { userId, state: () => stateRef.current, categoryIdOf: (family) => categoryIds.current.get(family) ?? null, categoriesRead };
    let result;
    try {
      result = await runAction(action, ctx);
    } catch (err) {
      sessionEnded(err);
      // A refused report (a kind switched off, a pet that already has one) may mean what is on screen is out of date: read it again quietly
      if (action.type === 'report/submit') void loadAll(true);
      throw err instanceof AdminApiError ? err : new AdminApiError('server');
    }
    // The change is recorded. Read back what it touched; a failure here must not make the saved change look failed.
    const refs_ = unique(result.reportNumbers.map(refOf));
    if (result.created) {
      const ref = caseRef(result.created.number, result.created.createdAt);
      refs.current.set(result.created.number, ref);
      mineReports.current.add(result.created.number);
      rawDispatch({ type: 'draft/clear', now: new Date().toISOString() });
    }
    await Promise.all([
      ...(result.created ? [loadReport(caseRef(result.created.number, result.created.createdAt))] : refs_.map((r) => loadReport(r))),
      result.notices ? refreshNotices() : undefined,
      result.claims ? refreshClaims() : undefined,
      result.pets ? refreshPets() : undefined,
      result.ownership ? refreshOwnership() : undefined,
      result.profile || result.settings ? refreshProfileAndSettings() : undefined,
    ]);
    if (result.warnings?.length) setIssue('after-save', `${result.warnings.join(' ')} What you sent is kept.`);
    return { ...(result.created ? { reportRef: caseRef(result.created.number, result.created.createdAt) } : {}), ...(result.petId ? { petId: result.petId } : {}) };
  }, [categoriesRead, loadAll, loadReport, refOf, refreshClaims, refreshNotices, refreshOwnership, refreshPets, refreshProfileAndSettings, sessionEnded, setIssue, userId]);

  /** Drafts and read marks are applied here at once. A read mark is also told to the server; if that is missed, the next read corrects it. */
  const local = useCallback((action: ResidentAction) => {
    rawDispatch({ ...action, now: new Date().toISOString() });
    if (action.type === 'notification/read') { const n = Number(action.id); if (Number.isInteger(n)) void residentApi.markRead(n).catch((err: unknown) => { sessionEnded(err); }); }
    if (action.type === 'notification/readAll') void residentApi.markAllRead(userId).catch((err: unknown) => { sessionEnded(err); });
  }, [sessionEnded, userId]);

  const reload = useCallback(() => {
    setStatus('loading');
    setLoadError(undefined);
    void loadAll(false).then(() => Promise.all([...opened.current].slice(-3).map((r) => loadReport(r))));
  }, [loadAll, loadReport]);

  // ------------------------------------------------------------------------------------------ staying up to date
  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void refreshNotifications(); }, NOTIFICATION_POLL_MS);
    const conversationTimer = setInterval(() => { if (document.visibilityState === 'visible') void refreshConversations(); }, CONVERSATION_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      void refreshConversations();
      if (Date.now() - lastLoadAt.current < REFRESH_AFTER_MS) return;
      void loadAll(true).then(() => Promise.all([...opened.current].slice(-3).map((r) => loadReport(r))));
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => { clearInterval(timer); clearInterval(conversationTimer); document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('focus', onVisible); };
  }, [loadAll, loadReport, refreshConversations, refreshNotifications]);

  const value = useMemo(() => ({
    state, status, loadError, issues, dispatch, local, reload, loadReport, reportStatus, loadNotice, noticeStatus, loadCommunityPage, refreshConversations, capabilities: LIVE_CAPABILITIES,
  }), [state, status, loadError, issues, dispatch, local, reload, loadReport, reportStatus, loadNotice, noticeStatus, loadCommunityPage, refreshConversations]);

  return <ResidentDataContext.Provider value={value}>{children}</ResidentDataContext.Provider>;
}

export function LiveResidentDataProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  // Re-mount when the account changes so one resident never sees another's data.
  return session ? <Loaded key={session.userId} session={session}>{children}</Loaded> : null;
}
