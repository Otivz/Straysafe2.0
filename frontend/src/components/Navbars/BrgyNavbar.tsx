import { useState, useRef, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { DEFAULT_AVATAR, getProfilePicture } from '../../utils/avatar';
import { api, clearAuthStorage } from '../../utils/api';
import { useUnreadMessageCount } from '../../utils/useUnreadMessageCount';
import type { ChatThreadSummary } from '../../utils/useUnreadMessageCount';
import MessagesDropdown from '../Chat/MessagesDropdown';
import ReportChatDrawer from '../Chat/ReportChatDrawer';

interface BrgyNavbarProps {
    leftContent?: ReactNode;
    onMenuToggle?: () => void;
}

const formatRelativeTime = (dateStr: string) => {
    if (!dateStr) return '';
    try {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffSecs = Math.max(0, Math.floor(diffMs / 1000));
        const diffMins = Math.floor(diffSecs / 60);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffSecs < 45) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays === 1) return '1 day ago';
        if (diffDays < 7) return `${diffDays} days ago`;
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
        return '';
    }
};

const BrgyNavbar = ({ leftContent, onMenuToggle }: BrgyNavbarProps) => {
    const navigate = useNavigate();
    const [isMessagesOpen, setIsMessagesOpen] = useState(false);
    const [activeChatThread, setActiveChatThread] = useState<ChatThreadSummary | null>(null);
    const messagesRef = useRef<HTMLDivElement>(null);

    // Notification states
    const [localNotifications, setLocalNotifications] = useState<any[]>([]);
    const [isNotifOpen, setIsNotifOpen] = useState(false);
    const [notifFilter, setNotifFilter] = useState<'all' | 'unread'>('all');
    const [isLoadingNotifs, setIsLoadingNotifs] = useState(false);
    const [isMarkingAll, setIsMarkingAll] = useState(false);
    const notifRef = useRef<HTMLDivElement>(null);

    const handleLogout = () => {
        clearAuthStorage();
        navigate('/staff/login');
    };

    // Get user from storage
    const userStr = localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user');
    const user = userStr ? JSON.parse(userStr) : { name: 'Brgy Staff', email: 'staff@barangay.gov' };

    const { unreadCount: unreadMessageCount, threads: messageThreads, loading: isMessagesLoading, refreshThreads } = useUnreadMessageCount(user?.user_id);

    const isMessageNotif = (notif: any) => {
        const t = (notif.type || '').toLowerCase();
        const title = (notif.title || '').toLowerCase();
        return t === 'message' || t === 'match_message' || title.includes('💬') || title.includes('match inquiry');
    };

    const effectiveNotifications = localNotifications.filter(n => !isMessageNotif(n));
    const unreadNotifCount = effectiveNotifications.filter(n => !n.is_read).length;

    const fetchNotifications = async () => {
        if (!user?.user_id) return;
        try {
            const res = await api.get(`/notifications/user/${user.user_id}`);
            if (Array.isArray(res.data)) {
                setLocalNotifications(res.data);
            }
        } catch (err) {
            console.error("Failed to fetch barangay notifications:", err);
        }
    };

    useEffect(() => {
        setIsLoadingNotifs(true);
        fetchNotifications().finally(() => setIsLoadingNotifs(false));
        const interval = setInterval(fetchNotifications, 10000);
        return () => clearInterval(interval);
    }, [user?.user_id]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (messagesRef.current && !messagesRef.current.contains(event.target as Node)) {
                setIsMessagesOpen(false);
            }
            if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
                setIsNotifOpen(false);
            }
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsMessagesOpen(false);
                setIsNotifOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, []);

    const handleMarkAllRead = async () => {
        if (!user?.user_id) return;
        setIsMarkingAll(true);
        try {
            await api.post(`/notifications/mark-all-read/${user.user_id}`);
            setLocalNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
        } catch (err) {
            console.error("Failed to mark all notifications as read:", err);
        } finally {
            setIsMarkingAll(false);
        }
    };

    const handleNotificationClick = async (notif: any) => {
        if (!notif.is_read) {
            try {
                await api.patch(`/notifications/${notif.notification_id}`, { is_read: true });
                setLocalNotifications(prev =>
                    prev.map(n => n.notification_id === notif.notification_id ? { ...n, is_read: true } : n)
                );
            } catch (err) {
                console.error("Failed to mark notification as read:", err);
            }
        }
        setIsNotifOpen(false);

        const typeStr = (notif.type || '').toLowerCase();
        const titleStr = (notif.title || '').toLowerCase();
        const msgStr = (notif.message || '').toLowerCase();

        if (typeStr.includes('holding') || titleStr.includes('holding') || msgStr.includes('holding') || typeStr.includes('impound')) {
            navigate('/brgy/holding-facility');
        } else if (typeStr.includes('adopt') || titleStr.includes('adopt')) {
            navigate('/brgy/adoptions');
        } else if (typeStr.includes('claim')) {
            navigate('/brgy/pet-claims');
        } else if (notif.related_id) {
            navigate(`/brgy/reports/${notif.related_id}`);
        } else {
            navigate('/brgy/dashboard');
        }
    };

    const renderNotificationIcon = (notif: any) => {
        const typeStr = (notif.type || '').toLowerCase();
        const titleStr = (notif.title || '').toLowerCase();

        if (typeStr.includes('holding') || titleStr.includes('holding') || typeStr.includes('overdue')) {
            return (
                <div className="w-9 h-9 rounded-xl bg-red-100 text-red-700 flex items-center justify-center shrink-0 border-2 border-red-300 font-black text-base shadow-xs animate-pulse">
                    🚨
                </div>
            );
        }

        if (typeStr.includes('rescue') || titleStr.includes('rescue') || titleStr.includes('mission')) {
            return (
                <div className="w-9 h-9 rounded-xl bg-orange-100 text-[#F97316] flex items-center justify-center shrink-0 border border-orange-200 font-black text-base shadow-xs">
                    🚑
                </div>
            );
        }

        if (typeStr.includes('adopt') || titleStr.includes('adopt')) {
            return (
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 border border-emerald-200 font-black text-base shadow-xs">
                    🐾
                </div>
            );
        }

        return (
            <div className="w-9 h-9 rounded-xl bg-gray-100 text-gray-700 flex items-center justify-center shrink-0 border border-gray-200 font-black text-base shadow-xs">
                📢
            </div>
        );
    };

    const filteredNotifications = effectiveNotifications.filter(n => {
        if (notifFilter === 'unread') return !n.is_read;
        return true;
    });

    return (
        <header className="h-20 bg-white border-b border-gray-100 flex items-center justify-between px-8 sticky top-0 z-40 w-full shadow-sm">
            {/* Left Content Area */}
            <div className="flex items-center gap-4 min-w-0">
                {onMenuToggle && (
                    <button 
                        onClick={onMenuToggle}
                        className="lg:hidden p-2.5 text-[#1a1208] hover:bg-gray-50 rounded-xl transition-all border border-gray-100 shadow-sm active:scale-95 shrink-0"
                        title="Open Menu"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5.5 w-5.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                    </button>
                )}
                <div className="flex flex-col justify-center min-w-0 [&_h1]:text-slate-900 [&_h1]:font-black [&_h1]:tracking-tight [&_p]:text-slate-500 [&_p]:font-bold [&_p]:text-[11px] [&_p]:tracking-wide">
                    {leftContent}
                </div>
            </div>

            {/* Right Side Actions */}
            <div className="flex items-center space-x-3 sm:space-x-4">
                {/* Messages Dropdown Container */}
                <div className={`relative ${isMessagesOpen ? 'z-50' : ''}`} ref={messagesRef}>
                    <button 
                        onClick={() => setIsMessagesOpen(!isMessagesOpen)}
                        className={`relative p-2.5 rounded-xl transition-all group cursor-pointer border ${
                            isMessagesOpen 
                                ? 'bg-orange-50 border-orange-200/80 text-[#F97316] shadow-xs' 
                                : 'border-transparent text-slate-500 hover:text-[#F97316] hover:bg-orange-50/70 hover:border-orange-100/70'
                        }`}
                        title="Case Messages & Inquiries"
                        aria-label="Messages"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5.5 w-5.5 transition-transform group-hover:scale-105" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                        {unreadMessageCount > 0 && (
                            <span className="absolute -top-1 -right-1 min-w-[20px] h-[20px] px-1 bg-[#F97316] text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-white shadow-xs">
                                {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
                            </span>
                        )}
                    </button>

                    {/* Messages Dropdown Panel */}
                    <MessagesDropdown
                        isOpen={isMessagesOpen}
                        onClose={() => setIsMessagesOpen(false)}
                        threads={messageThreads}
                        loading={isMessagesLoading}
                        onRefresh={refreshThreads}
                        onSelectThread={(thread) => {
                            setIsMessagesOpen(false);
                            setActiveChatThread(thread);
                        }}
                        currentRole="brgy"
                    />
                </div>

                {/* Notifications Dropdown Container */}
                <div className={`relative ${isNotifOpen ? 'z-50' : ''}`} ref={notifRef}>
                    <button 
                        onClick={() => setIsNotifOpen(!isNotifOpen)}
                        className={`relative p-2.5 rounded-xl transition-all group cursor-pointer border ${
                            isNotifOpen 
                                ? 'bg-orange-50 border-orange-200/80 text-[#F97316] shadow-xs' 
                                : 'border-transparent text-slate-500 hover:text-[#F97316] hover:bg-orange-50/70 hover:border-orange-100/70'
                        }`}
                        title="System Notifications"
                        aria-label="Notifications"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5.5 w-5.5 transition-transform group-hover:scale-105" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                        </svg>
                        {unreadNotifCount > 0 && (
                            <span className="absolute -top-1 -right-1 min-w-[20px] h-[20px] px-1 bg-rose-500 text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-white shadow-xs animate-pulse">
                                {unreadNotifCount > 9 ? '9+' : unreadNotifCount}
                            </span>
                        )}
                    </button>

                    {/* Notification Dropdown Panel */}
                    {isNotifOpen && (
                        <div className="absolute right-0 sm:-right-8 md:right-0 mt-3 w-[22rem] sm:w-[25rem] bg-white rounded-2xl shadow-2xl border border-gray-100/90 overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-200">
                            {/* Panel Header */}
                            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-orange-50/40 via-white to-white">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-lg bg-orange-100/80 text-[#F97316] flex items-center justify-center">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                                        </svg>
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-black text-gray-900 tracking-tight leading-none">Notifications</h3>
                                        <p className="text-[11px] font-semibold text-gray-400 mt-1">
                                            {unreadNotifCount > 0 ? `${unreadNotifCount} unread update${unreadNotifCount > 1 ? 's' : ''}` : 'All caught up!'}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-1.5">
                                    {unreadNotifCount > 0 && (
                                        <button
                                            onClick={handleMarkAllRead}
                                            disabled={isMarkingAll}
                                            className="text-[11px] font-bold text-[#F97316] hover:text-[#EA580C] hover:bg-orange-50 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                                            title="Mark all as read"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                            </svg>
                                            <span>Mark all read</span>
                                        </button>
                                    )}
                                    <button
                                        onClick={fetchNotifications}
                                        className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                                        title="Refresh notifications"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            {/* Filter Tabs */}
                            <div className="px-4 py-2 border-b border-gray-100 bg-gray-50/50 flex items-center gap-2">
                                <button
                                    onClick={() => setNotifFilter('all')}
                                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                                        notifFilter === 'all'
                                            ? 'bg-white text-[#F97316] shadow-xs border border-orange-100/60 font-black'
                                            : 'text-gray-500 hover:text-gray-800'
                                    }`}
                                >
                                    All ({effectiveNotifications.length})
                                </button>
                                <button
                                    onClick={() => setNotifFilter('unread')}
                                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                                        notifFilter === 'unread'
                                            ? 'bg-white text-[#F97316] shadow-xs border border-orange-100/60 font-black'
                                            : 'text-gray-500 hover:text-gray-800'
                                    }`}
                                >
                                    Unread ({unreadNotifCount})
                                </button>
                            </div>

                            {/* Notifications Scrollable List */}
                            <div className="max-h-[22rem] overflow-y-auto divide-y divide-gray-50">
                                {isLoadingNotifs ? (
                                    <div className="py-12 flex flex-col items-center justify-center text-gray-400">
                                        <div className="w-7 h-7 border-2 border-[#F97316] border-t-transparent rounded-full animate-spin"></div>
                                        <p className="text-xs font-medium mt-3 text-gray-500">Loading updates...</p>
                                    </div>
                                ) : filteredNotifications.length === 0 ? (
                                    <div className="py-12 px-6 text-center">
                                        <div className="w-12 h-12 rounded-2xl bg-orange-50 text-[#F97316] flex items-center justify-center mx-auto mb-3">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                                            </svg>
                                        </div>
                                        <p className="text-xs font-bold text-gray-800">No notifications</p>
                                        <p className="text-[11px] text-gray-400 mt-0.5">
                                            {notifFilter === 'unread'
                                                ? 'You have read all notifications.'
                                                : 'Station updates and holding alerts will appear here.'}
                                        </p>
                                    </div>
                                ) : (
                                    filteredNotifications.map((notif) => {
                                        const typeStr = (notif.type || '').toLowerCase();
                                        const isOverdue = typeStr.includes('holding') || typeStr.includes('overdue');
                                        const cardBg = notif.is_read
                                            ? 'bg-white hover:bg-gray-50/80'
                                            : isOverdue
                                            ? 'bg-red-50/30 hover:bg-red-50/60'
                                            : 'bg-orange-50/30 hover:bg-orange-50/60';
                                        const barColor = isOverdue ? 'bg-red-500' : 'bg-[#F97316]';

                                        return (
                                            <div
                                                key={notif.notification_id}
                                                onClick={() => handleNotificationClick(notif)}
                                                className={`p-4 flex items-start gap-3.5 cursor-pointer transition-all duration-200 group relative border-b border-gray-100/60 ${cardBg}`}
                                            >
                                                {!notif.is_read && (
                                                    <span className={`absolute left-0 top-0 bottom-0 w-1.5 ${barColor} rounded-r`} />
                                                )}

                                                {renderNotificationIcon(notif)}

                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <h4 className={`text-xs tracking-tight truncate ${
                                                            isOverdue
                                                                ? 'font-black text-red-950'
                                                                : !notif.is_read
                                                                ? 'font-black text-gray-900'
                                                                : 'font-bold text-gray-700'
                                                        }`}>
                                                            {notif.title}
                                                        </h4>
                                                        <span className="text-[10px] text-gray-400 font-semibold shrink-0">
                                                            {formatRelativeTime(notif.created_at)}
                                                        </span>
                                                    </div>

                                                    <p className="text-xs text-gray-600 mt-1 leading-relaxed line-clamp-2">
                                                        {notif.message}
                                                    </p>

                                                    <div className="mt-2 flex items-center justify-between">
                                                        <span className="text-[10px] font-bold text-[#F97316] group-hover:underline flex items-center gap-1">
                                                            <span>View Details</span>
                                                            <span>→</span>
                                                        </span>
                                                        {!notif.is_read && (
                                                            <span className="w-2 h-2 rounded-full bg-[#F97316] shrink-0" />
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Settings Quick Button */}
                <button
                    onClick={() => navigate('/brgy/settings')}
                    className="p-2.5 text-slate-500 hover:text-[#F97316] hover:bg-orange-50/70 rounded-xl transition-all group cursor-pointer border border-transparent hover:border-orange-100/70"
                    title="Station Settings"
                    aria-label="Settings"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5.5 w-5.5 transition-transform group-hover:scale-105" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                </button>

                {/* Vertical Divider */}
                <div className="h-7 w-px bg-slate-200 mx-1"></div>

                {/* Profile Section */}
                <div className="relative group">
                    <button className="flex items-center space-x-3 pl-3 pr-1 py-1 hover:bg-slate-50/80 rounded-2xl transition-all cursor-pointer group">
                        <div className="flex flex-col text-right hidden lg:block">
                            <p className="text-sm font-black text-slate-900 leading-tight group-hover:text-[#F97316] transition-colors">{user.name}</p>
                            <p className="text-[11px] font-bold text-slate-500 mt-0.5 uppercase tracking-wide">Barangay Action Officer</p>
                        </div>
                        <div className="w-10 h-10 rounded-full border-2 border-white shadow-sm ring-1 ring-slate-200/90 group-hover:ring-2 group-hover:ring-[#F97316]/40 overflow-hidden bg-slate-100 flex items-center justify-center transition-all">
                            <img 
                                src={getProfilePicture(user.profile_picture)} 
                                alt={user.name} 
                                className="w-full h-full object-cover"
                                onError={(e) => { e.currentTarget.src = DEFAULT_AVATAR; }}
                            />
                        </div>
                    </button>

                    {/* Dropdown */}
                    <div className="absolute right-0 mt-0 w-56 pt-2 opacity-0 invisible translate-y-2 group-hover:opacity-100 group-hover:visible group-hover:translate-y-0 transition-all duration-300 z-50">
                        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden py-2">
                            <div className="px-4 py-3 border-b border-gray-100 bg-slate-50/70">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Signed in as</p>
                                <p className="text-xs font-bold text-slate-800 truncate mt-0.5">{user.email}</p>
                            </div>

                            <div className="p-1">
                                <button 
                                    onClick={() => navigate('/brgy/profile')}
                                    className="w-full flex items-center space-x-3 px-3 py-2.5 text-sm text-gray-600 hover:text-[#F97316] hover:bg-orange-50 rounded-xl transition-all group/item"
                                >
                                    <div className="p-1.5 bg-gray-100 rounded-lg text-gray-400 group-hover/item:bg-orange-100 group-hover/item:text-[#F97316] transition-colors">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                        </svg>
                                    </div>
                                    <span className="font-semibold">My Profile</span>
                                </button>

                                <button 
                                    onClick={() => navigate('/brgy/settings')}
                                    className="w-full flex items-center space-x-3 px-3 py-2.5 text-sm text-gray-600 hover:text-[#F97316] hover:bg-orange-50 rounded-xl transition-all group/item"
                                >
                                    <div className="p-1.5 bg-gray-100 rounded-lg text-gray-400 group-hover/item:bg-orange-100 group-hover/item:text-[#F97316] transition-colors">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                    </div>
                                    <span className="font-semibold">Station Settings</span>
                                </button>
                            </div>

                            <div className="p-1 border-t border-gray-50 mt-1">
                                <button
                                    onClick={handleLogout}
                                    className="w-full flex items-center space-x-3 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 rounded-xl transition-all group/item"
                                >
                                    <div className="p-1.5 bg-red-100/50 rounded-lg text-red-500 group-hover/item:bg-red-100 transition-colors">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                        </svg>
                                    </div>
                                    <span className="font-bold uppercase tracking-wider text-xs">Logout</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* DIRECT CHAT DRAWER */}
            {activeChatThread && activeChatThread.report_id && (
                <ReportChatDrawer
                    isOpen={!!activeChatThread}
                    onClose={() => setActiveChatThread(null)}
                    report={{
                        report_id: activeChatThread.report_id,
                        user_id: activeChatThread.report?.user_id || 0,
                        reporter_name: activeChatThread.report?.reporter_name || undefined,
                        reporter_photo: activeChatThread.report?.reporter_photo || undefined,
                        animal_type: activeChatThread.report?.animal_type || undefined,
                        category_id: activeChatThread.report?.category_id || undefined,
                        status_id: activeChatThread.report?.status_id || undefined,
                        landmark: activeChatThread.report?.landmark || undefined
                    }}
                    currentUser={user ? {
                        user_id: user.user_id,
                        name: user.name || 'Brgy Officer',
                        role_id: user.role_id || 3,
                        profile_picture: user.profile_picture
                    } : null}
                    customCounterpartName={activeChatThread.counterpart?.name}
                    customCounterpartRole={activeChatThread.counterpart?.role}
                    matchedPet={activeChatThread.matched_pet ? (activeChatThread.matched_pet as any) : undefined}
                    matchId={activeChatThread.match_id || undefined}
                    threadMode={activeChatThread.thread_mode}
                />
            )}
        </header>
    );
};

export default BrgyNavbar;
