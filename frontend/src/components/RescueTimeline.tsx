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

const statusConfig: Record<number, { label: string, color: string, icon: React.ReactNode }> = {
    1: {
        label: 'Reported',
        color: 'orange',
        icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
    },
    2: {
        label: 'Verified',
        color: 'blue',
        icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
    },
    3: {
        label: 'Rejected',
        color: 'rose',
        icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
    },
    4: {
        label: 'Escalated',
        color: 'purple',
        icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
    },
    13: {
        label: 'Approved',
        color: 'teal',
        icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" /></svg>
    },
    5: {
        label: 'Dispatched',
        color: 'amber',
        icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
    },
    6: {
        label: 'Picked Up',
        color: 'cyan',
        icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
    },
    7: {
        label: 'Under Observation',
        color: 'indigo',
        icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
    },
    8: {
        label: 'Impounded',
        color: 'fuchsia',
        icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
    },
    9: {
        label: 'Claimed by Owner',
        color: 'emerald',
        icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
    },
    10: {
        label: 'Released',
        color: 'sky',
        icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" /></svg>
    },
    11: {
        label: 'Resolved',
        color: 'green',
        icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
    },
    12: {
        label: 'Deceased',
        color: 'slate',
        icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
    }
};

const rescueStatusLabels: Record<number, string> = {
    1: 'Pending Approval',
    2: 'Approved',
    3: 'Rejected',
    4: 'Operation Started',
    5: 'Dispatched',
    6: 'Resolved'
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

    // Deduplicate consecutive identical status updates so only single stage updates appear
    const cleanHistory = (history || []).filter((entry, idx, arr) => {
        if (idx === 0) return true;
        const prev = arr[idx - 1];
        const sameStatus = entry.report_status_id === prev.report_status_id;
        const hasNewMedia = entry.media && entry.media.length > 0 && (!prev.media || prev.media.length === 0);
        return !sameStatus || hasNewMedia;
    });

    const filteredHistory = filter === 'all'
        ? cleanHistory
        : cleanHistory.filter(entry => entry.report_status_id === filter);

    const uniqueStages = Array.from(new Set(cleanHistory.map(e => e.report_status_id)));

    return (
        <div className="space-y-8">
            {/* Timeline Filter */}
            <div className="flex items-center justify-between bg-white/50 backdrop-blur-md p-4 rounded-3xl border border-white/20 shadow-sm">
                <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-xl ${filter === 'all' ? 'bg-[#F97316]/10 text-[#F97316]' : `bg-${statusConfig[filter]?.color || 'orange'}-50 text-${statusConfig[filter]?.color || 'orange'}-600`} flex items-center justify-center transition-all`}>
                        {filter === 'all' ? (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
                        ) : (
                            statusConfig[filter]?.icon || <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
                        )}
                    </div>
                    <span className="text-[10px] font-black text-gray-900 uppercase tracking-widest">Filter by Stage</span>
                </div>
                <select
                    value={filter}
                    onChange={(e) => setFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                    className="bg-transparent text-[10px] font-black text-[#F97316] uppercase tracking-widest outline-none cursor-pointer"
                >
                    <option value="all">All Updates</option>
                    {uniqueStages.map(stageId => (
                        <option key={stageId} value={stageId}>{statusConfig[stageId]?.label || `Stage ${stageId}`}</option>
                    ))}
                </select>
            </div>

            {/* Timeline List */}
            <div className="relative pl-8 space-y-12">
                {/* Vertical Line */}
                <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-gradient-to-b from-[#F97316] to-gray-100" />

                {filteredHistory.length === 0 ? (
                    <div className="text-center py-12 opacity-50">
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">No updates found for this stage</p>
                    </div>
                ) : (
                    filteredHistory.map((entry, index) => {
                        const config = statusConfig[entry.report_status_id] || statusConfig[1];
                        const displayLabel = statusConfig[entry.report_status_id]
                            ? statusConfig[entry.report_status_id].label
                            : (entry.rescue_status_id ? rescueStatusLabels[entry.rescue_status_id] : config.label);
                        
                        return (
                            <div key={entry.history_id} className="relative group animate-in slide-in-from-left-4 duration-500" style={{ animationDelay: `${index * 100}ms` }}>
                                {/* Timeline Node */}
                                <div className={`absolute -left-[31px] top-0 w-8 h-8 rounded-2xl bg-white border-4 border-${config.color}-50 flex items-center justify-center text-${config.color}-600 shadow-sm z-10 transition-transform group-hover:scale-110`}>
                                    {config.icon}
                                </div>

                                {/* Content Card */}
                                <div className="bg-white rounded-3xl border border-gray-50 shadow-sm hover:shadow-md transition-all overflow-hidden">
                                    <div className="p-6">
                                        <div className="flex justify-between items-start mb-4">
                                            <div>
                                                <span className={`text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full bg-${config.color}-50 text-${config.color}-600 border border-${config.color}-100`}>
                                                    {displayLabel}
                                                </span>
                                                {entry.report_status_id === currentStatusId && index === 0 && (
                                                    <span className="ml-2 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md bg-green-500 text-white shadow-sm">
                                                        Active
                                                    </span>
                                                )}
                                                <h4 className="text-sm font-black text-gray-900 mt-2 uppercase tracking-tight">
                                                    {entry.remarks}
                                                </h4>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                                                    {new Date(entry.created_at).toLocaleDateString()}
                                                </p>
                                                <p className="text-[8px] font-bold text-gray-300 uppercase tracking-widest">
                                                    {new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </p>
                                            </div>
                                        </div>

                                        {(() => {
                                            const handler = resolveHandlerName(entry);
                                            return (
                                                <div className="flex items-center gap-3 mb-6 p-3 bg-gray-50/50 rounded-2xl border border-gray-50/50">
                                                    {entry.updater_photo ? (
                                                        <img
                                                            src={getProfilePicture(entry.updater_photo)}
                                                            className="w-6 h-6 rounded-lg object-cover border border-gray-100 shadow-sm"
                                                            alt={handler}
                                                            onError={(e) => { e.currentTarget.src = DEFAULT_AVATAR; }}
                                                        />
                                                    ) : (
                                                        <div className="w-6 h-6 rounded-lg bg-orange-100 flex items-center justify-center text-[10px] font-black text-orange-600 border border-orange-200 shadow-sm">
                                                            {handler.charAt(0).toUpperCase()}
                                                        </div>
                                                    )}
                                                    <span className="text-[10px] font-black text-gray-700 uppercase tracking-widest">
                                                        Handled by {handler}
                                                    </span>
                                                </div>
                                            );
                                        })()}

                                        {/* Endorsement Letter table details */}
                                        {entry.report_status_id === 4 && endorsementLetter && (
                                             <div className="mb-6 p-5 bg-orange-50/40 rounded-2xl border border-orange-100/60 space-y-3">
                                                 <p className="text-[10px] font-black text-orange-600 uppercase tracking-widest">Official Endorsement Sighting</p>
                                                 <p className="text-sm text-gray-750 leading-relaxed font-semibold italic">
                                                     "{endorsementLetter.letter_content}"
                                                 </p>
                                                 {endorsementLetter.file_url && (
                                                     <a
                                                         href={endorsementLetter.file_url}
                                                         target="_blank"
                                                         rel="noopener noreferrer"
                                                         className="flex items-center gap-4 p-4 bg-white hover:bg-orange-50/50 rounded-xl border border-orange-100/60 transition-all group/letter"
                                                     >
                                                         <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center text-orange-600 group-hover/letter:bg-orange-200 transition-colors">
                                                             <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                             </svg>
                                                         </div>
                                                         <div className="flex-1 min-w-0">
                                                             <p className="text-[9px] font-black text-orange-600 uppercase tracking-widest">Official Endorsement Letter</p>
                                                             <p className="text-[11px] font-bold text-gray-700 truncate">{endorsementLetter.file_url.split('/').pop()}</p>
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
