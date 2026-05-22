import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Button from '../../components/Button';
import ResiNavbar from '../../components/Navbars/ResiNavbar';
import ResiMobileNav from '../../components/Navbars/ResiMobileNav';

const ResiProfile = () => {
    const navigate = useNavigate();
    const [reports, setReports] = useState<any[]>([]);
    const [isNavbarMenuOpen, setIsNavbarMenuOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [openMenuId, setOpenMenuId] = useState<number | null>(null);
    const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setOpenMenuId(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const userStr = localStorage.getItem('resident_user');
    const initialUser = userStr ? JSON.parse(userStr) : {
        name: 'Guest User',
        email: 'guest@straysafe.org',
        phone: '',
        address: '',
        user_id: 4, // Defaulting to 4 as per your current test case, but ideally should come from login
        created_at: new Date().toISOString()
    };

    const [userData, setUserData] = useState<any>(initialUser);
    const [editData, setEditData] = useState({ ...initialUser });

    useEffect(() => {
        fetchUserProfile();
        fetchUserReports();
    }, []);

    const fetchUserProfile = async () => {
        const storedUser = localStorage.getItem('resident_user');
        const userId = storedUser ? JSON.parse(storedUser).user_id : initialUser.user_id;

        try {
            const response = await axios.get(`http://localhost:8000/users/${userId}`);
            setUserData(response.data);
            setEditData(response.data);
            // Keep local storage in sync with DB
            localStorage.setItem('resident_user', JSON.stringify(response.data));
        } catch (error) {
            console.error('Error fetching user profile:', error);
        }
    };

    const fetchUserReports = async () => {
        const storedUser = localStorage.getItem('resident_user');
        const userId = storedUser ? JSON.parse(storedUser).user_id : initialUser.user_id;

        try {
            const response = await axios.get('http://localhost:8000/reports/');
            const userReports = response.data.filter((r: any) => r.user_id === userId);
            setReports(userReports);
        } catch (error) {
            console.error('Error fetching reports:', error);
        }
    };



    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploadingPhoto(true);
        const formData = new FormData();
        formData.append('file', file);

        try {
            await axios.post(`http://localhost:8000/users/${userData.user_id}/profile-picture`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            fetchUserProfile();
        } catch (error) {
            console.error('Error uploading photo:', error);
            alert('Failed to upload profile picture.');
        } finally {
            setIsUploadingPhoto(false);
        }
    };

    const handleMobileSearch = (query: string) => {
        setSearchQuery(query);
        setIsMobileSearchOpen(false);
    };

    const statusMap: Record<number, string> = {
        1: 'Reported', 
        2: 'Verified', 
        3: 'Rejected',
        4: 'Escalated to Barangay', 
        5: 'Rescue In Progress', 
        6: 'Picked Up',
        7: 'Under Observation', 
        8: 'Impounded', 
        9: 'Claimed by Owner', 
        10: 'Released', 
        11: 'Resolved', 
        12: 'Deceased',
        13: 'Approved'
    };

    const filteredReports = reports.filter((r) => {
        const q = searchQuery.toLowerCase();
        const categoryMap: Record<number, string> = {
            1: 'Injured Animal', 2: 'Aggressive Stray', 3: 'Possible Rabies Risk',
            4: 'Roaming Pack', 5: 'Animal Rescue Needed'
        };
        const categoryName = categoryMap[r.category_id] || '';
        return (r.description && r.description.toLowerCase().includes(q)) ||
            (r.landmark && r.landmark.toLowerCase().includes(q)) ||
            (r.animal_type && r.animal_type.toLowerCase().includes(q)) ||
            (categoryName.toLowerCase().includes(q));
    });

    const handleSaveProfile = async () => {
        try {
            // Update in DB
            await axios.put(`http://localhost:8000/users/${userData.user_id}`, editData);
            // Refresh local data
            fetchUserProfile();
            setIsEditModalOpen(false);
        } catch (error) {
            console.error('Error updating profile:', error);
            alert('Failed to update profile in database.');
        }
    };

    return (
        <div className="min-h-screen bg-[#F7F7F7] font-sans pb-24">
            <ResiNavbar
                onMenuToggle={(isOpen) => setIsNavbarMenuOpen(isOpen)}
                onSearch={setSearchQuery}
                searchValue={searchQuery}
                isMobileSearchOpen={isMobileSearchOpen}
                onCloseSearch={() => setIsMobileSearchOpen(false)}
            />

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 sm:pt-32">
                <div className="flex flex-col lg:flex-row gap-8">

                    {/* Left Column: Profile Card */}
                    <div className="lg:w-[400px] shrink-0">
                        <div className="bg-white border border-gray-200 rounded-lg p-8 shadow-sm text-center relative">
                            {/* Avatar */}
                            <div className="relative inline-block mb-4 mt-4 group">
                                <div className="w-36 h-36 rounded-full overflow-hidden border-2 border-white shadow-xl mx-auto relative">
                                    <img
                                        src={userData.profile_picture || `https://api.dicebear.com/7.x/avataaars/svg?seed=${userData.name}`}
                                        alt={userData.name}
                                        className={`w-full h-full object-cover transition-all duration-300 ${isUploadingPhoto ? 'opacity-50 blur-sm' : 'group-hover:scale-110'}`}
                                    />

                                    {/* Upload Overlay */}
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={isUploadingPhoto}
                                        className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                        <span className="text-[10px] font-black text-white uppercase tracking-widest">Update Photo</span>
                                    </button>

                                    {isUploadingPhoto && (
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <svg className="animate-spin h-8 w-8 text-[#F97316]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                        </div>
                                    )}
                                </div>
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    onChange={handlePhotoUpload}
                                    className="hidden"
                                    accept="image/*"
                                />
                            </div>

                            <div className="mb-6">
                                <h1 className="text-xl font-bold text-[#1a1208] flex items-center justify-center gap-2">
                                    {userData.name}
                                    {userData.is_verified && (
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                        </svg>
                                    )}
                                </h1>
                                <div className="flex items-center justify-center gap-2 mt-1">
                                    <p className="text-sm text-gray-500">@{userData.email.split('@')[0]}</p>
                                    <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                                    <span className={`text-[10px] font-black uppercase tracking-widest ${userData.status === 'Active' ? 'text-green-500' : 'text-gray-400'}`}>
                                        {userData.status || 'Active'}
                                    </span>
                                </div>
                            </div>

                            {/* Info List */}
                            <div className="space-y-4 pt-6 border-t border-gray-100 text-left">
                                <div className="flex justify-between items-center text-sm">
                                    <div className="flex items-center gap-3 text-gray-500">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                        <span>Address</span>
                                    </div>
                                    <span className="font-bold text-gray-800 truncate max-w-[180px]">{userData.address || 'Not specified'}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <div className="flex items-center gap-3 text-gray-500">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                        </svg>
                                        <span>Joined</span>
                                    </div>
                                    <span className="font-bold text-gray-800">{new Date(userData.created_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <div className="flex items-center gap-3 text-gray-500">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                        </svg>
                                        <span>Phone</span>
                                    </div>
                                    <span className="font-bold text-gray-800">{userData.phone || 'Not provided'}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <div className="flex items-center gap-3 text-gray-500">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                        </svg>
                                        <span>Verified User</span>
                                    </div>
                                    <span className={`font-bold ${userData.is_verified ? 'text-blue-500' : 'text-gray-400'}`}>
                                        {userData.is_verified ? 'Yes' : 'No'}
                                    </span>
                                </div>
                            </div>

                            <div className="mt-10 pt-6 border-t border-gray-100">
                                <Button
                                    variant="primary"
                                    fullWidth
                                    className="py-3 gap-2"
                                    onClick={() => setIsEditModalOpen(true)}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                    Edit Information
                                </Button>
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Active Gigs / Reports */}
                    <div className="flex-1">
                        <div className="bg-white border border-gray-200 rounded-lg shadow-sm mb-6">
                            <div className="px-8 py-6 border-b border-gray-100">
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                                    <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wider relative inline-block">
                                        My Reports
                                        <div className="absolute -bottom-[25px] left-0 right-0 h-1 bg-[#F97316]"></div>
                                    </h2>
                                    
                                    {/* Search Input for Reports */}
                                    <div className="relative w-full sm:w-64">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                            <svg className="h-4 w-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                                            </svg>
                                        </div>
                                        <input
                                            type="text"
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            placeholder="Filter reports..."
                                            className="block w-full pl-10 pr-3 py-2 border border-gray-100 rounded-xl text-[11px] bg-gray-50/50 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#F97316]/10 focus:border-[#F97316] transition-all font-bold text-[#1a1208]"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                            {/* Create New Report Placeholder */}
                            <button
                                onClick={() => navigate('/resident-home', { state: { openAddModal: true, from: '/resident/profile' } })}
                                className="hidden md:flex bg-white border-2 border-dashed border-gray-100 rounded-lg p-10 flex-col items-center justify-center gap-4 group hover:border-[#F97316] hover:bg-orange-50/30 transition-all min-h-[320px]"
                            >
                                <div className="w-16 h-16 rounded-full bg-[#F97316] flex items-center justify-center text-white shadow-lg shadow-orange-100 group-hover:scale-110 transition-transform">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                                    </svg>
                                </div>
                                <span className="text-sm font-black uppercase tracking-widest text-[#F97316]">Create a new Report</span>
                            </button>

                            {/* Report Cards */}
                            {filteredReports.length === 0 ? (
                                <div className="col-span-full text-center py-12 bg-white rounded-3xl border border-gray-100 shadow-sm">
                                    <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">
                                        {reports.length === 0 ? "You haven't submitted any reports yet." : "No reports match your search."}
                                    </p>
                                </div>
                            ) : (
                                filteredReports.map((report) => (
                                    <div key={report.report_id} className="bg-white border border-gray-200 rounded-lg overflow-hidden group shadow-sm hover:shadow-md transition-all flex flex-col">
                                        <div className="h-44 relative overflow-hidden bg-gray-100">
                                            <div className="absolute top-3 left-3 px-2 py-1 bg-black/50 backdrop-blur-md rounded text-[9px] font-black text-white uppercase tracking-widest z-10 flex items-center gap-1.5 shadow-sm">
                                                {report.visibility === 'Private' ? (
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                                    </svg>
                                                ) : (
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                    </svg>
                                                )}
                                                {report.visibility}
                                            </div>

                                            {/* 3-Dot Menu */}
                                            <div className="absolute top-3 right-3 z-20" ref={openMenuId === report.report_id ? menuRef : null}>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setOpenMenuId(openMenuId === report.report_id ? null : report.report_id);
                                                    }}
                                                    className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-md text-white flex items-center justify-center hover:bg-white/40 transition-all border border-white/30"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                        <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z" />
                                                    </svg>
                                                </button>
                                                {openMenuId === report.report_id && (
                                                    <div className="absolute right-0 mt-2 w-40 bg-white rounded-xl shadow-2xl border border-gray-100 py-1 z-30 animate-in fade-in zoom-in-95 duration-200">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                navigate('/resident-home', { state: { editReport: report, isViewMode: true, from: '/resident/profile' } });
                                                            }}
                                                            className="w-full flex items-center gap-3 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-[#F97316] hover:bg-orange-50 transition-colors"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                            </svg>
                                                            View Details
                                                        </button>
                                                    </div>
                                                )}
                                            </div>

                                            {report.media && report.media.length > 0 ? (
                                                <img
                                                    src={report.media[0].file_url}
                                                    alt="Report"
                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-gray-300">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                    </svg>
                                                </div>
                                            )}

                                            {report.status_id === 11 && (
                                                <div className="absolute inset-0 bg-green-600/20 backdrop-blur-[2px] flex items-center justify-center">
                                                    <div className="bg-white/90 px-4 py-2 rounded-full shadow-lg border border-green-100 flex items-center gap-2">
                                                        <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                                        <span className="text-[10px] font-black text-green-700 uppercase tracking-widest">Case Resolved</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        <div className="p-5 flex-1 flex flex-col">
                                            <div className="flex justify-between items-start mb-3">
                                                <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border ${report.status_id === 1 ? 'bg-orange-50 text-orange-600 border-orange-100' :
                                                        report.status_id === 2 ? 'bg-cyan-50 text-cyan-600 border-cyan-100' :
                                                        report.status_id === 4 ? 'bg-purple-50 text-purple-600 border-purple-100' :
                                                        report.status_id === 13 ? 'bg-indigo-50 text-indigo-600 border-indigo-100' :
                                                        report.status_id === 11 ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                                        'bg-blue-50 text-blue-600 border-blue-100'
                                                    }`}>
                                                    {statusMap[report.status_id]}
                                                </span>
                                                <span className="text-[9px] font-bold text-gray-400">#STR-{report.report_id.toString().padStart(4, '0')}</span>
                                            </div>
                                            <h3 className="text-[13px] font-bold text-gray-800 line-clamp-2 mb-4 leading-snug">
                                                {report.description || `Sighting near ${report.landmark || 'Selera Homes'}`}
                                            </h3>

                                            <div className="mt-auto space-y-4">
                                                <div className="flex items-center justify-between pt-4 border-t border-gray-50">
                                                    <div className="flex flex-col">
                                                        <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Priority</span>
                                                        <span className={`text-[11px] font-black uppercase ${report.priority_level === 'High' ? 'text-red-500' : 'text-orange-500'}`}>{report.priority_level}</span>
                                                    </div>
                                                    <div className="flex flex-col text-right">
                                                        <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Animals</span>
                                                        <span className="text-[11px] font-black text-gray-800">{report.animal_count} Sighted</span>
                                                    </div>
                                                </div>

                                                <button
                                                    onClick={() => navigate('/resident-home', { state: { editReport: report, isViewMode: true, from: '/resident/profile' } })}
                                                    className="w-full py-3 bg-[#F97316] text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-[#EA580C] transition-all flex items-center justify-center gap-2 shadow-lg shadow-orange-100"
                                                >
                                                    View Intelligence
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )))}
                        </div>
                    </div>
                </div>
            </main>
            <ResiMobileNav
                isNavbarMenuOpen={isNavbarMenuOpen}
                isSearchOpen={isMobileSearchOpen}
                onSearchClick={() => setIsMobileSearchOpen(true)}
                onAddReportClick={() => navigate('/resident-home', { state: { openAddModal: true, from: '/resident/profile' } })}
            />

            {/* Edit Profile Modal */}
            {isEditModalOpen && (
                <div className="fixed inset-0 z-[600] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-[#1a1208]/60 backdrop-blur-sm" onClick={() => setIsEditModalOpen(false)} />
                    <div className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden p-8 animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center mb-8">
                            <h2 className="text-xl font-bold text-[#1a1208] uppercase tracking-tight">Edit Profile</h2>
                            <button onClick={() => setIsEditModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>

                        <div className="space-y-6">
                            <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Full Name</label>
                                <input
                                    type="text"
                                    className="w-full h-12 bg-gray-50 border border-gray-100 rounded-xl px-4 text-sm font-bold focus:outline-none focus:border-orange-200"
                                    value={editData.name}
                                    onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Email Address</label>
                                <input
                                    type="email"
                                    className="w-full h-12 bg-gray-50 border border-gray-100 rounded-xl px-4 text-sm font-bold focus:outline-none focus:border-orange-200"
                                    value={editData.email}
                                    onChange={(e) => setEditData({ ...editData, email: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Contact Number</label>
                                <input
                                    type="text"
                                    className="w-full h-12 bg-gray-50 border border-gray-100 rounded-xl px-4 text-sm font-bold focus:outline-none focus:border-orange-200"
                                    value={editData.phone}
                                    onChange={(e) => setEditData({ ...editData, phone: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Address</label>
                                <input
                                    type="text"
                                    className="w-full h-12 bg-gray-50 border border-gray-100 rounded-xl px-4 text-sm font-bold focus:outline-none focus:border-orange-200"
                                    value={editData.address}
                                    onChange={(e) => setEditData({ ...editData, address: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="mt-10">
                            <Button variant="primary" fullWidth className="py-4" onClick={handleSaveProfile}>
                                Save Changes
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* MOBILE SEARCH OVERLAY */}
            <div className={`md:hidden fixed inset-0 z-[700] bg-white transition-all duration-300 ease-in-out transform ${isMobileSearchOpen ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'}`}>
                <div className="bg-[#F97316] pt-10 pb-8 px-6 rounded-b-[2.5rem] shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 mix-blend-overlay"></div>
                    <div className="relative flex items-center gap-4 mt-2">
                        <button onClick={() => setIsMobileSearchOpen(false)} className="text-white hover:bg-white/20 p-2 rounded-full transition-all shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                            </svg>
                        </button>
                        <div className="relative flex-1">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                                </svg>
                            </div>
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search your reports..."
                                className="w-full pl-11 pr-4 py-3 bg-white rounded-full text-[#1a1208] placeholder-gray-400 focus:outline-none focus:ring-4 focus:ring-white/30 font-medium shadow-inner transition-all"
                            />
                        </div>
                    </div>
                </div>

                <div className="px-6 py-8 overflow-y-auto h-[calc(100vh-140px)]">
                    <div className="mb-8">
                        <div className="flex justify-between items-end mb-5">
                            <h3 className="text-[#1a1208] font-black text-xl tracking-tight">Recent</h3>
                            <button className="text-[#EF4444] text-xs font-bold uppercase tracking-wider hover:underline" onClick={() => setSearchQuery('')}>Clear all</button>
                        </div>
                        <div className="flex flex-wrap gap-2.5">
                            {['Injured Dog', 'San Jose', 'Stray Cat', 'Rabies Risk', 'Highway'].map((item) => (
                                <button key={item} onClick={() => handleMobileSearch(item)} className="px-5 py-2.5 bg-[#FAFAF9] border border-gray-100 hover:bg-orange-50 hover:border-orange-200 hover:text-[#F97316] text-[#4a3b28] text-sm font-semibold rounded-full transition-all shadow-sm">
                                    {item}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="mb-8">
                        <div className="flex justify-between items-end mb-5">
                            <h3 className="text-[#1a1208] font-black text-xl tracking-tight">Suggestions</h3>
                            <button className="text-[#F97316] text-xs font-bold uppercase tracking-wider hover:underline">See all</button>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <button onClick={() => handleMobileSearch('Rescue')} className="flex items-center p-3.5 bg-white shadow-sm rounded-[1.25rem] border border-gray-50 text-left active:scale-95 transition-transform group hover:border-[#F97316]/30">
                                <div className="w-12 h-12 bg-orange-50 rounded-[0.9rem] flex items-center justify-center text-[#F97316] mr-3 shrink-0 group-hover:scale-110 transition-transform">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                    </svg>
                                </div>
                                <div>
                                    <p className="font-bold text-[#1a1208] text-[13px] leading-tight mb-0.5">Urgent Rescue</p>
                                    <p className="text-[11px] text-gray-400 font-medium tracking-wide">High Priority</p>
                                </div>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ResiProfile;
