import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';


interface ResiNavbarProps {
    onMenuToggle?: (isOpen: boolean) => void;
    onSearch?: (query: string) => void;
    searchValue?: string;
    isMobileSearchOpen?: boolean;
    onCloseSearch?: () => void;
}

const ResiNavbar = ({ onMenuToggle, onSearch, searchValue, isMobileSearchOpen, onCloseSearch }: ResiNavbarProps) => {
    const navigate = useNavigate();
    const location = useLocation();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isNotificationOpen, setIsNotificationOpen] = useState(false);
    const [notifications, setNotifications] = useState<any[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);

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

    const fetchNotifications = async () => {
        if (!initialUser?.user_id) return;
        try {
            const res = await axios.get(`http://localhost:8000/notifications/user/${initialUser.user_id}`);
            setNotifications(res.data);
            setUnreadCount(res.data.filter((n: any) => !n.is_read).length);
        } catch (err) {
            console.error("Failed to fetch notifications", err);
        }
    };

    useEffect(() => {
        fetchNotifications();
        // Poll for notifications every 30 seconds
        const interval = setInterval(fetchNotifications, 30000);
        return () => clearInterval(interval);
    }, [initialUser?.user_id]);

    const markAllAsRead = async () => {
        if (!initialUser?.user_id) return;
        try {
            await axios.post(`http://localhost:8000/notifications/mark-all-read/${initialUser.user_id}`);
            fetchNotifications();
        } catch (err) {
            console.error("Failed to mark all as read", err);
        }
    };

    const markAsRead = async (id: number) => {
        try {
            await axios.patch(`http://localhost:8000/notifications/${id}`, { is_read: true });
            fetchNotifications();
        } catch (err) {
            console.error("Failed to mark notification as read", err);
        }
    };

    const profilePic = user?.profile_picture || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.name || 'User'}`;

    const toggleMenu = () => {
        const newState = !isMenuOpen;
        setIsMenuOpen(newState);
        if (onMenuToggle) onMenuToggle(newState);
    };

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
            <nav className="fixed top-0 left-0 right-0 z-[100] bg-white/80 backdrop-blur-md border-b border-gray-100 font-sans tracking-tight h-20">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full">
                    <div className="flex justify-between items-center h-full">

                        {/* LOGO */}
                        <Link to="/resident-home" className="flex items-center gap-3 group">
                            <img
                                src="/SSLOGO.png"
                                alt="StraySafe Logo"
                                className="h-10 w-auto group-hover:scale-110 transition-transform"
                            />
                            <span className="font-black text-2xl tracking-tighter text-[#1a1208] uppercase">STRAYSAFE</span>
                        </Link>

                        {/* DESKTOP NAV REMOVED */}
                        <div className="hidden md:flex items-center gap-6">
                            {/* Search Input - Hidden on Profile page as it has its own search */}
                            {location.pathname !== '/resident/profile' && (
                                <div className="relative group">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <svg className="h-4 w-4 text-gray-400 group-focus-within:text-[#F97316] transition-colors" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                            <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                                        </svg>
                                    </div>
                                    <input
                                        type="text"
                                        value={searchValue || ''}
                                        onChange={(e) => onSearch && onSearch(e.target.value)}
                                        placeholder="Search reports..."
                                        className="block w-64 pl-10 pr-3 py-2 border border-gray-200 rounded-2xl leading-5 bg-gray-50 placeholder-gray-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#F97316]/20 focus:border-[#F97316] transition-all sm:text-sm font-medium text-[#1a1208]"
                                    />
                                </div>
                            )}

                            {/* Notification Bell */}
                            <div className="relative">
                                <button 
                                    onClick={() => {
                                        const nextState = !isNotificationOpen;
                                        setIsNotificationOpen(nextState);
                                        if (nextState && unreadCount > 0) {
                                            markAllAsRead();
                                        }
                                    }}
                                    className="relative p-2 text-[#4a3b28] hover:bg-gray-50 rounded-xl transition-all group"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                                    </svg>
                                    {unreadCount > 0 && (
                                        <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 bg-[#EF4444] border-2 border-white rounded-full flex items-center justify-center text-[9px] font-black text-white shadow-sm">
                                            {unreadCount > 9 ? '9+' : unreadCount}
                                        </span>
                                    )}
                                </button>

                                {/* Notification Dropdown */}
                                {isNotificationOpen && (
                                    <>
                                        <div className="fixed inset-0 z-10" onClick={() => setIsNotificationOpen(false)} />
                                        <div className="absolute right-0 mt-3 w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 py-4 z-20 animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
                                            <div className="px-5 mb-3 flex justify-between items-center">
                                                <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">Notifications</h3>
                                                {unreadCount > 0 && (
                                                    <button 
                                                        onClick={markAllAsRead}
                                                        className="text-[10px] font-bold text-[#F97316] hover:underline"
                                                    >
                                                        Mark all as read
                                                    </button>
                                                )}
                                            </div>

                                            <div className="max-h-[350px] overflow-y-auto custom-scrollbar">
                                                {notifications.length === 0 ? (
                                                    <div className="px-5 py-8 text-center">
                                                        <p className="text-sm font-bold text-gray-300">No notifications yet</p>
                                                    </div>
                                                ) : (
                                                    notifications.map((notif) => (
                                                        <div 
                                                            key={notif.notification_id}
                                                            onClick={() => markAsRead(notif.notification_id)}
                                                            className={`px-5 py-4 border-b border-gray-50 last:border-0 hover:bg-[#FAFAF9] transition-all cursor-pointer relative ${!notif.is_read ? 'bg-orange-50/30' : ''}`}
                                                        >
                                                            {!notif.is_read && (
                                                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#F97316]"></div>
                                                            )}
                                                            <p className="text-[11px] font-black text-[#1a1208] mb-1">{notif.title}</p>
                                                            <p className="text-[11px] text-[#4a3b28] leading-relaxed mb-2">{notif.message}</p>
                                                            <span className="text-[9px] font-bold text-gray-400">
                                                                {new Date(notif.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {new Date(notif.created_at).toLocaleDateString()}
                                                            </span>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* Only Profile Dropdown remains on desktop */}
                            
                            {/* PROFILE DROPDOWN */}
                            <div className="relative">
                                <button
                                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                    className="relative group focus:outline-none"
                                >
                                    {/* Avatar Container */}
                                    <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-white shadow-md group-hover:border-[#F97316] transition-all duration-300">
                                        <img
                                            src={profilePic}
                                            alt="User"
                                            className="w-full h-full object-cover bg-gray-100"
                                        />
                                    </div>

                                    {/* Overlapping Arrow Button */}
                                    <div className={`absolute bottom-0 right-0 w-6 h-6 rounded-full bg-[#1a1208] border-2 border-white flex items-center justify-center text-white shadow-lg transition-transform duration-300 ${isDropdownOpen ? 'rotate-180 bg-[#F97316]' : 'group-hover:scale-110'}`}>
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </div>
                                </button>

                                {/* DROPDOWN MENU */}
                                {isDropdownOpen && (
                                    <>
                                        <div className="fixed inset-0 z-10" onClick={() => setIsDropdownOpen(false)} />
                                        <div className="absolute right-0 mt-3 w-56 bg-white rounded-2xl shadow-2xl border border-gray-100 py-3 z-20 animate-in fade-in zoom-in-95 duration-200">

                                            <Link to="/resident/profile" className="flex items-center px-6 py-3 text-xs font-bold text-[#4a3b28] hover:bg-[#FAFAF9] hover:text-[#F97316] transition-all">
                                                View Profile
                                            </Link>
                                            <Link to="/resident/pets" className="flex items-center px-6 py-3 text-xs font-bold text-[#4a3b28] hover:bg-[#FAFAF9] hover:text-[#F97316] transition-all">
                                                My Pets
                                            </Link>
                                            <Link to="/resident/settings" className="flex items-center px-6 py-3 text-xs font-bold text-[#4a3b28] hover:bg-[#FAFAF9] hover:text-[#F97316] transition-all">
                                                Preferences
                                            </Link>
                                            <div className="mx-4 my-2 h-[1px] bg-gray-50" />
                                            <button
                                                onClick={handleLogout}
                                                className="w-full flex items-center px-6 py-3 text-xs font-black text-[#EF4444] hover:bg-red-50 transition-all uppercase tracking-widest"
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
                            {/* Notification Bell */}
                            <button 
                                onClick={() => {
                                    setIsNotificationOpen(true);
                                    if (unreadCount > 0) {
                                        markAllAsRead();
                                    }
                                }}
                                className="p-2.5 text-[#4a3b28] hover:text-[#F97316] transition-all relative flex items-center justify-center active:scale-95"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                                </svg>
                                {unreadCount > 0 && (
                                    <span className="absolute top-2 right-2 min-w-[18px] h-[18px] px-1 bg-[#EF4444] border-2 border-white rounded-full flex items-center justify-center text-[9px] font-black text-white shadow-sm">
                                        {unreadCount > 9 ? '9+' : unreadCount}
                                    </span>
                                )}
                            </button>

                            {/* Menu Toggle */}
                            <button
                                onClick={toggleMenu}
                                className="p-3 text-[#1a1208] hover:bg-gray-50 rounded-2xl transition-all flex items-center justify-center border border-gray-50 shadow-sm active:scale-95"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            </nav>

            {/* MOBILE MENU (DASHBOARD LAYOUT) */}
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
        </>
    );
};

export default ResiNavbar;
