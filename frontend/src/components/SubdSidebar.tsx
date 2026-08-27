import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import axios from 'axios';
import Button from './Button';
import QRScannerModal from './Modals/QRScannerModal';
import { api } from '../utils/api';

const SubdSidebar = () => {
    const [isOpen, setIsOpen] = useState(true);
    const [isQRScannerOpen, setIsQRScannerOpen] = useState(false);
    const [pendingReportsCount, setPendingReportsCount] = useState<number>(0);
    const [pendingClaimsCount, setPendingClaimsCount] = useState<number>(0);
    const [unreadMessagesCount, setUnreadMessagesCount] = useState<number>(0);
    const location = useLocation();

    useEffect(() => {
        const fetchCounts = async () => {
            try {
                // Get set of report IDs that have already been viewed by the leader
                const viewedReportIds = new Set(JSON.parse(localStorage.getItem('straysafe_viewed_subd_reports') || '[]'));
                const reportsRes = await axios.get('http://localhost:8000/reports/');
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
                const claimsRes = await axios.get('http://localhost:8000/claims/');
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

    const menuItems = [
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
            path: '/subd/history',
            label: 'History Reports',
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.8 2.8a1 1 0 101.414-1.414L11 9.586V6z" clipRule="evenodd" />
                </svg>
            )
        },
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
            path: '/subd/escalated',
            label: 'Escalated Missions',
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                </svg>
            )
        },
        {
            path: '/subd/hazard-alert',
            label: 'Broadcast Alert',
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 3a1 1 0 00-1.447-.894L8.763 6H5a3 3 0 000 6h.28l1.771 5.316A1 1 0 008 18h1a1 1 0 001-1v-4.382l6.553 3.276A1 1 0 0018 15V3z" clipRule="evenodd" />
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
    ];

    return (
        <aside className={`${isOpen ? 'w-64' : 'w-20'} relative bg-white border-r border-gray-100 flex flex-col justify-between flex-shrink-0 transition-all duration-300 z-50 h-screen`}>

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

            <div className="overflow-hidden flex-1 flex flex-col">
                {/* Menu Title */}
                <div className="pt-10 pb-6 px-6 flex items-center h-[88px]">
                    {isOpen && (
                        <h2 className="text-xs font-extrabold text-gray-400 uppercase tracking-widest animate-in fade-in duration-300">
                            OPERATIONS
                        </h2>
                    )}
                </div>

                {/* Navigation */}
                <nav className="space-y-1 flex-1">
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
                        const isActive = item.path ? location.pathname.includes(item.path) : false;
                        const hasBadge = !!(item.badgeCount && item.badgeCount > 0);
                        return (
                            <div key={item.path} className="relative group overflow-hidden">
                                {isActive && (
                                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#F97316] rounded-r-full"></div>
                                )}
                                <Link
                                    to={item.path || '#'}
                                    className={`flex items-center py-3 font-bold text-xs uppercase tracking-widest transition-colors ${isActive
                                        ? 'bg-orange-50 text-[#F97316]'
                                        : 'text-gray-400 hover:text-gray-700 hover:bg-gray-50'
                                        } ${isOpen ? 'px-8' : 'justify-center px-0'}`}
                                >
                                    <div className="relative shrink-0">
                                        {item.icon}
                                        {!isOpen && hasBadge && (
                                            <span className="absolute -top-1.5 -right-2 bg-[#F97316] text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-sm">
                                                {item.badgeCount! > 9 ? '9+' : item.badgeCount}
                                            </span>
                                        )}
                                    </div>
                                    {isOpen && (
                                        <div className="ml-4 flex-1 flex items-center justify-between overflow-hidden">
                                            <span className="truncate">{item.label}</span>
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
                </nav>
            </div>

            <QRScannerModal isOpen={isQRScannerOpen} onClose={() => setIsQRScannerOpen(false)} />

        </aside>
    );
};

export default SubdSidebar;
