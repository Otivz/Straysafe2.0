import { useState, useEffect } from 'react';
import BrgySidebar from '../../components/BrgySidebar';
import BrgyNavbar from '../../components/Navbars/BrgyNavbar';
import { api } from '../../utils/api';

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
        // Merged Authority & Permissions for Barangay
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

    const handleCopyEmail = (email: string) => {
        navigator.clipboard.writeText(email);
        setCopiedEmail(true);
        setTimeout(() => setCopiedEmail(false), 2000);
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
        if (!path) return 'https://ui-avatars.com/api/?name=User&background=F97316&color=fff';
        return path.startsWith('http') ? path : `http://localhost:8000/${path}`;
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
                />

                <div className="flex-1 overflow-y-auto w-full scroll-smooth">
                    <div className="max-w-[1400px] mx-auto w-full p-4 sm:p-6 lg:p-8 space-y-6">
                        
                        {/* Page Header */}
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                            <div>
                                <div className="flex items-center gap-2.5 flex-wrap">
                                    <h1 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">
                                        {isHeadOfficer ? 'Personnel Management & Command' : 'Barangay Personnel Directory'}
                                    </h1>
                                    <span className="px-2.5 py-1 bg-orange-100 text-[#EA580C] text-[10px] font-black rounded-lg border border-orange-200 uppercase tracking-wider">
                                        📍 Brgy. {barangayName}
                                    </span>
                                    {isHeadOfficer ? (
                                        <span className="px-2.5 py-1 bg-purple-100 text-purple-700 text-[10px] font-black rounded-lg border border-purple-200 uppercase tracking-wider">
                                            👑 Higher-Level Authority
                                        </span>
                                    ) : (
                                        <span className="px-2.5 py-1 bg-blue-50 text-blue-600 text-[10px] font-bold rounded-lg border border-blue-100 uppercase tracking-wider flex items-center gap-1">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                                                <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                                                <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                                            </svg>
                                            View-Only Access
                                        </span>
                                    )}
                                </div>
                                <p className="text-sm font-bold text-gray-400 mt-1 uppercase tracking-widest">
                                    {isHeadOfficer 
                                        ? `Manage, register, view profiles, and assign operational authority for Barangay ${barangayName}` 
                                        : `View active personnel and team profiles in Barangay ${barangayName}`}
                                </p>
                            </div>

                            {/* Header Actions */}
                            <div className="flex items-center gap-3">
                                {isHeadOfficer ? (
                                    <button
                                        onClick={handleOpenAddModal}
                                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#F97316] hover:bg-[#EA580C] text-white font-bold text-xs rounded-2xl shadow-lg shadow-orange-500/20 hover:shadow-orange-500/30 transition-all cursor-pointer uppercase tracking-wider active:scale-95"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                                        </svg>
                                        Add Barangay Staff
                                    </button>
                                ) : (
                                    <div className="bg-amber-50 border border-amber-200/60 rounded-2xl p-2.5 px-4 flex items-center gap-2.5">
                                        <span className="text-sm">ℹ️</span>
                                        <p className="text-xs text-amber-800 font-medium">
                                            Only Officers with higher authority can register or modify staff permissions.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Summary KPI Cards */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            {/* Total Personnel */}
                            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex items-center justify-between">
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Total Personnel</p>
                                    <h3 className="text-2xl font-black text-gray-900 mt-1">{totalCount}</h3>
                                </div>
                                <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                                        <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                                    </svg>
                                </div>
                            </div>

                            {/* Active Personnel */}
                            <div 
                                onClick={() => setStatusFilter('ACTIVE')}
                                className={`p-5 rounded-2xl border transition-all cursor-pointer shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex items-center justify-between ${
                                    statusFilter === 'ACTIVE' 
                                        ? 'bg-green-50/70 border-green-300 ring-2 ring-green-100' 
                                        : 'bg-white border-gray-100 hover:border-green-200'
                                }`}
                            >
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-green-500 animate-ping" />
                                        <p className="text-[10px] font-black uppercase tracking-widest text-green-700">Active / On Duty</p>
                                    </div>
                                    <h3 className="text-2xl font-black text-green-700 mt-1">{activeCount}</h3>
                                </div>
                                <div className="w-12 h-12 bg-green-100 text-green-600 rounded-2xl flex items-center justify-center font-bold">
                                    🟢
                                </div>
                            </div>

                            {/* Inactive Personnel */}
                            <div 
                                onClick={() => setStatusFilter('INACTIVE')}
                                className={`p-5 rounded-2xl border transition-all cursor-pointer shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex items-center justify-between ${
                                    statusFilter === 'INACTIVE' 
                                        ? 'bg-rose-50/70 border-rose-300 ring-2 ring-rose-100' 
                                        : 'bg-white border-gray-100 hover:border-rose-200'
                                }`}
                            >
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Inactive / Off Duty</p>
                                    <h3 className="text-2xl font-black text-gray-700 mt-1">{inactiveCount}</h3>
                                </div>
                                <div className="w-12 h-12 bg-gray-100 text-gray-500 rounded-2xl flex items-center justify-center font-bold">
                                    ⚪
                                </div>
                            </div>
                        </div>

                        {/* Search & Filter Controls */}
                        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="relative flex-1 max-w-md">
                                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                </span>
                                <input
                                    type="text"
                                    placeholder="Search by name, position, email, phone..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50/70 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                                />
                            </div>

                            {/* Status Filter Tabs */}
                            <div className="flex items-center gap-1.5 bg-gray-50 p-1 rounded-xl border border-gray-100 self-start md:self-auto">
                                <button
                                    onClick={() => setStatusFilter('ALL')}
                                    className={`px-3.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                                        statusFilter === 'ALL'
                                            ? 'bg-white text-gray-900 shadow-sm'
                                            : 'text-gray-400 hover:text-gray-700'
                                    }`}
                                >
                                    All ({totalCount})
                                </button>
                                <button
                                    onClick={() => setStatusFilter('ACTIVE')}
                                    className={`px-3.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                                        statusFilter === 'ACTIVE'
                                            ? 'bg-green-600 text-white shadow-sm'
                                            : 'text-green-700 hover:bg-green-50'
                                    }`}
                                >
                                    Active ({activeCount})
                                </button>
                                <button
                                    onClick={() => setStatusFilter('INACTIVE')}
                                    className={`px-3.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                                        statusFilter === 'INACTIVE'
                                            ? 'bg-gray-700 text-white shadow-sm'
                                            : 'text-gray-500 hover:bg-gray-100'
                                    }`}
                                >
                                    Inactive ({inactiveCount})
                                </button>
                            </div>
                        </div>

                        {/* Personnel Table */}
                        <div className="bg-white rounded-3xl shadow-[0_2px_14px_rgba(0,0,0,0.02)] overflow-hidden border border-gray-100">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse min-w-[850px]">
                                    <thead>
                                        <tr className="border-b border-gray-100 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50/50">
                                            <th className="py-4 pl-6">Personnel</th>
                                            <th className="py-4">Role / Position</th>
                                            <th className="py-4 min-w-[280px]">Assigned Authority & Permissions</th>
                                            <th className="py-4">Contact Details</th>
                                            <th className="py-4">Status</th>
                                            <th className="py-4 pr-6 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50 text-xs">
                                        {loading ? (
                                            [...Array(4)].map((_, i) => (
                                                <tr key={i} className="animate-pulse">
                                                    <td className="py-4 pl-6 flex items-center gap-3">
                                                        <div className="w-10 h-10 bg-gray-200 rounded-full" />
                                                        <div className="w-28 h-4 bg-gray-200 rounded" />
                                                    </td>
                                                    <td className="py-4"><div className="w-24 h-4 bg-gray-200 rounded" /></td>
                                                    <td className="py-4"><div className="w-48 h-6 bg-gray-200 rounded-lg" /></td>
                                                    <td className="py-4"><div className="w-36 h-4 bg-gray-200 rounded" /></td>
                                                    <td className="py-4"><div className="w-20 h-6 bg-gray-200 rounded-lg" /></td>
                                                    <td className="py-4 pr-6 text-right"><div className="w-24 h-6 bg-gray-200 rounded-lg ml-auto" /></td>
                                                </tr>
                                            ))
                                        ) : filteredPersonnel.length === 0 ? (
                                            <tr>
                                                <td colSpan={6} className="py-12 text-center text-gray-400 font-bold">
                                                    No personnel found matching the selected filter in Barangay {barangayName}.
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredPersonnel.map(p => {
                                                const isActive = (p.status || '').toLowerCase() === 'active';
                                                const perms = getUserPermissions(p);
                                                const hasAnyAuthority = perms.tactical_command || perms.command_dispatch || Boolean(p.is_head_officer || p.role_id === 5);

                                                return (
                                                    <tr key={p.user_id} className="hover:bg-gray-50/60 transition-colors group">
                                                        <td className="py-4 pl-6">
                                                            <div 
                                                                onClick={() => handleOpenViewProfile(p)}
                                                                className="flex items-center gap-3 cursor-pointer"
                                                            >
                                                                <div className="relative shrink-0">
                                                                    <img 
                                                                        src={getProfilePicture(p.profile_picture)} 
                                                                        alt={p.name} 
                                                                        className="w-10 h-10 rounded-full object-cover border border-gray-100 shadow-sm group-hover:ring-2 group-hover:ring-orange-400 transition-all"
                                                                        onError={(e) => { e.currentTarget.src = 'https://ui-avatars.com/api/?name=User'; }}
                                                                    />
                                                                    <span 
                                                                        className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${
                                                                            isActive ? 'bg-green-500' : 'bg-gray-400'
                                                                        }`} 
                                                                    />
                                                                </div>
                                                                <div className="flex flex-col">
                                                                    <div className="flex items-center gap-1.5">
                                                                        <span className="font-bold text-gray-900 text-sm group-hover:text-orange-600 transition-colors">
                                                                            {p.name}
                                                                        </span>
                                                                        {hasAnyAuthority && (
                                                                            <span className="text-[9px] px-1.5 py-0.5 bg-purple-100 text-purple-700 font-black rounded border border-purple-200 uppercase tracking-tighter">
                                                                                ★ Officer
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <span className="text-[11px] text-gray-400 font-medium">User ID: #{p.user_id}</span>
                                                                </div>
                                                            </div>
                                                        </td>

                                                        <td className="py-4">
                                                            <div className="flex flex-col">
                                                                <span className="font-bold text-gray-800">
                                                                    {p.position_name || (hasAnyAuthority ? 'Barangay Officer' : 'Field Staff')}
                                                                </span>
                                                                <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">
                                                                    {hasAnyAuthority ? 'Command Staff' : 'Operations Staff'}
                                                                </span>
                                                            </div>
                                                        </td>

                                                        {/* Assigned Authority Column */}
                                                        <td className="py-4">
                                                            {hasAnyAuthority ? (
                                                                <div className="flex flex-wrap items-center gap-1.5 max-w-[340px]">
                                                                    {perms.tactical_command && (
                                                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-50 text-purple-800 rounded-lg text-[10px] font-black border border-purple-200 shadow-sm">
                                                                            <span>⚡</span> Tactical Command
                                                                        </span>
                                                                    )}
                                                                    {perms.command_dispatch && (
                                                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 text-indigo-800 rounded-lg text-[10px] font-black border border-indigo-200 shadow-sm">
                                                                            <span>🛡️</span> Command & Dispatch
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            ) : (
                                                                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-[10px] font-bold border border-slate-200">
                                                                    <span>🛡️</span> Field Operations & Logs
                                                                </span>
                                                            )}
                                                        </td>

                                                        <td className="py-4">
                                                            <div className="flex flex-col gap-0.5">
                                                                <span className="text-gray-700 font-medium">{p.email}</span>
                                                                <span className="text-gray-400 font-mono text-[11px]">{p.phone || '—'}</span>
                                                            </div>
                                                        </td>

                                                        <td className="py-4">
                                                            {isActive ? (
                                                                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-50 text-green-700 rounded-lg text-[10px] font-black uppercase tracking-wider border border-green-200">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                                                    Active
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-gray-100 text-gray-600 rounded-lg text-[10px] font-bold uppercase tracking-wider border border-gray-200">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                                                                    {p.status || 'Inactive'}
                                                                </span>
                                                            )}
                                                        </td>

                                                        <td className="py-4 pr-6 text-right">
                                                            <div className="flex items-center justify-end gap-1.5">
                                                                {/* View Profile Button */}
                                                                <button
                                                                    onClick={() => handleOpenViewProfile(p)}
                                                                    className="px-2.5 py-1.5 rounded-xl text-[10px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-all uppercase tracking-wider flex items-center gap-1"
                                                                >
                                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10z" />
                                                                    </svg>
                                                                    Profile
                                                                </button>

                                                                {/* Head Officer Actions */}
                                                                {isHeadOfficer && (
                                                                    <>
                                                                        <button
                                                                            onClick={() => handleOpenEditPermissions(p)}
                                                                            className="px-2.5 py-1.5 rounded-xl text-[10px] font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 transition-all uppercase tracking-wider"
                                                                        >
                                                                            Permissions
                                                                        </button>
                                                                        <button
                                                                            onClick={() => handleToggleStatus(p)}
                                                                            disabled={updatingUserId === p.user_id}
                                                                            className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                                                                                isActive
                                                                                    ? 'bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200'
                                                                                    : 'bg-green-50 text-green-700 hover:bg-green-100 border border-green-200'
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
            </main>

            {/* VIEW PERSONNEL PROFILE MODAL */}
            {isViewProfileOpen && viewingProfileUser && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#0F172A]/75 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-200">
                        {/* Profile Card Header with Cover banner */}
                        <div className="relative h-28 bg-gradient-to-r from-orange-500 via-amber-500 to-purple-600 p-4 flex justify-between items-start">
                            <span className="px-3 py-1 bg-black/20 backdrop-blur-md text-white text-[10px] font-black rounded-lg uppercase tracking-wider">
                                Barangay {barangayName} Roster
                            </span>
                            <button
                                onClick={() => setIsViewProfileOpen(false)}
                                className="w-8 h-8 rounded-full bg-black/20 hover:bg-black/40 backdrop-blur-md flex items-center justify-center text-white transition-colors"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Profile Body */}
                        <div className="px-6 pb-6 pt-0 relative">
                            {/* Avatar & Key details */}
                            <div className="flex flex-col sm:flex-row items-center sm:items-end justify-between -mt-12 mb-4 gap-3">
                                <div className="relative">
                                    <img 
                                        src={getProfilePicture(viewingProfileUser.profile_picture)} 
                                        alt={viewingProfileUser.name}
                                        className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-xl bg-white"
                                        onError={(e) => { e.currentTarget.src = 'https://ui-avatars.com/api/?name=User'; }}
                                    />
                                    <span 
                                        className={`absolute bottom-1 right-1 w-5 h-5 rounded-full border-2 border-white ${
                                            (viewingProfileUser.status || '').toLowerCase() === 'active' 
                                                ? 'bg-green-500 ring-2 ring-green-200' 
                                                : 'bg-gray-400'
                                        }`} 
                                    />
                                </div>

                                <div className="flex items-center gap-2">
                                    {(viewingProfileUser.status || '').toLowerCase() === 'active' ? (
                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-50 text-green-700 rounded-full text-xs font-black uppercase tracking-wider border border-green-200">
                                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                            Active On Duty
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-bold uppercase tracking-wider border border-gray-200">
                                            <span className="w-2 h-2 rounded-full bg-gray-400" />
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
                                <h2 className="text-xl font-black text-gray-900 tracking-tight">
                                    {viewingProfileUser.name}
                                </h2>
                                <p className="text-xs font-bold text-orange-600 mt-0.5">
                                    {viewingProfileUser.position_name || 'Barangay Staff'}
                                </p>
                                <p className="text-[11px] text-gray-400 font-medium">User ID: #{viewingProfileUser.user_id} • Assigned to Barangay {barangayName}</p>
                            </div>

                            {/* Information Tabs / Cards */}
                            <div className="space-y-3">
                                {/* Contact Card */}
                                <div className="bg-gray-50/70 border border-gray-200/70 rounded-2xl p-4 space-y-2.5">
                                    <h4 className="text-[10px] font-black uppercase tracking-wider text-gray-400">Contact Information</h4>
                                    
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2.5 text-xs text-gray-700">
                                            <span className="text-gray-400">✉️</span>
                                            <span className="font-semibold">{viewingProfileUser.email}</span>
                                        </div>
                                        <button
                                            onClick={() => handleCopyEmail(viewingProfileUser.email)}
                                            className="text-[10px] font-bold text-orange-600 hover:text-orange-700 px-2 py-0.5 rounded bg-orange-50 hover:bg-orange-100 transition-colors uppercase tracking-wider"
                                        >
                                            {copiedEmail ? 'Copied!' : 'Copy'}
                                        </button>
                                    </div>

                                    <div className="flex items-center gap-2.5 text-xs text-gray-700">
                                        <span className="text-gray-400">📞</span>
                                        <span className="font-semibold font-mono">{viewingProfileUser.phone || 'No phone number provided'}</span>
                                    </div>
                                </div>

                                {/* Authority & Operational Permissions */}
                                {(() => {
                                    const perms = getUserPermissions(viewingProfileUser);
                                    return (
                                        <div className="bg-gradient-to-br from-purple-50/40 via-indigo-50/30 to-amber-50/30 border border-purple-100 rounded-2xl p-4 space-y-2">
                                            <h4 className="text-[10px] font-black uppercase tracking-wider text-purple-900">
                                                Operational Authority in Barangay {barangayName}
                                            </h4>

                                            <div className="space-y-1.5 pt-1">
                                                <div className="flex items-center justify-between p-2 rounded-xl bg-white border border-gray-100 text-xs">
                                                    <div className="flex items-center gap-2">
                                                        <span>⚡</span>
                                                        <div>
                                                            <span className="font-bold text-gray-800">Tactical Command</span>
                                                            <p className="text-[10px] text-gray-400 font-medium">Field Operations & Evidence Capture</p>
                                                        </div>
                                                    </div>
                                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded ${
                                                        perms.tactical_command
                                                            ? 'bg-purple-100 text-purple-700'
                                                            : 'bg-gray-100 text-gray-400'
                                                    }`}>
                                                        {perms.tactical_command ? 'Authorized' : 'Not Granted'}
                                                    </span>
                                                </div>

                                                <div className="flex items-center justify-between p-2 rounded-xl bg-white border border-gray-100 text-xs">
                                                    <div className="flex items-center gap-2">
                                                        <span>🛡️</span>
                                                        <div>
                                                            <span className="font-bold text-gray-800">Command & Dispatch</span>
                                                            <p className="text-[10px] text-gray-400 font-medium">Team Assignment, Intake & Final Sign-off</p>
                                                        </div>
                                                    </div>
                                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded ${
                                                        perms.command_dispatch
                                                            ? 'bg-indigo-100 text-indigo-800'
                                                            : 'bg-gray-100 text-gray-400'
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
                            <div className="pt-4 mt-4 border-t border-gray-100 flex items-center justify-between">
                                {isHeadOfficer ? (
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => {
                                                setIsViewProfileOpen(false);
                                                handleOpenEditPermissions(viewingProfileUser);
                                            }}
                                            className="px-3 py-2 bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-xl text-xs font-bold border border-purple-200 uppercase tracking-wider transition-colors"
                                        >
                                            Edit Permissions
                                        </button>
                                        <button
                                            onClick={() => handleToggleStatus(viewingProfileUser)}
                                            className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors"
                                        >
                                            Toggle Status
                                        </button>
                                    </div>
                                ) : (
                                    <div className="text-[10px] text-gray-400 font-medium">
                                        Barangay Staff Verified Profile
                                    </div>
                                )}

                                <button
                                    onClick={() => setIsViewProfileOpen(false)}
                                    className="px-5 py-2 bg-[#F97316] hover:bg-[#EA580C] text-white font-black text-xs rounded-xl shadow-md uppercase tracking-wider transition-all active:scale-95"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ADD PERSONNEL MODAL (HEAD OFFICER ONLY) */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#0F172A]/70 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
                    <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 max-w-xl w-full overflow-hidden animate-in zoom-in-95 duration-200 my-8">
                        {/* Modal Header */}
                        <div className="p-6 bg-gradient-to-r from-orange-500 to-amber-500 text-white flex items-center justify-between">
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
                                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Modal Body */}
                        <form onSubmit={handleCreateStaff} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
                            {modalError && (
                                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-bold rounded-xl flex items-center gap-2">
                                    <span>⚠️</span>
                                    <span>{modalError}</span>
                                </div>
                            )}

                            {/* Full Name */}
                            <div>
                                <label className="block text-[11px] font-black text-gray-700 uppercase tracking-wider mb-1">
                                    Full Name <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g., Juan Dela Cruz"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                                />
                            </div>

                            {/* Email & Phone */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[11px] font-black text-gray-700 uppercase tracking-wider mb-1">
                                        Email Address <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="email"
                                        required
                                        placeholder="staff@barangay.gov"
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[11px] font-black text-gray-700 uppercase tracking-wider mb-1">
                                        Phone Number
                                    </label>
                                    <input
                                        type="tel"
                                        placeholder="0917-xxx-xxxx"
                                        value={formData.phone}
                                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                                    />
                                </div>
                            </div>

                            {/* Password */}
                            <div>
                                <label className="block text-[11px] font-black text-gray-700 uppercase tracking-wider mb-1">
                                    Initial Password <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="password"
                                    required
                                    placeholder="Enter temporary password"
                                    value={formData.password}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                                />
                            </div>

                            {/* Staff Position Selection */}
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="text-[11px] font-black text-gray-700 uppercase tracking-wider">
                                        Staff Position / Designation
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => setIsCustomPosition(!isCustomPosition)}
                                        className="text-[10px] text-orange-600 font-black hover:underline"
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
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                                    />
                                ) : (
                                    <select
                                        value={formData.position}
                                        onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
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

                            {/* Assigned Authority & Permissions for Barangay San Vicente */}
                            <div className="bg-gradient-to-br from-orange-50/70 via-amber-50/40 to-purple-50/50 border border-orange-200/70 rounded-2xl p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="text-base">🛡️</span>
                                        <div>
                                            <h4 className="text-xs font-black text-gray-900 uppercase tracking-wider">
                                                Authority & Permissions Matrix
                                            </h4>
                                            <p className="text-[10px] text-gray-500 font-medium">
                                                Grant operational responsibilities for Barangay {barangayName}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <button
                                            type="button"
                                            onClick={() => handleGrantAllPermissions(true)}
                                            className="px-2 py-0.5 bg-purple-600 text-white rounded text-[9px] font-black uppercase hover:bg-purple-700 transition-colors"
                                        >
                                            Grant All
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleGrantAllPermissions(false)}
                                            className="px-2 py-0.5 bg-gray-200 text-gray-700 rounded text-[9px] font-bold uppercase hover:bg-gray-300 transition-colors"
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
                                            : 'bg-white border-gray-200 hover:border-gray-300'
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
                                                <span className="text-xs font-black text-gray-900">⚡ Tactical Command</span>
                                                <span className="text-[9px] font-bold text-purple-700 bg-purple-100 px-1.5 py-0.2 rounded">Field Operations</span>
                                            </div>
                                            <p className="text-[10px] text-gray-500 mt-0.5">
                                                Operates the report in the field (on-site animal pickup, secures animal, uploads photo evidence, and updates field progress).
                                            </p>
                                        </div>
                                    </label>

                                    {/* 2. Command & Dispatch (Merged) */}
                                    <label className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                                        formData.has_command_dispatch 
                                            ? 'bg-indigo-50/80 border-indigo-300 ring-1 ring-indigo-200' 
                                            : 'bg-white border-gray-200 hover:border-gray-300'
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
                                                <span className="text-xs font-black text-gray-900">🛡️ Command & Dispatch</span>
                                                <span className="text-[9px] font-bold text-indigo-700 bg-indigo-100 px-1.5 py-0.2 rounded">Desk & Sign-off</span>
                                            </div>
                                            <p className="text-[10px] text-gray-500 mt-0.5">
                                                Assigns rescue teams to cases, coordinates pickups, authorizes shelter holding intake, and issues the official <b>Final Resolved</b> sign-off.
                                            </p>
                                        </div>
                                    </label>
                                </div>
                            </div>

                            {/* Initial Status */}
                            <div>
                                <label className="block text-[11px] font-black text-gray-700 uppercase tracking-wider mb-1">
                                    Initial Account Status
                                </label>
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, status: 'Active' })}
                                        className={`py-2 px-3 rounded-xl text-xs font-bold border flex items-center justify-center gap-2 transition-all ${
                                            formData.status === 'Active'
                                                ? 'bg-green-50 border-green-300 text-green-700 ring-2 ring-green-100'
                                                : 'bg-gray-50 border-gray-200 text-gray-500'
                                        }`}
                                    >
                                        <span>🟢</span> Active / Ready
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, status: 'Inactive' })}
                                        className={`py-2 px-3 rounded-xl text-xs font-bold border flex items-center justify-center gap-2 transition-all ${
                                            formData.status === 'Inactive'
                                                ? 'bg-rose-50 border-rose-300 text-rose-700 ring-2 ring-rose-100'
                                                : 'bg-gray-50 border-gray-200 text-gray-500'
                                        }`}
                                    >
                                        <span>⚪</span> Inactive / Off Duty
                                    </button>
                                </div>
                            </div>

                            {/* Modal Actions */}
                            <div className="pt-3 flex items-center justify-end gap-3 border-t border-gray-100">
                                <button
                                    type="button"
                                    onClick={() => setIsAddModalOpen(false)}
                                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-gray-500 hover:bg-gray-100 transition-colors uppercase tracking-wider"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className={`px-6 py-2.5 bg-[#F97316] hover:bg-[#EA580C] text-white font-black text-xs rounded-xl shadow-lg shadow-orange-500/20 uppercase tracking-wider transition-all ${
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

            {/* EDIT PERMISSIONS MODAL */}
            {isEditModalOpen && editingUser && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#0F172A]/70 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6 bg-gradient-to-r from-purple-600 to-indigo-600 text-white flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-black tracking-tight">Manage Staff Permissions</h2>
                                <p className="text-xs text-purple-100 font-medium mt-0.5">
                                    Configuring authority for {editingUser.name} in Barangay {barangayName}
                                </p>
                            </div>
                            <button
                                onClick={() => setIsEditModalOpen(false)}
                                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleSavePermissions} className="p-6 space-y-4">
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-xs font-black text-gray-700 uppercase tracking-wider">
                                        Assign Permissions & Responsibilities
                                    </h4>
                                    <div className="flex items-center gap-1.5">
                                        <button
                                            type="button"
                                            onClick={() => handleGrantAllPermissions(true)}
                                            className="px-2 py-0.5 bg-purple-600 text-white rounded text-[9px] font-black uppercase hover:bg-purple-700 transition-colors"
                                        >
                                            Grant All
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleGrantAllPermissions(false)}
                                            className="px-2 py-0.5 bg-gray-200 text-gray-700 rounded text-[9px] font-bold uppercase hover:bg-gray-300 transition-colors"
                                        >
                                            Clear
                                        </button>
                                    </div>
                                </div>

                                <label className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                                    formData.has_tactical_command 
                                        ? 'bg-purple-50/80 border-purple-300 ring-1 ring-purple-200' 
                                        : 'bg-white border-gray-200 hover:border-gray-300'
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
                                    <div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-black text-gray-900">⚡ Tactical Command</span>
                                            <span className="text-[9px] font-bold text-purple-700 bg-purple-100 px-1.5 py-0.2 rounded">Field Operations</span>
                                        </div>
                                        <p className="text-[10px] text-gray-500 mt-0.5">
                                            Operates the report in the field (on-site animal pickup, secures animal, uploads photo evidence, and updates field progress).
                                        </p>
                                    </div>
                                </label>

                                <label className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                                    formData.has_command_dispatch 
                                        ? 'bg-indigo-50/80 border-indigo-300 ring-1 ring-indigo-200' 
                                        : 'bg-white border-gray-200 hover:border-gray-300'
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
                                    <div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-black text-gray-900">🛡️ Command & Dispatch</span>
                                            <span className="text-[9px] font-bold text-indigo-700 bg-indigo-100 px-1.5 py-0.2 rounded">Desk & Sign-off</span>
                                        </div>
                                        <p className="text-[10px] text-gray-500 mt-0.5">
                                            Assigns rescue teams to cases, coordinates pickups, authorizes shelter holding intake, and issues the official <b>Final Resolved</b> sign-off.
                                        </p>
                                    </div>
                                </label>
                            </div>

                            <div className="pt-3 flex items-center justify-end gap-3 border-t border-gray-100">
                                <button
                                    type="button"
                                    onClick={() => setIsEditModalOpen(false)}
                                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-gray-500 hover:bg-gray-100 transition-colors uppercase tracking-wider"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className={`px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-black text-xs rounded-xl shadow-lg shadow-purple-500/20 uppercase tracking-wider transition-all ${
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
