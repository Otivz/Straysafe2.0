import { useState } from 'react';
import { api } from '../utils/api';

const ANSWER_LABEL: Record<string, string> = { YES: "Yes, it's my pet", NO: "No, it's not my pet", UNSURE: 'Not sure' };

// Staff side (review window): ask the owner to help identify an uncertain sighting. The answer is evidence only.
export function StaffOwnerVerification({ match, onChanged }: { match: any; onChanged?: (m: any) => void }) {
    const [open, setOpen] = useState(false);
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const pending = match?.status === 'AI_SUGGESTED' || match?.status === 'PENDING_VERIFICATION';
    if (!match?.matched_pet?.owner_id || (!pending && !match?.owner_verification_requested_at)) return null;

    if (match.owner_verification_answered_at) {
        return (
            <div className="px-4 py-3 rounded-xl bg-indigo-50 border border-indigo-200 text-xs text-indigo-900 space-y-1">
                <p><strong>Owner's answer:</strong> {ANSWER_LABEL[match.owner_verification_answer] || match.owner_verification_answer}
                    {' '}({new Date(match.owner_verification_answered_at).toLocaleString()})</p>
                {match.owner_verification_answer_note && <p><strong>Owner's note:</strong> {match.owner_verification_answer_note}</p>}
                <p className="text-[11px] text-indigo-700">Evidence for your decision. Nothing was merged or confirmed automatically.</p>
            </div>
        );
    }
    if (match.owner_verification_requested_at) {
        return (
            <div className="px-4 py-3 rounded-xl bg-indigo-50 border border-indigo-200 text-xs text-indigo-900">
                ⏳ Owner asked to help verify on {new Date(match.owner_verification_requested_at).toLocaleString()}. Waiting for their answer.
                {match.owner_verification_note && <span className="block mt-1 text-[11px]">Your note: {match.owner_verification_note}</span>}
            </div>
        );
    }

    const submit = async () => {
        setBusy(true);
        setError('');
        try {
            const res = await api.post(`/matches/${match.match_id}/request-owner-verification`, { note: note.trim() });
            setOpen(false);
            setNote('');
            onChanged?.(res.data);
        } catch (e: any) {
            setError(e.response?.data?.detail || 'Could not send the request.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="px-4 py-3 rounded-xl bg-white border border-indigo-200 text-xs text-gray-700 space-y-2">
            {!open ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>Not sure this sighting is {match.matched_pet?.display_name || 'this pet'}? Ask the owner to take a look.</span>
                    <button type="button" onClick={() => setOpen(true)}
                        className="px-3 py-1.5 rounded-lg border border-indigo-300 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 font-bold cursor-pointer">
                        Request owner verification
                    </button>
                </div>
            ) : (
                <div className="space-y-2">
                    <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000}
                        placeholder="What are you unsure about? e.g. the collar is a different colour, but the markings look the same."
                        className="w-full p-2.5 rounded-lg border border-indigo-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-200" />
                    {error && <p className="text-rose-700 font-semibold">{error}</p>}
                    <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => { setOpen(false); setError(''); }} className="px-3 py-1.5 rounded-lg border border-gray-300 font-bold cursor-pointer">Cancel</button>
                        <button type="button" disabled={busy || note.trim().length < 10} onClick={submit}
                            className="px-3 py-1.5 rounded-lg bg-indigo-700 hover:bg-indigo-800 text-white font-bold cursor-pointer disabled:opacity-50">
                            {busy ? 'Sending…' : 'Send to owner'}
                        </button>
                    </div>
                    <p className="text-[10px] text-gray-500">The owner gets the sighting photo in the case conversation and answers Yes, No or Unsure. You still make the final decision.</p>
                </div>
            )}
        </div>
    );
}

// Owner side (sighting page): answer a staff request with Yes / No / Unsure.
export function OwnerVerificationAnswer({ match, onAnswered }: { match: any; onAnswered?: () => void }) {
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    if (!match?.owner_verification_requested_at) return null;
    const pet = match.matched_pet?.display_name || match.matched_pet?.pet_name || 'your pet';

    if (match.owner_verification_answered_at) {
        return (
            <div className="mb-6 p-4 rounded-2xl bg-indigo-50 border border-indigo-200 text-sm text-indigo-900">
                <p className="font-black">Thanks for your answer: {ANSWER_LABEL[match.owner_verification_answer] || match.owner_verification_answer}</p>
                <p className="mt-1 text-xs">Staff will review it and make the final decision. You'll be notified of any update.</p>
            </div>
        );
    }

    const answer = async (value: 'YES' | 'NO' | 'UNSURE') => {
        setBusy(true);
        setError('');
        try {
            await api.post(`/matches/${match.match_id}/owner-verification`, { answer: value, note: note.trim() || undefined });
            onAnswered?.();
        } catch (e: any) {
            setError(e.response?.data?.detail || 'Could not send your answer.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="mb-6 p-4 rounded-2xl bg-indigo-50 border border-indigo-200 text-sm text-indigo-900 space-y-3">
            <div>
                <p className="font-black">❓ Staff need your help: is this {pet}?</p>
                {match.owner_verification_note && <p className="mt-1 text-xs"><strong>Staff note:</strong> {match.owner_verification_note}</p>}
                <p className="mt-1 text-xs">Your answer helps staff decide. It doesn't confirm or change anything by itself.</p>
            </div>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000}
                placeholder="Optional: what makes you sure (or unsure)?"
                className="w-full p-2.5 rounded-xl border border-indigo-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-200" />
            {error && <p className="text-xs font-semibold text-rose-700">{error}</p>}
            <div className="grid grid-cols-3 gap-2">
                <button type="button" disabled={busy} onClick={() => answer('YES')} className="py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black cursor-pointer disabled:opacity-50">Yes</button>
                <button type="button" disabled={busy} onClick={() => answer('NO')} className="py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black cursor-pointer disabled:opacity-50">No</button>
                <button type="button" disabled={busy} onClick={() => answer('UNSURE')} className="py-2.5 rounded-xl bg-gray-200 hover:bg-gray-300 text-gray-800 text-xs font-black cursor-pointer disabled:opacity-50">Unsure</button>
            </div>
        </div>
    );
}
