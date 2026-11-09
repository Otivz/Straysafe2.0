import { useEffect } from 'react';
import L from 'leaflet';
import { Circle, MapContainer, Marker, Polygon, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import MapAutoResize from '../../components/MapControls/MapAutoResize';
import { AREA_CENTER, AREA_OUTLINE, OSM_TILES, previewCoverage } from '../../preview/geo';
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
 * reporting area (the dashed circle) so the limit is visible, then zooms in on the pin. The orange dashes are the legacy
 * approximate outline, drawn for orientation only; the circle is what decides whether a spot can be reported.
 * Loaded lazily by LocationPicker.
 */
export default function LocationMap({ pin, onPick, onTilesFailed }: { pin: { lat: number; lng: number } | null; onPick: (lat: number, lng: number) => void; onTilesFailed: () => void }) {
  const radius = previewCoverage().radius_meters;
  return (
    <MapContainer center={pin ? [pin.lat, pin.lng] : AREA_CENTER} zoom={pin ? 17 : 15} className="rs-map" scrollWheelZoom={false}>
      <MapAutoResize />
      <TileLayer {...OSM_TILES} eventHandlers={{ tileerror: onTilesFailed }} />
      <Circle center={AREA_CENTER} radius={radius} pathOptions={RADIUS_STYLE} />
      <Polygon positions={AREA_OUTLINE} pathOptions={OUTLINE_STYLE} />
      <Clicks onPick={onPick} />
      {pin ? <Marker position={[pin.lat, pin.lng]} icon={pinIcon} draggable eventHandlers={{ dragend: (e) => { const p = (e.target as L.Marker).getLatLng(); onPick(p.lat, p.lng); } }} /> : null}
      <Follow lat={pin?.lat ?? null} lng={pin?.lng ?? null} />
    </MapContainer>
  );
}
