import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Button from './Button';
import QRScannerModal from './Modals/QRScannerModal';

const AdminSidebar = () => {
    const [isOpen, setIsOpen] = useState(true);
    const [isQRScannerOpen, setIsQRScannerOpen] = useState(false);
    const location = useLocation();

    const menuItems = [
        {
            path: '/admin/dashboard',
            label: 'Global Overview',
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM4.332 8.027a6.012 6.012 0 011.912-2.706C6.512 5.73 6.974 6 7.5 6A1.5 1.5 0 019 7.5V8a2 2 0 004 0 2 2 0 011.523-1.943A5.977 5.977 0 0116 10c0 .34-.028.675-.083 1H15a2 2 0 00-2 2v2.197A5.973 5.973 0 0110 16v-2a2 2 0 00-2-2 2 2 0 01-2-2 2 2 0 00-1.668-1.973z" clipRule="evenodd" />
                </svg>
            )
        },
        {
            path: '/admin/pet-records',
            label: 'Pet Records',
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 21.5c-3.038 0-5.5-2.462-5.5-5.5s2.462-5.5 5.5-5.5s5.5 2.462 5.5 5.5s-2.462 5.5-5.5 5.5zm-5.5-12c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5s2.5 1.119 2.5 2.5s-1.119 2.5-2.5 2.5zm11 0c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5s2.5 1.119 2.5 2.5s-1.119 2.5-2.5 2.5zM12 8c-1.381 0-2.5-1.119-2.5-2.5S10.619 3 12 3s2.5 1.119 2.5 2.5S13.381 8 12 8z" />
                </svg>
            )
        },

        {
            path: '/admin/incidents',
            label: 'Report Management',
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                </svg>
            )
        },
        {
            path: '/admin/users',
            label: 'User Management',
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                </svg>
            )
        },
        {
            path: '/admin/logs',
            label: 'Audit & Security',
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
            )
        },

        {
            isAction: true,
            onClick: () => setIsQRScannerOpen(true),
            label: 'Scan QR Collar',
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h.01M16 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            )
        }
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
                            MENU
                        </h2>
                    )}
                </div>


                {/* Navigation */}
                <nav className="space-y-1">
                    {menuItems.map((item) => {
                        if (item.isAction) {
                            return (
                                <div key={item.label} className="relative group overflow-hidden">
                                    <button
                                        onClick={item.onClick}
                                        className={`w-full flex items-center py-3 font-bold text-xs uppercase tracking-widest transition-colors text-gray-400 hover:text-[#F97316] hover:bg-orange-50/50 cursor-pointer ${isOpen ? 'px-8' : 'justify-center px-0'}`}
                                    >
                                        <span className="shrink-0">{item.icon}</span>
                                        {isOpen && <span className="ml-4 whitespace-nowrap animate-in fade-in duration-300">{item.label}</span>}
                                    </button>
                                </div>
                            );
                        }
                        const isActive = item.path ? location.pathname === item.path : false;
                        return (
                            <div key={item.path} className="relative group overflow-hidden">
                                {isActive && (
                                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#F97316] rounded-r-full"></div>
                                )}
                                <Link 
                                    to={item.path || '#'} 
                                    className={`flex items-center py-3 font-bold text-xs uppercase tracking-widest transition-colors ${
                                        isActive 
                                            ? 'bg-orange-50 text-[#F97316]' 
                                            : 'text-gray-400 hover:text-gray-700 hover:bg-gray-50'
                                    } ${isOpen ? 'px-8' : 'justify-center px-0'}`}
                                >
                                    <span className="shrink-0">{item.icon}</span>
                                    {isOpen && <span className="ml-4 whitespace-nowrap animate-in fade-in duration-300">{item.label}</span>}
                                </Link>
                            </div>
                        );
                    })}
                </nav>
            </div>

            <QRScannerModal isOpen={isQRScannerOpen} onClose={() => setIsQRScannerOpen(false)} />

        </aside>
    );
};

export default AdminSidebar;
