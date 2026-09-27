import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api, getStoredToken } from '../../utils/api';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getPetPicture } from '../../utils/avatar';
import { 
    ArrowLeft, 
    MapPin, 
    Calendar, 
    Heart, 
    Shield, 
    CheckCircle2, 
    Sparkles, 
    Compass,
    FileText,
    PawPrint
} from 'lucide-react';

import ResiNavbar from '../../components/Navbars/ResiNavbar';
import ResiMobileNav from '../../components/Navbars/ResiMobileNav';
import BrgySidebar from '../../components/BrgySidebar';
import BrgyNavbar from '../../components/Navbars/BrgyNavbar';
import BrgyBottomNav from '../../components/Navbars/BrgyBottomNav';
import AdminSidebar from '../../components/AdminSidebar';
import AdminNavbar from '../../components/Navbars/AdminNavbar';
import SubdSidebar from '../../components/SubdSidebar';
import SubdNavbar from '../../components/Navbars/SubdNavbar';
import SubdBottomNav from '../../components/Navbars/SubdBottomNav';

interface JourneyPin {
    id: string;
    label: string;
    description: string;
    latitude: number | null;
    longitude: number | null;
    date: string | null;
    pin_color: string;
}

interface UserJourneyPetSummary {
    holding_id: number;
    animal_name: string | null;
    animal_type: string | null;
    breed: string | null;
    photo: string | null;
    application_status: string | null;
    is_adopted: boolean;
    adoption_id?: number | null;
}

interface JourneyData {
    holding_id: number;
    animal_name: string | null;
    animal_type: string | null;
    breed: string | null;
    color: string | null;
    photos: string[];
    is_adopted: boolean;
    adopter_name_public: string | null;
    adopter_date: string | null;
    adopter_area: string | null;
    adopter_name_full?: string | null;
    adopter_contact?: string | null;
    adopter_address?: string | null;
    application_status?: string | null;
    pins: JourneyPin[];
    user_pets?: UserJourneyPetSummary[];
}

// Helper to fit map bounds automatically
const AutoFitBounds: React.FC<{ coords: [number, number][] }> = ({ coords }) => {
    const map = useMap();
    useEffect(() => {
        if (coords.length === 1) {
            map.setView(coords[0], 15);
        } else if (coords.length > 1) {
            const bounds = L.latLngBounds(coords);
            map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
        }
    }, [coords, map]);
    return null;
};

