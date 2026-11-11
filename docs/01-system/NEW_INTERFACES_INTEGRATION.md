# New Admin and Resident interfaces: connection to the backend

Status: **Current** (2026-11-10). The Subdivision Leader (`/subd-admin`) and Resident (`/resident-app`) interfaces run on the real backend and are the only interfaces: the legacy portals, the mock-data previews and the `VITE_NEW_UI` switch were removed on 2026-11-10 ([change record](../05-operations/agents/feature-updates/2026-11-10_1456_final-legacy-repository-cleanup.md); the earlier readiness analysis is in [CUTOVER_READINESS.md](../05-operations/CUTOVER_READINESS.md)).

## How the screens run

StraySafe 2.0 has exactly two interfaces. Both run on the real API and are role-guarded; there is no sample data, no preview mode and no legacy portal any more ([change record](../05-operations/agents/feature-updates/2026-11-10_1456_final-legacy-repository-cleanup.md)).

| Interface | Address | Who may sign in | Where it runs |
|---|---|---|---|
| **Subdivision Leader** | `/subd-admin` | Subdivision Leader (role 2) | the web build, always (and `npm run dev`) |
| **Resident** | `/resident-app` | resident (role 1) | the web build and the **Android app** |

Every other web address redirects (`frontend/src/main.tsx`): `/`, `/login`, `/resident-home` and `/resident/*` lead to the Resident app, `/staff/login`, `/staff/*`, `/subd/*` and `/subd-messages` to the Leader app, and anything else to the Resident app. The **Android app** mounts only the Resident interface: `vite build --mode android-debug` (the debug APK the manual GitHub Actions workflow makes, with a Connection Settings screen that changes the backend address on the phone) or `--mode android` (release-style, one fixed HTTPS address); see [ANDROID_RESIDENT_APP.md](../05-operations/ANDROID_RESIDENT_APP.md). A role that signs in at the wrong address is refused and the session the server opened is closed. The system Administrator (role 4) has no screen yet.

The bases start with `/subd` and `/resident` on purpose, so the shared API client (`utils/api.ts`) finds the right stored session from the path. `src/live/config.ts` holds the bases.

## One set of screens per interface

