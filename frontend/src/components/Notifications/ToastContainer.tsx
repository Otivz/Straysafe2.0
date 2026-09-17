import React from 'react';
import { useToastItems, type ToastType } from '../../context/ToastContext';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';

const TOAST_ICONS: Record<ToastType, React.ReactNode> = {
    success: <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />,
    error: <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />,
    warning: <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />,
    info: <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />,
};

const TOAST_STYLES: Record<ToastType, string> = {
    success: 'bg-white/95 dark:bg-[#151C2C]/95 border-emerald-500/30 text-emerald-950 dark:text-emerald-100 shadow-emerald-500/10',
    error: 'bg-white/95 dark:bg-[#151C2C]/95 border-red-500/30 text-red-950 dark:text-red-100 shadow-red-500/10',
    warning: 'bg-white/95 dark:bg-[#151C2C]/95 border-amber-500/30 text-amber-950 dark:text-amber-100 shadow-amber-500/10',
    info: 'bg-white/95 dark:bg-[#151C2C]/95 border-blue-500/30 text-blue-950 dark:text-blue-100 shadow-blue-500/10',
};

const TOAST_BADGE_STYLES: Record<ToastType, string> = {
    success: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
    error: 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300',
    warning: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
    info: 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
};

export const ToastContainer: React.FC = () => {
    const { toasts, dismiss } = useToastItems();

    if (toasts.length === 0) return null;

    return (
        <div 
            aria-live="polite" 
            className="fixed top-5 right-5 z-[99999] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0"
        >
            {toasts.map((toast) => (
                <div
                    key={toast.id}
                    role="alert"
                    className={`pointer-events-auto flex items-start gap-3 p-4 rounded-2xl border shadow-xl backdrop-blur-md transition-all duration-300 transform translate-y-0 ${TOAST_STYLES[toast.type]}`}
                >
                    {TOAST_ICONS[toast.type]}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                            <h4 className="text-xs font-black uppercase tracking-wider text-gray-900 dark:text-white">
                                {toast.message}
                            </h4>
                            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${TOAST_BADGE_STYLES[toast.type]}`}>
                                {toast.type}
                            </span>
                        </div>
                        {toast.description && (
                            <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 leading-relaxed break-words">
                                {toast.description}
                            </p>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={() => dismiss(toast.id)}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors shrink-0"
                        title="Dismiss notification"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            ))}
        </div>
    );
};

export default ToastContainer;
