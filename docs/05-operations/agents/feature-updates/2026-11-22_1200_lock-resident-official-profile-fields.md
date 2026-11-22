# Lock Resident Official Profile Fields (Name, Email, Address)

- **Date:** `2026-11-22 12:00 (UTC)`
- **AI tool:** `Antigravity (Gemini)`
- **Files changed:** `backend/app/routes/users.py`, `backend/tests/test_account_self_edit.py`, `frontend/src/resident/pages/account/EditProfilePage.tsx`, `frontend/src/resident/pages/account/ProfilePage.tsx`, `frontend/src/resident/live/actions.ts`, `docs/05-operations/agents/feature-updates/2026-11-22_1200_lock-resident-official-profile-fields.md`
- **Authorization:** User request ("bawal dapat machange ng user" — lock Full name, Email, and Address while allowing Mobile number to be edited)
- **Type:** `Fix`

## Summary

- Restricted `PUT /users/{user_id}` in `backend/app/routes/users.py` so residents (`role_id == 1`) editing their own account (`is_self`) can only modify `phone`, `latitude`, and `longitude` (`RESIDENT_SELF_EDITABLE_FIELDS`), returning `403 Forbidden` with `"Ask your Subdivision Leader"` if `name`, `email`, or `address` changes are submitted.
- Updated `frontend/src/resident/pages/account/EditProfilePage.tsx`, `ProfilePage.tsx`, and `frontend/src/resident/live/actions.ts` so `Full name`, `Email`, `Block and lot`, and `Street` are read-only/disabled with `"Managed by your Subdivision Leader."` hints, while `Mobile number` remains editable.
- Updated `backend/tests/test_account_self_edit.py` to cover the resident `name`, `email`, and `address` self-edit restrictions.
