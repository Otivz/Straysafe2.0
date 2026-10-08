import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../utils/api';
import RelativeTimestamp from '../../components/RelativeTimestamp';
import AdminSidebar from '../../components/AdminSidebar';
import AdminNavbar from '../../components/Navbars/AdminNavbar';
import Button from '../../components/Button';
import MapComponent from '../../components/MapComponent';
import { SELERA_DEFAULT_CENTER, SAN_VICENTE_HQ } from '../../utils/coverageArea';
import { REPORT_STATUS_MAP, getReportStatusLabel, getReportStatusBadgeStyle } from '../../utils/reportStatus';
import { DEFAULT_AVATAR, getProfilePicture } from '../../utils/avatar';
import { getCachedData, setCachedData, invalidateCache } from '../../utils/cache';
import { 
    LayoutGrid, 
    List, 
    Search, 
    X, 
    MapPin, 
    Clock, 
    Eye, 
    Zap, 
    MoreVertical, 
    ChevronLeft, 
    ChevronRight, 
    CheckCircle2, 
    ImageIcon, 
    RotateCcw,
    PawPrint,
    Trash2
} from 'lucide-react';





import DataTable from '../../components/DataTable';
import RescueTimeline from '../../components/RescueTimeline';
import AISuggestionPanel from '../../components/AISuggestionPanel';
import AIPotentialMatchesList from '../../components/AIPotentialMatchesList';
import ReportDescription from '../../components/ReportDescription';
import { reportDescriptionSummary } from '../../utils/reportDescription';

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
    reporter_photo?: string;
    animal_type?: string;
    animal_color?: string | null;
    breed?: string;
    condition?: string;
    animal_condition?: string;
    behavior_tags?: string | string[];
    media?: any[];
    comments?: any[];
    history?: any[];
    ai_animal_type?: string | null;
    ai_dominant_color?: string | null;
    ai_estimated_size?: string | null;
    ai_suggested_risk_level?: string | null;
    ai_suggested_priority?: string | null;
    ai_possible_breed?: string | null;
    ai_suggested_priority_reason?: string | null;
    verification_status?: string | null;
    verification_notes?: string | null;
    verified_by_user_id?: number | null;
    verified_by_name?: string | null;
    verified_at?: string | null;
    false_alarm_reason?: string | null;
    verified_actual_bite?: boolean | null;
    verified_chasing?: boolean | null;
    verified_attempted_bite?: boolean | null;
    verified_injury?: boolean | null;
    verified_aggressive?: boolean | null;
    behavior_finding?: string | null;
    duplicate_of_report_id?: number | null;
    has_duplicate_flag?: boolean;
    duplicate_match_count?: number;
    initial_latitude?: number | string | null;
    initial_longitude?: number | string | null;
    initial_landmark?: string | null;
    facility_id?: number | null;
    facility?: any;
}

const statusMap = REPORT_STATUS_MAP;
const categoryMap: Record<number, string> = {
    1: 'Injured Animal', 2: 'Aggressive Stray', 3: 'Possible Rabies Risk',
    4: 'Roaming Pack', 5: 'Animal Rescue Needed', 6: 'Lost Pet'
};

const RESOLVED_STATUS_IDS = [3, 9, 10, 11, 12, 14, 17, 18];

const getConditionBadgeStyle = (condition?: string) => {
    const c = (condition || '').toLowerCase();
    if (c.includes('rabies') || c.includes('aggressive') || c.includes('chasing') || c.includes('bite')) {
        return 'bg-rose-50 text-rose-700 border-rose-200/80 font-bold';
    }
    if (c.includes('injured') || c.includes('bleeding') || c.includes('limping') || c.includes('weak') || c.includes('sick') || c.includes('trapped')) {
        return 'bg-amber-50 text-amber-700 border-amber-200/80 font-bold';
    }
    if (c.includes('deceased')) {
        return 'bg-stone-100 text-stone-700 border-stone-300 font-bold';
    }
    if (c.includes('healthy')) {
        return 'bg-emerald-50 text-emerald-700 border-emerald-200/80 font-bold';
    }
    return 'bg-slate-50 text-slate-700 border-slate-200/80 font-bold';
};

