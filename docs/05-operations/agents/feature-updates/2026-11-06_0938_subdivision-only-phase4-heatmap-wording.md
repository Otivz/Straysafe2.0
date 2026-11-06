# Subdivision-only Phase 4: heatmap wording

- **Date:** 2026-11-06 09:38 (UTC)
- **AI tool:** Codex (GPT-6)
- **Files changed:** `frontend/src/pages/Admin/AdminHeatMap.tsx`, `frontend/src/utils/heatmap.ts`, `docs/06-future-proposals/SUBDIVISION_ONLY_RESTRUCTURING_PLAN.md`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-06_0938_subdivision-only-phase4-heatmap-wording.md`
- **Authorization:** Developer request to implement Phase 4 only of the Subdivision-only restructuring; no Phases 5 or 6.
- **Type:** Polish

## Intent

Use referral and observation wording on the heatmap without changing incident counting or locations.

## Key changes

- Display status 4 as Referred to Barangay, overriding the earlier server display name for that status only.
- Legend labels distinguish observation from earlier pickup/custody and identify legacy dispatch.
- Shared utility comments reflect the active portals. No active/closed lists, coordinates, weights, dates, thresholds or hotspot calculations changed; HEATMAP_RULES.md remains applicable.

## Validation evidence

- TypeScript build check: exit 0.
- heatmapRules.test.mjs: existing 16/16 checks pass, including original sightings, active legacy statuses, dates, weights and hotspot counts.
- reportStatus.test.mjs: 3/3 checks pass.
