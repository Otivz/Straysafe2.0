import React, { useState } from 'react';

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
}

const statusConfig: Record<number, { label: string, color: string, icon: React.ReactNode }> = {
    1: {
        label: 'Reported',
        color: 'orange',
        icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
    },
    2: {
        label: 'Verified',
        color: 'blue',
        icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
    },
    4: {
        label: 'Escalated',
        color: 'purple',
        icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
    },
    13: {
        label: 'Approved',
        color: 'orange',
        icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
    },
    5: {
        label: 'Dispatched',
        color: 'indigo',
        icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
    },
    6: {
        label: 'Picked Up',
        color: 'amber',
        icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
    },
    11: {
        label: 'Resolved',
        color: 'green',
        icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
    },
    10: {
        label: 'Released',
        color: 'emerald',
        icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
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

const RescueTimeline: React.FC<RescueTimelineProps> = ({ history, currentStatusId }) => {
    const [filter, setFilter] = useState<number | 'all'>('all');
    const [activeMedia, setActiveMedia] = useState<Media | null>(null);

    const filteredHistory = filter === 'all'
        ? history
        : history.filter(entry => entry.report_status_id === filter);

    const uniqueStages = Array.from(new Set(history.map(e => e.report_status_id)));

    return (
        <div className="space-y-8">
            {/* Timeline Filter */}
            <div className="flex items-center justify-between bg-white/50 backdrop-blur-md p-4 rounded-3xl border border-white/20 shadow-sm">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-[#F97316]/10 flex items-center justify-center text-[#F97316]">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
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
                        const displayLabel = entry.rescue_status_id ? rescueStatusLabels[entry.rescue_status_id] : config.label;
                        
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

                                        <div className="flex items-center gap-3 mb-6 p-3 bg-gray-50/50 rounded-2xl border border-gray-50/50">
                                            {entry.updater_photo ? (
                                                <img
                                                    src={entry.updater_photo}
                                                    className="w-6 h-6 rounded-lg object-cover border border-gray-100 shadow-sm"
                                                    alt={entry.updater_name}
                                                />
                                            ) : (
                                                <div className="w-6 h-6 rounded-lg bg-white flex items-center justify-center text-[10px] font-black text-gray-400 border border-gray-100 shadow-sm">
                                                    {entry.updater_name?.charAt(0) || 'S'}
                                                </div>
                                            )}
                                            <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Updated by {entry.updater_name || 'System'}</span>
                                        </div>

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
            ` }} />
        </div>
    );
};

export default RescueTimeline;
