# StraySafe — Login, Google Sign-In & Email Security Audit

**Date:** 2026-10-05
**Scope:** Resident login, registration, Google sign-in, OTP email verification, sessions
**Files:** `backend/app/routes/auth.py`, `backend/app/routes/users.py`, `backend/app/schemas/auth.py`, `backend/app/utils/mailer.py` (new), `backend/app/utils/auth.py`, `frontend/src/pages/citizen/ResidentsLogin.tsx`, `frontend/src/components/GoogleSignInButton.tsx` (new)
**Test:** `backend/tests/test_auth_google_otp.py` — 22/22 passing. Existing `test_admin_001`, `test_admin_003` and `test_phase_2_stability` still pass.

---

> **Google sign-in is used.** It switches on when the Client ID is in `.env`. Until then, the button is hidden (`VITE_GOOGLE_CLIENT_ID`) and `/auth/google` returns 503 (`GOOGLE_CLIENT_ID`). No accounts were ever created through the old fake Google form (checked in `audit_logs`).

## 1. Summary

The old "Sign in with Google" never contacted Google. It was a form where you typed any email, and the backend logged in whoever owned that email. Combined with three other gaps, anyone could take over or edit resident accounts without a password. All of these are now fixed:

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| A1 | Fake Google sign-in: typing any verified resident's email logged you in as them, with no password | **Critical** | **Fixed** |
| A2 | `/auth/complete-profile` took any `user_id` or email with no login, so anyone could overwrite any resident's name, phone and address | **Critical** | **Fixed** |
| A3 | OTP code returned in every API response (`dev_otp`), so verification proved nothing | **Critical** | **Fixed** |
| A4 | No email delivery: OTP codes were never actually sent | **High** | **Fixed** (Gmail SMTP) |
| A5 | `/auth/verify-otp` and `/auth/resend-otp` took a bare `user_id`, so codes could be guessed for someone else's unverified account | **High** | **Fixed** |
| A6 | Public registration accepted `is_verified: true` from the browser, skipping verification | **High** | **Fixed** |
| A7 | Google sign-in didn't check the role, so staff/admin emails could enter through the resident portal | **High** | **Fixed** |
| A8 | No rate limits on Google sign-in, OTP verify/resend, profile completion or registration | **Medium** | **Fixed** |
| A9 | OTP compared with `!=` (timing leak) | **Low** | **Fixed** |
| A10 | OTP screen claimed the code was sent to the phone; there is no SMS | **Low** | **Fixed** |

Forgot password (added after the first version of this audit) is described in Section 2.1.

Still open (Section 4): pending sessions are accepted by most endpoints, refresh cookie not `Secure`, rate limits are shared by everyone in dev, no password rules at registration, old sessions survive a password reset, no staff 2FA.

---

## 2. How it works now

### Google sign-in
1. The page loads Google Identity Services (`accounts.google.com/gsi/client`) and shows Google's official button.
2. Google signs the user in and gives the page a signed **ID token**.
3. The page sends only that token to `POST /auth/google` as `{ "credential": "..." }`.
4. The backend checks it with `google.oauth2.id_token.verify_oauth2_token`: Google's signature, issuer, expiry, and that the audience is **our** `GOOGLE_CLIENT_ID`. It also requires `email_verified = true`.
5. Email, name and picture are read **from the verified token**. Anything else the browser sends is ignored.
6. Non-resident accounts are refused (403) and told to use the staff/admin login.

### Email verification (OTP)
1. Login or Google sign-in for an unverified resident returns a **pending session token**.
2. `complete-profile`, `verify-otp` and `resend-otp` all require that token and only act on its own account. A `user_id` in the body is ignored.
3. Codes: 6 digits from `secrets`, valid 5 minutes, 5 wrong tries per code, older codes cancelled on resend, 30-second resend cooldown, constant-time comparison.
4. The code is emailed from `straysafe.support@gmail.com` over Gmail SMTP (STARTTLS, port 587) using an **App Password**.
5. If sending fails, the response says `email_sent: false` and the screen shows "We couldn't send the verification email… Tap Resend Code". It doesn't pretend the email went out.
6. The code is **never** in the API response unless `OTP_DEBUG=true` is set in `.env` (local testing only).

