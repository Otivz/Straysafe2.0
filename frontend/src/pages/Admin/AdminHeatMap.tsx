import { useState, useEffect, useMemo } from 'react';
import { api } from '../../utils/api';
import { getCachedData, setCachedData } from '../../utils/cache';
import AdminSidebar from '../../components/AdminSidebar';
import AdminNavbar from '../../components/Navbars/AdminNavbar';
import MapComponent from '../../components/MapComponent';
import { ADMIN_HQ, SELERA_DEFAULT_CENTER } from '../../utils/coverageArea';
import ReportDescription from '../../components/ReportDescription';
import { 
    Flame, 
    MapPin, 
    Calendar, 
    AlertTriangle, 
    BarChart3, 
    Layers, 
    X, 
    Filter, 
    RotateCcw, 
    Compass
} from 'lucide-react';

interface HotspotArea {
    name: string;
    count: number;
    risk: 'High' | 'Medium' | 'Low';
    trend: 'up' | 'down' | 'stable';
}

const isResolvedOrClosed = (statusId: number) => [3, 6, 9, 10, 11, 12, 14, 17, 18].includes(statusId);

// Strip the "Notes: ..." segment from pipe-delimited descriptions to keep marker titles concise
const stripNotes = (desc: string): string => {
    if (!desc) return desc;
    return desc
        .split('|')
        .filter(seg => !seg.trim().toLowerCase().startsWith('notes:'))
        .join('|')
        .trim();
};

const isReportResolved = (r: any, rescue: any) => {
    const reportStatusId = r.status_id || r.current_status_id || 1;
    return isResolvedOrClosed(reportStatusId) || (rescue && rescue.status_id === 6);
};

