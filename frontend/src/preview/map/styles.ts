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
/** A general area (a rounded position with a circle around it). */
export const AREA_STYLE: PathOptions = { className: 'pv-area', weight: 1.5, interactive: false };
