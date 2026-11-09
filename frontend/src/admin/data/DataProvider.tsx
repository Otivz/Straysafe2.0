/**
 * PREVIEW data layer: a reducer over sample data, kept in sessionStorage so a reload in the same tab keeps your work.
 * Nothing leaves the browser. It is clearly a mock: the shell shows a permanent "sample data" banner.
 *
 * To connect the real API, keep this component's contract (state + async dispatch + load status) and replace the body:
 * load into `state` from the API, and make `dispatch` send one request per action before applying it.
 */
import { useCallback, useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import { DATA_KEY, DATA_VERSION } from '../config';
import { useAuth } from '../auth/context';
import { AdminApiError } from '../../preview/lib/errors';
import { getPreviewFlags, setPreviewFlags, sleep } from '../../preview/lib/previewFlags';
import { AdminDataContext, type LoadStatus } from './context';
import { reducer, type AdminAction } from './reducer';
import { buildSeed } from './seed';
import type { AdminState } from './types';

const LOADED_KEY = 'straysafe_admin_ui_loaded';

function loadInitial(): AdminState {
  try {
    const raw = sessionStorage.getItem(DATA_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as { version: number; state: AdminState };
      if (saved.version === DATA_VERSION && saved.state?.cases) return saved.state;
    }
  } catch { /* corrupt or unavailable storage: start from the sample data */ }
  return buildSeed(new Date());
}

const firstLoadDone = () => { try { return sessionStorage.getItem(LOADED_KEY) === '1'; } catch { return false; } };

export function AdminDataProvider({ children }: { children: ReactNode }) {
  const { expireSession } = useAuth();
  const [state, rawDispatch] = useReducer(reducer, undefined, loadInitial);
  const [status, setStatus] = useState<LoadStatus>(() => (firstLoadDone() ? 'ready' : 'loading'));

  const live = useRef({ actor: state.admin.name, expire: expireSession });
  useEffect(() => { live.current = { actor: state.admin.name, expire: expireSession }; });

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

  // Keep the preview data across reloads of this tab. Object URLs for notice photos die with the page, so drop them.
  useEffect(() => {
    try {
      const clean: AdminState = { ...state, notices: state.notices.map((n) => ({ ...n, media: n.media.map(({ id, name }) => ({ id, name })) })) };
      sessionStorage.setItem(DATA_KEY, JSON.stringify({ version: DATA_VERSION, state: clean }));
    } catch { /* quota or private mode: the preview still works, it just will not survive a reload */ }
  }, [state]);

  const dispatch = useCallback(async (action: AdminAction) => {
    await sleep(240 + Math.round(Math.random() * 160));
    const f = getPreviewFlags();
    if (f.offline) throw new AdminApiError('network');
    if (f.failNext) { setPreviewFlags({ failNext: false }); throw new AdminApiError('server'); }
    rawDispatch({ ...action, now: new Date().toISOString(), actor: live.current.actor });
  }, []);

  const reload = useCallback(() => setStatus('loading'), []);

  const resetSample = useCallback(() => {
    setPreviewFlags({ offline: false, failNext: false });
    rawDispatch({ type: 'preview/replace', state: buildSeed(new Date()), now: new Date().toISOString(), actor: live.current.actor });
  }, []);

  return <AdminDataContext.Provider value={{ state, status, dispatch, reload, resetSample }}>{children}</AdminDataContext.Provider>;
}
