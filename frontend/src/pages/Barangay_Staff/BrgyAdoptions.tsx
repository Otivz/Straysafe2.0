import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { api } from '../../utils/api';
import BrgySidebar from '../../components/BrgySidebar';
import BrgyNavbar from '../../components/Navbars/BrgyNavbar';
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
    ExternalLink
} from 'lucide-react';

interface AdoptionApp {
    adoption_id: number;
    holding_id: number;
    applicant_id: number;
    status: 'Pending' | 'Approved' | 'Rejected';
    full_name: string;
    address: string;
    contact_no: string;
    has_other_pets: boolean;
    living_space: string;
    reason: string;
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
    const [statusFilter, setStatusFilter] = useState<'All' | 'Pending' | 'Approved' | 'Rejected'>('Pending');
    const [searchQuery, setSearchQuery] = useState('');

    // Data
    const [applications, setApplications] = useState<AdoptionApp[]>([]);
    const [catalogAnimals, setCatalogAnimals] = useState<CatalogAnimal[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);

    // Modal state
    const [selectedApp, setSelectedApp] = useState<AdoptionApp | null>(null);
    const [reviewModalType, setReviewModalType] = useState<'approve' | 'reject' | null>(null);
    const [reviewNotes, setReviewNotes] = useState('');
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
            const res = await axios.get('http://localhost:8000/adoptions/catalog');
            setCatalogAnimals(Array.isArray(res.data) ? res.data : []);
        } catch (err: any) {
            console.error("Failed to load adoption catalog", err);
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

    const pendingCount = applications.filter((a) => a.status === 'Pending').length;

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
                    <AdminNavbar />
                ) : (
                    <BrgyNavbar onMenuToggle={() => setMobileOpen(!mobileOpen)} />
                )}

                <main className="p-4 sm:p-8 max-w-7xl w-full mx-auto space-y-6">
                    {/* Page Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-black text-gray-900 flex items-center gap-2.5">
                                <Heart className="w-7 h-7 text-orange-500 fill-orange-500/20" />
                                <span>Adoption Management</span>
                            </h1>
                            <p className="text-xs sm:text-sm text-gray-500 mt-1">
                                Centralized Barangay management for public adoption applications and adoptable animal records.
                            </p>
                        </div>

                        {/* Top Stats */}
                        <div className="flex items-center gap-3">
                            <div className="bg-white px-4 py-2.5 rounded-2xl border border-gray-200 shadow-xs flex items-center gap-3">
                                <div className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                                <div className="text-left">
                                    <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Pending Review</div>
                                    <div className="text-base font-black text-gray-900">{pendingCount}</div>
                                </div>
                            </div>
                            <div className="bg-white px-4 py-2.5 rounded-2xl border border-gray-200 shadow-xs flex items-center gap-3">
                                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                                <div className="text-left">
                                    <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Listed For Adoption</div>
                                    <div className="text-base font-black text-gray-900">{catalogAnimals.length}</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Role Notice for non-Head Officer */}
                    {!isHeadOfficer && (
                        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-start gap-3 shadow-xs">
                            <Shield className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                            <div className="text-xs text-blue-900 leading-relaxed">
                                <span className="font-bold">Staff View Mode:</span> You are currently viewing applications as regular Barangay Staff. You can inspect applicant details and custody trails. Official approval and rejection actions are legally restricted to the <strong>Barangay Head Officer</strong> or <strong>System Administrator</strong>.
                            </div>
                        </div>
                    )}

                    {/* Toast Notification */}
                    {toastMessage && (
                        <div
                            className={`p-4 rounded-2xl border text-sm font-bold shadow-sm flex items-center gap-3 ${
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
                            <span>{toastMessage.text}</span>
                        </div>
                    )}

                    {/* Primary Tab Navigation */}
                    <div className="flex items-center gap-2 border-b border-gray-200 pb-2">
                        <button
                            onClick={() => setActiveTab('applications')}
                            className={`px-5 py-2.5 text-xs font-extrabold rounded-xl transition-all flex items-center gap-2 ${
                                activeTab === 'applications'
                                    ? 'bg-gray-900 text-white shadow-xs'
                                    : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                            }`}
                        >
                            <FileText className="w-4 h-4" />
                            <span>Adoption Applications ({applications.length})</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('catalog')}
                            className={`px-5 py-2.5 text-xs font-extrabold rounded-xl transition-all flex items-center gap-2 ${
                                activeTab === 'catalog'
                                    ? 'bg-gray-900 text-white shadow-xs'
                                    : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                            }`}
                        >
                            <Heart className="w-4 h-4 text-orange-500" />
                            <span>Public Catalog Animals ({catalogAnimals.length})</span>
                        </button>
                    </div>

                    {/* Applications Tab Content */}
                    {activeTab === 'applications' && (
                        <div className="space-y-4">
                            {/* Controls Bar */}
                            <div className="bg-white rounded-2xl p-3 sm:p-4 border border-gray-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
                                <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto">
                                    {(['All', 'Pending', 'Approved', 'Rejected'] as const).map((tab) => (
                                        <button
                                            key={tab}
                                            onClick={() => setStatusFilter(tab)}
                                            className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all shrink-0 ${
                                                statusFilter === tab
                                                    ? 'bg-orange-500 text-white shadow-xs'
                                                    : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-100'
                                            }`}
                                        >
                                            {tab === 'All' ? 'All' : tab}
                                            {tab === 'Pending' && pendingCount > 0 && (
                                                <span className="ml-1.5 px-1.5 py-0.2 rounded-full bg-white/30 text-white text-[10px]">
                                                    {pendingCount}
                                                </span>
                                            )}
                                        </button>
                                    ))}
                                </div>

                                <div className="relative w-full sm:w-64">
                                    <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder="Search applicant or pet..."
                                        className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-gray-200 focus:border-orange-500 focus:outline-hidden bg-gray-50 focus:bg-white"
                                    />
                                </div>
                            </div>

                            {/* Applications Table / Cards */}
                            {loading ? (
                                <div className="space-y-3">
                                    {[1, 2, 3].map((i) => (
                                        <div key={i} className="bg-white rounded-3xl p-6 border border-gray-200 animate-pulse h-32" />
                                    ))}
                                </div>
                            ) : filteredApplications.length === 0 ? (
                                <div className="bg-white rounded-3xl p-12 border border-dashed border-gray-300 text-center max-w-lg mx-auto shadow-xs">
                                    <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                                    <h3 className="font-extrabold text-gray-900 text-base mb-1">No Applications Match</h3>
                                    <p className="text-xs text-gray-500">
                                        There are currently no adoption applications matching your filters.
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {filteredApplications.map((app) => (
                                        <div
                                            key={app.adoption_id}
                                            className="bg-white rounded-3xl border border-gray-200/90 hover:border-gray-300 p-5 sm:p-6 shadow-xs transition-all flex flex-col md:flex-row md:items-center justify-between gap-5"
                                        >
                                            {/* Animal & Applicant Summary */}
                                            <div className="flex items-start gap-4 flex-1 min-w-0">
                                                <img
                                                    src={getPetPicture(app.animal_photo)}
                                                    alt={app.animal_name || 'Pet'}
                                                    className="w-16 h-16 rounded-2xl object-cover border border-gray-100 shrink-0"
                                                />
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2.5 mb-1 flex-wrap">
                                                        <h3 className="font-extrabold text-base text-gray-900 truncate">
                                                            {app.animal_name || `Rescue Animal #${app.holding_id}`}
                                                        </h3>
                                                        <span className="text-xs px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 font-semibold">
                                                            {app.animal_type || 'Rescue'}
                                                        </span>
                                                        <span className="text-xs text-gray-400">
                                                            App #{app.adoption_id}
                                                        </span>
                                                    </div>

                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs text-gray-600 mt-2">
                                                        <p><strong className="text-gray-900">Applicant:</strong> {app.full_name}</p>
                                                        <p><strong className="text-gray-900">Contact:</strong> {app.contact_no}</p>
                                                        <p><strong className="text-gray-900">Living Space:</strong> {app.living_space}</p>
                                                        <p><strong className="text-gray-900">Other Pets:</strong> {app.has_other_pets ? 'Yes' : 'No'}</p>
                                                    </div>

                                                    <p className="text-xs text-gray-500 mt-2 line-clamp-2 bg-gray-50 p-2.5 rounded-xl border border-gray-100 italic">
                                                        "{app.reason}"
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Status & Review Controls */}
                                            <div className="flex flex-col sm:flex-row md:flex-col items-start sm:items-center md:items-end justify-between gap-3 shrink-0 pt-3 md:pt-0 border-t md:border-t-0 border-gray-100">
                                                <div>
                                                    {app.status === 'Approved' && (
                                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-black border border-emerald-200">
                                                            <CheckCircle2 className="w-3.5 h-3.5" /> Approved
                                                        </span>
                                                    )}
                                                    {app.status === 'Rejected' && (
                                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-50 text-red-700 text-xs font-black border border-red-200">
                                                            <XCircle className="w-3.5 h-3.5" /> Rejected
                                                        </span>
                                                    )}
                                                    {app.status === 'Pending' && (
                                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-black border border-amber-200">
                                                            <Clock className="w-3.5 h-3.5" /> Pending Review
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    <Link
                                                        to={`/adopt/journey/${app.holding_id}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition-colors flex items-center gap-1"
                                                        title="View Journey Map"
                                                    >
                                                        <ExternalLink className="w-3.5 h-3.5" />
                                                        <span className="hidden sm:inline">Journey Trail</span>
                                                    </Link>

                                                    {app.status === 'Pending' && isHeadOfficer && (
                                                        <>
                                                            <button
                                                                onClick={() => handleOpenReviewModal(app, 'approve')}
                                                                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors shadow-xs"
                                                            >
                                                                Approve
                                                            </button>
                                                            <button
                                                                onClick={() => handleOpenReviewModal(app, 'reject')}
                                                                className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-xs font-bold transition-colors"
                                                            >
                                                                Reject
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Catalog Tab Content */}
                    {activeTab === 'catalog' && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <p className="text-xs font-bold text-gray-500">
                                    Rescued animals currently listed in the public Adoption Catalog ({catalogAnimals.length})
                                </p>
                                <Link
                                    to="/adopt"
                                    target="_blank"
                                    className="text-xs text-orange-600 font-bold hover:underline flex items-center gap-1"
                                >
                                    Open Public View <ExternalLink className="w-3.5 h-3.5" />
                                </Link>
                            </div>

                            {catalogAnimals.length === 0 ? (
                                <div className="bg-white rounded-3xl p-12 border border-dashed border-gray-300 text-center max-w-lg mx-auto shadow-xs">
                                    <Heart className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                                    <h3 className="font-extrabold text-gray-900 text-base mb-1">No Animals in Catalog</h3>
                                    <p className="text-xs text-gray-500">
                                        Animals can be promoted to the catalog from the Holding Facility page after their 7-day impound period elapses.
                                    </p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                                    {catalogAnimals.map((animal) => (
                                        <div
                                            key={animal.holding_id}
                                            className="bg-white rounded-3xl border border-gray-200/90 overflow-hidden shadow-xs hover:shadow-md transition-all flex flex-col"
                                        >
                                            <div className="relative w-full h-48 bg-gray-100">
                                                <img
                                                    src={getPetPicture(animal.photos?.[0])}
                                                    alt={animal.animal_name || 'Pet'}
                                                    className="w-full h-full object-cover"
                                                />
                                                <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md text-white font-bold text-[10px] uppercase tracking-wider">
                                                    {animal.animal_type || 'Rescue'}
                                                </span>
                                            </div>

                                            <div className="p-4 flex-1 flex flex-col justify-between">
                                                <div>
                                                    <h3 className="font-extrabold text-base text-gray-900 mb-1">
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

                                                <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                                                    <span className="text-[11px] text-gray-400">
                                                        Promoted: {animal.promoted_at ? new Date(animal.promoted_at).toLocaleDateString() : 'Active'}
                                                    </span>
                                                    <Link
                                                        to={`/adopt/journey/${animal.holding_id}`}
                                                        target="_blank"
                                                        className="text-xs text-orange-600 font-bold hover:underline flex items-center gap-1"
                                                    >
                                                        Journey Map <ExternalLink className="w-3 h-3" />
                                                    </Link>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </main>
            </div>

            {/* Review Decision Modal */}
            {reviewModalType && selectedApp && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-gray-100 animate-in fade-in zoom-in-95">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                {reviewModalType === 'approve' ? (
                                    <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                                        <CheckCircle2 className="w-5 h-5" />
                                    </div>
                                ) : (
                                    <div className="w-9 h-9 rounded-xl bg-red-100 text-red-700 flex items-center justify-center">
                                        <XCircle className="w-5 h-5" />
                                    </div>
                                )}
                                <h2 className="text-lg font-black text-gray-900">
                                    {reviewModalType === 'approve' ? 'Approve Adoption' : 'Reject Adoption Application'}
                                </h2>
                            </div>
                            <button
                                onClick={() => setReviewModalType(null)}
                                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <p className="text-xs text-gray-600 mb-4 leading-relaxed">
                            {reviewModalType === 'approve' ? (
                                <>
                                    You are approving <strong>{selectedApp.full_name}</strong> to adopt{' '}
                                    <strong>{selectedApp.animal_name || `Rescue #${selectedApp.holding_id}`}</strong>. This will set the animal's status to <strong>Adopted (status 7)</strong> and automatically notify the adopter for physical pickup.
                                </>
                            ) : (
                                <>
                                    You are rejecting the adoption application submitted by{' '}
                                    <strong>{selectedApp.full_name}</strong>.
                                </>
                            )}
                        </p>

                        <div className="mb-6">
                            <label className="block text-xs font-bold text-gray-700 mb-1.5">
                                {reviewModalType === 'approve' ? 'Pickup Instructions / Official Notes' : 'Rejection Reason'}
                            </label>
                            <textarea
                                rows={3}
                                value={reviewNotes}
                                onChange={(e) => setReviewNotes(e.target.value)}
                                placeholder={
                                    reviewModalType === 'approve'
                                        ? "Please visit the Barangay Animal Facility Mon-Fri between 9AM-4PM with valid Government ID..."
                                        : "State the reason for rejecting this application (e.g. living space unsuitable, conflicting applications)..."
                                }
                                className="w-full p-3 text-xs rounded-xl border border-gray-200 focus:border-orange-500 focus:outline-hidden resize-none bg-gray-50 focus:bg-white"
                            />
                        </div>

                        <div className="flex items-center justify-end gap-2.5">
                            <button
                                onClick={() => setReviewModalType(null)}
                                className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSubmitReview}
                                disabled={actionLoading}
                                className={`px-5 py-2.5 text-xs font-bold text-white rounded-xl shadow-xs transition-all ${
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
        </div>
    );
};

export default BrgyAdoptions;
