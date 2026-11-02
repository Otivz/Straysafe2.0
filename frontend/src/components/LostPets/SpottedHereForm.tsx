import { useRef, useState } from 'react';
import api from '../../utils/api';
import { nominatimReverse } from '../../utils/geocode';
import { formatPlaceName } from '../../utils/placeName';
import LostPetTrackingMap from './LostPetTrackingMap';
import PinLocationInfo from './PinLocationInfo';
import { localInputValue, type LostPetAlert, type Sighting } from '../../utils/lostPets';

// "Spotted Here": the resident pins where they saw the pet (or, after their OK and the browser's permission, uses the
// device location once). Only this submission is stored; nothing is tracked. The time is when they saw it.

const errorText = (e: unknown, fallback: string) => {
    const d = (e as { response?: { data?: { detail?: unknown } } } | null)?.response?.data?.detail;
    return typeof d === 'string' ? d : fallback;
};
const newRequestId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

export default function SpottedHereForm({ alert, onSubmitted, onCancel }: {
    alert: LostPetAlert;
    onSubmitted: (s: Sighting) => void;
    onCancel: () => void;
}) {
    const [pick, setPick] = useState<{ lat: number; lng: number } | null>(null);
    const [source, setSource] = useState<'map_pin' | 'device'>('map_pin');
    const [label, setLabel] = useState('');
    const [labelEdited, setLabelEdited] = useState(false);  // the resident typed their own name: keep it
    const [lookup, setLookup] = useState<'idle' | 'looking' | 'found' | 'none'>('idle');
    const pinSeq = useRef(0);
    const [seenAt, setSeenAt] = useState(localInputValue());
    const [description, setDescription] = useState('');
    const [photo, setPhoto] = useState<File | null>(null);
    const [confirmed, setConfirmed] = useState(false);
    const [askLocation, setAskLocation] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [requestId] = useState(newRequestId);  // the same id on a retry: no duplicate record
    const [maxTime] = useState(() => localInputValue());

    // Each pin gets its own place name, looked up from that pin's coordinates. A late answer for an earlier pin is ignored.
    const placePin = (lat: number, lng: number, src: 'map_pin' | 'device') => {
        setPick({ lat, lng });
        setSource(src);
        setError('');
        const seq = ++pinSeq.current;
        setLookup('looking');
        if (!labelEdited) setLabel('');
        nominatimReverse(lat, lng, { format: 'jsonv2', addressdetails: 1, zoom: 18, 'accept-language': 'en' }, { timeoutMs: 6000 })
            .then(geo => {
                if (seq !== pinSeq.current) return;
                const name = formatPlaceName(geo);
                setLookup(name ? 'found' : 'none');
                if (name && !labelEdited) setLabel(name.slice(0, 255));
            })
            .catch(() => { if (seq === pinSeq.current) setLookup('none'); });
    };

    const useDevice = () => {
        setAskLocation(false);
        if (!navigator.geolocation) { setError('This device cannot share its location. Tap the map instead.'); return; }
        navigator.geolocation.getCurrentPosition(
            pos => placePin(pos.coords.latitude, pos.coords.longitude, 'device'),
            () => setError('Location permission was not given. Tap the map to place the pin instead.'),
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
        );
    };

    const problem = !pick ? 'Place the pin where you saw the pet (tap the map).'
        : !seenAt ? 'Enter when you saw the pet.'
            : !confirmed ? 'Confirm that your sighting information is accurate.' : '';

    const submit = async () => {
        if (problem || !pick) return;
        if (new Date(seenAt).getTime() > Date.now() + 5 * 60000) { setError("The sighting time can't be in the future."); return; }
        setBusy(true);
        setError('');
        const form = new FormData();
        form.append('latitude', String(pick.lat));
        form.append('longitude', String(pick.lng));
        form.append('location_source', source);
        if (label.trim()) form.append('location_label', label.trim());
        form.append('seen_at', seenAt);
        if (description.trim()) form.append('description', description.trim());
        form.append('accuracy_confirmed', 'true');
        form.append('client_request_id', requestId);
        if (photo) form.append('photo', photo);
        try {
            const res = await api.post(`/lost-pet-alerts/${alert.alert_id}/sightings`, form);
            onSubmitted(res.data.sighting);
        } catch (e) {
            setError(errorText(e, 'Your sighting could not be sent. Please try again.'));
        } finally {
            setBusy(false);
        }
    };

    const input = 'w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300';
    return (
        <section className="rounded-2xl border border-orange-200 bg-orange-50/40 p-4 space-y-3" data-testid="spotted-here-form" aria-label="Report a sighting">
            <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-black text-gray-900">📍 Spotted {alert.pet.name} here</h3>
                <button type="button" onClick={onCancel} className="text-xs font-bold text-gray-500 hover:underline">Cancel</button>
            </div>
            <p className="text-xs text-gray-600">Tap the map where you saw the pet. Your home address is never shared, and nothing is tracked after you submit.</p>
            <LostPetTrackingMap alert={alert} sightings={[]} pick={pick} onPick={(lat, lng) => placePin(lat, lng, 'map_pin')} height={240} />
            <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => setAskLocation(true)} className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-bold text-gray-700 hover:bg-gray-50">
                    Use my current location
                </button>
                {pick && <span className="text-[11px] font-semibold text-gray-600">Pin set ({source === 'device' ? 'device location' : 'map pin'})</span>}
            </div>
            {pick && (
                <div className="rounded-xl border border-gray-200 bg-white p-3" data-testid="pin-preview" aria-live="polite">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1">Pinned location</p>
                    <PinLocationInfo name={label.trim() || null} latitude={pick.lat} longitude={pick.lng} looking={lookup === 'looking'} />
                </div>
            )}
            {askLocation && (
                <div role="dialog" aria-label="Location permission" className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 space-y-2">
                    <p>StraySafe will read your device location <strong>once</strong>, only for this sighting. Your browser will ask for permission.</p>
                    <div className="flex gap-2">
                        <button type="button" onClick={useDevice} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white font-bold">Allow once</button>
                        <button type="button" onClick={() => setAskLocation(false)} className="px-3 py-1.5 rounded-lg bg-white border border-blue-200 font-bold">Use the map instead</button>
                    </div>
                </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1 text-xs font-bold text-gray-700">Location name (filled in from the pin; you can edit it)
                    <input className={input} value={label} maxLength={255} onChange={e => { setLabel(e.target.value); setLabelEdited(true); }}
                        placeholder={lookup === 'looking' ? 'Finding the place name…' : 'e.g. Lot 15, near the clubhouse'} aria-label="Location name" />
                    {lookup === 'none' && pick && !label.trim() && <span className="block text-[10px] font-medium text-gray-500">No place name was found for this point. The exact coordinates are still saved; you can type a landmark.</span>}
                </label>
                <label className="block space-y-1 text-xs font-bold text-gray-700">When did you see it?
                    <input className={input} type="datetime-local" value={seenAt} max={maxTime} onChange={e => setSeenAt(e.target.value)} aria-label="Sighting time" />
                    <span className="block text-[10px] font-medium text-gray-500">Change this if you saw it earlier. The time you submit is recorded separately.</span>
                </label>
            </div>
            <label className="block space-y-1 text-xs font-bold text-gray-700">What did you notice? (optional)
                <textarea className={input} rows={2} maxLength={1000} value={description} onChange={e => setDescription(e.target.value)} placeholder="Direction it went, behavior, collar…" />
            </label>
            <label className="block space-y-1 text-xs font-bold text-gray-700">Photo (optional)
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setPhoto(e.target.files?.[0] || null)} className="block text-xs" aria-label="Sighting photo" />
            </label>
            <label className="flex items-start gap-2 text-xs font-semibold text-gray-800">
                <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="mt-0.5" aria-label="I confirm the sighting is accurate" />
                I confirm this sighting information is accurate to the best of my knowledge.
            </label>
            {problem && <p className="text-[11px] font-bold text-amber-800">{problem}</p>}
            {error && <p role="alert" className="text-xs font-bold text-red-700">{error}</p>}
            <button type="button" disabled={busy || Boolean(problem)} onClick={submit}
                className="w-full py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:bg-gray-200 disabled:text-gray-500 text-white text-sm font-black">
                {busy ? 'Sending…' : 'Submit sighting'}
            </button>
        </section>
    );
}
