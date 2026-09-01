import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import MapComponent from '../../components/MapComponent';
import SubdSidebar from '../../components/SubdSidebar';
import SubdNavbar from '../../components/Navbars/SubdNavbar';
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
    1: 'Injured Animal', 2: 'Aggressive Stray', 3: 'Possible Rabies Risk',
    4: 'Roaming Pack', 5: 'Animal Rescue Needed', 6: 'Lost Pet'
};

const SubdDashboard = () => {
    const navigate = useNavigate();

    const [reports, setReports] = useState<Report[]>(() => getCachedData<Report[]>('subd_dashboard_reports') || []);
    const [rescues, setRescues] = useState<RescueRequest[]>(() => getCachedData<RescueRequest[]>('subd_dashboard_rescues') || []);
    const [petCount, setPetCount] = useState<number>(() => getCachedData<number>('subd_dashboard_pets_count') || 0);
    const [loading, setLoading] = useState<boolean>(() => !getCachedData<Report[]>('subd_dashboard_reports'));
    const [mapMode, setMapMode] = useState<'pins' | 'heatmap' | 'both'>('both');
    const [mapFilter, setMapFilter] = useState<'all' | 'my'>('all');
    const [isMapExpanded, setIsMapExpanded] = useState(false);
    const [selectedDetailReport, setSelectedDetailReport] = useState<any>(null);
    const [selectedReport, setSelectedReport] = useState<any>(null);
    const [isNavigating, setIsNavigating] = useState(false);
    const [navSource, setNavSource] = useState<'hq' | 'brgy' | 'current'>('brgy');
    const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [activeTab, setActiveTab] = useState<'my' | 'escalated'>('my');
    const [casesSubFilter, setCasesSubFilter] = useState<'my' | 'unassigned'>('my');
    const [claimingId, setClaimingId] = useState<number | null>(null);
    const [trendFilter, setTrendFilter] = useState<'7D' | '4W' | '6M' | '1Y'>('7D');
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
        const subId = user?.subdivision_id;

        const fetchAll = async () => {
            if (!getCachedData('subd_dashboard_reports')) {
                setLoading(true);
            }
            try {
                const reportsUrl = subId ? `http://localhost:8000/reports/?subdivision_id=${subId}` : 'http://localhost:8000/reports/';
                const rescuesUrl = subId ? `http://localhost:8000/rescue-requests/?subdivision_id=${subId}` : 'http://localhost:8000/rescue-requests/';
                const petsUrl = subId ? `http://localhost:8000/pets/subdivision/${subId}` : 'http://localhost:8000/pets/';

                const [reportsRes, rescuesRes, petsRes] = await Promise.allSettled([
                    axios.get(reportsUrl),
                    axios.get(rescuesUrl),
                    axios.get(petsUrl),
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
                    const petCountVal = (petsRes.value.data || []).length;
                    setPetCount(petCountVal);
                    setCachedData('subd_dashboard_pets_count', petCountVal);
                }
            } catch (err) {
                console.error('Dashboard fetch error:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchAll();
    }, []);

    const handleClaimReport = async (reportId: number) => {
        const uid = currentUser?.user_id || currentUser?.id;
        if (!uid) return;
        setClaimingId(reportId);
        try {
            await axios.put(`http://localhost:8000/reports/${reportId}`, {
                assigned_leader_id: uid,
            });
            setReports(prev => prev.map(r => r.report_id === reportId ? { ...r, assigned_leader_id: uid } : r));
        } catch (err) {
            console.error('Failed to claim report:', err);
            navigate('/staff/reports');
        } finally {
            setClaimingId(null);
        }
    };

    const handleLocateOnMap = (r: Report) => {
        setSelectedReport(r);
        setIsNavigating(true);
        setNavSource('brgy');
    };

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

    const getRescueStatusName = (statusId: number) => {
        switch (statusId) {
            case 1: return 'Pending Action';
            case 2: return 'Approved';
            case 3: return 'Rejected';
            case 4: return 'Started (In Progress)';
            case 5: return 'Dispatched (Assigned)';
            case 6: return 'Resolved';
            default: return 'Pending';
        }
    };

    const getMarkerColor = (report: any, rescue: any) => {
        const statusId = report.status_id;
        if (statusId === 6 || statusId === 11) return 'green'; // Resolved
        if (statusId === 12) return 'red'; // Deceased
        if (statusId === 3) return 'red'; // Rejected

        if (statusId === 7 || statusId === 8 || statusId === 9) return 'purple'; // Picked Up

        if (rescue) {
            const rescueStatus = rescue.status_id;
            if (rescueStatus === 6) return 'green'; // Resolved
            if (rescueStatus === 4) return 'yellow'; // In Progress
            if (rescueStatus === 5) return 'blue'; // Assigned
            if (rescue.staff_id) return 'blue'; // Assigned
        }

        if (statusId === 5) return 'yellow'; // In Progress (fallback)
        if (statusId === 4 || statusId === 13) return 'orange'; // Endorsed / Approved
        if (statusId === 1 || statusId === 2) return 'red'; // Pending

        return 'red';
    };

    const currentUserId = currentUser?.user_id || currentUser?.id;
    // Closed / Resolved statuses: 11 (Resolved), 12 (Deceased), 3 (Rejected), 9 (Claimed/Impounded closed), 10 (Released), 14 (False Alarm), 6 (Resolved/Picked up)
    const isResolvedOrClosed = (r: Report) => [6, 11, 12, 3, 9, 10, 14].includes(r.status_id);

    const unassignedReports = reports.filter(r => !r.assigned_leader_id && !isResolvedOrClosed(r));
    const unassignedCount = unassignedReports.length;
    const myActiveCases = reports.filter(r => r.assigned_leader_id === currentUserId && !isResolvedOrClosed(r));
    const myActiveCount = myActiveCases.length;
    const escalatedCases = reports.filter(r => r.status_id === 4);
    const escalatedCount = escalatedCases.length;

    // Active reports for the map (all resolved reports are excluded)
    const activeReports = reports.filter(r => !isResolvedOrClosed(r));
    const mapFilteredReports = mapFilter === 'my'
        ? activeReports.filter(r => r.assigned_leader_id === currentUserId)
        : activeReports;

    // Trend chart: dynamic timeframe (7D, 4W, 6M, 1Y)
    const trendData = (() => {
        const data: { label: string; count: number }[] = [];
        const now = new Date();

        if (trendFilter === '7D') {
            for (let i = 6; i >= 0; i--) {
                const d = new Date();
                d.setDate(now.getDate() - i);
                const label = d.toLocaleDateString('en-US', { weekday: 'short' });
                const dateStr = d.toISOString().slice(0, 10);
                const count = reports.filter(r => r.created_at?.slice(0, 10) === dateStr).length;
                data.push({ label, count });
            }
        } else if (trendFilter === '4W') {
            for (let i = 3; i >= 0; i--) {
                const start = new Date(now);
                start.setDate(now.getDate() - (i + 1) * 7);
                const end = new Date(now);
                end.setDate(now.getDate() - i * 7);
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
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const nextMonth = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
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
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const nextMonth = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
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


    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const mapSectionRef = useRef<HTMLDivElement>(null);

    const scrollToMap = () => {
        if (mapSectionRef.current) {
            mapSectionRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    };

    const statCards = [
        {
            label: 'UNASSIGNED',
            value: unassignedCount,
            icon: (
                <svg className="w-5 h-5 text-[#854D0E]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
            ),
            bg: 'bg-[#FEFCE8]',
            border: 'border border-[#FEF08A]/80',
            labelColor: 'text-[#854D0E]',
            textColor: 'text-[#713F12]',
        },
        {
            label: 'ACTIVE CASES',
            value: myActiveCount,
            icon: (
                <svg className="w-5 h-5 text-[#2563EB]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h.01M12 10v4" />
                </svg>
            ),
            bg: 'bg-[#EFF6FF]',
            border: 'border border-[#BFDBFE]/80',
            labelColor: 'text-[#1D4ED8]',
            textColor: 'text-[#1E40AF]',
        },
        {
            label: 'ESCALATED',
            value: escalatedCount,
            icon: (
                <svg className="w-5 h-5 text-[#EA580C]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
            ),
            bg: 'bg-[#FFF7ED]',
            border: 'border border-[#FED7AA]/80',
            labelColor: 'text-[#C2410C]',
            textColor: 'text-[#9A3412]',
        },
        {
            label: 'REGISTERED PETS',
            value: petCount,
            icon: (
                <svg className="w-5 h-5 text-[#16A34A]" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 21.5c-3.038 0-5.5-2.462-5.5-5.5s2.462-5.5 5.5-5.5s5.5 2.462 5.5 5.5s-2.462 5.5-5.5 5.5zm-5.5-12c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5s2.5 1.119 2.5 2.5s-1.119 2.5-2.5 2.5zm11 0c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5s2.5 1.119 2.5 2.5s-1.119 2.5-2.5 2.5zM12 8c-1.381 0-2.5-1.119-2.5-2.5S10.619 3 12 3s2.5 1.119 2.5 2.5S13.381 8 12 8z" />
                </svg>
            ),
            bg: 'bg-[#F0FDF4]',
            border: 'border border-[#BBF7D0]/80',
            labelColor: 'text-[#15803D]',
            textColor: 'text-[#166534]',
        },
    ];
    const ADMIN_HQ: [number, number] = [14.806906, 121.0039297];

    // Filter heatmap points based on the active map filter
    const heatmapPoints: [number, number, number][] = mapFilteredReports
        .filter(r => r.latitude && r.longitude)
        .map(r => [
            parseFloat(r.latitude),
            parseFloat(r.longitude),
            r.priority_level === 'High' ? 1.0 : 0.6
        ]);

    const mapMarkers = [
        {
            id: -1,
            lat: ADMIN_HQ[0],
            lng: ADMIN_HQ[1],
            title: "Barangay Hall HQ",
            category: "Barangay Office",
            time: "Base"
        },
        ...(userLocation ? [{
            id: -2,
            lat: userLocation[0],
            lng: userLocation[1],
            title: "Your Location",
            category: "Operator",
            time: "Live"
        }] : []),
        ...mapFilteredReports
            .filter(r => r.latitude && r.longitude)
            .map((r: any) => {
                const associatedRescue = rescues.find(req => req.report_id === r.report_id);
                const color = getMarkerColor(r, associatedRescue);
                const statusName = r.status?.status_name || getStatusName(r.status_id);

                return {
                    id: r.report_id,
                    lat: parseFloat(r.latitude),
                    lng: parseFloat(r.longitude),
                    title: r.description || `Incident #${r.report_id}`,
                    priority: r.priority_level || "Medium",
                    category: r.animal_type || "Stray Animal",
                    color: color,
                    time: r.created_at ? new Date(r.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' }) : "N/A",
                    rawData: {
                        ...r,
                        statusName: statusName,
                        reporterName: r.reporter_name || r.user?.name || (r.user_id ? `Resident #${r.user_id}` : 'Anonymous'),
                    }
                };
            })
    ];

    const getRoutingConfig = () => {
        if (!isNavigating || !selectedReport) return undefined;
        const repLat = parseFloat(selectedReport.latitude || selectedReport.lat);
        const repLng = parseFloat(selectedReport.longitude || selectedReport.lng);
        if (isNaN(repLat) || isNaN(repLng)) return undefined;
        const destName = selectedReport.landmark || selectedReport.title || `Report #${selectedReport.report_id}`;

        if (navSource === 'current' && userLocation) {
            return {
                start: userLocation,
                end: [repLat, repLng] as [number, number],
                waypointNames: ["Your Location", destName] as [string, string],
                onClose: () => setIsNavigating(false)
            };
        } else {
            return {
                start: ADMIN_HQ,
                end: [repLat, repLng] as [number, number],
                waypointNames: ["Barangay Hall HQ", destName] as [string, string],
                onClose: () => setIsNavigating(false)
            };
        }
    };

    return (
        <div className="min-h-screen w-full flex bg-[#F8F9FA] font-sans text-gray-800">
            <SubdSidebar mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />

            <main className="flex-1 flex flex-col h-screen overflow-hidden">
                <SubdNavbar
                    onMenuToggle={() => setMobileMenuOpen(true)}
                    leftContent={
                        <div className="flex flex-col">
                            <h1 className="text-base sm:text-xl font-black text-gray-900 tracking-tight leading-none uppercase">Subdivision Dashboard</h1>
                            <p className="hidden sm:block text-[9px] text-gray-400 font-extrabold uppercase tracking-wider mt-1.5 leading-none">Overview of reports, rescue operations, and registered pets</p>
                        </div>
                    }
                />

                <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 pb-28 md:pb-8 flex flex-col gap-6 custom-scrollbar bg-[#FAFAF9]">
                    {/* Stat Cards - 2x2 on mobile, 4 columns on desktop */}
                    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 lg:gap-5">
                        {statCards.map((card) => (
                            <div
                                key={card.label}
                                className={`${card.bg} ${card.border} rounded-2xl p-4 sm:p-5 flex flex-col justify-between shadow-[0_2px_8px_rgba(0,0,0,0.02)] relative min-h-[96px] sm:min-h-[105px] transition-transform duration-200 hover:-translate-y-0.5`}
                            >
                                <div className="flex items-start justify-between">
                                    <p className={`text-[10px] sm:text-[11px] font-extrabold ${card.labelColor} uppercase tracking-wider`}>
                                        {card.label}
                                    </p>
                                    <div className="shrink-0">{card.icon}</div>
                                </div>
                                {loading ? (
                                    <div className="h-8 w-12 bg-black/5 rounded-lg animate-pulse mt-2" />
                                ) : (
                                    <p className={`text-2xl sm:text-3xl lg:text-4xl font-black ${card.textColor} mt-1 leading-none tracking-tight`}>
                                        {card.value}
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Responsive Content Grid: Trend -> Cases -> Map on mobile; 2 cols (Trend/Map left, Cases right) on desktop */}
                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">

                        {/* 1. Incident Report Trend Card */}
                        <div className="order-1 xl:col-span-2 bg-white rounded-2xl p-4 sm:p-5 shadow-xs border border-gray-100 shrink-0">
                            {/* Header Controls */}
                            <div className="flex items-center justify-between gap-3 mb-4">
                                <h3 className="text-xs sm:text-sm font-black text-gray-900 uppercase tracking-tight">
                                    Incident Report Trend
                                </h3>

                                {/* Segmented Filter Pill */}
                                <div className="flex items-center bg-gray-100/90 p-0.5 sm:p-1 rounded-xl border border-gray-200/60">
                                    {(['7D', '4W', '6M', '1Y'] as const).map((period) => (
                                        <button
                                            key={period}
                                            onClick={() => setTrendFilter(period)}
                                            className={`px-2.5 sm:px-3 py-1 text-[10px] font-black rounded-lg transition-all ${
                                                trendFilter === period
                                                    ? 'bg-[#0F172A] text-white shadow-xs'
                                                    : 'text-[#64748B] hover:text-gray-900 hover:bg-white/50'
                                            }`}
                                        >
                                            {period}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {loading ? (
                                <div className="h-[140px] bg-gray-50 rounded-xl animate-pulse" />
                            ) : (
                                <div className="relative h-[140px] w-full flex pt-3">
                                    {/* Fixed Left Y-Axis Labels */}
                                    <div className="w-6 sm:w-7 shrink-0 flex flex-col justify-between pb-6 select-none z-20 bg-white">
                                        {[2, 1, 0].map((step, i) => {
                                            const maxScale = maxTrend <= 2 ? 2 : Math.ceil(maxTrend / 2) * 2;
                                            const val = Math.round((maxScale / 2) * step);
                                            return (
                                                <span key={i} className="text-[9px] font-bold text-gray-300 text-right pr-2 -mt-2">
                                                    {val}
                                                </span>
                                            );
                                        })}
                                    </div>

                                    {/* Horizontally Scrollable Bars Canvas */}
                                    <div 
                                        ref={chartScrollRef}
                                        className="flex-1 relative overflow-x-auto overflow-y-hidden custom-scrollbar pb-1"
                                        style={{ scrollbarWidth: 'thin' }}
                                    >
                                        {/* Dashed Gridlines spanning the full scrollable width */}
                                        <div className="absolute inset-0 flex flex-col justify-between pb-6 pointer-events-none min-w-full">
                                            {[2, 1, 0].map((_, i) => (
                                                <div key={i} className="w-full h-0 border-t border-dashed border-[#F1F5F9]" />
                                            ))}
                                        </div>
                                        
                                        {/* Bars Track */}
                                        <div 
                                            className="flex items-end justify-between relative z-10 h-full pb-6 px-2 sm:px-3 gap-2 sm:gap-3"
                                            style={{ minWidth: trendFilter === '1Y' ? '600px' : trendFilter === '6M' ? '320px' : '100%' }}
                                        >
                                            {trendData.map((day, i) => {
                                                const maxScale = maxTrend <= 2 ? 2 : Math.ceil(maxTrend / 2) * 2;
                                                const heightPct = maxScale > 0 ? (day.count / maxScale) * 100 : 0;
                                                
                                                return (
                                                    <div key={i} className="flex flex-col items-center justify-end h-full flex-1 min-w-[24px] sm:min-w-[28px] max-w-[48px] group relative">
                                                        {day.count > 0 ? (
                                                            <>
                                                                <div className="mb-1 text-[9px] font-black text-[#EA580C] bg-orange-50/90 border border-orange-100 shadow-2xs rounded px-1.5 py-0.2 z-20 transition-transform group-hover:scale-110">
                                                                    {day.count}
                                                                </div>
                                                                <div 
                                                                    className="w-[18px] sm:w-[22px] bg-gradient-to-t from-[#EA580C] to-[#F97316] group-hover:from-[#C2410C] group-hover:to-[#EA580C] rounded-t-sm sm:rounded-t-md transition-all duration-300 shadow-xs"
                                                                    style={{ height: `${heightPct}%` }}
                                                                />
                                                            </>
                                                        ) : (
                                                            <div className="w-[14px] h-[2px] bg-[#E2E8F0] rounded-full mb-0.5" />
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

                        {/* 2. Cases Section (Tabbed Lists) - Mobile: 2nd, Desktop: right column */}
                        <div className="order-2 xl:col-span-1 xl:row-span-2 bg-white rounded-2xl sm:rounded-3xl border border-gray-100 shadow-sm flex flex-col overflow-hidden">
                            {/* Tabs Header */}
                            <div className="flex items-center border-b border-gray-100 px-4 pt-3 gap-6 bg-white shrink-0">
                                <button 
                                    onClick={() => setActiveTab('my')}
                                    className={`pb-2.5 text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 relative ${
                                        activeTab === 'my' 
                                            ? 'text-gray-900 border-b-2 border-[#F97316]' 
                                            : 'text-gray-400 hover:text-gray-700'
                                    }`}
                                >
                                    <span>My Cases ({myActiveCount})</span>
                                </button>
                                <button 
                                    onClick={() => setActiveTab('escalated')}
                                    className={`pb-2.5 text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 relative ${
                                        activeTab === 'escalated' 
                                            ? 'text-gray-900 border-b-2 border-[#F97316]' 
                                            : 'text-gray-400 hover:text-gray-700'
                                    }`}
                                >
                                    <span>Escalated ({escalatedCount})</span>
                                </button>
                            </div>

                            {/* Sub-bar for My Cases */}
                            {activeTab === 'my' && (
                                <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-100/60 text-xs">
                                    <div className="flex items-center gap-2">
                                        <button 
                                            onClick={() => setCasesSubFilter('my')} 
                                            className={`px-3.5 py-1 rounded-full text-xs font-bold transition-all ${
                                                casesSubFilter === 'my' 
                                                    ? 'bg-[#F97316] text-white shadow-xs' 
                                                    : 'bg-white border border-gray-200 text-gray-600 hover:text-gray-900'
                                            }`}
                                        >
                                            Assigned to Me ({myActiveCount})
                                        </button>
                                        <button 
                                            onClick={() => setCasesSubFilter('unassigned')} 
                                            className={`px-3.5 py-1 rounded-full text-xs font-bold transition-all ${
                                                casesSubFilter === 'unassigned' 
                                                    ? 'bg-[#F97316] text-white shadow-xs' 
                                                    : 'bg-white border border-gray-200 text-gray-600 hover:text-gray-900'
                                            }`}
                                        >
                                            Unassigned ({unassignedCount})
                                        </button>
                                    </div>
                                    <button 
                                        onClick={() => navigate('/subd/reports')}
                                        className="text-[11px] font-bold text-[#F97316] hover:underline"
                                    >
                                        All Reports →
                                    </button>
                                </div>
                            )}

                            {/* List Body */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-3.5 custom-scrollbar max-h-[540px] xl:max-h-[750px]">
                                {activeTab === 'my' && (
                                    casesSubFilter === 'my' ? (
                                        myActiveCases.length > 0 ? (
                                            myActiveCases.map(r => (
                                                <div key={r.report_id} className="border border-gray-100 shadow-xs rounded-2xl p-4 flex flex-col gap-2.5 hover:border-gray-300 transition-colors bg-white relative overflow-hidden group">
                                                    <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-[#F97316]"></div>
                                                    <div className="flex justify-between items-center pl-1">
                                                        <span className="text-xs font-black text-gray-900">
                                                            ID #{r.report_id.toString().padStart(4, '0')} — {categoryMap[r.category_id] || r.animal_type || 'Incident'}
                                                        </span>
                                                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md text-[9px] font-black uppercase tracking-wider">
                                                            {getStatusName(r.status_id)}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-gray-600 leading-relaxed line-clamp-2 pl-1">
                                                        {r.description || `Incident reported at ${r.landmark || 'subdivision'}.`}
                                                    </p>
                                                    
                                                    {r.landmark && (
                                                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 bg-gray-50 px-2.5 py-1 rounded-lg ml-1">
                                                            <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                                                            <span className="truncate">{r.landmark}</span>
                                                        </div>
                                                    )}

                                                    <div className="grid grid-cols-2 gap-2.5 mt-1 pt-2.5 border-t border-gray-100 text-xs pl-1">
                                                        <button 
                                                            onClick={() => handleLocateOnMap(r)}
                                                            className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-gray-200 text-gray-700 font-bold text-xs bg-white hover:bg-gray-50 transition-colors shadow-2xs"
                                                        >
                                                            <svg className="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                                                            Locate
                                                        </button>
                                                        <button 
                                                            onClick={() => setSelectedDetailReport(r)} 
                                                            className="flex items-center justify-center py-2 px-3 rounded-xl bg-[#F97316] hover:bg-orange-600 text-white font-bold text-xs transition-colors shadow-xs"
                                                        >
                                                            Details
                                                        </button>
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 py-12 px-4">
                                                <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mb-3">
                                                    <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
                                                </div>
                                                <span className="text-xs font-black text-gray-700 uppercase tracking-wider">No Active Cases Assigned</span>
                                                <p className="text-[11px] text-gray-400 mt-1 max-w-xs">You currently don't have any cases assigned. You can claim unassigned reports from your subdivision.</p>
                                                {unassignedCount > 0 && (
                                                    <button 
                                                        onClick={() => setCasesSubFilter('unassigned')}
                                                        className="mt-4 bg-[#F97316] text-white px-4 py-2 rounded-xl text-xs font-bold shadow-xs hover:bg-[#ea580c] transition-colors"
                                                    >
                                                        View Unassigned Queue ({unassignedCount})
                                                    </button>
                                                )}
                                            </div>
                                        )
                                    ) : (
                                        unassignedReports.length > 0 ? (
                                            unassignedReports.map(r => (
                                                <div key={r.report_id} className="border border-amber-100 bg-[#FFFDF7] shadow-xs rounded-2xl p-4 flex flex-col gap-2.5 hover:border-amber-300 transition-colors relative overflow-hidden">
                                                    <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-amber-400"></div>
                                                    <div className="flex justify-between items-center pl-1">
                                                        <span className="text-xs font-black text-gray-900">
                                                            ID #{r.report_id.toString().padStart(4, '0')} — {categoryMap[r.category_id] || r.animal_type || 'Incident'}
                                                        </span>
                                                        <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-md text-[9px] font-black uppercase tracking-wider">
                                                            UNASSIGNED
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-gray-600 leading-relaxed line-clamp-2 pl-1">
                                                        {r.description || `Incident reported at ${r.landmark || 'subdivision'}.`}
                                                    </p>
                                                    
                                                    {r.landmark && (
                                                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 bg-white/80 border border-amber-50 px-2.5 py-1 rounded-lg ml-1">
                                                            <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                                                            <span className="truncate">{r.landmark}</span>
                                                        </div>
                                                    )}

                                                    <div className="grid grid-cols-2 gap-2.5 mt-1 pt-2.5 border-t border-amber-100/60 text-xs pl-1">
                                                        <button 
                                                            onClick={() => setSelectedDetailReport(r)} 
                                                            className="flex items-center justify-center py-2 px-3 rounded-xl border border-gray-200 text-gray-700 font-bold text-xs bg-white hover:bg-gray-50 transition-colors shadow-2xs"
                                                        >
                                                            View
                                                        </button>
                                                        <button 
                                                            onClick={() => handleClaimReport(r.report_id)}
                                                            disabled={claimingId === r.report_id}
                                                            className="flex items-center justify-center py-2 px-3 rounded-xl bg-[#F97316] hover:bg-[#ea580c] text-white font-bold text-xs transition-colors shadow-xs disabled:opacity-50"
                                                        >
                                                            {claimingId === r.report_id ? 'Claiming...' : 'Claim Case'}
                                                        </button>
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 py-12">
                                                <svg className="w-10 h-10 mb-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                                                <span className="text-xs font-black text-gray-700 uppercase tracking-wider">All Cases Claimed</span>
                                                <p className="text-[11px] text-gray-400 mt-1">There are no unassigned reports waiting in your subdivision.</p>
                                            </div>
                                        )
                                    )
                                )}

                                {activeTab === 'escalated' && (
                                    escalatedCases.length > 0 ? (
                                        escalatedCases.map(r => (
                                            <div key={r.report_id} className="border border-orange-100 bg-[#FFF9F5] rounded-2xl p-4 flex flex-col gap-2.5 relative overflow-hidden shadow-xs">
                                                <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-[#EA580C]"></div>
                                                <div className="flex justify-between items-center pl-1">
                                                    <span className="text-xs font-black text-gray-900">
                                                        ID #{r.report_id.toString().padStart(4, '0')} — {categoryMap[r.category_id] || r.animal_type || 'Incident'}
                                                    </span>
                                                    <span className="px-2 py-0.5 bg-orange-100 text-[#EA580C] rounded-md text-[9px] font-black uppercase tracking-wider">
                                                        FORWARDED TO BRGY
                                                    </span>
                                                </div>
                                                <p className="text-xs text-gray-600 leading-relaxed line-clamp-2 pl-1">
                                                    {r.description || `Incident reported at ${r.landmark || 'subdivision'}.`}
                                                </p>
                                                
                                                {r.landmark && (
                                                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 bg-white px-2.5 py-1 rounded-lg border border-orange-50 ml-1">
                                                        <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                                                        <span className="truncate">{r.landmark}</span>
                                                    </div>
                                                )}

                                                <div className="grid grid-cols-2 gap-2.5 mt-1 pt-2.5 border-t border-orange-100/60 text-xs pl-1">
                                                    <button 
                                                        onClick={() => handleLocateOnMap(r)}
                                                        className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-gray-200 text-gray-700 font-bold text-xs bg-white hover:bg-gray-50 transition-colors shadow-2xs"
                                                    >
                                                        <svg className="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                                                        Locate
                                                    </button>
                                                    <button 
                                                        onClick={() => setSelectedDetailReport(r)} 
                                                        className="flex items-center justify-center py-2 px-3 rounded-xl bg-[#F97316] hover:bg-[#ea580c] text-white font-bold text-xs transition-colors shadow-xs"
                                                    >
                                                        Details
                                                    </button>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="h-full flex flex-col items-center justify-center text-gray-400 py-12 text-center">
                                            <div className="w-12 h-12 rounded-full bg-orange-50 flex items-center justify-center mb-3">
                                                <svg className="w-6 h-6 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                                            </div>
                                            <span className="text-xs font-black text-gray-700 uppercase tracking-wider">No Escalated Cases</span>
                                            <p className="text-[11px] text-gray-400 mt-1">No cases have been forwarded to the Barangay at this time.</p>
                                        </div>
                                    )
                                )}
                            </div>
                        </div>

                        {/* 3. Map Section - Mobile: 3rd, Desktop: bottom left */}
                        <div ref={mapSectionRef} className="order-3 xl:col-span-2 bg-white rounded-2xl sm:rounded-3xl p-3 sm:p-5 border border-gray-100 shadow-sm flex flex-col min-h-[380px] sm:min-h-[500px]">
                            
                            {/* Map Controls Header */}
                            <div className="flex items-center justify-between gap-2 mb-3 overflow-x-auto pb-1 hide-scrollbar">
                                <div className="bg-gray-50 p-1 rounded-full border border-gray-200 flex items-center gap-1 text-[10px] sm:text-[11px] font-bold min-w-max">
                                    <button
                                        onClick={() => setMapFilter('all')}
                                        className={`px-3 py-1.5 rounded-full transition-all ${
                                            mapFilter === 'all' 
                                                ? 'bg-[#0F172A] text-white shadow-xs font-extrabold' 
                                                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                                        }`}
                                    >
                                        All Cases
                                    </button>
                                    <button
                                        onClick={() => setMapFilter('my')}
                                        className={`px-3 py-1.5 rounded-full transition-all ${
                                            mapFilter === 'my' 
                                                ? 'bg-[#0F172A] text-white shadow-xs font-extrabold' 
                                                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                                        }`}
                                    >
                                        My Cases
                                    </button>
                                    <div className="w-px h-4 bg-gray-300 mx-1"></div>
                                    <button
                                        onClick={() => setMapMode(mapMode === 'pins' ? 'both' : 'pins')}
                                        className={`px-3 py-1.5 rounded-full transition-all ${
                                            mapMode === 'pins' 
                                                ? 'bg-[#0F172A] text-white shadow-xs font-extrabold' 
                                                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                                        }`}
                                    >
                                        Pins
                                    </button>
                                    <button
                                        onClick={() => setMapMode(mapMode === 'heatmap' ? 'both' : 'heatmap')}
                                        className={`px-3 py-1.5 rounded-full transition-all ${
                                            mapMode === 'heatmap' 
                                                ? 'bg-[#0F172A] text-white shadow-xs font-extrabold' 
                                                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                                        }`}
                                    >
                                        Heatmap
                                    </button>
                                </div>

                                {/* Fullscreen button */}
                                <button
                                    onClick={() => setIsMapExpanded(true)}
                                    className="w-8 h-8 flex items-center justify-center bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-full border border-gray-200 transition-all shrink-0"
                                    title="Expand Map"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h3a1 1 0 010 2H5v2a1 1 0 01-2 0V4zm14 0a1 1 0 00-1-1h-3a1 1 0 110 2h2v2a1 1 0 112 0V4zM3 16a1 1 0 001 1h3a1 1 0 100-2H5v-2a1 1 0 10-2 0v3zm14 0a1 1 0 01-1 1h-3a1 1 0 100-2h2v-2a1 1 0 102 0v3z" />
                                    </svg>
                                </button>
                            </div>

                            {/* Map Container */}
                            <div className="w-full flex-1 h-[340px] sm:h-[460px] min-h-[340px] sm:min-h-[460px] rounded-xl sm:rounded-2xl overflow-hidden border border-gray-100 relative">

                                <MapComponent
                                    height="100%"
                                    center={[14.8093, 121.0028]}
                                    zoom={15}
                                    markers={mapMode !== 'heatmap' ? mapMarkers : mapMarkers.filter(m => m.id < 0)}
                                    showHeatmap={mapMode !== 'pins'}
                                    heatmapPoints={heatmapPoints}
                                    onViewDetails={(marker) => {
                                        const reportId = marker.rawData?.report_id || (marker.id > 0 ? marker.id : null);
                                        if (reportId) {
                                            navigate(`/subd/reports/${reportId}`);
                                        }
                                    }}
                                    routing={getRoutingConfig()}
                                    onMarkerClick={(m) => {
                                        if (m.id === -1) {
                                            setSelectedReport(null);
                                            setIsNavigating(false);
                                        } else {
                                            const fullReport = reports.find(r => r.report_id.toString() === m.id.toString());
                                            if (fullReport) {
                                                setSelectedReport(fullReport);
                                                setNavSource(m.source || 'brgy');
                                                setIsNavigating(true);
                                            }
                                        }
                                    }}
                                />

                                {/* Legend overlay - Bottom Right (Matches screenshot) */}
                                <div className="absolute bottom-4 right-4 z-[1000]">
                                    <div className="bg-white/95 backdrop-blur-md p-2.5 sm:p-3 rounded-2xl shadow-md border border-gray-100 text-[10px] sm:text-[11px] font-bold text-gray-700 flex flex-col gap-1.5 min-w-[105px]">
                                        <div className="flex items-center gap-2">
                                            <span className="w-2.5 h-2.5 rounded-full bg-[#EA580C] shrink-0 shadow-xs" />
                                            <span>High Priority</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="w-2.5 h-2.5 rounded-full bg-[#3B82F6] shrink-0 shadow-xs" />
                                            <span>Standard</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>

                {/* Mobile Bottom Navigation Bar */}
                <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-gray-200/80 px-6 py-2 z-40 flex items-center justify-around shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
                    <button
                        type="button"
                        className="flex flex-col items-center gap-0.5 bg-[#F97316] text-white px-5 py-1.5 rounded-full font-black text-[10px] shadow-sm cursor-pointer"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
                        </svg>
                        <span>Overview</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => navigate('/subd/reports')}
                        className="flex flex-col items-center gap-0.5 text-gray-500 hover:text-[#F97316] px-3 py-1 transition-colors cursor-pointer"
                    >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                        <span className="text-[10px] font-bold">Tasks</span>
                    </button>

                    <button
                        type="button"
                        onClick={scrollToMap}
                        className="flex flex-col items-center gap-0.5 text-gray-500 hover:text-[#F97316] px-3 py-1 transition-colors cursor-pointer"
                    >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span className="text-[10px] font-bold">Map</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => navigate('/subd/profile')}
                        className="flex flex-col items-center gap-0.5 text-gray-500 hover:text-[#F97316] px-3 py-1 transition-colors cursor-pointer"
                    >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        <span className="text-[10px] font-bold">Profile</span>
                    </button>
                </nav>
            </main>

            {/* ENLARGED FULLSCREEN MAP MODAL */}
            {isMapExpanded && (
                <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
                    <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl w-[98%] sm:w-[95%] h-[98%] sm:h-[92%] flex flex-col p-3 sm:p-6 animate-in zoom-in-95 duration-200">
                        {/* Header */}
                        <div className="flex flex-col gap-3 mb-3 sm:mb-4 shrink-0 relative">
                            {/* Title & Close Button Row */}
                            <div className="flex justify-between items-start">
                                <div className="pr-10">
                                    <h3 className="text-sm sm:text-xl font-black text-gray-900 uppercase tracking-tight">Geospatial Command Center</h3>
                                    <p className="text-[8px] sm:text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5 sm:mt-1">Full-Scale Incident & Rescuer Density Monitor</p>
                                </div>
                                <button
                                    onClick={() => setIsMapExpanded(false)}
                                    className="absolute top-0 right-0 p-1 sm:p-2 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors text-gray-500 hover:text-gray-800 shrink-0"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                            
                            {/* Filters Row */}
                            <div className="flex items-center gap-2 flex-wrap">
                                {/* Cases Filter in Fullscreen Modal */}
                                <div className="flex bg-gray-100 p-1 rounded-xl text-[9px] font-black uppercase border border-gray-200">
                                    <button
                                        onClick={() => setMapFilter('all')}
                                        className={`px-3 py-1.5 rounded-lg transition-all ${mapFilter === 'all' ? 'bg-[#1A4543] text-white shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                                    >
                                        All Cases ({activeReports.length})
                                    </button>
                                    <button
                                        onClick={() => setMapFilter('my')}
                                        className={`px-3 py-1.5 rounded-lg transition-all ${mapFilter === 'my' ? 'bg-[#1A4543] text-white shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                                    >
                                        My Cases ({myActiveCount})
                                    </button>
                                </div>

                                {/* Map Mode Toggles */}
                                <div className="flex bg-gray-100 p-1 rounded-xl text-[9px] font-black uppercase border border-gray-200">
                                    <button
                                        onClick={() => setMapMode('pins')}
                                        className={`px-3 py-1.5 rounded-lg transition-all ${mapMode === 'pins' ? 'bg-[#1A4543] text-white shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                                    >
                                        Pins
                                    </button>
                                    <button
                                        onClick={() => setMapMode('heatmap')}
                                        className={`px-3 py-1.5 rounded-lg transition-all ${mapMode === 'heatmap' ? 'bg-[#1A4543] text-white shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                                    >
                                        Heatmap
                                    </button>
                                    <button
                                        onClick={() => setMapMode('both')}
                                        className={`px-3 py-1.5 rounded-lg transition-all ${mapMode === 'both' ? 'bg-[#1A4543] text-white shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                                    >
                                        Both
                                    </button>
                                </div>
                            </div>
                        </div>



                        {/* Map Area */}
                        <div className="flex-1 rounded-2xl overflow-hidden relative border border-gray-100 min-h-0">
                            <MapComponent
                                height="100%"
                                center={[14.8093, 121.0028]}
                                zoom={15.5}
                                markers={mapMode !== 'heatmap' ? mapMarkers : mapMarkers.filter(m => m.id < 0)}
                                showHeatmap={mapMode !== 'pins'}
                                heatmapPoints={heatmapPoints}
                                onViewDetails={(marker) => {
                                    const reportId = marker.rawData?.report_id || (marker.id > 0 ? marker.id : null);
                                    if (reportId) {
                                        setIsMapExpanded(false);
                                        navigate(`/subd/reports/${reportId}`);
                                    }
                                }}
                                routing={getRoutingConfig()}
                                onMarkerClick={(m) => {
                                    if (m.id === -1) {
                                        setSelectedReport(null);
                                        setIsNavigating(false);
                                    } else {
                                        const fullReport = reports.find(r => r.report_id.toString() === m.id.toString());
                                        if (fullReport) {
                                            setSelectedReport(fullReport);
                                            setNavSource(m.source || 'brgy');
                                            setIsNavigating(true);
                                        }
                                    }
                                }}
                            />

                            <div className="absolute bottom-4 right-4 z-[1000]">
                                <div className="bg-white/95 backdrop-blur-md p-3.5 rounded-2xl shadow-md border border-gray-100 text-[10px] font-bold text-gray-600 flex flex-col gap-2 min-w-[120px]">
                                    <div className="text-[9px] font-black uppercase text-gray-400 tracking-wider mb-0.5">Status Legend</div>
                                    <div className="flex items-center gap-2">
                                        <span className="w-2.5 h-2.5 rounded-full bg-[#EF4444] shrink-0" />
                                        <span>Pending</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="w-2.5 h-2.5 rounded-full bg-[#F97316] shrink-0" />
                                        <span>Endorsed</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="w-2.5 h-2.5 rounded-full bg-[#3B82F6] shrink-0" />
                                        <span>Assigned</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B] shrink-0" />
                                        <span>In Progress</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="w-2.5 h-2.5 rounded-full bg-[#8B5CF6] shrink-0" />
                                        <span>Picked Up</span>
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
                                className="p-1.5 hover:bg-gray-150 rounded-full transition-colors text-gray-400 hover:text-gray-700"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Body */}
                        <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-thin">
                            {/* Media Image */}
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

                            {/* Details Grid */}
                            <div className="grid grid-cols-2 gap-4 text-xs text-gray-750">
                                <div>
                                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Animal Species / Breed</span>
                                    <span className="font-semibold text-gray-800">{selectedDetailReport.animal_type || 'Unknown'} {selectedDetailReport.animal_breed ? `(${selectedDetailReport.animal_breed})` : ''}</span>
                                </div>
                                <div>
                                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Priority Level</span>
                                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider mt-0.5 ${selectedDetailReport.priority_level === 'High' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'
                                        }`}>{selectedDetailReport.priority_level || 'Medium'}</span>
                                </div>
                                <div>
                                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Health Condition</span>
                                    <span className="font-semibold text-gray-800">{selectedDetailReport.condition || 'No specific condition listed'}</span>
                                </div>
                                <div>
                                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Status</span>
                                    <span className="font-semibold text-gray-800">{selectedDetailReport.status?.status_name || getStatusName(selectedDetailReport.status_id)}</span>
                                </div>
                                <div>
                                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Reporter Details</span>
                                    <span className="font-semibold text-gray-800">{selectedDetailReport.reporterName || selectedDetailReport.reporter?.name || 'Citizen'}</span>
                                </div>
                                <div>
                                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Contact Information</span>
                                    <span className="font-semibold text-gray-800">{selectedDetailReport.reporter?.phone || selectedDetailReport.reporter?.email || 'No contact permission'}</span>
                                </div>
                                <div>
                                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Date Reported</span>
                                    <span className="font-semibold text-gray-800">{selectedDetailReport.created_at ? new Date(selectedDetailReport.created_at).toLocaleString() : 'N/A'}</span>
                                </div>
                                <div>
                                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Exact Coordinates</span>
                                    <span className="font-semibold text-gray-800 font-mono text-[10px]">{parseFloat(selectedDetailReport.latitude).toFixed(6)}, {parseFloat(selectedDetailReport.longitude).toFixed(6)}</span>
                                </div>
                            </div>

                            {/* Description */}
                            <div className="bg-gray-50/50 p-3 rounded-xl border border-gray-100">
                                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Report Description</span>
                                <p className="text-xs text-gray-700 italic">"{selectedDetailReport.description || 'No description provided.'}"</p>
                            </div>

                            {/* Mission details */}
                            <div className="bg-teal-50/20 p-3 rounded-xl border border-teal-150/40">
                                <span className="text-[9px] font-bold text-[#1A4543] uppercase tracking-wider block mb-1">Current Mission Status</span>
                                <div className="flex justify-between items-center mt-1.5">
                                    <span className="text-xs font-bold text-gray-800">
                                        {selectedDetailReport.rescue ? getRescueStatusName(selectedDetailReport.rescue.status_id) : 'Not Escalated to Barangay Rescue'}
                                    </span>
                                    {selectedDetailReport.rescue && selectedDetailReport.rescue.assigned_staff_name && (
                                        <span className="text-[10px] font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-lg">
                                            Assigned to: {selectedDetailReport.rescue.assigned_staff_name}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="border-t border-gray-100 pt-4 mt-4 flex items-center justify-between shrink-0">
                            <button
                                onClick={() => navigate(`/subd/reports/${selectedDetailReport.report_id}`)}
                                className="px-4 py-2.5 bg-[#F97316] hover:bg-[#EA580C] text-white rounded-xl text-xs font-black uppercase tracking-wider transition-colors shadow-sm flex items-center gap-1.5"
                            >
                                <span>Open Full Report View</span>
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
                            </button>
                            <button
                                onClick={() => setSelectedDetailReport(null)}
                                className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-black uppercase tracking-wider transition-colors"
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
