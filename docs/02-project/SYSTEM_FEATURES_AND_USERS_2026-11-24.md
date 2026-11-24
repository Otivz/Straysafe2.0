# StraySafe 2.0: users and complete feature list (reference for Chapters 1 to 4)

Status: **Current** (2026-11-24). A reference list for the paper. It is built from the system documents ([overview.md](../01-system/overview.md), [MODULE_WORKFLOWS_AND_SPECIFICATIONS.md](../01-system/MODULE_WORKFLOWS_AND_SPECIFICATIONS.md), [REPORT_LIFECYCLE_AND_FEATURES.md](../01-system/REPORT_LIFECYCLE_AND_FEATURES.md), [AI_FEATURES_AND_PROCESS.md](../01-system/AI_FEATURES_AND_PROCESS.md)) and the code as it stands today. Where the older module document and the current code differ, **the current code wins** and the difference is noted. Items that are not in this repository (survey results, literature, statistics) are marked **Not in the repository**.

StraySafe 2.0 is a web and Android application that helps a **subdivision** manage stray and lost animals: residents report, the Subdivision Leader verifies and manages each case, lost and found animals are matched with their owners with the owner's confirmation, and referrals to outside agencies are recorded.

---

## 1. The users

### 1.1 System users (people who can sign in or use the system)

The system has **no administrator role**. Leader accounts are created by the developer when the subdivision is set up, and the settings an administrator would have managed are kept in the server configuration, not in a screen.

| # | User | Role id | Interface | Who they are | What they do |
|---|---|---|---|---|---|
| 1 | **Resident** | 1 | Resident app: web (`/resident-app`) and Android app | A person living in the subdivision. Gets an account from the official resident list, or registers and is approved by the Leader | Reports animals, registers pets, tracks reports, messages the administration, answers ownership questions, reports sightings, sees community notices, scans pet QR tags |
| 2 | **Subdivision Leader** | 2 | Leader app: web (`/subd-admin`) | The Subdivision Head and HOA officers. Accounts are issued to them, not self-registered | The only person who works cases: claims, reviews, assesses, refers, warns, matches, publishes notices and alerts, closes. Sees their own subdivision only |
| 3 | **Visitor (guest)** | none | Public pages only | Anyone, signed in or not | Sees the welcome, sign-in and sign-up screens; scans a pet's QR tag and can tell its owner where the pet is (place, note, one photo, optional phone number) |

### 1.2 Other people the system involves (not users)

| Party | Relationship to the system |
|---|---|
| **Barangay and other outside agencies**: city veterinary office, animal control, animal welfare groups, wildlife authorities | They have **no login**. The Leader contacts them outside StraySafe and **records** the referral and its outcome |
| **Pet owner, neighbour, finder, reporter, complainant** | Roles a **resident** takes in a process (for example the owner of a lost pet, or the neighbour who saw it). They are not separate accounts |
| **Person responsible** (complaints) | A resident with an account, or a household recorded by name and address. Recorded by the Leader; does not need an account |

### 1.3 Retired roles (state these as delimitations)
Barangay Staff (role 3) accounts and portals were retired on 2026-11-10. Old accounts stay as records and cannot sign in.

---

## 2. The complete feature list

### Module 1: Accounts and user management
- **Resident accounts, two ways:** (a) the Leader imports the official resident list and each resident claims a locked account by a single-use e-mail link (24 hours); (b) self-registration with residency verification, approved by the Leader under **Residents > Applications**.
- **Sign-in:** e-mail and password, or Google sign-in. JWT sessions (60-minute access tokens with rotating refresh tokens), role checks, and a sign-in limit of 5 attempts a minute.
- **Password policy:** 12 to 128 characters with upper case, lower case, a digit and a special character, enforced on the server.
- **Profile and settings:** contact details, Philippine phone number validation, address, notification preferences (in-app, push, e-mail).
- **Leader accounts** are created by the developer at set-up; a Leader can change their own password and profile. There is no in-app account administration screen.
- **Account states:** Active, Inactive (pending), Suspended, with the matching refusal messages at sign-in.
- **Residents directory (Leader):** official list import, invitations with delivery status, applications review, resident details.

### Module 2: Incident reporting and tracking
- **Reporting an animal concern in six categories:** Lost Pet, Found or Unidentified Animal, Animal Nuisance (complaint), Animal Safety Concern, Injured or Distressed Animal, Other. A resident chooses from three entries (Lost pet, Animal complaint, Report an animal); the Leader files the rest.
- **Guided forms:** kind of animal, description, time seen, photo or video (optional so residents are not put in danger), and a safety warning on the dangerous-animal form.
- **Location:** the device's GPS or a drag-and-drop map pin, with a landmark text. The pin is checked against the **reporting coverage area** (a centre point and radius kept in the system settings); a pin outside is refused.
- **Leader files a report** for someone who called, walked in, messaged, or for something the Leader saw themselves (channel and filed-by recorded).
- **Report tracking for the resident:** a reference number (for example SS-2026-0023), the four statuses, additional details and photos, and neutral timeline lines. Internal notes stay private.
- **Private by default:** every report starts Private; sensitive complaints can never be made public.
- **Duplicate protection:** a retried submit returns the first report.
- **Out-of-area, category-off and rate-limit checks** on the server.

