# Referral Contact Buttons and Copy Summary

- **Date:** `2026-11-22 06:24 (UTC)`
- **AI tool:** `Antigravity (Gemini)`
- **Files changed:** `frontend/src/admin/dialogs/CoordinationDialogs.tsx`, `docs/05-operations/agents/feature-updates/2026-11-22_0624_referral-contact-buttons-and-copy-summary.md`
- **Authorization:** User request — FEATURE 13: REFERRAL CONTACT BUTTONS AND COPY SUMMARY ("Make it easier for the Leader to coordinate with external agencies.")
- **Type:** `Feature`

## Summary

- Inspected referral organization and contact data across `frontend/src/admin/dialogs/CoordinationDialogs.tsx`, `frontend/src/admin/data/types.ts`, and `frontend/src/admin/live/adapters.ts`.
- Added `extractValidPhone`, `resolveReferralContact`, `buildReferralSummaryText`, and `copyTextToClipboard` helpers in `CoordinationDialogs.tsx`:
  - Resolves contact details strictly from the referral record (`r.contactPerson`, `r.contactDetail`, `r.contactMethod`) and any exact name-matched external agency saved in `state.settings.externalCoordination.agencies`, without inventing contact details or falling back to unrelated agencies.
  - Renders a **Call** button (`href="tel:..."`) only when a valid phone number exists on the referral or its matched saved agency.
  - Renders a **Copy Contact** button that copies the recorded organization contact details (organization name, contact person, phone, email, address, or other detail) to the clipboard, and disables gracefully with an informative tooltip when no contact details are recorded.
  - Renders a **Copy Referral Summary** button on both the referral cards (`CaseReferralsSection`) and the referral detail modal (`ReferralDetailsDialog`) that copies a structured summary containing:
    - Case reference number (`c.id`) and category
    - Referral reference (`r.referenceNo`) and status
    - Referral organization (`r.orgName`)
    - Priority (`c.priority` and `r.priorityLevel`)
    - Location (`c.location.area` / `c.location.detail`)
    - Animal description & condition (`c.animal`)
    - Incident description (`c.description`)
    - Evidence summary (item count, reviewed count, and sufficiency)
    - Reason for referral (`r.reason`)
    - Follow-up information (`r.followUpAt`, `r.remainingFollowUp`, and latest agency follow-up instructions)
  - Excludes reporter and resident personal information (`c.reporter.name`, `c.reporter.phone`, `c.reporter.email`, `c.reporter.unit`) from the copied referral summary.
