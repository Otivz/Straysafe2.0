import React, { useEffect, useState } from 'react';
import { Clock, Camera, CheckCircle2, AlertTriangle, PawPrint, FileText, MessageSquare } from 'lucide-react';
import {
    COMPLIANCE_BADGE_CLASSES,
    getComplianceLabel,
    isObservationOpenForUpdates,
    mergeOwnerUpdate,
    type OwnerObservation,
    type OwnerObservationUpdate,
} from '../utils/ownerObservationUpdates';
import { formatObservationRemaining } from '../utils/ownerFollowUpTime';
import { cloudinaryResized } from '../utils/cloudinaryImage';
import OwnerObservationUpdateModal from './OwnerObservationUpdateModal';

const formatDateTime = (value: string | null | undefined): string => {
    if (!value) return 'Not recorded';
    const d = new Date(value.includes(' ') && !value.includes('T') ? value.replace(' ', 'T') : value);
    if (isNaN(d.getTime())) return value;
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
};

const getOwnerStatusLabel = (obs: OwnerObservation): { label: string; tone: string } => {
    switch (obs.workflow_section) {
        case 'resolved':
            return { label: 'Resolved (Verified by Subdivision)', tone: 'bg-emerald-100 text-emerald-800' };
        case 'endorsed':
            return { label: 'Endorsed to Barangay', tone: 'bg-purple-100 text-purple-800' };
        case 'second_warning_issued':
            return { label: 'Second Warning Issued', tone: 'bg-rose-100 text-rose-800' };
        case 'for_second_warning':
            return { label: 'Deadline Passed · Under Review', tone: 'bg-rose-100 text-rose-800' };
        default:
            return obs.status === 'observing'
                ? { label: 'Under 3-Day Observation', tone: 'bg-orange-100 text-orange-800' }
                : { label: obs.status.toUpperCase(), tone: 'bg-gray-100 text-gray-700' };
    }
};

interface OwnerUpdateHistoryProps {
    updates: OwnerObservationUpdate[];
}

export const OwnerUpdateHistory: React.FC<OwnerUpdateHistoryProps> = ({ updates }) => {
    if (updates.length === 0) {
        return (
            <p className="p-3 rounded-xl bg-white/80 border border-orange-100 text-center text-[11px] text-gray-400 font-medium">
                You have not submitted an update yet.
            </p>
        );
    }
    return (
        <ul className="space-y-2">
            {updates.map((u) => (
                <li key={u.update_id} className="p-3 rounded-xl bg-white dark:bg-gray-800 border border-orange-100 dark:border-gray-700 text-xs space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className={`px-2 py-0.5 rounded-full border text-[10px] font-black ${COMPLIANCE_BADGE_CLASSES[u.compliance_status] || 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                            {getComplianceLabel(u.compliance_status)}
                        </span>
                        <span className="text-[10px] text-gray-400 font-bold">{formatDateTime(u.submitted_at)}</span>
                    </div>
                    <p className="text-gray-700 dark:text-gray-200 font-medium whitespace-pre-wrap break-words">{u.owner_remarks}</p>
                    {u.photos.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                            {u.photos.map((ph) => (
                                <a key={ph.photo_id} href={ph.photo_url} target="_blank" rel="noopener noreferrer" className="block">
                                    <img
                                        src={cloudinaryResized(ph.photo_url, 160)}
                                        alt="Submitted evidence"
                                        className="w-14 h-14 rounded-lg object-cover border border-orange-200"
                                        loading="lazy"
                                    />
                                </a>
                            ))}
                        </div>
                    )}
                    <div className="text-[10px] font-bold">
                        {u.is_reviewed ? (
                            <span className="text-emerald-700 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Reviewed by {u.reviewer_name || 'Subdivision'} · {formatDateTime(u.reviewed_at)}
                            </span>
                        ) : (
                            <span className="text-amber-700">Waiting for subdivision review</span>
                        )}
                        {u.is_reviewed && u.review_remarks && (
                            <p className="mt-1 p-2 rounded-lg bg-emerald-50 text-emerald-900 font-medium flex gap-1.5">
                                <MessageSquare className="w-3 h-3 mt-0.5 shrink-0" /> {u.review_remarks}
                            </p>
                        )}
                    </div>
                </li>
            ))}
        </ul>
    );
};

interface OwnerObservationCardProps {
    observation: OwnerObservation;
    onSaved?: (observation: OwnerObservation) => void;
}

