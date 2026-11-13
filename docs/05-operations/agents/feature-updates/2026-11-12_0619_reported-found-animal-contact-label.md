# Change record: Replace "Finder" label in "Who to contact" with "Reported found animal (<ref>)" / "Reported by" and "Contact the reporter"

- **Date:** 2026-11-12 06:19 (UTC)
- **AI tool:** Antigravity
- **Authorization:** Developer instruction ("find a good label" for the "Finder" contact section)
- **Type:** Polish

## Files changed

- `frontend/src/admin/data/monitored.ts`
- `frontend/tests/adminMonitoredCase.test.mjs`
- `frontend/tests/liveLostFound.browser.mjs`
- `docs/05-operations/agents/feature-updates/2026-11-12_0619_reported-found-animal-contact-label.md`
- `docs/README.md`

## Summary of changes

- Updated `peopleOf` in `frontend/src/admin/data/monitored.ts` so the "Who to contact" section replaces the "Finder" label with clear, natural role headings and distinct button text:
  - On a **Lost Pet** report:
    - **OWNER** → **Contact the owner**
    - **REPORTED FOUND ANIMAL (SS-2026-0009)** → **Contact the reporter**
  - On a **Found Animal** report:
    - **REPORTED BY** → **Contact the reporter**
    - **OWNER OF `<Pet>`** → **Contact the owner**

## Verification

- `npx tsc -b`, `npx eslint src/admin/data/monitored.ts tests/adminMonitoredCase.test.mjs tests/liveLostFound.browser.mjs`, and `node --test tests/adminMonitoredCase.test.mjs`: passed