### Module 3: Triage, assessment and AI decision support
- **Automatic first priority** (fixed rules, not AI): an injured animal that cannot move is High and immediate; a dangerous animal that bit, attacked or chased is Urgent.
- **Incident assessment** by the Leader: whether the incident happened, evidence sufficiency, urgency, **animal identity** and **ownership** (unknown, claimed, under review, confirmed, disputed, unconfirmed). Ownership can be confirmed only with a named resident and evidence other than the pet registration.
- **Priority levels:** Low, Normal, High, Urgent.
- **AI decision support** (suggestions only; see section 3): animal detection, report description, photo check, look-alike pets, duplicate reports, lost and found matching.
- **Related reports:** the Leader can **link** reports about the same animal (both stay open) or **merge** true duplicates (one primary case), and can undo either.
- **Claiming a case:** a Leader takes an unassigned case (with a concurrency check); a reminder goes out if nobody does within 30 minutes. Only the assigned officer updates a claimed case.
- **Urgent safety handling:** urgent banner, immediate notification of the Leaders, non-approach safety guidance for the resident.

### Module 4: Case intervention, referrals and enforcement
- **Case workspace** (Overview, Assessment, Actions and follow-ups, Referrals, History).
- **Follow-ups** with due dates inside limits the subdivision sets, and **contact logs** (who, how, outcome).
- **External referrals:** to the Barangay, animal control, a vet, an animal welfare group, wildlife rescue or another body, chosen from the agencies saved in **Settings > External coordination**. Each has its own status; a referral **never closes** the case.
- **Warnings and owner observation:** official warnings to a confirmed owner under a confirmed subdivision policy; an observation period set by the policy, with one reasoned extension; verbal warnings for owners without an account; warning letter templates.
- **Complaint management and progressive enforcement:** findings (did it happen, which rule, who is responsible), an offense count per person and rule (suggested, confirmed by the Leader), and steps by offense: 1st warning, 2nd warning and summons, 3rd fine and Barangay meeting; letters with delivery tracking. StraySafe records that a fine was paid; it takes no payment.
- **Ownership claims** on found-animal notices: a resident submits proof; the Leader reviews. A claim never establishes ownership by itself.
- **Possible Pet Owners** for a found animal: a ranked list of registered pets, owner contact through a conversation, **owner-first confirmation** (Confirm or Decline), and a final Leader verification only after the owner says yes.
- **Mediation** between a lost pet's owner and a neighbour who may have it, when either asks the Leader.
- **Injured and dangerous animal workflows:** welfare outcome and dangerous-incident outcome recorded before closing; **safety advisories** broadcast to all residents.

### Module 5: Closure, dashboard, analytics and audit
- **Closing with a documented disposition and reason** (nine dispositions in three groups: resolved, unresolved, invalid), with server rules (for example a handed-off closure needs a recorded referral contact). **Reopening** with a reason.
- **Everything tied to a case ends together:** conversations, alerts, follow-ups and linked cases.
- **Leader Dashboard:** "what needs my attention", ordered by urgency; missing and found animals listed apart; recent cases; QR tag message badge and nudge.
- **Cases list and map** with filters and a table or card view.
- **Analytics:** reports received and closed per week, outcomes, categories, referral activity, case locations map; Chart or Table view. A closed case is not assumed resolved.
- **Permanent audit trail:** an append-only log of who did what, with old and new values.
- **Case history** with filters and search.

### Lost and found animals (cross-cutting)
- **Lost Pet** (needs a registered pet): published to the community immediately with the owner's last-seen place; neighbours answer "I saw this pet" (a sighting) or "I may have it safely with me" (a possible recovery); recovery only by the owner's "My pet is home" or by the Leader recording the owner's phone or in-person confirmation.
- **Found animal notices** published by the Leader, with the finder's words and distinguishing marks kept private.
- **Lost and found matching:** possible matches are suggested to the Leader, who links them on confirmation.
- **Community board:** lost pets, found animals and advisories, with search, filters and a rounded (not exact) location for neighbours.
- **Notification alerts** the Leader schedules (now, later or repeating until the pet is home), separate from the notice.

### Pet registry and QR tags
- **Pet registry:** a resident registers household pets (type, breed, colours, markings, size, photos, microchip). Registration is optional and is never proof of ownership.
- **Possible duplicate pet registrations** are detected for review.
- **Permanent QR tags:** every registered pet has a printable tag. A scan opens a public page that shows the pet but never the owner.
- **A stranger's message:** place, note, one photo (hidden behind "Tap to view" for the owner and Leader), optional phone number shared only with consent.
- **A message goes New, then Viewed, then Pet returned or Not the pet.** The owner answers with two buttons; the Leader sees the same words, a badge on the Dashboard, and a nudge if the owner has not opened it within an hour.
- **In-app scanner** (camera or upload) on the Resident app; **QR collar requests** handled by the Leader's side.

