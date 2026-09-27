import React from 'react';
import { AlertTriangle, X, Loader2 } from 'lucide-react';

export interface CancelReportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    reportId?: number | null;
    reportCode?: string | null;
    isCancelling?: boolean;
}

export const CancelReportModal: React.FC<CancelReportModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    reportId,
    reportCode,
    isCancelling = false,
}) => {
    if (!isOpen) return null;

    const formattedCode = reportCode || (reportId ? `#STR-${reportId.toString().padStart(4, '0')}` : null);

    return (
        <div 
            className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200 select-none"
            onClick={onClose}
        >
            <div 
                className="relative w-full max-w-md bg-white dark:bg-stone-900 rounded-3xl sm:rounded-[2.5rem] p-6 sm:p-8 shadow-2xl border-2 border-rose-100 dark:border-rose-950/80 flex flex-col items-center text-center space-y-5 animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Top Close Button */}
                <button
                    type="button"
                    onClick={onClose}
                    disabled={isCancelling}
                    className="absolute top-4 right-4 sm:top-5 sm:right-5 w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white flex items-center justify-center transition-all cursor-pointer disabled:opacity-50"
                    aria-label="Close modal"
                >
                    <X className="w-4 h-4" />
                </button>

                {/* Warning Icon with layered glow */}
                <div className="relative flex items-center justify-center">
                    <div className="w-16 h-16 sm:w-18 sm:h-18 rounded-3xl bg-rose-50 dark:bg-rose-950/70 text-rose-600 dark:text-rose-400 flex items-center justify-center border-2 border-rose-200/80 dark:border-rose-900/60 shadow-lg shadow-rose-500/10">
                        <AlertTriangle className="w-8 h-8 sm:w-9 sm:h-9" />
                    </div>
                </div>

                {/* Header & Details */}
                <div className="space-y-2 px-2">
                    {formattedCode && (
                        <span className="inline-block px-3 py-1 rounded-full bg-rose-100/80 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 text-[10px] font-black uppercase tracking-wider border border-rose-200 dark:border-rose-800/80 mb-1">
                            {formattedCode}
                        </span>
                    )}
                    <h3 className="text-xl sm:text-2xl font-black text-[#1a1208] dark:text-white uppercase tracking-tight">
                        Cancel Report?
                    </h3>
                    <p className="text-xs sm:text-sm font-bold text-gray-500 dark:text-gray-400 leading-relaxed max-w-sm mx-auto">
                        Are you sure you want to cancel this report? This will withdraw the report from the active feed.
                    </p>
                </div>

                {/* Information Note */}
                <div className="w-full bg-rose-50/70 dark:bg-rose-950/40 p-3.5 rounded-2xl border border-rose-200/60 dark:border-rose-900/40 text-[11px] font-semibold text-rose-900 dark:text-rose-200 text-left">
                    <span className="font-black uppercase tracking-wider block text-[10px] text-rose-800 dark:text-rose-300 mb-0.5">
                        ⚠️ Please Note:
                    </span>
                    This action marks the incident as cancelled and it will no longer be open for community assistance or dispatch.
                </div>

                {/* Action Buttons */}
                <div className="w-full pt-2 flex flex-col-reverse sm:flex-row items-center gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isCancelling}
                        className="w-full sm:flex-1 py-3.5 px-5 rounded-2xl bg-gray-100 hover:bg-gray-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-gray-700 dark:text-gray-200 text-xs font-black uppercase tracking-wider transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={isCancelling}
                        className="w-full sm:flex-1 py-3.5 px-5 rounded-2xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white text-xs font-black uppercase tracking-wider shadow-lg shadow-rose-600/25 transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {isCancelling ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>Cancelling...</span>
                            </>
                        ) : (
                            <span>Yes, Cancel Report</span>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CancelReportModal;
