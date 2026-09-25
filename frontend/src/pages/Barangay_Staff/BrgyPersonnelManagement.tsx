import { useState, useEffect } from 'react';
import BrgySidebar from '../../components/BrgySidebar';
import BrgyNavbar from '../../components/Navbars/BrgyNavbar';
import BrgyBottomNav from '../../components/Navbars/BrgyBottomNav';
import { api, API_BASE_URL } from '../../utils/api';
import { 
    Sparkles, 
    Shield, 
    Plus, 
    Search, 
    Mail, 
    Phone, 
    User, 
    Check, 
    Copy, 
    Eye, 
    Zap, 
    AlertCircle,
    X,
    Users,
    CheckCircle2,
    XCircle
} from 'lucide-react';

interface UserProfile {
    user_id: number;
    name: string;
    email: string;
    phone: string;
    role_id: number;
    status: string;
    position_id?: number | null;
    position_name?: string | null;
    profile_picture?: string;
    barangay_id?: number;
    barangay_name?: string;
    is_head_officer?: boolean;
    created_at?: string;
}

interface PositionOption {
    position_id: number;
    position_name: string;
}

interface UserPermissions {
    tactical_command: boolean;
    command_dispatch: boolean;
}

const DEFAULT_POSITIONS = [
    'Field Rescuer',
    'Animal Control Officer',
    'Holding Facility Caretaker',
    'Dispatch Officer',
    'Barangay Officer-in-Charge (OIC)',
    'Animal Control Operations Head',
    'Barangay Field Staff'
];

const PERMISSIONS_STORAGE_KEY = 'straysafe_staff_permissions_v2';

