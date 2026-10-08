import { useState } from 'react';
import { api } from '../utils/api';

// Owner's view of a sighting that staff merged into their pet's confirmed case: nothing to confirm,
// but they can flag it if it isn't their pet. Shows the review status / outcome afterwards.
export default function OwnerCaseSightingCard({ report, currentUserId, onChanged }: {
    report: any;
    currentUserId?: number;
    onChanged?: () => void;
}) {
    const [open, setOpen] = useState(false);
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const dispute = report?.identity_dispute;
    const isOwner = !!currentUserId && report?.owner_id === currentUserId;
    const inherited = !!report?.pet_inherited_from_match_id && !!report?.duplicate_of_report_id;
    if (!isOwner && !(dispute && dispute.status !== 'Pending')) return null;
    if (!inherited && !dispute) return null;
    const petLabel = report?.case_pet_name || dispute?.pet_name || 'your pet';
    const from = report?.pet_inherited_from_report_id ? `Report #${report.pet_inherited_from_report_id}` : 'the original report';

    const submit = async () => {
        setBusy(true);
        setError('');
        try {
            await api.post(`/reports/${report.report_id}/identity-dispute`, { reason: reason.trim() });
            setOpen(false);
            setReason('');
            onChanged?.();
        } catch (e: any) {
            setError(e.response?.data?.detail || 'Could not send your report. Please try again.');
        } finally {
            setBusy(false);
        }
    };

    if (dispute?.status === 'Reversed') {
        return (
            <div className="mb-6 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-900">
                <p className="font-black">✓ Incorrect sighting removed</p>
                <p className="mt-1">
                    Report #{report.report_id} has been removed from {petLabel}'s case following verification. {petLabel}'s original confirmed
                    identity remains unchanged. No further action is required.
                </p>
            </div>
        );
    }
    if (dispute?.status === 'Upheld') {
        return (
            <div className="mb-6 p-4 rounded-2xl bg-slate-50 border border-slate-200 text-sm text-slate-800">
                <p className="font-black">Review complete: this sighting stays in {petLabel}'s case</p>
                {dispute.decision_notes && <p className="mt-1"><strong>Staff explanation:</strong> {dispute.decision_notes}</p>}
                <p className="mt-1 text-xs text-slate-600">Your report is kept on record. No further action is required.</p>
            </div>
        );
    }
    if (dispute?.status === 'Pending') {
        return (
            <div className="mb-6 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-sm text-amber-900">
                <p className="font-black">⚖️ Identity disputed – under review</p>
                <p className="mt-1">You reported that this sighting isn't {petLabel}. Staff are reviewing it; you'll be notified of the outcome.</p>
                <p className="mt-1 text-xs"><strong>Your reason:</strong> {dispute.reason}</p>
            </div>
        );
    }

    return (
        <div className="mb-6 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-900 space-y-3">
            <div>
                <p className="font-black">🐾 New verified sighting of {petLabel}</p>
                <p className="mt-1">
                    This pet's identity was already confirmed by you and authorized staff through {from}. This report belongs to the same
                    consolidated case. No additional owner confirmation is required.
                </p>
            </div>
            {!open ? (
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    className="px-3 py-2 rounded-xl border border-rose-300 bg-white hover:bg-rose-50 text-rose-700 text-xs font-black uppercase tracking-wider cursor-pointer"
                >
                    Flag incorrect sighting
                </button>
            ) : (
                <div className="space-y-2">
                    <p className="text-xs font-bold">Why isn't this {petLabel}? Staff will review it; nothing is changed until they decide.</p>
                    <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        rows={3}
                        maxLength={1000}
                        placeholder="e.g. Boyet has a black spot on his left ear, this dog doesn't. Boyet was at home at that time."
                        className="w-full p-3 rounded-xl border border-rose-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-rose-200"
                    />
                    {error && <p className="text-xs font-semibold text-rose-700">{error}</p>}
                    <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => { setOpen(false); setError(''); }} className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs font-bold cursor-pointer">
                            Cancel
                        </button>
                        <button
                            type="button"
                            disabled={busy || reason.trim().length < 10}
                            onClick={submit}
                            className="px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black cursor-pointer disabled:opacity-50"
                        >
                            {busy ? 'Sending…' : 'Send to staff for review'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
