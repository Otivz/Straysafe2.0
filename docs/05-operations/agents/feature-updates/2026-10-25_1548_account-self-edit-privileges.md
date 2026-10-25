# Account fields: no self-granted role, Head Officer status or position

- **Date:** 2026-10-25 15:48 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `backend/app/routes/users.py`, `backend/app/routes/adoptions.py`, `backend/tests/test_account_self_edit.py`, `frontend/src/pages/Barangay_Staff/BrgyProfile.tsx`, `frontend/src/pages/Barangay_Staff/BrgySettings.tsx`, `frontend/src/pages/Barangay_Staff/BrgyPersonnelManagement.tsx`, `docs/02-project/README.md`, `docs/04-testing/README.md`, `docs/05-operations/agents/feature-updates/2026-10-25_1548_account-self-edit-privileges.md`
- **Authorization:** the developer reported that barangay staff can change their own position on `/brgy/profile`, asked for the best solution, and answered "YES" to the proposed fixes 1–6 (personal details only for self-edits, positions assigned by the Head Officer or administrator, administrator-only high-impact fields, role-appropriate position lists, Head Officer flag for authority, audited position changes).
- **Type:** Fix

## Intent

`PUT /users/{id}` let a person editing their own account set every field in `UserUpdate`, including `role_id`, `is_head_officer`, `barangay_id`, `subdivision_id`, `status`, `is_verified` and `position_id`. In an isolated database, a resident made themselves an administrator and a field rescuer made themselves Head Officer and "Barangay Captain". Position 6 ("Barangay Captain") also made a user an adoption-certificate signatory.

## Key changes

- `update_user`: each changed field is checked against who is editing. Self: name, email, phone, address, map pin. Head Officer (role 3 with the flag, same barangay, staff accounts only): name, phone, address, position, active status, officer-in-charge. Administrator: everything. A refused change answers 403 naming the fields and whom to ask; unchanged values are accepted because the pages send the whole record. A new position title is created only after the change is authorized; subdivision titles can't be given to barangay staff (400). The audit entry now includes position, barangay and subdivision. The Head Officer test no longer accepts a non-existent role 5 or a non-staff account.
- Public sign-up (`POST /users/` without an administrator or Head Officer) ignores any position and adds no title.
- `_certificate_signatory` (`adoptions.py`): the Head Officer flag only, not position 6.
- `/brgy/profile` and `/brgy/settings`: position shown read-only with "Assigned by your Head Officer or the administrator", and no longer sent on save. The Personnel page hides subdivision titles from the position list.

## Validation evidence

- `backend/tests/test_account_self_edit.py`: 27/27 (in-memory database). Against the previous `users.py` (scratch copy) 16 of them fail, including a resident becoming an administrator.
- Existing suites passed: `test_admin_invite` 28/28, `test_adoption_authority` 216/216, `test_adoption_certificate` 33/33, `test_change_password` 22/22, `test_inactive_staff_assignments` (14), `test_password_policy` 19/19, `test_password_reset` 27/27, `test_session_security` 16/16, `test_app_stay_signed_in` 19/19, `test_auth_google_otp` 22/22, `test_admin_2fa` 20/20, `test_report_edit_auth` 36/36, `test_adoption_chat` 102/102, `test_chat_isolation` 18/18, `test_admin_001_users_rbac` and `test_admin_003_admin_create_user` (all checks passed).
- **Side effect to note:** `test_admin_001_users_rbac` and `test_admin_003_admin_create_user` use the configured database, not a test one. `test_admin_003` created two accounts there and deleted them at the end. Read-only checks afterwards: no accounts above id 9, no example.com addresses, no one-time codes, email-log or audit rows for those accounts. Only the user id counter advanced. `docs/04-testing/README.md` now warns about these two suites.
- Audit log (read-only): 3 `UPDATE_USER` entries, none a self-change of role, Head Officer or status, so no evidence the hole was used.
- Frontend: `tsc` and `vite build` passed; a headless check of `/brgy/profile` and `/brgy/settings` at 1280 and 390 px passed 21/21 (position read-only with its note, no "Barangay Captain" dropdown, save sends no position, no sideways scroll).
- Not changed (reported): a Head Officer can still set another staff member's password through this endpoint (existing behavior); a resident can change their email without re-verification.
