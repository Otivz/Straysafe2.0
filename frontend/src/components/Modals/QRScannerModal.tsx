import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIconRetina from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { api } from '../../utils/api';
import { DEFAULT_PET_AVATAR, getPetPicture, DEFAULT_AVATAR, getProfilePicture } from '../../utils/avatar';
import { Html5Qrcode } from 'html5-qrcode';
import jsQR from 'jsqr';
import { SELERA_DEFAULT_CENTER } from '../../utils/coverageArea';
import { petName } from '../../utils/petName';

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

// Custom Pin Icon for Pinpoint Map
const PinpointLocationIcon = L.divIcon({
    html: `
        <div style="position: relative; display: flex; flex-direction: column; align-items: center; cursor: grab;">
            <div style="
                background: linear-gradient(135deg, #F97316 0%, #EA580C 100%);
                width: 36px;
                height: 36px;
                border-radius: 50% 50% 50% 0;
                transform: rotate(-45deg);
                border: 2.5px solid white;
                box-shadow: 0 4px 14px rgba(249, 115, 22, 0.45);
                display: flex;
                align-items: center;
                justify-content: center;
            ">
                <div style="transform: rotate(45deg); font-size: 16px;">📍</div>
            </div>
            <div style="
                background: #1E293B;
                color: #FFFFFF;
                font-size: 8px;
                font-weight: 900;
                padding: 2px 6px;
                border-radius: 6px;
                text-transform: uppercase;
                letter-spacing: 0.05em;
                margin-top: 4px;
                box-shadow: 0 2px 6px rgba(0,0,0,0.25);
                white-space: nowrap;
                border: 1px solid rgba(255,255,255,0.2);
            ">FOUND SPOT</div>
        </div>
    `,
    className: 'custom-pinpoint-marker',
    iconSize: [60, 60],
    iconAnchor: [30, 52],
    popupAnchor: [0, -52]
});

const InvalidateMapSize = ({ trigger }: { trigger?: any }) => {
    const map = useMap();
    useEffect(() => {
        const update = () => {
            if (map) {
                map.invalidateSize();
            }
        };

        update();
        const t1 = setTimeout(update, 50);
        const t2 = setTimeout(update, 200);
        const t3 = setTimeout(update, 500);
        const t4 = setTimeout(update, 1000);
        const t5 = setTimeout(update, 2000);

        const container = map.getContainer();
        let observer: ResizeObserver | null = null;
        if (typeof ResizeObserver !== 'undefined' && container) {
            observer = new ResizeObserver(() => {
                update();
            });
            observer.observe(container);
        }

        window.addEventListener('resize', update);

        return () => {
            clearTimeout(t1);
            clearTimeout(t2);
            clearTimeout(t3);
            clearTimeout(t4);
            clearTimeout(t5);
            if (observer) observer.disconnect();
            window.removeEventListener('resize', update);
        };
    }, [map, trigger]);
    return null;
};

const RecenterMap = ({ center }: { center: [number, number] }) => {
    const map = useMap();
    useEffect(() => {
        if (center && !isNaN(center[0]) && !isNaN(center[1])) {
            map.setView(center, map.getZoom());
        }
    }, [center, map]);
    return null;
};

const LocationPicker = ({ onLocationSelect, position }: { onLocationSelect: (lat: number, lng: number) => void, position: [number, number] | null }) => {
    useMapEvents({
        click(e) {
            onLocationSelect(e.latlng.lat, e.latlng.lng);
        },
    });

    return position ? (
        <Marker
            position={position}
            icon={PinpointLocationIcon}
            draggable={true}
            eventHandlers={{
                dragend: (e: any) => {
                    const coords = e.target.getLatLng();
                    onLocationSelect(coords.lat, coords.lng);
                }
            }}
        />
    ) : null;
};

interface QRScannerModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface PetRecord {
    pet_id: number;
    owner_id: number;
    pet_name: string;
    pet_type: string;
    breed?: string;
    color_markings?: string;
    gender?: string;
    birth_date?: string;
    estimated_age?: string;
    weight?: number;
    size_category?: string;
    photo_url?: string;
    health_condition?: string;
    is_vaccinated?: boolean;
    is_neutered?: boolean;
    temperament?: string;
    has_bite_history?: boolean;
    status?: string;
    emergency_contact_name?: string;
    emergency_contact_phone?: string;
    notes?: string;
}

interface OwnerRecord {
    user_id: number;
    name: string;
    email: string;
    phone?: string;
    address?: string;
    profile_picture?: string;
}

type TabType = 'camera' | 'upload' | 'manual';

