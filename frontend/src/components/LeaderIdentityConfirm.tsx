import { useCallback, useEffect, useState } from 'react';
import api from '../utils/api';
import { useToast } from '../context/ToastContext';

// Phase 6 leader identity verification (docs/01-system/OWNER_WARNING_RULES.md). For a staff-confirmed match to an
// owned pet where the owner rejected it or didn't answer within 24 hours, the handling leader may verify the identity
// with a documented method and reason. It is not the owner's confirmation or handover proof; the owner may dispute it.

interface MatchOption {
    match_id: number;
    pet_name: string | null;
    owner_confirmation_status: string;
    eligible: boolean;
    trigger: string | null;
    blocked_reason: string | null;
    verification: { method: string; reason: string; trigger: string; leader_name: string | null; created_at: string | null } | null;
}

const TRIGGER: Record<string, string> = { OWNER_REJECTED: 'The owner rejected this match.', NO_RESPONSE_24H: 'The owner did not answer within 24 hours.' };
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');
const errorText = (e: unknown) => {
    const d = (e as { response?: { data?: { detail?: unknown } } } | null)?.response?.data?.detail;
    return typeof d === 'string' ? d : 'The verification was not saved.';
};

const LeaderIdentityConfirm = ({ reportId, onVerified }: { reportId: number; onVerified?: () => void }) => {
    const toast = useToast();
    const [options, setOptions] = useState<MatchOption[]>([]);
    const [methods, setMethods] = useState<string[]>([]);
    const [open, setOpen] = useState<number | null>(null);
    const [method, setMethod] = useState('');
    const [reason, setReason] = useState('');
    const [confirming, setConfirming] = useState(false);
    const [busy, setBusy] = useState(false);

    const apply = (data: { matches?: MatchOption[]; methods?: string[] }) => {
        // Only matches waiting on the owner (or already leader-verified) are relevant here
        setOptions((data.matches || []).filter((m) => m.verification || m.owner_confirmation_status !== 'OWNER_CONFIRMED'));
        setMethods(data.methods || []);
    };
    const load = useCallback(async () => {
        try { apply((await api.get(`/leader-identity/reports/${reportId}`)).data); } catch { setOptions([]); }
    }, [reportId]);

    useEffect(() => {
        let cancelled = false;
        api.get(`/leader-identity/reports/${reportId}`)
            .then((r) => { if (!cancelled) apply(r.data); })
            .catch(() => { if (!cancelled) setOptions([]); });
        return () => { cancelled = true; };
    }, [reportId]);

    if (options.length === 0) return null;

    const submit = async (m: MatchOption) => {
        setBusy(true);
        try {
            const r = await api.post(`/leader-identity/matches/${m.match_id}`, { method, reason: reason.trim() });
            toast.success('Identity verified', r.data?.message);
            setOpen(null);
            setReason('');
            setConfirming(false);
            await load();
            onVerified?.();
        } catch (e) {
            toast.error('Not verified', errorText(e));
            setConfirming(false);
        } finally {
            setBusy(false);
        }
    };

    return (
        <section className="space-y-2 rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4" aria-label="Leader identity verification">
            <p className="text-xs font-black text-indigo-900">Owner hasn't confirmed the pet match</p>
            {options.map((m) => (
                <div key={m.match_id} className="space-y-2 rounded-xl border border-indigo-100 bg-white p-3 text-xs">
                    <p className="font-black text-gray-800">{m.pet_name || 'Registered pet'} · Match #{m.match_id}</p>
                    {m.verification ? (
                        <p className="font-semibold text-gray-600">
                            Verified by {m.verification.leader_name || 'the handling leader'} on {fmt(m.verification.created_at)} ({m.verification.method}).
                            {' '}{TRIGGER[m.verification.trigger]} {m.verification.reason}
                        </p>
                    ) : m.eligible ? (
                        open === m.match_id ? (
                            <div className="space-y-2">
                                <p className="font-semibold text-gray-600">
                                    {TRIGGER[m.trigger || '']} As the handling leader you may verify the identity yourself. This links the report to the
                                    pet; it is not the owner's confirmation or ownership proof, and the owner will be told and can dispute it.
                                </p>
                                <select value={method} onChange={(e) => { setMethod(e.target.value); setConfirming(false); }} aria-label="How you verified it"
                                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold">
                                    <option value="">How did you verify it?</option>
                                    {methods.map((x) => <option key={x} value={x}>{x}</option>)}
                                </select>
                                <textarea rows={2} value={reason} onChange={(e) => { setReason(e.target.value); setConfirming(false); }} maxLength={2000}
                                    placeholder="What you checked and found (at least 15 characters)" aria-label="Reason"
                                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold" />
                                {!confirming ? (
                                    <button type="button" disabled={!method || reason.trim().length < 15} onClick={() => setConfirming(true)}
                                        className="action-primary w-full rounded-xl py-2 text-xs font-black disabled:opacity-40">Review verification</button>
                                ) : (
                                    <div className="flex gap-2">
                                        <button type="button" disabled={busy} onClick={() => submit(m)}
                                            className="action-primary flex-1 rounded-xl py-2 text-xs font-black disabled:opacity-50">{busy ? 'Saving…' : 'Yes, verify identity'}</button>
                                        <button type="button" onClick={() => setConfirming(false)} className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-bold text-gray-600">Back</button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <button type="button" onClick={() => { setOpen(m.match_id); setMethod(''); setReason(''); setConfirming(false); }}
                                className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-[11px] font-bold text-indigo-800 hover:bg-indigo-100">
                                Verify identity as handling leader
                            </button>
                        )
                    ) : (
                        <p className="font-semibold text-gray-500">{m.blocked_reason}</p>
                    )}
                </div>
            ))}
        </section>
    );
};

export default LeaderIdentityConfirm;
