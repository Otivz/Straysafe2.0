import React, { useState } from 'react';
import axios from 'axios';
import Button from '../Button';
import { DEFAULT_AVATAR } from '../../utils/avatar';
import AddPetModal from '../PetRecords/AddPetModal';

interface AIMatchReviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    match: any;
    onVerified?: (updatedMatch: any) => void;
    isStaff?: boolean; // true for leader, brgy, admin; false for resident
}

const getStatusBadge = (status: string) => {
    switch (status) {
        case 'CONFIRMED_MATCH':
            return <span className="px-3 py-1 bg-green-100 border border-green-300 text-green-800 rounded-full font-bold text-xs flex items-center gap-1.5 shadow-sm"><span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>Confirmed Match</span>;
        case 'NOT_A_MATCH':
            return <span className="px-3 py-1 bg-red-100 border border-red-300 text-red-700 rounded-full font-bold text-xs flex items-center gap-1.5 shadow-sm"><span className="w-2 h-2 rounded-full bg-red-500"></span>Not a Match</span>;
        case 'UNABLE_TO_VERIFY':
            return <span className="px-3 py-1 bg-amber-100 border border-amber-300 text-amber-800 rounded-full font-bold text-xs flex items-center gap-1.5 shadow-sm"><span className="w-2 h-2 rounded-full bg-amber-500"></span>Unable to Verify</span>;
        case 'PENDING_VERIFICATION':
            return <span className="px-3 py-1 bg-blue-100 border border-blue-300 text-blue-800 rounded-full font-bold text-xs flex items-center gap-1.5 shadow-sm"><span className="w-2 h-2 rounded-full bg-blue-500"></span>Pending Verification</span>;
        case 'AI_SUGGESTED':
        default:
            return <span className="px-3 py-1 bg-orange-100 border border-orange-300 text-orange-800 rounded-full font-bold text-xs flex items-center gap-1.5 shadow-sm"><span className="w-2 h-2 rounded-full bg-[#F97316]"></span>AI Suggested Match</span>;
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
    isStaff = true
}) => {
    const [selectedDecision, setSelectedDecision] = useState<'CONFIRMED_MATCH' | 'NOT_A_MATCH' | 'UNABLE_TO_VERIFY' | null>(null);
    const [verificationNotes, setVerificationNotes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState('');
    const [activeTab, setActiveTab] = useState<'comparison' | 'audit'>('comparison');
    const [isAddPetModalOpen, setIsAddPetModalOpen] = useState(false);

    // Resident feedback state
    const [ownerRemarks, setOwnerRemarks] = useState('');
    const [isSubmittingOwnerFeedback, setIsSubmittingOwnerFeedback] = useState(false);

    if (!isOpen || !match) return null;

    const source = match.source_report;
    const targetReport = match.matched_report;
    const targetPet = match.matched_pet;
    const isPetMatch = !!targetPet;

    const sourceImage = source?.media?.[0]?.file_url || '/placeholder-pet.png';
    const targetImage = isPetMatch
        ? (targetPet.photo_url || '/placeholder-pet.png')
        : (targetReport?.media?.[0]?.file_url || '/placeholder-pet.png');

    const evidence = match.ai_evidence || {};
    const bullets: string[] = evidence.key_evidence_bullets || [];

    const handleVerifySubmit = async () => {
        if (!selectedDecision) return;
        if (!verificationNotes.trim() || verificationNotes.trim().length < 3) {
            setSubmitError('Please enter a brief verification explanation for your decision.');
            return;
        }

        setIsSubmitting(true);
        setSubmitError('');

        try {
            const token = localStorage.getItem('token') || sessionStorage.getItem('token');
            const staffUser = JSON.parse(localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user') || '{}');
            const adminUser = JSON.parse(localStorage.getItem('admin_user') || '{}');
            const activeUser = staffUser.user_id ? staffUser : adminUser;

            const res = await axios.post(
                `http://localhost:8000/matches/${match.match_id}/verify`,
                {
                    decision: selectedDecision,
                    notes: verificationNotes.trim()
                },
                {
                    headers: {
                        Authorization: token ? `Bearer ${token}` : undefined,
                        'X-User-Id': activeUser.user_id ? String(activeUser.user_id) : undefined
                    }
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
            setSubmitError(err.response?.data?.detail || 'Failed to submit verification decision. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleOwnerFeedback = async (decision: 'OWNER_CONFIRMED' | 'OWNER_REJECTED') => {
        setIsSubmittingOwnerFeedback(true);
        try {
            const res = await axios.post(
                `http://localhost:8000/matches/${match.match_id}/owner-feedback`,
                {
                    owner_confirmation: decision,
                    remarks: ownerRemarks.trim() || undefined
                }
            );
            if (onVerified) {
                onVerified(res.data);
            }
            onClose();
        } catch (err) {
            console.error('Owner feedback error:', err);
        } finally {
            setIsSubmittingOwnerFeedback(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 w-full max-w-5xl my-8 overflow-hidden flex flex-col max-h-[92vh]">
                
                {/* ── Modal Header ── */}
                <div className="px-8 py-5 border-b border-gray-100 bg-gradient-to-r from-orange-50/50 via-white to-amber-50/50 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                        <div className="w-12 h-12 rounded-2xl bg-orange-100 text-[#F97316] flex items-center justify-center font-black text-xl shadow-inner">
                            AI
                        </div>
                        <div>
                            <div className="flex items-center gap-2.5 flex-wrap">
                                <h2 className="text-xl font-black text-gray-900 tracking-tight">
                                    Potential Match Review
                                </h2>
                                <span className="px-3 py-1 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-extrabold text-xs rounded-full shadow-sm">
                                    {match.similarity_score}% Similarity
                                </span>
                                {getStatusBadge(match.status)}
                            </div>
                            <p className="text-xs font-semibold text-gray-500 mt-0.5">
                                Match #{match.match_id} • Report #{match.source_report_id} ↔ {isPetMatch ? `Pet '${targetPet?.pet_name}'` : `Report #${match.matched_report_id}`}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="flex bg-gray-100 p-1 rounded-xl text-xs font-bold text-gray-600">
                            <button
                                onClick={() => setActiveTab('comparison')}
                                className={`px-3 py-1.5 rounded-lg transition-all ${activeTab === 'comparison' ? 'bg-white text-gray-900 shadow-sm' : 'hover:text-gray-900'}`}
                            >
                                Side-by-Side Review
                            </button>
                            <button
                                onClick={() => setActiveTab('audit')}
                                className={`px-3 py-1.5 rounded-lg transition-all ${activeTab === 'audit' ? 'bg-white text-gray-900 shadow-sm' : 'hover:text-gray-900'}`}
                            >
                                Audit Trail
                            </button>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all"
                        >
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* ── Modal Body ── */}
                <div className="p-8 overflow-y-auto space-y-6 flex-1">
                    
                    {activeTab === 'comparison' ? (
                        <>
                            {/* ── AI Evidence Banner ── */}
                            <div className="bg-gradient-to-br from-amber-50/80 via-orange-50/50 to-white border border-amber-200/80 rounded-2xl p-5 shadow-sm">
                                <div className="flex items-start gap-4">
                                    <div className="p-3 bg-amber-500 text-white rounded-xl shadow-md shrink-0">
                                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                                        </svg>
                                    </div>
                                    <div className="space-y-2.5 flex-1">
                                        <div className="flex items-center justify-between flex-wrap gap-2">
                                            <h3 className="text-sm font-extrabold text-amber-950 uppercase tracking-wider flex items-center gap-2">
                                                AI Supporting Evidence & Heuristics
                                            </h3>
                                            {getOwnerFeedbackBadge(match.owner_confirmation_status)}
                                        </div>
                                        <p className="text-xs text-gray-700 leading-relaxed font-medium">
                                            {match.ai_explanation || "AI algorithm analyzed species, coat colors, pattern, size, and location proximity."}
                                        </p>
                                        
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

                            {/* ── Side-by-Side Comparison Columns ── */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                
                                {/* ── LEFT: Source Report ── */}
                                <div className="border border-gray-200 rounded-2xl p-5 bg-white shadow-xs space-y-4">
                                    <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                                        <span className="px-3 py-1 bg-orange-100 text-[#F97316] font-bold text-xs rounded-full">
                                            Report #{source?.report_id || match.source_report_id} (Original Sighting)
                                        </span>
                                        <span className="text-xs text-gray-500 font-medium">
                                            {source?.category?.category_name || "Stray Report"}
                                        </span>
                                    </div>

                                    {/* Image */}
                                    <div className="w-full h-56 bg-gray-100 rounded-xl overflow-hidden relative border border-gray-100 group">
                                        <img
                                            src={sourceImage}
                                            alt="Source Animal"
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                            onError={(e: any) => { e.target.src = DEFAULT_AVATAR; }}
                                        />
                                        <span className="absolute bottom-2 left-2 px-2.5 py-1 bg-black/60 backdrop-blur-md text-white text-[11px] font-semibold rounded-md">
                                            Original Photo
                                        </span>
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
                                        <p className="font-normal text-gray-700 italic">"{source?.description || "No specific markings provided."}"</p>
                                    </div>
                                </div>

                                {/* ── RIGHT: Matching Candidate ── */}
                                <div className="border border-gray-200 rounded-2xl p-5 bg-white shadow-xs space-y-4">
                                    <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                                        <span className="px-3 py-1 bg-amber-100 text-amber-800 font-bold text-xs rounded-full">
                                            {isPetMatch ? `Registered Pet: ${targetPet?.pet_name}` : `Report #${targetReport?.report_id}`} (Candidate)
                                        </span>
                                        <span className="text-xs text-gray-500 font-medium">
                                            {isPetMatch ? `Owner: ${targetPet?.owner?.name || "Registered Resident"}` : (targetReport?.category?.category_name || "Sighting")}
                                        </span>
                                    </div>

                                    {/* Image */}
                                    <div className="w-full h-56 bg-gray-100 rounded-xl overflow-hidden relative border border-gray-100 group">
                                        <img
                                            src={targetImage}
                                            alt="Candidate Animal"
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                            onError={(e: any) => { e.target.src = DEFAULT_AVATAR; }}
                                        />
                                        <span className="absolute bottom-2 left-2 px-2.5 py-1 bg-black/60 backdrop-blur-md text-white text-[11px] font-semibold rounded-md">
                                            Candidate Profile
                                        </span>
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
                                        <p className="font-normal text-gray-700 italic">
                                            "{isPetMatch ? (targetPet?.distinctive_markings || targetPet?.color_markings || "None noted") : (targetReport?.description || "No specific marks.")}"
                                        </p>
                                    </div>
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
                                    <div className="border-l-2 border-orange-500 pl-4 py-1 space-y-2">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-bold text-gray-900">{match.reviewer?.name || "Official Reviewer"}</span>
                                            <span className="px-2 py-0.5 bg-gray-200 text-gray-700 rounded text-[10px] font-bold uppercase">{match.reviewer_role || "Staff"}</span>
                                            <span className="text-xs text-gray-400">• {new Date(match.verified_at).toLocaleString()}</span>
                                        </div>
                                        <div className="text-xs text-gray-700">
                                            <strong>Status Applied:</strong> {getStatusBadge(match.status)}
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
                    {isStaff ? (
                        <div>
                            {selectedDecision ? (
                                <div className="space-y-3 bg-white p-4 rounded-2xl border border-orange-200 shadow-sm animate-in fade-in">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                                            Applying Decision: 
                                            {selectedDecision === 'CONFIRMED_MATCH' && <span className="text-green-600 font-extrabold">🟢 Confirm Match (Same Animal)</span>}
                                            {selectedDecision === 'NOT_A_MATCH' && <span className="text-red-600 font-extrabold">🔴 Reject Match (Different Animals)</span>}
                                            {selectedDecision === 'UNABLE_TO_VERIFY' && <span className="text-amber-600 font-extrabold">🟡 Unable to Verify (Inconclusive)</span>}
                                        </span>
                                        <button
                                            onClick={() => setSelectedDecision(null)}
                                            className="text-xs text-gray-400 hover:text-gray-600 font-bold"
                                        >
                                            Cancel
                                        </button>
                                    </div>

                                    <textarea
                                        value={verificationNotes}
                                        onChange={(e) => setVerificationNotes(e.target.value)}
                                        placeholder={
                                            selectedDecision === 'CONFIRMED_MATCH'
                                                ? 'State matching features (e.g., "Same distinctive black patch above left eye and white chest marking").'
                                                : selectedDecision === 'NOT_A_MATCH'
                                                ? 'State differences (e.g., "Different ear shape and distinct coat color variation").'
                                                : 'State reason (e.g., "Photos too blurry to evaluate facial markings; keeping under observation").'
                                        }
                                        className="w-full text-xs p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#F97316] outline-none min-h-[70px]"
                                    />

                                    <div className="flex justify-end gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setSelectedDecision(null)}
                                            className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-all"
                                        >
                                            Back
                                        </button>
                                        <Button
                                            onClick={handleVerifySubmit}
                                            disabled={isSubmitting || verificationNotes.trim().length < 3}
                                            className="!px-5 !py-2 !text-xs !bg-[#F97316] hover:!bg-[#ea580c] !text-white !font-bold !rounded-xl"
                                        >
                                            {isSubmitting ? 'Saving Decision...' : 'Confirm & Save Decision'}
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div className="text-xs text-gray-500 font-medium">
                                        <strong className="text-gray-800">Final Verification Rule:</strong> AI recommendations require staff confirmation before officially matching cases.
                                    </div>
                                    <div className="flex items-center gap-2 flex-wrap justify-end">
                                        <button
                                            type="button"
                                            onClick={() => setIsAddPetModalOpen(true)}
                                            className="px-3.5 py-2.5 rounded-xl border border-orange-200 bg-orange-50 hover:bg-orange-100 text-[#F97316] text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                                            title="If this animal has no record in the system yet, register it now"
                                        >
                                            <span>🐾</span> Add Record for this Animal
                                        </button>
                                        <button
                                            onClick={() => { setSelectedDecision('NOT_A_MATCH'); setVerificationNotes(''); }}
                                            className="px-4 py-2.5 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs"
                                        >
                                            <span>✕</span> Not a Match
                                        </button>
                                        <button
                                            onClick={() => { setSelectedDecision('UNABLE_TO_VERIFY'); setVerificationNotes(''); }}
                                            className="px-4 py-2.5 rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs"
                                        >
                                            <span>?</span> Unable to Verify
                                        </button>
                                        <button
                                            onClick={() => { setSelectedDecision('CONFIRMED_MATCH'); setVerificationNotes(''); }}
                                            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm shadow-emerald-600/20"
                                        >
                                            <span>✓</span> Confirm Match
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        /* Resident / Owner Supporting Feedback */
                        <div className="space-y-3">
                            <div className="text-xs text-gray-600 font-medium">
                                <strong>Owner Feedback:</strong> Does this animal sighting match your pet? Your confirmation serves as supporting evidence for reviewing officials.
                            </div>
                            <input
                                type="text"
                                value={ownerRemarks}
                                onChange={(e) => setOwnerRemarks(e.target.value)}
                                placeholder="Add optional note for staff (e.g., 'He responds to Max and has a clipped left ear')..."
                                className="w-full text-xs p-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#F97316] outline-none"
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
                                    className="px-5 py-2 rounded-xl bg-[#F97316] hover:bg-[#ea580c] text-white text-xs font-bold"
                                >
                                    {isSubmittingOwnerFeedback ? 'Submitting...' : 'Yes, Looks Like My Pet'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>

            </div>

            {/* Add Pet Record Modal */}
            {isAddPetModalOpen && source && (
                <AddPetModal
                    isOpen={isAddPetModalOpen}
                    onClose={() => setIsAddPetModalOpen(false)}
                    initialReportData={source}
                    onPetCreated={() => {
                        setIsAddPetModalOpen(false);
                        if (onVerified) onVerified(match);
                        onClose();
                    }}
                />
            )}
        </div>
    );
};

export default AIMatchReviewModal;
