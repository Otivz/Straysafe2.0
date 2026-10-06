import React, { useState } from 'react';
import { api } from '../../utils/api';
import { getPetPicture } from '../../utils/avatar';

import {
    PawPrint,
    CheckCircle2,
    XCircle,
    MapPin,
    Calendar,
    Phone,
    User as UserIcon,
    AlertCircle,
    ChevronRight,
    Loader2,
    Check,
    X,
    MessageSquare
} from 'lucide-react';

export interface RecoveryScanData {
    scan_id: number;
    qr_id: number;
    pet_id: number;
    pet_name?: string | null;
    pet_photo?: string | null;
    finder_name?: string | null;
    finder_contact?: string | null;
    scan_lat?: number | null;
    scan_lng?: number | null;
    street_address?: string | null;
    barangay?: string | null;
    city?: string | null;
    landmark?: string | null;
    location_type?: string;
    notes?: string | null;
    status: string; // PENDING, CONFIRMED, REJECTED
    scanned_at: string;
}

interface PetRecoveryModalProps {
    isOpen: boolean;
    onClose: () => void;
    scanData: RecoveryScanData | null;
    onConfirmed?: (scanId: number) => void;
    onRejected?: (scanId: number) => void;
    onViewHistory?: (petId: number) => void;
}

const PetRecoveryModal: React.FC<PetRecoveryModalProps> = ({
    isOpen,
    onClose,
    scanData,
    onConfirmed,
    onRejected,
    onViewHistory
}) => {
    const [step, setStep] = useState<'details' | 'confirm_dialog' | 'reject_dialog' | 'success'>('details');
    const [ownerNotes, setOwnerNotes] = useState('');
    const [rejectionReason, setRejectionReason] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!isOpen || !scanData) return null;

    const petName = scanData.pet_name || 'Your Pet';
    const locationDesc = scanData.landmark 
        || (scanData.street_address && scanData.barangay ? `${scanData.street_address}, ${scanData.barangay}` : null)
        || scanData.barangay 
        || scanData.city 
        || 'Reported Location';

    const formattedDate = new Date(scanData.scanned_at).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });

    const handleConfirmRecovery = async () => {
        try {
            setLoading(true);
            setError(null);
            await api.post(`/pet-qr/recovery-requests/${scanData.scan_id}/confirm`, {
                notes: ownerNotes.trim() || undefined
            });
            setStep('success');
            if (onConfirmed) {
                onConfirmed(scanData.scan_id);
            }
        } catch (err: any) {
            console.error('Failed to confirm recovery:', err);
            setError(err.response?.data?.detail || 'Failed to confirm pet recovery. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleRejectRecovery = async () => {
        try {
            setLoading(true);
            setError(null);
            await api.post(`/pet-qr/recovery-requests/${scanData.scan_id}/reject`, {
                rejection_reason: rejectionReason.trim() || 'Not confirmed by owner'
            });
            if (onRejected) {
                onRejected(scanData.scan_id);
            }
            onClose();
        } catch (err: any) {
            console.error('Failed to reject recovery:', err);
            setError(err.response?.data?.detail || 'Failed to update recovery request.');
        } finally {
            setLoading(false);
        }
    };

    const handleModalClose = () => {
        setStep('details');
        setOwnerNotes('');
        setRejectionReason('');
        setError(null);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div 
                className="bg-white dark:bg-[#151C2C] border border-gray-100 dark:border-slate-800 rounded-3xl sm:rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden transition-all"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-5 sm:p-6 pb-4 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-role-soft/50 to-amber-50/30 dark:from-role-strong/20 dark:to-transparent">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-role/10 dark:bg-role/20 text-role-hover dark:text-role flex items-center justify-center shadow-xs">
                            <PawPrint className="w-5 h-5" />
                        </div>
                        <div>
                            <span className="text-[9px] sm:text-[10px] font-black uppercase text-role-hover dark:text-role tracking-widest">
                                Smart QR Scan Alert
                            </span>
                            <h2 className="text-base sm:text-lg font-black text-gray-900 dark:text-white uppercase tracking-tight">
                                {step === 'success' ? 'Recovery Confirmed' : 'Pet Recovery Confirmation'}
                            </h2>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={handleModalClose}
                        className="w-8 h-8 rounded-full bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-500 dark:text-gray-400 flex items-center justify-center transition-colors cursor-pointer"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {error && (
                    <div className="mx-5 sm:mx-6 mt-4 p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 rounded-2xl flex items-center gap-2.5 text-rose-700 dark:text-rose-300 text-xs font-bold">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                {/* Step: Details Overview */}
                {step === 'details' && (
                    <div className="p-5 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto">
                        {/* Pet Banner */}
                        <div className="flex items-center gap-3.5 p-3.5 bg-gray-50 dark:bg-slate-800/60 rounded-2xl border border-gray-100 dark:border-slate-800">
                            <img
                                src={getPetPicture(scanData.pet_photo)}
                                alt={petName}
                                className="w-14 h-14 rounded-2xl object-cover border border-role-border dark:border-role-strong/50 shadow-xs shrink-0"
                            />

                            <div className="min-w-0 flex-1">
                                <span className="text-[9px] font-black uppercase text-role-hover dark:text-role tracking-widest">
                                    Registered Pet
                                </span>
                                <h3 className="text-base font-black text-gray-900 dark:text-white truncate">
                                    {petName}
                                </h3>
                                <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 mt-0.5">
                                    Someone scanned {petName}'s secure QR tag
                                </p>
                            </div>
                        </div>

                        {/* Scan Information Card */}
                        <div className="p-4 bg-white dark:bg-slate-900/70 border border-gray-100 dark:border-slate-800 rounded-2xl space-y-3 shadow-xs">
                            <div className="flex items-start gap-3">
                                <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 mt-0.5">
                                    <MapPin className="w-4 h-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <span className="text-[9px] font-black uppercase text-gray-400 tracking-wider">
                                        Scan Location
                                    </span>
                                    <p className="text-xs sm:text-sm font-black text-gray-900 dark:text-white leading-snug">
                                        {locationDesc}
                                    </p>
                                    {scanData.city && (
                                        <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 mt-0.5">
                                            {scanData.city}
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div className="flex items-start gap-3">
                                <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                                    <Calendar className="w-4 h-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <span className="text-[9px] font-black uppercase text-gray-400 tracking-wider">
                                        Date & Time
                                    </span>
                                    <p className="text-xs sm:text-sm font-black text-gray-900 dark:text-white">
                                        {formattedDate}
                                    </p>
                                </div>
                            </div>

                            {/* Finder Information */}
                            <div className="flex items-start gap-3 pt-2 border-t border-gray-100 dark:border-slate-800">
                                <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                                    <UserIcon className="w-4 h-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <span className="text-[9px] font-black uppercase text-gray-400 tracking-wider">
                                        Finder / Scanner
                                    </span>
                                    <p className="text-xs sm:text-sm font-black text-gray-900 dark:text-white">
                                        {scanData.finder_name || 'Anonymous Community Member'}
                                    </p>
                                    {scanData.finder_contact && (
                                        <div className="mt-1.5 flex items-center gap-2">
                                            <a
                                                href={`tel:${scanData.finder_contact}`}
                                                className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-xl text-[11px] font-black transition-colors"
                                            >
                                                <Phone className="w-3 h-3" />
                                                <span>{scanData.finder_contact}</span>
                                            </a>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {scanData.notes && (
                                <div className="flex items-start gap-3 pt-2 border-t border-gray-100 dark:border-slate-800">
                                    <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 flex items-center justify-center shrink-0 mt-0.5">
                                        <MessageSquare className="w-4 h-4" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <span className="text-[9px] font-black uppercase text-gray-400 tracking-wider">
                                            Finder Notes
                                        </span>
                                        <p className="text-xs font-semibold text-gray-700 dark:text-slate-300 mt-0.5">
                                            "{scanData.notes}"
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Confirmation Prompt */}
                        <div className="p-4 bg-role/5 dark:bg-role-strong/20 border border-role/20 rounded-2xl text-center">
                            <p className="text-xs sm:text-sm font-black text-gray-900 dark:text-white">
                                Has {petName} been retrieved by you?
                            </p>
                            <p className="text-[10.5px] font-bold text-gray-500 dark:text-gray-400 mt-1">
                                Confirming recovery will update {petName}'s status to <span className="text-emerald-600 dark:text-emerald-400 uppercase font-black">Recovered</span> and add a permanent timeline event in pet history.
                            </p>
                        </div>

                        {/* Actions */}
                        <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
                            <button
                                type="button"
                                onClick={() => setStep('confirm_dialog')}
                                className="flex-1 py-3 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-2xl text-xs font-black uppercase tracking-wider shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
                            >
                                <CheckCircle2 className="w-4 h-4" />
                                <span>Confirm Pet Recovered</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setStep('reject_dialog')}
                                className="py-3 px-4 bg-gray-100 dark:bg-slate-800 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 text-gray-700 dark:text-slate-300 rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                                <XCircle className="w-4 h-4" />
                                <span>Reject / Not My Pet</span>
                            </button>
                        </div>
                    </div>
                )}

                {/* Step: Confirm Dialog (Two-step verification) */}
                {step === 'confirm_dialog' && (
                    <div className="p-5 sm:p-6 space-y-4">
                        <div className="text-center space-y-2">
                            <div className="w-14 h-14 rounded-3xl bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto shadow-sm">
                                <PawPrint className="w-7 h-7" />
                            </div>
                            <h3 className="text-lg font-black text-gray-900 dark:text-white uppercase tracking-tight">
                                Confirm Recovery
                            </h3>
                            <p className="text-xs font-bold text-gray-600 dark:text-gray-300 max-w-sm mx-auto">
                                Are you sure you have received and safely retrieved <strong className="text-gray-900 dark:text-white">{petName}</strong>?
                            </p>
                        </div>

                        <div>
                            <label className="block text-[10px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
                                Optional Recovery Notes / Details
                            </label>
                            <textarea
                                value={ownerNotes}
                                onChange={(e) => setOwnerNotes(e.target.value)}
                                placeholder="e.g., Retrieved safely from finder at San Vicente gate."
                                rows={2}
                                className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none font-medium"
                            />
                        </div>

                        <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
                            <button
                                type="button"
                                disabled={loading}
                                onClick={handleConfirmRecovery}
                                className="flex-1 py-3 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-2xl text-xs font-black uppercase tracking-wider shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        <span>Confirming...</span>
                                    </>
                                ) : (
                                    <>
                                        <Check className="w-4 h-4" />
                                        <span>Yes, I Retrieved My Pet</span>
                                    </>
                                )}
                            </button>

                            <button
                                type="button"
                                disabled={loading}
                                onClick={() => setStep('details')}
                                className="py-3 px-4 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 text-gray-700 dark:text-slate-300 rounded-2xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
                            >
                                Back
                            </button>
                        </div>
                    </div>
                )}

                {/* Step: Reject Dialog */}
                {step === 'reject_dialog' && (
                    <div className="p-5 sm:p-6 space-y-4">
                        <div className="text-center space-y-2">
                            <div className="w-14 h-14 rounded-3xl bg-rose-500/10 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto shadow-sm">
                                <XCircle className="w-7 h-7" />
                            </div>
                            <h3 className="text-lg font-black text-gray-900 dark:text-white uppercase tracking-tight">
                                Reject Recovery Request
                            </h3>
                            <p className="text-xs font-bold text-gray-600 dark:text-gray-300 max-w-sm mx-auto">
                                If this scan was false or does not belong to {petName}, you can reject it. {petName}'s status will remain unchanged.
                            </p>
                        </div>

                        <div>
                            <label className="block text-[10px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
                                Reason for Rejection (Optional)
                            </label>
                            <input
                                type="text"
                                value={rejectionReason}
                                onChange={(e) => setRejectionReason(e.target.value)}
                                placeholder="e.g., False scan, pet is still missing, or wrong animal."
                                className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500 font-medium"
                            />
                        </div>

                        <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
                            <button
                                type="button"
                                disabled={loading}
                                onClick={handleRejectRecovery}
                                className="flex-1 py-3 px-4 bg-rose-600 hover:bg-rose-500 text-white rounded-2xl text-xs font-black uppercase tracking-wider shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        <span>Rejecting...</span>
                                    </>
                                ) : (
                                    <>
                                        <X className="w-4 h-4" />
                                        <span>Confirm Rejection</span>
                                    </>
                                )}
                            </button>

                            <button
                                type="button"
                                disabled={loading}
                                onClick={() => setStep('details')}
                                className="py-3 px-4 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 text-gray-700 dark:text-slate-300 rounded-2xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
                            >
                                Back
                            </button>
                        </div>
                    </div>
                )}

                {/* Step: Success Screen */}
                {step === 'success' && (
                    <div className="p-6 sm:p-8 text-center space-y-4">
                        <div className="w-16 h-16 rounded-3xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto shadow-sm">
                            <CheckCircle2 className="w-8 h-8" />
                        </div>
                        <div className="space-y-1">
                            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                                Verified Event
                            </span>
                            <h3 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tight">
                                ✓ Pet Recovery Confirmed
                            </h3>
                            <p className="text-xs font-bold text-gray-600 dark:text-gray-300 max-w-sm mx-auto leading-relaxed pt-1">
                                <strong className="text-gray-900 dark:text-white">{petName}</strong> has been marked as recovered and the event has been permanently recorded in the pet's history timeline.
                            </p>
                        </div>

                        <div className="pt-3 flex flex-col sm:flex-row gap-2.5">
                            {onViewHistory && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        onClose();
                                        onViewHistory(scanData.pet_id);
                                    }}
                                    className="flex-1 py-3 px-4 bg-role-hover hover:bg-role text-white rounded-2xl text-xs font-black uppercase tracking-wider shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                                >
                                    <span>View Pet History</span>
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={handleModalClose}
                                className="py-3 px-5 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 text-gray-700 dark:text-slate-300 rounded-2xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PetRecoveryModal;
