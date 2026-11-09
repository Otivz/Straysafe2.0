import { useSyncExternalStore } from 'react';

/**
 * Dev-only switches from the "Preview tools" menu. They exist so the failure states (network unavailable, failed save)
 * can be seen without a backend. Kept in a tiny external store because both the auth and the data layer read them.
 */
export interface PreviewFlags {
  /** Every request fails as if the network were down. */
  offline: boolean;
  /** The next change fails once, as if the server rejected it. */
  failNext: boolean;
}

let flags: PreviewFlags = { offline: false, failNext: false };
const listeners = new Set<() => void>();

export const getPreviewFlags = (): PreviewFlags => flags;

export function setPreviewFlags(patch: Partial<PreviewFlags>): void {
  flags = { ...flags, ...patch };
  listeners.forEach((notify) => notify());
}

const subscribe = (notify: () => void) => {
  listeners.add(notify);
  return () => { listeners.delete(notify); };
};

export const usePreviewFlags = (): PreviewFlags => useSyncExternalStore(subscribe, getPreviewFlags);

export const sleep = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });
