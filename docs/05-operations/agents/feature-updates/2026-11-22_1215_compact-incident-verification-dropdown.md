# Compact Incident Review Verification Dropdown

- **Date:** `2026-11-22 12:15 (UTC)`
- **AI tool:** `Antigravity (Gemini)`
- **Files changed:** `frontend/src/admin/pages/case/AssessmentTab.tsx`, `docs/05-operations/agents/feature-updates/2026-11-22_1215_compact-incident-verification-dropdown.md`
- **Authorization:** User request ("Update the Incident Review section: Replace the existing verification selection cards with a compact dropdown. Remove 'Could not be verified'...")
- **Type:** `Polish`

## Summary

- Replaced the multi-card `OptionGroup` in the **Incident review** block of `frontend/src/admin/pages/case/AssessmentTab.tsx` with a compact `<Select>` dropdown.
- Restricted selectable verification options (`INCIDENT_VERIFICATION_OPTIONS`) to **Not yet reviewed**, **Verified**, **Partly verified**, and **Invalid report**, removing **Could not be verified** (`unverified`) while retaining a disabled legacy fallback option if a previously saved case already carries `unverified`.
- Preserved the dynamic description hint, the required `"What the decision is based on"` field, and all existing assessment saving behavior.
