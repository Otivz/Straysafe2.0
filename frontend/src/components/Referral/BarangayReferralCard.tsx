import { useCallback, useEffect, useState } from 'react';
import { Building2, FileText, Paperclip } from 'lucide-react';
import api from '../../utils/api';
import { uploadDirectToCloudinary } from '../../utils/cloudinaryUpload';

/**
 * Barangay Referral card (Subdivision-only, docs/01-system/BARANGAY_REFERRAL_LOG.md).
 * The Barangay is external: everything here is what the Barangay reported, recorded by a leader.
 * Nothing here marks the animal as held in StraySafe.
 */

export interface ReferralUpdate {
    update_id: number;
    update_type: string;
    source: string;
    source_label: string;
    update_date: string;
    note?: string | null;
    evidence_url?: string | null;
    recorded_by_name?: string | null;
    recorded_at: string;
}

export interface Referral {
    referral_id: number;
    report_id: number;
    barangay_name?: string | null;
    referred_by_name?: string | null;
    referred_at: string;
    reason: string;
    reference_no?: string | null;
    contact_method: string;
    final_outcome?: string | null;
    outcome_date?: string | null;
    outcome_note?: string | null;
    outcome_recorded_by_name?: string | null;
    report_status_id?: number | null;
    updates: ReferralUpdate[];
}

export const CONTACT_METHOD_LABELS: Record<string, string> = {
    call: 'Phone call', visit: 'Visit', message: 'Message', letter: 'Letter', other: 'Other',
};
export const UPDATE_TYPE_LABELS: Record<string, string> = {
    acknowledged: 'Acknowledged', dispatched: 'Team dispatched', picked_up: 'Animal picked up', held: 'Held by the Barangay',
    impounded: 'Impounded', claimed: 'Claimed by owner', adopted: 'Adopted', not_found: 'Animal not found', other: 'Other',
};
export const OUTCOME_LABELS: Record<string, string> = {
    claimed: 'Claimed by the owner', released: 'Released', resolved: 'Resolved', deceased: 'Deceased',
    not_found: 'Animal could not be found',
};

const todayIso = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const formatDate = (value?: string | null) => {
    if (!value) return '';
    const d = new Date(value.length === 10 ? `${value}T00:00:00` : value);
    return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};
const errorText = (err: any, fallback: string) => {
    const d = err?.response?.data?.detail;
    if (typeof d === 'string') return d;
    if (Array.isArray(d) && d[0]?.msg) return String(d[0].msg).replace(/^Value error, /, '');
    return err?.message || fallback;
};

const inputCls = 'w-full px-3 py-2 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-role-muted focus:border-role';
const labelCls = 'text-[9px] font-black text-gray-700 dark:text-slate-300 uppercase tracking-widest';

interface Props {
    reportId: number;
    /** The report's current status: the outcome can only be recorded while it is 4 (Referred to Barangay). */
    reportStatusId?: number | null;
    /** Leader of the report's subdivision, or the Administrator. Others see it read-only. */
    canEdit: boolean;
    /** Called after any change so the page can reload the report. */
    onChanged?: () => void;
}

