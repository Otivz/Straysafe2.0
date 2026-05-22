import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import AdminSidebar from '../../components/AdminSidebar';
import AdminNavbar from '../../components/Navbars/AdminNavbar';
import Button from '../../components/Button';
import SuccessModal from '../../components/Modals/SuccessModal';
import Select from '../../components/Dropdown';
import MapComponent from '../../components/MapComponent';
import { MapContainer, TileLayer, Marker, useMapEvents, Polygon } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for default marker icon issue in React Leaflet
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIconRetina from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

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

// Custom component to handle map clicks and move marker
const LocationPicker = ({ onLocationSelect, position }: { onLocationSelect: (lat: number, lng: number) => void, position: [number, number] }) => {
    useMapEvents({
        click(e) {
            onLocationSelect(e.latlng.lat, e.latlng.lng);
        },
    });

    return position ? <Marker position={position} /> : null;
};

interface Report {
    report_id: number;
    category_id: number;
    status_id: number;
    priority_level: string;
    latitude: number;
    longitude: number;
    landmark: string;
    animal_count: number;
    description: string;
    visibility: string;
    created_at: string;
    user_id: number;
    reporter_name?: string;
    animal_type?: string;
    breed?: string;
    animal_condition?: string;
    behavior_tags?: string | string[];
    media?: any[];
    comments?: any[];
    history?: any[];
}

import DataTable from '../../components/DataTable';
import RescueTimeline from '../../components/RescueTimeline';

const statusMap: Record<number, string> = {
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
    1: 'Injured Animal', 2: 'Aggressive Stray', 3: 'Possible Rabies Risk',
    4: 'Roaming Pack', 5: 'Animal Rescue Needed'
};

