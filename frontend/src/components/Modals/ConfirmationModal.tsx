import React, { useEffect } from 'react';
import { AlertTriangle, Trash2, X, Loader2, UserX } from 'lucide-react';
import { getProfilePicture } from '../../utils/avatar';

export interface UserSummary {
    name: string;
    email: string;
    profile_picture?: string | null;
    role_id?: number;
    position?: string | null;
    position_name?: string | null;
}

export interface ConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title?: string;
    description?: string;
    confirmText?: string;
    cancelText?: string;
    isDestructive?: boolean;
    isLoading?: boolean;
    user?: UserSummary | null;
    warningMessage?: string;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    title = "Confirm Deletion",
    description = "Are you sure you want to permanently delete this user account? This action cannot be undone.",
    confirmText = "Confirm Deletion",
    cancelText = "Cancel",
    isDestructive = true,
    isLoading = false,
    user = null,
    warningMessage = "Deleting this user will permanently remove their credentials and administrative access. Linked stray reports, pet profiles, or activity logs will have their owner association set to NULL to preserve data integrity."
}) => {
    // Dismiss on Escape key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen && !isLoading) {
                onClose();
            }
        };

        if (isOpen) {
            document.addEventListener('keydown', handleKeyDown);
            document.body.style.overflow = 'hidden';
        }

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = 'unset';
        };
    }, [isOpen, isLoading, onClose]);

    if (!isOpen) return null;

    const getRoleBadge = (roleId?: number) => {
        switch (roleId) {
            case 4:
                return <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-red-100 text-red-700 border border-red-200">Admin</span>;
            case 3:
                return <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-purple-100 text-purple-700 border border-purple-200">Barangay Staff</span>;
            case 2:
                return <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-blue-100 text-blue-700 border border-blue-200">Subd Leader</span>;
            case 1:
            default:
                return <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-700 border border-amber-200">Citizen</span>;
        }
    };

    return (
        <div 
            className="fixed inset-0 z-[99999] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200 select-none"
            onClick={() => !isLoading && onClose()}
        >
            <div 
                className="relative w-full max-w-md bg-white rounded-3xl sm:rounded-[2.5rem] p-6 sm:p-8 shadow-2xl border-2 border-rose-100 flex flex-col items-center text-center space-y-5 animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Top Close Button */}
                <button
                    type="button"
                    onClick={onClose}
                    disabled={isLoading}
                    className="absolute top-4 right-4 sm:top-5 sm:right-5 w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-800 flex items-center justify-center transition-all cursor-pointer disabled:opacity-50"
                    aria-label="Close modal"
                >
                    <X className="w-4 h-4" />
                </button>

                {/* Header Icon */}
                <div className="relative flex items-center justify-center">
                    <div className={`w-16 h-16 sm:w-18 sm:h-18 rounded-3xl ${isDestructive ? 'bg-rose-50 text-rose-600 border-2 border-rose-200/80 shadow-lg shadow-rose-500/10' : 'bg-amber-50 text-amber-600 border-2 border-amber-200 shadow-lg shadow-amber-500/10'} flex items-center justify-center`}>
                        {isDestructive ? <UserX className="w-8 h-8 sm:w-9 sm:h-9" /> : <AlertTriangle className="w-8 h-8 sm:w-9 sm:h-9" />}
                    </div>
                </div>

                {/* Title and Description */}
                <div className="space-y-1.5 px-2">
                    <h3 className="text-xl sm:text-2xl font-black text-gray-900 uppercase tracking-tight">
                        {title}
                    </h3>
                    <p className="text-xs sm:text-sm font-semibold text-gray-500 leading-relaxed max-w-sm mx-auto">
                        {description}
                    </p>
                </div>

                {/* Target User Details Card */}
                {user && (
                    <div className="w-full bg-gray-50 rounded-2xl p-3.5 border border-gray-200/80 flex items-center gap-3 text-left">
                        <div className="w-11 h-11 rounded-full overflow-hidden bg-orange-100 border border-orange-200 flex-shrink-0 flex items-center justify-center">
                            {user.profile_picture ? (
                                <img 
                                    src={getProfilePicture(user.profile_picture)} 
                                    alt={user.name} 
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                        e.currentTarget.style.display = 'none';
                                    }}
                                />
                            ) : (
                                <span className="text-base font-black text-orange-600">
                                    {user.name.charAt(0).toUpperCase()}
                                </span>
                            )}
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-black text-gray-900 truncate leading-tight">
                                    {user.name}
                                </p>
                                {getRoleBadge(user.role_id)}
                            </div>
                            <p className="text-xs text-gray-500 truncate mt-0.5">
                                {user.email}
                            </p>
                            {(user.position_name || user.position) && (
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-0.5 truncate">
                                    {user.position_name || user.position}
                                </p>
                            )}
                        </div>
                    </div>
                )}

                {/* Warning Card */}
                {warningMessage && (
                    <div className="w-full bg-rose-50/70 p-3.5 rounded-2xl border border-rose-200/80 text-[11px] font-medium text-rose-900 text-left">
                        <div className="flex items-center gap-1.5 mb-1 text-rose-800 font-black uppercase tracking-wider text-[10px]">
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                            <span>Warning / Data Cascade:</span>
                        </div>
                        <p className="leading-normal text-rose-700">
                            {warningMessage}
                        </p>
                    </div>
                )}

                {/* Action Buttons */}
                <div className="w-full pt-1 flex flex-col-reverse sm:flex-row items-center gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isLoading}
                        className="w-full sm:flex-1 py-3 px-5 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-black uppercase tracking-wider transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                    >
                        {cancelText}
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={isLoading}
                        className={`w-full sm:flex-1 py-3 px-5 rounded-2xl ${
                            isDestructive
                                ? 'bg-rose-600 hover:bg-rose-700 active:bg-rose-800 shadow-lg shadow-rose-600/25 text-white'
                                : 'bg-[#F97316] hover:bg-[#EA580C] active:bg-orange-700 shadow-lg shadow-orange-600/25 text-white'
                        } text-xs font-black uppercase tracking-wider transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed`}
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>Processing...</span>
                            </>
                        ) : (
                            <>
                                {isDestructive && <Trash2 className="w-4 h-4" />}
                                <span>{confirmText}</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmationModal;
