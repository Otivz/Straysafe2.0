import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import Button from '../../components/Button';
import CustomRadio, { RadioCircle } from '../../components/CustomRadio';
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
    const [isViewMode, setIsViewMode] = useState(false);
    const [originalData, setOriginalData] = useState<any>(null);
    const [isNavbarMenuOpen, setIsNavbarMenuOpen] = useState(false);
    const [returnUrl, setReturnUrl] = useState<string | null>(null);
    const [viewingDetailedReport, setViewingDetailedReport] = useState<any | null>(null);

    useEffect(() => {
        if (location.state?.from) {
            setReturnUrl(location.state.from);
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
            handleEditClick(location.state.editReport, location.state.isViewMode);
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

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [reports, setReports] = useState<any[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);

    const userStr = localStorage.getItem('resident_user');
    const currentUser = userStr ? JSON.parse(userStr) : null;
    const currentUserId = currentUser ? currentUser.user_id : null;

    const [commentInputs, setCommentInputs] = useState<Record<number, string>>({});
    const [replyingTo, setReplyingTo] = useState<Record<number, { commentId: number, userName: string } | null>>({});
    const [expandedComments, setExpandedComments] = useState<Record<number, boolean>>({});

    const [openMenuId, setOpenMenuId] = useState<number | null>(null);
    const [editingReportId, setEditingReportId] = useState<number | null>(null);
    const [activeGallery, setActiveGallery] = useState<{ media: any[], index: number } | null>(null);
    const [selectedStage, setSelectedStage] = useState<Record<number, number | null>>({});
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setOpenMenuId(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

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

    const handleEditClick = (report: any, viewMode: boolean = false) => {
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
        setIsViewMode(viewMode);
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

    const API_URL = 'http://localhost:8000/reports';

    useEffect(() => {
        fetchReports();
    }, []);

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

                // Upload media if present
                if (formData.mediaFiles && formData.mediaFiles.length > 0) {
                    let failCount = 0;
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
                            await axios.post(`${API_URL}/${actualReportId}/media`, mediaData, {
                                headers: { 'Content-Type': 'multipart/form-data' }
                            });
                        } catch (err: any) {
                            const errorMsg = err.response?.data?.detail || err.message;
                            console.error('Failed to upload media:', errorMsg);
                            failCount++;
                        }
                    }

                    if (failCount > 0) {
                        alert(`${failCount} media files failed to upload. The report was saved otherwise.`);
                    }
                }

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

    return (
        <div className="min-h-screen bg-[#F7F7F7] font-sans pb-24">
            <ResiNavbar
                onMenuToggle={(isOpen) => setIsNavbarMenuOpen(isOpen)}
                onSearch={setSearchQuery}
                searchValue={searchQuery}
                isMobileSearchOpen={isMobileSearchOpen}
                onCloseSearch={() => setIsMobileSearchOpen(false)}
            />

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 sm:pt-32 pb-24 sm:pb-8">

                {/* Top Actions - Hidden on mobile, shown on desktop */}
                <div className="hidden sm:flex justify-end items-center mb-10">
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
                        className="bg-[#F97316] text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg shadow-orange-200 hover:scale-105 transition-all flex items-center gap-3"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                        </svg>
                        Add Report
                    </Button>
                </div>

                {/* Add Report Modal */}
                {isAddReportModalOpen && (
                    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
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
                                        {isViewMode ? 'View Report' : editingReportId ? 'Edit Report' : 'Report a Stray'}
                                    </h2>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">
                                        {isViewMode ? 'Reviewing existing report information' : 'Fill up the details below to help our team'}
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
                                    <div className="flex flex-wrap gap-3">
                                        {[
                                            { id: 1, name: 'Injured Animal' },
                                            { id: 2, name: 'Aggressive Stray' },
                                            { id: 3, name: 'Possible Rabies Risk' },
                                            { id: 4, name: 'Roaming Pack' },
                                            { id: 5, name: 'Animal Rescue Needed' }
                                        ].map((cat) => (
                                            <button
                                                key={cat.id}
                                                type="button"
                                                disabled={isViewMode}
                                                onClick={() => setFormData({ ...formData, category: cat.name, category_id: cat.id })}
                                                className={`px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${formData.category_id === cat.id
                                                    ? 'bg-[#F97316] text-white border-[#F97316] shadow-lg shadow-orange-100'
                                                    : `bg-white text-gray-400 border-gray-100 ${!isViewMode ? 'hover:border-orange-100' : ''}`
                                                    } ${isViewMode && formData.category_id !== cat.id ? 'opacity-40' : ''}`}
                                            >
                                                {cat.name}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Animal Specifications */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="flex flex-col">
                                        <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest mb-4">Animal Type</label>
                                        <div className="flex items-center gap-6 h-12">
                                            {['Dog', 'Cat', 'Unknown'].map((type) => (
                                                <CustomRadio
                                                    key={type}
                                                    name="animalType"
                                                    label={type}
                                                    checked={formData.animalType === type}
                                                    onChange={() => setFormData({ ...formData, animalType: type })}
                                                    disabled={isViewMode}
                                                />
                                            ))}
                                        </div>
                                    </div>

                                    <div className="flex flex-col">
                                        <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest mb-4">Animal Breed</label>
                                        <input
                                            type="text"
                                            placeholder="e.g. Aspin, Golden Retriever"
                                            className="w-full h-12 bg-[#FAFAF9] border border-gray-50 rounded-2xl px-6 text-xs font-bold"
                                            value={formData.animalBreed}
                                            onChange={(e) => setFormData({ ...formData, animalBreed: e.target.value })}
                                            disabled={isViewMode}
                                        />
                                    </div>

                                    <div className="flex flex-col">
                                        <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest mb-4">Animal Color</label>
                                        <input
                                            type="text"
                                            placeholder="e.g. Brown and White, Black"
                                            className="w-full h-12 bg-[#FAFAF9] border border-gray-50 rounded-2xl px-6 text-xs font-bold"
                                            value={formData.animalColor}
                                            onChange={(e) => setFormData({ ...formData, animalColor: e.target.value })}
                                            disabled={isViewMode}
                                        />
                                    </div>

                                    <div className="flex flex-col">
                                        <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest mb-4">Estimated Size</label>
                                        <select
                                            className="w-full h-12 bg-[#FAFAF9] border border-gray-50 rounded-2xl px-6 text-xs font-bold focus:outline-none"
                                            value={formData.estimatedSize}
                                            onChange={(e) => setFormData({ ...formData, estimatedSize: e.target.value })}
                                            disabled={isViewMode}
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
                                                disabled={isViewMode}
                                                onClick={() => setFormData({ ...formData, priorityLevel: prio })}
                                                className={`px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${formData.priorityLevel === prio
                                                    ? 'bg-[#F97316] text-white border-[#F97316] shadow-lg shadow-orange-100'
                                                    : `bg-white text-gray-400 border-gray-100 ${!isViewMode ? 'hover:border-orange-100' : ''}`
                                                    } ${isViewMode && formData.priorityLevel !== prio ? 'opacity-40' : ''}`}
                                            >
                                                {prio}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Number of Animals */}
                                <div>
                                    <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest mb-4 block">Number of Animals</label>
                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center bg-gray-50 rounded-xl p-1 border border-gray-100 shadow-inner">
                                            <button
                                                type="button"
                                                disabled={isViewMode}
                                                onClick={() => setFormData({ ...formData, animalCount: Math.max(1, formData.animalCount - 1) })}
                                                className={`w-8 h-8 rounded-lg bg-white shadow-sm flex items-center justify-center text-[#F97316] transition-all ${!isViewMode ? 'hover:bg-orange-50 active:scale-90' : 'opacity-40'}`}
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M20 12H4" />
                                                </svg>
                                            </button>
                                            <div className="w-10 text-center text-sm font-black text-[#1a1208]">
                                                {formData.animalCount}
                                            </div>
                                            <button
                                                type="button"
                                                disabled={isViewMode}
                                                onClick={() => setFormData({ ...formData, animalCount: formData.animalCount + 1 })}
                                                className={`w-8 h-8 rounded-lg bg-white shadow-sm flex items-center justify-center text-[#F97316] transition-all ${!isViewMode ? 'hover:bg-orange-50 active:scale-90' : 'opacity-40'}`}
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                                                </svg>
                                            </button>
                                        </div>
                                        {formData.animalCount >= 3 && (
                                            <div className="flex items-center gap-2 px-3 py-1 bg-orange-50 rounded-lg border border-orange-100 animate-pulse">
                                                <div className="w-1.5 h-1.5 rounded-full bg-[#F97316]" />
                                                <span className="text-[8px] font-black text-[#F97316] uppercase tracking-[0.1em]">Pack Sighting</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Is Possible Owned? */}
                                <div className="flex items-center gap-4 p-6 bg-gray-50 rounded-[2rem] border border-gray-100">
                                    <div className="relative flex items-center justify-center">
                                        <input
                                            type="checkbox"
                                            className="peer appearance-none w-6 h-6 rounded-lg border-2 border-gray-200 checked:bg-[#F97316] checked:border-[#F97316] transition-all cursor-pointer"
                                            checked={formData.isPossibleOwned}
                                            onChange={(e) => setFormData({ ...formData, isPossibleOwned: e.target.checked })}
                                            disabled={isViewMode}
                                        />
                                        <svg xmlns="http://www.w3.org/2000/svg" className="absolute h-4 w-4 text-white scale-0 peer-checked:scale-100 transition-transform pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" />
                                        </svg>
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest">Possibly Owned Pet</label>
                                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Check this if the animal looks like it has an owner</p>
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
                                                    className={`relative grid gap-2 rounded-[2rem] overflow-hidden border-2 border-orange-500 bg-orange-50/10 p-2 ${!isViewMode ? 'cursor-pointer group/grid' : ''} ${allMediaCount === 1 ? 'grid-cols-1' :
                                                        allMediaCount === 2 ? 'grid-cols-2' :
                                                            'grid-cols-2'
                                                        }`}
                                                    onClick={() => !isViewMode && document.getElementById('multi-upload')?.click()}
                                                >
                                                    {/* Render Existing Media */}
                                                    {formData.existingMedia.map((media, index) => (
                                                        <div key={`exist-${media.media_id}`} className={`relative aspect-square rounded-2xl overflow-hidden group/item ${allMediaCount === 3 && index === 0 ? 'row-span-2 aspect-auto' : ''}`}>
                                                            {media.media_type === 'Video' ? (
                                                                <video src={media.file_url} className="w-full h-full object-cover" />
                                                            ) : (
                                                                <img src={media.file_url} alt="Existing" className="w-full h-full object-cover" />
                                                            )}
                                                            {!isViewMode && (
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
                                                            {!isViewMode && (
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
                                                    {!isViewMode && (
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

                                                {!isViewMode && (
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
                                                className={`w-full aspect-video rounded-[2rem] border-2 border-dashed border-gray-100 bg-[#FAFAF9] flex flex-col items-center justify-center gap-4 transition-all group ${!isViewMode ? 'cursor-pointer hover:border-orange-200 hover:bg-orange-50/10' : ''}`}
                                                onClick={() => !isViewMode && document.getElementById('multi-upload')?.click()}
                                            >
                                                <div className={`w-16 h-16 rounded-[1.5rem] bg-white shadow-sm flex items-center justify-center text-gray-300 transition-colors ${!isViewMode ? 'group-hover:text-[#F97316]' : ''}`}>
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                                    </svg>
                                                </div>
                                                <div className="text-center">
                                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                                        {isViewMode ? 'No media attached' : 'Tap to add Photos or Videos'}
                                                    </p>
                                                    {!isViewMode && <p className="text-[9px] font-bold text-gray-300 uppercase tracking-widest mt-1">Multiple files supported</p>}
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
                                    <div className="w-full h-64 rounded-[2rem] overflow-hidden border-2 border-gray-50 shadow-sm relative group mb-6">
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
                                                disabled={isViewMode}
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
                                        </MapContainer>
                                        <div className="absolute top-4 right-4 z-[20] bg-white/90 backdrop-blur-sm px-4 py-2 rounded-xl border border-gray-100 shadow-sm pointer-events-none">
                                            <p className="text-[9px] font-black text-[#F97316] uppercase tracking-widest">{isViewMode ? 'Sighting Location' : 'Click map to move pin'}</p>
                                        </div>
                                    </div>

                                    {/* Coordinates directly under map */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">Latitude</label>
                                            <input
                                                type="text"
                                                className="w-full bg-[#FAFAF9] border border-gray-50 rounded-2xl px-5 py-3 text-[11px] font-bold text-[#F97316] shadow-sm"
                                                value={formData.latitude.toFixed(6)}
                                                readOnly
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">Longitude</label>
                                            <input
                                                type="text"
                                                className="w-full bg-[#FAFAF9] border border-gray-50 rounded-2xl px-5 py-3 text-[11px] font-bold text-[#F97316] shadow-sm"
                                                value={formData.longitude.toFixed(6)}
                                                readOnly
                                            />
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
                                        disabled={isViewMode}
                                    />
                                </div>

                                {/* Visibility Settings */}
                                <div>
                                    <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest mb-4 block">Report Visibility</label>
                                    <div className="grid grid-cols-2 gap-4">
                                        <label className={`relative flex flex-col p-5 rounded-[2rem] border-2 transition-all ${formData.visibility === 'Public' ? 'border-[#F97316] bg-orange-50/20' : `border-gray-50 bg-[#FAFAF9] ${!isViewMode ? 'hover:border-orange-100 cursor-pointer' : 'cursor-default'}`}`}>
                                            <input
                                                type="radio"
                                                name="visibility"
                                                value="Public"
                                                checked={formData.visibility === 'Public'}
                                                onChange={(e) => setFormData({ ...formData, visibility: e.target.value })}
                                                className="absolute opacity-0"
                                                disabled={isViewMode}
                                            />
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${formData.visibility === 'Public' ? 'bg-[#F97316] text-white' : 'bg-gray-100 text-gray-400'}`}>
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                        </svg>
                                                    </div>
                                                    <span className={`text-[12px] font-black uppercase tracking-widest ${formData.visibility === 'Public' ? 'text-[#F97316]' : 'text-gray-600'}`}>Public Post</span>
                                                </div>
                                                <RadioCircle checked={formData.visibility === 'Public'} disabled={isViewMode} />
                                            </div>
                                            <p className="text-[10px] font-bold text-gray-400 leading-relaxed ml-11">Visible to all users in the subdivision feed.</p>
                                        </label>
                                        <label className={`relative flex flex-col p-5 rounded-[2rem] border-2 transition-all ${formData.visibility === 'Private' ? 'border-[#F97316] bg-orange-50/20' : `border-gray-50 bg-[#FAFAF9] ${!isViewMode ? 'hover:border-orange-100 cursor-pointer' : 'cursor-default'}`}`}>
                                            <input
                                                type="radio"
                                                name="visibility"
                                                value="Private"
                                                checked={formData.visibility === 'Private'}
                                                onChange={(e) => setFormData({ ...formData, visibility: e.target.value })}
                                                className="absolute opacity-0"
                                                disabled={isViewMode}
                                            />
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${formData.visibility === 'Private' ? 'bg-[#F97316] text-white' : 'bg-gray-100 text-gray-400'}`}>
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                                        </svg>
                                                    </div>
                                                    <span className={`text-[12px] font-black uppercase tracking-widest ${formData.visibility === 'Private' ? 'text-[#F97316]' : 'text-gray-600'}`}>Private Post</span>
                                                </div>
                                                <RadioCircle checked={formData.visibility === 'Private'} disabled={isViewMode} />
                                            </div>
                                            <p className="text-[10px] font-bold text-gray-400 leading-relaxed ml-11">Only visible to Admin, Subd. Leader, and Brgy Staff.</p>
                                        </label>
                                    </div>
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
                                        disabled={isViewMode}
                                    />
                                </div>
                            </div>

                            {/* Modal Footer */}
                            <div className="p-10 pt-0 flex flex-col gap-4">
                                {isViewMode ? (
                                    <Button
                                        className="w-full py-5 bg-[#1a1208] text-white text-[12px] font-black uppercase tracking-[0.2em] rounded-[2rem] shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all"
                                        onClick={() => setIsViewMode(false)}
                                    >
                                        Edit Post
                                    </Button>
                                ) : (
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
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Real Report Posts */}
                {filteredReports.length === 0 ? (
                    <div className="text-center py-20 text-gray-400 font-medium">
                        {reports.length === 0 ? "No reports found. Be the first to submit one!" : "No reports match your search."}
                    </div>
                ) : (
                    filteredReports.map((report) => {
                        const statusMap: Record<number, string> = {
                            1: 'Pending Verification', 
                            2: 'Verified', 
                            3: 'Rejected',
                            4: 'Approved', 
                            5: 'Rescue In Progress', 
                            6: 'Picked Up',
                            7: 'Under Observation', 
                            8: 'Impounded', 
                            9: 'Claimed by Owner', 
                            10: 'Released', 
                            11: 'Resolved', 
                            12: 'Deceased'
                        };
                        const categoryMap: Record<number, string> = {
                            1: 'Injured Animal', 2: 'Aggressive Stray', 3: 'Possible Rabies Risk',
                            4: 'Roaming Pack', 5: 'Animal Rescue Needed'
                        };

                        const statusName = statusMap[report.status_id] || 'Unknown Status';
                        const categoryName = categoryMap[report.category_id] || 'Other Report';
                        const date = new Date(report.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

                        return (
                            <div key={report.report_id} className="max-w-3xl mx-auto">
                                <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-xl overflow-hidden mb-12 hover:shadow-2xl transition-all duration-300">
                                    {/* Top Thin Bar: Date (Left) + ID (Right) */}
                                    <div className="px-4 sm:px-8 py-2.5 border-b border-gray-50 flex items-center justify-between bg-gray-50/20">
                                        <p className="text-[9px] sm:text-[10px] font-black text-gray-400 uppercase tracking-widest">{date}</p>
                                        <div className="flex items-center gap-4">
                                            <span className="text-[9px] sm:text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
                                                ID: {report.report_id.toString().padStart(5, '0')}
                                            </span>
                                            {report.user_id === currentUserId && (
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
                                                                onClick={(e) => { e.stopPropagation(); handleEditClick(report, true); }}
                                                                className="w-full flex items-center gap-3 px-4 py-2.5 text-[11px] font-black uppercase tracking-widest text-blue-600 hover:bg-blue-50 transition-colors"
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                                </svg>
                                                                View Details
                                                            </button>

                                                            {report.status_id === 1 && (
                                                                <>
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); handleEditClick(report, false); }}
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
                                            )}
                                        </div>
                                    </div>

                                    {/* Content Section */}
                                    <div className="px-4 sm:px-8 pt-6 pb-8 sm:pb-10">
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
                                            <span className={`px-3 py-1 shrink-0 text-[9px] font-black uppercase tracking-widest rounded-full border shadow-sm ${report.status_id === 1 ? 'bg-orange-50 text-[#F97316] border-orange-100' :
                                                report.status_id === 2 ? 'bg-cyan-50 text-cyan-600 border-cyan-100' :
                                                report.status_id === 4 ? 'bg-purple-50 text-purple-600 border-purple-100' :
                                                report.status_id === 13 ? 'bg-indigo-50 text-indigo-600 border-indigo-100' :
                                                report.status_id === 11 ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                                report.status_id === 7 || report.status_id === 8 ? 'bg-purple-50 text-purple-600 border-purple-100' :
                                                report.status_id === 9 || report.status_id === 10 ? 'bg-teal-50 text-teal-600 border-teal-100' :
                                                'bg-blue-50 text-blue-600 border-blue-100'
                                                }`}>
                                                {statusName}
                                            </span>
                                        </div>

                                        {/* Description */}
                                        <div className="mb-6">
                                            <p className="text-[13px] sm:text-[15px] font-medium text-[#4a3b28] leading-relaxed">
                                                {report.description || 'No detailed description provided.'}
                                            </p>
                                        </div>

                                        {/* Rescue Progress Tracker (6 Stages) */}
                                        <div className="mb-14 mt-4">
                                            <div className="flex items-center justify-between relative px-2">
                                                {/* Timeline Connector Line */}
                                                <div className="absolute top-5 left-10 right-10 h-0.5 bg-gray-100 z-0">
                                                    <div
                                                        className="h-full bg-orange-500 transition-all duration-700"
                                                        style={{
                                                            width: `${(() => {
                                                                const statusIndexMap: Record<number, number> = {
                                                                    1: 0, 2: 1, 4: 2, 13: 3, 5: 4, 7: 5, 8: 6, 11: 7
                                                                };
                                                                const logicalIndex = statusIndexMap[report.status_id] ?? 0;
                                                                const totalStages = 7;
                                                                return (logicalIndex / totalStages) * 100;
                                                            })()}%`
                                                        }}
                                                    />
                                                </div>

                                                {[
                                                    { id: 1, label: 'Reported', sub: 'Citizen Post' },
                                                    { id: 2, label: 'Verified', sub: 'Leader Vetted' },
                                                    { id: 4, label: 'Escalated', sub: 'Peer Verified' },
                                                    { id: 13, label: 'Approved', sub: 'Barangay Auth' },
                                                    { id: 5, label: 'Rescue', sub: 'En Route' },
                                                    { id: 7, label: 'Picked Up', sub: 'Secured' },
                                                    { id: 8, label: 'Impounded', sub: 'At Shelter' },
                                                    { id: 11, label: 'Resolved', sub: 'Complete' }
                                                ].map((stage, idx) => {
                                                    const logicalSequence = [1, 2, 4, 13, 5, 7, 8, 11];
                                                    const currentStatusIdx = logicalSequence.indexOf(report.status_id);
                                                    const stageIdx = logicalSequence.indexOf(stage.id);
                                                    const isCompleted = currentStatusIdx >= stageIdx;
                                                    const isCurrent = report.status_id === stage.id;
                                                    const isSelected = selectedStage[report.report_id] === stage.id;
                                                    const hasHistory = report.history?.some((h: any) => h.status_id === stage.id);

                                                    return (
                                                        <div key={stage.id} className="relative z-10 flex flex-col items-center group">
                                                            <button
                                                                onClick={() => {
                                                                    if (hasHistory || stage.id === 1) {
                                                                        setSelectedStage(prev => ({ ...prev, [report.report_id]: isSelected ? null : stage.id }));
                                                                    }
                                                                }}
                                                                disabled={!hasHistory && stage.id !== 1}
                                                                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${isSelected ? 'bg-orange-600 text-white scale-110 shadow-lg shadow-orange-200' :
                                                                    isCurrent ? 'bg-orange-500 text-white animate-pulse shadow-md ring-4 ring-orange-50' :
                                                                        isCompleted ? 'bg-orange-100 text-orange-600 border border-orange-200 hover:bg-orange-200' :
                                                                            'bg-white text-gray-200 border border-gray-100'
                                                                    }`}
                                                            >
                                                                {isCompleted && !isSelected ? (
                                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                                                ) : (
                                                                    <span className="text-xs font-black">{idx + 1}</span>
                                                                )}
                                                            </button>
                                                            <span className={`mt-2 text-[8px] font-black uppercase tracking-widest ${isCurrent ? 'text-orange-600' : isCompleted ? 'text-gray-700' : 'text-gray-300'}`}>
                                                                {stage.label}
                                                            </span>
                                                            <div className="absolute top-16 flex flex-col items-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap bg-gray-900 text-white px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest -translate-y-2 group-hover:translate-y-0 duration-300 shadow-xl z-20">
                                                                {stage.label}
                                                                <span className="text-gray-400 mt-0.5">{stage.sub}</span>
                                                            </div>
                                                            {isSelected && (
                                                                <div className="absolute -top-3 w-2 h-2 bg-orange-600 rounded-full animate-bounce shadow-lg shadow-orange-200"></div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* Stage Specific Update Card */}
                                        {selectedStage[report.report_id] && (
                                            <div className="mb-10 animate-in fade-in slide-in-from-top-4 duration-500">
                                                {(() => {
                                                    const stageId = selectedStage[report.report_id];
                                                    const stageData = [
                                                        { id: 1, label: 'Reported', sub: 'Citizen Post' },
                                                        { id: 2, label: 'Verified', sub: 'Subdivision Leader has vetted this report' },
                                                        { id: 4, label: 'Approved', sub: 'Barangay has accepted the rescue request' },
                                                        { id: 5, label: 'Dispatched', sub: 'Team is on the way' },
                                                        { id: 7, label: 'Picked Up', sub: 'Animal successfully secured' },
                                                        { id: 9, label: 'Impounded', sub: 'Transferred to municipal shelter' },
                                                        { id: 6, label: 'Resolved', sub: 'Operation successfully closed' }
                                                    ].find(s => s.id === stageId);

                                                    const historyItem = report.history?.find((h: any) => h.status_id === stageId);
                                                    const stageMedia = report.media?.filter((m: any) => {
                                                        if (m.history_id !== historyItem?.history_id || !m.is_evidence) return false;
                                                        const url = m.file_url.toLowerCase();
                                                        return m.media_type !== 'Document' &&
                                                            !url.endsWith('.pdf') &&
                                                            !url.endsWith('.doc') &&
                                                            !url.endsWith('.docx') &&
                                                            !url.endsWith('.txt');
                                                    }) || [];

                                                    return (
                                                        <div className="bg-[#FAFAF9] rounded-[2.5rem] border border-orange-100 overflow-hidden shadow-sm">
                                                            <div className="p-8 pb-4 flex justify-between items-start">
                                                                <div>
                                                                    <p className="text-[10px] font-black text-orange-600 uppercase tracking-[0.2em] mb-1">Operational Stage {([1, 2, 4, 5, 7, 9, 6].indexOf(stageId!) + 1)}</p>
                                                                    <h4 className="text-xl font-black text-[#1a1208] uppercase tracking-tight">{stageData?.label}</h4>
                                                                    {stageId === 2 && historyItem?.updater_name && (
                                                                        <p className="text-[9px] font-bold text-gray-400 mt-1 uppercase tracking-widest flex items-center gap-2">
                                                                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                                                                            Verified by {historyItem.updater_name}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                                {historyItem && (
                                                                    <span className="text-[10px] font-bold text-gray-400 bg-white px-4 py-1.5 rounded-full border border-gray-50 shadow-sm">
                                                                        {new Date(historyItem.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                                    </span>
                                                                )}
                                                            </div>

                                                            <div className="px-8 pb-8 space-y-6">
                                                                <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-gray-50">
                                                                    <p className="text-[13px] font-medium text-[#4a3b28] leading-relaxed">
                                                                        {historyItem?.remarks || stageData?.sub || 'No additional remarks provided for this stage.'}
                                                                    </p>
                                                                </div>

                                                                {stageMedia.length > 0 && (
                                                                    <div className={`grid gap-2 rounded-2xl overflow-hidden ${stageMedia.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                                                                        {stageMedia.map((m: any, idx: number) => (
                                                                            <div
                                                                                key={m.media_id}
                                                                                onClick={() => setActiveGallery({ media: stageMedia, index: idx })}
                                                                                className={`relative cursor-pointer hover:opacity-90 transition-opacity ${stageMedia.length === 1 ? 'aspect-video' : 'aspect-square'}`}
                                                                            >
                                                                                {m.media_type === 'Video' ? (
                                                                                    <video src={m.file_url} className="w-full h-full object-cover" />
                                                                                ) : (
                                                                                    <img src={m.file_url} className="w-full h-full object-cover" />
                                                                                )}
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        )}

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

                                        {/* Animal Specs Grid */}
                                        {(report.animal_type || report.animal_condition) && (
                                            <div className="grid grid-cols-2 gap-3 mb-6">
                                                {report.animal_type && (
                                                    <div className="bg-orange-50/30 border border-orange-100/30 rounded-[1.5rem] p-3.5 flex items-center gap-4">
                                                        <div className="w-10 h-10 rounded-2xl bg-white shadow-sm flex items-center justify-center text-orange-600 shrink-0">
                                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
                                                        </div>
                                                        <div>
                                                            <p className="text-[8px] sm:text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Species</p>
                                                            <p className="text-[11px] sm:text-[13px] font-black text-[#1a1208] uppercase">{report.animal_type}</p>
                                                        </div>
                                                    </div>
                                                )}
                                                {report.animal_condition && (
                                                    <div className="bg-red-50/30 border border-red-100/30 rounded-[1.5rem] p-3.5 flex items-center gap-4">
                                                        <div className="w-10 h-10 rounded-2xl bg-white shadow-sm flex items-center justify-center text-red-600 shrink-0">
                                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
                                                        </div>
                                                        <div>
                                                            <p className="text-[8px] sm:text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Condition</p>
                                                            <p className="text-[11px] sm:text-[13px] font-black text-[#1a1208] uppercase">{report.animal_condition}</p>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Quick Info Grid - Always 3 Columns */}
                                        <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-6 bg-[#FAFAF9] p-4 rounded-3xl border border-gray-50">
                                            <div className="flex flex-col gap-0.5">
                                                <span className="text-[8px] sm:text-[9px] font-black text-gray-400 uppercase tracking-widest">{categoryName}</span>
                                                <span className="text-[10px] sm:text-[11px] font-bold text-[#4a3b28] truncate">{report.landmark || 'Not specified'}</span>
                                            </div>
                                            <div className="flex flex-col gap-0.5 border-l border-gray-100 pl-3 sm:pl-4">
                                                <span className="text-[8px] sm:text-[9px] font-black text-gray-400 uppercase tracking-widest">Animals</span>
                                                <span className="text-[10px] sm:text-[11px] font-bold text-[#4a3b28] truncate">{report.animal_count} sighted</span>
                                            </div>
                                            <div className="flex flex-col gap-0.5 border-l border-gray-100 pl-3 sm:pl-4">
                                                <span className="text-[8px] sm:text-[9px] font-black text-gray-400 uppercase tracking-widest">Priority</span>
                                                <span className={`text-[10px] sm:text-[11px] font-black uppercase tracking-wider truncate ${report.priority_level === 'High' ? 'text-red-500' : 'text-[#F97316]'}`}>
                                                    {report.priority_level}
                                                </span>
                                            </div>
                                        </div>

                                        {/* View More Button - PROMINENT PLACEMENT */}
                                        <div className="mb-8">
                                            <button
                                                onClick={() => setViewingDetailedReport(report)}
                                                className="w-full py-4 bg-[#F97316] text-white rounded-3xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl shadow-orange-100 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3"
                                            >
                                                View Rescue Timeline & Full Intelligence
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                                            </button>
                                        </div>

                                        <div className="rounded-2xl sm:rounded-[2rem] overflow-hidden border border-gray-100 h-40 sm:h-52 relative shadow-inner">
                                            <MapContainer
                                                center={[report.latitude, report.longitude]}
                                                zoom={16}
                                                className="h-full w-full grayscale-[0.5] contrast-[1.1]"
                                                scrollWheelZoom={false}
                                                dragging={false}
                                                zoomControl={false}
                                            >
                                                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                                                <Marker position={[report.latitude, report.longitude]} />
                                            </MapContainer>
                                            <div className="absolute bottom-3 sm:bottom-4 left-3 sm:left-4 bg-white/90 backdrop-blur-sm px-3 sm:px-4 py-1 sm:py-1.5 rounded-full border border-gray-100 shadow-sm z-[10]">
                                                <p className="text-[8px] sm:text-[9px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
                                                    Live Sighting Location
                                                </p>
                                            </div>
                                        </div>
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
                )}

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
                <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 sm:p-6 md:p-10">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-[#1a1208]/80 backdrop-blur-xl animate-in fade-in duration-500"
                        onClick={() => setViewingDetailedReport(null)}
                    />

                    {/* Modal Content */}
                    <div className="relative w-full max-w-5xl bg-[#FBFBFB] rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-20 duration-700 flex flex-col max-h-[90vh]">
                        {/* Header */}
                        <div className="px-10 py-8 bg-white border-b border-gray-100 flex justify-between items-center shrink-0">
                            <div className="flex items-center gap-6">
                                <div className="w-16 h-16 rounded-[2rem] bg-orange-50 flex items-center justify-center text-orange-600 shadow-sm border border-orange-100">
                                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                                </div>
                                <div>
                                    <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tight">Rescue Case Intelligence</h2>
                                    <div className="flex items-center gap-3 mt-1">
                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Report ID: #STR-{(viewingDetailedReport.report_id || 0).toString().padStart(4, '0')}</span>
                                        <div className="w-1 h-1 rounded-full bg-gray-200" />
                                        <span className="text-[10px] font-black text-orange-600 uppercase tracking-widest">{categoryMap[viewingDetailedReport.category_id]}</span>
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={() => setViewingDetailedReport(null)}
                                className="p-4 bg-gray-50 text-gray-400 hover:text-gray-900 rounded-2xl transition-all"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>

                        {/* Scrollable Body */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-10">
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
                                {/* Left Side: Report Details */}
                                <div className="lg:col-span-5 space-y-10">
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
                                        <div className="bg-white p-6 rounded-3xl border border-gray-100">
                                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Animal Type</p>
                                            <p className="text-sm font-black text-gray-900 uppercase">{viewingDetailedReport.animal_type}</p>
                                        </div>
                                        <div className="bg-white p-6 rounded-3xl border border-gray-100">
                                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Priority</p>
                                            <p className="text-sm font-black text-red-600 uppercase">{viewingDetailedReport.priority_level}</p>
                                        </div>
                                    </div>

                                    {/* Subject Identification */}
                                    <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100">
                                        <h4 className="text-[10px] font-black text-gray-900 uppercase tracking-[0.2em] mb-6">Subject Identification</h4>
                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center py-2 border-b border-gray-50">
                                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Breed / Variety</span>
                                                <span className="text-xs font-black text-gray-900 uppercase">{viewingDetailedReport.animal_breed || 'Unknown'}</span>
                                            </div>
                                            <div className="flex justify-between items-center py-2 border-b border-gray-50">
                                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Coat Color</span>
                                                <span className="text-xs font-black text-gray-900 uppercase">{viewingDetailedReport.animal_color || 'Unknown'}</span>
                                            </div>
                                            <div className="flex justify-between items-center py-2">
                                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Estimated Size</span>
                                                <span className="text-xs font-black text-gray-900 uppercase">{viewingDetailedReport.estimated_size || 'Medium'}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Description */}
                                    <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100">
                                        <h4 className="text-[10px] font-black text-gray-900 uppercase tracking-[0.2em] mb-4">Case Description</h4>
                                        <p className="text-sm text-gray-600 font-medium leading-relaxed italic">
                                            "{viewingDetailedReport.description}"
                                        </p>
                                    </div>

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
                                                </MapContainer>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Right Side: Timeline */}
                                <div className="lg:col-span-7 space-y-8">
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

                                    {/* The Timeline Component */}
                                    <RescueTimeline
                                        history={viewingDetailedReport.history || []}
                                        currentStatusId={viewingDetailedReport.status_id}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="px-10 py-6 bg-white border-t border-gray-100 flex justify-between items-center shrink-0">
                            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-[0.2em]">© 2026 STRAYSAFE MISSION CONTROL</p>
                            <button
                                onClick={() => setViewingDetailedReport(null)}
                                className="px-8 py-3 bg-gray-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all"
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
                onAddReportClick={() => {
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