const OwnerObservationCard: React.FC<OwnerObservationCardProps> = ({ observation, onSaved }) => {
    const [obs, setObs] = useState(observation);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [, setTick] = useState(0);
    // Take fresh data from the parent (e.g., after a refetch) without an effect.
    const [lastObservation, setLastObservation] = useState(observation);
    if (observation !== lastObservation) {
        setLastObservation(observation);
        setObs(observation);
    }

    // Re-render every minute so the countdown stays current.
    useEffect(() => {
        const timer = setInterval(() => setTick((t) => t + 1), 60000);
        return () => clearInterval(timer);
    }, []);

    const remaining = formatObservationRemaining(obs.due_at);
    const statusInfo = getOwnerStatusLabel(obs);
    const canSubmit = isObservationOpenForUpdates(obs);
    const animalName = obs.animal_name || 'Your Pet';

    const handleSaved = (saved: OwnerObservationUpdate) => {
        const updates = mergeOwnerUpdate(obs.owner_updates, saved);
        const next = { ...obs, owner_updates: updates, owner_updates_count: updates.length };
        setObs(next);
        setIsModalOpen(false);
        setSuccessMessage('Your update was saved and sent to your subdivision. The observation deadline is unchanged.');
        onSaved?.(next);
    };

    return (
        <section className="w-full p-4 sm:p-5 rounded-2xl sm:rounded-3xl border-2 border-orange-200 dark:border-orange-900 bg-gradient-to-br from-orange-50/90 via-amber-50/50 to-white dark:from-orange-950/30 dark:via-gray-900 dark:to-gray-900 shadow-sm space-y-4">
            {/* Header: animal, report, status */}
            <div className="flex items-start gap-3">
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl overflow-hidden bg-orange-100 border border-orange-200 shrink-0 flex items-center justify-center">
                    {obs.animal_photo ? (
                        <img src={cloudinaryResized(obs.animal_photo, 200)} alt={animalName} className="w-full h-full object-cover" />
                    ) : (
                        <PawPrint className="w-7 h-7 text-[#F97316]" />
                    )}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-black text-[#1a1208] dark:text-white truncate">{animalName}</h3>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${statusInfo.tone}`}>
                            {statusInfo.label}
                        </span>
                    </div>
                    <p className="text-[11px] text-gray-500 font-bold mt-0.5 flex items-center gap-1">
                        <FileText className="w-3 h-3" /> Report #{obs.report_id}
                        {obs.subdivision_name ? ` · ${obs.subdivision_name}` : ''}
                    </p>
                </div>
            </div>

            {successMessage && (
                <div role="status" className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" /> {successMessage}
                </div>
            )}

            {/* Countdown and key dates */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <div className="p-3 rounded-xl bg-white/90 dark:bg-gray-800 border border-orange-100 dark:border-gray-700">
                    <span className="block text-[9.5px] font-black uppercase tracking-wider text-gray-400">First Warning Issued</span>
                    <span className="font-bold text-gray-800 dark:text-gray-100">{formatDateTime(obs.first_warning_date)}</span>
                    {obs.first_warning_violation && (
                        <span className="block text-[10px] text-gray-500 font-medium mt-0.5">{obs.first_warning_violation}</span>
                    )}
                </div>
                <div className="p-3 rounded-xl bg-white/90 dark:bg-gray-800 border border-orange-100 dark:border-gray-700">
                    <span className="block text-[9.5px] font-black uppercase tracking-wider text-gray-400">3-Day Deadline</span>
                    <span className="font-bold text-gray-800 dark:text-gray-100">{formatDateTime(obs.due_at)}</span>
                </div>
                <div className={`p-3 rounded-xl border ${remaining.isOverdue ? 'bg-rose-50 border-rose-200' : 'bg-orange-50 border-orange-200'}`}>
                    <span className="block text-[9.5px] font-black uppercase tracking-wider text-gray-400">Remaining Time</span>
                    <span className={`font-black flex items-center gap-1 ${remaining.isOverdue ? 'text-rose-700' : 'text-[#EA580C]'}`}>
                        <Clock className="w-3.5 h-3.5" /> {obs.status === 'observing' ? remaining.text : 'Observation ended'}
                    </span>
                </div>
            </div>

            {canSubmit ? (
                <div className="p-3 rounded-xl bg-white/90 dark:bg-gray-800 border border-orange-100 dark:border-gray-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <p className="text-[11px] text-gray-600 dark:text-gray-300 font-medium leading-relaxed">
                        Address the reported violation and tell your subdivision what you did. Photos help them verify faster.
                        Submitting an update does not close the case; only the subdivision can verify it as resolved.
                    </p>
                    <button
                        type="button"
                        onClick={() => { setSuccessMessage(null); setIsModalOpen(true); }}
                        className="shrink-0 px-4 py-2.5 rounded-xl bg-[#F97316] hover:bg-[#EA580C] text-white font-black text-xs uppercase tracking-wider shadow-sm inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                        <Camera className="w-4 h-4" /> Submit Observation Update
                    </button>
                </div>
            ) : (
                <p className="p-3 rounded-xl bg-gray-50 border border-gray-200 text-[11px] text-gray-600 font-medium flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-gray-400" />
                    This observation is no longer accepting updates. Your submitted updates are kept on record.
                </p>
            )}

            {/* Submission history */}
            <div className="space-y-2">
                <h4 className="text-[10px] font-black uppercase tracking-wider text-gray-500 flex items-center justify-between">
                    <span>Your Submitted Updates</span>
                    <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-800">{obs.owner_updates.length}</span>
                </h4>
                <OwnerUpdateHistory updates={obs.owner_updates} />
            </div>

            {isModalOpen && (
                <OwnerObservationUpdateModal
                    followupId={obs.followup_id}
                    reportId={obs.report_id}
                    animalName={animalName}
                    onClose={() => setIsModalOpen(false)}
                    onSaved={handleSaved}
                />
            )}
        </section>
    );
};

export default OwnerObservationCard;
