# Add Radio Selection Between StraySafe Letter and Imported File

- **Date:** 2026-11-17 13:29 (UTC)
- **AI tool:** Antigravity (Gemini 4 Hydrogen)
- **Files changed:** `frontend/src/admin/pages/complaints/ComplaintDialogs.tsx`
- **Authorization:** User request to add a radio button choosing between the fixed StraySafe warning letter and importing a custom file
- **Type:** Polish

## Intent

Give Subdivision Leaders a clear radio toggle in the complaint warning preparation dialog (`StepDialog`) to choose between using the fixed StraySafe standard warning letter (with live preview and print-on-save) or importing their own document/image file (requiring a selected/uploaded file and skipping the generated preview/print step).

## Key changes

- Added an `OptionGroup` radio selector (`letterSource: 'generated' | 'import'`) under **"Which letter would you like to use?"** in `frontend/src/admin/pages/complaints/ComplaintDialogs.tsx`:
  - **Use StraySafe standard letter** (`generated`): shows the populated letter preview and uses `"Save and print"` as the submit action.
  - **Import your own file** (`import`): shows the required PDF/DOC/DOCX/image file importer, validates that a file is selected (or already uploaded), uploads it on save, and uses `"Save warning letter"` without printing the fixed generated letter.

## Validation evidence

- Ran `npm --prefix frontend run build` (`tsc -b && vite build`): exited with code `0` (`✓ built in 1.37s`).
- Ran `node --test frontend/tests/*.test.mjs`: `201` tests passed, `0` failed.
