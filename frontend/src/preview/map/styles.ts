import type { PathOptions } from 'leaflet';
import { SELERA_BOUNDARY_PATH_OPTIONS } from '../../utils/coverageArea';

/**
 * Path options for the overlays. The outline reuses the dash pattern and weight (`SELERA_BOUNDARY_PATH_OPTIONS`);
 * the colours come from the design tokens through the `pv-*` classes in map.css, so no colour is written here. None of
 * them is interactive, so a tap on an overlay still reaches the map.
 */
export const OUTLINE_STYLE: PathOptions = { ...SELERA_BOUNDARY_PATH_OPTIONS, className: 'pv-outline', interactive: false };
/** The reporting radius. */
export const RADIUS_STYLE: PathOptions = { className: 'pv-radius', weight: 1.5, dashArray: '4 6', interactive: false };
/** A sighting trail leg. Dashed on purpose: nobody knows the way the animal took. */
export const TRAIL_STYLE: PathOptions = { className: 'pv-trail', weight: 3, dashArray: '2 8', lineCap: 'round', interactive: false };
export const TRAIL_UNCLEAR_STYLE: PathOptions = { className: 'pv-trail pv-trail--unclear', weight: 2.5, dashArray: '1 9', lineCap: 'round', interactive: false };
export const TRAIL_JUMP_STYLE: PathOptions = { className: 'pv-trail pv-trail--jump', weight: 3, dashArray: '8 6', interactive: false };
/** The area to search. */
export const ZONE_STYLE: PathOptions = { className: 'pv-zone', weight: 1.5, dashArray: '5 6', interactive: false };
/** A general area (a rounded position with a circle around it). */
export const AREA_STYLE: PathOptions = { className: 'pv-area', weight: 1.5, interactive: false };