export default function BarangayReferralCard({ reportId, reportStatusId, canEdit, onChanged }: Props) {
    const [referral, setReferral] = useState<Referral | null>(null);
    const [loaded, setLoaded] = useState(false);
    const [loadError, setLoadError] = useState('');
    const [mode, setMode] = useState<'none' | 'update' | 'outcome' | 'create'>('none');
    const [busy, setBusy] = useState(false);
    const [formError, setFormError] = useState('');

    const [updateType, setUpdateType] = useState('acknowledged');
    const [updateDate, setUpdateDate] = useState(todayIso());
    const [note, setNote] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [outcome, setOutcome] = useState('resolved');
    const [reason, setReason] = useState('');
    const [contactMethod, setContactMethod] = useState('call');
    const [referenceNo, setReferenceNo] = useState('');

    const load = useCallback(async () => {
        try {
            const res = await api.get(`/reports/${reportId}/referral`);
            setReferral(res.data);
            setLoadError('');
        } catch (err: any) {
            if (err?.response?.status === 404) setReferral(null);
            else setLoadError(errorText(err, 'Could not load the referral.'));
        } finally {
            setLoaded(true);
        }
    }, [reportId]);

    useEffect(() => { load(); }, [load]);

    const open = (next: typeof mode) => {
        setFormError('');
        setNote('');
        setFile(null);
        setUpdateDate(todayIso());
        setMode(next);
    };

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setFormError('');
        try {
            if (mode === 'create') {
                await api.post(`/reports/${reportId}/referral`, { reason: reason.trim(), contact_method: contactMethod, reference_no: referenceNo.trim() || null });
            } else if (mode === 'update' && referral) {
                let evidence_url: string | null = null;
                if (file) evidence_url = (await uploadDirectToCloudinary(file, 'barangay_referrals')).url;
                await api.post(`/referrals/${referral.referral_id}/updates`, {
                    update_type: updateType, update_date: updateDate, source: 'barangay_reported', note: note.trim() || null, evidence_url,
                });
            } else if (mode === 'outcome' && referral) {
                await api.post(`/referrals/${referral.referral_id}/outcome`, { final_outcome: outcome, outcome_date: updateDate, note: note.trim() || null });
            }
            setMode('none');
            await load();
            onChanged?.();
        } catch (err: any) {
            setFormError(errorText(err, 'Saving failed. Please try again.'));
        } finally {
            setBusy(false);
        }
    };

    if (!loaded) {
        return <div className="w-full p-4 rounded-2xl border border-indigo-100 bg-indigo-50/40 text-[11px] text-indigo-700 font-semibold">Loading Barangay referral…</div>;
    }

    const closed = Boolean(referral?.final_outcome);
    const canRecordOutcome = canEdit && referral && !closed && (reportStatusId ?? referral.report_status_id) === 4;

    return (
        <div className="w-full p-4 bg-gradient-to-br from-indigo-50/90 via-purple-50/40 to-white dark:from-indigo-950/40 dark:via-slate-900 dark:to-slate-900 border border-indigo-200/80 dark:border-indigo-800 rounded-2xl shadow-2xs flex flex-col gap-3">
            <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                    <Building2 className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-black uppercase tracking-wider text-indigo-900 dark:text-indigo-200">Barangay Referral</span>
                        <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-700">
                            {referral ? (closed ? 'Outcome recorded' : 'Waiting for Barangay updates') : 'No referral record'}
                        </span>
                    </div>
                    <p className="text-[10px] text-indigo-700 dark:text-indigo-300 mt-0.5 leading-normal font-medium">
                        The Barangay is contacted outside StraySafe. Updates below are what the Barangay reported, recorded by a Subdivision Leader.
                    </p>
                </div>
            </div>

            {loadError && <p role="alert" className="text-[11px] font-semibold text-rose-700">{loadError}</p>}

            {referral ? (
                <>
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
                        <dt className="text-gray-500 dark:text-slate-400 font-semibold">Barangay</dt>
                        <dd className="font-bold text-gray-900 dark:text-slate-100">{referral.barangay_name || '—'}</dd>
                        <dt className="text-gray-500 dark:text-slate-400 font-semibold">Referred</dt>
                        <dd className="font-bold text-gray-900 dark:text-slate-100">{formatDate(referral.referred_at)}{referral.referred_by_name ? ` by ${referral.referred_by_name}` : ''}</dd>
                        <dt className="text-gray-500 dark:text-slate-400 font-semibold">Contact</dt>
                        <dd className="font-bold text-gray-900 dark:text-slate-100">{CONTACT_METHOD_LABELS[referral.contact_method] || referral.contact_method}</dd>
                        {referral.reference_no && (<>
                            <dt className="text-gray-500 dark:text-slate-400 font-semibold">Reference no.</dt>
                            <dd className="font-bold text-gray-900 dark:text-slate-100 break-all">{referral.reference_no}</dd>
                        </>)}
                    </dl>
                    <p className="text-[11px] text-gray-700 dark:text-slate-300 leading-relaxed"><span className="font-bold">Reason:</span> {referral.reason}</p>

                    <div>
                        <p className={labelCls}>Barangay updates</p>
                        {referral.updates.length === 0 ? (
                            <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-1">No updates recorded yet.</p>
                        ) : (
                            <ol className="mt-1.5 space-y-2 border-l-2 border-indigo-200 dark:border-indigo-800 pl-3">
                                {referral.updates.map((u) => (
                                    <li key={u.update_id} className="text-[11px]">
                                        <p className="font-black text-gray-900 dark:text-slate-100">{UPDATE_TYPE_LABELS[u.update_type] || u.update_type}
                                            <span className="font-semibold text-gray-500 dark:text-slate-400"> · {formatDate(u.update_date)}</span></p>
                                        {u.note && <p className="text-gray-700 dark:text-slate-300 leading-snug">{u.note}</p>}
                                        <p className="text-[10px] text-indigo-700 dark:text-indigo-300 font-semibold">{u.source_label}{u.recorded_by_name ? `, recorded by ${u.recorded_by_name}` : ''}</p>
                                        {u.evidence_url && (
                                            <a href={u.evidence_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] font-bold text-role hover:underline">
                                                <Paperclip className="w-3 h-3" /> View evidence
                                            </a>
                                        )}
                                    </li>
                                ))}
                            </ol>
                        )}
                    </div>

                    {closed && (
                        <div className="p-3 rounded-xl bg-white/80 dark:bg-slate-900 border border-indigo-100 dark:border-indigo-800 text-[11px]">
                            <p className="font-black text-indigo-900 dark:text-indigo-200">Outcome: {OUTCOME_LABELS[referral.final_outcome!] || referral.final_outcome}</p>
                            <p className="text-gray-600 dark:text-slate-400">Reported by Barangay on {formatDate(referral.outcome_date)}{referral.outcome_recorded_by_name ? `, recorded by ${referral.outcome_recorded_by_name}` : ''}.</p>
                            {referral.outcome_note && <p className="text-gray-700 dark:text-slate-300 mt-0.5">{referral.outcome_note}</p>}
                        </div>
                    )}

                    {canEdit && !closed && mode === 'none' && (
                        <div className="flex flex-col sm:flex-row gap-2">
                            <button type="button" onClick={() => open('update')} className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer">
                                Record Barangay update
                            </button>
                            {canRecordOutcome && (
                                <button type="button" onClick={() => open('outcome')} className="flex-1 py-2.5 bg-white dark:bg-slate-900 border border-indigo-300 dark:border-indigo-700 text-indigo-800 dark:text-indigo-200 hover:bg-indigo-50 dark:hover:bg-indigo-950 rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer">
                                    Record outcome
                                </button>
                            )}
                        </div>
                    )}
                </>
            ) : (
                canEdit && mode === 'none' && (reportStatusId === 4) && (
                    <button type="button" onClick={() => { setReason(''); setReferenceNo(''); open('create'); }} className="py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer inline-flex items-center justify-center gap-1.5">
                        <FileText className="w-3.5 h-3.5" /> Create referral record
                    </button>
                )
            )}

            {mode !== 'none' && (
                <form onSubmit={submit} className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 flex flex-col gap-2.5">
                    <p className="text-[11px] font-black text-indigo-900 dark:text-indigo-200 uppercase tracking-wider">
                        {mode === 'update' ? 'Record what the Barangay reported' : mode === 'outcome' ? 'Record the final outcome' : 'Create referral record'}
                    </p>
                    {mode === 'create' && (<>
                        <label className="flex flex-col gap-1"><span className={labelCls}>Reason</span>
                            <textarea required minLength={3} rows={2} className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why the Barangay is needed" /></label>
                        <div className="grid grid-cols-2 gap-2">
                            <label className="flex flex-col gap-1"><span className={labelCls}>Contacted by</span>
                                <select className={inputCls} value={contactMethod} onChange={(e) => setContactMethod(e.target.value)}>
                                    {Object.entries(CONTACT_METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                </select></label>
                            <label className="flex flex-col gap-1"><span className={labelCls}>Reference no. (optional)</span>
                                <input className={inputCls} maxLength={100} value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} /></label>
                        </div>
                    </>)}
                    {mode === 'update' && (
                        <label className="flex flex-col gap-1"><span className={labelCls}>What the Barangay reported</span>
                            <select className={inputCls} value={updateType} onChange={(e) => setUpdateType(e.target.value)}>
                                {Object.entries(UPDATE_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select></label>
                    )}
                    {mode === 'outcome' && (
                        <label className="flex flex-col gap-1"><span className={labelCls}>Outcome (closes the case)</span>
                            <select className={inputCls} value={outcome} onChange={(e) => setOutcome(e.target.value)}>
                                {Object.entries(OUTCOME_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select></label>
                    )}
                    {mode !== 'create' && (<>
                        <label className="flex flex-col gap-1"><span className={labelCls}>Date the Barangay reported it</span>
                            <input type="date" required max={todayIso()} className={inputCls} value={updateDate} onChange={(e) => setUpdateDate(e.target.value)} /></label>
                        <label className="flex flex-col gap-1"><span className={labelCls}>Note (optional)</span>
                            <textarea rows={2} maxLength={2000} className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} /></label>
                    </>)}
                    {mode === 'update' && (
                        <label className="flex flex-col gap-1"><span className={labelCls}>Evidence (optional photo or document)</span>
                            <input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp" className="text-[11px]" onChange={(e) => setFile(e.target.files?.[0] || null)} /></label>
                    )}
                    {mode === 'outcome' && (
                        <p className="text-[10px] text-amber-800 dark:text-amber-300 font-semibold">This closes the case and cannot be changed afterwards.</p>
                    )}
                    {formError && <p role="alert" className="text-[11px] font-semibold text-rose-700">{formError}</p>}
                    <div className="flex gap-2">
                        <button type="button" disabled={busy} onClick={() => setMode('none')} className="flex-1 py-2 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 text-gray-700 dark:text-slate-200 rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer">Cancel</button>
                        <button type="submit" disabled={busy} className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer">{busy ? 'Saving…' : 'Save'}</button>
                    </div>
                </form>
            )}
        </div>
    );
}
