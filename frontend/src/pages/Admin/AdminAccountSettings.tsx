import { useState, useEffect } from 'react';
import { api } from '../../utils/api';
import { DEFAULT_AVATAR, getProfilePicture } from '../../utils/avatar';
import AdminSidebar from '../../components/AdminSidebar';
import AdminNavbar from '../../components/Navbars/AdminNavbar';
import Button from '../../components/Button';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});



const hqMarkerIcon = new L.DivIcon({
    className: 'custom-hq-marker',
    html: `<div style="background-color:#2563EB; color:white; width:36px; height:36px; border-radius:50%; display:flex; align-items:center; justify-content:center; border:3px solid white; box-shadow:0 3px 8px rgba(0,0,0,0.4); font-size:18px;">🏛️</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
});

import { LANDMARK_CATEGORIES, getLandmarkCategory, createLandmarkPinIcon } from '../../utils/landmarkIcons';

const RecenterMap = ({ position }: { position: [number, number] | null }) => {
    const map = useMap();
    useEffect(() => {
        if (position && position[0] && position[1]) {
            map.setView(position, map.getZoom());
        }
    }, [position, map]);
    return null;
};

const MapClickPicker = ({ onSelect }: { onSelect: (lat: number, lng: number) => void }) => {
    useMapEvents({
        click(e) {
            onSelect(e.latlng.lat, e.latlng.lng);
        }
    });
    return null;
};

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

interface BarangayHQ {
    barangay_id: number;
    barangay_name: string;
    city: string;
    contact_no: string | null;
    hq_plus_code: string | null;
    hq_lat: number | null;
    hq_lng: number | null;
}

interface LandmarkItem {
    landmark_id: number;
    name: string;
    category?: string;
    description: string | null;
    subdivision_id: number | null;
    barangay_id: number;
    latitude: number;
    longitude: number;
    is_holding_facility: boolean;
    facility_type: string | null;
    capacity: number | null;
    contact_person: string | null;
    contact_number: string | null;
    status: string;
    subdivision_name?: string | null;
    barangay_name?: string | null;
}

type AdminSettingsTab = 'profile' | 'barangay_hq' | 'landmarks';

const AdminAccountSettings = () => {
    const [activeTab, setActiveTab] = useState<AdminSettingsTab>('profile');
    const [userData, setUserData] = useState<User | null>(null);
    const [isEditingProfile, setIsEditingProfile] = useState(false);
    const [loading, setLoading] = useState(true);
    const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Profile form state
    const [profileForm, setProfileForm] = useState({
        name: '',
        email: '',
        phone: '',
        city: '',
        barangay: '',
        address: '',
        position: '',
        newPassword: '',
        confirmPassword: ''
    });

    // Barangay HQ state
    const [barangayHQ, setBarangayHQ] = useState<BarangayHQ>({
        barangay_id: 1,
        barangay_name: 'San Vicente',
        city: 'Santa Maria, Bulacan',
        contact_no: '09123456789',
        hq_plus_code: 'R243+QH',
        hq_lat: 14.806906,
        hq_lng: 121.0039297
    });
    const [isSavingHQ, setIsSavingHQ] = useState(false);

    // Landmarks state
    const [landmarks, setLandmarks] = useState<LandmarkItem[]>([]);
    const [loadingLandmarks, setLoadingLandmarks] = useState(false);
    const [selectedSubdFilter, setSelectedSubdFilter] = useState<string>('all');
    const [editingLandmarkId, setEditingLandmarkId] = useState<number | null>(null);
    const [accounts, setAccounts] = useState<any[]>([]);
    const [selectedCaretakerUserId, setSelectedCaretakerUserId] = useState<string>('');
    const [landmarkForm, setLandmarkForm] = useState({
        name: '',
        category: 'general',
        description: '',
        subdivision_id: 1 as number | null,
        barangay_id: 1,
        latitude: 14.8069,
        longitude: 121.0039,
        is_holding_facility: false,
        facility_type: 'Temporary Holding Pen',
        capacity: 10,
        contact_person: '',
        contact_number: ''
    });
    const [isSavingLandmark, setIsSavingLandmark] = useState(false);

    const showToast = (type: 'success' | 'error', text: string) => {
        setToastMessage({ type, text });
        setTimeout(() => setToastMessage(null), 4000);
    };

    const fetchProfile = async () => {
        try {
            setLoading(true);
            const userStr = localStorage.getItem('admin_user') || sessionStorage.getItem('admin_user');
            if (userStr) {
                const storedUser = JSON.parse(userStr);
                const response = await api.get(`/users/${storedUser.user_id}`);
                const data = response.data;
                setUserData(data);
                setProfileForm({
                    name: data.name,
                    email: data.email,
                    phone: data.phone || '',
                    city: data.city || 'Santa Maria, Bulacan',
                    barangay: data.barangay || 'San Vicente',
                    address: data.address || '',
                    position: data.position || 'System Administrator',
                    newPassword: '',
                    confirmPassword: ''
                });
            }
        } catch (error) {
            console.error('Error fetching profile:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchBarangayHQ = async () => {
        try {
            const res = await api.get('/landmarks/barangay/1/hq');
            if (res.data) {
                setBarangayHQ({
                    barangay_id: res.data.barangay_id,
                    barangay_name: res.data.barangay_name,
                    city: res.data.city,
                    contact_no: res.data.contact_no || '',
                    hq_plus_code: res.data.hq_plus_code || '',
                    hq_lat: res.data.hq_lat ?? 14.806906,
                    hq_lng: res.data.hq_lng ?? 121.0039297
                });
            }
        } catch (err) {
            console.error('Failed to fetch barangay HQ:', err);
        }
    };

    const fetchLandmarks = async () => {
        setLoadingLandmarks(true);
        try {
            const res = await api.get('/landmarks?barangay_id=1');
            setLandmarks(res.data || []);
        } catch (err) {
            console.error('Failed to load landmarks:', err);
        } finally {
            setLoadingLandmarks(false);
        }
    };

    const fetchAccounts = async () => {
        try {
            const res = await api.get('/users?barangay_id=1');
            if (Array.isArray(res.data)) {
                // Filter to ONLY Subdivision Leader / Officer accounts (exclude residents)
                const subdOnlyLeaders = res.data.filter((acc: any) => acc.role_id === 2 || acc.role_name === 'Subdivision Leader');
                setAccounts(subdOnlyLeaders);
            }
        } catch (err) {
            console.error('Failed to load accounts for caretaker dropdown:', err);
        }
    };

    useEffect(() => {
        fetchProfile();
        fetchBarangayHQ();
        fetchLandmarks();
        fetchAccounts();
    }, []);

    // Save Admin Profile
    const handleSaveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!userData) return;

        if (profileForm.newPassword) {
            if (profileForm.newPassword.length < 6) {
                showToast('error', 'New password must be at least 6 characters.');
                return;
            }
            if (profileForm.newPassword !== profileForm.confirmPassword) {
                showToast('error', 'Passwords do not match.');
                return;
            }
        }

        try {
            const payload: any = {
                name: profileForm.name,
                email: profileForm.email,
                phone: profileForm.phone.trim() || null,
                address: profileForm.address.trim() || null
            };

            if (profileForm.newPassword) {
                payload.password = profileForm.newPassword;
            }

            await api.put(`/users/${userData.user_id}`, payload);

            // Update local storage
            const userStr = localStorage.getItem('admin_user') || sessionStorage.getItem('admin_user');
            if (userStr) {
                const stored = JSON.parse(userStr);
                const updated = { ...stored, name: profileForm.name, email: profileForm.email };
                if (localStorage.getItem('admin_user')) localStorage.setItem('admin_user', JSON.stringify(updated));
                if (sessionStorage.getItem('admin_user')) sessionStorage.setItem('admin_user', JSON.stringify(updated));
            }

            setIsEditingProfile(false);
            setProfileForm(prev => ({ ...prev, newPassword: '', confirmPassword: '' }));
            showToast('success', 'Admin profile saved successfully!');
            fetchProfile();
        } catch (error: any) {
            console.error('Error updating profile:', error);
            showToast('error', error.response?.data?.detail || 'Failed to update profile');
        }
    };

    // Save Barangay HQ (ADMIN ONLY)
    const handleSaveBarangayHQ = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSavingHQ(true);
        try {
            const payload = {
                barangay_name: barangayHQ.barangay_name,
                city: barangayHQ.city,
                contact_no: barangayHQ.contact_no || null,
                hq_plus_code: barangayHQ.hq_plus_code || null,
                hq_lat: barangayHQ.hq_lat,
                hq_lng: barangayHQ.hq_lng
            };

            await api.put(`/landmarks/barangay/${barangayHQ.barangay_id}/hq`, payload);
            showToast('success', `Barangay ${barangayHQ.barangay_name} Headquarters location updated successfully!`);
            fetchBarangayHQ();
        } catch (err: any) {
            console.error('Error updating Barangay HQ:', err);
            showToast('error', err.response?.data?.detail || 'Failed to update Barangay HQ location.');
        } finally {
            setIsSavingHQ(false);
        }
    };

    // Save Landmark (Admin can create for any subdivision or barangay)
    const handleSaveLandmark = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!landmarkForm.name.trim()) {
            showToast('error', 'Landmark name is required.');
            return;
        }

        setIsSavingLandmark(true);
        try {
            const payload = {
                name: landmarkForm.name.trim(),
                category: landmarkForm.is_holding_facility ? 'facility' : (landmarkForm.category || 'general'),
                description: landmarkForm.description.trim() || null,
                subdivision_id: landmarkForm.subdivision_id,
                barangay_id: 1,
                latitude: parseFloat(landmarkForm.latitude.toString()),
                longitude: parseFloat(landmarkForm.longitude.toString()),
                is_holding_facility: landmarkForm.is_holding_facility,
                facility_type: landmarkForm.is_holding_facility ? (landmarkForm.facility_type || 'Temporary Holding Pen') : null,
                capacity: landmarkForm.is_holding_facility ? (Number(landmarkForm.capacity) || 10) : null,
                contact_person: landmarkForm.contact_person.trim() || null,
                contact_number: landmarkForm.contact_number.trim() || null
            };

            if (editingLandmarkId) {
                await api.put(`/landmarks/${editingLandmarkId}`, payload);
                showToast('success', 'Landmark updated successfully!');
            } else {
                await api.post('/landmarks', payload);
                showToast('success', 'New landmark / facility registered!');
            }

            setEditingLandmarkId(null);
            setSelectedCaretakerUserId('');
            setLandmarkForm({
                name: '',
                category: 'general',
                description: '',
                subdivision_id: 1,
                barangay_id: 1,
                latitude: barangayHQ.hq_lat || 14.8069,
                longitude: barangayHQ.hq_lng || 121.0039,
                is_holding_facility: false,
                facility_type: 'Temporary Holding Pen',
                capacity: 10,
                contact_person: '',
                contact_number: ''
            });
            fetchLandmarks();
        } catch (err: any) {
            console.error('Error saving landmark:', err);
            showToast('error', err.response?.data?.detail || 'Failed to save landmark.');
        } finally {
            setIsSavingLandmark(false);
        }
    };

    const handleDeleteLandmark = async (id: number) => {
        if (!confirm('Are you sure you want to delete this landmark?')) return;
        try {
            await api.delete(`/landmarks/${id}`);
            showToast('success', 'Landmark deleted successfully.');
            fetchLandmarks();
        } catch (err: any) {
            console.error('Delete landmark error:', err);
            showToast('error', err.response?.data?.detail || 'Failed to delete landmark.');
        }
    };

    const handleEditLandmark = (item: LandmarkItem) => {
        setEditingLandmarkId(item.landmark_id);
        const matched = accounts.find(acc => acc.name.toLowerCase() === (item.contact_person || '').toLowerCase());
        setSelectedCaretakerUserId(matched ? matched.user_id.toString() : (item.contact_person ? 'custom' : ''));
        setLandmarkForm({
            name: item.name,
            category: item.category || (item.is_holding_facility ? 'facility' : 'general'),
            description: item.description || '',
            subdivision_id: item.subdivision_id,
            barangay_id: item.barangay_id,
            latitude: item.latitude,
            longitude: item.longitude,
            is_holding_facility: item.is_holding_facility,
            facility_type: item.facility_type || 'Temporary Holding Pen',
            capacity: item.capacity || 10,
            contact_person: item.contact_person || '',
            contact_number: item.contact_number || ''
        });
        setActiveTab('landmarks');
    };

    const filteredLandmarks = landmarks.filter(l => {
        if (selectedSubdFilter === 'subd_1') return l.subdivision_id === 1;
        if (selectedSubdFilter === 'brgy_general') return l.subdivision_id === null;
        if (selectedSubdFilter === 'facilities') return l.is_holding_facility;
        return true;
    });

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

    const hqPos: [number, number] = [barangayHQ.hq_lat || 14.806906, barangayHQ.hq_lng || 121.0039297];

    return (
        <div className="flex h-screen bg-[#F8FAFC]">
            <AdminSidebar />

            <div className="flex-1 flex flex-col overflow-hidden">
                <AdminNavbar
                    leftContent={
                        <div className="flex flex-col">
                            <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none uppercase">System Settings & Jurisdiction</h1>
                            <p className="text-[10px] text-gray-400 font-extrabold uppercase tracking-wider mt-1 leading-none">
                                Manage Admin Account, Barangay HQ Location Pinpoint, and Jurisdiction Landmarks
                            </p>
                        </div>
                    }
                />

                <main className="flex-1 overflow-y-auto p-6 md:p-8">
                    <div className="max-w-7xl mx-auto space-y-6">

                        {/* Toast Notification */}
                        {toastMessage && (
                            <div className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-2xl shadow-xl border text-xs font-bold flex items-center gap-2 animate-in slide-in-from-top-4 duration-300 ${
                                toastMessage.type === 'success'
                                    ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                                    : 'bg-rose-50 text-rose-900 border-rose-200'
                            }`}>
                                <span>{toastMessage.type === 'success' ? '✅' : '⚠️'}</span>
                                <span>{toastMessage.text}</span>
                            </div>
                        )}

                        {/* Top Hero Banner */}
                        <div className="bg-gradient-to-r from-slate-900 via-gray-900 to-orange-950 rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden border border-white/10">
                            <div className="absolute top-0 right-0 w-80 h-80 bg-[#F97316]/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>
                            
                            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                                <div className="flex items-center gap-5">
                                    <div className="w-20 h-20 rounded-2xl overflow-hidden shadow-lg border-2 border-white/20 shrink-0">
                                        <img 
                                            src={getProfilePicture(userData?.profile_picture)} 
                                            alt={userData?.name || 'Admin'} 
                                            className="w-full h-full object-cover" 
                                            onError={(e) => { e.currentTarget.src = DEFAULT_AVATAR; }}
                                        />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="px-2.5 py-0.5 bg-orange-500/20 border border-orange-400/40 text-orange-300 text-[10px] font-black uppercase tracking-widest rounded-md">
                                                System Administrator
                                            </span>
                                            <span className="text-xs text-white/50">• Access Level 4</span>
                                        </div>
                                        <h2 className="text-2xl font-black text-white tracking-tight mt-1">{userData?.name}</h2>
                                        <p className="text-xs text-gray-300 font-medium">{userData?.email}</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    <div className="bg-white/10 backdrop-blur-md px-4 py-3 rounded-2xl border border-white/10 text-center">
                                        <p className="text-[10px] font-black text-orange-300 uppercase tracking-widest">Active Landmarks</p>
                                        <p className="text-xl font-black text-white">{landmarks.length}</p>
                                    </div>
                                    <div className="bg-white/10 backdrop-blur-md px-4 py-3 rounded-2xl border border-white/10 text-center">
                                        <p className="text-[10px] font-black text-emerald-300 uppercase tracking-widest">Holding Facilities</p>
                                        <p className="text-xl font-black text-white">{landmarks.filter(l => l.is_holding_facility).length}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Navigation Tabs Bar */}
                        <div className="flex items-center space-x-2 bg-white p-2 rounded-2xl border border-gray-100 shadow-sm">
                            <button
                                onClick={() => setActiveTab('profile')}
                                className={`flex-1 py-3 px-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-2 ${
                                    activeTab === 'profile'
                                        ? 'bg-[#F97316] text-white shadow-xs'
                                        : 'text-gray-600 hover:bg-gray-50'
                                }`}
                            >
                                <span>👤</span>
                                <span>Admin Profile & Access</span>
                            </button>

                            <button
                                onClick={() => setActiveTab('barangay_hq')}
                                className={`flex-1 py-3 px-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-2 ${
                                    activeTab === 'barangay_hq'
                                        ? 'bg-[#F97316] text-white shadow-xs'
                                        : 'text-gray-600 hover:bg-gray-50'
                                }`}
                            >
                                <span>🏛️</span>
                                <span>Barangay HQ Location Pin</span>
                            </button>

                            <button
                                onClick={() => setActiveTab('landmarks')}
                                className={`flex-1 py-3 px-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-2 ${
                                    activeTab === 'landmarks'
                                        ? 'bg-[#F97316] text-white shadow-xs'
                                        : 'text-gray-600 hover:bg-gray-50'
                                }`}
                            >
                                <span>📍</span>
                                <span>Landmarks & Holding Facilities</span>
                            </button>
                        </div>

                        {/* TAB 1: Admin Profile & Credentials */}
                        {activeTab === 'profile' && (
                            <form onSubmit={handleSaveProfile} className="bg-white rounded-3xl p-6 md:p-8 border border-gray-100 shadow-sm space-y-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">Admin Personal Information</h3>
                                        <p className="text-xs text-gray-500 font-medium mt-0.5">Update your account credentials and system password.</p>
                                    </div>
                                    {!isEditingProfile && (
                                        <Button
                                            type="button"
                                            variant="light"
                                            onClick={() => setIsEditingProfile(true)}
                                            className="text-xs font-bold !py-2 !px-4"
                                        >
                                            ✏️ Edit Profile
                                        </Button>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Administrator Name</label>
                                        <input
                                            type="text"
                                            value={profileForm.name}
                                            onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                                            disabled={!isEditingProfile}
                                            required
                                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-[#F97316] outline-none disabled:bg-gray-100 disabled:text-gray-500"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Official Contact Phone</label>
                                        <input
                                            type="tel"
                                            value={profileForm.phone}
                                            onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                                            disabled={!isEditingProfile}
                                            placeholder="e.g. 0917-123-4567"
                                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-[#F97316] outline-none disabled:bg-gray-100 disabled:text-gray-500"
                                        />
                                    </div>

                                    <div className="sm:col-span-2">
                                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Registered Email (Login ID)</label>
                                        <input
                                            type="email"
                                            value={profileForm.email}
                                            onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                                            disabled={!isEditingProfile}
                                            required
                                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-[#F97316] outline-none disabled:bg-gray-100 disabled:text-gray-500"
                                        />
                                    </div>

                                    <div className="sm:col-span-2">
                                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Physical Address / Headquarters</label>
                                        <input
                                            type="text"
                                            value={profileForm.address}
                                            onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })}
                                            disabled={!isEditingProfile}
                                            placeholder="StraySafe Command Center, Santa Maria, Bulacan"
                                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-[#F97316] outline-none disabled:bg-gray-100 disabled:text-gray-500"
                                        />
                                    </div>
                                </div>

                                {isEditingProfile && (
                                    <div className="pt-4 border-t border-gray-100 space-y-4 max-w-md">
                                        <div>
                                            <p className="text-xs font-bold text-gray-900 uppercase tracking-wider">Change Password (Optional)</p>
                                            <p className="text-[11px] text-gray-500">Leave blank if you do not want to alter your password.</p>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">New Password</label>
                                            <input
                                                type="password"
                                                value={profileForm.newPassword}
                                                onChange={(e) => setProfileForm({ ...profileForm, newPassword: e.target.value })}
                                                placeholder="Minimum 6 characters"
                                                className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-[#F97316] outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Confirm New Password</label>
                                            <input
                                                type="password"
                                                value={profileForm.confirmPassword}
                                                onChange={(e) => setProfileForm({ ...profileForm, confirmPassword: e.target.value })}
                                                placeholder="Re-type new password"
                                                className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-[#F97316] outline-none"
                                            />
                                        </div>
                                    </div>
                                )}

                                {isEditingProfile && (
                                    <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                                        <Button
                                            type="button"
                                            variant="light"
                                            onClick={() => setIsEditingProfile(false)}
                                        >
                                            Cancel
                                        </Button>
                                        <Button
                                            type="submit"
                                            variant="primary"
                                            className="px-8 !bg-[#F97316] hover:!bg-[#EA580C] !border-[#F97316]"
                                        >
                                            Save Profile Changes
                                        </Button>
                                    </div>
                                )}
                            </form>
                        )}

                        {/* TAB 2: Barangay HQ Location Management (ADMIN ONLY) */}
                        {activeTab === 'barangay_hq' && (
                            <form onSubmit={handleSaveBarangayHQ} className="bg-white rounded-3xl p-6 md:p-8 border border-gray-100 shadow-sm space-y-6">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="px-2.5 py-0.5 bg-blue-50 border border-blue-200 text-blue-800 text-[10px] font-black uppercase tracking-wider rounded-md">
                                                Admin Privilege Exclusive
                                            </span>
                                        </div>
                                        <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight mt-1">
                                            Barangay Headquarters & Dispatch Location
                                        </h3>
                                        <p className="text-xs text-gray-500 font-medium mt-0.5">
                                            As Administrator, you have exclusive authority to configure and calibrate the official Barangay Hall / Rescue Headquarters coordinates.
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (navigator.geolocation) {
                                                    navigator.geolocation.getCurrentPosition((pos) => {
                                                        setBarangayHQ(prev => ({
                                                            ...prev,
                                                            hq_lat: pos.coords.latitude,
                                                            hq_lng: pos.coords.longitude
                                                        }));
                                                        showToast('success', 'Coordinates updated to current GPS!');
                                                    });
                                                }
                                            }}
                                            className="px-3.5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                                        >
                                            <span>📍</span>
                                            <span>Use Current GPS</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Map Picker for Barangay HQ */}
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <label className="block text-xs font-bold text-gray-900 uppercase tracking-wider">
                                            Headquarters Pinpoint (Click map to change HQ location)
                                        </label>
                                        <span className="text-[11px] text-gray-500 font-medium">Click on the map to set the official HQ marker</span>
                                    </div>

                                    <div className="h-80 w-full rounded-2xl overflow-hidden border border-gray-200 relative z-0 shadow-inner">
                                        <MapContainer
                                            center={hqPos}
                                            zoom={16}
                                            scrollWheelZoom={false}
                                            className="h-full w-full"
                                        >
                                            <TileLayer
                                                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                                                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                            />
                                            <RecenterMap position={hqPos} />
                                            <MapClickPicker
                                                onSelect={(lat, lng) => {
                                                    setBarangayHQ(prev => ({ ...prev, hq_lat: lat, hq_lng: lng }));
                                                }}
                                            />
                                            <Marker position={hqPos} icon={hqMarkerIcon}>
                                                <Popup>
                                                    <div className="p-2 text-center text-xs min-w-[160px]">
                                                        <p className="font-black text-blue-600 uppercase tracking-wide">🏛️ Barangay Headquarters</p>
                                                        <p className="text-[11px] text-gray-800 font-bold mt-1">
                                                            {barangayHQ.barangay_name}, {barangayHQ.city}
                                                        </p>
                                                        <p className="text-[10px] text-gray-500 mt-0.5">
                                                            Lat: {barangayHQ.hq_lat?.toFixed(5)}, Lng: {barangayHQ.hq_lng?.toFixed(5)}
                                                        </p>
                                                    </div>
                                                </Popup>
                                            </Marker>
                                        </MapContainer>
                                    </div>

                                    <div className="flex items-center justify-between text-xs bg-gray-50 p-3 rounded-xl border border-gray-200 font-medium text-gray-600">
                                        <span>Selected HQ Pin: <strong className="text-blue-700">{barangayHQ.hq_lat?.toFixed(6)}</strong>, <strong className="text-blue-700">{barangayHQ.hq_lng?.toFixed(6)}</strong></span>
                                        <span className="text-emerald-700 font-bold">Ready for deployment dispatch</span>
                                    </div>
                                </div>

                                {/* Form Details */}
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Barangay Name</label>
                                        <input
                                            type="text"
                                            value={barangayHQ.barangay_name}
                                            onChange={(e) => setBarangayHQ({ ...barangayHQ, barangay_name: e.target.value })}
                                            required
                                            className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-[#F97316] outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">City / Municipality</label>
                                        <input
                                            type="text"
                                            value={barangayHQ.city}
                                            onChange={(e) => setBarangayHQ({ ...barangayHQ, city: e.target.value })}
                                            required
                                            className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-[#F97316] outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Official Hotline Contact</label>
                                        <input
                                            type="text"
                                            value={barangayHQ.contact_no || ''}
                                            onChange={(e) => setBarangayHQ({ ...barangayHQ, contact_no: e.target.value })}
                                            placeholder="e.g. 0912-345-6789"
                                            className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-[#F97316] outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">HQ Plus Code</label>
                                        <input
                                            type="text"
                                            value={barangayHQ.hq_plus_code || ''}
                                            onChange={(e) => setBarangayHQ({ ...barangayHQ, hq_plus_code: e.target.value })}
                                            placeholder="e.g. R243+QH"
                                            className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-[#F97316] outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Latitude</label>
                                        <input
                                            type="number"
                                            step="0.00000001"
                                            value={barangayHQ.hq_lat ?? ''}
                                            onChange={(e) => setBarangayHQ({ ...barangayHQ, hq_lat: parseFloat(e.target.value) || 0 })}
                                            required
                                            className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-[#F97316] outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Longitude</label>
                                        <input
                                            type="number"
                                            step="0.00000001"
                                            value={barangayHQ.hq_lng ?? ''}
                                            onChange={(e) => setBarangayHQ({ ...barangayHQ, hq_lng: parseFloat(e.target.value) || 0 })}
                                            required
                                            className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-[#F97316] outline-none"
                                        />
                                    </div>
                                </div>

                                <div className="flex justify-end pt-4 border-t border-gray-100">
                                    <Button
                                        type="submit"
                                        variant="primary"
                                        disabled={isSavingHQ}
                                        className="px-8 !bg-blue-600 hover:!bg-blue-700 !border-blue-600 font-bold"
                                    >
                                        {isSavingHQ ? 'Saving HQ Location...' : 'Save Barangay HQ Location'}
                                    </Button>
                                </div>
                            </form>
                        )}

                        {/* TAB 3: Landmarks & Holding Facilities (Admin Management) */}
                        {activeTab === 'landmarks' && (
                            <div className="bg-white rounded-3xl p-6 md:p-8 border border-gray-100 shadow-sm space-y-6">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <div>
                                        <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">Jurisdiction Landmarks & Holding Facilities</h3>
                                        <p className="text-xs text-gray-500 font-medium mt-0.5">
                                            Configure reference landmarks and designate holding facilities where animals can be placed across all subdivisions.
                                        </p>
                                    </div>

                                    {/* Filter Controls */}
                                    <div className="flex items-center space-x-2">
                                        <select
                                            value={selectedSubdFilter}
                                            onChange={(e) => setSelectedSubdFilter(e.target.value)}
                                            className="px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 outline-none"
                                        >
                                            <option value="all">All Jurisdictions ({landmarks.length})</option>
                                            <option value="subd_1">Selera Homes Only</option>
                                            <option value="brgy_general">Barangay General Only</option>
                                            <option value="facilities">Holding Facilities Only ({landmarks.filter(l => l.is_holding_facility).length})</option>
                                        </select>
                                    </div>
                                </div>

                                {/* Map Showing All Active Landmarks */}
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <label className="block text-xs font-bold text-gray-900 uppercase tracking-wider">Jurisdiction Map Overview</label>
                                        <span className="text-[11px] text-gray-500 font-medium">Click on map to position the new landmark pin</span>
                                    </div>

                                    <div className="h-80 w-full rounded-2xl overflow-hidden border border-gray-200 relative z-0 shadow-inner">
                                        <MapContainer
                                            center={[landmarkForm.latitude || 14.8069, landmarkForm.longitude || 121.0039]}
                                            zoom={15}
                                            scrollWheelZoom={false}
                                            className="h-full w-full"
                                        >
                                            <TileLayer
                                                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                                                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                            />
                                            <RecenterMap position={[landmarkForm.latitude, landmarkForm.longitude]} />
                                            <MapClickPicker
                                                onSelect={(lat, lng) => {
                                                    setLandmarkForm(prev => ({ ...prev, latitude: lat, longitude: lng }));
                                                }}
                                            />

                                            {/* HQ Pin */}
                                            <Marker position={hqPos} icon={hqMarkerIcon}>
                                                <Popup>
                                                    <div className="p-2 text-center text-xs">
                                                        <strong className="text-blue-600 font-bold">Barangay San Vicente HQ</strong>
                                                    </div>
                                                </Popup>
                                            </Marker>

                                            {/* Landmark Pins */}
                                            {filteredLandmarks.map((l) => (
                                                <Marker
                                                    key={l.landmark_id}
                                                    position={[l.latitude, l.longitude]}
                                                    icon={createLandmarkPinIcon(l.category, l.is_holding_facility)}
                                                >
                                                    <Popup>
                                                        <div className="p-2 text-xs min-w-[160px]">
                                                            <div className="flex items-center gap-1.5 mb-1">
                                                                <span>{getLandmarkCategory(l.category, l.is_holding_facility).emoji}</span>
                                                                <strong className="font-bold text-gray-900">{l.name}</strong>
                                                            </div>
                                                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                                                                {getLandmarkCategory(l.category, l.is_holding_facility).label}
                                                            </p>
                                                            {l.description && <p className="text-gray-600 text-[11px] mb-1">{l.description}</p>}
                                                            <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                                                l.is_holding_facility ? 'bg-emerald-100 text-emerald-800' : 'bg-orange-100 text-orange-800'
                                                            }`}>
                                                                {l.is_holding_facility ? `Holding Facility (${l.capacity || 0} cap)` : 'Landmark'}
                                                            </span>
                                                        </div>
                                                    </Popup>
                                                </Marker>
                                            ))}
                                        </MapContainer>
                                    </div>
                                </div>

                                {/* Add / Edit Landmark Form */}
                                <form onSubmit={handleSaveLandmark} className="bg-gray-50 rounded-2xl p-5 border border-gray-200/80 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <p className="text-xs font-black text-gray-900 uppercase tracking-wider">
                                            {editingLandmarkId ? '✏️ Edit Landmark Details' : '➕ Register New Landmark or Facility'}
                                        </p>
                                        {editingLandmarkId && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setEditingLandmarkId(null);
                                                    setSelectedCaretakerUserId('');
                                                    setLandmarkForm({
                                                        name: '',
                                                        category: 'general',
                                                        description: '',
                                                        subdivision_id: 1,
                                                        barangay_id: 1,
                                                        latitude: barangayHQ.hq_lat || 14.8069,
                                                        longitude: barangayHQ.hq_lng || 121.0039,
                                                        is_holding_facility: false,
                                                        facility_type: 'Temporary Holding Pen',
                                                        capacity: 10,
                                                        contact_person: '',
                                                        contact_number: ''
                                                    });
                                                }}
                                                className="text-xs text-gray-500 hover:text-gray-700 font-bold cursor-pointer"
                                            >
                                                Cancel Edit
                                            </button>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Landmark Name *</label>
                                            <input
                                                type="text"
                                                value={landmarkForm.name}
                                                onChange={(e) => setLandmarkForm(prev => ({ ...prev, name: e.target.value }))}
                                                placeholder="e.g. Selera Community Holding Pen"
                                                required
                                                className="w-full px-3.5 py-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-[#F97316] outline-none"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Marker Icon / Category</label>
                                            <select
                                                value={landmarkForm.is_holding_facility ? 'facility' : landmarkForm.category}
                                                disabled={landmarkForm.is_holding_facility}
                                                onChange={(e) => setLandmarkForm(prev => ({ ...prev, category: e.target.value }))}
                                                className="w-full px-3.5 py-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-[#F97316] outline-none disabled:bg-gray-100 disabled:text-gray-500"
                                            >
                                                {LANDMARK_CATEGORIES.map((cat) => (
                                                    <option key={cat.id} value={cat.id}>
                                                        {cat.emoji} {cat.label}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        <div>
                                            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Jurisdiction Assignment</label>
                                            <select
                                                value={landmarkForm.subdivision_id === null ? 'brgy' : landmarkForm.subdivision_id}
                                                onChange={(e) => setLandmarkForm(prev => ({
                                                    ...prev,
                                                    subdivision_id: e.target.value === 'brgy' ? null : Number(e.target.value)
                                                }))}
                                                className="w-full px-3.5 py-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-[#F97316] outline-none"
                                            >
                                                <option value="1">Selera Homes (Subdivision)</option>
                                                <option value="brgy">Barangay-wide / Impound Facility</option>
                                            </select>
                                        </div>

                                        <div>
                                            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Brief Description</label>
                                            <input
                                                type="text"
                                                value={landmarkForm.description}
                                                onChange={(e) => setLandmarkForm(prev => ({ ...prev, description: e.target.value }))}
                                                placeholder="e.g. Near gate 1, beside clubhouse"
                                                className="w-full px-3.5 py-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-[#F97316] outline-none"
                                            />
                                        </div>
                                    </div>

                                    {/* Holding Facility Designation Toggle */}
                                    <div className={`p-4 rounded-xl border transition-all ${
                                        landmarkForm.is_holding_facility
                                            ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
                                            : 'bg-white border-gray-200 text-gray-700'
                                    }`}>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2.5">
                                                <span className="text-xl">🐾</span>
                                                <div>
                                                    <p className="text-xs font-black uppercase tracking-wider">Designate as Animal Holding Facility</p>
                                                    <p className="text-[11px] text-gray-500 font-medium">Allows officers and citizens to designate this location as an animal impound or holding facility.</p>
                                                </div>
                                            </div>
                                            <input
                                                type="checkbox"
                                                checked={landmarkForm.is_holding_facility}
                                                onChange={(e) => setLandmarkForm(prev => ({
                                                    ...prev,
                                                    is_holding_facility: e.target.checked,
                                                    category: e.target.checked ? 'facility' : (prev.category === 'facility' ? 'general' : prev.category)
                                                }))}
                                                className="w-5 h-5 accent-emerald-600 rounded cursor-pointer"
                                            />
                                        </div>

                                        {landmarkForm.is_holding_facility && (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4 pt-3 border-t border-emerald-200/60">
                                                <div>
                                                    <label className="block text-[11px] font-bold text-emerald-900 uppercase tracking-wider mb-1">Facility Type</label>
                                                    <select
                                                        value={landmarkForm.facility_type}
                                                        onChange={(e) => setLandmarkForm(prev => ({ ...prev, facility_type: e.target.value }))}
                                                        className="w-full px-3 py-1.5 bg-white border border-emerald-300 rounded-xl text-xs font-semibold text-gray-800 outline-none"
                                                    >
                                                        <option value="Temporary Holding Pen">Temporary Holding Pen</option>
                                                        <option value="Barangay Main Shelter">Barangay Main Shelter</option>
                                                        <option value="Community Kennel">Community Kennel</option>
                                                        <option value="Quarantine Cage">Quarantine Cage</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-[11px] font-bold text-emerald-900 uppercase tracking-wider mb-1">Animal Capacity</label>
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        max="200"
                                                        value={landmarkForm.capacity}
                                                        onChange={(e) => setLandmarkForm(prev => ({ ...prev, capacity: parseInt(e.target.value) || 1 }))}
                                                        className="w-full px-3 py-1.5 bg-white border border-emerald-300 rounded-xl text-xs font-semibold text-gray-800 outline-none"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[11px] font-bold text-emerald-900 uppercase tracking-wider mb-1">Caretaker / Contact Account</label>
                                                    <select
                                                        value={
                                                            accounts.some(acc => acc.name.toLowerCase() === (landmarkForm.contact_person || '').toLowerCase())
                                                                ? (accounts.find(acc => acc.name.toLowerCase() === (landmarkForm.contact_person || '').toLowerCase())?.user_id.toString() || 'custom')
                                                                : (landmarkForm.contact_person ? 'custom' : '')
                                                        }
                                                        onChange={(e) => {
                                                            const val = e.target.value;
                                                            if (val === 'custom') {
                                                                setSelectedCaretakerUserId('custom');
                                                            } else if (val === '') {
                                                                setSelectedCaretakerUserId('');
                                                                setLandmarkForm(prev => ({ ...prev, contact_person: '', contact_number: '' }));
                                                            } else {
                                                                const found = accounts.find(acc => acc.user_id.toString() === val);
                                                                if (found) {
                                                                    setSelectedCaretakerUserId(val);
                                                                    setLandmarkForm(prev => ({
                                                                        ...prev,
                                                                        contact_person: found.name,
                                                                        contact_number: found.phone || ''
                                                                    }));
                                                                }
                                                            }
                                                        }}
                                                        className="w-full px-3 py-1.5 bg-white border border-emerald-300 rounded-xl text-xs font-semibold text-gray-800 outline-none focus:ring-2 focus:ring-emerald-500"
                                                    >
                                                        <option value="">-- Select Subdivision Officer / Leader --</option>
                                                        {accounts.map((acc) => (
                                                            <option key={acc.user_id} value={acc.user_id.toString()}>
                                                                {acc.name} ({acc.subdivision_name ? `${acc.subdivision_name} - ` : ''}{acc.position_name || 'Subdivision Leader'})
                                                            </option>
                                                        ))}
                                                        <option value="custom">✏️ Enter Custom Name...</option>
                                                    </select>
                                                    {(selectedCaretakerUserId === 'custom' || (!accounts.some(acc => acc.name.toLowerCase() === (landmarkForm.contact_person || '').toLowerCase()) && landmarkForm.contact_person)) && (
                                                        <input
                                                            type="text"
                                                            value={landmarkForm.contact_person}
                                                            onChange={(e) => setLandmarkForm(prev => ({ ...prev, contact_person: e.target.value }))}
                                                            placeholder="Type caretaker full name..."
                                                            className="w-full mt-2 px-3 py-1.5 bg-white border border-emerald-300 rounded-xl text-xs font-semibold text-gray-800 outline-none focus:ring-2 focus:ring-emerald-500"
                                                        />
                                                    )}
                                                </div>
                                                <div>
                                                    <label className="block text-[11px] font-bold text-emerald-900 uppercase tracking-wider mb-1">Contact Phone</label>
                                                    <input
                                                        type="tel"
                                                        value={landmarkForm.contact_number}
                                                        onChange={(e) => setLandmarkForm(prev => ({ ...prev, contact_number: e.target.value }))}
                                                        placeholder="e.g. 0919-222-3344"
                                                        className="w-full px-3 py-1.5 bg-white border border-emerald-300 rounded-xl text-xs font-semibold text-gray-800 outline-none focus:ring-2 focus:ring-emerald-500"
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex justify-end gap-3 pt-2">
                                        <Button
                                            type="submit"
                                            variant="primary"
                                            disabled={isSavingLandmark}
                                            className="px-6 !bg-[#F97316] hover:!bg-[#EA580C] !border-[#F97316] text-xs font-bold"
                                        >
                                            {isSavingLandmark ? 'Saving...' : (editingLandmarkId ? 'Update Landmark' : 'Register Landmark')}
                                        </Button>
                                    </div>
                                </form>

                                {/* Landmark Cards Grid */}
                                <div className="space-y-3 pt-2">
                                    <h4 className="text-xs font-black text-gray-900 uppercase tracking-wider">
                                        Jurisdiction Landmarks ({filteredLandmarks.length})
                                    </h4>

                                    {loadingLandmarks ? (
                                        <p className="text-xs text-gray-400 font-bold animate-pulse">Loading registered landmarks...</p>
                                    ) : filteredLandmarks.length === 0 ? (
                                        <div className="p-8 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                                            <p className="text-gray-400 text-xs font-semibold">No landmarks match the selected filter.</p>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {filteredLandmarks.map((item) => {
                                                const cat = getLandmarkCategory(item.category, item.is_holding_facility);
                                                return (
                                                    <div
                                                        key={item.landmark_id}
                                                        className={`p-4 rounded-2xl border transition-all ${
                                                            item.is_holding_facility
                                                                ? 'bg-gradient-to-br from-emerald-50/70 to-teal-50/40 border-emerald-200 shadow-xs'
                                                                : 'bg-white border-gray-200 shadow-xs'
                                                        }`}
                                                    >
                                                        <div className="flex items-start justify-between gap-2">
                                                            <div>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-xl">{cat.emoji}</span>
                                                                    <h5 className="text-xs font-black text-gray-900 leading-tight">{item.name}</h5>
                                                                </div>
                                                                {item.description && (
                                                                    <p className="text-[11px] text-gray-500 font-medium mt-1 leading-snug">{item.description}</p>
                                                                )}
                                                                <span className="text-[10px] text-gray-400 font-bold mt-1 inline-block">
                                                                    {item.subdivision_name || 'Barangay San Vicente (General)'}
                                                                </span>
                                                            </div>
                                                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider shrink-0 ${
                                                                item.is_holding_facility
                                                                    ? 'bg-emerald-600 text-white shadow-xs'
                                                                    : `${cat.badgeBg} ${cat.badgeText}`
                                                            }`}>
                                                                {cat.emoji} {item.is_holding_facility ? 'Holding Facility' : cat.label}
                                                            </span>
                                                        </div>

                                                        {item.is_holding_facility && (
                                                            <div className="mt-2.5 pt-2 border-t border-emerald-200/50 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-emerald-900 font-semibold">
                                                                <span>Type: <strong>{item.facility_type || 'Holding Pen'}</strong></span>
                                                                <span>Capacity: <strong>{item.capacity || 0} animals</strong></span>
                                                                {item.contact_person && <span>Contact: <strong>{item.contact_person}</strong></span>}
                                                                {item.contact_number && <span>Phone: <strong>{item.contact_number}</strong></span>}
                                                            </div>
                                                        )}

                                                        <div className="mt-3 pt-2.5 border-t border-gray-100 flex items-center justify-between text-[10px] text-gray-400 font-medium">
                                                            <span>Lat: {item.latitude.toFixed(5)}, Lng: {item.longitude.toFixed(5)}</span>
                                                            <div className="flex items-center gap-2">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleEditLandmark(item)}
                                                                    className="text-orange-600 hover:text-orange-800 font-bold hover:underline cursor-pointer"
                                                                >
                                                                    Edit
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleDeleteLandmark(item.landmark_id)}
                                                                    className="text-rose-600 hover:text-rose-800 font-bold hover:underline cursor-pointer"
                                                                >
                                                                    Delete
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                    </div>
                </main>
            </div>
        </div>
    );
};

export default AdminAccountSettings;
