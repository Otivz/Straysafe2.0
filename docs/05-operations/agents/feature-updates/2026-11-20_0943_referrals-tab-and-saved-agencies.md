# Referrals Tab on Cases, and Saved Agencies as One-Tap Choices

- **Date:** 2026-11-20 09:43 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `frontend/src/admin/dialogs/CoordinationDialogs.tsx`, `frontend/src/admin/pages/case/dialogState.ts`, `frontend/src/admin/pages/case/CaseDialogs.tsx`, `frontend/src/admin/pages/case/CaseDetailPage.tsx`, `frontend/src/admin/pages/case/ActionsTab.tsx`, `frontend/src/admin/pages/case/MonitoredCasePage.tsx`, `docs/README.md`
- **Authorization:** Developer: referrals should be a separate tab on the case page, not part of the report; the agency added in Settings, External Coordination did not show on the case; the referral section is too big. The proposal was a compact section with saved agencies as one-tap choices plus a Referrals tab on both case types; the developer answered "yes".
- **Type:** Polish

## Intent

- **A tab of their own:** referrals get their own tab on every case page that has them.
- **Smaller section:** the referral section is much smaller.
- **Saved agencies visible:** agencies saved in Settings, External Coordination are offered directly. Until now they appeared only inside the "Create Referral" dialog's dropdown.

## Database changes

None. Referrals, agencies and the backend are unchanged; only where and how the screens show them changed.

## Key changes

- **Compact referral section** (`CaseReferralsSection`):
  - A one-line title with the count.
  - A **"Refer to:"** row with one button per saved agency, for example "Barangay San Vicente · Barangay", plus **"+ Other organization"**.
  - When there are no referrals, one line ("No referrals for this case yet.").
  - When no agency is saved, one hint pointing to Settings, External Coordination.
  - Removed: the long paragraph, the dashed empty box and the second "Create Referral" button. When empty, the section is 88 px tall, from about 250 px.
- **One-tap agency:** a saved agency's button opens "Create External Referral" with that organization selected and its name, type and saved contact details filled in. "Other organization" opens it set to a manual organization.
  - The dialog takes a new optional `initialAgencyId`; the `referral` dialog state has an optional `agencyId`.
- **Lost and found case page** (`MonitoredCasePage`):
  - New **Case** and **Referrals** tabs. Case shows everything the page showed before except the referral section.
  - While a referral is open, the Case tab shows a one-line notice with an "Open Referrals" link.
  - `?tab=referrals` opens the Referrals tab.
- **Ordinary case page** (`CaseDetailPage`):
  - New **Referrals** tab between "Actions & follow-ups" and History.
  - The referral list left the Actions tab, and its count no longer includes referrals. Its "Create Referral" tile stays.
  - `?tab=referrals` now opens the Referrals tab; it used to redirect to Actions.
- **Complaint pages** are unchanged.

## Validation evidence

- `npx tsc -p tsconfig.app.json --noEmit` passed. ESLint on the six changed files: no errors, the same as at `HEAD`; the folder's other errors are in files this change does not touch.
- **Browser check** (repository harness on a throwaway stack, headless Chrome, signed in as the Leader). An agency "Barangay San Vicente" (Barangay) was first saved through the same settings API the Settings page uses.
  - **Lost-pet case SS-2026-0004:**
    - It has a Referrals tab, and the Case tab no longer shows the referral section.
    - The tab opens at `?tab=referrals`; the saved agency and "Other organization" are offered; the empty section is 88 px.
    - Tapping the agency opened the dialog with its name and contact details filled in.
  - **Ordinary case SS-2026-0002:**
    - Its tabs are Overview, Assessment, Actions & follow-ups, Referrals, History.
    - The Actions tab no longer lists referrals, and `?tab=referrals` opens the Referrals tab.
  - **At 390 px:** the page fits the screen.
  - No page errors. Screenshots checked.
- **Not done:** creating a referral end to end through the new buttons. Only the dialog's opening and pre-fill were checked; submitting uses the unchanged dialog.

## Remaining issues

- On the developer's live database, the case page shows the agency after a reload, because settings are read when the admin loads. It was saved there as "Barangay San Vicente" (Barangay).
