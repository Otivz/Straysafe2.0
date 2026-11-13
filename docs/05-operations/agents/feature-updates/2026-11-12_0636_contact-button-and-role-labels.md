# Change record: Use resident first name on contact action ("Contact <Name>") and "Found-animal report (<ref>)" heading

- **Date:** 2026-11-12 06:36 (UTC)
- **AI tool:** Antigravity
- **Authorization:** Developer instruction ("but reporter and owner is reporter also, why would label that contact the reporter, feel so off. go make it right, and best.")
- **Type:** Polish

## Files changed

- `frontend/src/admin/data/types.ts`
- `frontend/src/admin/data/monitored.ts`
- `frontend/src/admin/pages/case/monitored/Hero.tsx`
- `frontend/src/admin/dialogs/CaseMessagesDialog.tsx`
- `frontend/src/admin/dialogs/MatchDialogs.tsx`
- `frontend/tests/adminMonitoredCase.test.mjs`
- `frontend/tests/liveLostFound.browser.mjs`
- `docs/05-operations/agents/feature-updates/2026-11-12_0636_contact-button-and-role-labels.md`
- `docs/README.md`

## Summary of changes

- Replaced the generic `Contact the reporter` / `Contact the finder` button and dialog title with the resident's first name (**`Contact <FirstName>`**, e.g. `Contact Carlo`, `Contact Owen`) while keeping **`Contact the owner`** for the pet owner, so the UI never labels one resident "the reporter" when both the pet owner and the other resident filed reports:
  - On a **Lost Pet** report:
    - **OWNER** → **`Contact the owner`**
    - **FOUND-ANIMAL REPORT (SS-2026-0009)** → **`Contact Carlo`** (using the resident's first name)
  - On a **Found Animal** report:
    - **REPORTED BY** → **`Contact Carlo`** (using the resident's first name)
    - **OWNER OF `<Pet>`** → **`Contact the owner`**
- Updated `MatchCompareDialog` (`frontend/src/admin/dialogs/MatchDialogs.tsx`) to show `Reported by: <Name>` instead of `Finder: <Name>` on the found-animal side of the comparison header.
- Updated `frontend/tests/adminMonitoredCase.test.mjs` and `frontend/tests/liveLostFound.browser.mjs` to assert the updated `Found-animal report (<ref>)` heading and `Contact <FirstName>` action label.

## Verification

- `npx tsc -b`, `npx vite build`, `npx eslint src/admin src/resident tests`: passed
- `node --test tests/adminMonitoredCase.test.mjs tests/adminLostFound.test.mjs tests/residentCaseMessages.test.mjs`: 32/32 passed

