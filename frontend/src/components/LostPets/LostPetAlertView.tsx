import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../utils/api';
import { useAutoRefresh } from '../../utils/useAutoRefresh';
import { DEFAULT_PET_AVATAR } from '../../utils/avatar';
import LostPetTrackingMap from './LostPetTrackingMap';
import SpottedHereForm from './SpottedHereForm';
import PinLocationInfo from './PinLocationInfo';
import { usePlaceNames } from './usePlaceNames';
import { fmtCoord } from '../../utils/placeName';
import {
    ALERT_STATUS_LABEL, buildTimeline, CLOSE_OUTCOME_LABEL, fmtDateTime, fmtTime, SIGHTING_STATUS_LABEL,
    type LostPetAlert, type Sighting,
} from '../../utils/lostPets';

const errorText = (e: unknown, fallback: string) => {
    const d = (e as { response?: { data?: { detail?: unknown } } } | null)?.response?.data?.detail;
    return typeof d === 'string' ? d : fallback;
};
const btn = 'px-3 py-1.5 rounded-lg text-xs font-black border cursor-pointer disabled:opacity-50';
const input = 'w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300';

/** One neighborhood alert: card, tracking map, timeline, Spotted Here, and (for the leader) management. */
export default function LostPetAlertView({ alertId, reportPath, onAlertLoaded }: {
    alertId: number;
    reportPath: (id: number) => string;
    onAlertLoaded?: (data: LostPetAlert) => void;
}) {
    const [alert, setAlert] = useState<LostPetAlert | null>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [spotting, setSpotting] = useState(false);
    const [notice, setNotice] = useState('');
    const [selected, setSelected] = useState<Sighting | null>(null);
    const [mode, setMode] = useState<'none' | 'activate' | 'edit' | 'close' | 'reunited'>('none');
    const [text, setText] = useState('');
    const [outcome, setOutcome] = useState('not_found');
    const [busy, setBusy] = useState(false);
    const seen = useRef<number | null>(null);

    const apply = useCallback((data: LostPetAlert) => {
        // Live update: a sighting that arrived while the page was open is announced
        if (seen.current !== null && data.sighting_count > seen.current && data.latest_sighting && !data.latest_sighting.is_mine) {
            setNotice(`New sighting: ${data.latest_sighting.location_label || `pinned point ${fmtCoord(data.latest_sighting.latitude)}, ${fmtCoord(data.latest_sighting.longitude)}`} at ${fmtTime(data.latest_sighting.seen_at)}.`);
        }
        seen.current = data.sighting_count;
        setAlert(data);
        setError('');
        onAlertLoaded?.(data);
    }, [onAlertLoaded]);
    const load = useCallback(() => api.get<LostPetAlert>(`/lost-pet-alerts/${alertId}`).then(r => apply(r.data)), [alertId, apply]);

    useEffect(() => {
        let active = true;
        api.get<LostPetAlert>(`/lost-pet-alerts/${alertId}`)
            .then(r => { if (active) apply(r.data); })
            .catch(e => { if (active) setError(errorText(e, 'This neighborhood alert could not be loaded.')); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [alertId, apply]);
    useAutoRefresh(() => load().catch(() => undefined), true, 15000);
    // Older sightings saved without a place name get one looked up from their own coordinates (display only)
    const placeNames = usePlaceNames(alert?.sightings || []);
    const placeOf = (s: Sighting) => s.location_label || placeNames[s.sighting_id] || null;

    const act = async (fn: () => Promise<unknown>, done: string) => {
        setBusy(true);
        setError('');
        try {
            await fn();
            setMode('none');
            setText('');
            setNotice(done);
            await load();
        } catch (e) {
            setError(errorText(e, 'That action could not be completed.'));
        } finally {
            setBusy(false);
        }
    };

    if (loading) return <div className="rounded-2xl bg-white border border-gray-100 p-8 text-center text-sm text-gray-500" role="status">Loading the alert…</div>;
    if (!alert) return <div role="alert" className="rounded-2xl bg-white border border-red-100 p-6 text-sm text-red-700">{error || 'Alert not found.'}</div>;

    const sightings = alert.sightings || [];
    const timeline = buildTimeline(alert, sightings);
    const latestId = alert.latest_sighting?.sighting_id ?? null;
    const p = alert.pet || {
        name: 'Pet',
        photo_url: null,
        species: null,
        breed: null,
        color: null,
        distinguishing_marks: null,
        description: null,
    };
    return (
        <div className="space-y-4" data-testid="lost-pet-alert-view">
            {notice && <p role="status" className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-900">{notice}</p>}
            {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{error}</p>}

            {/* Lost Pet Alert Card */}
            <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-4 sm:flex-row">
                    <img src={p.photo_url || DEFAULT_PET_AVATAR} alt={p.name || 'Pet'} className="h-40 w-full rounded-xl object-cover sm:w-40" onError={e => { e.currentTarget.src = DEFAULT_PET_AVATAR; }} />
                    <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-lg font-black text-gray-900">{p.name || 'Pet'}</h2>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${alert.status === 'active' ? 'bg-red-100 text-red-700' : alert.status === 'requested' ? 'bg-amber-100 text-amber-800' : alert.close_outcome === 'reunited' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                                {alert.status === 'closed' ? CLOSE_OUTCOME_LABEL[alert.close_outcome || 'other'] || 'Closed' : ALERT_STATUS_LABEL[alert.status]}
                            </span>
                        </div>
                        <p className="text-sm text-gray-700">{[p.species, p.breed, p.color].filter(Boolean).join(' · ') || 'Details not provided'}</p>
                        {p.distinguishing_marks && <p className="text-xs text-gray-600"><strong>Marks:</strong> {p.distinguishing_marks}</p>}
                        <p className="text-xs text-gray-600"><strong>Last seen:</strong> {alert.last_seen?.location || 'see map'} · {fmtDateTime(alert.last_seen?.at)}</p>
                        {alert.owner_note && <p className="text-xs text-gray-600"><strong>Owner's note:</strong> {alert.owner_note}</p>}
                        {alert.leader_message && <p className="text-xs text-gray-600"><strong>From your Subdivision Leader:</strong> {alert.leader_message}</p>}
                        <p className="text-xs text-gray-500">{alert.contact_text}</p>
                        <p className="text-xs font-semibold text-gray-700">{alert.sighting_count} sighting{alert.sighting_count === 1 ? '' : 's'} reported{alert.latest_sighting ? ` · latest submitted ${fmtDateTime(alert.latest_sighting.submitted_at)}` : ''}</p>
                        <div className="flex flex-wrap gap-2 pt-1">
                            {alert.accepting_sightings && !spotting && (
                                <button type="button" onClick={() => { setSpotting(true); setNotice(''); }} className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-black">
                                    📍 Report a Sighting
                                </button>
                            )}
                            {(alert.is_owner || alert.can_manage) && (
                                <Link to={reportPath(alert.report_id)} className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-50">Open Lost Pet Report #{alert.report_id}</Link>
                            )}
                        </div>
                        {alert.status === 'closed' && <p className="text-xs text-gray-500">This alert is closed{alert.close_reason ? `: ${alert.close_reason}` : ''}. New sightings are no longer accepted; earlier sightings are kept.</p>}
                    </div>
                </div>
            </section>

            {spotting && <SpottedHereForm alert={alert} onCancel={() => setSpotting(false)} onSubmitted={() => {
                setSpotting(false);
                setNotice('Thank you! Your sighting was sent to the owner and the Subdivision Leader.');
                load().catch(() => undefined);
            }} />}

            {/* Leader management */}
            {alert.can_manage && (
                <section className="rounded-2xl border border-role-border bg-white p-4 space-y-3" aria-label="Manage the alert">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Subdivision Leader</p>
                    {alert.residents_notified != null && alert.activated_at && <p className="text-xs text-gray-600">Broadcast {fmtDateTime(alert.activated_at)} to {alert.residents_notified} resident{alert.residents_notified === 1 ? '' : 's'}.</p>}
                    <div className="flex flex-wrap gap-2">
                        {alert.status !== 'active' && <button type="button" className={`${btn} bg-role text-white border-transparent`} onClick={() => { setMode('activate'); setText(alert.leader_message || ''); }}>Activate Neighborhood Alert</button>}
                        {alert.status !== 'closed' && <button type="button" className={`${btn} bg-white text-gray-700 border-gray-200`} onClick={() => { setMode('edit'); setText(alert.leader_message || ''); }}>Update message</button>}
                        {alert.status !== 'closed' && <button type="button" className={`${btn} bg-green-600 text-white border-transparent`} onClick={() => { setMode('reunited'); setText(''); }}>Mark Resolved – Pet Reunited</button>}
                        {alert.status !== 'closed' && <button type="button" className={`${btn} bg-white text-red-700 border-red-200`} onClick={() => { setMode('close'); setText(''); }}>Close alert</button>}
                    </div>
                    {(mode === 'activate' || mode === 'edit') && (
                        <div className="space-y-2">
                            <label className="block space-y-1 text-xs font-bold text-gray-700">Message to residents (optional)
                                <textarea className={input} rows={2} value={text} maxLength={1000} onChange={e => setText(e.target.value)} aria-label="Message to residents" />
                            </label>
                            <button type="button" disabled={busy} className={`${btn} bg-role text-white border-transparent`} onClick={() => act(
                                () => mode === 'activate' ? api.post(`/lost-pet-alerts/${alert.alert_id}/activate`, { leader_message: text })
                                    : api.patch(`/lost-pet-alerts/${alert.alert_id}`, { leader_message: text }),
                                mode === 'activate' ? 'The neighborhood alert is live; residents were notified.' : 'Alert updated.')}>
                                {mode === 'activate' ? 'Broadcast to residents' : 'Save'}
                            </button>
                        </div>
                    )}
                    {mode === 'close' && (
                        <div className="space-y-2">
                            <select className={input} value={outcome} onChange={e => setOutcome(e.target.value)} aria-label="Why close">
                                <option value="not_found">Pet not found (report stays open)</option>
                                <option value="declined">Not broadcast</option>
                                <option value="other">Other</option>
                            </select>
                            <textarea className={input} rows={2} value={text} onChange={e => setText(e.target.value)} placeholder="Reason (required)" aria-label="Reason for closing" />
                            <button type="button" disabled={busy || text.trim().length < 5} className={`${btn} bg-red-600 text-white border-transparent`}
                                onClick={() => act(() => api.post(`/lost-pet-alerts/${alert.alert_id}/close`, { outcome, reason: text.trim() }), 'Alert closed.')}>Close alert</button>
                        </div>
                    )}
                    {mode === 'reunited' && (
                        <div className="space-y-2">
                            <p className="text-xs text-gray-600">Confirm you verified the pet is home. The Lost Pet Report becomes Resolved – Pet Reunited and the alert closes.</p>
                            <textarea className={input} rows={2} value={text} onChange={e => setText(e.target.value)} placeholder="How it was verified (required)" aria-label="Reunion note" />
                            <button type="button" disabled={busy || text.trim().length < 3} className={`${btn} bg-green-600 text-white border-transparent`}
                                onClick={() => act(() => api.post(`/lost-pet-alerts/${alert.alert_id}/reunited`, { note: text.trim() }), 'Marked Resolved – Pet Reunited.')}>Confirm reunion</button>
                        </div>
                    )}
                </section>
            )}

            {/* Interactive tracking map */}
            <section className="space-y-2" aria-label="Lost pet tracking map">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-black text-gray-900">Lost Pet Tracking Map</h3>
                    <span className="text-[11px] text-gray-500">Each pin is a separate reported sighting, not a route.</span>
                </div>
                <LostPetTrackingMap alert={alert} sightings={sightings} latestId={latestId} onSelect={setSelected} placeNames={placeNames} />
            </section>

            {selected && (
                <section className="rounded-2xl border border-gray-200 bg-white p-4 text-sm space-y-1.5" data-testid="sighting-detail" aria-label="Sighting details">
                    <div className="flex items-center justify-between"><h3 className="font-black text-gray-900">Sighting details</h3>
                        <button type="button" onClick={() => setSelected(null)} aria-label="Close sighting details" className="text-xs font-bold text-gray-500">Close</button></div>
                    <PinLocationInfo name={placeOf(selected)} latitude={selected.latitude} longitude={selected.longitude} looking={!placeOf(selected)} />
                    <p className="text-xs text-gray-500">Point set by {selected.location_source === 'device' ? 'the device location' : 'a map pin'}</p>
                    <p><strong>Seen (as reported):</strong> {fmtDateTime(selected.seen_at)}</p>
                    <p><strong>Submitted:</strong> {fmtDateTime(selected.submitted_at)}</p>
                    {selected.photo_url && <img src={selected.photo_url} alt="Reported sighting" className="max-h-56 rounded-xl object-cover" />}
                    {selected.description && <p>{selected.description}</p>}
                    <p className="text-xs text-gray-500">Reported by {selected.reported_by} · {SIGHTING_STATUS_LABEL[selected.status]}{selected.review_note ? ` (${selected.review_note})` : ''}</p>
                </section>
            )}

            {/* Sighting timeline */}
            <section className="rounded-2xl border border-gray-100 bg-white p-4" aria-label="Sighting timeline">
                <h3 className="text-sm font-black text-gray-900 mb-3">Sighting timeline</h3>
                <ol className="space-y-3" data-testid="sighting-timeline">
                    {timeline.map(item => (
                        <li key={item.key} className={`flex gap-3 rounded-xl p-2 ${item.latest ? 'bg-blue-50 ring-1 ring-blue-200' : ''}`}>
                            <span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${item.kind === 'last_seen' ? 'bg-red-600' : item.sighting?.status === 'verified' ? 'bg-emerald-600' : 'bg-amber-500'}`} aria-hidden="true" />
                            <div className="min-w-0 flex-1 text-xs">
                                <p className="font-bold text-gray-900">{fmtTime(item.at)} – {item.sighting && !item.sighting.location_label && placeNames[item.sighting.sighting_id] ? `Spotted ${placeNames[item.sighting.sighting_id].replace(/^Near /, 'near ')}` : item.label}{item.latest && <span className="ml-2 rounded-full bg-blue-600 px-2 py-0.5 text-[9px] font-black uppercase text-white">Latest</span>}</p>
                                {item.sighting && (
                                    <>
                                        <p className="text-gray-500">Seen {fmtDateTime(item.at)} · submitted {fmtDateTime(item.submitted_at)} · by {item.sighting.reported_by}</p>
                                        {item.sighting.description && <p className="text-gray-700">{item.sighting.description}</p>}
                                        <p className="text-gray-500">{SIGHTING_STATUS_LABEL[item.sighting.status]}</p>
                                        <div className="mt-1 flex flex-wrap gap-2">
                                            <button type="button" onClick={() => setSelected(item.sighting!)} className="text-[11px] font-bold text-role hover:underline">View details</button>
                                            {alert.can_manage && item.sighting.status !== 'verified' && (
                                                <button type="button" disabled={busy} className="text-[11px] font-bold text-emerald-700 hover:underline"
                                                    onClick={() => act(() => api.post(`/lost-pet-alerts/sightings/${item.sighting!.sighting_id}/review`, { status: 'verified' }), 'Sighting marked verified.')}>Mark verified</button>
                                            )}
                                            {alert.can_manage && item.sighting.status !== 'dismissed' && (
                                                <button type="button" disabled={busy} className="text-[11px] font-bold text-gray-600 hover:underline"
                                                    onClick={() => act(() => api.post(`/lost-pet-alerts/sightings/${item.sighting!.sighting_id}/review`, { status: 'dismissed' }), 'Sighting dismissed.')}>Dismiss</button>
                                            )}
                                        </div>
                                    </>
                                )}
                                {item.kind === 'last_seen' && <p className="text-gray-500">{fmtDateTime(item.at)} · from the Lost Pet Report</p>}
                            </div>
                        </li>
                    ))}
                </ol>
                {sightings.length === 0 && <p className="mt-2 text-xs text-gray-500">No sightings reported yet.</p>}
            </section>
        </div>
    );
}