const getStoredPermissions = (): Record<number, UserPermissions> => {
    try {
        const raw = localStorage.getItem(PERMISSIONS_STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
};

const saveStoredPermissions = (userId: number, perms: UserPermissions) => {
    try {
        const all = getStoredPermissions();
        all[userId] = perms;
        localStorage.setItem(PERMISSIONS_STORAGE_KEY, JSON.stringify(all));
    } catch (e) {
        console.warn('Could not save permissions to localStorage', e);
    }
};

const BrgyPersonnelManagement = () => {
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
    const [personnel, setPersonnel] = useState<UserProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
    const [updatingUserId, setUpdatingUserId] = useState<number | null>(null);
    const [localPermsMap, setLocalPermsMap] = useState<Record<number, UserPermissions>>(getStoredPermissions());

    // View Profile Modal State
    const [viewingProfileUser, setViewingProfileUser] = useState<UserProfile | null>(null);
    const [isViewProfileOpen, setIsViewProfileOpen] = useState(false);
    const [copiedEmail, setCopiedEmail] = useState(false);
    const [copiedUserId, setCopiedUserId] = useState<number | null>(null);

    // Add Staff Modal State (Head Officer only)
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [modalError, setModalError] = useState<string | null>(null);
    const [positionsList, setPositionsList] = useState<PositionOption[]>([]);
    const [isCustomPosition, setIsCustomPosition] = useState(false);

    // Edit Permissions Modal State
    const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);

    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        phone: '',
        position: 'Field Rescuer',
        customPosition: '',
        status: 'Active',
        has_tactical_command: false,
        has_command_dispatch: false,
        is_head_officer: false
    });

    const rawUser = localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user');
    const currentUser = rawUser ? JSON.parse(rawUser) : null;
    const barangayId = currentUser?.barangay_id || 1;
    const barangayName = currentUser?.barangay_name || currentUser?.barangay || 'San Vicente';
    const isHeadOfficer = Boolean(currentUser?.is_head_officer || currentUser?.role_id === 5);

    const fetchPersonnel = async () => {
        if (!barangayId) return;
        try {
            setLoading(true);
            const response = await api.get(`/users/?barangay_id=${barangayId}`);
            setPersonnel(response.data);
            setLocalPermsMap(getStoredPermissions());
        } catch (error) {
            console.error('Error fetching personnel:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchPositions = async () => {
        try {
            const res = await api.get('/users/positions/list');
            if (Array.isArray(res.data)) {
                setPositionsList(res.data);
            }
        } catch (error) {
            console.warn('Could not load positions list:', error);
        }
    };

    useEffect(() => {
        fetchPersonnel();
        fetchPositions();
    }, [barangayId]);

    // Helper to determine exact permissions for any user
    const getUserPermissions = (user: UserProfile): UserPermissions => {
        const stored = localPermsMap[user.user_id];
        if (stored) {
            return stored;
        }
        const isHead = Boolean(user.is_head_officer || user.role_id === 5);
        return {
            tactical_command: isHead,
            command_dispatch: isHead
        };
    };

    const handleToggleStatus = async (user: UserProfile) => {
        if (!isHeadOfficer) return;
        const newStatus = user.status === 'Active' ? 'Inactive' : 'Active';
        try {
            setUpdatingUserId(user.user_id);
            await api.patch(`/users/${user.user_id}/status?status_in=${newStatus}`);
            setPersonnel(prev => prev.map(p => p.user_id === user.user_id ? { ...p, status: newStatus } : p));
            if (viewingProfileUser && viewingProfileUser.user_id === user.user_id) {
                setViewingProfileUser({ ...viewingProfileUser, status: newStatus });
            }
        } catch (error) {
            console.error('Failed to update status:', error);
            alert('Failed to update personnel status. Please try again.');
        } finally {
            setUpdatingUserId(null);
        }
    };

    const handleOpenViewProfile = (user: UserProfile) => {
        setViewingProfileUser(user);
        setIsViewProfileOpen(true);
        setCopiedEmail(false);
    };

    const handleCopyEmail = (email: string, userId?: number) => {
        navigator.clipboard.writeText(email);
        if (userId) {
            setCopiedUserId(userId);
            setTimeout(() => setCopiedUserId(null), 2000);
        } else {
            setCopiedEmail(true);
            setTimeout(() => setCopiedEmail(false), 2000);
        }
    };

    const handleOpenAddModal = () => {
        if (!isHeadOfficer) return;
        setFormData({
            name: '',
            email: '',
            password: '',
            phone: '',
            position: 'Field Rescuer',
            customPosition: '',
            status: 'Active',
            has_tactical_command: false,
            has_command_dispatch: false,
            is_head_officer: false
        });
        setIsCustomPosition(false);
        setModalError(null);
        setIsAddModalOpen(true);
    };

    const handleOpenEditPermissions = (user: UserProfile) => {
        if (!isHeadOfficer) return;
        setEditingUser(user);
        const perms = getUserPermissions(user);
        const isHead = perms.tactical_command || perms.command_dispatch || Boolean(user.is_head_officer || user.role_id === 5);
        
        setFormData({
            name: user.name,
            email: user.email,
            password: '',
            phone: user.phone || '',
            position: user.position_name || 'Field Rescuer',
            customPosition: '',
            status: user.status || 'Active',
            has_tactical_command: perms.tactical_command,
            has_command_dispatch: perms.command_dispatch,
            is_head_officer: isHead
        });
        setIsEditModalOpen(true);
    };

    const handleGrantAllPermissions = (enable: boolean) => {
        setFormData(prev => ({
            ...prev,
            has_tactical_command: enable,
            has_command_dispatch: enable,
            is_head_officer: enable
        }));
    };

    const handleCreateStaff = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isHeadOfficer) return;

        if (!formData.name.trim() || !formData.email.trim() || !formData.password.trim()) {
            setModalError('Please fill in all required fields (Name, Email, Password).');
            return;
        }

        const chosenPosition = isCustomPosition 
            ? formData.customPosition.trim() 
            : formData.position.trim();

        if (isCustomPosition && !chosenPosition) {
            setModalError('Please specify the custom staff position.');
            return;
        }

        const hasAnyPermission = formData.has_tactical_command || formData.has_command_dispatch || formData.is_head_officer;

        try {
            setIsSubmitting(true);
            setModalError(null);

            const payload = {
                name: formData.name.trim(),
                email: formData.email.trim(),
                password: formData.password,
                phone: formData.phone.trim() || null,
                role_id: hasAnyPermission ? 5 : 3,
                barangay_id: barangayId,
                is_head_officer: hasAnyPermission,
                position: chosenPosition || (hasAnyPermission ? 'Barangay Officer-in-Charge (OIC)' : 'Field Rescuer'),
                status: formData.status || 'Active'
            };

            const res = await api.post('/users/', payload);
            const createdUser = res.data;

            // Save merged permissions
            if (createdUser?.user_id) {
                saveStoredPermissions(createdUser.user_id, {
                    tactical_command: formData.has_tactical_command,
                    command_dispatch: formData.has_command_dispatch
                });
            }

            setIsAddModalOpen(false);
            fetchPersonnel();
            alert(`Staff account for "${payload.name}" successfully created with assigned authority in Barangay ${barangayName}!`);
        } catch (error: any) {
            console.error('Failed to create staff user:', error);
            const msg = error.response?.data?.detail || 'Failed to create user account. Please check the email and try again.';
            setModalError(typeof msg === 'string' ? msg : JSON.stringify(msg));
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSavePermissions = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isHeadOfficer || !editingUser) return;

        const hasAnyPermission = formData.has_tactical_command || formData.has_command_dispatch || formData.is_head_officer;

        try {
            setIsSubmitting(true);

            // 1. Save merged permissions locally for immediate UI update
            saveStoredPermissions(editingUser.user_id, {
                tactical_command: formData.has_tactical_command,
                command_dispatch: formData.has_command_dispatch
            });

            // 2. Update user in backend database
            await api.put(`/users/${editingUser.user_id}`, {
                role_id: hasAnyPermission ? 5 : 3,
                is_head_officer: hasAnyPermission,
                position: formData.position || (hasAnyPermission ? 'Barangay Officer-in-Charge (OIC)' : 'Field Rescuer'),
                status: formData.status
            });

            setIsEditModalOpen(false);
            setEditingUser(null);
            fetchPersonnel();
            alert(`Permissions and operational authority updated successfully for ${editingUser.name}!`);
        } catch (error: any) {
            console.error('Failed to update permissions:', error);
            const msg = error.response?.data?.detail || 'Failed to update permissions. Please try again.';
            alert(typeof msg === 'string' ? msg : JSON.stringify(msg));
        } finally {
            setIsSubmitting(false);
        }
    };

    const getProfilePicture = (path?: string) => {
        if (!path) return '';
        return path.startsWith('http') ? path : `${API_BASE_URL}/${path.replace(/^\//, '')}`;
    };

    const getInitials = (name: string) => {
        return name
            .split(' ')
            .filter(Boolean)
            .map(part => part[0])
            .slice(0, 2)
            .join('')
            .toUpperCase() || 'U';
    };

    // Filter calculations
    const totalCount = personnel.length;
    const activeCount = personnel.filter(p => (p.status || '').toLowerCase() === 'active').length;
    const inactiveCount = totalCount - activeCount;

    const filteredPersonnel = personnel.filter(p => {
        const matchesSearch = 
            p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (p.position_name && p.position_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (p.phone && p.phone.includes(searchTerm));

        const isActive = (p.status || '').toLowerCase() === 'active';
        if (statusFilter === 'ACTIVE') return matchesSearch && isActive;
        if (statusFilter === 'INACTIVE') return matchesSearch && !isActive;
        return matchesSearch;
    });

    return (
        <div className="flex h-screen bg-[#F8FAFC] font-inter overflow-hidden selection:bg-orange-100 selection:text-orange-900">
            <BrgySidebar 
                isMobileOpen={isMobileSidebarOpen}
                onCloseMobile={() => setIsMobileSidebarOpen(false)}
            />

            <main className="flex-1 flex flex-col h-screen min-w-0 overflow-hidden bg-[#F8FAFC]">
                <BrgyNavbar 
                    onMenuToggle={() => setIsMobileSidebarOpen(true)}
                    leftContent={
                        <div className="flex flex-col">
                            <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none uppercase">Personnel Management</h1>
                            <p className="text-[9px] text-gray-400 font-extrabold uppercase tracking-wider mt-1.5 leading-none">
                                Manage staff accounts, tactical dispatch authority & field operations roster
                            </p>
                        </div>
                    }
                />

                <div className="flex-1 overflow-y-auto w-full scroll-smooth">
                    <div className="max-w-[1440px] mx-auto w-full p-3.5 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 pb-32 lg:pb-8">
                        
                        {/* ─── MOBILE HERO BANNER (block md:hidden) ─── */}
                        <div className="block md:hidden relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#FF6B2B] via-[#F97316] to-[#FB923C] p-4 text-white shadow-lg shadow-orange-500/20 border border-orange-400/40 animate-in fade-in slide-in-from-top-2 duration-300">
                            {/* Ambient Glowing Orbs */}
                            <div className="absolute -top-8 -right-8 w-28 h-28 rounded-full bg-white/20 blur-xl pointer-events-none" />
                            <div className="absolute -bottom-8 -left-8 w-28 h-28 rounded-full bg-amber-300/25 blur-xl pointer-events-none" />
                            <div className="absolute top-3 right-3 text-2xl opacity-20 select-none pointer-events-none">
                                👥
                            </div>

                            <div className="relative z-10 space-y-3">
                                {/* Top Line: Branding + Action */}
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/35 shadow-inner shrink-0">
                                            <Users className="w-5 h-5 text-white" />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/20 backdrop-blur-md text-[9px] font-black uppercase tracking-wider text-white border border-white/30 mb-0.5 shadow-2xs">
                                                <Sparkles className="w-2.5 h-2.5 text-amber-200" /> Brgy. {barangayName}
                                            </div>
                                            <h1 className="text-base font-black tracking-tight leading-none text-white truncate">
                                                Personnel Center
                                            </h1>
                                        </div>
                                    </div>

                                    {isHeadOfficer && (
                                        <button
                                            onClick={handleOpenAddModal}
                                            className="px-3 py-1.5 bg-white text-orange-600 hover:bg-orange-50 rounded-xl text-[11px] font-black shadow-md active:scale-95 cursor-pointer flex items-center gap-1 shrink-0 transition-transform"
                                        >
                                            <Plus className="w-3.5 h-3.5" />
                                            <span>Add Staff</span>
                                        </button>
                                    )}
                                </div>

                                {/* Mobile 3-Column Compact KPI Tiles */}
                                <div className="grid grid-cols-3 gap-2 pt-0.5">
                                    <div 
                                        onClick={() => setStatusFilter('ALL')}
                                        className={`p-2 rounded-2xl text-center border transition-all active:scale-95 cursor-pointer ${
                                            statusFilter === 'ALL'
                                                ? 'bg-white/30 border-white/60 shadow-xs'
                                                : 'bg-white/15 hover:bg-white/20 border-white/25'
                                        }`}
                                    >
                                        <p className="text-[9px] font-extrabold uppercase tracking-wider text-orange-100">Total</p>
                                        <p className="text-base font-black text-white leading-tight mt-0.5">{totalCount}</p>
                                    </div>
                                    <div 
                                        onClick={() => setStatusFilter('ACTIVE')}
                                        className={`p-2 rounded-2xl text-center border transition-all active:scale-95 cursor-pointer ${
                                            statusFilter === 'ACTIVE'
                                                ? 'bg-emerald-500/40 border-emerald-300 shadow-xs'
                                                : 'bg-white/15 hover:bg-white/20 border-white/25'
                                        }`}
                                    >
                                        <div className="flex items-center justify-center gap-1">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-ping" />
                                            <p className="text-[9px] font-extrabold uppercase tracking-wider text-emerald-100">Active</p>
                                        </div>
                                        <p className="text-base font-black text-white leading-tight mt-0.5">{activeCount}</p>
                                    </div>
                                    <div 
                                        onClick={() => setStatusFilter('INACTIVE')}
                                        className={`p-2 rounded-2xl text-center border transition-all active:scale-95 cursor-pointer ${
                                            statusFilter === 'INACTIVE'
                                                ? 'bg-slate-900/40 border-slate-400 shadow-xs'
                                                : 'bg-white/15 hover:bg-white/20 border-white/25'
                                        }`}
                                    >
                                        <p className="text-[9px] font-extrabold uppercase tracking-wider text-orange-200">Off Duty</p>
                                        <p className="text-base font-black text-white leading-tight mt-0.5">{inactiveCount}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* ─── DESKTOP HEADER ACTION BAR (hidden md:flex) ─── */}
                        <div className="hidden md:flex items-center justify-between gap-4">
                            <div className="flex items-center gap-2">
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-50 text-orange-700 text-[11px] font-black uppercase tracking-wider border border-orange-200 shadow-2xs">
                                    <Sparkles className="w-3 h-3 text-orange-500" />
                                    Barangay {barangayName}
                                </span>
                                {isHeadOfficer ? (
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-50 text-purple-700 text-[11px] font-black uppercase tracking-wider border border-purple-200 shadow-2xs">
                                        <Shield className="w-3 h-3 text-purple-500" />
                                        Command Authority
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-[11px] font-black uppercase tracking-wider border border-blue-200 shadow-2xs">
                                        <User className="w-3 h-3 text-blue-500" />
                                        Staff View
                                    </span>
                                )}
                            </div>

                            {isHeadOfficer && (
                                <button
                                    onClick={handleOpenAddModal}
                                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-md shadow-orange-500/20 hover:shadow-orange-500/30 transition-all duration-300 cursor-pointer active:scale-95 border border-orange-400/30"
                                >
                                    <Plus className="w-4 h-4" />
                                    <span>Add Barangay Staff</span>
                                </button>
                            )}
                        </div>

                        {/* ─── DESKTOP SUMMARY KPI STAT CARDS (hidden md:grid) ─── */}
                        <div className="hidden md:grid grid-cols-3 gap-3 sm:gap-4">
                            
                            {/* Card 1: Total Personnel */}
                            <div 
                                onClick={() => setStatusFilter('ALL')}
                                className={`rounded-3xl p-5 border transition-all duration-300 cursor-pointer relative overflow-hidden flex flex-col justify-between min-h-[135px] ${
                                    statusFilter === 'ALL'
                                        ? 'bg-white border-blue-400 ring-2 ring-blue-100 shadow-md'
                                        : 'bg-white border-slate-200/80 hover:border-blue-200 shadow-xs hover:shadow-sm'
                                }`}
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                                            Total Personnel
                                        </h3>
                                        <p className="text-[11px] text-slate-400 font-medium mt-0.5">Barangay staff roster</p>
                                    </div>
                                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-100 text-blue-600 flex items-center justify-center shrink-0 border border-blue-200/60 shadow-2xs">
                                        <Users className="w-5 h-5" />
                                    </div>
                                </div>
                                <div className="mt-3">
                                    <p className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight leading-none">
                                        {totalCount}
                                    </p>
                                    <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center gap-1.5 text-[11px] font-bold text-blue-600">
                                        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-100 text-blue-700 text-[9px] shrink-0 font-black">✓</span>
                                        <span>San Vicente Team</span>
                                    </div>
                                </div>
                            </div>

                            {/* Card 2: Active On-Duty */}
                            <div 
                                onClick={() => setStatusFilter('ACTIVE')}
                                className={`rounded-3xl p-5 border transition-all duration-300 cursor-pointer relative overflow-hidden flex flex-col justify-between min-h-[135px] ${
                                    statusFilter === 'ACTIVE'
                                        ? 'bg-white border-emerald-400 ring-2 ring-emerald-100 shadow-md'
                                        : 'bg-white border-slate-200/80 hover:border-emerald-200 shadow-xs hover:shadow-sm'
                                }`}
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <div className="flex items-center gap-1.5">
                                            <span className="relative flex h-2 w-2">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                            </span>
                                            <h3 className="text-xs font-black text-emerald-700 uppercase tracking-wider">
                                                Active On Duty
                                            </h3>
                                        </div>
                                        <p className="text-[11px] text-slate-400 font-medium mt-0.5">Ready for dispatch</p>
                                    </div>
                                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-100 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-200/60 shadow-2xs">
                                        <CheckCircle2 className="w-5 h-5" />
                                    </div>
                                </div>
                                <div className="mt-3">
                                    <div className="flex items-baseline justify-between gap-2">
                                        <p className="text-3xl sm:text-4xl font-black text-emerald-700 tracking-tight leading-none">
                                            {activeCount}
                                        </p>
                                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                            {totalCount > 0 ? `${Math.round((activeCount / totalCount) * 100)}% Available` : '0%'}
                                        </span>
                                    </div>
                                    <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center gap-1.5 text-[11px] font-bold text-emerald-600">
                                        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 text-[9px] shrink-0 font-black">●</span>
                                        <span>Active field officers</span>
                                    </div>
                                </div>
                            </div>

                            {/* Card 3: Inactive Personnel */}
                            <div 
                                onClick={() => setStatusFilter('INACTIVE')}
                                className={`rounded-3xl p-5 border transition-all duration-300 cursor-pointer relative overflow-hidden flex flex-col justify-between min-h-[135px] ${
                                    statusFilter === 'INACTIVE'
                                        ? 'bg-white border-rose-400 ring-2 ring-rose-100 shadow-md'
                                        : 'bg-white border-slate-200/80 hover:border-rose-200 shadow-xs hover:shadow-sm'
                                }`}
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <h3 className="text-xs font-black text-slate-600 uppercase tracking-wider">
                                            Inactive / Off Duty
                                        </h3>
                                        <p className="text-[11px] text-slate-400 font-medium mt-0.5">Standby or inactive</p>
                                    </div>
                                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 text-slate-500 flex items-center justify-center shrink-0 border border-slate-200 shadow-2xs">
                                        <XCircle className="w-5 h-5" />
                                    </div>
                                </div>
                                <div className="mt-3">
                                    <p className="text-3xl sm:text-4xl font-black text-slate-700 tracking-tight leading-none">
                                        {inactiveCount}
                                    </p>
                                    <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
                                        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-100 text-slate-600 text-[9px] shrink-0 font-black">○</span>
                                        <span>Currently off-duty</span>
                                    </div>
                                </div>
                            </div>

                        </div>

                        {/* ─── SEARCH & FILTER CONTROLS ─── */}
                        <div className="bg-white p-3 sm:p-4 rounded-2xl sm:rounded-3xl border border-slate-200/80 shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="relative flex-1 max-w-md w-full">
                                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                                    <Search className="h-4 w-4" />
                                </span>
                                <input
                                    type="text"
                                    placeholder="Search personnel by name, role, email..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-10 pr-9 py-2 sm:py-2.5 bg-slate-50 border border-slate-200/90 rounded-xl sm:rounded-2xl text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all shadow-xs"
                                />
                                {searchTerm && (
                                    <button 
                                        onClick={() => setSearchTerm('')}
                                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>

                            {/* Status Filter Tabs */}
                            <div className="flex items-center gap-1.5 bg-slate-100/80 p-1 sm:p-1.5 rounded-xl sm:rounded-2xl border border-slate-200/60 self-start sm:self-auto overflow-x-auto w-full sm:w-auto">
                                <button
                                    onClick={() => setStatusFilter('ALL')}
                                    className={`flex-1 sm:flex-initial px-3 sm:px-3.5 py-1.5 rounded-lg sm:rounded-xl text-[10px] sm:text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer text-center ${
                                        statusFilter === 'ALL'
                                            ? 'bg-white text-slate-900 shadow-xs'
                                            : 'text-slate-500 hover:text-slate-800'
                                    }`}
                                >
                                    All ({totalCount})
                                </button>
                                <button
                                    onClick={() => setStatusFilter('ACTIVE')}
                                    className={`flex-1 sm:flex-initial px-3 sm:px-3.5 py-1.5 rounded-lg sm:rounded-xl text-[10px] sm:text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                                        statusFilter === 'ACTIVE'
                                            ? 'bg-emerald-600 text-white shadow-xs'
                                            : 'text-emerald-700 hover:bg-emerald-50'
                                    }`}
                                >
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-300" />
                                    Active ({activeCount})
                                </button>
                                <button
                                    onClick={() => setStatusFilter('INACTIVE')}
                                    className={`flex-1 sm:flex-initial px-3 sm:px-3.5 py-1.5 rounded-lg sm:rounded-xl text-[10px] sm:text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer text-center ${
                                        statusFilter === 'INACTIVE'
                                            ? 'bg-slate-700 text-white shadow-xs'
                                            : 'text-slate-500 hover:bg-slate-200/60'
                                    }`}
                                >
                                    Inactive ({inactiveCount})
                                </button>
                            </div>
                        </div>

                        {/* ─── PERSONNEL ROSTER CONTAINER ─── */}
                        <div className="bg-white rounded-3xl shadow-[0_4px_24px_rgba(0,0,0,0.03)] overflow-hidden border border-slate-200/80">
                            
                            {/* ─── MOBILE CARD VIEW ─── */}
                            <div className="block md:hidden p-4 space-y-3.5 bg-slate-50/50">
                                {loading ? (
                                    Array.from({ length: 3 }).map((_, i) => (
                                        <div key={i} className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs animate-pulse space-y-3">
                                            <div className="flex items-center gap-3">
                                                <div className="w-12 h-12 bg-slate-100 rounded-full" />
                                                <div className="space-y-1.5 flex-1">
                                                    <div className="h-4 w-28 bg-slate-100 rounded" />
                                                    <div className="h-3 w-20 bg-slate-50 rounded" />
                                                </div>
                                            </div>
                                            <div className="h-6 w-32 bg-slate-100 rounded-lg" />
                                        </div>
                                    ))
                                ) : filteredPersonnel.length === 0 ? (
                                    <div className="bg-white rounded-2xl p-8 border border-slate-200 text-center shadow-xs">
                                        <div className="w-12 h-12 mx-auto bg-orange-50 rounded-2xl flex items-center justify-center text-orange-500 mb-2 font-bold text-xl">
                                            👥
                                        </div>
                                        <h4 className="text-xs font-black text-slate-900 uppercase">No Personnel Found</h4>
                                        <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">Try another search or filter</p>
                                    </div>
                                ) : (
                                    filteredPersonnel.map(p => {
                                        const isActive = (p.status || '').toLowerCase() === 'active';
                                        const perms = getUserPermissions(p);
                                        const hasAnyAuthority = perms.tactical_command || perms.command_dispatch || Boolean(p.is_head_officer || p.role_id === 5);
                                        const photoUrl = getProfilePicture(p.profile_picture);

                                        return (
                                            <div key={p.user_id} className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs hover:border-orange-300 transition-all space-y-3.5">
                                                {/* Header: Avatar + Name + Status */}
                                                <div className="flex items-start justify-between gap-2.5">
                                                    <div 
                                                        onClick={() => handleOpenViewProfile(p)}
                                                        className="flex items-center gap-3 min-w-0 cursor-pointer flex-1"
                                                    >
                                                        <div className="relative shrink-0">
                                                            {photoUrl ? (
                                                                <img 
                                                                    src={photoUrl} 
                                                                    alt={p.name} 
                                                                    className="w-12 h-12 rounded-2xl object-cover border border-slate-200 shadow-xs bg-slate-50"
                                                                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                                                />
                                                            ) : (
                                                                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-400 to-amber-500 text-white font-black text-sm flex items-center justify-center shadow-xs">
                                                                    {getInitials(p.name)}
                                                                </div>
                                                            )}
                                                            <span 
                                                                className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white shadow-xs ${
                                                                    isActive ? 'bg-emerald-500' : 'bg-slate-400'
                                                                }`} 
                                                            />
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                                <h4 className="font-black text-slate-900 text-sm truncate leading-tight">
                                                                    {p.name}
                                                                </h4>
                                                                {hasAnyAuthority && (
                                                                    <span className="text-[9px] px-1.5 py-0.5 bg-purple-100 text-purple-700 font-black rounded border border-purple-200 uppercase tracking-wider shrink-0">
                                                                        ★ Officer
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="text-xs font-bold text-slate-600 truncate mt-0.5">
                                                                {p.position_name || (hasAnyAuthority ? 'Barangay Officer' : 'Field Staff')}
                                                            </p>
                                                            <span className="text-[10px] text-slate-400 font-medium">User ID: #{p.user_id}</span>
                                                        </div>
                                                    </div>

                                                    {/* Status Badge */}
                                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shrink-0 border ${
                                                        isActive 
                                                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                                            : 'bg-slate-100 text-slate-600 border-slate-200'
                                                    }`}>
                                                        <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                                                        {isActive ? 'Active' : 'Inactive'}
                                                    </span>
                                                </div>

                                                {/* Authority Tags */}
                                                <div className="flex flex-wrap gap-1.5 pt-0.5">
                                                    {hasAnyAuthority ? (
                                                        <>
                                                            {perms.tactical_command && (
                                                                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-50 text-purple-800 rounded-lg text-[10px] font-black border border-purple-200 shadow-2xs">
                                                                    <Zap className="w-3 h-3 text-purple-600" /> Tactical Command
                                                                </span>
                                                            )}
                                                            {perms.command_dispatch && (
                                                                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 text-indigo-800 rounded-lg text-[10px] font-black border border-indigo-200 shadow-2xs">
                                                                    <Shield className="w-3 h-3 text-indigo-600" /> Command & Dispatch
                                                                </span>
                                                            )}
                                                        </>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-[10px] font-bold border border-slate-200">
                                                            <Shield className="w-3 h-3 text-slate-500" /> Field Operations & Logs
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Contact Details & Copy Email */}
                                                <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200/70 text-xs flex items-center justify-between gap-2">
                                                    <div className="min-w-0 flex-1 space-y-0.5">
                                                        <div className="flex items-center gap-1.5 text-slate-700 text-[11px] font-medium truncate">
                                                            <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                                                            <span className="truncate">{p.email}</span>
                                                        </div>
                                                        <div className="flex items-center gap-1.5 text-slate-500 font-mono text-[10px]">
                                                            <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                                                            <span>{p.phone || 'No phone'}</span>
                                                        </div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleCopyEmail(p.email, p.user_id)}
                                                        className="px-2.5 py-1 bg-white hover:bg-orange-50 text-orange-600 font-bold text-[10px] rounded-lg border border-slate-200 uppercase tracking-wider shrink-0 transition-colors flex items-center gap-1 shadow-2xs"
                                                    >
                                                        {copiedUserId === p.user_id ? (
                                                            <>
                                                                <Check className="w-3 h-3 text-emerald-600" />
                                                                <span className="text-emerald-600">Copied</span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Copy className="w-3 h-3" />
                                                                <span>Copy</span>
                                                            </>
                                                        )}
                                                    </button>
                                                </div>

                                                {/* Mobile Actions Toolbar */}
                                                <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleOpenViewProfile(p)}
                                                        className="px-3 py-1.5 rounded-xl text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-all"
                                                    >
                                                        <Eye className="w-3.5 h-3.5" />
                                                        Profile
                                                    </button>

                                                    {isHeadOfficer && (
                                                        <>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleOpenEditPermissions(p)}
                                                                className="px-3 py-1.5 rounded-xl text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 uppercase tracking-wider cursor-pointer transition-all"
                                                            >
                                                                Permissions
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleToggleStatus(p)}
                                                                disabled={updatingUserId === p.user_id}
                                                                className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                                                                    isActive
                                                                        ? 'bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200'
                                                                        : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                                                                } ${updatingUserId === p.user_id ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                            >
                                                                {updatingUserId === p.user_id 
                                                                    ? 'Updating...' 
                                                                    : isActive ? 'Set Inactive' : 'Set Active'}
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                            {/* ─── DESKTOP TABLE VIEW ─── */}
                            <div className="hidden md:block overflow-x-auto">
                                <table className="w-full text-left border-collapse min-w-[960px]">
                                    <thead>
                                        <tr className="border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-wider bg-slate-50/75">
                                            <th className="py-4 pl-6 w-[260px] min-w-[240px]">Personnel</th>
                                            <th className="py-4 w-[180px] min-w-[160px]">Role / Position</th>
                                            <th className="py-4 min-w-[280px]">Assigned Authority & Permissions</th>
                                            <th className="py-4 w-[220px] min-w-[200px]">Contact Details</th>
                                            <th className="py-4 w-[120px] min-w-[110px]">Status</th>
                                            <th className="py-4 pr-6 text-right w-[210px] min-w-[200px]">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 text-xs">
                                        {loading ? (
                                            [...Array(4)].map((_, i) => (
                                                <tr key={i} className="animate-pulse">
                                                    <td className="py-4 pl-6 flex items-center gap-3">
                                                        <div className="w-10 h-10 bg-slate-100 rounded-2xl" />
                                                        <div className="space-y-1">
                                                            <div className="w-28 h-4 bg-slate-100 rounded" />
                                                            <div className="w-16 h-3 bg-slate-50 rounded" />
                                                        </div>
                                                    </td>
                                                    <td className="py-4"><div className="w-24 h-4 bg-slate-100 rounded" /></td>
                                                    <td className="py-4"><div className="w-48 h-6 bg-slate-100 rounded-lg" /></td>
                                                    <td className="py-4"><div className="w-36 h-4 bg-slate-100 rounded" /></td>
                                                    <td className="py-4"><div className="w-20 h-6 bg-slate-100 rounded-lg" /></td>
                                                    <td className="py-4 pr-6 text-right"><div className="w-24 h-6 bg-slate-100 rounded-lg ml-auto" /></td>
                                                </tr>
                                            ))
                                        ) : filteredPersonnel.length === 0 ? (
                                            <tr>
                                                <td colSpan={6} className="py-16 text-center text-slate-400 font-bold">
                                                    <div className="w-12 h-12 mx-auto bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 mb-2 font-bold text-xl">
                                                        👥
                                                    </div>
                                                    <p className="text-slate-600 font-black text-sm uppercase">No personnel matching your criteria</p>
                                                    <p className="text-xs text-slate-400 font-medium mt-1">Try searching by another term or adjusting status filter.</p>
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredPersonnel.map(p => {
                                                const isActive = (p.status || '').toLowerCase() === 'active';
                                                const perms = getUserPermissions(p);
                                                const hasAnyAuthority = perms.tactical_command || perms.command_dispatch || Boolean(p.is_head_officer || p.role_id === 5);
                                                const photoUrl = getProfilePicture(p.profile_picture);

                                                return (
                                                    <tr key={p.user_id} className="hover:bg-slate-50/75 transition-colors group">
                                                        
                                                        {/* 1. Personnel Column */}
                                                        <td className="py-4 pl-6">
                                                            <div 
                                                                onClick={() => handleOpenViewProfile(p)}
                                                                className="flex items-center gap-3 cursor-pointer"
                                                            >
                                                                <div className="relative shrink-0">
                                                                    {photoUrl ? (
                                                                        <img 
                                                                            src={photoUrl} 
                                                                            alt={p.name} 
                                                                            className="w-11 h-11 rounded-2xl object-cover border border-slate-200 shadow-2xs group-hover:ring-2 group-hover:ring-orange-400 transition-all bg-slate-50"
                                                                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                                                        />
                                                                    ) : (
                                                                        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-orange-400 to-amber-500 text-white font-black text-xs flex items-center justify-center shadow-2xs group-hover:ring-2 group-hover:ring-orange-400 transition-all">
                                                                            {getInitials(p.name)}
                                                                        </div>
                                                                    )}
                                                                    <span 
                                                                        className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white shadow-xs ${
                                                                            isActive ? 'bg-emerald-500' : 'bg-slate-400'
                                                                        }`} 
                                                                    />
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <span className="font-bold text-slate-900 text-sm group-hover:text-orange-600 transition-colors block truncate">
                                                                        {p.name}
                                                                    </span>
                                                                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                                                        <span className="text-[10px] text-slate-400 font-mono font-semibold">User ID: #{p.user_id}</span>
                                                                        {hasAnyAuthority && (
                                                                            <span className="text-[9px] px-1.5 py-0.2 bg-purple-50 text-purple-700 font-black rounded border border-purple-200/80 uppercase tracking-tight shrink-0">
                                                                                ★ Officer
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </td>

                                                        {/* 2. Role / Position Column */}
                                                        <td className="py-4">
                                                            <div className="flex flex-col">
                                                                <span className="font-bold text-slate-800 text-xs">
                                                                    {p.position_name || (hasAnyAuthority ? 'Barangay Officer' : 'Field Staff')}
                                                                </span>
                                                                <span className={`text-[10px] font-bold uppercase tracking-wider mt-0.5 ${
                                                                    hasAnyAuthority ? 'text-purple-600' : 'text-slate-400'
                                                                }`}>
                                                                    {hasAnyAuthority ? 'Command Staff' : 'Operations Staff'}
                                                                </span>
                                                            </div>
                                                        </td>

                                                        {/* 3. Assigned Authority Column */}
                                                        <td className="py-4">
                                                            {hasAnyAuthority ? (
                                                                <div className="flex flex-wrap items-center gap-1.5 max-w-[340px]">
                                                                    {perms.tactical_command && (
                                                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-50 text-purple-800 rounded-lg text-[10px] font-black border border-purple-200/80 shadow-2xs">
                                                                            <Zap className="w-3 h-3 text-purple-600" /> Tactical Command
                                                                        </span>
                                                                    )}
                                                                    {perms.command_dispatch && (
                                                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 text-indigo-800 rounded-lg text-[10px] font-black border border-indigo-200/80 shadow-2xs">
                                                                            <Shield className="w-3 h-3 text-indigo-600" /> Command & Dispatch
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            ) : (
                                                                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-[10px] font-bold border border-slate-200">
                                                                    <Shield className="w-3 h-3 text-slate-500" /> Field Operations & Logs
                                                                </span>
                                                            )}
                                                        </td>

                                                        {/* 4. Contact Details Column */}
                                                        <td className="py-4">
                                                            <div className="flex flex-col gap-0.5">
                                                                <div className="flex items-center gap-1.5 text-slate-700 font-medium text-xs">
                                                                    <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                                                                    <span className="truncate max-w-[170px]">{p.email}</span>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleCopyEmail(p.email, p.user_id)}
                                                                        title="Copy email"
                                                                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-orange-600 transition-opacity p-0.5 cursor-pointer"
                                                                    >
                                                                        {copiedUserId === p.user_id ? (
                                                                            <Check className="w-3 h-3 text-emerald-600" />
                                                                        ) : (
                                                                            <Copy className="w-3 h-3" />
                                                                        )}
                                                                    </button>
                                                                </div>
                                                                <div className="flex items-center gap-1.5 text-slate-500 font-mono text-[11px]">
                                                                    <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                                                                    <span>{p.phone || '—'}</span>
                                                                </div>
                                                            </div>
                                                        </td>

                                                        {/* 5. Status Column */}
                                                        <td className="py-4">
                                                            {isActive ? (
                                                                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-black uppercase tracking-wider border border-emerald-200/80 shadow-2xs">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                                                    Active
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-[10px] font-bold uppercase tracking-wider border border-slate-200">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                                                                    {p.status || 'Inactive'}
                                                                </span>
                                                            )}
                                                        </td>

                                                        {/* 6. Actions Column */}
                                                        <td className="py-4 pr-6 text-right">
                                                            <div className="flex items-center justify-end gap-1.5">
                                                                {/* View Profile Button */}
                                                                <button
                                                                    onClick={() => handleOpenViewProfile(p)}
                                                                    className="px-2.5 py-1.5 rounded-xl text-[10px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200/80 transition-all uppercase tracking-wider flex items-center gap-1 cursor-pointer active:scale-95 shadow-2xs"
                                                                >
                                                                    <Eye className="w-3 h-3" />
                                                                    Profile
                                                                </button>

                                                                {/* Head Officer Actions */}
                                                                {isHeadOfficer && (
                                                                    <>
                                                                        <button
                                                                            onClick={() => handleOpenEditPermissions(p)}
                                                                            className="px-2.5 py-1.5 rounded-xl text-[10px] font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200/80 transition-all uppercase tracking-wider cursor-pointer active:scale-95 shadow-2xs"
                                                                        >
                                                                            Permissions
                                                                        </button>
                                                                        <button
                                                                            onClick={() => handleToggleStatus(p)}
                                                                            disabled={updatingUserId === p.user_id}
                                                                            className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer shadow-2xs active:scale-95 ${
                                                                                isActive
                                                                                    ? 'bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200'
                                                                                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                                                                            } ${updatingUserId === p.user_id ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                                        >
                                                                            {updatingUserId === p.user_id 
                                                                                ? 'Updating...' 
                                                                                : isActive ? 'Set Inactive' : 'Set Active'}
                                                                        </button>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>

                <BrgyBottomNav activeTab="personnel" />
            </main>

            {/* ─── VIEW PERSONNEL PROFILE MODAL ─── */}
            {isViewProfileOpen && viewingProfileUser && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-200">
                        {/* Profile Cover Banner */}
                        <div className="relative h-28 bg-gradient-to-r from-orange-500 via-amber-500 to-purple-600 p-4 flex justify-between items-start">
                            <span className="px-3 py-1 bg-black/20 backdrop-blur-md text-white text-[10px] font-black rounded-lg uppercase tracking-wider">
                                Barangay {barangayName} Roster
                            </span>
                            <button
                                onClick={() => setIsViewProfileOpen(false)}
                                className="w-8 h-8 rounded-full bg-black/20 hover:bg-black/40 backdrop-blur-md flex items-center justify-center text-white transition-colors cursor-pointer"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Profile Body */}
                        <div className="px-6 pb-6 pt-0 relative">
                            {/* Avatar & Key details */}
                            <div className="flex flex-col sm:flex-row items-center sm:items-end justify-between -mt-12 mb-4 gap-3">
                                <div className="relative">
                                    {getProfilePicture(viewingProfileUser.profile_picture) ? (
                                        <img 
                                            src={getProfilePicture(viewingProfileUser.profile_picture)} 
                                            alt={viewingProfileUser.name}
                                            className="w-24 h-24 rounded-3xl object-cover border-4 border-white shadow-xl bg-white"
                                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                        />
                                    ) : (
                                        <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-orange-400 to-amber-500 text-white font-black text-2xl flex items-center justify-center border-4 border-white shadow-xl">
                                            {getInitials(viewingProfileUser.name)}
                                        </div>
                                    )}
                                    <span 
                                        className={`absolute bottom-1 right-1 w-5 h-5 rounded-full border-2 border-white ${
                                            (viewingProfileUser.status || '').toLowerCase() === 'active' 
                                                ? 'bg-emerald-500 ring-2 ring-emerald-200' 
                                                : 'bg-slate-400'
                                        }`} 
                                    />
                                </div>

                                <div className="flex items-center gap-2">
                                    {(viewingProfileUser.status || '').toLowerCase() === 'active' ? (
                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-black uppercase tracking-wider border border-emerald-200">
                                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                            Active On Duty
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-bold uppercase tracking-wider border border-slate-200">
                                            <span className="w-2 h-2 rounded-full bg-slate-400" />
                                            Inactive / Off Duty
                                        </span>
                                    )}

                                    {(() => {
                                        const perms = getUserPermissions(viewingProfileUser);
                                        const isOfficer = perms.tactical_command || perms.command_dispatch || Boolean(viewingProfileUser.is_head_officer || viewingProfileUser.role_id === 5);
                                        return isOfficer ? (
                                            <span className="px-3 py-1 bg-purple-100 text-purple-700 text-xs font-black rounded-full border border-purple-200 uppercase tracking-wider">
                                                ★ Officer Authority
                                            </span>
                                        ) : null;
                                    })()}
                                </div>
                            </div>

                            {/* Name & Designation Title */}
                            <div className="mb-5 text-center sm:text-left">
                                <h2 className="text-xl font-black text-slate-900 tracking-tight">
                                    {viewingProfileUser.name}
                                </h2>
                                <p className="text-xs font-bold text-orange-600 mt-0.5">
                                    {viewingProfileUser.position_name || 'Barangay Staff'}
                                </p>
                                <p className="text-[11px] text-slate-400 font-medium mt-0.5">User ID: #{viewingProfileUser.user_id} • Assigned to Barangay {barangayName}</p>
                            </div>

                            {/* Information Cards */}
                            <div className="space-y-3">
                                {/* Contact Card */}
                                <div className="bg-slate-50 border border-slate-200/70 rounded-2xl p-4 space-y-2.5">
                                    <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400">Contact Information</h4>
                                    
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2.5 text-xs text-slate-700">
                                            <Mail className="w-4 h-4 text-slate-400" />
                                            <span className="font-semibold">{viewingProfileUser.email}</span>
                                        </div>
                                        <button
                                            onClick={() => handleCopyEmail(viewingProfileUser.email)}
                                            className="text-[10px] font-bold text-orange-600 hover:text-orange-700 px-2.5 py-1 rounded-lg bg-orange-50 hover:bg-orange-100 transition-colors uppercase tracking-wider flex items-center gap-1 border border-orange-200/60 cursor-pointer"
                                        >
                                            {copiedEmail ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                                            {copiedEmail ? 'Copied' : 'Copy'}
                                        </button>
                                    </div>

                                    <div className="flex items-center gap-2.5 text-xs text-slate-700">
                                        <Phone className="w-4 h-4 text-slate-400" />
                                        <span className="font-semibold font-mono">{viewingProfileUser.phone || 'No phone number provided'}</span>
                                    </div>
                                </div>

                                {/* Authority & Operational Permissions */}
                                {(() => {
                                    const perms = getUserPermissions(viewingProfileUser);
                                    return (
                                        <div className="bg-gradient-to-br from-purple-50/50 via-indigo-50/40 to-amber-50/40 border border-purple-100 rounded-2xl p-4 space-y-2">
                                            <h4 className="text-[10px] font-black uppercase tracking-wider text-purple-900">
                                                Operational Authority in Barangay {barangayName}
                                            </h4>

                                            <div className="space-y-2 pt-1">
                                                <div className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-slate-100 text-xs shadow-2xs">
                                                    <div className="flex items-center gap-2.5">
                                                        <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                                                            <Zap className="w-3.5 h-3.5" />
                                                        </div>
                                                        <div>
                                                            <span className="font-bold text-slate-800">Tactical Command</span>
                                                            <p className="text-[10px] text-slate-400 font-medium">Field Operations & Evidence Capture</p>
                                                        </div>
                                                    </div>
                                                    <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-md ${
                                                        perms.tactical_command
                                                            ? 'bg-purple-100 text-purple-700 border border-purple-200'
                                                            : 'bg-slate-100 text-slate-400'
                                                    }`}>
                                                        {perms.tactical_command ? 'Authorized' : 'Not Granted'}
                                                    </span>
                                                </div>

                                                <div className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-slate-100 text-xs shadow-2xs">
                                                    <div className="flex items-center gap-2.5">
                                                        <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                                                            <Shield className="w-3.5 h-3.5" />
                                                        </div>
                                                        <div>
                                                            <span className="font-bold text-slate-800">Command & Dispatch</span>
                                                            <p className="text-[10px] text-slate-400 font-medium">Team Assignment, Intake & Final Sign-off</p>
                                                        </div>
                                                    </div>
                                                    <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-md ${
                                                        perms.command_dispatch
                                                            ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                                                            : 'bg-slate-100 text-slate-400'
                                                    }`}>
                                                        {perms.command_dispatch ? 'Authorized' : 'Not Granted'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>

                            {/* Modal Footer Controls */}
                            <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between">
                                {isHeadOfficer ? (
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => {
                                                setIsViewProfileOpen(false);
                                                handleOpenEditPermissions(viewingProfileUser);
                                            }}
                                            className="px-3.5 py-2 bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-xl text-xs font-bold border border-purple-200 uppercase tracking-wider transition-colors cursor-pointer"
                                        >
                                            Edit Permissions
                                        </button>
                                        <button
                                            onClick={() => handleToggleStatus(viewingProfileUser)}
                                            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
                                        >
                                            Toggle Status
                                        </button>
                                    </div>
                                ) : (
                                    <div className="text-[10px] text-slate-400 font-medium">
                                        Barangay Staff Verified Profile
                                    </div>
                                )}

                                <button
                                    onClick={() => setIsViewProfileOpen(false)}
                                    className="px-5 py-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-black text-xs rounded-xl shadow-md uppercase tracking-wider transition-all active:scale-95 cursor-pointer"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── ADD PERSONNEL MODAL (HEAD OFFICER ONLY) ─── */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
                    <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-xl w-full overflow-hidden animate-in zoom-in-95 duration-200 my-8">
                        {/* Modal Header */}
                        <div className="p-6 bg-gradient-to-r from-orange-500 via-orange-600 to-amber-500 text-white flex items-center justify-between">
                            <div>
                                <div className="flex items-center gap-2">
                                    <h2 className="text-xl font-black tracking-tight">Register Barangay Staff</h2>
                                    <span className="px-2 py-0.5 bg-white/20 text-white text-[9px] font-black rounded-md uppercase tracking-wider">
                                        Barangay {barangayName}
                                    </span>
                                </div>
                                <p className="text-xs text-orange-100 font-medium mt-0.5">
                                    Create and assign operational permissions for personnel in Barangay {barangayName}
                                </p>
                            </div>
                            <button
                                onClick={() => setIsAddModalOpen(false)}
                                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <form onSubmit={handleCreateStaff} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
                            {modalError && (
                                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold rounded-2xl flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                                    <span>{modalError}</span>
                                </div>
                            )}

                            {/* Full Name */}
                            <div>
                                <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wider mb-1">
                                    Full Name <span className="text-rose-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g., Juan Dela Cruz"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                                />
                            </div>

                            {/* Email & Phone */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wider mb-1">
                                        Email Address <span className="text-rose-500">*</span>
                                    </label>
                                    <input
                                        type="email"
                                        required
                                        placeholder="staff@barangay.gov"
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wider mb-1">
                                        Phone Number
                                    </label>
                                    <input
                                        type="tel"
                                        placeholder="0917-xxx-xxxx"
                                        value={formData.phone}
                                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                                    />
                                </div>
                            </div>

                            {/* Password */}
                            <div>
                                <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wider mb-1">
                                    Initial Password <span className="text-rose-500">*</span>
                                </label>
                                <input
                                    type="password"
                                    required
                                    placeholder="Enter temporary password"
                                    value={formData.password}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                                />
                            </div>

                            {/* Staff Position Selection */}
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider">
                                        Staff Position / Designation
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => setIsCustomPosition(!isCustomPosition)}
                                        className="text-[10px] text-orange-600 font-black hover:underline cursor-pointer"
                                    >
                                        {isCustomPosition ? '← Select Standard Position' : '+ Custom Position'}
                                    </button>
                                </div>

                                {isCustomPosition ? (
                                    <input
                                        type="text"
                                        placeholder="e.g., Lead Rescue Driver / Animal Handler"
                                        value={formData.customPosition}
                                        onChange={(e) => setFormData({ ...formData, customPosition: e.target.value })}
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                                    />
                                ) : (
                                    <select
                                        value={formData.position}
                                        onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                                    >
                                        {DEFAULT_POSITIONS.map(pos => (
                                            <option key={pos} value={pos}>{pos}</option>
                                        ))}
                                        {positionsList
                                            .filter(p => !DEFAULT_POSITIONS.includes(p.position_name))
                                            .map(p => (
                                                <option key={p.position_id} value={p.position_name}>{p.position_name}</option>
                                            ))
                                        }
                                    </select>
                                )}
                            </div>

                            {/* Authority & Permissions Matrix */}
                            <div className="bg-gradient-to-br from-orange-50/70 via-amber-50/40 to-purple-50/50 border border-orange-200/70 rounded-2xl p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="w-7 h-7 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center shrink-0">
                                            <Shield className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                                                Authority & Permissions Matrix
                                            </h4>
                                            <p className="text-[10px] text-slate-500 font-medium">
                                                Grant operational responsibilities for Barangay {barangayName}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <button
                                            type="button"
                                            onClick={() => handleGrantAllPermissions(true)}
                                            className="px-2.5 py-1 bg-purple-600 text-white rounded-lg text-[9px] font-black uppercase hover:bg-purple-700 transition-colors cursor-pointer"
                                        >
                                            Grant All
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleGrantAllPermissions(false)}
                                            className="px-2.5 py-1 bg-slate-200 text-slate-700 rounded-lg text-[9px] font-bold uppercase hover:bg-slate-300 transition-colors cursor-pointer"
                                        >
                                            Clear
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-2 pt-1">
                                    {/* 1. Tactical Command */}
                                    <label className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                                        formData.has_tactical_command 
                                            ? 'bg-purple-50/80 border-purple-300 ring-1 ring-purple-200' 
                                            : 'bg-white border-slate-200 hover:border-slate-300'
                                    }`}>
                                        <input
                                            type="checkbox"
                                            checked={formData.has_tactical_command}
                                            onChange={(e) => setFormData({ 
                                                ...formData, 
                                                has_tactical_command: e.target.checked,
                                                is_head_officer: e.target.checked || formData.has_command_dispatch
                                            })}
                                            className="mt-0.5 rounded text-purple-600 focus:ring-purple-500 h-4 w-4"
                                        />
                                        <div className="flex-1">
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs font-black text-slate-900 flex items-center gap-1">
                                                    <Zap className="w-3.5 h-3.5 text-purple-600" /> Tactical Command
                                                </span>
                                                <span className="text-[9px] font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-md">Field Operations</span>
                                            </div>
                                            <p className="text-[10px] text-slate-500 mt-0.5">
                                                Operates the report in the field (on-site animal pickup, secures animal, uploads photo evidence, and updates field progress).
                                            </p>
                                        </div>
                                    </label>

                                    {/* 2. Command & Dispatch */}
                                    <label className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                                        formData.has_command_dispatch 
                                            ? 'bg-indigo-50/80 border-indigo-300 ring-1 ring-indigo-200' 
                                            : 'bg-white border-slate-200 hover:border-slate-300'
                                    }`}>
                                        <input
                                            type="checkbox"
                                            checked={formData.has_command_dispatch}
                                            onChange={(e) => setFormData({ 
                                                ...formData, 
                                                has_command_dispatch: e.target.checked,
                                                is_head_officer: formData.has_tactical_command || e.target.checked
                                            })}
                                            className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                                        />
                                        <div className="flex-1">
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs font-black text-slate-900 flex items-center gap-1">
                                                    <Shield className="w-3.5 h-3.5 text-indigo-600" /> Command & Dispatch
                                                </span>
                                                <span className="text-[9px] font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-md">Desk & Sign-off</span>
                                            </div>
                                            <p className="text-[10px] text-slate-500 mt-0.5">
                                                Assigns rescue teams to cases, coordinates pickups, authorizes shelter holding intake, and issues the official <b>Final Resolved</b> sign-off.
                                            </p>
                                        </div>
                                    </label>
                                </div>
                            </div>

                            {/* Initial Status */}
                            <div>
                                <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wider mb-1">
                                    Initial Account Status
                                </label>
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, status: 'Active' })}
                                        className={`py-2 px-3 rounded-xl text-xs font-bold border flex items-center justify-center gap-2 transition-all cursor-pointer ${
                                            formData.status === 'Active'
                                                ? 'bg-emerald-50 border-emerald-300 text-emerald-700 ring-2 ring-emerald-100'
                                                : 'bg-slate-50 border-slate-200 text-slate-500'
                                        }`}
                                    >
                                        <span className="w-2 h-2 rounded-full bg-emerald-500" /> Active / Ready
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, status: 'Inactive' })}
                                        className={`py-2 px-3 rounded-xl text-xs font-bold border flex items-center justify-center gap-2 transition-all cursor-pointer ${
                                            formData.status === 'Inactive'
                                                ? 'bg-rose-50 border-rose-300 text-rose-700 ring-2 ring-rose-100'
                                                : 'bg-slate-50 border-slate-200 text-slate-500'
                                        }`}
                                    >
                                        <span className="w-2 h-2 rounded-full bg-slate-400" /> Inactive / Off Duty
                                    </button>
                                </div>
                            </div>

                            {/* Modal Actions */}
                            <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={() => setIsAddModalOpen(false)}
                                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 transition-colors uppercase tracking-wider cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className={`px-6 py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-black text-xs rounded-xl shadow-lg shadow-orange-500/20 uppercase tracking-wider transition-all cursor-pointer ${
                                        isSubmitting ? 'opacity-50 cursor-not-allowed' : 'active:scale-95'
                                    }`}
                                >
                                    {isSubmitting ? 'Registering...' : 'Register Staff Account'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ─── EDIT PERMISSIONS MODAL ─── */}
            {isEditModalOpen && editingUser && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6 bg-gradient-to-r from-purple-600 to-indigo-600 text-white flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-black tracking-tight">Manage Staff Permissions</h2>
                                <p className="text-xs text-purple-100 font-medium mt-0.5">
                                    Configuring authority for {editingUser.name} in Barangay {barangayName}
                                </p>
                            </div>
                            <button
                                onClick={() => setIsEditModalOpen(false)}
                                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <form onSubmit={handleSavePermissions} className="p-6 space-y-4">
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider">
                                        Assign Permissions & Responsibilities
                                    </h4>
                                    <div className="flex items-center gap-1.5">
                                        <button
                                            type="button"
                                            onClick={() => handleGrantAllPermissions(true)}
                                            className="px-2.5 py-1 bg-purple-600 text-white rounded-lg text-[9px] font-black uppercase hover:bg-purple-700 transition-colors cursor-pointer"
                                        >
                                            Grant All
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleGrantAllPermissions(false)}
                                            className="px-2.5 py-1 bg-slate-200 text-slate-700 rounded-lg text-[9px] font-bold uppercase hover:bg-slate-300 transition-colors cursor-pointer"
                                        >
                                            Clear
                                        </button>
                                    </div>
                                </div>

                                <label className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                                    formData.has_tactical_command 
                                        ? 'bg-purple-50/80 border-purple-300 ring-1 ring-purple-200' 
                                        : 'bg-white border-slate-200 hover:border-slate-300'
                                }`}>
                                    <input
                                        type="checkbox"
                                        checked={formData.has_tactical_command}
                                        onChange={(e) => setFormData({ 
                                            ...formData, 
                                            has_tactical_command: e.target.checked,
                                            is_head_officer: e.target.checked || formData.has_command_dispatch
                                        })}
                                        className="mt-0.5 rounded text-purple-600 focus:ring-purple-500 h-4 w-4"
                                    />
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-black text-slate-900 flex items-center gap-1">
                                                <Zap className="w-3.5 h-3.5 text-purple-600" /> Tactical Command
                                            </span>
                                            <span className="text-[9px] font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-md">Field Operations</span>
                                        </div>
                                        <p className="text-[10px] text-slate-500 mt-0.5">
                                            Operates the report in the field (on-site animal pickup, secures animal, uploads photo evidence, and updates field progress).
                                        </p>
                                    </div>
                                </label>

                                <label className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                                    formData.has_command_dispatch 
                                        ? 'bg-indigo-50/80 border-indigo-300 ring-1 ring-indigo-200' 
                                        : 'bg-white border-slate-200 hover:border-slate-300'
                                }`}>
                                    <input
                                        type="checkbox"
                                        checked={formData.has_command_dispatch}
                                        onChange={(e) => setFormData({ 
                                            ...formData, 
                                            has_command_dispatch: e.target.checked,
                                            is_head_officer: formData.has_tactical_command || e.target.checked
                                        })}
                                        className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                                    />
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-black text-slate-900 flex items-center gap-1">
                                                <Shield className="w-3.5 h-3.5 text-indigo-600" /> Command & Dispatch
                                            </span>
                                            <span className="text-[9px] font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-md">Desk & Sign-off</span>
                                        </div>
                                        <p className="text-[10px] text-slate-500 mt-0.5">
                                            Assigns rescue teams to cases, coordinates pickups, authorizes shelter holding intake, and issues the official <b>Final Resolved</b> sign-off.
                                        </p>
                                    </div>
                                </label>
                            </div>

                            <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={() => setIsEditModalOpen(false)}
                                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 transition-colors uppercase tracking-wider cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className={`px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-black text-xs rounded-xl shadow-lg shadow-purple-500/20 uppercase tracking-wider transition-all cursor-pointer ${
                                        isSubmitting ? 'opacity-50 cursor-not-allowed' : 'active:scale-95'
                                    }`}
                                >
                                    {isSubmitting ? 'Saving...' : 'Update Permissions'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BrgyPersonnelManagement;