// Create custom colored div icon
const createPinIcon = (color: string, labelNumber: number) => {
    let bg = '#EF4444'; // red
    if (color === 'orange') bg = '#F97316';
    if (color === 'blue') bg = '#3B82F6';
    if (color === 'green') bg = '#10B981';

    return L.divIcon({
        className: 'custom-journey-pin',
        html: `
            <div style="
                background-color: ${bg};
                width: 32px;
                height: 32px;
                border-radius: 50%;
                border: 3px solid white;
                box-shadow: 0 4px 10px rgba(0,0,0,0.25);
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-weight: 800;
                font-size: 13px;
                font-family: sans-serif;
            ">
                ${labelNumber}
            </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
    });
};

const AnimalJourneyMap = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    // Navigation & layout state
    const [mobileOpen, setMobileOpen] = useState(false);
    const [isNavbarMenuOpen, setIsNavbarMenuOpen] = useState(false);
    const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);

    // Data state
    const [journey, setJourney] = useState<JourneyData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Detect user role & authentication context
    const token = getStoredToken();
    const rawResident = localStorage.getItem('resident_user') || sessionStorage.getItem('resident_user');
    const rawStaff = localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user');
    const rawAdmin = localStorage.getItem('admin_user') || sessionStorage.getItem('admin_user');

    const residentUser = rawResident ? JSON.parse(rawResident) : null;
    const staffUser = rawStaff ? JSON.parse(rawStaff) : null;
    const adminUser = rawAdmin ? JSON.parse(rawAdmin) : null;

    const isStaff = Boolean(staffUser && (staffUser.role_id === 3 || staffUser.role_id === '3'));
    const isSubd = Boolean(staffUser && (staffUser.role_id === 2 || staffUser.role_id === '2'));
    const isAdmin = Boolean(adminUser || (staffUser && (staffUser.role_id === 4 || staffUser.role_id === '4')));
    const isUserLoggedIn = Boolean(residentUser || staffUser || adminUser || token);

    // Redirect unauthenticated users only if viewing general personal journey (no ID provided)
    useEffect(() => {
        if (!id && !token && !residentUser && !staffUser && !adminUser) {
            navigate('/login', { state: { from: window.location.pathname } });
        }
    }, [id, token, residentUser, staffUser, adminUser, navigate]);

    const fetchJourney = async (targetId?: string) => {
        setLoading(true);
        setError(null);
        try {
            let res;
            if (targetId) {
                res = await api.get(`/adoptions/journey/${targetId}`);
            } else {
                res = await api.get('/adoptions/my-journey');
            }
            setJourney(res.data);
        } catch (err: any) {
            console.error("Failed to load journey map", err);
            if (err.response?.status === 401 && !targetId) {
                navigate('/login', { state: { from: window.location.pathname } });
                return;
            }
            const detail = err.response?.data?.detail;
            if (err.response?.status === 404 || !detail) {
                setError("No journey records found.");
            } else {
                setError(detail);
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchJourney(id);
    }, [id]);

    const handleSelectUserPet = (holdingId: number) => {
        navigate(`/adopt/journey/${holdingId}`);
    };

    const handleBack = () => {
        if (window.history.length > 2) {
            navigate(-1);
        } else {
            if (isStaff) {
                navigate('/brgy/adoptions');
            } else if (isAdmin) {
                navigate('/admin/adoptions');
            } else if (isSubd) {
                navigate('/subd/dashboard');
            } else if (residentUser) {
                navigate('/adopt/applications');
            } else {
                navigate('/adopt');
            }
        }
    };

    // Filter valid coordinate pins for map polyline
    const mapPins = (journey?.pins || []).filter(
        (p): p is JourneyPin & { latitude: number; longitude: number } =>
            typeof p.latitude === 'number' && typeof p.longitude === 'number'
    );

    const polylineCoords: [number, number][] = mapPins.map((p) => [p.latitude, p.longitude]);
    const defaultCenter: [number, number] = polylineCoords.length > 0 ? polylineCoords[0] : [14.8069, 121.0039];

    // Shared Journey Content Body
    const renderJourneyContent = () => {
        if (loading) {
            return (
                <div className="space-y-6">
                    <div className="h-36 bg-white dark:bg-[#151C2C] rounded-3xl border border-gray-200 dark:border-gray-800 animate-pulse" />
                    <div className="h-96 bg-white dark:bg-[#151C2C] rounded-3xl border border-gray-200 dark:border-gray-800 animate-pulse" />
                    <div className="h-64 bg-white dark:bg-[#151C2C] rounded-3xl border border-gray-200 dark:border-gray-800 animate-pulse" />
                </div>
            );
        }

        if (error || !journey) {
            return (
                <div className="bg-white dark:bg-[#151C2C] rounded-3xl p-8 sm:p-12 border border-gray-200/90 dark:border-gray-800 text-center max-w-lg mx-auto shadow-sm space-y-5">
                    <div className="w-16 h-16 rounded-2xl bg-orange-50 dark:bg-orange-950/60 text-orange-500 dark:text-orange-400 flex items-center justify-center mx-auto border border-orange-200/80 dark:border-orange-800/60 shadow-xs">
                        <Compass className="w-8 h-8" />
                    </div>
                    <div>
                        <h2 className="font-extrabold text-gray-900 dark:text-white text-xl mb-2">
                            No journey records found.
                        </h2>
                        <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 leading-relaxed max-w-md mx-auto">
                            {error && error !== "No journey records found."
                                ? error
                                : "You haven't submitted any adoption applications or adopted a rescue pet yet. Visit our Adoption Catalog to meet adoptable pets and start your journey!"}
                        </p>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                        <Link
                            to="/adopt"
                            className="w-full sm:w-auto px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-black rounded-xl transition-all shadow-xs cursor-pointer flex items-center justify-center gap-2"
                        >
                            <Heart className="w-4 h-4 fill-white/20" />
                            Browse Adoption Catalog
                        </Link>
                        <Link
                            to="/adopt/applications"
                            className="w-full sm:w-auto px-4 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
                        >
                            <FileText className="w-3.5 h-3.5" />
                            My Applications
                        </Link>
                    </div>
                </div>
            );
        }

        return (
            <div className="space-y-6">
                {/* ─── TOP BAR: Back Button & Header Summary ─── */}
                <div className="flex items-center justify-between gap-4 flex-wrap pb-2">
                    <button
                        onClick={handleBack}
                        className="flex items-center gap-2 group text-gray-500 dark:text-gray-400 hover:text-[#F97316] dark:hover:text-[#F97316] transition-colors cursor-pointer"
                        title="Go Back"
                    >
                        <div className="w-10 h-10 rounded-xl bg-white dark:bg-[#151C2C] border border-gray-200 dark:border-gray-800 flex items-center justify-center text-gray-400 group-hover:text-[#F97316] group-hover:border-orange-200 dark:group-hover:border-orange-500/30 transition-all shadow-sm">
                            <ArrowLeft className="w-5 h-5 transition-transform group-hover:-translate-x-1" />
                        </div>
                        <span className="text-[11px] font-black uppercase tracking-widest text-[#1a1208] dark:text-white group-hover:text-[#F97316] dark:group-hover:text-[#F97316] transition-colors">
                            Back
                        </span>
                    </button>

                    <div className="flex items-center gap-2">
                        {journey.is_adopted ? (
                            <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-xs font-black border border-emerald-300 dark:border-emerald-800 shadow-2xs">
                                <Sparkles className="w-3.5 h-3.5 text-emerald-600" /> Officially Adopted
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-orange-50 dark:bg-orange-950/50 text-orange-700 dark:text-orange-300 text-xs font-black border border-orange-200 dark:border-orange-800/60 shadow-2xs">
                                <Shield className="w-3.5 h-3.5 text-orange-600" /> In Barangay Care & Observation
                            </span>
                        )}

                        {!isStaff && !isAdmin && !isSubd && (
                            <Link
                                to="/adopt"
                                className="px-3.5 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs font-bold transition-all shadow-2xs"
                            >
                                Adoption Catalog
                            </Link>
                        )}
                    </div>
                </div>

                {/* ─── USER PET SWITCHER (If resident has multiple adoptions) ─── */}
                {journey.user_pets && journey.user_pets.length > 1 && (
                    <div className="bg-white dark:bg-[#151C2C] rounded-2xl border border-gray-200/90 dark:border-gray-800 p-3 sm:p-4 shadow-2xs">
                        <div className="flex items-center justify-between gap-2 mb-2.5">
                            <span className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                                <PawPrint className="w-3.5 h-3.5 text-orange-500" />
                                Your Adoption Journey Records ({journey.user_pets.length})
                            </span>
                            <span className="text-[11px] text-gray-400 hidden sm:inline">Click a pet to switch journey trail</span>
                        </div>
                        <div className="flex items-center gap-2 overflow-x-auto pb-1">
                            {journey.user_pets.map((p) => {
                                const isCurrent = p.holding_id === journey.holding_id;
                                return (
                                    <button
                                        key={p.holding_id}
                                        type="button"
                                        onClick={() => handleSelectUserPet(p.holding_id)}
                                        className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-all shrink-0 cursor-pointer border ${
                                            isCurrent
                                                ? 'bg-orange-50 dark:bg-orange-950/50 border-orange-300 dark:border-orange-700 ring-2 ring-orange-500/20 shadow-xs'
                                                : 'bg-gray-50/80 dark:bg-gray-900 border-gray-200/80 dark:border-gray-800 hover:border-gray-300 text-gray-700 dark:text-gray-300'
                                        }`}
                                    >
                                        <img
                                            src={getPetPicture(p.photo)}
                                            alt={p.animal_name || 'Pet'}
                                            className="w-8 h-8 rounded-lg object-cover border border-gray-200 dark:border-gray-700"
                                        />
                                        <div className="min-w-0 pr-1">
                                            <p className="text-xs font-bold truncate text-gray-900 dark:text-white leading-tight">
                                                {p.animal_name || `Rescue #${p.holding_id}`}
                                            </p>
                                            <div className="flex items-center gap-1 mt-0.5">
                                                <span className={`text-[10px] font-extrabold px-1.5 py-0.2 rounded-full ${
                                                    p.is_adopted
                                                        ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300'
                                                        : p.application_status === 'Pending'
                                                        ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300'
                                                        : 'bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                                                }`}>
                                                    {p.is_adopted ? 'Adopted' : (p.application_status || 'Applied')}
                                                </span>
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* ─── ANIMAL SUMMARY BANNER ─── */}
                <div className="bg-white dark:bg-[#151C2C] rounded-3xl border border-gray-200/90 dark:border-gray-800 p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row items-center gap-5 justify-between">
                    <div className="flex items-center gap-4 w-full sm:w-auto">
                        <img
                            src={getPetPicture(journey.photos?.[0])}
                            alt={journey.animal_name || 'Rescue Pet'}
                            className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover border border-gray-100 dark:border-gray-800 shadow-xs shrink-0"
                        />
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <h2 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white truncate">
                                    {journey.animal_name || `Rescue #${journey.holding_id}`}
                                </h2>
                                <span className="px-2.5 py-0.5 rounded-full bg-orange-50 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 text-xs font-bold border border-orange-200/80 dark:border-orange-800/60">
                                    {journey.animal_type || 'Rescue'}
                                </span>
                            </div>
                            <p className="text-xs sm:text-sm font-semibold text-gray-500 dark:text-gray-400">
                                {journey.breed || 'Mixed Breed'} • {journey.color || 'Natural'}
                            </p>
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 flex items-center gap-1.5">
                                <Shield className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                Official Barangay Animal Registry Custody Record
                            </p>
                        </div>
                    </div>

                    {/* Action / Adoption Status on Right */}
                    <div className="w-full sm:w-auto flex flex-col sm:items-end gap-2 shrink-0">
                        {journey.is_adopted ? (
                            <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 rounded-2xl p-3.5 text-left sm:text-right w-full sm:w-auto">
                                <div className="flex items-center gap-1.5 text-emerald-800 dark:text-emerald-200 font-extrabold text-xs sm:justify-end">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                                    Officially Adopted
                                </div>
                                <p className="text-xs text-emerald-700 dark:text-emerald-300/90 mt-0.5">
                                    Adopted by <span className="font-bold">{journey.adopter_name_public || 'a registered resident'}</span> {journey.adopter_date ? `on ${journey.adopter_date}` : ''}
                                </p>
                                {journey.adopter_area && (
                                    <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5">
                                        Area: {journey.adopter_area}
                                    </p>
                                )}
                            </div>
                        ) : (
                            (!isStaff && !isAdmin) && (
                                <button
                                    onClick={() => {
                                        if (!isUserLoggedIn) {
                                            navigate('/login', { state: { from: `/adopt/apply/${journey.holding_id}` } });
                                        } else {
                                            navigate(`/adopt/apply/${journey.holding_id}`);
                                        }
                                    }}
                                    className="w-full sm:w-auto px-5 py-3 bg-gradient-to-r from-[#F97316] to-[#EA580C] hover:from-[#EA580C] hover:to-[#C2410C] text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg shadow-orange-500/20 hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
                                >
                                    <Heart className="w-4 h-4 fill-white" />
                                    <span>Apply to Adopt This Pet</span>
                                </button>
                            )
                        )}

                        {/* Staff-exclusive confidential custody box */}
                        {(isStaff || isAdmin) && journey.adopter_name_full && (
                            <div className="w-full bg-blue-50 border border-blue-200 rounded-xl p-2.5 text-xs text-blue-900 text-left sm:text-right">
                                <span className="font-bold">Staff Custody Info:</span> {journey.adopter_name_full} ({journey.adopter_contact || 'No phone'})
                            </div>
                        )}
                    </div>
                </div>

                {/* ─── INTERACTIVE LEAFLET MAP ─── */}
                <div className="bg-white dark:bg-[#151C2C] rounded-3xl border border-gray-200/90 dark:border-gray-800 overflow-hidden shadow-xs">
                    <div className="px-5 sm:px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                            <h3 className="font-extrabold text-gray-900 dark:text-white text-base flex items-center gap-2">
                                <MapPin className="w-4 h-4 text-orange-500" />
                                Journey Movement & Location Map
                            </h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                Chronological movement pins tracking rescue sighting, facility holding, and adoption
                            </p>
                        </div>
                        <div className="flex items-center gap-3 text-xs font-semibold text-gray-600 dark:text-gray-300 flex-wrap">
                            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500" /> 1. Sighting</span>
                            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-500" /> 2. Holding</span>
                            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> 3. Adoption</span>
                        </div>
                    </div>

                    <div className="h-[380px] sm:h-[450px] w-full relative z-10">
                        {polylineCoords.length > 0 ? (
                            <MapContainer
                                center={defaultCenter}
                                zoom={14}
                                scrollWheelZoom={false}
                                className="h-full w-full"
                            >
                                <TileLayer
                                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                />
                                <AutoFitBounds coords={polylineCoords} />

                                {/* Polyline connecting route */}
                                {polylineCoords.length > 1 && (
                                    <Polyline
                                        positions={polylineCoords}
                                        pathOptions={{ color: '#F97316', weight: 3, dashArray: '6, 8', opacity: 0.85 }}
                                    />
                                )}

                                {/* Map Pins */}
                                {mapPins.map((pin, idx) => (
                                    <Marker
                                        key={pin.id}
                                        position={[pin.latitude, pin.longitude]}
                                        icon={createPinIcon(pin.pin_color, idx + 1)}
                                    >
                                        <Popup>
                                            <div className="p-1 max-w-[220px]">
                                                <h4 className="font-extrabold text-sm text-gray-900">{pin.label}</h4>
                                                <p className="text-xs text-gray-600 mt-1 leading-snug">{pin.description}</p>
                                                {pin.date && (
                                                    <span className="text-[11px] text-gray-400 font-semibold block mt-1">
                                                        {pin.date}
                                                    </span>
                                                )}
                                            </div>
                                        </Popup>
                                    </Marker>
                                ))}
                            </MapContainer>
                        ) : (
                            <div className="h-full w-full flex items-center justify-center bg-gray-50 dark:bg-[#0E131F] text-gray-400 text-xs font-semibold">
                                No map coordinate pins recorded for this journey.
                            </div>
                        )}
                    </div>
                </div>

                {/* ─── CHRONOLOGICAL MILESTONE LIST ─── */}
                <div className="bg-white dark:bg-[#151C2C] rounded-3xl border border-gray-200/90 dark:border-gray-800 p-5 sm:p-6 shadow-xs space-y-6">
                    <div>
                        <h3 className="font-extrabold text-gray-900 dark:text-white text-base flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-orange-500" />
                            Official Custody Milestones & Timeline
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            Verifiable chronological trail from initial reporting to current placement
                        </p>
                    </div>

                    <div className="relative pl-6 sm:pl-8 border-l-2 border-orange-200 dark:border-orange-900/60 space-y-6">
                        {(journey.pins || []).map((pin, idx) => (
                            <div key={pin.id} className="relative group">
                                {/* Numbered Bullet Point */}
                                <div
                                    className="absolute -left-[31px] sm:-left-[39px] top-1 w-6 h-6 rounded-full border-2 border-white dark:border-[#151C2C] flex items-center justify-center text-[11px] font-black text-white shadow-xs"
                                    style={{
                                        backgroundColor:
                                            pin.pin_color === 'red'
                                                ? '#EF4444'
                                                : pin.pin_color === 'orange'
                                                ? '#F97316'
                                                : pin.pin_color === 'blue'
                                                ? '#3B82F6'
                                                : '#10B981',
                                    }}
                                >
                                    {idx + 1}
                                </div>

                                {/* Event Body */}
                                <div className="bg-gray-50/90 dark:bg-[#0E131F] hover:bg-orange-50/40 dark:hover:bg-orange-950/20 p-4 rounded-2xl border border-gray-100 dark:border-gray-800 transition-colors space-y-1">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <h4 className="font-extrabold text-gray-900 dark:text-white text-sm flex items-center gap-2">
                                            {pin.label}
                                            {pin.pin_color === 'green' && (
                                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-extrabold border border-emerald-300 dark:border-emerald-800">
                                                    Permanent Home
                                                </span>
                                            )}
                                        </h4>
                                        {pin.date && (
                                            <span className="text-xs font-semibold text-gray-400 dark:text-gray-400">
                                                {pin.date}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
                                        {pin.description}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    };

    // ─── CASE 1: BARANGAY STAFF SHELL (Role 3) ───
    if (isStaff) {
        return (
            <div className="flex h-screen bg-[#FBFBF9] text-[#1E293B] font-sans overflow-hidden">
                <BrgySidebar isMobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />
                <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
                    <BrgyNavbar
                        onMenuToggle={() => setMobileOpen(!mobileOpen)}
                        leftContent={
                            <div className="flex flex-col">
                                <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none uppercase">
                                    Animal Journey Trail
                                </h1>
                                <p className="text-[9px] text-gray-400 font-extrabold uppercase tracking-wider mt-1.5 leading-none">
                                    Custody & timeline mapping for rescue animal #{journey?.holding_id || id || ''}
                                </p>
                            </div>
                        }
                    />
                    <main className="p-4 sm:p-8 pb-32 lg:pb-8 max-w-7xl w-full mx-auto">
                        {renderJourneyContent()}
                    </main>
                    <BrgyBottomNav />
                </div>
            </div>
        );
    }

    // ─── CASE 2: SYSTEM ADMIN SHELL (Role 4) ───
    if (isAdmin) {
        return (
            <div className="flex h-screen bg-[#FBFBF9] text-[#1E293B] font-sans overflow-hidden">
                <AdminSidebar />
                <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
                    <AdminNavbar
                        leftContent={
                            <div className="flex flex-col">
                                <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none uppercase">
                                    Animal Journey Trail
                                </h1>
                                <p className="text-[9px] text-gray-400 font-extrabold uppercase tracking-wider mt-1.5 leading-none">
                                    Custody & timeline mapping for rescue animal #{journey?.holding_id || id || ''}
                                </p>
                            </div>
                        }
                    />
                    <main className="p-4 sm:p-8 pb-32 lg:pb-8 max-w-7xl w-full mx-auto">
                        {renderJourneyContent()}
                    </main>
                </div>
            </div>
        );
    }

    // ─── CASE 3: SUBDIVISION LEADER SHELL (Role 2) ───
    if (isSubd) {
        return (
            <div className="flex h-screen bg-[#FBFBF9] text-[#1E293B] font-sans overflow-hidden">
                <SubdSidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
                <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
                    <SubdNavbar
                        onMenuToggle={() => setMobileOpen(!mobileOpen)}
                        leftContent={
                            <div className="flex flex-col">
                                <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none uppercase">
                                    Animal Journey Trail
                                </h1>
                                <p className="text-[9px] text-gray-400 font-extrabold uppercase tracking-wider mt-1.5 leading-none">
                                    Custody & timeline mapping for rescue animal #{journey?.holding_id || id || ''}
                                </p>
                            </div>
                        }
                    />
                    <main className="p-4 sm:p-8 pb-32 lg:pb-8 max-w-7xl w-full mx-auto">
                        {renderJourneyContent()}
                    </main>
                    <SubdBottomNav />
                </div>
            </div>
        );
    }

    // ─── CASE 4: RESIDENT / CITIZEN ACCOUNT PORTAL SHELL (Default) ───
    return (
        <div className="min-h-screen bg-[#FBFBF9] dark:bg-[#0B0F19] text-[#1E293B] dark:text-[#F8FAFC] font-sans pb-24">
            <ResiNavbar
                onMenuToggle={(isOpen) => setIsNavbarMenuOpen(isOpen)}
                isMobileSearchOpen={isMobileSearchOpen}
                onCloseSearch={() => setIsMobileSearchOpen(false)}
            />

            <main className="max-w-6xl mx-auto px-4 sm:px-8 pt-24 sm:pt-32">
                {renderJourneyContent()}
            </main>

            <ResiMobileNav isNavbarMenuOpen={isNavbarMenuOpen} />
        </div>
    );
};

export default AnimalJourneyMap;
