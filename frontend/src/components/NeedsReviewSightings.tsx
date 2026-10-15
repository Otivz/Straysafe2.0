import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Unlink, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { cloudinaryResized } from '../utils/cloudinaryImage';
import { DEFAULT_PET_AVATAR } from '../utils/avatar';

// After a case was closed, the owner said one of its merged sightings was not their pet (or was unsure). The leader
// decides: keep it in the closed case (with a reason) or separate it, which reopens it as an active report so the
// animal is followed up. Nothing reopens on the owner's tap alone. Shows nothing when the list is empty.

interface Item {
    report_id: number;
    case_root_id: number;
    pet_name?: string | null;
    created_at?: string | null;
    landmark?: string | null;
    photo_url?: string | null;
    owner_answer?: string | null;
    owner_notes?: string | null;
}

export default function NeedsReviewSightings({ className = '' }: { className?: string }) {
    const navigate = useNavigate();
    const [items, setItems] = useState<Item[]>([]);
    const [busy, setBusy] = useState<number | null>(null);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        try {
            const res = await api.get('/matches/merged-sightings/needs-review');
            setItems(Array.isArray(res.data?.sightings) ? res.data.sightings : []);
        } catch {
            setItems([]);
        }
    }, []);
    useEffect(() => { load(); }, [load]);

    const keep = async (it: Item) => {
        const reason = window.prompt(`Why is Report #${it.report_id} the same animal as Case #${it.case_root_id}${it.pet_name ? ` (${it.pet_name})` : ''}? (at least 5 characters)`);
        if (!reason || reason.trim().length < 5) return;
        setBusy(it.report_id); setError('');
        try {
            await api.post(`/matches/case/${it.case_root_id}/merged-sightings/keep`, { report_ids: [it.report_id], reason: reason.trim() });
            await load();
        } catch (e: any) { setError(e.response?.data?.detail || 'Could not save the review.'); } finally { setBusy(null); }
    };

    const separate = async (it: Item) => {
        const reason = window.prompt(`Separate Report #${it.report_id} from Case #${it.case_root_id}? It reopens as an active report. Reason:`);
        if (!reason || reason.trim().length < 3) return;
        setBusy(it.report_id); setError('');
        try {
            await api.post(`/reports/${it.report_id}/unmerge`, { reason: reason.trim() });
            await load();
        } catch (e: any) { setError(e.response?.data?.detail || 'Could not separate the report.'); } finally { setBusy(null); }
    };

    if (items.length === 0) return null;

    return (
        <div className={`rounded-3xl border-2 border-amber-300 bg-amber-50/70 p-4 sm:p-5 space-y-3 ${className}`}>
            <div className="flex items-start gap-2.5">
                <span className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0"><AlertTriangle className="w-4 h-4" /></span>
                <div>
                    <p className="text-xs font-black uppercase tracking-wider text-amber-900">Needs review: {items.length} merged {items.length === 1 ? 'sighting' : 'sightings'}</p>
                    <p className="text-[11px] font-semibold text-amber-900/80 leading-snug">
                        The owner said {items.length === 1 ? 'this sighting' : 'these sightings'} of a closed case {items.length === 1 ? 'was' : 'were'} not their pet. Keep {items.length === 1 ? 'it' : 'each'} with a reason, or separate {items.length === 1 ? 'it' : 'them'} so the animal is followed up.
                    </p>
                </div>
            </div>
            <ul className="space-y-2">
                {items.map((it) => (
                    <li key={it.report_id} className="p-3 rounded-2xl bg-white border border-amber-200 flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                            <img loading="lazy" decoding="async" src={cloudinaryResized(it.photo_url, 160) || DEFAULT_PET_AVATAR} alt=""
                                className="w-12 h-12 rounded-xl object-cover border border-gray-200 shrink-0" onError={(e) => { e.currentTarget.src = DEFAULT_PET_AVATAR; }} />
                            <div className="min-w-0">
                                <button type="button" onClick={() => navigate(`/subd/reports/${it.report_id}`)} className="text-xs font-black text-gray-900 hover:underline cursor-pointer">
                                    Report #{it.report_id}
                                </button>
                                <p className="text-[10px] font-semibold text-gray-500 truncate">
                                    In closed Case #{it.case_root_id}{it.pet_name ? ` (${it.pet_name})` : ''}{it.landmark ? ` · ${it.landmark}` : ''}
                                </p>
                                <p className="text-[10px] font-bold text-amber-800">
                                    Owner: {it.owner_answer === 'UNSURE' ? 'unsure' : 'not my pet'}{it.owner_notes ? ` · "${it.owner_notes}"` : ''}
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-2 shrink-0">
                            <button type="button" disabled={busy === it.report_id} onClick={() => keep(it)}
                                className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-wider disabled:opacity-50 cursor-pointer inline-flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Keep
                            </button>
                            <button type="button" disabled={busy === it.report_id} onClick={() => separate(it)}
                                className="px-3 py-2 rounded-xl border border-red-200 bg-white text-red-700 hover:bg-red-50 text-[10px] font-black uppercase tracking-wider disabled:opacity-50 cursor-pointer inline-flex items-center gap-1">
                                <Unlink className="w-3 h-3" /> Separate
                            </button>
                        </div>
                    </li>
                ))}
            </ul>
            {error && <p className="text-[10px] font-semibold text-rose-600">{error}</p>}
        </div>
    );
}
