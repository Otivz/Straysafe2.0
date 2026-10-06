import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../utils/api';
import { getReportStatusLabel, getReportStatusBadgeStyle } from '../../utils/reportStatus';

// Reports in these statuses are closed or resolved and cannot be merged
const TERMINAL_STATUSES = [3, 9, 10, 11, 12, 14, 18];
const MAX_REPORTS_PER_MERGE = 25;

// Helper to extract clean breed string from a report object
export const getReportBreed = (r: any): string => {
    if (!r) return '';
    const b = r.animal_breed || r.breed;
    if (b && typeof b === 'string' && b.toLowerCase() !== 'unknown' && b.toLowerCase() !== 'n/a') {
        return b.trim();
    }
    const ai = r.ai_possible_breed;
    if (ai && typeof ai === 'string' && ai.toLowerCase() !== 'unknown' && ai.toLowerCase() !== 'n/a') {
        return ai.trim();
    }
    return '';
};

// Check whether two breeds match or are compatible
export const isSameBreed = (breedA?: string | null, breedB?: string | null): boolean => {
    if (!breedA || !breedB) return false;
    const a = breedA.toLowerCase().trim();
    const b = breedB.toLowerCase().trim();
    if (!a || !b || a === 'unknown' || b === 'unknown') return false;
    if (a === b) return true;
    if (a.includes(b) || b.includes(a)) return true;
    return false;
};

interface MergeReportModalProps {
    isOpen: boolean;
    onClose: () => void;
    secondaryReport: {
        report_id: number;
        animal_type?: string | null;
        animal_breed?: string | null;
        breed?: string | null;
        ai_possible_breed?: string | null;
        landmark?: string | null;
        subdivision_id?: number | null;
        status_id?: number | null;
        reporter_name?: string | null;
        media?: any[];
        [key: string]: any;
    };
    currentUserId: number;
    initialPrimaryReportId?: number;
    initialNotes?: string;
    /** Called with the (refreshed) report this popup was opened from. */
    onSuccess: (updatedReport: any) => void;
}

interface Candidate {
    report: any;
    similarity?: number;
    aiNote?: string;
}

const statusOf = (r: any) => r?.current_status_id || r?.status_id;
const reportTime = (r: any) => (r?.created_at ? new Date(r.created_at).getTime() : Number.MAX_SAFE_INTEGER);

