import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import MapComponent from '../../components/MapComponent';
import SubdSidebar from '../../components/SubdSidebar';
import SubdNavbar from '../../components/Navbars/SubdNavbar';

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

interface ActivityItem {
    id: number;
    text: string;
    sub: string;
    icon: 'report' | 'rescue' | 'verified';
}

const categoryMap: Record<number, string> = {
    1: 'Injured Animal', 2: 'Aggressive Stray', 3: 'Possible Rabies Risk',
    4: 'Roaming Pack', 5: 'Animal Rescue Needed', 6: 'Lost Pet'
};

function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins} minute${mins > 1 ? 's' : ''} ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} hour${hrs > 1 ? 's' : ''} ago`;
    const days = Math.floor(hrs / 24);
    return `${days} day${days > 1 ? 's' : ''} ago`;
}

const SubdDashboard = () => {
    const navigate = useNavigate();

    const [reports, setReports] = useState<Report[]>([]);
    const [rescues, setRescues] = useState<RescueRequest[]>([]);
    const [petCount, setPetCount] = useState<number>(0);
    const [loading, setLoading] = useState(true);
    const [mapMode, setMapMode] = useState<'pins' | 'heatmap' | 'both'>('both');
    const [isMapExpanded, setIsMapExpanded] = useState(false);
    const [selectedDetailReport, setSelectedDetailReport] = useState<any>(null);
    const [selectedReport, setSelectedReport] = useState<any>(null);
    const [isNavigating, setIsNavigating] = useState(false);
    const [navSource, setNavSource] = useState<'hq' | 'brgy' | 'current'>('hq');
    const [userLocation, setUserLocation] = useState<[number, number] | null>(null);

    useEffect(() => {
        const rawUser = localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user');
        if (rawUser) {
            try {
                const user = JSON.parse(rawUser);
                if (user.role_id !== 2) navigate('/staff/login');
            } catch {
                navigate('/staff/login');
            }
        } else {
            navigate('/staff/login');
        }
    }, [navigate]);

    useEffect(() => {
        const fetchAll = async () => {
            setLoading(true);
            try {
                const [reportsRes, rescuesRes, petsRes] = await Promise.allSettled([
                    axios.get('http://localhost:8000/reports/'),
                    axios.get('http://localhost:8000/rescue-requests/'),
                    axios.get('http://localhost:8000/pets/'),
                ]);
                if (reportsRes.status === 'fulfilled') setReports(reportsRes.value.data || []);
                if (rescuesRes.status === 'fulfilled') setRescues(rescuesRes.value.data || []);
                if (petsRes.status === 'fulfilled') setPetCount((petsRes.value.data || []).length);
            } catch (err) {
                console.error('Dashboard fetch error:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchAll();
    }, []);

    useEffect(() => {
        if (isNavigating && navSource === 'current') {
            if ("geolocation" in navigator) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        setUserLocation([position.coords.latitude, position.coords.longitude]);
                    },
                    (error) => {
                        console.error("Error getting location:", error);
                        setNavSource('hq');
                    }
                );
            }
        }
    }, [isNavigating, navSource]);

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

    // Derived stats
    const pendingCount = reports.filter(r => r.status_id === 1).length;
    const verifiedCount = reports.filter(r => r.status_id === 2 || r.status_id === 13).length;
    const activeRescueCount = rescues.filter(r => r.status_id >= 1 && r.status_id <= 5).length;

    const ADMIN_HQ: [number, number] = [14.806906, 121.0039297];

    const activeReports = reports.filter(r => [1, 2, 4, 5, 7, 8, 9, 13].includes(r.status_id));
    const assignedReportsCount = rescues.filter(req => req.staff_id && [1, 2, 4, 5].includes(req.status_id)).length;
    const inProgressReportsCount = rescues.filter(req => req.status_id === 4).length;
    const pickedUpReportsCount = reports.filter(r => [7, 8, 9].includes(r.status_id)).length;
    const resolvedReportsCount = reports.filter(r => [6, 11].includes(r.status_id)).length;

    // Trend chart: last 7 days
    const trendData = (() => {
        const days: { label: string; count: number }[] = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const label = d.toLocaleDateString('en-US', { weekday: 'short' });
            const dateStr = d.toISOString().slice(0, 10);
            const count = reports.filter(r => r.created_at?.slice(0, 10) === dateStr).length;
            days.push({ label, count });
        }
        return days;
    })();

    const maxTrend = Math.max(...trendData.map(d => d.count), 1);

    // Recent activity: last 5 reports sorted by date
    const recentReports = [...reports]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 5);

    const recentActivity: ActivityItem[] = recentReports.map(r => ({
        id: r.report_id,
        text: `#${r.report_id.toString().padStart(4, '0')} — ${categoryMap[r.category_id] || 'Incident'} ${r.landmark ? `at ${r.landmark}` : ''}`,
        sub: timeAgo(r.created_at),
        icon: r.status_id === 2 ? 'verified' : r.status_id >= 5 ? 'rescue' : 'report',
    }));

    const iconMap = {
        report: (
            <svg className="h-4 w-4 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 3a9 9 0 100 18A9 9 0 0012 3z" />
            </svg>
        ),
        verified: (
            <svg className="h-4 w-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
        ),
        rescue: (
            <svg className="h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 110 20A10 10 0 0112 2z" />
            </svg>
        ),
    };

    const statCards = [
        {
            label: 'Pending Reports',
            value: pendingCount,
            icon: (
                <svg className="h-5 w-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            ),
            bg: 'bg-amber-50',
            border: 'border-amber-100',
            textColor: 'text-amber-600',
        },
        {
            label: 'Verified Reports',
            value: verifiedCount,
            icon: (
                <svg className="h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            ),
            bg: 'bg-blue-50',
            border: 'border-blue-100',
            textColor: 'text-blue-600',
        },
        {
            label: 'Active Rescue',
            value: activeRescueCount,
            icon: (
                <svg className="h-5 w-5 text-[#F97316]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
            ),
            bg: 'bg-orange-50',
            border: 'border-orange-100',
            textColor: 'text-[#F97316]',
        },
        {
            label: 'Registered Pets',
            value: petCount,
            icon: (
                <svg className="h-5 w-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
            ),
            bg: 'bg-green-50',
            border: 'border-green-100',
            textColor: 'text-green-600',
        },
    ];

    const heatmapPoints: [number, number, number][] = reports
        .filter(r => r.latitude && r.longitude)
        .map((r: any) => [
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
        ...activeReports
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
                        reporterName: r.reporter_name || r.reporter?.name || "Citizen",
                        rescue: associatedRescue
                    }
                };
            })
    ];

    return (
        <div className="min-h-screen w-full flex bg-[#F8F9FA] font-sans text-gray-800">
            <SubdSidebar />

            <main className="flex-1 flex flex-col h-screen overflow-hidden">
                <SubdNavbar
                    leftContent={
                        <div className="flex flex-col">
                            <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none uppercase">Subdivision Dashboard</h1>
                            <p className="text-[9px] text-gray-400 font-extrabold uppercase tracking-wider mt-1.5 leading-none">Overview of reports, rescue operations, and registered pets</p>
                        </div>
                    }
                />

                <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-8 custom-scrollbar bg-[#FAFAF9]">
                    <div className="flex flex-col gap-8">

                        {/* Stat Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                            {statCards.map((card) => (
                                <div key={card.label} className={`bg-white rounded-2xl p-5 border ${card.border} shadow-sm flex items-center gap-4`}>
                                    <div className={`w-10 h-10 rounded-xl ${card.bg} flex items-center justify-center shrink-0`}>
                                        {card.icon}
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{card.label}</p>
                                        {loading ? (
                                            <div className="h-7 w-12 bg-gray-100 rounded-lg animate-pulse mt-1" />
                                        ) : (
                                            <p className={`text-3xl font-black ${card.textColor} mt-0.5`}>{card.value}</p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Trend Chart */}
                        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
                            <h3 className="text-lg font-bold text-gray-900 mb-6">Incident Report Trend — Last 7 Days</h3>
                            {loading ? (
                                <div className="h-48 bg-gray-50 rounded-2xl animate-pulse" />
                            ) : (
                                <div className="flex items-end gap-3 h-48">
                                    {trendData.map((day, i) => {
                                        const heightPct = maxTrend > 0 ? (day.count / maxTrend) * 100 : 0;
                                        return (
                                            <div key={i} className="flex-1 flex flex-col items-center gap-2">
                                                <span className="text-xs font-bold text-gray-500">{day.count > 0 ? day.count : ''}</span>
                                                <div className="w-full rounded-xl bg-gray-100 overflow-hidden" style={{ height: '140px' }}>
                                                    <div
                                                        className="w-full rounded-xl transition-all duration-700"
                                                        style={{
                                                            height: `${Math.max(heightPct, day.count > 0 ? 4 : 0)}%`,
                                                            background: i === trendData.length - 1
                                                                ? 'linear-gradient(to top, #F97316, #fb923c)'
                                                                : 'linear-gradient(to top, #fdba74, #fed7aa)',
                                                            marginTop: 'auto',
                                                            display: 'block',
                                                            position: 'relative',
                                                            top: `${100 - Math.max(heightPct, day.count > 0 ? 4 : 0)}%`
                                                        }}
                                                    />
                                                </div>
                                                <span className="text-[10px] font-bold text-gray-400 uppercase">{day.label}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Map + Recent Activity side by side */}
                        <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
                            {/* Map */}
                            <div className="xl:col-span-3 bg-white rounded-3xl p-6 border border-gray-100 shadow-sm flex flex-col">
                                <div className="flex justify-between items-center mb-4 shrink-0">
                                    <h3 className="text-lg font-bold text-gray-900">Incident Intelligence Map</h3>
                                    <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto justify-end">
                                        {/* Map Mode Toggles */}
                                        <div className="flex bg-gray-100 p-1 rounded-xl text-[9px] font-black uppercase border border-gray-255">
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

                                        {/* Fullscreen Expand Button */}
                                        <button
                                            onClick={() => setIsMapExpanded(true)}
                                            className="px-3.5 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-xl text-[10px] font-bold border border-gray-200 transition-all flex items-center gap-1.5 shadow-sm"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h3a1 1 0 010 2H5v2a1 1 0 01-2 0V4zm14 0a1 1 0 00-1-1h-3a1 1 0 110 2h2v2a1 1 0 112 0V4zM3 16a1 1 0 001 1h3a1 1 0 100-2H5v-2a1 1 0 10-2 0v3zm14 0a1 1 0 01-1 1h-3a1 1 0 100-2h2v-2a1 1 0 102 0v3z" />
                                            </svg>
                                            Expand Map
                                        </button>
                                    </div>
                                </div>
                                <div className="w-full h-[380px] rounded-2xl overflow-hidden border border-gray-100 relative">
                                    <MapComponent
                                        center={[14.8093, 121.0028]}
                                        zoom={15}
                                        markers={mapMode !== 'heatmap' ? mapMarkers : mapMarkers.filter(m => m.id < 0)}
                                        showHeatmap={mapMode !== 'pins'}
                                        heatmapPoints={heatmapPoints}
                                        onViewDetails={(marker) => setSelectedDetailReport(marker.rawData)}
                                        routing={isNavigating && selectedReport ? {
                                            start: (navSource === 'hq' || navSource === 'brgy') ? ADMIN_HQ : (userLocation || ADMIN_HQ),
                                            end: [parseFloat(selectedReport.latitude || selectedReport.lat), parseFloat(selectedReport.longitude || selectedReport.lng)],
                                            waypointNames: [(navSource === 'hq' || navSource === 'brgy') ? "Barangay Hall HQ" : "Your Location", selectedReport.landmark || selectedReport.title],
                                            onClose: () => setIsNavigating(false)
                                        } : undefined}
                                        onMarkerClick={(m) => {
                                            if (m.id === -1) {
                                                setSelectedReport(null);
                                                setIsNavigating(false);
                                            } else {
                                                const fullReport = reports.find(r => r.report_id.toString() === m.id.toString());
                                                if (fullReport) {
                                                    setSelectedReport(fullReport);
                                                    if (m.source) {
                                                        setNavSource(m.source);
                                                        setIsNavigating(true);
                                                    } else {
                                                        setIsNavigating(true);
                                                        setNavSource('hq');
                                                    }
                                                }
                                            }
                                        }}
                                    />

                                    {/* Legend overlay */}
                                    <div className="absolute bottom-4 left-4 z-[1000]">
                                        <div className="bg-white/95 backdrop-blur-md p-3 rounded-2xl shadow-md border border-gray-100 text-[9px] font-bold text-gray-600 flex flex-col gap-1.5 min-w-[110px]">
                                            <div className="text-[8px] font-black uppercase text-gray-400 tracking-wider mb-0.5">Status Legend</div>
                                            <div className="flex items-center gap-1.5">
                                                <span className="w-2.5 h-2.5 rounded-full bg-[#EF4444] shrink-0" />
                                                <span>Pending</span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <span className="w-2.5 h-2.5 rounded-full bg-[#F97316] shrink-0" />
                                                <span>Endorsed</span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <span className="w-2.5 h-2.5 rounded-full bg-[#3B82F6] shrink-0" />
                                                <span>Assigned</span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B] shrink-0" />
                                                <span>In Progress</span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <span className="w-2.5 h-2.5 rounded-full bg-[#8B5CF6] shrink-0" />
                                                <span>Picked Up</span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <span className="w-2.5 h-2.5 rounded-full bg-[#10B981] shrink-0" />
                                                <span>Resolved</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Recent Activity */}
                            <div className="xl:col-span-2 bg-white rounded-3xl p-6 border border-gray-100 shadow-sm flex flex-col">
                                <h3 className="text-lg font-bold text-gray-900 mb-5">Recent Activity</h3>
                                {loading ? (
                                    <div className="space-y-3">
                                        {[1, 2, 3].map(i => (
                                            <div key={i} className="h-16 bg-gray-50 rounded-2xl animate-pulse" />
                                        ))}
                                    </div>
                                ) : recentActivity.length === 0 ? (
                                    <div className="flex-1 flex items-center justify-center">
                                        <p className="text-sm text-gray-400 italic">No recent activity</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3 flex-1 overflow-y-auto">
                                        {recentActivity.map((item) => (
                                            <div key={item.id} className="border border-gray-100 rounded-2xl p-4 flex items-start gap-3 hover:bg-gray-50 transition-colors">
                                                <div className="w-8 h-8 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0 mt-0.5">
                                                    {iconMap[item.icon]}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-sm font-semibold text-gray-900 leading-snug truncate">{item.text}</p>
                                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">{item.sub}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
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
                                <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">Geospatial Command Center</h3>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Full-Scale Incident & Rescuer Density Monitor</p>
                            </div>
                            <div className="flex items-center gap-4">
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
                                <button
                                    onClick={() => setIsMapExpanded(false)}
                                    className="p-2 hover:bg-gray-150 rounded-full transition-colors text-gray-400 hover:text-gray-700"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        {/* Stats Panel */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4 w-full shrink-0">
                            <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 shadow-sm flex flex-col justify-between">
                                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Total Reports</span>
                                <span className="text-lg font-black text-gray-800 mt-1">{reports.length}</span>
                            </div>
                            <div className="bg-red-50 border border-red-100 rounded-xl p-3 shadow-sm flex flex-col justify-between">
                                <span className="text-[9px] font-bold text-red-500 uppercase tracking-wider">Active Reports</span>
                                <span className="text-lg font-black text-red-700 mt-1">{activeReports.length}</span>
                            </div>
                            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 shadow-sm flex flex-col justify-between">
                                <span className="text-[9px] font-bold text-blue-500 uppercase tracking-wider">Assigned</span>
                                <span className="text-lg font-black text-blue-700 mt-1">{assignedReportsCount}</span>
                            </div>
                            <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-3 shadow-sm flex flex-col justify-between">
                                <span className="text-[9px] font-bold text-yellow-600 uppercase tracking-wider">In Progress</span>
                                <span className="text-lg font-black text-yellow-800 mt-1">{inProgressReportsCount}</span>
                            </div>
                            <div className="bg-purple-50 border border-purple-100 rounded-xl p-3 shadow-sm flex flex-col justify-between">
                                <span className="text-[9px] font-bold text-purple-500 uppercase tracking-wider">Picked Up</span>
                                <span className="text-lg font-black text-purple-700 mt-1">{pickedUpReportsCount}</span>
                            </div>
                            <div className="bg-green-50 border border-green-100 rounded-xl p-3 shadow-sm flex flex-col justify-between">
                                <span className="text-[9px] font-bold text-green-500 uppercase tracking-wider">Resolved</span>
                                <span className="text-lg font-black text-green-700 mt-1">{resolvedReportsCount}</span>
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
                                    setIsMapExpanded(false);
                                    setSelectedDetailReport(marker.rawData);
                                }}
                                routing={isNavigating && selectedReport ? {
                                    start: (navSource === 'hq' || navSource === 'brgy') ? ADMIN_HQ : (userLocation || ADMIN_HQ),
                                    end: [parseFloat(selectedReport.latitude || selectedReport.lat), parseFloat(selectedReport.longitude || selectedReport.lng)],
                                    waypointNames: [(navSource === 'hq' || navSource === 'brgy') ? "Barangay Hall HQ" : "Your Location", selectedReport.landmark || selectedReport.title],
                                    onClose: () => setIsNavigating(false)
                                } : undefined}
                                onMarkerClick={(m) => {
                                    if (m.id === -1) {
                                        setSelectedReport(null);
                                        setIsNavigating(false);
                                    } else {
                                        const fullReport = reports.find(r => r.report_id.toString() === m.id.toString());
                                        if (fullReport) {
                                            setSelectedReport(fullReport);
                                            if (m.source) {
                                                setNavSource(m.source);
                                                setIsNavigating(true);
                                            } else {
                                                setIsNavigating(true);
                                                setNavSource('hq');
                                            }
                                        }
                                    }
                                }}
                            />

                            <div className="absolute bottom-4 left-4 z-[1000]">
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
                                    <div className="flex items-center gap-2">
                                        <span className="w-2.5 h-2.5 rounded-full bg-[#10B981] shrink-0" />
                                        <span>Resolved</span>
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
                        <div className="border-t border-gray-100 pt-4 mt-4 flex justify-end shrink-0">
                            <button
                                onClick={() => setSelectedDetailReport(null)}
                                className="px-5 py-2.5 bg-[#1A4543] hover:bg-[#112d2b] text-white rounded-xl text-xs font-black uppercase tracking-wider transition-colors shadow-sm"
                            >
                                Close Details
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SubdDashboard;
