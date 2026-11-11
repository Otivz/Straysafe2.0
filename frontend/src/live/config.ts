/**
 * StraySafe 2.0 has two interfaces, both on the real backend and both role-guarded:
 *   - the Subdivision Leader app  / (default base URL)  Subdivision Leaders (role 2); on the web only;
 *   - the Resident app            /resident-app        residents (role 1); also the only interface of the Android app.
 * src/main.tsx mounts them and sends the addresses of the retired portals to them.
 */
export const ADMIN_LIVE_BASE = '';
export const RESIDENT_LIVE_BASE = '/resident-app';

/** Role ids the backend uses (users.role_id). */
export const ROLE_RESIDENT = 1;
export const ROLE_LEADER = 2;
export const ROLE_ADMINISTRATOR = 4;
