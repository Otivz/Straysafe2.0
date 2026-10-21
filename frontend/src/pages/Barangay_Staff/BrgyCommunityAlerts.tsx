import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BrgySidebar from '../../components/BrgySidebar';
import BrgyNavbar from '../../components/Navbars/BrgyNavbar';
import BrgyBottomNav from '../../components/Navbars/BrgyBottomNav';
import { api } from '../../utils/api';
import { Megaphone, AlertTriangle, CheckCircle2, Plus, Trash2, X } from 'lucide-react';
import { useCachedState, usePersistentState, hasCachedData } from '../../utils/useCachedState';

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
    const [alerts, setAlerts] = useCachedState<AnnouncementItem[]>('brgy_community_alerts', []);
    const [isLoading, setIsLoading] = useState(() => !hasCachedData('data:brgy_community_alerts'));
    const [filterTab, setFilterTab] = usePersistentState<'active' | 'all'>('brgy_alerts_tab', 'active');

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
            if (!hasCachedData('data:brgy_community_alerts')) setIsLoading(true);
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

    // Same category look as the Subdivision announcements
    const isEmergency = (a: AnnouncementItem) => a.pinned || a.category.toLowerCase().includes('emergency');
    const isAdvisory = (a: AnnouncementItem) => a.category.toLowerCase().includes('advisory') || a.category.toLowerCase().includes('warning');
    const accentBorder = (a: AnnouncementItem) => isEmergency(a) ? 'border-l-red-500' : isAdvisory(a) ? 'border-l-amber-500' : 'border-l-blue-500';
    const iconTone = (a: AnnouncementItem) => isEmergency(a) ? 'bg-red-50 text-red-600' : isAdvisory(a) ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700';

    const getTypeBadge = (a: AnnouncementItem) => {
        const [label, tone] = isEmergency(a)
            ? ['Emergency', 'bg-red-50 text-red-700 border-red-200']
            : isAdvisory(a)
                ? ['Advisory', 'bg-amber-50 text-amber-800 border-amber-200']
                : ['Info', 'bg-blue-50 text-blue-700 border-blue-200'];
        return <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide border ${tone}`}>{label}</span>;
    };

    const getStatusBadge = (a: AnnouncementItem) => {
        const isExp = a.expiration && new Date(a.expiration) < now;
        if (isExp) return <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide border bg-gray-100 text-gray-500 border-gray-200">Expired</span>;
        if (a.status === 'Archived' || a.status === 'Resolved') return <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide border bg-gray-100 text-gray-600 border-gray-200">Resolved</span>;
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide border bg-emerald-50 text-emerald-700 border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Active
            </span>
        );
    };

    // Popups open: keep the page behind them still, Esc closes
    const anyModalOpen = isCreateModalOpen || !!selectedAlert;
    useEffect(() => {
        if (!anyModalOpen) return;
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            setSelectedAlert(null);
            if (!isSubmitting) setIsCreateModalOpen(false);
        };
        window.addEventListener('keydown', onKey);
        return () => {
            document.body.style.overflow = previous;
            window.removeEventListener('keydown', onKey);
        };
    }, [anyModalOpen, isSubmitting]);

    const FIELD = 'w-full min-w-0 h-11 px-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-role/20 focus:border-role/40 transition-colors';

    return (
        <div className="min-h-screen w-full flex bg-[#F8FAFC] font-sans text-gray-800">
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
                <div className="flex-1 overflow-y-auto px-3 py-4 sm:p-6 md:p-8 pb-32 lg:pb-8 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
                    <div className="max-w-5xl mx-auto w-full flex flex-col gap-3 sm:gap-4 min-w-0">

                        {/* Heading (phones; desktop shows it in the top bar) + New Alert */}
                        <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 md:hidden">
                                <h1 className="text-lg font-black text-gray-900 tracking-tight leading-tight">Community Alerts</h1>
                                <p className="text-xs font-semibold text-gray-500 truncate">Safety alerts and advisories for your barangay.</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsCreateModalOpen(true)}
                                className="h-10 px-4 md:ml-auto shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-role hover:bg-role-hover text-white font-black text-sm shadow-sm active:scale-95 transition-all cursor-pointer"
                            >
                                <Plus className="w-4 h-4" />
                                New Alert
                            </button>
                        </div>

                        {/* Stats */}
                        <div className="grid grid-cols-3 gap-2 sm:gap-3">
                            {[
                                { label: 'Active', sub: 'Live now', value: activeCount, color: 'text-emerald-600' },
                                { label: 'Emergency', sub: 'Pinned or emergency', value: dangerCount, color: 'text-red-600' },
                                { label: 'Resolved', sub: 'Archived or expired', value: resolvedCount, color: 'text-slate-700' },
                            ].map((m) => (
                                <div key={m.label} className="bg-white rounded-2xl border border-gray-200/80 p-3 sm:p-4 flex flex-col gap-1.5 min-w-0">
                                    <p className={`text-2xl sm:text-3xl font-black leading-none ${m.color}`}>{m.value}</p>
                                    <p className="text-xs font-bold text-gray-700 leading-tight">{m.label}</p>
                                    <p className="hidden sm:block text-[11px] font-semibold text-gray-400 leading-tight">{m.sub}</p>
                                </div>
                            ))}
                        </div>

                        {/* Active / All */}
                        <div className="grid grid-cols-2 gap-1 p-1 bg-gray-100 rounded-2xl sm:w-80" role="tablist" aria-label="Alerts">
                            {([
                                ['active', 'Active', activeCount],
                                ['all', 'All', alerts.length],
                            ] as const).map(([key, label, count]) => {
                                const isActive = filterTab === key;
                                return (
                                    <button
                                        key={key}
                                        type="button"
                                        role="tab"
                                        aria-selected={isActive}
                                        onClick={() => setFilterTab(key)}
                                        className={`h-9 rounded-xl text-xs font-black inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${isActive ? 'bg-role text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                                    >
                                        {label}
                                        <span className={`text-[10px] ${isActive ? 'text-white/80' : 'text-gray-400'}`}>{count}</span>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Alerts */}
                        <div className="flex flex-col gap-2.5 sm:gap-3">
                            {isLoading ? (
                                [1, 2, 3].map((n) => (
                                    <div key={n} className="bg-white rounded-2xl border border-gray-100 p-4 animate-pulse">
                                        <div className="flex gap-3">
                                            <div className="w-9 h-9 rounded-xl bg-gray-200 shrink-0" />
                                            <div className="flex-1 space-y-2 pt-1">
                                                <div className="h-4 w-2/3 bg-gray-200 rounded" />
                                                <div className="h-3 w-full bg-gray-100 rounded" />
                                                <div className="h-3 w-1/2 bg-gray-100 rounded" />
                                            </div>
                                        </div>
                                    </div>
                                ))
                            ) : displayedAlerts.length === 0 ? (
                                <div className="text-center py-10 px-4 bg-white rounded-2xl border border-dashed border-gray-200">
                                    <div className="w-12 h-12 rounded-full bg-role-soft text-role mx-auto flex items-center justify-center">
                                        <Megaphone className="w-6 h-6" />
                                    </div>
                                    <p className="text-sm font-black text-gray-800 mt-3">
                                        {filterTab === 'active' && alerts.length > 0 ? 'No active alerts' : 'No community alerts yet'}
                                    </p>
                                    <p className="text-xs text-gray-500 mt-1">
                                        {filterTab === 'active' && alerts.length > 0 ? 'Resolved and expired alerts are under All.' : 'Publish a safety alert or advisory with New Alert.'}
                                    </p>
                                    {filterTab === 'active' && alerts.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setFilterTab('all')}
                                            className="mt-3 h-9 px-4 rounded-xl border border-gray-200 text-xs font-black text-gray-700 hover:border-role-border hover:text-role transition-all cursor-pointer"
                                        >
                                            Show all alerts
                                        </button>
                                    )}
                                </div>
                            ) : (
                                displayedAlerts.map((alert) => (
                                    <div
                                        key={alert.announcement_id}
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => setSelectedAlert(alert)}
                                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedAlert(alert); } }}
                                        className={`bg-white rounded-2xl border border-gray-100 border-l-4 ${accentBorder(alert)} hover:shadow-md hover:border-gray-200 transition-all p-3 sm:p-4 cursor-pointer min-w-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-role/30`}
                                    >
                                        {/* Top: icon, title, badges */}
                                        <div className="flex items-start gap-3">
                                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${iconTone(alert)}`}>
                                                {isEmergency(alert) ? <AlertTriangle className="w-4.5 h-4.5" /> : <Megaphone className="w-4.5 h-4.5" />}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <h3 className="text-[15px] font-bold text-gray-900 leading-snug line-clamp-2 break-words">{alert.title}</h3>
                                                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                                    {getTypeBadge(alert)}
                                                    {getStatusBadge(alert)}
                                                    <span className="text-[10px] font-bold text-gray-400">#{alert.announcement_id}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Middle: preview + details */}
                                        <p className="text-[13px] text-gray-600 leading-relaxed line-clamp-2 break-words mt-2 whitespace-pre-line">{alert.content}</p>
                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px] font-semibold text-gray-500">
                                            <span className="truncate max-w-full">📍 {alert.location || 'Jurisdiction wide'}</span>
                                            <span>Posted {new Date(alert.posted_on).toLocaleDateString()}</span>
                                            {alert.expiration && <span className="text-amber-700">Expires {new Date(alert.expiration).toLocaleDateString()}</span>}
                                            <span className="truncate max-w-full">By {alert.posted_by}</span>
                                        </div>

                                        {/* Bottom: actions */}
                                        {(isAlertActive(alert) || currentUser?.is_head_officer) && (
                                            <div className="flex items-center justify-end gap-2 mt-2.5 pt-2.5 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
                                                {isAlertActive(alert) && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleResolveAlert(alert.announcement_id)}
                                                        className="h-9 px-3 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-xl border border-emerald-200 transition-colors flex items-center gap-1.5 cursor-pointer"
                                                    >
                                                        <CheckCircle2 className="w-4 h-4" />
                                                        Resolve
                                                    </button>
                                                )}
                                                {currentUser?.is_head_officer && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteAlert(alert.announcement_id)}
                                                        className="w-9 h-9 flex items-center justify-center text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-xl border border-rose-200 transition-colors cursor-pointer"
                                                        title="Delete alert"
                                                        aria-label="Delete alert"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>

                        {!isLoading && alerts.length > 0 && (
                            <p className="text-xs text-gray-500 font-semibold">
                                Showing {displayedAlerts.length} of {alerts.length} alert{alerts.length !== 1 ? 's' : ''}
                            </p>
                        )}
                    </div>
                </div>

                <BrgyBottomNav activeTab="alerts" />
            </main>

            {/* CREATE ALERT MODAL */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 z-[10000] flex items-stretch sm:items-center justify-center sm:p-4 bg-black/50" onClick={() => !isSubmitting && setIsCreateModalOpen(false)}>
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="create-alert-title"
                        onClick={(e) => e.stopPropagation()}
                        className="bg-white w-full max-w-full sm:max-w-[560px] min-w-0 h-[100dvh] sm:h-auto sm:max-h-[90dvh] sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
                    >
                        <div className="shrink-0 px-4 sm:px-6 pt-[max(0.75rem,env(safe-area-inset-top))] sm:pt-4 pb-3 border-b border-gray-100 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <h2 id="create-alert-title" className="text-lg font-black text-gray-900 leading-tight">New Alert</h2>
                                <p className="text-xs text-gray-500 mt-0.5 font-medium">Publish a safety alert to residents right away.</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsCreateModalOpen(false)}
                                disabled={isSubmitting}
                                aria-label="Close"
                                className="w-10 h-10 -mr-1.5 -mt-1 shrink-0 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 flex items-center justify-center transition-colors cursor-pointer"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleCreateAlert} className="flex-1 min-h-0 flex flex-col">
                            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4 flex flex-col gap-4">
                                <div className="min-w-0">
                                    <label htmlFor="alert-title" className="block text-xs font-bold text-gray-700 mb-1">Title</label>
                                    <input
                                        id="alert-title"
                                        type="text"
                                        value={createForm.title}
                                        onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                                        placeholder="e.g. Stray Pack Sighting Near School Zone"
                                        className={FIELD}
                                        required
                                    />
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 min-w-0">
                                    <div className="min-w-0">
                                        <label htmlFor="alert-type" className="block text-xs font-bold text-gray-700 mb-1">Alert type</label>
                                        <div className="relative">
                                            <select
                                                id="alert-type"
                                                value={createForm.category}
                                                onChange={(e) => setCreateForm({ ...createForm, category: e.target.value })}
                                                className={`${FIELD} pr-9 appearance-none cursor-pointer truncate`}
                                            >
                                                <option value="Emergency">Emergency Alert</option>
                                                <option value="Animal Advisory">General Animal Advisory</option>
                                                <option value="Vaccination Drive">Community Event / Vaccination</option>
                                                <option value="Lost and Found">Lost & Found Advisory</option>
                                            </select>
                                            <svg className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                                <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                        </div>
                                    </div>
                                    <div className="min-w-0">
                                        <label htmlFor="alert-expiration" className="block text-xs font-bold text-gray-700 mb-1">
                                            Expiration Date <span className="font-semibold text-gray-400">(Optional)</span>
                                        </label>
                                        <input
                                            id="alert-expiration"
                                            type="date"
                                            value={createForm.expiration}
                                            onChange={(e) => setCreateForm({ ...createForm, expiration: e.target.value })}
                                            className={`${FIELD} appearance-none`}
                                        />
                                    </div>
                                </div>

                                <div className="min-w-0">
                                    <label htmlFor="alert-content" className="block text-xs font-bold text-gray-700 mb-1">Message & advice</label>
                                    <textarea
                                        id="alert-content"
                                        value={createForm.content}
                                        onChange={(e) => setCreateForm({ ...createForm, content: e.target.value })}
                                        placeholder="Provide detailed instructions, location landmarks, and safety advice..."
                                        rows={5}
                                        className="w-full min-w-0 px-3 py-2.5 bg-[#f8f9fc] border border-gray-200 rounded-xl text-sm leading-relaxed text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-role/20 focus:border-role/40 resize-y min-h-[120px] transition-colors"
                                        required
                                    />
                                </div>

                                {/* High priority: its own row, same Yes/No switch as the Subdivision form */}
                                <fieldset className="min-w-0 flex items-center justify-between gap-3 py-3 border-y border-gray-100">
                                    <legend className="sr-only">High priority / emergency</legend>
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-gray-800">High priority / Emergency</p>
                                        <p className="text-[11px] text-gray-500 font-medium">Pinned and shown as an emergency</p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-1 p-1 bg-gray-100 rounded-xl shrink-0">
                                        <label className={`h-9 px-4 rounded-lg text-xs font-black flex items-center justify-center cursor-pointer transition-all has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-role/30 ${createForm.pinned ? 'bg-white text-role shadow-2xs' : 'text-gray-500'}`}>
                                            <input type="radio" name="alert-pinned" className="sr-only" checked={createForm.pinned} onChange={() => setCreateForm({ ...createForm, pinned: true })} />
                                            Yes
                                        </label>
                                        <label className={`h-9 px-4 rounded-lg text-xs font-black flex items-center justify-center cursor-pointer transition-all has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-role/30 ${!createForm.pinned ? 'bg-white text-gray-800 shadow-2xs' : 'text-gray-500'}`}>
                                            <input type="radio" name="alert-pinned" className="sr-only" checked={!createForm.pinned} onChange={() => setCreateForm({ ...createForm, pinned: false })} />
                                            No
                                        </label>
                                    </div>
                                </fieldset>
                            </div>

                            <div className="shrink-0 border-t border-gray-100 bg-white px-4 sm:px-6 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] grid grid-cols-2 sm:flex sm:justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setIsCreateModalOpen(false)}
                                    disabled={isSubmitting}
                                    className="h-11 px-4 rounded-xl border border-gray-300 bg-white text-gray-700 font-bold text-sm hover:bg-gray-50 disabled:opacity-50 transition-colors cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="h-11 px-5 bg-role hover:bg-role-hover text-white rounded-xl font-black text-sm disabled:opacity-60 transition-colors cursor-pointer shadow-sm"
                                >
                                    {isSubmitting ? 'Publishing…' : 'Publish Alert'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* VIEW ALERT DETAIL MODAL */}
            {selectedAlert && (
                <div className="fixed inset-0 z-[10000] flex items-stretch sm:items-center justify-center sm:p-4 bg-black/60" onClick={() => setSelectedAlert(null)}>
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="alert-details-title"
                        onClick={(e) => e.stopPropagation()}
                        className="bg-white w-full sm:max-w-2xl min-w-0 h-[100dvh] sm:h-auto sm:max-h-[90dvh] sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
                    >
                        <div className="shrink-0 px-4 sm:px-6 pt-[max(0.75rem,env(safe-area-inset-top))] sm:pt-4 pb-3 border-b border-gray-100 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="text-sm font-black text-gray-900">Alert Details</p>
                                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                                    {getTypeBadge(selectedAlert)}
                                    {getStatusBadge(selectedAlert)}
                                    <span className="text-[10px] font-bold text-gray-400">#{selectedAlert.announcement_id}</span>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedAlert(null)}
                                aria-label="Close"
                                className="w-10 h-10 -mr-1.5 -mt-1 shrink-0 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 flex items-center justify-center transition-colors cursor-pointer"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4">
                            <h2 id="alert-details-title" className="text-xl sm:text-2xl font-black text-gray-900 leading-tight break-words">{selectedAlert.title}</h2>
                            <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
                                <dt className="font-bold text-gray-400">Posted by</dt>
                                <dd className="font-semibold text-gray-700 min-w-0 break-words">{selectedAlert.posted_by}</dd>
                                <dt className="font-bold text-gray-400">Posted on</dt>
                                <dd className="font-semibold text-gray-700 min-w-0">{new Date(selectedAlert.posted_on).toLocaleDateString()}</dd>
                                <dt className="font-bold text-gray-400">Location</dt>
                                <dd className="font-semibold text-gray-700 min-w-0 break-words">📍 {selectedAlert.location || 'Jurisdiction wide'}</dd>
                                <dt className="font-bold text-gray-400">Expires</dt>
                                <dd className="font-semibold text-gray-700 min-w-0">{selectedAlert.expiration ? new Date(selectedAlert.expiration).toLocaleDateString() : 'No expiration set'}</dd>
                            </dl>
                            <p className="mt-4 pt-4 border-t border-gray-100 text-gray-700 text-sm leading-relaxed whitespace-pre-line break-words">{selectedAlert.content}</p>
                        </div>

                        <div className="shrink-0 border-t border-gray-100 bg-white px-4 sm:px-6 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] grid grid-cols-2 sm:flex sm:justify-end gap-2">
                            {isAlertActive(selectedAlert) ? (
                                <button
                                    type="button"
                                    onClick={() => handleResolveAlert(selectedAlert.announcement_id)}
                                    className="h-11 px-4 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                                >
                                    <CheckCircle2 className="w-4 h-4" />
                                    Mark as Resolved
                                </button>
                            ) : <span className="hidden sm:block" />}
                            <button
                                type="button"
                                onClick={() => setSelectedAlert(null)}
                                className={`h-11 px-5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl font-bold text-sm transition-colors cursor-pointer ${isAlertActive(selectedAlert) ? '' : 'col-span-2'}`}
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* TOAST FEEDBACK (above the bottom navigation on phones) */}
            {toast && (
                <div className="fixed bottom-24 lg:bottom-6 left-3 right-3 sm:left-auto sm:right-6 z-[10001] animate-in slide-in-from-bottom-5 duration-300">
                    <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl border ${
                        toast.type === 'success'
                            ? 'bg-emerald-900/95 text-white border-emerald-700'
                            : 'bg-rose-900/95 text-white border-rose-700'
                    }`}>
                        <span className="text-base">{toast.type === 'success' ? '✓' : '⚠️'}</span>
                        <span className="text-xs font-bold flex-1 min-w-0">{toast.message}</span>
                        <button
                            type="button"
                            onClick={() => setToast(null)}
                            aria-label="Dismiss"
                            className="w-8 h-8 -mr-1 flex items-center justify-center text-white/70 hover:text-white text-xs font-black cursor-pointer"
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
