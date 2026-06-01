import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Button from './Button';

interface BrgySidebarProps {
    isMobileOpen?: boolean;
    onCloseMobile?: () => void;
}

const BrgySidebar = ({ isMobileOpen, onCloseMobile }: BrgySidebarProps) => {
    const [isOpen, setIsOpen] = useState(true);
    const location = useLocation();

    const menuItems = [
        {
            path: '/brgy/dashboard',
            label: 'Dashboard',
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
                </svg>
            )
        },
        {
            path: '/brgy/rescue-requests',
            label: 'Incident Reports',
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
            )
        },
        {
            path: '/brgy/operations',
            label: 'Rescue Operations',
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                </svg>
            )
        },
        {
            path: '/brgy/community-alerts',
            label: 'Community Alerts',
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 3a1 1 0 00-1.447-.894L8.763 6H5a3 3 0 000 6h.28l1.771 5.316A1 1 0 008 18h1a1 1 0 001-1v-4.382l6.553 3.276A1 1 0 0018 15V3z" clipRule="evenodd" />
                </svg>
            )
        }
    ];

    const renderSidebarContent = (showFullText: boolean, isMobileView: boolean) => (
        <div className="overflow-hidden flex flex-col h-full">
            {/* Menu Title */}
            <div className="pt-10 pb-6 px-6 flex items-center h-[88px] justify-between shrink-0">
                {showFullText && (
                    <h2 className="text-xs font-extrabold text-gray-400 uppercase tracking-widest animate-in fade-in duration-300">
                        BRGY STAFF
                    </h2>
                )}
                {isMobileView && onCloseMobile && (
                    <button 
                        onClick={onCloseMobile}
                        className="text-gray-400 hover:text-gray-600 p-1.5 hover:bg-gray-50 rounded-xl transition-all"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5.5 w-5.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                )}
            </div>

            {/* Navigation */}
            <nav className="space-y-1 flex-1 overflow-y-auto">
                {menuItems.map((item) => {
                    const isActive = location.pathname === item.path;
                    return (
                        <div key={item.path} className="relative group overflow-hidden">
                            {isActive && (
                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#F97316] rounded-r-full"></div>
                            )}
                            <Link
                                to={item.path}
                                onClick={isMobileView ? onCloseMobile : undefined}
                                className={`flex items-center py-3 font-bold text-xs uppercase tracking-widest transition-colors ${isActive
                                    ? 'bg-orange-50 text-[#F97316]'
                                    : 'text-gray-400 hover:text-gray-700 hover:bg-gray-50'
                                    } ${showFullText ? 'px-8' : 'justify-center px-0'}`}
                            >
                                <span className="shrink-0">{item.icon}</span>
                                {showFullText && (
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
    );

    return (
        <>
            {/* DESKTOP SIDEBAR */}
            <aside className={`hidden lg:flex ${isOpen ? 'w-64' : 'w-20'} relative bg-white border-r border-gray-100 flex flex-col justify-between flex-shrink-0 transition-all duration-300 z-50 h-screen sticky top-0`}>
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

                {renderSidebarContent(isOpen, false)}
            </aside>

            {/* MOBILE DRAWER OVERLAY */}
            {isMobileOpen && (
                <div className="lg:hidden fixed inset-0 z-[1000] flex">
                    {/* Backdrop */}
                    <div 
                        className="fixed inset-0 bg-[#1a1208]/60 backdrop-blur-sm animate-in fade-in duration-300"
                        onClick={onCloseMobile}
                    />
                    
                    {/* Drawer Content */}
                    <aside className="relative bg-white w-64 h-full flex flex-col justify-between shadow-2xl animate-in slide-in-from-left duration-300 z-[1010]">
                        {renderSidebarContent(true, true)}
                    </aside>
                </div>
            )}
        </>
    );
};

export default BrgySidebar;
