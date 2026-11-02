import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import { useToast } from '../context/ToastContext';

// Phase 6 (docs/01-system/OWNER_WARNING_RULES.md), on the observed report:
// - cross-report banner: other reports about the pet under observation that may be repeat incidents
// - log a repeat (related report, not the observed one, once) and see each incident with its warnings
// - owners without an account: log a verbal warning (phone / in person) instead of an account warning
// The server enforces who may do what; buttons only appear for the handling leader.

interface Candidate { report_id: number; landmark: string | null; created_at: string | null; description: string | null }
interface Logged { incident_id: number; report_id: number; notes: string; incident_date: string | null; landmark: string | null; logged_by_name: string | null }
interface Incident {
    report_id: number;
    kind: 'observed' | 'repeat';
    incident_date: string | null;
    warnings: { warning_id: number; warning_level: string; violation_type: string; status: string }[];
    prefill: { suggested_tier: string; comply_by: string | null };
}
interface FollowUp { followup_id: number; status: string; owner_id: number | null }

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const errorText = (e: unknown, fallback: string) => {
    const d = (e as { response?: { data?: { detail?: unknown } } } | null)?.response?.data?.detail;
    return typeof d === 'string' ? d : fallback;
};
const TIERS = ['Notice', '1st Warning', '2nd Warning', 'Final Notice / Escalation'];
const inputCls = 'w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100';

