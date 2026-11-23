# Possible Pet Owners: Words Instead of Percentages on the Cards

- **Date:** 2026-11-22 21:39 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `frontend/src/admin/pages/case/PossibleOwnersBlock.tsx`
- **Authorization:** Developer asked whether to remove the numerical percentage on Possible Pet Owners, then "yes gooo" to the proposal: words on the cards, the number only in View details labelled "for ranking only".
- **Type:** Polish

## Intent

The overall score is a ranking aid that blends look-alike attributes and adds bonuses (Lost status, QR tag message). It is not a probability, but "97%" reads like near-proof of ownership. The cards now say what the match is in words.

## Key changes

- **Card:** the big "NN%" and "NN% of the information" are gone. The classification badge stays (Strong Possible Match / Potential Match / Low Confidence Match); when the server sent a score without a label, the label is derived with the backend's thresholds (75 and 52).
- **Card attributes:** each attribute shows **Match / Similar / Differs / Not given** instead of a percent. Rows with no score, such as "Lost report & QR tag", show their explanation only.
- **Filter bar:** "Showing N closest matches", "Showing all N candidates (including N weaker matches)", "No close matches — N weaker matches hidden". The hidden-below threshold (70) is unchanged.
- **View details dialog:** its header badge shows the label only. The breakdown keeps the number and the per-attribute numbers and weights, now titled "Matching score (for ranking only, not a probability)".
- No backend change: candidates are still scored and sorted by the same number.

## Validation evidence

- `cd frontend; npx tsc -b`: exit 0.
- ESLint on the file: 4 errors, the same 4 the committed version has (`react-refresh/only-export-components` twice, `set-state-in-effect` twice); none from this change.
- Not checked in a browser.
