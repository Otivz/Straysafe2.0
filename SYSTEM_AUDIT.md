# StraySafe 2.0 — System Audit

**Date:** October 20, 2026  
**Branch:** `multipleanimalreport` (includes the uncommitted work from this session)  
**Scope:** every backend module (FastAPI) and frontend page (React), automated health checks, and a bug hunt.

> **How this audit was done.** Automated checks were run on the whole codebase: the backend test suite, a compile of every
> backend file, a full app start-up, the frontend type check, production build and linter, and scripted scans of every API
> endpoint (login checks, user-ID checks). Suspected bugs were then confirmed by reading the code, and some by checking the
> live database **read-only**. **Not done:** clicking through every screen in a browser. Section 6 lists what still needs a
> manual run.

---

## 1. Summary

| Area | Result |
|---|---|
| Backend tests | **86 / 86 test files pass** (after fixes 4.1–4.4; was 84 / 84 at the audit) |
| Backend code | Compiles; the app starts with **311 routes** loaded |
| Frontend type check | **Pass** |
| Frontend production build | **Pass** |
| Running servers | Backend (:8000) and frontend (:5173) both respond |
| Secrets | `.env` is not in git; the backend refuses to start without a JWT secret |

**Bugs found: 9** (1 critical, 3 high, 3 medium, 2 low). See section 4.  
**Fixed since the audit: 6** (4.1 critical; 4.2, 4.3, 4.4 high; 4.5, 4.6 medium). **Still open: 3** (4.7 before deployment;
4.8 data clean-up; 4.9 code quality).  
**Fixed during this session before the audit: 24** (section 5).

Top three to fix before the defence:

1. **Announcements can be edited without logging in** (critical, security).
2. **The Admin incident page can crash on load** (high).
3. **Adoption schedule times show 8 hours early** (high).

---

## 2. Feature inventory

### 2.1 By role (frontend pages)

| Role | Pages | Main features |
|---|---|---|
| **Resident** | 19 | Report a stray (photo/video + AI check), home feed, my reports and their timeline, Pet Records (register, update, QR tag), lost-pet report, pet claims, match review, adoption catalog and application, my applications and adoption journey, certificate check, QR scan pages, profile and settings |
| **Subdivision Leader** | 16 | Dashboard, resident reports (claim, verify, escalate, transfer, merge, **split multi-animal reports**), report view, holding facility, pet records (and removed records), pet claims, escalated missions, endorsement archive, hazard alerts, messages, history, profile and settings |
| **Barangay Staff** | 15 | Dashboard, rescue requests, report view, holding facility, adoptions (full pipeline), **adoption tasks**, pet records, pet claims, community alerts, personnel management, messages, history, profile and settings |
| **Admin** | 11 | Dashboard, heat map, incident reports, report view, user management, pet management, pet records, warnings, **audit logs** (with the multi-animal filter), account settings |

The frontend has 95 routes.

### 2.2 By backend module

| Module | Endpoints | What it does | Status |
|---|---|---|---|
| Reports (`reports.py`) | 41 | Create, AI media check, claim, verify, escalate, transfer, merge/unmerge, disputes, visibility | Working; tested |
| Multi-animal split (`report_split.py`) | 5 | Split a group report into per-animal records, undo, count note, photo replace | Working; **108 checks** |
| AI matching (`matches.py`) | 21 | Duplicate sightings, pet look-alikes, owner verification, case review | Working; tested |
| Pets (`pets.py`, `pet_qr.py`, `pet_ownership.py`) | 51 | Pet Records, photos, duplicates/merge, QR tags and scans, ownership claims | Working; tested |
| Holding (`holding.py`) | 9 | Intake, per-facility stay clock, metrics, escalate to Barangay, timeline | Working; **17 checks** |
| Rescue (`rescue.py`) | 8 | Barangay rescue requests, dispatch, pickup | Working; tested |
| Claims (`claims.py`, `report_returns.py`) | 10 | Owner claims with evidence, returns to owner | Working; tested |
| Adoptions (`adoptions.py`, `adoption_tasks.py`, `adoption_chat.py`, `adoption_certificates.py`) | 66 | Catalog, application, verify, interview, home visit, review, agreement, certificate, handover, monitoring, staff tasks, chat | Working; tested. **Times bug, see 4.3** |
| Chat (`chat.py`) | 13 | Report and match conversations | Working |
| Notifications and push (`notifications.py`, `push.py`) | 19 | In-app, email (Gmail SMTP) and web push notifications, preferences | Working |
| Announcements (`announcements.py`) | 11 | Community alerts, comments, reactions | **Security bug, see 4.1** |
| Auth and users (`auth.py`, `users.py`) | 27 | Login, Google sign-in, email OTP, password reset, sessions, accounts | Working; rate-limited |
| Warnings (`warnings.py`) | 8 | Owner warnings | Working |
| Admin (`admin.py`, `audit_logs.py`, `ai_jobs.py`, `sidebar.py`) | 5 | Dashboard stats, audit log, AI job status, sidebar badges | Working |
| Landmarks (`landmarks.py`) | 8 | Map landmarks, holding facilities, Barangay HQ | Working |

