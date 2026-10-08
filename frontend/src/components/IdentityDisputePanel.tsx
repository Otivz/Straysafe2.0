import { useState } from 'react';
import { api } from '../utils/api';
import MediaLightbox, { type LightboxItem } from './MediaLightbox';

// Staff review of an owner's "this sighting isn't my pet" dispute: the evidence side by side, then Uphold or Reverse.
export default function IdentityDisputePanel({ report, canDecide = true, onChanged }: {
    report: any;
    canDecide?: boolean;
    onChanged?: () => void;
}) {
    const info = report?.identity_dispute;
    const [decision, setDecision] = useState<'uphold' | 'reverse' | null>(null);
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [lightbox, setLightbox] = useState<{ items: LightboxItem[]; title: string } | null>(null);
    if (!info) return null;

    const fmt = (v?: string) => (v ? new Date(v).toLocaleString() : '');
    const pending = info.status === 'Pending';
    const column = (title: string, urls: string[]) => (
        <div className="space-y-1.5 min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">{title}</p>
            {urls.length ? (
                <button
                    type="button"
                    onClick={() => setLightbox({ items: urls.map((u, i) => ({ url: u, caption: `Photo ${i + 1}` })), title })}
                    className="relative w-full h-36 rounded-xl overflow-hidden border border-gray-200 bg-gray-100 cursor-zoom-in"
                    title="View full screen"
                >
                    <img src={urls[0]} alt="" className="w-full h-full object-cover" />
                    <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/60 text-white text-[10px] font-bold">
                        ⤢{urls.length > 1 ? ` ${urls.length}` : ''}
                    </span>
                </button>
            ) : (
                <div className="w-full h-36 rounded-xl border border-dashed border-gray-200 bg-gray-50 flex items-center justify-center text-[11px] text-gray-400">No photo</div>
            )}
        </div>
    );

    const submit = async () => {
        if (!decision) return;
        setBusy(true);
        setError('');
        try {
            await api.post(`/reports/${report.report_id}/identity-dispute/${info.dispute_id}/decide`, { decision, reason: reason.trim() });
            setDecision(null);
            setReason('');
            onChanged?.();
        } catch (e: any) {
            setError(e.response?.data?.detail || 'Could not save the decision.');
        } finally {
            setBusy(false);
        }
    };

    const tone = pending ? 'bg-amber-50 border-amber-300' : info.status === 'Reversed' ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200';
    const statusLabel = pending ? 'Identity Disputed – Under Review' : info.status === 'Reversed' ? 'Reviewed – Incorrect Sighting Removed' : 'Reviewed – Merge Upheld';

    return (
        <div className={`rounded-2xl border p-4 sm:p-5 space-y-4 ${tone}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-xs font-black uppercase tracking-tight text-gray-900">⚖️ {statusLabel}</h4>
                <span className="text-[11px] text-gray-600">Filed by {info.filed_by_name || 'the owner'} · {fmt(info.filed_at)}</span>
            </div>

            <div className="text-xs text-gray-800 space-y-1">
                <p><strong>Owner's reason:</strong> {info.reason}</p>
                <p>
                    <strong>Disputed identity:</strong> {info.pet_name || 'registered pet'}, inherited from Case #{info.case_report_id}
                    {info.original_confirmation && (
                        <> (confirmed on Report #{info.original_report_id} by {info.original_confirmation.confirmed_by || 'staff'}
                            {info.original_confirmation.owner_confirmed ? ' and the owner' : ''} on {fmt(info.original_confirmation.confirmed_at)})</>
                    )}
                </p>
                <p>
                    <strong>Merged</strong> by {info.merge?.merged_by_name || 'staff'} on {fmt(info.merge?.merged_at)}
                    {info.merge?.notes ? <>: <em>"{info.merge.notes}"</em></> : ' (no reason recorded)'}
                </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {column(`This report (#${report.report_id})`, info.this_report_photos || [])}
                {column(`Original report (#${info.original_report_id ?? '?'})`, info.original_report_photos || [])}
                {column(`Registered pet: ${info.pet_name || ''}`, info.pet_photos || [])}
            </div>

            {!pending && (
                <div className="text-xs text-gray-800">
                    <strong>Decision</strong> by {info.decided_by_name || 'staff'} on {fmt(info.decided_at)}: {info.decision_notes}
                </div>
            )}

            {pending && canDecide && (
                <div className="space-y-2 border-t border-amber-200 pt-3">
                    <p className="text-xs font-bold text-gray-800">Your decision (a reason is required):</p>
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => setDecision('uphold')}
                            className={`px-3 py-2 rounded-xl text-xs font-black border cursor-pointer ${decision === 'uphold' ? 'bg-slate-800 text-white border-slate-900' : 'bg-white border-slate-300 text-slate-800'}`}
                        >
                            Uphold merge: it is {info.pet_name || 'the pet'}
                        </button>
                        <button
                            type="button"
                            onClick={() => setDecision('reverse')}
                            className={`px-3 py-2 rounded-xl text-xs font-black border cursor-pointer ${decision === 'reverse' ? 'bg-rose-600 text-white border-rose-700' : 'bg-white border-rose-300 text-rose-700'}`}
                        >
                            Reverse: different animal, remove from case
                        </button>
                    </div>
                    {decision && (
                        <>
                            <textarea
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                rows={3}
                                maxLength={1000}
                                placeholder={decision === 'uphold'
                                    ? 'Evidence that this is the same animal (e.g. same scar and collar, seen in person).'
                                    : 'Why this is a different animal (e.g. different ear markings).'}
                                className="w-full p-2.5 rounded-xl border border-gray-300 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-amber-200"
                            />
                            {error && <p className="text-xs font-semibold text-rose-700">{error}</p>}
                            <div className="flex justify-end gap-2">
                                <button type="button" onClick={() => { setDecision(null); setError(''); }} className="px-3 py-2 rounded-xl border border-gray-300 bg-white text-xs font-bold cursor-pointer">
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    disabled={busy || reason.trim().length < 10}
                                    onClick={submit}
                                    className="px-3 py-2 rounded-xl bg-gray-900 hover:bg-black text-white text-xs font-black cursor-pointer disabled:opacity-50"
                                >
                                    {busy ? 'Saving…' : decision === 'uphold' ? 'Confirm: uphold the merge' : 'Confirm: remove from the case'}
                                </button>
                            </div>
                            <p className="text-[10px] text-gray-500">
                                Recorded in the report history and audit log. The owner is notified of the outcome. Reversing uses Unmerge:
                                the original confirmation and the other reports in the case are not affected.
                            </p>
                        </>
                    )}
                </div>
            )}
            {pending && !canDecide && (
                <p className="text-[11px] text-gray-600">👁 The officer handling the case decides this dispute.</p>
            )}

            {lightbox && <MediaLightbox items={lightbox.items} title={lightbox.title} onClose={() => setLightbox(null)} />}
        </div>
    );
}