const MergeReportModal: React.FC<MergeReportModalProps> = ({
    isOpen,
    onClose,
    secondaryReport,
    initialPrimaryReportId,
    initialNotes,
    onSuccess
}) => {
    const [current, setCurrent] = useState<any>(secondaryReport);
    const [candidates, setCandidates] = useState<Candidate[]>([]);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [lookupInput, setLookupInput] = useState('');
    const [lookupError, setLookupError] = useState<string | null>(null);
    const [isLookingUp, setIsLookingUp] = useState(false);
    const [notes, setNotes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    const currentId = secondaryReport.report_id;
    const currentBreed = getReportBreed(current);
    const currentType = (current?.animal_type || '').toLowerCase();

    // Why a report can't join this group (null when it can)
    const incompatibility = (r: any): string | null => {
        if (!r) return 'Report not found.';
        if (r.report_id === currentId) return null;
        if (TERMINAL_STATUSES.includes(statusOf(r)) || r.duplicate_of_report_id) {
            return `Report #${r.report_id} is closed or already merged (${getReportStatusLabel(statusOf(r))}).`;
        }
        if (currentType && r.animal_type && r.animal_type.toLowerCase() !== currentType) {
            return `Report #${r.report_id} is a ${r.animal_type}, but this report is a ${current.animal_type}.`;
        }
        const b = getReportBreed(r);
        if (currentBreed && b && !isSameBreed(currentBreed, b)) {
            return `Report #${r.report_id} is a ${b}, but this report is a ${currentBreed}. They must be the same breed.`;
        }
        return null;
    };

    useEffect(() => {
        if (!isOpen) return;
        let isMounted = true;

        const load = async () => {
            setIsLoading(true);
            setSubmitError(null);
            setLookupError(null);
            setLookupInput('');
            setNotes(initialNotes || '');

            let me: any = secondaryReport;
            try {
                const res = await api.get(`/reports/${currentId}`);
                if (res.data) me = res.data;
            } catch { /* keep what we were given */ }
            if (!isMounted) return;
            setCurrent(me);

            const meBreed = getReportBreed(me);
            const meType = (me?.animal_type || '').toLowerCase();
            const fits = (r: any) => {
                if (!r || r.report_id === currentId) return false;
                if (TERMINAL_STATUSES.includes(statusOf(r)) || r.duplicate_of_report_id) return false;
                if (meType && r.animal_type && r.animal_type.toLowerCase() !== meType) return false;
                const b = getReportBreed(r);
                if (meBreed && (!b || !isSameBreed(meBreed, b))) return false;
                return true;
            };

            const found: Candidate[] = [];
            const seen = new Set<number>([currentId]);

            // 1. AI-suggested duplicates first
            try {
                const dupRes = await api.get(`/matches/duplicates/report/${currentId}`);
                const matches = (Array.isArray(dupRes.data) ? dupRes.data : []).filter((m: any) => m.status !== 'NOT_A_MATCH');
                for (const m of matches) {
                    const otherId = m.source_report_id === currentId ? m.matched_report_id : m.source_report_id;
                    if (!otherId || seen.has(otherId)) continue;
                    try {
                        const r = (await api.get(`/reports/${otherId}`)).data;
                        if (!fits(r)) continue;
                        seen.add(otherId);
                        found.push({ report: r, similarity: m.similarity_score, aiNote: m.ai_explanation });
                    } catch { /* skip */ }
                }
            } catch { /* AI suggestions are optional */ }

            // 2. Other open reports of the same animal in the area
            try {
                const subId = me?.subdivision_id || secondaryReport.subdivision_id;
                const res = await api.get(subId ? `/reports/?subdivision_id=${subId}` : '/reports/');
                const extra = (Array.isArray(res.data) ? res.data : []).filter((r: any) => !seen.has(r.report_id) && fits(r));
                extra.sort((a: any, b: any) => reportTime(b) - reportTime(a));
                for (const r of extra.slice(0, 12)) {
                    seen.add(r.report_id);
                    found.push({ report: r });
                }
            } catch { /* optional */ }

            // 3. A pre-chosen main case (e.g. opened from an AI suggestion)
            if (initialPrimaryReportId && !seen.has(initialPrimaryReportId)) {
                try {
                    const r = (await api.get(`/reports/${initialPrimaryReportId}`)).data;
                    if (fits(r)) found.unshift({ report: r });
                } catch { /* ignore */ }
            }
            if (!isMounted) return;
            setCandidates(found);

            const preselected = new Set<number>([currentId]);
            if (initialPrimaryReportId && found.some(c => c.report.report_id === initialPrimaryReportId)) {
                preselected.add(initialPrimaryReportId);
            } else if (found[0]?.similarity) {
                preselected.add(found[0].report.report_id);
                if (!initialNotes) {
                    setNotes(`AI flagged this as the same animal (${found[0].similarity}% match). Confirmed by reviewing officer.`);
                }
            }
            setSelectedIds(Array.from(preselected));
            setIsLoading(false);
        };

        load();
        return () => { isMounted = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, currentId]);

    const reportsById = useMemo(() => {
        const map = new Map<number, any>();
        map.set(currentId, current);
        candidates.forEach(c => map.set(c.report.report_id, c.report));
        return map;
    }, [candidates, current, currentId]);

    // The report filed first is always the main case (the server applies the same rule).
    const mainId: number | null = (() => {
        const picked = selectedIds.map(id => reportsById.get(id)).filter(Boolean);
        if (picked.length === 0) return null;
        picked.sort((a: any, b: any) => reportTime(a) - reportTime(b) || a.report_id - b.report_id);
        return picked[0].report_id;
    })();

    if (!isOpen) return null;

    const toggle = (id: number) => {
        if (id === currentId) return;
        setSubmitError(null);
        setSelectedIds(prev => {
            if (prev.includes(id)) return prev.filter(x => x !== id);
            if (prev.length >= MAX_REPORTS_PER_MERGE) {
                setSubmitError(`You can merge up to ${MAX_REPORTS_PER_MERGE} reports at a time.`);
                return prev;
            }
            return [...prev, id];
        });
    };

    const handleLookup = async () => {
        const id = parseInt(lookupInput, 10);
        if (!id) return;
        setLookupError(null);
        if (id === currentId) { setLookupError('That is the report you are on.'); return; }
        if (reportsById.has(id)) {
            if (!selectedIds.includes(id)) toggle(id);
            setLookupInput('');
            return;
        }
        try {
            setIsLookingUp(true);
            const r = (await api.get(`/reports/${id}`)).data;
            const problem = incompatibility(r);
            if (problem) { setLookupError(problem); return; }
            setCandidates(prev => [...prev, { report: r }]);
            setSelectedIds(prev => (prev.includes(id) ? prev : [...prev, id]));
            setLookupInput('');
        } catch (err: any) {
            setLookupError(err.response?.data?.detail || `Report #${id} could not be found.`);
        } finally {
            setIsLookingUp(false);
        }
    };

    const others = selectedIds.filter(id => id !== mainId);
    const canSubmit = !isSubmitting && mainId !== null && others.length > 0 && notes.trim().length >= 5;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitError(null);
        if (!mainId || others.length === 0) {
            setSubmitError('Tick at least one other report that is the same animal.');
            return;
        }
        if (notes.trim().length < 5) {
            setSubmitError('Please explain why these reports are the same animal (at least 5 characters).');
            return;
        }
        try {
            setIsSubmitting(true);
            await api.post('/reports/merge-group', { report_ids: selectedIds, notes: notes.trim() });
            // Hand back the report this popup was opened from (it may now be a duplicate of the main case).
            const refreshed = (await api.get(`/reports/${currentId}`)).data;
            onSuccess(refreshed);
            onClose();
        } catch (err: any) {
            setSubmitError(err.response?.data?.detail || 'Failed to merge reports. Please check your permissions and try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const Row = ({ r, similarity, locked }: { r: any; similarity?: number; locked?: boolean }) => {
        const id = r.report_id;
        const isSelected = selectedIds.includes(id);
        const isMain = mainId === id;
        const thumb = r.media?.[0]?.file_url || null;
        const breed = getReportBreed(r);
        return (
            <div
                className={`p-3 rounded-2xl border-2 transition-all flex items-center gap-3 ${isMain
                    ? 'border-role bg-role-soft/70 ring-2 ring-role/20'
                    : isSelected
                        ? 'border-role-border bg-role-soft/30'
                        : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'}`}
            >
                <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={locked}
                    onChange={() => toggle(id)}
                    aria-label={`Include report #${id}`}
                    className="w-4 h-4 accent-[var(--role-accent)] shrink-0 cursor-pointer disabled:cursor-not-allowed"
                />
                <div className="w-12 h-12 rounded-xl bg-gray-100 overflow-hidden shrink-0 border border-gray-200">
                    {thumb ? <img src={thumb} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center">🐾</div>}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-black text-gray-900">#{id} {r.animal_type || 'Stray'}</span>
                        {locked && <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-gray-900 text-white">This report</span>}
                        {breed && <span className="text-[9px] font-bold text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">🐾 {breed}</span>}
                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full border ${getReportStatusBadgeStyle(statusOf(r))}`}>{getReportStatusLabel(statusOf(r))}</span>
                        {similarity !== undefined && <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-500 text-white">AI {similarity}% match</span>}
                    </div>
                    <p className="text-[11px] text-gray-500 font-semibold truncate mt-0.5">
                        📍 {r.landmark || 'Sighting area'} · 👤 {r.reporter_name || 'Citizen'}
                        {r.created_at ? ` · ${new Date(r.created_at).toLocaleDateString()}` : ''}
                    </p>
                </div>
                {isMain && selectedIds.length > 1 && (
                    <span className="shrink-0 text-[10px] font-black uppercase tracking-wider px-2.5 py-1.5 rounded-xl bg-role text-white" title="The report filed first stays open as the main case">
                        ★ Main case (first report)
                    </span>
                )}
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200" role="dialog" aria-modal="true" aria-label="Merge reports of the same animal">
            <div className="bg-white rounded-none sm:rounded-3xl p-5 sm:p-7 max-w-2xl w-full h-full sm:h-auto shadow-2xl animate-in zoom-in-95 duration-200 sm:max-h-[92vh] overflow-y-auto">
                <div className="flex items-start justify-between gap-4 mb-5">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-role-soft text-role border border-role-border flex items-center justify-center text-2xl shrink-0">🔗</div>
                        <div>
                            <h3 className="text-lg font-black text-gray-900 tracking-tight leading-tight">Merge Reports of the Same Animal</h3>
                            <p className="text-xs font-bold text-gray-500 mt-0.5">
                                Tick every report that is this same {current?.animal_type?.toLowerCase() || 'animal'}{currentBreed ? ` (${currentBreed})` : ''}. The report filed first stays open as the main case.
                            </p>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} disabled={isSubmitting} aria-label="Close" className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-700 text-sm font-black cursor-pointer">✕</button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                    {isLoading ? (
                        <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200 text-center text-xs text-amber-800 font-bold animate-pulse">
                            🤖 Looking for reports of the same animal...
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <Row r={current} locked />
                            {candidates.length === 0 ? (
                                <p className="text-xs text-gray-500 font-semibold p-3 bg-gray-50 rounded-2xl border border-gray-100">
                                    No other open reports of the same {currentBreed || 'animal'} were found nearby. Add one by its report number below.
                                </p>
                            ) : (
                                <>
                                    <p className="text-[11px] font-black text-gray-500 uppercase tracking-wider pt-1">
                                        Other open reports {currentBreed ? `of a ${currentBreed}` : ''} (AI suggestions first)
                                    </p>
                                    <div className="space-y-2 max-h-[38vh] overflow-y-auto pr-1">
                                        {candidates.map(c => <Row key={c.report.report_id} r={c.report} similarity={c.similarity} />)}
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    <div>
                        <label className="block text-[11px] font-black text-gray-700 uppercase tracking-wider mb-2">Add another report by number</label>
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-black text-gray-400">#</span>
                                <input
                                    type="number"
                                    value={lookupInput}
                                    onChange={(e) => setLookupInput(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleLookup(); } }}
                                    placeholder="e.g. 21"
                                    className="w-full pl-8 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-bold text-gray-900 focus:outline-none focus:border-role focus:bg-white"
                                />
                            </div>
                            <button
                                type="button"
                                onClick={() => void handleLookup()}
                                disabled={!lookupInput.trim() || isLookingUp}
                                className="px-4 py-2.5 bg-gray-900 hover:bg-black text-white text-xs font-black uppercase tracking-wider rounded-2xl disabled:opacity-50 cursor-pointer"
                            >
                                {isLookingUp ? 'Checking...' : 'Add'}
                            </button>
                        </div>
                        {lookupError && <p className="text-xs font-bold text-rose-600 mt-1.5">⚠️ {lookupError}</p>}
                    </div>

                    <div>
                        <label className="block text-[11px] font-black text-gray-700 uppercase tracking-wider mb-1.5">
                            Why are these the same animal? <span className="text-rose-500">*</span>
                        </label>
                        <textarea
                            rows={3}
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="e.g. Same markings, collar and location in all the photos."
                            className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-semibold text-gray-900 focus:outline-none focus:border-role focus:bg-white resize-none"
                            required
                        />
                    </div>

                    <div className="p-3.5 bg-stone-50 rounded-2xl border border-stone-200 text-[11px] font-semibold text-stone-700 space-y-0.5">
                        {others.length > 0 && mainId ? (
                            <>
                                <p><strong>Case #{mainId}</strong> was reported first, so it stays open as the main case.</p>
                                <p>{others.length === 1 ? 'Report' : `${others.length} reports`} {others.map(id => `#${id}`).join(', ')} will become <strong>Merged — Duplicate</strong>, and their photos are kept with the main case.</p>
                                <p>Every reporter is notified. Each report can be separated again later.</p>
                            </>
                        ) : (
                            <p>Tick at least one other report to merge with this one.</p>
                        )}
                    </div>

                    {submitError && <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold text-rose-700">⚠️ {submitError}</div>}

                    <div className="flex items-center justify-end gap-3 pt-1">
                        <button type="button" onClick={onClose} disabled={isSubmitting} className="px-5 py-2.5 rounded-xl border border-gray-200 text-xs font-black text-gray-600 hover:bg-gray-100 uppercase tracking-wider cursor-pointer">
                            Cancel
                        </button>
                        <button type="submit" disabled={!canSubmit} className="px-6 py-2.5 rounded-xl bg-role hover:bg-role-hover text-white text-xs font-black uppercase tracking-wider shadow-md disabled:opacity-50 cursor-pointer">
                            {isSubmitting ? 'Merging...' : others.length > 0 ? `Merge ${others.length + 1} reports` : 'Merge'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default MergeReportModal;
