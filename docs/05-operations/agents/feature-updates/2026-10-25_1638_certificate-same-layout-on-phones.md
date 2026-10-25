# Adoption certificate: the same layout on phones as on desktop

- **Date:** 2026-10-25 16:38 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `frontend/src/components/Adoption/AdoptionCertificateDocument.tsx`, `docs/05-operations/agents/feature-updates/2026-10-25_1638_certificate-same-layout-on-phones.md`
- **Authorization:** the developer's follow-up to the certificate viewer change (2026-10-25_1633): "Its different compare in desktop mode".
- **Type:** Polish

## Intent

After the certificate was scaled as a page on phones, its layout still differed from desktop: the document's `sm:` and `md:` classes follow the screen width, so on a phone the 920 px page used its narrow layout (animal photo above the details, smaller title, tighter spacing) before being scaled.

## Key changes

- The certificate's breakpoints now follow the page's own width (Tailwind container queries): every `sm:` became `@min-[640px]:` and every `md:` became `@min-[768px]:` (45 classes), with an `@container` wrapper around the document. The viewer always lays the page out at 920 px, so phones, desktop and print get the same layout. Content, data and verification are unchanged.

## Validation evidence

- `tsc` and `vite build` passed; the built CSS contains the container rules.
- Headless check with a sample certificate (API mocked): at 1280, 390 and 360 px the page has the same height/width ratio (1.396), the animal photo is beside its details, and the photo and "Animal Name" sit at the same relative positions on the page; no sideways scrolling; no page errors.
- Not checked: printing from a phone, and the Android app.
