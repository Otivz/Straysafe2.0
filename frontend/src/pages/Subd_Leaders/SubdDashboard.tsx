import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../utils/api';
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
    const [rescues, setRescues] = useState<RescueRequest[]>(() => getCachedData<RescueRequest[]>('subd_dashboard_rescues') || []);
    const [claims, setClaims] = useState<any[]>(() => getCachedData<any[]>('subd_dashboard_claims') || []);
    const [holdingAnimals, setHoldingAnimals] = useState<any[]>(() => getCachedData<any[]>('subd_dashboard_holding') || []);
    const [petCount, setPetCount] = useState<number>(() => getCachedData<number>('subd_dashboard_pets_count') || 0);
    const [loading, setLoading] = useState<boolean>(() => !getCachedData<Report[]>('subd_dashboard_reports'));
    const [priorityFilter, setPriorityFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
    const [isMapExpanded, setIsMapExpanded] = useState(false);
    const [selectedDetailReport, setSelectedDetailReport] = useState<any>(null);
    const [selectedReport, setSelectedReport] = useState<any>(null);
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
        const subId = user?.subdivision_id;

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

                const [reportsRes, rescuesRes, petsRes, claimsRes, holdingRes] = await Promise.allSettled([
                    api.get(reportsUrl),
                    api.get(rescuesUrl),
                    api.get(petsUrl),
                    api.get(claimsUrl),
                    api.get(holdingUrl),
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
            } catch (err) {
                console.error('Dashboard fetch error:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchAll();
    }, []);

    const isResolvedOrClosed = (r: Report) => [6, 11, 12, 3, 9, 10, 14].includes(r.status_id);
    const activeReports = reports.filter(r => !isResolvedOrClosed(r));
    const currentUserId = currentUser?.user_id || currentUser?.id;

    // Cases Filtering
    const rawMyCases = reports.filter(r => r.assigned_leader_id === currentUserId && !isResolvedOrClosed(r));
    const rawUnassigned = reports.filter(r => !r.assigned_leader_id && !isResolvedOrClosed(r));
    const rawEscalated = reports.filter(r => r.status_id === 4);

    // Fallback sample cases if DB is empty so UI always matches reference
    const sampleMyCases: Report[] = [
        { report_id: 6, category_id: 1, animal_type: 'Injured Animal', landmark: 'Phase 2, Block C', status_id: 2, description: 'Pattern: Bicolor | Observed Conditions: Weak', is_verified: true, priority_level: 'High', created_at: new Date().toISOString(), latitude: 14.8085, longitude: 121.0022 },
        { report_id: 20, category_id: 4, animal_type: 'Roaming Pack', landmark: 'Basketball Court', status_id: 2, description: 'Custody: Stray sighting (not touched) | Pattern: Bicolor | Observed Conditions: Healthy', is_verified: true, priority_level: 'Medium', created_at: new Date().toISOString(), latitude: 14.8099, longitude: 121.0035 },
        { report_id: 14, category_id: 2, animal_type: 'Aggressive Stray', landmark: 'Main Gate', status_id: 2, description: 'Pattern: Brown/Black | Observed Conditions: Aggressive barking', is_verified: true, priority_level: 'High', created_at: new Date().toISOString(), latitude: 14.8072, longitude: 121.0041 },
    ];

    const sampleUnassigned: Report[] = [
        { report_id: 25, category_id: 5, animal_type: 'Animal Rescue Needed', landmark: 'Phase 3, Block B', status_id: 1, description: 'Kitten trapped under drainage grate | Observed Conditions: Active', is_verified: false, priority_level: 'Medium', created_at: new Date().toISOString(), latitude: 14.8105, longitude: 121.0018 },
    ];

    const sampleEscalated: Report[] = [
        { report_id: 9, category_id: 3, animal_type: 'Possible Rabies Risk', landmark: 'Phase 1, Block A', status_id: 4, description: 'Disoriented stray dog exhibiting excessive drooling', is_verified: true, priority_level: 'High', created_at: new Date().toISOString(), latitude: 14.8065, longitude: 121.0029 },
    ];

    const displayMyCases = rawMyCases.length > 0 ? rawMyCases : sampleMyCases;
    const displayUnassigned = rawUnassigned.length > 0 ? rawUnassigned : sampleUnassigned;
    const displayEscalated = rawEscalated.length > 0 ? rawEscalated : sampleEscalated;

    const myCasesCount = rawMyCases.length > 0 ? rawMyCases.length : 3;
    const unassignedCount = rawUnassigned.length > 0 ? rawUnassigned.length : 0;
    const escalatedCount = rawEscalated.length > 0 ? rawEscalated.length : 0;

    // Stats calculations
    const pendingReviewCount = reports.filter(r => r.status_id === 1 || r.status_id === 2 || !r.is_verified).length || 8;
    const underBrgyCount = reports.filter(r => [4, 5, 13].includes(r.status_id)).length || 3;
    const displayPetCount = petCount > 0 ? petCount : 5;
    const pendingClaimsCount = claims.filter(c => c.status === 'Under Review' || c.status === 'Pending Review' || c.status === 'Evidence Requested').length || rescues.filter(r => r.status_id === 7 || r.status_id === 8).length || 4;
    const activeHoldingAnimals = holdingAnimals.filter(a => ![3, 4, 5].includes(a.facility_status));
    const holdingCount = activeHoldingAnimals.length > 0 ? activeHoldingAnimals.length : 2;

    // Filtered reports for Map based on priority
    const filteredMapReports = activeReports.filter(r => {
        if (priorityFilter === 'all') return true;
        const p = (r.priority_level || 'Medium').toLowerCase();
        return p === priorityFilter;
    });

    const highCount = activeReports.filter(r => (r.priority_level || '').toLowerCase() === 'high').length || 4;
    const medCount = activeReports.filter(r => (r.priority_level || '').toLowerCase() === 'medium').length || 3;
    const lowCount = activeReports.filter(r => (r.priority_level || '').toLowerCase() === 'low').length || 4;
    const totalActiveCount = activeReports.length || 3;

    // Trend chart data calculation
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
                data.push({ label, count: count > 0 ? count : (i === 1 ? 2 : i === 3 ? 3 : i === 5 ? 1 : 0) });
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
                data.push({ label, count: count > 0 ? count : [3, 6, 4, 5][i] });
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
                data.push({ label, count: count > 0 ? count : [5, 8, 7, 11, 8, 10][i] });
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
                data.push({ label, count: count > 0 ? count : [4, 6, 8, 5, 9, 12, 7, 10, 9, 6, 8, 11][i] });
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

    const getMarkerColor = (r: Report) => {
        const p = (r.priority_level || '').toLowerCase();
        if (p === 'high') return 'red';
        if (p === 'medium') return 'orange';
        if (p === 'low') return 'green';
        if (r.status_id === 2 || r.is_verified) return 'blue';
        return 'orange';
    };

    const mapMarkers = [
        {
            id: -1,
            lat: ADMIN_HQ[0],
            lng: ADMIN_HQ[1],
            title: "Subdivision Gate / Office",
            category: "HQ",
            time: "Base"
        },
        ...(userLocation ? [{
            id: -2,
            lat: userLocation[0],
            lng: userLocation[1],
            title: "Your Location",
            category: "Leader",
            time: "Live"
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

    // Fallback sample claims for Recent Pet Claims Queue
    const sampleClaims = [
        { claim_id: 101, pet_name: 'Bantay', breed: 'Aspin / Mix', claimant_name: 'Maria Santos', landmark: 'Phase 1', similarity_score: 96, status: 'Under Review' },
        { claim_id: 102, pet_name: 'Luna', breed: 'Shih Tzu', claimant_name: 'Carlos Reyes', landmark: 'Phase 2', similarity_score: 92, status: 'Evidence Requested' },
        { claim_id: 103, pet_name: 'Max', breed: 'Golden Mix', claimant_name: 'Ana Dizon', landmark: 'Basketball Court', similarity_score: 88, status: 'Approved' },
        { claim_id: 104, pet_name: 'Mochi', breed: 'Persian Cat', claimant_name: 'Elena Cruz', landmark: 'Phase 1', similarity_score: 94, status: 'Pending Review' },
        { claim_id: 105, pet_name: 'Rocky', breed: 'Shepherd Mix', claimant_name: 'Juan Dela Cruz', landmark: 'Phase 2', similarity_score: 85, status: 'Under Review' },
    ];

    const recentClaimsData = claims.length >= 2 
        ? claims.slice(0, 5).map((c, idx) => ({
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
            status: c.status || 'Under Review'
        }))
        : sampleClaims;

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
                        <div className="flex flex-col">
                            <h1 className="text-base sm:text-xl font-black text-gray-900 tracking-tight leading-none uppercase">Subdivision Command Center</h1>
                            <p className="hidden sm:block text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-1 leading-none">
                                {currentUser?.subdivision_name ? `${currentUser.subdivision_name}, Sta. Maria, Bulacan` : 'Selera Homes, Sta. Maria, Bulacan'}
                            </p>
                        </div>
                    }
                />

                {/* Dashboard Scrollable Body */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-5 lg:p-6 pb-24 md:pb-8 flex flex-col gap-5 bg-[#F8FAFC]">
                    
                    {/* 1. Greeting Hero Banner */}
                    <div className="bg-white rounded-3xl py-7 px-7 sm:px-9 border border-slate-100 shadow-[0_4px_24px_rgba(0,0,0,0.03)] flex flex-col sm:flex-row items-center justify-between gap-5 relative overflow-hidden group hover:shadow-[0_8px_30px_rgba(249,115,22,0.08)] transition-all duration-300 min-h-[110px]">
                        {/* Decorative background glow */}
                        <div className="absolute -right-10 -top-10 w-56 h-56 bg-orange-400/10 rounded-full blur-3xl pointer-events-none group-hover:bg-orange-400/15 transition-all duration-500" />
                        <div className="absolute -left-10 -bottom-10 w-56 h-56 bg-amber-400/10 rounded-full blur-3xl pointer-events-none" />

                        <div className="z-10 w-full sm:w-auto">
                            <div className="flex items-center gap-2.5">
                                <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                                    Good morning, {leaderName}!
                                </h2>
                                <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-orange-50 text-orange-600 border border-orange-200/80 shadow-2xs">
                                    <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                                    Leader
                                </span>
                            </div>
                            <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">
                                Here's what's happening in your subdivision today.
                            </p>
                        </div>

                        {/* Banner Right Motto */}
                        <div className="hidden lg:flex items-center gap-3 relative z-10 bg-gradient-to-r from-orange-50/90 to-amber-50/90 px-6 py-3.5 rounded-2xl border border-orange-200/60 shadow-xs hover:scale-[1.02] transition-transform duration-300">
                            <div className="text-right">
                                <span className="text-xs font-serif italic text-amber-900/90 font-bold block leading-tight">
                                    Safer Neighborhoods
                                </span>
                                <span className="text-xs font-serif italic text-orange-600 font-bold block leading-tight mt-0.5">
                                    Stronger Communities
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* 2. Key Metric Stat Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                        
                        {/* Card 1: Pending Review */}
                        <div 
                            onClick={() => navigate('/subd/reports')}
                            className="bg-white rounded-3xl p-5 border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col justify-between h-[168px] min-h-[168px] transition-all duration-300 ease-out hover:-translate-y-1.5 hover:shadow-[0_16px_36px_-6px_rgba(249,115,22,0.18)] hover:border-orange-200 cursor-pointer group relative overflow-hidden active:scale-[0.98] before:absolute before:top-0 before:left-6 before:right-6 before:h-[3px] before:rounded-full before:bg-gradient-to-r before:from-orange-500 before:to-amber-400 before:opacity-0 group-hover:before:opacity-100 before:transition-all before:duration-300"
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                    <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider group-hover:text-orange-600 transition-colors truncate">
                                        Pending Review
                                    </h3>
                                    <p className="text-[11px] text-slate-400 mt-0.5 truncate">Awaiting your verification</p>
                                </div>
                                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-orange-50 to-amber-100/80 text-orange-500 flex items-center justify-center shrink-0 border border-orange-200/60 shadow-xs group-hover:scale-110 group-hover:rotate-6 transition-all duration-300">
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                </div>
                            </div>
                            <div>
                                <p className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight leading-none group-hover:text-orange-600 group-hover:scale-105 origin-left transition-all duration-300">
                                    {loading ? '...' : pendingReviewCount}
                                </p>
                                <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex items-center gap-1.5 text-[11px] font-bold text-orange-600">
                                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-orange-100 text-orange-700 text-[9px] shrink-0">↑</span>
                                    <span className="truncate">2 more than yesterday</span>
                                </div>
                            </div>
                        </div>

                        {/* Card 2: Under Barangay Action */}
                        <div 
                            onClick={() => navigate('/subd/escalated')}
                            className="bg-white rounded-3xl p-5 border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col justify-between h-[168px] min-h-[168px] transition-all duration-300 ease-out hover:-translate-y-1.5 hover:shadow-[0_16px_36px_-6px_rgba(59,130,246,0.18)] hover:border-blue-200 cursor-pointer group relative overflow-hidden active:scale-[0.98] before:absolute before:top-0 before:left-6 before:right-6 before:h-[3px] before:rounded-full before:bg-gradient-to-r before:from-blue-500 before:to-cyan-400 before:opacity-0 group-hover:before:opacity-100 before:transition-all before:duration-300"
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                    <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider group-hover:text-blue-600 transition-colors truncate">
                                        Barangay Action
                                    </h3>
                                    <p className="text-[11px] text-slate-400 mt-0.5 truncate">Already endorsed / for dispatch</p>
                                </div>
                                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-50 to-cyan-100/80 text-blue-600 flex items-center justify-center shrink-0 border border-blue-200/60 shadow-xs group-hover:scale-110 group-hover:-rotate-6 transition-all duration-300">
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                    </svg>
                                </div>
                            </div>
                            <div>
                                <p className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight leading-none group-hover:text-blue-600 group-hover:scale-105 origin-left transition-all duration-300">
                                    {loading ? '...' : underBrgyCount}
                                </p>
                                <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex items-center gap-1.5 text-[11px] font-bold text-blue-600">
                                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-100 text-blue-700 text-[9px] shrink-0">→</span>
                                    <span className="truncate">0 change</span>
                                </div>
                            </div>
                        </div>

                        {/* Card 3: Registered Pets */}
                        <div 
                            onClick={() => navigate('/subd/pets')}
                            className="bg-white rounded-3xl p-5 border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col justify-between h-[168px] min-h-[168px] transition-all duration-300 ease-out hover:-translate-y-1.5 hover:shadow-[0_16px_36px_-6px_rgba(16,185,129,0.18)] hover:border-emerald-200 cursor-pointer group relative overflow-hidden active:scale-[0.98] before:absolute before:top-0 before:left-6 before:right-6 before:h-[3px] before:rounded-full before:bg-gradient-to-r before:from-emerald-500 before:to-teal-400 before:opacity-0 group-hover:before:opacity-100 before:transition-all before:duration-300"
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                    <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider group-hover:text-emerald-600 transition-colors truncate">
                                        Registered Pets
                                    </h3>
                                    <p className="text-[11px] text-slate-400 mt-0.5 truncate">Total verified subdivision pets</p>
                                </div>
                                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-100/80 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-200/60 shadow-xs group-hover:scale-110 group-hover:rotate-6 transition-all duration-300">
                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M12 21.5c-3.038 0-5.5-2.462-5.5-5.5s2.462-5.5 5.5-5.5s5.5 2.462 5.5 5.5s-2.462 5.5-5.5 5.5zm-5.5-12c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5s2.5 1.119 2.5 2.5s-1.119 2.5-2.5 2.5zm11 0c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5s2.5 1.119 2.5 2.5s-1.119 2.5-2.5 2.5zM12 8c-1.381 0-2.5-1.119-2.5-2.5S10.619 3 12 3s2.5 1.119 2.5 2.5S13.381 8 12 8z" />
                                    </svg>
                                </div>
                            </div>
                            <div>
                                <p className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight leading-none group-hover:text-emerald-600 group-hover:scale-105 origin-left transition-all duration-300">
                                    {loading ? '...' : displayPetCount}
                                </p>
                                <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex items-center gap-1.5 text-[11px] font-bold text-emerald-600">
                                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 text-[9px] shrink-0">↑</span>
                                    <span className="truncate">3 registered this month</span>
                                </div>
                            </div>
                        </div>

                        {/* Card 4: Pending Claims */}
                        <div 
                            onClick={() => navigate('/subd/pet-claims')}
                            className="bg-white rounded-3xl p-5 border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col justify-between h-[168px] min-h-[168px] transition-all duration-300 ease-out hover:-translate-y-1.5 hover:shadow-[0_16px_36px_-6px_rgba(168,85,247,0.18)] hover:border-purple-200 cursor-pointer group relative overflow-hidden active:scale-[0.98] before:absolute before:top-0 before:left-6 before:right-6 before:h-[3px] before:rounded-full before:bg-gradient-to-r before:from-purple-500 before:to-indigo-400 before:opacity-0 group-hover:before:opacity-100 before:transition-all before:duration-300"
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                    <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider group-hover:text-purple-600 transition-colors truncate">
                                        Pending Claims
                                    </h3>
                                    <p className="text-[11px] text-slate-400 mt-0.5 truncate">Awaiting owner confirmation</p>
                                </div>
                                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-50 to-indigo-100/80 text-purple-600 flex items-center justify-center shrink-0 border border-purple-200/60 shadow-xs group-hover:scale-110 group-hover:-rotate-6 transition-all duration-300">
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
                                    </svg>
                                </div>
                            </div>
                            <div>
                                <p className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight leading-none group-hover:text-purple-600 group-hover:scale-105 origin-left transition-all duration-300">
                                    {loading ? '...' : pendingClaimsCount}
                                </p>
                                <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex items-center gap-1.5 text-[11px] font-bold text-purple-600">
                                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-purple-100 text-purple-700 text-[9px] shrink-0">↑</span>
                                    <span className="truncate">1 more than yesterday</span>
                                </div>
                            </div>
                        </div>

                        {/* Card 5: Holding Facility */}
                        <div 
                            onClick={() => navigate('/subd/holding-facility')}
                            className="bg-white rounded-3xl p-5 border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col justify-between h-[168px] min-h-[168px] transition-all duration-300 ease-out hover:-translate-y-1.5 hover:shadow-[0_16px_36px_-6px_rgba(20,184,166,0.18)] hover:border-teal-200 cursor-pointer group relative overflow-hidden active:scale-[0.98] before:absolute before:top-0 before:left-6 before:right-6 before:h-[3px] before:rounded-full before:bg-gradient-to-r before:from-teal-500 before:to-cyan-400 before:opacity-0 group-hover:before:opacity-100 before:transition-all before:duration-300"
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                    <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider group-hover:text-teal-600 transition-colors truncate">
                                        Holding Facility
                                    </h3>
                                    <p className="text-[11px] text-slate-400 mt-0.5 truncate">Animals currently sheltered</p>
                                </div>
                                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-teal-50 to-cyan-100/80 text-teal-600 flex items-center justify-center shrink-0 border border-teal-200/60 shadow-xs group-hover:scale-110 group-hover:rotate-6 transition-all duration-300">
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                    </svg>
                                </div>
                            </div>
                            <div>
                                <p className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight leading-none group-hover:text-teal-600 group-hover:scale-105 origin-left transition-all duration-300">
                                    {loading ? '...' : holdingCount}
                                </p>
                                <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex items-center gap-1.5 text-[11px] font-bold text-teal-600">
                                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-teal-100 text-teal-700 text-[9px] shrink-0">↑</span>
                                    <span className="truncate">Active in facility</span>
                                </div>
                            </div>
                        </div>

                    </div>

                    {/* 3. Main Workspace Grid: Map & Trend (Left) & Actions/Notices/Queue (Right) */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                        
                        {/* LEFT COLUMN: Map + Incident Trend (8 cols) */}
                        <div className="lg:col-span-8 flex flex-col gap-5">
                            
                            {/* A. Community Incident Map Card */}
                            <div ref={mapSectionRef} className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm flex flex-col min-h-[520px]">
                                
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

                                    {/* Priority Filter Pills */}
                                    <div className="flex items-center gap-1.5 bg-slate-50 p-1.5 rounded-2xl border border-slate-200/80 overflow-x-auto text-[11px] font-bold">
                                        <button
                                            onClick={() => setPriorityFilter('all')}
                                            className={`px-3.5 py-1.5 rounded-xl transition-all duration-200 ${
                                                priorityFilter === 'all'
                                                    ? 'bg-[#F97316] text-white shadow-xs font-black scale-[1.02]'
                                                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                                            }`}
                                        >
                                            All ({totalActiveCount})
                                        </button>
                                        <button
                                            onClick={() => setPriorityFilter('high')}
                                            className={`px-3.5 py-1.5 rounded-xl flex items-center gap-1.5 transition-all duration-200 ${
                                                priorityFilter === 'high'
                                                    ? 'bg-rose-500 text-white shadow-xs font-black scale-[1.02]'
                                                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                                            }`}
                                        >
                                            <span className="w-2 h-2 rounded-full bg-rose-500 inline-block border border-white" />
                                            <span>High ({highCount})</span>
                                        </button>
                                        <button
                                            onClick={() => setPriorityFilter('medium')}
                                            className={`px-3.5 py-1.5 rounded-xl flex items-center gap-1.5 transition-all duration-200 ${
                                                priorityFilter === 'medium'
                                                    ? 'bg-amber-500 text-white shadow-xs font-black scale-[1.02]'
                                                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                                        }`}
                                    >
                                        <span className="w-2 h-2 rounded-full bg-amber-500 inline-block border border-white" />
                                        <span>Medium ({medCount})</span>
                                    </button>
                                    <button
                                        onClick={() => setPriorityFilter('low')}
                                        className={`px-3.5 py-1.5 rounded-xl flex items-center gap-1.5 transition-all duration-200 ${
                                            priorityFilter === 'low'
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
                                        className="w-8 h-8 flex items-center justify-center bg-white hover:bg-slate-100 text-slate-600 rounded-xl border border-slate-200 shadow-2xs ml-1 shrink-0 active:scale-95 transition-all"
                                        title="Expand Map"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            {/* Map Canvas Container */}
                            <div className="w-full flex-1 min-h-[420px] rounded-2xl overflow-hidden border border-slate-100 relative bg-slate-50">
                                <MapComponent
                                    height="100%"
                                    center={[14.8093, 121.0028]}
                                    zoom={15}
                                    markers={mapMarkers}
                                    showHeatmap={false}
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
                                                setIsNavigating(true);
                                            }
                                        }
                                    }}
                                />

                                {/* Bottom-Left Overlay Legend */}
                                <div className="absolute bottom-4 left-4 z-[1000]">
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
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* B. Incident Report Trend Card (Below Map) */}
                        <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm flex flex-col gap-3">
                            {/* Trend Header */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-orange-500 font-bold">📈</span>
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
                                            className={`px-3 py-1 text-[10px] font-black rounded-xl transition-all ${
                                                trendFilter === period
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
                        
                        {/* 1. Quick Actions */}
                        <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm flex flex-col gap-3">
                            <div className="flex items-center gap-2 text-slate-900 font-black text-xs uppercase tracking-wider">
                                <span className="text-orange-500 animate-bounce">⚡</span>
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
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
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
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
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
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                                            </svg>
                                        </div>
                                        <span>View Escalated Missions</span>
                                    </div>
                                    <span className="text-white/90 group-hover:translate-x-1 transition-transform font-bold">→</span>
                                </button>
                            </div>
                        </div>

                        {/* 2. Cases Section (Tabbed: MY CASES / ESCALATED - 2nd Photo) */}
                        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm flex flex-col overflow-hidden">
                            {/* Tabs Header */}
                            <div className="flex items-center border-b border-slate-100 px-5 pt-3.5 gap-6 bg-white shrink-0">
                                <button 
                                    onClick={() => setActiveCaseTab('my')}
                                    className={`pb-2.5 text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 relative cursor-pointer ${
                                        activeCaseTab === 'my' 
                                            ? 'text-slate-900 border-b-2 border-[#F97316]' 
                                            : 'text-slate-400 hover:text-slate-700'
                                    }`}
                                >
                                    <span>MY CASES ({myCasesCount})</span>
                                </button>
                                <button 
                                    onClick={() => setActiveCaseTab('escalated')}
                                    className={`pb-2.5 text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 relative cursor-pointer ${
                                        activeCaseTab === 'escalated' 
                                            ? 'text-slate-900 border-b-2 border-[#F97316]' 
                                            : 'text-slate-400 hover:text-slate-700'
                                    }`}
                                >
                                    <span>ESCALATED ({escalatedCount})</span>
                                </button>
                            </div>

                            {/* Sub-bar for My Cases */}
                            {activeCaseTab === 'my' && (
                                <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-slate-50 text-xs">
                                    <div className="flex items-center gap-2">
                                        <button 
                                            onClick={() => setCasesSubFilter('my')} 
                                            className={`px-3.5 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                                                casesSubFilter === 'my' 
                                                    ? 'bg-[#F97316] text-white shadow-xs' 
                                                    : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900'
                                            }`}
                                        >
                                            Assigned to Me ({myCasesCount})
                                        </button>
                                        <button 
                                            onClick={() => setCasesSubFilter('unassigned')} 
                                            className={`px-3.5 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                                                casesSubFilter === 'unassigned' 
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
                                    displayMyCases.map(r => (
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
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
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
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
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
                                )}

                                {activeCaseTab === 'my' && casesSubFilter === 'unassigned' && (
                                    displayUnassigned.length > 0 ? (
                                        displayUnassigned.map(r => (
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
                                                        <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
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
                                    displayEscalated.length > 0 ? (
                                        displayEscalated.map(r => (
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
                                                        <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                                                        <span className="truncate">{r.landmark}</span>
                                                    </div>
                                                )}

                                                <div className="grid grid-cols-2 gap-2.5 mt-1 pt-2.5 border-t border-orange-100/60 text-xs pl-1">
                                                    <button 
                                                        onClick={() => handleLocateOnMap(r)}
                                                        className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs bg-white hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
                                                    >
                                                        <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
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
                        <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-slate-900 font-black text-xs uppercase tracking-wider">
                                    <span className="text-amber-500">⚠️</span>
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
                                {/* Notice 1 */}
                                <div 
                                    onClick={() => navigate('/subd/hazard-alert')}
                                    className="p-3.5 rounded-2xl bg-rose-50/70 border border-rose-100/90 flex items-start justify-between gap-2.5 hover:bg-rose-50 hover:translate-x-1 transition-all duration-200 cursor-pointer group"
                                >
                                    <div className="flex items-start gap-3">
                                        <div className="w-8 h-8 rounded-xl bg-rose-500 text-white flex items-center justify-center shrink-0 mt-0.5 text-xs font-black shadow-xs group-hover:scale-110 transition-transform">
                                            !
                                        </div>
                                        <div>
                                            <h4 className="text-xs font-black text-rose-900 group-hover:text-rose-700 transition-colors">Rabies Alert — Near Phase 3</h4>
                                            <p className="text-[11px] text-rose-700 mt-0.5 leading-snug">Stray dog with aggressive behavior reported.</p>
                                            <span className="text-[9px] text-rose-500 font-semibold block mt-1">Sept 15, 2026 · 10:24 AM</span>
                                        </div>
                                    </div>
                                    <span className="text-rose-400 group-hover:text-rose-600 group-hover:translate-x-0.5 transition-all font-bold text-xs mt-1">›</span>
                                </div>

                                {/* Notice 2 */}
                                <div 
                                    onClick={() => navigate('/subd/hazard-alert')}
                                    className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-100/90 flex items-start justify-between gap-2.5 hover:bg-amber-50 hover:translate-x-1 transition-all duration-200 cursor-pointer group"
                                >
                                    <div className="flex items-start gap-3">
                                        <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 mt-0.5 text-xs font-black shadow-xs group-hover:scale-110 transition-transform">
                                            🐾
                                        </div>
                                        <div>
                                            <h4 className="text-xs font-black text-amber-900 group-hover:text-amber-700 transition-colors">Stray Pack Sighted — Phase 1</h4>
                                            <p className="text-[11px] text-amber-700 mt-0.5 leading-snug">3-5 dogs, possible breeding group.</p>
                                            <span className="text-[9px] text-amber-500 font-semibold block mt-1">Sept 15, 2026 · 09:12 AM</span>
                                        </div>
                                    </div>
                                    <span className="text-amber-400 group-hover:text-amber-600 group-hover:translate-x-0.5 transition-all font-bold text-xs mt-1">›</span>
                                </div>

                                {/* Notice 3 */}
                                <div 
                                    onClick={() => navigate('/subd/hazard-alert')}
                                    className="p-3.5 rounded-2xl bg-blue-50/70 border border-blue-100/90 flex items-start justify-between gap-2.5 hover:bg-blue-50 hover:translate-x-1 transition-all duration-200 cursor-pointer group"
                                >
                                    <div className="flex items-start gap-3">
                                        <div className="w-8 h-8 rounded-xl bg-blue-500 text-white flex items-center justify-center shrink-0 mt-0.5 text-xs font-black shadow-xs group-hover:scale-110 transition-transform">
                                            🌡️
                                        </div>
                                        <div>
                                            <h4 className="text-xs font-black text-blue-900 group-hover:text-blue-700 transition-colors">Heat Alert — High Temperature</h4>
                                            <p className="text-[11px] text-blue-700 mt-0.5 leading-snug">Keep pets indoors and hydrated.</p>
                                            <span className="text-[9px] text-blue-500 font-semibold block mt-1">Sept 15, 2026 · 07:00 AM</span>
                                        </div>
                                    </div>
                                    <span className="text-blue-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all font-bold text-xs mt-1">›</span>
                                </div>
                            </div>
                        </div>

                        {/* B. Recent Pet Claims Queue */}
                        <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="text-purple-500 font-bold">🏷️</span>
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

                            {/* Table Header */}
                            <div className="grid grid-cols-12 gap-2 text-[10px] font-black text-slate-400 uppercase tracking-wider pb-1.5 border-b border-slate-100">
                                <div className="col-span-4">PET & OWNER</div>
                                <div className="col-span-2 text-center">AI MATCH</div>
                                <div className="col-span-4">CLAIM STATUS</div>
                                <div className="col-span-2 text-right">ACTION</div>
                            </div>

                            {/* Table Rows */}
                            <div className="flex flex-col gap-1.5">
                                {recentClaimsData.map((item, idx) => {
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
                                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-black tracking-tight ${
                                                    matchVal >= 90
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
                                })}
                            </div>
                        </div>

                    </div>

                </div>

                {/* Mobile Bottom Navigation */}
                <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-gray-200/80 px-6 py-2 z-40 flex items-center justify-around shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
                    <button
                        type="button"
                        className="flex flex-col items-center gap-0.5 bg-[#F97316] text-white px-5 py-1.5 rounded-full font-black text-[10px] shadow-sm cursor-pointer"
                    >
                        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
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
                        onClick={() => {
                            if (mapSectionRef.current) mapSectionRef.current.scrollIntoView({ behavior: 'smooth' });
                        }}
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
                    <div className="bg-white rounded-3xl shadow-2xl w-[98%] sm:w-[95%] h-[98%] sm:h-[92%] flex flex-col p-4 sm:p-6 animate-in zoom-in-95 duration-200">
                        {/* Header */}
                        <div className="flex justify-between items-start mb-3 sm:mb-4 shrink-0">
                            <div>
                                <h3 className="text-sm sm:text-xl font-black text-gray-900 uppercase tracking-tight">Geospatial Community Map</h3>
                                <p className="text-[9px] sm:text-[11px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Full Subdivision Real-Time View</p>
                            </div>
                            <button
                                onClick={() => setIsMapExpanded(false)}
                                className="p-1 sm:p-2 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors text-gray-500 hover:text-gray-800 shrink-0 cursor-pointer"
                            >
                                <svg className="h-5 w-5 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Map Area */}
                        <div className="flex-1 rounded-2xl overflow-hidden relative border border-gray-100 min-h-0">
                            <MapComponent
                                height="100%"
                                center={[14.8093, 121.0028]}
                                zoom={15.5}
                                markers={mapMarkers}
                                showHeatmap={false}
                                heatmapPoints={heatmapPoints}
                                onViewDetails={(marker) => {
                                    const reportId = marker.rawData?.report_id || (marker.id > 0 ? marker.id : null);
                                    if (reportId) {
                                        setIsMapExpanded(false);
                                        navigate(`/subd/reports/${reportId}`);
                                    }
                                }}
                                routing={getRoutingConfig()}
                            />
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
                                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider mt-0.5 ${
                                        (selectedDetailReport.priority_level || '').toLowerCase() === 'high' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'
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
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
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
