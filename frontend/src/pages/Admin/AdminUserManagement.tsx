import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import AdminSidebar from '../../components/AdminSidebar';
import AdminNavbar from '../../components/Navbars/AdminNavbar';
import SuccessModal from '../../components/Modals/SuccessModal';
import Button from '../../components/Button';
import Select from '../../components/Dropdown';

interface User {
    user_id: number;
    name: string;
    email: string;
    phone: string | null;
    role_id: number;
    subdivision_id: number | null;
    barangay: string;
    city: string;
    address: string | null;
    position: string | null;
    status: string;
    is_verified: boolean;
    created_at: string;
}

import DataTable from '../../components/DataTable';

const ROLE_MAP: Record<number, string> = {
    1: 'Citizen',
    2: 'Leader',
    3: 'Barangay',
    4: 'Admin'
};

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
        barangay: 'San Vicente',
        city: 'Santa Maria, Bulacan',
        address: '',
        position: '',
        subdivision_id: '1',
        status: 'Active'
    });

    const API_URL = 'http://localhost:8000/users';

    const fetchUsers = async () => {
        try {
            setLoading(true);
            const response = await axios.get(API_URL);
            setUsers(response.data);
        } catch (error) {
            console.error('Error fetching users:', error);
        } finally {
            setLoading(false);
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
                barangay: user.barangay,
                city: user.city,
                address: user.address || '',
                position: user.position || '',
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
            const cleanData = {
                ...formData,
                barangay: formData.barangay.trim() || 'San Vicente',
                city: formData.city.trim() || 'Santa Maria, Bulacan',
                address: formData.address.trim() || '',
                phone: formData.phone.trim() || null,
                subdivision_id: 1 // Automatically set to 1 (Selera Homes)
            };

            if (editingUser) {
                // Update
                if (!cleanData.password) delete (cleanData as any).password;
                await axios.put(`${API_URL}/${editingUser.user_id}`, cleanData);
            } else {
                // Create
                await axios.post(API_URL, cleanData);
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

    const handleDelete = async (id: number) => {
        if (window.confirm('Are you sure you want to permanently delete this user?')) {
            try {
                await axios.delete(`${API_URL}/${id}`);
                fetchUsers();
            } catch (error) {
                console.error('Error deleting user:', error);
            }
        }
    };

    const toggleStatus = async (user: User) => {
        const newStatus = user.status === 'Active' ? 'Inactive' : 'Active';
        try {
            await axios.patch(`${API_URL}/${user.user_id}/status`, null, {
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
            await axios.put(`${API_URL}/${user.user_id}`, {
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
                <AdminNavbar />

                <main className="flex-1 overflow-y-auto p-8">
                    <div className="max-w-7xl mx-auto">
                        {/* Header */}
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
                                <p className="text-gray-500 text-sm mt-1">Manage system citizens, leaders, barangay staff, and admins.</p>
                            </div>
                            <Button variant="primary" className="flex items-center space-x-2 px-6" onClick={() => handleOpenModal()}>
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
                                        { value: 3, label: 'Barangay' },
                                        { value: 2, label: 'Leader' },
                                        { value: 1, label: 'Citizen' }
                                    ]}
                                    className="w-[140px]"
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

                        {/* Table */}
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
                                                    {user.position && user.role_id !== 1 && (
                                                        <span className="text-[9px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded uppercase font-black tracking-tighter border border-gray-200">
                                                            {user.position}
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
                                    header: "Location",
                                    key: "location",
                                    render: (user) => (
                                        <div>
                                            <p className="text-xs font-semibold text-gray-900 leading-none">{user.barangay}, {user.city}</p>
                                            <p className="text-[10px] text-gray-400 mt-1 truncate max-w-[150px]">{user.address || 'N/A'}</p>
                                        </div>
                                    )
                                },
                                {
                                    header: "Role",
                                    key: "role",
                                    render: (user) => (
                                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold border ${
                                            user.role_id === 4 ? 'bg-red-50 text-red-600 border-red-100' :
                                            user.role_id === 3 ? 'bg-purple-50 text-purple-600 border-purple-100' :
                                            user.role_id === 2 ? 'bg-blue-50 text-blue-600 border-blue-100' :
                                            'bg-amber-50 text-amber-600 border-amber-100'
                                        }`}>
                                            {ROLE_MAP[user.role_id] || 'User'}
                                        </span>
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
                                                <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-50 animate-in fade-in zoom-in-95 duration-200">
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
                                        { value: 3, label: 'Barangay Staff' },
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
                                <div className="space-y-1.5 opacity-60 pointer-events-none">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Subdivision (Fixed for Research)</label>
                                    <div className="w-full px-4 py-3 bg-gray-100 border border-gray-100 rounded-2xl text-sm font-bold text-[#F97316]">
                                        Selera Homes (ID: 1)
                                    </div>
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
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Position / Designation</label>
                                        <input
                                            type="text"
                                            className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm focus:ring-2 focus:ring-[#F97316] outline-none transition-all"
                                            value={formData.position}
                                            onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                                            placeholder="e.g. Barangay Captain, Purok Leader, etc."
                                        />
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
                                <Button variant="primary" type="submit" className="px-10">
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