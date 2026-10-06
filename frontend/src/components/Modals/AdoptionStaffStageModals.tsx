import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../utils/api';
import { uploadDirectToCloudinary } from '../../utils/cloudinaryUpload';
import { compressImageFiles } from '../../utils/imageCompress';
import { getPetPicture } from '../../utils/avatar';
import { printElementById } from '../../utils/exportUtils';
import { 
    ShieldCheck, 
    X, 
    Video, 
    Home, 
    HeartHandshake, 
    FileText, 
    AlertCircle,
    Award,
    ClipboardCheck,
    Camera,
    UploadCloud,
    Trash2,
    CheckCircle2,
    Eye,
    Maximize2,
    Calendar,
    FolderKanban,
    Activity
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
// 2. Stage 3: Interview Modal (Schedule, Conduct/Evaluate, View Log)
// ==========================================
// Valid assignees for an application (same barangay, active, not the applicant) from the backend.
type StaffOption = { user_id: number; name: string; position_name?: string; is_head_officer?: boolean; open_tasks?: number };
const staffOptionLabel = (p: StaffOption) =>
    `${p.name}${p.position_name ? ` (${p.position_name})` : ''}${p.open_tasks ? ` · ${p.open_tasks} open task${p.open_tasks > 1 ? 's' : ''}` : ''}`;
const readStaffUser = (): { user_id?: number; name?: string; is_head_officer?: boolean; role_id?: number } | null => {
    try {
        const raw = localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user') || localStorage.getItem('admin_user');
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
};
const needsOverrideReason = (detail: unknown) => typeof detail === 'string' && detail.toLowerCase().includes('override reason');

interface InterviewModalProps {
    adoptionId: number;
    applicantName: string;
    isOpen: boolean;
    mode: 'schedule' | 'evaluate' | 'view_log';
    existingData?: any;
    onClose: () => void;
    onSuccess: () => void;
}

export const AdoptionInterviewModal: React.FC<InterviewModalProps> = ({
    adoptionId,
    applicantName,
    isOpen,
    mode,
    existingData,
    onClose,
    onSuccess,
}) => {
    // Schedule state
    const [interviewDate, setInterviewDate] = useState('');
    const [interviewTime, setInterviewTime] = useState('');
    const [interviewMode, setInterviewMode] = useState('In-Person');
    const [location, setLocation] = useState('Barangay Animal Welfare Center');
    const [interviewerName, setInterviewerName] = useState('');
    const [scheduleNotes, setScheduleNotes] = useState('');
    const [meetingLink, setMeetingLink] = useState('');

    // Evaluate state
    const [conductedDate, setConductedDate] = useState('');
    const [conductedTime, setConductedTime] = useState('');
    const [actualInterviewer, setActualInterviewer] = useState('');
    const [interviewResult, setInterviewResult] = useState('Successful');
    const [questionsDiscussed, setQuestionsDiscussed] = useState('');
    const [applicantResponses, setApplicantResponses] = useState('');
    const [additionalObservations, setAdditionalObservations] = useState('');
    const [interviewLogNotes, setInterviewLogNotes] = useState('');
    const careScore = 5;
    const finScore = 5;
    const envScore = 5;

    // Personnel state for dropdown
    const [personnelList, setPersonnelList] = useState<StaffOption[]>([]);
    const [loadingPersonnel, setLoadingPersonnel] = useState(false);
    // The interviewer is assigned by user id (the backend stores exactly this person)
    const [interviewerId, setInterviewerId] = useState<number | ''>('');
    const [overrideReason, setOverrideReason] = useState('');
    const [showOverride, setShowOverride] = useState(false);
    const staffUser = readStaffUser();
    const isCaseAuthority = Boolean(staffUser?.is_head_officer || staffUser?.role_id === 4);

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            setError(null);

            // Fetch barangay personnel
            const fetchPersonnel = async () => {
                try {
                    setLoadingPersonnel(true);
                    const res = await api.get(`/adoptions/${adoptionId}/assignable-staff`);
                    if (Array.isArray(res.data)) {
                        setPersonnelList(res.data);
                    }
                } catch (err) {
                    console.warn("Could not load personnel list:", err);
                } finally {
                    setLoadingPersonnel(false);
                }
            };
            fetchPersonnel();

            // Default interviewer to logged in user if not previously assigned
            const rawUser = localStorage.getItem('staff_user') || localStorage.getItem('user') || sessionStorage.getItem('staff_user') || sessionStorage.getItem('user');
            let currentUserName = '';
            try {
                if (rawUser) {
                    const parsed = JSON.parse(rawUser);
                    currentUserName = parsed?.name || '';
                }
            } catch (e) {
                console.warn('Error reading current user', e);
            }

            setShowOverride(false);
            setOverrideReason('');
            setInterviewerId(existingData?.interviewer_id ?? (staffUser?.user_id || ''));
            if (existingData) {
                if (existingData.interview_mode) setInterviewMode(existingData.interview_mode);
                if (existingData.interviewer_name) {
                    setInterviewerName(existingData.interviewer_name);
                    setActualInterviewer(existingData.interviewer_name);
                } else if (currentUserName) {
                    setInterviewerName(currentUserName);
                    setActualInterviewer(currentUserName);
                }
                if (existingData.interview_notes) {
                    setScheduleNotes(existingData.interview_notes);
                    setInterviewLogNotes(existingData.interview_notes);
                }
                if (existingData.questions_discussed) setQuestionsDiscussed(existingData.questions_discussed);
                if (existingData.applicant_responses) setApplicantResponses(existingData.applicant_responses);
                if (existingData.additional_observations) setAdditionalObservations(existingData.additional_observations);
                // Only pre-select a real outcome; a scheduled interview's placeholder 'Pending' must not be submitted silently
                if (['Successful', 'Needs Follow-up', 'Unsuccessful'].includes(existingData.interview_result)) setInterviewResult(existingData.interview_result);
                if (existingData.location) setLocation(existingData.location);
            } else if (currentUserName) {
                setInterviewerName(currentUserName);
                setActualInterviewer(currentUserName);
            }
        }
    }, [isOpen, existingData]);

    if (!isOpen) return null;

    const handleSubmitSchedule = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!interviewDate || !interviewTime) {
            setError("Please select both interview date and time.");
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            const combinedDateTime = new Date(`${interviewDate}T${interviewTime}`).toISOString();
            await api.post(`/adoptions/${adoptionId}/interview/schedule`, {
                scheduled_at: combinedDateTime,
                interview_mode: interviewMode,
                location: location || undefined,
                interviewer_id: interviewerId === '' ? undefined : interviewerId,
                notes: scheduleNotes || undefined,
                meeting_link: meetingLink || undefined,
                override_reason: showOverride ? overrideReason.trim() || undefined : undefined,
            });
            onSuccess();
            onClose();
        } catch (err: any) {
            console.error("Schedule interview failed:", err);
            if (needsOverrideReason(err.response?.data?.detail)) setShowOverride(true);
            setError(err.response?.data?.detail || "Failed to schedule interview.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleSubmitEvaluate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!interviewLogNotes.trim()) {
            setError("Please provide interview notes / comments log.");
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            const conductedAt = conductedDate && conductedTime ? new Date(`${conductedDate}T${conductedTime}`).toISOString() : undefined;
            await api.post(`/adoptions/${adoptionId}/interview/evaluate`, {
                score_care_knowledge: careScore,
                score_financial_readiness: finScore,
                score_environment_suitability: envScore,
                interview_result: interviewResult,
                recommendation: interviewResult,
                conducted_at: conductedAt,
                override_reason: showOverride ? overrideReason.trim() || undefined : undefined,
                questions_discussed: questionsDiscussed || undefined,
                applicant_responses: applicantResponses || undefined,
                additional_observations: additionalObservations || undefined,
                interview_notes: interviewLogNotes,
            });
            onSuccess();
            onClose();
        } catch (err: any) {
            console.error("Evaluate interview failed:", err);
            if (needsOverrideReason(err.response?.data?.detail)) setShowOverride(true);
            setError(err.response?.data?.detail || "Failed to submit interview assessment.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
            <div className="bg-white dark:bg-[#151C2C] rounded-3xl max-w-xl w-full p-6 sm:p-7 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 my-auto max-h-[92vh] overflow-y-auto">
                <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-2xl bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                            <Video className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                                {mode === 'schedule' ? 'Schedule Interview' : mode === 'evaluate' ? 'Conduct & Record Interview' : 'Interview Log & Details'}
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
                {showOverride && (
                    <div className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs space-y-1.5">
                        <label className="block font-black text-amber-900">Override reason (recorded in the audit trail)</label>
                        <input
                            type="text"
                            value={overrideReason}
                            onChange={(e) => setOverrideReason(e.target.value)}
                            placeholder="e.g. Assigned interviewer is on leave"
                            className="w-full px-3 py-2 rounded-xl border border-amber-300 bg-white font-medium"
                        />
                        <p className="text-amber-800">Submit again to record this task yourself.</p>
                    </div>
                )}

                {/* ── MODE: SCHEDULE ── */}
                {mode === 'schedule' && (
                    <form onSubmit={handleSubmitSchedule} className="mt-4 space-y-3.5 text-xs text-slate-700 dark:text-slate-300">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="block font-bold mb-1">Interview Date <span className="text-red-500">*</span></label>
                                <input
                                    type="date"
                                    value={interviewDate}
                                    onChange={(e) => setInterviewDate(e.target.value)}
                                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C] font-semibold"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block font-bold mb-1">Interview Time <span className="text-red-500">*</span></label>
                                <input
                                    type="time"
                                    value={interviewTime}
                                    onChange={(e) => setInterviewTime(e.target.value)}
                                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C] font-semibold"
                                    required
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="block font-bold mb-1">Interview Location or Method</label>
                                <select
                                    value={interviewMode}
                                    onChange={(e) => setInterviewMode(e.target.value)}
                                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C] font-semibold"
                                >
                                    <option value="In-Person">In-Person (Barangay Animal Facility)</option>
                                    <option value="Video_Call">Video Call (Google Meet / Zoom)</option>
                                    <option value="Phone">Phone Interview</option>
                                </select>
                            </div>
                            <div>
                                <label className="block font-bold mb-1">Assigned Barangay Interviewer</label>
                                <select
                                    value={interviewerId}
                                    onChange={(e) => setInterviewerId(e.target.value ? Number(e.target.value) : '')}
                                    disabled={!isCaseAuthority}
                                    title={!isCaseAuthority ? 'Only the case owner can change the interviewer' : undefined}
                                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C] font-medium text-slate-900 dark:text-white cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
                                >
                                    <option value="">{loadingPersonnel ? "Loading personnel..." : "-- Select Barangay Interviewer --"}</option>
                                    {personnelList.map((person) => (
                                        <option key={person.user_id} value={person.user_id}>
                                            {staffOptionLabel(person)}
                                        </option>
                                    ))}
                                    {interviewerId !== '' && !personnelList.some((p) => p.user_id === interviewerId) && (
                                        <option value={interviewerId}>{existingData?.interviewer_name || interviewerName || 'Current interviewer'}</option>
                                    )}
                                </select>
                                <p className="mt-1 text-[10px] text-slate-500">
                                    {isCaseAuthority ? 'They receive the task on their Adoption Tasks page and must accept it.' : 'You are rescheduling your own assigned interview.'}
                                </p>
                            </div>
                        </div>

                        {interviewMode === 'In-Person' ? (
                            <div>
                                <label className="block font-bold mb-1">Facility / Station Venue</label>
                                <input
                                    type="text"
                                    value={location}
                                    onChange={(e) => setLocation(e.target.value)}
                                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C]"
                                />
                            </div>
                        ) : (
                            <div>
                                <label className="block font-bold mb-1">Meeting Link / Instructions</label>
                                <input
                                    type="text"
                                    value={meetingLink}
                                    onChange={(e) => setMeetingLink(e.target.value)}
                                    placeholder="https://meet.google.com/..."
                                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C]"
                                />
                            </div>
                        )}

                        <div>
                            <label className="block font-bold mb-1">Optional Notes for Applicant</label>
                            <textarea
                                rows={2}
                                value={scheduleNotes}
                                onChange={(e) => setScheduleNotes(e.target.value)}
                                placeholder="Instructions or documents to prepare for the interview session..."
                                className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C] resize-none"
                            />
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2">
                            <button type="button" onClick={onClose} className="px-4 py-2 font-bold text-slate-500 cursor-pointer">
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={submitting || !interviewDate || !interviewTime}
                                className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-black rounded-xl shadow-xs transition-colors cursor-pointer"
                            >
                                {submitting ? 'Scheduling...' : 'Confirm Interview Schedule'}
                            </button>
                        </div>
                    </form>
                )}

                {/* ── MODE: EVALUATE / RECORD ── */}
                {mode === 'evaluate' && (
                    <form onSubmit={handleSubmitEvaluate} className="mt-4 space-y-3.5 text-xs text-slate-700 dark:text-slate-300">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                            <div>
                                <label className="block font-bold mb-1">Interview Date</label>
                                <input
                                    type="date"
                                    value={conductedDate}
                                    onChange={(e) => setConductedDate(e.target.value)}
                                    className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C]"
                                />
                            </div>
                            <div>
                                <label className="block font-bold mb-1">Interview Time</label>
                                <input
                                    type="time"
                                    value={conductedTime}
                                    onChange={(e) => setConductedTime(e.target.value)}
                                    className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C]"
                                />
                            </div>
                            <div>
                                <label className="block font-bold mb-1">Interviewer</label>
                                <div className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F19] font-semibold text-slate-900 dark:text-white">
                                    {existingData?.interviewer_name || actualInterviewer || 'You'}
                                </div>
                            </div>
                        </div>

                        {/* Interview Result Selection */}
                        <div>
                            <label className="block font-black text-slate-900 dark:text-white uppercase tracking-wider text-[11px] mb-1.5">
                                Interview Result / Status <span className="text-red-500">*</span>
                            </label>
                            <div className="grid grid-cols-3 gap-2">
                                {[
                                    { id: 'Successful', label: '✓ Successful', desc: 'Proceed to Home Visit', color: 'bg-emerald-600 text-white border-emerald-600 shadow-xs' },
                                    { id: 'Needs Follow-up', label: '↻ Needs Follow-up', desc: 'Stay in Interview', color: 'bg-amber-500 text-white border-amber-500 shadow-xs' },
                                    { id: 'Unsuccessful', label: '✕ Unsuccessful', desc: 'Return / Disapprove', color: 'bg-red-600 text-white border-red-600 shadow-xs' },
                                ].map((opt) => (
                                    <button
                                        key={opt.id}
                                        type="button"
                                        onClick={() => setInterviewResult(opt.id)}
                                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                                            interviewResult === opt.id
                                                ? opt.color
                                                : 'bg-slate-50 dark:bg-[#0B0F19] border-slate-200 dark:border-slate-800 text-slate-700'
                                        }`}
                                    >
                                        <div className="font-black text-xs">{opt.label}</div>
                                        <div className="text-[10px] opacity-85 mt-0.5">{opt.desc}</div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="block font-bold mb-1">Questions Discussed</label>
                            <textarea
                                rows={2}
                                value={questionsDiscussed}
                                onChange={(e) => setQuestionsDiscussed(e.target.value)}
                                placeholder="Key questions asked (e.g. daily routine, vet access, feeding schedule, previous pets)..."
                                className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C] resize-none"
                            />
                        </div>

                        <div>
                            <label className="block font-bold mb-1">Applicant Responses & Demeanor</label>
                            <textarea
                                rows={2}
                                value={applicantResponses}
                                onChange={(e) => setApplicantResponses(e.target.value)}
                                placeholder="Applicant's answers, willingness to care, financial preparedness, household support..."
                                className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C] resize-none"
                            />
                        </div>

                        <div>
                            <label className="block font-bold mb-1">Additional Observations</label>
                            <input
                                type="text"
                                value={additionalObservations}
                                onChange={(e) => setAdditionalObservations(e.target.value)}
                                placeholder="Staff observations on behavior, confidence with animals, household dynamics..."
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C]"
                            />
                        </div>

                        <div>
                            <label className="block font-bold mb-1">
                                Interview Log / Comments <span className="text-red-500">*</span>
                            </label>
                            <textarea
                                rows={3}
                                value={interviewLogNotes}
                                onChange={(e) => setInterviewLogNotes(e.target.value)}
                                placeholder="Official interview summary log and recommendations for the Home Visit team..."
                                className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C] resize-none"
                                required
                            />
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2">
                            <button type="button" onClick={onClose} className="px-4 py-2 font-bold text-slate-500 cursor-pointer">
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={submitting || !interviewLogNotes.trim()}
                                className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-black rounded-xl shadow-xs transition-colors cursor-pointer"
                            >
                                {submitting ? 'Recording Interview...' : 'Record Interview & Update Stage'}
                            </button>
                        </div>
                    </form>
                )}

                {/* ── MODE: VIEW LOG ── */}
                {mode === 'view_log' && (
                    <div className="mt-4 space-y-3.5 text-xs text-slate-700 dark:text-slate-300">
                        <div className="p-3.5 rounded-2xl bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200/80 flex items-center justify-between">
                            <div>
                                <span className="text-[10px] font-black uppercase text-purple-700">Interview Result:</span>
                                <h4 className="font-black text-sm text-purple-900">{existingData?.interview_result || 'Completed'}</h4>
                            </div>
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-purple-200 text-purple-800">
                                {existingData?.interview_mode || 'In-Person'}
                            </span>
                        </div>

                        {existingData?.interviewer_name && (
                            <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 flex items-center justify-between">
                                <span className="font-bold text-slate-500">Interviewer:</span>
                                <span className="font-black text-slate-900 dark:text-white">{existingData.interviewer_name}</span>
                            </div>
                        )}
                        {existingData?.interview_evaluated_by_name && existingData.interview_evaluated_by_name !== existingData.interviewer_name && (
                            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between">
                                <span className="font-bold text-amber-800">Recorded by (override):</span>
                                <span className="font-black text-amber-950">{existingData.interview_evaluated_by_name}</span>
                            </div>
                        )}

                        {existingData?.questions_discussed && (
                            <div className="p-3 rounded-xl bg-white dark:bg-[#151C2C] border border-slate-200 space-y-1">
                                <span className="font-bold text-slate-500 block">Questions Discussed:</span>
                                <p className="leading-relaxed">{existingData.questions_discussed}</p>
                            </div>
                        )}

                        {existingData?.applicant_responses && (
                            <div className="p-3 rounded-xl bg-white dark:bg-[#151C2C] border border-slate-200 space-y-1">
                                <span className="font-bold text-slate-500 block">Applicant Responses:</span>
                                <p className="leading-relaxed">{existingData.applicant_responses}</p>
                            </div>
                        )}

                        {existingData?.interview_notes && (
                            <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 space-y-1">
                                <span className="font-bold text-slate-500 block">Official Interview Log / Notes:</span>
                                <p className="leading-relaxed font-medium">"{existingData.interview_notes}"</p>
                            </div>
                        )}

                        <div className="flex justify-end pt-2">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-black rounded-xl cursor-pointer"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};


// ==========================================
// 3. Stage 4: Home Visit Modal (Schedule, Evaluate, View Assessment)
// ==========================================
interface HomeVisitModalProps {
    adoptionId: number;
    applicantName: string;
    applicantAddress?: string;
    applicantContact?: string;
    isOpen: boolean;
    mode: 'schedule' | 'evaluate' | 'view_assessment';
    existingData?: any;
    onClose: () => void;
    onSuccess: () => void;
}

export const HOME_ENVIRONMENT_CHECKLIST_ITEMS = [
    {
        key: 'perimeter_fencing_secure',
        label: 'Perimeter / Gate / Fencing is Secure',
        description: 'No escape hazards and the animal can be safely contained.',
    },
    {
        key: 'adequate_living_space_shelter',
        label: 'Adequate Living Space & Weather-Protected Shelter',
        description: 'The animal has enough space and protection from weather conditions.',
    },
    {
        key: 'cleanliness_sanitation_hazards',
        label: 'Cleanliness, Sanitation & Free of Hazards',
        description: 'No exposed wires, dangerous objects, poisons, or other obvious hazards.',
    },
    {
        key: 'food_clean_water',
        label: 'Food & Clean Water Availability',
        description: 'The adopter has a safe and accessible area for food and clean drinking water.',
    },
    {
        key: 'safe_sleeping_area',
        label: 'Safe Sleeping / Resting Area',
        description: 'The animal has an appropriate and safe place to sleep or rest.',
    },
    {
        key: 'proper_ventilation_temperature',
        label: 'Proper Ventilation & Temperature Protection',
        description: 'The living area has sufficient ventilation and protection from extreme heat or cold.',
    },
    {
        key: 'safe_indoor_outdoor',
        label: 'Safe Indoor / Outdoor Environment',
        description: 'The animal has a safe environment with minimized risks of injury or escape.',
    },
    {
        key: 'household_members_aware',
        label: 'Household Members Aware of Pet Responsibilities',
        description: 'Household members understand the responsibilities of caring for the adopted animal.',
    },
    {
        key: 'existing_pets_accommodated',
        label: 'Existing Pets Can Be Safely Accommodated',
        description: 'Existing pets are considered and can safely coexist with the adopted animal.',
    },
    {
        key: 'no_dangerous_threats',
        label: 'No Dangerous Animals or Environmental Threats',
        description: 'No immediate environmental conditions or animals that could pose a serious safety concern.',
    },
    {
        key: 'adopter_pet_supplies',
        label: 'Adopter Has Appropriate Pet Supplies',
        description: 'Basic supplies such as food containers, leash/collar, bedding, and other necessary items are available.',
    },
    {
        key: 'overall_environment_suitable',
        label: 'Overall Environment is Suitable for Adoption',
        description: 'The residence is generally appropriate for the animal being adopted.',
    },
];

export const AdoptionHomeVisitModal: React.FC<HomeVisitModalProps> = ({
    adoptionId,
    applicantName,
    applicantAddress = '',
    applicantContact = '',
    isOpen,
    mode,
    existingData,
    onClose,
    onSuccess,
}) => {
    // Schedule state
    const [visitDate, setVisitDate] = useState('');
    const [visitTime, setVisitTime] = useState('');
    const [assignedPersonnel, setAssignedPersonnel] = useState('');
    const [residentialAddress, setResidentialAddress] = useState(applicantAddress);
    const [contactInfo, setContactInfo] = useState(applicantContact);
    const [locationMapNotes, setLocationMapNotes] = useState('');
    const [visitType, setVisitType] = useState('Physical');

    // Evaluate state - 12 Checklist items (Default all false / unchecked)
    const [checklist, setChecklist] = useState<Record<string, boolean>>({
        perimeter_fencing_secure: false,
        adequate_living_space_shelter: false,
        cleanliness_sanitation_hazards: false,
        food_clean_water: false,
        safe_sleeping_area: false,
        proper_ventilation_temperature: false,
        safe_indoor_outdoor: false,
        household_members_aware: false,
        existing_pets_accommodated: false,
        no_dangerous_threats: false,
        adopter_pet_supplies: false,
        overall_environment_suitable: false,
    });

    const [residenceCondition, setResidenceCondition] = useState('Good');
    const [existingPetsNotes, setExistingPetsNotes] = useState('');
    const [homeVisitResult, setHomeVisitResult] = useState<'Suitable' | 'With Conditions' | 'Follow-up' | 'Not Suitable'>('Suitable');
    const [recommendations, setRecommendations] = useState('');
    const [homeVisitLogComments, setHomeVisitLogComments] = useState('');

    // Photo Files and Upload state
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [filePreviewUrls, setFilePreviewUrls] = useState<string[]>([]);
    const [existingPhotoUrls, setExistingPhotoUrls] = useState<string[]>([]);
    const [uploadingPhotos, setUploadingPhotos] = useState(false);
    const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const cameraInputRef = useRef<HTMLInputElement | null>(null);

    // Personnel state for dropdown
    const [personnelList, setPersonnelList] = useState<StaffOption[]>([]);
    const [loadingPersonnel, setLoadingPersonnel] = useState(false);
    const [inspectorId, setInspectorId] = useState<number | ''>('');
    const [rescheduleReason, setRescheduleReason] = useState('');
    const [overrideReason, setOverrideReason] = useState('');
    const [showOverride, setShowOverride] = useState(false);
    const staffUser = readStaffUser();
    const isCaseAuthority = Boolean(staffUser?.is_head_officer || staffUser?.role_id === 4);
    const isReschedule = Boolean(existingData?.home_visit_scheduled_date || existingData?.scheduled_date);

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleChecklistToggle = (key: string) => {
        setChecklist((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    const handleSelectAllChecklist = (val: boolean) => {
        const next: Record<string, boolean> = {};
        HOME_ENVIRONMENT_CHECKLIST_ITEMS.forEach((item) => {
            next[item.key] = val;
        });
        setChecklist(next);
    };

    useEffect(() => {
        if (isOpen) {
            setError(null);
            if (applicantAddress) setResidentialAddress(applicantAddress);
            if (applicantContact) setContactInfo(applicantContact);

            // Fetch barangay personnel
            const fetchPersonnel = async () => {
                try {
                    setLoadingPersonnel(true);
                    const res = await api.get(`/adoptions/${adoptionId}/assignable-staff`);
                    if (Array.isArray(res.data)) {
                        setPersonnelList(res.data);
                    }
                } catch (err) {
                    console.warn("Could not load personnel list:", err);
                } finally {
                    setLoadingPersonnel(false);
                }
            };
            fetchPersonnel();

            const rawUser = localStorage.getItem('staff_user') || localStorage.getItem('user') || sessionStorage.getItem('staff_user') || sessionStorage.getItem('user');
            let currentUserName = '';
            try {
                if (rawUser) {
                    const parsed = JSON.parse(rawUser);
                    currentUserName = parsed?.name || '';
                }
            } catch (e) {
                console.warn('Error reading current user', e);
            }

            setShowOverride(false);
            setOverrideReason('');
            setRescheduleReason('');
            setInspectorId(existingData?.home_visit_inspector_id ?? existingData?.inspector_id ?? (staffUser?.user_id || ''));
            if (existingData) {
                if (existingData.inspector_name || existingData.home_visit_inspector_name) {
                    setAssignedPersonnel(existingData.inspector_name || existingData.home_visit_inspector_name);
                } else if (currentUserName) {
                    setAssignedPersonnel(currentUserName);
                }

                const resVal = existingData.inspection_result || existingData.home_visit_result;
                if (resVal) {
                    if (resVal === 'Suitable with Conditions' || resVal === 'With Conditions') {
                        setHomeVisitResult('With Conditions');
                    } else if (resVal === 'Requires Follow-up' || resVal === 'Follow-up') {
                        setHomeVisitResult('Follow-up');
                    } else if (resVal === 'Not Suitable' || resVal === 'Failed') {
                        setHomeVisitResult('Not Suitable');
                    } else {
                        setHomeVisitResult('Suitable');
                    }
                }

                if (mode === 'view_assessment') {
                    if (existingData.checklist_notes || existingData.home_visit_notes) {
                        setHomeVisitLogComments(existingData.checklist_notes || existingData.home_visit_notes);
                    }
                    if (existingData.recommendations) setRecommendations(existingData.recommendations);
                } else {
                    // For evaluate / record mode: always start blank with only the placeholder message visible
                    setHomeVisitLogComments('');
                    setRecommendations('');
                }

                if (existingData.residence_condition) setResidenceCondition(existingData.residence_condition);
                if (existingData.existing_pets) setExistingPetsNotes(existingData.existing_pets);

                const photos = existingData.visit_photos || existingData.home_visit_photos;
                if (Array.isArray(photos) && photos.length > 0) {
                    setExistingPhotoUrls(photos);
                } else {
                    setExistingPhotoUrls([]);
                }
            } else if (currentUserName) {
                setAssignedPersonnel(currentUserName);
            }

            if (mode === 'evaluate') {
                setHomeVisitLogComments('');
                setRecommendations('');
            }

            setSelectedFiles([]);
            setFilePreviewUrls([]);
        }
    }, [isOpen, applicantAddress, applicantContact, existingData, mode]);

    const handlePhotoFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        const maxTotal = 5;
        const currentCount = selectedFiles.length + existingPhotoUrls.length;
        const availableSlots = maxTotal - currentCount;

        if (availableSlots <= 0) {
            setError("You can upload a maximum of 5 photos.");
            return;
        }

        const toAdd = files.slice(0, availableSlots);
        const newSelected = [...selectedFiles, ...toAdd];
        setSelectedFiles(newSelected);

        const newPreviews = toAdd.map((f) => URL.createObjectURL(f));
        setFilePreviewUrls((prev) => [...prev, ...newPreviews]);
        setError(null);
    };

    const handleRemoveSelectedFile = (index: number) => {
        setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
        setFilePreviewUrls((prev) => {
            const urlToRevoke = prev[index];
            if (urlToRevoke) URL.revokeObjectURL(urlToRevoke);
            return prev.filter((_, i) => i !== index);
        });
    };

    const handleRemoveExistingPhoto = (index: number) => {
        setExistingPhotoUrls((prev) => prev.filter((_, i) => i !== index));
    };

    if (!isOpen) return null;

    const handleSubmitSchedule = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!visitDate || !visitTime) {
            setError("Please select both Home Visit date and time.");
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            const combinedDateTime = new Date(`${visitDate}T${visitTime}`).toISOString();
            await api.post(`/adoptions/${adoptionId}/home-visit/schedule`, {
                scheduled_date: combinedDateTime,
                visit_type: visitType,
                inspector_id: inspectorId === '' ? undefined : inspectorId,
                reschedule_reason: isReschedule ? rescheduleReason.trim() || undefined : undefined,
                override_reason: showOverride ? overrideReason.trim() || undefined : undefined,
                address: residentialAddress || undefined,
                contact_info: contactInfo || undefined,
                location_notes: locationMapNotes || undefined,
            });
            onSuccess();
            onClose();
        } catch (err: any) {
            console.error("Home visit schedule failed:", err);
            if (needsOverrideReason(err.response?.data?.detail)) setShowOverride(true);
            setError(err.response?.data?.detail || "Failed to schedule home visit.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleSubmitEvaluate = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!homeVisitLogComments.trim()) {
            setError("Please provide Home Visit log notes / assessment comments.");
            return;
        }

        // Photo Validation: require at least one photo
        const totalPhotosCount = selectedFiles.length + existingPhotoUrls.length;
        if (totalPhotosCount === 0) {
            setError("Please upload at least one home visit photo.");
            return;
        }

        setSubmitting(true);
        setUploadingPhotos(true);

        try {
            // 1. Upload newly selected photos
            const uploadedUrls: string[] = [...existingPhotoUrls];

            if (selectedFiles.length > 0) {
                try {
                    // Try direct backend multi-file endpoint first
                    const formData = new FormData();
                    (await compressImageFiles(selectedFiles)).forEach((file) => formData.append('files', file));
                    const uploadRes = await api.post('/adoptions/upload-home-visit-photos', formData, {
                        headers: { 'Content-Type': 'multipart/form-data' },
                    });

                    if (Array.isArray(uploadRes.data?.urls)) {
                        uploadedUrls.push(...uploadRes.data.urls);
                    }
                } catch (uploadErr) {
                    console.warn("Backend upload failed, attempting direct Cloudinary fallback:", uploadErr);
                    // Fallback to direct Cloudinary
                    for (const file of selectedFiles) {
                        const res = await uploadDirectToCloudinary(file, 'adoptions/home_visits');
                        if (res?.url) {
                            uploadedUrls.push(res.url);
                        }
                    }
                }
            }

            setUploadingPhotos(false);

            // 2. Map home visit result value
            let mappedResult = 'Suitable';
            if (homeVisitResult === 'With Conditions') {
                mappedResult = 'Suitable with Conditions';
            } else if (homeVisitResult === 'Follow-up') {
                mappedResult = 'Requires Follow-up';
            } else if (homeVisitResult === 'Not Suitable') {
                mappedResult = 'Not Suitable';
            }

            // 3. Compile structured checklist summary for audit log
            const passedItems = HOME_ENVIRONMENT_CHECKLIST_ITEMS.filter((i) => checklist[i.key]).map((i) => `✓ ${i.label}`);
            const failedItems = HOME_ENVIRONMENT_CHECKLIST_ITEMS.filter((i) => !checklist[i.key]).map((i) => `✕ ${i.label}`);

            const fullLog = [
                homeVisitLogComments.trim(),
                `\n-- CHECKLIST ASSESSMENT (${passedItems.length}/12 PASSED) --\n${passedItems.join('\n')}${failedItems.length > 0 ? '\n\n-- CONCERNS / FAILED ITEMS --\n' + failedItems.join('\n') : ''}`,
            ].join('\n');

            // 4. Submit assessment
            await api.post(`/adoptions/${adoptionId}/home-visit/evaluate`, {
                is_fencing_secure: Boolean(checklist.perimeter_fencing_secure),
                is_shelter_adequate: Boolean(checklist.adequate_living_space_shelter),
                hazard_free: Boolean(checklist.cleanliness_sanitation_hazards),
                residence_condition: residenceCondition,
                existing_pets: existingPetsNotes || undefined,
                checklist_notes: fullLog,
                overall_suitability: mappedResult,
                recommendations: recommendations || undefined,
                inspection_result: mappedResult,
                visit_photos: uploadedUrls,
                override_reason: showOverride ? overrideReason.trim() || undefined : undefined,
            });

            onSuccess();
            onClose();
        } catch (err: any) {
            console.error("Home visit evaluate failed:", err);
            if (needsOverrideReason(err.response?.data?.detail)) setShowOverride(true);
            setError(err.response?.data?.detail || "Failed to submit home visit assessment.");
        } finally {
            setSubmitting(false);
            setUploadingPhotos(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
            <div className="bg-white dark:bg-[#151C2C] rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 my-auto max-h-[92vh] overflow-y-auto">
                {/* Modal Header */}
                <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-2xl bg-teal-100 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
                            <Home className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                                {mode === 'schedule' ? 'Schedule Home Visit' : mode === 'evaluate' ? 'Home Environment Assessment' : 'Home Visit Assessment Record'}
                            </h2>
                            <p className="text-xs text-slate-500 dark:text-slate-400">Applicant: {applicantName} (App #{adoptionId})</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {showOverride && (
                    <div className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs space-y-1.5">
                        <label className="block font-black text-amber-900">Override reason (recorded in the audit trail)</label>
                        <input
                            type="text"
                            value={overrideReason}
                            onChange={(e) => setOverrideReason(e.target.value)}
                            placeholder="e.g. Assigned inspector is unavailable"
                            className="w-full px-3 py-2 rounded-xl border border-amber-300 bg-white font-medium"
                        />
                        <p className="text-amber-800">Submit again to record this task yourself.</p>
                    </div>
                )}
                {error && (
                    <div className="mt-3 p-3.5 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-800 dark:text-red-300 text-xs font-bold flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
                        <span>{error}</span>
                    </div>
                )}

                {/* ── MODE: SCHEDULE ── */}
                {mode === 'schedule' && (
                    <form onSubmit={handleSubmitSchedule} className="mt-4 space-y-3.5 text-xs text-slate-700 dark:text-slate-300">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="block font-bold mb-1">Home Visit Date <span className="text-red-500">*</span></label>
                                <input
                                    type="date"
                                    value={visitDate}
                                    onChange={(e) => setVisitDate(e.target.value)}
                                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C] font-semibold"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block font-bold mb-1">Home Visit Time <span className="text-red-500">*</span></label>
                                <input
                                    type="time"
                                    value={visitTime}
                                    onChange={(e) => setVisitTime(e.target.value)}
                                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C] font-semibold"
                                    required
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                                <label className="block font-bold mb-1">Visit Type</label>
                                <select
                                    value={visitType}
                                    onChange={(e) => setVisitType(e.target.value)}
                                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C] font-semibold"
                                >
                                    <option value="Physical">Physical Visit</option>
                                    <option value="Virtual">Virtual Visit</option>
                                </select>
                            </div>
                            <div>
                                <label className="block font-bold mb-1">Assigned Inspector</label>
                                <select
                                    value={inspectorId}
                                    onChange={(e) => setInspectorId(e.target.value ? Number(e.target.value) : '')}
                                    disabled={!isCaseAuthority}
                                    title={!isCaseAuthority ? 'Only the case owner can change the inspector' : undefined}
                                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C] font-medium text-slate-900 dark:text-white cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
                                >
                                    <option value="">{loadingPersonnel ? "Loading personnel..." : "-- Select Inspector --"}</option>
                                    {personnelList.map((person) => (
                                        <option key={person.user_id} value={person.user_id}>
                                            {staffOptionLabel(person)}
                                        </option>
                                    ))}
                                    {inspectorId !== '' && !personnelList.some((p) => p.user_id === inspectorId) && (
                                        <option value={inspectorId}>{existingData?.home_visit_inspector_name || assignedPersonnel || 'Current inspector'}</option>
                                    )}
                                </select>
                                {isReschedule && (
                                    <input
                                        type="text"
                                        value={rescheduleReason}
                                        onChange={(e) => setRescheduleReason(e.target.value)}
                                        placeholder="Reason for rescheduling (shared with the case owner)"
                                        className="mt-2 w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C] text-xs"
                                    />
                                )}
                            </div>
                            <div>
                                <label className="block font-bold mb-1">Contact Information</label>
                                <input
                                    type="text"
                                    value={contactInfo}
                                    onChange={(e) => setContactInfo(e.target.value)}
                                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C]"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block font-bold mb-1">Complete Adopter / Residential Address <span className="text-red-500">*</span></label>
                            <input
                                type="text"
                                value={residentialAddress}
                                onChange={(e) => setResidentialAddress(e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C] font-semibold"
                                required
                            />
                        </div>

                        <div>
                            <label className="block font-bold mb-1">Optional Location / Landmarks / Map Notes</label>
                            <textarea
                                rows={2}
                                value={locationMapNotes}
                                onChange={(e) => setLocationMapNotes(e.target.value)}
                                placeholder="Nearest landmark, gate color, or specific directions..."
                                className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C] resize-none"
                            />
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2">
                            <button type="button" onClick={onClose} className="px-4 py-2 font-bold text-slate-500 cursor-pointer">
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={submitting || !visitDate || !visitTime}
                                className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-black rounded-xl shadow-xs transition-colors cursor-pointer"
                            >
                                {submitting ? 'Scheduling...' : 'Set Home Visit Schedule'}
                            </button>
                        </div>
                    </form>
                )}

                {/* ── MODE: EVALUATE ── */}
                {mode === 'evaluate' && (
                    <form onSubmit={handleSubmitEvaluate} className="mt-4 space-y-4 text-xs text-slate-700 dark:text-slate-300">
                        {/* 1. Expanded Checklist Header & Toggles */}
                        <div className="p-4 bg-slate-50 dark:bg-[#0B0F19] rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                            <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-slate-200/80 dark:border-slate-800">
                                <div>
                                    <span className="font-black text-slate-900 dark:text-white uppercase tracking-wider text-[11px] block">
                                        HOME ENVIRONMENT ASSESSMENT CHECKLIST
                                    </span>
                                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                                        Verify all 12 living conditions & safety criteria
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => handleSelectAllChecklist(true)}
                                        className="text-[10px] font-bold text-teal-600 dark:text-teal-400 hover:underline cursor-pointer"
                                    >
                                        Check All (12)
                                    </button>
                                    <span className="text-slate-300">|</span>
                                    <button
                                        type="button"
                                        onClick={() => handleSelectAllChecklist(false)}
                                        className="text-[10px] font-bold text-slate-500 hover:underline cursor-pointer"
                                    >
                                        Uncheck All
                                    </button>
                                </div>
                            </div>

                            {/* 12 Checklist Items in a 2-Column Responsive Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                                {HOME_ENVIRONMENT_CHECKLIST_ITEMS.map((item) => {
                                    const isChecked = Boolean(checklist[item.key]);
                                    return (
                                        <label
                                            key={item.key}
                                            className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-2.5 select-none ${
                                                isChecked
                                                    ? 'bg-teal-50/70 dark:bg-teal-950/30 border-teal-300 dark:border-teal-700 text-slate-900 dark:text-white shadow-2xs ring-1 ring-teal-500/20'
                                                    : 'bg-white dark:bg-[#151C2C] border-slate-200 dark:border-slate-800 text-slate-500 hover:border-slate-300 dark:hover:border-slate-700'
                                            }`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={isChecked}
                                                onChange={() => handleChecklistToggle(item.key)}
                                                className="mt-0.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500 shrink-0 cursor-pointer w-4 h-4"
                                            />
                                            <div className="min-w-0 pointer-events-none">
                                                <div className={`font-bold text-[11px] leading-snug ${isChecked ? 'text-teal-950 dark:text-teal-200 font-black' : 'text-slate-700 dark:text-slate-300'}`}>
                                                    {item.label}
                                                </div>
                                                <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                                                    {item.description}
                                                </div>
                                            </div>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>

                        {/* 2. Residence Condition & 3. Existing Pets in Household */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="block font-bold mb-1 text-slate-800 dark:text-slate-200">
                                    Residence Condition
                                </label>
                                <select
                                    value={residenceCondition}
                                    onChange={(e) => setResidenceCondition(e.target.value)}
                                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C] font-semibold text-slate-900 dark:text-white"
                                >
                                    <option value="Excellent">Excellent</option>
                                    <option value="Good">Good</option>
                                    <option value="Fair">Fair</option>
                                    <option value="Needs Improvement">Needs Improvement</option>
                                    <option value="Unsuitable">Unsuitable</option>
                                </select>
                            </div>

                            <div>
                                <label className="block font-bold mb-1 text-slate-800 dark:text-slate-200">
                                    Existing Pets in Household
                                </label>
                                <input
                                    type="text"
                                    value={existingPetsNotes}
                                    onChange={(e) => setExistingPetsNotes(e.target.value)}
                                    placeholder="e.g. 1 vaccinated dog, friendly to newcomers"
                                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C] text-slate-900 dark:text-white"
                                />
                            </div>
                        </div>

                        {/* 4. Home Visit Result */}
                        <div>
                            <label className="block font-black text-slate-900 dark:text-white uppercase tracking-wider text-[11px] mb-1.5">
                                Home Visit Result <span className="text-red-500">*</span>
                            </label>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                {[
                                    { id: 'Suitable' as const, label: '✓ Suitable', color: 'bg-emerald-600 text-white border-emerald-600' },
                                    { id: 'With Conditions' as const, label: '✓ With Conditions', color: 'bg-teal-600 text-white border-teal-600' },
                                    { id: 'Follow-up' as const, label: '↻ Follow-up', color: 'bg-amber-500 text-white border-amber-500' },
                                    { id: 'Not Suitable' as const, label: '✕ Not Suitable', color: 'bg-red-600 text-white border-red-600' },
                                ].map((opt) => (
                                    <button
                                        key={opt.id}
                                        type="button"
                                        onClick={() => setHomeVisitResult(opt.id)}
                                        className={`p-2.5 rounded-xl border text-center font-bold text-xs transition-all cursor-pointer ${
                                            homeVisitResult === opt.id
                                                ? opt.color + ' shadow-xs font-black'
                                                : 'bg-slate-50 dark:bg-[#0B0F19] border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100'
                                        }`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 5. Actual Photo / File Upload Component */}
                        <div className="p-4 bg-slate-50 dark:bg-[#0B0F19] rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <span className="font-black text-slate-900 dark:text-white uppercase tracking-wider text-[11px] block">
                                        HOME VISIT PHOTOS / DOCUMENTS <span className="text-red-500">*</span>
                                    </span>
                                    <span className="text-[10px] text-slate-500 dark:text-slate-400">
                                        JPG, JPEG, PNG, WebP • Up to 5 photos
                                    </span>
                                </div>
                                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                    {selectedFiles.length + existingPhotoUrls.length} / 5 photos
                                </span>
                            </div>

                            {/* Hidden Native File Inputs */}
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/jpeg,image/png,image/jpg,image/webp"
                                multiple
                                onChange={handlePhotoFilesSelected}
                                className="hidden"
                            />
                            <input
                                ref={cameraInputRef}
                                type="file"
                                accept="image/*"
                                capture="environment"
                                onChange={handlePhotoFilesSelected}
                                className="hidden"
                            />

                            {/* Upload Area Box */}
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                className="border-2 border-dashed border-teal-300 dark:border-teal-700/60 hover:border-teal-500 bg-teal-50/30 dark:bg-teal-950/20 rounded-2xl p-5 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 group"
                            >
                                <div className="w-12 h-12 rounded-2xl bg-teal-100 dark:bg-teal-900/50 text-teal-600 dark:text-teal-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                                    <Camera className="w-6 h-6" />
                                </div>
                                <div>
                                    <div className="font-extrabold text-xs text-slate-800 dark:text-slate-200">
                                        Take a photo or choose from your gallery
                                    </div>
                                    <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                                        Living space, fence perimeter, pet resting area, or yard
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 mt-1">
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            fileInputRef.current?.click();
                                        }}
                                        className="px-3.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl shadow-2xs transition-colors flex items-center gap-1.5"
                                    >
                                        <UploadCloud className="w-3.5 h-3.5" />
                                        <span>Upload Photos</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            cameraInputRef.current?.click();
                                        }}
                                        className="px-3 py-1.5 bg-white dark:bg-[#151C2C] hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-bold text-xs rounded-xl shadow-2xs transition-colors flex items-center gap-1.5"
                                    >
                                        <Camera className="w-3.5 h-3.5 text-teal-600" />
                                        <span>Camera</span>
                                    </button>
                                </div>
                            </div>

                            {/* Photo Thumbnail Previews */}
                            {(existingPhotoUrls.length > 0 || filePreviewUrls.length > 0) && (
                                <div className="space-y-2 pt-1">
                                    <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider block">
                                        Attached Photos ({existingPhotoUrls.length + filePreviewUrls.length}):
                                    </span>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                                        {/* Existing Uploaded Photos */}
                                        {existingPhotoUrls.map((url, idx) => (
                                            <div key={`existing-${idx}`} className="relative group rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 aspect-video bg-black/5">
                                                <img
                                                    src={url}
                                                    alt={`Visit photo ${idx + 1}`}
                                                    className="w-full h-full object-cover cursor-pointer"
                                                    onClick={() => setLightboxPhoto(url)}
                                                />
                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                                                    <button
                                                        type="button"
                                                        onClick={() => setLightboxPhoto(url)}
                                                        className="p-1.5 rounded-lg bg-white/90 text-slate-800 hover:bg-white cursor-pointer"
                                                        title="View larger"
                                                    >
                                                        <Maximize2 className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveExistingPhoto(idx)}
                                                        className="p-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 cursor-pointer"
                                                        title="Remove photo"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                                <span className="absolute bottom-1 left-1 text-[9px] font-black bg-black/60 text-white px-1.5 py-0.5 rounded">
                                                    Saved #{idx + 1}
                                                </span>
                                            </div>
                                        ))}

                                        {/* Newly Selected Photos */}
                                        {filePreviewUrls.map((url, idx) => (
                                            <div key={`new-${idx}`} className="relative group rounded-xl overflow-hidden border border-teal-300 dark:border-teal-700 aspect-video bg-black/5">
                                                <img
                                                    src={url}
                                                    alt={`Selected photo ${idx + 1}`}
                                                    className="w-full h-full object-cover cursor-pointer"
                                                    onClick={() => setLightboxPhoto(url)}
                                                />
                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                                                    <button
                                                        type="button"
                                                        onClick={() => setLightboxPhoto(url)}
                                                        className="p-1.5 rounded-lg bg-white/90 text-slate-800 hover:bg-white cursor-pointer"
                                                        title="View larger"
                                                    >
                                                        <Maximize2 className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveSelectedFile(idx)}
                                                        className="p-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 cursor-pointer"
                                                        title="Remove photo"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                                <span className="absolute bottom-1 left-1 text-[9px] font-black bg-teal-600 text-white px-1.5 py-0.5 rounded">
                                                    New
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Recommendations for Adopter */}
                        <div>
                            <label className="block font-bold mb-1 text-slate-800 dark:text-slate-200">
                                Recommendations for Adopter
                            </label>
                            <input
                                type="text"
                                value={recommendations}
                                onChange={(e) => setRecommendations(e.target.value)}
                                placeholder="Ensure gate is always secured and keep food and water available."
                                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C] text-slate-900 dark:text-white"
                            />
                        </div>

                        {/* Home Visit Log / Comments */}
                        <div>
                            <label className="block font-bold mb-1 text-slate-800 dark:text-slate-200">
                                Home Visit Log / Comments <span className="text-red-500">*</span>
                            </label>
                            <textarea
                                rows={3}
                                value={homeVisitLogComments}
                                onChange={(e) => setHomeVisitLogComments(e.target.value)}
                                placeholder="Detailed assessment of residence, living space, environmental safety, family interactions, and other observations..."
                                className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C] text-slate-900 dark:text-white resize-none"
                                required
                            />
                        </div>

                        {/* Submit Actions */}
                        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={submitting}
                                className="px-4 py-2.5 font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={submitting || !homeVisitLogComments.trim()}
                                className="px-6 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-black rounded-xl shadow-xs transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                            >
                                {uploadingPhotos ? 'Uploading Photos...' : submitting ? 'Recording Assessment...' : 'Submit Assessment & Proceed'}
                            </button>
                        </div>
                    </form>
                )}

                {/* ── MODE: VIEW ASSESSMENT ── */}
                {mode === 'view_assessment' && (
                    <div className="mt-4 space-y-4 text-xs text-slate-700 dark:text-slate-300">
                        {/* Result Top Card */}
                        <div className="p-4 rounded-2xl bg-teal-50/80 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 flex items-center justify-between flex-wrap gap-2">
                            <div>
                                <span className="text-[10px] font-black uppercase text-teal-700 dark:text-teal-400 block">
                                    HOME VISIT ASSESSMENT RESULT:
                                </span>
                                <h4 className="font-black text-base text-teal-950 dark:text-teal-100">
                                    {existingData?.inspection_result || existingData?.home_visit_result || 'Completed'}
                                </h4>
                            </div>
                            <div className="text-right">
                                <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase bg-teal-200 dark:bg-teal-900 text-teal-900 dark:text-teal-200">
                                    {existingData?.visit_type || 'Physical Visit'}
                                </span>
                                {existingData?.home_visit_inspector_name && (
                                    <div className="text-[10px] text-slate-500 mt-1 font-medium">
                                        Inspector: {existingData.home_visit_inspector_name}
                                        {existingData.home_visit_evaluated_by_name && existingData.home_visit_evaluated_by_name !== existingData.home_visit_inspector_name
                                            ? ` · Recorded by ${existingData.home_visit_evaluated_by_name} (override)` : ''}
                                        {existingData.home_visit_reschedule_count ? ` · Rescheduled ${existingData.home_visit_reschedule_count}×` : ''}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Checklist Results (Checked Items Only) */}
                        {(() => {
                            const notes = existingData?.checklist_notes || existingData?.home_visit_notes || '';
                            let passed = HOME_ENVIRONMENT_CHECKLIST_ITEMS.filter((item) => {
                                if (notes.includes('✓')) {
                                    return notes.includes(`✓ ${item.label}`) && !notes.includes(`✕ ${item.label}`);
                                }
                                if (item.key === 'perimeter_fencing_secure') return Boolean(existingData?.is_fencing_secure);
                                if (item.key === 'adequate_living_space_shelter') return Boolean(existingData?.is_shelter_adequate);
                                if (item.key === 'cleanliness_sanitation_hazards') return Boolean(existingData?.hazard_free);
                                return false;
                            });

                            return (
                                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-slate-800 space-y-2.5">
                                    <div className="flex items-center justify-between">
                                        <span className="font-black text-slate-900 dark:text-white uppercase tracking-wider text-[11px] block">
                                            Checklist Assessment Results ({passed.length}):
                                        </span>
                                        <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                                            {passed.length} Criteria Passed
                                        </span>
                                    </div>
                                    {passed.length > 0 ? (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            {passed.map((item) => (
                                                <div
                                                    key={item.key}
                                                    className="p-2.5 rounded-xl bg-white dark:bg-[#151C2C] border border-emerald-200 dark:border-emerald-800/60 flex items-start gap-2 text-xs"
                                                >
                                                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                                                    <div>
                                                        <div className="font-bold text-slate-800 dark:text-slate-200 text-[11px]">{item.label}</div>
                                                        <div className="text-[10px] text-slate-400">{item.description}</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="p-3 bg-white dark:bg-[#151C2C] rounded-xl border border-slate-200 dark:border-slate-800 text-xs text-slate-500 italic text-center">
                                            No checklist criteria were marked as passed.
                                        </div>
                                    )}
                                </div>
                            );
                        })()}

                        {/* Details Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-slate-800">
                                <span className="font-bold text-slate-500 block text-[10px] uppercase">Residence Condition:</span>
                                <span className="font-black text-slate-900 dark:text-white text-sm">
                                    {existingData?.residence_condition || 'Good'}
                                </span>
                            </div>
                            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-slate-800">
                                <span className="font-bold text-slate-500 block text-[10px] uppercase">Existing Pets in Household:</span>
                                <span className="font-extrabold text-slate-900 dark:text-white text-sm">
                                    {existingData?.existing_pets || (existingData?.has_other_pets ? 'Yes (Currently owns other pets)' : 'None')}
                                </span>
                            </div>
                        </div>

                        {/* Photos Gallery */}
                        {(existingData?.visit_photos || existingData?.home_visit_photos) && (existingData.visit_photos?.length > 0 || existingData.home_visit_photos?.length > 0) && (
                            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-slate-800 space-y-2">
                                <span className="font-black text-slate-900 dark:text-white uppercase tracking-wider text-[11px] block">
                                    HOME VISIT PHOTOS ({(existingData.visit_photos || existingData.home_visit_photos).length})
                                </span>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                                    {(existingData.visit_photos || existingData.home_visit_photos).map((url: string, idx: number) => (
                                        <div
                                            key={idx}
                                            onClick={() => setLightboxPhoto(url)}
                                            className="relative group rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 aspect-video bg-black/5 cursor-pointer"
                                        >
                                            <img
                                                src={url}
                                                alt={`Visit Photo ${idx + 1}`}
                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                            />
                                            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                                <Eye className="w-5 h-5" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Comments Log */}
                        {(existingData?.checklist_notes || existingData?.home_visit_notes) && (
                            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-slate-800 space-y-1">
                                <span className="font-bold text-slate-500 block text-[10px] uppercase tracking-wider">Assessment Comments & Log:</span>
                                <p className="leading-relaxed font-medium whitespace-pre-wrap">
                                    {existingData.checklist_notes || existingData.home_visit_notes}
                                </p>
                            </div>
                        )}

                        {/* Recommendations */}
                        {existingData?.recommendations && (
                            <div className="p-3.5 rounded-xl bg-teal-50/50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800 space-y-1">
                                <span className="font-bold text-teal-700 dark:text-teal-400 block text-[10px] uppercase tracking-wider">Recommendations for Adopter:</span>
                                <p className="leading-relaxed font-medium">{existingData.recommendations}</p>
                            </div>
                        )}

                        <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-black text-xs rounded-xl cursor-pointer"
                            >
                                Close Record
                            </button>
                        </div>
                    </div>
                )}

                {/* Lightbox Modal */}
                {lightboxPhoto && (
                    <div
                        className="fixed inset-0 z-60 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
                        onClick={() => setLightboxPhoto(null)}
                    >
                        <div className="relative max-w-3xl max-h-[85vh] p-2 bg-white dark:bg-[#151C2C] rounded-2xl shadow-2xl">
                            <button
                                type="button"
                                onClick={() => setLightboxPhoto(null)}
                                className="absolute top-3 right-3 p-1.5 rounded-full bg-black/60 text-white hover:bg-black cursor-pointer z-10"
                            >
                                <X className="w-5 h-5" />
                            </button>
                            <img
                                src={lightboxPhoto}
                                alt="Full size preview"
                                className="max-w-full max-h-[80vh] rounded-xl object-contain"
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};


// ==========================================
// 4. Stage 5 & 6: Review & Final Decision Modal
// ==========================================
interface ReviewModalProps {
    adoptionId: number;
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export const AdoptionReviewModal: React.FC<ReviewModalProps> = ({
    adoptionId,
    isOpen,
    onClose,
    onSuccess,
}) => {
    const [dossier, setDossier] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [decision, setDecision] = useState<'Approve' | 'Return for Follow-up' | 'Reject'>('Approve');
    const [reviewRemarks, setReviewRemarks] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

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

    const handleSubmitDecision = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!reviewRemarks.trim()) {
            setError("Reviewer remarks/comments are required before submitting the decision.");
            return;
        }

        setSubmitting(true);
        setError(null);
        try {
            await api.post(`/adoptions/${adoptionId}/review/submit`, {
                decision: decision,
                recommendation: decision,
                review_notes: reviewRemarks,
            });
            onSuccess();
            onClose();
        } catch (err: any) {
            console.error("Submit review decision failed:", err);
            setError(err.response?.data?.detail || "Failed to submit review decision.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
            <div className="bg-white dark:bg-[#151C2C] rounded-3xl max-w-3xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 my-auto max-h-[92vh] overflow-y-auto">
                <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                            <ClipboardCheck className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                                Stage 5: Complete Dossier Review & Final Decision
                            </h2>
                            <p className="text-xs text-slate-500">
                                Review all compiled applicant records, interview logs, and home visit assessments (App #{adoptionId})
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 cursor-pointer">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {loading ? (
                    <div className="py-16 text-center space-y-3">
                        <div className="w-10 h-10 border-3 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
                        <p className="text-xs font-bold text-slate-500">Compiling adoption dossier records...</p>
                    </div>
                ) : (
                    <div className="mt-5 space-y-4 text-xs">
                        {error && (
                            <div className="p-3 rounded-xl bg-red-100 text-red-800 text-xs font-bold flex items-center gap-2">
                                <AlertCircle className="w-4 h-4 shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}

                        {/* Dossier Summary Cards */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {/* 1. Applicant & Animal Info */}
                            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-slate-800 space-y-2">
                                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                                    Applicant & Pet Profile:
                                </span>
                                <div className="space-y-1 text-[11px]">
                                    <p><strong>Applicant:</strong> {dossier?.adoption?.full_name}</p>
                                    <p><strong>Contact:</strong> {dossier?.adoption?.contact_no}</p>
                                    <p><strong>Address:</strong> {dossier?.adoption?.address}</p>
                                    <p><strong>Government ID:</strong> {dossier?.adoption?.id_type || 'Verified ID'}</p>
                                    <p><strong>Target Animal:</strong> {dossier?.adoption?.animal_name || 'Rescue Pet'}</p>
                                    {dossier?.adoption?.reason && (
                                        <p className="italic text-slate-500 pt-1">"{dossier?.adoption?.reason}"</p>
                                    )}
                                </div>
                            </div>

                            {/* 2. Verification Summary */}
                            <div className="p-3.5 rounded-2xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/80 space-y-2">
                                <span className="text-[10px] font-black uppercase tracking-wider text-blue-700 block">
                                    Stage 2: Verification Results:
                                </span>
                                <div className="space-y-1 text-[11px]">
                                    <p><strong>ID Match:</strong> {dossier?.verification?.id_match_status || 'Verified'}</p>
                                    <p><strong>Residency:</strong> {dossier?.verification?.residency_status || 'Confirmed'}</p>
                                    <p><strong>Blacklist:</strong> <span className={dossier?.verification?.is_blacklisted ? 'text-red-500 font-bold' : 'text-emerald-600 font-bold'}>{dossier?.verification?.is_blacklisted ? 'Blacklisted' : 'Clean'}</span></p>
                                    {dossier?.verification?.verification_notes && (
                                        <p className="italic text-slate-500">"{dossier?.verification?.verification_notes}"</p>
                                    )}
                                </div>
                            </div>

                            {/* 3. Interview Assessment Summary */}
                            <div className="p-3.5 rounded-2xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200/80 space-y-2">
                                <span className="text-[10px] font-black uppercase tracking-wider text-purple-700 block">
                                    Stage 3: Interview Assessment:
                                </span>
                                <div className="space-y-1 text-[11px]">
                                    <p><strong>Result:</strong> <span className="font-bold text-purple-800">{dossier?.interview?.interview_result || dossier?.interview?.recommendation || 'Successful'}</span></p>
                                    <p><strong>Interviewer:</strong> {dossier?.interview?.interviewer_name || 'Barangay Staff'}</p>
                                    {dossier?.interview?.questions_discussed && (
                                        <p><strong>Topics:</strong> {dossier?.interview?.questions_discussed}</p>
                                    )}
                                    {dossier?.interview?.interview_notes && (
                                        <p className="italic text-slate-500">"{dossier?.interview?.interview_notes}"</p>
                                    )}
                                </div>
                            </div>

                            {/* 4. Home Visit Assessment Summary */}
                            <div className="p-3.5 rounded-2xl bg-teal-50/50 dark:bg-teal-950/20 border border-teal-200/80 space-y-2">
                                <span className="text-[10px] font-black uppercase tracking-wider text-teal-700 block">
                                    Stage 4: Home Environment Assessment:
                                </span>
                                <div className="space-y-1 text-[11px]">
                                    <p><strong>Result:</strong> <span className="font-bold text-teal-800">{dossier?.home_visit?.inspection_result || 'Suitable'}</span></p>
                                    <p><strong>Fencing & Shelter:</strong> {dossier?.home_visit?.is_fencing_secure ? 'Secure Fence' : 'Standard'} • {dossier?.home_visit?.is_shelter_adequate ? 'Adequate Shelter' : 'Standard'}</p>
                                    {dossier?.home_visit?.checklist_notes && (
                                        <p className="italic text-slate-500">"{dossier?.home_visit?.checklist_notes}"</p>
                                    )}
                                    {dossier?.home_visit?.recommendations && (
                                        <p className="text-teal-700"><strong>Recommendations:</strong> {dossier?.home_visit?.recommendations}</p>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Final Review Decision Section */}
                        <form onSubmit={handleSubmitDecision} className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-3.5">
                            <div>
                                <label className="block font-black text-slate-900 dark:text-white uppercase tracking-wider text-[11px] mb-1.5">
                                    Final Review Decision <span className="text-red-500">*</span>
                                </label>
                                <div className="grid grid-cols-3 gap-2">
                                    {[
                                        { id: 'Approve', label: '✓ Approve Adoption', desc: 'Proceed to Certificate', color: 'bg-emerald-600 text-white border-emerald-600 shadow-xs' },
                                        { id: 'Return for Follow-up', label: '↻ Return for Follow-up', desc: 'Require additional info', color: 'bg-amber-500 text-white border-amber-500 shadow-xs' },
                                        { id: 'Reject', label: '✕ Reject Adoption', desc: 'Disapprove application', color: 'bg-red-600 text-white border-red-600 shadow-xs' },
                                    ].map((opt) => (
                                        <button
                                            key={opt.id}
                                            type="button"
                                            onClick={() => setDecision(opt.id as any)}
                                            className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                                                decision === opt.id
                                                    ? opt.color
                                                    : 'bg-slate-50 dark:bg-[#0B0F19] border-slate-200 dark:border-slate-800 text-slate-700'
                                            }`}
                                        >
                                            <div className="font-black text-xs">{opt.label}</div>
                                            <div className="text-[10px] opacity-85 mt-0.5">{opt.desc}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block font-bold mb-1">
                                    Review Remarks & Official Recommendation <span className="text-red-500">*</span>
                                </label>
                                <textarea
                                    rows={3}
                                    value={reviewRemarks}
                                    onChange={(e) => setReviewRemarks(e.target.value)}
                                    placeholder="Enter comprehensive review justification and official approval remarks..."
                                    className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C] text-xs resize-none"
                                    required
                                />
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-1">
                                <button type="button" onClick={onClose} className="px-4 py-2 font-bold text-slate-500 cursor-pointer">
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting || !reviewRemarks.trim()}
                                    className={`px-5 py-2.5 font-black text-white rounded-xl shadow-xs transition-colors cursor-pointer ${
                                        decision === 'Approve'
                                            ? 'bg-emerald-600 hover:bg-emerald-700'
                                            : decision === 'Return for Follow-up'
                                            ? 'bg-amber-600 hover:bg-amber-700'
                                            : 'bg-red-600 hover:bg-red-700'
                                    }`}
                                >
                                    {submitting ? 'Submitting Decision...' : `Confirm: ${decision}`}
                                </button>
                            </div>
                        </form>
                    </div>
                )}
            </div>
        </div>
    );
};


// ==========================================
// 5a. Stage 8: Handover Scheduling Modal
// ==========================================
interface HandoverScheduleModalProps {
    adoptionId: number;
    animalName: string;
    applicantName: string;
    existingData?: any;
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export const AdoptionHandoverScheduleModal: React.FC<HandoverScheduleModalProps> = ({
    adoptionId,
    animalName,
    applicantName,
    existingData,
    isOpen,
    onClose,
    onSuccess,
}) => {
    const toTimeInputValue = (timeStr?: string) => {
        if (!timeStr) return '10:00';
        if (/^\d{2}:\d{2}$/.test(timeStr)) return timeStr;
        try {
            const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
            if (match) {
                let h = parseInt(match[1], 10);
                const m = match[2];
                const ampm = (match[3] || '').toUpperCase();
                if (ampm === 'PM' && h < 12) h += 12;
                if (ampm === 'AM' && h === 12) h = 0;
                return `${String(h).padStart(2, '0')}:${m}`;
            }
        } catch {
            // ignore
        }
        return '10:00';
    };

    const to12hString = (t: string) => {
        if (!t) return '10:00 AM';
        try {
            const [hStr, mStr] = t.split(':');
            const h = parseInt(hStr, 10);
            const ampm = h >= 12 ? 'PM' : 'AM';
            const h12 = h % 12 || 12;
            return `${String(h12).padStart(2, '0')}:${mStr} ${ampm}`;
        } catch {
            return t;
        }
    };

    const [handoverDate, setHandoverDate] = useState('');
    const [handoverTime, setHandoverTime] = useState('10:00');
    const [handoverLocation, setHandoverLocation] = useState('Barangay Animal Welfare Center / Holding Facility');
    const [assignedStaff, setAssignedStaff] = useState('');
    const [notes, setNotes] = useState('');
    const [personnelList, setPersonnelList] = useState<any[]>([]);
    const [loadingPersonnel, setLoadingPersonnel] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            const fetchPersonnel = async () => {
                try {
                    setLoadingPersonnel(true);
                    const res = await api.get('/users/?role_id=3');
                    if (Array.isArray(res.data)) {
                        setPersonnelList(res.data);
                    }
                } catch (err) {
                    console.warn("Could not load personnel list:", err);
                } finally {
                    setLoadingPersonnel(false);
                }
            };
            fetchPersonnel();

            const rawUser = localStorage.getItem('staff_user') || localStorage.getItem('user') || sessionStorage.getItem('staff_user') || sessionStorage.getItem('user');
            let currentUserName = '';
            try {
                if (rawUser) {
                    const parsed = JSON.parse(rawUser);
                    currentUserName = parsed?.name || '';
                }
            } catch (e) {
                console.warn('Error reading current user', e);
            }

            if (existingData?.handover_scheduled_date) {
                try {
                    const d = new Date(existingData.handover_scheduled_date);
                    setHandoverDate(d.toISOString().split('T')[0]);
                } catch {
                    setHandoverDate('');
                }
            } else {
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                setHandoverDate(tomorrow.toISOString().split('T')[0]);
            }

            if (existingData?.handover_scheduled_time) {
                setHandoverTime(toTimeInputValue(existingData.handover_scheduled_time));
            } else {
                setHandoverTime('10:00');
            }

            if (existingData?.handover_location) {
                setHandoverLocation(existingData.handover_location);
            }

            if (existingData?.handover_assigned_staff) {
                setAssignedStaff(existingData.handover_assigned_staff);
            } else if (currentUserName) {
                setAssignedStaff(currentUserName);
            }

            if (existingData?.handover_notes) {
                setNotes(existingData.handover_notes);
            }
        }
    }, [isOpen, existingData]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!handoverDate) {
            setError("Please select a handover date.");
            return;
        }

        setSubmitting(true);
        setError(null);
        try {
            const timeVal = handoverTime || '10:00';
            const combinedDateTime = new Date(`${handoverDate}T${timeVal}:00`).toISOString();
            await api.post(`/adoptions/${adoptionId}/handover/schedule`, {
                handover_date: combinedDateTime,
                handover_time: to12hString(timeVal),
                handover_location: handoverLocation,
                assigned_staff: assignedStaff || undefined,
                notes: notes || undefined,
            });
            onSuccess();
            onClose();
        } catch (err: any) {
            console.error("Schedule handover failed:", err);
            setError(err.response?.data?.detail || "Failed to schedule handover.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
            <div className="bg-white dark:bg-[#151C2C] rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 my-auto max-h-[92vh] overflow-y-auto">
                <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                            <Calendar className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-base font-black text-slate-900 dark:text-white">
                                Stage 8: Handover Schedule
                            </h2>
                            <p className="text-xs text-slate-500">Scheduling handover of {animalName} to {applicantName} (App #{adoptionId})</p>
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
                    <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800/80 text-amber-900 dark:text-amber-200 leading-relaxed">
                        Setting this schedule will send an automatic notification & schedule details to <strong>{applicantName}</strong> on their resident adoption portal.
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="block font-bold mb-1">Handover Date <span className="text-red-500">*</span></label>
                            <input
                                type="date"
                                value={handoverDate}
                                onChange={(e) => setHandoverDate(e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C] font-semibold"
                                required
                            />
                        </div>
                        <div>
                            <label className="block font-bold mb-1">Handover Time <span className="text-red-500">*</span></label>
                            <input
                                type="time"
                                value={handoverTime}
                                onChange={(e) => setHandoverTime(e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C] font-semibold"
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block font-bold mb-1">Handover Location <span className="text-red-500">*</span></label>
                        <input
                            type="text"
                            value={handoverLocation}
                            onChange={(e) => setHandoverLocation(e.target.value)}
                            placeholder="Barangay Animal Welfare Center / Holding Facility"
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C] font-semibold"
                            required
                        />
                    </div>

                    <div>
                        <label className="block font-bold mb-1">Assigned Barangay Staff</label>
                        <select
                            value={assignedStaff}
                            onChange={(e) => setAssignedStaff(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C] font-medium text-slate-900 dark:text-white cursor-pointer"
                        >
                            <option value="">{loadingPersonnel ? "Loading personnel..." : "-- Select Barangay Staff --"}</option>
                            {personnelList.map((person) => (
                                <option key={person.user_id} value={person.name}>
                                    {person.name} {person.position_name ? `(${person.position_name})` : ''}
                                </option>
                            ))}
                            {assignedStaff && !personnelList.some((p) => p.name === assignedStaff) && (
                                <option value={assignedStaff}>{assignedStaff}</option>
                            )}
                        </select>
                    </div>

                    <div>
                        <label className="block font-bold mb-1">Additional Notes / Instructions</label>
                        <textarea
                            rows={3}
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Bring valid ID, pet carrier or leash, and proof of adoption approval..."
                            className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C] resize-none"
                        />
                    </div>

                    <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 font-bold text-slate-500 hover:text-slate-700 cursor-pointer"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={submitting || !handoverDate}
                            className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-black rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                        >
                            {submitting ? 'Scheduling...' : 'Schedule Handover'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};


// ==========================================
// 5b. Stage 8: Handover Modal
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
    const [handoverDate, setHandoverDate] = useState('');
    const [handoverTime, setHandoverTime] = useState('');
    const [receivingAdopter, setReceivingAdopter] = useState(applicantName);
    const [assignedPersonnel, setAssignedPersonnel] = useState('');
    const [animalCondition, setAnimalCondition] = useState('Healthy & Active');
    const [location, setLocation] = useState('Barangay Animal Welfare Center');
    const [photoUrl, setPhotoUrl] = useState('');
    const [notes, setNotes] = useState('');
    const [docsVerified, setDocsVerified] = useState(true);
    const [handoverConfirmed, setHandoverConfirmed] = useState(true);

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            setReceivingAdopter(applicantName);
            const now = new Date();
            setHandoverDate(now.toISOString().split('T')[0]);
            setHandoverTime(now.toTimeString().slice(0, 5));
        }
    }, [isOpen, applicantName]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!handoverConfirmed) {
            setError("Please check the confirmation box confirming physical pet transfer.");
            return;
        }

        setSubmitting(true);
        setError(null);
        try {
            const combinedDateTime = handoverDate && handoverTime ? new Date(`${handoverDate}T${handoverTime}`).toISOString() : undefined;
            await api.post(`/adoptions/${adoptionId}/handover/complete`, {
                handover_date: combinedDateTime,
                handover_time: handoverTime || undefined,
                receiving_adopter: receivingAdopter || applicantName,
                assigned_personnel: assignedPersonnel || undefined,
                animal_condition: animalCondition,
                handover_location: location,
                handover_photo_url: photoUrl || null,
                notes: notes,
                documents_verified: docsVerified,
                handover_confirmed: handoverConfirmed,
            });
            onSuccess();
            onClose();
        } catch (err: any) {
            console.error("Handover failed:", err);
            setError(err.response?.data?.detail || "Failed to confirm pet handover.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
            <div className="bg-white dark:bg-[#151C2C] rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 my-auto max-h-[92vh] overflow-y-auto">
                <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                            <HeartHandshake className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-base font-black text-slate-900 dark:text-white">
                                Stage 8: Physical Animal Handover
                            </h2>
                            <p className="text-xs text-slate-500">Transferring {animalName} to {applicantName} (App #{adoptionId})</p>
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
                            <br />✓ Mark shelter intake as Adopted.
                            <br />✓ Advance application to <strong>Stage 9: Post-Adoption Welfare Monitoring</strong>.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="block font-bold mb-1">Handover Date <span className="text-red-500">*</span></label>
                            <input
                                type="date"
                                value={handoverDate}
                                onChange={(e) => setHandoverDate(e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C] font-semibold"
                                required
                            />
                        </div>
                        <div>
                            <label className="block font-bold mb-1">Handover Time <span className="text-red-500">*</span></label>
                            <input
                                type="time"
                                value={handoverTime}
                                onChange={(e) => setHandoverTime(e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C] font-semibold"
                                required
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="block font-bold mb-1">Receiving Adopter</label>
                            <input
                                type="text"
                                value={receivingAdopter}
                                onChange={(e) => setReceivingAdopter(e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C] font-semibold"
                            />
                        </div>
                        <div>
                            <label className="block font-bold mb-1">Assigned Barangay Staff</label>
                            <input
                                type="text"
                                value={assignedPersonnel}
                                onChange={(e) => setAssignedPersonnel(e.target.value)}
                                placeholder="Staff in charge of release"
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C]"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="block font-bold mb-1">Animal Condition at Handover</label>
                            <select
                                value={animalCondition}
                                onChange={(e) => setAnimalCondition(e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C] font-semibold"
                            >
                                <option value="Healthy & Active">Healthy & Active</option>
                                <option value="Good & Alert">Good & Alert</option>
                                <option value="Minor Care (Meds Issued)">Minor Care (Meds Issued)</option>
                                <option value="Calm & Responsive">Calm & Responsive</option>
                            </select>
                        </div>
                        <div>
                            <label className="block font-bold mb-1">Handover Location</label>
                            <input
                                type="text"
                                value={location}
                                onChange={(e) => setLocation(e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C]"
                            />
                        </div>
                    </div>

                    {/* Required Documents Checklist */}
                    <div className="p-3 bg-slate-50 dark:bg-[#0B0F19] rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                        <span className="font-black text-slate-900 dark:text-white uppercase tracking-wider text-[11px] block">
                            Document & Transfer Verification:
                        </span>
                        <label className="flex items-center gap-2 cursor-pointer font-bold">
                            <input
                                type="checkbox"
                                checked={docsVerified}
                                onChange={(e) => setDocsVerified(e.target.checked)}
                                className="rounded border-slate-300 text-emerald-600"
                            />
                            <span>ID Verified & Adoption Certificate Issued</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer font-bold text-emerald-800 dark:text-emerald-300">
                            <input
                                type="checkbox"
                                checked={handoverConfirmed}
                                onChange={(e) => setHandoverConfirmed(e.target.checked)}
                                className="rounded border-slate-300 text-emerald-600"
                            />
                            <span>I confirm the animal was successfully handed over to the adopter</span>
                        </label>
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
                        <label className="block font-bold mb-1">Handover Notes / Comments</label>
                        <textarea
                            rows={2}
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Collar and vaccination booklet issued, leash handed over, special instructions..."
                            className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C] resize-none"
                        />
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 font-bold text-slate-500 cursor-pointer">
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={submitting || !handoverConfirmed}
                            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl shadow-xs transition-colors cursor-pointer"
                        >
                            {submitting ? 'Finalizing Handover...' : 'Confirm Handover & Move to Monitoring'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};


// ==========================================
// 6. Unified Adoption Dossier / Full Case Document Modal
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
    const [error, setError] = useState<string | null>(null);

    const fetchDossier = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get(`/adoptions/${adoptionId}/dossier`);
            setDossier(res.data);
        } catch (err: any) {
            console.error("Failed to load dossier:", err);
            setError(err.response?.data?.detail || "Could not load complete case dossier. Please check connection.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!isOpen || !adoptionId) return;
        fetchDossier();
    }, [isOpen, adoptionId]);

    if (!isOpen) return null;

    const app = dossier?.adoption;

    const getStageBadgeColor = (stage?: string) => {
        switch ((stage || '').toLowerCase()) {
            case 'application':
            case 'applied':
                return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800';
            case 'verification':
                return 'bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800';
            case 'interview':
                return 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800';
            case 'home_visit':
            case 'home visit':
                return 'bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-950/60 dark:text-teal-300 dark:border-teal-800';
            case 'review':
                return 'bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700';
            case 'approval':
            case 'certificate':
                return 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800';
            case 'handover':
                return 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800';
            case 'monitoring':
                return 'bg-role-muted text-role-strong border-role-border dark:bg-role-strong/60 dark:text-role-border dark:border-role-strong';
            case 'successful_adoption':
            case 'completed':
            case 'successful':
                return 'bg-emerald-600 text-white border-emerald-700';
            default:
                return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300';
        }
    };

    return (
        <div className="fixed inset-0 z-70 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in duration-150">
            <div id="adoption-dossier-print" className="bg-white dark:bg-[#151C2C] rounded-3xl max-w-4xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 my-auto max-h-[90vh] overflow-y-auto space-y-6">
                
                {/* Official Document Header */}
                <div className="flex items-center justify-between pb-5 border-b border-slate-200 dark:border-slate-800 flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-role-muted dark:bg-role-strong/60 text-role-hover dark:text-role flex items-center justify-center shrink-0 border border-role-border shadow-2xs">
                            <FileText className="w-6 h-6" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white tracking-tight uppercase">
                                    Official Adoption Dossier & Complete Case Record
                                </h2>
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-role-muted text-role-strong border border-role-border">
                                    Dossier #{adoptionId}
                                </span>
                            </div>
                            <p className="text-xs text-slate-500 font-medium">
                                Full 10-Stage Life-Cycle Verification, Assessment Findings, and Audit Logs
                            </p>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-2" data-no-print>
                        <button
                            type="button"
                            onClick={() => printElementById('adoption-dossier-print', `Adoption Dossier #${adoptionId}`)}
                            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-black transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                            title="Print this case document"
                        >
                            <FileText className="w-4 h-4 text-role" />
                            <span>Print Report</span>
                        </button>
                        <button 
                            type="button" 
                            onClick={onClose} 
                            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="py-20 text-center space-y-3">
                        <div className="w-10 h-10 border-3 border-role border-t-transparent rounded-full animate-spin mx-auto" />
                        <p className="text-xs font-bold text-slate-500">Compiling complete case dossier and audit logs from official records...</p>
                    </div>
                ) : error ? (
                    <div className="py-12 text-center space-y-3 bg-red-50 dark:bg-red-950/30 p-6 rounded-2xl border border-red-200 dark:border-red-900">
                        <AlertCircle className="w-10 h-10 text-red-500 mx-auto" />
                        <p className="text-sm font-bold text-red-700 dark:text-red-300">{error}</p>
                        <button
                            type="button"
                            onClick={fetchDossier}
                            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                        >
                            Try Again
                        </button>
                    </div>
                ) : dossier ? (
                    <div className="space-y-6 text-xs text-slate-700 dark:text-slate-300">
                        
                        {/* 1. Case Summary Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Animal Card */}
                            <div className="p-4 rounded-2xl bg-role-soft/70 dark:bg-[#111624] border border-role-border/80 space-y-2">
                                <span className="text-[10px] font-black uppercase text-role-strong tracking-wider block">
                                    🐾 Animal Record
                                </span>
                                <div className="flex items-center gap-3">
                                    <img
                                        src={getPetPicture(app?.animal_photo)}
                                        alt={app?.animal_name || 'Pet'}
                                        className="w-14 h-14 rounded-xl object-cover border border-role-border shadow-2xs shrink-0 bg-white"
                                    />
                                    <div className="min-w-0">
                                        <h3 className="text-sm font-black text-slate-900 dark:text-white truncate">
                                            {app?.animal_name || 'Rescue Animal'}
                                        </h3>
                                        <p className="text-slate-600 dark:text-slate-400 text-xs font-semibold">
                                            {app?.animal_type || 'Rescue'} {app?.animal_breed ? `• ${app?.animal_breed}` : ''}
                                        </p>
                                        <span className="text-[10px] text-slate-500 font-bold block mt-0.5">
                                            Animal Holding ID: #{app?.holding_id}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Adopter Card */}
                            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-slate-800 space-y-2">
                                <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider block">
                                    👤 Adopter Information
                                </span>
                                <div>
                                    <h3 className="text-sm font-black text-slate-900 dark:text-white">
                                        {app?.full_name}
                                    </h3>
                                    <p className="text-slate-600 dark:text-slate-400 text-xs mt-0.5">
                                        📞 {app?.contact_no || 'N/A'} • 📍 {app?.address || 'Santa Maria, Bulacan'}
                                    </p>
                                    <p className="text-[11px] text-slate-500 mt-1">
                                        Living: <strong>{app?.living_space || 'House with yard'}</strong> • Other Pets: <strong>{app?.has_other_pets ? 'Yes' : 'None'}</strong>
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Stated Motivation */}
                        {app?.reason && (
                            <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200/70 space-y-1">
                                <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 flex items-center gap-1">
                                    <FileText className="w-3.5 h-3.5 text-amber-600" /> Applicant's Stated Motivation & Reason
                                </span>
                                <p className="text-xs text-slate-800 dark:text-slate-200 italic leading-relaxed">
                                    "{app.reason}"
                                </p>
                            </div>
                        )}

                        {/* 2. 10-Stage Lifecycle Audit Breakdown */}
                        <div className="space-y-3">
                            <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                                <FolderKanban className="w-4 h-4 text-role" /> Stage-by-Stage Verification & Assessment Dossier
                            </h3>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                                {/* Stage 2: Verification */}
                                <div className="p-4 rounded-2xl bg-white dark:bg-[#111624] border border-slate-200 dark:border-slate-800 space-y-2">
                                    <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800">
                                        <div className="flex items-center gap-1.5 font-black text-slate-900 dark:text-white">
                                            <ShieldCheck className="w-4 h-4 text-blue-500" /> Stage 2: Verification
                                        </div>
                                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${dossier.verification ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500'}`}>
                                            {dossier.verification ? 'Completed' : 'Pending'}
                                        </span>
                                    </div>
                                    {dossier.verification ? (
                                        <div className="space-y-1 text-slate-600 dark:text-slate-400">
                                            <p>Government ID Match: <strong>{dossier.verification.id_match_status || 'Verified Valid'}</strong></p>
                                            <p>Residency Check: <strong>{dossier.verification.residency_status || 'Confirmed Resident'}</strong></p>
                                            <p>Cruelty Registry: <strong className={dossier.verification.is_blacklisted ? 'text-red-600' : 'text-emerald-600'}>{dossier.verification.is_blacklisted ? 'Flagged / Blacklisted' : 'Clear & Verified'}</strong></p>
                                            {dossier.verification.verifier_name && <p className="text-[10px] text-slate-400">Officer: {dossier.verification.verifier_name}</p>}
                                            {dossier.verification.verification_notes && <p className="italic bg-slate-50 p-2 rounded-lg text-[11px]">"{dossier.verification.verification_notes}"</p>}
                                        </div>
                                    ) : (
                                        <span className="text-slate-400 italic">No verification record submitted yet.</span>
                                    )}
                                </div>

                                {/* Stage 3: Interview */}
                                <div className="p-4 rounded-2xl bg-white dark:bg-[#111624] border border-slate-200 dark:border-slate-800 space-y-2">
                                    <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800">
                                        <div className="flex items-center gap-1.5 font-black text-slate-900 dark:text-white">
                                            <Video className="w-4 h-4 text-purple-500" /> Stage 3: Interview
                                        </div>
                                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${dossier.interview ? 'bg-purple-50 text-purple-700 border border-purple-200' : 'bg-slate-100 text-slate-500'}`}>
                                            {dossier.interview ? (dossier.interview.interview_result || 'Successful') : 'Pending'}
                                        </span>
                                    </div>
                                    {dossier.interview ? (
                                        <div className="space-y-1 text-slate-600 dark:text-slate-400">
                                            <p>Mode: <strong>{dossier.interview.interview_mode || 'In-Person'}</strong></p>
                                            <p>Outcome: <strong className="text-purple-700">{dossier.interview.interview_result || 'Successful'}</strong></p>
                                            <p>Interviewer: <strong>{dossier.interview.interviewer_name || 'Barangay Staff'}</strong></p>
                                            {dossier.interview.conducted_date && (
                                                <p className="text-[10px] text-slate-400">Date: {new Date(dossier.interview.conducted_date).toLocaleDateString()}</p>
                                            )}
                                            {dossier.interview.interview_notes && <p className="italic bg-purple-50/50 p-2 rounded-lg text-[11px]">"{dossier.interview.interview_notes}"</p>}
                                        </div>
                                    ) : (
                                        <span className="text-slate-400 italic">Interview not yet completed.</span>
                                    )}
                                </div>

                                {/* Stage 4: Home Visit */}
                                <div className="p-4 rounded-2xl bg-white dark:bg-[#111624] border border-slate-200 dark:border-slate-800 space-y-2">
                                    <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800">
                                        <div className="flex items-center gap-1.5 font-black text-slate-900 dark:text-white">
                                            <Home className="w-4 h-4 text-teal-500" /> Stage 4: Home Visit
                                        </div>
                                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${dossier.home_visit ? 'bg-teal-50 text-teal-700 border border-teal-200' : 'bg-slate-100 text-slate-500'}`}>
                                            {dossier.home_visit ? (dossier.home_visit.inspection_result || 'Suitable') : 'Pending'}
                                        </span>
                                    </div>
                                    {dossier.home_visit ? (
                                        <div className="space-y-1 text-slate-600 dark:text-slate-400">
                                            <p>Perimeter Fencing: <strong>{dossier.home_visit.is_fencing_secure ? 'Secure ✓' : 'Inadequate ✗'}</strong></p>
                                            <p>Shelter & Comfort: <strong>{dossier.home_visit.is_shelter_adequate ? 'Adequate ✓' : 'Needs Improvement ✗'}</strong></p>
                                            <p>Inspector: <strong>{dossier.home_visit.inspector_name || 'Staff Inspector'}</strong></p>
                                            {dossier.home_visit.inspection_date && (
                                                <p className="text-[10px] text-slate-400">Inspection Date: {new Date(dossier.home_visit.inspection_date).toLocaleDateString()}</p>
                                            )}
                                            {dossier.home_visit.checklist_notes && <p className="italic bg-teal-50/50 p-2 rounded-lg text-[11px]">"{dossier.home_visit.checklist_notes}"</p>}
                                        </div>
                                    ) : (
                                        <span className="text-slate-400 italic">Home visit not yet conducted.</span>
                                    )}
                                </div>

                                {/* Stage 7: Certificate & Agreement */}
                                <div className="p-4 rounded-2xl bg-white dark:bg-[#111624] border border-slate-200 dark:border-slate-800 space-y-2">
                                    <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800">
                                        <div className="flex items-center gap-1.5 font-black text-slate-900 dark:text-white">
                                            <Award className="w-4 h-4 text-amber-500" /> Stage 7: Certificate of Adoption
                                        </div>
                                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${dossier.certificate ? 'bg-amber-50 text-amber-800 border border-amber-300' : 'bg-slate-100 text-slate-500'}`}>
                                            {dossier.certificate ? 'Issued' : 'Pending'}
                                        </span>
                                    </div>
                                    {dossier.certificate ? (
                                        <div className="space-y-1 text-slate-600 dark:text-slate-400">
                                            <p>Certificate #: <strong className="font-mono text-slate-900 dark:text-white">{dossier.certificate.certificate_number}</strong></p>
                                            <p>Issued Date: <strong>{new Date(dossier.certificate.issued_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</strong></p>
                                            {dossier.certificate.verification_hash && (
                                                <p className="truncate text-[10px] text-slate-400">
                                                    SHA-256: <span className="font-mono">{dossier.certificate.verification_hash}</span>
                                                </p>
                                            )}
                                        </div>
                                    ) : (
                                        <span className="text-slate-400 italic">Adoption certificate not yet generated.</span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* 3. Post-Adoption 30-Day Welfare Monitoring Logs */}
                        {dossier.monitoring_logs && dossier.monitoring_logs.length > 0 && (
                            <div className="space-y-2.5">
                                <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                                    <HeartHandshake className="w-4 h-4 text-emerald-600" /> Stage 9: 30-Day Welfare Monitoring Check-ins ({dossier.monitoring_logs.length} Recorded)
                                </h3>
                                <div className="space-y-2 max-h-48 overflow-y-auto">
                                    {dossier.monitoring_logs.map((log: any) => (
                                        <div key={log.log_id} className="p-3 rounded-xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-slate-800 text-xs flex items-center justify-between gap-3">
                                            <div>
                                                <span className="font-black text-slate-900 dark:text-white">{log.milestone_name || `Check-in #${log.log_id}`}</span>
                                                <p className="text-slate-500 text-[11px] mt-0.5">
                                                    Health: <strong>{log.health_status || 'Good'}</strong> • Officer: <strong>{log.reviewer_name || 'Staff'}</strong>
                                                </p>
                                                {log.review_notes && <p className="text-slate-600 italic mt-0.5 text-[11px]">"{log.review_notes.split('__JSON_META__')[0]}"</p>}
                                            </div>
                                            <span className="text-[10px] text-slate-400 font-bold shrink-0">
                                                {log.due_date ? new Date(log.due_date).toLocaleDateString() : 'Recorded'}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* 4. Complete Chronological Audit Timeline & Event Logs */}
                        <div className="pt-2 space-y-2.5">
                            <div className="flex items-center justify-between">
                                <h3 className="font-black text-slate-900 dark:text-white uppercase tracking-wider text-xs flex items-center gap-1.5">
                                    <Activity className="w-4 h-4 text-indigo-500" /> Complete Chronological Audit Trail & Event Logs ({dossier.timeline_logs?.length || 0})
                                </h3>
                                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 rounded-full border border-indigo-200 dark:border-indigo-800">
                                    Official Case Trail
                                </span>
                            </div>

                            <div className="space-y-2 max-h-72 overflow-y-auto bg-slate-50 dark:bg-[#0B0F19] p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
                                {dossier.timeline_logs && dossier.timeline_logs.length > 0 ? (
                                    dossier.timeline_logs.map((tl: any, idx: number) => (
                                        <div 
                                            key={tl.timeline_id || idx} 
                                            className="p-3 rounded-xl bg-white dark:bg-[#151C2C] border border-slate-200 dark:border-slate-800 text-[11px] flex items-start justify-between gap-3 shadow-2xs hover:border-role-border transition-colors"
                                        >
                                            <div className="min-w-0 space-y-1">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${getStageBadgeColor(tl.stage)}`}>
                                                        {tl.stage || 'General'}
                                                    </span>
                                                    <strong className="text-slate-900 dark:text-slate-100 text-xs">
                                                        {tl.action}
                                                    </strong>
                                                    {tl.actor_name && (
                                                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                                                            • Logged by <strong>{tl.actor_name}</strong>
                                                        </span>
                                                    )}
                                                </div>
                                                {tl.notes && (
                                                    <p className="text-slate-600 dark:text-slate-300 leading-relaxed font-medium bg-slate-50 dark:bg-[#0E131F] p-2 rounded-lg border border-slate-100 dark:border-slate-800/80">
                                                        {tl.notes}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="text-right shrink-0">
                                                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold block">
                                                    {new Date(tl.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                </span>
                                                <span className="text-[9px] text-slate-400 block">
                                                    {new Date(tl.created_at).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="p-4 text-center text-slate-400 italic">
                                        No specific timeline logs found for this case.
                                    </div>
                                )}
                            </div>
                        </div>

                    </div>
                ) : null}

                {/* Modal Footer */}
                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between flex-wrap gap-2 text-xs">
                    <span className="text-slate-400 text-[11px] font-medium">
                        StraySafe Animal Welfare & Adoption Management System
                    </span>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-black rounded-xl transition-all cursor-pointer text-xs shadow-xs"
                    >
                        Close Dossier
                    </button>
                </div>

            </div>
        </div>
    );
};
