# View Details Modal for Possible Pet Owners

- **Date:** 2026-11-21 01:35 (UTC)
- **AI tool:** Antigravity (Gemini 2.5 Flash)
- **Files changed:** `frontend/src/admin/pages/case/PossibleOwnersBlock.tsx`
- **Authorization:** User prompt request ("Add view details and a modal will appear") with reference UI image of candidate card
- **Type:** Feature

## Intent

Provide administrators with an in-depth modal inspection dialog ("View Details") for candidate matches in the Possible Pet Owners block on Case pages.

## Key changes

- **Frontend (`frontend/src/admin/pages/case/PossibleOwnersBlock.tsx`):**
  - Added a "View Details" action button with `Eye` icon to every candidate card (`OwnerCard`), placed alongside "Message Owner" and "Send Warning".
  - Created `OwnerDetailsDialog` modal component displaying:
    - **Header:** Candidate ranking, highest-ranked candidate badge, status badge, Case ID reference, and matching accuracy score badge.
    - **Side-by-Side Comparison:** Comparative visual header with zoomable photos (via full-screen `MediaLightbox`) for both the reported animal (evidence photo) and registered pet, followed by a comparative attribute table (Species, Breed, Color & Coat, Size & Condition, Physical Details & Markings, Location).
    - **Scoring & Multi-Attribute Breakdown:** Detailed percentage bar, matching reasons chips, and per-criteria breakdowns (Animal Type, Breed, Coat/Color, Physical Description, Location Proximity, Other Details) with weights and explanations.
    - **Registered Owner & Household Information:** Owner name, contact phone, email, address, and direct shortcut links to the Pet Profile (`/pets/:id`) and Resident Profile (`/residents/:id`).
    - **Verification & Communication History:** Expandable log of past verification requests, messages, and outcomes.
    - **Actions:** Quick access to "Message Owner" and "Send Warning" directly from the modal footer.

## Validation evidence

- Ran `npm --prefix frontend run build` (`tsc -b && vite build`), which compiled cleanly with 0 errors.
- Verified that all TypeScript types, including `Open` union discrimination and `OwnerDialog` exclusions, are properly constrained.
