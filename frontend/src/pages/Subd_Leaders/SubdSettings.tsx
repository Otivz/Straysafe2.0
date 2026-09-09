import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import api from '../../utils/api';
import { DEFAULT_AVATAR, getProfilePicture } from '../../utils/avatar';
import SubdSidebar from '../../components/SubdSidebar';
import SubdNavbar from '../../components/Navbars/SubdNavbar';
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
                    <p className="font-black text-[#F97316] uppercase tracking-wide">📍 Station / Residence Pin</p>
                    <p className="text-[11px] text-gray-700 mt-1 font-semibold leading-tight">
                        {addressLabel || `${position[0].toFixed(5)}, ${position[1].toFixed(5)}`}
                    </p>
                </div>
            </Popup>
        </Marker>
    ) : null;
};

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

type SettingsTab = 'profile' | 'landmarks' | 'dispatch' | 'citations' | 'notifications' | 'security' | 'preferences';

interface SubdSettingsPreferences {
    defaultViewMode: 'cards' | 'table';
    defaultQueue: 'my_reports' | 'all' | 'unassigned';
    inactivityTakeoverHours: number;
    soundAlerts: boolean;
    criticalBiteSound: boolean;
    autoRefreshInterval: number; // seconds
    defaultWarningTier: 'Notice' | '1st Warning' | '2nd Warning';
    defaultBroadcastRadius: number; // meters
    emailNotifications: boolean;
    smsNotifications: boolean;
    autoGeocodeOnPin: boolean;
    requireConfirmOnEscalate: boolean;
}

const DEFAULT_PREFERENCES: SubdSettingsPreferences = {
    defaultViewMode: 'cards',
    defaultQueue: 'my_reports',
    inactivityTakeoverHours: 24,
    soundAlerts: true,
    criticalBiteSound: true,
    autoRefreshInterval: 30,
    defaultWarningTier: 'Notice',
    defaultBroadcastRadius: 500,
    emailNotifications: true,
    smsNotifications: false,
    autoGeocodeOnPin: true,
    requireConfirmOnEscalate: true
};

