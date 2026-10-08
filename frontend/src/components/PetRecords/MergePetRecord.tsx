import { useState } from 'react';
import { api } from '../../utils/api';

// Staff: this record is a duplicate of another pet record. Everything moves to the kept record; this one is archived.
export default function MergePetRecord({ pet, onMerged }: { pet: any; onMerged?: () => void }) {
    const [open, setOpen] = useState(false);
    const [keepId, setKeepId] = useState('');
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const petId = pet?.id || pet?.pet_id;
    if (!petId) return null;

    const submit = async () => {
        setBusy(true);
        setError('');
        try {
            const res = await api.post(`/pets/${petId}/merge-into`, { keep_pet_id: Number(keepId), reason: reason.trim() });
            alert(res.data?.message || 'Records merged.');
            setOpen(false);
            onMerged?.();
        } catch (e: any) {
            setError(e.response?.data?.detail || 'Could not merge the records.');
        } finally {
            setBusy(false);
        }
    };

    if (!open) {
        return (
            <button type="button" onClick={() => setOpen(true)}
                className="w-full py-3 bg-white hover:bg-slate-50 text-slate-700 rounded-2xl font-black text-xs uppercase tracking-widest border border-slate-200 transition-all cursor-pointer">
                Merge Duplicate Record
            </button>
        );
    }
    return (
        <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-2.5 text-xs text-slate-800">
            <p className="font-bold">Is this record the same animal as another pet record?</p>
            <label className="block">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Record to keep (Pet ID)</span>
                <input type="number" min={1} value={keepId} onChange={(e) => setKeepId(e.target.value)} placeholder="e.g. 7"
                    className="mt-1 w-full p-2.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-slate-200" />
            </label>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={1000}
                placeholder="Why are they the same animal? e.g. same torn left ear and white patch, owner confirmed"
                className="w-full p-2.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-slate-200" />
            {error && <p className="font-semibold text-rose-700">{error}</p>}
            <p className="text-[10px] text-slate-500">
                Reports, suggestions, claims, history and vaccinations move to the kept record. This record is archived
                (not deleted), so the AI stops suggesting it. Records with different owners can't be merged.
            </p>
            <div className="flex justify-end gap-2">
                <button type="button" onClick={() => { setOpen(false); setError(''); }} className="px-3 py-1.5 rounded-lg border border-slate-300 font-bold cursor-pointer">Cancel</button>
                <button type="button" disabled={busy || !Number(keepId) || Number(keepId) === Number(petId) || reason.trim().length < 10} onClick={submit}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 text-white font-bold cursor-pointer disabled:opacity-50">
                    {busy ? 'Merging…' : `Merge into Pet #${keepId || '…'}`}
                </button>
            </div>
        </div>
    );
}
