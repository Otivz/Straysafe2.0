import type { GeneralArea, Point } from '../geo';

/** A numbered sighting. `general` points are already rounded (see `generalize`) and are drawn with their area circle. */
export interface NumberedPoint extends Point { n: number; latest?: boolean; general?: boolean }

/**
 * One leg of a sighting trail. `arrow`: drawn with an arrowhead (the direction means something); `unclear`: drawn without one (too long
 * between the two to say which way); `jump`: drawn in amber (too far for the time that passed: it may be a different animal).
 */
export interface TrailLine { from: Point; to: Point; kind: 'arrow' | 'unclear' | 'jump' }
/** An approximate area to search. A guide, never a prediction. */
export interface TrailZone { lat: number; lng: number; radiusM: number }

export interface ReadOnlyMapProps {
  /** Dashed lines joining the numbered places in the order they were seen. Only for a viewer who sees exact positions. */
  trail?: TrailLine[];
  /** The area to search, around the latest place. */
  zone?: TrailZone | null;
  /** An exact spot. Only pass it when the viewer is authorized to see it. */
  pin?: Point | null;
  /** General areas: a circle around a rounded point, never an exact spot. */
  areas?: GeneralArea[];
  /** Numbered markers, e.g. sightings in the order they were reported. */
  numbered?: NumberedPoint[];
  height?: number;
  /** Accessible name of the map. */
  label: string;
  /** Zoom buttons (and dragging with a mouse). Off for compact maps, which just show the place. */
  interactive?: boolean;
}
