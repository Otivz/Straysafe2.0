# Improve Possible Pet Owners – Accuracy-Based Matching and Ranking

- **Date:** 2026-11-21 00:37 (UTC)
- **AI tool:** Antigravity
- **Files changed:**
  - `backend/app/services/owner_verification.py`
  - `backend/tests/test_possible_owners_ranking.py`
  - `frontend/src/admin/live/api.ts`
  - `frontend/src/admin/pages/case/PossibleOwnersBlock.tsx`
  - `docs/README.md`
  - `docs/05-operations/agents/feature-updates/2026-11-21_0037_possible-owners-accuracy-ranking.md`
- **Authorization:** User request to review and improve the Possible Pet Owners matching, weighted scoring, and ranking logic in STRAY-SAFE 2.0 (verified against reference case `SS-2026-0010` – Found Animal · Cat · Breed: `Tabby, Puspin (Pusang Pinoy)` · Description: `"friendly cat infront of my house"` · Location: `"At the corner lot"`).
- **Type:** Feature

## Summary of Changes

1. **Full Subdivision Candidate Evaluation & Mandatory Species Filter (`backend/app/services/owner_verification.py`):**
   - Replaced the arbitrary `Pet.pet_id.desc().limit(10)` fallback query with full evaluation of all active species-matching registered pets in the report's subdivision (`Cat` reports strictly match registered `Cat` pets; `Dog` reports strictly match registered `Dog` pets).
2. **Weighted Accuracy-Based Multi-Criteria Scoring (`_score_pet_candidate`):**
   - **Breed (30% weight):** Parses canonical biological breeds while separating out coat-pattern tokens (such as `"Tabby"` inside `"Tabby, Puspin (Pusang Pinoy)"`). Exact breed matches (`Puspin (Pusang Pinoy)`) score `100%`; unrelated breeds (`Scottish Fold`, `British Shorthair`, `Persian`, `Siamese`, etc.) score `0%` and are capped/damped so unrelated breeds never outrank matching breeds.
   - **Color / Coat (30% weight):** Extracts true colour families and coat patterns (`tabby`, `calico`, `tortoiseshell`, `tuxedo`, `spotted`, `pointed`, etc.) across report fields (`animal_colors`, `animal_color`, `animal_breed`, `description`) and compares them against pet colours, distinctive markings, and notes without conflating coat pattern words (`"tabby"`) with the color `"brown"`.
   - **Physical Description (20% weight):** Compares temperament/behaviour keywords (e.g., `"friendly"`), coat markings (`"tabby"`, `"stripes"`, `"white paws"`, `"white bib"`), and size categories.
   - **Location Proximity (15% weight):** Uses Haversine GPS distance and street/block/corner-lot context between the reported location and the owner's registered address.
   - **Other Relevant Details (5% weight):** Factors in `"Lost"` pet registry status and active subdivision registration.
3. **Clear Ranked Display & Matching Reasons (`frontend/src/admin/pages/case/PossibleOwnersBlock.tsx`, `frontend/src/admin/live/api.ts`):**
   - Sorts candidates strictly from highest to lowest matching accuracy score and assigns `rank` (`1, 2, 3, ...`) and `is_top_match` (`Highest-ranked candidate` badge on `#1`).
   - Displays rank number, owner name, registered pet name, reference code, Pet ID, species, breed, colors/coat, owner contact details, address, matching percentage, classification badge, summary matching reasons, and per-attribute breakdown.
4. **Regression Verification (`backend/tests/test_possible_owners_ranking.py`):**
   - Verified `SS-2026-0010` against all 50 seeded Selera Homes residents and 65 registered pets (22 cats), confirming that all 8 `Puspin (Pusang Pinoy)` cats rank at the top (`#1` Beatriz Mercado – Kuting at `97%`, `#2` Erika Pangilinan – Mingming at `93%`, `#3` Hannah Tupas – Kaloy at `92%`, `#4–#8` other Puspins at `68%–69%`), ahead of all non-Puspin breeds (`#9–#22` at `20%–43%`, with Nadine Villamor – Molly (`Scottish Fold`) ranked `#20` at `24%`).