const AdminReport = () => {
    const navigate = useNavigate();
    const [reports, setReports] = useState<Report[]>(() => getCachedData<Report[]>('admin_reports_list') || []);
    const [loading, setLoading] = useState<boolean>(() => !getCachedData<Report[]>('admin_reports_list'));
    const [adminTab, setAdminTab] = useState<'reports' | 'matches'>('reports');
    const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [priorityFilter, setPriorityFilter] = useState<'all' | 'High' | 'Medium' | 'Low'>('all');
    const [categoryFilter, setCategoryFilter] = useState<string>('all');
    const [sortBy, setSortBy] = useState<'newest' | 'oldest'>('newest');
    const [activeQuickTab, setActiveQuickTab] = useState<'all' | 'pending' | 'verified' | 'dispatched' | 'observation' | 'resolved'>('all');
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [itemsPerPage, setItemsPerPage] = useState<number>(9);
    const [openMenuId, setOpenMenuId] = useState<number | null>(null);
    const [isDirectActionModalOpen, setIsDirectActionModalOpen] = useState(false);
    const [directActionReportId, setDirectActionReportId] = useState<number | null>(null);
    const [targetStatusId, setTargetStatusId] = useState<number>(5);
    const [selectedStaffId, setSelectedStaffId] = useState<number | ''>('');
    const [actionRemarks, setActionRemarks] = useState<string>('');
    const [staffList, setStaffList] = useState<Array<{ user_id: number; name: string; email: string; role_id: number }>>([]);
    const [isSubmittingAction, setIsSubmittingAction] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    const userStr = localStorage.getItem('admin_user') || localStorage.getItem('user');
    const currentUser = userStr ? JSON.parse(userStr) : null;
    const currentUserId = currentUser ? currentUser.user_id : 1;

    const fetchStaffList = async () => {
        try {
            const res = await api.get('/users/');
            const users = Array.isArray(res.data) ? res.data : [];
            const staff = users.filter((u: any) => u.role_id === 3 || u.role_id === 2);
            const activeStaff = staff.length > 0 ? staff : users;
            setStaffList(activeStaff);
            if (activeStaff.length > 0) {
                setSelectedStaffId(activeStaff[0].user_id);
            }
        } catch (e) {
            console.error('Error fetching staff list:', e);
        }
    };

    useEffect(() => {
        fetchStaffList();
    }, []);

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



    const API_URL = '/reports';

    const fetchReports = async (forceLoading = false) => {
        try {
            if (forceLoading || !getCachedData('admin_reports_list')) {
                setLoading(true);
            }
            const response = await api.get(`${API_URL}/`);
            // Sort by report_id descending to show new reports at the top
            const sortedData = (response.data || []).sort((a: any, b: any) => b.report_id - a.report_id);
            setReports(sortedData);
            setCachedData('admin_reports_list', sortedData, 5 * 60 * 1000);

            // Mark current reports as viewed so sidebar notification count clears after viewing
            try {
                const viewed = JSON.parse(localStorage.getItem('straysafe_viewed_admin_reports') || '[]');
                const reportIds = sortedData.map((r: any) => r.report_id);
                const updatedViewed = Array.from(new Set([...viewed, ...reportIds]));
                localStorage.setItem('straysafe_viewed_admin_reports', JSON.stringify(updatedViewed));
                window.dispatchEvent(new Event('straysafe_admin_viewed'));
            } catch (e) {
                console.warn('Could not mark admin reports as viewed', e);
            }
        } catch (error) {
            console.error('Error fetching reports:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        try {
            const cached = getCachedData<Report[]>('admin_reports_list');
            if (Array.isArray(cached) && cached.length > 0) {
                const viewed = JSON.parse(localStorage.getItem('straysafe_viewed_admin_reports') || '[]');
                const reportIds = cached.map((r: any) => r.report_id);
                const updatedViewed = Array.from(new Set([...viewed, ...reportIds]));
                localStorage.setItem('straysafe_viewed_admin_reports', JSON.stringify(updatedViewed));
                window.dispatchEvent(new Event('straysafe_admin_viewed'));
            }
        } catch (e) {
            console.warn('Could not mark cached admin reports as viewed', e);
        }
        fetchReports();
    }, []);

    const handleAddComment = async (reportId: number) => {
        const text = commentInputs[reportId];
        if (!text || !text.trim()) return;

        try {
            const parentId = replyingTo[reportId]?.commentId || null;
            await api.post(`${API_URL}/${reportId}/comments`, {
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

    const handleDirectActionSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!directActionReportId) return;

        if (targetStatusId === 5 && !selectedStaffId) {
            alert('Please select a rescue staff responder to dispatch.');
            return;
        }

        try {
            setIsSubmittingAction(true);
            const payload: any = {
                status_id: targetStatusId,
                remarks: actionRemarks.trim() || undefined
            };

            if (targetStatusId === 5 && selectedStaffId) {
                payload.assigned_staff_id = Number(selectedStaffId);
            }

            await api.put(`${API_URL}/${directActionReportId}/status`, payload);
            invalidateCache('admin_reports_list');
            invalidateCache('admin_dashboard_stats');

            setIsDirectActionModalOpen(false);
            setDirectActionReportId(null);
            setActionRemarks('');
            fetchReports(true);
            alert('Incident status updated directly by Administrator.');
        } catch (error: any) {
            console.error('Error applying direct action:', error);
            alert(error.response?.data?.detail || 'Failed to update status.');
        } finally {
            setIsSubmittingAction(false);
        }
    };

    const handleUpdateStatus = async (reportId: number, statusId: number) => {
        try {
            await api.patch(`${API_URL}/${reportId}/status`, { status_id: statusId });
            invalidateCache('admin_reports_list');
            invalidateCache('admin_dashboard_stats');
            fetchReports(true);
        } catch (error) {
            console.error('Error updating status:', error);
            alert('Failed to update status. Please try again.');
        }
    };

    const handleDelete = async (id: number) => {
        if (window.confirm('Are you sure you want to delete this incident report?')) {
            try {
                await api.delete(`${API_URL}/${id}`);
                invalidateCache('admin_reports_list');
                invalidateCache('admin_dashboard_stats');
                fetchReports(true);
            } catch (error) {
                console.error('Error deleting report:', error);
            }
        }
    };



    // Reset page to 1 when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, statusFilter, priorityFilter, categoryFilter, sortBy, activeQuickTab]);

    const statusCounts = useMemo(() => {
        const all = reports.length;
        const pending = reports.filter(r => r.status_id === 1).length;
        const verified = reports.filter(r => r.status_id === 2 || r.status_id === 4 || r.status_id === 13).length;
        const dispatched = reports.filter(r => r.status_id === 5).length;
        const observation = reports.filter(r => r.status_id === 7 || r.status_id === 8).length;
        const resolved = reports.filter(r => RESOLVED_STATUS_IDS.includes(r.status_id)).length;
        return { all, pending, verified, dispatched, observation, resolved };
    }, [reports]);

    const filteredReports = useMemo(() => {
        return reports.filter(rep => {
            // Quick Tab Filter
            if (activeQuickTab === 'pending' && rep.status_id !== 1) return false;
            if (activeQuickTab === 'verified' && !(rep.status_id === 2 || rep.status_id === 4 || rep.status_id === 13)) return false;
            if (activeQuickTab === 'dispatched' && rep.status_id !== 5) return false;
            if (activeQuickTab === 'observation' && !(rep.status_id === 7 || rep.status_id === 8)) return false;
            if (activeQuickTab === 'resolved' && !RESOLVED_STATUS_IDS.includes(rep.status_id)) return false;

            // Search Term (ID, Category, Breed, Landmark, Reporter, Description)
            if (searchTerm.trim()) {
                const query = searchTerm.toLowerCase().trim();
                const cleanIdQuery = query.replace(/^#/, '');
                const idMatch = rep.report_id.toString() === cleanIdQuery || rep.report_id.toString().includes(cleanIdQuery);
                const catName = (categoryMap[rep.category_id] || rep.animal_type || '').toLowerCase();
                const catMatch = catName.includes(query);
                const breedMatch = ((rep as any).animal_breed || rep.breed || '').toLowerCase().includes(query);
                const animalTypeMatch = (rep.animal_type || '').toLowerCase().includes(query);
                const landmarkMatch = (rep.landmark || '').toLowerCase().includes(query);
                const reporterMatch = (rep.reporter_name || '').toLowerCase().includes(query);
                const descMatch = (rep.description || '').toLowerCase().includes(query);

                if (!idMatch && !catMatch && !breedMatch && !animalTypeMatch && !landmarkMatch && !reporterMatch && !descMatch) {
                    return false;
                }
            }

            // Status Dropdown Filter
            if (statusFilter !== 'all') {
                const s = statusFilter.toLowerCase();
                if (s === 'pending' || s === 'reported') {
                    if (rep.status_id !== 1) return false;
                } else if (s === 'verified') {
                    if (![2, 4, 13].includes(rep.status_id)) return false;
                } else if (s === 'escalated' || s === 'escalated to barangay') {
                    if (rep.status_id !== 4) return false;
                } else if (s === 'dispatched' || s === 'team dispatched' || s === 'rescue in progress') {
                    if (rep.status_id !== 5) return false;
                } else if (s === 'observation' || s === 'under observation' || s === 'holding') {
                    if (![6, 7, 8].includes(rep.status_id)) return false;
                } else if (s === 'resolved' || s === 'incident resolved') {
                    if (!RESOLVED_STATUS_IDS.includes(rep.status_id) && rep.status_id !== 11) return false;
                } else if (s === 'rejected' || s === 'dismissed') {
                    if (![3, 12, 14, 17].includes(rep.status_id)) return false;
                } else {
                    const statName = (statusMap[rep.status_id] || '').toLowerCase();
                    if (statName !== s && !statName.includes(s)) return false;
                }
            }

            // Priority Filter
            if (priorityFilter !== 'all') {
                const repPriority = (rep.priority_level || 'Medium').toLowerCase();
                if (priorityFilter === 'High' && !['high', 'critical', 'emergency'].includes(repPriority)) return false;
                if (priorityFilter === 'Medium' && !['medium', 'regular'].includes(repPriority)) return false;
                if (priorityFilter === 'Low' && repPriority !== 'low') return false;
            }

            // Category Filter
            if (categoryFilter !== 'all') {
                if (rep.category_id !== Number(categoryFilter)) return false;
            }

            return true;
        }).sort((a, b) => {
            if (sortBy === 'oldest') {
                return a.report_id - b.report_id;
            }
            // Default: newest first
            return b.report_id - a.report_id;
        });
    }, [reports, activeQuickTab, searchTerm, statusFilter, priorityFilter, categoryFilter, sortBy]);

    const totalPages = Math.max(1, Math.ceil(filteredReports.length / itemsPerPage));
    const paginatedReports = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filteredReports.slice(start, start + itemsPerPage);
    }, [filteredReports, currentPage, itemsPerPage]);

    const isFiltered = searchTerm !== '' || statusFilter !== 'all' || priorityFilter !== 'all' || categoryFilter !== 'all' || activeQuickTab !== 'all' || sortBy !== 'newest';

    const handleClearFilters = () => {
        setSearchTerm('');
        setStatusFilter('all');
        setPriorityFilter('all');
        setCategoryFilter('all');
        setActiveQuickTab('all');
        setSortBy('newest');
        setCurrentPage(1);
    };

    const getReportThumbnail = (rep: Report): string | null => {
        if (rep.media && Array.isArray(rep.media) && rep.media.length > 0) {
            const first = rep.media[0];
            if (typeof first === 'string') return first;
            if (first && typeof first === 'object') {
                return first.file_url || first.url || first.thumbnail_url || null;
            }
        }
        return null;
    };

    const getPriorityColor = (priority: string) => {
        switch ((priority || '').toLowerCase()) {
            case 'emergency':
            case 'critical':
            case 'high': return 'bg-rose-50 text-rose-700 border-rose-200/80 font-black shadow-2xs';
            case 'regular':
            case 'medium': return 'bg-amber-50 text-amber-700 border-amber-200/80 font-black shadow-2xs';
            case 'low': return 'bg-emerald-50 text-emerald-700 border-emerald-200/80 font-black shadow-2xs';
            default: return 'bg-slate-50 text-slate-700 border-slate-200/80 font-bold shadow-2xs';
        }
    };

    const getStatusColor = (status: string) => {
        switch ((status || '').toLowerCase()) {
            case 'reported':
            case 'pending verification':
            case 'pending':
            case 'under review':
            case 'under observation':
            case 'disputed':
            case 'team dispatched':
            case 'in action':
            case 'ongoing':
            case 'rescue in progress': return 'bg-amber-50 text-amber-800 border-amber-200/90 font-black shadow-2xs';
            case 'verified':
            case 'under investigation': return 'bg-sky-50 text-sky-700 border-sky-200/90 font-black shadow-2xs';
            case 'escalated to barangay':
            case 'forwarded to barangay':
            case 'picked up':
            case 'in holding':
            case 'impounded': return 'bg-purple-50 text-purple-700 border-purple-200/90 font-black shadow-2xs';
            case 'approved':
            case 'resolved':
            case 'incident resolved':
            case 'claimed by owner':
            case 'released': return 'bg-emerald-50 text-emerald-700 border-emerald-200/90 font-black shadow-2xs';
            case 'rejected':
            case 'deceased':
            case 'false alarm / dismissed':
            case 'animal cannot be found': return 'bg-rose-50 text-rose-700 border-rose-200/90 font-black shadow-2xs';
            default: return 'bg-slate-50 text-slate-700 border-slate-200/90 font-bold shadow-2xs';
        }
    };

    return (
        <div className="flex h-screen bg-[#F8FAFC]">
            <AdminSidebar />

            <div className="flex-1 flex flex-col overflow-hidden">
                <AdminNavbar
                    leftContent={
                        <div className="flex flex-col">
                            <div className="flex items-center gap-2.5">
                                <h1 className="text-xl font-black text-slate-900 tracking-tight leading-none uppercase">Report Management</h1>
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-orange-50 text-[#F97316] border border-orange-200/80 shadow-2xs">
                                    {filteredReports.length} {filteredReports.length === 1 ? 'Report' : 'Reports'}
                                </span>
                            </div>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1.5 leading-none">Monitor, review, and coordinate animal incident responses across all jurisdictions</p>
                        </div>
                    }
                />

                <main className="flex-1 overflow-y-auto p-8">
                    <div className="max-w-7xl mx-auto">
                        {/* Header */}
                        <div className="flex flex-wrap justify-between items-center mb-8 gap-4">
                            <div className="flex bg-gray-100 p-1.5 rounded-2xl">
                                <button
                                    onClick={() => setAdminTab('reports')}
                                    className={`px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${adminTab === 'reports' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                                >
                                    Incident Reports
                                </button>
                                <button
                                    onClick={() => setAdminTab('matches')}
                                    className={`px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${adminTab === 'matches' ? 'bg-white text-[#F97316] shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                                >
                                    <span className="w-2 h-2 rounded-full bg-[#F97316]"></span>
                                    AI Potential Matches
                                </button>
                            </div>

                            <div className="flex items-center space-x-3">
                                <Button variant="light" className="flex items-center space-x-2" onClick={() => fetchReports(true)}>
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                    <span>Refresh</span>
                                </Button>
                            </div>
                        </div>

                        {adminTab === 'matches' ? (
                            <AIPotentialMatchesList
                                isStaff={true}
                                onMatchesUpdated={fetchReports}
                            />
                        ) : (
                            <>
                                {/* Quick Status Filter Tabs */}
                                <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none mb-4">
                                    {[
                                        { key: 'all', label: 'All Incidents', count: statusCounts.all, color: 'text-slate-700 bg-white border-slate-200' },
                                        { key: 'pending', label: 'Pending Verification', count: statusCounts.pending, color: 'text-amber-700 bg-amber-50 border-amber-200' },
                                        { key: 'verified', label: 'Verified', count: statusCounts.verified, color: 'text-sky-700 bg-sky-50 border-sky-200' },
                                        { key: 'dispatched', label: 'Team Dispatched', count: statusCounts.dispatched, color: 'text-blue-700 bg-blue-50 border-blue-200' },
                                        { key: 'observation', label: 'In Observation', count: statusCounts.observation, color: 'text-purple-700 bg-purple-50 border-purple-200' },
                                        { key: 'resolved', label: 'Resolved / Closed', count: statusCounts.resolved, color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
                                    ].map(tab => (
                                        <button
                                            key={tab.key}
                                            onClick={() => setActiveQuickTab(tab.key as any)}
                                            className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-wider transition-all border shrink-0 ${
                                                activeQuickTab === tab.key
                                                    ? 'bg-[#1A4543] text-white border-[#1A4543] shadow-sm'
                                                    : `${tab.color} hover:border-slate-300`
                                            }`}
                                        >
                                            <span>{tab.label}</span>
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                                                activeQuickTab === tab.key ? 'bg-white/20 text-white' : 'bg-black/5 text-current'
                                            }`}>
                                                {tab.count}
                                            </span>
                                        </button>
                                    ))}
                                </div>

                                {/* Search & Filter Toolbar */}
                                <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-4 mb-6 flex flex-col gap-4">
                                    <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
                                        {/* Unified Search Bar */}
                                        <div className="relative flex-1">
                                            <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 pointer-events-none">
                                                <Search className="w-4 h-4" />
                                            </span>
                                            <input
                                                type="text"
                                                placeholder="Search by ID (#0012), category, landmark, breed, reporter, or description..."
                                                className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-[#F97316] outline-none transition-all"
                                                value={searchTerm}
                                                onChange={(e) => setSearchTerm(e.target.value)}
                                            />
                                            {searchTerm && (
                                                <button
                                                    onClick={() => setSearchTerm('')}
                                                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                                                    title="Clear search"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>

                                        {/* View Mode Switcher */}
                                        <div className="flex items-center gap-2 shrink-0">
                                            <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200/60">
                                                <button
                                                    onClick={() => setViewMode('cards')}
                                                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                                                        viewMode === 'cards' ? 'bg-white text-[#F97316] shadow-xs' : 'text-slate-500 hover:text-slate-800'
                                                    }`}
                                                    title="Card Grid View"
                                                >
                                                    <LayoutGrid className="w-3.5 h-3.5" />
                                                    <span>Cards</span>
                                                </button>
                                                <button
                                                    onClick={() => setViewMode('table')}
                                                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                                                        viewMode === 'table' ? 'bg-white text-[#F97316] shadow-xs' : 'text-slate-500 hover:text-slate-800'
                                                    }`}
                                                    title="Table View"
                                                >
                                                    <List className="w-3.5 h-3.5" />
                                                    <span>Table</span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Secondary Filters & Sort Dropdowns */}
                                    <div className="flex flex-wrap items-center justify-between gap-2.5 pt-3 border-t border-slate-100 text-xs">
                                        <div className="flex flex-wrap items-center gap-2.5">
                                            {/* Category Filter */}
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Category:</span>
                                                <select
                                                    value={categoryFilter}
                                                    onChange={(e) => {
                                                        setCategoryFilter(e.target.value);
                                                        setCurrentPage(1);
                                                    }}
                                                    className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-[#F97316]"
                                                >
                                                    <option value="all">All Categories</option>
                                                    <option value="1">🩹 Injured Animal</option>
                                                    <option value="2">⚠️ Aggressive Stray</option>
                                                    <option value="3">☣️ Rabies Risk</option>
                                                    <option value="4">🐕‍🦺 Roaming Pack</option>
                                                    <option value="5">🛟 Rescue Needed</option>
                                                    <option value="6">🔍 Lost Pet</option>
                                                </select>
                                            </div>

                                            {/* Priority Filter */}
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Priority:</span>
                                                <select
                                                    value={priorityFilter}
                                                    onChange={(e) => {
                                                        setPriorityFilter(e.target.value as any);
                                                        setCurrentPage(1);
                                                    }}
                                                    className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-[#F97316]"
                                                >
                                                    <option value="all">All Priorities</option>
                                                    <option value="High">🚨 Critical / High</option>
                                                    <option value="Medium">⚡ Medium</option>
                                                    <option value="Low">🌱 Low</option>
                                                </select>
                                            </div>

                                            {/* Status Filter */}
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Status:</span>
                                                <select
                                                    value={statusFilter}
                                                    onChange={(e) => {
                                                        setStatusFilter(e.target.value);
                                                        setCurrentPage(1);
                                                    }}
                                                    className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-[#F97316]"
                                                >
                                                    <option value="all">All Statuses</option>
                                                    <option value="Pending">Pending Verification</option>
                                                    <option value="Verified">Verified</option>
                                                    <option value="Escalated to Barangay">Escalated to Barangay</option>
                                                    <option value="Team Dispatched">Team Dispatched</option>
                                                    <option value="Under Observation">In Observation / Holding</option>
                                                    <option value="Resolved">Resolved</option>
                                                    <option value="Rejected">Rejected / Dismissed</option>
                                                </select>
                                            </div>

                                            {/* Sort Order */}
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Sort:</span>
                                                <select
                                                    value={sortBy}
                                                    onChange={(e) => setSortBy(e.target.value as any)}
                                                    className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-[#F97316]"
                                                >
                                                    <option value="newest">🕒 Newest First</option>
                                                    <option value="oldest">⏳ Oldest First</option>
                                                </select>
                                            </div>
                                        </div>

                                        {/* Reset Filters Action */}
                                        {isFiltered && (
                                            <button
                                                onClick={handleClearFilters}
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-100 font-bold text-xs transition-colors"
                                            >
                                                <RotateCcw className="w-3.5 h-3.5" />
                                                <span>Reset Filters</span>
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Results Count Header */}
                                <div className="flex justify-between items-center mb-4 px-1">
                                    <span className="text-xs font-bold text-slate-500">
                                        Showing <strong className="text-slate-900">{filteredReports.length}</strong> matching {filteredReports.length === 1 ? 'incident' : 'incidents'}
                                        {isFiltered && <span className="text-[#F97316] ml-1">(filtered)</span>}
                                    </span>
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                        Page {currentPage} of {totalPages}
                                    </span>
                                </div>

                                {/* View Switcher: Cards vs Table */}
                                {viewMode === 'cards' ? (
                                    <>
                                        {loading ? (
                                            /* Skeleton Loading Grid */
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                                {[1, 2, 3, 4, 5, 6].map(n => (
                                                    <div key={n} className="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm animate-pulse flex flex-col gap-4">
                                                        <div className="h-44 bg-slate-100 rounded-2xl w-full"></div>
                                                        <div className="h-4 bg-slate-100 rounded-full w-3/4"></div>
                                                        <div className="h-3 bg-slate-100 rounded-full w-1/2"></div>
                                                        <div className="h-8 bg-slate-100 rounded-xl w-full mt-auto"></div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : filteredReports.length === 0 ? (
                                            /* Empty State */
                                            <div className="bg-white rounded-3xl border border-slate-100 p-12 text-center shadow-sm flex flex-col items-center justify-center">
                                                <div className="w-16 h-16 rounded-2xl bg-orange-50 text-[#F97316] flex items-center justify-center mb-4 shadow-xs">
                                                    <Search className="w-8 h-8" />
                                                </div>
                                                <h3 className="text-lg font-black text-slate-900 mb-1">No Incident Reports Found</h3>
                                                <p className="text-xs text-slate-500 max-w-sm mb-6">
                                                    {isFiltered
                                                        ? "No reports match your selected search or filter criteria. Try adjusting your parameters or resetting filters."
                                                        : "There are currently no animal incident reports recorded in the system."}
                                                </p>
                                                {isFiltered && (
                                                    <Button variant="primary" onClick={handleClearFilters} className="flex items-center gap-2 text-xs">
                                                        <RotateCcw className="w-3.5 h-3.5" />
                                                        <span>Reset All Filters</span>
                                                    </Button>
                                                )}
                                            </div>
                                        ) : (
                                            /* Active Card Grid */
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                                {paginatedReports.map(rep => {
                                                    const thumbnail = getReportThumbnail(rep);
                                                    const priorityBadge = getPriorityColor(rep.priority_level);
                                                    const statusBadge = getReportStatusBadgeStyle(rep.status_id);
                                                    const statusText = getReportStatusLabel(rep.status_id);
                                                    const conditionText = rep.condition || (rep as any).animal_condition || 'Healthy';
                                                    const categoryLabel = categoryMap[rep.category_id] || rep.animal_type || 'Incident';
                                                    const hasMultipleMedia = rep.media && Array.isArray(rep.media) && rep.media.length > 1;

                                                    return (
                                                        <div
                                                            key={rep.report_id}
                                                            onClick={() => navigate(`/admin/incidents/${rep.report_id}`)}
                                                            className="bg-white rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl hover:border-orange-200 transition-all duration-300 flex flex-col overflow-hidden group cursor-pointer relative"
                                                        >
                                                            {/* Media Image / Pattern Banner */}
                                                            <div className="relative h-44 bg-slate-900 overflow-hidden shrink-0">
                                                                {thumbnail ? (
                                                                    <img
                                                                        src={thumbnail}
                                                                        alt={categoryLabel}
                                                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                                                    />
                                                                ) : (
                                                                    <div className="w-full h-full bg-gradient-to-br from-[#1A4543] via-[#245b58] to-[#B35D25] flex flex-col items-center justify-center text-white/90 p-4">
                                                                        <PawPrint className="w-10 h-10 opacity-30 mb-2" />
                                                                        <span className="text-xs font-black uppercase tracking-wider">{categoryLabel}</span>
                                                                        <span className="text-[10px] text-white/60 mt-0.5">No photo uploaded</span>
                                                                    </div>
                                                                )}

                                                                {/* Image Dark Overlay on hover */}
                                                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-80 group-hover:opacity-90 transition-opacity" />

                                                                {/* Floating Top Header Badges */}
                                                                <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2 z-10">
                                                                    <div className="flex items-center gap-1.5">
                                                                        <span className="px-2.5 py-1 rounded-xl bg-black/60 backdrop-blur-md text-white font-mono text-xs font-black tracking-tight border border-white/20 shadow-xs">
                                                                            #{rep.report_id.toString().padStart(4, '0')}
                                                                        </span>
                                                                        <span className="px-2.5 py-1 rounded-xl bg-white/90 backdrop-blur-md text-slate-900 text-[10px] font-black uppercase tracking-wider shadow-xs">
                                                                            {categoryLabel}
                                                                        </span>
                                                                    </div>
                                                                    <span className={`px-2.5 py-1 rounded-xl text-[10px] uppercase tracking-wider border backdrop-blur-md ${priorityBadge}`}>
                                                                        {rep.priority_level || 'Medium'}
                                                                    </span>
                                                                </div>

                                                                {/* Floating Bottom Warnings / Badges */}
                                                                <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2 z-10">
                                                                    <div className="flex items-center gap-1.5">
                                                                        {rep.has_duplicate_flag && !RESOLVED_STATUS_IDS.includes(rep.status_id) && !rep.duplicate_of_report_id && (
                                                                            <span className="px-2 py-0.5 rounded-lg text-[9px] font-black bg-amber-400 text-amber-950 border border-amber-500/40 flex items-center gap-1 shadow-xs">
                                                                                <span>⚠️</span>
                                                                                <span>Duplicate</span>
                                                                            </span>
                                                                        )}
                                                                        {(rep.status_id === 18 || rep.duplicate_of_report_id) && (
                                                                            <span className="px-2 py-0.5 rounded-lg text-[9px] font-black bg-stone-200 text-stone-900 border border-stone-300 flex items-center gap-1 shadow-xs">
                                                                                <span>🔗</span>
                                                                                <span>Merged #{rep.duplicate_of_report_id}</span>
                                                                            </span>
                                                                        )}
                                                                    </div>

                                                                    {hasMultipleMedia && (
                                                                        <span className="px-2 py-0.5 rounded-lg bg-black/60 backdrop-blur-md text-white text-[9px] font-black flex items-center gap-1 border border-white/20">
                                                                            <ImageIcon className="w-3 h-3" />
                                                                            <span>{rep.media!.length} photos</span>
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {/* Card Body */}
                                                            <div className="p-5 flex-1 flex flex-col justify-between gap-4">
                                                                <div className="flex flex-col gap-2.5">
                                                                    {/* Animal Specie / Breed & Condition */}
                                                                    <div className="flex items-center justify-between gap-2">
                                                                        <div className="flex items-center gap-1.5 truncate">
                                                                            <span className="text-xs font-black text-slate-800 truncate">
                                                                                {rep.animal_type || 'Animal'}
                                                                                {((rep as any).animal_breed || rep.breed) && (
                                                                                    <span className="text-slate-400 font-semibold ml-1">
                                                                                        • {(rep as any).animal_breed || rep.breed}
                                                                                    </span>
                                                                                )}
                                                                            </span>
                                                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] uppercase tracking-wider border shrink-0 ${getConditionBadgeStyle(conditionText)}`}>
                                                                                {conditionText}
                                                                            </span>
                                                                        </div>
                                                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] uppercase tracking-wider border shrink-0 ${statusBadge}`}>
                                                                            <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
                                                                            {statusText}
                                                                        </span>
                                                                    </div>

                                                                    {/* Description Snippet */}
                                                                    <p className="text-xs text-slate-500 font-medium line-clamp-2 leading-relaxed min-h-[36px]">
                                                                        {reportDescriptionSummary(rep.description) || 'No additional notes provided by resident.'}
                                                                    </p>

                                                                    {/* Metadata Attributes */}
                                                                    <div className="pt-2 border-t border-slate-100 flex flex-col gap-1.5 text-[11px] text-slate-600">
                                                                        {/* Landmark */}
                                                                        <div className="flex items-center gap-2 truncate" title={rep.landmark || 'No landmark specified'}>
                                                                            <MapPin className="w-3.5 h-3.5 text-[#F97316] shrink-0" />
                                                                            <span className="truncate font-semibold text-slate-700">
                                                                                {rep.landmark || 'No landmark specified'}
                                                                            </span>
                                                                        </div>

                                                                        {/* Reporter & Time */}
                                                                        <div className="flex items-center justify-between text-slate-400 pt-1">
                                                                            <div className="flex items-center gap-1.5 truncate">
                                                                                <div className="w-4 h-4 rounded-full overflow-hidden bg-slate-100 flex items-center justify-center shrink-0 border border-slate-200">
                                                                                    {rep.reporter_photo ? (
                                                                                        <img src={getProfilePicture(rep.reporter_photo)} alt={rep.reporter_name || 'User'} className="w-full h-full object-cover" />
                                                                                    ) : (
                                                                                        <span className="text-[8px] font-black text-slate-600">{(rep.reporter_name || 'U').charAt(0)}</span>
                                                                                    )}
                                                                                </div>
                                                                                <span className="truncate text-slate-600 font-bold text-[10.5px]">
                                                                                    {rep.reporter_name || `User #${rep.user_id}`}
                                                                                </span>
                                                                            </div>
                                                                            <div className="flex items-center gap-1 shrink-0 text-[10px] font-semibold text-slate-400">
                                                                                <Clock className="w-3 h-3" />
                                                                                <RelativeTimestamp date={rep.created_at} />
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* Action Buttons Footer */}
                                                                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
                                                                    <button
                                                                        onClick={() => navigate(`/admin/incidents/${rep.report_id}`)}
                                                                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-50 hover:bg-[#F97316] text-slate-700 hover:text-white font-black text-xs transition-colors shadow-2xs group/btn"
                                                                    >
                                                                        <Eye className="w-3.5 h-3.5" />
                                                                        <span>View Details</span>
                                                                    </button>

                                                                    <button
                                                                        onClick={() => {
                                                                            setDirectActionReportId(rep.report_id);
                                                                            setTargetStatusId(rep.status_id < 5 ? 5 : rep.status_id);
                                                                            setIsDirectActionModalOpen(true);
                                                                        }}
                                                                        className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-500 text-amber-700 hover:text-white font-black text-xs transition-colors shadow-2xs"
                                                                        title="Direct Admin Action / Override"
                                                                    >
                                                                        <Zap className="w-3.5 h-3.5" />
                                                                        <span className="hidden sm:inline">Dispatch</span>
                                                                    </button>

                                                                    {/* Kebab Dropdown */}
                                                                    <div className="relative" ref={openMenuId === rep.report_id ? menuRef : null}>
                                                                        <button
                                                                            onClick={() => setOpenMenuId(openMenuId === rep.report_id ? null : rep.report_id)}
                                                                            className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                                                                        >
                                                                            <MoreVertical className="w-4 h-4" />
                                                                        </button>

                                                                        {openMenuId === rep.report_id && (
                                                                            <div className="absolute right-0 bottom-full mb-2 w-48 bg-white rounded-2xl shadow-xl border border-slate-100 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-150">
                                                                                <button
                                                                                    onClick={() => {
                                                                                        navigate(`/admin/incidents/${rep.report_id}`);
                                                                                        setOpenMenuId(null);
                                                                                    }}
                                                                                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                                                                                >
                                                                                    <Eye className="w-3.5 h-3.5 text-blue-500" />
                                                                                    <span>Full Dossier</span>
                                                                                </button>
                                                                                {rep.status_id !== 11 && rep.status_id !== 6 && (
                                                                                    <button
                                                                                        onClick={() => {
                                                                                            handleUpdateStatus(rep.report_id, 11);
                                                                                            setOpenMenuId(null);
                                                                                        }}
                                                                                        className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-bold text-emerald-600 hover:bg-emerald-50"
                                                                                    >
                                                                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                                                                        <span>Mark Resolved</span>
                                                                                    </button>
                                                                                )}
                                                                                <button
                                                                                    onClick={() => {
                                                                                        handleDelete(rep.report_id);
                                                                                        setOpenMenuId(null);
                                                                                    }}
                                                                                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50"
                                                                                >
                                                                                    <Trash2 className="w-3.5 h-3.5" />
                                                                                    <span>Delete Report</span>
                                                                                </button>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    /* Table View */
                                    <DataTable
                                        loading={loading}
                                        data={paginatedReports}
                                        emptyTitle="No Incident Reports Found"
                                        emptyMessage={
                                            isFiltered
                                                ? `No incident reports match your filters. Try clearing your search or status filter.`
                                                : "No active incident reports found in the system."
                                        }
                                        onResetFilters={isFiltered ? handleClearFilters : undefined}
                                        loadingMessage="Synchronizing reports..."
                                        onRowClick={(rep) => navigate(`/admin/incidents/${rep.report_id}`)}
                                        columns={[
                                            {
                                                header: "ID",
                                                key: "report_id",
                                                render: (rep) => (
                                                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 font-mono text-xs font-black tracking-tight border border-slate-200/80 shadow-2xs">
                                                        #{rep.report_id.toString().padStart(4, '0')}
                                                    </span>
                                                )
                                            },
                                            {
                                                header: "Category & Animal",
                                                key: "category",
                                                render: (rep) => (
                                                    <div className="flex items-center gap-2.5">
                                                        <span className="w-2.5 h-2.5 rounded-full bg-[#F97316] shadow-2xs shrink-0"></span>
                                                        <div className="flex flex-col">
                                                            <span className="text-sm font-black text-slate-900 leading-tight">
                                                                {categoryMap[rep.category_id] || rep.animal_type || 'Incident'}
                                                            </span>
                                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                                <span className="text-[11px] font-medium text-slate-400">
                                                                    {(rep as any).animal_breed && (rep as any).animal_breed.toLowerCase() !== 'unknown'
                                                                        ? `${(rep as any).animal_breed} • `
                                                                        : ''}
                                                                    {rep.animal_type || 'Stray'}
                                                                </span>
                                                                <span className={`inline-flex items-center px-1.5 py-0.2 rounded-md text-[9px] font-bold uppercase tracking-wider border ${getConditionBadgeStyle(rep.condition || (rep as any).animal_condition || 'Healthy')}`}>
                                                                    {rep.condition || (rep as any).animal_condition || 'Healthy'}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )
                                            },
                                            {
                                                header: "Priority",
                                                key: "priority",
                                                render: (rep) => (
                                                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10.5px] uppercase tracking-wider border ${getPriorityColor(rep.priority_level)}`}>
                                                        <span className={`w-1.5 h-1.5 rounded-full ${
                                                            (rep.priority_level || '').toLowerCase() === 'high' ? 'bg-rose-500' :
                                                            (rep.priority_level || '').toLowerCase() === 'medium' ? 'bg-amber-500' : 'bg-emerald-500'
                                                        }`} />
                                                        {rep.priority_level || 'Medium'}
                                                    </span>
                                                )
                                            },
                                            {
                                                header: "Location",
                                                key: "location",
                                                render: (rep) => (
                                                    <div className="flex items-center gap-2 text-slate-600">
                                                        <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                                        <span className="text-xs font-semibold text-slate-700 truncate max-w-[200px]" title={rep.landmark || 'No landmark'}>
                                                            {rep.landmark || 'No landmark specified'}
                                                        </span>
                                                    </div>
                                                )
                                            },
                                            {
                                                header: "Rescue Status",
                                                key: "rescue_status",
                                                render: (rep) => {
                                                    if ([5, 13].includes(rep.status_id)) {
                                                        return (
                                                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200/80 text-[10.5px] font-black uppercase tracking-wider shadow-2xs">
                                                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                                                                <span>Rescue in Progress</span>
                                                            </div>
                                                        );
                                                    } else if ([6, 7, 8].includes(rep.status_id)) {
                                                        return (
                                                            <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-200/80 text-[10.5px] font-black uppercase tracking-wider">
                                                                {statusMap[rep.status_id]}
                                                            </span>
                                                        );
                                                    } else if ([9, 10, 11].includes(rep.status_id)) {
                                                        return (
                                                            <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/80 text-[10.5px] font-bold uppercase tracking-wider">
                                                                ✓ Resolved
                                                            </span>
                                                        );
                                                    } else if ([3, 12, 14, 17, 18].includes(rep.status_id)) {
                                                        return (
                                                            <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 border border-slate-200/60 text-[10.5px] font-bold uppercase tracking-wider">
                                                                Closed
                                                            </span>
                                                        );
                                                    } else {
                                                        return (
                                                            <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200/60 text-[10.5px] font-bold uppercase tracking-wider">
                                                                Pending Dispatch
                                                            </span>
                                                        );
                                                    }
                                                }
                                            },
                                            {
                                                header: "Status",
                                                key: "status",
                                                render: (rep) => (
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10.5px] font-black uppercase tracking-wider border ${getReportStatusBadgeStyle(rep.status_id)}`}>
                                                            <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
                                                            {getReportStatusLabel(rep.status_id)}
                                                        </span>
                                                        {rep.has_duplicate_flag && !RESOLVED_STATUS_IDS.includes(rep.status_id) && !rep.duplicate_of_report_id && (
                                                            <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1 shadow-2xs" title="AI detected suspected duplicate sighting">
                                                                <span>⚠️</span>
                                                                <span>Duplicate</span>
                                                            </span>
                                                        )}
                                                        {(rep.status_id === 18 || rep.duplicate_of_report_id) && (
                                                            <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-stone-100 text-stone-700 border border-stone-300 flex items-center gap-1 shadow-2xs" title={`Merged duplicate into Case #${rep.duplicate_of_report_id}`}>
                                                                <span>🔗</span>
                                                                <span>Merged</span>
                                                            </span>
                                                        )}
                                                    </div>
                                                )
                                            },
                                            {
                                                header: "Submitted By",
                                                key: "reporter",
                                                render: (rep) => (
                                                    <div className="flex items-center gap-2.5">
                                                        <div className="w-7 h-7 rounded-full overflow-hidden bg-slate-100 flex items-center justify-center border border-slate-200 shrink-0 shadow-2xs">
                                                            {rep.reporter_photo ? (
                                                                <img src={getProfilePicture(rep.reporter_photo)} alt={rep.reporter_name || 'Reporter'} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.src = DEFAULT_AVATAR; }} />
                                                            ) : (
                                                                <span className="text-[10px] text-slate-600 font-bold">{(rep.reporter_name || 'U').charAt(0).toUpperCase()}</span>
                                                            )}
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="text-xs font-bold text-slate-800 leading-tight">{rep.reporter_name || `User ${rep.user_id}`}</span>
                                                            <span className="text-[10px] text-slate-400 font-medium">{rep.created_at ? new Date(rep.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' }) : 'Recent'}</span>
                                                        </div>
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
                                                            <MoreVertical className="h-5 w-5" />
                                                        </button>

                                                        {openMenuId === rep.report_id && (
                                                            <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-50 animate-in fade-in zoom-in-95 duration-200">
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        navigate(`/admin/incidents/${rep.report_id}`);
                                                                        setOpenMenuId(null);
                                                                    }}
                                                                    className="w-full flex items-center gap-3 px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors"
                                                                >
                                                                    <Eye className="h-4 w-4" />
                                                                    View Report
                                                                </button>
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setDirectActionReportId(rep.report_id);
                                                                        setTargetStatusId(rep.status_id < 5 ? 5 : rep.status_id);
                                                                        setIsDirectActionModalOpen(true);
                                                                        setOpenMenuId(null);
                                                                    }}
                                                                    className="w-full flex items-center gap-3 px-4 py-2 text-sm font-medium text-amber-600 hover:bg-amber-50 transition-colors"
                                                                >
                                                                    <Zap className="h-4 w-4" />
                                                                    Direct Action / Override
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
                                                                        <CheckCircle2 className="h-4 w-4" />
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
                                                                    <Trash2 className="h-4 w-4" />
                                                                    Delete Report
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                )
                                            }
                                        ]}
                                    />
                                )}

                                {/* Bottom Pagination Bar */}
                                {filteredReports.length > 0 && (
                                    <div className="bg-white rounded-2xl shadow-xs border border-slate-100 p-4 mt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                                        {/* Count & Per-Page Selector */}
                                        <div className="flex items-center gap-3 text-xs font-bold text-slate-500">
                                            <span>
                                                Showing <strong className="text-slate-900">{Math.min((currentPage - 1) * itemsPerPage + 1, filteredReports.length)}</strong> - <strong className="text-slate-900">{Math.min(currentPage * itemsPerPage, filteredReports.length)}</strong> of <strong className="text-slate-900">{filteredReports.length}</strong> reports
                                            </span>
                                            <span className="text-slate-300">•</span>
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-[11px] font-bold text-slate-400">Show:</span>
                                                <select
                                                    value={itemsPerPage}
                                                    onChange={(e) => {
                                                        setItemsPerPage(Number(e.target.value));
                                                        setCurrentPage(1);
                                                    }}
                                                    className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none"
                                                >
                                                    <option value="6">6 per page</option>
                                                    <option value="9">9 per page</option>
                                                    <option value="18">18 per page</option>
                                                    <option value="27">27 per page</option>
                                                    <option value="45">45 per page</option>
                                                </select>
                                            </div>
                                        </div>

                                        {/* Page Navigators */}
                                        {totalPages > 1 && (
                                            <div className="flex items-center gap-1.5">
                                                <button
                                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                                    disabled={currentPage === 1}
                                                    className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-2xs"
                                                    title="Previous Page"
                                                >
                                                    <ChevronLeft className="w-4 h-4" />
                                                </button>

                                                {Array.from({ length: totalPages }, (_, i) => i + 1)
                                                    .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                                                    .map((page, idx, arr) => {
                                                        const prev = arr[idx - 1];
                                                        return (
                                                            <div key={page} className="flex items-center gap-1.5">
                                                                {prev && page - prev > 1 && (
                                                                    <span className="px-1 text-slate-400 font-bold">...</span>
                                                                )}
                                                                <button
                                                                    onClick={() => setCurrentPage(page)}
                                                                    className={`w-8 h-8 rounded-xl text-xs font-black transition-all ${
                                                                        currentPage === page
                                                                            ? 'bg-[#F97316] text-white shadow-xs'
                                                                            : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                                                                    }`}
                                                                >
                                                                    {page}
                                                                </button>
                                                            </div>
                                                        );
                                                    })}

                                                <button
                                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                                    disabled={currentPage === totalPages}
                                                    className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-2xs"
                                                    title="Next Page"
                                                >
                                                    <ChevronRight className="w-4 h-4" />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </main>
            </div>

            {/* View Report Modal - Handled by dedicated route /admin/incidents/:id */}
            {false && (
                <div className="fixed inset-0">
                    <div className="bg-white">
                        <div className="p-8">
                            {(() => {
                                const viewReport = reports[0] || ({} as any);
                                return (
                                    <div>
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
                                                        <p className="text-xs text-gray-500"><RelativeTimestamp date={viewReport.created_at} /></p>
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
                                                {!(viewReport.ai_suggested_priority && 
                                                    ((p1: string, p2: string) => (p1 || '').toLowerCase().replace('priority', '').replace('level', '').trim() === (p2 || '').toLowerCase().replace('priority', '').replace('level', '').trim())(viewReport.ai_suggested_priority || '', viewReport.priority_level || '')) && (
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
                                                 {(() => {
                                                     const breedVal = (viewReport as any).breed;
                                                     const hasBreed = breedVal && 
                                                         breedVal.toLowerCase() !== 'unknown' && 
                                                         breedVal.toLowerCase() !== 'not specified' && 
                                                         breedVal.trim() !== '';
                                                     if (!hasBreed) return null;
                                                     return (
                                                         <div>
                                                             <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Breed</span>
                                                             <span className="text-sm font-semibold text-gray-900">{breedVal}</span>
                                                         </div>
                                                     );
                                                 })()}
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

                                             {/* AI Suggestion Panel */}
                                             <AISuggestionPanel
                                                 animalType={viewReport.animal_type || viewReport.ai_animal_type}
                                                 dominantColor={(viewReport as any).animal_color || viewReport.ai_dominant_color}
                                                 coatPattern={(viewReport as any).coat_pattern || (viewReport as any).animal_pattern || (viewReport as any).ai_coat_pattern}
                                                 estimatedSize={(viewReport as any).estimated_size || viewReport.ai_estimated_size}
                                                 suggestedRiskLevel={viewReport.ai_suggested_risk_level}
                                                 suggestedPriority={viewReport.ai_suggested_priority}
                                                 possibleBreed={(viewReport as any).animal_breed || (viewReport as any).breed || viewReport.ai_possible_breed}
                                                 description={viewReport.description}
                                                 categoryName={categoryMap[viewReport.category_id]}
                                                 suggestedPriorityReason={viewReport.ai_suggested_priority_reason}
                                                 behaviorChasing={(viewReport as any).ai_behavior_chasing}
                                                 behaviorActualBite={(viewReport as any).ai_behavior_actual_bite}
                                                 behaviorAttemptedBite={(viewReport as any).ai_behavior_attempted_bite}
                                                 behaviorInjury={(viewReport as any).ai_behavior_injury}
                                                 behaviorAggressive={(viewReport as any).ai_behavior_aggressive}
                                                 behaviorExplanation={(viewReport as any).ai_behavior_explanation}
                                                 aiPhotoLikelihood={(viewReport as any).ai_photo_likelihood}
                                                 aiPhotoStatus={(viewReport as any).ai_photo_status}
                                                 aiPhotoRecommendation={(viewReport as any).ai_photo_recommendation}
                                                 aiPhotoDetails={(viewReport as any).ai_photo_details}
                                                 verificationStatus={viewReport.verification_status}
                                                 verifiedActualBite={(viewReport as any).verified_actual_bite}
                                                 verifiedChasing={(viewReport as any).verified_chasing}
                                                 verifiedAttemptedBite={(viewReport as any).verified_attempted_bite}
                                                 verifiedInjury={(viewReport as any).verified_injury}
                                                 verifiedAggressive={(viewReport as any).verified_aggressive}
                                                 behaviorFinding={(viewReport as any).behavior_finding}
                                                 verificationNotes={viewReport.verification_notes}
                                                 verifiedByName={viewReport.verified_by_name}
                                                 verifiedAt={viewReport.verified_at ? String(viewReport.verified_at) : null}
                                             />

                                            {/* Behavior Tags */}
                                            {viewReport.behavior_tags && (
                                                <div>
                                                    <h5 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">Behavior & Traits</h5>
                                                    <div className="flex flex-wrap gap-2">
                                                        {((Array.isArray(viewReport.behavior_tags) ? viewReport.behavior_tags : (typeof (viewReport.behavior_tags as any) === 'string' ? String(viewReport.behavior_tags).split(',') : [])) as string[]).map((tag: string, idx: number) => (
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
                                                    {(() => {
                                                        const isResolvedCase = RESOLVED_STATUS_IDS.includes(viewReport.status_id);
                                                        const rawInitLat = (viewReport as any).initial_latitude;
                                                        const rawInitLng = (viewReport as any).initial_longitude;
                                                        const initLat = rawInitLat != null ? parseFloat(String(rawInitLat)) : (viewReport.latitude != null ? parseFloat(String(viewReport.latitude)) : SELERA_DEFAULT_CENTER[0]);
                                                        const initLng = rawInitLng != null ? parseFloat(String(rawInitLng)) : (viewReport.longitude != null ? parseFloat(String(viewReport.longitude)) : SELERA_DEFAULT_CENTER[1]);
                                                        const hadHoldingHistory = viewReport.history?.some((h: any) => 
                                                            [7, 8].includes(h.status_id) || [7, 8].includes(h.report_status_id) || 
                                                            (h.notes && (h.notes.toLowerCase().includes('holding facility') || h.notes.toLowerCase().includes('holding pen'))) ||
                                                            (h.action && h.action.toLowerCase().includes('holding'))
                                                        ) || Boolean(viewReport.facility_id) || Boolean(viewReport.facility);
                                                        const histFacLat = SAN_VICENTE_HQ[0];
                                                        const histFacLng = SAN_VICENTE_HQ[1];
                                                        const histFacName = 'Barangay Holding Pen';

                                                        const markers = isResolvedCase ? [
                                                            {
                                                                id: viewReport.report_id,
                                                                lat: initLat,
                                                                lng: initLng,
                                                                title: `1. Reported Incident Location: ${viewReport.initial_landmark || viewReport.landmark || 'Incident Location'}`,
                                                                category: 'Historical Sighting',
                                                                priority: viewReport.priority_level || 'Medium',
                                                                color: 'slate',
                                                                rawData: { ...viewReport, landmark: viewReport.initial_landmark || viewReport.landmark, is_resolved: true }
                                                            },
                                                            ...(hadHoldingHistory ? [{
                                                                id: -999,
                                                                lat: histFacLat,
                                                                lng: histFacLng,
                                                                title: `2. Holding Pen: ${histFacName}`,
                                                                category: 'Historical Holding',
                                                                priority: 'Low',
                                                                color: 'slate',
                                                                rawData: { ...viewReport, landmark: histFacName, is_resolved: true }
                                                            }] : [])
                                                        ] : [
                                                            {
                                                                id: viewReport.report_id,
                                                                lat: initLat,
                                                                lng: initLng,
                                                                title: viewReport.initial_landmark || viewReport.landmark || 'Incident Location',
                                                                category: statusMap[viewReport.status_id] || 'Stray Animal',
                                                                priority: viewReport.priority_level || 'Medium',
                                                                color: 'red',
                                                                rawData: viewReport
                                                            }
                                                        ];

                                                        return (
                                                            <MapComponent
                                                                center={[initLat, initLng]}
                                                                zoom={17}
                                                                showHeatmap={false}
                                                                markers={markers}
                                                            />
                                                        );
                                                    })()}
                                                </div>
                                            </div>

                                            {/* Description */}
                                            <div>
                                                <h5 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">Description</h5>
                                                <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                                                    <ReportDescription description={viewReport.description} emptyText="No description provided." />
                                                </div>
                                            </div>

                                            {/* Media Grid: The Focus */}
                                            {viewReport.media && (viewReport.media || []).filter((m: any) => {
                                                const url = m.file_url.toLowerCase();
                                                return m.media_type !== 'Document' &&
                                                    !url.endsWith('.pdf') &&
                                                    !url.endsWith('.doc') &&
                                                    !url.endsWith('.docx') &&
                                                    !url.endsWith('.txt');
                                            }).length > 0 && (
                                                    <div>
                                                        <h5 className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest mb-4 block">INCIDENT MEDIA GALLERY</h5>
                                                        <div className={`grid gap-2 rounded-2xl sm:rounded-[2.5rem] overflow-hidden border-2 border-gray-50 shadow-inner bg-gray-50/30 ${(viewReport.media || []).filter((m: any) => {
                                                            const url = m.file_url.toLowerCase();
                                                            return m.media_type !== 'Document' &&
                                                                !url.endsWith('.pdf') &&
                                                                !url.endsWith('.doc') &&
                                                                !url.endsWith('.docx') &&
                                                                !url.endsWith('.txt');
                                                        }).length === 1 ? 'grid-cols-1' : 'grid-cols-2'
                                                            }`}>
                                                            {(viewReport.media || []).filter((m: any) => {
                                                                const url = m.file_url.toLowerCase();
                                                                return m.media_type !== 'Document' &&
                                                                    !url.endsWith('.pdf') &&
                                                                    !url.endsWith('.doc') &&
                                                                    !url.endsWith('.docx') &&
                                                                    !url.endsWith('.txt');
                                                            }).slice(0, 4).map((m: any, idx: number) => (
                                                                <div
                                                                    key={m.media_id}
                                                                    className={`relative overflow-hidden cursor-pointer group/media ${(viewReport.media || []).filter((m: any) => {
                                                                        const url = m.file_url.toLowerCase();
                                                                        return m.media_type !== 'Document' &&
                                                                            !url.endsWith('.pdf') &&
                                                                            !url.endsWith('.doc') &&
                                                                            !url.endsWith('.docx') &&
                                                                            !url.endsWith('.txt');
                                                                    }).length === 1 ? 'h-64 sm:h-96' :
                                                                        (viewReport.media || []).filter((m: any) => {
                                                                            const url = m.file_url.toLowerCase();
                                                                            return m.media_type !== 'Document' &&
                                                                                !url.endsWith('.pdf') &&
                                                                                !url.endsWith('.doc') &&
                                                                                !url.endsWith('.docx') &&
                                                                                !url.endsWith('.txt');
                                                                        }).length === 2 ? 'h-48 sm:h-72' :
                                                                            (viewReport.media || []).filter((m: any) => {
                                                                                const url = m.file_url.toLowerCase();
                                                                                return m.media_type !== 'Document' &&
                                                                                    !url.endsWith('.pdf') &&
                                                                                    !url.endsWith('.doc') &&
                                                                                    !url.endsWith('.docx') &&
                                                                                    !url.endsWith('.txt');
                                                                            }).length === 3 && idx === 0 ? 'row-span-2 h-[24rem] sm:h-[36rem]' : 'h-48 sm:h-72'
                                                                        }`}
                                                                    onClick={() => {
                                                                        const filtered = (viewReport.media || []).filter((m: any) => {
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
                                                                    {idx === 3 && (viewReport.media || []).filter((m: any) => {
                                                                        const url = m.file_url.toLowerCase();
                                                                        return m.media_type !== 'Document' &&
                                                                            !url.endsWith('.pdf') &&
                                                                            !url.endsWith('.doc') &&
                                                                            !url.endsWith('.docx') &&
                                                                            !url.endsWith('.txt');
                                                                    }).length > 4 && (
                                                                            <div className="absolute inset-0 bg-black/70 backdrop-blur-[4px] flex items-center justify-center text-white">
                                                                                <span className="text-xl sm:text-3xl font-black tracking-tighter leading-none">+{(viewReport.media || []).filter((m: any) => {
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
                                            {(() => {
                                                const reportComments: any[] = (viewReport as any).comments || [];
                                                return (
                                                    <div className="bg-white border border-gray-100 rounded-2xl p-6 pt-5 shadow-sm">
                                                        {reportComments.length > 0 && (
                                                            <button
                                                                onClick={() => setExpandedComments(prev => ({ ...prev, [viewReport.report_id]: !prev[viewReport.report_id] }))}
                                                                className="text-[10px] font-black text-gray-400 hover:text-[#F97316] uppercase tracking-widest transition-colors flex items-center gap-2 mb-6"
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 transition-transform duration-300 ${expandedComments[viewReport.report_id] ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                                                                </svg>
                                                                {expandedComments[viewReport.report_id] ? 'Hide Comments' : `View all ${reportComments.length} comments`}
                                                            </button>
                                                        )}

                                                        {(expandedComments[viewReport.report_id] || reportComments.length === 0) && (
                                                            <div className="space-y-2 mb-6 max-h-72 overflow-y-auto custom-scrollbar pr-2 animate-in fade-in slide-in-from-top-2 duration-300">
                                                                {reportComments.length > 0 ? (
                                                                    reportComments
                                                                        .filter((c: any) => !c.parent_comment_id)
                                                                        .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                                                                        .map((c: any) => {
                                                                            const replies = reportComments
                                                                                .filter((reply: any) => reply.parent_comment_id === c.comment_id)
                                                                                .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
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
                                                                                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest"><RelativeTimestamp date={c.created_at} /></span>
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
                                                                                                            <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest"><RelativeTimestamp date={reply.created_at} /></span>
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
                                                );
                                            })()}

                                            {/* ACTION PANEL */}
                                            <div className="mt-8 pt-8 border-t border-gray-100">
                                                <div className="flex flex-col gap-3">
                                                    <button
                                                        onClick={() => {
                                                            setDirectActionReportId(viewReport.report_id);
                                                            setTargetStatusId(viewReport.status_id < 5 ? 5 : viewReport.status_id);
                                                            setIsDirectActionModalOpen(true);
                                                        }}
                                                        className="w-full py-4 bg-[#B35D25] hover:bg-[#964E1F] text-white rounded-2xl text-xs font-bold shadow-lg shadow-orange-900/10 transition-all transform hover:-translate-y-0.5 active:scale-95 flex items-center justify-center gap-2 uppercase tracking-wider"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                                        </svg>
                                                        DIRECT ACTION / STATUS OVERRIDE
                                                    </button>

                                                    {viewReport.status_id !== 6 && !RESOLVED_STATUS_IDS.includes(viewReport.status_id) && (
                                                        <button
                                                            onClick={() => {
                                                                handleUpdateStatus(viewReport.report_id, 11);
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

            {/* Direct Action / Status Override Modal */}
            {isDirectActionModalOpen && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="px-8 py-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <div>
                                <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-orange-100 text-[#B35D25] text-[10px] font-black uppercase tracking-wider mb-1">
                                    Administrator Authority
                                </div>
                                <h3 className="text-xl font-bold text-gray-900">Direct Action / Status Override</h3>
                                <p className="text-xs text-gray-500 mt-1">Directly assign rescue teams or update incident status without endorsement letters.</p>
                            </div>
                            <button
                                onClick={() => setIsDirectActionModalOpen(false)}
                                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-all"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <form onSubmit={handleDirectActionSubmit} className="p-8 space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Target Action & Status</label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                    {[
                                        { id: 5, label: 'Team Dispatched', desc: 'Deploy rescue responder' },
                                        { id: 13, label: 'Approved by Barangay', desc: 'Authorize logistics' },
                                        { id: 16, label: 'Under Investigation', desc: 'Formal inspection inquiry' },
                                        { id: 14, label: 'False Alarm / Dismissed', desc: 'Close without penalty' }
                                    ].map(action => (
                                        <div
                                            key={action.id}
                                            onClick={() => setTargetStatusId(action.id)}
                                            className={`p-3.5 rounded-2xl border-2 cursor-pointer transition-all ${
                                                targetStatusId === action.id
                                                    ? 'border-[#B35D25] bg-orange-50/40 text-gray-900 shadow-sm'
                                                    : 'border-gray-100 bg-gray-50/50 text-gray-600 hover:border-gray-200 hover:bg-gray-50'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs font-bold">{action.label}</span>
                                                <span className={`w-2.5 h-2.5 rounded-full ${targetStatusId === action.id ? 'bg-[#B35D25]' : 'bg-gray-300'}`} />
                                            </div>
                                            <p className="text-[10px] text-gray-400 mt-1 font-medium">{action.desc}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {targetStatusId === 5 && (
                                <div className="space-y-1.5 animate-in fade-in duration-200">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">
                                        Assign Rescue Staff / Responder <span className="text-red-500">*</span>
                                    </label>
                                    <select
                                        required
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-semibold text-gray-800 focus:ring-2 focus:ring-[#B35D25] outline-none transition-all"
                                        value={selectedStaffId}
                                        onChange={(e) => setSelectedStaffId(e.target.value ? Number(e.target.value) : '')}
                                    >
                                        <option value="">-- Select Field Personnel --</option>
                                        {staffList.map((st) => (
                                            <option key={st.user_id} value={st.user_id}>
                                                {st.name} ({st.role_id === 3 ? 'Barangay Staff' : st.role_id === 2 ? 'Subdivision Leader' : 'Officer'})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">
                                    Operational Directive / Remarks (Optional)
                                </label>
                                <textarea
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm focus:ring-2 focus:ring-[#B35D25] outline-none transition-all min-h-[90px] placeholder:text-gray-300 font-medium"
                                    value={actionRemarks}
                                    onChange={(e) => setActionRemarks(e.target.value)}
                                    placeholder="Enter directives or justification (will be permanently logged in audit history)..."
                                />
                            </div>

                            <div className="pt-2 flex items-center justify-end space-x-3">
                                <button
                                    type="button"
                                    onClick={() => setIsDirectActionModalOpen(false)}
                                    className="px-6 py-2.5 text-sm font-bold text-gray-500 hover:text-gray-700 transition-colors"
                                >
                                    Cancel
                                </button>
                                <Button
                                    variant="primary"
                                    type="submit"
                                    disabled={isSubmittingAction}
                                    className="px-8 !bg-[#B35D25] hover:!bg-[#964E1F] !border-[#B35D25] font-black text-xs uppercase tracking-wider"
                                >
                                    {isSubmittingAction ? 'Applying...' : 'Apply Status Override'}
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
