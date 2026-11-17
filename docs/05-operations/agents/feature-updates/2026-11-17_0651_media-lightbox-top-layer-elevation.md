# Elevate MediaLightbox to Browser Top Layer

- **Date:** 2026-11-17 06:51 (UTC)
- **AI tool:** Antigravity (gemini-3.8-flash-high)
- **Files changed:** `frontend/src/admin/components/MediaLightbox.tsx`, `frontend/src/admin/styles/ui.css`, `docs/README.md`
- **Authorization:** User request: "Now in the media when i tried to click the image or video make sure it sis visible cause currently rn the modal overlaps the image"
- **Type:** Fix

## Intent

Resolve an issue where clicking evidence photos or videos inside modal dialogs (such as `SameOccurrenceDialog` or any `<Dialog>`) resulted in the modal dialog overlapping/covering the `MediaLightbox`.

## Root cause

The base `Dialog` component uses the native HTML `<dialog>` element opened via `.showModal()`. Browsers place modal `<dialog>` elements inside the browser's native **Top Layer**, which strictly renders above all regular DOM elements regardless of their `z-index`. Because `MediaLightbox` was previously implemented as a regular fixed `<div>`, the browser rendered the native `<dialog>` in front of the lightbox.

## Key changes

1. **MediaLightbox Component (`frontend/src/admin/components/MediaLightbox.tsx`):**
   - Converted `MediaLightbox` from a plain `<div>` to a native HTML `<dialog>` element (`dialog.sa-media-lightbox`).
   - Added `dialogRef` and invoked `showModal()` on mount with safe fallback handling.
   - Attached `onCancel` to cleanly trigger `onClose()` on Esc cancellation and ensured `close()` is called on unmount.
   - Because `showModal()` pushes new modal dialogs to the top of the browser's top-layer stack, `MediaLightbox` now renders directly above any existing open `<dialog>`.

2. **Styling (`frontend/src/admin/styles/ui.css`):**
   - Added styles for `dialog.sa-media-lightbox` (`fixed inset-0 w-screen h-screen m-0 p-0 border-0 bg-[rgba(0,0,0,0.96)] z-[2147483647]`).
   - Configured `dialog.sa-media-lightbox::backdrop` with backdrop blur and darkened overlay.

## Validation evidence

- Executed `npm --prefix frontend run build`: TypeScript (`tsc -b`) and Vite production bundle passed cleanly in 1.63s.
- Executed `node --test`: all 199 unit tests across 16 test suites passed with 0 failures.
