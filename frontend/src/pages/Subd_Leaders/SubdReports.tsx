import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import SubdSidebar from '../../components/SubdSidebar';
import SubdNavbar from '../../components/Navbars/SubdNavbar';
import Button from '../../components/Button';
import SuccessModal from '../../components/Modals/SuccessModal';
import Select from '../../components/Dropdown';
import MapComponent from '../../components/MapComponent';
import DataTable from '../../components/DataTable';
import AISuggestionPanel from '../../components/AISuggestionPanel';

interface Report {
    report_id: number;
    category_id: number;
    status_id: number;
    priority_level: string;
    latitude: number;
    longitude: number;
    landmark: string;
    animal_count: number;
    animal_type: string;
    breed?: string;
    condition: string;
    behavior_tags?: string;
    description: string;
    visibility: string;
    created_at: string;
    user_id: number;
    reporter_name?: string;
    media?: any[];
    comments?: any[];
    ai_animal_type?: string | null;
    ai_dominant_color?: string | null;
    ai_estimated_size?: string | null;
    ai_suggested_risk_level?: string | null;
    ai_suggested_priority?: string | null;
    ai_possible_breed?: string | null;
}

const statusMap: Record<number, string> = {
    1: 'Reported',
    2: 'Verified',
    3: 'Rejected',
    4: 'Escalated to Barangay',
    13: 'Approved',
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

const SubdReports = () => {
    const navigate = useNavigate();

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
    const [endorsementFile, setEndorsementFile] = useState<File | null>(null);
    const [isEscalating, setIsEscalating] = useState(false);
    const [escalationTitle, setEscalationTitle] = useState('');
    const [escalationDescription, setEscalationDescription] = useState('');
    const [activeGallery, setActiveGallery] = useState<{ media: any[], index: number } | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const [isNavigating, setIsNavigating] = useState(false);
    const [navSource, setNavSource] = useState<'brgy' | 'current'>('brgy');
    const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
    const BRGY_OFFICE: [number, number] = [14.8069, 121.0039]; // R243+QH Santa Maria, Bulacan

    const userStr = localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user');
    const currentUser = userStr ? JSON.parse(userStr) : null;
    const currentUserId = currentUser ? currentUser.user_id : 1;

    const [commentInputs, setCommentInputs] = useState<Record<number, string>>({});
    const [replyingTo, setReplyingTo] = useState<Record<number, { commentId: number, userName: string } | null>>({});
    const [expandedComments, setExpandedComments] = useState<Record<number, boolean>>({});

    useEffect(() => {
        if (!userStr) {
            navigate('/staff/login');
        } else {
            try {
                if (currentUser.role_id !== 2) {
                    navigate('/staff/login');
                }
            } catch {
                navigate('/staff/login');
            }
        }
    }, [navigate, userStr, currentUser]);

    useEffect(() => {
        if (isNavigating && navSource === 'current') {
            if ("geolocation" in navigator) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        setUserLocation([position.coords.latitude, position.coords.longitude]);
                    },
                    (error) => {
                        console.error("Error getting location:", error);
                        setNavSource('brgy');
                    }
                );
            }
        }
    }, [isNavigating, navSource]);

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
        animal_type: 'Dog',
        breed: '',
        condition: 'Healthy',
        animal_count: 1,
        behavior_tags: [] as string[],
        latitude: 14.8013,
        longitude: 121.0031,
        landmark: '',
        priority_level: 'Regular',
        visibility: 'Public',
        description: '',
        mediaFiles: [] as File[]
    });

    const API_URL = 'http://localhost:8000/reports';

    const fetchReports = async () => {
        try {
            setLoading(true);
            const response = await axios.get(`${API_URL}/`);
            // Sort by report_id descending to show new reports at the top
            const sortedData = (response.data || []).sort((a: any, b: any) => b.report_id - a.report_id);
            // Ensure unique reports by ID to prevent doubling
            const uniqueReports = sortedData.filter((report: any, index: number, self: any[]) =>
                index === self.findIndex((t: any) => t.report_id === report.report_id)
            );
            setReports(uniqueReports);
        } catch (error) {
            console.error('Error fetching reports:', error);
            setReports([]);
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
            alert('Failed to post comment.');
        }
    };

    const handleUpdateStatus = async (id: number, newStatusId: number) => {
        try {
            await axios.patch(`${API_URL}/${id}/status`, {
                status_id: newStatusId,
                user_id: currentUserId,
                remarks: newStatusId === 2 ? "Incident report has been officially verified by the Subdivision Leader." : undefined
            });
            fetchReports();
        } catch (error) {
            console.error('Error updating status:', error);
            alert('Failed to update status. Please try again.');
        }
    };

    const handleEscalate = async () => {
        if (!escalatingReportId || !endorsementFile) {
            alert('Please select an endorsement letter file.');
            return;
        }

        try {
            setIsEscalating(true);

            // 1. Upload the letter
            const formData = new FormData();
            formData.append('file', endorsementFile);
            formData.append('is_evidence', 'true'); // Mark as evidence so it does NOT appear in the public feed
            await axios.post(`${API_URL}/${escalatingReportId}/media`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            // 2. Update status to Forwarded (4)
            await axios.patch(`${API_URL}/${escalatingReportId}/status`, {
                status_id: 4,
                user_id: currentUserId,
                remarks: "Report forwarded to Barangay Operations for official review and approval."
            });

            // 3. Create official Rescue Request record
            await axios.post('http://localhost:8000/rescue-requests/', {
                report_id: escalatingReportId,
                leader_id: currentUserId,
                title: escalationTitle,
                description: escalationDescription,
                status_id: 1 // Pending
            });

            setIsEscalateModalOpen(false);
            setEscalatingReportId(null);
            setEndorsementFile(null);
            setEscalationTitle('');
            setEscalationDescription('');
            setShowSuccess(true);
            fetchReports();
            setTimeout(() => setShowSuccess(false), 3000);
        } catch (error) {
            console.error('Error escalating report:', error);
            alert('Failed to escalate report. Please try again.');
        } finally {
            setIsEscalating(false);
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

    const toggleBehaviorTag = (tag: string) => {
        setFormData(prev => ({
            ...prev,
            behavior_tags: prev.behavior_tags.includes(tag)
                ? prev.behavior_tags.filter(t => t !== tag)
                : [...prev.behavior_tags, tag]
        }));
    };

    const handleSaveReport = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (!currentUser) throw new Error('User not authenticated');

            const response = await axios.post(API_URL, {
                ...formData,
                behavior_tags: formData.behavior_tags.join(','),
                user_id: currentUser.user_id,
                subdivision_id: currentUser.subdivision_id || 1,
                status_id: 1,
                is_archived: false
            });

            const reportId = response.data.report_id;

            // Upload media if present
            if (formData.mediaFiles && formData.mediaFiles.length > 0) {
                let failCount = 0;
                for (const file of formData.mediaFiles) {
                    const mediaData = new FormData();
                    mediaData.append("file", file);

                    try {
                        await axios.post(`${API_URL}/${reportId}/media`, mediaData, {
                            headers: { 'Content-Type': 'multipart/form-data' }
                        });
                    } catch (err) {
                        console.error('Failed to upload media:', err);
                        failCount++;
                    }
                }
                if (failCount > 0) {
                    alert(`${failCount} media files failed to upload. The report was saved otherwise.`);
                }
            }

            setIsModalOpen(false);
            setShowSuccess(true);
            setFormData({
                category_id: 1,
                animal_type: 'Dog',
                breed: '',
                condition: 'Healthy',
                animal_count: 1,
                behavior_tags: [],
                latitude: 14.8013,
                longitude: 121.0031,
                landmark: '',
                priority_level: 'Regular',
                visibility: 'Public',
                description: '',
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
        // optionally filter by subdId: if (rep.subdivision_id !== currentUser?.subdivision_id) return false;
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
                return 'bg-amber-50 text-amber-600 border-amber-100';
            case 'verified':
                return 'bg-blue-50 text-blue-600 border-blue-100';
            case 'escalated to barangay':
                return 'bg-purple-50 text-purple-600 border-purple-100';
            case 'approved':
                return 'bg-indigo-50 text-indigo-600 border-indigo-100';
            case 'in action':
            case 'ongoing':
            case 'rescue in progress':
                return 'bg-orange-50 text-orange-600 border-orange-100';
            case 'resolved':
                return 'bg-green-50 text-green-600 border-green-100';
            default:
                return 'bg-gray-50 text-gray-600 border-gray-100';
        }
    };

    return (
        <div className="flex h-screen bg-[#F8FAFC]">
            <SubdSidebar />

            <div className="flex-1 flex flex-col overflow-hidden">
                {/* TOP NAVIGATION */}
                <SubdNavbar />

                <main className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                    <div className="max-w-7xl mx-auto">
                        {/* Header */}
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900">Community Incident Reports</h1>
                                <p className="text-gray-500 text-sm mt-1">Monitor and manage reported animal incidents in your subdivision.</p>
                            </div>
                            <div className="flex items-center space-x-3">
                                <Button variant="light" className="flex items-center space-x-2" onClick={fetchReports}>
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                    <span>Refresh</span>
                                </Button>
                                <Button variant="primary" className="flex items-center space-x-2 px-6 !bg-[#F97316] hover:!bg-[#EA580C] !border-[#F97316]" onClick={() => setIsModalOpen(true)}>
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
                                        { value: 'Reported', label: 'Reported' },
                                        { value: 'Verified', label: 'Verified' },
                                        { value: 'Escalated to Barangay', label: 'Escalated' },
                                        { value: 'Approved', label: 'Approved' },
                                        { value: 'Rescue In Progress', label: 'In Progress' }
                                    ]}
                                    className="w-[140px]"
                                />
                            </div>
                        </div>

                        <DataTable
                            loading={loading}
                            data={filteredReports}
                            emptyMessage="No incident reports found."
                            loadingMessage="Synchronizing reports..."
                            onRowClick={(rep) => setViewingReportId(rep.report_id)}
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
                                            <span className="w-2 h-2 rounded-full bg-[#F97316]"></span>
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
                                                    {rep.status_id !== 11 && (
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
                                    <div className="space-y-8">
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
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-gray-50 p-6 rounded-2xl border border-gray-100">
                                            <div>
                                                <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Category</span>
                                                <span className="text-sm font-semibold text-gray-900">{categoryMap[viewReport.category_id] || 'Other'}</span>
                                            </div>
                                            {!(viewReport.ai_suggested_priority && 
                                               ((p1, p2) => p1.toLowerCase().replace('priority', '').replace('level', '').trim() === p2.toLowerCase().replace('priority', '').replace('level', '').trim())(viewReport.ai_suggested_priority, viewReport.priority_level)) && (
                                                <div>
                                                    <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Priority</span>
                                                    <span className={`text-sm font-bold ${getPriorityColor(viewReport.priority_level).replace('bg-', 'text-').replace('-50', '-600')}`}>
                                                        {viewReport.priority_level}
                                                    </span>
                                                </div>
                                            )}
                                            <div>
                                                <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Rescue Status</span>
                                                <span className={`text-sm font-bold ${viewReport.status_id >= 5 ? 'text-blue-600' : 'text-gray-400'}`}>
                                                    {viewReport.status_id >= 5 ? statusMap[viewReport.status_id] : 'Not Yet Initiated'}
                                                </span>
                                            </div>
                                            <div>
                                                <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Animals</span>
                                                <span className="text-sm font-semibold text-gray-900">{viewReport.animal_count} observed</span>
                                            </div>
                                            <div>
                                                <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Landmark</span>
                                                <span className="text-sm font-semibold text-gray-900">{viewReport.landmark || 'N/A'}</span>
                                            </div>
                                            <div>
                                                <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Coordinates</span>
                                                <span className="text-xs font-mono text-gray-600">{viewReport.latitude}, {viewReport.longitude}</span>
                                            </div>
                                        </div>

                                        {/* AI Suggestion Panel */}
                                         <AISuggestionPanel
                                             animalType={viewReport.ai_animal_type}
                                             dominantColor={viewReport.ai_dominant_color}
                                             estimatedSize={viewReport.ai_estimated_size}
                                             suggestedRiskLevel={viewReport.ai_suggested_risk_level}
                                             suggestedPriority={viewReport.ai_suggested_priority}
                                             possibleBreed={viewReport.ai_possible_breed}
                                         />

                                        {/* Map Location */}
                                        <div>
                                            <h5 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">Incident Location Map</h5>
                                            <div className="w-full h-64 rounded-2xl overflow-hidden border border-gray-100 shadow-sm bg-gray-50">
                                                <MapComponent
                                                    center={[viewReport.latitude, viewReport.longitude]}
                                                    zoom={17}
                                                    showHeatmap={false}
                                                    markers={[
                                                        {
                                                            id: viewReport.report_id,
                                                            lat: viewReport.latitude,
                                                            lng: viewReport.longitude,
                                                            title: viewReport.landmark || 'Incident Location',
                                                            category: categoryMap[viewReport.category_id],
                                                            priority: viewReport.priority_level
                                                        },
                                                        {
                                                            id: -1,
                                                            lat: BRGY_OFFICE[0],
                                                            lng: BRGY_OFFICE[1],
                                                            title: "Barangay Hall",
                                                            category: "Barangay Office"
                                                        },
                                                        ...(userLocation ? [{
                                                            id: -2,
                                                            lat: userLocation[0],
                                                            lng: userLocation[1],
                                                            title: "Your Location",
                                                            category: "User Location"
                                                        }] : [])
                                                    ]}
                                                    routing={isNavigating ? {
                                                        start: navSource === 'brgy' ? BRGY_OFFICE : (userLocation || BRGY_OFFICE),
                                                        end: [viewReport.latitude, viewReport.longitude],
                                                        waypointNames: [navSource === 'brgy' ? "Barangay Office" : "Your Location", viewReport.landmark]
                                                    } : undefined}
                                                    onMarkerClick={(m) => {
                                                        if (m.source) {
                                                            setNavSource(m.source);
                                                            setIsNavigating(true);
                                                        } else {
                                                            setIsNavigating(true);
                                                            setNavSource('brgy');
                                                        }
                                                    }}
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

                                        {/* Official Letter Section (Only for Escalated Reports) */}
                                        {viewReport.status_id >= 4 && viewReport.media?.some(m => m.media_type === 'Document' || m.file_url.toLowerCase().endsWith('.pdf') || m.file_url.toLowerCase().endsWith('.docx')) && (
                                            <div>
                                                <h5 className="text-[11px] font-black text-[#1a1208] uppercase tracking-[0.2em] mb-4">Official Subdivision Letter</h5>
                                                <div className="bg-orange-50/50 border border-orange-100 rounded-3xl p-6 flex items-center justify-between">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-12 h-12 rounded-2xl bg-orange-600 flex items-center justify-center text-white shadow-lg">
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                            </svg>
                                                        </div>
                                                        <div>
                                                            <p className="text-xs font-black text-gray-900 uppercase tracking-widest">Endorsement Letter</p>
                                                            <p className="text-[10px] font-bold text-gray-400 mt-0.5">Sent to Barangay for Rescue Request</p>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => {
                                                            const letter = viewReport.media?.find(m => m.media_type === 'Document' || m.file_url.toLowerCase().endsWith('.pdf') || m.file_url.toLowerCase().endsWith('.docx'));
                                                            if (letter) setActiveGallery({ media: [letter], index: 0 });
                                                        }}
                                                        className="px-6 py-2.5 bg-white border border-orange-200 text-orange-600 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-orange-600 hover:text-white transition-all shadow-sm"
                                                    >
                                                        View Letter
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {/* Media Gallery */}
                                        {viewReport.media && viewReport.media.filter(m => {
                                            const url = m.file_url.toLowerCase();
                                            return m.media_type !== 'Document' &&
                                                !url.endsWith('.pdf') &&
                                                !url.endsWith('.doc') &&
                                                !url.endsWith('.docx') &&
                                                !url.endsWith('.txt');
                                        }).length > 0 && (
                                                <div>
                                                    <div className="flex items-center justify-between mb-4">
                                                        <h5 className="text-[11px] font-black text-[#1a1208] uppercase tracking-[0.2em]">Evidence Gallery</h5>
                                                        <span className="text-[10px] font-bold text-gray-400 bg-gray-50 px-3 py-1 rounded-full border border-gray-100">
                                                            {viewReport.media.filter(m => {
                                                                const url = m.file_url.toLowerCase();
                                                                return m.media_type !== 'Document' &&
                                                                    !url.endsWith('.pdf') &&
                                                                    !url.endsWith('.doc') &&
                                                                    !url.endsWith('.docx') &&
                                                                    !url.endsWith('.txt');
                                                            }).length} {viewReport.media.filter(m => {
                                                                const url = m.file_url.toLowerCase();
                                                                return m.media_type !== 'Document' &&
                                                                    !url.endsWith('.pdf') &&
                                                                    !url.endsWith('.doc') &&
                                                                    !url.endsWith('.docx') &&
                                                                    !url.endsWith('.txt');
                                                            }).length === 1 ? 'File' : 'Files'} Attached
                                                        </span>
                                                    </div>

                                                    <div className={`grid gap-3 ${viewReport.media.filter(m => {
                                                        const url = m.file_url.toLowerCase();
                                                        return m.media_type !== 'Document' &&
                                                            !url.endsWith('.pdf') &&
                                                            !url.endsWith('.doc') &&
                                                            !url.endsWith('.docx') &&
                                                            !url.endsWith('.txt');
                                                    }).length === 1 ? 'grid-cols-1' :
                                                        viewReport.media.filter(m => {
                                                            const url = m.file_url.toLowerCase();
                                                            return m.media_type !== 'Document' &&
                                                                !url.endsWith('.pdf') &&
                                                                !url.endsWith('.doc') &&
                                                                !url.endsWith('.docx') &&
                                                                !url.endsWith('.txt');
                                                        }).length === 2 ? 'grid-cols-2' :
                                                            'grid-cols-2 sm:grid-cols-3'
                                                        }`}>
                                                        {viewReport.media.filter(m => {
                                                            const url = m.file_url.toLowerCase();
                                                            return m.media_type !== 'Document' &&
                                                                !url.endsWith('.pdf') &&
                                                                !url.endsWith('.doc') &&
                                                                !url.endsWith('.docx') &&
                                                                !url.endsWith('.txt');
                                                        }).map((m: any, idx: number) => (
                                                            <div
                                                                key={m.media_id}
                                                                onClick={() => {
                                                                    const filtered = viewReport.media!.filter(m => {
                                                                        const url = m.file_url.toLowerCase();
                                                                        return m.media_type !== 'Document' &&
                                                                            !url.endsWith('.pdf') &&
                                                                            !url.endsWith('.doc') &&
                                                                            !url.endsWith('.docx') &&
                                                                            !url.endsWith('.txt');
                                                                    });
                                                                    setActiveGallery({ media: filtered, index: idx });
                                                                }}
                                                                className={`group relative rounded-2xl overflow-hidden bg-gray-100 border border-gray-100 cursor-pointer transition-all hover:scale-[1.02] hover:shadow-xl active:scale-95 ${viewReport.media!.filter(m => {
                                                                    const url = m.file_url.toLowerCase();
                                                                    return m.media_type !== 'Document' &&
                                                                        !url.endsWith('.pdf') &&
                                                                        !url.endsWith('.doc') &&
                                                                        !url.endsWith('.docx') &&
                                                                        !url.endsWith('.txt');
                                                                }).length === 3 && idx === 0 ? 'sm:row-span-2 sm:h-full' : 'aspect-square'
                                                                    }`}
                                                            >
                                                                {m.media_type === 'Video' ? (
                                                                    <div className="relative w-full h-full">
                                                                        <video src={m.file_url} className="w-full h-full object-cover" />
                                                                        <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                                                                            <div className="w-12 h-12 rounded-full bg-white/30 backdrop-blur-md flex items-center justify-center text-white ring-4 ring-white/20">
                                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 fill-current" viewBox="0 0 20 20">
                                                                                    <path d="M4.516 7.548c0-.446.362-.809.808-.809.446 0 .808.363.808.809v4.904c0 .446-.362.809-.808.809-.446 0-.808-.363-.808-.809V7.548zm5.281 0c0-.446.362-.809.808-.809.446 0 .808.363.808.809v4.904c0 .446-.362.809-.808.809-.446 0-.808-.363-.808-.809V7.548z" />
                                                                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                                                                                </svg>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    <img src={m.file_url} alt="Report evidence" className="w-full h-full object-cover" />
                                                                )}

                                                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                                                                    <span className="text-[10px] font-bold text-white uppercase tracking-widest flex items-center gap-2">
                                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                                        </svg>
                                                                        Click to Expand
                                                                    </span>
                                                                </div>
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
                                                                                {c.user_photo ? (
                                                                                    <img src={c.user_photo} className="w-8 h-8 rounded-full object-cover z-10 ring-4 ring-white border border-gray-100 shadow-sm" alt={c.user_name} />
                                                                                ) : (
                                                                                    <div className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center text-[#F97316] font-black text-xs z-10 ring-4 ring-white border border-orange-100">
                                                                                        {c.user_name?.charAt(0).toUpperCase() || 'U'}
                                                                                    </div>
                                                                                )}
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
                                                                                                {reply.user_photo ? (
                                                                                                    <img src={reply.user_photo} className="w-6 h-6 rounded-full object-cover z-10 mt-1 ring-4 ring-white border border-gray-100 shadow-sm shrink-0" alt={reply.user_name} />
                                                                                                ) : (
                                                                                                    <div className="w-6 h-6 rounded-full bg-gray-50 flex items-center justify-center text-gray-500 font-bold text-[10px] z-10 mt-1 ring-4 ring-white border border-gray-100 shrink-0">
                                                                                                        {reply.user_name?.charAt(0).toUpperCase() || 'U'}
                                                                                                    </div>
                                                                                                )}

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
                                                                                            {currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : 'S'}
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
                                                            placeholder="Write a comment as Subdivision Leader..."
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
                                                {/* STEP 1: VERIFY (Only for Pending reports) */}
                                                {viewReport.status_id === 1 && (
                                                    <button
                                                        onClick={() => {
                                                            handleUpdateStatus(viewReport.report_id, 2);
                                                            setViewingReportId(null);
                                                        }}
                                                        className="w-full py-4 bg-blue-600 text-white rounded-2xl text-xs font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all transform hover:-translate-y-1 active:scale-95 flex items-center justify-center gap-2"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                        </svg>
                                                        VERIFY INCIDENT REPORT
                                                    </button>
                                                )}

                                                {/* STEP 2: ESCALATE (Only after verification) */}
                                                {viewReport.status_id === 2 && (
                                                    <button
                                                        onClick={() => {
                                                            setEscalatingReportId(viewReport.report_id);
                                                            setIsEscalateModalOpen(true);
                                                            setViewingReportId(null);
                                                        }}
                                                        className="w-full py-4 bg-orange-600 text-white rounded-2xl text-xs font-bold shadow-lg shadow-orange-100 hover:bg-orange-700 transition-all transform hover:-translate-y-1 active:scale-95 flex items-center justify-center gap-2"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                                        </svg>
                                                        ESCALATE TO BARANGAY
                                                    </button>
                                                )}

                                                {/* STEP 3: PENDING BARANGAY (After escalation) */}
                                                {viewReport.status_id === 4 && (
                                                    <div className="w-full py-4 bg-gray-100 text-gray-500 rounded-2xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 border border-gray-200">
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                        </svg>
                                                        Pending Barangay Review
                                                    </div>
                                                )}

                                                {viewReport.status_id !== 11 && (
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

                                                <button
                                                    onClick={() => {
                                                        handleDelete(viewReport.report_id);
                                                        setViewingReportId(null);
                                                    }}
                                                    className="w-full py-3 border border-gray-100 rounded-2xl text-[10px] font-bold text-gray-400 hover:bg-red-50 hover:text-red-600 hover:border-red-100 transition-all uppercase tracking-widest"
                                                >
                                                    Delete Report
                                                </button>
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
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-3xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col max-h-[95vh]">
                        {/* Header */}
                        <div className="px-10 py-8 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 shrink-0">
                            <div>
                                <h3 className="text-2xl font-black text-[#1a1208] tracking-tight">Report New Incident</h3>
                                <p className="text-xs text-gray-400 mt-1.5 font-medium">Provide details about the stray or animal incident observed.</p>
                            </div>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-all"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Form Body */}
                        <form onSubmit={handleSaveReport} className="p-10 overflow-y-auto custom-scrollbar flex-1 bg-white">
                            <div className="space-y-10">

                                {/* Row 1: Animal Type & Category */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="space-y-3">
                                        <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-[0.2em] ml-1">Animal Type</label>
                                        <div className="flex p-1.5 bg-gray-100/50 rounded-2xl border border-gray-100">
                                            {['Dog', 'Cat'].map((type) => (
                                                <button
                                                    key={type}
                                                    type="button"
                                                    onClick={() => setFormData({ ...formData, animal_type: type })}
                                                    className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${formData.animal_type === type
                                                        ? 'bg-white text-[#F97316] shadow-sm'
                                                        : 'text-gray-400 hover:text-gray-600'
                                                        }`}
                                                >
                                                    {type}
                                                </button>
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
                                </div>

                                {/* Row 2: Breed & Priority */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-[0.2em] ml-1">Breed (Optional)</label>
                                        <input
                                            type="text"
                                            className="w-full px-5 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-medium focus:ring-4 focus:ring-orange-100 focus:border-[#F97316] outline-none transition-all placeholder:text-gray-300"
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
                                </div>

                                {/* Row 3: Condition & Count */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="space-y-3">
                                        <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-[0.2em] ml-1">Animal Condition</label>
                                        <div className="grid grid-cols-2 gap-2">
                                            {['Healthy', 'Injured', 'Aggressive', 'Thin'].map((cond) => (
                                                <button
                                                    key={cond}
                                                    type="button"
                                                    onClick={() => setFormData({ ...formData, condition: cond })}
                                                    className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${formData.condition === cond
                                                        ? 'bg-orange-50 border-orange-200 text-[#F97316]'
                                                        : 'bg-white border-gray-100 text-gray-400 hover:border-gray-200 hover:text-gray-600'
                                                        }`}
                                                >
                                                    {cond}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-[0.2em] ml-1">Number of Animals</label>
                                        <div className="flex gap-2">
                                            {['1', '2', '3', '4+'].map((count) => (
                                                <button
                                                    key={count}
                                                    type="button"
                                                    onClick={() => setFormData({ ...formData, animal_count: parseInt(count) || 4 })}
                                                    className={`flex-1 py-3 rounded-xl text-xs font-black transition-all border ${(count === '4+' ? formData.animal_count >= 4 : formData.animal_count === parseInt(count))
                                                        ? 'bg-orange-50 border-orange-200 text-[#F97316]'
                                                        : 'bg-white border-gray-100 text-gray-400 hover:border-gray-200 hover:text-gray-600'
                                                        }`}
                                                >
                                                    {count}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Row 4: Landmark */}
                                <div className="space-y-2">
                                    <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-[0.2em] ml-1">Landmark</label>
                                    <input
                                        type="text" required
                                        className="w-full px-5 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-medium focus:ring-4 focus:ring-orange-100 focus:border-[#F97316] outline-none transition-all placeholder:text-gray-300"
                                        value={formData.landmark}
                                        onChange={(e) => setFormData({ ...formData, landmark: e.target.value })}
                                        placeholder="e.g. Near Clubhouse"
                                    />
                                </div>

                                {/* Row 5: Behavior Tags */}
                                <div className="space-y-3">
                                    <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-[0.2em] ml-1">Behavior / Traits</label>
                                    <div className="flex flex-wrap gap-2">
                                        {['Friendly', 'Frightened', 'Nursing', 'Barking', 'Roaming'].map((tag) => (
                                            <button
                                                key={tag}
                                                type="button"
                                                onClick={() => toggleBehaviorTag(tag)}
                                                className={`px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border ${formData.behavior_tags.includes(tag)
                                                    ? 'bg-[#1a1208] border-[#1a1208] text-white shadow-lg shadow-gray-200 scale-105'
                                                    : 'bg-white border-gray-100 text-gray-400 hover:border-gray-300 hover:text-gray-600'
                                                    }`}
                                            >
                                                {tag}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Row 6: Media Upload */}
                                <div className="space-y-4">
                                    <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-[0.2em] ml-1">Upload Photos or Videos</label>
                                    <div className="relative">
                                        {formData.mediaFiles.length > 0 ? (
                                            <div className="space-y-4">
                                                <div
                                                    className={`relative grid gap-2 rounded-[2rem] overflow-hidden border-2 border-orange-500 bg-orange-50/10 p-2 cursor-pointer group/grid ${formData.mediaFiles.length === 1 ? 'grid-cols-1' :
                                                        formData.mediaFiles.length === 2 ? 'grid-cols-2' :
                                                            'grid-cols-2'
                                                        }`}
                                                    onClick={() => document.getElementById('leader-multi-upload')?.click()}
                                                >
                                                    {formData.mediaFiles.slice(0, 4).map((file, index) => (
                                                        <div key={index} className={`relative aspect-square rounded-2xl overflow-hidden group/item ${formData.mediaFiles.length === 3 && index === 0 ? 'row-span-2 aspect-auto' : ''
                                                            }`}>
                                                            {file.type.startsWith('video/') ? (
                                                                <video src={URL.createObjectURL(file)} className="w-full h-full object-cover" />
                                                            ) : (
                                                                <img src={URL.createObjectURL(file)} alt="Preview" className="w-full h-full object-cover" />
                                                            )}
                                                            {index === 3 && formData.mediaFiles.length > 4 && (
                                                                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                                                    <span className="text-white text-xl font-black">+{formData.mediaFiles.length - 4}</span>
                                                                </div>
                                                            )}
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
                                                    <div className="absolute inset-0 bg-orange-600/20 backdrop-blur-[2px] opacity-0 group-hover/grid:opacity-100 transition-all flex flex-col items-center justify-center gap-2 z-20">
                                                        <div className="w-12 h-12 rounded-full bg-white shadow-xl flex items-center justify-center text-[#F97316]">
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                                                            </svg>
                                                        </div>
                                                        <span className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Add More</span>
                                                    </div>
                                                </div>
                                                <div className="flex justify-end">
                                                    <button type="button" onClick={() => setFormData({ ...formData, mediaFiles: [] })} className="text-[10px] font-black text-red-400 uppercase tracking-widest hover:text-red-600 transition-all py-1">Clear All</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div
                                                className="w-full aspect-video rounded-[2.5rem] border-2 border-dashed border-gray-100 bg-[#FAFAF9] flex flex-col items-center justify-center gap-5 cursor-pointer hover:border-orange-200 hover:bg-orange-50/10 transition-all group"
                                                onClick={() => document.getElementById('leader-multi-upload')?.click()}
                                            >
                                                <div className="w-20 h-20 rounded-[2rem] bg-white shadow-sm flex items-center justify-center text-gray-200 group-hover:text-[#F97316] group-hover:scale-110 transition-all">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                                    </svg>
                                                </div>
                                                <div className="text-center">
                                                    <p className="text-[11px] font-black text-[#1a1208] uppercase tracking-[0.2em]">Tap to add Photos or Videos</p>
                                                    <p className="text-[9px] font-bold text-gray-300 uppercase tracking-widest mt-1.5">Multiple files supported</p>
                                                </div>
                                            </div>
                                        )}
                                        <input id="leader-multi-upload" type="file" className="hidden" accept="image/*,video/*" multiple onChange={(e) => setFormData(prev => ({ ...prev, mediaFiles: [...prev.mediaFiles, ...Array.from(e.target.files || [])] }))} />
                                    </div>
                                </div>

                                {/* Row 7: Map */}
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between ml-1">
                                        <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-[0.2em]">Pinpoint Location</label>
                                        <span className="text-[9px] font-bold text-[#F97316] bg-orange-50 px-3 py-1 rounded-full border border-orange-100 uppercase tracking-widest animate-pulse">Drag Marker to adjust</span>
                                    </div>
                                    <div className="w-full h-[350px] rounded-[2.5rem] overflow-hidden border-2 border-gray-50 shadow-inner relative group/map">
                                        <MapComponent
                                            center={[formData.latitude, formData.longitude]}
                                            zoom={18}
                                            onLocationChange={(lat, lng) => setFormData({ ...formData, latitude: lat, longitude: lng })}
                                        />
                                        <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
                                            <div className="bg-white/90 backdrop-blur-md px-4 py-2.5 rounded-2xl shadow-xl border border-white/20">
                                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-[0.15em] mb-1">Current Coordinates</p>
                                                <p className="text-[11px] font-mono font-bold text-gray-900">{formData.latitude.toFixed(6)}, {formData.longitude.toFixed(6)}</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-6">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Latitude</label>
                                            <input
                                                type="number" step="any" required
                                                className="w-full px-5 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl text-xs font-mono font-bold focus:ring-4 focus:ring-orange-100 outline-none transition-all"
                                                value={formData.latitude}
                                                onChange={(e) => setFormData({ ...formData, latitude: parseFloat(e.target.value) })}
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Longitude</label>
                                            <input
                                                type="number" step="any" required
                                                className="w-full px-5 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl text-xs font-mono font-bold focus:ring-4 focus:ring-orange-100 outline-none transition-all"
                                                value={formData.longitude}
                                                onChange={(e) => setFormData({ ...formData, longitude: parseFloat(e.target.value) })}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Row 8: Visibility */}
                                <div className="space-y-4 pt-4 border-t border-gray-50">
                                    <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-[0.2em] ml-1">Report Visibility</label>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {[
                                            { id: 'Public', label: 'Public Post', sub: 'Visible to all users in the subdivision feed.', icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg> },
                                            { id: 'Private', label: 'Private Post', sub: 'Only visible to Staff.', icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg> }
                                        ].map((opt) => (
                                            <button
                                                key={opt.id}
                                                type="button"
                                                onClick={() => setFormData({ ...formData, visibility: opt.id })}
                                                className={`p-6 rounded-[2rem] border-2 text-left transition-all flex gap-4 ${formData.visibility === opt.id
                                                    ? 'bg-orange-50 border-[#F97316] ring-4 ring-orange-50'
                                                    : 'bg-white border-gray-100 hover:border-gray-200'
                                                    }`}
                                            >
                                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${formData.visibility === opt.id ? 'bg-[#F97316] text-white shadow-lg' : 'bg-gray-50 text-gray-400'
                                                    }`}>
                                                    {opt.icon}
                                                </div>
                                                <div>
                                                    <p className={`text-sm font-black uppercase tracking-widest ${formData.visibility === opt.id ? 'text-[#F97316]' : 'text-gray-900'}`}>{opt.label}</p>
                                                    <p className="text-[10px] font-medium text-gray-400 mt-1 leading-relaxed">{opt.sub}</p>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Row 9: Description */}
                                <div className="space-y-3">
                                    <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-[0.2em] ml-1">Description</label>
                                    <textarea
                                        className="w-full px-6 py-5 bg-gray-50 border border-gray-100 rounded-[2rem] text-sm font-medium focus:ring-4 focus:ring-orange-100 focus:border-[#F97316] outline-none transition-all min-h-[160px] placeholder:text-gray-300"
                                        value={formData.description}
                                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                        placeholder="Provide any extra information that might help responders..."
                                    />
                                </div>
                            </div>
                        </form>

                        {/* Footer */}
                        <div className="px-10 py-8 border-t border-gray-50 bg-gray-50/30 flex items-center justify-end gap-5 shrink-0">
                            <button
                                type="button"
                                onClick={() => setIsModalOpen(false)}
                                className="px-8 py-4 text-xs font-black text-gray-400 uppercase tracking-widest hover:text-gray-900 transition-all"
                            >
                                Cancel
                            </button>
                            <Button variant="primary" type="submit" onClick={handleSaveReport} className="px-14 py-4 !bg-[#F97316] hover:!bg-[#EA580C] !border-[#F97316] !rounded-2xl shadow-xl shadow-orange-100 hover:scale-105 active:scale-95 transition-all text-xs font-black uppercase tracking-widest">
                                Submit Report
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Escalate to Barangay Modal */}
            {isEscalateModalOpen && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="px-8 py-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <div>
                                <h3 className="text-xl font-bold text-gray-900">Escalate to Barangay</h3>
                                <p className="text-xs text-gray-500 mt-1">Upload the endorsement letter to proceed.</p>
                            </div>
                            <button onClick={() => setIsEscalateModalOpen(false)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-all">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="p-8 space-y-6">
                            <div className="space-y-4">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Escalation Title</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Endorsement for Rescue Team"
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm focus:ring-2 focus:ring-[#F97316] outline-none transition-all"
                                        value={escalationTitle}
                                        onChange={(e) => setEscalationTitle(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Brief Description</label>
                                    <textarea
                                        placeholder="Provide a summary of why this is being escalated..."
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm focus:ring-2 focus:ring-[#F97316] outline-none transition-all min-h-[100px]"
                                        value={escalationDescription}
                                        onChange={(e) => setEscalationDescription(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Endorsement Letter (PDF/JPG/PNG)</label>
                                    <div
                                        className={`relative border-2 border-dashed rounded-2xl p-8 transition-all flex flex-col items-center justify-center gap-3 ${endorsementFile ? 'border-orange-500 bg-orange-50' : 'border-gray-200 hover:border-orange-300 bg-gray-50'}`}
                                        onDragOver={(e) => e.preventDefault()}
                                        onDrop={(e) => {
                                            e.preventDefault();
                                            if (e.dataTransfer.files?.[0]) setEndorsementFile(e.dataTransfer.files[0]);
                                        }}
                                    >
                                        <input
                                            type="file"
                                            className="absolute inset-0 opacity-0 cursor-pointer"
                                            onChange={(e) => {
                                                if (e.target.files?.[0]) setEndorsementFile(e.target.files[0]);
                                            }}
                                        />
                                        <div className={`w-12 h-12 rounded-full flex items-center justify-center ${endorsementFile ? 'bg-orange-500 text-white' : 'bg-white text-gray-400 shadow-sm'}`}>
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                            </svg>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-sm font-bold text-gray-900">{endorsementFile ? endorsementFile.name : 'Select or drag file'}</p>
                                            <p className="text-xs text-gray-500 mt-1">{endorsementFile ? `${(endorsementFile.size / 1024).toFixed(1)} KB` : 'PDF, PNG or JPG'}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center justify-end gap-3 pt-4">
                                <button
                                    onClick={() => setIsEscalateModalOpen(false)}
                                    className="px-6 py-2.5 text-sm font-bold text-gray-500 hover:text-gray-700 transition-colors"
                                >
                                    Cancel
                                </button>
                                <Button
                                    variant="primary"
                                    onClick={handleEscalate}
                                    disabled={!endorsementFile || isEscalating}
                                    className="px-10 !bg-[#F97316] hover:!bg-[#EA580C] !border-[#F97316]"
                                >
                                    {isEscalating ? 'Escalating...' : 'Submit Escalation'}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <SuccessModal
                isOpen={showSuccess}
                message="Action completed successfully!"
            />

            {/* Premium Media Gallery Modal */}
            {activeGallery && (
                <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex flex-col animate-in fade-in duration-300">
                    {/* Gallery Header */}
                    <div className="p-6 flex items-center justify-between border-b border-white/10 shrink-0">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-orange-600 flex items-center justify-center text-white font-black text-lg shadow-lg">
                                {currentUser?.name?.charAt(0).toUpperCase() || 'S'}
                            </div>
                            <div>
                                <h3 className="text-sm font-black text-white uppercase tracking-widest">Incident Evidence</h3>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></span>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">Viewing File {activeGallery.index + 1} of {activeGallery.media.length}</p>
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={() => setActiveGallery(null)}
                            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all border border-white/10 hover:rotate-90"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Main Viewport */}
                    <div className="flex-1 relative flex items-center justify-center p-4 md:p-12 overflow-hidden">
                        {/* Navigation Controls */}
                        {activeGallery.media.length > 1 && (
                            <>
                                <button
                                    onClick={() => setActiveGallery(prev => prev ? { ...prev, index: (prev.index - 1 + prev.media.length) % prev.media.length } : null)}
                                    className="absolute left-4 md:left-8 w-12 h-12 rounded-full bg-white/10 hover:bg-orange-600 flex items-center justify-center text-white transition-all border border-white/10 backdrop-blur-md z-20"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" />
                                    </svg>
                                </button>
                                <button
                                    onClick={() => setActiveGallery(prev => prev ? { ...prev, index: (prev.index + 1) % prev.media.length } : null)}
                                    className="absolute right-4 md:right-8 w-12 h-12 rounded-full bg-white/10 hover:bg-orange-600 flex items-center justify-center text-white transition-all border border-white/10 backdrop-blur-md z-20"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
                                    </svg>
                                </button>
                            </>
                        )}

                        {/* Media Content */}
                        <div className="w-full h-full max-w-5xl flex items-center justify-center">
                            {activeGallery.media[activeGallery.index].media_type === 'Video' ? (
                                <video
                                    src={activeGallery.media[activeGallery.index].file_url}
                                    controls
                                    autoPlay
                                    className="max-w-full max-h-full rounded-2xl shadow-2xl border border-white/5"
                                />
                            ) : (() => {
                                const currentMedia = activeGallery.media[activeGallery.index];
                                const isDoc = currentMedia.media_type === 'Document' ||
                                    currentMedia.file_url.toLowerCase().endsWith('.pdf') ||
                                    currentMedia.file_url.toLowerCase().endsWith('.docx');

                                if (isDoc) {
                                    return (
                                        <div className="w-full h-full flex flex-col items-center justify-center gap-8">
                                            <div className="w-32 h-32 rounded-3xl bg-orange-600 flex items-center justify-center text-white shadow-2xl ring-8 ring-orange-600/20">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                </svg>
                                            </div>
                                            <div className="text-center">
                                                <h4 className="text-xl font-black text-white uppercase tracking-widest mb-4">Official Document</h4>
                                                <div className="flex flex-wrap justify-center gap-4">
                                                    <a
                                                        href={currentMedia.file_url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="px-8 py-3 bg-white text-black rounded-xl text-xs font-black uppercase tracking-widest hover:bg-orange-500 hover:text-white transition-all flex items-center gap-2"
                                                    >
                                                        Open in New Tab
                                                    </a>
                                                    <a
                                                        href={currentMedia.file_url.replace('/upload/', `/upload/fl_attachment:StraySafe_Doc_${currentMedia.media_id}/`)}
                                                        className="px-8 py-3 bg-orange-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-orange-700 transition-all flex items-center gap-2"
                                                    >
                                                        Download File
                                                    </a>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                }

                                return (
                                    <img
                                        src={currentMedia.file_url}
                                        alt="Gallery item"
                                        className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl border border-white/5"
                                    />
                                );
                            })()}
                        </div>
                    </div>

                    {/* Progress Bar (at bottom) */}
                    <div className="h-1 bg-white/5 w-full shrink-0">
                        <div
                            className="h-full bg-orange-600 transition-all duration-500"
                            style={{ width: `${((activeGallery.index + 1) / activeGallery.media.length) * 100}%` }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default SubdReports;
