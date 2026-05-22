import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Button from './Button';

const BrgySidebar = () => {
    const [isOpen, setIsOpen] = useState(true);
    const location = useLocation();

    const menuItems = [
        {
            path: '/brgy/operations',
            label: 'Operations Hub',
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M3 3a1 1 0 000 2v10a1 1 0 000 2h10a1 1 0 001-1V5a1 1 0 00-1-1H3zm2 2h8v10H5V5z" clipRule="evenodd" />
                    <path d="M7 7h4v2H7V7zm0 4h4v2H7v-2z" />
                </svg>
            )
        },
        {
            path: '/brgy/rescue-requests',
            label: 'Rescue Requests',
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M10 2a8 8 0 100 16 8 8 0 000-16zm0 14a6 6 0 110-12 6 6 0 010 12zm-1-5h2v2h-2v-2zm0-6h2v4h-2V5z" />
                </svg>
            )
        },
        {
            path: '/brgy/map-direction',
            label: 'Mission Tracker',
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                </svg>
            )
        },
        {
            path: '/brgy/heatmap',
            label: 'Area HeatMap',
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                </svg>
            )
        },
        {
            path: '/brgy/monitoring',
            label: 'Observation Hub',
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
            )
        },
        {
            path: '/brgy/history',
            label: 'Report History',
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                </svg>
            )
        },
        {
            path: '/brgy/teams',
            label: 'Personnel Directory',
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                </svg>
            )
        },
        {
            path: '/brgy/settings',
            label: 'Staff Settings',
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                </svg>
            )
        },
    ];

    return (
        <aside className={`${isOpen ? 'w-64' : 'w-20'} relative bg-white border-r border-gray-100 flex flex-col justify-between flex-shrink-0 transition-all duration-300 z-50`}>

            {/* Toggle Button */}
            <Button
                onClick={() => setIsOpen(!isOpen)}
                variant="light"
                size="icon-sm"
                className="absolute -right-3 top-8 z-50 text-gray-400 w-7 h-7"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 transition-transform duration-300 ${!isOpen && 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
            </Button>

            <div className="overflow-hidden">
                {/* Menu Title */}
                <div className="pt-10 pb-6 px-6 flex items-center h-[88px]">
                    {isOpen && (
                        <h2 className="text-xs font-extrabold text-gray-400 uppercase tracking-widest animate-in fade-in duration-300">
                            BRGY STAFF
                        </h2>
                    )}
                </div>


                {/* Navigation */}
                <nav className="space-y-1">
                    {menuItems.map((item) => {
                        const isActive = location.pathname === item.path;
                        return (
                            <div key={item.path} className="relative group overflow-hidden">
                                {isActive && (
                                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#F97316] rounded-r-full"></div>
                                )}
                                <Link
                                    to={item.path}
                                    className={`flex items-center py-3 font-bold text-xs uppercase tracking-widest transition-colors ${isActive
                                        ? 'bg-orange-50 text-[#F97316]'
                                        : 'text-gray-400 hover:text-gray-700 hover:bg-gray-50'
                                        } ${isOpen ? 'px-8' : 'justify-center px-0'}`}
                                >
                                    <span className="shrink-0">{item.icon}</span>
                                    {isOpen && (
                                        <span className={`ml-4 whitespace-nowrap animate-in fade-in duration-300 ${item.label.length > 18 ? 'text-[9.5px]' : ''}`}>
                                            {item.label}
                                        </span>
                                    )}
                                </Link>
                            </div>
                        );
                    })}
                </nav>
            </div>

        </aside>
    );
};

export default BrgySidebar;
