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
  useEffect(() => { if (noticeId) void load.current(noticeId); }, [noticeId]);
  return { ...noticeStatus(noticeId ?? ''), retry: () => { if (noticeId) void loadNotice(noticeId); } };
}
