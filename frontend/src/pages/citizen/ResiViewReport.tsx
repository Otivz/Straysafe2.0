import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useSearchParams, useLocation, Link } from 'react-router-dom';
import api from '../../utils/api';
import {
    Siren, MapPin, PawPrint, Palette, Tag, User, Gift, FileText, Megaphone,
    Crosshair, Search, MessageCircle, Scale, Link2, Shield, AlertTriangle, Phone,
    Hourglass, Compass, Home, Landmark, Ruler, Timer, Flag, X, Lightbulb, Check,
    Syringe, Camera, Info, Map as MapIcon, ScrollText, Maximize2, Minimize2
} from 'lucide-react';
import RelativeTimestamp from '../../components/RelativeTimestamp';
import MapComponent from '../../components/MapComponent';

import ResiNavbar from '../../components/Navbars/ResiNavbar';
import ResiMobileNav from '../../components/Navbars/ResiMobileNav';
import RescueTimeline from '../../components/RescueTimeline';

import ReportChatDrawer from '../../components/Chat/ReportChatDrawer';
import { useReportChatCount } from '../../utils/chatUtils';
import { REPORT_STATUS_MAP } from '../../utils/reportStatus';
import { getProfilePicture, DEFAULT_AVATAR, DEFAULT_PET_AVATAR } from '../../utils/avatar';

const reportStatusMap = REPORT_STATUS_MAP;

const categoryMap: Record<number, string> = {
    1: 'Injured Animal',
    2: 'Aggressive Stray',
    3: 'Possible Rabies Risk',
    4: 'Roaming',
    5: 'Animal Rescue Needed',
    6: 'Lost Pet'
};

