import { useEffect, useState, useRef, useMemo } from 'react';

import { useAutoRefresh } from '../../utils/useAutoRefresh';
import { useNavigate } from 'react-router-dom';
import { Maximize2, Minimize2 } from 'lucide-react';
import { api } from '../../utils/api';
import MapComponent from '../../components/MapComponent';
import { checkLocalGpsFix } from '../../utils/liveNavigation';
import SubdSidebar from '../../components/SubdSidebar';
import SubdNavbar from '../../components/Navbars/SubdNavbar';
import SubdBottomNav from '../../components/Navbars/SubdBottomNav';
import { getCachedData, setCachedData } from '../../utils/cache';

import { SELERA_DEFAULT_CENTER } from '../../utils/coverageArea';
import ReportDescription from '../../components/ReportDescription';
import { reportDescriptionSummary } from '../../utils/reportDescription';
import { DEFAULT_DATE_PRESET, heatPoints, isActiveReport, isInDateRange, isLostPetReport } from '../../utils/heatmap';
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

const SubdDashboard = () => {
    const navigate = useNavigate();

    const [reports, setReports] = useState<Report[]>(() => getCachedData<Report[]>('subd_dashboard_reports') || []);
    const [petsList, setPetsList] = useState<any[]>(() => getCachedData<any[]>('subd_dashboard_pets') || []);
    const [petCount, setPetCount] = useState<number>(() => getCachedData<number>('subd_dashboard_pets_count') || 0);
    const [announcements, setAnnouncements] = useState<any[]>(() => getCachedData<any[]>('subd_dashboard_announcements') || []);
    const [loading, setLoading] = useState<boolean>(() => !getCachedData<Report[]>('subd_dashboard_reports'));
    const [priorityFilter, setPriorityFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
    const [mapMode, setMapMode] = useState<'pins' | 'heatmap' | 'both'>('both');
    const [isMapExpanded, setIsMapExpanded] = useState(false);
    const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
    const expandedMapContainerRef = useRef<HTMLDivElement>(null);

    const toggleNativeFullscreen = () => {
        if (!document.fullscreenElement) {
            expandedMapContainerRef.current?.requestFullscreen?.().catch(() => {});
            setIsNativeFullscreen(true);
        } else {
            document.exitFullscreen?.().catch(() => {});
            setIsNativeFullscreen(false);
        }
    };

    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsNativeFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    const handleCloseExpandedMap = () => {
        if (document.fullscreenElement) {
            document.exitFullscreen?.().catch(() => {});
        }
        setIsMapExpanded(false);
    };
    const [selectedDetailReport, setSelectedDetailReport] = useState<any>(null);
    const [selectedReport, setSelectedReport] = useState<any>(null);
    const [isNavigating, setIsNavigating] = useState(false);
    const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
    const [geoToast, setGeoToast] = useState<{ message: string; type: 'error' | 'info' } | null>(null);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [trendFilter, setTrendFilter] = useState<'7D' | '4W' | '6M' | '1Y'>('7D');

    // Priority Response Queue filter
    const [priorityQueueFilter, setPriorityQueueFilter] = useState<'all' | 'high' | 'unassigned' | 'my_cases'>('all');

    const mapSectionRef = useRef<HTMLDivElement>(null);
    const chartScrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!geoToast) return;
        const timer = setTimeout(() => {
            setGeoToast(null);
        }, 6000);
        return () => clearTimeout(timer);
    }, [geoToast]);

    useEffect(() => {
        if (chartScrollRef.current) {
            chartScrollRef.current.scrollLeft = chartScrollRef.current.scrollWidth;
        }
    }, [trendFilter, reports]);

    useEffect(() => {
        if ("geolocation" in navigator) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    if (checkLocalGpsFix(position.coords).reliable) {
                        setUserLocation([position.coords.latitude, position.coords.longitude]);
                    }
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

    const fetchAllRef = useRef<(() => Promise<void>) | null>(null);
    useEffect(() => {
        const rawUser = localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user');
        const user = rawUser ? JSON.parse(rawUser) : null;
        const subId = user?.subdivision_id || 1;

        const fetchAll = async () => {
            if (!getCachedData('subd_dashboard_reports')) {
                setLoading(true);
            }
            try {
                const reportsUrl = subId ? `/reports/?subdivision_id=${subId}` : '/reports/';
                const petsUrl = subId ? `/pets/subdivision/${subId}` : '/pets/';
                const announcementsUrl = subId ? `/announcements/subdivision/${subId}` : '/announcements/';

                const [reportsRes, petsRes, announcementsRes] = await Promise.allSettled([
                    api.get(reportsUrl),
                    api.get(petsUrl),
                    api.get(announcementsUrl),
                ]);
                if (reportsRes.status === 'fulfilled') {
                    // Dashboard counts are per incident: animal records split from a group report are counted with their group
                    const repData = (reportsRes.value.data || []).filter((r: any) => !r.split_from_report_id);
                    setReports(repData);
                    setCachedData('subd_dashboard_reports', repData);
                }
                if (petsRes.status === 'fulfilled') {
                    const pData = petsRes.value.data || [];
                    setPetsList(pData);
                    setPetCount(pData.length);
                    setCachedData('subd_dashboard_pets', pData);
                    setCachedData('subd_dashboard_pets_count', pData.length);
                }
                if (announcementsRes.status === 'fulfilled') {
                    const annData = announcementsRes.value.data || [];
                    setAnnouncements(annData);
                    setCachedData('subd_dashboard_announcements', annData);
                }
            } catch (err) {
                console.error('Dashboard fetch error:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchAllRef.current = fetchAll;
        fetchAll();
    }, []);
    // Status sync: counts follow status changes made elsewhere (cached data stays on screen while it refreshes)
    useAutoRefresh(() => fetchAllRef.current?.());

    // Closed = the backend's closed statuses (utils/heatmap.ts); Picked Up (6) is still an open case
    const isResolvedOrClosed = (r: Report) => !isActiveReport(r);
    const activeReports = reports.filter(r => !isResolvedOrClosed(r));
    const currentUserId = currentUser?.user_id || currentUser?.id || 3;

    // Summary Card Statistics Calculations based on real database records
    const pendingReviewReports = reports.filter(r =>
        (r.status_id === 1 || r.status_id === 2 || !r.is_verified || r.verification_status === 'unverified') &&
        !isResolvedOrClosed(r)
    );
    const pendingReviewCount = pendingReviewReports.length;

    const currentReferralCount = reports.filter(r => r.status_id === 4).length;
    const displayPetCount = petCount;

    // Subtitle for Registered Pets: calculate pets registered in the current month (or last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const petsRegisteredThisMonth = petsList.filter(p => p.created_at && new Date(p.created_at) >= thirtyDaysAgo).length;

    // Helper functions for consistent priority categorization
    const isReportHighPriority = (r: Report) => {
        const p1 = (r.priority_level || '').toLowerCase();
        const p2 = (r.ai_suggested_priority || '').toLowerCase();
        const p3 = (r.ai_suggested_risk_level || '').toLowerCase();
        return p1.includes('high') || p1.includes('critical') || p1.includes('emergency') ||
               p2.includes('high') || p2.includes('critical') || p2.includes('emergency') ||
               p3.includes('high') || p3.includes('critical') || p3.includes('emergency');
    };

    const isReportMediumPriority = (r: Report) => {
        if (isReportHighPriority(r)) return false;
        const p1 = (r.priority_level || '').toLowerCase();
        const p2 = (r.ai_suggested_priority || '').toLowerCase();
        return p1.includes('medium') || p1.includes('regular') || p2.includes('medium') || p2.includes('regular');
    };

    const isReportLowPriority = (r: Report) => {
        if (isReportHighPriority(r) || isReportMediumPriority(r)) return false;
        const p1 = (r.priority_level || '').toLowerCase();
        const p2 = (r.ai_suggested_priority || '').toLowerCase();
        return p1.includes('low') || p2.includes('low');
    };

    // Filtered reports for Map based on priority
    const filteredMapReports = activeReports.filter(r => {
        if (isLostPetReport(r)) return false;
        if (priorityFilter === 'all') return true;
        if (priorityFilter === 'high') return isReportHighPriority(r);
        if (priorityFilter === 'medium') return isReportMediumPriority(r);
        if (priorityFilter === 'low') return isReportLowPriority(r);
        return true;
    });

    const highCount = activeReports.filter(isReportHighPriority).length;
    const medCount = activeReports.filter(isReportMediumPriority).length;
    const lowCount = activeReports.filter(isReportLowPriority).length;
    const totalActiveCount = activeReports.length;

    // Trend chart data calculation from actual database reports
    const trendData = (() => {
        const data: { label: string; count: number }[] = [];
        const nowDate = new Date();

        if (trendFilter === '7D') {
            for (let i = 6; i >= 0; i--) {
                const d = new Date();
                d.setDate(nowDate.getDate() - i);
                const label = d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
                const dateStr = d.toISOString().slice(0, 10);
                const count = reports.filter(r => r.created_at && r.created_at.slice(0, 10) === dateStr).length;
                data.push({ label, count });
            }
        } else if (trendFilter === '4W') {
            for (let i = 3; i >= 0; i--) {
                const start = new Date(nowDate);
                start.setDate(nowDate.getDate() - (i + 1) * 7);
                const end = new Date(nowDate);
                end.setDate(nowDate.getDate() - i * 7);
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
                const d = new Date(nowDate.getFullYear(), nowDate.getMonth() - i, 1);
                const nextMonth = new Date(nowDate.getFullYear(), nowDate.getMonth() - i + 1, 1);
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
                const d = new Date(nowDate.getFullYear(), nowDate.getMonth() - i, 1);
                const nextMonth = new Date(nowDate.getFullYear(), nowDate.getMonth() - i + 1, 1);
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

    const getStatusName = (statusId: number) => {
        switch (statusId) {
            case 1: return 'Pending Verification';
            case 2: return 'Verified';
            case 3: return 'Rejected';
            case 4: return 'Referred to Barangay';
            case 5: return 'Team Dispatched';
            case 6: return 'Picked Up';
            case 7: return 'Under Observation';
            case 8: return 'Impounded';
            case 9: return 'Claimed by Owner';
            case 10: return 'Released';
            case 11: return 'Incident Resolved';
            case 12: return 'Deceased';
            case 13: return 'Approved by Barangay';
            case 14: return 'Dismissed';
            case 15: return 'Disputed';
            case 16: return 'Under Investigation';
            case 17: return 'Animal Cannot Be Found';
            case 18: return 'Merged Duplicate';
            default: return 'Active';
        }
    };

    // Helper to calculate wait time / elapsed duration
    const formatWaitTime = (dateStr?: string) => {
        if (!dateStr) return '0m';
        const now = new Date().getTime();
        const past = new Date(dateStr).getTime();
        const diffMs = Math.max(0, now - past);
        const mins = Math.floor(diffMs / 60000);
        const hours = Math.floor(mins / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d ${hours % 24}h`;
        if (hours > 0) return `${hours}h ${mins % 60}m`;
        return `${Math.max(mins, 1)}m`;
    };

    const getWaitHours = (dateStr?: string) => {
        if (!dateStr) return 0;
        const now = new Date().getTime();
        const past = new Date(dateStr).getTime();
        return Math.max(0, (now - past) / (1000 * 60 * 60));
    };

    // Current subdivision report queue: priority, verification and leader assignment.
    const priorityQueueItems = useMemo(() => {
        const items: any[] = [];

        // 1. Process active reports
        reports.forEach((r) => {
            if (isResolvedOrClosed(r)) return;

            const isHigh = isReportHighPriority(r);
            const isUnassigned = !r.assigned_leader_id;
            const isAwaitingVerification = r.status_id === 1 || r.status_id === 2 || !r.is_verified || r.verification_status === 'unverified';
            const isMyCase = r.assigned_leader_id === currentUserId;

            if (isHigh || isUnassigned || isAwaitingVerification || isMyCase) {

                const waitHours = getWaitHours(r.created_at);
                const waitTimeText = formatWaitTime(r.created_at);

                let catBadge = {
                    label: 'Awaiting Verification',
                    bg: 'bg-amber-50',
                    text: 'text-amber-700',
                    border: 'border-amber-200',
                    icon: '⏳'
                };

                if (isHigh) {
                    catBadge = {
                        label: 'High Priority',
                        bg: 'bg-rose-50',
                        text: 'text-rose-700',
                        border: 'border-rose-200',
                        icon: '🚨'
                    };
                } else if (isMyCase) {
                    catBadge = {
                        label: 'Assigned to Me',
                        bg: 'bg-role-soft',
                        text: 'text-role-hover',
                        border: 'border-role-border',
                        icon: '👤'
                    };
                } else if (isUnassigned) {
                    catBadge = {
                        label: 'Unassigned Queue',
                        bg: 'bg-indigo-50',
                        text: 'text-indigo-700',
                        border: 'border-indigo-200',
                        icon: '📋'
                    };
                }

                const rawImages = (r.media || []).filter((m: any) => {
                    const url = (m.file_url || m.url || '').toLowerCase();
                    return m.media_type !== 'Document' && !url.endsWith('.pdf') && !url.endsWith('.docx');
                });
                const firstImg = rawImages[0]?.file_url || rawImages[0]?.url;

                items.push({
                    id: `rep-${r.report_id}`,
                    reportId: r.report_id,
                    rawReport: r,
                    title: r.title || `${r.animal_type || 'Stray Animal'} Incident`,
                    animal_type: r.animal_type || 'Animal',
                    breed: r.breed,
                    landmark: r.landmark || 'Subdivision Vicinity',
                    priority: isHigh ? 'High Priority' : (r.priority_level || 'Medium Priority'),
                    statusLabel: r.status?.status_name || getStatusName(r.status_id) || 'Pending',
                    statusId: r.status_id,
                    createdAt: r.created_at || new Date().toISOString(),
                    waitTimeText,
                    waitHours,
                    categoryBadge: catBadge,
                    isHighPriority: isHigh,
                    isUnassigned: isUnassigned,
                    isAwaitingVerification,
                    isMyCase,
                    thumbnailUrl: firstImg
                });
            }
        });

        return items.sort((a, b) => {
            const aScore = (a.isHighPriority ? 100 : 0) + (a.isMyCase ? 60 : 0) + (a.isUnassigned ? 50 : 0) + (a.isAwaitingVerification ? 30 : 0) + Math.min(a.waitHours * 2, 50);
            const bScore = (b.isHighPriority ? 100 : 0) + (b.isMyCase ? 60 : 0) + (b.isUnassigned ? 50 : 0) + (b.isAwaitingVerification ? 30 : 0) + Math.min(b.waitHours * 2, 50);
            return bScore - aScore;
        });
    }, [reports, currentUserId]);

    const isQueueItemHigh = (item: any) => {
        if (item.isHighPriority) return true;
        const p = (item.priority || '').toLowerCase();
        return p.includes('high') || p.includes('critical') || p.includes('emergency');
    };

    const queueHighPriorityCount = priorityQueueItems.filter(isQueueItemHigh).length;
    const queueUnassignedCount = priorityQueueItems.filter(i => i.isUnassigned).length;
    const queueMyCasesCount = priorityQueueItems.filter(i => i.isMyCase).length;

    const displayedPriorityQueueItems = priorityQueueItems.filter(item => {
        if (priorityQueueFilter === 'high') return isQueueItemHigh(item);
        if (priorityQueueFilter === 'unassigned') return item.isUnassigned;
        if (priorityQueueFilter === 'my_cases') return item.isMyCase;
        return true;
    });

    const formatQueuePriorityLabel = (priority: string) => {
        if (!priority) return 'Medium Priority';
        const cleaned = priority.replace(/\b(prio|priority)\b/gi, '').trim();
        return `${cleaned || 'Medium'} Priority`;
    };

    const getQueuePriorityStyle = (priority: string) => {
        const p = (priority || 'medium').toLowerCase();
        if (p.includes('emergency') || p.includes('high') || p.includes('critical')) return 'bg-rose-50 text-rose-700 border-rose-200';
        if (p.includes('low')) return 'bg-blue-50 text-blue-700 border-blue-200';
        return 'bg-amber-50 text-amber-700 border-amber-200';
    };

    const getQueueStatusStyle = (status: string) => {
        const s = (status || 'pending').toLowerCase();
        if (s.includes('escalat') || s.includes('refer')) return 'bg-purple-50 text-purple-700 border-purple-200';
        if (s.includes('dispatch') || s.includes('progress') || s.includes('ongoing')) return 'bg-role-soft text-role-hover border-role-border';
        if (s.includes('unassigned') || s.includes('unverified') || s.includes('review') || s.includes('pending')) return 'bg-amber-50 text-amber-700 border-amber-200';
        if (s.includes('resolved') || s.includes('claimed')) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
        return 'bg-slate-100 text-slate-700 border-slate-200';
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
                title: reportDescriptionSummary(r.description) || `Incident #${r.report_id}`,
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

    // Heat: incidents of the last 30 days, resolved included, at the original sighting (utils/heatmap.ts).
    // The priority filter applies to heat as it does to pins.
    const priorityMatches = (r: Report) => priorityFilter === 'all'
        || (priorityFilter === 'high' && isReportHighPriority(r))
        || (priorityFilter === 'medium' && isReportMediumPriority(r))
        || (priorityFilter === 'low' && isReportLowPriority(r));
    const heatmapPoints: [number, number, number][] = heatPoints(
        reports.filter(r => priorityMatches(r) && isInDateRange(r, DEFAULT_DATE_PRESET))
    );

    const handleLocateOnMap = (r: Report) => {
        setSelectedReport(r);
        setIsNavigating(true);
        if (mapSectionRef.current) {
            mapSectionRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    };

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
                const check = checkLocalGpsFix(pos.coords);
                if (!check.reliable) {
                    setIsNavigating(false);
                    setGeoToast({
                        message: check.message || 'Precise Bulacan GPS unavailable on this device.',
                        type: 'error'
                    });
                    return;
                }
                const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
                setUserLocation(coords);
                setSelectedReport(fullReport);
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

    const getRoutingConfig = () => {
        if (!isNavigating || !selectedReport || !userLocation) return undefined;
        const repLat = parseFloat(selectedReport.latitude || selectedReport.lat);
        const repLng = parseFloat(selectedReport.longitude || selectedReport.lng);
        if (isNaN(repLat) || isNaN(repLng)) return undefined;
        const destName = selectedReport.landmark || selectedReport.title || `Report #${selectedReport.report_id}`;

        return {
            start: userLocation,
            end: [repLat, repLng] as [number, number],
            waypointNames: ["My Current Location", destName] as [string, string],
            onClose: () => setIsNavigating(false),
            live: true
        };
    };

    const leaderName = currentUser?.name || currentUser?.full_name || 'Leader';
    const greetHour = new Date().getHours();
    const greeting = greetHour < 12 ? 'Good morning' : greetHour < 18 ? 'Good afternoon' : 'Good evening';
    const greetingEmoji = greetHour < 18 ? '☀️' : '🌙';

    return (
        <div className="min-h-screen w-full flex bg-[#F8FAFC] font-sans text-slate-800 relative">
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

            {/* Sidebar */}
            <SubdSidebar mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />

            <main className="flex-1 flex flex-col h-screen overflow-hidden">
                {/* Navbar */}
                <SubdNavbar
                    onMenuToggle={() => setMobileMenuOpen(true)}
                    leftContent={
                        <div className="flex flex-col min-w-0 pr-1">
                            <h1 className="text-[12px] min-[360px]:text-[13px] min-[400px]:text-sm sm:text-base md:text-xl font-black text-gray-900 tracking-tight leading-tight uppercase truncate">
                                Subdivision Command Center
                            </h1>
                            <p className="hidden sm:block text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-0.5 leading-none truncate">
                                {currentUser?.subdivision_name ? `${currentUser.subdivision_name}, Sta. Maria, Bulacan` : 'Selera Homes, Sta. Maria, Bulacan'}
                            </p>
                        </div>
                    }
                />

                {/* Dashboard Scrollable Body */}
                <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-4 sm:p-5 lg:p-6 pb-40 md:pb-8 flex flex-col gap-3 sm:gap-4 bg-[#F8FAFC] w-full max-w-full">

                    {/* 1. Greeting */}
                    <div className="bg-white rounded-2xl border border-gray-200/80 p-3 sm:p-4 flex items-center gap-3 min-w-0">
                        <span className="w-10 h-10 rounded-xl bg-role-soft flex items-center justify-center text-xl shrink-0 select-none" aria-hidden="true">{greetingEmoji}</span>
                        <div className="min-w-0 flex-1">
                            <h2 className="text-base sm:text-lg font-black text-slate-900 leading-tight break-words">{greeting}, {leaderName}!</h2>
                            <p className="text-xs text-slate-500 font-medium mt-0.5">Here's what's happening in your subdivision today.</p>
                        </div>
                    </div>

                    {/* 2. Quick overview */}
                    <section aria-label="Quick overview" className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
                        {[
                            { label: 'Pending Review', sub: 'Awaiting verification', value: pendingReviewCount, to: '/subd/reports', tone: 'text-role-hover', note: null as string | null },
                            { label: 'Barangay Referrals', sub: 'Outside StraySafe', value: currentReferralCount, to: '/subd/reports?status=Referred%20to%20Barangay', tone: 'text-blue-600', note: null },
                            { label: 'Registered Pets', sub: 'Subdivision pets', value: displayPetCount, to: '/subd/pet-records', tone: 'text-emerald-600', note: `↑ ${petsRegisteredThisMonth} this month` },
                        ].map((c, i) => (
                            <button
                                key={c.label}
                                type="button"
                                onClick={() => navigate(c.to)}
                                className={`text-left bg-white rounded-2xl border border-gray-200/80 p-3 sm:p-4 flex flex-col gap-1 min-w-0 hover:border-role-border hover:shadow-sm active:scale-[0.99] transition-all cursor-pointer ${i === 2 ? 'col-span-2 sm:col-span-1' : ''}`}
                            >
                                <span className={`text-2xl sm:text-3xl font-black leading-none ${c.tone}`}>{loading ? '…' : c.value}</span>
                                <span className="text-xs font-bold text-slate-800 leading-tight mt-1">{c.label}</span>
                                <span className="text-[11px] font-medium text-slate-500 leading-tight">{c.sub}</span>
                                {c.note && <span className="text-[11px] font-bold text-emerald-600 leading-tight">{c.note}</span>}
                            </button>
                        ))}
                    </section>

                    {/* 3. Main Workspace Grid: Map & Trend (Left) & Actions/Notices/Queue (Right) */}
                    <div className="flex flex-col gap-3 sm:gap-4 lg:grid lg:grid-cols-12 lg:gap-5 lg:items-start">

                        {/* LEFT COLUMN: Map + Incident Trend (8 cols) */}
                        <div className="contents lg:flex lg:col-span-8 lg:flex-col lg:gap-5">

                            {/* A. Community Incident Map Card */}
                            <div ref={mapSectionRef} className="order-2 lg:order-none bg-white rounded-2xl p-3 sm:p-5 border border-gray-200/80 flex flex-col sm:min-h-[520px] min-w-0 scroll-mt-3">

                                {/* Map Header */}
                                <div className="flex items-start justify-between gap-3 mb-3">
                                    <div className="min-w-0">
                                        <h3 className="text-sm sm:text-base font-black text-slate-900 flex items-center gap-2">
                                            <span className="relative flex h-2.5 w-2.5 shrink-0">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-role opacity-75" />
                                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-role" />
                                            </span>
                                            Incident map
                                        </h3>
                                        <p className="text-xs text-slate-500 mt-0.5">Active pins; heat shows the last 30 days of incidents, including resolved cases.</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setIsMapExpanded(true)}
                                        className="h-9 px-3 shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" /></svg> Expand
                                    </button>
                                </div>

                                {/* Priority filter + view mode */}
                                <div className="flex flex-col sm:flex-row gap-2 mb-3">
                                    <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100 rounded-xl flex-1 sm:flex-initial" role="group" aria-label="Priority">
                                        {([
                                            ['all', 'All', totalActiveCount, ''],
                                            ['high', 'High', highCount, 'bg-rose-500'],
                                            ['medium', 'Med', medCount, 'bg-amber-500'],
                                            ['low', 'Low', lowCount, 'bg-emerald-500'],
                                        ] as const).map(([key, label, count, dot]) => {
                                            const on = priorityFilter === key;
                                            return (
                                                <button
                                                    key={key}
                                                    type="button"
                                                    onClick={() => setPriorityFilter(key)}
                                                    aria-pressed={on}
                                                    className={`h-9 sm:px-3 min-w-0 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1 transition-colors cursor-pointer ${on ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
                                                >
                                                    {dot && <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} aria-hidden="true" />}
                                                    <span className="truncate">{label}</span>
                                                    <span className="text-[10px] text-slate-400">{count}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-xl" role="group" aria-label="Map view">
                                        {([['pins', 'Pins'], ['heatmap', 'Heatmap'], ['both', 'Both']] as const).map(([key, label]) => (
                                            <button
                                                key={key}
                                                type="button"
                                                onClick={() => setMapMode(key)}
                                                aria-pressed={mapMode === key}
                                                className={`h-9 sm:px-3 rounded-lg text-xs font-bold transition-colors cursor-pointer ${mapMode === key ? 'bg-role text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
                                            >
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Map Canvas Container */}
                                <div className="w-full h-[300px] sm:h-[440px] md:h-[480px] rounded-xl overflow-hidden border border-slate-100 relative bg-slate-50">
                                    <MapComponent
                                        height="100%"
                                        center={SELERA_DEFAULT_CENTER}
                                        zoom={16.5}
                                        markers={mapMode !== 'heatmap' ? mapMarkers : mapMarkers.filter(m => m.id < 0)}
                                        showHeatmap={mapMode !== 'pins'}
                                        heatmapPoints={heatmapPoints}
                                        showGeofence={true}
                                        showLandmarks={true}
                                        onViewDetails={(marker) => {
                                            const reportId = marker.rawData?.report_id || (marker.id > 0 ? marker.id : null);
                                            if (reportId) {
                                                navigate(`/subd/reports/${reportId}`);
                                            }
                                        }}
                                        routing={getRoutingConfig()}
                                        onMarkerClick={(m) => {
                                            if (m.id < 0) {
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
                                    />

                                    {/* Desktop Floating Bottom-Left Overlay Legend */}
                                    <div data-map-overlay="bottom" className="hidden sm:block absolute bottom-4 left-4 z-[1000]">
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
                                            {mapMode !== 'pins' && (
                                                <>
                                                    <div className="h-px bg-slate-100 my-0.5" />
                                                    <div className="flex items-center gap-2">
                                                        <span className="w-4 h-2 rounded bg-gradient-to-r from-blue-500 via-amber-400 to-rose-500 shadow-xs shrink-0" />
                                                        <span>Incident Heat</span>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Phone legend (priority colours and counts are on the switch above) */}
                                <div className="sm:hidden mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] font-semibold text-slate-600">
                                    <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500" />Verified</span>
                                    <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-slate-300 border border-slate-400" />Unverified</span>
                                    {mapMode !== 'pins' && (
                                        <span className="inline-flex items-center gap-1.5"><span className="w-4 h-2 rounded bg-gradient-to-r from-blue-500 via-amber-400 to-rose-500" />Heat</span>
                                    )}
                                </div>
                            </div>

                            {/* B. Incident Report Trend Card (Below Map) */}
                            <div className="order-3 lg:order-none bg-white rounded-2xl p-3 sm:p-5 border border-gray-200/80 flex flex-col gap-3 min-w-0">
                                {/* Trend Header */}
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-role" viewBox="0 0 20 20" fill="currentColor">
                                                <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
                                            </svg>
                                            <h3 className="text-sm font-black text-slate-900">
                                                Incident Report Trend
                                            </h3>
                                        </div>
                                        <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                                            Frequency of reports received over time
                                        </p>
                                    </div>

                                    {/* Segmented Filter Pills */}
                                    <div className="grid grid-cols-4 sm:inline-grid gap-1 bg-slate-100 p-1 rounded-xl" role="tablist" aria-label="Trend period">
                                        {(['7D', '4W', '6M', '1Y'] as const).map((period) => (
                                            <button
                                                key={period}
                                                type="button"
                                                role="tab"
                                                aria-selected={trendFilter === period}
                                                onClick={() => setTrendFilter(period)}
                                                className={`h-8 px-3 text-xs font-black rounded-lg transition-colors cursor-pointer ${trendFilter === period
                                                        ? 'bg-role text-white shadow-2xs'
                                                        : 'text-slate-600 hover:text-slate-900'
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
                                                                    <div className="mb-1 text-[9px] font-black text-role-hover bg-role-soft border border-role-border/80 shadow-2xs rounded px-1.5 py-0.5 z-20 transition-transform group-hover:scale-110">
                                                                        {day.count}
                                                                    </div>
                                                                    <div
                                                                        className="w-[18px] sm:w-[22px] bg-gradient-to-t from-role to-amber-400 group-hover:from-role-hover group-hover:to-amber-500 rounded-t-md transition-all duration-300 shadow-xs"
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
                        <div className="contents lg:flex lg:col-span-4 lg:flex-col lg:gap-5">

                            {/* 1. Case Insights */}
                            <div className="order-4 lg:order-2 bg-white rounded-2xl p-3 sm:p-5 border border-gray-200/80 flex flex-col gap-2 min-w-0">
                                {/* Header */}
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M21.731 2.269a2.625 2.625 0 00-3.712 0l-1.157 1.157 3.712 3.712 1.157-1.157a2.625 2.625 0 000-3.712zM19.513 8.199l-3.712-3.712-12.15 12.15a5.25 5.25 0 00-1.32 2.214l-.8 2.685a.75.75 0 00.933.933l2.685-.8a5.25 5.25 0 002.214-1.32L19.513 8.2z" />
                                        </svg>
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-sm font-black text-slate-900 leading-tight">
                                                Case Insights
                                            </h3>
                                            <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                                                Current summary
                                            </span>
                                        </div>
                                        <p className="text-[11px] font-medium text-slate-400 mt-0.5">
                                            Dynamic response & subdivision analytics
                                        </p>
                                    </div>
                                </div>

                                {/* Insights List */}
                                <div className="flex flex-col divide-y divide-slate-100">
                                    {/* 1. SYSTEM STATUS */}
                                    <div className="flex items-start gap-3 py-2.5">
                                        <div className="w-7 h-7 rounded-lg bg-role-soft text-role-hover flex items-center justify-center shrink-0">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                                            </svg>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-bold text-role-hover leading-none">System status</p>
                                            <p className="text-xs font-medium text-slate-700 leading-snug mt-1">
                                                {highCount > 0
                                                    ? `${highCount} high-priority incident${highCount > 1 ? 's' : ''} detected in subdivision. Verification advised.`
                                                    : 'No high-priority active incidents. Subdivision status normal and clear.'}
                                            </p>
                                        </div>
                                    </div>

                                    {/* 2. TRIAGE PROGRESS */}
                                    <div className="flex items-start gap-3 py-2.5">
                                        <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-bold text-emerald-700 leading-none">Triage progress</p>
                                            <p className="text-xs font-medium text-slate-700 leading-snug mt-1">
                                                {pendingReviewCount > 0 ? (
                                                    <span><strong className="text-slate-900 font-bold">{pendingReviewCount} report{pendingReviewCount > 1 ? 's' : ''}</strong> awaiting review • <strong className="text-[#059669] font-bold">{currentReferralCount} cases</strong> referred to the Barangay outside StraySafe.</span>
                                                ) : (
                                                    <span>All resident reports verified • <strong className="text-[#059669] font-bold">{currentReferralCount} cases</strong> referred to the Barangay outside StraySafe.</span>
                                                )}
                                            </p>
                                        </div>
                                    </div>


                                </div>
                            </div>

                            {/* 2. PRIORITY RESPONSE QUEUE (first on phones: these need action) */}
                            <div className="order-1 lg:order-1 bg-white rounded-2xl border border-gray-200/80 flex flex-col overflow-hidden min-w-0">
                                {/* Header */}
                                <div className="p-3 sm:p-4 border-b border-slate-100 flex flex-col gap-2.5">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <h3 className="text-sm sm:text-base font-black text-slate-900">Priority queue</h3>
                                            <p className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-1.5">
                                                <span className={`font-bold whitespace-nowrap ${queueHighPriorityCount > 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                                                    {queueHighPriorityCount} urgent
                                                </span>
                                                <span aria-hidden="true">·</span>
                                                <span>Reports that need action</span>
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => navigate('/subd/reports')}
                                            className="h-9 px-1 text-xs font-bold text-role-hover hover:underline shrink-0 cursor-pointer whitespace-nowrap"
                                        >
                                            All reports →
                                        </button>
                                    </div>

                                    {/* Filter */}
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 p-1 bg-slate-100 rounded-xl" role="group" aria-label="Queue filter">
                                        {([
                                            ['all', 'All', priorityQueueItems.length],
                                            ['high', 'High', queueHighPriorityCount],
                                            ['unassigned', 'Unassigned', queueUnassignedCount],
                                            ['my_cases', 'My cases', queueMyCasesCount],
                                        ] as const).map(([key, label, count]) => {
                                            const on = priorityQueueFilter === key;
                                            return (
                                                <button
                                                    key={key}
                                                    type="button"
                                                    onClick={() => setPriorityQueueFilter(key)}
                                                    aria-pressed={on}
                                                    className={`h-9 px-2 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${on ? 'bg-role text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
                                                >
                                                    {label}
                                                    <span className={`text-[10px] ${on ? 'text-white/80' : 'text-slate-400'}`}>{count}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Queue Items List (phones: the page scrolls, no box inside a box; first 5, then a link) */}
                                <div className="p-3 flex flex-col gap-2 lg:max-h-[460px] lg:overflow-y-auto custom-scrollbar">
                                    {displayedPriorityQueueItems.length === 0 ? (
                                        <div className="text-center py-8 px-4">
                                            <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center text-lg mx-auto mb-2">✓</div>
                                            <p className="text-sm font-bold text-slate-700">No urgent cases waiting</p>
                                            <p className="text-xs text-slate-500 mt-0.5">All priority reports in this view are handled.</p>
                                        </div>
                                    ) : (
                                        displayedPriorityQueueItems.map((item, idx) => {
                                            const isCriticalWait = item.waitHours >= 24;
                                            const isModerateWait = item.waitHours >= 4;
                                            const openDetails = () => { if (item.rawReport) setSelectedDetailReport(item.rawReport); };
                                            return (
                                                <div
                                                    key={item.id}
                                                    role="button"
                                                    tabIndex={0}
                                                    onClick={openDetails}
                                                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetails(); } }}
                                                    className={`${idx >= 5 ? 'hidden lg:flex' : 'flex'} items-start gap-3 border border-slate-200/80 rounded-xl p-3 pl-4 bg-white relative overflow-hidden hover:border-role-border active:bg-slate-50 transition-colors cursor-pointer min-w-0`}
                                                >
                                                    <span
                                                        aria-hidden="true"
                                                        className={`absolute left-0 top-0 bottom-0 w-1 ${item.isHighPriority ? 'bg-rose-500' : item.isMyCase ? 'bg-role' : item.isUnassigned ? 'bg-indigo-500' : 'bg-amber-400'}`}
                                                    />
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-sm font-black text-slate-900 leading-snug line-clamp-2 break-words">
                                                            #{item.reportId.toString().padStart(4, '0')} · {item.title}
                                                        </p>
                                                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                                            <span className={`px-1.5 py-px rounded-full text-[11px] font-bold border whitespace-nowrap ${getQueuePriorityStyle(item.priority)}`}>
                                                                {formatQueuePriorityLabel(item.priority).replace(' Priority', '')}
                                                            </span>
                                                            <span className={`px-1.5 py-px rounded-full text-[11px] font-bold border truncate max-w-full ${getQueueStatusStyle(item.statusLabel)}`}>
                                                                {item.statusLabel}
                                                            </span>
                                                        </div>
                                                        <p className="mt-1 text-xs text-slate-500 flex items-center gap-1 min-w-0">
                                                            <span className={`font-semibold whitespace-nowrap ${isCriticalWait ? 'text-rose-600' : isModerateWait ? 'text-amber-700' : 'text-slate-600'}`}>
                                                                {item.waitTimeText} waiting
                                                            </span>
                                                            {item.landmark && <><span aria-hidden="true">·</span><span className="truncate">{item.landmark}</span></>}
                                                        </p>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => { e.stopPropagation(); if (item.rawReport) handleLocateOnMap(item.rawReport); }}
                                                        aria-label={`Show report ${item.reportId} on the map`}
                                                        title="Show on map"
                                                        className="w-10 h-10 shrink-0 rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-role-hover hover:border-role-border flex items-center justify-center cursor-pointer"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                                    </button>
                                                </div>
                                            );
                                        })
                                    )}
                                    {displayedPriorityQueueItems.length > 5 && (
                                        <button
                                            type="button"
                                            onClick={() => navigate('/subd/reports')}
                                            className="lg:hidden h-10 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                                        >
                                            See all {displayedPriorityQueueItems.length} in Reports
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>




                    {/* 4. Secondary Row: Active Hazard Notices */}
                    <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:gap-5 items-start">

                        {/* A. Active Hazard Notices */}
                        <div className="bg-white rounded-2xl p-3 sm:p-5 border border-gray-200/80 flex flex-col gap-2 min-w-0">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-slate-900 font-black text-sm">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M18 3a1 1 0 00-1.447-.894L8.763 6H5a3 3 0 000 6h.28l1.771 5.316A1 1 0 008 18h1a1 1 0 001-1v-4.382l6.553 3.276A1 1 0 0018 15V3z" clipRule="evenodd" />
                                    </svg>
                                    <span>Active Hazard Notices</span>
                                </div>
                                <button
                                    onClick={() => navigate('/subd/hazard-alert')}
                                    className="h-8 px-2 -mr-2 text-xs font-bold text-role-hover hover:underline cursor-pointer"
                                >
                                    View All
                                </button>
                            </div>

                            <div className="flex flex-col divide-y divide-slate-100">
                                {announcements && announcements.length > 0 ? (
                                    announcements.slice(0, 3).map((ann, idx) => {
                                        const isEmergency = ann.category === 'Emergency' || (ann.title || '').toLowerCase().includes('rabies') || (ann.title || '').toLowerCase().includes('alert');
                                        const isAdvisory = ann.category === 'Advisory' || (ann.title || '').toLowerCase().includes('stray');

                                        const cardBg = '';

                                        const iconBg = isEmergency
                                            ? 'bg-rose-500 text-white'
                                            : isAdvisory
                                                ? 'bg-amber-500 text-white'
                                                : 'bg-blue-500 text-white';

                                        const titleColor = 'text-slate-900 group-hover:text-role-hover';
                                        const textColor = 'text-slate-600';
                                        const metaColor = 'text-slate-400';
                                        const arrowColor = 'text-slate-300 group-hover:text-role';

                                        const formattedTime = ann.created_at
                                            ? new Date(ann.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
                                            ' · ' +
                                            new Date(ann.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                                            : 'Recent';

                                        return (
                                            <div
                                                key={ann.announcement_id || idx}
                                                onClick={() => navigate('/subd/hazard-alert')}
                                                className={`py-2.5 flex items-start justify-between gap-2.5 transition-colors cursor-pointer group min-w-0 ${cardBg}`}
                                            >
                                                <div className="flex items-start gap-3 min-w-0">
                                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}>
                                                        {isEmergency ? (
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                                                                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                                            </svg>
                                                        ) : isAdvisory ? (
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                                                <path d="M12 21.5c-3.038 0-5.5-2.462-5.5-5.5s2.462-5.5 5.5-5.5s5.5 2.462 5.5 5.5s-2.462 5.5-5.5 5.5zm-5.5-12c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5s2.5 1.119 2.5 2.5s-1.119 2.5-2.5 2.5zm11 0c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5s2.5 1.119 2.5 2.5s-1.119 2.5-2.5 2.5zM12 8c-1.381 0-2.5-1.119-2.5-2.5S10.619 3 12 3s2.5 1.119 2.5 2.5S13.381 8 12 8z" />
                                                            </svg>
                                                        ) : (
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                                                                <path fillRule="evenodd" d="M18 3a1 1 0 00-1.447-.894L8.763 6H5a3 3 0 000 6h.28l1.771 5.316A1 1 0 008 18h1a1 1 0 001-1v-4.382l6.553 3.276A1 1 0 0018 15V3z" clipRule="evenodd" />
                                                            </svg>
                                                        )}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <h4 className={`text-sm font-bold leading-snug line-clamp-2 break-words transition-colors ${titleColor}`}>
                                                            {ann.title}
                                                        </h4>
                                                        <p className={`text-xs mt-0.5 leading-snug line-clamp-2 break-words ${textColor}`}>
                                                            {ann.content}
                                                        </p>
                                                        <span className={`text-[11px] font-semibold block mt-1 ${metaColor}`}>
                                                            {formattedTime}
                                                        </span>
                                                    </div>
                                                </div>
                                                <span className={`group-hover:translate-x-0.5 transition-all font-bold text-xs mt-1 ${arrowColor}`}>
                                                    ›
                                                </span>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div className="p-6 text-center text-slate-400 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                                        <p className="text-xs font-bold text-slate-600">No active hazard notices</p>
                                        <p className="text-[11px] text-slate-400 mt-1">All clear in your subdivision.</p>
                                    </div>
                                )}
                            </div>
                        </div>


                    </div>

                </div>

                {/* Reusable Mobile Bottom Navigation Component */}
                <SubdBottomNav activeTab="dashboard" onMapClick={() => setIsMapExpanded(true)} />
            </main>

            {/* ENLARGED FULLSCREEN MAP MODAL */}
            {isMapExpanded && (
                <div 
                    ref={expandedMapContainerRef}
                    className="fixed inset-0 z-[9999] bg-white w-full h-full flex flex-col p-3 sm:p-5 overflow-hidden animate-in fade-in duration-200"
                >
                    <div className="w-full h-full flex flex-col overflow-hidden">
                        {/* Header */}
                        <div className="flex justify-between items-center mb-2.5 sm:mb-4 shrink-0 pb-2.5 sm:pb-3 border-b border-gray-100">
                            <div>
                                <h3 className="text-sm sm:text-xl font-black text-gray-900 uppercase tracking-tight">Geospatial Community Map</h3>
                                <p className="text-[9px] sm:text-[11px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Full Subdivision Real-Time View</p>
                            </div>
                            <div className="flex items-center gap-1.5 sm:gap-3">
                                <div className="flex bg-slate-100/90 p-1 rounded-2xl text-[9px] sm:text-[10px] font-black uppercase border border-slate-200/80 shadow-2xs">
                                    <button
                                        onClick={() => setMapMode('pins')}
                                        className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl transition-all cursor-pointer ${mapMode === 'pins' ? 'bg-role text-white shadow-sm font-black' : 'text-slate-500 hover:text-slate-900'}`}
                                    >
                                        Pins
                                    </button>
                                    <button
                                        onClick={() => setMapMode('heatmap')}
                                        className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl transition-all cursor-pointer ${mapMode === 'heatmap' ? 'bg-role text-white shadow-sm font-black' : 'text-slate-500 hover:text-slate-900'}`}
                                    >
                                        Heatmap
                                    </button>
                                    <button
                                        onClick={() => setMapMode('both')}
                                        className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl transition-all cursor-pointer ${mapMode === 'both' ? 'bg-role text-white shadow-sm font-black' : 'text-slate-500 hover:text-slate-900'}`}
                                    >
                                        Both
                                    </button>
                                </div>
                                <button
                                    type="button"
                                    onClick={toggleNativeFullscreen}
                                    className="p-1.5 sm:p-2 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors text-gray-500 hover:text-gray-800 shrink-0 cursor-pointer flex items-center justify-center border border-gray-200"
                                    title={isNativeFullscreen ? "Exit Browser Fullscreen" : "Enter Browser Fullscreen"}
                                >
                                    {isNativeFullscreen ? <Minimize2 className="h-5 w-5 sm:h-6 sm:w-6 text-role" /> : <Maximize2 className="h-5 w-5 sm:h-6 sm:w-6 text-role" />}
                                </button>
                                <button
                                    onClick={handleCloseExpandedMap}
                                    className="p-1.5 sm:p-2 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors text-gray-500 hover:text-gray-800 shrink-0 cursor-pointer border border-gray-200"
                                    title="Close Expanded Map"
                                >
                                    <svg className="h-5 w-5 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        {/* Map Area */}
                        <div className="flex-1 rounded-2xl overflow-hidden relative border border-gray-100 min-h-0">
                            <MapComponent
                                height="100%"
                                center={SELERA_DEFAULT_CENTER}
                                zoom={17}
                                markers={mapMode !== 'heatmap' ? mapMarkers : mapMarkers.filter(m => m.id < 0)}
                                showHeatmap={mapMode !== 'pins'}
                                heatmapPoints={heatmapPoints}
                                showGeofence={true}
                                showLandmarks={true}
                                onViewDetails={(marker) => {
                                    const reportId = marker.rawData?.report_id || (marker.id > 0 ? marker.id : null);
                                    if (reportId) {
                                        setIsMapExpanded(false);
                                        navigate(`/subd/reports/${reportId}`);
                                    }
                                }}
                                routing={getRoutingConfig()}
                                onMarkerClick={(m) => {
                                    if (m.id < 0) {
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
                            />

                            {/* Legend in Expanded Map (steps aside for the report card on narrow maps) */}
                            <div data-map-overlay="bottom" className="absolute bottom-3 left-3 z-[1000]">
                                <div className="bg-white/95 backdrop-blur-md p-2.5 sm:p-3 rounded-2xl shadow-xl border border-slate-200/90 text-[10px] sm:text-[11px] font-bold text-slate-700 flex flex-col gap-1.5 min-w-[115px] sm:min-w-[130px]">
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
                                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider mt-0.5 ${(selectedDetailReport.priority_level || '').toLowerCase() === 'high' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'
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
                                <ReportDescription description={selectedDetailReport.description} emptyText="No description provided." />
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="border-t border-gray-100 pt-4 mt-4 flex items-center justify-between shrink-0">
                            <button
                                onClick={() => navigate(`/subd/reports/${selectedDetailReport.report_id}`)}
                                className="px-4 py-2.5 bg-role hover:bg-role-hover text-white rounded-xl text-xs font-black uppercase tracking-wider transition-colors shadow-sm flex items-center gap-1.5 cursor-pointer"
                            >
                                <span>Open Full Report</span>
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
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
