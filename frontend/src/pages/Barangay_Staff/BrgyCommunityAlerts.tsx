import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BrgySidebar from '../../components/BrgySidebar';
import BrgyNavbar from '../../components/Navbars/BrgyNavbar';
import BrgyBottomNav from '../../components/Navbars/BrgyBottomNav';
import { api } from '../../utils/api';
import { 
    Megaphone, 
    AlertTriangle, 
    CheckCircle2, 
    Clock, 
    Plus, 
    MapPin, 
    Trash2, 
    Eye, 
    X, 
    Radio, 
    Calendar, 
    User,
    Check,
    Sparkles
} from 'lucide-react';

interface AnnouncementItem {
    announcement_id: number;
    title: string;
    category: string;
    visibility: string;
    content: string;
    pinned: boolean;
    expiration?: string | null;
    location?: string | null;
    posted_by: string;
    posted_on: string;
    status: string;
    media?: Array<{ file_url: string; media_type: string }>;
}

const BrgyCommunityAlerts = () => {
    const navigate = useNavigate();
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [alerts, setAlerts] = useState<AnnouncementItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filterTab, setFilterTab] = useState<'active' | 'all'>('active');

    // Create Modal state
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [createForm, setCreateForm] = useState({
        title: '',
        category: 'Emergency',
        content: '',
        pinned: true,
        expiration: ''
    });

    // View Modal state
    const [selectedAlert, setSelectedAlert] = useState<AnnouncementItem | null>(null);

    // Toast feedback
    const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

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

    const fetchAlerts = async () => {
        try {
            setIsLoading(true);
            const rawUser = localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user');
            const user = rawUser ? JSON.parse(rawUser) : currentUser;
            const bId = user?.barangay_id;

            if (bId) {
                const res = await api.get(`/announcements/barangay/${bId}`);
                setAlerts(res.data || []);
            } else {
                const res = await api.get('/announcements/');
                setAlerts(res.data || []);
            }
        } catch (err) {
            console.error('Error fetching alerts:', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (currentUser) {
            fetchAlerts();
        }
    }, [currentUser]);

    const handleCreateAlert = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!createForm.title.trim() || !createForm.content.trim()) {
            setToast({ type: 'error', message: 'Title and content are required.' });
            return;
        }

        setIsSubmitting(true);
        try {
            await api.post('/announcements/', {
                created_by: currentUser?.user_id,
                barangay_id: currentUser?.barangay_id,
                title: createForm.title.trim(),
                category: createForm.category,
                content: createForm.content.trim(),
                pinned: createForm.pinned,
                expiration: createForm.expiration ? new Date(createForm.expiration).toISOString() : null,
                visibility: 'Public',
                status: 'Published'
            });

            setToast({ type: 'success', message: 'Community alert published successfully!' });
            setIsCreateModalOpen(false);
            setCreateForm({
                title: '',
                category: 'Emergency',
                content: '',
                pinned: true,
                expiration: ''
            });
            fetchAlerts();
        } catch (err: any) {
            const msg = err.response?.data?.detail || 'Failed to publish alert.';
            setToast({ type: 'error', message: msg });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleResolveAlert = async (alertId: number) => {
        try {
            await api.patch(`/announcements/${alertId}/status?status=Archived`);
            setToast({ type: 'success', message: 'Alert resolved and moved to archive.' });
            fetchAlerts();
            if (selectedAlert?.announcement_id === alertId) {
                setSelectedAlert(null);
            }
        } catch (err: any) {
            setToast({ type: 'error', message: 'Failed to update alert status.' });
        }
    };

    const handleDeleteAlert = async (alertId: number) => {
        if (!window.confirm('Are you sure you want to permanently delete this alert?')) return;
        try {
            await api.delete(`/announcements/${alertId}`);
            setToast({ type: 'success', message: 'Alert deleted successfully.' });
            fetchAlerts();
            if (selectedAlert?.announcement_id === alertId) {
                setSelectedAlert(null);
            }
        } catch (err: any) {
            setToast({ type: 'error', message: 'Failed to delete alert.' });
        }
    };

    // Filter alerts
    const now = new Date();
    const isAlertActive = (a: AnnouncementItem) => {
        if (a.status === 'Archived' || a.status === 'Resolved' || a.status === 'Draft') return false;
        if (a.expiration && new Date(a.expiration) < now) return false;
        return true;
    };

    const displayedAlerts = filterTab === 'active' 
        ? alerts.filter(isAlertActive)
        : alerts;

    const activeCount = alerts.filter(isAlertActive).length;
    const dangerCount = alerts.filter(a => a.pinned || a.category === 'Emergency' || a.category === 'Emergency Alert').length;
    const resolvedCount = alerts.filter(a => a.status === 'Archived' || a.status === 'Resolved' || (a.expiration && new Date(a.expiration) < now)).length;

    const getTypeBadge = (category: string, pinned: boolean) => {
        if (pinned || category.toLowerCase().includes('emergency')) {
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-red-50 text-red-700 text-[10px] font-black uppercase tracking-wider border border-red-200/90 shadow-2xs">
                    <AlertTriangle className="w-3 h-3 text-red-600 shrink-0" />
                    <span>Emergency</span>
                </span>
            );
        }
        if (category.toLowerCase().includes('advisory') || category.toLowerCase().includes('warning')) {
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-amber-50 text-amber-800 text-[10px] font-black uppercase tracking-wider border border-amber-200/90 shadow-2xs">
                    <Radio className="w-3 h-3 text-amber-600 shrink-0" />
                    <span>Advisory</span>
                </span>
            );
        }
        return (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-blue-50 text-blue-700 text-[10px] font-black uppercase tracking-wider border border-blue-200/90 shadow-2xs">
                <Megaphone className="w-3 h-3 text-blue-600 shrink-0" />
                <span>Info</span>
            </span>
        );
    };

    const getStatusBadge = (a: AnnouncementItem) => {
        const isExp = a.expiration && new Date(a.expiration) < now;
        if (isExp) {
            return (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-gray-100 text-gray-500 text-[10px] font-black uppercase tracking-wider border border-gray-200">
                    <Clock className="w-3 h-3" />
                    <span>Expired</span>
                </span>
            );
        }
        if (a.status === 'Archived' || a.status === 'Resolved') {
            return (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-gray-100 text-gray-600 text-[10px] font-black uppercase tracking-wider border border-gray-200">
                    <Check className="w-3 h-3" />
                    <span>Resolved</span>
                </span>
            );
        }
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-wider border border-emerald-200/90 shadow-2xs">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                <span>Active</span>
            </span>
        );
    };

    return (
        <div className="min-h-screen w-full flex bg-[#FBFBF9] font-sans text-gray-800">
            <BrgySidebar 
                isMobileOpen={isMobileSidebarOpen}
                onCloseMobile={() => setIsMobileSidebarOpen(false)}
            />
            <main className="flex-1 flex flex-col h-screen overflow-hidden w-full">
                <BrgyNavbar
                    onMenuToggle={() => setIsMobileSidebarOpen(true)}
                    leftContent={
                        <div className="flex flex-col">
                            <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none uppercase">Community Alerts</h1>
                            <p className="text-[9px] text-gray-400 font-extrabold uppercase tracking-wider mt-1.5 leading-none">Broadcast safety alerts and advisories to the community</p>
                        </div>
                    }
                />
                <div className="flex-1 overflow-y-auto p-3.5 sm:p-8 pb-32 lg:pb-8 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
                    <div className="flex flex-col gap-4 sm:gap-6 max-w-7xl mx-auto">

                        {/* Mobile Hero Banner (block md:hidden) */}
                        <div className="block md:hidden relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#EA580C] via-[#F97316] to-[#FB923C] p-5 shadow-lg shadow-orange-500/20 text-white animate-in fade-in slide-in-from-top-3 duration-300">
                            {/* Decorative glowing backdrops */}
                            <div className="absolute -right-8 -top-8 w-36 h-36 bg-white/15 rounded-full blur-2xl pointer-events-none" />
                            <div className="absolute right-12 -bottom-10 w-32 h-32 bg-amber-300/20 rounded-full blur-xl pointer-events-none" />
                            <div className="absolute right-4 top-3 text-2xl opacity-90 select-none animate-bounce duration-1000">
                                📢
                            </div>

                            <div className="relative z-10 space-y-3.5">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center text-white shadow-xs">
                                            <Megaphone className="w-5 h-5 animate-pulse" />
                                        </div>
                                        <div>
                                            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/20 backdrop-blur-md text-[10px] font-black uppercase tracking-wider text-orange-100 border border-white/25 shadow-2xs mb-1">
                                                <Sparkles className="w-2.5 h-2.5 text-amber-200" /> Broadcast Center
                                            </div>
                                            <h1 className="text-lg font-black tracking-tight leading-none text-white">
                                                Community Alerts
                                            </h1>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between gap-2 pt-1">
                                    <div className="flex items-center gap-2">
                                        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white/15 backdrop-blur-md rounded-xl border border-white/30 text-[10px] font-bold text-white">
                                            <div className="w-2 h-2 rounded-full bg-emerald-300 animate-ping" />
                                            <span>Live Feed</span>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={() => setIsCreateModalOpen(true)}
                                        className="px-3.5 py-1.5 bg-white text-[#EA580C] hover:bg-orange-50 rounded-xl text-xs font-black shadow-md transition-transform active:scale-95 cursor-pointer flex items-center gap-1.5"
                                    >
                                        <Plus className="w-3.5 h-3.5" />
                                        <span>New Alert</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Desktop Top Action Bar (hidden md:flex) */}
                        <div className="hidden md:flex flex-row items-center justify-between gap-3 bg-white p-5 rounded-2xl border border-gray-200/90 shadow-2xs">
                            <div className="min-w-0">
                                <h2 className="text-lg font-black text-gray-900 flex items-center gap-2 truncate">
                                    <div className="p-1.5 rounded-xl bg-orange-100 text-orange-600 shrink-0">
                                        <Megaphone className="w-5 h-5" />
                                    </div>
                                    <span className="truncate">Barangay Bulletins</span>
                                </h2>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    Manage real-time announcements broadcast to citizens in your jurisdiction
                                </p>
                            </div>
                            <button 
                                onClick={() => setIsCreateModalOpen(true)}
                                className="px-5 py-2.5 bg-[#F97316] hover:bg-[#EA580C] text-white rounded-xl text-xs font-black shadow-xs hover:shadow-sm transition-all cursor-pointer flex items-center gap-1.5 shrink-0 active:scale-95"
                            >
                                <Plus className="w-4 h-4" />
                                <span>New Alert</span>
                            </button>
                        </div>

                        {/* Stats Cards - Compact 3-Column on Mobile */}
                        <div className="grid grid-cols-3 gap-2 sm:gap-4">
                            <div className="bg-white rounded-2xl p-3 sm:p-5 shadow-2xs border border-gray-200/90 flex flex-col justify-between h-24 sm:h-28 transition-all hover:shadow-xs">
                                <div className="w-7 h-7 sm:w-9 sm:h-9 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600 shrink-0">
                                    <Radio className="w-4 h-4 sm:w-5 sm:h-5" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-lg sm:text-2xl font-black text-gray-900 leading-none">{activeCount}</p>
                                    <p className="text-[9px] sm:text-[10px] font-bold text-gray-400 tracking-wider uppercase mt-1 truncate">Active</p>
                                </div>
                            </div>

                            <div className="bg-white rounded-2xl p-3 sm:p-5 shadow-2xs border border-gray-200/90 flex flex-col justify-between h-24 sm:h-28 transition-all hover:shadow-xs">
                                <div className="w-7 h-7 sm:w-9 sm:h-9 bg-red-50 rounded-xl flex items-center justify-center text-red-600 shrink-0">
                                    <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-lg sm:text-2xl font-black text-gray-900 leading-none">{dangerCount}</p>
                                    <p className="text-[9px] sm:text-[10px] font-bold text-gray-400 tracking-wider uppercase mt-1 truncate">Emergency</p>
                                </div>
                            </div>

                            <div className="bg-white rounded-2xl p-3 sm:p-5 shadow-2xs border border-gray-200/90 flex flex-col justify-between h-24 sm:h-28 transition-all hover:shadow-xs">
                                <div className="w-7 h-7 sm:w-9 sm:h-9 bg-slate-100 rounded-xl flex items-center justify-center text-slate-700 shrink-0">
                                    <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-lg sm:text-2xl font-black text-gray-900 leading-none">{resolvedCount}</p>
                                    <p className="text-[9px] sm:text-[10px] font-bold text-gray-400 tracking-wider uppercase mt-1 truncate">Resolved</p>
                                </div>
                            </div>
                        </div>

                        {/* Alerts List Container */}
                        <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xs border border-gray-200/90 overflow-hidden">
                            <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-gray-100 flex justify-between items-center gap-2">
                                <h3 className="text-xs sm:text-sm font-black text-gray-900">Community Alerts</h3>
                                <div className="flex items-center gap-1.5 p-1 bg-gray-100/80 rounded-xl border border-gray-200/60">
                                    <button 
                                        onClick={() => setFilterTab('active')}
                                        className={`px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-wider cursor-pointer transition-all ${
                                            filterTab === 'active' 
                                                ? 'bg-orange-500 text-white shadow-2xs' 
                                                : 'text-gray-500 hover:text-gray-900'
                                        }`}
                                    >
                                        Active ({activeCount})
                                    </button>
                                    <button 
                                        onClick={() => setFilterTab('all')}
                                        className={`px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-wider cursor-pointer transition-all ${
                                            filterTab === 'all' 
                                                ? 'bg-orange-500 text-white shadow-2xs' 
                                                : 'text-gray-500 hover:text-gray-900'
                                        }`}
                                    >
                                        All ({alerts.length})
                                    </button>
                                </div>
                            </div>

                            {isLoading ? (
                                <div className="py-16 text-center text-slate-400">
                                    <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                                    <p className="text-xs font-bold text-gray-500">Loading community bulletins...</p>
                                </div>
                            ) : displayedAlerts.length === 0 ? (
                                <div className="py-12 sm:py-16 text-center text-gray-400 px-4">
                                    <div className="w-12 h-12 rounded-2xl bg-orange-50 text-orange-500 flex items-center justify-center mx-auto mb-3 shadow-2xs">
                                        <Megaphone className="w-6 h-6" />
                                    </div>
                                    <p className="font-black text-gray-900 text-sm">No community alerts found</p>
                                    <p className="text-xs text-gray-500 mt-1 max-w-xs mx-auto">Publish a real-time safety alert or advisory using the button above.</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-gray-100">
                                    {displayedAlerts.map((alert) => (
                                        <div key={alert.announcement_id} className="p-4 sm:px-6 sm:py-5 hover:bg-gray-50/70 transition-colors group">
                                            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4">
                                                <div className="flex items-start gap-3 sm:gap-4 flex-1 min-w-0">
                                                    <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0 shadow-2xs ${
                                                        alert.pinned || alert.category === 'Emergency' ? 'bg-red-100 text-red-600' :
                                                        alert.category.toLowerCase().includes('advisory') ? 'bg-amber-100 text-amber-700' :
                                                        'bg-blue-100 text-blue-700'
                                                    }`}>
                                                        {alert.pinned || alert.category === 'Emergency' ? (
                                                            <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5" />
                                                        ) : (
                                                            <Megaphone className="w-4 h-4 sm:w-5 sm:h-5" />
                                                        )}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 flex-wrap">
                                                            <span className="text-[10px] font-black text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-md">
                                                                #{alert.announcement_id}
                                                            </span>
                                                            {getTypeBadge(alert.category, alert.pinned)}
                                                            {getStatusBadge(alert)}
                                                        </div>
                                                        <h4 className="text-sm sm:text-base font-black text-gray-900 mb-1 leading-snug">
                                                            {alert.title}
                                                        </h4>
                                                        <p className="text-xs text-gray-600 leading-relaxed mb-2.5 whitespace-pre-line bg-gray-50/70 p-2.5 rounded-xl border border-gray-100/90">
                                                            {alert.content}
                                                        </p>
                                                        
                                                        {/* Metadata row */}
                                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-bold text-gray-500">
                                                            <span className="flex items-center gap-1 text-gray-700">
                                                                <MapPin className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                                                                <span>{alert.location || 'Jurisdiction Wide'}</span>
                                                            </span>
                                                            <span className="flex items-center gap-1">
                                                                <Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                                                <span>Posted: {new Date(alert.posted_on).toLocaleDateString()}</span>
                                                            </span>
                                                            {alert.expiration && (
                                                                <span className="flex items-center gap-1 text-amber-700">
                                                                    <Clock className="w-3.5 h-3.5 shrink-0" />
                                                                    <span>Expires: {new Date(alert.expiration).toLocaleDateString()}</span>
                                                                </span>
                                                            )}
                                                            <span className="flex items-center gap-1">
                                                                <User className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                                                <span>By: {alert.posted_by}</span>
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                                
                                                {/* Action buttons - Always visible on mobile, hover on desktop */}
                                                <div className="flex items-center justify-end gap-1.5 sm:gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-100">
                                                    <button 
                                                        onClick={() => setSelectedAlert(alert)}
                                                        className="px-3 py-1.5 text-xs font-black text-orange-600 bg-orange-50 hover:bg-orange-100 rounded-xl border border-orange-200/80 shadow-2xs transition-colors flex items-center gap-1 cursor-pointer"
                                                    >
                                                        <Eye className="w-3.5 h-3.5" />
                                                        <span>View</span>
                                                    </button>
                                                    {isAlertActive(alert) && (
                                                        <button 
                                                            onClick={() => handleResolveAlert(alert.announcement_id)}
                                                            className="px-3 py-1.5 text-xs font-black text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-xl border border-emerald-200/90 shadow-2xs transition-colors flex items-center gap-1 cursor-pointer"
                                                        >
                                                            <CheckCircle2 className="w-3.5 h-3.5" />
                                                            <span>Resolve</span>
                                                        </button>
                                                    )}
                                                    {currentUser?.is_head_officer && (
                                                        <button 
                                                            onClick={() => handleDeleteAlert(alert.announcement_id)}
                                                            className="p-1.5 text-xs font-black text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-xl border border-rose-200 transition-colors cursor-pointer"
                                                            title="Delete Alert"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                    </div>
                </div>

                <BrgyBottomNav activeTab="alerts" />
            </main>

            {/* CREATE ALERT MODAL */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 z-[10000] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3.5 sm:p-4">
                    <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-100 w-full max-w-lg overflow-hidden flex flex-col p-5 sm:p-6 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-3.5 mb-4 shrink-0">
                            <div className="flex items-center gap-2.5">
                                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center font-black shadow-2xs shrink-0">
                                    <Megaphone className="w-5 h-5" />
                                </div>
                                <div className="min-w-0">
                                    <h3 className="text-base sm:text-lg font-black text-slate-900 truncate">Publish Community Alert</h3>
                                    <p className="text-[11px] sm:text-xs text-slate-500 font-medium truncate">Issue a real-time safety alert to residents</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsCreateModalOpen(false)}
                                className="p-1.5 hover:bg-slate-100 rounded-xl transition-colors text-slate-400 hover:text-slate-700 cursor-pointer"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleCreateAlert} className="space-y-3.5 text-xs">
                            <div>
                                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-600 mb-1">Alert Title *</label>
                                <input
                                    type="text"
                                    value={createForm.title}
                                    onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                                    placeholder="e.g. Stray Pack Sighting Near School Zone"
                                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-none focus:border-orange-500 transition-colors"
                                    required
                                />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-600 mb-1">Alert Type *</label>
                                    <select
                                        value={createForm.category}
                                        onChange={(e) => setCreateForm({ ...createForm, category: e.target.value })}
                                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-none focus:border-orange-500 transition-colors"
                                    >
                                        <option value="Emergency">Emergency Alert</option>
                                        <option value="Animal Advisory">General Animal Advisory</option>
                                        <option value="Vaccination Drive">Community Event / Vaccination</option>
                                        <option value="Lost and Found">Lost & Found Advisory</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-600 mb-1">Expiration Date (Optional)</label>
                                    <input
                                        type="date"
                                        value={createForm.expiration}
                                        onChange={(e) => setCreateForm({ ...createForm, expiration: e.target.value })}
                                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-none focus:border-orange-500 transition-colors"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-600 mb-1">Alert Message & Advisory *</label>
                                <textarea
                                    value={createForm.content}
                                    onChange={(e) => setCreateForm({ ...createForm, content: e.target.value })}
                                    placeholder="Provide detailed instructions, location landmarks, and safety advice..."
                                    rows={4}
                                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 focus:outline-none focus:border-orange-500 transition-colors resize-none"
                                    required
                                />
                            </div>

                            <div className="flex items-center gap-2.5 bg-amber-50/80 p-3 rounded-xl border border-amber-200">
                                <input
                                    type="checkbox"
                                    id="createPinnedCheck"
                                    checked={createForm.pinned}
                                    onChange={(e) => setCreateForm({ ...createForm, pinned: e.target.checked })}
                                    className="rounded border-slate-300 text-orange-600 focus:ring-orange-500 h-4 w-4 cursor-pointer"
                                />
                                <label htmlFor="createPinnedCheck" className="text-xs font-black text-amber-950 cursor-pointer">
                                    🚨 Mark as High Priority / Emergency Alert
                                </label>
                            </div>

                            <div className="border-t border-slate-100 pt-3.5 flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setIsCreateModalOpen(false)}
                                    className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-black cursor-pointer transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="px-5 py-2.5 bg-[#F97316] hover:bg-[#EA580C] text-white rounded-xl font-black flex items-center gap-2 cursor-pointer shadow-xs transition-colors disabled:opacity-50"
                                >
                                    {isSubmitting ? 'Publishing...' : 'Publish Alert'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* VIEW ALERT DETAIL MODAL */}
            {selectedAlert && (
                <div className="fixed inset-0 z-[10000] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3.5 sm:p-4">
                    <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-100 w-full max-w-lg overflow-hidden flex flex-col p-5 sm:p-6 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-3.5 mb-4 shrink-0">
                            <div className="min-w-0 pr-2">
                                <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                                    <span className="text-[10px] font-black text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-md">
                                        #{selectedAlert.announcement_id}
                                    </span>
                                    {getTypeBadge(selectedAlert.category, selectedAlert.pinned)}
                                    {getStatusBadge(selectedAlert)}
                                </div>
                                <h3 className="text-base sm:text-lg font-black text-slate-900 truncate">{selectedAlert.title}</h3>
                            </div>
                            <button
                                onClick={() => setSelectedAlert(null)}
                                className="p-1.5 hover:bg-slate-100 rounded-xl transition-colors text-slate-400 hover:text-slate-700 cursor-pointer shrink-0"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-3.5 text-xs">
                            <div className="bg-slate-50 p-3.5 sm:p-4 rounded-2xl border border-slate-100">
                                <p className="text-slate-700 whitespace-pre-line leading-relaxed font-medium">{selectedAlert.content}</p>
                            </div>

                            <div className="grid grid-cols-2 gap-2.5 text-slate-600">
                                <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-100">
                                    <span className="block text-[10px] uppercase font-black text-slate-400">Posted By</span>
                                    <span className="font-bold text-slate-900">{selectedAlert.posted_by}</span>
                                </div>
                                <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-100">
                                    <span className="block text-[10px] uppercase font-black text-slate-400">Jurisdiction</span>
                                    <span className="font-bold text-slate-900">{selectedAlert.location || 'All Subdivisions'}</span>
                                </div>
                                <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-100">
                                    <span className="block text-[10px] uppercase font-black text-slate-400">Published Date</span>
                                    <span className="font-bold text-slate-900">{new Date(selectedAlert.posted_on).toLocaleDateString()}</span>
                                </div>
                                <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-100">
                                    <span className="block text-[10px] uppercase font-black text-slate-400">Expiration</span>
                                    <span className="font-bold text-slate-900">{selectedAlert.expiration ? new Date(selectedAlert.expiration).toLocaleDateString() : 'No expiration set'}</span>
                                </div>
                            </div>
                        </div>

                        <div className="border-t border-slate-100 pt-3.5 mt-5 flex justify-between items-center gap-2">
                            {isAlertActive(selectedAlert) ? (
                                <button
                                    onClick={() => handleResolveAlert(selectedAlert.announcement_id)}
                                    className="px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/90 rounded-xl font-black cursor-pointer transition-colors text-xs flex items-center gap-1"
                                >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>Mark as Resolved</span>
                                </button>
                            ) : <div />}
                            <button
                                onClick={() => setSelectedAlert(null)}
                                className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-black cursor-pointer transition-colors text-xs"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* TOAST FEEDBACK */}
            {toast && (
                <div className="fixed bottom-6 right-6 z-[10001] animate-in slide-in-from-bottom-5 duration-300">
                    <div className={`flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-xl border backdrop-blur-md ${
                        toast.type === 'success' 
                            ? 'bg-emerald-900/90 text-white border-emerald-700 shadow-emerald-950/20' 
                            : 'bg-rose-900/90 text-white border-rose-700 shadow-rose-950/20'
                    }`}>
                        <span className="text-base">{toast.type === 'success' ? '✓' : '⚠️'}</span>
                        <span className="text-xs font-bold">{toast.message}</span>
                        <button 
                            onClick={() => setToast(null)}
                            className="ml-2 text-white/70 hover:text-white text-xs font-black cursor-pointer"
                        >
                            ✕
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BrgyCommunityAlerts;
