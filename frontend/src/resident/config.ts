/**
 * Resident mobile UI: the real API, role-guarded (residents). It is mounted by src/main.tsx at RESIDENT_LIVE_BASE (see
 * src/live/config.ts) and is the only interface of the Android app (docs/05-operations/ANDROID_RESIDENT_APP.md).
 */
import { RESIDENT_LIVE_BASE } from '../live/config';

/** The base path of the Resident UI. */
export const residentBase = (): string => RESIDENT_LIVE_BASE;

/** Absolute URL inside the resident UI, e.g. residentPath('/reports/SS-2026-0161'). */
export const residentPath = (path = ''): string => `${RESIDENT_LIVE_BASE}${path}`;
