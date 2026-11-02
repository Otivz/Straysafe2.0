import React, { useState, useEffect } from 'react';
import {
    Clock, AlertTriangle, Phone, CheckCircle2, ShieldAlert,
    PlusCircle, FileText, X, Check, RefreshCw, AlertCircle, Image as ImageIcon
} from 'lucide-react';
import type {
    OwnerFollowUp
} from '../utils/ownerFollowUp';
import {
    getFollowUpByReport,
    startFollowUp,
    extendFollowUp,
    closeFollowUp,
    acknowledgeFollowUp,
    addContactLog,
    formatObservationRemaining
} from '../utils/ownerFollowUp';

interface OwnerFollowUpCardProps {
    reportId: number;
    subdivisionId?: number | null;
    assignedLeaderId?: number | null;
    currentUserId?: number | null;
    petId?: number | null;
    petName?: string | null;
    isPossibleOwned?: boolean;
    initialOwnerName?: string | null;
    initialOwnerPhone?: string | null;
    initialOwnerAddress?: string | null;
    reportStatusId?: number;
    isRabiesSuspected?: boolean;
    onFollowUpChanged?: () => void;
}

export const OwnerFollowUpCard: React.FC<OwnerFollowUpCardProps> = ({
    reportId,
    subdivisionId: _subdivisionId,
    assignedLeaderId,
    currentUserId,
    petId,
    petName,
    isPossibleOwned,
    initialOwnerName,
    initialOwnerPhone,
    initialOwnerAddress,
    reportStatusId,
    isRabiesSuspected,
    onFollowUpChanged
}) => {
    const [followup, setFollowup] = useState<OwnerFollowUp | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [actionLoading, setActionLoading] = useState<boolean>(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // Modal States
    const [showStartModal, setShowStartModal] = useState<boolean>(false);
    const [showExtendModal, setShowExtendModal] = useState<boolean>(false);
    const [showCloseModal, setShowCloseModal] = useState<boolean>(false);
    const [showContactModal, setShowContactModal] = useState<boolean>(false);
    const [showVerbalAckModal, setShowVerbalAckModal] = useState<boolean>(false);

    // Start Form
    const [startDuration, setStartDuration] = useState<number>(3);
    const [startNotes, setStartNotes] = useState<string>('');
    const [ownerNameInput, setOwnerNameInput] = useState<string>(initialOwnerName || '');
    const [ownerPhoneInput, setOwnerPhoneInput] = useState<string>(initialOwnerPhone || '');
    const [ownerAddressInput, setOwnerAddressInput] = useState<string>(initialOwnerAddress || '');

    // Extend Form
    const [extendReason, setExtendReason] = useState<string>('');
    const [extendDays, setExtendDays] = useState<number>(3);

    // Close Form
    const [closeOutcome, setCloseOutcome] = useState<'complied' | 'closed' | 'escalated'>('complied');
    const [closeReason, setCloseReason] = useState<string>('');
    const [complianceNotes, setComplianceNotes] = useState<string>('');

    // Contact Log Form
    const [contactType, setContactType] = useState<string>('Phone Call');
    const [contactNotes, setContactNotes] = useState<string>('');

    // Verbal Ack Form
    const [verbalAckNotes, setVerbalAckNotes] = useState<string>('');

    const isAssignedLeader = assignedLeaderId === currentUserId;
    const isClosedReport = [3, 9, 10, 11, 12, 14, 17, 18].includes(reportStatusId || 0);

    const loadFollowUp = async () => {
        setLoading(true);
        setErrorMessage(null);
        try {
            const data = await getFollowUpByReport(reportId);
            setFollowup(data);
        } catch (err: any) {
            console.error('Failed to load follow-up:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadFollowUp();
    }, [reportId]);

    const handleStart = async (e: React.FormEvent) => {
        e.preventDefault();
        setActionLoading(true);
        setErrorMessage(null);
        try {
            const res = await startFollowUp({
                report_id: reportId,
                pet_id: petId || undefined,
                owner_name: ownerNameInput || undefined,
                owner_phone: ownerPhoneInput || undefined,
                owner_address: ownerAddressInput || undefined,
                duration_days: startDuration,
                notes: startNotes || undefined
            });
            setFollowup(res);
            setShowStartModal(false);
            setSuccessMessage('Owner observation initiated successfully.');
            if (onFollowUpChanged) onFollowUpChanged();
        } catch (err: any) {
            setErrorMessage(err?.response?.data?.detail || 'Failed to start observation.');
        } finally {
            setActionLoading(false);
        }
    };

    const handleExtend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!followup) return;
        setActionLoading(true);
        setErrorMessage(null);
        try {
            const res = await extendFollowUp(followup.followup_id, extendReason, extendDays);
            setFollowup(res);
            setShowExtendModal(false);
            setSuccessMessage('Observation period extended by ' + extendDays + ' days.');
            if (onFollowUpChanged) onFollowUpChanged();
        } catch (err: any) {
            setErrorMessage(err?.response?.data?.detail || 'Failed to extend observation.');
        } finally {
            setActionLoading(false);
        }
    };

    const handleClose = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!followup) return;
        setActionLoading(true);
        setErrorMessage(null);
        try {
            const res = await closeFollowUp(followup.followup_id, closeOutcome, closeReason, complianceNotes);
            setFollowup(res);
            setShowCloseModal(false);
            setSuccessMessage(`Follow-up marked as ${closeOutcome}.`);
            if (onFollowUpChanged) onFollowUpChanged();
        } catch (err: any) {
            setErrorMessage(err?.response?.data?.detail || 'Failed to close follow-up.');
        } finally {
            setActionLoading(false);
        }
    };

    const handleAddContactLog = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!followup) return;
        setActionLoading(true);
        setErrorMessage(null);
        try {
            const newLog = await addContactLog(followup.followup_id, contactType, contactNotes);
            setFollowup(prev => prev ? { ...prev, contact_logs: [newLog, ...(prev.contact_logs || [])] } : null);
            setShowContactModal(false);
            setContactNotes('');
            setSuccessMessage('Contact log entry recorded.');
        } catch (err: any) {
            setErrorMessage(err?.response?.data?.detail || 'Failed to add contact log.');
        } finally {
            setActionLoading(false);
        }
    };

    const handleVerbalAck = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!followup) return;
        setActionLoading(true);
        setErrorMessage(null);
        try {
            const res = await acknowledgeFollowUp(followup.followup_id, 'verbal', verbalAckNotes);
            setFollowup(res);
            setShowVerbalAckModal(false);
            setSuccessMessage('Verbal acknowledgement recorded.');
        } catch (err: any) {
            setErrorMessage(err?.response?.data?.detail || 'Failed to record acknowledgement.');
        } finally {
            setActionLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="w-full p-4 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/60 flex items-center justify-center gap-2 text-xs text-gray-500 animate-pulse">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-orange-500" />
                <span>Checking observation history...</span>
            </div>
        );
    }

    // 1. NO FOLLOW-UP ACTIVE OR RECORDED YET
    if (!followup) {
        if (!isAssignedLeader || isClosedReport) {
            return null; // Not applicable or leader cannot start
        }

        return (
            <div className="w-full p-4 rounded-2xl border-2 border-orange-200/80 dark:border-orange-900/40 bg-gradient-to-br from-orange-50/90 via-amber-50/50 to-white dark:from-orange-950/20 dark:via-gray-900 dark:to-gray-900 shadow-sm space-y-3">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-orange-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                            <Clock className="w-4 h-4" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h4 className="text-xs font-black uppercase tracking-wider text-gray-900 dark:text-white">
                                    Owner Follow-up Observation
                                </h4>
                                <span className="px-2 py-0.5 rounded-full text-[8.5px] font-black uppercase tracking-wider bg-orange-100 text-orange-700 dark:bg-orange-900/60 dark:text-orange-300">
                                    Eligible
                                </span>
                            </div>
                            <p className="text-[11px] text-gray-600 dark:text-gray-400 font-medium mt-0.5">
                                Place owned pet on community observation (3 days) before impoundment or penalty.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowStartModal(true)}
                        className="px-3.5 py-1.5 rounded-xl bg-[#F97316] hover:bg-[#EA580C] text-white text-[10.5px] font-black uppercase tracking-wider shadow-sm transition-all cursor-pointer inline-flex items-center gap-1.5 shrink-0"
                    >
                        <Clock className="w-3.5 h-3.5" /> Start Observation
                    </button>
                </div>

                {isRabiesSuspected && (
                    <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-[10px] flex items-center gap-2 font-bold">
                        <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                        <span>Warning: Potential rabies risk detected. Observation should be refused in favor of immediate Barangay escalation.</span>
                    </div>
                )}

                {/* START MODAL */}
                {showStartModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
                        <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 max-w-md w-full shadow-2xl border border-gray-200 dark:border-gray-800 space-y-4 animate-in fade-in zoom-in-95">
                            <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-gray-800">
                                <h3 className="text-sm font-black uppercase tracking-wider text-gray-900 dark:text-white flex items-center gap-2">
                                    <Clock className="w-4 h-4 text-orange-500" />
                                    Initiate Observation Period
                                </h3>
                                <button type="button" onClick={() => setShowStartModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            {errorMessage && (
                                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-start gap-2">
                                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                    <span>{errorMessage}</span>
                                </div>
                            )}

                            <form onSubmit={handleStart} className="space-y-3.5 text-xs">
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
                                        Pet Name or Reference
                                    </label>
                                    <input
                                        type="text"
                                        disabled
                                        value={petName || (petId ? `Pet #${petId}` : 'Identified Owned Animal')}
                                        className="w-full px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold border border-gray-200 dark:border-gray-700 cursor-not-allowed"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-2.5">
                                    <div>
                                        <label className="block text-[10px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
                                            Owner Name
                                        </label>
                                        <input
                                            type="text"
                                            value={ownerNameInput}
                                            onChange={(e) => setOwnerNameInput(e.target.value)}
                                            placeholder="Resident owner name"
                                            className="w-full px-3 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 font-bold text-gray-900 dark:text-white focus:outline-orange-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
                                            Owner Phone
                                        </label>
                                        <input
                                            type="tel"
                                            value={ownerPhoneInput}
                                            onChange={(e) => setOwnerPhoneInput(e.target.value)}
                                            placeholder="0917XXXXXXX"
                                            className="w-full px-3 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 font-bold text-gray-900 dark:text-white focus:outline-orange-500"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
                                        Owner Address / Residence
                                    </label>
                                    <input
                                        type="text"
                                        value={ownerAddressInput}
                                        onChange={(e) => setOwnerAddressInput(e.target.value)}
                                        placeholder="Street / Block & Lot in subdivision"
                                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 font-bold text-gray-900 dark:text-white focus:outline-orange-500"
                                    />
                                </div>

                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
                                        Observation Duration (Days)
                                    </label>
                                    <input
                                        type="number"
                                        min={1}
                                        max={30}
                                        value={startDuration}
                                        onChange={(e) => setStartDuration(Number(e.target.value))}
                                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 font-bold text-gray-900 dark:text-white focus:outline-orange-500"
                                    />
                                    <p className="text-[9.5px] text-gray-400 mt-1 font-medium">Standard community policy is 3 calendar days.</p>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
                                        Observation Instructions / Notes
                                    </label>
                                    <textarea
                                        rows={2}
                                        value={startNotes}
                                        onChange={(e) => setStartNotes(e.target.value)}
                                        placeholder="E.g., Pet must be leashed within residential premises. Provide photo update."
                                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 font-medium text-gray-900 dark:text-white focus:outline-orange-500"
                                    />
                                </div>

                                <div className="flex items-center justify-end gap-2 pt-2">
                                    <button
                                        type="button"
                                        onClick={() => setShowStartModal(false)}
                                        className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold text-xs cursor-pointer"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={actionLoading}
                                        className="px-4 py-2 rounded-xl bg-[#F97316] hover:bg-[#EA580C] text-white font-black text-xs uppercase tracking-wider shadow-sm transition-all disabled:opacity-50 cursor-pointer"
                                    >
                                        {actionLoading ? 'Starting...' : 'Confirm & Start Observation'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // 2. ACTIVE OR ENDED OBSERVATION RECORD EXISTS
    const isObserving = followup.status === 'observing';
    const timeRemaining = formatObservationRemaining(followup.due_at);

    return (
        <div className="w-full p-4 sm:p-5 rounded-2xl border-2 border-orange-200 dark:border-orange-950 bg-white dark:bg-gray-900 shadow-sm space-y-4">
            {/* Header & Status */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${isObserving ? (timeRemaining.isOverdue ? 'bg-rose-600 text-white' : 'bg-orange-500 text-white') : 'bg-emerald-600 text-white'}`}>
                        {isObserving ? <Clock className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h4 className="text-xs font-black uppercase tracking-wider text-gray-900 dark:text-white">
                                Community Owner Observation
                            </h4>
                            {isPossibleOwned && (
                                <span className="px-2 py-0.5 rounded-full text-[8.5px] font-black uppercase tracking-wider bg-orange-100 text-orange-800 border border-orange-200 dark:bg-orange-950/60 dark:text-orange-200">
                                    Identified Pet
                                </span>
                            )}
                            <span className={`px-2 py-0.5 rounded-full text-[8.5px] font-black uppercase tracking-wider border ${
                                followup.status === 'observing'
                                    ? (timeRemaining.isOverdue ? 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300' : 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/60 dark:text-orange-300')
                                    : (followup.status === 'complied' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300')
                            }`}>
                                {followup.status === 'observing' ? (timeRemaining.isOverdue ? 'Overdue Observation' : 'Active Observation') : followup.status.toUpperCase()}
                            </span>
                        </div>
                        <p className="text-[10px] text-gray-500 font-medium">
                            Follow-Up #{followup.followup_id} • Started by {followup.leader_name || 'Subdivision Leader'}
                        </p>
                    </div>
                </div>

                {isObserving && (
                    <div className="text-right">
                        <span className={`text-xs font-black uppercase tracking-wider ${timeRemaining.isOverdue ? 'text-rose-600 dark:text-rose-400' : 'text-orange-600 dark:text-orange-400'}`}>
                            {timeRemaining.text}
                        </span>
                        <p className="text-[9.5px] text-gray-400">Due: {new Date(followup.due_at).toLocaleDateString()} {new Date(followup.due_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                )}
            </div>

            {successMessage && (
                <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-bold flex items-center justify-between">
                    <span>{successMessage}</span>
                    <button type="button" onClick={() => setSuccessMessage(null)} className="text-emerald-600 hover:text-emerald-800 cursor-pointer">
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}

            {/* Staff Caution Signal if any */}
            {followup.staff_caution && (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 text-amber-900 dark:text-amber-200 text-xs font-bold flex items-start gap-2.5">
                    <ShieldAlert className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                    <div>
                        <p className="font-black uppercase tracking-wider text-[10px] text-amber-800 dark:text-amber-300">Staff Caution Required</p>
                        <p className="text-[11px] font-medium leading-relaxed mt-0.5">{followup.staff_caution}</p>
                    </div>
                </div>
            )}

            {/* Progress Bar (when observing) */}
            {isObserving && (
                <div className="space-y-1">
                    <div className="w-full h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                        <div
                            className={`h-full transition-all duration-500 ${timeRemaining.isOverdue ? 'bg-rose-500' : 'bg-[#F97316]'}`}
                            style={{ width: `${timeRemaining.percentLeft}%` }}
                        />
                    </div>
                    {followup.is_extended && (
                        <p className="text-[9.5px] text-orange-600 dark:text-orange-400 font-bold flex items-center gap-1">
                            <Clock className="w-3 h-3" /> Extended (+{followup.extension_days || 3}d): {followup.extension_reason}
                        </p>
                    )}
                </div>
            )}

            {/* Owner Details & Contact Card */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200/80 dark:border-gray-800">
                <div className="space-y-1">
                    <span className="text-[9px] font-black uppercase tracking-wider text-gray-400">Pet & Owner Details</span>
                    <p className="text-xs font-black text-gray-900 dark:text-white">
                        {followup.pet_name || 'Identified Owned Animal'}
                    </p>
                    <p className="text-[11px] font-bold text-gray-700 dark:text-gray-300">
                        Owner: {followup.owner_name || 'Offline Resident'}
                    </p>
                    {followup.owner_address && (
                        <p className="text-[10px] text-gray-500">{followup.owner_address}</p>
                    )}
                </div>

                <div className="flex flex-col justify-between space-y-2">
                    <div>
                        <span className="text-[9px] font-black uppercase tracking-wider text-gray-400">Contact & Acknowledgement</span>
                        <p className="text-xs font-black text-gray-900 dark:text-white">
                            {followup.owner_phone ? followup.owner_phone : 'No Phone Recorded'}
                        </p>
                        <p className="text-[10px] text-gray-500 font-medium">
                            {followup.owner_acknowledged_at
                                ? `Acknowledged (${followup.owner_acknowledgement_method || 'account'}) on ${new Date(followup.owner_acknowledged_at).toLocaleDateString()}`
                                : 'Awaiting owner acknowledgement'}
                        </p>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                        {followup.owner_phone && (
                            <a
                                href={`tel:${followup.owner_phone}`}
                                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1 transition-all"
                            >
                                <Phone className="w-3 h-3" /> Call Owner
                            </a>
                        )}
                        {!followup.owner_acknowledged_at && isObserving && isAssignedLeader && (
                            <button
                                type="button"
                                onClick={() => setShowVerbalAckModal(true)}
                                className="px-3 py-1.5 rounded-lg bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1 cursor-pointer transition-all"
                            >
                                <Check className="w-3 h-3" /> Log Verbal Ack
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Owner Updates / Proof Photo if submitted */}
            {(followup.owner_notes || followup.owner_photo_url) && (
                <div className="p-3 rounded-xl bg-orange-50/70 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900/50 space-y-2">
                    <span className="text-[9.5px] font-black uppercase tracking-wider text-orange-800 dark:text-orange-300 flex items-center gap-1.5">
                        <ImageIcon className="w-3 h-3" /> Owner Progress & Proof
                    </span>
                    {followup.owner_notes && (
                        <p className="text-xs text-gray-800 dark:text-gray-200 font-medium">
                            "{followup.owner_notes}"
                        </p>
                    )}
                    {followup.owner_photo_url && (
                        <a href={followup.owner_photo_url} target="_blank" rel="noopener noreferrer" className="inline-block group">
                            <img
                                src={followup.owner_photo_url}
                                alt="Owner compliance proof"
                                className="w-24 h-24 rounded-lg object-cover border border-orange-300 dark:border-orange-800 group-hover:opacity-90 transition-opacity"
                            />
                            <span className="text-[9px] text-orange-600 font-bold block mt-0.5">Click to view full photo</span>
                        </a>
                    )}
                </div>
            )}

            {/* Ended Status Summary */}
            {!isObserving && (
                <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 space-y-1">
                    <div className="flex items-center justify-between text-xs font-black uppercase tracking-wider">
                        <span className="text-gray-900 dark:text-white">Observation Concluded: {followup.status}</span>
                        <span className="text-gray-400 font-medium">{followup.closed_at ? new Date(followup.closed_at).toLocaleDateString() : ''}</span>
                    </div>
                    {followup.close_reason && (
                        <p className="text-[11px] text-gray-600 dark:text-gray-300 font-medium">Reason: {followup.close_reason}</p>
                    )}
                    {followup.compliance_notes && (
                        <p className="text-[11px] text-gray-600 dark:text-gray-300 font-medium">Notes: {followup.compliance_notes}</p>
                    )}
                </div>
            )}

            {/* Contact Logs Section */}
            <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                    <h5 className="text-[10px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5" /> Contact Log History ({followup.contact_logs?.length || 0})
                    </h5>
                    {isObserving && isAssignedLeader && (
                        <button
                            type="button"
                            onClick={() => setShowContactModal(true)}
                            className="text-[10px] font-black uppercase tracking-wider text-orange-600 hover:text-orange-700 dark:text-orange-400 inline-flex items-center gap-1 cursor-pointer"
                        >
                            <PlusCircle className="w-3 h-3" /> Add Entry
                        </button>
                    )}
                </div>

                {followup.contact_logs && followup.contact_logs.length > 0 ? (
                    <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                        {followup.contact_logs.map(log => (
                            <div key={log.contact_log_id} className="p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800/80 border border-gray-100 dark:border-gray-800 flex items-start justify-between text-[11px] gap-2">
                                <div className="space-y-0.5">
                                    <div className="flex items-center gap-1.5 font-bold text-gray-900 dark:text-white">
                                        <span className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-[9px]">{log.contact_type}</span>
                                        <span>{log.logger_name || 'Leader'}</span>
                                    </div>
                                    <p className="text-gray-600 dark:text-gray-300 font-medium">{log.notes}</p>
                                </div>
                                <span className="text-[9px] text-gray-400 shrink-0">
                                    {new Date(log.contact_date).toLocaleDateString()}
                                </span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-[10px] text-gray-400 italic">No contact entries logged yet.</p>
                )}
            </div>

            {/* Operational Action Buttons (for assigned leader while observing) */}
            {isObserving && isAssignedLeader && (
                <div className="pt-2 flex flex-wrap items-center gap-2 border-t border-gray-100 dark:border-gray-800">
                    <button
                        type="button"
                        onClick={() => { setCloseOutcome('complied'); setShowCloseModal(true); }}
                        className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[10.5px] font-black uppercase tracking-wider shadow-sm transition-all cursor-pointer inline-flex items-center gap-1"
                    >
                        <Check className="w-3.5 h-3.5" /> Owner Complied
                    </button>

                    <button
                        type="button"
                        disabled={followup.is_extended}
                        onClick={() => setShowExtendModal(true)}
                        className={`px-3 py-1.5 rounded-xl text-[10.5px] font-black uppercase tracking-wider shadow-sm transition-all cursor-pointer inline-flex items-center gap-1 ${
                            followup.is_extended
                                ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
                                : 'bg-amber-600 hover:bg-amber-700 text-white'
                        }`}
                        title={followup.is_extended ? 'Only one extension allowed' : 'Extend observation deadline'}
                    >
                        <Clock className="w-3.5 h-3.5" /> {followup.is_extended ? 'Extended' : 'Extend (+3d)'}
                    </button>

                    <button
                        type="button"
                        onClick={() => { setCloseOutcome('closed'); setShowCloseModal(true); }}
                        className="px-3 py-1.5 rounded-xl bg-gray-600 hover:bg-gray-700 text-white text-[10.5px] font-black uppercase tracking-wider shadow-sm transition-all cursor-pointer inline-flex items-center gap-1"
                    >
                        <X className="w-3.5 h-3.5" /> Close Observation
                    </button>
                </div>
            )}

            {/* MODALS */}
            {/* EXTEND MODAL */}
            {showExtendModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
                    <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-gray-200 dark:border-gray-800 space-y-4">
                        <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-gray-800">
                            <h3 className="text-sm font-black uppercase tracking-wider text-gray-900 dark:text-white flex items-center gap-2">
                                <Clock className="w-4 h-4 text-amber-500" />
                                Extend Observation (Single Allowance)
                            </h3>
                            <button type="button" onClick={() => setShowExtendModal(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {errorMessage && (
                            <p className="text-xs text-rose-600 font-bold">{errorMessage}</p>
                        )}

                        <form onSubmit={handleExtend} className="space-y-3 text-xs">
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-wider text-gray-500 mb-1">
                                    Extension Reason (Required)
                                </label>
                                <textarea
                                    required
                                    rows={3}
                                    value={extendReason}
                                    onChange={(e) => setExtendReason(e.target.value)}
                                    placeholder="Explain why the owner requires additional observation days..."
                                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 font-medium text-gray-900 dark:text-white focus:outline-orange-500"
                                />
                            </div>

                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-wider text-gray-500 mb-1">
                                    Extension Days (1 - 7)
                                </label>
                                <input
                                    type="number"
                                    min={1}
                                    max={7}
                                    value={extendDays}
                                    onChange={(e) => setExtendDays(Number(e.target.value))}
                                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 font-bold text-gray-900 dark:text-white focus:outline-orange-500"
                                />
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-2">
                                <button type="button" onClick={() => setShowExtendModal(false)} className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 font-bold text-xs cursor-pointer">
                                    Cancel
                                </button>
                                <button type="submit" disabled={actionLoading} className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-black text-xs uppercase tracking-wider cursor-pointer">
                                    {actionLoading ? 'Extending...' : 'Grant Extension'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* CLOSE MODAL */}
            {showCloseModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
                    <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-gray-200 dark:border-gray-800 space-y-4">
                        <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-gray-800">
                            <h3 className="text-sm font-black uppercase tracking-wider text-gray-900 dark:text-white">
                                {closeOutcome === 'complied' ? 'Confirm Owner Compliance' : 'Conclude Observation'}
                            </h3>
                            <button type="button" onClick={() => setShowCloseModal(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {errorMessage && (
                            <p className="text-xs text-rose-600 font-bold">{errorMessage}</p>
                        )}

                        <form onSubmit={handleClose} className="space-y-3 text-xs">
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-wider text-gray-500 mb-1">
                                    Outcome Reason (Required)
                                </label>
                                <textarea
                                    required
                                    rows={2}
                                    value={closeReason}
                                    onChange={(e) => setCloseReason(e.target.value)}
                                    placeholder={closeOutcome === 'complied' ? 'Owner leashed and secured pet safely...' : 'State closing justification...'}
                                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 font-medium text-gray-900 dark:text-white focus:outline-orange-500"
                                />
                            </div>

                            {closeOutcome === 'complied' && (
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-wider text-gray-500 mb-1">
                                        Compliance Notes (Optional)
                                    </label>
                                    <input
                                        type="text"
                                        value={complianceNotes}
                                        onChange={(e) => setComplianceNotes(e.target.value)}
                                        placeholder="E.g., Gate latch installed"
                                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 font-medium text-gray-900 dark:text-white focus:outline-orange-500"
                                    />
                                </div>
                            )}

                            <div className="flex items-center justify-end gap-2 pt-2">
                                <button type="button" onClick={() => setShowCloseModal(false)} className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 font-bold text-xs cursor-pointer">
                                    Cancel
                                </button>
                                <button type="submit" disabled={actionLoading} className={`px-4 py-1.5 rounded-lg font-black text-xs uppercase tracking-wider text-white cursor-pointer ${closeOutcome === 'complied' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-gray-700 hover:bg-gray-800'}`}>
                                    {actionLoading ? 'Saving...' : 'Confirm'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ADD CONTACT LOG MODAL */}
            {showContactModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
                    <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-gray-200 dark:border-gray-800 space-y-4">
                        <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-gray-800">
                            <h3 className="text-sm font-black uppercase tracking-wider text-gray-900 dark:text-white">
                                Record Contact Entry
                            </h3>
                            <button type="button" onClick={() => setShowContactModal(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <form onSubmit={handleAddContactLog} className="space-y-3 text-xs">
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-wider text-gray-500 mb-1">
                                    Contact Type
                                </label>
                                <select
                                    value={contactType}
                                    onChange={(e) => setContactType(e.target.value)}
                                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 font-bold text-gray-900 dark:text-white focus:outline-orange-500"
                                >
                                    <option value="Phone Call">Phone Call</option>
                                    <option value="In-Person Visit">In-Person Visit</option>
                                    <option value="SMS">SMS Message</option>
                                    <option value="Verbal Warning">Verbal Warning</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-wider text-gray-500 mb-1">
                                    Notes (Required)
                                </label>
                                <textarea
                                    required
                                    rows={3}
                                    value={contactNotes}
                                    onChange={(e) => setContactNotes(e.target.value)}
                                    placeholder="Details of call or visit..."
                                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 font-medium text-gray-900 dark:text-white focus:outline-orange-500"
                                />
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-2">
                                <button type="button" onClick={() => setShowContactModal(false)} className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 font-bold text-xs cursor-pointer">
                                    Cancel
                                </button>
                                <button type="submit" disabled={actionLoading} className="px-4 py-1.5 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-white font-black text-xs uppercase tracking-wider cursor-pointer">
                                    {actionLoading ? 'Saving...' : 'Add Log'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* VERBAL ACK MODAL */}
            {showVerbalAckModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
                    <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-gray-200 dark:border-gray-800 space-y-4">
                        <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-gray-800">
                            <h3 className="text-sm font-black uppercase tracking-wider text-gray-900 dark:text-white">
                                Log Verbal Acknowledgement
                            </h3>
                            <button type="button" onClick={() => setShowVerbalAckModal(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <form onSubmit={handleVerbalAck} className="space-y-3 text-xs">
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-wider text-gray-500 mb-1">
                                    Acknowledgement Notes
                                </label>
                                <textarea
                                    rows={2}
                                    value={verbalAckNotes}
                                    onChange={(e) => setVerbalAckNotes(e.target.value)}
                                    placeholder="E.g., Owner confirmed understanding by phone."
                                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 font-medium text-gray-900 dark:text-white focus:outline-orange-500"
                                />
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-2">
                                <button type="button" onClick={() => setShowVerbalAckModal(false)} className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 font-bold text-xs cursor-pointer">
                                    Cancel
                                </button>
                                <button type="submit" disabled={actionLoading} className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider cursor-pointer">
                                    {actionLoading ? 'Recording...' : 'Record Verbal Ack'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default OwnerFollowUpCard;
