import { useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DEFAULT_AVATAR, getProfilePicture } from '../../utils/avatar';
import api, { clearAuthStorage } from '../../utils/api';
import { useUnreadMessageCount } from '../../utils/useUnreadMessageCount';
import type { ChatThreadSummary } from '../../utils/useUnreadMessageCount';
import MessagesDropdown from '../Chat/MessagesDropdown';
import ReportChatDrawer from '../Chat/ReportChatDrawer';
import QRScannerModal from '../Modals/QRScannerModal';

export interface NotificationItem {
    notification_id: number;
    user_id: number;
    title: string;
    message: string;
    type?: string;
    is_read: boolean;
    is_archived?: boolean;
    created_at: string;
    related_id?: number | null;
}

interface SubdNavbarProps {
    leftContent?: ReactNode;
    notifications?: NotificationItem[];
    onNotificationClick?: (notif: NotificationItem) => void;
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

const SubdNavbar = ({ leftContent, notifications: propNotifications, onNotificationClick, onMenuToggle }: SubdNavbarProps) => {
    const navigate = useNavigate();

    // Get user from storage
    const userStr = localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user');
    const user = userStr ? JSON.parse(userStr) : { email: 'staff@straysafe.com', name: 'Subdivision Staff' };

    // Notification states
    const [localNotifications, setLocalNotifications] = useState<NotificationItem[]>([]);
    const [isNotifOpen, setIsNotifOpen] = useState(false);
    const [isMessagesOpen, setIsMessagesOpen] = useState(false);
    const [activeChatThread, setActiveChatThread] = useState<ChatThreadSummary | null>(null);
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const [notifFilter, setNotifFilter] = useState<'all' | 'unread'>('all');
    const [isLoadingNotifs, setIsLoadingNotifs] = useState(false);
    const [isMarkingAll, setIsMarkingAll] = useState(false);
    const [isQRScannerOpen, setIsQRScannerOpen] = useState(false);

    const notifRef = useRef<HTMLDivElement>(null);
    const messagesRef = useRef<HTMLDivElement>(null);
    const profileRef = useRef<HTMLDivElement>(null);

    const { unreadCount: unreadMessageCount, threads: messageThreads, loading: isMessagesLoading, refreshThreads } = useUnreadMessageCount(user?.user_id);

    const isMessageNotif = (notif: NotificationItem) => {
        const t = (notif.type || '').toLowerCase();
        const title = (notif.title || '').toLowerCase();
        return t === 'message' || t === 'match_message' || title.includes('💬') || title.includes('match inquiry');
    };

    const effectiveNotifications = (propNotifications || localNotifications).filter(n => !isMessageNotif(n));
    const unreadCount = effectiveNotifications.filter(n => !n.is_read).length;

    // Fetch notifications for the logged-in staff user
    const fetchNotifications = async () => {
        if (!user?.user_id) return;
        try {
            const res = await api.get(`/notifications/user/${user.user_id}`);
            if (Array.isArray(res.data)) {
                setLocalNotifications(res.data);
            }
        } catch (err) {
            console.error("Failed to fetch subdivision notifications:", err);
        }
    };

    useEffect(() => {
        if (!propNotifications) {
            setIsLoadingNotifs(true);
            fetchNotifications().finally(() => setIsLoadingNotifs(false));

            // Auto-refresh notifications every 30 seconds
            const interval = setInterval(fetchNotifications, 30000);
            return () => clearInterval(interval);
        }
    }, [user?.user_id, propNotifications]);

    // Handle outside clicks and Escape key to close dropdowns
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
                setIsNotifOpen(false);
            }
            if (messagesRef.current && !messagesRef.current.contains(event.target as Node)) {
                setIsMessagesOpen(false);
            }
            if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
                setIsProfileOpen(false);
            }
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsNotifOpen(false);
                setIsMessagesOpen(false);
                setIsProfileOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, []);

    const handleLogout = () => {
        clearAuthStorage();
        navigate('/staff/login');
    };

    // Mark all notifications as read
    const handleMarkAllRead = async () => {
        if (!user?.user_id || unreadCount === 0) return;
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

    // Toggle single notification read/unread
    const handleToggleRead = async (e: React.MouseEvent, notif: NotificationItem) => {
        e.stopPropagation();
        const newReadState = !notif.is_read;
        try {
            await api.patch(`/notifications/${notif.notification_id}`, { is_read: newReadState });
            setLocalNotifications(prev =>
                prev.map(n => n.notification_id === notif.notification_id ? { ...n, is_read: newReadState } : n)
            );
        } catch (err) {
            console.error("Failed to update notification status:", err);
        }
    };

    // Delete single notification
    const handleDeleteNotification = async (e: React.MouseEvent, notifId: number) => {
        e.stopPropagation();
        try {
            await api.delete(`/notifications/${notifId}`);
            setLocalNotifications(prev => prev.filter(n => n.notification_id !== notifId));
        } catch (err) {
            console.error("Failed to delete notification:", err);
        }
    };

    // Handle clicking a notification item
    const handleNotificationClick = async (notif: NotificationItem) => {
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

        if (onNotificationClick) {
            onNotificationClick(notif);
            return;
        }

        // Smart routing based on notification properties
        const typeStr = (notif.type || '').toLowerCase();
        const titleStr = (notif.title || '').toLowerCase();
        const msgStr = (notif.message || '').toLowerCase();

        const isMessageOrComment =
            typeStr.includes('message') ||
            titleStr.includes('message') ||
            typeStr.includes('comment') ||
            titleStr.includes('comment') ||
            typeStr.includes('chat') ||
            titleStr.includes('chat');

        if (isMessageOrComment) {
            if (notif.related_id) {
                navigate(`/subd/reports/${notif.related_id}?openChat=true`, { state: { openChat: true } });
            } else {
                navigate('/subd/reports?openChat=true', { state: { openChat: true } });
            }
        } else if (typeStr.includes('transfer') || titleStr.includes('transfer') || msgStr.includes('transfer')) {
            if (notif.related_id) {
                navigate(`/subd/reports/${notif.related_id}`);
            } else {
                navigate('/subd/reports');
            }
        } else if (typeStr.includes('pet_claim') || (typeStr.includes('claim') && !titleStr.includes('report'))) {
            navigate('/subd/pet-claims');
        } else if (typeStr.includes('hazard') || titleStr.includes('hazard') || titleStr.includes('warning') || msgStr.includes('hazard')) {
            navigate('/subd/hazard-alert');
        } else if (titleStr.includes('mission') || titleStr.includes('escalat') || msgStr.includes('escalated') || typeStr.includes('rescue')) {
            if (notif.related_id) {
                navigate(`/subd/reports/${notif.related_id}`);
            } else {
                navigate('/subd/escalated');
            }
        } else if (notif.related_id) {
            navigate(`/subd/reports/${notif.related_id}`);
        } else {
            navigate('/subd/reports');
        }
    };

    // Filtered list
    const filteredNotifications = effectiveNotifications.filter(n => {
        if (notifFilter === 'unread') return !n.is_read;
        return true;
    });

    // Helper for rendering notification icons based on type
    const renderNotificationIcon = (notif: NotificationItem) => {
        const typeStr = (notif.type || '').toLowerCase();
        const titleStr = (notif.title || '').toLowerCase();

        if (typeStr.includes('accepted') || titleStr.includes('accepted')) {
            return (
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 border-2 border-emerald-300 font-black text-base shadow-xs animate-in zoom-in-95">
                    ✅
                </div>
            );
        }

        if (typeStr.includes('rejected') || titleStr.includes('declined') || titleStr.includes('rejected')) {
            return (
                <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0 border-2 border-rose-300 font-black text-base shadow-xs animate-in zoom-in-95">
                    ❌
                </div>
            );
        }

        if (typeStr.includes('transfer') || titleStr.includes('transfer')) {
            return (
                <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0 border-2 border-purple-300 font-black text-base shadow-xs animate-in zoom-in-95">
                    🔄
                </div>
            );
        }

        if (typeStr.includes('message') || titleStr.includes('message') || typeStr.includes('comment') || titleStr.includes('comment')) {
            return (
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100/60">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                </div>
            );
        }

        if (typeStr.includes('claim') || titleStr.includes('claim')) {
            return (
                <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-100/60">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                </div>
            );
        }

        if (typeStr.includes('alert') || titleStr.includes('alert') || titleStr.includes('hazard') || titleStr.includes('warning')) {
            return (
                <div className="w-9 h-9 rounded-xl bg-red-50 text-red-500 flex items-center justify-center shrink-0 border border-red-100/60">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                </div>
            );
        }

        if (typeStr.includes('status') || titleStr.includes('update') || titleStr.includes('rescue')) {
            return (
                <div className="w-9 h-9 rounded-xl bg-orange-50 text-[#F97316] flex items-center justify-center shrink-0 border border-orange-100/60">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
            );
        }

        return (
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-500 flex items-center justify-center shrink-0 border border-blue-100/60">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
            </div>
        );
    };

    return (
        <header className="h-16 sm:h-20 bg-white/95 backdrop-blur-md border-b border-gray-100 flex items-center justify-between px-3 sm:px-6 lg:px-8 sticky top-0 z-[2000] w-full shadow-sm">

            {/* Left Content Area */}
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 mr-1 sm:mr-3">
                {/* Mobile: StraySafe Logo + Brand + Subdivision Location Subtitle */}
                <Link to="/subd/dashboard" className="md:hidden flex items-center gap-2.5 group shrink-0 select-none">
                    <img
                        src="/SSLOGO.png"
                        alt="StraySafe Logo"
                        className="h-9 w-auto group-hover:scale-105 transition-transform shrink-0"
                    />
                    <div className="flex flex-col min-w-0">
                        <span className="font-black text-xl tracking-tighter text-[#1a1208] uppercase leading-none">
                            STRAYSAFE
                        </span>
                        <span className="text-[9.5px] font-bold text-slate-500 uppercase tracking-wider mt-0.5 leading-tight truncate max-w-[170px] sm:max-w-[220px]">
                            {user?.subdivision_name ? `${user.subdivision_name}, Sta. Maria, Bulacan` : 'Selera Homes, Sta. Maria, Bulacan'}
                        </span>
                    </div>
                </Link>

                {/* Desktop: Page Left Content (Title & Subtitle) */}
                <div className="hidden md:flex flex-col justify-center min-w-0 flex-1 [&_h1]:text-slate-900 [&_h1]:font-black [&_h1]:tracking-tight [&_p]:text-slate-500 [&_p]:font-bold [&_p]:text-[11px] [&_p]:tracking-wide">
                    {leftContent}
                </div>
            </div>

            {/* Right Side Actions */}
            <div className="flex items-center gap-1 sm:gap-2.5 ml-auto shrink-0">

                {/* QR Scanner (Mobile Only) */}
                <button
                    type="button"
                    onClick={() => setIsQRScannerOpen(true)}
                    className="md:hidden p-2 text-[#4a3b28] hover:text-[#F97316] transition-all flex items-center justify-center active:scale-95 cursor-pointer"
                    title="Scan Pet QR Collar Tag"
                    aria-label="Open QR Scanner"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                    </svg>
                </button>

                {/* Messages Dropdown Container */}
                <div className="relative" ref={messagesRef}>
                    <button
                        type="button"
                        onClick={() => {
                            setIsMessagesOpen(!isMessagesOpen);
                            if (isNotifOpen) setIsNotifOpen(false);
                        }}
                        className={`relative p-2 sm:p-0 sm:w-10 sm:h-10 sm:min-w-[40px] sm:min-h-[40px] sm:rounded-xl transition-all flex items-center justify-center group cursor-pointer sm:border ${
                            isMessagesOpen
                                ? 'text-[#F97316] sm:bg-orange-50 sm:border-orange-200/80 sm:shadow-xs'
                                : 'text-[#4a3b28] hover:text-[#F97316] sm:border-transparent sm:text-slate-500 sm:hover:text-[#F97316] sm:hover:bg-orange-50/70 sm:hover:border-orange-100/70'
                        }`}
                        title="Case Messages & Look-Alike Inquiries"
                        aria-label="Messages"
                    >
                        <svg className="w-6 h-6 sm:w-5.5 sm:h-5.5 transition-transform group-hover:scale-105" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>

                        {/* Unread message badge */}
                        {unreadMessageCount > 0 && (
                            <span className="absolute top-1 right-1 sm:-top-1 sm:-right-1 min-w-[16px] sm:min-w-[20px] h-[16px] sm:h-[20px] px-0.5 sm:px-1 bg-[#F97316] text-white text-[8px] sm:text-[10px] font-black rounded-full flex items-center justify-center ring-2 ring-white shadow-xs animate-pulse">
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
                        currentRole="subd"
                    />
                </div>

                {/* Notifications Dropdown Container */}
                <div className="relative" ref={notifRef}>
                    <button
                        onClick={() => {
                            setIsNotifOpen(!isNotifOpen);
                            if (isMessagesOpen) setIsMessagesOpen(false);
                        }}
                        className={`relative p-2 sm:p-0 sm:w-10 sm:h-10 sm:min-w-[40px] sm:min-h-[40px] sm:rounded-xl transition-all flex items-center justify-center group cursor-pointer sm:border ${
                            isNotifOpen
                                ? 'text-[#F97316] sm:bg-orange-50 sm:border-orange-200/80 sm:shadow-xs'
                                : 'text-[#4a3b28] hover:text-[#F97316] sm:border-transparent sm:text-slate-500 sm:hover:text-[#F97316] sm:hover:bg-orange-50/70 sm:hover:border-orange-100/70'
                        }`}
                        title="Notifications"
                        aria-label="Notifications"
                    >
                        <svg className="w-6 h-6 sm:w-5.5 sm:h-5.5 transition-transform group-hover:scale-105" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                        </svg>

                        {/* Unread badge */}
                        {unreadCount > 0 && (
                            <span className="absolute top-1 right-1 sm:-top-1 sm:-right-1 min-w-[18px] sm:min-w-[20px] h-[18px] sm:h-[20px] px-1 bg-[#EF4444] text-white text-[9px] sm:text-[10px] font-black rounded-full flex items-center justify-center ring-2 ring-white shadow-xs animate-pulse">
                                {unreadCount > 9 ? '9+' : unreadCount}
                            </span>
                        )}
                    </button>

                    {/* Notification Dropdown Panel */}
                    {isNotifOpen && (
                        <div className="absolute right-0 sm:-right-8 md:right-0 mt-3 w-[calc(100vw-24px)] max-w-[22rem] sm:w-[25rem] bg-white rounded-2xl shadow-2xl border border-gray-100/90 overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-200">
                            
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
                                            {unreadCount > 0 ? `${unreadCount} unread update${unreadCount > 1 ? 's' : ''}` : 'All caught up!'}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-1.5">
                                    {unreadCount > 0 && (
                                        <button
                                            onClick={handleMarkAllRead}
                                            disabled={isMarkingAll}
                                            className="text-[11px] font-bold text-[#F97316] hover:text-[#EA580C] hover:bg-orange-50 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 disabled:opacity-50"
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
                                        className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
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
                                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                                        notifFilter === 'all'
                                            ? 'bg-white text-[#F97316] shadow-sm border border-orange-100/60 font-black'
                                            : 'text-gray-500 hover:text-gray-800'
                                    }`}
                                >
                                    All ({effectiveNotifications.length})
                                </button>
                                <button
                                    onClick={() => setNotifFilter('unread')}
                                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                                        notifFilter === 'unread'
                                            ? 'bg-white text-[#F97316] shadow-sm border border-orange-100/60 font-black'
                                            : 'text-gray-500 hover:text-gray-800'
                                    }`}
                                >
                                    Unread ({unreadCount})
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
                                                : 'New reports and updates will appear here.'}
                                        </p>
                                    </div>
                                ) : (
                                    filteredNotifications.map((notif) => {
                                        const typeStr = (notif.type || '').toLowerCase();
                                        const titleStr = (notif.title || '').toLowerCase();
                                        const isTransferAccepted = typeStr.includes('accepted') || titleStr.includes('accepted');
                                        const isTransferRejected = typeStr.includes('rejected') || titleStr.includes('declined') || titleStr.includes('rejected');
                                        const isTransferRequest = typeStr.includes('transfer_request') || (typeStr.includes('transfer') && titleStr.includes('request'));

                                        let cardBg = notif.is_read ? 'bg-white hover:bg-gray-50/80' : 'bg-orange-50/30 hover:bg-orange-50/60';
                                        let barColor = 'bg-[#F97316]';

                                        if (isTransferAccepted) {
                                            cardBg = notif.is_read ? 'bg-emerald-50/20 hover:bg-emerald-50/50' : 'bg-emerald-50/50 hover:bg-emerald-50/80';
                                            barColor = 'bg-emerald-500';
                                        } else if (isTransferRejected) {
                                            cardBg = notif.is_read ? 'bg-rose-50/20 hover:bg-rose-50/50' : 'bg-rose-50/50 hover:bg-rose-50/80';
                                            barColor = 'bg-rose-500';
                                        } else if (isTransferRequest) {
                                            cardBg = notif.is_read ? 'bg-purple-50/20 hover:bg-purple-50/50' : 'bg-purple-50/50 hover:bg-purple-50/80';
                                            barColor = 'bg-purple-500';
                                        }

                                        return (
                                            <div
                                                key={notif.notification_id}
                                                onClick={() => handleNotificationClick(notif)}
                                                className={`p-4 flex items-start gap-3.5 cursor-pointer transition-all duration-200 group relative border-b border-gray-100/60 ${cardBg}`}
                                            >
                                                {/* Unread / Status indicator bar */}
                                                {!notif.is_read && (
                                                    <span className={`absolute left-0 top-0 bottom-0 w-1.5 ${barColor} rounded-r`} />
                                                )}

                                                {/* Type Icon */}
                                                {renderNotificationIcon(notif)}

                                                {/* Notification Content */}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                                                            {isTransferAccepted && (
                                                                <span className="px-2 py-0.5 rounded-md bg-emerald-600 text-white font-black text-[9px] uppercase tracking-wider shadow-xs shrink-0 flex items-center gap-1">
                                                                    <span>✅</span>
                                                                    <span>ACCEPTED</span>
                                                                </span>
                                                            )}
                                                            {isTransferRejected && (
                                                                <span className="px-2 py-0.5 rounded-md bg-rose-600 text-white font-black text-[9px] uppercase tracking-wider shadow-xs shrink-0 flex items-center gap-1">
                                                                    <span>❌</span>
                                                                    <span>DECLINED</span>
                                                                </span>
                                                            )}
                                                            {isTransferRequest && (
                                                                <span className="px-2 py-0.5 rounded-md bg-purple-600 text-white font-black text-[9px] uppercase tracking-wider shadow-xs shrink-0 flex items-center gap-1">
                                                                    <span>🔄</span>
                                                                    <span>TRANSFER REQUEST</span>
                                                                </span>
                                                            )}
                                                            <h4 className={`text-xs tracking-tight truncate ${
                                                                isTransferAccepted
                                                                    ? 'font-black text-emerald-950'
                                                                    : isTransferRejected
                                                                    ? 'font-black text-rose-950'
                                                                    : isTransferRequest
                                                                    ? 'font-black text-purple-950'
                                                                    : !notif.is_read
                                                                    ? 'font-black text-gray-900'
                                                                    : 'font-bold text-gray-700'
                                                            }`}>
                                                                {notif.title}
                                                            </h4>
                                                        </div>
                                                        <span className="text-[10px] font-semibold text-gray-400 shrink-0">
                                                            {formatRelativeTime(notif.created_at)}
                                                        </span>
                                                    </div>

                                                    <p className={`text-xs mt-1 leading-relaxed line-clamp-2 ${
                                                        isTransferAccepted
                                                            ? 'font-bold text-emerald-900'
                                                            : isTransferRejected
                                                            ? 'font-bold text-rose-900'
                                                            : isTransferRequest
                                                            ? 'font-bold text-purple-900'
                                                            : 'text-gray-600'
                                                    }`}>
                                                        {notif.message}
                                                    </p>

                                                    {/* Action Row */}
                                                    <div className="flex items-center justify-between mt-2 pt-1 border-t border-gray-100/50">
                                                        <span className={`text-[10px] font-bold group-hover:underline flex items-center gap-1 ${
                                                            isTransferAccepted
                                                                ? 'text-emerald-700 font-black'
                                                                : isTransferRejected
                                                                ? 'text-rose-700 font-black'
                                                                : isTransferRequest
                                                                ? 'text-purple-700 font-black'
                                                                : 'text-[#F97316]'
                                                        }`}>
                                                            View details
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                            </svg>
                                                        </span>

                                                        <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
                                                            <button
                                                                onClick={(e) => handleToggleRead(e, notif)}
                                                                className="p-1 text-gray-400 hover:text-[#F97316] hover:bg-orange-100/50 rounded-md transition-colors"
                                                                title={notif.is_read ? "Mark as unread" : "Mark as read"}
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                                </svg>
                                                            </button>
                                                            <button
                                                                onClick={(e) => handleDeleteNotification(e, notif.notification_id)}
                                                                className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                                                                title="Delete notification"
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                                </svg>
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                            {/* Dropdown Footer */}
                            <div className="p-2.5 border-t border-gray-100 bg-gray-50/60 text-center">
                                <button
                                    onClick={() => { setIsNotifOpen(false); navigate('/subd/reports'); }}
                                    className="text-xs font-bold text-[#F97316] hover:text-[#EA580C] py-1 px-3 rounded-lg hover:bg-orange-50 transition-colors inline-flex items-center gap-1.5"
                                >
                                    <span>Go to Reports Hub</span>
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Settings Quick Button */}
                <button
                    onClick={() => navigate('/subd/settings')}
                    className="hidden sm:flex w-10 h-10 min-w-[40px] min-h-[40px] items-center justify-center text-slate-500 hover:text-[#F97316] hover:bg-orange-50/70 rounded-xl transition-all group cursor-pointer border border-transparent hover:border-orange-100/70"
                    title="Settings & Operations"
                    aria-label="Settings and Operations"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5.5 w-5.5 transition-transform group-hover:scale-105" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                </button>

                {/* Vertical Divider (Hidden on mobile to save space) */}
                <div className="hidden sm:block h-7 w-px bg-slate-200 mx-1"></div>

                {/* Profile Section with Dropdown */}
                <div className="relative hidden sm:block" ref={profileRef}>
                    <button
                        onClick={() => setIsProfileOpen(!isProfileOpen)}
                        className="flex items-center space-x-0 sm:space-x-3 pl-1 sm:pl-3 pr-0.5 py-1 hover:bg-slate-50/80 rounded-2xl transition-all cursor-pointer group min-w-[40px] min-h-[40px] justify-center"
                        aria-label="User Profile Menu"
                    >
                        <div className="flex flex-col text-right hidden lg:block">
                            <p className="text-sm font-black text-slate-900 leading-tight group-hover:text-[#F97316] transition-colors">{user.name || 'Staff User'}</p>
                            <p className="text-[11px] font-bold text-slate-500 mt-0.5 uppercase tracking-wide">Subdivision Leader</p>
                        </div>
                        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full border-2 border-white shadow-sm ring-1 ring-slate-200/90 group-hover:ring-2 group-hover:ring-[#F97316]/40 overflow-hidden bg-slate-100 flex items-center justify-center transition-all">
                            <img 
                                src={getProfilePicture(user.profile_picture)} 
                                alt={user.name || 'User'} 
                                className="w-full h-full object-cover"
                                onError={(e) => { e.currentTarget.src = DEFAULT_AVATAR; }}
                            />
                        </div>
                    </button>

                    {/* Profile Dropdown Menu */}
                    {isProfileOpen && (
                        <div className="absolute right-0 mt-2 w-56 max-w-[calc(100vw-24px)] bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden py-2 z-50 animate-in fade-in zoom-in-95 duration-200">
                            <div className="px-4 py-3 border-b border-gray-100 bg-slate-50/70">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Signed in as</p>
                                <p className="text-xs font-bold text-slate-800 truncate mt-0.5">{user.email}</p>
                            </div>

                            <div className="p-1">
                                <button
                                    onClick={() => { setIsProfileOpen(false); navigate('/subd/profile'); }}
                                    className="w-full flex items-center space-x-3 px-3 py-2.5 text-sm text-gray-600 hover:text-[#F97316] hover:bg-orange-50 rounded-xl transition-all group/item"
                                >
                                    <div className="p-1.5 bg-gray-100 rounded-lg text-gray-400 group-hover/item:bg-orange-100 group-hover/item:text-[#F97316] transition-colors">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                        </svg>
                                    </div>
                                    <span className="font-semibold">View Profile</span>
                                </button>

                                <button
                                    onClick={() => { setIsProfileOpen(false); navigate('/subd/settings'); }}
                                    className="w-full flex items-center space-x-3 px-3 py-2.5 text-sm text-gray-600 hover:text-[#F97316] hover:bg-orange-50 rounded-xl transition-all group/item"
                                >
                                    <div className="p-1.5 bg-gray-100 rounded-lg text-gray-400 group-hover/item:bg-orange-100 group-hover/item:text-[#F97316] transition-colors">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                    </div>
                                    <span className="font-semibold">Settings</span>
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
                    )}
                </div>

                {/* Hamburger Menu Button (Mobile Far Right - Matching Citizen Design) */}
                {onMenuToggle && (
                    <button
                        type="button"
                        onClick={onMenuToggle}
                        className="md:hidden p-2 text-[#4a3b28] hover:text-[#F97316] transition-all flex items-center justify-center active:scale-95 cursor-pointer"
                        title="Open Navigation Menu"
                        aria-label="Open Menu"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                    </button>
                )}
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
                        name: user.name || 'Staff User',
                        role_id: user.role_id || 2,
                        profile_picture: user.profile_picture
                    } : null}
                    customCounterpartName={activeChatThread.counterpart?.name}
                    customCounterpartRole={activeChatThread.counterpart?.role}
                    matchedPet={activeChatThread.matched_pet ? (activeChatThread.matched_pet as any) : undefined}
                    matchId={activeChatThread.match_id || undefined}
                    threadMode={activeChatThread.thread_mode}
                />
            )}

            {/* QR SCANNER MODAL */}
            <QRScannerModal isOpen={isQRScannerOpen} onClose={() => setIsQRScannerOpen(false)} />
        </header>
    );
};

export default SubdNavbar;
