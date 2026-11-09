import type { GeneralArea, Point } from '../geo';

/** A numbered sighting. `general` points are already rounded (see `generalize`) and are drawn with their area circle. */
export interface NumberedPoint extends Point { n: number; latest?: boolean; general?: boolean }

export interface ReadOnlyMapProps {
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
