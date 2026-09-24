import React from 'react';
import { useNavigate } from 'react-router-dom';

export interface BrgyBottomNavProps {
    activeTab?: 'dashboard' | 'requests' | 'personnel' | 'alerts' | 'profile';
    onAlertClick?: () => void;
}

const BrgyBottomNav: React.FC<BrgyBottomNavProps> = ({
    activeTab,
    onAlertClick,
}) => {
    const navigate = useNavigate();

    const handleAlertClick = () => {
        if (onAlertClick) {
            onAlertClick();
        } else {
            navigate('/brgy/community-alerts');
        }
    };

    const navItemBase = 'relative flex flex-col items-center gap-0.5 min-w-[52px] transition-all duration-200 active:scale-90 select-none cursor-pointer';

    return (
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-[9000]">
            {/* Glass bar */}
            <div className="relative bg-white/95 backdrop-blur-2xl border-t border-slate-200/80 shadow-[0_-8px_32px_rgba(0,0,0,0.08)] flex items-center justify-around px-2 pt-2 pb-[calc(env(safe-area-inset-bottom,0px)+8px)] transition-colors duration-200">
                
                {/* 1. Dashboard */}
                <button
                    type="button"
                    onClick={() => navigate('/brgy/dashboard')}
                    className={`${navItemBase} ${activeTab === 'dashboard' ? 'text-[#1A4543]' : 'text-slate-400 hover:text-[#1A4543]'}`}
                    title="Barangay Dashboard"
                >
                    <span className={`absolute -top-1.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-[#1A4543] transition-all duration-300 ${activeTab === 'dashboard' ? 'opacity-100 scale-100' : 'opacity-0 scale-0'}`} />
                    <div className={`p-1.5 rounded-xl transition-all duration-200 ${activeTab === 'dashboard' ? 'bg-teal-50' : ''}`}>
                        <svg className="h-5 w-5 fill-current" viewBox="0 0 20 20">
                            <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
                        </svg>
                    </div>
                    <span className={`text-[9px] uppercase tracking-wider ${activeTab === 'dashboard' ? 'font-black' : 'font-bold'}`}>
                        Dashboard
                    </span>
                </button>

                {/* 2. Rescue Requests */}
                <button
                    type="button"
                    onClick={() => navigate('/brgy/rescue-requests')}
                    className={`${navItemBase} ${activeTab === 'requests' ? 'text-[#F97316]' : 'text-slate-400 hover:text-[#F97316]'}`}
                    title="Rescue Requests"
                >
                    <span className={`absolute -top-1.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-[#F97316] transition-all duration-300 ${activeTab === 'requests' ? 'opacity-100 scale-100' : 'opacity-0 scale-0'}`} />
                    <div className={`p-1.5 rounded-xl transition-all duration-200 ${activeTab === 'requests' ? 'bg-orange-50' : ''}`}>
                        <svg className="h-5 w-5 fill-current" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                    </div>
                    <span className={`text-[9px] uppercase tracking-wider ${activeTab === 'requests' ? 'font-black' : 'font-bold'}`}>
                        Requests
                    </span>
                </button>

                {/* 3. Personnel */}
                <button
                    type="button"
                    onClick={() => navigate('/brgy/personnel')}
                    className={`${navItemBase} ${activeTab === 'personnel' ? 'text-blue-600' : 'text-slate-400 hover:text-blue-600'}`}
                    title="Personnel Management"
                >
                    <span className={`absolute -top-1.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-blue-600 transition-all duration-300 ${activeTab === 'personnel' ? 'opacity-100 scale-100' : 'opacity-0 scale-0'}`} />
                    <div className={`p-1.5 rounded-xl transition-all duration-200 ${activeTab === 'personnel' ? 'bg-blue-50' : ''}`}>
                        <svg className="h-5 w-5 fill-current" viewBox="0 0 20 20">
                            <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
                        </svg>
                    </div>
                    <span className={`text-[9px] uppercase tracking-wider ${activeTab === 'personnel' ? 'font-black' : 'font-bold'}`}>
                        Personnel
                    </span>
                </button>

                {/* 4. Community Alert */}
                <button
                    type="button"
                    onClick={handleAlertClick}
                    className={`${navItemBase} ${activeTab === 'alerts' ? 'text-purple-600' : 'text-slate-400 hover:text-purple-600'}`}
                    title="Community Alerts"
                >
                    <span className={`absolute -top-1.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-purple-600 transition-all duration-300 ${activeTab === 'alerts' ? 'opacity-100 scale-100' : 'opacity-0 scale-0'}`} />
                    <div className={`p-1.5 rounded-xl transition-all duration-200 ${activeTab === 'alerts' ? 'bg-purple-50' : ''}`}>
                        <svg className="h-5 w-5 fill-current" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M18 3a1 1 0 00-1.447-.894L8.763 6H5a3 3 0 000 6h.28l1.771 5.316A1 1 0 008 18h1a1 1 0 001-1v-4.382l6.553 3.276A1 1 0 0018 15V3z" clipRule="evenodd" />
                        </svg>
                    </div>
                    <span className={`text-[9px] uppercase tracking-wider ${activeTab === 'alerts' ? 'font-black' : 'font-bold'}`}>
                        Alert
                    </span>
                </button>

                {/* 5. Profile */}
                <button
                    type="button"
                    onClick={() => navigate('/brgy/profile')}
                    className={`${navItemBase} ${activeTab === 'profile' ? 'text-slate-900' : 'text-slate-400 hover:text-slate-900'}`}
                    title="My Profile"
                >
                    <span className={`absolute -top-1.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-slate-900 transition-all duration-300 ${activeTab === 'profile' ? 'opacity-100 scale-100' : 'opacity-0 scale-0'}`} />
                    <div className={`p-1.5 rounded-xl transition-all duration-200 ${activeTab === 'profile' ? 'bg-slate-100' : ''}`}>
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={activeTab === 'profile' ? 2.5 : 2}>
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

export default BrgyBottomNav;
