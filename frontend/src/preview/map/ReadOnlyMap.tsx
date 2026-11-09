import { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { Circle, MapContainer, Marker, Polygon, TileLayer, useMap } from 'react-leaflet';
import MapAutoResize from '../../components/MapControls/MapAutoResize';
import { AREA_OUTLINE, GENERAL_AREA_RADIUS_M, OSM_TILES } from '../geo';
import { dotIcon, pinIcon } from './icons';
import { AREA_STYLE, OUTLINE_STYLE } from './styles';
import type { ReadOnlyMapProps } from './types';
import './map.css';

const PADDING: L.PointExpression = [10, 10];

/** Keeps the view on the outline plus whatever is plotted, also after the box changes size (a tab, a sheet, a rotation). */
function FitView({ south, west, north, east }: { south: number; west: number; north: number; east: number }) {
  const map = useMap();
  useEffect(() => {
    const fit = () => map.fitBounds(L.latLngBounds([south, west], [north, east]), { padding: PADDING, maxZoom: 17, animate: false });
    fit();
    map.on('resize', fit);
    return () => { map.off('resize', fit); };
  }, [map, south, west, north, east]);
  return null;
}

/**
 * A compact, read-only map: the approximate subdivision outline, an exact pin and/or general areas and numbered markers.
 * It only shows what it is given. Callers decide the precision, so an exact position is passed only to a viewer who is
 * authorized to see it. Loaded lazily by LocationMapPreview.
 */
export default function ReadOnlyMap({ pin = null, areas = [], numbered = [], height = 180, label, interactive = false }: ReadOnlyMapProps) {
  const [tilesFailed, setTilesFailed] = useState(false);

  const bounds = useMemo(() => {
    const b = L.latLngBounds(AREA_OUTLINE);
    if (pin) b.extend([pin.lat, pin.lng]);
    for (const a of areas) b.extend(L.latLng(a.lat, a.lng).toBounds(a.radiusM * 2));
    for (const p of numbered) b.extend(p.general ? L.latLng(p.lat, p.lng).toBounds(GENERAL_AREA_RADIUS_M * 2) : [p.lat, p.lng]);
    return b;
  }, [pin, areas, numbered]);

  const exact = Boolean(pin) || numbered.some((p) => !p.general);
  const general = areas.length > 0 || numbered.some((p) => p.general);
  // What is plotted, as data: it shows at a glance that a community view carries only rounded positions.
  const plotted = JSON.stringify({ pin, areas, numbered });

  return (
    <div>
      <div className="pv-map" style={{ height }} role="group" aria-label={label} data-precision={exact && general ? 'mixed' : exact ? 'exact' : 'general'} data-plotted={plotted}>
        <MapContainer
          bounds={bounds}
          boundsOptions={{ padding: PADDING, maxZoom: 17 }}
          style={{ height: '100%', width: '100%' }}
          zoomControl={interactive}
          // On a phone one finger scrolls the page; the buttons and a pinch still zoom.
          dragging={interactive && !L.Browser.mobile}
          touchZoom={interactive}
          doubleClickZoom={false}
          scrollWheelZoom={false}
          boxZoom={false}
          keyboard={false}
        >
          <MapAutoResize />
          <FitView south={bounds.getSouth()} west={bounds.getWest()} north={bounds.getNorth()} east={bounds.getEast()} />
          <TileLayer {...OSM_TILES} eventHandlers={{ tileerror: () => setTilesFailed(true) }} />
          <Polygon positions={AREA_OUTLINE} pathOptions={OUTLINE_STYLE} />
          {areas.map((a) => <Circle key={`area-${a.lat}-${a.lng}`} center={[a.lat, a.lng]} radius={a.radiusM} pathOptions={AREA_STYLE} />)}
          {numbered.filter((p) => p.general).map((p) => <Circle key={`around-${p.n}`} center={[p.lat, p.lng]} radius={GENERAL_AREA_RADIUS_M} pathOptions={AREA_STYLE} />)}
          {pin ? <Marker position={[pin.lat, pin.lng]} icon={pinIcon} interactive={false} keyboard={false} /> : null}
          {numbered.map((p) => <Marker key={`n-${p.n}`} position={[p.lat, p.lng]} icon={dotIcon(p.n, Boolean(p.latest))} interactive={false} keyboard={false} />)}
        </MapContainer>
      </div>
      {tilesFailed ? <p className="pv-note">The map pictures couldn’t load. The outline and the marker still show, and the place is described in words above.</p> : null}
    </div>
  );
}
