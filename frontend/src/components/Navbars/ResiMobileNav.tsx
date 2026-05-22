import { Link, useLocation } from 'react-router-dom';

interface ResiMobileNavProps {
    isNavbarMenuOpen: boolean;
    isSearchOpen?: boolean;
    onAddReportClick?: () => void;
    onSearchClick?: () => void;
}

const ResiMobileNav = ({ isNavbarMenuOpen, isSearchOpen, onAddReportClick, onSearchClick }: ResiMobileNavProps) => {
    const location = useLocation();
    const userStr = localStorage.getItem('resident_user');
    const user = userStr ? JSON.parse(userStr) : null;

    if (isNavbarMenuOpen || isSearchOpen) return null;

    return (
        <div className="sm:hidden fixed bottom-0 left-0 right-0 z-[500] bg-white/80 backdrop-blur-xl border-t border-gray-100 px-6 py-3 pb-6 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] flex items-center justify-between">
            {/* Home */}
            <Link
                to="/resident-home"
                className={`flex flex-col items-center gap-1 ${location.pathname === '/resident-home' ? 'text-[#F97316]' : 'text-gray-400'}`}
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
                </svg>
                <span className="text-[8px] font-black uppercase tracking-widest">Home</span>
            </Link>

            {/* Search - Hidden on Profile page */}
            {location.pathname !== '/resident/profile' && (
                <button onClick={onSearchClick} className="flex flex-col items-center gap-1 text-gray-400">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <span className="text-[8px] font-black uppercase tracking-widest">Search</span>
                </button>
            )}

            {/* Add Report (Circular) */}
            <button
                onClick={onAddReportClick}
                className="flex flex-col items-center gap-1 group -mt-4"
            >
                <div className="w-12 h-12 bg-[#F97316] rounded-full flex items-center justify-center text-white shadow-lg shadow-orange-200 transition-transform active:scale-90 border-4 border-white">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                    </svg>
                </div>
                <span className="text-[8px] font-black uppercase tracking-widest text-gray-400 mt-1">Report</span>
            </button>

            {/* Pets */}
            <Link
                to="/resident/pets"
                className={`flex flex-col items-center gap-1 ${location.pathname === '/resident/pets' ? 'text-[#F97316]' : 'text-gray-400'}`}
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5a2 2 0 10-4 0 2 2 0 004 0ZM17 5a2 2 0 10-4 0 2 2 0 004 0ZM7 12a2 2 0 10-4 0 2 2 0 004 0ZM21 12a2 2 0 10-4 0 2 2 0 004 0ZM12 13a5 5 0 015 5 2 2 0 01-2 2H9a2 2 0 01-2-2 5 5 0 015-5z" />
                </svg>
                <span className="text-[8px] font-black uppercase tracking-widest">My Pets</span>
            </Link>

            {/* Profile */}
            <Link
                to="/resident/profile"
                className={`flex flex-col items-center gap-1 ${location.pathname === '/resident/profile' ? 'text-[#F97316]' : 'text-gray-400'}`}
            >
                <div className={`w-6 h-6 rounded-full border-2 overflow-hidden bg-gray-100 ${location.pathname === '/resident/profile' ? 'border-[#F97316]' : 'border-gray-200'}`}>
                    {user?.profile_picture ? (
                        <img src={user.profile_picture} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                        <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.name || 'User'}`} alt="Profile" className="w-full h-full object-cover" />
                    )}
                </div>
                <span className="text-[8px] font-black uppercase tracking-widest">Profile</span>
            </Link>
        </div>
    );
};

export default ResiMobileNav;
