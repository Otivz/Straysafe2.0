# Redesign Resident Account-Claim Email & Sanitize Activation Link

- **Date:** `2026-11-22 12:36 (UTC)`
- **AI tool:** `Antigravity (Gemini)`
- **Files changed:** `backend/app/utils/mailer.py`, `backend/app/services/resident_invitations.py`, `docs/05-operations/agents/feature-updates/2026-11-22_1236_redesign-account-claim-email.md`
- **Authorization:** User request ("Redesign the account-claim email sent to residents... Most importantly, make sure the button is fully clickable... Verify that the button uses the correct dynamically generated URL")
- **Type:** `Polish`

## Summary

- Redesigned `send_activation_invitation_email` in `backend/app/utils/mailer.py` with a responsive table-based HTML layout aligned with STRAYSAFE's warm sand/amber palette (`#f6f4ef`, `#b45309`, `#ffffff`), subdivision name context, clear 3-step activation instructions, and a bulletproof clickable `<a href="{safe_link}">Claim My Account</a>` button plus clickable fallback URL.
- Hardened `activation_link(token)` in `backend/app/services/resident_invitations.py` to strip accidental `FRONTEND_URL=` prefixes from `os.getenv("FRONTEND_URL")` and validate the `http://`/`https://` scheme so email clients never receive malformed `href` links.
- Passed `subdivision_name` from `deliver()` in `resident_invitations.py` into `send_activation_invitation_email`.
