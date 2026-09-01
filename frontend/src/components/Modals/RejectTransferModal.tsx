import React, { useState } from 'react';
import api from '../../utils/api';

interface RejectTransferModalProps {
    isOpen: boolean;
    onClose: () => void;
    reportId: number;
    currentUserId: number;
    senderName?: string;
    onRejectSuccess: (updatedReport: any) => void;
}

const RejectTransferModal: React.FC<RejectTransferModalProps> = ({
    isOpen,
    onClose,
    reportId,
    currentUserId,
    senderName,
    onRejectSuccess,
}) => {
    const [reason, setReason] = useState<string>('');
    const [submitting, setSubmitting] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);

        try {
            const res = await api.post(`/reports/${reportId}/transfer/reject`, {
                user_id: currentUserId,
                reason: reason.trim() || undefined,
            });

            onRejectSuccess(res.data);
            onClose();
        } catch (err: any) {
            console.error('Failed to reject report transfer:', err);
            setError(err.response?.data?.detail || 'Failed to decline transfer request.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl border border-gray-100 flex flex-col gap-6 relative">
                {/* Header */}
                <div className="flex items-center justify-between pb-4 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center text-xl font-black">
                            ✕
                        </div>
                        <div>
                            <h3 className="text-base font-black text-gray-900 uppercase tracking-tight">
                                Decline Case Transfer
                            </h3>
                            <p className="text-[11px] text-gray-400 font-bold uppercase tracking-wider">
                                Report #{reportId}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={submitting}
                        className="w-8 h-8 rounded-full bg-gray-50 hover:bg-gray-100 text-gray-400 hover:text-gray-700 flex items-center justify-center transition-all cursor-pointer"
                    >
                        ✕
                    </button>
                </div>

                {error && (
                    <div className="p-4 rounded-2xl bg-red-50 border border-red-100 text-red-700 text-xs font-bold flex items-center gap-2">
                        <span>⚠️</span>
                        <span>{error}</span>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                    <p className="text-xs text-gray-600 font-medium leading-relaxed">
                        Declining will return this report back to <strong className="font-bold text-gray-900">{senderName || 'the original officer'}</strong>, notifying them that they remain responsible for this case.
                    </p>

                    {/* Reason input */}
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">
                            Reason for Declining
                        </label>
                        <textarea
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="e.g. Currently responding to another active stray report in Zone 3."
                            rows={3}
                            required
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-xs font-bold text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 focus:bg-white transition-all resize-none shadow-xs"
                        />
                    </div>

                    {/* Buttons */}
                    <div className="flex items-center justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={submitting}
                            className="px-5 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={submitting || !reason.trim()}
                            className="px-6 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase tracking-wider shadow-md shadow-red-600/20 transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                        >
                            {submitting ? (
                                <>
                                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                                    <span>Declining...</span>
                                </>
                            ) : (
                                <>
                                    <span>Decline & Notify Officer</span>
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default RejectTransferModal;
