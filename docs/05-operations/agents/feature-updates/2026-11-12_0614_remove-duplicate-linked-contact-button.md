# Change record: Remove duplicate contact button from Linked reports section

- **Date:** 2026-11-12 06:14 (UTC)
- **AI tool:** Antigravity
- **Authorization:** Developer instruction ("you should delete the contact the finder at the link sectiom cause its already here at the top")
- **Type:** Polish

## Files changed

- `frontend/src/admin/pages/case/monitored/Sections.tsx`
- `docs/01-system/LOST_FOUND_MATCHING.md`
- `docs/05-operations/agents/feature-updates/2026-11-12_0614_remove-duplicate-linked-contact-button.md`
- `docs/README.md`

## Summary of changes

- Removed the duplicate **Contact the finder** / **Contact the owner** button from the **Linked reports** list in `frontend/src/admin/pages/case/monitored/Sections.tsx`, since the contact action for the linked finder/owner already appears in the top **Who to contact** section (`HeroBlock`).
- Linked report rows retain only **See why** and **Unlink**.

## Verification

- `npx tsc -b` and `npx eslint src/admin/pages/case/monitored/Sections.tsx`: passed

