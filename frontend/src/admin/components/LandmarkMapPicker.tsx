import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import { Circle, MapContainer, Marker, Polygon, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { Check, Crosshair, Maximize } from 'lucide-react';
import MapAutoResize from '../../components/MapControls/MapAutoResize';
import { OSM_TILES, areaCenter, areaOutline, reportingCoverage } from '../../preview/geo';
import { landmarkPinIcon, pinIcon } from '../../preview/map/icons';
import { OUTLINE_STYLE, RADIUS_STYLE } from '../../preview/map/styles';
import '../../preview/map/map.css';

export interface ReferenceLandmark {
  landmark_id: number;
  name: string;
  latitude: number;
  longitude: number;
}

function MapClicks({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

function FollowPin({ lat, lng }: { lat: number | null; lng: number | null }) {
  const map = useMap();
  const hadPin = useRef(false);
  useEffect(() => {
    if (lat !== null && lng !== null) {
      hadPin.current = true;
      map.flyTo([lat, lng], Math.max(map.getZoom(), 17), { duration: 0.3 });
    } else if (hadPin.current) {
      hadPin.current = false;
      map.flyTo(areaCenter(), 16, { duration: 0.3 });
    }
  }, [lat, lng, map]);
  return null;
}

function CenterSubdivisionButton() {
  const map = useMap();
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        map.flyTo(areaCenter(), 16, { duration: 0.3 });
      }}
      aria-label="Center map on subdivision"
      title="Center on subdivision"
      style={{ position: 'absolute', left: 10, bottom: 10, zIndex: 400 }}
      className="inline-flex items-center gap-1 rounded-md border border-[#e7e2da] bg-white/95 px-2.5 py-1 text-[12px] font-medium text-[#292524] shadow-sm hover:bg-[#fbf6ee]"
    >
      <Crosshair size={13} aria-hidden="true" />
      <span>Center on subdivision</span>
    </button>
  );
}

function MapCanvas({
  pin,
  onPick,
  otherLandmarks,
  height,
  interactiveZoom,
}: {
  pin: { lat: number; lng: number } | null;
  onPick: (lat: number, lng: number) => void;
  otherLandmarks: ReferenceLandmark[];
  height: number | string;
  interactiveZoom: boolean;
}) {
  const center = areaCenter();
  const radius = reportingCoverage().radius_meters;
  const startCenter: [number, number] = pin ? [pin.lat, pin.lng] : center;

  return (
    <MapContainer
      center={startCenter}
      zoom={pin ? 17 : 16}
      style={{ height, width: '100%' }}
      scrollWheelZoom={interactiveZoom}
      zoomControl={true}
    >
      <MapAutoResize />
      <TileLayer {...OSM_TILES} />
      <Circle center={center} radius={radius} pathOptions={RADIUS_STYLE} />
      <Polygon positions={areaOutline()} pathOptions={OUTLINE_STYLE} />
      <MapClicks onPick={onPick} />
      {otherLandmarks.map((lm, idx) => (
        <Marker
          key={lm.landmark_id}
          position={[lm.latitude, lm.longitude]}
          icon={landmarkPinIcon(idx + 1)}
        >
          <Tooltip direction="top" offset={[0, -28]}>{lm.name}</Tooltip>
        </Marker>
      ))}
      {pin ? (
        <Marker
          position={[pin.lat, pin.lng]}
          icon={pinIcon}
          draggable
          eventHandlers={{
            dragend: (e) => {
              const p = (e.target as L.Marker).getLatLng();
              onPick(p.lat, p.lng);
            },
          }}
        >
          <Tooltip direction="top" offset={[0, -28]}>Drag to adjust position</Tooltip>
        </Marker>
      ) : null}
      <FollowPin lat={pin?.lat ?? null} lng={pin?.lng ?? null} />
      <CenterSubdivisionButton />
    </MapContainer>
  );
}

/** Interactive Leaflet map used in Subdivision Settings to place or reposition a landmark pin. */
export default function LandmarkMapPicker({
  pin,
  onPick,
  otherLandmarks = [],
  height = 260,
}: {
  pin: { lat: number; lng: number } | null;
  onPick: (lat: number, lng: number) => void;
  otherLandmarks?: ReferenceLandmark[];
  height?: number;
}) {
  const [maximized, setMaximized] = useState(false);
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!maximized) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMaximized(false);
        setPortalTarget(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [maximized]);

  const openMaximize = () => {
    setPortalTarget(hostRef.current?.closest('dialog') ?? document.body);
    setMaximized(true);
  };

  const closeMaximize = () => {
    setMaximized(false);
    setPortalTarget(null);
  };

  return (
    <div ref={hostRef} className="pv-map" style={{ height }}>
      <button
        type="button"
        className="pv-map-ctrl-btn"
        onClick={openMaximize}
        aria-label="Maximize map"
        title="Expand map to place pin"
      >
        <Maximize size={15} aria-hidden="true" />
      </button>
      <MapCanvas
        pin={pin}
        onPick={onPick}
        otherLandmarks={otherLandmarks}
        height="100%"
        interactiveZoom={false}
      />

      {maximized && portalTarget ? createPortal(
        <div className="pv-map-fullscreen" role="dialog" aria-modal="true" aria-label="Expanded landmark map">
          <div className="pv-map-fullscreen__header">
            <div className="pv-map-fullscreen__title">
              <span>Click the map or drag the pin to place the landmark</span>
            </div>
            <button
              type="button"
              className="pv-map-fullscreen__close"
              onClick={closeMaximize}
              aria-label="Done placing pin"
              title="Done (Esc)"
            >
              <Check size={16} aria-hidden="true" />
              <span>Done</span>
            </button>
          </div>
          <div className="pv-map-fullscreen__body">
            <MapCanvas
              pin={pin}
              onPick={onPick}
              otherLandmarks={otherLandmarks}
              height="100%"
              interactiveZoom={true}
            />
          </div>
        </div>,
        portalTarget,
      ) : null}
    </div>
  );
}
