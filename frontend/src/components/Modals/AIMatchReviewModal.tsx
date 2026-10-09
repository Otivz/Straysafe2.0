import React, { useState } from 'react';
import { X } from 'lucide-react';
import { api } from '../../utils/api';
import { DEFAULT_AVATAR } from '../../utils/avatar';
import AddPetModal from '../PetRecords/AddPetModal';
import PetDetailPanel from '../PetRecords/PetDetailPanel';
import { type PetRecord, mapRawPetToPetRecord } from '../PetRecords/types';
import ReportChatDrawer from '../Chat/ReportChatDrawer';
import ReportDescription from '../../components/ReportDescription';
import { petDescription, petName } from '../../utils/petName';
import MediaLightbox, { type LightboxItem } from '../MediaLightbox';
import { StaffOwnerVerification } from '../OwnerVerificationBlocks';
import { SeparateIncidentOverride } from '../SeparateIncidentOverride';

interface AIMatchReviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    match: any;
    onVerified?: (updatedMatch: any) => void;
    onMerged?: (updatedReport: any) => void; // no longer called: Matched now merges server-side and onVerified refreshes the page
    isStaff?: boolean; // true for leader, brgy, admin; false for resident
    readOnly?: boolean; // staff who may only view (e.g. Barangay while the Subdivision Leader handles the case)
    readOnlyReason?: string; // why it is view-only, shown instead of the default note
}

const getStatusBadge = (status: string, match?: any) => {
    // Pet matches are official only after both staff and the owner confirm
    if (status === 'CONFIRMED_MATCH' && match?.matched_pet_id && match.matched_pet?.owner_id && match.owner_confirmation_status !== 'OWNER_CONFIRMED') {
        return <span className="px-3 py-1 bg-blue-100 border border-blue-300 text-blue-800 rounded-full font-bold text-xs flex items-center gap-1.5 shadow-sm"><span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>Staff Confirmed · Awaiting Owner</span>;
    }
    switch (status) {
        case 'CONFIRMED_MATCH':
            return <span className="px-3 py-1 bg-green-100 border border-green-300 text-green-800 rounded-full font-bold text-xs flex items-center gap-1.5 shadow-sm"><span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>Confirmed Match</span>;
        case 'NOT_A_MATCH':
            return <span className="px-3 py-1 bg-red-100 border border-red-300 text-red-700 rounded-full font-bold text-xs flex items-center gap-1.5 shadow-sm"><span className="w-2 h-2 rounded-full bg-red-500"></span>Not a Match</span>;
        case 'UNABLE_TO_VERIFY':
            return <span className="px-3 py-1 bg-amber-100 border border-amber-300 text-amber-800 rounded-full font-bold text-xs flex items-center gap-1.5 shadow-sm"><span className="w-2 h-2 rounded-full bg-amber-500"></span>Unable to Verify</span>;
        case 'COVERED_BY_CASE':
            return <span className="px-3 py-1 bg-green-50 border border-green-300 text-green-800 rounded-full font-bold text-xs flex items-center gap-1.5 shadow-sm"><span className="w-2 h-2 rounded-full bg-green-500"></span>Covered by Case Confirmation</span>;
        case 'SUPERSEDED_BY_CASE':
            return <span className="px-3 py-1 bg-gray-100 border border-gray-300 text-gray-700 rounded-full font-bold text-xs flex items-center gap-1.5 shadow-sm"><span className="w-2 h-2 rounded-full bg-gray-400"></span>Superseded by Case</span>;
        case 'PENDING_VERIFICATION':
            return <span className="px-3 py-1 bg-blue-100 border border-blue-300 text-blue-800 rounded-full font-bold text-xs flex items-center gap-1.5 shadow-sm"><span className="w-2 h-2 rounded-full bg-blue-500"></span>Pending Verification</span>;
        case 'AI_SUGGESTED':
        default:
            return <span className="px-3 py-1 bg-role-muted border border-role-border text-role-strong rounded-full font-bold text-xs flex items-center gap-1.5 shadow-sm"><span className="w-2 h-2 rounded-full bg-role"></span>AI Suggested Match</span>;
    }
};

const getOwnerFeedbackBadge = (status: string) => {
    switch (status) {
        case 'OWNER_CONFIRMED':
            return <span className="px-2.5 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-full text-xs font-semibold">✓ Owner Confirmed</span>;
        case 'OWNER_REJECTED':
            return <span className="px-2.5 py-0.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-full text-xs font-semibold">✕ Owner Reported Not Their Pet</span>;
        case 'NO_RESPONSE':
        case 'PENDING':
        default:
            return <span className="px-2.5 py-0.5 bg-gray-100 border border-gray-200 text-gray-600 rounded-full text-xs font-semibold">• Owner Did Not Respond (Pending)</span>;
    }
};

