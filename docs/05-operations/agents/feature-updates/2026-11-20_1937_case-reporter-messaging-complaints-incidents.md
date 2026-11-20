# Direct Leader Messaging to Reporter on Complaint and Incident Cases

- **Date:** 2026-11-20 19:37 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `backend/app/services/case_messaging.py`, `frontend/src/admin/pages/complaints/ComplaintPage.tsx`, `frontend/src/admin/pages/case/OverviewTab.tsx`
- **Authorization:** User request in chat ("ThEN Lets do the subdivision")
- **Type:** Feature

## Intent

Subdivision Leaders could start a 1-to-1 conversation from Lost Pet and Found Animal cases, while Complaint (`ComplaintPage.tsx`) and ordinary Incident (`OverviewTab.tsx`) screens had no button to message the reporter/complainant directly. Adding this button across open Complaints and Incidents lets Leaders follow up inside StraySafe using the same single `direct` case thread.

## Key changes

- **`backend/app/services/case_messaging.py`:** Fixed `resident_of` so non-lost reports only label the resident as `finder` when `category_family` is `FOUND_ANIMAL` and otherwise use `reporter`, and populated `subject` via `_report_subject(report)` when opening a `direct` thread from the Leader side.
- **`frontend/src/admin/pages/complaints/ComplaintPage.tsx`:** Added `Contact <FirstName>` (opening `CaseMessagesDialog` with `party: 'reporter'`) and `View profile` links inside the `Complainant · private` card when the complaint is open and the complainant has a StraySafe account.
- **`frontend/src/admin/pages/case/OverviewTab.tsx`:** Added `Message reporter` (opening `CaseMessagesDialog` with `party: 'reporter'`) inside the `Reporter` card when the case is open and the reporter has a StraySafe account.

## Validation evidence

- `python -m py_compile app\services\case_messaging.py` -> exit code 0
- `npm run build` (`tsc -b && vite build`) in `frontend/` -> pending completion in final response
- `npx eslint src/admin/pages/complaints/ComplaintPage.tsx src/admin/pages/case/OverviewTab.tsx` -> pending completion in final response
