import { Link, useLocation } from 'react-router-dom';

interface ResiMobileNavProps {
    isNavbarMenuOpen?: boolean;
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

    if (isNavbarMenuOpen || isSearchOpen) return null;

    const isHome = location.pathname === '/resident-home' && (feedTab === 'reports' || !feedTab);
    const isMyReports = (location.pathname === '/resident/profile' && location.search.includes('tab=reports')) ||
                        location.pathname.startsWith('/resident/reports') ||
                        location.pathname.startsWith('/resident/report/');
    const isMyPets = location.pathname === '/resident/pets' || location.pathname.startsWith('/resident/pet');

    const navItemBase = 'relative flex flex-col items-center gap-0.5 min-w-[52px] transition-all duration-200 active:scale-90 select-none cursor-pointer';
    const activeColor = 'text-[#F97316]';
    const inactiveColor = 'text-gray-400 dark:text-gray-500';

    return (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-[700]">
            {/* Glass bar */}
            <div className="relative bg-white/90 dark:bg-gray-900/90 backdrop-blur-2xl border-t border-gray-100/80 dark:border-gray-800 shadow-[0_-8px_32px_rgba(0,0,0,0.08)] flex items-center justify-around px-1 pt-2 pb-7 transition-colors duration-200">

                {/* 1. HOME */}
                <Link
                    to="/resident-home"
                    onClick={onFeedTabChange ? () => onFeedTabChange('reports') : undefined}
                    className={`${navItemBase} ${isHome ? activeColor : inactiveColor}`}
                >
                    {/* Active dot */}
                    <span className={`absolute -top-2 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#F97316] transition-all duration-300 ${isHome ? 'opacity-100 scale-100' : 'opacity-0 scale-0'}`} />
                    <div className={`p-1.5 rounded-xl transition-all duration-200 ${isHome ? 'bg-orange-50 dark:bg-orange-950/40' : ''}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" className={`transition-all duration-200 ${isHome ? 'h-6 w-6' : 'h-5.5 w-5.5'}`} viewBox="0 0 20 20" fill="currentColor">
                            <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
                        </svg>
                    </div>
                    <span className={`text-[8px] font-black uppercase tracking-widest transition-all duration-200 ${isHome ? 'font-black' : 'font-bold'}`}>Home</span>
                </Link>

                {/* 2. SEARCH */}
                <button
                    type="button"
                    onClick={onSearchClick}
                    className={`${navItemBase} ${onSearchClick ? inactiveColor : 'text-gray-300'}`}
                >
                    <div className="p-1.5 rounded-xl transition-all duration-200">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5.5 w-5.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                    <span className="text-[8px] font-bold uppercase tracking-widest">Search</span>
                </button>

                {/* 3. REPORT — center FAB */}
                <button
                    type="button"
                    onClick={onAddReportClick}
                    className="relative flex flex-col items-center gap-1 min-w-[52px] -mt-6 group active:scale-90 transition-transform duration-150 select-none cursor-pointer"
                >
                    {/* Button */}
                    <div className="relative w-14 h-14 bg-gradient-to-br from-[#FF8C38] to-[#F97316] rounded-full flex items-center justify-center text-white shadow-md border-4 border-white dark:border-gray-900 group-hover:shadow-lg transition-all duration-200">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 transition-transform duration-200 group-hover:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                        </svg>
                    </div>
                    <span className="text-[8px] font-black uppercase tracking-widest text-[#F97316] mt-0.5">Report</span>
                </button>

                {/* 4. MY REPORTS */}
                <Link
                    to="/resident/profile?tab=reports"
                    className={`${navItemBase} ${isMyReports ? activeColor : inactiveColor}`}
                >
                    <span className={`absolute -top-2 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#F97316] transition-all duration-300 ${isMyReports ? 'opacity-100 scale-100' : 'opacity-0 scale-0'}`} />
                    <div className={`p-1.5 rounded-xl transition-all duration-200 ${isMyReports ? 'bg-orange-50 dark:bg-orange-950/40' : ''}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" className={`transition-all duration-200 ${isMyReports ? 'h-6 w-6' : 'h-5.5 w-5.5'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                    </div>
                    <span className={`text-[8px] uppercase tracking-widest transition-all duration-200 ${isMyReports ? 'font-black' : 'font-bold'}`}>My Reports</span>
                </Link>

                {/* 5. MY PETS */}
                <Link
                    to="/resident/pets"
                    className={`${navItemBase} ${isMyPets ? activeColor : inactiveColor}`}
                >
                    <span className={`absolute -top-2 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#F97316] transition-all duration-300 ${isMyPets ? 'opacity-100 scale-100' : 'opacity-0 scale-0'}`} />
                    <div className={`p-1.5 rounded-xl transition-all duration-200 ${isMyPets ? 'bg-orange-50 dark:bg-orange-950/40' : ''}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" className={`transition-all duration-200 ${isMyPets ? 'h-6 w-6' : 'h-5.5 w-5.5'}`} viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 10.5c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3zm6.5 2c1.38 0 2.5-1.12 2.5-2.5s-1.12-2.5-2.5-2.5-2.5 1.12-2.5 2.5 1.12 2.5 2.5 2.5zm-13 0c1.38 0 2.5-1.12 2.5-2.5S6.88 7.5 5.5 7.5 3 8.62 3 10s1.12 2.5 2.5 2.5zm13 3.5c-.83 0-1.5.67-1.5 1.5 0 1.5-1.5 3-5 3s-5-1.5-5-3c0-.83-.67-1.5-1.5-1.5S7 16.67 7 17.5c0 2.76 2.69 5 6 5s6-2.24 6-5c0-.83-.67-1.5-1.5-1.5z" />
                        </svg>
                    </div>
                    <span className={`text-[8px] uppercase tracking-widest transition-all duration-200 ${isMyPets ? 'font-black' : 'font-bold'}`}>My Pets</span>
                </Link>

            </div>
        </div>
    );
};

export default ResiMobileNav;
