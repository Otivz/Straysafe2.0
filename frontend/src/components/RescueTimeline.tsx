import React, { useState } from 'react';
import { DEFAULT_AVATAR, getProfilePicture } from '../utils/avatar';

interface Media {
    media_id: number;
    file_url: string;
    media_type: string;
    uploaded_at: string;
}

interface TimelineEntry {
    history_id: number;
    report_status_id: number;
    rescue_status_id?: number;
    remarks: string;
    created_at: string;
    updater_name?: string;
    updater_photo?: string;
    media?: Media[];
}

interface RescueTimelineProps {
    history: TimelineEntry[];
    currentStatusId: number;
    assignedLeaderName?: string;
    reporterName?: string;
    endorsementLetter?: {
        letter_id: number;
        report_id: number;
        leader_id: number;
        letter_content: string;
        file_url?: string;
        status_id?: number;
        issued_at: string;
    } | null;
}

interface StatusConfigItem {
    label: string;
    badgeStyle: string;
    cardBorder: string;
    nodeBg: string;
    nodeBorder: string;
    nodeText: string;
    icon: React.ReactNode;
}

const statusConfig: Record<number, StatusConfigItem> = {
    1: {
        label: 'Reported',
        badgeStyle: 'bg-orange-50 text-orange-700 border-orange-200',
        cardBorder: 'border-orange-100/60',
        nodeBg: 'bg-orange-50',
        nodeBorder: 'border-orange-200',
        nodeText: 'text-orange-600',
        icon: <span>📝</span>
    },
    2: {
        label: 'Verified',
        badgeStyle: 'bg-blue-50 text-blue-700 border-blue-200',
        cardBorder: 'border-blue-100/60',
        nodeBg: 'bg-blue-50',
        nodeBorder: 'border-blue-200',
        nodeText: 'text-blue-600',
        icon: <span>🔍</span>
    },
    3: {
        label: 'Rejected',
        badgeStyle: 'bg-rose-50 text-rose-700 border-rose-200',
        cardBorder: 'border-rose-100/60',
        nodeBg: 'bg-rose-50',
        nodeBorder: 'border-rose-200',
        nodeText: 'text-rose-600',
        icon: <span>🚫</span>
    },
    4: {
        label: 'Escalated to Barangay',
        badgeStyle: 'bg-purple-50 text-purple-700 border-purple-200',
        cardBorder: 'border-purple-100/60',
        nodeBg: 'bg-purple-50',
        nodeBorder: 'border-purple-200',
        nodeText: 'text-purple-600',
        icon: <span>📨</span>
    },
    13: {
        label: 'Rescue Approved',
        badgeStyle: 'bg-teal-50 text-teal-700 border-teal-200',
        cardBorder: 'border-teal-100/60',
        nodeBg: 'bg-teal-50',
        nodeBorder: 'border-teal-200',
        nodeText: 'text-teal-600',
        icon: <span>🛡️</span>
    },
    5: {
        label: 'Team Dispatched',
        badgeStyle: 'bg-amber-50 text-amber-700 border-amber-200',
        cardBorder: 'border-amber-100/60',
        nodeBg: 'bg-amber-50',
        nodeBorder: 'border-amber-200',
        nodeText: 'text-amber-600',
        icon: <span>🚨</span>
    },
    6: {
        label: 'Animal Picked Up',
        badgeStyle: 'bg-cyan-50 text-cyan-700 border-cyan-200',
        cardBorder: 'border-cyan-100/60',
        nodeBg: 'bg-cyan-50',
        nodeBorder: 'border-cyan-200',
        nodeText: 'text-cyan-600',
        icon: <span>🐾</span>
    },
    7: {
        label: 'Under Observation',
        badgeStyle: 'bg-indigo-50 text-indigo-700 border-indigo-200',
        cardBorder: 'border-indigo-100/60',
        nodeBg: 'bg-indigo-50',
        nodeBorder: 'border-indigo-200',
        nodeText: 'text-indigo-600',
        icon: <span>🏥</span>
    },
    8: {
        label: 'Secured in Facility',
        badgeStyle: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        cardBorder: 'border-emerald-200 shadow-emerald-500/10',
        nodeBg: 'bg-emerald-50',
        nodeBorder: 'border-emerald-200',
        nodeText: 'text-emerald-700',
        icon: <span>🏢</span>
    },
    9: {
        label: 'Claimed by Owner',
        badgeStyle: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        cardBorder: 'border-emerald-100/60',
        nodeBg: 'bg-emerald-50',
        nodeBorder: 'border-emerald-200',
        nodeText: 'text-emerald-600',
        icon: <span>🏠</span>
    },
    10: {
        label: 'Safely Released',
        badgeStyle: 'bg-sky-50 text-sky-700 border-sky-200',
        cardBorder: 'border-sky-100/60',
        nodeBg: 'bg-sky-50',
        nodeBorder: 'border-sky-200',
        nodeText: 'text-sky-600',
        icon: <span>🕊️</span>
    },
    11: {
        label: 'Resolved',
        badgeStyle: 'bg-green-50 text-green-700 border-green-200',
        cardBorder: 'border-green-100/60',
        nodeBg: 'bg-green-50',
        nodeBorder: 'border-green-200',
        nodeText: 'text-green-600',
        icon: <span>✅</span>
    },
    12: {
        label: 'Resolved (Deceased)',
        badgeStyle: 'bg-slate-100 text-slate-700 border-slate-200',
        cardBorder: 'border-slate-200/60',
        nodeBg: 'bg-slate-100',
        nodeBorder: 'border-slate-200',
        nodeText: 'text-slate-600',
        icon: <span>🕯️</span>
    },
    14: {
        label: 'False Alarm',
        badgeStyle: 'bg-rose-50 text-rose-700 border-rose-200',
        cardBorder: 'border-rose-100/60',
        nodeBg: 'bg-rose-50',
        nodeBorder: 'border-rose-200',
        nodeText: 'text-rose-600',
        icon: <span>⚠️</span>
    },
    15: {
        label: 'Disputed',
        badgeStyle: 'bg-yellow-50 text-yellow-800 border-yellow-200',
        cardBorder: 'border-yellow-100/60',
        nodeBg: 'bg-yellow-50',
        nodeBorder: 'border-yellow-200',
        nodeText: 'text-yellow-600',
        icon: <span>⚖️</span>
    },
    16: {
        label: 'Under Investigation',
        badgeStyle: 'bg-violet-50 text-violet-700 border-violet-200',
        cardBorder: 'border-violet-100/60',
        nodeBg: 'bg-violet-50',
        nodeBorder: 'border-violet-200',
        nodeText: 'text-violet-600',
        icon: <span>🔎</span>
    }
};

