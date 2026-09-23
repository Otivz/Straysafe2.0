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

    return (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-gray-200/80 px-4 py-2 pb-[calc(env(safe-area-inset-bottom,0px)+8px)] z-[9990] flex items-center justify-around shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
            {/* 1. Dashboard */}
            <button
                type="button"
                onClick={() => navigate('/subd/dashboard')}
                className={`flex flex-col items-center justify-center min-h-[44px] min-w-[64px] transition-colors group cursor-pointer ${
                    activeTab === 'dashboard' ? 'text-[#F97316]' : 'text-slate-400 hover:text-[#F97316]'
                }`}
            >
                <svg className="h-5 w-5 transition-transform group-active:scale-95" fill={activeTab === 'dashboard' ? 'currentColor' : 'none'} viewBox={activeTab === 'dashboard' ? '0 0 20 20' : '0 0 24 24'} stroke={activeTab === 'dashboard' ? 'none' : 'currentColor'} strokeWidth={activeTab === 'dashboard' ? undefined : 2}>
                    {activeTab === 'dashboard' ? (
                        <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
                    ) : (
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                    )}
                </svg>
                <span className={`text-[10px] tracking-tight mt-0.5 ${activeTab === 'dashboard' ? 'font-black' : 'font-bold'}`}>
                    Dashboard
                </span>
            </button>

            {/* 2. Reports */}
            <button
                type="button"
                onClick={() => navigate('/subd/reports')}
                className={`flex flex-col items-center justify-center min-h-[44px] min-w-[64px] transition-colors group cursor-pointer ${
                    activeTab === 'reports' ? 'text-[#F97316]' : 'text-slate-400 hover:text-[#F97316]'
                }`}
            >
                <svg className="h-5 w-5 transition-transform group-active:scale-95" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className={`text-[10px] tracking-tight mt-0.5 ${activeTab === 'reports' ? 'font-black' : 'font-bold'}`}>
                    Reports
                </span>
            </button>

            {/* 3. Map */}
            <button
                type="button"
                onClick={handleMapClick}
                className={`flex flex-col items-center justify-center min-h-[44px] min-w-[64px] transition-colors group cursor-pointer ${
                    activeTab === 'map' ? 'text-[#F97316]' : 'text-slate-400 hover:text-[#F97316]'
                }`}
            >
                <svg className="h-5 w-5 transition-transform group-active:scale-95" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className={`text-[10px] tracking-tight mt-0.5 ${activeTab === 'map' ? 'font-black' : 'font-bold'}`}>
                    Map
                </span>
            </button>

            {/* 4. Profile */}
            <button
                type="button"
                onClick={() => navigate('/subd/profile')}
                className={`flex flex-col items-center justify-center min-h-[44px] min-w-[64px] transition-colors group cursor-pointer ${
                    activeTab === 'profile' ? 'text-[#F97316]' : 'text-slate-400 hover:text-[#F97316]'
                }`}
            >
                <svg className="h-5 w-5 transition-transform group-active:scale-95" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span className={`text-[10px] tracking-tight mt-0.5 ${activeTab === 'profile' ? 'font-black' : 'font-bold'}`}>
                    Profile
                </span>
            </button>
        </nav>
    );
};

export default SubdBottomNav;
