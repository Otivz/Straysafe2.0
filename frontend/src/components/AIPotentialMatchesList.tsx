import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';
import AIMatchReviewModal from './Modals/AIMatchReviewModal';
import PetDetailPanel from './PetRecords/PetDetailPanel';
import { type PetRecord, mapRawPetToPetRecord } from './PetRecords/types';
import { DEFAULT_AVATAR } from '../utils/avatar';
import { petDescription, petName } from '../utils/petName';
import { Sparkles, PawPrint, Layers, RefreshCw, CheckCircle2, ShieldCheck, AlertTriangle, Radar, Scan } from 'lucide-react';

interface AIPotentialMatchesListProps {
    subdivisionId?: number;
    reportId?: number;
    petId?: number;
    isStaff?: boolean;
    readOnly?: boolean;
    onMatchesUpdated?: () => void;
}

const AIPotentialMatchesList: React.FC<AIPotentialMatchesListProps> = ({
    subdivisionId,
    reportId,
    petId,
    isStaff = true,
    readOnly = false,
    onMatchesUpdated
}) => {
    const [matches, setMatches] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeMatch, setActiveMatch] = useState<any | null>(null);
    const [statusFilter, setStatusFilter] = useState<string>('ALL');
    const [matchType, setMatchType] = useState<'pets' | 'duplicates'>('pets');
    const [isScanning, setIsScanning] = useState(false);
    const [selectedPetRecord, setSelectedPetRecord] = useState<PetRecord | null>(null);
    const [scanStep, setScanStep] = useState(0);

    useEffect(() => {
        if (!loading && !isScanning) return;
        const interval = setInterval(() => {
            setScanStep((prev) => (prev + 1) % 3);
        }, 1400);
        return () => clearInterval(interval);
    }, [loading, isScanning]);

    const petScanSteps = [
        'Extracting Visual Embeddings',
        'Registry Cross-Search',
        'Scoring Breed & Morphology'
    ];

    const duplicateScanSteps = [
        'Geospatial & Time Clustering',
        'Incident Visual Cross-Check',
        'Duplicate Sighting Scoring'
    ];

    const scanSteps = matchType === 'duplicates' ? duplicateScanSteps : petScanSteps;

    const handleOpenPetDetail = async (petData: any) => {
        if (!petData) return;
        try {
            const petId = petData.pet_id || petData.id;
            if (petId) {
                const res = await api.get(`/pets/${petId}`);
                setSelectedPetRecord(mapRawPetToPetRecord(res.data));
            } else {
                setSelectedPetRecord(mapRawPetToPetRecord(petData));
            }
        } catch (e) {
            console.error("Failed to load pet details, using fallback:", e);
            setSelectedPetRecord(mapRawPetToPetRecord(petData));
        }
    };

    const fetchMatches = async () => {
        setLoading(true);
        try {
            const params: any = {};
            if (subdivisionId) params.subdivision_id = subdivisionId;
            if (reportId) params.report_id = reportId;
            if (petId) params.pet_id = petId;
            if (statusFilter !== 'ALL') params.status_filter = statusFilter;

            const endpoint = matchType === 'duplicates'
                ? (reportId ? `/matches/duplicates/report/${reportId}` : '/matches/duplicates')
                : '/matches/';

            const res = await api.get(endpoint, { params: matchType === 'duplicates' && reportId ? {} : params });
            let data = Array.isArray(res.data) ? res.data : [];
            if (matchType === 'duplicates') {
                const RESOLVED_STATUS_IDS = [3, 8, 9, 10, 11, 12, 14, 17, 18];
                data = data.filter((m: any) => {
                    // Always retain confirmed matches and staff-verified records
                    if (['CONFIRMED_MATCH', 'NOT_A_MATCH', 'UNABLE_TO_VERIFY'].includes(m.status)) {
                        return true;
                    }
                    const srcStatus = m.source_report?.current_status_id ?? m.source_report?.status_id;
                    const matchStatus = m.matched_report?.current_status_id ?? m.matched_report?.status_id;
                    const srcResolved = (srcStatus !== undefined && RESOLVED_STATUS_IDS.includes(Number(srcStatus))) || Boolean(m.source_report?.duplicate_of_report_id) || m.source_report?.custody_status === 'Impounded';
                    const matchResolved = (matchStatus !== undefined && RESOLVED_STATUS_IDS.includes(Number(matchStatus))) || Boolean(m.matched_report?.duplicate_of_report_id) || m.matched_report?.custody_status === 'Impounded';
                    return !srcResolved && !matchResolved;
                });
            } else {
                // For Pet matches, exclude Impounded pets or deceased pets
                data = data.filter((m: any) => {
                    const petStatus = (m.matched_pet?.status || '').toLowerCase();
                    return petStatus !== 'impounded' && petStatus !== 'deceased';
                });
            }
            setMatches(data);
        } catch (err) {
            console.error('Error loading AI matches:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchMatches();
    }, [subdivisionId, reportId, petId, statusFilter, matchType]);

    const handleScan = async () => {
        setIsScanning(true);
        setLoading(true);
        try {
            if (reportId) {
                await api.post(`/matches/scan/${reportId}`);
            } else {
                await api.post('/matches/scan-all');
            }
            await fetchMatches();
            if (onMatchesUpdated) onMatchesUpdated();
        } catch (err) {
            console.error('Error running AI scan:', err);
        } finally {
            setIsScanning(false);
            setLoading(false);
        }
    };

    const getStatusPill = (status: string, match?: any) => {
        // Pet matches are official only after both staff and the owner confirm
        if (status === 'CONFIRMED_MATCH' && match?.matched_pet_id && match.matched_pet?.owner_id && match.owner_confirmation_status !== 'OWNER_CONFIRMED') {
            return <span className="px-2.5 py-0.5 bg-blue-50 text-blue-700 rounded-full font-bold text-[11px] border border-blue-200">✓ Staff Confirmed · Awaiting Owner</span>;
        }
        switch (status) {
            case 'CONFIRMED_MATCH':
                return <span className="px-2.5 py-0.5 bg-green-100 text-green-700 rounded-full font-bold text-[11px] border border-green-200">✓ Confirmed Match</span>;
            case 'NOT_A_MATCH':
                return <span className="px-2.5 py-0.5 bg-red-100 text-red-700 rounded-full font-bold text-[11px] border border-red-200">✕ Not a Match</span>;
            case 'UNABLE_TO_VERIFY':
                return <span className="px-2.5 py-0.5 bg-amber-100 text-amber-800 rounded-full font-bold text-[11px] border border-amber-200">? Unable to Verify</span>;
            case 'COVERED_BY_CASE':
                return <span className="px-2.5 py-0.5 bg-green-50 text-green-700 rounded-full font-bold text-[11px] border border-green-200">✓ Covered by case</span>;
            case 'SUPERSEDED_BY_CASE':
                return <span className="px-2.5 py-0.5 bg-gray-100 text-gray-600 rounded-full font-bold text-[11px] border border-gray-200">Superseded</span>;
            case 'AI_SUGGESTED':
            default:
                return <span className="px-2.5 py-0.5 bg-role-muted text-role rounded-full font-bold text-[11px] border border-role-border">AI Suggested</span>;
        }
    };

    return (
        <div className="space-y-4">
            {/* Header & Filter Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-gray-100 shadow-xs">
                <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-role-muted text-role flex items-center justify-center font-black text-sm">
                        AI
                    </div>
                    <div>
                        <h3 className="text-sm font-extrabold text-gray-900 tracking-tight flex items-center gap-2">
                            AI Potential Matches
                            <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded-full text-xs font-bold">
                                {matches.length}
                            </span>
                        </h3>
                        <p className="text-xs text-gray-500 font-medium">
                            Automated visual and description-based comparisons for human review
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    {/* Status Filters */}
                    <div className="flex bg-gray-100 p-1 rounded-xl text-xs font-bold text-gray-600">
                        {['ALL', 'AI_SUGGESTED', 'CONFIRMED_MATCH', 'NOT_A_MATCH'].map((st) => (
                            <button
                                key={st}
                                onClick={() => setStatusFilter(st)}
                                className={`px-2.5 py-1 rounded-lg transition-all ${statusFilter === st ? 'bg-white text-gray-900 shadow-xs' : 'hover:text-gray-900'}`}
                            >
                                {st === 'ALL' ? 'All' : st === 'AI_SUGGESTED' ? 'Suggested' : st === 'CONFIRMED_MATCH' ? 'Confirmed' : 'Rejected'}
                            </button>
                        ))}
                    </div>

                    {isStaff && !readOnly && (
                        <button
                            onClick={handleScan}
                            disabled={isScanning}
                            className="px-3 py-1.5 bg-role hover:bg-role-hover text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                        >
                            <svg className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            {isScanning ? 'Scanning...' : 'Scan AI Matches'}
                        </button>
                    )}
                </div>
            </div>

            {/* Match Category Switcher (Registered Pets vs Duplicate Stray Sightings) */}
            <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-2xl border border-gray-200/70">
                <button
                    onClick={() => setMatchType('pets')}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                        matchType === 'pets'
                            ? 'bg-white text-gray-900 shadow-sm border border-gray-200/60'
                            : 'text-gray-500 hover:text-gray-900'
                    }`}
                >
                    <span>🐾</span>
                    <span>Registered Pet Look-Alikes</span>
                </button>
                <button
                    onClick={() => setMatchType('duplicates')}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                        matchType === 'duplicates'
                            ? 'bg-gradient-to-r from-amber-500 to-role text-white shadow-sm'
                            : 'text-gray-500 hover:text-gray-900'
                    }`}
                >
                    <span>⚠️</span>
                    <span>Suspected Duplicate Sightings (Report ↔ Report)</span>
                </button>
            </div>

            {/* Content List */}
            {loading || isScanning ? (
                <div className="space-y-4">
                    {/* AI Scanning / Buffering Indicator */}
                    <div className="relative overflow-hidden bg-gradient-to-b from-white via-white to-gray-50/70 rounded-3xl border border-gray-200/80 p-6 md:p-8 shadow-xs text-center">
                        {/* Ambient decorative glowing backdrops */}
                        <div
                            className={`absolute -top-16 -left-16 w-48 h-48 rounded-full blur-3xl opacity-30 pointer-events-none ${
                                matchType === 'duplicates' ? 'bg-amber-400' : 'bg-role'
                            }`}
                        />
                        <div
                            className={`absolute -bottom-16 -right-16 w-48 h-48 rounded-full blur-3xl opacity-30 pointer-events-none ${
                                matchType === 'duplicates' ? 'bg-orange-400' : 'bg-emerald-400'
                            }`}
                        />

                        {/* Top Live Badge */}
                        <div className="flex justify-center mb-5">
                            <div
                                className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-extrabold tracking-wide uppercase border shadow-xs transition-colors ${
                                    matchType === 'duplicates'
                                        ? 'bg-amber-50 text-amber-800 border-amber-200/80'
                                        : 'bg-role-muted text-role border-role-border'
                                }`}
                            >
                                <span className="relative flex h-2 w-2">
                                    <span
                                        className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                                            matchType === 'duplicates' ? 'bg-amber-500' : 'bg-role'
                                        }`}
                                    />
                                    <span
                                        className={`relative inline-flex rounded-full h-2 w-2 ${
                                            matchType === 'duplicates' ? 'bg-amber-600' : 'bg-role'
                                        }`}
                                    />
                                </span>
                                <span>
                                    {matchType === 'duplicates'
                                        ? 'AI Duplicate Sighting Detector'
                                        : 'AI Potential Matches Scanner'}
                                </span>
                            </div>
                        </div>

                        {/* Central Radar Pulse Animation */}
                        <div className="relative w-28 h-28 mx-auto mb-5 flex items-center justify-center">
                            {/* Expanding Pulse Ring 1 */}
                            <div
                                className={`absolute inset-0 rounded-full border-2 animate-ping opacity-25 pointer-events-none ${
                                    matchType === 'duplicates' ? 'border-amber-500' : 'border-role'
                                }`}
                                style={{ animationDuration: '2.4s' }}
                            />

                            {/* Rotating Dashed Outer Ring */}
                            <div
                                className={`absolute inset-1 rounded-full border-2 border-dashed animate-spin pointer-events-none ${
                                    matchType === 'duplicates' ? 'border-amber-400/60' : 'border-role/40'
                                }`}
                                style={{ animationDuration: '9s' }}
                            />

                            {/* Inner Pulsing Radar Glow */}
                            <div
                                className={`absolute inset-3 rounded-full animate-pulse opacity-50 ${
                                    matchType === 'duplicates'
                                        ? 'bg-gradient-to-tr from-amber-200 to-orange-100'
                                        : 'bg-gradient-to-tr from-role-soft to-emerald-100'
                                }`}
                            />

                            {/* Center Icon Orb */}
                            <div
                                className={`relative w-14 h-14 rounded-2xl shadow-md flex items-center justify-center text-white transition-all transform hover:scale-105 ${
                                    matchType === 'duplicates'
                                        ? 'bg-gradient-to-br from-amber-500 to-orange-600 shadow-amber-500/20'
                                        : 'bg-gradient-to-br from-role to-emerald-600 shadow-role/25'
                                }`}
                            >
                                {matchType === 'duplicates' ? (
                                    <Layers className="w-7 h-7 text-white animate-pulse" />
                                ) : (
                                    <PawPrint className="w-7 h-7 text-white animate-pulse" />
                                )}

                                {/* Small Sparkle Badge on Orb */}
                                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-white shadow-xs flex items-center justify-center">
                                    <Sparkles
                                        className={`w-3 h-3 ${
                                            matchType === 'duplicates' ? 'text-amber-500' : 'text-role'
                                        } animate-spin`}
                                        style={{ animationDuration: '4s' }}
                                    />
                                </span>
                            </div>
                        </div>

                        {/* Title & Subtitle */}
                        <div className="max-w-md mx-auto space-y-1.5 mb-6">
                            <h4 className="text-sm md:text-base font-extrabold text-gray-900 tracking-tight flex items-center justify-center gap-2">
                                {matchType === 'duplicates' ? (
                                    <>
                                        <span>Scanning for Suspected Duplicate Reports</span>
                                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                                    </>
                                ) : (
                                    <>
                                        <span>Scanning Queue for Potential Pet Matches</span>
                                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-role animate-ping" />
                                    </>
                                )}
                            </h4>
                            <p className="text-xs text-gray-500 font-medium leading-relaxed">
                                {matchType === 'duplicates'
                                    ? 'Cross-referencing geographic coordinates, incident time clusters, and visual markers across active stray reports.'
                                    : 'Analyzing stray photo visual embeddings, breed characteristics, and coat patterns against registered community pets.'}
                            </p>
                        </div>

                        {/* Step-by-Step Processing Pipeline */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 max-w-xl mx-auto mb-2 text-left">
                            {scanSteps.map((step, idx) => {
                                const isActive = idx === scanStep;
                                const isDone = idx < scanStep;
                                return (
                                    <div
                                        key={step}
                                        className={`px-3 py-2.5 rounded-xl border text-xs font-semibold transition-all duration-300 flex items-center gap-2.5 ${
                                            isActive
                                                ? matchType === 'duplicates'
                                                    ? 'bg-amber-50/90 border-amber-300 text-amber-900 shadow-xs'
                                                    : 'bg-role-soft border-role-border text-role-strong shadow-xs'
                                                : isDone
                                                ? 'bg-gray-50/90 border-gray-200 text-gray-700'
                                                : 'bg-white/60 border-gray-150 text-gray-400'
                                        }`}
                                    >
                                        <div className="flex-shrink-0">
                                            {isDone ? (
                                                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                            ) : isActive ? (
                                                <RefreshCw
                                                    className={`w-4 h-4 animate-spin ${
                                                        matchType === 'duplicates' ? 'text-amber-600' : 'text-role'
                                                    }`}
                                                />
                                            ) : (
                                                <div className="w-4 h-4 rounded-full border border-gray-300 flex items-center justify-center text-[10px] text-gray-400 font-bold">
                                                    {idx + 1}
                                                </div>
                                            )}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate text-[11px] leading-tight font-bold">{step}</div>
                                            <div className="text-[10px] opacity-75 font-medium">
                                                {isActive ? 'Processing...' : isDone ? 'Verified' : 'Queued'}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Shimmer Skeleton Cards Preview */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 opacity-75 pointer-events-none">
                        {[1, 2].map((i) => (
                            <div
                                key={i}
                                className="bg-white rounded-2xl border border-gray-200/80 p-4 space-y-3 animate-pulse shadow-2xs"
                            >
                                <div className="flex items-center justify-between">
                                    <div className="h-4 w-28 bg-gray-200 rounded-full" />
                                    <div className="h-5 w-24 bg-gray-200 rounded-full" />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="aspect-square bg-gray-200 rounded-xl" />
                                    <div className="aspect-square bg-gray-200 rounded-xl" />
                                </div>
                                <div className="space-y-1.5 pt-1">
                                    <div className="h-3 w-3/4 bg-gray-200 rounded-full" />
                                    <div className="h-3 w-1/2 bg-gray-200 rounded-full" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : matches.length === 0 ? (
                <div className="p-8 text-center bg-white rounded-2xl border border-gray-100 space-y-3">
                    <div className="w-12 h-12 rounded-full bg-role-soft text-role flex items-center justify-center mx-auto text-lg font-bold">
                        ✓
                    </div>
                    <div>
                        <h4 className="text-xs font-bold text-gray-800">
                            {matchType === 'duplicates' ? 'No Suspected Duplicate Reports' : 'No Potential Matches in Queue'}
                        </h4>
                        <p className="text-xs text-gray-500 max-w-sm mx-auto font-medium mt-0.5">
                            {matchType === 'duplicates'
                                ? 'The AI has not detected suspected duplicate sightings matching this report in the area.'
                                : "The AI hasn't detected eligible unreviewed registered pet matches for this criteria."}
                        </p>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {matches.map((m) => {
                        const isPet = !!m.matched_pet;
                        const bullets: string[] = m.ai_evidence?.key_evidence_bullets || [];
                        const srcImg = m.source_report?.media?.[0]?.file_url || DEFAULT_AVATAR;
                        const tgtImg = isPet
                            ? (m.matched_pet?.photo_url || DEFAULT_AVATAR)
                            : (m.matched_report?.media?.[0]?.file_url || DEFAULT_AVATAR);
                        const ownerRejected = isPet && m.owner_confirmation_status === 'OWNER_REJECTED';
                        const ownerConfirmed = isPet && m.owner_confirmation_status === 'OWNER_CONFIRMED';
                        const isCommunityAnimal = isPet && !m.matched_pet?.owner_id;

                        return (
                            <div
                                key={m.match_id}
                                className="bg-white border border-gray-200/80 rounded-2xl p-5 shadow-xs hover:shadow-md transition-all space-y-4 flex flex-col justify-between"
                            >
                                <div className="space-y-3">
                                    {/* Card Header */}
                                    <div className="flex items-center justify-between flex-wrap gap-2 border-b border-gray-100 pb-2.5">
                                        <div className="flex items-center gap-2">
                                            <span className="px-2.5 py-0.5 bg-gradient-to-r from-role to-amber-500 text-white font-extrabold text-xs rounded-full shadow-2xs">
                                                {m.similarity_score}% Similarity
                                            </span>
                                            {getStatusPill(m.status, m)}
                                            {ownerRejected && (
                                                <span className="px-2.5 py-0.5 bg-red-50 border border-red-200 text-red-700 rounded-full font-bold text-[11px]">
                                                    ✕ Owner Rejected
                                                </span>
                                            )}
                                            {ownerConfirmed && (
                                                <span className="px-2.5 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-full font-bold text-[11px]">
                                                    ✓ Owner Confirmed
                                                </span>
                                            )}
                                        </div>
                                        <span className="text-[11px] font-semibold text-gray-400">
                                            {new Date(m.created_at).toLocaleDateString()}
                                        </span>
                                    </div>

                                    {/* Reports Title */}
                                    <div className="flex flex-col gap-1">
                                        <h4 className="text-xs font-extrabold text-gray-900 flex items-center gap-2 flex-wrap">
                                            <span className="bg-gray-100 px-2 py-0.5 rounded text-gray-700">Report #{m.source_report_id}</span>
                                            <span className="text-role font-black">↔</span>
                                            {isPet ? (
                                                <button
                                                    type="button"
                                                    onClick={() => handleOpenPetDetail(m.matched_pet)}
                                                    className="bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 px-2 py-0.5 rounded flex items-center gap-1.5 transition-all cursor-pointer group"
                                                    title="Click to view full registered animal record"
                                                >
                                                    <span className="flex flex-col items-start leading-tight">
                                                        <span>Registered Pet: {petName(m.matched_pet) || 'Registered pet'}</span>
                                                        {petDescription(m.matched_pet) && (
                                                            <span className="text-[10px] font-semibold text-amber-700">{petDescription(m.matched_pet)}</span>
                                                        )}
                                                    </span>
                                                    <span className="text-amber-600 font-bold group-hover:translate-x-0.5 transition-transform text-[10px]">↗</span>
                                                </button>
                                            ) : (
                                                <span className="bg-amber-100 border border-amber-300 text-amber-950 px-2 py-0.5 rounded font-bold">
                                                    Candidate Report #{m.matched_report_id}
                                                </span>
                                            )}
                                        </h4>
                                        {isPet ? (
                                            <div className="flex items-center gap-2 text-[10px] text-gray-500 font-semibold flex-wrap">
                                                <button
                                                    type="button"
                                                    onClick={() => handleOpenPetDetail(m.matched_pet)}
                                                    className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-800 cursor-pointer font-bold"
                                                >
                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                                    Active Registration ↗
                                                </button>
                                                <span>•</span>
                                                <span>{m.matched_pet?.breed || m.matched_pet?.pet_type}</span>
                                                {m.matched_pet?.owner?.name && (
                                                    <>
                                                        <span>•</span>
                                                        <span>Owner: {m.matched_pet.owner.name}</span>
                                                    </>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2 text-[10px] text-gray-500 font-semibold flex-wrap">
                                                <span className="text-amber-700 font-extrabold flex items-center gap-1">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                                    Suspected Duplicate Stray
                                                </span>
                                                {m.matched_report?.landmark && (
                                                    <>
                                                        <span>•</span>
                                                        <span>{m.matched_report.landmark}</span>
                                                    </>
                                                )}
                                                {m.matched_report?.reporter?.name && (
                                                    <>
                                                        <span>•</span>
                                                        <span>Reporter: {m.matched_report.reporter.name}</span>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* Thumbnails Comparison */}
                                    <div className="grid grid-cols-2 gap-2 bg-gray-50 p-2 rounded-xl">
                                        <div className="h-28 rounded-lg overflow-hidden bg-gray-200 relative border border-gray-100">
                                            <img
                                                src={srcImg}
                                                alt="Source Sighting"
                                                className="w-full h-full object-cover"
                                                onError={(e: any) => { e.target.src = DEFAULT_AVATAR; }}
                                            />
                                            <span className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-black/60 text-white text-[9px] font-bold rounded">
                                                Sighting Photo
                                            </span>
                                        </div>
                                        <div className="h-28 rounded-lg overflow-hidden bg-gray-200 relative border border-gray-100">
                                            <img
                                                src={tgtImg}
                                                alt={isPet ? "Registered Pet" : "Candidate Sighting"}
                                                className="w-full h-full object-cover"
                                                onError={(e: any) => { e.target.src = DEFAULT_AVATAR; }}
                                            />
                                            <span className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-amber-600/90 text-white text-[9px] font-bold rounded">
                                                {isPet ? "Registered Pet Photo" : "Candidate Photo"}
                                            </span>
                                        </div>
                                    </div>

                                    {/* AI Evidence Bullets */}
                                    <div className="space-y-1.5">
                                        <span className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider block">
                                            AI Matched Indicators
                                        </span>
                                        <ul className="space-y-1">
                                            {bullets.slice(0, 3).map((bullet, idx) => (
                                                <li key={idx} className="text-xs text-gray-600 flex items-start gap-1.5">
                                                    <span className="text-emerald-500 font-bold text-xs mt-0.5">✓</span>
                                                    <span className="leading-tight">{bullet}</span>
                                                </li>
                                            ))}
                                            {bullets.length > 3 && (
                                                <li className="text-[11px] text-gray-400 italic">
                                                    +{bullets.length - 3} more heuristic indicators
                                                </li>
                                            )}
                                        </ul>
                                    </div>

                                    {/* Owner Rejection Indicator */}
                                    {ownerRejected && (
                                        <div className="p-3 bg-red-50 border border-red-200 rounded-xl space-y-1">
                                            <p className="text-xs font-extrabold text-red-700 flex items-center gap-1.5">
                                                <span>✕</span>
                                                <span>{m.matched_pet?.owner?.name || 'The owner'} said this is not their pet</span>
                                            </p>
                                            {m.owner_notes && (
                                                <p className="text-[11px] text-red-600 font-medium leading-snug">"{m.owner_notes}"</p>
                                            )}
                                            <p className="text-[10px] text-red-500 font-semibold">
                                                Not linked to the pet record. Treat it as a new animal — use "Add Record for this Animal" on Report #{m.source_report_id}.
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {m.via_case_report_id && m.case_identity_disputed && (
                                    <div className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-300 text-[11px] text-amber-900 font-medium">
                                        ⚖️ <strong>Identity disputed by the owner – under review.</strong> The confirmation on Report #{m.via_case_report_id} is not applied to this report until staff decide.
                                    </div>
                                )}
                                {m.via_case_report_id && !m.case_identity_disputed && (
                                    <div className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-900 font-medium flex items-start gap-1.5">
                                        <span>✓</span>
                                        <span>
                                            This pet's identity was already confirmed by the owner and authorized staff through <strong>Report #{m.via_case_report_id}</strong>
                                            {m.reviewer?.name ? ` (${m.reviewer.name}` : ''}
                                            {m.verified_at ? `${m.reviewer?.name ? ', ' : ' ('}${new Date(m.verified_at).toLocaleDateString()})` : (m.reviewer?.name ? ')' : '')}.
                                            This report belongs to the same consolidated case. No additional owner confirmation is required.
                                        </span>
                                    </div>
                                )}
                                {m.status === 'COVERED_BY_CASE' && (
                                    <div className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-900 font-medium flex items-start gap-1.5">
                                        <span>✓</span>
                                        <span>
                                            Covered by the case's confirmed Match #{m.covered_by_match_id}
                                            {(() => {
                                                const via = matches.find((x: any) => x.match_id === m.covered_by_match_id);
                                                const rid = via?.via_case_report_id || via?.source_report_id;
                                                return rid ? ` on Report #${rid}` : '';
                                            })()}. No separate decision is needed.
                                        </span>
                                    </div>
                                )}
                                {m.status === 'SUPERSEDED_BY_CASE' && (
                                    <div className="px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-[11px] text-gray-700 font-medium flex items-start gap-1.5">
                                        <span>⤳</span>
                                        <span>{m.verification_notes || `Superseded: the case is confirmed as another pet (Match #${m.covered_by_match_id}).`}</span>
                                    </div>
                                )}
                                {m.identity_lock_reason && (
                                    <div className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 font-medium flex items-start gap-1.5">
                                        <span>🔒</span>
                                        <span>{m.identity_lock_reason}</span>
                                    </div>
                                )}
                                {/* Review Action Button */}
                                <button
                                    onClick={() => setActiveMatch(m)}
                                    className={`w-full py-2.5 font-bold text-xs rounded-xl transition-all shadow-xs flex items-center justify-center gap-1.5 mt-2 ${
                                        m.status === 'CONFIRMED_MATCH' && ownerRejected
                                            ? 'bg-rose-700 text-white border border-rose-800 opacity-90'
                                            : m.status === 'CONFIRMED_MATCH'
                                            ? 'bg-emerald-800 text-white shadow-emerald-800/20 opacity-80'
                                            : m.status === 'NOT_A_MATCH'
                                            ? 'bg-red-800 text-white border border-red-900 opacity-80'
                                            : m.status === 'UNABLE_TO_VERIFY'
                                            ? 'bg-amber-800 text-white border border-amber-900 opacity-80'
                                            : m.status === 'COVERED_BY_CASE'
                                            ? 'bg-emerald-700 text-white opacity-80'
                                            : m.status === 'SUPERSEDED_BY_CASE'
                                            ? 'bg-gray-200 text-gray-600 border border-gray-300'
                                            : m.identity_lock_reason
                                            ? 'bg-gray-200 text-gray-600 border border-gray-300'
                                            : 'bg-gradient-to-r from-role to-role hover:from-role-hover hover:to-role-strong text-white'
                                    }`}
                                >
                                    {m.status === 'CONFIRMED_MATCH' ? (
                                        <>
                                            <span className="text-sm">✓</span>
                                            <span>
                                                {!isPet
                                                    ? 'Marked as Duplicate'
                                                    : ownerConfirmed || isCommunityAnimal
                                                    ? 'Confirmed & Linked to Pet Record'
                                                    : ownerRejected
                                                    ? 'Staff Confirmed — Owner Rejected'
                                                    : 'Staff Confirmed — Awaiting Owner'}
                                            </span>
                                        </>
                                    ) : m.status === 'COVERED_BY_CASE' ? (
                                        <>
                                            <span>✓</span>
                                            <span>Covered by Case Confirmation</span>
                                        </>
                                    ) : m.status === 'SUPERSEDED_BY_CASE' ? (
                                        <>
                                            <span>⤳</span>
                                            <span>Superseded (View)</span>
                                        </>
                                    ) : m.status === 'NOT_A_MATCH' ? (
                                        <>
                                            <span>✕</span>
                                            <span>{ownerRejected ? 'Not a Match — Rejected by Owner' : 'Marked Not a Match'}</span>
                                        </>
                                    ) : m.status === 'UNABLE_TO_VERIFY' ? (
                                        <>
                                            <span>?</span>
                                            <span>Marked Unable to Verify</span>
                                        </>
                                    ) : (
                                        <>
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                            </svg>
                                            <span>{m.identity_lock_reason ? 'View (Locked)' : 'Review Match'}</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Review Modal */}
            {activeMatch && (
                <AIMatchReviewModal
                    isOpen={!!activeMatch}
                    onClose={() => setActiveMatch(null)}
                    match={activeMatch}
                    isStaff={isStaff}
                    readOnly={readOnly || !!activeMatch.via_case_report_id || activeMatch.status === 'COVERED_BY_CASE' || activeMatch.status === 'SUPERSEDED_BY_CASE'}
                    readOnlyReason={
                        activeMatch.via_case_report_id
                            ? `This confirmation was made on Report #${activeMatch.via_case_report_id} of the same case. Open that report to change it.`
                            : activeMatch.status === 'COVERED_BY_CASE'
                                ? `Covered by the case's confirmed Match #${activeMatch.covered_by_match_id}. No separate decision is needed.`
                                : activeMatch.status === 'SUPERSEDED_BY_CASE'
                                    ? `Superseded: the case is confirmed as another pet (Match #${activeMatch.covered_by_match_id}). It reopens automatically if that confirmation changes.`
                                    : undefined
                    }
                    onVerified={() => {
                        fetchMatches();
                        if (onMatchesUpdated) onMatchesUpdated();
                    }}
                    onMerged={() => {
                        fetchMatches();
                        if (onMatchesUpdated) onMatchesUpdated();
                    }}
                />
            )}

            {/* Nested Pet Details Modal / Fullscreen on Mobile */}
            {selectedPetRecord && (
                <div className="fixed inset-0 z-[150] flex items-center justify-center p-0 sm:p-6 md:p-10 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="w-full h-full sm:h-auto sm:max-h-[90vh] max-w-6xl rounded-none sm:rounded-[2.5rem] shadow-2xl animate-in zoom-in-95 duration-200 bg-[#FAFAF9] overflow-hidden flex flex-col border-none sm:border sm:border-gray-100">
                        <PetDetailPanel
                            pet={selectedPetRecord}
                            onClose={() => setSelectedPetRecord(null)}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default AIPotentialMatchesList;
