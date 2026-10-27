# Manuscript Chapter 1 vs the system (STRAYSAFEEE1.pdf)

- **Checked:** 2026-10-26, against the code in this repository (working tree of that day).
- **Document:** `STRAYSAFEEE1.pdf`, 33 pages: cover, Chapter 1 (Project Rationale, Review of Related Literature and Studies, Statement of the Problem, Objectives, Scope and Delimitation, Significance, Theoretical and Conceptual Framework, Hypothesis).
- **Method:** every claim about what the system does was compared with the code (file references below). Claims about outside facts (statistics, laws, studies) were **not** checked; this repository can't verify them.
- **Earlier check:** `CHAPTER_1_2_SYSTEM_CHECK.md` (root) reviewed an older version of Chapters 1–2.

## Rating: 8.4 / 10

| Area | Score | Why |
|---|---|---|
| Matches the system | 8.0 | Most scope items are built exactly as written; 4 statements describe the system differently from how it works (table below) |
| Internal consistency | 8.5 | Problems, objectives, scope, framework and hypothesis line up; one mismatch on who was interviewed |
| Structure and clarity | 9.0 | Module-based scope, clear delimitation, honest "integrative, not technical" novelty claim, AI framed as decision support |
| Research design | 8.5 | Clear TAM hypothesis, one-tailed one-sample t-test, 2.51 benchmark explained, ISO ratings kept descriptive |
| Language | 8.0 | A few grammar and wording slips (list below) |

The manuscript is strong. The fixes below are small, but the first four matter because a panel can test them on the live system.

## Statements that don't match the system (fix before defense)

| # | Manuscript says (page) | System actually does | Evidence | Suggested fix |
|---|---|---|---|---|
| 1 | Residents submit a report with a "visibility setting (private report or public sighting)" (p. 20) | Residents **don't** choose. Every report starts **Private**, and the Subdivision Leader decides whether it becomes Public | `backend/app/routes/reports.py`, `create_report` ("Nobody chooses visibility when filing… every report starts Private"); `backend/app/utils/report_visibility.py` | Change to: "…observed condition, and a map location. Every report starts private; the Subdivision Leader decides whether it is shown publicly as a sighting." Also update p. 21 Report Validation to mention the visibility decision |
| 2 | "Report priority is assigned by the system from predefined severity criteria; residents do not set it" (p. 21, p. 24) | The AI writes a **suggested** priority (`ai_suggested_priority`), but the report's `priority_level` is taken from what the resident's app sends, and residents can also change it when editing their own pending report | `create_report` stores `report_in.model_dump()` unchanged; `RESIDENT_EDITABLE_REPORT_FIELDS` includes `priority_level` (`reports.py`) | **Fix the system** (recommended), or soften the text. This is a code gap, not just wording |
| 3 | Subdivision Leaders "recommend a priority level", Barangay Staff "finalize" it, Administrators "review" it (p. 17, 21, 24) | Officials edit **one** priority field; nothing records the leader's recommendation separately from the barangay's final value. The endorsement letter has no priority field | `EndorsementLetter` model (`backend/app/models/report.py`); no `recommended`/`final` priority found | Either add a "recommended priority" to the endorsement (small change), or reword to "Subdivision Leaders set the priority when endorsing; Barangay Staff may adjust it" |
| 4 | "The location is validated against authorized subdivision **boundaries** through geofence validation" (p. 20) | The geofence is a **radius around a centre point**, set by the Administrator (default 1,000 m); the outline is drawn on maps but not enforced | `is_inside_reporting_coverage` (`reports.py`), `coverage_settings` | "…validated against the reporting coverage area, a radius around the subdivision centre that the System Administrator sets" |

## Statements that are incomplete (the system does more)

| # | Manuscript says | System also has | Suggested fix |
|---|---|---|---|
| 5 | Leader and staff accounts are "managed by System Administrators" (p. 19) | A **Barangay Head Officer** also creates staff accounts and manages their position, status and officer-in-charge flag; certificates are signed by the Head Officer | Add the Head Officer to User Account Management and to the Barangay Staff role description |
| 6 | Notifications are "in-app and email" (p. 22, 25) | **Web push** notifications are implemented (`backend/app/routes/push.py`) | Add "and browser push notifications". If you keep push out of the study scope, say so in the Delimitation |
| 7 | "a web application" (p. 14, 18) | An **Android app** (the same web app packaged with Capacitor) is built by GitHub Actions | Either mention it ("also packaged as an Android app") or state that the study evaluates the web version only |
| 8 | Development uses "a cloud-hosted relational database" (p. 18) | The database is **local MySQL** today; cloud hosting (Aiven) is planned, not done (`DEPLOYMENT_GUIDE.md`) | True only after deployment. Deploy before the evaluation, or write "a relational database (cloud-hosted for the pilot)" |
| 9 | Pet registration includes "behavior" (p. 22) | Since 2026-10-25, bite and chasing history is **verified only from incident reports**; owners can only *declare* history, not remove it | Optional: one sentence; it strengthens the accountability argument |

