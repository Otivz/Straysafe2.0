# Pop-Up Modal Map Pinpoint with Expansion on Complaint Details

- **Date:** 2026-11-17 03:31 (UTC)
- **AI tool:** Antigravity (gemini-3.8-flash-high)
- **Files changed:** `frontend/src/admin/pages/complaints/ComplaintPage.tsx`, `docs/README.md`
- **Authorization:** User request: "I thinks its better if its pop up and can be expanded instead of appearing from below the description"
- **Type:** Polish

## Intent

Upgrade the complaint location map from an inline collapsible box below the description into an on-demand modal pop-up dialog that can be expanded and maximized, eliminating page content shifts while giving the Leader a generous, dedicated view of the incident pinpoint.

## Key changes

- **Complaint Page Component (`frontend/src/admin/pages/complaints/ComplaintPage.tsx`):**
  - Replaced inline figure underneath the description with a clean pop-up modal built on `Dialog`.
  - Added `isExpanded` state to toggle between standard height (340px) and large expanded height (520px).
  - Included footer action with `Expand map` / `Standard view` toggle (`Maximize2` / `Minimize2` icons) alongside `Close`.
  - Preserved native Leaflet fullscreen capability within `LocationMapPreview`.
  - Handled cases without GPS coordinates gracefully with a subdivision boundary overview.

## Validation evidence

- Ran `node --test frontend/tests/adminMediaLightbox.test.mjs frontend/tests/adminLiveAdapters.test.mjs`: all 28 tests pass.
- Ran all 199 unit tests across `frontend/tests/*.test.mjs`: 199 pass, 0 fail.
- Verified strict documentation audit via `npx --offline @ghostbyte/agent-docs-kit audit documentation --strict`.