const RescueTimeline: React.FC<RescueTimelineProps> = ({ 
    history, 
    currentStatusId, 
    assignedLeaderName,
    reporterName,
    endorsementLetter 
}) => {
    const [filter, setFilter] = useState<number | 'all'>('all');
    const [activeMedia, setActiveMedia] = useState<Media | null>(null);

    const resolveHandlerName = (entry: TimelineEntry) => {
        if (entry.updater_name && entry.updater_name.trim() && entry.updater_name.toLowerCase() !== 'system') {
            return entry.updater_name;
        }
        if (assignedLeaderName) {
            return `${assignedLeaderName} (Subdivision Leader)`;
        }
        if (endorsementLetter?.leader_id) {
            return 'Subdivision Leader';
        }
        if (entry.report_status_id === 1) {
            return reporterName || 'Incident Reporter';
        }
        return 'Subdivision Leader';
    };

    const formatCleanRemarks = (rawRemarks: string) => {
        if (!rawRemarks) return '';
        const parts = rawRemarks.split('|').map(p => p.trim()).filter(Boolean);
        const uniqueParts: string[] = [];
        for (const p of parts) {
            const isSubset = uniqueParts.some(existing => existing.toLowerCase().includes(p.toLowerCase()) || p.toLowerCase().includes(existing.toLowerCase()));
            if (!isSubset) {
                uniqueParts.push(p);
            } else {
                const idx = uniqueParts.findIndex(existing => existing.toLowerCase().includes(p.toLowerCase()) || p.toLowerCase().includes(existing.toLowerCase()));
                if (idx !== -1 && p.length > uniqueParts[idx].length) {
                    uniqueParts[idx] = p;
                }
            }
        }
        return uniqueParts.join(' • ');
    };

    // Deduplicate consecutive identical status updates unless remarks changed (e.g. facility relocation) or has new media
    const cleanHistory = (history || []).filter((entry, idx, arr) => {
        if (idx === 0) return true;
        const prev = arr[idx - 1];
        const sameStatus = entry.report_status_id === prev.report_status_id;
        const remarksChanged = (entry.remarks || '').trim().toLowerCase() !== (prev.remarks || '').trim().toLowerCase();
        const hasNewMedia = entry.media && entry.media.length > 0 && (!prev.media || prev.media.length === 0);
        return !sameStatus || remarksChanged || hasNewMedia;
    });

    const filteredHistory = filter === 'all'
        ? cleanHistory
        : cleanHistory.filter(entry => entry.report_status_id === filter);

    const uniqueStages = Array.from(new Set(cleanHistory.map(e => e.report_status_id)));

    return (
        <div className="space-y-8">
            {/* Timeline Filter */}
            <div className="flex items-center justify-between bg-white/50 dark:bg-[#1E2738]/60 backdrop-blur-md p-4 rounded-3xl border border-white/20 dark:border-gray-750 shadow-sm">
                <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-xl ${filter === 'all' ? 'bg-[#F97316]/10 text-[#F97316]' : (statusConfig[filter]?.nodeBg || 'bg-orange-50')} flex items-center justify-center transition-all`}>
                        {filter === 'all' ? (
                            <svg className="w-4 h-4 text-[#F97316]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
                        ) : (
                            statusConfig[filter]?.icon || <span>📌</span>
                        )}
                    </div>
                    <span className="text-[10px] font-black text-gray-900 dark:text-white uppercase tracking-widest">Filter by Stage</span>
                </div>
                <select
                    value={filter}
                    onChange={(e) => setFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                    className="bg-transparent text-[10px] font-black text-[#F97316] uppercase tracking-widest outline-none cursor-pointer"
                >
                    <option value="all" className="dark:bg-[#151C2C] dark:text-white">All Updates</option>
                    {uniqueStages.map(stageId => (
                        <option key={stageId} value={stageId} className="dark:bg-[#151C2C] dark:text-white">{statusConfig[stageId]?.label || `Stage ${stageId}`}</option>
                    ))}
                </select>
            </div>

            {/* Timeline List */}
            <div className="relative pl-8 space-y-12">
                {/* Vertical Line */}
                <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-gradient-to-b from-[#F97316] to-gray-100 dark:to-gray-800" />

                {filteredHistory.length === 0 ? (
                    <div className="text-center py-12 opacity-50">
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-500">No updates found for this stage</p>
                    </div>
                ) : (
                    filteredHistory.map((entry, index) => {
                        const remarksLower = (entry.remarks || '').toLowerCase();
                        const isPureTransfer = remarksLower.includes('transferred to') || 
                                               remarksLower.includes('relocated to') || 
                                               remarksLower.includes('relocated from') ||
                                               remarksLower.includes('animal relocated') ||
                                               remarksLower.includes('facility relocation') ||
                                               remarksLower.startsWith('transferred') ||
                                               remarksLower.startsWith('relocated');

                        const config = isPureTransfer ? {
                            label: 'Facility Relocation',
                            badgeStyle: 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800',
                            cardBorder: 'border-purple-200 dark:border-purple-800/60 shadow-purple-500/10',
                            nodeBg: 'bg-purple-50 dark:bg-purple-950/50',
                            nodeBorder: 'border-purple-200 dark:border-purple-700',
                            nodeText: 'text-purple-600 dark:text-purple-300',
                            icon: <span>🚚</span>
                        } : (statusConfig[entry.report_status_id] || statusConfig[1]);

                        const displayLabel = config.label;
                        const displayRemarks = formatCleanRemarks(entry.remarks);
                        
                        return (
                            <div key={entry.history_id} className="relative group animate-in slide-in-from-left-4 duration-500" style={{ animationDelay: `${index * 100}ms` }}>
                                {/* Timeline Node */}
                                <div className={`absolute -left-[31px] top-0 w-8 h-8 rounded-2xl ${config.nodeBg} border-2 ${config.nodeBorder} flex items-center justify-center ${config.nodeText} shadow-sm z-10 transition-transform group-hover:scale-110`}>
                                    {config.icon}
                                </div>

                                {/* Content Card */}
                                <div className={`bg-white dark:bg-[#1E2738] rounded-3xl border ${config.cardBorder} dark:border-gray-700/80 shadow-sm hover:shadow-md transition-all overflow-hidden`}>
                                    <div className="p-6">
                                        <div className="flex justify-between items-start mb-4">
                                            <div>
                                                <span className={`text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full border ${config.badgeStyle}`}>
                                                    {displayLabel}
                                                </span>
                                                {entry.report_status_id === currentStatusId && index === 0 && (
                                                    <span className="ml-2 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md bg-green-500 text-white shadow-sm">
                                                        Active
                                                    </span>
                                                )}
                                                <h4 className="text-sm font-black text-gray-900 dark:text-white mt-2 uppercase tracking-tight">
                                                    {displayRemarks}
                                                </h4>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                                                    {new Date(entry.created_at).toLocaleDateString()}
                                                </p>
                                                <p className="text-[8px] font-bold text-gray-300 dark:text-gray-500 uppercase tracking-widest">
                                                    {new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </p>
                                            </div>
                                        </div>

                                        {(() => {
                                            const handler = resolveHandlerName(entry);
                                            return (
                                                <div className="flex items-center gap-3 mb-6 p-3 bg-gray-50/50 dark:bg-[#151C2C] rounded-2xl border border-gray-50/50 dark:border-gray-800">
                                                    {entry.updater_photo ? (
                                                        <img
                                                            src={getProfilePicture(entry.updater_photo)}
                                                            className="w-6 h-6 rounded-lg object-cover border border-gray-100 dark:border-gray-700 shadow-sm"
                                                            alt={handler}
                                                            onError={(e) => { e.currentTarget.src = DEFAULT_AVATAR; }}
                                                        />
                                                    ) : (
                                                        <div className="w-6 h-6 rounded-lg bg-orange-100 dark:bg-orange-950/50 flex items-center justify-center text-[10px] font-black text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-900/40 shadow-sm">
                                                            {handler.charAt(0).toUpperCase()}
                                                        </div>
                                                    )}
                                                    <span className="text-[10px] font-black text-gray-700 dark:text-gray-200 uppercase tracking-widest">
                                                        Handled by {handler}
                                                    </span>
                                                </div>
                                            );
                                        })()}

                                        {/* Endorsement Letter table details */}
                                        {entry.report_status_id === 4 && endorsementLetter && (
                                             <div className="mb-6 p-5 bg-orange-50/40 dark:bg-orange-950/20 rounded-2xl border border-orange-100/60 dark:border-orange-900/40 space-y-3">
                                                 <p className="text-[10px] font-black text-orange-600 dark:text-orange-400 uppercase tracking-widest">Official Endorsement Sighting</p>
                                                 <p className="text-sm text-gray-750 dark:text-gray-200 leading-relaxed font-semibold italic">
                                                     "{endorsementLetter.letter_content}"
                                                 </p>
                                                 {endorsementLetter.file_url && (
                                                     <a
                                                         href={endorsementLetter.file_url}
                                                         target="_blank"
                                                         rel="noopener noreferrer"
                                                         className="flex items-center gap-4 p-4 bg-white dark:bg-[#151C2C] hover:bg-orange-50/50 dark:hover:bg-orange-950/30 rounded-xl border border-orange-100/60 dark:border-orange-900/40 transition-all group/letter"
                                                     >
                                                         <div className="w-10 h-10 rounded-lg bg-orange-100 dark:bg-orange-950/50 flex items-center justify-center text-orange-600 dark:text-orange-400 group-hover/letter:bg-orange-200 dark:group-hover/letter:bg-orange-900/50 transition-colors">
                                                             <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                             </svg>
                                                         </div>
                                                         <div className="flex-1 min-w-0">
                                                             <p className="text-[9px] font-black text-orange-600 dark:text-orange-400 uppercase tracking-widest">Official Endorsement Letter</p>
                                                             <p className="text-[11px] font-bold text-gray-700 dark:text-gray-300 truncate">{endorsementLetter.file_url.split('/').pop()}</p>
                                                         </div>
                                                         <svg className="w-4 h-4 text-orange-400 group-hover/letter:text-orange-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                                         </svg>
                                                     </a>
                                                 )}
                                             </div>
                                         )}

                                        {/* Stage-Specific Media */}
                                        {entry.media && entry.media.length > 0 && (
                                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                                {entry.media.map(media => (
                                                    <div
                                                        key={media.media_id}
                                                        onClick={() => setActiveMedia(media)}
                                                        className="relative aspect-square rounded-2xl overflow-hidden cursor-pointer group/media border border-gray-100 shadow-sm"
                                                    >
                                                        {media.media_type === 'Video' ? (
                                                            <div className="w-full h-full bg-black flex items-center justify-center">
                                                                <svg className="w-8 h-8 text-white/50" fill="currentColor" viewBox="0 0 20 20"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" /></svg>
                                                            </div>
                                                        ) : (
                                                            <img src={media.file_url} className="w-full h-full object-cover transition-transform group-hover/media:scale-110" alt="Update media" />
                                                        )}
                                                        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/media:opacity-100 transition-opacity flex items-center justify-center">
                                                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Media Viewer Modal */}
            {activeMedia && (
                <div className="fixed inset-0 z-[1000] bg-black/95 backdrop-blur-2xl flex items-center justify-center p-4" onClick={() => setActiveMedia(null)}>
                    <button className="absolute top-8 right-8 text-white/50 hover:text-white transition-all p-4 rounded-full hover:bg-white/10">
                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                    {activeMedia.media_type === 'Video' ? (
                        <video src={activeMedia.file_url} controls autoPlay className="max-w-full max-h-full rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()} />
                    ) : (
                        <img src={activeMedia.file_url} className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()} alt="Full view" />
                    )}
                </div>
            )}

            {/* Custom Styles for Tailwind colors if they don't exist dynamically */}
            <style dangerouslySetInnerHTML={{
                __html: `
                .border-orange-50 { border-color: rgba(249, 115, 22, 0.1); }
                .text-orange-600 { color: #ea580c; }
                .bg-orange-50 { background-color: rgba(249, 115, 22, 0.05); }
                .border-orange-100 { border-color: rgba(249, 115, 22, 0.1); }

                .border-blue-50 { border-color: rgba(59, 130, 246, 0.1); }
                .text-blue-600 { color: #2563eb; }
                .bg-blue-50 { background-color: rgba(59, 130, 246, 0.05); }
                .border-blue-100 { border-color: rgba(59, 130, 246, 0.1); }

                .border-indigo-50 { border-color: rgba(79, 70, 229, 0.1); }
                .text-indigo-600 { color: #4f46e5; }
                .bg-indigo-50 { background-color: rgba(79, 70, 229, 0.05); }
                .border-indigo-100 { border-color: rgba(79, 70, 229, 0.1); }

                .border-amber-50 { border-color: rgba(245, 158, 11, 0.1); }
                .text-amber-600 { color: #d97706; }
                .bg-amber-50 { background-color: rgba(245, 158, 11, 0.05); }
                .border-amber-100 { border-color: rgba(245, 158, 11, 0.1); }

                .border-purple-50 { border-color: rgba(147, 51, 234, 0.1); }
                .text-purple-600 { color: #9333ea; }
                .bg-purple-50 { background-color: rgba(147, 51, 234, 0.05); }
                .border-purple-100 { border-color: rgba(147, 51, 234, 0.1); }

                .border-rose-50 { border-color: rgba(225, 29, 72, 0.1); }
                .text-rose-600 { color: #e11d48; }
                .bg-rose-50 { background-color: rgba(225, 29, 72, 0.05); }
                .border-rose-100 { border-color: rgba(225, 29, 72, 0.1); }

                .border-green-50 { border-color: rgba(22, 163, 74, 0.1); }
                .text-green-600 { color: #16a34a; }
                .bg-green-50 { background-color: rgba(22, 163, 74, 0.05); }
                .border-green-100 { border-color: rgba(22, 163, 74, 0.1); }

                .border-emerald-50 { border-color: rgba(16, 185, 129, 0.1); }
                .text-emerald-600 { color: #059669; }
                .bg-emerald-50 { background-color: rgba(16, 185, 129, 0.05); }
                .border-emerald-100 { border-color: rgba(16, 185, 129, 0.1); }

                .border-teal-50 { border-color: rgba(20, 184, 166, 0.1); }
                .text-teal-600 { color: #0d9488; }
                .bg-teal-50 { background-color: rgba(20, 184, 166, 0.05); }
                .border-teal-100 { border-color: rgba(20, 184, 166, 0.1); }

                .border-cyan-50 { border-color: rgba(6, 182, 212, 0.1); }
                .text-cyan-600 { color: #0891b2; }
                .bg-cyan-50 { background-color: rgba(6, 182, 212, 0.05); }
                .border-cyan-100 { border-color: rgba(6, 182, 212, 0.1); }

                .border-fuchsia-50 { border-color: rgba(217, 70, 239, 0.1); }
                .text-fuchsia-600 { color: #c026d3; }
                .bg-fuchsia-50 { background-color: rgba(217, 70, 239, 0.05); }
                .border-fuchsia-100 { border-color: rgba(217, 70, 239, 0.1); }

                .border-sky-50 { border-color: rgba(14, 165, 233, 0.1); }
                .text-sky-600 { color: #0284c7; }
                .bg-sky-50 { background-color: rgba(14, 165, 233, 0.05); }
                .border-sky-100 { border-color: rgba(14, 165, 233, 0.1); }

                .border-slate-50 { border-color: rgba(100, 116, 139, 0.1); }
                .text-slate-600 { color: #475569; }
                .bg-slate-50 { background-color: rgba(100, 116, 139, 0.05); }
                .border-slate-100 { border-color: rgba(100, 116, 139, 0.1); }
            ` }} />
        </div>
    );
};

export default RescueTimeline;
