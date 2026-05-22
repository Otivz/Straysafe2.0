import { useState, useEffect } from 'react';
import axios from 'axios';
import AdminSidebar from '../../components/AdminSidebar';
import AdminNavbar from '../../components/Navbars/AdminNavbar';
import Button from '../../components/Button';

interface User {
    user_id: number;
    name: string;
    email: string;
    phone: string | null;
    role_id: number;
    barangay: string;
    city: string;
    address: string | null;
    position: string | null;
    status: string;
    profile_picture: string | null;
}

const AdminAccountSettings = () => {
    const [userData, setUserData] = useState<User | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [showSuccess, setShowSuccess] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        phone: '',
        city: '',
        barangay: '',
        address: '',
        position: ''
    });

    const API_URL = 'http://localhost:8000/users';

    const fetchProfile = async () => {
        try {
            setLoading(true);
            const userStr = localStorage.getItem('admin_user') || sessionStorage.getItem('admin_user');
            if (userStr) {
                const storedUser = JSON.parse(userStr);
                const response = await axios.get(`${API_URL}/${storedUser.user_id}`);
                const data = response.data;
                setUserData(data);
                setFormData({
                    name: data.name,
                    email: data.email,
                    phone: data.phone || '',
                    city: data.city || 'Unknown',
                    barangay: data.barangay || 'Unknown',
                    address: data.address || '',
                    position: data.position || ''
                });
            }
        } catch (error) {
            console.error('Error fetching profile:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProfile();
    }, []);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!userData) return;

        try {
            const cleanData = {
                ...formData,
                phone: formData.phone.trim() || null,
                address: formData.address.trim() || null
            };

            await axios.put(`${API_URL}/${userData.user_id}`, cleanData);

            // Update local storage if email/name changed
            const userStr = localStorage.getItem('admin_user') || sessionStorage.getItem('admin_user');
            if (userStr) {
                const storedUser = JSON.parse(userStr);
                const updatedUser = { ...storedUser, name: formData.name, email: formData.email };
                if (localStorage.getItem('admin_user')) localStorage.setItem('admin_user', JSON.stringify(updatedUser));
                else sessionStorage.setItem('admin_user', JSON.stringify(updatedUser));
            }

            setShowSuccess(true);
            setIsEditing(false);
            fetchProfile();
            setTimeout(() => setShowSuccess(false), 3000);
        } catch (error: any) {
            console.error('Error updating profile:', error);
            alert(error.response?.data?.detail || 'Failed to update profile');
        }
    };

    if (loading) {
        return (
            <div className="flex h-screen bg-[#F8FAFC]">
                <AdminSidebar />
                <div className="flex-1 flex items-center justify-center">
                    <div className="w-12 h-12 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin"></div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-screen bg-[#F8FAFC]">
            <AdminSidebar />

            <div className="flex-1 flex flex-col overflow-hidden">
                <AdminNavbar />

                <main className="flex-1 overflow-y-auto p-8">
                    <div className="max-w-7xl mx-auto">
                        <form onSubmit={handleSave}>
                            {/* Profile Section */}
                            <div className="p-0 md:p-4">
                                {/* Top Section: Photo and Basic Info */}
                                <div className="flex flex-col md:flex-row items-start md:items-center gap-8 md:gap-12 pb-10">
                                    {/* Profile Picture */}
                                    <div className="relative group">
                                        <div className="w-40 h-40 md:w-52 md:h-52 rounded-3xl overflow-hidden shadow-md border-4 border-white transition-all group-hover:shadow-xl">
                                            {userData?.profile_picture ? (
                                                <img src={userData.profile_picture} alt={userData.name} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full bg-[#FFF7ED] flex items-center justify-center text-[#F97316]">
                                                    <span className="text-6xl font-black">{userData?.name.charAt(0)}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Info section */}
                                    <div className="flex-1 space-y-2">
                                        <div className="flex items-center space-x-3">
                                            <span className="inline-block px-3 py-1 bg-red-50 text-red-600 text-[10px] font-bold uppercase tracking-widest rounded-md border border-red-100">
                                                {userData?.role_id === 4 ? 'System Administrator' : 'Staff'}
                                            </span>
                                            {userData?.position && (
                                                <span className="inline-block px-3 py-1 bg-amber-50 text-amber-600 text-[10px] font-bold uppercase tracking-widest rounded-md border border-amber-100">
                                                    {userData.position}
                                                </span>
                                            )}
                                            <span className="inline-block px-3 py-1 bg-green-50 text-green-600 text-[10px] font-bold uppercase tracking-widest rounded-md border border-green-100 italic">
                                                {userData?.status}
                                            </span>
                                        </div>
                                        {isEditing ? (
                                            <input
                                                className="text-4xl md:text-5xl font-extrabold text-gray-900 tracking-tight bg-transparent border-b-2 border-orange-200 focus:border-orange-500 outline-none w-full py-1"
                                                value={formData.name}
                                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                                autoFocus
                                            />
                                        ) : (
                                            <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 tracking-tight">{userData?.name}</h1>
                                        )}
                                        <p className="text-lg md:text-xl text-gray-400 font-medium">Administrator Access Level 4</p>
                                    </div>

                                    {/* Edit Button */}
                                    <div className="hidden md:block">
                                        {isEditing ? (
                                            <div className="flex space-x-3">
                                                <Button type="button" variant="light" onClick={() => setIsEditing(false)} className="px-6">Cancel</Button>
                                                <Button type="submit" variant="primary" className="px-10">Save Changes</Button>
                                            </div>
                                        ) : (
                                            <Button type="button" onClick={() => setIsEditing(true)} variant="light" className="flex items-center space-x-2 border-2 border-[#B45309]/10 text-[#B45309] hover:bg-orange-50 hover:border-[#B45309]/20 font-bold px-6 tracking-wide">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                                </svg>
                                                <span>Edit Profile</span>
                                            </Button>
                                        )}
                                    </div>
                                </div>

                                {/* Divider */}
                                <div className="h-px bg-gray-100 w-full mb-10"></div>

                                {/* Bottom Section: Contact & Identity Details */}
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-10 gap-x-12 md:gap-x-16 px-2">
                                    <div className="space-y-3">
                                        <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">Email Address</h3>
                                        {isEditing ? (
                                            <input
                                                className="text-lg font-semibold text-gray-800 tracking-tight bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 w-full focus:ring-2 focus:ring-orange-500 outline-none"
                                                value={formData.email}
                                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                            />
                                        ) : (
                                            <p className="text-lg font-semibold text-gray-800 tracking-tight">{userData?.email}</p>
                                        )}
                                    </div>
                                    <div className="space-y-3">
                                        <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">Phone Number</h3>
                                        {isEditing ? (
                                            <input
                                                className="text-lg font-semibold text-gray-800 tracking-tight bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 w-full focus:ring-2 focus:ring-orange-500 outline-none"
                                                value={formData.phone}
                                                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                            />
                                        ) : (
                                            <p className="text-lg font-semibold text-gray-800 tracking-tight">{userData?.phone || 'Not provided'}</p>
                                        )}
                                    </div>
                                    <div className="space-y-3">
                                        <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">City</h3>
                                        {isEditing ? (
                                            <input
                                                className="text-lg font-semibold text-gray-800 tracking-tight bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 w-full focus:ring-2 focus:ring-orange-500 outline-none"
                                                value={formData.city}
                                                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                                            />
                                        ) : (
                                            <p className="text-lg font-semibold text-gray-800 tracking-tight">{userData?.city}</p>
                                        )}
                                    </div>
                                    <div className="space-y-3">
                                        <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">Barangay</h3>
                                        {isEditing ? (
                                            <input
                                                className="text-lg font-semibold text-gray-800 tracking-tight bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 w-full focus:ring-2 focus:ring-orange-500 outline-none"
                                                value={formData.barangay}
                                                onChange={(e) => setFormData({ ...formData, barangay: e.target.value })}
                                            />
                                        ) : (
                                            <p className="text-lg font-semibold text-gray-800 tracking-tight">{userData?.barangay}</p>
                                        )}
                                    </div>
                                    <div className="space-y-3 lg:col-span-2">
                                        <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">Complete Address</h3>
                                        {isEditing ? (
                                            <input
                                                className="text-lg font-semibold text-gray-800 tracking-tight bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 w-full focus:ring-2 focus:ring-orange-500 outline-none"
                                                value={formData.address}
                                                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                            />
                                        ) : (
                                            <p className="text-lg font-semibold text-gray-800 tracking-tight">{userData?.address || 'No address provided'}</p>
                                        )}
                                    </div>
                                    <div className="space-y-3">
                                        <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">Position / Designation</h3>
                                        {isEditing ? (
                                            <input
                                                className="text-lg font-semibold text-gray-800 tracking-tight bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 w-full focus:ring-2 focus:ring-orange-500 outline-none"
                                                value={formData.position}
                                                onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                                                placeholder="e.g. Barangay Captain"
                                            />
                                        ) : (
                                            <p className="text-lg font-semibold text-gray-800 tracking-tight">{userData?.position || 'Not specified'}</p>
                                        )}
                                    </div>
                                </div>

                                {/* Mobile Controls */}
                                <div className="mt-10 md:hidden space-y-3">
                                    {isEditing ? (
                                        <>
                                            <Button variant="primary" type="submit" fullWidth className="py-4">Save Changes</Button>
                                            <Button variant="light" type="button" fullWidth className="py-4" onClick={() => setIsEditing(false)}>Cancel</Button>
                                        </>
                                    ) : (
                                        <Button variant="primary" fullWidth className="py-4" onClick={() => setIsEditing(true)}>Edit Profile</Button>
                                    )}
                                </div>
                            </div>
                        </form>
                    </div>
                </main>
            </div>

            {/* Success Notification Overlay */}
            {showSuccess && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-white/60 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-white rounded-3xl shadow-2xl p-10 flex flex-col items-center max-w-sm w-full animate-in zoom-in-95 duration-300 border border-gray-100">
                        {/* Animated Checkmark */}
                        <div className="w-24 h-24 mb-6 relative">
                            <div className="absolute inset-0 bg-[#22C55E]/10 rounded-full animate-ping duration-1000"></div>
                            <div className="relative w-24 h-24 bg-[#22C55E] rounded-full flex items-center justify-center shadow-lg shadow-[#22C55E]/20">
                                <svg
                                    className="w-12 h-12 text-white"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth={4}
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M5 13l4 4L19 7"
                                        className="animate-[draw_0.6s_ease-in-out_forwards]"
                                        style={{
                                            strokeDasharray: 50,
                                            strokeDashoffset: 50
                                        }}
                                    />
                                </svg>
                            </div>
                        </div>
                        <h3 className="text-2xl font-black text-gray-900 tracking-tight mb-2">Updated!</h3>
                        <p className="text-gray-500 font-bold text-center text-sm">Your profile has been successfully saved.</p>
                    </div>
                </div>
            )}

            <style>{`
                @keyframes draw {
                    to {
                        stroke-dashoffset: 0;
                    }
                }
                .animate-spin {
                    animation: spin 1s linear infinite;
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
};

export default AdminAccountSettings;
