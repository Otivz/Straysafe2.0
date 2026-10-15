import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, Check } from 'lucide-react';
import { api } from '../../utils/api';
import { cloudinaryResized } from '../../utils/cloudinaryImage';
import { DEFAULT_PET_AVATAR } from '../../utils/avatar';

// Staff: this record is the same animal as another pet record. Pick the other record from suggestions (records of the
// same kind of animal sharing exact facts: owner phone or name, pet name, breed, main colour) or search by name,
// owner, breed or Pet ID. No AI. Everything moves to the kept record; the other one is archived (not deleted).
// When the kept record belongs to a resident's account, the owner is asked to agree first.

interface Candidate {
    pet_id: number;
    pet_name?: string | null;
    breed?: string | null;
    primary_color?: string | null;
    photo_url?: string | null;
    owner_name?: string | null;
    owner_phone?: string | null;
    has_account_owner: boolean;
    same_facts?: string[];
    blocked_reason?: string | null;
    /** the owner was already asked to combine this record with this pet (one request per pair; reminders 5 min apart) */
    owner_request?: { asked_at?: string | null; last_contact_at?: string | null; reminders_sent: number; can_remind: boolean; seconds_until_remind: number } | null;
}

const ago = (iso?: string | null) => {
    if (!iso) return '';
    const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

const roleId = (() => {
    try { return JSON.parse(localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user') || localStorage.getItem('admin_user') || sessionStorage.getItem('admin_user') || 'null')?.role_id; } catch { return null; }
})();

export default function MergePetRecord({ pet, onMerged }: { pet: any; onMerged?: () => void }) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [thisPet, setThisPet] = useState<Candidate | null>(null);
    const [items, setItems] = useState<Candidate[]>([]);
    const [loading, setLoading] = useState(false);
    const [picked, setPicked] = useState<Candidate | null>(null);
    const [keepPicked, setKeepPicked] = useState(true);   // true: keep the picked record, archive this one
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [confirming, setConfirming] = useState(false);   // the "are you sure?" modal
    const [done, setDone] = useState('');                  // what happened, shown after the box closes
    const [fetchedAt, setFetchedAt] = useState(0);          // when the reminder wait times were read
    const [, setTick] = useState(0);                        // re-renders the reminder countdown
    const petId = pet?.id || pet?.pet_id;

    useEffect(() => {
        if (!open || !petId) return;
        let alive = true;
        setLoading(true);
        const t = setTimeout(() => {
            api.get(`/pets/${petId}/merge-candidates`, { params: query.trim() ? { q: query.trim() } : {} })
                .then((res) => {
                    if (!alive) return;
                    setThisPet(res.data?.this_pet || null);
                    setItems(Array.isArray(res.data?.candidates) ? res.data.candidates : []);
                    setFetchedAt(Date.now());
                })
                .catch(() => { if (alive) setItems([]); })
                .finally(() => { if (alive) setLoading(false); });
        }, query ? 300 : 0);
        return () => { alive = false; clearTimeout(t); };
    }, [open, petId, query]);

    // the reminder countdown moves while a waiting record is picked
    useEffect(() => {
        if (!open) return;
        const t = setInterval(() => setTick((n) => n + 1), 10000);
        return () => clearInterval(t);
    }, [open]);

    if (!petId) return null;

    const pick = (c: Candidate) => {
        setPicked(c);
        setError('');
        // keep the record that has an account owner; otherwise keep the one picked
        setKeepPicked(c.has_account_owner || !thisPet?.has_account_owner);
    };

    const keep = picked ? (keepPicked ? picked : thisPet) : null;
    const dup = picked ? (keepPicked ? thisPet : picked) : null;
    const askOwner = Boolean(keep?.has_account_owner) && roleId !== 4;
    // an earlier request for this pair: no new request, only a reminder once the gap has passed
    const earlier = picked?.owner_request || null;
    const waitSecs = earlier ? Math.max(0, earlier.seconds_until_remind - Math.floor((Date.now() - fetchedAt) / 1000)) : 0;
    const waitMins = Math.ceil(waitSecs / 60);
    const isReminder = askOwner && Boolean(earlier);

    const submit = async () => {
        if (!keep || !dup) return;
        setBusy(true);
        setError('');
        try {
            if (askOwner) {
                const res = await api.post('/pets/possible-duplicates/merge-request', { dup_pet_id: dup.pet_id, keep_pet_id: keep.pet_id, reason: reason.trim() || undefined });
                setDone(res.data?.reminded
                    ? `A reminder was sent to the owner of ${keep.pet_name || `Pet #${keep.pet_id}`}. You can remind them again in 5 minutes.`
                    : `The owner of ${keep.pet_name || `Pet #${keep.pet_id}`} was asked to combine the records. They'll be merged once they agree.`);
                setConfirming(false);
                setOpen(false);
            } else {
                const res = await api.post(`/pets/${dup.pet_id}/merge-into`, { keep_pet_id: keep.pet_id, reason: reason.trim() || undefined });
                setDone(res.data?.message || 'Records merged.');
                setConfirming(false);
                setOpen(false);
                if (dup.pet_id === Number(petId)) onMerged?.();   // this record was archived
            }
        } catch (e: any) {
            setError(e.response?.data?.detail || 'Could not merge the records.');
            setConfirming(false);
        } finally {
            setBusy(false);
        }
    };

    if (!open) {
        return (
            <>
            {done && (
                <p className="mb-2 p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-[11px] font-bold text-emerald-800">✓ {done}</p>
            )}
            <button type="button" onClick={() => { setDone(''); setOpen(true); }}
                className="w-full py-3 bg-white hover:bg-slate-50 text-slate-700 rounded-2xl font-black text-xs uppercase tracking-widest border border-slate-200 transition-all cursor-pointer">
                Merge Duplicate Record
            </button>
            </>
        );
    }

    const card = (c: Candidate, selectable: boolean) => (
        <button type="button" key={c.pet_id} disabled={!selectable || Boolean(c.blocked_reason)} onClick={() => selectable && pick(c)}
            className={`w-full text-left p-2.5 rounded-xl border flex items-center gap-2.5 transition-all ${picked?.pet_id === c.pet_id ? 'border-slate-800 bg-white ring-2 ring-slate-200' : 'border-slate-200 bg-white hover:border-slate-400'} ${c.blocked_reason ? 'opacity-50 cursor-not-allowed' : selectable ? 'cursor-pointer' : 'cursor-default'}`}>
            <img loading="lazy" decoding="async" src={cloudinaryResized(c.photo_url, 160) || DEFAULT_PET_AVATAR} alt=""
                className="w-11 h-11 rounded-lg object-cover border border-slate-100 shrink-0" onError={(e) => { e.currentTarget.src = DEFAULT_PET_AVATAR; }} />
            <div className="min-w-0 flex-1">
                <p className="font-black text-slate-900 truncate">{c.pet_name || 'No Name'} <span className="text-slate-400 font-bold">#{c.pet_id}</span></p>
                <p className="text-[10px] font-semibold text-slate-500 truncate">
                    {[c.breed, c.primary_color].filter(Boolean).join(' · ')}{(c.breed || c.primary_color) ? ' · ' : ''}
                    {c.owner_name || 'No owner'}{c.has_account_owner ? '' : (c.owner_name ? ' (no account)' : '')}
                </p>
                {c.same_facts && c.same_facts.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-0.5">
                        {c.same_facts.map((f) => <span key={f} className="text-[9px] font-black px-1.5 py-0.5 rounded bg-sky-50 text-sky-800 border border-sky-100">{f}</span>)}
                    </div>
                )}
                {c.blocked_reason && <p className="text-[9px] font-bold text-rose-600 mt-0.5">{c.blocked_reason}</p>}
            </div>
            {picked?.pet_id === c.pet_id && <Check className="w-4 h-4 text-slate-800 shrink-0" />}
        </button>
    );

    return (
        <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-3 text-xs text-slate-800">
            <p className="font-bold">Which record is the same animal as {thisPet?.pet_name || pet?.name || 'this pet'}?</p>

            <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input value={query} onChange={(e) => { setQuery(e.target.value); setPicked(null); }}
                    placeholder="Search by pet name, owner, breed or Pet ID"
                    className="w-full pl-8 pr-3 py-2.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-slate-200" />
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                {query.trim() ? 'Search results' : 'Suggested: same kind of animal sharing these details'}
            </p>
            <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
                {loading ? <p className="text-[11px] text-slate-400 font-semibold">Looking…</p>
                    : items.length === 0 ? <p className="text-[11px] text-slate-500 font-semibold">{query.trim() ? 'No records match your search.' : 'No similar records found. Search by name, owner, breed or Pet ID.'}</p>
                        : items.map((c) => card(c, true))}
            </div>

            {picked && thisPet && (
                <div className="space-y-2 pt-1">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Which record to keep?</p>
                    <div className="grid grid-cols-2 gap-2">
                        {[{ c: picked, mine: false }, { c: thisPet, mine: true }].map(({ c, mine }) => {
                            const chosen = keepPicked ? !mine : mine;
                            return (
                                <button type="button" key={c.pet_id} onClick={() => setKeepPicked(!mine)}
                                    className={`p-2 rounded-xl border text-left cursor-pointer ${chosen ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-100' : 'border-slate-200 bg-white'}`}>
                                    <p className="font-black text-slate-900 truncate">{chosen ? '✓ Keep ' : ''}{c.pet_name || 'No Name'} #{c.pet_id}</p>
                                    <p className="text-[10px] font-semibold text-slate-500">{mine ? 'This record' : 'The record you picked'}{c.has_account_owner ? ' · on an owner account' : ''}</p>
                                </button>
                            );
                        })}
                    </div>
                    {isReminder && earlier && (
                        <p className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] font-bold text-amber-800">
                            ⏳ Waiting for the owner: asked {ago(earlier.asked_at)}{earlier.reminders_sent > 0 ? `, reminded ${earlier.reminders_sent}×` : ''}.
                            {waitSecs > 0 ? ` You can send a reminder in ${waitMins} min.` : ' You can send them a reminder.'}
                        </p>
                    )}
                    {!isReminder && <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={1000}
                        placeholder="Why are they the same animal? (optional) e.g. same torn left ear and white patch"
                        className="w-full p-2.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-slate-200" />}
                    <p className="text-[10px] text-slate-500">
                        Reports, claims, history and vaccinations move to the kept record; the other one is archived (not deleted).
                        {askOwner ? ' The kept record is on an owner\'s account, so the owner is asked to agree first.' : ''}
                    </p>
                </div>
            )}

            {error && <p className="font-semibold text-rose-700">{error}</p>}
            <div className="flex justify-end gap-2">
                <button type="button" onClick={() => { setOpen(false); setError(''); setPicked(null); setQuery(''); }} className="px-3 py-1.5 rounded-lg border border-slate-300 font-bold cursor-pointer">Cancel</button>
                <button type="button" disabled={busy || !picked || (isReminder && waitSecs > 0)} onClick={() => setConfirming(true)}
                    className="px-3 py-1.5 rounded-lg bg-role hover:bg-role-hover text-white shadow-sm font-bold cursor-pointer disabled:opacity-50">
                    {busy ? 'Saving…' : !picked ? 'Pick a record'
                        : isReminder ? (waitSecs > 0 ? `Remind the owner in ${waitMins} min` : 'Remind the owner')
                            : askOwner ? `Ask the owner to combine into #${keep?.pet_id}` : `Merge into #${keep?.pet_id}`}
                </button>
            </div>
            {confirming && keep && dup && createPortal(
                <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => !busy && setConfirming(false)}>
                    <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 space-y-4 text-slate-800" role="dialog" aria-modal="true"
                        aria-labelledby="merge-confirm-title" onClick={(e) => e.stopPropagation()}>
                        <h3 id="merge-confirm-title" className="text-sm font-black uppercase tracking-tight text-slate-900">
                            {isReminder ? `Remind the owner of ${keep.pet_name || `Pet #${keep.pet_id}`}?`
                                : askOwner ? `Ask the owner of ${keep.pet_name || `Pet #${keep.pet_id}`} to combine the records?` : `Merge into ${keep.pet_name || ''} #${keep.pet_id}?`}
                        </h3>
                        <p className="text-xs font-semibold text-slate-600 leading-relaxed">
                            {isReminder
                                ? `They were asked ${ago(earlier?.asked_at)} and haven't answered yet. They'll get one reminder notification; the request itself stays the same.`
                                : askOwner
                                ? `${dup.pet_name || 'No Name'} #${dup.pet_id} will be combined into ${keep.pet_name || ''} #${keep.pet_id} once the owner agrees. Until then nothing changes.`
                                : `${dup.pet_name || 'No Name'} #${dup.pet_id} is archived (not deleted) and its reports, claims, history and vaccinations move to #${keep.pet_id}.`}
                        </p>
                        {error && <p className="text-[11px] font-semibold text-rose-600">{error}</p>}
                        <div className="flex gap-2.5">
                            <button type="button" disabled={busy} onClick={() => setConfirming(false)}
                                className="flex-1 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-[10px] font-black uppercase tracking-widest cursor-pointer disabled:opacity-50">
                                Cancel
                            </button>
                            <button type="button" disabled={busy} onClick={submit}
                                className="flex-1 py-2.5 rounded-xl bg-role hover:bg-role-hover text-white text-[10px] font-black uppercase tracking-widest shadow-sm cursor-pointer disabled:opacity-50">
                                {busy ? 'Saving…' : isReminder ? 'Yes, remind them' : askOwner ? 'Yes, ask the owner' : 'Yes, merge'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
