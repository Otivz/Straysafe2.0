# Subdivision-only Phase 3c: Admin archive and report view

- **Date:** 2026-11-05 12:07 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `frontend/src/components/Referral/ArchiveBanner.tsx` (new), `frontend/src/pages/Barangay_Staff/BrgyHoldingFacility.tsx`, `frontend/src/pages/Barangay_Staff/BrgyAdoptions.tsx`, `frontend/src/components/Adoption/AdoptionCasePanel.tsx`, `frontend/src/components/Adoption/AdoptionCertificatePanel.tsx`, `frontend/src/components/Adoption/adoptionDetails.css`, `frontend/src/pages/Admin/AdminReportView.tsx`, `frontend/src/components/AdminSidebar.tsx`, `frontend/tests/adminArchive.browser.mjs` (new), `docs/06-future-proposals/SUBDIVISION_ONLY_RESTRUCTURING_PLAN.md`, `docs/05-operations/agents/feature-updates/2026-11-05_1207_subdivision-only-phase3c-admin-archive.md`
- **Authorization:** The developer's instruction "3c" on 2026-11-05, within the Phase 3 choices recorded in `2026-11-05_1100_subdivision-only-phase3a-leader-referral-screens.md` (keep the Admin's old pages with write buttons hidden).
- **Type:** Feature

## Intent

Part 3c of [SUBDIVISION_ONLY_RESTRUCTURING_PLAN.md](../../../06-future-proposals/SUBDIVISION_ONLY_RESTRUCTURING_PLAN.md): the Administrator keeps the holding and adoption records as a read-only archive, and the Admin report view shows the Barangay Referral. The server already refuses these writes (Phase 1); this removes the buttons that would only fail.

## Key changes

- **Archive banner** (`components/Referral/ArchiveBanner.tsx`): "Archive, read-only … now handled by the Barangay outside StraySafe."
- **Holding archive** (`BrgyHoldingFacility.tsx`, `/admin/holding-facility`): `archiveReadOnly` for the Administrator joins the page's existing leader read-only mode (`viewOnly`), hiding Adopt / Impound (cards, stay-limit panel, detail), withdraw from adoption, Manage Facilities, Update condition and Add timeline entry. Header reads "Holding Archive · Earlier holding records, read-only".
- **Adoption archive** (`BrgyAdoptions.tsx`, `/admin/adoptions`): 25 action buttons on the page, 5 in `AdoptionCasePanel` and the certificate send and proceed buttons carry `data-archive-write`; the page root gets `adoption-archive` for the Administrator and one CSS rule in `adoptionDetails.css` hides every marked button. Certificate sending is also disabled through `canSend`. Viewing (applications, dossier, certificate preview, history) is unchanged.
- **Admin report view** (`AdminReportView.tsx`): the Barangay Referral card is shown for referred cases (status 4 or an endorsement letter), with the same actions as the leader; the "Animal not yet placed / Admit Animal to Holding" card and the "Log care check as Admin" buttons are removed (earlier holding records stay visible, marked read-only); Direct Override no longer offers Dispatched (5), Picked Up (6) or Impounded (8), status 4 reads "Referred to Barangay", and the override opens on the current status.
- **Admin sidebar:** "Holding Archive" and "Adoption Archive".
- **Not changed:** the endorsement card's "Receiving Municipal Authority … transferring custody" wording (Phase 4); the legacy `targetStatusId === 5` dispatch block is now unreachable and is left for code deletion.

## Validation evidence

- `node frontend/node_modules/typescript/bin/tsc -b frontend`: exit 0.
- `frontend/tests/adminArchive.browser.mjs` (new; headless Chrome, mocked API) at 1280 and 390 px: holding archive with banner and no Adopt, Impound, Manage Facilities, condition or timeline actions, no horizontal scroll; adoption archive with banner, Approve and Reject hidden, every marked action hidden; Admin report shows the referral card and no "Admit Animal to Holding"; Direct Override options exclude 5, 6 and 8; no write requests and no browser errors. All pass.
- Still passing: `historyCaseSummary.browser.mjs`, `adoptionDetails.browser.mjs`, `barangayReferral.browser.mjs`, `barangayRetired.browser.mjs`, `caseSummary.browser.mjs`, `locationIntelligence.browser.mjs`, `notificationNavigation.test.mjs`, `caseStagesObservation.test.mjs`.
