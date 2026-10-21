import { useState, useEffect, useRef } from 'react';
import PhoneInput from '../../components/PhoneInput';
import NoticeModal from '../../components/Modals/NoticeModal';
import BrgySidebar from '../../components/BrgySidebar';
import BrgyNavbar from '../../components/Navbars/BrgyNavbar';
import BrgyBottomNav from '../../components/Navbars/BrgyBottomNav';
import { api, API_BASE_URL } from '../../utils/api';
import { 
    Shield, 
    Plus, 
    Search, 
    Mail, 
    Phone, 
    Check, 
    Copy, 
    Eye, 
    Zap, 
    AlertCircle,
    X,
    CheckCircle2,
    XCircle,
    MoreVertical
} from 'lucide-react';
import { useCachedState, usePersistentState, hasCachedData } from '../../utils/useCachedState';

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
    const [personnel, setPersonnel] = useCachedState<UserProfile[]>('brgy_personnel', []);
    const [loading, setLoading] = useState(() => !hasCachedData('data:brgy_personnel'));
    const [searchTerm, setSearchTerm] = usePersistentState('brgy_personnel_search', '');
    const [statusFilter, setStatusFilter] = usePersistentState<'ALL' | 'ACTIVE' | 'INACTIVE'>('brgy_personnel_status', 'ALL');
    const [updatingUserId, setUpdatingUserId] = useState<number | null>(null);
    const [localPermsMap, setLocalPermsMap] = useState<Record<number, UserPermissions>>(getStoredPermissions());
    const [activeActionMenuId, setActiveActionMenuId] = useState<number | null>(null);

    // View Profile Modal State
    const [viewingProfileUser, setViewingProfileUser] = useState<UserProfile | null>(null);
    const [isViewProfileOpen, setIsViewProfileOpen] = useState(false);
    const [copiedEmail, setCopiedEmail] = useState(false);
    const [copiedUserId, setCopiedUserId] = useState<number | null>(null);

    // Add Staff Modal State (Head Officer only)
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const addDialogRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!isAddModalOpen) return;
        const opener = document.activeElement as HTMLElement | null;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const t = setTimeout(() => addDialogRef.current?.querySelector<HTMLInputElement>('#staff-name')?.focus(), 50);
        return () => {
            clearTimeout(t);
            document.body.style.overflow = previousOverflow;
            opener?.focus?.();
        };
    }, [isAddModalOpen]);
    const handleAddDialogKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'Escape' && !isSubmitting) { e.stopPropagation(); setIsAddModalOpen(false); return; }
        if (e.key !== 'Tab' || !addDialogRef.current) return;
        const items = Array.from(addDialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
            .filter((el) => el.offsetParent !== null);
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
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
    const [resultNotice, setResultNotice] = useState<{ variant: 'success' | 'error'; title: string; message: string } | null>(null);

    const fetchPersonnel = async () => {
        if (!barangayId) return;
        try {
            if (!hasCachedData('data:brgy_personnel')) setLoading(true);
            // Barangay staff only: residents of the barangay share its barangay_id but aren't personnel
            const response = await api.get('/users/', { params: { barangay_id: barangayId, role_id: 3 } });
            setPersonnel((response.data || []).filter((u: UserProfile) => u.role_id === 3));
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
            setResultNotice({ variant: 'error', title: 'Could not update status', message: 'Failed to update personnel status. Please try again.' });
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

    const handleCreateStaff = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isHeadOfficer) return;

        if (!formData.name.trim() || !formData.email.trim()) {
            setModalError('Please fill in all required fields (Name and Email).');
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
                phone: formData.phone.trim() || null,
                // Barangay staff are always role 3 (there is no role 5; the server refuses it).
                // Officer authority is expressed with the is_head_officer flag.
                role_id: 3,
                barangay_id: barangayId,
                is_head_officer: hasAnyPermission,
                position: chosenPosition || (hasAnyPermission ? 'Barangay Officer-in-Charge (OIC)' : 'Field Rescuer'),
                status: formData.status || 'Active'
            };

            const res = await api.post('/users/admin-create', payload);
            const createdUser = res.data;
            const inviteSent = createdUser?.invite_sent !== false;

            // Save merged permissions
            if (createdUser?.user_id) {
                saveStoredPermissions(createdUser.user_id, {
                    tactical_command: formData.has_tactical_command,
                    command_dispatch: formData.has_command_dispatch
                });
            }

            setIsAddModalOpen(false);
            fetchPersonnel();
            setResultNotice({
                variant: 'success',
                title: 'Staff account created',
                message: inviteSent
                    ? `The account for "${payload.name}" was created${hasAnyPermission ? ' with officer authority' : ''} in Barangay ${barangayName}. We emailed ${payload.email} a code so they can set their own password. It's valid for 3 days.`
                    : `The account for "${payload.name}" was created${hasAnyPermission ? ' with officer authority' : ''} in Barangay ${barangayName}, but the setup email couldn't be sent. Ask them to open the staff sign-in page and use "Forgot password?" with ${payload.email} to set their password.`,
            });
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
                role_id: 3,
                is_head_officer: hasAnyPermission,
                position: formData.position || (hasAnyPermission ? 'Barangay Officer-in-Charge (OIC)' : 'Field Rescuer'),
                status: formData.status
            });

            setIsEditModalOpen(false);
            setEditingUser(null);
            fetchPersonnel();
            setResultNotice({
                variant: 'success',
                title: 'Permissions updated',
                message: `Permissions and operational authority were updated for ${editingUser.name}.`,
            });
        } catch (error: any) {
            console.error('Failed to update permissions:', error);
            const msg = error.response?.data?.detail || 'Failed to update permissions. Please try again.';
            setResultNotice({ variant: 'error', title: 'Could not update permissions', message: typeof msg === 'string' ? msg : JSON.stringify(msg) });
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
        <div className="flex h-screen bg-[#F8FAFC] font-inter overflow-hidden selection:bg-role-muted selection:text-role-strong">
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
                    <div className="max-w-6xl mx-auto w-full px-3 py-4 sm:p-6 lg:p-8 space-y-3 sm:space-y-4 pb-32 lg:pb-8 min-w-0">
                        
                        {/* Heading + Add Staff */}
                        <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <h1 className="md:hidden text-lg font-black text-gray-900 tracking-tight leading-tight">Personnel</h1>
                                <div className="flex flex-wrap items-center gap-1.5 md:mt-0 mt-0.5">
                                    <span className="text-xs font-semibold text-gray-500 md:px-2.5 md:py-1 md:rounded-full md:bg-role-soft md:text-role-strong md:border md:border-role-border md:font-black">Barangay {barangayName}</span>
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide border ${isHeadOfficer ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                                        {isHeadOfficer ? 'Command Authority' : 'Staff View'}
                                    </span>
                                </div>
                            </div>
                            {isHeadOfficer && (
                                <button
                                    type="button"
                                    onClick={handleOpenAddModal}
                                    className="h-10 px-4 shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-role hover:bg-role-hover text-white font-black text-sm shadow-sm active:scale-95 transition-all cursor-pointer"
                                >
                                    <Plus className="w-4 h-4" />
                                    <span>Add<span className="hidden sm:inline"> Staff</span></span>
                                </button>
                            )}
                        </div>

                        {/* Stats (tap to filter) */}
                        <div className="grid grid-cols-3 gap-2 sm:gap-3">
                            {([
                                { key: 'ALL', label: 'Total', sub: `${barangayName} team`, value: totalCount, tone: 'text-slate-900', ring: 'ring-blue-200 border-blue-300' },
                                { key: 'ACTIVE', label: 'Active', sub: totalCount > 0 ? `${Math.round((activeCount / totalCount) * 100)}% available` : 'Ready for dispatch', value: activeCount, tone: 'text-emerald-600', ring: 'ring-emerald-200 border-emerald-300' },
                                { key: 'INACTIVE', label: 'Off duty', sub: 'Standby or inactive', value: inactiveCount, tone: 'text-slate-600', ring: 'ring-slate-300 border-slate-400' },
                            ] as const).map((c) => {
                                const isOn = statusFilter === c.key;
                                return (
                                    <button
                                        key={c.key}
                                        type="button"
                                        onClick={() => setStatusFilter(c.key)}
                                        aria-pressed={isOn}
                                        className={`text-left bg-white rounded-2xl border p-3 sm:p-4 flex flex-col gap-1 min-w-0 transition-all cursor-pointer active:scale-[0.99] ${isOn ? `ring-2 ${c.ring}` : 'border-gray-200/80 hover:border-role-border'}`}
                                    >
                                        <span className={`text-2xl sm:text-3xl font-black leading-none ${c.tone}`}>{c.value}</span>
                                        <span className="text-xs font-bold text-slate-800 leading-tight mt-1">{c.label}</span>
                                        <span className="hidden sm:block text-[11px] font-medium text-slate-500 leading-tight truncate">{c.sub}</span>
                                    </button>
                                );
                            })}
                        </div>

                        {/* ─── SEARCH & FILTER CONTROLS ─── */}
                        <div className="bg-white p-3 sm:p-4 rounded-2xl border border-gray-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                            <div className="relative flex-1 max-w-md w-full">
                                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                                    <Search className="h-4 w-4" />
                                </span>
                                <input
                                    type="text"
                                    placeholder="Search name, role or email"
                                    aria-label="Search personnel"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full h-11 pl-10 pr-9 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-role/20 focus:border-role/40 transition-colors"
                                />
                                {searchTerm && (
                                    <button 
                                        type="button"
                                        onClick={() => setSearchTerm('')}
                                        aria-label="Clear search"
                                        className="absolute inset-y-0 right-0 w-10 flex items-center justify-center text-slate-400 hover:text-slate-600"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>

                            {/* Status Filter Tabs */}
                            <div className="grid grid-cols-3 gap-1 p-1 bg-gray-100 rounded-xl w-full sm:w-auto" role="tablist" aria-label="Status">
                                {([
                                    ['ALL', 'All', totalCount],
                                    ['ACTIVE', 'Active', activeCount],
                                    ['INACTIVE', 'Inactive', inactiveCount],
                                ] as const).map(([key, label, count]) => {
                                    const isOn = statusFilter === key;
                                    return (
                                        <button
                                            key={key}
                                            type="button"
                                            role="tab"
                                            aria-selected={isOn}
                                            onClick={() => setStatusFilter(key)}
                                            className={`h-9 sm:px-4 min-w-0 rounded-lg text-xs font-black inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${isOn ? 'bg-role text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
                                        >
                                            {label}
                                            <span className={`text-[10px] ${isOn ? 'text-white/80' : 'text-slate-400'}`}>{count}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* ─── PERSONNEL ROSTER CONTAINER ─── */}
                        <div className="md:bg-white md:rounded-2xl md:border md:border-gray-200/80 md:overflow-hidden">
                            
                            {/* ─── MOBILE CARD VIEW ─── */}
                            <div className="block md:hidden space-y-2.5">
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
                                    <div className="bg-white rounded-2xl px-4 py-10 border border-dashed border-gray-200 text-center">
                                        <div className="w-12 h-12 mx-auto bg-role-soft rounded-full flex items-center justify-center text-role mb-2 text-xl">👥</div>
                                        <h4 className="text-sm font-black text-slate-900">No personnel found</h4>
                                        <p className="text-xs text-slate-500 mt-1">Try another search or status.</p>
                                    </div>
                                ) : (
                                    filteredPersonnel.map((p) => {
                                        const isActive = (p.status || '').toLowerCase() === 'active';
                                        const perms = getUserPermissions(p);
                                        const hasAnyAuthority = perms.tactical_command || perms.command_dispatch || Boolean(p.is_head_officer || p.role_id === 5);
                                        const photoUrl = getProfilePicture(p.profile_picture);

                                        return (
                                            <div key={p.user_id} className="bg-white rounded-2xl p-3 border border-gray-200/80 hover:border-role-border transition-colors space-y-2.5 min-w-0">
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
                                                                    className="w-12 h-12 rounded-full object-cover border border-slate-200 bg-slate-50"
                                                                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                                                />
                                                            ) : (
                                                                <div className="w-12 h-12 rounded-full bg-role-soft text-role-hover font-black text-sm flex items-center justify-center">
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
                                                                <h4 className="font-black text-slate-900 text-[15px] leading-snug break-words">
                                                                    {p.name}
                                                                </h4>
                                                                {hasAnyAuthority && (
                                                                    <span className="text-[10px] px-1.5 py-px bg-purple-50 text-purple-700 font-black rounded-full border border-purple-200 shrink-0">
                                                                        ★ Officer
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="text-xs font-bold text-slate-600 truncate mt-0.5">
                                                                {p.position_name || (hasAnyAuthority ? 'Barangay Officer' : 'Field Staff')}
                                                            </p>
                                                            <span className="text-[11px] text-slate-400">ID #{p.user_id}</span>
                                                        </div>
                                                    </div>

                                                    {/* Status Badge & Actions */}
                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                                                            isActive 
                                                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                                                : 'bg-slate-100 text-slate-600 border-slate-200'
                                                        }`}>
                                                            <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                                                            {isActive ? 'Active' : 'Inactive'}
                                                        </span>

                                                    </div>
                                                </div>

                                                {/* Authority Tags */}
                                                <div className="flex flex-wrap gap-1.5">
                                                    {hasAnyAuthority ? (
                                                        <>
                                                            {perms.tactical_command && (
                                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-50 text-purple-800 rounded-full text-[11px] font-bold">
                                                                    <Zap className="w-3 h-3 text-purple-600" /> Tactical Command
                                                                </span>
                                                            )}
                                                            {perms.command_dispatch && (
                                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-800 rounded-full text-[11px] font-bold">
                                                                    <Shield className="w-3 h-3 text-indigo-600" /> Command & Dispatch
                                                                </span>
                                                            )}
                                                        </>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-700 rounded-full text-[11px] font-semibold">
                                                            <Shield className="w-3 h-3 text-slate-500" /> Field Operations & Logs
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Contact Details & Copy Email */}
                                                <div className="text-xs flex items-center justify-between gap-2 min-w-0">
                                                    <div className="min-w-0 flex-1 space-y-0.5">
                                                        <div className="flex items-center gap-1.5 text-slate-700 text-xs min-w-0">
                                                            <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                                                            <span className="truncate">{p.email}</span>
                                                        </div>
                                                        <div className="flex items-center gap-1.5 text-slate-500 text-xs">
                                                            <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                                                            <span>{p.phone || 'No phone'}</span>
                                                        </div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleCopyEmail(p.email, p.user_id)}
                                                        className="h-8 px-2.5 bg-white hover:bg-role-soft text-role-hover font-bold text-xs rounded-lg border border-slate-200 shrink-0 transition-colors flex items-center gap-1"
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
                                                <div className="grid grid-cols-3 gap-2 pt-2.5 border-t border-slate-100">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleOpenViewProfile(p)}
                                                        className={`h-9 px-2 rounded-xl text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 flex items-center justify-center gap-1 cursor-pointer transition-colors ${
                                                            !isHeadOfficer ? 'col-span-3' : ''
                                                        }`}
                                                    >
                                                        <Eye className="w-3.5 h-3.5 shrink-0" />
                                                        <span>Profile</span>
                                                    </button>

                                                    {isHeadOfficer && (
                                                        <>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleOpenEditPermissions(p)}
                                                                className="h-9 px-1.5 rounded-xl text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 flex items-center justify-center cursor-pointer transition-colors"
                                                            >
                                                                <span>Permissions</span>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleToggleStatus(p)}
                                                                disabled={updatingUserId === p.user_id}
                                                                className={`h-9 px-1.5 rounded-xl text-xs font-bold transition-colors flex items-center justify-center text-center leading-tight cursor-pointer ${
                                                                    isActive
                                                                        ? 'bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200'
                                                                        : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                                                                } ${updatingUserId === p.user_id ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                            >
                                                                <span>
                                                                    {updatingUserId === p.user_id 
                                                                        ? 'Saving...' 
                                                                        : isActive ? 'Set Inactive' : 'Set Active'}
                                                                </span>
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
                            <div className="hidden md:block overflow-visible min-h-[300px]">
                                <table className="w-full text-left border-collapse table-auto">
                                    <thead>
                                        <tr className="border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-wider bg-slate-50/75">
                                            <th className="py-3.5 pl-6">Personnel</th>
                                            <th className="py-3.5 px-3">Role / Position</th>
                                            <th className="py-3.5 px-3">Assigned Authority & Permissions</th>
                                            <th className="py-3.5 px-3">Contact Details</th>
                                            <th className="py-3.5 px-3">Status</th>
                                            <th className="py-3.5 pr-6 text-right w-16">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 text-xs">
                                        {loading ? (
                                            [...Array(4)].map((_, i) => (
                                                <tr key={i} className="animate-pulse">
                                                    <td className="py-3.5 pl-6 flex items-center gap-3">
                                                        <div className="w-10 h-10 bg-slate-100 rounded-2xl" />
                                                        <div className="space-y-1">
                                                            <div className="w-28 h-4 bg-slate-100 rounded" />
                                                            <div className="w-16 h-3 bg-slate-50 rounded" />
                                                        </div>
                                                    </td>
                                                    <td className="py-3.5 px-3"><div className="w-24 h-4 bg-slate-100 rounded" /></td>
                                                    <td className="py-3.5 px-3"><div className="w-48 h-6 bg-slate-100 rounded-lg" /></td>
                                                    <td className="py-3.5 px-3"><div className="w-36 h-4 bg-slate-100 rounded" /></td>
                                                    <td className="py-3.5 px-3"><div className="w-20 h-6 bg-slate-100 rounded-lg" /></td>
                                                    <td className="py-3.5 pr-6 text-right"><div className="w-8 h-8 bg-slate-100 rounded-xl ml-auto" /></td>
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
                                            filteredPersonnel.map((p, pIndex) => {
                                                const isActive = (p.status || '').toLowerCase() === 'active';
                                                const perms = getUserPermissions(p);
                                                const hasAnyAuthority = perms.tactical_command || perms.command_dispatch || Boolean(p.is_head_officer || p.role_id === 5);
                                                const photoUrl = getProfilePicture(p.profile_picture);
                                                const totalRows = filteredPersonnel.length;
                                                const openUpwards = totalRows > 1 && (pIndex >= totalRows - 3 || (totalRows >= 4 && pIndex >= Math.floor(totalRows / 2)));

                                                return (
                                                    <tr key={p.user_id} className="hover:bg-slate-50/75 transition-colors group">
                                                        
                                                        {/* 1. Personnel Column */}
                                                        <td className="py-3.5 pl-6">
                                                            <div 
                                                                onClick={() => handleOpenViewProfile(p)}
                                                                className="flex items-center gap-3 cursor-pointer"
                                                            >
                                                                <div className="relative shrink-0">
                                                                    {photoUrl ? (
                                                                        <img 
                                                                            src={photoUrl} 
                                                                            alt={p.name} 
                                                                            className="w-10 h-10 rounded-2xl object-cover border border-slate-200 shadow-2xs group-hover:ring-2 group-hover:ring-role transition-all bg-slate-50"
                                                                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                                                        />
                                                                    ) : (
                                                                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-role to-amber-500 text-white font-black text-xs flex items-center justify-center shadow-2xs group-hover:ring-2 group-hover:ring-role transition-all">
                                                                            {getInitials(p.name)}
                                                                        </div>
                                                                    )}
                                                                    <span 
                                                                        className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3 rounded-full border-2 border-white shadow-xs ${
                                                                            isActive ? 'bg-emerald-500' : 'bg-slate-400'
                                                                        }`} 
                                                                    />
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <span className="font-bold text-slate-900 text-sm group-hover:text-role-hover transition-colors block truncate">
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
                                                        <td className="py-3.5 px-3">
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
                                                        <td className="py-3.5 px-3">
                                                            {hasAnyAuthority ? (
                                                                <div className="flex flex-wrap items-center gap-1.5 max-w-[320px]">
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
                                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-700 rounded-full text-[11px] font-semibold">
                                                                    <Shield className="w-3 h-3 text-slate-500" /> Field Operations & Logs
                                                                </span>
                                                            )}
                                                        </td>

                                                        {/* 4. Contact Details Column */}
                                                        <td className="py-3.5 px-3">
                                                            <div className="flex flex-col gap-0.5">
                                                                <div className="flex items-center gap-1.5 text-slate-700 font-medium text-xs">
                                                                    <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                                                                    <span className="truncate max-w-[160px]">{p.email}</span>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleCopyEmail(p.email, p.user_id)}
                                                                        title="Copy email"
                                                                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-role-hover transition-opacity p-0.5 cursor-pointer"
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
                                                        <td className="py-3.5 px-3">
                                                            {isActive ? (
                                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-black uppercase tracking-wider border border-emerald-200/80 shadow-2xs">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                                                    Active
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full text-[10px] font-bold uppercase tracking-wider border border-slate-200">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                                                                    {p.status || 'Inactive'}
                                                                </span>
                                                            )}
                                                        </td>

                                                        {/* 6. Actions Column (3-Dots Dropdown) */}
                                                        <td className="py-3.5 pr-6 text-right">
                                                            <div className={`relative inline-block text-left ${activeActionMenuId === p.user_id ? 'z-50' : ''}`}>
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setActiveActionMenuId(activeActionMenuId === p.user_id ? null : p.user_id);
                                                                    }}
                                                                    className={`w-8 h-8 rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-900 transition-all cursor-pointer active:scale-95 border ${
                                                                        activeActionMenuId === p.user_id 
                                                                            ? 'bg-slate-100 border-slate-300 text-slate-900' 
                                                                            : 'border-transparent hover:bg-slate-100'
                                                                    }`}
                                                                    title="Actions menu"
                                                                    aria-label="Actions"
                                                                >
                                                                    <MoreVertical className="w-4 h-4" />
                                                                </button>

                                                                {activeActionMenuId === p.user_id && (
                                                                    <>
                                                                        <div 
                                                                            className="fixed inset-0 z-40" 
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                setActiveActionMenuId(null);
                                                                            }} 
                                                                        />
                                                                        <div className={`absolute right-0 ${openUpwards ? 'bottom-full mb-1.5 origin-bottom-right' : 'top-full mt-1.5 origin-top-right'} w-44 bg-white rounded-2xl shadow-xl border border-slate-100 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-150 text-left`}>
                                                                            <button
                                                                                type="button"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    setActiveActionMenuId(null);
                                                                                    handleOpenViewProfile(p);
                                                                                }}
                                                                                className="w-full px-3.5 py-2.5 text-left text-xs font-bold text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2.5 transition-colors cursor-pointer"
                                                                            >
                                                                                <Eye className="w-4 h-4 text-blue-600 shrink-0" />
                                                                                <span>Profile</span>
                                                                            </button>

                                                                            {isHeadOfficer && (
                                                                                <>
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            setActiveActionMenuId(null);
                                                                                            handleOpenEditPermissions(p);
                                                                                        }}
                                                                                        className="w-full px-3.5 py-2.5 text-left text-xs font-bold text-slate-700 hover:bg-purple-50 hover:text-purple-700 flex items-center gap-2.5 transition-colors cursor-pointer border-t border-slate-50"
                                                                                    >
                                                                                        <Shield className="w-4 h-4 text-purple-600 shrink-0" />
                                                                                        <span>Permissions</span>
                                                                                    </button>

                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            setActiveActionMenuId(null);
                                                                                            handleToggleStatus(p);
                                                                                        }}
                                                                                        disabled={updatingUserId === p.user_id}
                                                                                        className={`w-full px-3.5 py-2.5 text-left text-xs font-bold flex items-center gap-2.5 transition-colors cursor-pointer border-t border-slate-50 ${
                                                                                            isActive
                                                                                                ? 'text-rose-600 hover:bg-rose-50 hover:text-rose-700'
                                                                                                : 'text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800'
                                                                                        } ${updatingUserId === p.user_id ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                                                    >
                                                                                        {isActive ? (
                                                                                            <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                                                                                        ) : (
                                                                                            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                                                                                        )}
                                                                                        <span>
                                                                                            {updatingUserId === p.user_id 
                                                                                                ? 'Saving...' 
                                                                                                : isActive ? 'Set Inactive' : 'Set Active'}
                                                                                        </span>
                                                                                    </button>
                                                                                </>
                                                                            )}
                                                                        </div>
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
                        <div className="relative h-28 bg-gradient-to-r from-role via-amber-500 to-purple-600 p-4 flex justify-between items-start">
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
                                        <img loading="lazy" decoding="async" 
                                            src={getProfilePicture(viewingProfileUser.profile_picture)} 
                                            alt={viewingProfileUser.name}
                                            className="w-24 h-24 rounded-3xl object-cover border-4 border-white shadow-xl bg-white"
                                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                        />
                                    ) : (
                                        <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-role to-amber-500 text-white font-black text-2xl flex items-center justify-center border-4 border-white shadow-xl">
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
                                <p className="text-xs font-bold text-role-hover mt-0.5">
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
                                            className="text-[10px] font-bold text-role-hover hover:text-role-strong px-2.5 py-1 rounded-lg bg-role-soft hover:bg-role-muted transition-colors uppercase tracking-wider flex items-center gap-1 border border-role-border/60 cursor-pointer"
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
                                    className="px-5 py-2 bg-gradient-to-r from-role to-amber-500 hover:from-role-hover hover:to-amber-600 text-white font-black text-xs rounded-xl shadow-md uppercase tracking-wider transition-all active:scale-95 cursor-pointer"
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
                <div
                    className="fixed inset-0 z-[10000] flex items-stretch sm:items-center justify-center sm:p-4 bg-black/60 animate-in fade-in duration-200"
                    onClick={() => !isSubmitting && setIsAddModalOpen(false)}
                >
                    <div
                        ref={addDialogRef}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="register-staff-title"
                        aria-describedby="register-staff-desc"
                        onKeyDown={handleAddDialogKeyDown}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-white w-full sm:max-w-xl min-w-0 h-[100dvh] sm:h-auto sm:max-h-[90dvh] sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
                    >
                        {/* Header (stays put) */}
                        <div className="shrink-0 px-4 sm:px-6 pt-[max(0.75rem,env(safe-area-inset-top))] sm:pt-4 pb-3 border-b border-gray-100 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <h2 id="register-staff-title" className="text-lg font-black text-gray-900 leading-tight">Register Barangay Staff</h2>
                                <p id="register-staff-desc" className="text-xs text-gray-500 font-medium mt-0.5">Add personnel and assign operational permissions.</p>
                                <span className="inline-block mt-1.5 max-w-full px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide bg-role-soft text-role-strong border border-role-border break-words">
                                    Barangay {barangayName}
                                </span>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsAddModalOpen(false)}
                                disabled={isSubmitting}
                                aria-label="Close"
                                className="w-10 h-10 -mr-1.5 -mt-1 shrink-0 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleCreateStaff} className="flex-1 min-h-0 flex flex-col" noValidate={false}>
                            {/* Body (scrolls) */}
                            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4 flex flex-col gap-4">
                                {modalError && (
                                    <div role="alert" className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold rounded-xl flex items-start gap-2">
                                        <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-px" />
                                        <span className="min-w-0 break-words">{modalError}</span>
                                    </div>
                                )}

                                {/* Personal information */}
                                <section className="flex flex-col gap-3 min-w-0">
                                    <h3 className="text-sm font-black text-gray-900">Personal information</h3>
                                    <div className="min-w-0">
                                        <label htmlFor="staff-name" className="block text-xs font-bold text-gray-700 mb-1">
                                            Full name <span className="text-rose-500" aria-hidden="true">*</span>
                                        </label>
                                        <input
                                            id="staff-name"
                                            type="text"
                                            required
                                            aria-required="true"
                                            placeholder="e.g., Juan Dela Cruz"
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            className="w-full min-w-0 h-11 px-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-role/20 focus:border-role/40 transition-colors"
                                        />
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
                                        <div className="min-w-0">
                                            <label htmlFor="staff-email" className="block text-xs font-bold text-gray-700 mb-1">
                                                Email address <span className="text-rose-500" aria-hidden="true">*</span>
                                            </label>
                                            <input
                                                id="staff-email"
                                                type="email"
                                                required
                                                aria-required="true"
                                                autoComplete="off"
                                                placeholder="staff@barangay.gov"
                                                value={formData.email}
                                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                                className="w-full min-w-0 h-11 px-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-role/20 focus:border-role/40 transition-colors"
                                            />
                                        </div>
                                        <div className="min-w-0">
                                            <label htmlFor="staff-phone" className="block text-xs font-bold text-gray-700 mb-1">
                                                Phone number <span className="font-semibold text-gray-400">(optional)</span>
                                            </label>
                                            <PhoneInput
                                                id="staff-phone"
                                                placeholder="0917-xxx-xxxx"
                                                value={formData.phone}
                                                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                                className="w-full min-w-0 h-11 px-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-role/20 focus:border-role/40 transition-colors"
                                            />
                                        </div>
                                    </div>

                                    {/* Password is set by the staff member through an emailed code */}
                                    <p className="flex items-start gap-2 px-3 py-2.5 bg-role-soft/60 border border-role-border/70 rounded-xl text-xs text-gray-700 leading-relaxed">
                                        <Mail className="w-4 h-4 text-role-hover shrink-0 mt-px" aria-hidden="true" />
                                        <span>
                                            <b className="text-gray-900">No password needed.</b> A setup code is emailed to this address so they can create their own password. It also confirms the email is theirs, so check the spelling.
                                        </span>
                                    </p>
                                </section>

                                {/* Role and access */}
                                <section className="flex flex-col gap-3 pt-4 border-t border-gray-100 min-w-0">
                                    <h3 className="text-sm font-black text-gray-900">Role & access</h3>

                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 mb-1">
                                            <label htmlFor="staff-position" className="text-xs font-bold text-gray-700">Staff position / designation</label>
                                            <button
                                                type="button"
                                                onClick={() => setIsCustomPosition(!isCustomPosition)}
                                                className="h-8 px-1 -mr-1 text-xs text-role-hover font-bold hover:underline cursor-pointer"
                                            >
                                                {isCustomPosition ? '← Standard positions' : '+ Custom position'}
                                            </button>
                                        </div>
                                        {isCustomPosition ? (
                                            <input
                                                id="staff-position"
                                                type="text"
                                                placeholder="e.g., Lead Rescue Driver / Animal Handler"
                                                value={formData.customPosition}
                                                onChange={(e) => setFormData({ ...formData, customPosition: e.target.value })}
                                                className="w-full min-w-0 h-11 px-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-role/20 focus:border-role/40 transition-colors"
                                            />
                                        ) : (
                                            <div className="relative min-w-0">
                                                <select
                                                    id="staff-position"
                                                    value={formData.position}
                                                    onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                                                    className="w-full min-w-0 h-11 px-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-role/20 focus:border-role/40 transition-colors pr-9 appearance-none cursor-pointer truncate"
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
                                                <svg className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                                                    <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" />
                                                </svg>
                                            </div>
                                        )}
                                    </div>

                                    {/* Head Officer designation (same as the Admin form): the server's one authority flag */}
                                    <HeadOfficerToggle
                                        checked={formData.is_head_officer}
                                        barangayName={barangayName}
                                        onChange={(on) => setFormData({ ...formData, is_head_officer: on, has_tactical_command: on, has_command_dispatch: on })}
                                    />

                                    <fieldset className="min-w-0">
                                        <legend className="block text-xs font-bold text-gray-700 mb-1">Initial account status</legend>
                                        <div className="grid grid-cols-2 gap-1 p-1 bg-gray-100 rounded-xl">
                                            <button
                                                type="button"
                                                aria-pressed={formData.status === 'Active'}
                                                onClick={() => setFormData({ ...formData, status: 'Active' })}
                                                className={`h-10 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                                                    formData.status === 'Active' ? 'bg-white text-emerald-700 shadow-2xs ring-1 ring-emerald-200' : 'text-gray-500 hover:text-gray-800'
                                                }`}
                                            >
                                                <span className="w-2 h-2 rounded-full bg-emerald-500" aria-hidden="true" /> Active / Ready
                                            </button>
                                            <button
                                                type="button"
                                                aria-pressed={formData.status === 'Inactive'}
                                                onClick={() => setFormData({ ...formData, status: 'Inactive' })}
                                                className={`h-10 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                                                    formData.status === 'Inactive' ? 'bg-white text-slate-800 shadow-2xs ring-1 ring-slate-300' : 'text-gray-500 hover:text-gray-800'
                                                }`}
                                            >
                                                <span className="w-2 h-2 rounded-full bg-slate-400" aria-hidden="true" /> Inactive / Off Duty
                                            </button>
                                        </div>
                                    </fieldset>
                                </section>
                            </div>

                            {/* Footer (stays at the bottom, above the phone's home bar and the keyboard) */}
                            <div className="shrink-0 border-t border-gray-100 bg-white px-4 sm:px-6 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] grid grid-cols-2 sm:flex sm:justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setIsAddModalOpen(false)}
                                    disabled={isSubmitting}
                                    className="h-11 px-4 rounded-xl border border-gray-300 bg-white text-gray-700 font-bold text-sm hover:bg-gray-50 disabled:opacity-50 transition-colors cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    aria-busy={isSubmitting}
                                    className="h-11 px-5 bg-role hover:bg-role-hover text-white rounded-xl font-black text-sm shadow-sm disabled:opacity-60 disabled:cursor-not-allowed transition-colors cursor-pointer"
                                >
                                    {isSubmitting ? 'Registering…' : 'Register Staff'}
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
                            <HeadOfficerToggle
                                checked={formData.is_head_officer}
                                barangayName={barangayName}
                                onChange={(on) => setFormData({ ...formData, is_head_officer: on, has_tactical_command: on, has_command_dispatch: on })}
                            />

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

            <NoticeModal
                isOpen={Boolean(resultNotice)}
                variant={resultNotice?.variant}
                title={resultNotice?.title || ''}
                message={resultNotice?.message || ''}
                onClose={() => setResultNotice(null)}
            />
        </div>
    );
};

export default BrgyPersonnelManagement;

// The Admin form's "Designate as Barangay Head Officer (In Charge)" switch: Head Officer is the one authority flag the
// server checks (tactical command, team dispatch and sign-off together).
function HeadOfficerToggle({ checked, onChange, barangayName }: { checked: boolean; onChange: (on: boolean) => void; barangayName: string }) {
    return (
        <label className={`flex items-start justify-between gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${checked ? 'bg-amber-50 border-amber-300' : 'bg-white border-gray-200 hover:border-gray-300'}`}>
            <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-bold text-gray-900">Designate as Barangay Head Officer</span>
                    <span className="px-1.5 py-px rounded-full text-[10px] font-black uppercase tracking-wide bg-amber-100 text-amber-800 border border-amber-200">Elevated authority</span>
                </span>
                <span className="block text-xs text-gray-600 mt-0.5 leading-snug">
                    Gives this account tactical command, team dispatch, and administrative sign-off authority for Barangay {barangayName}.
                </span>
            </span>
            <span className="relative inline-flex items-center shrink-0 mt-0.5">
                <input
                    type="checkbox"
                    role="switch"
                    aria-checked={checked}
                    checked={checked}
                    onChange={(e) => onChange(e.target.checked)}
                    className="sr-only peer"
                />
                <span className="w-11 h-6 bg-gray-200 rounded-full peer-focus-visible:ring-2 peer-focus-visible:ring-role/40 peer-checked:bg-role transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:shadow after:transition-transform peer-checked:after:translate-x-5" aria-hidden="true"></span>
            </span>
        </label>
    );
}
