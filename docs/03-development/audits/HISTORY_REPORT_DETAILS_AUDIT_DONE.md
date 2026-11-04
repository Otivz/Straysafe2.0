# History report details audit and fix plan

- **Date:** 2026-11-02
- **Pages checked:**
  - Subdivision Leader: `/subd/history/:id` (`frontend/src/pages/Subd_Leaders/SubdViewHistory.tsx`)
  - Barangay Staff: `/brgy/history/:id` (`frontend/src/pages/Barangay_Staff/BrgyViewHistory.tsx`)
  - Administrator: `/admin/incidents/:id` (`frontend/src/pages/Admin/AdminReportView.tsx`). The admin has no separate history detail page; this one plays that role.
- **Method:** compared the fields each page displays with the fields `GET /reports/{id}` returns (`ReportResponse` in `backend/app/schemas/report.py`). Code reading only; the pages were not checked in a browser. `GET /reports/1` loads for a leader, staff member and admin (checked read-only on 2026-11-02).
- **Status:** Phases 0–6 done (2026-11-02); Phase 7 (final verification) not started.

## Findings

The API already returns everything below. The gaps are in the pages (frontend only).

Legend: ✓ shown · ✗ not shown · *Type only* = declared in the page's TypeScript type but never displayed.

| # | Detail | Subd | Brgy | Admin | Why it matters |
|---|---|---|---|---|---|
| F1 | Verification: verified by, verified at, notes, false-alarm reason | Type only | Type only | ✓ | Accountability: who decided and why |
| F2 | Condition (injured, sick…) | Type only | Type only | ✓ | Basic animal fact |
| F3 | Breed (reported and AI), coat pattern | ✗ | ✗ | ✓ | Identifying the animal later |
| F4 | Behavior found: bite, attempted bite, chasing, injury, aggression, finding | ✗ | ✗ | Tags only | Source of the pet's verified bite and chase history |
| F5 | Owner observation: 3-day period, due date, extension, outcome | ✗ | ✗ | ✗ | Observation cases show no observation record (report 1 is one) |
| F6 | Warnings issued to the owner | ✗ | ✗ | ✗ | Repeat-offender trail |
| F7 | Disputes: who, reason, outcome | ✗ | ✗ | ✗ | Disputed cases look uncontested |
| F8 | Merged duplicates: which reports, merged by, notes | ✗ | ✗ | ✗ | Subd and brgy only use the field to redirect to the main report |
| F9 | Split: parent report, number of animal records | ✗ | ✗ | ✗ | Multi-animal cases lose their links |
| F10 | Matched pet and owner (confirmed match) | Only on return | Only on return | ✗ | Admin can't see whose animal it was |
| F11 | Owner return / reunion, who confirmed it | ✓ | ✓ | ✗ | Admin is missing the case outcome |
| F12 | Visibility decision: public/private, decided by, reason | Type only | Type only | Type only | Privacy decision trail (RA 10173) |
| F13 | Comments | Type only | Type only | ✗ | Case discussion is lost from the archive |
| F14 | AI photo check (authentic / possibly edited) | ✗ | ✗ | ✗ | Shows why the report was trusted |
| F15 | AI suggested priority and reason | Type only | Type only | ✓ | Shows the AI suggested and a person decided |
| F16 | Final outcome with date (resolved, impounded, returned, adopted, deceased…) | ✗ | ✗ | ✗ | No one-line answer to "how did this case end?" |

Not a gap (keep hidden on purpose):
- reporter phone and email, and owner contact details, on the Subdivision and Barangay pages (privacy);
- the subdivision and barangay names on the Subdivision page.

Inconsistency: the three pages show different facts about the same case. Admin has verification and breed but not the outcome; Subd and Brgy have the outcome but not verification.

## Approach

Build one shared, read-only component, `CaseSummaryPanel` (`frontend/src/components/History/`), that takes the report from `GET /reports/{id}` and renders the sections below. Use it on all three pages, so they always show the same facts. Each section hides itself when it has no data. No backend or database changes.

## Phases and checklist

### Phase 0: Preparation (done 2026-11-02)
- [x] Confirm the resident 500 error on `/reports/` (old `owner_followups` table) is fixed, since F5 reads the same data. The local table now has the new design (`owner_id`); `GET /reports/` loads for a resident (checked read-only).
- [x] Pick test reports. The local database was reset and holds **one report** (report 1), so only some case types exist. The rest are covered by a mocked browser fixture (no live data changed), see below.
- [x] Note each report's expected details (below).

#### Phase 0 results: test cases

