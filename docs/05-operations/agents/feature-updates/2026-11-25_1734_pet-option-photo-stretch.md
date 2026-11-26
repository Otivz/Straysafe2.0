# Lost pet form: the chosen pet's photo ran past its square

- **Date:** 2026-11-25 17:34 (UTC)
- **AI tool:** Claude Code (Claude Sonnet 5.5)
- **Files changed:** `frontend/src/resident/styles/resident.css`
- **Authorization:** Developer's request in the Claude Code session ("fix this bug", with a screenshot of the resident lost-pet report details page).
- **Type:** Fix

## Intent

In "Which pet is missing?" the registered pet's photo showed as a tall, narrow strip instead of a small square, and made the card taller.

## Key changes

- `.rs-option__icon` is a 38 px square grid. The photo inside had `height: 100%`, which a grid with an automatic row ignores, so a portrait photo (a phone photo) kept its own proportions and ran past the square; the square had no `overflow: hidden`, so all of it showed.
- The square now clips (`overflow: hidden`, `position: relative`) and the photo is taken out of the grid flow (`position: absolute; inset: 0`) so it always fills the square with `object-fit: cover`, whatever its shape. The icon (no photo) is unchanged.
- The other photo squares in the resident and admin styles already clip, so nothing else needed the change.

## Validation evidence

- `npx vite build` (temporary folder): builds; the compiled rule has `position: absolute; inset: 0` on the photo.
- Not checked: the screen in a running app (the fix is CSS only; reload the page to see it).
