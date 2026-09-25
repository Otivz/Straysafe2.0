import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../utils/api';
import { DEFAULT_AVATAR, getProfilePicture, DEFAULT_PET_AVATAR, getPetPicture } from '../../utils/avatar';
import BrgySidebar from '../../components/BrgySidebar';
import BrgyNavbar from '../../components/Navbars/BrgyNavbar';
import BrgyBottomNav from '../../components/Navbars/BrgyBottomNav';
import MapComponent from '../../components/MapComponent';
import { MapPin, Activity, Flame, Shield, CheckCircle2, Clock, Truck, FileText, X } from 'lucide-react';

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
    const [isModalLegendOpen, setIsModalLegendOpen] = useState(false);
    const [isMobileLegendOpen, setIsMobileLegendOpen] = useState(false);
    const [selectedDetailReport, setSelectedDetailReport] = useState<any>(null);
    const [selectedReport, setSelectedReport] = useState<any>(null);
    const [selectedCoordinates, setSelectedCoordinates] = useState<{ lat: number; lng: number } | null>(null);
    const [isNavigating, setIsNavigating] = useState(false);
    const [navSource, setNavSource] = useState<'hq' | 'brgy' | 'current'>('hq');
    const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
    const [personnelFilter, setPersonnelFilter] = useState<'all' | 'available' | 'on_mission'>('all');

    const [currentUser, setCurrentUser] = useState<any>(() => {
        try {
            const rawUser = localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user');
            return rawUser ? JSON.parse(rawUser) : null;
        } catch {
            return null;
        }
    });
    const [barangayHq, setBarangayHq] = useState<any>(null);
    const [_isLoading, setIsLoading] = useState(true);
    const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    // Quick Action Modals
    const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
    const [assignForm, setAssignForm] = useState<{ rescueId: number; staffId: number; remarks: string }>({ rescueId: 0, staffId: 0, remarks: '' });
    const [isSubmittingAssign, setIsSubmittingAssign] = useState(false);

    const [isUpdateIncidentModalOpen, setIsUpdateIncidentModalOpen] = useState(false);
    const [updateForm, setUpdateForm] = useState<{ rescueId: number; statusId: number; remarks: string }>({ rescueId: 0, statusId: 5, remarks: '' });
    const [isSubmittingUpdate, setIsSubmittingUpdate] = useState(false);

    const [isCommunityAlertModalOpen, setIsCommunityAlertModalOpen] = useState(false);
    const [alertForm, setAlertForm] = useState({ title: '', category: 'Emergency', content: '', pinned: true, expiration: '' });
    const [isSubmittingAlert, setIsSubmittingAlert] = useState(false);

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
                return;
            }
            setCurrentUser(user);
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

    const fetchDashboardData = async () => {
        try {
            const raw = localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user');
            const user = raw ? JSON.parse(raw) : currentUser;
            const bId = user?.barangay_id;
            const bParam = bId ? `barangay_id=${bId}` : '';

            const [requestsRes, personnelRes, reportsRes, holdingRes, landmarksRes, hqRes] = await Promise.allSettled([
                api.get('/rescue-requests/' + (bParam ? `?${bParam}` : '')),
                api.get('/users/?role_id=3' + (bParam ? `&${bParam}` : '')),
                api.get('/reports/' + (bParam ? `?${bParam}` : '')),
                api.get('/holding/' + (bParam ? `?${bParam}` : '')),
                api.get('/landmarks/' + (bParam ? `?${bParam}` : '')),
                bId ? api.get(`/landmarks/barangay/${bId}/hq`) : Promise.reject('No barangay')
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
            if (hqRes.status === 'fulfilled') {
                setBarangayHq(hqRes.value.data || null);
            }
        } catch (err) {
            console.error('Error fetching dashboard statistics:', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchDashboardData();
        const interval = setInterval(fetchDashboardData, 10000);
        return () => clearInterval(interval);
    }, []);

    // Statistics calculated directly from real database records (no artificial fallbacks)
    const reportRequestCount = requests.filter(r => [1, 2, 4, 13].includes(r.status_id)).length;
    const ongoingReportCount = requests.filter(r => [4, 5].includes(r.status_id)).length;

    const isPersonAssigned = (pId: number) => {
        return requests.find(r => {
            if (r.status_id !== 4 && r.status_id !== 5) return false;
            if (Number(r.staff_id) === Number(pId)) return true;
            if (Array.isArray(r.assignments)) {
                return r.assignments.some((a: any) => {
                    const status = a.assignment_status || a.status;
                    const matchesId = Number(a.staff_id) === Number(pId) || Number(a.user_id) === Number(pId);
                    return matchesId && (!status || ['Assigned', 'In Transit', 'On Site'].includes(status));
                });
            }
            return false;
        }) || null;
    };

    const activeAssignedPersonnel = personnel.filter(p => !!isPersonAssigned(p.user_id));
    const uniqueAssigned = activeAssignedPersonnel.length;
    const totalPersonnel = personnel.length;
    const availablePersonnelCount = Math.max(0, totalPersonnel - uniqueAssigned);

    const displayReportRequest = reportRequestCount;
    const displayOngoingReport = ongoingReportCount;

    // Holding Facility stats
    // Status IDs resolved/discharged in HoldingAnimal: 3: Claimed, 4: Deceased, 5: Transferred, 7: Adopted/Released, 8: Impounded
    const RESOLVED_HOLDING = [3, 4, 5, 7, 8];
    const activeHoldingAnimals = (facilityAnimals || []).filter(a => !RESOLVED_HOLDING.includes(a.facility_status));
    const rawDogsCount = activeHoldingAnimals.filter(a => (a.animal_type || a.report?.animal_type || '').toLowerCase().includes('dog')).length;
    const rawCatsCount = activeHoldingAnimals.filter(a => (a.animal_type || a.report?.animal_type || '').toLowerCase().includes('cat')).length;
    const animalsInFacilityCount = activeHoldingAnimals.length;
    const dogsCount = rawDogsCount;
    const catsCount = rawCatsCount;

    const holdingFacilities = facilities.filter(f => f.is_holding_facility);
    const totalCapacitySlots = holdingFacilities.reduce((acc, f) => acc + (f.capacity || 0), 0);
    const usedSlots = activeHoldingAnimals.length;
    const facilityCapacityPct = totalCapacitySlots > 0 ? Math.min(100, Math.round((usedSlots / totalCapacitySlots) * 100)) : 0;

    // Adoption stats
    const adoptionAnimalsList = (facilityAnimals || []).filter(a =>
        a.facility_status === 2 ||
        a.facility_status === 6 ||
        a.is_for_adoption ||
        (a.status_name || '').toLowerCase().includes('adopt') ||
        (a.facility_status_name || '').toLowerCase().includes('healthy')
    );
    const adoptionCount = adoptionAnimalsList.length;
    const rawAdoptionDogs = adoptionAnimalsList.filter(a => (a.animal_type || a.report?.animal_type || '').toLowerCase().includes('dog')).length;
    const rawAdoptionCats = adoptionAnimalsList.filter(a => (a.animal_type || a.report?.animal_type || '').toLowerCase().includes('cat')).length;
    const adoptionDogsCount = rawAdoptionDogs;
    const adoptionCatsCount = rawAdoptionCats;

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
        const currentStat = rep.status_id ?? rep.current_status_id;
        // 1. Official endorsement letter
        if (rep.endorsement_letter) return true;
        // 2. Has an associated rescue request
        if (rep.rescue_id || (rep.rescues && rep.rescues.length > 0)) return true;
        // 3. Status history indicates escalation to barangay (status 4) or rescue action
        if (rep.history?.some((h: any) => [4, 5, 6, 7, 8, 13].includes(h.report_status_id) || h.rescue_id)) return true;
        // 4. Status is an active Barangay operational phase
        if ([4, 5, 7, 8, 9, 13].includes(currentStat)) return true;
        // 5. Terminal statuses if handled by barangay staff or has rescue history
        if ([3, 6, 10, 11, 12, 14, 17, 18].includes(currentStat)) {
            if (rep.barangay_staff_id || rep.assigned_staff_id || rep.assigned_staff_name) return true;
            if (rep.rescues && rep.rescues.length > 0) return true;
            if (rep.history?.some((h: any) => [4, 5, 6, 7, 8, 13].includes(h.report_status_id) || h.rescue_id)) return true;
        }
        return false;
    };

    // Real database stray reports for the interactive map
    // Deduplicate by report_id to guarantee no duplicate markers
    const uniqueReportsMap = new Map<number, any>();
    reports.forEach((r: any) => {
        if (r && r.report_id && !uniqueReportsMap.has(r.report_id)) {
            uniqueReportsMap.set(r.report_id, r);
        }
    });
    const uniqueReports = Array.from(uniqueReportsMap.values());

    // Display active reported stray animals officially endorsed/escalated to Barangay
    const activeReports = uniqueReports.filter(r => {
        if (!r) return false;
        const lat = parseFloat(r.latitude);
        const lng = parseFloat(r.longitude);
        if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) return false;
        // Only active reports that are endorsed/escalated to the Barangay
        return isReportEscalated(r) && [4, 5, 7, 8, 9, 13].includes(r.status_id);
    });
    const assignedReportsCount = requests.filter(req => req.staff_id && [1, 2, 4, 5].includes(req.status_id)).length;
    const inProgressReportsCount = requests.filter(req => req.status_id === 4).length;
    const pickedUpReportsCount = reports.filter(r => isReportEscalated(r) && [7, 8, 9].includes(r.status_id)).length;
    const resolvedReportsCount = reports.filter(r => isReportEscalated(r) && [6, 11].includes(r.status_id)).length;

    const heatmapPoints: [number, number, number][] = activeReports
        .map((r: any) => [
            parseFloat(r.latitude),
            parseFloat(r.longitude),
            r.priority_level === 'High' ? 1.0 : 0.6
        ]);

    const currentBarangayName = barangayHq?.barangay_name || currentUser?.barangay_name || currentUser?.barangay || 'San Vicente';

    const hqCoords: [number, number] = (barangayHq?.hq_lat && barangayHq?.hq_lng)
        ? [parseFloat(barangayHq.hq_lat), parseFloat(barangayHq.hq_lng)]
        : [14.806906, 121.0039297];

    const mapMarkers = [
        {
            id: -1,
            lat: hqCoords[0],
            lng: hqCoords[1],
            title: `Barangay ${currentBarangayName} HQ`,
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

    const displayPersonnelList = personnel;

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
            if (diffDays === 1) return '1 day ago';
            return `${diffDays} days ago`;
        } catch {
            return 'Recently';
        }
    };

    // Only show incidents that were officially endorsed/escalated to the Barangay
    const endorsedReports = reports.filter(r => isReportEscalated(r));

    const sortedReports = [...endorsedReports].sort((a: any, b: any) => {
        const timeA = a.created_at ? new Date(a.created_at).getTime() : a.report_id;
        const timeB = b.created_at ? new Date(b.created_at).getTime() : b.report_id;
        return timeB - timeA;
    });

    const recentIncidents = sortedReports.slice(0, 5).map((r) => {
        const rawStatus = r.status?.status_name || getStatusName(r.status_id);
        const friendlyStatus = (r.status_id === 4 || r.status_id === 13) ? 'Endorsed'
            : (r.status_id === 5) ? 'In Progress'
            : (r.status_id === 7 || r.status_id === 8 || r.status_id === 9) ? 'Picked Up'
            : (r.status_id === 6 || r.status_id === 11) ? 'Resolved'
            : (r.status_id === 3) ? 'Rejected'
            : (r.status_id === 14) ? 'Dismissed'
            : rawStatus;

        const defaultLocation = barangayHq?.city ? `${currentBarangayName}, ${barangayHq.city}` : `${currentBarangayName}, Bulacan`;

        return {
            report_id: r.report_id,
            title: `${r.animal_type || 'Stray'} – ${r.landmark || r.subdivision?.subdivision_name || currentBarangayName}`,
            location: r.subdivision_name ? `${r.subdivision_name}, Bulacan` : (r.subdivision?.subdivision_name ? `${r.subdivision.subdivision_name}, Bulacan` : defaultLocation),
            status: friendlyStatus,
            statusColor: getStatusBadgeStyle(friendlyStatus),
            timeAgo: r.created_at ? formatTimeAgo(r.created_at) : 'Recently',
            image: (r.media && r.media.length > 0 && r.media[0].file_url)
                ? getPetPicture(r.media[0].file_url)
                : DEFAULT_PET_AVATAR
        };
    });

    const parsedUser = currentUser;
    const isHeadOfficer = Boolean(parsedUser?.is_head_officer);
    const staffName = parsedUser?.name || parsedUser?.full_name || (parsedUser?.first_name ? `${parsedUser.first_name} ${parsedUser.last_name || ''}`.trim() : (isHeadOfficer ? 'Head Officer Arriola' : 'Staff Officer'));

    const handleAssignSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!assignForm.rescueId || !assignForm.staffId) {
            setActionFeedback({ type: 'error', message: 'Please select both an incident and a responder to assign.' });
            return;
        }
        setIsSubmittingAssign(true);
        try {
            await api.patch(`/rescue-requests/${assignForm.rescueId}`, {
                barangay_staff_id: currentUser?.user_id,
                assigned_personnel_id: Number(assignForm.staffId),
                assigned_personnel_ids: [Number(assignForm.staffId)],
                remarks: assignForm.remarks || 'Responder dispatched via Barangay Dashboard',
                status_id: 5
            });
            setActionFeedback({ type: 'success', message: 'Personnel successfully dispatched to rescue mission!' });
            setIsAssignModalOpen(false);
            setAssignForm({ rescueId: 0, staffId: 0, remarks: '' });
            fetchDashboardData();
        } catch (err: any) {
            const msg = err.response?.data?.detail || 'Failed to dispatch personnel.';
            setActionFeedback({ type: 'error', message: msg });
        } finally {
            setIsSubmittingAssign(false);
        }
    };

    const handleUpdateIncidentSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!updateForm.rescueId) {
            setActionFeedback({ type: 'error', message: 'Please select an incident to update.' });
            return;
        }
        setIsSubmittingUpdate(true);
        try {
            await api.patch(`/rescue-requests/${updateForm.rescueId}`, {
                barangay_staff_id: currentUser?.user_id,
                status_id: Number(updateForm.statusId),
                remarks: updateForm.remarks || 'Status updated from Barangay Operations Dashboard'
            });
            setActionFeedback({ type: 'success', message: 'Incident status updated successfully!' });
            setIsUpdateIncidentModalOpen(false);
            setUpdateForm({ rescueId: 0, statusId: 5, remarks: '' });
            fetchDashboardData();
        } catch (err: any) {
            const msg = err.response?.data?.detail || 'Failed to update incident.';
            setActionFeedback({ type: 'error', message: msg });
        } finally {
            setIsSubmittingUpdate(false);
        }
    };

    const handleCommunityAlertSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!alertForm.title.trim() || !alertForm.content.trim()) {
            setActionFeedback({ type: 'error', message: 'Alert title and content are required.' });
            return;
        }
        setIsSubmittingAlert(true);
        try {
            await api.post('/announcements/', {
                created_by: currentUser?.user_id,
                barangay_id: currentUser?.barangay_id,
                title: alertForm.title.trim(),
                category: alertForm.category,
                content: alertForm.content.trim(),
                pinned: alertForm.pinned,
                expiration: alertForm.expiration ? new Date(alertForm.expiration).toISOString() : null,
                visibility: 'Public',
                status: 'Published'
            });
            setActionFeedback({ type: 'success', message: 'Community alert broadcasted successfully!' });
            setIsCommunityAlertModalOpen(false);
            setAlertForm({ title: '', category: 'Emergency', content: '', pinned: true, expiration: '' });
            fetchDashboardData();
        } catch (err: any) {
            const msg = err.response?.data?.detail || 'Failed to create community alert.';
            setActionFeedback({ type: 'error', message: msg });
        } finally {
            setIsSubmittingAlert(false);
        }
    };

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
                        <div className="flex items-center gap-1.5 sm:gap-2">
                            <div className="flex flex-col min-w-0">
                                <h1 className="text-xs sm:text-xl font-black text-gray-900 tracking-tight leading-none uppercase truncate">
                                    Barangay Operations
                                </h1>
                                <p className="text-[7.5px] sm:text-[9px] text-gray-400 font-extrabold uppercase tracking-wider mt-1 leading-none truncate max-w-[130px] min-[375px]:max-w-[170px] sm:max-w-none">
                                    Command Center & Field Operations for Brgy. {currentBarangayName}
                                </p>
                            </div>
                            {isHeadOfficer ? (
                                <span className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-full text-[8px] sm:text-[9px] font-black uppercase tracking-wider bg-purple-100 text-purple-800 border border-purple-200 shrink-0">
                                    ★ Head Officer
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-full text-[8px] sm:text-[9px] font-bold uppercase tracking-wider bg-teal-50 text-teal-700 border border-teal-200 shrink-0">
                                    Field Staff
                                </span>
                            )}
                        </div>
                    }
                />

                {/* SCROLLABLE AREA */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-5 lg:p-6 pb-32 lg:pb-6 flex flex-col gap-4 sm:gap-5 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent relative isolate">

                    {/* ========================================================================= */}
                    {/* ─── MOBILE LAYOUT (Exact Match to Picture on Mobile / Tablet) ─── */}
                    {/* ========================================================================= */}
                    <div className="block lg:hidden space-y-4">
                        {/* 1. Mobile Sky Blue Landscape Greeting Banner */}
                        <div className="bg-gradient-to-b from-[#E0F2FE] via-[#EBF8FF] to-[#D9F2FE] rounded-3xl p-4 sm:p-5 border border-sky-200/90 shadow-2xs relative overflow-hidden flex flex-col justify-between min-h-[140px]">
                            {/* SVG Layered Hills Silhouette Background */}
                            <div className="absolute inset-x-0 bottom-0 pointer-events-none opacity-40 overflow-hidden h-20">
                                <svg viewBox="0 0 500 120" preserveAspectRatio="none" className="w-full h-full">
                                    <path d="M0,120 L0,65 Q80,15 160,55 T320,35 T440,65 T500,45 L500,120 Z" fill="#93C5FD" opacity="0.6"/>
                                    <path d="M0,120 L0,85 Q100,40 200,75 T380,55 T500,80 L500,120 Z" fill="#86EFAC" opacity="0.5"/>
                                    <path d="M0,120 L0,100 Q140,70 260,90 T500,95 L500,120 Z" fill="#4ADE80" opacity="0.4"/>
                                </svg>
                            </div>

                            {/* Banner Content */}
                            <div className="relative z-10 flex items-start justify-between gap-2">
                                <div className="flex items-start gap-2.5 min-w-0 flex-1">
                                    <div className="text-3xl shrink-0 mt-0.5 filter drop-shadow-xs select-none">☀️</div>
                                    <div className="min-w-0 flex-1">
                                        <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight leading-snug">
                                            {getGreeting()},<br />
                                            <span className="text-slate-950 font-black">{staffName}!</span>
                                        </h2>
                                        <p className="text-xs sm:text-[13px] text-slate-800 font-bold leading-snug mt-1.5 max-w-[240px]">
                                            Here's the real-time operational overview for Barangay {currentBarangayName} today.
                                        </p>
                                    </div>
                                </div>

                                {/* Script slogan on right */}
                                <div className="text-right shrink-0 pt-0.5">
                                    <p className="text-[12px] min-[390px]:text-[13px] font-serif italic text-blue-700 font-black leading-tight tracking-tight rotate-[-4deg]">
                                        Safer<br />
                                        Communities,<br />
                                        <span className="text-blue-800">Happier Pets ❤️</span>
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* 2. Mobile 2x2 Grid of 4 Stat / KPI Cards */}
                        <div className="grid grid-cols-2 gap-3 shrink-0">
                            {/* Card 1: RESCUE REQUESTS */}
                            <div 
                                onClick={() => navigate('/brgy/rescue-requests')}
                                className="bg-white rounded-3xl p-3.5 border border-rose-100/90 shadow-2xs relative overflow-hidden flex flex-col justify-between hover:border-rose-300 active:scale-[0.98] transition-all cursor-pointer min-h-[148px]"
                            >
                                <span className="absolute -bottom-1 -right-1 text-3xl opacity-10 select-none pointer-events-none">🐾</span>
                                <div className="flex items-center justify-between gap-1.5">
                                    <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center shrink-0 border border-rose-100/60 shadow-2xs">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M12 2a1 1 0 011 1v1.07A8.001 8.001 0 0120 12v3a2 2 0 002 2v1H2v-1a2 2 0 002-2v-3a8.001 8.001 0 017-7.93V3a1 1 0 011-1zm-6 10v3h12v-3a6 6 0 10-12 0zm3 8a3 3 0 006 0H9z" />
                                        </svg>
                                    </div>
                                    <div className="w-6 h-6 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center shrink-0">
                                        <svg className="w-3.5 h-3.5 stroke-[2.5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                        </svg>
                                    </div>
                                </div>
                                <div className="mt-2 min-w-0">
                                    <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-wider truncate">RESCUE REQUESTS</h4>
                                    <p className="text-[10px] text-slate-700 font-bold leading-tight mt-0.5 truncate">Awaiting barangay dispatch</p>
                                    <p className="text-2xl font-black text-slate-900 mt-1 leading-none">{displayReportRequest}</p>
                                    <div className="mt-2 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-[9px] font-black uppercase shadow-2xs">
                                        <span>⏱️</span>
                                        <span className="truncate">Pending response</span>
                                    </div>
                                </div>
                            </div>

                            {/* Card 2: ON DUTY PERSONNEL */}
                            <div 
                                onClick={() => navigate('/brgy/personnel')}
                                className="bg-white rounded-3xl p-3.5 border border-blue-100/90 shadow-2xs relative overflow-hidden flex flex-col justify-between hover:border-blue-300 active:scale-[0.98] transition-all cursor-pointer min-h-[148px]"
                            >
                                <span className="absolute -bottom-1 -right-1 text-3xl opacity-10 select-none pointer-events-none">🐾</span>
                                <div className="flex items-center justify-between gap-1.5">
                                    <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100/60 shadow-2xs">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                            <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
                                        </svg>
                                    </div>
                                    <div className="w-6 h-6 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                                        <svg className="w-3.5 h-3.5 stroke-[2.5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                        </svg>
                                    </div>
                                </div>
                                <div className="mt-2 min-w-0">
                                    <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-wider truncate">ON DUTY PERSONNEL</h4>
                                    <p className="text-[10px] text-slate-700 font-bold leading-tight mt-0.5 truncate">Active field officers</p>
                                    <p className="text-2xl font-black text-slate-900 mt-1 leading-none">
                                        {availablePersonnelCount} <span className="text-sm font-bold text-slate-500">/ {totalPersonnel}</span>
                                    </p>
                                    <div className="mt-2 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[9px] font-black uppercase shadow-2xs">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                                        <span className="truncate">{availablePersonnelCount} available for call</span>
                                    </div>
                                </div>
                            </div>

                            {/* Card 3: ONGOING RESCUES */}
                            <div 
                                onClick={() => navigate('/brgy/rescue-requests')}
                                className="bg-white rounded-3xl p-3.5 border border-emerald-100/90 shadow-2xs relative overflow-hidden flex flex-col justify-between hover:border-emerald-300 active:scale-[0.98] transition-all cursor-pointer min-h-[148px]"
                            >
                                <span className="absolute -bottom-1 -right-1 text-3xl opacity-10 select-none pointer-events-none">🐾</span>
                                <div className="flex items-center justify-between gap-1.5">
                                    <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100/60 shadow-2xs">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                            <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                                            <path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1V5a1 1 0 00-1-1H3zM14 7a1 1 0 00-1 1v6.05A2.5 2.5 0 0115.95 16H17a1 1 0 001-1v-5a1 1 0 00-.293-.707l-2-2A1 1 0 0015 7h-1z" />
                                        </svg>
                                    </div>
                                    <div className="w-6 h-6 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                                        <svg className="w-3.5 h-3.5 stroke-[2.5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                        </svg>
                                    </div>
                                </div>
                                <div className="mt-2 min-w-0">
                                    <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-wider truncate">ONGOING RESCUES</h4>
                                    <p className="text-[10px] text-slate-700 font-bold leading-tight mt-0.5 truncate">Units deployed in field</p>
                                    <p className="text-2xl font-black text-slate-900 mt-1 leading-none">{displayOngoingReport}</p>
                                    <div className="mt-2 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[9px] font-black uppercase shadow-2xs">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                                        <span className="truncate">In progress</span>
                                    </div>
                                </div>
                            </div>

                            {/* Card 4: HOLDING FACILITY */}
                            <div 
                                onClick={() => navigate('/brgy/holding-facility')}
                                className="bg-white rounded-3xl p-3.5 border border-purple-100/90 shadow-2xs relative overflow-hidden flex flex-col justify-between hover:border-purple-300 active:scale-[0.98] transition-all cursor-pointer min-h-[148px]"
                            >
                                <span className="absolute -bottom-1 -right-1 text-3xl opacity-10 select-none pointer-events-none">🐾</span>
                                <div className="flex items-center justify-between gap-1.5">
                                    <div className="w-10 h-10 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0 border border-purple-100/60 shadow-2xs">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                            <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
                                        </svg>
                                    </div>
                                    <div className="w-6 h-6 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                                        <svg className="w-3.5 h-3.5 stroke-[2.5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                        </svg>
                                    </div>
                                </div>
                                <div className="mt-2 min-w-0">
                                    <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-wider truncate">HOLDING FACILITY</h4>
                                    <p className="text-[10px] text-slate-700 font-bold leading-tight mt-0.5 truncate">{dogsCount} dogs • {catsCount} cats</p>
                                    <div className="mt-3 flex items-baseline justify-between">
                                        <p className="text-2xl font-black text-slate-900 leading-none">{animalsInFacilityCount}</p>
                                        <span className="text-[9.5px] font-black text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200/80 shadow-2xs">
                                            {facilityCapacityPct}% Cap
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 3. Mobile Live Incident Map Card */}
                        <div className="bg-white rounded-3xl p-4 border border-slate-200/90 shadow-2xs flex flex-col gap-3">
                            {/* Map Header */}
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                    <div className="w-10 h-10 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0 border border-purple-100/60 shadow-2xs">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                                        </svg>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-sm sm:text-base font-black text-slate-900 tracking-tight leading-none">Live Incident Map</h3>
                                            <span className="px-2 py-0.5 rounded-full text-[8.5px] font-black uppercase bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-3xs">
                                                Live
                                            </span>
                                        </div>
                                        <p className="text-[11px] sm:text-xs text-slate-700 font-bold leading-tight mt-1 truncate">
                                            Real-time geo-tracking of incident alerts, field responders & barangay HQ.
                                        </p>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => setIsMapExpanded(true)}
                                    className="px-2.5 py-1.5 text-xs font-black text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-xl border border-purple-200 flex items-center gap-0.5 shrink-0 cursor-pointer shadow-2xs"
                                >
                                    <span>View All</span>
                                    <svg className="w-3.5 h-3.5 stroke-[2.5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                    </svg>
                                </button>
                            </div>

                            {/* Leaflet Map Canvas */}
                            <div className="w-full h-[320px] rounded-2xl overflow-hidden relative border border-slate-200/80 shadow-inner bg-slate-50">
                                <MapComponent
                                    center={hqCoords}
                                    zoom={15}
                                    showGeofence={true}
                                    showLandmarks={true}
                                    showHQ={true}
                                    showHoldingFacilities={true}
                                    onMapClick={(lat, lng) => setSelectedCoordinates({ lat, lng })}
                                    markers={mapMarkers}
                                    showHeatmap={false}
                                    onViewDetails={(marker) => setSelectedDetailReport(marker.rawData)}
                                />

                                {/* Status Legend Collapsible Toggle in Top-Right */}
                                <div className="absolute top-3 right-3 z-[990]">
                                    <div className="relative">
                                        <button
                                            type="button"
                                            onClick={() => setIsMobileLegendOpen(prev => !prev)}
                                            className="flex items-center gap-1.5 px-2.5 py-1 bg-white/95 hover:bg-white backdrop-blur-md rounded-xl border border-slate-200/90 shadow-md text-[9px] font-black uppercase tracking-wider text-slate-700 cursor-pointer active:scale-95 transition-all"
                                        >
                                            <span className="w-2 h-2 rounded-full bg-orange-500" />
                                            <span>Legend</span>
                                            <span className="text-[8px] text-slate-400">{isMobileLegendOpen ? '▲' : '▼'}</span>
                                        </button>

                                        {isMobileLegendOpen && (
                                            <div className="absolute top-full mt-1.5 right-0 bg-white/95 backdrop-blur-md p-2.5 rounded-2xl shadow-xl border border-slate-200/90 text-[9px] font-bold text-slate-700 flex flex-col gap-1 min-w-[110px] animate-in fade-in zoom-in-95 duration-150">
                                                <div className="text-[7.5px] font-black uppercase text-slate-400 tracking-wider mb-0.5">STATUS LEGEND</div>
                                                <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#EF4444] shadow-xs shrink-0" /><span>Pending</span></div>
                                                <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#F97316] shadow-xs shrink-0" /><span>Endorsed</span></div>
                                                <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#3B82F6] shadow-xs shrink-0" /><span>Assigned</span></div>
                                                <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#10B981] shadow-xs shrink-0" /><span>In Progress</span></div>
                                                <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#8B5CF6] shadow-xs shrink-0" /><span>Picked Up</span></div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 4. Mobile Rescue Insights Card */}
                        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/90 shadow-2xs flex flex-col gap-3">
                            {/* Header */}
                            <div className="flex items-center gap-2.5">
                                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-100/80 text-amber-600 border border-amber-200/60 flex items-center justify-center shrink-0 shadow-2xs">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M21.731 2.269a2.625 2.625 0 00-3.712 0l-1.157 1.157 3.712 3.712 1.157-1.157a2.625 2.625 0 000-3.712zM19.513 8.199l-3.712-3.712-12.15 12.15a5.25 5.25 0 00-1.32 2.214l-.8 2.685a.75.75 0 00.933.933l2.685-.8a5.25 5.25 0 002.214-1.32L19.513 8.2z" />
                                    </svg>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-sm sm:text-base font-black text-slate-900 tracking-tight leading-none">Rescue Insights</h3>
                                        <span className="text-[8.5px] font-black uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200/80 px-2 py-0.5 rounded-full shadow-3xs">
                                            AI Smart
                                        </span>
                                    </div>
                                    <p className="text-[11px] sm:text-xs text-slate-700 font-bold leading-tight mt-1 truncate">
                                        Dynamic response & capacity analytics
                                    </p>
                                </div>
                            </div>

                            {/* Insights List */}
                            <div className="flex flex-col gap-2.5">
                                {/* 1. SYSTEM STATUS */}
                                <div className="bg-[#FFF7ED] rounded-2xl p-3 border border-[#FFEDD5] flex items-start gap-2.5 shadow-2xs">
                                    <div className="w-8 h-8 rounded-xl bg-white text-[#EA580C] shadow-2xs border border-[#FED7AA] flex items-center justify-center shrink-0 mt-0.5">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                                        </svg>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[10px] font-black uppercase tracking-wider text-[#EA580C] leading-none">SYSTEM STATUS</p>
                                        <p className="text-xs font-semibold text-slate-800 leading-snug mt-1">
                                            {endorsedReports.filter(r => r.urgency === 'High' || r.urgency === 'Critical' || r.priority_level === 'High').length > 0
                                                ? `${endorsedReports.filter(r => r.urgency === 'High' || r.urgency === 'Critical' || r.priority_level === 'High').length} high-priority endorsed reports monitored in field.`
                                                : 'No high-priority active reports. System status normal and clear.'}
                                        </p>
                                    </div>
                                </div>

                                {/* 2. TEAMS READY */}
                                <div className="bg-[#ECFDF5] rounded-2xl p-3 border border-[#A7F3D0] flex items-start gap-2.5 shadow-2xs">
                                    <div className="w-8 h-8 rounded-xl bg-white text-[#059669] shadow-2xs border border-[#6EE7B7] flex items-center justify-center shrink-0 mt-0.5">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[10px] font-black uppercase tracking-wider text-[#059669] leading-none">TEAMS READY</p>
                                        <p className="text-xs font-semibold text-slate-800 leading-snug mt-1">
                                            {uniqueAssigned > 0 ? (
                                                <span>{uniqueAssigned} active dispatches. <strong className="text-[#059669] font-black">{availablePersonnelCount} officers</strong> on standby.</span>
                                            ) : (
                                                <span>No active dispatches. <strong className="text-[#059669] font-black">{availablePersonnelCount} officers</strong> on standby.</span>
                                            )}
                                        </p>
                                    </div>
                                </div>

                                {/* 3. STAFF CAPACITY */}
                                <div className="bg-[#EFF6FF] rounded-2xl p-3 border border-[#BFDBFE] flex items-start gap-2.5 shadow-2xs">
                                    <div className="w-8 h-8 rounded-xl bg-white text-[#2563EB] shadow-2xs border border-[#93C5FD] flex items-center justify-center shrink-0 mt-0.5">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[10px] font-black uppercase tracking-wider text-[#2563EB] leading-none">STAFF CAPACITY</p>
                                        <p className="text-xs font-semibold text-slate-800 leading-snug mt-1">
                                            <strong className="text-slate-950 font-black">{uniqueAssigned || 0} officers</strong> in field • <strong className="text-slate-950 font-black">{availablePersonnelCount} officers</strong> ready for dispatch.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 5. Mobile Personnel Status Section (Exact Match to Picture) */}
                        <div className="space-y-3">
                            {/* Header Card with Gradient, Badges, and Filter Pills */}
                            <div className="bg-gradient-to-br from-[#EBF6FF] via-[#F4F9FF] to-[#E5F2FF] rounded-[24px] p-4 sm:p-5 border border-blue-100/70 shadow-xs relative overflow-hidden flex flex-col gap-3.5">
                                {/* Faint Paw Watermark in Top Right */}
                                <span className="absolute top-2.5 right-3 text-4xl opacity-15 select-none pointer-events-none text-blue-400">🐾</span>

                                {/* Header Top: Icon + Title + Field Squad Badge */}
                                <div className="flex items-center gap-3 relative z-1">
                                    <div className="w-11 h-11 rounded-2xl bg-blue-100/90 text-blue-600 flex items-center justify-center shrink-0 shadow-2xs border border-blue-200/50">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                                            <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
                                        </svg>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <h3 className="text-base font-black text-[#1e3a8a] tracking-tight leading-none">
                                                Personnel Status
                                            </h3>
                                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-white/90 text-blue-600 border border-blue-200/90 shadow-3xs">
                                                <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                                                FIELD SQUAD
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-700 font-bold leading-tight mt-1">
                                            Real-time rescuer availability & field assignments.
                                        </p>
                                    </div>
                                </div>

                                {/* Filter Pills Row */}
                                <div className="flex items-center gap-2 overflow-x-auto scrollbar-none relative z-1 pt-0.5">
                                    <button
                                        onClick={() => setPersonnelFilter('all')}
                                        className={`px-4 py-1.5 rounded-full text-xs font-black transition-all cursor-pointer shrink-0 ${
                                            personnelFilter === 'all'
                                                ? 'bg-[#0f356b] text-white shadow-xs'
                                                : 'bg-white/90 text-slate-700 border border-slate-200/80 hover:bg-white shadow-3xs'
                                        }`}
                                    >
                                        All ({displayPersonnelList.length})
                                    </button>
                                    <button
                                        onClick={() => setPersonnelFilter('available')}
                                        className={`px-3.5 py-1.5 rounded-full text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                                            personnelFilter === 'available'
                                                ? 'bg-[#0f356b] text-white shadow-xs'
                                                : 'bg-white/90 text-slate-700 border border-slate-200/80 hover:bg-white shadow-3xs'
                                        }`}
                                    >
                                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                        Available ({availablePersonnelCount})
                                    </button>
                                    <button
                                        onClick={() => setPersonnelFilter('on_mission')}
                                        className={`px-3.5 py-1.5 rounded-full text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                                            personnelFilter === 'on_mission'
                                                ? 'bg-[#0f356b] text-white shadow-xs'
                                                : 'bg-white/90 text-slate-700 border border-slate-200/80 hover:bg-white shadow-3xs'
                                        }`}
                                    >
                                        <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                                        On Mission ({uniqueAssigned})
                                    </button>
                                </div>
                            </div>

                            {/* Personnel Individual Cards List */}
                            <div className="space-y-3">
                                {displayPersonnelList
                                    .filter((p) => {
                                        const activeRescue = isPersonAssigned(p.user_id);
                                        if (personnelFilter === 'available') return !activeRescue;
                                        if (personnelFilter === 'on_mission') return !!activeRescue;
                                        return true;
                                    }).length === 0 ? (
                                        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm text-center text-slate-400">
                                            <p className="font-bold text-xs text-slate-600">No personnel match this filter</p>
                                            <p className="text-[11px] text-slate-500 font-semibold mt-0.5">Officers registered to this barangay will appear here.</p>
                                        </div>
                                    ) : (
                                        displayPersonnelList
                                            .filter((p) => {
                                                const activeRescue = isPersonAssigned(p.user_id);
                                                if (personnelFilter === 'available') return !activeRescue;
                                                if (personnelFilter === 'on_mission') return !!activeRescue;
                                                return true;
                                            })
                                            .map((p) => {
                                                const activeRescue = isPersonAssigned(p.user_id);
                                                return (
                                                    <div
                                                        key={p.user_id}
                                                        onClick={() => navigate('/brgy/personnel')}
                                                        className="bg-white rounded-[24px] p-4 sm:p-5 border border-slate-100/90 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col gap-3 relative transition-all active:scale-[0.99] cursor-pointer hover:border-blue-200/80"
                                                    >
                                                        {/* Top Row: Avatar + Info + Status Pill & Chevron */}
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div className="flex items-center gap-3.5 min-w-0">
                                                                {/* Avatar with Status Dot Ring */}
                                                                <div className="relative shrink-0">
                                                                    <img
                                                                        src={getProfilePicture(p.profile_picture)}
                                                                        alt={p.name}
                                                                        className="w-12 h-12 rounded-full object-cover border-2 border-white shadow-xs"
                                                                        onError={(e) => { e.currentTarget.src = DEFAULT_AVATAR; }}
                                                                    />
                                                                    {/* Status dot on bottom-right of avatar */}
                                                                    <span className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-white ${activeRescue ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                                                                </div>

                                                                {/* Name, ID, Role */}
                                                                <div className="min-w-0">
                                                                    <h4 className="text-sm sm:text-base font-black text-slate-900 leading-tight truncate">
                                                                        {p.name}
                                                                    </h4>
                                                                    <p className="text-[11px] font-black text-slate-500 mt-0.5">
                                                                        ID #{p.user_id}
                                                                    </p>
                                                                    <div className="flex items-center gap-1.5 text-xs text-slate-700 font-bold mt-1">
                                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-blue-500/80 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                                                                            <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                                                                        </svg>
                                                                        <span className="truncate">{p.role || 'Barangay Staff'}</span>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* Status Badge + Arrow on Right */}
                                                            <div className="flex items-center gap-2 shrink-0">
                                                                {activeRescue ? (
                                                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-orange-50 text-amber-700 border border-orange-200 shadow-3xs">
                                                                        <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                                                                        DISPATCHED
                                                                    </span>
                                                                ) : (
                                                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-3xs">
                                                                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                                                        AVAILABLE
                                                                    </span>
                                                                )}
                                                                <svg className="w-4 h-4 text-slate-400 stroke-[2.5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                                                </svg>
                                                            </div>
                                                        </div>

                                                        {/* Bottom Info Bar: Phone + Case Details */}
                                                        <div className={`rounded-2xl p-2.5 px-3.5 flex items-center justify-between gap-2 border ${activeRescue ? 'bg-sky-50/60 border-sky-100/80' : 'bg-[#F0FDF4]/50 border-emerald-100/60'}`}>
                                                            {/* Left: Contact Phone */}
                                                            <div className="flex items-center gap-2 min-w-0">
                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-slate-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                                                                    <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                                                                </svg>
                                                                <span className="text-xs font-black text-slate-800 truncate font-mono">
                                                                    {p.contact_number || '09205556677'}
                                                                </span>
                                                            </div>

                                                            {/* Divider */}
                                                            <div className="h-4 w-px bg-slate-200/80 shrink-0" />

                                                            {/* Right: Case / Standby info */}
                                                            <div className="flex items-center justify-between gap-2 flex-1 min-w-0 pl-1">
                                                                <div className="flex items-center gap-2 min-w-0">
                                                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${activeRescue ? 'bg-blue-100/70 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>
                                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                                                                            <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                                                                        </svg>
                                                                    </div>
                                                                    <div className="min-w-0">
                                                                        {activeRescue ? (
                                                                            <>
                                                                                <p className="text-xs font-black text-blue-700 leading-tight truncate">
                                                                                    Case #{activeRescue.rescue_id}
                                                                                </p>
                                                                                <p className="text-[11px] text-slate-700 font-bold leading-tight truncate">
                                                                                    {activeRescue.report?.landmark || 'Active Dispatch Area'}
                                                                                </p>
                                                                            </>
                                                                        ) : (
                                                                            <p className="text-xs font-bold text-slate-600 italic truncate">
                                                                                Standby for dispatch
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                {/* Arrow / Navigation Airplane Icon */}
                                                                <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${activeRescue ? 'bg-sky-100/70 text-sky-600' : 'bg-slate-100 text-slate-400'}`}>
                                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                                                                        <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                                                                    </svg>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                    )}
                            </div>
                        </div>

                        {/* 6. Mobile Recent Incidents Card */}
                        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-100 shadow-sm flex flex-col gap-3">
                            {/* Header */}
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-rose-50 to-red-100/80 text-red-600 border border-red-200/60 flex items-center justify-center shrink-0 shadow-xs">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                        </svg>
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="text-sm font-black text-slate-900 tracking-tight leading-none">Recent Incidents</h3>
                                        <p className="text-[10px] text-slate-400 font-medium leading-tight mt-1 truncate">Latest community report feed</p>
                                    </div>
                                </div>

                                <button
                                    onClick={() => navigate('/brgy/rescue-requests')}
                                    className="px-2 py-1 text-xs font-black text-blue-600 hover:text-blue-800 flex items-center gap-0.5 shrink-0 cursor-pointer"
                                >
                                    <span>View All</span>
                                    <svg className="w-3.5 h-3.5 stroke-[2.5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                    </svg>
                                </button>
                            </div>

                            {/* Incidents List */}
                            <div className="space-y-2">
                                {recentIncidents.length === 0 ? (
                                    <div className="py-8 text-center text-slate-400">
                                        <p className="font-semibold text-xs text-slate-500">No Recent Incidents</p>
                                        <p className="text-[10px] text-slate-400 mt-0.5">Escalated community reports will appear here.</p>
                                    </div>
                                ) : (
                                    recentIncidents.map((incident) => (
                                        <div
                                            key={incident.report_id}
                                            onClick={() => navigate(`/brgy/reports/${incident.report_id}`)}
                                            className="flex items-center justify-between p-2.5 bg-[#F8FAFC] hover:bg-white rounded-2xl transition-all cursor-pointer border border-slate-100 active:scale-[0.99]"
                                        >
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <div className="w-11 h-11 rounded-xl overflow-hidden shrink-0 border border-slate-200 bg-slate-100">
                                                    <img
                                                        src={incident.image}
                                                        alt={incident.title}
                                                        className="w-full h-full object-cover"
                                                        onError={(e) => { e.currentTarget.src = DEFAULT_PET_AVATAR; }}
                                                    />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-xs font-black text-slate-900 truncate leading-snug">
                                                        {incident.title}
                                                    </p>
                                                    <p className="text-[10px] text-slate-400 font-medium flex items-center gap-1 mt-0.5 truncate">
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 shrink-0 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
                                                            <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                                                        </svg>
                                                        <span className="truncate">{incident.location}</span>
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
                                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black border ${incident.statusColor}`}>
                                                    {incident.status}
                                                </span>
                                                <span className="text-[9px] font-semibold text-slate-400">
                                                    {incident.timeAgo}
                                                </span>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>

                    {/* ========================================================================= */}
                    {/* ─── DESKTOP WORKSPACE (Unchanged & Preserved for lg: and Above) ─── */}
                    {/* ========================================================================= */}
                    <div className="hidden lg:flex flex-col gap-5">
                        {/* 1. Greeting Hero Banner */}
                        <div className="bg-gradient-to-r from-white via-purple-50/25 to-white rounded-3xl py-7 px-7 sm:px-9 border border-purple-100/80 shadow-[0_4px_24px_rgba(168,85,247,0.04)] flex flex-col sm:flex-row items-center justify-between gap-5 relative overflow-hidden group hover:shadow-[0_8px_30px_rgba(168,85,247,0.12)] hover:border-purple-200 transition-all duration-300 min-h-[110px]">
                            {/* Decorative background glow */}
                            <div className="absolute -right-10 -top-10 w-72 h-72 bg-purple-500/20 rounded-full blur-3xl pointer-events-none group-hover:bg-purple-500/30 transition-all duration-500" />
                            <div className="absolute -left-10 -bottom-10 w-72 h-72 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none group-hover:bg-indigo-500/25 transition-all duration-500" />
                            <div className="absolute right-1/4 top-1/2 -translate-y-1/2 w-64 h-32 bg-purple-400/15 rounded-full blur-2xl pointer-events-none" />

                            <div className="relative z-1 w-full sm:w-auto">
                            <div className="flex items-center gap-2.5">
                                <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                                    {getGreeting()}, {staffName}!
                                </h2>
                                {isHeadOfficer ? (
                                    <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-purple-100/80 text-purple-700 border border-purple-300/80 shadow-xs">
                                        <span className="w-2 h-2 rounded-full bg-purple-600 animate-pulse" />
                                        Head Officer
                                    </span>
                                ) : (
                                    <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 shadow-xs">
                                        <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                                        Field Staff
                                    </span>
                                )}
                            </div>
                            <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">
                                Here's the real-time operational overview for Barangay {currentBarangayName} today.
                            </p>
                        </div>

                        {/* Banner Right Motto */}
                        <div className="hidden lg:flex items-center gap-3 relative z-1 bg-gradient-to-r from-purple-50/90 via-indigo-50/80 to-blue-50/90 px-6 py-3.5 rounded-2xl border border-purple-200/80 shadow-xs hover:scale-[1.02] transition-transform duration-300">
                            <div className="text-right">
                                <span className="text-xs font-serif italic text-purple-950 font-bold block leading-tight">
                                    Safer Neighborhoods
                                </span>
                                <span className="text-xs font-serif italic text-purple-600 font-bold block leading-tight mt-0.5">
                                    Stronger Communities
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* STATS ROW (5 CARDS) */}
                    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 sm:gap-4">

                        {/* 1. Pending Rescue Requests */}
                        <div
                            onClick={() => navigate('/brgy/rescue-requests')}
                            className="bg-white rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col justify-between min-h-[145px] sm:min-h-[174px] transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-[0_16px_36px_-6px_rgba(239,68,68,0.18)] hover:border-red-200 cursor-pointer group relative overflow-hidden active:scale-[0.98] before:absolute before:top-0 before:left-6 before:right-6 before:h-[3px] before:rounded-full before:bg-gradient-to-r before:from-red-500 before:to-rose-400 before:opacity-0 group-hover:before:opacity-100 before:transition-all before:duration-300"
                        >
                            <div className="flex items-start justify-between gap-1.5 sm:gap-2">
                                <div className="min-w-0 flex-1">
                                    <h3 className="text-[11px] sm:text-xs font-black text-slate-900 uppercase tracking-wider group-hover:text-red-600 transition-colors leading-snug">
                                        Rescue Requests
                                    </h3>
                                    <p className="text-[9.5px] sm:text-[11px] text-slate-500 font-medium mt-0.5 leading-tight">Awaiting barangay dispatch</p>
                                </div>
                                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full sm:rounded-2xl bg-gradient-to-br from-red-50 to-rose-100/80 text-red-500 flex items-center justify-center shrink-0 border border-red-200/60 shadow-2xs group-hover:scale-110 group-hover:rotate-6 transition-all duration-300">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-4.5 sm:w-4.5" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                    </svg>
                                </div>
                            </div>
                            <div className="mt-2 sm:mt-3">
                                <p className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight leading-none group-hover:text-red-600 group-hover:scale-105 origin-left transition-all duration-300">
                                    {displayReportRequest}
                                </p>
                                <div className="mt-2 sm:mt-2.5 pt-1.5 sm:pt-2.5 border-t border-slate-100 flex items-center gap-1.5 text-[9.5px] sm:text-[11px] font-bold text-red-600">
                                    <span className="inline-flex items-center justify-center w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-red-100 text-red-700 text-[8px] sm:text-[9px] shrink-0 font-black">!</span>
                                    <span className="leading-tight">Pending response</span>
                                </div>
                            </div>
                        </div>

                        {/* 2. On Duty Personnel */}
                        <div
                            onClick={() => navigate('/brgy/personnel')}
                            className="bg-white rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col justify-between min-h-[145px] sm:min-h-[174px] transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-[0_16px_36px_-6px_rgba(59,130,246,0.18)] hover:border-blue-200 cursor-pointer group relative overflow-hidden active:scale-[0.98] before:absolute before:top-0 before:left-6 before:right-6 before:h-[3px] before:rounded-full before:bg-gradient-to-r before:from-blue-500 before:to-indigo-400 before:opacity-0 group-hover:before:opacity-100 before:transition-all before:duration-300"
                        >
                            <div className="flex items-start justify-between gap-1.5 sm:gap-2">
                                <div className="min-w-0 flex-1">
                                    <h3 className="text-[11px] sm:text-xs font-black text-slate-900 uppercase tracking-wider group-hover:text-blue-600 transition-colors leading-snug">
                                        On Duty Personnel
                                    </h3>
                                    <p className="text-[9.5px] sm:text-[11px] text-slate-500 font-medium mt-0.5 leading-tight">Active field officers</p>
                                </div>
                                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full sm:rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-100/80 text-blue-600 flex items-center justify-center shrink-0 border border-blue-200/60 shadow-2xs group-hover:scale-110 group-hover:-rotate-6 transition-all duration-300">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-4.5 sm:w-4.5" viewBox="0 0 20 20" fill="currentColor">
                                        <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
                                    </svg>
                                </div>
                            </div>
                            <div className="mt-2 sm:mt-3">
                                <p className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight leading-none group-hover:text-blue-600 group-hover:scale-105 origin-left transition-all duration-300">
                                    {availablePersonnelCount} <span className="text-base sm:text-xl font-normal text-slate-400">/ {totalPersonnel}</span>
                                </p>
                                <div className="mt-2 sm:mt-2.5 pt-1.5 sm:pt-2.5 border-t border-slate-100 flex items-center gap-1.5 text-[9.5px] sm:text-[11px] font-bold text-blue-600">
                                    <span className="inline-flex items-center justify-center w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-blue-100 text-blue-700 text-[8px] sm:text-[9px] shrink-0 font-black">✓</span>
                                    <span className="leading-tight">{availablePersonnelCount} available for call</span>
                                </div>
                            </div>
                        </div>

                        {/* 3. Ongoing Rescues */}
                        <div
                            onClick={() => navigate('/brgy/rescue-requests')}
                            className="bg-white rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col justify-between min-h-[145px] sm:min-h-[174px] transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-[0_16px_36px_-6px_rgba(16,185,129,0.18)] hover:border-emerald-200 cursor-pointer group relative overflow-hidden active:scale-[0.98] before:absolute before:top-0 before:left-6 before:right-6 before:h-[3px] before:rounded-full before:bg-gradient-to-r before:from-emerald-500 before:to-teal-400 before:opacity-0 group-hover:before:opacity-100 before:transition-all before:duration-300"
                        >
                            <div className="flex items-start justify-between gap-1.5 sm:gap-2">
                                <div className="min-w-0 flex-1">
                                    <h3 className="text-[11px] sm:text-xs font-black text-slate-900 uppercase tracking-wider group-hover:text-emerald-600 transition-colors leading-snug">
                                        Ongoing Rescues
                                    </h3>
                                    <p className="text-[9.5px] sm:text-[11px] text-slate-500 font-medium mt-0.5 leading-tight">Units deployed in field</p>
                                </div>
                                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full sm:rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-100/80 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-200/60 shadow-2xs group-hover:scale-110 group-hover:rotate-6 transition-all duration-300">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-4.5 sm:w-4.5" viewBox="0 0 20 20" fill="currentColor">
                                        <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                                        <path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1V5a1 1 0 00-1-1H3zM14 7a1 1 0 00-1 1v6.05A2.5 2.5 0 0115.95 16H17a1 1 0 001-1v-5a1 1 0 00-.293-.707l-2-2A1 1 0 0015 7h-1z" />
                                    </svg>
                                </div>
                            </div>
                            <div className="mt-2 sm:mt-3">
                                <p className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight leading-none group-hover:text-emerald-600 group-hover:scale-105 origin-left transition-all duration-300">
                                    {displayOngoingReport}
                                </p>
                                <div className="mt-2 sm:mt-2.5 pt-1.5 sm:pt-2.5 border-t border-slate-100 flex items-center gap-1.5 text-[9.5px] sm:text-[11px] font-bold text-emerald-600">
                                    <span className="relative flex h-2 w-2 shrink-0">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                    </span>
                                    <span className="leading-tight">In progress</span>
                                </div>
                            </div>
                        </div>

                        {/* 4. Animals in Facility & Capacity */}
                        <div
                            onClick={() => navigate('/brgy/holding-facility')}
                            className="bg-white rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col justify-between min-h-[145px] sm:min-h-[174px] transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-[0_16px_36px_-6px_rgba(147,51,234,0.18)] hover:border-purple-200 cursor-pointer group relative overflow-hidden active:scale-[0.98] before:absolute before:top-0 before:left-6 before:right-6 before:h-[3px] before:rounded-full before:bg-gradient-to-r before:from-purple-500 before:to-violet-400 before:opacity-0 group-hover:before:opacity-100 before:transition-all before:duration-300"
                        >
                            <div className="flex items-start justify-between gap-1.5 sm:gap-2">
                                <div className="min-w-0 flex-1">
                                    <h3 className="text-[11px] sm:text-xs font-black text-slate-900 uppercase tracking-wider group-hover:text-purple-600 transition-colors leading-snug">
                                        Holding Facility
                                    </h3>
                                    <p className="text-[9.5px] sm:text-[11px] text-slate-500 font-medium mt-0.5 leading-tight">{dogsCount} dogs • {catsCount} cats</p>
                                </div>
                                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full sm:rounded-2xl bg-gradient-to-br from-purple-50 to-violet-100/80 text-purple-600 flex items-center justify-center shrink-0 border border-purple-200/60 shadow-2xs group-hover:scale-110 group-hover:-rotate-6 transition-all duration-300">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-4.5 sm:w-4.5" viewBox="0 0 20 20" fill="currentColor">
                                        <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
                                    </svg>
                                </div>
                            </div>
                            <div className="mt-2 sm:mt-3">
                                <div className="flex items-baseline justify-between gap-1">
                                    <p className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight leading-none group-hover:text-purple-600 group-hover:scale-105 origin-left transition-all duration-300">
                                        {animalsInFacilityCount}
                                    </p>
                                    <span className="text-[9px] sm:text-[10px] font-extrabold uppercase tracking-wider text-purple-600 bg-purple-50 px-1.5 sm:px-2 py-0.5 rounded-full border border-purple-200/60 shrink-0">
                                        {facilityCapacityPct}% Cap
                                    </span>
                                </div>
                                <div className="mt-2 sm:mt-2.5 pt-1.5 sm:pt-2.5 border-t border-slate-100">
                                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden shadow-inner">
                                        <div
                                            className="bg-gradient-to-r from-purple-500 to-indigo-500 h-full rounded-full transition-all duration-1000 ease-out shadow-xs"
                                            style={{ width: `${Math.min(100, facilityCapacityPct)}%` }}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 5. Animals Up for Adoption */}
                        <div
                            onClick={() => navigate('/brgy/adoptions')}
                            className="bg-white rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col justify-between min-h-[145px] sm:min-h-[174px] transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-[0_16px_36px_-6px_rgba(245,158,11,0.18)] hover:border-amber-200 cursor-pointer group relative overflow-hidden active:scale-[0.98] before:absolute before:top-0 before:left-6 before:right-6 before:h-[3px] before:rounded-full before:bg-gradient-to-r before:from-amber-500 before:to-orange-400 before:opacity-0 group-hover:before:opacity-100 before:transition-all before:duration-300"
                        >
                            <div className="flex items-start justify-between gap-1.5 sm:gap-2">
                                <div className="min-w-0 flex-1">
                                    <h3 className="text-[11px] sm:text-xs font-black text-slate-900 uppercase tracking-wider group-hover:text-amber-600 transition-colors leading-snug">
                                        Up for Adoption
                                    </h3>
                                    <p className="text-[9.5px] sm:text-[11px] text-slate-500 font-medium mt-0.5 leading-tight">Ready for loving homes</p>
                                </div>
                                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full sm:rounded-2xl bg-gradient-to-br from-amber-50 to-orange-100/80 text-amber-500 flex items-center justify-center shrink-0 border border-amber-200/60 shadow-2xs group-hover:scale-110 group-hover:rotate-6 transition-all duration-300">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-4.5 sm:w-4.5" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
                                    </svg>
                                </div>
                            </div>
                            <div className="mt-2 sm:mt-3">
                                <p className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight leading-none group-hover:text-amber-600 group-hover:scale-105 origin-left transition-all duration-300">
                                    {adoptionCount}
                                </p>
                                <div className="mt-2 sm:mt-2.5 pt-1.5 sm:pt-2.5 border-t border-slate-100 flex items-center gap-1.5 text-[9.5px] sm:text-[11px] font-bold text-amber-600">
                                    <span className="inline-flex items-center justify-center w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-amber-100 text-amber-700 text-[8px] sm:text-[9px] shrink-0 font-black">♥</span>
                                    <span className="leading-tight">{adoptionDogsCount} dogs • {adoptionCatsCount} cats</span>
                                </div>
                            </div>
                        </div>

                    </div>

                    {/* UPPER WORKSPACE: MAP & SIDE PANELS (QUICK ACTIONS + RECENT INCIDENTS) */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

                        {/* LEFT COLUMN (COL-SPAN-8): LIVE INCIDENT MAP */}
                        <div className="lg:col-span-8 flex flex-col">
                            <div className="bg-white rounded-[28px] shadow-[0_4px_24px_rgba(0,0,0,0.02)] border border-slate-100/90 p-5 sm:p-6 relative transition-all duration-300 hover:shadow-xl hover:shadow-slate-100/80 flex-1 flex flex-col group/mapcard">
                                {/* Header */}
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3.5 mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-11 h-11 bg-gradient-to-br from-teal-500/15 via-teal-500/10 to-emerald-500/10 text-[#1A4543] rounded-[16px] flex items-center justify-center shadow-xs border border-teal-200/50 shrink-0">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                                            </svg>
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-[18px] font-black text-slate-900 tracking-tight leading-tight">Live Incident Map</h3>
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9.5px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-2xs">
                                                    <span className="relative flex h-2 w-2">
                                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                                    </span>
                                                    Live
                                                </span>
                                            </div>
                                            <p className="text-[12px] font-normal text-slate-400 mt-0.5">Real-time geo-tracking of incident alerts, field responders & barangay HQ</p>
                                        </div>
                                    </div>

                                    {/* Inline Status Legend Pills */}
                                    <div className="hidden xl:flex flex-wrap items-center gap-1.5 text-[10px] font-bold text-slate-600">
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50/90 border border-red-200/60 text-red-700 shadow-2xs">
                                            <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444] shadow-xs"></span>Pending
                                        </span>
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange-50/90 border border-orange-200/60 text-orange-700 shadow-2xs">
                                            <span className="w-1.5 h-1.5 rounded-full bg-[#F97316] shadow-xs"></span>Endorsed
                                        </span>
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50/90 border border-blue-200/60 text-blue-700 shadow-2xs">
                                            <span className="w-1.5 h-1.5 rounded-full bg-[#3B82F6] shadow-xs"></span>Assigned
                                        </span>
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50/90 border border-emerald-200/60 text-emerald-700 shadow-2xs">
                                            <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] shadow-xs"></span>In Progress
                                        </span>
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-50/90 border border-purple-200/60 text-purple-700 shadow-2xs">
                                            <span className="w-1.5 h-1.5 rounded-full bg-[#8B5CF6] shadow-xs"></span>Picked Up
                                        </span>
                                    </div>
                                </div>

                                {/* Leaflet Map Canvas */}
                                <div className="w-full flex-1 min-h-[420px] rounded-[22px] overflow-hidden relative border border-slate-200/70 shadow-inner bg-slate-50">
                                    <MapComponent
                                        center={hqCoords}
                                        zoom={15}
                                        showGeofence={true}
                                        showLandmarks={true}
                                        showHQ={true}
                                        showHoldingFacilities={true}
                                        onMapClick={(lat, lng) => setSelectedCoordinates({ lat, lng })}
                                        markers={mapMode !== 'heatmap' ? mapMarkers : mapMarkers.filter(m => m.id < 0)}
                                        showHeatmap={mapMode !== 'pins'}
                                        heatmapPoints={heatmapPoints}
                                        onViewDetails={(marker) => setSelectedDetailReport(marker.rawData)}
                                        routing={isNavigating && selectedReport ? {
                                            start: (navSource === 'hq' || navSource === 'brgy') ? hqCoords : (userLocation || hqCoords),
                                            end: [parseFloat(selectedReport.latitude || selectedReport.lat), parseFloat(selectedReport.longitude || selectedReport.lng)],
                                            waypointNames: [(navSource === 'hq' || navSource === 'brgy') ? `Barangay ${currentBarangayName} HQ` : "Your Location", selectedReport.landmark || selectedReport.title],
                                            onClose: () => setIsNavigating(false)
                                        } : undefined}
                                        onMarkerClick={(m) => {
                                            if (m.id === -1 || m.id === -999) {
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

                                    {/* Floating Clicked Coordinates Display Badge */}
                                    {selectedCoordinates && (
                                        <div className="absolute bottom-4 left-4 z-[1000] bg-white/95 backdrop-blur-md px-4 py-3 rounded-2xl shadow-xl border border-amber-200/90 text-xs text-slate-800 flex items-start gap-3 transition-all animate-in fade-in slide-in-from-bottom-2 duration-300">
                                            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                                                </svg>
                                            </div>
                                            <div className="min-w-0">
                                                <div className="flex items-center justify-between gap-4">
                                                    <p className="text-[10px] font-black uppercase tracking-wider text-amber-700 leading-none">Selected Location</p>
                                                    <button 
                                                        onClick={() => setSelectedCoordinates(null)} 
                                                        className="text-slate-400 hover:text-slate-600 text-xs font-bold leading-none cursor-pointer p-0.5"
                                                        title="Clear Pin"
                                                    >
                                                        ✕
                                                    </button>
                                                </div>
                                                <div className="space-y-0.5 mt-1.5 font-mono text-[11px] text-slate-700">
                                                    <p><span className="font-semibold text-slate-900">Latitude:</span> {selectedCoordinates.lat.toFixed(6)}</p>
                                                    <p><span className="font-semibold text-slate-900">Longitude:</span> {selectedCoordinates.lng.toFixed(6)}</p>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Active Route Floating Banner */}
                                    {isNavigating && selectedReport && (
                                        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-3 px-4 py-2 bg-[#1A4543]/95 backdrop-blur-md text-white rounded-2xl shadow-xl border border-teal-500/30 text-xs font-semibold animate-in fade-in slide-in-from-top-2 duration-300">
                                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                                            <span className="truncate max-w-[200px] sm:max-w-[300px]">
                                                Routing to: <strong className="text-teal-200">{selectedReport.landmark || selectedReport.title || 'Incident Location'}</strong>
                                            </span>
                                            <button
                                                onClick={() => setIsNavigating(false)}
                                                className="ml-1 p-1 hover:bg-white/20 rounded-lg transition-colors cursor-pointer text-slate-200 hover:text-white"
                                                title="Close Route"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    )}

                                    {/* Overlay Controls in top right of map */}
                                    <div className="absolute top-3 right-3 z-[1000] flex items-center gap-2">
                                        {/* Active markers counter pill */}
                                        <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-white/90 backdrop-blur-md rounded-2xl border border-white/80 shadow-md text-[10px] font-black text-slate-700">
                                            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                            <span>{mapMarkers.length} Active Pins</span>
                                        </div>

                                        <div className="flex bg-white/90 backdrop-blur-md p-1 rounded-2xl text-[10px] font-black uppercase border border-white/80 shadow-md">
                                            <button
                                                onClick={() => setMapMode('pins')}
                                                className={`px-3 py-1.5 rounded-xl transition-all duration-200 cursor-pointer ${mapMode === 'pins' ? 'bg-[#1A4543] text-white shadow-sm font-black' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100/60'}`}
                                            >
                                                Pins
                                            </button>
                                            <button
                                                onClick={() => setMapMode('heatmap')}
                                                className={`px-3 py-1.5 rounded-xl transition-all duration-200 cursor-pointer ${mapMode === 'heatmap' ? 'bg-[#1A4543] text-white shadow-sm font-black' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100/60'}`}
                                            >
                                                Heatmap
                                            </button>
                                            <button
                                                onClick={() => setMapMode('both')}
                                                className={`px-3 py-1.5 rounded-xl transition-all duration-200 cursor-pointer ${mapMode === 'both' ? 'bg-[#1A4543] text-white shadow-sm font-black' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100/60'}`}
                                            >
                                                Both
                                            </button>
                                        </div>

                                        <button
                                            onClick={() => setIsMapExpanded(true)}
                                            className="p-2.5 bg-white/90 hover:bg-white text-slate-700 hover:text-[#1A4543] rounded-2xl border border-white/80 shadow-md transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer"
                                            title="Expand Map"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h3a1 1 0 010 2H5v2a1 1 0 01-2 0V4zm14 0a1 1 0 00-1-1h-3a1 1 0 110 2h2v2a1 1 0 112 0V4zM3 16a1 1 0 001 1h3a1 1 0 100-2H5v-2a1 1 0 10-2 0v3zm14 0a1 1 0 01-1 1h-3a1 1 0 100-2h2v-2a1 1 0 102 0v3z" />
                                            </svg>
                                        </button>
                                    </div>

                                    {/* Overlay Status Legend in bottom left (Glass Card) */}
                                    <div className="absolute bottom-4 left-4 z-[1000]">
                                        <div className="bg-white/90 backdrop-blur-md p-3.5 rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.08)] border border-white/80 text-[10.5px] font-bold text-slate-700 flex flex-col gap-1.5 min-w-[125px] transition-all hover:scale-105 duration-200">
                                            <div className="text-[9px] font-black uppercase text-slate-400 tracking-wider mb-1">Status Legend</div>
                                            <div className="flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-[#EF4444] shadow-xs" />
                                                <span className="font-semibold text-slate-700">Pending</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-[#F97316] shadow-xs" />
                                                <span className="font-semibold text-slate-700">Endorsed</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-[#3B82F6] shadow-xs" />
                                                <span className="font-semibold text-slate-700">Assigned</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-[#10B981] shadow-xs" />
                                                <span className="font-semibold text-slate-700">In Progress</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-[#8B5CF6] shadow-xs" />
                                                <span className="font-semibold text-slate-700">Picked Up</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* RIGHT COLUMN (COL-SPAN-4): QUICK ACTIONS & RESCUE INSIGHTS */}
                        <div className="lg:col-span-4 flex flex-col gap-4">

                            {/* QUICK ACTIONS CARD */}
                            <div className="bg-white rounded-[28px] shadow-[0_4px_24px_rgba(0,0,0,0.02)] border border-slate-100/80 p-5 sm:p-6 transition-all duration-300 hover:shadow-xl hover:shadow-slate-100/80 group/card relative">
                                {/* Header */}
                                <div className="flex items-center gap-3.5 mb-5">
                                    <div className="w-11 h-11 rounded-full bg-[#EBF3FE] text-[#2563EB] flex items-center justify-center shrink-0 shadow-xs">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                                        </svg>
                                    </div>
                                    <div>
                                        <h3 className="text-[18px] font-bold text-slate-800 tracking-tight leading-tight">Quick Actions</h3>
                                        <p className="text-[12px] text-slate-400 font-normal leading-none mt-1">Fast field dispatch and notice shortcuts</p>
                                    </div>
                                </div>

                                {/* 2x2 Grid Actions */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                                    {/* Action 1: Rescue Requests */}
                                    <button
                                        onClick={() => navigate('/brgy/rescue-requests')}
                                        className="flex items-center justify-between p-3.5 sm:p-4 bg-[#F8FAFC] hover:bg-white rounded-[22px] border border-slate-100/60 hover:border-red-100 shadow-[0_1px_3px_rgba(0,0,0,0.01)] hover:shadow-[0_8px_20px_rgba(239,68,68,0.08)] hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-200 group text-left cursor-pointer"
                                    >
                                        <div className="flex items-center gap-3.5 min-w-0">
                                            <div className="w-12 h-12 rounded-[18px] border border-[#FECACA] bg-[#FEF2F2] text-[#EF4444] flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                                </svg>
                                            </div>
                                            <div className="min-w-0">
                                                <span className="text-[13.5px] font-bold text-slate-800 leading-tight block group-hover:text-red-600 transition-colors">Rescue Requests</span>
                                                <span className="text-[11px] text-slate-400 font-normal leading-none block mt-1">Tickets & calls</span>
                                            </div>
                                        </div>
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-[#EF4444] transition-transform duration-200 group-hover:translate-x-1 shrink-0 ml-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                        </svg>
                                    </button>

                                    {/* Action 2: Assign Personnel */}
                                    <button
                                        onClick={() => setIsAssignModalOpen(true)}
                                        className="flex items-center justify-between p-3.5 sm:p-4 bg-[#F8FAFC] hover:bg-white rounded-[22px] border border-slate-100/60 hover:border-blue-100 shadow-[0_1px_3px_rgba(0,0,0,0.01)] hover:shadow-[0_8px_20px_rgba(59,130,246,0.08)] hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-200 group text-left cursor-pointer"
                                    >
                                        <div className="flex items-center gap-3.5 min-w-0">
                                            <div className="w-12 h-12 rounded-[18px] border border-[#BFDBFE] bg-[#EFF6FF] text-[#3B82F6] flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                    <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
                                                </svg>
                                            </div>
                                            <div className="min-w-0">
                                                <span className="text-[13.5px] font-bold text-slate-800 leading-tight block group-hover:text-blue-600 transition-colors">Assign Personnel</span>
                                                <span className="text-[11px] text-slate-400 font-normal leading-none block mt-1">Rescuer dispatch</span>
                                            </div>
                                        </div>
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-[#3B82F6] transition-transform duration-200 group-hover:translate-x-1 shrink-0 ml-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                        </svg>
                                    </button>

                                    {/* Action 3: Update Incident */}
                                    <button
                                        onClick={() => setIsUpdateIncidentModalOpen(true)}
                                        className="flex items-center justify-between p-3.5 sm:p-4 bg-[#F8FAFC] hover:bg-white rounded-[22px] border border-slate-100/60 hover:border-emerald-100 shadow-[0_1px_3px_rgba(0,0,0,0.01)] hover:shadow-[0_8px_20px_rgba(168,85,247,0.08)] hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-200 group text-left cursor-pointer"
                                    >
                                        <div className="flex items-center gap-3.5 min-w-0">
                                            <div className="w-12 h-12 rounded-[18px] border border-[#A7F3D0] bg-[#ECFDF5] text-[#10B981] flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                                </svg>
                                            </div>
                                            <div className="min-w-0">
                                                <span className="text-[13.5px] font-bold text-slate-800 leading-tight block group-hover:text-emerald-600 transition-colors">Update Incident</span>
                                                <span className="text-[11px] text-slate-400 font-normal leading-none block mt-1">Logs & outcomes</span>
                                            </div>
                                        </div>
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-[#10B981] transition-transform duration-200 group-hover:translate-x-1 shrink-0 ml-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                        </svg>
                                    </button>

                                    {/* Action 4: Community Alert */}
                                    <button
                                        onClick={() => setIsCommunityAlertModalOpen(true)}
                                        className="flex items-center justify-between p-3.5 sm:p-4 bg-[#F8FAFC] hover:bg-white rounded-[22px] border border-slate-100/60 hover:border-purple-100 shadow-[0_1px_3px_rgba(0,0,0,0.01)] hover:shadow-[0_8px_20px_rgba(168,85,247,0.08)] hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-200 group text-left cursor-pointer"
                                    >
                                        <div className="flex items-center gap-3.5 min-w-0">
                                            <div className="w-12 h-12 rounded-[18px] border border-[#E9D5FF] bg-[#FAF5FF] text-[#A855F7] flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M18 3a1 1 0 00-1.447-.894L8.763 6H5a3 3 0 000 6h.28l1.771 5.316A1 1 0 008 18h1a1 1 0 001-1v-4.382l6.553 3.276A1 1 0 0018 15V3z" clipRule="evenodd" />
                                                </svg>
                                            </div>
                                            <div className="min-w-0">
                                                <span className="text-[13.5px] font-bold text-slate-800 leading-tight block group-hover:text-purple-600 transition-colors">Community Alert</span>
                                                <span className="text-[11px] text-slate-400 font-normal leading-none block mt-1">Broadcast notice</span>
                                            </div>
                                        </div>
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-[#A855F7] transition-transform duration-200 group-hover:translate-x-1 shrink-0 ml-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            {/* RESCUE INSIGHTS CARD */}
                            <div className="bg-white rounded-[28px] shadow-[0_4px_24px_rgba(0,0,0,0.02)] border border-slate-100/90 p-5 sm:p-6 flex-1 flex flex-col justify-between transition-all duration-300 hover:shadow-xl hover:shadow-slate-100/80 group/insights">
                                {/* Header */}
                                <div className="flex items-center gap-3.5 mb-4">
                                    <div className="w-11 h-11 rounded-[16px] bg-gradient-to-br from-amber-50 to-orange-100/80 text-amber-600 border border-amber-200/60 flex items-center justify-center shrink-0 shadow-xs group-hover/insights:scale-105 transition-transform duration-200">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M21.731 2.269a2.625 2.625 0 00-3.712 0l-1.157 1.157 3.712 3.712 1.157-1.157a2.625 2.625 0 000-3.712zM19.513 8.199l-3.712-3.712-12.15 12.15a5.25 5.25 0 00-1.32 2.214l-.8 2.685a.75.75 0 00.933.933l2.685-.8a5.25 5.25 0 002.214-1.32L19.513 8.2z" />
                                        </svg>
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-[18px] font-black text-slate-900 tracking-tight leading-tight">
                                                Rescue Insights
                                            </h3>
                                            <span className="text-[9px] font-black uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200/80 px-2 py-0.5 rounded-full shadow-3xs">
                                                AI Smart
                                            </span>
                                        </div>
                                        <p className="text-[12px] font-normal text-slate-400 mt-0.5">
                                            Dynamic response & capacity analytics
                                        </p>
                                    </div>
                                </div>

                                {/* Insights List */}
                                <div className="flex flex-col gap-3">
                                    {/* 1. SYSTEM STATUS */}
                                    <div className="bg-[#FFF7ED] rounded-[20px] p-3.5 sm:p-4 border border-[#FFEDD5] flex items-start gap-3.5 transition-all duration-200 hover:shadow-sm hover:-translate-y-0.5 group">
                                        <div className="w-10 h-10 rounded-[14px] bg-white text-[#EA580C] shadow-2xs border border-[#FED7AA] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform duration-200 mt-0.5">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                                            </svg>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[10px] font-black uppercase tracking-wider text-[#EA580C] leading-none">SYSTEM STATUS</p>
                                            <p className="text-xs font-medium text-slate-700 leading-snug mt-1.5">
                                                {endorsedReports.filter(r => r.urgency === 'High' || r.urgency === 'Critical' || r.priority_level === 'High').length > 0
                                                    ? `${endorsedReports.filter(r => r.urgency === 'High' || r.urgency === 'Critical' || r.priority_level === 'High').length} high-priority endorsed reports monitored in field.`
                                                    : 'No high-priority active reports. System status normal and clear.'}
                                            </p>
                                        </div>
                                    </div>

                                    {/* 2. TEAMS READY */}
                                    <div className="bg-[#ECFDF5] rounded-[20px] p-3.5 sm:p-4 border border-[#A7F3D0] flex items-start gap-3.5 transition-all duration-200 hover:shadow-sm hover:-translate-y-0.5 group">
                                        <div className="w-10 h-10 rounded-[14px] bg-white text-[#059669] shadow-2xs border border-[#6EE7B7] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform duration-200 mt-0.5">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[10px] font-black uppercase tracking-wider text-[#059669] leading-none">TEAMS READY</p>
                                            <p className="text-xs font-medium text-slate-700 leading-snug mt-1.5">
                                                {uniqueAssigned > 0 ? (
                                                    <span>{uniqueAssigned} active dispatches. <strong className="text-[#059669] font-bold">{availablePersonnelCount} officers</strong> on standby.</span>
                                                ) : (
                                                    <span>No active dispatches. <strong className="text-[#059669] font-bold">{availablePersonnelCount} officers</strong> on standby.</span>
                                                )}
                                            </p>
                                        </div>
                                    </div>

                                    {/* 3. STAFF CAPACITY */}
                                    <div className="bg-[#EFF6FF] rounded-[20px] p-3.5 sm:p-4 border border-[#BFDBFE] flex items-start gap-3.5 transition-all duration-200 hover:shadow-sm hover:-translate-y-0.5 group">
                                        <div className="w-10 h-10 rounded-[14px] bg-white text-[#2563EB] shadow-2xs border border-[#93C5FD] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform duration-200 mt-0.5">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[10px] font-black uppercase tracking-wider text-[#2563EB] leading-none">STAFF CAPACITY</p>
                                            <p className="text-xs font-medium text-slate-700 leading-snug mt-1.5">
                                                <strong className="text-slate-900 font-bold">{uniqueAssigned || 0} officers</strong> in field • <strong className="text-slate-900 font-bold">{availablePersonnelCount} officers</strong> ready for dispatch.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>

                    {/* LOWER WORKSPACE: PERSONNEL STATUS & RECENT INCIDENTS */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">

                        {/* LEFT COLUMN (COL-SPAN-8): PERSONNEL STATUS TABLE */}
                        <div className="lg:col-span-8">
                            <div className="bg-white rounded-[28px] shadow-[0_4px_24px_rgba(0,0,0,0.02)] border border-slate-100/90 p-5 sm:p-6 h-full transition-all duration-300 hover:shadow-xl hover:shadow-slate-100/80 group/table flex flex-col">
                                {/* Header */}
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3.5 mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-11 h-11 bg-gradient-to-br from-blue-500/15 via-indigo-500/10 to-blue-500/10 text-blue-600 rounded-[16px] flex items-center justify-center shadow-xs border border-blue-200/60 group-hover/table:scale-105 group-hover/table:rotate-3 transition-all duration-300 shrink-0">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
                                            </svg>
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-[18px] font-black text-slate-900 tracking-tight leading-tight">Personnel Status</h3>
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9.5px] font-black uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200/80 shadow-3xs">
                                                    <span className="relative flex h-2 w-2">
                                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-600"></span>
                                                    </span>
                                                    Field Squad
                                                </span>
                                            </div>
                                            <p className="text-[12px] font-normal text-slate-400 mt-0.5">Real-time rescuer availability & field assignments</p>
                                        </div>
                                    </div>

                                    {/* Action & Availability Badge */}
                                    <div className="flex items-center gap-2">
                                        <span className="px-3.5 py-1.5 bg-emerald-50 text-emerald-700 text-xs font-black rounded-full border border-emerald-200/80 flex items-center gap-2 shadow-2xs">
                                            <span className="relative flex h-2 w-2">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                            </span>
                                            <span>{availablePersonnelCount} Available / {totalPersonnel} Total</span>
                                        </span>
                                        <button
                                            onClick={() => navigate('/brgy/personnel')}
                                            className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 bg-slate-50 hover:bg-blue-50 text-slate-600 hover:text-blue-600 text-xs font-bold rounded-full border border-slate-200/80 hover:border-blue-200 transition-all duration-200 cursor-pointer shadow-2xs group/btn"
                                        >
                                            <span>Roster</span>
                                            <span className="group-hover/btn:translate-x-0.5 transition-transform">→</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Filter Segmented Control */}
                                <div className="flex items-center justify-between gap-3 mb-4">
                                    <div className="flex items-center gap-1 bg-slate-50/80 p-1 rounded-xl border border-slate-200/70 shadow-2xs">
                                        <button
                                            onClick={() => setPersonnelFilter('all')}
                                            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 cursor-pointer active:scale-95 ${personnelFilter === 'all' ? 'bg-[#1A4543] text-white shadow-xs font-black' : 'text-slate-500 hover:text-slate-900 hover:bg-white'}`}
                                        >
                                            All ({displayPersonnelList.length})
                                        </button>
                                        <button
                                            onClick={() => setPersonnelFilter('available')}
                                            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 cursor-pointer flex items-center gap-1.5 active:scale-95 ${personnelFilter === 'available' ? 'bg-[#1A4543] text-white shadow-xs font-black' : 'text-slate-500 hover:text-slate-900 hover:bg-white'}`}
                                        >
                                            <span className="relative flex h-2 w-2">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                            </span>
                                            Available ({availablePersonnelCount})
                                        </button>
                                        <button
                                            onClick={() => setPersonnelFilter('on_mission')}
                                            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 cursor-pointer flex items-center gap-1.5 active:scale-95 ${personnelFilter === 'on_mission' ? 'bg-[#1A4543] text-white shadow-xs font-black' : 'text-slate-500 hover:text-slate-900 hover:bg-white'}`}
                                        >
                                            <span className="relative flex h-2 w-2">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                                            </span>
                                            On Mission ({uniqueAssigned})
                                        </button>
                                    </div>
                                </div>

                                <div className="overflow-x-auto flex-1">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="border-b border-slate-100 text-[10.5px] font-black text-slate-400 uppercase tracking-wider">
                                                <th className="pb-3 pl-3">OFFICER / RESPONDER</th>
                                                <th className="pb-3">ROLE</th>
                                                <th className="pb-3">CONTACT</th>
                                                <th className="pb-3">LIVE STATUS</th>
                                                <th className="pb-3">CURRENT ASSIGNMENT</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50 text-xs">
                                            {displayPersonnelList
                                                .filter((p) => {
                                                    const activeRescue = isPersonAssigned(p.user_id);
                                                    if (personnelFilter === 'available') return !activeRescue;
                                                    if (personnelFilter === 'on_mission') return !!activeRescue;
                                                    return true;
                                                }).length === 0 ? (
                                                    <tr>
                                                        <td colSpan={5} className="py-8 text-center text-slate-400">
                                                            <p className="font-semibold text-xs text-slate-500">No personnel match this filter</p>
                                                            <p className="text-[11px] text-slate-400 mt-0.5">Officers registered to this barangay will be listed here.</p>
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    displayPersonnelList
                                                        .filter((p) => {
                                                            const activeRescue = isPersonAssigned(p.user_id);
                                                            if (personnelFilter === 'available') return !activeRescue;
                                                            if (personnelFilter === 'on_mission') return !!activeRescue;
                                                            return true;
                                                        })
                                                        .map((p) => {
                                                            const activeRescue = isPersonAssigned(p.user_id);
                                                            return (
                                                                <tr
                                                                    key={p.user_id}
                                                                    className="relative hover:bg-gradient-to-r hover:from-blue-50/60 hover:via-indigo-50/20 hover:to-transparent transition-all duration-300 group/row hover:translate-x-1 cursor-default before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1 before:rounded-r-full before:bg-blue-500 before:opacity-0 group-hover/row:before:opacity-100 before:transition-opacity before:duration-300"
                                                                >
                                                                    <td className="py-3.5 pl-3 font-bold text-slate-900 flex items-center gap-3">
                                                                        <div className="relative shrink-0">
                                                                            <img
                                                                                src={getProfilePicture(p.profile_picture)}
                                                                                alt={p.name}
                                                                                className={`w-10 h-10 rounded-full object-cover border-2 border-white shadow-sm ring-2 ${activeRescue ? 'ring-amber-400/80 animate-pulse' : 'ring-emerald-300/80'} group-hover/row:scale-110 group-hover/row:rotate-3 transition-all duration-300`}
                                                                                onError={(e) => { e.currentTarget.src = DEFAULT_AVATAR; }}
                                                                            />
                                                                            {activeRescue ? (
                                                                                <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5">
                                                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                                                                    <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-amber-500 border-2 border-white"></span>
                                                                                </span>
                                                                            ) : (
                                                                                <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5">
                                                                                    <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border-2 border-white"></span>
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        <div className="min-w-0">
                                                                            <span className="block truncate group-hover/row:text-blue-600 transition-colors">{p.name}</span>
                                                                            <span className="text-[10px] text-slate-400 font-normal block truncate">ID #{p.user_id}</span>
                                                                        </div>
                                                                    </td>
                                                                    <td className="py-3.5 text-slate-600 font-medium">
                                                                        <div className="flex flex-col">
                                                                            <span className="text-slate-800 font-semibold truncate">{p.position_name || (p.is_head_officer ? 'Barangay Head Officer' : 'Field Rescuer')}</span>
                                                                            <span className="text-[10px] text-slate-400 font-normal">{p.barangay_name || 'Operations Staff'}</span>
                                                                        </div>
                                                                    </td>
                                                                    <td className="py-3.5 text-slate-600 font-mono text-[11px]">
                                                                        <div className="flex items-center gap-1.5 text-slate-700 font-medium">
                                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
                                                                                <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                                                                            </svg>
                                                                            <span>{p.phone || 'No phone'}</span>
                                                                        </div>
                                                                    </td>
                                                                    <td className="py-3.5">
                                                                        {activeRescue ? (
                                                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200/80 shadow-3xs">
                                                                                <span className="relative flex h-1.5 w-1.5">
                                                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                                                                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500"></span>
                                                                                </span>
                                                                                Dispatched
                                                                            </span>
                                                                        ) : (
                                                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-3xs">
                                                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                                                                Available
                                                                            </span>
                                                                        )}
                                                                    </td>
                                                                    <td className="py-3.5">
                                                                        {activeRescue ? (
                                                                            <div
                                                                                onClick={() => navigate(`/brgy/rescue-requests`)}
                                                                                className="inline-flex items-center justify-between gap-2 px-3 py-1 rounded-xl bg-blue-50/80 border border-blue-200/60 text-blue-700 hover:bg-blue-100 transition-colors cursor-pointer group/case shadow-2xs"
                                                                            >
                                                                                <div className="flex flex-col text-left">
                                                                                    <span className="font-black text-[11px] flex items-center gap-1.5">
                                                                                        <span className="animate-pulse text-blue-500">●</span> Case #{activeRescue.rescue_id}
                                                                                    </span>
                                                                                    <span className="text-[10px] text-slate-500 truncate max-w-[150px] mt-0.5">{activeRescue.report?.landmark || 'Active Dispatch Area'}</span>
                                                                                </div>
                                                                                <span className="text-blue-600 font-bold text-xs group-hover/case:translate-x-1 group-hover/case:-translate-y-0.5 transition-transform shrink-0">↗</span>
                                                                            </div>
                                                                        ) : (
                                                                            <span className="text-slate-400 italic text-[11px] flex items-center gap-1.5 group-hover/row:text-slate-600 transition-colors">
                                                                                Standby for dispatch
                                                                            </span>
                                                                        )}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })
                                                )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        {/* RIGHT COLUMN (COL-SPAN-4): RECENT INCIDENTS */}
                        <div className="lg:col-span-4">
                            <div className="bg-white rounded-[28px] shadow-[0_4px_24px_rgba(0,0,0,0.02)] border border-slate-100/90 p-5 sm:p-6 h-full flex flex-col justify-between transition-all duration-300 hover:shadow-xl hover:shadow-slate-100/80 group/incidents">
                                <div>
                                    <div className="flex justify-between items-center mb-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-11 h-11 rounded-[16px] bg-gradient-to-br from-rose-50 to-red-100/80 text-red-600 border border-red-200/60 flex items-center justify-center shadow-xs group-hover/incidents:scale-105 transition-transform duration-200 shrink-0">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                                </svg>
                                            </div>
                                            <div>
                                                <h3 className="text-[18px] font-black text-slate-900 tracking-tight leading-tight">Recent Incidents</h3>
                                                <p className="text-[12px] font-normal text-slate-400 mt-0.5">Latest community report feed</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => navigate('/brgy/rescue-requests')}
                                            className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-all flex items-center gap-1.5 group/btn py-1.5 px-3 rounded-xl hover:bg-blue-50/80 cursor-pointer"
                                        >
                                            <span>View All</span>
                                            <span className="group-hover/btn:translate-x-1 transition-transform">→</span>
                                        </button>
                                    </div>

                                    <div className="space-y-2.5">
                                        {recentIncidents.length === 0 ? (
                                            <div className="py-10 text-center text-slate-400">
                                                <p className="font-semibold text-xs text-slate-500">No Recent Incidents</p>
                                                <p className="text-[11px] text-slate-400 mt-0.5">Escalated community reports will appear here.</p>
                                            </div>
                                        ) : (
                                            recentIncidents.map((incident) => (
                                            <div
                                                key={incident.report_id}
                                                onClick={() => navigate(`/brgy/reports/${incident.report_id}`)}
                                                className="flex items-center justify-between p-3 bg-[#F8FAFC] hover:bg-white rounded-[20px] transition-all duration-300 cursor-pointer border border-slate-100/60 hover:border-blue-200/90 group/item shadow-2xs hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99]"
                                            >
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <div className="w-12 h-12 rounded-[16px] overflow-hidden shrink-0 border border-slate-200/80 shadow-2xs group-hover/item:scale-105 group-hover/item:border-blue-300 transition-all duration-300">
                                                        <img
                                                            src={incident.image}
                                                            alt={incident.title}
                                                            className="w-full h-full object-cover group-hover/item:scale-110 transition-transform duration-500"
                                                            onError={(e) => { e.currentTarget.src = DEFAULT_PET_AVATAR; }}
                                                        />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-xs font-black text-slate-900 truncate leading-snug group-hover/item:text-blue-600 transition-colors">
                                                            {incident.title}
                                                        </p>
                                                        <p className="text-[11px] text-slate-400 font-medium flex items-center gap-1 mt-0.5 truncate">
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 shrink-0 text-slate-400 group-hover/item:text-blue-500 transition-colors" viewBox="0 0 20 20" fill="currentColor">
                                                                <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                                                            </svg>
                                                            <span className="truncate">{incident.location}</span>
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0 ml-2">
                                                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${incident.statusColor} shadow-3xs group-hover/item:scale-105 transition-transform`}>
                                                        {incident.status}
                                                    </span>
                                                    <span className="text-[10px] font-semibold text-slate-400 min-w-[40px] text-right">
                                                        {incident.timeAgo}
                                                    </span>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </main>

        {/* ========================================================================= */}
        {/* ─── BARANGAY MOBILE BOTTOM NAVBAR (Only on Mobile / Tablet) ─── */}
        {/* ========================================================================= */}
        <BrgyBottomNav activeTab="dashboard" onAlertClick={() => setIsCommunityAlertModalOpen(true)} />

            {/* ENLARGED FULLSCREEN MAP MODAL */}
            {isMapExpanded && (
                <div className="fixed inset-0 z-[9999] bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-2 sm:p-5 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl sm:rounded-[32px] shadow-2xl border border-slate-200/80 w-full h-full sm:w-[96%] sm:h-[93%] flex flex-col p-4 sm:p-6 animate-in zoom-in-95 duration-200 overflow-hidden">
                        {/* Header */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 shrink-0 pb-3 border-b border-slate-100">
                            <div className="flex items-center gap-3">
                                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-orange-500/25">
                                    <Activity className="w-5 h-5 animate-pulse" />
                                </div>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 text-[10px] font-black uppercase tracking-wider border border-orange-200 shadow-2xs">
                                            <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-ping" /> Live Telemetry
                                        </span>
                                    </div>
                                    <h3 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight leading-none">
                                        Geospatial Command Center
                                    </h3>
                                    <p className="text-[11px] font-bold text-slate-700 mt-1 leading-tight">
                                        Full-Scale Incident & Rescuer Density Live Monitor
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center justify-between sm:justify-end gap-2.5">
                                <div className="flex bg-slate-100 p-1 rounded-2xl text-[10px] font-black uppercase border border-slate-200/70 shadow-2xs">
                                    <button
                                        onClick={() => setMapMode('pins')}
                                        className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${mapMode === 'pins' ? 'bg-slate-900 text-white shadow-xs font-black' : 'text-slate-600 hover:text-slate-900'}`}
                                    >
                                        Pins
                                    </button>
                                    <button
                                        onClick={() => setMapMode('heatmap')}
                                        className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${mapMode === 'heatmap' ? 'bg-slate-900 text-white shadow-xs font-black' : 'text-slate-600 hover:text-slate-900'}`}
                                    >
                                        Heatmap
                                    </button>
                                    <button
                                        onClick={() => setMapMode('both')}
                                        className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${mapMode === 'both' ? 'bg-slate-900 text-white shadow-xs font-black' : 'text-slate-600 hover:text-slate-900'}`}
                                    >
                                        Both
                                    </button>
                                </div>
                                <button
                                    onClick={() => setIsMapExpanded(false)}
                                    className="p-2.5 bg-slate-100 hover:bg-slate-200 rounded-2xl transition-all text-slate-600 hover:text-slate-900 active:scale-95 cursor-pointer shadow-2xs"
                                    title="Close View"
                                >
                                    <X className="w-5 h-5 stroke-[2.5]" />
                                </button>
                            </div>
                        </div>

                        {/* Stats Panel */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 mb-4 w-full shrink-0">
                            {/* Total Reports */}
                            <div className="bg-gradient-to-br from-slate-50 to-slate-100/90 border border-slate-200/90 rounded-2xl p-3 shadow-2xs flex items-center justify-between transition-transform active:scale-95 hover:shadow-xs">
                                <div className="min-w-0">
                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block truncate">Total Reports</span>
                                    <span className="text-xl font-black text-slate-900 leading-none mt-1 block">{endorsedReports.length}</span>
                                </div>
                                <div className="w-8 h-8 rounded-xl bg-slate-200/80 text-slate-700 flex items-center justify-center shrink-0">
                                    <FileText className="w-4 h-4" />
                                </div>
                            </div>

                            {/* Active Reports */}
                            <div className="bg-gradient-to-br from-red-50 to-rose-100/70 border border-red-200/90 rounded-2xl p-3 shadow-2xs flex items-center justify-between transition-transform active:scale-95 hover:shadow-xs">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping shrink-0" />
                                        <span className="text-[10px] font-black text-red-600 uppercase tracking-wider block truncate">Active</span>
                                    </div>
                                    <span className="text-xl font-black text-red-700 leading-none mt-1 block">{activeReports.length}</span>
                                </div>
                                <div className="w-8 h-8 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                                    <Flame className="w-4 h-4" />
                                </div>
                            </div>

                            {/* Assigned */}
                            <div className="bg-gradient-to-br from-blue-50 to-indigo-100/70 border border-blue-200/90 rounded-2xl p-3 shadow-2xs flex items-center justify-between transition-transform active:scale-95 hover:shadow-xs">
                                <div className="min-w-0">
                                    <span className="text-[10px] font-black text-blue-600 uppercase tracking-wider block truncate">Assigned</span>
                                    <span className="text-xl font-black text-blue-700 leading-none mt-1 block">{assignedReportsCount}</span>
                                </div>
                                <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                                    <Shield className="w-4 h-4" />
                                </div>
                            </div>

                            {/* In Progress */}
                            <div className="bg-gradient-to-br from-amber-50 to-orange-100/70 border border-amber-200/90 rounded-2xl p-3 shadow-2xs flex items-center justify-between transition-transform active:scale-95 hover:shadow-xs">
                                <div className="min-w-0">
                                    <span className="text-[10px] font-black text-amber-700 uppercase tracking-wider block truncate">In Progress</span>
                                    <span className="text-xl font-black text-amber-800 leading-none mt-1 block">{inProgressReportsCount}</span>
                                </div>
                                <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                                    <Clock className="w-4 h-4" />
                                </div>
                            </div>

                            {/* Picked Up */}
                            <div className="bg-gradient-to-br from-purple-50 to-fuchsia-100/70 border border-purple-200/90 rounded-2xl p-3 shadow-2xs flex items-center justify-between transition-transform active:scale-95 hover:shadow-xs">
                                <div className="min-w-0">
                                    <span className="text-[10px] font-black text-purple-600 uppercase tracking-wider block truncate">Picked Up</span>
                                    <span className="text-xl font-black text-purple-700 leading-none mt-1 block">{pickedUpReportsCount}</span>
                                </div>
                                <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center shrink-0">
                                    <Truck className="w-4 h-4" />
                                </div>
                            </div>

                            {/* Resolved */}
                            <div className="bg-gradient-to-br from-emerald-50 to-teal-100/70 border border-emerald-200/90 rounded-2xl p-3 shadow-2xs flex items-center justify-between transition-transform active:scale-95 hover:shadow-xs">
                                <div className="min-w-0">
                                    <span className="text-[10px] font-black text-emerald-600 uppercase tracking-wider block truncate">Resolved</span>
                                    <span className="text-xl font-black text-emerald-700 leading-none mt-1 block">{resolvedReportsCount}</span>
                                </div>
                                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                                    <CheckCircle2 className="w-4 h-4" />
                                </div>
                            </div>
                        </div>

                        {/* Map Area */}
                        <div className="flex-1 rounded-2xl sm:rounded-[24px] overflow-hidden relative border border-slate-200/80 shadow-inner min-h-0 bg-slate-50">
                            <MapComponent
                                height="100%"
                                center={hqCoords}
                                zoom={15.5}
                                showGeofence={true}
                                showLandmarks={true}
                                showHQ={true}
                                showHoldingFacilities={true}
                                onMapClick={(lat, lng) => setSelectedCoordinates({ lat, lng })}
                                markers={mapMode !== 'heatmap' ? mapMarkers : mapMarkers.filter(m => m.id < 0)}
                                showHeatmap={mapMode !== 'pins'}
                                heatmapPoints={heatmapPoints}
                                onViewDetails={(marker) => {
                                    setIsMapExpanded(false);
                                    setSelectedDetailReport(marker.rawData);
                                }}
                                routing={isNavigating && selectedReport ? {
                                    start: (navSource === 'hq' || navSource === 'brgy') ? hqCoords : (userLocation || hqCoords),
                                    end: [parseFloat(selectedReport.latitude || selectedReport.lat), parseFloat(selectedReport.longitude || selectedReport.lng)],
                                    waypointNames: [(navSource === 'hq' || navSource === 'brgy') ? `Barangay ${currentBarangayName} HQ` : "Your Location", selectedReport.landmark || selectedReport.title],
                                    onClose: () => setIsNavigating(false)
                                } : undefined}
                                onMarkerClick={(m) => {
                                    if (m.id === -1 || m.id === -999) {
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

                            {/* Modal Floating Coordinates Display Badge (Top-Left) */}
                            {selectedCoordinates && (
                                <div className="absolute top-3 left-3 z-[990] bg-white/95 backdrop-blur-md px-3.5 py-2.5 rounded-2xl shadow-xl border border-amber-200/90 text-xs text-slate-800 flex items-start gap-2.5 transition-all animate-in fade-in slide-in-from-top-2 duration-300 max-w-[220px]">
                                    <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                                        <MapPin className="h-3.5 w-3.5" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="text-[9px] font-black uppercase tracking-wider text-amber-700 leading-none truncate">Pinned Location</p>
                                            <button 
                                                onClick={() => setSelectedCoordinates(null)} 
                                                className="text-slate-400 hover:text-slate-600 text-xs font-bold leading-none cursor-pointer p-0.5"
                                                title="Clear Pin"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                        <div className="space-y-0.5 mt-1 font-mono text-[10px] text-slate-700">
                                            <p><span className="font-semibold text-slate-900">Lat:</span> {selectedCoordinates.lat.toFixed(5)}</p>
                                            <p><span className="font-semibold text-slate-900">Lng:</span> {selectedCoordinates.lng.toFixed(5)}</p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Status Legend Collapsible Toggle (Top-Right, avoids overlapping with bottom report card) */}
                            <div className="absolute top-3 right-3 sm:top-4 sm:right-4 z-[990]">
                                <div className="relative">
                                    <button
                                        type="button"
                                        onClick={() => setIsModalLegendOpen(prev => !prev)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white/95 hover:bg-white backdrop-blur-md rounded-xl border border-slate-200/90 shadow-md text-[10px] font-black uppercase tracking-wider text-slate-700 cursor-pointer active:scale-95 transition-all"
                                    >
                                        <span className="w-2 h-2 rounded-full bg-orange-500" />
                                        <span>Legend</span>
                                        <span className="text-[9px] text-slate-400">{isModalLegendOpen ? '▲' : '▼'}</span>
                                    </button>

                                    {isModalLegendOpen && (
                                        <div className="absolute top-full mt-1.5 right-0 bg-white/95 backdrop-blur-md p-3 rounded-2xl shadow-xl border border-slate-200/90 text-[10px] font-bold text-slate-700 flex flex-col gap-1.5 min-w-[125px] animate-in fade-in zoom-in-95 duration-150">
                                            <div className="text-[8px] font-black uppercase text-slate-400 tracking-wider mb-0.5">STATUS LEGEND</div>
                                            <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#EF4444] shadow-xs shrink-0" /><span>Pending</span></div>
                                            <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#F97316] shadow-xs shrink-0" /><span>Endorsed</span></div>
                                            <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#3B82F6] shadow-xs shrink-0" /><span>Assigned</span></div>
                                            <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#10B981] shadow-xs shrink-0" /><span>In Progress</span></div>
                                            <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#8B5CF6] shadow-xs shrink-0" /><span>Picked Up</span></div>
                                            <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#059669] shadow-xs shrink-0" /><span>Resolved</span></div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* REPORT DETAILS MODAL */}
            {selectedDetailReport && (
                <div className="fixed inset-0 z-[10000] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
                    <div className="bg-white rounded-[28px] shadow-2xl border border-slate-100 w-full max-w-lg overflow-hidden flex flex-col p-6 animate-in zoom-in-95 duration-200">
                        {/* Header */}
                        <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-4 shrink-0">
                            <div>
                                <h3 className="text-base font-black text-slate-900">Incident Case Details</h3>
                                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">Case ID: #{selectedDetailReport.report_id}</p>
                            </div>
                            <button
                                onClick={() => setSelectedDetailReport(null)}
                                className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-700 cursor-pointer"
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
                                    className="w-full h-48 object-cover rounded-[20px] border border-slate-200/80 shadow-2xs"
                                />
                            ) : (
                                <div className="w-full h-28 bg-slate-50 border border-dashed border-slate-200 rounded-[20px] flex flex-col items-center justify-center text-slate-400 text-xs">
                                    <span>🐾 No photo uploaded for this report</span>
                                </div>
                            )}

                            {/* Details Grid */}
                            <div className="grid grid-cols-2 gap-3.5 text-xs">
                                <div className="bg-slate-50/80 p-3 rounded-[16px] border border-slate-100">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Species / Breed</span>
                                    <span className="font-bold text-slate-900 mt-0.5 block">{selectedDetailReport.animal_type || 'Unknown'} {selectedDetailReport.animal_breed ? `(${selectedDetailReport.animal_breed})` : ''}</span>
                                </div>
                                <div className="bg-slate-50/80 p-3 rounded-[16px] border border-slate-100">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Priority</span>
                                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider mt-0.5 ${selectedDetailReport.priority_level === 'High' ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-blue-50 text-blue-600 border border-blue-200'
                                        }`}>{selectedDetailReport.priority_level || 'Medium'}</span>
                                </div>
                                <div className="bg-slate-50/80 p-3 rounded-[16px] border border-slate-100">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Condition</span>
                                    <span className="font-semibold text-slate-800 mt-0.5 block">{selectedDetailReport.condition || 'No specific condition listed'}</span>
                                </div>
                                <div className="bg-slate-50/80 p-3 rounded-[16px] border border-slate-100">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Status</span>
                                    <span className="font-semibold text-slate-800 mt-0.5 block">{selectedDetailReport.status?.status_name || getStatusName(selectedDetailReport.status_id)}</span>
                                </div>
                                <div className="bg-slate-50/80 p-3 rounded-[16px] border border-slate-100">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Reporter</span>
                                    <span className="font-semibold text-slate-800 mt-0.5 block">{selectedDetailReport.reporterName || selectedDetailReport.reporter?.name || 'Citizen'}</span>
                                </div>
                                <div className="bg-slate-50/80 p-3 rounded-[16px] border border-slate-100">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Contact</span>
                                    <span className="font-semibold text-slate-800 mt-0.5 block truncate">{selectedDetailReport.reporter?.phone || selectedDetailReport.reporter?.email || 'No contact info'}</span>
                                </div>
                            </div>

                            {/* Description */}
                            <div className="bg-slate-50 p-3.5 rounded-[18px] border border-slate-100">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">Report Description</span>
                                <p className="text-xs text-slate-700 italic">"{selectedDetailReport.description || 'No description provided.'}"</p>
                            </div>

                            {/* Mission details */}
                            <div className="bg-teal-50/40 p-3.5 rounded-[18px] border border-teal-200/50">
                                <span className="text-[10px] font-black text-[#1A4543] uppercase tracking-wider block mb-1">Current Dispatch Status</span>
                                <div className="flex justify-between items-center mt-1">
                                    <span className="text-xs font-bold text-slate-800">
                                        {selectedDetailReport.rescue ? getRescueStatusName(selectedDetailReport.rescue.status_id) : 'Not Escalated to Barangay Rescue'}
                                    </span>
                                    {selectedDetailReport.rescue && selectedDetailReport.rescue.assigned_staff_name && (
                                        <span className="text-[10px] font-black text-teal-800 bg-teal-100/70 border border-teal-200 px-2.5 py-0.5 rounded-full">
                                            Assigned: {selectedDetailReport.rescue.assigned_staff_name}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="border-t border-slate-100 pt-4 mt-4 flex justify-end shrink-0">
                            <button
                                onClick={() => setSelectedDetailReport(null)}
                                className="px-6 py-2.5 bg-[#1A4543] hover:bg-[#112d2b] text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-colors shadow-sm cursor-pointer"
                            >
                                Close Details
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ACTION FEEDBACK TOAST */}
            {actionFeedback && (
                <div className="fixed bottom-6 right-6 z-[10001] animate-in slide-in-from-bottom-5 duration-300">
                    <div className={`flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-xl border backdrop-blur-md ${
                        actionFeedback.type === 'success' 
                            ? 'bg-emerald-900/90 text-white border-emerald-700 shadow-emerald-950/20' 
                            : 'bg-rose-900/90 text-white border-rose-700 shadow-rose-950/20'
                    }`}>
                        <span className="text-base">{actionFeedback.type === 'success' ? '✓' : '⚠️'}</span>
                        <span className="text-xs font-bold">{actionFeedback.message}</span>
                        <button 
                            onClick={() => setActionFeedback(null)}
                            className="ml-2 text-white/70 hover:text-white text-xs font-black cursor-pointer"
                        >
                            ✕
                        </button>
                    </div>
                </div>
            )}

            {/* QUICK ACTION MODAL 1: ASSIGN PERSONNEL */}
            {isAssignModalOpen && (
                <div className="fixed inset-0 z-[10000] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
                    <div className="bg-white rounded-[28px] shadow-2xl border border-slate-100 w-full max-w-lg overflow-hidden flex flex-col p-6 animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-4 shrink-0">
                            <div className="flex items-center gap-2.5">
                                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                                    📋
                                </div>
                                <div>
                                    <h3 className="text-base font-black text-slate-900">Dispatch & Assign Personnel</h3>
                                    <p className="text-[11px] text-slate-400 font-medium">Assign field responder to active rescue request</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsAssignModalOpen(false)}
                                className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-700 cursor-pointer"
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleAssignSubmit} className="space-y-4 text-xs">
                            <div>
                                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">Select Rescue Case *</label>
                                <select
                                    value={assignForm.rescueId}
                                    onChange={(e) => setAssignForm({ ...assignForm, rescueId: Number(e.target.value) })}
                                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 focus:outline-none focus:border-blue-500"
                                    required
                                >
                                    <option value={0}>-- Choose Active Rescue Request --</option>
                                    {requests
                                        .filter(r => [1, 2, 4, 5, 13].includes(r.status_id))
                                        .map((r) => (
                                            <option key={r.rescue_id || r.report_id} value={r.rescue_id}>
                                                Case #{r.rescue_id} ({r.report?.animal_type || 'Stray'} at {r.report?.landmark || 'Jurisdiction'}) — {getStatusName(r.status_id)}
                                            </option>
                                        ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">Select Field Officer / Responder *</label>
                                <select
                                    value={assignForm.staffId}
                                    onChange={(e) => setAssignForm({ ...assignForm, staffId: Number(e.target.value) })}
                                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 focus:outline-none focus:border-blue-500"
                                    required
                                >
                                    <option value={0}>-- Choose Personnel --</option>
                                    {personnel.map((p) => {
                                        const isAssigned = requests.some(r => 
                                            (r.status_id === 4 || r.status_id === 5) && 
                                            (r.staff_id === p.user_id || (r.assignments?.some((a: any) => (a.staff_id === p.user_id || a.user_id === p.user_id) && a.assignment_status === 'Assigned')))
                                        );
                                        return (
                                            <option key={p.user_id} value={p.user_id}>
                                                {p.name} ({p.position_name || 'Responder'}) — {isAssigned ? '⚠️ On Active Mission' : '✓ Available'}
                                            </option>
                                        );
                                    })}
                                </select>
                            </div>

                            <div>
                                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">Dispatch Instructions & Notes</label>
                                <textarea
                                    value={assignForm.remarks}
                                    onChange={(e) => setAssignForm({ ...assignForm, remarks: e.target.value })}
                                    placeholder="Enter specific instructions or equipment needed for this dispatch..."
                                    rows={3}
                                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 focus:outline-none focus:border-blue-500"
                                />
                            </div>

                            <div className="border-t border-slate-100 pt-4 flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setIsAssignModalOpen(false)}
                                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold cursor-pointer transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmittingAssign}
                                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center gap-2 cursor-pointer shadow-sm transition-colors disabled:opacity-50"
                                >
                                    {isSubmittingAssign ? 'Dispatching...' : 'Dispatch Responder'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* QUICK ACTION MODAL 2: UPDATE INCIDENT */}
            {isUpdateIncidentModalOpen && (
                <div className="fixed inset-0 z-[10000] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
                    <div className="bg-white rounded-[28px] shadow-2xl border border-slate-100 w-full max-w-lg overflow-hidden flex flex-col p-6 animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-4 shrink-0">
                            <div className="flex items-center gap-2.5">
                                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                                    ⚡
                                </div>
                                <div>
                                    <h3 className="text-base font-black text-slate-900">Update Incident Status</h3>
                                    <p className="text-[11px] text-slate-400 font-medium">Record progress or resolution outcomes for a mission</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsUpdateIncidentModalOpen(false)}
                                className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-700 cursor-pointer"
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleUpdateIncidentSubmit} className="space-y-4 text-xs">
                            <div>
                                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">Select Incident Case *</label>
                                <select
                                    value={updateForm.rescueId}
                                    onChange={(e) => setUpdateForm({ ...updateForm, rescueId: Number(e.target.value) })}
                                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 focus:outline-none focus:border-emerald-500"
                                    required
                                >
                                    <option value={0}>-- Choose Incident Case --</option>
                                    {requests
                                        .filter(r => ![6, 11, 12].includes(r.status_id))
                                        .map((r) => (
                                            <option key={r.rescue_id || r.report_id} value={r.rescue_id}>
                                                Case #{r.rescue_id} ({r.report?.animal_type || 'Stray'} at {r.report?.landmark || 'Area'}) — Current: {getStatusName(r.status_id)}
                                            </option>
                                        ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">New Operational Status *</label>
                                <select
                                    value={updateForm.statusId}
                                    onChange={(e) => setUpdateForm({ ...updateForm, statusId: Number(e.target.value) })}
                                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 focus:outline-none focus:border-emerald-500"
                                    required
                                >
                                    <option value={5}>Team Dispatched / In Action</option>
                                    <option value={7}>Picked Up / Animal Secured</option>
                                    <option value={8}>Under Observation (Holding Facility)</option>
                                    <option value={11}>Incident Resolved / Mission Completed</option>
                                    <option value={17}>Animal Cannot Be Found</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">Progress Notes & Outcome Details</label>
                                <textarea
                                    value={updateForm.remarks}
                                    onChange={(e) => setUpdateForm({ ...updateForm, remarks: e.target.value })}
                                    placeholder="Enter outcome, condition of the animal, or resolution notes..."
                                    rows={3}
                                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 focus:outline-none focus:border-emerald-500"
                                />
                            </div>

                            <div className="border-t border-slate-100 pt-4 flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setIsUpdateIncidentModalOpen(false)}
                                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold cursor-pointer transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmittingUpdate}
                                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center gap-2 cursor-pointer shadow-sm transition-colors disabled:opacity-50"
                                >
                                    {isSubmittingUpdate ? 'Saving...' : 'Update Status'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* QUICK ACTION MODAL 3: COMMUNITY ALERT */}
            {isCommunityAlertModalOpen && (
                <div className="fixed inset-0 z-[10000] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
                    <div className="bg-white rounded-[28px] shadow-2xl border border-slate-100 w-full max-w-lg overflow-hidden flex flex-col p-6 animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-4 shrink-0">
                            <div className="flex items-center gap-2.5">
                                <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
                                    📢
                                </div>
                                <div>
                                    <h3 className="text-base font-black text-slate-900">Broadcast Community Alert</h3>
                                    <p className="text-[11px] text-slate-400 font-medium">Publish official notice to residents in your barangay</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsCommunityAlertModalOpen(false)}
                                className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-700 cursor-pointer"
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleCommunityAlertSubmit} className="space-y-4 text-xs">
                            <div>
                                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">Alert Title *</label>
                                <input
                                    type="text"
                                    value={alertForm.title}
                                    onChange={(e) => setAlertForm({ ...alertForm, title: e.target.value })}
                                    placeholder="e.g. Stray Pack Sighting Near School Zone"
                                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 focus:outline-none focus:border-purple-500"
                                    required
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">Category *</label>
                                    <select
                                        value={alertForm.category}
                                        onChange={(e) => setAlertForm({ ...alertForm, category: e.target.value })}
                                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 focus:outline-none focus:border-purple-500"
                                    >
                                        <option value="Emergency">Emergency Alert</option>
                                        <option value="Animal Advisory">Animal Advisory</option>
                                        <option value="Vaccination Drive">Vaccination Drive</option>
                                        <option value="Lost and Found">Lost and Found</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">Expiration Date (Optional)</label>
                                    <input
                                        type="date"
                                        value={alertForm.expiration}
                                        onChange={(e) => setAlertForm({ ...alertForm, expiration: e.target.value })}
                                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 focus:outline-none focus:border-purple-500"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">Notice Content *</label>
                                <textarea
                                    value={alertForm.content}
                                    onChange={(e) => setAlertForm({ ...alertForm, content: e.target.value })}
                                    placeholder="Provide detailed information and safety advice for the community..."
                                    rows={4}
                                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 focus:outline-none focus:border-purple-500"
                                    required
                                />
                            </div>

                            <div className="flex items-center gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                                <input
                                    type="checkbox"
                                    id="pinnedCheck"
                                    checked={alertForm.pinned}
                                    onChange={(e) => setAlertForm({ ...alertForm, pinned: e.target.checked })}
                                    className="rounded border-slate-300 text-purple-600 focus:ring-purple-500 h-4 w-4"
                                />
                                <label htmlFor="pinnedCheck" className="text-xs font-bold text-slate-700 cursor-pointer">
                                    🚨 Mark as High Priority / Emergency Alert
                                </label>
                            </div>

                            <div className="border-t border-slate-100 pt-4 flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setIsCommunityAlertModalOpen(false)}
                                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold cursor-pointer transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmittingAlert}
                                    className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold flex items-center gap-2 cursor-pointer shadow-sm transition-colors disabled:opacity-50"
                                >
                                    {isSubmittingAlert ? 'Publishing...' : 'Broadcast Alert'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BrgyDashboard;
