# Remove Redundant Staff Owner Verification Prompt from Match Review

- **Date:** 2026-10-29 02:19 (UTC)
- **AI tool:** Antigravity (Gemini 3.8 Flash)
- **Files changed:** `frontend/src/components/Modals/AIMatchReviewModal.tsx`, this record
- **Authorization:** Developer pointed out that the prompt "Not sure this sighting is Rocky? Ask the owner to take a look. / Request owner verification" is redundant with the "Look-Alike Registered Pet Detected / Message Owner" card and instructed to remove it.
- **Type:** Polish

## Intent

In `AIMatchReviewModal` (`/subd/reports/:id`), when reviewing a potential pet match, there were two overlapping owner-contact prompts:
1. The prominent `Look-Alike Registered Pet Detected` card with a direct `Message Owner` button opening real-time case chat with the pet owner.
2. A separate `StaffOwnerVerification` box in the action footer asking "Not sure this sighting is [pet]? Ask the owner to take a look. / Request owner verification".

The second prompt created redundant UI noise and confusion over how staff should communicate with pet owners. This change removes the redundant prompt from the modal footer, leaving the direct in-app messaging action as the clear, unified channel for owner confirmation.

## Key changes

- In `frontend/src/components/Modals/AIMatchReviewModal.tsx`:
  - Removed unused import `StaffOwnerVerification` from `../OwnerVerificationBlocks`.
  - Removed `<StaffOwnerVerification match={match} onChanged={...} />` from the modal action footer.

## Validation evidence

- Executed `npm run build` in `frontend/`: `tsc -b && vite build` built successfully in 1.98s with 0 errors.
