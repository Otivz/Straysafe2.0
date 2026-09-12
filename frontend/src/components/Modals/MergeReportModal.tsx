import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { getReportStatusLabel, getReportStatusBadgeStyle } from '../../utils/reportStatus';

// Reports in these statuses are closed or resolved and cannot be merged into
const TERMINAL_STATUSES = [3, 9, 10, 11, 12, 14, 18];

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
    onSuccess: (updatedReport: any) => void;
}

const MergeReportModal: React.FC<MergeReportModalProps> = ({
    isOpen,
    onClose,
    secondaryReport,
    currentUserId,
    initialPrimaryReportId,
    initialNotes,
    onSuccess
}) => {
    const [secondaryBreed, setSecondaryBreed] = useState<string>('');
    const [primaryReportIdInput, setPrimaryReportIdInput] = useState<string>('');
    const [primaryReportPreview, setPrimaryReportPreview] = useState<any | null>(null);
    const [isLoadingPreview, setIsLoadingPreview] = useState<boolean>(false);
    const [previewError, setPreviewError] = useState<string | null>(null);

    const [aiSuspects, setAiSuspects] = useState<any[]>([]);
    const [isLoadingAiSuspects, setIsLoadingAiSuspects] = useState<boolean>(false);

    const [candidateReports, setCandidateReports] = useState<any[]>([]);
    const [showOtherCandidates, setShowOtherCandidates] = useState<boolean>(false);

    const [notes, setNotes] = useState<string>('');
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    // Fetch primary report details when an ID is typed or selected
    const handleSelectOrLookup = async (idToLookup: number, autoNote?: string, expectedBreed?: string) => {
        if (idToLookup === secondaryReport.report_id) {
            setPreviewError('Cannot merge a report into itself.');
            setPrimaryReportPreview(null);
            return;
        }

        try {
            setIsLoadingPreview(true);
            setPreviewError(null);
            const res = await axios.get(`http://localhost:8000/reports/${idToLookup}`);
            const data = res.data;
            const sid = data.current_status_id || data.status_id;
            if (TERMINAL_STATUSES.includes(sid)) {
                setPreviewError(`Report #${idToLookup} is closed/resolved (${getReportStatusLabel(sid)}) and cannot accept merges.`);
                setPrimaryReportPreview(null);
                return;
            }

            const targetBreed = getReportBreed(data);
            const refBreed = expectedBreed || secondaryBreed;
            if (refBreed && targetBreed && !isSameBreed(refBreed, targetBreed)) {
                setPreviewError(`Breed mismatch: Report #${idToLookup} is a ${targetBreed}, which does not match this case (${refBreed}). Both reports must be the same breed.`);
                setPrimaryReportPreview(null);
                return;
            }

            setPrimaryReportPreview(data);
            setPrimaryReportIdInput(String(idToLookup));
            if (autoNote && !notes.trim()) {
                setNotes(autoNote);
            }
        } catch (err: any) {
            setPrimaryReportPreview(null);
            setPreviewError(err.response?.data?.detail || `Report #${idToLookup} could not be found.`);
        } finally {
            setIsLoadingPreview(false);
        }
    };

    // Load AI duplicate matches and general candidate open reports
    useEffect(() => {
        if (!isOpen) return;

        let isMounted = true;

        const loadData = async () => {
            setIsLoadingAiSuspects(true);
            setPreviewError(null);
            setSubmitError(null);
            setShowOtherCandidates(false);

            // 0. Fetch full secondary report to ensure complete breed and animal type info
            let activeSecondary: any = secondaryReport;
            try {
                const sRes = await axios.get(`http://localhost:8000/reports/${secondaryReport.report_id}`);
                if (sRes.data) {
                    activeSecondary = sRes.data;
                }
            } catch (e) {
                console.warn('Could not refresh secondary report details', e);
            }

            const secBreed = getReportBreed(activeSecondary);
            const secType = (activeSecondary.animal_type || secondaryReport.animal_type || '').toLowerCase();
            if (isMounted) {
                setSecondaryBreed(secBreed);
            }

            let detectedSuspects: any[] = [];

            // 1. Fetch AI Suspected Duplicates for this report
            try {
                const dupRes = await axios.get(`http://localhost:8000/matches/duplicates/report/${secondaryReport.report_id}`);
                const matches = Array.isArray(dupRes.data) ? dupRes.data : [];
                
                // Keep matches that are active or confirmed (exclude NOT_A_MATCH), or fallback to high similarity
                let relevantMatches = matches.filter((m: any) => m.status !== 'NOT_A_MATCH');
                if (relevantMatches.length === 0 && matches.length > 0) {
                    relevantMatches = matches.filter((m: any) => (m.similarity_score || 0) >= 70);
                }

                // Load candidate details for each AI match
                const loadedSuspects = [];
                for (const m of relevantMatches) {
                    const candidateId = m.source_report_id === secondaryReport.report_id ? m.matched_report_id : m.source_report_id;
                    if (!candidateId || candidateId === secondaryReport.report_id) continue;

                    try {
                        const repRes = await axios.get(`http://localhost:8000/reports/${candidateId}`);
                        const rep = repRes.data;
                        const sid = rep.current_status_id || rep.status_id;
                        // Exclude terminal / closed / claimed reports from suspects
                        if (TERMINAL_STATUSES.includes(sid)) continue;

                        // Must match species
                        if (secType && rep.animal_type && rep.animal_type.toLowerCase() !== secType) continue;

                        // Must match breed if secondary has a known breed
                        const candBreed = getReportBreed(rep);
                        if (secBreed && candBreed && !isSameBreed(secBreed, candBreed)) continue;

                        loadedSuspects.push({
                            match_id: m.match_id,
                            similarity_score: m.similarity_score,
                            ai_explanation: m.ai_explanation,
                            ai_evidence: m.ai_evidence,
                            report: rep,
                            breed: candBreed
                        });
                    } catch (loadErr) {
                        console.warn(`Could not load details for suspect report #${candidateId}`, loadErr);
                    }
                }

                if (isMounted) {
                    detectedSuspects = loadedSuspects;
                    setAiSuspects(loadedSuspects);
                }
            } catch (dupErr) {
                console.warn('Could not fetch AI duplicate matches for modal', dupErr);
            } finally {
                if (isMounted) setIsLoadingAiSuspects(false);
            }

            // 2. Fetch other open reports in the same subdivision/area (Strict same breed & species)
            try {
                const subId = activeSecondary.subdivision_id || secondaryReport.subdivision_id;
                const url = subId
                    ? `http://localhost:8000/reports/?subdivision_id=${subId}`
                    : 'http://localhost:8000/reports/';
                const res = await axios.get(url);
                if (Array.isArray(res.data) && isMounted) {
                    const suspectIds = new Set(detectedSuspects.map(s => s.report.report_id));

                    // Filter: open reports only, matching species only, MATCHING BREED ONLY, not self, not already shown in AI suspects
                    const eligible = res.data.filter((r: any) => {
                        const sid = r.current_status_id || r.status_id;
                        if (r.report_id === secondaryReport.report_id) return false;
                        if (suspectIds.has(r.report_id)) return false;
                        if (TERMINAL_STATUSES.includes(sid)) return false;
                        if (secType && r.animal_type && r.animal_type.toLowerCase() !== secType) return false;

                        // Strict same-breed filter:
                        // If secondary report has a specific known breed (e.g. German Shepherd), candidate MUST match that breed
                        const candBreed = getReportBreed(r);
                        if (secBreed) {
                            if (!candBreed || !isSameBreed(secBreed, candBreed)) {
                                return false;
                            }
                        }

                        return true;
                    });
                    setCandidateReports(eligible.slice(0, 6));
                }
            } catch (err) {
                console.warn('Could not fetch candidate reports for merge', err);
            }

            // 3. Auto-select primary target
            if (initialPrimaryReportId) {
                handleSelectOrLookup(initialPrimaryReportId, initialNotes, secBreed);
            } else if (detectedSuspects.length > 0) {
                // Immediately select the top AI suspect by default
                const topSuspect = detectedSuspects[0];
                const autoNote = `AI confirmed duplicate stray sighting (${topSuspect.similarity_score}% visual/attribute match). Consolidated case.`;
                handleSelectOrLookup(topSuspect.report.report_id, autoNote, secBreed);
                if (isMounted && !notes.trim()) {
                    setNotes(autoNote);
                }
            } else {
                setPrimaryReportIdInput('');
                setPrimaryReportPreview(null);
                setNotes(initialNotes || '');
            }
        };

        loadData();

        return () => {
            isMounted = false;
        };
    }, [isOpen, secondaryReport.report_id]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitError(null);

        if (!primaryReportPreview) {
            setSubmitError('Please select or specify a valid open primary report.');
            return;
        }

        if (!notes.trim() || notes.trim().length < 5) {
            setSubmitError('Please provide a brief verification note (minimum 5 characters) explaining why these reports are the same animal.');
            return;
        }

        try {
            setIsSubmitting(true);
            const res = await axios.post(`http://localhost:8000/reports/${secondaryReport.report_id}/merge`, {
                user_id: currentUserId,
                primary_report_id: primaryReportPreview.report_id,
                notes: notes.trim()
            });

            onSuccess(res.data);
            onClose();
        } catch (err: any) {
            console.error('Merge failed:', err);
            setSubmitError(err.response?.data?.detail || 'Failed to merge reports. Please check your permissions and try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-xl w-full shadow-2xl border border-gray-100 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-start justify-between gap-4 mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-orange-50 text-[#F97316] border border-orange-200 flex items-center justify-center text-2xl font-black shrink-0">
                            🔗
                        </div>
                        <div>
                            <h3 className="text-lg font-black text-gray-900 tracking-tight leading-tight">
                                Mark as Same Animal / Merge Report
                            </h3>
                            <p className="text-xs font-bold text-gray-500 mt-0.5">
                                Consolidate duplicate Report #{secondaryReport.report_id} {secondaryBreed ? `(${secondaryBreed})` : ''} into an active case
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-700 transition-colors text-sm font-black cursor-pointer"
                    >
                        ✕
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* SECTION 1: AI Suspected Duplicate (High Confidence) */}
                    {isLoadingAiSuspects ? (
                        <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200 text-center text-xs text-amber-800 font-bold animate-pulse">
                            🤖 Analyzing stray sightings for duplicate matches...
                        </div>
                    ) : aiSuspects.length > 0 ? (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <label className="text-[11px] font-black text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                                    <span>🤖 AI Suspected Duplicate Sighting</span>
                                </label>
                                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-200 text-amber-900">
                                    Recommended
                                </span>
                            </div>

                            <div className="space-y-2">
                                {aiSuspects.map((s) => {
                                    const rep = s.report;
                                    const isSelected = primaryReportPreview?.report_id === rep.report_id;
                                    const thumb = rep.media?.[0]?.file_url || null;
                                    return (
                                        <div
                                            key={rep.report_id}
                                            onClick={() => {
                                                const autoNote = `AI confirmed duplicate stray sighting (${s.similarity_score}% visual/attribute match). Consolidated case.`;
                                                handleSelectOrLookup(rep.report_id, autoNote, secondaryBreed);
                                            }}
                                            className={`p-3.5 rounded-2xl border-2 transition-all cursor-pointer flex flex-col gap-2.5 ${
                                                isSelected
                                                    ? 'border-[#F97316] bg-orange-50/70 shadow-sm ring-2 ring-orange-400/20'
                                                    : 'border-amber-200 bg-amber-50/40 hover:bg-amber-50 hover:border-amber-300'
                                            }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="w-14 h-14 rounded-2xl bg-gray-100 overflow-hidden shrink-0 border border-amber-200 shadow-2xs">
                                                    {thumb ? (
                                                        <img src={thumb} alt="" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-lg">🐾</div>
                                                    )}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center justify-between gap-1 flex-wrap">
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            <span className="text-sm font-black text-gray-900">
                                                                Case #{rep.report_id} — {rep.animal_type || 'Stray'}
                                                            </span>
                                                            {s.breed && (
                                                                <span className="text-[10px] font-black text-amber-900 bg-amber-100/90 px-2 py-0.5 rounded-md border border-amber-300">
                                                                    🐾 {s.breed}
                                                                </span>
                                                            )}
                                                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${getReportStatusBadgeStyle(rep.current_status_id || rep.status_id)}`}>
                                                                {getReportStatusLabel(rep.current_status_id || rep.status_id)}
                                                            </span>
                                                        </div>
                                                        <span className="px-2 py-0.5 rounded-md bg-amber-500 text-white font-black text-[10px]">
                                                            {s.similarity_score}% Match
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-gray-600 font-semibold truncate mt-0.5">
                                                        📍 {rep.landmark || 'Sighting Area'}
                                                    </p>
                                                    <p className="text-[11px] text-gray-500 truncate">
                                                        👤 Reporter: <span className="font-bold text-gray-700">{rep.reporter_name || 'Citizen'}</span>
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Closest Matching Information Breakdown */}
                                            <div className="bg-amber-50/90 rounded-2xl p-3 border border-amber-200/80 space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                                                        <span>🎯 Closest Matching Information</span>
                                                    </span>
                                                    <span className="text-[10px] font-black text-amber-800 bg-amber-200/60 px-2 py-0.5 rounded-full">
                                                        {s.similarity_score}% Confidence
                                                    </span>
                                                </div>

                                                {/* Attribute Comparison Pills */}
                                                <div className="flex flex-wrap gap-1.5">
                                                    {s.ai_evidence?.closest_attributes && s.ai_evidence.closest_attributes.length > 0 ? (
                                                        s.ai_evidence.closest_attributes.map((attr: any, idx: number) => (
                                                            <span
                                                                key={idx}
                                                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[10px] font-black border shadow-2xs ${
                                                                    attr.is_match
                                                                        ? 'bg-white text-emerald-950 border-emerald-300'
                                                                        : 'bg-rose-50 text-rose-900 border-rose-300'
                                                                }`}
                                                            >
                                                                <span className={attr.is_match ? 'text-emerald-600 font-black' : 'text-rose-600 font-black'}>
                                                                    {attr.is_match ? '✓' : '✕'}
                                                                </span>
                                                                <span className="text-gray-500">{attr.attribute}:</span>
                                                                <span className="font-black text-gray-900">{attr.match_status || attr.source_value}</span>
                                                            </span>
                                                        ))
                                                    ) : (
                                                        <>
                                                            {s.breed && (
                                                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[10px] font-black bg-white text-emerald-950 border border-emerald-300">
                                                                    <span className="text-emerald-600 font-black">✓</span> Breed: {s.breed}
                                                                </span>
                                                            )}
                                                            {s.ai_evidence?.distance_km !== undefined && s.ai_evidence?.distance_km !== null && (
                                                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[10px] font-black bg-white text-emerald-950 border border-emerald-300">
                                                                    <span className="text-emerald-600 font-black">✓</span> Distance: {s.ai_evidence.distance_km < 1 ? `${Math.round(s.ai_evidence.distance_km * 1000)}m` : `${s.ai_evidence.distance_km}km`}
                                                                </span>
                                                            )}
                                                        </>
                                                    )}
                                                </div>

                                                {/* AI Key Evidence Bullets */}
                                                {s.ai_evidence?.key_evidence_bullets && s.ai_evidence.key_evidence_bullets.length > 0 && (
                                                    <ul className="text-[11px] text-amber-950 font-medium space-y-0.5 pt-1.5 border-t border-amber-200/60 list-disc list-inside">
                                                        {s.ai_evidence.key_evidence_bullets.map((b: string, bIdx: number) => (
                                                            <li key={bIdx} className="leading-snug">{b}</li>
                                                        ))}
                                                    </ul>
                                                )}
                                            </div>

                                            <div className="pt-2 border-t border-amber-200/60 flex items-center justify-between">
                                                <span className="text-[11px] font-bold text-amber-800 flex items-center gap-1">
                                                    <span>💡</span>
                                                    <span>AI identified this sighting as the same animal</span>
                                                </span>
                                                <span className={`text-[10px] font-black px-2.5 py-1 rounded-xl transition-all ${
                                                    isSelected
                                                        ? 'bg-[#F97316] text-white shadow-xs'
                                                        : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                                                }`}>
                                                    {isSelected ? '✓ Selected Primary Case' : 'Select This Report'}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ) : null}

                    {/* SECTION 2: Other Open Cases in Same Area (Species-Filtered & Same-Breed Only) */}
                    {candidateReports.length > 0 && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <label className="text-[11px] font-black text-gray-700 uppercase tracking-wider">
                                    {aiSuspects.length > 0
                                        ? 'Or Select From Other Open Reports'
                                        : `Recent Open ${secondaryBreed ? `${secondaryBreed} ` : ''}Reports in Same Area`}
                                </label>
                                {aiSuspects.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => setShowOtherCandidates(!showOtherCandidates)}
                                        className="text-[10px] font-black text-[#F97316] hover:underline cursor-pointer"
                                    >
                                        {showOtherCandidates ? 'Hide Other Cases' : `Show ${candidateReports.length} Other Cases`}
                                    </button>
                                )}
                            </div>

                            {(showOtherCandidates || aiSuspects.length === 0) && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
                                    {candidateReports.map((c) => {
                                        const isSelected = primaryReportPreview?.report_id === c.report_id;
                                        const thumb = c.media?.[0]?.file_url || null;
                                        const cBreed = getReportBreed(c);
                                        return (
                                            <button
                                                type="button"
                                                key={c.report_id}
                                                onClick={() => handleSelectOrLookup(c.report_id, undefined, secondaryBreed)}
                                                className={`p-2.5 rounded-2xl border text-left transition-all flex items-center gap-2.5 cursor-pointer ${
                                                    isSelected
                                                        ? 'border-[#F97316] bg-orange-50/60 shadow-xs ring-2 ring-orange-400/20'
                                                        : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'
                                                }`}
                                            >
                                                <div className="w-10 h-10 rounded-xl bg-gray-100 overflow-hidden shrink-0 border border-gray-200">
                                                    {thumb ? (
                                                        <img src={thumb} alt="" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-sm">🐾</div>
                                                    )}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center justify-between gap-1">
                                                        <span className="text-xs font-black text-gray-900 truncate">
                                                            #{c.report_id} {c.animal_type || 'Stray'}
                                                        </span>
                                                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full border ${getReportStatusBadgeStyle(c.current_status_id || c.status_id)}`}>
                                                            {getReportStatusLabel(c.current_status_id || c.status_id)}
                                                        </span>
                                                    </div>
                                                    {cBreed && (
                                                        <div className="mt-0.5">
                                                            <span className="text-[9px] font-bold text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded-md border border-amber-200 inline-flex items-center gap-1">
                                                                🐾 {cBreed}
                                                            </span>
                                                        </div>
                                                    )}
                                                    <p className="text-[10px] text-gray-500 font-semibold truncate mt-0.5">
                                                        📍 {c.landmark || 'Sighting Area'}
                                                    </p>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* SECTION 3: Manual Report ID Input */}
                    <div>
                        <label className="block text-[11px] font-black text-gray-700 uppercase tracking-wider mb-2">
                            Or Enter Primary Report ID Manually
                        </label>
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-black text-gray-400">#</span>
                                <input
                                    type="number"
                                    value={primaryReportIdInput}
                                    onChange={(e) => setPrimaryReportIdInput(e.target.value)}
                                    placeholder="e.g. 21"
                                    className="w-full pl-8 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-bold text-gray-900 focus:outline-none focus:border-[#F97316] focus:bg-white"
                                />
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    const idNum = parseInt(primaryReportIdInput, 10);
                                    if (idNum) handleSelectOrLookup(idNum, undefined, secondaryBreed);
                                }}
                                disabled={!primaryReportIdInput.trim() || isLoadingPreview}
                                className="px-4 py-2.5 bg-gray-900 hover:bg-black text-white text-xs font-black uppercase tracking-wider rounded-2xl transition-all disabled:opacity-50 cursor-pointer"
                            >
                                {isLoadingPreview ? 'Checking...' : 'Find Report'}
                            </button>
                        </div>
                        {previewError && (
                            <p className="text-xs font-bold text-rose-600 mt-1.5 flex items-center gap-1">
                                <span>⚠️</span> {previewError}
                            </p>
                        )}
                    </div>

                    {/* SECTION 4: Selected Target Primary Report Preview Card */}
                    {primaryReportPreview && (
                        <div className="p-4 rounded-2xl bg-gradient-to-r from-orange-50/50 to-amber-50/30 border-2 border-orange-300 space-y-2.5 shadow-2xs">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-black uppercase tracking-widest text-[#F97316] flex items-center gap-1">
                                    <span>🎯 Target Primary Active Case</span>
                                </span>
                                <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border ${getReportStatusBadgeStyle(primaryReportPreview.current_status_id || primaryReportPreview.status_id)}`}>
                                    {getReportStatusLabel(primaryReportPreview.current_status_id || primaryReportPreview.status_id)}
                                </span>
                            </div>
                            <div className="flex items-start gap-3">
                                {primaryReportPreview.media?.[0]?.file_url ? (
                                    <img
                                        src={primaryReportPreview.media[0].file_url}
                                        alt=""
                                        className="w-16 h-16 rounded-xl object-cover border border-orange-200 shadow-2xs shrink-0"
                                    />
                                ) : (
                                    <div className="w-16 h-16 rounded-xl bg-orange-100 flex items-center justify-center text-xl shrink-0">
                                        🐾
                                    </div>
                                )}
                                <div className="min-w-0 flex-1 space-y-0.5">
                                    <h4 className="text-sm font-black text-gray-900 truncate flex items-center gap-2 flex-wrap">
                                        <span>Report #{primaryReportPreview.report_id} — {primaryReportPreview.animal_type || 'Animal'}</span>
                                        {getReportBreed(primaryReportPreview) && (
                                            <span className="text-[10px] font-black text-orange-900 bg-orange-100 px-2 py-0.5 rounded-full border border-orange-200">
                                                🐾 {getReportBreed(primaryReportPreview)}
                                            </span>
                                        )}
                                    </h4>
                                    <p className="text-xs text-gray-600 font-semibold truncate">
                                        📍 {primaryReportPreview.landmark || 'Location'}
                                    </p>
                                    <p className="text-[11px] text-gray-500 truncate">
                                        👤 Reporter: <span className="font-bold text-gray-700">{primaryReportPreview.reporter_name || 'Citizen'}</span>
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* SECTION 5: Officer Verification Notes */}
                    <div>
                        <label className="block text-[11px] font-black text-gray-700 uppercase tracking-wider mb-1.5">
                            Officer Verification Notes & Reason <span className="text-rose-500">*</span>
                        </label>
                        <textarea
                            rows={3}
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Document confirmation that this is the same animal..."
                            className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-semibold text-gray-900 focus:outline-none focus:border-[#F97316] focus:bg-white resize-none"
                            required
                        />
                    </div>

                    {/* Operational Impact Notice */}
                    <div className="p-3.5 bg-stone-50 rounded-2xl border border-stone-200 text-stone-700 text-xs font-medium space-y-1">
                        <p className="font-black text-stone-900 uppercase tracking-wider text-[10px] flex items-center gap-1">
                            <span>ℹ️ Operational Impact</span>
                        </p>
                        <ul className="list-disc pl-4 text-[11px] space-y-0.5 font-semibold text-stone-600">
                            <li>Report #{secondaryReport.report_id} status becomes <strong>Merged — Duplicate</strong>.</li>
                            <li>The secondary reporter's sighting photos and details will be credited inside primary Case #{primaryReportPreview ? primaryReportPreview.report_id : '...'}.</li>
                            <li>Both reporters will be notified of the consolidation.</li>
                            <li>This merge can be undone at any time using the <em>Separate Reports</em> action.</li>
                        </ul>
                    </div>

                    {submitError && (
                        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold text-rose-700">
                            ⚠️ {submitError}
                        </div>
                    )}

                    {/* Footer Actions */}
                    <div className="flex items-center justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isSubmitting}
                            className="px-5 py-2.5 rounded-xl border border-gray-200 text-xs font-black text-gray-600 hover:bg-gray-100 transition-colors uppercase tracking-wider cursor-pointer"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting || !primaryReportPreview}
                            className="px-6 py-2.5 rounded-xl bg-[#F97316] hover:bg-[#EA580C] text-white text-xs font-black uppercase tracking-wider transition-all shadow-md shadow-orange-100 flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                        >
                            {isSubmitting ? (
                                <>
                                    <span className="animate-spin text-sm">⏳</span>
                                    <span>Merging Cases...</span>
                                </>
                            ) : (
                                <>
                                    <span>Confirm & Merge</span>
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default MergeReportModal;
