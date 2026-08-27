import React, { useState } from 'react';
import axios from 'axios';

interface TakeoverReportModalProps {
    isOpen: boolean;
    onClose: () => void;
    reportId: number;
    currentHandlerName?: string;
    currentUserId: number;
    onSuccess: (updatedReport: any) => void;
}

const TAKEOVER_REASONS = [
    'Officer unavailable',
    'Officer reassigned',
    'Emergency response required',
    'Workload redistribution',
    'Other'
];

const TakeoverReportModal: React.FC<TakeoverReportModalProps> = ({
    isOpen,
    onClose,
    reportId,
    currentHandlerName = 'another officer',
    currentUserId,
    onSuccess
}) => {
    const [reason, setReason] = useState<string>('Officer unavailable');
    const [notes, setNotes] = useState<string>('');
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg(null);

        if (reason === 'Other' && !notes.trim()) {
            setErrorMsg('Please specify a brief note when selecting "Other".');
            return;
        }

        try {
            setIsSubmitting(true);
            const response = await axios.post(`http://localhost:8000/reports/${reportId}/take-over`, {
                user_id: currentUserId,
                reason,
                notes: notes.trim() || undefined
            });

            onSuccess(response.data);
            onClose();
        } catch (err: any) {
            console.error('Takeover failed:', err);
            const msg = err.response?.data?.detail || 'Failed to take over report. Please try again.';
            setErrorMsg(msg);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl border border-gray-100 animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-start justify-between gap-4 mb-5">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center text-2xl font-black shrink-0 border border-amber-200/50">
                            🔄
                        </div>
                        <div>
                            <h3 className="text-lg font-black text-gray-900 tracking-tight leading-tight">
                                Take Over Report #{reportId}
                            </h3>
                            <p className="text-xs font-bold text-gray-500 mt-0.5">
                                Reassign primary handling responsibility
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-700 transition-colors text-sm font-black"
                    >
                        ✕
                    </button>
                </div>

                {/* Current Handler Info Card */}
                <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200/80 mb-5">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">
                        Current Case Officer
                    </p>
                    <p className="text-sm font-black text-gray-800 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                        {currentHandlerName}
                    </p>
                    <p className="text-[11px] text-gray-500 font-semibold mt-1">
                        Taking over will transfer primary operational control, messaging, and status updates to your account.
                    </p>
                </div>

                {/* Error Banner */}
                {errorMsg && (
                    <div className="mb-4 p-3.5 bg-red-50 text-red-700 border border-red-200/80 rounded-2xl text-xs font-bold flex items-center gap-2">
                        <span>⚠️</span>
                        <span>{errorMsg}</span>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Reason Selection */}
                    <div>
                        <label className="block text-[11px] font-black text-gray-700 uppercase tracking-wider mb-2">
                            Reason for Takeover <span className="text-red-500">*</span>
                        </label>
                        <div className="space-y-2">
                            {TAKEOVER_REASONS.map((r) => (
                                <label
                                    key={r}
                                    className={`flex items-center gap-3 p-3 rounded-2xl border transition-all cursor-pointer ${
                                        reason === r
                                            ? 'bg-amber-500/10 border-amber-500 text-amber-950 font-black shadow-xs'
                                            : 'bg-white border-gray-200/80 text-gray-700 font-bold hover:bg-gray-50'
                                    }`}
                                >
                                    <input
                                        type="radio"
                                        name="takeover_reason"
                                        value={r}
                                        checked={reason === r}
                                        onChange={() => setReason(r)}
                                        className="w-4 h-4 text-amber-600 focus:ring-amber-500"
                                    />
                                    <span className="text-xs">{r}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Optional / Required Notes */}
                    <div>
                        <label className="block text-[11px] font-black text-gray-700 uppercase tracking-wider mb-1.5">
                            Additional Notes {reason === 'Other' && <span className="text-red-500">*</span>}
                        </label>
                        <textarea
                            rows={3}
                            placeholder={reason === 'Other' ? 'Please provide details on why this takeover is required...' : 'Add any handover context or notes for the audit trail...'}
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-semibold focus:bg-white focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all placeholder:text-gray-400"
                        />
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isSubmitting}
                            className="px-5 py-2.5 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-extrabold text-xs transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="px-6 py-2.5 rounded-2xl bg-[#F97316] hover:bg-[#EA580C] text-white font-extrabold text-xs shadow-md shadow-orange-500/20 hover:shadow-orange-500/30 transition-all flex items-center gap-2 disabled:opacity-50"
                        >
                            {isSubmitting ? (
                                <>
                                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                                    <span>Transferring...</span>
                                </>
                            ) : (
                                <>
                                    <span>Confirm Take Over</span>
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default TakeoverReportModal;
