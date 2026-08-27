import { useState, useRef, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { DEFAULT_AVATAR, getProfilePicture } from '../../utils/avatar';
import { clearAuthStorage } from '../../utils/api';
import { useUnreadMessageCount } from '../../utils/useUnreadMessageCount';
import type { ChatThreadSummary } from '../../utils/useUnreadMessageCount';
import MessagesDropdown from '../Chat/MessagesDropdown';
import ReportChatDrawer from '../Chat/ReportChatDrawer';

interface AdminNavbarProps {
    leftContent?: ReactNode;
}

const AdminNavbar = ({ leftContent }: AdminNavbarProps) => {
    const navigate = useNavigate();
    const [isMessagesOpen, setIsMessagesOpen] = useState(false);
    const [activeChatThread, setActiveChatThread] = useState<ChatThreadSummary | null>(null);
    const messagesRef = useRef<HTMLDivElement>(null);

    const handleLogout = () => {
        clearAuthStorage();
        navigate('/admin/login');
    };

    // Get user email from storage
    const userStr = localStorage.getItem('admin_user') || sessionStorage.getItem('admin_user');
    const user = userStr ? JSON.parse(userStr) : { email: 'admin@straysafe.com' };

    const { unreadCount: unreadMessageCount, threads: messageThreads, loading: isMessagesLoading, refreshThreads } = useUnreadMessageCount(user?.user_id);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (messagesRef.current && !messagesRef.current.contains(event.target as Node)) {
                setIsMessagesOpen(false);
            }
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsMessagesOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, []);

    return (
        <header className="h-20 bg-white border-b border-gray-100 flex items-center justify-between px-8 sticky top-0 z-10 w-full shadow-sm">
            {/* Left Content Area */}
            <div className="flex flex-col justify-center min-w-0">
                {leftContent}
            </div>

            {/* Right Side Actions */}
            <div className="flex items-center space-x-4">
                {/* Messages Dropdown Container */}
                <div className="relative" ref={messagesRef}>
                    <button 
                        onClick={() => setIsMessagesOpen(!isMessagesOpen)}
                        className={`relative p-2.5 rounded-xl transition-all group cursor-pointer ${
                            isMessagesOpen
                                ? 'bg-orange-50 text-[#F97316]'
                                : 'text-gray-400 hover:text-[#F97316] hover:bg-orange-50'
                        }`}
                        title="Case Messages & Inquiries"
                        aria-label="Messages"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                        {unreadMessageCount > 0 && (
                            <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 bg-[#F97316] text-white text-[9px] font-black rounded-full flex items-center justify-center border-2 border-white shadow-xs">
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
                        currentRole="admin"
                    />
                </div>

                {/* Notifications */}
                <button className="relative p-2.5 text-gray-400 hover:text-[#F97316] hover:bg-orange-50 rounded-xl transition-all group cursor-pointer" title="System Notifications">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                </button>

                {/* Settings */}
                <button className="p-2 text-gray-400 hover:text-[#F97316] hover:bg-orange-50 rounded-lg transition-all group">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                </button>

                {/* Vertical Divider */}
                <div className="h-8 w-px bg-gray-100 mx-1"></div>

                {/* Profile Section with Hover Dropdown */}
                <div className="relative group">
                    <button className="flex items-center space-x-3 pl-3 pr-1 py-1 hover:bg-gray-50 rounded-2xl transition-all cursor-pointer">
                        <div className="flex flex-col text-right hidden lg:block">
                            <p className="text-sm font-bold text-gray-900 leading-none">{user.name || 'Admin User'}</p>
                            <p className="text-[10px] font-medium text-gray-400 mt-1 uppercase tracking-wider">Super Administrator</p>
                        </div>
                        <div className="w-10 h-10 rounded-full border-2 border-white shadow-sm overflow-hidden bg-gray-200">
                            <img 
                                src={getProfilePicture(user.profile_picture)} 
                                alt={user.name || 'Admin'} 
                                className="w-full h-full object-cover"
                                onError={(e) => { e.currentTarget.src = DEFAULT_AVATAR; }}
                            />
                        </div>
                    </button>

                    {/* Dropdown Menu */}
                    <div className="absolute right-0 mt-0 w-56 pt-2 opacity-0 invisible translate-y-2 group-hover:opacity-100 group-hover:visible group-hover:translate-y-0 transition-all duration-300 z-50">
                        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden py-2">
                            <div className="px-4 py-3 border-b border-gray-50 bg-gray-50/50">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Signed in as</p>
                                <p className="text-xs font-bold text-gray-900 truncate">{user.email}</p>
                            </div>

                            <div className="p-1">
                                <button 
                                    onClick={() => navigate('/admin/account-settings')}
                                    className="w-full flex items-center space-x-3 px-3 py-2.5 text-sm text-gray-600 hover:text-[#F97316] hover:bg-orange-50 rounded-xl transition-all group/item"
                                >
                                    <div className="p-1.5 bg-gray-100 rounded-lg text-gray-400 group-hover/item:bg-orange-100 group-hover/item:text-[#F97316] transition-colors">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                        </svg>
                                    </div>
                                    <span className="font-semibold">Account Settings</span>
                                </button>

                                <button className="w-full flex items-center space-x-3 px-3 py-2.5 text-sm text-gray-600 hover:text-[#F97316] hover:bg-orange-50 rounded-xl transition-all group/item">
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
                        name: user.name || 'Admin User',
                        role_id: user.role_id || 4,
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

export default AdminNavbar;