const FormattedReportDescription = ({ description }: { description: string }) => {
    if (!description) {
        return <p className="text-sm text-gray-400 dark:text-gray-500 italic">No detailed description provided.</p>;
    }

    if (description.includes('[LOST PET REPORT]')) {
        const lines = description.split('\n').map(l => l.trim()).filter(Boolean);
        const headerLine = lines.find(l => l.includes('[LOST PET REPORT]')) || '';
        const bulletLines = lines.filter(l => l.startsWith('•') && !l.toLowerCase().includes('owner') && !l.toLowerCase().includes('contact'));
        const closingLines = lines.filter(l => !l.includes('[LOST PET REPORT]') && !l.startsWith('•'));

        return (
            <div className="space-y-3.5 my-2">
                <div className="flex items-center gap-2.5 p-3 px-4 bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-950/40 dark:to-orange-950/30 rounded-2xl border border-red-200/80 dark:border-red-900/50 text-red-950 dark:text-red-200 shadow-xs">
                    <Siren className="w-5 h-5 animate-pulse shrink-0 text-red-500" />
                    <p className="text-xs sm:text-sm font-black uppercase tracking-tight">
                        {headerLine.replace('[LOST PET REPORT]', '').trim() || 'Missing Registered Pet Alert'}
                    </p>
                </div>

                {bulletLines.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 bg-[#FAF9F6] dark:bg-[#151C2C] p-4 rounded-3xl border border-stone-200/70 dark:border-gray-800 shadow-xs">
                        {bulletLines.map((b, idx) => {
                            const raw = b.replace(/^•\s*/, '');
                            const colonIdx = raw.indexOf(':');
                            if (colonIdx !== -1) {
                                const key = raw.slice(0, colonIdx).trim();
                                const val = raw.slice(colonIdx + 1).trim();
                                const isWide = key.toLowerCase().includes('circumstances') || 
                                               key.toLowerCase().includes('notes') || 
                                               key.toLowerCase().includes('instructions') ||
                                               key.toLowerCase().includes('last seen');
                                return (
                                    <div 
                                        key={idx} 
                                        className={`p-3 rounded-2xl bg-white dark:bg-[#1E2738] border border-stone-100 dark:border-gray-700/80 shadow-2xs ${isWide ? 'sm:col-span-2' : ''}`}
                                    >
                                        <p className="text-[9px] font-black text-amber-800 dark:text-amber-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                                            {key.toLowerCase().includes('last seen') && <MapPin className="w-3 h-3" />}
                                            {key.toLowerCase().includes('breed') && <PawPrint className="w-3 h-3" />}
                                            {key.toLowerCase().includes('color') && <Palette className="w-3 h-3" />}
                                            {key.toLowerCase().includes('collar') && <Tag className="w-3 h-3" />}
                                            {key.toLowerCase().includes('owner') && <User className="w-3 h-3" />}
                                            {key.toLowerCase().includes('reward') && <Gift className="w-3 h-3" />}
                                            {key.toLowerCase().includes('circumstances') && <FileText className="w-3 h-3" />}
                                            <span>{key}</span>
                                        </p>
                                        <p className="text-xs sm:text-[13px] font-bold text-gray-900 dark:text-white leading-snug">
                                            {val}
                                        </p>
                                    </div>
                                );
                            }
                            return (
                                <div key={idx} className="sm:col-span-2 p-2.5 rounded-2xl bg-white dark:bg-[#1E2738] border border-stone-100 dark:border-gray-700/80 text-xs font-semibold text-gray-800 dark:text-gray-200">
                                    • {raw}
                                </div>
                            );
                        })}
                    </div>
                )}

                {closingLines.length > 0 && (
                    <div className="p-3.5 bg-amber-500/10 dark:bg-amber-950/30 rounded-2xl border border-amber-300/60 dark:border-amber-700/50 text-xs font-bold text-amber-950 dark:text-amber-200 flex items-start gap-2.5 shadow-2xs">
                        <Megaphone className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                        <p className="leading-relaxed">
                            {closingLines.join(' ')}
                        </p>
                    </div>
                )}
            </div>
        );
    }

    return (
        <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed font-medium bg-stone-50/70 dark:bg-[#1E2738] p-4 rounded-2xl border border-stone-100 dark:border-gray-700/80 whitespace-pre-line">
            {description}
        </p>
    );
};

const ResiViewReport = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const location = useLocation();

    const [report, setReport] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);
    const [holdingAnimal, setHoldingAnimal] = useState<any | null>(null);
    const [isNavbarMenuOpen, setIsNavbarMenuOpen] = useState(false);
    const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
    const [activeGallery, setActiveGallery] = useState<{ media: any[], index: number } | null>(null);
    const [selectedQrPreview, setSelectedQrPreview] = useState<{ url: string; petName?: string; hash?: string; ownerName?: string; ownerPhone?: string } | null>(null);

    // Geocoding address
    const [resolvedAddress, setResolvedAddress] = useState('');
    const [isGeocoding, setIsGeocoding] = useState(false);
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [userMatch, setUserMatch] = useState<any | null>(null);

    // Resident Dispute Submission State
    const [isDisputeModalOpen, setIsDisputeModalOpen] = useState(false);
    const [userPets, setUserPets] = useState<any[]>([]);
    const [selectedDisputePetId, setSelectedDisputePetId] = useState<string>('');
    const [disputeReason, setDisputeReason] = useState('');
    const [vaccineCardFile, setVaccineCardFile] = useState<File | null>(null);
    const [supportingPhotoFile, setSupportingPhotoFile] = useState<File | null>(null);
    const [isSubmittingDispute, setIsSubmittingDispute] = useState(false);
    const [disputeSuccessAlert, setDisputeSuccessAlert] = useState(false);

    const userStr = localStorage.getItem('resident_user') || sessionStorage.getItem('resident_user');
    const currentUser = userStr ? JSON.parse(userStr) : null;
    const currentUserId = currentUser ? currentUser.user_id : null;

    // Only the reporter who reported the animal communicates with the subdivision
    const isReporter = Boolean(
        currentUser &&
        report &&
        (
            (report.user_id != null && currentUserId != null && Number(report.user_id) === Number(currentUserId)) ||
            (report.reporter_id != null && currentUserId != null && Number(report.reporter_id) === Number(currentUserId)) ||
            (report.user?.user_id != null && currentUserId != null && Number(report.user.user_id) === Number(currentUserId)) ||
            (currentUser.role_id && currentUser.role_id !== 1)
        )
    );

    const chatCount = useReportChatCount(report?.report_id || 0, isReporter ? currentUserId : null);

    // In-App Turn-by-Turn Routing State with Real-Time GPS Tracking
    const [routingState, setRoutingState] = useState<{
        start: [number, number];
        end: [number, number];
        waypointNames?: [string, string];
        distance?: string;
        time?: string;
        isRealtime?: boolean;
    } | null>(null);
    const [isLocatingRoute, setIsLocatingRoute] = useState(false);
    const [locationNotice, setLocationNotice] = useState<string | null>(null);
    const [locationAmbiguous, setLocationAmbiguous] = useState(false);
    const [isSettingStartingPoint, setIsSettingStartingPoint] = useState(false);
    const [isMapExpanded, setIsMapExpanded] = useState(false);
    const [isMapMaximized, setIsMapMaximized] = useState(false);
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

    const watchIdRef = useRef<number | null>(null);

    const stopLocationTracking = () => {
        if (watchIdRef.current !== null) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
        }
    };

    const handlePinReposition = (lat: number, lng: number) => {
        stopLocationTracking();
        if (!report?.latitude || !report?.longitude) return;
        const destLat = parseFloat(report.latitude);
        const destLng = parseFloat(report.longitude);
        const destName = report.facility?.name || report.landmark || 'Animal Location';

        setIsSettingStartingPoint(false);
        setLocationAmbiguous(false);
        setRoutingState({
            start: [lat, lng],
            end: [destLat, destLng],
            waypointNames: ['Custom Starting Point', destName],
            isRealtime: false
        });
        setLocationNotice('Starting point updated. Route recalculated!');
        setTimeout(() => setLocationNotice(null), 4000);
    };

    const handleSetStartingPointMode = () => {
        setLocationAmbiguous(false);
        setIsSettingStartingPoint(true);
        setLocationNotice('Click anywhere on the map or drag the blue pin to set your starting point.');
        setTimeout(() => {
            const mapEl = document.getElementById('report-map-container');
            if (mapEl) {
                mapEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 100);
    };

    useEffect(() => {
        return () => {
            stopLocationTracking();
        };
    }, []);

    const handleGetDirections = (mode: 'gps' | 'hq' | 'home' = 'gps') => {
        if (routingState && mode === 'gps' && routingState.isRealtime) {
            // Toggle off if already active
            stopLocationTracking();
            setRoutingState(null);
            setLocationNotice(null);
            setLocationAmbiguous(false);
            setIsSettingStartingPoint(false);
            return;
        }

        if (!report?.latitude || !report?.longitude) return;

        const destLat = parseFloat(report.latitude);
        const destLng = parseFloat(report.longitude);
        const destName = report.facility?.name || report.landmark || 'Animal Location';

        const applyRouting = (startLat: number, startLng: number, startLabel: string = 'My Location', isRealtime: boolean = false) => {
            setIsLocatingRoute(false);
            setLocationAmbiguous(false);
            setIsSettingStartingPoint(false);
            setRoutingState({
                start: [startLat, startLng],
                end: [destLat, destLng],
                waypointNames: [startLabel, destName],
                isRealtime
            });
            setTimeout(() => {
                const mapEl = document.getElementById('report-map-container');
                if (mapEl) {
                    mapEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 100);
        };

        if (mode === 'hq') {
            stopLocationTracking();
            setLocationNotice(null);
            applyRouting(14.8069, 121.0039, 'Barangay San Vicente HQ', false);
            return;
        }

        if (mode === 'home') {
            stopLocationTracking();
            setLocationNotice(null);
            if (currentUser?.latitude && currentUser?.longitude) {
                const homeLat = parseFloat(currentUser.latitude);
                const homeLng = parseFloat(currentUser.longitude);
                applyRouting(
                    homeLat, 
                    homeLng, 
                    currentUser?.subdivision_name ? `${currentUser.subdivision_name} (Home)` : 'My Registered Home', 
                    false
                );
            } else {
                setIsLocatingRoute(false);
                alert('No registered home location found in your profile. Please use "From Brgy HQ" or click "Set Starting Point" on the map.');
            }
            return;
        }

        if (mode === 'gps') {
            setLocationAmbiguous(false);
            setIsSettingStartingPoint(false);
            setLocationNotice(null);

            if (navigator.geolocation) {
                stopLocationTracking();
                setIsLocatingRoute(true);

                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        setIsLocatingRoute(false);
                        const accuracy = pos.coords.accuracy;
                        const userLat = pos.coords.latitude;
                        const userLng = pos.coords.longitude;

                        // Check returned coordinates and accuracy value (reliable if accuracy <= 1500 meters)
                        if (typeof accuracy === 'number' && accuracy <= 1500) {
                            applyRouting(userLat, userLng, 'My Current Location', true);

                            // Continue real-time tracking on mobile / active GPS devices
                            try {
                                watchIdRef.current = navigator.geolocation.watchPosition(
                                    (watchPos) => {
                                        if (typeof watchPos.coords.accuracy === 'number' && watchPos.coords.accuracy <= 2000) {
                                            const nextLat = watchPos.coords.latitude;
                                            const nextLng = watchPos.coords.longitude;
                                            setRoutingState((prev) => {
                                                if (!prev) return null;
                                                const distMoved = Math.hypot(prev.start[0] - nextLat, prev.start[1] - nextLng);
                                                if (distMoved > 0.00003) {
                                                    return {
                                                        ...prev,
                                                        start: [nextLat, nextLng]
                                                    };
                                                }
                                                return prev;
                                            });
                                        }
                                    },
                                    (watchErr) => {
                                        console.warn('Real-time location watch warning:', watchErr);
                                    },
                                    {
                                        enableHighAccuracy: true,
                                        maximumAge: 0,
                                        timeout: 15000
                                    }
                                );
                            } catch (e) {
                                console.warn('Could not initialize watchPosition:', e);
                            }
                        } else {
                            // Location cannot be reliably determined (poor accuracy / IP geolocation)
                            console.warn(`Geolocation accuracy too poor (${accuracy}m). Prompting user for options.`);
                            stopLocationTracking();
                            setRoutingState(null);
                            setLocationAmbiguous(true);
                        }
                    },
                    (err) => {
                        console.warn('Geolocation failed or permission denied:', err);
                        setIsLocatingRoute(false);
                        stopLocationTracking();
                        setRoutingState(null);
                        setLocationAmbiguous(true);
                    },
                    { 
                        enableHighAccuracy: true, 
                        timeout: 10000, 
                        maximumAge: 0 
                    }
                );
            } else {
                setIsLocatingRoute(false);
                setLocationAmbiguous(true);
            }
        }
    };

    const fetchReportDetails = async () => {
        if (!id) return;
        try {
            setLoading(true);
            const response = await api.get(`/reports/${id}`);
            if (response.data) {
                setReport(response.data);

                // Fetch holding animal details if status suggests it is/was in holding
                try {
                    const holdingRes = await api.get('/holding/');
                    const targetReportId = response.data.duplicate_of_report_id ? Number(response.data.duplicate_of_report_id) : Number(id);
                    const matchingAnimal = holdingRes.data.find((a: any) => a.report_id === Number(id) || a.report_id === targetReportId);
                    if (matchingAnimal) {
                        const detailRes = await api.get(`/holding/${matchingAnimal.holding_id}`);
                        setHoldingAnimal(detailRes.data);
                    } else {
                        setHoldingAnimal(null);
                    }
                } catch (err) {
                    console.error('Error fetching holding details:', err);
                    setHoldingAnimal(null);
                }

                // Check if current user owns a matched registered pet for this report
                try {
                    const matchesRes = await api.get(`/matches/report/${id}`);
                    if (Array.isArray(matchesRes.data) && currentUserId) {
                        const myMatch = matchesRes.data.find((m: any) => m.matched_pet?.owner_id === currentUserId);
                        setUserMatch(myMatch || null);
                    } else {
                        setUserMatch(null);
                    }
                } catch {
                    setUserMatch(null);
                }
            } else {
                setReport(null);
                setHoldingAnimal(null);
                setUserMatch(null);
            }
        } catch (error) {
            console.error('Error fetching report details:', error);
            setReport(null);
            setHoldingAnimal(null);
            setUserMatch(null);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReportDetails();
    }, [id]);

    useEffect(() => {
        if ((searchParams.get('openChat') === 'true' || (location.state as any)?.openChat) && isReporter) {
            setIsChatOpen(true);
        }
    }, [searchParams, location, isReporter]);

    useEffect(() => {
        if (!report) return;

        const fetchAddress = async () => {
            if (report.landmark && report.landmark.trim()) {
                setResolvedAddress(report.landmark.trim());
            }

            setIsGeocoding(true);
            try {
                const response = await fetch(
                    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${report.latitude}&lon=${report.longitude}&addressdetails=1&accept-language=en`
                );
                if (response.ok) {
                    const data = await response.json();
                    if (data && data.address) {
                        const addr = data.address;
                        const parts = [];
                        const road = addr.road || addr.pedestrian || addr.path || '';
                        if (road) parts.push(road);
                        const neighbourhood = addr.neighbourhood || addr.village || addr.suburb || '';
                        if (neighbourhood && neighbourhood !== road) {
                            parts.push(neighbourhood);
                        }
                        const city = addr.city || addr.town || addr.municipality || '';
                        if (city) parts.push(city);

                        const addressStr = parts.join(', ') || data.display_name;
                        if (addressStr) {
                            setResolvedAddress(addressStr);
                        }
                    }
                }
            } catch (err) {
                // Silently fallback to coordinates or existing landmark
                if (!report.landmark) {
                    setResolvedAddress(`${parseFloat(report.latitude.toString()).toFixed(6)}, ${parseFloat(report.longitude.toString()).toFixed(6)}`);
                }
            } finally {
                setIsGeocoding(false);
            }
        };

        fetchAddress();
    }, [report]);

    const handleBack = () => {
        if (window.history.length > 1) {
            navigate(-1);
        } else {
            navigate('/resident-home');
        }
    };

    const handleOpenDisputeModal = async () => {
        if (!currentUser) {
            alert("Please log in to submit a formal report dispute.");
            return;
        }
        setIsDisputeModalOpen(true);
        try {
            const res = await api.get(`/pets/user/${currentUser.user_id}`);
            if (Array.isArray(res.data)) {
                setUserPets(res.data);
                if (userMatch?.matched_pet?.pet_id) {
                    setSelectedDisputePetId(String(userMatch.matched_pet.pet_id));
                } else if (res.data.length > 0) {
                    setSelectedDisputePetId(String(res.data[0].pet_id));
                }
            }
        } catch (e) {
            console.error("Error fetching user pets for dispute:", e);
        }
    };

    const handleSubmitDispute = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!report || !currentUserId) return;
        if (!disputeReason.trim()) {
            alert("Please provide a reason or statement for your dispute.");
            return;
        }

        try {
            setIsSubmittingDispute(true);
            const formData = new FormData();
            formData.append('resident_user_id', String(currentUserId));
            if (selectedDisputePetId) {
                formData.append('pet_id', selectedDisputePetId);
            }
            formData.append('dispute_reason', disputeReason);
            if (vaccineCardFile) {
                formData.append('vaccination_card', vaccineCardFile);
            }
            if (supportingPhotoFile) {
                formData.append('supporting_photo', supportingPhotoFile);
            }

            await api.post(`/reports/${report.report_id}/disputes`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            setDisputeSuccessAlert(true);
            setIsDisputeModalOpen(false);
            setDisputeReason('');
            setVaccineCardFile(null);
            setSupportingPhotoFile(null);
            await fetchReportDetails();
            setTimeout(() => setDisputeSuccessAlert(false), 6000);
        } catch (err: any) {
            console.error("Error submitting dispute:", err);
            alert(err.response?.data?.detail || "Failed to submit dispute. Please check your attachments and try again.");
        } finally {
            setIsSubmittingDispute(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[#F7F7F7] font-sans pb-24">
                <ResiNavbar onMenuToggle={(isOpen) => setIsNavbarMenuOpen(isOpen)} />
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-32 pb-8 flex flex-col items-center justify-center h-[50vh]">
                    <div className="w-10 h-10 border-4 border-[#F97316] border-t-transparent rounded-full animate-spin mb-4" />
                    <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Loading Report Details...</p>
                </div>
                <ResiMobileNav isNavbarMenuOpen={isNavbarMenuOpen} />
            </div>
        );
    }

    if (!report) {
        return (
            <div className="min-h-screen bg-[#F7F7F7] dark:bg-[#0B0F19] font-sans pb-24">
                <ResiNavbar onMenuToggle={(isOpen) => setIsNavbarMenuOpen(isOpen)} />
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-32 pb-8 flex flex-col items-center justify-center h-[50vh]">
                    <div className="w-16 h-16 bg-red-50 dark:bg-red-950/40 text-red-500 rounded-2xl flex items-center justify-center mb-6 border border-red-100 dark:border-red-900/40">
                        <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                    </div>
                    <h2 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tight mb-2">Report Not Found</h2>
                    <p className="text-xs text-gray-400 dark:text-gray-500 font-semibold mb-6">The incident report you are trying to view does not exist or has been deleted.</p>
                    <button onClick={handleBack} className="px-6 py-3 bg-[#F97316] text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-orange-100 dark:shadow-none">
                        Go Back
                    </button>
                </div>
                <ResiMobileNav isNavbarMenuOpen={isNavbarMenuOpen} />
            </div>
        );
    }

    const originalMedia = report.media?.filter((m: any) => !m.is_evidence) || [];
    const mainImage = originalMedia[0]?.file_url || DEFAULT_PET_AVATAR;

    return (
        <div className="min-h-screen bg-[#F7F7F7] font-sans pb-24">
            <ResiNavbar
                onMenuToggle={(isOpen) => setIsNavbarMenuOpen(isOpen)}
                isMobileSearchOpen={isMobileSearchOpen}
                onCloseSearch={() => setIsMobileSearchOpen(false)}
            />

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 sm:pt-32 pb-24 md:pb-8">

                {/* Back Link Header */}
                <div className="flex items-center justify-between mb-8">
                    <button
                        onClick={handleBack}
                        className="flex items-center gap-2 group text-gray-500 dark:text-gray-400 hover:text-[#F97316] dark:hover:text-[#F97316] transition-colors"
                    >
                        <div className="w-10 h-10 rounded-xl bg-white dark:bg-[#151C2C] border border-gray-200 dark:border-gray-800 flex items-center justify-center text-gray-400 group-hover:text-[#F97316] group-hover:border-orange-200 dark:group-hover:border-orange-500/30 transition-all shadow-sm">
                            <svg className="w-5 h-5 transition-transform group-hover:-translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                            </svg>
                        </div>
                        <span className="text-[11px] font-black uppercase tracking-widest text-[#1a1208] dark:text-white group-hover:text-[#F97316] dark:group-hover:text-[#F97316] transition-colors">Go Back</span>
                    </button>

                    {report.user_id === currentUserId && report.status_id === 1 && (
                        <button
                            onClick={() => navigate('/resident-home', { state: { editReport: report, isViewMode: false, from: window.location.pathname } })}
                            className="px-5 py-3 bg-[#F97316] text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-[#EA580C] transition-all flex items-center gap-2 shadow-lg shadow-orange-100 dark:shadow-none cursor-pointer"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            Edit Report
                        </button>
                    )}
                </div>

                {/* Look-Alike AI Match Banner for Matched Pet Owner */}
                {userMatch && (
                    <div className="mb-8 p-6 rounded-3xl bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-50 dark:from-amber-950/30 dark:via-orange-950/20 dark:to-[#151C2C] border-2 border-amber-300 dark:border-amber-700/60 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-500/30 shrink-0">
                                <Search className="w-6 h-6" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="px-2.5 py-0.5 bg-amber-600 text-white rounded-lg text-[10px] font-black uppercase tracking-wider">
                                        AI Look-Alike Match ({userMatch.similarity_score}%)
                                    </span>
                                    <span className="text-xs font-black text-amber-950 dark:text-amber-200">
                                        Registered Pet: {userMatch.matched_pet?.pet_name}
                                    </span>
                                </div>
                                <p className="text-xs text-amber-900 dark:text-amber-300 font-semibold mt-1">
                                    AI detected this reported stray looks like your registered pet! Compare photos, submit proof, or chat directly with responders.
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => navigate(`/resident/reports/${id}/match-review?openChat=true`)}
                            className="px-6 py-3 bg-gradient-to-r from-[#F97316] to-[#EA580C] hover:from-[#EA580C] hover:to-[#C2410C] text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all shadow-md shadow-orange-500/20 flex items-center justify-center gap-2 shrink-0 cursor-pointer"
                        >
                            <MessageCircle className="w-3.5 h-3.5" /> <span>Review Match & Chat</span>
                            <span>→</span>
                        </button>
                    </div>
                )}

                {/* Cover Banner Title */}
                <div className="bg-white dark:bg-[#151C2C] rounded-[2.5rem] border border-gray-100 dark:border-gray-800 p-8 sm:p-10 shadow-sm mb-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center gap-6">
                        <div className="w-16 h-16 rounded-[1.5rem] bg-orange-50 dark:bg-orange-950/40 flex items-center justify-center text-orange-600 dark:text-orange-400 border border-orange-100 dark:border-orange-900/40 shrink-0">
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                        </div>
                        <div>
                            <h1 className="text-xl sm:text-3xl font-black text-gray-900 dark:text-white uppercase tracking-tight">
                                {(report.category_id === 6 || report.pet_id || (report.description && report.description.includes('[LOST PET REPORT]'))) ? 'Lost Pet Recovery Case' : 'Rescue Case Intelligence'}
                            </h1>
                            <div className="flex items-center gap-3 mt-1.5">
                                <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Report ID: #STR-{(report.report_id || 0).toString().padStart(4, '0')}</span>
                                <div className="w-1.5 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700" />
                                <span className="text-[10px] font-black text-orange-600 dark:text-orange-400 uppercase tracking-widest">
                                    {(report.category_id === 6 || report.pet_id || (report.description && report.description.includes('[LOST PET REPORT]'))) ? 'Lost Pet' : (categoryMap[report.category_id] || 'Incident Report')}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                        {isReporter && (
                            <button
                                type="button"
                                onClick={() => setIsChatOpen(true)}
                                className="px-5 py-3.5 bg-gradient-to-r from-[#F97316] to-[#EA580C] text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer shadow-lg shadow-orange-600/20 hover:scale-105 active:scale-95 flex items-center gap-2"
                                title="Open Case Chat with Subdivision Responders"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                </svg>
                                <span>Case Chat {chatCount > 0 ? `(${chatCount})` : ''}</span>
                            </button>
                        )}

                        {/* Dispute Counter-Claim Button for Pet Owners / Residents */}
                        {currentUser && ![11, 12, 14].includes(report.status_id) && (
                            <button
                                type="button"
                                onClick={handleOpenDisputeModal}
                                className="px-5 py-3.5 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer shadow-lg shadow-amber-500/20 hover:scale-105 active:scale-95 flex items-center gap-2"
                                title="Submit vaccination proof & counter-claim that your pet is innocent or at home"
                            >
                                <Scale className="w-3.5 h-3.5" /> Dispute / Submit Proof
                            </button>
                        )}

                        <div className="flex items-center gap-3 bg-[#FAFAF9] dark:bg-[#1E2738] border border-gray-100 dark:border-gray-700/80 rounded-2xl p-4 w-fit">
                            <div className="flex items-center gap-2">
                                {report.visibility === 'Private' ? (
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                    </svg>
                                ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-500 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                    </svg>
                                )}
                                <span className="text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">{report.visibility} Sighting</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Main Details Grid: Combined Media & Information Card on left, Rescue Timeline Card on right */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch mt-10">

                    {/* Left Column: Combined Media & Information Card (7/12) */}
                    <div className="lg:col-span-7">
                        <div className="bg-white dark:bg-[#151C2C] p-6 sm:p-8 rounded-[2.5rem] border border-gray-100 dark:border-gray-800 shadow-sm space-y-8 flex flex-col">
                            {/* Media Showcase Section */}
                            <div>
                                <div
                                    className="aspect-[4/3] rounded-[2rem] overflow-hidden shadow-inner relative group cursor-pointer"
                                    onClick={() => setActiveGallery({ media: originalMedia.length > 0 ? originalMedia : [{ file_url: mainImage, media_type: 'Image' }], index: 0 })}
                                >
                                    <img src={mainImage} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-1000 ease-out" alt="Main stray" />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-6">
                                        <div className="flex items-center gap-2 text-white">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                            <span className="text-[10px] font-black uppercase tracking-widest">Click to view full gallery ({originalMedia.length})</span>
                                        </div>
                                    </div>
                                </div>

                                {originalMedia.length > 1 && (
                                    <div className="grid grid-cols-4 gap-3 mt-4">
                                        {originalMedia.slice(1, 5).map((m: any, idx: number) => (
                                            <div
                                                key={m.media_id}
                                                className="aspect-square rounded-xl overflow-hidden cursor-pointer shadow-sm border border-gray-50 dark:border-gray-800 relative group"
                                                onClick={() => setActiveGallery({ media: originalMedia, index: idx + 1 })}
                                            >
                                                {m.media_type === 'Video' ? (
                                                    <div className="w-full h-full relative">
                                                        <video src={m.file_url} className="w-full h-full object-cover" />
                                                        <div className="absolute inset-0 bg-black/25 flex items-center justify-center text-white">
                                                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <img src={m.file_url} className="w-full h-full object-cover group-hover:scale-110 transition-transform" alt="thumbnail" />
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Information Details Section */}
                            {(() => {
                                const rawDesc = report.description || '';
                                const parts = rawDesc.split('|').map((p: string) => p.trim());
                                let extractedPattern = '';
                                let extractedConditions = '';
                                let cleanNotes = '';

                                parts.forEach((part: string) => {
                                    if (part.toLowerCase().startsWith('pattern:')) {
                                        extractedPattern = part.replace(/^pattern:\s*/i, '');
                                    } else if (part.toLowerCase().startsWith('observed conditions:')) {
                                        extractedConditions = part.replace(/^observed conditions:\s*/i, '');
                                    } else if (part.toLowerCase().startsWith('markings:')) {
                                        if (!extractedPattern) extractedPattern = part.replace(/^markings:\s*/i, '');
                                    } else if (part.toLowerCase().startsWith('notes:')) {
                                        cleanNotes = part.replace(/^notes:\s*/i, '');
                                    } else if (!extractedPattern && !extractedConditions && !cleanNotes) {
                                        cleanNotes = part;
                                    }
                                });

                                const displayType = report.animal_type || report.ai_animal_type || 'Unknown';
                                const displayBreed = (report.animal_breed && report.animal_breed.toLowerCase() !== 'unknown') ? report.animal_breed : (report.ai_possible_breed || 'Unknown');
                                const displayColor = report.animal_color || report.ai_dominant_color || 'Unknown';
                                const displaySize = report.estimated_size || report.ai_estimated_size || 'Medium';

                                return (
                                    <div className="space-y-6">
                                        {/* Reporter Profile & Name + Rescue Status + Date */}
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-gray-100 dark:border-gray-800">
                                            {/* Reporter Profile & Name */}
                                            <div className="flex items-center gap-3.5">
                                                <div className="w-12 h-12 rounded-full overflow-hidden border border-gray-200 dark:border-gray-700 shadow-xs shrink-0 bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                                                    {report.reporter_photo ? (
                                                        <img
                                                            src={getProfilePicture(report.reporter_photo)}
                                                            alt={report.reporter_name || 'Reporter'}
                                                            className="w-full h-full object-cover"
                                                            onError={(e) => {
                                                                e.currentTarget.src = DEFAULT_AVATAR;
                                                            }}
                                                        />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-lg font-bold bg-orange-50 dark:bg-orange-950/40 text-[#F97316]">
                                                            {(report.reporter_name || 'U').charAt(0).toUpperCase()}
                                                        </div>
                                                    )}
                                                </div>
                                                <div>
                                                    <p className="text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-0.5">Reported By</p>
                                                    <h4 className="text-sm font-black text-gray-900 dark:text-white leading-tight">
                                                        {report.reporter_name || (report.user_id ? `Resident #${report.user_id}` : 'Resident')}
                                                    </h4>
                                                </div>
                                            </div>

                                            {/* Rescue Status & Date Reported */}
                                            <div className="flex items-center gap-6 sm:gap-8 shrink-0">
                                                <div>
                                                    <p className="text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1">Rescue Status</p>
                                                    <p className="text-xs sm:text-sm font-black text-orange-600 dark:text-orange-400 uppercase tracking-tight">
                                                        {reportStatusMap[report.status_id ?? report.current_status_id ?? report.status?.status_id ?? 1] || 'Reported'}
                                                    </p>
                                                </div>
                                                <div>
                                                    <p className="text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1">Date Reported</p>
                                                    <p className="text-xs sm:text-sm font-black text-[#1a1208] dark:text-white uppercase tracking-tight">
                                                        <RelativeTimestamp date={report.created_at} />
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Merged Duplicate Information Card for Citizen */}
                                        {(report.status_id === 18 || report.duplicate_of_report_id) && (
                                            <div className="p-5 rounded-3xl bg-stone-50 dark:bg-[#1E2738] border-2 border-stone-200 dark:border-gray-700 text-stone-900 dark:text-white space-y-3 shadow-2xs">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-2xl bg-stone-200 dark:bg-gray-700 text-stone-800 dark:text-gray-200 flex items-center justify-center shrink-0">
                                                        <Link2 className="w-5 h-5" />
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <h4 className="text-xs font-black uppercase tracking-widest text-stone-900 dark:text-white">
                                                                Linked Sighting Case
                                                            </h4>
                                                            <span className="px-2 py-0.5 rounded-full bg-stone-200 dark:bg-gray-700 text-stone-700 dark:text-gray-300 text-[9px] font-black uppercase">
                                                                Active Case #{report.duplicate_of_report_id || 'Active'}
                                                            </span>
                                                        </div>
                                                        <p className="text-xs font-bold text-stone-600 dark:text-gray-400 mt-0.5">
                                                            Consolidated into active rescue operation
                                                        </p>
                                                    </div>
                                                </div>

                                                <p className="text-xs text-stone-700 dark:text-gray-300 font-medium leading-relaxed bg-white dark:bg-[#151C2C] p-3.5 rounded-2xl border border-stone-100 dark:border-gray-800">
                                                    <strong>Thank you for your report!</strong> Responding officers confirmed that this animal is currently being tracked under active <strong>Case #{report.duplicate_of_report_id}</strong>. Your submitted photo and sighting details have been credited and added to the official case record to assist the rescue team.
                                                </p>

                                                {report.duplicate_of_report_id && (
                                                    <div className="pt-1">
                                                        <Link
                                                            to={`/resident/reports/${report.duplicate_of_report_id}`}
                                                            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#F97316] hover:bg-[#EA580C] text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-xs"
                                                        >
                                                            <span>Track Active Case #{report.duplicate_of_report_id}</span>
                                                            <span>→</span>
                                                        </Link>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Consolidated Sighting Evidence from Merged Duplicate Reports */}
                                        {report.merged_reports && report.merged_reports.length > 0 && (
                                            <div className="bg-white dark:bg-[#1E2738] rounded-3xl p-6 sm:p-8 border border-orange-200/80 dark:border-orange-900/40 shadow-xs space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 rounded-2xl bg-orange-50 dark:bg-orange-950/40 text-[#F97316] border border-orange-200 dark:border-orange-900/40 flex items-center justify-center shrink-0">
                                                            <Link2 className="w-5 h-5" />
                                                        </div>
                                                        <div>
                                                            <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wide">
                                                                Consolidated Sighting Evidence ({report.merged_reports.length} Merged {report.merged_reports.length === 1 ? 'Report' : 'Reports'})
                                                            </h3>
                                                            <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                                                                Photos and sightings from other residents confirmed for this same animal
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className={`grid grid-cols-1 ${report.merged_reports.length === 2 ? 'sm:grid-cols-2' : report.merged_reports.length >= 3 ? 'sm:grid-cols-2 lg:grid-cols-3' : ''} gap-4 pt-2`}>
                                                    {report.merged_reports.map((mr: any, mrIdx: number) => (
                                                        <div key={mr.report_id || mr.id || `merged-report-${mrIdx}`} className="p-4 rounded-2xl bg-stone-50/70 dark:bg-[#151C2C] border border-stone-200 dark:border-gray-800 space-y-3 flex flex-col justify-between">
                                                            <div className="space-y-3">
                                                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-xs font-black text-gray-900 dark:text-white">
                                                                            Report #{mr.report_id}
                                                                        </span>
                                                                        <span className="px-2 py-0.5 rounded-md bg-stone-200 dark:bg-gray-700 text-stone-700 dark:text-gray-300 text-[9px] font-black uppercase">
                                                                            Merged Duplicate
                                                                        </span>
                                                                    </div>
                                                                    <Link
                                                                        to={`/resident/reports/${mr.report_id}`}
                                                                        className="text-[10px] font-black text-[#F97316] hover:underline flex items-center gap-1"
                                                                    >
                                                                        <span>View Report</span>
                                                                        <span>→</span>
                                                                    </Link>
                                                                </div>

                                                                <div className="flex items-center gap-2.5 text-xs text-gray-600 dark:text-gray-300">
                                                                    <User className="w-3 h-3 text-gray-400" />
                                                                    <span className="font-bold text-gray-800 dark:text-gray-200">{mr.reporter_name}</span>
                                                                    {mr.landmark && (
                                                                        <>
                                                                            <span>•</span>
                                                                            <span className="truncate inline-flex items-center gap-1"><MapPin className="w-3 h-3 text-gray-400" /> {mr.landmark}</span>
                                                                        </>
                                                                    )}
                                                                </div>

                                                                {mr.description && (
                                                                    <p className="text-xs text-gray-600 dark:text-gray-300 italic bg-white dark:bg-[#1E2738] p-2.5 rounded-xl border border-stone-100 dark:border-gray-700/80 leading-relaxed">
                                                                        "{mr.description}"
                                                                    </p>
                                                                )}
                                                            </div>

                                                            {mr.media && mr.media.length > 0 && (
                                                                <div className="flex gap-2 overflow-x-auto py-1 mt-2">
                                                                    {mr.media.map((m: any, mIdx: number) => (
                                                                        <div
                                                                            key={m.media_id || m.id || m.file_url || `merged-media-${mIdx}`}
                                                                            onClick={() => window.open(m.file_url, '_blank')}
                                                                            className="w-20 h-20 rounded-xl overflow-hidden bg-gray-200 dark:bg-gray-800 shrink-0 border border-stone-200 dark:border-gray-700 cursor-pointer hover:scale-105 transition-transform"
                                                                            title="Click to view full photo"
                                                                        >
                                                                            <img src={m.file_url} alt="" className="w-full h-full object-cover" />
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Verified Record / Investigation Finding Banner */}
                                        {report.verification_status === 'verified_true' && (
                                            <div className={`p-4 rounded-3xl border flex items-start gap-3.5 shadow-xs ${
                                                (!report.verified_actual_bite && !report.verified_aggressive)
                                                    ? 'bg-emerald-50/90 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-950 dark:text-emerald-200'
                                                    : 'bg-rose-50/90 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800 text-rose-950 dark:text-rose-200'
                                            }`}>
                                                {(!report.verified_actual_bite && !report.verified_aggressive) ? <Shield className="w-6 h-6 shrink-0 text-emerald-600 dark:text-emerald-400" /> : <AlertTriangle className="w-6 h-6 shrink-0 text-rose-600 dark:text-rose-400" />}
                                                <div className="space-y-1">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className="text-[10px] font-black uppercase tracking-wider">
                                                            {(!report.verified_actual_bite && !report.verified_aggressive) ? 'On-Site Staff Verification: Clean Record' : 'On-Site Staff Verification: Confirmed'}
                                                        </span>
                                                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                                                            (!report.verified_actual_bite && !report.verified_aggressive) ? 'bg-white dark:bg-[#1E2738] text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700' : 'bg-white dark:bg-[#1E2738] text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-700'
                                                        }`}>
                                                            {report.behavior_finding || 'Verified'}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs font-medium leading-relaxed">
                                                        {(!report.verified_actual_bite && !report.verified_aggressive)
                                                            ? 'Field inspection confirmed the animal is friendly and non-aggressive. Initial biting/chasing claims were marked unsubstantiated.'
                                                            : (report.verification_notes || 'Incident confirmed by subdivision officer.')}
                                                    </p>
                                                </div>
                                            </div>
                                        )}

                                        {/* Lost Pet Owner Contact & Digital QR Tag Card */}
                                        {(report.pet_id || report.owner_phone || (report.description && report.description.includes('[LOST PET REPORT]'))) && (
                                            <div className="p-5 rounded-3xl bg-gradient-to-br from-amber-50/90 to-orange-50/70 dark:from-amber-950/40 dark:to-orange-950/20 border-2 border-amber-200/80 dark:border-amber-800/60 shadow-sm space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2.5">
                                                        <span className="px-2.5 py-1 bg-amber-500 text-white rounded-lg text-[9px] font-black uppercase tracking-wider flex items-center gap-1">
                                                            <PawPrint className="w-3 h-3" />
                                                            <span>Registered Lost Pet</span>
                                                        </span>
                                                        {report.pet_name && (
                                                            <span className="text-xs font-black text-amber-950 dark:text-amber-200 uppercase">
                                                                {report.pet_name}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {report.pet_qr_code_hash && (
                                                        <span className="text-[9px] font-mono font-bold text-amber-900 dark:text-amber-300 bg-white/80 dark:bg-[#1E2738] px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-700/60">
                                                            {report.pet_qr_code_hash}
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                                                    <div className="bg-white/80 dark:bg-[#1E2738] p-3 rounded-2xl border border-amber-100 dark:border-amber-800/40">
                                                        <p className="text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-0.5">Pet Owner</p>
                                                        <p className="text-xs font-black text-gray-900 dark:text-white">{report.owner_name ? report.owner_name : <span className="text-gray-500 dark:text-gray-400 font-bold italic">No Registered Owner (Community Animal)</span>}</p>
                                                        {report.owner_address && (
                                                            <p className="text-[10px] text-gray-500 dark:text-gray-400 font-medium mt-0.5">{report.owner_address}</p>
                                                        )}
                                                    </div>

                                                    <div className="bg-white/80 dark:bg-[#1E2738] p-3 rounded-2xl border border-amber-100 dark:border-amber-800/40 flex flex-col justify-between">
                                                        <div>
                                                            <p className="text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-0.5">Owner Contact</p>
                                                            <p className="text-xs font-black text-amber-900 dark:text-amber-300">{report.owner_phone || 'No Private Owner Contact'}</p>
                                                        </div>
                                                        {report.owner_phone && (
                                                            <a
                                                                href={`tel:${report.owner_phone}`}
                                                                className="mt-2 inline-flex items-center justify-center gap-1.5 w-full py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all"
                                                            >
                                                                <Phone className="w-3 h-3" /> Call Owner
                                                            </a>
                                                        )}
                                                    </div>
                                                </div>

                                                {report.pet_qr_code_url && (
                                                    <div className="pt-2 flex items-center justify-between bg-white/90 dark:bg-[#1E2738] p-3.5 rounded-2xl border border-amber-200 dark:border-amber-800/60 gap-4">
                                                        <div className="flex items-center gap-3">
                                                            <img 
                                                                src={report.pet_qr_code_url} 
                                                                alt="Pet QR Code" 
                                                                className="w-12 h-12 rounded-xl object-contain bg-white border border-gray-100 dark:border-gray-700 p-1 cursor-pointer hover:scale-105 transition-transform"
                                                                onClick={() => setSelectedQrPreview({
                                                                    url: report.pet_qr_code_url,
                                                                    petName: report.pet_name,
                                                                    hash: report.pet_qr_code_hash,
                                                                    ownerName: report.owner_name || undefined,
                                                                    ownerPhone: report.owner_phone
                                                                })}
                                                            />
                                                            <div>
                                                                <p className="text-xs font-black text-gray-900 dark:text-white uppercase">Pet Digital QR Tag</p>
                                                                <p className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">Scan with camera to verify pet ownership</p>
                                                            </div>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => setSelectedQrPreview({
                                                                url: report.pet_qr_code_url,
                                                                petName: report.pet_name,
                                                                hash: report.pet_qr_code_hash,
                                                                ownerName: report.owner_name || undefined,
                                                                ownerPhone: report.owner_phone
                                                            })}
                                                            className="px-3.5 py-2 bg-amber-100 dark:bg-amber-950/60 hover:bg-amber-200 dark:hover:bg-amber-900/60 text-amber-900 dark:text-amber-200 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all shrink-0 cursor-pointer"
                                                        >
                                                            Expand QR ↗
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Unified Animal Characteristics */}
                                        <div className="pb-6 space-y-3.5 border-b border-gray-50 dark:border-gray-800">
                                            <div className="flex justify-between items-center">
                                                <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Animal Type</span>
                                                <span className="text-xs font-black text-[#1a1208] dark:text-white uppercase">{displayType}</span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Breed / Variety</span>
                                                <span className="text-xs font-black text-gray-900 dark:text-white uppercase">{displayBreed}</span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Coat Color</span>
                                                <span className="text-xs font-black text-gray-900 dark:text-white uppercase">{displayColor}</span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Estimated Size</span>
                                                <span className="text-xs font-black text-gray-900 dark:text-white uppercase">{displaySize}</span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Animal Count</span>
                                                <span className="text-xs font-black text-gray-900 dark:text-white uppercase">{report.animal_count || 1} Animal(s)</span>
                                            </div>
                                            {extractedPattern && (
                                                <div className="flex justify-between items-center">
                                                    <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Coat Pattern / Markings</span>
                                                    <span className="text-xs font-black text-orange-600 dark:text-orange-400 uppercase">{extractedPattern}</span>
                                                </div>
                                            )}
                                            {report.is_possible_owned !== undefined && (
                                                <div className="flex justify-between items-center">
                                                    <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Ownership Indicator</span>
                                                    <span className={`text-xs font-black uppercase ${report.is_possible_owned ? 'text-amber-600 dark:text-amber-400' : 'text-gray-600 dark:text-gray-400'}`}>
                                                        {report.is_possible_owned ? 'Possible Owned Pet' : 'Uncollared Stray'}
                                                    </span>
                                                </div>
                                            )}
                                            {report.landmark && (
                                                <div className="flex justify-between items-center">
                                                    <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Landmark Location</span>
                                                    <span className="text-xs font-black text-gray-900 dark:text-white uppercase">{report.landmark}</span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Observed Conditions & Incident Details */}
                                        {extractedConditions && (
                                            <div className="pb-6 border-b border-gray-50 dark:border-gray-800">
                                                <p className="text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Observed Health & Behavior Conditions</p>
                                                <div className="flex flex-wrap gap-2">
                                                    {extractedConditions.split(',').map((cond, i) => (
                                                        <span key={i} className="px-3 py-1 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-900/40 rounded-full text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1">
                                                            <Siren className="w-3 h-3" /> {cond.trim()}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Cleaned Case Notes */}
                                        {cleanNotes && (
                                            <div>
                                                <p className="text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Case Description & Notes</p>
                                                <FormattedReportDescription description={cleanNotes} />
                                            </div>
                                        )}


                                    </div>
                                );
                            })()}

                                         {/* Endorsement Letter section */}
                                         {report.endorsement_letter && (
                                              <div className="pt-6 mt-6 border-t border-gray-50 dark:border-gray-800 space-y-3">
                                                  <div className="bg-orange-50 dark:bg-orange-950/30 border border-orange-100 dark:border-orange-900/40 rounded-3xl p-6">
                                                      <h4 className="text-[10px] font-black text-orange-600 dark:text-orange-400 uppercase tracking-widest mb-4">Subdivision Escalation Note</h4>
                                                      
                                                      {report.endorsement_letter.title && (
                                                          <p className="text-xs font-black text-orange-600 dark:text-orange-400 uppercase tracking-wider mb-2">
                                                              {report.endorsement_letter.title}
                                                          </p>
                                                      )}
                                                      
                                                      <p className="text-sm font-bold text-gray-900 dark:text-white leading-relaxed italic">
                                                          "{report.endorsement_letter.letter_content}"
                                                      </p>
                                                      
                                                      <div className="mt-4 flex items-center gap-3">
                                                          <div className="w-8 h-8 rounded-full bg-orange-200 dark:bg-orange-900/60 flex items-center justify-center text-[10px] font-bold text-orange-700 dark:text-orange-300 border-2 border-white dark:border-gray-800">
                                                              {report.endorsement_letter.leader_name?.charAt(0) || 'L'}
                                                          </div>
                                                          <div>
                                                              <p className="text-[10px] font-black text-gray-900 dark:text-white uppercase tracking-widest">Sent by:</p>
                                                              <p className="text-sm font-black text-orange-700 dark:text-orange-400">{report.endorsement_letter.leader_name || "Subdivision Leader"}</p>
                                                              <p className="text-[9px] text-gray-500 dark:text-gray-400 uppercase tracking-widest font-medium">
                                                                  {report.endorsement_letter.leader_position || "Subdivision Official"} • {new Date(report.endorsement_letter.issued_at).toLocaleDateString()}
                                                              </p>
                                                          </div>
                                                      </div>

                                                      {report.endorsement_letter.file_url && (() => {
                                                          const fileUrl = report.endorsement_letter.file_url;
                                                          const urlLower = fileUrl.toLowerCase();
                                                          const isDoc = urlLower.endsWith('.pdf') || urlLower.endsWith('.doc') || urlLower.endsWith('.docx');
                                                          const isImg = !isDoc && (urlLower.endsWith('.jpg') || urlLower.endsWith('.jpeg') || urlLower.endsWith('.png') || urlLower.endsWith('.webp'));
                                                          
                                                          return (
                                                              <div className="mt-5 space-y-3">
                                                                  <p className="text-[9px] font-black text-orange-600 dark:text-orange-400 uppercase tracking-[0.2em]">Endorsement Letter / Evidence</p>
                                                                  {isImg ? (
                                                                      <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="block rounded-2xl overflow-hidden border border-orange-100 dark:border-orange-900/40 hover:opacity-90 transition-opacity shadow-sm">
                                                                          <img src={fileUrl} className="w-full max-h-64 object-cover" alt="Endorsement letter" />
                                                                      </a>
                                                                  ) : (
                                                                      <a
                                                                          href={fileUrl}
                                                                          target="_blank"
                                                                          rel="noopener noreferrer"
                                                                          className="w-full py-3 bg-white dark:bg-[#1E2738] border border-orange-200 dark:border-orange-900/40 text-[#F97316] text-[9px] font-black uppercase tracking-[0.2em] rounded-xl hover:bg-orange-600 hover:text-white transition-all shadow-sm flex items-center justify-center gap-2"
                                                                      >
                                                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                                          </svg>
                                                                          View Official Endorsement Letter
                                                                      </a>
                                                                  )}
                                                              </div>
                                                          );
                                                      })()}
                                                  </div>
                                              </div>
                                          )}
                        </div>
                    </div>

                    {/* Right Column: Rescue Timeline Card (5/12) */}
                    <div className="lg:col-span-5 relative">
                        <div className="bg-white dark:bg-[#151C2C] p-6 sm:p-7 rounded-[2.5rem] border border-gray-100 dark:border-gray-800 shadow-sm flex flex-col h-full lg:h-auto min-h-[350px] lg:min-h-0 lg:absolute lg:inset-0 space-y-4">
                            {/* Header matching Barangay format */}
                            <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-2xl bg-orange-50 dark:bg-orange-950/40 text-[#F97316] flex items-center justify-center shadow-xs shrink-0">
                                        <ScrollText className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wide">
                                            Report Activity & Handover Timeline
                                        </h4>
                                        <p className="text-[10px] text-gray-400 dark:text-gray-500 font-bold uppercase tracking-wider mt-0.5">
                                            Official Audit Trail & Officer Activity Log
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {(() => {
                                        const validHistory = (report.history || []).filter((h: any) => (h.remarks || '').trim() !== 'Initial report submitted by resident.');
                                        const holdingCount = (holdingAnimal && holdingAnimal.timeline) ? holdingAnimal.timeline.length : 0;
                                        const totalEvents = validHistory.length + holdingCount + 1;
                                        return (
                                            <span className="text-[10px] font-black text-gray-600 dark:text-gray-300 bg-gray-100/90 dark:bg-gray-800 px-2.5 py-1 rounded-full border border-gray-200/60 dark:border-gray-700 shadow-2xs whitespace-nowrap">
                                                {totalEvents} {totalEvents === 1 ? 'Event' : 'Events'}
                                            </span>
                                        );
                                    })()}
                                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-green-50 dark:bg-green-950/40 rounded-full border border-green-100 dark:border-green-900/40">
                                        <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                        <span className="text-[8px] font-black text-green-600 dark:text-green-400 uppercase tracking-widest">Live</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                                <RescueTimeline
                                    history={(() => {
                                        const h = [...(report.history || [])];
                                        if (holdingAnimal && holdingAnimal.timeline) {
                                            holdingAnimal.timeline.forEach((log: any) => {
                                                // Find media associated with this timeline log (prioritize database relationship)
                                                let logMedia = log.media || [];
                                                if (logMedia.length === 0) {
                                                    logMedia = report.media?.filter((m: any) => {
                                                        if (!m.is_evidence) return false;
                                                        // Never treat documents or PDFs as visual holding evidence
                                                        if (m.media_type === 'Document' || (m.file_url && m.file_url.toLowerCase().endsWith('.pdf'))) return false;
                                                        // Exclude media tied to other statuses (e.g. status 4 escalation)
                                                        if (m.status_id === 4) return false;
                                                        // If explicitly assigned to a holding log, only attach to this specific log
                                                        if (m.holding_log_id) return m.holding_log_id === log.log_id;
                                                        return false;
                                                    }) || [];
                                                }
                                                // Ensure only valid, non-empty media items are retained
                                                logMedia = logMedia.filter((m: any) => m && m.file_url && typeof m.file_url === 'string' && m.file_url.trim() !== '' && m.file_url !== 'null' && m.file_url !== 'undefined');

                                                // If this is an intake or transfer log and report.history already has a facility admission/movement, merge media into it to prevent redundant status cards
                                                if (log.event_type === 'intake' || log.event_type === 'transfer') {
                                                    const existingHistIndex = h.findIndex((rh: any) => {
                                                        const isFac = rh.report_status_id === 7 || rh.report_status_id === 8 ||
                                                            (rh.remarks && (rh.remarks.toLowerCase().includes('holding') || rh.remarks.toLowerCase().includes('facility') || rh.remarks.toLowerCase().includes('relocat') || rh.remarks.toLowerCase().includes('transfer')));
                                                        if (!isFac) return false;
                                                        const timeDiff = Math.abs(new Date(rh.created_at || rh.timestamp || 0).getTime() - new Date(log.logged_at).getTime());
                                                        return timeDiff <= 300000; // within 5 minutes
                                                    });

                                                    if (existingHistIndex !== -1) {
                                                        if (logMedia.length > 0) {
                                                            const existingMedia = h[existingHistIndex].media || [];
                                                            const existingIds = new Set(existingMedia.map((m: any) => m.media_id || m.file_url));
                                                            const freshMedia = logMedia.filter((m: any) => !existingIds.has(m.media_id || m.file_url));
                                                            h[existingHistIndex].media = [...existingMedia, ...freshMedia];
                                                        }
                                                        return; // Skip adding duplicate holding log so it stays as one clean status
                                                    }
                                                }

                                                // Determine the mapped report status ID based on log title/event
                                                let statusId = 16; // default: Observation / In-facility care
                                                const titleLower = (log.title || '').toLowerCase();
                                                if (log.event_type === 'outcome') {
                                                    if (titleLower.includes('deceased')) {
                                                        statusId = 12; // Deceased
                                                    } else if (titleLower.includes('claimed')) {
                                                        statusId = 9; // Claimed by Owner
                                                    } else if (titleLower.includes('released')) {
                                                        statusId = 10; // Released
                                                    } else {
                                                        statusId = 11; // Resolved
                                                    }
                                                } else if (log.event_type === 'intake') {
                                                    statusId = 7;
                                                }

                                                const fallbackAuthor = report.assigned_leader_name || (report.subdivision_id ? 'Subdivision Officer' : 'Facility Caretaker');
                                                const effectiveUpdater = log.staff_name || (log.logged_by ? fallbackAuthor : 'System Monitor');

                                                h.push({
                                                    history_id: 100000 + log.log_id,
                                                    report_status_id: statusId,
                                                    remarks: `${log.title}${log.notes ? ` — ${log.notes}` : ''}`,
                                                    created_at: log.logged_at,
                                                    updater_name: effectiveUpdater,
                                                    media: logMedia
                                                });
                                            });
                                        }
                                        return h.sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
                                    })()}
                                    currentStatusId={report.status_id}
                                    assignedLeaderName={report.assigned_leader_name}
                                    reporterName={report.reporter_name}
                                    reportCreatedAt={report.created_at}
                                    animalType={report.animal_type}
                                    landmark={report.landmark}
                                    endorsementLetter={report.endorsement_letter}
                                />
                            </div>
                        </div>
                    </div>

                </div>

                {/* Location Intelligence (Map component - below the main content grid) */}
                <div className="bg-gray-900 text-white p-3.5 sm:p-6 md:p-8 rounded-2xl sm:rounded-[2.5rem] shadow-xl relative overflow-hidden group mt-6 sm:mt-10">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-700" />
                    <div className="relative z-10">
                        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                            <h4 className="text-[10px] font-black text-orange-400 uppercase tracking-[0.2em]">Location Intelligence</h4>
                            <div className="flex items-center gap-2">
                                {([6, 7, 8, 9, 10, 11].includes(report.status_id) || !!report.facility_id || !!report.facility || report.custody_status?.toLowerCase().includes('facility') || report.custody_status?.toLowerCase().includes('secured')) && (
                                    <span className="px-3 py-1 bg-amber-500/20 text-amber-300 border border-amber-400/30 rounded-xl text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 shadow-xs">
                                        <PawPrint className="w-3 h-3" />
                                        <span className="hidden sm:inline">Animal Secured at Holding Facility</span>
                                        <span className="sm:hidden">Secured</span>
                                    </span>
                                )}
                                <button
                                    type="button"
                                    onClick={() => setIsMapMaximized(prev => !prev)}
                                    className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-[10px] font-black uppercase tracking-wider border border-white/15 transition-all flex items-center gap-1.5 shadow-sm cursor-pointer hover:scale-105 active:scale-95"
                                    title={isMapMaximized ? "Reset to Standard Size" : "Maximize Map Height"}
                                >
                                    {isMapMaximized ? <Minimize2 className="w-3.5 h-3.5 text-amber-300" /> : <Maximize2 className="w-3.5 h-3.5 text-amber-300" />}
                                    <span>{isMapMaximized ? "Standard" : "Maximize"}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIsMapExpanded(true)}
                                    className="px-3.5 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-[10px] font-black uppercase tracking-wider border border-white/15 transition-all flex items-center gap-1.5 shadow-sm cursor-pointer hover:scale-105 active:scale-95"
                                    title="Open Fullscreen Expanded Map"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-amber-300" viewBox="0 0 20 20" fill="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h3a1 1 0 010 2H5v2a1 1 0 01-2 0V4zm14 0a1 1 0 00-1-1h-3a1 1 0 110 2h2v2a1 1 0 112 0V4zM3 16a1 1 0 001 1h3a1 1 0 100-2H5v-2a1 1 0 10-2 0v3zm14 0a1 1 0 01-1 1h-3a1 1 0 100-2h2v-2a1 1 0 102 0v3z" />
                                    </svg>
                                    <span className="hidden xs:inline">Fullscreen</span>
                                    <span className="xs:hidden">Expand</span>
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                            <div className="flex items-start gap-4 p-4 rounded-2xl bg-white/5 border border-white/10">
                                <div className="w-10 h-10 rounded-2xl bg-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                                    {([6, 7, 8, 9, 10, 11].includes(report.status_id) || !!report.facility_id || !!report.facility || report.custody_status?.toLowerCase().includes('facility') || report.custody_status?.toLowerCase().includes('secured')) ? <PawPrint className="w-5 h-5" /> : <MapPin className="w-5 h-5" />}
                                </div>
                                <div className="overflow-hidden">
                                    <p className="text-[9px] font-black text-white/50 uppercase tracking-widest">
                                        {([6, 7, 8, 9, 10, 11].includes(report.status_id) || !!report.facility_id || !!report.facility || report.custody_status?.toLowerCase().includes('facility') || report.custody_status?.toLowerCase().includes('secured')) ? 'Current Facility Holding Location' : 'Current Active Location'}
                                    </p>
                                    <p className="text-sm font-black tracking-tight text-white truncate">
                                        {report.facility?.name || report.landmark || 'Barangay Holding Facility'}
                                    </p>
                                    <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest mt-0.5">
                                        {isGeocoding ? 'Resolving street...' : resolvedAddress || 'Santa Maria, Bulacan • Selera Homes'}
                                    </p>
                                    {report.facility?.caretaker_name && (
                                        <p className="text-[10px] text-amber-300 font-semibold mt-1">
                                            Caretaker: <span className="font-extrabold">{report.facility.caretaker_name}</span>
                                            {report.facility.caretaker_phone ? ` (${report.facility.caretaker_phone})` : ''}
                                        </p>
                                    )}
                                    <div className="mt-2.5 pt-2 border-t border-white/10 flex flex-wrap items-center gap-2">
                                        <button
                                            onClick={() => handleGetDirections('gps')}
                                            disabled={isLocatingRoute}
                                            className={`px-3 py-1.5 text-white text-[11px] font-black uppercase tracking-wider rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer ${
                                                routingState?.isRealtime
                                                    ? 'bg-emerald-600 hover:bg-emerald-700 ring-2 ring-emerald-400/40' 
                                                    : 'bg-[#F97316] hover:bg-[#EA580C]'
                                            }`}
                                            title="Use device GPS sensor"
                                        >
                                            {isLocatingRoute ? <Hourglass className="w-3.5 h-3.5" /> : routingState?.isRealtime ? <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> : <Compass className="w-3.5 h-3.5" />}
                                            <span>
                                                {isLocatingRoute 
                                                    ? 'Checking Location...' 
                                                    : routingState?.isRealtime 
                                                        ? 'Live GPS Active (Click to Hide)' 
                                                        : 'Directions (Live GPS)'}
                                            </span>
                                        </button>
                                        <button
                                            onClick={() => handleGetDirections('home')}
                                            className="px-2.5 py-1.5 bg-white/10 hover:bg-white/20 text-white text-[11px] font-bold rounded-xl transition-all border border-white/10 flex items-center gap-1.5 cursor-pointer"
                                            title="Route from your registered home coordinates"
                                        >
                                            <Home className="w-3.5 h-3.5" />
                                            <span>From My Home</span>
                                        </button>
                                        <button
                                            onClick={() => handleGetDirections('hq')}
                                            className="px-2.5 py-1.5 bg-white/10 hover:bg-white/20 text-white text-[11px] font-bold rounded-xl transition-all border border-white/10 flex items-center gap-1.5 cursor-pointer"
                                            title="Route from Barangay San Vicente HQ"
                                        >
                                            <Landmark className="w-3.5 h-3.5" />
                                            <span>From Brgy HQ</span>
                                        </button>
                                        <button
                                            onClick={handleSetStartingPointMode}
                                            className={`px-2.5 py-1.5 text-white text-[11px] font-bold rounded-xl transition-all border flex items-center gap-1.5 cursor-pointer ${
                                                isSettingStartingPoint
                                                    ? 'bg-blue-600 border-blue-400 ring-2 ring-blue-400/40'
                                                    : 'bg-white/10 hover:bg-white/20 border-white/10'
                                            }`}
                                            title="Click anywhere on the map or drag the pin to set your starting location"
                                        >
                                            <Crosshair className="w-3.5 h-3.5" />
                                            <span>Set Starting Point</span>
                                        </button>
                                        {routingState?.distance && (
                                            <span className="px-2.5 py-1 bg-white/10 border border-white/15 rounded-xl text-[11px] font-black text-amber-300 inline-flex items-center gap-1">
                                                <Ruler className="w-3 h-3" /> {routingState.distance} {routingState.time ? <><span className="mx-0.5">•</span> <Timer className="w-3 h-3" /> {routingState.time}</> : ''}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {([6, 7, 8, 9, 10, 11].includes(report.status_id) || !!report.facility_id || !!report.facility || report.custody_status?.toLowerCase().includes('facility') || report.custody_status?.toLowerCase().includes('secured') || (report.initial_latitude && (report.initial_latitude !== report.latitude || report.initial_longitude !== report.longitude))) && (
                                <div className="flex items-start gap-4 p-4 rounded-2xl bg-white/5 border border-white/10">
                                    <div className="w-10 h-10 rounded-2xl bg-slate-700 flex items-center justify-center text-slate-300 shrink-0">
                                        <Flag className="w-5 h-5" />
                                    </div>
                                    <div className="overflow-hidden">
                                        <p className="text-[9px] font-black text-white/50 uppercase tracking-widest">Initial Found / Sighting Spot</p>
                                        <p className="text-sm font-black tracking-tight text-slate-200 truncate">
                                            {report.initial_landmark || 'Original Reported Location'}
                                        </p>
                                        <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest mt-0.5">
                                            Preserved Incident Origin
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Location Unreliable Message & Resolution Options */}
                        {locationAmbiguous && (
                            <div className="mb-3.5 p-4 sm:p-5 rounded-2xl sm:rounded-3xl bg-slate-900/95 border-2 border-amber-500/40 text-white shadow-xl animate-in fade-in space-y-3.5">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/30">
                                            <MapPin className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <h4 className="text-xs font-black uppercase tracking-tight text-white">Location Unreliable</h4>
                                            <p className="text-xs text-amber-200 font-semibold mt-0.5">
                                                Your device could not determine your exact location.
                                            </p>
                                        </div>
                                    </div>
                                    <button 
                                        type="button"
                                        onClick={() => setLocationAmbiguous(false)}
                                        className="text-slate-400 hover:text-white text-xs font-bold px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                                
                                <p className="text-[11px] text-slate-300 font-medium">
                                    Please choose an option below to set your route starting point:
                                </p>

                                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                                    <button
                                        type="button"
                                        onClick={() => handleGetDirections('home')}
                                        className="px-3 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-[11px] uppercase tracking-wider rounded-xl transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
                                    >
                                        <Home className="w-3.5 h-3.5" />
                                        <span>From My Home</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => handleGetDirections('hq')}
                                        className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white font-black text-[11px] uppercase tracking-wider rounded-xl transition-all border border-white/15 flex items-center gap-1.5 cursor-pointer"
                                    >
                                        <Landmark className="w-3.5 h-3.5" />
                                        <span>From Brgy HQ</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={handleSetStartingPointMode}
                                        className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white font-black text-[11px] uppercase tracking-wider rounded-xl transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
                                    >
                                        <Crosshair className="w-3.5 h-3.5" />
                                        <span>Set Starting Point</span>
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Setting Starting Point Instruction Banner */}
                        {isSettingStartingPoint && (
                            <div className="mb-3 p-3.5 rounded-2xl bg-blue-500/20 border border-blue-400/40 text-blue-200 text-xs flex items-center justify-between gap-3 animate-in fade-in">
                                <div className="flex items-center gap-2">
                                    <Crosshair className="w-4 h-4 animate-pulse" />
                                    <span className="font-semibold">Click anywhere on the map or drag the blue pin to set your starting location.</span>
                                </div>
                                <button 
                                    type="button"
                                    onClick={() => setIsSettingStartingPoint(false)}
                                    className="px-2.5 py-1 bg-white/10 hover:bg-white/20 rounded-xl text-[10px] font-bold text-white transition-colors cursor-pointer shrink-0"
                                >
                                    Cancel
                                </button>
                            </div>
                        )}

                        {/* General Notification / Route Status */}
                        {locationNotice && !locationAmbiguous && !isSettingStartingPoint && (
                            <div className="mb-3 p-3 rounded-2xl bg-white/10 border border-white/15 text-slate-200 text-xs flex items-center justify-between gap-3 animate-in fade-in">
                                <div className="flex items-center gap-2">
                                    <Info className="w-3.5 h-3.5" />
                                    <span>{locationNotice}</span>
                                </div>
                                <button 
                                    type="button"
                                    onClick={() => setLocationNotice(null)}
                                    className="text-slate-400 hover:text-white text-xs px-2 py-0.5 rounded-lg bg-white/5 transition-colors cursor-pointer"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </div>
                        )}

                        {/* Active Route Tip Pill */}
                        {routingState && !locationAmbiguous && !isSettingStartingPoint && (
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 p-2 px-3.5 bg-white/10 rounded-2xl border border-white/15">
                                <div className="flex items-center gap-2 text-[11px] font-bold text-amber-300">
                                    <Lightbulb className="w-3.5 h-3.5" />
                                    <span>You can <strong>drag the blue pin</strong> or <strong>click anywhere on the map</strong> to change your starting point.</span>
                                </div>
                                <div className="flex items-center gap-1.5 text-[10px] font-extrabold text-slate-300">
                                    <span>Start:</span>
                                    <span className="text-white bg-black/30 px-2 py-0.5 rounded-lg font-mono">
                                        {routingState.start[0].toFixed(4)}, {routingState.start[1].toFixed(4)}
                                    </span>
                                </div>
                            </div>
                        )}

                        <div 
                            id="report-map-container" 
                            className={`w-full ${
                                isMapMaximized 
                                    ? 'h-[80vh] min-h-[550px]' 
                                    : 'h-[65vh] min-h-[460px] sm:h-[520px] md:h-[580px]'
                            } transition-all duration-300 rounded-xl sm:rounded-2xl overflow-hidden border border-white/10 relative`}
                        >
                            {/* Floating Map Controls */}
                            <div className="absolute top-3 sm:top-4 right-3 sm:right-4 z-[400] flex items-center gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => setIsMapMaximized(prev => !prev)}
                                    className="px-2.5 sm:px-3 py-1.5 bg-slate-900/85 hover:bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-wider border border-white/20 transition-all flex items-center gap-1.5 shadow-lg backdrop-blur-md cursor-pointer hover:scale-105 active:scale-95"
                                    title={isMapMaximized ? "Reset to Standard Size" : "Maximize Map Height"}
                                >
                                    {isMapMaximized ? <Minimize2 className="h-3.5 w-3.5 text-amber-300" /> : <Maximize2 className="h-3.5 w-3.5 text-amber-300" />}
                                    <span className="hidden xs:inline">{isMapMaximized ? "Standard" : "Maximize"}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIsMapExpanded(true)}
                                    className="px-2.5 sm:px-3 py-1.5 bg-slate-900/85 hover:bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-wider border border-white/20 transition-all flex items-center gap-1.5 shadow-lg backdrop-blur-md cursor-pointer hover:scale-105 active:scale-95"
                                    title="Expand Map to Fullscreen"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-amber-300" viewBox="0 0 20 20" fill="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h3a1 1 0 010 2H5v2a1 1 0 01-2 0V4zm14 0a1 1 0 00-1-1h-3a1 1 0 110 2h2v2a1 1 0 112 0V4zM3 16a1 1 0 001 1h3a1 1 0 100-2H5v-2a1 1 0 10-2 0v3zm14 0a1 1 0 01-1 1h-3a1 1 0 100-2h2v-2a1 1 0 102 0v3z" />
                                    </svg>
                                    <span className="hidden xs:inline">Fullscreen</span>
                                    <span className="xs:hidden">Expand</span>
                                </button>
                            </div>

                            {(() => {
                                const isRelocated = report.status_id !== 6 && ([7, 8, 9, 10, 11].includes(report.status_id) || !!report.facility_id || !!report.facility || report.custody_status === 'Secured in Facility' || report.custody_status === 'In Barangay Facility' || report.custody_status === 'In Subdivision Facility' || !!(report.initial_latitude && (report.initial_latitude !== report.latitude || report.initial_longitude !== report.longitude)));
                                const activeFacLat = report.facility?.latitude != null ? parseFloat(report.facility.latitude.toString()) : null;
                                const activeFacLng = report.facility?.longitude != null ? parseFloat(report.facility.longitude.toString()) : null;

                                const currentLat = (isRelocated && activeFacLat != null) ? activeFacLat : parseFloat(report.latitude);
                                const currentLng = (isRelocated && activeFacLng != null) ? activeFacLng : parseFloat(report.longitude);
                                const initLat = report.initial_latitude ? parseFloat(report.initial_latitude.toString()) : (isRelocated ? parseFloat(report.latitude.toString()) : null);
                                const initLng = report.initial_longitude ? parseFloat(report.initial_longitude.toString()) : (isRelocated ? parseFloat(report.longitude.toString()) : null);
                                const isOptionBSecured = report.custody_status === 'Secured' || report.custody_status === 'In Custody';
                                const hasDifferentInitialSpot = !isOptionBSecured && isRelocated && initLat != null && initLng != null && (Math.abs(initLat - currentLat) > 0.0001 || Math.abs(initLng - currentLng) > 0.0001);

                                const resiMarkers = [
                                    ...(routingState ? [{
                                        id: -888,
                                        lat: routingState.start[0],
                                        lng: routingState.start[1],
                                        title: routingState.isRealtime ? 'Your Live Location (GPS)' : (routingState.waypointNames?.[0] || 'Your Starting Point'),
                                        category: 'User Location',
                                        priority: 'Low',
                                        draggable: true,
                                        onDragEnd: (newLat: number, newLng: number) => {
                                            handlePinReposition(newLat, newLng);
                                        }
                                    }] : []),
                                    {
                                        id: report.report_id,
                                        lat: currentLat,
                                        lng: currentLng,
                                        title: isRelocated 
                                            ? `Secured: ${report.facility?.name || report.landmark || 'Holding Facility'}` 
                                            : (report.status_id === 6 
                                                ? `Animal Picked Up: ${report.landmark || 'Incident Location'}` 
                                                : (report.landmark || 'Incident Location')),
                                        category: isRelocated ? 'Holding Facility' : (report.animal_type || 'Stray Animal'),
                                        color: (report.status_id === 6) ? 'blue' : ((report.status_id === 11) ? 'green' : (report.status_id === 4 || report.status_id === 13) ? 'orange' : (report.status_id === 5) ? 'yellow' : 'red'),
                                        priority: report.priority_level || 'Medium',
                                        time: report.created_at ? new Date(report.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' }) : 'Live',
                                        rawData: {
                                            ...report,
                                            facility: isRelocated ? (report.facility || { name: report.landmark || 'Holding Facility' }) : undefined,
                                            facility_name: isRelocated ? (report.facility?.name || report.landmark || 'Holding Facility') : undefined
                                        }
                                    },
                                    ...(hasDifferentInitialSpot ? [{
                                        id: -999,
                                        lat: initLat!,
                                        lng: initLng!,
                                        title: `Found Location: ${report.initial_landmark || 'Initial Sighting Spot'}`,
                                        category: 'Initial Sighting',
                                        priority: 'Medium',
                                        rawData: { ...report, landmark: report.initial_landmark || 'Initial Sighting Spot' }
                                    }] : [])
                                ];

                                return (
                                    <MapComponent
                                        height="100%"
                                        center={routingState ? [(routingState.start[0] + currentLat) / 2, (routingState.start[1] + currentLng) / 2] : [currentLat, currentLng]}
                                        zoom={routingState ? 16 : 17}
                                        showHeatmap={false}
                                        showGeofence={true}
                                        showLandmarks={false}
                                        showHoldingFacilities={true}
                                        hideViewDetailsButton={true}
                                        markers={resiMarkers}
                                        onMapClick={(routingState || isSettingStartingPoint) ? (clickedLat, clickedLng) => handlePinReposition(clickedLat, clickedLng) : undefined}
                                        routing={routingState ? {
                                            start: routingState.start,
                                            end: routingState.end,
                                            waypointNames: routingState.waypointNames,
                                            onRoutingUpdate: (data) => setRoutingState(prev => prev ? { ...prev, ...data } : null),
                                            onClose: () => {
                                                stopLocationTracking();
                                                setRoutingState(null);
                                                setLocationNotice(null);
                                                setLocationAmbiguous(false);
                                                setIsSettingStartingPoint(false);
                                            }
                                        } : undefined}
                                    />
                                );
                            })()}
                        </div>
                    </div>
                </div>

                {/* FULLSCREEN EXPANDED MAP MODAL */}
                {isMapExpanded && report && (
                    <div 
                        ref={expandedMapContainerRef}
                        className="fixed inset-0 z-[9999] bg-slate-900 w-full h-full flex flex-col p-3 sm:p-5 text-white overflow-hidden animate-in fade-in duration-200"
                    >
                        <div className="w-full h-full flex flex-col overflow-hidden">
                            {/* Header */}
                            <div className="flex justify-between items-center mb-3 shrink-0 pb-3 border-b border-white/10 gap-3">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="w-8 h-8 rounded-xl bg-orange-500/20 text-orange-400 flex items-center justify-center border border-orange-500/30">
                                            <MapIcon className="w-4 h-4" />
                                        </span>
                                        <div>
                                            <h3 className="text-sm sm:text-base font-black text-white uppercase tracking-tight truncate">
                                                Expanded Map View • {report.landmark || 'Incident Location'}
                                            </h3>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">
                                                Report #{report.report_id} • {resolvedAddress || 'Santa Maria, Bulacan'}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                    {routingState?.distance && (
                                        <span className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 bg-white/10 border border-white/15 rounded-xl text-xs font-black text-amber-300">
                                            <Ruler className="w-3 h-3" /> {routingState.distance} {routingState.time ? <><span className="mx-0.5">•</span> <Timer className="w-3 h-3" /> {routingState.time}</> : ''}
                                        </span>
                                    )}
                                    <button
                                        type="button"
                                        onClick={toggleNativeFullscreen}
                                        className="p-2 hover:bg-white/10 rounded-2xl transition-colors text-slate-300 hover:text-white cursor-pointer border border-white/10 flex items-center justify-center"
                                        title={isNativeFullscreen ? "Exit Browser Fullscreen" : "Enter Browser Fullscreen"}
                                    >
                                        {isNativeFullscreen ? <Minimize2 className="w-5 h-5 text-amber-300" /> : <Maximize2 className="w-5 h-5 text-amber-300" />}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleCloseExpandedMap}
                                        className="p-2 hover:bg-white/10 rounded-2xl transition-colors text-slate-300 hover:text-white cursor-pointer border border-white/10"
                                        title="Close Expanded Map"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            {/* In-Modal Quick Controls */}
                            <div className="flex flex-wrap items-center gap-2 mb-3 shrink-0">
                                <button
                                    type="button"
                                    onClick={() => handleGetDirections('gps')}
                                    disabled={isLocatingRoute}
                                    className={`px-3 py-1.5 text-white text-[11px] font-black uppercase tracking-wider rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer ${
                                        routingState?.isRealtime
                                            ? 'bg-emerald-600 hover:bg-emerald-700 ring-2 ring-emerald-400/40' 
                                            : 'bg-[#F97316] hover:bg-[#EA580C]'
                                    }`}
                                >
                                    {isLocatingRoute ? <Hourglass className="w-3.5 h-3.5" /> : routingState?.isRealtime ? <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> : <Compass className="w-3.5 h-3.5" />}
                                    <span>
                                        {isLocatingRoute
                                            ? 'Checking Location...'
                                            : routingState?.isRealtime
                                                ? 'Live GPS Active'
                                                : 'Directions (Live GPS)'}
                                    </span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleGetDirections('home')}
                                    className="px-2.5 py-1.5 bg-white/10 hover:bg-white/20 text-white text-[11px] font-bold rounded-xl transition-all border border-white/10 flex items-center gap-1.5 cursor-pointer"
                                >
                                    <Home className="w-3.5 h-3.5" />
                                    <span>From My Home</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleGetDirections('hq')}
                                    className="px-2.5 py-1.5 bg-white/10 hover:bg-white/20 text-white text-[11px] font-bold rounded-xl transition-all border border-white/10 flex items-center gap-1.5 cursor-pointer"
                                >
                                    <Landmark className="w-3.5 h-3.5" />
                                    <span>From Brgy HQ</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSetStartingPointMode}
                                    className={`px-2.5 py-1.5 text-white text-[11px] font-bold rounded-xl transition-all border flex items-center gap-1.5 cursor-pointer ${
                                        isSettingStartingPoint
                                            ? 'bg-blue-600 border-blue-400 ring-2 ring-blue-400/40'
                                            : 'bg-white/10 hover:bg-white/20 border-white/10'
                                    }`}
                                >
                                    <Crosshair className="w-3.5 h-3.5" />
                                    <span>Set Starting Point</span>
                                </button>

                                {routingState && (
                                    <span className="text-[10px] font-bold text-amber-300 ml-auto hidden md:inline-flex items-center gap-1">
                                        <Lightbulb className="w-3 h-3" /> Click anywhere on the map or drag the blue pin to adjust your route
                                    </span>
                                )}
                            </div>

                            {/* Expanded Map Canvas */}
                            <div className="flex-1 rounded-none sm:rounded-2xl overflow-hidden relative border-0 sm:border border-white/10 min-h-0">
                                {(() => {
                                    const isRelocated = report.status_id !== 6 && ([7, 8, 9, 10, 11].includes(report.status_id) || !!report.facility_id || !!report.facility || report.custody_status === 'Secured in Facility' || report.custody_status === 'In Barangay Facility' || report.custody_status === 'In Subdivision Facility' || !!(report.initial_latitude && (report.initial_latitude !== report.latitude || report.initial_longitude !== report.longitude)));
                                    const activeFacLat = report.facility?.latitude != null ? parseFloat(report.facility.latitude.toString()) : null;
                                    const activeFacLng = report.facility?.longitude != null ? parseFloat(report.facility.longitude.toString()) : null;

                                    const currentLat = (isRelocated && activeFacLat != null) ? activeFacLat : parseFloat(report.latitude);
                                    const currentLng = (isRelocated && activeFacLng != null) ? activeFacLng : parseFloat(report.longitude);
                                    const initLat = report.initial_latitude ? parseFloat(report.initial_latitude.toString()) : (isRelocated ? parseFloat(report.latitude.toString()) : null);
                                    const initLng = report.initial_longitude ? parseFloat(report.initial_longitude.toString()) : (isRelocated ? parseFloat(report.longitude.toString()) : null);
                                    const isOptionBSecured = report.custody_status === 'Secured' || report.custody_status === 'In Custody';
                                    const hasDifferentInitialSpot = !isOptionBSecured && isRelocated && initLat != null && initLng != null && (Math.abs(initLat - currentLat) > 0.0001 || Math.abs(initLng - currentLng) > 0.0001);

                                    const resiMarkers = [
                                        ...(routingState ? [{
                                            id: -888,
                                            lat: routingState.start[0],
                                            lng: routingState.start[1],
                                            title: routingState.isRealtime ? 'Your Live Location (GPS)' : (routingState.waypointNames?.[0] || 'Your Starting Point'),
                                            category: 'User Location',
                                            priority: 'Low',
                                            draggable: true,
                                            onDragEnd: (newLat: number, newLng: number) => {
                                                handlePinReposition(newLat, newLng);
                                            }
                                        }] : []),
                                        {
                                            id: report.report_id,
                                            lat: currentLat,
                                            lng: currentLng,
                                            title: isRelocated 
                                                ? `Secured: ${report.facility?.name || report.landmark || 'Holding Facility'}` 
                                                : (report.status_id === 6 
                                                    ? `Animal Picked Up: ${report.landmark || 'Incident Location'}` 
                                                    : (report.landmark || 'Incident Location')),
                                            category: isRelocated ? 'Holding Facility' : (report.animal_type || 'Stray Animal'),
                                            color: (report.status_id === 6) ? 'blue' : ((report.status_id === 11) ? 'green' : (report.status_id === 4 || report.status_id === 13) ? 'orange' : (report.status_id === 5) ? 'yellow' : 'red'),
                                            priority: report.priority_level || 'Medium',
                                            time: report.created_at ? new Date(report.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' }) : 'Live',
                                            rawData: {
                                                ...report,
                                                facility: isRelocated ? (report.facility || { name: report.landmark || 'Holding Facility' }) : undefined,
                                                facility_name: isRelocated ? (report.facility?.name || report.landmark || 'Holding Facility') : undefined
                                            }
                                        },
                                        ...(hasDifferentInitialSpot ? [{
                                            id: -999,
                                            lat: initLat!,
                                            lng: initLng!,
                                            title: `Found Location: ${report.initial_landmark || 'Initial Sighting Spot'}`,
                                            category: 'Initial Sighting',
                                            priority: 'Medium',
                                            rawData: { ...report, landmark: report.initial_landmark || 'Initial Sighting Spot' }
                                        }] : [])
                                    ];

                                    return (
                                        <MapComponent
                                            height="100%"
                                            center={routingState ? [(routingState.start[0] + currentLat) / 2, (routingState.start[1] + currentLng) / 2] : [currentLat, currentLng]}
                                            zoom={routingState ? 16 : 17}
                                            showHeatmap={false}
                                            showGeofence={true}
                                            showLandmarks={true}
                                            showHoldingFacilities={true}
                                            hideViewDetailsButton={true}
                                            markers={resiMarkers}
                                            onMapClick={(routingState || isSettingStartingPoint) ? (clickedLat, clickedLng) => handlePinReposition(clickedLat, clickedLng) : undefined}
                                            routing={routingState ? {
                                                start: routingState.start,
                                                end: routingState.end,
                                                waypointNames: routingState.waypointNames,
                                                onRoutingUpdate: (data) => setRoutingState(prev => prev ? { ...prev, ...data } : null),
                                                onClose: () => {
                                                    stopLocationTracking();
                                                    setRoutingState(null);
                                                    setLocationNotice(null);
                                                    setLocationAmbiguous(false);
                                                    setIsSettingStartingPoint(false);
                                                }
                                            } : undefined}
                                        />
                                    );
                                })()}
                            </div>
                        </div>
                    </div>
                )}



            </main>

            <ResiMobileNav
                isNavbarMenuOpen={isNavbarMenuOpen}
                isSearchOpen={isMobileSearchOpen}
                onSearchClick={() => setIsMobileSearchOpen(true)}
            />

            {/* Full-Screen Media Gallery Modal */}
            {activeGallery && (
                <div
                    className="fixed inset-0 z-[9999] bg-[#1a1208]/95 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300"
                    onClick={() => setActiveGallery(null)}
                >
                    <button
                        className="absolute top-8 right-8 bg-white/10 hover:bg-white/20 text-white rounded-full p-3 transition-all z-[10001]"
                        onClick={(e) => { e.stopPropagation(); setActiveGallery(null); }}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>

                    {activeGallery.media.length > 1 && (
                        <>
                            <button
                                className="absolute left-8 w-14 h-14 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center transition-all z-[10001] backdrop-blur-sm group/btn"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const newIndex = (activeGallery.index - 1 + activeGallery.media.length) % activeGallery.media.length;
                                    setActiveGallery({ ...activeGallery, index: newIndex });
                                }}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 group-hover/btn:-translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                                </svg>
                            </button>
                            <button
                                className="absolute right-8 w-14 h-14 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center transition-all z-[10001] backdrop-blur-sm group/btn"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const newIndex = (activeGallery.index + 1) % activeGallery.media.length;
                                    setActiveGallery({ ...activeGallery, index: newIndex });
                                }}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 group-hover/btn:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                                </svg>
                            </button>
                        </>
                    )}

                    <div className="relative max-w-5xl max-h-[85vh] w-full h-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                        {activeGallery.media[activeGallery.index].media_type === 'Video' ? (
                            <video
                                src={activeGallery.media[activeGallery.index].file_url}
                                className="w-full h-full object-contain rounded-3xl shadow-2xl animate-in zoom-in-95 duration-500"
                                controls
                                autoPlay
                            />
                        ) : (
                            <img
                                src={activeGallery.media[activeGallery.index].file_url}
                                alt="Full view"
                                className="w-full h-full object-contain rounded-3xl shadow-2xl animate-in zoom-in-95 duration-500"
                            />
                        )}

                        <div className="absolute -bottom-16 left-0 right-0 flex flex-col items-center gap-2">
                            <div className="flex gap-1.5">
                                {activeGallery.media.map((_, i) => (
                                    <div key={i} className={`h-1 rounded-full transition-all duration-300 ${i === activeGallery.index ? 'w-8 bg-[#F97316]' : 'w-2 bg-white/20'}`} />
                                ))}
                            </div>
                            <p className="text-white/40 text-[9px] font-black uppercase tracking-[0.4em]">
                                Media {activeGallery.index + 1} of {activeGallery.media.length} • StraySafe Surveillance
                            </p>
                        </div>
                    </div>
                </div>
            )}
            {/* Lost Pet QR Code Lightbox Modal */}
            {selectedQrPreview && (
                <div 
                    className="fixed inset-0 z-[10002] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
                    onClick={() => setSelectedQrPreview(null)}
                >
                    <div 
                        className="bg-white dark:bg-[#151C2C] rounded-3xl p-6 sm:p-8 max-w-sm w-full shadow-2xl border border-amber-100 dark:border-amber-800/60 animate-in zoom-in-95 duration-200 text-center relative"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            onClick={() => setSelectedQrPreview(null)}
                            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>

                        <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 flex items-center justify-center mx-auto mb-3">
                            <PawPrint className="w-6 h-6" />
                        </div>
                        <h3 className="text-base font-black text-gray-900 dark:text-white uppercase tracking-tight mb-0.5">
                            {selectedQrPreview.petName || 'Registered Pet'}
                        </h3>
                        <p className="text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest mb-4">
                            StraySafe Digital QR Tag
                        </p>

                        <div className="p-4 bg-amber-50/50 dark:bg-amber-950/30 rounded-2xl border-2 border-dashed border-amber-200 dark:border-amber-800/60 inline-block mb-4">
                            <img
                                src={selectedQrPreview.url}
                                alt="Pet QR Code"
                                className="w-56 h-56 object-contain rounded-xl shadow-sm bg-white p-2 mx-auto"
                            />
                        </div>

                        {selectedQrPreview.hash && (
                            <p className="text-xs font-mono font-bold text-gray-600 dark:text-gray-300 mb-2">
                                Tag ID: {selectedQrPreview.hash}
                            </p>
                        )}

                        {selectedQrPreview.ownerPhone && (
                            <div className="p-3 bg-amber-100/70 dark:bg-amber-950/60 rounded-xl text-amber-950 dark:text-amber-200 text-xs font-bold mb-4">
                                Owner Hotline: <span className="font-extrabold">{selectedQrPreview.ownerPhone}</span>
                            </div>
                        )}

                        <p className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">
                            Scan this tag with the StraySafe Scanner to verify pet registry and instantly alert the owner.
                        </p>
                    </div>
                </div>
            )}

            {/* Case Chat Drawer - restricted to reporter */}
            {isReporter && (
                <ReportChatDrawer
                    isOpen={isChatOpen}
                    onClose={() => setIsChatOpen(false)}
                    report={report}
                    currentUser={currentUser}
                />
            )}

            {/* Floating Chat Trigger - restricted to reporter */}
            {isReporter && !isChatOpen && (
                <div className="fixed bottom-6 right-6 z-40">
                    <button
                        onClick={() => setIsChatOpen(true)}
                        className="px-4 py-3.5 bg-gradient-to-r from-[#F97316] to-[#EA580C] hover:from-[#EA580C] hover:to-[#C2410C] text-white rounded-full shadow-2xl hover:scale-105 active:scale-95 transition-all flex items-center gap-2.5 cursor-pointer border-2 border-white dark:border-gray-800"
                        title="Chat about this report"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                        <span className="font-black text-xs uppercase tracking-wider">
                            Case Chat
                        </span>
                        {chatCount > 0 && (
                            <span className="w-5 h-5 bg-white text-[#F97316] rounded-full text-[10px] font-black flex items-center justify-center shadow-xs">
                                {chatCount}
                            </span>
                        )}
                    </button>
                </div>
            )}
            {/* Dispute Submission Success Alert */}
            {disputeSuccessAlert && (
                <div className="fixed top-24 right-6 z-[9999] max-w-md bg-emerald-600 text-white p-5 rounded-3xl shadow-2xl animate-in slide-in-from-top-4 flex items-center gap-3">
                    <Check className="w-6 h-6" />
                    <div>
                        <p className="text-xs font-black uppercase tracking-wider">Dispute Submitted</p>
                        <p className="text-[11px] text-emerald-100 font-medium">Your counter-claim & vaccination proof were sent to subdivision officers for immediate review.</p>
                    </div>
                </div>
            )}

            {/* Resident Dispute Counter-Claim Modal */}
            {isDisputeModalOpen && report && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-white dark:bg-[#151C2C] rounded-[2.5rem] shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-300 border border-amber-100 dark:border-gray-800">
                        <div className="px-8 py-6 border-b border-gray-150 dark:border-gray-800 flex justify-between items-center bg-amber-50/60 dark:bg-amber-950/30">
                            <div className="flex items-center gap-3">
                                <Scale className="w-8 h-8 text-amber-700 dark:text-amber-400" />
                                <div>
                                    <h3 className="text-xl font-black text-amber-950 dark:text-white uppercase tracking-tight">Dispute Report / Counter-Claim</h3>
                                    <p className="text-xs text-amber-800/80 dark:text-gray-400 mt-0.5 font-medium">Submit vaccination card and home confinement proof to clear false accusations.</p>
                                </div>
                            </div>
                            <button onClick={() => setIsDisputeModalOpen(false)} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-all cursor-pointer">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        <form onSubmit={handleSubmitDispute} className="p-8 space-y-5 max-h-[80vh] overflow-y-auto custom-scrollbar">
                            {userPets.length > 0 && (
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-900 dark:text-white uppercase tracking-widest ml-1">Select Registered Pet (Optional)</label>
                                    <select
                                        value={selectedDisputePetId}
                                        onChange={(e) => setSelectedDisputePetId(e.target.value)}
                                        className="w-full px-5 py-3.5 bg-gray-50 dark:bg-[#1E2738] border border-gray-300 dark:border-gray-700 rounded-2xl text-xs font-semibold text-gray-900 dark:text-white focus:ring-4 focus:ring-amber-100 focus:border-amber-500 outline-none transition-all"
                                    >
                                        <option value="">-- Unspecified / None --</option>
                                        {userPets.map((pet: any) => (
                                            <option key={pet.pet_id} value={pet.pet_id}>
                                                {pet.pet_name} ({pet.species || pet.animal_type || 'Pet'} • {pet.breed || 'Breed'})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-900 dark:text-white uppercase tracking-widest ml-1">Dispute Statement & Explanation</label>
                                <textarea
                                    rows={4}
                                    required
                                    value={disputeReason}
                                    onChange={(e) => setDisputeReason(e.target.value)}
                                    placeholder="Explain why this report is inaccurate (e.g. My pet was inside our fenced gate all afternoon; no bite occurred; anti-rabies up to date)..."
                                    className="w-full px-5 py-3.5 bg-white dark:bg-[#1E2738] border border-gray-300 dark:border-gray-700 rounded-2xl text-xs font-semibold text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:ring-4 focus:ring-amber-100 focus:border-amber-500 outline-none transition-all resize-none"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-900 dark:text-white uppercase tracking-widest ml-1 flex items-center gap-1.5">
                                    <Syringe className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" /> Anti-Rabies Vaccination Card (Photo or PDF)
                                </label>
                                <input
                                    type="file"
                                    accept=".pdf,.jpg,.jpeg,.png"
                                    onChange={(e) => setVaccineCardFile(e.target.files?.[0] || null)}
                                    className="w-full text-xs text-gray-500 dark:text-gray-400 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-black file:uppercase file:bg-blue-50 dark:file:bg-blue-950/50 file:text-blue-700 dark:file:text-blue-300 hover:file:bg-blue-100 dark:hover:file:bg-blue-900/50 file:cursor-pointer"
                                />
                                {vaccineCardFile && <p className="text-[10px] text-blue-700 dark:text-blue-400 font-bold ml-1">Attached: {vaccineCardFile.name}</p>}
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-900 dark:text-white uppercase tracking-widest ml-1 flex items-center gap-1.5">
                                    <Camera className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" /> Supporting Photo (Pet Safe at Home / In Enclosure)
                                </label>
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) => setSupportingPhotoFile(e.target.files?.[0] || null)}
                                    className="w-full text-xs text-gray-500 dark:text-gray-400 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-black file:uppercase file:bg-emerald-50 dark:file:bg-emerald-950/50 file:text-emerald-700 dark:file:text-emerald-300 hover:file:bg-emerald-100 dark:hover:file:bg-emerald-900/50 file:cursor-pointer"
                                />
                                {supportingPhotoFile && <p className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold ml-1">Attached: {supportingPhotoFile.name}</p>}
                            </div>

                            <div className="p-3.5 bg-blue-50 dark:bg-blue-950/30 rounded-2xl border border-blue-200 dark:border-blue-900/50 text-[11px] text-blue-950 dark:text-blue-200 font-medium leading-relaxed flex items-start gap-1.5">
                                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-blue-500" /> <span><strong>Resident Protection:</strong> Submitting this counter-claim will place the report into <em>Disputed</em> status and alert subdivision officers to evaluate your evidence before taking any capture action.</span>
                            </div>

                            <div className="flex gap-4 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setIsDisputeModalOpen(false)}
                                    className="flex-1 py-3.5 bg-gray-100 dark:bg-[#1E2738] hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmittingDispute || !disputeReason.trim()}
                                    className="flex-1 py-3.5 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all shadow-md shadow-amber-500/20 cursor-pointer flex items-center justify-center gap-2"
                                >
                                    {isSubmittingDispute ? 'Submitting...' : 'SUBMIT COUNTER-CLAIM'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ResiViewReport;