| Case type | Local report | Covered by |
|---|---|---|
| Observation, owner complied | Report 1 | Live data and fixture |
| Warning issued | Report 1 | Live data and fixture |
| Confirmed pet match (Baron) | Report 1 | Live data and fixture |
| Resolved (final outcome) | Report 1 | Live data and fixture |
| Verified with verifier name and date | none | Fixture |
| False alarm / rejected | none | Fixture |
| Behavior found (bite, chasing) | none | Fixture |
| Merged duplicate | none | Fixture |
| Split group | none | Fixture |
| Disputed case | none | Fixture |
| Returned to owner (owner return card) | none | Fixture |
| Impounded / in holding | none | Fixture |
| Public sighting with visibility reason | none | Fixture |
| Comments | none | Fixture |

Optional, for a live check before the defense: create a few demo cases through the app (a false alarm, a merged duplicate, a disputed case, a returned pet). Use made-up names only.

#### Expected details for report 1 (as the Subdivision Leader sees it)

| Field | Value |
|---|---|
| Final status | 11 Incident Resolved |
| Animal | Dog, Aspin (AI: Aspin), Tan and White, Bicolor, Medium, 1 animal |
| Condition | Healthy |
| Priority | Medium; AI suggested "Medium Priority": "The stray dog is causing a nuisance by scattering trash." |
| Visibility | Private; no decision recorded (decided by and reason empty) |
| Verification | **Empty fields**, although the history has a Verified step (see finding F17) |
| Behavior found | None (all verified behavior flags false) |
| Observation | Closed, status `complied`, outcome "the owner complied", ended 2026-11-02 11:22 UTC, due 2026-11-05, not extended |
| Warnings | 1: level Notice, Free-Roaming Unleashed |
| Matched pet | Baron (Aspin, Bicolor), owner Emmanuel Vito Cruz |
| Owner return | None |
| AI photo check | Likely Authentic |
| Disputes, comments, merged, split | None |
| History | 8 entries, statuses 1 → 2 → (2 notes) → 2 → 7 → 7 → 11 |

#### New finding from Phase 0

| # | Detail | Problem | Plan |
|---|---|---|---|
| F17 | Verification | Report 1 reached **Verified** (history has status 2), but `verified_by_name`, `verified_at` and `verification_notes` are empty. Verification done through a status change doesn't fill these fields. | Phase 1: show verification from those fields when present, otherwise from the first Verified history entry (updater and time). Fixing the backend so it fills them is a separate change; ask before doing it. |

### Phase 1: Shared summary component (core facts) (done 2026-11-02)
- [x] Create `CaseSummaryPanel` (`frontend/src/components/History/CaseSummaryPanel.tsx`) with a typed `report` prop. The pages each define their own report type, so the panel declares only the fields it reads, all optional (`CaseSummaryReport` in `frontend/src/utils/caseSummary.ts`); no `any`.
- [x] **Final outcome** (F16): status, the date it was reached (first entry of the last unbroken run of that status in `history`), who recorded it and the remarks; an Open/Closed badge. Open cases show "Current status … Since".
- [x] **Verification** (F1, F17): verified by, date and notes from the report; when those are empty, from the first Verified history entry, marked "Taken from the case history". Rejected and false-alarm cases show the reason, who decided and the date instead. "No verification recorded" when there is none.
- [x] **Animal** (F2, F3): type, count, condition, breed, color, coat pattern, size. The AI suggestion is shown with an "AI" tag only when nothing was reported or it differs from the reported value.
- [x] **Priority** (F15): final priority, the AI suggestion and its reason, and the note "The AI only suggests; officials set the priority".
- [x] Each section hides itself when it has no data; "Unknown" counts as no data.
- [x] Two columns when the panel is at least 640 px wide (container query), one column on phones; no sideways scrolling. Checked at 1280 and 390 px.
- Test: `node frontend/tests/caseSummary.browser.mjs` (fixture `frontend/tests/fixtures/caseSummary.tsx`: report 1 from Phase 0, a verified case, a false alarm, an empty open report). Not yet on any page; that is Phase 2.

### Phase 2: Add it to the Subdivision and Barangay pages (done 2026-11-02)
- [x] Insert the panel as the first full-width row of the page grid in `SubdViewHistory.tsx` and `BrgyViewHistory.tsx`, above the reporter and details card (on the Barangay page on phones, below the "Archived Incident" banner)
- [x] Remove the duplicated fields from the details grid: Priority, Animal Type, Detected Animal Type, Dominant Color, Estimated Size, Animal Count. Category, Landmark and Street / Location stay. The status badge next to the reporter's name stays as the card's header. `getPriorityColor` was removed (no longer used).
- [x] Page `Report` types: removed fields nothing read (`breed`, `behavior_tags`, `ai_suggested_risk_level`, `verification_status`, `verified_by_user_id`); added `animal_breed` and `ai_coat_pattern`, which the panel reads. Condition, verification and AI priority fields are now shown through the panel. `visibility` and `comments` stay for Phase 4.
- [x] Check `/subd/history/1` and `/brgy/history/1` in the browser at 1280 and 390 px: `node frontend/tests/historyCaseSummary.browser.mjs` (real pages, mocked API with report 1 from Phase 0; optional `SCREENSHOT_DIR` saves screenshots). Not checked against the live backend with a real sign-in.