### 2.3 AI features

| Feature | How | Notes |
|---|---|---|
| Animal detection (photo/video) | YOLOv8 | Video counts the most animals in **one frame**; overlapping boxes count once (fixed this session) |
| Photo authenticity and details | Google Gemini Vision | Colour, breed, size, risk; AI-generated photo check |
| Duplicate and look-alike matching | Gemini + attribute scoring | AI only suggests; staff confirm |
| Background AI jobs | `python -m app.ai_worker` | Must run alongside the backend |

---

## 3. Health checks (details)

| Check | Command | Result |
|---|---|---|
| Backend tests | every `backend/tests/test_*.py` | 84 / 84 pass |
| Backend compile | `python -m compileall app` | Pass |
| App start-up | import `app.main` | 311 routes |
| Type check | `npx tsc -p tsconfig.app.json --noEmit` | Pass |
| Build | `npx vite build` | Pass |
| Linter | `npx eslint .` | ~1,950 findings, mostly style (see 4.9); **2 real crash bugs** (4.2) |
| Login check scan | script over all 311 routes | 33 public endpoints; 28 are meant to be public, 5 are not (4.1) |
| User-ID scan | checked every `/{user_id}` and `/{owner_id}` route | All check the caller (own data, or staff within their area) |

---

## 4. Bugs found (open)

### 4.1 CRITICAL — Announcements can be changed without logging in — ✅ FIXED

> **Fixed:**
> - Edit, status and media need an official who may manage the alert: an admin, the author, Barangay staff of its
>   barangay, or the Leader of its subdivision.
> - Comments and reactions need a login and are always saved as the logged-in user.
> - The two status routes are merged into one that checks the status and logs who changed it. It still accepts
>   `?status=` (used by the Barangay alerts page) and a JSON body.
> - Edit can no longer move an alert outside the editor's area, checks the status, and logs the real editor.
>
> Tested in `backend/tests/test_announcement_security.py` (22 checks).

**Where:** [backend/app/routes/announcements.py](backend/app/routes/announcements.py)

These endpoints have **no login requirement**, and there is no app-wide login check:

| Endpoint | Line | Risk |
|---|---|---|
| `PUT /announcements/{id}` | 443 | Anyone can rewrite an alert's title and content |
| `PATCH /announcements/{id}/status` | 151 | Anyone can publish, archive or unpublish an alert |
| `POST /announcements/{id}/media` | 292 | Anyone can upload files to an alert |
| `POST /announcements/{id}/comments` | 320 | Comments as **any user**: `user_id` comes from the request body |
| `POST /announcements/{id}/react` | 361 | Reactions as any user (same reason) |

**Impact:** fake or edited community alerts (e.g. a false rabies warning), and comments posted in someone else's name.

**Fix:** add `current_user = Depends(get_current_user)` to all five. Officials only for edit, status and media, within their
subdivision or barangay. For comments and reactions, use `current_user.user_id` and ignore the body's `user_id`.

**Also:** `PATCH /{id}/status` is defined **twice** (lines 151 and 399). The first one wins: it accepts any status text and
writes no audit log. The validated, logged version at line 399 never runs. Delete the first one.

### 4.2 HIGH — Two pages break React's hook rules and can crash — ✅ FIXED

