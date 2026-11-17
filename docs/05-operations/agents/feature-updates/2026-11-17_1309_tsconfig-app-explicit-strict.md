# Enable Explicit `"strict": true` in `frontend/tsconfig.app.json`

- **Date:** 2026-11-17 13:09 (UTC)
- **AI tool:** Antigravity (Gemini 4 Hydrogen)
- **Files changed:** `frontend/tsconfig.app.json`
- **Authorization:** User request to explain and fix `TS2322` on `OptionGroup` `onChange` in `frontend/src/admin/pages/complaints/ComplaintDialogs.tsx:82`
- **Type:** Fix

## Intent

Align IDE TypeScript language servers (such as TypeScript 5.x in VS Code, where `strict` defaults to `false` unless specified) with the project's TypeScript 6.0 compiler (`"typescript": "~6.0.2"`, where `strict` defaults to `true`). Under `strict: false`, generic type inference on `OptionGroup<T>` in `ComplaintDialogs.tsx:82` (and similar `OptionGroup` call sites) widened `T` to `string`, causing `setV` (`Dispatch<SetStateAction<"" | "verified" | "unverified" | "not_reviewed">>`) to fail assignment to `(v: string) => void`.

## Key changes

- Added `"strict": true` to `compilerOptions` in `frontend/tsconfig.app.json`.

## Validation evidence

- Ran `frontend\node_modules\.bin\tsc.cmd -p frontend\tsconfig.app.json --noEmit`: exited with code `0` (zero errors).
- Ran `npm --prefix frontend run build` (`tsc -b && vite build`): exited with code `0` (`✓ built in 1.71s`).
