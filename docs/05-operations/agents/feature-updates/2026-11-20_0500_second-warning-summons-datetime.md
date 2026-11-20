# Add date and time of summon field for 2nd Warning

- **Date:** 2026-11-20 05:00 (UTC)
- **AI tool:** Antigravity (Gemini 4 Hydrogen Medium)
- **Files changed:** `frontend/src/admin/dialogs/ActionDialogs.tsx`
- **Authorization:** Direct user request to add date and time of summon for the 2nd warning in the Issue a warning dialog.
- **Type:** Feature

## Intent

Allow Subdivision Administrators issuing a `2nd Warning` to specify the scheduled office summon date and time directly in the form, populating `summons_at` and `summons_date` in both the letter preview and the issued warning letter.

## Key changes

- `frontend/src/admin/dialogs/ActionDialogs.tsx`:
  - Added `summonsAt` state and `isSecondWarning` (`warningLevel === '2nd Warning'`) check in `WarningDialog`.
  - Added required `Date and time of summon` (`datetime-local`) field when `2nd Warning` is selected, with validation in `validateForm()`.
  - Passed `summons_at` and formatted `summons_date` in `field_overrides` to `previewWarningTemplate` and `case/issueWarning`.

## Validation evidence

- `cd frontend; npx tsc --noEmit` — exited with code 0.