> **Fixed:**
> - AdminReportView's three late `useMemo`s are now plain calculations.
> - PetDetailPanel's `useEffect` moved above `if (!pet) return null`.
>
> The linter now reports **0** hook-order errors in the whole frontend.

React needs the same hooks in the same order on every render. These components return early **before** some hooks, so
when that early return switches on or off, React stops with *"Rendered more hooks than during the previous render"* and
the page goes blank.

| File | Early return | Hook after it |
|---|---|---|
| [AdminReportView.tsx](frontend/src/pages/Admin/AdminReportView.tsx) (Admin, `/admin/incidents/:id`) | `if (loading)` line 543, `if (!report)` line 560 | `useMemo` lines 607, 615 |
| [PetDetailPanel.tsx](frontend/src/components/PetRecords/PetDetailPanel.tsx) | `if (!pet) return null` line 604 | `useEffect` line 676 |

**Impact:** the Admin incident page goes from "loading" to "loaded" on every visit, which is exactly the switch that
triggers the crash. Verify in a browser.

**Fix:** move those hooks above the early returns (they already handle a missing report or pet inside).

### 4.3 HIGH — Adoption schedule times are saved in UTC and shown 8 hours early — ✅ FIXED

> **Fixed:**
> - Times picked in the forms are converted to local time when saved, using one shared type, `LocalDateTime` in
>   `backend/app/utils/local_time.py`. That covers the interview schedule and conducted time, home visit, handover
>   schedule and completion, monitoring date, community alert expiry and task due time.
> - The adoption code's own timestamps use the database clock (`db_now`) instead of UTC (21 places).
> - The frontend needed no change.
>
> **Existing records keep their old (8 h early) values;** correct them only after a preview. Tested in
> `backend/tests/test_adoption_local_times.py` (11 checks).

The database stores local time (UTC+8), and the pages show stored times as local. But the adoption forms send picked times
in UTC (`toISOString()`), and the adoption backend saves its own timestamps in UTC (21 places in
[adoptions.py](backend/app/routes/adoptions.py)).

| Affected time | Sent from |
|---|---|
| Interview schedule | `AdoptionStaffStageModals.tsx` line 347 |
| Interview conducted at | line 377 |
| Home visit schedule | line 1032 |
| Handover schedule | lines 2194, 2387 |
| Monitoring date | `AdoptionMonitoringModal.tsx` 123, `BrgyAdoptions.tsx` 545 |
| Community alert expiry | `BrgyCommunityAlerts.tsx` 127, `BrgyDashboard.tsx` 606 |
| Approval, review and handover timestamps | `adoptions.py` (`datetime.now(timezone.utc)`) |

**Seen:** "Scheduled: Oct 20, 01:11 PM" for an interview set at about 9:11 PM.

**Fix:** convert incoming times to local in the request schemas (as already done for task `due_at`/`scheduled_at`), and use
the database clock (`db_now()`) for server timestamps. Existing records stay 8 hours off unless corrected; preview first.

### 4.4 HIGH — A group report can be closed by hand while an animal is still open — ✅ FIXED

> **Fixed:**
> - One guard covers every route (status update, false alarm, cancel, disputes, rescue). A group report can't be resolved,
>   dismissed or marked not found while an animal record is open; the message lists the open animals.
> - Impounding the whole group still works, and the group still closes by itself when its last animal closes.
>
> **Also fixed:** the audit-log helper swallowed this refusal, so the officer saw "success" with nothing saved. Deliberate
> refusals now reach the user. Tested in `test_multi_animal_split.py` (114 checks).

**Where:** status update in [reports.py](backend/app/routes/reports.py) (`update_report_status`).

Resolving checks that each animal has a record, but not that each animal's **case is closed**. False Alarm, Cannot Be
Found, Deceased and Rejected have no check at all on a group report.

**Impact:** report #101 could show "closed" while #104 is still in holding.

**Fix:** refuse closing a group report while an animal record is open ("close each animal instead"). The group then
closes itself.

### 4.5 MEDIUM — Report chat threads show the report's first file, which may not be a photo — ✅ FIXED

