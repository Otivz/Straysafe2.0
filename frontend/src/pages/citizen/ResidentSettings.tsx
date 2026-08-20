import { useState, useEffect, useRef, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import api from '../../utils/api';
import { DEFAULT_AVATAR, getProfilePicture, getPetPicture } from '../../utils/avatar';
import Button from '../../components/Button';
import ResiNavbar from '../../components/Navbars/ResiNavbar';
import ResiMobileNav from '../../components/Navbars/ResiMobileNav';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useTheme } from '../../context/ThemeContext';

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

const LocationPicker = ({ onLocationSelect, position }: { onLocationSelect: (lat: number, lng: number) => void, position: [number, number] }) => {
    useMapEvents({
        click(e) {
            onLocationSelect(e.latlng.lat, e.latlng.lng);
        },
    });
    return (position && position[0] && position[1]) ? <Marker position={position} /> : null;
};

const RecenterMap = ({ position }: { position: [number, number] }) => {
    const map = useMap();
    useEffect(() => {
        if (position && position[0] && position[1]) {
            map.setView(position, map.getZoom());
        }
    }, [position, map]);
    return null;
};

type SettingCategory = 'account' | 'my-pets' | 'notifications' | 'privacy' | 'location' | 'appearance' | 'help' | 'about';

const ResidentSettings = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { theme: globalTheme, setTheme: setGlobalTheme } = useTheme();
    const [activeTab, setActiveTab] = useState<SettingCategory>('account');
    const [isNavbarMenuOpen, setIsNavbarMenuOpen] = useState(false);
    const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
    const [saveSuccessMsg, setSaveSuccessMsg] = useState('');
    const [saveErrorMsg, setSaveErrorMsg] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Initial User Data
    const userStr = localStorage.getItem('resident_user') || sessionStorage.getItem('resident_user');
    const parsedUserObj = userStr ? JSON.parse(userStr) : null;
    const initialUser = parsedUserObj ? {
        latitude: null,
        longitude: null,
        ...parsedUserObj,
        user_id: parsedUserObj.user_id || parsedUserObj.id
    } : null;

    const [userData, setUserData] = useState<any>(initialUser);
    const [editData, setEditData] = useState<any>(initialUser || {});

    // Password State
    const [passwords, setPasswords] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    });

    // Preferences Local State
    const [qrIncludeContact, setQrIncludeContact] = useState(true);
    const [qrNotifyScan, setQrNotifyScan] = useState(true);
    const [vacReminder, setVacReminder] = useState(true);
    const [dewormReminder, setDewormReminder] = useState(true);

    const [notifComments, setNotifComments] = useState(true);
    const [notifStatusUpdates, setNotifStatusUpdates] = useState(true);
    const [notifRescueCompleted, setNotifRescueCompleted] = useState(true);
    const [notifHazardAlerts, setNotifHazardAlerts] = useState(true);
    const [notifLostPet, setNotifLostPet] = useState(true);
    const [notifQrScan, setNotifQrScan] = useState(true);
    const [emailNotif, setEmailNotif] = useState(true);
    const [pushNotif, setPushNotif] = useState(true);

    // Archived Notifications State
    const [notificationsList, setNotificationsList] = useState<any[]>([]);
    const [notifFilterTab, setNotifFilterTab] = useState<'archived' | 'active' | 'all'>('archived');
    const [notifSearch, setNotifSearch] = useState('');

    // Pet History State (Created, Removed, Activity)
    const [petHistoryData, setPetHistoryData] = useState<{
        current_pets: any[];
        removed_pets: any[];
        created_pets_history: any[];
        all_logs: any[];
    }>({
        current_pets: [],
        removed_pets: [],
        created_pets_history: [],
        all_logs: []
    });
    const [isPetHistoryLoading, setIsPetHistoryLoading] = useState(false);
    const [petHistorySubTab, setPetHistorySubTab] = useState<'all-created' | 'removed' | 'activity'>('all-created');
    const [petHistorySearch, setPetHistorySearch] = useState('');

    const [reportVisibility, setReportVisibility] = useState<'Public' | 'Private'>('Private');
    const [hideIdentity, setHideIdentity] = useState(false);
    const [allowContact, setAllowContact] = useState(true);
    const [showPhoneRescuersOnly, setShowPhoneRescuersOnly] = useState(true);

    const [allowGPS, setAllowGPS] = useState(true);
    const [autoLocation, setAutoLocation] = useState(true);
    const [locationAccuracy, setLocationAccuracy] = useState('High');

    const [mapStyle, setMapStyle] = useState('Default');
    const [language, setLanguage] = useState('English');

    useEffect(() => {
        const tabParam = searchParams.get('tab');
        if (tabParam && ['account', 'my-pets', 'notifications', 'privacy', 'location', 'appearance', 'help', 'about'].includes(tabParam)) {
            setActiveTab(tabParam as SettingCategory);
        }
    }, [searchParams]);

    useEffect(() => {
        if (activeTab === 'notifications') {
            const userId = getUserId();
            if (userId) {
                axios.post(`http://localhost:8000/notifications/mark-all-read/${userId}`)
                    .then(() => fetchUserNotifications())
                    .catch(err => console.error('Failed to auto mark notifications read:', err));
            }
        } else if (activeTab === 'my-pets') {
            fetchPetHistory();
        }
    }, [activeTab]);

    useEffect(() => {
        fetchUserProfile();
        fetchUserNotifications();
        fetchPetHistory();
    }, []);

    const getUserId = () => {
        const storedUser = localStorage.getItem('resident_user') || sessionStorage.getItem('resident_user');
        if (storedUser) {
            const parsed = JSON.parse(storedUser);
            if (parsed.user_id || parsed.id) return parsed.user_id || parsed.id;
        }
        return userData?.user_id || userData?.id || initialUser?.user_id || 1;
    };

    const fetchUserNotifications = async () => {
        const userId = getUserId();
        if (!userId) return;
        try {
            const response = await axios.get(`http://localhost:8000/notifications/user/${userId}?include_archived=true`);
            setNotificationsList(response.data);
        } catch (error) {
            console.error('Error fetching user notifications:', error);
        }
    };

    const fetchPetHistory = async () => {
        const userId = getUserId();
        if (!userId) return;
        setIsPetHistoryLoading(true);
        try {
            const response = await axios.get(`http://localhost:8000/pets/owner/${userId}/history`);
            if (response.data) {
                setPetHistoryData(response.data);
            }
        } catch (error) {
            console.error('Error fetching pet history:', error);
        } finally {
            setIsPetHistoryLoading(false);
        }
    };

    const [restoringPetId, setRestoringPetId] = useState<number | string | null>(null);
    const [selectedHistoryPet, setSelectedHistoryPet] = useState<any | null>(null);

    const handleRestorePet = async (pet: any) => {
        const confirm = window.confirm(`Restore "${pet.pet_name}" back to your active registered pets?`);
        if (!confirm) return;

        const targetKey = pet.pet_id || pet.log_id || pet.pet_name;
        setRestoringPetId(targetKey);
        try {
            const userId = getUserId();
            await axios.post('http://localhost:8000/pets/restore', {
                pet_id: pet.pet_id,
                log_id: pet.log_id,
                pet_name: pet.pet_name,
                pet_type: pet.pet_type || 'Dog',
                breed: pet.breed || 'Unknown',
                gender: pet.gender || 'Unknown',
                primary_color: pet.primary_color || 'Brown',
                photo_url: pet.photo_url,
                owner_id: userId
            });
            showNotification(`Successfully restored "${pet.pet_name}" to your registered pets!`);
            fetchPetHistory();
        } catch (err) {
            console.error('Failed to restore pet:', err);
            showNotification('Failed to restore pet. Please try again.', true);
        } finally {
            setRestoringPetId(null);
        }
    };

    const handleArchiveNotification = async (id: number) => {
        try {
            await axios.post(`http://localhost:8000/notifications/${id}/archive`);
            fetchUserNotifications();
            showNotification('Notification moved to archive');
        } catch (error) {
            console.error('Error archiving notification:', error);
        }
    };

    const handleUnarchiveNotification = async (id: number) => {
        try {
            await axios.post(`http://localhost:8000/notifications/${id}/unarchive`);
            fetchUserNotifications();
            showNotification('Notification restored to active inbox');
        } catch (error) {
            console.error('Error restoring notification:', error);
        }
    };

    const handleToggleRead = async (id: number, currentRead: boolean) => {
        try {
            await axios.patch(`http://localhost:8000/notifications/${id}`, { is_read: !currentRead });
            fetchUserNotifications();
        } catch (error) {
            console.error('Error toggling read status:', error);
        }
    };

    const handleDeleteNotification = async (id: number) => {
        try {
            await axios.delete(`http://localhost:8000/notifications/${id}`);
            fetchUserNotifications();
            showNotification('Notification permanently deleted');
        } catch (error) {
            console.error('Error deleting notification:', error);
        }
    };

    const handleArchiveAll = async () => {
        const userId = getUserId();
        try {
            await axios.post(`http://localhost:8000/notifications/archive-all/${userId}`);
            fetchUserNotifications();
            showNotification('All active notifications archived');
        } catch (error) {
            console.error('Error archiving all notifications:', error);
        }
    };

    const handleClearArchived = async () => {
        const userId = getUserId();
        if (!window.confirm('Are you sure you want to permanently delete all archived notifications?')) return;
        try {
            await axios.delete(`http://localhost:8000/notifications/archived/clear/${userId}`);
            fetchUserNotifications();
            showNotification('Archived notifications cleared');
        } catch (error) {
            console.error('Error clearing archived notifications:', error);
        }
    };

    const handleNotificationClick = (notif: any) => {
        if (!notif.is_read) {
            handleToggleRead(notif.notification_id, false);
        }

        const typeStr = (notif.type || '').toLowerCase();
        const titleStr = (notif.title || '').toLowerCase();
        const msgStr = (notif.message || '').toLowerCase();

        const isMatch = typeStr === 'potential_match' ||
            typeStr === 'match_review' ||
            titleStr.includes('match') ||
            titleStr.includes('sighting') ||
            msgStr.includes('match') ||
            msgStr.includes('potential match') ||
            msgStr.includes('matches of your dog');

        if (isMatch && notif.related_id) {
            navigate(`/resident/reports/${notif.related_id}/match-review`);
        } else if (notif.related_id) {
            if (typeStr === 'alert' || titleStr.includes('scan')) {
                navigate(`/resident/pet/${notif.related_id}/scan-history`);
            } else {
                navigate(`/resident/reports/${notif.related_id}`);
            }
        } else {
            navigate('/resident/view-history');
        }
    };

    const formatTimestamp = (dateStr: string) => {
        if (!dateStr) return '';
        const dt = new Date(dateStr);
        return dt.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });
    };

    const fetchUserProfile = async () => {
        const userId = getUserId();
        if (!userId) return;

        try {
            const response = await api.get(`/users/${userId}`);
            setUserData(response.data);
            setEditData(response.data);
            if (localStorage.getItem('resident_user')) {
                localStorage.setItem('resident_user', JSON.stringify(response.data));
            } else {
                sessionStorage.setItem('resident_user', JSON.stringify(response.data));
            }
        } catch (error) {
            console.error('Error fetching user profile:', error);
        }
    };

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploadingPhoto(true);
        const formData = new FormData();
        formData.append('file', file);

        try {
            await api.post(`/users/${userData.user_id}/profile-picture`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            fetchUserProfile();
            showNotification('Profile photo updated successfully!');
        } catch (error) {
            console.error('Error uploading photo:', error);
            alert('Failed to upload profile picture.');
        } finally {
            setIsUploadingPhoto(false);
        }
    };

    const showNotification = (msg: string, isError = false) => {
        if (isError) {
            setSaveErrorMsg(msg);
            setTimeout(() => setSaveErrorMsg(''), 4000);
        } else {
            setSaveSuccessMsg(msg);
            setTimeout(() => setSaveSuccessMsg(''), 4000);
        }
    };

    const handleSaveChanges = async () => {
        try {
            await api.put(`/users/${userData.user_id}`, editData);
            fetchUserProfile();
            showNotification('Settings saved successfully!');
        } catch (error) {
            console.error('Error saving settings:', error);
            showNotification('Failed to save settings. Please try again.', true);
        }
    };

    const handleChangePassword = (e: React.FormEvent) => {
        e.preventDefault();
        if (!passwords.currentPassword) {
            showNotification('Please enter your current password.', true);
            return;
        }
        if (passwords.newPassword !== passwords.confirmPassword) {
            showNotification('New password and confirm password do not match.', true);
            return;
        }
        if (passwords.newPassword.length < 6) {
            showNotification('Password must be at least 6 characters long.', true);
            return;
        }
        showNotification('Password updated successfully!');
        setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
    };

    const navItems: { id: SettingCategory; label: string; icon: ReactNode }[] = [
        {
            id: 'account',
            label: 'Account',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
            )
        },
        {
            id: 'my-pets',
            label: 'My Pets',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h.01M10 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-4l-4 4-1-4z" />
                </svg>
            )
        },
        {
            id: 'notifications',
            label: 'Notifications',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
            )
        },
        {
            id: 'privacy',
            label: 'Privacy',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
            )
        },
        {
            id: 'location',
            label: 'Location',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
            )
        },
        {
            id: 'appearance',
            label: 'Appearance',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                </svg>
            )
        },
        {
            id: 'help',
            label: 'Help & Support',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            )
        },
        {
            id: 'about',
            label: 'About',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            )
        }
    ];

    return (
        <div className="min-h-screen bg-[#F7F7F7] font-sans pb-24">
            <ResiNavbar
                onMenuToggle={(isOpen) => setIsNavbarMenuOpen(isOpen)}
                onSearch={setSearchQuery}
                searchValue={searchQuery}
                isMobileSearchOpen={isMobileSearchOpen}
                onCloseSearch={() => setIsMobileSearchOpen(false)}
                notifications={notificationsList.filter(n => !n.is_archived)}
                onMarkNotificationRead={(id) => handleToggleRead(id, false)}
                onDeleteNotification={(id) => handleArchiveNotification(id)}
                onMarkAllNotificationsRead={async () => {
                    const storedUser = localStorage.getItem('resident_user');
                    const userId = storedUser ? JSON.parse(storedUser).user_id : initialUser.user_id;
                    await axios.post(`http://localhost:8000/notifications/mark-all-read/${userId}`);
                    fetchUserNotifications();
                }}
            />

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 sm:pt-32">
                {/* Header Title with Global Save Button */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                    <div>
                        <h1 className="text-2xl font-black text-[#1a1208] flex items-center gap-3">
                            <span className="p-2.5 bg-orange-50 text-[#F97316] rounded-xl">
                                ⚙️
                            </span>
                            Settings
                        </h1>
                        <p className="text-xs text-gray-500 font-semibold mt-1">Manage your account preferences, privacy, pet options, and notifications</p>
                    </div>

                    <Button
                        variant="primary"
                        onClick={handleSaveChanges}
                        className="py-3 px-6 gap-2 shadow-lg shadow-orange-100 uppercase tracking-widest text-xs font-black"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                        Save Changes
                    </Button>
                </div>

                {/* Success / Error Alerts */}
                {saveSuccessMsg && (
                    <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-bold flex items-center gap-2 animate-in fade-in">
                        <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        {saveSuccessMsg}
                    </div>
                )}

                {saveErrorMsg && (
                    <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs font-bold flex items-center gap-2 animate-in fade-in">
                        <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        {saveErrorMsg}
                    </div>
                )}

                {/* Main Settings Layout Grid */}
                <div className="flex flex-col lg:flex-row gap-8">
                    {/* Sidebar Nav Tabs */}
                    <div className="lg:w-64 shrink-0">
                        <div className="bg-white border border-gray-200 rounded-2xl p-3 shadow-sm space-y-1">
                            {navItems.map((item) => {
                                const isActive = activeTab === item.id;
                                return (
                                    <button
                                        key={item.id}
                                        onClick={() => setActiveTab(item.id)}
                                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all text-left ${isActive
                                                ? 'bg-[#F97316] text-white shadow-md shadow-orange-100 font-black'
                                                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                                            }`}
                                    >
                                        <span className={isActive ? 'text-white' : 'text-gray-400'}>{item.icon}</span>
                                        {item.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Right Panel Content */}
                    <div className="flex-1 bg-white border border-gray-200 rounded-2xl p-6 sm:p-8 shadow-sm">

                        {/* 1. ACCOUNT CATEGORY */}
                        {activeTab === 'account' && (
                            <div className="space-y-8 animate-in fade-in duration-200">
                                <div>
                                    <h2 className="text-lg font-black text-[#1a1208] flex items-center gap-2">
                                        👤 Personal Information
                                    </h2>
                                    <p className="text-xs text-gray-500 font-semibold mt-1">Update your basic profile info and security settings</p>
                                </div>

                                {/* Profile Picture Section */}
                                <div className="flex items-center gap-6 p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                    <div className="relative group">
                                        <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-white shadow-md">
                                            <img
                                                src={getProfilePicture(userData.profile_picture)}
                                                alt={userData.name}
                                                className="w-full h-full object-cover"
                                                onError={(e) => { e.currentTarget.src = DEFAULT_AVATAR; }}
                                            />
                                        </div>
                                        {isUploadingPhoto && (
                                            <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center">
                                                <svg className="animate-spin h-6 w-6 text-white" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                            </div>
                                        )}
                                    </div>
                                    <div>
                                        <span className="text-xs font-black text-[#1a1208] block">Profile Picture</span>
                                        <p className="text-[11px] text-gray-400 font-medium mb-3">PNG, JPG or WEBP (Max 5MB)</p>
                                        <button
                                            onClick={() => fileInputRef.current?.click()}
                                            disabled={isUploadingPhoto}
                                            className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-700 hover:border-orange-300 hover:text-[#F97316] transition-all shadow-sm"
                                        >
                                            Change Photo
                                        </button>
                                        <input type="file" ref={fileInputRef} onChange={handlePhotoUpload} className="hidden" accept="image/*" />
                                    </div>
                                </div>

                                {/* Form Inputs */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                    <div>
                                        <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest block mb-2">Full Name</label>
                                        <input
                                            type="text"
                                            value={editData.name || ''}
                                            onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                                            className="w-full h-11 bg-gray-50 border border-gray-150 rounded-xl px-4 text-xs font-bold text-gray-800 focus:outline-none focus:border-[#F97316] focus:bg-white transition-all"
                                        />
                                    </div>

                                    <div>
                                        <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest block mb-2">Email Address</label>
                                        <input
                                            type="email"
                                            value={editData.email || ''}
                                            onChange={(e) => setEditData({ ...editData, email: e.target.value })}
                                            className="w-full h-11 bg-gray-50 border border-gray-150 rounded-xl px-4 text-xs font-bold text-gray-800 focus:outline-none focus:border-[#F97316] focus:bg-white transition-all"
                                        />
                                    </div>

                                    <div>
                                        <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest block mb-2">Phone Number</label>
                                        <input
                                            type="text"
                                            value={editData.phone || ''}
                                            onChange={(e) => setEditData({ ...editData, phone: e.target.value })}
                                            placeholder="0917-XXX-XXXX"
                                            className="w-full h-11 bg-gray-50 border border-gray-150 rounded-xl px-4 text-xs font-bold text-gray-800 focus:outline-none focus:border-[#F97316] focus:bg-white transition-all"
                                        />
                                    </div>

                                    <div>
                                        <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest block mb-2">Address / Subdivision</label>
                                        <input
                                            type="text"
                                            value={editData.address || ''}
                                            onChange={(e) => setEditData({ ...editData, address: e.target.value })}
                                            className="w-full h-11 bg-gray-50 border border-gray-150 rounded-xl px-4 text-xs font-bold text-gray-800 focus:outline-none focus:border-[#F97316] focus:bg-white transition-all"
                                        />
                                    </div>
                                </div>

                                <div className="pt-6 border-t border-gray-100">
                                    <h3 className="text-sm font-black text-[#1a1208] mb-4 flex items-center gap-2">
                                        🔒 Change Password
                                    </h3>
                                    <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
                                        <div>
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">Current Password</label>
                                            <input
                                                type="password"
                                                value={passwords.currentPassword}
                                                onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })}
                                                className="w-full h-10 bg-gray-50 border border-gray-150 rounded-xl px-3.5 text-xs font-bold text-gray-800 focus:outline-none focus:border-[#F97316] focus:bg-white transition-all"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">New Password</label>
                                            <input
                                                type="password"
                                                value={passwords.newPassword}
                                                onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
                                                className="w-full h-10 bg-gray-50 border border-gray-150 rounded-xl px-3.5 text-xs font-bold text-gray-800 focus:outline-none focus:border-[#F97316] focus:bg-white transition-all"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">Confirm Password</label>
                                            <input
                                                type="password"
                                                value={passwords.confirmPassword}
                                                onChange={(e) => setPasswords({ ...passwords, confirmPassword: e.target.value })}
                                                className="w-full h-10 bg-gray-50 border border-gray-150 rounded-xl px-3.5 text-xs font-bold text-gray-800 focus:outline-none focus:border-[#F97316] focus:bg-white transition-all"
                                            />
                                        </div>
                                        <button
                                            type="submit"
                                            className="px-5 py-2.5 bg-gray-900 text-white rounded-xl text-xs font-bold hover:bg-black transition-all shadow-sm"
                                        >
                                            Update Password
                                        </button>
                                    </form>
                                </div>
                            </div>
                        )}

                        {/* 2. MY PETS CATEGORY */}
                        {activeTab === 'my-pets' && (
                            <div className="space-y-8 animate-in fade-in duration-200">
                                <div>
                                    <h2 className="text-lg font-black text-[#1a1208] flex items-center gap-2">
                                        🐾 Pet Preferences & Records History
                                    </h2>
                                    <p className="text-xs text-gray-500 font-semibold mt-1">Manage pet preferences, QR settings, and view all created & removed pet records</p>
                                </div>

                                {/* Pet Management Shortcut Card */}
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-5 bg-orange-50/60 border border-orange-100 rounded-2xl">
                                    <div>
                                        <span className="text-xs font-black text-[#1a1208] block">Registered Pets Workspace</span>
                                        <p className="text-xs text-gray-500 font-semibold mt-0.5">Manage live records, update photos, and generate QR tag cards</p>
                                    </div>
                                    <Button
                                        variant="primary"
                                        onClick={() => navigate('/resident/pets')}
                                        className="py-2.5 px-5 text-xs font-black uppercase tracking-widest gap-2"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                        View My Pets Page
                                    </Button>
                                </div>

                                {/* Quick Stats Counters */}
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <div className="p-4 bg-gray-50 border border-gray-100 rounded-2xl flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center font-black text-lg">
                                            🐾
                                        </div>
                                        <div>
                                            <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Created</div>
                                            <div className="text-base font-black text-gray-900">
                                                {petHistoryData.created_pets_history.length || petHistoryData.current_pets.length} Pets
                                            </div>
                                        </div>
                                    </div>
                                    <div className="p-4 bg-emerald-50/60 border border-emerald-100 rounded-2xl flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center font-black text-lg">
                                            ✅
                                        </div>
                                        <div>
                                            <div className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Currently Active</div>
                                            <div className="text-base font-black text-emerald-950">
                                                {petHistoryData.current_pets.length} Registered
                                            </div>
                                        </div>
                                    </div>
                                    <div className="p-4 bg-rose-50/60 border border-rose-100 rounded-2xl flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center font-black text-lg">
                                            🗑️
                                        </div>
                                        <div>
                                            <div className="text-[10px] font-black text-rose-600 uppercase tracking-widest">Removed Pets</div>
                                            <div className="text-base font-black text-rose-950">
                                                {petHistoryData.removed_pets.length} Archived
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Pet History & Removed Pets Section */}
                                <div className="pt-2 border-t border-gray-100 space-y-4">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                        <div>
                                            <h3 className="text-sm font-black text-gray-900 flex items-center gap-2">
                                                📜 Pet Records History & Archives
                                            </h3>
                                            <p className="text-xs text-gray-500 font-medium mt-0.5">
                                                All pets ever registered or removed under your account
                                            </p>
                                        </div>
                                        
                                        {/* Refresh Button */}
                                        <button
                                            onClick={fetchPetHistory}
                                            disabled={isPetHistoryLoading}
                                            className="self-start sm:self-auto px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5"
                                        >
                                            <svg className={`w-3.5 h-3.5 ${isPetHistoryLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                            </svg>
                                            Refresh
                                        </button>
                                    </div>

                                    {/* Sub-tabs & Search */}
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gray-50 p-2 rounded-2xl border border-gray-150">
                                        <div className="flex items-center gap-1 overflow-x-auto">
                                            <button
                                                type="button"
                                                onClick={() => setPetHistorySubTab('all-created')}
                                                className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 whitespace-nowrap ${
                                                    petHistorySubTab === 'all-created'
                                                        ? 'bg-white text-gray-900 shadow-sm'
                                                        : 'text-gray-500 hover:text-gray-900'
                                                }`}
                                            >
                                                🐾 All Created Pets
                                                <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${petHistorySubTab === 'all-created' ? 'bg-orange-100 text-orange-700' : 'bg-gray-200 text-gray-600'}`}>
                                                    {petHistoryData.created_pets_history.length || petHistoryData.current_pets.length}
                                                </span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setPetHistorySubTab('removed')}
                                                className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 whitespace-nowrap ${
                                                    petHistorySubTab === 'removed'
                                                        ? 'bg-white text-rose-700 shadow-sm'
                                                        : 'text-gray-500 hover:text-gray-900'
                                                }`}
                                            >
                                                🗑️ Removed Pets
                                                <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${petHistorySubTab === 'removed' ? 'bg-rose-100 text-rose-700' : 'bg-gray-200 text-gray-600'}`}>
                                                    {petHistoryData.removed_pets.length}
                                                </span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setPetHistorySubTab('activity')}
                                                className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 whitespace-nowrap ${
                                                    petHistorySubTab === 'activity'
                                                        ? 'bg-white text-gray-900 shadow-sm'
                                                        : 'text-gray-500 hover:text-gray-900'
                                                }`}
                                            >
                                                ⏱️ Activity Timeline
                                                <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${petHistorySubTab === 'activity' ? 'bg-orange-100 text-orange-700' : 'bg-gray-200 text-gray-600'}`}>
                                                    {petHistoryData.all_logs.length}
                                                </span>
                                            </button>
                                        </div>

                                        {/* Search Filter */}
                                        <div className="relative min-w-[180px]">
                                            <input
                                                type="text"
                                                value={petHistorySearch}
                                                onChange={(e) => setPetHistorySearch(e.target.value)}
                                                placeholder="Filter records..."
                                                className="w-full h-8 pl-8 pr-3 text-xs font-semibold bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-[#F97316]"
                                            />
                                            <svg className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                            </svg>
                                        </div>
                                    </div>

                                    {/* History Content Display */}
                                    {isPetHistoryLoading ? (
                                        <div className="p-8 text-center bg-gray-50 rounded-2xl border border-gray-100 animate-pulse">
                                            <div className="text-2xl mb-2">🐾</div>
                                            <p className="text-xs font-bold text-gray-500">Loading pet history records...</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {/* 1. ALL CREATED PETS SUBTAB */}
                                            {petHistorySubTab === 'all-created' && (
                                                <>
                                                    {petHistoryData.created_pets_history.length === 0 && petHistoryData.current_pets.length === 0 ? (
                                                        <div className="p-8 text-center bg-gray-50 rounded-2xl border border-gray-100">
                                                            <span className="text-2xl block mb-2">🐾</span>
                                                            <p className="text-xs font-bold text-gray-700">No pet registration records found</p>
                                                            <p className="text-[11px] text-gray-400 mt-1">When you register pets, their creation log will appear here.</p>
                                                        </div>
                                                    ) : (
                                                        <div className="grid grid-cols-1 gap-3">
                                                            {/* Combine and filter created pets */}
                                                            {(petHistoryData.created_pets_history.length > 0 ? petHistoryData.created_pets_history : petHistoryData.current_pets)
                                                                .filter(p => {
                                                                    const q = petHistorySearch.toLowerCase();
                                                                    return !q || (p.pet_name || '').toLowerCase().includes(q) || (p.pet_type || '').toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q);
                                                                })
                                                                .map((p, idx) => {
                                                                    const isCurrentlyActive = petHistoryData.current_pets.some(cp => cp.pet_id === p.pet_id);
                                                                    return (
                                                                        <div
                                                                            key={p.log_id || p.pet_id || idx}
                                                                            onClick={() => setSelectedHistoryPet(p)}
                                                                            className="p-4 bg-white border border-gray-150 hover:border-orange-300 rounded-2xl hover:shadow-md transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm cursor-pointer hover:scale-[1.005]"
                                                                        >
                                                                            <div className="flex items-center gap-3">
                                                                                <div className="w-11 h-11 rounded-2xl bg-orange-100 flex items-center justify-center text-xl shrink-0">
                                                                                    {p.pet_type === 'Cat' ? '🐱' : '🐶'}
                                                                                </div>
                                                                                <div>
                                                                                    <div className="flex items-center gap-2">
                                                                                        <h4 className="text-sm font-black text-gray-900">{p.pet_name || 'Unnamed Pet'}</h4>
                                                                                        <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-orange-50 text-orange-700 border border-orange-200">
                                                                                            {p.pet_type || 'Dog'}
                                                                                        </span>
                                                                                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                                                                                            isCurrentlyActive
                                                                                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                                                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                                                                                        }`}>
                                                                                            {isCurrentlyActive ? 'Active' : 'Removed'}
                                                                                        </span>
                                                                                        {p.pet_id && (
                                                                                            <span className="text-[10px] font-bold text-gray-400">
                                                                                                ID #{p.pet_id}
                                                                                            </span>
                                                                                        )}
                                                                                    </div>
                                                                                    <p className="text-xs text-gray-500 mt-0.5 font-medium">
                                                                                        {p.description || `Registered new ${p.pet_type || 'pet'}: ${p.pet_name}`}
                                                                                    </p>
                                                                                </div>
                                                                            </div>
                                                                            <div className="flex items-center gap-3 shrink-0" onClick={(e) => e.stopPropagation()}>
                                                                                <div className="text-right">
                                                                                    <span className="text-[10px] font-bold text-gray-400 block uppercase tracking-wider">Registered On</span>
                                                                                    <span className="text-xs font-black text-gray-800">
                                                                                        {p.created_at || 'Recorded in system'}
                                                                                    </span>
                                                                                </div>
                                                                                {!isCurrentlyActive && (
                                                                                    <button
                                                                                        type="button"
                                                                                        disabled={restoringPetId === (p.pet_id || p.log_id || p.pet_name)}
                                                                                        onClick={() => handleRestorePet(p)}
                                                                                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                                                                    >
                                                                                        {restoringPetId === (p.pet_id || p.log_id || p.pet_name) ? 'Restoring...' : 'Restore'}
                                                                                    </button>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                        </div>
                                                    )}
                                                </>
                                            )}

                                            {/* 2. REMOVED PETS SUBTAB */}
                                            {petHistorySubTab === 'removed' && (
                                                <>
                                                    {petHistoryData.removed_pets.length === 0 ? (
                                                        <div className="p-8 text-center bg-gray-50 rounded-2xl border border-gray-100">
                                                            <span className="text-2xl block mb-2">✨</span>
                                                            <p className="text-xs font-bold text-gray-700">No removed pets</p>
                                                            <p className="text-[11px] text-gray-400 mt-1">You haven't removed any pets from your account.</p>
                                                        </div>
                                                    ) : (
                                                        <div className="grid grid-cols-1 gap-3">
                                                            {petHistoryData.removed_pets
                                                                .filter(p => {
                                                                    const q = petHistorySearch.toLowerCase();
                                                                    return !q || (p.pet_name || '').toLowerCase().includes(q) || (p.pet_type || '').toLowerCase().includes(q) || (p.breed || '').toLowerCase().includes(q);
                                                                })
                                                                .map((p, idx) => (
                                                                    <div
                                                                        key={p.log_id || idx}
                                                                        onClick={() => setSelectedHistoryPet(p)}
                                                                        className="p-4 bg-rose-50/40 hover:bg-rose-50/70 border border-rose-150 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm cursor-pointer transition-all hover:scale-[1.005]"
                                                                    >
                                                                        <div className="flex items-center gap-3">
                                                                            <div className="w-11 h-11 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center text-xl shrink-0">
                                                                                {p.photo_url ? (
                                                                                    <img src={getPetPicture(p.photo_url)} alt={p.pet_name} className="w-full h-full object-cover rounded-2xl" />
                                                                                ) : (
                                                                                    <span>🗑️</span>
                                                                                )}
                                                                            </div>
                                                                            <div>
                                                                                <div className="flex items-center gap-2">
                                                                                    <h4 className="text-sm font-black text-gray-900 line-through decoration-rose-400">{p.pet_name}</h4>
                                                                                    <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-rose-100 text-rose-700 border border-rose-200">
                                                                                        Removed
                                                                                    </span>
                                                                                    <span className="text-[10px] font-bold text-gray-500">
                                                                                        {p.pet_type} {p.breed && p.breed !== 'Unknown Breed' && `• ${p.breed}`}
                                                                                    </span>
                                                                                </div>
                                                                                <p className="text-xs text-gray-500 mt-0.5 font-medium">
                                                                                    {p.description || `Deleted pet record: ${p.pet_name}`}
                                                                                </p>
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex items-center gap-3 shrink-0" onClick={(e) => e.stopPropagation()}>
                                                                            <div className="text-right">
                                                                                <span className="text-[10px] font-bold text-rose-500 block uppercase tracking-wider">Removal Date</span>
                                                                                <span className="text-xs font-black text-gray-800">
                                                                                    {p.removed_at || 'Past deletion'}
                                                                                </span>
                                                                            </div>
                                                                            <button
                                                                                type="button"
                                                                                disabled={restoringPetId === (p.pet_id || p.log_id || p.pet_name)}
                                                                                onClick={() => handleRestorePet(p)}
                                                                                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow-sm shadow-emerald-600/20 cursor-pointer disabled:opacity-50"
                                                                            >
                                                                                {restoringPetId === (p.pet_id || p.log_id || p.pet_name) ? (
                                                                                    <>
                                                                                        <svg className="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                                                        </svg>
                                                                                        Restoring...
                                                                                    </>
                                                                                ) : (
                                                                                    <>
                                                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                                                        </svg>
                                                                                        Restore Pet
                                                                                    </>
                                                                                )}
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                        </div>
                                                    )}
                                                </>
                                            )}

                                            {/* 3. ACTIVITY TIMELINE SUBTAB */}
                                            {petHistorySubTab === 'activity' && (
                                                <>
                                                    {petHistoryData.all_logs.length === 0 ? (
                                                        <div className="p-8 text-center bg-gray-50 rounded-2xl border border-gray-100">
                                                            <span className="text-2xl block mb-2">📋</span>
                                                            <p className="text-xs font-bold text-gray-700">No activity logs recorded yet</p>
                                                        </div>
                                                    ) : (
                                                        <div className="space-y-2">
                                                            {petHistoryData.all_logs
                                                                .filter(l => {
                                                                    const q = petHistorySearch.toLowerCase();
                                                                    return !q || (l.description || '').toLowerCase().includes(q) || (l.action || '').toLowerCase().includes(q);
                                                                })
                                                                .map((log, idx) => (
                                                                    <div key={log.log_id || idx} className="p-3.5 bg-white border border-gray-100 rounded-xl flex items-center justify-between gap-3 text-xs shadow-2xs">
                                                                        <div className="flex items-center gap-3">
                                                                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider shrink-0 ${
                                                                                log.action === 'CREATE_PET'
                                                                                    ? 'bg-emerald-100 text-emerald-700'
                                                                                    : log.action === 'DELETE_PET'
                                                                                    ? 'bg-rose-100 text-rose-700'
                                                                                    : 'bg-blue-100 text-blue-700'
                                                                            }`}>
                                                                                {log.action?.replace('_PET', '') || 'ACTION'}
                                                                            </span>
                                                                            <span className="font-bold text-gray-800">{log.description}</span>
                                                                        </div>
                                                                        <span className="text-[11px] font-semibold text-gray-400 shrink-0 whitespace-nowrap">
                                                                            {log.timestamp}
                                                                        </span>
                                                                    </div>
                                                                ))}
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* QR Preferences */}
                                <div className="pt-6 border-t border-gray-100">
                                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Default QR Card Download Options</h3>
                                    <div className="space-y-3">
                                        <label className="flex items-center gap-3 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={qrIncludeContact}
                                                onChange={(e) => setQrIncludeContact(e.target.checked)}
                                                className="w-4.5 h-4.5 accent-[#F97316] rounded border-gray-300"
                                            />
                                            <span className="text-xs font-bold text-gray-800">Include Owner Contact Information on QR Card</span>
                                        </label>
                                        <label className="flex items-center gap-3 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={qrNotifyScan}
                                                onChange={(e) => setQrNotifyScan(e.target.checked)}
                                                className="w-4.5 h-4.5 accent-[#F97316] rounded border-gray-300"
                                            />
                                            <span className="text-xs font-bold text-gray-800">Notify me immediately when pet's QR code is scanned</span>
                                        </label>
                                    </div>
                                </div>

                                {/* Reminders */}
                                <div className="pt-6 border-t border-gray-100">
                                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Auto Reminders</h3>
                                    <div className="space-y-3">
                                        <label className="flex items-center gap-3 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={vacReminder}
                                                onChange={(e) => setVacReminder(e.target.checked)}
                                                className="w-4.5 h-4.5 accent-[#F97316] rounded border-gray-300"
                                            />
                                            <span className="text-xs font-bold text-gray-800">Vaccination Reminder</span>
                                        </label>
                                        <label className="flex items-center gap-3 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={dewormReminder}
                                                onChange={(e) => setDewormReminder(e.target.checked)}
                                                className="w-4.5 h-4.5 accent-[#F97316] rounded border-gray-300"
                                            />
                                            <span className="text-xs font-bold text-gray-800">Deworming Reminder</span>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 3. NOTIFICATIONS CATEGORY */}
                        {activeTab === 'notifications' && (
                            <div className="space-y-8 animate-in fade-in duration-200">
                                <div>
                                    <h2 className="text-lg font-black text-[#1a1208] flex items-center gap-2">
                                        🔔 Notification Preferences
                                    </h2>
                                    <p className="text-xs text-gray-500 font-semibold mt-1">Choose what updates you want to receive</p>
                                </div>

                                <div className="space-y-4">
                                    <label className="flex items-center justify-between p-3.5 bg-gray-50 rounded-xl border border-gray-100 cursor-pointer">
                                        <span className="text-xs font-bold text-gray-800">New comments on my reports</span>
                                        <input type="checkbox" checked={notifComments} onChange={(e) => setNotifComments(e.target.checked)} className="w-4.5 h-4.5 accent-[#F97316]" />
                                    </label>

                                    <label className="flex items-center justify-between p-3.5 bg-gray-50 rounded-xl border border-gray-100 cursor-pointer">
                                        <span className="text-xs font-bold text-gray-800">Report status updates</span>
                                        <input type="checkbox" checked={notifStatusUpdates} onChange={(e) => setNotifStatusUpdates(e.target.checked)} className="w-4.5 h-4.5 accent-[#F97316]" />
                                    </label>

                                    <label className="flex items-center justify-between p-3.5 bg-gray-50 rounded-xl border border-gray-100 cursor-pointer">
                                        <span className="text-xs font-bold text-gray-800">Rescue completed alerts</span>
                                        <input type="checkbox" checked={notifRescueCompleted} onChange={(e) => setNotifRescueCompleted(e.target.checked)} className="w-4.5 h-4.5 accent-[#F97316]" />
                                    </label>

                                    <label className="flex items-center justify-between p-3.5 bg-gray-50 rounded-xl border border-gray-100 cursor-pointer">
                                        <span className="text-xs font-bold text-gray-800">Hazard announcements in my area</span>
                                        <input type="checkbox" checked={notifHazardAlerts} onChange={(e) => setNotifHazardAlerts(e.target.checked)} className="w-4.5 h-4.5 accent-[#F97316]" />
                                    </label>

                                    <label className="flex items-center justify-between p-3.5 bg-gray-50 rounded-xl border border-gray-100 cursor-pointer">
                                        <span className="text-xs font-bold text-gray-800">Lost pet alerts nearby</span>
                                        <input type="checkbox" checked={notifLostPet} onChange={(e) => setNotifLostPet(e.target.checked)} className="w-4.5 h-4.5 accent-[#F97316]" />
                                    </label>

                                    <label className="flex items-center justify-between p-3.5 bg-gray-50 rounded-xl border border-gray-100 cursor-pointer">
                                        <span className="text-xs font-bold text-gray-800">QR code scan alerts</span>
                                        <input type="checkbox" checked={notifQrScan} onChange={(e) => setNotifQrScan(e.target.checked)} className="w-4.5 h-4.5 accent-[#F97316]" />
                                    </label>
                                </div>

                                <div className="pt-6 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="p-4 bg-gray-50 rounded-2xl border border-gray-150 flex items-center justify-between">
                                        <div>
                                            <span className="text-xs font-black text-gray-800 block">Email Notifications</span>
                                            <span className="text-[10px] text-gray-400 font-semibold">Receive digests & critical alerts via email</span>
                                        </div>
                                        <button
                                            onClick={() => setEmailNotif(!emailNotif)}
                                            className={`px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wider transition-all ${emailNotif ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'
                                                }`}
                                        >
                                            {emailNotif ? 'ON' : 'OFF'}
                                        </button>
                                    </div>

                                    <div className="p-4 bg-gray-50 rounded-2xl border border-gray-150 flex items-center justify-between">
                                        <div>
                                            <span className="text-xs font-black text-gray-800 block">Push Notifications</span>
                                            <span className="text-[10px] text-gray-400 font-semibold">Browser push notifications</span>
                                        </div>
                                        <button
                                            onClick={() => setPushNotif(!pushNotif)}
                                            className={`px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wider transition-all ${pushNotif ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'
                                                }`}
                                        >
                                            {pushNotif ? 'ON' : 'OFF'}
                                        </button>
                                    </div>
                                </div>

                                {/* ARCHIVED & CLOSED NOTIFICATIONS SECTION */}
                                <div className="pt-8 border-t border-gray-200 space-y-6">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                        <div>
                                            <h3 className="text-base font-black text-[#1a1208] flex items-center gap-2">
                                                <span className="p-2 bg-orange-100/70 text-[#F97316] rounded-xl text-sm">
                                                    📁
                                                </span>
                                                Archived & Closed Notifications
                                            </h3>
                                            <p className="text-xs text-gray-500 font-semibold mt-1">
                                                View, manage, restore, or clear notifications that were closed or archived
                                            </p>
                                        </div>

                                        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                                            {notificationsList.some(n => !n.is_archived) && (
                                                <button
                                                    type="button"
                                                    onClick={handleArchiveAll}
                                                    className="px-3.5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5"
                                                >
                                                    📥 Archive All Active
                                                </button>
                                            )}
                                            {notificationsList.some(n => n.is_archived) && (
                                                <button
                                                    type="button"
                                                    onClick={handleClearArchived}
                                                    className="px-3.5 py-2 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5"
                                                >
                                                    🗑️ Clear Archived
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Filter Pills & Search bar */}
                                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-gray-50/70 p-3 rounded-2xl border border-gray-100">
                                        <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar pb-1 sm:pb-0">
                                            <button
                                                type="button"
                                                onClick={() => setNotifFilterTab('archived')}
                                                className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all whitespace-nowrap ${notifFilterTab === 'archived'
                                                        ? 'bg-[#F97316] text-white shadow-sm'
                                                        : 'bg-white text-gray-600 hover:bg-gray-100'
                                                    }`}
                                            >
                                                Archived / Closed ({notificationsList.filter(n => n.is_archived).length})
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setNotifFilterTab('active')}
                                                className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all whitespace-nowrap ${notifFilterTab === 'active'
                                                        ? 'bg-[#F97316] text-white shadow-sm'
                                                        : 'bg-white text-gray-600 hover:bg-gray-100'
                                                    }`}
                                            >
                                                Active Inbox ({notificationsList.filter(n => !n.is_archived).length})
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setNotifFilterTab('all')}
                                                className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all whitespace-nowrap ${notifFilterTab === 'all'
                                                        ? 'bg-[#F97316] text-white shadow-sm'
                                                        : 'bg-white text-gray-600 hover:bg-gray-100'
                                                    }`}
                                            >
                                                All History ({notificationsList.length})
                                            </button>
                                        </div>

                                        <div className="relative flex-1 sm:max-w-xs">
                                            <input
                                                type="text"
                                                placeholder="Search notifications..."
                                                value={notifSearch}
                                                onChange={(e) => setNotifSearch(e.target.value)}
                                                className="w-full pl-9 pr-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-[#F97316]"
                                            />
                                            <svg className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                            </svg>
                                        </div>
                                    </div>

                                    {/* Notifications List */}
                                    {notificationsList.filter(n => {
                                        if (notifFilterTab === 'archived' && !n.is_archived) return false;
                                        if (notifFilterTab === 'active' && n.is_archived) return false;
                                        if (notifSearch.trim()) {
                                            const query = notifSearch.toLowerCase();
                                            const titleMatch = (n.title || '').toLowerCase().includes(query);
                                            const msgMatch = (n.message || '').toLowerCase().includes(query);
                                            return titleMatch || msgMatch;
                                        }
                                        return true;
                                    }).length === 0 ? (
                                        <div className="text-center py-12 bg-gray-50/50 rounded-2xl border border-dashed border-gray-200 p-6">
                                            <div className="w-12 h-12 rounded-full bg-orange-50 text-[#F97316] mx-auto flex items-center justify-center text-xl mb-3">
                                                📭
                                            </div>
                                            <h4 className="text-sm font-black text-[#1a1208]">No notifications found</h4>
                                            <p className="text-xs text-gray-400 font-semibold mt-1">
                                                {notifFilterTab === 'archived'
                                                    ? 'Closed or archived notifications will appear here for viewing later.'
                                                    : 'No notifications match your current filter or search criteria.'}
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="space-y-3 max-h-[500px] overflow-y-auto custom-scrollbar pr-1">
                                            {notificationsList.filter(n => {
                                                if (notifFilterTab === 'archived' && !n.is_archived) return false;
                                                if (notifFilterTab === 'active' && n.is_archived) return false;
                                                if (notifSearch.trim()) {
                                                    const query = notifSearch.toLowerCase();
                                                    const titleMatch = (n.title || '').toLowerCase().includes(query);
                                                    const msgMatch = (n.message || '').toLowerCase().includes(query);
                                                    return titleMatch || msgMatch;
                                                }
                                                return true;
                                            }).map((notif) => (
                                                <div
                                                    key={notif.notification_id}
                                                    onClick={() => handleNotificationClick(notif)}
                                                    className={`p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer hover:border-orange-300 hover:shadow-sm ${notif.is_archived
                                                            ? 'bg-gray-50/80 border-gray-200/80 text-gray-600'
                                                            : notif.is_read
                                                                ? 'bg-white border-gray-200'
                                                                : 'bg-orange-50/30 border-orange-200'
                                                        }`}
                                                >
                                                    <div className="flex items-start gap-3 flex-1">
                                                        <div className={`p-2.5 rounded-xl text-lg shrink-0 ${notif.type === 'alert' ? 'bg-red-50 text-red-500' :
                                                                notif.type === 'potential_match' ? 'bg-amber-50 text-amber-600' :
                                                                    'bg-orange-50 text-[#F97316]'
                                                            }`}>
                                                            {notif.type === 'alert' ? '🚨' : notif.type === 'potential_match' ? '🔍' : '🔔'}
                                                        </div>
                                                        <div className="space-y-1 flex-1">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <h4 className="text-xs font-black text-[#1a1208]">{notif.title}</h4>
                                                                <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${notif.is_archived ? 'bg-gray-200 text-gray-700' :
                                                                        notif.is_read ? 'bg-gray-100 text-gray-500' : 'bg-orange-100 text-[#F97316]'
                                                                    }`}>
                                                                    {notif.is_archived ? 'Archived' : notif.is_read ? 'Read' : 'New'}
                                                                </span>
                                                            </div>
                                                            <p className="text-xs text-gray-600 font-medium leading-relaxed">{notif.message}</p>
                                                            <span className="text-[10px] text-gray-400 font-bold block pt-1">
                                                                {formatTimestamp(notif.created_at)}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center border-t sm:border-t-0 pt-2 sm:pt-0 border-gray-100" onClick={(e) => e.stopPropagation()}>
                                                        {notif.is_archived ? (
                                                            <button
                                                                type="button"
                                                                onClick={(e) => { e.stopPropagation(); handleUnarchiveNotification(notif.notification_id); }}
                                                                className="px-3 py-1.5 bg-white hover:bg-orange-50 border border-gray-200 hover:border-orange-200 text-[#F97316] text-xs font-bold rounded-xl transition-all flex items-center gap-1 shadow-sm"
                                                                title="Restore to Inbox"
                                                            >
                                                                📤 Restore
                                                            </button>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                onClick={(e) => { e.stopPropagation(); handleArchiveNotification(notif.notification_id); }}
                                                                className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition-all flex items-center gap-1"
                                                                title="Archive Notification"
                                                            >
                                                                📁 Archive
                                                            </button>
                                                        )}



                                                        <button
                                                            type="button"
                                                            onClick={(e) => { e.stopPropagation(); handleDeleteNotification(notif.notification_id); }}
                                                            className="p-2 hover:bg-red-50 rounded-xl text-red-500 text-xs transition-colors"
                                                            title="Delete Permanently"
                                                        >
                                                            🗑️
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* 4. PRIVACY CATEGORY */}
                        {activeTab === 'privacy' && (
                            <div className="space-y-8 animate-in fade-in duration-200">
                                <div>
                                    <h2 className="text-lg font-black text-[#1a1208] flex items-center gap-2">
                                        🔒 Privacy & Visibility Settings
                                    </h2>
                                    <p className="text-xs text-gray-500 font-semibold mt-1">Configure report visibility and who can contact you</p>
                                </div>

                                <div>
                                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Default Report Visibility</h3>
                                    <div className="grid grid-cols-2 gap-4 max-w-md">
                                        <button
                                            onClick={() => setReportVisibility('Public')}
                                            className={`p-4 rounded-2xl border text-left transition-all ${reportVisibility === 'Public'
                                                    ? 'border-[#F97316] bg-orange-50/50 text-[#F97316] font-black shadow-sm'
                                                    : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                                                }`}
                                        >
                                            <span className="text-xs block">🌐 Public</span>
                                            <span className="text-[10px] text-gray-400 font-normal">Visible to community members</span>
                                        </button>

                                        <button
                                            onClick={() => setReportVisibility('Private')}
                                            className={`p-4 rounded-2xl border text-left transition-all ${reportVisibility === 'Private'
                                                    ? 'border-[#F97316] bg-orange-50/50 text-[#F97316] font-black shadow-sm'
                                                    : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                                                }`}
                                        >
                                            <span className="text-xs block">🔒 Private</span>
                                            <span className="text-[10px] text-gray-400 font-normal">Visible to leaders & staff only</span>
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-4 pt-4 border-t border-gray-100">
                                    <label className="flex items-center justify-between p-3.5 bg-gray-50 rounded-xl border border-gray-100 cursor-pointer">
                                        <div>
                                            <span className="text-xs font-bold text-gray-800 block">Hide my identity on reports</span>
                                            <span className="text-[10px] text-gray-400 font-semibold">Post reports anonymously to other residents</span>
                                        </div>
                                        <input type="checkbox" checked={hideIdentity} onChange={(e) => setHideIdentity(e.target.checked)} className="w-4.5 h-4.5 accent-[#F97316]" />
                                    </label>

                                    <label className="flex items-center justify-between p-3.5 bg-gray-50 rounded-xl border border-gray-100 cursor-pointer">
                                        <div>
                                            <span className="text-xs font-bold text-gray-800 block">Allow other users to contact me</span>
                                            <span className="text-[10px] text-gray-400 font-semibold">Allow direct inquiries for lost pet sightings</span>
                                        </div>
                                        <input type="checkbox" checked={allowContact} onChange={(e) => setAllowContact(e.target.checked)} className="w-4.5 h-4.5 accent-[#F97316]" />
                                    </label>

                                    <label className="flex items-center justify-between p-3.5 bg-gray-50 rounded-xl border border-gray-100 cursor-pointer">
                                        <div>
                                            <span className="text-xs font-bold text-gray-800 block">Show phone number to rescuers only</span>
                                            <span className="text-[10px] text-gray-400 font-semibold">Keep phone hidden from general public</span>
                                        </div>
                                        <input type="checkbox" checked={showPhoneRescuersOnly} onChange={(e) => setShowPhoneRescuersOnly(e.target.checked)} className="w-4.5 h-4.5 accent-[#F97316]" />
                                    </label>
                                </div>
                            </div>
                        )}

                        {/* 5. LOCATION CATEGORY */}
                        {activeTab === 'location' && (
                            <div className="space-y-8 animate-in fade-in duration-200">
                                <div>
                                    <h2 className="text-lg font-black text-[#1a1208] flex items-center gap-2">
                                        📍 Location & Mapping Settings
                                    </h2>
                                    <p className="text-xs text-gray-500 font-semibold mt-1">Set default address and location permissions</p>
                                </div>

                                <div>
                                    <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest block mb-2">Default Address</label>
                                    <input
                                        type="text"
                                        value={editData.address || ''}
                                        onChange={(e) => setEditData({ ...editData, address: e.target.value })}
                                        className="w-full h-11 bg-gray-50 border border-gray-150 rounded-xl px-4 text-xs font-bold text-gray-800 focus:outline-none focus:border-[#F97316]"
                                    />
                                </div>

                                {/* Leaflet Map Pinpoint */}
                                <div>
                                    <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest block mb-2">Pinpoint Coordinates</label>
                                    <div className="w-full h-52 rounded-2xl overflow-hidden border border-gray-200 relative z-10">
                                        <MapContainer
                                            center={[
                                                editData.latitude ? parseFloat(editData.latitude) : 15.4802,
                                                editData.longitude ? parseFloat(editData.longitude) : 120.5979
                                            ]}
                                            zoom={15}
                                            className="h-full w-full"
                                        >
                                            <TileLayer
                                                attribution='&copy; OpenStreetMap'
                                                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                            />
                                            <LocationPicker
                                                position={[
                                                    editData.latitude ? parseFloat(editData.latitude) : 15.4802,
                                                    editData.longitude ? parseFloat(editData.longitude) : 120.5979
                                                ]}
                                                onLocationSelect={(latVal, lngVal) => setEditData({ ...editData, latitude: latVal, longitude: lngVal })}
                                            />
                                            <RecenterMap
                                                position={[
                                                    editData.latitude ? parseFloat(editData.latitude) : 15.4802,
                                                    editData.longitude ? parseFloat(editData.longitude) : 120.5979
                                                ]}
                                            />
                                        </MapContainer>
                                    </div>
                                </div>

                                <div className="space-y-4 pt-4 border-t border-gray-100">
                                    <div className="flex items-center justify-between p-3.5 bg-gray-50 rounded-xl border border-gray-100">
                                        <span className="text-xs font-bold text-gray-800">Allow GPS Permission</span>
                                        <button onClick={() => setAllowGPS(!allowGPS)} className={`px-3 py-1.5 rounded-full text-xs font-black uppercase ${allowGPS ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'}`}>
                                            {allowGPS ? 'ON' : 'OFF'}
                                        </button>
                                    </div>

                                    <div className="flex items-center justify-between p-3.5 bg-gray-50 rounded-xl border border-gray-100">
                                        <span className="text-xs font-bold text-gray-800">Use Current Location Automatically when Reporting</span>
                                        <button onClick={() => setAutoLocation(!autoLocation)} className={`px-3 py-1.5 rounded-full text-xs font-black uppercase ${autoLocation ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'}`}>
                                            {autoLocation ? 'ON' : 'OFF'}
                                        </button>
                                    </div>

                                    <div>
                                        <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest block mb-2">Location Accuracy</label>
                                        <select
                                            value={locationAccuracy}
                                            onChange={(e) => setLocationAccuracy(e.target.value)}
                                            className="w-full h-11 bg-gray-50 border border-gray-150 rounded-xl px-4 text-xs font-bold text-gray-800 focus:outline-none focus:border-[#F97316]"
                                        >
                                            <option value="High">High (GPS + Network)</option>
                                            <option value="Medium">Balanced Power</option>
                                            <option value="Low">Low (Approximate Area)</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 6. APPEARANCE CATEGORY */}
                        {activeTab === 'appearance' && (
                            <div className="space-y-8 animate-in fade-in duration-200">
                                <div>
                                    <h2 className="text-lg font-black text-[#1a1208] flex items-center gap-2">
                                        🎨 Appearance & Display
                                    </h2>
                                    <p className="text-xs text-gray-500 font-semibold mt-1">Customize app themes, map styles, and language</p>
                                </div>

                                <div>
                                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Theme</h3>
                                    <div className="grid grid-cols-2 gap-4 max-w-md">
                                        <button
                                            onClick={() => setGlobalTheme('light')}
                                            className={`p-4 rounded-2xl border text-left transition-all ${globalTheme === 'light'
                                                    ? 'border-[#F97316] bg-orange-50/50 dark:bg-orange-950/30 text-[#F97316] font-black shadow-sm'
                                                    : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                                                }`}
                                        >
                                            <span className="text-xs block font-bold">☀️ Light Mode</span>
                                            <span className="text-[10px] text-gray-400 font-normal">Clean bright interface</span>
                                        </button>

                                        <button
                                            onClick={() => setGlobalTheme('dark')}
                                            className={`p-4 rounded-2xl border text-left transition-all ${globalTheme === 'dark'
                                                    ? 'border-[#F97316] bg-gray-900 dark:bg-gray-800 text-white font-black shadow-sm'
                                                    : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                                                }`}
                                        >
                                            <span className="text-xs block font-bold">🌙 Dark Mode</span>
                                            <span className="text-[10px] text-gray-400 font-normal">Sleek dark interface</span>
                                        </button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-gray-100">
                                    <div>
                                        <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest block mb-2">Map Style</label>
                                        <select
                                            value={mapStyle}
                                            onChange={(e) => setMapStyle(e.target.value)}
                                            className="w-full h-11 bg-gray-50 border border-gray-150 rounded-xl px-4 text-xs font-bold text-gray-800 focus:outline-none focus:border-[#F97316]"
                                        >
                                            <option value="Default">Default OpenStreetMap</option>
                                            <option value="Satellite">Satellite View</option>
                                            <option value="Terrain">Terrain View</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest block mb-2">Language</label>
                                        <select
                                            value={language}
                                            onChange={(e) => setLanguage(e.target.value)}
                                            className="w-full h-11 bg-gray-50 border border-gray-150 rounded-xl px-4 text-xs font-bold text-gray-800 focus:outline-none focus:border-[#F97316]"
                                        >
                                            <option value="English">English</option>
                                            <option value="Filipino">Filipino (Tagalog)</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 7. HELP & SUPPORT CATEGORY */}
                        {activeTab === 'help' && (
                            <div className="space-y-8 animate-in fade-in duration-200">
                                <div>
                                    <h2 className="text-lg font-black text-[#1a1208] flex items-center gap-2">
                                        ❓ Help & Support
                                    </h2>
                                    <p className="text-xs text-gray-500 font-semibold mt-1">Frequently asked questions and direct contact support</p>
                                </div>

                                {/* FAQ Section */}
                                <div className="space-y-4">
                                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Frequently Asked Questions</h3>

                                    <details className="bg-gray-50 border border-gray-150 rounded-2xl p-4 group">
                                        <summary className="font-bold text-xs text-gray-800 cursor-pointer flex justify-between items-center">
                                            How to report a stray animal?
                                            <span className="text-gray-400 group-open:rotate-180 transition-transform">▼</span>
                                        </summary>
                                        <p className="text-xs text-gray-600 mt-3 leading-relaxed">
                                            Go to your Home feed and click "Report Stray". Fill out the animal details, photo/video, landmark, priority, and visibility. Your subdivision leader will verify it promptly.
                                        </p>
                                    </details>

                                    <details className="bg-gray-50 border border-gray-150 rounded-2xl p-4 group">
                                        <summary className="font-bold text-xs text-gray-800 cursor-pointer flex justify-between items-center">
                                            How does pet QR Code scanning work?
                                            <span className="text-gray-400 group-open:rotate-180 transition-transform">▼</span>
                                        </summary>
                                        <p className="text-xs text-gray-600 mt-3 leading-relaxed">
                                            Register your pet under "My Pets". Download and print the generated QR card for your pet's collar. If your pet is found lost, anyone scanning the tag can view contact info or notify you with their location.
                                        </p>
                                    </details>

                                    <details className="bg-gray-50 border border-gray-150 rounded-2xl p-4 group">
                                        <summary className="font-bold text-xs text-gray-800 cursor-pointer flex justify-between items-center">
                                            What is the difference between Public and Private reports?
                                            <span className="text-gray-400 group-open:rotate-180 transition-transform">▼</span>
                                        </summary>
                                        <p className="text-xs text-gray-600 mt-3 leading-relaxed">
                                            Public reports are visible to all registered residents in your community feed. Private reports are strictly routed to your Subdivision Leader and Barangay Staff for discreet rescue actions.
                                        </p>
                                    </details>
                                </div>

                                {/* Support Actions */}
                                <div className="pt-6 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-3 gap-4">
                                    <button
                                        onClick={() => alert('Barangay Emergency Hotline: (045) 982-1234')}
                                        className="p-4 bg-orange-50 border border-orange-150 rounded-2xl text-center group hover:bg-orange-100 transition-all"
                                    >
                                        <span className="text-xl block mb-1">📞</span>
                                        <span className="text-xs font-black text-[#F97316] uppercase block">Contact Barangay</span>
                                        <span className="text-[10px] text-gray-500 font-semibold">Direct hotline info</span>
                                    </button>

                                    <button
                                        onClick={() => alert('Bug report feature submitted to system administrators.')}
                                        className="p-4 bg-gray-50 border border-gray-150 rounded-2xl text-center group hover:bg-gray-100 transition-all"
                                    >
                                        <span className="text-xl block mb-1">🐛</span>
                                        <span className="text-xs font-black text-gray-800 uppercase block">Report a Bug</span>
                                        <span className="text-[10px] text-gray-500 font-semibold">Submit technical issue</span>
                                    </button>

                                    <button
                                        onClick={() => alert('Thank you! Your feedback will help improve StraySafe.')}
                                        className="p-4 bg-gray-50 border border-gray-150 rounded-2xl text-center group hover:bg-gray-100 transition-all"
                                    >
                                        <span className="text-xl block mb-1">💬</span>
                                        <span className="text-xs font-black text-gray-800 uppercase block">Send Feedback</span>
                                        <span className="text-[10px] text-gray-500 font-semibold">Share your suggestions</span>
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* 8. ABOUT CATEGORY */}
                        {activeTab === 'about' && (
                            <div className="space-y-8 animate-in fade-in duration-200">
                                <div>
                                    <h2 className="text-lg font-black text-[#1a1208] flex items-center gap-2">
                                        ℹ️ About STRAY-SAFE
                                    </h2>
                                    <p className="text-xs text-gray-500 font-semibold mt-1">System version and legal documentation</p>
                                </div>

                                <div className="text-center p-8 bg-gradient-to-b from-orange-50/50 to-white rounded-3xl border border-orange-100">
                                    <img src="/SSLOGO.png" alt="StraySafe Logo" className="h-16 w-auto mx-auto mb-3" />
                                    <h3 className="text-xl font-black text-[#1a1208] uppercase tracking-wider">STRAY-SAFE</h3>
                                    <span className="px-3 py-1 bg-orange-100 text-[#F97316] text-[10px] font-black rounded-full uppercase tracking-widest inline-block mt-2">
                                        Version 2.0.0
                                    </span>
                                    <p className="text-xs text-gray-500 max-w-md mx-auto mt-4 leading-relaxed">
                                        A smart community-driven stray management and animal welfare platform empowering residents, subdivision leaders, and barangay staff.
                                    </p>
                                </div>

                                <div className="space-y-3 pt-4 border-t border-gray-100">
                                    <button
                                        onClick={() => alert('Privacy Policy: StraySafe protects your location and personal identity in accordance with Philippine Data Privacy Act of 2012.')}
                                        className="w-full flex justify-between items-center p-4 bg-gray-50 rounded-2xl border border-gray-150 text-xs font-bold text-gray-800 hover:bg-gray-100 transition-all"
                                    >
                                        <span>🔒 Privacy Policy</span>
                                        <span className="text-gray-400">→</span>
                                    </button>

                                    <button
                                        onClick={() => alert('Terms & Conditions: Users agree to submit truthful reports regarding stray animals and pet registrations.')}
                                        className="w-full flex justify-between items-center p-4 bg-gray-50 rounded-2xl border border-gray-150 text-xs font-bold text-gray-800 hover:bg-gray-100 transition-all"
                                    >
                                        <span>📄 Terms & Conditions</span>
                                        <span className="text-gray-400">→</span>
                                    </button>

                                    <button
                                        onClick={() => alert('Open Source Licenses: React, Vite, Leaflet, FastAPI, Tailwind CSS, Lucide icons.')}
                                        className="w-full flex justify-between items-center p-4 bg-gray-50 rounded-2xl border border-gray-150 text-xs font-bold text-gray-800 hover:bg-gray-100 transition-all"
                                    >
                                        <span>📜 Open Source Licenses</span>
                                        <span className="text-gray-400">→</span>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </main>

            {/* REMOVED / HISTORY PET DETAIL MODAL */}
            {selectedHistoryPet && (
                <div 
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
                    onClick={() => setSelectedHistoryPet(null)}
                >
                    <div 
                        className="bg-white rounded-3xl max-w-lg w-full max-h-[90vh] overflow-hidden shadow-2xl border border-gray-100 flex flex-col animate-in zoom-in-95 duration-200"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Modal Header */}
                        <div className="p-6 bg-gradient-to-br from-orange-50/80 via-white to-gray-50 border-b border-gray-150 relative">
                            <button
                                type="button"
                                onClick={() => setSelectedHistoryPet(null)}
                                className="absolute right-5 top-5 w-8 h-8 rounded-full bg-white/80 hover:bg-white text-gray-400 hover:text-gray-700 flex items-center justify-center shadow-xs transition-all cursor-pointer font-bold"
                            >
                                ✕
                            </button>
                            <div className="flex items-center gap-4">
                                <div className="w-16 h-16 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center text-3xl shrink-0 shadow-inner overflow-hidden border-2 border-white">
                                    {selectedHistoryPet.photo_url ? (
                                        <img src={getPetPicture(selectedHistoryPet.photo_url)} alt={selectedHistoryPet.pet_name} className="w-full h-full object-cover" />
                                    ) : (
                                        <span>{selectedHistoryPet.pet_type === 'Cat' ? '🐱' : '🐶'}</span>
                                    )}
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-xl font-black text-gray-900">{selectedHistoryPet.pet_name}</h3>
                                        <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                                            selectedHistoryPet.status === 'Removed'
                                                ? 'bg-rose-100 text-rose-700 border border-rose-200'
                                                : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                                        }`}>
                                            {selectedHistoryPet.status || 'Archived'}
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-500 font-bold mt-1">
                                        {selectedHistoryPet.pet_type || 'Dog'} • {selectedHistoryPet.breed || 'Unknown Breed'} {selectedHistoryPet.pet_id ? `(ID #${selectedHistoryPet.pet_id})` : ''}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Modal Body */}
                        <div className="p-6 overflow-y-auto space-y-5 custom-scrollbar text-xs">
                            {/* Details Grid */}
                            <div>
                                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Pet Profile Overview</h4>
                                <div className="grid grid-cols-2 gap-2.5">
                                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                                        <span className="text-[10px] font-bold text-gray-400 block uppercase">Species</span>
                                        <span className="font-bold text-gray-800 text-xs">{selectedHistoryPet.pet_type || 'Dog'}</span>
                                    </div>
                                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                                        <span className="text-[10px] font-bold text-gray-400 block uppercase">Breed</span>
                                        <span className="font-bold text-gray-800 text-xs">{selectedHistoryPet.breed || 'Unknown'}</span>
                                    </div>
                                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                                        <span className="text-[10px] font-bold text-gray-400 block uppercase">Gender</span>
                                        <span className="font-bold text-gray-800 text-xs">{selectedHistoryPet.gender || 'Unknown'}</span>
                                    </div>
                                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                                        <span className="text-[10px] font-bold text-gray-400 block uppercase">Colors</span>
                                        <span className="font-bold text-gray-800 text-xs">
                                            {selectedHistoryPet.primary_color || 'Standard'}
                                            {selectedHistoryPet.secondary_color && selectedHistoryPet.secondary_color !== 'None' ? ` & ${selectedHistoryPet.secondary_color}` : ''}
                                            {selectedHistoryPet.tertiary_color && selectedHistoryPet.tertiary_color !== 'None' ? ` & ${selectedHistoryPet.tertiary_color}` : ''}
                                        </span>
                                    </div>
                                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                                        <span className="text-[10px] font-bold text-gray-400 block uppercase">Size Category</span>
                                        <span className="font-bold text-gray-800 text-xs">{selectedHistoryPet.size_category || 'Medium'} {selectedHistoryPet.weight ? `(${selectedHistoryPet.weight} kg)` : ''}</span>
                                    </div>
                                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                                        <span className="text-[10px] font-bold text-gray-400 block uppercase">Vaccination</span>
                                        <span className="font-bold text-gray-800 text-xs">{selectedHistoryPet.is_vaccinated ? '✅ Vaccinated' : '⚠️ Not Vaccinated'}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Audit & Removal Info */}
                            <div>
                                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Record Information</h4>
                                <div className="p-3.5 bg-orange-50/50 rounded-2xl border border-orange-100 space-y-2">
                                    {selectedHistoryPet.removed_at && (
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="text-gray-500 font-semibold">Removal Date:</span>
                                            <span className="font-bold text-rose-600">{selectedHistoryPet.removed_at}</span>
                                        </div>
                                    )}
                                    {selectedHistoryPet.created_at && (
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="text-gray-500 font-semibold">Creation Date:</span>
                                            <span className="font-bold text-gray-800">{selectedHistoryPet.created_at}</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-gray-500 font-semibold">Log Description:</span>
                                        <span className="font-bold text-gray-800">{selectedHistoryPet.description || 'Pet record'}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Historical Timeline if available */}
                            {selectedHistoryPet.timeline && selectedHistoryPet.timeline.length > 0 && (
                                <div>
                                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Activity Timeline</h4>
                                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                                        {selectedHistoryPet.timeline.map((log: any, idx: number) => (
                                            <div key={idx} className="p-2.5 bg-gray-50 rounded-xl border border-gray-150 flex items-center justify-between text-[11px]">
                                                <div className="flex items-center gap-2">
                                                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                                                        log.action === 'CREATE_PET' ? 'bg-emerald-100 text-emerald-700' :
                                                        log.action === 'DELETE_PET' ? 'bg-rose-100 text-rose-700' : 'bg-blue-100 text-blue-700'
                                                    }`}>
                                                        {log.action?.replace('_PET', '')}
                                                    </span>
                                                    <span className="font-bold text-gray-700">{log.description}</span>
                                                </div>
                                                <span className="text-gray-400 font-semibold shrink-0 ml-2">{log.timestamp}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="p-4 bg-gray-50 border-t border-gray-150 flex items-center justify-between gap-3">
                            <button
                                type="button"
                                onClick={() => setSelectedHistoryPet(null)}
                                className="px-4 py-2.5 bg-white hover:bg-gray-100 border border-gray-200 text-gray-700 font-bold rounded-xl text-xs transition-all cursor-pointer"
                            >
                                Close
                            </button>
                            {(selectedHistoryPet.status === 'Removed' || !petHistoryData.current_pets.some(cp => cp.pet_id === selectedHistoryPet.pet_id)) && (
                                <button
                                    type="button"
                                    disabled={restoringPetId === (selectedHistoryPet.pet_id || selectedHistoryPet.log_id || selectedHistoryPet.pet_name)}
                                    onClick={async () => {
                                        await handleRestorePet(selectedHistoryPet);
                                        setSelectedHistoryPet(null);
                                    }}
                                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black rounded-xl text-xs transition-all flex items-center gap-2 shadow-md shadow-emerald-600/20 cursor-pointer disabled:opacity-50"
                                >
                                    {restoringPetId === (selectedHistoryPet.pet_id || selectedHistoryPet.log_id || selectedHistoryPet.pet_name) ? (
                                        <>
                                            <svg className="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                            </svg>
                                            Restoring Pet...
                                        </>
                                    ) : (
                                        <>
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                            </svg>
                                            Restore Pet
                                        </>
                                    )}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <ResiMobileNav
                isNavbarMenuOpen={isNavbarMenuOpen}
                isSearchOpen={isMobileSearchOpen}
                onSearchClick={() => setIsMobileSearchOpen(true)}
                onAddReportClick={() => navigate('/resident-home', { state: { openAddModal: true, from: '/resident/settings' } })}
            />
        </div>
    );
};

export default ResidentSettings;
