/**
 * PREVIEW data layer: a reducer over sample data, kept in sessionStorage so a reload in the same tab keeps your work.
 * Nothing leaves the browser. The shell shows a permanent "sample data" bar so it can never be mistaken for real data.
 *
 * To connect the real API, keep this contract (state + async dispatch + load status): load into `state` from the API and
 * make `dispatch` send one request per action before applying it.
 */
import { useCallback, useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import { AdminApiError } from '../../preview/lib/errors';
import { getPreviewFlags, setPreviewFlags, sleep } from '../../preview/lib/previewFlags';
import { useAuth } from '../auth/context';
import type { ResidentSession } from '../auth/gateway';
import { DATA_KEY, DATA_VERSION, LOADED_KEY } from '../config';
import { ResidentDataContext, type LoadStatus } from './context';
import { reducer, type ResidentAction } from './reducer';
import { SAMPLE_ACCOUNT, buildSeed } from './seed';
import type { Media, ResidentState } from './types';

const seedFor = (session: ResidentSession): ResidentState => buildSeed(new Date(), session.userId === SAMPLE_ACCOUNT.id ? 'sample' : 'new', session.profile);

function loadInitial(session: ResidentSession): ResidentState {
  try {
    const raw = sessionStorage.getItem(DATA_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as { version: number; state: ResidentState };
      // Data belongs to one account: signing in as someone else starts from that account's own data.
      if (saved.version === DATA_VERSION && saved.state?.profile?.id === session.userId) return saved.state;
    }
  } catch { /* corrupt or unavailable storage: start from the sample data */ }
  return seedFor(session);
}

const firstLoadDone = () => { try { return sessionStorage.getItem(LOADED_KEY) === '1'; } catch { return false; } };

// Object URLs for photos and videos die with the page, so they are dropped before saving.
const bare = (m: Media): Media => ({ id: m.id, name: m.name, kind: m.kind, size: m.size });
const persistable = (s: ResidentState): ResidentState => ({
  ...s,
  reports: s.reports.map((r) => ({ ...r, media: r.media.map(bare) })),
  pets: s.pets.map((p) => ({ ...p, photoUrl: undefined })),
  draft: s.draft ? { ...s.draft, media: s.draft.media.map(bare) } : null,
});

function Loaded({ session, children }: { session: ResidentSession; children: ReactNode }) {
  const { expireSession } = useAuth();
  const [state, rawDispatch] = useReducer(reducer, session, loadInitial);
  const [status, setStatus] = useState<LoadStatus>(() => (firstLoadDone() ? 'ready' : 'loading'));
  const live = useRef({ expire: expireSession, session });
  useEffect(() => { live.current = { expire: expireSession, session }; });

  // Simulated first load, so the loading state is real and the offline switch can produce the error state.
  useEffect(() => {
    if (status !== 'loading') return undefined;
    const timer = setTimeout(() => {
      const failed = getPreviewFlags().offline;
      if (!failed) { try { sessionStorage.setItem(LOADED_KEY, '1'); } catch { /* ignore */ } }
      setStatus(failed ? 'error' : 'ready');
    }, 600);
    return () => clearTimeout(timer);
  }, [status]);

  useEffect(() => {
    try { sessionStorage.setItem(DATA_KEY, JSON.stringify({ version: DATA_VERSION, state: persistable(state) })); } catch { /* quota or private mode */ }
  }, [state]);

  const dispatch = useCallback(async (action: ResidentAction) => {
    await sleep(240 + Math.round(Math.random() * 160));
    const f = getPreviewFlags();
    if (f.offline) throw new AdminApiError('network');
    if (f.failNext) { setPreviewFlags({ failNext: false }); throw new AdminApiError('server'); }
    rawDispatch({ ...action, now: new Date().toISOString() });
  }, []);

  const local = useCallback((action: ResidentAction) => rawDispatch({ ...action, now: new Date().toISOString() }), []);

  const reload = useCallback(() => setStatus('loading'), []);
  const resetSample = useCallback(() => {
    setPreviewFlags({ offline: false, failNext: false });
    rawDispatch({ type: 'preview/replace', state: seedFor(live.current.session), now: new Date().toISOString() });
  }, []);

  return <ResidentDataContext.Provider value={{ state, status, dispatch, local, reload, resetSample }}>{children}</ResidentDataContext.Provider>;
}

export function ResidentDataProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  // Re-mount when the account changes so one resident never sees another's state.
  return session ? <Loaded key={session.userId} session={session}>{children}</Loaded> : null;
}
