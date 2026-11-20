# Separate Subdivision Information & Contact from External Coordination settings

- **Date:** 2026-11-20 05:44 (UTC)
- **AI tool:** Antigravity (Gemini 4 Hydrogen High)
- **Files changed:** `backend/app/schemas/case.py`, `frontend/src/admin/live/api.ts`, `frontend/src/admin/data/types.ts`, `frontend/src/admin/live/LiveDataProvider.tsx`, `frontend/src/admin/live/adapters.ts`, `frontend/src/admin/pages/SettingsPage.tsx`, `frontend/src/admin/components/SubdivisionContactFields.tsx`, `frontend/src/admin/dialogs/CoordinationDialogs.tsx`, `frontend/src/admin/dialogs/ActionDialogs.tsx`, `frontend/src/admin/pages/case/PossibleOwnersBlock.tsx`
- **Authorization:** Direct user request to separate Subdivision Information & Contact from External Coordination Information & Contact Configuration in Settings and autofill external referrals/coordination forms from the external configuration.
- **Type:** Feature

## Intent

Keep subdivision-specific office/identity settings separate from external agency (Barangay) coordination contact configuration, storing both cleanly in `CaseSettings` and using the external configuration to autofill referral and external coordination forms.

## Key changes

- `backend/app/schemas/case.py`:
  - Extracted shared `_validate_phone` and `_validate_email` helpers, added `ExternalCoordinationProfile` (`barangay_name`, `contact_person`, `phone`, `email`, `address`), and added `external_coordination` to `CaseSettings`.
- `frontend/src/admin/live/api.ts`, `frontend/src/admin/data/types.ts`, `frontend/src/admin/live/LiveDataProvider.tsx`, `frontend/src/admin/live/adapters.ts`:
  - Added `externalCoordination` / `external_coordination` to `Settings`, `ApiCaseSettings`, `blankSettings`, `settingsFrom`, and `caseSettingsTo`.
- `frontend/src/admin/pages/SettingsPage.tsx`:
  - Updated **Subdivision info & contact** (`profile`) to manage strictly subdivision-specific office and identity fields with no barangay labels or fields.
  - Added a separate **External coordination** (`external`) section managing Official Barangay Name, Barangay Contact Person / Representative, Barangay Contact Number, Barangay Email Address, and Barangay Office Address.
- `frontend/src/admin/components/SubdivisionContactFields.tsx`:
  - Added `source: 'subdivision' | 'external'` support to `useSubdivisionContactAutofill` and `SubdivisionContactFields`, dynamically sourcing defaults, labels, and `Configure in Settings` deep links (`?section=profile` vs `?section=external`).
- `frontend/src/admin/dialogs/CoordinationDialogs.tsx`, `frontend/src/admin/dialogs/ActionDialogs.tsx`, `frontend/src/admin/pages/case/PossibleOwnersBlock.tsx`:
  - Wired `ReferralDialog` and `CoordinationUpdateDialog` to `useSubdivisionContactAutofill(..., 'external')` (and defaulted Barangay referral agency name from `externalCoordination.barangayName`), while keeping subdivision follow-up/owner dialogs on the `'subdivision'` source with subdivision-specific labels.

## Validation evidence

- `cd frontend; npx tsc --noEmit` — exited with code 0.
- `python -m py_compile backend/app/schemas/case.py` — exited with code 0.
