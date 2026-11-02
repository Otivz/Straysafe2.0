# Subdivision Leader custody wording

- **Date:** 2026-11-01 15:42 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `frontend/src/components/Modals/ResolveLostPetModal.tsx`, `frontend/src/components/Modals/CompleteHandoverModal.tsx`, `frontend/src/pages/Subd_Leaders/SubdPetClaims.tsx`, `frontend/src/pages/Subd_Leaders/SubdHoldingFacility.tsx`, `frontend/src/pages/Subd_Leaders/SubdSettings.tsx`, `frontend/src/pages/Subd_Leaders/SubdViewReport.tsx`, `frontend/src/pages/Subd_Leaders/SubdViewHistory.tsx`, `frontend/tests/phase2Holding.browser.mjs`, `docs/01-system/HOLDING_PLACE_AND_CUSTODY_RULES.md`, `docs/README.md`
- **Authorization:** Developer request in Claude Code: "Please review and refine all user-facing text and labels across the Subdivision Leader UI to ensure no copy implies that the subdivision operates a physical animal shelter, pound, or holding facility." FREEZE was OFF.
- **Type:** Polish

## Intent

Subdivisions have no holding facility. A found animal is kept by a resident or finder, or picked up by Barangay responders and brought to the Barangay Holding Facility. Subdivision Pet Claims are about identity checks and handover to the owner, not release from a pound. Only the displayed words change; logic, routes, schemas and stored values stay as they are.

## Key changes

- **`ResolveLostPetModal`** (Subdivision only):
  - "Subdivision Facility / Shelter" is now **Temporary Community Care**, and "In Subd Facility" is now "Community Care".
  - Default remarks and helper text say the animal is kept safe by a resident or finder until Barangay responders pick it up.
  - "Standard Subdivision Holding Area" is replaced by a note that the subdivision has no holding facility.
  - The fallback names use "the Barangay Holding Facility" or "a resident's home (temporary community care)".
- **`CompleteHandoverModal`** (shared): "If the animal is at the Barangay Holding Facility, its record there is discharged automatically."
- **`SubdPetClaims`:** "Awaiting pickup" is now **Awaiting handover**, and "Ready for Pickup / Handover" is now **Ready for Handover to the Owner**.
- **`SubdHoldingFacility`:**
  - The tab "Earlier Subdivision Pen" is now **Earlier Community Care Records**.
  - The empty states say the subdivision has no holding facility.
  - The stay-limit alert names the Barangay Holding Facility.
  - "Subdivision holding unit at full capacity" is now **Awaiting Barangay rescue (finder can no longer keep the animal)**.
  - "Kennel / bay slot" is now "Care spot / slot".
  - The "Subdivision Shelter" fallback is replaced.
- **`SubdSettings`** (an earlier designation can only be switched off):
  - "Designate as Animal Holding Place" is now **Earlier Community Care Spot**, with an explanation.
  - Types are shown through `careSpotLabel()`; stored values are unchanged.
  - "Animal Capacity" is now "Space for".
- **`SubdViewReport` / `SubdViewHistory`:** "Barangay Holding Pen" is now "Barangay Holding Facility". The generic "Holding Place" fallback names the Barangay Holding Facility, or temporary community care for an earlier subdivision-care record.
- **Not changed:** stored and API values (`Secured by Resident`, `In Subdivision Facility`, `In Barangay Facility`, `facility_type`, `kennel_slot`, report and claim statuses), map category keys, the Pet Claims module and all logic.
- **Tests:** the Phase 2 browser test now looks for the renamed tab, "Earlier Community Care Records".

## Validation evidence

- `npx tsc -b` in `frontend/`: exit 0. `npm --prefix frontend run build`: passed.
- ESLint: no finding on any line changed in this task, including the new `careSpotLabel` helper. The files keep their existing findings elsewhere.
- Browser, against a local Vite server with every API mocked and backend requests blocked:
  - `phase2Holding.browser.mjs`: 18 scenarios (holding page, status modal, settings);
  - `phase5Pets.browser.mjs`: 26 scenarios (both claims pages);
  - `phase6to8.browser.mjs`: 24 scenarios.

  All passed, with 0 backend requests.
- A final sweep of the Subdivision pages, both modals and the Subdivision sidebar/navbars found no remaining subdivision-facility wording. The only matches left are stored API values.