> **Fixed:** chat threads use the report's main photo, then any other image, never a document or video
> (`_report_thumb` in `chat.py`). Tested in `test_qr_limit_and_chat_thumb.py`.

**Where:** [chat.py](backend/app/routes/chat.py) lines 1277 and 1414 use `report.media[0]`. That can be evidence, a
document or a screenshot. **Fix:** use the report's main photo (`primary_images` in `report_split.py`).

### 4.6 MEDIUM — Public QR-scan form has no rate limit — ✅ FIXED

> **Fixed:**
> - `POST /pet/scan/{token}/submit` allows 10 a minute per device; the 11th gets "429 Too Many Requests".
> - Both scan screens tell the finder to wait a minute instead of "try again".
>
> Tested in `test_qr_limit_and_chat_thumb.py`.

**Where:** `POST /pet/scan/{token}/submit` in [pet_qr.py](backend/app/routes/pet_qr.py) line 236. It's public by design
(a finder may not have an account), so it can be spammed. **Fix:** add `@limiter.limit("10/minute")`.

### 4.7 MEDIUM — CORS accepts any local-network address with credentials

**Where:** [main.py](backend/app/main.py) about line 1655. `allow_origin_regex` accepts every `192.168.*`, `10.*` and
`172.16–31.*` address. That's fine for the demo on a LAN, but **tighten it to the real domain before deployment**.

### 4.8 LOW — Old data from before this session's fixes

- **Discharge dates saved before today's fix** are 8 hours early, so finished stays look 8 hours short.
- **Report #119's photo is a screenshot of a sign-up form**, showing an email and password field. Officials can see it.
  Replace it with **Replace photo**.

Nothing in the database was changed by this audit.

### 4.9 LOW — Code quality (no visible bug)

