import { useState, useEffect } from 'react';
import axios from 'axios';
import api from '../../utils/api';
import { DEFAULT_AVATAR, getProfilePicture } from '../../utils/avatar';
import BrgySidebar from '../../components/BrgySidebar';
import BrgyNavbar from '../../components/Navbars/BrgyNavbar';
import Button from '../../components/Button';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIconRetina from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
    iconUrl: markerIcon,
    iconRetinaUrl: markerIconRetina,
    shadowUrl: markerShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

const LocationPicker = ({ onLocationSelect, position, addressLabel }: { onLocationSelect: (lat: number, lng: number) => void, position: [number, number] | null, addressLabel?: string }) => {
    useMapEvents({
        click(e) {
            onLocationSelect(e.latlng.lat, e.latlng.lng);
        },
    });
    return (position && position[0] && position[1]) ? (
        <Marker position={position}>
            <Popup>
                <div className="p-2 text-center text-xs min-w-[140px]">
                    <p className="font-black text-[#F97316] uppercase tracking-wide">📍 Station / Residence Pinpoint</p>
                    <p className="text-[11px] text-gray-700 mt-1 font-semibold leading-tight">
                        {addressLabel || `${position[0].toFixed(5)}, ${position[1].toFixed(5)}`}
                    </p>
                </div>
            </Popup>
        </Marker>
    ) : null;
};

const RecenterMap = ({ position }: { position: [number, number] | null }) => {
    const map = useMap();
    useEffect(() => {
        if (position && position[0] && position[1]) {
            map.setView(position, map.getZoom());
        }
    }, [position, map]);
    return null;
};

interface UserProfile {
    user_id: number;
    name: string;
    email: string;
    phone: string;
    address: string;
    latitude?: number | string | null;
    longitude?: number | string | null;
    status: string;
    role_id: number;
    barangay_id?: number | null;
    is_head_officer?: boolean;
    barangay_name?: string | null;
    position_name?: string | null;
    position?: string | null;
    subdivision_id?: number | null;
    profile_picture?: string;
    created_at?: string;
}

