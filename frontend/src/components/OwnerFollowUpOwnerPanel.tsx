import React, { useState, useEffect } from 'react';
import {
    Clock, CheckCircle2, AlertTriangle, Check, Camera
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type {
    OwnerFollowUp
} from '../utils/ownerFollowUp';
import {
    getFollowUpByReport,
    acknowledgeFollowUp,
    formatObservationRemaining
} from '../utils/ownerFollowUp';
import { mergeOwnerUpdate, type OwnerObservationUpdate } from '../utils/ownerObservationUpdates';
import { OwnerUpdateHistory } from './OwnerObservationCard';
import OwnerObservationUpdateModal from './OwnerObservationUpdateModal';

interface OwnerFollowUpOwnerPanelProps {
    reportId: number;
    currentUserId?: number | null;
    onStatusUpdated?: () => void;
}

export const OwnerFollowUpOwnerPanel: React.FC<OwnerFollowUpOwnerPanelProps> = ({
    reportId,
    currentUserId,
    onStatusUpdated
}) => {
    const [followup, setFollowup] = useState<OwnerFollowUp | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [actionLoading, setActionLoading] = useState<boolean>(false);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const [showUpdateModal, setShowUpdateModal] = useState<boolean>(false);

    const loadFollowUp = async () => {
        setLoading(true);
        try {
            const data = await getFollowUpByReport(reportId);
            setFollowup(data);
        } catch (err) {
            console.error('Failed to load owner follow-up:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadFollowUp();
    }, [reportId]);

    // If no follow-up or user is not the recorded owner, do not render this owner panel
    if (loading || !followup) return null;
    if (!currentUserId || followup.owner_id !== currentUserId) return null;

    const isObserving = followup.status === 'observing';
    const timeRemaining = formatObservationRemaining(followup.due_at);

    const handleAcknowledge = async () => {
        setActionLoading(true);
        setErrorMessage(null);
        try {
            const updated = await acknowledgeFollowUp(followup.followup_id, 'account', 'Acknowledged by owner via application.');
            setFollowup(updated);
            setSuccessMessage('Notice successfully acknowledged.');
            if (onStatusUpdated) onStatusUpdated();
        } catch (err: any) {
            setErrorMessage(err?.response?.data?.detail || 'Failed to acknowledge notice.');
        } finally {
            setActionLoading(false);
        }
    };

    const handleUpdateSaved = (saved: OwnerObservationUpdate) => {
        setFollowup({ ...followup, owner_updates: mergeOwnerUpdate(followup.owner_updates, saved) });
        setShowUpdateModal(false);
        setSuccessMessage('Observation update submitted to your subdivision. The observation deadline is unchanged.');
        if (onStatusUpdated) onStatusUpdated();
    };

    return (
        <div className="w-full p-4 sm:p-5 rounded-2xl sm:rounded-3xl border-2 border-orange-300 dark:border-orange-800 bg-gradient-to-br from-orange-50/95 via-amber-50/70 to-white dark:from-orange-950/40 dark:via-gray-900 dark:to-gray-900 shadow-md space-y-3.5 my-3">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-orange-200 dark:border-orange-900/60">
                <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-orange-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                        <Clock className="w-4 h-4" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h4 className="text-xs font-black uppercase tracking-wider text-orange-950 dark:text-orange-200">
                                Notice to Pet Owner: Observation Required
                            </h4>
                            <span className={`px-2 py-0.5 rounded-full text-[8.5px] font-black uppercase tracking-wider ${
                                isObserving
                                    ? (timeRemaining.isOverdue ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-200' : 'bg-orange-100 text-orange-800 dark:bg-orange-900/60 dark:text-orange-200')
                                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200'
                            }`}>
                                {isObserving ? (timeRemaining.isOverdue ? 'Overdue' : 'Active') : followup.status.toUpperCase()}
                            </span>
                        </div>
                        <p className="text-[10px] text-gray-500 font-medium">
                            Follow-Up #{followup.followup_id} • Assigned Leader: {followup.leader_name || 'Community Official'}
                        </p>
                    </div>
                </div>

                {isObserving && (
                    <div className="text-left sm:text-right">
                        <span className={`text-xs font-black uppercase tracking-wider ${timeRemaining.isOverdue ? 'text-rose-600 dark:text-rose-400' : 'text-orange-600 dark:text-orange-400'}`}>
                            {timeRemaining.text}
                        </span>
                        <p className="text-[9.5px] text-gray-500">Deadline: {new Date(followup.due_at).toLocaleDateString()} {new Date(followup.due_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                )}
            </div>

            {/* Alert / Success messages */}
            {successMessage && (
                <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 text-emerald-800 dark:text-emerald-200 text-xs font-bold flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                    <span>{successMessage}</span>
                </div>
            )}
            {errorMessage && (
                <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 text-rose-800 dark:text-rose-200 text-xs font-bold flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                    <span>{errorMessage}</span>
                </div>
            )}

            {/* Instructions */}
            <div className="p-3 rounded-xl bg-white/90 dark:bg-gray-800/80 border border-orange-100 dark:border-orange-900/40 text-xs space-y-1">
                <span className="text-[9.5px] font-black uppercase tracking-wider text-gray-400">Leader Instructions:</span>
                <p className="text-gray-800 dark:text-gray-200 font-medium leading-relaxed">
                    {followup.notes || 'Please ensure your pet remains secured within your residential premises. Submit a photo verifying containment to avoid escalation.'}
                </p>
                {followup.is_extended && (
                    <p className="text-[10px] text-orange-600 dark:text-orange-400 font-bold mt-1">
                        * Observation deadline extended by {followup.extension_days || 3} days. Reason: {followup.extension_reason}
                    </p>
                )}
            </div>

            {/* Acknowledgement Status / Action */}
            {isObserving && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-white/90 dark:bg-gray-800/80 border border-orange-100 dark:border-orange-900/40 text-xs">
                    <div>
                        <span className="text-[9.5px] font-black uppercase tracking-wider text-gray-400">Notice Acknowledgement</span>
                        <p className="text-gray-800 dark:text-gray-200 font-bold mt-0.5">
                            {followup.owner_acknowledged_at ? (
                                <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-bold">
                                    <Check className="w-3.5 h-3.5" /> Acknowledged on {new Date(followup.owner_acknowledged_at).toLocaleDateString()}
                                </span>
                            ) : (
                                <span className="text-amber-700 dark:text-amber-300 font-bold">
                                    Pending your confirmation
                                </span>
                            )}
                        </p>
                    </div>

                    {!followup.owner_acknowledged_at && (
                        <button
                            type="button"
                            onClick={handleAcknowledge}
                            disabled={actionLoading}
                            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider shadow-sm transition-all cursor-pointer inline-flex items-center gap-1.5 self-start sm:self-auto"
                        >
                            <Check className="w-3.5 h-3.5" /> Acknowledge Notice
                        </button>
                    )}
                </div>
            )}

            {/* Owner observation updates (saved history + submit) */}
            <div className="p-3 rounded-xl bg-white/90 dark:bg-gray-800/80 border border-orange-100 dark:border-orange-900/40 text-xs space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <span className="text-[9.5px] font-black uppercase tracking-wider text-gray-400">
                        Your Observation Updates ({followup.owner_updates?.length || 0})
                    </span>
                    <Link to="/resident/observations" className="text-[10px] font-black uppercase tracking-wider text-[#F97316] hover:underline">
                        Open Observation Updates →
                    </Link>
                </div>
                <OwnerUpdateHistory updates={followup.owner_updates || []} />
                {isObserving && (
                    <button
                        type="button"
                        onClick={() => { setSuccessMessage(null); setShowUpdateModal(true); }}
                        className="px-4 py-2 rounded-xl bg-[#F97316] hover:bg-[#EA580C] text-white font-black text-xs uppercase tracking-wider shadow-sm transition-all cursor-pointer inline-flex items-center gap-1.5"
                    >
                        <Camera className="w-3.5 h-3.5" /> Submit Observation Update
                    </button>
                )}
            </div>

            {showUpdateModal && (
                <OwnerObservationUpdateModal
                    followupId={followup.followup_id}
                    reportId={followup.report_id}
                    animalName={followup.pet_name || 'Your Pet'}
                    onClose={() => setShowUpdateModal(false)}
                    onSaved={handleUpdateSaved}
                />
            )}

            {/* Concluded Outcome */}
            {!isObserving && (
                <div className="p-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs space-y-1">
                    <span className="text-[9.5px] font-black uppercase tracking-wider text-gray-400">Final Outcome:</span>
                    <p className="font-bold text-gray-900 dark:text-white">
                        Observation marked as <span className="uppercase">{followup.status}</span> on {followup.closed_at ? new Date(followup.closed_at).toLocaleDateString() : 'N/A'}.
                    </p>
                    {followup.close_reason && (
                        <p className="text-gray-600 dark:text-gray-300 font-medium">{followup.close_reason}</p>
                    )}
                </div>
            )}
        </div>
    );
};

export default OwnerFollowUpOwnerPanel;
