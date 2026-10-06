import React, { useCallback, useEffect, useState } from 'react';
import api from '../utils/api';
import { DEFAULT_PET_AVATAR, getPetPicture } from '../utils/avatar';

interface OwnershipRequest {
    confirmation_id: number;
    pet_id: number;
    pet_name?: string | null;
    pet_type?: string | null;
    breed?: string | null;
    photo_url?: string | null;
    proposed_by_name?: string | null;
    source: string;
    report_id?: number | null;
    created_at?: string | null;
}

interface Props {
    /** Called after an accept so the page can reload the resident's pets */
    onAccepted?: () => void;
}

/** Resident inbox: staff recorded you as a pet's owner — accept, or reject if it's not your pet. */
const PendingOwnershipRequests: React.FC<Props> = ({ onAccepted }) => {
    const [items, setItems] = useState<OwnershipRequest[]>([]);
    const [busyId, setBusyId] = useState<number | null>(null);
    const [rejecting, setRejecting] = useState<OwnershipRequest | null>(null);
    const [reason, setReason] = useState('');
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const res = await api.get('/pet-ownership/mine');
            setItems(Array.isArray(res.data) ? res.data : []);
        } catch {
            setItems([]);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const answer = async (item: OwnershipRequest, accept: boolean) => {
        setBusyId(item.confirmation_id);
        setError(null);
        try {
            if (accept) await api.post(`/pet-ownership/${item.confirmation_id}/accept`);
            else await api.post(`/pet-ownership/${item.confirmation_id}/reject`, { reason: reason.trim() || null });
            setRejecting(null);
            setReason('');
            await load();
            if (accept) onAccepted?.();
        } catch (err: any) {
            setError(err?.response?.data?.detail || 'Could not send your answer. Please try again.');
        } finally {
            setBusyId(null);
        }
    };

    if (items.length === 0) return null;

    return (
        <section className="mb-6 space-y-3" data-testid="pending-ownership-requests">
            <div className="flex items-center gap-2">
                <span className="text-lg">🐾</span>
                <h2 className="text-sm font-black uppercase tracking-wider text-[#1a1208] dark:text-white">
                    Please confirm pet ownership ({items.length})
                </h2>
            </div>
            {error && <p className="text-xs font-bold text-rose-600">{error}</p>}

            {items.map((item) => (
                <div
                    key={item.confirmation_id}
                    className="p-4 rounded-2xl border-2 border-role-border bg-role-soft/60 dark:bg-role-strong/20 dark:border-role-strong flex flex-col sm:flex-row sm:items-center gap-4"
                >
                    <img
                        src={getPetPicture(item.photo_url || undefined)}
                        alt={item.pet_name || 'Pet'}
                        className="w-16 h-16 rounded-xl object-cover border-2 border-white shadow-sm shrink-0"
                        onError={(e) => { e.currentTarget.src = DEFAULT_PET_AVATAR; }}
                    />
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-[#1a1208] dark:text-white">
                            {item.pet_name || 'Unnamed pet'}
                            <span className="ml-2 text-[11px] font-bold text-gray-500">{[item.pet_type, item.breed].filter(Boolean).join(' • ')}</span>
                        </p>
                        <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5">
                            {item.proposed_by_name || 'A staff member'} recorded you as this pet's owner
                            {item.source === 'returned_to_owner' ? ' when it was returned to you' : ''}
                            {item.report_id ? ` (Report #${item.report_id})` : ''}. Is this your pet?
                        </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                        <button
                            type="button"
                            disabled={busyId === item.confirmation_id}
                            onClick={() => answer(item, true)}
                            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider cursor-pointer disabled:opacity-50"
                        >
                            Yes, it's mine
                        </button>
                        <button
                            type="button"
                            disabled={busyId === item.confirmation_id}
                            onClick={() => { setRejecting(item); setReason(''); }}
                            className="px-4 py-2 rounded-xl bg-white hover:bg-rose-50 text-rose-700 border border-rose-300 text-xs font-black uppercase tracking-wider cursor-pointer disabled:opacity-50"
                        >
                            Not my pet
                        </button>
                    </div>
                </div>
            ))}

            {rejecting && (
                <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-[#1A1A1A] rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl">
                        <h3 className="text-base font-black text-gray-900 dark:text-white">Reject ownership of {rejecting.pet_name || 'this pet'}?</h3>
                        <p className="text-xs text-gray-600 dark:text-gray-300">
                            The pet will not be added to your account and the staff will be told to check the owner again.
                        </p>
                        <textarea
                            rows={3}
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            maxLength={500}
                            placeholder="Optional: e.g. This is not my dog / I never lost a pet"
                            className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#121212] text-xs resize-none focus:outline-none focus:border-rose-400"
                        />
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => setRejecting(null)}
                                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-700 dark:text-gray-200 text-xs font-black uppercase cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                disabled={busyId === rejecting.confirmation_id}
                                onClick={() => answer(rejecting, false)}
                                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black uppercase cursor-pointer disabled:opacity-50"
                            >
                                Reject
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
};

export default PendingOwnershipRequests;