### Password registration
`POST /users/` without an admin/head-officer session always creates an **unverified** resident. The page then logs in automatically, which sends the email code.

### 2.1 Forgot password
Available to residents, staff and admins from each login page ("Forgot password?" opens the same popup).
1. **Request:** `POST /auth/forgot-password` with the email. The answer is **identical** whether or not the email exists or the account is inactive, and the email is sent in the background so the response time doesn't reveal it either.
2. **Code:** 6 digits from `secrets`, valid 10 minutes, 5 wrong tries, a new request cancels the old code, and a second request within 30 seconds is silently ignored (no email spam). The code is never returned in the API response, even with `OTP_DEBUG=true`.
3. **Reset:** `POST /auth/reset-password` with email + code + new password (8+ characters). Wrong code, expired code, used code and unknown email all give the **same** error. The code is checked in constant time and can only be used once.
4. **Kept apart from sign-up codes:** a reset code can't verify an account, and a verification code can't reset a password.
5. Both steps are written to the audit log (`PASSWORD_RESET_REQUESTED`, `PASSWORD_RESET`).
Test: `backend/tests/test_password_reset.py`.

### 2.2 Admin creates an account (email-verified setup)
In **User Management → Add user**, the admin enters name, email, phone and role. There is no password field.
1. The account is created with a random password **nobody knows** (an admin-typed password is ignored).
2. The person is emailed a 6-digit setup code, valid **72 hours**, with the sign-in page link for their role.
3. They open the sign-in page → **Forgot password?** → **I already have a code**, then enter their email, the code and a password of their choice (8+ characters). Only the owner of the inbox can complete this, so a mistyped or someone else's email can never become a working account.
4. Until then the user list shows an **Awaiting setup** badge, and the Actions menu has **Resend setup email** (admin only, limited to people who haven't set a password; an expired code can be resent).
5. A setup code and a forgot-password code are tracked separately, so requesting one never cancels the other; using either sets the password and retires both.
6. If the email can't be sent, the admin is told so instead of seeing a false "success".
Tests: `backend/tests/test_admin_invite.py` (28 checks) and the updated `test_admin_003_admin_create_user.py`.
Note: the link in the email is built from `FRONTEND_URL` in `.env`, so keep that set to the address people actually open.

### Rate limits added (per IP)
| Endpoint | Limit |
|----------|-------|
| `POST /auth/forgot-password` | 5/min |
| `POST /auth/reset-password` | 10/min |
| `POST /auth/google` | 10/min |
| `POST /auth/complete-profile` | 10/min |
| `POST /auth/verify-otp` | 10/min |
| `POST /auth/resend-otp` | 5/min (plus 30s cooldown) |
| `POST /users/` | 10/min |
| `POST /auth/login` | 5/min (already existed) |

---

## 3. Setup you need to do

### 3.1 Gmail App Password (for sending email)
1. Sign in to **straysafe.support@gmail.com** → Google Account → **Security**.
2. Turn on **2-Step Verification**. App Passwords don't appear until it's on.
3. Search "App passwords" in the account settings → create one named `StraySafe SMTP`.
4. Copy the 16-character password into `.env`: `SMTP_PASSWORD=abcd efgh ijkl mnop` (spaces are fine).
5. Restart the backend.

### 3.2 Google OAuth Client ID (for the sign-in button)
1. Go to **console.cloud.google.com** while signed in as straysafe.support@gmail.com and create a project named `StraySafe`.
2. **Google Auth Platform → Branding**: app name `StraySafe`, support email `straysafe.support@gmail.com`. Audience: **External**. While it's in **Testing** mode, add each tester's Gmail under **Test users**.
3. **Clients → Create client → Web application**. Under **Authorized JavaScript origins**, add:
   - `http://localhost:5173`
   - `https://10-1-207-251.sslip.io:5173` (phone testing; use your current IP with dashes)
   - Google does **not** accept raw IPs like `https://10.1.207.251:5173`. The `sslip.io` name points to the same IP, and Vite now allows it.
4. Copy the Client ID into **both** `GOOGLE_CLIENT_ID=` and `VITE_GOOGLE_CLIENT_ID=` in `.env`.
5. Restart **both** the backend and `npm run dev` (Vite reads env only at start).

When your Wi-Fi IP changes, add the new `https://<ip-with-dashes>.sslip.io:5173` origin in Google Cloud. It can take a few minutes to take effect.

---

## 4. Still open

| # | Issue | Severity | Recommendation |
|---|-------|----------|----------------|
| O1 | ~~Unverified tokens worked on most endpoints~~ | — | **Fixed** — unverified residents can only reach complete-profile, verify-otp and resend-otp (`get_pending_user`); everything else answers "Please verify your email address first" (403). |
| O2 | ~~Refresh cookie not Secure~~ | — | **Fixed** — set `COOKIE_SECURE=true` on any HTTPS deployment (default `false` so plain-HTTP development still works). |
| O3 | ~~Rate limits shared in dev~~ | — | **Fixed** — the dev proxy now forwards the visitor's real IP (`xfwd`), and uvicorn already uses it only when it comes from the trusted local proxy, ignoring spoofed values. In production run uvicorn with `--forwarded-allow-ips=<your proxy's IP>`. |
| O4 | ~~No password reset~~ | — | **Done** — see Section 2.1. |
| O5 | ~~Password rules only on resets~~ | — | **Done** — 12–128 characters with an uppercase letter, lowercase letter, number and special character, enforced by the server on registration, user edits and resets, with a live checklist on every password form. |
| O12 | ~~Resident "Change Password" did nothing~~ | — | **Fixed** — it now saves through `POST /auth/change-password`. |
| O13 | ~~Changing a password never asked for the current one~~ | — | **Fixed** — `POST /auth/change-password` checks the current password (5 tries/min, failed attempts audit-logged), and `PUT /users/{id}` refuses password changes for your own account. All four settings screens use the new endpoint. |
| O14 | ~~Head officers typed a password for new staff~~ | — | **Fixed** — head officers now create staff through the same emailed setup code as admins (staff role only, own barangay). If the email fails they're told to have the person use "Forgot password?". |
| O15 | **Old weak passwords keep working** (e.g. seeded `password123` accounts) until their owners change them; the policy only applies when a password is set. | Medium | Change the seed/demo passwords before the defense. |
| O10 | ~~Old sessions survived a password change~~ | — | **Fixed** — `users.password_changed_at` is stamped on change, reset and admin-set passwords; access and refresh tokens issued before it are rejected ("Your password was changed. Please sign in again."). The settings screens sign you out after a change. |
| O11 | **Staff and admin accounts can be reset by email alone.** Whoever controls the inbox controls the account. | Low–Medium | Acceptable for this project; for production, require an admin to approve staff/admin resets, or add a second factor. |
| O6 | **Admin second factor — built, switched off by default.** With `ADMIN_LOGIN_2FA=true`, an admin who enters the right password is emailed a 6-digit code (10 minutes, one use, 5 tries) and gets no session until it's entered. Staff and residents are unaffected. | Medium | **Before turning it on:** change the admin account's email to a real inbox you can open (the seeded `admin@straysafe.com` can't receive mail, so you would be locked out). If locked out, set `ADMIN_LOGIN_2FA=false` and restart. Head officers (role 3) are not covered yet. |
| O7 | **Registration reveals existing emails** ("Email already registered") | Low | Acceptable for a community app; optionally show a generic message. |
| O8 | **Google users verify their email twice** (Google already verified it, then they get an OTP to the same address) | UX | Optionally mark Google accounts verified after profile completion and skip the OTP. |
| O9 | **App Password and OAuth client are in `.env`** | Info | `.env` is gitignored (confirmed). Never paste it into chat or screenshots. Revoke the App Password if it leaks. |

---

## 5. Checklist

### Done in this change
- [x] Google sign-in uses Google Identity Services and a signed ID token
- [x] Backend verifies token signature, issuer, expiry and audience (`GOOGLE_CLIENT_ID`)
- [x] Backend requires `email_verified` from Google
- [x] Email / name / picture taken only from the verified token
- [x] Staff and admin accounts refused on the resident Google login
- [x] Old email-only `/auth/google` request rejected (422)
- [x] Clear 503 if Google sign-in isn't configured or Google can't be reached
- [x] `complete-profile` requires the pending session, ignores `user_id`, refuses verified accounts
- [x] `verify-otp` and `resend-otp` require the pending session
- [x] OTP emailed through Gmail SMTP (STARTTLS) with HTML + plain-text versions
- [x] Email failures reported honestly (`email_sent: false`) with a retry message
- [x] `dev_otp` removed from responses (only with `OTP_DEBUG=true`)
- [x] Constant-time OTP comparison
- [x] Public registration forced to unverified; auto-login sends the code
- [x] Rate limits on Google, profile, OTP verify/resend, registration
- [x] OTP screen shows email only (no fake SMS)
- [x] Admin-created accounts: no admin-set password; email-verified setup code (72h), resend action, "Awaiting setup" badge
- [x] Forgot password by emailed code for residents, staff and admins (no account enumeration, single-use, 10-minute expiry, lockout after 5 wrong tries, 8-character minimum)
- [x] `google-auth` and `requests` added to `requirements.txt`
- [x] `.env.example` documents all new keys with placeholders
- [x] `.env` confirmed gitignored
- [x] Automated test: 22 checks (`tests/test_auth_google_otp.py`)

### Your setup
- [x] 2-Step Verification on straysafe.support@gmail.com
- [x] App Password created and pasted into `SMTP_PASSWORD` (Gmail accepted the login)
- [x] Google Cloud project created and OAuth consent screen set up
- [ ] Test users added (**Audience → Test users**, every Gmail you'll sign in with)
- [x] Web OAuth client created
- [ ] `http://localhost:5173` (and the `sslip.io` phone origin) saved under **Authorized JavaScript origins**: the `origin_mismatch` error means this is still missing
- [x] Client ID in `GOOGLE_CLIENT_ID` and `VITE_GOOGLE_CLIENT_ID`
- [ ] Backend and Vite restarted after the last `.env` change
- [ ] Reset the App Password and OAuth client secret that were pasted into chat

### Manual tests after setup
- [ ] Register with email + password → code arrives in inbox → verify → lands on home
- [ ] Wrong code 5 times → blocked until Resend
- [ ] Resend Code → new email, old code no longer works
- [ ] Sign in with Google (new Gmail) → Google popup → profile form → code email → verified
- [ ] Sign in with Google (already verified resident) → straight to home
- [ ] Sign in with Google using a staff Gmail → "use the staff or admin login" error
- [ ] Phone over `https://<ip>.sslip.io:5173` → Google button works
- [ ] Admin → User Management → Add user (no password field) → setup email arrives → "Forgot password?" → "I already have a code" → set password → sign in
- [ ] The new user shows "Awaiting setup" until then; "Resend setup email" sends a fresh code
- [ ] Resident login → "Forgot password?" → email → code arrives → set new password → sign in with it
- [ ] Same on the staff login and admin login pages
- [ ] Unknown email → same "if registered, we sent a code" message, and no email arrives
- [ ] Wrong code 5 times → even the right code is refused until you request a new one
- [ ] Temporarily blank `SMTP_PASSWORD` → screen shows the "couldn't send" warning, not a fake success

### Next security items (from Section 4)
- [x] O1 — Reject unverified tokens outside the verification endpoints
- [x] O2 — `Secure` refresh cookie in production (`COOKIE_SECURE=true`)
- [x] O3 — Correct client IP for rate limiting behind a proxy
- [x] O4 — Password reset by email
- [x] O5 — Password rules (12–128, upper, lower, number, special) enforced everywhere a password is set
- [x] O12 — Resident Change Password actually works
- [x] O13 — Current password required to change a password
- [x] O14 — Staff created by head officers get the emailed setup code
- [ ] O15 — Change seeded/demo passwords
- [x] O10 — Invalidate old sessions after a password change or reset
- [x] O6 — Email code as second factor for admin logins (built; switch on with `ADMIN_LOGIN_2FA=true` after the admin email is a real inbox)
- [ ] Turn on `ADMIN_LOGIN_2FA` once the admin email is a real inbox and the sign-in code has been tested