`AdminApp` and `ResidentApp` take a `mode` object (`gateway` and `DataProvider`; the Resident one also carries the Android debug build's Connection Settings). The entry components `AdminLiveRoot` and `ResidentLiveRoot` build it, and shared screens never import an entry's code. The mock-data entries (`AdminRoot`, `ResidentRoot`), their sample accounts, seed data, simulation tools and preview reducers were removed on 2026-11-10. `src/preview/` now holds only code both interfaces share (reporting-area helpers, formatters, map components, design tokens); its name is a leftover.

## Authentication (the existing contract, nothing new)

- **Leader sign-in** uses `POST /auth/login {email, password}` and stores `access_token` and `staff_user` in `sessionStorage`. Session restore asks `GET /auth/verify-session`, and only when a session was actually restored (a first-time visitor is asked nothing and is told nothing about an expired session). Renewal is the shared client's job (`utils/api.ts`, from the httpOnly refresh cookie); a session it cannot renew raises `SESSION_ENDED_EVENT` and the screens show the expired-session dialog. Sign-out is `logoutUser()`. A resident or administrator who signs in at the Leader screen is refused and the session the server just opened is revoked again.
- **Resident sign-in and sign-up**: `POST /users/` (role 1, unverified), `POST /auth/login` (a restricted token and `requires_otp`), `POST /auth/verify-otp` and `/auth/resend-otp` with that token (kept in memory only), session in `localStorage`. The server signs in by **email only**; a mobile number cannot be used.
- **Password recovery** is the emailed 6-digit code (`/auth/forgot-password`, `/auth/reset-password`). Changing a password ends every session (`endsSessionOnPasswordChange`), and the screens say so.

## The data layer

Each live provider keeps the preview provider's contract (`state`, async `dispatch`, load `status`) and adds what a real server needs: `issues` (what could not be read), `loadError`, `loadCase`/`loadReport`/`loadNotice` with a per-item status, `capabilities`, and `fetchAnalytics` (Admin).

- **Summaries first, detail on demand.** Admin: `GET /cases/summaries` (paged), `GET /cases/work-queue`, the resident and pet directories, notices, notifications, settings and the reporting area (`GET /reports/coverage-area`, which the case maps draw) load in parallel; `GET /cases/{id}`, `GET /reports/{id}` and the notes load when a case is opened. Resident: own reports (`GET /reports/?mine=true`), active and own notices, claims, pets, notifications and settings load in parallel; a report's case chat and a notice's sightings load when opened.
- **The server decides.** Every action is one or a few requests (`live/actions.ts`); nothing is applied optimistically (the one exception is the resident's read marks, which are cosmetic and corrected by the next read). After a change the provider re-reads what it touched. A refresh that fails after a saved change never turns the change into an error, because a second submit would duplicate it; a follow-up that fails (a photo, the notice a report asks for) is reported beside the result.
- **No substitute data.** A failed request leaves its part empty and says so (a banner, an error state, a per-case message). There is no fallback to sample data in live mode. The sample reporting area, landmarks, names and sign-in helpers belong to the preview only: the connected Resident app replaces the area and the landmark list with the server's (an empty landmark list and a banner if they cannot be read), the connected Admin replaces the area, and the sign-in welcome line is neutral until someone has signed in and the subdivision is known.
- **Times.** The server stores local wall-clock times without an offset. The screens read them as the device's local time, exactly as the legacy screens do (`RelativeTimestamp`), so the database server's time zone and the users' devices are expected to be in the subdivision's time zone (Asia/Manila).
- **Adapters** (`live/adapters.ts`, pure, unit-tested) own the awkward parts: status and category names, naive server datetimes (`live/dates.ts`), case references `SS-<year>-<id padded to 4>` (`live/refs.ts`; the number identifies the case, the year is for reading), referral organisations, the lossy notification flags (they round-trip: what is saved is what is read back), titles made from the report (a report has none).
- **Errors** are an `AdminApiError` (`network` | `session` | `server`) carrying the server's own sentence (`live/http.ts` on top of the existing `api` client).

## What each Admin action does on the server

| Screen action | Request(s) |
|---|---|
| Move status, change priority, add a note | `POST /cases/{id}/status`, `PUT /cases/{id}/priority`, `POST /cases/{id}/notes` |
| Save assessment, identity, ownership | `PUT /cases/{id}/assessment` (only the parts that changed are sent) |
| Follow-ups, owner contacts | `POST /cases/{id}/followups` (+ `/complete`, `/cancel`), `POST /cases/{id}/contacts` |
| Issue a warning | `GET /warnings/suggestion` (the tier follows the history only the server holds), then `POST /warnings/` |
| Compliance observation | `POST /cases/{id}/warnings/{wid}/observations` (concluding it never closes the case) |
| Referrals | `POST /cases/{id}/referrals`, `POST /cases/{id}/referrals/{rid}/updates` |
| Ownership claims, related reports | `POST /cases/{id}/claims/{cid}/review`, `POST /cases/{id}/links` and `/unlink` |
| Close, reopen | `POST /cases/{id}/close`, `POST /cases/{id}/reopen` |
| Lost-pet and found-animal notices | `POST /lost-pet-alerts/reports/{rid}/request`, `/{id}/activate`, `PATCH /{id}`, `/{id}/close` (a notice is kept on its case; its title is made from the report; discarding a draft closes it) |
| Safety advisories | `POST/PUT /announcements/`, `PATCH /announcements/{id}/status`, `DELETE`, `POST /{id}/media` (category Animal Advisory; no case; a photo that will not upload never undoes the save) |
| Settings, policies, office profile, notification switches | `PUT /cases/settings/{sid}`, `PUT /notifications/preferences` |
| Profile | `PUT /users/{id}` (name, email, phone) |
| Analytics | `GET /analytics/subdivision` (the page does not load every case to be right) |

## What each Resident action does on the server

| Screen action | Request(s) |
|---|---|
| File a report | `POST /reports/` (a pin is required: the server needs a position and enforces the coverage radius), then `POST /reports/{id}/media` per photo, then for lost and found `POST /lost-pet-alerts/reports/{id}/request` (published at once or reviewed first, per the subdivision's publication setting, separately for each kind; the default for both is review). The report screens read that setting from `GET /cases/categories` (`publication`) and word the first step, the review step, the consent box and the confirmation to match, so a resident is never told "your notice is live" when the Leader will review it first; after sending, the confirmation follows what the server actually did (the notice's status) |
| Add information to a report | the case chat, `POST /chat/reports/{id}/messages` (a photo goes up through the existing direct Cloudinary upload first) |
| "My pet is home" | `POST /reports/{id}/confirm-reunited` |
| Report a sighting | `POST /lost-pet-alerts/{id}/sightings` (multipart, with a de-duplication key) |
| Ownership claim, answer to "more information" | `POST /reports/{rid}/ownership-claims`, `POST /ownership-claims/{id}/info` |
| Register or edit a pet | `POST /pets/`, `PUT /pets/{id}`, `POST /pets/{id}/photo` |
| Notifications, switches, profile | `/notifications/me`, `PATCH /notifications/{id}/read`, `POST /notifications/mark-all-read/{uid}`, `/notifications/preferences`, `PUT /users/{id}` |

Privacy stays on the server: a resident receives only what `report_visibility.redact_response` allows (own exact pin; neighbours' notices rounded to an area; no staff notes, priority, assessment or other residents' names). The screens add nothing to it.

## What the Resident Report screens offer

The Resident app groups the six internal kinds of report (`lost_pet`, `found_animal`, `nuisance`, `safety`, `injured`, `other`) into three entries and one question, in a resident's words (`frontend/src/resident/data/entries.ts`). Nothing below the screens changes: the identifiers, the stored categories, the Leader's names for them and every rule keyed to them (privacy, notices, owner warnings, publication, counting) are the same.

| A resident chooses | Filed as | Form that opens |
|---|---|---|
| Lost pet ("My pet is missing.") | `lost_pet` | lost-pet form (3 steps), notice requested |
| Animal complaint ("An animal is causing a problem.") | `nuisance` | general form (4 steps), "How often does it happen?" |
| Report an animal, then "It looks lost or has no owner nearby" | `found_animal` | found-animal form (3 steps), notice requested (reviewed first unless the subdivision publishes at once) |
| Report an animal, then "It is hurt or needs help" | `injured` | general form, "Can the animal move?" |
| Report an animal, then "It may be dangerous" | `safety` | general form |
| Report an animal, then "Something else, or I'm not sure" | `other` | general form |

- **Only what the subdivision accepts is offered.** `GET /cases/categories` already says, per kind, whether the Leader switched it on (`enabled`) and which stored category a report is filed under (`category_id`); the app keeps both as `state.accepting` (`adapters.acceptingFrom`). A kind is offered only when it is on and has a stored category. "Report an animal" disappears when all four of its kinds are off. When the settings could not be read the Report screen offers "Try again" rather than a list that could not be filed.
- **A kind switched off while a report is being written:** when the report is sent the app reads `GET /cases/categories` once more, files nothing, says so and offers "Choose another type"; the description, time, place, animal and photos (where the new kind takes them) are carried to the kind chosen instead. The server still refuses a switched-off kind on its own.
- **Reports already filed** keep their stored category and are grouped in My reports by the same mapping (older categories such as Aggressive or Roaming Animal are read as one of the six by the server).
- **The Leader's screens are unchanged:** they show the six kinds under the Leader's own names.

## Backend contract adjustments made for the connection

Additive, no schema change, see [CASE_WORKFLOW_BACKEND.md](CASE_WORKFLOW_BACKEND.md) for each: `GET /cases/summaries`, `GET /cases/work-queue`, `GET/POST /cases/{id}/notes`, `POST /cases/{id}/warnings/{wid}/observations`, the `office` block of the case settings, `category_id`/`subdivision`/`publication`/`stored_categories` in `GET /cases/categories`, `GET /reports/?mine=true`, `case_outcome` on a report, `GET /ownership-claims/mine`, `POST /ownership-claims/{id}/info`, `GET /lost-pet-alerts/mine`, `GET /lost-pet-alerts/all`, and `requested_by` on a notice (never shown to neighbours).

## What the connected interfaces cannot do (and say so)

Each is a `capability` flag or a screen note; none pretends. Admin: accepting an ownership claim does not also confirm ownership (the server marks the claim accepted and leaves the case's ownership under review until the Leader records that decision with evidence on the Assessment tab; the preview confirms it at once, so the dialog and the claims panel word it by `acceptConfirmsOwnership`); suspend, reactivate or verify a resident account (system administrator only on the backend); edit the position title or the subdivision's name and city (set by the system administrator); per-pet "possible match" decisions (the backend records the identity status and notes); choose how a warning is delivered or when it starts (the server sends it in the app and by email at once and the confirmed policy sets the period); a lost-pet or found-animal notice without a case; removing a photo already stored on an advisory. Resident: send a message to the office (no such message exists; the office's own contact details are shown, or a note that none were added); separate switches for community notices and safety advisories, and the text-message channel (the server has no such flags); a report without a pinned position; re-registering a pet the subdivision already registered for the resident (the server asks for confirmation, which only the legacy screen offers).

## Where the code is

`frontend/src/main.tsx` (the two routes and the redirects of the old addresses), `frontend/src/live/` (config, redirect, http, dates, refs, detail), `frontend/src/admin/live/` and `frontend/src/resident/live/` (api, adapters, actions, LiveDataProvider), `frontend/src/{admin,resident}/auth/httpGateway.ts`, `frontend/src/{admin,resident}/mode.ts`, the entries `AdminLiveRoot.tsx` and `ResidentLiveRoot.tsx`, `frontend/src/preview/geo.ts` (the reporting area and landmarks come from the server in live mode), `backend/app/services/{case_summaries,case_notes,case_compliance}.py`.
