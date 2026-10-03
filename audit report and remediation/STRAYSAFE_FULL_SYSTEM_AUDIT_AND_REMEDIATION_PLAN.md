# STRAY-SAFE — Full System Audit & Phased Remediation Plan

**Audit date:** 2026-10-02
**Branch audited:** `adoption_proces` (working tree, including uncommitted changes to `pet_qr.py`, `PetDetailPanel.tsx`, `PetScan*Page.tsx`, `ResidentPet.tsx`)
**Method:** Static code tracing (Frontend → API → Backend → DB). I read every route module's auth dependencies with an AST script, then traced the critical flows by hand. I did not run the application or the database, so findings are code-confirmed, not exploit-tested. Each Phase 8 task includes a verification test that should be written to prove each fix.
**Code changes made during this audit:** none.

**Labels used in this document**

| Label | Meaning |
|---|---|
| **CONFIRMED** | Traced in code; the defect follows directly from the lines cited. |
| **POTENTIAL** | Likely defect, but depends on runtime config, data, or third-party behavior not verifiable statically. |
| **RECOMMENDATION** | Improvement; not a defect by itself. |
| **OK** | Already correct, no action needed. |

---

## 1. Executive Summary

STRAY-SAFE has a lot of features and a good base: bcrypt passwords, JWT with `jti` revocation and refresh rotation, central upload validation with magic-byte checks, an encrypted, watermarked government-ID pipeline, and AI matching that requires human verification. **But the security model is enforced inconsistently, and several gaps are critical:**

1. **Account takeover without a password.** `/auth/google` accepts any email typed by the client and issues full tokens. The OTP endpoints return the OTP code in the response and look users up by `user_id`, without authentication.
2. **Privilege escalation.** Any logged-in user can `PUT /users/{own_id}` with `role_id: 4` and become an Admin.
3. **About 45 endpoints have no authentication**, including report verification, false-alarm dismissal, merge/unmerge, dispute review, comment posting, media deletion, and announcement editing. Several of them take the acting user from a `user_id` field in the request body.
4. **The adoption workflow can be bypassed.** The stage endpoints lack consistent gates. An application can go from Stage 1 to completed handover and ownership transfer while skipping verification, interview, home visit, and review. Subdivision Leaders and cross-barangay staff can run handover and certificate steps.
5. **Animal and holding records drift.** Approving an owner claim never updates the holding record. Occupancy counts include discharged animals. Staff can set a holding animal to "Adopted" directly. A startup migration rewrites report coordinates on every boot.

**Overall condition:** feature-rich, but **not production-safe**. Phase 1 (below) must be completed before any real-user deployment.

---

## 2. Critical Findings

