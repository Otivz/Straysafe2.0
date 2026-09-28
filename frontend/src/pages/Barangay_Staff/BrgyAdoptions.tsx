import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../utils/api';
import BrgySidebar from '../../components/BrgySidebar';
import BrgyNavbar from '../../components/Navbars/BrgyNavbar';
import BrgyBottomNav from '../../components/Navbars/BrgyBottomNav';
import AdminSidebar from '../../components/AdminSidebar';
import AdminNavbar from '../../components/Navbars/AdminNavbar';
import { getPetPicture } from '../../utils/avatar';
import { 
    Heart, 
    Search, 
    CheckCircle2, 
    XCircle, 
    Clock, 
    Shield, 
    AlertCircle, 
    FileText, 
    X,
    ExternalLink,
    CreditCard,
    Eye,
    Sparkles,
    User,
    Phone,
    Home,
    PawPrint,
    Scale,
    MapPin
} from 'lucide-react';
import MaskedIdDisplay from '../../components/MaskedIdDisplay';

interface AdoptionApp {
    adoption_id: number;
    holding_id: number;
    applicant_id: number;
    status: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
    full_name: string;
    address: string;
    contact_no: string;
    has_other_pets: boolean;
    living_space: string;
    reason: string;
    id_type?: string | null;
    id_number?: string | null;
    id_photo_url?: string | null;
    is_handed_over?: boolean;
    handover_date?: string | null;
    staff_handed_over?: boolean;
    staff_handover_date?: string | null;
    staff_handover_name?: string | null;
    created_pet_id?: number | null;
    reviewed_by: number | null;
    reviewer_role: string | null;
    reviewer_name: string | null;
    review_notes: string | null;
    reviewed_at: string | null;
    created_at: string;
    updated_at: string;
    animal_name: string | null;
    animal_type: string | null;
    animal_breed: string | null;
    animal_photo: string | null;
    cancellation_reason?: string | null;
    cancelled_at?: string | null;
}

interface CatalogAnimal {
    holding_id: number;
    report_id: number;
    animal_name: string | null;
    animal_type: string | null;
    breed: string | null;
    color: string | null;
    estimated_size: string | null;
    facility_status: number;
    adoption_catalog_notes: string | null;
    intake_date: string | null;
    promoted_at: string | null;
    photos: string[];
    facility_name: string | null;
}