const QRScannerModal: React.FC<QRScannerModalProps> = ({ isOpen, onClose }) => {
    const [activeTab, setActiveTab] = useState<TabType>('camera');
    const [petIdInput, setPetIdInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pet, setPet] = useState<PetRecord | null>(null);
    const [owner, setOwner] = useState<OwnerRecord | null>(null);
    const [cameraActive, setCameraActive] = useState(false);
    const [cameras, setCameras] = useState<any[]>([]);
    const [currentCameraId, setCurrentCameraId] = useState<string | null>(null);
    const [currentQrToken, setCurrentQrToken] = useState<string | null>(null);

    // Finder & Location Form State
    const [finderName, setFinderName] = useState('');
    const [finderContact, setFinderContact] = useState('');
    const [lat, setLat] = useState<number | null>(null);
    const [lng, setLng] = useState<number | null>(null);
    const [streetAddress, setStreetAddress] = useState('');
    const [barangay, setBarangay] = useState('');
    const [city, setCity] = useState('');
    const [landmark, setLandmark] = useState('');
    const [locationType, setLocationType] = useState('Found Location');
    const [finderNotes, setFinderNotes] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [isLocating, setIsLocating] = useState(false);
    const [isGeocoding, setIsGeocoding] = useState(false);
    const [isSearchingAddress, setIsSearchingAddress] = useState(false);
    const [isSubmittingFinder, setIsSubmittingFinder] = useState(false);
    const [isFinderSubmitted, setIsFinderSubmitted] = useState(false);
    const [finderError, setFinderError] = useState<string | null>(null);
    const [showPinpointMap, setShowPinpointMap] = useState(false);

    const [gpsNotice, setGpsNotice] = useState<string | null>(null);

    const qrScannerRef = useRef<Html5Qrcode | null>(null);
    const cameraTimeoutRef = useRef<any>(null);
    const scannerId = 'qr-reader-viewport';

    const getLoggedInUser = () => {
        for (const key of ['resident_user', 'staff_user', 'admin_user']) {
            const raw = sessionStorage.getItem(key) || localStorage.getItem(key);
            if (raw) {
                try {
                    const parsed = JSON.parse(raw);
                    if (parsed) return parsed;
                } catch {}
            }
        }
        return null;
    };

    // Cleanup camera stream on close or unmount
    useEffect(() => {
        if (!isOpen) {
            stopCamera();
            resetStates();
        } else {
            // Default to camera tab when opened
            setActiveTab('camera');
            const loggedUser = getLoggedInUser();
            if (loggedUser) {
                setFinderName(loggedUser.name || '');
                setFinderContact(loggedUser.phone || '');
            }
        }
        return () => {
            stopCamera();
        };
    }, [isOpen]);

    // Handle tab changes
    useEffect(() => {
        if (isOpen) {
            if (activeTab === 'camera') {
                startCamera();
            } else {
                stopCamera();
            }
        }
    }, [activeTab, isOpen]);

    const resetStates = () => {
        setPet(null);
        setOwner(null);
        setError(null);
        setPetIdInput('');
        setCurrentQrToken(null);
        setIsFinderSubmitted(false);
        setFinderError(null);
        setStreetAddress('');
        setBarangay('');
        setCity('');
        setLandmark('');
        setLat(null);
        setLng(null);
        setSearchQuery('');
        setFinderNotes('');
        setLocationType('Found Location');
        setShowPinpointMap(false);
        setGpsNotice(null);

        const loggedUser = getLoggedInUser();
        if (loggedUser) {
            setFinderName(loggedUser.name || '');
            setFinderContact(loggedUser.phone || '');
        } else {
            setFinderName('');
            setFinderContact('');
        }
    };

    const handleMapLocationChange = async (newLat: number, newLng: number) => {
        setLat(newLat);
        setLng(newLng);
        setShowPinpointMap(true);
        setGpsNotice(null);
        await reverseGeocode(newLat, newLng);
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
            console.error('Reverse geocoding failed:', err);
        } finally {
            setIsGeocoding(false);
        }
    };

    const handleDetectLocation = () => {
        setGpsNotice(null);
        setShowPinpointMap(true);

        if (!('geolocation' in navigator)) {
            setGpsNotice('GPS is not supported by your browser. Please pinpoint your location on the map below.');
            if (lat === null || lng === null) {
                setLat(SELERA_DEFAULT_CENTER[0]);
                setLng(SELERA_DEFAULT_CENTER[1]);
                reverseGeocode(SELERA_DEFAULT_CENTER[0], SELERA_DEFAULT_CENTER[1]);
            }
            return;
        }

        const isInsecure = !window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';

        setIsLocating(true);
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const latitude = position.coords.latitude;
                const longitude = position.coords.longitude;
                setLat(latitude);
                setLng(longitude);
                setIsLocating(false);
                setGpsNotice(null);
                await reverseGeocode(latitude, longitude);
            },
            (err) => {
                console.warn('Geolocation failed or restricted:', err);
                setIsLocating(false);
                if (lat === null || lng === null) {
                    setLat(SELERA_DEFAULT_CENTER[0]);
                    setLng(SELERA_DEFAULT_CENTER[1]);
                    reverseGeocode(SELERA_DEFAULT_CENTER[0], SELERA_DEFAULT_CENTER[1]);
                }
                if (isInsecure || err.code === 1) {
                    setGpsNotice('🔒 Mobile browser requires HTTPS or Localhost for hardware GPS. We opened the interactive map below so you can tap/drag to pinpoint your exact spot!');
                } else {
                    setGpsNotice('⚠️ Could not acquire GPS automatically. Please tap anywhere on the map below to pinpoint the location.');
                }
            },
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 }
        );
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
                    setShowPinpointMap(true);

                    const addr = firstResult.address || {};
                    setStreetAddress(addr.road || addr.suburb || addr.neighbourhood || '');
                    setBarangay(addr.quarter || addr.suburb || addr.village || '');
                    setCity(addr.city || addr.municipality || addr.town || 'Santa Maria, Bulacan');
                } else {
                    alert('No location found. Please try a more specific search term.');
                }
            }
        } catch (err) {
            console.error('Address search failed:', err);
            alert('Error searching location. Please try again.');
        } finally {
            setIsSearchingAddress(false);
        }
    };

    const handleFinderSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!finderName.trim() || !finderContact.trim()) {
            setFinderError('Please provide your name and contact phone number.');
            return;
        }

        let targetToken = currentQrToken;
        if (!targetToken && pet?.pet_id) {
            try {
                const qrRes = await api.get(`/pets/${pet.pet_id}/qr`);
                targetToken = qrRes.data?.qr_token;
            } catch {
                // Ignore
            }
        }

        if (!targetToken) {
            setFinderError('No QR Code tag token linked for this pet to submit location notification.');
            return;
        }

        try {
            setIsSubmittingFinder(true);
            setFinderError(null);

            const loggedUser = getLoggedInUser();
            const payload = {
                scanned_by: loggedUser ? loggedUser.user_id : null,
                finder_name: finderName.trim(),
                finder_contact: finderContact.trim(),
                scan_lat: lat,
                scan_lng: lng,
                street_address: streetAddress.trim() || null,
                barangay: barangay.trim() || null,
                city: city.trim() || null,
                landmark: landmark.trim() || null,
                location_type: locationType,
                notes: finderNotes.trim() || null
            };

            await api.post(`/pet/scan/${targetToken}/submit`, payload);
            setIsFinderSubmitted(true);
        } catch (err: any) {
            console.error('Finder submit failed:', err);
            setFinderError(err.response?.data?.detail || 'Failed to submit finder location. Please try again.');
        } finally {
            setIsSubmittingFinder(false);
        }
    };

    const startCamera = async (preferredCameraId?: string) => {
        setError(null);
        setCameraActive(false);

        // Clear any pending camera start timeouts to prevent multiple initialization race conditions
        if (cameraTimeoutRef.current) {
            clearTimeout(cameraTimeoutRef.current);
        }

        // If scanner already initialized, stop it first
        if (qrScannerRef.current) {
            await stopCamera();
        }

        cameraTimeoutRef.current = setTimeout(async () => {
            try {
                // Double check to prevent multiple instances
                const container = document.getElementById(scannerId);
                if (!container) {
                    return;
                }

                const html5QrCode = new Html5Qrcode(scannerId);
                qrScannerRef.current = html5QrCode;

                const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
                let cameraConfig: any = preferredCameraId;

                if (!cameraConfig) {
                    if (isMobile) {
                        // On mobile browsers, passing facingMode object is the most reliable cross-browser way
                        cameraConfig = { facingMode: 'environment' };
                    } else {
                        try {
                            const devices = await Html5Qrcode.getCameras();
                            if (devices && devices.length > 0) {
                                const physicalWebcam = devices.find(device => {
                                    const label = device.label.toLowerCase();
                                    const isVirtual = label.includes('virtual') || 
                                                      label.includes('droidcam') || 
                                                      label.includes('iriun') || 
                                                      label.includes('epoccam') || 
                                                      label.includes('obs');
                                    return !isVirtual && (
                                        label.includes('integrated') || 
                                        label.includes('webcam') || 
                                        label.includes('usb') || 
                                        label.includes('camera') || 
                                        label.includes('hd')
                                    );
                                });
                                cameraConfig = physicalWebcam ? physicalWebcam.id : devices[0].id;
                            }
                        } catch (camErr) {
                            console.warn('Could not retrieve camera list, falling back to facingMode:', camErr);
                        }
                    }
                }

                // Final fallback
                if (!cameraConfig) {
                    cameraConfig = isMobile ? { facingMode: 'environment' } : { facingMode: 'user' };
                }

                // Ensure container still exists before starting
                if (!document.getElementById(scannerId)) return;

                try {
                    await html5QrCode.start(
                        cameraConfig,
                        {
                            fps: 10,
                            qrbox: (width, height) => {
                                const size = Math.min(width, height) * 0.75;
                                return { width: size, height: size };
                            }
                        },
                        (decodedText) => {
                            // Scan success!
                            handleQRDecoded(decodedText);
                        },
                        () => {
                            // Verbose scanning logs
                        }
                    );
                } catch (startErr) {
                    // If device-id or object failed on mobile, retry with basic facingMode string or devices[0]
                    console.warn('Primary camera start failed, attempting fallback mode:', startErr);
                    const fallbackConfig = isMobile ? 'environment' : 'user';
                    await html5QrCode.start(
                        fallbackConfig,
                        {
                            fps: 10,
                            qrbox: (width, height) => {
                                const size = Math.min(width, height) * 0.75;
                                return { width: size, height: size };
                            }
                        },
                        (decodedText) => {
                            handleQRDecoded(decodedText);
                        },
                        () => {}
                    );
                }

                setCameraActive(true);

                // Populate available cameras list asynchronously AFTER camera has successfully started
                try {
                    const devices = await Html5Qrcode.getCameras();
                    if (devices && devices.length > 0) {
                        setCameras(devices);
                        if (!preferredCameraId && typeof cameraConfig === 'string') {
                            setCurrentCameraId(cameraConfig);
                        } else if (preferredCameraId) {
                            setCurrentCameraId(preferredCameraId);
                        }
                    }
                } catch (camListErr) {
                    console.warn('Could not enumerate cameras after start:', camListErr);
                }

            } catch (err: any) {
                console.error('QR Scanner initialization failed:', err);
                
                const errMsg = err?.message || String(err);
                if (errMsg.toLowerCase().includes('permission') || errMsg.toLowerCase().includes('notallowed')) {
                    setError('Camera permission denied. Please allow camera access in your browser settings and try again.');
                } else {
                    setError(
                        'Live camera stream is restricted or not supported by this browser connection (HTTP). Please tap "Snap QR Photo" below or upload an image.'
                    );
                }
            }
        }, 150);
    };

    const stopCamera = async () => {
        if (cameraTimeoutRef.current) {
            clearTimeout(cameraTimeoutRef.current);
            cameraTimeoutRef.current = null;
        }

        if (qrScannerRef.current) {
            try {
                if (qrScannerRef.current.isScanning) {
                    await qrScannerRef.current.stop();
                }
            } catch (err) {
                console.error('Error stopping camera:', err);
            } finally {
                qrScannerRef.current = null;
                setCameraActive(false);
            }
        }
    };

    const handleSwitchCamera = async () => {
        if (cameras.length <= 1 || !qrScannerRef.current) return;
        
        // Find next camera in the list
        const currentIndex = cameras.findIndex(c => c.id === currentCameraId);
        const nextIndex = (currentIndex + 1) % cameras.length;
        const nextCamera = cameras[nextIndex];
        
        setCurrentCameraId(nextCamera.id);
        // Restart camera with the new preferred ID
        await startCamera(nextCamera.id);
    };

    const fetchPetAndOwnerByToken = async (token: string) => {
        setLoading(true);
        setError(null);
        setPet(null);
        setOwner(null);

        try {
            // 1. Fetch public scan info (works without authentication)
            const scanRes = await api.get(`/pet/scan/${token}`);
            const scanData = scanRes.data;

            if (scanData && scanData.pet_id) {
                setCurrentQrToken(scanData.qr_token || token);

                // Populate public pet data immediately so scan results display for any user / citizen
                setPet({
                    pet_id: scanData.pet_id,
                    owner_id: scanData.owner_id || 0,
                    pet_name: scanData.pet_name,
                    pet_type: scanData.pet_type,
                    breed: scanData.breed,
                    color_markings: scanData.color_markings,
                    gender: scanData.gender,
                    estimated_age: scanData.estimated_age,
                    size_category: scanData.size_category,
                    temperament: scanData.temperament,
                    photo_url: scanData.photo_url,
                    health_condition: scanData.health_condition,
                    is_vaccinated: scanData.is_vaccinated,
                    is_neutered: scanData.is_neutered,
                    emergency_contact_name: scanData.emergency_contact_name,
                    emergency_contact_phone: scanData.emergency_contact_phone,
                    notes: scanData.notes,
                });

                const resolvedOwnerName = scanData.owner_name || scanData.emergency_contact_name;
                const resolvedOwnerPhone = scanData.owner_phone || scanData.emergency_contact_phone;
                const resolvedOwnerAddress = scanData.owner_address || scanData.registered_address;

                if (resolvedOwnerName || resolvedOwnerPhone || scanData.owner_email || resolvedOwnerAddress) {
                    setOwner({
                        user_id: 0,
                        name: resolvedOwnerName || 'Registered Pet Owner',
                        email: scanData.owner_email || '',
                        phone: resolvedOwnerPhone || '',
                        address: resolvedOwnerAddress || 'Registered Community Pet',
                        profile_picture: scanData.owner_profile_picture || ''
                    });
                }

                // 2. Try fetching full authenticated pet details if authorized (staff/admin/owner)
                try {
                    const petRes = await api.get(`/pets/${scanData.pet_id}`);
                    if (petRes.data) {
                        setPet(petRes.data);
                        if (petRes.data.owner) {
                            setOwner({
                                user_id: petRes.data.owner.user_id || petRes.data.owner_id || 0,
                                name: petRes.data.owner.name || resolvedOwnerName || 'Registered Pet Owner',
                                email: petRes.data.owner.email || scanData.owner_email || '',
                                phone: petRes.data.owner.phone || resolvedOwnerPhone || '',
                                address: petRes.data.registered_address || petRes.data.owner.address || (petRes.data.owner.subdivision?.subdivision_name) || resolvedOwnerAddress || 'Subdivision Resident',
                                profile_picture: petRes.data.owner.profile_picture || scanData.owner_profile_picture || ''
                            });
                        } else if (petRes.data.owner_id) {
                            try {
                                const ownerRes = await api.get(`/users/${petRes.data.owner_id}`);
                                const ownerData = ownerRes.data;
                                setOwner({
                                    user_id: ownerData.user_id || petRes.data.owner_id,
                                    name: ownerData.name || resolvedOwnerName || 'Registered Pet Owner',
                                    email: ownerData.email || scanData.owner_email || '',
                                    phone: ownerData.phone || resolvedOwnerPhone || '',
                                    address: petRes.data.registered_address || ownerData.address || (ownerData.subdivision_name) || resolvedOwnerAddress || 'Subdivision Resident',
                                    profile_picture: ownerData.profile_picture || scanData.owner_profile_picture || ''
                                });
                            } catch {
                                // Non-blocking
                            }
                        }
                    }
                } catch {
                    // Non-blocking: Public scan data is already shown
                }
            } else {
                setError('No associated pet record found for this QR token.');
            }
        } catch (err: any) {
            console.error('Error fetching pet by token:', err);
            const detailMsg = err.response?.data?.detail;
            if (err.response?.status === 404) {
                setError('No registered pet found with this QR tag.');
            } else if (detailMsg) {
                setError(typeof detailMsg === 'string' ? detailMsg : JSON.stringify(detailMsg));
            } else if (!err.response) {
                setError('Cannot reach server. Please ensure the backend is running and network is connected.');
            } else {
                setError('Failed to retrieve pet information. Please try again.');
            }
        } finally {
            setLoading(false);
        }
    };

    const fetchPetAndOwnerDetails = async (id: number) => {
        setLoading(true);
        setError(null);
        setPet(null);
        setOwner(null);

        try {
            // 1. Fetch Pet Details
            const petRes = await api.get(`/pets/${id}`);
            const petData = petRes.data;
            setPet(petData);

            // 2. Fetch Owner Details (linked to user_id or embedded)
            if (petData.owner) {
                setOwner({
                    user_id: petData.owner.user_id || petData.owner_id || 0,
                    name: petData.owner.name || petData.emergency_contact_name || petData.registered_by_name || 'Registered Pet Owner',
                    email: petData.owner.email || '',
                    phone: petData.owner.phone || petData.emergency_contact_phone || '',
                    address: petData.registered_address || petData.owner.address || (petData.owner.subdivision?.subdivision_name) || 'Subdivision Resident',
                    profile_picture: petData.owner.profile_picture || ''
                });
            } else if (petData.owner_id) {
                try {
                    const ownerRes = await api.get(`/users/${petData.owner_id}`);
                    const ownerData = ownerRes.data;
                    setOwner({
                        user_id: ownerData.user_id || petData.owner_id,
                        name: ownerData.name || petData.emergency_contact_name || petData.registered_by_name || 'Registered Pet Owner',
                        email: ownerData.email || '',
                        phone: ownerData.phone || petData.emergency_contact_phone || '',
                        address: petData.registered_address || ownerData.address || (ownerData.subdivision_name) || 'Subdivision Resident',
                        profile_picture: ownerData.profile_picture || ''
                    });
                } catch (ownerErr) {
                    console.warn('Error fetching pet owner details:', ownerErr);
                    setOwner({
                        user_id: petData.owner_id,
                        name: petData.emergency_contact_name || petData.registered_by_name || 'Registered Pet Owner',
                        email: '',
                        phone: petData.emergency_contact_phone || '',
                        address: petData.registered_address || 'Registered Community Pet',
                        profile_picture: ''
                    });
                }
            } else if (petData.emergency_contact_name || petData.emergency_contact_phone) {
                setOwner({
                    user_id: 0,
                    name: petData.emergency_contact_name || 'Emergency Contact',
                    email: '',
                    phone: petData.emergency_contact_phone || '',
                    address: petData.registered_address || 'Registered Community Pet',
                    profile_picture: ''
                });
            }
        } catch (err: any) {
            console.error('Error fetching pet record:', err);
            const detailMsg = err.response?.data?.detail;
            if (err.response?.status === 404) {
                setError(`No registered pet found with ID #${id}.`);
            } else if (err.response?.status === 403) {
                setError(detailMsg || 'Access restricted: You do not have permission to view this pet registry.');
            } else if (err.response?.status === 401) {
                setError('Authentication required. Please log in to view pet records.');
            } else if (detailMsg) {
                setError(typeof detailMsg === 'string' ? detailMsg : JSON.stringify(detailMsg));
            } else if (!err.response) {
                setError('Cannot reach server. Please ensure the backend is running.');
            } else {
                setError('Failed to retrieve pet record. Please check the Pet ID and try again.');
            }
        } finally {
            setLoading(false);
        }
    };

    // Extract ID or secure QR token from QR payload and fetch records
    const handleQRDecoded = async (text: string) => {
        const raw = text.trim();
        console.log('Decoded QR raw text:', raw);

        // 1. Check for token in URL or raw token
        // Matches: http://.../pet/scan/TOKEN, /pet/scan/TOKEN, or scan/TOKEN
        const tokenMatch = raw.match(/(?:pet\/scan|scan)\/([a-zA-Z0-9_-]+)/i);
        if (tokenMatch && tokenMatch[1]) {
            const token = tokenMatch[1];
            await stopCamera();
            await fetchPetAndOwnerByToken(token);
            return;
        }

        // 2. Direct alphanumeric token check (if 16-24 chars urlsafe)
        if (/^[a-zA-Z0-9_-]{16,32}$/.test(raw) && isNaN(Number(raw))) {
            await stopCamera();
            await fetchPetAndOwnerByToken(raw);
            return;
        }

        let petId = null;

        // 3. Try extracting numeric pet ID from various QR contents
        if (/^\d+$/.test(raw)) {
            // Plain integer ID
            petId = parseInt(raw, 10);
        } else {
            try {
                // Try parsing JSON
                const parsed = JSON.parse(raw);
                if (parsed && (parsed.pet_id || parsed.id)) {
                    petId = parseInt(parsed.pet_id || parsed.id, 10);
                }
            } catch {
                // Try matching numbers in URL patterns like /pets/123, /pet/123, id=123, etc.
                const urlMatch = raw.match(/pets?\/(\d+)/i) || raw.match(/[?&]id=(\d+)/i) || raw.match(/:(\d+)$/);
                if (urlMatch && urlMatch[1]) {
                    petId = parseInt(urlMatch[1], 10);
                }
            }
        }

        if (petId && !isNaN(petId)) {
            await stopCamera();
            await fetchPetAndOwnerDetails(petId);
        } else {
            // If it's a URL or arbitrary text, try sending it as a token directly before giving up
            if (raw.length > 5 && !raw.includes(' ')) {
                const parts = raw.split('/').filter(Boolean);
                const lastSegment = parts[parts.length - 1];
                if (lastSegment && lastSegment.length >= 10) {
                    await stopCamera();
                    await fetchPetAndOwnerByToken(lastSegment);
                    return;
                }
            }
            setError(`Recognized code: "${raw.substring(0, 40)}...", but no registered pet or token was matched.`);
        }
    };

    // Helper to run jsQR over canvas with optional thresholding/contrast enhancement
    const scanCanvasData = (canvas: HTMLCanvasElement): string | null => {
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return null;

        const w = canvas.width;
        const h = canvas.height;
        const imgData = ctx.getImageData(0, 0, w, h);

        // Pass 1: Standard scan with inversion
        let code = jsQR(imgData.data, w, h, { inversionAttempts: 'attemptBoth' });
        if (code && code.data) return code.data;

        // Pass 2: High contrast binarization (grayscale + thresholding)
        const d = imgData.data;
        for (let i = 0; i < d.length; i += 4) {
            const gray = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114);
            const val = gray > 128 ? 255 : 0;
            d[i] = val;
            d[i + 1] = val;
            d[i + 2] = val;
        }
        ctx.putImageData(imgData, 0, 0);
        const binaryData = ctx.getImageData(0, 0, w, h);
        code = jsQR(binaryData.data, w, h, { inversionAttempts: 'attemptBoth' });
        if (code && code.data) return code.data;

        return null;
    };

    // Robust helper to decode QR code from high-resolution phone photos or uploads
    const decodeQRFromFile = async (file: File): Promise<string> => {
        // Strategy 1: Fast & resilient pure JavaScript QR decoding (jsQR) with multi-scale & center cropping
        try {
            const decoded = await new Promise<string | null>((resolve) => {
                const img = new Image();
                const url = URL.createObjectURL(file);

                img.onload = () => {
                    URL.revokeObjectURL(url);
                    try {
                        const originalMax = Math.max(img.width, img.height);

                        // Test multiple resolutions (1400px, 1000px, 700px, 450px)
                        const testSizes = [1400, 1000, 700, 450, originalMax];

                        for (const targetMax of testSizes) {
                            if (targetMax <= 0) continue;
                            const scale = Math.min(1, targetMax / originalMax);
                            const canvas = document.createElement('canvas');
                            const w = Math.floor(img.width * scale);
                            const h = Math.floor(img.height * scale);

                            if (w <= 0 || h <= 0) continue;
                            canvas.width = w;
                            canvas.height = h;

                            const ctx = canvas.getContext('2d', { willReadFrequently: true });
                            if (!ctx) continue;

                            // 1. Full image scan
                            ctx.drawImage(img, 0, 0, w, h);
                            const fullScan = scanCanvasData(canvas);
                            if (fullScan) {
                                resolve(fullScan);
                                return;
                            }

                            // 2. Center crop (common when users center the QR in viewfinder)
                            const cropW = Math.floor(w * 0.7);
                            const cropH = Math.floor(h * 0.7);
                            const cropX = Math.floor((w - cropW) / 2);
                            const cropY = Math.floor((h - cropH) / 2);

                            const cropCanvas = document.createElement('canvas');
                            cropCanvas.width = cropW;
                            cropCanvas.height = cropH;
                            const cropCtx = cropCanvas.getContext('2d', { willReadFrequently: true });
                            if (cropCtx) {
                                cropCtx.drawImage(img, cropX / scale, cropY / scale, cropW / scale, cropH / scale, 0, 0, cropW, cropH);
                                const cropScan = scanCanvasData(cropCanvas);
                                if (cropScan) {
                                    resolve(cropScan);
                                    return;
                                }
                            }
                        }

                        resolve(null);
                    } catch (e) {
                        console.warn('jsQR processing failed:', e);
                        resolve(null);
                    }
                };

                img.onerror = () => {
                    URL.revokeObjectURL(url);
                    resolve(null);
                };

                img.src = url;
            });

            if (decoded) {
                return decoded;
            }
        } catch (jsQrErr) {
            console.warn('jsQR scan attempt threw:', jsQrErr);
        }

        // Strategy 2: Html5Qrcode file scanner as fallback
        try {
            const tempScanner = new Html5Qrcode('qr-upload-temp-container');
            const result = await tempScanner.scanFile(file, true);
            if (result) {
                return result;
            }
        } catch (html5Err) {
            console.warn('Html5Qrcode scanFile fallback failed:', html5Err);
        }

        throw new Error('No QR code detected in image');
    };

    // Handle drag & drop or image select scanning
    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Reset file input value so user can re-snap the same or fresh photo
        e.target.value = '';

        setLoading(true);
        setError(null);
        resetStates();

        try {
            const result = await decodeQRFromFile(file);
            await handleQRDecoded(result);
        } catch (err) {
            console.error('QR File scanning failed:', err);
            setError('Could not recognize the QR code from this photo. Please hold the camera closer and ensure the QR code is clear and in focus.');
        } finally {
            setLoading(false);
        }
    };

    const handleManualSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const parsedId = parseInt(petIdInput.trim(), 10);
        if (isNaN(parsedId)) {
            setError('Please enter a valid numeric Pet ID.');
            return;
        }
        await fetchPetAndOwnerDetails(parsedId);
    };

    if (!isOpen) return null;

    const modalContent = (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-0 sm:p-4 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-300 font-sans">

            {/* Temporary container hidden in viewport for handling static image scans */}
            <div id="qr-upload-temp-container" className="hidden" style={{ width: '1px', height: '1px' }}></div>

            <div className="bg-white rounded-none sm:rounded-[2.5rem] shadow-2xl overflow-hidden max-w-md sm:max-w-xl w-full h-full sm:h-auto sm:max-h-[90vh] flex flex-col border-none sm:border sm:border-gray-100 animate-in zoom-in-95 duration-300">

                {/* Header */}
                <div className="bg-gradient-to-r from-role to-role text-white px-3.5 py-3 sm:px-8 sm:py-6 flex justify-between items-center relative overflow-hidden shrink-0">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-xl translate-x-8 -translate-y-8"></div>

                    <div className="flex items-center space-x-2.5 sm:space-x-3.5 z-10 min-w-0">
                        <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white/20 rounded-lg sm:rounded-2xl flex items-center justify-center text-white backdrop-blur-sm shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.125 13.5h.008v.008h-.008V13.5zM16.875 15.75h.008v.008h-.008v-.008zM14.625 18h.008v.008h-.008V18zM13.5 15.75h.008v.008H13.5v-.008zM15.75 13.5h.008v.008h-.008V13.5zM18 15.75h.008v.008H18v-.008zM18 18h.008v.008H18V18zM15.75 18h.008v.008h-.008V18zM13.5 13.5h.008v.008H13.5V13.5zM20.25 15.75h.008v.008h-.008v-.008zM20.25 18h.008v.008h-.008V18z" />
                            </svg>
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-sm sm:text-xl font-extrabold tracking-tight truncate">QR Collar Scanner</h3>
                            <p className="text-role-muted text-[10px] sm:text-xs font-medium truncate">Verify registered pets & owners</p>
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        className="bg-white/10 hover:bg-white/20 text-white rounded-full p-1.5 sm:p-2.5 transition-all z-10 cursor-pointer shrink-0 ml-2"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-3 sm:p-8 flex flex-col gap-3 sm:gap-6">

                    {/* Active Scanning Mode tabs */}
                    {!pet && !loading && (
                        <div className="flex bg-gray-100 rounded-xl sm:rounded-2xl p-1 shrink-0">
                            <button
                                onClick={() => setActiveTab('camera')}
                                className={`flex-1 py-1.5 sm:py-3 text-[10px] sm:text-xs font-black uppercase tracking-wider rounded-lg sm:rounded-xl transition-all cursor-pointer ${activeTab === 'camera' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                            >
                                Live Camera
                            </button>
                            <button
                                onClick={() => setActiveTab('upload')}
                                className={`flex-1 py-1.5 sm:py-3 text-[10px] sm:text-xs font-black uppercase tracking-wider rounded-lg sm:rounded-xl transition-all cursor-pointer ${activeTab === 'upload' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                            >
                                Upload Image
                            </button>
                            <button
                                onClick={() => setActiveTab('manual')}
                                className={`flex-1 py-1.5 sm:py-3 text-[10px] sm:text-xs font-black uppercase tracking-wider rounded-lg sm:rounded-xl transition-all cursor-pointer ${activeTab === 'manual' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                            >
                                Manual ID
                            </button>
                        </div>
                    )}

                    {/* ERROR PANEL */}
                    {error && (
                        <div className="bg-red-50 text-red-600 rounded-xl p-3 sm:p-4 flex items-start space-x-2.5 sm:space-x-3 border border-red-100 animate-in fade-in shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5 shrink-0 text-red-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <p className="text-[11px] sm:text-xs font-bold leading-relaxed">{error}</p>
                        </div>
                    )}

                    {/* SCANNING MODES PANELS */}
                    {!pet && !loading && (
                        <div className="flex-1 flex flex-col justify-center min-h-[190px] sm:min-h-[300px]">
                            {/* CAMERA TAB */}
                            {activeTab === 'camera' && (
                                <div className="flex flex-col items-center justify-center space-y-2.5 sm:space-y-4">
                                    <div className="w-full h-[180px] sm:h-[300px] rounded-xl sm:rounded-3xl bg-gray-50 border border-gray-100 shadow-inner overflow-hidden relative flex items-center justify-center">

                                        {/* Scanner Viewport Element */}
                                        <div id={scannerId} className="w-full h-full object-cover"></div>

                                        {/* Scanner Animation Overlays */}
                                        {cameraActive && (
                                            <>
                                                {/* Corner markers */}
                                                <div className="absolute inset-0 m-4 sm:m-12 border-2 border-white/20 pointer-events-none rounded-xl sm:rounded-2xl">
                                                    <div className="absolute -top-1 -left-1 w-4 h-4 sm:w-8 sm:h-8 border-t-4 border-l-4 border-role rounded-tl-lg"></div>
                                                    <div className="absolute -top-1 -right-1 w-4 h-4 sm:w-8 sm:h-8 border-t-4 border-r-4 border-role rounded-tr-lg"></div>
                                                    <div className="absolute -bottom-1 -left-1 w-4 h-4 sm:w-8 sm:h-8 border-b-4 border-l-4 border-role rounded-bl-lg"></div>
                                                    <div className="absolute -bottom-1 -right-1 w-4 h-4 sm:w-8 sm:h-8 border-b-4 border-r-4 border-role rounded-br-lg"></div>
                                                </div>
                                                {/* Laser animation */}
                                                <div className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-role to-transparent shadow-[0_0_15px_#F97316] animate-[scan_2.5s_infinite_ease-in-out]"></div>
                                            </>
                                        )}

                                        {!cameraActive && !error && (
                                            <div className="flex flex-col items-center space-y-2 sm:space-y-3 z-10 text-gray-400">
                                                <svg className="w-8 h-8 sm:w-12 sm:h-12 animate-spin text-role" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                </svg>
                                                <p className="text-[11px] sm:text-xs font-bold">Activating Camera...</p>
                                            </div>
                                        )}
                                    </div>
                                    
                                    <div className="w-full flex items-center justify-between px-1">
                                        <p className="text-[10px] sm:text-xs text-gray-400 font-medium">Position QR in box</p>
                                        
                                        {/* Fallback Direct Camera Photo Trigger (works seamlessly over HTTP/mobile) */}
                                        <label className="inline-flex items-center space-x-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 bg-role-soft hover:bg-role-muted text-role rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-bold cursor-pointer transition-colors shadow-sm">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                            </svg>
                                            <span>Snap QR Photo</span>
                                            <input
                                                type="file"
                                                accept="image/*"
                                                capture="environment"
                                                className="hidden"
                                                onChange={handleImageUpload}
                                            />
                                        </label>
                                    </div>
                                </div>
                            )}

                            {/* UPLOAD TAB */}
                            {activeTab === 'upload' && (
                                <div className="flex flex-col items-center justify-center">
                                    <label className="w-full h-44 sm:h-64 border-2 border-dashed border-gray-200 rounded-xl sm:rounded-[2rem] flex flex-col items-center justify-center gap-2 sm:gap-4 cursor-pointer bg-gray-50 hover:bg-role-soft/20 hover:border-role-border transition-all group p-3 sm:p-6">
                                        <input
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={handleImageUpload}
                                        />
                                        <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-white flex items-center justify-center text-gray-400 group-hover:text-role-hover shadow-md transition-colors">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 sm:h-7 sm:w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                            </svg>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-xs sm:text-sm font-extrabold text-gray-700">Drop QR Image here</p>
                                            <p className="text-[10px] sm:text-xs text-gray-400 font-bold mt-0.5">or tap to browse device</p>
                                        </div>
                                    </label>
                                </div>
                            )}

                            {/* MANUAL INPUT TAB */}
                            {activeTab === 'manual' && (
                                <form onSubmit={handleManualSubmit} className="space-y-3 sm:space-y-5 px-1 sm:px-4">
                                    <div className="space-y-1.5 sm:space-y-2">
                                        <label className="text-[10px] sm:text-xs font-extrabold text-gray-400 uppercase tracking-widest">Enter Pet ID</label>
                                        <input
                                            type="text"
                                            value={petIdInput}
                                            onChange={(e) => setPetIdInput(e.target.value)}
                                            placeholder="e.g. 1"
                                            className="w-full px-3.5 py-2.5 sm:px-5 sm:py-4 bg-gray-50 border border-gray-200 rounded-xl sm:rounded-2xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-role focus:border-transparent focus:bg-white shadow-sm font-semibold transition-all"
                                        />
                                    </div>
                                    <button
                                        type="submit"
                                        className="w-full py-2.5 sm:py-4 bg-role text-white rounded-xl sm:rounded-2xl text-xs sm:text-sm font-extrabold shadow-md hover:bg-role-hover hover:shadow-lg transition-all flex items-center justify-center space-x-2 cursor-pointer"
                                    >
                                        <span>Retrieve Pet Details</span>
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                        </svg>
                                    </button>
                                </form>
                            )}
                        </div>
                    )}

                    {/* LOADING STATE */}
                    {loading && (
                        <div className="flex-1 min-h-[190px] sm:min-h-[300px] flex flex-col items-center justify-center space-y-3">
                            <svg className="w-10 h-10 sm:w-14 sm:h-14 animate-spin text-role" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            <div className="text-center">
                                <p className="text-xs sm:text-sm font-extrabold text-gray-800">Verifying Database Records...</p>
                                <p className="text-[10px] sm:text-xs text-gray-400 font-bold mt-0.5">Retrieving registration profiles</p>
                            </div>
                        </div>
                    )}

                    {/* RESULTS MODE PANEL */}
                    {pet && !loading && (
                        <div className="space-y-3 sm:space-y-6 animate-in fade-in zoom-in-95 duration-300">

                            {/* Pet Core Detail Card */}
                            <div className="bg-gray-50 rounded-xl sm:rounded-[2rem] p-3 sm:p-6 border border-gray-100 flex flex-col sm:flex-row gap-3 sm:gap-6">

                                {/* Photo */}
                                <div className="w-20 h-20 sm:w-32 sm:h-32 rounded-xl sm:rounded-3xl bg-white border border-gray-200 shadow-sm overflow-hidden shrink-0 self-center flex items-center justify-center">
                                    <img 
                                        src={getPetPicture(pet.photo_url)} 
                                        alt={pet.pet_name} 
                                        className="w-full h-full object-cover" 
                                        onError={(e) => { e.currentTarget.src = DEFAULT_PET_AVATAR; }}
                                    />
                                </div>

                                {/* Core fields */}
                                <div className="flex-1 flex flex-col justify-between">
                                    <div>
                                        <div className="flex items-center space-x-2">
                                            <h4 className="text-base sm:text-xl font-black text-gray-900">{petName(pet)}</h4>
                                            <span className={`px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold tracking-wider uppercase ${pet.pet_type.toLowerCase() === 'dog' ? 'bg-role-soft text-role-hover' : 'bg-purple-50 text-purple-600'}`}>
                                                {pet.pet_type}
                                            </span>
                                        </div>
                                        <p className="text-[11px] sm:text-xs text-gray-400 font-extrabold uppercase tracking-wider mt-0.5">{pet.breed || 'Unknown Breed'}</p>

                                        <div className="grid grid-cols-2 gap-2 sm:gap-3 mt-2 sm:mt-4 text-[11px] sm:text-xs font-semibold text-gray-600">
                                            <div>
                                                <span className="text-[9px] sm:text-[10px] font-extrabold text-gray-400 uppercase block tracking-wider">Gender</span>
                                                <span className="text-gray-800">{pet.gender || 'Unknown'}</span>
                                            </div>
                                            <div>
                                                <span className="text-[9px] sm:text-[10px] font-extrabold text-gray-400 uppercase block tracking-wider">Estimated Age</span>
                                                <span className="text-gray-800">{pet.estimated_age || 'Not Registered'}</span>
                                            </div>
                                            <div>
                                                <span className="text-[9px] sm:text-[10px] font-extrabold text-gray-400 uppercase block tracking-wider">Size Category</span>
                                                <span className="text-gray-800 uppercase">{pet.size_category || 'Medium'}</span>
                                            </div>
                                            <div>
                                                <span className="text-[9px] sm:text-[10px] font-extrabold text-gray-400 uppercase block tracking-wider">Temperament</span>
                                                <span className={`text-gray-800 font-bold ${pet.temperament === 'Aggressive' ? 'text-red-500' : 'text-green-600'}`}>{pet.temperament || 'Friendly'}</span>
                                            </div>
                                            <div>
                                                <span className="text-[9px] sm:text-[10px] font-extrabold text-gray-400 uppercase block tracking-wider">Neutered</span>
                                                <span className="text-gray-800">{pet.is_neutered ? 'Yes' : 'No'}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Health Alerts / Notes */}
                            <div className="bg-role-soft/50 rounded-xl p-3 sm:p-5 border border-role-muted/50 text-[11px] sm:text-xs flex flex-col gap-1.5">
                                <div className="flex justify-between items-center">
                                    <div className="flex items-center space-x-1.5 font-bold text-role-strong uppercase tracking-widest text-[9px]">
                                        <span>Medical Status</span>
                                    </div>
                                    <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider ${pet.is_vaccinated ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                                        {pet.is_vaccinated ? 'Fully Vaccinated' : 'Unvaccinated'}
                                    </span>
                                </div>
                                <p className="text-gray-600 font-medium leading-relaxed mt-0.5">
                                    <span className="font-extrabold text-gray-800">Health notes:</span> {pet.health_condition || 'No specific health issues declared.'}
                                </p>
                                {pet.notes && (
                                    <p className="text-gray-500 font-medium leading-relaxed italic border-t border-role-border/40 pt-1.5 mt-0.5">
                                        "{pet.notes}"
                                    </p>
                                )}
                            </div>

                            {/* Linked Owner Card - HIGHEST VISUAL HIERARCHY */}
                            <div className="bg-[#1A4543] rounded-xl sm:rounded-[2rem] p-3.5 sm:p-6 text-white shadow-lg relative overflow-hidden">
                                <div className="absolute bottom-0 right-0 w-40 h-40 bg-white/5 rounded-full blur-2xl translate-x-12 translate-y-12"></div>
                                <div className="absolute top-0 left-0 w-24 h-24 bg-white/5 rounded-full blur-xl -translate-x-6 -translate-y-6"></div>

                                <div className="flex justify-between items-start z-10 relative gap-3">
                                    <div className="min-w-0 flex-1">
                                        <span className="text-[8px] sm:text-[9px] font-black text-teal-300 uppercase tracking-widest block">Registered Owner Details</span>
                                        {owner ? (
                                            <>
                                                <h4 className="text-base sm:text-2xl font-black tracking-tight mt-1 truncate">{owner.name}</h4>
                                                <p className="text-teal-100/70 text-[11px] sm:text-xs font-semibold mt-0.5 line-clamp-2">{owner.address || 'Subdivision Resident'}</p>
                                            </>
                                        ) : (
                                            <h4 className="text-sm sm:text-xl font-black text-teal-100/60 tracking-tight mt-1">No Linked Owner Found</h4>
                                        )}
                                    </div>

                                    {/* Owner Profile Picture */}
                                    <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-white/10 border-2 border-white/20 shadow-md overflow-hidden shrink-0 flex items-center justify-center backdrop-blur-sm">
                                        <img 
                                            src={getProfilePicture(owner?.profile_picture)} 
                                            alt={owner?.name || 'Owner'} 
                                            className="w-full h-full object-cover"
                                            onError={(e) => { e.currentTarget.src = DEFAULT_AVATAR; }}
                                        />
                                    </div>
                                </div>

                                {owner && (
                                    <div className={`grid ${(owner.phone && owner.email) ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'} gap-2 sm:gap-4 mt-3 sm:mt-6 pt-3 sm:pt-6 border-t border-white/10 z-10 relative text-xs`}>
                                        {owner.phone && (
                                            <a
                                                href={`tel:${owner.phone}`}
                                                className="flex items-center space-x-2.5 bg-white/5 hover:bg-white/10 p-2 sm:p-3 rounded-xl sm:rounded-2xl border border-white/5 transition-all text-white group"
                                            >
                                                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-teal-300/10 flex items-center justify-center text-teal-300 group-hover:scale-105 transition-transform shrink-0">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.94.725l.548 2.2a1 1 0 01-.321.988l-1.305.98a10.582 10.582 0 004.872 4.872l.98-1.305a1 1 0 01.988-.321l2.2.548a1 1 0 01.725.94V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                                    </svg>
                                                </div>
                                                <div>
                                                    <span className="text-[8px] font-black text-teal-300 uppercase block tracking-wider">Call Contact</span>
                                                    <span className="font-extrabold text-[11px] sm:text-xs tracking-wide">{owner.phone}</span>
                                                </div>
                                            </a>
                                        )}
                                        {owner.email && (
                                            <a
                                                href={`mailto:${owner.email}`}
                                                className="flex items-center space-x-2.5 bg-white/5 hover:bg-white/10 p-2 sm:p-3 rounded-xl sm:rounded-2xl border border-white/5 transition-all text-white group"
                                            >
                                                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-teal-300/10 flex items-center justify-center text-teal-300 group-hover:scale-105 transition-transform shrink-0">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                                    </svg>
                                                </div>
                                                <div className="min-w-0">
                                                    <span className="text-[8px] font-black text-teal-300 uppercase block tracking-wider">Send Email</span>
                                                    <span className="font-extrabold text-[11px] sm:text-xs tracking-wide block truncate">{owner.email}</span>
                                                </div>
                                            </a>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* FINDER & LOCATION REPORT FORM */}
                            <div className="bg-white rounded-xl sm:rounded-[2rem] p-3.5 sm:p-6 border border-role-muted/80 shadow-sm space-y-3.5 sm:space-y-4">
                                <div className="flex items-center space-x-2.5 pb-2.5 border-b border-gray-100">
                                    <div className="w-8 h-8 rounded-xl bg-role-soft text-role-hover flex items-center justify-center shrink-0">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                    </div>
                                    <div className="min-w-0">
                                        <h4 className="text-xs sm:text-base font-black text-gray-900 truncate">Finder & Location Form</h4>
                                        <p className="text-[10px] sm:text-xs text-gray-400 font-medium truncate">Share found location & message directly with the owner</p>
                                    </div>
                                </div>

                                {isFinderSubmitted ? (
                                    <div className="bg-green-50 border border-green-200 rounded-xl sm:rounded-2xl p-4 text-center space-y-1.5 animate-in fade-in">
                                        <div className="w-9 h-9 sm:w-10 sm:h-10 bg-green-500 text-white rounded-full flex items-center justify-center mx-auto mb-1.5 shadow-sm">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                            </svg>
                                        </div>
                                        <h5 className="text-xs sm:text-sm font-extrabold text-green-900">Location Report Sent!</h5>
                                        <p className="text-[11px] sm:text-xs text-green-700 leading-relaxed font-medium">
                                            The pet owner has been notified with your contact info and location details. Thank you for keeping our community pets safe!
                                        </p>
                                    </div>
                                ) : (
                                    <form onSubmit={handleFinderSubmit} className="space-y-3 sm:space-y-3.5 text-xs">
                                        {finderError && (
                                            <div className="bg-red-50 text-red-600 rounded-xl p-2.5 sm:p-3 border border-red-100 text-[11px] font-bold">
                                                {finderError}
                                            </div>
                                        )}

                                        {/* Finder Name & Contact */}
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
                                            <div>
                                                <label className="block text-[10px] font-black uppercase text-gray-500 tracking-wider mb-1">
                                                    Your Name <span className="text-red-500">*</span>
                                                </label>
                                                <input
                                                    type="text"
                                                    required
                                                    value={finderName}
                                                    onChange={(e) => setFinderName(e.target.value)}
                                                    placeholder="e.g. Emmanuel Vito Cruz"
                                                    className="w-full px-3 py-2 sm:py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 focus:bg-white focus:outline-none focus:border-role transition-all"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-[10px] font-black uppercase text-gray-500 tracking-wider mb-1">
                                                    Your Phone / Contact <span className="text-red-500">*</span>
                                                </label>
                                                <input
                                                    type="tel"
                                                    required
                                                    value={finderContact}
                                                    onChange={(e) => setFinderContact(e.target.value)}
                                                    placeholder="e.g. 09171234567"
                                                    className="w-full px-3 py-2 sm:py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 focus:bg-white focus:outline-none focus:border-role transition-all"
                                                />
                                            </div>
                                        </div>

                                        {/* Capture Location Details Header & GPS / Pinpoint Map Buttons */}
                                        <div className="pt-2 border-t border-gray-100 space-y-2.5">
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                                <div>
                                                    <span className="text-[10px] font-black uppercase text-gray-600 tracking-wider block">Capture Location Details</span>
                                                    <span className="text-[10px] text-gray-400 font-medium">Share GPS, search address, or pinpoint directly on map</span>
                                                </div>

                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    <button
                                                        type="button"
                                                        onClick={handleDetectLocation}
                                                        disabled={isLocating || isGeocoding}
                                                        className="inline-flex items-center justify-center space-x-1 px-3 py-1.5 sm:py-2 bg-role hover:bg-role-hover active:scale-95 disabled:opacity-50 text-white rounded-xl text-xs font-extrabold shadow-xs transition-all cursor-pointer"
                                                        title="Use browser GPS location"
                                                    >
                                                        {isLocating ? (
                                                            <>
                                                                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                                </svg>
                                                                <span>Locating GPS...</span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <span>📍 Share GPS</span>
                                                            </>
                                                        )}
                                                    </button>

                                                    <button
                                                        type="button"
                                                        onClick={() => setShowPinpointMap(!showPinpointMap)}
                                                        className={`inline-flex items-center justify-center space-x-1 px-3 py-1.5 sm:py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer border shadow-xs ${
                                                            showPinpointMap
                                                                ? 'bg-role-soft border-role-border text-role-strong'
                                                                : 'bg-white hover:bg-gray-50 border-gray-200 text-gray-700'
                                                        }`}
                                                        title="Toggle interactive map to pinpoint location"
                                                    >
                                                        <span>🗺️ {showPinpointMap ? 'Hide Map' : 'Pinpoint Map'}</span>
                                                    </button>
                                                </div>
                                            </div>

                                            {/* GPS Helper / Insecure Context Notice */}
                                            {gpsNotice && (
                                                <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-2.5 text-[11px] font-semibold flex items-start gap-2 shadow-xs">
                                                    <span className="text-sm shrink-0">💡</span>
                                                    <div className="flex-1">
                                                        <span>{gpsNotice}</span>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => setGpsNotice(null)}
                                                        className="text-amber-500 hover:text-amber-800 font-black text-xs px-1"
                                                    >
                                                        ✕
                                                    </button>
                                                </div>
                                            )}

                                            {/* Manual Address Search */}
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    value={searchQuery}
                                                    onChange={(e) => setSearchQuery(e.target.value)}
                                                    placeholder="Search street, barangay, or landmark..."
                                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSearchAddress(); } }}
                                                    className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 focus:bg-white focus:outline-none focus:border-role transition-all"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => handleSearchAddress()}
                                                    disabled={isSearchingAddress || !searchQuery.trim()}
                                                    className="px-3.5 py-2 bg-gray-900 hover:bg-black disabled:opacity-40 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 shadow-xs"
                                                >
                                                    {isSearchingAddress ? 'Searching...' : 'Search'}
                                                </button>
                                            </div>

                                            {/* Interactive Map Pinpoint Section */}
                                            {(showPinpointMap || (lat !== null && lng !== null)) && (
                                                <div className="space-y-1.5 pt-1">
                                                    <div className="bg-role-soft/80 border border-role-border/80 rounded-xl px-3 py-2 text-[11px] font-bold text-role-strong flex justify-between items-center flex-wrap gap-1">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="inline-block w-2 h-2 rounded-full bg-role animate-pulse"></span>
                                                            <span>📍 Pinpoint: <span className="font-mono text-gray-800">{lat !== null && lng !== null ? `${lat.toFixed(6)}, ${lng.toFixed(6)}` : 'Click anywhere on map to pin'}</span></span>
                                                        </div>
                                                        {isGeocoding && <span className="text-[10px] font-black text-role-hover animate-pulse">Updating address...</span>}
                                                    </div>

                                                    <div className="h-64 sm:h-72 w-full rounded-2xl overflow-hidden border border-gray-200 relative shadow-inner z-0">
                                                        <MapContainer
                                                            center={[lat || SELERA_DEFAULT_CENTER[0], lng || SELERA_DEFAULT_CENTER[1]]}
                                                            zoom={16}
                                                            className="h-full w-full z-0"
                                                            style={{ height: '100%', width: '100%', minHeight: '256px' }}
                                                            scrollWheelZoom={true}
                                                        >
                                                            <InvalidateMapSize trigger={showPinpointMap} />
                                                            <TileLayer
                                                                attribution='&copy; OpenStreetMap'
                                                                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                                            />
                                                            <RecenterMap center={[lat || SELERA_DEFAULT_CENTER[0], lng || SELERA_DEFAULT_CENTER[1]]} />
                                                            <LocationPicker
                                                                position={lat !== null && lng !== null ? [lat, lng] : [SELERA_DEFAULT_CENTER[0], SELERA_DEFAULT_CENTER[1]]}
                                                                onLocationSelect={handleMapLocationChange}
                                                            />
                                                        </MapContainer>
                                                    </div>
                                                    <p className="text-[10.5px] text-gray-500 font-medium text-center">
                                                        👉 Click anywhere on the map or drag the pin to manually pinpoint the pet's location.
                                                    </p>
                                                </div>
                                            )}
                                        </div>

                                        {/* Address Fields */}
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-2.5">
                                            <div>
                                                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-0.5">
                                                    Street Address
                                                </label>
                                                <input
                                                    type="text"
                                                    value={streetAddress}
                                                    onChange={(e) => setStreetAddress(e.target.value)}
                                                    placeholder="e.g. McArthur Highway"
                                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 focus:bg-white focus:outline-none focus:border-role transition-all"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-0.5">
                                                    Barangay
                                                </label>
                                                <input
                                                    type="text"
                                                    value={barangay}
                                                    onChange={(e) => setBarangay(e.target.value)}
                                                    placeholder="e.g. San Vicente"
                                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 focus:bg-white focus:outline-none focus:border-role transition-all"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-0.5">
                                                    City
                                                </label>
                                                <input
                                                    type="text"
                                                    value={city}
                                                    onChange={(e) => setCity(e.target.value)}
                                                    placeholder="e.g. Santa Maria"
                                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 focus:bg-white focus:outline-none focus:border-role transition-all"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-0.5">
                                                    Nearby Landmark
                                                </label>
                                                <input
                                                    type="text"
                                                    value={landmark}
                                                    onChange={(e) => setLandmark(e.target.value)}
                                                    placeholder="e.g. near Selera Homes Clubhouse"
                                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 focus:bg-white focus:outline-none focus:border-role transition-all"
                                                />
                                            </div>
                                        </div>

                                        {/* Where is the pet currently? */}
                                        <div>
                                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-0.5">
                                                Where is the pet currently?
                                            </label>
                                            <select
                                                value={locationType}
                                                onChange={(e) => setLocationType(e.target.value)}
                                                className="w-full px-3 py-2 sm:py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 focus:bg-white focus:outline-none focus:border-role transition-all cursor-pointer"
                                            >
                                                <option value="Found Location">Found Location (Roaming / Sighted)</option>
                                                <option value="Barangay Hall">Barangay Hall</option>
                                                <option value="Temporary Shelter">Temporary Shelter</option>
                                            </select>
                                        </div>

                                        {/* Additional Notes / Finder Message */}
                                        <div>
                                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-0.5">
                                                Additional Notes / Finder Message
                                            </label>
                                            <textarea
                                                rows={2}
                                                value={finderNotes}
                                                onChange={(e) => setFinderNotes(e.target.value)}
                                                placeholder="Provide any helpful observations, pet condition, or instructions for the owner..."
                                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium text-gray-800 focus:bg-white focus:outline-none focus:border-role transition-all resize-none"
                                            />
                                        </div>

                                        {/* Submit Button */}
                                        <button
                                            type="submit"
                                            disabled={isSubmittingFinder}
                                            className="w-full py-2.5 sm:py-3 bg-gradient-to-r from-role to-role hover:from-role-hover hover:to-role-strong active:scale-98 text-white rounded-xl sm:rounded-2xl text-xs font-black uppercase tracking-wider shadow-md hover:shadow-lg transition-all flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
                                        >
                                            {isSubmittingFinder ? (
                                                <>
                                                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                    </svg>
                                                    <span>Sending Location Report...</span>
                                                </>
                                            ) : (
                                                <>
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                                    </svg>
                                                    <span>Send Location Report to Owner</span>
                                                </>
                                            )}
                                        </button>
                                    </form>
                                )}
                            </div>
                        </div>
                    )}

                </div>

                {/* Footer / Buttons */}
                <div className="px-3.5 py-2.5 sm:px-8 sm:py-6 bg-gray-50 border-t border-gray-100 flex gap-2 sm:gap-4 shrink-0 justify-end flex-wrap">
                    {pet ? (
                        <button
                            onClick={resetStates}
                            className="px-3.5 sm:px-6 py-2 sm:py-3.5 bg-role-muted hover:bg-role-border text-role-hover rounded-xl sm:rounded-2xl text-[11px] sm:text-xs font-extrabold tracking-wider uppercase transition-all flex items-center space-x-1.5 cursor-pointer"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 6H16" />
                            </svg>
                            <span>Scan Another</span>
                        </button>
                    ) : (
                        activeTab === 'camera' && cameraActive && (
                            <div className="flex gap-1.5 sm:gap-3">
                                {cameras.length > 1 && (
                                    <button
                                        onClick={handleSwitchCamera}
                                        className="px-2.5 sm:px-6 py-2 sm:py-3.5 bg-role-muted hover:bg-role-border text-role-hover rounded-xl sm:rounded-2xl text-[10px] sm:text-xs font-extrabold tracking-wider uppercase transition-all flex items-center space-x-1 sm:space-x-2 cursor-pointer"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                                        </svg>
                                        <span>Switch</span>
                                    </button>
                                )}
                                <button
                                    onClick={stopCamera}
                                    className="px-2.5 sm:px-6 py-2 sm:py-3.5 bg-gray-200 hover:bg-gray-300 text-gray-600 rounded-xl sm:rounded-2xl text-[10px] sm:text-xs font-extrabold tracking-wider uppercase transition-all cursor-pointer"
                                >
                                    Stop Camera
                                </button>
                            </div>
                        )
                    )}
                    <button
                        onClick={onClose}
                        className="px-4 sm:px-6 py-2 sm:py-3.5 bg-role hover:bg-role-hover text-[#FAFAF9] rounded-xl sm:rounded-2xl text-[11px] sm:text-xs font-extrabold tracking-wider uppercase shadow-md transition-all cursor-pointer border border-role/20"
                    >
                        Close
                    </button>
                </div>

            </div>

            {/* Injected styles for scanner layout and overlay issues */}
            <style>{`
                @keyframes scan {
                    0% { top: 15%; opacity: 0.3; }
                    50% { top: 85%; opacity: 1; }
                    100% { top: 15%; opacity: 0.3; }
                }
                
                /* Ensure html5-qrcode video viewport scales and fits the container perfectly */
                #qr-reader-viewport {
                    width: 100% !important;
                    height: 100% !important;
                    position: relative !important;
                    overflow: hidden !important;
                    border-radius: 1.25rem !important;
                }

                #qr-reader-viewport video {
                    width: 100% !important;
                    height: 100% !important;
                    object-fit: cover !important;
                    object-position: center !important;
                    border-radius: 1.25rem !important;
                }

                /* Hide any unwanted default controls injected by html5-qrcode */
                #qr-reader-viewport button {
                    display: none !important;
                }
                
                #qr-reader-viewport a {
                    display: none !important;
                }
            `}</style>
        </div>
    );

    return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};

export default QRScannerModal;
