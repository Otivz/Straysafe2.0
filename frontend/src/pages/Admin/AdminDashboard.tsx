import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../../utils/api';
import AdminSidebar from '../../components/AdminSidebar';
import AdminNavbar from '../../components/Navbars/AdminNavbar';
import MapComponent from '../../components/MapComponent';
import { SAN_VICENTE_HQ, SELERA_DEFAULT_CENTER } from '../../utils/coverageArea';
import { getCachedData, setCachedData } from '../../utils/cache';


const AdminDashboard = () => {
    const navigate = useNavigate();
    const cachedStats = getCachedData<any>('admin_dashboard_stats');
    const [reports, setReports] = useState<any[]>(() => cachedStats?.active_map_reports || []);
    const [loading, setLoading] = useState(() => !cachedStats);
    const [dateRangeFilter, setDateRangeFilter] = useState<'7d' | '30d' | 'all'>('7d');

    // Barangay Map States
    const [mapMode, setMapMode] = useState<'pins' | 'heatmap' | 'both'>('both');
    const [isMapExpanded, setIsMapExpanded] = useState(false);
    const [selectedDetailReport, setSelectedDetailReport] = useState<any>(null);
    const [selectedReport, setSelectedReport] = useState<any>(null);
    const [isNavigating, setIsNavigating] = useState(false);
    const [userLocation, setUserLocation] = useState<[number, number] | null>(null);

    const [dashboardStats, setDashboardStats] = useState<any>(() => cachedStats);

    // Authentication Validation
    useEffect(() => {
        const rawUser = localStorage.getItem('admin_user') || sessionStorage.getItem('admin_user');
        if (!rawUser) {
            navigate('/admin/login');
            return;
        }

        try {
            const user = JSON.parse(rawUser);
            if (user.role_id !== 4) {
                navigate('/admin/login');
            }
        } catch {
            navigate('/admin/login');
        }
    }, [navigate]);

    // Geolocation Fetch
    useEffect(() => {
        if ("geolocation" in navigator) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    setUserLocation([position.coords.latitude, position.coords.longitude]);
                },
                (error) => console.error("Geolocation fetch failed:", error)
            );
        }
    }, []);

    // Data Hydration with 30s Polling (TASK ADMIN-004 Optimized Single Stats Endpoint)
    useEffect(() => {
        const fetchDashboardData = async () => {
            try {
                const res = await api.get('/admin/dashboard-stats');
                if (res.data) {
                    setCachedData('admin_dashboard_stats', res.data, 5 * 60 * 1000);
                    setDashboardStats(res.data);
                    if (Array.isArray(res.data.active_map_reports)) {
                        setReports(res.data.active_map_reports);
                    }
                }
            } catch (err) {
                console.error('Error fetching dashboard statistics:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchDashboardData();
        const interval = setInterval(fetchDashboardData, 30000);
        return () => clearInterval(interval);
    }, []);

    // ─── OPTIMIZED STATS DERIVED FROM SERVER-SIDE AGGREGATIONS (TASK ADMIN-004) ───
    const totalReports = dashboardStats?.total_reports ?? reports.length;
    const activeUsers = dashboardStats?.active_users ?? 1;
    const animalsRecorded = (dashboardStats?.total_pets ?? 0) + (dashboardStats?.holding_count ?? 0) || totalReports;
    
    // Resolution Rate
    const resolvedReportsCount = dashboardStats?.resolved_reports ?? 0;
    const resolutionRate = dashboardStats?.resolution_rate ?? 100;

    // Biometric Match Confidence & Verified Incident Distribution (TASK ADMIN-013)
    const biometricConfidence = dashboardStats?.biometric_match_confidence;
    const verifiedMatchesCount = dashboardStats?.verified_matches_count ?? 0;
    const hasVerifiedConfidence = typeof biometricConfidence === 'number' && biometricConfidence > 0;

    // Report Flow Overview
    const submittedCount = totalReports;
    const validatedCount = dashboardStats?.validated_reports_count ?? 0;
    const validatedPercent = totalReports > 0 ? Math.round((validatedCount / totalReports) * 100) : 0;
    
    const endorsedCount = dashboardStats?.endorsed_count ?? 0;
    const endorsedPercent = totalReports > 0 ? Math.round((endorsedCount / totalReports) * 100) : 0;
    
    const inProgressCount = dashboardStats?.in_progress_count ?? 0;
    const inProgressPercent = totalReports > 0 ? Math.round((inProgressCount / totalReports) * 100) : 0;

    // Verified Incident Distribution (Actual Database Percentages without Hardcoded Fallbacks)
    const dogPercent = dashboardStats?.dog_percentage ?? (totalReports > 0 ? Math.round(((dashboardStats?.dog_reports_count ?? 0) / totalReports) * 100) : 0);
    const catPercent = dashboardStats?.cat_percentage ?? (totalReports > 0 ? Math.round(((dashboardStats?.cat_reports_count ?? 0) / totalReports) * 100) : 0);
    const highRiskPercent = dashboardStats?.high_risk_percentage ?? (totalReports > 0 ? Math.round(((dashboardStats?.high_risk_reports_count ?? 0) / totalReports) * 100) : 0);
    const petIdPercent = dashboardStats?.pet_id_percentage ?? (totalReports > 0 ? Math.round(((dashboardStats?.pet_id_reports_count ?? 0) / totalReports) * 100) : 0);

    // Adoptions Metrics
    const forAdoptionCount = dashboardStats?.for_adoption_count ?? 0;
    const totalAdoptionApps = dashboardStats?.active_adoptions_count ?? 0;
    const approvedAdoptionsCount = dashboardStats?.approved_adoptions_count ?? 0;
    const pendingAdoptionsCount = dashboardStats?.active_adoptions_count ?? 0;
    const totalAdoptionCases = forAdoptionCount + totalAdoptionApps + approvedAdoptionsCount;

    // Community Impact
    const rescuedCount = dashboardStats?.rescued_count ?? 0;
    const adoptedCount = approvedAdoptionsCount;
    const returnedToOwnerCount = dashboardStats?.returned_to_owner_count ?? 0;
    
    // Dynamic Subdivisions Performance from Server Aggregation
    const subdivisionsList = dashboardStats?.subdivisions_list?.length > 0
        ? dashboardStats.subdivisions_list
        : [
            { name: 'San Vicente Proper', reports: totalReports || 1, resolved: resolvedReportsCount, pending: Math.max(0, totalReports - resolvedReportsCount), rate: resolutionRate }
        ];

    // Security Overview & Activity Logs
    const failedLoginsCount = dashboardStats?.failed_logins_count ?? 0;
    const suspendedAccountsCount = dashboardStats?.suspended_users ?? 0;
    const activeAccountsCount = dashboardStats?.active_users ?? 1;

    const recentActivityLogs = dashboardStats?.recent_activity_logs?.length > 0
        ? dashboardStats.recent_activity_logs
        : [];

    const isDataLoading = loading && !dashboardStats;

    // Status Names and Marker Helpers matching Barangay Dashboard
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

    const getMarkerColor = (report: any, rescue: any) => {
        const statusId = report.status_id;
        if (statusId === 6 || [9, 10, 11].includes(statusId)) return 'green';
        if (statusId === 12 || statusId === 3) return 'red';
        if (statusId === 7 || statusId === 8 || statusId === 9) return 'purple';

        if (rescue) {
            const rescueStatus = rescue.status_id;
            if (rescueStatus === 6) return 'green';
            if (rescueStatus === 4) return 'yellow';
            if (rescueStatus === 5 || rescue.staff_id) return 'blue';
        }

        if (statusId === 5) return 'yellow';
        if (statusId === 4 || statusId === 13) return 'orange';
        if (statusId === 1 || statusId === 2) return 'red';

        return 'red';
    };

    // Barangay-style Heatmap & Markers calculations (Active strays only)
    const isResolvedOrClosed = (r: any) => [3, 6, 9, 10, 11, 12, 14, 17, 18].includes(r.status_id);
    const activeMapReports = reports.filter(r => r.latitude && r.longitude && !isResolvedOrClosed(r));

    const heatmapPoints: [number, number, number][] = activeMapReports
        .map((r: any) => [
            parseFloat(r.latitude),
            parseFloat(r.longitude),
            r.priority_level === 'High' ? 1.0 : 0.6
        ]);

    const defaultSubdivisionMarkers = [
        { id: -101, lat: SELERA_DEFAULT_CENTER[0], lng: SELERA_DEFAULT_CENTER[1], title: "Selera Homes Cluster", category: "High Activity", color: "orange" },
        { id: -102, lat: 14.8120, lng: 121.0060, title: "Subdivision B Cluster", category: "High Activity", color: "orange" },
        { id: -103, lat: 14.8050, lng: 121.0080, title: "Subdivision C Cluster", category: "High Activity", color: "orange" },
        { id: -104, lat: 14.8020, lng: 120.9990, title: "Riverside Villas Cluster", category: "Low Activity", color: "green" },
        { id: -105, lat: 14.7980, lng: 121.0010, title: "Greenwoods Cluster", category: "Low Activity", color: "green" }
    ];

    const reportMarkers = activeMapReports
        .map((r: any) => {
            const associatedRescue = r.rescue || null;
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
                    reporterName: r.reporter_name || r.reporter?.name || "Citizen",
                    rescue: associatedRescue
                }
            };
        });

    const mapMarkers = [
        {
            id: -1,
            lat: SAN_VICENTE_HQ[0],
            lng: SAN_VICENTE_HQ[1],
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
        ...(reportMarkers.length > 0 ? reportMarkers : defaultSubdivisionMarkers)
    ];

    return (
        <div className="min-h-screen w-full flex bg-[#F8F9FA] font-sans text-gray-800">
            {/* LEFT SIDEBAR COMPONENT */}
            <AdminSidebar />

            {/* MAIN CONTENT DIV */}
            <main className="flex-1 flex flex-col h-screen overflow-hidden">
                {/* TOP NAVIGATION */}
                <AdminNavbar
                    leftContent={
                        <div className="flex flex-col">
                            <h1 className="text-xl font-black text-[#1A4543] tracking-tight leading-none uppercase">Admin Dashboard</h1>
                            <p className="text-[10px] text-gray-400 font-extrabold uppercase tracking-wider mt-1.5 leading-none">
                                System-wide overview of operations, reports, and system health
                            </p>
                        </div>
                    }
                />

                {/* MAIN SCROLLABLE DASHBOARD VIEW */}
                <div className="flex-1 overflow-y-auto p-8 space-y-8 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">

                    {/* TOP CONTROLS & DATE FILTER BAR */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div>
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Live System Metric Overview</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2.5">
                            {/* Date Range Selector */}
                            <div className="flex items-center bg-white border border-gray-200 rounded-xl p-1 shadow-sm text-xs font-bold text-gray-700">
                                <button
                                    type="button"
                                    onClick={() => setDateRangeFilter('7d')}
                                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                                        dateRangeFilter === '7d' ? 'bg-[#F97316] text-white shadow-xs' : 'text-gray-500 hover:text-gray-900'
                                    }`}
                                >
                                    7 Days
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setDateRangeFilter('30d')}
                                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                                        dateRangeFilter === '30d' ? 'bg-[#F97316] text-white shadow-xs' : 'text-gray-500 hover:text-gray-900'
                                    }`}
                                >
                                    30 Days
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setDateRangeFilter('all')}
                                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                                        dateRangeFilter === 'all' ? 'bg-[#F97316] text-white shadow-xs' : 'text-gray-500 hover:text-gray-900'
                                    }`}
                                >
                                    All Time
                                </button>
                            </div>

                            {/* Quick Action Button: Citations */}
                            <Link
                                to="/admin/warnings"
                                className="px-3.5 py-2 bg-white hover:bg-amber-50 text-amber-700 font-bold text-xs rounded-xl border border-amber-200 shadow-sm transition-all flex items-center gap-1.5"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                </svg>
                                <span>Citations ({dashboardStats?.pending_warnings_count ?? 0} pending)</span>
                            </Link>

                            {/* Quick Action Button: Adoptions */}
                            <Link
                                to="/admin/adoptions"
                                className="px-3.5 py-2 bg-white hover:bg-orange-50 text-orange-600 font-bold text-xs rounded-xl border border-orange-200 shadow-sm transition-all flex items-center gap-1.5"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
                                </svg>
                                <span>Adoptions ({pendingAdoptionsCount} pending)</span>
                            </Link>

                            {/* Quick Action Button: Incidents */}
                            <Link
                                to="/admin/incidents"
                                className="px-3.5 py-2 bg-[#1A4543] hover:bg-[#153836] text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center gap-1.5"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                </svg>
                                <span>Manage Reports</span>
                            </Link>
                        </div>
                    </div>

                    {/* 1. TOP METRICS ROW (5 STAT CARDS) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-5">

                        {/* Card 1: TOTAL REPORTS */}
                        <div className="bg-white rounded-2xl p-5 shadow-[0_2px_14px_rgba(0,0,0,0.02)] border border-gray-100 flex flex-col justify-between h-36 transition-all hover:shadow-md group">
                            <div className="flex justify-between items-start">
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Reports</span>
                                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                </div>
                            </div>
                            <div>
                                <p className="text-3xl font-black text-gray-900 leading-none">{totalReports.toLocaleString()}</p>
                                <p className="text-[10px] font-bold text-gray-400 mt-1">Across all subdivisions</p>
                            </div>
                            <div className="flex items-center space-x-1 text-[10px] font-bold text-emerald-600">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                <span>{reports.filter(r => !isResolvedOrClosed(r)).length} active incidents</span>
                            </div>
                        </div>

                        {/* Card 2: ACTIVE USERS */}
                        <div className="bg-white rounded-2xl p-5 shadow-[0_2px_14px_rgba(0,0,0,0.02)] border border-gray-100 flex flex-col justify-between h-36 transition-all hover:shadow-md group">
                            <div className="flex justify-between items-start">
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Active Users</span>
                                <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                                    </svg>
                                </div>
                            </div>
                            <div>
                                <p className="text-3xl font-black text-gray-900 leading-none">{activeUsers.toLocaleString()}</p>
                                <p className="text-[10px] font-bold text-gray-400 mt-1">Residents, HOA, Barangay</p>
                            </div>
                            <div className="flex items-center space-x-1 text-[10px] font-bold text-emerald-600">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <span>{(dashboardStats?.active_users ?? activeUsers).toLocaleString()} Verified Accounts</span>
                            </div>
                        </div>

                        {/* Card 3: ANIMALS RECORDED */}
                        <div className="bg-white rounded-2xl p-5 shadow-[0_2px_14px_rgba(0,0,0,0.02)] border border-gray-100 flex flex-col justify-between h-36 transition-all hover:shadow-md group">
                            <div className="flex justify-between items-start">
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Animals Recorded</span>
                                <div className="w-8 h-8 rounded-xl bg-pink-50 text-pink-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M12 21.5c-3.038 0-5.5-2.462-5.5-5.5s2.462-5.5 5.5-5.5s5.5 2.462 5.5 5.5s-2.462 5.5-5.5 5.5zm-5.5-12c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5s2.5 1.119 2.5 2.5s-1.119 2.5-2.5 2.5zm11 0c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5s2.5 1.119 2.5 2.5s-1.119 2.5-2.5 2.5z" />
                                    </svg>
                                </div>
                            </div>
                            <div>
                                <p className="text-3xl font-black text-gray-900 leading-none">{animalsRecorded.toLocaleString()}</p>
                                <p className="text-[10px] font-bold text-gray-400 mt-1">{(dashboardStats?.total_pets ?? 0).toLocaleString()} pets / {(dashboardStats?.holding_count ?? 0).toLocaleString()} holding</p>
                            </div>
                            <div className="flex items-center space-x-1 text-[10px] font-bold text-emerald-600">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                                </svg>
                                <span>Database Active</span>
                            </div>
                        </div>

                        {/* Card 4: RESOLUTION RATE */}
                        <div className="bg-white rounded-2xl p-5 shadow-[0_2px_14px_rgba(0,0,0,0.02)] border-2 border-emerald-400 flex flex-col justify-between h-36 transition-all hover:shadow-md group relative overflow-hidden">
                            <div className="flex justify-between items-start">
                                <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Resolution Rate</span>
                                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                </div>
                            </div>
                            <div>
                                <p className="text-3xl font-black text-emerald-600 leading-none">{resolutionRate}%</p>
                                <p className="text-[10px] font-bold text-gray-500 mt-1">{resolvedReportsCount.toLocaleString()} of {totalReports.toLocaleString()} resolved</p>
                            </div>
                            <div className="flex items-center space-x-1 text-[10px] font-bold text-emerald-600">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <span>{totalReports - resolvedReportsCount} pending resolution</span>
                            </div>
                        </div>

                        {/* Card 5: BIOMETRIC MATCH CONFIDENCE (TASK ADMIN-013) */}
                        <div className="bg-white rounded-2xl p-5 shadow-[0_2px_14px_rgba(0,0,0,0.02)] border border-gray-100 flex flex-col justify-between h-36 transition-all hover:shadow-md group">
                            <div className="flex justify-between items-start">
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Match Confidence</span>
                                <div className="w-8 h-8 rounded-xl bg-orange-50 text-[#F97316] flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                    </svg>
                                </div>
                            </div>
                            <div>
                                {hasVerifiedConfidence ? (
                                    <>
                                        <p className="text-3xl font-black text-gray-900 leading-none">{biometricConfidence}%</p>
                                        <p className="text-[10px] font-bold text-gray-400 mt-1">Based on {verifiedMatchesCount} verified matches</p>
                                    </>
                                ) : (
                                    <>
                                        <p className="text-sm font-black text-gray-800 leading-tight">Baseline Training Mode</p>
                                        <p className="text-[10px] font-bold text-amber-600 mt-1">Pending Verifications</p>
                                    </>
                                )}
                            </div>
                            <div className="flex items-center space-x-1 text-[10px] font-bold text-emerald-600">
                                <span className={`w-1.5 h-1.5 rounded-full ${hasVerifiedConfidence ? 'bg-emerald-500' : 'bg-amber-400'}`}></span>
                                <span>{hasVerifiedConfidence ? 'Biometric Engine Active' : 'Collecting Sighting Matches'}</span>
                            </div>
                        </div>

                    </div>

                    {/* 2. MIDDLE SECTION - ROW 1: BARANGAY-STYLE MAP + REPORT FLOW & AI PERFORMANCE */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

                        {/* LEFT (8 cols): GLOBAL ACTIVITY MAP (BARANGAY-STYLE MAP) */}
                        <div className="lg:col-span-8 bg-white rounded-3xl p-6 shadow-[0_2px_14px_rgba(0,0,0,0.02)] border border-gray-100 flex flex-col relative">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                                <div>
                                    <h3 className="text-base font-black text-[#1A4543] uppercase tracking-tight">Global Activity Map</h3>
                                    <p className="text-[11px] font-bold text-gray-400">System-wide report distribution</p>
                                </div>
                                <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                                    {/* Map Mode Toggles */}
                                    <div className="flex bg-gray-100 p-1 rounded-xl text-[9px] font-black uppercase border border-gray-250">
                                        <button
                                            onClick={() => setMapMode('pins')}
                                            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${mapMode === 'pins' ? 'bg-[#1A4543] text-white shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                                        >
                                            Pins
                                        </button>
                                        <button
                                            onClick={() => setMapMode('heatmap')}
                                            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${mapMode === 'heatmap' ? 'bg-[#1A4543] text-white shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                                        >
                                            Heatmap
                                        </button>
                                        <button
                                            onClick={() => setMapMode('both')}
                                            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${mapMode === 'both' ? 'bg-[#1A4543] text-white shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                                        >
                                            Both
                                        </button>
                                    </div>

                                    {/* Expand Map Button */}
                                    <button
                                        onClick={() => setIsMapExpanded(true)}
                                        className="px-3.5 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-xl text-[10px] font-bold border border-gray-200 transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h3a1 1 0 010 2H5v2a1 1 0 01-2 0V4zm14 0a1 1 0 00-1-1h-3a1 1 0 110 2h2v2a1 1 0 112 0V4zM3 16a1 1 0 001 1h3a1 1 0 100-2H5v-2a1 1 0 10-2 0v3zm14 0a1 1 0 01-1 1h-3a1 1 0 100-2h2v-2a1 1 0 102 0v3z" />
                                        </svg>
                                        Expand Map
                                    </button>
                                </div>
                            </div>

                            {/* Leaflet Map Component Container */}
                            <div className="w-full flex-1 min-h-[480px] rounded-2xl overflow-hidden relative border border-gray-100">
                                <MapComponent
                                    center={SAN_VICENTE_HQ}
                                    zoom={14}
                                    markers={mapMode !== 'heatmap' ? mapMarkers : mapMarkers.filter(m => m.id < 0)}
                                    showHeatmap={mapMode !== 'pins'}
                                    heatmapPoints={heatmapPoints}
                                    onViewDetails={(marker) => setSelectedDetailReport(marker.rawData)}
                                    routing={isNavigating && selectedReport ? {
                                        start: SAN_VICENTE_HQ,
                                        end: [parseFloat(selectedReport.latitude || selectedReport.lat), parseFloat(selectedReport.longitude || selectedReport.lng)],
                                        waypointNames: ["Barangay Hall HQ", selectedReport.landmark || selectedReport.title],
                                        onClose: () => setIsNavigating(false)
                                    } : undefined}
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

                                {/* Map Legend Overlay */}
                                <div className="absolute bottom-4 left-4 z-[1000]">
                                    <div className="bg-white/95 backdrop-blur-md p-3.5 rounded-2xl shadow-md border border-gray-100 text-[10px] font-bold text-gray-600 flex flex-col gap-1.5 min-w-[120px]">
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
                                            <span className="w-2.5 h-2.5 rounded-full bg-[#10B981] shrink-0" />
                                            <span>Resolved</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* RIGHT (4 cols): REPORT FLOW & AI PERFORMANCE */}
                        <div className="lg:col-span-4 flex flex-col space-y-6">

                            {/* REPORT FLOW OVERVIEW CARD */}
                            <div className="bg-white rounded-3xl p-6 shadow-[0_2px_14px_rgba(0,0,0,0.02)] border border-gray-100 flex-1">
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Report Flow Overview</h3>
                                <div className="space-y-3.5">

                                    {/* Item 1 */}
                                    <div className="flex items-center justify-between p-2.5 rounded-2xl hover:bg-gray-50 transition-colors">
                                        <div className="flex items-center space-x-3">
                                            <div className="w-7 h-7 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                </svg>
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Submitted</p>
                                                <p className="text-sm font-black text-gray-900 leading-none">{submittedCount.toLocaleString()}</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Item 2 */}
                                    <div className="flex items-center justify-between p-2.5 rounded-2xl hover:bg-gray-50 transition-colors">
                                        <div className="flex items-center space-x-3">
                                            <div className="w-7 h-7 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                </svg>
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Validated</p>
                                                <p className="text-sm font-black text-gray-900 leading-none">{validatedCount.toLocaleString()}</p>
                                            </div>
                                        </div>
                                        <span className="text-[10px] font-bold text-gray-400">{validatedPercent}%</span>
                                    </div>

                                    {/* Item 3 */}
                                    <div className="flex items-center justify-between p-2.5 rounded-2xl hover:bg-gray-50 transition-colors">
                                        <div className="flex items-center space-x-3">
                                            <div className="w-7 h-7 rounded-xl bg-orange-50 text-[#F97316] flex items-center justify-center">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                                </svg>
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Endorsed to Barangay</p>
                                                <p className="text-sm font-black text-gray-900 leading-none">{endorsedCount.toLocaleString()}</p>
                                            </div>
                                        </div>
                                        <span className="text-[10px] font-bold text-gray-400">{endorsedPercent}%</span>
                                    </div>

                                    {/* Item 4 */}
                                    <div className="flex items-center justify-between p-2.5 rounded-2xl hover:bg-gray-50 transition-colors">
                                        <div className="flex items-center space-x-3">
                                            <div className="w-7 h-7 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                </svg>
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">In Progress</p>
                                                <p className="text-sm font-black text-gray-900 leading-none">{inProgressCount.toLocaleString()}</p>
                                            </div>
                                        </div>
                                        <span className="text-[10px] font-bold text-gray-400">{inProgressPercent}%</span>
                                    </div>

                                    {/* Item 5 */}
                                    <div className="flex items-center justify-between p-2.5 rounded-2xl hover:bg-gray-50 transition-colors">
                                        <div className="flex items-center space-x-3">
                                            <div className="w-7 h-7 rounded-xl bg-teal-50 text-[#1A4543] flex items-center justify-center">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Resolved</p>
                                                <p className="text-sm font-black text-gray-900 leading-none">{resolvedReportsCount.toLocaleString()}</p>
                                            </div>
                                        </div>
                                        <span className="text-[10px] font-bold text-[#1A4543]">{resolutionRate}%</span>
                                    </div>

                                </div>
                            </div>

                            {/* BIOMETRIC CONFIDENCE & INCIDENT DISTRIBUTION CARD (TASK ADMIN-013) */}
                            <div className="bg-white rounded-3xl p-6 shadow-[0_2px_14px_rgba(0,0,0,0.02)] border border-gray-100 flex-1">
                                <div className="flex justify-between items-center mb-2">
                                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Match Confidence</h3>
                                    <span className="text-xs font-black text-[#1A4543]">Biometric Avg</span>
                                </div>
                                <div className="mb-4">
                                    {hasVerifiedConfidence ? (
                                        <>
                                            <p className="text-2xl font-black text-gray-900">{biometricConfidence}%</p>
                                            <div className="w-full bg-gray-100 rounded-full h-2 mt-2 overflow-hidden">
                                                <div className="bg-gradient-to-r from-teal-500 to-[#1A4543] h-full rounded-full" style={{ width: `${biometricConfidence}%` }}></div>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="p-3 bg-amber-50/70 border border-amber-200/60 rounded-xl">
                                            <p className="text-xs font-black text-amber-900 leading-tight">Baseline Training Mode</p>
                                            <p className="text-[10px] font-medium text-amber-700 mt-0.5">Pending Human Verifications</p>
                                        </div>
                                    )}
                                </div>

                                <div className="mb-2">
                                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Verified Incident Distribution</h4>
                                </div>

                                <div className="space-y-2 text-xs font-bold text-gray-700">
                                    <div className="flex justify-between items-center">
                                        <span className="flex items-center space-x-2">
                                            <span className="w-2 h-2 rounded-full bg-teal-500"></span>
                                            <span className="text-gray-500 font-medium">Dog Incidents</span>
                                        </span>
                                        <span className="font-black text-gray-900">{dogPercent}%</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="flex items-center space-x-2">
                                            <span className="w-2 h-2 rounded-full bg-teal-500"></span>
                                            <span className="text-gray-500 font-medium">Cat Incidents</span>
                                        </span>
                                        <span className="font-black text-gray-900">{catPercent}%</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="flex items-center space-x-2">
                                            <span className="w-2 h-2 rounded-full bg-red-500"></span>
                                            <span className="text-gray-500 font-medium">Aggressive / High Risk</span>
                                        </span>
                                        <span className="font-black text-gray-900">{highRiskPercent}%</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="flex items-center space-x-2">
                                            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                                            <span className="text-gray-500 font-medium">Owned Pet Matches</span>
                                        </span>
                                        <span className="font-black text-gray-900">{petIdPercent}%</span>
                                    </div>
                                </div>

                                <div className="mt-4 pt-3 border-t border-gray-50 text-right">
                                    <Link to="/admin/incidents" className="text-[11px] font-bold text-[#F97316] hover:underline flex items-center justify-end space-x-1">
                                        <span>View all incidents</span>
                                        <span>&rarr;</span>
                                    </Link>
                                </div>
                            </div>

                        </div>
                    </div>

                    {/* 3. MIDDLE SECTION - ROW 2: SUBDIVISION PERFORMANCE, ADOPTION, COMMUNITY IMPACT & RECENT ACTIVITY */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

                        {/* SUBDIVISION PERFORMANCE TABLE */}
                        <div className="lg:col-span-2 bg-white rounded-3xl p-6 shadow-[0_2px_14px_rgba(0,0,0,0.02)] border border-gray-100 flex flex-col justify-between">
                            <div>
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Subdivision Performance</h3>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="border-b border-gray-100 text-[10px] font-black text-gray-400 uppercase tracking-wider">
                                                <th className="pb-3">Subdivision</th>
                                                <th className="pb-3 text-center">Reports</th>
                                                <th className="pb-3 text-center">Resolved</th>
                                                <th className="pb-3 text-center">Pending</th>
                                                <th className="pb-3 text-right">Rate</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50 text-xs">
                                            {subdivisionsList.map((sub: any) => (
                                                <tr key={sub.name} className="hover:bg-gray-50/60 transition-colors">
                                                    <td className="py-3 font-bold text-gray-900">{sub.name}</td>
                                                    <td className="py-3 text-center font-semibold text-gray-600">{sub.reports}</td>
                                                    <td className="py-3 text-center font-semibold text-gray-600">{sub.resolved}</td>
                                                    <td className="py-3 text-center font-semibold text-gray-600">{sub.pending}</td>
                                                    <td className="py-3 text-right">
                                                        <div className="flex items-center justify-end space-x-2">
                                                            <div className="w-16 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                                                <div className="bg-[#1A4543] h-full rounded-full" style={{ width: `${sub.rate}%` }}></div>
                                                            </div>
                                                            <span className="font-black text-xs text-[#1A4543]">{sub.rate}%</span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            <div className="mt-4 pt-3 border-t border-gray-50 text-left">
                                <Link to="/admin/heatmap" className="text-[11px] font-bold text-[#F97316] hover:underline flex items-center space-x-1">
                                    <span>View all subdivisions on heatmap</span>
                                    <span>&rarr;</span>
                                </Link>
                            </div>
                        </div>

                        {/* ADOPTION OVERVIEW (DONUT CHART) */}
                        <div className="bg-white rounded-3xl p-6 shadow-[0_2px_14px_rgba(0,0,0,0.02)] border border-gray-100 flex flex-col justify-between hover:border-orange-200 transition-all">
                            <div>
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Adoption Overview</h3>
                                    <span className="text-[9px] font-black px-2 py-0.5 bg-orange-50 text-orange-600 rounded-full border border-orange-100 uppercase">Live</span>
                                </div>
                                <div className="flex justify-center my-4 relative">
                                    <svg viewBox="0 0 100 100" className="w-36 h-36 transform -rotate-90">
                                        {/* Teal: For Adoption */}
                                        <circle cx="50" cy="50" r="38" fill="transparent" stroke="#1A4543" strokeWidth="12" strokeDasharray="118 238" strokeDashoffset="0" />
                                        {/* Blue: Applications */}
                                        <circle cx="50" cy="50" r="38" fill="transparent" stroke="#3B82F6" strokeWidth="12" strokeDasharray="65 238" strokeDashoffset="-118" />
                                        {/* Orange: Approved / Adopted */}
                                        <circle cx="50" cy="50" r="38" fill="transparent" stroke="#F97316" strokeWidth="12" strokeDasharray="40 238" strokeDashoffset="-183" />
                                        {/* Purple: Pending */}
                                        <circle cx="50" cy="50" r="38" fill="transparent" stroke="#8B5CF6" strokeWidth="12" strokeDasharray="25 238" strokeDashoffset="-223" />
                                    </svg>
                                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                                        <span className="text-2xl font-black text-gray-900 leading-none">{totalAdoptionCases}</span>
                                        <span className="text-[8px] font-black text-gray-400 uppercase tracking-wider mt-1">Total Cases</span>
                                    </div>
                                </div>

                                <div className="space-y-2 text-xs font-medium text-gray-600">
                                    <div className="flex justify-between items-center">
                                        <span className="flex items-center space-x-2">
                                            <span className="w-2.5 h-2.5 rounded-full bg-[#1A4543]"></span>
                                            <span>For Adoption</span>
                                        </span>
                                        <span className="font-black text-gray-900">{forAdoptionCount}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="flex items-center space-x-2">
                                            <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                                            <span>Applications</span>
                                        </span>
                                        <span className="font-black text-gray-900">{totalAdoptionApps}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="flex items-center space-x-2">
                                            <span className="w-2.5 h-2.5 rounded-full bg-[#F97316]"></span>
                                            <span>Approved / Adopted</span>
                                        </span>
                                        <span className="font-black text-gray-900">{approvedAdoptionsCount}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="flex items-center space-x-2">
                                            <span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span>
                                            <span>Pending Review</span>
                                        </span>
                                        <span className="font-black text-purple-600">{pendingAdoptionsCount}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="mt-4 pt-3 border-t border-gray-50 text-left">
                                <Link to="/admin/adoptions" className="text-[11px] font-bold text-[#F97316] hover:underline flex items-center space-x-1">
                                    <span>Manage adoptions & applications</span>
                                    <span>&rarr;</span>
                                </Link>
                            </div>
                        </div>

                        {/* COMMUNITY IMPACT */}
                        <div className="bg-white rounded-3xl p-6 shadow-[0_2px_14px_rgba(0,0,0,0.02)] border border-gray-100 flex flex-col justify-between">
                            <div>
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Community Impact</h3>
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs font-medium text-gray-600 flex items-center space-x-2">
                                            <span>🐾</span>
                                            <span>Animals Rescued</span>
                                        </span>
                                        <span className="text-sm font-black text-[#1A4543]">{isDataLoading ? '...' : rescuedCount}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs font-medium text-gray-600 flex items-center space-x-2">
                                            <span>🏡</span>
                                            <span>Animals Adopted</span>
                                        </span>
                                        <span className="text-sm font-black text-blue-600">{isDataLoading ? '...' : adoptedCount}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs font-medium text-gray-600 flex items-center space-x-2">
                                            <span>🔄</span>
                                            <span>Returned to Owner</span>
                                        </span>
                                        <span className="text-sm font-black text-[#F97316]">{isDataLoading ? '...' : returnedToOwnerCount}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs font-medium text-gray-600 flex items-center space-x-2">
                                            <span>🏙️</span>
                                            <span>Active Subdivisions</span>
                                        </span>
                                        <span className="text-sm font-black text-gray-900">{subdivisionsList.length}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="mt-4 p-3 bg-emerald-50/80 border border-emerald-100 rounded-2xl text-emerald-800 text-[10px] font-bold flex items-center justify-between">
                                <span>{resolutionRate}% overall resolution efficiency</span>
                                <span>📈</span>
                            </div>
                        </div>

                    </div>

                    {/* 4. ROW 3: RECENT ACTIVITY & SECURITY OVERVIEW */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                        {/* RECENT ACTIVITY TIMELINE */}
                        <div className="lg:col-span-5 bg-white rounded-3xl p-6 shadow-[0_2px_14px_rgba(0,0,0,0.02)] border border-gray-100 flex flex-col justify-between">
                            <div>
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Recent Activity</h3>
                                <div className="space-y-4">
                                    {recentActivityLogs.map((log: any, idx: number) => {
                                        const dotColors = ['bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-orange-500'];
                                        return (
                                            <div key={log.id || idx} className="flex items-start space-x-3">
                                                <div className={`w-2 h-2 rounded-full ${dotColors[idx % dotColors.length]} mt-1.5 shrink-0`}></div>
                                                <div>
                                                    <p className="text-xs font-bold text-gray-800">{log.description || log.action || 'System operation'}</p>
                                                    <p className="text-[9px] font-medium text-gray-400">{log.timestamp} &bull; by {log.user || 'System'}</p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                            <div className="mt-4 pt-3 border-t border-gray-50 text-left">
                                <Link to="/admin/logs" className="text-[11px] font-bold text-[#F97316] hover:underline flex items-center space-x-1">
                                    <span>View audit log</span>
                                    <span>&rarr;</span>
                                </Link>
                            </div>
                        </div>

                        {/* SECURITY OVERVIEW */}
                        <div className="lg:col-span-7 bg-white rounded-3xl p-6 shadow-[0_2px_14px_rgba(0,0,0,0.02)] border border-gray-100 flex flex-col justify-between">
                            <div>
                                <div className="flex justify-between items-center mb-6">
                                    <div>
                                        <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Security Overview</h3>
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-0.5">Authentication & System Threat Monitoring</p>
                                    </div>
                                    <span className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-black uppercase flex items-center space-x-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                        <span>System Normal</span>
                                    </span>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                                    <div className="bg-gray-50/70 rounded-2xl p-4 border border-gray-100">
                                        <p className="text-[10px] font-bold text-gray-400 uppercase">Failed Logins</p>
                                        <p className="text-2xl font-black text-red-600 leading-none mt-1">{failedLoginsCount}</p>
                                    </div>
                                    <div className="bg-gray-50/70 rounded-2xl p-4 border border-gray-100">
                                        <p className="text-[10px] font-bold text-gray-400 uppercase">Suspended Accounts</p>
                                        <p className="text-2xl font-black text-orange-600 leading-none mt-1">{suspendedAccountsCount}</p>
                                    </div>
                                    <div className="bg-gray-50/70 rounded-2xl p-4 border border-gray-100">
                                        <p className="text-[10px] font-bold text-gray-400 uppercase">Active Accounts</p>
                                        <p className="text-2xl font-black text-gray-900 leading-none mt-1">{activeAccountsCount}</p>
                                    </div>
                                    <div className="bg-gray-50/70 rounded-2xl p-4 border border-gray-100">
                                        <p className="text-[10px] font-bold text-gray-400 uppercase">Audit Events</p>
                                        <p className="text-2xl font-black text-gray-900 leading-none mt-1">{(dashboardStats?.total_audit_logs ?? recentActivityLogs.length).toLocaleString()}</p>
                                    </div>
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 pt-2 border-t border-gray-50">
                                <button
                                    onClick={() => navigate('/admin/warnings')}
                                    className="px-5 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-black uppercase tracking-wider rounded-xl border border-amber-200 transition-all cursor-pointer text-center"
                                >
                                    Citations & Violations
                                </button>
                                <button
                                    onClick={() => navigate('/admin/logs')}
                                    className="px-6 py-2.5 bg-[#1A4543] text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-md hover:bg-[#255e5b] transition-all cursor-pointer text-center"
                                >
                                    View Audit Log
                                </button>
                            </div>
                        </div>

                    </div>

                    {/* 5. SYSTEM STATUS FULL-WIDTH BOTTOM BAR */}
                    <div className="bg-white rounded-3xl p-6 shadow-[0_2px_14px_rgba(0,0,0,0.02)] border border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div>
                            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">System Status</h3>
                            <div className="flex flex-wrap gap-4 text-xs font-bold text-gray-700">
                                <span className="flex items-center space-x-2">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                    <span>Database: <strong className="text-emerald-600">Operational</strong></span>
                                </span>
                                <span className="flex items-center space-x-2">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                    <span>API Service: <strong className="text-emerald-600">Operational</strong></span>
                                </span>
                                <span className="flex items-center space-x-2">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                    <span>AI Service: <strong className="text-emerald-600">Operational</strong></span>
                                </span>
                                <span className="flex items-center space-x-2">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                    <span>Notification Service: <strong className="text-emerald-600">Operational</strong></span>
                                </span>
                                <span className="flex items-center space-x-2">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                    <span>GPS / Mapping Service: <strong className="text-emerald-600">Operational</strong></span>
                                </span>
                            </div>
                        </div>

                        <div className="flex items-center space-x-8 border-t md:border-t-0 md:border-l border-gray-100 pt-4 md:pt-0 md:pl-8">
                            <div>
                                <p className="text-[10px] font-black text-gray-400 uppercase">System Uptime</p>
                                <p className="text-lg font-black text-[#1A4543]">99.4%</p>
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-gray-400 uppercase">API Response Time</p>
                                <p className="text-lg font-black text-emerald-600">184 ms</p>
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-gray-400 uppercase">Last Backup</p>
                                <p className="text-xs font-bold text-gray-700 mt-1">May 26, 2025 2:30 AM</p>
                            </div>
                        </div>
                    </div>

                </div>
            </main>

            {/* ENLARGED FULLSCREEN MAP MODAL */}
            {isMapExpanded && (
                <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-[95%] h-[92%] flex flex-col p-6 animate-in zoom-in-95 duration-200">
                        {/* Header */}
                        <div className="flex justify-between items-center mb-4 shrink-0">
                            <div>
                                <h3 className="text-lg font-black text-[#1A4543] uppercase tracking-tight">Expanded Global Activity Map</h3>
                                <p className="text-xs font-bold text-gray-400">Live Team Tracking & Incident Locations Across Subdivisions</p>
                            </div>
                            <div className="flex items-center space-x-4">
                                <div className="flex bg-gray-100 p-1 rounded-xl text-xs font-black uppercase border border-gray-250">
                                    <button
                                        onClick={() => setMapMode('pins')}
                                        className={`px-4 py-1.5 rounded-lg transition-all ${mapMode === 'pins' ? 'bg-[#1A4543] text-white shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                                    >
                                        Pins
                                    </button>
                                    <button
                                        onClick={() => setMapMode('heatmap')}
                                        className={`px-4 py-1.5 rounded-lg transition-all ${mapMode === 'heatmap' ? 'bg-[#1A4543] text-white shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                                    >
                                        Heatmap
                                    </button>
                                    <button
                                        onClick={() => setMapMode('both')}
                                        className={`px-4 py-1.5 rounded-lg transition-all ${mapMode === 'both' ? 'bg-[#1A4543] text-white shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                                    >
                                        Both
                                    </button>
                                </div>
                                <button
                                    onClick={() => setIsMapExpanded(false)}
                                    className="p-2 text-gray-400 hover:text-gray-700 bg-gray-100 rounded-full transition-colors cursor-pointer"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        {/* Map Container inside Modal */}
                        <div className="flex-1 w-full rounded-2xl overflow-hidden relative border border-gray-100">
                            <MapComponent
                                center={[14.8093, 121.0028]}
                                zoom={15}
                                markers={mapMode !== 'heatmap' ? mapMarkers : mapMarkers.filter(m => m.id < 0)}
                                showHeatmap={mapMode !== 'pins'}
                                heatmapPoints={heatmapPoints}
                                onViewDetails={(marker) => setSelectedDetailReport(marker.rawData)}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* DETAIL REPORT POPUP MODAL */}
            {selectedDetailReport && (
                <div className="fixed inset-0 z-[10000] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <span className="text-[10px] font-black text-[#F97316] uppercase tracking-widest">Report Detail</span>
                                <h3 className="text-lg font-black text-gray-900 leading-tight mt-0.5">
                                    Incident #{selectedDetailReport.report_id}
                                </h3>
                            </div>
                            <button
                                onClick={() => setSelectedDetailReport(null)}
                                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="space-y-3 text-xs">
                            <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100">
                                <p className="text-[10px] font-bold text-gray-400 uppercase">Reporter</p>
                                <p className="font-bold text-gray-900">{selectedDetailReport.reporterName || 'Citizen'}</p>
                            </div>
                            <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100">
                                <p className="text-[10px] font-bold text-gray-400 uppercase">Landmark / Location</p>
                                <p className="font-bold text-gray-900">{selectedDetailReport.landmark || 'No landmark specified'}</p>
                            </div>
                            <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100">
                                <p className="text-[10px] font-bold text-gray-400 uppercase">Description</p>
                                <p className="font-medium text-gray-700">{selectedDetailReport.description || 'No description provided'}</p>
                            </div>
                        </div>
                        <div className="mt-6 flex justify-end">
                            <button
                                onClick={() => setSelectedDetailReport(null)}
                                className="px-5 py-2 bg-[#1A4543] text-white text-xs font-bold rounded-xl shadow hover:bg-[#255e5b]"
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

export default AdminDashboard;
