# Register New Pet form: redundant items removed

- **Date:** 2026-10-28 13:11 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `frontend/src/pages/citizen/ResidentPet.tsx`, this record
- **Authorization:** the developer pasted the Register New Pet form and asked: "remove any redundant".
- **Type:** Polish

## Intent

Remove what the form repeats or no longer means, after the photo check became YOLO-only and hidden from residents.

## Key changes

- Photo section: the "AI Powered" badge, "Photo auto-fills details" and "• AI Analyzed" after the file size are removed.
- The photo check no longer writes "Bicolor coat" / "Tricolor coat" into Specific Markings (and so into the saved `color_markings`). That text repeated the coat pattern and could contradict it. The box is now only the resident's own words, and the coat pattern dropdown still fills in from the photo.
- Approximate age: the "Calculated Age … Auto-advances over time" banner, which repeated the age just picked, is removed.
- Coat pattern tip: the repeated pattern name is removed and only its description stays.

## Validation evidence

- `npx tsc --noEmit -p tsconfig.app.json`: no errors. ESLint on the file: 30 problems before, 29 after (all pre-existing).
- Not checked in a browser. To be checked by the developer.