const BrgyAdoptions = () => {
    // Auth context
    const rawStaff = localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user');
    const rawAdmin = localStorage.getItem('admin_user') || sessionStorage.getItem('admin_user');
    const isAdmin = Boolean(rawAdmin);
    const staffUser = rawStaff ? JSON.parse(rawStaff) : null;
    const isHeadOfficer = isAdmin || Boolean(staffUser?.is_head_officer);

    // Navigation & state
    const [mobileOpen, setMobileOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'applications' | 'catalog'>('applications');
    const [statusFilter, setStatusFilter] = useState<'All' | 'Pending' | 'Approved' | 'Rejected' | 'Cancelled'>('Pending');
    const [searchQuery, setSearchQuery] = useState('');

    // Data
    const [applications, setApplications] = useState<AdoptionApp[]>([]);
    const [catalogAnimals, setCatalogAnimals] = useState<CatalogAnimal[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);

    // Modal state
    const [selectedApp, setSelectedApp] = useState<AdoptionApp | null>(null);
    const [viewAppModal, setViewAppModal] = useState<AdoptionApp | null>(null);
    const [reviewModalType, setReviewModalType] = useState<'approve' | 'reject' | null>(null);
    const [reviewNotes, setReviewNotes] = useState('');
    const [handoverModalApp, setHandoverModalApp] = useState<AdoptionApp | null>(null);
    const [handoverNotes, setHandoverNotes] = useState('');
    const [previewIdPhotoUrl, setPreviewIdPhotoUrl] = useState<string | null>(null);
    const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    const showToast = (text: string, type: 'success' | 'error' = 'success') => {
        setToastMessage({ text, type });
        setTimeout(() => setToastMessage(null), 4000);
    };

    const fetchApplications = async () => {
        setLoading(true);
        try {
            const res = await api.get('/adoptions/applications');
            setApplications(Array.isArray(res.data) ? res.data : []);
        } catch (err: any) {
            console.error("Failed to load adoption applications", err);
            showToast("Failed to load adoption applications.", "error");
        } finally {
            setLoading(false);
        }
    };

    const fetchCatalog = async () => {
        try {
            const res = await api.get('/adoptions/catalog');
            setCatalogAnimals(Array.isArray(res.data) ? res.data : []);
        } catch (err: any) {
            console.error("Failed to load adoption catalog", err);
        }
    };

    const [quickImpoundAnimal, setQuickImpoundAnimal] = useState<CatalogAnimal | null>(null);
    const [isQuickImpounding, setIsQuickImpounding] = useState(false);

    const handleConfirmImpound = async () => {
        if (!quickImpoundAnimal) return;
        setIsQuickImpounding(true);
        try {
            await api.patch(`/holding/${quickImpoundAnimal.holding_id}`, {
                facility_status: 8, // Impounded
                updated_by: staffUser?.user_id,
                update_notes: `Animal officially impounded from Adoption Catalog by Barangay Officer.`,
            });
            setQuickImpoundAnimal(null);
            await fetchCatalog();
            await fetchApplications();
        } catch (err: any) {
            console.error('Failed to impound animal:', err);
            const errMsg = err?.response?.data?.detail || err?.message || 'Failed to impound animal';
            alert(`Impoundment failed: ${errMsg}`);
        } finally {
            setIsQuickImpounding(false);
        }
    };

    useEffect(() => {
        fetchApplications();
        fetchCatalog();
    }, []);

    const filteredApplications = useMemo(() => {
        return applications.filter((app) => {
            if (statusFilter !== 'All' && app.status !== statusFilter) return false;
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const matchApplicant = app.full_name.toLowerCase().includes(q);
                const matchPet = app.animal_name?.toLowerCase().includes(q) || false;
                const matchAddress = app.address.toLowerCase().includes(q);
                if (!matchApplicant && !matchPet && !matchAddress) return false;
            }
            return true;
        });
    }, [applications, statusFilter, searchQuery]);

    const handleOpenReviewModal = (app: AdoptionApp, type: 'approve' | 'reject') => {
        setSelectedApp(app);
        setReviewModalType(type);
        setReviewNotes('');
    };

    const handleSubmitReview = async () => {
        if (!selectedApp || !reviewModalType) return;
        setActionLoading(true);

        const decision = reviewModalType === 'approve' ? 'Approved' : 'Rejected';

        try {
            await api.put(`/adoptions/review/${selectedApp.adoption_id}`, {
                decision,
                review_notes: reviewNotes.trim() || undefined,
            });

            showToast(`Adoption application successfully marked as ${decision}!`);
            setReviewModalType(null);
            setSelectedApp(null);
            fetchApplications();
            fetchCatalog();
        } catch (err: any) {
            console.error("Review application error", err);
            showToast(err.response?.data?.detail || "Failed to process review decision.", "error");
        } finally {
            setActionLoading(false);
        }
    };

    const handleStaffConfirmHandover = async () => {
        if (!handoverModalApp) return;
        setActionLoading(true);
        try {
            const res = await api.post(`/adoptions/${handoverModalApp.adoption_id}/staff-confirm-handover`, {
                notes: handoverNotes.trim() || undefined,
            });
            showToast(res.data?.message || "Pet handover officially confirmed by Barangay Staff!");
            setHandoverModalApp(null);
            setHandoverNotes('');
            fetchApplications();
            fetchCatalog();
        } catch (err: any) {
            console.error("Staff confirm handover error", err);
            showToast(err.response?.data?.detail || "Failed to confirm pet handover.", "error");
        } finally {
            setActionLoading(false);
        }
    };

    const totalAppsCount = applications.length;
    const pendingCount = applications.filter((a) => a.status === 'Pending').length;
    const approvedCount = applications.filter((a) => a.status === 'Approved').length;
    const catalogCount = catalogAnimals.length;

    return (
        <div className="flex h-screen bg-[#FBFBF9] text-[#1E293B] font-sans overflow-hidden">
            {/* Sidebar */}
            {isAdmin ? (
                <AdminSidebar />
            ) : (
                <BrgySidebar isMobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />
            )}

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
                {isAdmin ? (
                    <AdminNavbar 
                        leftContent={
                            <div className="flex flex-col">
                                <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none uppercase">Adoption Management</h1>
                                <p className="text-[9px] text-gray-400 font-extrabold uppercase tracking-wider mt-1.5 leading-none">
                                    Centralized Barangay management for public adoption applications and adoptable animal records
                                </p>
                            </div>
                        }
                    />
                ) : (
                    <BrgyNavbar 
                        onMenuToggle={() => setMobileOpen(!mobileOpen)} 
                        leftContent={
                            <div className="flex flex-col">
                                <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none uppercase">Adoption Management</h1>
                                <p className="text-[9px] text-gray-400 font-extrabold uppercase tracking-wider mt-1.5 leading-none">
                                    Centralized Barangay management for public adoption applications and adoptable animal records
                                </p>
                            </div>
                        }
                    />
                )}

                <main className="p-4 sm:p-8 pb-32 lg:pb-8 max-w-7xl w-full mx-auto space-y-6">
                    {/* Page Header */}
                    {/* Mobile Header with Rich Design & Animation (md:hidden) */}
                    <div className="block md:hidden">
                        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#FF6B2B] via-[#F97316] to-[#FB923C] p-4 sm:p-5 text-white shadow-lg shadow-orange-500/20 border border-orange-400/40">
                            {/* Animated glowing backdrop orbs & paw watermarks */}
                            <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/20 blur-xl animate-pulse pointer-events-none" />
                            <div className="absolute -bottom-10 -left-10 w-36 h-36 rounded-full bg-amber-300/25 blur-2xl pointer-events-none" />
                            <div className="absolute top-3 right-4 select-none pointer-events-none text-2xl opacity-20 animate-bounce">
                                🐾
                            </div>

                            <div className="relative z-10 flex flex-col gap-3.5">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/35 shadow-inner shrink-0">
                                            <Heart className="w-6 h-6 text-white fill-white animate-pulse" />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white/20 backdrop-blur-md text-[9px] font-black uppercase tracking-wider text-white border border-white/30 mb-0.5 shadow-2xs">
                                                <Sparkles className="w-2.5 h-2.5 text-amber-200" /> Adoption Portal
                                            </div>
                                            <h1 className="text-lg font-black tracking-tight leading-none text-white truncate">
                                                Adoption Management
                                            </h1>
                                        </div>
                                    </div>
                                </div>

                                {/* Top Stats Grid in Mobile Header with glassmorphism */}
                                <div className="grid grid-cols-2 gap-2.5 pt-0.5">
                                    <div className="bg-white/15 hover:bg-white/20 backdrop-blur-md p-2.5 rounded-2xl border border-white/30 flex items-center gap-2.5 shadow-2xs transition-transform active:scale-95">
                                        <div className="w-2.5 h-2.5 rounded-full bg-amber-300 animate-ping shrink-0" />
                                        <div className="min-w-0">
                                            <div className="text-[10px] font-extrabold text-orange-100 uppercase tracking-wider truncate">Pending Review</div>
                                            <div className="text-base sm:text-lg font-black text-white leading-tight">{pendingCount}</div>
                                        </div>
                                    </div>
                                    <div className="bg-white/15 hover:bg-white/20 backdrop-blur-md p-2.5 rounded-2xl border border-white/30 flex items-center gap-2.5 shadow-2xs transition-transform active:scale-95">
                                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-300 shrink-0" />
                                        <div className="min-w-0">
                                            <div className="text-[10px] font-extrabold text-orange-100 uppercase tracking-wider truncate">In Catalog</div>
                                            <div className="text-base sm:text-lg font-black text-white leading-tight">{catalogAnimals.length}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ─── DESKTOP KPI STATS ROW (hidden md:grid) ─── */}
                    <div className="hidden md:grid grid-cols-2 lg:grid-cols-4 gap-4">
                        {/* Card 1: Total Applications */}
                        <div 
                            onClick={() => { setActiveTab('applications'); setStatusFilter('All'); }}
                            className={`bg-white rounded-3xl p-5 border transition-all duration-300 cursor-pointer relative overflow-hidden flex flex-col justify-between min-h-[145px] hover:-translate-y-1 ${
                                activeTab === 'applications' && statusFilter === 'All'
                                    ? 'border-blue-400 ring-2 ring-blue-100 shadow-md'
                                    : 'border-slate-200/80 hover:border-blue-200 shadow-xs hover:shadow-sm'
                            }`}
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div>
                                    <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                                        Total Applications
                                    </h3>
                                    <p className="text-[11px] text-slate-400 font-medium mt-0.5">Submitted by residents</p>
                                </div>
                                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-100 text-blue-600 flex items-center justify-center shrink-0 border border-blue-200/60 shadow-2xs">
                                    <FileText className="w-5 h-5" />
                                </div>
                            </div>
                            <div className="mt-3">
                                <p className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight leading-none">
                                    {totalAppsCount}
                                </p>
                                <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center gap-1.5 text-[11px] font-bold text-blue-600">
                                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-100 text-blue-700 text-[9px] shrink-0 font-black">✓</span>
                                    <span>All-time submissions</span>
                                </div>
                            </div>
                        </div>

                        {/* Card 2: Pending Review */}
                        <div 
                            onClick={() => { setActiveTab('applications'); setStatusFilter('Pending'); }}
                            className={`bg-white rounded-3xl p-5 border transition-all duration-300 cursor-pointer relative overflow-hidden flex flex-col justify-between min-h-[145px] hover:-translate-y-1 ${
                                activeTab === 'applications' && statusFilter === 'Pending'
                                    ? 'border-amber-400 ring-2 ring-amber-100 shadow-md'
                                    : 'border-slate-200/80 hover:border-amber-200 shadow-xs hover:shadow-sm'
                            }`}
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div>
                                    <div className="flex items-center gap-1.5">
                                        {pendingCount > 0 && (
                                            <span className="relative flex h-2 w-2">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                                            </span>
                                        )}
                                        <h3 className="text-xs font-black text-amber-700 uppercase tracking-wider">
                                            Pending Review
                                        </h3>
                                    </div>
                                    <p className="text-[11px] text-slate-400 font-medium mt-0.5">Awaiting staff decision</p>
                                </div>
                                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-100 text-amber-600 flex items-center justify-center shrink-0 border border-amber-200/60 shadow-2xs">
                                    <Clock className="w-5 h-5" />
                                </div>
                            </div>
                            <div className="mt-3">
                                <p className="text-3xl sm:text-4xl font-black text-amber-700 tracking-tight leading-none">
                                    {pendingCount}
                                </p>
                                <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center gap-1.5 text-[11px] font-bold text-amber-600">
                                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-100 text-amber-700 text-[9px] shrink-0 font-black">!</span>
                                    <span>Requires verification</span>
                                </div>
                            </div>
                        </div>

                        {/* Card 3: Approved Adoptions */}
                        <div 
                            onClick={() => { setActiveTab('applications'); setStatusFilter('Approved'); }}
                            className={`bg-white rounded-3xl p-5 border transition-all duration-300 cursor-pointer relative overflow-hidden flex flex-col justify-between min-h-[145px] hover:-translate-y-1 ${
                                activeTab === 'applications' && statusFilter === 'Approved'
                                    ? 'border-emerald-400 ring-2 ring-emerald-100 shadow-md'
                                    : 'border-slate-200/80 hover:border-emerald-200 shadow-xs hover:shadow-sm'
                            }`}
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div>
                                    <h3 className="text-xs font-black text-emerald-700 uppercase tracking-wider">
                                        Approved Adoptions
                                    </h3>
                                    <p className="text-[11px] text-slate-400 font-medium mt-0.5">Successful matches</p>
                                </div>
                                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-100 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-200/60 shadow-2xs">
                                    <CheckCircle2 className="w-5 h-5" />
                                </div>
                            </div>
                            <div className="mt-3">
                                <p className="text-3xl sm:text-4xl font-black text-emerald-700 tracking-tight leading-none">
                                    {approvedCount}
                                </p>
                                <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center gap-1.5 text-[11px] font-bold text-emerald-600">
                                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 text-[9px] shrink-0 font-black">✓</span>
                                    <span>Approved & claimed</span>
                                </div>
                            </div>
                        </div>

                        {/* Card 4: In Catalog */}
                        <div 
                            onClick={() => setActiveTab('catalog')}
                            className={`bg-white rounded-3xl p-5 border transition-all duration-300 cursor-pointer relative overflow-hidden flex flex-col justify-between min-h-[145px] hover:-translate-y-1 ${
                                activeTab === 'catalog'
                                    ? 'border-rose-400 ring-2 ring-rose-100 shadow-md'
                                    : 'border-slate-200/80 hover:border-rose-200 shadow-xs hover:shadow-sm'
                            }`}
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div>
                                    <h3 className="text-xs font-black text-rose-600 uppercase tracking-wider">
                                        In Public Catalog
                                    </h3>
                                    <p className="text-[11px] text-slate-400 font-medium mt-0.5">Adoptable animals</p>
                                </div>
                                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-rose-50 to-pink-100 text-rose-500 flex items-center justify-center shrink-0 border border-rose-200/60 shadow-2xs">
                                    <Heart className="w-5 h-5 fill-rose-500/20" />
                                </div>
                            </div>
                            <div className="mt-3">
                                <p className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight leading-none">
                                    {catalogCount}
                                </p>
                                <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center gap-1.5 text-[11px] font-bold text-rose-600">
                                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-rose-100 text-rose-700 text-[9px] shrink-0 font-black">♥</span>
                                    <span>Ready for homes</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Role Notice for non-Head Officer */}
                    {!isHeadOfficer && (
                        <div className="bg-blue-50/90 border border-blue-200/90 rounded-2xl p-3.5 sm:p-4 flex items-start gap-3 shadow-2xs">
                            <div className="p-1.5 rounded-xl bg-blue-100 text-blue-700 shrink-0">
                                <Shield className="w-4 h-4" />
                            </div>
                            <div className="text-xs text-blue-900 leading-relaxed">
                                <span className="font-extrabold">Staff View Mode:</span> You are currently viewing applications as regular Barangay Staff. You can inspect applicant details and custody trails. Official approval and rejection actions are legally restricted to the <strong>Barangay Head Officer</strong> or <strong>System Administrator</strong>.
                            </div>
                        </div>
                    )}

                    {/* Toast Notification */}
                    {toastMessage && (
                        <div
                            className={`p-4 rounded-2xl border text-xs sm:text-sm font-bold shadow-sm flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-200 ${
                                toastMessage.type === 'success'
                                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                    : 'bg-red-50 border-red-200 text-red-800'
                            }`}
                        >
                            {toastMessage.type === 'success' ? (
                                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                            ) : (
                                <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
                            )}
                            <span className="flex-1">{toastMessage.text}</span>
                        </div>
                    )}

                    {/* Primary Tab Navigation */}
                    <div className="flex items-center gap-1.5 sm:gap-2 p-1 bg-gray-100/90 rounded-2xl border border-gray-200/60 sm:bg-transparent sm:p-0 sm:border-0 sm:border-b sm:border-gray-200 sm:pb-2 sm:rounded-none">
                        <button
                            onClick={() => setActiveTab('applications')}
                            className={`flex-1 sm:flex-initial px-3 sm:px-5 py-2 sm:py-2.5 text-xs font-black rounded-xl transition-all flex items-center justify-center gap-2 ${
                                activeTab === 'applications'
                                    ? 'bg-gray-900 text-white shadow-xs'
                                    : 'bg-transparent sm:bg-white text-gray-600 hover:bg-white/80 sm:hover:bg-gray-100 sm:border sm:border-gray-200'
                            }`}
                        >
                            <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                            <span className="truncate">Applications ({applications.length})</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('catalog')}
                            className={`flex-1 sm:flex-initial px-3 sm:px-5 py-2 sm:py-2.5 text-xs font-black rounded-xl transition-all flex items-center justify-center gap-2 ${
                                activeTab === 'catalog'
                                    ? 'bg-gray-900 text-white shadow-xs'
                                    : 'bg-transparent sm:bg-white text-gray-600 hover:bg-white/80 sm:hover:bg-gray-100 sm:border sm:border-gray-200'
                            }`}
                        >
                            <Heart className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-orange-500 shrink-0" />
                            <span className="truncate">Catalog Animals ({catalogAnimals.length})</span>
                        </button>
                    </div>

                    {/* Applications Tab Content */}
                    {activeTab === 'applications' && (
                        <div className="space-y-4">
                            {/* Controls Bar */}
                            <div className="bg-white rounded-2xl p-3 sm:p-4 border border-gray-200/90 shadow-2xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
                                    {(['All', 'Pending', 'Approved', 'Rejected', 'Cancelled'] as const).map((tab) => (
                                        <button
                                            key={tab}
                                            onClick={() => setStatusFilter(tab)}
                                            className={`px-3 sm:px-3.5 py-1.5 text-xs font-extrabold rounded-xl transition-all shrink-0 cursor-pointer ${
                                                statusFilter === tab
                                                    ? 'bg-orange-500 text-white shadow-2xs'
                                                    : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200/70'
                                            }`}
                                        >
                                            {tab === 'All' ? 'All' : tab}
                                            {tab === 'Pending' && pendingCount > 0 && (
                                                <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-white/30 text-white text-[10px] font-bold">
                                                    {pendingCount}
                                                </span>
                                            )}
                                        </button>
                                    ))}
                                </div>

                                <div className="relative w-full sm:w-64">
                                    <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder="Search applicant or pet..."
                                        className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl border border-gray-200 focus:border-orange-500 focus:outline-hidden bg-gray-50/80 focus:bg-white transition-colors"
                                    />
                                </div>
                            </div>

                            {/* Applications Table / Cards */}
                            {loading ? (
                                <div className="space-y-3">
                                    {[1, 2, 3].map((i) => (
                                        <div key={i} className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-6 border border-gray-200 animate-pulse h-36" />
                                    ))}
                                </div>
                            ) : filteredApplications.length === 0 ? (
                                <div className="bg-white rounded-2xl sm:rounded-3xl p-8 sm:p-12 border border-dashed border-gray-300 text-center max-w-lg mx-auto shadow-2xs">
                                    <div className="w-12 h-12 rounded-2xl bg-gray-100 text-gray-400 flex items-center justify-center mx-auto mb-3">
                                        <FileText className="w-6 h-6" />
                                    </div>
                                    <h3 className="font-black text-gray-900 text-base mb-1">No Applications Match</h3>
                                    <p className="text-xs text-gray-500 max-w-xs mx-auto">
                                        There are currently no adoption applications matching your selected status filter or search query.
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {filteredApplications.map((app) => (
                                        <div
                                            key={app.adoption_id}
                                            className="bg-white rounded-3xl border border-gray-200/90 hover:border-gray-300 p-4 sm:p-6 shadow-xs hover:shadow-md transition-all space-y-4"
                                        >
                                            {/* ─── CARD HEADER: Pet Info + Status + Top Actions ─── */}
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-gray-100">
                                                <div className="flex items-center gap-3.5 min-w-0">
                                                    <img
                                                        src={getPetPicture(app.animal_photo)}
                                                        alt={app.animal_name || 'Pet'}
                                                        className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl object-cover border border-gray-100 shrink-0 shadow-2xs"
                                                    />
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2 flex-wrap mb-1">
                                                            <h3 className="font-black text-base sm:text-lg text-gray-900 truncate">
                                                                {app.animal_name || `Rescue Animal #${app.holding_id}`}
                                                            </h3>
                                                            <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-orange-50 text-orange-700 font-bold border border-orange-200/80">
                                                                {app.animal_type || 'Rescue'} {app.animal_breed ? `• ${app.animal_breed}` : ''}
                                                            </span>
                                                            <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md">
                                                                App #{app.adoption_id}
                                                            </span>
                                                        </div>
                                                        <p className="text-[11px] text-gray-400 font-medium flex items-center gap-1">
                                                            <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                                            <span>Submitted on {new Date(app.created_at).toLocaleDateString(undefined, {
                                                                year: 'numeric',
                                                                month: 'short',
                                                                day: 'numeric',
                                                                hour: '2-digit',
                                                                minute: '2-digit'
                                                            })}</span>
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* Status Badge & Actions */}
                                                <div className="flex items-center gap-2 flex-wrap sm:justify-end shrink-0 pt-1 sm:pt-0">
                                                    {app.status === 'Approved' && (
                                                        app.staff_handed_over && app.is_handed_over ? (
                                                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-black border border-emerald-300 shadow-2xs">
                                                                <Sparkles className="w-3.5 h-3.5 text-emerald-600" /> Officially Adopted
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-black border border-emerald-200">
                                                                <CheckCircle2 className="w-3.5 h-3.5" /> Approved
                                                            </span>
                                                        )
                                                    )}
                                                    {app.status === 'Rejected' && (
                                                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-50 text-red-700 text-xs font-black border border-red-200">
                                                            <XCircle className="w-3.5 h-3.5" /> Rejected
                                                        </span>
                                                    )}
                                                    {app.status === 'Cancelled' && (
                                                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-100 text-gray-700 text-xs font-black border border-gray-300 shadow-2xs">
                                                            <XCircle className="w-3.5 h-3.5 text-gray-500" /> Cancelled
                                                        </span>
                                                    )}
                                                    {app.status === 'Pending' && (
                                                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 text-xs font-black border border-amber-200">
                                                            <Clock className="w-3.5 h-3.5" /> Pending Review
                                                        </span>
                                                    )}

                                                    <button
                                                        type="button"
                                                        onClick={() => setViewAppModal(app)}
                                                        className="px-3 py-1.5 bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 rounded-xl text-xs font-black transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
                                                        title="View full resident application and review history"
                                                    >
                                                        <Eye className="w-3.5 h-3.5 text-orange-600" />
                                                        <span>Full Details</span>
                                                    </button>

                                                    <Link
                                                        to={`/adopt/journey/${app.holding_id}`}
                                                        className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-black transition-colors flex items-center gap-1.5 shadow-2xs"
                                                        title="View Journey Trail"
                                                    >
                                                        <ExternalLink className="w-3.5 h-3.5 text-orange-500" />
                                                        <span className="hidden sm:inline">Journey Trail</span>
                                                    </Link>

                                                    {app.status === 'Pending' && isHeadOfficer && (
                                                        <div className="flex items-center gap-1.5">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleOpenReviewModal(app, 'approve')}
                                                                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-all shadow-xs cursor-pointer active:scale-95 flex items-center gap-1"
                                                            >
                                                                <CheckCircle2 className="w-3.5 h-3.5" />
                                                                <span>Approve</span>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleOpenReviewModal(app, 'reject')}
                                                                className="px-3.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-xs font-black transition-all border border-red-200 cursor-pointer active:scale-95 flex items-center gap-1"
                                                            >
                                                                <XCircle className="w-3.5 h-3.5" />
                                                                <span>Reject</span>
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* ─── APPLICANT PROFILE & CONTACT DETAILS (Clean Grid) ─── */}
                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                                                <div className="bg-gray-50/90 rounded-2xl p-3 border border-gray-100/90 flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-xl bg-orange-100/80 text-orange-600 flex items-center justify-center shrink-0">
                                                        <User className="w-4 h-4" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Applicant Name</div>
                                                        <div className="text-xs font-extrabold text-gray-900 truncate" title={app.full_name}>
                                                            {app.full_name}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="bg-gray-50/90 rounded-2xl p-3 border border-gray-100/90 flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-xl bg-blue-100/80 text-blue-600 flex items-center justify-center shrink-0">
                                                        <Phone className="w-4 h-4" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Contact Number</div>
                                                        <div className="text-xs font-extrabold text-gray-900 truncate">
                                                            {app.contact_no}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="bg-gray-50/90 rounded-2xl p-3 border border-gray-100/90 flex items-center gap-3 sm:col-span-2 lg:col-span-1">
                                                    <div className="w-8 h-8 rounded-xl bg-rose-100/80 text-rose-600 flex items-center justify-center shrink-0">
                                                        <MapPin className="w-4 h-4" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Residential Address</div>
                                                        <div className="text-xs font-extrabold text-gray-900 truncate" title={app.address || 'No address specified'}>
                                                            {app.address || '—'}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="bg-gray-50/90 rounded-2xl p-3 border border-gray-100/90 flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-xl bg-emerald-100/80 text-emerald-600 flex items-center justify-center shrink-0">
                                                        <Home className="w-4 h-4" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Living Space</div>
                                                        <div className="text-xs font-extrabold text-gray-900 truncate" title={app.living_space}>
                                                            {app.living_space}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="bg-gray-50/90 rounded-2xl p-3 border border-gray-100/90 flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-xl bg-purple-100/80 text-purple-600 flex items-center justify-center shrink-0">
                                                        <PawPrint className="w-4 h-4" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Other Pets in Home</div>
                                                        <div className="text-xs font-extrabold text-gray-900">
                                                            {app.has_other_pets ? 'Yes (Has pets)' : 'No other pets'}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* ─── GOVERNMENT ID ROW ─── */}
                                            {app.id_type && (
                                                <div className="bg-slate-50/90 rounded-2xl p-3 border border-slate-200/80 flex items-center justify-between flex-wrap gap-2 text-xs">
                                                    <div className="flex items-center gap-2.5 min-w-0">
                                                        <div className="w-7 h-7 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center shrink-0">
                                                            <CreditCard className="w-4 h-4" />
                                                        </div>
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className="font-bold text-gray-900">Government ID:</span>
                                                            <span className="font-extrabold text-gray-800">{app.id_type}</span>
                                                            {app.id_number && (
                                                                <MaskedIdDisplay idNumber={app.id_number} idType={app.id_type} />
                                                            )}
                                                        </div>
                                                    </div>
                                                    {app.id_photo_url && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setPreviewIdPhotoUrl(app.id_photo_url || null)}
                                                            className="text-xs font-black text-orange-600 hover:text-orange-700 inline-flex items-center gap-1.5 cursor-pointer bg-white px-3 py-1.5 rounded-xl border border-orange-200/90 shadow-2xs hover:bg-orange-50 transition-colors"
                                                        >
                                                            <Eye className="w-3.5 h-3.5" />
                                                            <span>View ID Photo</span>
                                                        </button>
                                                    )}
                                                </div>
                                            )}

                                            {/* ─── APPLICANT'S STATED MOTIVATION & REASON (Scrollable Container) ─── */}
                                            {app.reason && (
                                                <div className="bg-amber-50/40 rounded-2xl p-3.5 sm:p-4 border border-amber-200/70 text-xs space-y-1.5">
                                                    <div className="flex items-center justify-between gap-2 text-amber-950 font-bold">
                                                        <span className="flex items-center gap-1.5">
                                                            <FileText className="w-4 h-4 text-amber-600 shrink-0" />
                                                            Applicant's Stated Motivation & Reason:
                                                        </span>
                                                        <span className="text-[10px] text-amber-700/70 font-semibold">
                                                            Scrollable message view
                                                        </span>
                                                    </div>
                                                    <div className="max-h-28 sm:max-h-36 overflow-y-auto pr-2 text-xs text-gray-700 leading-relaxed whitespace-pre-wrap break-words bg-white/90 p-3 rounded-xl border border-amber-100 shadow-2xs font-medium">
                                                        "{app.reason}"
                                                    </div>
                                                </div>
                                            )}

                                            {/* ─── CANCELLED DETAILS BANNER ─── */}
                                            {app.status === 'Cancelled' && (
                                                <div className="p-3.5 rounded-2xl bg-gray-50 border border-gray-200 text-xs space-y-1.5">
                                                    <div className="flex items-center justify-between flex-wrap gap-2 text-gray-700 font-bold">
                                                        <span className="flex items-center gap-1.5 text-gray-800">
                                                            <XCircle className="w-4 h-4 text-gray-500" /> Cancelled by Applicant
                                                        </span>
                                                        {app.cancelled_at && (
                                                            <span className="text-[11px] text-gray-500 font-normal">
                                                                Cancelled on {new Date(app.cancelled_at).toLocaleDateString(undefined, {
                                                                    year: 'numeric',
                                                                    month: 'short',
                                                                    day: 'numeric',
                                                                    hour: '2-digit',
                                                                    minute: '2-digit'
                                                                })}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {app.cancellation_reason && (
                                                        <div className="text-xs text-gray-600 bg-white p-3 rounded-xl border border-gray-200/80">
                                                            <span className="font-bold text-gray-700 block mb-0.5">Cancellation Reason:</span>
                                                            <p className="whitespace-pre-wrap break-words leading-relaxed">{app.cancellation_reason}</p>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* ─── TWO-WAY HANDOVER STATUS BOX (Approved Applications) ─── */}
                                            {app.status === 'Approved' && (
                                                <div className="p-3.5 sm:p-4 rounded-2xl bg-amber-50/90 border border-amber-200 text-xs space-y-2.5">
                                                    <div className="flex items-center justify-between flex-wrap gap-2 font-black text-amber-950">
                                                        <span className="flex items-center gap-1.5">
                                                            <Shield className="w-4 h-4 text-amber-600 shrink-0" />
                                                            Handover & Claiming Status:
                                                        </span>
                                                        {app.staff_handed_over && app.is_handed_over ? (
                                                            <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-black border border-emerald-300 flex items-center gap-1 text-[11px]">
                                                                <Sparkles className="w-3 h-3 text-emerald-600" /> Completed & Registered
                                                            </span>
                                                        ) : (
                                                            <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 font-bold border border-amber-300 text-[11px]">
                                                                Awaiting Physical Claiming
                                                            </span>
                                                        )}
                                                    </div>

                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] bg-white/90 p-2.5 rounded-xl border border-amber-100 shadow-2xs">
                                                        <div>
                                                            <span className="text-gray-500 font-semibold block">1. Barangay Staff Release:</span>
                                                            {app.staff_handed_over ? (
                                                                <span className="font-black text-emerald-700 flex items-center gap-1 mt-0.5">
                                                                    <CheckCircle2 className="w-3.5 h-3.5" /> Handed Over ({app.staff_handover_name || 'Staff'})
                                                                </span>
                                                            ) : (
                                                                <span className="font-bold text-amber-700 flex items-center gap-1 mt-0.5">
                                                                    <Clock className="w-3.5 h-3.5" /> Pending Physical Release
                                                                </span>
                                                            )}
                                                        </div>

                                                        <div>
                                                            <span className="text-gray-500 font-semibold block">2. Adopter Receipt:</span>
                                                            {app.is_handed_over ? (
                                                                <span className="font-black text-emerald-700 flex items-center gap-1 mt-0.5">
                                                                    <CheckCircle2 className="w-3.5 h-3.5" /> Confirmed by Adopter
                                                                </span>
                                                            ) : (
                                                                <span className="font-bold text-amber-700 flex items-center gap-1 mt-0.5">
                                                                    <Clock className="w-3.5 h-3.5" /> Pending Adopter Receipt
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {!app.staff_handed_over && (
                                                        <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
                                                            <span className="text-[11px] text-gray-500">
                                                                Verify applicant identity before releasing pet.
                                                            </span>
                                                            <button
                                                                type="button"
                                                                onClick={() => setHandoverModalApp(app)}
                                                                className="w-full sm:w-auto px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                                                            >
                                                                <CheckCircle2 className="w-3.5 h-3.5" />
                                                                <span>Confirm Pet Handed Over</span>
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* ─── BARANGAY REVIEW REMARKS (if reviewed) ─── */}
                                            {app.review_notes && (
                                                <div className="p-3.5 rounded-2xl bg-orange-50/60 border border-orange-200/80 text-xs text-orange-950 space-y-1">
                                                    <span className="font-bold text-orange-900 flex items-center gap-1.5">
                                                        <Shield className="w-3.5 h-3.5 text-orange-600" />
                                                        Barangay Review Remarks ({app.reviewer_name || 'Officer'}):
                                                    </span>
                                                    <p className="whitespace-pre-wrap break-words text-orange-900/90 leading-relaxed bg-white/80 p-2.5 rounded-xl border border-orange-100">
                                                        {app.review_notes}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Catalog Tab Content */}
                    {activeTab === 'catalog' && (
                        <div className="space-y-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white p-3.5 rounded-2xl border border-gray-200/90 shadow-2xs">
                                <p className="text-xs font-bold text-gray-600">
                                    Rescued animals currently listed in the public Adoption Catalog ({catalogAnimals.length})
                                </p>
                                <Link
                                    to="/adopt"
                                    target="_blank"
                                    className="text-xs text-orange-600 font-black hover:underline flex items-center gap-1"
                                >
                                    Open Public View <ExternalLink className="w-3.5 h-3.5" />
                                </Link>
                            </div>

                            {catalogAnimals.length === 0 ? (
                                <div className="bg-white rounded-2xl sm:rounded-3xl p-8 sm:p-12 border border-dashed border-gray-300 text-center max-w-lg mx-auto shadow-2xs">
                                    <div className="w-12 h-12 rounded-2xl bg-orange-50 text-orange-500 flex items-center justify-center mx-auto mb-3">
                                        <Heart className="w-6 h-6" />
                                    </div>
                                    <h3 className="font-black text-gray-900 text-base mb-1">No Animals in Catalog</h3>
                                    <p className="text-xs text-gray-500 max-w-xs mx-auto">
                                        Animals can be promoted to the catalog from the Holding Facility page after their 7-day impound period elapses.
                                    </p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                                    {catalogAnimals.map((animal) => (
                                        <div
                                            key={animal.holding_id}
                                            className="bg-white rounded-2xl sm:rounded-3xl border border-gray-200/90 overflow-hidden shadow-2xs hover:shadow-sm transition-all flex flex-col"
                                        >
                                            <div className="relative w-full h-44 sm:h-48 bg-gray-100">
                                                <img
                                                    src={getPetPicture(animal.photos?.[0])}
                                                    alt={animal.animal_name || 'Pet'}
                                                    className="w-full h-full object-cover"
                                                />
                                                <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md text-white font-black text-[10px] uppercase tracking-wider">
                                                    {animal.animal_type || 'Rescue'}
                                                </span>
                                            </div>

                                            <div className="p-4 flex-1 flex flex-col justify-between">
                                                <div>
                                                    <h3 className="font-black text-base text-gray-900 mb-1">
                                                        {animal.animal_name || `Rescue #${animal.holding_id}`}
                                                    </h3>
                                                    <p className="text-xs text-gray-500 mb-2">
                                                        {animal.breed || 'Mixed'} • {animal.color || 'Natural'}
                                                    </p>
                                                    {animal.adoption_catalog_notes && (
                                                        <p className="text-xs text-gray-600 line-clamp-2 bg-gray-50 p-2.5 rounded-xl border border-gray-100 italic mb-3">
                                                            "{animal.adoption_catalog_notes}"
                                                        </p>
                                                    )}
                                                </div>

                                                <div className="pt-3 border-t border-gray-100 flex items-center justify-between gap-2 flex-wrap">
                                                    <span className="text-[11px] font-bold text-gray-400">
                                                        Promoted: {animal.promoted_at ? new Date(animal.promoted_at).toLocaleDateString() : 'Active'}
                                                    </span>
                                                    <div className="flex items-center gap-2">
                                                        <Link
                                                            to={`/adopt/journey/${animal.holding_id}`}
                                                            target="_blank"
                                                            className="text-xs text-orange-600 font-black hover:underline flex items-center gap-1"
                                                        >
                                                            Journey Map <ExternalLink className="w-3 h-3" />
                                                        </Link>
                                                        <button
                                                            type="button"
                                                            onClick={() => setQuickImpoundAnimal(animal)}
                                                            className="px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-black rounded-xl transition-all shadow-xs flex items-center gap-1 cursor-pointer"
                                                            title="If no citizen has adopted this pet, officially record its impoundment"
                                                        >
                                                            <Scale className="w-3 h-3" />
                                                            <span>Impound</span>
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </main>
                {!isAdmin && <BrgyBottomNav />}
            </div>

            {/* Review Decision Modal */}
            {reviewModalType && selectedApp && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3.5 sm:p-4">
                    <div className="bg-white rounded-2xl sm:rounded-3xl max-w-lg w-full p-5 sm:p-8 shadow-2xl border border-gray-100 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2.5">
                                {reviewModalType === 'approve' ? (
                                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-2xs">
                                        <CheckCircle2 className="w-5 h-5" />
                                    </div>
                                ) : (
                                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-red-100 text-red-700 flex items-center justify-center shadow-2xs">
                                        <XCircle className="w-5 h-5" />
                                    </div>
                                )}
                                <h2 className="text-base sm:text-lg font-black text-gray-900">
                                    {reviewModalType === 'approve' ? 'Approve Adoption' : 'Reject Adoption Application'}
                                </h2>
                            </div>
                            <button
                                onClick={() => setReviewModalType(null)}
                                className="p-1.5 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <p className="text-xs text-gray-600 mb-4 leading-relaxed">
                            {reviewModalType === 'approve' ? (
                                <>
                                    You are approving <strong>{selectedApp.full_name}</strong> to adopt{' '}
                                    <strong>{selectedApp.animal_name || `Rescue #${selectedApp.holding_id}`}</strong>. The animal will be reserved exclusively for this applicant awaiting physical claiming and two-way handover confirmation.
                                </>
                            ) : (
                                <>
                                    You are rejecting the adoption application submitted by{' '}
                                    <strong>{selectedApp.full_name}</strong>.
                                </>
                            )}
                        </p>

                        <div className="mb-5 sm:mb-6">
                            <label className="block text-xs font-bold text-gray-700 mb-1.5">
                                {reviewModalType === 'approve' ? 'Pickup Instructions / Official Notes' : 'Rejection Reason'}
                            </label>
                            <textarea
                                rows={3}
                                value={reviewNotes}
                                onChange={(e) => setReviewNotes(e.target.value)}
                                placeholder={
                                    reviewModalType === 'approve'
                                        ? "Please visit the Barangay Animal Facility Mon-Fri between 9AM-4PM with your valid Government ID..."
                                        : "State the reason for rejecting this application (e.g. living space unsuitable, conflicting applications)..."
                                }
                                className="w-full p-3 text-xs rounded-xl border border-gray-200 focus:border-orange-500 focus:outline-hidden resize-none bg-gray-50 focus:bg-white transition-colors"
                            />
                        </div>

                        <div className="flex items-center justify-end gap-2.5">
                            <button
                                onClick={() => setReviewModalType(null)}
                                className="px-4 py-2.5 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSubmitReview}
                                disabled={actionLoading}
                                className={`px-5 py-2.5 text-xs font-black text-white rounded-xl shadow-xs transition-all cursor-pointer ${
                                    reviewModalType === 'approve'
                                        ? 'bg-emerald-600 hover:bg-emerald-700'
                                        : 'bg-red-600 hover:bg-red-700'
                                }`}
                            >
                                {actionLoading ? 'Processing...' : reviewModalType === 'approve' ? 'Confirm Approval' : 'Confirm Rejection'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Staff Handover Confirmation Modal */}
            {handoverModalApp && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3.5 sm:p-4">
                    <div className="bg-white rounded-2xl sm:rounded-3xl max-w-lg w-full p-5 sm:p-8 shadow-2xl border border-gray-100 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2.5">
                                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center shadow-2xs shrink-0">
                                    <Shield className="w-5 h-5" />
                                </div>
                                <div className="min-w-0">
                                    <h2 className="text-base sm:text-lg font-black text-gray-900 truncate">
                                        Pet Handover Confirmation
                                    </h2>
                                    <p className="text-[11px] sm:text-xs text-gray-500 truncate">
                                        Barangay Animal Welfare Custody Release
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setHandoverModalApp(null)}
                                className="p-1.5 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-3.5 sm:p-4 mb-4 text-xs text-amber-950 space-y-2">
                            <p className="leading-relaxed">
                                You are officially recording that the rescue animal{' '}
                                <strong>{handoverModalApp.animal_name || `Rescue Animal #${handoverModalApp.holding_id}`}</strong>{' '}
                                has been physically claimed and handed over to applicant{' '}
                                <strong>{handoverModalApp.full_name}</strong>.
                            </p>
                            <div className="bg-white/90 p-2.5 rounded-xl border border-amber-200/80 text-[11px] space-y-1.5 shadow-2xs">
                                <div><strong>ID Document Type:</strong> {handoverModalApp.id_type || 'Government ID'}</div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    <strong>ID Number:</strong>
                                    {handoverModalApp.id_number ? (
                                        <MaskedIdDisplay idNumber={handoverModalApp.id_number} idType={handoverModalApp.id_type} compact={true} />
                                    ) : (
                                        <span>Registered on file</span>
                                    )}
                                </div>
                                <div><strong>Applicant Contact:</strong> {handoverModalApp.contact_no}</div>
                            </div>
                        </div>

                        <div className="mb-5 sm:mb-6">
                            <label className="block text-xs font-bold text-gray-700 mb-1.5">
                                Staff Handover Remarks / Verification Notes (Optional)
                            </label>
                            <textarea
                                rows={3}
                                value={handoverNotes}
                                onChange={(e) => setHandoverNotes(e.target.value)}
                                placeholder="e.g. Verified physical PhilSys ID, collar provided, adopter briefed on pet care..."
                                className="w-full p-3 text-xs rounded-xl border border-gray-200 focus:border-amber-500 focus:outline-hidden resize-none bg-gray-50 focus:bg-white transition-colors"
                            />
                        </div>

                        <div className="flex items-center justify-end gap-2.5">
                            <button
                                onClick={() => setHandoverModalApp(null)}
                                className="px-4 py-2.5 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleStaffConfirmHandover}
                                disabled={actionLoading}
                                className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-black text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                            >
                                {actionLoading ? 'Recording...' : 'Confirm Handover & Release'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ID Photo Lightbox Modal */}
            {previewIdPhotoUrl && (
                <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
                    <div className="bg-white rounded-2xl sm:rounded-3xl max-w-2xl w-full p-4 sm:p-6 shadow-2xl border border-gray-200 relative">
                        <div className="flex items-center justify-between mb-3 sm:mb-4">
                            <div className="flex items-center gap-2">
                                <CreditCard className="w-5 h-5 text-orange-500" />
                                <h3 className="font-black text-sm text-gray-900">
                                    Applicant Government-Issued ID Photo
                                </h3>
                            </div>
                            <button
                                onClick={() => setPreviewIdPhotoUrl(null)}
                                className="p-1.5 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="rounded-xl sm:rounded-2xl overflow-hidden border border-gray-200 bg-black/5 flex items-center justify-center max-h-[65vh] sm:max-h-[70vh]">
                            <img
                                src={previewIdPhotoUrl}
                                alt="Applicant Government ID"
                                className="w-full h-auto max-h-[65vh] sm:max-h-[70vh] object-contain"
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Quick Impound Confirmation Modal */}
            {quickImpoundAnimal && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-amber-200 space-y-4 animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex items-center gap-3 text-amber-600">
                            <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center shrink-0">
                                <Scale className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="text-base font-black text-gray-900 leading-tight">
                                    Impound Unadopted Animal
                                </h3>
                                <p className="text-xs text-amber-700 font-semibold mt-0.5">
                                    Official Municipal Animal Custody
                                </p>
                            </div>
                        </div>

                        <div className="bg-amber-50/70 p-4 rounded-2xl border border-amber-200 text-xs text-amber-950 space-y-2">
                            <p className="leading-relaxed">
                                Are you sure you want to mark <strong>{quickImpoundAnimal.animal_name || `Rescue #${quickImpoundAnimal.holding_id}`}</strong> as <strong>Impounded</strong>?
                            </p>
                            <p className="text-[11px] text-amber-800">
                                This will remove the animal from the public Adoption Catalog, update its status to Impounded, and archive the custody case.
                            </p>
                        </div>

                        <div className="flex items-center justify-end gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setQuickImpoundAnimal(null)}
                                disabled={isQuickImpounding}
                                className="px-4 py-2.5 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmImpound}
                                disabled={isQuickImpounding}
                                className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-black rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer uppercase tracking-wider"
                            >
                                <Scale className="w-3.5 h-3.5" />
                                <span>{isQuickImpounding ? 'Impounding...' : 'Confirm Impound'}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Full Application Details Modal */}
            {viewAppModal && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3.5 sm:p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl max-w-2xl w-full p-5 sm:p-7 shadow-2xl border border-gray-100 max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between pb-4 border-b border-gray-100 shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center shrink-0 shadow-2xs">
                                    <FileText className="w-5 h-5" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h2 className="text-base font-black text-gray-900">
                                            Application #{viewAppModal.adoption_id}
                                        </h2>
                                        <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                                            viewAppModal.status === 'Approved'
                                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                : viewAppModal.status === 'Rejected'
                                                ? 'bg-red-50 text-red-700 border-red-200'
                                                : viewAppModal.status === 'Cancelled'
                                                ? 'bg-gray-100 text-gray-700 border-gray-300'
                                                : 'bg-amber-50 text-amber-700 border-amber-200'
                                        }`}>
                                            {viewAppModal.status}
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-400 font-semibold mt-0.5">
                                        Submitted on {new Date(viewAppModal.created_at).toLocaleString('en-PH', {
                                            year: 'numeric', month: 'short', day: 'numeric',
                                            hour: '2-digit', minute: '2-digit'
                                        })}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setViewAppModal(null)}
                                className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="flex-1 overflow-y-auto space-y-4 py-4 pr-1 custom-scrollbar">
                            {/* Pet Summary Card */}
                            <div className="bg-gradient-to-r from-orange-50 via-amber-50 to-orange-50/50 rounded-2xl p-3.5 border border-orange-200 flex items-center justify-between gap-3 shadow-2xs">
                                <div className="flex items-center gap-3 min-w-0">
                                    <img
                                        src={getPetPicture(viewAppModal.animal_photo)}
                                        alt={viewAppModal.animal_name || 'Pet'}
                                        className="w-12 h-12 rounded-xl object-cover border border-orange-200 shadow-2xs shrink-0"
                                    />
                                    <div className="min-w-0">
                                        <span className="text-[10px] font-bold text-orange-700 uppercase tracking-wider">Applied Pet</span>
                                        <h4 className="text-sm font-black text-gray-900 truncate">
                                            {viewAppModal.animal_name || `Rescue #${viewAppModal.holding_id}`}
                                        </h4>
                                        <p className="text-[11px] text-gray-500 font-semibold">
                                            {viewAppModal.animal_type || 'Rescue'} {viewAppModal.animal_breed ? `• ${viewAppModal.animal_breed}` : ''}
                                        </p>
                                    </div>
                                </div>
                                <Link
                                    to={`/adopt/journey/${viewAppModal.holding_id}`}
                                    target="_blank"
                                    className="px-3 py-1.5 bg-white hover:bg-orange-50 text-orange-700 border border-orange-200 rounded-xl text-xs font-black transition-colors flex items-center gap-1.5 shadow-2xs shrink-0"
                                >
                                    <span>Journey Trail</span>
                                    <ExternalLink className="w-3.5 h-3.5 text-orange-500" />
                                </Link>
                            </div>

                            {/* Applicant Information Section */}
                            <div>
                                <h3 className="text-xs font-black text-gray-900 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                                    <User className="w-3.5 h-3.5 text-orange-500" /> Applicant Profile & Residence
                                </h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                    <div className="bg-gray-50 rounded-2xl p-3 border border-gray-100 space-y-0.5">
                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Full Legal Name</span>
                                        <p className="text-xs font-black text-gray-900">{viewAppModal.full_name}</p>
                                    </div>
                                    <div className="bg-gray-50 rounded-2xl p-3 border border-gray-100 space-y-0.5">
                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Contact Number</span>
                                        <p className="text-xs font-black text-gray-900">{viewAppModal.contact_no}</p>
                                    </div>
                                    <div className="bg-gray-50 rounded-2xl p-3 border border-gray-100 space-y-0.5 sm:col-span-2">
                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                                            <MapPin className="w-3 h-3 text-rose-500" /> Residential Address
                                        </span>
                                        <p className="text-xs font-extrabold text-gray-900 leading-relaxed">
                                            {viewAppModal.address || 'No residential address provided'}
                                        </p>
                                    </div>
                                    <div className="bg-gray-50 rounded-2xl p-3 border border-gray-100 space-y-0.5">
                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                                            <Home className="w-3 h-3 text-emerald-500" /> Living Space
                                        </span>
                                        <p className="text-xs font-black text-gray-900">{viewAppModal.living_space}</p>
                                    </div>
                                    <div className="bg-gray-50 rounded-2xl p-3 border border-gray-100 space-y-0.5">
                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                                            <PawPrint className="w-3 h-3 text-purple-500" /> Other Pets in Home
                                        </span>
                                        <p className="text-xs font-black text-gray-900">
                                            {viewAppModal.has_other_pets ? 'Yes (Currently owns other pets)' : 'No other pets'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Identity Verification Section */}
                            {viewAppModal.id_type && (
                                <div>
                                    <h3 className="text-xs font-black text-gray-900 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                                        <CreditCard className="w-3.5 h-3.5 text-blue-500" /> Identity Verification
                                    </h3>
                                    <div className="bg-slate-50/90 rounded-2xl p-3.5 border border-slate-200/80 flex items-center justify-between flex-wrap gap-3">
                                        <div className="space-y-1">
                                            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Government ID Document</div>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-xs font-black text-gray-900">{viewAppModal.id_type}</span>
                                                {viewAppModal.id_number && (
                                                    <MaskedIdDisplay idNumber={viewAppModal.id_number} idType={viewAppModal.id_type} />
                                                )}
                                            </div>
                                        </div>
                                        {viewAppModal.id_photo_url && (
                                            <button
                                                type="button"
                                                onClick={() => setPreviewIdPhotoUrl(viewAppModal.id_photo_url || null)}
                                                className="px-3 py-1.5 bg-white hover:bg-orange-50 text-orange-600 border border-orange-200 rounded-xl text-xs font-black transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
                                            >
                                                <Eye className="w-3.5 h-3.5" />
                                                <span>View ID Photo</span>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Motivation & Reason */}
                            {viewAppModal.reason && (
                                <div>
                                    <h3 className="text-xs font-black text-gray-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                        <FileText className="w-3.5 h-3.5 text-amber-500" /> Applicant's Stated Motivation & Reason
                                    </h3>
                                    <div className="bg-amber-50/60 rounded-2xl p-3.5 border border-amber-200/70 text-xs text-amber-950 leading-relaxed italic">
                                        "{viewAppModal.reason}"
                                    </div>
                                </div>
                            )}

                            {/* Review & Handover History */}
                            {(viewAppModal.review_notes || viewAppModal.staff_handed_over || viewAppModal.is_handed_over) && (
                                <div>
                                    <h3 className="text-xs font-black text-gray-900 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                                        <Shield className="w-3.5 h-3.5 text-indigo-500" /> Barangay Review & Handover Log
                                    </h3>
                                    <div className="space-y-2">
                                        {viewAppModal.review_notes && (
                                            <div className="bg-orange-50/60 rounded-2xl p-3 border border-orange-200/80 text-xs space-y-1">
                                                <span className="font-bold text-orange-900">
                                                    Review Remarks ({viewAppModal.reviewer_name || 'Barangay Officer'}):
                                                </span>
                                                <p className="text-orange-950 font-medium whitespace-pre-wrap">{viewAppModal.review_notes}</p>
                                            </div>
                                        )}
                                        {viewAppModal.status === 'Approved' && (
                                            <div className="bg-emerald-50/60 rounded-2xl p-3 border border-emerald-200/80 text-xs space-y-1">
                                                <div className="flex items-center justify-between font-bold text-emerald-900">
                                                    <span>Handover Status</span>
                                                    <span>
                                                        {viewAppModal.staff_handed_over && viewAppModal.is_handed_over
                                                            ? '✓ Completed & Registered'
                                                            : 'Awaiting Physical Claiming'}
                                                    </span>
                                                </div>
                                                {viewAppModal.staff_handover_name && (
                                                    <p className="text-[11px] text-emerald-800">
                                                        Released by: {viewAppModal.staff_handover_name} on {viewAppModal.staff_handover_date ? new Date(viewAppModal.staff_handover_date).toLocaleDateString() : '—'}
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="pt-4 border-t border-gray-100 flex items-center justify-between gap-2.5 flex-wrap shrink-0">
                            <button
                                type="button"
                                onClick={() => setViewAppModal(null)}
                                className="px-4 py-2.5 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
                            >
                                Close
                            </button>

                            <div className="flex items-center gap-2">
                                {viewAppModal.status === 'Pending' && isHeadOfficer && (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const app = viewAppModal;
                                                setViewAppModal(null);
                                                handleOpenReviewModal(app, 'reject');
                                            }}
                                            className="px-3.5 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1"
                                        >
                                            <XCircle className="w-3.5 h-3.5" />
                                            <span>Reject</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const app = viewAppModal;
                                                setViewAppModal(null);
                                                handleOpenReviewModal(app, 'approve');
                                            }}
                                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-all shadow-xs cursor-pointer flex items-center gap-1"
                                        >
                                            <CheckCircle2 className="w-3.5 h-3.5" />
                                            <span>Approve Application</span>
                                        </button>
                                    </>
                                )}
                                {viewAppModal.status === 'Approved' && !viewAppModal.staff_handed_over && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const app = viewAppModal;
                                            setViewAppModal(null);
                                            setHandoverModalApp(app);
                                        }}
                                        className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
                                    >
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                        <span>Confirm Handover</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BrgyAdoptions;
