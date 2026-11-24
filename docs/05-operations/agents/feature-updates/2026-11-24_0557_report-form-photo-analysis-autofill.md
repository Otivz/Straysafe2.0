# Report forms: background photo analysis and AI-suggested fields

- **Date:** 2026-11-24 05:57 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `frontend/src/live/mediaAnalysis.ts`, `frontend/src/admin/pages/NewReportPage.tsx`, `frontend/src/admin/components/AutoTag.tsx`, `frontend/src/resident/pages/report/DetailsPage.tsx`, `frontend/src/resident/data/types.ts`, `frontend/src/resident/live/actions.ts`
- **Authorization:** Developer's request in the Claude Code session to wire the existing `POST /reports/analyze-media` endpoint into the Subdivision Admin "File a report" page and the Resident report details page, with AI suggestions for untouched fields only and non-blocking failure handling.
- **Type:** Feature

## Intent

Both report forms now send the first chosen photo (or else video) to the existing `POST /reports/analyze-media` endpoint in the background and use the answer only as suggestions. A field the person has typed in or chosen is never replaced. A failed, slow, or rate-limited check never blocks filing, so manual entry still works.

## Key changes

- `frontend/src/live/mediaAnalysis.ts` (new): the `MediaAnalysis` response type (matching `analyze_report_media` in `backend/app/routes/reports.py`), `analyzeReportMedia(file)` (multipart through the existing `httpUpload`, 60 s timeout), and pure mapping helpers: animal type, colour text (primary, secondary, tertiary and coat pattern, skipping "Unknown"/"None"), size (`Small`/`Medium`/`Large` only), closest breed option (for example `Aspin` -> `Aspin (Asong Pinoy)`, `Puspin` -> `Puspin (Pusang Pinoy)`), and an appearance note (`detected_subject_description` plus collar or QR tag).
- Admin `NewReportPage.tsx`: shows "Analyzing photo…" while the check runs. It fills Animal, Colour / markings, Breed (only a listed option), Estimated size, and Collar / condition / appearance when they are empty and untouched, and tags each filled field "AI suggested". Editing a field marks it touched so later answers leave it alone. An answer for a photo that has since been replaced is ignored. Callouts appear for an AI-generated photo (`verification_message`), for no dog or cat detected, and for multiple animals. A failure shows a short manual-entry note.
- Admin `AutoTag.tsx`: adds the `AiSuggestedTag` badge.
- Resident `DetailsPage.tsx`: the same behaviour for animal type, colour tags, breed (closest option, else the model's own breed name), the new optional Estimated size chips, and the "looks" field where the form shows it (nuisance and safety). For other categories, the photo description is shown as a line of text, not filled into a field.
- Resident `types.ts` / `actions.ts`: optional `Draft.size`, sent as `estimated_size` on non-lost reports (the backend already accepts `ReportBase.estimated_size`).

## Validation evidence

- `npx tsc -b`: no errors in the changed files. One remaining error, in `src/admin/pages/CasesPage.tsx` (`reportedByText` missing from `admin/live/adapters.ts`), comes from an uncommitted local edit to `adapters.ts` made before this change.
- `npx eslint` on all six changed files: 0 problems.
- Not yet verified in a running app: a manual check with a real photo against a running backend is still needed.
