import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import api from '../../utils/api';
import { DEFAULT_AVATAR, getProfilePicture } from '../../utils/avatar';
import BrgySidebar from '../../components/BrgySidebar';
import BrgyNavbar from '../../components/Navbars/BrgyNavbar';
import Button from '../../components/Button';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIconRetina from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { LANDMARK_CATEGORIES, getLandmarkCategory, createLandmarkPinIcon } from '../../utils/landmarkIcons';

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
                    <p className="font-black text-[#F97316] uppercase tracking-wide">📍 Selected Landmark / Facility Pin</p>
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

type BrgySettingsTab = 'profile' | 'landmarks' | 'holding' | 'dispatch' | 'alerts' | 'security' | 'preferences';

interface BrgySettingsPreferences {
    quarantineDays: number;
    capacityWarningThreshold: number; // e.g. 80%
    adoptionGraceDays: number;
    autoArchiveResolvedDays: number;
    soundOnEscalation: boolean;
    urgentBiteSiren: boolean;
    smsAlertsEnabled: boolean;
    emailAlertsEnabled: boolean;
    defaultRescuePriority: 'Emergency' | 'High' | 'Medium';
    autoGeocodeOnPin: boolean;
}

const DEFAULT_BRGY_PREFERENCES: BrgySettingsPreferences = {
    quarantineDays: 14,
    capacityWarningThreshold: 80,
    adoptionGraceDays: 0,
    autoArchiveResolvedDays: 30,
    soundOnEscalation: true,
    urgentBiteSiren: true,
    smsAlertsEnabled: false,
    emailAlertsEnabled: true,
    defaultRescuePriority: 'High',
    autoGeocodeOnPin: true
};

