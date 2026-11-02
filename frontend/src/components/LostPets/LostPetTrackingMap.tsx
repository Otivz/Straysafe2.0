import { MapContainer, Marker, Popup, TileLayer, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import MapAutoResize from '../MapControls/MapAutoResize';
import { SELERA_DEFAULT_CENTER, isValidLatLng } from '../../utils/coverageArea';
import { fmtDateTime, SIGHTING_STATUS_LABEL, type LostPetAlert, type Sighting } from '../../utils/lostPets';
import PinLocationInfo from './PinLocationInfo';

// The original last-known location (red) and each resident sighting (numbered, amber; green once verified).
// Pins are separate reports: they are never joined into a route.
const lastSeenIcon = L.divIcon({
    className: '', iconSize: [34, 34], iconAnchor: [17, 34],
    html: '<div style="width:34px;height:34px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#dc2626;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center"><span style="transform:rotate(45deg);font-size:15px">🐾</span></div>',
});
const sightingIcon = (n: number, status: Sighting['status'], latest: boolean) => L.divIcon({
    className: '', iconSize: [28, 28], iconAnchor: [14, 14],
    html: `<div style="width:28px;height:28px;border-radius:9999px;background:${status === 'verified' ? '#059669' : status === 'dismissed' ? '#9ca3af' : '#f59e0b'};color:#fff;font:800 12px sans-serif;display:flex;align-items:center;justify-content:center;border:${latest ? '3px solid #1d4ed8' : '2px solid #fff'};box-shadow:0 1px 4px rgba(0,0,0,.35)">${n}</div>`,
});
const pickIcon = L.divIcon({
    className: '', iconSize: [26, 26], iconAnchor: [13, 13],
    html: '<div style="width:26px;height:26px;border-radius:9999px;background:#2563eb;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>',
});

const Picker = ({ onPick }: { onPick: (lat: number, lng: number) => void }) => {
    useMapEvents({ click: e => onPick(e.latlng.lat, e.latlng.lng) });
    return null;
};

export default function LostPetTrackingMap({ alert, sightings, latestId, pick, onPick, height = 320, onSelect, placeNames = {} }: {
    placeNames?: Record<number, string>;
    alert: Pick<LostPetAlert, 'last_seen' | 'pet'>;
    sightings: Sighting[];
    latestId?: number | null;
    pick?: { lat: number; lng: number } | null;
    onPick?: (lat: number, lng: number) => void;
    height?: number;
    onSelect?: (s: Sighting) => void;
}) {
    const ls = alert?.last_seen;
    const hasLastSeen = isValidLatLng(ls?.latitude, ls?.longitude);
    const center: [number, number] = pick ? [pick.lat, pick.lng] : (hasLastSeen && ls?.latitude != null && ls?.longitude != null) ? [Number(ls.latitude), Number(ls.longitude)] : SELERA_DEFAULT_CENTER;
    // numbered in reported-time order (the same order as the timeline)
    const ordered = (sightings || [])
        .filter(s => isValidLatLng(s?.latitude, s?.longitude))
        .sort((a, b) => new Date(a.seen_at).getTime() - new Date(b.seen_at).getTime() || a.sighting_id - b.sighting_id);
    return (
        <div className="relative z-0 overflow-hidden rounded-2xl border border-gray-200" style={{ height }} data-testid="lost-pet-map"
            aria-label={onPick ? 'Map: tap to place the sighting pin' : `Map of ${sightings.length} reported sightings`}>
            <MapContainer center={center} zoom={17} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
                <MapAutoResize />
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
                {hasLastSeen && (
                    <Marker position={[Number(ls.latitude), Number(ls.longitude)]} icon={lastSeenIcon}>
                        <Popup>
                            <p className="font-bold">Last known location</p>
                            <p>{ls.location || 'Pinned on the report'}</p>
                            <p className="text-xs text-gray-500">{fmtDateTime(ls.at)}</p>
                        </Popup>
                    </Marker>
                )}
                {ordered.map((s, i) => (
                    <Marker key={s.sighting_id} position={[s.latitude, s.longitude]} icon={sightingIcon(i + 1, s.status, s.sighting_id === latestId)}
                        eventHandlers={onSelect ? { click: () => onSelect(s) } : undefined}>
                        <Popup>
                            <div className="space-y-1 text-xs" style={{ minWidth: 180 }}>
                                <p className="font-bold">Sighting {i + 1}{s.sighting_id === latestId ? ' · latest' : ''}</p>
                                <PinLocationInfo compact name={s.location_label || placeNames[s.sighting_id]} latitude={s.latitude} longitude={s.longitude}
                                    looking={!s.location_label && !placeNames[s.sighting_id]} />
                                <p><strong>Seen:</strong> {fmtDateTime(s.seen_at)}</p>
                                <p><strong>Submitted:</strong> {fmtDateTime(s.submitted_at)}</p>
                                {s.photo_url && <img src={s.photo_url} alt="Sighting" style={{ width: '100%', maxHeight: 120, objectFit: 'cover', borderRadius: 8 }} />}
                                {s.description && <p>{s.description}</p>}
                                <p className="text-gray-500">{SIGHTING_STATUS_LABEL[s.status]}</p>
                            </div>
                        </Popup>
                    </Marker>
                ))}
                {pick && <Marker position={[pick.lat, pick.lng]} icon={pickIcon} />}
                {onPick && <Picker onPick={onPick} />}
            </MapContainer>
            <div className="pointer-events-none absolute bottom-2 left-2 z-[400] flex flex-wrap gap-2 rounded-lg bg-white/90 px-2 py-1 text-[10px] font-semibold text-gray-700 shadow">
                <span>🔴 Last known</span><span>🟠 Sighting</span><span>🟢 Verified</span>
            </div>
        </div>
    );
}
