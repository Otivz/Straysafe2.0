import { lazy, Suspense } from 'react';
import type { ReadOnlyMapProps } from './types';
import './map.css';

// Leaflet is loaded only when a map is shown.
const ReadOnlyMap = lazy(() => import('./ReadOnlyMap'));

/** The compact read-only location map used by both previews. */
export function LocationMapPreview(props: ReadOnlyMapProps) {
  return (
    <Suspense fallback={<div className="pv-map pv-map--loading" style={{ height: props.height ?? 180 }} role="status" aria-label="Loading map" />}>
      <ReadOnlyMap {...props} />
    </Suspense>
  );
}