- **Linter, about 1,950 findings:**
  - 1,519 `no-explicit-any` (loose types);
  - 146 `set-state-in-effect`;
  - 116 `exhaustive-deps`;
  - 32 `immutability` (e.g. `QRScannerModal.tsx` 235: functions used before they're declared);
  - 10 `purity` (`Date.now()` during render);
  - 9 `static-components` (the certificate builds components while rendering).

  None stops the build or the app. Cleaning them up is a separate, codebase-wide task.
- **Debug output:** 105 `print()` calls in the backend and 6 `console.log` in the frontend. The
  `[analyze-media] … detector=… Gemini=…` line was added on purpose this session and can be removed before release.
- **Swallowed errors:** 37 `except …: pass` blocks hide failures silently. Log them instead.
- **Dead code:** a `{false && (…)}` modal in `AdminReport.tsx` around line 1282.

---

## 5. Fixed during this session

| # | Area | Fix |
|---|---|---|
| 1 | Admin | Audit Logs filter "Multi-animal & photo overrides"; animal-record count on the dashboard |
| 2 | Admin map | One pin per incident (no extra pins for animal records) |
| 3 | Multi-animal | A pet record can't be added to a group report; it goes on each animal record |
| 4 | Multi-animal | Escalate/resolve a group once every animal has its own record |
| 5 | Multi-animal | A group and its own animals are never flagged as duplicates of each other |
| 6 | Multi-animal | The duplicate banner names the *other* report (it showed "#101" on #101) |
| 7 | Multi-animal | "AI per animal" section on group reports |
| 8 | Multi-animal | The split now shows in the timeline (it showed as "Incident Verified") |
| 9 | Multi-animal | An impounded animal counts as finished for its group |
| 10 | Holding | Each facility has its own stay clock (Subdivision vs Barangay), including moves made before the fix |
| 11 | Holding | Cards show the stay at the current facility; "Subdivision Stay" no longer shown for Barangay animals |
| 12 | Holding | Stay times, metrics, overdue notice and adoption stay limit use the database clock (were 8 h off) |
| 13 | Holding | "Discharged Today" and the history list include impounded and released animals |
| 14 | Holding | Cards and the Manage pop-up show the pet record photo |
| 15 | Adoption | Chat, task card, journey and adopter's pet record use the pet record photo |
| 16 | Adoption | Task due time no longer saved 8 hours early |
| 17 | Adoption | Meeting links in the interview card and in chats are bold and clickable |
| 18 | Adoption | Certificate hides "Sex" when unknown |
| 19 | AI | A one-animal video no longer says "10+ animals"; one animal boxed twice counts once |
| 20 | Pets | Estimated Age is optional for residents |
| 21 | Auth | Demo OTP removed; real email codes |
| 22 | Pet registration | Crop the pet from a shared photo, override with a reason, "register another animal from this photo" |
| 23 | Multi-animal | Status, visibility and priority sync; combined reporter notifications; undo; count note |
| 24 | Lists | One card per incident on resident home, Subd, Brgy and Admin lists |

---

## 6. Not verified (manual checks before the defence)

1. **Restart the backend and the AI worker** (`python -m app.ai_worker`). Several fixes need it.
2. **Browser run-through per role:** resident report → leader verify → split → escalate → Barangay pickup → holding →
   adoption → handover → certificate.
3. **The Admin incident page** (`/admin/incidents/<id>`): check whether bug 4.2 shows up.
4. **Phone-size screens:** cropper, holding cards, chat.
5. **Push and email delivery** on the demo machine.

---

## 7. Recommended order of work

| Priority | Task | Size |
|---|---|---|
| 1 | ~~Lock down announcement endpoints; remove the duplicate status route (4.1)~~ ✅ Done | Small |
| 2 | ~~Move the hooks in AdminReportView and PetDetailPanel (4.2)~~ ✅ Done | Small |
| 3 | ~~Adoption times to local time (4.3)~~ ✅ Done | Medium |
| 4 | ~~Block closing a group report while an animal is open (4.4)~~ ✅ Done | Small |
| 5 | ~~Rate-limit QR scan submit (4.6); main photo in report chats (4.5)~~ ✅ Done | Small |
| 6 | Replace report #119's screenshot; decide on correcting old 8-hour-off records (4.8) | Small |
| 7 | Before deployment: tighten CORS (4.7), remove debug prints (4.9) | Small |

---

## 8. Checklist

Tick each item when it's done.

### 8.1 Bugs to fix

- [x] **4.1** Announcements: require login on edit, status, media, comments and reactions
- [x] **4.1** Announcements: take the commenter or reactor from the login, not the request body
- [x] **4.1** Announcements: merge the duplicate `PATCH /{id}/status` routes into one safe route
- [x] **4.2** AdminReportView: no hooks after the early returns
- [x] **4.2** PetDetailPanel: move the `useEffect` above `if (!pet) return null`
- [x] **4.3** Adoption schedule times saved and shown in local time (interview, home visit, handover, monitoring)
- [x] **4.3** Community alert expiry saved in local time
- [x] **4.3** Adoption server timestamps use the database clock
- [x] **4.4** Block closing a group report by hand while an animal record is open
- [x] **4.5** Report chats show the report's main photo
- [x] **4.6** Rate-limit the public QR-scan form
- [ ] **4.7** Tighten CORS to the real domain (before deployment)
- [ ] **4.9** Remove debug `print()` / `console.log`, including the `[analyze-media]` count line (before release)

### 8.2 Data clean-up (preview first, then approve)

- [ ] Replace report #119's screenshot photo with a real photo of the cat
- [ ] Decide whether to correct old records that are 8 hours off (discharge dates, adoption times, task due time)

### 8.3 Manual checks before the defence

- [ ] Restart the backend
- [ ] Restart the AI worker (`python -m app.ai_worker`)
- [ ] Resident: report a stray with a photo and with a video (AI animal count correct)
- [ ] Subdivision Leader: claim, verify, split a multi-animal report, add each animal's record, escalate
- [ ] Barangay Staff: approve, dispatch, pick up; check the holding card (Barangay stay, pet record photo)
- [ ] Holding: impound an animal; "Discharged Today" counts it; group report resolves
- [ ] Adoption: apply → verify → interview (link bold, time correct) → home visit → certificate → handover
- [ ] Admin: open an incident (`/admin/incidents/<id>`) and confirm the page doesn't go blank
- [ ] Admin: Audit Logs "Multi-animal & photo overrides" filter
- [ ] Phone-size screens: cropper, holding cards, chat
- [ ] Push and email notifications arrive on the demo machine
- [ ] Run the backend tests, type check and build once more after the fixes