const BrgyProfile = () => {
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

    // Get initial user from local storage
    const rawUser = localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user');
    const initialUserObj = rawUser ? JSON.parse(rawUser) : null;

    const [user, setUser] = useState<UserProfile | null>(initialUserObj);
    const [name, setName] = useState(initialUserObj?.name || '');
    const [phone, setPhone] = useState(initialUserObj?.phone || '');
    const [position, setPosition] = useState(initialUserObj?.position_name || initialUserObj?.position || '');
    const [address, setAddress] = useState(initialUserObj?.address || '');
    const [latitude, setLatitude] = useState<number | string | null>(initialUserObj?.latitude || null);
    const [longitude, setLongitude] = useState<number | string | null>(initialUserObj?.longitude || null);
    const [resolvedAddress, setResolvedAddress] = useState<string>('');
    const [isGeocoding, setIsGeocoding] = useState<boolean>(false);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [uploadingPic, setUploadingPic] = useState(false);
    const [gettingLocation, setGettingLocation] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [dynamicPositions, setDynamicPositions] = useState<{position_id: number, position_name: string}[]>([]);

    const fetchUserProfile = async () => {
        if (!initialUserObj || !initialUserObj.user_id) {
            setErrorMsg("No active user session found.");
            setLoading(false);
            return;
        }

        try {
            setLoading(true);
            const response = await api.get(`/users/${initialUserObj.user_id}`);
            if (response.data) {
                const userData = response.data;
                setUser(userData);
                setName(userData.name || '');
                setPhone(userData.phone || '');
                setPosition(userData.position_name || userData.position || '');
                setAddress(userData.address || '');
                setLatitude(userData.latitude || null);
                setLongitude(userData.longitude || null);
            }
        } catch (err) {
            console.error('Error fetching user profile details:', err);
            setErrorMsg("Failed to retrieve profile data from the server.");
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
        fetchUserProfile();
        fetchPositions();
    }, []);

    // Reverse geocode when coordinates change
    useEffect(() => {
        if (!latitude || !longitude) {
            setResolvedAddress('');
            return;
        }

        const latNum = parseFloat(latitude.toString());
        const lngNum = parseFloat(longitude.toString());
        if (isNaN(latNum) || isNaN(lngNum)) return;

        let isMounted = true;
        const fetchGeocodeAddress = async () => {
            setIsGeocoding(true);
            try {
                const response = await axios.get('https://nominatim.openstreetmap.org/reverse', {
                    params: {
                        format: 'jsonv2',
                        lat: latNum,
                        lon: lngNum,
                        addressdetails: 1
                    },
                    headers: { 'Accept-Language': 'en' }
                });
                if (isMounted && response.data && response.data.address) {
                    const addr = response.data.address;
                    const parts: string[] = [];
                    if (addr.house_number) parts.push(`No. ${addr.house_number}`);
                    if (addr.road || addr.street) parts.push(addr.road || addr.street);
                    if (addr.neighbourhood || addr.subdivision || addr.residential) parts.push(addr.neighbourhood || addr.subdivision || addr.residential);
                    if (addr.village || addr.suburb) parts.push(addr.village || addr.suburb || 'San Vicente');
                    if (addr.city || addr.town || addr.municipality) parts.push(addr.city || addr.town || addr.municipality || 'Santa Maria');
                    if (addr.province || addr.state) parts.push(addr.province || addr.state || 'Bulacan');

                    const fullFormatted = parts.filter(Boolean).join(', ') || response.data.display_name;
                    setResolvedAddress(fullFormatted);
                }
            } catch (err) {
                console.warn('Reverse geocoding error:', err);
            } finally {
                if (isMounted) setIsGeocoding(false);
            }
        };

        const timer = setTimeout(fetchGeocodeAddress, 400);
        return () => {
            isMounted = false;
            clearTimeout(timer);
        };
    }, [latitude, longitude]);

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

    const handleGetCurrentLocation = () => {
        if (!("geolocation" in navigator)) {
            setErrorMsg("Geolocation is not supported by your browser.");
            return;
        }

        setGettingLocation(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setLatitude(pos.coords.latitude);
                setLongitude(pos.coords.longitude);
                setGettingLocation(false);
                setSuccessMsg("Location pinpointed from your current GPS position!");
                setTimeout(() => setSuccessMsg(''), 3000);
            },
            (err) => {
                console.error("GPS error:", err);
                setErrorMsg("Unable to retrieve your current location. Please click on the map manually.");
                setGettingLocation(false);
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
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
                address: address || null,
                position: position || null,
                latitude: latitude ? parseFloat(latitude.toString()) : null,
                longitude: longitude ? parseFloat(longitude.toString()) : null
            };

            const response = await api.put(`/users/${user.user_id}`, payload);
            if (response.data) {
                setUser(response.data);
                updateLocalStorageUser({
                    name: response.data.name,
                    phone: response.data.phone,
                    address: response.data.address,
                    position: response.data.position || response.data.position_name,
                    position_name: response.data.position_name || response.data.position,
                    latitude: response.data.latitude,
                    longitude: response.data.longitude
                });
                setSuccessMsg("Profile details and location updated successfully!");
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
            const response = await api.post(`/users/${user.user_id}/profile-picture`, formData, {
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

    const defaultLat = 14.806906;
    const defaultLng = 121.0039297;
    const currentMapCenter: [number, number] = [
        latitude ? parseFloat(latitude.toString()) : defaultLat,
        longitude ? parseFloat(longitude.toString()) : defaultLng
    ];

    return (
        <div className="min-h-screen w-full flex bg-[#FDFDFD] font-sans text-gray-800 relative overflow-hidden">
            {/* Decorative Background Elements */}
            <div className="absolute top-0 left-0 w-[600px] h-[600px] bg-orange-500/5 rounded-full blur-[100px] pointer-events-none -translate-x-1/2 -translate-y-1/2 z-0"></div>
            <div className="absolute bottom-0 right-0 w-[800px] h-[800px] bg-purple-500/5 rounded-full blur-[120px] pointer-events-none translate-x-1/3 translate-y-1/3 z-0"></div>

            {/* Sidebar */}
            <div className="z-10 flex shrink-0">
                <BrgySidebar 
                    isMobileOpen={isMobileSidebarOpen}
                    onCloseMobile={() => setIsMobileSidebarOpen(false)}
                />
            </div>

            {/* Main Content */}
            <main className="flex-1 flex flex-col h-screen overflow-hidden">
                {/* Navbar */}
                <BrgyNavbar
                    onMenuToggle={() => setIsMobileSidebarOpen(true)}
                    leftContent={
                        <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                                <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none uppercase">Account Profile</h1>
                                {user?.is_head_officer ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-purple-100 text-purple-800 border border-purple-200">
                                        ★ Head Officer
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-teal-50 text-teal-700 border border-teal-200">
                                        Field Staff
                                    </span>
                                )}
                            </div>
                            <p className="text-[9px] text-gray-400 font-extrabold uppercase tracking-wider mt-1.5 leading-none">
                                View and manage your Barangay user account information, station, and pinpoint location
                            </p>
                        </div>
                    }
                />

                {/* Main Content Container */}
                <div className="flex-1 overflow-y-auto p-8 lg:p-10 flex flex-col items-center justify-start scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
                    <div className="w-full max-w-5xl space-y-8 animate-in fade-in duration-500 pb-16">
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
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                                
                                {/* Left Column: Profile Card */}
                                <div className="bg-white border border-gray-100 shadow-xl rounded-[2.5rem] p-8 flex flex-col items-center text-center relative overflow-hidden group">
                                    <div className={`absolute top-0 inset-x-0 h-2 ${
                                        user?.is_head_officer 
                                            ? 'bg-gradient-to-r from-purple-600 via-purple-700 to-indigo-700' 
                                            : 'bg-gradient-to-r from-orange-400 to-[#F97316]'
                                    }`}></div>
                                    
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
                                    
                                    {user?.is_head_officer ? (
                                        <p className="inline-flex items-center gap-1.5 text-[10px] font-black text-purple-800 uppercase tracking-wide mt-1.5 bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 px-3 py-1 rounded-full shadow-xs">
                                            <svg className="w-3 h-3 text-amber-500 fill-current" viewBox="0 0 20 20">
                                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                            </svg>
                                            {user?.position_name || user?.position || 'Barangay Head Officer (OIC)'}
                                        </p>
                                    ) : (
                                        <p className="text-[10px] font-extrabold text-[#F97316] uppercase tracking-wider mt-1 bg-orange-50/50 border border-orange-100 px-3 py-1 rounded-full">
                                            {user?.position_name || user?.position || 'Barangay Field Staff'}
                                        </p>
                                    )}

                                    <div className="w-full border-t border-gray-50 my-6"></div>

                                    {/* Small Info Grid */}
                                    <div className="w-full space-y-4 text-left text-xs font-semibold text-gray-600">
                                        <div className="flex items-center justify-between">
                                            <span className="text-gray-400">Jurisdiction</span>
                                            <span className="text-gray-900 font-bold">
                                                {user?.barangay_name || 'San Vicente'}, Santa Maria
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-gray-400">Position</span>
                                            <span className="text-[#F97316] font-bold">
                                                {user?.position_name || user?.position || (user?.is_head_officer ? 'Barangay Captain' : 'Animal Rescuer')}
                                            </span>
                                        </div>
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
                                            <span className="text-gray-400">Address</span>
                                            <span className="text-gray-800 font-bold truncate max-w-[140px] text-right" title={user?.address || 'Not specified'}>
                                                {user?.address || 'Not specified'}
                                            </span>
                                        </div>
                                        {user?.latitude && user?.longitude && (
                                            <div className="flex items-center justify-between">
                                                <span className="text-gray-400">Station Pinpoint</span>
                                                <span className="text-orange-600 font-black text-[11px] bg-orange-50 px-2 py-0.5 rounded-lg border border-orange-100">
                                                    📍 {parseFloat(user.latitude.toString()).toFixed(4)}, {parseFloat(user.longitude.toString()).toFixed(4)}
                                                </span>
                                            </div>
                                        )}
                                        <div className="flex items-center justify-between">
                                            <span className="text-gray-400">Authority</span>
                                            <span className={`${user?.is_head_officer ? 'text-purple-700' : 'text-blue-600'} font-extrabold flex items-center gap-1`}>
                                                {user?.is_head_officer ? '👑 Command Officer' : '🛡️ Field Rescuer'}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Right Column: Edit Profile Form & Location Picker */}
                                <div className="lg:col-span-2 bg-white border border-gray-100 shadow-xl rounded-[2.5rem] p-8 lg:p-10 flex flex-col relative overflow-hidden">

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

                                    <form onSubmit={saveForm => handleSave(saveForm)} className="space-y-6">
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

                                            {/* Position / Designation */}
                                            <div className="flex flex-col gap-1.5 sm:col-span-2 bg-gray-50/60 p-4 rounded-2xl border border-gray-100">
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">
                                                    Position / Designation
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
                                                                value={allPositions.includes(position) ? position : (position ? 'Other' : '')}
                                                                onChange={(e) => {
                                                                    const val = e.target.value;
                                                                    if (val === 'Other') {
                                                                        setPosition('');
                                                                    } else {
                                                                        setPosition(val);
                                                                    }
                                                                }}
                                                                className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-800 focus:ring-2 focus:ring-[#F97316] outline-none transition-all shadow-sm"
                                                            >
                                                                <option value="">Select Official Position...</option>
                                                                {allPositions.map(pos => (
                                                                    <option key={pos} value={pos}>{pos}</option>
                                                                ))}
                                                                <option value="Other">Other (Custom Designation...)</option>
                                                            </select>

                                                            {(!allPositions.includes(position)) && (
                                                                <div className="pt-2 animate-in fade-in duration-200">
                                                                    <label className="text-[9px] font-black text-orange-600 uppercase tracking-wider ml-1 block mb-1">
                                                                        Specify Custom Position Title
                                                                    </label>
                                                                    <input 
                                                                        type="text" 
                                                                        value={position} 
                                                                        onChange={e => setPosition(e.target.value)} 
                                                                        placeholder="e.g. Purok Coordinator, Veterinary Aid, Patrol Officer..." 
                                                                        className="w-full px-4 py-2.5 bg-white border border-orange-200 rounded-xl text-xs font-bold text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#F97316]/15 focus:border-[#F97316] transition-all shadow-xs"
                                                                    />
                                                                </div>
                                                            )}
                                                        </>
                                                    );
                                                })()}
                                            </div>


                                            {/* Station / Base Address */}
                                            <div className="sm:col-span-2 flex flex-col gap-1.5">
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Office / Station Address</label>
                                                <input 
                                                    type="text" 
                                                    value={address} 
                                                    onChange={e => setAddress(e.target.value)} 
                                                    placeholder="e.g. Barangay San Vicente Hall, Santa Maria, Bulacan" 
                                                    className="px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-xs font-bold text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#F97316]/15 focus:border-[#F97316] focus:bg-white transition-all shadow-sm"
                                                />
                                            </div>
                                        </div>

                                        {/* Pinpoint Location Section */}
                                        <div className="pt-3 border-t border-gray-100 flex flex-col gap-3.5">
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                                <div>
                                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1 flex items-center gap-1.5">
                                                        <span>📍 Pinpoint Exact Station & Base Location</span>
                                                    </label>
                                                    <p className="text-[11px] text-gray-500 font-medium pl-1 mt-0.5">
                                                        Click on the map or use GPS to set your exact Barangay station or rescuer location
                                                    </p>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={handleGetCurrentLocation}
                                                        disabled={gettingLocation}
                                                        className="px-3 py-1.5 bg-orange-50 hover:bg-orange-100 text-[#F97316] border border-orange-200 rounded-xl text-[11px] font-bold flex items-center gap-1.5 transition-all shadow-xs disabled:opacity-50"
                                                    >
                                                        {gettingLocation ? (
                                                            <span className="w-3 h-3 border-2 border-[#F97316] border-t-transparent rounded-full animate-spin"></span>
                                                        ) : (
                                                            <span>🎯</span>
                                                        )}
                                                        <span>Use Current GPS</span>
                                                    </button>
                                                    {(latitude || longitude) && (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setLatitude(null);
                                                                setLongitude(null);
                                                                setResolvedAddress('');
                                                            }}
                                                            className="px-2.5 py-1.5 text-gray-400 hover:text-red-500 rounded-xl text-[11px] font-bold transition-all"
                                                        >
                                                            Clear
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Map Container */}
                                            <div className="w-full h-72 rounded-2xl overflow-hidden border border-gray-200 relative shadow-inner z-0">
                                                <MapContainer
                                                    center={currentMapCenter}
                                                    zoom={16}
                                                    className="h-full w-full"
                                                >
                                                    <TileLayer
                                                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                                                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                                    />
                                                    <LocationPicker
                                                        position={(latitude && longitude) ? [parseFloat(latitude.toString()), parseFloat(longitude.toString())] : null}
                                                        addressLabel={resolvedAddress || address}
                                                        onLocationSelect={(latVal, lngVal) => {
                                                            setLatitude(latVal);
                                                            setLongitude(lngVal);
                                                        }}
                                                    />
                                                    <RecenterMap
                                                        position={(latitude && longitude) ? [parseFloat(latitude.toString()), parseFloat(longitude.toString())] : null}
                                                    />
                                                </MapContainer>
                                            </div>

                                            {/* Exact Location Details Card */}
                                            <div className="bg-orange-50/70 border border-orange-200/80 rounded-2xl p-4 flex flex-col gap-2.5 shadow-xs">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <span className="w-6 h-6 rounded-lg bg-orange-500/10 text-orange-600 flex items-center justify-center text-xs font-black">🏢</span>
                                                        <span className="text-[11px] font-black text-gray-800 uppercase tracking-wide">Exact Station & Property Details</span>
                                                    </div>
                                                    {isGeocoding ? (
                                                        <span className="text-[10px] text-orange-600 font-bold flex items-center gap-1.5 animate-pulse">
                                                            <span className="w-3 h-3 border-2 border-orange-600 border-t-transparent rounded-full animate-spin"></span>
                                                            Resolving street address...
                                                        </span>
                                                    ) : (latitude && longitude) ? (
                                                        <span className="text-[10px] font-extrabold text-green-700 bg-green-100 px-2 py-0.5 rounded-md border border-green-200">
                                                            ✓ Pinned
                                                        </span>
                                                    ) : (
                                                        <span className="text-[10px] font-bold text-gray-400 italic">
                                                            No pinpoint set
                                                        </span>
                                                    )}
                                                </div>

                                                {(latitude && longitude) ? (
                                                    <div className="space-y-2 pt-2 border-t border-orange-200/60">
                                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                                                            <div className="flex-1">
                                                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Detected Exact Street & Barangay</p>
                                                                <p className="text-xs font-black text-gray-900 mt-0.5">
                                                                    {resolvedAddress || `${parseFloat(latitude.toString()).toFixed(5)}, ${parseFloat(longitude.toString()).toFixed(5)}`}
                                                                </p>
                                                            </div>
                                                            {resolvedAddress && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setAddress(resolvedAddress);
                                                                        setSuccessMsg("Address field filled with detected exact address!");
                                                                        setTimeout(() => setSuccessMsg(''), 3000);
                                                                    }}
                                                                    className="px-3 py-1.5 bg-[#F97316] hover:bg-[#EA580C] text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shadow-xs shrink-0 self-start sm:self-auto flex items-center gap-1.5"
                                                                >
                                                                    <span>📝</span>
                                                                    <span>Use As Address</span>
                                                                </button>
                                                            )}
                                                        </div>

                                                        <div className="flex items-center justify-between text-[10px] text-gray-600 font-semibold bg-white/80 px-3 py-1.5 rounded-xl border border-orange-100">
                                                            <span>Pinpoint Coordinates:</span>
                                                            <span className="font-bold text-[#F97316]">
                                                                {parseFloat(latitude.toString()).toFixed(6)}, {parseFloat(longitude.toString()).toFixed(6)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <p className="text-[11px] text-gray-500 font-medium italic pt-1 border-t border-orange-100">
                                                        Click on the map above or tap <strong className="text-gray-700">"Use Current GPS"</strong> to pinpoint your exact station or residence.
                                                    </p>
                                                )}
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
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
};

export default BrgyProfile;
