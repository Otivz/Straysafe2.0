# Support multiple External Coordination agencies and strict per-organization referral autofill

- **Date:** 2026-11-20 06:27 (UTC)
- **AI tool:** Antigravity (Gemini 4 Hydrogen Medium)
- **Files changed:** `backend/app/schemas/case.py`, `frontend/src/admin/live/api.ts`, `frontend/src/admin/data/types.ts`, `frontend/src/admin/live/LiveDataProvider.tsx`, `frontend/src/admin/live/adapters.ts`, `frontend/src/admin/pages/SettingsPage.tsx`, `frontend/src/admin/components/SubdivisionContactFields.tsx`, `frontend/src/admin/dialogs/CoordinationDialogs.tsx`
- **Authorization:** Direct user request to support managing multiple external coordination organizations/agencies in Settings and strictly autofill referral/coordination forms from the selected organization only.
- **Type:** Feature

## Intent

Allow Subdivision Administrators to configure and manage multiple external organizations (Barangay, Veterinary Clinics/Offices, Municipal/City Vet, Animal Welfare Organizations, Animal Control, and Other agencies) with isolated contact details, and ensure referral/coordination forms populate strictly from the selected receiving organization (leaving missing fields blank and never falling back to Barangay details for other agencies).

## Key changes

- `backend/app/schemas/case.py`:
  - Added `ExternalAgencyContact` and `agencies: List[ExternalAgencyContact]` to `ExternalCoordinationProfile`, preserving legacy single-Barangay values by synthesizing the initial `barangay-default` agency when `agencies` is empty.
- `frontend/src/admin/live/api.ts`, `frontend/src/admin/data/types.ts`, `frontend/src/admin/live/LiveDataProvider.tsx`, `frontend/src/admin/live/adapters.ts`:
  - Added `ExternalAgencyType`, `ExternalAgency`, `ApiExternalAgency`, and bidirectional mapping in `settingsFrom` and `caseSettingsTo`.
- `frontend/src/admin/pages/SettingsPage.tsx`:
  - Updated `ExternalCoordinationSection` into a multi-organization manager supporting Add, Edit, and Remove with organization type, name, contact person, phone, email, and office address.
- `frontend/src/admin/components/SubdivisionContactFields.tsx`:
  - Updated `useSubdivisionContactAutofill` to accept `selectedAgency?: ExternalAgency | null` for the `'external'` source, strictly reading only that organization's values, resetting fields whenever the selected organization changes, and leaving missing fields blank for manual entry.
- `frontend/src/admin/dialogs/CoordinationDialogs.tsx`:
  - Added a required **Receiving Organization (Saved in External Coordination)** selector to `ReferralDialog` (plus manual entry option) and matched `r.orgName` to the saved agency in `CoordinationUpdateDialog`.

## Validation evidence

- `python -m py_compile backend/app/schemas/case.py` — exited with code 0.
- `cd frontend; npm run build` (`tsc -b && vite build`) — exited with code 0.
