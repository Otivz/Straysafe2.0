import { useCallback, useEffect, useState } from 'react';
import { Copy, UserCheck, CheckCircle2, XCircle, Clock } from 'lucide-react';
import api from '../utils/api';
import { cloudinaryResized } from '../utils/cloudinaryImage';
import { DEFAULT_PET_AVATAR } from '../utils/avatar';

// Pet Records (staff): records that may be the same pet, and residents' claims to a pet registered for them before
// they had an account. No AI: exact matches (owner phone, owner + pet name) that a person decides.
// PET_RECORD_DUPLICATE_PREVENTION_PLAN.md. Shows nothing when both lists are empty.

export default function PetRecordReviewPanel({ onChanged, className = '' }: { onChanged?: () => void; className?: string }) {
    const [pairs, setPairs] = useState<any[]>([]);
    const [claims, setClaims] = useState<any[]>([]);
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState('');
    const roleId = (() => {
        try { return JSON.parse(localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user') || localStorage.getItem('admin_user') || sessionStorage.getItem('admin_user') || 'null')?.role_id; } catch { return null; }
    })();
    const canDecideClaims = roleId === 2 || roleId === 4;

    const load = useCallback(async () => {
        const [d, c] = await Promise.allSettled([api.get('/pets/possible-duplicates'), api.get('/pet-ownership/claims')]);
        setPairs(d.status === 'fulfilled' && Array.isArray(d.value.data?.pairs) ? d.value.data.pairs : []);
        setClaims(c.status === 'fulfilled' && Array.isArray(c.value.data) ? c.value.data : []);
    }, []);
    useEffect(() => { load(); }, [load]);

    const run = async (key: string, fn: () => Promise<any>) => {
        setBusy(key);
        setError('');
        try {
            await fn();
            await load();
            onChanged?.();
        } catch (e: any) {
            setError(e.response?.data?.detail || 'Could not save that.');
        } finally {
            setBusy(null);
        }
    };

    const mergePair = (row: any) => {
        const keep = row.pets.find((p: any) => p.pet_id === row.suggested_keep_pet_id) || row.pets[0];
        const dup = row.pets.find((p: any) => p.pet_id !== keep.pet_id);
        const reason = window.prompt(`Why are ${dup.pet_name} (#${dup.pet_id}) and ${keep.pet_name} (#${keep.pet_id}) the same animal? (optional)`);
        if (reason === null) return;   // cancelled
        if (keep.has_account_owner) {
            // a resident's pet: the owner agrees first
            run(`pair-${dup.pet_id}`, () => api.post('/pets/possible-duplicates/merge-request', { dup_pet_id: dup.pet_id, keep_pet_id: keep.pet_id, reason: reason.trim() || undefined }));
        } else {
            run(`pair-${dup.pet_id}`, () => api.post(`/pets/${dup.pet_id}/merge-into`, { keep_pet_id: keep.pet_id, reason: reason.trim() || undefined }));
        }
    };
    const notSame = (row: any) => {
        const reason = window.prompt('Why are these different pets?');
        if (reason === null) return;
        run(`pair-${row.pets[0].pet_id}`, () => api.post('/pets/possible-duplicates/not-same', { pet_id_a: row.pets[0].pet_id, pet_id_b: row.pets[1].pet_id, reason: reason.trim() || undefined }));
    };
    const decide = (c: any, approve: boolean) => {
        if (approve) {
            if (!window.confirm(`Give ${c.pet_name} to ${c.proposed_owner_name}'s account? It moves to their My Pets with its records.`)) return;
            run(`claim-${c.confirmation_id}`, () => api.post(`/pet-ownership/claims/${c.confirmation_id}/approve`));
        } else {
            const reason = window.prompt(`Why is ${c.pet_name} not ${c.proposed_owner_name}'s pet?`);
            if (!reason || reason.trim().length < 3) return;
            run(`claim-${c.confirmation_id}`, () => api.post(`/pet-ownership/claims/${c.confirmation_id}/decline`, { reason: reason.trim() }));
        }
    };

    if (pairs.length === 0 && claims.length === 0) return null;

    const petCard = (p: any) => (
        <div className="flex items-center gap-2 min-w-0 flex-1">
            <img loading="lazy" decoding="async" src={cloudinaryResized(p.photo_url, 160) || DEFAULT_PET_AVATAR} alt=""
                className="w-11 h-11 rounded-xl object-cover border border-gray-200 shrink-0" onError={(e) => { e.currentTarget.src = DEFAULT_PET_AVATAR; }} />
            <div className="min-w-0">
                <p className="text-xs font-black text-gray-900 truncate">{p.pet_name} <span className="text-gray-400 font-bold">#{p.pet_id}</span></p>
                <p className="text-[10px] font-semibold text-gray-500 truncate">
                    {p.owner_name || 'No owner'}{p.has_account_owner ? '' : ' (no account)'}{p.owner_phone ? ` · ${p.owner_phone}` : ''}
                </p>
            </div>
        </div>
    );

    return (
        <div className={`space-y-4 ${className}`}>
            {claims.length > 0 && (
                <div className="rounded-3xl border-2 border-orange-200 bg-orange-50/60 p-4 space-y-3">
                    <p className="text-xs font-black uppercase tracking-wider text-orange-900 flex items-center gap-1.5">
                        <UserCheck className="w-4 h-4" /> Pet ownership requests ({claims.length})
                    </p>
                    {claims.map((c) => (
                        <div key={c.confirmation_id} className="p-3 rounded-2xl bg-white border border-orange-100 flex flex-col sm:flex-row sm:items-center gap-3">
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                                <img loading="lazy" decoding="async" src={cloudinaryResized(c.photo_url, 160) || DEFAULT_PET_AVATAR} alt=""
                                    className="w-12 h-12 rounded-xl object-cover border border-gray-200 shrink-0" onError={(e) => { e.currentTarget.src = DEFAULT_PET_AVATAR; }} />
                                <div className="min-w-0">
                                    <p className="text-xs font-black text-gray-900"><strong>{c.proposed_owner_name}</strong> (resident account) says <strong>{c.pet_name}</strong> is theirs</p>
                                    <p className="text-[10px] font-semibold text-gray-500">
                                        On the record: {c.record_owner_name || 'no name'}{c.record_owner_phone ? `, ${c.record_owner_phone}` : ''} · their account: {c.resident_phone || 'no number'}
                                    </p>
                                    <span className={`inline-block mt-0.5 text-[9px] font-black px-1.5 py-0.5 rounded ${c.numbers_match ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                                        {c.numbers_match ? 'Numbers match' : 'Numbers differ'}
                                    </span>
                                </div>
                            </div>
                            {canDecideClaims ? (
                                <div className="flex gap-2 shrink-0">
                                    <button type="button" disabled={busy === `claim-${c.confirmation_id}`} onClick={() => decide(c, true)}
                                        className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-wider disabled:opacity-50 cursor-pointer inline-flex items-center gap-1">
                                        <CheckCircle2 className="w-3 h-3" /> Approve
                                    </button>
                                    <button type="button" disabled={busy === `claim-${c.confirmation_id}`} onClick={() => decide(c, false)}
                                        className="px-3 py-2 rounded-xl border border-red-200 bg-white text-red-700 hover:bg-red-50 text-[10px] font-black uppercase tracking-wider disabled:opacity-50 cursor-pointer inline-flex items-center gap-1">
                                        <XCircle className="w-3 h-3" /> Decline
                                    </button>
                                </div>
                            ) : (
                                <span className="text-[10px] font-bold text-gray-400 shrink-0">The Subdivision Leader decides</span>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {pairs.length > 0 && (
                <div className="rounded-3xl border-2 border-sky-200 bg-sky-50/60 p-4 space-y-3">
                    <p className="text-xs font-black uppercase tracking-wider text-sky-900 flex items-center gap-1.5">
                        <Copy className="w-4 h-4" /> Possible duplicate records ({pairs.length})
                    </p>
                    {pairs.map((row) => {
                        const keep = row.pets.find((p: any) => p.pet_id === row.suggested_keep_pet_id) || row.pets[0];
                        const key = `pair-${row.pets.find((p: any) => p.pet_id !== keep.pet_id)?.pet_id}`;
                        return (
                            <div key={`${row.pets[0].pet_id}-${row.pets[1].pet_id}`} className="p-3 rounded-2xl bg-white border border-sky-100 space-y-2.5">
                                <div className="flex flex-col sm:flex-row gap-2">{petCard(row.pets[0])}{petCard(row.pets[1])}</div>
                                <p className="text-[10px] font-bold text-sky-900">{row.reasons.join(' · ')}</p>
                                {row.owner_asked ? (
                                    <p className="text-[11px] font-bold text-amber-800 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Waiting for the owner to agree to combine them</p>
                                ) : (
                                    <div className="flex gap-2">
                                        <button type="button" disabled={busy === key} onClick={() => mergePair(row)}
                                            className="flex-1 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-[10px] font-black uppercase tracking-wider disabled:opacity-50 cursor-pointer">
                                            {keep.has_account_owner ? 'Ask the owner to combine' : 'Merge into one'}
                                        </button>
                                        <button type="button" disabled={busy === key} onClick={() => notSame(row)}
                                            className="flex-1 py-2 rounded-xl border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 text-[10px] font-black uppercase tracking-wider disabled:opacity-50 cursor-pointer">
                                            Not the same pet
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
            {error && <p className="text-[11px] font-semibold text-rose-600">{error}</p>}
        </div>
    );
}
