import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import axios from 'axios';
import Button from './Button';
import QRScannerModal from './Modals/QRScannerModal';

const AdminSidebar = () => {
    const [isOpen, setIsOpen] = useState(true);
    const [isQRScannerOpen, setIsQRScannerOpen] = useState(false);
    const [activeReportsCount, setActiveReportsCount] = useState<number>(0);
    const location = useLocation();

    useEffect(() => {
        const fetchCounts = async () => {
            try {
                const viewed = new Set(JSON.parse(localStorage.getItem('straysafe_viewed_admin_reports') || '[]'));
                const res = await axios.get('http://localhost:8000/reports/');
                if (Array.isArray(res.data)) {
                    // Active non-closed reports (status_id != 3, 9, 10, 11, 12, 14) that have not been viewed yet
                    const unviewedActive = res.data.filter((r: any) => {
                        const sid = r.current_status_id || r.status_id;
                        return ![3, 9, 10, 11, 12, 14].includes(sid) && !viewed.has(r.report_id);
                    }).length;
                    setActiveReportsCount(unviewedActive);
                }
            } catch (e) {
                console.warn("Could not fetch admin reports count", e);
            }
        };

        fetchCounts();
        const interval = setInterval(fetchCounts, 4000);

        window.addEventListener('straysafe_admin_viewed', fetchCounts);
        window.addEventListener('storage', fetchCounts);

        return () => {
            clearInterval(interval);
            window.removeEventListener('straysafe_admin_viewed', fetchCounts);
            window.removeEventListener('storage', fetchCounts);
        };
    }, []);

    const menuGroups = [
        {
            groupTitle: 'OVERVIEW',
            items: [
                {
                    path: '/admin/dashboard',
                    label: 'Global Overview',
                    icon: (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM4.332 8.027a6.012 6.012 0 011.912-2.706C6.512 5.73 6.974 6 7.5 6A1.5 1.5 0 019 7.5V8a2 2 0 004 0 2 2 0 011.523-1.943A5.977 5.977 0 0116 10c0 .34-.028.675-.083 1H15a2 2 0 00-2 2v2.197A5.973 5.973 0 0110 16v-2a2 2 0 00-2-2 2 2 0 01-2-2 2 2 0 00-1.668-1.973z" clipRule="evenodd" />
                        </svg>
                    )
                },
                {
                    path: '/admin/incidents',
                    label: 'Global Map',
                    icon: (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l5.447 2.724A1 1 0 0021 18.724V7.955a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                        </svg>
                    )
                },
                {
                    path: '/admin/analytics',
                    label: 'System Analytics',
                    icon: (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                    )
                }
            ]
        },
        {
            groupTitle: 'MANAGEMENT',
            items: [
                {
                    path: '/admin/users',
                    label: 'User Management',
                    icon: (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0019 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                        </svg>
                    )
                },
                {
                    path: '/admin/subdivisions',
                    label: 'Subdivision Management',
                    icon: (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5m0 0h4m-4 0V11m0 0h4M9 11h4" />
                        </svg>
                    )
                },
                {
                    path: '/admin/pet-records',
                    label: 'Animal & Adoption Records',
                    icon: (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 21.5c-3.038 0-5.5-2.462-5.5-5.5s2.462-5.5 5.5-5.5s5.5 2.462 5.5 5.5s-2.462 5.5-5.5 5.5zm-5.5-12c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5s2.5 1.119 2.5 2.5s-1.119 2.5-2.5 2.5zm11 0c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5s2.5 1.119 2.5 2.5s-1.119 2.5-2.5 2.5zM12 8c-1.381 0-2.5-1.119-2.5-2.5S10.619 3 12 3s2.5 1.119 2.5 2.5S13.381 8 12 8z" />
                        </svg>
                    )
                },
                {
                    path: '/admin/incidents',
                    label: 'Report Management',
                    badgeCount: activeReportsCount,
                    icon: (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                        </svg>
                    )
                }
            ]
        },
        {
            groupTitle: 'INTELLIGENCE',
            items: [
                {
                    path: '/admin/ai-performance',
                    label: 'AI Performance',
                    icon: (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                    )
                },
                {
                    path: '/admin/duplicates',
                    label: 'Duplicate Detection',
                    icon: (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                    )
                }
            ]
        },
        {
            groupTitle: 'SECURITY',
            items: [
                {
                    path: '/admin/logs',
                    label: 'Audit & Security',
                    icon: (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                    )
                },
                {
                    path: '/admin/config',
                    label: 'System Configuration',
                    icon: (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                    )
                }
            ]
        },
        {
            groupTitle: 'SYSTEM',
            items: [
                {
                    path: '/admin/health',
                    label: 'System Health',
                    icon: (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                    )
                },
                {
                    isAction: true,
                    onClick: () => setIsQRScannerOpen(true),
                    label: 'Scan QR Collar',
                    icon: (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h.01M16 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    )
                }
            ]
        }
    ];

    return (
        <aside className={`${isOpen ? 'w-64' : 'w-20'} relative bg-white border-r border-gray-100 flex flex-col justify-between flex-shrink-0 transition-all duration-300 z-50 h-screen overflow-y-auto scrollbar-thin`}>

            {/* Toggle Button */}
            <Button
                onClick={() => setIsOpen(!isOpen)}
                variant="light"
                size="icon-sm"
                className="absolute -right-3 top-6 z-50 text-gray-400 bg-white border border-gray-200 shadow-sm rounded-full w-7 h-7 flex items-center justify-center hover:bg-gray-50"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 transition-transform duration-300 ${!isOpen && 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
            </Button>

            <div>
                {/* Header Branding */}
                <div className="pt-6 pb-4 px-6 flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-xl bg-[#1A4543] flex items-center justify-center text-white shrink-0 shadow-sm">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                        </svg>
                    </div>
                    {isOpen && (
                        <div className="flex flex-col">
                            <span className="text-sm font-black tracking-tight text-[#1A4543] leading-none">STRAYSAFE</span>
                            <span className="text-[9px] font-extrabold text-[#F97316] uppercase tracking-wider mt-1 leading-none">ADMIN PORTAL</span>
                        </div>
                    )}
                </div>

                <div className="h-px bg-gray-100 mx-4 my-2"></div>

                {/* Grouped Navigation */}
                <nav className="py-2 space-y-5">
                    {menuGroups.map((group) => (
                        <div key={group.groupTitle} className="space-y-1">
                            {isOpen && (
                                <h3 className="px-6 text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
                                    {group.groupTitle}
                                </h3>
                            )}
                            {group.items.map((item: any) => {
                                if (item.isAction) {
                                    return (
                                        <button
                                            key={item.label}
                                            onClick={item.onClick}
                                            className={`w-full flex items-center py-2.5 font-medium text-xs transition-all text-gray-500 hover:text-[#F97316] hover:bg-orange-50/60 cursor-pointer ${isOpen ? 'px-6 space-x-3' : 'justify-center px-0'}`}
                                        >
                                            <span className="shrink-0 text-gray-400 group-hover:text-[#F97316]">{item.icon}</span>
                                            {isOpen && <span className="truncate text-[11px] font-semibold">{item.label}</span>}
                                        </button>
                                    );
                                }
                                const isActive = location.pathname === item.path;
                                const hasBadge = !!(item.badgeCount && item.badgeCount > 0);
                                return (
                                    <Link
                                        key={item.label}
                                        to={item.path}
                                        className={`relative flex items-center py-2.5 text-xs transition-all ${isActive
                                                ? 'bg-orange-50/80 text-[#F97316] font-bold border-l-4 border-[#F97316]'
                                                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50 font-medium'
                                            } ${isOpen ? 'px-6 space-x-3' : 'justify-center px-0'}`}
                                    >
                                        <span className={`shrink-0 ${isActive ? 'text-[#F97316]' : 'text-gray-400'}`}>{item.icon}</span>
                                        {isOpen && (
                                            <div className="flex-1 flex items-center justify-between overflow-hidden">
                                                <span className="truncate text-[11px]">{item.label}</span>
                                                {hasBadge && (
                                                    <span className="ml-2 shrink-0 bg-[#F97316] text-white text-[9px] font-black px-2 py-0.5 rounded-full shadow-sm">
                                                        {item.badgeCount}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </Link>
                                );
                            })}
                        </div>
                    ))}
                </nav>
            </div>

            {/* Bottom Footer Illustration Banner */}
            {isOpen && (
                <div className="p-4 m-4 bg-orange-50/60 border border-orange-100 rounded-2xl flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-xl bg-orange-100 text-[#F97316] flex items-center justify-center shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 21.5c-3.038 0-5.5-2.462-5.5-5.5s2.462-5.5 5.5-5.5s5.5 2.462 5.5 5.5s-2.462 5.5-5.5 5.5zm-5.5-12c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5s2.5 1.119 2.5 2.5s-1.119 2.5-2.5 2.5zm11 0c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5s2.5 1.119 2.5 2.5s-1.119 2.5-2.5 2.5z" />
                        </svg>
                    </div>
                    <p className="text-[10px] font-bold text-gray-600 leading-tight">
                        Stronger communities safer for every stray.
                    </p>
                </div>
            )}

            <QRScannerModal isOpen={isQRScannerOpen} onClose={() => setIsQRScannerOpen(false)} />
        </aside>
    );
};

export default AdminSidebar;
