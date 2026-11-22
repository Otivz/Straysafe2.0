# Searchable Resident Combobox on File a Report

- **Date:** 2026-11-22 17:44 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/admin/pages/NewReportPage.tsx`
- **Authorization:** User request to make the Registered resident selector searchable by typing while keeping it a dropdown.
- **Type:** Polish

## Intent

Replace the long native `<select>` for **Registered resident** on the File a report screen (`/cases/new`) with a searchable dropdown combobox so administrators can type to filter residents by name, unit, or street and select from a bounded dropdown below the field.

## Key changes

- Added `ResidentCombobox` in `frontend/src/admin/pages/NewReportPage.tsx` with type-to-filter search (name, unit, street), keyboard navigation (`ArrowUp`/`ArrowDown`/`Enter`/`Escape`), clear button, and a bounded (`max-h-60`) dropdown list anchored below the input.
- Replaced the native `<Select>` for `Registered resident` with `<ResidentCombobox>`.

## Validation evidence

- `cd frontend; npx tsc --noEmit; npx eslint src/admin/pages/NewReportPage.tsx`
