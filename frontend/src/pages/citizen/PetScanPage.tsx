import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import { DEFAULT_PET_AVATAR, getPetPicture } from '../../utils/avatar';
import MapComponent from '../../components/MapComponent';

interface PublicPetDetails {
    pet_id: number;
    pet_name: string;
    pet_type: string;
    breed: string;
    color_markings: string;
    temperament: string;
    photo_url: string;
    emergency_contact_name: string;
    emergency_contact_phone: string;
    notes: string;
}

const PetScanPage = () => {
    const { token } = useParams<{ token: string }>();
    const navigate = useNavigate();
    
    const [pet, setPet] = useState<PublicPetDetails | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    // Scan Flow State
    const [isGuest, setIsGuest] = useState(false);
    const [isLocating, setIsLocating] = useState(false);
    const [isGeocoding, setIsGeocoding] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // Form State
    const [finderName, setFinderName] = useState('');
    const [finderContact, setFinderContact] = useState('');
    const [lat, setLat] = useState<number | null>(null);
    const [lng, setLng] = useState<number | null>(null);
    const [streetAddress, setStreetAddress] = useState('');
    const [barangay, setBarangay] = useState('');
    const [city, setCity] = useState('');
    const [landmark, setLandmark] = useState('');
    const [locationType, setLocationType] = useState('Found Location');
    const [notes, setNotes] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearchingAddress, setIsSearchingAddress] = useState(false);
    // Map expanded to fill the screen (CSS overlay: works on iPhone too, where element fullscreen is not allowed)
    const [isMapExpanded, setIsMapExpanded] = useState(false);
    useEffect(() => {
        if (!isMapExpanded) return;
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsMapExpanded(false); };
        window.addEventListener('keydown', onKey);
        return () => {
            document.body.style.overflow = prevOverflow;
            window.removeEventListener('keydown', onKey);
        };
    }, [isMapExpanded]);

    const residentUser = JSON.parse(
        localStorage.getItem('resident_user') || 
        sessionStorage.getItem('resident_user') || 
        'null'
    );

    useEffect(() => {
        fetchPublicPetDetails();
    }, [token]);

    useEffect(() => {
        if (residentUser) {
            // Pre-fill logged-in user details
            setFinderName(residentUser.name || '');
            setFinderContact(residentUser.phone || '');
            setIsGuest(true); // Direct access to form for logged-in users
        }
    }, [residentUser?.user_id]);

    const fetchPublicPetDetails = async () => {
        try {
            setLoading(true);
            const response = await api.get(`/pet/scan/${token}`);
            setPet(response.data);
        } catch (err: any) {
            console.error(err);
            setError(err.response?.data?.detail || "This QR Code tag could not be validated or is inactive.");
        } finally {
            setLoading(false);
        }
    };

    const handleLoginRedirect = () => {
        // Save scan token to return back after successful login
        localStorage.setItem('pending_scan_token', token || '');
        navigate('/login');
    };

    const reverseGeocode = async (latitude: number, longitude: number) => {
        try {
            setIsGeocoding(true);
            const response = await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
            );
            if (response.ok) {
                const data = await response.json();
                const addr = data.address || {};
                
                setStreetAddress(addr.road || addr.suburb || addr.neighbourhood || '');
                setBarangay(addr.quarter || addr.suburb || addr.village || '');
                setCity(addr.city || addr.municipality || addr.town || 'Santa Maria, Bulacan');
            }
        } catch (err) {
            console.error("Reverse geocoding failed:", err);
        } finally {
            setIsGeocoding(false);
        }
    };

    const handleDetectLocation = () => {
        if (!("geolocation" in navigator)) {
            alert("Geolocation is not supported by your browser.");
            return;
        }

        setIsLocating(true);
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const latitude = position.coords.latitude;
                const longitude = position.coords.longitude;
                setLat(latitude);
                setLng(longitude);
                setIsLocating(false);
                await reverseGeocode(latitude, longitude);
            },
            (error) => {
                console.error("Geolocation fetch failed:", error);
                setIsLocating(false);
                alert("Failed to acquire GPS coordinates. Please type the address manually.");
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    };

    const handleMapLocationChange = async (newLat: number, newLng: number) => {
        setLat(newLat);
        setLng(newLng);
        await reverseGeocode(newLat, newLng);
    };

    const handleSearchAddress = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!searchQuery.trim()) return;

        try {
            setIsSearchingAddress(true);
            const response = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(searchQuery)}`
            );
            if (response.ok) {
                const results = await response.json();
                if (results && results.length > 0) {
                    const firstResult = results[0];
                    const latitude = parseFloat(firstResult.lat);
                    const longitude = parseFloat(firstResult.lon);
                    
                    setLat(latitude);
                    setLng(longitude);
                    
                    const addr = firstResult.address || {};
                    setStreetAddress(addr.road || addr.suburb || addr.neighbourhood || '');
                    setBarangay(addr.quarter || addr.suburb || addr.village || '');
                    setCity(addr.city || addr.municipality || addr.town || 'Santa Maria, Bulacan');
                } else {
                    alert("No location found. Please try a more specific search term.");
                }
            }
        } catch (err) {
            console.error("Address search failed:", err);
            alert("Error searching location. Please try again.");
        } finally {
            setIsSearchingAddress(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!pet) return;

        if (!finderName.trim() || !finderContact.trim()) {
            alert("Please provide your name and contact details.");
            return;
        }

        try {
            setIsSubmitting(true);
            const scanPayload = {
                scanned_by: residentUser ? residentUser.user_id : null,
                finder_name: finderName,
                finder_contact: finderContact,
                scan_lat: lat,
                scan_lng: lng,
                street_address: streetAddress,
                barangay: barangay,
                city: city,
                landmark: landmark,
                location_type: locationType,
                notes: notes
            };

            await api.post(`/pet/scan/${token}/submit`, scanPayload);
            
            // Redirect to success confirmation page
            navigate(`/pet/scan/${token}/success`);
        } catch (err) {
            console.error(err);
            alert("Failed to submit scan details. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[#FAFAF9] flex items-center justify-center">
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-[#F97316]/20 border-t-[#F97316] rounded-full animate-spin mb-4 mx-auto"></div>
                    <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest animate-pulse">Syncing Recovery Network</span>
                </div>
            </div>
        );
    }

    if (error || !pet) {
        return (
            <div className="min-h-screen bg-[#FAFAF9] flex items-center justify-center p-6">
                <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-xl p-8 max-w-md w-full text-center">
                    <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <h3 className="text-xl font-black text-[#1a1208] uppercase">Scan Error</h3>
                    <p className="text-xs font-semibold text-gray-400 mt-2 leading-relaxed">{error || "This pet tag information is unavailable."}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-white sm:bg-[#FAFAF9] font-sans flex items-start sm:items-center justify-center p-0 sm:p-4 sm:pb-24">
            <div className="w-full max-w-2xl bg-white min-h-screen sm:min-h-0 rounded-none sm:rounded-[3rem] border-0 sm:border border-gray-100 shadow-none sm:shadow-2xl overflow-hidden">
                {/* Visual Header */}
                <div className="relative h-72 sm:h-64 bg-gray-50 overflow-hidden">
                    <img 
                        src={getPetPicture(pet.photo_url)} 
                        alt={pet.pet_name} 
                        className="w-full h-full object-cover" 
                        onError={(e) => { e.currentTarget.src = DEFAULT_PET_AVATAR; }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
                    <div className="absolute bottom-5 left-5 right-5 sm:bottom-6 sm:left-8 sm:right-8 text-white">
                        <span className="text-[10px] font-black uppercase text-[#F97316] tracking-[0.2em] bg-orange-50 px-2 py-0.5 rounded-md mb-2 inline-block">STRAY-SAFE pet found</span>
                        <h2 className="text-3xl sm:text-4xl font-black uppercase tracking-tight break-words leading-tight">{pet.pet_name}</h2>
                        <p className="text-xs font-bold text-gray-300 uppercase tracking-widest">{pet.breed || pet.pet_type} • {pet.temperament} Temperament</p>
                    </div>
                </div>

                {/* Body Content */}
                <div className="px-5 pt-6 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:p-10 space-y-6 sm:space-y-8">
                    
                    {/* Owner instructions / emergency details */}
                    <div className="bg-orange-50/50 border border-orange-100 rounded-2xl p-4 sm:p-6 space-y-3">
                        <div className="flex items-center gap-2 text-[#F97316]">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                            </svg>
                            <span className="text-[10px] font-black uppercase tracking-widest">Owner Recovery Instructions</span>
                        </div>
                        <p className="text-sm sm:text-xs font-semibold text-stone-700 leading-relaxed">
                            {pet.notes || "Please keep my pet safe and fill out the contact form below. I will receive your scan location immediately and contact you."}
                        </p>
                        {pet.emergency_contact_phone && (
                            <div className="border-t border-orange-100 pt-3 space-y-2.5">
                                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs font-bold text-stone-500 uppercase tracking-wider">
                                    <span>Emergency Contact{pet.emergency_contact_name ? `: ${pet.emergency_contact_name}` : ''}</span>
                                    <span className="text-[#F97316] tracking-normal">{pet.emergency_contact_phone}</span>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <a href={`tel:${String(pet.emergency_contact_phone).replace(/[^\d+]/g, '')}`}
                                       className="py-3 bg-[#F97316] hover:bg-orange-600 text-white rounded-xl text-[11px] font-black uppercase tracking-widest text-center">
                                        📞 Call
                                    </a>
                                    <a href={`sms:${String(pet.emergency_contact_phone).replace(/[^\d+]/g, '')}?body=${encodeURIComponent(`Hi! I found your pet ${pet.pet_name} by scanning its StraySafe tag.`)}`}
                                       className="py-3 bg-white hover:bg-orange-50 text-[#F97316] border border-orange-200 rounded-xl text-[11px] font-black uppercase tracking-widest text-center">
                                        💬 Text
                                    </a>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Authentication Check / Mode Selection */}
                    {!isGuest && (
                        <div className="bg-gray-50 border border-gray-100 rounded-3xl p-5 sm:p-8 text-center space-y-5 sm:space-y-6">
                            <div>
                                <h3 className="text-lg font-black text-[#1a1208] uppercase tracking-tight">Help return {pet.pet_name}</h3>
                                <p className="text-xs font-semibold text-gray-400 mt-1 uppercase tracking-wider">Choose how you want to report this scan</p>
                            </div>
                            
                            <div className="flex flex-col sm:flex-row gap-4">
                                <button
                                    onClick={handleLoginRedirect}
                                    className="flex-1 py-4 bg-[#F97316] hover:bg-orange-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all hover:scale-[1.02] shadow-lg shadow-orange-500/20 cursor-pointer"
                                >
                                    Login to STRAY-SAFE
                                </button>
                                <button
                                    onClick={() => setIsGuest(true)}
                                    className="flex-1 py-4 bg-white hover:bg-orange-50 text-gray-700 hover:text-[#F97316] rounded-2xl text-xs font-black uppercase tracking-widest border border-gray-200 hover:border-orange-200 transition-all hover:scale-[1.02] cursor-pointer"
                                >
                                    Continue as Guest
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Geolocation & Finder Form */}
                    {isGuest && (
                        <form onSubmit={handleSubmit} className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <h3 className="text-lg font-black text-[#1a1208] uppercase tracking-tight border-b border-gray-50 pb-2">Finder & Location Form</h3>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Your Name *</label>
                                    <input 
                                        type="text" 
                                        required
                                        placeholder="e.g. John Doe"
                                        value={finderName}
                                        onChange={(e) => setFinderName(e.target.value)}
                                        className="w-full h-14 bg-gray-50 border border-gray-100 rounded-2xl px-4 sm:px-6 text-base sm:text-sm font-bold focus:outline-none focus:bg-white focus:border-[#F97316] transition-all"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Your Phone / Contact *</label>
                                    <input 
                                        type="text" 
                                        required
                                        placeholder="e.g. 09123456789"
                                        value={finderContact}
                                        onChange={(e) => setFinderContact(e.target.value)}
                                        className="w-full h-14 bg-gray-50 border border-gray-100 rounded-2xl px-4 sm:px-6 text-base sm:text-sm font-bold focus:outline-none focus:bg-white focus:border-[#F97316] transition-all"
                                    />
                                </div>
                            </div>

                            {/* Location capturing block */}
                            <div className="sm:bg-gray-50/50 sm:border border-gray-100 rounded-3xl p-0 sm:p-6 space-y-4">
                                <div className="space-y-4">
                                    <div>
                                        <h4 className="text-xs font-black text-[#1a1208] uppercase tracking-widest">Capture Location Details</h4>
                                        <p className="text-[10px] text-gray-400 font-bold uppercase mt-0.5">Share your GPS or search your location manually</p>
                                    </div>
                                    
                                    <div className="flex flex-col sm:flex-row gap-4 items-stretch">
                                        {/* GPS Button */}
                                        <button
                                            type="button"
                                            onClick={handleDetectLocation}
                                            disabled={isLocating}
                                            className="py-3 px-5 bg-orange-50 hover:bg-orange-100 text-[#F97316] border border-orange-100 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-2 sm:w-48 shrink-0 disabled:opacity-50"
                                        >
                                            {isLocating ? (
                                                <>
                                                    <div className="w-3.5 h-3.5 border-2 border-orange-600/20 border-t-orange-600 rounded-full animate-spin"></div>
                                                    Locating...
                                                </>
                                            ) : (
                                                <>
                                                    📍 Share GPS
                                                </>
                                            )}
                                        </button>

                                        {/* Manual Search Input */}
                                        <div className="flex-1 flex gap-2 min-w-0">
                                            <input 
                                                type="text"
                                                placeholder="Or type/search a location manually..."
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        handleSearchAddress();
                                                    }
                                                }}
                                                className="flex-grow min-w-0 h-12 bg-white border border-gray-200 rounded-2xl px-4 text-base sm:text-xs font-bold focus:outline-none focus:border-[#F97316] transition-all"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => handleSearchAddress()}
                                                disabled={isSearchingAddress}
                                                className="shrink-0 px-4 sm:px-5 bg-[#F97316] hover:bg-orange-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer disabled:opacity-50 shadow-md shadow-orange-500/20"
                                            >
                                                {isSearchingAddress ? "Searching..." : "Search"}
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {lat && lng && (
                                    <div className="space-y-4">
                                        <div className="bg-green-50/50 border border-green-100 rounded-2xl p-4 text-xs font-bold text-green-700 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 animate-in zoom-in-95 break-all">
                                            <span>GPS Coordinates Synced: {lat.toFixed(6)}, {lng.toFixed(6)}</span>
                                            {isGeocoding && <span className="text-[9px] font-black animate-pulse">Reverse Geocoding...</span>}
                                        </div>
                                        {/* Interactive Map */}
                                        <div
                                            className={isMapExpanded
                                                ? 'fixed top-0 left-0 w-screen h-screen h-[100dvh] z-[2000] bg-white'
                                                : 'h-56 sm:h-64 rounded-3xl overflow-hidden border border-gray-100 shadow-inner z-0 relative'}
                                            data-testid="scan-map"
                                        >
                                            <MapComponent
                                                center={[lat, lng] as [number, number]}
                                                zoom={16}
                                                onLocationChange={handleMapLocationChange}
                                                showGeofence={false}
                                                showHeatmap={false}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setIsMapExpanded((v) => !v)}
                                                aria-label={isMapExpanded ? 'Exit full screen map' : 'Expand map to full screen'}
                                                className={`absolute z-[1001] flex items-center gap-1.5 bg-white/95 hover:bg-white text-gray-800 border border-gray-200 shadow-md rounded-xl font-black uppercase tracking-widest cursor-pointer ${
                                                    isMapExpanded
                                                        ? 'top-[calc(1rem+env(safe-area-inset-top))] right-4 px-4 py-3 text-[11px]'
                                                        : 'top-3 right-3 px-3 py-2 text-[10px]'
                                                }`}
                                            >
                                                {isMapExpanded ? (
                                                    <>
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                                        Done
                                                    </>
                                                ) : (
                                                    <>
                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4" /></svg>
                                                        Expand
                                                    </>
                                                )}
                                            </button>
                                            {isMapExpanded && (
                                                <div className="absolute z-[1001] left-4 right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] bg-white/95 border border-gray-200 shadow-md rounded-2xl px-4 py-3 text-[11px] font-bold text-gray-700 text-center">
                                                    📍 Drag the marker to the exact spot where the pet is, then tap <strong>Done</strong>.
                                                </div>
                                            )}
                                        </div>
                                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider text-center">
                                            📍 Tip: You can drag the map marker if you need to adjust the exact spot!
                                        </p>
                                    </div>
                                )}

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Street Address</label>
                                        <input 
                                            type="text" 
                                            placeholder="e.g. McArthur Highway"
                                            value={streetAddress}
                                            onChange={(e) => setStreetAddress(e.target.value)}
                                            className="w-full h-12 bg-white border border-gray-200 rounded-xl px-4 text-base sm:text-xs font-bold focus:outline-none focus:border-[#F97316] transition-all"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Barangay</label>
                                        <input 
                                            type="text" 
                                            placeholder="e.g. San Vicente"
                                            value={barangay}
                                            onChange={(e) => setBarangay(e.target.value)}
                                            className="w-full h-12 bg-white border border-gray-200 rounded-xl px-4 text-base sm:text-xs font-bold focus:outline-none focus:border-[#F97316] transition-all"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">City</label>
                                        <input 
                                            type="text" 
                                            placeholder="e.g. Santa Maria"
                                            value={city}
                                            onChange={(e) => setCity(e.target.value)}
                                            className="w-full h-12 bg-white border border-gray-200 rounded-xl px-4 text-base sm:text-xs font-bold focus:outline-none focus:border-[#F97316] transition-all"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Nearby Landmark</label>
                                        <input 
                                            type="text" 
                                            placeholder="e.g. near Selera Homes Clubhouse"
                                            value={landmark}
                                            onChange={(e) => setLandmark(e.target.value)}
                                            className="w-full h-12 bg-white border border-gray-200 rounded-xl px-4 text-base sm:text-xs font-bold focus:outline-none focus:border-[#F97316] transition-all"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Where is the pet currently?</label>
                                        <select
                                            value={locationType}
                                            onChange={(e) => setLocationType(e.target.value)}
                                            className="w-full h-12 bg-white border border-gray-200 rounded-xl px-4 text-base sm:text-xs font-bold focus:outline-none focus:border-[#F97316] transition-all cursor-pointer"
                                        >
                                            <option value="Found Location">Found Location (Roaming / Sighted)</option>
                                            <option value="Barangay Hall">Barangay Hall</option>
                                            <option value="Temporary Shelter">Temporary Shelter / My House</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Additional Notes / Finder Message</label>
                                <textarea 
                                    placeholder="Add any details about pet condition, behavior, or where they are contained."
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    rows={3}
                                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 text-base sm:text-xs font-bold focus:outline-none focus:bg-white focus:border-[#F97316] transition-all"
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="w-full py-4 bg-[#F97316] hover:bg-orange-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-orange-200 transition-all hover:scale-[1.01] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
                            >
                                {isSubmitting ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                                        Reporting Sighting...
                                    </>
                                ) : (
                                    <>
                                        Submit Scan & Alert Owner
                                    </>
                                )}
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PetScanPage;
