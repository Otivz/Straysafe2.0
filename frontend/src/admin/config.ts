/**
 * Subdivision Leader UI: the real API, role-guarded (Subdivision Leader, role 2). It is mounted by src/main.tsx at ADMIN_LIVE_BASE
 * (see src/live/config.ts) and is not part of the Android app.
 */
import { ADMIN_LIVE_BASE } from '../live/config';

/** Builds an absolute URL inside the admin UI, e.g. adminPath('/cases/SS-2026-0158'). */
export const adminPath = (path = ''): string => `${ADMIN_LIVE_BASE}${path}`;
