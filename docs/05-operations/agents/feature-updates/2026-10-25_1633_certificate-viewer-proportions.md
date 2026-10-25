# Adoption certificate keeps its page proportions on phones

- **Date:** 2026-10-25 16:33 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `frontend/src/pages/citizen/MyAdoptionApplications.tsx`, `frontend/src/pages/Barangay_Staff/BrgyAdoptions.tsx`, `frontend/tests/fixtures/certificateViewer.tsx`, `docs/05-operations/agents/feature-updates/2026-10-25_1633_certificate-viewer-proportions.md`
- **Authorization:** the developer's request (with a phone screenshot of `/adopt/applications`) to make the certificate view proportional because it was too stretched.
- **Type:** Polish

## Intent

On phones, the resident's certificate opened in the older `AdoptionCertificateModal`, which reflows the certificate into a narrow column, so it became a long, stretched strip instead of a page.

## Key changes

- `/adopt/applications` and the barangay Stage 7 certificate button now open `AdoptionCertificateViewer`, which the barangay application view already used: the certificate is laid out at its paper width (920 px) and scaled to fit the screen, with Fit, zoom and Print. The certificate content, its data and verification are unchanged.
- `AdoptionCertificateModal.tsx` is no longer used by any page; it was left in place (not deleted).
- `frontend/tests/fixtures/certificateViewer.tsx`: a fixture that opens the viewer for the browser check.

## Validation evidence

- `tsc` and `vite build` passed.
- Headless check with a sample certificate (API mocked): height/width ratio 1.396 at 1280 px, 1.382 at 390 px and 360 px (scaled to 40% and 37%); no sideways scrolling; no page errors. A 390 px screenshot shows the whole page in proportion.
- Not checked: printing from a phone, and the Android app.
