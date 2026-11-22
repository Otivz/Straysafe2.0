# Custom Downward Dropdowns on File a Report

- **Date:** 2026-11-22 18:52 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/admin/pages/NewReportPage.tsx`
- **Authorization:** User request to make the Animal select open downward as a dropdown instead of popping upward over other fields.
- **Type:** Polish

## Intent

Replace native `<select>` controls on File a report (`How did they report it?`, `Kind of concern`, `Animal`) with a custom downward-opening dropdown (`DropdownSelect`) so menus always open cleanly below their trigger and match the STRAY-SAFE combobox styling.

## Key changes

- Added `DropdownSelect` in `frontend/src/admin/pages/NewReportPage.tsx` with downward listbox placement (`top-full mt-1.5 z-40`), keyboard navigation, and active/selected styling.
- Replaced `<Select>` for `How did they report it?`, `Kind of concern`, and `Animal` with `<DropdownSelect>`, and added `relative focus-within:z-20` on the form `Panel` wrappers so open menus layer cleanly over adjacent panels.

## Validation evidence

- `cd frontend; npx eslint src/admin/pages/NewReportPage.tsx; npx tsc --noEmit`