// Check if a report has not yet been claimed by a subdivision leader or touched by staff.
// "Untouched" = no subdivision leader has claimed it (assigned_leader_id is null)
//   AND the report is still in a non-terminal state.
const isUntouchedByStaff = (report: any, rescue: any) => {
    const statusId = report.status_id || report.current_status_id || 1;
    // Already resolved / closed — not untouched
    if (isResolvedOrClosed(statusId)) return false;
    // If a subdivision leader has claimed it, it's been "touched"
    if (report.assigned_leader_id) return false;
    // If a rescue team member has been assigned or rescue is progressing, it's been "touched"
    if (rescue && (rescue.staff_id || (rescue.status_id && rescue.status_id > 1))) return false;
    return true;
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

const getMarkerColor = (report: any, rescue: any) => {
    const statusId = report.status_id;
    // Resolved / Historical
    if (isResolvedOrClosed(statusId) || rescue?.status_id === 6) return 'gray';

    // Purple: In Holding Pen
    if (statusId === 7 || statusId === 8) return 'purple';

    // Blue: Team Dispatched
    if (statusId === 5 || rescue?.status_id === 4 || rescue?.status_id === 5 || rescue?.staff_id) return 'blue';

    // Orange: Verified / Forwarded
    if (statusId === 2 || statusId === 4 || statusId === 13) return 'orange';

    // Red: Unverified / High Risk / Untouched
    return 'red';
};

const AdminHeatMap = () => {
    const cachedReports = getCachedData<any[]>('admin_reports_list') || [];
    const [reports, setReports] = useState<any[]>(() => cachedReports);
    const [requests, setRequests] = useState<any[]>(() => getCachedData<any[]>('admin_rescue_requests') || []);
    const [loading, setLoading] = useState(() => cachedReports.length === 0);

    // Map & View Mode
    const [mapMode, setMapMode] = useState<'heatmap' | 'pinpoint'>('pinpoint');
    const [mapCenter, setMapCenter] = useState<[number, number]>(SELERA_DEFAULT_CENTER);
    const [mapZoom, setMapZoom] = useState<number>(16);

    // Filters
    const [datePreset, setDatePreset] = useState<'all' | '24h' | '7d' | '30d' | 'custom'>('7d');
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [untouchedOnly, setUntouchedOnly] = useState(false);
    const [includeResolved, setIncludeResolved] = useState(false);

    // Floating UI Panels
    const [showLegend, setShowLegend] = useState(true);
    const [showAnalyticsDrawer, setShowAnalyticsDrawer] = useState(false);
    const [showDateCustomModal, setShowDateCustomModal] = useState(false);

    // Modals & Navigation
    const [selectedReport, setSelectedReport] = useState<any>(null);
    const [selectedDetailReport, setSelectedDetailReport] = useState<any>(null);
    const [isNavigating, setIsNavigating] = useState(false);
    const [navSource, setNavSource] = useState<'hq' | 'brgy' | 'current'>('hq');
    const [userLocation, setUserLocation] = useState<[number, number] | null>(null);

    // Dynamic Hotspot Data computed from live database reports
    const hotspots: HotspotArea[] = useMemo(() => {
        if (!reports || reports.length === 0) return [];
        const countsByLandmark: Record<string, number> = {};
        reports.forEach((r: any) => {
            const loc = r.landmark || r.location_description || 'San Vicente';
            countsByLandmark[loc] = (countsByLandmark[loc] || 0) + 1;
        });
        return Object.entries(countsByLandmark)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name, count]) => ({
                name,
                count,
                risk: count >= 5 ? 'High' : count >= 2 ? 'Medium' : 'Low',
                trend: count > 3 ? 'up' : 'stable'
            }));
    }, [reports]);

    // Untouched by staff count
    const untouchedCount = useMemo(() => {
        return reports.filter((r: any) => {
            const associatedRescue = requests.find(req => req.report_id === r.report_id);
            return isUntouchedByStaff(r, associatedRescue);
        }).length;
    }, [reports, requests]);

    // Active cases count
    const activeCount = useMemo(() => {
        return reports.filter((r: any) => {
            const associatedRescue = requests.find(req => req.report_id === r.report_id);
            return !isReportResolved(r, associatedRescue);
        }).length;
    }, [reports, requests]);

    // Real hourly distribution computed from reports for analytics drawer
    const hourlyDistribution = useMemo(() => {
        const buckets = new Array(8).fill(0); // 3-hour blocks
        reports.forEach((r: any) => {
            if (!r.created_at) return;
            const hour = new Date(r.created_at).getHours();
            const bucketIdx = Math.min(7, Math.floor(hour / 3));
            buckets[bucketIdx] += 1;
        });
        const maxVal = Math.max(1, ...buckets);
        return buckets.map(count => ({
            count,
            percentage: Math.round((count / maxVal) * 100)
        }));
    }, [reports]);

    const fetchReports = async () => {
        try {
            if (!getCachedData('admin_reports_list')) {
                setLoading(true);
            }
            const [reportsRes, requestsRes] = await Promise.allSettled([
                api.get('/reports/'),
                api.get('/rescue-requests/')
            ]);
            if (reportsRes.status === 'fulfilled') {
                const data = reportsRes.value.data || [];
                setReports(data);
                setCachedData('admin_reports_list', data, 5 * 60 * 1000);
            }
            if (requestsRes.status === 'fulfilled') {
                const reqData = requestsRes.value.data || [];
                setRequests(reqData);
                setCachedData('admin_rescue_requests', reqData, 5 * 60 * 1000);
            }
        } catch (error) {
            console.error('Error fetching reports for heatmap:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReports();

        if ("geolocation" in navigator) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    setUserLocation([position.coords.latitude, position.coords.longitude]);
                },
                (error) => console.error("Initial location fetch failed:", error)
            );
        }
    }, []);

    useEffect(() => {
        if (isNavigating && navSource === 'current') {
            const watchId = navigator.geolocation.watchPosition(
                (position) => {
                    setUserLocation([position.coords.latitude, position.coords.longitude]);
                },
                (error) => {
                    console.error("Error watching location:", error);
                    setNavSource('hq');
                }
            );
            return () => navigator.geolocation.clearWatch(watchId);
        }
    }, [isNavigating, navSource]);

    // Filter reports based on Date, Category, Untouched, and Resolved status
    const { heatmapPoints, markers, filteredReportsCount } = useMemo(() => {
        if (!reports.length) {
            return { heatmapPoints: [] as [number, number, number][], markers: [] as any[], filteredReportsCount: 0 };
        }

        let filtered = [...reports];

        // 1. Date Filter
        const now = new Date();
        if (datePreset === '24h') {
            const limit = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            filtered = filtered.filter(r => new Date(r.created_at) >= limit);
        } else if (datePreset === '7d') {
            const limit = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            filtered = filtered.filter(r => new Date(r.created_at) >= limit);
        } else if (datePreset === '30d') {
            const limit = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            filtered = filtered.filter(r => new Date(r.created_at) >= limit);
        } else if (datePreset === 'custom') {
            if (customStartDate) {
                const start = new Date(customStartDate);
                start.setHours(0, 0, 0, 0);
                filtered = filtered.filter(r => new Date(r.created_at) >= start);
            }
            if (customEndDate) {
                const end = new Date(customEndDate);
                end.setHours(23, 59, 59, 999);
                filtered = filtered.filter(r => new Date(r.created_at) <= end);
            }
        }

        // 2. Category Filter
        if (categoryFilter !== 'all') {
            filtered = filtered.filter(r => r.category_id?.toString() === categoryFilter);
        }

        // 3. Untouched by Staff Filter
        if (untouchedOnly) {
            filtered = filtered.filter(r => {
                const associatedRescue = requests.find(req => req.report_id === r.report_id);
                return isUntouchedByStaff(r, associatedRescue);
            });
        }

        // 4. Resolved Filter
        filtered = filtered.filter(r => {
            if (!r.latitude || !r.longitude) return false;
            const associatedRescue = requests.find(req => req.report_id === r.report_id);
            const isResolved = isReportResolved(r, associatedRescue);
            return includeResolved || !isResolved;
        });

        // Heatmap Points
        const points = filtered.map((r: any) => [
            parseFloat(r.latitude.toString()),
            parseFloat(r.longitude.toString()),
            r.priority_level === 'High' || r.priority_level === 'Critical' ? 1.0 : 0.6
        ] as [number, number, number]);

        // Markers
        const marks = filtered.map((r: any) => {
            const date = new Date(r.created_at);
            const timeStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
            const associatedRescue = requests.find(req => req.report_id === r.report_id);
            const reportStatusId = r.status_id || r.current_status_id || 1;
            const normalizedReport = { ...r, status_id: reportStatusId };
            const isUntouched = isUntouchedByStaff(normalizedReport, associatedRescue);
            const color = getMarkerColor(normalizedReport, associatedRescue);
            const statusName = isUntouched ? '⚠️ Untouched (Awaiting Staff)' : (r.status?.status_name || getStatusName(reportStatusId));

            return {
                id: r.report_id,
                lat: parseFloat(r.latitude.toString()),
                lng: parseFloat(r.longitude.toString()),
                title: isUntouched ? `🚨 [UNTOUCHED] #${r.report_id}: ${stripNotes(r.description) || r.animal_type || 'Incident'}` : (stripNotes(r.description) || `Incident #${r.report_id}`),
                priority: r.priority_level || 'Medium',
                category: r.animal_type || 'Stray Animal',
                color: color,
                time: timeStr,
                rawData: {
                    ...normalizedReport,
                    statusName: statusName,
                    isUntouched: isUntouched,
                    reporterName: r.reporter_name || r.reporter?.name || "Citizen",
                    rescue: associatedRescue
                }
            };
        });

        // Add Command Center HQ Marker
        marks.push({
            id: -1,
            lat: ADMIN_HQ[0],
            lng: ADMIN_HQ[1],
            title: "Command Center HQ",
            priority: "Office",
            category: "HQ",
            time: "BASE"
        } as any);

        if (userLocation) {
            marks.push({
                id: -2,
                lat: userLocation[0],
                lng: userLocation[1],
                title: "Your Location",
                priority: "Me",
                category: "Operator",
                time: "LIVE"
            } as any);
        }

        return { heatmapPoints: points, markers: marks, filteredReportsCount: filtered.length };
    }, [reports, requests, datePreset, customStartDate, customEndDate, categoryFilter, untouchedOnly, includeResolved, userLocation]);

    const handleFlyToSelera = () => {
        setMapCenter([...SELERA_DEFAULT_CENTER]);
        setMapZoom(16);
    };

    const handleResetAllFilters = () => {
        setDatePreset('7d');
        setCustomStartDate('');
        setCustomEndDate('');
        setCategoryFilter('all');
        setUntouchedOnly(false);
        setIncludeResolved(false);
    };

    const isFiltersApplied = datePreset !== '7d' || categoryFilter !== 'all' || untouchedOnly || includeResolved;

    return (
        <div className="flex h-screen bg-[#0F172A] text-slate-200 overflow-hidden">
            <AdminSidebar />

            <div className="flex-1 flex flex-col h-screen relative">
                <AdminNavbar
                    leftContent={
                        <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                                <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none uppercase">Incident Heatmap</h1>
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-orange-50 text-[#F97316] border border-orange-200/80">
                                    {filteredReportsCount} {filteredReportsCount === 1 ? 'Incident' : 'Incidents'}
                                </span>
                            </div>
                            <p className="text-[9px] text-gray-400 font-extrabold uppercase tracking-wider mt-1.5 leading-none">Geospatial analysis and staff triage coverage</p>
                        </div>
                    }
                />

                <main className="flex-1 relative overflow-hidden flex flex-col">
                    {loading && (
                        <div className="absolute inset-0 z-[10000] bg-slate-900/60 backdrop-blur-md flex items-center justify-center">
                            <div className="flex flex-col items-center">
                                <div className="w-12 h-12 border-4 border-orange-500/20 border-t-orange-500 rounded-full animate-spin mb-4"></div>
                                <span className="text-[10px] font-black text-white uppercase tracking-[0.3em] animate-pulse">Syncing Geospatial Records</span>
                            </div>
                        </div>
                    )}

                    {/* ═══════════════════════════════════════════════════════════════════════
                        TOP CONTROL HUB: Unified, Non-Overlapping Toolbar
                        Leaves 64px on left so Leaflet Zoom buttons [+ / -] are completely free
                    ═══════════════════════════════════════════════════════════════════════ */}
                    <div className="absolute top-4 left-16 right-4 z-[500] pointer-events-auto">
                        <div className="bg-slate-900/95 backdrop-blur-xl border border-slate-800 rounded-2xl p-2.5 shadow-2xl flex flex-wrap items-center justify-between gap-2.5">
                            
                            {/* Left Group: Mode Switcher & Untouched Filter */}
                            <div className="flex items-center gap-2 flex-wrap">
                                {/* Heatmap vs Pinpoint Toggle */}
                                <div className="flex items-center bg-slate-800/90 p-1 rounded-xl border border-slate-700/80">
                                    <button
                                        type="button"
                                        onClick={() => setMapMode('pinpoint')}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10.5px] font-black uppercase tracking-wider transition-all ${
                                            mapMode === 'pinpoint'
                                                ? 'bg-[#F97316] text-white shadow-xs'
                                                : 'text-slate-400 hover:text-white'
                                        }`}
                                    >
                                        <MapPin className="w-3 h-3" />
                                        <span>Pinpoint</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setMapMode('heatmap')}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10.5px] font-black uppercase tracking-wider transition-all ${
                                            mapMode === 'heatmap'
                                                ? 'bg-[#F97316] text-white shadow-xs'
                                                : 'text-slate-400 hover:text-white'
                                        }`}
                                    >
                                        <Flame className="w-3 h-3" />
                                        <span>Heatmap</span>
                                    </button>
                                </div>

                                <div className="h-5 w-px bg-slate-800 hidden sm:block" />

                                {/* ⚡ Untouched by Staff Quick Filter */}
                                <button
                                    type="button"
                                    onClick={() => setUntouchedOnly(prev => !prev)}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-[11px] font-black uppercase tracking-wider transition-all ${
                                        untouchedOnly
                                            ? 'bg-rose-500/20 border-rose-500 text-rose-300 ring-2 ring-rose-500/30 shadow-lg shadow-rose-950/40'
                                            : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:border-slate-600 hover:text-white'
                                    }`}
                                    title="Show only newly submitted reports awaiting staff review"
                                >
                                    <span className={`w-2 h-2 rounded-full ${untouchedOnly ? 'bg-rose-500 animate-ping' : 'bg-rose-400'}`} />
                                    <span>Untouched by Staff</span>
                                    <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-black ${
                                        untouchedOnly ? 'bg-rose-500 text-white' : 'bg-slate-700 text-rose-300'
                                    }`}>
                                        {untouchedCount}
                                    </span>
                                </button>
                            </div>

                            {/* Center Group: Date Filter & Category Filter */}
                            <div className="flex items-center gap-2 flex-wrap">
                                {/* Date Filter Dropdown */}
                                <div className="flex items-center gap-1.5 bg-slate-800/90 border border-slate-700/80 px-2.5 py-1 rounded-xl">
                                    <Calendar className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Date:</span>
                                    <select
                                        value={datePreset}
                                        onChange={(e) => {
                                            const val = e.target.value as any;
                                            setDatePreset(val);
                                            if (val === 'custom') setShowDateCustomModal(true);
                                        }}
                                        className="bg-transparent text-white font-bold text-xs outline-none cursor-pointer pr-1"
                                    >
                                        <option value="24h" className="bg-slate-900 text-white">Today (24h)</option>
                                        <option value="7d" className="bg-slate-900 text-white">Past 7 Days</option>
                                        <option value="30d" className="bg-slate-900 text-white">Past 30 Days</option>
                                        <option value="all" className="bg-slate-900 text-white">All Time</option>
                                        <option value="custom" className="bg-slate-900 text-white">Custom Range...</option>
                                    </select>
                                    {datePreset === 'custom' && (
                                        <button
                                            type="button"
                                            onClick={() => setShowDateCustomModal(true)}
                                            className="ml-1 text-[10px] text-orange-400 hover:text-orange-300 underline font-black"
                                        >
                                            Edit
                                        </button>
                                    )}
                                </div>

                                {/* Category Dropdown */}
                                <div className="flex items-center gap-1.5 bg-slate-800/90 border border-slate-700/80 px-2.5 py-1 rounded-xl">
                                    <Filter className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Category:</span>
                                    <select
                                        value={categoryFilter}
                                        onChange={(e) => setCategoryFilter(e.target.value)}
                                        className="bg-transparent text-white font-bold text-xs outline-none cursor-pointer pr-1"
                                    >
                                        <option value="all" className="bg-slate-900 text-white">All Activity</option>
                                        <option value="1" className="bg-slate-900 text-white">Injured Animals</option>
                                        <option value="2" className="bg-slate-900 text-white">Aggressive Strays</option>
                                        <option value="3" className="bg-slate-900 text-white">Rabies Risks</option>
                                        <option value="4" className="bg-slate-900 text-white">Roaming Packs</option>
                                        <option value="5" className="bg-slate-900 text-white">Animal Rescues</option>
                                        <option value="6" className="bg-slate-900 text-white">Lost Pets</option>
                                    </select>
                                </div>

                                {/* Status Scope: Active vs Include Resolved */}
                                <button
                                    type="button"
                                    onClick={() => setIncludeResolved(prev => !prev)}
                                    className={`px-3 py-1.5 rounded-xl border text-[10.5px] font-black uppercase tracking-wider transition-all ${
                                        includeResolved
                                            ? 'bg-slate-800 text-orange-400 border-orange-500/50 ring-1 ring-orange-500/30'
                                            : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:text-slate-200'
                                    }`}
                                    title="Toggle resolved and historical reports"
                                >
                                    {includeResolved ? 'Inc. Resolved' : 'Active Only'}
                                </button>
                            </div>

                            {/* Right Group: Selera Quick Center, Legend Toggle & Analytics */}
                            <div className="flex items-center gap-2">
                                {/* Reset Filters Button */}
                                {isFiltersApplied && (
                                    <button
                                        type="button"
                                        onClick={handleResetAllFilters}
                                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 text-[10.5px] font-black border border-rose-500/20 transition-all"
                                        title="Reset all active filters"
                                    >
                                        <RotateCcw className="w-3 h-3" />
                                        <span>Reset</span>
                                    </button>
                                )}

                                {/* Selera Homes Center Button */}
                                <button
                                    type="button"
                                    onClick={handleFlyToSelera}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-600/90 text-white hover:bg-orange-500 text-[10.5px] font-black uppercase tracking-wider shadow-xs transition-all"
                                    title="Center Map on Selera Homes Subdivision"
                                >
                                    <Compass className="w-3.5 h-3.5" />
                                    <span>Selera Homes</span>
                                </button>

                                {/* Legend Toggle Button */}
                                <button
                                    type="button"
                                    onClick={() => setShowLegend(prev => !prev)}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[10.5px] font-black uppercase tracking-wider transition-all ${
                                        showLegend
                                            ? 'bg-slate-800 border-orange-500/50 text-orange-400'
                                            : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200'
                                    }`}
                                    title="Toggle marker color legend"
                                >
                                    <Layers className="w-3.5 h-3.5" />
                                    <span>Legend</span>
                                </button>

                                {/* Hotspots Drawer Toggle Button */}
                                <button
                                    type="button"
                                    onClick={() => setShowAnalyticsDrawer(prev => !prev)}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[10.5px] font-black uppercase tracking-wider transition-all ${
                                        showAnalyticsDrawer
                                            ? 'bg-slate-800 border-orange-500/50 text-orange-400'
                                            : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200'
                                    }`}
                                    title="Open Hotspot Analysis & Temporal Flow"
                                >
                                    <BarChart3 className="w-3.5 h-3.5" />
                                    <span>Hotspots</span>
                                    <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                                </button>
                            </div>
                        </div>

                        {/* Active Filter Summary Bar (Only when filters active) */}
                        {isFiltersApplied && (
                            <div className="mt-2 flex items-center justify-between bg-slate-900/85 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-slate-800 text-[10px] font-semibold text-slate-400">
                                <div className="flex items-center gap-2">
                                    <span className="text-orange-400 font-black uppercase tracking-wider">Filtered View:</span>
                                    {untouchedOnly && <span className="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30">Untouched Only</span>}
                                    {datePreset !== 'all' && (
                                        <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 font-bold">
                                            {datePreset === '24h' ? 'Past 24 Hours' : datePreset === '7d' ? 'Past 7 Days' : datePreset === '30d' ? 'Past 30 Days' : `${customStartDate || 'Start'} to ${customEndDate || 'End'}`}
                                        </span>
                                    )}
                                    {categoryFilter !== 'all' && (
                                        <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 font-bold">Category #{categoryFilter}</span>
                                    )}
                                    {includeResolved && (
                                        <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 font-bold">Including Resolved</span>
                                    )}
                                </div>
                                <span className="font-mono text-slate-300 font-black">{filteredReportsCount} matching pins</span>
                            </div>
                        )}
                    </div>

                    {/* ═══════════════════════════════════════════════════════════════════════
                        BOTTOM-LEFT: Collapsible Marker Legend (Positioned with zero collision)
                    ═══════════════════════════════════════════════════════════════════════ */}
                    {showLegend && (
                        <div className="absolute bottom-6 left-6 z-[500] bg-slate-900/95 backdrop-blur-xl border border-slate-800 p-4 rounded-2xl shadow-2xl max-w-[270px] animate-in fade-in duration-200">
                            <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-2">
                                <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></span>
                                    <span className="text-[10px] font-black text-white uppercase tracking-wider">Marker Legend</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowLegend(false)}
                                    className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors"
                                    title="Minimize Legend"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>

                            <div className="space-y-2 text-[10.5px] font-bold text-slate-300">
                                <div className="flex items-center gap-2.5">
                                    <span className="w-3 h-3 rounded-full bg-red-600 shadow-[0_0_8px_rgba(239,68,68,0.8)] shrink-0 border border-red-400 animate-pulse"></span>
                                    <span className="truncate">🔴 Red: Untouched / High Risk</span>
                                </div>
                                <div className="flex items-center gap-2.5">
                                    <span className="w-3 h-3 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.6)] shrink-0 border border-orange-400"></span>
                                    <span className="truncate">🟠 Orange: Verified / Forwarded</span>
                                </div>
                                <div className="flex items-center gap-2.5">
                                    <span className="w-3 h-3 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)] shrink-0 border border-blue-400"></span>
                                    <span className="truncate">🔵 Blue: Team Dispatched</span>
                                </div>
                                <div className="flex items-center gap-2.5">
                                    <span className="w-3 h-3 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(139,92,246,0.6)] shrink-0 border border-purple-400"></span>
                                    <span className="truncate">🟣 Purple: In Holding Pen</span>
                                </div>
                                <div className={`flex items-center justify-between gap-2.5 transition-all ${includeResolved ? 'opacity-100' : 'opacity-40'}`}>
                                    <div className="flex items-center gap-2.5 truncate">
                                        <span className="w-3 h-3 rounded-full bg-slate-500 shadow-[0_0_6px_rgba(100,116,139,0.4)] shrink-0 border border-slate-400"></span>
                                        <span className="truncate">⚪ Gray: Resolved / Closed</span>
                                    </div>
                                    {!includeResolved && <span className="text-[8px] font-black uppercase text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">Off</span>}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ═══════════════════════════════════════════════════════════════════════
                        RIGHT SLIDE-OVER DRAWER: Hotspots & Real Intelligence Analytics
                        (Replaces the dummy centered temporal flow that blocked the map)
                    ═══════════════════════════════════════════════════════════════════════ */}
                    {showAnalyticsDrawer && (
                        <div className="absolute top-20 right-4 bottom-6 z-[600] w-84 sm:w-96 bg-slate-900/98 backdrop-blur-2xl border border-slate-800 rounded-3xl shadow-3xl p-6 flex flex-col justify-between overflow-y-auto animate-in slide-in-from-right duration-300">
                            <div>
                                <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
                                    <div className="flex items-center gap-2">
                                        <BarChart3 className="w-4 h-4 text-orange-400" />
                                        <h3 className="text-xs font-black text-white uppercase tracking-wider">Geospatial Intelligence</h3>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setShowAnalyticsDrawer(false)}
                                        className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>

                                {/* Summary Stats Grid */}
                                <div className="grid grid-cols-2 gap-2.5 mb-5">
                                    <div className="bg-slate-800/60 border border-slate-700/60 p-3 rounded-2xl">
                                        <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider block">Untouched Cases</span>
                                        <span className="text-xl font-black text-rose-400 font-mono mt-0.5 block">{untouchedCount}</span>
                                        <span className="text-[8.5px] font-bold text-slate-500 mt-1 block">Awaiting initial triage</span>
                                    </div>
                                    <div className="bg-slate-800/60 border border-slate-700/60 p-3 rounded-2xl">
                                        <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider block">Active Incidents</span>
                                        <span className="text-xl font-black text-orange-400 font-mono mt-0.5 block">{activeCount}</span>
                                        <span className="text-[8.5px] font-bold text-slate-500 mt-1 block">Ongoing in area</span>
                                    </div>
                                </div>

                                {/* Hotspot Neighborhoods */}
                                <div className="mb-5">
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Incident Hotspots</span>
                                        <span className="text-[9px] font-black text-orange-400 uppercase">Top 5 Landmarks</span>
                                    </div>
                                    <div className="space-y-2">
                                        {hotspots.length === 0 ? (
                                            <p className="text-xs font-semibold text-slate-500 py-3 text-center">No hotspot clusters detected.</p>
                                        ) : (
                                            hotspots.map((spot, idx) => (
                                                <div key={idx} className="bg-slate-800/40 border border-slate-700/40 p-3 rounded-xl flex items-center justify-between">
                                                    <div className="min-w-0 pr-2">
                                                        <span className="text-xs font-black text-white truncate block">{spot.name}</span>
                                                        <span className="text-[9px] font-bold text-slate-400">{spot.count} recorded cases</span>
                                                    </div>
                                                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded shrink-0 ${
                                                        spot.risk === 'High' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                                                    }`}>
                                                        {spot.risk} Risk
                                                    </span>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>

                                {/* Real Temporal Flow Distribution */}
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Temporal Peak Flow</span>
                                        <span className="text-[9px] font-black text-emerald-400 uppercase">Live Database</span>
                                    </div>
                                    <div className="bg-slate-800/40 border border-slate-700/40 p-4 rounded-2xl">
                                        <div className="flex items-end gap-1.5 h-12 mb-2">
                                            {hourlyDistribution.map((item, i) => (
                                                <div
                                                    key={i}
                                                    className="flex-1 bg-orange-600/80 hover:bg-orange-500 rounded-t-sm transition-all duration-300 relative group cursor-pointer"
                                                    style={{ height: `${Math.max(12, item.percentage)}%` }}
                                                    title={`${i * 3}:00 - ${i * 3 + 3}:00 : ${item.count} reports`}
                                                >
                                                    <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-900 border border-slate-700 text-white text-[9px] font-mono font-bold px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                                                        {item.count} reports
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="flex justify-between text-[8px] font-mono font-bold text-slate-500 uppercase">
                                            <span>00:00</span>
                                            <span>06:00</span>
                                            <span>12:00</span>
                                            <span>18:00</span>
                                            <span>23:59</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={() => setShowAnalyticsDrawer(false)}
                                className="w-full mt-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white font-black text-xs uppercase tracking-wider transition-colors border border-slate-700"
                            >
                                Close Intelligence Panel
                            </button>
                        </div>
                    )}

                    {/* ═══════════════════════════════════════════════════════════════════════
                        CUSTOM DATE RANGE MODAL
                    ═══════════════════════════════════════════════════════════════════════ */}
                    {showDateCustomModal && (
                        <div className="fixed inset-0 z-[10001] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200">
                                <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-800">
                                    <div className="flex items-center gap-2">
                                        <Calendar className="w-4 h-4 text-orange-400" />
                                        <h3 className="text-sm font-black text-white uppercase tracking-wider">Custom Date Range</h3>
                                    </div>
                                    <button onClick={() => setShowDateCustomModal(false)} className="text-slate-400 hover:text-white p-1">
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                                <div className="space-y-4 text-xs font-bold text-slate-300">
                                    <div>
                                        <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1">Start Date</label>
                                        <input
                                            type="date"
                                            value={customStartDate}
                                            onChange={(e) => setCustomStartDate(e.target.value)}
                                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-orange-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1">End Date</label>
                                        <input
                                            type="date"
                                            value={customEndDate}
                                            onChange={(e) => setCustomEndDate(e.target.value)}
                                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-orange-500"
                                        />
                                    </div>
                                </div>
                                <div className="flex gap-2 mt-6">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setCustomStartDate('');
                                            setCustomEndDate('');
                                            setDatePreset('7d');
                                            setShowDateCustomModal(false);
                                        }}
                                        className="flex-1 py-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white font-black text-xs uppercase tracking-wider"
                                    >
                                        Clear
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setShowDateCustomModal(false)}
                                        className="flex-1 py-2 rounded-xl bg-orange-600 text-white hover:bg-orange-500 font-black text-xs uppercase tracking-wider"
                                    >
                                        Apply Filter
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ═══════════════════════════════════════════════════════════════════════
                        MAP COMPONENT: showReturnToSelera={false} to prevent overlapping collisions
                    ═══════════════════════════════════════════════════════════════════════ */}
                    <div className="w-full h-full">
                        <MapComponent
                            center={mapCenter}
                            zoom={mapZoom}
                            showReturnToSelera={false}
                            heatmapPoints={heatmapPoints}
                            markers={mapMode === 'pinpoint' ? markers : markers.filter(m => m.id === -1)}
                            showHeatmap={mapMode === 'heatmap'}
                            routing={isNavigating && selectedReport ? {
                                start: (navSource === 'hq' || navSource === 'brgy') ? ADMIN_HQ : (userLocation || ADMIN_HQ),
                                end: [parseFloat(selectedReport.latitude || selectedReport.lat), parseFloat(selectedReport.longitude || selectedReport.lng)],
                                waypointNames: [(navSource === 'hq' || navSource === 'brgy') ? "Command Center HQ" : "Your Location", selectedReport.landmark || selectedReport.title],
                                onClose: () => setIsNavigating(false)
                            } : undefined}
                            onMarkerClick={(m) => {
                                if (m.id === -1 || m.id === -2) {
                                    setSelectedReport(null);
                                    setIsNavigating(false);
                                } else {
                                    const fullReport = reports.find(r => r.report_id.toString() === m.id.toString()) || m.rawData;
                                    if (fullReport) {
                                        setSelectedReport(fullReport);
                                    }
                                }
                            }}
                            onDirectionsClick={(m) => {
                                const fullReport = reports.find(r => r.report_id.toString() === m.id.toString()) || m.rawData || m;
                                if (fullReport) {
                                    setSelectedReport(fullReport);
                                    setNavSource('current');
                                    setIsNavigating(true);
                                }
                            }}
                            onViewDetails={(marker) => setSelectedDetailReport(marker.rawData)}
                        />
                    </div>
                </main>
            </div>

            {/* ═══════════════════════════════════════════════════════════════════════
                REPORT DETAILS MODAL: Full breakdown with Untouched Staff Status
            ═══════════════════════════════════════════════════════════════════════ */}
            {selectedDetailReport && (
                <div className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col p-6 animate-in zoom-in-95 duration-200">
                        {/* Header */}
                        <div className="flex justify-between items-center border-b border-gray-100 pb-4 mb-4 shrink-0">
                            <div>
                                <div className="flex items-center gap-2">
                                    <h3 className="text-base font-black text-gray-900 uppercase">Incident Report</h3>
                                    {selectedDetailReport.isUntouched && (
                                        <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 border border-rose-200 text-[9px] font-black uppercase tracking-wider animate-pulse">
                                            Awaiting Staff
                                        </span>
                                    )}
                                </div>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Case ID: #{selectedDetailReport.report_id}</p>
                            </div>
                            <button
                                onClick={() => setSelectedDetailReport(null)}
                                className="p-1.5 hover:bg-gray-150 rounded-full transition-colors text-gray-400 hover:text-gray-700"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-thin">
                            {/* Staff Attention Banner */}
                            {selectedDetailReport.isUntouched && (
                                <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3 flex items-start gap-3">
                                    <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                                    <div>
                                        <span className="text-xs font-black text-rose-900 block uppercase">Not Yet Handled by Staff</span>
                                        <p className="text-[11px] text-rose-700 font-medium mt-0.5 leading-relaxed">
                                            This incident has not been verified or assigned to any field officer. Prompt triage is recommended.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Media Image */}
                            {selectedDetailReport.media && selectedDetailReport.media.length > 0 ? (
                                <img
                                    src={selectedDetailReport.media[0].file_url || selectedDetailReport.media[0].url}
                                    alt="Incident Report"
                                    className="w-full h-44 object-cover rounded-2xl border border-gray-100 shadow-sm"
                                />
                            ) : (
                                <div className="w-full h-24 bg-gray-50 border border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center text-gray-400 text-xs">
                                    <span>🐾 No photo uploaded for this report</span>
                                </div>
                            )}

                            {/* Details Grid */}
                            <div className="grid grid-cols-2 gap-4 text-xs text-gray-700">
                                <div>
                                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Animal Species / Breed</span>
                                    <span className="font-semibold text-gray-850">{selectedDetailReport.animal_type || 'Unknown'} {selectedDetailReport.animal_breed ? `(${selectedDetailReport.animal_breed})` : ''}</span>
                                </div>
                                <div>
                                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Priority Level</span>
                                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider mt-0.5 ${
                                        selectedDetailReport.priority_level === 'High' || selectedDetailReport.priority_level === 'Critical' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'
                                    }`}>{selectedDetailReport.priority_level || 'Medium'}</span>
                                </div>
                                <div>
                                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Health Condition</span>
                                    <span className="font-semibold text-gray-850">{selectedDetailReport.condition || 'No specific condition listed'}</span>
                                </div>
                                <div>
                                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Staff Status</span>
                                    <span className="font-semibold text-gray-850">{selectedDetailReport.statusName || 'Active'}</span>
                                </div>
                                <div>
                                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Reporter Details</span>
                                    <span className="font-semibold text-gray-850">{selectedDetailReport.reporterName || selectedDetailReport.reporter?.name || 'Citizen'}</span>
                                </div>
                                <div>
                                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Date Reported</span>
                                    <span className="font-semibold text-gray-850">{selectedDetailReport.created_at ? new Date(selectedDetailReport.created_at).toLocaleString() : 'N/A'}</span>
                                </div>
                                <div className="col-span-2">
                                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Report Location / Landmark</span>
                                    <span className="font-semibold text-gray-850">{selectedDetailReport.landmark || selectedDetailReport.location_description || 'Selera Homes'}</span>
                                </div>
                            </div>

                            {/* Description */}
                            <div className="text-xs border-t border-gray-100 pt-3">
                                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Incident Description</span>
                                <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-100">
                                    <ReportDescription description={selectedDetailReport.description} emptyText="No description was written for this incident report." />
                                </div>
                            </div>

                            {/* Rescue Assignment Details */}
                            <div className="text-xs border-t border-gray-100 pt-3">
                                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Rescue Dispatch Status</span>
                                {selectedDetailReport.rescue ? (
                                    <div className="bg-orange-50/50 border border-orange-100 rounded-xl p-3 flex flex-col gap-1.5">
                                        <div className="flex justify-between items-center">
                                            <span className="font-bold text-orange-900">Rescue Case #{selectedDetailReport.rescue.rescue_id}</span>
                                            <span className="px-2 py-0.5 bg-orange-100 text-orange-800 rounded font-bold text-[9px] uppercase">
                                                Active Rescue
                                            </span>
                                        </div>
                                        <div className="text-[11px] text-orange-850">
                                            <p><span className="font-semibold text-orange-950">Assigned Rescuer:</span> {selectedDetailReport.rescue.assigned_staff_name || 'Pending dispatch assignment'}</p>
                                            {selectedDetailReport.rescue.notes && <p className="mt-1 italic">Notes: "{selectedDetailReport.rescue.notes}"</p>}
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-gray-400 italic">No rescue operations have been dispatched for this report.</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminHeatMap;
