import { useState } from 'react';
import api from '../utils/api';

// Phase 7 (docs/01-system/CLAIM_ELIGIBILITY_RULES.md): a pet claim is for an animal someone holds. When nobody does,
// this explains why, lets the owner answer Home / Still missing, and lets staff close the claim as Not Needed.
// The server refuses the same actions; this only shows what applies.

export interface ClaimCustody {
    held: boolean;
    holder: string | null;
    reason: string;
    adopted: boolean;
    returned: boolean;
    not_needed: boolean;
}

export interface ClaimWithCustody {
    claim_id: number;
    status: string;
    custody?: ClaimCustody | null;
    owner_whereabouts?: string | null;
    owner_whereabouts_note?: string | null;
    owner_whereabouts_at?: string | null;
    closed_reason?: string | null;
    closed_at?: string | null;
}

const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
const ANSWER: Record<string, string> = { home: 'My pet is home', still_missing: 'My pet is still missing' };
const errorText = (e: unknown, fallback: string) => {
    const d = (e as { response?: { data?: { detail?: unknown } } } | null)?.response?.data?.detail;
    return typeof d === 'string' ? d : fallback;
};

const ClaimNotNeededPanel = ({ claim, viewer, onChanged }: {
    claim: ClaimWithCustody | null | undefined;
    viewer: 'owner' | 'staff';
    onChanged: (updated: ClaimWithCustody) => void;
}) => {
    const [note, setNote] = useState('');
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!claim) return null;
    const closed = claim.status === 'Not Needed';
    if (!closed && !claim.custody?.not_needed) return null;

    const run = async (fn: () => Promise<{ data: ClaimWithCustody }>) => {
        setBusy(true);
        setError(null);
        try {
            const r = await fn();
            onChanged(r.data);
            setNote('');
            setReason('');
        } catch (e) {
            setError(errorText(e, 'Please try again.'));
        } finally {
            setBusy(false);
        }
    };

    if (closed) {
        return (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs" role="status">
                <p className="font-black text-slate-800">Claim closed: not needed</p>
                <p className="mt-0.5 font-semibold text-slate-600">{claim.closed_reason}{claim.closed_at ? ` (${fmt(claim.closed_at)})` : ''}</p>
            </div>
        );
    }

    return (
        <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50/70 p-3 text-xs" role="status">
            <p className="font-black text-amber-900">This claim isn't needed right now</p>
            <p className="font-semibold text-amber-800">{claim.custody?.reason}</p>
            {claim.owner_whereabouts && (
                <p className="rounded-lg bg-white px-2.5 py-1.5 font-bold text-gray-700">
                    Owner's latest answer: {ANSWER[claim.owner_whereabouts] || claim.owner_whereabouts}
                    {claim.owner_whereabouts_note ? ` — "${claim.owner_whereabouts_note}"` : ''}
                    {claim.owner_whereabouts_at ? ` · ${fmt(claim.owner_whereabouts_at)}` : ''}
                </p>
            )}

            {viewer === 'owner' ? (
                <>
                    <p className="font-semibold text-gray-600">Let your Subdivision Leader know where your pet is now:</p>
                    <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000}
                        placeholder="Optional note, e.g. he came back last night"
                        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 focus:border-orange-300 focus:outline-none" aria-label="Optional note" />
                    <div className="flex flex-col gap-2 sm:flex-row">
                        <button type="button" disabled={busy} onClick={() => run(() => api.post(`/claims/${claim.claim_id}/whereabouts`, { answer: 'home', note: note.trim() || null }))}
                            className="flex-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white hover:bg-emerald-700 disabled:opacity-50">My pet is home</button>
                        <button type="button" disabled={busy} onClick={() => run(() => api.post(`/claims/${claim.claim_id}/whereabouts`, { answer: 'still_missing', note: note.trim() || null }))}
                            className="flex-1 rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-black text-amber-800 hover:bg-amber-50 disabled:opacity-50">Still missing</button>
                    </div>
                </>
            ) : (
                <>
                    <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000}
                        placeholder="Why the claim isn't needed (at least 10 characters), e.g. the owner says the dog is home"
                        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 focus:border-orange-300 focus:outline-none" aria-label="Reason to close the claim" />
                    <button type="button" disabled={busy || reason.trim().length < 10}
                        onClick={() => run(() => api.post(`/claims/${claim.claim_id}/close-not-needed`, { reason: reason.trim() }))}
                        className="action-primary w-full rounded-xl py-2 text-xs font-black disabled:opacity-40">
                        Close claim as not needed
                    </button>
                    {claim.status === 'Approved' && (
                        <p className="text-[11px] font-semibold text-gray-500">
                            This claim was approved. Closing it also undoes the approval's "Claimed by Owner" status, unless the animal was already returned.
                        </p>
                    )}
                </>
            )}
            {error && <p className="font-bold text-red-700" role="alert">{error}</p>}
        </div>
    );
};

export default ClaimNotNeededPanel;
