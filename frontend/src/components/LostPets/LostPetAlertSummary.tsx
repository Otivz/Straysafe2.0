import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../utils/api';
import { useAutoRefresh } from '../../utils/useAutoRefresh';
import { ALERT_STATUS_LABEL, CLOSE_OUTCOME_LABEL, fmtDateTime, type LostPetAlert } from '../../utils/lostPets';

const errorText = (e: unknown, fallback: string) => {
    const d = (e as { response?: { data?: { detail?: unknown } } } | null)?.response?.data?.detail;
    return typeof d === 'string' ? d : fallback;
};

/**
 * On a Lost Pet Report page: its Neighborhood Alert, latest sighting and a link to the tracking map. The owner can
 * request the alert here; the leader opens it to review and activate. Renders nothing for other reports.
 */
export default function LostPetAlertSummary({ reportId, isLostPetReport, reportOpen, alertPath, requestLabel = 'Request Neighborhood Alert' }: {
    requestLabel?: string;
    reportId: number;
    isLostPetReport: boolean;
    reportOpen: boolean;
    alertPath: (alertId: number) => string;
}) {
    const [state, setState] = useState<{ alert: LostPetAlert | null; viewer: 'yes' | 'no' } | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const fetchAlert = () => api.get(`/lost-pet-alerts/reports/${reportId}`)
        .then(r => setState({ alert: r.data.alert, viewer: 'yes' }))
        .catch(() => setState({ alert: null, viewer: 'no' }));
    useEffect(() => {
        if (!isLostPetReport) return;
        let active = true;
        api.get(`/lost-pet-alerts/reports/${reportId}`)
            .then(r => { if (active) setState({ alert: r.data.alert, viewer: 'yes' }); })
            .catch(() => { if (active) setState({ alert: null, viewer: 'no' }); });
        return () => { active = false; };
    }, [reportId, isLostPetReport]);
    useAutoRefresh(() => fetchAlert(), isLostPetReport, 30000);

    if (!isLostPetReport || !state || state.viewer === 'no') return null;
    const a = state.alert;
    const request = async () => {
        setBusy(true);
        setError('');
        try {
            const r = await api.post(`/lost-pet-alerts/reports/${reportId}/request`, {});
            setState({ alert: r.data, viewer: 'yes' });
        } catch (e) {
            setError(errorText(e, 'The request could not be sent.'));
        } finally {
            setBusy(false);
        }
    };
    return (
        <section className="rounded-2xl border border-orange-200 bg-orange-50/40 p-4 space-y-2" data-testid="lost-pet-alert-summary" aria-label="Neighborhood alert">
            <p className="text-[10px] font-black uppercase tracking-widest text-orange-800">Subdivision Neighborhood Alert</p>
            {!a ? (
                <>
                    <p className="text-xs text-gray-700">No neighborhood alert yet for this Lost Pet Report.</p>
                    {reportOpen && (
                        <button type="button" disabled={busy} onClick={request}
                            className="px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-black disabled:opacity-60">
                            {busy ? 'Sending…' : requestLabel}
                        </button>
                    )}
                </>
            ) : (
                <>
                    <p className="text-sm font-black text-gray-900">
                        {a.status === 'closed' ? CLOSE_OUTCOME_LABEL[a.close_outcome || 'other'] || 'Closed' : ALERT_STATUS_LABEL[a.status]}
                    </p>
                    <p className="text-xs text-gray-700">{a.sighting_count} sighting{a.sighting_count === 1 ? '' : 's'} reported
                        {a.latest_sighting && <> · latest: {a.latest_sighting.location_label || 'pinned location'}, seen {fmtDateTime(a.latest_sighting.seen_at)} (submitted {fmtDateTime(a.latest_sighting.submitted_at)})</>}
                    </p>
                    <Link to={alertPath(a.alert_id)} className="inline-block px-3 py-1.5 rounded-lg border border-orange-300 bg-white text-xs font-black text-orange-800 hover:bg-orange-50">
                        {a.can_manage && a.status === 'requested' ? 'Review & activate the alert' : 'Open the tracking map'}
                    </Link>
                </>
            )}
            {error && <p role="alert" className="text-xs font-bold text-red-700">{error}</p>}
        </section>
    );
}
