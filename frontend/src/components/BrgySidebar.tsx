import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import axios from 'axios';
import Button from './Button';
import QRScannerModal from './Modals/QRScannerModal';
import { api } from '../utils/api';

interface BrgySidebarProps {
    isMobileOpen?: boolean;
    onCloseMobile?: () => void;
    mobileOpen?: boolean;
    onMobileClose?: () => void;
}

const BrgySidebar = ({ isMobileOpen, onCloseMobile, mobileOpen, onMobileClose }: BrgySidebarProps) => {
    const [isOpen, setIsOpen] = useState(true);
    const [isQRScannerOpen, setIsQRScannerOpen] = useState(false);
    const [pendingRequestsCount, setPendingRequestsCount] = useState<number>(0);
    const [pendingClaimsCount, setPendingClaimsCount] = useState<number>(0);
    const [pendingAdoptionsCount, setPendingAdoptionsCount] = useState<number>(0);
    const [unreadMessagesCount, setUnreadMessagesCount] = useState<number>(0);
    const [overdueHoldingCount, setOverdueHoldingCount] = useState<number>(0);
    const location = useLocation();

    // Support both prop naming styles for versatility
    const isDrawerOpen = mobileOpen !== undefined ? mobileOpen : (isMobileOpen || false);
    const handleDrawerClose = onMobileClose || onCloseMobile;

    useEffect(() => {
        const fetchCounts = async () => {
            try {
                const viewed = new Set(JSON.parse(localStorage.getItem('straysafe_viewed_brgy_requests') || '[]'));
                const res = await axios.get('http://localhost:8000/reports/?escalated_only=true');
                if (Array.isArray(res.data)) {
                    // Escalated (4), Approved (13), or Rescue In Progress (5) that have not been viewed yet
                    const unviewed = res.data.filter((r: any) => {
                        const sid = r.current_status_id || r.status_id;
                        return (sid === 4 || sid === 13 || sid === 5) && !viewed.has(r.report_id);
                    }).length;
                    setPendingRequestsCount(unviewed);
                }
            } catch (e) {
                console.warn("Could not fetch brgy reports count", e);
            }

            try {
                const viewedClaimIds = new Set(JSON.parse(localStorage.getItem('straysafe_viewed_brgy_claims') || '[]'));
                const claimsRes = await axios.get('http://localhost:8000/claims/');
                if (Array.isArray(claimsRes.data)) {
                    const unviewedClaims = claimsRes.data.filter((c: any) => {
                        const isPending = c.status === 'Pending Review' || c.status === 'Evidence Requested' || c.status === 'Potential Owner Match';
                        return isPending && !viewedClaimIds.has(c.claim_id);
                    }).length;
                    setPendingClaimsCount(unviewedClaims);
                }
            } catch (e) {
                console.warn("Could not fetch brgy claims count", e);
            }

            try {
                const chatRes = await api.get('/chat/unread-count');
                if (chatRes.data && typeof chatRes.data.unread_count === 'number') {
                    setUnreadMessagesCount(chatRes.data.unread_count);
                }
            } catch (e) {
                // ignore
            }

            try {
                const adoptRes = await api.get('/adoptions/applications');
                if (Array.isArray(adoptRes.data)) {
                    const pending = adoptRes.data.filter((a: any) => a.status === 'Submitted' || a.status === 'Under Review').length;
                    setPendingAdoptionsCount(pending);
                }
            } catch (e) {
                // ignore
            }

            try {
                const savedStay = localStorage.getItem('holding_impound_stay_duration');
                const stayDays = savedStay ? parseInt(savedStay, 10) : 3;
                const holdingRes = await axios.get(`http://localhost:8000/holding/metrics?impound_days=${stayDays}`);
                if (holdingRes.data && typeof holdingRes.data.needs_impoundment === 'number') {
                    setOverdueHoldingCount(holdingRes.data.needs_impoundment);
                }
            } catch (e) {
                // ignore
            }
        };

        fetchCounts();
        const interval = setInterval(fetchCounts, 4000);

        window.addEventListener('straysafe_brgy_viewed', fetchCounts);
        window.addEventListener('straysafe_claims_viewed', fetchCounts);
        window.addEventListener('storage', fetchCounts);

        return () => {
            clearInterval(interval);
            window.removeEventListener('straysafe_brgy_viewed', fetchCounts);
            window.removeEventListener('straysafe_claims_viewed', fetchCounts);
            window.removeEventListener('storage', fetchCounts);
        };
    }, []);

    const rawUser = localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user');
    const isHeadOfficer = rawUser ? JSON.parse(rawUser).is_head_officer : false;

    const menuSections = [
        {
            title: 'OPERATIONS',
            items: [
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
                    path: '/brgy/messages',
                    label: 'Messages',
                    badgeCount: unreadMessagesCount,
                    icon: (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                    )
                },
                {
                    path: '/brgy/rescue-requests',
                    label: 'Incident Reports',
                    badgeCount: pendingRequestsCount,
                    icon: (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                    )
                },
                {
                    path: '/brgy/holding-facility',
                    label: 'Holding Facility',
                    badgeCount: overdueHoldingCount,
                    icon: (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
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
            ]
        },
        {
            title: 'ANIMAL MANAGEMENT',
            items: [
                {
                    path: '/brgy/pet-records',
                    label: 'Pet Records',
                    icon: (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 21.5c-3.038 0-5.5-2.462-5.5-5.5s2.462-5.5 5.5-5.5s5.5 2.462 5.5 5.5s-2.462 5.5-5.5 5.5zm-5.5-12c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5s2.5 1.119 2.5 2.5s-1.119 2.5-2.5 2.5zm11 0c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5s2.5 1.119 2.5 2.5s-1.119 2.5-2.5 2.5zM12 8c-1.381 0-2.5-1.119-2.5-2.5S10.619 3 12 3s2.5 1.119 2.5 2.5S13.381 8 12 8z" />
                        </svg>
                    )
                },
                {
                    path: '/brgy/pet-claims',
                    label: 'Pet Claims',
                    badgeCount: pendingClaimsCount,
                    icon: (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h.01M16 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    )
                },
                {
                    path: '/brgy/adoptions',
                    label: 'Adoptions',
                    badgeCount: pendingAdoptionsCount,
                    icon: (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
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
            ]
        },
        {
            title: 'RECORDS',
            items: [
                {
                    path: '/brgy/history',
                    label: 'Report History',
                    icon: (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.8 2.8a1 1 0 101.414-1.414L11 9.586V6z" clipRule="evenodd" />
                        </svg>
                    )
                }
            ]
        },
        {
            title: 'SYSTEM',
            items: [
                {
                    path: '/brgy/personnel',
                    label: isHeadOfficer ? 'Personnel Management' : 'Personnel Directory',
                    icon: (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
                        </svg>
                    )
                },
                {
                    path: '/brgy/settings',
                    label: 'Station Settings',
                    icon: (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                    )
                }
            ]
        }
    ];

    const renderSidebarContent = (showFullText: boolean, isMobileView: boolean) => (
        <div className="overflow-hidden flex flex-col h-full">
            {/* Brand / Logo Area */}
            <div className={`pt-6 pb-4 ${showFullText ? 'px-6' : 'px-2 justify-center'} flex items-center justify-between min-h-[76px] shrink-0`}>
                {showFullText ? (
                    <Link to="/brgy/dashboard" className="flex items-center gap-2.5 group overflow-hidden select-none">
                        <img
                            src="/SSLOGO.png"
                            alt="StraySafe Logo"
                            className="w-8 h-8 sm:w-9 sm:h-9 object-contain shrink-0 transition-transform duration-300 group-hover:scale-105"
                        />
                        <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-1 leading-none">
                                <span className="font-black text-sm tracking-tight text-[#0F172A] group-hover:text-black transition-colors">
                                    STRAY
                                </span>
                                <span className="font-black text-sm tracking-tight text-[#F97316]">
                                    SAFE
                                </span>
                            </div>
                            <span className="text-[8.5px] font-semibold text-slate-400 tracking-tight leading-tight mt-1 truncate">
                                Safer Communities. Happier Animals.
                            </span>
                        </div>
                    </Link>
                ) : (
                    <Link to="/brgy/dashboard" className="flex items-center justify-center w-full group py-1">
                        <img
                            src="/SSLOGO.png"
                            alt="StraySafe Logo"
                            className="w-8 h-8 object-contain transition-transform duration-300 group-hover:scale-110"
                        />
                    </Link>
                )}
                {isMobileView && handleDrawerClose && (
                    <button 
                        onClick={handleDrawerClose}
                        className="text-gray-400 hover:text-gray-600 p-1.5 hover:bg-gray-50 rounded-xl transition-all shrink-0 cursor-pointer ml-1"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5.5 w-5.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                )}
            </div>

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200 pb-6">
                {menuSections.map((section, idx) => (
                    <div key={section.title} className={idx > 0 ? 'mt-6' : 'mt-2'}>
                        {showFullText && (
                            <h3 className="px-8 mb-2 text-[10px] font-black text-gray-400 uppercase tracking-widest animate-in fade-in duration-300">
                                {section.title}
                            </h3>
                        )}
                        <div className="space-y-1">
                            {section.items.map((item: any) => {
                                if (item.isAction) {
                                    return (
                                        <div key={item.label} className="relative group overflow-hidden">
                                            <button
                                                onClick={() => {
                                                    if (isMobileView && handleDrawerClose) handleDrawerClose();
                                                    item.onClick?.();
                                                }}
                                                className={`w-full flex items-center py-3 font-bold text-xs uppercase tracking-widest transition-colors text-gray-400 hover:text-[#F97316] hover:bg-orange-50/50 cursor-pointer ${showFullText ? 'px-8' : 'justify-center px-0'}`}
                                            >
                                                <span className="shrink-0">{item.icon}</span>
                                                {showFullText && <span className="ml-4 whitespace-nowrap animate-in fade-in duration-300">{item.label}</span>}
                                            </button>
                                        </div>
                                    );
                                }

                                const isActive = item.path ? location.pathname === item.path || location.pathname.startsWith(item.path + '/') : false;
                                const hasBadge = !!(item.badgeCount && item.badgeCount > 0);
                                return (
                                    <div key={item.path} className="relative group overflow-hidden">
                                        {isActive && (
                                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#F97316] rounded-r-full"></div>
                                        )}
                                        <Link
                                            to={item.path}
                                            onClick={isMobileView && handleDrawerClose ? handleDrawerClose : undefined}
                                            className={`flex items-center py-3 font-bold text-xs uppercase tracking-widest transition-colors ${isActive
                                                ? 'bg-orange-50 text-[#F97316]'
                                                : 'text-gray-400 hover:text-gray-700 hover:bg-gray-50'
                                                } ${showFullText ? 'px-8' : 'justify-center px-0'}`}
                                        >
                                            <div className="relative shrink-0">
                                                {item.icon}
                                                {!showFullText && hasBadge && (
                                                    <span className="absolute -top-1.5 -right-2 bg-[#F97316] text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-sm">
                                                        {item.badgeCount! > 9 ? '9+' : item.badgeCount}
                                                    </span>
                                                )}
                                            </div>
                                            {showFullText && (
                                                <div className="ml-4 flex-1 flex items-center justify-between overflow-hidden">
                                                    <span className={`truncate ${item.label.length > 18 ? 'text-[9.5px]' : ''}`}>
                                                        {item.label}
                                                    </span>
                                                    {hasBadge && (
                                                        <span className="ml-2 shrink-0 bg-[#F97316] text-white text-[10px] font-black px-2.5 py-0.5 rounded-full shadow-sm animate-pulse">
                                                            {item.badgeCount}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </Link>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
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
            {isDrawerOpen && (
                <div className="lg:hidden fixed inset-0 z-[1000] flex">
                    {/* Backdrop */}
                    <div 
                        className="fixed inset-0 bg-[#1a1208]/60 backdrop-blur-sm animate-in fade-in duration-300"
                        onClick={handleDrawerClose}
                    />
                    
                    {/* Drawer Content */}
                    <aside className="relative bg-white w-64 h-full flex flex-col justify-between shadow-2xl animate-in slide-in-from-left duration-300 z-[1010]">
                        {renderSidebarContent(true, true)}
                    </aside>
                </div>
            )}

            <QRScannerModal isOpen={isQRScannerOpen} onClose={() => setIsQRScannerOpen(false)} />
        </>
    );
};

export default BrgySidebar;
