import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Button from './Button';
import { api, clearAuthStorage } from '../utils/api';
import { getCachedData, setCachedData } from '../utils/cache';
import { DEFAULT_AVATAR, getProfilePicture } from '../utils/avatar';

interface AdminSidebarProps {
    isMobileOpen?: boolean;
    onCloseMobile?: () => void;
    mobileOpen?: boolean;
    onMobileClose?: () => void;
}

interface BadgeCounts {
    active_reports?: number;
    active_report_ids?: number[];
    unviewed_reports?: number;
    pending_adoptions?: number;
    pending_warnings?: number;
}

const AdminSidebar = ({ isMobileOpen, onCloseMobile, mobileOpen, onMobileClose }: AdminSidebarProps) => {
    const [isOpen, setIsOpen] = useState(true);
    const location = useLocation();
    const navigate = useNavigate();
    const cachedBadges = getCachedData<BadgeCounts>('admin_badge_counts');
    const [activeReportsCount, setActiveReportsCount] = useState<number>(() => {
        if (location.pathname === '/admin/incidents') return 0;
        if (cachedBadges?.unviewed_reports !== undefined) return cachedBadges.unviewed_reports;
        const viewed = new Set(
            (JSON.parse(localStorage.getItem('straysafe_viewed_admin_reports') || '[]') as any[]).map(Number)
        );
        if (Array.isArray(cachedBadges?.active_report_ids)) {
            return cachedBadges.active_report_ids.filter(id => !viewed.has(Number(id))).length;
        }
        return 0;
    });
    const [pendingAdoptionsCount, setPendingAdoptionsCount] = useState<number>(() => cachedBadges?.pending_adoptions ?? 0);
    const [pendingWarningsCount, setPendingWarningsCount] = useState<number>(() => cachedBadges?.pending_warnings ?? 0);

    // Support both prop naming styles for versatility
    const isDrawerOpen = mobileOpen !== undefined ? mobileOpen : (isMobileOpen || false);
    const handleDrawerClose = onMobileClose || onCloseMobile;

    const rawUser = localStorage.getItem('admin_user') || localStorage.getItem('user') || sessionStorage.getItem('admin_user') || sessionStorage.getItem('user');
    const currentUser = rawUser ? JSON.parse(rawUser) : null;

    const handleLogout = () => {
        if (handleDrawerClose) handleDrawerClose();
        clearAuthStorage();
        navigate('/admin/login', { replace: true });
    };

    useEffect(() => {
        const fetchCounts = async () => {
            try {
                // Optimized admin badge counts endpoint (TASK ADMIN-005)
                const badgeRes = await api.get('/admin/badge-counts');
                if (badgeRes.data) {
                    const rawViewed = JSON.parse(localStorage.getItem('straysafe_viewed_admin_reports') || '[]');
                    const viewedReportIds = new Set<number>(rawViewed.map((v: any) => Number(v)));

                    let unviewedCount = 0;
                    if (Array.isArray(badgeRes.data.active_report_ids)) {
                        unviewedCount = badgeRes.data.active_report_ids.filter(
                            (rId: number) => !viewedReportIds.has(Number(rId))
                        ).length;
                    } else if (typeof badgeRes.data.active_reports === 'number') {
                        const cachedReports = getCachedData<any[]>('admin_reports_list');
                        if (Array.isArray(cachedReports) && cachedReports.length > 0) {
                            unviewedCount = cachedReports.filter((r: any) => {
                                const sid = r.current_status_id || r.status_id;
                                const isClosed = [3, 6, 9, 10, 11, 12, 14, 17, 18].includes(sid);
                                return !isClosed && !viewedReportIds.has(Number(r.report_id));
                            }).length;
                        } else {
                            unviewedCount = viewedReportIds.size > 0 ? 0 : badgeRes.data.active_reports;
                        }
                    }

                    // If currently on incident reports page, unviewed count is 0 and mark active reports as viewed
                    if (location.pathname === '/admin/incidents') {
                        unviewedCount = 0;
                        if (Array.isArray(badgeRes.data.active_report_ids)) {
                            try {
                                const merged = Array.from(new Set([...rawViewed, ...badgeRes.data.active_report_ids]));
                                localStorage.setItem('straysafe_viewed_admin_reports', JSON.stringify(merged));
                            } catch {}
                        }
                    }

                    setActiveReportsCount(unviewedCount);
                    setPendingAdoptionsCount(badgeRes.data.pending_adoptions ?? 0);
                    setPendingWarningsCount(badgeRes.data.pending_warnings ?? 0);
                    setCachedData('admin_badge_counts', {
                        ...badgeRes.data,
                        unviewed_reports: unviewedCount
                    }, 60 * 1000);
                }
            } catch (err) {
                console.warn("Could not fetch admin badge counts:", err);
            }
        };

        fetchCounts();
        const interval = setInterval(fetchCounts, 30000);

        window.addEventListener('straysafe_admin_viewed', fetchCounts);
        window.addEventListener('storage', fetchCounts);

        return () => {
            clearInterval(interval);
            window.removeEventListener('straysafe_admin_viewed', fetchCounts);
            window.removeEventListener('storage', fetchCounts);
        };
    }, [location.pathname]);

    const menuSections = [
        {
            title: 'OPERATIONS',
            items: [
                {
                    path: '/admin/dashboard',
                    label: 'Global Overview',
                    icon: (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
                        </svg>
                    )
                },
                {
                    path: '/admin/incidents',
                    label: 'Incident Reports',
                    badgeCount: activeReportsCount,
                    icon: (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                    )
                },
                {
                    path: '/admin/heatmap',
                    label: 'Incident Heatmap',
                    icon: (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M12 1.586l-4 4v12.828l4-4V1.586zM3.707 3.293A1 1 0 002 4v10a1 1 0 00.553.894l4 2A1 1 0 008 16V3.172L3.707 3.293zM14 3.172V16a1 1 0 001.447.894l4-2A1 1 0 0020 14V4a1 1 0 00-1.707-.707L14 3.172z" clipRule="evenodd" />
                        </svg>
                    )
                },
                {
                    path: '/admin/holding-facility',
                    label: 'Holding Facility',
                    icon: (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
                        </svg>
                    )
                }
            ]
        },
        {
            title: 'ANIMAL MANAGEMENT',
            items: [
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
                    path: '/admin/adoptions',
                    label: 'Adoptions',
                    badgeCount: pendingAdoptionsCount,
                    icon: (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
                        </svg>
                    )
                }
            ]
        },
        {
            title: 'GOVERNANCE & AUDIT',
            items: [
                {
                    path: '/admin/users',
                    label: 'User Management',
                    icon: (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0019 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                        </svg>
                    )
                },
                {
                    path: '/admin/warnings',
                    label: 'Citations & Warnings',
                    badgeCount: pendingWarningsCount,
                    icon: (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
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
                }
            ]
        },
        {
            title: 'SYSTEM',
            items: [
                {
                    path: '/admin/account-settings',
                    label: 'Settings & HQ',
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
                    <Link to="/admin/dashboard" className="flex items-center gap-2.5 group overflow-hidden select-none">
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
                    <Link to="/admin/dashboard" className="flex items-center justify-center w-full group py-1">
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
            <nav className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200 pb-4">
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
                                                className={`w-full flex items-center py-3 font-bold text-xs uppercase tracking-wider transition-colors text-gray-400 hover:text-[#F97316] hover:bg-orange-50/50 cursor-pointer ${showFullText ? 'px-6' : 'justify-center px-0'}`}
                                            >
                                                <span className="shrink-0">{item.icon}</span>
                                                {showFullText && <span className="ml-3.5 whitespace-nowrap animate-in fade-in duration-300">{item.label}</span>}
                                            </button>
                                        </div>
                                    );
                                }

                                const isActive = item.path 
                                    ? (location.pathname === item.path || 
                                       (item.path === '/admin/adoptions' && (location.pathname === '/brgy/adoptions' || location.pathname.startsWith('/admin/adoptions'))) ||
                                       (item.path === '/admin/holding-facility' && (location.pathname === '/brgy/holding-facility' || location.pathname.startsWith('/admin/holding-facility'))) ||
                                       (item.path === '/admin/account-settings' && location.pathname === '/admin/settings') ||
                                       location.pathname.startsWith(item.path + '/'))
                                    : false;
                                const hasBadge = !!(item.badgeCount && item.badgeCount > 0);

                                return (
                                    <div key={item.path} className="relative group overflow-hidden">
                                        {isActive && (
                                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#F97316] rounded-r-full"></div>
                                        )}
                                        <Link
                                            to={item.path}
                                            onClick={() => {
                                                if (isMobileView && handleDrawerClose) handleDrawerClose();
                                                if (item.path === '/admin/incidents') {
                                                    setActiveReportsCount(0);
                                                }
                                            }}
                                            className={`flex items-center py-3 font-bold text-xs uppercase tracking-wider transition-colors ${isActive
                                                ? 'bg-orange-50 text-[#F97316]'
                                                : 'text-gray-400 hover:text-gray-700 hover:bg-gray-50'
                                                } ${showFullText ? 'px-6' : 'justify-center px-0'}`}
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
                                                <div className="ml-3.5 flex-1 flex items-center justify-between overflow-hidden">
                                                    <span className="whitespace-nowrap font-bold text-xs">
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

            {/* Sidebar Footer / User & Logout */}
            <div className="p-3 border-t border-gray-100 bg-gray-50/50 shrink-0">
                {showFullText ? (
                    <div className="space-y-2">
                        <div className="flex items-center gap-3 px-3 py-2 bg-white rounded-xl border border-gray-100 shadow-xs">
                            <img
                                src={getProfilePicture(currentUser?.profile_picture)}
                                alt={currentUser?.name || 'Administrator'}
                                onError={(e) => { (e.currentTarget as HTMLImageElement).src = DEFAULT_AVATAR; }}
                                className="w-9 h-9 rounded-full object-cover ring-1 ring-orange-200 shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-slate-800 truncate">{currentUser?.name || 'Administrator'}</p>
                                <p className="text-[10px] font-medium text-slate-400 truncate">{currentUser?.email || 'admin@straysafe.com'}</p>
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
                        <Link to="/admin/account-settings" title="Settings">
                            <img
                                src={getProfilePicture(currentUser?.profile_picture)}
                                alt={currentUser?.name || 'Administrator'}
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
    );

    return (
        <>
            {/* DESKTOP SIDEBAR */}
            <aside className={`hidden lg:flex ${isOpen ? 'w-72' : 'w-20'} relative bg-white border-r border-gray-100 flex flex-col justify-between flex-shrink-0 transition-all duration-300 z-50 h-screen sticky top-0`}>
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
            {isDrawerOpen && createPortal(
                <div className="lg:hidden fixed inset-0 z-[99999] flex justify-end">
                    {/* Backdrop */}
                    <div 
                        className="fixed inset-0 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
                        onClick={handleDrawerClose}
                    />
                    
                    {/* Drawer Content */}
                    <aside 
                        style={{ backgroundColor: '#ffffff' }}
                        className="relative w-72 max-w-[82vw] !bg-white bg-white h-full flex flex-col justify-between shadow-2xl animate-in slide-in-from-right duration-200 z-[100000]"
                    >
                        {renderSidebarContent(true, true)}
                    </aside>
                </div>,
                document.body
            )}

        </>
    );
};

export default AdminSidebar;