const AIMatchReviewModal: React.FC<AIMatchReviewModalProps> = ({
    isOpen,
    onClose,
    match,
    onVerified,
    isStaff = true,
    readOnly = false,
    readOnlyReason
}) => {
    const [selectedDecision, setSelectedDecision] = useState<'CONFIRMED_MATCH' | 'NOT_A_MATCH' | 'UNABLE_TO_VERIFY' | null>(null);
    const [verificationNotes, setVerificationNotes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState('');
    const [activeTab, setActiveTab] = useState<'comparison' | 'audit'>('comparison');
    const [isAddPetModalOpen, setIsAddPetModalOpen] = useState(false);
    const [isUnlinking, setIsUnlinking] = useState(false);
    const [showReverse, setShowReverse] = useState(false);
    const [lightbox, setLightbox] = useState<{ items: LightboxItem[]; index: number; title: string } | null>(null);
    const [reverseNotes, setReverseNotes] = useState('');
    const [isReversing, setIsReversing] = useState(false);
    const [reverseError, setReverseError] = useState('');
    // Report-to-report Matched: what the server says confirming will do (join / combine / already one case)
    const [casePreview, setCasePreview] = useState<{ effect: string; main_report_id: number; report_ids: number[]; message: string; blocked_reason: string | null } | null>(null);
    const [isLoadingPreview, setIsLoadingPreview] = useState(false);
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [copiedOwnerMsg, setCopiedOwnerMsg] = useState(false);
    const [selectedPetRecord, setSelectedPetRecord] = useState<PetRecord | null>(null);
    const [isLoadingPetRecord, setIsLoadingPetRecord] = useState(false);

    // Resident feedback state
    const [ownerRemarks, setOwnerRemarks] = useState('');
    const [isSubmittingOwnerFeedback, setIsSubmittingOwnerFeedback] = useState(false);

    const userStr = localStorage.getItem('resident_user') || localStorage.getItem('staff_user') || localStorage.getItem('admin_user') || sessionStorage.getItem('staff_user');
    const currentUser = userStr ? JSON.parse(userStr) : null;

    const handleOpenPetDetail = async (petData: any) => {
        if (!petData) return;
        setIsLoadingPetRecord(true);
        try {
            const petId = petData.pet_id || petData.id;
            if (petId) {
                const res = await api.get(`/pets/${petId}`);
                setSelectedPetRecord(mapRawPetToPetRecord(res.data));
            } else {
                setSelectedPetRecord(mapRawPetToPetRecord(petData));
            }
        } catch (e) {
            console.error("Failed to fetch detailed pet info, using fallback data:", e);
            setSelectedPetRecord(mapRawPetToPetRecord(petData));
        } finally {
            setIsLoadingPetRecord(false);
        }
    };

    if (!isOpen || !match) return null;

    const source = match.source_report;
    const targetReport = match.matched_report;
    const targetPet = match.matched_pet;
    const isPetMatch = !!targetPet;
    const identityLock: string | null = match?.identity_lock_reason || null;

    const sourceImage = source?.media?.[0]?.file_url || '/placeholder-pet.png';
    const targetImage = isPetMatch
        ? (targetPet.photo_url || '/placeholder-pet.png')
        : (targetReport?.media?.[0]?.file_url || '/placeholder-pet.png');

    // Every photo/video of each side, for the full-screen viewer (documents are left out)
    const reportMediaItems = (rep: any): LightboxItem[] =>
        (rep?.media || [])
            .filter((m: any) => m?.file_url && (m.media_type === 'Image' || m.media_type === 'Video' || !m.media_type))
            .map((m: any, i: number) => ({ url: m.file_url, type: m.media_type || 'Image', caption: m.media_type === 'Video' ? `Video ${i + 1}` : `Photo ${i + 1}` }));
    const petMediaItems = (pet: any): LightboxItem[] =>
        ([['photo_url', 'Main photo'], ['photo_front_url', 'Front'], ['photo_left_url', 'Left side'], ['photo_right_url', 'Right side']] as const)
            .filter(([k]) => pet?.[k])
            .filter(([k], i, arr) => arr.findIndex(([k2]) => pet[k2] === pet[k]) === i)
            .map(([k, caption]) => ({ url: pet[k], type: 'Image', caption }));
    const sourceItems = reportMediaItems(source);
    const targetItems = isPetMatch ? petMediaItems(targetPet) : reportMediaItems(targetReport);
    const openLightbox = (items: LightboxItem[], title: string) => {
        if (items.length) setLightbox({ items, index: 0, title });
    };

    const evidence = match.ai_evidence || {};
    const bullets: string[] = evidence.key_evidence_bullets || [];

    const handleVerifySubmit = async () => {
        if (!selectedDecision) return;
        if (!verificationNotes.trim() || verificationNotes.trim().length < minNotes) {
            setSubmitError('Please enter a brief verification explanation for your decision.');
            return;
        }

        setIsSubmitting(true);
        setSubmitError('');

        try {
            const res = await api.post(
                `/matches/${match.match_id}/verify`,
                {
                    decision: selectedDecision,
                    notes: verificationNotes.trim(),
                    source_report_id: match.source_report_id,
                    matched_pet_id: match.matched_pet_id,
                    matched_report_id: match.matched_report_id
                }
            );

            if (onVerified) {
                onVerified(res.data);
            }
            setSelectedDecision(null);
            setVerificationNotes('');
            onClose();
        } catch (err: any) {
            console.error('Verification error:', err);
            // If 404, check if match was rescanned and retry with active match ID
            if (err?.response?.status === 404 && match.source_report_id) {
                try {
                    const fallbackRes = await api.get(`/matches/report/${match.source_report_id}`);
                    const activeList = Array.isArray(fallbackRes.data) ? fallbackRes.data : [];
                    const freshMatch = activeList.find((m: any) => 
                        (match.matched_pet_id && m.matched_pet_id === match.matched_pet_id) ||
                        (match.matched_report_id && m.matched_report_id === match.matched_report_id)
                    );
                    if (freshMatch && freshMatch.match_id && freshMatch.match_id !== match.match_id) {
                        const retryRes = await api.post(
                            `/matches/${freshMatch.match_id}/verify`,
                            {
                                decision: selectedDecision,
                                notes: verificationNotes.trim(),
                                source_report_id: freshMatch.source_report_id,
                                matched_pet_id: freshMatch.matched_pet_id,
                                matched_report_id: freshMatch.matched_report_id
                            }
                        );
                        if (onVerified) onVerified(retryRes.data);
                        setSelectedDecision(null);
                        setVerificationNotes('');
                        onClose();
                        return;
                    }
                } catch (retryErr) {
                    console.error('Retry after 404 failed:', retryErr);
                }
            }
            setSubmitError(err.response?.data?.detail || 'Failed to submit verification decision. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    // A case is the first-filed report plus the reports merged into it; both sides already in one case means nothing to merge.
    const caseOf = (r: any, fallbackId?: number) => r?.duplicate_of_report_id || r?.report_id || fallbackId;
    const alreadySameCase = !isPetMatch && !!match.matched_report_id && caseOf(source, match.source_report_id) === caseOf(targetReport, match.matched_report_id);
    const isReportPairConfirm = !isPetMatch && selectedDecision === 'CONFIRMED_MATCH';
    const minNotes = isReportPairConfirm ? 5 : 3;

    const openReportMatchConfirm = async () => {
        setSelectedDecision('CONFIRMED_MATCH');
        setVerificationNotes(`AI confirmed duplicate stray sighting (${match.similarity_score}% visual/attribute match). Same animal.`);
        setSubmitError('');
        setCasePreview(null);
        setIsLoadingPreview(true);
        try {
            const res = await api.get(`/matches/${match.match_id}/case-preview`);
            setCasePreview(res.data);
        } catch (err: any) {
            setSubmitError(err.response?.data?.detail || 'Could not check which case these reports belong to.');
        } finally {
            setIsLoadingPreview(false);
        }
    };

    const isCommunityAnimal = isPetMatch && !targetPet?.owner_id;
    const isDisputed = isPetMatch && (match.owner_confirmation_status === 'OWNER_REJECTED' || match.status === 'NOT_A_MATCH');

    const handleUnlinkAndAddNew = async () => {
        setIsUnlinking(true);
        setSubmitError('');
        try {
            const res = await api.post(`/matches/${match.match_id}/unlink-pet`);
            if (onVerified) onVerified(res.data);
            setIsAddPetModalOpen(true);
        } catch (err: any) {
            console.error('Unlink error:', err);
            setSubmitError(err.response?.data?.detail || 'Failed to unlink the potential pet. Please try again.');
        } finally {
            setIsUnlinking(false);
        }
    };

    const handleReverseDecision = async () => {
        setIsReversing(true);
        setReverseError('');
        try {
            const res = await api.post(`/matches/${match.match_id}/reverse`, { notes: reverseNotes.trim() });
            if (onVerified) onVerified(res.data);
            setShowReverse(false);
            setReverseNotes('');
            onClose();
        } catch (err: any) {
            setReverseError(err.response?.data?.detail || 'Could not reverse this decision. Please try again.');
        } finally {
            setIsReversing(false);
        }
    };

    const handleOwnerFeedback = async (decision: 'OWNER_CONFIRMED' | 'OWNER_REJECTED') => {
        setIsSubmittingOwnerFeedback(true);
        try {
            const res = await api.post(
                `/matches/${match.match_id}/owner-feedback`,
                {
                    owner_confirmation: decision,
                    remarks: ownerRemarks.trim() || undefined,
                    // reopening a staff "Not a Match" needs the owner's own reason
                    second_review_reason: match.status === 'NOT_A_MATCH' ? ownerRemarks.trim() || undefined : undefined
                }
            );
            if (onVerified) {
                onVerified(res.data);
            }
            onClose();
        } catch (err: any) {
            console.error('Owner feedback error:', err);
            alert(err.response?.data?.detail || 'Could not save your answer. Please try again.');
        } finally {
            setIsSubmittingOwnerFeedback(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
            <div className="bg-white rounded-none sm:rounded-3xl shadow-2xl border-none sm:border sm:border-gray-100 w-full h-full sm:h-auto max-w-5xl sm:my-8 overflow-hidden flex flex-col sm:max-h-[92vh]">
                
                {/* ── Modal Header ── */}
                <div className="px-8 py-5 border-b border-gray-100 bg-gradient-to-r from-role-soft/50 via-white to-amber-50/50 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                        <div className="w-12 h-12 rounded-2xl bg-role-muted text-role flex items-center justify-center font-black text-xl shadow-inner">
                            AI
                        </div>
                        <div>
                            <div className="flex items-center gap-2.5 flex-wrap">
                                <h2 className="text-xl font-black text-gray-900 tracking-tight">
                                    {isPetMatch ? "Potential Match Review" : "⚠️ Suspected Duplicate Sighting Review"}
                                </h2>
                                <span className="px-3 py-1 bg-gradient-to-r from-role to-amber-500 text-white font-extrabold text-xs rounded-full shadow-sm">
                                    {match.similarity_score}% Similarity
                                </span>
                                {getStatusBadge(match.status, match)}
                            </div>
                            <p className="text-xs font-semibold text-gray-500 mt-0.5">
                                Match #{match.match_id} • Report #{match.source_report_id} ↔ {isPetMatch ? `Pet '${petName(targetPet)}'` : `Report #${match.matched_report_id}`}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 ml-auto">
                        <div className="flex bg-gray-100 p-1 rounded-xl text-xs font-bold text-gray-600">
                            <button
                                onClick={() => setActiveTab('comparison')}
                                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${activeTab === 'comparison' ? 'bg-white text-gray-900 shadow-sm' : 'hover:text-gray-900'}`}
                            >
                                Side-by-Side
                            </button>
                            <button
                                onClick={() => setActiveTab('audit')}
                                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${activeTab === 'audit' ? 'bg-white text-gray-900 shadow-sm' : 'hover:text-gray-900'}`}
                            >
                                Verification Log
                            </button>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="w-9 h-9 rounded-xl bg-gray-100 hover:bg-rose-50 text-gray-400 hover:text-rose-600 flex items-center justify-center transition-colors cursor-pointer shrink-0 border border-transparent hover:border-rose-200"
                            aria-label="Close modal"
                            title="Close"
                        >
                            <X className="w-5 h-5 stroke-[2.5]" />
                        </button>
                    </div>
                </div>

                {/* ── Modal Body ── */}
                <div className="p-8 overflow-y-auto space-y-6 flex-1">
                    
                    {activeTab === 'comparison' ? (
                        <>
                            {/* ── AI Evidence & Biometric Visual Comparison Banner ── */}
                            <div className="bg-gradient-to-r from-amber-500/10 via-role/10 to-transparent border border-role-border/80 rounded-2xl p-5 space-y-4 shadow-xs">
                                <div className="flex items-start gap-3.5">
                                    <div className="w-10 h-10 rounded-2xl bg-role text-white flex items-center justify-center text-lg font-black shadow-md shadow-role/20 shrink-0">
                                        ⚡
                                    </div>
                                    <div className="space-y-2.5 flex-1">
                                        <div className="flex items-center justify-between flex-wrap gap-2">
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-xs font-black text-gray-900 uppercase tracking-wider">
                                                    AI Visual Comparison (suggestion only)
                                                </h3>
                                                {evidence.visual_comparison?.final_assessment && (
                                                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                                        ['POTENTIAL MATCH', 'STRONG MATCH'].includes(evidence.visual_comparison.final_assessment)
                                                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                                            : 'bg-rose-100 text-rose-800 border border-rose-300'
                                                    }`}>
                                                        {evidence.visual_comparison.final_assessment}
                                                    </span>
                                                )}
                                            </div>
                                            {isPetMatch && getOwnerFeedbackBadge(match.owner_confirmation_status)}
                                        </div>

                                        <div className="bg-white/80 backdrop-blur-xs p-3.5 rounded-xl border border-role-muted text-xs text-gray-700 leading-relaxed">
                                            <strong className="text-gray-900 block font-bold mb-1">
                                                AI Visual Comparison Assessment:
                                            </strong>
                                            {evidence.visual_comparison?.reason || match.ai_explanation || "AI model compared facial shape, ear posture, coat patterns, markings, and physical traits."}
                                        </div>
                                        
                                        {/* Structured Biometric Feature Evaluation Badges */}
                                        {evidence.visual_comparison && (
                                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                                                {[
                                                    { label: 'Face Structure', val: evidence.visual_comparison.face_structure },
                                                    { label: 'Ear Structure', val: evidence.visual_comparison.ear_structure },
                                                    { label: 'Coat Pattern', val: evidence.visual_comparison.coat_pattern },
                                                    { label: 'Facial Markings', val: evidence.visual_comparison.facial_markings },
                                                    { label: 'Body Structure', val: evidence.visual_comparison.body_structure },
                                                    { label: 'Distinctive Marks', val: evidence.visual_comparison.distinctive_markings }
                                                ].map((item, idx) => {
                                                    const isPos = ['Similar', 'Highly Similar', 'Somewhat Similar'].includes(item.val);
                                                    const isNeg = item.val === 'Different';
                                                    return (
                                                        <div
                                                            key={idx}
                                                            className={`p-2 rounded-xl border text-xs flex flex-col justify-between ${
                                                                isPos
                                                                    ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                                                                    : isNeg
                                                                    ? 'bg-rose-50/70 border-rose-200 text-rose-950'
                                                                    : 'bg-gray-50 border-gray-200 text-gray-700'
                                                            }`}
                                                        >
                                                            <span className="text-[10px] font-bold text-gray-500 uppercase">{item.label}</span>
                                                            <span className="font-extrabold flex items-center gap-1 mt-0.5">
                                                                <span className={isPos ? 'text-emerald-600' : isNeg ? 'text-rose-600' : 'text-gray-400'}>
                                                                    {isPos ? '✓' : isNeg ? '✕' : '•'}
                                                                </span>
                                                                {item.val || 'Evaluated'}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        {/* Visual Contradictions & Corroborations */}
                                        {evidence.visual_comparison?.visual_contradictions && evidence.visual_comparison.visual_contradictions.length > 0 && (
                                            <div className="space-y-1 pt-1">
                                                <span className="text-[11px] font-black text-rose-700 uppercase tracking-wide block">
                                                    ⚠️ Visual Differences Flagged:
                                                </span>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {evidence.visual_comparison.visual_contradictions.map((contra: string, ci: number) => (
                                                        <span key={ci} className="px-2.5 py-1 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs font-medium">
                                                            ✕ {contra}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Closest Attribute Comparison Pills */}
                                        {evidence.closest_attributes && evidence.closest_attributes.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5 pt-1">
                                                {evidence.closest_attributes.map((attr: any, i: number) => (
                                                    <span key={i} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border shadow-2xs ${
                                                        attr.is_match
                                                            ? 'bg-emerald-50 text-emerald-950 border-emerald-300'
                                                            : 'bg-rose-50 text-rose-950 border-rose-300'
                                                    }`}>
                                                        <span className={attr.is_match ? 'text-emerald-600 font-black' : 'text-rose-600 font-black'}>
                                                            {attr.is_match ? '✓' : '✕'}
                                                        </span>
                                                        <span className="text-gray-500">{attr.attribute}:</span>
                                                        <span className="font-black text-gray-900">{attr.match_status || attr.source_value}</span>
                                                    </span>
                                                ))}
                                            </div>
                                        )}

                                        {/* Evidence Badges */}
                                        {bullets.length > 0 && (
                                            <div className="flex flex-wrap gap-2 pt-1">
                                                {bullets.map((b, i) => (
                                                    <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-amber-200/90 text-amber-900 rounded-lg text-xs font-semibold shadow-2xs">
                                                        <span className="text-emerald-500 font-bold">✓</span> {b}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* ── Callout: Look-Alike Owned Pet OR Duplicate Stray Sighting ── */}
                            {isPetMatch ? (() => {
                                const isOwner = isPetMatch && currentUser?.user_id && (targetPet?.owner_id === currentUser.user_id || targetPet?.owner?.user_id === currentUser.user_id);
                                // Owner without a StraySafe account (recorded on a Returned to Owner outcome): in-app chat can't reach them
                                const hasOwnerAccount = Boolean(targetPet?.owner_id || targetPet?.owner?.user_id);
                                const offlineName: string = targetPet?.emergency_contact_name || '';
                                const offlinePhone: string = targetPet?.emergency_contact_phone || '';
                                const offlineAddress: string = targetPet?.registered_address || '';
                                const ownerName = targetPet?.owner?.name || (isOwner ? "You" : (offlineName || "the owner (no StraySafe account)"));
                                const petLabel = targetPet ? petName(targetPet) : "this pet";
                                const reportRef = `Report #${source?.report_id || match.source_report_id}`;
                                const smsBody = `Hello${offlineName ? ` ${offlineName}` : ''}, this is ${currentUser?.name || 'the subdivision office'} from StraySafe. `
                                    + `An animal that looks like your pet ${petLabel} (${match.similarity_score}% similar) was reported${source?.landmark ? ` near ${source.landmark}` : ''} (${reportRef}). `
                                    + `Please check if your pet is home, and reply or call us to confirm.`;
                                const telHref = offlinePhone ? `tel:${offlinePhone.replace(/[^\d+]/g, '')}` : '';
                                const smsHref = offlinePhone ? `sms:${offlinePhone.replace(/[^\d+]/g, '')}?body=${encodeURIComponent(smsBody)}` : '';

                                const noKnownOwner = !offlineName && !offlinePhone && !offlineAddress;
                                if (!isOwner && !hasOwnerAccount && noKnownOwner) {
                                    // Community / unassigned animal record: there is nobody to contact
                                    return (
                                        <div className="bg-gradient-to-r from-amber-50/90 via-role-soft/40 to-white border border-amber-200/80 rounded-2xl p-4.5 flex items-start gap-3.5 shadow-xs" data-testid="no-known-owner">
                                            <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center text-lg font-black shrink-0">🐾</div>
                                            <div className="space-y-1">
                                                <h4 className="text-xs font-black text-amber-950 uppercase tracking-wide flex items-center gap-2 flex-wrap">
                                                    <span>Look-Alike Animal Record Detected</span>
                                                    <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full text-[10px] font-extrabold lowercase">no known owner</span>
                                                </h4>
                                                <p className="text-xs text-gray-600 font-medium leading-relaxed">
                                                    This sighting has a {match.similarity_score}% similarity with animal record {targetPet?.pet_id ? `P-${String(targetPet.pet_id).padStart(5, '0')}` : ''}
                                                    {petLabel !== 'this pet' ? ` ('${petLabel}')` : ''}. That record is a community / unassigned animal with no owner on file, so there is
                                                    no one to message. If it is the same animal, confirm the match so the sighting is added to that animal's record.
                                                </p>
                                            </div>
                                        </div>
                                    );
                                }

                                if (!isOwner && !hasOwnerAccount) {
                                    return (
                                        <div className="bg-gradient-to-r from-sky-50/90 via-blue-50/40 to-white border border-sky-200/80 rounded-2xl p-4.5 space-y-3 shadow-xs" data-testid="offline-owner-contact">
                                            <div className="flex items-start gap-3.5">
                                                <div className="w-10 h-10 rounded-2xl bg-sky-600 text-white flex items-center justify-center text-lg font-black shadow-md shadow-sky-500/20 shrink-0">
                                                    📞
                                                </div>
                                                <div className="space-y-0.5 min-w-0">
                                                    <h4 className="text-xs font-black text-sky-950 uppercase tracking-wide flex items-center gap-2 flex-wrap">
                                                        <span>Look-Alike Registered Pet Detected</span>
                                                        <span className="px-2 py-0.5 bg-sky-100 text-sky-800 rounded-full text-[10px] font-extrabold lowercase">
                                                            owner has no account
                                                        </span>
                                                    </h4>
                                                    <p className="text-xs text-gray-600 font-medium leading-relaxed">
                                                        This sighting has a {match.similarity_score}% similarity with {petLabel === 'this pet' ? 'a registered pet' : `registered pet '${petLabel}'`}
                                                        {offlineName ? <> owned by <strong>{offlineName}</strong></> : null}. The owner has no StraySafe account, so they
                                                        can't be messaged in the app. Contact them directly so they can check their pet.
                                                    </p>
                                                </div>
                                            </div>

                                            {isStaff ? (
                                                <>
                                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                                                        <div className="p-2.5 bg-white rounded-xl border border-sky-100">
                                                            <span className="block text-[9px] font-black text-gray-400 uppercase tracking-wider">Owner</span>
                                                            <span className="font-bold text-gray-900">{offlineName || 'Not recorded'}</span>
                                                        </div>
                                                        <div className="p-2.5 bg-white rounded-xl border border-sky-100">
                                                            <span className="block text-[9px] font-black text-gray-400 uppercase tracking-wider">Phone</span>
                                                            <span className="font-bold text-gray-900">{offlinePhone || 'Not recorded'}</span>
                                                        </div>
                                                        <div className="p-2.5 bg-white rounded-xl border border-sky-100">
                                                            <span className="block text-[9px] font-black text-gray-400 uppercase tracking-wider">Address</span>
                                                            <span className="font-bold text-gray-900">{offlineAddress || 'Not recorded'}</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-wrap gap-2">
                                                        {offlinePhone ? (
                                                            <>
                                                                <a href={telHref} className="px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded-xl shadow-sm flex items-center gap-2">
                                                                    📞 Call {offlineName || 'Owner'}
                                                                </a>
                                                                <a href={smsHref} className="px-4 py-2.5 bg-white hover:bg-sky-50 text-sky-800 border border-sky-300 font-bold text-xs rounded-xl flex items-center gap-2">
                                                                    💬 Send SMS
                                                                </a>
                                                            </>
                                                        ) : null}
                                                        <button
                                                            type="button"
                                                            onClick={() => { navigator.clipboard?.writeText(smsBody).then(() => setCopiedOwnerMsg(true)).catch(() => {}); setTimeout(() => setCopiedOwnerMsg(false), 2000); }}
                                                            className="px-4 py-2.5 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 font-bold text-xs rounded-xl flex items-center gap-2 cursor-pointer"
                                                        >
                                                            📋 {copiedOwnerMsg ? 'Message copied' : 'Copy message (Messenger / Viber)'}
                                                        </button>
                                                    </div>
                                                    {!offlinePhone && (
                                                        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                                                            No phone number on record.{offlineAddress ? ` Visit the owner at ${offlineAddress}` : ' Ask the barangay office'} or send the copied message through another channel.
                                                        </p>
                                                    )}
                                                </>
                                            ) : (
                                                <p className="text-[11px] text-sky-900 bg-white border border-sky-100 rounded-xl px-3 py-2">
                                                    The subdivision / barangay office will contact the owner directly.
                                                </p>
                                            )}
                                        </div>
                                    );
                                }

                                return (
                                    <div className="bg-gradient-to-r from-blue-50/90 via-indigo-50/40 to-white border border-blue-200/80 rounded-2xl p-4.5 flex flex-wrap items-center justify-between gap-4 shadow-xs">
                                        <div className="flex items-start gap-3.5 flex-1 min-w-[280px]">
                                            <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center text-lg font-black shadow-md shadow-blue-500/20 shrink-0">
                                                💬
                                            </div>
                                            <div className="space-y-0.5">
                                                <h4 className="text-xs font-black text-blue-950 uppercase tracking-wide flex items-center gap-2">
                                                    <span>{isOwner ? "Look-Alike Pet Sighting" : "Look-Alike Registered Pet Detected"}</span>
                                                    <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-[10px] font-extrabold lowercase">
                                                        {isOwner ? "direct confirmation" : "message owner"}
                                                    </span>
                                                </h4>
                                                <p className="text-xs text-gray-600 font-medium leading-relaxed">
                                                    {isOwner ? (
                                                        `Does this sighting resemble your registered pet '${petLabel}'? You can message the original reporter or subdivision case handler directly to ask questions, request more photos, or verify identifying marks for yourself.`
                                                    ) : (
                                                        `This sighting has a ${match.similarity_score}% similarity with registered pet '${petLabel}' owned by ${ownerName}. Message the registered pet owner directly so they can check their pet and confirm for themselves.`
                                                    )}
                                                </p>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setIsChatOpen(true)}
                                            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-xs rounded-xl transition-all shadow-sm flex items-center gap-2 cursor-pointer whitespace-nowrap"
                                        >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                            </svg>
                                            {isOwner ? "Message Reporter / Officer" : `Message Owner (${ownerName})`}
                                        </button>
                                    </div>
                                );
                            })() : (
                                <div className="bg-gradient-to-r from-amber-50/90 via-role-soft/40 to-white border border-amber-200/80 rounded-2xl p-4.5 flex flex-wrap items-center justify-between gap-4 shadow-xs">
                                    <div className="flex items-start gap-3.5 flex-1 min-w-[280px]">
                                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500 to-role-hover text-white flex items-center justify-center text-lg font-black shadow-md shadow-amber-500/20 shrink-0">
                                            ⚠️
                                        </div>
                                        <div className="space-y-0.5">
                                            <h4 className="text-xs font-black text-amber-950 uppercase tracking-wide flex items-center gap-2">
                                                <span>Suspected Duplicate Stray Sighting</span>
                                                <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full text-[10px] font-extrabold lowercase">
                                                    Report ↔ Report
                                                </span>
                                            </h4>
                                            <p className="text-xs text-gray-600 font-medium leading-relaxed">
                                                AI detected that Report #{match.source_report_id} and Report #{match.matched_report_id} share {match.similarity_score}% appearance similarity in the same vicinity. Review the photos, landmarks, and descriptions below. If they are the same animal, confirm and merge them into a single active case.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ── Side-by-Side Comparison Columns ── */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                
                                {/* ── LEFT: Source Report ── */}
                                <div className="border border-gray-200 rounded-2xl p-5 bg-white shadow-xs space-y-4">
                                    <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                                        <span className="px-3 py-1 bg-role-muted text-role font-bold text-xs rounded-full">
                                            Report #{source?.report_id || match.source_report_id} (Original Sighting)
                                        </span>
                                        <span className="text-xs text-gray-500 font-medium">
                                            {source?.category?.category_name || "Stray Report"}
                                        </span>
                                    </div>

                                    {/* Image */}
                                    <div
                                        onClick={() => openLightbox(sourceItems, `Report #${source?.report_id || match.source_report_id} · Original sighting`)}
                                        className={`w-full h-56 bg-gray-100 rounded-xl overflow-hidden relative border border-gray-100 group ${sourceItems.length ? 'cursor-zoom-in' : ''}`}
                                        title={sourceItems.length ? 'Click to view full screen' : undefined}
                                    >
                                        <img
                                            src={sourceImage}
                                            alt="Source Animal"
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                            onError={(e: any) => { e.target.src = DEFAULT_AVATAR; }}
                                        />
                                        <span className="absolute bottom-2 left-2 px-2.5 py-1 bg-black/60 backdrop-blur-md text-white text-[11px] font-semibold rounded-md">
                                            Original Photo{sourceItems.length > 1 ? ` · ${sourceItems.length} photos` : ''}
                                        </span>
                                        {sourceItems.length > 0 && (
                                            <span className="absolute top-2 right-2 px-2 py-1 bg-black/60 backdrop-blur-md text-white text-[11px] font-semibold rounded-md opacity-80 group-hover:opacity-100">
                                                ⤢ Full screen
                                            </span>
                                        )}
                                    </div>

                                    {/* Report Details */}
                                    <div className="grid grid-cols-2 gap-3 text-xs">
                                        <div className="bg-gray-50 p-2.5 rounded-xl">
                                            <span className="text-gray-400 font-semibold block uppercase text-[10px]">Species</span>
                                            <span className="font-bold text-gray-800">{source?.animal_type || source?.ai_animal_type || "Unknown"}</span>
                                        </div>
                                        <div className="bg-gray-50 p-2.5 rounded-xl">
                                            <span className="text-gray-400 font-semibold block uppercase text-[10px]">Breed</span>
                                            <span className="font-bold text-gray-800">{source?.animal_breed || source?.ai_possible_breed || "Aspin / Mixed"}</span>
                                        </div>
                                        <div className="bg-gray-50 p-2.5 rounded-xl">
                                            <span className="text-gray-400 font-semibold block uppercase text-[10px]">Color</span>
                                            <span className="font-bold text-gray-800">{source?.animal_color || source?.ai_dominant_color || "Not specified"}</span>
                                        </div>
                                        <div className="bg-gray-50 p-2.5 rounded-xl">
                                            <span className="text-gray-400 font-semibold block uppercase text-[10px]">Size</span>
                                            <span className="font-bold text-gray-800">{source?.estimated_size || source?.ai_estimated_size || "Medium"}</span>
                                        </div>
                                    </div>

                                    <div className="bg-gray-50 p-3 rounded-xl text-xs space-y-1">
                                        <span className="text-gray-400 font-semibold block uppercase text-[10px]">Location & Landmark</span>
                                        <p className="font-medium text-gray-800">{source?.landmark || "Selera Homes Subdivision"}</p>
                                    </div>

                                    <div className="bg-gray-50 p-3 rounded-xl text-xs space-y-1">
                                        <span className="text-gray-400 font-semibold block uppercase text-[10px]">Description & Marks</span>
                                        <ReportDescription description={source?.description} emptyText="No description provided." />
                                    </div>
                                </div>

                                {/* ── RIGHT: Matching Candidate ── */}
                                <div className="border border-gray-200 rounded-2xl p-5 bg-white shadow-xs space-y-4">
                                    <div className="flex items-center justify-between border-b border-gray-100 pb-3 flex-wrap gap-2">
                                        <div className="flex items-center gap-2">
                                            <span className="px-3 py-1 bg-amber-100 text-amber-800 font-bold text-xs rounded-full">
                                                {isPetMatch ? `Registered Pet: ${petName(targetPet)}` : `Report #${targetReport?.report_id}`} (Candidate)
                                                {isPetMatch && petDescription(targetPet) && (
                                                    <span className="block text-[10px] font-semibold text-amber-700">{petDescription(targetPet)}</span>
                                                )}
                                            </span>
                                            {isPetMatch && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleOpenPetDetail(targetPet)}
                                                    disabled={isLoadingPetRecord}
                                                    className="px-2.5 py-1 bg-gradient-to-r from-amber-600 to-[#B35D25] hover:from-amber-700 hover:to-[#964E1F] text-white rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm hover:shadow transition-all cursor-pointer shrink-0"
                                                >
                                                    {isLoadingPetRecord ? (
                                                        <span className="animate-spin text-xs">⏳</span>
                                                    ) : (
                                                        <span>🐾 View Record</span>
                                                    )}
                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                                    </svg>
                                                </button>
                                            )}
                                        </div>
                                        <span className="text-xs text-gray-500 font-medium">
                                            {isPetMatch ? `Owner: ${targetPet?.owner?.name || "Registered Resident"}` : (targetReport?.category?.category_name || "Sighting")}
                                        </span>
                                    </div>

                                    {/* Image */}
                                    <div 
                                        onClick={() => isPetMatch
                                            ? handleOpenPetDetail(targetPet)
                                            : openLightbox(targetItems, `Report #${targetReport?.report_id} · Candidate sighting`)}
                                        className={`w-full h-56 bg-gray-100 rounded-xl overflow-hidden relative border border-gray-100 group ${isPetMatch ? 'cursor-pointer' : targetItems.length ? 'cursor-zoom-in' : ''}`}
                                        title={!isPetMatch && targetItems.length ? 'Click to view full screen' : undefined}
                                    >
                                        {targetItems.length > 0 && (
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    openLightbox(targetItems, isPetMatch ? `${petName(targetPet)} · Registered pet` : `Report #${targetReport?.report_id} · Candidate sighting`);
                                                }}
                                                className="absolute top-2 right-2 z-10 px-2 py-1 bg-black/60 hover:bg-black/80 backdrop-blur-md text-white text-[11px] font-semibold rounded-md cursor-zoom-in"
                                                title="View full screen"
                                            >
                                                ⤢ Full screen{targetItems.length > 1 ? ` · ${targetItems.length}` : ''}
                                            </button>
                                        )}
                                        <img
                                            src={targetImage}
                                            alt="Candidate Animal"
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                            onError={(e: any) => { e.target.src = DEFAULT_AVATAR; }}
                                        />
                                        <span className="absolute bottom-2 left-2 px-2.5 py-1 bg-black/60 backdrop-blur-md text-white text-[11px] font-semibold rounded-md flex items-center gap-1.5">
                                            <span>Candidate Profile</span>
                                            {isPetMatch && <span className="text-[10px] text-amber-300 font-bold">• Click to view modal ↗</span>}
                                        </span>
                                        {isPetMatch && (
                                            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                                                <span className="px-3.5 py-1.5 bg-white/95 text-gray-900 font-black text-xs rounded-xl shadow-lg flex items-center gap-2">
                                                    <span>🐾 View Registered Animal Record</span>
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                                    </svg>
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Details */}
                                    <div className="grid grid-cols-2 gap-3 text-xs">
                                        <div className="bg-gray-50 p-2.5 rounded-xl">
                                            <span className="text-gray-400 font-semibold block uppercase text-[10px]">Species</span>
                                            <span className="font-bold text-gray-800">{isPetMatch ? targetPet?.pet_type : (targetReport?.animal_type || "Unknown")}</span>
                                        </div>
                                        <div className="bg-gray-50 p-2.5 rounded-xl">
                                            <span className="text-gray-400 font-semibold block uppercase text-[10px]">Breed</span>
                                            <span className="font-bold text-gray-800">{isPetMatch ? (targetPet?.breed || "Purebred") : (targetReport?.animal_breed || "Aspin / Mixed")}</span>
                                        </div>
                                        <div className="bg-gray-50 p-2.5 rounded-xl">
                                            <span className="text-gray-400 font-semibold block uppercase text-[10px]">Color</span>
                                            <span className="font-bold text-gray-800">{isPetMatch ? `${targetPet?.primary_color || ''} ${targetPet?.secondary_color || ''}` : (targetReport?.animal_color || "Not specified")}</span>
                                        </div>
                                        <div className="bg-gray-50 p-2.5 rounded-xl">
                                            <span className="text-gray-400 font-semibold block uppercase text-[10px]">Size</span>
                                            <span className="font-bold text-gray-800">{isPetMatch ? targetPet?.size_category : (targetReport?.estimated_size || "Medium")}</span>
                                        </div>
                                    </div>

                                    <div className="bg-gray-50 p-3 rounded-xl text-xs space-y-1">
                                        <span className="text-gray-400 font-semibold block uppercase text-[10px]">Registered / Sighting Address</span>
                                        <p className="font-medium text-gray-800">
                                            {isPetMatch ? (targetPet?.registered_address || "Registered in Selera Homes") : (targetReport?.landmark || "Reported Location")}
                                        </p>
                                    </div>

                                    <div className="bg-gray-50 p-3 rounded-xl text-xs space-y-1">
                                        <span className="text-gray-400 font-semibold block uppercase text-[10px]">Distinctive Markings</span>
                                        {isPetMatch ? (
                                            <p className="font-normal text-gray-700 italic">"{targetPet?.distinctive_markings || targetPet?.color_markings || "None noted"}"</p>
                                        ) : (
                                            <ReportDescription description={targetReport?.description} emptyText="No description provided." />
                                        )}
                                    </div>

                                    {isPetMatch && (
                                        <button
                                            type="button"
                                            onClick={() => handleOpenPetDetail(targetPet)}
                                            disabled={isLoadingPetRecord}
                                            className="w-full py-2.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shadow-2xs"
                                        >
                                            <span>🐾 Open Full Animal Record (Medical, Owner, QR)</span>
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                            </svg>
                                        </button>
                                    )}
                                </div>
                            </div>
                        </>
                    ) : (
                        /* ── Audit Trail Tab ── */
                        <div className="space-y-4">
                            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5">
                                <h3 className="text-sm font-extrabold text-gray-900 uppercase tracking-wider mb-4">
                                    Verification Decision History
                                </h3>
                                {match.verified_at ? (
                                    <div className="border-l-2 border-role pl-4 py-1 space-y-2">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-bold text-gray-900">{match.reviewer?.name || "Official Reviewer"}</span>
                                            <span className="px-2 py-0.5 bg-gray-200 text-gray-700 rounded text-[10px] font-bold uppercase">{match.reviewer_role || "Staff"}</span>
                                            <span className="text-xs text-gray-400">• {new Date(match.verified_at).toLocaleString()}</span>
                                        </div>
                                        <div className="text-xs text-gray-700">
                                            <strong>Status Applied:</strong> {getStatusBadge(match.status, match)}
                                        </div>
                                        <div className="text-xs text-gray-600 bg-white p-3 rounded-xl border border-gray-100">
                                            <span className="font-semibold block text-gray-800 mb-1">Verification Rationale / Notes:</span>
                                            "{match.verification_notes}"
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-xs text-gray-500 italic">No human verification action recorded yet. Match is currently under AI recommendation status.</p>
                                )}
                            </div>

                            {/* Owner Response Audit */}
                            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5">
                                <h3 className="text-sm font-extrabold text-gray-900 uppercase tracking-wider mb-3">
                                    Pet Owner Supporting Evidence
                                </h3>
                                <div className="text-xs space-y-2">
                                    <div className="flex items-center gap-2">
                                        <span className="font-semibold text-gray-700">Response Status:</span>
                                        {getOwnerFeedbackBadge(match.owner_confirmation_status)}
                                    </div>
                                    {match.owner_notes && (
                                        <div className="bg-white p-3 rounded-xl border border-gray-100 text-gray-600">
                                            <span className="font-semibold block text-gray-800 mb-1">Owner Remarks:</span>
                                            "{match.owner_notes}"
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Modal Footer: Verification Actions ── */}
                <div className="px-8 py-5 border-t border-gray-100 bg-gray-50 flex flex-col gap-4">
                    {submitError && (
                        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl font-medium">
                            {submitError}
                        </div>
                    )}

                    {/* Staff Decision Controls */}
                    {isStaff && readOnly ? (
                        <div className="px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-xs font-semibold text-gray-600">
                            👁 {readOnlyReason || 'View only. The Subdivision Leader reviews this match; the Barangay can act once the case is escalated to it.'}
                        </div>
                    ) : isStaff ? (
                        <div>
                            {isPetMatch ? (
                                <div className="flex flex-col gap-3">
                                    {match.status && match.status !== 'AI_SUGGESTED' && (
                                        <div className="px-4 py-2.5 rounded-xl bg-gray-100 border border-gray-200 text-xs text-gray-700 flex items-center justify-between">
                                            <span className="font-semibold">Current Review Decision:</span>
                                            <div className="flex items-center gap-2">
                                                {getStatusBadge(match.status, match)}
                                                {match.verified_at && (
                                                    <span className="text-[11px] text-gray-500">
                                                        by {match.reviewer?.name || 'Staff'} ({match.reviewer_role || 'Official'})
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                    <div className="px-4 py-2.5 rounded-xl bg-white border border-gray-200 text-xs text-gray-700 flex flex-wrap items-center justify-between gap-2">
                                        <span className="font-semibold">Two-Way Confirmation:</span>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className={`px-2.5 py-0.5 rounded-full border font-semibold ${match.status === 'CONFIRMED_MATCH' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-gray-100 border-gray-200 text-gray-600'}`}>
                                                {match.status === 'CONFIRMED_MATCH' ? '✓ Staff Confirmed' : '• Staff Pending'}
                                            </span>
                                            {isCommunityAnimal ? (
                                                <span className="px-2.5 py-0.5 rounded-full border bg-gray-100 border-gray-200 text-gray-600 font-semibold">No owner — staff confirmation only</span>
                                            ) : getOwnerFeedbackBadge(match.owner_confirmation_status)}
                                            {match.status === 'CONFIRMED_MATCH' && (isCommunityAnimal || match.owner_confirmation_status === 'OWNER_CONFIRMED') && (
                                                <span className="px-2.5 py-0.5 rounded-full bg-emerald-600 text-white font-bold">Linked to Pet Record</span>
                                            )}
                                        </div>
                                    </div>
                                    {!readOnly && (match.status === 'CONFIRMED_MATCH' || (match.status === 'NOT_A_MATCH' && match.owner_confirmation_status !== 'OWNER_REJECTED')) && (
                                        <div className="px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-2">
                                            {!showReverse ? (
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <span>
                                                        {match.status === 'CONFIRMED_MATCH'
                                                            ? 'Was this confirmed by mistake? Reversing marks it Not a Match and removes the pet link.'
                                                            : 'Was this rejected by mistake? Reversing reopens it for a fresh review.'}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => { setShowReverse(true); setReverseError(''); }}
                                                        className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 font-bold cursor-pointer"
                                                    >
                                                        ↺ Reverse Decision
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="space-y-2">
                                                    <p className="font-bold text-slate-800">
                                                        {match.status === 'CONFIRMED_MATCH' ? 'Reverse to Not a Match' : 'Reopen for review'}: why is the decision wrong?
                                                    </p>
                                                    <textarea
                                                        value={reverseNotes}
                                                        onChange={(e) => setReverseNotes(e.target.value)}
                                                        rows={3}
                                                        maxLength={1000}
                                                        placeholder="e.g. The owner's vaccination card shows a different dog; the scar is on the other ear."
                                                        className="w-full p-2.5 rounded-lg border border-slate-300 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-slate-300"
                                                    />
                                                    {reverseError && <p className="text-rose-700 font-semibold">{reverseError}</p>}
                                                    <div className="flex justify-end gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => { setShowReverse(false); setReverseNotes(''); setReverseError(''); }}
                                                            className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 font-bold cursor-pointer"
                                                        >
                                                            Cancel
                                                        </button>
                                                        <button
                                                            type="button"
                                                            disabled={isReversing || reverseNotes.trim().length < 10}
                                                            onClick={handleReverseDecision}
                                                            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 text-white font-bold cursor-pointer disabled:opacity-50"
                                                        >
                                                            {isReversing ? 'Reversing...' : 'Confirm Reversal'}
                                                        </button>
                                                    </div>
                                                    <p className="text-[10px] text-slate-500">Logged in the report history and audit log. The owner is notified if the pet link is removed.</p>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    {match.status === 'PENDING_VERIFICATION' && (match.owner_dispute_count || 0) >= 1 && (
                                        <div className="px-4 py-3 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-900 space-y-1">
                                            <p><strong>⚖️ Owner disputes the Not a Match decision.</strong> The owner says this is their pet and asked for a second review.</p>
                                            {match.owner_notes && <p><strong>Owner's reason:</strong> {match.owner_notes}</p>}
                                            <p>Ask for proof (photos, vet or vaccination records, the pet's QR) before deciding. Your decision is final; after it the owner can only file a formal dispute.</p>
                                        </div>
                                    )}
                                    {!readOnly && <StaffOwnerVerification match={match} onChanged={(m) => onVerified && onVerified(m)} />}
                                    {isDisputed && (
                                        <div className="px-4 py-3 rounded-xl bg-rose-50 border border-rose-200 flex flex-wrap items-center justify-between gap-3">
                                            <div className="text-xs text-rose-800 font-medium">
                                                <strong>Not agreed by both sides.</strong>{' '}
                                                {match.owner_confirmation_status === 'OWNER_REJECTED'
                                                    ? 'The owner said this is not their pet.'
                                                    : 'Staff marked this as Not a Match.'}{' '}
                                                Record this animal as a new animal instead.
                                            </div>
                                            <button
                                                type="button"
                                                onClick={handleUnlinkAndAddNew}
                                                disabled={isUnlinking}
                                                className="px-4 py-2 rounded-xl bg-role hover:bg-role-hover text-white text-xs font-bold shadow-sm disabled:opacity-50 cursor-pointer"
                                            >
                                                {isUnlinking ? 'Unlinking...' : '🐾 Unlink & Add New Record'}
                                            </button>
                                        </div>
                                    )}
                                    {identityLock && (
                                        <div className="px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
                                            <span className="font-black">🔒</span>
                                            <span><strong>Can't be confirmed:</strong> {identityLock}</span>
                                        </div>
                                    )}
                                    {!readOnly && <SeparateIncidentOverride match={match} onChanged={(m) => onVerified && onVerified(m)} />}
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div className="text-xs text-gray-500 font-medium">
                                            <strong className="text-gray-800">Final Verification Rule:</strong> A pet match is linked to the pet record only after both staff and the pet owner confirm it.
                                        </div>
                                        <div className="flex items-center gap-2 flex-wrap justify-end">
                                            {/* Not a Match Action */}
                                            {match.status === 'NOT_A_MATCH' ? (
                                                <button
                                                    disabled
                                                    className="px-4 py-2.5 rounded-xl border border-red-900 bg-red-800 text-white text-xs font-bold flex items-center gap-1.5 cursor-not-allowed opacity-80"
                                                >
                                                    <span>✕</span> Marked Not a Match
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    disabled={match.status === 'CONFIRMED_MATCH'}
                                                    onClick={() => {
                                                        if (match.status !== 'CONFIRMED_MATCH') {
                                                            setSelectedDecision('NOT_A_MATCH');
                                                            setVerificationNotes('Staff confirmed these are different animals upon review.');
                                                            setSubmitError('');
                                                        }
                                                    }}
                                                    className={`px-4 py-2.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs ${
                                                        match.status === 'CONFIRMED_MATCH'
                                                            ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed opacity-50'
                                                            : 'border-red-200 bg-red-50 hover:bg-red-100 text-red-700 cursor-pointer'
                                                    }`}
                                                    title={match.status === 'CONFIRMED_MATCH' ? 'Match is already confirmed' : undefined}
                                                >
                                                    <span>✕</span> Not a Match
                                                </button>
                                            )}

                                            {/* Confirm Match Action */}
                                            {match.status === 'CONFIRMED_MATCH' ? (
                                                <button
                                                    disabled
                                                    className="px-5 py-2.5 rounded-xl border border-emerald-900 bg-emerald-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-not-allowed opacity-80"
                                                >
                                                    <span>✓</span> Match Confirmed
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    disabled={match.status === 'NOT_A_MATCH' || !!identityLock}
                                                    onClick={() => {
                                                        if (match.status !== 'NOT_A_MATCH' && !identityLock) {
                                                            setSelectedDecision('CONFIRMED_MATCH');
                                                            setVerificationNotes('Staff verified matching physical characteristics and visual evidence.');
                                                            setSubmitError('');
                                                        }
                                                    }}
                                                    className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm ${
                                                        match.status === 'NOT_A_MATCH' || identityLock
                                                            ? 'border border-gray-300 bg-gray-200 text-gray-400 cursor-not-allowed opacity-50'
                                                            : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20 cursor-pointer'
                                                    }`}
                                                    title={identityLock || (match.status === 'NOT_A_MATCH' ? 'Cannot confirm match because it is already marked as not a match' : undefined)}
                                                >
                                                    <span>✓</span> Confirm Match
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-3">
                                    {match.status && match.status !== 'AI_SUGGESTED' && (
                                        <div className="px-4 py-2.5 rounded-xl bg-gray-100 border border-gray-200 text-xs text-gray-700 flex items-center justify-between">
                                            <span className="font-semibold">Current Duplicate Review Decision:</span>
                                            <div className="flex items-center gap-2">
                                                {getStatusBadge(match.status, match)}
                                                {match.verified_at && (
                                                    <span className="text-[11px] text-gray-500">
                                                        by {match.reviewer?.name || 'Staff'} ({match.reviewer_role || 'Official'})
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                    {identityLock && (
                                        <div className="px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
                                            <span className="font-black">🔒</span>
                                            <span><strong>Can't be confirmed:</strong> {identityLock}</span>
                                        </div>
                                    )}
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div className="text-xs text-gray-500 font-medium">
                                            <strong className="text-gray-800">Duplicate Action:</strong> If these show the same animal, the reports join one case. The report filed first stays the main case, and every report keeps its own photos and history.
                                        </div>
                                        <div className="flex items-center gap-2 flex-wrap justify-end">
                                            {match.status === 'NOT_A_MATCH' ? (
                                                <button
                                                    disabled
                                                    className="px-4 py-2.5 rounded-xl border border-red-900 bg-red-800 text-white text-xs font-bold flex items-center gap-1.5 cursor-not-allowed opacity-80"
                                                >
                                                    <span>✕</span> Marked as Separate
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    disabled={match.status === 'CONFIRMED_MATCH' || alreadySameCase}
                                                    title={alreadySameCase ? 'These reports are already merged in one case. Unmerge the report first if they are different animals.' : undefined}
                                                    onClick={() => {
                                                        if (match.status !== 'CONFIRMED_MATCH' && !alreadySameCase) {
                                                            setSelectedDecision('NOT_A_MATCH');
                                                            setVerificationNotes('Staff confirmed these are separate/different stray animals.');
                                                            setSubmitError('');
                                                        }
                                                    }}
                                                    className={`px-4 py-2.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs ${
                                                        match.status === 'CONFIRMED_MATCH' || alreadySameCase
                                                            ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed opacity-50'
                                                            : 'border-red-200 bg-red-50 hover:bg-red-100 text-red-700 cursor-pointer'
                                                    }`}
                                                >
                                                    <span>✕</span> Separate / Different Animal
                                                </button>
                                            )}

                                            {match.status === 'CONFIRMED_MATCH' || alreadySameCase ? (
                                                <button
                                                    disabled
                                                    className="px-5 py-2.5 rounded-xl bg-stone-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-not-allowed opacity-80 border border-stone-900"
                                                >
                                                    <span>🔗</span> {alreadySameCase ? `Same Case (#${caseOf(source, match.source_report_id)})` : 'Marked as Duplicate'}
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    disabled={match.status === 'NOT_A_MATCH' || !!identityLock}
                                                    onClick={() => {
                                                        if (match.status !== 'NOT_A_MATCH' && !identityLock) {
                                                            openReportMatchConfirm();
                                                        }
                                                    }}
                                                    className={`px-5 py-2.5 rounded-xl text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm ${
                                                        match.status === 'NOT_A_MATCH' || identityLock
                                                            ? 'border border-gray-300 bg-gray-200 text-gray-400 cursor-not-allowed opacity-50'
                                                            : 'bg-gradient-to-r from-amber-600 to-role hover:from-amber-700 hover:to-role-hover shadow-role/20 cursor-pointer'
                                                    }`}
                                                    title={identityLock || (match.status === 'NOT_A_MATCH' ? 'Cannot merge duplicate because it is marked as separate animals' : undefined)}
                                                >
                                                    <span>🔗</span> Matched: Same Animal
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        /* Resident / Owner Supporting Feedback */
                        isPetMatch && targetPet?.owner_id === currentUser?.user_id ? (
                        <div className="space-y-3">
                            <div className="text-xs text-gray-600 font-medium">
                                <strong>Owner Confirmation:</strong> Does this animal sighting match your pet? It is added to your pet's record only after both you and a reviewing official confirm it.
                            </div>
                            <input
                                type="text"
                                value={ownerRemarks}
                                onChange={(e) => setOwnerRemarks(e.target.value)}
                                placeholder="Add optional note for staff (e.g., 'He responds to Max and has a clipped left ear')..."
                                className="w-full text-xs p-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-role outline-none"
                            />
                            <div className="flex flex-wrap gap-2 justify-end">
                                <button
                                    onClick={() => handleOwnerFeedback('OWNER_REJECTED')}
                                    disabled={isSubmittingOwnerFeedback}
                                    className="px-4 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-xs font-bold"
                                >
                                    Not My Pet
                                </button>
                                <button
                                    onClick={() => handleOwnerFeedback('OWNER_CONFIRMED')}
                                    disabled={isSubmittingOwnerFeedback}
                                    className="px-5 py-2 rounded-xl bg-role hover:bg-role-hover text-white text-xs font-bold"
                                >
                                    {isSubmittingOwnerFeedback ? 'Submitting...' : 'Yes, Looks Like My Pet'}
                                </button>
                            </div>
                        </div>
                        ) : null
                    )}
                </div>

            </div>

            {/* ── Confirmation Modal Dialog ── */}
            {selectedDecision && (
                <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
                    <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl border border-gray-100 flex flex-col gap-5 relative animate-in zoom-in-95 duration-150">
                        {/* Header */}
                        <div className="flex items-start justify-between gap-3 pb-3 border-b border-gray-100">
                            <div className="flex items-center gap-3">
                                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-xl font-black ${
                                    selectedDecision === 'CONFIRMED_MATCH'
                                        ? 'bg-emerald-100 text-emerald-600'
                                        : 'bg-red-100 text-red-600'
                                }`}>
                                    {selectedDecision === 'CONFIRMED_MATCH' ? '✓' : '✕'}
                                </div>
                                <div>
                                    <h3 className="text-base font-black text-gray-900 tracking-tight">
                                        {selectedDecision === 'CONFIRMED_MATCH'
                                            ? (isPetMatch ? 'Confirm Match Confirmation' : 'Confirm Duplicate Match')
                                            : (isPetMatch ? 'Mark as Not a Match' : 'Mark as Separate Animals')}
                                    </h3>
                                    <p className="text-xs text-gray-500 font-medium">
                                        {selectedDecision === 'CONFIRMED_MATCH'
                                            ? `Match #${match.match_id} • ${match.similarity_score}% AI Similarity`
                                            : `Reject potential correlation for Match #${match.match_id}`}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => { setSelectedDecision(null); setVerificationNotes(''); setSubmitError(''); }}
                                disabled={isSubmitting}
                                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center transition-all cursor-pointer text-sm font-bold"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Explanation / Warning Alert */}
                        <div className={`p-3.5 rounded-2xl border text-xs font-medium leading-relaxed ${
                            selectedDecision === 'CONFIRMED_MATCH'
                                ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
                                : 'bg-red-50/80 border-red-200 text-red-900'
                        }`}>
                            {selectedDecision === 'CONFIRMED_MATCH' ? (
                                <span>
                                    {isPetMatch && isCommunityAnimal ? (
                                        <>
                                            <strong>Confirmation Notice:</strong> {petName(targetPet) || 'This pet'} is a community animal with no registered owner, so Report #{source?.report_id || match.source_report_id} will be linked to its record immediately.
                                        </>
                                    ) : isPetMatch ? (
                                        <>
                                            <strong>Confirmation Notice:</strong> Report #{source?.report_id || match.source_report_id} will be linked to <strong>{targetPet?.name || targetPet?.pet_name || 'the registered pet record'}</strong>'s pet record once the owner also confirms.
                                            {match.owner_confirmation_status === 'OWNER_CONFIRMED'
                                                ? ' The owner has already confirmed, so the link will be created immediately.'
                                                : ' The owner will be notified to confirm.'}
                                        </>
                                    ) : isLoadingPreview ? (
                                        <>Checking which case these reports belong to…</>
                                    ) : casePreview ? (
                                        <>
                                            <strong>What happens:</strong> {casePreview.message}
                                            {casePreview.report_ids.length > 1 && (
                                                <span className="block mt-1.5 text-[11px] text-emerald-800">
                                                    Main case: <strong>Report #{casePreview.main_report_id}</strong> • Reports in the case: {casePreview.report_ids.map(r => `#${r}`).join(', ')}
                                                </span>
                                            )}
                                        </>
                                    ) : (
                                        <><strong>Confirmation Notice:</strong> Report #{source?.report_id || match.source_report_id} and Report #{match.matched_report_id} will be treated as the same animal.</>
                                    )}
                                </span>
                            ) : (
                                <span>
                                    <strong>Rejection Notice:</strong> Marking as <strong>Not a Match</strong> rejects this suggestion{!isPetMatch ? ' for the whole case: open suggestions between these two reports\' cases are closed too, and the AI stops pairing them' : ''}. You will no longer be able to click &quot;Confirm Match&quot; for this pair once marked.
                                </span>
                            )}
                        </div>

                        {isReportPairConfirm && casePreview?.blocked_reason && (
                            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-xl font-semibold flex items-start gap-2">
                                <span>⛔</span>
                                <span><strong>Can't be matched:</strong> {casePreview.blocked_reason}</span>
                            </div>
                        )}

                        {submitError && (
                            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl font-semibold flex items-center gap-2">
                                <span>⚠️</span>
                                <span>{submitError}</span>
                            </div>
                        )}

                        {/* Verification Reason / Notes */}
                        <div className="space-y-1.5">
                            <label className="text-[11px] font-bold text-gray-700 flex items-center justify-between">
                                <span>Verification Notes / Reason <span className="text-red-500">*</span></span>
                                <span className="text-[10px] text-gray-400 font-normal">Min. {minNotes} characters</span>
                            </label>
                            <textarea
                                value={verificationNotes}
                                onChange={(e) => setVerificationNotes(e.target.value)}
                                placeholder={
                                    selectedDecision === 'CONFIRMED_MATCH'
                                        ? 'State matching features (e.g., "Distinctive coat pattern and markings match the registered pet").'
                                        : 'State differences (e.g., "Different ear shape and distinct coat color variation upon inspection").'
                                }
                                rows={3}
                                className="w-full text-xs p-3 bg-gray-50 border border-gray-200 rounded-2xl focus:bg-white focus:ring-2 focus:ring-role outline-none transition-all resize-none font-medium text-gray-800"
                            />
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                            <button
                                type="button"
                                onClick={() => { setSelectedDecision(null); setVerificationNotes(''); setSubmitError(''); }}
                                disabled={isSubmitting}
                                className="px-4 py-2.5 rounded-xl text-xs font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-all cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleVerifySubmit}
                                disabled={isSubmitting || verificationNotes.trim().length < minNotes || (isReportPairConfirm && (isLoadingPreview || !!casePreview?.blocked_reason))}
                                className={`px-5 py-2.5 rounded-xl text-xs font-bold text-white transition-all shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                                    selectedDecision === 'CONFIRMED_MATCH'
                                        ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                                        : 'bg-red-600 hover:bg-red-700 shadow-red-600/20'
                                }`}
                            >
                                {isSubmitting ? (
                                    <span>Saving Decision...</span>
                                ) : (
                                    <span>
                                        {selectedDecision === 'CONFIRMED_MATCH' ? (isReportPairConfirm && casePreview?.effect !== 'already_same_case' ? `✓ Confirm & Join Case #${casePreview?.main_report_id ?? ''}` : '✓ Confirm & Save Match') : '✕ Confirm Not a Match'}
                                    </span>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Pet Record Modal */}
            {isAddPetModalOpen && source && (
                <AddPetModal
                    isOpen={isAddPetModalOpen}
                    onClose={() => setIsAddPetModalOpen(false)}
                    initialReportData={{ ...source, pet_id: null, pet_name: null, owner_name: null }}
                    onPetCreated={() => {
                        setIsAddPetModalOpen(false);
                        if (onVerified) onVerified(match);
                        onClose();
                    }}
                />
            )}

            {/* Case Chat Drawer for Look-Alike Inquiries */}
            {isChatOpen && source && (() => {
                const isOwner = isPetMatch && currentUser?.user_id && (targetPet?.owner_id === currentUser.user_id || targetPet?.owner?.user_id === currentUser.user_id);
                const ownerName = targetPet?.owner?.name || "Registered Pet Owner";
                const chatPetName = targetPet ? petName(targetPet) : "Registered Pet";
                const sightingBreedColor = [source.breed, source.color].filter(Boolean).join(', ') || source.animal_type || 'Stray Animal';
                const sightingLoc = source.landmark || 'Subdivision Community Area';
                const petBreedColor = [targetPet?.breed, targetPet?.color].filter(Boolean).join(', ') || 'Registered Pet';

                const customCounterpartName = isOwner ? undefined : `${ownerName} (Owner of ${chatPetName})`;
                const customCounterpartRole = isOwner ? undefined : "Registered Pet Owner";
                
                const initialSnippet = isOwner
                    ? ''
                    : `Hello ${ownerName}!

STRAY-SAFE AI detected a ${match.similarity_score}% look-alike match for your registered pet '${chatPetName}' in Report #${source.report_id}.

🔍 Side-by-Side Comparison:
• Sighting: Report #${source.report_id} (${sightingBreedColor} at ${sightingLoc})
• Registered Pet: ${chatPetName} (${petBreedColor})
• AI Similarity: ${match.similarity_score}% Match

Please review the comparison photos above and let us know if this is your pet.`;

                return (
                    <ReportChatDrawer
                        isOpen={isChatOpen}
                        onClose={() => setIsChatOpen(false)}
                        report={source}
                        currentUser={currentUser}
                        matchId={match.match_id}
                        threadMode="match"
                        customCounterpartName={customCounterpartName}
                        customCounterpartRole={customCounterpartRole}
                        initialMessageSnippet={initialSnippet}
                        matchedPet={{
                            pet_id: targetPet?.pet_id,
                            pet_name: chatPetName,
                            photo_url: targetPet?.photo_url,
                            species: targetPet?.pet_type || targetPet?.species || "Dog",
                            breed: targetPet?.breed || "Registered Breed",
                            color: [targetPet?.primary_color, targetPet?.secondary_color].filter(Boolean).join(' ') || targetPet?.color || "Registered Color",
                            size: targetPet?.size_category || targetPet?.size || "Medium",
                            owner_name: ownerName,
                            registered_address: targetPet?.registered_address || (ownerName ? `Registered by ${ownerName}` : 'Registered Pet'),
                            similarity_score: match.similarity_score,
                            sighting_photo_url: sourceImage,
                            sighting_species: source?.animal_type || source?.ai_animal_type || "Dog",
                            sighting_breed: source?.animal_breed || source?.ai_possible_breed || "Reported Breed",
                            sighting_color: source?.animal_color || source?.ai_dominant_color || "Reported Color",
                            sighting_size: source?.estimated_size || source?.ai_estimated_size || "Medium",
                            sighting_landmark: source?.landmark || "Subdivision Area",
                            sighting_description: source?.description,
                            key_evidence_bullets: bullets
                        }}
                    />
                );
            })()}

            {lightbox && (
                <MediaLightbox
                    items={lightbox.items}
                    startIndex={lightbox.index}
                    title={lightbox.title}
                    onClose={() => setLightbox(null)}
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

export default AIMatchReviewModal;
