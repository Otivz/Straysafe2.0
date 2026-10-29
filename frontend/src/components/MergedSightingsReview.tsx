import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, Unlink, Layers } from 'lucide-react';
import api from '../utils/api';
import { cloudinaryResized } from '../utils/cloudinaryImage';
import { DEFAULT_PET_AVATAR } from '../utils/avatar';

// Before staff return a pet: closing the case also closes every report merged into it, so a merged sighting that
// was really a different animal would be closed and forgotten. The leader marks each one "same animal" or separates
// it (back into an active report). A sighting the owner disputed must be decided; then one "I reviewed them" tick.
// The server enforces the same rule (case_groups.require_merged_sightings_review). Shows nothing for a case without
// merged sightings.

interface Sighting {
    report_id: number;
    created_at?: string | null;
    landmark?: string | null;
    photo_url?: string | null;
    owner_answer?: string | null;
    owner_notes?: string | null;
    disputed: boolean;
    decided: boolean;
}

const ANSWER_LABEL: Record<string, string> = {
    OWNER_CONFIRMED: 'Owner: yes, my pet',
    LEADER_VERIFIED: 'Leader verified (photos and markings)',
    OWNER_REJECTED: 'Owner: not my pet',
    UNSURE: 'Owner: unsure',
    NO_RESPONSE: 'Owner: no answer needed',
    PENDING: 'Owner: no answer yet',
};

