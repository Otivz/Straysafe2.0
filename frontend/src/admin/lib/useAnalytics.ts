import { useCallback, useEffect, useMemo, useState } from 'react';
import { errorMessage } from '../../preview/lib/errors';
import { useAdminData } from '../data/context';
import { analytics, type Analytics, type DateRange } from '../data/selectors';

export type AnalyticsResult =
  | { status: 'loading'; data: Analytics; before: Analytics; retry: () => void }
  | { status: 'error'; error: string; data: Analytics; before: Analytics; retry: () => void }
  | { status: 'ready'; data: Analytics; before: Analytics; retry: () => void };

/**
 * The numbers for a period and for the period before it (to compare). They come from the server (GET /analytics/subdivision), which counts every case, referral and
 * closure itself, so the page never has to load every case to be right. While they load or fail, `data` is an empty period:
 * it is never the previous answer dressed up as the new one.
 */
export function useAnalytics(range: DateRange, previous: DateRange): AnalyticsResult {
  const { state, fetchAnalytics } = useAdminData();
  const from = range.from.getTime(), to = range.to.getTime(), pFrom = previous.from.getTime(), pTo = previous.to.getTime();
  const key = `${from}:${to}`;
  const [attempt, setAttempt] = useState(0);
  const [remote, setRemote] = useState<{ key: string; data: Analytics; before: Analytics } | { key: string; error: string } | null>(null);

  const empty = useMemo(() => analytics([], { from: new Date(from), to: new Date(to) }), [from, to]);
  const local = useMemo(
    () => (fetchAnalytics ? null : { data: analytics(state.cases, { from: new Date(from), to: new Date(to) }), before: analytics(state.cases, { from: new Date(pFrom), to: new Date(pTo) }) }),
    [fetchAnalytics, state.cases, from, to, pFrom, pTo],
  );

  useEffect(() => {
    if (!fetchAnalytics) return undefined;
    let cancelled = false;
    Promise.all([fetchAnalytics({ from: new Date(from), to: new Date(to) }), fetchAnalytics({ from: new Date(pFrom), to: new Date(pTo) })])
      .then(([data, before]) => { if (!cancelled) setRemote({ key, data, before }); })
      .catch((err: unknown) => { if (!cancelled) setRemote({ key, error: errorMessage(err) }); });
    return () => { cancelled = true; };
  }, [fetchAnalytics, key, from, to, pFrom, pTo, attempt]);

  const retry = useCallback(() => { setRemote(null); setAttempt((n) => n + 1); }, []);

  if (local) return { status: 'ready', ...local, retry };
  if (!remote || remote.key !== key) return { status: 'loading', data: empty, before: empty, retry };
  if ('error' in remote) return { status: 'error', error: remote.error, data: empty, before: empty, retry };
  return { status: 'ready', data: remote.data, before: remote.before, retry };
}
