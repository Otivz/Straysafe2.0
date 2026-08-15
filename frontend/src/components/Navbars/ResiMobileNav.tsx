import { Link, useLocation } from 'react-router-dom';
import { DEFAULT_AVATAR, getProfilePicture } from '../../utils/avatar';

interface ResiMobileNavProps {
    isNavbarMenuOpen: boolean;
    isSearchOpen?: boolean;
    onAddReportClick?: () => void;
    onSearchClick?: () => void;
    feedTab?: 'reports' | 'announcements';
    onFeedTabChange?: (tab: 'reports' | 'announcements') => void;
}

const ResiMobileNav = ({
    isNavbarMenuOpen,
    isSearchOpen,
    onAddReportClick,
    onSearchClick,
    feedTab,
    onFeedTabChange
}: ResiMobileNavProps) => {
    const location = useLocation();
    const userStr = localStorage.getItem('resident_user');
    const user = userStr ? JSON.parse(userStr) : null;

    if (isNavbarMenuOpen || isSearchOpen) return null;

    const isHome = location.pathname === '/resident-home' && feedTab === 'reports';
    const isAnnouncements = location.pathname === '/resident-home' && feedTab === 'announcements';
    const isProfile = location.pathname === '/resident/profile';

    const navItemBase = 'relative flex flex-col items-center gap-0.5 min-w-[52px] transition-all duration-200 active:scale-90 select-none';
    const activeColor = 'text-[#F97316]';
    const inactiveColor = 'text-gray-400';

    return (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-[700]">
            {/* Glass bar */}
            <div className="relative bg-white/90 dark:bg-gray-900/90 backdrop-blur-2xl border-t border-gray-100/80 dark:border-gray-800 shadow-[0_-8px_32px_rgba(0,0,0,0.08)] flex items-center justify-around px-1 pt-2 pb-7 transition-colors duration-200">

                {/* HOME */}
                <Link
                    to="/resident-home"
                    onClick={onFeedTabChange ? () => onFeedTabChange('reports') : undefined}
                    className={`${navItemBase} ${isHome ? activeColor : inactiveColor}`}
                >
                    {/* Active dot */}
                    <span className={`absolute -top-2 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#F97316] transition-all duration-300 ${isHome ? 'opacity-100 scale-100' : 'opacity-0 scale-0'}`} />
                    <div className={`p-1.5 rounded-xl transition-all duration-200 ${isHome ? 'bg-orange-50' : ''}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" className={`transition-all duration-200 ${isHome ? 'h-6 w-6' : 'h-5.5 w-5.5 h-5 w-5'}`} viewBox="0 0 20 20" fill="currentColor">
                            <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
                        </svg>
                    </div>
                    <span className={`text-[8px] font-black uppercase tracking-widest transition-all duration-200 ${isHome ? 'font-black' : 'font-bold'}`}>Home</span>
                </Link>

                {/* SEARCH */}
                <button
                    onClick={onSearchClick}
                    className={`${navItemBase} ${onSearchClick ? inactiveColor : 'text-gray-300'}`}
                >
                    <div className="p-1.5 rounded-xl transition-all duration-200">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                    <span className="text-[8px] font-bold uppercase tracking-widest">Search</span>
                </button>

                {/* REPORT — center FAB */}
                <button
                    onClick={onAddReportClick}
                    className="relative flex flex-col items-center gap-1 min-w-[52px] -mt-6 group active:scale-90 transition-transform duration-150 select-none"
                >
                    {/* Pulse rings */}
                    <span className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-12 rounded-full bg-[#F97316]/30 animate-ping" style={{ animationDuration: '2s' }} />
                    <span className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-12 rounded-full bg-[#F97316]/15 animate-ping" style={{ animationDuration: '2.5s', animationDelay: '0.4s' }} />

                    {/* Button */}
                    <div className="relative w-14 h-14 bg-gradient-to-br from-[#FF8C38] to-[#F97316] rounded-full flex items-center justify-center text-white shadow-xl shadow-orange-300/50 border-4 border-white group-hover:shadow-orange-400/60 transition-all duration-200">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 transition-transform duration-200 group-hover:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                        </svg>
                    </div>
                    <span className="text-[8px] font-black uppercase tracking-widest text-[#F97316] mt-0.5">Report</span>
                </button>

                {/* ANNOUNCEMENTS */}
                {onFeedTabChange ? (
                    <button
                        onClick={() => onFeedTabChange('announcements')}
                        className={`${navItemBase} ${isAnnouncements ? activeColor : inactiveColor}`}
                    >
                        <span className={`absolute -top-2 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#F97316] transition-all duration-300 ${isAnnouncements ? 'opacity-100 scale-100' : 'opacity-0 scale-0'}`} />
                        <div className={`p-1.5 rounded-xl transition-all duration-200 ${isAnnouncements ? 'bg-orange-50' : ''}`}>
                            <svg xmlns="http://www.w3.org/2000/svg" className={`transition-all duration-200 ${isAnnouncements ? 'h-6 w-6' : 'h-5 w-5'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                            </svg>
                        </div>
                        <span className={`text-[8px] uppercase tracking-widest transition-all duration-200 ${isAnnouncements ? 'font-black' : 'font-bold'}`}>Announce</span>
                    </button>
                ) : (
                    <Link
                        to="/resident-home"
                        state={{ selectAnnouncements: true }}
                        className={`${navItemBase} ${isAnnouncements ? activeColor : inactiveColor}`}
                    >
                        <span className={`absolute -top-2 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#F97316] transition-all duration-300 ${isAnnouncements ? 'opacity-100 scale-100' : 'opacity-0 scale-0'}`} />
                        <div className={`p-1.5 rounded-xl transition-all duration-200 ${isAnnouncements ? 'bg-orange-50' : ''}`}>
                            <svg xmlns="http://www.w3.org/2000/svg" className={`transition-all duration-200 ${isAnnouncements ? 'h-6 w-6' : 'h-5 w-5'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                            </svg>
                        </div>
                        <span className={`text-[8px] uppercase tracking-widest transition-all duration-200 ${isAnnouncements ? 'font-black' : 'font-bold'}`}>Announce</span>
                    </Link>
                )}

                {/* PROFILE */}
                <Link
                    to="/resident/profile"
                    className={`${navItemBase} ${isProfile ? activeColor : inactiveColor}`}
                >
                    <span className={`absolute -top-2 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#F97316] transition-all duration-300 ${isProfile ? 'opacity-100 scale-100' : 'opacity-0 scale-0'}`} />
                    <div className={`p-1 rounded-xl transition-all duration-200 ${isProfile ? 'bg-orange-50' : ''}`}>
                        <div className={`w-6 h-6 rounded-full border-2 overflow-hidden bg-gray-100 transition-all duration-200 ${isProfile ? 'border-[#F97316] scale-110 shadow-sm shadow-orange-200' : 'border-gray-200'}`}>
                            <img 
                                src={getProfilePicture(user?.profile_picture)} 
                                alt="Profile" 
                                className="w-full h-full object-cover" 
                                onError={(e) => { e.currentTarget.src = DEFAULT_AVATAR; }}
                            />
                        </div>
                    </div>
                    <span className={`text-[8px] uppercase tracking-widest transition-all duration-200 ${isProfile ? 'font-black' : 'font-bold'}`}>Profile</span>
                </Link>

            </div>
        </div>
    );
};

export default ResiMobileNav;
