import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { DEFAULT_AVATAR, getProfilePicture } from '../../utils/avatar';
import BrgySidebar from '../../components/BrgySidebar';
import BrgyNavbar from '../../components/Navbars/BrgyNavbar';
import MapComponent from '../../components/MapComponent';

const BrgyDashboard = () => {
    const navigate = useNavigate();
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
    const [requests, setRequests] = useState<any[]>([]);
    const [personnel, setPersonnel] = useState<any[]>([]);
    const [reports, setReports] = useState<any[]>([]);
    const [mapMode, setMapMode] = useState<'pins' | 'heatmap' | 'both'>('both');
    const [isMapExpanded, setIsMapExpanded] = useState(false);
    const [selectedDetailReport, setSelectedDetailReport] = useState<any>(null);
    const [selectedReport, setSelectedReport] = useState<any>(null);
    const [isNavigating, setIsNavigating] = useState(false);
    const [navSource, setNavSource] = useState<'hq' | 'brgy' | 'current'>('hq');
    const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const rawUser = localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user');
        if (!rawUser) {
            navigate('/staff/login');
            return;
        }

        try {
            const user = JSON.parse(rawUser);
            if (user.role_id !== 3) {
                navigate('/staff/login');
            }
        } catch {
            navigate('/staff/login');
        }
    }, [navigate]);

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

    useEffect(() => {
        const fetchDashboardData = async () => {
            try {
                const [requestsRes, personnelRes, reportsRes] = await Promise.allSettled([
                    axios.get('http://localhost:8000/rescue-requests/'),
                    axios.get('http://localhost:8000/users/?role_id=3'),
                    axios.get('http://localhost:8000/reports/?escalated_only=true')
                ]);

                if (requestsRes.status === 'fulfilled') {
                    setRequests(requestsRes.value.data || []);
                }
                if (personnelRes.status === 'fulfilled') {
                    setPersonnel(personnelRes.value.data || []);
                }
                if (reportsRes.status === 'fulfilled') {
                    setReports(reportsRes.value.data || []);
                }
            } catch (err) {
                console.error('Error fetching dashboard statistics:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchDashboardData();
        const interval = setInterval(fetchDashboardData, 10000);
        return () => clearInterval(interval);
    }, []);

    const reportRequestCount = requests.filter(r => r.status_id === 1 || r.status_id === 2).length;
    const ongoingReportCount = requests.filter(r => r.status_id === 4 || r.status_id === 5).length;
    const resolvedReportCount = requests.filter(r => r.status_id === 6).length;

    const assignedPersonnelIds = requests.filter(r => (r.status_id === 4 || r.status_id === 5) && r.staff_id).map(r => r.staff_id);
    const uniqueAssigned = Array.from(new Set(assignedPersonnelIds)).length;
    const totalPersonnel = personnel.length;

    const displayReportRequest = reportRequestCount;
    const displayOngoingReport = ongoingReportCount;
    const displayResolvedReport = resolvedReportCount;
    const displayBrgyPersonnel = totalPersonnel;

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

    const isReportEscalated = (rep: any) => {
        if (!rep) return false;
        // Status 4+ (Escalated to Barangay, Approved, Dispatched, Picked Up, Under Observation, Impounded, etc.)
        if ([4, 5, 6, 7, 8, 9, 10, 13].includes(rep.status_id)) return true;
        if (rep.endorsement_letter) return true;
        if (rep.rescue_id || (rep.rescues && rep.rescues.length > 0)) return true;
        if (rep.history?.some((h: any) => h.report_status_id === 4 || h.rescue_id)) return true;
        return false;
    };

    // Derived stats for full command center map - only show escalated reports
    const activeReports = reports.filter(r => isReportEscalated(r) && [4, 5, 7, 8, 9, 13].includes(r.status_id));
    const assignedReportsCount = requests.filter(req => req.staff_id && [1, 2, 4, 5].includes(req.status_id)).length;
    const inProgressReportsCount = requests.filter(req => req.status_id === 4).length;
    const pickedUpReportsCount = reports.filter(r => isReportEscalated(r) && [7, 8, 9].includes(r.status_id)).length;
    const resolvedReportsCount = reports.filter(r => isReportEscalated(r) && [6, 11].includes(r.status_id)).length;

    // Derived state for dynamic insights
    const resolvedTodayCount = requests.filter(r => {
        const isResolved = r.status_id === 6 || (r.report && (r.report.status_id === 11 || r.report.status_id === 12));
        if (!isResolved) return false;

        const dateStr = r.completed_at || r.created_at;
        if (!dateStr) return false;

        const resolvedDate = new Date(dateStr);
        const today = new Date();
        return resolvedDate.getDate() === today.getDate() &&
            resolvedDate.getMonth() === today.getMonth() &&
            resolvedDate.getFullYear() === today.getFullYear();
    }).length;

    const availablePersonnelCount = Math.max(0, totalPersonnel - uniqueAssigned);

    const highPriorityRequest = requests.find(r =>
        r.report?.priority_level === 'High' &&
        (r.status_id === 1 || r.status_id === 2 || r.status_id === 4 || r.status_id === 5)
    );

    const activeDispatches = requests.filter(r =>
        (r.status_id === 4 || r.status_id === 5) &&
        r.assigned_staff_name
    );

    const getPositionName = (id: number | null) => {
        switch (id) {
            case 1: return 'President';
            case 2: return 'Secretary';
            case 3: return 'Barangay Staff';
            case 4: return 'Tanod';
            case 5: return 'Animal Rescuer';
            case 6: return 'Barangay Captain';
            default: return 'Staff';
        }
    };

    const heatmapPoints: [number, number, number][] = reports
        .filter(r => isReportEscalated(r) && r.latitude && r.longitude)
        .map((r: any) => [
            parseFloat(r.latitude),
            parseFloat(r.longitude),
            r.priority_level === 'High' ? 1.0 : 0.6
        ]);

    const mapMarkers = [
        {
            id: -1,
            lat: 14.806906,
            lng: 121.0039297,
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
                const associatedRescue = requests.find(req => req.report_id === r.report_id);
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
            {/* LEFT SIDEBAR */}
            <BrgySidebar
                isMobileOpen={isMobileSidebarOpen}
                onCloseMobile={() => setIsMobileSidebarOpen(false)}
            />

            {/* MAIN CONTENT */}
            <main className="flex-1 flex flex-col h-screen overflow-hidden w-full">
                <BrgyNavbar
                    onMenuToggle={() => setIsMobileSidebarOpen(true)}
                    leftContent={
                        <div className="flex flex-col">
                            <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none uppercase">Barangay Operations</h1>
                            <p className="text-[9px] text-gray-400 font-extrabold uppercase tracking-wider mt-1.5 leading-none">Managing rescue requests and field operations for Brgy. San Vicente</p>
                        </div>
                    }
                />

                {/* SCROLLABLE AREA */}
                <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-8 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">

                    <div className="flex flex-col lg:flex-row gap-8">
                        {/* LEFT SECTION: MAIN DASHBOARD */}
                        <div className="flex-1 flex flex-col space-y-8">

                            {/* Header */}
                            <div className="flex justify-end items-center">
                                <div className="hidden sm:flex items-center space-x-3">
                                    <button className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-600 shadow-sm hover:bg-gray-50 transition-all">
                                        Export Reports
                                    </button>
                                    <button className="px-4 py-2 bg-[#F97316] text-white rounded-xl text-xs font-bold shadow-md hover:bg-[#EA580C] transition-all">
                                        Dispatch Team
                                    </button>
                                </div>
                            </div>

                            {/* Stats Row */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                {/* Report Request */}
                                <div className="bg-white rounded-2xl p-5 shadow-[0_2px_14px_rgba(0,0,0,0.02)] border border-gray-100 flex flex-col justify-between h-32 transition-all hover:shadow-md">
                                    <div className="flex justify-between items-start">
                                        <div className="w-9 h-9 bg-orange-50 rounded-xl flex items-center justify-center text-orange-600">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                                            </svg>
                                        </div>
                                        <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded-lg">Pending</span>
                                    </div>
                                    <div>
                                        {loading ? (
                                            <div className="h-7 w-12 bg-gray-100 rounded-lg animate-pulse mt-1" />
                                        ) : (
                                            <p className="text-2xl font-black text-gray-900 leading-none">{displayReportRequest}</p>
                                        )}
                                        <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase mt-1.5">Report Request</p>
                                    </div>
                                </div>

                                {/* Brgy Personnel */}
                                <div className="bg-white rounded-2xl p-5 shadow-[0_2px_14px_rgba(0,0,0,0.02)] border border-gray-100 flex flex-col justify-between h-32 transition-all hover:shadow-md">
                                    <div className="flex justify-between items-start">
                                        <div className="w-9 h-9 bg-teal-50 rounded-xl flex items-center justify-center text-teal-600">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                                            </svg>
                                        </div>
                                        <span className="text-[10px] font-bold text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded-lg">On Duty</span>
                                    </div>
                                    <div>
                                        {loading ? (
                                            <div className="h-7 w-12 bg-gray-100 rounded-lg animate-pulse mt-1" />
                                        ) : (
                                            <p className="text-2xl font-black text-gray-900 leading-none">{displayBrgyPersonnel}</p>
                                        )}
                                        <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase mt-1.5">Brgy Personnel</p>
                                    </div>
                                </div>

                                {/* Ongoing Report */}
                                <div className="bg-white rounded-2xl p-5 shadow-[0_2px_14px_rgba(0,0,0,0.02)] border border-gray-100 flex flex-col justify-between h-32 transition-all hover:shadow-md">
                                    <div className="flex justify-between items-start">
                                        <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                                                <path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1V5a1 1 0 00-1-1H3zM14 7a1 1 0 00-1 1v6.05A2.5 2.5 0 0115.95 16H17a1 1 0 001-1v-5a1 1 0 00-.293-.707l-2-2A1 1 0 0015 7h-1z" />
                                            </svg>
                                        </div>
                                        <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-lg">In Field</span>
                                    </div>
                                    <div>
                                        {loading ? (
                                            <div className="h-7 w-12 bg-gray-100 rounded-lg animate-pulse mt-1" />
                                        ) : (
                                            <p className="text-2xl font-black text-gray-900 leading-none">{displayOngoingReport}</p>
                                        )}
                                        <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase mt-1.5">Ongoing Report</p>
                                    </div>
                                </div>

                                {/* Resolved Report */}
                                <div className="bg-[#1A4543] rounded-2xl p-5 shadow-lg shadow-teal-900/10 flex flex-col justify-between h-32 transition-all hover:scale-[1.02]">
                                    <div className="flex justify-between items-start">
                                        <div className="w-9 h-9 bg-white/10 rounded-xl flex items-center justify-center text-teal-300">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                            </svg>
                                        </div>
                                        <span className="text-[10px] font-bold text-teal-300 bg-white/10 px-1.5 py-0.5 rounded-lg">+{resolvedTodayCount} Today</span>
                                    </div>
                                    <div>
                                        {loading ? (
                                            <div className="h-7 w-12 bg-white/10 rounded-lg animate-pulse mt-1" />
                                        ) : (
                                            <p className="text-2xl font-black text-white leading-none">{displayResolvedReport}</p>
                                        )}
                                        <p className="text-[10px] font-bold text-teal-100/60 tracking-wider uppercase mt-1.5">Resolved Report</p>
                                    </div>
                                </div>
                            </div>


                            {/* Barangay Personnel Status Section */}
                            <div className="bg-white rounded-3xl shadow-[0_2px_14px_rgba(0,0,0,0.02)] overflow-hidden flex flex-col p-6">
                                <div className="flex justify-between items-center mb-6">
                                    <div>
                                        <h3 className="text-lg font-bold text-gray-900">Personnel Status</h3>
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Real-time Rescuer Availability & Assignments</p>
                                    </div>
                                    <span className="px-3 py-1 bg-teal-50 text-teal-700 text-xs font-bold rounded-xl">
                                        {availablePersonnelCount} Available / {totalPersonnel} Total
                                    </span>
                                </div>

                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="border-b border-gray-100 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                                <th className="pb-3 pl-2">Name</th>
                                                <th className="pb-3">Role</th>
                                                <th className="pb-3">Phone</th>
                                                <th className="pb-3">Status</th>
                                                <th className="pb-3">Current Assignment</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50 text-xs">
                                            {personnel.map((p) => {
                                                const activeRescue = requests.find(r =>
                                                    (r.status_id === 4 || r.status_id === 5) &&
                                                    (r.staff_id === p.user_id || r.barangay_staff_id === p.user_id)
                                                );
                                                return (
                                                    <tr key={p.user_id} className="hover:bg-gray-50/50 transition-colors">
                                                        <td className="py-3.5 pl-2 font-bold text-gray-900 flex items-center gap-3">
                                                            <img 
                                                                src={getProfilePicture(p.profile_picture)} 
                                                                alt={p.name} 
                                                                className="w-7 h-7 rounded-full object-cover border border-gray-100" 
                                                                onError={(e) => { e.currentTarget.src = DEFAULT_AVATAR; }}
                                                            />
                                                            {p.name}
                                                        </td>
                                                        <td className="py-3.5 text-gray-500 font-medium">{getPositionName(p.position_id)}</td>
                                                        <td className="py-3.5 text-gray-500 font-mono">{p.phone || '—'}</td>
                                                        <td className="py-3.5">
                                                            {activeRescue ? (
                                                                <span className="px-2.5 py-1 bg-orange-50 text-orange-700 rounded-lg text-[10px] font-bold uppercase tracking-wider">Assigned</span>
                                                            ) : (
                                                                <span className="px-2.5 py-1 bg-teal-50 text-teal-700 rounded-lg text-[10px] font-bold uppercase tracking-wider">Available</span>
                                                            )}
                                                        </td>
                                                        <td className="py-3.5 font-medium text-gray-700">
                                                            {activeRescue ? (
                                                                <div className="flex flex-col">
                                                                    <span className="font-bold text-gray-900">Case #{activeRescue.rescue_id}</span>
                                                                    <span className="text-[10px] text-gray-400">{activeRescue.report?.landmark || 'No landmark listed'}</span>
                                                                </div>
                                                            ) : (
                                                                <span className="text-gray-400 italic">Ready for dispatch</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                            {personnel.length === 0 && (
                                                <tr>
                                                    <td colSpan={5} className="py-8 text-center text-gray-400 italic">
                                                        No Barangay Personnel registered.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Map Section */}
                            <div className="bg-white rounded-3xl shadow-[0_2px_14px_rgba(0,0,0,0.02)] overflow-hidden flex flex-col p-6 relative">
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                                    <div>
                                        <h3 className="text-lg font-bold text-gray-900">Rescue Map</h3>
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Live Team Tracking & Incident Locations</p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                                        {/* Map Mode Toggles */}
                                        <div className="flex bg-gray-100 p-1 rounded-xl text-[9px] font-black uppercase border border-gray-250">
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
                                <div className="w-full h-[400px] rounded-2xl overflow-hidden relative border border-gray-100">
                                    <MapComponent
                                        center={[14.8093, 121.0028]}
                                        zoom={15}
                                        markers={mapMode !== 'heatmap' ? mapMarkers : mapMarkers.filter(m => m.id < 0)}
                                        showHeatmap={mapMode !== 'pins'}
                                        heatmapPoints={heatmapPoints}
                                        onViewDetails={(marker) => setSelectedDetailReport(marker.rawData)}
                                        routing={isNavigating && selectedReport ? {
                                            start: (navSource === 'hq' || navSource === 'brgy') ? [14.806906, 121.0039297] : (userLocation || [14.806906, 121.0039297]),
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

                        {/* RIGHT SECTION: AI INSIGHTS & OPERATIONS */}
                        <div className="w-full lg:w-80 flex-shrink-0 flex flex-col gap-6">

                            <div className="bg-[#EAE5DF] rounded-[2rem] p-6 pb-8">
                                <div className="flex items-center space-x-3 mb-6">
                                    <div className="w-8 h-8 bg-white rounded flex items-center justify-center text-[#F97316] shadow-sm">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M11.3 1.047a1 1 0 00-1.6 0l-8.6 10.582a1 1 0 001.2 1.584l.622-.254a4.673 4.673 0 002.73 3.552 4.674 4.674 0 002.04 1.019c.147.402.432.733.797.943a1.5 1.5 0 001.822-.226l1.61-1.611a1.5 1.5 0 00.225-1.822c-.21-.365-.54-.65-.943-.797a4.674 4.674 0 00-1.019-2.04 4.673 4.673 0 00-3.552-2.73l.254-.622a1 1 0 00-1.584-1.2l-10.582 8.6a1 1 0 000 1.6l10.582 8.6a1 1 0 001.6 0l8.6-10.582a1 1 0 00-1.2-1.584l-.622.254a4.673 4.673 0 00-2.73-3.552 4.674 4.674 0 00-2.04-1.019c-.147-.402-.432-.733-.797-.943a1.5 1.5 0 00-1.822.226l-1.61 1.611a1.5 1.5 0 00-.225 1.822c.21.365.54.65.943.797a4.674 4.674 0 001.019 2.04 4.673 4.673 0 003.552 2.73l-.254.622a1 1 0 001.584 1.2l10.582-8.6a1 1 0 000-1.6l-10.582-8.6z" clipRule="evenodd" />
                                        </svg>
                                    </div>
                                    <div>
                                        <h3 className="text-base font-bold text-gray-900">Rescue Insights</h3>
                                        <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mt-0.5">AI Response Optimization</p>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    {/* Insight 1: High Priority Alert */}
                                    <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-4 border border-white/40 shadow-sm transition-all hover:shadow-md hover:bg-white/80 group">
                                        <div className="flex items-start space-x-3">
                                            <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center text-orange-600 shrink-0 group-hover:scale-110 transition-transform">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                                </svg>
                                            </div>
                                            <div>
                                                <p className="text-[9px] font-black text-orange-600 uppercase mb-1">
                                                    {highPriorityRequest ? "High Priority Alert" : "System Status"}
                                                </p>
                                                <p className="text-[11px] text-gray-700 leading-snug font-medium">
                                                    {highPriorityRequest ? (
                                                        <>
                                                            Active high-priority case <span className="font-bold">#{highPriorityRequest.rescue_id}</span> at <span className="font-bold">{highPriorityRequest.report?.landmark || "San Vicente"}</span>. Immediate dispatch recommended.
                                                        </>
                                                    ) : (
                                                        "No high-priority active reports. System status normal."
                                                    )}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Insight 2: Route Optimized / Active Dispatch */}
                                    <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-4 border border-white/40 shadow-sm transition-all hover:shadow-md hover:bg-white/80 group">
                                        <div className="flex items-start space-x-3">
                                            <div className="w-8 h-8 rounded-lg bg-teal-100 flex items-center justify-center text-[#1A4543] shrink-0 group-hover:scale-110 transition-transform">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                            </div>
                                            <div>
                                                <p className="text-[9px] font-black text-[#1A4543] uppercase mb-1">
                                                    {activeDispatches.length > 0 ? "Active Dispatch" : "Teams Ready"}
                                                </p>
                                                <p className="text-[11px] text-gray-700 leading-snug font-medium">
                                                    {activeDispatches.length > 0 ? (
                                                        <>
                                                            Rescuer <span className="font-bold">{activeDispatches[0].assigned_staff_name}</span> is currently handling a case at <span className="font-bold">{activeDispatches[0].report?.landmark || "San Vicente"}</span>.
                                                        </>
                                                    ) : (
                                                        <>
                                                            No active dispatches. <span className="font-bold text-teal-600">{availablePersonnelCount} personnel</span> on standby.
                                                        </>
                                                    )}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Insight 3: Staff Capacity */}
                                    <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-4 border border-white/40 shadow-sm transition-all hover:shadow-md hover:bg-white/80 group">
                                        <div className="flex items-start space-x-3">
                                            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600 shrink-0 group-hover:scale-110 transition-transform">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                            </div>
                                            <div>
                                                <p className="text-[9px] font-black text-blue-600 uppercase mb-1">Staff Capacity</p>
                                                <p className="text-[11px] text-gray-700 leading-snug font-medium">
                                                    <span className="font-bold">{uniqueAssigned} personnel</span> currently assigned to active cases. <span className="font-bold text-gray-900">{availablePersonnelCount} personnel</span> available.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
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
                                    start: (navSource === 'hq' || navSource === 'brgy') ? [14.806906, 121.0039297] : (userLocation || [14.806906, 121.0039297]),
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
                            <div className="grid grid-cols-2 gap-4 text-xs">
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

export default BrgyDashboard;
