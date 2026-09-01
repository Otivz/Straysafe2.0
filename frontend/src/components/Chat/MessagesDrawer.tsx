import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DEFAULT_AVATAR, getProfilePicture } from '../../utils/avatar';
import type { ChatThreadSummary } from '../../utils/useUnreadMessageCount';

interface MessagesDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    threads: ChatThreadSummary[];
    loading?: boolean;
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
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
        return '';
    }
};

export default function MessagesDrawer({
    isOpen,
    onClose,
    threads = [],
    loading = false,
    onSelectThread,
    currentRole = 'citizen'
}: MessagesDrawerProps) {
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');
    const [filterTab, setFilterTab] = useState<'all' | 'reports' | 'matches'>('all');

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
        } else if (thread.thread_mode === 'match' && thread.report_id) {
            navigate(`/resident/reports/${thread.report_id}/match-review?openChat=true`);
        } else if (thread.report_id) {
            navigate(`/resident/reports/${thread.report_id}?openChat=true`);
        }
    };

    return (
        <div className="fixed inset-0 z-50 overflow-hidden">
            {/* Backdrop */}
            <div 
                className="absolute inset-0 bg-black/40 backdrop-blur-xs transition-opacity duration-300 animate-in fade-in"
                onClick={onClose}
            />

            <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
                <div className="w-screen max-w-md bg-white shadow-2xl flex flex-col border-l border-gray-100 animate-in slide-in-from-right duration-300">
                    
                    {/* Header */}
                    <div className="p-6 bg-gradient-to-br from-white via-orange-50/30 to-amber-50/20 border-b border-gray-100 space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl bg-[#F97316]/10 text-[#F97316] flex items-center justify-center text-xl font-bold shadow-xs">
                                    💬
                                </div>
                                <div>
                                    <h2 className="text-base font-black text-gray-900 tracking-tight flex items-center gap-2">
                                        Case Messages
                                        {totalUnread > 0 && (
                                            <span className="px-2 py-0.5 bg-[#F97316] text-white text-[10px] font-black rounded-full shadow-xs">
                                                {totalUnread} new
                                            </span>
                                        )}
                                    </h2>
                                    <p className="text-[11px] font-bold text-gray-400">
                                        Incident coordination & Look-alike verification
                                    </p>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={onClose}
                                className="w-8 h-8 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-700 flex items-center justify-center text-sm font-bold transition-all cursor-pointer"
                                title="Close Drawer"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Search Bar */}
                        <div className="relative">
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Search messages, reports, or pets..."
                                className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 focus:border-[#F97316] rounded-xl text-xs font-semibold focus:outline-hidden transition-all shadow-2xs"
                            />
                            <svg className="w-4 h-4 text-gray-400 absolute left-3 top-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            {searchTerm && (
                                <button
                                    type="button"
                                    onClick={() => setSearchTerm('')}
                                    className="absolute right-3 top-2.5 text-xs text-gray-400 hover:text-gray-600 font-bold"
                                >
                                    ✕
                                </button>
                            )}
                        </div>

                        {/* Filter Tabs */}
                        <div className="flex items-center gap-1.5 p-1 bg-gray-100 rounded-xl">
                            <button
                                type="button"
                                onClick={() => setFilterTab('all')}
                                className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                                    filterTab === 'all' ? 'bg-white text-gray-900 shadow-2xs' : 'text-gray-500 hover:text-gray-900'
                                }`}
                            >
                                All ({threads.length})
                            </button>
                            <button
                                type="button"
                                onClick={() => setFilterTab('matches')}
                                className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                                    filterTab === 'matches' ? 'bg-white text-[#F97316] shadow-2xs' : 'text-gray-500 hover:text-gray-900'
                                }`}
                            >
                                Matches ({threads.filter(t => t.thread_mode === 'match').length})
                            </button>
                            <button
                                type="button"
                                onClick={() => setFilterTab('reports')}
                                className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                                    filterTab === 'reports' ? 'bg-white text-blue-600 shadow-2xs' : 'text-gray-500 hover:text-gray-900'
                                }`}
                            >
                                Reports ({threads.filter(t => t.thread_mode === 'report').length})
                            </button>
                        </div>
                    </div>

                    {/* Thread List */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
                        {loading && threads.length === 0 ? (
                            <div className="py-16 text-center space-y-3">
                                <div className="w-8 h-8 border-3 border-[#F97316] border-t-transparent rounded-full animate-spin mx-auto" />
                                <p className="text-xs font-bold text-gray-400">Loading active conversations...</p>
                            </div>
                        ) : filteredThreads.length === 0 ? (
                            <div className="py-16 text-center px-4 space-y-3">
                                <div className="w-14 h-14 rounded-2xl bg-gray-50 text-gray-300 flex items-center justify-center text-2xl mx-auto border border-gray-100">
                                    📭
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-gray-700">No conversations found</p>
                                    <p className="text-xs text-gray-400 mt-1">
                                        {searchTerm ? 'Try a different search query.' : 'Case chats and match inquiries will appear here.'}
                                    </p>
                                </div>
                            </div>
                        ) : (
                            filteredThreads.map((thread) => {
                                const isMatch = thread.thread_mode === 'match';
                                const thumbnail = isMatch 
                                    ? (thread.matched_pet?.photo_url || thread.report?.media_url) 
                                    : (thread.report?.media_url || thread.counterpart?.avatar);

                                const counterpartName = thread.counterpart?.name || (isMatch ? 'Pet Owner' : 'Reporter');
                                const roleBadge = thread.counterpart?.role || (isMatch ? 'Owner' : 'Reporter');

                                return (
                                    <div
                                        key={thread.thread_id}
                                        onClick={() => handleThreadClick(thread)}
                                        className={`p-3.5 rounded-2xl border transition-all cursor-pointer hover:scale-[1.01] active:scale-[0.99] flex items-start gap-3.5 ${
                                            thread.unread_count > 0 
                                                ? 'bg-orange-50/40 border-orange-200/80 shadow-xs' 
                                                : 'bg-white hover:bg-gray-50/80 border-gray-100 shadow-2xs'
                                        }`}
                                    >
                                        {/* Avatar / Thumbnail */}
                                        <div className="relative shrink-0">
                                            <div className="w-12 h-12 rounded-xl bg-gray-100 border border-gray-200 overflow-hidden flex items-center justify-center">
                                                {thumbnail ? (
                                                    <img 
                                                        src={thumbnail.startsWith('http') || thumbnail.startsWith('data:') ? thumbnail : getProfilePicture(thumbnail)} 
                                                        alt="Thumbnail" 
                                                        className="w-full h-full object-cover"
                                                        onError={(e: any) => { e.target.src = DEFAULT_AVATAR; }}
                                                    />
                                                ) : (
                                                    <span className="text-lg">
                                                        {isMatch ? '🐾' : '📋'}
                                                    </span>
                                                )}
                                            </div>
                                            <span className={`absolute -bottom-1 -right-1 px-1.5 py-0.2 rounded-md text-[7px] font-black uppercase tracking-wider text-white shadow-2xs ${
                                                isMatch ? 'bg-amber-600' : 'bg-blue-600'
                                            }`}>
                                                {isMatch ? 'Match' : 'Report'}
                                            </span>
                                        </div>

                                        {/* Content */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-1 mb-0.5">
                                                <div className="flex items-center gap-1.5 min-w-0">
                                                    <p className="text-xs font-black text-gray-900 truncate">
                                                        {isMatch 
                                                            ? `Match: ${thread.matched_pet?.pet_name || 'Candidate'} ⟷ #${thread.report_id}`
                                                            : `Report #${thread.report_id || 'Case'}`
                                                        }
                                                    </p>
                                                </div>
                                                <span className="text-[10px] font-semibold text-gray-400 shrink-0">
                                                    {formatTime(thread.last_message?.sent_at || thread.updated_at)}
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-1.5 mb-1">
                                                <span className="text-[10px] font-bold text-gray-600 truncate">
                                                    {counterpartName}
                                                </span>
                                                <span className="text-[8px] font-black px-1.5 py-0.2 rounded bg-gray-100 text-gray-500 uppercase tracking-wider">
                                                    {roleBadge}
                                                </span>
                                            </div>

                                            <div className="flex items-center justify-between gap-2">
                                                <p className={`text-xs truncate ${thread.unread_count > 0 ? 'font-bold text-gray-900' : 'font-medium text-gray-500'}`}>
                                                    {thread.last_message?.text ? thread.last_message.text : 'Direct channel ready for coordination.'}
                                                </p>
                                                {thread.unread_count > 0 && (
                                                    <span className="w-5 h-5 rounded-full bg-[#F97316] text-white text-[10px] font-black flex items-center justify-center shrink-0 shadow-2xs">
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

                    {/* Footer */}
                    {currentRole === 'subd' && (
                        <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                            <p className="text-[11px] font-bold text-gray-500">
                                Designated Officer Inbox
                            </p>
                            <button
                                type="button"
                                onClick={() => {
                                    onClose();
                                    navigate('/subd/messages');
                                }}
                                className="px-4 py-2 bg-white hover:bg-gray-100 border border-gray-200 text-[#F97316] rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-2xs cursor-pointer flex items-center gap-1.5"
                            >
                                <span>Full Messages Hub</span>
                                <span>↗</span>
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
