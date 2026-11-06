# Subdivision-only restructuring: guide and checklist

- **Status:** Approved direction. **Phases 1 (backend gate), 2 (referral log) and 3 (screens, parts 3a to 3d) implemented 2026-11-05; Phase 4 (statuses, analytics and wording) implemented 2026-11-06.** Phases 5 and 6 are not started and need the developer's go-ahead one at a time.
- **Written:** 2026-11-05. File and line references are as of commit `73f0ebf` on branch `subdivision-only` (`main` after PR #102). Function and route names are stable; re-grep a line number before editing.
- **Deadline:** 2026-11-16. Estimated effort: 5 to 6 working days (approximate, from the line and test counts below).
- **How to use this file:** each phase lists exact files and a checklist. Do one phase, test it, write the change record, stop for review.

## 1. Decisions (developer, 2026-11-04)

| Topic                                | Decision                                                                                                             |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Client                               | Selera Homes Subdivision only; the Barangay is an external party                                                     |
| Approach                             | **Hybrid:** gate Barangay access in the backend, keep all data, add a Barangay Referral log, delete code later |
| Holding, adoption, claiming, impound | Retired from active use; the Administrator keeps a **read-only** archive                                       |
| Resident adoption and claim pages    | Retired too. Lost-pet alerts and "Pet Recovered" for lost-pet reports stay                                           |
| Statuses 5, 6, 8, 13 for new cases   | Become **external update types**; status 4 means "Referred to Barangay"                                        |
| Barangay user (id 4, Head Officer)   | **Delete after a database backup**, as the last step (see Phase 6 for the data effects)                        |
| Revert plan                          | Branch `subdivision-only`, tag `legacy-two-client-2026-11-04`, a separate database `straysafe_subdivision`     |

## 2. Rules for every phase

- Never edit `.env*`, commit, push, or run a destructive command unless the developer asks for that exact action (`AGENTS.md`).
- Ask before any schema change, migration, dependency change or deployment.
- Write a change record in `docs/05-operations/agents/feature-updates/` per phase, and update `docs/README.md` for new docs.
- Run the strict docs audit before finishing: `npx @ghostbyte/agent-docs-kit@latest audit documentation --strict`.
- Test against the **copy database** (`straysafe_subdivision`), never `straysafe_db`.
- External information is never shown as something StraySafe did: label it "Reported by Barangay, recorded by <leader></leader>".
- An external update never sets `facility_id`, `custody_status` or "held" (the location rule, `utils/reportStatus.ts` `isHeldInFacility`, `routes/reports.py` `populate_location_and_facility_info`).

## 3. Verified facts that shape the plan

- **The leader's escalation is a rescue request.** `SubdViewReport.tsx:762` and `SubdReports.tsx:538` call `POST /rescue-requests/`. The Escalated Missions and Endorsement pages read `/rescue-requests` (`EndorsementArch.tsx:129,175,281`, `EscelatedMissions.tsx`). So the referral log must exist **before** rescue routes are retired.
- **Retire by endpoint, not by router.** Several kept features call endpoints inside routers that are otherwise retired:
  - `/claims/proof-on-file`: `components/OwnerReturnPicker.tsx:328`, `pages/citizen/PetMatchReview.tsx:74`;
  - `/claims/` create, list and status: `PetMatchReview.tsx:260,421,619,693`, `components/Modals/CompleteHandoverModal.tsx:206`;
  - `/holding/by-report/*`, `GET /holding/*`: `ResiViewReport.tsx`, `AdminReportView.tsx`, `SubdViewHistory.tsx`, `utils/caseTimeline.ts` (historical care and custody timeline). Keep reads.
- **Single access chokepoints:** `get_current_user` (`backend/app/utils/auth.py:304`, built on `get_pending_user` at `:221`) and `get_current_staff_or_admin` (`:331`, roles `[2, 3, 4]`). Many routes use `get_current_user` then check the role inside the route (`adoptions.py` 22 routes).
- **Login:** `POST /auth/login` (`routes/auth.py:260`).
- **The local database:** 1 Barangay (San Vicente), 1 subdivision (Selera Homes), 1 role-3 user, 10 reports (statuses 2, 6, 9, 11), 3 rescues, 10 rescue assignments, 2 holding records, 3 endorsement letters, 0 adoptions, 0 claims.
- **PR #102 (live GPS)** is in the base: `frontend/src/utils/liveNavigation.ts`, `MapComponent.tsx`, `BrgyRescueRequests.tsx`, `BrgyReportView.tsx`, `SubdViewReport.tsx` (dispatch and pickup GPS). It is part of the dispatch workflow being retired.

## 4. Phase 0: Safety (no code)

- [X] Branch `subdivision-only` created from `main` (`73f0ebf`).
- [X] Tag `legacy-two-client-2026-11-04` created locally. Push it: `git push origin legacy-two-client-2026-11-04`.
- [X] Back up today's data **outside the repo**: `mysqldump -u <user> -p straysafe_db > C:\Users\User\Desktop\straysafe_backup_2026-11-05.sql`.
- [X] Create `straysafe_subdivision` (utf8mb4, `utf8mb4_unicode_ci`), load the backup into it.
- [X] Developer points `DATABASE_URL` at `straysafe_subdivision` (the AI does not edit `.env`).
- [X] Verify (read-only) the app is connected to `straysafe_subdivision`.
- [X] Baseline (backend, 2026-11-05): 121 of 122 pass at `73f0ebf`; `test_multi_animal_split` already failing. Browser tests not re-run. Details in the Phase 1 change record (`docs/05-operations/agents/feature-updates/2026-11-05_1018_subdivision-only-phase1-barangay-gate.md`). Previously noted: run the backend suites and browser tests, and record which pass. Known failing before any change: `frontend/tests/petClaimRecords.browser.mjs`, `phase2Holding.browser.mjs`.

## 5. Phase 1: Backend access gate (about 1 day)

**1a. Decide which endpoints stay.** List every route in the retiring routers and mark each Keep (read-only history, or used by a kept feature) or Retire (write or workflow). Known keeps are in section 3.

- [X] A code setting `BARANGAY_WORKFLOWS_ENABLED`, default **off** (code default, no `.env` edit needed), read in one place (`backend/app/utils/auth.py` or a new `backend/app/utils/retired.py`).
- [X] `backend/app/utils/auth.py:304` `get_current_user`: when off, refuse role 3 with 403 and a clear message. *Done in `get_pending_user`, so every dependency built on it is covered, plus `get_optional_user` and the unused `get_actor_user` helpers in `routes/matches.py` and `routes/pets.py`.*
- [X] `backend/app/routes/auth.py:260` `login`: when off, refuse role 3 sign-in. *Also Google sign-in, OTP verification, `finish_login` (login code and 2FA) and token refresh.*
- [X] A shared dependency `retired_workflow` (new, in `backend/app/utils/retired.py`): refuses **write** methods for all roles with a clear "handled outside StraySafe" message; allows `GET` for the Administrator, and for kept read endpoints.
- [X] Attach it per route (not per router) in: `routes/rescue.py` (all 8 routes), `routes/holding.py` (writes), `routes/adoptions.py`, `routes/adoption_tasks.py`, `routes/adoption_chat.py`, `routes/adoption_certificates.py`, `routes/claims.py` (all except the keeps), `routes/claim_assessments.py`. The `app.include_router` lines are in `backend/app/main.py:1983-2017`. *Done as one dependency on each of the nine `include_router` lines that decides per route (method plus route template) from the `KEPT_WRITE_ROUTES` list in `utils/retired.py`. Kept writes: `POST /rescue-requests/`, `POST /claims/`, `PATCH /claims/{claim_id}/status`. All reads stay open (history).*
- [X] Leave `POST /rescue-requests/` open for leaders **until Phase 3 replaces it** (the leader's escalation uses it).
- [X] Notifications and emails (stop sending to Barangay roles): *Done centrally: `queue_email` (`services/email_service.py`) and the push `skip_reason` (`services/push_service.py`) drop Barangay recipients. In-app rows to role 3 are still written but cannot be read. Re-pointing each site below to the leader is Phase 2/3 work, with the referral log.*
  - `routes/reports.py:4238` (status 4 emails every role 3/4 user; `email_templates.render_brgy_escalated_report_email`, `services/email_templates.py:539`);
  - `routes/rescue.py:255`; `routes/holding.py:1103`; `routes/owner_followups.py:651`;
  - `routes/matches.py:1983`; `routes/chat.py:636`; `routes/pets.py:154`;
  - `utils/matching_scope.py:118`; `utils/adoption_authority.py:228`; `routes/adoptions.py:300,557`; `routes/adoption_chat.py:163-214`; `routes/adoption_tasks.py:207`.
- [X] Background tasks: `tasks/unassigned_checker.py:125-230` (overdue-holding reminders) off; fix the role list at `:159` (`[3, 4, 5]`; role 5 does not exist and role 4 is the Administrator).
- [ ] Remove Barangay push links: `utils/push_categories.py:128-139`. *Deferred to code deletion: no push reaches role 3 now, and the links are needed if the switch is turned back on.*
- [X] `require_barangay_approval` (`routes/reports.py:3440`) no longer blocks anything once role 3 is gated; keep it harmless. *Unchanged.*
- [X] Tests: a role-3 token is refused on every route; a role-3 login is refused; Admin `GET` works; writes refused for all; the kept endpoints still work. New file `backend/tests/test_barangay_gate.py`.

## 6. Phase 2: Barangay Referral log (about 2 days; needs approval for the schema change)

Reuse: `EndorsementLetter` (`models/report.py`, one per report: `letter_content`, `file_url`, `leader_id`), `StatusHistory`, `ReportMedia`, `audit_logs`.

- [X] Ask approval, then add two tables (created by `create_all`, listed in `Database3.3.txt`):
  - `barangay_referrals`: `referral_id`, `report_id`, `barangay_id` (FK `barangays`), `referred_by`, `referred_at`, `reason`, `reference_no`, `contact_method` (call, visit, message, letter, other), `final_outcome`, `outcome_recorded_by`, `outcome_recorded_at`;
  - `barangay_referral_updates`: `update_id`, `referral_id`, `update_type` (acknowledged, dispatched, picked up, held, impounded, claimed, adopted, not found, other), `source` (`barangay_reported` | `straysafe_user`), `update_date`, `note`, `evidence_url`, `recorded_by`, `recorded_at`.
- [X] New `backend/app/models/barangay_referral.py` (import in `models/__init__.py`), schemas, and `backend/app/routes/barangay_referrals.py` registered in `main.py`:
  - `POST /reports/{id}/referral` (create), `GET /reports/{id}/referral`, `POST /referrals/{id}/updates`, `POST /referrals/{id}/outcome`;
  - leader (own subdivision via `verify_subdivision_scope`) and Administrator only; every write is audited.
- [X] Rules enforced in the route: an update never touches `facility_id`, `custody_status` or the holding tables; a final outcome may close the report with one of the closing statuses (9, 10, 11, 12, 17) with a history entry marked external.
- [X] Referral creation sets status 4 and keeps the endorsement letter; it no longer creates a `Rescue` row.
- [X] Back-fill: leave the 3 existing endorsement letters and rescues as they are (no automatic migration).
- [X] Tests: `backend/tests/test_barangay_referrals.py` (access scope, audit entries, no custody change, outcome closes the report once, other subdivision refused).
- *Done 2026-11-05. Approved choices: the subdivision's own Barangay only (San Vicente); a final outcome closes the report. Added beyond the list: `outcome_date`, `outcome_note`, `GET /referrals/`; an older status-4 case may get a referral record without a status change. See [BARANGAY_REFERRAL_LOG.md](../01-system/BARANGAY_REFERRAL_LOG.md).*

## 7. Phase 3: Screens (about 1 to 2 days)

**Leader.**

- [X] `pages/Subd_Leaders/SubdViewReport.tsx:762` and `SubdReports.tsx:538`: replace `POST /rescue-requests/` with the referral create call.
- [X] A "Barangay Referral" card on `SubdViewReport.tsx` (date, reference, method, updates, outcome) with "Record Barangay update" and "Record outcome" actions.
- [X] `pages/Subd_Leaders/EndorsementArch.tsx` and `EscelatedMissions.tsx`: read referrals instead of `/rescue-requests`.
- [X] Timeline: `components/RescueTimeline.tsx` and `utils/caseTimeline.ts` label external updates "Reported by Barangay, recorded by <leader></leader>".
- [X] `utils/casePrint.ts` and `components/History/CaseSummaryPanel.tsx`: include the referral, labelled external.
- [X] `components/SubdSidebar.tsx`: remove `/subd/holding-facility` (line 207) and `/subd/pet-claims` (line 239); keep `/subd/endorsements` (line 272), renamed "Barangay referrals".
- [X] `routes/AppRoutes.tsx`: remove the leader routes for holding and pet claims (lines near 170-176).
- *Part 3a done 2026-11-05 (change record `2026-11-05_1100_subdivision-only-phase3a-leader-referral-screens.md`). The status change to 4 is kept before the referral so its side effects still run. `EscelatedMissions.tsx` is not routed; left for deletion. Case Summary and print needed no change: the closing entry already reads "Reported by Barangay … recorded by …". The two routes redirect to `/subd/endorsements` instead of being removed.*

**Barangay pages and routes (hide).**

- [X] `routes/AppRoutes.tsx`: replace the `/brgy/*` block (about lines 182-200) and the `[3, 4]` block (about 223-226) with a redirect to a short "handled outside StraySafe" page. Remove the duplicate `/brgy/adoptions` registration.
- [X] Remove the staff-login routes for Barangay: `pages/Subd_Leaders/CommunityStaffLogin.tsx:53`, `components/ProtectedRoute.tsx:124`, `components/Auth/SessionGuard.tsx:13,29`, `utils/useSignedInUser.ts:22`, `pages/citizen/ResidentsLogin.tsx:59`.
- [X] `/brgy` references in shared code (replace or drop): `components/Chat/ReportChatDrawer.tsx:155,222,235`, `Chat/MessagesDropdown.tsx:346`, `components/MapComponent.tsx:1681`, `Modals/WarningDetailsModal.tsx:99-128`, `PetRecords/PetDetailPanel.tsx:107,1297`, `ManualMatching/ManualMatchingWorkspace.tsx:950-952`, `utils/chatLinks.ts:8`, `utils/petClaimLink.ts:6`, `utils/api.ts:67,130`, `utils/inactivity.ts:19,100`, `components/PushBridge.tsx:17`, `RoleThemeSync.tsx:10`, `context/ThemeContext.tsx:43`, `pages/citizen/AnimalJourneyMap.tsx:24-26,217,618`.
- *Part 3b done 2026-11-05 (change record `2026-11-05_1122_subdivision-only-phase3b-barangay-pages-retired.md`). Only the links a leader, resident or Admin can still reach were changed; `/brgy` checks that apply only on a Barangay page are left for code deletion. `holdingStayLimit.browser.mjs` fails (retired feature) and is for Phase 5.*

**Admin.**

- [X] `/admin/holding-facility` and `/admin/adoptions` (`AppRoutes.tsx`, `components/AdminSidebar.tsx:165,188,325-326`) become read-only archive views (hide the write actions in `BrgyHoldingFacility.tsx` and `BrgyAdoptions.tsx`, or point them at a small read-only list).
- [X] `pages/Admin/AdminReportView.tsx`: show the referral; hide the Barangay action cards.
- *Part 3c done 2026-11-05 (change record `2026-11-05_1207_subdivision-only-phase3c-admin-archive.md`). Write buttons are hidden (holding: the page's leader read-only mode; adoptions: `data-archive-write` plus one CSS rule). Direct Override drops statuses 5, 6 and 8.*

**Residents.**

- [X] Remove the adoption and claim entry points: `components/Navbars/LandingPageNavbar.tsx:46`, `components/Navbars/ResiNavbar.tsx:516,519,635,658`, `components/PetRecordRequestsForResident.tsx:17` (ownership claims stay; check).
- [X] Routes: `/adopt`, `/adopt/journey*`, `/adopt/apply/:id`, `/adopt/applications`, `/resident/pet/:petId/claims-dashboard` (`AppRoutes.tsx:107-152`): redirect to a "no longer available" page.
- [X] `pages/citizen/PetMatchReview.tsx`: **keep the owner YES/NO confirmation; remove the claim filing** (lines 74, 260, 421, 619, 693). See open decision 1.
- *Part 3d done 2026-11-05 (change record `2026-11-05_1215_subdivision-only-phase3d-resident-pages.md`). Retired pages show a "no longer available" page; `/admin/adopt/journey*` and `/verify/certificate/:number` are kept read-only.*

## 8. Phase 4: Statuses, analytics and wording (about 1 day)

- [X] Relabel `REPORT_STATUS_MAP` (`frontend/src/utils/reportStatus.ts`): 4 "Referred to Barangay". Keep 5, 6, 8, 13 defined and readable for old reports; stop offering them for new cases.
  - Phase 4: shared label and historical status definitions retained; both Admin pickers exclude retired choices, and legacy escalation URLs still work. Type check, 13 unit checks and Admin archive browser checks pass.
- [X] Update active leader, resident and Admin wording for referrals to the external Barangay.
  - Phase 4: case-status captions, referral document, observation page and dashboard/referral links updated; stored history and letter text preserved. Type check and referral, Admin archive and history/print browser checks pass.
- [X] Update the landing page for the three active roles and the subdivision-only workflow.
  - Phase 4: Barangay card hidden; retired adoption, holding and dispatch descriptions replaced by referrals and owner follow-ups. Type check and resident browser checks pass.
- [X] `backend/app/services/analytics_service.py:44,122-198`: keep counting old statuses; add referral counts and outcomes; hide rescue-duration stats if empty.
  - Phase 4: referral-date counts and all five outcomes added on both pages and CSV; old counts retained, missing rescue timings hidden. Type check, 41 accuracy checks, 14 analytics tests and 10 browser scenarios pass. See ANALYTICS_RULES.md for the date/outcome contract.
- [X] Heatmap and legends: `frontend/src/pages/Admin/AdminHeatMap.tsx`, `utils/heatmap.ts`.
  - Phase 4: referral label and observation/legacy-custody legend updated, including old server status text. Counting, colors, positions and thresholds unchanged; type check and all 16 heatmap rules pass.
- [X] `backend/app/utils/owner_followups.py:429,539` ("Endorsed to Barangay San Vicente"): use the referral's Barangay name.
  - Phase 4: display uses the recorded referral recipient, falling back to the subdivision's Barangay or a generic label. Observation/warning behavior unchanged; type check and 44 follow-up, 33 observation-flow and 33 status-sync checks pass.
- [X] Status 7 means the owner observation only; recorded historical holding intakes remain separate.
  - Phase 4: corrected progress/timeline fallbacks, Admin captions and observation/impound filters. Ten observation unit checks and dedicated leader/Admin browser assertions pass, including preserved actual intakes. Full backend remains 123/124 before and after; all 12 frontend scripts pass. The docs audit retains 12 pre-existing failures (8 links plus 4 intentional pointer deletions).

## 9. Phase 5: Tests, documents and defense (about 1 to 2 days)

- [ ] Backend tests for retired areas become "expected refusal" tests or move to `backend/tests/legacy/` (not run by default): `test_adoption_*` (10 files), `test_claim_*`, `test_case_claims`, `test_claims_scope`, `test_holding_*`, `test_leader_claimed_chat`, `test_match_claim_shortcut`, `test_owner_return`, `test_pet_adoption_lock`, `test_pet_handover_sync`, `test_admin_010_direct_action`, `test_case_closure`. Keep a record of which, and why.
- [ ] Frontend: update or retire `adoptionDetails`, `claimFees`, `claimEvidence`, `petClaimRecords`, `phase2Holding`, `holdingStayLimit` browser tests, and `claimCharges.test.mjs`; keep `locationIntelligence`, `historyCaseSummary`, `caseSummary`, `lostPets`.
- [ ] New browser test for the leader's referral card and the hidden `/brgy` routes.
- [ ] Docs: `docs/01-system/overview.md`, `HOLDING_PLACE_AND_CUSTODY_RULES.md`, `CLAIM_*`, `ADOPTION_*` marked retired; `docs/README.md`; `docs/02-project/DEFENSE_PLAN.md` (demo steps 6 to 10 used the Barangay); the manuscript's role and scope text (title unchanged); `Database3.3.txt`.
- [ ] Final run: all remaining backend suites and browser tests, type check, lint comparison, strict docs audit.

## 10. Phase 6: Delete the Barangay user (last, after Phases 1 to 5 pass)

Measured on the local database for user 4 (Kyla Bianca Frias):

| Effect                                | Rows                                                                                                                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Deleted (cascade)                     | 16 notifications, 10 rescue assignments, 3 push subscriptions, 1 notification preference                                                                           |
| "Who did it" becomes empty (SET NULL) | 35 audit entries, 13 report-history entries, 6 email logs, 4 holding timeline entries, 2 holding intakes, 2 owner returns, 2 pet-history entries, 1 system setting |

- [ ] Fresh `mysqldump` right before the delete (outside the repo).
- [ ] Export the user's activity to a CSV **outside the repo** first: their `audit_logs` and `status_history` rows (`user_id = 4`, `updated_by = 4`).
- [ ] Re-run the count query on the copy database; confirm the numbers.
- [ ] Developer approves the exact delete statement; run it on `straysafe_subdivision` only.
- [ ] Re-test history pages and the case record print (blank officers are expected for those rows).
- [ ] Decide the same for `straysafe_db` only after the demo is final.

## 11. Open decisions

1. **Resolved 2026-11-05 (part 3d):** **What replaces the claim step in `PetMatchReview`?** Chosen as proposed: after the owner says YES, show "Contact your Subdivision Leader", and the leader records the outcome in the referral log.
2. The owner-return flow (`OwnerReturnPicker`, `report_returns`) stays for leader-resolved lost pets; confirm it needs no claim proof (`/claims/proof-on-file`) and if not, retire that endpoint too.
3. Does the Administrator keep read access to adoption certificates and the public certificate verification page (`/verify/certificate/:number`)?
4. The referral's receiving Barangay: San Vicente only, or a list?
5. How long is old Barangay data shown to the Administrator?

## 12. Do not delete or change without approval

`users` and role-3 accounts (until Phase 6), `barangays` and `landmarks`, `endorsement_letters`, `status_history`, `audit_logs`, `notifications`, rescue, holding, adoption and claim tables and their rows, status definitions 4 to 18, `Database3.3.txt` (only add the new tables), the owner observation and warning flow, lost-pet alerts, AI matching and owner-first confirmation, the location rule, the history Case Summary and case record print, `.env*` files.

## 13. Revert procedure

- **Code:** `git checkout main`.
- **Data:** set `DATABASE_URL` back to `straysafe_db` (never modified).
- **Restore the copy from the backup** if it was changed.
- **Gate off:** set `BARANGAY_WORKFLOWS_ENABLED=true` to re-enable Barangay access while the code is still present (before Phase 6 and before any deletion of code).
- **Legacy snapshot:** `git checkout legacy-two-client-2026-11-04`.

## 14. Risk summary

| Risk                     | Why                                                             | Mitigation                                                                                                      |
| ------------------------ | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Leader escalation breaks | It is a rescue request today                                    | Build the referral first (Phase 2), switch the leader's calls (Phase 3), then retire rescue writes              |
| Kept features break      | Claims endpoints shared by owner return and match review        | Retire per endpoint; list the keeps in Phase 1a                                                                 |
| Regressions in tests     | 105 backend test files mention Barangay data                    | Gate tests first; retire areas deliberately; keep a record                                                      |
| Blank "who did it"       | SET NULL on 13 history and 35 audit rows when user 4 is deleted | Export first; delete last; accept on the copy database first                                                    |
| Time                     | 12 days to the deadline, defense also due                       | Phases are independent; stop after Phase 3 if needed, since 1 to 3 already give a working Subdivision-only flow |
