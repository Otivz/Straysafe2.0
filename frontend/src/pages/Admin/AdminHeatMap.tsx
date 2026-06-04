import { useState, useEffect } from 'react';
import axios from 'axios';
import AdminSidebar from '../../components/AdminSidebar';
import AdminNavbar from '../../components/Navbars/AdminNavbar';
import MapComponent from '../../components/MapComponent';

import SummaryCard from '../../components/Cards/SummaryCard';

interface HotspotArea {
    name: string;
    count: number;
    risk: 'High' | 'Medium' | 'Low';
    trend: 'up' | 'down' | 'stable';
}

const AdminHeatMap = () => {
    const [showSummary, setShowSummary] = useState(false);
    const [showFilters, setShowFilters] = useState(false);
    const [reports, setReports] = useState<any[]>([]);
    const [requests, setRequests] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [timeFilter, setTimeFilter] = useState('7d');
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [heatmapPoints, setHeatmapPoints] = useState<[number, number, number][]>([]);
    const [markers, setMarkers] = useState<any[]>([]);
    const [mapMode, setMapMode] = useState<'heatmap' | 'pinpoint'>('pinpoint');
    const [selectedReport, setSelectedReport] = useState<any>(null);
    const [selectedDetailReport, setSelectedDetailReport] = useState<any>(null);
    const [isNavigating, setIsNavigating] = useState(false);
    const [navSource, setNavSource] = useState<'hq' | 'brgy' | 'current'>('hq');
    const [userLocation, setUserLocation] = useState<[number, number] | null>(null);

    // Mock Hotspot Data
    const hotspots: HotspotArea[] = [
        { name: 'San Vicente Core', count: 42, risk: 'High', trend: 'up' },
        { name: 'Clubhouse Perimeter', count: 28, risk: 'Medium', trend: 'down' },
        { name: 'North Entrance', count: 15, risk: 'Low', trend: 'stable' },
        { name: 'Park Street', count: 12, risk: 'Low', trend: 'up' },
    ];

    const ADMIN_HQ: [number, number] = [14.806906, 121.0039297]; // San Vicente New Brgy Hall (R243+QH)

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

    const fetchReports = async () => {
        try {
            setLoading(true);
            const [reportsRes, requestsRes] = await Promise.allSettled([
                axios.get('http://localhost:8000/reports/'),
                axios.get('http://localhost:8000/rescue-requests/')
            ]);
            if (reportsRes.status === 'fulfilled') {
                setReports(reportsRes.value.data || []);
            }
            if (requestsRes.status === 'fulfilled') {
                setRequests(requestsRes.value.data || []);
            }
        } catch (error) {
            console.error('Error fetching reports for heatmap:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReports();

        // Auto-fetch location on mount for "You are here" marker
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

    useEffect(() => {
        processReports();
    }, [reports, requests, timeFilter, categoryFilter, userLocation]);

    const processReports = () => {
        if (!reports.length) {
            setMarkers([]);
            setHeatmapPoints([]);
            return;
        }

        let filtered = [...reports];

        const now = new Date();
        const timeLimit = new Date();
        if (timeFilter === '24h') timeLimit.setHours(now.getHours() - 24);
        else if (timeFilter === '7d') timeLimit.setDate(now.getDate() - 7);
        else if (timeFilter === '30d') timeLimit.setDate(now.getDate() - 30);

        filtered = filtered.filter(r => new Date(r.created_at) >= timeLimit);

        if (categoryFilter !== 'all') {
            filtered = filtered.filter(r => r.category_id.toString() === categoryFilter);
        }

        const points = filtered
            .filter(r => r.latitude && r.longitude)
            .map((r: any) => [
                parseFloat(r.latitude.toString()),
                parseFloat(r.longitude.toString()),
                r.priority_level === 'High' ? 1.0 : 0.6
            ] as [number, number, number]);
        setHeatmapPoints(points);

        const marks = filtered
            .filter(r => r.latitude && r.longitude)
            .map((r: any) => {
                const date = new Date(r.created_at);
                const timeStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
                const associatedRescue = requests.find(req => req.report_id === r.report_id);
                const reportStatusId = r.status_id || r.current_status_id || 1;
                const normalizedReport = { ...r, status_id: reportStatusId };
                const color = getMarkerColor(normalizedReport, associatedRescue);
                const statusName = r.status?.status_name || getStatusName(reportStatusId);

                return {
                    id: r.report_id,
                    lat: parseFloat(r.latitude.toString()),
                    lng: parseFloat(r.longitude.toString()),
                    title: r.description || `Incident #${r.report_id}`,
                    priority: r.priority_level || 'Medium',
                    category: r.animal_type || 'Stray Animal',
                    color: color,
                    time: timeStr,
                    rawData: {
                        ...normalizedReport,
                        statusName: statusName,
                        reporterName: r.reporter_name || r.reporter?.name || "Citizen",
                        rescue: associatedRescue
                    }
                };
            });

        // Add Command Center HQ
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

        setMarkers(marks);
    };

    return (
        <div className="flex h-screen bg-[#0F172A] text-slate-200 overflow-hidden">
            <AdminSidebar />

            <div className="flex-1 flex flex-col h-screen relative">
                <AdminNavbar
                    leftContent={
                        <div className="flex flex-col">
                            <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none uppercase">Incident Heatmap</h1>
                            <p className="text-[9px] text-gray-400 font-extrabold uppercase tracking-wider mt-1.5 leading-none">Geospatial analysis of reported stray and hazard incidents</p>
                        </div>
                    }
                />

                <main className="flex-1 relative overflow-hidden flex flex-col">
                    {loading && (
                        <div className="absolute inset-0 z-[10000] bg-slate-900/60 backdrop-blur-md flex items-center justify-center">
                            <div className="flex flex-col items-center">
                                <div className="w-12 h-12 border-4 border-orange-500/20 border-t-orange-500 rounded-full animate-spin mb-4"></div>
                                <span className="text-[10px] font-black text-white uppercase tracking-[0.3em] animate-pulse">Syncing Global Activity</span>
                            </div>
                        </div>
                    )}

                    {/* Overlay: Statistics & Controls */}
                    <div className="absolute top-6 right-6 z-[500] flex flex-col items-end gap-4">
                        <div className="flex gap-4">
                            <SummaryCard
                                label="Total Monitored"
                                value={reports.length}
                                className="hidden md:flex !bg-slate-900/90 !border-slate-800 shadow-2xl"
                            />

                            <button
                                onClick={() => { setShowFilters(!showFilters); setShowSummary(false); }}
                                className={`bg-slate-900/90 backdrop-blur-xl border border-slate-800 p-5 rounded-2xl shadow-2xl transition-all hover:scale-105 active:scale-95 ${showFilters ? 'ring-2 ring-orange-500/50 border-orange-500/50' : ''}`}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                                </svg>
                            </button>

                            <button
                                onClick={() => { setShowSummary(!showSummary); setShowFilters(false); }}
                                className={`bg-slate-900/90 backdrop-blur-xl border border-slate-800 p-5 rounded-2xl shadow-2xl transition-all hover:scale-105 active:scale-95 ${showSummary ? 'ring-2 ring-orange-500/50 border-orange-500/50' : ''}`}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                </svg>
                            </button>
                        </div>

                        {showFilters && (
                            <div className="w-80 bg-slate-900/95 backdrop-blur-2xl border border-slate-800 rounded-[2rem] shadow-3xl p-8 space-y-6 animate-in slide-in-from-top-4 duration-300">
                                <div>
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 block">Temporal Scope</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {['24h', '7d', '30d'].map((t) => (
                                            <button
                                                key={t}
                                                onClick={() => setTimeFilter(t)}
                                                className={`py-2.5 rounded-xl text-[10px] font-black transition-all border ${timeFilter === t
                                                    ? 'bg-orange-600 border-orange-600 text-white shadow-lg shadow-orange-900/20'
                                                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'}`}
                                            >
                                                {t.toUpperCase()}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 block">Intelligence Category</label>
                                    <select
                                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-[11px] font-black text-white focus:outline-none focus:border-orange-500 transition-all appearance-none"
                                        value={categoryFilter}
                                        onChange={(e) => setCategoryFilter(e.target.value)}
                                    >
                                        <option value="all">ALL ACTIVITY</option>
                                        <option value="1">INJURED ANIMALS</option>
                                        <option value="2">AGGRESSIVE STRAYS</option>
                                        <option value="3">POSSIBLE RABIES</option>
                                    </select>
                                </div>
                            </div>
                        )}

                        {showSummary && (
                            <div className="w-80 bg-slate-900/95 backdrop-blur-2xl border border-slate-800 rounded-[2rem] shadow-3xl p-8 animate-in slide-in-from-top-4 duration-300">
                                <h3 className="text-[10px] font-black text-orange-500 uppercase tracking-[0.2em] mb-6">Hotspot Analysis</h3>
                                <div className="space-y-4">
                                    {hotspots.map((spot, idx) => (
                                        <div key={idx} className="bg-slate-800/50 border border-slate-700/50 p-4 rounded-2xl">
                                            <div className="flex justify-between items-start mb-1">
                                                <span className="text-xs font-black text-white">{spot.name}</span>
                                                <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${spot.risk === 'High' ? 'bg-red-500/20 text-red-400' : 'bg-orange-500/20 text-orange-400'
                                                    }`}>
                                                    {spot.risk}
                                                </span>
                                            </div>
                                            <div className="flex justify-between items-center mt-2">
                                                <span className="text-xl font-black text-white">{spot.count} <span className="text-[9px] font-bold text-slate-500 uppercase ml-1">Reports</span></span>
                                                <span className={`text-[10px] font-black uppercase ${spot.trend === 'up' ? 'text-red-400' : 'text-emerald-400'}`}>
                                                    {spot.trend}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Bottom Right Overlay: Map Mode Toggle */}
                    <div className="absolute bottom-6 right-6 z-[500] flex bg-slate-900/90 backdrop-blur-xl p-1.5 rounded-2xl border border-slate-800 shadow-2xl">
                        <button
                            onClick={() => setMapMode('heatmap')}
                            className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${mapMode === 'heatmap' ? 'bg-orange-600 text-white shadow-lg shadow-orange-900/20' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            Heatmap
                        </button>
                        <button
                            onClick={() => setMapMode('pinpoint')}
                            className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${mapMode === 'pinpoint' ? 'bg-orange-600 text-white shadow-lg shadow-orange-900/20' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            Pinpoint
                        </button>
                    </div>

                    {/* Floating Time Legend */}
                    <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-[500] w-full max-w-md px-6">
                        <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-800 p-6 rounded-[2.5rem] shadow-2xl">
                            <div className="flex justify-between items-center mb-4">
                                <span className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Temporal Activity Flow</span>
                                <span className="text-[10px] font-black text-orange-500 uppercase">Live Pulse</span>
                            </div>
                            <div className="flex items-end gap-1 h-8">
                                {[30, 45, 25, 60, 85, 40, 35, 55, 75, 90, 65, 45, 30, 25, 50, 70].map((h, i) => (
                                    <div
                                        key={i}
                                        className="flex-1 bg-slate-800 rounded-t-sm transition-all duration-500 hover:bg-orange-500"
                                        style={{ height: `${h}%` }}
                                    ></div>
                                ))}
                            </div>
                            <div className="flex justify-between mt-2 text-[8px] font-bold text-slate-500 uppercase">
                                <span>00:00</span>
                                <span>06:00</span>
                                <span>12:00</span>
                                <span>18:00</span>
                                <span>23:59</span>
                            </div>
                        </div>
                    </div>

                    <div className="w-full h-full">
                        <MapComponent
                            center={ADMIN_HQ}
                            zoom={16}
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
                            onViewDetails={(marker) => setSelectedDetailReport(marker.rawData)}
                        />
                    </div>
                </main>
            </div>

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
                            <div className="grid grid-cols-2 gap-4 text-xs text-gray-700">
                                <div>
                                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Animal Species / Breed</span>
                                    <span className="font-semibold text-gray-850">{selectedDetailReport.animal_type || 'Unknown'} {selectedDetailReport.animal_breed ? `(${selectedDetailReport.animal_breed})` : ''}</span>
                                </div>
                                <div>
                                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Priority Level</span>
                                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider mt-0.5 ${selectedDetailReport.priority_level === 'High' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'
                                        }`}>{selectedDetailReport.priority_level || 'Medium'}</span>
                                </div>
                                <div>
                                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Health Condition</span>
                                    <span className="font-semibold text-gray-850">{selectedDetailReport.condition || 'No specific condition listed'}</span>
                                </div>
                                <div>
                                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Status</span>
                                    <span className="font-semibold text-gray-850">{selectedDetailReport.status?.status_name || getStatusName(selectedDetailReport.status_id)}</span>
                                </div>
                                <div>
                                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Reporter Details</span>
                                    <span className="font-semibold text-gray-850">{selectedDetailReport.reporterName || selectedDetailReport.reporter?.name || 'Citizen'}</span>
                                </div>
                                <div>
                                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Contact Information</span>
                                    <span className="font-semibold text-gray-850">{selectedDetailReport.reporter?.phone || selectedDetailReport.reporter?.email || 'No contact permission'}</span>
                                </div>
                                <div>
                                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Date Reported</span>
                                    <span className="font-semibold text-gray-850">{selectedDetailReport.created_at ? new Date(selectedDetailReport.created_at).toLocaleString() : 'N/A'}</span>
                                </div>
                                <div>
                                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Report Location / Landmark</span>
                                    <span className="font-semibold text-gray-850">{selectedDetailReport.landmark || 'No landmark specified'}</span>
                                </div>
                            </div>

                            {/* Description */}
                            <div className="text-xs border-t border-gray-100 pt-3">
                                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Incident Description</span>
                                <p className="text-gray-700 bg-gray-50 p-3.5 rounded-xl border border-gray-100 italic leading-relaxed">
                                    "{selectedDetailReport.description || 'No description was written for this incident report.'}"
                                </p>
                            </div>

                            {/* Rescue Assignment Details */}
                            <div className="text-xs border-t border-gray-100 pt-3">
                                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Rescue Details</span>
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
