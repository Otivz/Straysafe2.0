# New Admin and Resident interfaces: connection to the backend

Status: **Current** (2026-11-11; the Lost Pet flow is registration-first, see "Lost Pet reports: registration first"). The Subdivision Leader (`/subd-admin`) and Resident (`/resident-app`) interfaces run on the real backend and are the only interfaces: the legacy portals, the mock-data previews and the `VITE_NEW_UI` switch were removed on 2026-11-10 ([change record](../05-operations/agents/feature-updates/2026-11-10_1456_final-legacy-repository-cleanup.md); the earlier readiness analysis is in [CUTOVER_READINESS.md](../05-operations/CUTOVER_READINESS.md)).

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
| Referrals | `POST /cases/{id}/referrals` (`contacted: false` writes the help down as "Not contacted yet" without claiming anyone was reached), `POST /cases/{id}/referrals/{rid}/updates` (with `contact_method`, `contact_person`, `contact_detail` when the update is the contact attempt itself) |
| Lost Pet: record the owner's confirmation, review a sighting, finish a request for help | `POST /lost-pet-alerts/{id}/record-recovery` (`source` phone or in_person, `confirmed_at`, `note`), `POST /lost-pet-alerts/sightings/{id}/review`, `POST /lost-pet-alerts/coordinations/{id}/resolve` |
| Ownership claims, related reports | `POST /cases/{id}/claims/{cid}/review`, `POST /cases/{id}/links` and `/unlink` |
| Close, reopen | `POST /cases/{id}/close`, `POST /cases/{id}/reopen` |
| Found-animal notices (a missing pet's notice is published by its report) | `POST /lost-pet-alerts/reports/{rid}/request`, `/{id}/activate`, `PATCH /{id}`, `/{id}/close` (a notice is kept on its case; its title is made from the report; discarding a draft closes it) |
| Safety advisories | `POST/PUT /announcements/`, `PATCH /announcements/{id}/status`, `DELETE`, `POST /{id}/media` (category Animal Advisory; no case; a photo that will not upload never undoes the save) |
| Settings, policies, office profile, notification switches | `PUT /cases/settings/{sid}`, `PUT /notifications/preferences` |
| Profile | `PUT /users/{id}` (name, email, phone) |
| Link an office-registered pet record to a resident | `POST /pets/{id}/assign-owner?owner_id={rid}` with `{"evidence_note": ...}` (at least 10 characters, required of a Leader): the server asks the resident to confirm, and the record's owner does not change until they do |
| Analytics | `GET /analytics/subdivision` (the page does not load every case to be right) |

## What each Resident action does on the server

| Screen action | Request(s) |
|---|---|
| File a report | `POST /reports/` (a Lost Pet report also carries the registered pet, `pet_id`, and `last_seen_at`: see "Lost Pet reports: registration first"; a pin is required: the server needs a position and enforces the coverage radius), then `POST /reports/{id}/media` per photo, then, for a found animal only, `POST /lost-pet-alerts/reports/{id}/request` (published at once or reviewed first, per the subdivision's found-animal publication setting; the default is review). A missing pet's notice is published by the server in the filing itself (2026-11-11), so the app asks for nothing more and sends a retry key (`client_request_id`) with an unchanged draft. The report screens read the setting from `GET /cases/categories` (`publication`; a missing pet is always `immediate`) and word the first step, the review step, the consent box and the confirmation to match, so a resident is never told "your notice is live" when the Leader will review it first; after sending, the confirmation follows what the server actually did (the notice's status) |
| Add information to a report | the case chat, `POST /chat/reports/{id}/messages` (a photo goes up through the existing direct Cloudinary upload first) |
| "My pet is home" | `POST /reports/{id}/confirm-reunited` (for a lost pet it delegates to the one recovery operation, the same as `POST /lost-pet-alerts/{id}/recovered`; the screen asks for an explicit confirmation first) |
| Report a sighting; "I may have this pet safely with me" | `POST /lost-pet-alerts/{id}/sightings` (multipart, with a de-duplication key; `sighting_type=secured` with `care_note` and `contact_choice` for a possible recovery) |
| Community overview and directory | `GET /lost-pet-alerts/community/summary` (a few of each kind and the totals), `GET /lost-pet-alerts/active?alert_type=&q=&species=&limit=&offset=` (searched, filtered and paged on the server) |
| Agree to message, ask the Leader to help, read and write private messages | `POST /lost-pet-alerts/coordinations/{id}/consent`, `/mediation`, `GET` and `POST /lost-pet-alerts/coordinations/{id}/messages` |
| Ownership claim, answer to "more information" | `POST /reports/{rid}/ownership-claims`, `POST /ownership-claims/{id}/info` |
| Register or edit a pet | `POST /pets/`, `PUT /pets/{id}`, `POST /pets/{id}/photo` (Dog or Cat; a resident cannot set the owner, who registered it or a verification flag) |
| Answer "is this your pet?" (a record the office linked) | `GET /pet-ownership/mine`, `POST /pet-ownership/{id}/accept` and `/reject` |
| Notifications, switches, profile | `/notifications/me`, `PATCH /notifications/{id}/read`, `POST /notifications/mark-all-read/{uid}`, `/notifications/preferences`, `PUT /users/{id}` |

Privacy stays on the server: a resident receives only what `report_visibility.redact_response` allows (own exact pin; neighbours' notices rounded to an area; no staff notes, priority, assessment or other residents' names). The screens add nothing to it.

## What the Resident Report screens offer

The Resident app groups the six internal kinds of report (`lost_pet`, `found_animal`, `nuisance`, `safety`, `injured`, `other`) into three entries and one question, in a resident's words (`frontend/src/resident/data/entries.ts`). Nothing below the screens changes: the identifiers, the stored categories, the Leader's names for them and every rule keyed to them (privacy, notices, owner warnings, publication, counting) are the same.

| A resident chooses | Filed as | Form that opens |
|---|---|---|
| Lost pet ("My pet is missing.") | `lost_pet` | lost-pet form (3 steps) about a registered pet, notice requested; switched off with "Register a pet" while the resident has no registered pet |
| Animal complaint ("An animal is causing a problem.") | `nuisance` | general form (4 steps), "How often does it happen?" |
| Report an animal, then "It looks lost or has no owner nearby" | `found_animal` | found-animal form (3 steps), notice requested (reviewed first unless the subdivision publishes at once) |
| Report an animal, then "It is hurt or needs help" | `injured` | general form, "Can the animal move?" |
| Report an animal, then "It may be dangerous" | `safety` | general form |
| Report an animal, then "Something else, or I'm not sure" | `other` | general form |

- **Only what the subdivision accepts is offered.** `GET /cases/categories` already says, per kind, whether the Leader switched it on (`enabled`) and which stored category a report is filed under (`category_id`); the app keeps both as `state.accepting` (`adapters.acceptingFrom`). A kind is offered only when it is on and has a stored category. "Report an animal" disappears when all four of its kinds are off. When the settings could not be read the Report screen offers "Try again" rather than a list that could not be filed.
- **A kind switched off while a report is being written:** when the report is sent the app reads `GET /cases/categories` once more, files nothing, says so and offers "Choose another type"; the description, time, place, animal and photos (where the new kind takes them) are carried to the kind chosen instead. The server still refuses a switched-off kind on its own.
- **Reports already filed** keep their stored category and are grouped in My reports by the same mapping (older categories such as Aggressive or Roaming Animal are read as one of the six by the server).
- **The Leader's screens are unchanged:** they show the six kinds under the Leader's own names.

## Lost Pet reports: registration first (2026-11-11)

A Lost Pet report is about one of the resident's own registered pets. Registration is the prerequisite; it is not ownership verification and nothing waits for the Leader before the report is filed. The server rules are in [CASE_WORKFLOW_BACKEND.md](CASE_WORKFLOW_BACKEND.md#registration-first-lost-pet-reports-2026-11-11).

**Resident app**

- **Report and Home.** Lost pet is offered when the subdivision accepts the kind. A resident with no registered pet (a deceased pet does not count) sees it switched off, with "Register your pet first to report it missing." and a "Register a pet" action; the Home shortcut "My pet is lost" says the same. Registering from there (`/pets/new?next=lost`) goes straight back to the lost-pet report with the new pet chosen: no approval, no verification, no second visit.
- **"About your pet".** The resident's pets are cards. A pet that already has an open lost report shows "Already reported missing" and "View report" and cannot be chosen; a single free pet is chosen for the resident. The chosen pet's registered profile (kind, breed, colour, marks, age) is shown read-only and is never typed again. The resident adds when it was last seen, anything that may help (optional) and a recent photo (optional). The location step is unchanged.
- **What is sent.** `POST /reports/` carries `pet_id` and `last_seen_at`, not the animal's kind, breed or colour: the server reads those from the pet. A refusal arrives in words: `422` register first, `404` not one of your pets, `409` inactive record, `409` `LOST_REPORT_EXISTS` (the screen links to the open report). `frontend/src/live/http.ts` keeps the structured detail (`ApiDetailError`, `errorCodeOf`) for the screens that act on a code.
- **Pets.** Dog or Cat for now. My pets marks a pet "Reported missing" while it has an open lost report. A pet record the office linked to the resident appears as "Is {name} your pet?" on Home and My pets, with "Yes, it's mine" and "No, it's not mine" (`GET /pet-ownership/mine`, `POST /pet-ownership/{id}/accept` and `/reject`); nothing moves before the resident answers. A resident cannot remove a pet that has an open lost report.

**Leader app**

- **Case Overview** (every Lost Pet case, and any case that names a pet) shows a "Registered pet" panel and a "Registered owner" panel from `GET /cases/{id}` -> `pet`: the registry record today and whether it was declared by the owner or entered by the office; "As reported" (the record as it was when the report was filed) with what has changed since; the owner's contact details and emergency contact; when and where the pet was last seen (and what the community notice says, when that differs). A registration is shown as declared, never as verified, and ownership is left to the Assessment tab and its evidence.
- **Not a plain pet.** A Lost Pet case with no pet link (an older report) says "No registered pet is linked to this report." instead of showing an empty panel. A pet from another subdivision shows only that it is registered elsewhere; a removed record shows what the report was filed with.
- **Linked by the reporter vs identity confirmed.** The badge on "Where things stand" and on a pet's related cases reads "Linked by the reporter" until a Leader records the identity, and "Identity confirmed" only after that. The Assessment tab says so and asks for how the Leader checked.
- **Linking an office record to a resident.** On a pet record that has no resident account, "Link to a resident" opens a dialog: find the resident, say how the account was checked (at least 10 characters, kept in the pet's history), send. The resident is asked in their own app; ownership is not transferred before they accept. Only the staff member who entered the record can use it (the page says so otherwise). The pet registry lists such records as "No resident linked" and "Entered by ...".

**Checked by:** `backend/tests/test_lost_pet_registration_first.py`, `frontend/tests/residentRegistration.test.mjs` and `adminRegisteredPet.test.mjs`, and these steps of `frontend/tests/liveInterfaces.browser.mjs`: filing a lost-pet report for a registered pet, a pet already reported missing, no registered pet then register-and-return and filing at once, the Leader's registered-pet panel and identity decision, an older lost-pet case, linking an office record and the resident's confirmation. The browser test's API (`backend/tests/e2e_server.py`) now includes the `pet_ownership` router, which it lacked although the Resident app reads `/pet-ownership/mine` on every load.

## Lost Pet end to end (2026-11-11)

The server rules are in [LOST_PET_LIFECYCLE.md](LOST_PET_LIFECYCLE.md). What the two interfaces do with them:

**Resident app**

- **Community** is an overview, not a feed: the newest few missing pets and found animals with their totals and "View all", and the safety advisories (`GET /lost-pet-alerts/community/summary`). "View all" opens a directory (`/community/lost`, `/community/found`) with a search box and a Dogs / Cats / Other filter; the words and filter are in the address, typing waits a moment, and the server searches and returns 20 at a time ("Show more"). The notices read are kept in the app's list, so opening one finds it.
- **A missing-pet notice** shows, in this order: the photo, name and what the pet looks like and whether it is still missing; for the owner (and the neighbour who wrote it) the possible recoveries, each with its conversation; where it was last seen (the owner's report); the sightings since (clearly reports, not tracking). A neighbour's footer has "I saw this pet" and "I may have this pet safely with me"; the owner's has "Sightings" and "My pet is home" (an explicit confirmation sheet). A notice that ended says how: "is home" only after the owner's confirmation, otherwise "withdrawn", "merged into another report" or "closed".
- **"I may have this pet safely with me"** (`/community/alert-{id}/secured`): when and where it was found, what the writer can tell the owner, an optional private note on where the pet is now, a photo, and how the owner may reach them (message in the app, ask the Leader to help, or decide later). It says who sees it (the owner and the Leader; the owner sees the first name) and that it never marks the pet home.
- **Conversation panel**: "Message {name}" (agree), "Ask the Subdivision Leader to help" (no reason), the private messages once both agreed (polled every 15 s while the screen is open), and a read-only thread once the Leader was asked or it finished.
- **Notifications** open the notice (`lost_pet_*` except `lost_pet_leader`) or, for an ordinary sighting, its sightings; an alert's number is never read as a report's.
- **Data layer.** The lists hold each notice without its sightings and conversations, so after a change the app reads the notices the person had open in full again (`readNotices` in `LiveDataProvider.tsx`); filing a missing-pet report no longer asks for a notice, and sends one retry key per unchanged draft.

**Leader app**

- **Dashboard.** Requests to help an owner and a neighbour and a Barangay nobody has contacted come right after urgent safety cases in "Needs your attention"; a missing-pet report is not a task for being new and is not counted in "New reports"; "Missing pets" lists them on their own.
- **Missing-pet case** (`LostPetOverview`): see [LOST_PET_LIFECYCLE.md](LOST_PET_LIFECYCLE.md#leader-screens). Its actions: Record owner confirmation (phone or in person, when the owner said so, a note, an explicit "the owner told me"), Review (verify or dismiss a sighting or lead), Record contact / Schedule next step / Mark as finished (for a request for help; the first two reuse "Record owner coordination" and follow-ups), Ask for help (a referral that can be written down as "Not contacted yet") and Record contact attempt.
- **Closing.** "Missing pet recovered" is unavailable in the closure dialog with the reason, and "Withdrawn by the reporter" is never offered. Settings show "Published at once, always." for lost-pet notices.

## Backend contract adjustments made for the connection

Additive; the only schema change is the nullable `reports.pet_snapshot` (2026-11-11). See [CASE_WORKFLOW_BACKEND.md](CASE_WORKFLOW_BACKEND.md) for each: `GET /cases/summaries`, `GET /cases/work-queue`, `GET/POST /cases/{id}/notes`, `POST /cases/{id}/warnings/{wid}/observations`, the `office` block of the case settings, `category_id`/`subdivision`/`publication`/`stored_categories` in `GET /cases/categories`, `GET /reports/?mine=true`, `case_outcome` on a report, `GET /ownership-claims/mine`, `POST /ownership-claims/{id}/info`, `GET /lost-pet-alerts/mine`, `GET /lost-pet-alerts/all`, `requested_by` on a notice (never shown to neighbours), and, for the registration-first Lost Pet flow, `pet` and `identity.decided` on `GET /cases/{id}`, `identity_decided` on `GET /cases/summaries`, `last_seen_at` on `POST /reports/` and `evidence_note` on `POST /pets/{id}/assign-owner`. For the Lost Pet end-to-end flow (2026-11-11): `client_request_id` on `POST /reports/`, `lost_pet` on `GET /cases/{id}`, `coordinations` on `GET /cases/work-queue`, `contacted` on a referral and the contact fields on a referral update, `GET /lost-pet-alerts/community/summary`, the paged and searched `GET /lost-pet-alerts/active`, `POST /lost-pet-alerts/{id}/recovered` and `/record-recovery` (the old `/reunited` is gone), the `coordinations/...` endpoints, and `sighting_type`, `care_note`, `contact_choice` on a sighting.

## What the connected interfaces cannot do (and say so)

Each is a `capability` flag or a screen note; none pretends. Admin: accepting an ownership claim does not also confirm ownership (the server marks the claim accepted and leaves the case's ownership under review until the Leader records that decision with evidence on the Assessment tab; the preview confirms it at once, so the dialog and the claims panel word it by `acceptConfirmsOwnership`); suspend, reactivate or verify a resident account (system administrator only on the backend); edit the position title or the subdivision's name and city (set by the system administrator); per-pet "possible match" decisions (the backend records the identity status and notes); choose how a warning is delivered or when it starts (the server sends it in the app and by email at once and the confirmed policy sets the period); a lost-pet or found-animal notice without a case; removing a photo already stored on an advisory. Resident: send a message to the office (no such message exists; the office's own contact details are shown, or a note that none were added); separate switches for community notices and safety advisories, and the text-message channel (the server has no such flags); a report without a pinned position; a lost-pet report without a registered pet (the server requires one); a pet that is not a dog or a cat; a household co-owner (one registered owner per pet); re-registering a pet the subdivision already registered for the resident (the server asks for confirmation, which only the legacy screen offers).

## Where the code is

`frontend/src/main.tsx` (the two routes and the redirects of the old addresses), `frontend/src/live/` (config, redirect, http, dates, refs, detail), `frontend/src/admin/live/` and `frontend/src/resident/live/` (api, adapters, actions, LiveDataProvider), `frontend/src/{admin,resident}/auth/httpGateway.ts`, `frontend/src/{admin,resident}/mode.ts`, the entries `AdminLiveRoot.tsx` and `ResidentLiveRoot.tsx`, `frontend/src/preview/geo.ts` (the reporting area and landmarks come from the server in live mode), `backend/app/services/{case_summaries,case_notes,case_compliance}.py`, `backend/app/utils/{lost_pet_rules,identity_decision}.py` (registration-first Lost Pet reports), `frontend/src/resident/pages/report/LostPetForm.tsx`, `frontend/src/admin/pages/case/RegisteredPetPanel.tsx`, `frontend/src/admin/dialogs/PetDialogs.tsx`.
