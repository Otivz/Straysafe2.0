# Adoption certificate fitted to one US Letter page (8.5 x 11 in)

- **Date:** 2026-10-25 18:22 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `frontend/src/components/Adoption/AdoptionCertificateViewer.tsx`, `frontend/src/components/Adoption/adoptionDetails.css`, `frontend/src/components/Adoption/AdoptionCertificateDocument.tsx`, `docs/05-operations/agents/feature-updates/2026-10-25_1822_certificate-letter-size.md`
- **Authorization:** the developer's request "Then could you fit it to the 8.5 x 11 size" (follow-up to the certificate layout changes of 2026-10-25).
- **Type:** Polish

## Intent

Make the certificate a single US Letter page on screen and in print, instead of a 920 px wide page of variable height.

## Key changes

- Viewer and print: the page is 816 x 1056 CSS px (8.5 x 11 in) on screen and exactly 8.5 x 11 in in print (`@page { size: letter portrait; margin: 0 }`); the old `zoom: .8` print shrink was removed. The frame fills the sheet and the footer sits at the bottom.
- To fit one sheet: tighter paddings and gaps, a smaller animal photo (96 px), QR code (48 px) and signature space; certificate number and date issued on one line under the title (the duplicate copy in the footer was removed); long adopter names are set one or two sizes smaller (over 26 and over 36 characters); the Draft/Revoked banner sits in the top margin instead of pushing the content down. Content, data and verification are unchanged.

## Validation evidence

- `tsc` passed.
- Headless check with mocked sample certificates at 1280, 390 and 360 px: the sheet is 816 x 1056 with no overflow, for a normal certificate and a worst case (draft banner, two-line address, 43-character name, long breed); phone and desktop layouts identical; no page errors.
- Chrome print to PDF (`preferCSSPageSize`): exactly 1 page of 612 x 792 pt (8.5 x 11 in) for both cases.
- Not checked: printing from a phone or the Android app, on a real printer.
