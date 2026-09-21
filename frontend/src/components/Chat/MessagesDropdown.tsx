import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DEFAULT_AVATAR, getProfilePicture } from '../../utils/avatar';
import { generateMemorableTitle } from '../../utils/chatUtils';
import type { ChatThreadSummary } from '../../utils/useUnreadMessageCount';

interface MessagesDropdownProps {
    isOpen: boolean;
    onClose: () => void;
    threads: ChatThreadSummary[];
    loading?: boolean;
    onRefresh?: () => void;
    onSelectThread?: (thread: ChatThreadSummary) => void;
    currentRole?: 'citizen' | 'subd' | 'brgy' | 'admin';
}

const formatTime = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays === 1) return '1 day ago';
        if (diffDays < 7) return `${diffDays} days ago`;
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
        return '';
    }
};

export default function MessagesDropdown({
    isOpen,
    onClose,
    threads = [],
    loading = false,
    onRefresh,
    onSelectThread,
    currentRole = 'citizen'
}: MessagesDropdownProps) {
    const navigate = useNavigate();
    const [filterTab, setFilterTab] = useState<'all' | 'matches' | 'reports'>('all');
    const [searchTerm, setSearchTerm] = useState('');

    if (!isOpen) return null;

    const filteredThreads = threads.filter(t => {
        if (filterTab === 'reports' && t.thread_mode !== 'report') return false;
        if (filterTab === 'matches' && t.thread_mode !== 'match') return false;

        if (!searchTerm.trim()) return true;
        const q = searchTerm.toLowerCase();
        const titleMatch = (t.title || '').toLowerCase().includes(q);
        const counterpartMatch = (t.counterpart?.name || '').toLowerCase().includes(q);
        const petMatch = (t.matched_pet?.pet_name || '').toLowerCase().includes(q);
        const reportMatch = t.report_id ? `report #${t.report_id}`.includes(q) : false;
        const lastMsgMatch = (t.last_message?.text || '').toLowerCase().includes(q);

        return titleMatch || counterpartMatch || petMatch || reportMatch || lastMsgMatch;
    }).sort((a, b) => {
        const timeA = new Date(a.last_message?.sent_at || a.updated_at || a.created_at).getTime();
        const timeB = new Date(b.last_message?.sent_at || b.updated_at || b.created_at).getTime();
        return timeB - timeA;
    });

    const totalUnread = threads.reduce((acc, t) => acc + (t.unread_count || 0), 0);

    const handleThreadClick = (thread: ChatThreadSummary) => {
        if (onSelectThread) {
            onSelectThread(thread);
            onClose();
            return;
        }

        onClose();
        if (currentRole === 'subd') {
            navigate('/subd/messages');
        } else if (currentRole === 'brgy') {
            navigate('/brgy/messages');
        } else if (thread.thread_mode === 'match' && thread.report_id) {
            navigate(`/resident/reports/${thread.report_id}/match-review?openChat=true`);
        } else if (thread.report_id) {
            navigate(`/resident/reports/${thread.report_id}?openChat=true`);
        }
    };

    return (
        <div className="absolute right-0 sm:-right-8 md:right-0 mt-3 w-[22rem] sm:w-[25rem] bg-white dark:bg-[#151C2C] rounded-2xl shadow-2xl border border-gray-100/90 dark:border-gray-800 overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-200">
            {/* Panel Header */}
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gradient-to-r from-orange-50/40 via-white to-white dark:from-[#1A2338] dark:via-[#151C2C] dark:to-[#151C2C]">
                <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-orange-100/80 dark:bg-orange-950/50 text-[#F97316] dark:text-orange-400 flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                    </div>
                    <div>
                        <h3 className="text-sm font-black text-gray-900 dark:text-white tracking-tight leading-none">Case Messages</h3>
                        <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-400 mt-1">
                            {totalUnread > 0 ? `${totalUnread} unread message${totalUnread > 1 ? 's' : ''}` : 'All caught up!'}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-1.5">
                    {onRefresh && (
                        <button
                            onClick={onRefresh}
                            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors cursor-pointer"
                            title="Refresh messages"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                        </button>
                    )}
                </div>
            </div>

            {/* Filter Tabs */}
            <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-[#0E131F] flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setFilterTab('all')}
                        className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                            filterTab === 'all'
                                ? 'bg-white dark:bg-[#1E2738] text-[#F97316] dark:text-orange-400 shadow-xs border border-orange-100/60 dark:border-orange-500/30 font-black'
                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                        }`}
                    >
                        All ({threads.length})
                    </button>
                    <button
                        onClick={() => setFilterTab('matches')}
                        className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                            filterTab === 'matches'
                                ? 'bg-white dark:bg-[#1E2738] text-[#F97316] dark:text-orange-400 shadow-xs border border-orange-100/60 dark:border-orange-500/30 font-black'
                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                        }`}
                    >
                        Matches ({threads.filter(t => t.thread_mode === 'match').length})
                    </button>
                    <button
                        onClick={() => setFilterTab('reports')}
                        className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                            filterTab === 'reports'
                                ? 'bg-white dark:bg-[#1E2738] text-blue-600 dark:text-blue-400 shadow-xs border border-blue-100/60 dark:border-blue-500/30 font-black'
                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                        }`}
                    >
                        Reports ({threads.filter(t => t.thread_mode === 'report').length})
                    </button>
                </div>

                {/* Mini Search Trigger */}
                <div className="relative">
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search..."
                        className="w-24 focus:w-32 transition-all px-2 py-0.5 text-[11px] bg-white dark:bg-[#1A2338] border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 rounded-lg focus:outline-hidden focus:border-[#F97316]"
                    />
                </div>
            </div>

            {/* Scrollable Messages List */}
            <div className="max-h-[22rem] overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
                {loading && threads.length === 0 ? (
                    <div className="py-12 flex flex-col items-center justify-center text-gray-400 dark:text-gray-500">
                        <div className="w-7 h-7 border-2 border-[#F97316] border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-xs font-medium mt-3 text-gray-500 dark:text-gray-400">Loading messages...</p>
                    </div>
                ) : filteredThreads.length === 0 ? (
                    <div className="py-12 px-6 text-center">
                        <div className="w-12 h-12 rounded-2xl bg-orange-50 dark:bg-orange-950/40 text-[#F97316] dark:text-orange-400 flex items-center justify-center mx-auto mb-3">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                            </svg>
                        </div>
                        <p className="text-xs font-bold text-gray-800 dark:text-gray-200">No messages found</p>
                        <p className="text-[11px] text-gray-400 dark:text-gray-400 mt-0.5">
                            {searchTerm ? 'Try another search keyword.' : 'Case chats and match inquiries will appear here.'}
                        </p>
                    </div>
                ) : (
                    filteredThreads.map((thread) => {
                        const isMatch = thread.thread_mode === 'match';
                        const rawThumbnail = isMatch 
                            ? (thread.matched_pet?.photo_url || thread.report?.media_url) 
                            : (thread.report?.media_url || thread.counterpart?.avatar);

                        const thumbnail = rawThumbnail 
                            ? (rawThumbnail.startsWith('http') || rawThumbnail.startsWith('data:') ? rawThumbnail : getProfilePicture(rawThumbnail))
                            : null;

                        const counterpartName = thread.counterpart?.name || (isMatch ? 'Pet Owner' : 'Reporter');
                        const roleBadge = thread.counterpart?.role || (isMatch ? 'Owner' : 'Reporter');

                        return (
                            <div
                                key={thread.thread_id}
                                onClick={() => handleThreadClick(thread)}
                                className={`p-4 flex items-start gap-3.5 cursor-pointer transition-all duration-200 group relative ${
                                    thread.unread_count > 0
                                        ? 'bg-orange-50/30 dark:bg-orange-950/20 hover:bg-orange-50/60 dark:hover:bg-orange-950/35'
                                        : 'bg-white dark:bg-[#151C2C] hover:bg-gray-50/80 dark:hover:bg-[#1A2338]'
                                }`}
                            >
                                {/* Unread indicator bar */}
                                {thread.unread_count > 0 && (
                                    <div className="absolute left-0 top-3 bottom-3 w-1 bg-[#F97316] rounded-r-full shadow-xs"></div>
                                )}

                                {/* Thumbnail / Avatar */}
                                <div className="relative shrink-0 mt-0.5">
                                    <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 overflow-hidden flex items-center justify-center">
                                        {thumbnail ? (
                                            <img
                                                src={thumbnail}
                                                alt="Thumbnail"
                                                className="w-full h-full object-cover"
                                                onError={(e: any) => { e.target.src = DEFAULT_AVATAR; }}
                                            />
                                        ) : (
                                            <span className="text-base">
                                                {isMatch ? '🐾' : '📋'}
                                            </span>
                                        )}
                                    </div>
                                    <span className={`absolute -bottom-1 -right-1 px-1 py-0.2 rounded text-[6px] font-black uppercase tracking-wider text-white shadow-2xs ${
                                        isMatch ? 'bg-amber-600' : 'bg-blue-600'
                                    }`}>
                                        {isMatch ? 'Match' : 'Report'}
                                    </span>
                                </div>

                                {/* Thread Details */}
                                <div className="flex-1 min-w-0">
                                {(() => {
                                    const displayTitle = generateMemorableTitle({
                                        isMatch,
                                        reportId: thread.report_id,
                                        categoryName: thread.report?.category_name,
                                        categoryId: thread.report?.category_id,
                                        animalType: thread.report?.animal_type,
                                        animalBreed: thread.report?.animal_breed,
                                        animalColor: thread.report?.animal_color,
                                        streetAddress: thread.report?.street_address,
                                        landmark: thread.report?.landmark,
                                        subdivisionName: thread.report?.subdivision_name,
                                        matchedPetName: thread.matched_pet?.pet_name,
                                        matchedPetBreed: thread.matched_pet?.breed,
                                        serverTitle: thread.title
                                    });

                                    return (
                                        <div className="flex items-center justify-between gap-1 mb-0.5">
                                            <h4
                                                className={`text-xs truncate ${thread.unread_count > 0 ? 'font-black text-gray-900 dark:text-white' : 'font-bold text-gray-800 dark:text-gray-200'}`}
                                                title={displayTitle}
                                            >
                                                {displayTitle}
                                            </h4>
                                            <span className="text-[10px] text-gray-400 dark:text-gray-400 font-medium shrink-0">
                                                {formatTime(thread.last_message?.sent_at || thread.updated_at)}
                                            </span>
                                        </div>
                                    );
                                })()}

                                    <div className="flex items-center gap-1.5 mb-1">
                                        <span className="text-[11px] font-semibold text-gray-600 dark:text-gray-300 truncate">
                                            {counterpartName}
                                        </span>
                                        <span className="text-[8px] font-bold px-1.5 py-0.2 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200/50 dark:border-gray-700/50 uppercase tracking-wider">
                                            {roleBadge}
                                        </span>
                                    </div>

                                    <div className="flex items-center justify-between gap-2">
                                        <p className={`text-xs truncate ${thread.unread_count > 0 ? 'font-bold text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'}`}>
                                            {thread.last_message?.text ? thread.last_message.text : 'Direct communication channel ready.'}
                                        </p>
                                        {thread.unread_count > 0 && (
                                            <span className="min-w-[16px] h-[16px] px-1 rounded-full bg-[#F97316] text-white text-[9px] font-black flex items-center justify-center shrink-0 shadow-2xs">
                                                {thread.unread_count}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Panel Footer */}
            {(currentRole === 'subd' || currentRole === 'brgy') && (
                <div className="p-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50/80 dark:bg-[#0E131F] flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-gray-400 dark:text-gray-400">
                        {currentRole === 'subd' ? 'Designated Leader Inbox' : 'Barangay Operations Inbox'}
                    </span>
                    <button
                        onClick={() => {
                            onClose();
                            navigate(currentRole === 'subd' ? '/subd/messages' : '/brgy/messages');
                        }}
                        className="text-xs font-bold text-[#F97316] dark:text-orange-400 hover:text-[#EA580C] dark:hover:text-orange-300 transition-colors flex items-center gap-1 cursor-pointer"
                    >
                        <span>View All in Messages Hub</span>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </button>
                </div>
            )}
        </div>
    );
}
