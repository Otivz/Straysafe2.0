// The handling Subdivision Leader confirms a pet match when the owner did not answer within 24 hours or said no
// (Phase 5C of docs/06-future-proposals/SUBDIVISION_OWNER_FOLLOW_UP_PLAN.md). A person verifies, never the AI.
import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { api } from '../utils/api';
import { followUpError } from '../utils/ownerFollowUp';

const WAIT_MS = 24 * 60 * 60 * 1000;
const METHOD = 'Photos and markings match';

interface Props {
    match: {
        match_id: number;
        owner_confirmation_status?: string;
        verified_at?: string | null;
        owner_verification_requested_at?: string | null;
        created_at?: string | null;
    };
    onConfirmed: (updated: unknown) => void;
}

export default function LeaderIdentityConfirm({ match, onConfirmed }: Props) {
    const [open, setOpen] = useState(false);
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [now] = useState(() => Date.now());   // when the pop-up opened

    const ownerSaidNo = match.owner_confirmation_status === 'OWNER_REJECTED';
    const askedAt = Math.max(...[match.verified_at, match.owner_verification_requested_at, match.created_at]
        .filter(Boolean).map(t => new Date(t as string).getTime()));
    const readyAt = Number.isFinite(askedAt) ? askedAt + WAIT_MS : 0;
    const waiting = !ownerSaidNo && now < readyAt;

    const submit = async () => {
        setBusy(true);
        setError('');
        try {
            const res = await api.post(`/matches/${match.match_id}/leader-verify-identity`, { method: METHOD, reason: reason.trim() });
            setOpen(false);
            setReason('');
            onConfirmed(res.data);
        } catch (err) {
            setError(followUpError(err, 'The identity could not be confirmed. Try again.'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="px-4 py-3 rounded-xl bg-indigo-50 border border-indigo-200 text-xs text-indigo-900 space-y-2">
            <p>
                <strong>{ownerSaidNo ? 'The owner said this is not their pet.' : 'The owner has not confirmed yet.'}</strong>{' '}
                {waiting
                    ? `If there is still no answer by ${new Date(readyAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}, you can confirm the identity yourself from the photos and markings.`
                    : 'As the leader handling this report, you can confirm the identity yourself from the photos and markings. The owner is told and can dispute it.'}
            </p>
            {!waiting && !open && (
                <button type="button" onClick={() => { setOpen(true); setError(''); }}
                    className="px-3 py-1.5 rounded-lg border border-indigo-300 bg-white hover:bg-indigo-100 text-indigo-800 font-bold cursor-pointer inline-flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" /> Confirm identity
                </button>
            )}
            {open && (
                <div className="space-y-2">
                    <p className="font-bold">Method: {METHOD}</p>
                    <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} maxLength={1000} aria-label="What matched"
                        placeholder="What matched? e.g. Same white blaze on the chest and torn left ear as the record photos"
                        className="w-full p-2.5 rounded-lg border border-indigo-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                    {error && <p className="text-rose-700 font-semibold">{error}</p>}
                    <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => { setOpen(false); setReason(''); setError(''); }}
                            className="px-3 py-1.5 rounded-lg border border-indigo-200 bg-white text-indigo-800 font-bold cursor-pointer">
                            Cancel
                        </button>
                        <button type="button" disabled={busy || reason.trim().length < 10} onClick={submit}
                            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold cursor-pointer disabled:opacity-50">
                            {busy ? 'Confirming...' : 'Confirm and link to the pet'}
                        </button>
                    </div>
                    <p className="text-[10px] text-indigo-700">Recorded on the match, in the report history and in the audit log.</p>
                </div>
            )}
        </div>
    );
}