const RepeatedReportBanner = ({ reportId, reportPath = (id: number) => `/subd/reports/${id}` }: { reportId: number; reportPath?: (id: number) => string }) => {
    const toast = useToast();
    const [followup, setFollowup] = useState<FollowUp | null>(null);
    const [candidates, setCandidates] = useState<Candidate[]>([]);
    const [logged, setLogged] = useState<Logged[]>([]);
    const [incidents, setIncidents] = useState<Incident[]>([]);
    const [canLog, setCanLog] = useState(false);
    const [logging, setLogging] = useState<number | null>(null);
    const [notes, setNotes] = useState('');
    const [busy, setBusy] = useState(false);
    const [verbal, setVerbal] = useState({ method: 'phone', tier: '1st Warning', report_id: '', notes: '' });

    const load = useCallback(async (fu: FollowUp) => {
        const [rr, inc] = await Promise.all([
            api.get(`/owner-followups/${fu.followup_id}/repeated-reports`),
            api.get(`/warnings/followup/${fu.followup_id}/incidents`),
        ]);
        setCandidates(rr.data.candidates || []);
        setLogged(rr.data.logged || []);
        setCanLog(!!rr.data.can_log);
        setIncidents(inc.data.incidents || []);
    }, []);

    useEffect(() => {
        let cancelled = false;
        api.get(`/owner-followups/by-report/${reportId}`)
            .then(async (r) => {
                if (cancelled || !r.data) return;
                setFollowup(r.data);
                await load(r.data);
            })
            .catch(() => { /* no observation on this report, or not in scope */ });
        return () => { cancelled = true; };
    }, [reportId, load]);

    if (!followup) return null;
    if (followup.status !== 'observing' && logged.length === 0) return null;

    const logRepeat = async (rid: number) => {
        setBusy(true);
        try {
            await api.post(`/owner-followups/${followup.followup_id}/repeated-incidents`, { report_id: rid, notes: notes.trim() });
            toast.success('Repeat incident logged', `Report #${rid} is now a repeat incident of this observation.`);
            setLogging(null);
            setNotes('');
            await load(followup);
        } catch (e) {
            toast.error('Not logged', errorText(e, 'Please try again.'));
        } finally {
            setBusy(false);
        }
    };

    const logVerbal = async () => {
        setBusy(true);
        try {
            await api.post(`/owner-followups/${followup.followup_id}/verbal-warning`, {
                method: verbal.method, tier: verbal.tier, notes: verbal.notes.trim(),
                report_id: verbal.report_id ? Number(verbal.report_id) : null,
            });
            toast.success('Verbal warning logged', 'Saved as a contact entry on this observation.');
            setVerbal((v) => ({ ...v, notes: '' }));
            await load(followup);
        } catch (e) {
            toast.error('Not logged', errorText(e, 'Please try again.'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <section className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-4" aria-label="Repeat incidents">
            {candidates.length > 0 && (
                <div className="rounded-xl border border-amber-300 bg-white p-3" role="status">
                    <p className="text-xs font-black text-amber-900">
                        ⚠ {candidates.length} other report{candidates.length === 1 ? '' : 's'} about the pet under observation
                    </p>
                    <ul className="mt-2 space-y-2">
                        {candidates.map((c) => (
                            <li key={c.report_id} className="text-xs text-gray-700">
                                <div className="flex flex-wrap items-center gap-2">
                                    <Link to={reportPath(c.report_id)} className="font-black text-orange-700 hover:underline">Report #{c.report_id}</Link>
                                    <span className="font-semibold text-gray-500">{fmt(c.created_at)}{c.landmark ? ` · ${c.landmark}` : ''}</span>
                                    {canLog && logging !== c.report_id && (
                                        <button type="button" onClick={() => { setLogging(c.report_id); setNotes(''); }}
                                            className="rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-800 hover:bg-amber-100">
                                            Log as repeat incident
                                        </button>
                                    )}
                                </div>
                                {c.description && <p className="mt-0.5 text-[11px] text-gray-500">{c.description}</p>}
                                {logging === c.report_id && (
                                    <div className="mt-2 space-y-2">
                                        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} className={inputCls}
                                            placeholder="What happened in this repeat incident (at least 10 characters)" aria-label="Repeat incident notes" />
                                        <div className="flex gap-2">
                                            <button type="button" disabled={busy || notes.trim().length < 10} onClick={() => logRepeat(c.report_id)}
                                                className="action-primary rounded-lg px-3 py-1.5 text-[11px] font-black disabled:opacity-40">Log repeat</button>
                                            <button type="button" onClick={() => setLogging(null)} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-bold text-gray-600">Cancel</button>
                                        </div>
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {incidents.length > 0 && (
                <div className="space-y-2">
                    <p className="text-[11px] font-black uppercase tracking-wider text-amber-900">Incidents and warnings</p>
                    {incidents.map((i) => (
                        <div key={i.report_id} className="rounded-xl border border-amber-100 bg-white p-3 text-xs">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${i.kind === 'observed' ? 'bg-amber-500 text-white' : 'bg-orange-100 text-orange-800'}`}>
                                    {i.kind === 'observed' ? 'Observed incident' : 'Repeat incident'}
                                </span>
                                <Link to={reportPath(i.report_id)} className="font-black text-gray-800 hover:underline">Report #{i.report_id}</Link>
                                <span className="font-semibold text-gray-500">{fmt(i.incident_date)}</span>
                            </div>
                            <p className="mt-1 font-semibold text-gray-600">
                                {i.warnings.length
                                    ? i.warnings.map((w) => `${w.warning_level} (${w.violation_type}, ${w.status})`).join(' · ')
                                    : 'No warning for this incident yet.'}
                            </p>
                            <p className="mt-0.5 text-[11px] text-gray-500">
                                Suggested next: {i.prefill.suggested_tier}{i.prefill.comply_by ? ` · comply by ${fmt(i.prefill.comply_by)}` : ''}.
                                {followup.owner_id && i.kind === 'repeat' ? ' Open the report to issue its warning (the form is prefilled).' : ''}
                            </p>
                        </div>
                    ))}
                </div>
            )}

            {canLog && !followup.owner_id && (
                <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-3">
                    <p className="text-xs font-black text-gray-800">Log a verbal warning (owner has no account)</p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <select className={inputCls} value={verbal.method} onChange={(e) => setVerbal({ ...verbal, method: e.target.value })} aria-label="How the owner was warned">
                            <option value="phone">Phone call</option>
                            <option value="in_person">In person</option>
                        </select>
                        <select className={inputCls} value={verbal.tier} onChange={(e) => setVerbal({ ...verbal, tier: e.target.value })} aria-label="Warning tier">
                            {TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <select className={inputCls} value={verbal.report_id} onChange={(e) => setVerbal({ ...verbal, report_id: e.target.value })} aria-label="Incident">
                            {incidents.map((i) => <option key={i.report_id} value={i.kind === 'observed' ? '' : String(i.report_id)}>Report #{i.report_id} ({i.kind})</option>)}
                        </select>
                    </div>
                    <textarea rows={2} value={verbal.notes} onChange={(e) => setVerbal({ ...verbal, notes: e.target.value })} maxLength={2000} className={inputCls}
                        placeholder="What you told the owner (at least 10 characters)" aria-label="Verbal warning notes" />
                    <button type="button" disabled={busy || verbal.notes.trim().length < 10} onClick={logVerbal}
                        className="action-primary w-full rounded-xl py-2 text-xs font-black disabled:opacity-40">Log verbal warning</button>
                </div>
            )}
        </section>
    );
};

export default RepeatedReportBanner;
