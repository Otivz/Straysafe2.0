import React from 'react';
import { useNavigate } from 'react-router-dom';

interface SubdBottomNavProps {
    activeTab?: 'dashboard' | 'reports' | 'facility' | 'records' | 'map';
    onMapClick?: () => void;
}

const SubdBottomNav: React.FC<SubdBottomNavProps> = ({
    activeTab = 'dashboard',
}) => {
    const navigate = useNavigate();

    const navItemBase = 'relative flex flex-col items-center gap-0.5 min-w-[50px] transition-all duration-200 active:scale-90 select-none cursor-pointer';
    const activeColor = 'text-role';
    const inactiveColor = 'text-slate-400 hover:text-slate-600';

    return (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30">
            {/* Glass bar */}
            <div className="relative bg-role-soft/95 backdrop-blur-2xl border-t-2 border-role-border shadow-[0_-8px_32px_rgba(0,0,0,0.08)] flex items-center justify-around px-2 pt-2 pb-[calc(env(safe-area-inset-bottom,0px)+8px)] transition-colors duration-200">
                
                {/* 1. Dashboard */}
                <button
                    type="button"
                    onClick={() => navigate('/subd/dashboard')}
                    className={`${navItemBase} ${activeTab === 'dashboard' ? activeColor : inactiveColor}`}
                    title="Subdivision Dashboard"
                >
                    <span className={`absolute -top-1.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-role transition-all duration-300 ${activeTab === 'dashboard' ? 'opacity-100 scale-100' : 'opacity-0 scale-0'}`} />
                    <div className={`p-1.5 rounded-xl transition-all duration-200 ${activeTab === 'dashboard' ? 'bg-role-soft' : ''}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
                        </svg>
                    </div>
                    <span className={`text-[9px] uppercase tracking-wider ${activeTab === 'dashboard' ? 'font-black' : 'font-bold'}`}>
                        Dashboard
                    </span>
                </button>

                {/* 2. Reports */}
                <button
                    type="button"
                    onClick={() => navigate('/subd/reports')}
                    className={`${navItemBase} ${activeTab === 'reports' ? activeColor : inactiveColor}`}
                    title="Incident Reports"
                >
                    <span className={`absolute -top-1.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-role transition-all duration-300 ${activeTab === 'reports' ? 'opacity-100 scale-100' : 'opacity-0 scale-0'}`} />
                    <div className={`p-1.5 rounded-xl transition-all duration-200 ${activeTab === 'reports' ? 'bg-role-soft' : ''}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                    </div>
                    <span className={`text-[9px] uppercase tracking-wider ${activeTab === 'reports' ? 'font-black' : 'font-bold'}`}>
                        Reports
                    </span>
                </button>

                {/* 3. Holding Facility */}
                <button
                    type="button"
                    onClick={() => navigate('/subd/holding-facility')}
                    className={`${navItemBase} ${activeTab === 'facility' ? activeColor : inactiveColor}`}
                    title="Holding Facility"
                >
                    <span className={`absolute -top-1.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-role transition-all duration-300 ${activeTab === 'facility' ? 'opacity-100 scale-100' : 'opacity-0 scale-0'}`} />
                    <div className={`p-1.5 rounded-xl transition-all duration-200 ${activeTab === 'facility' ? 'bg-role-soft' : ''}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                    </div>
                    <span className={`text-[9px] uppercase tracking-wider ${activeTab === 'facility' ? 'font-black' : 'font-bold'}`}>
                        Holding Facility
                    </span>
                </button>

                {/* 4. Pet Records */}
                <button
                    type="button"
                    onClick={() => navigate('/subd/pet-records')}
                    className={`${navItemBase} ${activeTab === 'records' ? activeColor : inactiveColor}`}
                    title="Pet Records"
                >
                    <span className={`absolute -top-1.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-role transition-all duration-300 ${activeTab === 'records' ? 'opacity-100 scale-100' : 'opacity-0 scale-0'}`} />
                    <div className={`p-1.5 rounded-xl transition-all duration-200 ${activeTab === 'records' ? 'bg-role-soft' : ''}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                    </div>
                    <span className={`text-[9px] uppercase tracking-wider ${activeTab === 'records' ? 'font-black' : 'font-bold'}`}>
                        Pet Records
                    </span>
                </button>
            </div>
        </nav>
    );
};

export default SubdBottomNav;
