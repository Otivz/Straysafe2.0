# Manual Matching Breed Dropdown

- **Date:** 2026-11-02 10:22 (UTC)
- **AI tool:** Antigravity (Gemini 3.8 Flash)
- **Files changed:** `frontend/src/components/ManualMatching/ManualMatchingWorkspace.tsx`
- **Authorization:** User request to make the breed input into a dropdown selector on the Manual Matching page
- **Type:** Polish

## Intent

Replace the free-text `Breed` input in the Manual Matching filter toolbar with a structured `<select>` dropdown, consistent with the other filter controls (Report type, Animal, Sex).

## Key changes

- In `frontend/src/components/ManualMatching/ManualMatchingWorkspace.tsx`:
  - Defined standard dog (`DOG_BREEDS`) and cat (`CAT_BREEDS`) breed lists matching common local breeds and existing system taxonomy.
  - Converted the Breed input field to a dropdown `<select>` element with a default `Any` option.
  - Dynamically adjusts available breed options according to the selected Animal filter:
    - When `Animal` is **Dog**, lists dog breeds.
    - When `Animal` is **Cat**, lists cat breeds.
    - When `Animal` is **Any**, organizes breeds into `<optgroup label="Dog Breeds">` and `<optgroup label="Cat Breeds">`.
  - Automatically resets incompatible breed selections when switching between Dog and Cat to prevent zero-result queries.
  - Retains any existing or custom breed values in the selection options to prevent data loss.

## Validation evidence

- Executed `npx tsc --noEmit` in `frontend` with 0 errors.
- Executed `node --test tests/manualMatchFields.test.mjs` with all 4 tests passing.
