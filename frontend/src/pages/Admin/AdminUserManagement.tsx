import { useState, useEffect, useRef } from 'react';
import { api } from '../../utils/api';
import AdminSidebar from '../../components/AdminSidebar';
import AdminNavbar from '../../components/Navbars/AdminNavbar';
import SuccessModal from '../../components/Modals/SuccessModal';
import Button from '../../components/Button';
import Select from '../../components/Dropdown';
import DataTable from '../../components/DataTable';

interface User {
    user_id: number;
    name: string;
    email: string;
    phone: string | null;
    role_id: number;
    subdivision_id: number | null;
    barangay_id: number | null;
    is_head_officer: boolean;
    barangay: string;
    city: string;
    address: string | null;
    position: string | null;
    barangay_name?: string | null;
    position_name?: string | null;
    status: string;
    is_verified: boolean;
    created_at: string;
}

const AdminUserManagement = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [roleFilter, setRoleFilter] = useState<number | 'all'>('all');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [showSuccess, setShowSuccess] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');
    const [openMenuId, setOpenMenuId] = useState<number | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

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
        name: '',
        email: '',
        password: '',
        phone: '',
        role_id: 1,
        barangay_id: 1,
        is_head_officer: false,
        barangay: 'San Vicente',
        city: 'Santa Maria, Bulacan',
        address: '',
        position: '',
        subdivision_id: '1',
        status: 'Active'
    });

    const [dynamicPositions, setDynamicPositions] = useState<{position_id: number, position_name: string}[]>([]);
    
    const API_URL = '/users';

    const fetchUsers = async () => {
        try {
            setLoading(true);
            const response = await api.get(API_URL);
            setUsers(response.data);
        } catch (error) {
            console.error('Error fetching users:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchPositions = async () => {
        try {
            const res = await api.get('/users/positions/list');
            setDynamicPositions(res.data);
        } catch (err) {
            console.error('Failed to fetch positions:', err);
        }
    };

    useEffect(() => {
        if (showSuccess) {
            const timer = setTimeout(() => {
                setShowSuccess(false);
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [showSuccess]);

    useEffect(() => {
        fetchUsers();
        fetchPositions();
    }, []);

    const handleOpenModal = (user: User | null = null) => {
        if (user) {
            setEditingUser(user);
            setFormData({
                name: user.name,
                email: user.email,
                password: '', // Don't show password
                phone: user.phone || '',
                role_id: user.role_id,
                barangay_id: user.barangay_id || 1,
                is_head_officer: user.is_head_officer || false,
                barangay: user.barangay_name || user.barangay || 'San Vicente',
                city: user.city || 'Santa Maria, Bulacan',
                address: user.address || '',
                position: user.position_name || user.position || '',
                subdivision_id: user.subdivision_id?.toString() || '',
                status: user.status
            });
        } else {
            setEditingUser(null);
            setFormData({
                name: '',
                email: '',
                password: '',
                phone: '',
                role_id: 1,
                barangay_id: 1,
                is_head_officer: false,
                barangay: 'San Vicente',
                city: 'Santa Maria, Bulacan',
                address: '',
                position: '',
                subdivision_id: '1',
                status: 'Active'
            });
        }
        setIsModalOpen(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const cleanData: any = {
                ...formData,
                barangay: formData.barangay.trim() || 'San Vicente',
                city: formData.city.trim() || 'Santa Maria, Bulacan',
                address: formData.address.trim() || '',
                phone: formData.phone.trim() || null,
                subdivision_id: formData.role_id === 1 || formData.role_id === 2 ? 1 : null,
                barangay_id: formData.role_id === 3 ? (formData.barangay_id || 1) : null,
                is_head_officer: formData.role_id === 3 ? formData.is_head_officer : false
            };

            if (editingUser) {
                // Update
                if (!cleanData.password) delete cleanData.password;
                await api.put(`${API_URL}/${editingUser.user_id}`, cleanData);
            } else {
                // Create
                await api.post(API_URL, cleanData);
            }
            setIsModalOpen(false);
            setSuccessMessage(editingUser ? 'Successfully Edited User!' : 'Successfully Created User!');
            setShowSuccess(true);
            setTimeout(() => setShowSuccess(false), 3000);
            fetchUsers();
        } catch (error: any) {
            console.error('Error saving user:', error);
            const errorMessage = error.response?.data?.detail || 'Failed to save user. Check console for details.';
            alert(errorMessage);
        }
    };

    const handleAssignHead = async (user: User) => {
        try {
            await api.post(`/users/barangay/1/assign-head`, {
                user_id: user.user_id,
                position_id: user.role_id === 3 ? 6 : undefined // Default to Barangay Captain / Head
            });
            setSuccessMessage(`${user.name} is now designated as the Head Officer of Barangay San Vicente!`);
            setShowSuccess(true);
            fetchUsers();
        } catch (error: any) {
            console.error('Error designating barangay head:', error);
            alert(error.response?.data?.detail || 'Failed to designate head officer.');
        }
    };

    const handleDelete = async (id: number) => {
        if (window.confirm('Are you sure you want to permanently delete this user?')) {
            try {
                await api.delete(`${API_URL}/${id}`);
                fetchUsers();
            } catch (error) {
                console.error('Error deleting user:', error);
            }
        }
    };

    const toggleStatus = async (user: User) => {
        const newStatus = user.status === 'Active' ? 'Inactive' : 'Active';
        try {
            await api.patch(`${API_URL}/${user.user_id}/status`, null, {
                params: { status_in: newStatus }
            });
            fetchUsers();
        } catch (error) {
            console.error('Error toggling status:', error);
        }
    };

    const filteredUsers = users.filter(u => {
        const matchesSearch = u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            u.email.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesRole = roleFilter === 'all' || u.role_id === roleFilter;
        let matchesStatus = statusFilter === 'all' || u.status === statusFilter;
        
        // Custom filter for Pending Verification
        if (statusFilter === 'Pending') {
            return matchesSearch && matchesRole && !u.is_verified;
        }

        return matchesSearch && matchesRole && matchesStatus;
    });

    const handleVerifyUser = async (user: User) => {
        try {
            await api.put(`${API_URL}/${user.user_id}`, {
                ...user,
                is_verified: true,
                status: 'Active'
            });
            setSuccessMessage(`Personnel ${user.name} has been verified and activated!`);
            setShowSuccess(true);
            fetchUsers();
        } catch (error) {
            console.error('Error verifying user:', error);
            alert('Failed to verify user.');
        }
    };

    return (
        <div className="flex h-screen bg-[#F8FAFC]">
            <AdminSidebar />

            <div className="flex-1 flex flex-col overflow-hidden">
                <AdminNavbar
                    leftContent={
                        <div className="flex flex-col">
                            <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none uppercase">User Management</h1>
                            <p className="text-[9px] text-gray-400 font-extrabold uppercase tracking-wider mt-1.5 leading-none">Manage system users, roles, and barangay hierarchy</p>
                        </div>
                    }
                />

                <main className="flex-1 overflow-y-auto p-8">
                    <div className="max-w-7xl mx-auto">
                        {/* Header */}
                        <div className="flex justify-end items-center mb-8">
                            <Button variant="primary" className="flex items-center space-x-2 px-6 shadow-md shadow-orange-500/20" onClick={() => handleOpenModal()}>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                                </svg>
                                <span>Add New User</span>
                            </Button>
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
                                    placeholder="Search by name or email..."
                                    className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#F97316] outline-none transition-all"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <div className="flex items-center space-x-2">
                                <Select
                                    value={roleFilter}
                                    onChange={(e) => setRoleFilter(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
                                    options={[
                                        { value: 'all', label: 'All Roles' },
                                        { value: 4, label: 'Admin' },
                                        { value: 3, label: 'Barangay Staff & Head' },
                                        { value: 2, label: 'Subdivision Leader' },
                                        { value: 1, label: 'Citizen' }
                                    ]}
                                    className="w-[180px]"
                                />
                                <Select
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value)}
                                    options={[
                                        { value: 'all', label: 'All Status' },
                                        { value: 'Pending', label: 'Pending Approval' },
                                        { value: 'Active', label: 'Active' },
                                        { value: 'Inactive', label: 'Inactive' },
                                        { value: 'Deactivated', label: 'Deactivated' }
                                    ]}
                                    className="w-[180px]"
                                />
                            </div>
                        </div>

                        {/* Data Table Section */}
                        <DataTable
                            loading={loading}
                            data={filteredUsers}
                            emptyMessage="No users found."
                            loadingMessage="Syncing user database..."
                            columns={[
                                {
                                    header: "User Details",
                                    key: "details",
                                    render: (user) => (
                                        <div className="flex items-center space-x-3">
                                            <div className="w-10 h-10 rounded-full bg-[#FFF7ED] flex items-center justify-center text-[#F97316] font-bold border border-orange-100">
                                                {user.name.charAt(0)}
                                            </div>
                                            <div>
                                                <div className="flex items-center space-x-2">
                                                    <p className="text-sm font-semibold text-gray-900 leading-none">{user.name}</p>
                                                    {user.position_name && user.role_id !== 1 && (
                                                        <span className="text-[9px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded uppercase font-black tracking-tighter border border-gray-200">
                                                            {user.position_name}
                                                        </span>
                                                    )}
                                                    {!user.is_verified && (
                                                        <span className="text-[8px] px-1.5 py-0.5 bg-orange-100 text-orange-600 rounded uppercase font-black tracking-widest border border-orange-200 animate-pulse">
                                                            Pending Approval
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-gray-400 mt-1">{user.email}</p>
                                            </div>
                                        </div>
                                    )
                                },
                                {
                                    header: "Jurisdiction / Location",
                                    key: "location",
                                    render: (user) => (
                                        <div>
                                            <p className="text-xs font-semibold text-gray-900 leading-none">
                                                {user.barangay_name || user.barangay || 'San Vicente'}, {user.city || 'Santa Maria'}
                                            </p>
                                            <p className="text-[10px] text-gray-400 mt-1 truncate max-w-[150px]">{user.address || 'N/A'}</p>
                                        </div>
                                    )
                                },
                                {
                                    header: "Role & Authority",
                                    key: "role",
                                    render: (user) => (
                                        <div>
                                            {user.role_id === 4 ? (
                                                <span className="px-3 py-1 rounded-full text-[10px] font-bold border bg-red-50 text-red-600 border-red-100">
                                                    Administrator
                                                </span>
                                            ) : user.role_id === 3 ? (
                                                user.is_head_officer ? (
                                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black tracking-wide bg-gradient-to-r from-purple-700 via-purple-600 to-indigo-600 text-white shadow-sm border border-purple-300">
                                                        <svg className="w-3 h-3 text-amber-300 fill-current" viewBox="0 0 20 20">
                                                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                                        </svg>
                                                        Barangay Head Officer
                                                    </span>
                                                ) : (
                                                    <span className="px-3 py-1 rounded-full text-[10px] font-bold border bg-purple-50 text-purple-600 border-purple-100">
                                                        Barangay Field Staff
                                                    </span>
                                                )
                                            ) : user.role_id === 2 ? (
                                                <span className="px-3 py-1 rounded-full text-[10px] font-bold border bg-blue-50 text-blue-600 border-blue-100">
                                                    Subdivision Leader
                                                </span>
                                            ) : (
                                                <span className="px-3 py-1 rounded-full text-[10px] font-bold border bg-amber-50 text-amber-600 border-amber-100">
                                                    Citizen
                                                </span>
                                            )}
                                        </div>
                                    )
                                },
                                {
                                    header: "Status",
                                    key: "status",
                                    render: (user) => (
                                        <div className="flex items-center space-x-2">
                                            <div className={`w-1.5 h-1.5 rounded-full ${user.status === 'Active' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]' : 'bg-gray-300'}`}></div>
                                            <span className={`text-xs font-bold uppercase tracking-wider ${user.status === 'Active' ? 'text-green-600' : 'text-gray-400'}`}>
                                                {user.status}
                                            </span>
                                        </div>
                                    )
                                },
                                {
                                    header: "Actions",
                                    key: "actions",
                                    className: "text-right",
                                    render: (user) => (
                                        <div className="relative inline-block text-left" ref={openMenuId === user.user_id ? menuRef : null}>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setOpenMenuId(openMenuId === user.user_id ? null : user.user_id);
                                                }}
                                                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                    <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z" />
                                                </svg>
                                            </button>
                                            
                                            {openMenuId === user.user_id && (
                                                <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-50 animate-in fade-in zoom-in-95 duration-200">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleOpenModal(user);
                                                            setOpenMenuId(null);
                                                        }}
                                                        className="w-full flex items-center gap-3 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-orange-50 hover:text-[#F97316] transition-colors"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                                        </svg>
                                                        Edit User
                                                    </button>

                                                    {user.role_id === 3 && !user.is_head_officer && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleAssignHead(user);
                                                                setOpenMenuId(null);
                                                            }}
                                                            className="w-full flex items-center gap-3 px-4 py-2 text-sm font-bold text-purple-700 hover:bg-purple-50 transition-colors"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                                                            </svg>
                                                            Designate as Head Officer
                                                        </button>
                                                    )}

                                                    {!user.is_verified && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleVerifyUser(user);
                                                                setOpenMenuId(null);
                                                            }}
                                                            className="w-full flex items-center gap-3 px-4 py-2 text-sm font-bold text-orange-600 hover:bg-orange-50 transition-colors"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                            </svg>
                                                            Verify & Activate
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            toggleStatus(user);
                                                            setOpenMenuId(null);
                                                        }}
                                                        className={`w-full flex items-center gap-3 px-4 py-2 text-sm font-medium transition-colors ${
                                                            user.status === 'Active' ? 'text-amber-600 hover:bg-amber-50' : 'text-green-600 hover:bg-green-50'
                                                        }`}
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 11-12.728 0M12 3v9" />
                                                        </svg>
                                                        {user.status === 'Active' ? 'Deactivate' : 'Activate'}
                                                    </button>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleDelete(user.user_id);
                                                            setOpenMenuId(null);
                                                        }}
                                                        className="w-full flex items-center gap-3 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                        </svg>
                                                        Delete User
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

            {/* Modal Overlay */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="px-8 py-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <div>
                                <h3 className="text-xl font-bold text-gray-900">{editingUser ? 'Edit User' : 'Add New User'}</h3>
                                <p className="text-xs text-gray-500 mt-1">Fill in the details below to {editingUser ? 'update' : 'create'} a user account.</p>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-all">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <form onSubmit={handleSave} className="p-8 max-h-[75vh] overflow-y-auto">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Full Name</label>
                                    <input
                                        type="text" required
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm focus:ring-2 focus:ring-[#F97316] outline-none transition-all"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        placeholder="e.g. John Doe"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Email Address</label>
                                    <input
                                        type="email" required
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm focus:ring-2 focus:ring-[#F97316] outline-none transition-all"
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        placeholder="john@example.com"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Password {editingUser && '(Leave blank to keep current)'}</label>
                                    <input
                                        type="password" required={!editingUser}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm focus:ring-2 focus:ring-[#F97316] outline-none transition-all"
                                        value={formData.password}
                                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                        placeholder="••••••••"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Phone Number</label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm focus:ring-2 focus:ring-[#F97316] outline-none transition-all"
                                        value={formData.phone}
                                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                        placeholder="0917XXXXXXX"
                                    />
                                </div>
                                <Select
                                    label="User Role"
                                    value={formData.role_id}
                                    onChange={(e) => setFormData({ ...formData, role_id: parseInt(e.target.value) })}
                                    options={[
                                        { value: 1, label: 'Citizen' },
                                        { value: 2, label: 'Leader' },
                                        { value: 3, label: 'Barangay Staff / Personnel' },
                                        { value: 4, label: 'Administrator' }
                                    ]}
                                />
                                <Select
                                    label="Account Status"
                                    value={formData.status}
                                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                                    options={[
                                        { value: 'Active', label: 'Active' },
                                        { value: 'Inactive', label: 'Inactive' },
                                        { value: 'Deactivated', label: 'Deactivated' }
                                    ]}
                                />

                                {formData.role_id === 3 && (
                                    <div className="col-span-full bg-purple-50/80 border border-purple-100 rounded-2xl p-4 flex items-center justify-between shadow-sm">
                                        <div className="pr-4">
                                            <p className="text-xs font-bold text-purple-900 flex items-center gap-1.5">
                                                <svg className="w-3.5 h-3.5 text-purple-600 fill-current" viewBox="0 0 20 20">
                                                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                                </svg>
                                                Designate as Barangay Head Officer (In Charge)
                                            </p>
                                            <p className="text-[11px] text-purple-700 mt-0.5">
                                                Gives this account tactical command, team dispatch, and administrative sign-off authority for Barangay San Vicente.
                                            </p>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                                            <input 
                                                type="checkbox" 
                                                checked={formData.is_head_officer} 
                                                onChange={(e) => setFormData({ ...formData, is_head_officer: e.target.checked })} 
                                                className="sr-only peer" 
                                            />
                                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                                        </label>
                                    </div>
                                )}

                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">City</label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm focus:ring-2 focus:ring-[#F97316] outline-none transition-all"
                                        value={formData.city}
                                        onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                                        placeholder="City Name"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Barangay</label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm focus:ring-2 focus:ring-[#F97316] outline-none transition-all"
                                        value={formData.barangay}
                                        onChange={(e) => setFormData({ ...formData, barangay: e.target.value })}
                                        placeholder="Barangay Name"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Complete Address</label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm focus:ring-2 focus:ring-[#F97316] outline-none transition-all"
                                        value={formData.address}
                                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                        placeholder="Street, House No., etc."
                                    />
                                </div>
                                {formData.role_id !== 1 && (
                                    <div className="space-y-2 col-span-full md:col-span-2 bg-gray-50/70 p-4 rounded-2xl border border-gray-100">
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1 block">
                                            Position / Official Designation
                                        </label>
                                        {(() => {
                                            const standardPositions = [
                                                'Barangay Captain / Punong Barangay',
                                                'Barangay Animal Rescuer / Field Handler',
                                                'Barangay Tanod / Peace & Order Officer',
                                                'Barangay Staff / Action Officer',
                                                'Barangay Kagawad',
                                                'Subdivision President / Leader',
                                                'Subdivision Secretary'
                                            ];
                                            const allPositions = Array.from(new Set([
                                                ...standardPositions,
                                                ...dynamicPositions.map(dp => dp.position_name)
                                            ]));
                                            
                                            return (
                                                <>
                                                    <select
                                                        value={allPositions.includes(formData.position) ? formData.position : (formData.position ? 'Other' : '')}
                                                        onChange={(e) => {
                                                            const val = e.target.value;
                                                            if (val === 'Other') {
                                                                setFormData({ ...formData, position: '' });
                                                            } else {
                                                                setFormData({ ...formData, position: val });
                                                            }
                                                        }}
                                                        className="w-full px-4 py-3 bg-white border border-gray-200 rounded-2xl text-xs font-bold text-gray-800 focus:ring-2 focus:ring-[#F97316] outline-none transition-all shadow-sm"
                                                    >
                                                        <option value="">Select Official Position...</option>
                                                        {allPositions.map(pos => (
                                                            <option key={pos} value={pos}>{pos}</option>
                                                        ))}
                                                        <option value="Other">Other (Custom Designation...)</option>
                                                    </select>

                                                    {(!allPositions.includes(formData.position)) && (
                                                        <div className="pt-2 animate-in fade-in duration-200">
                                                            <label className="text-[9px] font-black text-orange-600 uppercase tracking-wider ml-1 block mb-1">
                                                                Specify Custom Position Title
                                                            </label>
                                                            <input
                                                                type="text"
                                                                className="w-full px-4 py-2.5 bg-white border border-orange-200 rounded-xl text-xs font-bold text-gray-800 focus:ring-2 focus:ring-[#F97316] outline-none transition-all placeholder:text-gray-400 placeholder:font-normal shadow-xs"
                                                                value={formData.position}
                                                                onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                                                                placeholder="e.g. Purok Coordinator, Veterinary Aid, Patrol Officer..."
                                                            />
                                                        </div>
                                                    )}
                                                </>
                                            );
                                        })()}
                                    </div>
                                )}
                            </div>


                            <div className="mt-8 pt-6 border-t border-gray-50 flex items-center justify-end space-x-3">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-6 py-2.5 text-sm font-bold text-gray-500 hover:text-gray-700 transition-colors"
                                >
                                    Cancel
                                </button>
                                <Button variant="primary" type="submit" className="px-10 shadow-md shadow-orange-500/20">
                                    {editingUser ? 'Save Changes' : 'Create User'}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <SuccessModal
                isOpen={showSuccess}
                message={successMessage}
            />
        </div>
    );
};

export default AdminUserManagement;