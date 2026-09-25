import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../../utils/api';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getPetPicture } from '../../utils/avatar';
import { ArrowLeft, MapPin, Calendar, Heart, Shield, CheckCircle2, AlertCircle } from 'lucide-react';

interface JourneyPin {
    id: string;
    label: string;
    description: string;
    latitude: number | null;
    longitude: number | null;
    date: string | null;
    pin_color: string;
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
    pins: JourneyPin[];
}

// Helper to fit map bounds automatically
const AutoFitBounds: React.FC<{ coords: [number, number][] }> = ({ coords }) => {
    const map = useMap();
    useEffect(() => {
        if (coords.length > 0) {
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

    const [journey, setJourney] = useState<JourneyData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    const rawUser = localStorage.getItem('resident_user') || sessionStorage.getItem('resident_user');
    const isResidentLoggedIn = Boolean(token && rawUser);

    useEffect(() => {
        const fetchJourney = async () => {
            if (!id) return;
            setLoading(true);
            setError(null);
            try {
                const res = await api.get(`/adoptions/journey/${id}`);
                setJourney(res.data);
            } catch (err: any) {
                console.error("Failed to load journey map", err);
                setError(err.response?.data?.detail || "Unable to load journey map for this animal.");
            } finally {
                setLoading(false);
            }
        };

        fetchJourney();
    }, [id, token]);

    // Filter valid coordinate pins for map polyline
    const mapPins = (journey?.pins || []).filter(
        (p): p is JourneyPin & { latitude: number; longitude: number } =>
            typeof p.latitude === 'number' && typeof p.longitude === 'number'
    );

    const polylineCoords: [number, number][] = mapPins.map((p) => [p.latitude, p.longitude]);
    const defaultCenter: [number, number] = polylineCoords.length > 0 ? polylineCoords[0] : [14.8069, 121.0039];

    return (
        <div className="min-h-screen bg-[#FBFBF9] text-[#1E293B] font-sans">
            {/* Header */}
            <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-[#E2E8F0] px-4 sm:px-8 py-3.5 flex items-center justify-between shadow-xs">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate(-1)}
                        className="p-2 rounded-xl hover:bg-gray-100 text-gray-600 transition-colors flex items-center gap-1.5 text-xs font-bold"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        <span>Back</span>
                    </button>
                    <div className="h-4 w-px bg-gray-200" />
                    <div>
                        <h1 className="font-extrabold text-base sm:text-lg text-gray-900 flex items-center gap-2">
                            <span>Animal Custody Trail</span>
                            {journey?.is_adopted && (
                                <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-black tracking-wide">
                                    Adopted
                                </span>
                            )}
                        </h1>
                    </div>
                </div>

                <div>
                    <Link
                        to="/adopt"
                        className="text-xs px-3.5 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold transition-all shadow-xs"
                    >
                        Adoption Catalog
                    </Link>
                </div>
            </header>

            {loading ? (
                <div className="max-w-5xl mx-auto p-8 animate-pulse flex flex-col gap-6">
                    <div className="h-32 bg-gray-200 rounded-3xl" />
                    <div className="h-96 bg-gray-200 rounded-3xl" />
                </div>
            ) : error || !journey ? (
                <div className="max-w-md mx-auto my-16 p-8 bg-white rounded-3xl border border-red-200 text-center shadow-xs">
                    <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
                    <h2 className="font-bold text-gray-900 text-lg mb-1">Journey Record Unavailable</h2>
                    <p className="text-sm text-gray-500 mb-5">{error}</p>
                    <button
                        onClick={() => navigate('/adopt')}
                        className="px-4 py-2 bg-gray-900 text-white text-xs font-bold rounded-xl"
                    >
                        Browse All Pets
                    </button>
                </div>
            ) : (
                <main className="max-w-6xl mx-auto px-4 sm:px-8 py-8 space-y-8">
                    {/* Animal Summary Banner */}
                    <div className="bg-white rounded-3xl border border-gray-200/90 p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row items-center gap-6 justify-between">
                        <div className="flex items-center gap-5 w-full sm:w-auto">
                            <img
                                src={getPetPicture(journey.photos[0])}
                                alt={journey.animal_name || 'Rescue Pet'}
                                className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl object-cover border border-gray-100 shadow-xs shrink-0"
                            />
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <h2 className="text-2xl font-black text-gray-900">
                                        {journey.animal_name || `Rescue #${journey.holding_id}`}
                                    </h2>
                                    <span className="px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs font-bold">
                                        {journey.animal_type || 'Rescue'}
                                    </span>
                                </div>
                                <p className="text-sm font-semibold text-gray-500">
                                    {journey.breed || 'Mixed Breed'} • {journey.color || 'Natural'}
                                </p>
                                <p className="text-xs text-gray-400 mt-1 flex items-center gap-1.5">
                                    <Shield className="w-3.5 h-3.5 text-emerald-600" />
                                    Official Barangay Animal Registry Custody Record
                                </p>
                            </div>
                        </div>

                        {/* CTA / Status */}
                        <div className="w-full sm:w-auto flex flex-col items-end gap-2">
                            {journey.is_adopted ? (
                                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-right w-full sm:w-auto">
                                    <div className="flex items-center gap-2 text-emerald-800 font-extrabold text-sm justify-end">
                                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                        Officially Adopted
                                    </div>
                                    <p className="text-xs text-emerald-700 mt-0.5">
                                        Adopted by <span className="font-bold">{journey.adopter_name_public || 'a caring resident'}</span> {journey.adopter_date ? `on ${journey.adopter_date}` : ''}
                                    </p>
                                    {journey.adopter_area && (
                                        <p className="text-[11px] text-emerald-600 mt-0.5">
                                            Area: {journey.adopter_area}
                                        </p>
                                    )}
                                </div>
                            ) : (
                                <button
                                    onClick={() => {
                                        if (!isResidentLoggedIn) {
                                            navigate('/login', { state: { from: `/adopt/apply/${journey.holding_id}` } });
                                        } else {
                                            navigate(`/adopt/apply/${journey.holding_id}`);
                                        }
                                    }}
                                    className="w-full sm:w-auto px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-2xl font-bold text-sm shadow-xs hover:shadow-md transition-all flex items-center justify-center gap-2"
                                >
                                    <Heart className="w-4 h-4 fill-white/20" /> Apply to Adopt This Pet
                                </button>
                            )}

                            {/* Staff Extra Info Banner */}
                            {journey.adopter_name_full && (
                                <div className="w-full bg-blue-50 border border-blue-200 rounded-xl p-2.5 text-xs text-blue-900 text-left sm:text-right">
                                    <span className="font-bold">Staff Custody Info:</span> {journey.adopter_name_full} ({journey.adopter_contact || 'No phone'})
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Interactive Leaflet Map */}
                    <div className="bg-white rounded-3xl border border-gray-200/90 overflow-hidden shadow-xs">
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                            <div>
                                <h3 className="font-extrabold text-gray-900 text-base flex items-center gap-2">
                                    <MapPin className="w-4 h-4 text-orange-500" />
                                    Journey Movement Map
                                </h3>
                                <p className="text-xs text-gray-500">
                                    Chronological timeline pins tracking animal rescue, holding shelter moves, and adoption
                                </p>
                            </div>
                            <div className="flex items-center gap-3 text-xs font-semibold">
                                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Sighting</span>
                                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-500" /> Shelter</span>
                                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Adoption</span>
                            </div>
                        </div>

                        <div className="h-[420px] w-full relative z-10">
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
                                            pathOptions={{ color: '#F97316', weight: 3, dashArray: '6, 8', opacity: 0.8 }}
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
                                                <div className="p-1">
                                                    <h4 className="font-extrabold text-sm text-gray-900">{pin.label}</h4>
                                                    <p className="text-xs text-gray-600 mt-1">{pin.description}</p>
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
                                <div className="h-full w-full flex items-center justify-center bg-gray-50 text-gray-400 text-sm font-semibold">
                                    No map coordinate pins recorded for this journey.
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Chronological Milestone List */}
                    <div className="bg-white rounded-3xl border border-gray-200/90 p-6 shadow-xs">
                        <h3 className="font-extrabold text-gray-900 text-base mb-6 flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-orange-500" />
                            Official Custody Milestones
                        </h3>

                        <div className="relative pl-6 sm:pl-8 border-l-2 border-orange-200 space-y-8">
                            {journey.pins.map((pin, idx) => (
                                <div key={pin.id} className="relative group">
                                    {/* Bullet point */}
                                    <div
                                        className="absolute -left-[31px] sm:-left-[39px] top-1 w-6 h-6 rounded-full border-2 border-white flex items-center justify-center text-[11px] font-black text-white shadow-xs"
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
                                    <div className="bg-gray-50/80 hover:bg-orange-50/40 p-4 rounded-2xl border border-gray-100 transition-colors">
                                        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                                            <h4 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                                                {pin.label}
                                                {pin.pin_color === 'green' && (
                                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-extrabold">
                                                        Permanent Home
                                                    </span>
                                                )}
                                            </h4>
                                            {pin.date && (
                                                <span className="text-xs font-semibold text-gray-400">
                                                    {pin.date}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-gray-600 leading-relaxed">
                                            {pin.description}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </main>
            )}
        </div>
    );
};

export default AnimalJourneyMap;
