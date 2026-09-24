import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../utils/api';
import MapComponent from '../../components/MapComponent';
import SubdSidebar from '../../components/SubdSidebar';
import SubdNavbar from '../../components/Navbars/SubdNavbar';
import SubdBottomNav from '../../components/Navbars/SubdBottomNav';
import { getCachedData, setCachedData } from '../../utils/cache';

interface Report {
    report_id: number;
    status_id: number;
    category_id: number;
    animal_type: string;
    landmark: string;
    reporter_name?: string;
    created_at: string;
    priority_level: string;
    latitude?: any;
    longitude?: any;
    description?: string;
    assigned_leader_id?: number | null;
    is_verified?: boolean;
    [key: string]: any;
}

interface RescueRequest {
    rescue_id: number;
    status_id: number;
    report_id?: number;
    staff_id?: number | null;
    [key: string]: any;
}

const categoryMap: Record<number, string> = {
    1: 'Injured Animal',
    2: 'Aggressive Stray',
    3: 'Possible Rabies Risk',
    4: 'Roaming Pack',
    5: 'Animal Rescue Needed',
    6: 'Lost Pet'
};

const SubdDashboard = () => {
    const navigate = useNavigate();

    const [reports, setReports] = useState<Report[]>(() => getCachedData<Report[]>('subd_dashboard_reports') || []);
    const [_rescues, setRescues] = useState<RescueRequest[]>(() => getCachedData<RescueRequest[]>('subd_dashboard_rescues') || []);
    const [claims, setClaims] = useState<any[]>(() => getCachedData<any[]>('subd_dashboard_claims') || []);
    const [holdingAnimals, setHoldingAnimals] = useState<any[]>(() => getCachedData<any[]>('subd_dashboard_holding') || []);
    const [petsList, setPetsList] = useState<any[]>(() => getCachedData<any[]>('subd_dashboard_pets') || []);
    const [petCount, setPetCount] = useState<number>(() => getCachedData<number>('subd_dashboard_pets_count') || 0);
    const [announcements, setAnnouncements] = useState<any[]>(() => getCachedData<any[]>('subd_dashboard_announcements') || []);
    const [loading, setLoading] = useState<boolean>(() => !getCachedData<Report[]>('subd_dashboard_reports'));
    const [priorityFilter, setPriorityFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
    const [mapMode, setMapMode] = useState<'pins' | 'heatmap' | 'both'>('both');
    const [isMapExpanded, setIsMapExpanded] = useState(false);
    const [selectedDetailReport, setSelectedDetailReport] = useState<any>(null);
    const [selectedReport, setSelectedReport] = useState<any>(null);
    const [selectedMapCoords, setSelectedMapCoords] = useState<{ lat: number; lng: number } | null>(null);
    const [isNavigating, setIsNavigating] = useState(false);
    const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [trendFilter, setTrendFilter] = useState<'7D' | '4W' | '6M' | '1Y'>('7D');

    // Cases tab states (2nd photo)
    const [activeCaseTab, setActiveCaseTab] = useState<'my' | 'escalated'>('my');
    const [casesSubFilter, setCasesSubFilter] = useState<'my' | 'unassigned'>('my');
    const [claimingId, setClaimingId] = useState<number | null>(null);

    const mapSectionRef = useRef<HTMLDivElement>(null);
    const chartScrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (chartScrollRef.current) {
            chartScrollRef.current.scrollLeft = chartScrollRef.current.scrollWidth;
        }
    }, [trendFilter, reports]);

    useEffect(() => {
        if ("geolocation" in navigator) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    setUserLocation([position.coords.latitude, position.coords.longitude]);
                },
                (error) => {
                    console.log("Could not get current location:", error.message);
                }
            );
        }
    }, []);

    useEffect(() => {
        const rawUser = localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user');
        if (rawUser) {
            try {
                const user = JSON.parse(rawUser);
                if (user.role_id !== 2) navigate('/staff/login');
                else setCurrentUser(user);
            } catch {
                navigate('/staff/login');
            }
        } else {
            navigate('/staff/login');
        }
    }, [navigate]);

    useEffect(() => {
        const rawUser = localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user');
        const user = rawUser ? JSON.parse(rawUser) : null;
        const subId = user?.subdivision_id || 1;

        const fetchAll = async () => {
            if (!getCachedData('subd_dashboard_reports')) {
                setLoading(true);
            }
            try {
                const reportsUrl = subId ? `/reports/?subdivision_id=${subId}` : '/reports/';
                const rescuesUrl = subId ? `/rescue-requests/?subdivision_id=${subId}` : '/rescue-requests/';
                const petsUrl = subId ? `/pets/subdivision/${subId}` : '/pets/';
                const claimsUrl = subId ? `/claims/?subdivision_id=${subId}` : '/claims/';
                const holdingUrl = subId ? `/holding/?subdivision_id=${subId}` : '/holding/';
                const announcementsUrl = subId ? `/announcements/subdivision/${subId}` : '/announcements/';

                const [reportsRes, rescuesRes, petsRes, claimsRes, holdingRes, announcementsRes] = await Promise.allSettled([
                    api.get(reportsUrl),
                    api.get(rescuesUrl),
                    api.get(petsUrl),
                    api.get(claimsUrl),
                    api.get(holdingUrl),
                    api.get(announcementsUrl),
                ]);
                if (reportsRes.status === 'fulfilled') {
                    const repData = reportsRes.value.data || [];
                    setReports(repData);
                    setCachedData('subd_dashboard_reports', repData);
                }
                if (rescuesRes.status === 'fulfilled') {
                    const rescData = rescuesRes.value.data || [];
                    setRescues(rescData);
                    setCachedData('subd_dashboard_rescues', rescData);
                }
                if (petsRes.status === 'fulfilled') {
                    const pData = petsRes.value.data || [];
                    setPetsList(pData);
                    setPetCount(pData.length);
                    setCachedData('subd_dashboard_pets', pData);
                    setCachedData('subd_dashboard_pets_count', pData.length);
                }
                if (claimsRes.status === 'fulfilled') {
                    const claimsData = claimsRes.value.data || [];
                    setClaims(claimsData);
                    setCachedData('subd_dashboard_claims', claimsData);
                }
                if (holdingRes.status === 'fulfilled') {
                    const hData = holdingRes.value.data || [];
                    setHoldingAnimals(hData);
                    setCachedData('subd_dashboard_holding', hData);
                }
                if (announcementsRes.status === 'fulfilled') {
                    const annData = announcementsRes.value.data || [];
                    setAnnouncements(annData);
                    setCachedData('subd_dashboard_announcements', annData);
                }
            } catch (err) {
                console.error('Dashboard fetch error:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchAll();
    }, []);

    const isResolvedOrClosed = (r: Report) => [6, 11, 12, 3, 9, 10, 14, 17, 18].includes(r.status_id);
    const activeReports = reports.filter(r => !isResolvedOrClosed(r));
    const currentUserId = currentUser?.user_id || currentUser?.id || 3;

    // Cases Filtering strictly from database
    const rawMyCases = reports.filter(r => r.assigned_leader_id === currentUserId && !isResolvedOrClosed(r));
    const rawUnassigned = reports.filter(r => !r.assigned_leader_id && !isResolvedOrClosed(r));
    const rawEscalated = reports.filter(r => r.status_id === 4);

    const myCasesCount = rawMyCases.length;
    const unassignedCount = rawUnassigned.length;
    const escalatedCount = rawEscalated.length;

    // Summary Card Statistics Calculations based on real database records
    const pendingReviewReports = reports.filter(r =>
        (r.status_id === 1 || r.status_id === 2 || !r.is_verified || r.verification_status === 'unverified') &&
        !isResolvedOrClosed(r)
    );
    const pendingReviewCount = pendingReviewReports.length;

    // Comparison calculations
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);

    const reportsToday = reports.filter(r => r.created_at && new Date(r.created_at) >= todayStart).length;
    const reportsYesterday = reports.filter(r => {
        if (!r.created_at) return false;
        const d = new Date(r.created_at);
        return d >= yesterdayStart && d < todayStart;
    }).length;
    const pendingDiff = reportsToday - reportsYesterday;
    const pendingComparison = pendingDiff > 0
        ? { text: `${pendingDiff} more than yesterday`, symbol: '↑', color: 'text-orange-600', bg: 'bg-orange-100' }
        : pendingDiff < 0
            ? { text: `${Math.abs(pendingDiff)} less than yesterday`, symbol: '↓', color: 'text-emerald-600', bg: 'bg-emerald-100' }
            : { text: '0 change', symbol: '→', color: 'text-slate-500', bg: 'bg-slate-100' };

    const underBrgyCount = reports.filter(r => [4, 5, 13].includes(r.status_id)).length;
    const displayPetCount = petCount;

    // Subtitle for Registered Pets: calculate pets registered in the current month (or last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const petsRegisteredThisMonth = petsList.filter(p => p.created_at && new Date(p.created_at) >= thirtyDaysAgo).length;

    const pendingClaimsList = claims.filter(c => {
        const s = (c.status || '').toLowerCase();
        return s.includes('pending') || s.includes('review') || s.includes('evidence') || s.includes('potential') || s.includes('match');
    });
    const pendingClaimsCount = pendingClaimsList.length;

    const claimsToday = claims.filter(c => {
        const d = new Date(c.created_at || c.updated_at || 0);
        return d >= todayStart;
    }).length;
    const claimsYesterday = claims.filter(c => {
        const d = new Date(c.created_at || c.updated_at || 0);
        return d >= yesterdayStart && d < todayStart;
    }).length;
    const claimsDiff = claimsToday - claimsYesterday;
    const claimsComparison = claimsDiff > 0
        ? { text: `${claimsDiff} more than yesterday`, symbol: '↑', color: 'text-purple-600', bg: 'bg-purple-100' }
        : claimsDiff < 0
            ? { text: `${Math.abs(claimsDiff)} less than yesterday`, symbol: '↓', color: 'text-slate-500', bg: 'bg-slate-100' }
            : { text: '0 change', symbol: '→', color: 'text-purple-600', bg: 'bg-purple-100' };

    const activeHoldingAnimals = holdingAnimals.filter(a => ![3, 4, 5, 7, 8].includes(a.facility_status));
    const holdingCount = activeHoldingAnimals.length;

    // Filtered reports for Map based on priority
    const filteredMapReports = activeReports.filter(r => {
        if (priorityFilter === 'all') return true;
        const p = (r.priority_level || 'Medium').toLowerCase();
        return p === priorityFilter;
    });

    const highCount = activeReports.filter(r => (r.priority_level || '').toLowerCase() === 'high').length;
    const medCount = activeReports.filter(r => (r.priority_level || '').toLowerCase() === 'medium').length;
    const lowCount = activeReports.filter(r => (r.priority_level || '').toLowerCase() === 'low').length;
    const totalActiveCount = activeReports.length;

    // Trend chart data calculation from actual database reports
    const trendData = (() => {
        const data: { label: string; count: number }[] = [];
        const nowDate = new Date();

        if (trendFilter === '7D') {
            for (let i = 6; i >= 0; i--) {
                const d = new Date();
                d.setDate(nowDate.getDate() - i);
                const label = d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
                const dateStr = d.toISOString().slice(0, 10);
                const count = reports.filter(r => r.created_at && r.created_at.slice(0, 10) === dateStr).length;
                data.push({ label, count });
            }
        } else if (trendFilter === '4W') {
            for (let i = 3; i >= 0; i--) {
                const start = new Date(nowDate);
                start.setDate(nowDate.getDate() - (i + 1) * 7);
                const end = new Date(nowDate);
                end.setDate(nowDate.getDate() - i * 7);
                const label = `Wk ${4 - i}`;
                const count = reports.filter(r => {
                    if (!r.created_at) return false;
                    const rDate = new Date(r.created_at);
                    return rDate >= start && rDate < end;
                }).length;
                data.push({ label, count });
            }
        } else if (trendFilter === '6M') {
            for (let i = 5; i >= 0; i--) {
                const d = new Date(nowDate.getFullYear(), nowDate.getMonth() - i, 1);
                const nextMonth = new Date(nowDate.getFullYear(), nowDate.getMonth() - i + 1, 1);
                const label = d.toLocaleDateString('en-US', { month: 'short' });
                const count = reports.filter(r => {
                    if (!r.created_at) return false;
                    const rDate = new Date(r.created_at);
                    return rDate >= d && rDate < nextMonth;
                }).length;
                data.push({ label, count });
            }
        } else if (trendFilter === '1Y') {
            for (let i = 11; i >= 0; i--) {
                const d = new Date(nowDate.getFullYear(), nowDate.getMonth() - i, 1);
                const nextMonth = new Date(nowDate.getFullYear(), nowDate.getMonth() - i + 1, 1);
                const monthName = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
                const label = monthName === 'SEP' ? 'SEPT' : monthName;
                const count = reports.filter(r => {
                    if (!r.created_at) return false;
                    const rDate = new Date(r.created_at);
                    return rDate >= d && rDate < nextMonth;
                }).length;
                data.push({ label, count });
            }
        }

        return data;
    })();

    const maxTrend = Math.max(...trendData.map(d => d.count), 1);

    const ADMIN_HQ: [number, number] = [14.806906, 121.0039297];

    const getStatusName = (statusId: number) => {
        switch (statusId) {
            case 1: return 'Pending Verification';
            case 2: return 'Verified';
            case 3: return 'Rejected';
            case 4: return 'Forwarded to Barangay';
            case 5: return 'Team Dispatched';
            case 6: return 'Resolved';
            case 7: return 'Picked Up';
            case 8: return 'Under Observation';
            case 9: return 'Impounded';
            case 10: return 'Released';
            case 11: return 'Incident Resolved';
            case 12: return 'Deceased';
            case 13: return 'Approved by Barangay';
            default: return 'Active';
        }
    };

    const getClaimStatusBadge = (status: string) => {
        const s = (status || '').toLowerCase();
        if (s.includes('handover') || s.includes('received') || s.includes('complete')) {
            return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300">Handover Done</span>;
        }
        if (s.includes('approved')) {
            return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-green-50 text-green-700 border border-green-200">Approved</span>;
        }
        if (s.includes('rejected')) {
            return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-red-50 text-red-600 border border-red-200">Rejected</span>;
        }
        if (s.includes('evidence')) {
            return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-blue-50 text-blue-600 border border-blue-200">Evidence Req</span>;
        }
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200">Under Review</span>;
    };

    const getMobileClaimStatusBadge = (status: string) => {
        const s = (status || '').toLowerCase();
        if (s.includes('approved') || s.includes('claimed') || s.includes('resolved') || s.includes('complete') || s.includes('handover') || s.includes('verified')) {
            return (
                <span className="px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full text-[9px] sm:text-[10px] font-black tracking-wider uppercase bg-[#E8F8EE] text-[#059669] border border-emerald-200/80 shadow-2xs">
                    APPROVED
                </span>
            );
        }
        if (s.includes('reject') || s.includes('declin') || s.includes('denied')) {
            return (
                <span className="px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full text-[9px] sm:text-[10px] font-black tracking-wider uppercase bg-[#FEECEC] text-[#E11D48] border border-rose-200/80 shadow-2xs">
                    REJECTED
                </span>
            );
        }
        return (
            <span className="px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full text-[9px] sm:text-[10px] font-black tracking-wider uppercase bg-[#FFF4E5] text-[#D97706] border border-amber-200/80 shadow-2xs">
                PENDING
            </span>
        );
    };

    const getMarkerColor = (r: Report) => {
        const p = (r.priority_level || '').toLowerCase();
        if (p === 'high') return 'red';
        if (p === 'medium') return 'orange';
        if (p === 'low') return 'green';
        if (r.status_id === 2 || r.is_verified) return 'blue';
        return 'orange';
    };

    const mapMarkers = [
        ...(userLocation ? [{
            id: -2,
            lat: userLocation[0],
            lng: userLocation[1],
            title: "Your Location",
            category: "Leader",
            time: "Live"
        }] : []),
        ...(selectedMapCoords ? [{
            id: -999,
            lat: selectedMapCoords.lat,
            lng: selectedMapCoords.lng,
            title: `Selected Spot (${selectedMapCoords.lat.toFixed(5)}, ${selectedMapCoords.lng.toFixed(5)})`,
            category: "Pinpoint",
            color: "orange",
            time: "Selected"
        }] : []),
        ...filteredMapReports
            .filter(r => r.latitude && r.longitude)
            .map((r: any) => ({
                id: r.report_id,
                lat: parseFloat(r.latitude),
                lng: parseFloat(r.longitude),
                title: r.description || `Incident #${r.report_id}`,
                priority: r.priority_level || "Medium",
                category: r.animal_type || "Stray Animal",
                color: getMarkerColor(r),
                time: r.created_at ? new Date(r.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' }) : "N/A",
                rawData: {
                    ...r,
                    statusName: r.status?.status_name || getStatusName(r.status_id),
                    reporterName: r.reporter_name || r.user?.name || 'Citizen',
                }
            }))
    ];

    const heatmapPoints: [number, number, number][] = filteredMapReports
        .filter(r => r.latitude && r.longitude)
        .map(r => [
            parseFloat(r.latitude),
            parseFloat(r.longitude),
            r.priority_level === 'High' ? 1.0 : 0.6
        ]);

    const handleLocateOnMap = (r: Report) => {
        setSelectedReport(r);
        setIsNavigating(true);
        if (mapSectionRef.current) {
            mapSectionRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    };

    const handleClaimReport = async (reportId: number) => {
        const uid = currentUser?.user_id || currentUser?.id;
        if (!uid) return;
        setClaimingId(reportId);
        try {
            await api.put(`/reports/${reportId}`, {
                assigned_leader_id: uid,
            });
            setReports(prev => prev.map(r => r.report_id === reportId ? { ...r, assigned_leader_id: uid } : r));
        } catch (err) {
            console.error('Failed to claim report:', err);
            navigate('/subd/reports');
        } finally {
            setClaimingId(null);
        }
    };

    const getRoutingConfig = () => {
        if (!isNavigating || !selectedReport) return undefined;
        const repLat = parseFloat(selectedReport.latitude || selectedReport.lat);
        const repLng = parseFloat(selectedReport.longitude || selectedReport.lng);
        if (isNaN(repLat) || isNaN(repLng)) return undefined;
        const destName = selectedReport.landmark || selectedReport.title || `Report #${selectedReport.report_id}`;

        return {
            start: userLocation || ADMIN_HQ,
            end: [repLat, repLng] as [number, number],
            waypointNames: ["Your Position", destName] as [string, string],
            onClose: () => setIsNavigating(false)
        };
    };

    const formatRelativeTime = (dateStr?: string) => {
        if (!dateStr) return '3 days ago';
        const now = new Date();
        const past = new Date(dateStr);
        const diffMs = now.getTime() - past.getTime();
        if (isNaN(diffMs) || diffMs < 0) return 'Just now';
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 60) return `${Math.max(diffMins, 1)}m ago`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours}h ago`;
        const diffDays = Math.floor(diffHours / 24);
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays} days ago`;
        const diffWeeks = Math.floor(diffDays / 7);
        if (diffWeeks === 1) return '1 week ago';
        if (diffWeeks < 4) return `${diffWeeks} weeks ago`;
        return past.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    const sampleClaimsFallback = [
        {
            claim_id: 45,
            pet_name: 'Bella',
            breed: 'Labrador Retriever',
            claimant_name: 'Maria Santos',
            landmark: 'Phase 1',
            similarity_score: 95,
            status: 'Pending',
            photo_url: 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=200&auto=format&fit=crop',
            time_ago: '3 days ago'
        },
        {
            claim_id: 42,
            pet_name: 'Snow',
            breed: 'Domestic Shorthair',
            claimant_name: 'Juan Dela Cruz',
            landmark: 'Phase 2',
            similarity_score: 92,
            status: 'Approved',
            photo_url: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=200&auto=format&fit=crop',
            time_ago: '5 days ago'
        },
        {
            claim_id: 38,
            pet_name: 'Max',
            breed: 'Beagle',
            claimant_name: 'Ana Reyes',
            landmark: 'Phase 3',
            similarity_score: 88,
            status: 'Rejected',
            photo_url: 'https://images.unsplash.com/photo-1537151608828-ea2b11777ee8?w=200&auto=format&fit=crop',
            time_ago: '1 week ago'
        }
    ];

    const mappedClaims = claims.map((c, idx) => ({
        claim_id: c.claim_id || (idx + 101),
        pet_name: c.pet?.pet_name || c.pet_name || 'Pet',
        breed: c.pet?.breed || c.breed || 'Dog/Cat',
        claimant_name: c.pet?.owner?.name || c.claimant?.name || c.claimant_name || 'Resident',
        landmark: c.report?.landmark || c.sighting_location || c.landmark || `Phase ${(idx % 3) + 1}`,
        similarity_score: (() => {
            if (c.match_score !== undefined && c.match_score !== null) return c.match_score;
            if (c.similarity_score !== undefined && c.similarity_score !== null) return c.similarity_score;
            const match = c.remarks?.match(/AI detected a (\d+)% potential match/i);
            return match ? parseInt(match[1]) : 90;
        })(),
        status: c.status || 'Under Review',
        photo_url: c.pet?.photo_url || (c.report?.media && c.report.media[0]?.file_url) || (idx % 2 === 0 ? 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=200&auto=format&fit=crop' : 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=200&auto=format&fit=crop'),
        time_ago: formatRelativeTime(c.created_at || c.report?.created_at)
    }));

    const recentClaimsData = mappedClaims.length > 0 ? mappedClaims.slice(0, 5) : sampleClaimsFallback;

    const summaryPendingClaims = claims.length > 0
        ? claims.filter(c => {
            const s = (c.status || '').toLowerCase();
            return s.includes('pending') || s.includes('review') || s.includes('match') || s.includes('potential') || s.includes('evidence');
        }).length
        : 3;

    const summaryApprovedClaims = claims.length > 0
        ? claims.filter(c => {
            const s = (c.status || '').toLowerCase();
            return s.includes('approved') || s.includes('claimed') || s.includes('resolved') || s.includes('verified');
        }).length
        : 2;

    const summaryRejectedClaims = claims.length > 0
        ? claims.filter(c => {
            const s = (c.status || '').toLowerCase();
            return s.includes('reject') || s.includes('declin') || s.includes('denied');
        }).length
        : 1;

    const leaderName = currentUser?.name || currentUser?.full_name || 'Kyla Joy Arriola';

    return (
        <div className="min-h-screen w-full flex bg-[#F8FAFC] font-sans text-slate-800">
            {/* Sidebar */}
            <SubdSidebar mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />

            <main className="flex-1 flex flex-col h-screen overflow-hidden">
                {/* Navbar */}
                <SubdNavbar
                    onMenuToggle={() => setMobileMenuOpen(true)}
                    leftContent={
                        <div className="flex flex-col min-w-0 pr-1">
                            <h1 className="text-[12px] min-[360px]:text-[13px] min-[400px]:text-sm sm:text-base md:text-xl font-black text-gray-900 tracking-tight leading-tight uppercase truncate">
                                Subdivision Command Center
                            </h1>
                            <p className="hidden sm:block text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-0.5 leading-none truncate">
                                {currentUser?.subdivision_name ? `${currentUser.subdivision_name}, Sta. Maria, Bulacan` : 'Selera Homes, Sta. Maria, Bulacan'}
                            </p>
                        </div>
                    }
                />

                {/* Dashboard Scrollable Body */}
                <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-5 lg:p-6 pb-40 md:pb-8 flex flex-col gap-3.5 sm:gap-5 bg-[#F8FAFC] w-full max-w-full">

                    {/* 1. Greeting Hero Banner */}
                    <div className="bg-gradient-to-br from-amber-500/15 via-orange-500/10 to-amber-500/5 bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-6 border border-amber-200/90 shadow-[0_4px_20px_rgba(245,158,11,0.06)] flex items-center justify-between gap-4 relative overflow-hidden min-h-[96px] sm:min-h-[110px]">
                        <div className="flex items-center gap-3.5 sm:gap-4 min-w-0 flex-1">
                            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-2xl sm:text-3xl shadow-md shrink-0 select-none">
                                ☀️
                            </div>
                            <div className="min-w-0 flex-1">
                                <h2 className="text-base sm:text-xl lg:text-2xl font-black text-slate-900 tracking-tight leading-snug">
                                    Good morning, {leaderName}!
                                </h2>
                                <p className="text-xs sm:text-sm text-slate-600 font-medium leading-normal mt-0.5">
                                    Here's what's happening in your subdivision today.
                                </p>
                            </div>
                        </div>
                        <div className="hidden sm:flex shrink-0 self-center">
                            <div className="inline-flex flex-col items-center justify-center px-4 py-2 rounded-xl bg-orange-100/80 border border-orange-200 text-[10px] font-black text-orange-700 leading-tight text-center shadow-2xs">
                                <span>Safer Neighborhoods</span>
                                <span>Stronger Communities</span>
                            </div>
                        </div>
                    </div>

                    {/* Section Header: Quick Overview */}
                    <div className="flex items-center justify-between pt-1">
                        <h2 className="text-xs sm:text-sm font-black text-[#0B1527] uppercase tracking-wider">
                            QUICK OVERVIEW
                        </h2>
                    </div>

                    {/* 2. Key Metric Stat Cards (2-Column Grid on Mobile, 5-Cols on Desktop) */}
                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5 sm:gap-4">

                        {/* Card 1: Pending Review */}
                        <div
                            onClick={() => navigate('/subd/reports')}
                            className="bg-white rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col justify-between min-h-[140px] sm:min-h-[174px] transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-md hover:border-orange-200 cursor-pointer group relative overflow-hidden active:scale-[0.98]"
                        >
                            <div className="flex items-start justify-between gap-1.5 sm:gap-2">
                                <div className="min-w-0 flex-1">
                                    <h3 className="text-[11px] sm:text-xs font-black text-slate-900 uppercase tracking-wider group-hover:text-orange-600 transition-colors leading-snug">
                                        Pending Review
                                    </h3>
                                    <p className="text-[9.5px] sm:text-[11px] text-slate-500 mt-0.5 leading-tight font-medium">Awaiting your verification</p>
                                </div>
                                <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-full sm:rounded-2xl bg-orange-100/90 text-orange-600 flex items-center justify-center shrink-0 border border-orange-200/70 shadow-2xs group-hover:scale-110 transition-all duration-300">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 sm:w-4.5 sm:h-4.5" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                                    </svg>
                                </div>
                            </div>
                            <div className="mt-2 sm:mt-3">
                                <p className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight leading-none group-hover:text-orange-600 transition-colors">
                                    {loading ? '...' : pendingReviewCount}
                                </p>
                                <div className="mt-2 sm:mt-2.5 pt-1.5 sm:pt-2.5 border-t border-slate-100 flex items-center gap-1.5 text-[9.5px] sm:text-[11px] font-bold text-slate-500">
                                    <span className="inline-flex items-center justify-center w-3 h-3 sm:w-4 sm:h-4 rounded-full bg-slate-100 text-slate-600 text-[7px] sm:text-[9px] shrink-0 font-black">-</span>
                                    <span className="leading-tight">0 change</span>
                                </div>
                            </div>
                        </div>

                        {/* Card 2: Under Barangay Action */}
                        <div
                            onClick={() => navigate('/subd/escalated')}
                            className="bg-white rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col justify-between min-h-[140px] sm:min-h-[174px] transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-md hover:border-blue-200 cursor-pointer group relative overflow-hidden active:scale-[0.98]"
                        >
                            <div className="flex items-start justify-between gap-1.5 sm:gap-2">
                                <div className="min-w-0 flex-1">
                                    <h3 className="text-[11px] sm:text-xs font-black text-slate-900 uppercase tracking-wider group-hover:text-blue-600 transition-colors leading-snug">
                                        Barangay Action
                                    </h3>
                                    <p className="text-[9.5px] sm:text-[11px] text-slate-500 mt-0.5 leading-tight font-medium">Endorsed to Barangay</p>
                                </div>
                                <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-full sm:rounded-2xl bg-blue-100/90 text-blue-600 flex items-center justify-center shrink-0 border border-blue-200/70 shadow-2xs group-hover:scale-110 transition-all duration-300 font-black text-xs">
                                    <span>A</span>
                                </div>
                            </div>
                            <div className="mt-2 sm:mt-3">
                                <p className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight leading-none group-hover:text-blue-600 transition-colors">
                                    {loading ? '...' : underBrgyCount}
                                </p>
                                <div className="mt-2 sm:mt-2.5 pt-1.5 sm:pt-2.5 border-t border-slate-100 flex items-center gap-1.5 text-[9.5px] sm:text-[11px] font-bold text-blue-600">
                                    <span className="inline-flex items-center justify-center w-3 h-3 sm:w-4 sm:h-4 rounded-full bg-blue-100 text-blue-700 text-[7px] sm:text-[9px] shrink-0 font-black">-</span>
                                    <span className="leading-tight">0 change</span>
                                </div>
                            </div>
                        </div>

                        {/* Card 3: Registered Pets */}
                        <div
                            onClick={() => navigate('/subd/pets')}
                            className="bg-white rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col justify-between min-h-[140px] sm:min-h-[174px] transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-md hover:border-emerald-200 cursor-pointer group relative overflow-hidden active:scale-[0.98]"
                        >
                            <div className="flex items-start justify-between gap-1.5 sm:gap-2">
                                <div className="min-w-0 flex-1">
                                    <h3 className="text-[11px] sm:text-xs font-black text-slate-900 uppercase tracking-wider group-hover:text-emerald-600 transition-colors leading-snug">
                                        Registered Pets
                                    </h3>
                                    <p className="text-[9.5px] sm:text-[11px] text-slate-500 mt-0.5 leading-tight font-medium">Verified subdivision pets</p>
                                </div>
                                <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-full sm:rounded-2xl bg-emerald-100/90 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-200/70 shadow-2xs group-hover:scale-110 transition-all duration-300">
                                    <svg className="w-3.5 h-3.5 sm:w-4.5 sm:h-4.5" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M12 21.5c-3.038 0-5.5-2.462-5.5-5.5s2.462-5.5 5.5-5.5s5.5 2.462 5.5 5.5s-2.462 5.5-5.5 5.5zm-5.5-12c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5s2.5 1.119 2.5 2.5s-1.119 2.5-2.5 2.5zm11 0c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5s2.5 1.119 2.5 2.5s-1.119 2.5-2.5 2.5zM12 8c-1.381 0-2.5-1.119-2.5-2.5S10.619 3 12 3s2.5 1.119 2.5 2.5S13.381 8 12 8z" />
                                    </svg>
                                </div>
                            </div>
                            <div className="mt-2 sm:mt-3">
                                <p className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight leading-none group-hover:text-emerald-600 transition-colors">
                                    {loading ? '...' : displayPetCount}
                                </p>
                                <div className="mt-2 sm:mt-2.5 pt-1.5 sm:pt-2.5 border-t border-slate-100 flex items-center gap-1.5 text-[9.5px] sm:text-[11px] font-bold text-emerald-600">
                                    <span className="inline-flex items-center justify-center w-3 h-3 sm:w-4 sm:h-4 rounded-full bg-emerald-100 text-emerald-700 text-[7px] sm:text-[9px] shrink-0 font-black">↑</span>
                                    <span className="leading-tight">{petsRegisteredThisMonth} this month</span>
                                </div>
                            </div>
                        </div>

                        {/* Card 4: Pending Claims */}
                        <div
                            onClick={() => navigate('/subd/pet-claims')}
                            className="bg-white rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col justify-between min-h-[140px] sm:min-h-[174px] transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-md hover:border-purple-200 cursor-pointer group relative overflow-hidden active:scale-[0.98]"
                        >
                            <div className="flex items-start justify-between gap-1.5 sm:gap-2">
                                <div className="min-w-0 flex-1">
                                    <h3 className="text-[11px] sm:text-xs font-black text-slate-900 uppercase tracking-wider group-hover:text-purple-600 transition-colors leading-snug">
                                        Pending Claims
                                    </h3>
                                    <p className="text-[9.5px] sm:text-[11px] text-slate-500 mt-0.5 leading-tight font-medium">Awaiting owner confirmation</p>
                                </div>
                                <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-full sm:rounded-2xl bg-purple-100/90 text-purple-600 flex items-center justify-center shrink-0 border border-purple-200/70 shadow-2xs group-hover:scale-110 transition-all duration-300">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 sm:w-4.5 sm:h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                                    </svg>
                                </div>
                            </div>
                            <div className="mt-2 sm:mt-3">
                                <p className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight leading-none group-hover:text-purple-600 transition-colors">
                                    {loading ? '...' : pendingClaimsCount}
                                </p>
                                <div className="mt-2 sm:mt-2.5 pt-1.5 sm:pt-2.5 border-t border-slate-100 flex items-center gap-1.5 text-[9.5px] sm:text-[11px] font-bold text-purple-600">
                                    <span className="inline-flex items-center justify-center w-3 h-3 sm:w-4 sm:h-4 rounded-full bg-purple-100 text-purple-700 text-[7px] sm:text-[9px] shrink-0 font-black">-</span>
                                    <span className="leading-tight">0 change</span>
                                </div>
                            </div>
                        </div>

                        {/* Card 5: Holding Facility */}
                        <div
                            onClick={() => navigate('/subd/holding-facility')}
                            className="bg-white rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col justify-between min-h-[140px] sm:min-h-[174px] transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-md hover:border-teal-200 cursor-pointer group relative overflow-hidden active:scale-[0.98]"
                        >
                            <div className="flex items-start justify-between gap-1.5 sm:gap-2">
                                <div className="min-w-0 flex-1">
                                    <h3 className="text-[11px] sm:text-xs font-black text-slate-900 uppercase tracking-wider group-hover:text-teal-600 transition-colors leading-snug">
                                        Holding Facility
                                    </h3>
                                    <p className="text-[9.5px] sm:text-[11px] text-slate-500 mt-0.5 leading-tight font-medium">Animals currently sheltered</p>
                                </div>
                                <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-full sm:rounded-2xl bg-teal-100/90 text-teal-600 flex items-center justify-center shrink-0 border border-teal-200/70 shadow-2xs group-hover:scale-110 transition-all duration-300">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 sm:w-4.5 sm:h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                                    </svg>
                                </div>
                            </div>
                            <div className="mt-2 sm:mt-3">
                                <p className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight leading-none group-hover:text-teal-600 transition-colors">
                                    {loading ? '...' : holdingCount}
                                </p>
                                <div className="mt-2 sm:mt-2.5 pt-1.5 sm:pt-2.5 border-t border-slate-100 flex items-center gap-1.5 text-[9.5px] sm:text-[11px] font-bold text-teal-600">
                                    <span className="inline-flex items-center justify-center w-3 h-3 sm:w-4 sm:h-4 rounded-full bg-teal-100 text-teal-700 text-[7px] sm:text-[9px] shrink-0 font-black">✓</span>
                                    <span className="leading-tight">{holdingCount === 1 ? '1 active in facility' : `${holdingCount} active in facility`}</span>
                                </div>
                            </div>
                        </div>

                    </div>

                    {/* 3. Main Workspace Grid: Map & Trend (Left) & Actions/Notices/Queue (Right) */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">

                        {/* LEFT COLUMN: Map + Incident Trend (8 cols) */}
                        <div className="lg:col-span-8 flex flex-col gap-5">

                            {/* A. Community Incident Map Card */}
                            <div ref={mapSectionRef} className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-slate-100 shadow-sm flex flex-col min-h-[400px] sm:min-h-[520px]">

                                {/* Map Header & Filter Pills */}
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="relative flex h-3 w-3">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
                                                <span className="relative inline-flex rounded-full h-3 w-3 bg-[#F97316]" />
                                            </span>
                                            <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">
                                                Community Incident Map
                                            </h3>
                                        </div>
                                        <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                                            Live view of reports within your subdivision (geofenced area)
                                        </p>
                                    </div>

                                    {/* Priority Filter Pills & Map Mode Controls */}
                                    <div className="flex flex-wrap items-center gap-2">
                                        {/* Priority Filter Pills */}
                                        <div className="flex items-center gap-1.5 bg-slate-50 p-1.5 rounded-2xl border border-slate-200/80 overflow-x-auto text-[11px] font-bold">
                                            <button
                                                onClick={() => setPriorityFilter('all')}
                                                className={`px-3.5 py-1.5 rounded-xl transition-all duration-200 cursor-pointer ${priorityFilter === 'all'
                                                        ? 'bg-[#F97316] text-white shadow-xs font-black scale-[1.02]'
                                                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                                                    }`}
                                            >
                                                All ({totalActiveCount})
                                            </button>
                                            <button
                                                onClick={() => setPriorityFilter('high')}
                                                className={`px-3.5 py-1.5 rounded-xl flex items-center gap-1.5 transition-all duration-200 cursor-pointer ${priorityFilter === 'high'
                                                        ? 'bg-rose-500 text-white shadow-xs font-black scale-[1.02]'
                                                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                                                    }`}
                                            >
                                                <span className="w-2 h-2 rounded-full bg-rose-500 inline-block border border-white" />
                                                <span>High ({highCount})</span>
                                            </button>
                                            <button
                                                onClick={() => setPriorityFilter('medium')}
                                                className={`px-3.5 py-1.5 rounded-xl flex items-center gap-1.5 transition-all duration-200 cursor-pointer ${priorityFilter === 'medium'
                                                        ? 'bg-amber-500 text-white shadow-xs font-black scale-[1.02]'
                                                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                                                    }`}
                                            >
                                                <span className="w-2 h-2 rounded-full bg-amber-500 inline-block border border-white" />
                                                <span>Medium ({medCount})</span>
                                            </button>
                                            <button
                                                onClick={() => setPriorityFilter('low')}
                                                className={`px-3.5 py-1.5 rounded-xl flex items-center gap-1.5 transition-all duration-200 cursor-pointer ${priorityFilter === 'low'
                                                        ? 'bg-emerald-500 text-white shadow-xs font-black scale-[1.02]'
                                                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                                                    }`}
                                            >
                                                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block border border-white" />
                                                <span>Low ({lowCount})</span>
                                            </button>

                                            {/* Fullscreen Expand button */}
                                            <button
                                                onClick={() => setIsMapExpanded(true)}
                                                className="w-8 h-8 flex items-center justify-center bg-white hover:bg-slate-100 text-slate-600 rounded-xl border border-slate-200 shadow-2xs ml-1 shrink-0 active:scale-95 transition-all cursor-pointer"
                                                title="Expand Map"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
                                                </svg>
                                            </button>
                                        </div>

                                        {/* Map Mode Selector (Pins / Heatmap / Both) */}
                                        <div className="flex items-center bg-slate-50 p-1 rounded-2xl border border-slate-200/80 text-[10px] font-black uppercase shadow-2xs">
                                            <button
                                                onClick={() => setMapMode('pins')}
                                                className={`px-3 py-1.5 rounded-xl transition-all duration-200 cursor-pointer ${
                                                    mapMode === 'pins'
                                                        ? 'bg-[#F97316] text-white shadow-2xs font-black'
                                                        : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/60'
                                                }`}
                                            >
                                                Pins
                                            </button>
                                            <button
                                                onClick={() => setMapMode('heatmap')}
                                                className={`px-3 py-1.5 rounded-xl transition-all duration-200 cursor-pointer ${
                                                    mapMode === 'heatmap'
                                                        ? 'bg-[#F97316] text-white shadow-2xs font-black'
                                                        : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/60'
                                                }`}
                                            >
                                                Heatmap
                                            </button>
                                            <button
                                                onClick={() => setMapMode('both')}
                                                className={`px-3 py-1.5 rounded-xl transition-all duration-200 cursor-pointer ${
                                                    mapMode === 'both'
                                                        ? 'bg-[#F97316] text-white shadow-2xs font-black'
                                                        : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/60'
                                                }`}
                                            >
                                                Both
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Map Canvas Container */}
                                <div className="w-full h-[360px] sm:h-[440px] md:h-[480px] rounded-2xl overflow-hidden border border-slate-100 relative bg-slate-50">
                                    <MapComponent
                                        height="100%"
                                        center={[14.8013, 121.0036]}
                                        zoom={16.5}
                                        markers={mapMode !== 'heatmap' ? mapMarkers : mapMarkers.filter(m => m.id < 0)}
                                        showHeatmap={mapMode !== 'pins'}
                                        heatmapPoints={heatmapPoints}
                                        showGeofence={true}
                                        showLandmarks={true}
                                        onMapClick={(lat, lng) => setSelectedMapCoords({ lat, lng })}
                                        onViewDetails={(marker) => {
                                            const reportId = marker.rawData?.report_id || (marker.id > 0 ? marker.id : null);
                                            if (reportId) {
                                                navigate(`/subd/reports/${reportId}`);
                                            }
                                        }}
                                        routing={getRoutingConfig()}
                                        onMarkerClick={(m) => {
                                            if (m.id < 0) {
                                                setSelectedReport(null);
                                                setIsNavigating(false);
                                            } else {
                                                const fullReport = reports.find(r => r.report_id.toString() === m.id.toString());
                                                if (fullReport) {
                                                    setSelectedReport(fullReport);
                                                    setIsNavigating(true);
                                                }
                                            }
                                        }}
                                    />

                                    {/* Mobile Tap-to-Expand Indicator Overlay */}
                                    <button
                                        type="button"
                                        onClick={() => setIsMapExpanded(true)}
                                        className="sm:hidden absolute top-3 left-3 z-20 bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-xl shadow-md border border-orange-200/90 flex items-center gap-1.5 text-[11px] font-black text-[#F97316] active:scale-95 transition-transform cursor-pointer"
                                        title="Tap to view expanded map"
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
                                        </svg>
                                        <span>Expand Map</span>
                                    </button>

                                    {/* Floating Coordinate Pill Overlay when clicking on map */}
                                    {selectedMapCoords && (
                                        <div className="absolute top-3 right-3 z-20 bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-2xl shadow-xl border border-orange-200/90 flex items-center gap-2 text-xs animate-in fade-in zoom-in-95 duration-150">
                                            <span className="w-2 h-2 rounded-full bg-orange-500 animate-ping" />
                                            <span className="font-black text-slate-800 tracking-tight text-[11px]">
                                                {selectedMapCoords.lat.toFixed(6)}, {selectedMapCoords.lng.toFixed(6)}
                                            </span>
                                            <button
                                                onClick={() => {
                                                    if (navigator.clipboard) {
                                                        navigator.clipboard.writeText(`${selectedMapCoords.lat.toFixed(6)}, ${selectedMapCoords.lng.toFixed(6)}`);
                                                    }
                                                }}
                                                className="px-2 py-0.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-bold text-[10px] transition-colors shadow-2xs cursor-pointer"
                                                title="Copy coordinates"
                                            >
                                                Copy
                                            </button>
                                            <button
                                                onClick={() => setSelectedMapCoords(null)}
                                                className="text-slate-400 hover:text-slate-600 font-bold ml-1 cursor-pointer"
                                                title="Clear pinpoint"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    )}

                                    {/* Desktop Floating Bottom-Left Overlay Legend */}
                                    <div className="hidden sm:block absolute bottom-4 left-4 z-[1000]">
                                        <div className="bg-white/95 backdrop-blur-md p-3.5 rounded-2xl shadow-xl border border-slate-200/90 text-[11px] font-bold text-slate-700 flex flex-col gap-2 min-w-[135px]">
                                            <div className="flex items-center gap-2">
                                                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-xs shrink-0" />
                                                <span>High Priority</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-xs shrink-0" />
                                                <span>Medium Priority</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-xs shrink-0" />
                                                <span>Low Priority</span>
                                            </div>
                                            <div className="h-px bg-slate-100 my-0.5" />
                                            <div className="flex items-center gap-2">
                                                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-xs shrink-0" />
                                                <span>Verified</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="w-2.5 h-2.5 rounded-full bg-slate-300 border border-slate-400 shadow-xs shrink-0" />
                                                <span>Unverified</span>
                                            </div>
                                            {mapMode !== 'pins' && (
                                                <>
                                                    <div className="h-px bg-slate-100 my-0.5" />
                                                    <div className="flex items-center gap-2">
                                                        <span className="w-4 h-2 rounded bg-gradient-to-r from-blue-500 via-amber-400 to-rose-500 shadow-xs shrink-0" />
                                                        <span>Incident Heat</span>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Mobile Map Priority Legend Strip (Immune to navbar overlap) */}
                                <div className="sm:hidden mt-3 pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] font-bold text-slate-700">
                                    <div className="flex items-center gap-1.5">
                                        <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-xs shrink-0" />
                                        <span>High ({highCount})</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-xs shrink-0" />
                                        <span>Med ({medCount})</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-xs shrink-0" />
                                        <span>Low ({lowCount})</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-xs shrink-0" />
                                        <span>Verified</span>
                                    </div>
                                    {mapMode !== 'pins' && (
                                        <div className="flex items-center gap-1.5">
                                            <span className="w-3.5 h-2 rounded bg-gradient-to-r from-blue-500 via-amber-400 to-rose-500 shadow-xs shrink-0" />
                                            <span>Heat</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* B. Incident Report Trend Card (Below Map) */}
                            <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-slate-100 shadow-sm flex flex-col gap-3">
                                {/* Trend Header */}
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-orange-500" viewBox="0 0 20 20" fill="currentColor">
                                                <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
                                            </svg>
                                            <h3 className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-tight">
                                                Incident Report Trend
                                            </h3>
                                        </div>
                                        <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                                            Frequency of reports received over time
                                        </p>
                                    </div>

                                    {/* Segmented Filter Pills */}
                                    <div className="flex items-center bg-slate-100/90 p-1 rounded-2xl border border-slate-200/60">
                                        {(['7D', '4W', '6M', '1Y'] as const).map((period) => (
                                            <button
                                                key={period}
                                                onClick={() => setTrendFilter(period)}
                                                className={`px-3 py-1 text-[10px] font-black rounded-xl transition-all ${trendFilter === period
                                                        ? 'bg-[#0F172A] text-white shadow-xs'
                                                        : 'text-[#64748B] hover:text-slate-900 hover:bg-white/60'
                                                    }`}
                                            >
                                                {period}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Chart Area */}
                                {loading ? (
                                    <div className="h-[140px] bg-slate-50 rounded-2xl animate-pulse" />
                                ) : (
                                    <div className="relative h-[150px] w-full flex pt-2">
                                        {/* Left Y-Axis */}
                                        <div className="w-6 sm:w-7 shrink-0 flex flex-col justify-between pb-6 select-none z-20 bg-white">
                                            {[2, 1, 0].map((step, i) => {
                                                const maxScale = maxTrend <= 2 ? 2 : Math.ceil(maxTrend / 2) * 2;
                                                const val = Math.round((maxScale / 2) * step);
                                                return (
                                                    <span key={i} className="text-[9px] font-bold text-slate-300 text-right pr-2 -mt-2">
                                                        {val}
                                                    </span>
                                                );
                                            })}
                                        </div>

                                        {/* Scrollable Track */}
                                        <div
                                            ref={chartScrollRef}
                                            className="flex-1 relative overflow-x-auto overflow-y-hidden custom-scrollbar pb-1"
                                            style={{ scrollbarWidth: 'thin' }}
                                        >
                                            {/* Dashed Gridlines */}
                                            <div className="absolute inset-0 flex flex-col justify-between pb-6 pointer-events-none min-w-full">
                                                {[2, 1, 0].map((_, i) => (
                                                    <div key={i} className="w-full h-0 border-t border-dashed border-slate-100" />
                                                ))}
                                            </div>

                                            {/* Bars Track */}
                                            <div
                                                className="flex items-end justify-between relative z-10 h-full pb-6 px-3 gap-2 sm:gap-3"
                                                style={{ minWidth: trendFilter === '1Y' ? '600px' : trendFilter === '6M' ? '320px' : '100%' }}
                                            >
                                                {trendData.map((day, i) => {
                                                    const maxScale = maxTrend <= 2 ? 2 : Math.ceil(maxTrend / 2) * 2;
                                                    const heightPct = maxScale > 0 ? (day.count / maxScale) * 100 : 0;

                                                    return (
                                                        <div key={i} className="flex flex-col items-center justify-end h-full flex-1 min-w-[24px] sm:min-w-[28px] max-w-[48px] group relative">
                                                            {day.count > 0 ? (
                                                                <>
                                                                    <div className="mb-1 text-[9px] font-black text-orange-600 bg-orange-50 border border-orange-200/80 shadow-2xs rounded px-1.5 py-0.5 z-20 transition-transform group-hover:scale-110">
                                                                        {day.count}
                                                                    </div>
                                                                    <div
                                                                        className="w-[18px] sm:w-[22px] bg-gradient-to-t from-orange-500 to-amber-400 group-hover:from-orange-600 group-hover:to-amber-500 rounded-t-md transition-all duration-300 shadow-xs"
                                                                        style={{ height: `${heightPct}%` }}
                                                                    />
                                                                </>
                                                            ) : (
                                                                <div className="w-[14px] h-[3px] bg-slate-200 rounded-full mb-0.5" />
                                                            )}

                                                            {/* X-axis label */}
                                                            <span className="absolute -bottom-5 text-[9px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">
                                                                {day.label}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* RIGHT COLUMN: Quick Actions, Cases Tab Section, Active Hazard Notices, Recent Incident Queue (4 cols) */}
                        <div className="lg:col-span-4 flex flex-col gap-5">

                            {/* 1. Quick Actions (Hidden on Mobile Layout, Visible on Desktop) */}
                            <div className="hidden lg:flex bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-slate-100 shadow-sm flex-col gap-3">
                                <div className="flex items-center gap-2 text-slate-900 font-black text-xs uppercase tracking-wider">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-orange-500" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                                    </svg>
                                    <span>Quick Actions</span>
                                </div>
                                <div className="flex flex-col gap-2.5">
                                    {/* Action 1 */}
                                    <button
                                        onClick={() => navigate('/subd/reports')}
                                        className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-gradient-to-r from-orange-500 via-[#F97316] to-amber-500 text-white font-bold text-xs shadow-md shadow-orange-500/20 hover:shadow-lg hover:shadow-orange-500/30 hover:scale-[1.01] active:scale-[0.98] transition-all duration-200 group cursor-pointer"
                                    >
                                        <div className="flex items-center gap-2.5">
                                            <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center text-white group-hover:rotate-6 transition-transform">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" />
                                                </svg>
                                            </div>
                                            <span>Verify Incoming Reports</span>
                                        </div>
                                        <span className="text-white/90 group-hover:translate-x-1 transition-transform font-bold">→</span>
                                    </button>

                                    {/* Action 2 */}
                                    <button
                                        onClick={() => navigate('/subd/hazard-alert')}
                                        className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-gradient-to-r from-blue-500 via-cyan-500 to-sky-500 text-white font-bold text-xs shadow-md shadow-blue-500/20 hover:shadow-lg hover:shadow-blue-500/30 hover:scale-[1.01] active:scale-[0.98] transition-all duration-200 group cursor-pointer"
                                    >
                                        <div className="flex items-center gap-2.5">
                                            <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center text-white group-hover:rotate-6 transition-transform">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M18 3a1 1 0 00-1.447-.894L8.763 6H5a3 3 0 000 6h.28l1.771 5.316A1 1 0 008 18h1a1 1 0 001-1v-4.382l6.553 3.276A1 1 0 0018 15V3z" clipRule="evenodd" />
                                                </svg>
                                            </div>
                                            <span>Broadcast Hazard Alert</span>
                                        </div>
                                        <span className="text-white/90 group-hover:translate-x-1 transition-transform font-bold">→</span>
                                    </button>

                                    {/* Action 3 */}
                                    <button
                                        onClick={() => navigate('/subd/escalated')}
                                        className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-gradient-to-r from-purple-500 via-indigo-500 to-violet-500 text-white font-bold text-xs shadow-md shadow-purple-500/20 hover:shadow-lg hover:shadow-purple-500/30 hover:scale-[1.01] active:scale-[0.98] transition-all duration-200 group cursor-pointer"
                                    >
                                        <div className="flex items-center gap-2.5">
                                            <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center text-white group-hover:rotate-6 transition-transform">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                                                    <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                                                </svg>
                                            </div>
                                            <span>View Escalated Missions</span>
                                        </div>
                                        <span className="text-white/90 group-hover:translate-x-1 transition-transform font-bold">→</span>
                                    </button>
                                </div>
                            </div>

                            {/* 2. Cases Section (Tabbed: MY CASES / ESCALATED - 2nd Photo) */}
                            <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-100 shadow-sm flex flex-col overflow-hidden">
                                {/* Tabs Header */}
                                <div className="flex items-center border-b border-slate-100 px-5 pt-3.5 gap-6 bg-white shrink-0">
                                    <button
                                        onClick={() => setActiveCaseTab('my')}
                                        className={`pb-2.5 text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 relative cursor-pointer ${activeCaseTab === 'my'
                                                ? 'text-slate-900 border-b-2 border-[#F97316]'
                                                : 'text-slate-400 hover:text-slate-700'
                                            }`}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-orange-500" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" />
                                        </svg>
                                        <span>MY CASES ({myCasesCount})</span>
                                    </button>
                                    <button
                                        onClick={() => setActiveCaseTab('escalated')}
                                        className={`pb-2.5 text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 relative cursor-pointer ${activeCaseTab === 'escalated'
                                                ? 'text-slate-900 border-b-2 border-[#F97316]'
                                                : 'text-slate-400 hover:text-slate-700'
                                            }`}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
                                            <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                                        </svg>
                                        <span>ESCALATED ({escalatedCount})</span>
                                    </button>
                                </div>

                                {/* Sub-bar for My Cases */}
                                {activeCaseTab === 'my' && (
                                    <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-slate-50 text-xs">
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => setCasesSubFilter('my')}
                                                className={`px-3.5 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${casesSubFilter === 'my'
                                                        ? 'bg-[#F97316] text-white shadow-xs'
                                                        : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900'
                                                    }`}
                                            >
                                                Assigned to Me ({myCasesCount})
                                            </button>
                                            <button
                                                onClick={() => setCasesSubFilter('unassigned')}
                                                className={`px-3.5 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${casesSubFilter === 'unassigned'
                                                        ? 'bg-[#F97316] text-white shadow-xs'
                                                        : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900'
                                                    }`}
                                            >
                                                Unassigned ({unassignedCount})
                                            </button>
                                        </div>
                                        <button
                                            onClick={() => navigate('/subd/reports')}
                                            className="text-[11px] font-bold text-[#F97316] hover:underline cursor-pointer"
                                        >
                                            All Reports →
                                        </button>
                                    </div>
                                )}

                                {/* Cases List Body */}
                                <div className="p-4 space-y-3.5 overflow-y-auto max-h-[380px] custom-scrollbar">
                                    {activeCaseTab === 'my' && casesSubFilter === 'my' && (
                                        rawMyCases.length > 0 ? (
                                            rawMyCases.map(r => (
                                                <div key={r.report_id} className="border border-slate-100 shadow-xs rounded-2xl p-4 flex flex-col gap-2.5 hover:border-slate-300 transition-colors bg-white relative overflow-hidden group">
                                                    <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-[#F97316] rounded-l-2xl" />
                                                    <div className="flex justify-between items-center pl-1">
                                                        <span className="text-xs font-black text-slate-900">
                                                            ID #{r.report_id.toString().padStart(4, '0')} — {categoryMap[r.category_id] || r.animal_type || 'Incident'}
                                                        </span>
                                                        <span className="px-2.5 py-0.5 bg-blue-50 text-blue-700 rounded-md text-[9px] font-black uppercase tracking-wider">
                                                            {getStatusName(r.status_id)}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-slate-600 leading-relaxed line-clamp-2 pl-1">
                                                        {r.description || `Incident reported at ${r.landmark || 'subdivision'}.`}
                                                    </p>

                                                    {r.landmark && (
                                                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 bg-slate-50 px-2.5 py-1 rounded-lg ml-1">
                                                            <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                                            </svg>
                                                            <span className="truncate">{r.landmark}</span>
                                                        </div>
                                                    )}

                                                    <div className="grid grid-cols-2 gap-2.5 mt-1 pt-2.5 border-t border-slate-100 text-xs pl-1">
                                                        <button
                                                            onClick={() => handleLocateOnMap(r)}
                                                            className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs bg-white hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
                                                        >
                                                            <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                                            </svg>
                                                            Locate
                                                        </button>
                                                        <button
                                                            onClick={() => setSelectedDetailReport(r)}
                                                            className="flex items-center justify-center py-2 px-3 rounded-xl bg-[#F97316] hover:bg-orange-600 text-white font-bold text-xs transition-colors shadow-xs cursor-pointer"
                                                        >
                                                            Details
                                                        </button>
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="text-center text-slate-400 py-8">
                                                <p className="text-xs font-bold text-slate-600">No cases assigned to you</p>
                                                <p className="text-[11px] text-slate-400 mt-1">Check Unassigned tab to claim new reports.</p>
                                            </div>
                                        )
                                    )}

                                    {activeCaseTab === 'my' && casesSubFilter === 'unassigned' && (
                                        rawUnassigned.length > 0 ? (
                                            rawUnassigned.map(r => (
                                                <div key={r.report_id} className="border border-amber-100 bg-[#FFFDF7] shadow-xs rounded-2xl p-4 flex flex-col gap-2.5 hover:border-amber-300 transition-colors relative overflow-hidden">
                                                    <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-amber-400 rounded-l-2xl" />
                                                    <div className="flex justify-between items-center pl-1">
                                                        <span className="text-xs font-black text-slate-900">
                                                            ID #{r.report_id.toString().padStart(4, '0')} — {categoryMap[r.category_id] || r.animal_type || 'Incident'}
                                                        </span>
                                                        <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-md text-[9px] font-black uppercase tracking-wider">
                                                            UNASSIGNED
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-slate-600 leading-relaxed line-clamp-2 pl-1">
                                                        {r.description || `Incident reported at ${r.landmark || 'subdivision'}.`}
                                                    </p>

                                                    {r.landmark && (
                                                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 bg-white/80 border border-amber-50 px-2.5 py-1 rounded-lg ml-1">
                                                            <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                                            <span className="truncate">{r.landmark}</span>
                                                        </div>
                                                    )}

                                                    <div className="grid grid-cols-2 gap-2.5 mt-1 pt-2.5 border-t border-amber-100/60 text-xs pl-1">
                                                        <button
                                                            onClick={() => setSelectedDetailReport(r)}
                                                            className="flex items-center justify-center py-2 px-3 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs bg-white hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
                                                        >
                                                            View
                                                        </button>
                                                        <button
                                                            onClick={() => handleClaimReport(r.report_id)}
                                                            disabled={claimingId === r.report_id}
                                                            className="flex items-center justify-center py-2 px-3 rounded-xl bg-[#F97316] hover:bg-[#ea580c] text-white font-bold text-xs transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
                                                        >
                                                            {claimingId === r.report_id ? 'Claiming...' : 'Claim Case'}
                                                        </button>
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="text-center text-slate-400 py-8">
                                                <p className="text-xs font-bold text-slate-600">No unassigned cases</p>
                                            </div>
                                        )
                                    )}

                                    {activeCaseTab === 'escalated' && (
                                        rawEscalated.length > 0 ? (
                                            rawEscalated.map(r => (
                                                <div key={r.report_id} className="border border-orange-100 bg-[#FFF9F5] rounded-2xl p-4 flex flex-col gap-2.5 relative overflow-hidden shadow-xs">
                                                    <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-[#EA580C] rounded-l-2xl" />
                                                    <div className="flex justify-between items-center pl-1">
                                                        <span className="text-xs font-black text-slate-900">
                                                            ID #{r.report_id.toString().padStart(4, '0')} — {categoryMap[r.category_id] || r.animal_type || 'Incident'}
                                                        </span>
                                                        <span className="px-2 py-0.5 bg-orange-100 text-[#EA580C] rounded-md text-[9px] font-black uppercase tracking-wider">
                                                            FORWARDED TO BRGY
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-slate-600 leading-relaxed line-clamp-2 pl-1">
                                                        {r.description || `Incident reported at ${r.landmark || 'subdivision'}.`}
                                                    </p>

                                                    {r.landmark && (
                                                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 bg-white px-2.5 py-1 rounded-lg border border-orange-50 ml-1">
                                                            <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                                            <span className="truncate">{r.landmark}</span>
                                                        </div>
                                                    )}

                                                    <div className="grid grid-cols-2 gap-2.5 mt-1 pt-2.5 border-t border-orange-100/60 text-xs pl-1">
                                                        <button
                                                            onClick={() => handleLocateOnMap(r)}
                                                            className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs bg-white hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
                                                        >
                                                            <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                                            Locate
                                                        </button>
                                                        <button
                                                            onClick={() => setSelectedDetailReport(r)}
                                                            className="flex items-center justify-center py-2 px-3 rounded-xl bg-[#F97316] hover:bg-[#ea580c] text-white font-bold text-xs transition-colors shadow-xs cursor-pointer"
                                                        >
                                                            Details
                                                        </button>
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="text-center text-slate-400 py-8">
                                                <p className="text-xs font-bold text-slate-600">No escalated cases</p>
                                            </div>
                                        )
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 4. Secondary Row: Active Hazard Notices (Left) & Recent Pet Claims (Right) */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">

                        {/* A. Active Hazard Notices */}
                        <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-slate-100 shadow-sm flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-slate-900 font-black text-xs uppercase tracking-wider">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M18 3a1 1 0 00-1.447-.894L8.763 6H5a3 3 0 000 6h.28l1.771 5.316A1 1 0 008 18h1a1 1 0 001-1v-4.382l6.553 3.276A1 1 0 0018 15V3z" clipRule="evenodd" />
                                    </svg>
                                    <span>Active Hazard Notices</span>
                                </div>
                                <button
                                    onClick={() => navigate('/subd/hazard-alert')}
                                    className="text-[11px] font-bold text-blue-600 hover:text-blue-700 hover:underline cursor-pointer"
                                >
                                    View All
                                </button>
                            </div>

                            <div className="flex flex-col gap-2.5">
                                {announcements && announcements.length > 0 ? (
                                    announcements.slice(0, 3).map((ann, idx) => {
                                        const isEmergency = ann.category === 'Emergency' || (ann.title || '').toLowerCase().includes('rabies') || (ann.title || '').toLowerCase().includes('alert');
                                        const isAdvisory = ann.category === 'Advisory' || (ann.title || '').toLowerCase().includes('stray');

                                        const cardBg = isEmergency
                                            ? 'bg-rose-50/70 border-rose-100/90 text-rose-900'
                                            : isAdvisory
                                                ? 'bg-amber-50/70 border-amber-100/90 text-amber-900'
                                                : 'bg-blue-50/70 border-blue-100/90 text-blue-900';

                                        const iconBg = isEmergency
                                            ? 'bg-rose-500 text-white'
                                            : isAdvisory
                                                ? 'bg-amber-500 text-white'
                                                : 'bg-blue-500 text-white';

                                        const titleColor = isEmergency
                                            ? 'text-rose-900 group-hover:text-rose-700'
                                            : isAdvisory
                                                ? 'text-amber-900 group-hover:text-amber-700'
                                                : 'text-blue-900 group-hover:text-blue-700';

                                        const textColor = isEmergency ? 'text-rose-700' : isAdvisory ? 'text-amber-700' : 'text-blue-700';
                                        const metaColor = isEmergency ? 'text-rose-500' : isAdvisory ? 'text-amber-500' : 'text-blue-500';
                                        const arrowColor = isEmergency
                                            ? 'text-rose-400 group-hover:text-rose-600'
                                            : isAdvisory
                                                ? 'text-amber-400 group-hover:text-amber-600'
                                                : 'text-blue-400 group-hover:text-blue-600';

                                        const formattedTime = ann.created_at
                                            ? new Date(ann.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
                                            ' · ' +
                                            new Date(ann.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                                            : 'Recent';

                                        return (
                                            <div
                                                key={ann.announcement_id || idx}
                                                onClick={() => navigate('/subd/hazard-alert')}
                                                className={`p-3.5 rounded-2xl border flex items-start justify-between gap-2.5 hover:translate-x-1 transition-all duration-200 cursor-pointer group ${cardBg}`}
                                            >
                                                <div className="flex items-start gap-3">
                                                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 shadow-xs group-hover:scale-110 transition-transform ${iconBg}`}>
                                                        {isEmergency ? (
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                                                                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                                            </svg>
                                                        ) : isAdvisory ? (
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                                                <path d="M12 21.5c-3.038 0-5.5-2.462-5.5-5.5s2.462-5.5 5.5-5.5s5.5 2.462 5.5 5.5s-2.462 5.5-5.5 5.5zm-5.5-12c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5s2.5 1.119 2.5 2.5s-1.119 2.5-2.5 2.5zm11 0c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5s2.5 1.119 2.5 2.5s-1.119 2.5-2.5 2.5zM12 8c-1.381 0-2.5-1.119-2.5-2.5S10.619 3 12 3s2.5 1.119 2.5 2.5S13.381 8 12 8z" />
                                                            </svg>
                                                        ) : (
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                                                                <path fillRule="evenodd" d="M18 3a1 1 0 00-1.447-.894L8.763 6H5a3 3 0 000 6h.28l1.771 5.316A1 1 0 008 18h1a1 1 0 001-1v-4.382l6.553 3.276A1 1 0 0018 15V3z" clipRule="evenodd" />
                                                            </svg>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <h4 className={`text-xs font-black transition-colors ${titleColor}`}>
                                                            {ann.title}
                                                        </h4>
                                                        <p className={`text-[11px] mt-0.5 leading-snug line-clamp-2 ${textColor}`}>
                                                            {ann.content}
                                                        </p>
                                                        <span className={`text-[9px] font-semibold block mt-1 ${metaColor}`}>
                                                            {formattedTime}
                                                        </span>
                                                    </div>
                                                </div>
                                                <span className={`group-hover:translate-x-0.5 transition-all font-bold text-xs mt-1 ${arrowColor}`}>
                                                    ›
                                                </span>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div className="p-6 text-center text-slate-400 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                                        <p className="text-xs font-bold text-slate-600">No active hazard notices</p>
                                        <p className="text-[11px] text-slate-400 mt-1">All clear in Selera Subdivision.</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* B. Recent Pet Claims Queue */}
                        <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-slate-100 shadow-sm flex flex-col gap-3.5">
                            {/* MOBILE VIEW (Matching Provided Design Mockup) */}
                            <div className="md:hidden flex flex-col gap-3.5">
                                {/* Header with Paw Icon and View All */}
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <svg className="w-5 h-5 text-orange-500 fill-current shrink-0" viewBox="0 0 24 24">
                                            <ellipse cx="6.5" cy="7" rx="2" ry="3" />
                                            <ellipse cx="17.5" cy="7" rx="2" ry="3" />
                                            <ellipse cx="10" cy="4" rx="2" ry="3" />
                                            <ellipse cx="14" cy="4" rx="2" ry="3" />
                                            <path d="M12 9c-3 0-5.5 2.5-5.5 6 0 2.5 2 4.5 5.5 4.5s5.5-2 5.5-4.5c0-3.5-2.5-6-5.5-6z" />
                                        </svg>
                                        <h3 className="text-[#0B1527] font-black text-sm uppercase tracking-wide">
                                            RECENT PET CLAIMS
                                        </h3>
                                    </div>
                                    <button
                                        onClick={() => navigate('/subd/pet-claims')}
                                        className="text-xs font-bold text-blue-600 hover:text-blue-700 cursor-pointer"
                                    >
                                        View All
                                    </button>
                                </div>

                                {/* 3 Status Summary Stat Cards */}
                                <div className="grid grid-cols-3 gap-2.5">
                                    <div className="bg-[#FFF9F3] border border-orange-200/80 rounded-2xl py-2.5 px-2 text-center flex flex-col items-center justify-center shadow-2xs">
                                        <span className="text-[10px] font-black tracking-wider text-orange-500 uppercase">
                                            PENDING
                                        </span>
                                        <span className="text-xl font-black text-orange-500 leading-tight mt-0.5">
                                            {summaryPendingClaims}
                                        </span>
                                    </div>
                                    <div className="bg-[#F0FDF4] border border-emerald-200/80 rounded-2xl py-2.5 px-2 text-center flex flex-col items-center justify-center shadow-2xs">
                                        <span className="text-[10px] font-black tracking-wider text-emerald-600 uppercase">
                                            APPROVED
                                        </span>
                                        <span className="text-xl font-black text-slate-900 leading-tight mt-0.5">
                                            {summaryApprovedClaims}
                                        </span>
                                    </div>
                                    <div className="bg-[#FFF1F2] border border-rose-200/80 rounded-2xl py-2.5 px-2 text-center flex flex-col items-center justify-center shadow-2xs">
                                        <span className="text-[10px] font-black tracking-wider text-rose-500 uppercase">
                                            REJECTED
                                        </span>
                                        <span className="text-xl font-black text-rose-500 leading-tight mt-0.5">
                                            {summaryRejectedClaims}
                                        </span>
                                    </div>
                                </div>

                                {/* Mobile Pet Claim Cards List */}
                                <div className="flex flex-col gap-3">
                                    {recentClaimsData.slice(0, 3).map((item, idx) => (
                                        <div
                                            key={item.claim_id || idx}
                                            className="bg-white rounded-2xl p-3.5 border border-slate-100/90 shadow-[0_2px_8px_rgba(0,0,0,0.03)] flex flex-col gap-3"
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <img
                                                        src={item.photo_url}
                                                        alt={item.pet_name}
                                                        onError={(e) => {
                                                            (e.target as HTMLElement).setAttribute('src', 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=150&auto=format&fit=crop');
                                                        }}
                                                        className="w-14 h-14 rounded-xl object-cover border border-slate-100 shrink-0 bg-slate-100"
                                                    />
                                                    <div className="min-w-0">
                                                        <h4 className="font-black text-[#0B1527] text-sm truncate">
                                                            ID #{String(item.claim_id).padStart(4, '0')} — {item.pet_name}
                                                        </h4>
                                                        <p className="text-xs text-slate-500 font-medium mt-0.5 truncate">
                                                            Owner: {item.claimant_name}
                                                        </p>
                                                        <p className="text-[11px] text-slate-400 mt-0.5">
                                                            Submitted: {item.time_ago}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="shrink-0 pt-0.5">
                                                    {getMobileClaimStatusBadge(item.status)}
                                                </div>
                                            </div>

                                            {/* Action Button: Single View Button */}
                                            <div className="pt-0.5">
                                                <button
                                                    onClick={() => navigate(`/subd/pet-claims?claim_id=${item.claim_id}`, { state: { claimId: item.claim_id } })}
                                                    className="w-full py-2.5 px-4 rounded-xl bg-orange-50 hover:bg-orange-100 text-[#F97316] font-bold text-xs border border-orange-200/70 shadow-2xs hover:shadow-xs active:scale-[0.98] transition-all text-center cursor-pointer flex items-center justify-center gap-1.5"
                                                >
                                                    <svg className="w-3.5 h-3.5 stroke-[2.5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                    </svg>
                                                    <span>View</span>
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* DESKTOP VIEW (Preserved Desktop Table Layout) */}
                            <div className="hidden md:flex flex-col gap-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h.01M16 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        <h3 className="text-slate-900 font-black text-xs uppercase tracking-wider">
                                            Recent Pet Claims
                                        </h3>
                                    </div>
                                    <button
                                        onClick={() => navigate('/subd/pet-claims')}
                                        className="text-[11px] font-bold text-blue-600 hover:text-blue-700 hover:underline cursor-pointer"
                                    >
                                        View All
                                    </button>
                                </div>

                                {/* Table Container with safe scrollbar for desktop */}
                                <div className="overflow-x-auto -mx-1 px-1 custom-scrollbar">
                                    <div className="min-w-[360px] sm:min-w-0">
                                        {/* Table Header */}
                                        <div className="grid grid-cols-12 gap-2 text-[10px] font-black text-slate-400 uppercase tracking-wider pb-1.5 border-b border-slate-100">
                                            <div className="col-span-4">PET & OWNER</div>
                                            <div className="col-span-2 text-center">AI MATCH</div>
                                            <div className="col-span-4">CLAIM STATUS</div>
                                            <div className="col-span-2 text-right">ACTION</div>
                                        </div>

                                        {/* Table Rows */}
                                        <div className="flex flex-col gap-1.5">
                                            {recentClaimsData && recentClaimsData.length > 0 ? (
                                                recentClaimsData.map((item, idx) => {
                                                    const matchVal = item.similarity_score || 90;
                                                    return (
                                                        <div
                                                            key={item.claim_id || idx}
                                                            className="grid grid-cols-12 gap-2 items-center text-xs py-2 px-2 border-b border-slate-50 last:border-0 hover:bg-orange-50/50 hover:shadow-2xs rounded-xl transition-all duration-200 group"
                                                        >
                                                            {/* Pet & Owner Info */}
                                                            <div className="col-span-4 min-w-0">
                                                                <p className="font-black text-slate-900 text-xs truncate group-hover:text-orange-600 transition-colors">
                                                                    {item.pet_name}
                                                                </p>
                                                                <p className="text-[10px] text-slate-400 font-medium truncate">
                                                                    {item.claimant_name} • {item.landmark}
                                                                </p>
                                                            </div>

                                                            {/* AI Match Badge */}
                                                            <div className="col-span-2 flex justify-center">
                                                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-black tracking-tight ${matchVal >= 90
                                                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                                        : matchVal >= 80
                                                                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                                                            : 'bg-slate-100 text-slate-700 border border-slate-200'
                                                                    }`}>
                                                                    {matchVal}%
                                                                </span>
                                                            </div>

                                                            {/* Claim Status Badge */}
                                                            <div className="col-span-4 flex items-center">
                                                                {getClaimStatusBadge(item.status)}
                                                            </div>

                                                            {/* Action Button */}
                                                            <div className="col-span-2 text-right">
                                                                <button
                                                                    onClick={() => navigate('/subd/pet-claims')}
                                                                    className="px-3 py-1 bg-orange-500 hover:bg-orange-600 active:scale-95 text-white font-black text-[10px] rounded-lg transition-all shadow-xs hover:shadow-sm cursor-pointer"
                                                                >
                                                                    Review
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })
                                            ) : (
                                                <div className="p-6 text-center text-slate-400 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                                                    <p className="text-xs font-bold text-slate-600">No pet claims pending</p>
                                                    <p className="text-[11px] text-slate-400 mt-1">No community claims at this time.</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>

                </div>

                {/* Reusable Mobile Bottom Navigation Component */}
                <SubdBottomNav activeTab="dashboard" onMapClick={() => setIsMapExpanded(true)} />
            </main>

            {/* ENLARGED FULLSCREEN MAP MODAL */}
            {isMapExpanded && (
                <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full sm:w-[95%] h-full sm:h-[92%] flex flex-col p-3 sm:p-6 animate-in zoom-in-95 duration-200">
                        {/* Header */}
                        <div className="flex justify-between items-center mb-2.5 sm:mb-4 shrink-0">
                            <div>
                                <h3 className="text-sm sm:text-xl font-black text-gray-900 uppercase tracking-tight">Geospatial Community Map</h3>
                                <p className="text-[9px] sm:text-[11px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Full Subdivision Real-Time View</p>
                            </div>
                            <div className="flex items-center gap-1.5 sm:gap-3">
                                <div className="flex bg-slate-100/90 p-1 rounded-2xl text-[9px] sm:text-[10px] font-black uppercase border border-slate-200/80 shadow-2xs">
                                    <button
                                        onClick={() => setMapMode('pins')}
                                        className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl transition-all cursor-pointer ${mapMode === 'pins' ? 'bg-[#F97316] text-white shadow-sm font-black' : 'text-slate-500 hover:text-slate-900'}`}
                                    >
                                        Pins
                                    </button>
                                    <button
                                        onClick={() => setMapMode('heatmap')}
                                        className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl transition-all cursor-pointer ${mapMode === 'heatmap' ? 'bg-[#F97316] text-white shadow-sm font-black' : 'text-slate-500 hover:text-slate-900'}`}
                                    >
                                        Heatmap
                                    </button>
                                    <button
                                        onClick={() => setMapMode('both')}
                                        className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl transition-all cursor-pointer ${mapMode === 'both' ? 'bg-[#F97316] text-white shadow-sm font-black' : 'text-slate-500 hover:text-slate-900'}`}
                                    >
                                        Both
                                    </button>
                                </div>
                                <button
                                    onClick={() => setIsMapExpanded(false)}
                                    className="p-1.5 sm:p-2 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors text-gray-500 hover:text-gray-800 shrink-0 cursor-pointer"
                                >
                                    <svg className="h-5 w-5 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        {/* Map Area */}
                        <div className="flex-1 rounded-2xl overflow-hidden relative border border-gray-100 min-h-0">
                            <MapComponent
                                height="100%"
                                center={[14.8013, 121.0036]}
                                zoom={17}
                                markers={mapMode !== 'heatmap' ? mapMarkers : mapMarkers.filter(m => m.id < 0)}
                                showHeatmap={mapMode !== 'pins'}
                                heatmapPoints={heatmapPoints}
                                showGeofence={true}
                                showLandmarks={true}
                                onMapClick={(lat, lng) => setSelectedMapCoords({ lat, lng })}
                                onViewDetails={(marker) => {
                                    const reportId = marker.rawData?.report_id || (marker.id > 0 ? marker.id : null);
                                    if (reportId) {
                                        setIsMapExpanded(false);
                                        navigate(`/subd/reports/${reportId}`);
                                    }
                                }}
                                routing={getRoutingConfig()}
                            />

                            {/* Floating Coordinate Pill Overlay in expanded modal */}
                            {selectedMapCoords && (
                                <div className="absolute top-3 right-3 z-[1000] bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-2xl shadow-xl border border-orange-200/90 flex items-center gap-2 text-xs animate-in fade-in zoom-in-95 duration-150">
                                    <span className="w-2 h-2 rounded-full bg-orange-500 animate-ping" />
                                    <span className="font-black text-slate-800 tracking-tight text-[11px]">
                                        {selectedMapCoords.lat.toFixed(6)}, {selectedMapCoords.lng.toFixed(6)}
                                    </span>
                                    <button
                                        onClick={() => {
                                            if (navigator.clipboard) {
                                                navigator.clipboard.writeText(`${selectedMapCoords.lat.toFixed(6)}, ${selectedMapCoords.lng.toFixed(6)}`);
                                            }
                                        }}
                                        className="px-2 py-0.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-bold text-[10px] transition-colors shadow-2xs cursor-pointer"
                                        title="Copy coordinates"
                                    >
                                        Copy
                                    </button>
                                    <button
                                        onClick={() => setSelectedMapCoords(null)}
                                        className="text-slate-400 hover:text-slate-600 font-bold ml-1 cursor-pointer"
                                        title="Clear pinpoint"
                                    >
                                        ✕
                                    </button>
                                </div>
                            )}

                            {/* Legend in Expanded Map */}
                            <div className="absolute bottom-3 left-3 z-[1000]">
                                <div className="bg-white/95 backdrop-blur-md p-2.5 sm:p-3 rounded-2xl shadow-xl border border-slate-200/90 text-[10px] sm:text-[11px] font-bold text-slate-700 flex flex-col gap-1.5 min-w-[115px] sm:min-w-[130px]">
                                    <div className="flex items-center gap-2">
                                        <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-xs shrink-0" />
                                        <span>High Priority</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-xs shrink-0" />
                                        <span>Medium Priority</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-xs shrink-0" />
                                        <span>Low Priority</span>
                                    </div>
                                    <div className="h-px bg-slate-100 my-0.5" />
                                    <div className="flex items-center gap-2">
                                        <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-xs shrink-0" />
                                        <span>Verified</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="w-2.5 h-2.5 rounded-full bg-slate-300 border border-slate-400 shadow-xs shrink-0" />
                                        <span>Unverified</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* REPORT DETAILS MODAL */}
            {selectedDetailReport && (
                <div className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col p-6 animate-in zoom-in-95 duration-200">
                        {/* Header */}
                        <div className="flex justify-between items-center border-b border-gray-100 pb-4 mb-4 shrink-0">
                            <div>
                                <h3 className="text-base font-black text-gray-900 uppercase">Report Details</h3>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Case ID: #{selectedDetailReport.report_id}</p>
                            </div>
                            <button
                                onClick={() => setSelectedDetailReport(null)}
                                className="p-1.5 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-gray-700 cursor-pointer"
                            >
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Body */}
                        <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-thin">
                            {selectedDetailReport.media && selectedDetailReport.media.length > 0 ? (
                                <img
                                    src={selectedDetailReport.media[0].file_url}
                                    alt="Incident Report"
                                    className="w-full h-44 object-cover rounded-2xl border border-gray-100 shadow-sm"
                                />
                            ) : (
                                <div className="w-full h-24 bg-gray-50 border border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center text-gray-400 text-xs">
                                    <span>🐾 No photo uploaded for this report</span>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4 text-xs text-gray-750">
                                <div>
                                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Animal Species / Breed</span>
                                    <span className="font-semibold text-gray-800">{selectedDetailReport.animal_type || 'Unknown'}</span>
                                </div>
                                <div>
                                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Priority Level</span>
                                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider mt-0.5 ${(selectedDetailReport.priority_level || '').toLowerCase() === 'high' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'
                                        }`}>
                                        {selectedDetailReport.priority_level || 'Medium'}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Location / Landmark</span>
                                    <span className="font-semibold text-gray-800">{selectedDetailReport.landmark || 'Subdivision'}</span>
                                </div>
                                <div>
                                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Status</span>
                                    <span className="font-semibold text-gray-800">{selectedDetailReport.status?.status_name || getStatusName(selectedDetailReport.status_id)}</span>
                                </div>
                            </div>

                            <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Description</span>
                                <p className="text-xs text-gray-700 italic">"{selectedDetailReport.description || 'No description provided.'}"</p>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="border-t border-gray-100 pt-4 mt-4 flex items-center justify-between shrink-0">
                            <button
                                onClick={() => navigate(`/subd/reports/${selectedDetailReport.report_id}`)}
                                className="px-4 py-2.5 bg-[#F97316] hover:bg-[#EA580C] text-white rounded-xl text-xs font-black uppercase tracking-wider transition-colors shadow-sm flex items-center gap-1.5 cursor-pointer"
                            >
                                <span>Open Full Report</span>
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                            </button>
                            <button
                                onClick={() => setSelectedDetailReport(null)}
                                className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-black uppercase tracking-wider transition-colors cursor-pointer"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SubdDashboard;
