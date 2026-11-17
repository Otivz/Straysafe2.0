# Document Features Roadmap: Missing, Pending & Future Capabilities

- **Date:** 2026-11-16 14:28 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `docs/06-future-proposals/PENDING_AND_FUTURE_FEATURES.md`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-16_1428_pending-and-future-features-doc.md`
- **Authorization:** User explicit request: "Make an md file of whatr features are yet to put in the new straysafe put it in an md dint code anyting"
- **Type:** Polish

## Intent

Provide an authoritative, detailed markdown document cataloging all missing, partially implemented, architectural boundary, and prospective future features for STRAYSAFE 2.0 without altering any application code or database configuration.

## Key changes

- Created `docs/06-future-proposals/PENDING_AND_FUTURE_FEATURES.md`:
  - **Section 1:** Executive Summary of current STRAYSAFE 2.0 capabilities.
  - **Section 2:** Completely missing features (SMS notification gateway, direct resident-to-office inquiry channel, resident self-service account deactivation, selective announcement photo deletion, pet ownership transfer workflow).
  - **Section 3:** Partially implemented features (Role 4 graphical web portal, Firebase Cloud Messaging API permissions, AI test set benchmarking images, pet photo update matching triggers, granular notification toggles).
  - **Section 4:** Deliberate architectural boundaries (retirement of physical QR tags, external authority referral model without external user accounts, retirement of public forums/group chats, registration-first lost pet filing).
  - **Section 5:** Proposed future enhancements for Capstone thesis recommendations (automated external referral packets, offline caching, 30-day candidate matching).
- Updated `docs/README.md` to index `PENDING_AND_FUTURE_FEATURES.md` and this change record.

## Validation evidence

- Verified alignment with codebase inspections across `backend/app/routes/`, `frontend/src/live/LiveDataProvider.tsx`, `AI_TODO.md`, and `docs/01-system/overview.md`. No functional code or database state was modified.
