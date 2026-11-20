# Change record: External Referral Management (Create, Load, View, and Track Referrals)

- **Date:** 2026-11-19 22:44 (UTC)
- **AI tool:** Antigravity
- **Type:** Feature
- **Authorization:** Explicit developer request in chat session ("STRAY-SAFE 2.0 – External Referral Management (Create, Load, View, and Track Referrals): Modify the existing External Referral Management feature in STRAY-SAFE 2.0. Implement a complete referral workflow that allows authorized personnel to create referrals, retrieve existing referrals, monitor their status, document external agency responses, and record final outcomes.").
- **Files changed:**
  - `backend/app/models/barangay_referral.py`
  - `backend/app/utils/case_vocab.py`
  - `backend/app/schemas/case.py`
  - `backend/app/services/case_work.py`
  - `backend/app/services/case_view.py`
  - `backend/app/routes/cases.py`
  - `backend/app/main.py`
  - `database/migrations/2026-11-20_external_referral_management.sql`
  - `frontend/src/admin/data/types.ts`
  - `frontend/src/admin/data/constants.ts`
  - `frontend/src/admin/data/actions.ts`
  - `frontend/src/admin/live/api.ts`
  - `frontend/src/admin/live/adapters.ts`
  - `frontend/src/admin/live/actions.ts`
  - `frontend/src/admin/dialogs/CoordinationDialogs.tsx`
  - `frontend/src/admin/pages/case/ActionsTab.tsx`
  - `frontend/src/admin/pages/case/CaseDetailPage.tsx`
  - `frontend/src/admin/pages/case/CaseDialogs.tsx`
  - `frontend/src/admin/pages/case/dialogState.ts`
  - `frontend/src/admin/pages/case/monitored/Sections.tsx`
  - `docs/README.md`
  - `docs/05-operations/agents/feature-updates/2026-11-19_2244_external-referral-management.md`

## What changed and why

1. **Create External Referral (`ReferralDialog`, `case_work.create_referral`)**:
   - Enabled creating external referrals for any agency type (`barangay`, `veterinary`, `animal_control`, `animal_welfare`, `wildlife`, `other`) with a preset selector and editable custom organization name.
   - Added required fields: Case Reference (automatically retrieved), Receiving Organization/Agency, Referral Reason, Priority Level (`Normal`, `High`, `Urgent`), Referral Date (auto-populated current date/time, editable), Contact Method (`Phone`, `Email`, `In-Person`, `Other`), and Initial Referral Status (`Sent` or `Pending`).
   - Added optional fields: Contact Person, Contact Details, Supporting Documents (validated upload via `POST /cases/{report_id}/referrals/upload` with image/document preview and removal), and Additional Notes.
   - Added a confirmation step before submission, automatic `REF-YYYY-NNNN` reference generation, and duplicate double-submit prevention.

2. **Load and View Referrals (`CaseReferralsSection`, `ReferralDetailsDialog`, `case_view.referral_view`)**:
   - Added a dedicated **Referrals** tab in `CaseDetailPage.tsx` and embedded `CaseReferralsSection` in `ActionsTab.tsx` and `MonitoredCasePage.tsx` (`Sections.tsx`).
   - Displayed referral summary counts (Total, Active / In Progress, Resolved) and referral cards with Referral ID, Receiving Organization, Referral Reason, Priority Level badge, Referral Date, Contact Person, Current Referral Status badge, Last Updated timestamp, and **View Details**, **Record Response**, and **Record Outcome** actions.
   - Built `ReferralDetailsDialog` to display complete referral information, organization/contact details, supporting documents/attachments, documented referral outcome, and chronological **Agency Responses & Status History**.

3. **8-Status Referral Tracking, External Agency Responses, and Referral Outcome Documentation (`CoordinationDialog`, `case_work.update_referral`)**:
   - Supported all 8 referral statuses (`pending`, `sent`, `acknowledged`, `in_progress`, `awaiting_response`, `resolved`, `declined`, `cancelled`, plus legacy `to_contact`, `completed`, `no_response`).
   - Enforced required reason when a referral is marked `declined` or `cancelled`, and required documented outcome details before marking a referral `resolved`.
   - Added structured external agency response logging (response date/time, responder name, response details, assistance/action provided, current progress/status, follow-up instructions, additional notes, and supporting documents) and final referral outcome documentation (final outcome/result, assistance provided, actions completed, date of completion, remaining concerns/follow-up recommendations, final notes, and supporting proof).
   - Preserved the case boundary rule: creating, updating, or resolving a referral never automatically closes the original case.

## Verification

- `npm run build --prefix frontend` (`tsc -b && vite build`) passed with 0 errors.
- `.venv\Scripts\python.exe -m py_compile` and transactional integration test verified multi-agency referral creation, `REF-YYYY-NNNN` ID generation, 8-status transitions, agency response logging with supporting documents, outcome documentation, and that the parent case remains open after a referral is marked `resolved`.
