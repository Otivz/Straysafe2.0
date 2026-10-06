import React from 'react';
import { 
    AlertTriangle, 
    X, 
    Calendar, 
    User, 
    FileText, 
    PawPrint, 
    ShieldAlert, 
    CheckCircle2, 
    MapPin 
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export interface WarningRecordData {
    warning_id: number;
    user_id: number;
    pet_id?: number | null;
    report_id?: number | null;
    issued_by: number;
    warning_level: string;
    violation_type: string;
    warning_type?: string;
    description: string;
    warning_reason?: string;
    fine_amount?: number;
    status: string;
    acknowledged_at?: string | Date | null;
    created_at?: string | Date | null;
    issued_at?: string | Date | null;
    owner_name?: string | null;
    owner_phone?: string | null;
    pet_name?: string | null;
    pet_id_display?: string | null;
    report_ref_display?: string | null;
    issuer_name?: string | null;
    issuer_role?: string | null;
    report_landmark?: string | null;
    report_animal_type?: string | null;
    report_photo?: string | null;
}

interface WarningDetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    warning: WarningRecordData | null;
    onViewPet?: (petId: number | string) => void;
    onViewReport?: (reportId: number | string) => void;
}

const WarningDetailsModal: React.FC<WarningDetailsModalProps> = ({
    isOpen,
    onClose,
    warning,
    onViewPet,
    onViewReport
}) => {
    const navigate = useNavigate();

    if (!isOpen || !warning) return null;

    const formattedIssuedDate = warning.created_at || warning.issued_at
        ? new Date(warning.created_at || warning.issued_at!).toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        })
        : 'Date not recorded';

    const petDisplay = warning.pet_name 
        ? warning.pet_name 
        : (warning.pet_id ? `Pet #${warning.pet_id}` : 'Unregistered / Unspecified Animal');

    const petIdText = warning.pet_id_display || (warning.pet_id ? `PET-${String(warning.pet_id).padStart(5, '0')}` : 'N/A');
    const reportRefText = warning.report_ref_display || (warning.report_id ? `#REPORT-${String(warning.report_id).padStart(5, '0')}` : 'N/A');


    const handleViewPet = () => {
        if (!warning.pet_id) return;
        if (onViewPet) {
            onViewPet(warning.pet_id);
            onClose();
        } else {
            const currentPath = window.location.pathname + (warning.warning_id ? `?warning_id=${warning.warning_id}` : window.location.search);
            const path = window.location.pathname;
            const fromParam = `&from=${encodeURIComponent(currentPath)}`;

            if (path.startsWith('/admin')) {
                navigate(`/admin/pet-records?pet_id=${warning.pet_id}${fromParam}`, {
                    state: { from: currentPath }
                });
            } else if (path.startsWith('/subd')) {
                navigate(`/subd/pet-records?pet_id=${warning.pet_id}${fromParam}`, {
                    state: { from: currentPath }
                });
            } else if (path.startsWith('/brgy')) {
                navigate(`/brgy/pet-records?pet_id=${warning.pet_id}${fromParam}`, {
                    state: { from: currentPath }
                });
            } else {
                navigate(`/resident/pets?pet_id=${warning.pet_id}${fromParam}`, {
                    state: { from: currentPath }
                });
            }
            onClose();
        }
    };

    const handleViewReport = () => {
        if (onViewReport && warning.report_id) {
            onViewReport(warning.report_id);
            onClose();
        } else if (warning.report_id) {
            const currentPath = window.location.pathname + (warning.warning_id ? `?warning_id=${warning.warning_id}` : window.location.search);
            const path = window.location.pathname;
            if (path.startsWith('/admin')) {
                navigate(`/admin/reports/${warning.report_id}`, {
                    state: { from: currentPath }
                });
            } else if (path.startsWith('/subd')) {
                navigate(`/subd/reports/${warning.report_id}`, {
                    state: { from: currentPath }
                });
            } else if (path.startsWith('/brgy')) {
                navigate(`/brgy/reports/${warning.report_id}`, {
                    state: { from: currentPath }
                });
            } else {
                navigate(`/resident/reports/${warning.report_id}`, {
                    state: { from: currentPath }
                });
            }
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
            <div className="bg-white dark:bg-stone-900 rounded-3xl shadow-2xl w-full max-w-lg border border-amber-100 dark:border-stone-800 overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="px-6 py-5 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border-b border-amber-100 dark:border-stone-800 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400 shadow-xs">
                            <ShieldAlert className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-base font-black text-stone-900 dark:text-stone-100 uppercase tracking-tight">
                                    Warning Citation Details
                                </h3>
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                                    warning.status === 'Acknowledged'
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400'
                                        : 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300'
                                }`}>
                                    {warning.status === 'Acknowledged' ? '✓ Acknowledged' : '● Officially Issued'}
                                </span>
                            </div>
                            <p className="text-[11px] text-stone-500 dark:text-stone-400 font-medium mt-0.5">
                                Permanent enforcement record #{warning.warning_id}
                            </p>
                        </div>
                    </div>
                    <button 
                        type="button"
                        onClick={onClose} 
                        className="w-8 h-8 flex items-center justify-center text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 rounded-full hover:bg-stone-100 dark:hover:bg-stone-800 transition-all cursor-pointer"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body Content */}
                <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto custom-scrollbar">
                    {/* Primary Citation Badge */}
                    <div className="p-4 bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-800/60 rounded-2xl space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black text-amber-800 dark:text-amber-300 uppercase tracking-widest flex items-center gap-1.5">
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                                {warning.warning_level}
                            </span>
                            <span className="text-[10px] font-mono text-amber-700 dark:text-amber-400 font-bold">
                                Citation #{warning.warning_id}
                            </span>
                        </div>
                        <h4 className="text-sm font-black text-stone-900 dark:text-stone-100">
                            {warning.violation_type || warning.warning_type || 'Responsible Pet Ownership Warning'}
                        </h4>
                    </div>

                    {/* Official Reason & Description */}
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-stone-400 dark:text-stone-500 uppercase tracking-widest">
                            Reason / Officer Findings
                        </label>
                        <div className="p-3.5 bg-stone-50 dark:bg-stone-800/70 border border-stone-200/70 dark:border-stone-700/60 rounded-2xl text-xs font-medium text-stone-700 dark:text-stone-300 leading-relaxed">
                            {warning.description || warning.warning_reason || 'No specific description provided.'}
                        </div>
                    </div>

                    {/* Linked Entities Grid (Pet & Report Two-Way Trace) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        {/* Linked Pet Box */}
                        <div 
                            onClick={warning.pet_id ? handleViewPet : undefined}
                            className={`p-3.5 bg-stone-50 dark:bg-stone-800/50 border border-stone-200/70 dark:border-stone-700/50 rounded-2xl space-y-1.5 transition-all ${
                                warning.pet_id ? 'hover:border-role-border dark:hover:border-role-strong hover:bg-role-soft/30 cursor-pointer' : ''
                            }`}
                        >
                            <div className="flex items-center justify-between">
                                <span className="text-[9px] font-black text-stone-400 dark:text-stone-500 uppercase tracking-widest flex items-center gap-1">
                                    <PawPrint className="w-3 h-3 text-role" /> Linked Pet
                                </span>
                                <span className="text-[9px] font-mono font-bold text-stone-500 dark:text-stone-400">
                                    {petIdText}
                                </span>
                            </div>
                            <p className="text-xs font-black text-stone-900 dark:text-stone-100 truncate">
                                {petDisplay}
                            </p>
                            {warning.owner_name && (
                                <p className="text-[10px] text-stone-500 dark:text-stone-400 font-medium truncate">
                                    Owner: <strong className="text-stone-700 dark:text-stone-300">{warning.owner_name}</strong>
                                </p>
                            )}
                        </div>

                        {/* Linked Report Box */}
                        <div 
                            onClick={warning.report_id ? handleViewReport : undefined}
                            className={`p-3.5 bg-stone-50 dark:bg-stone-800/50 border border-stone-200/70 dark:border-stone-700/50 rounded-2xl space-y-1.5 transition-all ${
                                warning.report_id ? 'hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-50/30 cursor-pointer' : ''
                            }`}
                        >
                            <div className="flex items-center justify-between">
                                <span className="text-[9px] font-black text-stone-400 dark:text-stone-500 uppercase tracking-widest flex items-center gap-1">
                                    <FileText className="w-3 h-3 text-blue-500" /> Related Report
                                </span>
                                <span className="text-[9px] font-mono font-bold text-blue-600 dark:text-blue-400">
                                    {reportRefText}
                                </span>
                            </div>
                            <p className="text-xs font-black text-stone-900 dark:text-stone-100 truncate">
                                Incident #{warning.report_id || 'N/A'}
                            </p>
                            {warning.report_landmark && (
                                <p className="text-[10px] text-stone-500 dark:text-stone-400 font-medium truncate flex items-center gap-1">
                                    <MapPin className="w-2.5 h-2.5 shrink-0" /> {warning.report_landmark}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Metadata & Audit Trail */}
                    <div className="p-3.5 bg-stone-50/80 dark:bg-stone-800/40 border border-stone-200/70 dark:border-stone-700/50 rounded-2xl space-y-2 text-[11px]">
                        <div className="flex justify-between items-center text-stone-600 dark:text-stone-300">
                            <span className="text-stone-400 dark:text-stone-500 font-medium flex items-center gap-1.5">
                                <User className="w-3 h-3 text-stone-400" /> Issued By
                            </span>
                            <span className="font-bold">
                                {warning.issuer_name || 'Community Official'} ({warning.issuer_role || 'Staff'})
                            </span>
                        </div>
                        <div className="flex justify-between items-center text-stone-600 dark:text-stone-300 border-t border-stone-200/50 dark:border-stone-700/50 pt-2">
                            <span className="text-stone-400 dark:text-stone-500 font-medium flex items-center gap-1.5">
                                <Calendar className="w-3 h-3 text-stone-400" /> Issued At
                            </span>
                            <span className="font-bold">
                                {formattedIssuedDate}
                            </span>
                        </div>
                        {warning.acknowledged_at && (
                            <div className="flex justify-between items-center text-emerald-700 dark:text-emerald-400 border-t border-stone-200/50 dark:border-stone-700/50 pt-2 font-medium">
                                <span className="flex items-center gap-1.5">
                                    <CheckCircle2 className="w-3 h-3" /> Acknowledged On
                                </span>
                                <span className="font-bold">
                                    {new Date(warning.acknowledged_at).toLocaleDateString('en-US', {
                                        month: 'short',
                                        day: 'numeric',
                                        year: 'numeric'
                                    })}
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer Navigation Actions */}
                {(Boolean(warning.pet_id) || Boolean(warning.report_id)) && (
                    <div className="px-6 py-4 bg-stone-50 dark:bg-stone-850 border-t border-stone-200/70 dark:border-stone-800 flex items-center justify-end gap-2">
                        {Boolean(warning.pet_id) && (
                            <button
                                type="button"
                                onClick={handleViewPet}
                                className="px-4 py-2 bg-role-soft hover:bg-role-muted dark:bg-role-strong/40 dark:hover:bg-role-strong/50 text-role-strong dark:text-role-border rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs active:scale-95"
                            >
                                <PawPrint className="w-3.5 h-3.5" />
                                View Pet
                            </button>
                        )}
                        {Boolean(warning.report_id) && (
                            <button
                                type="button"
                                onClick={handleViewReport}
                                className="px-4 py-2 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs active:scale-95"
                            >
                                <FileText className="w-3.5 h-3.5" />
                                View Report
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default WarningDetailsModal;