const AdminReport = () => {
    const [reports, setReports] = useState<Report[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [openMenuId, setOpenMenuId] = useState<number | null>(null);
    const [viewingReportId, setViewingReportId] = useState<number | null>(null);
    const [isEscalateModalOpen, setIsEscalateModalOpen] = useState(false);
    const [escalatingReportId, setEscalatingReportId] = useState<number | null>(null);
    const [escalationData, setEscalationData] = useState({
        title: '',
        description: '',
        endorsement_letter: null as File | null
    });
    const menuRef = useRef<HTMLDivElement>(null);

    const userStr = localStorage.getItem('admin_user') || localStorage.getItem('user');
    const currentUser = userStr ? JSON.parse(userStr) : null;
    const currentUserId = currentUser ? currentUser.user_id : 1;

    const [commentInputs, setCommentInputs] = useState<Record<number, string>>({});
    const [replyingTo, setReplyingTo] = useState<Record<number, { commentId: number, userName: string } | null>>({});
    const [expandedComments, setExpandedComments] = useState<Record<number, boolean>>({});
    const [activeGallery, setActiveGallery] = useState<{ media: any[], index: number } | null>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setOpenMenuId(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const [formData, setFormData] = useState({
        category_id: 1,
        category: 'Dog',
        latitude: 14.8013,
        longitude: 121.0031,
        landmark: '',
        priority_level: 'Regular',
        description: '',
        animal_count: 1,
        visibility: 'Public',
        breed: '',
        condition: 'Healthy',
        behaviorTags: [] as string[],
        mediaFiles: [] as File[]
    });

    const API_URL = 'http://localhost:8000/reports';

    const fetchReports = async () => {
        try {
            setLoading(true);
            const response = await axios.get(`${API_URL}/`);
            // Sort by report_id descending to show new reports at the top
            const sortedData = (response.data || []).sort((a: any, b: any) => b.report_id - a.report_id);
            setReports(sortedData);
        } catch (error) {
            console.error('Error fetching reports:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReports();
    }, []);

    const handleAddComment = async (reportId: number) => {
        const text = commentInputs[reportId];
        if (!text || !text.trim()) return;

        try {
            const parentId = replyingTo[reportId]?.commentId || null;
            await axios.post(`${API_URL}/${reportId}/comments`, {
                comment: text.trim(),
                user_id: currentUserId,
                parent_comment_id: parentId
            });

            setCommentInputs(prev => ({ ...prev, [reportId]: '' }));
            setReplyingTo(prev => ({ ...prev, [reportId]: null }));
            fetchReports(); // Refresh to get the latest comments
        } catch (error) {
            console.error('Error adding comment:', error);
        }
    };

    const handleEscalate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!escalatingReportId || !escalationData.endorsement_letter) {
            alert('Please provide an endorsement letter.');
            return;
        }

        try {
            // 1. Upload the letter
            const formData = new FormData();
            formData.append('file', escalationData.endorsement_letter);
            await axios.post(`${API_URL}/${escalatingReportId}/media`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            // 2. Create the Rescue Request
            await axios.post('http://localhost:8000/rescue-requests/', {
                report_id: escalatingReportId,
                leader_id: currentUserId,
                title: escalationData.title || 'Official Rescue Escalation',
                description: escalationData.description || 'Barangay rescue requested for this incident.',
                status_id: 1 // Pending
            });

            // 3. Update the report status to "Escalated to Barangay" (4)
            await axios.patch(`${API_URL}/${escalatingReportId}/status`, { status_id: 4 });

            setIsEscalateModalOpen(false);
            setEscalatingReportId(null);
            setEscalationData({ title: '', description: '', endorsement_letter: null });
            fetchReports();
            alert('Incident successfully escalated to Barangay.');
        } catch (error) {
            console.error('Error escalating report:', error);
            alert('Failed to escalate report.');
        }
    };

    const handleUpdateStatus = async (reportId: number, statusId: number) => {
        try {
            await axios.patch(`${API_URL}/${reportId}/status`, { status_id: statusId });
            fetchReports();
        } catch (error) {
            console.error('Error updating status:', error);
            alert('Failed to update status. Please try again.');
        }
    };

    const handleDelete = async (id: number) => {
        if (window.confirm('Are you sure you want to delete this incident report?')) {
            try {
                await axios.delete(`${API_URL}/${id}`);
                fetchReports();
            } catch (error) {
                console.error('Error deleting report:', error);
            }
        }
    };

    const handleSaveReport = async (e: React.FormEvent) => {
        e.preventDefault();

        // Geofence validation
        if (!isInsideSeleraHomes(formData.latitude, formData.longitude)) {
            alert('Location outside Selera Homes. Incident reports are only accepted within the subdivision boundary.');
            return;
        }

        try {
            const userStr = localStorage.getItem('admin_user') || sessionStorage.getItem('admin_user');
            if (!userStr) throw new Error('User not authenticated');
            const user = JSON.parse(userStr);

            const response = await axios.post(API_URL, {
                user_id: user.user_id,
                subdivision_id: 1,
                category_id: formData.category_id,
                animal_type: formData.category,
                breed: formData.breed,
                condition: formData.condition,
                behavior_tags: formData.behaviorTags.join(','),
                latitude: formData.latitude,
                longitude: formData.longitude,
                landmark: formData.landmark,
                priority_level: formData.priority_level,
                description: formData.description,
                animal_count: formData.animal_count,
                visibility: formData.visibility,
                status_id: 1,
                is_archived: false
            });

            const newReport = response.data;
            const reportId = newReport.report_id;

            // Upload media if present
            if (formData.mediaFiles && formData.mediaFiles.length > 0) {
                for (const file of formData.mediaFiles) {
                    const mediaData = new FormData();
                    mediaData.append("file", file);

                    try {
                        await axios.post(`${API_URL}/${reportId}/media`, mediaData, {
                            headers: { 'Content-Type': 'multipart/form-data' }
                        });
                    } catch (err) {
                        console.error('Failed to upload media:', err);
                    }
                }
            }

            setIsModalOpen(false);
            setShowSuccess(true);
            setFormData({
                category_id: 1,
                category: 'Dog',
                latitude: 14.8013,
                longitude: 121.0031,
                landmark: '',
                priority_level: 'Regular',
                description: '',
                animal_count: 1,
                visibility: 'Public',
                breed: '',
                condition: 'Healthy',
                behaviorTags: [],
                mediaFiles: []
            });
            fetchReports();
            setTimeout(() => setShowSuccess(false), 3000);
        } catch (error) {
            console.error('Error saving report:', error);
            alert('Failed to submit report. Please try again.');
        }
    };

    const filteredReports = reports.filter(rep => {
        const catName = categoryMap[rep.category_id]?.toLowerCase() || '';
        const land = (rep.landmark || '').toLowerCase();
        const reporter = (rep.reporter_name || '').toLowerCase();
        const matchesSearch = catName.includes(searchTerm.toLowerCase()) || land.includes(searchTerm.toLowerCase()) || reporter.includes(searchTerm.toLowerCase());
        const statName = statusMap[rep.status_id] || '';
        const matchesStatus = statusFilter === 'all' || statName.toLowerCase() === statusFilter.toLowerCase();
        return matchesSearch && matchesStatus;
    });

    const getPriorityColor = (priority: string) => {
        switch (priority.toLowerCase()) {
            case 'emergency':
            case 'high': return 'bg-red-50 text-red-600 border-red-100';
            case 'regular':
            case 'medium': return 'bg-amber-50 text-amber-600 border-amber-100';
            case 'low': return 'bg-blue-50 text-blue-600 border-blue-100';
            default: return 'bg-gray-50 text-gray-600 border-gray-100';
        }
    };

    const getStatusColor = (status: string) => {
        switch (status.toLowerCase()) {
            case 'reported':
            case 'pending verification':
            case 'pending': return 'bg-amber-50 text-amber-600 border-amber-100';
            case 'verified': return 'bg-cyan-50 text-cyan-600 border-cyan-100';
            case 'escalated to barangay': return 'bg-purple-50 text-purple-600 border-purple-100';
            case 'approved': return 'bg-indigo-50 text-indigo-600 border-indigo-100';
            case 'in action':
            case 'ongoing':
            case 'rescue in progress': return 'bg-blue-50 text-blue-600 border-blue-100';
            case 'resolved': return 'bg-emerald-50 text-emerald-600 border-emerald-100';
            default: return 'bg-gray-50 text-gray-600 border-gray-100';
        }
    };

    return (
        <div className="flex h-screen bg-[#F8FAFC]">
            <AdminSidebar />

            <div className="flex-1 flex flex-col overflow-hidden">
                <AdminNavbar />

                <main className="flex-1 overflow-y-auto p-8">
                    <div className="max-w-7xl mx-auto">
                        {/* Header */}
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900">Incident Reports</h1>
                                <p className="text-gray-500 text-sm mt-1">Monitor and manage reported animal incidents across subdivisions.</p>
                            </div>
                            <div className="flex items-center space-x-3">
                                <Button variant="light" className="flex items-center space-x-2" onClick={fetchReports}>
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                    <span>Refresh</span>
                                </Button>
                                <Button variant="primary" className="flex items-center space-x-2 px-6" onClick={() => setIsModalOpen(true)}>
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                                    </svg>
                                    <span>Report Incident</span>
                                </Button>
                            </div>
                        </div>

                        {/* Search & Filters */}
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="relative flex-1 max-w-md">
                                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                </span>
                                <input
                                    type="text"
                                    placeholder="Search by category or landmark..."
                                    className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#F97316] outline-none transition-all"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <div className="flex items-center space-x-2">
                                <Select
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value)}
                                    options={[
                                        { value: 'all', label: 'All Status' },
                                        { value: 'Pending', label: 'Pending' },
                                        { value: 'Verified', label: 'Verified' },
                                        { value: 'Escalated to Barangay', label: 'Escalated' },
                                        { value: 'Rescue In Progress', label: 'In Progress' },
                                        { value: 'Resolved', label: 'Resolved' }
                                    ]}
                                    className="w-[140px]"
                                />
                            </div>
                        </div>

                        {/* Table */}
                        {/* Data Table Section */}
                        <DataTable
                            loading={loading}
                            data={filteredReports}
                            emptyMessage="No incident reports found."
                            loadingMessage="Synchronizing reports..."
                            columns={[
                                {
                                    header: "ID",
                                    key: "report_id",
                                    render: (rep) => (
                                        <span className="text-xs font-mono text-gray-400">#{rep.report_id.toString().padStart(4, '0')}</span>
                                    )
                                },
                                {
                                    header: "Category",
                                    key: "category",
                                    render: (rep) => (
                                        <div className="flex items-center space-x-2">
                                            <span className="w-2 h-2 rounded-full bg-orange-400"></span>
                                            <span className="text-sm font-bold text-gray-900">{categoryMap[rep.category_id] || 'Other'}</span>
                                        </div>
                                    )
                                },
                                {
                                    header: "Priority",
                                    key: "priority",
                                    render: (rep) => (
                                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold border ${getPriorityColor(rep.priority_level)}`}>
                                            {rep.priority_level}
                                        </span>
                                    )
                                },
                                {
                                    header: "Location",
                                    key: "location",
                                    render: (rep) => (
                                        <div className="flex items-center space-x-1.5 text-gray-500">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                            </svg>
                                            <span className="text-xs truncate max-w-[150px]">{rep.landmark || 'No landmark'}</span>
                                        </div>
                                    )
                                },
                                {
                                    header: "Rescue Status",
                                    key: "rescue_status",
                                    render: (rep) => (
                                        <div className="flex items-center space-x-2">
                                            {rep.status_id >= 5 ? (
                                                <>
                                                    <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
                                                    <span className="text-xs font-bold text-blue-700">{statusMap[rep.status_id]}</span>
                                                </>
                                            ) : (
                                                <span className="text-xs text-gray-400 italic">Not started</span>
                                            )}
                                        </div>
                                    )
                                },
                                {
                                    header: "Status",
                                    key: "status",
                                    render: (rep) => (
                                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold border ${getStatusColor(statusMap[rep.status_id] || 'Pending')}`}>
                                            {statusMap[rep.status_id] || 'Pending'}
                                        </span>
                                    )
                                },
                                {
                                    header: "Submitted By",
                                    key: "reporter",
                                    render: (rep) => (
                                        <div className="flex items-center space-x-2">
                                            <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-[10px] text-gray-500 font-bold border border-gray-200">
                                                {(rep.reporter_name || 'U').charAt(0).toUpperCase()}
                                            </div>
                                            <span className="text-xs font-semibold text-gray-700">{rep.reporter_name || `User ${rep.user_id}`}</span>
                                        </div>
                                    )
                                },
                                {
                                    header: "Action",
                                    key: "action",
                                    className: "text-right",
                                    render: (rep) => (
                                        <div className="relative inline-block text-left" ref={openMenuId === rep.report_id ? menuRef : null}>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setOpenMenuId(openMenuId === rep.report_id ? null : rep.report_id);
                                                }}
                                                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                    <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z" />
                                                </svg>
                                            </button>

                                            {openMenuId === rep.report_id && (
                                                <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-50 animate-in fade-in zoom-in-95 duration-200">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setViewingReportId(rep.report_id);
                                                            setOpenMenuId(null);
                                                        }}
                                                        className="w-full flex items-center gap-3 px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                        </svg>
                                                        View Report
                                                    </button>
                                                    {rep.status_id !== 6 && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleUpdateStatus(rep.report_id, 11);
                                                                setOpenMenuId(null);
                                                            }}
                                                            className="w-full flex items-center gap-3 px-4 py-2 text-sm font-medium text-green-600 hover:bg-green-50 transition-colors"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                            </svg>
                                                            Mark Resolved
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleDelete(rep.report_id);
                                                            setOpenMenuId(null);
                                                        }}
                                                        className="w-full flex items-center gap-3 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                        </svg>
                                                        Delete Report
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )
                                }
                            ]}
                        />
                    </div>
                </main>
            </div>

            {/* View Report Modal */}
            {viewingReportId !== null && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                        <div className="px-8 py-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 shrink-0">
                            <div>
                                <h3 className="text-xl font-bold text-gray-900">Incident Report Details</h3>
                                <p className="text-xs text-gray-500 mt-1">Full view of the resident's report</p>
                            </div>
                            <button onClick={() => setViewingReportId(null)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-all">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="p-8 overflow-y-auto custom-scrollbar flex-1">
                            {(() => {
                                const viewReport = reports.find(r => r.report_id === viewingReportId);
                                if (!viewReport) return null;
                                return (
                                    <div className="flex flex-col h-full overflow-hidden">
                                        {/* Rescue Progress Tracker (6 Stages) */}
                                        <div className="px-8 py-10 bg-white border-b border-gray-100/50 shrink-0">
                                            <div className="flex items-center justify-between relative px-2">
                                                <div className="absolute top-5 left-10 right-10 h-0.5 bg-gray-100 z-0">
                                                    <div
                                                        className="h-full bg-orange-500 transition-all duration-700"
                                                        style={{
                                                            width: `${(() => {
                                                                const stages = [1, 2, 4, 13, 5, 7, 8, 11];
                                                                const currentIndex = stages.indexOf(viewReport.status_id);
                                                                return currentIndex === -1 ? 0 : (currentIndex / (stages.length - 1)) * 100;
                                                            })()}%`
                                                        }}
                                                    />
                                                </div>

                                                {[
                                                    { id: 1, label: 'Reported' },
                                                    { id: 2, label: 'Verified' },
                                                    { id: 4, label: 'Escalated' },
                                                    { id: 13, label: 'Approved' },
                                                    { id: 5, label: 'Rescue' },
                                                    { id: 7, label: 'Observation' },
                                                    { id: 8, label: 'Impounded' },
                                                    { id: 11, label: 'Resolved' }
                                                ].map((stage, idx) => {
                                                    const stages = [1, 2, 4, 13, 5, 7, 8, 11];
                                                    const isCompleted = stages.indexOf(viewReport.status_id) >= idx;
                                                    const isCurrent = viewReport.status_id === stage.id;

                                                    return (
                                                        <div key={stage.id} className="relative z-10 flex flex-col items-center">
                                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${isCurrent ? 'bg-orange-500 text-white shadow-md ring-4 ring-orange-50' :
                                                                isCompleted ? 'bg-orange-100 text-orange-600 border border-orange-200' :
                                                                    'bg-white text-gray-200 border border-gray-100'
                                                                }`}>
                                                                {isCompleted ? (
                                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                                                ) : (
                                                                    <span className="text-xs font-black">{idx + 1}</span>
                                                                )}
                                                            </div>
                                                            <span className={`mt-2 text-[8px] font-black uppercase tracking-widest ${isCurrent ? 'text-orange-600' : isCompleted ? 'text-gray-600' : 'text-gray-300'}`}>
                                                                {stage.label}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        <div className="p-8 space-y-8 overflow-y-auto custom-scrollbar flex-1">
                                            {/* Header Info */}
                                            <div className="flex items-start justify-between">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-lg text-gray-500 font-bold border border-gray-200">
                                                        {(viewReport.reporter_name || 'U').charAt(0).toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <h4 className="text-sm font-bold text-gray-900">{viewReport.reporter_name || `User ${viewReport.user_id}`}</h4>
                                                        <p className="text-xs text-gray-500">{new Date(viewReport.created_at).toLocaleString()}</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <span className={`px-4 py-1.5 rounded-full text-xs font-bold border ${getStatusColor(statusMap[viewReport.status_id] || 'Pending')}`}>
                                                        {statusMap[viewReport.status_id] || 'Pending'}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Details Grid */}
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-y-6 gap-x-4 bg-gray-50 p-6 rounded-2xl border border-gray-100">
                                                <div>
                                                    <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Category</span>
                                                    <span className="text-sm font-semibold text-gray-900">{categoryMap[viewReport.category_id] || 'Other'}</span>
                                                </div>
                                                <div>
                                                    <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Priority</span>
                                                    <span className={`text-sm font-bold ${getPriorityColor(viewReport.priority_level).replace('bg-', 'text-').replace('-50', '-600')}`}>
                                                        {viewReport.priority_level}
                                                    </span>
                                                </div>
                                                <div>
                                                    <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Rescue Status</span>
                                                    <span className={`text-sm font-bold ${viewReport.status_id >= 5 ? 'text-blue-600' : 'text-gray-400'}`}>
                                                        {viewReport.status_id >= 5 ? statusMap[viewReport.status_id] : 'Not Yet Initiated'}
                                                    </span>
                                                </div>
                                                <div>
                                                    <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Breed</span>
                                                    <span className="text-sm font-semibold text-gray-900">{(viewReport as any).breed || 'Not specified'}</span>
                                                </div>
                                                <div>
                                                    <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Condition</span>
                                                    <span className="text-sm font-semibold text-gray-900">{(viewReport as any).condition || 'Unknown'}</span>
                                                </div>
                                                <div>
                                                    <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Animals</span>
                                                    <span className="text-sm font-semibold text-gray-900">{viewReport.animal_count} observed</span>
                                                </div>
                                                <div>
                                                    <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Visibility</span>
                                                    <span className="text-sm font-semibold text-gray-900">{viewReport.visibility}</span>
                                                </div>
                                                <div>
                                                    <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Landmark</span>
                                                    <span className="text-sm font-semibold text-gray-900">{viewReport.landmark || 'N/A'}</span>
                                                </div>
                                                <div className="md:col-span-2">
                                                    <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Coordinates</span>
                                                    <span className="text-xs font-mono text-gray-600">{viewReport.latitude}, {viewReport.longitude}</span>
                                                </div>
                                            </div>

                                            {/* Behavior Tags */}
                                            {viewReport.behavior_tags && (
                                                <div>
                                                    <h5 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">Behavior & Traits</h5>
                                                    <div className="flex flex-wrap gap-2">
                                                        {(typeof viewReport.behavior_tags === 'string' ? viewReport.behavior_tags.split(',') : (viewReport.behavior_tags as string[])).map((tag, idx) => (
                                                            <span key={idx} className="px-3 py-1 bg-gray-100 text-gray-600 text-[10px] font-bold rounded-full border border-gray-200">
                                                                {tag.trim()}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Map Location */}
                                            <div>
                                                <h5 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">Incident Location Map</h5>
                                                <div className="w-full h-64 rounded-2xl overflow-hidden border border-gray-100 shadow-sm bg-gray-50">
                                                    <MapComponent
                                                        center={[viewReport.latitude, viewReport.longitude]}
                                                        zoom={17}
                                                        showHeatmap={false}
                                                    />
                                                </div>
                                            </div>

                                            {/* Description */}
                                            <div>
                                                <h5 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">Description</h5>
                                                <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                                                    <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{viewReport.description || 'No description provided.'}</p>
                                                </div>
                                            </div>

                                            {/* Media Grid: The Focus */}
                                            {viewReport.media && viewReport.media.filter((m: any) => {
                                                const url = m.file_url.toLowerCase();
                                                return m.media_type !== 'Document' &&
                                                    !url.endsWith('.pdf') &&
                                                    !url.endsWith('.doc') &&
                                                    !url.endsWith('.docx') &&
                                                    !url.endsWith('.txt');
                                            }).length > 0 && (
                                                    <div>
                                                        <h5 className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest mb-4 block">INCIDENT MEDIA GALLERY</h5>
                                                        <div className={`grid gap-2 rounded-2xl sm:rounded-[2.5rem] overflow-hidden border-2 border-gray-50 shadow-inner bg-gray-50/30 ${viewReport.media.filter((m: any) => {
                                                            const url = m.file_url.toLowerCase();
                                                            return m.media_type !== 'Document' &&
                                                                !url.endsWith('.pdf') &&
                                                                !url.endsWith('.doc') &&
                                                                !url.endsWith('.docx') &&
                                                                !url.endsWith('.txt');
                                                        }).length === 1 ? 'grid-cols-1' : 'grid-cols-2'
                                                            }`}>
                                                            {viewReport.media.filter((m: any) => {
                                                                const url = m.file_url.toLowerCase();
                                                                return m.media_type !== 'Document' &&
                                                                    !url.endsWith('.pdf') &&
                                                                    !url.endsWith('.doc') &&
                                                                    !url.endsWith('.docx') &&
                                                                    !url.endsWith('.txt');
                                                            }).slice(0, 4).map((m: any, idx: number) => (
                                                                <div
                                                                    key={m.media_id}
                                                                    className={`relative overflow-hidden cursor-pointer group/media ${viewReport.media.filter((m: any) => {
                                                                        const url = m.file_url.toLowerCase();
                                                                        return m.media_type !== 'Document' &&
                                                                            !url.endsWith('.pdf') &&
                                                                            !url.endsWith('.doc') &&
                                                                            !url.endsWith('.docx') &&
                                                                            !url.endsWith('.txt');
                                                                    }).length === 1 ? 'h-64 sm:h-96' :
                                                                        viewReport.media.filter((m: any) => {
                                                                            const url = m.file_url.toLowerCase();
                                                                            return m.media_type !== 'Document' &&
                                                                                !url.endsWith('.pdf') &&
                                                                                !url.endsWith('.doc') &&
                                                                                !url.endsWith('.docx') &&
                                                                                !url.endsWith('.txt');
                                                                        }).length === 2 ? 'h-48 sm:h-72' :
                                                                            viewReport.media.filter((m: any) => {
                                                                                const url = m.file_url.toLowerCase();
                                                                                return m.media_type !== 'Document' &&
                                                                                    !url.endsWith('.pdf') &&
                                                                                    !url.endsWith('.doc') &&
                                                                                    !url.endsWith('.docx') &&
                                                                                    !url.endsWith('.txt');
                                                                            }).length === 3 && idx === 0 ? 'row-span-2 h-[24rem] sm:h-[36rem]' : 'h-48 sm:h-72'
                                                                        }`}
                                                                    onClick={() => {
                                                                        const filtered = viewReport.media.filter((m: any) => {
                                                                            const url = m.file_url.toLowerCase();
                                                                            return m.media_type !== 'Document' &&
                                                                                !url.endsWith('.pdf') &&
                                                                                !url.endsWith('.doc') &&
                                                                                !url.endsWith('.docx') &&
                                                                                !url.endsWith('.txt');
                                                                        });
                                                                        setActiveGallery({ media: filtered, index: idx });
                                                                    }}
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
                                                                    {idx === 3 && viewReport.media.filter((m: any) => {
                                                                        const url = m.file_url.toLowerCase();
                                                                        return m.media_type !== 'Document' &&
                                                                            !url.endsWith('.pdf') &&
                                                                            !url.endsWith('.doc') &&
                                                                            !url.endsWith('.docx') &&
                                                                            !url.endsWith('.txt');
                                                                    }).length > 4 && (
                                                                            <div className="absolute inset-0 bg-black/70 backdrop-blur-[4px] flex items-center justify-center text-white">
                                                                                <span className="text-xl sm:text-3xl font-black tracking-tighter leading-none">+{viewReport.media.filter((m: any) => {
                                                                                    const url = m.file_url.toLowerCase();
                                                                                    return m.media_type !== 'Document' &&
                                                                                        !url.endsWith('.pdf') &&
                                                                                        !url.endsWith('.doc') &&
                                                                                        !url.endsWith('.docx') &&
                                                                                        !url.endsWith('.txt');
                                                                                }).length - 4}</span>
                                                                            </div>
                                                                        )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                            {/* AI Insights & Data Assessment */}
                                            <div className="bg-orange-50/50 rounded-2xl p-6 border border-orange-100/50">
                                                <h5 className="text-[11px] font-bold text-[#F97316] uppercase tracking-widest mb-4 flex items-center gap-2">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                                    </svg>
                                                    AI Insights & Data Assessment
                                                </h5>
                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                                    <div className="bg-white p-4 rounded-xl shadow-sm border border-orange-100">
                                                        <span className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Area Risk Level</span>
                                                        <div className="flex items-center gap-2">
                                                            <span className="w-2 h-2 rounded-full bg-red-500"></span>
                                                            <span className="text-sm font-bold text-gray-900">High Risk Hotspot</span>
                                                        </div>
                                                    </div>
                                                    <div className="bg-white p-4 rounded-xl shadow-sm border border-orange-100">
                                                        <span className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Duplicate Check</span>
                                                        <div className="flex items-center gap-2">
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                            </svg>
                                                            <span className="text-sm font-bold text-gray-900">Unique Report</span>
                                                        </div>
                                                    </div>
                                                    <div className="bg-white p-4 rounded-xl shadow-sm border border-orange-100">
                                                        <span className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">AI Classification</span>
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="px-2 py-0.5 bg-orange-100 text-[#F97316] text-[10px] font-bold rounded-md">Dog</span>
                                                            <span className="px-2 py-0.5 bg-blue-100 text-blue-600 text-[10px] font-bold rounded-md">Injured</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Action Audit Trail (Timeline) */}
                                            <div className="pt-4">
                                                <h5 className="text-[11px] font-black text-gray-900 uppercase tracking-widest mb-4 flex items-center gap-2">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                    </svg>
                                                    Operational Audit Trail
                                                </h5>
                                                <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
                                                    <RescueTimeline
                                                        history={viewReport.history || []}
                                                        currentStatusId={viewReport.status_id || 1}
                                                    />
                                                </div>
                                            </div>

                                            {/* Comments Section */}
                                            <div className="bg-white border border-gray-100 rounded-2xl p-6 pt-5 shadow-sm">
                                                {viewReport.comments && viewReport.comments.length > 0 && (
                                                    <button
                                                        onClick={() => setExpandedComments(prev => ({ ...prev, [viewReport.report_id]: !prev[viewReport.report_id] }))}
                                                        className="text-[10px] font-black text-gray-400 hover:text-[#F97316] uppercase tracking-widest transition-colors flex items-center gap-2 mb-6"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 transition-transform duration-300 ${expandedComments[viewReport.report_id] ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                                                        </svg>
                                                        {expandedComments[viewReport.report_id] ? 'Hide Comments' : `View all ${viewReport.comments.length} comments`}
                                                    </button>
                                                )}

                                                {(expandedComments[viewReport.report_id] || !viewReport.comments || viewReport.comments.length === 0) && (
                                                    <div className="space-y-2 mb-6 max-h-72 overflow-y-auto custom-scrollbar pr-2 animate-in fade-in slide-in-from-top-2 duration-300">
                                                        {viewReport.comments && viewReport.comments.length > 0 ? (
                                                            viewReport.comments
                                                                .filter((c: any) => !c.parent_comment_id)
                                                                .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                                                                .map((c: any) => {
                                                                    const replies = viewReport.comments
                                                                        ?.filter((reply: any) => reply.parent_comment_id === c.comment_id)
                                                                        .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) || [];
                                                                    return (
                                                                        <div key={c.comment_id} className="mb-4 last:mb-0">
                                                                            <div className="flex gap-3 relative">
                                                                                {/* Parent Avatar & Vertical Line */}
                                                                                <div className="relative flex flex-col items-center shrink-0">
                                                                                    <div className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center text-[#F97316] font-black text-xs z-10 ring-4 ring-white border border-orange-100">
                                                                                        {c.user_name?.charAt(0).toUpperCase() || 'U'}
                                                                                    </div>
                                                                                    {(replies.length > 0 || replyingTo[viewReport.report_id]?.commentId === c.comment_id) && (
                                                                                        <div className="absolute top-8 bottom-[-16px] left-1/2 -translate-x-1/2 w-[2px] bg-gray-100 z-0"></div>
                                                                                    )}
                                                                                </div>

                                                                                <div className="flex-1 pb-1">
                                                                                    {/* Parent Bubble */}
                                                                                    <div className="bg-[#FAFAF9] rounded-[1.5rem] p-3.5 px-4 border border-gray-50 shadow-sm inline-block">
                                                                                        <span className="block text-[11px] font-black text-[#1a1208] mb-0.5">{c.user_name || 'User'}</span>
                                                                                        <p className="text-xs font-semibold text-gray-700 leading-relaxed pr-6">{c.comment}</p>
                                                                                    </div>
                                                                                    {/* Parent Actions */}
                                                                                    <div className="flex items-center gap-4 mt-1.5 ml-3">
                                                                                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">{new Date(c.created_at).toLocaleDateString()}</span>
                                                                                        <button
                                                                                            onClick={() => setReplyingTo(prev => ({ ...prev, [viewReport.report_id]: { commentId: c.comment_id, userName: c.user_name || 'User' } }))}
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
                                                                                                    {index === replies.length - 1 && replyingTo[viewReport.report_id]?.commentId !== c.comment_id && (
                                                                                                        <div className="absolute top-[16px] bottom-[-100px] left-[-30px] w-[6px] bg-white z-0 pointer-events-none"></div>
                                                                                                    )}

                                                                                                    {/* Child Avatar */}
                                                                                                    <div className="w-6 h-6 rounded-full bg-gray-50 flex items-center justify-center text-gray-500 font-bold text-[10px] z-10 mt-1 ring-4 ring-white border border-gray-100 shrink-0">
                                                                                                        {reply.user_name?.charAt(0).toUpperCase() || 'U'}
                                                                                                    </div>

                                                                                                    <div className="flex-1">
                                                                                                        {/* Child Bubble */}
                                                                                                        <div className="bg-[#FAFAF9] rounded-[1.2rem] p-3 px-4 border border-gray-50 shadow-sm inline-block">
                                                                                                            <span className="block text-[10px] font-black text-gray-800 mb-0.5">{reply.user_name || 'User'}</span>
                                                                                                            <p className="text-[11px] font-semibold text-gray-600 leading-relaxed pr-4">{reply.comment}</p>
                                                                                                        </div>
                                                                                                        {/* Child Actions */}
                                                                                                        <div className="flex items-center gap-4 mt-1.5 ml-3">
                                                                                                            <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">{new Date(reply.created_at).toLocaleDateString()}</span>
                                                                                                            <button
                                                                                                                onClick={() => setReplyingTo(prev => ({ ...prev, [viewReport.report_id]: { commentId: c.comment_id, userName: reply.user_name || 'User' } }))}
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
                                                                                    {replyingTo[viewReport.report_id]?.commentId === c.comment_id && (
                                                                                        <div className="mt-4 flex items-center gap-3 relative z-10 animate-in fade-in slide-in-from-top-2 duration-200">
                                                                                            <div className="absolute top-[-10px] left-[-28px] w-[28px] h-[24px] border-b-[2px] border-l-[2px] border-gray-100 rounded-bl-[12px] z-0 pointer-events-none"></div>
                                                                                            <div className="absolute top-[14px] bottom-[-100px] left-[-30px] w-[6px] bg-white z-0 pointer-events-none"></div>

                                                                                            <div className="w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center text-[#F97316] font-black text-[10px] shrink-0 border border-orange-200 z-10 bg-white ring-4 ring-white">
                                                                                                {currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : 'A'}
                                                                                            </div>
                                                                                            <div className="flex-1 relative flex items-center">
                                                                                                <input
                                                                                                    type="text"
                                                                                                    autoFocus
                                                                                                    placeholder={`Replying to ${replyingTo[viewReport.report_id]?.userName}...`}
                                                                                                    className="w-full bg-[#FAFAF9] border border-gray-100 rounded-[1.2rem] pl-4 pr-10 py-2 text-[11px] font-semibold text-[#1a1208] focus:outline-none focus:border-orange-200 focus:bg-white transition-all placeholder:text-gray-400 shadow-inner"
                                                                                                    value={commentInputs[viewReport.report_id] || ''}
                                                                                                    onChange={(e) => setCommentInputs(prev => ({ ...prev, [viewReport.report_id]: e.target.value }))}
                                                                                                    onKeyPress={(e) => e.key === 'Enter' && handleAddComment(viewReport.report_id)}
                                                                                                />
                                                                                                <button
                                                                                                    onClick={() => {
                                                                                                        setReplyingTo(prev => ({ ...prev, [viewReport.report_id]: null }));
                                                                                                        setCommentInputs(prev => ({ ...prev, [viewReport.report_id]: '' }));
                                                                                                    }}
                                                                                                    className="absolute right-3 text-gray-400 hover:text-red-500 transition-colors"
                                                                                                >
                                                                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                                                                                    </svg>
                                                                                                </button>
                                                                                            </div>
                                                                                            <button
                                                                                                onClick={() => handleAddComment(viewReport.report_id)}
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

                                                {!replyingTo[viewReport.report_id] && (
                                                    <div className="flex items-center gap-3 animate-in fade-in duration-200 border-t border-gray-50 pt-4 mt-2">
                                                        <div className="flex-1 relative">
                                                            <input
                                                                type="text"
                                                                placeholder="Write a comment as Admin..."
                                                                className="w-full bg-[#FAFAF9] border border-gray-100 rounded-[1.5rem] pl-5 pr-12 py-3 text-xs font-semibold text-[#1a1208] focus:outline-none focus:border-orange-200 focus:bg-white transition-all placeholder:text-gray-300 shadow-inner"
                                                                value={commentInputs[viewReport.report_id] || ''}
                                                                onChange={(e) => setCommentInputs(prev => ({ ...prev, [viewReport.report_id]: e.target.value }))}
                                                                onKeyPress={(e) => e.key === 'Enter' && handleAddComment(viewReport.report_id)}
                                                            />
                                                        </div>
                                                        <button
                                                            onClick={() => handleAddComment(viewReport.report_id)}
                                                            className="bg-[#F97316] text-white rounded-[1.2rem] p-3 shadow-md shadow-orange-100 hover:scale-105 active:scale-95 transition-all flex-shrink-0"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                )}
                                            </div>

                                            {/* ACTION PANEL */}
                                            <div className="mt-8 pt-8 border-t border-gray-100">
                                                <div className="flex flex-col gap-3">
                                                    {viewReport.status_id < 4 && (
                                                        <button
                                                            onClick={() => {
                                                                setEscalatingReportId(viewReport.report_id);
                                                                setIsEscalateModalOpen(true);
                                                                setViewingReportId(null);
                                                            }}
                                                            className="w-full py-4 bg-orange-600 text-white rounded-2xl text-xs font-bold shadow-lg shadow-orange-100 hover:bg-orange-700 transition-all transform hover:-translate-y-1 active:scale-95 flex items-center justify-center gap-2"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                                            </svg>
                                                            ESCALATE TO BARANGAY FOR RESCUE
                                                        </button>
                                                    )}

                                                    {viewReport.status_id !== 6 && (
                                                        <button
                                                            onClick={() => {
                                                                handleUpdateStatus(viewReport.report_id, 11);
                                                                setViewingReportId(null);
                                                            }}
                                                            className="w-full py-3 border border-gray-100 rounded-2xl text-[10px] font-bold text-gray-400 hover:bg-green-50 hover:text-green-600 hover:border-green-100 transition-all uppercase tracking-widest"
                                                        >
                                                            Mark as Resolved
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Overlay */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="px-8 py-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <div>
                                <h3 className="text-xl font-bold text-gray-900">Report New Incident</h3>
                                <p className="text-xs text-gray-500 mt-1">Provide details about the stray or animal incident observed.</p>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-all">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <form onSubmit={handleSaveReport} className="p-8 max-h-[75vh] overflow-y-auto custom-scrollbar">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Animal Type (Dog/Cat) */}
                                <div className="flex flex-col">
                                    <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest mb-4">Animal Type</label>
                                    <div className="flex items-center gap-8 h-10">
                                        {['Dog', 'Cat'].map((cat) => (
                                            <label key={cat} className="flex items-center gap-3 cursor-pointer group">
                                                <div className="relative flex items-center justify-center">
                                                    <input
                                                        type="radio"
                                                        name="category"
                                                        className="peer appearance-none w-5 h-5 rounded-full border-2 border-gray-200 checked:border-[#F97316] transition-all cursor-pointer"
                                                        checked={formData.category === cat}
                                                        onChange={() => setFormData({ ...formData, category: cat })}
                                                    />
                                                    <div className="absolute w-2.5 h-2.5 rounded-full bg-[#F97316] scale-0 peer-checked:scale-100 transition-transform duration-200" />
                                                </div>
                                                <span className={`text-[10px] font-black uppercase tracking-widest transition-colors ${formData.category === cat ? 'text-[#1a1208]' : 'text-gray-400 group-hover:text-gray-600'}`}>
                                                    {cat}
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                <Select
                                    label="Incident Category"
                                    value={formData.category_id.toString()}
                                    onChange={(e) => setFormData({ ...formData, category_id: parseInt(e.target.value) })}
                                    options={[
                                        { value: '1', label: 'Injured Animal' },
                                        { value: '2', label: 'Aggressive Stray' },
                                        { value: '3', label: 'Possible Rabies Risk' },
                                        { value: '4', label: 'Roaming Pack' },
                                        { value: '5', label: 'Animal Rescue Needed' }
                                    ]}
                                />

                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Breed (Optional)</label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm focus:ring-2 focus:ring-[#F97316] outline-none transition-all"
                                        value={formData.breed}
                                        onChange={(e) => setFormData({ ...formData, breed: e.target.value })}
                                        placeholder="e.g. Aspin, Golden Retriever"
                                    />
                                </div>

                                <Select
                                    label="Priority Level"
                                    value={formData.priority_level}
                                    onChange={(e) => setFormData({ ...formData, priority_level: e.target.value })}
                                    options={[
                                        { value: 'Low', label: 'Low' },
                                        { value: 'Regular', label: 'Regular' },
                                        { value: 'High', label: 'High' },
                                        { value: 'Emergency', label: 'Emergency' }
                                    ]}
                                />

                                {/* Condition */}
                                <div className="md:col-span-2">
                                    <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest mb-4 block">Animal Condition</label>
                                    <div className="flex flex-wrap gap-3">
                                        {['Healthy', 'Injured', 'Aggressive', 'Thin'].map((cond) => (
                                            <button
                                                key={cond}
                                                type="button"
                                                onClick={() => setFormData({ ...formData, condition: cond })}
                                                className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${formData.condition === cond
                                                    ? 'bg-[#F97316] text-white border-[#F97316] shadow-lg shadow-orange-100'
                                                    : 'bg-white text-gray-400 border-gray-100 hover:border-orange-100'
                                                    }`}
                                            >
                                                {cond}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Animal Count */}
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest mb-4 block">Number of Animals</label>
                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center bg-gray-50 rounded-xl p-1 border border-gray-100">
                                            <button
                                                type="button"
                                                onClick={() => setFormData({ ...formData, animal_count: Math.max(1, formData.animal_count - 1) })}
                                                className="w-8 h-8 rounded-lg bg-white shadow-sm flex items-center justify-center text-[#F97316] hover:bg-orange-50 transition-all active:scale-90"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M20 12H4" />
                                                </svg>
                                            </button>
                                            <div className="w-10 text-center text-sm font-black text-[#1a1208]">
                                                {formData.animal_count}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setFormData({ ...formData, animal_count: formData.animal_count + 1 })}
                                                className="w-8 h-8 rounded-lg bg-white shadow-sm flex items-center justify-center text-[#F97316] hover:bg-orange-50 transition-all active:scale-90"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Landmark</label>
                                    <input
                                        type="text" required
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm focus:ring-2 focus:ring-[#F97316] outline-none transition-all"
                                        value={formData.landmark}
                                        onChange={(e) => setFormData({ ...formData, landmark: e.target.value })}
                                        placeholder="e.g. Near Clubhouse"
                                    />
                                </div>

                                {/* Behavior Tags */}
                                <div className="md:col-span-2">
                                    <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest mb-4 block">Behavior / Traits</label>
                                    <div className="flex flex-wrap gap-2">
                                        {['Friendly', 'Frightened', 'Nursing', 'Barking', 'Roaming'].map((tag) => (
                                            <button
                                                key={tag}
                                                type="button"
                                                onClick={() => {
                                                    const tags = formData.behaviorTags.includes(tag)
                                                        ? formData.behaviorTags.filter(t => t !== tag)
                                                        : [...formData.behaviorTags, tag];
                                                    setFormData({ ...formData, behaviorTags: tags });
                                                }}
                                                className={`px-4 py-2 rounded-full text-[9px] font-bold border transition-all flex items-center gap-2 ${formData.behaviorTags.includes(tag)
                                                    ? 'bg-orange-50 text-[#F97316] border-[#F97316]'
                                                    : 'bg-white text-gray-400 border-gray-100 hover:border-orange-100'
                                                    }`}
                                            >
                                                {formData.behaviorTags.includes(tag) && <div className="w-1 h-1 rounded-full bg-[#F97316]" />}
                                                {tag}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Consolidated Media Upload */}
                                <div className="md:col-span-2">
                                    <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest mb-4 block">Upload Photos or Videos</label>
                                    <div className="relative">
                                        {formData.mediaFiles.length > 0 ? (
                                            <div className="space-y-4">
                                                {/* Grid Preview (Facebook-like) */}
                                                <div
                                                    className={`relative grid gap-2 rounded-[2rem] overflow-hidden border-2 border-orange-500 bg-orange-50/10 p-2 cursor-pointer group/grid ${formData.mediaFiles.length === 1 ? 'grid-cols-1' :
                                                        formData.mediaFiles.length === 2 ? 'grid-cols-2' :
                                                            'grid-cols-2'
                                                        }`}
                                                    onClick={() => document.getElementById('admin-multi-upload')?.click()}
                                                >
                                                    {formData.mediaFiles.slice(0, 4).map((file, index) => (
                                                        <div key={index} className={`relative aspect-square rounded-2xl overflow-hidden group/item ${formData.mediaFiles.length === 3 && index === 0 ? 'row-span-2 aspect-auto' : ''
                                                            }`}>
                                                            {file.type.startsWith('video/') ? (
                                                                <video
                                                                    src={URL.createObjectURL(file)}
                                                                    className="w-full h-full object-cover"
                                                                />
                                                            ) : (
                                                                <img
                                                                    src={URL.createObjectURL(file)}
                                                                    alt="Preview"
                                                                    className="w-full h-full object-cover"
                                                                />
                                                            )}
                                                            {index === 3 && formData.mediaFiles.length > 4 && (
                                                                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                                                    <span className="text-white text-xl font-black">+{formData.mediaFiles.length - 4}</span>
                                                                </div>
                                                            )}
                                                            {/* Delete individual button */}
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    const newFiles = [...formData.mediaFiles];
                                                                    newFiles.splice(index, 1);
                                                                    setFormData({ ...formData, mediaFiles: newFiles });
                                                                }}
                                                                className="absolute top-2 right-2 bg-black/40 hover:bg-red-500 text-white rounded-full p-1.5 opacity-0 group-hover/item:opacity-100 transition-all z-[30]"
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                                                                </svg>
                                                            </button>
                                                        </div>
                                                    ))}

                                                    {/* Hover Add More Overlay */}
                                                    <div className="absolute inset-0 bg-orange-600/20 backdrop-blur-[2px] opacity-0 group-hover/grid:opacity-100 transition-all flex flex-col items-center justify-center gap-2 z-20">
                                                        <div className="w-12 h-12 rounded-full bg-white shadow-xl flex items-center justify-center text-[#F97316]">
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                                                            </svg>
                                                        </div>
                                                        <span className="text-[10px] font-black text-white uppercase tracking-[0.2em] drop-shadow-md">Add More Photos</span>
                                                    </div>
                                                </div>

                                                <div className="flex justify-end">
                                                    <button
                                                        type="button"
                                                        onClick={() => setFormData({ ...formData, mediaFiles: [] })}
                                                        className="text-[10px] font-black text-red-400 uppercase tracking-widest hover:text-red-600 transition-all py-1"
                                                    >
                                                        Clear Selection
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div
                                                className="w-full aspect-video rounded-[2rem] border-2 border-dashed border-gray-100 bg-[#FAFAF9] flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-orange-200 hover:bg-orange-50/10 transition-all group"
                                                onClick={() => document.getElementById('admin-multi-upload')?.click()}
                                            >
                                                <div className="w-16 h-16 rounded-[1.5rem] bg-white shadow-sm flex items-center justify-center text-gray-300 group-hover:text-[#F97316] transition-colors">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                                    </svg>
                                                </div>
                                                <div className="text-center">
                                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Tap to add Photos or Videos</p>
                                                    <p className="text-[9px] font-bold text-gray-300 uppercase tracking-widest mt-1">Multiple files supported</p>
                                                </div>
                                            </div>
                                        )}
                                        <input
                                            id="admin-multi-upload"
                                            type="file"
                                            className="hidden"
                                            accept="image/*,video/*"
                                            multiple
                                            onChange={(e) => {
                                                const files = Array.from(e.target.files || []);
                                                setFormData(prev => ({
                                                    ...prev,
                                                    mediaFiles: [...prev.mediaFiles, ...files]
                                                }));
                                            }}
                                        />
                                    </div>
                                </div>

                                {/* Map Location Picker */}
                                <div className="md:col-span-2">
                                    <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest mb-4 block">Pinpoint Location</label>
                                    <div className="w-full h-64 rounded-[2rem] overflow-hidden border border-gray-100 shadow-sm relative mb-6">
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
                                        </MapContainer>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Latitude</label>
                                            <input
                                                type="number" step="any" required readOnly
                                                className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm focus:ring-2 focus:ring-[#F97316] outline-none transition-all"
                                                value={formData.latitude}
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Longitude</label>
                                            <input
                                                type="number" step="any" required readOnly
                                                className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm focus:ring-2 focus:ring-[#F97316] outline-none transition-all"
                                                value={formData.longitude}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Visibility Settings */}
                                <div className="md:col-span-2">
                                    <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest mb-4 block">Report Visibility</label>
                                    <div className="grid grid-cols-2 gap-4">
                                        <label className={`relative flex flex-col p-5 rounded-2xl border-2 cursor-pointer transition-all ${formData.visibility === 'Public' ? 'border-[#F97316] bg-orange-50/20' : 'border-gray-50 bg-[#FAFAF9] hover:border-orange-100'}`}>
                                            <input
                                                type="radio"
                                                name="visibility"
                                                value="Public"
                                                checked={formData.visibility === 'Public'}
                                                onChange={(e) => setFormData({ ...formData, visibility: e.target.value })}
                                                className="absolute opacity-0"
                                            />
                                            <div className="flex items-center gap-3 mb-2">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${formData.visibility === 'Public' ? 'bg-[#F97316] text-white' : 'bg-gray-100 text-gray-400'}`}>
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                    </svg>
                                                </div>
                                                <span className={`text-[12px] font-black uppercase tracking-widest ${formData.visibility === 'Public' ? 'text-[#F97316]' : 'text-gray-600'}`}>Public Post</span>
                                            </div>
                                            <p className="text-[10px] font-bold text-gray-400 leading-relaxed ml-11">Visible to all users in the subdivision feed.</p>
                                        </label>
                                        <label className={`relative flex flex-col p-5 rounded-2xl border-2 cursor-pointer transition-all ${formData.visibility === 'Private' ? 'border-[#F97316] bg-orange-50/20' : 'border-gray-50 bg-[#FAFAF9] hover:border-orange-100'}`}>
                                            <input
                                                type="radio"
                                                name="visibility"
                                                value="Private"
                                                checked={formData.visibility === 'Private'}
                                                onChange={(e) => setFormData({ ...formData, visibility: e.target.value })}
                                                className="absolute opacity-0"
                                            />
                                            <div className="flex items-center gap-3 mb-2">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${formData.visibility === 'Private' ? 'bg-[#F97316] text-white' : 'bg-gray-100 text-gray-400'}`}>
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                                    </svg>
                                                </div>
                                                <span className={`text-[12px] font-black uppercase tracking-widest ${formData.visibility === 'Private' ? 'text-[#F97316]' : 'text-gray-600'}`}>Private Post</span>
                                            </div>
                                            <p className="text-[10px] font-bold text-gray-400 leading-relaxed ml-11">Only visible to Staff.</p>
                                        </label>
                                    </div>
                                </div>

                                <div className="space-y-1.5 md:col-span-2">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Description</label>
                                    <textarea
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm focus:ring-2 focus:ring-[#F97316] outline-none transition-all min-h-[100px]"
                                        value={formData.description}
                                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                        placeholder="Provide any extra information that might help responders..."
                                    />
                                </div>
                            </div>

                            <div className="mt-8 pt-6 border-t border-gray-50 flex items-center justify-end space-x-3">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-6 py-2.5 text-sm font-bold text-gray-500 hover:text-gray-700 transition-colors"
                                >
                                    Cancel
                                </button>
                                <Button variant="primary" type="submit" className="px-10">
                                    Submit Report
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <SuccessModal
                isOpen={showSuccess}
                message="Report added successfully!"
            />
            {/* Escalate to Barangay Modal */}
            {isEscalateModalOpen && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="px-8 py-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <div>
                                <h3 className="text-xl font-bold text-gray-900">Escalate to Barangay</h3>
                                <p className="text-xs text-gray-500 mt-1">Formalize the request for Barangay assistance.</p>
                            </div>
                            <button onClick={() => setIsEscalateModalOpen(false)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-all">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <form onSubmit={handleEscalate} className="p-8 space-y-6">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Request Title</label>
                                <input
                                    type="text" required
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm focus:ring-2 focus:ring-[#F97316] outline-none transition-all"
                                    value={escalationData.title}
                                    onChange={(e) => setEscalationData({ ...escalationData, title: e.target.value })}
                                    placeholder="e.g. Urgent Rescue Request for Brgy. San Vicente"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Endorsement Message</label>
                                <textarea
                                    required
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm focus:ring-2 focus:ring-[#F97316] outline-none transition-all min-h-[100px]"
                                    value={escalationData.description}
                                    onChange={(e) => setEscalationData({ ...escalationData, description: e.target.value })}
                                    placeholder="Briefly explain why this needs Barangay intervention..."
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Endorsement Letter (PDF/Image)</label>
                                <div className="relative group cursor-pointer">
                                    <input
                                        type="file"
                                        required
                                        accept=".pdf,image/*"
                                        className="hidden"
                                        id="letter-upload"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) setEscalationData({ ...escalationData, endorsement_letter: file });
                                        }}
                                    />
                                    <label
                                        htmlFor="letter-upload"
                                        className="flex flex-col items-center justify-center w-full p-6 border-2 border-dashed border-gray-200 rounded-2xl bg-gray-50 group-hover:border-orange-300 group-hover:bg-orange-50/30 transition-all cursor-pointer"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-gray-400 group-hover:text-orange-500 mb-2 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                        </svg>
                                        <span className="text-[11px] font-bold text-gray-500 group-hover:text-orange-600">
                                            {escalationData.endorsement_letter ? escalationData.endorsement_letter.name : 'Click to upload official letter'}
                                        </span>
                                    </label>
                                </div>
                            </div>

                            <div className="pt-4 flex items-center justify-end space-x-3">
                                <button
                                    type="button"
                                    onClick={() => setIsEscalateModalOpen(false)}
                                    className="px-6 py-2.5 text-sm font-bold text-gray-500 hover:text-gray-700 transition-colors"
                                >
                                    Cancel
                                </button>
                                <Button variant="primary" type="submit" className="px-10 !bg-[#F97316] hover:!bg-[#EA580C] !border-[#F97316]">
                                    Escalate Now
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
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
                        ) : activeGallery.media[activeGallery.index].media_type === 'Document' ? (
                            <iframe
                                src={activeGallery.media[activeGallery.index].file_url}
                                className="w-full h-full bg-white rounded-3xl shadow-2xl"
                                title="Document Viewer"
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
        </div>
    );
};

export default AdminReport;