## Verified as written

| Claim | Evidence |
|---|---|
| Resident sign-up with email OTP or Google Sign-In; administrator emailed sign-in code | `backend/app/routes/auth.py`; tests `test_auth_google_otp`, `test_admin_2fa` |
| Password policy 12–128 characters, upper, lower, number, special | `backend/app/utils/password_policy.py` |
| Philippine phone format check | `normalize_ph_phone` |
| Admin AI settings, AI job monitor, system-wide audit log | `/matches/settings`, `/admin/ai-jobs`, `audit_logs` |
| Residents comment on and react to announcements | `POST /announcements/{id}/comments`, `/react` |
| Role-scoped heatmaps (subdivision / barangay / all) | dashboards; map audit |
| AI as decision support: cat-or-dog, photo authenticity, duplicates, pet matching | YOLOv8 + Gemini (`docs/AI_TECHNOLOGIES.md`); staff confirm |
| Report tracking, comments, case messaging, disputes | report and chat routes; `report_dispute` model |
| Leader merge, reject, remarks, endorsement letter, local resolution | reports routes; `EndorsementLetter` |
| Mission statuses assigned, in transit, on site, completed, cancelled | `RescueAssignment.assignment_status` (`Assigned`, `In Transit`, `On Site`, `Completed`, `Cancelled`); "picked up" is a report status |
| Community alerts by barangay and subdivision; notification preferences | `announcements.py`; `notification_preference` model |
| Pet QR codes, scan history, public scan with finder contact and location | `pet_qr.py`; `/pet/scan/:token` |
| Ownership change accept/decline; ownership claims decided by leader or staff by custody | `pet_ownership.py`, `claims.py` |
| Holding facility with kennel slot, care notes, transfers, releases, deceased | `HoldingAnimal.kennel_slot` and holding routes |
| Adoption: blacklist check, scored interview, home-visit checklist, handover, verifiable certificate, check-ins on days 7, 14, 30 | `AdoptionInterview.total_score`, `checklist_notes`, `Day_7` / `Day_14` / `Day_30` milestones, `/verify/certificate/:number` |
| Public access limited to QR scan, adoption catalog, certificate verification | public routes in `frontend/src/routes/AppRoutes.tsx` (the catalog's animal journey page is part of browsing) |
| Near-real-time by periodic refresh, no SMS | polling in the frontend; no SMS service |
| Security: OTP, sign-in codes, token sessions, rate limiting, role-based access | `auth.py`, `slowapi`, role checks |

## Internal consistency

- **Who was interviewed:** Specific Problem 1 asks about challenges of "citizens, subdivision leaders, and barangay personnel", but Specific Objective 1 says key informant interviews were held with "subdivision leaders and barangay personnel" only, and the Introduction mentions the Barangay Captain too. Either add residents to the method or drop "citizens" from Problem 1.
- **Numbering:** the Specific Problems and Specific Objectives are not numbered; numbering them 1–7 and pairing them makes the 1-to-1 mapping visible.
- **Priority wording** appears in four places (p. 15, 17, 21, 24); make all four match whatever you decide for items 2–3.
- **Iterative Incremental model:** consistent between the framework and the conceptual figure.

## Language fixes

| Page | Now | Better |
|---|---|---|
| 3 | "While existing companion animal adoption and shelter platforms exist" | "Although companion animal adoption and shelter platforms exist" |
| 3 | "The Review of Related Literature and Studies discuss these systems" | "…discusses these systems" |
| 3 | "near-realtime" / "near-real-time" (mixed) | "near-real-time" everywhere |
| 18 | "SCOPES AND DELIMITATION" | "SCOPE AND DELIMITATION" |
| 12 | "Kannan et al. (2026)… stray-dog reports whose uploaded images are screened" | fine; check the year against the source |
| 13–14 | "Its novelty is therefore integrative and contextual rather than technical." | keep; it's a strong, honest line |

## Not checked

- Statistics and citations (DOH figures, PSA 2024 census, Bulacan PHO, the bills and studies, the 2026 dates). Verify each against its source; several cite 2026 sources, so confirm they are published.
- Chapter 2 onward: not in this PDF.
- The 2.51 benchmark and four-point scale: consistent within the chapter; the instrument itself was not reviewed.