const SubdSettings: React.FC = () => {
    const rawUser = localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user');
    const initialUserObj = rawUser ? JSON.parse(rawUser) : null;

    const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
    const [user, setUser] = useState<any>(initialUserObj);
    const [name, setName] = useState(initialUserObj?.name || '');
    const [phone, setPhone] = useState(initialUserObj?.phone || '');
    const [email] = useState(initialUserObj?.email || '');
    const [address, setAddress] = useState(initialUserObj?.address || '');
    const [latitude, setLatitude] = useState<number | string | null>(initialUserObj?.latitude || null);
    const [longitude, setLongitude] = useState<number | string | null>(initialUserObj?.longitude || null);
    const [resolvedAddress, setResolvedAddress] = useState<string>('');
    const [isGeocoding, setIsGeocoding] = useState<boolean>(false);
    const [gettingLocation, setGettingLocation] = useState(false);
    const [uploadingPic, setUploadingPic] = useState(false);
    const [saving, setSaving] = useState(false);
    const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Password fields
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isChangingPassword, setIsChangingPassword] = useState(false);

    // Preferences state
    const [prefs, setPrefs] = useState<SubdSettingsPreferences>(() => {
        try {
            const saved = localStorage.getItem('straysafe_subd_settings');
            return saved ? { ...DEFAULT_PREFERENCES, ...JSON.parse(saved) } : DEFAULT_PREFERENCES;
        } catch {
            return DEFAULT_PREFERENCES;
        }
    });

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Landmarks state
    const [landmarks, setLandmarks] = useState<LandmarkItem[]>([]);
    const [loadingLandmarks, setLoadingLandmarks] = useState(false);
    const [editingLandmarkId, setEditingLandmarkId] = useState<number | null>(null);
    const [subdAccounts, setSubdAccounts] = useState<any[]>([]);
    const [selectedCaretakerUserId, setSelectedCaretakerUserId] = useState<string>('');
    const [landmarkForm, setLandmarkForm] = useState({
        name: '',
        category: 'general',
        description: '',
        latitude: 14.8018,
        longitude: 121.0028,
        is_holding_facility: false,
        facility_type: 'Temporary Holding Pen',
        capacity: 6,
        contact_person: '',
        contact_number: ''
    });
    const [isSavingLandmark, setIsSavingLandmark] = useState(false);

    const fetchLandmarks = async () => {
        const subdId = user?.subdivision_id || 1;
        setLoadingLandmarks(true);
        try {
            const res = await api.get(`/landmarks?subdivision_id=${subdId}`);
            setLandmarks(res.data || []);
        } catch (err) {
            console.error('Failed to load landmarks:', err);
        } finally {
            setLoadingLandmarks(false);
        }
    };

    const fetchSubdAccounts = async () => {
        const subdId = user?.subdivision_id || 1;
        try {
            const res = await api.get(`/users?subdivision_id=${subdId}`);
            if (Array.isArray(res.data)) {
                // Filter to ONLY Subdivision Leader / Officer accounts (exclude residents)
                const onlySubdLeaders = res.data.filter((acc: any) => acc.role_id === 2 || acc.role_name === 'Subdivision Leader');
                setSubdAccounts(onlySubdLeaders);
            }
        } catch (err) {
            console.error('Failed to load subdivision accounts:', err);
        }
    };

    useEffect(() => {
        fetchLandmarks();
        fetchSubdAccounts();
    }, [user?.subdivision_id]);

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
                subdivision_id: user?.subdivision_id || 1,
                barangay_id: user?.barangay_id || 1,
                latitude: parseFloat(landmarkForm.latitude.toString()),
                longitude: parseFloat(landmarkForm.longitude.toString()),
                is_holding_facility: landmarkForm.is_holding_facility,
                facility_type: landmarkForm.is_holding_facility ? (landmarkForm.facility_type || 'Temporary Holding Pen') : null,
                capacity: landmarkForm.is_holding_facility ? (Number(landmarkForm.capacity) || 5) : null,
                contact_person: landmarkForm.contact_person.trim() || null,
                contact_number: landmarkForm.contact_number.trim() || null,
            };

            if (editingLandmarkId) {
                await api.put(`/landmarks/${editingLandmarkId}`, payload);
                showToast('success', 'Landmark updated successfully!');
            } else {
                await api.post('/landmarks', payload);
                showToast('success', 'New landmark registered successfully!');
            }

            setEditingLandmarkId(null);
            setSelectedCaretakerUserId('');
            setLandmarkForm({
                name: '',
                category: 'general',
                description: '',
                latitude: latitude ? parseFloat(latitude.toString()) : 14.8018,
                longitude: longitude ? parseFloat(longitude.toString()) : 121.0028,
                is_holding_facility: false,
                facility_type: 'Temporary Holding Pen',
                capacity: 6,
                contact_person: '',
                contact_number: ''
            });
            fetchLandmarks();
        } catch (err: any) {
            console.error('Save landmark error:', err);
            showToast('error', err.response?.data?.detail || 'Failed to save landmark.');
        } finally {
            setIsSavingLandmark(false);
        }
    };

    const handleDeleteLandmark = async (id: number) => {
        if (!confirm('Are you sure you want to delete this landmark?')) return;
        try {
            await api.delete(`/landmarks/${id}`);
            showToast('success', 'Landmark removed successfully.');
            fetchLandmarks();
        } catch (err: any) {
            console.error('Delete landmark error:', err);
            showToast('error', err.response?.data?.detail || 'Failed to delete landmark.');
        }
    };

    const handleEditLandmark = (item: LandmarkItem) => {
        setEditingLandmarkId(item.landmark_id);
        const matched = subdAccounts.find(acc => acc.name.toLowerCase() === (item.contact_person || '').toLowerCase());
        setSelectedCaretakerUserId(matched ? matched.user_id.toString() : (item.contact_person ? 'custom' : ''));
        setLandmarkForm({
            name: item.name,
            category: item.category || (item.is_holding_facility ? 'facility' : 'general'),
            description: item.description || '',
            latitude: item.latitude,
            longitude: item.longitude,
            is_holding_facility: item.is_holding_facility,
            facility_type: item.facility_type || 'Temporary Holding Pen',
            capacity: item.capacity || 6,
            contact_person: item.contact_person || '',
            contact_number: item.contact_number || ''
        });
    };

    const showToast = (type: 'success' | 'error', text: string) => {
        setToastMessage({ type, text });
        setTimeout(() => setToastMessage(null), 4000);
    };

    // Geocoding helper
    const reverseGeocode = async (lat: number, lng: number) => {
        setIsGeocoding(true);
        try {
            const res = await axios.get('https://nominatim.openstreetmap.org/reverse', {
                params: {
                    format: 'jsonv2',
                    lat,
                    lon: lng,
                    addressdetails: 1
                },
                headers: { 'Accept-Language': 'en' }
            });
            if (res.data && res.data.address) {
                const addr = res.data.address;
                const parts = [];
                const road = addr.road || addr.pedestrian || addr.path || '';
                if (road) parts.push(road);
                const neighbourhood = addr.neighbourhood || addr.subdivision || addr.residential || '';
                if (neighbourhood && neighbourhood !== road) parts.push(neighbourhood);
                const city = addr.city || addr.town || addr.municipality || '';
                if (city) parts.push(city);
                const formatted = parts.join(', ') || res.data.display_name;
                setResolvedAddress(formatted);
                if (!address.trim()) {
                    setAddress(formatted);
                }
            }
        } catch (err) {
            console.error('Reverse geocode error:', err);
            setResolvedAddress(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
        } finally {
            setIsGeocoding(false);
        }
    };

    useEffect(() => {
        if (latitude && longitude && prefs.autoGeocodeOnPin) {
            reverseGeocode(parseFloat(latitude.toString()), parseFloat(longitude.toString()));
        }
    }, [latitude, longitude]);

    const handleLocationSelect = (lat: number, lng: number) => {
        setLatitude(lat);
        setLongitude(lng);
    };

    const handleGetCurrentLocation = () => {
        if (!("geolocation" in navigator)) {
            showToast('error', 'Geolocation is not supported by your browser.');
            return;
        }
        setGettingLocation(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setLatitude(pos.coords.latitude);
                setLongitude(pos.coords.longitude);
                setGettingLocation(false);
                showToast('success', 'Pinpoint updated to current GPS coordinates!');
            },
            (err) => {
                console.error("GPS error:", err);
                showToast('error', 'Unable to retrieve GPS coordinates. Please click on the map.');
                setGettingLocation(false);
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !user) return;

        if (file.size > 5 * 1024 * 1024) {
            showToast('error', 'Image size exceeds 5MB limit.');
            return;
        }

        setUploadingPic(true);
        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await api.post(`/users/${user.user_id}/upload-avatar`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            if (res.data?.profile_picture) {
                const updated = { ...user, profile_picture: res.data.profile_picture };
                setUser(updated);
                localStorage.setItem('staff_user', JSON.stringify(updated));
                showToast('success', 'Profile photo updated successfully!');
            }
        } catch (err: any) {
            console.error('Avatar upload failed:', err);
            showToast('error', err.response?.data?.detail || 'Failed to upload photo.');
        } finally {
            setUploadingPic(false);
        }
    };

    const handleSaveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        setSaving(true);
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
                const updated = { ...user, ...response.data };
                localStorage.setItem('staff_user', JSON.stringify(updated));
                showToast('success', 'Profile and station location saved successfully!');
            }
        } catch (err: any) {
            console.error('Save failed:', err);
            showToast('error', err.response?.data?.detail || 'Failed to save profile changes.');
        } finally {
            setSaving(false);
        }
    };

    const handleSavePreferences = () => {
        try {
            localStorage.setItem('straysafe_subd_settings', JSON.stringify(prefs));
            showToast('success', 'Subdivision operational preferences saved!');
        } catch (e) {
            showToast('error', 'Failed to save preferences to browser storage.');
        }
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newPassword || newPassword.length < 6) {
            showToast('error', 'New password must be at least 6 characters.');
            return;
        }
        if (newPassword !== confirmPassword) {
            showToast('error', 'New passwords do not match.');
            return;
        }
        setIsChangingPassword(true);
        try {
            await api.put(`/users/${user.user_id}`, {
                password: newPassword
            });
            setNewPassword('');
            setConfirmPassword('');
            showToast('success', 'Password updated successfully! Please remember your new password.');
        } catch (err: any) {
            console.error('Password change failed:', err);
            showToast('error', err.response?.data?.detail || 'Failed to change password.');
        } finally {
            setIsChangingPassword(false);
        }
    };

    const navTabs = [
        {
            id: 'profile' as SettingsTab,
            label: 'Officer Profile & Map',
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
            ),
            description: 'Name, contact info, and jurisdiction home/station map pinpoint'
        },
        {
            id: 'landmarks' as SettingsTab,
            label: 'Landmarks & Facility',
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
            ),
            description: 'Designate landmarks and official animal holding facilities'
        },
        {
            id: 'dispatch' as SettingsTab,
            label: 'Case Dispatch & Takeover',
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
            ),
            description: 'Takeover inactivity cooldowns and escalation workflows'
        },
        {
            id: 'citations' as SettingsTab,
            label: 'Citations & Violations',
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
            ),
            description: 'Default citation levels and pet owner violation policies'
        },
        {
            id: 'notifications' as SettingsTab,
            label: 'Notifications & Alerts',
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
            ),
            description: 'Sound triggers, critical bite alerts, and email notices'
        },
        {
            id: 'security' as SettingsTab,
            label: 'Security & Password',
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
            ),
            description: 'Manage authentication password and active session credentials'
        },
        {
            id: 'preferences' as SettingsTab,
            label: 'Interface & Cache',
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
            ),
            description: 'Default dashboard views, table layouts, and memory storage'
        }
    ];

    const currentLat = latitude ? parseFloat(latitude.toString()) : 14.8013;
    const currentLng = longitude ? parseFloat(longitude.toString()) : 121.0031;
    const mapPos: [number, number] = (latitude && longitude) ? [currentLat, currentLng] : [14.8013, 121.0031];

    return (
        <div className="flex h-screen bg-[#F8FAFC]">
            <SubdSidebar />

            <div className="flex-1 flex flex-col overflow-hidden">
                <SubdNavbar
                    leftContent={
                        <div className="flex flex-col">
                            <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none uppercase">Leader Settings</h1>
                            <p className="text-[9px] text-gray-400 font-extrabold uppercase tracking-wider mt-1.5 leading-none">
                                Configure Subdivision Operations, Dispatch Rules, and Security
                            </p>
                        </div>
                    }
                />

                <main className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
                    <div className="max-w-7xl mx-auto space-y-6">

                        {/* Toast Alert */}
                        {toastMessage && (
                            <div className={`p-4 rounded-2xl border flex items-center justify-between shadow-sm animate-in fade-in slide-in-from-top-3 duration-200 ${
                                toastMessage.type === 'success' 
                                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
                                    : 'bg-rose-50 border-rose-200 text-rose-900'
                            }`}>
                                <div className="flex items-center space-x-3">
                                    <span className="text-lg">{toastMessage.type === 'success' ? '✅' : '⚠️'}</span>
                                    <p className="text-sm font-bold">{toastMessage.text}</p>
                                </div>
                                <button 
                                    onClick={() => setToastMessage(null)}
                                    className="text-xs font-black uppercase text-gray-400 hover:text-gray-700"
                                >
                                    Dismiss
                                </button>
                            </div>
                        )}

                        {/* Header Banner Card */}
                        <div className="relative bg-gradient-to-r from-slate-900 via-stone-900 to-orange-950 rounded-3xl p-6 md:p-8 text-white shadow-xl overflow-hidden">
                            <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-orange-500/20 via-transparent to-transparent pointer-events-none"></div>
                            
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
                                <div className="flex items-center space-x-5">
                                    <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                                        <div className="w-20 h-20 rounded-2xl overflow-hidden border-2 border-orange-400/50 bg-slate-800 shadow-md">
                                            <img
                                                src={getProfilePicture(user?.profile_picture)}
                                                alt={user?.name || 'Leader'}
                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                                onError={(e) => { e.currentTarget.src = DEFAULT_AVATAR; }}
                                            />
                                        </div>
                                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 rounded-2xl flex items-center justify-center text-[10px] font-black uppercase tracking-wider text-white transition-opacity">
                                            {uploadingPic ? 'Uploading...' : 'Change'}
                                        </div>
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={handleImageUpload}
                                        />
                                    </div>

                                    <div>
                                        <div className="flex items-center space-x-2.5">
                                            <span className="px-2.5 py-0.5 rounded-full bg-orange-500/20 text-orange-300 border border-orange-400/30 text-[10px] font-black uppercase tracking-widest">
                                                Subdivision Leader (Role #2)
                                            </span>
                                            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[10px] font-black uppercase tracking-widest">
                                                Active Operations
                                            </span>
                                        </div>
                                        <h2 className="text-2xl md:text-3xl font-black mt-1 text-white tracking-tight">{name || 'Subdivision Officer'}</h2>
                                        <p className="text-xs text-stone-300 font-medium mt-0.5 flex items-center gap-2">
                                            <span>📧 {email}</span>
                                            <span>•</span>
                                            <span>📞 {phone || 'No phone set'}</span>
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    <div className="bg-white/10 backdrop-blur-md px-4 py-3 rounded-2xl border border-white/10 text-center">
                                        <p className="text-[10px] font-black text-orange-300 uppercase tracking-widest">Subdivision ID</p>
                                        <p className="text-xl font-black text-white">{user?.subdivision_id || '1'}</p>
                                    </div>
                                    <div className="bg-white/10 backdrop-blur-md px-4 py-3 rounded-2xl border border-white/10 text-center">
                                        <p className="text-[10px] font-black text-orange-300 uppercase tracking-widest">Takeover SLA</p>
                                        <p className="text-xl font-black text-white">{prefs.inactivityTakeoverHours}h</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Main Settings Body */}
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                            {/* Left Navigation Tabs */}
                            <div className="lg:col-span-4 space-y-2">
                                <div className="bg-white rounded-3xl p-3 border border-gray-100 shadow-sm space-y-1">
                                    {navTabs.map((tab) => {
                                        const isActive = activeTab === tab.id;
                                        return (
                                            <button
                                                key={tab.id}
                                                onClick={() => setActiveTab(tab.id)}
                                                className={`w-full text-left p-3.5 rounded-2xl transition-all flex items-start space-x-3.5 cursor-pointer ${
                                                    isActive
                                                        ? 'bg-gradient-to-r from-orange-50 to-amber-50/50 border border-orange-200/80 text-orange-950 shadow-xs'
                                                        : 'hover:bg-gray-50 text-gray-600 border border-transparent'
                                                }`}
                                            >
                                                <div className={`p-2.5 rounded-xl shrink-0 transition-colors ${
                                                    isActive ? 'bg-[#F97316] text-white shadow-xs' : 'bg-gray-100 text-gray-500'
                                                }`}>
                                                    {tab.icon}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className={`text-xs font-black uppercase tracking-tight ${
                                                        isActive ? 'text-[#F97316]' : 'text-gray-900'
                                                    }`}>
                                                        {tab.label}
                                                    </p>
                                                    <p className="text-[11px] text-gray-400 font-medium leading-tight mt-0.5 line-clamp-2">
                                                        {tab.description}
                                                    </p>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Quick Info Box */}
                                <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-3xl p-5 border border-orange-100/80">
                                    <div className="flex items-center gap-2 text-orange-900 font-black text-xs uppercase tracking-wider">
                                        <span>💡 Leader Guidance</span>
                                    </div>
                                    <p className="text-xs text-orange-950/80 font-medium mt-2 leading-relaxed">
                                        Subdivision Leaders oversee local resident strays, issue violation warnings, and endorse critical cases to the Barangay Operations team.
                                    </p>
                                </div>
                            </div>

                            {/* Right Content Panel */}
                            <div className="lg:col-span-8 bg-white rounded-3xl p-6 md:p-8 border border-gray-100 shadow-sm">
                                {/* TAB 1: Profile & Map */}
                                {activeTab === 'profile' && (
                                    <form onSubmit={handleSaveProfile} className="space-y-6">
                                        <div>
                                            <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">Officer & Station Information</h3>
                                            <p className="text-xs text-gray-500 font-medium mt-0.5">Update your personal contact details and residential / patrol base pinpoint on the map.</p>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Leader Full Name</label>
                                                <input
                                                    type="text"
                                                    value={name}
                                                    onChange={(e) => setName(e.target.value)}
                                                    required
                                                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-[#F97316] outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Official Contact Phone</label>
                                                <input
                                                    type="tel"
                                                    value={phone}
                                                    onChange={(e) => setPhone(e.target.value)}
                                                    placeholder="e.g. 0917-123-4567"
                                                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-[#F97316] outline-none"
                                                />
                                            </div>
                                            <div className="sm:col-span-2">
                                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Registered Email (Login ID)</label>
                                                <input
                                                    type="email"
                                                    value={email}
                                                    disabled
                                                    className="w-full px-4 py-2.5 bg-gray-100 border border-gray-200 rounded-xl text-sm font-semibold text-gray-500 cursor-not-allowed"
                                                />
                                            </div>
                                            <div className="sm:col-span-2">
                                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Street Address / Landmark</label>
                                                <input
                                                    type="text"
                                                    value={address}
                                                    onChange={(e) => setAddress(e.target.value)}
                                                    placeholder="Block & Lot, Street name, Subdivision Phase"
                                                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-[#F97316] outline-none"
                                                />
                                            </div>
                                        </div>

                                        {/* Interactive Map Picker */}
                                        <div className="pt-4 border-t border-gray-100 space-y-3">
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                                <div>
                                                    <label className="block text-xs font-bold text-gray-900 uppercase tracking-wider">Subdivision / Home Pinpoint</label>
                                                    <p className="text-[11px] text-gray-500 font-medium">Click on the map to place your dispatch pinpoint or use GPS.</p>
                                                </div>
                                                <Button
                                                    type="button"
                                                    variant="light"
                                                    onClick={handleGetCurrentLocation}
                                                    disabled={gettingLocation}
                                                    className="text-xs font-bold !py-1.5 !px-3"
                                                >
                                                    {gettingLocation ? 'Locating...' : '📍 Use Current GPS'}
                                                </Button>
                                            </div>

                                            <div className="h-64 w-full rounded-2xl overflow-hidden border border-gray-200 relative z-0 shadow-inner">
                                                <MapContainer
                                                    center={mapPos}
                                                    zoom={15}
                                                    scrollWheelZoom={false}
                                                    className="h-full w-full"
                                                >
                                                    <TileLayer
                                                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                                                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                                    />
                                                    <RecenterMap position={mapPos} />
                                                    <LocationPicker
                                                        position={latitude && longitude ? [currentLat, currentLng] : null}
                                                        onLocationSelect={handleLocationSelect}
                                                        addressLabel={resolvedAddress || address}
                                                    />
                                                </MapContainer>
                                            </div>

                                            {latitude && longitude && (
                                                <div className="flex items-center justify-between text-xs bg-gray-50 p-3 rounded-xl border border-gray-200 font-medium text-gray-600">
                                                    <span>Lat: <strong className="text-gray-900">{parseFloat(latitude.toString()).toFixed(5)}</strong>, Lng: <strong className="text-gray-900">{parseFloat(longitude.toString()).toFixed(5)}</strong></span>
                                                    {isGeocoding && <span className="text-orange-600 animate-pulse font-bold">Resolving address...</span>}
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex justify-end pt-4">
                                            <Button
                                                type="submit"
                                                variant="primary"
                                                disabled={saving}
                                                className="px-8 !bg-[#F97316] hover:!bg-[#EA580C] !border-[#F97316]"
                                            >
                                                {saving ? 'Saving Profile...' : 'Save Profile Changes'}
                                            </Button>
                                        </div>
                                    </form>
                                )}

                                {/* TAB: Landmarks & Holding Facility */}
                                {activeTab === 'landmarks' && (
                                    <div className="space-y-6">
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                            <div>
                                                <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">Subdivision Landmarks & Holding Facilities</h3>
                                                <p className="text-xs text-gray-500 font-medium mt-0.5">Register key reference landmarks and designate official points where rescued animals can be held.</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="px-3 py-1 bg-orange-50 border border-orange-200 text-orange-800 rounded-xl text-xs font-bold">
                                                    📍 {landmarks.length} Landmarks
                                                </span>
                                                <span className="px-3 py-1 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold">
                                                    🐾 {landmarks.filter(l => l.is_holding_facility).length} Holding Facilities
                                                </span>
                                            </div>
                                        </div>

                                        {/* Landmark Interactive Map */}
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <label className="block text-xs font-bold text-gray-900 uppercase tracking-wider">Jurisdiction Map & Landmark Pins</label>
                                                <span className="text-[11px] text-gray-500 font-medium">Click on the map to place/move the landmark pin</span>
                                            </div>

                                            <div className="h-72 w-full rounded-2xl overflow-hidden border border-gray-200 relative z-0 shadow-inner">
                                                <MapContainer
                                                    center={[landmarkForm.latitude || currentLat, landmarkForm.longitude || currentLng]}
                                                    zoom={16}
                                                    scrollWheelZoom={false}
                                                    className="h-full w-full"
                                                >
                                                    <TileLayer
                                                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                                                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                                    />
                                                    <RecenterMap position={[landmarkForm.latitude || currentLat, landmarkForm.longitude || currentLng]} />

                                                    {/* Existing Landmarks */}
                                                    {landmarks.map((l) => (
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
                                                                    {l.is_holding_facility && (
                                                                        <div className="mt-1 pt-1 border-t border-gray-100 text-emerald-700 font-bold text-[10px]">
                                                                            <p>Type: {l.facility_type || 'Holding Pen'}</p>
                                                                            <p>Capacity: {l.capacity || 'N/A'} animals</p>
                                                                            {l.contact_person && <p>Caretaker: {l.contact_person}</p>}
                                                                            {l.contact_number && <p>Phone: {l.contact_number}</p>}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </Popup>
                                                        </Marker>
                                                    ))}

                                                    {/* Active Pin Picker */}
                                                    <LocationPicker
                                                        position={[landmarkForm.latitude, landmarkForm.longitude]}
                                                        onLocationSelect={(lat, lng) => {
                                                            setLandmarkForm(prev => ({ ...prev, latitude: lat, longitude: lng }));
                                                        }}
                                                        addressLabel={`Selected: ${landmarkForm.name || 'New Landmark'} (${landmarkForm.latitude.toFixed(5)}, ${landmarkForm.longitude.toFixed(5)})`}
                                                    />
                                                </MapContainer>
                                            </div>

                                            <div className="flex items-center justify-between text-xs bg-gray-50 p-2.5 rounded-xl border border-gray-200 font-medium text-gray-600">
                                                <span>Target Pin: <strong className="text-gray-900">{landmarkForm.latitude.toFixed(5)}</strong>, <strong className="text-gray-900">{landmarkForm.longitude.toFixed(5)}</strong></span>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        if (navigator.geolocation) {
                                                            navigator.geolocation.getCurrentPosition((pos) => {
                                                                setLandmarkForm(prev => ({
                                                                    ...prev,
                                                                    latitude: pos.coords.latitude,
                                                                    longitude: pos.coords.longitude
                                                                }));
                                                                showToast('success', 'Pin updated to current GPS!');
                                                            });
                                                        }
                                                    }}
                                                    className="text-[#F97316] hover:underline font-bold text-[11px] cursor-pointer"
                                                >
                                                    📍 Snap to Current GPS
                                                </button>
                                            </div>
                                        </div>

                                        {/* Landmark Form */}
                                        <form onSubmit={handleSaveLandmark} className="p-4 bg-gray-50 rounded-2xl border border-gray-200 space-y-4">
                                            <div className="flex items-center justify-between">
                                                <h4 className="text-xs font-black text-gray-900 uppercase tracking-wider">
                                                    {editingLandmarkId ? '✏️ Edit Landmark / Facility' : '➕ Register New Landmark / Facility'}
                                                </h4>
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
                                                                latitude: latitude ? parseFloat(latitude.toString()) : 14.8018,
                                                                longitude: longitude ? parseFloat(longitude.toString()) : 121.0028,
                                                                is_holding_facility: false,
                                                                facility_type: 'Temporary Holding Pen',
                                                                capacity: 6,
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

                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                                <div>
                                                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Landmark Name *</label>
                                                    <input
                                                        type="text"
                                                        value={landmarkForm.name}
                                                        onChange={(e) => setLandmarkForm(prev => ({ ...prev, name: e.target.value }))}
                                                        placeholder="e.g. Phase 1 Guardhouse, Main Court"
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
                                                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Brief Description</label>
                                                    <input
                                                        type="text"
                                                        value={landmarkForm.description}
                                                        onChange={(e) => setLandmarkForm(prev => ({ ...prev, description: e.target.value }))}
                                                        placeholder="e.g. Near main security gate, beside park"
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
                                                            <p className="text-[11px] text-gray-500 font-medium">Animals rescued or impounded in the subdivision can be temporarily sheltered here.</p>
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
                                                                <option value="Community Kennel">Community Kennel</option>
                                                                <option value="Quarantine Cage">Quarantine Cage</option>
                                                            </select>
                                                        </div>
                                                        <div>
                                                            <label className="block text-[11px] font-bold text-emerald-900 uppercase tracking-wider mb-1">Animal Capacity</label>
                                                            <input
                                                                type="number"
                                                                min="1"
                                                                max="100"
                                                                value={landmarkForm.capacity}
                                                                onChange={(e) => setLandmarkForm(prev => ({ ...prev, capacity: parseInt(e.target.value) || 1 }))}
                                                                className="w-full px-3 py-1.5 bg-white border border-emerald-300 rounded-xl text-xs font-semibold text-gray-800 outline-none"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-[11px] font-bold text-emerald-900 uppercase tracking-wider mb-1">Caretaker / Contact Account</label>
                                                            <select
                                                                value={
                                                                    subdAccounts.some(acc => acc.name.toLowerCase() === (landmarkForm.contact_person || '').toLowerCase())
                                                                        ? (subdAccounts.find(acc => acc.name.toLowerCase() === (landmarkForm.contact_person || '').toLowerCase())?.user_id.toString() || 'custom')
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
                                                                        const found = subdAccounts.find(acc => acc.user_id.toString() === val);
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
                                                                {subdAccounts.map((acc) => (
                                                                    <option key={acc.user_id} value={acc.user_id.toString()}>
                                                                        {acc.name} ({acc.position_name || 'Subdivision Leader'})
                                                                    </option>
                                                                ))}
                                                                <option value="custom">✏️ Enter Custom Name...</option>
                                                            </select>
                                                            {(selectedCaretakerUserId === 'custom' || (!subdAccounts.some(acc => acc.name.toLowerCase() === (landmarkForm.contact_person || '').toLowerCase()) && landmarkForm.contact_person)) && (
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

                                        {/* Registered Landmarks List */}
                                        <div className="space-y-3 pt-2">
                                            <h4 className="text-xs font-black text-gray-900 uppercase tracking-wider">Registered Subdivision Landmarks ({landmarks.length})</h4>
                                            {loadingLandmarks ? (
                                                <p className="text-xs text-gray-400 font-bold animate-pulse">Loading registered landmarks...</p>
                                            ) : landmarks.length === 0 ? (
                                                <div className="p-8 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                                                    <p className="text-gray-400 text-xs font-semibold">No landmarks registered in this subdivision yet. Use the form above to add one.</p>
                                                </div>
                                            ) : (
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                    {landmarks.map((item) => {
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

                                {/* TAB 2: Dispatch & Takeover Rules */}
                                {activeTab === 'dispatch' && (
                                    <div className="space-y-6">
                                        <div>
                                            <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">Case Dispatch & Takeover Policies</h3>
                                            <p className="text-xs text-gray-500 font-medium mt-0.5">Control how incident cases are assigned, claimed, and made available for backup takeover.</p>
                                        </div>

                                        <div className="space-y-4">
                                            {/* Inactivity Threshold */}
                                            <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                <div>
                                                    <p className="text-xs font-bold text-gray-900 uppercase tracking-wider">Inactivity Takeover Threshold</p>
                                                    <p className="text-xs text-gray-500 font-medium mt-0.5">Hours before an unclaimed or inactive leader case unlocks for peer takeover.</p>
                                                </div>
                                                <div className="flex items-center space-x-2">
                                                    {[12, 24, 48, 72].map((hours) => (
                                                        <button
                                                            key={hours}
                                                            type="button"
                                                            onClick={() => setPrefs(prev => ({ ...prev, inactivityTakeoverHours: hours }))}
                                                            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                                                                prefs.inactivityTakeoverHours === hours
                                                                    ? 'bg-[#F97316] text-white shadow-xs'
                                                                    : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-100'
                                                            }`}
                                                        >
                                                            {hours} hrs
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Default Queue */}
                                            <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                <div>
                                                    <p className="text-xs font-bold text-gray-900 uppercase tracking-wider">Default Active Queue</p>
                                                    <p className="text-xs text-gray-500 font-medium mt-0.5">Which reports tab opens automatically upon loading the Reports Hub.</p>
                                                </div>
                                                <select
                                                    value={prefs.defaultQueue}
                                                    onChange={(e) => setPrefs(prev => ({ ...prev, defaultQueue: e.target.value as any }))}
                                                    className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-800 outline-none focus:ring-2 focus:ring-[#F97316]"
                                                >
                                                    <option value="my_reports">My Reports Only</option>
                                                    <option value="unassigned">Unassigned / Unclaimed</option>
                                                    <option value="all">All Active Reports</option>
                                                </select>
                                            </div>

                                            {/* Require Confirm on Escalate */}
                                            <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-between">
                                                <div>
                                                    <p className="text-xs font-bold text-gray-900 uppercase tracking-wider">Barangay Escalation Verification</p>
                                                    <p className="text-xs text-gray-500 font-medium mt-0.5">Prompt confirmation dialog before submitting official barangay endorsement letters.</p>
                                                </div>
                                                <input
                                                    type="checkbox"
                                                    checked={prefs.requireConfirmOnEscalate}
                                                    onChange={(e) => setPrefs(prev => ({ ...prev, requireConfirmOnEscalate: e.target.checked }))}
                                                    className="w-5 h-5 accent-[#F97316] rounded cursor-pointer"
                                                />
                                            </div>
                                        </div>

                                        <div className="flex justify-end pt-4">
                                            <Button
                                                type="button"
                                                variant="primary"
                                                onClick={handleSavePreferences}
                                                className="px-8 !bg-[#F97316] hover:!bg-[#EA580C] !border-[#F97316]"
                                            >
                                                Save Dispatch Policies
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                {/* TAB 3: Citations & Violations */}
                                {activeTab === 'citations' && (
                                    <div className="space-y-6">
                                        <div>
                                            <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">Warning & Citation Defaults</h3>
                                            <p className="text-xs text-gray-500 font-medium mt-0.5">Configure starting citation tiers when issuing notices to irresponsible pet owners.</p>
                                        </div>

                                        <div className="space-y-4">
                                            <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                <div>
                                                    <p className="text-xs font-bold text-gray-900 uppercase tracking-wider">Default Starting Tier</p>
                                                    <p className="text-xs text-gray-500 font-medium mt-0.5">Default initial warning level for first-time reported violations.</p>
                                                </div>
                                                <select
                                                    value={prefs.defaultWarningTier}
                                                    onChange={(e) => setPrefs(prev => ({ ...prev, defaultWarningTier: e.target.value as any }))}
                                                    className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-800 outline-none focus:ring-2 focus:ring-[#F97316]"
                                                >
                                                    <option value="Notice">1st Step: Advisory Notice</option>
                                                    <option value="1st Warning">2nd Step: 1st Formal Warning</option>
                                                    <option value="2nd Warning">3rd Step: 2nd Formal Warning</option>
                                                </select>
                                            </div>

                                            <div className="p-5 bg-amber-50/50 rounded-2xl border border-amber-200/70">
                                                <p className="text-xs font-black text-amber-900 uppercase tracking-wider">Citation Progression Policy</p>
                                                <ul className="text-xs text-amber-950/80 font-medium mt-2 space-y-1.5 list-disc list-inside">
                                                    <li><strong>Notice:</strong> Friendly advisory to leash or register pet.</li>
                                                    <li><strong>1st Warning:</strong> Formal community notice with evidence logs.</li>
                                                    <li><strong>2nd Warning:</strong> Final local warning with scheduled inspection.</li>
                                                    <li><strong>Final Escalation:</strong> Case forwarded to Barangay for official municipal fine citation.</li>
                                                </ul>
                                            </div>
                                        </div>

                                        <div className="flex justify-end pt-4">
                                            <Button
                                                type="button"
                                                variant="primary"
                                                onClick={handleSavePreferences}
                                                className="px-8 !bg-[#F97316] hover:!bg-[#EA580C] !border-[#F97316]"
                                            >
                                                Save Citation Settings
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                {/* TAB 4: Notifications & Alerts */}
                                {activeTab === 'notifications' && (
                                    <div className="space-y-6">
                                        <div>
                                            <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">Notification Channels & Real-time Alerts</h3>
                                            <p className="text-xs text-gray-500 font-medium mt-0.5">Enable audio chimes and dispatch alerts for high-risk animal reports.</p>
                                        </div>

                                        <div className="space-y-4">
                                            <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-between">
                                                <div>
                                                    <p className="text-xs font-bold text-gray-900 uppercase tracking-wider">Sound Effects on Incident Arrivals</p>
                                                    <p className="text-xs text-gray-500 font-medium mt-0.5">Play subtle chime when a resident submits a new report in your subdivision.</p>
                                                </div>
                                                <input
                                                    type="checkbox"
                                                    checked={prefs.soundAlerts}
                                                    onChange={(e) => setPrefs(prev => ({ ...prev, soundAlerts: e.target.checked }))}
                                                    className="w-5 h-5 accent-[#F97316] rounded cursor-pointer"
                                                />
                                            </div>

                                            <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-between">
                                                <div>
                                                    <p className="text-xs font-bold text-gray-900 uppercase tracking-wider">Urgent Rabies / Bite Incident Siren</p>
                                                    <p className="text-xs text-gray-500 font-medium mt-0.5">Distinct priority sound cue for bite incidents or emergency aggressive strays.</p>
                                                </div>
                                                <input
                                                    type="checkbox"
                                                    checked={prefs.criticalBiteSound}
                                                    onChange={(e) => setPrefs(prev => ({ ...prev, criticalBiteSound: e.target.checked }))}
                                                    className="w-5 h-5 accent-[#F97316] rounded cursor-pointer"
                                                />
                                            </div>

                                            <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-between">
                                                <div>
                                                    <p className="text-xs font-bold text-gray-900 uppercase tracking-wider">Email Dispatch Digest</p>
                                                    <p className="text-xs text-gray-500 font-medium mt-0.5">Receive daily summary reports and urgent case links via email.</p>
                                                </div>
                                                <input
                                                    type="checkbox"
                                                    checked={prefs.emailNotifications}
                                                    onChange={(e) => setPrefs(prev => ({ ...prev, emailNotifications: e.target.checked }))}
                                                    className="w-5 h-5 accent-[#F97316] rounded cursor-pointer"
                                                />
                                            </div>
                                        </div>

                                        <div className="flex justify-end pt-4">
                                            <Button
                                                type="button"
                                                variant="primary"
                                                onClick={handleSavePreferences}
                                                className="px-8 !bg-[#F97316] hover:!bg-[#EA580C] !border-[#F97316]"
                                            >
                                                Save Notification Preferences
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                {/* TAB 5: Security & Password */}
                                {activeTab === 'security' && (
                                    <form onSubmit={handleChangePassword} className="space-y-6">
                                        <div>
                                            <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">Security & Password Credentials</h3>
                                            <p className="text-xs text-gray-500 font-medium mt-0.5">Update your staff login password to keep your officer account secure.</p>
                                        </div>

                                        <div className="space-y-4 max-w-md">
                                            <div>
                                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">New Password</label>
                                                <input
                                                    type="password"
                                                    value={newPassword}
                                                    onChange={(e) => setNewPassword(e.target.value)}
                                                    required
                                                    placeholder="Minimum 6 characters"
                                                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-[#F97316] outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Confirm New Password</label>
                                                <input
                                                    type="password"
                                                    value={confirmPassword}
                                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                                    required
                                                    placeholder="Re-type new password"
                                                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-[#F97316] outline-none"
                                                />
                                            </div>
                                        </div>

                                        <div className="flex justify-start pt-4">
                                            <Button
                                                type="submit"
                                                variant="primary"
                                                disabled={isChangingPassword}
                                                className="px-8 !bg-[#F97316] hover:!bg-[#EA580C] !border-[#F97316]"
                                            >
                                                {isChangingPassword ? 'Updating Password...' : 'Update Password'}
                                            </Button>
                                        </div>
                                    </form>
                                )}

                                {/* TAB 6: Interface & Cache */}
                                {activeTab === 'preferences' && (
                                    <div className="space-y-6">
                                        <div>
                                            <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">Interface Layout & Local Storage</h3>
                                            <p className="text-xs text-gray-500 font-medium mt-0.5">Customize your reports view mode and refresh cached offline records.</p>
                                        </div>

                                        <div className="space-y-4">
                                            <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                <div>
                                                    <p className="text-xs font-bold text-gray-900 uppercase tracking-wider">Default Incident View Style</p>
                                                    <p className="text-xs text-gray-500 font-medium mt-0.5">Choose between visual visual card layout or condensed data table view.</p>
                                                </div>
                                                <div className="flex items-center space-x-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => setPrefs(prev => ({ ...prev, defaultViewMode: 'cards' }))}
                                                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                                                            prefs.defaultViewMode === 'cards'
                                                                ? 'bg-[#F97316] text-white shadow-xs'
                                                                : 'bg-white border border-gray-200 text-gray-600'
                                                        }`}
                                                    >
                                                        Cards View
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setPrefs(prev => ({ ...prev, defaultViewMode: 'table' }))}
                                                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                                                            prefs.defaultViewMode === 'table'
                                                                ? 'bg-[#F97316] text-white shadow-xs'
                                                                : 'bg-white border border-gray-200 text-gray-600'
                                                        }`}
                                                    >
                                                        Table View
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-between">
                                                <div>
                                                    <p className="text-xs font-bold text-gray-900 uppercase tracking-wider">Clear Local Cache & Refresh State</p>
                                                    <p className="text-xs text-gray-500 font-medium mt-0.5">Purges cached reverse-geocoded addresses and forces fresh reports synchronization.</p>
                                                </div>
                                                <Button
                                                    type="button"
                                                    variant="light"
                                                    onClick={() => {
                                                        localStorage.removeItem('subd_reports_list');
                                                        sessionStorage.clear();
                                                        showToast('success', 'Local caches cleared! Data will refresh from server.');
                                                    }}
                                                    className="text-xs font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200"
                                                >
                                                    Clear Cache
                                                </Button>
                                            </div>
                                        </div>

                                        <div className="flex justify-end pt-4">
                                            <Button
                                                type="button"
                                                variant="primary"
                                                onClick={handleSavePreferences}
                                                className="px-8 !bg-[#F97316] hover:!bg-[#EA580C] !border-[#F97316]"
                                            >
                                                Save Interface Preferences
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                    </div>
                </main>
            </div>
        </div>
    );
};

export default SubdSettings;
