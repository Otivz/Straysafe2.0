# Expand Animal Colour Suggestions & Show Only While Typing

- **Date:** 2026-11-17 10:47 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/resident/data/colors.ts`, `frontend/src/resident/components/ColorTagInput.tsx`, `backend/app/utils/color_tags.py`, `frontend/tests/residentLiveAdapters.test.mjs`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-17_1047_expand-color-suggestions-hide-when-empty.md`
- **Authorization:** User request: "All colors should be there and and if nothing type yet suggestion will not show"
- **Type:** Polish

## Intent

Ensure the dynamic Colour or Coat tag input offers a full catalog of animal colours, coat shades, and patterns while keeping the autocomplete dropdown hidden whenever the input is empty.

## Key changes

- Expanded `ANIMAL_COLOR_SUGGESTIONS` (`frontend/src/resident/data/colors.ts`) and `PREDEFINED_ANIMAL_COLORS` (`backend/app/utils/color_tags.py`) to 53 colours, shades, and coat patterns (`White`, `Black`, `Brown`, `Tan`, `Cream`, `Gray`, `Golden`, `Orange`, `Yellow`, `Red`, `Mixed`, `Beige`, `Ivory`, `Buff`, `Fawn`, `Apricot`, `Amber`, `Caramel`, `Honey`, `Sand`, `Chocolate`, `Chestnut`, `Mahogany`, `Cinnamon`, `Ginger`, `Rust`, `Copper`, `Liver`, `Sable`, `Wheaten`, `Charcoal`, `Silver`, `Slate`, `Ash`, `Blue`, `Green`, `Teal`, `Pink`, `Purple`, `Brindle`, `Calico`, `Tabby`, `Tortoiseshell`, `Tuxedo`, `Merle`, `Tricolor`, `Bicolor`, `Spotted`, `Striped`, `Speckled`, `Patched`, `Roan`, `Dapple`).
- Updated `filterColorSuggestions` (`colors.ts`) and `ColorTagInput.tsx` so zero suggestions display when no text has been typed yet, and prefix matches sort ahead of substring matches as soon as the user types.

## Validation evidence

- `node --test tests/residentLiveAdapters.test.mjs` in `frontend/`: `30/30` tests passed.
- `npm --prefix frontend run build` (`tsc -b && vite build`): verified cleanly.
- `python -u tests/test_animal_color_tags.py` in `backend/`: `13/13` checks passed.
