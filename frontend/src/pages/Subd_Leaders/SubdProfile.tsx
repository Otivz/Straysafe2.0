import { useState, useEffect } from 'react';
import PhoneInput from '../../components/PhoneInput';
import axios from 'axios';
import api from '../../utils/api';
import { locationErrorMessage } from '../../utils/geolocationDefaults';
import { DEFAULT_AVATAR, getProfilePicture } from '../../utils/avatar';
import SubdSidebar from '../../components/SubdSidebar';
import SubdNavbar from '../../components/Navbars/SubdNavbar';
import SubdBottomNav from '../../components/Navbars/SubdBottomNav';
import Button from '../../components/Button';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIconRetina from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

import MapAutoResize from '../../components/MapControls/MapAutoResize';
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
                    <p className="font-black text-[#B35D25] uppercase tracking-wide">📍 Home Pinpoint</p>
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
    subdivision_id: number;
    profile_picture?: string;
    created_at?: string;
}

const SubdProfile = () => {
    // Get initial user from local storage
    const rawUser = localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user');
    const initialUserObj = rawUser ? JSON.parse(rawUser) : null;

    const [user, setUser] = useState<UserProfile | null>(initialUserObj);
    const [name, setName] = useState(initialUserObj?.name || '');
    const [phone, setPhone] = useState(initialUserObj?.phone || '');
    const [address, setAddress] = useState(initialUserObj?.address || '');
    const [latitude, setLatitude] = useState<number | string | null>(initialUserObj?.latitude || null);
    const [longitude, setLongitude] = useState<number | string | null>(initialUserObj?.longitude || null);
    const [resolvedAddress, setResolvedAddress] = useState<string>('');
    const [isGeocoding, setIsGeocoding] = useState<boolean>(false);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [uploadingPic, setUploadingPic] = useState(false);
    const [gettingLocation, setGettingLocation] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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
            const response = await api.get(`/users/${initialUserObj.user_id}`);
            if (response.data) {
                const userData = response.data;
                setUser(userData);
                setName(userData.name || '');
                setPhone(userData.phone || '');
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

    useEffect(() => {
        fetchUserProfile();
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
                setErrorMsg(locationErrorMessage(err));
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

    const hasPin = Boolean(latitude && longitude);
    const isActiveStatus = (user?.status || 'Active').toLowerCase() === 'active';
    const FIELD = 'w-full min-w-0 h-11 px-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-role/20 focus:border-role/40 transition-colors';

    return (
        <div className="min-h-screen w-full flex bg-[#F8FAFC] font-sans text-gray-800">
            {/* Sidebar */}
            <div className="z-10 flex shrink-0">
                <SubdSidebar mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />
            </div>

            {/* Main Content */}
            <main className="flex-1 flex flex-col h-screen overflow-hidden">
                {/* Navbar */}
                <SubdNavbar
                    onMenuToggle={() => setMobileMenuOpen(true)}
                    leftContent={
                        <div className="flex flex-col">
                            <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none uppercase">Account Profile</h1>
                            <p className="text-[9px] text-gray-400 font-extrabold uppercase tracking-wider mt-1.5 leading-none">View and manage your subdivision leader user information and location</p>
                        </div>
                    }
                />

                <div className="flex-1 overflow-y-auto px-3 py-4 sm:p-6 md:p-8 pb-36 md:pb-10 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
                    <div className="w-full max-w-5xl mx-auto flex flex-col gap-3 sm:gap-4 min-w-0">
                        {/* Heading (phones; desktop shows it in the top bar) */}
                        <div className="md:hidden">
                            <h1 className="text-lg font-black text-gray-900 tracking-tight leading-tight">Profile</h1>
                            <p className="text-xs font-semibold text-gray-500">Your account details and home location.</p>
                        </div>

                        {loading ? (
                            <div className="flex flex-col gap-3">
                                <div className="bg-white rounded-2xl border border-gray-200/80 p-4 animate-pulse flex gap-4">
                                    <div className="w-20 h-20 rounded-full bg-gray-200 shrink-0" />
                                    <div className="flex-1 space-y-2 pt-2">
                                        <div className="h-4 w-1/2 bg-gray-200 rounded" />
                                        <div className="h-3 w-1/3 bg-gray-100 rounded" />
                                    </div>
                                </div>
                                <div className="bg-white rounded-2xl border border-gray-200/80 h-64 animate-pulse" />
                            </div>
                        ) : errorMsg && !user ? (
                            <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
                                <h3 className="text-sm font-black text-red-900">Couldn't load your profile</h3>
                                <p className="text-xs text-red-700 mt-1 leading-relaxed">{errorMsg}</p>
                            </div>
                        ) : (
                            <>
                                {/* Messages */}
                                {successMsg && (
                                    <div role="status" className="p-3 bg-green-50 border border-green-200 rounded-xl text-xs font-bold text-green-800 flex items-start gap-2 animate-in fade-in duration-200">
                                        <span aria-hidden="true">✓</span>
                                        <span className="min-w-0 break-words">{successMsg}</span>
                                    </div>
                                )}
                                {errorMsg && (
                                    <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-bold text-red-800 flex items-start gap-2 animate-in fade-in duration-200">
                                        <span aria-hidden="true">⚠️</span>
                                        <span className="min-w-0 break-words">{errorMsg}</span>
                                    </div>
                                )}

                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 items-start">
                                    {/* ── Profile summary ── */}
                                    <section className="bg-white rounded-2xl border border-gray-200/80 p-4 min-w-0 lg:sticky lg:top-0">
                                        <div className="flex items-center gap-4 lg:flex-col lg:text-center">
                                            <div className="relative shrink-0">
                                                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden bg-gray-100 border border-gray-200">
                                                    <img loading="lazy" decoding="async"
                                                        src={getProfilePicture(user?.profile_picture)}
                                                        alt={user?.name || 'Profile'}
                                                        className="w-full h-full object-cover"
                                                        onError={(e) => { e.currentTarget.src = DEFAULT_AVATAR; }}
                                                    />
                                                    {uploadingPic && (
                                                        <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
                                                            <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                                        </div>
                                                    )}
                                                </div>
                                                {/* Always visible (hover doesn't exist on phones) */}
                                                <label
                                                    className={`absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-role hover:bg-role-hover text-white border-2 border-white flex items-center justify-center cursor-pointer shadow-sm ${uploadingPic ? 'pointer-events-none opacity-60' : ''}`}
                                                    title="Change photo"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24" aria-hidden="true">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
                                                    </svg>
                                                    <span className="sr-only">Change profile photo</span>
                                                    <input
                                                        type="file"
                                                        accept="image/*"
                                                        onChange={fileChange => handleFileChange(fileChange)}
                                                        className="hidden"
                                                    />
                                                </label>
                                            </div>
                                            <div className="min-w-0 flex-1 lg:w-full">
                                                <h2 className="text-lg font-black text-gray-900 leading-snug break-words">{user?.name}</h2>
                                                <div className="flex flex-wrap items-center gap-1.5 mt-1.5 lg:justify-center">
                                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide bg-role-soft text-role-hover border border-role-border">Subdivision Leader</span>
                                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide border ${isActiveStatus ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                                                        <span className={`w-1.5 h-1.5 rounded-full ${isActiveStatus ? 'bg-green-500' : 'bg-gray-400'}`} />
                                                        {user?.status || 'Active'}
                                                    </span>
                                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide bg-blue-50 text-blue-700 border border-blue-200">Verified Leader</span>
                                                </div>
                                            </div>
                                        </div>

                                        <dl className="mt-4 pt-3 border-t border-gray-100 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs">
                                            <dt className="font-semibold text-gray-500">Member since</dt>
                                            <dd className="font-bold text-gray-900 text-right">{memberSinceDate}</dd>
                                            <dt className="font-semibold text-gray-500">Address</dt>
                                            <dd className="font-bold text-gray-900 text-right break-words">{user?.address || 'Not specified'}</dd>
                                            <dt className="font-semibold text-gray-500">Home pin</dt>
                                            <dd className="font-bold text-right text-role-hover">
                                                {user?.latitude && user?.longitude
                                                    ? `${parseFloat(user.latitude.toString()).toFixed(4)}, ${parseFloat(user.longitude.toString()).toFixed(4)}`
                                                    : <span className="text-gray-400 font-semibold">Not set</span>}
                                            </dd>
                                        </dl>
                                    </section>

                                    {/* ── Editable details ── */}
                                    <form onSubmit={saveForm => handleSave(saveForm)} className="lg:col-span-2 flex flex-col gap-3 sm:gap-4 min-w-0">
                                        <section className="bg-white rounded-2xl border border-gray-200/80 p-4 sm:p-5 min-w-0">
                                            <h3 className="text-sm font-black text-gray-900">Personal information</h3>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
                                                <div className="min-w-0">
                                                    <label htmlFor="profile-name" className="block text-xs font-bold text-gray-700 mb-1">Full name</label>
                                                    <input
                                                        id="profile-name"
                                                        type="text"
                                                        value={name}
                                                        onChange={e => setName(e.target.value)}
                                                        required
                                                        placeholder="Enter your full name"
                                                        className={FIELD}
                                                    />
                                                </div>
                                                <div className="min-w-0">
                                                    <label htmlFor="profile-email" className="block text-xs font-bold text-gray-700 mb-1">Email address</label>
                                                    <input
                                                        id="profile-email"
                                                        type="email"
                                                        value={user?.email}
                                                        readOnly
                                                        disabled
                                                        placeholder="Enter your email address"
                                                        className="w-full min-w-0 h-11 px-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-500 cursor-not-allowed"
                                                    />
                                                    <p className="text-[11px] text-gray-400 mt-1">Email can't be changed here.</p>
                                                </div>
                                                <div className="min-w-0">
                                                    <label htmlFor="profile-phone" className="block text-xs font-bold text-gray-700 mb-1">Phone number</label>
                                                    <PhoneInput
                                                        id="profile-phone"
                                                        value={phone}
                                                        onChange={e => setPhone(e.target.value)}
                                                        placeholder="e.g. +639123456789"
                                                        className={FIELD}
                                                    />
                                                </div>
                                                <div className="min-w-0">
                                                    <label htmlFor="profile-address" className="block text-xs font-bold text-gray-700 mb-1">Subdivision / street address</label>
                                                    <input
                                                        id="profile-address"
                                                        type="text"
                                                        value={address}
                                                        onChange={e => setAddress(e.target.value)}
                                                        placeholder="e.g. Blk 12 Lot 5, Emerald St, Selera Homes"
                                                        className={FIELD}
                                                    />
                                                </div>
                                            </div>
                                        </section>

                                        {/* Home location */}
                                        <section className="bg-white rounded-2xl border border-gray-200/80 p-4 sm:p-5 min-w-0">
                                            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <h3 className="text-sm font-black text-gray-900">Home location</h3>
                                                    <p className="text-xs text-gray-500 mt-0.5">Tap the map or use GPS to pin your house.</p>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <button
                                                        type="button"
                                                        onClick={handleGetCurrentLocation}
                                                        disabled={gettingLocation}
                                                        className="flex-1 sm:flex-initial h-10 px-3.5 bg-role-soft hover:bg-role-muted text-role-hover border border-role-border rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                                                    >
                                                        {gettingLocation ? (
                                                            <span className="w-3.5 h-3.5 border-2 border-role-hover border-t-transparent rounded-full animate-spin"></span>
                                                        ) : (
                                                            <span aria-hidden="true">🎯</span>
                                                        )}
                                                        Use Current GPS
                                                    </button>
                                                    {(latitude || longitude) && (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setLatitude(null);
                                                                setLongitude(null);
                                                                setResolvedAddress('');
                                                            }}
                                                            className="h-10 px-3.5 border border-gray-200 bg-white text-gray-600 hover:text-red-600 hover:border-red-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                                                        >
                                                            Clear
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="mt-3 w-full h-64 sm:h-72 rounded-xl overflow-hidden border border-gray-200 relative z-0">
                                                <MapContainer
                                                    center={currentMapCenter}
                                                    zoom={16}
                                                    className="h-full w-full"
                                                >
                                                    <MapAutoResize />
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

                                            {/* Pin details */}
                                            <div className="mt-3 text-xs min-w-0">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="font-bold text-gray-700">Pinned location</span>
                                                    {isGeocoding ? (
                                                        <span className="text-[11px] text-role-hover font-bold flex items-center gap-1.5">
                                                            <span className="w-3 h-3 border-2 border-role-hover border-t-transparent rounded-full animate-spin"></span>
                                                            Finding street address…
                                                        </span>
                                                    ) : hasPin ? (
                                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide bg-green-50 text-green-700 border border-green-200">✓ Pinned</span>
                                                    ) : (
                                                        <span className="text-[11px] font-semibold text-gray-400">No pin set</span>
                                                    )}
                                                </div>
                                                {hasPin ? (
                                                    <div className="mt-2 flex flex-col sm:flex-row sm:items-center gap-2">
                                                        <div className="min-w-0 flex-1">
                                                            <p className="font-semibold text-gray-900 break-words">
                                                                {resolvedAddress || `${parseFloat(latitude!.toString()).toFixed(5)}, ${parseFloat(longitude!.toString()).toFixed(5)}`}
                                                            </p>
                                                            <p className="text-[11px] text-gray-500 font-mono mt-0.5">
                                                                {parseFloat(latitude!.toString()).toFixed(6)}, {parseFloat(longitude!.toString()).toFixed(6)}
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
                                                                className="h-9 px-3 shrink-0 bg-white hover:bg-role-soft text-role-hover border border-role-border rounded-xl text-xs font-bold transition-colors cursor-pointer"
                                                            >
                                                                Use as address
                                                            </button>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <p className="mt-1 text-gray-500">Tap the map or <span className="font-semibold text-gray-700">Use Current GPS</span> to pin your home.</p>
                                                )}
                                            </div>
                                        </section>

                                        <div className="flex sm:justify-end">
                                            <Button
                                                variant="primary"
                                                type="submit"
                                                disabled={saving}
                                                className="w-full sm:w-auto h-11 px-8 bg-role hover:bg-role-hover text-white rounded-xl flex items-center justify-center gap-2 font-black text-sm disabled:opacity-50"
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
                            </>
                        )}
                    </div>
                </div>

                {/* Reusable Mobile Bottom Navigation */}
                <SubdBottomNav />
            </main>
        </div>
    );
};

export default SubdProfile;
