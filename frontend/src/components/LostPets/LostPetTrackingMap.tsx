import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, X } from 'lucide-react';
import { MapContainer, Marker, Popup, TileLayer, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import MapAutoResize from '../MapControls/MapAutoResize';
import { SELERA_DEFAULT_CENTER, isValidLatLng } from '../../utils/coverageArea';
import { fmtDateTime, orderedSightings, SIGHTING_STATUS_LABEL, type LostPetAlert, type Sighting } from '../../utils/lostPets';
import PinLocationInfo from './PinLocationInfo';
import { lastSeenIcon, sightingIcon } from './sightingMarkers';

const pickIcon = L.divIcon({
    className: '', iconSize: [26, 26], iconAnchor: [13, 13],
    html: '<div style="width:26px;height:26px;border-radius:9999px;background:#2563eb;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>',
});

const Picker = ({ onPick }: { onPick: (lat: number, lng: number) => void }) => {
    useMapEvents({ click: e => onPick(e.latlng.lat, e.latlng.lng) });
    return null;
};

type MapView = { center: [number, number]; zoom: number };

function RememberView({ onChange }: { onChange: (view: MapView) => void }) {
    const map = useMapEvents({
        moveend: () => {
            const center = map.getCenter();
            onChange({ center: [center.lat, center.lng], zoom: map.getZoom() });
        },
    });
    return null;
}

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
    const [expanded, setExpanded] = useState(false);
    const [view, setView] = useState<MapView | null>(null);
    const rememberView = useCallback((next: MapView) => setView(next), []);
    const dialogRef = useRef<HTMLDialogElement>(null);
    const expandButtonRef = useRef<HTMLButtonElement>(null);
    const headingId = useId();

    useEffect(() => {
        if (!expanded || !dialogRef.current) return;
        const dialog = dialogRef.current;
        const expandButton = expandButtonRef.current;
        const previousOverflow = document.body.style.overflow;
        dialog.showModal();
        document.body.style.overflow = 'hidden';
        return () => {
            dialog.close();
            document.body.style.overflow = previousOverflow;
            expandButton?.focus();
        };
    }, [expanded]);

    const ls = alert?.last_seen;
    const hasLastSeen = isValidLatLng(ls?.latitude, ls?.longitude);
    const center: [number, number] = pick ? [pick.lat, pick.lng] : (hasLastSeen && ls?.latitude != null && ls?.longitude != null) ? [Number(ls.latitude), Number(ls.longitude)] : SELERA_DEFAULT_CENTER;
    // numbered in reported-time order (the same order as the timeline)
    const ordered = orderedSightings(sightings);
    const map = (
        <div className="relative h-full w-full overflow-hidden" data-testid="lost-pet-map"
            aria-label={onPick ? 'Map: tap to place the sighting pin' : `Map of ${sightings.length} reported sightings`}>
            <MapContainer center={view?.center || center} zoom={view?.zoom ?? 17} scrollWheelZoom={expanded} style={{ height: '100%', width: '100%' }}>
                <MapAutoResize />
                <RememberView onChange={rememberView} />
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

    return (
        <>
            <div className="relative z-0 overflow-hidden rounded-2xl border border-gray-200" style={{ height }}>
                {!expanded && map}
                <button ref={expandButtonRef} type="button" onClick={() => setExpanded(true)}
                    aria-label="Expand tracking map" aria-haspopup="dialog" aria-expanded={expanded}
                    className="absolute right-3 top-3 z-[500] inline-flex min-h-10 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 cursor-pointer">
                    <Maximize2 className="h-4 w-4" aria-hidden="true" />
                    Expand map
                </button>
            </div>
            {expanded && createPortal(
                <dialog ref={dialogRef} aria-labelledby={headingId}
                    onCancel={event => { event.preventDefault(); setExpanded(false); }}
                    onKeyDown={event => {
                        if (event.key === 'Escape') {
                            event.preventDefault();
                            event.stopPropagation();
                            setExpanded(false);
                        }
                    }}
                    className="fixed inset-0 m-0 h-[100dvh] max-h-none w-screen max-w-none flex-col border-0 bg-white p-0 open:flex backdrop:bg-black/40">
                    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 sm:px-6">
                        <h2 id={headingId} className="text-base font-semibold text-gray-900">Lost Pet Tracking Map</h2>
                        <button type="button" autoFocus onClick={() => setExpanded(false)} aria-label="Close expanded map"
                            className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium text-gray-600 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-orange-600 cursor-pointer">
                            <X className="h-4 w-4" aria-hidden="true" /> Close
                        </button>
                    </header>
                    <div className="min-h-0 flex-1">{map}</div>
                </dialog>, document.body,
            )}
        </>
    );
}
