import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BrgySidebar from '../../components/BrgySidebar';
import BrgyNavbar from '../../components/Navbars/BrgyNavbar';
import { api } from '../../utils/api';

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
            return <span className="px-2.5 py-1 rounded-full bg-red-50 text-red-600 text-[10px] font-black uppercase tracking-widest border border-red-200/80">Emergency</span>;
        }
        if (category.toLowerCase().includes('advisory') || category.toLowerCase().includes('warning')) {
            return <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-600 text-[10px] font-black uppercase tracking-widest border border-amber-200/80">Advisory</span>;
        }
        return <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 text-[10px] font-black uppercase tracking-widest border border-blue-200/80">Info</span>;
    };

    const getStatusBadge = (a: AnnouncementItem) => {
        const isExp = a.expiration && new Date(a.expiration) < now;
        if (isExp) {
            return <span className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 text-[10px] font-black uppercase tracking-widest">Expired</span>;
        }
        if (a.status === 'Archived' || a.status === 'Resolved') {
            return <span className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 text-[10px] font-black uppercase tracking-widest">Resolved</span>;
        }
        return <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-widest border border-emerald-200/80">Active</span>;
    };

    return (
        <div className="min-h-screen w-full flex bg-[#F8F9FA] font-sans text-gray-800">
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
                <div className="flex-1 overflow-y-auto p-8 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
                    <div className="flex flex-col gap-8">

                        {/* Top Action Bar */}
                        <div className="flex justify-between items-center">
                            <div>
                                <h2 className="text-lg font-bold text-slate-900">Barangay Bulletins</h2>
                                <p className="text-xs text-slate-400">Manage real-time announcements broadcast to citizens in your jurisdiction</p>
                            </div>
                            <button 
                                onClick={() => setIsCreateModalOpen(true)}
                                className="px-5 py-2.5 bg-[#F97316] hover:bg-[#EA580C] text-white rounded-xl text-xs font-bold shadow-md hover:shadow-lg transition-all cursor-pointer flex items-center gap-1.5"
                            >
                                <span>+ New Alert</span>
                            </button>
                        </div>

                        {/* Stats Cards */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="bg-white rounded-2xl p-5 shadow-[0_2px_14px_rgba(0,0,0,0.02)] border border-gray-100 flex flex-col justify-between h-28 transition-all hover:shadow-md">
                                <div className="w-9 h-9 bg-green-50 rounded-xl flex items-center justify-center text-green-600">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M18 3a1 1 0 00-1.447-.894L8.763 6H5a3 3 0 000 6h.28l1.771 5.316A1 1 0 008 18h1a1 1 0 001-1v-4.382l6.553 3.276A1 1 0 0018 15V3z" clipRule="evenodd" />
                                    </svg>
                                </div>
                                <div>
                                    <p className="text-2xl font-black text-gray-900 leading-none">{activeCount}</p>
                                    <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase mt-1">Active Alerts</p>
                                </div>
                            </div>

                            <div className="bg-white rounded-2xl p-5 shadow-[0_2px_14px_rgba(0,0,0,0.02)] border border-gray-100 flex flex-col justify-between h-28 transition-all hover:shadow-md">
                                <div className="w-9 h-9 bg-red-50 rounded-xl flex items-center justify-center text-red-600">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                    </svg>
                                </div>
                                <div>
                                    <p className="text-2xl font-black text-gray-900 leading-none">{dangerCount}</p>
                                    <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase mt-1">Emergency Alerts</p>
                                </div>
                            </div>

                            <div className="bg-[#1A4543] rounded-2xl p-5 shadow-lg shadow-teal-900/10 flex flex-col justify-between h-28 transition-all hover:scale-[1.02]">
                                <div className="w-9 h-9 bg-white/10 rounded-xl flex items-center justify-center text-teal-300">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                    </svg>
                                </div>
                                <div>
                                    <p className="text-2xl font-black text-white leading-none">{resolvedCount}</p>
                                    <p className="text-[10px] font-bold text-teal-100/60 tracking-wider uppercase mt-1">Resolved / Archived</p>
                                </div>
                            </div>
                        </div>

                        {/* Alerts List */}
                        <div className="bg-white rounded-3xl shadow-[0_2px_14px_rgba(0,0,0,0.02)] border border-gray-100 overflow-hidden">
                            <div className="px-6 py-5 border-b border-gray-50 flex justify-between items-center">
                                <h3 className="text-sm font-bold text-gray-900">All Community Alerts</h3>
                                <div className="flex items-center gap-2">
                                    <button 
                                        onClick={() => setFilterTab('active')}
                                        className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest cursor-pointer transition-colors ${
                                            filterTab === 'active' 
                                                ? 'bg-orange-50 text-orange-600 font-black' 
                                                : 'text-gray-400 hover:bg-gray-50'
                                        }`}
                                    >
                                        Active ({activeCount})
                                    </button>
                                    <button 
                                        onClick={() => setFilterTab('all')}
                                        className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest cursor-pointer transition-colors ${
                                            filterTab === 'all' 
                                                ? 'bg-orange-50 text-orange-600 font-black' 
                                                : 'text-gray-400 hover:bg-gray-50'
                                        }`}
                                    >
                                        All ({alerts.length})
                                    </button>
                                </div>
                            </div>

                            {isLoading ? (
                                <div className="py-16 text-center text-slate-400">
                                    <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                                    <p className="text-xs font-semibold">Loading community bulletins...</p>
                                </div>
                            ) : displayedAlerts.length === 0 ? (
                                <div className="py-16 text-center text-slate-400">
                                    <div className="w-12 h-12 rounded-2xl bg-slate-50 text-slate-300 flex items-center justify-center mx-auto mb-2 text-xl">
                                        📢
                                    </div>
                                    <p className="font-bold text-slate-700 text-sm">No community alerts found</p>
                                    <p className="text-xs text-slate-400 mt-1">Publish an alert using the "+ New Alert" button above.</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-gray-50">
                                    {displayedAlerts.map((alert) => (
                                        <div key={alert.announcement_id} className="px-6 py-5 hover:bg-gray-50/50 transition-colors group">
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="flex items-start gap-4 flex-1">
                                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                                                        alert.pinned || alert.category === 'Emergency' ? 'bg-red-100 text-red-600' :
                                                        alert.category.toLowerCase().includes('advisory') ? 'bg-amber-100 text-amber-600' :
                                                        'bg-blue-100 text-blue-600'
                                                    }`}>
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                            <path fillRule="evenodd" d="M18 3a1 1 0 00-1.447-.894L8.763 6H5a3 3 0 000 6h.28l1.771 5.316A1 1 0 008 18h1a1 1 0 001-1v-4.382l6.553 3.276A1 1 0 0018 15V3z" clipRule="evenodd" />
                                                        </svg>
                                                    </div>
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <span className="text-[10px] font-bold text-gray-400">#{alert.announcement_id}</span>
                                                            {getTypeBadge(alert.category, alert.pinned)}
                                                            {getStatusBadge(alert)}
                                                        </div>
                                                        <h4 className="text-sm font-bold text-gray-900 mb-1">{alert.title}</h4>
                                                        <p className="text-xs text-gray-500 leading-relaxed mb-2 whitespace-pre-line">{alert.content}</p>
                                                        <div className="flex items-center gap-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                                            <span className="flex items-center gap-1">
                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                                                                    <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                                                                </svg>
                                                                {alert.location || 'Jurisdiction Wide'}
                                                            </span>
                                                            <span>Posted: {new Date(alert.posted_on).toLocaleDateString()}</span>
                                                            {alert.expiration && (
                                                                <span>Expires: {new Date(alert.expiration).toLocaleDateString()}</span>
                                                            )}
                                                            <span>By: {alert.posted_by}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                
                                                {/* Action buttons */}
                                                <div className="flex items-center gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button 
                                                        onClick={() => setSelectedAlert(alert)}
                                                        className="px-3 py-1.5 text-[10px] font-bold text-orange-600 uppercase tracking-widest hover:bg-orange-50 rounded-lg cursor-pointer"
                                                    >
                                                        View
                                                    </button>
                                                    {isAlertActive(alert) && (
                                                        <button 
                                                            onClick={() => handleResolveAlert(alert.announcement_id)}
                                                            className="px-3 py-1.5 text-[10px] font-bold text-emerald-600 uppercase tracking-widest hover:bg-emerald-50 rounded-lg cursor-pointer"
                                                        >
                                                            Resolve
                                                        </button>
                                                    )}
                                                    {currentUser?.is_head_officer && (
                                                        <button 
                                                            onClick={() => handleDeleteAlert(alert.announcement_id)}
                                                            className="px-2 py-1.5 text-[10px] font-bold text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                                                            title="Delete Alert"
                                                        >
                                                            🗑
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
            </main>

            {/* CREATE ALERT MODAL */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 z-[10000] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
                    <div className="bg-white rounded-[28px] shadow-2xl border border-slate-100 w-full max-w-lg overflow-hidden flex flex-col p-6 animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-4 shrink-0">
                            <div className="flex items-center gap-2.5">
                                <div className="w-9 h-9 rounded-xl bg-orange-50 text-[#F97316] flex items-center justify-center font-bold">
                                    📢
                                </div>
                                <div>
                                    <h3 className="text-base font-black text-slate-900">Publish Community Alert</h3>
                                    <p className="text-[11px] text-slate-400 font-medium">Issue a real-time safety alert to residents</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsCreateModalOpen(false)}
                                className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-700 cursor-pointer"
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleCreateAlert} className="space-y-4 text-xs">
                            <div>
                                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">Alert Title *</label>
                                <input
                                    type="text"
                                    value={createForm.title}
                                    onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                                    placeholder="e.g. Stray Pack Sighting Near School Zone"
                                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 focus:outline-none focus:border-orange-500"
                                    required
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">Alert Type *</label>
                                    <select
                                        value={createForm.category}
                                        onChange={(e) => setCreateForm({ ...createForm, category: e.target.value })}
                                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 focus:outline-none focus:border-orange-500"
                                    >
                                        <option value="Emergency">Emergency Alert</option>
                                        <option value="Animal Advisory">General Animal Advisory</option>
                                        <option value="Vaccination Drive">Community Event / Vaccination</option>
                                        <option value="Lost and Found">Lost & Found Advisory</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">Expiration Date (Optional)</label>
                                    <input
                                        type="date"
                                        value={createForm.expiration}
                                        onChange={(e) => setCreateForm({ ...createForm, expiration: e.target.value })}
                                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 focus:outline-none focus:border-orange-500"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">Alert Message & Advisory *</label>
                                <textarea
                                    value={createForm.content}
                                    onChange={(e) => setCreateForm({ ...createForm, content: e.target.value })}
                                    placeholder="Provide detailed instructions, location landmarks, and safety advice..."
                                    rows={4}
                                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 focus:outline-none focus:border-orange-500"
                                    required
                                />
                            </div>

                            <div className="flex items-center gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                                <input
                                    type="checkbox"
                                    id="createPinnedCheck"
                                    checked={createForm.pinned}
                                    onChange={(e) => setCreateForm({ ...createForm, pinned: e.target.checked })}
                                    className="rounded border-slate-300 text-orange-600 focus:ring-orange-500 h-4 w-4"
                                />
                                <label htmlFor="createPinnedCheck" className="text-xs font-bold text-slate-700 cursor-pointer">
                                    🚨 Mark as High Priority / Emergency Alert
                                </label>
                            </div>

                            <div className="border-t border-slate-100 pt-4 flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setIsCreateModalOpen(false)}
                                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold cursor-pointer transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="px-5 py-2 bg-[#F97316] hover:bg-[#EA580C] text-white rounded-xl font-bold flex items-center gap-2 cursor-pointer shadow-sm transition-colors disabled:opacity-50"
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
                <div className="fixed inset-0 z-[10000] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
                    <div className="bg-white rounded-[28px] shadow-2xl border border-slate-100 w-full max-w-lg overflow-hidden flex flex-col p-6 animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-4 shrink-0">
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-[10px] font-bold text-gray-400">#{selectedAlert.announcement_id}</span>
                                    {getTypeBadge(selectedAlert.category, selectedAlert.pinned)}
                                    {getStatusBadge(selectedAlert)}
                                </div>
                                <h3 className="text-base font-black text-slate-900">{selectedAlert.title}</h3>
                            </div>
                            <button
                                onClick={() => setSelectedAlert(null)}
                                className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-700 cursor-pointer"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="space-y-4 text-xs">
                            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                <p className="text-slate-700 whitespace-pre-line leading-relaxed">{selectedAlert.content}</p>
                            </div>

                            <div className="grid grid-cols-2 gap-3 text-slate-500">
                                <div className="p-3 bg-slate-50/70 rounded-xl border border-slate-100">
                                    <span className="block text-[10px] uppercase font-black text-slate-400">Posted By</span>
                                    <span className="font-bold text-slate-800">{selectedAlert.posted_by}</span>
                                </div>
                                <div className="p-3 bg-slate-50/70 rounded-xl border border-slate-100">
                                    <span className="block text-[10px] uppercase font-black text-slate-400">Jurisdiction</span>
                                    <span className="font-bold text-slate-800">{selectedAlert.location || 'All Subdivisions'}</span>
                                </div>
                                <div className="p-3 bg-slate-50/70 rounded-xl border border-slate-100">
                                    <span className="block text-[10px] uppercase font-black text-slate-400">Published Date</span>
                                    <span className="font-bold text-slate-800">{new Date(selectedAlert.posted_on).toLocaleString()}</span>
                                </div>
                                <div className="p-3 bg-slate-50/70 rounded-xl border border-slate-100">
                                    <span className="block text-[10px] uppercase font-black text-slate-400">Expiration</span>
                                    <span className="font-bold text-slate-800">{selectedAlert.expiration ? new Date(selectedAlert.expiration).toLocaleDateString() : 'No expiration set'}</span>
                                </div>
                            </div>
                        </div>

                        <div className="border-t border-slate-100 pt-4 mt-6 flex justify-between items-center">
                            {isAlertActive(selectedAlert) ? (
                                <button
                                    onClick={() => handleResolveAlert(selectedAlert.announcement_id)}
                                    className="px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl font-bold cursor-pointer transition-colors"
                                >
                                    Mark as Resolved
                                </button>
                            ) : <div />}
                            <button
                                onClick={() => setSelectedAlert(null)}
                                className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold cursor-pointer transition-colors"
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
