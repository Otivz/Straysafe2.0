# Warning Notification and Letter Template Management Enhancement

- **Date:** 2026-11-17 09:30 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `backend/app/models/warning_letter.py`, `backend/app/models/__init__.py`, `backend/app/main.py`, `backend/app/services/warning_letters.py`, `backend/app/routes/warning_letters.py`, `backend/app/schemas/warning.py`, `backend/app/routes/warnings.py`, `backend/app/schemas/complaint.py`, `backend/app/services/complaints.py`, `backend/app/services/case_view.py`, `backend/app/utils/push_categories.py`, `backend/app/routes/notifications.py`, `backend/app/services/push_service.py`, `backend/tests/test_warning_letters_and_notifications.py`, `frontend/src/live/http.ts`, `frontend/src/admin/data/types.ts`, `frontend/src/admin/data/actions.ts`, `frontend/src/admin/live/api.ts`, `frontend/src/admin/live/adapters.ts`, `frontend/src/admin/live/actions.ts`, `frontend/src/admin/pages/WarningTemplatesPage.tsx`, `frontend/src/admin/AdminApp.tsx`, `frontend/src/admin/layout/Sidebar.tsx`, `frontend/src/admin/pages/SettingsPage.tsx`, `frontend/src/admin/dialogs/ActionDialogs.tsx`, `frontend/src/admin/pages/case/ActionsTab.tsx`, `frontend/src/admin/pages/complaints/ComplaintDialogs.tsx`, `frontend/src/admin/pages/complaints/ComplaintPage.tsx`, `frontend/src/resident/data/types.ts`, `frontend/src/resident/components/icons.ts`, `frontend/src/resident/live/api.ts`, `frontend/src/resident/live/adapters.ts`, `frontend/src/resident/pages/account/WarningsPage.tsx`, `frontend/src/resident/pages/account/WarningLetterPage.tsx`, `frontend/src/resident/ResidentApp.tsx`, `frontend/src/resident/pages/account/ProfilePage.tsx`, `frontend/src/resident/pages/HomePage.tsx`, `frontend/src/resident/pages/reports/ReportDetailsPage.tsx`, `frontend/tests/residentLiveAdapters.test.mjs`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-17_0930_warning-notifications-and-templates.md`
- **Authorization:** User request: "STRAY-SAFE 2.0: Warning Notification and Letter Template Management Enhancement"
- **Type:** Feature

## Intent

Enhance the existing Owner Warning (`OwnerWarning`) and Complaint Enforcement (`letter_1` / `letter_2`) modules with:
1. Automatic, tracked resident notifications whenever a warning is issued (linking an immutable warning letter directly to the resident notification, preserving failed delivery states with manual retry, and never marking notifications read upon generation).
2. Versioned Warning Letter Template Management with `.docx` import, in-app template editor, live preview with missing-field validation, default toggling, activate/archive status, and PDF/DOCX exports without adding new external dependencies.

## Key changes

### Backend (`backend/`)
- Added `WarningLetterTemplate`, `WarningLetterTemplateVersion` (with immutable version snapshots and `source_docx_bytes`), and `GeneratedWarningLetter` (immutable rendered letter + notification delivery and `viewed_at` tracking) in `app/models/warning_letter.py`, registered in `app/models/__init__.py` and `app/main.py`.
- Implemented `app/services/warning_letters.py` using Python stdlib (`zipfile`, `xml.etree.ElementTree`) for DOCX parsing/export (including split XML `<w:r><w:t>` run replacement) and pure-Python Type1 multi-page A4 PDF writer, plus dynamic placeholder resolution (`{{resident_name}}`, `{{resident_address}}`, `{{pet_name}}`, `{{pet_type}}`, `{{case_reference}}`, `{{warning_reference}}`, `{{warning_level}}`, `{{violation_description}}`, `{{incident_date}}`, `{{issue_date}}`, `{{required_action}}`, `{{policy_reference}}`, `{{issued_by}}`, and summons/subdivision fields).
- Added `/warning-templates` and `/warning-letters` API routers in `app/routes/warning_letters.py` for CRUD, `.docx` import, preview, default/archive controls, resident read-receipt tracking on letter open/download, PDF/DOCX download, and manual notification retry.
- Updated `app/routes/warnings.py`, `app/schemas/warning.py`, `app/services/complaints.py`, `app/schemas/complaint.py`, and `app/services/case_view.py` to generate immutable `GeneratedWarningLetter` records on issuance/preparation, trigger resident notifications with failure isolation, and log `WARNING_LETTER_GENERATED` / `WARNING_NOTIFICATION_RETRIED` / template audit events.
- Updated `app/utils/push_categories.py`, `app/routes/notifications.py`, and `app/services/push_service.py` so `warning` / `warning_letter` notifications route to `/resident-app/warnings/{letter_id}` (or `/resident-app/warnings`) and remain visible to the warned owner.

### Frontend (`frontend/`)
- Admin / Subdivision Leader portal: added `/warning-templates` (`WarningTemplatesPage.tsx`), upgraded `WarningDialog` (`ActionDialogs.tsx`), `ActionsTab.tsx`, `ComplaintDialogs.tsx`, and `ComplaintPage.tsx` to support template selection, live preview with missing-field warnings, PDF/DOCX download, delivery/read-status badges, and Retry Notification.
- Resident portal & Android bundle: added `/warnings` (`WarningsPage.tsx`) and `/warnings/:letterId` (`WarningLetterPage.tsx`), Home dashboard attention rows, Profile menu entry, Case Details (`ReportDetailsPage.tsx`) warning letters card, and notification adapter routing (`resident/live/adapters.ts`).

## Validation evidence

- `python -u tests/test_warning_letters_and_notifications.py` (isolated offline SQLite via `_isolated_db.py`): **29/29 checks passed** (template seeding/creation/versioning/DOCX import/default/archive, missing-field preview & 422 refusal, `issue_warning` + unread notification creation, template immutability post-issuance, resident 403/read-receipt tracking, `pypdf` PDF parsing & DOCX placeholder export, failure preservation & retry, and complaint `letter_1` prepare/issue generation).
- `node --test` in `frontend/`: **200/200 tests passed** (including new warning notification adapter routing check in `frontend/tests/residentLiveAdapters.test.mjs`).
- `npm --prefix frontend run build` (`tsc -b && vite build`): exited 0, 2100 modules transformed.
- `$env:VITE_API_BASE_URL='https://api.example.com'; npm --prefix frontend run build:android` (`tsc -b && vite build --mode android`): exited 0, 2005 modules transformed (excludes Admin bundle).
