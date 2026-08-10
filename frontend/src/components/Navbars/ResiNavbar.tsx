import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { DEFAULT_AVATAR, getProfilePicture } from '../../utils/avatar';
import { useTheme } from '../../context/ThemeContext';

interface ResiNavbarProps {
    onMenuToggle?: (isOpen: boolean) => void;
    onSearch?: (query: string) => void;
    searchValue?: string;
    isMobileSearchOpen?: boolean;
    onCloseSearch?: () => void;
    feedTab?: 'reports' | 'announcements';
    onFeedTabChange?: (tab: 'reports' | 'announcements') => void;
    notifications?: any[];
    onMarkNotificationRead?: (id: number) => void;
    onDeleteNotification?: (id: number) => void;
    onMarkAllNotificationsRead?: () => void;
    hasMoreNotifications?: boolean;
    onLoadMoreNotifications?: () => void;
    onNotificationClick?: (notif: any) => void;
}

const ResiNavbar = ({ 
    onMenuToggle, 
    onSearch, 
    searchValue, 
    isMobileSearchOpen, 
    onCloseSearch, 
    feedTab: _feedTab, 
    onFeedTabChange: _onFeedTabChange,
    notifications = [],
    onMarkNotificationRead,
    onDeleteNotification,
    onMarkAllNotificationsRead,
    hasMoreNotifications = false,
    onLoadMoreNotifications,
    onNotificationClick
}: ResiNavbarProps) => {
    const navigate = useNavigate();
    const { theme, toggleTheme } = useTheme();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isMobileHamburgerOpen, setIsMobileHamburgerOpen] = useState(false);
    const [isMobileNotificationsOpen, setIsMobileNotificationsOpen] = useState(false);

    const userStr = localStorage.getItem('resident_user');
    const initialUser = userStr ? JSON.parse(userStr) : null;
    const [user, setUser] = useState(initialUser);

    useEffect(() => {
        const fetchLatestProfile = async () => {
            if (!initialUser?.user_id) return;
            try {
                const res = await axios.get(`http://localhost:8000/users/${initialUser.user_id}`);
                localStorage.setItem('resident_user', JSON.stringify(res.data));
                setUser(res.data);
            } catch (err) {
                console.error("Failed to refresh profile", err);
            }
        };
        fetchLatestProfile();
    }, [initialUser?.user_id]);

    const handleNotificationClick = (notif: any) => {
        if (!notif.is_read) {
            if (onMarkNotificationRead) {
                onMarkNotificationRead(notif.notification_id);
            } else {
                axios.patch(`http://localhost:8000/notifications/${notif.notification_id}`, { is_read: true })
                    .catch(err => console.error("Failed to mark notification read", err));
            }
        }

        setIsMobileNotificationsOpen(false);

        if (onNotificationClick) {
            onNotificationClick(notif);
            return;
        }

        const typeStr = (notif.type || '').toLowerCase();
        const titleStr = (notif.title || '').toLowerCase();
        const msgStr = (notif.message || '').toLowerCase();

        const isMatch = typeStr === 'potential_match' || 
                        typeStr === 'match_review' ||
                        titleStr.includes('match') ||
                        titleStr.includes('sighting') ||
                        msgStr.includes('match') ||
                        msgStr.includes('potential match') ||
                        msgStr.includes('matches of your dog');

        if (isMatch && notif.related_id) {
            navigate(`/resident/reports/${notif.related_id}/match-review`);
        } else if (notif.related_id) {
            if (typeStr === 'alert' || titleStr.includes('scan')) {
                navigate(`/resident/pet/${notif.related_id}/scan-history`);
            } else {
                navigate(`/resident/reports/${notif.related_id}`);
            }
        }
    };



    const profilePic = getProfilePicture(user?.profile_picture);
    const unreadCount = (notifications || []).filter((n: any) => !n.is_read).length;

    const handleLogout = () => {
        localStorage.removeItem('resident_user');
        sessionStorage.removeItem('resident_user');
        navigate('/login');
    };

    const handleMobileSearch = (query: string) => {
        if (onSearch) onSearch(query);
        if (onCloseSearch) onCloseSearch();
    };



    return (
        <>
            <nav className="fixed top-0 left-0 right-0 z-[100] bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-100 dark:border-gray-800 font-sans tracking-tight h-20 transition-colors duration-200">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full">
                    <div className="flex justify-between items-center h-full">

                        {/* LOGO */}
                        <Link to="/resident-home" className="flex items-center gap-3 group">
                            <img
                                src="/SSLOGO.png"
                                alt="StraySafe Logo"
                                className="h-10 w-auto group-hover:scale-110 transition-transform"
                            />
                            <span className="font-black text-2xl tracking-tighter text-[#1a1208] dark:text-white uppercase">STRAYSAFE</span>
                        </Link>

                        {/* DESKTOP NAV REMOVED */}
                        <div className="hidden md:flex items-center gap-6">

                            {/* SEARCH BAR */}
                            <div className="relative mr-2">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <svg className="h-4 w-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                                    </svg>
                                </div>
                                <input
                                    type="text"
                                    value={searchValue || ''}
                                    onChange={(e) => onSearch && onSearch(e.target.value)}
                                    placeholder="Search reports..."
                                    className="w-64 pl-10 pr-4 py-2.5 bg-[#FAFAF9] dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-full text-[#1a1208] dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-[#F97316]/50 focus:bg-white dark:focus:bg-gray-900 transition-all shadow-sm"
                                />
                            </div>

                            {/* DARK MODE TOGGLE BUTTON */}
                            <button
                                onClick={toggleTheme}
                                className="p-2.5 rounded-full bg-[#FAFAF9] dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-[#4a3b28] dark:text-amber-400 hover:text-[#F97316] hover:bg-orange-50 dark:hover:bg-gray-700 transition-all active:scale-95"
                                title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                            >
                                {theme === 'dark' ? (
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                                    </svg>
                                ) : (
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                                    </svg>
                                )}
                            </button>

                            {/* PROFILE DROPDOWN */}
                            <div className="relative">
                                <button
                                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                    className="relative group focus:outline-none"
                                >
                                    {/* Avatar Container */}
                                    <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-white dark:border-gray-800 shadow-md group-hover:border-[#F97316] transition-all duration-300">
                                        <img
                                            src={profilePic}
                                            alt="User"
                                            className="w-full h-full object-cover bg-gray-100 dark:bg-gray-800"
                                            onError={(e) => { e.currentTarget.src = DEFAULT_AVATAR; }}
                                        />
                                    </div>

                                    {/* Overlapping Arrow Button */}
                                    <div className={`absolute bottom-0 right-0 w-6 h-6 rounded-full bg-[#1a1208] dark:bg-gray-800 border-2 border-white dark:border-gray-800 flex items-center justify-center text-white shadow-lg transition-transform duration-300 ${isDropdownOpen ? 'rotate-180 bg-[#F97316]' : 'group-hover:scale-110'}`}>
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </div>
                                </button>

                                {/* DROPDOWN MENU */}
                                {isDropdownOpen && (
                                    <>
                                        <div className="fixed inset-0 z-10" onClick={() => setIsDropdownOpen(false)} />
                                        <div className="absolute right-0 mt-3 w-56 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 py-3 z-20 animate-in fade-in zoom-in-95 duration-200">

                                            <Link to="/resident/profile" className="flex items-center px-6 py-3 text-xs font-bold text-[#4a3b28] dark:text-gray-200 hover:bg-[#FAFAF9] dark:hover:bg-gray-800 hover:text-[#F97316] dark:hover:text-[#F97316] transition-all">
                                                View Profile
                                            </Link>
                                            <Link to="/resident/pets" className="flex items-center px-6 py-3 text-xs font-bold text-[#4a3b28] dark:text-gray-200 hover:bg-[#FAFAF9] dark:hover:bg-gray-800 hover:text-[#F97316] dark:hover:text-[#F97316] transition-all">
                                                My Pets
                                            </Link>
                                            <Link to="/resident/settings" className="flex items-center px-6 py-3 text-xs font-bold text-[#4a3b28] dark:text-gray-200 hover:bg-[#FAFAF9] dark:hover:bg-gray-800 hover:text-[#F97316] dark:hover:text-[#F97316] transition-all">
                                                Settings
                                            </Link>
                                            <div className="mx-4 my-2 h-[1px] bg-gray-50 dark:bg-gray-800" />
                                            <button
                                                onClick={handleLogout}
                                                className="w-full flex items-center px-6 py-3 text-xs font-black text-[#EF4444] hover:bg-red-50 dark:hover:bg-red-950/30 transition-all uppercase tracking-widest"
                                            >
                                                Logout
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* MOBILE ACTIONS */}
                        <div className="md:hidden flex items-center gap-2">

                            {/* Notification Bell Button */}
                            <button
                                onClick={() => setIsMobileNotificationsOpen(!isMobileNotificationsOpen)}
                                className="p-2.5 text-[#4a3b28] hover:text-[#F97316] transition-all flex items-center justify-center active:scale-95 relative"
                                aria-label="Open notifications"
                            >
                                <svg className="w-6.5 h-6.5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                                </svg>
                                {unreadCount > 0 && (
                                    <span className="absolute top-1.5 right-1.5 w-5 h-5 bg-[#EF4444] text-white text-[9px] font-black rounded-full flex items-center justify-center ring-2 ring-white">
                                        {unreadCount}
                                    </span>
                                )}
                            </button>

                            {/* Hamburger Menu Button */}
                            <button
                                onClick={() => setIsMobileHamburgerOpen(true)}
                                className="p-2.5 text-[#4a3b28] hover:text-[#F97316] transition-all flex items-center justify-center active:scale-95"
                                aria-label="Open menu"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h16" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            </nav>

            {/* MOBILE HAMBURGER SIDE MENU */}
            {isMobileHamburgerOpen && (
                <div 
                    className="fixed inset-0 z-[250] bg-[#1a1208]/40 backdrop-blur-md animate-in fade-in duration-300" 
                    onClick={() => setIsMobileHamburgerOpen(false)} 
                />
            )}
            <div 
                className={`md:hidden fixed top-0 right-0 h-full w-full z-[260] bg-gradient-to-b from-white via-[#FCFCFB] to-[#FAF9F6] shadow-[-15px_0_45px_rgba(0,0,0,0.12)] border-l border-white/60 flex flex-col`}
                style={{
                    transition: 'transform 450ms cubic-bezier(0.16, 1, 0.3, 1)',
                    transform: isMobileHamburgerOpen ? 'translateX(0)' : 'translateX(100%)'
                }}
            >
                <div className="flex flex-col h-full">
                    {/* Header */}
                    <div className="px-6 pt-8 pb-6 flex justify-between items-center border-b border-gray-100/60">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-[#F97316]/20 shadow-md ring-4 ring-[#F97316]/5 transition-transform duration-300 hover:scale-105">
                                <img src={profilePic} alt="User" className="w-full h-full object-cover bg-gray-100" />
                            </div>
                            <div>
                                <p className="text-[15px] font-black text-[#1a1208] leading-tight tracking-tight">{user?.name || 'User'}</p>
                                <div className="flex items-center gap-1.5 mt-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Resident</span>
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={() => setIsMobileHamburgerOpen(false)}
                            className="p-2 text-gray-400 hover:text-[#EF4444] rounded-full hover:bg-red-50/50 transition-all active:scale-90"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5.5 w-5.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Menu Items */}
                    <div className="flex-1 px-4 py-6 space-y-2.5">
                        <Link
                            to="/resident/settings"
                            onClick={() => setIsMobileHamburgerOpen(false)}
                            className="flex items-center gap-4 px-4 py-3.5 rounded-2xl hover:bg-orange-50/50 hover:pl-6 text-[#4a3b28] hover:text-[#F97316] transition-all duration-300 ease-out group active:scale-[0.98]"
                        >
                            <div className="w-10 h-10 bg-orange-50 group-hover:bg-orange-100 rounded-xl flex items-center justify-center text-[#F97316] shadow-sm shadow-orange-100/50 group-hover:scale-110 group-hover:rotate-6 transition-all duration-300 shrink-0">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                            </div>
                            <span className="font-black text-xs uppercase tracking-[0.15em] transition-colors">Settings</span>
                        </Link>
                        <Link
                            to="/resident/pets"
                            onClick={() => setIsMobileHamburgerOpen(false)}
                            className="flex items-center gap-4 px-4 py-3.5 rounded-2xl hover:bg-orange-50/50 hover:pl-6 text-[#4a3b28] hover:text-[#F97316] transition-all duration-300 ease-out group active:scale-[0.98]"
                        >
                            <div className="w-10 h-10 bg-orange-50 group-hover:bg-orange-100 rounded-xl flex items-center justify-center text-[#F97316] shadow-sm shadow-orange-100/50 group-hover:scale-110 group-hover:rotate-6 transition-all duration-300 shrink-0">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h.01M10 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-4l-4 4-1-4z" />
                                </svg>
                            </div>
                            <span className="font-black text-xs uppercase tracking-[0.15em] transition-colors">My Pets</span>
                        </Link>

                        <Link
                            to="/resident/profile?tab=reports"
                            onClick={() => setIsMobileHamburgerOpen(false)}
                            className="flex items-center gap-4 px-4 py-3.5 rounded-2xl hover:bg-orange-50/50 hover:pl-6 text-[#4a3b28] hover:text-[#F97316] transition-all duration-300 ease-out group active:scale-[0.98]"
                        >
                            <div className="w-10 h-10 bg-orange-50 group-hover:bg-orange-100 rounded-xl flex items-center justify-center text-[#F97316] shadow-sm shadow-orange-100/50 group-hover:scale-110 group-hover:-rotate-6 transition-all duration-300 shrink-0">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                            </div>
                            <span className="font-black text-xs uppercase tracking-[0.15em] transition-colors">My Reports</span>
                        </Link>
                    </div>

                    {/* Logout */}
                    <div className="px-4 pb-8 pt-4 border-t border-gray-100/60">
                        <button
                            onClick={() => { setIsMobileHamburgerOpen(false); handleLogout(); }}
                            className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl hover:bg-red-50 text-[#EF4444] transition-all duration-300 ease-out group active:scale-[0.98]"
                        >
                            <div className="w-10 h-10 bg-red-50 group-hover:bg-red-100 rounded-xl flex items-center justify-center text-[#EF4444] shadow-sm shadow-red-100/50 group-hover:scale-110 group-hover:rotate-12 transition-all duration-300 shrink-0">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                </svg>
                            </div>
                            <span className="font-black text-xs uppercase tracking-[0.15em] transition-colors">Logout</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* MOBILE MENU (DASHBOARD LAYOUT - kept for backward compat but not triggered) */}
            <div className={`md:hidden fixed inset-0 z-[200] bg-white transition-all duration-500 ease-in-out transform ${isMenuOpen ? 'translate-x-0' : 'translate-x-full'}`}>
                <div className="h-full flex flex-col overflow-y-auto">

                    {/* Header */}
                    <div className="px-8 pt-8 pb-6 flex justify-between items-start">
                        <div>
                            <h2 className="text-2xl font-black tracking-tighter text-[#1a1208] uppercase leading-none">STRAY-SAFE</h2>
                            <p className="text-[10px] font-black text-[#F97316] uppercase tracking-widest mt-2">Compassionate Guardian</p>
                        </div>
                        <button onClick={() => { setIsMenuOpen(false); if (onMenuToggle) onMenuToggle(false); }} className="p-2 text-gray-400 hover:text-[#1a1208]">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    <div className="px-6 space-y-8 pb-12">
                        {/* User Card */}
                        <div className="bg-[#FAFAF9] rounded-[2.5rem] p-6 flex items-center justify-between border border-gray-50 shadow-sm">
                            <div className="flex items-center gap-4">
                                <div className="relative w-16 h-16 rounded-3xl overflow-hidden border-2 border-white shadow-md">
                                    <img src={profilePic} alt="User" className="w-full h-full object-cover bg-gray-100" />
                                    <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 border-2 border-white rounded-full"></div>
                                </div>
                                <div>
                                    <h3 className="text-lg font-black text-[#1a1208] leading-tight">{user?.name || 'User Name'}</h3>
                                </div>
                            </div>
                        </div>

                        {/* Quick Actions */}
                        <div>
                            <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest mb-6 px-2">Account Actions</p>
                            <div className="space-y-4">
                                <Link to="/resident/profile" onClick={() => { setIsMenuOpen(false); if (onMenuToggle) onMenuToggle(false); }} className="flex items-center justify-between p-4 group">
                                    <div className="flex items-center gap-4 text-[#4a3b28]">
                                        <div className="p-3 bg-gray-50 rounded-2xl group-hover:bg-orange-50 group-hover:text-[#F97316] transition-all">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                            </svg>
                                        </div>
                                        <span className="text-sm font-black text-[#4a3b28] uppercase tracking-widest">Settings</span>
                                    </div>
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
                                    </svg>
                                </Link>
                                
                                <button onClick={handleLogout} className="w-full flex items-center justify-between p-4 group">
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 bg-red-50 rounded-2xl group-hover:bg-[#EF4444] text-[#EF4444] group-hover:text-white transition-all">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                            </svg>
                                        </div>
                                        <span className="text-sm font-black text-[#EF4444] uppercase tracking-widest">Logout</span>
                                    </div>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* MOBILE SEARCH OVERLAY */}
            <div className={`md:hidden fixed inset-0 z-[300] bg-white transition-all duration-300 ease-in-out transform ${isMobileSearchOpen ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'}`}>
                {/* Curved Top Background */}
                <div className="bg-[#F97316] pt-10 pb-8 px-6 rounded-b-[2.5rem] shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 mix-blend-overlay"></div>
                    <div className="relative flex items-center gap-4 mt-2">
                        <button onClick={() => onCloseSearch && onCloseSearch()} className="text-white hover:bg-white/20 p-2 rounded-full transition-all shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                            </svg>
                        </button>
                        <div className="relative flex-1">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                                </svg>
                            </div>
                            <input
                                type="text"
                                value={searchValue || ''}
                                onChange={(e) => onSearch && onSearch(e.target.value)}
                                placeholder="Search reports..."
                                className="w-full pl-11 pr-4 py-3 bg-white rounded-full text-[#1a1208] placeholder-gray-400 focus:outline-none focus:ring-4 focus:ring-white/30 font-medium shadow-inner transition-all"
                            />
                        </div>
                    </div>
                </div>

                <div className="px-6 py-8 overflow-y-auto h-[calc(100vh-140px)]">
                    {/* Recent Searches */}
                    <div className="mb-8">
                        <div className="flex justify-between items-end mb-5">
                            <h3 className="text-[#1a1208] font-black text-xl tracking-tight">Recent</h3>
                            <button className="text-[#EF4444] text-xs font-bold uppercase tracking-wider hover:underline">Clear all</button>
                        </div>
                        <div className="flex flex-wrap gap-2.5">
                            {['Injured Dog', 'San Jose', 'Stray Cat', 'Rabies Risk', 'Highway'].map((item) => (
                                <button key={item} onClick={() => handleMobileSearch(item)} className="px-5 py-2.5 bg-[#FAFAF9] border border-gray-100 hover:bg-orange-50 hover:border-orange-200 hover:text-[#F97316] text-[#4a3b28] text-sm font-semibold rounded-full transition-all shadow-sm">
                                    {item}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Suggestions */}
                    <div className="mb-8">
                        <div className="flex justify-between items-end mb-5">
                            <h3 className="text-[#1a1208] font-black text-xl tracking-tight">Suggestions</h3>
                            <button className="text-[#F97316] text-xs font-bold uppercase tracking-wider hover:underline">See all</button>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <button onClick={() => handleMobileSearch('Rescue')} className="flex items-center p-3.5 bg-white shadow-sm rounded-[1.25rem] border border-gray-50 text-left active:scale-95 transition-transform group hover:border-[#F97316]/30">
                                <div className="w-12 h-12 bg-orange-50 rounded-[0.9rem] flex items-center justify-center text-[#F97316] mr-3 shrink-0 group-hover:scale-110 transition-transform">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                    </svg>
                                </div>
                                <div>
                                    <p className="font-bold text-[#1a1208] text-[13px] leading-tight mb-0.5">Urgent Rescue</p>
                                    <p className="text-[11px] text-gray-400 font-medium tracking-wide">High Priority</p>
                                </div>
                            </button>
                            <button onClick={() => handleMobileSearch('Medical')} className="flex items-center p-3.5 bg-white shadow-sm rounded-[1.25rem] border border-gray-50 text-left active:scale-95 transition-transform group hover:border-blue-200">
                                <div className="w-12 h-12 bg-blue-50 rounded-[0.9rem] flex items-center justify-center text-blue-500 mr-3 shrink-0 group-hover:scale-110 transition-transform">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                                    </svg>
                                </div>
                                <div>
                                    <p className="font-bold text-[#1a1208] text-[13px] leading-tight mb-0.5">Medical Need</p>
                                    <p className="text-[11px] text-gray-400 font-medium tracking-wide">Injuries/Sick</p>
                                </div>
                            </button>
                        </div>
                    </div>

                    {/* Top Categories */}
                    <div>
                        <div className="flex justify-between items-end mb-5">
                            <h3 className="text-[#1a1208] font-black text-xl tracking-tight">Top Categories</h3>
                            <button className="text-[#F97316] text-xs font-bold uppercase tracking-wider hover:underline">See all</button>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            {[
                                { name: 'Aggressive', img: 'https://images.unsplash.com/photo-1541882352827-0b16f3d4e73f?q=80&w=300&auto=format&fit=crop', desc: 'Reports' },
                                { name: 'Roaming Pack', img: 'https://images.unsplash.com/photo-1544568100-847a948585b9?q=80&w=300&auto=format&fit=crop', desc: 'Sightings' },
                                { name: 'Puppies/Kittens', img: 'https://images.unsplash.com/photo-1543852786-1cf6624b9987?q=80&w=300&auto=format&fit=crop', desc: 'Vulnerable' }
                            ].map((cat) => (
                                <button key={cat.name} onClick={() => handleMobileSearch(cat.name)} className="relative flex flex-col items-start bg-[#FAFAF9] rounded-3xl overflow-hidden shadow-sm active:scale-95 transition-all text-left w-full h-40 group border border-gray-100 hover:border-orange-200">
                                    <img src={cat.img} className="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:scale-110 transition-transform duration-700 ease-out" alt={cat.name} />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent"></div>
                                    <div className="absolute bottom-0 left-0 p-4 w-full">
                                        <p className="font-black text-white text-[15px] leading-tight drop-shadow-md">{cat.name}</p>
                                        <p className="text-[11px] text-gray-200 font-medium mt-1 tracking-wide uppercase drop-shadow-md">{cat.desc}</p>
                                    </div>
                                </button>
                            ))}
                    </div>
                </div>
            </div>
        </div>

            {/* MOBILE NOTIFICATIONS DRAWER */}
            {isMobileNotificationsOpen && (
                <div 
                    className="fixed inset-0 z-[250] bg-[#1a1208]/40 backdrop-blur-md animate-in fade-in duration-300" 
                    onClick={() => setIsMobileNotificationsOpen(false)} 
                />
            )}
            <div 
                className={`md:hidden fixed top-0 right-0 h-full w-full z-[260] bg-gradient-to-b from-white via-[#FCFCFB] to-[#FAF9F6] shadow-[-15px_0_45px_rgba(0,0,0,0.12)] border-l border-white/60 flex flex-col`}
                style={{
                    transition: 'transform 450ms cubic-bezier(0.16, 1, 0.3, 1)',
                    transform: isMobileNotificationsOpen ? 'translateX(0)' : 'translateX(100%)'
                }}
            >
                <div className="flex flex-col h-full">
                    {/* Header */}
                    <div className="px-6 pt-8 pb-6 flex justify-between items-center border-b border-gray-100/60">
                        <div>
                            <h3 className="text-[17px] font-black text-[#1a1208] uppercase tracking-tight">Notifications</h3>
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-1">{unreadCount} unread</p>
                        </div>
                        <div className="flex items-center gap-3">
                            {unreadCount > 0 && onMarkAllNotificationsRead && (
                                <button
                                    onClick={onMarkAllNotificationsRead}
                                    className="text-[10px] font-black uppercase tracking-wider text-[#F97316] mr-2"
                                >
                                    Mark all read
                                </button>
                            )}
                            <button
                                onClick={() => setIsMobileNotificationsOpen(false)}
                                className="p-2 text-gray-400 hover:text-[#EF4444] rounded-full hover:bg-red-50/50 transition-all active:scale-90"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5.5 w-5.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4 custom-scrollbar">
                        {(!notifications || notifications.length === 0) ? (
                            <div className="text-center py-20">
                                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest italic">
                                    No notifications yet
                                </p>
                            </div>
                        ) : (
                            notifications.map((notif) => {
                                const typeStr = (notif.type || '').toLowerCase();
                                const titleStr = (notif.title || '').toLowerCase();
                                const msgStr = (notif.message || '').toLowerCase();
                                const isMatch = typeStr === 'potential_match' || 
                                                typeStr === 'match_review' ||
                                                titleStr.includes('match') ||
                                                titleStr.includes('sighting') ||
                                                msgStr.includes('match') ||
                                                msgStr.includes('potential match') ||
                                                msgStr.includes('matches of your dog');
                                return (
                                    <div
                                        key={notif.notification_id}
                                        onClick={() => handleNotificationClick(notif)}
                                        className={`relative p-5 rounded-3xl border transition-all duration-300 cursor-pointer hover:border-orange-300 active:scale-[0.98] ${
                                            notif.is_read
                                                ? 'bg-[#FAFAF9]/50 border-gray-50'
                                                : 'bg-orange-50/25 border-orange-100/50 shadow-sm'
                                        }`}
                                    >
                                        {!notif.is_read && (
                                            <span className="absolute top-5 left-5 w-2 h-2 bg-[#F97316] rounded-full" />
                                        )}
                                        <div className={!notif.is_read ? 'pl-4' : ''}>
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="flex-1">
                                                    <h4 className="text-[13px] font-black text-[#1a1208]">
                                                        {notif.title}
                                                    </h4>
                                                    <p className="text-xs font-semibold text-[#4a3b28]/85 mt-1 leading-relaxed">
                                                        {notif.message}
                                                    </p>
                                                    <div className="flex items-center gap-2 mt-2.5">
                                                        <span className="text-[9px] font-bold text-gray-450 block uppercase tracking-widest">
                                                            {new Date(notif.created_at).toLocaleDateString()}
                                                        </span>
                                                        {isMatch && (
                                                            <span className="text-[8px] font-black text-[#F97316] bg-orange-100/80 px-2 py-0.5 rounded-full uppercase tracking-wider">
                                                                Review Match →
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2 shrink-0">
                                                    {!notif.is_read && onMarkNotificationRead && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); onMarkNotificationRead(notif.notification_id); }}
                                                            className="p-1.5 bg-orange-50 rounded-xl text-[#F97316] active:scale-90 transition-transform"
                                                            title="Mark as read"
                                                        >
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                                            </svg>
                                                        </button>
                                                    )}
                                                    {onDeleteNotification && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); onDeleteNotification(notif.notification_id); }}
                                                            className="p-1.5 bg-gray-100 rounded-xl text-gray-500 active:scale-90 transition-transform hover:bg-gray-200"
                                                            title="Dismiss"
                                                        >
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                                            </svg>
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                        {hasMoreNotifications && onLoadMoreNotifications && (
                            <button
                                onClick={onLoadMoreNotifications}
                                className="w-full py-3.5 bg-orange-50/50 hover:bg-orange-50 text-[#F97316] border border-orange-100 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-[0.98] mt-2 shadow-sm"
                            >
                                Load More
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
};

export default ResiNavbar;
