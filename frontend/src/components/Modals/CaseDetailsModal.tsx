import React, { useState, useEffect } from 'react';
import { 
    X, 
    ExternalLink, 
    MapPin, 
    AlertTriangle, 
    Camera, 
    Clock, 
    PawPrint,
    ChevronLeft,
    ChevronRight
} from 'lucide-react';
import { api } from '../../utils/api';
import { DEFAULT_AVATAR } from '../../utils/avatar';
import MediaLightbox from '../MediaLightbox';


export interface CaseDetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    reportId?: number | null;
    initialData?: any;
    onNavigateToReport?: (reportId: number) => void;
}

const statusColorMap: Record<number, { bg: string; text: string; border: string; label: string }> = {
    1: { bg: 'bg-amber-500/10 dark:bg-amber-950/30', text: 'text-amber-700 dark:text-amber-400', border: 'border-amber-300 dark:border-amber-800', label: 'Reported' },
    2: { bg: 'bg-blue-500/10 dark:bg-blue-950/30', text: 'text-blue-700 dark:text-blue-400', border: 'border-blue-300 dark:border-blue-800', label: 'Verified' },
    3: { bg: 'bg-rose-500/10 dark:bg-rose-950/30', text: 'text-rose-700 dark:text-rose-400', border: 'border-rose-300 dark:border-rose-800', label: 'Rejected' },
    4: { bg: 'bg-purple-500/10 dark:bg-purple-950/30', text: 'text-purple-700 dark:text-purple-400', border: 'border-purple-300 dark:border-purple-800', label: 'Escalated to Barangay' },
    5: { bg: 'bg-indigo-500/10 dark:bg-indigo-950/30', text: 'text-indigo-700 dark:text-indigo-400', border: 'border-indigo-300 dark:border-indigo-800', label: 'Rescue In Progress' },
    6: { bg: 'bg-teal-500/10 dark:bg-teal-950/30', text: 'text-teal-700 dark:text-teal-400', border: 'border-teal-300 dark:border-teal-800', label: 'Picked Up' },
    7: { bg: 'bg-yellow-500/10 dark:bg-yellow-950/30', text: 'text-yellow-700 dark:text-yellow-400', border: 'border-yellow-300 dark:border-yellow-800', label: 'Under Observation' },
    8: { bg: 'bg-cyan-500/10 dark:bg-cyan-950/30', text: 'text-cyan-700 dark:text-cyan-400', border: 'border-cyan-300 dark:border-cyan-800', label: 'Impounded' },
    9: { bg: 'bg-emerald-500/10 dark:bg-emerald-950/30', text: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-300 dark:border-emerald-800', label: 'Claimed by Owner' },
    10: { bg: 'bg-green-500/10 dark:bg-green-950/30', text: 'text-green-700 dark:text-green-400', border: 'border-green-300 dark:border-green-800', label: 'Released' },
    11: { bg: 'bg-emerald-500/10 dark:bg-emerald-950/30', text: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-300 dark:border-emerald-800', label: 'Resolved' },
    12: { bg: 'bg-gray-500/10 dark:bg-gray-900/40', text: 'text-gray-700 dark:text-gray-400', border: 'border-gray-300 dark:border-gray-700', label: 'Deceased' },
    13: { bg: 'bg-emerald-500/10 dark:bg-emerald-950/30', text: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-300 dark:border-emerald-800', label: 'Approved' },
    14: { bg: 'bg-slate-500/10 dark:bg-slate-900/40', text: 'text-slate-700 dark:text-slate-400', border: 'border-slate-300 dark:border-slate-700', label: 'False Alarm / Dismissed' },
};

export const CaseDetailsModal: React.FC<CaseDetailsModalProps> = ({
    isOpen,
    onClose,
    reportId,
    initialData,
    onNavigateToReport
}) => {
    const [report, setReport] = useState<any>(initialData || null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [activeMediaIndex, setActiveMediaIndex] = useState<number>(0);
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

    useEffect(() => {
        if (!isOpen) return;

        if (initialData) {
            setReport(initialData);
        }

        const idToFetch = reportId || initialData?.report_id;
        if (!idToFetch) return;

        let isMounted = true;
        setIsLoading(true);

        api.get(`/reports/${idToFetch}`)
            .then((res) => {
                if (isMounted && res.data) {
                    setReport(res.data);
                }
            })
            .catch((err) => {
                console.error('Failed to load full case details:', err);
                // Keep initialData as fallback
            })
            .finally(() => {
                if (isMounted) setIsLoading(false);
            });

        return () => {
            isMounted = false;
        };
    }, [isOpen, reportId, initialData]);

    if (!isOpen) return null;

    const currentReport = report || initialData || {};
    const effectiveId = currentReport.report_id || reportId || 0;
    const reportCode = `#STR-${effectiveId.toString().padStart(4, '0')}`;

    const rawStatusId = Number(
        currentReport.current_status_id || currentReport.status_id || 1
    );
    const statusMeta = statusColorMap[rawStatusId] || {
        bg: 'bg-orange-500/10 dark:bg-orange-950/30',
        text: 'text-orange-700 dark:text-orange-400',
        border: 'border-orange-300 dark:border-orange-800',
        label: currentReport.status?.status_name || currentReport.status_name || 'Active'
    };

    // Media list processing
    const rawMedia = currentReport.media || currentReport.photos || [];
    const mediaList = Array.isArray(rawMedia)
        ? rawMedia.map((m: any) => ({
              url: typeof m === 'string' ? m : m.file_url || m.media_url || m.url || '',
              type: m.media_type || (typeof m === 'string' && m.match(/\.(mp4|webm|mov)$/i) ? 'video' : 'image')
          })).filter(m => Boolean(m.url))
        : [];

    // Fallback single photo if media list is empty
    if (mediaList.length === 0 && (currentReport.photo_url || currentReport.image_url)) {
        mediaList.push({
            url: currentReport.photo_url || currentReport.image_url,
            type: 'image'
        });
    }

    const currentMedia = mediaList[activeMediaIndex] || mediaList[0];

    const categoryName = 
        currentReport.category?.category_name || 
        currentReport.category_name || 
        currentReport.category || 
        'Stray Report';

    const animalType = currentReport.animal_type || currentReport.ai_animal_type || 'Unknown Animal';
    const animalBreed = currentReport.animal_breed || currentReport.breed || currentReport.ai_possible_breed || 'Unknown Breed';
    const animalColor = currentReport.animal_color || currentReport.dominant_color || currentReport.ai_dominant_color || 'Unknown Color';
    const gender = currentReport.gender || 'Unknown Gender';
    const healthStatus = currentReport.health_status || currentReport.condition || 'Not Specified';

    const reporterName = currentReport.reporter_name || currentReport.reporter?.name || currentReport.user?.name || 'Community Resident';
    const reporterPhoto = currentReport.reporter_photo || currentReport.reporter?.profile_picture || currentReport.user?.profile_picture || DEFAULT_AVATAR;

    const formattedDate = (() => {
        const raw = currentReport.created_at;
        if (!raw) return 'Recently Reported';
        try {
            const d = new Date(raw);
            return d.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            });
        } catch {
            return String(raw);
        }
    })();

    const streetAddress = currentReport.street_address || currentReport.address || 'Address not provided';
    const landmark = currentReport.landmark;
    const subdivision = currentReport.subdivision_name || currentReport.subdivision?.subdivision_name || '';
    const barangay = currentReport.barangay_name || '';

    const description = currentReport.description || currentReport.notes || currentReport.remarks || 'No detailed remarks provided for this incident.';

    const riskLevel = currentReport.ai_suggested_risk_level || currentReport.ai_suggested_priority;
    const isAggressive = Boolean(currentReport.verified_aggressive || currentReport.ai_behavior_aggressive);
    const hasBite = Boolean(currentReport.verified_actual_bite || currentReport.ai_behavior_actual_bite);
    const hasInjury = Boolean(currentReport.verified_injury || currentReport.ai_behavior_injury);

    return (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
            <div 
                className="w-full max-w-2xl bg-white dark:bg-[#151C2C] text-gray-900 dark:text-gray-100 rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[92vh] border border-gray-100 dark:border-gray-800 animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Modal Header */}
                <div className="p-4 sm:p-5 bg-gradient-to-r from-orange-500 via-orange-600 to-amber-600 text-white flex items-center justify-between shrink-0 shadow-sm">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0 border border-white/30 text-white shadow-inner">
                            <PawPrint className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="px-2 py-0.5 bg-white/25 rounded-md text-[10px] font-black uppercase tracking-wider">
                                    {reportCode}
                                </span>
                                <span className="px-2 py-0.5 bg-black/20 rounded-md text-[10px] font-bold uppercase tracking-wider">
                                    {categoryName}
                                </span>
                                {isLoading && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                            </div>
                            <h3 className="font-extrabold text-sm sm:text-base truncate tracking-tight text-white mt-0.5">
                                Case Information & Details
                            </h3>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {onNavigateToReport && effectiveId > 0 && (
                            <button
                                type="button"
                                onClick={() => onNavigateToReport(effectiveId)}
                                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95 border border-white/20 shadow-xs"
                                title="Open full report page"
                            >
                                <span>Full Page</span>
                                <ExternalLink className="w-3.5 h-3.5" />
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-2 rounded-xl bg-white/10 hover:bg-white/25 text-white transition-all cursor-pointer active:scale-90"
                            title="Close"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Status Bar */}
                <div className="px-5 py-2.5 bg-gray-50 dark:bg-[#1A2338] border-b border-gray-100 dark:border-gray-800 flex items-center justify-between flex-wrap gap-2 text-xs shrink-0">
                    <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400">Status:</span>
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${statusMeta.bg} ${statusMeta.text} ${statusMeta.border}`}>
                            {statusMeta.label}
                        </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400 text-[11px] font-medium">
                        <Clock className="w-3.5 h-3.5 text-gray-400" />
                        <span>{formattedDate}</span>
                    </div>
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 custom-scrollbar">
                    {/* Media Gallery / Photo Hero */}
                    {mediaList.length > 0 ? (
                        <div className="space-y-2">
                            <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-inner group">
                                {currentMedia.type === 'video' ? (
                                    <video 
                                        src={currentMedia.url} 
                                        controls 
                                        className="w-full h-full object-contain"
                                    />
                                ) : (
                                    <img 
                                        src={currentMedia.url} 
                                        alt="Case photo" 
                                        className="w-full h-full object-cover cursor-pointer transition-transform duration-300 group-hover:scale-102"
                                        onClick={() => setLightboxIndex(activeMediaIndex)}
                                    />
                                )}

                                {/* Media navigation arrows if multiple */}
                                {mediaList.length > 1 && (
                                    <>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setActiveMediaIndex((prev) => (prev > 0 ? prev - 1 : mediaList.length - 1));
                                            }}
                                            className="absolute left-2.5 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/60 hover:bg-black/80 text-white backdrop-blur-xs transition-all cursor-pointer shadow-md"
                                        >
                                            <ChevronLeft className="w-4 h-4" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setActiveMediaIndex((prev) => (prev < mediaList.length - 1 ? prev + 1 : 0));
                                            }}
                                            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/60 hover:bg-black/80 text-white backdrop-blur-xs transition-all cursor-pointer shadow-md"
                                        >
                                            <ChevronRight className="w-4 h-4" />
                                        </button>
                                        <div className="absolute bottom-2.5 right-2.5 px-2.5 py-1 rounded-full bg-black/60 text-white text-[10px] font-bold backdrop-blur-xs">
                                            {activeMediaIndex + 1} / {mediaList.length}
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* Thumbnail strip */}
                            {mediaList.length > 1 && (
                                <div className="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar">
                                    {mediaList.map((m, idx) => (
                                        <button
                                            key={idx}
                                            type="button"
                                            onClick={() => setActiveMediaIndex(idx)}
                                            className={`relative w-14 h-14 rounded-xl overflow-hidden shrink-0 border-2 transition-all cursor-pointer ${
                                                activeMediaIndex === idx 
                                                    ? 'border-orange-500 scale-105 shadow-sm' 
                                                    : 'border-transparent opacity-60 hover:opacity-100'
                                            }`}
                                        >
                                            <img src={m.url} alt="" className="w-full h-full object-cover" />
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="aspect-video w-full rounded-2xl bg-gray-50 dark:bg-[#1A2338] border border-dashed border-gray-200 dark:border-gray-800 flex flex-col items-center justify-center text-gray-400 gap-2">
                            <Camera className="w-8 h-8 opacity-40" />
                            <span className="text-xs font-semibold">No media attached to this report</span>
                        </div>
                    )}

                    {/* Animal Attributes Grid */}
                    <div className="bg-gray-50/80 dark:bg-[#1A2338]/60 rounded-2xl p-4 border border-gray-100 dark:border-gray-800 space-y-3">
                        <div className="flex items-center gap-2 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            <PawPrint className="w-3.5 h-3.5 text-orange-500" />
                            <span>Animal Specifications</span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="bg-white dark:bg-[#151C2C] p-3 rounded-xl border border-gray-100 dark:border-gray-800">
                                <span className="text-[10px] text-gray-400 block font-bold uppercase">Species</span>
                                <span className="text-xs font-black text-gray-800 dark:text-gray-100 mt-0.5 block truncate">
                                    {animalType}
                                </span>
                            </div>

                            <div className="bg-white dark:bg-[#151C2C] p-3 rounded-xl border border-gray-100 dark:border-gray-800">
                                <span className="text-[10px] text-gray-400 block font-bold uppercase">Breed</span>
                                <span className="text-xs font-black text-gray-800 dark:text-gray-100 mt-0.5 block truncate">
                                    {animalBreed}
                                </span>
                            </div>

                            <div className="bg-white dark:bg-[#151C2C] p-3 rounded-xl border border-gray-100 dark:border-gray-800">
                                <span className="text-[10px] text-gray-400 block font-bold uppercase">Color</span>
                                <span className="text-xs font-black text-gray-800 dark:text-gray-100 mt-0.5 block truncate">
                                    {animalColor}
                                </span>
                            </div>

                            <div className="bg-white dark:bg-[#151C2C] p-3 rounded-xl border border-gray-100 dark:border-gray-800">
                                <span className="text-[10px] text-gray-400 block font-bold uppercase">Gender / Health</span>
                                <span className="text-xs font-black text-gray-800 dark:text-gray-100 mt-0.5 block truncate">
                                    {gender} • {healthStatus}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Behavioral & Risk Flags (If present) */}
                    {(riskLevel || isAggressive || hasBite || hasInjury) && (
                        <div className="bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/50 rounded-2xl p-4 space-y-2">
                            <div className="flex items-center gap-2 text-xs font-black text-amber-900 dark:text-amber-300">
                                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                                <span>Behavior & Risk Assessment</span>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                                {riskLevel && (
                                    <span className="px-2.5 py-1 bg-amber-200/60 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200 rounded-lg text-[10px] font-extrabold uppercase">
                                        Risk Level: {riskLevel}
                                    </span>
                                )}
                                {hasBite && (
                                    <span className="px-2.5 py-1 bg-rose-600 text-white rounded-lg text-[10px] font-black uppercase">
                                        ⚠️ Actual Bite Reported
                                    </span>
                                )}
                                {isAggressive && (
                                    <span className="px-2.5 py-1 bg-rose-100 dark:bg-rose-900/40 text-rose-800 dark:text-rose-200 rounded-lg text-[10px] font-black uppercase">
                                        Aggressive Temperament
                                    </span>
                                )}
                                {hasInjury && (
                                    <span className="px-2.5 py-1 bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-200 rounded-lg text-[10px] font-black uppercase">
                                        Physical Injury Noted
                                    </span>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Location Information */}
                    <div className="bg-gray-50/80 dark:bg-[#1A2338]/60 rounded-2xl p-4 border border-gray-100 dark:border-gray-800 space-y-2.5">
                        <div className="flex items-center gap-2 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            <MapPin className="w-3.5 h-3.5 text-orange-500" />
                            <span>Incident Location</span>
                        </div>

                        <div className="space-y-1 text-xs">
                            <p className="font-bold text-gray-900 dark:text-gray-100 leading-snug">
                                {streetAddress}
                            </p>
                            {landmark && (
                                <p className="text-gray-600 dark:text-gray-300 flex items-center gap-1.5 font-medium">
                                    <span className="text-[10px] font-bold text-gray-400 uppercase">Landmark:</span>
                                    <span>{landmark}</span>
                                </p>
                            )}
                            {(subdivision || barangay) && (
                                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                                    {[subdivision, barangay].filter(Boolean).join(' • ')}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Reporter Information */}
                    <div className="bg-gray-50/80 dark:bg-[#1A2338]/60 rounded-2xl p-4 border border-gray-100 dark:border-gray-800 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                            <img 
                                src={reporterPhoto} 
                                alt={reporterName} 
                                className="w-10 h-10 rounded-full object-cover border-2 border-white dark:border-gray-700 shadow-xs shrink-0"
                            />
                            <div className="min-w-0">
                                <span className="text-[10px] font-bold text-gray-400 uppercase block">Reported By</span>
                                <h4 className="font-extrabold text-xs text-gray-900 dark:text-white truncate">
                                    {reporterName}
                                </h4>
                            </div>
                        </div>

                        <span className="px-2.5 py-1 bg-white dark:bg-[#151C2C] rounded-xl text-[10px] font-bold text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 shrink-0">
                            Community Reporter
                        </span>
                    </div>

                    {/* Detailed Description */}
                    <div className="space-y-1.5">
                        <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider block">
                            Reporter's Narrative & Notes
                        </span>
                        <div className="p-3.5 bg-gray-50 dark:bg-[#1A2338] rounded-2xl border border-gray-100 dark:border-gray-800 text-xs text-gray-700 dark:text-gray-200 leading-relaxed font-medium">
                            {description}
                        </div>
                    </div>
                </div>

                {/* Modal Footer Actions */}
                <div className="p-4 sm:p-5 bg-gray-50 dark:bg-[#1A2338] border-t border-gray-100 dark:border-gray-800 flex items-center justify-between gap-3 shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2.5 bg-gray-200 hover:bg-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 font-bold text-xs rounded-xl transition-all cursor-pointer active:scale-95"
                    >
                        Back to Chat
                    </button>

                    {onNavigateToReport && effectiveId > 0 && (
                        <button
                            type="button"
                            onClick={() => onNavigateToReport(effectiveId)}
                            className="px-5 py-2.5 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white font-extrabold text-xs rounded-xl shadow-md transition-all cursor-pointer active:scale-95 flex items-center gap-2"
                        >
                            <span>Open Full Report Page</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            </div>

            {/* Media Lightbox */}
            {lightboxIndex !== null && mediaList.length > 0 && (
                <MediaLightbox
                    items={mediaList}
                    startIndex={lightboxIndex}
                    title={`${reportCode} Photo Evidence`}
                    onClose={() => setLightboxIndex(null)}
                />
            )}
        </div>
    );
};

export default CaseDetailsModal;
