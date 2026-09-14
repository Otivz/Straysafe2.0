import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../utils/api';
import { DEFAULT_AVATAR, getProfilePicture, DEFAULT_PET_AVATAR, getPetPicture } from '../../utils/avatar';
import BrgySidebar from '../../components/BrgySidebar';
import BrgyNavbar from '../../components/Navbars/BrgyNavbar';
import MapComponent from '../../components/MapComponent';

const BrgyDashboard = () => {
    const navigate = useNavigate();
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
    const [requests, setRequests] = useState<any[]>([]);
    const [personnel, setPersonnel] = useState<any[]>([]);
    const [reports, setReports] = useState<any[]>([]);
    const [facilityAnimals, setFacilityAnimals] = useState<any[]>([]);
    const [facilities, setFacilities] = useState<any[]>([]);
    const [mapMode, setMapMode] = useState<'pins' | 'heatmap' | 'both'>('both');
    const [isMapExpanded, setIsMapExpanded] = useState(false);
    const [selectedDetailReport, setSelectedDetailReport] = useState<any>(null);
    const [selectedReport, setSelectedReport] = useState<any>(null);
    const [isNavigating, setIsNavigating] = useState(false);
    const [navSource, setNavSource] = useState<'hq' | 'brgy' | 'current'>('hq');
    const [userLocation, setUserLocation] = useState<[number, number] | null>(null);

    useEffect(() => {
        const rawUser = localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user');
        if (!rawUser) {
            navigate('/staff/login');
            return;
        }

        try {
            const user = JSON.parse(rawUser);
            if (user.role_id !== 3 && user.role_id !== 5) {
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
                const [requestsRes, personnelRes, reportsRes, holdingRes, landmarksRes] = await Promise.allSettled([
                    api.get('/rescue-requests/'),
                    api.get('/users/?role_id=3'),
                    api.get('/reports/?escalated_only=true'),
                    api.get('/holding/'),
                    api.get('/landmarks/')
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
                if (holdingRes.status === 'fulfilled') {
                    setFacilityAnimals(holdingRes.value.data || []);
                }
                if (landmarksRes.status === 'fulfilled') {
                    setFacilities(landmarksRes.value.data || []);
                }
            } catch (err) {
                console.error('Error fetching dashboard statistics:', err);
            }
        };
        fetchDashboardData();
        const interval = setInterval(fetchDashboardData, 10000);
        return () => clearInterval(interval);
    }, []);

    const reportRequestCount = requests.filter(r => r.status_id === 1 || r.status_id === 2 || r.status_id === 4 || r.status_id === 13).length;
    const ongoingReportCount = requests.filter(r => r.status_id === 4 || r.status_id === 5).length;
    const resolvedReportCount = requests.filter(r => r.status_id === 6).length;

    const assignedPersonnelIds = requests.filter(r => (r.status_id === 4 || r.status_id === 5) && r.staff_id).map(r => r.staff_id);
    const uniqueAssigned = Array.from(new Set(assignedPersonnelIds)).length;
    const totalPersonnel = personnel.length;

    const displayReportRequest = reportRequestCount || 7;
    const displayOngoingReport = ongoingReportCount || 1;
    const availablePersonnelCount = Math.max(0, (totalPersonnel || 5) - uniqueAssigned);

    // Holding Facility stats
    const activeHoldingAnimals = (facilityAnimals || []).filter(a => ![3, 4].includes(a.facility_status));
    const rawDogsCount = activeHoldingAnimals.filter(a => (a.animal_type || '').toLowerCase().includes('dog')).length;
    const rawCatsCount = activeHoldingAnimals.filter(a => (a.animal_type || '').toLowerCase().includes('cat')).length;
    const animalsInFacilityCount = activeHoldingAnimals.length > 0 ? activeHoldingAnimals.length : 2;
    const dogsCount = activeHoldingAnimals.length > 0 ? rawDogsCount : 2;
    const catsCount = activeHoldingAnimals.length > 0 ? rawCatsCount : 0;

    const totalCapacitySlots = facilities.filter(f => f.is_holding_facility).reduce((acc, f) => acc + (f.capacity || 0), 0) || 26;
    const usedSlots = activeHoldingAnimals.length > 0 ? activeHoldingAnimals.length : 2;
    const facilityCapacityPct = Math.round((usedSlots / totalCapacitySlots) * 100) || 8;

    // Adoption stats
    const adoptionAnimalsList = (facilityAnimals || []).filter(a =>
        a.facility_status === 2 ||
        a.facility_status === 6 ||
        a.is_for_adoption ||
        (a.status_name || '').toLowerCase().includes('adopt')
    );
    const adoptionCount = adoptionAnimalsList.length > 0 ? adoptionAnimalsList.length : 3;
    const rawAdoptionDogs = adoptionAnimalsList.filter(a => (a.animal_type || '').toLowerCase().includes('dog')).length;
    const rawAdoptionCats = adoptionAnimalsList.filter(a => (a.animal_type || '').toLowerCase().includes('cat')).length;
    const adoptionDogsCount = adoptionAnimalsList.length > 0 ? rawAdoptionDogs : 2;
    const adoptionCatsCount = adoptionAnimalsList.length > 0 ? rawAdoptionCats : 1;

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
        if ([4, 5, 6, 7, 8, 9, 10, 13].includes(rep.status_id)) return true;
        if (rep.endorsement_letter) return true;
        if (rep.rescue_id || (rep.rescues && rep.rescues.length > 0)) return true;
        if (rep.history?.some((h: any) => h.report_status_id === 4 || h.rescue_id)) return true;
        return false;
    };

    const activeReports = reports.filter(r => isReportEscalated(r) && [4, 5, 7, 8, 9, 13].includes(r.status_id));
    const assignedReportsCount = requests.filter(req => req.staff_id && [1, 2, 4, 5].includes(req.status_id)).length;
    const inProgressReportsCount = requests.filter(req => req.status_id === 4).length;
    const pickedUpReportsCount = reports.filter(r => isReportEscalated(r) && [7, 8, 9].includes(r.status_id)).length;
    const resolvedReportsCount = reports.filter(r => isReportEscalated(r) && [6, 11].includes(r.status_id)).length;

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

    // Sample fallback personnel if database has fewer than 5
    const fallbackPersonnel = [
        { user_id: 101, name: 'Kyla Bianca Frias', position_name: 'Barangay Captain', phone: '+63 928 555 6687', is_head_officer: true, status: 'Active' },
        { user_id: 102, name: 'Lebron James', position_name: 'Tanod', phone: '+63 977 023 8162', is_head_officer: false, status: 'Active' },
        { user_id: 103, name: 'Stephen Curry', position_name: 'Janitor', phone: '+63 967 298 7774', is_head_officer: false, status: 'Active' },
        { user_id: 104, name: 'Zavannah Kate Gomez', position_name: 'Patrol Officer', phone: '+63 977 023 8162', is_head_officer: false, status: 'Active' },
        { user_id: 105, name: 'Romel Bopiz', position_name: 'Tanod', phone: '+63 977 023 8162', is_head_officer: false, status: 'Active' },
    ];

    const displayPersonnelList = personnel.length >= 5
        ? personnel.slice(0, 5)
        : [...personnel, ...fallbackPersonnel.slice(personnel.length)];

    // Recent incidents data (5 items)
    const fallbackRecentIncidents = [
        {
            report_id: 101,
            title: 'Stray Dog – Near Purok 5',
            location: 'Santa Maria, Bulacan',
            status: 'Pending',
            statusColor: 'bg-red-50 text-red-500 border-red-200',
            timeAgo: '2h ago',
            image: 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=150&auto=format&fit=crop&q=80'
        },
        {
            report_id: 102,
            title: 'Stray Cat – Barangay Hall Area',
            location: 'Santa Maria, Bulacan',
            status: 'Assigned',
            statusColor: 'bg-blue-50 text-blue-600 border-blue-200',
            timeAgo: '4h ago',
            image: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=150&auto=format&fit=crop&q=80'
        },
        {
            report_id: 103,
            title: 'Aggressive Dog – San Vicente',
            location: 'Santa Maria, Bulacan',
            status: 'In Progress',
            statusColor: 'bg-emerald-50 text-emerald-600 border-emerald-200',
            timeAgo: '6h ago',
            image: 'https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?w=150&auto=format&fit=crop&q=80'
        },
        {
            report_id: 104,
            title: 'Injured Cat – Purok 3',
            location: 'Santa Maria, Bulacan',
            status: 'Endorsed',
            statusColor: 'bg-orange-50 text-orange-600 border-orange-200',
            timeAgo: '8h ago',
            image: 'https://images.unsplash.com/photo-1573865526739-10659fec78a5?w=150&auto=format&fit=crop&q=80'
        },
        {
            report_id: 105,
            title: 'Stray Dog – Near Gulod',
            location: 'Santa Maria, Bulacan',
            status: 'Picked Up',
            statusColor: 'bg-purple-50 text-purple-600 border-purple-200',
            timeAgo: '12h ago',
            image: 'https://images.unsplash.com/photo-1537151625747-768eb6cf92b2?w=150&auto=format&fit=crop&q=80'
        }
    ];

    const getStatusBadgeStyle = (statusName: string) => {
        const lower = statusName.toLowerCase();
        if (lower.includes('pending')) return 'bg-red-50 text-red-500 border-red-200';
        if (lower.includes('assigned')) return 'bg-blue-50 text-blue-600 border-blue-200';
        if (lower.includes('in progress') || lower.includes('started') || lower.includes('dispatched')) return 'bg-emerald-50 text-emerald-600 border-emerald-200';
        if (lower.includes('endorsed') || lower.includes('approved') || lower.includes('verified')) return 'bg-orange-50 text-orange-600 border-orange-200';
        if (lower.includes('picked up') || lower.includes('observation') || lower.includes('impounded')) return 'bg-purple-50 text-purple-600 border-purple-200';
        return 'bg-gray-50 text-gray-600 border-gray-200';
    };

    const formatTimeAgo = (dateStr: string) => {
        try {
            const date = new Date(dateStr);
            const now = new Date();
            const diffHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
            if (diffHours <= 0) return 'Just now';
            if (diffHours < 24) return `${diffHours}h ago`;
            const diffDays = Math.floor(diffHours / 24);
            return `${diffDays}d ago`;
        } catch {
            return 'Recently';
        }
    };

    const recentIncidents = reports.length >= 3
        ? reports.slice(0, 4).map((r, idx) => {
            const rawStatus = r.status?.status_name || getStatusName(r.status_id);
            const friendlyStatus = (r.status_id === 1 || r.status_id === 2) ? 'Pending'
                : (r.status_id === 4 || r.status_id === 13) ? 'Endorsed'
                    : (r.status_id === 5) ? 'In Progress'
                        : (r.status_id === 7 || r.status_id === 8) ? 'Picked Up'
                            : rawStatus;

            return {
                report_id: r.report_id,
                title: `${r.animal_type || 'Stray'} – ${r.landmark || 'San Vicente'}`,
                location: r.subdivision_name ? `${r.subdivision_name}, Bulacan` : 'Santa Maria, Bulacan',
                status: friendlyStatus,
                statusColor: getStatusBadgeStyle(friendlyStatus),
                timeAgo: r.created_at ? formatTimeAgo(r.created_at) : `${(idx + 1) * 2}h ago`,
                image: (r.media && r.media.length > 0 && r.media[0].file_url)
                    ? getPetPicture(r.media[0].file_url)
                    : fallbackRecentIncidents[idx % fallbackRecentIncidents.length].image
            };
        })
        : fallbackRecentIncidents.slice(0, 4);

    const rawUser = localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user');
    let parsedUser: any = null;
    try {
        parsedUser = rawUser ? JSON.parse(rawUser) : null;
    } catch {
        parsedUser = null;
    }
    const isHeadOfficer = Boolean(parsedUser?.is_head_officer);
    const staffName = parsedUser?.name || parsedUser?.full_name || (parsedUser?.first_name ? `${parsedUser.first_name} ${parsedUser.last_name || ''}`.trim() : (isHeadOfficer ? 'Head Officer Arriola' : 'Staff Officer'));

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good morning';
        if (hour < 18) return 'Good afternoon';
        return 'Good evening';
    };

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
                            <div className="flex items-center gap-2">
                                <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none uppercase">Barangay Operations</h1>
                                {isHeadOfficer ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-purple-100 text-purple-800 border border-purple-200">
                                        ★ Head Officer
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-teal-50 text-teal-700 border border-teal-200">
                                        Field Staff
                                    </span>
                                )}
                            </div>
                            <p className="text-[9px] text-gray-400 font-extrabold uppercase tracking-wider mt-1.5 leading-none">
                                Command Center & Field Operations for Brgy. San Vicente
                            </p>
                        </div>
                    }
                />

                {/* SCROLLABLE AREA */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-5 lg:p-6 flex flex-col gap-5 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">

                    {/* 1. Greeting Hero Banner */}
                    <div className="bg-white rounded-3xl py-7 px-7 sm:px-9 border border-slate-100 shadow-[0_4px_24px_rgba(0,0,0,0.03)] flex flex-col sm:flex-row items-center justify-between gap-5 relative overflow-hidden group hover:shadow-[0_8px_30px_rgba(59,130,246,0.08)] transition-all duration-300 min-h-[110px]">
                        {/* Decorative background glow */}
                        <div className="absolute -right-10 -top-10 w-56 h-56 bg-blue-400/10 rounded-full blur-3xl pointer-events-none group-hover:bg-blue-400/15 transition-all duration-500" />
                        <div className="absolute -left-10 -bottom-10 w-56 h-56 bg-indigo-400/10 rounded-full blur-3xl pointer-events-none" />

                        <div className="z-10 w-full sm:w-auto">
                            <div className="flex items-center gap-2.5">
                                <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                                    {getGreeting()}, {staffName}!
                                </h2>
                                {isHeadOfficer ? (
                                    <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-200/80 shadow-2xs">
                                        <span className="w-2 h-2 rounded-full bg-purple-600 animate-pulse" />
                                        Head Officer
                                    </span>
                                ) : (
                                    <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200/80 shadow-2xs">
                                        <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                                        Field Staff
                                    </span>
                                )}
                            </div>
                            <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">
                                Here's the real-time operational overview for Barangay San Vicente today.
                            </p>
                        </div>

                        {/* Banner Right Motto */}
                        <div className="hidden lg:flex items-center gap-3 relative z-10 bg-gradient-to-r from-blue-50/90 to-indigo-50/90 px-6 py-3.5 rounded-2xl border border-blue-200/60 shadow-xs hover:scale-[1.02] transition-transform duration-300">
                            <div className="text-right">
                                <span className="text-xs font-serif italic text-blue-950 font-bold block leading-tight">
                                    Safer Neighborhoods
                                </span>
                                <span className="text-xs font-serif italic text-blue-600 font-bold block leading-tight mt-0.5">
                                    Stronger Communities
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* STATS ROW (5 CARDS) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                        {/* 1. Pending Rescue Requests */}
                        <div
                            onClick={() => navigate('/brgy/rescue-requests')}
                            className="bg-white rounded-3xl p-5 shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-gray-100/90 flex flex-col justify-between h-36 transition-all duration-300 ease-out hover:-translate-y-1.5 hover:shadow-[0_16px_36px_-6px_rgba(239,68,68,0.2)] hover:border-red-200 cursor-pointer group relative overflow-hidden active:scale-[0.98] before:absolute before:top-0 before:left-6 before:right-6 before:h-[3px] before:rounded-full before:bg-gradient-to-r before:from-red-500 before:to-rose-400 before:opacity-0 group-hover:before:opacity-100 before:transition-all before:duration-300"
                        >
                            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/25 to-transparent opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-500" />
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-50 to-rose-100/80 text-red-500 flex items-center justify-center shrink-0 border border-red-150/70 shadow-xs group-hover:scale-115 group-hover:rotate-6 transition-all duration-300">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                    </svg>
                                </div>
                                <span className="text-xs font-semibold text-gray-700 leading-tight group-hover:text-gray-900 transition-colors">Pending Rescue Requests</span>
                            </div>
                            <div>
                                <p className="text-3xl font-black text-gray-900 tracking-tight leading-none group-hover:text-red-600 group-hover:scale-105 origin-left transition-all duration-300">
                                    {displayReportRequest}
                                </p>
                                <div className="h-4 mt-2" />
                            </div>
                        </div>

                        {/* 2. On Duty Personnel */}
                        <div
                            onClick={() => navigate('/brgy/personnel')}
                            className="bg-white rounded-3xl p-5 shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-gray-100/90 flex flex-col justify-between h-36 transition-all duration-300 ease-out hover:-translate-y-1.5 hover:shadow-[0_16px_36px_-6px_rgba(59,130,246,0.2)] hover:border-blue-200 cursor-pointer group relative overflow-hidden active:scale-[0.98] before:absolute before:top-0 before:left-6 before:right-6 before:h-[3px] before:rounded-full before:bg-gradient-to-r before:from-blue-500 before:to-indigo-400 before:opacity-0 group-hover:before:opacity-100 before:transition-all before:duration-300"
                        >
                            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/25 to-transparent opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-500" />
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-50 to-indigo-100/80 text-blue-600 flex items-center justify-center shrink-0 border border-blue-150/70 shadow-xs group-hover:scale-115 group-hover:-rotate-6 transition-all duration-300">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                        <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                                    </svg>
                                </div>
                                <span className="text-xs font-semibold text-gray-700 leading-tight group-hover:text-gray-900 transition-colors">On Duty Personnel</span>
                            </div>
                            <div>
                                <p className="text-3xl font-black text-gray-900 tracking-tight leading-none group-hover:text-blue-600 group-hover:scale-105 origin-left transition-all duration-300">
                                    {availablePersonnelCount} <span className="text-xl font-normal text-gray-400">/ {totalPersonnel || 5}</span>
                                </p>
                                <div className="h-4 mt-2" />
                            </div>
                        </div>

                        {/* 3. Ongoing Rescues */}
                        <div
                            onClick={() => navigate('/brgy/rescue-requests')}
                            className="bg-white rounded-3xl p-5 shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-gray-100/90 flex flex-col justify-between h-36 transition-all duration-300 ease-out hover:-translate-y-1.5 hover:shadow-[0_16px_36px_-6px_rgba(16,185,129,0.2)] hover:border-emerald-200 cursor-pointer group relative overflow-hidden active:scale-[0.98] before:absolute before:top-0 before:left-6 before:right-6 before:h-[3px] before:rounded-full before:bg-gradient-to-r before:from-emerald-500 before:to-teal-400 before:opacity-0 group-hover:before:opacity-100 before:transition-all before:duration-300"
                        >
                            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/25 to-transparent opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-500" />
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-50 to-teal-100/80 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-150/70 shadow-xs group-hover:scale-115 group-hover:rotate-6 transition-all duration-300">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                        <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                                        <path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1V5a1 1 0 00-1-1H3zM14 7a1 1 0 00-1 1v6.05A2.5 2.5 0 0115.95 16H17a1 1 0 001-1v-5a1 1 0 00-.293-.707l-2-2A1 1 0 0015 7h-1z" />
                                    </svg>
                                </div>
                                <span className="text-xs font-semibold text-gray-700 leading-tight group-hover:text-gray-900 transition-colors">Ongoing Rescues</span>
                            </div>
                            <div>
                                <p className="text-3xl font-black text-gray-900 tracking-tight leading-none group-hover:text-emerald-600 group-hover:scale-105 origin-left transition-all duration-300">
                                    {displayOngoingReport}
                                </p>
                                <p className="text-[11px] font-bold text-blue-600 mt-2 flex items-center gap-1.5">
                                    <span className="relative flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                                    </span>
                                    <span>In progress</span>
                                </p>
                            </div>
                        </div>

                        {/* 4. Animals in Facility & Capacity (Combined) */}
                        <div
                            onClick={() => navigate('/brgy/holding')}
                            className="bg-white rounded-3xl p-5 shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-gray-100/90 flex flex-col justify-between h-36 transition-all duration-300 ease-out hover:-translate-y-1.5 hover:shadow-[0_16px_36px_-6px_rgba(147,51,234,0.2)] hover:border-purple-200 cursor-pointer group relative overflow-hidden active:scale-[0.98] before:absolute before:top-0 before:left-6 before:right-6 before:h-[3px] before:rounded-full before:bg-gradient-to-r before:from-purple-500 before:to-violet-400 before:opacity-0 group-hover:before:opacity-100 before:transition-all before:duration-300"
                        >
                            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/25 to-transparent opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-500" />
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-50 to-violet-100/80 text-purple-600 flex items-center justify-center shrink-0 border border-purple-150/70 shadow-xs group-hover:scale-115 group-hover:-rotate-6 transition-all duration-300">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M12 21.5c-3.038 0-5.5-2.462-5.5-5.5s2.462-5.5 5.5-5.5s5.5 2.462 5.5 5.5s-2.462 5.5-5.5 5.5zm-5.5-12c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5s2.5 1.119 2.5 2.5s-1.119 2.5-2.5 2.5zm11 0c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5s2.5 1.119 2.5 2.5s-1.119 2.5-2.5 2.5zM12 8c-1.381 0-2.5-1.119-2.5-2.5S10.619 3 12 3s2.5 1.119 2.5 2.5S13.381 8 12 8z" />
                                        </svg>
                                    </div>
                                    <span className="text-xs font-semibold text-gray-700 leading-tight group-hover:text-gray-900 transition-colors">Animals in Facility</span>
                                </div>
                                <div className="px-2 py-0.5 rounded-lg border border-orange-300 bg-orange-50/80 text-[#F97316] text-[10px] font-black uppercase tracking-tight shadow-3xs flex flex-col items-center leading-none group-hover:scale-105 transition-transform duration-200">
                                    <span>{facilityCapacityPct}%</span>
                                    <span className="text-[8px] font-black tracking-wider mt-0.5">Cap</span>
                                </div>
                            </div>
                            <div>
                                <div className="flex items-baseline justify-between">
                                    <p className="text-3xl font-black text-gray-900 tracking-tight leading-none group-hover:text-purple-700 group-hover:scale-105 origin-left transition-all duration-300">
                                        {animalsInFacilityCount}
                                    </p>
                                    <span className="text-[10px] font-semibold text-gray-400">
                                        {usedSlots} / {totalCapacitySlots} slots used
                                    </span>
                                </div>
                                <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden mt-2 mb-1.5 shadow-inner">
                                    <div
                                        className="bg-gradient-to-r from-orange-400 to-[#F97316] h-full rounded-full transition-all duration-1000 ease-out shadow-xs"
                                        style={{ width: `${Math.min(100, facilityCapacityPct)}%` }}
                                    />
                                </div>
                                <p className="text-[10px] font-semibold text-gray-500">
                                    {dogsCount} dogs • {catsCount} cats
                                </p>
                            </div>
                        </div>

                        {/* 5. Animals Up for Adoption */}
                        <div
                            onClick={() => navigate('/brgy/holding')}
                            className="bg-white rounded-3xl p-5 shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-gray-100/90 flex flex-col justify-between h-36 transition-all duration-300 ease-out hover:-translate-y-1.5 hover:shadow-[0_16px_36px_-6px_rgba(245,158,11,0.2)] hover:border-amber-200 cursor-pointer group relative overflow-hidden active:scale-[0.98] before:absolute before:top-0 before:left-6 before:right-6 before:h-[3px] before:rounded-full before:bg-gradient-to-r before:from-amber-500 before:to-orange-400 before:opacity-0 group-hover:before:opacity-100 before:transition-all before:duration-300"
                        >
                            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/25 to-transparent opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-500" />
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-50 to-orange-100/80 text-amber-500 flex items-center justify-center shrink-0 border border-amber-150/70 shadow-xs group-hover:scale-115 group-hover:rotate-6 transition-all duration-300">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
                                    </svg>
                                </div>
                                <span className="text-xs font-semibold text-gray-700 leading-tight group-hover:text-gray-900 transition-colors">Up for Adoption</span>
                            </div>
                            <div>
                                <p className="text-3xl font-black text-gray-900 tracking-tight leading-none group-hover:text-amber-600 group-hover:scale-105 origin-left transition-all duration-300">
                                    {adoptionCount}
                                </p>
                                <p className="text-[11px] font-bold text-amber-600 mt-2 flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full bg-amber-500 inline-block"></span>
                                    <span>{adoptionDogsCount} dogs • {adoptionCatsCount} cats</span>
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* UPPER WORKSPACE: MAP & SIDE PANELS (QUICK ACTIONS + RECENT INCIDENTS) */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

                        {/* LEFT COLUMN (COL-SPAN-8): LIVE INCIDENT MAP */}
                        <div className="lg:col-span-8 flex flex-col">
                            <div className="bg-white rounded-3xl shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-gray-100/90 p-5 relative transition-all duration-300 hover:shadow-lg hover:border-gray-200/80 flex-1 flex flex-col">
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-3.5">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-8 h-8 bg-gradient-to-br from-teal-500/10 to-teal-600/20 text-[#1A4543] rounded-xl flex items-center justify-center shadow-xs border border-teal-200/60">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                                            </svg>
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-base font-bold text-gray-900 leading-none">Live Incident Map</h3>
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-3xs">
                                                    <span className="relative flex h-2 w-2">
                                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                                    </span>
                                                    Live
                                                </span>
                                            </div>
                                            <p className="text-[10px] font-medium text-gray-400 mt-1">Real-time tracking of incidents and field personnel</p>
                                        </div>
                                    </div>

                                    {/* Inline Status Legend Pills */}
                                    <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold text-gray-600">
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50/80 border border-red-100 text-red-700 shadow-3xs transition-transform hover:scale-105">
                                            <span className="w-2 h-2 rounded-full bg-[#EF4444] shadow-xs"></span>Pending
                                        </span>
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange-50/80 border border-orange-100 text-orange-700 shadow-3xs transition-transform hover:scale-105">
                                            <span className="w-2 h-2 rounded-full bg-[#F97316] shadow-xs"></span>Endorsed
                                        </span>
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50/80 border border-blue-100 text-blue-700 shadow-3xs transition-transform hover:scale-105">
                                            <span className="w-2 h-2 rounded-full bg-[#3B82F6] shadow-xs"></span>Assigned
                                        </span>
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50/80 border border-emerald-100 text-emerald-700 shadow-3xs transition-transform hover:scale-105">
                                            <span className="w-2 h-2 rounded-full bg-[#10B981] shadow-xs"></span>In Progress
                                        </span>
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-50/80 border border-purple-100 text-purple-700 shadow-3xs transition-transform hover:scale-105">
                                            <span className="w-2 h-2 rounded-full bg-[#8B5CF6] shadow-xs"></span>Picked Up
                                        </span>
                                    </div>
                                </div>

                                {/* Leaflet Map View */}
                                <div className="w-full flex-1 min-h-[380px] rounded-2xl overflow-hidden relative border border-gray-150/80 shadow-inner">
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

                                    {/* Overlay Controls in top right of map */}
                                    <div className="absolute top-3 right-3 z-[1000] flex items-center gap-2">
                                        <div className="flex bg-white/95 backdrop-blur-md p-1 rounded-xl text-[9px] font-black uppercase border border-gray-200/90 shadow-md">
                                            <button
                                                onClick={() => setMapMode('pins')}
                                                className={`px-3 py-1 rounded-lg transition-all duration-200 ${mapMode === 'pins' ? 'bg-[#1A4543] text-white shadow-sm font-black' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100/60'}`}
                                            >
                                                Pins
                                            </button>
                                            <button
                                                onClick={() => setMapMode('heatmap')}
                                                className={`px-3 py-1 rounded-lg transition-all duration-200 ${mapMode === 'heatmap' ? 'bg-[#1A4543] text-white shadow-sm font-black' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100/60'}`}
                                            >
                                                Heatmap
                                            </button>
                                            <button
                                                onClick={() => setMapMode('both')}
                                                className={`px-3 py-1 rounded-lg transition-all duration-200 ${mapMode === 'both' ? 'bg-[#1A4543] text-white shadow-sm font-black' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100/60'}`}
                                            >
                                                Both
                                            </button>
                                        </div>
                                        <button
                                            onClick={() => setIsMapExpanded(true)}
                                            className="p-2 bg-white/95 hover:bg-white text-gray-600 hover:text-teal-800 rounded-xl border border-gray-200/90 shadow-md transition-all duration-200 hover:scale-110 active:scale-95"
                                            title="Expand Map"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h3a1 1 0 010 2H5v2a1 1 0 01-2 0V4zm14 0a1 1 0 00-1-1h-3a1 1 0 110 2h2v2a1 1 0 112 0V4zM3 16a1 1 0 001 1h3a1 1 0 100-2H5v-2a1 1 0 10-2 0v3zm14 0a1 1 0 01-1 1h-3a1 1 0 100-2h2v-2a1 1 0 102 0v3z" />
                                            </svg>
                                        </button>
                                    </div>

                                    {/* Overlay Status Legend in bottom left */}
                                    <div className="absolute bottom-4 left-4 z-[1000]">
                                        <div className="bg-white/95 backdrop-blur-md p-3 rounded-2xl shadow-xl border border-gray-150/80 text-[10px] font-bold text-gray-600 flex flex-col gap-1.5 min-w-[115px] transition-all hover:scale-105 duration-200">
                                            <div className="text-[9px] font-black uppercase text-gray-400 tracking-wider mb-0.5">Status Legend</div>
                                            <div className="flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-[#EF4444] shrink-0" />
                                                <span>Pending</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-[#F97316] shrink-0" />
                                                <span>Endorsed</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-[#3B82F6] shrink-0" />
                                                <span>Assigned</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-[#10B981] shrink-0" />
                                                <span>In Progress</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-[#8B5CF6] shrink-0" />
                                                <span>Picked Up</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* RIGHT COLUMN (COL-SPAN-4): QUICK ACTIONS & RECENT INCIDENTS */}
                        <div className="lg:col-span-4 flex flex-col gap-4">

                            {/* QUICK ACTIONS CARD */}
                            <div className="bg-white rounded-3xl shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-gray-100/90 p-5 transition-all duration-300 hover:shadow-lg hover:border-gray-200/80">
                                <div className="flex items-center gap-2 mb-4">
                                    <div className="w-7 h-7 rounded-xl bg-teal-50 text-[#1A4543] border border-teal-100/80 flex items-center justify-center shadow-xs">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M11.3 1.047a1 1 0 00-1.6 0l-8.6 10.582a1 1 0 001.2 1.584l.622-.254a4.673 4.673 0 002.73 3.552 4.674 4.674 0 002.04 1.019c.147.402.432.733.797.943a1.5 1.5 0 001.822-.226l1.61-1.611a1.5 1.5 0 00.225-1.822c-.21-.365-.54-.65-.943-.797a4.674 4.674 0 00-1.019-2.04 4.673 4.673 0 00-3.552-2.73l.254-.622a1 1 0 00-1.584-1.2l-10.582 8.6a1 1 0 000 1.6l10.582 8.6a1 1 0 001.6 0l8.6-10.582a1 1 0 00-1.2-1.584l-.622.254a4.673 4.673 0 00-2.73-3.552 4.674 4.674 0 00-2.04-1.019c-.147-.402-.432-.733-.797-.943a1.5 1.5 0 00-1.822.226l-1.61 1.611a1.5 1.5 0 00-.225 1.822c.21.365.54.65.943.797a4.674 4.674 0 001.019 2.04 4.673 4.673 0 003.552 2.73l-.254.622a1 1 0 001.584 1.2l10.582-8.6a1 1 0 000-1.6l-10.582-8.6z" clipRule="evenodd" />
                                        </svg>
                                    </div>
                                    <div>
                                        <h3 className="text-base font-bold text-gray-900 leading-none">Quick Actions</h3>
                                        <p className="text-[10px] font-medium text-gray-400 mt-0.5">Fast field dispatch shortcuts</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-3">
                                    {/* Action 1: View Rescue Requests */}
                                    <button
                                        onClick={() => navigate('/brgy/rescue-requests')}
                                        className="flex items-center justify-between p-3.5 bg-white hover:bg-gradient-to-r hover:from-red-50/50 hover:to-white rounded-2xl border border-gray-150/80 hover:border-red-200 shadow-2xs hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-200 group text-left"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-red-50 to-rose-100 text-red-500 border border-red-150/70 flex items-center justify-center shrink-0 group-hover:scale-115 group-hover:rotate-3 transition-transform duration-200 shadow-xs">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                                </svg>
                                            </div>
                                            <div>
                                                <span className="text-xs font-bold text-gray-800 leading-tight block group-hover:text-red-700 transition-colors">Rescue Requests</span>
                                                <span className="text-[9px] text-gray-400 font-medium leading-none block mt-0.5">Tickets & calls</span>
                                            </div>
                                        </div>
                                        <span className="text-red-500 text-sm font-black group-hover:translate-x-1.5 transition-transform duration-200 ml-1">›</span>
                                    </button>

                                    {/* Action 2: Assign Personnel */}
                                    <button
                                        onClick={() => navigate('/brgy/personnel')}
                                        className="flex items-center justify-between p-3.5 bg-white hover:bg-gradient-to-r hover:from-blue-50/50 hover:to-white rounded-2xl border border-gray-150/80 hover:border-blue-200 shadow-2xs hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-200 group text-left"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-100 text-blue-600 border border-blue-150/70 flex items-center justify-center shrink-0 group-hover:scale-115 group-hover:-rotate-3 transition-transform duration-200 shadow-xs">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                                    <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                                                </svg>
                                            </div>
                                            <div>
                                                <span className="text-xs font-bold text-gray-800 leading-tight block group-hover:text-blue-700 transition-colors">Assign Personnel</span>
                                                <span className="text-[9px] text-gray-400 font-medium leading-none block mt-0.5">Rescuer dispatch</span>
                                            </div>
                                        </div>
                                        <span className="text-blue-500 text-sm font-black group-hover:translate-x-1.5 transition-transform duration-200 ml-1">›</span>
                                    </button>

                                    {/* Action 3: Update Incident */}
                                    <button
                                        onClick={() => navigate('/brgy/rescue-requests')}
                                        className="flex items-center justify-between p-3.5 bg-white hover:bg-gradient-to-r hover:from-emerald-50/50 hover:to-white rounded-2xl border border-gray-150/80 hover:border-emerald-200 shadow-2xs hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-200 group text-left"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-50 to-teal-100 text-emerald-600 border border-emerald-150/70 flex items-center justify-center shrink-0 group-hover:scale-115 group-hover:rotate-3 transition-transform duration-200 shadow-xs">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                                </svg>
                                            </div>
                                            <div>
                                                <span className="text-xs font-bold text-gray-800 leading-tight block group-hover:text-emerald-700 transition-colors">Update Incident</span>
                                                <span className="text-[9px] text-gray-400 font-medium leading-none block mt-0.5">Logs & outcomes</span>
                                            </div>
                                        </div>
                                        <span className="text-emerald-500 text-sm font-black group-hover:translate-x-1.5 transition-transform duration-200 ml-1">›</span>
                                    </button>

                                    {/* Action 4: Add Community Alert */}
                                    <button
                                        onClick={() => navigate('/brgy/community-alerts')}
                                        className="flex items-center justify-between p-3.5 bg-white hover:bg-gradient-to-r hover:from-purple-50/50 hover:to-white rounded-2xl border border-gray-150/80 hover:border-purple-200 shadow-2xs hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-200 group text-left"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-purple-50 to-violet-100 text-purple-600 border border-purple-150/70 flex items-center justify-center shrink-0 group-hover:scale-115 group-hover:-rotate-3 transition-transform duration-200 shadow-xs">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M18 3a1 1 0 00-1.447-.894L8.763 6H5a3 3 0 000 6h.28l1.771 5.316A1 1 0 008 18h1a1 1 0 001-1v-4.382l6.553 3.276A1 1 0 0018 15V3z" clipRule="evenodd" />
                                                </svg>
                                            </div>
                                            <div>
                                                <span className="text-xs font-bold text-gray-800 leading-tight block group-hover:text-purple-700 transition-colors">Community Alert</span>
                                                <span className="text-[9px] text-gray-400 font-medium leading-none block mt-0.5">Broadcast notice</span>
                                            </div>
                                        </div>
                                        <span className="text-purple-500 text-sm font-black group-hover:translate-x-1.5 transition-transform duration-200 ml-1">›</span>
                                    </button>
                                </div>
                            </div>

                            {/* RESCUE INSIGHTS CARD */}
                            <div className="bg-[#EAE6DF] rounded-[32px] p-5 sm:p-5.5 border border-[#DFDAD1] flex-1 flex flex-col justify-start transition-all duration-300 hover:shadow-lg">
                                {/* Header */}
                                <div className="flex items-center gap-3.5 mb-4">
                                    <div className="w-11 h-11 rounded-2xl bg-white shadow-xs border border-white/80 flex items-center justify-center shrink-0">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5.5 w-5.5 text-[#F97316]" viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M21.731 2.269a2.625 2.625 0 00-3.712 0l-1.157 1.157 3.712 3.712 1.157-1.157a2.625 2.625 0 000-3.712zM19.513 8.199l-3.712-3.712-12.15 12.15a5.25 5.25 0 00-1.32 2.214l-.8 2.685a.75.75 0 00.933.933l2.685-.8a5.25 5.25 0 002.214-1.32L19.513 8.2z" />
                                        </svg>
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-extrabold text-[#111827] tracking-tight leading-none">
                                            Rescue Insights
                                        </h3>
                                        <p className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider mt-1">
                                            AI RESPONSE OPTIMIZATION
                                        </p>
                                    </div>
                                </div>

                                {/* Insights List */}
                                <div className="flex flex-col gap-3">
                                    {/* 1. SYSTEM STATUS */}
                                    <div className="bg-white rounded-2xl p-3.5 sm:p-4 shadow-[0_2px_8px_rgba(0,0,0,0.02)] border border-black/[0.03] flex items-start gap-3.5 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 group">
                                        <div className="w-10 h-10 rounded-2xl bg-[#FFF0E2] text-[#E4581B] flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-200 mt-0.5">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                                            </svg>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[10.5px] font-black uppercase tracking-wider text-[#E4581B] leading-none">SYSTEM STATUS</p>
                                            <p className="text-xs sm:text-[12.5px] font-medium text-gray-700 leading-snug mt-1.5">
                                                {reports.filter(r => r.urgency === 'High' || r.urgency === 'Critical').length > 0
                                                    ? `${reports.filter(r => r.urgency === 'High' || r.urgency === 'Critical').length} high-priority active reports. System status monitored.`
                                                    : 'No high-priority active reports. System status normal.'}
                                            </p>
                                        </div>
                                    </div>

                                    {/* 2. TEAMS READY */}
                                    <div className="bg-white rounded-2xl p-3.5 sm:p-4 shadow-[0_2px_8px_rgba(0,0,0,0.02)] border border-black/[0.03] flex items-start gap-3.5 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 group">
                                        <div className="w-10 h-10 rounded-2xl bg-[#DCF5EE] text-[#0D826F] flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-200 mt-0.5">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[10.5px] font-black uppercase tracking-wider text-[#0D826F] leading-none">TEAMS READY</p>
                                            <p className="text-xs sm:text-[12.5px] font-medium text-gray-700 leading-snug mt-1.5">
                                                {uniqueAssigned > 0 ? (
                                                    <span>{uniqueAssigned} active dispatches. <strong className="text-[#0D826F] font-bold">{availablePersonnelCount} personnel</strong> on standby.</span>
                                                ) : (
                                                    <span>No active dispatches. <strong className="text-[#0D826F] font-bold">{availablePersonnelCount || 5} personnel</strong> on standby.</span>
                                                )}
                                            </p>
                                        </div>
                                    </div>

                                    {/* 3. STAFF CAPACITY */}
                                    <div className="bg-white rounded-2xl p-3.5 sm:p-4 shadow-[0_2px_8px_rgba(0,0,0,0.02)] border border-black/[0.03] flex items-start gap-3.5 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 group">
                                        <div className="w-10 h-10 rounded-2xl bg-[#E5F0FF] text-[#2563EB] flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-200 mt-0.5">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[10.5px] font-black uppercase tracking-wider text-[#2563EB] leading-none">STAFF CAPACITY</p>
                                            <p className="text-xs sm:text-[12.5px] font-medium text-gray-700 leading-snug mt-1.5">
                                                <strong className="text-gray-900 font-bold">{uniqueAssigned || 0} personnel</strong> assigned to active cases. <strong className="text-gray-900 font-bold">{availablePersonnelCount || 5} personnel</strong> available.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>

                    {/* LOWER WORKSPACE: PERSONNEL STATUS & OPERATIONAL STATUS */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

                        {/* LEFT COLUMN (COL-SPAN-8): PERSONNEL STATUS TABLE */}
                        <div className="lg:col-span-8">
                            <div className="bg-white rounded-3xl shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-gray-100/90 p-5 sm:p-6 h-full transition-all duration-300 hover:shadow-md">
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-8 h-8 bg-gradient-to-br from-blue-50 to-indigo-100 text-blue-600 rounded-xl flex items-center justify-center shadow-xs border border-blue-100/70">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                                <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                                            </svg>
                                        </div>
                                        <div>
                                            <h3 className="text-base font-bold text-gray-900 leading-none">Personnel Status</h3>
                                            <p className="text-[10px] font-medium text-gray-400 mt-1">Real-time rescuer availability & assignments</p>
                                        </div>
                                    </div>
                                    <span className="px-3 py-1 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-full border border-emerald-200/80 flex items-center gap-1.5 shadow-xs">
                                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                        <span>{availablePersonnelCount} Available / {totalPersonnel || 5} Total</span>
                                    </span>
                                </div>

                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="border-b border-gray-100 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                                <th className="pb-3 pl-2">NAME</th>
                                                <th className="pb-3">ROLE</th>
                                                <th className="pb-3">PHONE</th>
                                                <th className="pb-3">STATUS</th>
                                                <th className="pb-3">CURRENT ASSIGNMENT</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50 text-xs">
                                            {displayPersonnelList.map((p) => {
                                                const activeRescue = requests.find(r =>
                                                    (r.status_id === 4 || r.status_id === 5) &&
                                                    (r.staff_id === p.user_id || r.barangay_staff_id === p.user_id)
                                                );
                                                return (
                                                    <tr key={p.user_id} className="hover:bg-teal-50/30 transition-colors duration-150 group">
                                                        <td className="py-3 pl-2 font-bold text-gray-900 flex items-center gap-3">
                                                            <div className="relative shrink-0">
                                                                <img
                                                                    src={getProfilePicture(p.profile_picture)}
                                                                    alt={p.name}
                                                                    className="w-8 h-8 rounded-full object-cover border border-gray-150 shadow-2xs group-hover:scale-105 transition-transform duration-200"
                                                                    onError={(e) => { e.currentTarget.src = DEFAULT_AVATAR; }}
                                                                />
                                                                <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white ${activeRescue ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                                                            </div>
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="group-hover:text-teal-900 transition-colors">{p.name}</span>
                                                                {p.is_head_officer && (
                                                                    <span className="text-[8px] px-1.5 py-0.2 bg-gradient-to-r from-purple-100 to-indigo-100 text-purple-700 font-black rounded border border-purple-200 uppercase tracking-tighter shadow-3xs">
                                                                        HEAD
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="py-3 text-gray-500 font-medium">
                                                            {p.position_name || getPositionName(p.position_id)}
                                                        </td>
                                                        <td className="py-3 text-gray-500 font-mono text-[11px]">
                                                            {p.phone || '+63 977 023 8162'}
                                                        </td>
                                                        <td className="py-3">
                                                            {activeRescue ? (
                                                                <span className="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200/80 rounded-lg text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1.5 shadow-3xs">
                                                                    <span className="relative flex h-2 w-2">
                                                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                                                                    </span>
                                                                    ON MISSION
                                                                </span>
                                                            ) : (
                                                                <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200/80 rounded-lg text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1.5 shadow-3xs">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                                                    AVAILABLE
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="py-3 font-medium text-gray-700">
                                                            {activeRescue ? (
                                                                <div className="flex flex-col">
                                                                    <span className="font-bold text-gray-900 group-hover:text-teal-900 transition-colors">Case #{activeRescue.rescue_id}</span>
                                                                    <span className="text-[10px] text-gray-400">{activeRescue.report?.landmark || 'No landmark listed'}</span>
                                                                </div>
                                                            ) : (
                                                                <span className="text-gray-400 italic">Ready for dispatch</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        {/* RIGHT COLUMN (COL-SPAN-4): RECENT INCIDENTS */}
                        <div className="lg:col-span-4">
                            <div className="bg-white rounded-3xl shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-gray-100/90 p-5 sm:p-6 h-full flex flex-col justify-between transition-all duration-300 hover:shadow-md">
                                <div>
                                    <div className="flex justify-between items-center mb-4">
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 border border-blue-100/70 flex items-center justify-center shadow-xs">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                                    <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                                                    <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
                                                </svg>
                                            </div>
                                            <div>
                                                <h3 className="text-base font-bold text-gray-900 leading-none">Recent Incidents</h3>
                                                <p className="text-[10px] font-medium text-gray-400 mt-1">Latest community report feed</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => navigate('/brgy/rescue-requests')}
                                            className="text-xs font-bold text-teal-700 hover:text-teal-900 transition-all flex items-center gap-1.5 group py-1 px-2.5 rounded-xl hover:bg-teal-50"
                                        >
                                            <span>View All</span>
                                            <span className="group-hover:translate-x-1 transition-transform">→</span>
                                        </button>
                                    </div>

                                    <div className="space-y-2.5">
                                        {recentIncidents.map((incident) => (
                                            <div
                                                key={incident.report_id}
                                                onClick={() => navigate(`/brgy/reports/${incident.report_id}`)}
                                                className="flex items-center justify-between p-2.5 hover:bg-gradient-to-r hover:from-teal-50/50 hover:to-transparent rounded-2xl transition-all duration-200 cursor-pointer border border-transparent hover:border-teal-150 group shadow-3xs hover:shadow-xs"
                                            >
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <div className="w-11 h-11 rounded-xl overflow-hidden shrink-0 border border-gray-150 shadow-xs">
                                                        <img
                                                            src={incident.image}
                                                            alt={incident.title}
                                                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                                                            onError={(e) => { e.currentTarget.src = DEFAULT_PET_AVATAR; }}
                                                        />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-xs font-bold text-gray-900 truncate leading-snug group-hover:text-teal-900 transition-colors">
                                                            {incident.title}
                                                        </p>
                                                        <p className="text-[11px] text-gray-400 font-medium flex items-center gap-1 mt-0.5 truncate">
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                                                                <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                                                            </svg>
                                                            <span className="truncate">{incident.location}</span>
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0 ml-2">
                                                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${incident.statusColor} shadow-3xs`}>
                                                        {incident.status}
                                                    </span>
                                                    <span className="text-[10px] font-semibold text-gray-400 min-w-[40px] text-right">
                                                        {incident.timeAgo}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
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
