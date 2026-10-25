import { getPersonnelAvailability, getPersonnelCounts } from '../../utils/personnelAvailability';
import { useAutoRefresh } from '../../utils/useAutoRefresh';
import { useEffect, useState } from 'react';
import { SIGHTING_TITLE } from '../../utils/sighting';
import { useNavigate } from 'react-router-dom';
import { api } from '../../utils/api';
import { cloudinaryResized } from '../../utils/cloudinaryImage';
import { getCachedData, setCachedData } from '../../utils/cache';
import { DEFAULT_AVATAR, getProfilePicture, DEFAULT_PET_AVATAR, getPetPicture } from '../../utils/avatar';
import BrgySidebar from '../../components/BrgySidebar';
import BrgyNavbar from '../../components/Navbars/BrgyNavbar';
import BrgyBottomNav from '../../components/Navbars/BrgyBottomNav';
import MapComponent from '../../components/MapComponent';
import { MapPin, Activity, Flame, Shield, CheckCircle2, Clock, Truck, FileText, X } from 'lucide-react';
import ReportDescription from '../../components/ReportDescription';
import { reportDescriptionSummary } from '../../utils/reportDescription';
import { usePersistentState } from '../../utils/useCachedState';

const BrgyDashboard = () => {
    const navigate = useNavigate();
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
    const [requests, setRequests] = useState<any[]>(() => getCachedData<any[]>('brgy_dashboard_requests') || []);
    const [personnel, setPersonnel] = useState<any[]>(() => getCachedData<any[]>('brgy_dashboard_personnel') || []);
    const [reports, setReports] = useState<any[]>(() => getCachedData<any[]>('brgy_dashboard_reports') || []);
    const [facilityAnimals, setFacilityAnimals] = useState<any[]>(() => getCachedData<any[]>('brgy_dashboard_holding') || []);
    const [facilities, setFacilities] = useState<any[]>(() => getCachedData<any[]>('brgy_dashboard_facilities') || []);
    const [mapMode, setMapMode] = useState<'pins' | 'heatmap' | 'both'>('both');
    const [isMapExpanded, setIsMapExpanded] = useState(false);
    const [isModalLegendOpen, setIsModalLegendOpen] = useState(false);
    const [selectedDetailReport, setSelectedDetailReport] = useState<any>(null);
    const [selectedReport, setSelectedReport] = useState<any>(null);
    const [selectedCoordinates, setSelectedCoordinates] = useState<{ lat: number; lng: number } | null>(null);
    const [isNavigating, setIsNavigating] = useState(false);
    const [navSource, setNavSource] = useState<'hq' | 'brgy' | 'current'>('hq');
    const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
    const [geoToast, setGeoToast] = useState<{ message: string; type: 'error' | 'info' } | null>(null);
    const [personnelFilter, setPersonnelFilter] = usePersistentState<'all' | 'available' | 'on_mission' | 'off_duty'>('brgy_dashboard_personnel_filter', 'all');

    const [currentUser, setCurrentUser] = useState<any>(() => {
        try {
            const rawUser = localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user');
            return rawUser ? JSON.parse(rawUser) : null;
        } catch {
            return null;
        }
    });
    const [barangayHq, setBarangayHq] = useState<any>(() => getCachedData<any>('brgy_dashboard_hq') || null);
    const [_isLoading, setIsLoading] = useState<boolean>(() => !getCachedData('brgy_dashboard_reports'));
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
        if (!geoToast) return;
        const timer = setTimeout(() => {
            setGeoToast(null);
        }, 6000);
        return () => clearTimeout(timer);
    }, [geoToast]);

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

    const handleDirectionsFromMe = (markerOrReport: any) => {
        const fullReport = reports.find(r => r.report_id?.toString() === markerOrReport?.id?.toString()) || markerOrReport?.rawData || markerOrReport;
        if (!fullReport) return;

        if (!("geolocation" in navigator)) {
            setGeoToast({
                message: "Geolocation is not supported by your browser.",
                type: 'error'
            });
            setIsNavigating(false);
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
                setUserLocation(coords);
                setSelectedReport(fullReport);
                setNavSource('current');
                setIsNavigating(true);
            },
            (err) => {
                console.error("Error getting user location:", err);
                setIsNavigating(false);
                let errMsg = "Unable to retrieve your current location. Please enable GPS/location permissions in your browser to get directions.";
                if (err.code === err.PERMISSION_DENIED) {
                    errMsg = "Location permission denied. Please allow location access in your browser settings to get directions from your current location.";
                } else if (err.code === err.POSITION_UNAVAILABLE) {
                    errMsg = "Current GPS position is unavailable. Please check your network or device location settings.";
                } else if (err.code === err.TIMEOUT) {
                    errMsg = "Location request timed out. Please try again.";
                }
                setGeoToast({
                    message: errMsg,
                    type: 'error'
                });
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    };

    const handleDirectionsFromBrgyHall = (markerOrReport: any) => {
        const fullReport = reports.find(r => r.report_id?.toString() === markerOrReport?.id?.toString()) || markerOrReport?.rawData || markerOrReport;
        if (!fullReport) return;

        setSelectedReport(fullReport);
        setNavSource('brgy');
        setIsNavigating(true);
    };

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
                const reqData = requestsRes.value.data || [];
                setRequests(reqData);
                setCachedData('brgy_dashboard_requests', reqData);
            }
            if (personnelRes.status === 'fulfilled') {
                const persData = personnelRes.value.data || [];
                setPersonnel(persData);
                setCachedData('brgy_dashboard_personnel', persData);
            }
            if (reportsRes.status === 'fulfilled') {
                // Dashboard counts are per incident: animal records split from a group report are counted with their group
                const repData = (reportsRes.value.data || []).filter((r: any) => !r.split_from_report_id);
                setReports(repData);
                setCachedData('brgy_dashboard_reports', repData);
            }
            if (holdingRes.status === 'fulfilled') {
                const hData = holdingRes.value.data || [];
                setFacilityAnimals(hData);
                setCachedData('brgy_dashboard_holding', hData);
            }
            if (landmarksRes.status === 'fulfilled') {
                const facData = landmarksRes.value.data || [];
                setFacilities(facData);
                setCachedData('brgy_dashboard_facilities', facData);
            }
            if (hqRes.status === 'fulfilled') {
                const hqData = hqRes.value.data || null;
                setBarangayHq(hqData);
                if (hqData) setCachedData('brgy_dashboard_hq', hqData);
            }
        } catch (err) {
            console.error('Error fetching dashboard statistics:', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { fetchDashboardData(); }, []);
    useAutoRefresh(fetchDashboardData);

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

    const personnelCounts = getPersonnelCounts(personnel, p => Boolean(isPersonAssigned(p.user_id)));
    const uniqueAssigned = personnelCounts.onMission;
    const totalPersonnel = personnelCounts.total;
    const availablePersonnelCount = personnelCounts.available;
    const activePersonnelCount = personnelCounts.onDuty;
    const offDutyPersonnelCount = personnelCounts.offDuty;

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

    const getStatusName = (statusId: number | string | undefined | null) => {
        const sId = Number(statusId);
        switch (sId) {
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
            case 14: return 'Dismissed';
            case 17: return 'Animal Cannot Be Found';
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
        if (statusId === 6 || [9, 10, 11].includes(statusId)) return 'green'; // Resolved / returned / released
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
        return isReportEscalated(r) && [4, 5, 7, 8, 13].includes(r.status_id);
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

    const hqCoords: [number, number] = (
        barangayHq?.hq_lat && 
        barangayHq?.hq_lng && 
        !isNaN(parseFloat(barangayHq.hq_lat)) && 
        !isNaN(parseFloat(barangayHq.hq_lng)) &&
        parseFloat(barangayHq.hq_lat) !== 0 &&
        parseFloat(barangayHq.hq_lng) !== 0
    )
        ? [parseFloat(barangayHq.hq_lat), parseFloat(barangayHq.hq_lng)]
        : [14.806906, 121.0039297];

    const getRoutingConfig = () => {
        if (!isNavigating || !selectedReport) return undefined;

        const destLat = parseFloat(selectedReport.latitude || selectedReport.lat);
        const destLng = parseFloat(selectedReport.longitude || selectedReport.lng);
        if (isNaN(destLat) || isNaN(destLng)) return undefined;

        const destName = selectedReport.landmark || selectedReport.title || `Report #${selectedReport.report_id}`;

        if (navSource === 'brgy') {
            return {
                start: hqCoords,
                end: [destLat, destLng] as [number, number],
                waypointNames: [`Barangay ${currentBarangayName} Hall`, destName] as [string, string],
                onClose: () => setIsNavigating(false)
            };
        }

        if (!userLocation) return undefined;

        return {
            start: userLocation,
            end: [destLat, destLng] as [number, number],
            waypointNames: ["My Current Location", destName] as [string, string],
            onClose: () => setIsNavigating(false),
            live: true
        };
    };

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
                    title: reportDescriptionSummary(r.description) || `Incident #${r.report_id}`,
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
    const shownPersonnel = displayPersonnelList.filter(p => personnelFilter === 'all' ||
        getPersonnelAvailability(p, Boolean(isPersonAssigned(p.user_id))) === personnelFilter);


    const getStatusBadgeStyle = (statusName: string) => {
        const lower = (statusName || '').toLowerCase();
        if (lower.includes('pending')) return 'bg-red-50 text-red-500 border-red-200';
        if (lower.includes('assigned')) return 'bg-blue-50 text-blue-600 border-blue-200';
        if (lower.includes('in progress') || lower.includes('started') || lower.includes('dispatched') || lower.includes('active')) return 'bg-emerald-50 text-emerald-600 border-emerald-200';
        if (lower.includes('endorsed') || lower.includes('approved') || lower.includes('verified')) return 'bg-role-soft text-role-hover border-role-border';
        if (lower.includes('picked up') || lower.includes('observation') || lower.includes('impounded')) return 'bg-purple-50 text-purple-600 border-purple-200';
        return 'bg-slate-50 text-slate-600 border-slate-200';
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

    // Incidents officially endorsed/escalated to the Barangay
    const endorsedReports = reports.filter(r => isReportEscalated(r));

    // Only show active / unresolved incidents in the recent incidents feed
    const activeUnresolvedReports = endorsedReports.filter(r => {
        if (!r) return false;
        const statusId = Number(r.status_id ?? r.current_status_id ?? 0);
        const statusName = (r.status?.status_name || r.status_name || getStatusName(statusId) || '').toLowerCase();
        // Exclude resolved (6, 11), rejected (3), released (10), deceased (12), dismissed (14), or closed cases
        if ([3, 6, 10, 11, 12, 14, 17, 18].includes(statusId)) return false;
        if (statusName.includes('resolve') || statusName.includes('reject') || statusName.includes('dismiss') || statusName.includes('deceased') || statusName.includes('closed') || statusName.includes('released')) {
            return false;
        }
        return true;
    });

    const sortedReports = [...activeUnresolvedReports].sort((a: any, b: any) => {
        const timeA = a.created_at ? new Date(a.created_at).getTime() : (a.report_id || 0);
        const timeB = b.created_at ? new Date(b.created_at).getTime() : (b.report_id || 0);
        return timeB - timeA;
    });

    const recentIncidents = sortedReports.slice(0, 5).map((r) => {
        const statusId = Number(r.status_id ?? r.current_status_id ?? 0);
        const rawStatus = r.status?.status_name || r.status_name || getStatusName(statusId);
        const friendlyStatus = (statusId === 4 || statusId === 13) ? 'Endorsed'
            : (statusId === 5) ? 'In Progress'
            : (statusId === 7 || statusId === 8 || statusId === 9) ? 'Picked Up'
            : (statusId === 6 || [9, 10, 11].includes(statusId)) ? 'Resolved'
            : (statusId === 3) ? 'Rejected'
            : (statusId === 14) ? 'Dismissed'
            : (rawStatus || 'Active');

        const defaultLocation = barangayHq?.city ? `${currentBarangayName}, ${barangayHq.city}` : `${currentBarangayName}, Bulacan`;

        return {
            report_id: r.report_id,
            title: `#${String(r.report_id).padStart(4, '0')} · ${r.category?.category_name || r.category_name || SIGHTING_TITLE}`,
            location: r.landmark || r.subdivision_name || r.subdivision?.subdivision_name || defaultLocation,
            status: friendlyStatus,
            statusColor: getStatusBadgeStyle(friendlyStatus),
            timeAgo: r.created_at ? formatTimeAgo(r.created_at) : 'Recently',
            image: (r.media && Array.isArray(r.media) && r.media.length > 0 && r.media[0]?.file_url)
                ? getPetPicture(r.media[0].file_url)
                : DEFAULT_PET_AVATAR
        };
    });

    const parsedUser = currentUser;
    const isHeadOfficer = Boolean(parsedUser?.is_head_officer);
    const staffName = parsedUser?.name || parsedUser?.full_name || (parsedUser?.first_name ? `${parsedUser.first_name} ${parsedUser.last_name || ''}`.trim() : (isHeadOfficer ? 'Head Officer' : 'Staff Officer'));

    const handleAssignSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!assignForm.rescueId || !assignForm.staffId) {
            setActionFeedback({ type: 'error', message: 'Please select both an incident and a responder to assign.' });
            return;
        }
        const responder = personnel.find(p => Number(p.user_id) === Number(assignForm.staffId));
        if (!responder || getPersonnelAvailability(responder, false) === 'off_duty') {
            setActionFeedback({ type: 'error', message: 'This responder is off duty. Please select an active responder.' });
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
                        <div className="flex flex-col min-w-0">
                            <h1 className="text-xs sm:text-xl font-black text-gray-900 tracking-tight leading-none uppercase truncate">
                                Barangay Operations
                            </h1>
                            <p className="text-[7.5px] sm:text-[9px] text-gray-400 font-extrabold uppercase tracking-wider mt-1 leading-none truncate max-w-[130px] min-[375px]:max-w-[170px] sm:max-w-none">
                                Command Center & Field Operations for Brgy. {currentBarangayName}
                            </p>
                        </div>
                    }
                />

                {/* Geolocation Toast Notification */}
                {geoToast && (
                    <div className="fixed top-5 right-5 z-[9999] max-w-md bg-white border border-rose-200 shadow-2xl rounded-2xl p-4 flex items-start gap-3 animate-in fade-in slide-in-from-top-4 duration-300">
                        <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 border border-rose-100">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>
                        <div className="flex-1 min-w-0 pt-0.5">
                            <h4 className="text-xs font-black text-rose-900 tracking-wide">Location Required</h4>
                            <p className="text-xs text-rose-700 mt-0.5 leading-relaxed font-medium">{geoToast.message}</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setGeoToast(null)}
                            className="text-rose-400 hover:text-rose-600 p-1 rounded-lg hover:bg-rose-50 transition-colors"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                )}

                {/* SCROLLABLE AREA */}
                <div className="flex-1 overflow-y-auto px-3 py-4 sm:p-5 lg:p-6 pb-32 lg:pb-6 flex flex-col gap-3 sm:gap-4 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent relative isolate">

                    {/* Greeting (all screen sizes) */}
                    <div className="bg-white rounded-2xl border border-gray-200/80 p-3 sm:p-4 flex items-center gap-3 min-w-0">
                        <span className="w-10 h-10 rounded-xl bg-role-soft flex items-center justify-center text-xl shrink-0 select-none" aria-hidden="true">{new Date().getHours() < 18 ? '☀️' : '🌙'}</span>
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <h2 className="text-base sm:text-lg font-black text-slate-900 leading-tight break-words">{getGreeting()}, {staffName}!</h2>
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide bg-role-soft text-role-hover border border-role-border">
                                    {isHeadOfficer ? 'Head Officer' : 'Field Staff'}
                                </span>
                            </div>
                            <p className="text-xs text-slate-500 font-medium mt-0.5">Here's the real-time operational overview for Barangay {currentBarangayName} today.</p>
                        </div>
                    </div>

                    {/* Quick overview (all screen sizes) */}
                    <section aria-label="Quick overview" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
                        {[
                            { label: 'Rescue Requests', sub: 'Awaiting barangay dispatch', value: <>{displayReportRequest}</>, to: '/brgy/rescue-requests', tone: 'text-rose-600', note: null as string | null },
                            { label: 'On Duty Personnel', sub: 'Active field officers', value: <>{activePersonnelCount}<span className="text-sm font-bold text-slate-400"> / {totalPersonnel}</span></>, to: '/brgy/personnel', tone: 'text-blue-600', note: `${availablePersonnelCount} available for call` },
                            { label: 'Ongoing Rescues', sub: 'Units deployed in field', value: <>{displayOngoingReport}</>, to: '/brgy/rescue-requests', tone: 'text-emerald-600', note: null },
                            { label: 'Holding Facility', sub: `${dogsCount} dogs • ${catsCount} cats`, value: <>{animalsInFacilityCount}</>, to: '/brgy/holding-facility', tone: 'text-purple-600', note: `${facilityCapacityPct}% of capacity` },
                            { label: 'Up for Adoption', sub: `${adoptionDogsCount} dogs • ${adoptionCatsCount} cats`, value: <>{adoptionCount}</>, to: '/brgy/adoptions', tone: 'text-amber-600', note: null },
                        ].map((c, i) => (
                            <button
                                key={c.label}
                                type="button"
                                onClick={() => navigate(c.to)}
                                className={`text-left bg-white rounded-2xl border border-gray-200/80 p-3 sm:p-4 flex flex-col gap-1 min-w-0 hover:border-role-border hover:shadow-sm active:scale-[0.99] transition-all cursor-pointer ${i === 4 ? 'col-span-2 sm:col-span-1' : ''}`}
                            >
                                <span className={`text-2xl sm:text-3xl font-black leading-none ${c.tone}`}>{c.value}</span>
                                <span className="text-xs font-bold text-slate-800 leading-tight mt-1">{c.label}</span>
                                <span className="text-[11px] font-medium text-slate-500 leading-tight">{c.sub}</span>
                                {c.note && <span className="text-[11px] font-bold text-slate-600 leading-tight">{c.note}</span>}
                            </button>
                        ))}
                    </section>

                    {/* ─── PHONES & TABLETS (below lg) ─── */}
                    <div className="flex flex-col gap-3 sm:gap-4 lg:hidden">
                        {/* Recent incidents (what needs action first) */}
                        <section className="bg-white rounded-2xl border border-gray-200/80 p-3 sm:p-4 flex flex-col gap-2.5 min-w-0">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <h3 className="text-sm sm:text-base font-black text-slate-900">Recent incidents</h3>
                                    <p className="text-xs text-slate-500 mt-0.5">Latest reports for the barangay</p>
                                </div>
                                <button type="button" onClick={() => navigate('/brgy/rescue-requests')} className="h-9 px-1 text-xs font-bold text-role-hover hover:underline shrink-0 cursor-pointer whitespace-nowrap">
                                    All requests →
                                </button>
                            </div>
                            {recentIncidents.length === 0 ? (
                                <div className="py-6 text-center">
                                    <p className="text-sm font-bold text-slate-700">No recent incidents</p>
                                    <p className="text-xs text-slate-500 mt-0.5">Escalated community reports will appear here.</p>
                                </div>
                            ) : (
                                <div className="flex flex-col divide-y divide-slate-100">
                                    {recentIncidents.map((incident) => (
                                        <button
                                            key={incident.report_id}
                                            type="button"
                                            onClick={() => navigate(`/brgy/reports/${incident.report_id}`)}
                                            className="flex items-center gap-3 py-2.5 text-left min-w-0 cursor-pointer active:bg-slate-50"
                                        >
                                            <img loading="lazy" decoding="async" src={cloudinaryResized(incident.image, 160)} alt=""
                                                className="w-11 h-11 rounded-xl object-cover shrink-0 border border-slate-100 bg-slate-100"
                                                onError={(e) => { e.currentTarget.src = DEFAULT_PET_AVATAR; }} />
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-bold text-slate-900 truncate">{incident.title}</p>
                                                <p className="text-xs text-slate-500 truncate">{incident.location} · {incident.timeAgo}</p>
                                            </div>
                                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border shrink-0 whitespace-nowrap ${incident.statusColor}`}>{incident.status}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </section>

                        {/* Map */}
                        <section className="bg-white rounded-2xl border border-gray-200/80 p-3 sm:p-4 flex flex-col gap-2.5 min-w-0">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <h3 className="text-sm sm:text-base font-black text-slate-900">Incident map</h3>
                                    <p className="text-xs text-slate-500 mt-0.5">Reports, responders and the barangay hall</p>
                                </div>
                                <button type="button" onClick={() => setIsMapExpanded(true)}
                                    className="h-9 px-3 shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" /></svg> Expand
                                </button>
                            </div>
                            <div className="w-full h-[300px] sm:h-[380px] rounded-xl overflow-hidden relative border border-slate-100 bg-slate-50">
                                <MapComponent
                                    height="100%"
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
                                    routing={getRoutingConfig()}
                                    onMarkerClick={(m) => {
                                        if (m.id === -1 || m.id === -999) {
                                            setSelectedReport(null);
                                            setIsNavigating(false);
                                        } else {
                                            const fullReport = reports.find(r => r.report_id.toString() === m.id.toString()) || m.rawData;
                                            if (fullReport) {
                                                setSelectedReport(fullReport);
                                            }
                                        }
                                    }}
                                    onDirectionsClick={handleDirectionsFromMe}
                                    onDirectionsFromBrgyClick={handleDirectionsFromBrgyHall}
                                />
                            </div>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] font-semibold text-slate-600">
                                <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#EF4444]" />Pending</span>
                                <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-role" />Endorsed</span>
                                <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#3B82F6]" />Assigned</span>
                                <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#10B981]" />In progress</span>
                                <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#8B5CF6]" />Picked up</span>
                            </div>
                        </section>

                        {/* Holding facility countdown */}
                        <section className="bg-white rounded-2xl border border-gray-200/80 p-3 sm:p-4 flex flex-col gap-2.5 min-w-0">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <h3 className="text-sm sm:text-base font-black text-slate-900">Holding facility</h3>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        <span className="font-bold text-amber-700 whitespace-nowrap">{activeHoldingAnimals.length} in custody</span> · holding period before CVO endorsement
                                    </p>
                                </div>
                                <button type="button" onClick={() => navigate('/brgy/holding-facility')} className="h-9 px-1 text-xs font-bold text-role-hover hover:underline shrink-0 cursor-pointer whitespace-nowrap">
                                    Facility →
                                </button>
                            </div>
                            {activeHoldingAnimals.length === 0 ? (
                                <div className="py-6 text-center">
                                    <p className="text-sm font-bold text-slate-700">No animals in holding</p>
                                    <p className="text-xs text-slate-500 mt-0.5">Rescued animals appear here during their holding period.</p>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-2">
                                    {activeHoldingAnimals.map((animal: any) => {
                                        const savedStay = typeof window !== 'undefined' ? localStorage.getItem('holding_impound_stay_duration') : null;
                                        const parsedStay = savedStay !== null ? parseInt(savedStay, 10) : NaN;
                                        const HOLDING_DAYS_LIMIT = (!isNaN(parsedStay) && parsedStay > 0) ? parsedStay : 7;
                                        const normalizeDate = (d: any): number => {
                                            if (!d) return Date.now();
                                            if (typeof d === 'number') return d;
                                            const parsed = new Date(String(d).trim().replace(' ', 'T')).getTime();
                                            return isNaN(parsed) ? Date.now() : parsed;
                                        };
                                        const rawDate = animal.facility_intake_date || animal.intake_date || animal.brgy_intake_date || animal.created_at || animal.report?.created_at;
                                        const intakeTime = normalizeDate(rawDate);
                                        const now = Date.now();
                                        const elapsedMs = Math.max(0, now - intakeTime);
                                        const elapsedDays = Math.floor(elapsedMs / 86400000);
                                        const totalHoldingMs = HOLDING_DAYS_LIMIT * 86400000;
                                        const expirationTime = intakeTime + totalHoldingMs;
                                        const msRemaining = expirationTime - now;
                                        const daysRemaining = Math.max(0, Math.ceil(msRemaining / 86400000));
                                        const hoursRemaining = Math.max(0, Math.ceil(msRemaining / 3600000));
                                        const isExpired = msRemaining <= 0;
                                        const isUrgent = !isExpired && daysRemaining <= 2;
                                        const currentDay = isExpired ? HOLDING_DAYS_LIMIT : Math.min(HOLDING_DAYS_LIMIT, Math.max(1, elapsedDays + 1));
                                        const elapsedPercent = isExpired ? 100 : Math.min(100, Math.max(1, Math.round((elapsedMs / totalHoldingMs) * 100)));
                                        const fmt = (t: number) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                                        const animalDisplayName = animal.animal_name || animal.name || `${animal.breed || animal.animal_type || 'Stray'} #${animal.report_id || animal.holding_id}`;
                                        const caseId = `#${(animal.report_id || animal.holding_id || 0).toString().padStart(4, '0')}`;
                                        const photoUrl = animal.original_photo_url ||
                                            animal.report_media?.find((m: any) => m.file_url && !m.is_evidence)?.file_url ||
                                            animal.report?.media?.find((m: any) => m.file_url)?.file_url;
                                        const tone = isExpired ? 'bg-rose-50 text-rose-700 border-rose-200' : isUrgent ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200';
                                        const leftText = isExpired ? 'Holding period ended'
                                            : daysRemaining === 1 && hoursRemaining <= 24 ? `${hoursRemaining}h left`
                                            : `${daysRemaining} day${daysRemaining > 1 ? 's' : ''} left`;
                                        return (
                                            <button
                                                key={`mobile-holding-${animal.holding_id || animal.report_id}`}
                                                type="button"
                                                onClick={() => navigate('/brgy/holding-facility')}
                                                className="text-left rounded-xl border border-slate-200/80 p-3 flex flex-col gap-2 min-w-0 cursor-pointer hover:border-amber-300 active:bg-slate-50"
                                            >
                                                <div className="flex items-center gap-3 min-w-0">
                                                    {photoUrl ? (
                                                        <img loading="lazy" decoding="async" src={cloudinaryResized(photoUrl, 160)} alt="" className="w-10 h-10 rounded-xl object-cover shrink-0 border border-slate-100" />
                                                    ) : (
                                                        <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0 text-base">
                                                            {animal.animal_type?.toLowerCase() === 'cat' ? '🐱' : '🐶'}
                                                        </div>
                                                    )}
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-sm font-bold text-slate-900 truncate">{animalDisplayName} <span className="text-xs font-semibold text-slate-400">{caseId}</span></p>
                                                        <p className="text-xs text-slate-500 truncate">
                                                            {animal.animal_type || 'Animal'}{animal.breed ? ` · ${animal.breed}` : ''}{animal.kennel_slot ? ` · Kennel ${animal.kennel_slot}` : ''}
                                                        </p>
                                                    </div>
                                                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border shrink-0 whitespace-nowrap ${tone}`}>{leftText}</span>
                                                </div>
                                                <div>
                                                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                                        <div className={`h-full rounded-full ${isExpired ? 'bg-rose-500' : isUrgent ? 'bg-amber-500' : 'bg-role'}`} style={{ width: `${elapsedPercent}%` }} />
                                                    </div>
                                                    <p className="mt-1 text-[11px] text-slate-500 flex justify-between gap-2">
                                                        <span>Day {currentDay} of {HOLDING_DAYS_LIMIT}</span>
                                                        <span>{rawDate ? fmt(intakeTime) : 'Intake date not recorded'} → <span className={isExpired ? 'font-bold text-rose-600' : 'font-semibold text-slate-700'}>{fmt(expirationTime)}</span></span>
                                                    </p>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </section>

                        {/* Personnel */}
                        <section className="bg-white rounded-2xl border border-gray-200/80 p-3 sm:p-4 flex flex-col gap-2.5 min-w-0">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <h3 className="text-sm sm:text-base font-black text-slate-900">Personnel</h3>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        <span className="font-bold text-emerald-700 whitespace-nowrap">{availablePersonnelCount} available</span> · <span className="whitespace-nowrap">{uniqueAssigned} on a mission</span>
                                    </p>
                                </div>
                                <button type="button" onClick={() => navigate('/brgy/personnel')} className="h-9 px-1 text-xs font-bold text-role-hover hover:underline shrink-0 cursor-pointer whitespace-nowrap">
                                    Manage →
                                </button>
                            </div>
                            <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100 rounded-xl" role="group" aria-label="Personnel filter">
                                {([
                                    ['all', 'All', displayPersonnelList.length],
                                    ['available', 'Available', availablePersonnelCount],
                                    ['on_mission', 'On mission', uniqueAssigned],
                                    ['off_duty', 'Off duty', offDutyPersonnelCount],
                                ] as const).map(([key, label, count]) => {
                                    const on = personnelFilter === key;
                                    return (
                                        <button key={key} type="button" onClick={() => setPersonnelFilter(key)} aria-pressed={on}
                                            className={`h-9 px-1 min-w-0 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1 transition-colors cursor-pointer ${on ? 'bg-role text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}>
                                            <span className="truncate">{label}</span>
                                            <span className={`text-[10px] ${on ? 'text-white/80' : 'text-slate-400'}`}>{count}</span>
                                        </button>
                                    );
                                })}
                            </div>
                            {(() => {
                                const shown = shownPersonnel;
                                if (shown.length === 0) {
                                    return (
                                        <div className="py-6 text-center">
                                            <p className="text-sm font-bold text-slate-700">No personnel match this filter</p>
                                            <p className="text-xs text-slate-500 mt-0.5">Officers registered to this barangay appear here.</p>
                                        </div>
                                    );
                                }
                                return (
                                    <div className="flex flex-col divide-y divide-slate-100">
                                        {shown.map((p) => {
                                            const activeRescue = isPersonAssigned(p.user_id);
                                            const offDuty = getPersonnelAvailability(p, Boolean(activeRescue)) === 'off_duty';
                                            const phone = p.phone || p.contact_number;
                                            return (
                                                <div key={p.user_id} className="flex items-center gap-3 py-2.5 min-w-0">
                                                    <div className="relative shrink-0">
                                                        <img loading="lazy" decoding="async" src={getProfilePicture(p.profile_picture)} alt=""
                                                            className="w-10 h-10 rounded-full object-cover border border-slate-100"
                                                            onError={(e) => { e.currentTarget.src = DEFAULT_AVATAR; }} />
                                                        <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${offDuty ? 'bg-slate-400' : activeRescue ? 'bg-amber-500' : 'bg-emerald-500'}`} aria-hidden="true" />
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-sm font-bold text-slate-900 truncate">{p.name}</p>
                                                        <p className="text-xs text-slate-500 truncate">
                                                            {activeRescue
                                                                ? <>Case #{activeRescue.rescue_id} · {activeRescue.report?.landmark || 'Location not recorded'}</>
                                                                : <>{p.role || p.position_name || 'Barangay Staff'}{phone ? <> · <a href={`tel:${phone}`} onClick={(e) => e.stopPropagation()} className="text-role-hover font-semibold">{phone}</a></> : ' · No phone on file'}</>}
                                                        </p>
                                                    </div>
                                                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border shrink-0 whitespace-nowrap ${offDuty ? 'bg-slate-100 text-slate-600 border-slate-200' : activeRescue ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                                                        {offDuty ? 'Off duty' : activeRescue ? 'Dispatched' : 'Available'}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })()}
                        </section>

                        {/* Insights */}
                        <section className="bg-white rounded-2xl border border-gray-200/80 p-3 sm:p-4 flex flex-col gap-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <h3 className="text-sm sm:text-base font-black text-slate-900">Rescue insights</h3>
                                <span className="text-[11px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">Live summary</span>
                            </div>
                            <div className="flex flex-col divide-y divide-slate-100">
                                {(() => {
                                    const highCountNow = endorsedReports.filter(r => r.urgency === 'High' || r.urgency === 'Critical' || r.priority_level === 'High').length;
                                    return [
                                        ['System status', 'text-role-hover', highCountNow > 0 ? `${highCountNow} high-priority endorsed report${highCountNow !== 1 ? 's' : ''} being monitored.` : 'No high-priority active reports.'],
                                        ['Teams ready', 'text-emerald-700', `${uniqueAssigned > 0 ? `${uniqueAssigned} active dispatch${uniqueAssigned !== 1 ? 'es' : ''}` : 'No active dispatches'} · ${availablePersonnelCount} officer${availablePersonnelCount !== 1 ? 's' : ''} on standby.`],
                                        ['Staff capacity', 'text-blue-700', `${uniqueAssigned || 0} in the field · ${availablePersonnelCount} ready for dispatch.`],
                                    ].map(([title, tone, text]) => (
                                        <div key={title} className="py-2.5">
                                            <p className={`text-xs font-bold ${tone}`}>{title}</p>
                                            <p className="text-sm text-slate-700 leading-snug mt-0.5">{text}</p>
                                        </div>
                                    ));
                                })()}
                            </div>
                        </section>
                    </div>

                    {/* ========================================================================= */}
                    {/* ─── DESKTOP WORKSPACE (Unchanged & Preserved for lg: and Above) ─── */}
                    {/* ========================================================================= */}
                    <div className="hidden lg:flex flex-col gap-5">
                    {/* UPPER WORKSPACE: MAP & RESCUE INSIGHTS */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">

                        {/* LEFT COLUMN (COL-SPAN-8): LIVE INCIDENT MAP & PERSONNEL STATUS */}
                        <div className="lg:col-span-8 flex flex-col gap-4">
                            <div className="bg-white rounded-[28px] shadow-[0_4px_24px_rgba(0,0,0,0.02)] border border-slate-100/90 p-5 sm:p-6 relative transition-all duration-300 hover:shadow-xl hover:shadow-slate-100/80 flex flex-col group/mapcard">
                                {/* Header */}
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3.5 mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-11 h-11 bg-gradient-to-br from-teal-500/15 via-teal-500/10 to-emerald-500/10 text-role-strong rounded-[16px] flex items-center justify-center shadow-xs border border-teal-200/50 shrink-0">
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
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-role-soft/90 border border-role-border/60 text-role-strong shadow-2xs">
                                            <span className="w-1.5 h-1.5 rounded-full bg-role shadow-xs"></span>Endorsed
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
                                <div className="w-full h-[480px] sm:h-[500px] md:h-[520px] min-h-[460px] rounded-[22px] overflow-hidden relative border border-slate-200/70 shadow-inner bg-slate-50">
                                    <MapComponent
                                        height="100%"
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
                                        routing={getRoutingConfig()}
                                        onMarkerClick={(m) => {
                                            if (m.id === -1 || m.id === -999) {
                                                setSelectedReport(null);
                                                setIsNavigating(false);
                                            } else {
                                                const fullReport = reports.find(r => r.report_id.toString() === m.id.toString()) || m.rawData;
                                                if (fullReport) {
                                                    setSelectedReport(fullReport);
                                                }
                                            }
                                        }}
                                        onDirectionsClick={handleDirectionsFromMe}
                                        onDirectionsFromBrgyClick={handleDirectionsFromBrgyHall}
                                    />

                                    {/* Floating Clicked Coordinates Display Badge */}
                                    {selectedCoordinates && (
                                        <div data-map-overlay="bottom" className="absolute bottom-4 left-4 z-[1000] bg-white/95 backdrop-blur-md px-4 py-3 rounded-2xl shadow-xl border border-amber-200/90 text-xs text-slate-800 flex items-start gap-3 transition-all animate-in fade-in slide-in-from-bottom-2 duration-300">
                                            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-500 to-role text-white flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
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
                                                className={`px-3 py-1.5 rounded-xl transition-all duration-200 cursor-pointer ${mapMode === 'pins' ? 'bg-role-strong text-white shadow-sm font-black' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100/60'}`}
                                            >
                                                Pins
                                            </button>
                                            <button
                                                onClick={() => setMapMode('heatmap')}
                                                className={`px-3 py-1.5 rounded-xl transition-all duration-200 cursor-pointer ${mapMode === 'heatmap' ? 'bg-role-strong text-white shadow-sm font-black' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100/60'}`}
                                            >
                                                Heatmap
                                            </button>
                                            <button
                                                onClick={() => setMapMode('both')}
                                                className={`px-3 py-1.5 rounded-xl transition-all duration-200 cursor-pointer ${mapMode === 'both' ? 'bg-role-strong text-white shadow-sm font-black' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100/60'}`}
                                            >
                                                Both
                                            </button>
                                        </div>

                                        <button
                                            onClick={() => setIsMapExpanded(true)}
                                            className="p-2.5 bg-white/90 hover:bg-white text-slate-700 hover:text-role-strong rounded-2xl border border-white/80 shadow-md transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer"
                                            title="Expand Map"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h3a1 1 0 010 2H5v2a1 1 0 01-2 0V4zm14 0a1 1 0 00-1-1h-3a1 1 0 110 2h2v2a1 1 0 112 0V4zM3 16a1 1 0 001 1h3a1 1 0 100-2H5v-2a1 1 0 10-2 0v3zm14 0a1 1 0 01-1 1h-3a1 1 0 100-2h2v-2a1 1 0 102 0v3z" />
                                            </svg>
                                        </button>
                                    </div>

                                </div>
                            </div>

                            {/* PERSONNEL STATUS TABLE */}
                            <div className="bg-white rounded-[28px] shadow-[0_4px_24px_rgba(0,0,0,0.02)] border border-slate-100/90 p-5 sm:p-6 transition-all duration-300 hover:shadow-xl hover:shadow-slate-100/80 group/table flex flex-col">
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
                                            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 cursor-pointer active:scale-95 ${personnelFilter === 'all' ? 'bg-role-strong text-white shadow-xs font-black' : 'text-slate-500 hover:text-slate-900 hover:bg-white'}`}
                                        >
                                            All ({displayPersonnelList.length})
                                        </button>
                                        <button
                                            onClick={() => setPersonnelFilter('available')}
                                            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 cursor-pointer flex items-center gap-1.5 active:scale-95 ${personnelFilter === 'available' ? 'bg-role-strong text-white shadow-xs font-black' : 'text-slate-500 hover:text-slate-900 hover:bg-white'}`}
                                        >
                                            <span className="relative flex h-2 w-2">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                            </span>
                                            Available ({availablePersonnelCount})
                                        </button>
                                        <button
                                            onClick={() => setPersonnelFilter('on_mission')}
                                            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 cursor-pointer flex items-center gap-1.5 active:scale-95 ${personnelFilter === 'on_mission' ? 'bg-role-strong text-white shadow-xs font-black' : 'text-slate-500 hover:text-slate-900 hover:bg-white'}`}
                                        >
                                            <span className="relative flex h-2 w-2">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                                            </span>
                                            On Mission ({uniqueAssigned})
                                        </button>
                                        <button
                                            onClick={() => setPersonnelFilter('off_duty')}
                                            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${personnelFilter === 'off_duty' ? 'bg-role-strong text-white' : 'text-slate-500 hover:text-slate-900 hover:bg-white'}`}
                                        >
                                            Off duty ({offDutyPersonnelCount})
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
                                            {shownPersonnel.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={5} className="py-8 text-center text-slate-400">
                                                            <p className="font-semibold text-xs text-slate-500">No personnel match this filter</p>
                                                            <p className="text-[11px] text-slate-400 mt-0.5">Officers registered to this barangay will be listed here.</p>
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    shownPersonnel
                                                        .map((p) => {
                                                            const activeRescue = isPersonAssigned(p.user_id);
                                                            const offDuty = getPersonnelAvailability(p, Boolean(activeRescue)) === 'off_duty';
                                                            return (
                                                                <tr
                                                                    key={p.user_id}
                                                                    className="relative hover:bg-gradient-to-r hover:from-blue-50/60 hover:via-indigo-50/20 hover:to-transparent transition-all duration-300 group/row hover:translate-x-1 cursor-default before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1 before:rounded-r-full before:bg-blue-500 before:opacity-0 group-hover/row:before:opacity-100 before:transition-opacity before:duration-300"
                                                                >
                                                                    <td className="py-3.5 pl-3 font-bold text-slate-900 flex items-center gap-3">
                                                                        <div className="relative shrink-0">
                                                                            <img loading="lazy" decoding="async"
                                                                                src={getProfilePicture(p.profile_picture)}
                                                                                alt={p.name}
                                                                                className={`w-10 h-10 rounded-full object-cover border-2 border-white shadow-sm ring-2 ${offDuty ? 'ring-slate-300/80' : activeRescue ? 'ring-amber-400/80 animate-pulse' : 'ring-emerald-300/80'} group-hover/row:scale-110 group-hover/row:rotate-3 transition-all duration-300`}
                                                                                onError={(e) => { e.currentTarget.src = DEFAULT_AVATAR; }}
                                                                            />
                                                                            {offDuty ? (
                                                                                <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-slate-400 border-2 border-white" />
                                                                            ) : activeRescue ? (
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
                                                                        {offDuty ? (
                                                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                                                                                <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                                                                                Off duty
                                                                            </span>
                                                                        ) : activeRescue ? (
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
                                                                                    <span className="text-[10px] text-slate-500 truncate max-w-[150px] mt-0.5">{activeRescue.report?.landmark || 'Location not recorded'}</span>
                                                                                </div>
                                                                                <span className="text-blue-600 font-bold text-xs group-hover/case:translate-x-1 group-hover/case:-translate-y-0.5 transition-transform shrink-0">↗</span>
                                                                            </div>
                                                                        ) : (
                                                                            <span className="text-slate-400 italic text-[11px] flex items-center gap-1.5 group-hover/row:text-slate-600 transition-colors">
                                                                                {offDuty ? 'Not available for dispatch' : 'Standby for dispatch'}
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

                        {/* RIGHT COLUMN (COL-SPAN-4): RESCUE INSIGHTS, RECENT INCIDENTS & HOLDING FACILITY */}
                        <div className="lg:col-span-4 flex flex-col gap-4">

                            {/* RESCUE INSIGHTS CARD */}
                            <div className="bg-white rounded-[28px] shadow-[0_4px_24px_rgba(0,0,0,0.02)] border border-slate-100/90 p-5 sm:p-6 flex flex-col gap-4 transition-all duration-300 hover:shadow-xl hover:shadow-slate-100/80 group/insights">
                                {/* Header */}
                                <div className="flex items-center gap-3.5 pb-3 border-b border-slate-100/80">
                                    <div className="w-11 h-11 rounded-[16px] bg-gradient-to-br from-amber-50 to-role-muted/80 text-amber-600 border border-amber-200/60 flex items-center justify-center shrink-0 shadow-xs group-hover/insights:scale-105 transition-transform duration-200">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M21.731 2.269a2.625 2.625 0 00-3.712 0l-1.157 1.157 3.712 3.712 1.157-1.157a2.625 2.625 0 000-3.712zM19.513 8.199l-3.712-3.712-12.15 12.15a5.25 5.25 0 00-1.32 2.214l-.8 2.685a.75.75 0 00.933.933l2.685-.8a5.25 5.25 0 002.214-1.32L19.513 8.2z" />
                                        </svg>
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-[18px] font-black text-slate-900 tracking-tight leading-tight">
                                                Rescue Insights
                                            </h3>
                                            <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                                                Live summary
                                            </span>
                                        </div>
                                        <p className="text-[12px] font-normal text-slate-400 mt-0.5">
                                            Dynamic response & capacity analytics
                                        </p>
                                    </div>
                                </div>

                                {/* Insights List */}
                                <div className="flex flex-col divide-y divide-slate-100">
                                    {/* 1. SYSTEM STATUS */}
                                    <div className="flex items-start gap-3 py-2.5">
                                        <div className="w-7 h-7 rounded-lg bg-role-soft text-role-hover flex items-center justify-center shrink-0">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                                            </svg>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-bold text-role-hover leading-none">System status</p>
                                            <p className="text-xs font-medium text-slate-700 leading-snug mt-1.5">
                                                {endorsedReports.filter(r => r.urgency === 'High' || r.urgency === 'Critical' || r.priority_level === 'High').length > 0
                                                    ? `${endorsedReports.filter(r => r.urgency === 'High' || r.urgency === 'Critical' || r.priority_level === 'High').length} high-priority endorsed reports monitored in field.`
                                                    : 'No high-priority active reports. System status normal and clear.'}
                                            </p>
                                        </div>
                                    </div>

                                    {/* 2. TEAMS READY */}
                                    <div className="flex items-start gap-3 py-2.5">
                                        <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-bold text-emerald-700 leading-none">Teams ready</p>
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
                                    <div className="flex items-start gap-3 py-2.5">
                                        <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-bold text-blue-700 leading-none">Staff capacity</p>
                                            <p className="text-xs font-medium text-slate-700 leading-snug mt-1.5">
                                                <strong className="text-slate-900 font-bold">{uniqueAssigned || 0} officers</strong> in field • <strong className="text-slate-900 font-bold">{availablePersonnelCount} officers</strong> ready for dispatch.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            {/* RECENT INCIDENTS */}
                            <div className="bg-white rounded-[28px] shadow-[0_4px_24px_rgba(0,0,0,0.02)] border border-slate-100/90 p-5 sm:p-6 flex flex-col justify-between transition-all duration-300 hover:shadow-xl hover:shadow-slate-100/80 group/incidents">
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
                                                        <img loading="lazy" decoding="async"
                                                            src={cloudinaryResized(incident.image, 320)}
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

                            {/* HOLDING FACILITY PERIOD CARD */}
                            <div className="bg-white rounded-[28px] shadow-[0_4px_24px_rgba(0,0,0,0.02)] border border-slate-100/80 p-5 sm:p-6 transition-all duration-300 hover:shadow-xl hover:shadow-slate-100/80 flex flex-col group/card relative">
                                {/* Header */}
                                <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100/80">
                                    <div className="flex items-center gap-3">
                                        <div className="w-11 h-11 rounded-[16px] bg-gradient-to-br from-amber-500/15 via-amber-500/10 to-orange-500/10 text-amber-600 border border-amber-200/80 flex items-center justify-center shrink-0 shadow-xs">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-[17px] font-black text-slate-900 tracking-tight leading-tight">
                                                    Holding Facility Period
                                                </h3>
                                                <span className="text-[9.5px] font-black uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full shadow-3xs">
                                                    {activeHoldingAnimals.length} In Custody
                                                </span>
                                            </div>
                                            <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                                                7-day holding countdown monitoring before CVO endorsement
                                            </p>
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => navigate('/brgy/holding-facility')}
                                        className="text-[11px] font-bold text-role hover:text-role-hover hover:underline shrink-0 cursor-pointer flex items-center gap-1"
                                    >
                                        <span>Facility</span>
                                        <span>→</span>
                                    </button>
                                </div>

                                {/* Animals List */}
                                <div className="space-y-3 overflow-y-auto max-h-[380px] custom-scrollbar pr-0.5">
                                    {activeHoldingAnimals.length === 0 ? (
                                        <div className="text-center py-8 px-4 bg-slate-50/70 rounded-2xl border border-dashed border-slate-200 flex flex-col items-center justify-center">
                                            <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center text-lg mx-auto mb-2 border border-emerald-100 shadow-2xs">
                                                ✓
                                            </div>
                                            <p className="text-xs font-bold text-slate-700">No animals currently in holding</p>
                                            <p className="text-[11px] text-slate-400 mt-0.5 max-w-xs">
                                                All rescued animals have completed holding, were claimed, or transferred.
                                            </p>
                                        </div>
                                    ) : (
                                        activeHoldingAnimals.map((animal: any) => {
                                            const savedStay = typeof window !== 'undefined' ? localStorage.getItem('holding_impound_stay_duration') : null;
                                            const parsedStay = savedStay !== null ? parseInt(savedStay, 10) : NaN;
                                            const HOLDING_DAYS_LIMIT = (!isNaN(parsedStay) && parsedStay > 0) ? parsedStay : 7;

                                            const normalizeDate = (d: any): number => {
                                                if (!d) return Date.now();
                                                if (typeof d === 'number') return d;
                                                const s = String(d).trim().replace(' ', 'T');
                                                const parsed = new Date(s).getTime();
                                                return isNaN(parsed) ? Date.now() : parsed;
                                            };

                                            const rawDate = animal.facility_intake_date || animal.intake_date || animal.brgy_intake_date || animal.created_at || animal.report?.created_at;
                                            const intakeTime = normalizeDate(rawDate);
                                            const now = Date.now();

                                            const elapsedMs = Math.max(0, now - intakeTime);
                                            const elapsedDays = Math.floor(elapsedMs / (1000 * 60 * 60 * 24));
                                            const totalHoldingMs = HOLDING_DAYS_LIMIT * 24 * 60 * 60 * 1000;
                                            const expirationTime = intakeTime + totalHoldingMs;
                                            const msRemaining = expirationTime - now;

                                            const daysRemaining = Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));
                                            const hoursRemaining = Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60)));
                                            const isExpired = msRemaining <= 0;
                                            const isUrgent = !isExpired && daysRemaining <= 2;

                                            const currentDay = isExpired
                                                ? HOLDING_DAYS_LIMIT
                                                : Math.min(HOLDING_DAYS_LIMIT, Math.max(1, elapsedDays + 1));

                                            const elapsedPercent = isExpired
                                                ? 100
                                                : Math.min(100, Math.max(1, Math.round((elapsedMs / totalHoldingMs) * 100)));

                                            const formattedDate = rawDate
                                                ? new Date(intakeTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                                                : 'Recently Rescued';

                                            const formattedExpiryDate = new Date(expirationTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

                                            const animalDisplayName = animal.animal_name || animal.name || `${animal.breed || animal.animal_type || 'Stray'} #${animal.report_id || animal.holding_id}`;
                                            const caseId = `#${(animal.report_id || animal.holding_id || 0).toString().padStart(4, '0')}`;

                                            const photoUrl = animal.original_photo_url || 
                                                animal.report_media?.find((m: any) => m.file_url && !m.is_evidence)?.file_url ||
                                                animal.report?.media?.find((m: any) => m.file_url)?.file_url;

                                            return (
                                                <div
                                                    key={animal.holding_id || animal.report_id}
                                                    onClick={() => navigate('/brgy/holding-facility')}
                                                    className="bg-white rounded-2xl p-3.5 border border-slate-100 hover:border-amber-300/80 shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer relative overflow-hidden group flex flex-col gap-2.5"
                                                >
                                                    {/* Accent stripe */}
                                                    <div
                                                        className={`absolute left-0 top-0 bottom-0 w-1.5 rounded-l-2xl ${
                                                            isExpired
                                                                ? 'bg-rose-500'
                                                                : isUrgent
                                                                ? 'bg-amber-500'
                                                                : 'bg-role'
                                                        }`}
                                                    />

                                                    {/* Top row: Name & Case ID + Days remaining badge */}
                                                    <div className="flex items-start justify-between gap-2 pl-1.5">
                                                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                                            {photoUrl ? (
                                                                <img loading="lazy" decoding="async"
                                                                    src={cloudinaryResized(photoUrl, 320)}
                                                                    alt={animalDisplayName}
                                                                    className="w-10 h-10 rounded-xl object-cover shrink-0 border border-slate-100 group-hover:scale-105 transition-transform"
                                                                />
                                                            ) : (
                                                                <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 flex items-center justify-center shrink-0 text-base font-bold">
                                                                    {animal.animal_type?.toLowerCase() === 'cat' ? '🐱' : '🐶'}
                                                                </div>
                                                            )}
                                                            <div className="min-w-0 flex-1">
                                                                <div className="flex items-center gap-1.5">
                                                                    <h4 className="text-xs font-black text-slate-900 truncate group-hover:text-role transition-colors">
                                                                        {animalDisplayName}
                                                                    </h4>
                                                                    <span className="text-[10px] font-mono font-bold text-slate-400 shrink-0">
                                                                        {caseId}
                                                                    </span>
                                                                </div>
                                                                <p className="text-[10.5px] text-slate-500 font-medium truncate mt-0.5">
                                                                    {animal.animal_type || 'Animal'} {animal.breed ? `• ${animal.breed}` : ''} {animal.kennel_slot ? `• Kennel ${animal.kennel_slot}` : ''}
                                                                </p>
                                                            </div>
                                                        </div>

                                                        {/* Days remaining badge */}
                                                        <span
                                                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shrink-0 border ${
                                                                isExpired
                                                                    ? 'bg-rose-50 text-rose-700 border-rose-200 animate-pulse'
                                                                    : isUrgent
                                                                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                                                                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                            }`}
                                                        >
                                                            <Clock className="w-3 h-3" />
                                                            {isExpired ? (
                                                                <span>0 Days Left</span>
                                                            ) : daysRemaining === 1 && hoursRemaining <= 24 ? (
                                                                <span>{hoursRemaining}h Left</span>
                                                            ) : (
                                                                <span>{daysRemaining} Day{daysRemaining > 1 ? 's' : ''} Left</span>
                                                            )}
                                                        </span>
                                                    </div>

                                                    {/* Progress bar (Day X of Limit) */}
                                                    <div className="pl-1.5">
                                                        <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 mb-1">
                                                            <span>Day {currentDay} of {HOLDING_DAYS_LIMIT}</span>
                                                            <span>{elapsedPercent}% elapsed</span>
                                                        </div>
                                                        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                                            <div
                                                                className={`h-full rounded-full transition-all duration-500 ${
                                                                    isExpired
                                                                        ? 'bg-rose-500'
                                                                        : isUrgent
                                                                        ? 'bg-amber-500'
                                                                        : 'bg-role'
                                                                }`}
                                                                style={{ width: `${elapsedPercent}%` }}
                                                            />
                                                        </div>
                                                    </div>

                                                    {/* Bottom row: Rescued Date & Exact Expiration Date */}
                                                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-[11px] pl-1.5">
                                                        <div className="flex items-center gap-1.5 text-slate-500 font-medium">
                                                            <span className="text-slate-400">Rescued:</span>
                                                            <span className="font-bold text-slate-700">{formattedDate}</span>
                                                        </div>

                                                        <div className="flex items-center gap-1 text-[10.5px] font-medium">
                                                            <span className="text-slate-400">Holding End:</span>
                                                            <span className={`font-bold ${isExpired ? 'text-rose-600' : 'text-slate-700'}`}>{formattedExpiryDate}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
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
                                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-role to-amber-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-role/25">
                                    <Activity className="w-5 h-5 animate-pulse" />
                                </div>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-role-soft text-role-strong text-[10px] font-black uppercase tracking-wider border border-role-border shadow-2xs">
                                            <span className="w-1.5 h-1.5 rounded-full bg-role animate-ping" /> Live Telemetry
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
                            <div className="bg-gradient-to-br from-amber-50 to-role-muted/70 border border-amber-200/90 rounded-2xl p-3 shadow-2xs flex items-center justify-between transition-transform active:scale-95 hover:shadow-xs">
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
                                routing={getRoutingConfig()}
                                onMarkerClick={(m) => {
                                    if (m.id === -1 || m.id === -999) {
                                        setSelectedReport(null);
                                        setIsNavigating(false);
                                    } else {
                                        const fullReport = reports.find(r => r.report_id.toString() === m.id.toString()) || m.rawData;
                                        if (fullReport) {
                                            setSelectedReport(fullReport);
                                        }
                                    }
                                }}
                                onDirectionsClick={handleDirectionsFromMe}
                                onDirectionsFromBrgyClick={handleDirectionsFromBrgyHall}
                            />

                            {/* Modal Floating Coordinates Display Badge (bottom left; steps aside for the report card on narrow maps) */}
                            {selectedCoordinates && (
                                <div data-map-overlay="bottom" className="absolute bottom-3 left-3 z-[990] bg-white/95 backdrop-blur-md px-3.5 py-2.5 rounded-2xl shadow-xl border border-amber-200/90 text-xs text-slate-800 flex items-start gap-2.5 transition-all animate-in fade-in slide-in-from-top-2 duration-300 max-w-[220px]">
                                    <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-amber-500 to-role text-white flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
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
                                        <span className="w-2 h-2 rounded-full bg-role" />
                                        <span>Legend</span>
                                        <span className="text-[9px] text-slate-400">{isModalLegendOpen ? '▲' : '▼'}</span>
                                    </button>

                                    {isModalLegendOpen && (
                                        <div className="absolute top-full mt-1.5 right-0 bg-white/95 backdrop-blur-md p-3 rounded-2xl shadow-xl border border-slate-200/90 text-[10px] font-bold text-slate-700 flex flex-col gap-1.5 min-w-[125px] animate-in fade-in zoom-in-95 duration-150">
                                            <div className="text-[8px] font-black uppercase text-slate-400 tracking-wider mb-0.5">STATUS LEGEND</div>
                                            <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#EF4444] shadow-xs shrink-0" /><span>Pending</span></div>
                                            <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-role shadow-xs shrink-0" /><span>Endorsed</span></div>
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
                                <ReportDescription description={selectedDetailReport.description} emptyText="No description provided." />
                            </div>

                            {/* Mission details */}
                            <div className="bg-teal-50/40 p-3.5 rounded-[18px] border border-teal-200/50">
                                <span className="text-[10px] font-black text-role-strong uppercase tracking-wider block mb-1">Current Dispatch Status</span>
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
                                className="px-6 py-2.5 bg-role-strong hover:bg-role-hover text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-colors shadow-sm cursor-pointer"
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
                                        const availability = getPersonnelAvailability(p, Boolean(isPersonAssigned(p.user_id)));
                                        return (
                                            <option key={p.user_id} value={p.user_id} disabled={availability === 'off_duty'}>
                                                {p.name} ({p.position_name || 'Responder'}) - {availability === 'off_duty' ? 'Off duty' : availability === 'on_mission' ? 'On Active Mission' : 'Available'}
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
