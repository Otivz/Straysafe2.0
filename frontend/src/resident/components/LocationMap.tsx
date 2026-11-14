import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import { Circle, MapContainer, Marker, Polygon, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { Check, Maximize } from 'lucide-react';
import MapAutoResize from '../../components/MapControls/MapAutoResize';
import { OSM_TILES, areaCenter, areaOutline, reportingCoverage } from '../../preview/geo';
import { pinIcon } from '../../preview/map/icons';
import { OUTLINE_STYLE, RADIUS_STYLE } from '../../preview/map/styles';
import '../../preview/map/map.css';

function Clicks({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

function Follow({ lat, lng }: { lat: number | null; lng: number | null }) {
  const map = useMap();
  useEffect(() => {
    if (lat !== null && lng !== null) map.flyTo([lat, lng], Math.max(map.getZoom(), 17), { duration: 0.35 });
  }, [lat, lng, map]);
  return null;
}

/**
 * Leaflet map for choosing where the animal was seen: tap to place the pin, drag the pin to adjust. It opens on the whole
 * reporting area (the dashed circle) so the limit is visible, then zooms in on the pin. The orange dashes are the
 * approximate outline, drawn for orientation only; the circle is what decides whether a spot can be reported.
 * Loaded lazily by LocationPicker.
 */
export default function LocationMap({ pin, onPick, onTilesFailed }: { pin: { lat: number; lng: number } | null; onPick: (lat: number, lng: number) => void; onTilesFailed: () => void }) {
  const radius = reportingCoverage().radius_meters;
  const center = areaCenter();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!maximized) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMaximized(false); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [maximized]);

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        className="pv-map-ctrl-btn"
        onClick={() => setMaximized(true)}
        aria-label="Maximize map"
        title="Maximize map to choose location"
      >
        <Maximize size={15} aria-hidden="true" />
      </button>
      <MapContainer center={pin ? [pin.lat, pin.lng] : center} zoom={pin ? 17 : 15} className="rs-map" scrollWheelZoom={false}>
        <MapAutoResize />
        <TileLayer {...OSM_TILES} eventHandlers={{ tileerror: onTilesFailed }} />
        <Circle center={center} radius={radius} pathOptions={RADIUS_STYLE} />
        <Polygon positions={areaOutline()} pathOptions={OUTLINE_STYLE} />
        <Clicks onPick={onPick} />
        {pin ? <Marker position={[pin.lat, pin.lng]} icon={pinIcon} draggable eventHandlers={{ dragend: (e) => { const p = (e.target as L.Marker).getLatLng(); onPick(p.lat, p.lng); } }} /> : null}
        <Follow lat={pin?.lat ?? null} lng={pin?.lng ?? null} />
      </MapContainer>

      {maximized && typeof document !== 'undefined' ? createPortal(
        <div className="pv-map-fullscreen" role="dialog" aria-modal="true" aria-label="Expanded location map">
          <div className="pv-map-fullscreen__header">
            <div className="pv-map-fullscreen__title">
              <span>Tap the map to place the pin, then drag to adjust</span>
            </div>
            <button
              type="button"
              className="pv-map-fullscreen__close"
              onClick={() => setMaximized(false)}
              aria-label="Done selecting location"
              title="Done (Esc)"
            >
              <Check size={16} aria-hidden="true" />
              <span>Done</span>
            </button>
          </div>
          <div className="pv-map-fullscreen__body">
            <MapContainer center={pin ? [pin.lat, pin.lng] : center} zoom={pin ? 17 : 15} style={{ height: '100%', width: '100%' }} scrollWheelZoom={true} zoomControl={true}>
              <MapAutoResize />
              <TileLayer {...OSM_TILES} eventHandlers={{ tileerror: onTilesFailed }} />
              <Circle center={center} radius={radius} pathOptions={RADIUS_STYLE} />
              <Polygon positions={areaOutline()} pathOptions={OUTLINE_STYLE} />
              <Clicks onPick={onPick} />
              {pin ? <Marker position={[pin.lat, pin.lng]} icon={pinIcon} draggable eventHandlers={{ dragend: (e) => { const p = (e.target as L.Marker).getLatLng(); onPick(p.lat, p.lng); } }} /> : null}
              <Follow lat={pin?.lat ?? null} lng={pin?.lng ?? null} />
            </MapContainer>
          </div>
        </div>,
        document.body
      ) : null}
    </div>
  );
}
