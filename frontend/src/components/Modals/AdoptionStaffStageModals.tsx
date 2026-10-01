import React, { useState, useEffect } from 'react';
import { api } from '../../utils/api';
import { 
    ShieldCheck, 
    X, 
    Video, 
    Home, 
    HeartHandshake, 
    FileText, 
    AlertCircle,
    Award
} from 'lucide-react';

// ==========================================
// 1. Stage 2: Verification Modal
// ==========================================
interface VerificationModalProps {
    adoptionId: number;
    applicantName: string;
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export const AdoptionVerificationModal: React.FC<VerificationModalProps> = ({
    adoptionId,
    applicantName,
    isOpen,
    onClose,
    onSuccess,
}) => {
    const [idMatchStatus, setIdMatchStatus] = useState('Matched');
    const [residencyStatus, setResidencyStatus] = useState('Resident_Confirmed');
    const [blacklistChecked] = useState(true);
    const [isBlacklisted, setIsBlacklisted] = useState(false);
    const [decision, setDecision] = useState('Pass');
    const [notes, setNotes] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);
        try {
            await api.post(`/adoptions/${adoptionId}/verify`, {
                id_match_status: idMatchStatus,
                residency_status: residencyStatus,
                blacklist_checked: blacklistChecked,
                is_blacklisted: isBlacklisted,
                decision: decision,
                verification_notes: notes,
            });
            onSuccess();
            onClose();
        } catch (err: any) {
            console.error("Verification failed:", err);
            setError(err.response?.data?.detail || "Failed to submit verification.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
            <div className="bg-white dark:bg-[#151C2C] rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 my-auto">
                <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-2xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                            <ShieldCheck className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-base font-black text-slate-900 dark:text-white">
                                Stage 2: Applicant Verification
                            </h2>
                            <p className="text-xs text-slate-500">Applicant: {applicantName} (App #{adoptionId})</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 cursor-pointer">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {error && (
                    <div className="mt-3 p-3 rounded-xl bg-red-100 text-red-800 text-xs font-bold flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="mt-4 space-y-3.5 text-xs text-slate-700 dark:text-slate-300">
                    <div>
                        <label className="block font-bold mb-1">Government ID Authenticity & Match</label>
                        <select
                            value={idMatchStatus}
                            onChange={(e) => setIdMatchStatus(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C] font-semibold"
                        >
                            <option value="Matched">Matched & Verified (Valid Government ID)</option>
                            <option value="Mismatched">Mismatched (Details do not match applicant)</option>
                            <option value="Unclear">Unclear / Blurry (Needs Re-upload)</option>
                        </select>
                    </div>

                    <div>
                        <label className="block font-bold mb-1">Barangay Residency Status</label>
                        <select
                            value={residencyStatus}
                            onChange={(e) => setResidencyStatus(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C] font-semibold"
                        >
                            <option value="Resident_Confirmed">Confirmed Barangay Resident</option>
                            <option value="Non_Resident">Non-Resident (Neighboring Barangay / City)</option>
                            <option value="Unknown">Pending Address Validation</option>
                        </select>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                        <div>
                            <span className="font-bold block">Blacklist Registry Check</span>
                            <span className="text-[11px] text-slate-500">Cross-reference with animal cruelty / abandonment registry</span>
                        </div>
                        <label className="flex items-center gap-1.5 cursor-pointer font-bold text-red-600">
                            <input
                                type="checkbox"
                                checked={isBlacklisted}
                                onChange={(e) => setIsBlacklisted(e.target.checked)}
                                className="rounded border-slate-300 text-red-600 focus:ring-red-500"
                            />
                            <span>Flag Blacklisted</span>
                        </label>
                    </div>

                    <div>
                        <label className="block font-bold mb-1">Verification Decision</label>
                        <div className="grid grid-cols-3 gap-2">
                            {[
                                { id: 'Pass', label: 'Pass (Stage 3)', color: 'bg-emerald-600 text-white' },
                                { id: 'Needs_Correction', label: 'Need Docs', color: 'bg-amber-500 text-white' },
                                { id: 'Fail', label: 'Fail / Disapprove', color: 'bg-red-600 text-white' },
                            ].map((opt) => (
                                <button
                                    key={opt.id}
                                    type="button"
                                    onClick={() => setDecision(opt.id)}
                                    className={`py-2 px-1 text-center font-bold rounded-xl border transition-all cursor-pointer ${
                                        decision === opt.id
                                            ? opt.color + ' border-transparent shadow-xs'
                                            : 'bg-slate-50 dark:bg-[#0B0F19] border-slate-200 dark:border-slate-800 text-slate-600'
                                    }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block font-bold mb-1">Verification Remarks / Notes</label>
                        <textarea
                            rows={2}
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="e.g. ID verified against voter's record, clear residency confirmed..."
                            className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C] resize-none"
                        />
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 font-bold text-slate-500 cursor-pointer">
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={submitting}
                            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl shadow-xs transition-colors cursor-pointer"
                        >
                            {submitting ? 'Recording...' : 'Submit Verification'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};


// ==========================================
// 2. Stage 3: Interview Scheduling & Evaluation
// ==========================================
interface InterviewModalProps {
    adoptionId: number;
    applicantName: string;
    isOpen: boolean;
    mode: 'schedule' | 'evaluate';
    onClose: () => void;
    onSuccess: () => void;
}

export const AdoptionInterviewModal: React.FC<InterviewModalProps> = ({
    adoptionId,
    applicantName,
    isOpen,
    mode,
    onClose,
    onSuccess,
}) => {
    // Schedule state
    const [scheduledAt, setScheduledAt] = useState('');
    const [interviewMode, setInterviewMode] = useState('In-Person');
    const [meetingLink, setMeetingLink] = useState('');
    
    // Evaluation state
    const [careScore, setCareScore] = useState(4);
    const [finScore, setFinScore] = useState(4);
    const [envScore, setEnvScore] = useState(4);
    const [recommendation, setRecommendation] = useState('Recommended');
    const [interviewNotes, setInterviewNotes] = useState('');

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleSubmitSchedule = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);
        try {
            await api.post(`/adoptions/${adoptionId}/interview/schedule`, {
                scheduled_at: new Date(scheduledAt).toISOString(),
                interview_mode: interviewMode,
                meeting_link: meetingLink || null,
            });
            onSuccess();
            onClose();
        } catch (err: any) {
            console.error("Schedule interview failed:", err);
            setError(err.response?.data?.detail || "Failed to schedule interview.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleSubmitEvaluate = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);
        try {
            await api.post(`/adoptions/${adoptionId}/interview/evaluate`, {
                score_care_knowledge: careScore,
                score_financial_readiness: finScore,
                score_environment_suitability: envScore,
                recommendation: recommendation,
                interview_notes: interviewNotes,
            });
            onSuccess();
            onClose();
        } catch (err: any) {
            console.error("Evaluate interview failed:", err);
            setError(err.response?.data?.detail || "Failed to submit interview evaluation.");
        } finally {
            setSubmitting(false);
        }
    };

    const totalScore = careScore + finScore + envScore;

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
            <div className="bg-white dark:bg-[#151C2C] rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 my-auto">
                <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-2xl bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                            <Video className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-base font-black text-slate-900 dark:text-white">
                                Stage 3: Interview ({mode === 'schedule' ? 'Schedule' : 'Rubric Scoring'})
                            </h2>
                            <p className="text-xs text-slate-500">Applicant: {applicantName} (App #{adoptionId})</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 cursor-pointer">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {error && (
                    <div className="mt-3 p-3 rounded-xl bg-red-100 text-red-800 text-xs font-bold flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                {mode === 'schedule' ? (
                    <form onSubmit={handleSubmitSchedule} className="mt-4 space-y-3.5 text-xs text-slate-700 dark:text-slate-300">
                        <div>
                            <label className="block font-bold mb-1">Interview Date & Time <span className="text-red-500">*</span></label>
                            <input
                                type="datetime-local"
                                value={scheduledAt}
                                onChange={(e) => setScheduledAt(e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C] font-semibold"
                                required
                            />
                        </div>

                        <div>
                            <label className="block font-bold mb-1">Interview Mode</label>
                            <select
                                value={interviewMode}
                                onChange={(e) => setInterviewMode(e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C] font-semibold"
                            >
                                <option value="In-Person">In-Person (Barangay Animal Facility)</option>
                                <option value="Video_Call">Video Call (Google Meet / Zoom)</option>
                            </select>
                        </div>

                        {interviewMode === 'Video_Call' && (
                            <div>
                                <label className="block font-bold mb-1">Meeting Link</label>
                                <input
                                    type="url"
                                    value={meetingLink}
                                    onChange={(e) => setMeetingLink(e.target.value)}
                                    placeholder="https://meet.google.com/..."
                                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C]"
                                />
                            </div>
                        )}

                        <div className="flex items-center justify-end gap-2 pt-2">
                            <button type="button" onClick={onClose} className="px-4 py-2 font-bold text-slate-500 cursor-pointer">
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={submitting || !scheduledAt}
                                className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-black rounded-xl shadow-xs transition-colors cursor-pointer"
                            >
                                {submitting ? 'Scheduling...' : 'Set Interview Schedule'}
                            </button>
                        </div>
                    </form>
                ) : (
                    <form onSubmit={handleSubmitEvaluate} className="mt-4 space-y-3.5 text-xs text-slate-700 dark:text-slate-300">
                        {/* Rubric Sliders */}
                        <div className="space-y-3 p-3.5 bg-slate-50 dark:bg-[#0B0F19] rounded-2xl border border-slate-200 dark:border-slate-800">
                            <div>
                                <div className="flex items-center justify-between mb-1 font-bold">
                                    <span>Pet Care & Experience Knowledge (1–5)</span>
                                    <span className="text-purple-600 font-black text-sm">{careScore}/5</span>
                                </div>
                                <input
                                    type="range"
                                    min="1"
                                    max="5"
                                    value={careScore}
                                    onChange={(e) => setCareScore(Number(e.target.value))}
                                    className="w-full accent-purple-600"
                                />
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-1 font-bold">
                                    <span>Financial Readiness (Food, Vet, Meds) (1–5)</span>
                                    <span className="text-purple-600 font-black text-sm">{finScore}/5</span>
                                </div>
                                <input
                                    type="range"
                                    min="1"
                                    max="5"
                                    value={finScore}
                                    onChange={(e) => setFinScore(Number(e.target.value))}
                                    className="w-full accent-purple-600"
                                />
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-1 font-bold">
                                    <span>Household Harmony & Commitment (1–5)</span>
                                    <span className="text-purple-600 font-black text-sm">{envScore}/5</span>
                                </div>
                                <input
                                    type="range"
                                    min="1"
                                    max="5"
                                    value={envScore}
                                    onChange={(e) => setEnvScore(Number(e.target.value))}
                                    className="w-full accent-purple-600"
                                />
                            </div>

                            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between font-black text-xs">
                                <span>Total Rubric Score:</span>
                                <span className={`px-2 py-0.5 rounded-lg ${totalScore >= 11 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                                    {totalScore} / 15
                                </span>
                            </div>
                        </div>

                        <div>
                            <label className="block font-bold mb-1">Staff Recommendation</label>
                            <select
                                value={recommendation}
                                onChange={(e) => setRecommendation(e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C] font-semibold"
                            >
                                <option value="Recommended">Recommended (Proceed to Stage 4 Home Visit)</option>
                                <option value="Conditional">Conditional (Needs Follow-up Discussion)</option>
                                <option value="Not_Recommended">Not Recommended (Reject Application)</option>
                            </select>
                        </div>

                        <div>
                            <label className="block font-bold mb-1">Interview Assessment Notes</label>
                            <textarea
                                rows={2}
                                value={interviewNotes}
                                onChange={(e) => setInterviewNotes(e.target.value)}
                                placeholder="Summary of applicant's answers, pet history, and staff observations..."
                                className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C] resize-none"
                            />
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2">
                            <button type="button" onClick={onClose} className="px-4 py-2 font-bold text-slate-500 cursor-pointer">
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={submitting}
                                className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-black rounded-xl shadow-xs transition-colors cursor-pointer"
                            >
                                {submitting ? 'Submitting...' : 'Submit Evaluation'}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
};


// ==========================================
// 3. Stage 4: Home Visit Scheduling & Inspection
// ==========================================
interface HomeVisitModalProps {
    adoptionId: number;
    applicantName: string;
    isOpen: boolean;
    mode: 'schedule' | 'evaluate';
    onClose: () => void;
    onSuccess: () => void;
}

export const AdoptionHomeVisitModal: React.FC<HomeVisitModalProps> = ({
    adoptionId,
    applicantName,
    isOpen,
    mode,
    onClose,
    onSuccess,
}) => {
    // Schedule state
    const [scheduledDate, setScheduledDate] = useState('');
    const [visitType, setVisitType] = useState('Physical');

    // Evaluate state
    const [isFencingSecure, setIsFencingSecure] = useState(true);
    const [isShelterAdequate, setIsShelterAdequate] = useState(true);
    const [hazardFree, setHazardFree] = useState(true);
    const [checklistNotes, setChecklistNotes] = useState('');
    const [photoUrl, setPhotoUrl] = useState('');
    const [inspectionResult, setInspectionResult] = useState('Passed');

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleSubmitSchedule = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);
        try {
            await api.post(`/adoptions/${adoptionId}/home-visit/schedule`, {
                scheduled_date: new Date(scheduledDate).toISOString(),
                visit_type: visitType,
            });
            onSuccess();
            onClose();
        } catch (err: any) {
            console.error("Home visit schedule failed:", err);
            setError(err.response?.data?.detail || "Failed to schedule home visit.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleSubmitEvaluate = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);
        try {
            await api.post(`/adoptions/${adoptionId}/home-visit/evaluate`, {
                is_fencing_secure: isFencingSecure,
                is_shelter_adequate: isShelterAdequate,
                hazard_free: hazardFree,
                checklist_notes: checklistNotes,
                visit_photos: photoUrl ? [photoUrl] : [],
                inspection_result: inspectionResult,
            });
            onSuccess();
            onClose();
        } catch (err: any) {
            console.error("Home visit evaluate failed:", err);
            setError(err.response?.data?.detail || "Failed to record home visit inspection.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
            <div className="bg-white dark:bg-[#151C2C] rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 my-auto">
                <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-2xl bg-teal-100 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 flex items-center justify-center">
                            <Home className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-base font-black text-slate-900 dark:text-white">
                                Stage 4: Home Environment Inspection
                            </h2>
                            <p className="text-xs text-slate-500">Applicant: {applicantName} (App #{adoptionId})</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 cursor-pointer">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {error && (
                    <div className="mt-3 p-3 rounded-xl bg-red-100 text-red-800 text-xs font-bold flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                {mode === 'schedule' ? (
                    <form onSubmit={handleSubmitSchedule} className="mt-4 space-y-3.5 text-xs text-slate-700 dark:text-slate-300">
                        <div>
                            <label className="block font-bold mb-1">Inspection Date <span className="text-red-500">*</span></label>
                            <input
                                type="date"
                                value={scheduledDate}
                                onChange={(e) => setScheduledDate(e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C] font-semibold"
                                required
                            />
                        </div>

                        <div>
                            <label className="block font-bold mb-1">Visit Type</label>
                            <select
                                value={visitType}
                                onChange={(e) => setVisitType(e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C] font-semibold"
                            >
                                <option value="Physical">Physical In-Person Home Visit (Staff/Leader)</option>
                                <option value="Virtual">Virtual Video Walkthrough Inspection</option>
                            </select>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2">
                            <button type="button" onClick={onClose} className="px-4 py-2 font-bold text-slate-500 cursor-pointer">
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={submitting || !scheduledDate}
                                className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-black rounded-xl shadow-xs transition-colors cursor-pointer"
                            >
                                {submitting ? 'Scheduling...' : 'Confirm Home Visit Schedule'}
                            </button>
                        </div>
                    </form>
                ) : (
                    <form onSubmit={handleSubmitEvaluate} className="mt-4 space-y-3.5 text-xs text-slate-700 dark:text-slate-300">
                        <div className="space-y-2 p-3.5 bg-slate-50 dark:bg-[#0B0F19] rounded-2xl border border-slate-200 dark:border-slate-800">
                            <span className="font-black text-slate-900 dark:text-white uppercase tracking-wider text-[11px] block">
                                Living Space Safety Checklist:
                            </span>

                            <label className="flex items-center gap-2 cursor-pointer font-bold">
                                <input
                                    type="checkbox"
                                    checked={isFencingSecure}
                                    onChange={(e) => setIsFencingSecure(e.target.checked)}
                                    className="rounded border-slate-300 text-teal-600"
                                />
                                <span>Perimeter / Gate / Fencing is Secure (No Escape Hazards)</span>
                            </label>

                            <label className="flex items-center gap-2 cursor-pointer font-bold">
                                <input
                                    type="checkbox"
                                    checked={isShelterAdequate}
                                    onChange={(e) => setIsShelterAdequate(e.target.checked)}
                                    className="rounded border-slate-300 text-teal-600"
                                />
                                <span>Shelter is Weather-Protected (Rain/Sun Shading)</span>
                            </label>

                            <label className="flex items-center gap-2 cursor-pointer font-bold">
                                <input
                                    type="checkbox"
                                    checked={hazardFree}
                                    onChange={(e) => setHazardFree(e.target.checked)}
                                    className="rounded border-slate-300 text-teal-600"
                                />
                                <span>Environment is Hazard-Free & Clean (No exposed poisons/wires)</span>
                            </label>
                        </div>

                        <div>
                            <label className="block font-bold mb-1">Inspection Photo Evidence URL</label>
                            <input
                                type="url"
                                value={photoUrl}
                                onChange={(e) => setPhotoUrl(e.target.value)}
                                placeholder="https://... photo of gate/yard/shelter"
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C]"
                            />
                        </div>

                        <div>
                            <label className="block font-bold mb-1">Inspection Result</label>
                            <select
                                value={inspectionResult}
                                onChange={(e) => setInspectionResult(e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C] font-semibold"
                            >
                                <option value="Passed">Passed (Advance to Stage 5 Consolidated Review)</option>
                                <option value="Needs_Fix">Needs Adjustments (Require resident to fix fence/hazard)</option>
                                <option value="Failed">Failed (Unsuitable Living Conditions - Reject)</option>
                            </select>
                        </div>

                        <div>
                            <label className="block font-bold mb-1">Inspector Remarks</label>
                            <textarea
                                rows={2}
                                value={checklistNotes}
                                onChange={(e) => setChecklistNotes(e.target.value)}
                                placeholder="Notes on yard size, family members met, animal space..."
                                className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C] resize-none"
                            />
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2">
                            <button type="button" onClick={onClose} className="px-4 py-2 font-bold text-slate-500 cursor-pointer">
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={submitting}
                                className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-black rounded-xl shadow-xs transition-colors cursor-pointer"
                            >
                                {submitting ? 'Recording...' : 'Submit Inspection'}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
};


// ==========================================
// 4. Stage 8: Physical Handover Confirmation
// ==========================================
interface HandoverModalProps {
    adoptionId: number;
    animalName: string;
    applicantName: string;
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export const AdoptionHandoverModal: React.FC<HandoverModalProps> = ({
    adoptionId,
    animalName,
    applicantName,
    isOpen,
    onClose,
    onSuccess,
}) => {
    const [location, setLocation] = useState('Barangay Animal Facility');
    const [photoUrl, setPhotoUrl] = useState('');
    const [notes, setNotes] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);
        try {
            await api.post(`/adoptions/${adoptionId}/handover/complete`, {
                handover_location: location,
                handover_photo_url: photoUrl || null,
                notes: notes,
            });
            onSuccess();
            onClose();
        } catch (err: any) {
            console.error("Handover failed:", err);
            setError(err.response?.data?.detail || "Failed to confirm handover.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
            <div className="bg-white dark:bg-[#151C2C] rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 my-auto">
                <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                            <HeartHandshake className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-base font-black text-slate-900 dark:text-white">
                                Stage 8: Physical Handover Transfer
                            </h2>
                            <p className="text-xs text-slate-500">Transferring {animalName} to {applicantName}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 cursor-pointer">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {error && (
                    <div className="mt-3 p-3 rounded-xl bg-red-100 text-red-800 text-xs font-bold flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="mt-4 space-y-3.5 text-xs text-slate-700 dark:text-slate-300">
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-800/80 text-emerald-900 dark:text-emerald-200">
                        <p className="leading-relaxed">
                            Completing this step will automatically:
                            <br />✓ Register <strong>{animalName}</strong> as an official pet under <strong>{applicantName}</strong>'s account.
                            <br />✓ Mark shelter record as officially Adopted (Status 7).
                            <br />✓ Transition to <strong>Stage 9: 1-Month Welfare Monitoring</strong> (Day 7, 14, 30).
                        </p>
                    </div>

                    <div>
                        <label className="block font-bold mb-1">Handover Physical Location</label>
                        <input
                            type="text"
                            value={location}
                            onChange={(e) => setLocation(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C] font-semibold"
                        />
                    </div>

                    <div>
                        <label className="block font-bold mb-1">Dual Handover Photographic Evidence URL</label>
                        <input
                            type="url"
                            value={photoUrl}
                            onChange={(e) => setPhotoUrl(e.target.value)}
                            placeholder="https://... photo of adopter with animal and authorized staff"
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C]"
                        />
                    </div>

                    <div>
                        <label className="block font-bold mb-1">Handover Observations & Collar Notes</label>
                        <textarea
                            rows={2}
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Pet condition at pickup, collar and medical booklet issued..."
                            className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C] resize-none"
                        />
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 font-bold text-slate-500 cursor-pointer">
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={submitting}
                            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl shadow-xs transition-colors cursor-pointer"
                        >
                            {submitting ? 'Finalizing Handover...' : 'Confirm Pet Handover & Start Monitoring'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};


// ==========================================
// 5. Stage 1-9: Unified Adoption Dossier Modal
// ==========================================
interface DossierModalProps {
    adoptionId: number;
    isOpen: boolean;
    onClose: () => void;
}

export const AdoptionDossierModal: React.FC<DossierModalProps> = ({
    adoptionId,
    isOpen,
    onClose,
}) => {
    const [dossier, setDossier] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!isOpen || !adoptionId) return;

        const fetchDossier = async () => {
            setLoading(true);
            try {
                const res = await api.get(`/adoptions/${adoptionId}/dossier`);
                setDossier(res.data);
            } catch (err) {
                console.error("Failed to load dossier:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchDossier();
    }, [isOpen, adoptionId]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
            <div className="bg-white dark:bg-[#151C2C] rounded-3xl max-w-3xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 my-auto max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-2xl bg-orange-100 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400 flex items-center justify-center">
                            <FileText className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                                9-Stage Unified Adoption Dossier
                            </h2>
                            <p className="text-xs text-slate-500">
                                Complete Lifecycle Audit & Verification Trail (App #{adoptionId})
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 cursor-pointer">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {loading ? (
                    <div className="py-16 text-center space-y-3">
                        <div className="w-10 h-10 border-3 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto" />
                        <p className="text-xs font-bold text-slate-500">Compiling 9-stage adoption dossier...</p>
                    </div>
                ) : dossier ? (
                    <div className="mt-5 space-y-5 text-xs">
                        {/* Summary Card */}
                        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div>
                                <span className="text-[10px] text-slate-400 font-bold uppercase block">Applicant</span>
                                <span className="font-black text-slate-900 dark:text-white">{dossier.adoption?.full_name}</span>
                            </div>
                            <div>
                                <span className="text-[10px] text-slate-400 font-bold uppercase block">Pet</span>
                                <span className="font-black text-slate-900 dark:text-white">{dossier.adoption?.animal_name || 'Pet'}</span>
                            </div>
                            <div>
                                <span className="text-[10px] text-slate-400 font-bold uppercase block">Current Stage</span>
                                <span className="font-black text-orange-600">{dossier.adoption?.current_stage}</span>
                            </div>
                            <div>
                                <span className="text-[10px] text-slate-400 font-bold uppercase block">Overall Status</span>
                                <span className="font-black text-slate-900 dark:text-white">{dossier.adoption?.status}</span>
                            </div>
                        </div>

                        {/* Stage Breakdown Cards */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                            {/* Stage 2 Verification */}
                            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111624] space-y-1.5">
                                <div className="flex items-center gap-1.5 font-black text-slate-900 dark:text-white">
                                    <ShieldCheck className="w-4 h-4 text-blue-500" /> Stage 2: Verification
                                </div>
                                {dossier.verification ? (
                                    <div className="space-y-1 text-[11px] text-slate-600 dark:text-slate-400">
                                        <p>ID Match: <strong>{dossier.verification.id_match_status}</strong></p>
                                        <p>Residency: <strong>{dossier.verification.residency_status}</strong></p>
                                        <p>Blacklisted: <strong className={dossier.verification.is_blacklisted ? 'text-red-500' : 'text-emerald-600'}>{dossier.verification.is_blacklisted ? 'YES' : 'Clean'}</strong></p>
                                        {dossier.verification.verification_notes && <p className="italic">"{dossier.verification.verification_notes}"</p>}
                                    </div>
                                ) : (
                                    <span className="text-slate-400 italic text-[11px]">Pending Stage 2 Evaluation</span>
                                )}
                            </div>

                            {/* Stage 3 Interview */}
                            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111624] space-y-1.5">
                                <div className="flex items-center gap-1.5 font-black text-slate-900 dark:text-white">
                                    <Video className="w-4 h-4 text-purple-500" /> Stage 3: Interview
                                </div>
                                {dossier.interview ? (
                                    <div className="space-y-1 text-[11px] text-slate-600 dark:text-slate-400">
                                        <p>Mode: <strong>{dossier.interview.interview_mode}</strong></p>
                                        <p>Rubric Score: <strong>{dossier.interview.total_score ?? 'Pending'} / 15</strong></p>
                                        <p>Recommendation: <strong>{dossier.interview.recommendation}</strong></p>
                                        {dossier.interview.interview_notes && <p className="italic">"{dossier.interview.interview_notes}"</p>}
                                    </div>
                                ) : (
                                    <span className="text-slate-400 italic text-[11px]">Pending Stage 3 Evaluation</span>
                                )}
                            </div>

                            {/* Stage 4 Home Visit */}
                            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111624] space-y-1.5">
                                <div className="flex items-center gap-1.5 font-black text-slate-900 dark:text-white">
                                    <Home className="w-4 h-4 text-teal-500" /> Stage 4: Home Visit
                                </div>
                                {dossier.home_visit ? (
                                    <div className="space-y-1 text-[11px] text-slate-600 dark:text-slate-400">
                                        <p>Fencing Secure: <strong>{dossier.home_visit.is_fencing_secure ? 'Yes' : 'No'}</strong></p>
                                        <p>Shelter Adequate: <strong>{dossier.home_visit.is_shelter_adequate ? 'Yes' : 'No'}</strong></p>
                                        <p>Result: <strong>{dossier.home_visit.inspection_result}</strong></p>
                                        {dossier.home_visit.checklist_notes && <p className="italic">"{dossier.home_visit.checklist_notes}"</p>}
                                    </div>
                                ) : (
                                    <span className="text-slate-400 italic text-[11px]">Pending Stage 4 Inspection</span>
                                )}
                            </div>

                            {/* Stage 7 Certificate */}
                            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111624] space-y-1.5">
                                <div className="flex items-center gap-1.5 font-black text-slate-900 dark:text-white">
                                    <Award className="w-4 h-4 text-amber-500" /> Stage 7: Certificate
                                </div>
                                {dossier.certificate ? (
                                    <div className="space-y-1 text-[11px] text-slate-600 dark:text-slate-400">
                                        <p>Cert #: <strong>{dossier.certificate.certificate_number}</strong></p>
                                        <p className="truncate">SHA-256: <span className="font-mono text-[10px]">{dossier.certificate.verification_hash?.slice(0, 16)}...</span></p>
                                        <p>Issued: {new Date(dossier.certificate.issued_at).toLocaleDateString()}</p>
                                    </div>
                                ) : (
                                    <span className="text-slate-400 italic text-[11px]">Pending Agreement Signature</span>
                                )}
                            </div>
                        </div>

                        {/* Chronological Audit Timeline */}
                        <div className="pt-2">
                            <span className="font-black text-slate-900 dark:text-white uppercase tracking-wider text-[11px] block mb-2.5">
                                Complete Audit Timeline Logs:
                            </span>
                            <div className="space-y-2 max-h-48 overflow-y-auto">
                                {dossier.timeline_logs && dossier.timeline_logs.length > 0 ? (
                                    dossier.timeline_logs.map((tl: any) => (
                                        <div key={tl.timeline_id} className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-slate-800 text-[11px] flex items-start justify-between gap-2">
                                            <div>
                                                <span className="font-bold text-slate-800 dark:text-slate-200">
                                                    [{tl.stage}] {tl.action}
                                                </span>
                                                {tl.notes && <p className="text-slate-500 mt-0.5">{tl.notes}</p>}
                                            </div>
                                            <span className="text-[10px] text-slate-400 whitespace-nowrap">
                                                {new Date(tl.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-slate-400 italic">No timeline entries recorded yet.</p>
                                )}
                            </div>
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
};