### C-01 — Google sign-in trusts a client-supplied email (no ID-token verification) — CONFIRMED
- **Location:** [backend/app/routes/auth.py:257-384](../backend/app/routes/auth.py#L257-L384), [frontend/src/pages/citizen/ResidentsLogin.tsx:288-310](../frontend/src/pages/citizen/ResidentsLogin.tsx#L288-L310)
- **Evidence:** `google_auth()` looks up `User.email == request.email` and, if the user is verified with a complete profile, returns an access token plus a refresh cookie (Case A). `GoogleAuthRequest.credential` is never verified. The frontend "Google" modal is a plain email text box that POSTs to `/auth/google`.
- **Risk:** Anyone can log in as any verified account (residents, and any staff or leader account with phone, address, and subdivision set) by knowing its email.
- **Fix:** Verify the Google ID token server-side (`google.oauth2.id_token.verify_oauth2_token` with the client ID), and use the token's `email`/`email_verified`. Restrict Google login to `role_id == 1`. Remove the email-only modal.

### C-02 — OTP code returned in API responses; OTP endpoints are unauthenticated and keyed by `user_id` — CONFIRMED
- **Location:** [auth.py:196](../backend/app/routes/auth.py#L196), [auth.py:450](../backend/app/routes/auth.py#L450), [auth.py:455-520](../backend/app/routes/auth.py#L455-L520), [auth.py:523-636](../backend/app/routes/auth.py#L523-L636), [auth.py:639-690](../backend/app/routes/auth.py#L639-L690); the UI shows it at [ResidentsLogin.tsx:197](../frontend/src/pages/citizen/ResidentsLogin.tsx#L197)
- **Evidence:** `dev_otp` is in every OTP response. `/auth/resend-otp` takes any `user_id` (any role, including Admin), returns a fresh OTP, and `/auth/verify-otp` then issues full tokens for that user. `/auth/complete-profile` lets an anonymous caller overwrite any resident's name, phone, address, and subdivision.
- **Risk:** Full account takeover of **any** user, including Admins, with two anonymous requests.
- **Fix:** Remove `dev_otp` (keep it only behind an explicit `ENV=development` flag that fails closed). Require the restricted pre-verification token on these endpoints and take the user from that token, not the body. Restrict them to `role_id == 1` and unverified accounts. Rate-limit them.

### C-03 — Vertical privilege escalation through self profile update — CONFIRMED
- **Location:** [backend/app/routes/users.py:327-389](../backend/app/routes/users.py#L327-L389), [backend/app/schemas/user.py:33-49](../backend/app/schemas/user.py#L33-L49)
- **Evidence:** `UserUpdate` exposes `role_id`, `is_head_officer`, `is_verified`, `status`, `barangay_id`, and `subdivision_id`. `update_user` allows `is_self` and then runs `setattr` on every supplied field. A Barangay head can also set `role_id=4` on users in their barangay. A password change does not ask for the current password.
- **Risk:** Any resident becomes Admin with one request.
- **Fix:** Use separate schemas: `SelfProfileUpdate` (name, phone, address, coordinates, password with `current_password`), `AdminUserUpdate` (Admin only), and `HeadOfficerStaffUpdate` (role fixed at 3, scoped to the head's barangay). Audit every role or status change.

### C-04 — Unauthenticated, actor-spoofable report mutation endpoints — CONFIRMED
- **Location:** [backend/app/routes/reports.py](../backend/app/routes/reports.py): `verify-incident` L4271, `mark-false-alarm` L4415, `merge` L4507, `unmerge` L4707, `disputes` POST L4826, dispute `review` L4981, `comments` L3296, `DELETE /media/{id}` L3354, `link-pet` L3365, `POST /{id}/media` L2713
- **Evidence:** No `Depends(get_current_*)`. The actor is loaded from `verify_in.user_id`, `false_in.user_id`, `merge_in.user_id`, or `review_in.reviewer_id` in the body, then passed to `verify_subdivision_scope(user, ...)`. Passing an Admin's ID (`1`) passes every scope check.
- **Risk:** An anonymous caller can dismiss any report as a false alarm, accept disputes, merge or unmerge cases, link any pet to any report (which changes the pet's behavior record), delete evidence media, and post comments as any user. Audit logs and status history then attribute these actions to the impersonated official.
- **Fix:** Add `current_user = Depends(get_current_staff_or_admin)` (or `get_current_user` for resident actions), use `current_user` as the actor, and delete `user_id` / `reviewer_id` / `resident_user_id` from the request schemas.

### C-05 — Adoption workflow can skip required stages and transfer ownership — CONFIRMED
- **Location:** [backend/app/routes/adoptions.py](../backend/app/routes/adoptions.py)
- **Evidence (bypass chain):**
  1. `POST /{id}/application/approve` (L1991) sets `status="Approved"` immediately and auto-writes the verification record as `Matched / not blacklisted` without checking anything.
  2. `POST /{id}/handover/complete` (L2946) checks only `status == "Approved"`. It sets both handover flags and calls `_finalize_adoption_if_ready` (L420), which marks the animal Adopted, creates a `Pet` owned by the applicant, and resolves the report.
  3. The legacy `staff-confirm-handover` (L1558) and `adopter-confirm-received` (L1637) endpoints do the same with the same weak check.
  4. `home-visit/evaluate` (L2378) has no stage gate, so the interview can be skipped. `PUT /review/{id}` (L1357) and `POST /{id}/approve` (L2534) approve from any stage, including Rejected or Cancelled applications.
  5. `mark-successful` (L3500) sets `status="Approved"` on any application, which revives rejected ones.
- **Risk:** Animals can be adopted without verification, interview, home visit, or review, and ownership transfers into the Pet registry.
- **Fix:** Implement a single `ADOPTION_TRANSITIONS` state machine (see task P5-01). Every stage endpoint must call `require_stage(app, expected_stage, allowed_statuses)` and reject terminal states. Remove or redirect the legacy endpoints.

### C-06 — Cross-tenant and wrong-role adoption actions — CONFIRMED
- **Evidence:** `certificate/proceed` (L2715), `certificate/send` (L2778), `handover/proceed` (L2829), `handover/schedule` (L2862), `handover/complete` (L2946), and `mark-successful` (L3500) use only `get_current_staff_or_admin`, so **Subdivision Leaders** and staff from **any barangay** can run them. `home-visit/*` allows role 2 with no jurisdiction check. `GET /{id}/dossier` (L3456) allows `role_id in [1,2,3,4,5]`, so **any resident** can read any applicant's address, contact, interview notes, home-visit GPS, and masked ID.
- **Fix:** Apply `_can_manage_adoption()` (fixed per P5-02) to every staff stage endpoint. Restrict the dossier to the applicant or managing staff.

### C-07 — Unauthenticated data exposure (PII and operational data) — CONFIRMED
- **Evidence:** `GET /reports/` (L961) and `GET /reports/{id}` (L2239) return reporter details and pet **owner phone, email, and address** ([reports.py:280-282](../backend/app/routes/reports.py#L280-L282)). `GET /claims/` and `/claims/{id}` return `PetResponse` with the owner. `GET /rescue/*`, `GET /holding/*`, `GET /matches/*`, and `GET /reports/{id}/disputes` (vaccination-card URLs) are all anonymous.
- **Fix:** Require authentication. Scope results by role (resident: own records; leader: subdivision; staff: barangay). Strip owner contact details from responses unless the caller is the owner or authorized staff.

---

## 3. Security Findings

| ID | Severity | Area | Finding | Evidence | Recommended Fix | Label |
|---|---|---|---|---|---|---|
| S-01 | Critical | AuthN | Google login trusts client email | C-01 | Verify Google ID token | CONFIRMED |
| S-02 | Critical | AuthN | OTP leaked in response; OTP flows by `user_id` | C-02 | Remove `dev_otp`; bind to restricted token | CONFIRMED |
| S-03 | Critical | AuthZ | Self-update can set `role_id`, `is_verified`, `status` | C-03 | Split update schemas | CONFIRMED |
| S-04 | Critical | AuthZ | Public registration accepts `is_verified`/`status` from body | [users.py:188-258](../backend/app/routes/users.py#L188-L258) (`user_data = user_in.model_dump()`; only role is overridden) | Whitelist fields on public signup | CONFIRMED |
| S-05 | Critical | AuthZ/IDOR | ~45 endpoints with no auth dependency; several take the actor from the body | C-04, C-07; announcements L151/L291/L319/L360/L399/L442 | Add auth deps; actor = `current_user` | CONFIRMED |
| S-06 | High | Audit integrity | `log_activity` trusts the `X-User-Id` header when `user_id` is not passed | [utils/audit.py:19-28](../backend/app/utils/audit.py#L19-L28) | Remove header fallback; always pass `current_user.user_id` | CONFIRMED |
| S-07 | High | AuthN | `get_current_user` does not enforce `is_verified`; unverified residents (restricted token) can call every `get_current_user` endpoint (adoption apply, ID upload, pets, chat) | [utils/auth.py:181-262](../backend/app/utils/auth.py#L181-L262) | Reject `is_verified=False` tokens except on onboarding routes | CONFIRMED |
| S-08 | High | AuthN | `get_optional_user` skips revocation and inactive checks | [utils/auth.py:302-332](../backend/app/utils/auth.py#L302-L332) | Reuse `get_current_user` logic | CONFIRMED |
| S-09 | High | AuthZ | `verify_subdivision_scope` fails open for staff with `barangay_id=None` or resources with no subdivision/barangay | [utils/auth.py:335-383](../backend/app/utils/auth.py#L335-L383) | Deny when the scope cannot be resolved (except Admin) | CONFIRMED |
| S-10 | High | AuthZ | Holding PATCH/escalate, rescue create/PATCH, claim status, match verify, announcements: no barangay scoping for role 3; role-2 checks partial | holding.py L531, rescue.py L146/L373, claims.py L226, matches.py L931 | Call `verify_subdivision_scope` everywhere | CONFIRMED |
| S-11 | High | AuthZ | Pet owner can reassign `owner_id` and set arbitrary `status` through `PUT /pets/{id}` (bypasses admin-only reassignment) | [pets.py:508-557](../backend/app/routes/pets.py#L508-L557), `PetUpdate.owner_id` | Remove `owner_id` from `PetUpdate`; validate status transitions | CONFIRMED |
| S-12 | High | Cost/DoS | `/reports/analyze-media` and `/reports/validate-images` are anonymous, read the whole body unbounded, and call Gemini | reports.py L1425, L1809 | Auth + rate limit + size cap before `read()` | CONFIRMED |
| S-13 | High | AI cost | Anonymous `GET /reports/{id}` triggers a Gemini call and DB write when AI fields are null | [reports.py:2266-2299](../backend/app/routes/reports.py#L2266-L2299) | Move backfill to background job only | CONFIRMED |
| S-14 | High | Upload | Unsigned Cloudinary preset in the frontend bundle lets anyone upload arbitrary content to the account | [frontend/src/utils/cloudinaryUpload.ts](../frontend/src/utils/cloudinaryUpload.ts), `.env.example` `VITE_CLOUDINARY_UPLOAD_PRESET` | Signed uploads (backend issues signature) or backend proxy | CONFIRMED |
| S-15 | High | Upload | `upload-home-visit-photos` does no type/size/magic validation | [adoptions.py:1113-1139](../backend/app/routes/adoptions.py#L1113-L1139) | Use `read_and_validate_upload(allowed={'Image'})` | CONFIRMED |
| S-16 | Medium | Token storage | Access token and user object in `localStorage`; refresh cookie `secure=False` | [frontend/src/utils/api.ts:13](../frontend/src/utils/api.ts#L13), [utils/auth.py:119](../backend/app/utils/auth.py#L119) | Memory-only access token; `secure=True` via env; strict CSP | CONFIRMED |
| S-17 | Medium | CORS | `allow_origin_regex` accepts any private-network IP with `allow_credentials=True`; http/https auto-expanded | [main.py:1317-1332](../backend/app/main.py#L1317-L1332) | Explicit origin allowlist from env in production | CONFIRMED |
| S-18 | Medium | Rate limiting | Only `/auth/login` is rate-limited. OTP verify (5 attempts per code, but unlimited resends), QR scan submit, report create, and comments are not | auth.py, pet_qr.py L218 | Add `@limiter.limit` on auth, OTP, public, and AI endpoints | CONFIRMED |
| S-19 | Medium | Privacy | Public QR scan returns owner email, phone, and home address to anyone with the tag | [schemas/pet_qr.py:24-49](../backend/app/schemas/pet_qr.py#L24-L49) | Return only an owner-approved contact or relay channel; mask address | CONFIRMED |
| S-20 | Medium | SSRF / local file read | `fetch_image_for_entity` opens local filesystem paths and fetches arbitrary http(s) URLs taken from DB fields | [utils/ai_matching.py:48-106](../backend/app/utils/ai_matching.py#L48-L106) | Allowlist Cloudinary host; drop local-path branch | POTENTIAL (depends on which URL fields stay unvalidated) |
| S-21 | Medium | Error leakage | `HTTPException(400, detail=str(e))` / `500 detail=f"...{e}"` return raw exception text (4xx is not masked by the global handler) | holding.py L526, L706, L910, L979, L1029; users.py L536 | Log the exception; return a generic message | CONFIRMED |
| S-22 | Medium | Startup | Public `/uploads` static mount | [main.py:1384-1387](../backend/app/main.py#L1384-L1387) | Remove if unused (all media is Cloudinary) or serve with auth | POTENTIAL |
| S-23 | Low | Dead code | `get_actor_user()` (trusts `X-User-Id`) defined but unused | pets.py L258, matches.py L35 | Delete | CONFIRMED |
| S-24 | Low | Positions | `_resolve_position_id` creates new `positions` rows from free text on user create/update | [users.py:164-186](../backend/app/routes/users.py#L164-L186) | Only allow existing positions | CONFIRMED |
| S-25 | Low | Logout | Access tokens revoked only if sent; other active sessions stay valid; no "revoke all on password/role change" | auth.py L820 | Add `token_version` on user, embed it in JWT | RECOMMENDATION |

**OK (already correct):** bcrypt hashing; `jti` revocation check in `get_current_user`; refresh-token rotation with blacklist; inactive-account blocks on login and refresh; 5/min login limiter; SQLAlchemy and 5xx error masking ([main.py:1342-1381](../backend/app/main.py#L1342-L1381)); admin-only checks on `/admin/*`, `/audit-logs`, AI settings PUT, user delete, and notification dispatch; notification ownership checks; chat access via `check_user_report_chat_access`.

---

## 4. Functional Findings (Workflows)

| ID | Severity | Workflow | Finding | Evidence | Label |
|---|---|---|---|---|---|
| F-01 | High | Report status | No transition state machine. `PUT /reports/{id}/status` accepts any `status_id` from any state (e.g., Resolved → Reported, Rejected → Claimed). Leaders can re-send status 4 indefinitely | [reports.py:2790-3292](../backend/app/routes/reports.py#L2790-L3292) | CONFIRMED |
| F-02 | High | Claims ↔ holding | Approving a pet claim sets the report to 9 and the pet to Active but **never discharges the `HoldingAnimal`**. A claimed animal stays "in facility", counts toward occupancy, and can still be promoted to adoption | [claims.py:226-366](../backend/app/routes/claims.py#L226-L366) (no `HoldingAnimal` reference in the file) | CONFIRMED |
| F-03 | High | Holding | Staff can PATCH `facility_status` directly to 6 (For Adoption, bypassing promote rules and stay limit) or 7 (Adopted, with no adoption record). `intake_date` is editable, so stay duration can be falsified | [holding.py:531-575](../backend/app/routes/holding.py#L531-L575), `HoldingAnimalUpdate` | CONFIRMED |
| F-04 | High | Holding | `Impounded (8)` is in `RESOLVED_STATUSES`: setting it stamps `discharge_date` and sets the report to **11 Resolved**, although the animal is still in custody | [holding.py:31](../backend/app/routes/holding.py#L31), L585-L604 | CONFIRMED |
| F-05 | Medium | Timeline duplication | Each status update to 7 or 8 (incl. 7 → 8 at the same facility) builds a `relocation_note` and adds another "Animal Relocated / Transferred" holding-timeline entry, so one physical movement is logged multiple times | [reports.py:2896-2906](../backend/app/routes/reports.py#L2896-L2906), L3239-L3247 | CONFIRMED |
| F-06 | Medium | Holding intake race | `holding_animals.report_id` has no UNIQUE constraint. Intake happens in both `PUT /reports/{id}/status` and `POST /holding/` with check-then-insert, so concurrent requests can create two active identities for one animal | [models/report.py:337-344](../backend/app/models/report.py#L337-L344) | CONFIRMED |
| F-07 | Medium | Holding status inference | Initial facility status is inferred by keyword search over free text (`'dead' in cond_text` matches "deadline", etc.). Metrics re-override status by keywords | [reports.py:3190-3199](../backend/app/routes/reports.py#L3190-L3199), [holding.py:369-375](../backend/app/routes/holding.py#L369-L375) | CONFIRMED |
| F-08 | Medium | Match confirmation | Confirming a duplicate report sets the duplicate holding record to `facility_status=5 "Transferred to Shelter"`, a misleading outcome for a de-duplication | [matches.py:1022-1032](../backend/app/routes/matches.py#L1022-L1032) | CONFIRMED |
| F-09 | Medium | Claims | Claim status changes have no transition validation; claim-approval `StatusHistory` has no `updated_by` | claims.py L262-L272 | CONFIRMED |
| F-10 | Medium | Report creation | `ReportCreate.user_id` comes from the body on an anonymous endpoint, so reports can be filed as another user | [reports.py:2035](../backend/app/routes/reports.py#L2035), `ReportBase.user_id` | CONFIRMED |
| F-11 | Medium | Escalation notify | Escalation (status 4) notifies **every** role-3/role-4 user system-wide, not the target barangay | [reports.py:3126-3139](../backend/app/routes/reports.py#L3126-L3139) | CONFIRMED |
| F-12 | Low | Config | `IMPOUND_DAYS = 0 # for immediate testing` makes every animal "needs impoundment" immediately | [holding.py:32](../backend/app/routes/holding.py#L32) | CONFIRMED |
| F-13 | Low | Pet deceased | Marking a pet Deceased hard-deletes its pending claims (history lost) | [pets.py:532-536](../backend/app/routes/pets.py#L532-L536) | CONFIRMED |

**OK:** report claim uses `with_for_update()` plus an assigned-leader check (atomic claim); duplicate `StatusHistory` suppression on identical consecutive updates; Picked Up (6) no longer triggers holding intake; merged duplicates redirect rescue creation to the primary case; "cannot resolve without a pet or holding record" rule.

---

## 5. Database Findings

| ID | Severity | Finding | Evidence | Label |
|---|---|---|---|---|
| D-01 | High | **Startup data mutation:** every boot runs an `UPDATE reports ... SET latitude/longitude/landmark/facility_id` on resolved, impounded, and discharged reports, rewriting historical location data | [main.py:951-973](../backend/app/main.py#L951-L973) | CONFIRMED |
| D-02 | High | Schema managed by `create_all()` plus ~40 ad-hoc `ALTER TABLE` functions run at import. No versioned migrations (Alembic) and no rollback. Errors are swallowed with `print` | [main.py:48-1214](../backend/app/main.py#L48-L1214) | CONFIRMED |
| D-03 | Medium | `ALTER TABLE ... CONVERT TO CHARACTER SET` on 7 large tables at **every startup** (table rebuild and locks) | [main.py:1203-1212](../backend/app/main.py#L1203-L1212) | CONFIRMED |
| D-04 | Medium | Lookup seeding incomplete in app bootstrap: report status 18 (Merged — Duplicate) and facility statuses 6–8 exist only in `Database3.3.txt`. A fresh DB built by the app fails FK checks on merge, promote, or adopt | [main.py:174-182](../backend/app/main.py#L174-L182), L249-L255 | CONFIRMED |
| D-05 | Medium | Missing UNIQUE on `holding_animals.report_id`; missing partial-uniqueness guard for one active adoption per animal (`status='Approved'`) | models/report.py | CONFIRMED |
| D-06 | Medium | Destructive cascades: `reports → holding_animals/status_history` `ON DELETE CASCADE`; `HoldingAnimal.adoptions cascade="all, delete-orphan"`. `DELETE /reports/{id}` or `DELETE /holding/{id}` erases rescue, adoption, and movement history | models/report.py L163-L343, L392-L396; holding.py L984 | CONFIRMED |
| D-07 | Medium | `log_activity()` calls `db.commit()` inside callers' transactions, which commits half-finished work (e.g., `ADMIN_STATUS_OVERRIDE` commits before history and holding rows are written; releases `FOR UPDATE` locks early) | [utils/audit.py:44-53](../backend/app/utils/audit.py#L44-L53), reports.py L3047 | CONFIRMED |
| D-08 | Medium | `notifications.user_id` FK has no `ondelete`, so user deletion fails or orphans. Mixed naive/aware datetimes (`datetime.now()` vs `datetime.now(timezone.utc)`) across tables | models/notification.py; adoptions.py vs reports.py | CONFIRMED |
| D-09 | Low | Status names/IDs are hardcoded magic numbers in 10+ dicts (`status_names`, `friendly_defaults`, `RESOLVED_STATUS_IDS`) that already disagree (e.g., one map stops at 13) | reports.py L3092-L3110, L3275-L3279 | CONFIRMED |
| D-10 | Low | `pet_history` has no FK to `pets`; `chat_*` and `report_matches` tables created without FKs | main.py L563-L584, L626-L730 | CONFIRMED |

**OK:** performance indexes ensured for the main query paths ([main.py:1163-1201](../backend/app/main.py#L1163-L1201)); `adoption_certificates.adoption_id`/`certificate_number`/`verification_hash` unique; `revoked_tokens.jti` unique and indexed.

---

## 6. Performance Findings

| ID | Severity | Finding | Evidence | Label |
|---|---|---|---|---|
| PF-01 | High | `GET /reports/` has no default limit (returns all reports with eager-loaded media and history), and it is anonymous | [reports.py:961-1011](../backend/app/routes/reports.py#L961-L1011) | CONFIRMED |
| PF-02 | High | Synchronous Gemini calls with **no timeout** inside request handlers (`generate_content` without `request_options`), so worker threads block | [utils/ai_suggestions.py:54-72](../backend/app/utils/ai_suggestions.py#L54-L72) | CONFIRMED |
| PF-03 | Medium | `GET /holding/`, `/rescue/`, `/matches/`, `/claims/`, `/adoptions/pipeline` are unpaginated, with deep `joinedload` chains (timeline → media, history → updater) | holding.py L412, rescue.py L267 | CONFIRMED |
| PF-04 | Medium | Holding metrics load every holding row into Python to count | [holding.py:358-406](../backend/app/routes/holding.py#L358-L406) | CONFIRMED |
| PF-05 | Medium | `ProtectedRoute` calls `/auth/verify-session` on every protected navigation; 23 `setInterval` pollers in the frontend | frontend/src/components/ProtectedRoute.tsx | CONFIRMED |
| PF-06 | Medium | Status-permission check runs one `RescueAssignment` query per rescue (N+1) | [reports.py:2823-2836](../backend/app/routes/reports.py#L2823-L2836) | CONFIRMED |
| PF-07 | Low | QR codes stored as base64 PNG in DB rows and regenerated on each sign/GET | adoptions.py L1408-L1414 | CONFIRMED |
| PF-08 | Low | 11 frontend files above 2,200 lines (largest: `BrgyAdoptions.tsx` 4,560, `ResiHomePage.tsx` 4,323, `SubdViewReport.tsx` 4,221) slow re-renders and review | frontend/src | CONFIRMED |

---

## 7. Frontend Findings

| ID | Severity | Finding | Evidence | Label |
|---|---|---|---|---|
| FE-01 | Critical | "Continue with Google" is an email text box (see C-01) | ResidentsLogin.tsx L288-L310 | CONFIRMED |
| FE-02 | High | OTP code rendered to the user from `dev_otp` | ResidentsLogin.tsx L197, L361, L418, L530 | CONFIRMED |
| FE-03 | Medium | 13 hardcoded `http://127.0.0.1:8000` / `localhost:8000` URLs bypass `API_BASE_URL` and the axios auth/refresh interceptor (break on device/production) | `grep -rn "127.0.0.1:8000\|localhost:8000" frontend/src` | CONFIRMED |
| FE-04 | Medium | Tokens and user objects in `localStorage` plus `sessionStorage`; role read from stored JSON before server check | utils/api.ts, ProtectedRoute.tsx L20-L38 | CONFIRMED |
| FE-05 | Medium | Status labels are duplicated across `utils/reportStatus.ts`, `utils/adoptionStatus.ts`, and per-page maps; backend has its own copies, so labels drift | frontend/src/utils | POTENTIAL |
| FE-06 | Low | Very large page components (see PF-08) mix data fetching, business rules, and UI | — | RECOMMENDATION |
| FE-07 | Low | No frontend tests or e2e harness | `frontend/package.json` | CONFIRMED |

**OK:** central axios instance with refresh-on-401; server-side session validation in `ProtectedRoute` (does not trust stored role alone); client-side upload pre-validation (`uploadValidation.ts`); `dangerouslySetInnerHTML` used only for a static `<style>` block (PetQrCardPage.tsx L170).

---

## 8. Backend Findings (API / validation / business logic)

| ID | Severity | Finding | Evidence | Label |
|---|---|---|---|---|
| B-01 | High | Actor identity is taken from request bodies in ~15 schemas (`ReportVerifyRequest.user_id`, `ReportMergeRequest.user_id`, `ReportDisputeReviewRequest.reviewer_id`, `CommentCreate.user_id`, `AnnouncementCommentCreate.user_id`, `QRScanSubmit.scanned_by`, ...) | schemas/report.py L307-L362 | CONFIRMED |
| B-02 | High | Read endpoints with side effects: `GET /adoptions/{id}/certificate` **creates** a certificate; `GET /reports/{id}` writes AI fields | adoptions.py L2672-L2711 | CONFIRMED |
| B-03 | Medium | Duplicated certificate/QR generation code in 4 places (review, sign, GET certificate, proceed) | adoptions.py L1398, L2580, L2680, L2735 | CONFIRMED |
| B-04 | Medium | `reports.py` is 5,095 lines; `adoptions.py` is 3,568; business rules live in route handlers with no service layer | — | RECOMMENDATION |
| B-05 | Medium | Broad `except Exception: pass` around notifications and migrations hides failures | adoptions.py, main.py | CONFIRMED |
| B-06 | Low | `print()` used for errors instead of `logger` in several modules | cloudinary_config.py, audit.py, ai_matching.py | CONFIRMED |

---

## 9. AI Findings

| ID | Severity | Finding | Evidence | Label |
|---|---|---|---|---|
| AI-01 | High | No timeout or circuit breaker on Gemini; fallback loops through models sequentially, multiplying latency | ai_suggestions.py L34-L76 | CONFIRMED |
| AI-02 | High | Anonymous AI endpoints (S-12, S-13) allow quota exhaustion | — | CONFIRMED |
| AI-03 | Medium | `is_gemini_enabled_in_db()` **fails open** (returns `True` on DB error or missing row), so the Admin "AI OFF" setting can be bypassed during DB hiccups | [ai_suggestions.py:14-31](../backend/app/utils/ai_suggestions.py#L14-L31) | CONFIRMED |
| AI-04 | Medium | User-controlled report description is interpolated into the prompt; output fields (risk, priority, behavior flags) are stored without schema validation beyond JSON parse | ai_suggestions.py L92+ | POTENTIAL (prompt injection can skew suggestions; they are advisory) |
| AI-05 | Medium | Report photos (which may include people, plates, or house numbers) are sent to an external provider with no disclosure or consent flag | ai_matching.py L174-L178 | RECOMMENDATION |
| AI-06 | Low | Vision score defaults to 50 when the model omits the field (`data.get(..., 50)`), which reads as "plausible" | ai_matching.py L192 | CONFIRMED |

**OK, important:** AI never auto-confirms. Matches are stored as `AI_SUGGESTED`; `CONFIRMED_MATCH` happens only through the staff `verify` endpoint with mandatory notes; owner feedback does not change the official status ([matches.py:1096-1175](../backend/app/routes/matches.py#L1096-L1175)). Deceased and Impounded pets are excluded from pet-match listings ([matches.py:533-538](../backend/app/routes/matches.py#L533-L538)). AI priority is stored as `ai_suggested_priority` and does not overwrite `priority_level`. The admin toggle for Gemini is admin-only and audited.

---

## 10. Adoption & Government-ID Findings

### Adoption

| ID | Severity | Finding | Evidence | Label |
|---|---|---|---|---|
| A-01 | Critical | Stage bypass to ownership transfer | C-05 | CONFIRMED |
| A-02 | Critical | Wrong-role and cross-barangay stage actions; dossier IDOR | C-06 | CONFIRMED |
| A-03 | High | `_can_manage_adoption` lets **any** role-3 staff manage adoptions (the docstring says Head Officer only), and passes when the report has no subdivision | [adoptions.py:103-118](../backend/app/routes/adoptions.py#L103-L118) | CONFIRMED |
| A-04 | High | Stage-1 approval marks verification `Matched`, `blacklist_checked=True`, `is_blacklisted=False` without performing any check (a fabricated verification record) | [adoptions.py:2020-2029](../backend/app/routes/adoptions.py#L2020-L2029) | CONFIRMED |
| A-05 | High | Stage-1 approval sets `status="Approved"`, which blocks every other applicant ("already approved") before interview or home visit | adoptions.py L1166-L1178, L2014 | CONFIRMED |
| A-06 | High | `reviewer_role` bug: `"Admin" if role_id == 1` (should be 4), so Admins are labeled "Barangay Staff" in records | [adoptions.py:2017](../backend/app/routes/adoptions.py#L2017) | CONFIRMED |
| A-07 | Medium | No max-pending-applications-per-user limit; duplicate check covers only the same animal | adoptions.py L1181-L1194 | CONFIRMED |
| A-08 | Medium | No blacklist data source exists; `is_blacklisted` is free input | — | CONFIRMED |
| A-09 | Medium | Certificate `verification_hash` is plain SHA-256 of predictable fields and is **regenerated on agreement signing**, so a previously issued QR stops matching. No public verification endpoint exists, so the QR cannot actually be verified | adoptions.py L2585-L2588, L2620-L2623 | CONFIRMED |
| A-10 | Medium | `_finalize_adoption_if_ready` creates the Pet with hardcoded `is_vaccinated=True`, `temperament="Friendly"`, `gender="Unknown"`, which are misleading health records | [adoptions.py:452-463](../backend/app/routes/adoptions.py#L452-L463) | CONFIRMED |
| A-11 | Medium | Finalization does not re-check that the animal is still available (e.g., claimed by owner meanwhile, F-02) | adoptions.py L420-L440 | CONFIRMED |
| A-12 | Medium | Monitoring: `mark-successful` does not require Day 7/14/30 check-ins to be reviewed; residents can resubmit an already-reviewed milestone | adoptions.py L3034-L3070, L3500 | CONFIRMED |
| A-13 | Low | Agreement `signature_data_url` stored without size/type validation | adoptions.py L2574 | CONFIRMED |
| A-14 | Low | Notifications go to the *first* head officer system-wide, not the animal's barangay | adoptions.py L1240-L1244 | CONFIRMED |

### Government ID

| ID | Severity | Finding | Evidence | Label |
|---|---|---|---|---|
| G-01 | High | `apply` accepts `id_photo_url` from the client with no check that it is an ID this user uploaded (any URL, or another applicant's ID URL); `secure-id-view` then returns the raw URL if it is not Cloudinary | adoptions.py L1225, [id_security.py:generate_ephemeral_id_url](../backend/app/utils/id_security.py) | CONFIRMED |
| G-02 | High | If the `type="authenticated"` upload fails, the code **falls back to a public `upload` type**, making the government ID publicly reachable | id_security.py `upload_secure_adoption_id` fallback | CONFIRMED |
| G-03 | High | `encrypt_id_number` returns **plaintext** on encryption failure; key falls back to a hardcoded default (`"straysafe_default_secure_salt_key_2026"`) or is derived from the JWT secret (rotating JWT secret breaks all ID decryption) | id_security.py `_get_encryption_key`, `encrypt_id_number` | CONFIRMED |
| G-04 | Medium | On watermark failure the function falls back to the unwatermarked image; on a second failure it returns the original bytes, **including EXIF/GPS** | id_security.py `secure_process_government_id` except-branch | CONFIRMED |
| G-05 | Medium | "5-minute" link: `cloudinary_url(..., sign_url=True, expires_at=...)` produces a signed delivery URL, and Cloudinary enforces `expires_at` only for token-based auth or private download URLs, so the link may not actually expire | id_security.py `generate_ephemeral_id_url` | POTENTIAL (verify against the Cloudinary account's auth settings) |
| G-06 | Medium | `/adoptions/upload-id` accessible to unverified accounts and every role; no rate limit; orphaned uploads never purged unless attached to an application | adoptions.py L1078 | CONFIRMED |
| G-07 | Low | No duplicate-ID-number detection across applicants (encrypted values are non-deterministic) | — | RECOMMENDATION (store a keyed HMAC of the normalized number for lookups) |

**OK:** strong file validation for ID images (extension, MIME, magic bytes, double-extension block, Pillow verify, 5 MB cap); EXIF strip and forensic watermark; Fernet encryption at rest; masked ID in general responses; `secure-id-view` RBAC with a `VIEW_GOVERNMENT_ID` security audit log; RA 10173 retention purge endpoint restricted to Head Officer and Admin; existing `tests/test_id_security.py` (7 tests).

---

## 11. Audit Log Coverage

| Event | Logged? | Notes |
|---|---|---|
| Login success/failure, logout | Yes | `log_type="security"` |
| User create / update / delete / status | Yes | **Actor often missing.** `UPDATE_USER`, `CREATE_USER`, `UPDATE_STATUS`, `DELETE_USER` don't pass `user_id`, so they fall back to the spoofable `X-User-Id` header (S-06) |
| Role change | Partial | Only as a field inside `UPDATE_USER` old/new snapshot |
| Report status change | Yes | Actor correct after `current_user` fix; anonymous endpoints (C-04) log impersonated actors |
| Holding status / delete | Yes | — |
| Adoption stage transitions | Partial | `adoption_timeline_logs` yes; `log_activity` **missing** for interview, home visit, review submit, certificate send, handover schedule, mark-successful |
| Government-ID view | Yes | — |
| Claim approval/rejection | Partial | No `updated_by` on the status history row |
| Pet ownership reassignment | Yes (assign-owner) | Not logged when done via `PUT /pets/{id}` (S-11) |
| Data export | N/A | No export feature found |
| AI setting change | Yes | — |

---

## 12. Testing Gaps

Existing: `backend/tests/` has ~11 test functions (7 for ID security, plus a few admin checks). There are also ad-hoc scripts in `backend/scripts/test_*.py` and `backend/scratch/`. The frontend has no tests.

Missing coverage, in priority order: authentication (Google, OTP, refresh, logout); per-endpoint authorization matrix (role × tenant); report status transitions; holding intake idempotency; claim → holding sync; full adoption stage gating; government-ID upload, view, and purge; AI fallback and disabled mode; upload rejection cases; audit-log actor correctness.

---

# REMEDIATION PLAN — PHASES & TASKS

**Priority scale:** P0 = fix before any deployment · P1 = this sprint · P2 = next sprint · P3 = backlog
**Rule for every task:** trace the call sites before changing anything. Don't rewrite working flows (the items marked OK above). Add the Phase 8 test for the task in the same PR.

---

## Phase 1 — Critical Security & Data Integrity

| Task ID | Priority | File / Module | Problem | Required Change | Depends on | Verification |
|---|---|---|---|---|---|---|
| P1-01 | P0 | `routes/auth.py` `/google`; `ResidentsLogin.tsx` | C-01: email-only Google login | Verify Google ID token server-side (`GOOGLE_CLIENT_ID` env); take email from the token; reject if `email_verified` is false; residents only. Replace the email modal with Google Identity Services button | — | Test: POST `/auth/google` with only `{email}` → 401; forged or expired credential → 401 |
| P1-02 | P0 | `routes/auth.py`, `schemas/auth.py` | C-02: `dev_otp` leak; OTP by `user_id` | Remove `dev_otp` from responses (allow only if `APP_ENV=development`, default off). `/complete-profile`, `/verify-otp`, `/resend-otp` require the restricted token and use its `user_id`. Allow only role 1 and `is_verified=False`. Send OTP via email/SMS provider | — | Test: resend-otp for admin `user_id` without token → 401; response JSON has no `dev_otp` |
| P1-03 | P0 | `routes/users.py`, `schemas/user.py` | C-03 / S-04: mass-assignment escalation | Create `SelfProfileUpdate`, `AdminUserUpdate`, `HeadOfficerStaffUpdate`, `PublicRegistration`. Self password change requires `current_password`. Head Officer limited to role-3 users in own barangay, cannot set role ≠ 3 | — | Test: resident PUT own `{role_id:4}` → 403/ignored; public POST `{is_verified:true}` → stored False |
| P1-04 | P0 | `routes/reports.py` (verify-incident, mark-false-alarm, merge, unmerge, disputes ×3, comments, media POST/DELETE, link-pet, create) | C-04 / B-01 | Add `Depends(get_current_staff_or_admin)` (or `get_current_user` for resident create, comment, or dispute); actor = `current_user`; remove actor IDs from request schemas; disputes: `resident_user_id = current_user.user_id` and must own the pet | P1-07 | Test matrix: anonymous → 401; resident on staff action → 403; body `user_id` ignored |
| P1-05 | P0 | `routes/announcements.py` | S-05: anonymous edit, status, media, comment, react | Staff/admin auth on write endpoints with creator or tenant scoping; `get_current_user` for comments and reactions; `feed/resident/{user_id}` → `/feed/me` | P1-07 | Anonymous PUT/PATCH → 401 |
| P1-06 | P0 | `reports.py` GET, `claims.py` GET, `rescue.py` GET, `holding.py` GET, `matches.py` GET | C-07: anonymous PII and ops data | Require auth; role-scoped filters (resident: own; leader: subdivision; staff: barangay); remove owner phone, email, and address unless the caller is the owner or authorized staff | P1-07 | Anonymous GET → 401; leader of subd A cannot list subd B |
| P1-07 | P0 | `utils/auth.py` | S-07 / S-08 / S-09 | `get_current_user` rejects `is_verified=False` tokens (add `get_onboarding_user` for onboarding routes); `get_optional_user` applies revocation and inactive checks; `verify_subdivision_scope` denies when scope is unresolvable for non-admins | — | Unit tests for each role × missing-scope case |
| P1-08 | P0 | `utils/audit.py` + all `log_activity` callers | S-06 / D-07 | Remove `X-User-Id` fallback; make `user_id` required; replace internal `db.commit()` with `db.add()` (caller commits) or use a separate session for security logs | P1-04 | Grep: no `x-user-id` in backend; test that a failed transaction doesn't persist partial rows |
| P1-09 | P0 | `routes/reports.py` analyze-media, validate-images; GET `/{id}` AI backfill | S-12 / S-13 / AI-02 | Auth + `@limiter.limit`; enforce max size before reading (stream with cap); remove AI generation from GET (background job only) | P1-07 | Anonymous → 401; 50 MB upload → 413 without full read |
| P1-10 | P0 | `main.py` `ensure_report_location_columns` | D-01: startup rewrites history | Delete the startup `UPDATE reports ...` block; if a one-time cleanup is needed, make it an idempotent migration script run once | — | Restart twice; checksum of `reports(latitude,longitude,landmark)` unchanged |
| P1-11 | P1 | `utils/cloudinary` + `frontend/src/utils/cloudinaryUpload.ts` | S-14: unsigned preset | Backend endpoint issues signed upload params (folder-locked, size-limited), or route uploads through backend; disable unsigned preset in Cloudinary | — | Upload with old preset → rejected by Cloudinary |
| P1-12 | P1 | `main.py` CORS; `utils/auth.py` cookie | S-16 / S-17 | Origins from env only in prod; drop private-IP regex outside dev; `secure` cookie from env (True in prod) | — | Preflight from unlisted origin → no ACAO header |

## Phase 2 — Authentication & Authorization (hardening)

| Task ID | Priority | File / Module | Problem | Required Change | Depends on | Verification |
|---|---|---|---|---|---|---|
| P2-01 | P1 | New `app/utils/permissions.py` | Ad-hoc role checks scattered (`role_id in [2,3,4]`) | Central helpers: `require_role(*roles)`, `require_head_officer`, `scope_query_to_user(query, user)`, `can_access_report/pet/holding/adoption` | P1-07 | Unit tests per helper |
| P2-02 | P1 | `holding.py` (PATCH, escalate, timeline, delete), `rescue.py` (create, PATCH, assign-team), `claims.py` PATCH, `matches.py` verify | S-10: no barangay scope for role 3 | Apply `verify_subdivision_scope` / P2-01 helpers to each | P2-01 | Staff of barangay A → 403 on barangay B records |
| P2-03 | P1 | `routes/pets.py` PUT | S-11 | Remove `owner_id` from `PetUpdate`; status changes only through allowed transitions (Active ↔ Lost; Deceased terminal; Impounded/Adopted via system flows only) | — | Owner PUT `{owner_id: X}` → ignored or 400 |
| P2-04 | P1 | `auth.py`, `pet_qr.py`, reports create/comments | S-18 | Add limiter to OTP, Google, refresh, QR scan submit, report create, comments, uploads | — | 429 after threshold |
| P2-05 | P2 | `User` model + JWT | S-25 | Add `token_version`; bump on password, role, or status change; check in `get_current_user` | P1-07 | Old token → 401 after role change |
| P2-06 | P2 | `pet_qr.py` public scan | S-19 | Public response: pet name, photo, "contact owner" relay (creates recovery request); mask phone; never return email or home address | — | Public scan JSON has no email/address |
| P2-07 | P2 | `pets.py` L258, `matches.py` L35 | S-23 dead `get_actor_user` | Delete | P1-08 | Grep returns nothing |
| P2-08 | P2 | `users.py` `_resolve_position_id` | S-24 | Only accept existing position IDs; admin endpoint to manage positions | P1-03 | Unknown position string → 400 |

## Phase 3 — Core Workflow Corrections

| Task ID | Priority | File / Module | Problem | Required Change | Depends on | Verification |
|---|---|---|---|---|---|---|
| P3-01 | P1 | New `app/constants/statuses.py`; `reports.py` status endpoint | F-01 / D-09 | Single source for status IDs and names plus `REPORT_TRANSITIONS: dict[int, set[int]]` (e.g., 1→{2,3,14,15,16,17}, 2→{4,14,16,17}, 4→{13,3}, 13→{5}, 5→{6,17}, 6→{7,8,12}, 7→{8,9,10,11,12}, ...; terminal: 3, 9, 10, 11, 12, 14, 18). Reject invalid transitions with 409; Admin override needs `override_reason` and is audited | P1-04 | Parametrized test over all (from,to) pairs |
| P3-02 | P1 | `claims.py` approve / `Handover Complete`; `pet_qr.py` confirm | F-02 | On approval or handover: discharge the active `HoldingAnimal` (`facility_status=3`, `discharge_date`), add a holding timeline `outcome`, close pending adoptions for that animal | P3-01 | Approved claim → holding discharged; promote → 400 |
| P3-03 | P1 | `holding.py` PATCH, `HoldingAnimalUpdate` | F-03 | Remove `intake_date` from update schema; block `facility_status` 6/7 via PATCH (6 only via `/adoptions/promote`, 7 only via adoption finalize, 3 only via claims); validate status ∈ seeded IDs | P3-01 | PATCH `{facility_status:7}` → 400 |
| P3-04 | P1 | `holding.py` `RESOLVED_STATUSES`; reports sync | F-04 | Treat Impounded (8) as **active custody**: no `discharge_date`, report status 8 (not 11) | P3-01 | Impound → counted as active; report status 8 |
| P3-05 | P1 | `reports.py` status 7/8 branch | F-05 | Emit a "Relocated/Transferred" timeline entry only when `facility_id` actually changes; status-only change → `status_change` entry | P3-01 | 7→8 same facility → exactly one new entry, type `status_change` |
| P3-06 | P1 | `reports.py` + `holding.py` intake | F-06 | Extract `ensure_holding_intake(report, actor, db)` used by both paths; add DB UNIQUE on `holding_animals.report_id` (see P4-02); catch `IntegrityError` → return existing | P4-02 | Concurrent double intake → one row |
| P3-07 | P2 | `reports.py` intake; `holding.py` metrics | F-07 | Initial facility status from explicit field in the request (staff selects condition); remove keyword inference; metrics use stored status only | — | "deadline" in description no longer yields Deceased |
| P3-08 | P2 | `matches.py` verify | F-08 | Mark the duplicate holding record with a dedicated outcome (e.g., `merged_into_holding_id`, timeline "Merged into #X"), not status 5 | P4-03 | Confirmed duplicate → not shown as "Transferred" |
| P3-09 | P2 | `claims.py` | F-09 | Claim transition map; `updated_by=current_user.user_id` on history | P3-01 | Invalid claim transition → 409 |
| P3-10 | P2 | `reports.py` escalation notify; adoption notifications | F-11 / A-14 | Notify only staff of the report's barangay (and head officer of that barangay) | P2-01 | Staff of other barangay receives nothing |
| P3-11 | P2 | `holding.py` | F-12 | `IMPOUND_DAYS` from `system_settings` / env (default e.g. 5) | — | Metrics respect setting |
| P3-12 | P3 | `pets.py` deceased | F-13 | Mark pending claims `Closed – Pet Deceased` instead of deleting | P3-09 | Claims remain queryable |

## Phase 4 — Database & Performance

| Task ID | Priority | File / Module | Problem | Required Change | Depends on | Verification |
|---|---|---|---|---|---|---|
| P4-01 | P1 | `main.py` startup | D-02 / D-03 | Introduce Alembic with a baseline from current live schema; move all `ensure_*` DDL into migrations; remove per-boot `CONVERT TO CHARACTER SET` | P1-10 | Fresh DB via `alembic upgrade head` matches live schema (`scratch/compare_all_db.py`) |
| P4-02 | P1 | migration | D-05 / F-06 | UNIQUE(`holding_animals.report_id`) (dedupe existing first); guard one Approved adoption per `holding_id` (unique generated column or transactional check with `SELECT ... FOR UPDATE`) | P4-01 | Duplicate insert → IntegrityError |
| P4-03 | P1 | migration / seed | D-04 | Seed report status 18 and facility statuses 6–8 in migrations | P4-01 | Fresh DB merge/promote works |
| P4-04 | P1 | models + routes | D-06 | Replace hard deletes of reports/holding with soft delete (`deleted_at`, `deleted_by`, reason); change `HoldingAnimal.adoptions` cascade to `save-update` only; `ON DELETE RESTRICT` for history tables | P4-01 | Delete → record hidden, history intact |
| P4-05 | P2 | models | D-08 / D-10 | `notifications.user_id ON DELETE CASCADE`; FKs for `pet_history.pet_id`, chat, `report_matches`; standardize naive-UTC datetimes via helper `utcnow()` | P4-01 | FK check script passes |
| P4-06 | P1 | list endpoints | PF-01 / PF-03 | Default `limit=50`, max 200, plus `total` header; switch heavy `joinedload` chains to `selectinload` and summary schemas for lists | P1-06 | Response time and payload measured before/after |
| P4-07 | P2 | `holding.py` metrics | PF-04 | Aggregate with SQL `COUNT ... GROUP BY`, filter active (no discharge) for occupancy | P3-04 | Metrics equal manual SQL count |
| P4-08 | P2 | `reports.py` status permission | PF-06 | Single query joining rescues → assignments | P3-01 | Query count via SQLAlchemy event logger |
| P4-09 | P3 | adoption certificates | PF-07 | Store QR payload only; render PNG on demand | P5-06 | — |

## Phase 5 — Adoption & Government-ID Security

| Task ID | Priority | File / Module | Problem | Required Change | Depends on | Verification |
|---|---|---|---|---|---|---|
| P5-01 | P0 | New `app/services/adoption_workflow.py`; all `/adoptions/*` stage endpoints | C-05 / A-01 | Define `ADOPTION_STAGES` (Application → Verification → Interview → Home_Visit → Review → Approval → Certificate → Handover → Monitoring → Successful) and `require_stage(app, expected, allowed_status)`; terminal statuses (Rejected, Cancelled, Successful) block all actions; each endpoint advances exactly one stage | P1-07 | Parametrized test: every endpoint called out of order → 409 |
| P5-02 | P0 | `_can_manage_adoption` + every staff stage endpoint | C-06 / A-02 / A-03 | Role 3 must match animal's barangay (deny if unresolvable); Head-Officer-only for approval, promotion, and final success; apply to certificate, handover, and mark-successful; remove role 2 from home-visit | P2-01 | Leader → 403; staff of other barangay → 403 |
| P5-03 | P0 | Legacy endpoints `PUT /review/{id}`, `staff-confirm-handover`, `adopter-confirm-received` | C-05 | Remove, or delegate to the gated stage functions (check frontend callers first: `grep -rn "review/\|staff-confirm-handover\|adopter-confirm-received" frontend/src`) | P5-01 | Legacy call on Interview-stage app → 409 |
| P5-04 | P0 | `GET /{id}/dossier` | C-06 | Applicant or managing staff/admin only | P5-02 | Other resident → 403 |
| P5-05 | P1 | Stage 1 approve / verify | A-04 / A-05 / A-08 | Stage 1 approve must **not** write verification results; verification endpoint records actual checks; introduce `status` values `In_Progress` vs `Approved` (approve only at Approval stage); add blacklist table (user_id, reason, set_by) checked server-side | P5-01 | Fresh app after Stage 1 has no "Matched" verification |
| P5-06 | P1 | Certificates | A-09 / B-02 / B-03 | Single `issue_certificate(app)` called only at Approval→Certificate; `verification_hash = HMAC-SHA256(server_secret, canonical_payload)`; never regenerate after issuance; add public `GET /adoptions/certificates/verify/{certificate_number}?h=` returning minimal data; GET certificate is read-only | P5-01 | QR verify returns valid; tampered hash → invalid |
| P5-07 | P1 | `_finalize_adoption_if_ready` | A-10 / A-11 | Copy real values (vaccination unknown → `False`/null, temperament from holding notes); lock animal row and require `facility_status == 6` and no active claim | P3-02 | Finalize on claimed animal → 409 |
| P5-08 | P1 | Monitoring | A-12 | `mark-successful` requires Day 7/14/30 logs `Reviewed`; milestone resubmission only when `status in (Pending, Returned)` | P5-01 | Early mark-successful → 409 |
| P5-09 | P1 | `apply` | A-07 / G-01 / S-07 | Verified residents only; max N (config, e.g. 3) pending applications per user; `id_photo_url` replaced with `id_upload_id` referencing a server-side `pending_id_uploads` row owned by the user (single use) | P1-07 | Apply with another user's upload id → 403 |
| P5-10 | P0 | `utils/id_security.py` | G-02 / G-03 / G-04 | Remove public-upload fallback (fail with 503); require `ID_ENCRYPTION_KEY` at startup (no default, no JWT-derived key, plus key-rotation plan); encryption failure → raise; watermark/EXIF-strip failure → reject upload | — | Unit tests: missing key → startup error; Cloudinary auth failure → 503, nothing public |
| P5-11 | P1 | `generate_ephemeral_id_url` | G-05 | Verify expiry behaviour on the Cloudinary account; switch to `cloudinary.utils.private_download_url(..., expires_at=...)` or token-based auth so links truly expire | P5-10 | Fetch URL after TTL → 401/403 |
| P5-12 | P2 | `/upload-id`, purge | G-06 | Verified residents only, rate limit, scheduled purge of unattached uploads after 24 h; purge also deletes Cloudinary asset | P5-09 | Orphan purged in test |
| P5-13 | P2 | `upload-home-visit-photos`, agreement signature | S-15 / A-13 | Use `read_and_validate_upload(allowed={'Image'})`; validate signature data URL (PNG, ≤ 200 KB) | — | Non-image → 400 |
| P5-14 | P2 | `reviewer_role` | A-06 | Fix mapping (`4 → Admin`, head officer → "Barangay Head Officer", else "Barangay Staff") in one helper | — | Admin approval stored as "Admin" |
| P5-15 | P3 | ID duplicate detection | G-07 | Store `id_number_hmac` for lookup; flag (not block) reuse across applicants for staff review | P5-10 | Same ID on two applicants → flag shown |

## Phase 6 — AI & Matching

| Task ID | Priority | File / Module | Problem | Required Change | Depends on | Verification |
|---|---|---|---|---|---|---|
| P6-01 | P1 | `utils/ai_suggestions.py` | AI-01 / PF-02 | Add `request_options={"timeout": 15}`; total budget across fallbacks; simple circuit breaker (skip Gemini for N min after repeated 429/5xx); run in threadpool or background task | — | Mock slow model → request returns within budget with rule-based fallback |
| P6-02 | P1 | `is_gemini_enabled_in_db` | AI-03 | Fail **closed** (False) on error or missing row; cache setting for 60 s | — | DB error → no external call |
| P6-03 | P2 | AI output handling | AI-04 / AI-06 | Validate AI JSON with a Pydantic schema (enums, 0–100 ints); missing score → treat as "Cannot Determine" (no match row), not 50; delimit user text in prompt and instruct model to ignore embedded instructions | P6-01 | Malformed AI JSON → stored as null suggestion |
| P6-04 | P2 | `ai_matching.fetch_image_for_entity` | S-20 | Allow only Cloudinary host over https; remove local filesystem branch; cap download size | — | Local path / foreign URL → None |
| P6-05 | P2 | Privacy | AI-05 | Admin-visible disclosure that photos go to Google Gemini; setting to disable vision while keeping attribute matching | P6-02 | Setting off → no images sent |
| P6-06 | P3 | Matching labels | — | Ensure every UI/API label reads "AI Suggested Match / Potential Match" until staff `CONFIRMED_MATCH` (currently correct in backend; verify frontend copy) | — | UI review checklist |

**Keep as-is:** human-only confirmation, deceased/impounded exclusions, `AI_SUGGESTED` default status, owner feedback not altering official status.

## Phase 7 — Frontend / UI / UX

| Task ID | Priority | File / Module | Problem | Required Change | Depends on | Verification |
|---|---|---|---|---|---|---|
| P7-01 | P0 | `ResidentsLogin.tsx` | FE-01 / FE-02 | Real Google Identity Services button sending `credential`; remove dev OTP display | P1-01, P1-02 | Manual + e2e login test |
| P7-02 | P1 | 13 hardcoded URLs | FE-03 | Replace `fetch('http://127.0.0.1:8000/...')` with the shared `api` instance | — | `grep -rn "127.0.0.1:8000\|localhost:8000" frontend/src` → only `utils/api.ts` default |
| P7-03 | P1 | Adoption UI (`BrgyAdoptions.tsx`, `AdoptionStaffStageModals.tsx`, `MyAdoptionApplications.tsx`) | C-05 follow-up | Drive button availability from a backend-provided `allowed_actions` list per application (so UI and server gates match); handle 409 stage errors | P5-01 | Out-of-order buttons hidden; 409 shows message |
| P7-04 | P1 | Callers of removed/changed endpoints | P1-04 / P5-03 | Remove `user_id`/`reviewer_id` from request bodies; update to new endpoints | P1-04, P5-03 | Network tab: no actor ids in payloads |
| P7-05 | P2 | Token storage | FE-04 / S-16 | Keep access token in memory (context) and rely on httpOnly refresh cookie; stop persisting user JSON with role | P1-12 | Reload → silent refresh works; no token in localStorage |
| P7-06 | P2 | Status labels | FE-05 | Fetch status catalog from backend (`/meta/statuses`) generated from P3-01 constants | P3-01 | Labels identical across pages |
| P7-07 | P2 | Polling / ProtectedRoute | PF-05 | Verify session once per app load plus on 401; consolidate pollers into one interval hook with visibility pause | — | Request count per navigation drops |
| P7-08 | P3 | Large components | PF-08 / FE-06 | Split top 5 files into data hooks + presentational components incrementally (no behaviour change) | P7-03 | Snapshot/e2e unchanged |

## Phase 8 — Testing & Final QA

| Task ID | Priority | Scope | Required Tests | Depends on | Verification |
|---|---|---|---|---|---|
| P8-01 | P0 | Test harness | Pytest fixtures: test DB (MySQL container or SQLite where compatible), factory users for roles 1–4 in two barangays/subdivisions, token helper | — | `pytest` runs in CI |
| P8-02 | P0 | AuthN | Google token verification, OTP flows (no leak, token-bound), refresh rotation, logout revocation, inactive and unverified accounts | P1-01, P1-02, P1-07 | Green |
| P8-03 | P0 | AuthZ matrix | Auto-generated test: for every route × role × tenant (own/other) assert expected 200/401/403 (use the AST endpoint inventory from this audit as the source list) | P1-04..P1-06, P2-02 | Matrix fully green |
| P8-04 | P1 | Report workflow | Transition table, duplicate history suppression, single relocation event, intake idempotency (concurrent), resolution requires pet/holding | P3-01, P3-05, P3-06 | Green |
| P8-05 | P1 | Holding & claims | Occupancy equals active animals; claim approval discharges holding; impound remains active; PATCH cannot set 6/7 | P3-02..P3-04, P4-07 | Green |
| P8-06 | P0 | Adoption | Full happy path Stage 1→10; every out-of-order call → 409; role/tenant denial; finalize locking; certificate verify endpoint; monitoring gate | P5-01..P5-08 | Green |
| P8-07 | P0 | Government ID | Extend `test_id_security.py`: missing key fails, no public fallback, ownership-bound upload id, view audit log written, purge removes asset | P5-09..P5-12 | Green |
| P8-08 | P1 | Uploads | Wrong magic bytes, double extension, oversize (streamed), non-Cloudinary URL rejection | P1-09, P5-13 | Green |
| P8-09 | P1 | AI | Gemini disabled → no call; timeout → fallback; malformed JSON; no auto-confirmation path exists | P6-01..P6-03 | Green |
| P8-10 | P1 | Audit logs | Each sensitive action writes one log with correct actor (never header-derived); no partial commits | P1-08 | Green |
| P8-11 | P2 | Frontend e2e (Playwright) | Login per role, report → rescue → holding → adoption → monitoring, claim flow, QR scan | Phase 7 | Green in CI |
| P8-12 | P2 | Regression & data checks | Run `scratch/compare_all_db.py` against migrated DB; SQL integrity checks (orphans, duplicate active holdings, adoptions with Approved status on non-6 animals) | P4-01..P4-05 | Zero violations |

---

## Suggested Execution Order

1. **Week 1 (stop the bleeding):** P1-01, P1-02, P1-03, P1-07, P1-04, P1-05, P1-06, P1-08, P1-09, P1-10, P5-10, plus P8-01/P8-02/P8-03 scaffolding.
2. **Week 2:** P5-01 → P5-04 (adoption gates), P2-01/P2-02, P3-01, P7-01, P7-04.
3. **Week 3:** P3-02 → P3-06, P4-01 → P4-04, P5-05 → P5-09.
4. **Week 4+:** Remaining P2/P3 items, Phase 6, Phase 7 polish, full Phase 8 suite.

## Items Explicitly Not to Rewrite

- Upload validation core (`utils/uploads.py` `read_and_validate_upload`, `verify_file_signature`)
- Government ID image validation and watermark pipeline (only fix fallbacks)
- JWT/refresh rotation core and revocation table
- Atomic report claim (`with_for_update`)
- AI match human-verification design and exclusions
- Global SQL/5xx error masking handlers
