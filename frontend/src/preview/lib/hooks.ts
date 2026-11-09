import { useEffect, useLayoutEffect, useState } from 'react';

/** The current time, refreshed every minute so "overdue" and "2 h ago" stay honest without a page reload. */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/**
 * Warns before the tab is closed or reloaded while a form has unsaved changes.
 * A layout effect, so the warning is removed synchronously when the form unmounts (e.g. right after saving and
 * navigating away) instead of lingering until React's deferred cleanup.
 */
export function useBeforeUnload(active: boolean): void {
  useLayoutEffect(() => {
    if (!active) return undefined;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [active]);
}
