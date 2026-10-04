import { useEffect } from 'react';
import { CheckCircle2, Info, X } from 'lucide-react';

// Small in-page notice dialog (replaces the browser's alert() popup at the top of the screen).
interface NoticeModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    hint?: string;
    buttonLabel?: string;
    variant?: 'info' | 'success' | 'error';
    onClose: () => void;
}

export default function NoticeModal({ isOpen, title, message, hint, buttonLabel = 'Got it', variant = 'info', onClose }: NoticeModalProps) {
    const tone = variant === 'success' ? 'bg-emerald-100 text-emerald-700' : variant === 'error' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700';
    const Icon = variant === 'success' ? CheckCircle2 : Info;
    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen, onClose]);

    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[10000] bg-black/50 backdrop-blur-xs flex items-center justify-center p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 space-y-4 animate-in zoom-in-95 duration-150" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start gap-3">
                    <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${tone}`}>
                        <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="text-base font-black text-gray-900">{title}</h3>
                        <p className="text-sm text-gray-600 mt-1 leading-relaxed">{message}</p>
                        {hint && <p className="text-xs text-gray-500 mt-2 leading-relaxed bg-gray-50 border border-gray-100 rounded-xl px-3 py-2">{hint}</p>}
                    </div>
                    <button type="button" onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700 cursor-pointer" aria-label="Close">
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <div className="flex justify-end">
                    <button type="button" autoFocus onClick={onClose} className="px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-black cursor-pointer">
                        {buttonLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
