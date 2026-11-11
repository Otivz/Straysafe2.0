# Subdivision Leader Admin Default Base URL and Tunnel Routing

- **Date:** 2026-11-11 06:11 (UTC)
- **AI tool:** Antigravity (Gemini)
- **Files changed:** `frontend/src/live/config.ts`, `frontend/src/main.tsx`, `frontend/src/utils/api.ts`, `frontend/src/index.css`, `frontend/tests/liveInterfaces.browser.mjs`, `backend/app/routes/users.py`, `backend/app/utils/push_categories.py`, `backend/app/services/email_templates.py`, `backend/tests/test_admin_invite.py`, `backend/tests/test_manual_matching.py`, `backend/tests/test_push_notifications.py`, `setup.md`, `tunnel.md`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-11_0611_subd-admin-default-base-url.md`
- **Authorization:** User request: "now change the base URL for subdivision leader admin to dafault base url, and also in tunnel so it can access easily"
- **Type:** Feature

## Intent

Make the Subdivision Leader Admin interface accessible directly at the default base URL (`/` or root) on web and desktop, removing the need to type `/subd-admin` prefix when opening the site locally (`http://localhost:5173/`) or via Cloudflare tunnels (`https://<tunnel>.trycloudflare.com/`). The resident interface remains mounted at `/resident-app`, and Android builds continue routing exclusively to the resident interface.

## Key changes

1. **Frontend Routing & Configuration:**
   - `frontend/src/live/config.ts`: Updated `ADMIN_LIVE_BASE = ''` (was `'/subd-admin'`).
   - `frontend/src/main.tsx`:
     - Mounted `AdminLiveRoot` at `${ADMIN_LIVE_BASE}/*` (root `/*`).
     - Added `SubdAdminRedirect` component to seamlessly redirect legacy `/subd-admin/*`, `/subd/*`, and `/staff/*` paths to their respective root destinations (e.g., `/subd-admin/cases` $\rightarrow$ `/cases`).
     - Dropped `/login` redirect to resident login so `/login` directly renders the Subdivision Leader Admin sign-in screen.
     - Retained `ResidentLiveRoot` at `${RESIDENT_LIVE_BASE}/*` (`/resident-app/*`), and maintained Android build isolation (Android app excludes Leader interface and falls back to `/resident-app`).
   - `frontend/src/utils/api.ts`: Updated `getStoredToken` path prioritization to remove `path.startsWith('/login')` from the resident branch, ensuring `/login` prioritizes staff/admin tokens.
   - `frontend/src/index.css`: Updated banner comment to reflect the Leader app at `/` and Resident app at `/resident-app`.
   - `frontend/tests/liveInterfaces.browser.mjs`: Updated `ADMIN = ''`.

2. **Backend URLs & Templates:**
   - `backend/app/routes/users.py`: Updated `LOGIN_PATHS[2] = "/login"` for Subdivision Leader invites.
   - `backend/app/utils/push_categories.py`: Set `LEADER_APP = ""` so leader push notification tap targets format as `/cases/{rid}`, `/community`, `/pets`.
   - `backend/app/services/email_templates.py`: Updated `cta_url` for new report notification and unassigned reminder emails from `/subd-admin/cases/{report_id}` to `/cases/{report_id}`.
   - `backend/tests/`:
     - `test_admin_invite.py`: Updated expected invite link to `http://localhost:5173/login`.
     - `test_manual_matching.py`: Updated expected notification link to `/cases/9`.
     - `test_push_notifications.py`: Updated expected notification link to `/cases/52`.

3. **Documentation:**
   - `tunnel.md`: Updated Section 1 (Quick Reference) and Section 4 (Method B) to document accessing the Subdivision Leader Admin at the tunnel's default base URL (`https://<tunnel>.trycloudflare.com/`) and Resident app at `/resident-app`.
   - `setup.md`: Updated sign-in path descriptions for Subdivision Leaders (`/login`) and Residents (`/resident-app/login`).
   - `docs/README.md`: Indexed this change record.

## Validation evidence

- `node frontend/node_modules/typescript/bin/tsc -b frontend`: Passed with 0 errors.
- `npm --prefix frontend run build`: Vite production bundle succeeded in 2.60s (both `AdminLiveRoot` and `ResidentLiveRoot` chunks cleanly generated).
- Backend test suites:
  - `python tests/test_admin_invite.py`: 28/28 checks passed.
  - `python tests/test_push_notifications.py`: 35/35 checks passed.
  - `python tests/test_manual_matching.py`: 145/145 checks passed.