### Phase 3: Case events (done 2026-11-02)
- [x] **Behavior found** (F4): the verified flags (bite, attempted bite, chasing, caused injury, aggressive) and the finding text, with "Verified by an official; it counts toward the pet's bite and chasing history"
- [x] **Owner observation** (F5): status (observing, owner complied, closed by the subdivision, endorsed to the Barangay, cancelled), start date, due date while open or end date when closed, extended (by how many days) and the extension reason, and who closed it. From `report.observation`, which carries no owner details. The backend adds the start time for every viewer, and the extension days and reason and who closed it for officials only (`observation_summary(..., staff_details=True)` for roles 2–4), because the reason can describe the owner's situation.
- [x] **Warnings** (F6): number issued, latest level and type, date, issued by, status. The owner's phone in the warning data is never shown.
- [x] **Disputes** (F7): each dispute's status, who filed it and when, pet, reason, reviewer and date, review notes. Residents never reach these pages, and the API already limits a resident to their own disputes.
- [x] **Merged and split** (F8, F9): merged into (with merged by, date, notes), the merged reports, split from, and the number of animal records. Report numbers link to the same role's history page (`reportHref`).
- [x] **Matched pet and owner** (F10, F11): the pet's registered photo (small thumbnail), pet name, breed, owner name, who confirmed the match, returned to, return date and method, and who confirmed the reunion (owner or officer). Names only: no phone, email or address.
- Tests: `node frontend/tests/caseSummary.browser.mjs` (adds an every-event case and a merged-and-split case) and `node frontend/tests/historyCaseSummary.browser.mjs` (report 1's observation, warning and pet on both real pages, and the merged-report link per role). Both pin the browser to Asia/Manila time.

#### New finding from Phase 3

| # | Detail | Problem | Plan |
|---|---|---|---|
| F18 | Observation due date | `observation_summary` labels every follow-up time as UTC. `closed_at` is written in UTC (`_now()`), so the end time is right. `due_at` is written in UTC by the normal start (`owner_followups.py:99`) but in database local time (+8) by the warning path (`owner_followups.py:296`). Due dates from that path show 8 hours late, on the panel and anywhere else that reads them. | **Fixed in code 2026-11-02** (developer: "whatever the best option"): the warning path converts the warning's time to UTC first (`db_local_to_utc`). **Existing rows are unchanged**: observations created from a warning before the fix still have a due date 8 hours late (local report 1's is, but that observation is closed, so its due date isn't shown). Correcting them is a data change; ask before running one. |

### Phase 4: Records and transparency (done 2026-11-02)
- [x] **Visibility** (F12): what residents see (Public, Private or Hidden, worded as on the rest of the app by `visibilityBadge`), decided by, when, reason, why it isn't public (`public_block_reason`), and "Needs review" when a leader still has to decide. Always shown, with the explanation of who can see the report.
- [x] **Comments** (F13): read-only list, oldest first, with author and date; replies (at any depth) sit indented under their thread; blank comments are skipped. "Comments are closed for this case" on a closed case or when comments are turned off; "No comments on this report" when there are none. Full width under the other sections.
- [x] **AI photo check** (F14): result (for example Likely Authentic, Uncertain), the likelihood that the photo was AI-made, the recommendation, and short text details (raw JSON is not shown), with "AI check, for reference only. Officials decide whether a photo is genuine." Hidden when the photo was never checked.
- The pet thumbnail added in Phase 3 now hides itself if the photo can't load.
- Tests: `caseSummary.browser.mjs` adds visibility (private, public with a decision, hidden false alarm), the AI check (authentic, uncertain, raw JSON skipped, not checked) and comments (ordering, nested replies, closed note); `historyCaseSummary.browser.mjs` checks them on both real pages.

### Phase 5: Admin page (done 2026-11-02)
- [x] Add the panel to `AdminReportView.tsx`, full width after the response pipeline, before the holding monitor. Merged and split report numbers link to `/admin/incidents/:id`. The admin-only parts are unchanged: action buttons (Live Chat, Direct Override, Mark Resolved, Delete), holding monitor, photos, endorsement card, map, audit trail, assigned handler, the visibility control, the reporter card with contact details, and the modals.
- [x] **Owner return / reunion** (F11): comes with the panel's Pet and owner section (returned to, when, how, who confirmed the reunion). No separate card needed.
- [x] Remove admin sections the panel now duplicates:
  - the species, breed, count and condition grid in "Animal Profile & Characteristics" (the card is now "Resident's Description" and keeps the description and behavior tags);
  - the "Subdivision Field Verification Dossier" card, which showed **invented text** when data was missing (a stock inspection finding, a "Protocol Compliant" badge, and "Verified On-Site" for any status from 2 up, including false alarms);
  - the "AI Vision Analysis" card (color, breed, size, AI urgency and reason are all on the panel with AI tags).
- Test: `historyCaseSummary.browser.mjs` now also loads `/admin/incidents/1` as an admin at 1280 and 390 px.
- Seen, not changed: on phones the admin top bar's title overlaps its icons (`AdminNavbar`); the "Official Escalation & Custodial Endorsement" card still shows a stock transfer statement when there is no letter.

### Phase 6: Print and PDF for barangay records (done 2026-11-02)
- [x] **Print / Save as PDF** button in the panel's header on all three pages (`printable` prop). It opens the browser's print dialog, which offers "Save as PDF". Shows "Preparing…" while it works.
- [x] Print layout (`frontend/src/utils/casePrint.ts`, through the existing hidden-frame `printHtml`): US Letter portrait. Every page has a header (StraySafe · Barangay San Vicente; Case record · Report #N) and a footer ("Printed by <name> (<role>) · <date>"; "Page X of Y"). The first page has a title block, and the last page a Data Privacy Act note.
- [x] Only the case record is printed: no sidebar, navbar, buttons, map or gallery controls. Up to 4 of the report's own photos are printed as thumbnails; later care-log and evidence attachments, videos and documents are left out.
- [x] Each role's printout is a copy of the panel that role sees on screen, so it never adds contact details. The admin's reporter contact card is not part of it.
- [x] Long cases continue cleanly: sections, comments and disputes are not split across pages; the comment list flows over as many pages as it needs.
- [x] Audit log: `POST /reports/{id}/print-log` (officials only, same visibility check as viewing the report) writes one `audit_logs` entry, action `EXPORT_CASE_RECORD`, type `security`, naming who, which report and when. It returns the official's name, role and the server time for the footer. The button calls it first; if it fails, printing still happens with the name stored in the browser. No new table.
- [x] Chrome print-to-PDF checked: every page is 612 × 792 pt (8.5 × 11 in); report 1 prints on 2 pages (page 1 is full); a long case with 36 comments prints on 5 pages with no blank pages; readable at 100%.
- Found and fixed while testing: the pet thumbnail is lazy-loaded, and a lazy image in the hidden print frame never loads, so the print would have waited forever on any case with a pet photo. The printout now loads its images immediately. The app's page background (a layered `!important` rule) also tinted the printout gray; the printout now sets that color to white.
- Tests: `backend/tests/test_report_print_log.py` (18 checks) and the print part of `frontend/tests/historyCaseSummary.browser.mjs` (leader, staff with the log failing, admin; real PDF rendered and checked).

#### Phase 6 revision (2026-11-03): what the printout leaves out, and a formal layout

Decided by the developer ("yes to all", 2026-11-03). The on-screen panel is unchanged; this applies to the printout only.

| Detail | In the printout |
|---|---|
| Comments | Left out |
| Disputes | Number, date filed, status and date resolved only; no names, reasons or review notes |
| Observation extension reason | Left out ("Extended: Yes, by N days" stays) |
| Visibility section | Left out |
| AI photo check and AI priority reason | Left out (AI tags on animal details and the AI-suggested priority stay, marked as reference) |
| Incident photos | Left out (they can show people, house numbers or plates) |
| Owner name, "Returned to" name | Kept |
| Pet's registered photo | Kept |
| Officials' remarks and notes | Kept |

- The printout no longer copies the on-screen cards. `frontend/src/utils/casePrint.ts` builds a document from the report:
  - a title block (report no., category, date reported, status, location);
  - numbered sections with plain ruled tables, and warnings and disputes as small tables;
  - a line naming what is not included, "Prepared by" and "Noted by" signature lines, and the privacy note;
  - page header and footer as before.
- Tests: the print part of `historyCaseSummary.browser.mjs` adds a long case with an extension reason and a dispute's private details, and checks that every left-out item is absent and every kept item present, for all three roles.

### Phase 7: Verify and record
- [ ] `npm --prefix frontend run build` passes
- [x] Each Phase 0 test report shows the expected details on all three pages, at 1280 px and 390 px (mocked report 1 in `historyCaseSummary.browser.mjs`)
- [ ] Resident accounts can't reach these pages, and leaders still can't see contact details hidden by the API
- [ ] Change record in `docs/05-operations/agents/feature-updates/`
- [ ] Update this document's status and tick off the findings

## Decisions (developer, 2026-11-02)
- **Reporter's name:** leaders keep seeing it on the history page. Reporter contact details (phone, email) stay hidden from leaders.
- **Print / PDF:** in scope, for barangay records (Phase 6).
- **Print audit log:** yes, as a small entry in the existing audit log (Phase 6).
