import React, { useState, useEffect } from 'react';
import { api } from '../../utils/api';
import { 
    Activity, 
    X, 
    Calendar, 
    CheckCircle2, 
    Clock, 
    Camera, 
    Award,
    AlertCircle
} from 'lucide-react';

interface MonitoringLog {
    log_id: number;
    adoption_id: number;
    milestone_name: string;
    due_date: string;
    submitted_at?: string | null;
    status: string;
    health_status?: string | null;
    photos?: string[] | null;
    vet_record_url?: string | null;
    adopter_notes?: string | null;
    reviewer_name?: string | null;
    review_notes?: string | null;
    reviewed_at?: string | null;
}

interface AdoptionMonitoringModalProps {
    adoptionId: number;
    animalName: string;
    isOpen: boolean;
    onClose: () => void;
    onUpdate?: () => void;
}

export const AdoptionMonitoringModal: React.FC<AdoptionMonitoringModalProps> = ({
    adoptionId,
    animalName,
    isOpen,
    onClose,
    onUpdate,
}) => {
    const [logs, setLogs] = useState<MonitoringLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Active submission form state
    const [submittingMilestone, setSubmittingMilestone] = useState<string | null>(null);
    const [healthStatus, setHealthStatus] = useState<string>('Healthy');
    const [photoUrlInput, setPhotoUrlInput] = useState<string>('');
    const [photosList, setPhotosList] = useState<string[]>([]);
    const [adopterNotes, setAdopterNotes] = useState<string>('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const fetchLogs = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get(`/adoptions/${adoptionId}/monitoring`);
            setLogs(Array.isArray(res.data) ? res.data : []);
        } catch (err: any) {
            console.error("Failed to load monitoring logs:", err);
            setError(err.response?.data?.detail || "Could not load monitoring milestones.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen && adoptionId) {
            fetchLogs();
            setSubmittingMilestone(null);
            setPhotosList([]);
            setAdopterNotes('');
            setSuccessMessage(null);
        }
    }, [isOpen, adoptionId]);

    if (!isOpen) return null;

    const handleAddPhoto = () => {
        if (!photoUrlInput.trim()) return;
        setPhotosList(prev => [...prev, photoUrlInput.trim()]);
        setPhotoUrlInput('');
    };

    const handleRemovePhoto = (idx: number) => {
        setPhotosList(prev => prev.filter((_, i) => i !== idx));
    };

    const handleSubmitCheckin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!submittingMilestone) return;

        if (photosList.length === 0 && !photoUrlInput.trim()) {
            setSubmitError("Please provide at least one photo of the pet to confirm welfare.");
            return;
        }

        const finalPhotos = [...photosList];
        if (photoUrlInput.trim()) {
            finalPhotos.push(photoUrlInput.trim());
        }

        setIsSubmitting(true);
        setSubmitError(null);
        try {
            await api.post(`/adoptions/${adoptionId}/monitoring/${submittingMilestone}/submit`, {
                health_status: healthStatus,
                photos: finalPhotos,
                adopter_notes: adopterNotes,
            });
            setSuccessMessage(`Check-in for ${submittingMilestone.replace('_', ' ')} submitted successfully!`);
            setSubmittingMilestone(null);
            setPhotosList([]);
            setPhotoUrlInput('');
            setAdopterNotes('');
            await fetchLogs();
            if (onUpdate) onUpdate();
        } catch (err: any) {
            console.error("Failed to submit check-in:", err);
            setSubmitError(err.response?.data?.detail || "Failed to submit check-in. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const allApproved = logs.length > 0 && logs.every(l => l.status === 'Approved');

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
            <div className="bg-white dark:bg-[#151C2C] rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 my-auto max-h-[90vh] overflow-y-auto">
                {/* Modal Header */}
                <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-2xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                            <Activity className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                                Stage 9: 1-Month Welfare Monitoring
                            </h2>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                Post-Adoption Health & Living Environment Check-ins for {animalName || 'Adopted Pet'}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {successMessage && (
                    <div className="mt-4 p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-bold flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                        <span>{successMessage}</span>
                    </div>
                )}

                {allApproved && (
                    <div className="mt-4 p-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white flex items-center gap-3.5 shadow-md">
                        <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0">
                            <Award className="w-6 h-6 text-amber-200" />
                        </div>
                        <div>
                            <h4 className="font-black text-sm">Monitoring Complete — Case Officially Closed!</h4>
                            <p className="text-xs text-emerald-100 leading-relaxed">
                                All 3 post-adoption welfare milestones (Day 7, 14, 30) were verified and approved by Barangay Animal Welfare Services. Thank you for being a responsible pet guardian!
                            </p>
                        </div>
                    </div>
                )}

                {loading ? (
                    <div className="py-16 text-center space-y-3">
                        <div className="w-10 h-10 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
                        <p className="text-xs font-bold text-slate-500">Loading welfare milestones...</p>
                    </div>
                ) : error ? (
                    <div className="py-12 text-center space-y-3">
                        <AlertCircle className="w-10 h-10 text-red-500 mx-auto" />
                        <p className="text-sm font-bold text-red-600 dark:text-red-400">{error}</p>
                    </div>
                ) : (
                    <div className="mt-6 space-y-4">
                        {/* Milestones List */}
                        <div className="grid grid-cols-1 gap-3.5">
                            {logs.map((log) => {
                                const isPending = log.status === 'Pending';
                                const isSubmitted = log.status === 'Submitted';
                                const isApproved = log.status === 'Approved';
                                const isNeedsFix = log.status === 'Needs_Correction' || log.status === 'Delinquent';
                                const canSubmit = isPending || isNeedsFix;

                                const milestoneLabel = log.milestone_name === 'Day_7'
                                    ? 'Day 7 (1 Week Check-in)'
                                    : log.milestone_name === 'Day_14'
                                    ? 'Day 14 (2 Weeks Check-in)'
                                    : 'Day 30 (1 Month Final Check-in)';

                                return (
                                    <div
                                        key={log.log_id}
                                        className={`p-4 rounded-2xl border transition-all ${
                                            isApproved
                                                ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/80'
                                                : isSubmitted
                                                ? 'bg-amber-50/40 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/80'
                                                : isNeedsFix
                                                ? 'bg-red-50/40 dark:bg-red-950/20 border-red-200 dark:border-red-800/80'
                                                : 'bg-white dark:bg-[#151C2C] border-slate-200 dark:border-slate-800'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                                            <div className="flex items-center gap-2">
                                                <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs ${
                                                    isApproved
                                                        ? 'bg-emerald-600 text-white'
                                                        : isSubmitted
                                                        ? 'bg-amber-500 text-white'
                                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                                                }`}>
                                                    {log.milestone_name.replace('Day_', 'D')}
                                                </div>
                                                <div>
                                                    <h4 className="font-black text-sm text-slate-900 dark:text-white">
                                                        {milestoneLabel}
                                                    </h4>
                                                    <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                                                        <Calendar className="w-3 h-3 text-slate-400" />
                                                        Due: {log.due_date}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Status Badge */}
                                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1 ${
                                                isApproved
                                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                                    : isSubmitted
                                                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                                    : isNeedsFix
                                                    ? 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300'
                                                    : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                            }`}>
                                                {isApproved ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                                                {log.status.replace('_', ' ')}
                                            </span>
                                        </div>

                                        {/* Submitted Details */}
                                        {log.submitted_at && (
                                            <div className="mt-2 text-xs text-slate-600 dark:text-slate-300 bg-white/70 dark:bg-[#0B0F19]/60 p-3 rounded-xl border border-slate-100 dark:border-slate-800 space-y-1">
                                                <div className="flex items-center justify-between">
                                                    <span className="font-bold">Health Status: <span className="text-emerald-600">{log.health_status}</span></span>
                                                    <span className="text-[10px] text-slate-400">
                                                        Submitted on {new Date(log.submitted_at).toLocaleDateString()}
                                                    </span>
                                                </div>
                                                {log.adopter_notes && (
                                                    <p className="text-[11px] text-slate-500 italic">"{log.adopter_notes}"</p>
                                                )}
                                                {log.photos && Array.isArray(log.photos) && log.photos.length > 0 && (
                                                    <div className="flex items-center gap-2 pt-1 overflow-x-auto">
                                                        {log.photos.map((url, i) => (
                                                            <a key={i} href={url} target="_blank" rel="noreferrer">
                                                                <img src={url} alt="Pet Welfare" className="w-12 h-12 object-cover rounded-lg border border-slate-200" />
                                                            </a>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Staff Review Remarks */}
                                        {log.review_notes && (
                                            <div className="mt-2 p-2.5 rounded-xl bg-orange-50/70 dark:bg-orange-950/30 border border-orange-200/70 dark:border-orange-900/50 text-xs text-orange-950 dark:text-orange-200">
                                                <span className="font-bold block text-[10px] uppercase tracking-wider text-orange-800 dark:text-orange-400">
                                                    Barangay Reviewer Notes ({log.reviewer_name || 'Staff'}):
                                                </span>
                                                {log.review_notes}
                                            </div>
                                        )}

                                        {/* Submit Button Trigger */}
                                        {canSubmit && submittingMilestone !== log.milestone_name && (
                                            <div className="mt-3 flex justify-end">
                                                <button
                                                    onClick={() => {
                                                        setSubmittingMilestone(log.milestone_name);
                                                        setSubmitError(null);
                                                    }}
                                                    className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                                                >
                                                    <Camera className="w-3.5 h-3.5" />
                                                    <span>Submit {log.milestone_name.replace('_', ' ')} Check-in</span>
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Submission Form Modal / Box */}
                        {submittingMilestone && (
                            <form onSubmit={handleSubmitCheckin} className="mt-5 p-5 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 space-y-4">
                                <div className="flex items-center justify-between">
                                    <h4 className="font-black text-sm text-indigo-950 dark:text-indigo-200 flex items-center gap-2">
                                        <Camera className="w-4 h-4 text-indigo-600" />
                                        Submit Check-in: {submittingMilestone.replace('_', ' ')}
                                    </h4>
                                    <button
                                        type="button"
                                        onClick={() => setSubmittingMilestone(null)}
                                        className="text-xs font-bold text-slate-400 hover:text-slate-600"
                                    >
                                        Cancel
                                    </button>
                                </div>

                                {submitError && (
                                    <div className="p-3 rounded-xl bg-red-100 text-red-800 text-xs font-bold flex items-center gap-2">
                                        <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                                        <span>{submitError}</span>
                                    </div>
                                )}

                                <div>
                                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                        Pet Health & Demeanor <span className="text-red-500">*</span>
                                    </label>
                                    <select
                                        value={healthStatus}
                                        onChange={(e) => setHealthStatus(e.target.value)}
                                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C] text-xs font-bold text-slate-900 dark:text-white"
                                    >
                                        <option value="Healthy">Healthy & Energetic (Good appetite, active)</option>
                                        <option value="Minor_Illness">Minor Issue (Adjusting, mild dietary transition)</option>
                                        <option value="Under_Treatment">Under Veterinary Treatment</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                        Add Photo Evidence URL <span className="text-red-500">*</span>
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="url"
                                            value={photoUrlInput}
                                            onChange={(e) => setPhotoUrlInput(e.target.value)}
                                            placeholder="https://... photo of pet at home"
                                            className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C] text-xs font-medium text-slate-900 dark:text-white focus:outline-hidden"
                                        />
                                        <button
                                            type="button"
                                            onClick={handleAddPhoto}
                                            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl cursor-pointer"
                                        >
                                            Add
                                        </button>
                                    </div>
                                    {photosList.length > 0 && (
                                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                                            {photosList.map((p, idx) => (
                                                <div key={idx} className="relative group">
                                                    <img src={p} alt="Evidence" className="w-12 h-12 object-cover rounded-lg border border-indigo-200" />
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemovePhoto(idx)}
                                                        className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 text-white rounded-full flex items-center justify-center text-[10px] font-black cursor-pointer"
                                                    >
                                                        ×
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                        Guardian Observations & Notes
                                    </label>
                                    <textarea
                                        rows={3}
                                        value={adopterNotes}
                                        onChange={(e) => setAdopterNotes(e.target.value)}
                                        placeholder="How is the pet settling in? Diet, bonding, favorite spots, vet visits..."
                                        className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C] text-xs font-medium text-slate-900 dark:text-white resize-none"
                                    />
                                </div>

                                <div className="flex items-center justify-end gap-2 pt-1">
                                    <button
                                        type="button"
                                        onClick={() => setSubmittingMilestone(null)}
                                        disabled={isSubmitting}
                                        className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-200 rounded-xl cursor-pointer"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isSubmitting}
                                        className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                    >
                                        {isSubmitting ? 'Submitting Check-in...' : 'Submit Welfare Check-in'}
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdoptionMonitoringModal;
