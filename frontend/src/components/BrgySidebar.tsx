import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Button from './Button';
import { api, clearAuthStorage } from '../utils/api';
import { DEFAULT_AVATAR, getProfilePicture } from '../utils/avatar';

interface BrgySidebarProps {
    isMobileOpen?: boolean;
    onCloseMobile?: () => void;
    mobileOpen?: boolean;
    onMobileClose?: () => void;
}

const BrgySidebar = ({ isMobileOpen, onCloseMobile, mobileOpen, onMobileClose }: BrgySidebarProps) => {
    const [isOpen, setIsOpen] = useState(true);
    const [pendingRequestsCount, setPendingRequestsCount] = useState<number>(0);
    const [pendingClaimsCount, setPendingClaimsCount] = useState<number>(0);
    const [pendingAdoptionsCount, setPendingAdoptionsCount] = useState<number>(0);
    const [newAdoptionTasksCount, setNewAdoptionTasksCount] = useState<number>(0);
    const [unreadMessagesCount, setUnreadMessagesCount] = useState<number>(0);
    const [overdueHoldingCount, setOverdueHoldingCount] = useState<number>(0);
    const location = useLocation();
    const navigate = useNavigate();

    // Support both prop naming styles for versatility
    const isDrawerOpen = mobileOpen !== undefined ? mobileOpen : (isMobileOpen || false);
    const handleDrawerClose = onMobileClose || onCloseMobile;

    const rawUser = localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user');
    const currentUser = rawUser ? JSON.parse(rawUser) : null;
    const isHeadOfficer = currentUser ? currentUser.is_head_officer : false;

    const handleLogout = () => {
        if (handleDrawerClose) handleDrawerClose();
        clearAuthStorage();
        navigate('/staff/login', { replace: true });
    };

    useEffect(() => {
        const fetchCounts = async () => {
            try {
                const viewed = new Set(JSON.parse(localStorage.getItem('straysafe_viewed_brgy_requests') || '[]'));
                // Escalated (4), Approved (13), or Rescue In Progress (5) that have not been viewed yet: ids only
                const res = await api.get('/reports/sidebar-ids', { params: { status_ids: '4,5,13' } });
                const ids: number[] = Array.isArray(res.data?.report_ids) ? res.data.report_ids : [];
                setPendingRequestsCount(ids.filter((id) => !viewed.has(id)).length);
            } catch (e) {
                console.warn("Could not fetch brgy reports count", e);
            }

            try {
                const viewedClaimIds = new Set(JSON.parse(localStorage.getItem('straysafe_viewed_brgy_claims') || '[]'));
                const claimsRes = await api.get('/claims/');
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
                const taskRes = await api.get('/adoption-tasks/count');
                if (taskRes.data && typeof taskRes.data.new === 'number') {
                    setNewAdoptionTasksCount(taskRes.data.new);
                }
            } catch (e) {
                // ignore
            }

            try {
                const savedStay = localStorage.getItem('holding_impound_stay_duration');
                const stayDays = savedStay ? parseInt(savedStay, 10) : 3;
                const holdingRes = await api.get(`/holding/metrics?impound_days=${stayDays}`);
                if (holdingRes.data && typeof holdingRes.data.needs_impoundment === 'number') {
                    setOverdueHoldingCount(holdingRes.data.needs_impoundment);
                }
            } catch (e) {
                // ignore
            }
        };

        fetchCounts();
        // Badges refresh every 15 s while the tab is visible, and immediately when a report or claim is viewed
        const interval = setInterval(() => {
            if (document.visibilityState === 'visible') fetchCounts();
        }, 15000);
        document.addEventListener('visibilitychange', fetchCounts);

        window.addEventListener('straysafe_brgy_viewed', fetchCounts);
        window.addEventListener('straysafe_claims_viewed', fetchCounts);
        window.addEventListener('storage', fetchCounts);

        return () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', fetchCounts);
            window.removeEventListener('straysafe_brgy_viewed', fetchCounts);
            window.removeEventListener('straysafe_claims_viewed', fetchCounts);
            window.removeEventListener('storage', fetchCounts);
        };
    }, []);

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
                    path: '/brgy/adoption-tasks',
                    label: 'Adoption Tasks',
                    badgeCount: newAdoptionTasksCount,
                    icon: (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
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
                    path: '/brgy/profile',
                    label: 'Profile',
                    icon: (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
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

            {/* Role Identity Badge */}
            {showFullText ? (
                <div className="px-6 pb-3 shrink-0">
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-role-muted border border-role-border">
                        <span className="w-2 h-2 rounded-full bg-role shrink-0"></span>
                        <span className="text-[10px] font-black uppercase tracking-widest text-role-strong truncate">Barangay Staff</span>
                    </div>
                </div>
            ) : (
                <div className="px-3 pb-3 shrink-0" title="Barangay Staff">
                    <div className="h-1.5 rounded-full bg-role"></div>
                </div>
            )}

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200 pb-4">
                {menuSections.map((section, idx) => (
                    <div key={section.title} className={idx > 0 ? 'mt-6' : 'mt-2'}>
                        {showFullText && (
                            <h3 className="px-8 mb-2 text-[10px] font-black text-role-strong/60 uppercase tracking-widest animate-in fade-in duration-300">
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
                                                className={`w-full flex items-center py-3 font-bold text-xs uppercase tracking-wider transition-colors text-gray-400 hover:text-role hover:bg-role-soft/50 cursor-pointer ${showFullText ? 'px-6' : 'justify-center px-0'}`}
                                            >
                                                <span className="shrink-0">{item.icon}</span>
                                                {showFullText && <span className="ml-3.5 whitespace-nowrap animate-in fade-in duration-300">{item.label}</span>}
                                            </button>
                                        </div>
                                    );
                                }

                                const isActive = item.path ? location.pathname === item.path || location.pathname.startsWith(item.path + '/') : false;
                                const hasBadge = !!(item.badgeCount && item.badgeCount > 0);
                                return (
                                    <div key={item.path} className="relative group overflow-hidden">
                                        {isActive && (
                                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-role-strong rounded-r-full"></div>
                                        )}
                                        <Link
                                            to={item.path}
                                            onClick={isMobileView && handleDrawerClose ? handleDrawerClose : undefined}
                                            className={`flex items-center py-3 font-bold text-xs uppercase tracking-wider transition-colors ${isActive
                                                ? 'bg-role text-white shadow-sm'
                                                : 'text-gray-500 hover:text-role-strong hover:bg-role-muted'
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
            <div className="p-3 border-t border-role-border bg-role-muted/40 shrink-0">
                {showFullText ? (
                    <div className="space-y-2">
                        <div className="flex items-center gap-3 px-3 py-2 bg-white rounded-xl border border-role-border shadow-xs">
                            <img
                                src={getProfilePicture(currentUser?.profile_picture)}
                                alt={currentUser?.name || 'Barangay Staff'}
                                onError={(e) => { (e.currentTarget as HTMLImageElement).src = DEFAULT_AVATAR; }}
                                className="w-9 h-9 rounded-full object-cover ring-1 ring-role-border shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-slate-800 truncate">{currentUser?.name || 'Barangay Officer'}</p>
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
                        <Link to="/brgy/profile" title="Profile">
                            <img
                                src={getProfilePicture(currentUser?.profile_picture)}
                                alt={currentUser?.name || 'Barangay Staff'}
                                onError={(e) => { (e.currentTarget as HTMLImageElement).src = DEFAULT_AVATAR; }}
                                className="w-8 h-8 rounded-full object-cover ring-1 ring-role-border"
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
            <aside className={`hidden lg:flex ${isOpen ? 'w-72' : 'w-20'} relative bg-role-soft border-r border-role-border flex flex-col justify-between flex-shrink-0 transition-all duration-300 z-50 h-screen sticky top-0`}>
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

            {/* MOBILE DRAWER OVERLAY (Right-side slide drawer for Barangay mobile) */}
            {isDrawerOpen && createPortal(
                <div className="lg:hidden fixed inset-0 z-[99999] flex justify-end">
                    {/* Backdrop */}
                    <div 
                        className="fixed inset-0 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
                        onClick={handleDrawerClose}
                    />
                    
                    {/* Drawer Content */}
                    <aside 
                        style={{ backgroundColor: 'var(--role-accent-soft)' }}
                        className="relative w-72 max-w-[82vw] bg-role-soft h-full flex flex-col justify-between shadow-2xl animate-in slide-in-from-right duration-200 z-[100000]"
                    >
                        {renderSidebarContent(true, true)}
                    </aside>
                </div>,
                document.body
            )}

        </>
    );
};

export default BrgySidebar;
