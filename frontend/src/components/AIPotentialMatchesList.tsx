import React, { useState, useEffect } from 'react';
import axios from 'axios';
import AIMatchReviewModal from './Modals/AIMatchReviewModal';
import { DEFAULT_AVATAR } from '../utils/avatar';

interface AIPotentialMatchesListProps {
    subdivisionId?: number;
    reportId?: number;
    petId?: number;
    isStaff?: boolean;
    onMatchesUpdated?: () => void;
}

const AIPotentialMatchesList: React.FC<AIPotentialMatchesListProps> = ({
    subdivisionId,
    reportId,
    petId,
    isStaff = true,
    onMatchesUpdated
}) => {
    const [matches, setMatches] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeMatch, setActiveMatch] = useState<any | null>(null);
    const [statusFilter, setStatusFilter] = useState<string>('ALL');
    const [isScanning, setIsScanning] = useState(false);

    const fetchMatches = async () => {
        setLoading(true);
        try {
            const params: any = {};
            if (subdivisionId) params.subdivision_id = subdivisionId;
            if (reportId) params.report_id = reportId;
            if (petId) params.pet_id = petId;
            if (statusFilter !== 'ALL') params.status_filter = statusFilter;

            const res = await axios.get('http://localhost:8000/matches/', { params });
            setMatches(Array.isArray(res.data) ? res.data : []);
        } catch (err) {
            console.error('Error loading AI matches:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchMatches();
    }, [subdivisionId, reportId, petId, statusFilter]);

    const handleScan = async () => {
        setIsScanning(true);
        try {
            if (reportId) {
                await axios.post(`http://localhost:8000/matches/scan/${reportId}`);
            } else {
                await axios.post('http://localhost:8000/matches/scan-all');
            }
            await fetchMatches();
            if (onMatchesUpdated) onMatchesUpdated();
        } catch (err) {
            console.error('Error running AI scan:', err);
        } finally {
            setIsScanning(false);
        }
    };

    const getStatusPill = (status: string) => {
        switch (status) {
            case 'CONFIRMED_MATCH':
                return <span className="px-2.5 py-0.5 bg-green-100 text-green-700 rounded-full font-bold text-[11px] border border-green-200">✓ Confirmed Match</span>;
            case 'NOT_A_MATCH':
                return <span className="px-2.5 py-0.5 bg-red-100 text-red-700 rounded-full font-bold text-[11px] border border-red-200">✕ Not a Match</span>;
            case 'UNABLE_TO_VERIFY':
                return <span className="px-2.5 py-0.5 bg-amber-100 text-amber-800 rounded-full font-bold text-[11px] border border-amber-200">? Unable to Verify</span>;
            case 'AI_SUGGESTED':
            default:
                return <span className="px-2.5 py-0.5 bg-orange-100 text-[#F97316] rounded-full font-bold text-[11px] border border-orange-200">AI Suggested</span>;
        }
    };

    return (
        <div className="space-y-4">
            {/* Header & Filter Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-gray-100 shadow-xs">
                <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-orange-100 text-[#F97316] flex items-center justify-center font-black text-sm">
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

                    {isStaff && (
                        <button
                            onClick={handleScan}
                            disabled={isScanning}
                            className="px-3 py-1.5 bg-[#F97316] hover:bg-[#ea580c] text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                        >
                            <svg className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            {isScanning ? 'Scanning...' : 'Scan AI Matches'}
                        </button>
                    )}
                </div>
            </div>

            {/* Content List */}
            {loading ? (
                <div className="p-8 text-center bg-white rounded-2xl border border-gray-100 text-xs font-semibold text-gray-400">
                    Evaluating potential matches...
                </div>
            ) : matches.length === 0 ? (
                <div className="p-8 text-center bg-white rounded-2xl border border-gray-100 space-y-3">
                    <div className="w-12 h-12 rounded-full bg-orange-50 text-[#F97316] flex items-center justify-center mx-auto text-lg font-bold">
                        ✓
                    </div>
                    <div>
                        <h4 className="text-xs font-bold text-gray-800">No Potential Matches in Queue</h4>
                        <p className="text-xs text-gray-500 max-w-sm mx-auto font-medium mt-0.5">
                            The AI hasn't detected eligible unreviewed registered pet matches for this criteria.
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

                        return (
                            <div
                                key={m.match_id}
                                className="bg-white border border-gray-200/80 rounded-2xl p-5 shadow-xs hover:shadow-md transition-all space-y-4 flex flex-col justify-between"
                            >
                                <div className="space-y-3">
                                    {/* Card Header */}
                                    <div className="flex items-center justify-between flex-wrap gap-2 border-b border-gray-100 pb-2.5">
                                        <div className="flex items-center gap-2">
                                            <span className="px-2.5 py-0.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-extrabold text-xs rounded-full shadow-2xs">
                                                {m.similarity_score}% Similarity
                                            </span>
                                            {getStatusPill(m.status)}
                                        </div>
                                        <span className="text-[11px] font-semibold text-gray-400">
                                            {new Date(m.created_at).toLocaleDateString()}
                                        </span>
                                    </div>

                                    {/* Reports Title */}
                                    <div className="flex flex-col gap-1">
                                        <h4 className="text-xs font-extrabold text-gray-900 flex items-center gap-2 flex-wrap">
                                            <span className="bg-gray-100 px-2 py-0.5 rounded text-gray-700">Report #{m.source_report_id}</span>
                                            <span className="text-[#F97316] font-black">↔</span>
                                            <span className="bg-amber-50 border border-amber-200 text-amber-900 px-2 py-0.5 rounded">
                                                Registered Pet: {m.matched_pet?.pet_name || `Pet #${m.matched_pet_id}`}
                                            </span>
                                        </h4>
                                        {isPet && (
                                            <div className="flex items-center gap-2 text-[10px] text-gray-500 font-semibold">
                                                <span className="inline-flex items-center gap-1 text-emerald-600">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                                    Active Registration
                                                </span>
                                                <span>•</span>
                                                <span>{m.matched_pet?.breed || m.matched_pet?.pet_type}</span>
                                                {m.matched_pet?.owner?.name && (
                                                    <>
                                                        <span>•</span>
                                                        <span>Owner: {m.matched_pet.owner.name}</span>
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
                                                alt="Registered Pet"
                                                className="w-full h-full object-cover"
                                                onError={(e: any) => { e.target.src = DEFAULT_AVATAR; }}
                                            />
                                            <span className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-amber-600/90 text-white text-[9px] font-bold rounded">
                                                Registered Pet Photo
                                            </span>
                                        </div>
                                    </div>

                                    {/* AI Evidence Bullets */}
                                    <div className="space-y-1.5">
                                        <span className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider block">
                                            AI Evidence Points:
                                        </span>
                                        <ul className="space-y-1">
                                            {bullets.slice(0, 3).map((b, i) => (
                                                <li key={i} className="text-xs text-gray-700 font-medium flex items-start gap-1.5">
                                                    <span className="text-emerald-500 font-bold shrink-0">✓</span>
                                                    <span className="line-clamp-1">{b}</span>
                                                </li>
                                            ))}
                                            {bullets.length > 3 && (
                                                <li className="text-[11px] text-[#F97316] font-semibold">
                                                    +{bullets.length - 3} more matching attributes
                                                </li>
                                            )}
                                        </ul>
                                    </div>
                                </div>

                                {/* Review Action Button */}
                                <button
                                    onClick={() => setActiveMatch(m)}
                                    className="w-full py-2.5 bg-gradient-to-r from-orange-500 to-[#F97316] hover:from-orange-600 hover:to-orange-700 text-white font-bold text-xs rounded-xl transition-all shadow-xs flex items-center justify-center gap-1.5 mt-2"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                    </svg>
                                    Review Match
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
                    onVerified={() => {
                        fetchMatches();
                        if (onMatchesUpdated) onMatchesUpdated();
                    }}
                />
            )}
        </div>
    );
};

export default AIPotentialMatchesList;
