import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { DEFAULT_AVATAR, getProfilePicture } from '../../utils/avatar';
import Button from '../../components/Button';
import ResiNavbar from '../../components/Navbars/ResiNavbar';
import ResiMobileNav from '../../components/Navbars/ResiMobileNav';
import { MapContainer, TileLayer, Marker, useMapEvents, Polygon, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for default marker icon issue in React Leaflet
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIconRetina from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import ReturnToSeleraButton from '../../components/MapControls/ReturnToSeleraButton';

const DefaultIcon = L.icon({
    iconUrl: markerIcon,
    iconRetinaUrl: markerIconRetina,
    shadowUrl: markerShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

const SELERA_POLYGON = [
    { lat: 14.801496, lng: 121.005174 },
    { lat: 14.799577, lng: 121.003911 },
    { lat: 14.800634, lng: 121.002228 },
    { lat: 14.802461, lng: 121.003280 }
];

const getColorHex = (colorName: string): string => {
    const name = colorName.trim().toLowerCase();
    if (name.includes('brown')) return '#8B5A2B';
    if (name.includes('black')) return '#18181B';
    if (name.includes('white')) return '#FAFAFA';
    if (name.includes('gray') || name.includes('grey')) return '#71717A';
    if (name.includes('golden')) return '#F59E0B';
    if (name.includes('orange') || name.includes('ginger')) return '#EA580C';
    if (name.includes('yellow') || name.includes('cream')) return '#EAB308';
    if (name.includes('red')) return '#EF4444';
    if (name.includes('tan')) return '#D2B48C';
    if (name.includes('blue')) return '#3B82F6';
    if (name.includes('green')) return '#10B981';
    return '#71717A'; // fallback gray
};

const getSwatchStyle = (colorStr?: string | null): string => {
    const colors = (colorStr || 'Brown').split(',').map(c => c.trim()).filter(Boolean);
    if (colors.length === 0) return '#8B5A2B';
    if (colors.length === 1) return getColorHex(colors[0]);
    // Beautiful split linear gradient for multiple colors
    const hex1 = getColorHex(colors[0]);
    const hex2 = getColorHex(colors[1]);
    return `linear-gradient(135deg, ${hex1} 50%, ${hex2} 50%)`;
};

const isInsideSeleraHomes = (lat: number, lng: number) => {
    let n = SELERA_POLYGON.length;
    let inside = false;
    let p1 = SELERA_POLYGON[0];
    for (let i = 0; i <= n; i++) {
        let p2 = SELERA_POLYGON[i % n];
        if (lat > Math.min(p1.lat, p2.lat)) {
            if (lat <= Math.max(p1.lat, p2.lat)) {
                if (lng <= Math.max(p1.lng, p2.lng)) {
                    let xints = 0;
                    if (p1.lat !== p2.lat) {
                        xints = (lat - p1.lat) * (p2.lng - p1.lng) / (p2.lat - p1.lat) + p1.lng;
                    }
                    if (p1.lng === p2.lng || lng <= xints) {
                        inside = !inside;
                    }
                }
            }
        }
        p1 = p2;
    }
    return inside;
};


// Custom component to handle map clicks and move marker
const LocationPicker = ({ onLocationSelect, position, disabled }: { onLocationSelect: (lat: number, lng: number) => void, position: [number, number], disabled?: boolean }) => {
    useMapEvents({
        click(e) {
            if (!disabled) {
                onLocationSelect(e.latlng.lat, e.latlng.lng);
            }
        },
    });

    return position ? <Marker position={position} /> : null;
};

const RecenterMap = ({ center }: { center: [number, number] }) => {
    const map = useMap();
    useEffect(() => {
        map.setView(center, map.getZoom());
    }, [center, map]);
    return null;
};



interface ReportFormData {
    category: string;
    category_id: number | undefined;
    animalCount: number;
    landmark: string;
    visibility: string;
    priorityLevel: string;
    isPossibleOwned: boolean;
    animalType: string;
    animalBreed: string;
    primaryColor: string;
    secondaryColor: string;
    coatPattern: string;
    distinctiveMarkings: string;
    observedConditions: string[];
    estimatedSize: string;
    description: string;
    latitude: number;
    longitude: number;
    mediaFiles: File[];
    existingMedia: any[];
    mediaIdsToDelete: number[];
    aiSuggestions: any;
}

const categoryMap: Record<number, string> = {
    1: 'Injured Animal',
    2: 'Aggressive Stray',
    3: 'Possible Rabies Risk',
    4: 'Roaming Pack',
    5: 'Animal Rescue Needed',
    6: 'Lost Pet'
};

const reportStatusMap: Record<number, string> = {
    1: 'Reported',
    2: 'Verified',
    3: 'Rejected',
    4: 'Escalated to Barangay',
    5: 'Rescue In Progress',
    6: 'Picked Up',
    7: 'Under Observation',
    8: 'Impounded',
    9: 'Claimed by Owner',
    10: 'Released',
    11: 'Resolved',
    12: 'Deceased',
    13: 'Approved'
};

const parseReportDescription = (description: string) => {
    if (!description) return { cleanNotes: '', pattern: '', conditions: '', markings: '' };
    
    if (description.includes('|') || description.toLowerCase().includes('pattern:') || description.toLowerCase().includes('observed conditions:') || description.toLowerCase().includes('notes:')) {
        const parts = description.split('|').map((p: string) => p.trim());
        let pattern = '';
        let conditions = '';
        let markings = '';
        let cleanNotes = '';

        parts.forEach((part: string) => {
            if (part.toLowerCase().startsWith('pattern:')) {
                pattern = part.replace(/^pattern:\s*/i, '').trim();
            } else if (part.toLowerCase().startsWith('observed conditions:')) {
                conditions = part.replace(/^observed conditions:\s*/i, '').trim();
            } else if (part.toLowerCase().startsWith('markings:')) {
                markings = part.replace(/^markings:\s*/i, '').trim();
            } else if (part.toLowerCase().startsWith('notes:')) {
                cleanNotes = part.replace(/^notes:\s*/i, '').trim();
            } else if (!pattern && !conditions && !markings && !cleanNotes) {
                cleanNotes = part.trim();
            }
        });

        return { cleanNotes, pattern, conditions, markings };
    }

    return { cleanNotes: description.trim(), pattern: '', conditions: '', markings: '' };
};

const FormattedReportDescription = ({ description }: { description: string }) => {
    if (!description) {
        return null;
    }

    // Check if this is a structured Lost Pet Report
    if (description.includes('[LOST PET REPORT]')) {
        const lines = description.split('\n').map(l => l.trim()).filter(Boolean);
        const headerLine = lines.find(l => l.includes('[LOST PET REPORT]')) || '';
        const bulletLines = lines.filter(l => l.startsWith('•') && !l.toLowerCase().includes('owner') && !l.toLowerCase().includes('contact'));
        const closingLines = lines.filter(l => !l.includes('[LOST PET REPORT]') && !l.startsWith('•'));

        return (
            <div className="space-y-3.5 my-3">
                {/* Header / Banner notice */}
                <div className="flex items-center gap-2.5 p-3 px-4 bg-gradient-to-r from-red-50 to-orange-50 rounded-2xl border border-red-200/80 text-red-950 shadow-xs">
                    <span className="text-lg animate-pulse shrink-0">🚨</span>
                    <p className="text-xs sm:text-sm font-black uppercase tracking-tight">
                        {headerLine.replace('[LOST PET REPORT]', '').trim() || 'Missing Registered Pet Alert'}
                    </p>
                </div>

                {/* Structured Attributes Grid */}
                {bulletLines.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 bg-[#FAF9F6] p-4 rounded-3xl border border-stone-200/70 shadow-xs">
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
                                        className={`p-3 rounded-2xl bg-white border border-stone-100 shadow-2xs ${isWide ? 'sm:col-span-2' : ''}`}
                                    >
                                        <p className="text-[9px] font-black text-amber-800 uppercase tracking-widest mb-1 flex items-center gap-1">
                                            {key.toLowerCase().includes('last seen') && <span>📍</span>}
                                            {key.toLowerCase().includes('breed') && <span>🐾</span>}
                                            {key.toLowerCase().includes('color') && <span>🎨</span>}
                                            {key.toLowerCase().includes('collar') && <span>🏷️</span>}
                                            {key.toLowerCase().includes('owner') && <span>👤</span>}
                                            {key.toLowerCase().includes('reward') && <span>🎁</span>}
                                            {key.toLowerCase().includes('circumstances') && <span>📝</span>}
                                            <span>{key}</span>
                                        </p>
                                        <p className="text-xs sm:text-[13px] font-bold text-gray-900 leading-snug">
                                            {val}
                                        </p>
                                    </div>
                                );
                            }
                            return (
                                <div key={idx} className="sm:col-span-2 p-2.5 rounded-2xl bg-white border border-stone-100 text-xs font-semibold text-gray-800">
                                    • {raw}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Closing / Callout */}
                {closingLines.length > 0 && (
                    <div className="p-3.5 bg-amber-500/10 rounded-2xl border border-amber-300/60 text-xs font-bold text-amber-950 flex items-start gap-2.5 shadow-2xs">
                        <span className="text-amber-600 text-base shrink-0">📢</span>
                        <p className="leading-relaxed">
                            {closingLines.join(' ')}
                        </p>
                    </div>
                )}
            </div>
        );
    }

    const { cleanNotes } = parseReportDescription(description);

    if (!cleanNotes || cleanNotes === 'No additional details provided.') {
        return null;
    }

    // Default / Standard Report Description: clean typography with preserved linebreaks
    return (
        <div className="text-[13px] sm:text-[14px] font-medium text-[#2d2417] leading-relaxed whitespace-pre-line">
            {cleanNotes}
        </div>
    );
};

const INITIAL_FORM_DATA: ReportFormData = {
    category: 'Injured Animal',
    category_id: 1,
    animalCount: 1,
    landmark: '',
    visibility: 'Public',
    priorityLevel: 'Medium',
    isPossibleOwned: false,
    animalType: 'Dog',
    animalBreed: 'Unknown',
    primaryColor: 'Brown',
    secondaryColor: 'None',
    coatPattern: 'Unknown',
    distinctiveMarkings: '',
    observedConditions: [],
    estimatedSize: 'Medium',
    description: '',
    latitude: 14.801313,
    longitude: 121.003109,
    mediaFiles: [],
    existingMedia: [],
    mediaIdsToDelete: [],
    aiSuggestions: null
};

const ResiHomePage = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [isAddReportModalOpen, setIsAddReportModalOpen] = useState(false);
    const [isNavbarMenuOpen, setIsNavbarMenuOpen] = useState(false);
    const [returnUrl, setReturnUrl] = useState<string | null>(null);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isCheckingAI, setIsCheckingAI] = useState(false);
    const [validationStatus, setValidationStatus] = useState('');
    const [showInconclusiveModal, setShowInconclusiveModal] = useState(false);
    const [inconclusiveText, setInconclusiveText] = useState('');
    const [showFinalConfirmModal, setShowFinalConfirmModal] = useState(false);
    const [reports, setReports] = useState<any[]>([]);
    const [announcements, setAnnouncements] = useState<any[]>([]);
    const [notifications, setNotifications] = useState<any[]>([]);
    const [dismissedNotificationIds, setDismissedNotificationIds] = useState<Set<number>>(new Set());
    const [visibleNotifLimit, setVisibleNotifLimit] = useState(5);
    const [hasClickedViewAll, setHasClickedViewAll] = useState(false);
    const [announcementsLimit, setAnnouncementsLimit] = useState(10);
    const [annCommentInputs, setAnnCommentInputs] = useState<Record<number, string>>({});
    const [annReplyingTo, setAnnReplyingTo] = useState<Record<number, { commentId: number, userName: string } | null>>({});
    const [feedTab, setFeedTab] = useState<'reports' | 'announcements'>('reports');
    const [searchQuery, setSearchQuery] = useState('');
    const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);

    const [commentInputs, setCommentInputs] = useState<Record<number, string>>({});
    const [replyingTo, setReplyingTo] = useState<Record<number, { commentId: number, userName: string } | null>>({});
    const [expandedComments, setExpandedComments] = useState<Record<number, boolean>>({});

    const [openMenuId, setOpenMenuId] = useState<number | null>(null);
    const [editingReportId, setEditingReportId] = useState<number | null>(null);
    const [activeGallery, setActiveGallery] = useState<{ media: any[], index: number } | null>(null);
    const [animalTypeValidation, setAnimalTypeValidation] = useState<{
        show: boolean;
        reportId: number;
        ai_animal_type: string;
        ai_dominant_color: string;
        ai_estimated_size: string;
        ai_possible_breed: string;
        ai_suggested_priority: string;
        ai_suggested_risk_level: string;
        user_animal_type: string;
        user_dominant_color: string;
        user_estimated_size: string;
        user_possible_breed: string;
    } | null>(null);
    const [revertAnimalType, setRevertAnimalType] = useState<boolean>(false);
    const [revertColors, setRevertColors] = useState<boolean>(false);
    const [revertSize, setRevertSize] = useState<boolean>(false);
    const [activeQrModal, setActiveQrModal] = useState<{ url: string; petName?: string; hash?: string; ownerName?: string; ownerPhone?: string } | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const [reportStep, setReportStep] = useState<number>(1);
    const [formData, setFormData] = useState<ReportFormData>(INITIAL_FORM_DATA);
    const [aiAnalysisResult, setAiAnalysisResult] = useState<{
        animalType: string;
        primaryColor: string;
        secondaryColor: string;
        coatPattern: string;
        estimatedSize: string;
        possibleBreed: string;
        collarDetected: boolean;
        qrTagDetected: boolean;
    } | null>(null);
    const [isAnalyzingMedia, setIsAnalyzingMedia] = useState(false);

    const VALID_COAT_PATTERNS = ['Solid', 'Bicolor', 'Tricolor', 'Spotted', 'Striped', 'Patched', 'Brindle', 'Merle', 'Tabby', 'Calico', 'Tortoiseshell', 'Mixed', 'Unknown'];
    const VALID_PRIMARY_COLORS = ['Black', 'Brown', 'White', 'Gray', 'Tan', 'Golden', 'Cream', 'Orange', 'Mixed'];
    const VALID_SECONDARY_COLORS = ['None', 'Black', 'Brown', 'White', 'Gray', 'Tan', 'Golden', 'Cream', 'Orange'];

    const normalizeOption = (val: string, options: string[], defaultVal: string) => {
        if (!val) return defaultVal;
        const clean = val.trim();
        const found = options.find(o => o.toLowerCase() === clean.toLowerCase());
        if (found) return found;
        const partial = options.find(o => clean.toLowerCase().includes(o.toLowerCase()) || o.toLowerCase().includes(clean.toLowerCase()));
        return partial || defaultVal;
    };

    const triggerMediaAnalysis = async (overrideFiles?: File[]) => {
        const filesToUse = overrideFiles || formData.mediaFiles;
        if (filesToUse && filesToUse.length > 0) {
            setIsAnalyzingMedia(true);
            try {
                const mediaData = new FormData();
                mediaData.append("file", filesToUse[0]);
                const res = await axios.post('http://localhost:8000/reports/analyze-media', mediaData);
                if (res.status === 200 && res.data) {
                    const ai = res.data;
                    const normType = ['Dog', 'Cat'].includes(ai.animal_type) ? ai.animal_type : (ai.animal_type?.toLowerCase().includes('dog') ? 'Dog' : 'Cat');
                    const normPrimary = normalizeOption(ai.primary_color, VALID_PRIMARY_COLORS, 'Black');
                    const normSecondary = normalizeOption(ai.secondary_color, VALID_SECONDARY_COLORS, 'None');
                    const normPattern = normalizeOption(ai.coat_pattern, VALID_COAT_PATTERNS, 'Solid');
                    const normSize = ['Small', 'Medium', 'Large'].includes(ai.estimated_size) ? ai.estimated_size : 'Medium';

                    const resultObj = {
                        animalType: normType,
                        primaryColor: normPrimary,
                        secondaryColor: normSecondary,
                        coatPattern: normPattern,
                        estimatedSize: normSize,
                        possibleBreed: ai.possible_breed || 'Puspin',
                        collarDetected: Boolean(ai.collar_detected),
                        qrTagDetected: Boolean(ai.qr_tag_detected)
                    };
                    setAiAnalysisResult(resultObj);
                    setFormData(prev => ({
                        ...prev,
                        animalType: resultObj.animalType,
                        primaryColor: resultObj.primaryColor,
                        secondaryColor: resultObj.secondaryColor,
                        coatPattern: resultObj.coatPattern,
                        estimatedSize: resultObj.estimatedSize,
                        animalBreed: resultObj.possibleBreed
                    }));
                }
            } catch (err) {
                console.warn('AI media analysis error, using defaults:', err);
            } finally {
                setIsAnalyzingMedia(false);
            }
        }
    };

    const [breedsData, setBreedsData] = useState<any[]>([]);
    const [breedImageUrl, setBreedImageUrl] = useState<string | null>(null);
    const [isFetchingBreedImage, setIsFetchingBreedImage] = useState(false);

    const [resolvedAddress, setResolvedAddress] = useState('');
    const [isGeocoding, setIsGeocoding] = useState(false);
    const [isMapPickerOpen, setIsMapPickerOpen] = useState(false);
    const [tempLandmark, setTempLandmark] = useState('');

    useEffect(() => {
        if (!isAddReportModalOpen && !isMapPickerOpen) {
            setResolvedAddress('');
            return;
        }

        const fetchAddress = async () => {
            setIsGeocoding(true);
            try {
                const response = await axios.get('https://nominatim.openstreetmap.org/reverse', {
                    params: {
                        format: 'jsonv2',
                        lat: formData.latitude,
                        lon: formData.longitude,
                        addressdetails: 1,
                        extratags: 1,
                        namedetails: 1
                    },
                    headers: {
                        'Accept-Language': 'en'
                    }
                });
                if (response.data && response.data.address) {
                    const addr = response.data.address;
                    const parts = [];
                    const road = addr.road || addr.pedestrian || addr.path || '';
                    if (road) parts.push(road);
                    const neighbourhood = addr.neighbourhood || addr.village || addr.suburb || '';
                    if (neighbourhood && neighbourhood !== road) {
                        parts.push(neighbourhood);
                    }
                    const city = addr.city || addr.town || addr.municipality || '';
                    if (city) parts.push(city);

                    const addressStr = parts.join(', ') || response.data.display_name;
                    setResolvedAddress(addressStr);

                    // Extract place / landmark name from API response
                    const detectedLandmark = response.data.name ||
                        addr.amenity || addr.shop || addr.building || addr.office ||
                        addr.tourism || addr.historic || addr.leisure || addr.house_name ||
                        addr.place || (road ? (neighbourhood ? `${road}, ${neighbourhood}` : road) : '');

                    if (detectedLandmark) {
                        setTempLandmark(detectedLandmark);
                    }
                } else {
                    setResolvedAddress(`${formData.latitude.toFixed(6)}, ${formData.longitude.toFixed(6)}`);
                }
            } catch (err) {
                console.error('Error fetching address from Nominatim:', err);
                setResolvedAddress(`${formData.latitude.toFixed(6)}, ${formData.longitude.toFixed(6)}`);
            } finally {
                setIsGeocoding(false);
            }
        };

        const timer = setTimeout(() => {
            fetchAddress();
        }, 400);

        return () => clearTimeout(timer);
    }, [formData.latitude, formData.longitude, isAddReportModalOpen, isMapPickerOpen]);

    const userStr = localStorage.getItem('resident_user') || sessionStorage.getItem('resident_user');
    const currentUser = userStr ? JSON.parse(userStr) : null;
    const currentUserId = currentUser ? (currentUser.user_id || currentUser.id) : null;

    useEffect(() => {
        if (location.state?.from) {
            setReturnUrl(location.state.from);
        }
        if (location.state?.selectAnnouncements) {
            setFeedTab('announcements');
            navigate(location.pathname, { replace: true, state: {} });
        }
        if (location.state?.openAddModal) {
            setEditingReportId(null);
            setReportStep(1);
            setFormData(INITIAL_FORM_DATA);
            setIsAddReportModalOpen(true);
            // Clear state so it doesn't reopen on refresh
            navigate(location.pathname, { replace: true, state: {} });
        }
        if (location.state?.editReport) {
            const editReport = location.state.editReport;
            if (location.state?.isViewMode) {
                // Always fetch fresh from the single-report endpoint to get up-to-date AI suggestions
                openReportDetail(editReport.report_id, editReport);
            } else {
                handleEditClick(editReport);
            }
            // Clear state so it doesn't reopen on refresh
            navigate(location.pathname, { replace: true, state: {} });
        }
    }, [location.state]);

    const handleCloseModal = () => {
        setIsAddReportModalOpen(false);
        setIsMapPickerOpen(false);
        if (returnUrl) {
            navigate(returnUrl);
            setReturnUrl(null);
        }
    };


    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setOpenMenuId(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        const fetchBreeds = async () => {
            try {
                if (formData.animalType === 'Dog') {
                    const apiKey = import.meta.env.VITE_DOG_API_KEY || 'live_J9RdXZq7OGRCUigDyq3y8rGqcG3Brarp46ohljsIMO572q0KYcW1alD0z88OADKs';
                    const res = await fetch('https://api.thedogapi.com/v1/breeds', {
                        headers: apiKey ? { 'x-api-key': apiKey } : {}
                    });
                    if (res.ok) {
                        const data = await res.json();
                        setBreedsData(data);
                    } else {
                        throw new Error('API failed');
                    }
                } else if (formData.animalType === 'Cat') {
                    const apiKey = import.meta.env.VITE_CAT_API_KEY || 'live_GqD4rtVuossncqXxRcSvcmptrS9rD7NFoigE6UP59wNG69yZ0YhLh35HRma3ZbEm';
                    const res = await fetch('https://api.thecatapi.com/v1/breeds', {
                        headers: apiKey ? { 'x-api-key': apiKey } : {}
                    });
                    if (res.ok) {
                        const data = await res.json();
                        setBreedsData(data);
                    } else {
                        throw new Error('API failed');
                    }
                } else {
                    setBreedsData([]);
                }
            } catch (err) {
                console.error("Failed to load breed images from API:", err);
                setBreedsData([]);
            }
        };
        fetchBreeds();
    }, [formData.animalType]);

    useEffect(() => {
        const query = formData.animalBreed.trim().toLowerCase();
        if (!query || breedsData.length === 0) {
            setBreedImageUrl(null);
            return;
        }

        // Standardize common phonetic typos and shortcuts
        const normalizedQuery = query
            .replace('dalmation', 'dalmatian')
            .replace('shihtzu', 'shih tzu')
            .replace('shepard', 'shepherd')
            .replace('coly', 'collie');

        const matchedBreed = breedsData.find((b) => {
            const breedName = b.name.toLowerCase();
            if (breedName === normalizedQuery) return true;
            if (normalizedQuery.length >= 3) {
                return breedName.includes(normalizedQuery) || normalizedQuery.includes(breedName);
            }
            return false;
        });

        if (!matchedBreed) {
            setBreedImageUrl(null);
            return;
        }

        if (matchedBreed.image?.url) {
            setBreedImageUrl(matchedBreed.image.url);
        } else if (matchedBreed.id) {
            // Fetch dynamically from images search
            const fetchImage = async () => {
                setIsFetchingBreedImage(true);
                try {
                    const isDog = formData.animalType === 'Dog';
                    const baseUrl = isDog ? 'https://api.thedogapi.com' : 'https://api.thecatapi.com';
                    const apiKey = isDog
                        ? (import.meta.env.VITE_DOG_API_KEY || 'live_J9RdXZq7OGRCUigDyq3y8rGqcG3Brarp46ohljsIMO572q0KYcW1alD0z88OADKs')
                        : (import.meta.env.VITE_CAT_API_KEY || 'live_GqD4rtVuossncqXxRcSvcmptrS9rD7NFoigE6UP59wNG69yZ0YhLh35HRma3ZbEm');

                    const res = await fetch(`${baseUrl}/v1/images/search?breed_id=${matchedBreed.id}`, {
                        headers: apiKey ? { 'x-api-key': apiKey } : {}
                    });
                    if (res.ok) {
                        const data = await res.json();
                        if (data && data.length > 0 && data[0].url) {
                            setBreedImageUrl(data[0].url);
                        } else {
                            setBreedImageUrl(null);
                        }
                    } else {
                        setBreedImageUrl(null);
                    }
                } catch (err) {
                    console.error('Error fetching breed image:', err);
                    setBreedImageUrl(null);
                } finally {
                    setIsFetchingBreedImage(false);
                }
            };
            fetchImage();
        } else {
            setBreedImageUrl(null);
        }
    }, [formData.animalBreed, formData.animalType, breedsData]);

    const handleDeleteReport = async (reportId: number) => {
        if (!window.confirm('Are you sure you want to delete this report?')) return;
        try {
            const response = await fetch(`http://localhost:8000/reports/${reportId}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                alert('Report deleted successfully');
                fetchReports();
            } else {
                alert('Failed to delete report');
            }
        } catch (error) {
            console.error('Error deleting report:', error);
            alert('An error occurred while connecting to the server.');
        }
    };

    const handleEditClick = (report: any) => {
        const categoryMap: Record<number, string> = {
            1: 'Injured Animal', 2: 'Aggressive Stray', 3: 'Possible Rabies Risk',
            4: 'Roaming Pack', 5: 'Animal Rescue Needed', 6: 'Lost Pet'
        };

        let primaryColor = report.primary_color;
        let secondaryColor = report.secondary_color || 'None';
        if (!primaryColor && report.animal_color) {
            const parts = report.animal_color.split(' and ');
            primaryColor = parts[0] || 'Brown';
            if (parts[1]) secondaryColor = parts[1];
        }

        const initialData: ReportFormData = {
            category: categoryMap[report.category_id] || 'Injured Animal',
            category_id: report.category_id,
            animalCount: report.animal_count || 1,
            landmark: report.landmark || '',
            visibility: report.visibility || 'Public',
            priorityLevel: report.priority_level || 'Medium',
            isPossibleOwned: report.is_possible_owned || false,
            animalType: report.animal_type || 'Unknown',
            animalBreed: report.animal_breed || '',
            primaryColor: primaryColor || 'Brown',
            secondaryColor: secondaryColor,
            coatPattern: report.coat_pattern || 'Unknown',
            distinctiveMarkings: report.distinctive_markings || '',
            observedConditions: report.observed_conditions || [],
            estimatedSize: report.estimated_size || 'Medium',
            description: report.description || '',
            latitude: parseFloat(report.latitude) || 14.801313,
            longitude: parseFloat(report.longitude) || 121.003109,
            mediaFiles: [],
            existingMedia: report.media || [],
            mediaIdsToDelete: [],
            aiSuggestions: null
        };

        setFormData(initialData);
        setEditingReportId(report.report_id);
        setIsAddReportModalOpen(true);
        setOpenMenuId(null);
    };

    const fetchReports = async () => {
        try {
            const response = await fetch('http://localhost:8000/reports/');
            if (response.ok) {
                const data = await response.json();

                // Filter out Private reports that do not belong to the current user
                // Also exclude resolved and deceased reports (status_id 11 and 12) from the home page feed
                const visibleReports = data.filter((report: any) => {
                    const isVisible = report.visibility === 'Public' || report.user_id === currentUserId;
                    const isNotResolved = report.status_id !== 3 && report.status_id !== 11 && report.status_id !== 12 && report.current_status_id !== 3 && report.current_status_id !== 11 && report.current_status_id !== 12;
                    return isVisible && isNotResolved;
                });

                setReports(visibleReports.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
            }
        } catch (error) {
            console.error('Failed to fetch reports from backend:', error);
        }
    };

    // Navigate to the standalone report detail page
    const openReportDetail = (reportId: number, _fallback?: any) => {
        navigate(`/resident/reports/${reportId}`);
    };

    const fetchAnnouncements = async () => {
        if (!currentUserId) return;
        try {
            const response = await axios.get(`http://localhost:8000/announcements/feed/resident/${currentUserId}`);
            setAnnouncements(response.data);
        } catch (error) {
            console.error('Failed to fetch announcements:', error);
        }
    };

    const handleLikeAnnouncement = async (announcementId: number) => {
        if (!currentUserId) return;
        try {
            await axios.post(`http://localhost:8000/announcements/${announcementId}/react`, {
                user_id: currentUserId,
                reaction_type: "Like"
            });
            await fetchAnnouncements();
        } catch (error) {
            console.error('Failed to react to announcement:', error);
        }
    };

    const handleAddAnnouncementComment = async (announcementId: number, parentCommentId: number | null = null) => {
        const text = annCommentInputs[announcementId];
        if (!text || !text.trim() || !currentUserId) return;
        try {
            await axios.post(`http://localhost:8000/announcements/${announcementId}/comments`, {
                user_id: currentUserId,
                comment: text.trim(),
                parent_comment_id: parentCommentId
            });
            setAnnCommentInputs(prev => ({ ...prev, [announcementId]: '' }));
            setAnnReplyingTo(prev => ({ ...prev, [announcementId]: null }));
            await fetchAnnouncements();
        } catch (error) {
            console.error('Failed to add announcement comment:', error);
            alert('Failed to post comment.');
        }
    };

    const formatTimestamp = (raw: string | Date | number) => {
        if (!raw) return '';
        let dt: Date;
        if (typeof raw === 'string') {
            let normalized = raw.trim();
            if (normalized.includes(' ') && !normalized.includes('T')) {
                normalized = normalized.replace(' ', 'T');
            }
            dt = new Date(normalized);
        } else {
            dt = new Date(raw);
        }

        if (Number.isNaN(dt.getTime())) return String(raw);

        const now = new Date();
        const diffMs = now.getTime() - dt.getTime();
        const diffSecs = Math.floor(diffMs / 1000);

        if (diffSecs < 60) {
            const secs = Math.max(1, diffSecs);
            return `${secs}s`;
        }
        const diffMins = Math.floor(diffSecs / 60);
        if (diffMins < 60) {
            return `${diffMins}m`;
        }
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) {
            return `${diffHours}h`;
        }
        const diffDays = Math.floor(diffHours / 24);
        if (diffDays < 7) {
            return `${diffDays}d`;
        }

        // Older than 7 days
        const month = dt.toLocaleDateString('en-US', { month: 'short' });
        const day = dt.toLocaleDateString('en-US', { day: 'numeric' });
        const time = dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

        if (dt.getFullYear() < now.getFullYear()) {
            return `${month} ${day}, ${dt.getFullYear()} at ${time}`;
        } else {
            return `${month} ${day} at ${time}`;
        }
    };

    const formatAnnouncementDate = (raw: string) => {
        if (!raw) return '';
        let dt: Date;
        if (typeof raw === 'string') {
            let normalized = raw.trim();
            if (normalized.includes(' ') && !normalized.includes('T')) {
                normalized = normalized.replace(' ', 'T');
            }
            dt = new Date(normalized);
        } else {
            dt = new Date(raw);
        }

        if (Number.isNaN(dt.getTime())) return raw;

        const month = dt.toLocaleDateString('en-US', { month: 'short' });
        const day = dt.toLocaleDateString('en-US', { day: 'numeric' });
        const year = dt.getFullYear();
        const time = dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

        return `${month} ${day}, ${year} at ${time}`;
    };

    const API_URL = 'http://localhost:8000/reports';

    const fetchNotifications = async () => {
        if (!currentUserId) return;
        try {
            const response = await axios.get(`http://localhost:8000/notifications/user/${currentUserId}`);
            setNotifications(response.data);
        } catch (error) {
            console.error('Failed to fetch notifications:', error);
        }
    };

    const handleMarkAllNotificationsRead = async () => {
        if (!currentUserId) return;
        try {
            await axios.post(`http://localhost:8000/notifications/mark-all-read/${currentUserId}`);
            fetchNotifications();
        } catch (error) {
            console.error('Failed to mark all notifications as read:', error);
        }
    };

    const handleMarkNotificationRead = async (id: number) => {
        try {
            await axios.patch(`http://localhost:8000/notifications/${id}`, { is_read: true });
            fetchNotifications();
        } catch (error) {
            console.error('Failed to mark notification as read:', error);
        }
    };

    const handleDismissNotification = async (id: number) => {
        setDismissedNotificationIds(prev => new Set(prev).add(id));
        try {
            await axios.post(`http://localhost:8000/notifications/${id}/archive`);
            fetchNotifications();
        } catch (error) {
            console.error('Failed to archive notification:', error);
        }
    };

    const handleNotificationClick = (notif: any) => {
        if (!notif.is_read) {
            handleMarkNotificationRead(notif.notification_id);
        }

        const typeStr = (notif.type || '').toLowerCase();
        const titleStr = (notif.title || '').toLowerCase();
        const msgStr = (notif.message || '').toLowerCase();

        const isMatch = typeStr === 'potential_match' ||
            typeStr === 'match_review' ||
            titleStr.includes('match') ||
            titleStr.includes('sighting') ||
            msgStr.includes('match') ||
            msgStr.includes('potential match') ||
            msgStr.includes('matches of your dog');

        if (isMatch && notif.related_id) {
            navigate(`/resident/reports/${notif.related_id}/match-review`);
        } else if (notif.related_id) {
            if (typeStr === 'alert' || titleStr.includes('scan')) {
                navigate(`/resident/pet/${notif.related_id}/scan-history`);
            } else {
                navigate(`/resident/reports/${notif.related_id}`);
            }
        }
    };

    useEffect(() => {
        fetchReports();
        fetchAnnouncements();
        fetchNotifications();
    }, [currentUserId]);

    const handleAddComment = async (reportId: number) => {
        const text = commentInputs[reportId];
        if (!text || !text.trim()) return;

        try {
            const userId = currentUserId || 1; // Default to 1 if not logged in
            const parentId = replyingTo[reportId]?.commentId || null;

            const response = await fetch(`http://localhost:8000/reports/${reportId}/comments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ comment: text.trim(), user_id: userId, parent_comment_id: parentId })
            });

            if (response.ok) {
                setCommentInputs(prev => ({ ...prev, [reportId]: '' }));
                setReplyingTo(prev => ({ ...prev, [reportId]: null }));
                fetchReports(); // Refresh comments
            } else {
                alert('Failed to post comment.');
            }
        } catch (error) {
            console.error('Error adding comment:', error);
        }
    };



    const validateAISuggestions = (reportId: number, suggestions: any) => {
        if (!suggestions || !suggestions.ai_animal_type) return false;

        const userType = formData.animalType;
        const userColor = formData.secondaryColor && formData.secondaryColor !== 'None'
            ? `${formData.primaryColor} and ${formData.secondaryColor}`
            : (formData.primaryColor || '');
        const userSize = formData.estimatedSize || 'Medium';

        // Check if there is an inconsistency or missing info (excluding breed)
        const isTypeMismatched = userType !== 'Unknown' && userType !== suggestions.ai_animal_type;
        const isColorMissing = !userColor.trim();
        const isColorMismatched = userColor.trim() !== '' && userColor.trim().toLowerCase() !== (suggestions.ai_dominant_color || '').trim().toLowerCase();
        const isSizeMismatched = userSize !== suggestions.ai_estimated_size;

        // Force modal to show if there is a mismatch, missing info, or if the user entered a color.
        // This ensures the AI suggestions are always reviewable and they can choose to revert if needed.
        const shouldShow = isTypeMismatched || isColorMissing || isColorMismatched || isSizeMismatched || userColor.trim() !== '';

        if (shouldShow) {
            setAnimalTypeValidation({
                show: true,
                reportId,
                ai_animal_type: suggestions.ai_animal_type,
                ai_dominant_color: suggestions.ai_dominant_color,
                ai_estimated_size: suggestions.ai_estimated_size,
                ai_possible_breed: '',
                ai_suggested_priority: suggestions.ai_suggested_priority,
                ai_suggested_risk_level: suggestions.ai_suggested_risk_level || 'Medium Risk',
                user_animal_type: userType,
                user_dominant_color: userColor,
                user_estimated_size: userSize,
                user_possible_breed: ''
            });
            return true;
        }
        return false;
    };

    const handleApplyAISuggestion = async () => {
        if (!animalTypeValidation) return;
        try {
            const priorityMapped = animalTypeValidation.ai_suggested_priority ? (
                animalTypeValidation.ai_suggested_priority.includes('High') ? 'High' :
                    animalTypeValidation.ai_suggested_priority.includes('Low') ? 'Low' : 'Medium'
            ) : 'Medium';

            const patchPayload: any = {
                priority_level: priorityMapped
            };
            if (!revertAnimalType) {
                patchPayload.animal_type = animalTypeValidation.ai_animal_type;
            } else {
                patchPayload.animal_type = animalTypeValidation.user_animal_type;
            }
            if (!revertColors) {
                patchPayload.animal_color = animalTypeValidation.ai_dominant_color;
            } else {
                patchPayload.animal_color = animalTypeValidation.user_dominant_color;
            }
            if (!revertSize) {
                patchPayload.estimated_size = animalTypeValidation.ai_estimated_size;
            } else {
                patchPayload.estimated_size = animalTypeValidation.user_estimated_size;
            }

            await axios.patch(`http://localhost:8000/reports/${animalTypeValidation.reportId}`, patchPayload);

            alert('Report updated with suggestions successfully!');
        } catch (error) {
            console.error('Failed to apply suggestions:', error);
            alert('Failed to apply suggestions automatically, but your original report is saved.');
        } finally {
            // Standard cleanup
            setRevertAnimalType(false);
            setRevertColors(false);
            setRevertSize(false);
            setAnimalTypeValidation(null);
            handleCloseModal();
            setEditingReportId(null);
            fetchReports();
            setFormData(INITIAL_FORM_DATA);
        }
    };

    const handleKeepOriginalInput = () => {
        alert('Report submitted successfully!');
        setRevertAnimalType(false);
        setRevertColors(false);
        setRevertSize(false);
        setAnimalTypeValidation(null);
        handleCloseModal();
        setEditingReportId(null);
        fetchReports();
        setFormData(INITIAL_FORM_DATA);
    };

    const handleGoBackToReport = async () => {
        if (!animalTypeValidation) return;
        try {
            const isEdit = editingReportId !== null;
            if (!isEdit) {
                await axios.delete(`http://localhost:8000/reports/${animalTypeValidation.reportId}`);
            }
        } catch (error) {
            console.error('Failed to cancel temporary report:', error);
        } finally {
            setRevertAnimalType(false);
            setRevertColors(false);
            setRevertSize(false);
            setAnimalTypeValidation(null);
            setIsAddReportModalOpen(true);
        }
    };

    const handlePreSubmitValidation = async () => {
        // Geofence validation
        if (!isInsideSeleraHomes(formData.latitude, formData.longitude)) {
            alert('Location outside Selera Homes. Reports are only accepted within the subdivision boundary (e.g., inside the residential streets).');
            return;
        }

        // Filter out new mediaFiles that are images (excluding videos/docs for animal validation count)
        const imageExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tiff'];
        const newImages = formData.mediaFiles ? formData.mediaFiles.filter(file => {
            const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
            return file.type.startsWith('image/') || imageExtensions.includes(ext);
        }) : [];

        if (newImages.length > 0) {
            setIsCheckingAI(true);
            setValidationStatus('Analyzing images with AI...');

            try {
                const validationData = new FormData();
                for (const file of newImages) {
                    validationData.append('files', file);
                }

                const response = await axios.post('http://localhost:8000/reports/validate-images', validationData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });

                setIsCheckingAI(false);

                if (response.data && response.data.valid === false) {
                    const errType = response.data.error_type;
                    const msg = response.data.message;

                    if (errType === 'inconclusive') {
                        setInconclusiveText(msg);
                        setShowInconclusiveModal(true);
                    } else {
                        // Display error message and prevent submission
                        alert(msg);
                    }
                    return;
                }
            } catch (err: any) {
                setIsCheckingAI(false);
                console.error('AI Image validation failed:', err);
                // Fallback to inconclusive if validation endpoint fails/timeout
                setInconclusiveText("The system could not confidently determine whether the uploaded images belong to the same animal. Please review your uploaded images before submitting.");
                setShowInconclusiveModal(true);
                return;
            }
        }

        // If validation passed or no new images, show final warning confirmation modal
        setShowFinalConfirmModal(true);
    };

    const handleSubmit = async () => {
        if (isSubmitting) return;

        // Geofence validation
        if (!isInsideSeleraHomes(formData.latitude, formData.longitude)) {
            alert('Location outside Selera Homes. Reports are only accepted within the subdivision boundary (e.g., inside the residential streets).');
            return;
        }

        setIsSubmitting(true);
        try {
            // Get user_id from localStorage if available, otherwise default to 1
            const userStr = localStorage.getItem('resident_user');
            const userId = userStr ? JSON.parse(userStr).user_id : 1;

            const compiledColor = formData.secondaryColor !== 'None' 
                ? `${formData.primaryColor} and ${formData.secondaryColor}` 
                : formData.primaryColor;

            const extraDetails = [
                formData.coatPattern !== 'Unknown' ? `Pattern: ${formData.coatPattern}` : null,
                formData.distinctiveMarkings ? `Markings: ${formData.distinctiveMarkings}` : null,
                formData.observedConditions.length > 0 ? `Observed Conditions: ${formData.observedConditions.join(', ')}` : null,
                formData.description ? `Notes: ${formData.description}` : null
            ].filter(Boolean).join(' | ');

            const payload = {
                user_id: userId,
                subdivision_id: 1, // Hardcoded for demo/MVP
                category_id: formData.category_id || 1,
                animal_type: formData.animalType,
                animal_breed: formData.animalBreed || 'Unknown',
                animal_color: compiledColor,
                estimated_size: formData.estimatedSize,
                description: extraDetails || 'No additional details provided.',
                latitude: formData.latitude,
                longitude: formData.longitude,
                animal_count: formData.animalCount,
                landmark: formData.landmark || '',
                priority_level: formData.priorityLevel,
                visibility: formData.visibility,
                is_possible_owned: formData.isPossibleOwned,
                status_id: 1, // Pending Verification
                ai_animal_type: aiAnalysisResult?.animalType || formData.animalType,
                ai_dominant_color: aiAnalysisResult?.primaryColor || formData.primaryColor,
                ai_coat_pattern: aiAnalysisResult?.coatPattern || formData.coatPattern,
                ai_estimated_size: aiAnalysisResult?.estimatedSize || formData.estimatedSize,
                ai_possible_breed: aiAnalysisResult?.possibleBreed || formData.animalBreed || 'Unknown',
                ai_suggested_risk_level: 'Low Risk',
                ai_suggested_priority: formData.priorityLevel
            };

            const isEditing = editingReportId !== null;
            const url = isEditing
                ? `http://localhost:8000/reports/${editingReportId}`
                : `${API_URL}/`;

            const method = isEditing ? 'PATCH' : 'POST';

            const response = await axios({
                method: method.toLowerCase() as any,
                url: url,
                data: payload,
                headers: { 'Content-Type': 'application/json' }
            });

            if (response.status === 200 || response.status === 201) {
                const resultData = response.data;
                const actualReportId = isEditing ? editingReportId : resultData.report_id;

                // Handle media deletions if editing
                if (isEditing && formData.mediaIdsToDelete.length > 0) {
                    for (const mediaId of formData.mediaIdsToDelete) {
                        try {
                            await axios.delete(`http://localhost:8000/reports/media/${mediaId}`);
                        } catch (err) {
                            console.error(`Failed to delete media ${mediaId}:`, err);
                        }
                    }
                }

                let hasWarnings = false;

                // Upload media if present
                if (formData.mediaFiles && formData.mediaFiles.length > 0) {
                    let failCount = 0;
                    let firstSuggestions: any = null;
                    // Link media to the initial 'Reported' history entry
                    const initialHistoryId = resultData.history?.find((h: any) => h.report_status_id === 1)?.history_id;

                    for (const file of formData.mediaFiles) {
                        const mediaData = new FormData();
                        mediaData.append("file", file);
                        if (initialHistoryId) {
                            mediaData.append("history_id", initialHistoryId.toString());
                        }
                        mediaData.append("status_id", "1"); // Status 1 = Reported
                        mediaData.append("is_evidence", "false"); // Initial photos are not evidence

                        try {
                            const uploadResponse = await axios.post(`${API_URL}/${actualReportId}/media`, mediaData, {
                                headers: { 'Content-Type': 'multipart/form-data' }
                            });

                            // Capture AI suggestion metadata from the first successfully processed image
                            if (uploadResponse.data && uploadResponse.data.ai_animal_type && !firstSuggestions) {
                                firstSuggestions = {
                                    ai_animal_type: uploadResponse.data.ai_animal_type,
                                    ai_dominant_color: uploadResponse.data.ai_dominant_color,
                                    ai_estimated_size: uploadResponse.data.ai_estimated_size,
                                    ai_possible_breed: uploadResponse.data.ai_possible_breed,
                                    ai_suggested_priority: uploadResponse.data.ai_suggested_priority,
                                    ai_suggested_risk_level: uploadResponse.data.ai_suggested_risk_level
                                };
                            }
                        } catch (err: any) {
                            const errorMsg = err.response?.data?.detail || err.message;
                            console.error('Failed to upload media:', errorMsg);
                            failCount++;
                        }
                    }

                    if (firstSuggestions) {
                        hasWarnings = validateAISuggestions(actualReportId, firstSuggestions);
                    }

                    if (failCount > 0) {
                        alert(`${failCount} media files failed to upload. The report was saved otherwise.`);
                    }
                }

                if (!hasWarnings) {
                    alert(isEditing ? 'Report updated successfully!' : 'Report submitted successfully!');
                    handleCloseModal();
                    setEditingReportId(null);
                    fetchReports(); // Refresh the feed
                    setFormData(INITIAL_FORM_DATA);
                }
            }
        } catch (error) {
            console.error('Error saving report:', error);
            alert('Failed to submit report. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const allMediaCount = (formData.existingMedia?.length || 0) + (formData.mediaFiles?.length || 0);

    const filteredReports = reports.filter((r) => {
        const q = searchQuery.toLowerCase();
        const categoryMap: Record<number, string> = {
            1: 'Injured Animal', 2: 'Aggressive Stray', 3: 'Possible Rabies Risk',
            4: 'Roaming Pack', 5: 'Animal Rescue Needed', 6: 'Lost Pet'
        };
        const categoryName = categoryMap[r.category_id] || '';
        return (r.description && r.description.toLowerCase().includes(q)) ||
            (r.landmark && r.landmark.toLowerCase().includes(q)) ||
            (r.animal_type && r.animal_type.toLowerCase().includes(q)) ||
            (categoryName.toLowerCase().includes(q));
    });

    const filteredAnnouncements = announcements.filter((ann) => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
            (ann.title || '').toLowerCase().includes(q) ||
            (ann.content || '').toLowerCase().includes(q) ||
            (ann.category || '').toLowerCase().includes(q) ||
            (ann.location || '').toLowerCase().includes(q)
        );
    });

    // Show all reports in the feed; the endorsement letter photo is hidden via is_evidence=true
    const currentTabReports = filteredReports;

    const activeNotifications = notifications.filter(
        (n) => !n.is_archived && !dismissedNotificationIds.has(n.notification_id)
    );

    return (
        <div className="min-h-screen bg-[#F7F7F7] dark:bg-[#121212] font-sans pb-24 text-[#1a1208] dark:text-gray-100 transition-colors duration-200">
            <ResiNavbar
                onMenuToggle={(isOpen) => setIsNavbarMenuOpen(isOpen)}
                onSearch={setSearchQuery}
                searchValue={searchQuery}
                isMobileSearchOpen={isMobileSearchOpen}
                onCloseSearch={() => setIsMobileSearchOpen(false)}
                feedTab={feedTab}
                onFeedTabChange={setFeedTab}
                notifications={activeNotifications}
                onMarkNotificationRead={handleMarkNotificationRead}
                onDeleteNotification={handleDismissNotification}
                onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
                onNotificationClick={handleNotificationClick}
            />

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 sm:pt-32 pb-24 md:pb-8">

                {/* Top Actions - Hidden on mobile, shown on desktop */}
                <div className="hidden md:flex justify-end relative mb-6">
                    {/* Add Report Button (Only visible on reports feed, right aligned) */}
                    {feedTab === 'reports' && (
                        <Button
                            variant="primary"
                            onClick={() => navigate('/resident/report/new')}
                            className="bg-[#F97316] text-white px-8 py-3.5 rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg shadow-orange-200 hover:scale-105 transition-all flex items-center gap-3 border border-orange-500/20 cursor-pointer"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                            </svg>
                            Add Report
                        </Button>
                    )}
                </div>

                {/* Add Report Modal (10-Step Wizard) */}
                {isAddReportModalOpen && (
                    <div className="fixed top-20 bottom-20 left-0 right-0 md:inset-0 z-[300] flex items-stretch md:items-center justify-center p-0 md:p-4 pb-0 md:pb-4">
                        {/* Backdrop */}
                        <div
                            className="hidden md:block absolute inset-0 bg-[#1a1208]/60 backdrop-blur-md animate-in fade-in duration-300"
                            onClick={handleCloseModal}
                        />

                        {/* Modal Content */}
                        <div className="relative w-full h-full md:h-auto md:max-w-2xl bg-white rounded-none md:rounded-[3rem] shadow-none md:shadow-2xl overflow-hidden flex flex-col animate-in md:zoom-in-95 md:slide-in-from-bottom-10 duration-500">
                            {/* Modal Header */}
                            <div className="px-6 md:px-10 pt-6 md:pt-8 pb-4 flex justify-between items-center border-b border-gray-50 bg-white z-10">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="px-2.5 py-0.5 rounded-full bg-orange-100 text-[#F97316] font-black text-[10px] uppercase tracking-wider">
                                            Step {reportStep} of 10
                                        </span>
                                        {reportStep === 1 && <span className="text-[10px] font-black text-red-500">⭐ Required</span>}
                                        {reportStep === 2 && <span className="text-[10px] font-black text-red-500">⭐ Required</span>}
                                        {reportStep === 5 && <span className="text-[10px] font-black text-red-500">⭐ Required</span>}
                                        {reportStep === 6 && <span className="text-[10px] font-black text-red-500">⭐ Required</span>}
                                    </div>
                                    <h2 className="text-xl md:text-2xl font-black text-[#1a1208] uppercase tracking-tight mt-1">
                                        {reportStep === 1 && "📝 Step 1: Upload Media"}
                                        {reportStep === 2 && "🏷️ Step 2: Report Category"}
                                        {reportStep === 3 && "🤖 Step 3: AI Animal Analysis"}
                                        {reportStep === 4 && "🐾 Step 4: Animal Details"}
                                        {reportStep === 5 && "⚠️ Step 5: Observed Condition"}
                                        {reportStep === 6 && "📍 Step 6: Location & Pin"}
                                        {reportStep === 7 && "ℹ️ Step 7: Additional Information"}
                                        {reportStep === 8 && "👁️ Step 8: Report Visibility"}
                                        {reportStep === 9 && "📋 Step 9: Review Report"}
                                        {reportStep === 10 && "🚀 Step 10: Submit Report"}
                                    </h2>
                                </div>
                                <button
                                    onClick={handleCloseModal}
                                    className="p-3 bg-gray-50 text-gray-400 hover:text-[#1a1208] rounded-2xl transition-all"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            {/* Wizard Progress Bar */}
                            <div className="w-full bg-gray-100 h-1.5">
                                <div
                                    className="bg-[#F97316] h-full transition-all duration-300 ease-out"
                                    style={{ width: `${(reportStep / 10) * 100}%` }}
                                />
                            </div>

                            {/* Wizard Body Steps */}
                            <div className="p-6 md:p-10 space-y-6 flex-1 md:max-h-[65vh] overflow-y-auto custom-scrollbar">

                                {/* STEP 1: Upload Media */}
                                {reportStep === 1 && (
                                    <div className="space-y-6 animate-in fade-in duration-300">
                                        <p className="text-xs font-bold text-gray-500 leading-relaxed">
                                            Upload at least one clear photo of the animal. Videos are optional.
                                        </p>

                                        <div className="grid grid-cols-2 gap-4">
                                            <button
                                                type="button"
                                                onClick={() => document.getElementById('wizard-photo-upload')?.click()}
                                                className="py-5 px-4 bg-orange-50/50 border-2 border-dashed border-orange-200 hover:border-orange-400 rounded-3xl flex flex-col items-center justify-center gap-2 transition-all group"
                                            >
                                                <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center text-[#F97316] group-hover:scale-110 transition-transform">
                                                    📷
                                                </div>
                                                <span className="text-xs font-black text-[#1a1208] uppercase tracking-wider">Take / Upload Photos</span>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => document.getElementById('wizard-video-upload')?.click()}
                                                className="py-5 px-4 bg-gray-50 border-2 border-dashed border-gray-200 hover:border-gray-300 rounded-3xl flex flex-col items-center justify-center gap-2 transition-all group"
                                            >
                                                <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center text-gray-500 group-hover:scale-110 transition-transform">
                                                    🎥
                                                </div>
                                                <span className="text-xs font-black text-gray-700 uppercase tracking-wider">Upload Video (Optional)</span>
                                            </button>
                                        </div>

                                        <input
                                            id="wizard-photo-upload"
                                            type="file"
                                            accept="image/*"
                                            multiple
                                            className="hidden"
                                            onChange={(e) => {
                                                const files = Array.from(e.target.files || []);
                                                setFormData(prev => ({ ...prev, mediaFiles: [...prev.mediaFiles, ...files] }));
                                            }}
                                        />
                                        <input
                                            id="wizard-video-upload"
                                            type="file"
                                            accept="video/*"
                                            className="hidden"
                                            onChange={(e) => {
                                                const files = Array.from(e.target.files || []);
                                                setFormData(prev => ({ ...prev, mediaFiles: [...prev.mediaFiles, ...files] }));
                                            }}
                                        />

                                        {/* Media Preview Grid */}
                                        {allMediaCount > 0 && (
                                            <div className="space-y-2 pt-2">
                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Selected Files ({allMediaCount})</p>
                                                <div className="grid grid-cols-3 gap-3">
                                                    {formData.existingMedia.map((media) => (
                                                        <div key={media.media_id} className="relative aspect-square rounded-2xl overflow-hidden border border-gray-200">
                                                            <img src={media.file_url} className="w-full h-full object-cover" />
                                                            <span className="absolute top-1 left-1 bg-black/60 text-white text-[8px] px-1.5 py-0.5 rounded font-bold">Existing</span>
                                                        </div>
                                                    ))}
                                                    {formData.mediaFiles.map((file, idx) => (
                                                        <div key={idx} className="relative aspect-square rounded-2xl overflow-hidden border-2 border-orange-300">
                                                            {file.type.startsWith('video/') ? (
                                                                <video src={URL.createObjectURL(file)} className="w-full h-full object-cover" />
                                                            ) : (
                                                                <img src={URL.createObjectURL(file)} className="w-full h-full object-cover" />
                                                            )}
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    const updated = [...formData.mediaFiles];
                                                                    updated.splice(idx, 1);
                                                                    setFormData(prev => ({ ...prev, mediaFiles: updated }));
                                                                }}
                                                                className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold"
                                                            >
                                                                ✕
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* STEP 2: Report Category */}
                                {reportStep === 2 && (
                                    <div className="space-y-4 animate-in fade-in duration-300">
                                        <p className="text-xs font-bold text-gray-500">Why are you reporting this animal?</p>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {[
                                                'Injured Animal',
                                                'Sick Animal',
                                                'Aggressive Animal',
                                                'Possible Rabies Risk',
                                                'Roaming Animal',
                                                'Animal Needs Rescue',
                                                'Dead Animal',
                                                'Other'
                                            ].map((catName, idx) => (
                                                <label
                                                    key={catName}
                                                    className={`p-4 rounded-2xl border-2 cursor-pointer flex items-center gap-3 transition-all ${formData.category === catName
                                                            ? 'border-[#F97316] bg-orange-50/50 shadow-sm'
                                                            : 'border-gray-100 bg-[#FAFAF9] hover:border-gray-200'
                                                        }`}
                                                >
                                                    <input
                                                        type="radio"
                                                        name="reportCategory"
                                                        value={catName}
                                                        checked={formData.category === catName}
                                                        onChange={() => setFormData(prev => ({ ...prev, category: catName, category_id: idx + 1 }))}
                                                        className="accent-[#F97316] w-4 h-4"
                                                    />
                                                    <span className="text-xs font-black text-[#1a1208]">{catName}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* STEP 3: AI Animal Analysis */}
                                {reportStep === 3 && (
                                    <div className="space-y-6 animate-in fade-in duration-300">
                                        {isAnalyzingMedia ? (
                                            <div className="p-8 bg-orange-50/60 border border-orange-200 rounded-3xl flex flex-col items-center justify-center text-center space-y-3">
                                                <div className="w-8 h-8 border-3 border-[#F97316] border-t-transparent rounded-full animate-spin" />
                                                <div>
                                                    <h4 className="text-xs font-black uppercase tracking-wider text-[#1a1208]">Analyzing Media...</h4>
                                                    <p className="text-[10px] font-bold text-gray-500 mt-1">Our AI is extracting animal characteristics from your uploaded photo</p>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="p-5 bg-orange-50/60 border border-orange-200 rounded-3xl space-y-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-2xl bg-[#F97316] text-white flex items-center justify-center font-black text-lg shadow-md">
                                                        🤖
                                                    </div>
                                                    <div>
                                                        <h4 className="text-xs font-black uppercase tracking-wider text-[#1a1208]">AI Analysis Suggestions</h4>
                                                        <p className="text-[10px] font-bold text-gray-500">Automatically extracted from uploaded media</p>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-2 gap-3 text-xs font-bold text-[#1a1208] pt-2">
                                                    <div className="p-3 bg-white rounded-2xl border border-gray-100">
                                                        <span className="text-[9px] font-black text-gray-400 block uppercase">Animal Type</span>
                                                        <span className="text-[#F97316] font-black">{formData.animalType}</span>
                                                    </div>
                                                    <div className="p-3 bg-white rounded-2xl border border-gray-100">
                                                        <span className="text-[9px] font-black text-gray-400 block uppercase">Animal Count</span>
                                                        <span className="text-[#F97316] font-black">{formData.animalCount}</span>
                                                    </div>
                                                    <div className="p-3 bg-white rounded-2xl border border-gray-100">
                                                        <span className="text-[9px] font-black text-gray-400 block uppercase">Primary Color</span>
                                                        <span className="text-[#F97316] font-black">{formData.primaryColor}</span>
                                                    </div>
                                                    <div className="p-3 bg-white rounded-2xl border border-gray-100">
                                                        <span className="text-[9px] font-black text-gray-400 block uppercase">Secondary Color</span>
                                                        <span className="text-[#F97316] font-black">{formData.secondaryColor}</span>
                                                    </div>
                                                    <div className="p-3 bg-white rounded-2xl border border-gray-100">
                                                        <span className="text-[9px] font-black text-gray-400 block uppercase">Coat Pattern</span>
                                                        <span className="text-[#F97316] font-black">{formData.coatPattern}</span>
                                                    </div>
                                                    <div className="p-3 bg-white rounded-2xl border border-gray-100">
                                                        <span className="text-[9px] font-black text-gray-400 block uppercase">Estimated Size</span>
                                                        <span className="text-[#F97316] font-black">{formData.estimatedSize}</span>
                                                    </div>
                                                    <div className="p-3 bg-white rounded-2xl border border-gray-100">
                                                        <span className="text-[9px] font-black text-gray-400 block uppercase">Possible Breed</span>
                                                        <span className="text-[#F97316] font-black">{formData.animalBreed || 'Mixed Breed (61%)'}</span>
                                                    </div>
                                                    <div className="p-3 bg-white rounded-2xl border border-gray-100">
                                                        <span className="text-[9px] font-black text-gray-400 block uppercase">Collar / Tag</span>
                                                        <span className="text-gray-700 font-black">
                                                            {aiAnalysisResult ? (aiAnalysisResult.collarDetected || aiAnalysisResult.qrTagDetected ? 'Detected' : 'None') : 'Detected'}
                                                        </span>
                                                    </div>
                                                </div>

                                                <p className="text-[10px] font-bold text-gray-500 italic text-center">
                                                    Citizens can review and edit all suggestions in the next step.
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* STEP 4: Animal Details */}
                                {reportStep === 4 && (
                                    <div className="space-y-6 animate-in fade-in duration-300">
                                        {/* Animal Type */}
                                        <div>
                                            <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest mb-3 block">Animal Type</label>
                                            <div className="flex gap-4">
                                                {['Dog', 'Cat', 'Unknown'].map((t) => (
                                                    <label key={t} className={`flex-1 p-3.5 rounded-2xl border-2 text-center cursor-pointer font-black text-xs transition-all ${formData.animalType === t ? 'border-[#F97316] bg-orange-50/40 text-[#F97316]' : 'border-gray-100 bg-[#FAFAF9] text-gray-700'}`}>
                                                        <input type="radio" name="animalTypeRadio" value={t} checked={formData.animalType === t} onChange={() => setFormData(prev => ({ ...prev, animalType: t }))} className="hidden" />
                                                        {t}
                                                    </label>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Animal Count */}
                                        <div>
                                            <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest mb-2 block">Animal Count</label>
                                            <input
                                                type="number"
                                                min={1}
                                                className="w-full h-12 bg-[#FAFAF9] border border-gray-100 rounded-2xl px-5 text-xs font-bold text-[#1a1208]"
                                                value={formData.animalCount}
                                                onChange={(e) => setFormData(prev => ({ ...prev, animalCount: parseInt(e.target.value) || 1 }))}
                                            />
                                        </div>

                                        {/* Estimated Size */}
                                        <div>
                                            <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest mb-3 block">Estimated Size</label>
                                            <div className="grid grid-cols-4 gap-2">
                                                {['Small', 'Medium', 'Large', 'Unknown'].map((sz) => (
                                                    <label key={sz} className={`p-3 rounded-2xl border-2 text-center cursor-pointer font-black text-xs transition-all ${formData.estimatedSize === sz ? 'border-[#F97316] bg-orange-50/40 text-[#F97316]' : 'border-gray-100 bg-[#FAFAF9] text-gray-700'}`}>
                                                        <input type="radio" name="sizeRadio" value={sz} checked={formData.estimatedSize === sz} onChange={() => setFormData(prev => ({ ...prev, estimatedSize: sz }))} className="hidden" />
                                                        {sz}
                                                    </label>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Primary & Secondary Color */}
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest mb-2 block">Primary Color</label>
                                                <select
                                                    className="w-full h-12 bg-[#FAFAF9] border border-gray-100 rounded-2xl px-4 text-xs font-bold text-[#1a1208]"
                                                    value={formData.primaryColor}
                                                    onChange={(e) => setFormData(prev => ({ ...prev, primaryColor: e.target.value }))}
                                                >
                                                    {['Black', 'Brown', 'White', 'Gray', 'Tan', 'Golden', 'Cream', 'Orange', 'Mixed'].map(c => (
                                                        <option key={c} value={c}>{c}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest mb-2 block">Secondary Color</label>
                                                <select
                                                    className="w-full h-12 bg-[#FAFAF9] border border-gray-100 rounded-2xl px-4 text-xs font-bold text-[#1a1208]"
                                                    value={formData.secondaryColor}
                                                    onChange={(e) => setFormData(prev => ({ ...prev, secondaryColor: e.target.value }))}
                                                >
                                                    {['None', 'Black', 'Brown', 'White', 'Gray', 'Tan', 'Golden', 'Cream', 'Orange'].map(c => (
                                                        <option key={c} value={c}>{c}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>

                                        {/* Coat Pattern & Breed */}
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest mb-2 block">Coat Pattern</label>
                                                <select
                                                    className="w-full h-12 bg-[#FAFAF9] border border-gray-100 rounded-2xl px-4 text-xs font-bold text-[#1a1208]"
                                                    value={formData.coatPattern}
                                                    onChange={(e) => setFormData(prev => ({ ...prev, coatPattern: e.target.value }))}
                                                >
                                                    {VALID_COAT_PATTERNS.map(p => (
                                                        <option key={p} value={p}>{p}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest mb-2 block">Possible Breed (Optional)</label>
                                                <input
                                                    type="text"
                                                    className="w-full h-12 bg-[#FAFAF9] border border-gray-100 rounded-2xl px-4 text-xs font-bold text-[#1a1208]"
                                                    placeholder="Default: Unknown"
                                                    value={formData.animalBreed}
                                                    onChange={(e) => setFormData(prev => ({ ...prev, animalBreed: e.target.value }))}
                                                />
                                                {(() => {
                                                    const query = formData.animalBreed.trim().toLowerCase();
                                                    if (!query) return null;
                                                    const matchedBreed = breedsData.find((b) => {
                                                        const breedName = b.name.toLowerCase();
                                                        if (breedName === query) return true;
                                                        if (query.length >= 3) {
                                                            return breedName.includes(query) || query.includes(breedName);
                                                        }
                                                        return false;
                                                    });

                                                    if (matchedBreed && (breedImageUrl || isFetchingBreedImage)) {
                                                        return (
                                                            <div className="mt-3 flex items-center gap-3.5 bg-orange-50/40 border border-orange-100 rounded-2xl p-3.5 animate-in slide-in-from-top-2 duration-300">
                                                                {isFetchingBreedImage ? (
                                                                    <div className="w-12 h-12 rounded-xl border border-white bg-white/50 flex items-center justify-center shrink-0 shadow-sm">
                                                                        <div className="w-4 h-4 border-2 border-[#F97316] border-t-transparent rounded-full animate-spin" />
                                                                    </div>
                                                                ) : breedImageUrl ? (
                                                                    <img 
                                                                        src={breedImageUrl} 
                                                                        alt="Breed Preview" 
                                                                        className="w-12 h-12 object-cover rounded-xl shadow-sm border border-white shrink-0"
                                                                    />
                                                                ) : null}
                                                                <div>
                                                                    <p className="text-[9px] font-black text-[#F97316] uppercase tracking-widest leading-none">StraySafe Reference Photo</p>
                                                                    <p className="text-[11px] font-black text-[#1a1208] mt-1">{matchedBreed.name} Standard Profile</p>
                                                                </div>
                                                            </div>
                                                        );
                                                    }
                                                    return null;
                                                })()}
                                            </div>
                                        </div>

                                        {/* Distinctive Markings */}
                                        <div>
                                            <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest mb-2 block">Distinctive Markings (Optional)</label>
                                            <input
                                                type="text"
                                                className="w-full h-12 bg-[#FAFAF9] border border-gray-100 rounded-2xl px-4 text-xs font-bold text-[#1a1208]"
                                                placeholder="e.g. White stripe on forehead, Black left ear, Blue collar"
                                                value={formData.distinctiveMarkings}
                                                onChange={(e) => setFormData(prev => ({ ...prev, distinctiveMarkings: e.target.value }))}
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* STEP 5: Observed Condition */}
                                {reportStep === 5 && (
                                    <div className="space-y-4 animate-in fade-in duration-300">
                                        <p className="text-xs font-bold text-gray-500">Select all that apply ⭐</p>
                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                            {[
                                                'Injured', 'Bleeding', 'Limping', 'Weak',
                                                'Sick', 'Aggressive', 'Chasing People', 'Unable to Walk',
                                                'Crying', 'Pregnant', 'With Puppies/Kittens', 'Wearing Collar',
                                                'Wearing QR Tag', 'Dead', 'Trapped', 'Other'
                                            ].map((cond) => {
                                                const isChecked = formData.observedConditions.includes(cond);
                                                return (
                                                    <label
                                                        key={cond}
                                                        className={`p-3.5 rounded-2xl border-2 cursor-pointer flex items-center gap-3 transition-all ${isChecked ? 'border-[#F97316] bg-orange-50/50 shadow-sm' : 'border-gray-100 bg-[#FAFAF9]'}`}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={isChecked}
                                                            onChange={() => {
                                                                const updated = isChecked
                                                                    ? formData.observedConditions.filter(c => c !== cond)
                                                                    : [...formData.observedConditions, cond];
                                                                setFormData(prev => ({ ...prev, observedConditions: updated }));
                                                            }}
                                                            className="accent-[#F97316] w-4 h-4"
                                                        />
                                                        <span className="text-xs font-black text-[#1a1208]">{cond}</span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* STEP 6: Location */}
                                {reportStep === 6 && (
                                    <div className="space-y-6 animate-in fade-in duration-300">
                                        <div className="p-4 bg-orange-50/60 border border-orange-100 rounded-3xl flex items-center justify-between">
                                            <div>
                                                <span className="text-[9px] font-black text-gray-400 block uppercase">GPS Location</span>
                                                <span className="text-xs font-black text-[#F97316]">
                                                    {formData.latitude.toFixed(6)}, {formData.longitude.toFixed(6)}
                                                </span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setTempLandmark(formData.landmark);
                                                    setIsMapPickerOpen(true);
                                                }}
                                                className="px-4 py-2 bg-[#F97316] text-white rounded-2xl text-xs font-black uppercase tracking-wider"
                                            >
                                                📍 Map Pin
                                            </button>
                                        </div>

                                        <div>
                                            <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest mb-2 block">Street Address</label>
                                            <input
                                                type="text"
                                                className="w-full h-12 bg-white border border-gray-200 rounded-2xl px-4 text-xs font-bold text-[#1a1208]"
                                                value={isGeocoding ? 'Resolving street address...' : (resolvedAddress || 'Auto-filling street address...')}
                                                readOnly
                                            />
                                        </div>

                                        <div>
                                            <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest mb-2 block">Landmark</label>
                                            <input
                                                type="text"
                                                className="w-full h-12 bg-[#FAFAF9] border border-gray-100 rounded-2xl px-4 text-xs font-bold text-[#1a1208]"
                                                placeholder="e.g. Near Barangay Hall, Basketball Court"
                                                value={formData.landmark}
                                                onChange={(e) => setFormData(prev => ({ ...prev, landmark: e.target.value }))}
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* STEP 7: Additional Information */}
                                {reportStep === 7 && (
                                    <div className="space-y-4 animate-in fade-in duration-300">
                                        <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest block">Description (Optional)</label>
                                        <textarea
                                            placeholder="Tell us anything else that may help rescuers..."
                                            rows={5}
                                            className="w-full bg-[#FAFAF9] border border-gray-100 rounded-3xl p-5 text-xs font-medium text-[#1a1208] focus:outline-none focus:border-orange-300 shadow-sm"
                                            value={formData.description}
                                            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                                        />
                                    </div>
                                )}

                                {/* STEP 8: Report Visibility */}
                                {reportStep === 8 && (
                                    <div className="space-y-4 animate-in fade-in duration-300">
                                        <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest block">Choose Visibility</label>
                                        <div className="space-y-3">
                                            {['Public', 'Private'].map((v) => (
                                                <label key={v} className={`p-4 rounded-3xl border-2 flex items-center justify-between cursor-pointer transition-all ${formData.visibility === v ? 'border-[#F97316] bg-orange-50/50 shadow-sm' : 'border-gray-100 bg-[#FAFAF9]'}`}>
                                                    <div>
                                                        <span className="text-xs font-black text-[#1a1208] block">{v}</span>
                                                        <span className="text-[10px] font-semibold text-gray-400">
                                                            {v === 'Public' ? 'Visible to all community members in subdivision feed' : 'Only visible to subdivision leaders and barangay staff'}
                                                        </span>
                                                    </div>
                                                    <input type="radio" name="visibilityRadio" value={v} checked={formData.visibility === v} onChange={() => setFormData(prev => ({ ...prev, visibility: v }))} className="accent-[#F97316] w-4 h-4" />
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* STEP 9: Review Report */}
                                {reportStep === 9 && (
                                    <div className="space-y-4 animate-in fade-in duration-300">
                                        <p className="text-xs font-bold text-gray-500">Review all details before submitting:</p>
                                        <div className="p-6 bg-[#FAFAF9] border border-gray-100 rounded-3xl space-y-3 text-xs font-bold text-[#1a1208]">
                                            <div className="flex justify-between py-1 border-b border-gray-100"><span className="text-gray-400">Animal Type:</span> <span>{formData.animalType}</span></div>
                                            <div className="flex justify-between py-1 border-b border-gray-100"><span className="text-gray-400">Category:</span> <span>{formData.category || 'Injured Animal'}</span></div>
                                            <div className="flex justify-between py-1 border-b border-gray-100"><span className="text-gray-400">Location:</span> <span>{formData.landmark || resolvedAddress || 'Selera Homes'}</span></div>
                                            <div className="flex justify-between py-1 border-b border-gray-100"><span className="text-gray-400">Observed Conditions:</span> <span>{formData.observedConditions.join(', ') || 'None specified'}</span></div>
                                            <div className="flex justify-between py-1"><span className="text-gray-400">AI Confidence:</span> <span className="text-[#F97316] font-black">98%</span></div>
                                        </div>
                                    </div>
                                )}

                                {/* STEP 10: Submit Report */}
                                {reportStep === 10 && (
                                    <div className="space-y-6 text-center animate-in fade-in duration-300 py-4">
                                        <div className="w-16 h-16 bg-orange-100 text-[#F97316] rounded-3xl flex items-center justify-center text-2xl mx-auto shadow-md">
                                            🚀
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-black uppercase tracking-tight text-[#1a1208]">Ready to Submit</h3>
                                            <p className="text-xs font-bold text-gray-400 mt-1 max-w-xs mx-auto">
                                                Your report will be sent to the Subdivision Leader for immediate verification.
                                            </p>
                                        </div>
                                    </div>
                                )}

                            </div>

                            {/* Wizard Footer Navigation */}
                            <div className="p-6 md:p-8 border-t border-gray-50 bg-white flex items-center justify-between z-10 shrink-0">
                                {reportStep > 1 ? (
                                    <button
                                        type="button"
                                        onClick={() => setReportStep(prev => prev - 1)}
                                        className="px-6 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-black text-xs uppercase tracking-wider rounded-2xl transition-all"
                                    >
                                        ← Back
                                    </button>
                                ) : <div />}

                                {reportStep < 10 ? (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (reportStep === 1 && allMediaCount === 0) {
                                                alert('Please upload at least one clear photo of the animal.');
                                                return;
                                            }
                                            if (reportStep === 2 && !formData.category) {
                                                alert('Please select a report category.');
                                                return;
                                            }
                                            if (reportStep === 2) {
                                                triggerMediaAnalysis();
                                            }
                                            if (reportStep === 5 && formData.observedConditions.length === 0) {
                                                alert('Please select at least one observed condition.');
                                                return;
                                            }
                                            setReportStep(prev => prev + 1);
                                        }}
                                        className="px-8 py-3.5 bg-[#F97316] hover:bg-orange-600 text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-lg shadow-orange-100 transition-all hover:scale-105"
                                    >
                                        Next →
                                    </button>
                                ) : (
                                    <Button
                                        disabled={isSubmitting}
                                        className={`px-8 py-4 text-white text-xs font-black uppercase tracking-widest rounded-2xl shadow-xl transition-all ${isSubmitting ? 'bg-gray-400' : 'bg-[#F97316] hover:scale-105'}`}
                                        onClick={handlePreSubmitValidation}
                                    >
                                        {isSubmitting ? 'Submitting...' : 'Submit Report'}
                                    </Button>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* AI Animal Type Validation Warning Modal */}
                {animalTypeValidation?.show && (
                    <div className="fixed inset-0 z-[350] flex items-center justify-center p-4">
                        {/* Backdrop */}
                        <div
                            className="absolute inset-0 bg-[#1a1208]/60 backdrop-blur-md animate-in fade-in duration-300"
                            onClick={handleGoBackToReport}
                        />

                        {/* Modal Content */}
                        <div className="relative w-full max-w-md bg-white rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-10 duration-500 p-10 text-[#1a1208] border border-gray-50">
                            {/* Header */}
                            <div className="mb-8">
                                <div className="w-16 h-16 bg-orange-50 text-[#F97316] rounded-2xl flex items-center justify-center mb-6 mx-auto border border-orange-100">
                                    <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                </div>
                                <h3 className="text-2xl font-black text-center mb-2 uppercase tracking-tight text-[#1a1208]">
                                    AI Suggestions
                                </h3>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center max-w-[280px] mx-auto leading-relaxed">
                                    Review the AI animal detection suggestions below
                                </p>
                            </div>

                            {/* Content */}
                            <div className="bg-[#FAFAF9] border border-gray-100 rounded-3xl p-6 space-y-4 mb-8">
                                <div className="space-y-3 font-semibold text-[#1a1208]">
                                    <div className="flex items-center justify-between py-1.5 border-b border-gray-100/50">
                                        <div className="flex items-center gap-3">
                                            <span className="text-[#F97316] font-black text-sm">✓</span>
                                            <span className="text-xs">
                                                Animal Type: <strong className="uppercase font-black text-[#F97316] ml-1">{revertAnimalType ? animalTypeValidation.user_animal_type : animalTypeValidation.ai_animal_type}</strong>
                                                {revertAnimalType && <span className="ml-2 text-[9px] text-gray-400 font-bold italic">(reverted)</span>}
                                            </span>
                                        </div>
                                        <button
                                            onClick={() => setRevertAnimalType(!revertAnimalType)}
                                            className="text-[9px] font-black uppercase tracking-widest px-2.5 py-1 bg-white border border-gray-200 rounded-lg hover:bg-orange-50 hover:text-[#F97316] hover:border-orange-200 transition-colors"
                                        >
                                            {revertAnimalType ? 'Apply AI' : 'revert'}
                                        </button>
                                    </div>
                                    <div className="flex items-center justify-between py-1.5 border-b border-gray-100/50">
                                        <div className="flex items-center gap-3">
                                            <span className="text-[#F97316] font-black text-sm">✓</span>
                                            <span className="text-xs flex items-center gap-2">
                                                Colors Detected:
                                                {!revertColors && <span className="inline-block w-3.5 h-3.5 rounded-full border border-gray-200 shadow-sm shrink-0" style={{ background: getSwatchStyle(animalTypeValidation.ai_dominant_color) }} />}
                                                <strong className="uppercase font-black text-[#F97316]">{revertColors ? animalTypeValidation.user_dominant_color : animalTypeValidation.ai_dominant_color}</strong>
                                                {revertColors && <span className="ml-1 text-[9px] text-gray-400 font-bold italic">(reverted)</span>}
                                            </span>
                                        </div>
                                        <button
                                            onClick={() => setRevertColors(!revertColors)}
                                            className="text-[9px] font-black uppercase tracking-widest px-2.5 py-1 bg-white border border-gray-200 rounded-lg hover:bg-orange-50 hover:text-[#F97316] hover:border-orange-200 transition-colors"
                                        >
                                            {revertColors ? 'Apply AI' : 'revert'}
                                        </button>
                                    </div>
                                    <div className="flex items-center justify-between py-1.5 border-b border-gray-100/50">
                                        <div className="flex items-center gap-3">
                                            <span className="text-[#F97316] font-black text-sm">✓</span>
                                            <span className="text-xs">
                                                Size: <strong className="uppercase font-black text-[#F97316] ml-1">{revertSize ? animalTypeValidation.user_estimated_size : animalTypeValidation.ai_estimated_size}</strong>
                                                {revertSize && <span className="ml-2 text-[9px] text-gray-400 font-bold italic">(reverted)</span>}
                                            </span>
                                        </div>
                                        <button
                                            onClick={() => setRevertSize(!revertSize)}
                                            className="text-[9px] font-black uppercase tracking-widest px-2.5 py-1 bg-white border border-gray-200 rounded-lg hover:bg-orange-50 hover:text-[#F97316] hover:border-orange-200 transition-colors"
                                        >
                                            {revertSize ? 'Apply AI' : 'revert'}
                                        </button>
                                    </div>
                                    <div className="flex items-center gap-3 py-1.5 border-b border-gray-100/50">
                                        <span className="text-gray-400 font-black text-sm">•</span>
                                        <span className="text-xs text-gray-600">
                                            Risk Level: <strong className="uppercase font-black text-red-500 ml-1">{animalTypeValidation.ai_suggested_risk_level}</strong>
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-3 py-1.5">
                                        <span className="text-gray-400 font-black text-sm">•</span>
                                        <span className="text-xs text-gray-600">
                                            Priority: <strong className="uppercase font-black text-red-500 ml-1">{animalTypeValidation.ai_suggested_priority}</strong>
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="space-y-3">
                                <button
                                    onClick={handleApplyAISuggestion}
                                    className="w-full py-5 bg-[#F97316] hover:bg-orange-600 text-white text-[11px] font-black uppercase tracking-[0.15em] rounded-2xl shadow-lg shadow-orange-100 transition-all hover:scale-[1.02] active:scale-[0.98]"
                                >
                                    Apply AI Suggestion
                                </button>
                                <button
                                    onClick={handleKeepOriginalInput}
                                    className="w-full py-4 text-[10px] font-black text-gray-400 hover:text-gray-600 uppercase tracking-widest transition-all"
                                >
                                    Keep Original Input
                                </button>
                                <button
                                    onClick={handleGoBackToReport}
                                    className="w-full py-3 text-[10px] font-black text-red-500 hover:text-red-700 uppercase tracking-widest transition-all block text-center border-t border-gray-100/50 mt-1 pt-3"
                                >
                                    Back to Report
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* AI Checking/Loading Overlay */}
                {isCheckingAI && (
                    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4">
                        <div className="absolute inset-0 bg-[#1a1208]/60 backdrop-blur-md animate-in fade-in duration-300" />
                        <div className="relative w-full max-w-sm bg-white rounded-[2.5rem] shadow-2xl p-10 text-center animate-in zoom-in-95 duration-300 border border-gray-50">
                            <div className="flex flex-col items-center justify-center gap-6">
                                <div className="relative flex items-center justify-center">
                                    <div className="w-16 h-16 rounded-full border-4 border-orange-100 border-t-[#F97316] animate-spin" />
                                    <div className="absolute text-xl">🔍</div>
                                </div>
                                <div>
                                    <h3 className="text-lg font-black uppercase tracking-tight text-[#1a1208] mb-1">AI Scan Active</h3>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none mb-3">Checking for Single Animal validation</p>
                                    <p className="text-xs font-bold text-[#F97316] animate-pulse">{validationStatus}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Inconclusive Warning Modal */}
                {showInconclusiveModal && (
                    <div className="fixed inset-0 z-[380] flex items-center justify-center p-4">
                        <div className="absolute inset-0 bg-[#1a1208]/60 backdrop-blur-md animate-in fade-in duration-300" onClick={() => setShowInconclusiveModal(false)} />
                        <div className="relative w-full max-w-md bg-white rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-10 duration-500 p-10 text-[#1a1208] border border-gray-50">
                            <div className="mb-6 text-center">
                                <div className="w-16 h-16 bg-yellow-50 text-yellow-600 rounded-2xl flex items-center justify-center mb-6 mx-auto border border-yellow-100">
                                    <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                </div>
                                <h3 className="text-xl font-black uppercase tracking-tight text-[#1a1208] mb-2">
                                    Similarity Inconclusive
                                </h3>
                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                                    AI Similarity Scan Warning
                                </p>
                            </div>

                            <div className="bg-yellow-50/50 border border-yellow-100 rounded-2xl p-5 mb-8 text-xs font-bold text-yellow-800 leading-relaxed text-center">
                                {inconclusiveText}
                            </div>

                            <div className="space-y-3">
                                <button
                                    onClick={() => {
                                        setShowInconclusiveModal(false);
                                        setShowFinalConfirmModal(true);
                                    }}
                                    className="w-full py-4 bg-[#F97316] hover:bg-orange-600 text-white text-[11px] font-black uppercase tracking-[0.15em] rounded-2xl shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98]"
                                >
                                    Proceed Anyway
                                </button>
                                <button
                                    onClick={() => setShowInconclusiveModal(false)}
                                    className="w-full py-4 text-[10px] font-black text-gray-400 hover:text-gray-600 uppercase tracking-widest transition-all"
                                >
                                    Review Images
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Final Warning Sighting Confirmation Modal */}
                {showFinalConfirmModal && (
                    <div className="fixed inset-0 z-[390] flex items-center justify-center p-4">
                        <div className="absolute inset-0 bg-[#1a1208]/60 backdrop-blur-md animate-in fade-in duration-300" onClick={() => setShowFinalConfirmModal(false)} />
                        <div className="relative w-full max-w-md bg-white rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-10 duration-500 p-10 text-[#1a1208] border border-gray-50">
                            <div className="mb-6 text-center">
                                <div className="w-16 h-16 bg-orange-50 text-[#F97316] rounded-2xl flex items-center justify-center mb-6 mx-auto border border-orange-100">
                                    <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </div>
                                <h3 className="text-xl font-black uppercase tracking-tight text-[#1a1208] mb-2">
                                    Confirm Sighting
                                </h3>
                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                                    Final Report Sighting Check
                                </p>
                            </div>

                            <div className="bg-orange-50/50 border border-orange-100 rounded-2xl p-5 mb-8 text-xs font-bold text-[#F97316] leading-relaxed text-center">
                                This report should only represent one stray animal. Please create separate reports for different animals.
                            </div>

                            <div className="space-y-3">
                                <button
                                    onClick={() => {
                                        setShowFinalConfirmModal(false);
                                        handleSubmit();
                                    }}
                                    className="w-full py-4 bg-[#F97316] hover:bg-orange-600 text-white text-[11px] font-black uppercase tracking-[0.15em] rounded-2xl shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98]"
                                >
                                    Confirm & Submit Sighting
                                </button>
                                <button
                                    onClick={() => setShowFinalConfirmModal(false)}
                                    className="w-full py-4 text-[10px] font-black text-gray-400 hover:text-gray-600 uppercase tracking-widest transition-all"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                    {/* Left Column: Feed List (Reports or Announcements depending on feedTab) */}
                    <div className="lg:col-span-8 space-y-6">
                        {feedTab === 'announcements' && (
                            <>
                                {filteredAnnouncements.length === 0 ? (
                                    <div className="max-w-md mx-auto text-center py-20 px-8 bg-white rounded-[2.5rem] border border-gray-100 shadow-sm">
                                        <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest mb-2">
                                            No Announcements
                                        </h3>
                                        <p className="text-xs text-gray-400 leading-relaxed max-w-xs mx-auto">
                                            There are no community announcements for you right now.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="max-w-3xl mx-auto">
                                        {filteredAnnouncements.slice(0, announcementsLimit).map((ann) => {
                                            return (
                                                <div
                                                    key={ann.announcement_id}
                                                    id={`ann-${ann.announcement_id}`}
                                                    className="bg-white rounded-[2.5rem] border border-gray-100 shadow-xl overflow-hidden mb-12 hover:shadow-2xl transition-all duration-300"
                                                >
                                                    <div className="p-6 sm:p-8">
                                                        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                                                            <span className="text-[10px] font-black uppercase px-3 py-1 rounded-full bg-gray-100 text-gray-700">
                                                                {ann.category}
                                                            </span>
                                                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                                                {formatAnnouncementDate(ann.posted_on)}
                                                            </span>
                                                        </div>
                                                        <h3 className="text-xl font-black mb-2 text-gray-900">
                                                            {ann.title}
                                                        </h3>
                                                        <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line mb-6 font-medium">
                                                            {ann.content}
                                                        </p>
                                                        {ann.location && (
                                                            <p className="text-sm font-bold text-gray-800 mb-4">
                                                                📍 {ann.location}
                                                            </p>
                                                        )}
                                                        {/* Main Media (first item) */}
                                                        {ann.media?.[0] && (
                                                            ann.media[0].media_type === 'Image' ? (
                                                                <img src={ann.media[0].file_url} alt={ann.title} className="w-full h-64 sm:h-96 object-cover rounded-2xl border border-gray-100 mb-4" />
                                                            ) : ann.media[0].media_type === 'Video' ? (
                                                                <video src={ann.media[0].file_url} controls className="w-full h-64 sm:h-96 object-cover rounded-2xl border border-gray-100 mb-4" />
                                                            ) : null
                                                        )}

                                                        {(ann.media || []).length > 1 && (
                                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                                                                {ann.media.map((media: any, idx: number) => {
                                                                    if (idx === 0) return null; // already rendered as main media
                                                                    return (
                                                                        <div key={idx} className="border border-gray-100 rounded-xl p-2 bg-gray-50/50 shadow-sm">
                                                                            {media.media_type === 'Image' ? (
                                                                                <img src={media.file_url} alt="Attachment" className="w-full h-40 object-cover rounded-lg" />
                                                                            ) : media.media_type === 'Video' ? (
                                                                                <video src={media.file_url} controls className="w-full h-40 rounded-lg" />
                                                                            ) : (
                                                                                <a href={media.file_url} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-gray-800 hover:underline">
                                                                                    Open PDF / Document
                                                                                </a>
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}

                                                        <div className="flex items-center justify-between gap-4 mb-4">
                                                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                                                Posted by {ann.posted_by} • {ann.visibility}
                                                            </p>
                                                        </div>

                                                        {/* Reactions and Likes section */}
                                                        <div className="flex items-center gap-4 mt-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleLikeAnnouncement(ann.announcement_id)}
                                                                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shadow-sm ${ann.reactions?.some((r: any) => r.user_id === currentUserId)
                                                                    ? 'bg-[#F97316] text-white shadow-orange-100'
                                                                    : 'bg-[#FAFAF9] border border-gray-100 text-gray-500 hover:bg-orange-50 hover:text-[#F97316] hover:border-orange-200'
                                                                    }`}
                                                            >
                                                                <svg className="w-3.5 h-3.5" fill={ann.reactions?.some((r: any) => r.user_id === currentUserId) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5"></path>
                                                                </svg>
                                                                <span>{ann.reactions ? ann.reactions.length : 0} Likes</span>
                                                            </button>
                                                            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                                                💬 {ann.comments ? ann.comments.length : 0} Comments
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Comments Section */}
                                                    <div className="bg-white border-t border-gray-100 p-4 sm:p-8 pt-6">
                                                        {ann.comments && ann.comments.length > 0 && (
                                                            <button
                                                                onClick={() => setExpandedComments(prev => ({ ...prev, [ann.announcement_id + 100000]: !prev[ann.announcement_id + 100000] }))}
                                                                className="text-[9px] sm:text-[10px] font-black text-gray-400 hover:text-[#F97316] uppercase tracking-widest transition-colors flex items-center gap-2 mb-6"
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 transition-transform duration-300 ${expandedComments[ann.announcement_id + 100000] ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                                                                </svg>
                                                                {expandedComments[ann.announcement_id + 100000] ? 'Hide Comments' : `View all ${ann.comments.length} comments`}
                                                            </button>
                                                        )}

                                                        {(expandedComments[ann.announcement_id + 100000] || !ann.comments || ann.comments.length === 0) && (
                                                            <div className="space-y-2 mb-6 max-h-72 overflow-y-auto custom-scrollbar pr-2 animate-in fade-in slide-in-from-top-2 duration-300">
                                                                {ann.comments && ann.comments.length > 0 ? (
                                                                    ann.comments
                                                                        .filter((c: any) => !c.parent_comment_id)
                                                                        .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                                                                        .map((c: any) => {
                                                                            const replies = ann.comments
                                                                                .filter((reply: any) => reply.parent_comment_id === c.comment_id)
                                                                                .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
                                                                            return (
                                                                                <div key={c.comment_id} className="mb-4 last:mb-0">
                                                                                    <div className="flex gap-3 relative">
                                                                                        {/* Parent Avatar & Vertical Line */}
                                                                                        <div className="relative flex flex-col items-center shrink-0">
                                                                                             <img 
                                                                                                 src={getProfilePicture(c.user_photo)} 
                                                                                                 className="w-8 h-8 rounded-full object-cover z-10 ring-4 ring-white border border-gray-100 shadow-sm" 
                                                                                                 alt={c.user_name || 'User'} 
                                                                                                 onError={(e) => { e.currentTarget.src = DEFAULT_AVATAR; }}
                                                                                             />
                                                                                            {(replies.length > 0 || annReplyingTo[ann.announcement_id]?.commentId === c.comment_id) && (
                                                                                                <div className="absolute top-8 bottom-[-16px] left-1/2 -translate-x-1/2 w-[2px] bg-gray-100 z-0"></div>
                                                                                            )}
                                                                                        </div>

                                                                                        <div className="flex-1 pb-1">
                                                                                            {/* Meta Info */}
                                                                                            <div className="bg-[#FAFAF9] rounded-[1.5rem] p-3.5 px-4 border border-gray-50 shadow-sm inline-block">
                                                                                                <span className="block text-[11px] font-black text-[#1a1208] mb-0.5">{c.user_name}</span>
                                                                                                <p className="text-xs font-semibold text-gray-700 leading-relaxed pr-6">{c.comment}</p>
                                                                                            </div>
                                                                                            {/* Parent Actions */}
                                                                                            <div className="flex items-center gap-4 mt-1.5 ml-3">
                                                                                                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">{new Date(c.created_at).toLocaleDateString()}</span>
                                                                                                <button
                                                                                                    onClick={() => setAnnReplyingTo(prev => ({ ...prev, [ann.announcement_id]: { commentId: c.comment_id, userName: c.user_name } }))}
                                                                                                    className="text-[10px] font-bold text-gray-500 hover:text-[#F97316] transition-colors"
                                                                                                >
                                                                                                    Reply
                                                                                                </button>
                                                                                            </div>

                                                                                            {/* Replies Container */}
                                                                                            {replies.length > 0 && (
                                                                                                <div className="mt-4 space-y-4">
                                                                                                    {replies.map((reply: any, index: number) => (
                                                                                                        <div key={reply.comment_id} className="flex gap-3 relative">
                                                                                                            {/* Horizontal connector curve */}
                                                                                                            <div className="absolute top-[-10px] left-[-28px] w-[28px] h-[26px] border-b-[2px] border-l-[2px] border-gray-100 rounded-bl-[12px] z-0 pointer-events-none"></div>

                                                                                                            {/* Mask to hide vertical line below the last reply */}
                                                                                                            {index === replies.length - 1 && annReplyingTo[ann.announcement_id]?.commentId !== c.comment_id && (
                                                                                                                <div className="absolute top-[16px] bottom-[-100px] left-[-30px] w-[6px] bg-white z-0 pointer-events-none"></div>
                                                                                                            )}

                                                                                                            {/* Child Avatar */}
                                                                                                            <img 
                                                                                                                 src={getProfilePicture(reply.user_photo)} 
                                                                                                                 className="w-6 h-6 rounded-full object-cover z-10 mt-1 ring-4 ring-white border border-gray-100 shadow-sm shrink-0" 
                                                                                                                 alt={reply.user_name || 'User'} 
                                                                                                                 onError={(e) => { e.currentTarget.src = DEFAULT_AVATAR; }}
                                                                                                             />

                                                                                                            <div className="flex-1">
                                                                                                                {/* Child Bubble */}
                                                                                                                <div className="bg-[#FAFAF9] rounded-[1.2rem] p-3 px-4 border border-gray-50 shadow-sm inline-block">
                                                                                                                    <span className="block text-[10px] font-black text-gray-800 mb-0.5">{reply.user_name}</span>
                                                                                                                    <p className="text-[11px] font-semibold text-gray-600 leading-relaxed pr-4">{reply.comment}</p>
                                                                                                                </div>
                                                                                                                {/* Child Actions */}
                                                                                                                <div className="flex items-center gap-4 mt-1.5 ml-3">
                                                                                                                    <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">{new Date(reply.created_at).toLocaleDateString()}</span>
                                                                                                                    <button
                                                                                                                        onClick={() => setAnnReplyingTo(prev => ({ ...prev, [ann.announcement_id]: { commentId: c.comment_id, userName: reply.user_name } }))}
                                                                                                                        className="text-[9px] font-bold text-gray-500 hover:text-[#F97316] transition-colors"
                                                                                                                    >
                                                                                                                        Reply
                                                                                                                    </button>
                                                                                                                </div>
                                                                                                            </div>
                                                                                                        </div>
                                                                                                    ))}
                                                                                                </div>
                                                                                            )}

                                                                                            {/* Inline Reply Input */}
                                                                                            {annReplyingTo[ann.announcement_id]?.commentId === c.comment_id && (
                                                                                                <div className="mt-4 flex items-center gap-3 relative z-10 animate-in fade-in slide-in-from-top-2 duration-200">
                                                                                                    {/* Thread curve for the reply input itself */}
                                                                                                    <div className="absolute top-[-10px] left-[-28px] w-[28px] h-[24px] border-b-[2px] border-l-[2px] border-gray-100 rounded-bl-[12px] z-0 pointer-events-none"></div>
                                                                                                    {/* Mask to hide vertical line below the inline reply input */}
                                                                                                    <div className="absolute top-[14px] bottom-[-100px] left-[-30px] w-[6px] bg-white z-0 pointer-events-none"></div>

                                                                                                    <div className="w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center text-[#F97316] font-black text-[10px] shrink-0 border border-orange-200 z-10 bg-white ring-4 ring-white">
                                                                                                        {currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : 'U'}
                                                                                                    </div>
                                                                                                    <div className="flex-1 relative flex items-center">
                                                                                                        <input
                                                                                                            type="text"
                                                                                                            autoFocus
                                                                                                            placeholder={`Replying to ${annReplyingTo[ann.announcement_id]?.userName}...`}
                                                                                                            className="w-full bg-[#FAFAF9] border border-gray-100 rounded-[1.2rem] pl-4 pr-10 py-2 text-[11px] font-semibold text-[#1a1208] focus:outline-none focus:border-orange-200 focus:bg-white transition-all placeholder:text-gray-400 shadow-inner"
                                                                                                            value={annCommentInputs[ann.announcement_id] || ''}
                                                                                                            onChange={(e) => setAnnCommentInputs(prev => ({ ...prev, [ann.announcement_id]: e.target.value }))}
                                                                                                            onKeyPress={(e) => e.key === 'Enter' && handleAddAnnouncementComment(ann.announcement_id, c.comment_id)}
                                                                                                        />
                                                                                                        <button
                                                                                                            onClick={() => {
                                                                                                                setAnnReplyingTo(prev => ({ ...prev, [ann.announcement_id]: null }));
                                                                                                                setAnnCommentInputs(prev => ({ ...prev, [ann.announcement_id]: '' }));
                                                                                                            }}
                                                                                                            className="absolute right-3 text-gray-400 hover:text-red-500 transition-colors"
                                                                                                        >
                                                                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                                                                                            </svg>
                                                                                                        </button>
                                                                                                    </div>
                                                                                                    <button
                                                                                                        onClick={() => handleAddAnnouncementComment(ann.announcement_id, c.comment_id)}
                                                                                                        className="bg-[#F97316] text-white rounded-full w-8 h-8 flex items-center justify-center shadow-md shadow-orange-100 hover:scale-105 active:scale-[0.95] transition-all shrink-0"
                                                                                                    >
                                                                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 relative left-[1px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                                                                                        </svg>
                                                                                                    </button>
                                                                                                </div>
                                                                                            )}
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                            );
                                                                        })
                                                                ) : (
                                                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest italic text-center py-4">No comments yet. Be the first to comment!</p>
                                                                )}
                                                            </div>
                                                        )}

                                                        {!annReplyingTo[ann.announcement_id] && (
                                                            <div className="flex items-center gap-3 animate-in fade-in duration-200">
                                                                <div className="flex-1 relative">
                                                                    <input
                                                                        type="text"
                                                                        placeholder="Write a comment..."
                                                                        className="w-full bg-[#FAFAF9] border border-gray-100 rounded-[1.5rem] pl-5 pr-12 py-3 text-xs font-semibold text-[#1a1208] focus:outline-none focus:border-orange-200 focus:bg-white transition-all placeholder:text-gray-300 shadow-inner"
                                                                        value={annCommentInputs[ann.announcement_id] || ''}
                                                                        onChange={(e) => setAnnCommentInputs(prev => ({ ...prev, [ann.announcement_id]: e.target.value }))}
                                                                        onKeyPress={(e) => e.key === 'Enter' && handleAddAnnouncementComment(ann.announcement_id)}
                                                                    />
                                                                </div>
                                                                <button
                                                                    onClick={() => handleAddAnnouncementComment(ann.announcement_id)}
                                                                    className="bg-[#F97316] text-white rounded-[1.2rem] p-3 shadow-md shadow-orange-100 hover:scale-105 active:scale-[0.95] transition-all flex-shrink-0"
                                                                >
                                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                                                    </svg>
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        {filteredAnnouncements.length > announcementsLimit && (
                                            <button
                                                onClick={() => setAnnouncementsLimit(prev => prev + 10)}
                                                className="w-full py-3.5 bg-orange-50/50 hover:bg-orange-50 text-[#F97316] border border-orange-100 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest transition-all active:scale-[0.98] mt-2 mb-8 shadow-sm flex items-center justify-center gap-2"
                                            >
                                                Load More
                                            </button>
                                        )}
                                    </div>
                                )}
                            </>
                        )}

                        {/* Real Report Posts */}
                        {feedTab === 'reports' && (currentTabReports.length === 0 ? (
                            <div className="max-w-md mx-auto text-center py-20 px-8 bg-white rounded-[2.5rem] border border-gray-100 shadow-sm animate-in fade-in slide-in-from-bottom-5 duration-500">
                                <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center text-gray-400 mx-auto mb-6 border border-gray-100/50">
                                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0a2 2 0 01-2 2H6a2 2 0 01-2-2m16 0V9a2 2 0 00-2-2H6a2 2 0 00-2 2v2.5" />
                                    </svg>
                                </div>
                                <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest mb-2">
                                    No Community Reports
                                </h3>
                                <p className="text-xs text-gray-400 leading-relaxed max-w-xs mx-auto">
                                    No public stray sighting reports found in your subdivision. Be the first to report!
                                </p>
                            </div>
                        ) : (
                            currentTabReports.map((report) => {
                                const date = formatTimestamp(report.created_at);

                                return (
                                    <div key={report.report_id} className="max-w-3xl mx-auto">
                                        <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-xl overflow-hidden mb-12 hover:shadow-2xl transition-all duration-300">
                                            {/* Top Thin Bar: ID (Left) + Menu (Right) */}
                                            <div className="px-4 sm:px-8 py-2.5 border-b border-gray-50 flex items-center justify-between bg-gray-50/20">
                                                <p className="text-[9px] sm:text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                                    Report #STR-{(report.report_id || 0).toString().padStart(4, '0')}
                                                </p>
                                                <div className="flex items-center gap-4">
                                                    <div className="relative" ref={openMenuId === report.report_id ? menuRef : null}>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setOpenMenuId(openMenuId === report.report_id ? null : report.report_id);
                                                            }}
                                                            className="p-1.5 text-gray-400 hover:text-[#1a1208] rounded-full hover:bg-white hover:shadow-sm transition-all border border-transparent hover:border-gray-100"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                                <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z" />
                                                            </svg>
                                                        </button>
                                                        {openMenuId === report.report_id && (
                                                            <div className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.1)] border border-gray-100 py-2 z-50 animate-in fade-in zoom-in-95 duration-200">
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); openReportDetail(report.report_id, report); }}
                                                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-[11px] font-black uppercase tracking-widest text-blue-600 hover:bg-blue-50 transition-colors"
                                                                >
                                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                                    </svg>
                                                                    View Report
                                                                </button>

                                                                {report.user_id === currentUserId && report.status_id === 1 && (
                                                                    <>
                                                                        <button
                                                                            onClick={(e) => { e.stopPropagation(); handleEditClick(report); }}
                                                                            className="w-full flex items-center gap-3 px-4 py-2.5 text-[11px] font-black uppercase tracking-widest text-[#F97316] hover:bg-orange-50 transition-colors border-t border-gray-50"
                                                                        >
                                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                                            </svg>
                                                                            Edit Details
                                                                        </button>
                                                                        <button
                                                                            onClick={(e) => { e.stopPropagation(); handleDeleteReport(report.report_id); setOpenMenuId(null); }}
                                                                            className="w-full flex items-center gap-3 px-4 py-2.5 text-[11px] font-black uppercase tracking-widest text-red-500 hover:bg-red-50 transition-colors border-t border-gray-50"
                                                                        >
                                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                                            </svg>
                                                                            Delete Report
                                                                        </button>
                                                                    </>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Content Section */}
                                            <div className="px-4 sm:px-8 pt-6 pb-6">
                                                {/* Profile & Category Header Row */}
                                                <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
                                                    <div className="flex items-center gap-3">
                                                        {report.reporter_photo ? (
                                                            <img
                                                                src={report.reporter_photo}
                                                                className="w-11 h-11 rounded-full object-cover border-2 border-orange-50 shadow-sm"
                                                                alt={report.reporter_name}
                                                            />
                                                        ) : (
                                                            <div className="w-11 h-11 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 font-black text-sm border-2 border-white shadow-sm">
                                                                {report.reporter_name?.charAt(0).toUpperCase() || 'U'}
                                                            </div>
                                                        )}
                                                        <div>
                                                            <p className="text-[13px] font-black text-[#1a1208] uppercase tracking-tight leading-none mb-1.5">{report.reporter_name}</p>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest leading-none">{date}</span>
                                                                <span className="text-gray-300 font-bold text-[9px] leading-none">•</span>
                                                                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-[#FAFAF9] border border-gray-100 rounded-md w-fit">
                                                                    {report.visibility === 'Private' ? (
                                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-2.5 w-2.5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                                                        </svg>
                                                                    ) : (
                                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-2.5 w-2.5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                                        </svg>
                                                                    )}
                                                                    <span className="text-[8px] font-black text-gray-500 uppercase tracking-widest leading-none">{report.visibility}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Category & Status Badges */}
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="px-3 py-1 bg-orange-50 border border-orange-200 text-[#F97316] rounded-full text-[10px] font-black uppercase tracking-wider shadow-2xs">
                                                            {categoryMap[report.category_id] || 'Incident Report'}
                                                        </span>
                                                        {report.status_id && (
                                                            <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border shadow-2xs ${
                                                                report.status_id === 2 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                                                report.status_id === 5 ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                                'bg-gray-100 text-gray-700 border-gray-200'
                                                            }`}>
                                                                {reportStatusMap[report.status_id] || 'Reported'}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Animal Characteristics & Details Overview Chips */}
                                                {(() => {
                                                    const rawDesc = report.description || '';
                                                    const isLostPet = report.pet_id || (rawDesc && rawDesc.includes('[LOST PET REPORT]'));
                                                    if (isLostPet) return null;

                                                    const { pattern: parsedPattern, conditions: parsedConditions } = parseReportDescription(rawDesc);
                                                    const displayType = report.animal_type || report.ai_animal_type || 'Animal';
                                                    const displayBreed = (report.animal_breed && report.animal_breed.toLowerCase() !== 'unknown') ? report.animal_breed : (report.ai_possible_breed && report.ai_possible_breed.toLowerCase() !== 'unknown' ? report.ai_possible_breed : null);
                                                    const displayColor = (report.animal_color && report.animal_color.toLowerCase() !== 'unknown') ? report.animal_color : (report.ai_dominant_color || null);
                                                    const displaySize = (report.estimated_size && report.estimated_size.toLowerCase() !== 'unknown') ? report.estimated_size : (report.ai_estimated_size || null);
                                                    const displayPattern = parsedPattern || (report.coat_pattern && report.coat_pattern.toLowerCase() !== 'unknown' ? report.coat_pattern : (report.ai_coat_pattern && report.ai_coat_pattern.toLowerCase() !== 'unknown' ? report.ai_coat_pattern : null));
                                                    const displayConditions = parsedConditions || report.condition || '';

                                                    return (
                                                        <div className="mb-3.5 flex flex-wrap items-center gap-1.5">
                                                            {/* Animal Type & Breed */}
                                                            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-stone-100/90 border border-stone-200/80 rounded-xl text-stone-800 text-[11px] font-bold shadow-2xs">
                                                                <span>{displayType.toLowerCase() === 'cat' ? '🐱' : '🐕'}</span>
                                                                <span className="font-extrabold text-[#1a1208]">{displayType}</span>
                                                                {displayBreed && (
                                                                    <>
                                                                        <span className="text-stone-400">•</span>
                                                                        <span>{displayBreed}</span>
                                                                    </>
                                                                )}
                                                            </div>

                                                            {/* Color */}
                                                            {displayColor && (
                                                                <div className="inline-flex items-center gap-1 px-2.5 py-1 bg-stone-50 border border-stone-200/60 rounded-xl text-stone-700 text-[11px] font-bold shadow-2xs">
                                                                    <span>🎨</span>
                                                                    <span>{displayColor}</span>
                                                                </div>
                                                            )}

                                                            {/* Pattern */}
                                                            {displayPattern && displayPattern.toLowerCase() !== 'unknown' && (
                                                                <div className="inline-flex items-center gap-1 px-2.5 py-1 bg-stone-50 border border-stone-200/60 rounded-xl text-stone-700 text-[11px] font-bold shadow-2xs">
                                                                    <span>✨</span>
                                                                    <span>{displayPattern}</span>
                                                                </div>
                                                            )}

                                                            {/* Size */}
                                                            {displaySize && (
                                                                <div className="inline-flex items-center gap-1 px-2.5 py-1 bg-stone-50 border border-stone-200/60 rounded-xl text-stone-700 text-[11px] font-bold shadow-2xs">
                                                                    <span>📏</span>
                                                                    <span>{displaySize}</span>
                                                                </div>
                                                            )}

                                                            {/* Observed Conditions */}
                                                            {displayConditions && displayConditions.split(',').map((cond: string, i: number) => {
                                                                const trimmed = cond.trim();
                                                                if (!trimmed || trimmed.toLowerCase() === 'none' || trimmed.toLowerCase() === 'none specified') return null;
                                                                return (
                                                                    <div key={i} className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 border border-amber-200/80 text-amber-800 rounded-xl text-[11px] font-bold shadow-2xs">
                                                                        <span>🩹</span>
                                                                        <span>{trimmed}</span>
                                                                    </div>
                                                                );
                                                            })}

                                                            {/* Landmark */}
                                                            {report.landmark && (
                                                                <div className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 border border-blue-200/70 text-blue-800 rounded-xl text-[11px] font-bold shadow-2xs">
                                                                    <span>📍</span>
                                                                    <span className="truncate max-w-[200px]">{report.landmark}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })()}

                                                {/* Lost Pet Owner Contact & QR Code Emergency Box */}
                                                {(report.pet_id || report.owner_phone || (report.description && report.description.includes('[LOST PET REPORT]'))) && (
                                                    <div className="mb-5 p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50/80 border-2 border-amber-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                                        <div className="flex items-start sm:items-center gap-3.5">
                                                            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-amber-600 to-orange-500 text-white flex items-center justify-center font-black text-xl shadow-md shrink-0">
                                                                🐾
                                                            </div>
                                                            <div>
                                                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                                    <span className="px-2 py-0.5 bg-amber-200/90 text-amber-900 rounded-md text-[9px] font-black uppercase tracking-wider">
                                                                        Lost Registered Pet
                                                                    </span>
                                                                    {report.pet_name && (
                                                                        <span className="text-xs font-black text-[#1a1208] uppercase">
                                                                            {report.pet_name}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <p className="text-xs font-bold text-amber-950">
                                                                    Owner: <span className="font-extrabold">{report.owner_name || report.reporter_name || 'Registered Resident'}</span>
                                                                    {report.owner_phone && <span className="text-amber-800 font-bold ml-1.5">• 📞 {report.owner_phone}</span>}
                                                                </p>
                                                                {report.pet_qr_code_hash && (
                                                                    <p className="text-[10px] font-bold text-amber-800/90 tracking-tight mt-1 flex items-center gap-1">
                                                                        Pet QR Tag: <span className="font-mono bg-white/90 px-1.5 py-0.5 rounded border border-amber-300 font-bold text-amber-900">{report.pet_qr_code_hash}</span>
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </div>
                                                        
                                                        <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                                                            {report.owner_phone && (
                                                                <a
                                                                    href={`tel:${report.owner_phone}`}
                                                                    className="flex-1 sm:flex-initial px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all text-center shadow-sm flex items-center justify-center gap-1.5"
                                                                >
                                                                    <span>📞</span>
                                                                    <span>Contact Owner</span>
                                                                </a>
                                                            )}
                                                            {report.pet_qr_code_url && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setActiveQrModal({
                                                                        url: report.pet_qr_code_url,
                                                                        petName: report.pet_name,
                                                                        hash: report.pet_qr_code_hash,
                                                                        ownerName: report.owner_name || report.reporter_name,
                                                                        ownerPhone: report.owner_phone
                                                                    })}
                                                                    className="flex-1 sm:flex-initial px-3.5 py-2.5 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all text-center flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                                                                >
                                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                                                                    </svg>
                                                                    <span>Pet QR Tag</span>
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Description */}
                                                <div className="mb-4">
                                                    <FormattedReportDescription description={report.description} />
                                                </div>

                                                {/* Media Grid: The Focus */}
                                                {(() => {
                                                    const originalMedia = report.media?.filter((m: any) => {
                                                        if (m.is_evidence) return false;
                                                        const url = m.file_url.toLowerCase();
                                                        return m.media_type !== 'Document' &&
                                                            !url.endsWith('.pdf') &&
                                                            !url.endsWith('.doc') &&
                                                            !url.endsWith('.docx') &&
                                                            !url.endsWith('.txt');
                                                    }) || [];
                                                    if (originalMedia.length === 0) return null;

                                                    return (
                                                        <div className="mb-6">
                                                            <div className={`grid gap-2 rounded-2xl sm:rounded-[2.5rem] overflow-hidden border-2 border-gray-50 shadow-inner bg-gray-50/30 ${originalMedia.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
                                                                }`}>
                                                                {originalMedia.slice(0, 4).map((m: any, idx: number) => (
                                                                    <div
                                                                        key={m.media_id}
                                                                        className={`relative overflow-hidden cursor-pointer group/media ${originalMedia.length === 1 ? 'h-64 sm:h-96' :
                                                                            originalMedia.length === 2 ? 'h-48 sm:h-72' :
                                                                                originalMedia.length === 3 && idx === 0 ? 'row-span-2 h-[24rem] sm:h-[36rem]' : 'h-48 sm:h-72'
                                                                            }`}
                                                                        onClick={() => setActiveGallery({ media: originalMedia, index: idx })}
                                                                    >
                                                                        {m.media_type === 'Video' ? (
                                                                            <div className="w-full h-full relative">
                                                                                <video src={m.file_url} className="w-full h-full object-cover" />
                                                                                <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover/media:bg-black/30 transition-all">
                                                                                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white border border-white/30">
                                                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 sm:h-6 sm:w-6 ml-1" fill="currentColor" viewBox="0 0 24 24">
                                                                                            <path d="M8 5v14l11-7z" />
                                                                                        </svg>
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        ) : (
                                                                            <img
                                                                                src={m.file_url}
                                                                                alt="Media"
                                                                                className="w-full h-full object-cover hover:scale-105 transition-all duration-1000 ease-out"
                                                                            />
                                                                        )}
                                                                        {idx === 3 && originalMedia.length > 4 && (
                                                                            <div className="absolute inset-0 bg-black/70 backdrop-blur-[4px] flex items-center justify-center text-white">
                                                                                <span className="text-xl sm:text-3xl font-black tracking-tighter leading-none">+{originalMedia.length - 4}</span>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    );
                                                })()}
                                            </div>

                                            {/* Comments Section */}
                                            <div className="bg-white border-t border-gray-100 p-4 sm:p-8 pt-6">
                                                {report.comments && report.comments.length > 0 && (
                                                    <button
                                                        onClick={() => setExpandedComments(prev => ({ ...prev, [report.report_id]: !prev[report.report_id] }))}
                                                        className="text-[9px] sm:text-[10px] font-black text-gray-400 hover:text-[#F97316] uppercase tracking-widest transition-colors flex items-center gap-2 mb-6"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 transition-transform duration-300 ${expandedComments[report.report_id] ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                                                        </svg>
                                                        {expandedComments[report.report_id] ? 'Hide Comments' : `View all ${report.comments.length} comments`}
                                                    </button>
                                                )}

                                                {(expandedComments[report.report_id] || !report.comments || report.comments.length === 0) && (
                                                    <div className="space-y-2 mb-6 max-h-72 overflow-y-auto custom-scrollbar pr-2 animate-in fade-in slide-in-from-top-2 duration-300">
                                                        {report.comments && report.comments.length > 0 ? (
                                                            report.comments
                                                                .filter((c: any) => !c.parent_comment_id)
                                                                .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                                                                .map((c: any) => {
                                                                    const replies = report.comments
                                                                        .filter((reply: any) => reply.parent_comment_id === c.comment_id)
                                                                        .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
                                                                    return (
                                                                        <div key={c.comment_id} className="mb-4 last:mb-0">
                                                                            <div className="flex gap-3 relative">
                                                                                {/* Parent Avatar & Vertical Line */}
                                                                                <div className="relative flex flex-col items-center shrink-0">
                                                                                    <img 
                                                                                        src={getProfilePicture(c.user_photo)} 
                                                                                        className="w-8 h-8 rounded-full object-cover z-10 ring-4 ring-white border border-gray-100 shadow-sm" 
                                                                                        alt={c.user_name || 'User'} 
                                                                                        onError={(e) => { e.currentTarget.src = DEFAULT_AVATAR; }}
                                                                                    />
                                                                                    {(replies.length > 0 || replyingTo[report.report_id]?.commentId === c.comment_id) && (
                                                                                        <div className="absolute top-8 bottom-[-16px] left-1/2 -translate-x-1/2 w-[2px] bg-gray-100 z-0"></div>
                                                                                    )}
                                                                                </div>

                                                                                <div className="flex-1 pb-1">
                                                                                    {/* Meta Info */}
                                                                                    <div className="bg-[#FAFAF9] rounded-[1.5rem] p-3.5 px-4 border border-gray-50 shadow-sm inline-block">
                                                                                        <span className="block text-[11px] font-black text-[#1a1208] mb-0.5">{c.user_name}</span>
                                                                                        <p className="text-xs font-semibold text-gray-700 leading-relaxed pr-6">{c.comment}</p>
                                                                                    </div>
                                                                                    {/* Parent Actions */}
                                                                                    <div className="flex items-center gap-4 mt-1.5 ml-3">
                                                                                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">{new Date(c.created_at).toLocaleDateString()}</span>
                                                                                        <button
                                                                                            onClick={() => setReplyingTo(prev => ({ ...prev, [report.report_id]: { commentId: c.comment_id, userName: c.user_name } }))}
                                                                                            className="text-[10px] font-bold text-gray-500 hover:text-[#F97316] transition-colors"
                                                                                        >
                                                                                            Reply
                                                                                        </button>
                                                                                    </div>

                                                                                    {/* Replies Container */}
                                                                                    {replies.length > 0 && (
                                                                                        <div className="mt-4 space-y-4">
                                                                                            {replies.map((reply: any, index: number) => (
                                                                                                <div key={reply.comment_id} className="flex gap-3 relative">
                                                                                                    {/* Horizontal connector curve */}
                                                                                                    <div className="absolute top-[-10px] left-[-28px] w-[28px] h-[26px] border-b-[2px] border-l-[2px] border-gray-100 rounded-bl-[12px] z-0 pointer-events-none"></div>

                                                                                                    {/* Mask to hide vertical line below the last reply */}
                                                                                                    {index === replies.length - 1 && replyingTo[report.report_id]?.commentId !== c.comment_id && (
                                                                                                        <div className="absolute top-[16px] bottom-[-100px] left-[-30px] w-[6px] bg-white z-0 pointer-events-none"></div>
                                                                                                    )}

                                                                                                    {/* Child Avatar */}
                                                                                                    <img 
                                                                                                        src={getProfilePicture(reply.user_photo)} 
                                                                                                        className="w-6 h-6 rounded-full object-cover z-10 mt-1 ring-4 ring-white border border-gray-100 shadow-sm shrink-0" 
                                                                                                        alt={reply.user_name || 'User'} 
                                                                                                        onError={(e) => { e.currentTarget.src = DEFAULT_AVATAR; }}
                                                                                                    />

                                                                                                    <div className="flex-1">
                                                                                                        {/* Child Bubble */}
                                                                                                        <div className="bg-[#FAFAF9] rounded-[1.2rem] p-3 px-4 border border-gray-50 shadow-sm inline-block">
                                                                                                            <span className="block text-[10px] font-black text-gray-800 mb-0.5">{reply.user_name}</span>
                                                                                                            <p className="text-[11px] font-semibold text-gray-600 leading-relaxed pr-4">{reply.comment}</p>
                                                                                                        </div>
                                                                                                        {/* Child Actions */}
                                                                                                        <div className="flex items-center gap-4 mt-1.5 ml-3">
                                                                                                            <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">{new Date(reply.created_at).toLocaleDateString()}</span>
                                                                                                            <button
                                                                                                                onClick={() => setReplyingTo(prev => ({ ...prev, [report.report_id]: { commentId: c.comment_id, userName: reply.user_name } }))}
                                                                                                                className="text-[9px] font-bold text-gray-500 hover:text-[#F97316] transition-colors"
                                                                                                            >
                                                                                                                Reply
                                                                                                            </button>
                                                                                                        </div>
                                                                                                    </div>
                                                                                                </div>
                                                                                            ))}
                                                                                        </div>
                                                                                    )}

                                                                                    {/* Inline Reply Input */}
                                                                                    {replyingTo[report.report_id]?.commentId === c.comment_id && (
                                                                                        <div className="mt-4 flex items-center gap-3 relative z-10 animate-in fade-in slide-in-from-top-2 duration-200">
                                                                                            {/* Thread curve for the reply input itself */}
                                                                                            <div className="absolute top-[-10px] left-[-28px] w-[28px] h-[24px] border-b-[2px] border-l-[2px] border-gray-100 rounded-bl-[12px] z-0 pointer-events-none"></div>
                                                                                            {/* Mask to hide vertical line below the inline reply input */}
                                                                                            <div className="absolute top-[14px] bottom-[-100px] left-[-30px] w-[6px] bg-white z-0 pointer-events-none"></div>

                                                                                            <div className="w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center text-[#F97316] font-black text-[10px] shrink-0 border border-orange-200 z-10 bg-white ring-4 ring-white">
                                                                                                {currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : 'U'}
                                                                                            </div>
                                                                                            <div className="flex-1 relative flex items-center">
                                                                                                <input
                                                                                                    type="text"
                                                                                                    autoFocus
                                                                                                    placeholder={`Replying to ${replyingTo[report.report_id]?.userName}...`}
                                                                                                    className="w-full bg-[#FAFAF9] border border-gray-100 rounded-[1.2rem] pl-4 pr-10 py-2 text-[11px] font-semibold text-[#1a1208] focus:outline-none focus:border-orange-200 focus:bg-white transition-all placeholder:text-gray-400 shadow-inner"
                                                                                                    value={commentInputs[report.report_id] || ''}
                                                                                                    onChange={(e) => setCommentInputs(prev => ({ ...prev, [report.report_id]: e.target.value }))}
                                                                                                    onKeyPress={(e) => e.key === 'Enter' && handleAddComment(report.report_id)}
                                                                                                />
                                                                                                <button
                                                                                                    onClick={() => {
                                                                                                        setReplyingTo(prev => ({ ...prev, [report.report_id]: null }));
                                                                                                        setCommentInputs(prev => ({ ...prev, [report.report_id]: '' }));
                                                                                                    }}
                                                                                                    className="absolute right-3 text-gray-400 hover:text-red-500 transition-colors"
                                                                                                >
                                                                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                                                                                    </svg>
                                                                                                </button>
                                                                                            </div>
                                                                                            <button
                                                                                                onClick={() => handleAddComment(report.report_id)}
                                                                                                className="bg-[#F97316] text-white rounded-full w-8 h-8 flex items-center justify-center shadow-md shadow-orange-100 hover:scale-105 active:scale-95 transition-all shrink-0"
                                                                                            >
                                                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 relative left-[1px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                                                                                </svg>
                                                                                            </button>
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })
                                                        ) : (
                                                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest italic text-center py-4">No comments yet. Be the first to comment!</p>
                                                        )}
                                                    </div>
                                                )}


                                                {!replyingTo[report.report_id] && (
                                                    <div className="flex items-center gap-3 animate-in fade-in duration-200">
                                                        <div className="flex-1 relative">
                                                            <input
                                                                type="text"
                                                                placeholder="Write a comment..."
                                                                className="w-full bg-[#FAFAF9] border border-gray-100 rounded-[1.5rem] pl-5 pr-12 py-3 text-xs font-semibold text-[#1a1208] focus:outline-none focus:border-orange-200 focus:bg-white transition-all placeholder:text-gray-300 shadow-inner"
                                                                value={commentInputs[report.report_id] || ''}
                                                                onChange={(e) => setCommentInputs(prev => ({ ...prev, [report.report_id]: e.target.value }))}
                                                                onKeyPress={(e) => e.key === 'Enter' && handleAddComment(report.report_id)}
                                                            />
                                                        </div>
                                                        <button
                                                            onClick={() => handleAddComment(report.report_id)}
                                                            className="bg-[#F97316] text-white rounded-[1.2rem] p-3 shadow-md shadow-orange-100 hover:scale-105 active:scale-95 transition-all flex-shrink-0"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        ))}
                    </div>

                    {/* Right Column: Sidebar (Notifications & Announcements Summary) */}
                    <div className="lg:col-span-4 space-y-6 hidden lg:block">
                        {/* Notifications Card */}
                        <div className="bg-white rounded-[2rem] border border-gray-100 shadow-xl overflow-hidden p-6 sm:p-8 animate-in fade-in slide-in-from-bottom-5 duration-500 h-[450px] flex flex-col">
                            <div className="flex items-center justify-between border-b border-gray-50 pb-4 mb-4">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-xl bg-orange-50 flex items-center justify-center text-[#F97316]">
                                        <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                                        </svg>
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-black uppercase tracking-widest text-[#1a1208]">
                                            Notifications
                                        </h3>
                                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">
                                            {activeNotifications.filter(n => !n.is_read).length} unread
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-3 overflow-y-auto custom-scrollbar pr-1 flex-1">
                                {(() => {
                                    const displayedNotifications = activeNotifications.slice(0, visibleNotifLimit);

                                    if (displayedNotifications.length === 0) {
                                        return (
                                            <div className="text-center py-8">
                                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest italic">
                                                    No notifications
                                                </p>
                                            </div>
                                        );
                                    }

                                    return displayedNotifications.map((notif) => {
                                        const typeStr = (notif.type || '').toLowerCase();
                                        const titleStr = (notif.title || '').toLowerCase();
                                        const msgStr = (notif.message || '').toLowerCase();
                                        const isMatch = typeStr === 'potential_match' ||
                                            typeStr === 'match_review' ||
                                            titleStr.includes('match') ||
                                            titleStr.includes('sighting') ||
                                            msgStr.includes('match') ||
                                            msgStr.includes('potential match') ||
                                            msgStr.includes('matches of your dog');
                                        return (
                                            <div
                                                key={notif.notification_id}
                                                onClick={() => handleNotificationClick(notif)}
                                                className={`relative p-4 rounded-2xl border transition-all duration-300 cursor-pointer hover:border-orange-300 active:scale-[0.99] ${notif.is_read
                                                    ? 'bg-[#FAFAF9]/50 border-gray-50'
                                                    : 'bg-orange-50/20 border-orange-100/50 shadow-sm'
                                                    }`}
                                            >
                                                {/* Unread indicator */}
                                                {!notif.is_read && (
                                                    <span className="absolute top-4 left-4 w-2 h-2 bg-[#F97316] rounded-full" />
                                                )}

                                                <div className={!notif.is_read ? 'pl-4' : ''}>
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="flex-1">
                                                            <h4 className="text-xs font-black text-[#1a1208]">
                                                                {notif.title}
                                                            </h4>
                                                            <p className="text-[11px] font-semibold text-gray-650 mt-1 leading-relaxed">
                                                                {notif.message}
                                                            </p>
                                                            <div className="flex items-center gap-2 mt-2">
                                                                <span className="text-[9px] font-bold text-gray-400 block uppercase tracking-widest">
                                                                    {formatTimestamp(notif.created_at)}
                                                                </span>
                                                                {isMatch && (
                                                                    <span className="text-[8px] font-black text-[#F97316] bg-orange-100/80 px-2 py-0.5 rounded-full uppercase tracking-wider">
                                                                        Review Match →
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-1 shrink-0">
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleDismissNotification(notif.notification_id); }}
                                                                className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600"
                                                                title="Dismiss"
                                                            >
                                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                                                </svg>
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    });
                                })()}
                            </div>

                            {/* Bottom Footer: Mark All Read & View All / View More Notifications */}
                            <div className="pt-3.5 mt-2 border-t border-gray-100/80 flex items-center justify-between shrink-0">
                                <button
                                    onClick={handleMarkAllNotificationsRead}
                                    className="text-xs font-semibold text-gray-500 hover:text-gray-900 underline underline-offset-2 transition-colors cursor-pointer"
                                >
                                    Mark All Read
                                </button>
                                {visibleNotifLimit < activeNotifications.length && (
                                    <button
                                        onClick={() => {
                                            setVisibleNotifLimit(prev => prev + 10);
                                            setHasClickedViewAll(true);
                                        }}
                                        className="text-xs font-bold text-[#F97316] hover:text-orange-600 transition-colors flex items-center gap-1 font-sans cursor-pointer"
                                    >
                                        {hasClickedViewAll ? 'View More Notifications →' : 'View All Notifications →'}
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Announcements Card */}
                        <div className="bg-white rounded-[2rem] border border-gray-100 shadow-xl overflow-hidden p-6 sm:p-8 animate-in fade-in slide-in-from-bottom-5 duration-500 delay-75 h-[450px] flex flex-col">
                            <div className="flex items-center justify-between border-b border-gray-50 pb-4 mb-4">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-xl bg-orange-50 flex items-center justify-center text-[#F97316]">
                                        <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                                        </svg>
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-black uppercase tracking-widest text-[#1a1208]">
                                            Announcements
                                        </h3>
                                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">
                                            Latest bulletins
                                        </p>
                                    </div>
                                </div>
                                {feedTab !== 'announcements' && (
                                    <button
                                        onClick={() => setFeedTab('announcements')}
                                        className="text-[9px] font-black uppercase tracking-widest text-[#F97316] hover:text-orange-600 transition-colors"
                                    >
                                        View All
                                    </button>
                                )}
                            </div>

                            <div className="space-y-4 overflow-y-auto custom-scrollbar pr-1 flex-1">
                                {announcements.length === 0 ? (
                                    <div className="text-center py-8">
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest italic">
                                            No announcements yet
                                        </p>
                                    </div>
                                ) : (
                                    announcements.slice(0, 5).map((ann) => (
                                        <div
                                            key={ann.announcement_id}
                                            onClick={() => {
                                                setFeedTab('announcements');
                                                setTimeout(() => {
                                                    const elem = document.getElementById(`ann-${ann.announcement_id}`);
                                                    if (elem) {
                                                        elem.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                                    }
                                                }, 100);
                                            }}
                                            className="p-4 bg-[#FAFAF9]/40 hover:bg-orange-50/10 border border-gray-50 hover:border-orange-100 rounded-2xl cursor-pointer transition-all duration-300 shadow-sm hover:shadow-md"
                                        >
                                            <div className="flex items-center justify-between mb-1.5">
                                                <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                                                    {ann.category}
                                                </span>
                                                <span className="text-[8px] font-bold text-gray-450 uppercase tracking-widest">
                                                    {formatAnnouncementDate(ann.posted_on).split(' at ')[0]}
                                                </span>
                                            </div>
                                            <h4 className="text-xs font-black text-[#1a1208] mb-1 hover:text-[#F97316] transition-colors">
                                                {ann.title}
                                            </h4>
                                            <p className="text-[10px] font-semibold text-gray-500 line-clamp-2 leading-relaxed">
                                                {ann.content}
                                            </p>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Dashboard content cleared as requested */}
            </main>

            {/* Full-Screen Media Gallery Modal */}
            {activeGallery && (
                <div
                    className="fixed inset-0 z-[9999] bg-[#1a1208]/95 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300"
                    onClick={() => setActiveGallery(null)}
                >
                    {/* Close Button */}
                    <button
                        className="absolute top-8 right-8 bg-white/10 hover:bg-white/20 text-white rounded-full p-3 transition-all z-[10001]"
                        onClick={(e) => { e.stopPropagation(); setActiveGallery(null); }}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>

                    {/* Navigation Arrows */}
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

                        {/* Status Bar */}
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

            {/* Full-Screen Landmark Map Picker Modal */}
            {isMapPickerOpen && (
                <div className="fixed inset-0 z-[500] bg-[#1a1208]/75 backdrop-blur-md flex flex-col items-center justify-center p-2 sm:p-6 animate-in fade-in duration-300">
                    <div className="relative w-full max-w-4xl h-[90vh] bg-white rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col border border-gray-100">
                        {/* Modal Header */}
                        <div className="px-6 py-4 bg-white border-b border-gray-100 flex items-center justify-between z-20 shrink-0">
                            <div>
                                <h3 className="text-lg font-black text-[#1a1208] uppercase tracking-tight flex items-center gap-2">
                                    <span>📍 Pinpoint Landmark & Location</span>
                                </h3>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">
                                    Click anywhere on the map to set pin and auto-fetch landmark API details
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsMapPickerOpen(false)}
                                className="p-2.5 bg-gray-50 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-2xl transition-all"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Interactive Leaflet Map View */}
                        <div className="relative flex-1 w-full overflow-hidden bg-gray-100">
                            <MapContainer
                                center={[formData.latitude, formData.longitude]}
                                zoom={17}
                                className="h-full w-full z-10"
                                scrollWheelZoom={true}
                            >
                                <TileLayer
                                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                />
                                <RecenterMap center={[formData.latitude, formData.longitude]} />
                                <LocationPicker
                                    position={[formData.latitude, formData.longitude]}
                                    onLocationSelect={(lat, lng) => {
                                        setFormData(prev => ({ ...prev, latitude: lat, longitude: lng }));
                                    }}
                                />
                                <Polygon
                                    positions={SELERA_POLYGON.map(p => [p.lat, p.lng] as [number, number])}
                                    pathOptions={{
                                        color: '#F97316',
                                        fillColor: '#F97316',
                                        fillOpacity: 0.1,
                                        weight: 2,
                                        dashArray: '5, 10'
                                    }}
                                />
                                <ReturnToSeleraButton />
                            </MapContainer>

                            {/* Floating Map Hint Overlay */}
                            <div className="absolute top-4 right-4 z-[20] bg-white/95 backdrop-blur-md px-4 py-2 rounded-2xl border border-gray-100 shadow-md pointer-events-none flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-[#F97316] animate-ping" />
                                <p className="text-[10px] font-black text-[#1a1208] uppercase tracking-widest">Click map to pick location & landmark</p>
                            </div>
                        </div>

                        {/* Bottom Action Footer */}
                        <div className="p-5 bg-white border-t border-gray-100 shadow-2xl z-20 shrink-0 space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
                                <div className="sm:col-span-2 space-y-1">
                                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">
                                        Detected Landmark / Place Name
                                    </label>
                                    <input
                                        type="text"
                                        className="w-full bg-[#FAFAF9] border border-gray-200 rounded-xl px-4 py-2.5 text-xs font-bold text-[#1a1208] focus:outline-none focus:border-orange-400 transition-all shadow-inner"
                                        value={tempLandmark}
                                        onChange={(e) => setTempLandmark(e.target.value)}
                                        placeholder="Type or auto-detected landmark (e.g. PEL PHARMA SELERA)..."
                                    />
                                    <p className="text-[9px] font-semibold text-[#F97316] truncate mt-1">
                                        📍 {isGeocoding ? 'Resolving address details...' : (resolvedAddress || 'No address detected')}
                                    </p>
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setFormData(prev => ({ ...prev, landmark: tempLandmark }));
                                            setIsMapPickerOpen(false);
                                        }}
                                        className="w-full py-3.5 px-6 bg-[#F97316] hover:bg-orange-600 active:scale-[0.98] text-white text-xs font-black uppercase tracking-widest rounded-2xl shadow-lg shadow-orange-200 transition-all flex items-center justify-center gap-2 cursor-pointer"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                        Done
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Lost Pet QR Code Lightbox Modal */}
            {activeQrModal && (
                <div 
                    className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
                    onClick={() => setActiveQrModal(null)}
                >
                    <div 
                        className="bg-white rounded-3xl p-6 sm:p-8 max-w-sm w-full shadow-2xl border border-amber-100 animate-in zoom-in-95 duration-200 text-center relative"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            onClick={() => setActiveQrModal(null)}
                            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 hover:text-gray-900 transition-colors"
                        >
                            ✕
                        </button>
                        
                        <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center text-xl font-black mx-auto mb-3">
                            🐾
                        </div>
                        <h3 className="text-base font-black text-gray-900 uppercase tracking-tight mb-0.5">
                            {activeQrModal.petName || 'Registered Pet'}
                        </h3>
                        <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-4">
                            StraySafe Digital QR Tag
                        </p>

                        <div className="p-4 bg-amber-50/50 rounded-2xl border-2 border-dashed border-amber-200 inline-block mb-4">
                            <img
                                src={activeQrModal.url}
                                alt="Pet QR Code"
                                className="w-56 h-56 object-contain rounded-xl shadow-sm bg-white p-2 mx-auto"
                            />
                        </div>

                        {activeQrModal.hash && (
                            <p className="text-xs font-mono font-bold text-gray-600 mb-2">
                                Tag ID: {activeQrModal.hash}
                            </p>
                        )}

                        {activeQrModal.ownerPhone && (
                            <div className="p-3 bg-amber-100/70 rounded-xl text-amber-950 text-xs font-bold mb-4">
                                Owner Hotline: <span className="font-extrabold">{activeQrModal.ownerPhone}</span>
                            </div>
                        )}

                        <p className="text-[10px] text-gray-400 font-medium">
                            Scan this tag with the StraySafe Scanner to verify pet registry and instantly alert the owner.
                        </p>
                    </div>
                </div>
            )}

            <ResiMobileNav
                isNavbarMenuOpen={isNavbarMenuOpen}
                isSearchOpen={isMobileSearchOpen}
                onSearchClick={() => setIsMobileSearchOpen(true)}
                feedTab={feedTab}
                onFeedTabChange={setFeedTab}
                onAddReportClick={() => {
                    setFeedTab('reports');
                    setEditingReportId(null);
                    setFormData(INITIAL_FORM_DATA);
                    setIsAddReportModalOpen(true);
                }}
            />
        </div>
    );
};

export default ResiHomePage;
