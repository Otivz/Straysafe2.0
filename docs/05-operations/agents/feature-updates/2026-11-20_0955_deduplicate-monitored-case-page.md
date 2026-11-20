# Deduplicate Monitored Case Page (Lost Pet & Found Animal)

- **Date:** 2026-11-20 09:55 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/admin/pages/case/MonitoredCasePage.tsx`, `frontend/src/admin/data/monitored.ts`, `frontend/src/admin/pages/case/monitored/Sections.tsx`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-20_0955_deduplicate-monitored-case-page.md`
- **Authorization:** User requested fixing UI redundancies identified on `/cases/SS-2026-0002` (`"Yes fix it"`).
- **Type:** Polish

## Intent

Remove duplicated owner/pet panels, duplicate `Send Warning` buttons, redundant empty `Linked reports` text, and outdated `Barangay` tile labeling on `MonitoredCasePage` (`lost_pet` and `found_animal` cases).

## Key changes

- **`frontend/src/admin/pages/case/MonitoredCasePage.tsx`:**
  - Restricted `<PossibleOwnersBlock />` to `found_animal` (`found`) cases so a `lost_pet` report does not duplicate the owner and pet already shown in `HeroBlock` (matching `OverviewTab.tsx`).
  - Passed `hideSendButton={found}` to `<CaseWarningsSection />` so `found_animal` pages do not show a duplicate orange `Send Warning` button beneath `Possible Pet Owners`, and hid the empty `Official Warnings` section on `lost_pet` reports unless warnings exist (`c.warnings.length > 0`).
- **`frontend/src/admin/data/monitored.ts`:**
  - Added the `Link a report` quick action directly to the `Linked reports` situation tile when empty (`linkedCount === 0 && mine.waiting.length === 0 && open`).
  - Generalized the referral situation tile from `Barangay`-only (`r.orgId === 'barangay'`) to all external referrals (`c.referrals`) labeled `Referrals` with `Create referral` to match the `Referrals` tab.
- **`frontend/src/admin/pages/case/monitored/Sections.tsx`:**
  - Returned `null` from `LinkedReports` when there are no linked, hand-linked, or ruled-out reports so the empty state is not repeated immediately beneath the `Linked reports` situation tile.
- **`docs/README.md`:** Indexed this change record.

## Validation evidence

- `npm run build` (`tsc -b && vite build`) and `npx eslint src/admin/pages/case/MonitoredCasePage.tsx src/admin/pages/case/monitored/Sections.tsx src/admin/data/monitored.ts` inside `frontend/`.
- `npx @ghostbyte/agent-docs-kit@latest audit documentation --strict`.