### Messaging and notifications
- **Resident and administration conversations:** about a report, or general; closed automatically when the report closes.
- **Notifications:** in-app list, **web push** and **Android push (Firebase)** when configured, and e-mail (SMTP).
- **Announcements and advisories** to residents.

### Settings (Leader)
- Which categories are on, the subdivision's **animal policies** (rules, references, observation days, fines), follow-up limits, notice publication mode, external coordination agencies, office contact information and warning letter templates.

---

## 3. The AI features (suggestions only)

| Feature | What it does | Technology |
|---|---|---|
| Animal detection and crop | Finds the dog or cat in a photo or video frame | YOLOv8 nano (local) |
| Colour reading | Reads the animal's dominant coat colours | Pillow |
| Video frames | Samples up to 8 frames from a video | OpenCV |
| Report description | Suggests type, colour, size, breed, risk, behaviour, with its own confidence | Google Gemini (optional) |
| Photo check | Estimates whether a photo is a real animal photo | Gemini |
| Look-alike pets | Ranks registered pets that may be the reported animal | Rule engine plus optional Gemini photo comparison |
| Duplicate reports | Suggests reports that may be the same animal | Rule engine |
| Lost and found matching | Suggests lost and found pairs; "Compare photos (AI)" on request | Rule engine plus optional Gemini |

The AI **never** confirms a match, verifies ownership, merges reports or decides priority. Gemini can be switched off in the system settings, and every feature falls back to rules. **Accuracy has not been measured**, so the paper must not claim it (see [AI_FEATURES_AND_PROCESS.md](../01-system/AI_FEATURES_AND_PROCESS.md)).

---

## 4. Non-functional characteristics (for the paper)

- **Security:** server-side role and subdivision checks, hashed passwords (bcrypt), JWT sessions with refresh rotation, rate limiting on sign-in and public pages, an audit log, secrets only in the server `.env`.
- **Privacy:** private by default; neighbours see a rounded area, never the reporter, owner or exact pin; contact details are refused in public text; a phone number is shared only with consent.
- **Platforms:** responsive web app (phones, tablets, desktop) and an Android app built from the same web code with Capacitor; the Android debug build is made by GitHub Actions.
- **Reliability:** AI runs in a separate worker with a job queue, retries and a fallback; a failed AI job never blocks a report.
- **Technology:** React 19, TypeScript, Vite, Tailwind CSS, Leaflet (frontend); FastAPI, SQLAlchemy, Pydantic (backend); MySQL; Cloudinary (media); Gemini, YOLOv8, OpenCV, Pillow (AI); Firebase and web push (notifications); OpenStreetMap tiles.

---

## 5. Delimitations: out of scope or retired
Rescue dispatch, the holding place and custody, the adoption pipeline, claiming fees and the old pet-claim handling were retired on 2026-11-10. Barangay staff accounts were retired. Fines are recorded and never collected. There is no payment feature. The Barangay is contacted outside the system. There is no administrator role. Live location tracking of finders is not built.

---

## 6. How this fits Chapters 1 to 4

| Chapter | Use this list for | What the repository gives you | **Not in the repository** |
|---|---|---|---|
| **1. Introduction** | Project rationale, objectives, **scope and delimitation** (sections 1, 2 and 5), significance (who benefits: residents, Leaders, the subdivision), the conceptual framework (users, inputs, process, outputs) | The roles, the modules, the delimitations, [MANUSCRIPT_CHAPTER1_CHECK_2026-10-26.md](MANUSCRIPT_CHAPTER1_CHECK_2026-10-26.md) (a check of the manuscript against the system) | Statistics and laws about strays; the interview results |
| **2. Review of related literature and systems** | A feature-by-feature comparison: list the features here against the studies and apps you review | The feature list and the AI "suggests, a person decides" position | The literature itself |
| **3. Methodology** | System design and development: the five modules and their workflows, the lifecycle diagram, the AI process diagram, the technology stack, the database design, security | [MODULE_WORKFLOWS_AND_SPECIFICATIONS.md](../01-system/MODULE_WORKFLOWS_AND_SPECIFICATIONS.md), [REPORT_LIFECYCLE_AND_FEATURES.md](../01-system/REPORT_LIFECYCLE_AND_FEATURES.md), [AI_FEATURES_AND_PROCESS.md](../01-system/AI_FEATURES_AND_PROCESS.md), [DATABASE_SCHEMA.md](../01-system/DATABASE_SCHEMA.md), the ERD and DFD folders | The research design and instruments (the manuscript names a TAM hypothesis and ISO ratings) |
| **4. Results and discussion** | What was built, module by module (section 2), the AI results and their limits, testing evidence | Automated test scripts in `backend/tests` and `frontend/tests`, browser test evidence in `docs/04-testing`, the change records | **AI accuracy** (not measured), **user acceptance survey results**, the t-test and other statistics |

> **Honesty notes for the paper:** (1) say the AI suggests and a person confirms, and make no accuracy claim until the AI test set is measured; (2) the system has two kinds of signed-in users, Residents and Subdivision Leaders, and no administrator; (3) a few tests that cover older QR tag behavior fail because tags were made permanent, and some frontend tests failed before the latest changes, so do not quote an overall "all tests pass".
