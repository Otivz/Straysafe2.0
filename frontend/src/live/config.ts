/**
 * StraySafe 2.0 has two interfaces, both on the real backend and both role-guarded:
 *   - the Resident app            /resident-app   residents (role 1); also the only interface of the Android app;
 *   - the Subdivision Leader app  /subd-admin     Subdivision Leaders (role 2); on the web only.
 * src/main.tsx mounts them and sends the addresses of the retired portals to them.
 *
 * The base paths start with the same prefixes the earlier portals used (`/subd`, `/resident`) on purpose: the shared API client
 * (utils/api.ts) chooses the stored session from the path, so a Subdivision Leader's token (`staff_user`) and a resident's token
 * (`resident_user`) are found without changing it.
 */
export const ADMIN_LIVE_BASE = '/subd-admin';
export const RESIDENT_LIVE_BASE = '/resident-app';

/** Role ids the backend uses (users.role_id). */
export const ROLE_RESIDENT = 1;
export const ROLE_LEADER = 2;
export const ROLE_ADMINISTRATOR = 4;
