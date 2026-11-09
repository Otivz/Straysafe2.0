/**
 * Subdivision Admin UI — development preview.
 *
 * This module is a self-contained, mock-data reconstruction of the Subdivision Admin interface. It does not call the
 * backend and it does not share state, providers or routes with the legacy portals (/admin, /subd, ...), which stay
 * untouched and fully wired to the API.
 *
 * It is DEV-ONLY: src/main.tsx mounts it behind `import.meta.env.DEV`, which is `false` in production builds, so the
 * route is not registered and this whole folder (sample sign-in, mock data) is not emitted into the bundle. There is
 * deliberately no production switch for it.
 *
 * To make this the real admin later: connect auth/gateway.ts and data/DataProvider.tsx to the API, then change
 * ADMIN_BASE and the guard in main.tsx (and the legacy routes in routes/AppRoutes.tsx) in one go.
 */
export const ADMIN_BASE = '/admin-preview';

/** Builds an absolute URL inside the admin UI, e.g. adminPath('/cases/SS-2026-0158'). */
export const adminPath = (path = ''): string => `${ADMIN_BASE}${path}`;

/** Storage keys. Separate from the legacy `admin_user` / `staff_user` keys so the two never interfere. */
export const SESSION_KEY = 'straysafe_admin_ui_session';
export const DATA_KEY = 'straysafe_admin_ui_preview_data';
/** Bump when the shape of the sample data changes so a stale tab reseeds instead of crashing. */
export const DATA_VERSION = 2;