const BrgySettings: React.FC = () => {
    const rawUser = localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user');
    const initialUserObj = rawUser ? JSON.parse(rawUser) : null;

    const [activeTab, setActiveTab] = useState<BrgySettingsTab>('profile');
    const [user, setUser] = useState<any>(initialUserObj);
    const [name, setName] = useState(initialUserObj?.name || '');
    const [phone, setPhone] = useState(initialUserObj?.phone || '');
    const [email] = useState(initialUserObj?.email || '');
    const [position, setPosition] = useState(initialUserObj?.position_name || initialUserObj?.position || '');
    const [address, setAddress] = useState(initialUserObj?.address || '');
    const [latitude] = useState<number | string | null>(initialUserObj?.latitude || null);
    const [longitude] = useState<number | string | null>(initialUserObj?.longitude || null);
    const [resolvedAddress, setResolvedAddress] = useState<string>('');
    const [uploadingPic, setUploadingPic] = useState(false);
    const [saving, setSaving] = useState(false);
    const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Password fields
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isChangingPassword, setIsChangingPassword] = useState(false);

    // Preferences state
    const [prefs, setPrefs] = useState<BrgySettingsPreferences>(() => {
        try {
            const saved = localStorage.getItem('straysafe_brgy_settings');
            const base = saved ? { ...DEFAULT_BRGY_PREFERENCES, ...JSON.parse(saved) } : { ...DEFAULT_BRGY_PREFERENCES };
            const savedStay = localStorage.getItem('holding_impound_stay_duration');
            if (savedStay) {
                const parsedStay = parseInt(savedStay, 10);
                if (!isNaN(parsedStay) && parsedStay >= 0) {
                    base.adoptionGraceDays = parsedStay;
                }
            }
            return base;
        } catch {
            return DEFAULT_BRGY_PREFERENCES;
        }
    });

    const fileInputRef = useRef<HTMLInputElement>(null);

    const showToast = (type: 'success' | 'error', text: string) => {
        setToastMessage({ type, text });
        setTimeout(() => setToastMessage(null), 4000);
    };

    const isHeadOfficer = Boolean(user?.is_head_officer || user?.role_id === 4 || user?.role_id === 5);

    // Landmarks & Holding Facility State
    const [landmarks, setLandmarks] = useState<any[]>([]);
    const [loadingLandmarks, setLoadingLandmarks] = useState(false);
    const [editingLandmarkId, setEditingLandmarkId] = useState<number | null>(null);
    const [brgyPersonnel, setBrgyPersonnel] = useState<any[]>([]);
    const [selectedCaretakerUserId, setSelectedCaretakerUserId] = useState<string>('');
    const [landmarkForm, setLandmarkForm] = useState({
        name: '',
        category: 'facility',
        description: '',
        latitude: 14.8069,
        longitude: 121.0039,
        is_holding_facility: true,
        facility_type: 'Municipal Animal Impound',
        capacity: 20,
        contact_person: '',
        contact_number: ''
    });
    const [isSavingLandmark, setIsSavingLandmark] = useState(false);

    const fetchLandmarks = async () => {
        const bId = user?.barangay_id || 1;
        setLoadingLandmarks(true);
        try {
            const res = await api.get(`/landmarks?barangay_id=${bId}&barangay_only=true`);
            setLandmarks(res.data || []);
        } catch (err) {
            console.error('Failed to load barangay landmarks:', err);
        } finally {
            setLoadingLandmarks(false);
        }
    };

    const fetchBrgyPersonnel = async () => {
        const bId = user?.barangay_id || 1;
        try {
            const res = await api.get(`/users?barangay_id=${bId}&role_id=3`);
            setBrgyPersonnel(res.data || []);
        } catch (err) {
            console.error('Failed to load personnel:', err);
        }
    };

    useEffect(() => {
        fetchLandmarks();
        fetchBrgyPersonnel();
    }, [user?.barangay_id]);

    const handleSaveLandmark = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isHeadOfficer) {
            showToast('error', 'Permission denied: Only the Barangay Head Officer can manage holding facilities and landmarks.');
            return;
        }
        if (!landmarkForm.name.trim()) {
            showToast('error', 'Landmark / facility name is required.');
            return;
        }
        setIsSavingLandmark(true);
        try {
            const payload = {
                name: landmarkForm.name.trim(),
                category: landmarkForm.is_holding_facility ? 'facility' : (landmarkForm.category || 'general'),
                description: landmarkForm.description.trim() || null,
                subdivision_id: null,
                barangay_id: user?.barangay_id || 1,
                latitude: parseFloat(landmarkForm.latitude.toString()),
                longitude: parseFloat(landmarkForm.longitude.toString()),
                is_holding_facility: landmarkForm.is_holding_facility,
                facility_type: landmarkForm.is_holding_facility ? (landmarkForm.facility_type || 'Municipal Animal Impound') : null,
                capacity: landmarkForm.is_holding_facility ? (Number(landmarkForm.capacity) || 10) : null,
                contact_person: landmarkForm.contact_person.trim() || null,
                contact_number: landmarkForm.contact_number.trim() || null,
            };

            if (editingLandmarkId) {
                await api.put(`/landmarks/${editingLandmarkId}`, payload);
                showToast('success', 'Barangay facility/landmark updated successfully!');
            } else {
                await api.post('/landmarks', payload);
                showToast('success', 'New Barangay facility/landmark registered successfully!');
            }

            setEditingLandmarkId(null);
            setSelectedCaretakerUserId('');
            setLandmarkForm({
                name: '',
                category: 'facility',
                description: '',
                latitude: latitude ? parseFloat(latitude.toString()) : 14.8069,
                longitude: longitude ? parseFloat(longitude.toString()) : 121.0039,
                is_holding_facility: true,
                facility_type: 'Municipal Animal Impound',
                capacity: 20,
                contact_person: '',
                contact_number: ''
            });
            fetchLandmarks();
        } catch (err: any) {
            console.error('Failed to save landmark:', err);
            showToast('error', err.response?.data?.detail || 'Failed to save facility/landmark.');
        } finally {
            setIsSavingLandmark(false);
        }
    };

    const handleDeleteLandmark = async (landmarkId: number, landmarkName: string) => {
        if (!isHeadOfficer) {
            showToast('error', 'Permission denied: Only the Barangay Head Officer can delete holding facilities.');
            return;
        }
        if (!window.confirm(`Are you sure you want to delete the facility / landmark "${landmarkName}"? This cannot be undone.`)) {
            return;
        }
        try {
            await api.delete(`/landmarks/${landmarkId}`);
            showToast('success', `Landmark "${landmarkName}" deleted successfully.`);
            fetchLandmarks();
        } catch (err: any) {
            console.error('Failed to delete landmark:', err);
            showToast('error', err.response?.data?.detail || 'Failed to delete landmark.');
        }
    };

    const handleEditLandmark = (item: any) => {
        if (!isHeadOfficer) {
            showToast('error', 'Permission denied: Only the Barangay Head Officer can edit holding facilities.');
            return;
        }
        setEditingLandmarkId(item.landmark_id);
        setLandmarkForm({
            name: item.name || '',
            category: item.category || 'facility',
            description: item.description || '',
            latitude: item.latitude || (latitude ? parseFloat(latitude.toString()) : 14.8069),
            longitude: item.longitude || (longitude ? parseFloat(longitude.toString()) : 121.0039),
            is_holding_facility: Boolean(item.is_holding_facility),
            facility_type: item.facility_type || 'Municipal Animal Impound',
            capacity: item.capacity || 20,
            contact_person: item.contact_person || '',
            contact_number: item.contact_number || ''
        });
        const matched = brgyPersonnel.find(acc => acc.name.toLowerCase() === (item.contact_person || '').toLowerCase());
        if (matched) {
            setSelectedCaretakerUserId(matched.user_id.toString());
        } else if (item.contact_person) {
            setSelectedCaretakerUserId('custom');
        } else {
            setSelectedCaretakerUserId('');
        }
    };

    // Reverse Geocoding helper
    const reverseGeocode = async (lat: number, lng: number) => {
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
                const neighbourhood = addr.neighbourhood || addr.village || addr.suburb || '';
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
        }
    };

    useEffect(() => {
        if (latitude && longitude && prefs.autoGeocodeOnPin) {
            reverseGeocode(parseFloat(latitude.toString()), parseFloat(longitude.toString()));
        }
    }, [latitude, longitude]);

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
                position: position || null,
                latitude: latitude ? parseFloat(latitude.toString()) : null,
                longitude: longitude ? parseFloat(longitude.toString()) : null
            };
            const response = await api.put(`/users/${user.user_id}`, payload);
            if (response.data) {
                setUser(response.data);
                const updated = { ...user, ...response.data };
                localStorage.setItem('staff_user', JSON.stringify(updated));
                showToast('success', 'Barangay officer profile & station saved successfully!');
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
            localStorage.setItem('straysafe_brgy_settings', JSON.stringify(prefs));
            localStorage.setItem('holding_impound_stay_duration', prefs.adoptionGraceDays.toString());
            window.dispatchEvent(new Event('storage'));
            showToast('success', 'Barangay operational preferences saved!');
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
            id: 'profile' as BrgySettingsTab,
            label: 'Officer & Station Profile',
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
            ),
            description: 'Name, rank/designation, contact info, and station map pinpoint'
        },
        {
            id: 'landmarks' as BrgySettingsTab,
            label: 'Landmarks & Holding Facilities',
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
            ),
            description: 'Barangay impound pens, holding facilities, and key jurisdiction reference pins'
        },
        {
            id: 'holding' as BrgySettingsTab,
            label: 'Holding Facility & Quarantine',
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
            ),
            description: 'Rabies observation quarantine duration and cage capacity threshold alerts'
        },
        {
            id: 'dispatch' as BrgySettingsTab,
            label: 'Rescue Operations & SLA',
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
            ),
            description: 'Subdivision escalation intake and rapid response priority parameters'
        },
        {
            id: 'alerts' as BrgySettingsTab,
            label: 'Community Broadcasts',
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                </svg>
            ),
            description: 'Broadcast siren rules, emergency banner triggers, and public notices'
        },
        {
            id: 'security' as BrgySettingsTab,
            label: 'Security & Access',
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
            ),
            description: 'Manage authentication password and active session credentials'
        },
        {
            id: 'preferences' as BrgySettingsTab,
            label: 'System & Cache',
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
            ),
            description: 'Audio alarms, memory cache, and system diagnostics'
        }
    ];

    const currentLat = latitude ? parseFloat(latitude.toString()) : 14.8069;
    const currentLng = longitude ? parseFloat(longitude.toString()) : 121.0039;
    const mapPos: [number, number] = (latitude && longitude) ? [currentLat, currentLng] : [14.8069, 121.0039];

    return (
        <div className="flex h-screen bg-[#F8FAFC]">
            <BrgySidebar />

            <div className="flex-1 flex flex-col overflow-hidden">
                <BrgyNavbar
                    leftContent={
                        <div className="flex flex-col">
                            <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none uppercase">Barangay Settings</h1>
                            <p className="text-[9px] text-gray-400 font-extrabold uppercase tracking-wider mt-1.5 leading-none">
                                Operations Configuration, Holding Rules, and Station Security
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
                        <div className="relative bg-gradient-to-r from-slate-900 via-stone-900 to-amber-950 rounded-3xl p-6 md:p-8 text-white shadow-xl overflow-hidden">
                            <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-amber-500/20 via-transparent to-transparent pointer-events-none"></div>
                            
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
                                <div className="flex items-center space-x-5">
                                    <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                                        <div className="w-20 h-20 rounded-2xl overflow-hidden border-2 border-amber-400/50 bg-slate-800 shadow-md">
                                            <img
                                                src={getProfilePicture(user?.profile_picture)}
                                                alt={user?.name || 'Officer'}
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
                                            <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/30 text-[10px] font-black uppercase tracking-widest">
                                                Barangay Operations (Role #3)
                                            </span>
                                            {user?.is_head_officer && (
                                                <span className="px-2.5 py-0.5 rounded-full bg-orange-500/20 text-orange-300 border border-orange-400/30 text-[10px] font-black uppercase tracking-widest">
                                                    Head Action Officer
                                                </span>
                                            )}
                                        </div>
                                        <h2 className="text-2xl md:text-3xl font-black mt-1 text-white tracking-tight">{name || 'Barangay Officer'}</h2>
                                        <p className="text-xs text-stone-300 font-medium mt-0.5 flex items-center gap-2">
                                            <span>🎖️ {position || 'Action Officer'}</span>
                                            <span>•</span>
                                            <span>📧 {email}</span>
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    <div className="bg-white/10 backdrop-blur-md px-4 py-3 rounded-2xl border border-white/10 text-center">
                                        <p className="text-[10px] font-black text-amber-300 uppercase tracking-widest">Quarantine SLA</p>
                                        <p className="text-xl font-black text-white">{prefs.quarantineDays} Days</p>
                                    </div>
                                    <div className="bg-white/10 backdrop-blur-md px-4 py-3 rounded-2xl border border-white/10 text-center">
                                        <p className="text-[10px] font-black text-amber-300 uppercase tracking-widest">Capacity Alert</p>
                                        <p className="text-xl font-black text-white">{prefs.capacityWarningThreshold}%</p>
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

                                {/* Guidance Box */}
                                <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-3xl p-5 border border-amber-200/70">
                                    <div className="flex items-center gap-2 text-amber-900 font-black text-xs uppercase tracking-wider">
                                        <span>🛡️ Barangay Mandate</span>
                                    </div>
                                    <p className="text-xs text-amber-950/80 font-medium mt-2 leading-relaxed">
                                        Barangay Staff manage official animal rescues, supervise the municipal holding facility, process rabies quarantine logs, and broadcast emergency alerts.
                                    </p>
                                </div>
                            </div>

                            {/* Right Content Panel */}
                            <div className="lg:col-span-8 bg-white rounded-3xl p-6 md:p-8 border border-gray-100 shadow-sm">
                                {/* TAB 1: Officer & Station Profile */}
                                {activeTab === 'profile' && (
                                    <form onSubmit={handleSaveProfile} className="space-y-6">
                                        <div>
                                            <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">Officer & Barangay Station Details</h3>
                                            <p className="text-xs text-gray-500 font-medium mt-0.5">Update your personnel designation, official hotline, and station coordinates.</p>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Officer Full Name</label>
                                                <input
                                                    type="text"
                                                    value={name}
                                                    onChange={(e) => setName(e.target.value)}
                                                    required
                                                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-[#F97316] outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Position / Rank</label>
                                                <input
                                                    type="text"
                                                    value={position}
                                                    onChange={(e) => setPosition(e.target.value)}
                                                    placeholder="e.g. Barangay Action Officer"
                                                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-[#F97316] outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Official Hotline / Mobile</label>
                                                <input
                                                    type="tel"
                                                    value={phone}
                                                    onChange={(e) => setPhone(e.target.value)}
                                                    placeholder="e.g. 0917-123-4567"
                                                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-[#F97316] outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Registered Email (Login ID)</label>
                                                <input
                                                    type="email"
                                                    value={email}
                                                    disabled
                                                    className="w-full px-4 py-2.5 bg-gray-100 border border-gray-200 rounded-xl text-sm font-semibold text-gray-500 cursor-not-allowed"
                                                />
                                            </div>
                                            <div className="sm:col-span-2">
                                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Barangay Hall / Facility Address</label>
                                                <input
                                                    type="text"
                                                    value={address}
                                                    onChange={(e) => setAddress(e.target.value)}
                                                    placeholder="Barangay Hall compound, Street, Municipality"
                                                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-[#F97316] outline-none"
                                                />
                                            </div>
                                        </div>

                                        {/* Official Barangay HQ Map Display (Admin-Only Modifiable) */}
                                        <div className="pt-4 border-t border-gray-100 space-y-3">
                                            <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-4 text-xs text-amber-900 font-medium flex items-start gap-3">
                                                <span className="text-base shrink-0">🏛️</span>
                                                <div>
                                                    <p className="font-black uppercase tracking-wider text-amber-950">Official Headquarters Location Policy</p>
                                                    <p className="mt-0.5 text-amber-900/90 leading-relaxed">
                                                        Official Barangay Headquarters coordinates, dispatch pinpoints, and primary impound locations are configured exclusively by the System Administrator. Staff can review the locked pinpoint below.
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                                <div>
                                                    <label className="block text-xs font-bold text-gray-900 uppercase tracking-wider">Barangay Operations Pinpoint</label>
                                                    <p className="text-[11px] text-gray-500 font-medium">Official verified coordinates for dispatch and animal holdings.</p>
                                                </div>
                                                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 border border-blue-200 text-blue-800 rounded-xl text-xs font-bold shadow-xs">
                                                    <span>🔒 Official Location (Locked)</span>
                                                </div>
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
                                                    <Marker position={mapPos}>
                                                        <Popup>
                                                            <div className="p-2 text-center text-xs min-w-[150px]">
                                                                <p className="font-black text-[#F97316] uppercase tracking-wide">🏢 Barangay San Vicente HQ</p>
                                                                <p className="text-[11px] text-gray-700 mt-1 font-semibold leading-tight">
                                                                    {resolvedAddress || address || `${currentLat.toFixed(5)}, ${currentLng.toFixed(5)}`}
                                                                </p>
                                                                <span className="mt-1 inline-block text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-full">
                                                                    Verified Station Pin
                                                                </span>
                                                            </div>
                                                        </Popup>
                                                    </Marker>
                                                </MapContainer>
                                            </div>

                                            {latitude && longitude && (
                                                <div className="flex items-center justify-between text-xs bg-gray-50 p-3 rounded-xl border border-gray-200 font-medium text-gray-600">
                                                    <span>Lat: <strong className="text-gray-900">{parseFloat(latitude.toString()).toFixed(5)}</strong>, Lng: <strong className="text-gray-900">{parseFloat(longitude.toString()).toFixed(5)}</strong></span>
                                                    <span className="text-gray-500 font-semibold">Managed by System Admin</span>
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
                                                {saving ? 'Saving Profile...' : 'Save Station Profile'}
                                            </Button>
                                        </div>
                                    </form>
                                )}

                                {/* TAB: Landmarks & Holding Facility */}
                                {activeTab === 'landmarks' && (
                                    <div className="space-y-6">
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                            <div>
                                                <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">Barangay Landmarks & Holding Facilities</h3>
                                                <p className="text-xs text-gray-500 font-medium mt-0.5">Register key reference landmarks and manage official municipal animal holding facilities.</p>
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

                                        {/* Permission Notice Banner for non-head staff */}
                                        {!isHeadOfficer && (
                                            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3 text-amber-900">
                                                <span className="text-lg shrink-0">🛡️</span>
                                                <div>
                                                    <p className="text-xs font-black uppercase tracking-wider">Barangay Head Officer Authorization Required</p>
                                                    <p className="text-xs text-amber-800/90 font-medium mt-0.5">
                                                        Only the Barangay Head Officer can add, edit, or delete official Barangay holding facilities and landmarks. You are currently viewing these facilities in read-only mode.
                                                    </p>
                                                </div>
                                            </div>
                                        )}

                                        {/* Landmark Interactive Map */}
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <label className="block text-xs font-bold text-gray-900 uppercase tracking-wider">Barangay Jurisdiction Map & Pins</label>
                                                {isHeadOfficer && (
                                                    <span className="text-[11px] text-gray-500 font-medium">Click on the map to place or reposition the facility pin</span>
                                                )}
                                            </div>

                                            <div className="h-72 w-full rounded-2xl overflow-hidden border border-gray-200 relative z-0 shadow-inner">
                                                <MapContainer
                                                    center={[landmarkForm.latitude || currentLat, landmarkForm.longitude || currentLng]}
                                                    zoom={15}
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
                                                                            <p>Type: {l.facility_type || 'Municipal Impound'}</p>
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
                                                    {isHeadOfficer && (
                                                        <LocationPicker
                                                            position={[landmarkForm.latitude, landmarkForm.longitude]}
                                                            onLocationSelect={(lat, lng) => {
                                                                setLandmarkForm(prev => ({ ...prev, latitude: lat, longitude: lng }));
                                                            }}
                                                            addressLabel={`Selected: ${landmarkForm.name || 'New Facility'} (${landmarkForm.latitude.toFixed(5)}, ${landmarkForm.longitude.toFixed(5)})`}
                                                        />
                                                    )}
                                                </MapContainer>
                                            </div>

                                            <div className="flex items-center justify-between text-xs bg-gray-50 p-2.5 rounded-xl border border-gray-200 font-medium text-gray-600">
                                                <span>Target Coordinates: <strong className="text-gray-900">{landmarkForm.latitude.toFixed(5)}</strong>, <strong className="text-gray-900">{landmarkForm.longitude.toFixed(5)}</strong></span>
                                                {isHeadOfficer && (
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
                                                )}
                                            </div>
                                        </div>

                                        {/* Landmark Form for Head Officer */}
                                        {isHeadOfficer && (
                                            <form onSubmit={handleSaveLandmark} className="p-4 bg-gray-50 rounded-2xl border border-gray-200 space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <h4 className="text-xs font-black text-gray-900 uppercase tracking-wider">
                                                        {editingLandmarkId ? '✏️ Edit Barangay Facility / Landmark' : '➕ Register New Barangay Facility / Landmark'}
                                                    </h4>
                                                    {editingLandmarkId && (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setEditingLandmarkId(null);
                                                                setSelectedCaretakerUserId('');
                                                                setLandmarkForm({
                                                                    name: '',
                                                                    category: 'facility',
                                                                    description: '',
                                                                    latitude: latitude ? parseFloat(latitude.toString()) : 14.8069,
                                                                    longitude: longitude ? parseFloat(longitude.toString()) : 121.0039,
                                                                    is_holding_facility: true,
                                                                    facility_type: 'Municipal Animal Impound',
                                                                    capacity: 20,
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
                                                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Facility / Landmark Name *</label>
                                                        <input
                                                            type="text"
                                                            value={landmarkForm.name}
                                                            onChange={(e) => setLandmarkForm(prev => ({ ...prev, name: e.target.value }))}
                                                            placeholder="e.g. Barangay Animal Shelter, Central Hall"
                                                            required
                                                            className="w-full px-3.5 py-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-[#F97316] outline-none"
                                                        />
                                                    </div>

                                                    <div>
                                                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Marker Category</label>
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
                                                            placeholder="e.g. Behind Barangay Hall, beside health center"
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
                                                                <p className="text-xs font-black uppercase tracking-wider">Designate as Official Animal Holding Facility</p>
                                                                <p className="text-[11px] text-gray-500 font-medium">Animals rescued or quarantined at the Barangay level can be accommodated here.</p>
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
                                                                    <option value="Municipal Animal Impound">Municipal Animal Impound</option>
                                                                    <option value="Barangay Holding Pen">Barangay Holding Pen</option>
                                                                    <option value="Quarantine Facility">Quarantine Facility</option>
                                                                    <option value="Temporary Shelter">Temporary Shelter</option>
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
                                                                <label className="block text-[11px] font-bold text-emerald-900 uppercase tracking-wider mb-1">Caretaker / Action Officer</label>
                                                                <select
                                                                    value={
                                                                        brgyPersonnel.some(acc => acc.name.toLowerCase() === (landmarkForm.contact_person || '').toLowerCase())
                                                                            ? (brgyPersonnel.find(acc => acc.name.toLowerCase() === (landmarkForm.contact_person || '').toLowerCase())?.user_id.toString() || 'custom')
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
                                                                            const found = brgyPersonnel.find(acc => acc.user_id.toString() === val);
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
                                                                    <option value="">-- Select Barangay Officer --</option>
                                                                    {brgyPersonnel.map((acc) => (
                                                                        <option key={acc.user_id} value={acc.user_id.toString()}>
                                                                            {acc.name} ({acc.position_name || 'Barangay Staff'})
                                                                        </option>
                                                                    ))}
                                                                    <option value="custom">✏️ Enter Custom Name...</option>
                                                                </select>
                                                                {(selectedCaretakerUserId === 'custom' || (!brgyPersonnel.some(acc => acc.name.toLowerCase() === (landmarkForm.contact_person || '').toLowerCase()) && landmarkForm.contact_person)) && (
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
                                                                    placeholder="e.g. 0917-555-1234"
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
                                                        {isSavingLandmark ? 'Saving...' : (editingLandmarkId ? 'Update Facility / Landmark' : 'Register Facility / Landmark')}
                                                    </Button>
                                                </div>
                                            </form>
                                        )}

                                        {/* Registered Landmarks List */}
                                        <div className="space-y-3 pt-2">
                                            <h4 className="text-xs font-black text-gray-900 uppercase tracking-wider">Registered Barangay Landmarks & Facilities ({landmarks.length})</h4>
                                            {loadingLandmarks ? (
                                                <p className="text-xs text-gray-400 font-bold animate-pulse">Loading registered landmarks...</p>
                                            ) : landmarks.length === 0 ? (
                                                <div className="p-8 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                                                    <p className="text-gray-400 text-xs font-semibold">No landmarks or holding facilities registered for this Barangay yet.</p>
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
                                                                        {cat.emoji} {item.is_holding_facility ? 'Barangay Facility' : cat.label}
                                                                    </span>
                                                                </div>

                                                                {item.is_holding_facility && (
                                                                    <div className="mt-2.5 pt-2 border-t border-emerald-200/50 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-emerald-900 font-semibold">
                                                                        <span>Type: <strong>{item.facility_type || 'Impound'}</strong></span>
                                                                        <span>Capacity: <strong>{item.capacity || 0} animals</strong></span>
                                                                        {item.contact_person && <span>Caretaker: <strong>{item.contact_person}</strong></span>}
                                                                        {item.contact_number && <span>Phone: <strong>{item.contact_number}</strong></span>}
                                                                    </div>
                                                                )}

                                                                <div className="mt-3 pt-2.5 border-t border-gray-100 flex items-center justify-between text-[10px] text-gray-400 font-medium">
                                                                    <span>Lat: {item.latitude.toFixed(5)}, Lng: {item.longitude.toFixed(5)}</span>
                                                                    {isHeadOfficer && (
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
                                                                                onClick={() => handleDeleteLandmark(item.landmark_id, item.name)}
                                                                                className="text-rose-600 hover:text-rose-800 font-bold hover:underline cursor-pointer"
                                                                            >
                                                                                Delete
                                                                            </button>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* TAB 2: Holding Facility & Quarantine Rules */}
                                {activeTab === 'holding' && (
                                    <div className="space-y-6">
                                        <div>
                                            <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">Holding Facility & Quarantine Thresholds</h3>
                                            <p className="text-xs text-gray-500 font-medium mt-0.5">Configure quarantine observation periods and capacity warning triggers.</p>
                                        </div>

                                        <div className="space-y-4">
                                            <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                <div>
                                                    <p className="text-xs font-bold text-gray-900 uppercase tracking-wider">Mandatory Rabies Observation Period</p>
                                                    <p className="text-xs text-gray-500 font-medium mt-0.5">Standard quarantine observation duration for biting or suspected rabid strays.</p>
                                                </div>
                                                <div className="flex items-center space-x-2">
                                                    {[10, 14, 21].map((days) => (
                                                        <button
                                                            key={days}
                                                            type="button"
                                                            onClick={() => setPrefs(prev => ({ ...prev, quarantineDays: days }))}
                                                            className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all ${
                                                                prefs.quarantineDays === days
                                                                    ? 'bg-[#F97316] text-white shadow-xs'
                                                                    : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-100'
                                                            }`}
                                                        >
                                                            {days} Days
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                <div>
                                                    <p className="text-xs font-bold text-gray-900 uppercase tracking-wider">Cage Capacity Alert Threshold</p>
                                                    <p className="text-xs text-gray-500 font-medium mt-0.5">Trigger urgent warning badge when occupied cages exceed this percentage.</p>
                                                </div>
                                                <div className="flex items-center space-x-2">
                                                    {[70, 80, 90].map((pct) => (
                                                        <button
                                                            key={pct}
                                                            type="button"
                                                            onClick={() => setPrefs(prev => ({ ...prev, capacityWarningThreshold: pct }))}
                                                            className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all ${
                                                                prefs.capacityWarningThreshold === pct
                                                                    ? 'bg-[#F97316] text-white shadow-xs'
                                                                    : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-100'
                                                            }`}
                                                        >
                                                            {pct}% Occupancy
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <p className="text-xs font-bold text-gray-900 uppercase tracking-wider">Holding Stay & Impoundment Duration</p>
                                                        <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200">
                                                            Default: 0 Days (Testing)
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-gray-500 font-medium mt-0.5">
                                                        Number of days an animal remains in the holding facility before scheduled impoundment or transfer to adoption.
                                                    </p>
                                                </div>
                                                <div className="flex flex-wrap items-center gap-3">
                                                    {/* Quick Presets */}
                                                    <div className="flex items-center space-x-1.5 bg-white p-1 rounded-xl border border-gray-200 shadow-xs">
                                                        {[0, 3, 5, 7, 14].map((days) => (
                                                            <button
                                                                key={days}
                                                                type="button"
                                                                onClick={() => setPrefs(prev => ({ ...prev, adoptionGraceDays: days }))}
                                                                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                                                                    prefs.adoptionGraceDays === days
                                                                        ? 'bg-[#F97316] text-white shadow-xs'
                                                                        : 'text-gray-600 hover:bg-gray-100'
                                                                }`}
                                                            >
                                                                {days}d {days === 0 ? '★' : ''}
                                                            </button>
                                                        ))}
                                                    </div>

                                                    {/* Custom Spinner */}
                                                    <div className="flex items-center space-x-1 bg-white border border-gray-200 rounded-xl px-2 py-1 shadow-xs">
                                                        <button
                                                            type="button"
                                                            onClick={() => setPrefs(prev => ({ ...prev, adoptionGraceDays: Math.max(0, prev.adoptionGraceDays - 1) }))}
                                                            disabled={prefs.adoptionGraceDays <= 0}
                                                            className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-30 disabled:hover:bg-gray-100 text-gray-700 font-bold flex items-center justify-center transition-colors text-sm"
                                                            title="Decrease stay duration"
                                                        >
                                                            -
                                                        </button>
                                                        <div className="flex items-baseline space-x-1 px-2">
                                                            <input
                                                                type="number"
                                                                min={0}
                                                                max={90}
                                                                value={prefs.adoptionGraceDays}
                                                                onChange={(e) => {
                                                                    const val = parseInt(e.target.value, 10);
                                                                    if (!isNaN(val)) {
                                                                        setPrefs(prev => ({ ...prev, adoptionGraceDays: Math.min(90, Math.max(0, val)) }));
                                                                    }
                                                                }}
                                                                className="w-10 text-center text-sm font-black text-gray-900 focus:outline-hidden"
                                                            />
                                                            <span className="text-[11px] font-bold text-gray-400 uppercase">days</span>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => setPrefs(prev => ({ ...prev, adoptionGraceDays: Math.min(90, prev.adoptionGraceDays + 1) }))}
                                                            className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold flex items-center justify-center transition-colors text-sm"
                                                            title="Increase stay duration"
                                                        >
                                                            +
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex justify-end pt-4">
                                            <Button
                                                type="button"
                                                variant="primary"
                                                onClick={handleSavePreferences}
                                                className="px-8 !bg-[#F97316] hover:!bg-[#EA580C] !border-[#F97316]"
                                            >
                                                Save Holding Rules
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                {/* TAB 3: Rescue Operations & SLA */}
                                {activeTab === 'dispatch' && (
                                    <div className="space-y-6">
                                        <div>
                                            <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">Rescue Missions & Triage SLA</h3>
                                            <p className="text-xs text-gray-500 font-medium mt-0.5">Manage operational priority levels for incoming subdivision endorsements.</p>
                                        </div>

                                        <div className="space-y-4">
                                            <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-between">
                                                <div>
                                                    <p className="text-xs font-bold text-gray-900 uppercase tracking-wider">Auto-Alert on Subdivision Endorsement</p>
                                                    <p className="text-xs text-gray-500 font-medium mt-0.5">Send high-priority audio chime and dashboard flash when a leader escalates a mission.</p>
                                                </div>
                                                <input
                                                    type="checkbox"
                                                    checked={prefs.soundOnEscalation}
                                                    onChange={(e) => setPrefs(prev => ({ ...prev, soundOnEscalation: e.target.checked }))}
                                                    className="w-5 h-5 accent-[#F97316] rounded cursor-pointer"
                                                />
                                            </div>

                                            <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-between">
                                                <div>
                                                    <p className="text-xs font-bold text-gray-900 uppercase tracking-wider">Siren on Verified Animal Bites</p>
                                                    <p className="text-xs text-gray-500 font-medium mt-0.5">Immediate siren chime for confirmed human bite incidents requiring urgent catch team dispatch.</p>
                                                </div>
                                                <input
                                                    type="checkbox"
                                                    checked={prefs.urgentBiteSiren}
                                                    onChange={(e) => setPrefs(prev => ({ ...prev, urgentBiteSiren: e.target.checked }))}
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
                                                Save Rescue SLA Rules
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                {/* TAB 4: Community Broadcasts */}
                                {activeTab === 'alerts' && (
                                    <div className="space-y-6">
                                        <div>
                                            <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">Barangay Broadcasts & Public Notices</h3>
                                            <p className="text-xs text-gray-500 font-medium mt-0.5">Configure emergency broadcast banner notifications to registered residents.</p>
                                        </div>

                                        <div className="space-y-4">
                                            <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-between">
                                                <div>
                                                    <p className="text-xs font-bold text-gray-900 uppercase tracking-wider">SMS Emergency Notification Channel</p>
                                                    <p className="text-xs text-gray-500 font-medium mt-0.5">Send urgent text broadcast alerts to verified resident phone numbers during rabies outbreaks.</p>
                                                </div>
                                                <input
                                                    type="checkbox"
                                                    checked={prefs.smsAlertsEnabled}
                                                    onChange={(e) => setPrefs(prev => ({ ...prev, smsAlertsEnabled: e.target.checked }))}
                                                    className="w-5 h-5 accent-[#F97316] rounded cursor-pointer"
                                                />
                                            </div>

                                            <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-between">
                                                <div>
                                                    <p className="text-xs font-bold text-gray-900 uppercase tracking-wider">Email Dispatch & Summary Digests</p>
                                                    <p className="text-xs text-gray-500 font-medium mt-0.5">Receive daily summary logs of active holdings and completed rescue missions.</p>
                                                </div>
                                                <input
                                                    type="checkbox"
                                                    checked={prefs.emailAlertsEnabled}
                                                    onChange={(e) => setPrefs(prev => ({ ...prev, emailAlertsEnabled: e.target.checked }))}
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
                                                Save Broadcast Channels
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                {/* TAB 5: Security & Access */}
                                {activeTab === 'security' && (
                                    <form onSubmit={handleChangePassword} className="space-y-6">
                                        <div>
                                            <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">Security & Officer Credentials</h3>
                                            <p className="text-xs text-gray-500 font-medium mt-0.5">Update your staff login password to keep your officer credentials secure.</p>
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

                                {/* TAB 6: System & Cache */}
                                {activeTab === 'preferences' && (
                                    <div className="space-y-6">
                                        <div>
                                            <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">System Memory & Diagnostics</h3>
                                            <p className="text-xs text-gray-500 font-medium mt-0.5">Purge cached records and force a synchronization with the Barangay server.</p>
                                        </div>

                                        <div className="space-y-4">
                                            <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-between">
                                                <div>
                                                    <p className="text-xs font-bold text-gray-900 uppercase tracking-wider">Clear Local Station Cache</p>
                                                    <p className="text-xs text-gray-500 font-medium mt-0.5">Purges stored reverse-geocoded landmarks and holding facility offline cache.</p>
                                                </div>
                                                <Button
                                                    type="button"
                                                    variant="light"
                                                    onClick={() => {
                                                        sessionStorage.clear();
                                                        showToast('success', 'Barangay station cache cleared successfully!');
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
                                                Save System Preferences
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

export default BrgySettings;
