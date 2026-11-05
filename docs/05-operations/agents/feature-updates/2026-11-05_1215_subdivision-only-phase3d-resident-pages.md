# Subdivision-only Phase 3d: resident adoption and claim pages retired

- **Date:** 2026-11-05 12:15 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `frontend/src/pages/citizen/NoLongerAvailable.tsx` (new), `frontend/src/routes/AppRoutes.tsx`, `frontend/src/pages/citizen/PetMatchReview.tsx`, `frontend/src/components/Navbars/ResiNavbar.tsx`, `frontend/src/components/Navbars/LandingPageNavbar.tsx`, `frontend/src/pages/citizen/LandingPage.tsx`, `frontend/src/utils/notificationNavigation.ts`, `frontend/tests/residentRetired.browser.mjs` (new), `docs/06-future-proposals/SUBDIVISION_ONLY_RESTRUCTURING_PLAN.md`, `docs/05-operations/agents/feature-updates/2026-11-05_1215_subdivision-only-phase3d-resident-pages.md`
- **Authorization:** The developer's instruction "gooo" (go ahead with part 3d) on 2026-11-05, with the earlier choice for open decision 1: after an owner confirms a match, show that the Subdivision Leader will help instead of filing a claim.
- **Type:** Feature

## Intent

Part 3d of [SUBDIVISION_ONLY_RESTRUCTURING_PLAN.md](../../../06-future-proposals/SUBDIVISION_ONLY_RESTRUCTURING_PLAN.md): residents no longer adopt or claim through StraySafe. Lost-pet alerts, reports and "Pet Recovered" for lost-pet reports stay.

## Key changes

- **"No longer available" page** (`pages/citizen/NoLongerAvailable.tsx`): explains that adoption and claiming from the Barangay holding place are handled by the Barangay outside StraySafe, and to contact the Subdivision Leader.
- **Routes** (`AppRoutes.tsx`): `/adopt`, `/adopt/journey*`, `/adopt/apply/:id`, `/adopt/applications`, `/resident/adopt/journey*`, `/subd/adopt/journey*` and `/resident/pet/:petId/claims-dashboard` show that page; the four retired page imports are removed. Kept: `/admin/adopt/journey*` (Admin archive) and the public certificate check `/verify/certificate/:number` (read-only; open decision 3).
- **Links:** the landing navbar "Adopt a Pet", the landing adoption banner and footer "Public Adoption Catalog", and the resident menu's "Adopt a Pet" and "My Adoption Requests" (desktop and mobile) are removed. Adoption notifications open `/adopt` (the information page).
- **Pet Match Review** (`PetMatchReview.tsx`): the owner's Yes / No confirmation is unchanged. After "Yes", the claim-filing step (proof upload and `POST /claims/`) is replaced by "Thank you. You confirmed this is your pet. Your Subdivision Leader has been notified and will help you get your pet back…" with a button to message the leader; the card title reads "Pet Confirmed". The unused claim handler is removed. The backend already notifies the assigned leader, or the subdivision's leaders, on an owner confirmation (`routes/matches.py` owner-feedback). Earlier claims still show their status read-only.
- **Kept:** "My Pets" ownership requests (`PetRecordRequestsForResident.tsx`, pet registration claims, not holding claims). Descriptive landing text that mentions the adoption catalog is Phase 4 wording.
- **Open decision 1 resolved** as above. Backend `POST /claims/` and `PATCH /claims/{claim_id}/status` remain kept writes until code deletion (earlier claims can still be closed).

## Validation evidence

- `node frontend/node_modules/typescript/bin/tsc -b frontend`: exit 0.
- `frontend/tests/residentRetired.browser.mjs` (new; headless Chrome, mocked API): five retired addresses show the page at 390 px without horizontal scroll; the landing page has no adoption links, banner or footer link; in Pet Match Review at 390 and 1280 px, "Yes, this is my pet" sends only the owner confirmation (no claim) and shows the leader message; no browser errors or alerts. All pass.
- Still passing: `notificationNavigation.test.mjs`, `matchReviewLocation.browser.mjs`, `lostPets.test.mjs`, `lostPets.browser.mjs` (12 scenarios, run with `LOST_PETS_TEST_URL=http://127.0.0.1:5173`), `adminArchive.browser.mjs`, `barangayRetired.browser.mjs`, `barangayReferral.browser.mjs`, `historyCaseSummary.browser.mjs`, `adoptionDetails.browser.mjs`, `caseSummary.browser.mjs`.
