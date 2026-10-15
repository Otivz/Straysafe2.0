import { useCallback, useEffect, useState } from 'react';
import { Clock, Layers } from 'lucide-react';
import api from '../utils/api';
import { cloudinaryResized } from '../utils/cloudinaryImage';
import { DEFAULT_PET_AVATAR } from '../utils/avatar';

// On My Pets: the resident's pet claims still waiting for the subdivision, and requests to combine an older record
// of one of their pets (registered before they had an account) with theirs. PET_RECORD_DUPLICATE_PREVENTION_PLAN.md.

export default function PetRecordRequestsForResident({ onChanged, reloadKey }: { onChanged?: () => void; reloadKey?: unknown }) {
    const [claims, setClaims] = useState<any[]>([]);
    const [merges, setMerges] = useState<any[]>([]);
    const [busy, setBusy] = useState<number | null>(null);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        const [c, m] = await Promise.allSettled([api.get('/pet-ownership/my-claims'), api.get('/pets/merge-requests/mine')]);
        setClaims(c.status === 'fulfilled' && Array.isArray(c.value.data) ? c.value.data : []);
        setMerges(m.status === 'fulfilled' && Array.isArray(m.value.data) ? m.value.data : []);
    }, []);
    useEffect(() => { load(); }, [load, reloadKey]);

    const answer = async (req: any, accept: boolean) => {
        let reason: string | undefined;
        if (!accept) {
            const r = window.prompt('Why are these different pets? (optional)');
            if (r === null) return;
            reason = r.trim() || undefined;
        }
        setBusy(req.request_id);
        setError('');
        try {
            await api.post(`/pets/merge-requests/${req.request_id}/answer`, { accept, reason });
            await load();
            onChanged?.();
        } catch (e: any) {
            setError(e.response?.data?.detail || 'Could not save your answer.');
        } finally {
            setBusy(null);
        }
    };

    if (claims.length === 0 && merges.length === 0) return null;

    const thumb = (p: any) => (
        <img loading="lazy" decoding="async" src={cloudinaryResized(p?.photo_url, 160) || DEFAULT_PET_AVATAR} alt=""
            className="w-11 h-11 rounded-xl object-cover border border-gray-200 shrink-0" onError={(e) => { e.currentTarget.src = DEFAULT_PET_AVATAR; }} />
    );

    return (
        <div className="space-y-3 mb-6">
            {claims.map((c) => (
                <div key={`claim-${c.confirmation_id}`} className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 flex items-center gap-3">
                    {thumb(c)}
                    <div className="min-w-0">
                        <p className="text-xs font-black text-amber-900 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Waiting for your subdivision</p>
                        <p className="text-[11px] font-semibold text-amber-900/80">You said <strong>{c.pet_name}</strong> is your pet. It will appear in My Pets once they confirm.</p>
                    </div>
                </div>
            ))}
            {merges.map((m) => (
                <div key={`merge-${m.request_id}`} className="p-4 rounded-2xl bg-sky-50 border border-sky-200 space-y-3">
                    <p className="text-xs font-black text-sky-900 flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5" /> Combine {m.your_pet?.pet_name || 'your pet'}'s records?
                    </p>
                    <p className="text-[11px] font-semibold text-sky-900/80">
                        Your subdivision found an older record of this pet, registered before you had an account. Combining moves its past cases and history onto your pet.
                    </p>
                    <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex items-center gap-2">{thumb(m.older_record)}<div className="text-[11px] font-bold text-gray-700">Older record<br /><span className="font-black">{m.older_record?.pet_name}</span></div></div>
                        <span className="text-sky-700 font-black">→</span>
                        <div className="flex items-center gap-2">{thumb(m.your_pet)}<div className="text-[11px] font-bold text-gray-700">Your pet<br /><span className="font-black">{m.your_pet?.pet_name}</span></div></div>
                    </div>
                    <div className="flex gap-2">
                        <button type="button" disabled={busy === m.request_id} onClick={() => answer(m, true)}
                            className="flex-1 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-[10px] font-black uppercase tracking-wider disabled:opacity-50 cursor-pointer">
                            Combine them
                        </button>
                        <button type="button" disabled={busy === m.request_id} onClick={() => answer(m, false)}
                            className="flex-1 py-2 rounded-xl border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 text-[10px] font-black uppercase tracking-wider disabled:opacity-50 cursor-pointer">
                            They're different pets
                        </button>
                    </div>
                </div>
            ))}
            {error && <p className="text-[11px] font-semibold text-rose-600">{error}</p>}
        </div>
    );
}
