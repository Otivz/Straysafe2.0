import { useState, useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Button from './Button';
import { api, clearAuthStorage } from '../utils/api';
import { DEFAULT_AVATAR, getProfilePicture } from '../utils/avatar';

interface SubdSidebarProps {
    mobileOpen?: boolean;
    onMobileClose?: () => void;
}

interface NavItem {
    path?: string;
    label: string;
    icon: ReactNode;
    badgeCount?: number;
    isAction?: boolean;
    onClick?: () => void;
}

interface NavSection {
    title: string;
    items: NavItem[];
}

const SubdSidebar = ({ mobileOpen, onMobileClose }: SubdSidebarProps) => {
    const [isOpen, setIsOpen] = useState(true);
    const [pendingReportsCount, setPendingReportsCount] = useState<number>(0);
    const [pendingClaimsCount, setPendingClaimsCount] = useState<number>(0);
    const [unreadMessagesCount, setUnreadMessagesCount] = useState<number>(0);
    const location = useLocation();
    const navigate = useNavigate();

    const userStr = localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user');
    const currentUser = userStr ? JSON.parse(userStr) : null;

    const handleLogout = () => {
        if (onMobileClose) onMobileClose();
        clearAuthStorage();
        navigate('/staff/login', { replace: true });
    };

    useEffect(() => {
        const fetchCounts = async () => {
            try {
                const subId = currentUser?.subdivision_id;
                // Get set of report IDs that have already been viewed by the leader
                const viewedReportIds = new Set(JSON.parse(localStorage.getItem('straysafe_viewed_subd_reports') || '[]'));
                const url = subId ? `/reports/?subdivision_id=${subId}` : '/reports/';
                const reportsRes = await api.get(url);
                if (Array.isArray(reportsRes.data)) {
                    // Count unviewed new reports with status_id = 1 (Reported)
                    const unviewedPending = reportsRes.data.filter((r: any) => {
                        const sid = r.current_status_id || r.status_id;
                        return sid === 1 && !viewedReportIds.has(r.report_id);
                    }).length;
                    setPendingReportsCount(unviewedPending);
                }
            } catch (e) {
                console.warn("Could not fetch report count for sidebar", e);
            }

            try {
                // Get set of claim IDs that have already been viewed by the leader
                const viewedClaimIds = new Set(JSON.parse(localStorage.getItem('straysafe_viewed_subd_claims') || '[]'));
                const claimsRes = await api.get('/claims/');
                if (Array.isArray(claimsRes.data)) {
                    const unviewedClaims = claimsRes.data.filter((c: any) => {
                        const isPending = c.status === 'Pending Review' || c.status === 'Evidence Requested' || c.status === 'Potential Owner Match';
                        return isPending && !viewedClaimIds.has(c.claim_id);
                    }).length;
                    setPendingClaimsCount(unviewedClaims);
                }
            } catch (e) {
                console.warn("Could not fetch claims count for sidebar", e);
            }

            try {
                const chatRes = await api.get('/chat/unread-count');
                if (chatRes.data && typeof chatRes.data.unread_count === 'number') {
                    setUnreadMessagesCount(chatRes.data.unread_count);
                }
            } catch (e) {
                // ignore
            }
        };

        fetchCounts();
        const interval = setInterval(fetchCounts, 4000);

        window.addEventListener('straysafe_reports_viewed', fetchCounts);
        window.addEventListener('straysafe_claims_viewed', fetchCounts);
        window.addEventListener('storage', fetchCounts);

        return () => {
            clearInterval(interval);
            window.removeEventListener('straysafe_reports_viewed', fetchCounts);
            window.removeEventListener('straysafe_claims_viewed', fetchCounts);
            window.removeEventListener('storage', fetchCounts);
        };
    }, []);

    const menuSections: NavSection[] = [
        {
            title: 'OPERATIONS',
            items: [
                {
                    path: '/subd/dashboard',
                    label: 'Dashboard',
                    icon: (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
                        </svg>
                    )
                },
                {
                    path: '/subd/messages',
                    label: 'Messages',
                    badgeCount: unreadMessagesCount,
                    icon: (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                    )
                },
                {
                    path: '/subd/reports',
                    label: 'Resident Reports',
                    badgeCount: pendingReportsCount,
                    icon: (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" />
                        </svg>
                    )
                },
                {
                    path: '/subd/holding-facility',
                    label: 'Holding Facility',
                    icon: (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                        </svg>
                    )
                },
                {
                    path: '/subd/hazard-alert',
                    label: 'Broadcast Alerts',
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
                    path: '/subd/pet-records',
                    label: 'Pet Records',
                    icon: (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 21.5c-3.038 0-5.5-2.462-5.5-5.5s2.462-5.5 5.5-5.5s5.5 2.462 5.5 5.5s-2.462 5.5-5.5 5.5zm-5.5-12c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5s2.5 1.119 2.5 2.5s-1.119 2.5-2.5 2.5zm11 0c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5s2.5 1.119 2.5 2.5s-1.119 2.5-2.5 2.5zM12 8c-1.381 0-2.5-1.119-2.5-2.5S10.619 3 12 3s2.5 1.119 2.5 2.5S13.381 8 12 8z" />
                        </svg>
                    )
                },
                {
                    path: '/subd/pet-claims',
                    label: 'Pet Claims',
                    badgeCount: pendingClaimsCount,
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
                    path: '/subd/history',
                    label: 'History Reports',
                    icon: (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.8 2.8a1 1 0 101.414-1.414L11 9.586V6z" clipRule="evenodd" />
                        </svg>
                    )
                },
                {
                    path: '/subd/endorsements',
                    label: 'Endorsement Archive',
                    icon: (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                        </svg>
                    )
                }
            ]
        },
        {
            title: 'SYSTEM',
            items: [
                {
                    path: '/subd/profile',
                    label: 'Profile',
                    icon: (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                    )
                },
                {
                    path: '/subd/settings',
                    label: 'Settings',
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

    const navContent = (
        <>
            <div className="overflow-hidden flex-1 flex flex-col">
                {/* Brand / Logo Area */}
                <div className={`pt-6 pb-4 ${isOpen || mobileOpen ? 'px-6' : 'px-2 justify-center'} flex items-center justify-between min-h-[76px] shrink-0`}>
                    {(isOpen || mobileOpen) ? (
                        <Link to="/subd/dashboard" className="flex items-center gap-2.5 group overflow-hidden select-none">
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
                        <Link to="/subd/dashboard" className="flex items-center justify-center w-full group py-1">
                            <img
                                src="/SSLOGO.png"
                                alt="StraySafe Logo"
                                className="w-8 h-8 object-contain transition-transform duration-300 group-hover:scale-110"
                            />
                        </Link>
                    )}
                    {onMobileClose && (
                        <button
                            onClick={onMobileClose}
                            className="md:hidden p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 shrink-0 cursor-pointer ml-1"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                </div>

                {/* Navigation */}
                <nav className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200 pb-4">
                    {menuSections.map((section, idx) => (
                        <div key={section.title} className={idx > 0 ? 'mt-6' : 'mt-2'}>
                            {(isOpen || mobileOpen) && (
                                <h3 className="px-8 mb-2 text-[10px] font-black text-gray-400 uppercase tracking-widest animate-in fade-in duration-300">
                                    {section.title}
                                </h3>
                            )}
                            <div className="space-y-1">
                                {section.items.map((item) => {
                                    if (item.isAction) {
                                        return (
                                            <div key={item.label} className="relative group overflow-hidden">
                                                <button
                                                    onClick={() => {
                                                        if (onMobileClose) onMobileClose();
                                                        item.onClick?.();
                                                    }}
                                                    className={`w-full flex items-center py-3 font-bold text-xs uppercase tracking-wider transition-colors text-gray-400 hover:text-[#F97316] hover:bg-orange-50/50 cursor-pointer ${isOpen || mobileOpen ? 'px-6' : 'justify-center px-0'}`}
                                                >
                                                    <span className="shrink-0">{item.icon}</span>
                                                    {(isOpen || mobileOpen) && <span className="ml-3.5 whitespace-nowrap animate-in fade-in duration-300">{item.label}</span>}
                                                </button>
                                            </div>
                                        );
                                    }
                                    const isActive = item.path ? location.pathname.includes(item.path) : false;
                                    const hasBadge = !!(item.badgeCount && item.badgeCount > 0);
                                    return (
                                        <div key={item.path} className="relative group overflow-hidden">
                                            {isActive && (
                                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#F97316] rounded-r-full"></div>
                                            )}
                                            <Link
                                                to={item.path || '#'}
                                                onClick={() => {
                                                    if (onMobileClose) onMobileClose();
                                                }}
                                                className={`flex items-center py-3 font-bold text-xs uppercase tracking-wider transition-colors ${isActive
                                                    ? 'bg-orange-50 text-[#F97316]'
                                                    : 'text-gray-400 hover:text-gray-700 hover:bg-gray-50'
                                                    } ${isOpen || mobileOpen ? 'px-6' : 'justify-center px-0'}`}
                                            >
                                                <div className="relative shrink-0">
                                                    {item.icon}
                                                    {(!isOpen && !mobileOpen) && hasBadge && (
                                                        <span className="absolute -top-1.5 -right-2 bg-[#F97316] text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-sm">
                                                            {item.badgeCount! > 9 ? '9+' : item.badgeCount}
                                                        </span>
                                                    )}
                                                </div>
                                                {(isOpen || mobileOpen) && (
                                                    <div className="ml-3.5 flex-1 flex items-center justify-between overflow-hidden">
                                                        <span className="whitespace-nowrap font-bold text-xs">{item.label}</span>
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

                {/* Sidebar Footer / User & Logout */}
                <div className="p-3 border-t border-gray-100 bg-gray-50/50 shrink-0">
                    {(isOpen || mobileOpen) ? (
                        <div className="space-y-2">
                            <div className="flex items-center gap-3 px-3 py-2 bg-white rounded-xl border border-gray-100 shadow-xs">
                                <img
                                    src={getProfilePicture(currentUser?.profile_picture)}
                                    alt={currentUser?.name || 'Staff User'}
                                    onError={(e) => { (e.currentTarget as HTMLImageElement).src = DEFAULT_AVATAR; }}
                                    className="w-9 h-9 rounded-full object-cover ring-1 ring-orange-200 shrink-0"
                                />
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-bold text-slate-800 truncate">{currentUser?.name || 'Subdivision Staff'}</p>
                                    <p className="text-[10px] font-medium text-slate-400 truncate">{currentUser?.email || 'Staff'}</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={handleLogout}
                                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-rose-600 hover:text-rose-700 bg-rose-50/80 hover:bg-rose-100/80 rounded-xl transition-all active:scale-98 cursor-pointer shadow-xs"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                </svg>
                                <span>Logout</span>
                            </button>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-2">
                            <Link to="/subd/profile" title="Profile">
                                <img
                                    src={getProfilePicture(currentUser?.profile_picture)}
                                    alt={currentUser?.name || 'Staff User'}
                                    onError={(e) => { (e.currentTarget as HTMLImageElement).src = DEFAULT_AVATAR; }}
                                    className="w-8 h-8 rounded-full object-cover ring-1 ring-orange-200"
                                />
                            </Link>
                            <button
                                type="button"
                                onClick={handleLogout}
                                title="Logout"
                                className="p-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                </svg>
                            </button>
                        </div>
                    )}
                </div>
            </div>

        </>
    );

    return (
        <>
            {/* Desktop Sidebar */}
            <aside className={`hidden md:flex ${isOpen ? 'w-72' : 'w-20'} relative bg-white border-r border-gray-100 flex-col justify-between flex-shrink-0 transition-all duration-300 z-50 h-screen`}>
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

                {navContent}
            </aside>

            {/* Mobile Drawer */}
            {mobileOpen && createPortal(
                <div className="md:hidden fixed inset-0 z-[99999] flex justify-end">
                    <div
                        className="fixed inset-0 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
                        onClick={onMobileClose}
                    />
                    <aside 
                        style={{ backgroundColor: '#ffffff' }}
                        className="relative w-72 max-w-[80vw] !bg-white bg-white h-full shadow-2xl flex flex-col justify-between z-10 animate-in slide-in-from-right duration-200"
                    >
                        {navContent}
                    </aside>
                </div>,
                document.body
            )}
        </>
    );
};

export default SubdSidebar;
