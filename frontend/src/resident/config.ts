/**
 * Resident mobile UI — development preview.
 *
 * Self-contained and mock-data only: it does not call the backend and shares no providers, routes or storage keys with
 * the legacy resident portal (/resident/*, /login) or with the Admin preview (/admin-preview/*).
 *
 * DEV-ONLY: src/main.tsx mounts it behind `import.meta.env.DEV` (written inline there), which is `false` in production
 * builds, so the route is not registered and this whole folder (sample sign-in, mock data) is not emitted. There is
 * deliberately no production switch and no authentication bypass.
 *
 * To make this the real resident app later: connect auth/gateway.ts and data/DataProvider.tsx to the API, then change
 * RESIDENT_BASE and the guard in main.tsx (and retire the legacy resident routes) in one go.
 */
export const RESIDENT_BASE = '/resident-preview';

/** Absolute URL inside the resident preview, e.g. residentPath('/reports/SS-2026-0161'). */
export const residentPath = (path = ''): string => `${RESIDENT_BASE}${path}`;

/** Storage keys, separate from the legacy `resident_user` keys and from the Admin preview's. */
export const SESSION_KEY = 'straysafe_resident_ui_session';
export const DATA_KEY = 'straysafe_resident_ui_preview_data';
export const PENDING_KEY = 'straysafe_resident_ui_pending_signup';
export const LOADED_KEY = 'straysafe_resident_ui_loaded';
/** Bump when the shape of the sample data changes so a stale tab reseeds instead of crashing. */
export const DATA_VERSION = 2;

/** The simulated verification code (R03). Preview only. */
export const PREVIEW_CODE = '123456';
