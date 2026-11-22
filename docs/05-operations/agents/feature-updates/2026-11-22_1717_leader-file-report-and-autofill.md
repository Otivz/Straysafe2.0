# Leader files a report (self or on behalf) and auto-fill in the Leader's case forms

- **Date:** 2026-11-22 17:17 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `backend/migrations/2026-11-23_report_channel.sql`, `backend/app/db_migrations/report_channel.py`, `backend/app/main.py`, `backend/app/models/report.py`, `backend/app/schemas/report.py`, `backend/app/routes/reports.py`, `backend/app/utils/report_channel.py`, `backend/app/services/case_view.py`, `backend/app/services/case_summaries.py`, `backend/tests/test_report_channel.py`, `Database3.4_subdivision.sql`, `Database3.4_subdivision.txt`, `docs/05-operations/database/DATABASE_FILES_AND_MIGRATIONS.md`, `frontend/src/admin/pages/NewReportPage.tsx`, `frontend/src/admin/AdminApp.tsx`, `frontend/src/admin/pages/CasesPage.tsx`, `frontend/src/admin/pages/case/OverviewTab.tsx`, `frontend/src/admin/live/api.ts`, `frontend/src/admin/live/adapters.ts`, `frontend/src/admin/data/types.ts`, `frontend/src/admin/lib/autofill.ts`, `frontend/src/admin/components/AutoTag.tsx`, `frontend/src/admin/dialogs/ActionDialogs.tsx`, `frontend/src/admin/dialogs/CoordinationDialogs.tsx`, `frontend/src/admin/dialogs/ClosureDialogs.tsx`, `frontend/src/admin/styles/pages.css`
- **Authorization:** Developer request in session: auto-fill for the Subdivision Admin side (AI photo suggestions deferred), plus letting the Leader file a report for a person who called ("Reported by Kyla · via call") or as themselves ("Reported by Subdivision Leader"). Approved with "go na lahat" (except the AI part).
- **Type:** Feature

## Intent

A Leader can record concerns that reach them outside the app, attributed to the right person and channel, and the Leader's case forms start from what the case already holds.

## Key changes

- **Database** (migration, applied by hand): `reports.report_channel`, `reported_by_name`, `reported_by_contact`, `reported_on_behalf_of` (nullable; existing reports are "via app"). The backend refuses to start until they exist.
- **`POST /reports/`:** a Leader / Admin may send `report_channel` (`self`, `call`, `walk_in`, `message`, `other`), the person's name and contact, or a resident of the Leader's subdivision (name and phone then come from the account). Staff-filed reports need no photo and stay in the Leader's subdivision. Residents' values for these fields are dropped; residents still need a photo.
- **Case list and record:** the `reporter` block names the person who reported it, the channel label and who filed it. The case card shows "Reported by …", the Overview shows "Reported" and "Filed by"; "Message reporter" is offered only for in-app reports.
- **File a report page** (`/cases/new`, button on Cases): who reported it, how, optional resident (fills name and number), concern, animal, description, time (now), place (the Leader's GPS for their own sighting; nearest landmark within 200 m names the place), optional photos uploaded to the new case.
- **Auto-fill in the Leader's forms** (only empty / untouched fields; marked "Auto-filled"; always editable): Warning violation description from the report; Referral reason from the case; Record follow-up starting line per kind; Close case suggested disposition (invalid assessment, observed compliance, a referral that took over) with a draft reason, replaced if the Leader picks another outcome.
- AI photo suggestions were not added (deferred by the developer).

## Validation evidence

- `python tests/test_report_channel.py`: 19 checks passed (self, call with typed name, chosen resident, typed name wins, required name, unknown channel, other-subdivision resident, resident fields dropped and photo still required, case record and list).
- `test_resident_applications` 71, `test_found_animal_claims` 80 passed.
- Failures seen in `test_case_alerts`, `test_complaint_management`, `test_case_messaging` (resident reports without a photo, refused by the existing photo rule), `test_case_privacy_scope` (animal-type edit), `test_ai_audit_fixes` F9, `test_case_lifecycle` (settings defaults), `test_case_notes_queue` (merged-case count) are in code this change does not touch.
- `npx tsc --noEmit -p .` and `eslint` on the changed admin files: no errors. Not viewed in a browser.
