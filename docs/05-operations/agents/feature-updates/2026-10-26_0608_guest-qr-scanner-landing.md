# Temporary guest QR scanner on the landing page

- **Date:** 2026-10-26 06:08 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `frontend/src/components/Modals/GuestQRScannerModal.tsx`, `frontend/src/pages/citizen/LandingPage.tsx`, `docs/05-operations/agents/feature-updates/2026-10-26_0608_guest-qr-scanner-landing.md`
- **Authorization:** the developer's request "Could you temporary add a scanner for guest in the landpage".
- **Type:** Feature

## Intent

Let a visitor who is not signed in scan a pet's QR tag from the landing page, so the guest finder flow can be shown without a phone camera app or login. Marked temporary by the developer.

## Key changes

- New `GuestQRScannerModal`: opens the rear camera (`html5-qrcode`), or reads an uploaded photo of the QR code, extracts the token from a `/pet/scan/<token>` link or a bare token, and navigates to the existing public page `/pet/scan/<token>`. It makes no API call itself; `PetScanPage` loads the pet and handles the guest "I found this pet" form as before.
- Shows a message instead of the camera on a non-https page (the browser blocks the camera there); photo upload still works.
- Landing page: a "Scan Pet QR" button in the hero action row opens the modal.
- No backend, database or route changes.

## Validation evidence

- `tsc --noEmit -p tsconfig.app.json`: no errors in the changed files.
- Not checked: running it in a browser or on a phone camera.
