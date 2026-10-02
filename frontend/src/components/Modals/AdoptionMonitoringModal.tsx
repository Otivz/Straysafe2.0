import React, { useState, useEffect } from 'react';
import { api } from '../../utils/api';
import { 
    Activity, 
    X, 
    Calendar, 
    CheckCircle2, 
    Award,
    AlertCircle,
    Plus
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

    // Active tab / mode: 'history' | 'add_record'
    const [viewMode, setViewMode] = useState<'history' | 'add_record'>('history');

    // Staff Add Monitoring Record form state
    const [monitoringDate, setMonitoringDate] = useState<string>('');
    const [monitoringPersonnel, setMonitoringPersonnel] = useState<string>('');
    const [animalCondition, setAnimalCondition] = useState<string>('Healthy & Active');
    const [livingCondition, setLivingCondition] = useState<string>('Good (Safe & Clean)');
    const [adopterCompliance, setAdopterCompliance] = useState<string>('Fully Compliant');
    const [observations, setObservations] = useState<string>('');
    const [comments, setComments] = useState<string>('');
    const [followUpAction, setFollowUpAction] = useState<string>('Routine follow-up in 2 weeks');
    const [photoUrlInput, setPhotoUrlInput] = useState<string>('');
    const [photosList, setPhotosList] = useState<string[]>([]);
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
            setViewMode('history');
            const now = new Date();
            setMonitoringDate(now.toISOString().split('T')[0]);
            setPhotosList([]);
            setObservations('');
            setComments('');
            setSubmitError(null);
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

    const handleSubmitStaffRecord = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setSubmitError(null);

        const finalPhotos = [...photosList];
        if (photoUrlInput.trim()) {
            finalPhotos.push(photoUrlInput.trim());
        }

        try {
            await api.post(`/adoptions/${adoptionId}/monitoring/record`, {
                monitoring_date: monitoringDate ? new Date(monitoringDate).toISOString() : new Date().toISOString(),
                monitoring_personnel: monitoringPersonnel || undefined,
                animal_condition: animalCondition,
                living_condition: livingCondition,
                adopter_compliance: adopterCompliance,
                observations: observations || undefined,
                comments: comments || undefined,
                follow_up_action: followUpAction || undefined,
                photos: finalPhotos,
            });

            setSuccessMessage("Post-adoption monitoring record added successfully!");
            setViewMode('history');
            setPhotosList([]);
            setPhotoUrlInput('');
            setObservations('');
            setComments('');
            await fetchLogs();
            if (onUpdate) onUpdate();
        } catch (err: any) {
            console.error("Failed to add monitoring record:", err);
            setSubmitError(err.response?.data?.detail || "Failed to add monitoring record.");
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
                                Stage 9: Post-Adoption Welfare Monitoring
                            </h2>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                Welfare Follow-up Records & Health Check-ins for {animalName || 'Adopted Pet'} (App #{adoptionId})
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

                {/* View Mode Toggle */}
                <div className="flex items-center gap-2 mt-4">
                    <button
                        type="button"
                        onClick={() => setViewMode('history')}
                        className={`flex-1 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
                            viewMode === 'history'
                                ? 'bg-indigo-600 text-white shadow-xs'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                        }`}
                    >
                        Monitoring History ({logs.length})
                    </button>
                    <button
                        type="button"
                        onClick={() => setViewMode('add_record')}
                        className={`flex-1 py-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                            viewMode === 'add_record'
                                ? 'bg-indigo-600 text-white shadow-xs'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                        }`}
                    >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Monitoring Record</span>
                    </button>
                </div>

                {successMessage && (
                    <div className="mt-4 p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-bold flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                        <span>{successMessage}</span>
                    </div>
                )}

                {allApproved && viewMode === 'history' && (
                    <div className="mt-4 p-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white flex items-center gap-3.5 shadow-md">
                        <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0">
                            <Award className="w-6 h-6 text-amber-200" />
                        </div>
                        <div>
                            <h4 className="font-black text-sm">Post-Adoption Welfare Monitoring Active & Well</h4>
                            <p className="text-xs text-emerald-100 leading-relaxed">
                                Pet welfare checks are recorded and verified by Barangay Animal Welfare Services.
                            </p>
                        </div>
                    </div>
                )}

                {loading ? (
                    <div className="py-16 text-center space-y-3">
                        <div className="w-10 h-10 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
                        <p className="text-xs font-bold text-slate-500">Loading welfare records...</p>
                    </div>
                ) : error ? (
                    <div className="py-12 text-center space-y-3">
                        <AlertCircle className="w-10 h-10 text-red-500 mx-auto" />
                        <p className="text-sm font-bold text-red-600 dark:text-red-400">{error}</p>
                    </div>
                ) : viewMode === 'history' ? (
                    /* ── CHRONOLOGICAL MONITORING HISTORY ── */
                    <div className="mt-4 space-y-3">
                        {logs.length === 0 ? (
                            <div className="p-8 text-center border border-dashed border-slate-200 rounded-2xl text-slate-400 text-xs">
                                <p>No monitoring records logged yet.</p>
                                <button
                                    onClick={() => setViewMode('add_record')}
                                    className="mt-2 text-indigo-600 font-bold underline cursor-pointer"
                                >
                                    + Add first monitoring record
                                </button>
                            </div>
                        ) : (
                            logs.map((log) => (
                                <div
                                    key={log.log_id}
                                    className="p-4 rounded-2xl border bg-white dark:bg-[#151C2C] border-slate-200 dark:border-slate-800 space-y-2 shadow-2xs"
                                >
                                    <div className="flex items-center justify-between flex-wrap gap-2">
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-black text-xs">
                                                <Activity className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <h4 className="font-black text-sm text-slate-900 dark:text-white">
                                                    {log.milestone_name.replace(/_/g, ' ')}
                                                </h4>
                                                <span className="text-[11px] text-slate-400 flex items-center gap-1">
                                                    <Calendar className="w-3 h-3" />
                                                    Date: {log.due_date || (log.submitted_at ? new Date(log.submitted_at).toLocaleDateString() : 'N/A')}
                                                </span>
                                            </div>
                                        </div>

                                        <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 flex items-center gap-1">
                                            <CheckCircle2 className="w-3 h-3" />
                                            {log.status}
                                        </span>
                                    </div>

                                    {log.health_status && (
                                        <div className="text-xs text-slate-600 dark:text-slate-300">
                                            <span className="font-bold">Condition: </span>
                                            <span className="text-emerald-600 font-extrabold">{log.health_status}</span>
                                        </div>
                                    )}

                                    {log.adopter_notes && (
                                        <p className="text-xs text-slate-600 dark:text-slate-300 italic bg-slate-50 dark:bg-[#0B0F19] p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
                                            "{log.adopter_notes}"
                                        </p>
                                    )}

                                    {log.review_notes && (
                                        <div className="text-xs text-indigo-950 dark:text-indigo-200 bg-indigo-50/70 dark:bg-indigo-950/30 p-2.5 rounded-xl border border-indigo-200/70">
                                            <span className="font-bold block text-[10px] uppercase text-indigo-700">
                                                Inspector / Staff Findings ({log.reviewer_name || 'Staff'}):
                                            </span>
                                            <p className="leading-relaxed">{log.review_notes}</p>
                                        </div>
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
                            ))
                        )}
                    </div>
                ) : (
                    /* ── ADD STAFF MONITORING RECORD FORM ── */
                    <form onSubmit={handleSubmitStaffRecord} className="mt-4 space-y-3.5 text-xs text-slate-700 dark:text-slate-300">
                        {submitError && (
                            <div className="p-3 rounded-xl bg-red-100 text-red-800 text-xs font-bold flex items-center gap-2">
                                <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                                <span>{submitError}</span>
                            </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="block font-bold mb-1">Monitoring Date <span className="text-red-500">*</span></label>
                                <input
                                    type="date"
                                    value={monitoringDate}
                                    onChange={(e) => setMonitoringDate(e.target.value)}
                                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C] font-semibold"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block font-bold mb-1">Monitoring Personnel / Officer</label>
                                <input
                                    type="text"
                                    value={monitoringPersonnel}
                                    onChange={(e) => setMonitoringPersonnel(e.target.value)}
                                    placeholder="e.g. Officer Juan Dela Cruz"
                                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C]"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                            <div>
                                <label className="block font-bold mb-1">Animal Condition</label>
                                <select
                                    value={animalCondition}
                                    onChange={(e) => setAnimalCondition(e.target.value)}
                                    className="w-full px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C] font-semibold"
                                >
                                    <option value="Healthy & Active">Healthy & Active</option>
                                    <option value="Good Condition">Good Condition</option>
                                    <option value="Minor Care Needed">Minor Care Needed</option>
                                    <option value="Under Veterinary Care">Under Veterinary Care</option>
                                </select>
                            </div>
                            <div>
                                <label className="block font-bold mb-1">Living Condition</label>
                                <select
                                    value={livingCondition}
                                    onChange={(e) => setLivingCondition(e.target.value)}
                                    className="w-full px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C] font-semibold"
                                >
                                    <option value="Excellent (Clean & Spacious)">Excellent</option>
                                    <option value="Good (Safe & Clean)">Good</option>
                                    <option value="Adequate">Adequate</option>
                                    <option value="Needs Sanitation Fix">Needs Sanitation Fix</option>
                                </select>
                            </div>
                            <div>
                                <label className="block font-bold mb-1">Adopter Compliance</label>
                                <select
                                    value={adopterCompliance}
                                    onChange={(e) => setAdopterCompliance(e.target.value)}
                                    className="w-full px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C] font-semibold"
                                >
                                    <option value="Fully Compliant">Fully Compliant</option>
                                    <option value="Minor Follow-up Needed">Minor Follow-up</option>
                                    <option value="Non-Compliant">Non-Compliant</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block font-bold mb-1">Observations & Adopter Feedback</label>
                            <textarea
                                rows={2}
                                value={observations}
                                onChange={(e) => setObservations(e.target.value)}
                                placeholder="Pet demeanor, weight, appetite, interaction with family..."
                                className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C] resize-none"
                            />
                        </div>

                        <div>
                            <label className="block font-bold mb-1">Staff Comments & Follow-up Action</label>
                            <input
                                type="text"
                                value={followUpAction}
                                onChange={(e) => setFollowUpAction(e.target.value)}
                                placeholder="e.g. Next visit scheduled for next month, vaccine booster due..."
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C]"
                            />
                        </div>

                        <div>
                            <label className="block font-bold mb-1">Add Photo Evidence URL (Optional)</label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="url"
                                    value={photoUrlInput}
                                    onChange={(e) => setPhotoUrlInput(e.target.value)}
                                    placeholder="https://... photo of pet at home"
                                    className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C]"
                                />
                                <button
                                    type="button"
                                    onClick={handleAddPhoto}
                                    className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl cursor-pointer"
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

                        <div className="flex items-center justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => setViewMode('history')}
                                className="px-4 py-2 font-bold text-slate-500 cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl shadow-xs transition-colors cursor-pointer"
                            >
                                {isSubmitting ? 'Saving Record...' : 'Save Monitoring Record'}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
};

export default AdoptionMonitoringModal;
