# Map Maximize and Fullscreen Capability

- **Date:** 2026-11-14 04:58 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/preview/map/map.css`, `frontend/src/preview/map/ReadOnlyMap.tsx`, `frontend/src/resident/components/LocationMap.tsx`, `frontend/src/resident/styles/resident.css`
- **Authorization:** User requests: "add maximize capability on the maps", "i dont want a complete word like maximize, just put the box icon that usual seen in the system maps today, and also if the map is minimize state just make the zoom - + a little in size"
- **Type:** Feature

## Intent

Provide users with the ability to expand and maximize map views across both the Leader and Resident interfaces, enabling easier orientation, street examination, and precise pin placement. Refined controls to use standard map box icons without text, and reduced zoom control size in compact views for clean proportions.

## Key changes

1. **Map Styles (`frontend/src/preview/map/map.css` & `frontend/src/resident/styles/resident.css`)**:
   - Replaced oversized 44px zoom buttons in compact/minimized map views with neat, proportional 28px buttons (`width: 28px; height: 28px; font-size: 16px; line-height: 28px;`).
   - Added `.pv-map-ctrl-btn`: Square 28px × 28px floating button positioned in the top-right corner of maps (`z-index: 1000`) matching the height and radius of the zoom buttons.
   - Added `.pv-map-fullscreen`: Fullscreen overlay (`position: fixed; inset: 0; z-index: 99999`) with a clean header showing the location title and a "Close" / "Done" button.
   - Styled Leaflet controls in fullscreen mode for comfortable touch and desktop mouse interaction.

2. **Read-Only Preview Maps (`frontend/src/preview/map/ReadOnlyMap.tsx`)**:
   - Swapped text "Maximize" button for the standard map corner-box icon (`Maximize` from `lucide-react`).
   - Built a fullscreen modal portal (`createPortal(..., document.body)`) that renders a fully interactive map view with enabled zoom controls, panning, touch zoom, and scroll-wheel zoom.
   - Added `Escape` key listener and automatic body scroll locking while the map is maximized.
   - Automatically enhances all locations where `LocationMapPreview` is used (Case Details, Monitored Case Hero, Sighting History, Notices, Report Details, Review Page).

3. **Interactive Location Picker Map (`frontend/src/resident/components/LocationMap.tsx`)**:
   - Added square corner-box maximize button on the location picker map used during report creation.
   - Allows residents to expand the map to full screen, pan across the subdivision, and tap or drag the pin with high precision.
   - Added a "Done" button in the fullscreen header that safely returns to the report form with the pin positioned.

## Validation evidence

- Ran `npm --prefix frontend run build` (`tsc -b && vite build`) which completed with exit code 0 and zero TypeScript or bundling errors.
- Verified portal mounting, Escape key dismissal, and scroll lock behavior.
