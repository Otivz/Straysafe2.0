# Official-list deactivation suspends the account (sign-in bypass fix)

- **Date:** 2026-11-22 16:45 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `backend/app/routes/resident_records.py`, `backend/tests/test_resident_applications.py`, `backend/tests/test_resident_registry.py`
- **Authorization:** Developer approval in session ("yes please") to fix the reported issue that a deactivated resident could sign in again.
- **Type:** Fix

## Intent

A separate change made `users.status = 'Inactive'` mean "approved, not signed in yet": `/auth/login` and Google sign-in now let a verified resident in that state through and `finish_login` turns them `Active`, and `Suspended` became the blocked state (refused by sign-in, tokens and refresh). The official-list Deactivate still wrote `Inactive`, so a deactivated resident could sign in and be reactivated.

## Key changes

- `POST /resident-records/{id}/deactivate` sets the resident account to `Suspended` (was `Inactive`).
- `POST /resident-records/{id}/reactivate`: an activated account becomes `Active` (unchanged); a never-activated one returns from `Suspended` to `Inactive` and stays unverified, so it remains locked until it is claimed.
- The login model of the separate change is kept as it is.

## Validation evidence

- `python tests/test_resident_applications.py`: 71 checks passed, including new sign-in checks: a deactivated resident is refused at `/auth/login` and stays `Suspended`; reactivation restores sign-in; a never-activated account returns to locked.
- `python tests/test_resident_registry.py`: 105 passed (two assertions now expect `Suspended`).
- The Residents page "suspend" action already sends `Suspended` (`frontend/src/admin/live/actions.ts`).
