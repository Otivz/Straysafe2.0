import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import Button from '../../components/Button';
import CustomRadio from '../../components/CustomRadio';
import ResiNavbar from '../../components/Navbars/ResiNavbar';
import ResiMobileNav from '../../components/Navbars/ResiMobileNav';
import { MapContainer, TileLayer, Marker, useMapEvents, Polygon } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for default marker icon issue in React Leaflet
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIconRetina from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import RescueTimeline from '../../components/RescueTimeline';
import AISuggestionPanel from '../../components/AISuggestionPanel';
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

const categoryMap: Record<number, string> = {
    1: 'Injured Animal',
    2: 'Aggressive Stray',
    3: 'Possible Rabies Risk',
    4: 'Roaming Pack',
    5: 'Animal Rescue Needed'
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

const ResiHomePage = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [isAddReportModalOpen, setIsAddReportModalOpen] = useState(false);
    const [originalData, setOriginalData] = useState<any>(null);
    const [isNavbarMenuOpen, setIsNavbarMenuOpen] = useState(false);
    const [returnUrl, setReturnUrl] = useState<string | null>(null);
    const [viewingDetailedReport, setViewingDetailedReport] = useState<any | null>(null);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [reports, setReports] = useState<any[]>([]);
    const [announcements, setAnnouncements] = useState<any[]>([]);
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
    const [revertAnimalType, setRevertAnimalType] = useState(false);
    const [revertColors, setRevertColors] = useState(false);
    const [revertSize, setRevertSize] = useState(false);
    const [breeds, setBreeds] = useState<string[]>([]);
    const [breedsData, setBreedsData] = useState<any[]>([]);
    const [breedImageUrl, setBreedImageUrl] = useState<string | null>(null);
    const [isFetchingBreedImage, setIsFetchingBreedImage] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    const [formData, setFormData] = useState({
        category: 'Injured Animal',
        category_id: 1,
        animalCount: 1,
        landmark: '',
        visibility: 'Public',
        priorityLevel: 'Regular',
        isPossibleOwned: false,
        animalType: 'Dog',
        animalBreed: '',
        animalColor: '',
        estimatedSize: 'Medium',
        description: '',
        latitude: 14.801313,
        longitude: 121.003109,
        mediaFiles: [] as File[],
        existingMedia: [] as any[],
        mediaIdsToDelete: [] as number[]
    });

    const [resolvedAddress, setResolvedAddress] = useState('');
    const [isGeocoding, setIsGeocoding] = useState(false);

    useEffect(() => {
        if (!isAddReportModalOpen) {
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
                        addressdetails: 1
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
    }, [formData.latitude, formData.longitude, isAddReportModalOpen]);

    const userStr = localStorage.getItem('resident_user');
    const currentUser = userStr ? JSON.parse(userStr) : null;
    const currentUserId = currentUser ? currentUser.user_id : null;

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
            setFormData({
                category: 'Injured Animal', category_id: 1, animalCount: 1, landmark: '',
                visibility: 'Public', priorityLevel: 'Regular', isPossibleOwned: false,
                animalType: 'Dog', animalBreed: '', animalColor: '', estimatedSize: 'Medium',
                description: '', latitude: 14.801313, longitude: 121.003109,
                mediaFiles: [], existingMedia: [], mediaIdsToDelete: []
            });
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
                        const breedList = data.map((b: any) => b.name);
                        const uniqueBreeds = Array.from(new Set(['Aspin', ...breedList]));
                        setBreeds(uniqueBreeds);
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
                        const breedList = data.map((b: any) => b.name);
                        const uniqueBreeds = Array.from(new Set(['Puspin', ...breedList]));
                        setBreeds(uniqueBreeds);
                    } else {
                        throw new Error('API failed');
                    }
                } else {
                    setBreeds([]);
                    setBreedsData([]);
                }
            } catch (err) {
                console.error("Failed to load breed images from API:", err);
                if (formData.animalType === 'Dog') {
                    setBreeds(['Aspin', 'Shih Tzu', 'Shihtzu', 'Pug', 'Golden Retriever', 'German Shepherd', 'Bulldog', 'Beagle', 'Poodle', 'Chihuahua', 'Labrador Retriever']);
                } else if (formData.animalType === 'Cat') {
                    setBreeds(['Puspin', 'Persian', 'Siamese', 'Maine Coon', 'Bengal', 'Ragdoll', 'British Shorthair', 'Sphynx']);
                }
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
            4: 'Roaming Pack', 5: 'Animal Rescue Needed'
        };

        const initialData = {
            category: categoryMap[report.category_id] || 'Injured Animal',
            category_id: report.category_id,
            animalCount: report.animal_count || 1,
            landmark: report.landmark || '',
            visibility: report.visibility || 'Public',
            priorityLevel: report.priority_level || 'Regular',
            isPossibleOwned: report.is_possible_owned || false,
            animalType: report.animal_type || 'Unknown',
            animalBreed: report.animal_breed || '',
            animalColor: report.animal_color || '',
            estimatedSize: report.estimated_size || 'Medium',
            description: report.description || '',
            latitude: parseFloat(report.latitude) || 14.801313,
            longitude: parseFloat(report.longitude) || 121.003109,
            mediaFiles: [],
            existingMedia: report.media || [],
            mediaIdsToDelete: []
        };

        setFormData(initialData);
        setOriginalData(initialData);
        setEditingReportId(report.report_id);
        setIsAddReportModalOpen(true);
        setOpenMenuId(null);
    };

    const handleReset = () => {
        if (originalData) {
            setFormData(originalData);
        }
    };

    const fetchReports = async () => {
        try {
            const response = await fetch('http://localhost:8000/reports/');
            if (response.ok) {
                const data = await response.json();

                // Filter out Private reports that do not belong to the current user
                const visibleReports = data.filter((report: any) => {
                    return report.visibility === 'Public' || report.user_id === currentUserId;
                });

                setReports(visibleReports.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
            }
        } catch (error) {
            console.error('Failed to fetch reports:', error);
        }
    };

    // Fetch a single report fresh from the API (with guaranteed AI suggestion fields)
    const openReportDetail = async (reportId: number, fallback?: any) => {
        try {
            const response = await fetch(`http://localhost:8000/reports/${reportId}`);
            if (response.ok) {
                const freshReport = await response.json();
                setViewingDetailedReport(freshReport);
            } else if (fallback) {
                setViewingDetailedReport(fallback);
            }
        } catch {
            if (fallback) setViewingDetailedReport(fallback);
        }
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

    const formatAnnouncementDate = (raw: string) => {
        const dt = new Date(raw);
        if (Number.isNaN(dt.getTime())) return raw;
        return dt.toLocaleDateString('en-US') + ' • ' + dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    };

    const API_URL = 'http://localhost:8000/reports';

    useEffect(() => {
        fetchReports();
        fetchAnnouncements();
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
        const userColor = formData.animalColor || '';
        const userSize = formData.estimatedSize || 'Medium';

        // Check if there is an inconsistency or missing info (excluding breed)
        const isTypeMismatched = userType !== 'Unknown' && userType !== suggestions.ai_animal_type;
        const isColorMissing = !userColor.trim();

        if (isTypeMismatched || isColorMissing) {
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
                    animalTypeValidation.ai_suggested_priority.includes('Low') ? 'Low' : 'Regular'
            ) : 'Regular';

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
            setFormData({
                category: 'Injured Animal',
                category_id: 1,
                animalCount: 1,
                landmark: '',
                visibility: 'Public',
                priorityLevel: 'Regular',
                isPossibleOwned: false,
                animalType: 'Dog',
                animalBreed: '',
                animalColor: '',
                estimatedSize: 'Medium',
                description: '',
                latitude: 14.801313,
                longitude: 121.003109,
                mediaFiles: [],
                existingMedia: [],
                mediaIdsToDelete: []
            });
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
        setFormData({
            category: 'Injured Animal',
            category_id: 1,
            animalCount: 1,
            landmark: '',
            visibility: 'Public',
            priorityLevel: 'Regular',
            isPossibleOwned: false,
            animalType: 'Dog',
            animalBreed: '',
            animalColor: '',
            estimatedSize: 'Medium',
            description: '',
            latitude: 14.801313,
            longitude: 121.003109,
            mediaFiles: [],
            existingMedia: [],
            mediaIdsToDelete: []
        });
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

            // Mapping frontend state strictly to reports table schema
            const payload = {
                user_id: userId,
                subdivision_id: 1, // Hardcoded for demo/MVP
                category_id: formData.category_id,
                animal_type: formData.animalType,
                animal_breed: formData.animalBreed,
                animal_color: formData.animalColor,
                estimated_size: formData.estimatedSize,
                description: formData.description || 'No description provided.',
                latitude: formData.latitude,
                longitude: formData.longitude,
                animal_count: formData.animalCount,
                landmark: formData.landmark || '',
                priority_level: formData.priorityLevel,
                visibility: formData.visibility,
                is_possible_owned: formData.isPossibleOwned,
                status_id: 1 // Pending Verification
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
                    setFormData({
                        category: 'Injured Animal',
                        category_id: 1,
                        animalCount: 1,
                        landmark: '',
                        visibility: 'Public',
                        priorityLevel: 'Regular',
                        isPossibleOwned: false,
                        animalType: 'Dog',
                        animalBreed: '',
                        animalColor: '',
                        estimatedSize: 'Medium',
                        description: '',
                        latitude: 14.801313,
                        longitude: 121.003109,
                        mediaFiles: [],
                        existingMedia: [],
                        mediaIdsToDelete: []
                    });
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
            4: 'Roaming Pack', 5: 'Animal Rescue Needed'
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

    return (
        <div className="min-h-screen bg-[#F7F7F7] font-sans pb-24">
            <ResiNavbar
                onMenuToggle={(isOpen) => setIsNavbarMenuOpen(isOpen)}
                onSearch={setSearchQuery}
                searchValue={searchQuery}
                isMobileSearchOpen={isMobileSearchOpen}
                onCloseSearch={() => setIsMobileSearchOpen(false)}
                feedTab={feedTab}
                onFeedTabChange={setFeedTab}
            />

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 sm:pt-32 pb-24 md:pb-8">

                {/* Top Actions - Hidden on mobile, shown on desktop */}
                <div className="hidden md:flex items-center justify-between relative mb-6">
                    {/* Left spacer to perfectly center the search bar relative to the page width */}
                    <div className="flex-1"></div>

                    {/* Centered Localized Page Search Input */}
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <svg className="h-4.5 w-4.5 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </div>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={feedTab === 'reports' ? "Search reports..." : "Search announcements..."}
                            className="block w-96 pl-11 pr-4 py-3.5 border border-gray-200 rounded-2xl leading-5 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#F97316]/20 focus:border-[#F97316] transition-all text-xs font-bold text-[#1a1208] shadow-sm"
                        />
                    </div>

                    {/* Add Report Button (Only visible on reports feed, right aligned) */}
                    <div className="flex-1 flex justify-end">
                        {feedTab === 'reports' && (
                            <Button
                                variant="primary"
                                onClick={() => {
                                    setEditingReportId(null);
                                    setFormData({
                                        ...formData,
                                        category: 'Injured Animal',
                                        category_id: 1,
                                        animalCount: 1,
                                        landmark: '',
                                        visibility: 'Public',
                                        priorityLevel: 'Regular',
                                        isPossibleOwned: false,
                                        description: '',
                                        latitude: 14.801313,
                                        longitude: 121.003109,
                                        mediaFiles: [],
                                        existingMedia: [],
                                        mediaIdsToDelete: []
                                    });
                                    setIsAddReportModalOpen(true);
                                }}
                                className="bg-[#F97316] text-white px-8 py-3.5 rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg shadow-orange-200 hover:scale-105 transition-all flex items-center gap-3 border border-orange-500/20"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                                </svg>
                                Add Report
                            </Button>
                        )}
                    </div>
                </div>

                {/* Add Report Modal */}
                {isAddReportModalOpen && (
                    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 pb-28 sm:pb-4">
                        {/* Backdrop */}
                        <div
                            className="absolute inset-0 bg-[#1a1208]/60 backdrop-blur-md animate-in fade-in duration-300"
                            onClick={handleCloseModal}
                        />

                        {/* Modal Content */}
                        <div className="relative w-full max-w-2xl bg-white rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-10 duration-500">
                            {/* Modal Header */}
                            <div className="px-10 pt-10 pb-6 flex justify-between items-center border-b border-gray-50">
                                <div>
                                    <h2 className="text-3xl font-black text-[#1a1208] uppercase tracking-tight">
                                        {editingReportId ? 'Edit Report' : 'Report a Stray'}
                                    </h2>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">
                                        Fill up the details below to help our team
                                    </p>
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

                            <div className="p-10 space-y-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
                                {/* Report Category */}
                                <div>
                                    <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest mb-4 block">Report Category</label>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        {[
                                            { id: 1, label: 'Injured Animal', name: 'Injured Animal' },
                                            { id: 4, label: 'Roaming Pack', name: 'Roaming Pack' },
                                            { id: 2, label: 'Aggressive Stray', name: 'Aggressive Stray' },
                                            { id: 5, label: 'Animal Rescue Needed', name: 'Animal Rescue Needed' }
                                        ].map((cat) => (
                                            <CustomRadio
                                                key={cat.id}
                                                name="category"
                                                label={cat.label}
                                                checked={formData.category_id === cat.id}
                                                onChange={() => setFormData({ ...formData, category: cat.name, category_id: cat.id })}
                                                className={`bg-[#FAFAF9] border rounded-2xl p-4 transition-all hover:border-orange-200 ${
                                                    formData.category_id === cat.id
                                                        ? 'border-[#F97316]/30 bg-orange-50/10 shadow-sm'
                                                        : 'border-gray-50'
                                                }`}
                                            />
                                        ))}
                                    </div>
                                </div>

                                {/* Animal Specifications */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="flex flex-col">
                                        <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest mb-4">Animal Type</label>
                                        <div className="flex items-center gap-6 h-12">
                                            {['Dog', 'Cat'].map((type) => (
                                                <CustomRadio
                                                    key={type}
                                                    name="animalType"
                                                    label={type}
                                                    checked={formData.animalType === type}
                                                    onChange={() => {
                                                        setFormData({ ...formData, animalType: type, animalBreed: '' });
                                                    }}
                                                />
                                            ))}
                                        </div>
                                    </div>

                                    <div className="flex flex-col">
                                        <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest mb-4">Animal Breed</label>
                                        <input
                                            type="text"
                                            list="report-breed-suggestions"
                                            className="w-full h-12 bg-[#FAFAF9] border border-gray-50 rounded-2xl px-6 text-xs font-bold focus:outline-none"
                                            placeholder="Type or select breed..."
                                            value={formData.animalBreed}
                                            onChange={(e) => setFormData({ ...formData, animalBreed: e.target.value })}
                                        />
                                        <datalist id="report-breed-suggestions">
                                            {breeds.map((breed, idx) => (
                                                <option key={`${breed}-${idx}`} value={breed} />
                                            ))}
                                            {formData.animalType === 'Dog' ? (
                                                <>
                                                    <option value="Aspin" />
                                                    <option value="Shih Tzu" />
                                                    <option value="Shihtzu" />
                                                </>
                                            ) : (
                                                <>
                                                    <option value="Puspin" />
                                                    <option value="Siamese" />
                                                    <option value="Persian" />
                                                </>
                                            )}
                                            <option value="Other" />
                                        </datalist>

                                         {/* Dynamic Breed Thumbnail Preview */}
                                         {(() => {
                                             const query = formData.animalBreed.trim().toLowerCase();
                                             if (!query) return null;

                                             // Standardize common phonetic typos and shortcuts
                                             const normalizedQuery = query
                                                 .replace('dalmation', 'dalmatian')
                                                 .replace('shihtzu', 'shih tzu')
                                                 .replace('shepard', 'shepherd')
                                                 .replace('coly', 'collie');

                                             const matchedBreed = breedsData.find((b) => {
                                                 const breedName = b.name.toLowerCase();
                                                 if (breedName === normalizedQuery) return true;
                                                 
                                                 // Handle smart partial matching when typing is at least 3 characters
                                                 if (normalizedQuery.length >= 3) {
                                                     return breedName.includes(normalizedQuery) || normalizedQuery.includes(breedName);
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

                                    <div className="flex flex-col">
                                        <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest mb-4">Animal Color</label>
                                        <input
                                            type="text"
                                            placeholder="e.g. Brown and White, Black"
                                            className="w-full h-12 bg-[#FAFAF9] border border-gray-50 rounded-2xl px-6 text-xs font-bold"
                                            value={formData.animalColor}
                                            onChange={(e) => setFormData({ ...formData, animalColor: e.target.value })}
                                                                                    />
                                    </div>

                                    <div className="flex flex-col">
                                        <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest mb-4">Estimated Size</label>
                                        <select
                                            className="w-full h-12 bg-[#FAFAF9] border border-gray-50 rounded-2xl px-6 text-xs font-bold focus:outline-none"
                                            value={formData.estimatedSize}
                                            onChange={(e) => setFormData({ ...formData, estimatedSize: e.target.value })}
                                                                                    >
                                            <option value="Small">Small (Puppy/Kitten size)</option>
                                            <option value="Medium">Medium (Regular size)</option>
                                            <option value="Large">Large (Giant breed size)</option>
                                        </select>
                                    </div>
                                </div>

                                {/* Priority Level Selection */}
                                <div>
                                    <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest mb-4 block">Priority Level</label>
                                    <div className="flex flex-wrap gap-3">
                                        {['Low', 'Regular', 'High'].map((prio) => (
                                            <button
                                                key={prio}
                                                type="button"
                                                                                                onClick={() => setFormData({ ...formData, priorityLevel: prio })}
                                                className={`px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${formData.priorityLevel === prio
                                                    ? 'bg-[#F97316] text-white border-[#F97316] shadow-lg shadow-orange-100'
                                                    : `bg-white text-gray-400 border-gray-100 hover:border-orange-100`
                                                    } `}
                                            >
                                                {prio}
                                            </button>
                                        ))}
                                    </div>
                                </div>



                                {/* Consolidated Media Upload */}
                                <div className="md:col-span-2">
                                    <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest mb-4 block">Upload Photos or Videos</label>
                                    <div className="relative">
                                        {allMediaCount > 0 ? (
                                            <div className="space-y-4">
                                                {/* Grid Preview (Facebook-like) */}
                                                <div
                                                    className={`relative grid gap-2 rounded-[2rem] overflow-hidden border-2 border-orange-500 bg-orange-50/10 p-2 cursor-pointer group/grid ${allMediaCount === 1 ? 'grid-cols-1' :
                                                        allMediaCount === 2 ? 'grid-cols-2' :
                                                            'grid-cols-2'
                                                        }`}
                                                    onClick={() => document.getElementById('multi-upload')?.click()}
                                                >
                                                    {/* Render Existing Media */}
                                                    {formData.existingMedia.map((media, index) => (
                                                        <div key={`exist-${media.media_id}`} className={`relative aspect-square rounded-2xl overflow-hidden group/item ${allMediaCount === 3 && index === 0 ? 'row-span-2 aspect-auto' : ''}`}>
                                                            {media.media_type === 'Video' ? (
                                                                <video src={media.file_url} className="w-full h-full object-cover" />
                                                            ) : (
                                                                <img src={media.file_url} alt="Existing" className="w-full h-full object-cover" />
                                                            )}
                                                            {(
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        const newExisting = formData.existingMedia.filter(m => m.media_id !== media.media_id);
                                                                        setFormData({
                                                                            ...formData,
                                                                            existingMedia: newExisting,
                                                                            mediaIdsToDelete: [...formData.mediaIdsToDelete, media.media_id]
                                                                        });
                                                                    }}
                                                                    className="absolute top-2 right-2 bg-black/60 hover:bg-red-500 text-white rounded-full p-1.5 opacity-0 group-hover/item:opacity-100 transition-all z-[30] flex items-center justify-center"
                                                                    title="Remove existing media"
                                                                >
                                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                                                                    </svg>
                                                                </button>
                                                            )}
                                                            <div className="absolute top-2 left-2 bg-black/40 px-2 py-0.5 rounded text-[8px] font-black text-white uppercase tracking-widest">Stored</div>
                                                        </div>
                                                    ))}

                                                    {/* Render New Media Files */}
                                                    {formData.mediaFiles.map((file, index) => (
                                                        <div key={`new-${index}`} className={`relative aspect-square rounded-2xl overflow-hidden group/item ${allMediaCount === 3 && (index + formData.existingMedia.length) === 0 ? 'row-span-2 aspect-auto' : ''}`}>
                                                            {file.type.startsWith('video/') ? (
                                                                <video src={URL.createObjectURL(file)} className="w-full h-full object-cover" />
                                                            ) : (
                                                                <img src={URL.createObjectURL(file)} alt="Preview" className="w-full h-full object-cover" />
                                                            )}
                                                            {(
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        const newFiles = [...formData.mediaFiles];
                                                                        newFiles.splice(index, 1);
                                                                        setFormData({ ...formData, mediaFiles: newFiles });
                                                                    }}
                                                                    className="absolute top-2 right-2 bg-black/60 hover:bg-red-500 text-white rounded-full p-1.5 opacity-0 group-hover/item:opacity-100 transition-all z-[30] flex items-center justify-center"
                                                                    title="Remove new file"
                                                                >
                                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                                                                    </svg>
                                                                </button>
                                                            )}
                                                            <div className="absolute top-2 left-2 bg-[#F97316] px-2 py-0.5 rounded text-[8px] font-black text-white uppercase tracking-widest">New</div>
                                                        </div>
                                                    ))}

                                                    {/* Hover Add More Overlay (Only in Edit mode) */}
                                                    {(
                                                        <div className="absolute inset-0 bg-orange-600/20 backdrop-blur-[2px] opacity-0 group-hover/grid:opacity-100 transition-all flex flex-col items-center justify-center gap-2 z-20">
                                                            <div className="w-12 h-12 rounded-full bg-white shadow-xl flex items-center justify-center text-[#F97316]">
                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                                                                </svg>
                                                            </div>
                                                            <span className="text-[10px] font-black text-white uppercase tracking-[0.2em] drop-shadow-md">Add More Media</span>
                                                        </div>
                                                    )}
                                                </div>

                                                {(
                                                    <div className="flex justify-end">
                                                        <button
                                                            type="button"
                                                            onClick={() => setFormData({ ...formData, mediaFiles: [] })}
                                                            className="text-[10px] font-black text-red-400 uppercase tracking-widest hover:text-red-600 transition-all py-1"
                                                        >
                                                            Clear New Selection
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div
                                                className={`w-full aspect-video rounded-[2rem] border-2 border-dashed border-gray-100 bg-[#FAFAF9] flex flex-col items-center justify-center gap-4 transition-all group cursor-pointer hover:border-orange-200 hover:bg-orange-50/10`}
                                                onClick={() => document.getElementById('multi-upload')?.click()}
                                            >
                                                <div className={`w-16 h-16 rounded-[1.5rem] bg-white shadow-sm flex items-center justify-center text-gray-300 transition-colors group-hover:text-[#F97316]`}>
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                                    </svg>
                                                </div>
                                                <div className="text-center">
                                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                                        Tap to add Photos or Videos
                                                    </p>
                                                    <p className="text-[9px] font-bold text-gray-300 uppercase tracking-widest mt-1">Multiple files supported</p>
                                                </div>
                                            </div>
                                        )}
                                        <input
                                            id="multi-upload"
                                            type="file"
                                            className="hidden"
                                            accept="image/*,video/*"
                                            multiple
                                            onChange={(e) => {
                                                const files = Array.from(e.target.files || []);
                                                const MAX_SIZE = 10 * 1024 * 1024; // 10MB
                                                const oversized = files.filter(f => f.size > MAX_SIZE);

                                                if (oversized.length > 0) {
                                                    alert(`File(s) too large: ${oversized.map(f => f.name).join(', ')}. Max size is 10MB.`);
                                                    return;
                                                }

                                                setFormData(prev => ({
                                                    ...prev,
                                                    mediaFiles: [...prev.mediaFiles, ...files]
                                                }));
                                            }}
                                        />
                                    </div>
                                </div>

                                {/* Interactive Map Picker */}
                                <div>
                                    <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest mb-4 block">Pinpoint Location</label>
                                    <div className="w-full h-64 rounded-[2rem] overflow-visible border-2 border-gray-50 shadow-sm relative group mb-6">
                                        <MapContainer
                                            center={[formData.latitude, formData.longitude]}
                                            zoom={15}
                                            className="h-full w-full z-10"
                                            scrollWheelZoom={true}
                                        >
                                            <TileLayer
                                                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                                                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                            />
                                            <LocationPicker
                                                position={[formData.latitude, formData.longitude]}
                                                onLocationSelect={(lat, lng) => setFormData({ ...formData, latitude: lat, longitude: lng })}
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
                                        <div className="absolute top-4 right-4 z-[20] bg-white/90 backdrop-blur-sm px-4 py-2 rounded-xl border border-gray-100 shadow-sm pointer-events-none">
                                            <p className="text-[9px] font-black text-[#F97316] uppercase tracking-widest">Click map to move pin</p>
                                        </div>
                                    </div>

                                    {/* Resolved Address directly under map */}
                                    <div className="w-full">
                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">Street Address</label>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                className={`w-full bg-[#FAFAF9] border border-gray-50 rounded-2xl px-5 py-3 text-[11px] font-bold text-[#F97316] shadow-sm pr-10 transition-opacity duration-200 ${isGeocoding ? 'opacity-60' : ''}`}
                                                value={resolvedAddress || (isGeocoding ? 'Resolving street address...' : 'Loading address...')}
                                                readOnly
                                            />
                                            {isGeocoding && (
                                                <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center justify-center">
                                                    <svg className="animate-spin h-4 w-4 text-[#F97316]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                    </svg>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Nearby Landmark */}
                                <div>
                                    <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest mb-4 block">Nearby Landmark (e.g., Blue Gate, Sari-sari Store)</label>
                                    <input
                                        type="text"
                                        placeholder="Add a landmark to help responders find the exact spot..."
                                        className="w-full bg-[#FAFAF9] border border-gray-50 rounded-[1.5rem] px-6 py-4 text-xs font-medium text-[#1a1208] focus:outline-none focus:border-orange-200 transition-all placeholder:text-gray-300 shadow-sm"
                                        value={formData.landmark}
                                        onChange={(e) => setFormData({ ...formData, landmark: e.target.value })}
                                                                            />
                                </div>

                                {/* Visibility Settings */}
                                <div>
                                    <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest mb-4 block">Report Visibility</label>
                                    <select
                                        className="w-full h-12 bg-[#FAFAF9] border border-gray-50 rounded-2xl px-6 text-xs font-bold focus:outline-none"
                                        value={formData.visibility}
                                        onChange={(e) => setFormData({ ...formData, visibility: e.target.value })}
                                    >
                                        <option value="Public">Public (Visible to all users in the subdivision feed)</option>
                                        <option value="Private">Private (Only visible to Admin, Subdivision Leader, and Barangay Staff)</option>
                                    </select>
                                </div>

                                {/* Description at the bottom */}
                                <div>
                                    <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest mb-4 block">Description</label>
                                    <textarea
                                        placeholder="Provide more details (e.g., color, behavior, specific location)..."
                                        rows={4}
                                        className="w-full bg-[#FAFAF9] border border-gray-50 rounded-[2rem] p-6 text-sm font-medium focus:outline-none focus:border-orange-200 transition-all placeholder:text-gray-300 shadow-sm"
                                        value={formData.description}
                                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                                                            />
                                </div>
                            </div>

                            {/* Modal Footer */}
                            <div className="p-10 pt-0 flex flex-col gap-4">
                                <>
                                    <Button
                                        disabled={isSubmitting}
                                        className={`w-full py-5 text-white text-[12px] font-black uppercase tracking-[0.2em] rounded-[2rem] shadow-xl transition-all ${isSubmitting ? 'bg-gray-400 cursor-not-allowed' : 'bg-[#F97316] shadow-orange-100 hover:scale-[1.02] active:scale-[0.98]'
                                            }`}
                                        onClick={handleSubmit}
                                    >
                                        {isSubmitting ? (
                                            <span className="flex items-center justify-center gap-2">
                                                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                </svg>
                                                Processing...
                                            </span>
                                        ) : editingReportId ? 'Update Report' : 'Submit Report'}
                                    </Button>
                                    {editingReportId && (
                                        <button
                                            type="button"
                                            onClick={handleReset}
                                            className="w-full py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-[#F97316] transition-all"
                                        >
                                            Reset Changes
                                        </button>
                                    )}
                                </>
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
                                {filteredAnnouncements.map((ann) => {
                                    const cover = ann.media?.find((m: any) => m.media_type === 'Image')?.file_url || ann.media?.[0]?.file_url;
                                    return (
                                        <div
                                            key={ann.announcement_id}
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
                                                {cover && ann.media?.[0]?.media_type === 'Image' && (
                                                    <img src={cover} alt={ann.title} className="w-full h-48 object-cover rounded-2xl border border-gray-100 mb-4" />
                                                )}
                                                
                                                {(ann.media || []).length > 0 && (ann.media[0]?.media_type !== 'Image' || ann.media.length > 1) && (
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                                                        {ann.media.map((media: any, idx: number) => {
                                                            if (idx === 0 && media.media_type === 'Image') return null; // already rendered as cover
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
                                                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shadow-sm ${
                                                            ann.reactions?.some((r: any) => r.user_id === currentUserId)
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
                                                                                    {c.user_photo ? (
                                                                                        <img src={c.user_photo} className="w-8 h-8 rounded-full object-cover z-10 ring-4 ring-white border border-gray-100 shadow-sm" alt={c.user_name} />
                                                                                    ) : (
                                                                                        <div className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center text-[#F97316] font-black text-xs z-10 ring-4 ring-white border border-orange-100">
                                                                                            {c.user_name ? c.user_name.charAt(0).toUpperCase() : 'U'}
                                                                                        </div>
                                                                                    )}
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
                                                                                                    {reply.user_photo ? (
                                                                                                        <img src={reply.user_photo} className="w-6 h-6 rounded-full object-cover z-10 mt-1 ring-4 ring-white border border-gray-100 shadow-sm shrink-0" alt={reply.user_name} />
                                                                                                    ) : (
                                                                                                        <div className="w-6 h-6 rounded-full bg-gray-50 flex items-center justify-center text-gray-500 font-bold text-[10px] z-10 mt-1 ring-4 ring-white border border-gray-100 shrink-0">
                                                                                                            {reply.user_name ? reply.user_name.charAt(0).toUpperCase() : 'U'}
                                                                                                        </div>
                                                                                                    )}

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
                        const date = new Date(report.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

                        return (
                            <div key={report.report_id} className="max-w-3xl mx-auto">
                                <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-xl overflow-hidden mb-12 hover:shadow-2xl transition-all duration-300">
                                    {/* Top Thin Bar: Date (Left) + ID (Right) */}
                                    <div className="px-4 sm:px-8 py-2.5 border-b border-gray-50 flex items-center justify-between bg-gray-50/20">
                                        <p className="text-[9px] sm:text-[10px] font-black text-gray-400 uppercase tracking-widest">{date}</p>
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
                                        {/* Profile & Visibility Row */}
                                        <div className="mb-6 flex items-center justify-between">
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
                                                    <div className="flex items-center gap-2 px-2 py-0.5 bg-[#FAFAF9] border border-gray-100 rounded-md w-fit">
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

                                        {/* Description */}
                                        <div className="mb-4">
                                            <p className="text-[13px] sm:text-[15px] font-medium text-[#4a3b28] leading-relaxed">
                                                {report.description || 'No detailed description provided.'}
                                            </p>
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
                                                                            {c.user_photo ? (
                                                                                <img src={c.user_photo} className="w-8 h-8 rounded-full object-cover z-10 ring-4 ring-white border border-gray-100 shadow-sm" alt={c.user_name} />
                                                                            ) : (
                                                                                <div className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center text-[#F97316] font-black text-xs z-10 ring-4 ring-white border border-orange-100">
                                                                                    {c.user_name.charAt(0).toUpperCase()}
                                                                                </div>
                                                                            )}
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
                                                                                            {reply.user_photo ? (
                                                                                                <img src={reply.user_photo} className="w-6 h-6 rounded-full object-cover z-10 mt-1 ring-4 ring-white border border-gray-100 shadow-sm shrink-0" alt={reply.user_name} />
                                                                                            ) : (
                                                                                                <div className="w-6 h-6 rounded-full bg-gray-50 flex items-center justify-center text-gray-500 font-bold text-[10px] z-10 mt-1 ring-4 ring-white border border-gray-100 shrink-0">
                                                                                                    {reply.user_name.charAt(0).toUpperCase()}
                                                                                                </div>
                                                                                            )}

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
            {/* Detailed Report View Modal */}
            {viewingDetailedReport && (
                <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 pb-28 sm:pb-4">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-[#1a1208]/80 backdrop-blur-xl animate-in fade-in duration-500"
                        onClick={() => setViewingDetailedReport(null)}
                    />

                    {/* Modal Content */}
                    <div className="relative w-full max-w-2xl bg-[#FBFBFB] rounded-[2.5rem] sm:rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-10 duration-700 flex flex-col max-h-[85vh]">
                        {/* Header */}
                        <div className="px-6 sm:px-10 py-6 sm:py-8 bg-white border-b border-gray-100 flex justify-between items-center shrink-0">
                            <div className="flex items-center gap-4 sm:gap-6">
                                <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl sm:rounded-[2rem] bg-orange-50 flex items-center justify-center text-orange-600 shadow-sm border border-orange-100">
                                    <svg className="w-6 h-6 sm:w-8 sm:h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                                </div>
                                <div>
                                    <h2 className="text-lg sm:text-2xl font-black text-gray-900 uppercase tracking-tight">Rescue Case Intelligence</h2>
                                    <div className="flex items-center gap-3 mt-1">
                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Report ID: #STR-{(viewingDetailedReport.report_id || 0).toString().padStart(4, '0')}</span>
                                        <div className="w-1 h-1 rounded-full bg-gray-200" />
                                        <span className="text-[10px] font-black text-orange-600 uppercase tracking-widest">{categoryMap[viewingDetailedReport.category_id]}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                {viewingDetailedReport.user_id === currentUserId && viewingDetailedReport.status_id === 1 && (
                                    <button
                                        onClick={() => {
                                            handleEditClick(viewingDetailedReport);
                                            setViewingDetailedReport(null);
                                        }}
                                        className="px-4 sm:px-6 py-2.5 sm:py-3.5 bg-[#F97316] text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-[#EA580C] transition-all flex items-center gap-2 shadow-lg shadow-orange-100 cursor-pointer"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                        </svg>
                                        Edit Details
                                    </button>
                                )}
                                <button
                                    onClick={() => setViewingDetailedReport(null)}
                                    className="p-2.5 sm:p-4 bg-gray-50 text-gray-400 hover:text-gray-900 rounded-2xl transition-all"
                                >
                                    <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </div>
                        </div>

                        {/* Scrollable Body */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 sm:p-10">
                            <div className="grid grid-cols-1 gap-10">
                                {/* Left Side: Report Details */}
                                <div className="space-y-10">
                                    {/* Main Image */}
                                    <div className="aspect-[4/3] rounded-[2.5rem] overflow-hidden border-4 border-white shadow-xl">
                                        {(() => {
                                            const originalMedia = viewingDetailedReport.media?.filter((m: any) => !m.is_evidence) || [];
                                            return (
                                                <img
                                                    src={originalMedia[0]?.file_url || 'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?q=80&w=2069&auto=format&fit=crop'}
                                                    className="w-full h-full object-cover"
                                                    alt="Animal sighting"
                                                />
                                            );
                                        })()}
                                    </div>

                                    {/* Stats Grid */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-white p-6 rounded-3xl border border-gray-100">
                                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Status</p>
                                            <p className="text-sm font-black text-orange-600 uppercase">{reportStatusMap[viewingDetailedReport.status_id]}</p>
                                        </div>
                                        <div className="bg-white p-6 rounded-3xl border border-gray-100">
                                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Date Reported</p>
                                            <p className="text-sm font-black text-gray-900 uppercase">{new Date(viewingDetailedReport.created_at).toLocaleDateString()}</p>
                                        </div>
                                        {!(viewingDetailedReport.ai_animal_type && viewingDetailedReport.ai_animal_type.toLowerCase() === viewingDetailedReport.animal_type?.toLowerCase()) && (
                                            <div className="bg-white p-6 rounded-3xl border border-gray-100">
                                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Animal Type</p>
                                                <p className="text-sm font-black text-gray-900 uppercase">{viewingDetailedReport.animal_type}</p>
                                            </div>
                                        )}
                                        {!(viewingDetailedReport.ai_suggested_priority &&
                                            ((p1, p2) => p1.toLowerCase().replace('priority', '').replace('level', '').trim() === p2.toLowerCase().replace('priority', '').replace('level', '').trim())(viewingDetailedReport.ai_suggested_priority, viewingDetailedReport.priority_level)) && (
                                                <div className="bg-white p-6 rounded-3xl border border-gray-100">
                                                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Priority</p>
                                                    <p className="text-sm font-black text-red-600 uppercase">{viewingDetailedReport.priority_level}</p>
                                                </div>
                                            )}
                                    </div>

                                    {/* AI Suggestion Panel */}
                                    <AISuggestionPanel
                                        animalType={viewingDetailedReport.ai_animal_type}
                                        dominantColor={viewingDetailedReport.ai_dominant_color}
                                        estimatedSize={viewingDetailedReport.ai_estimated_size}
                                        suggestedRiskLevel={viewingDetailedReport.ai_suggested_risk_level}
                                        suggestedPriority={viewingDetailedReport.ai_suggested_priority}
                                        possibleBreed={viewingDetailedReport.ai_possible_breed}
                                    />

                                    {/* Subject Identification */}
                                    {(() => {
                                        const hasAIData = !!(viewingDetailedReport.ai_animal_type || viewingDetailedReport.ai_dominant_color || viewingDetailedReport.ai_estimated_size);
                                        const showBreed = !!(viewingDetailedReport.animal_breed &&
                                            viewingDetailedReport.animal_breed.toLowerCase() !== 'unknown' &&
                                            viewingDetailedReport.animal_breed.toLowerCase() !== 'not specified');
                                        const showColor = !!(viewingDetailedReport.animal_color &&
                                            viewingDetailedReport.animal_color.toLowerCase() !== 'unknown' &&
                                            (!viewingDetailedReport.ai_dominant_color ||
                                                viewingDetailedReport.animal_color.toLowerCase() !== viewingDetailedReport.ai_dominant_color.toLowerCase()));
                                        const showSize = !!(viewingDetailedReport.estimated_size &&
                                            (!viewingDetailedReport.ai_estimated_size ||
                                                viewingDetailedReport.estimated_size.toLowerCase() !== viewingDetailedReport.ai_estimated_size.toLowerCase()));
                                        const showSubjectIdCard = !hasAIData || showBreed || showColor || showSize;

                                        if (!showSubjectIdCard) return null;
                                        return (
                                            <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100">
                                                <h4 className="text-[10px] font-black text-gray-900 uppercase tracking-[0.2em] mb-6">Subject Identification</h4>
                                                <div className="space-y-4">
                                                    {(!hasAIData || showBreed) && (
                                                        <div className="flex justify-between items-center py-2 border-b border-gray-50">
                                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Breed / Variety</span>
                                                            <span className="text-xs font-black text-gray-900 uppercase">{viewingDetailedReport.animal_breed || 'Unknown'}</span>
                                                        </div>
                                                    )}
                                                    {(!hasAIData || showColor) && (
                                                        <div className="flex justify-between items-center py-2 border-b border-gray-50">
                                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Coat Color</span>
                                                            <span className="text-xs font-black text-gray-900 uppercase">{viewingDetailedReport.animal_color || 'Unknown'}</span>
                                                        </div>
                                                    )}
                                                    {(!hasAIData || showSize) && (
                                                        <div className="flex justify-between items-center py-2">
                                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Estimated Size</span>
                                                            <span className="text-xs font-black text-gray-900 uppercase">{viewingDetailedReport.estimated_size || 'Medium'}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })()}


                                    {/* Endorsement Letter / Evidence Files */}
                                    {(() => {
                                        const evidenceFiles = viewingDetailedReport.media?.filter((m: any) => m.is_evidence) || [];
                                        if (evidenceFiles.length === 0) return null;
                                        return (
                                            <div className="bg-white p-8 rounded-[2.5rem] border border-orange-100">
                                                <h4 className="text-[10px] font-black text-orange-600 uppercase tracking-[0.2em] mb-5">Endorsement Letter / Evidence</h4>
                                                <div className="space-y-3">
                                                    {evidenceFiles.map((m: any, idx: number) => {
                                                        const url: string = m.file_url || '';
                                                        const urlLower = url.toLowerCase();
                                                        const isDoc = urlLower.endsWith('.pdf') || urlLower.endsWith('.doc') || urlLower.endsWith('.docx');
                                                        const isImg = m.media_type === 'Image' || (!isDoc && (urlLower.endsWith('.jpg') || urlLower.endsWith('.jpeg') || urlLower.endsWith('.png') || urlLower.endsWith('.webp')));
                                                        return (
                                                            <div key={m.media_id}>
                                                                {isImg ? (
                                                                    <a href={url} target="_blank" rel="noopener noreferrer" className="block rounded-2xl overflow-hidden border border-orange-50 hover:opacity-90 transition-opacity shadow-sm">
                                                                        <img src={url} className="w-full max-h-64 object-cover" alt={`Endorsement ${idx + 1}`} />
                                                                    </a>
                                                                ) : (
                                                                    <a
                                                                        href={url}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="flex items-center gap-4 p-5 bg-orange-50/60 rounded-2xl border border-orange-100 hover:bg-orange-50 transition-all group"
                                                                    >
                                                                        <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center text-orange-600 shrink-0 group-hover:bg-orange-200 transition-colors">
                                                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                                            </svg>
                                                                        </div>
                                                                        <div className="flex-1 min-w-0">
                                                                            <p className="text-[10px] font-black text-orange-600 uppercase tracking-widest mb-0.5">Official Document</p>
                                                                            <p className="text-xs font-bold text-gray-700 truncate">{url.split('/').pop()}</p>
                                                                        </div>
                                                                        <svg className="w-4 h-4 text-orange-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                                                        </svg>
                                                                    </a>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    {/* Location Card */}
                                    <div className="bg-gray-900 text-white p-8 rounded-[2.5rem] shadow-xl relative overflow-hidden group">
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-700" />
                                        <div className="relative z-10">
                                            <h4 className="text-[10px] font-black text-orange-400 uppercase tracking-[0.2em] mb-4">Location Intelligence</h4>
                                            <div className="flex items-start gap-4 mb-6">
                                                <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-orange-400">
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                                </div>
                                                <div>
                                                    <p className="text-sm font-black tracking-tight">{viewingDetailedReport.landmark || 'No landmark specified'}</p>
                                                    <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest mt-1">Santa Maria, Bulacan • Selera Homes</p>
                                                </div>
                                            </div>
                                            <div className="w-full h-40 rounded-2xl overflow-hidden border border-white/10 grayscale-[0.5] hover:grayscale-0 transition-all duration-500">
                                                <MapContainer center={[viewingDetailedReport.latitude, viewingDetailedReport.longitude]} zoom={16} className="h-full w-full">
                                                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                                                    <Marker position={[viewingDetailedReport.latitude, viewingDetailedReport.longitude]} />
                                                    <ReturnToSeleraButton />
                                                </MapContainer>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Right Side: Timeline */}
                                <div className="space-y-8 pt-8 border-t border-gray-100">
                                    <div className="flex items-end justify-between px-2">
                                        <div>
                                            <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">Rescue Timeline</h3>
                                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Live updates from our barangay responders</p>
                                        </div>
                                        <div className="flex items-center gap-2 px-4 py-2 bg-green-50 rounded-full border border-green-100">
                                            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                            <span className="text-[9px] font-black text-green-600 uppercase tracking-widest">Live Syncing</span>
                                        </div>
                                    </div>

                                    {/* Case Description */}
                                    {viewingDetailedReport.description && (
                                        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                                            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3">Case Description</h4>
                                            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                                                "{viewingDetailedReport.description}"
                                            </p>
                                        </div>
                                    )}

                                    {/* The Timeline Component */}
                                    <RescueTimeline
                                        history={viewingDetailedReport.history || []}
                                        currentStatusId={viewingDetailedReport.status_id}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="px-6 sm:px-10 py-4 sm:py-6 bg-white border-t border-gray-100 flex justify-between items-center shrink-0">
                            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-[0.2em]">© 2026 STRAYSAFE MISSION CONTROL</p>
                            <button
                                onClick={() => setViewingDetailedReport(null)}
                                className="px-6 sm:px-8 py-2.5 sm:py-3 bg-[#F97316] text-[#FAFAF9] rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-[#EA580C] transition-all border border-orange-500/20 shadow-sm"
                            >
                                Close Intelligence View
                            </button>
                        </div>
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
                    setFormData({
                        category: 'Injured Animal',
                        category_id: 1,
                        animalCount: 1,
                        landmark: '',
                        visibility: 'Public',
                        priorityLevel: 'Regular',
                        isPossibleOwned: false,
                        animalType: 'Dog',
                        animalBreed: '',
                        animalColor: '',
                        estimatedSize: 'Medium',
                        description: '',
                        latitude: 14.801313,
                        longitude: 121.003109,
                        mediaFiles: [],
                        existingMedia: [],
                        mediaIdsToDelete: []
                    });
                    setIsAddReportModalOpen(true);
                }}
            />
        </div>
    );
};

export default ResiHomePage;
