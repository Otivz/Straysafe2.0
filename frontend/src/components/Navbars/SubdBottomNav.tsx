import React from 'react';
import { useNavigate } from 'react-router-dom';

interface SubdBottomNavProps {
    activeTab?: 'dashboard' | 'reports' | 'map' | 'profile';
    onMapClick?: () => void;
}

const SubdBottomNav: React.FC<SubdBottomNavProps> = ({
    activeTab = 'dashboard',
    onMapClick,
}) => {
    const navigate = useNavigate();

    const handleMapClick = () => {
        if (onMapClick) {
            onMapClick();
        } else {
            navigate('/subd/dashboard');
        }
    };

    const navItemBase = 'relative flex flex-col items-center gap-0.5 min-w-[54px] transition-all duration-200 active:scale-90 select-none cursor-pointer';
    const activeColor = 'text-[#F97316]';
    const inactiveColor = 'text-slate-400 hover:text-slate-600';

    return (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30">
            {/* Glass bar */}
            <div className="relative bg-white/95 backdrop-blur-2xl border-t border-gray-100/90 shadow-[0_-8px_32px_rgba(0,0,0,0.08)] flex items-center justify-around px-2 pt-2 pb-[calc(env(safe-area-inset-bottom,0px)+8px)] transition-colors duration-200">
                
                {/* 1. Dashboard */}
                <button
                    type="button"
                    onClick={() => navigate('/subd/dashboard')}
                    className={`${navItemBase} ${activeTab === 'dashboard' ? activeColor : inactiveColor}`}
                    title="Subdivision Dashboard"
                >
                    <span className={`absolute -top-1.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-[#F97316] transition-all duration-300 ${activeTab === 'dashboard' ? 'opacity-100 scale-100' : 'opacity-0 scale-0'}`} />
                    <div className={`p-1.5 rounded-xl transition-all duration-200 ${activeTab === 'dashboard' ? 'bg-orange-50' : ''}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
                        </svg>
                    </div>
                    <span className={`text-[9px] uppercase tracking-wider ${activeTab === 'dashboard' ? 'font-black' : 'font-bold'}`}>
                        Home
                    </span>
                </button>

                {/* 2. Reports */}
                <button
                    type="button"
                    onClick={() => navigate('/subd/reports')}
                    className={`${navItemBase} ${activeTab === 'reports' ? activeColor : inactiveColor}`}
                    title="Incident Reports"
                >
                    <span className={`absolute -top-1.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-[#F97316] transition-all duration-300 ${activeTab === 'reports' ? 'opacity-100 scale-100' : 'opacity-0 scale-0'}`} />
                    <div className={`p-1.5 rounded-xl transition-all duration-200 ${activeTab === 'reports' ? 'bg-orange-50' : ''}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                    </div>
                    <span className={`text-[9px] uppercase tracking-wider ${activeTab === 'reports' ? 'font-black' : 'font-bold'}`}>
                        Reports
                    </span>
                </button>

                {/* 3. Map */}
                <button
                    type="button"
                    onClick={handleMapClick}
                    className={`${navItemBase} ${activeTab === 'map' ? activeColor : inactiveColor}`}
                    title="Community Map"
                >
                    <span className={`absolute -top-1.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-[#F97316] transition-all duration-300 ${activeTab === 'map' ? 'opacity-100 scale-100' : 'opacity-0 scale-0'}`} />
                    <div className={`p-1.5 rounded-xl transition-all duration-200 ${activeTab === 'map' ? 'bg-orange-50' : ''}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                    </div>
                    <span className={`text-[9px] uppercase tracking-wider ${activeTab === 'map' ? 'font-black' : 'font-bold'}`}>
                        Map
                    </span>
                </button>

                {/* 4. Profile */}
                <button
                    type="button"
                    onClick={() => navigate('/subd/profile')}
                    className={`${navItemBase} ${activeTab === 'profile' ? activeColor : inactiveColor}`}
                    title="Leader Profile"
                >
                    <span className={`absolute -top-1.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-[#F97316] transition-all duration-300 ${activeTab === 'profile' ? 'opacity-100 scale-100' : 'opacity-0 scale-0'}`} />
                    <div className={`p-1.5 rounded-xl transition-all duration-200 ${activeTab === 'profile' ? 'bg-orange-50' : ''}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                    </div>
                    <span className={`text-[9px] uppercase tracking-wider ${activeTab === 'profile' ? 'font-black' : 'font-bold'}`}>
                        Profile
                    </span>
                </button>
            </div>
        </nav>
    );
};

export default SubdBottomNav;