export default function MergedSightingsReview({ reportId, onReviewedChange, className = '' }: {
    reportId?: number | null;
    onReviewedChange?: (reviewed: boolean) => void;
    className?: string;
}) {
    const [caseId, setCaseId] = useState<number | null>(null);
    const [petLabel, setPetLabel] = useState('the pet');
    const [rows, setRows] = useState<Sighting[]>([]);
    const [reviewed, setReviewed] = useState(false);
    const [reasons, setReasons] = useState<Record<number, string>>({});
    const [busy, setBusy] = useState<number | null>(null);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        if (!reportId) return;
        try {
            const res = await api.get(`/matches/case/${reportId}/merged-sightings`);
            setCaseId(res.data?.case_root_id ?? null);
            setPetLabel(res.data?.pet_name || 'the pet');
            setRows(Array.isArray(res.data?.sightings) ? res.data.sightings : []);
        } catch {
            setRows([]);
        }
    }, [reportId]);
    useEffect(() => { load(); }, [load]);

    const undecided = rows.filter((r) => r.disputed && !r.decided);
    const setTick = (v: boolean) => { setReviewed(v); onReviewedChange?.(v); };

    const keep = async (s: Sighting) => {
        setError('');
        const reason = (reasons[s.report_id] || '').trim();
        if (s.disputed && reason.length < 5) { setError(`Report #${s.report_id}: give a reason (at least 5 characters) for keeping it.`); return; }
        setBusy(s.report_id);
        try {
            await api.post(`/matches/case/${reportId}/merged-sightings/keep`, { report_ids: [s.report_id], reason: reason || undefined });
            await load();
        } catch (e: any) {
            setError(e.response?.data?.detail || 'Could not save the review.');
        } finally { setBusy(null); }
    };

    const separate = async (s: Sighting) => {
        setError('');
        const reason = window.prompt(`Why is Report #${s.report_id} a different animal? It will be separated from Case #${caseId} and reopened as an active report.`);
        if (!reason || reason.trim().length < 3) return;
        setBusy(s.report_id);
        try {
            await api.post(`/reports/${s.report_id}/unmerge`, { reason: reason.trim() });
            setTick(false);
            await load();
        } catch (e: any) {
            setError(e.response?.data?.detail || 'Could not separate the report.');
        } finally { setBusy(null); }
    };

    if (rows.length === 0) return null;

    return (
        <div className={`p-3.5 rounded-2xl border-2 border-sky-200 bg-sky-50/60 dark:bg-sky-950/20 dark:border-sky-900/50 space-y-3 ${className}`}>
            <div className="flex items-start gap-2">
                <Layers className="w-4 h-4 text-sky-700 dark:text-sky-300 shrink-0 mt-0.5" />
                <div>
                    <p className="text-[11px] font-black uppercase tracking-wider text-sky-900 dark:text-sky-200">
                        Review the {rows.length === 1 ? 'merged sighting' : `${rows.length} merged sightings`} first
                    </p>
                    <p className="text-[11px] font-semibold text-sky-900/80 dark:text-sky-200/80 leading-snug">
                        Returning {petLabel} closes Case #{caseId} and every report merged into it. Separate any that were a different animal.
                    </p>
                </div>
            </div>

            <ul className="space-y-2">
                {rows.map((s) => (
                    <li key={s.report_id} className={`p-2.5 rounded-xl bg-white dark:bg-stone-900 border ${s.disputed && !s.decided ? 'border-amber-300' : 'border-gray-200 dark:border-stone-700'}`}>
                        <div className="flex items-center gap-2.5">
                            <img loading="lazy" decoding="async" src={cloudinaryResized(s.photo_url, 160) || DEFAULT_PET_AVATAR} alt=""
                                className="w-11 h-11 rounded-lg object-cover border border-gray-200 shrink-0" onError={(e) => { e.currentTarget.src = DEFAULT_PET_AVATAR; }} />
                            <div className="min-w-0 flex-1">
                                <p className="text-xs font-black text-gray-900 dark:text-white">Report #{s.report_id}</p>
                                <p className="text-[10px] font-semibold text-gray-500 truncate">
                                    {s.created_at ? new Date(s.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}
                                    {s.landmark ? ` · ${s.landmark}` : ''}
                                </p>
                                <span className={`inline-block mt-0.5 text-[9px] font-black px-1.5 py-0.5 rounded ${s.disputed ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'}`}>
                                    {ANSWER_LABEL[s.owner_answer || 'PENDING'] || 'Owner: no answer yet'}
                                </span>
                            </div>
                            {s.decided && <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-700 shrink-0"><CheckCircle2 className="w-3.5 h-3.5" /> Same animal</span>}
                        </div>
                        {s.disputed && s.owner_notes && <p className="mt-1.5 text-[10px] font-semibold text-amber-800">Owner's note: "{s.owner_notes}"</p>}
                        {s.disputed && !s.decided && (
                            <input value={reasons[s.report_id] || ''} onChange={(e) => setReasons({ ...reasons, [s.report_id]: e.target.value })}
                                placeholder="Why it is the same animal (required to keep it)"
                                className="mt-2 w-full px-2.5 py-1.5 border border-amber-300 rounded-lg text-[11px] font-semibold focus:outline-none focus:border-amber-500" />
                        )}
                        <div className="mt-2 flex gap-2">
                            {!s.decided && (
                                <button type="button" disabled={busy === s.report_id} onClick={() => keep(s)}
                                    className="flex-1 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-wider disabled:opacity-50 cursor-pointer">
                                    Same animal
                                </button>
                            )}
                            <button type="button" disabled={busy === s.report_id} onClick={() => separate(s)}
                                className="flex-1 py-1.5 rounded-lg border border-red-200 text-red-700 hover:bg-red-50 text-[10px] font-black uppercase tracking-wider disabled:opacity-50 cursor-pointer inline-flex items-center justify-center gap-1">
                                <Unlink className="w-3 h-3" /> Different: separate
                            </button>
                        </div>
                    </li>
                ))}
            </ul>

            {undecided.length > 0 ? (
                <p className="flex items-start gap-1.5 text-[11px] font-bold text-amber-800">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    The owner disputed Report {undecided.map((s) => `#${s.report_id}`).join(', ')}. Keep it (with a reason) or separate it first.
                </p>
            ) : (
                <label className="flex items-start gap-2 text-[11px] font-bold text-sky-900 dark:text-sky-200 cursor-pointer">
                    <input type="checkbox" checked={reviewed} onChange={(e) => setTick(e.target.checked)} className="mt-0.5 accent-sky-600" />
                    I reviewed these sightings: they are the same animal as this case (any that weren't are separated).
                </label>
            )}
            {error && <p className="text-[10px] font-semibold text-rose-600">{error}</p>}
        </div>
    );
}
