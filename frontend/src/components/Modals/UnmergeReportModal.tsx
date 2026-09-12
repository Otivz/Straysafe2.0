import React, { useState } from 'react';
import axios from 'axios';

interface UnmergeReportModalProps {
    isOpen: boolean;
    onClose: () => void;
    reportId: number;
    primaryReportId?: number | null;
    currentUserId: number;
    onSuccess: (updatedReport: any) => void;
}

const UNMERGE_REASONS = [
    'Confirmed different animals upon closer physical inspection',
    'Animal sighting occurred in a completely different area / time',
    'Report requires separate active rescue dispatch and investigation',
    'Administrative / Officer selection error',
    'Other'
];

const UnmergeReportModal: React.FC<UnmergeReportModalProps> = ({
    isOpen,
    onClose,
    reportId,
    primaryReportId,
    currentUserId,
    onSuccess
}) => {
    const [selectedReason, setSelectedReason] = useState<string>(UNMERGE_REASONS[0]);
    const [notes, setNotes] = useState<string>('');
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitError(null);

        const finalReason = selectedReason === 'Other'
            ? notes.trim()
            : notes.trim() ? `${selectedReason} - ${notes.trim()}` : selectedReason;

        if (selectedReason === 'Other' && (!notes.trim() || notes.trim().length < 5)) {
            setSubmitError('Please enter an explanation (minimum 5 characters) for separating this report.');
            return;
        }

        try {
            setIsSubmitting(true);
            const res = await axios.post(`http://localhost:8000/reports/${reportId}/unmerge`, {
                user_id: currentUserId,
                reason: finalReason
            });

            onSuccess(res.data);
            onClose();
        } catch (err: any) {
            console.error('Unmerge failed:', err);
            setSubmitError(err.response?.data?.detail || 'Failed to separate report. Please try again.');
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
                        <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-200 flex items-center justify-center text-2xl font-black shrink-0">
                            ✂️
                        </div>
                        <div>
                            <h3 className="text-lg font-black text-gray-900 tracking-tight leading-tight">
                                Separate Report #{reportId}
                            </h3>
                            <p className="text-xs font-bold text-gray-500 mt-0.5">
                                Unmerge from Case #{primaryReportId || '...'} and restore as an active case
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-700 transition-colors text-sm font-black cursor-pointer"
                    >
                        ✕
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                    {/* Reason Selection */}
                    <div>
                        <label className="block text-[11px] font-black text-gray-700 uppercase tracking-wider mb-2">
                            Reason for Separation <span className="text-rose-500">*</span>
                        </label>
                        <div className="space-y-2">
                            {UNMERGE_REASONS.map((r) => (
                                <label
                                    key={r}
                                    className={`flex items-center gap-3 p-3 rounded-2xl border cursor-pointer transition-all ${
                                        selectedReason === r
                                            ? 'border-indigo-500 bg-indigo-50/50 shadow-2xs'
                                            : 'border-gray-100 hover:bg-gray-50'
                                    }`}
                                >
                                    <input
                                        type="radio"
                                        name="unmerge_reason"
                                        value={r}
                                        checked={selectedReason === r}
                                        onChange={() => setSelectedReason(r)}
                                        className="text-indigo-600 focus:ring-indigo-500"
                                    />
                                    <span className="text-xs font-bold text-gray-800">{r}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Additional Notes */}
                    <div>
                        <label className="block text-[11px] font-black text-gray-700 uppercase tracking-wider mb-1.5">
                            Additional Officer Notes {selectedReason === 'Other' && <span className="text-rose-500">*</span>}
                        </label>
                        <textarea
                            rows={3}
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Provide any additional context or instructions for reopening this report..."
                            className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-semibold text-gray-900 focus:outline-none focus:border-indigo-500 focus:bg-white resize-none"
                            required={selectedReason === 'Other'}
                        />
                    </div>

                    {/* Notice */}
                    <div className="p-3.5 bg-amber-50 rounded-2xl border border-amber-200 text-amber-900 text-xs font-medium space-y-1">
                        <p className="font-black text-amber-950 uppercase tracking-wider text-[10px] flex items-center gap-1">
                            <span>⚠️ Important Notice</span>
                        </p>
                        <p className="text-[11px] text-amber-800 leading-snug">
                            Separating this report will reopen Report #{reportId} as an active independent case. The citizen reporter will be notified that their report has been reopened.
                        </p>
                    </div>

                    {submitError && (
                        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold text-rose-700">
                            ⚠️ {submitError}
                        </div>
                    )}

                    {/* Footer */}
                    <div className="flex items-center justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isSubmitting}
                            className="px-5 py-2.5 rounded-xl border border-gray-200 text-xs font-black text-gray-600 hover:bg-gray-100 transition-colors uppercase tracking-wider cursor-pointer"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase tracking-wider transition-all shadow-md shadow-indigo-100 flex items-center gap-2 cursor-pointer"
                        >
                            {isSubmitting ? (
                                <>
                                    <span className="animate-spin text-sm">⏳</span>
                                    <span>Separating...</span>
                                </>
                            ) : (
                                <>
                                    <span>Confirm Separation</span>
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default UnmergeReportModal;
