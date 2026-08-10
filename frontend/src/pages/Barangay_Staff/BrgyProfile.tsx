import { useState, useEffect } from 'react';
import axios from 'axios';
import { DEFAULT_AVATAR, getProfilePicture } from '../../utils/avatar';
import BrgySidebar from '../../components/BrgySidebar';
import BrgyNavbar from '../../components/Navbars/BrgyNavbar';
import Button from '../../components/Button';

interface UserProfile {
    user_id: number;
    name: string;
    email: string;
    phone: string;
    address: string;
    status: string;
    role_id: number;
    subdivision_id: number;
    profile_picture?: string;
    created_at?: string;
}

const BrgyProfile = () => {
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
    // Get initial user from local storage
    const rawUser = localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user');
    const initialUserObj = rawUser ? JSON.parse(rawUser) : null;

    const [user, setUser] = useState<UserProfile | null>(null);
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [address, setAddress] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploadingPic, setUploadingPic] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');
    const [errorMsg, setErrorMsg] = useState('');

    const fetchUserProfile = async () => {
        if (!initialUserObj || !initialUserObj.user_id) {
            setErrorMsg("No active user session found.");
            setLoading(false);
            return;
        }

        try {
            setLoading(true);
            const response = await axios.get(`http://localhost:8000/users/${initialUserObj.user_id}`);
            if (response.data) {
                const userData = response.data;
                setUser(userData);
                setName(userData.name || '');
                setPhone(userData.phone || '');
                setAddress(userData.address || '');
            }
        } catch (err) {
            console.error('Error fetching user profile details:', err);
            setErrorMsg("Failed to retrieve profile data from the server.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUserProfile();
    }, []);

    // Update local storage helper so navbar reflects change instantly
    const updateLocalStorageUser = (updatedData: Partial<UserProfile>) => {
        const activeKey = localStorage.getItem('staff_user') ? 'staff_user' : (sessionStorage.getItem('staff_user') ? 'staff_user' : null);
        
        if (activeKey) {
            const currentStr = localStorage.getItem(activeKey) || sessionStorage.getItem(activeKey);
            if (currentStr) {
                const currentObj = JSON.parse(currentStr);
                const merged = { ...currentObj, ...updatedData };
                if (localStorage.getItem(activeKey)) {
                    localStorage.setItem(activeKey, JSON.stringify(merged));
                } else {
                    sessionStorage.setItem(activeKey, JSON.stringify(merged));
                }
            }
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;

        setSaving(true);
        setSuccessMsg('');
        setErrorMsg('');

        try {
            const payload = {
                name,
                phone: phone || null,
                address: address || null
            };

            const response = await axios.put(`http://localhost:8000/users/${user.user_id}`, payload);
            if (response.data) {
                setUser(response.data);
                updateLocalStorageUser({
                    name: response.data.name,
                    phone: response.data.phone,
                    address: response.data.address
                });
                setSuccessMsg("Profile details updated successfully!");
                setTimeout(() => setSuccessMsg(''), 4000);
            }
        } catch (err: any) {
            console.error('Failed to update profile:', err);
            setErrorMsg(err.response?.data?.detail || "An error occurred while saving your changes.");
        } finally {
            setSaving(false);
        }
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0 || !user) return;

        const file = files[0];
        const formData = new FormData();
        formData.append('file', file);

        setUploadingPic(true);
        setSuccessMsg('');
        setErrorMsg('');

        try {
            const response = await axios.post(`http://localhost:8000/users/${user.user_id}/profile-picture`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            });

            if (response.data && response.data.profile_picture) {
                const picUrl = response.data.profile_picture;
                setUser(prev => prev ? { ...prev, profile_picture: picUrl } : null);
                updateLocalStorageUser({ profile_picture: picUrl });
                setSuccessMsg("Profile photo uploaded successfully!");
                setTimeout(() => setSuccessMsg(''), 4000);
            }
        } catch (err: any) {
            console.error('Profile picture upload failed:', err);
            setErrorMsg("Failed to upload photo to Cloudinary. Please try again.");
        } finally {
            setUploadingPic(false);
        }
    };

    const memberSinceDate = user?.created_at 
        ? new Date(user.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
        : 'N/A';

    return (
        <div className="min-h-screen w-full flex bg-[#FDFDFD] font-sans text-gray-800 relative overflow-hidden">
            {/* Decorative Background Elements */}
            <div className="absolute top-0 left-0 w-[600px] h-[600px] bg-[#F97316]/5 rounded-full blur-[100px] pointer-events-none -translate-x-1/2 -translate-y-1/2 z-0"></div>
            <div className="absolute bottom-0 right-0 w-[800px] h-[800px] bg-orange-50/50 rounded-full blur-[120px] pointer-events-none translate-x-1/3 translate-y-1/3 z-0"></div>

            {/* Sidebar */}
            <BrgySidebar 
                isMobileOpen={isMobileSidebarOpen}
                onCloseMobile={() => setIsMobileSidebarOpen(false)}
            />
 
            {/* Main Content */}
            <main className="flex-1 flex flex-col h-screen overflow-hidden w-full z-10">
                {/* Navbar */}
                <BrgyNavbar
                    onMenuToggle={() => setIsMobileSidebarOpen(true)}
                    leftContent={
                        <div className="flex flex-col">
                            <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none uppercase">My Profile</h1>
                            <p className="text-[9px] text-gray-400 font-extrabold uppercase tracking-wider mt-1.5 leading-none">View and manage your Barangay Action Officer user account information</p>
                        </div>
                    }
                />

                {/* Main Content Container */}
                <div className="flex-1 overflow-y-auto p-10 flex flex-col items-center justify-start scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent bg-[#FAFAF9]">
                    <div className="w-full max-w-4xl space-y-8 animate-in fade-in duration-500">
                        {loading ? (
                            <div className="flex flex-col items-center justify-center py-20 gap-3">
                                <div className="w-12 h-12 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin"></div>
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest animate-pulse">Loading profile data...</p>
                            </div>
                        ) : errorMsg && !user ? (
                            <div className="bg-red-50 border border-red-100 rounded-3xl p-8 text-center max-w-md mx-auto mt-10">
                                <span className="text-4xl block mb-3">⚠️</span>
                                <h3 className="text-sm font-bold text-red-900 uppercase tracking-wider">Access Denied</h3>
                                <p className="text-xs text-red-700/80 mt-1.5 leading-relaxed">{errorMsg}</p>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-6">

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
                                    
                                    {/* Left Column: Profile Card */}
                                    <div className="bg-white border border-gray-100 shadow-xl rounded-[2.5rem] p-8 flex flex-col items-center text-center relative overflow-hidden group">
                                        <div className="absolute top-0 inset-x-0 h-2 bg-gradient-to-r from-orange-400 to-[#F97316]"></div>
                                        
                                        {/* Avatar Uploader Wrapper */}
                                        <div className="relative w-32 h-32 rounded-full border-4 border-gray-50 shadow-inner overflow-hidden mb-6 group/avatar bg-gray-100 flex items-center justify-center">
                                            {uploadingPic ? (
                                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-10">
                                                    <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                                </div>
                                            ) : (
                                                <label className="absolute inset-0 bg-black/0 hover:bg-black/40 flex items-center justify-center text-white text-[10px] font-black uppercase tracking-wider opacity-0 group-hover/avatar:opacity-100 cursor-pointer transition-all z-10 leading-none">
                                                    Change Photo
                                                    <input 
                                                        type="file" 
                                                        accept="image/*" 
                                                        onChange={fileChange => handleFileChange(fileChange)} 
                                                        className="hidden" 
                                                    />
                                                </label>
                                            )}
                                            <img 
                                                src={getProfilePicture(user?.profile_picture)} 
                                                alt={user?.name || 'Profile'} 
                                                className="w-full h-full object-cover"
                                                onError={(e) => { e.currentTarget.src = DEFAULT_AVATAR; }}
                                            />
                                        </div>

                                        <h2 className="text-lg font-black text-gray-900 leading-snug">{user?.name}</h2>
                                        <p className="text-[10px] font-extrabold text-[#F97316] uppercase tracking-wider mt-1 bg-orange-50/50 border border-orange-100 px-3 py-1 rounded-full">
                                            Barangay Action Officer
                                        </p>

                                        <div className="w-full border-t border-gray-50 my-6"></div>

                                        {/* Small Info Grid */}
                                        <div className="w-full space-y-4 text-left text-xs font-semibold text-gray-600">
                                            <div className="flex items-center justify-between">
                                                <span className="text-gray-400">Account Status</span>
                                                <span className="flex items-center gap-1.5 text-green-600 font-extrabold">
                                                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                                                    {user?.status || 'Active'}
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-gray-400">Member Since</span>
                                                <span className="text-gray-800 font-bold">{memberSinceDate}</span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-gray-400">Role Authority</span>
                                                <span className="text-blue-600 font-extrabold flex items-center gap-1">
                                                    🛡️ Barangay Officer
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Right Column: Edit Profile Form */}
                                    <div className="md:col-span-2 bg-white border border-gray-100 shadow-xl rounded-[2.5rem] p-10 flex flex-col relative overflow-hidden">
                                        
                                        {/* Success & Error Alert Banners */}
                                        {successMsg && (
                                            <div className="mb-6 p-4 bg-green-50 border border-green-100 rounded-2xl flex items-center gap-3 text-xs font-bold text-green-700 animate-in slide-in-from-top duration-300">
                                                <span className="text-lg">✅</span>
                                                {successMsg}
                                            </div>
                                        )}
                                        {errorMsg && (
                                            <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-xs font-bold text-red-700 animate-in slide-in-from-top duration-300">
                                                <span className="text-lg">⚠️</span>
                                                {errorMsg}
                                            </div>
                                        )}

                                        <form onSubmit={saveForm => handleSave(saveForm)} className="space-y-5">
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                                {/* Full Name */}
                                                <div className="flex flex-col gap-1.5">
                                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Full Name</label>
                                                    <input 
                                                        type="text" 
                                                        value={name} 
                                                        onChange={e => setName(e.target.value)} 
                                                        required 
                                                        placeholder="Enter your full name" 
                                                        className="px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-xs font-bold text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#F97316]/15 focus:border-[#F97316] focus:bg-white transition-all shadow-sm"
                                                    />
                                                </div>

                                                {/* Email (Read Only) */}
                                                <div className="flex flex-col gap-1.5">
                                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Email Address</label>
                                                    <input 
                                                        type="email" 
                                                        value={user?.email} 
                                                        readOnly 
                                                        disabled
                                                        placeholder="Enter your email address" 
                                                        className="px-4 py-3 bg-gray-100/60 border border-gray-100 text-gray-400 rounded-2xl text-xs font-bold select-none cursor-not-allowed shadow-inner"
                                                    />
                                                </div>

                                                {/* Phone Number */}
                                                <div className="flex flex-col gap-1.5">
                                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Phone Number</label>
                                                    <input 
                                                        type="tel" 
                                                        value={phone} 
                                                        onChange={e => setPhone(e.target.value)} 
                                                        placeholder="e.g. +639123456789" 
                                                        className="px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-xs font-bold text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#F97316]/15 focus:border-[#F97316] focus:bg-white transition-all shadow-sm"
                                                    />
                                                </div>

                                                {/* Subdivision / Address */}
                                                <div className="flex flex-col gap-1.5">
                                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Office Location</label>
                                                    <input 
                                                        type="text" 
                                                        value={address} 
                                                        onChange={e => setAddress(e.target.value)} 
                                                        placeholder="e.g. Barangay San Vicente Hall" 
                                                        className="px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-xs font-bold text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#F97316]/15 focus:border-[#F97316] focus:bg-white transition-all shadow-sm"
                                                    />
                                                </div>
                                            </div>

                                            <div className="border-t border-gray-50 pt-5 mt-6 flex justify-end">
                                                <Button 
                                                    variant="primary" 
                                                    type="submit" 
                                                    disabled={saving}
                                                    className="px-8 py-3 bg-[#F97316] hover:bg-[#EA580C] text-white rounded-xl shadow-lg shadow-orange-950/10 flex items-center gap-2 font-black text-xs uppercase tracking-widest disabled:opacity-50"
                                                >
                                                    {saving ? (
                                                        <span className="flex items-center gap-2">
                                                            <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                                                            Saving...
                                                        </span>
                                                    ) : (
                                                        "Save Changes"
                                                    )}
                                                </Button>
                                            </div>
                                        </form>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
};

export default BrgyProfile;
