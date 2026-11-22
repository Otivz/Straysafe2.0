# Feature Update: Resident Account Activation & Suspension Workflow

- **Date:** 2026-11-22 15:10 (UTC)
- **AI tool:** Antigravity
- **Files changed:**
  - `backend/app/utils/mailer.py`
  - `backend/app/utils/auth.py`
  - `backend/app/routes/auth.py`
  - `backend/app/routes/users.py`
  - `backend/app/routes/resident_applications.py`
  - `frontend/src/admin/data/types.ts`
  - `frontend/src/admin/data/constants.ts`
  - `frontend/src/admin/live/adapters.ts`
  - `frontend/src/admin/live/api.ts`
  - `frontend/src/admin/live/LiveDataProvider.tsx`
  - `frontend/src/admin/live/actions.ts`
  - `frontend/src/admin/pages/ResidentsPage.tsx`
  - `frontend/src/admin/pages/ResidentDetailsPage.tsx`
- **Authorization:** User request to implement proper account activation and suspension for subdivision administrators and residents (`Pending`, `Inactive`, `Active`, `Suspended`).
- **Type:** Feature

## Summary

- **Subdivision Account Management:** Enabled `PATCH /users/{user_id}/status` for Subdivision Leaders (scoped to residents in their own subdivision) and System Admins, plus enabled `changeResidentStatus` and **Activate account** / **Suspend account** actions in `ResidentDetailsPage.tsx` and `ResidentsPage.tsx`.
- **Suspend Notification & Email:** Suspending an account immediately sets status to `Suspended`, creates an in-app `Notification`, and sends `send_account_suspended_email`.
- **Suspended Login Restrictions:** Blocked `Suspended` accounts across password login, Google Sign-In, refresh token, and `get_pending_user` with `403`: `"Your account has been suspended. Please contact your subdivision administrator for assistance."`
- **Activation Workflow:** Approving a resident application or activating a resident who has not logged in yet sets status to `Inactive`; `finish_login` automatically transitions `Inactive` → `Active` on their first successful sign-in (and never auto-activates `Suspended` accounts).
