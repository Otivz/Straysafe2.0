import { useEffect, useRef } from 'react';
import { useResidentData } from '../data/context';

/**
 * Reads a notice in full (its sightings) when a screen that shows them is opened. The list holds each notice without its
 * sightings, so a screen waits for this before it says "none yet".
 */
export function useLoadNotice(noticeId: string | undefined) {
  const { loadNotice, noticeStatus } = useResidentData();
  const load = useRef(loadNotice);
  useEffect(() => { load.current = loadNotice; });
  useEffect(() => {
    if (!noticeId) return undefined;
    void load.current(noticeId);
    // Another device can change consent, mediation or recovery while this screen is open.
    const refresh = () => { if (document.visibilityState === 'visible') void load.current(noticeId); };
    const timer = setInterval(refresh, 15_000);
    document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [noticeId]);
  return { ...noticeStatus(noticeId ?? ''), retry: () => { if (noticeId) void loadNotice(noticeId); } };
}
