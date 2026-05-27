import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Html5Qrcode } from 'html5-qrcode';

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

    const qrScannerRef = useRef<Html5Qrcode | null>(null);
    const scannerId = 'qr-reader-viewport';

    // Cleanup camera stream on close or unmount
    useEffect(() => {
        if (!isOpen) {
            stopCamera();
            resetStates();
        } else {
            // Default to camera tab when opened
            setActiveTab('camera');
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
    };

    const startCamera = async () => {
        setError(null);
        setCameraActive(false);

        // Ensure scanner div exists
        setTimeout(async () => {
            try {
                // If scanner already initialized, stop it first
                if (qrScannerRef.current) {
                    await stopCamera();
                }

                const html5QrCode = new Html5Qrcode(scannerId);
                qrScannerRef.current = html5QrCode;

                await html5QrCode.start(
                    { facingMode: 'environment' },
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
                        // Verbose scanning logs (ignored to prevent console spam)
                    }
                );

                setCameraActive(true);
            } catch (err: any) {
                console.error('QR Scanner initialization failed:', err);
                setError('Failed to access camera. Please check permissions or upload an image instead.');
            }
        }, 150);
    };

    const stopCamera = async () => {
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

    // Extract ID from QR payload and fetch records
    const handleQRDecoded = async (text: string) => {
        let petId = null;

        // Try extracting numeric pet ID from various QR contents
        if (/^\d+$/.test(text.trim())) {
            // Plain integer ID
            petId = parseInt(text.trim(), 10);
        } else {
            try {
                // Try parsing JSON
                const parsed = JSON.parse(text);
                if (parsed && parsed.pet_id) {
                    petId = parseInt(parsed.pet_id, 10);
                }
            } catch {
                // Try matching numbers at the end of a URL or route
                const urlMatch = text.match(/pets\/(\d+)/i) || text.match(/:(\d+)$/);
                if (urlMatch) {
                    petId = parseInt(urlMatch[1], 10);
                }
            }
        }

        if (petId && !isNaN(petId)) {
            await stopCamera();
            fetchPetAndOwnerDetails(petId);
        } else {
            setError('Could not decode a valid Pet ID from this QR code. Please try another one.');
        }
    };

    const fetchPetAndOwnerDetails = async (id: number) => {
        setLoading(true);
        setError(null);
        setPet(null);
        setOwner(null);

        try {
            // 1. Fetch Pet Details
            const petRes = await axios.get(`http://localhost:8000/pets/${id}`);
            const petData = petRes.data;
            setPet(petData);

            // 2. Fetch Owner Details (linked to user_id)
            if (petData.owner_id) {
                try {
                    const ownerRes = await axios.get(`http://localhost:8000/users/${petData.owner_id}`);
                    setOwner(ownerRes.data);
                } catch (ownerErr) {
                    console.error('Error fetching pet owner details:', ownerErr);
                    // Still show pet information even if owner is not found
                    setError('Pet record found, but owner details could not be retrieved.');
                }
            }
        } catch (err: any) {
            console.error('Error fetching pet record:', err);
            setError(err.response?.status === 404 
                ? `No registered pet found with ID #${id}.` 
                : 'Error connecting to database. Please check backend status.');
        } finally {
            setLoading(false);
        }
    };

    // Handle drag & drop or image select scanning
    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setLoading(true);
        setError(null);
        resetStates();

        try {
            // Instantly create a temporary HTML5 QR Code instance to scan the static file
            const tempScanner = new Html5Qrcode('qr-upload-temp-container');
            const result = await tempScanner.scanFile(file, true);
            
            // Handle scanned text
            await handleQRDecoded(result);
        } catch (err) {
            console.error('QR File scanning failed:', err);
            setError('No QR code detected in this image. Make sure the QR is clear and centered.');
        } finally {
            setLoading(false);
        }
    };

    const handleManualSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const parsedId = parseInt(petIdInput.trim(), 10);
        if (isNaN(parsedId)) {
            setError('Please enter a valid numeric Pet ID.');
            return;
        }
        fetchPetAndOwnerDetails(parsedId);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-md animate-in fade-in duration-300 font-sans">
            
            {/* Temporary container hidden in viewport for handling static image scans */}
            <div id="qr-upload-temp-container" className="hidden" style={{ width: '1px', height: '1px' }}></div>

            <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden max-w-xl w-full max-h-[90vh] flex flex-col border border-gray-100 animate-in zoom-in-95 duration-300">
                
                {/* Header */}
                <div className="bg-gradient-to-r from-orange-500 to-[#F97316] text-white px-8 py-6 flex justify-between items-center relative overflow-hidden shrink-0">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-xl translate-x-8 -translate-y-8"></div>
                    
                    <div className="flex items-center space-x-3.5 z-10">
                        <div className="w-10 h-10 bg-white/20 rounded-2xl flex items-center justify-center text-white backdrop-blur-sm">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.125 13.5h.008v.008h-.008V13.5zM16.875 15.75h.008v.008h-.008v-.008zM14.625 18h.008v.008h-.008V18zM13.5 15.75h.008v.008H13.5v-.008zM15.75 13.5h.008v.008h-.008V13.5zM18 15.75h.008v.008H18v-.008zM18 18h.008v.008H18V18zM15.75 18h.008v.008h-.008V18zM13.5 13.5h.008v.008H13.5V13.5zM20.25 15.75h.008v.008h-.008v-.008zM20.25 18h.008v.008h-.008V18z" />
                            </svg>
                        </div>
                        <div>
                            <h3 className="text-xl font-extrabold tracking-tight">QR Collar Scanner</h3>
                            <p className="text-orange-100 text-xs font-medium">Verify registered pets & identify owners instantly</p>
                        </div>
                    </div>

                    <button 
                        onClick={onClose}
                        className="bg-white/10 hover:bg-white/20 text-white rounded-full p-2.5 transition-all z-10 cursor-pointer"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-6">
                    
                    {/* Active Scanning Mode tabs */}
                    {!pet && !loading && (
                        <div className="flex bg-gray-100 rounded-2xl p-1.5 shrink-0">
                            <button
                                onClick={() => setActiveTab('camera')}
                                className={`flex-1 py-3 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer ${activeTab === 'camera' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                            >
                                Live Camera
                            </button>
                            <button
                                onClick={() => setActiveTab('upload')}
                                className={`flex-1 py-3 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer ${activeTab === 'upload' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                            >
                                Upload Image
                            </button>
                            <button
                                onClick={() => setActiveTab('manual')}
                                className={`flex-1 py-3 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer ${activeTab === 'manual' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                            >
                                Manual ID
                            </button>
                        </div>
                    )}

                    {/* ERROR PANEL */}
                    {error && (
                        <div className="bg-red-50 text-red-600 rounded-2xl p-4 flex items-start space-x-3 border border-red-100 animate-in fade-in shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <p className="text-xs font-bold leading-relaxed">{error}</p>
                        </div>
                    )}

                    {/* SCANNING MODES PANELS */}
                    {!pet && !loading && (
                        <div className="flex-1 flex flex-col justify-center min-h-[300px]">
                            {/* CAMERA TAB */}
                            {activeTab === 'camera' && (
                                <div className="flex flex-col items-center justify-center space-y-4">
                                    <div className="w-full h-[320px] rounded-3xl bg-gray-50 border border-gray-100 shadow-inner overflow-hidden relative flex items-center justify-center">
                                        
                                        {/* Scanner Viewport Element */}
                                        <div id={scannerId} className="w-full h-full object-cover"></div>
                                        
                                        {/* Scanner Animation Overlays */}
                                        {cameraActive && (
                                            <>
                                                {/* Corner markers */}
                                                <div className="absolute inset-0 m-12 border-2 border-white/20 pointer-events-none rounded-2xl">
                                                    <div className="absolute -top-1 -left-1 w-8 h-8 border-t-4 border-l-4 border-[#F97316] rounded-tl-xl"></div>
                                                    <div className="absolute -top-1 -right-1 w-8 h-8 border-t-4 border-r-4 border-[#F97316] rounded-tr-xl"></div>
                                                    <div className="absolute -bottom-1 -left-1 w-8 h-8 border-b-4 border-l-4 border-[#F97316] rounded-bl-xl"></div>
                                                    <div className="absolute -bottom-1 -right-1 w-8 h-8 border-b-4 border-r-4 border-[#F97316] rounded-br-xl"></div>
                                                </div>
                                                {/* Laser animation */}
                                                <div className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-orange-500 to-transparent shadow-[0_0_15px_#F97316] animate-[scan_2.5s_infinite_ease-in-out]"></div>
                                            </>
                                        )}

                                        {!cameraActive && !error && (
                                            <div className="flex flex-col items-center space-y-3 z-10 text-gray-400">
                                                <svg className="w-12 h-12 animate-spin text-orange-500" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                </svg>
                                                <p className="text-xs font-bold">Activating Camera Stream...</p>
                                            </div>
                                        )}
                                    </div>
                                    <p className="text-center text-xs text-gray-400 font-medium">Position the collar's QR code within the target box</p>
                                </div>
                            )}

                            {/* UPLOAD TAB */}
                            {activeTab === 'upload' && (
                                <div className="flex flex-col items-center justify-center">
                                    <label className="w-full h-64 border-2 border-dashed border-gray-200 rounded-[2rem] flex flex-col items-center justify-center gap-4 cursor-pointer bg-gray-50 hover:bg-orange-50/20 hover:border-orange-300 transition-all group p-6">
                                        <input 
                                            type="file" 
                                            accept="image/*" 
                                            className="hidden" 
                                            onChange={handleImageUpload} 
                                        />
                                        <div className="w-14 h-14 rounded-2xl bg-white flex items-center justify-center text-gray-400 group-hover:text-orange-600 shadow-md transition-colors">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                            </svg>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-sm font-extrabold text-gray-700">Drop QR Image here</p>
                                            <p className="text-xs text-gray-400 font-bold mt-1">or click to browse from device</p>
                                        </div>
                                    </label>
                                </div>
                            )}

                            {/* MANUAL INPUT TAB */}
                            {activeTab === 'manual' && (
                                <form onSubmit={handleManualSubmit} className="space-y-5 px-4">
                                    <div className="space-y-2">
                                        <label className="text-xs font-extrabold text-gray-400 uppercase tracking-widest">Manually Enter Pet ID</label>
                                        <input
                                            type="text"
                                            value={petIdInput}
                                            onChange={(e) => setPetIdInput(e.target.value)}
                                            placeholder="Enter Pet Record ID (e.g. 1)"
                                            className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent focus:bg-white shadow-sm font-semibold transition-all"
                                        />
                                    </div>
                                    <button
                                        type="submit"
                                        className="w-full py-4 bg-[#F97316] text-white rounded-2xl text-sm font-extrabold shadow-md hover:bg-[#EA580C] hover:shadow-lg transition-all flex items-center justify-center space-x-2.5 cursor-pointer"
                                    >
                                        <span>Retrieve Pet Details</span>
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                        </svg>
                                    </button>
                                </form>
                            )}
                        </div>
                    )}

                    {/* LOADING STATE */}
                    {loading && (
                        <div className="flex-1 min-h-[300px] flex flex-col items-center justify-center space-y-4">
                            <svg className="w-14 h-14 animate-spin text-orange-500" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            <div className="text-center">
                                <p className="text-sm font-extrabold text-gray-800">Verifying Database Records...</p>
                                <p className="text-xs text-gray-400 font-bold mt-1">Retrieving registration and contact profiles</p>
                            </div>
                        </div>
                    )}

                    {/* RESULTS MODE PANEL */}
                    {pet && !loading && (
                        <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
                            
                            {/* Pet Core Detail Card */}
                            <div className="bg-gray-50 rounded-[2rem] p-6 border border-gray-100 flex flex-col sm:flex-row gap-6">
                                
                                {/* Photo */}
                                <div className="w-32 h-32 rounded-3xl bg-white border border-gray-200 shadow-sm overflow-hidden shrink-0 self-center flex items-center justify-center">
                                    {pet.photo_url ? (
                                        <img src={pet.photo_url} alt={pet.pet_name} className="w-full h-full object-cover" />
                                    ) : (
                                        <span className="text-4xl text-gray-300 font-black">🐾</span>
                                    )}
                                </div>

                                {/* Core fields */}
                                <div className="flex-1 flex flex-col justify-between">
                                    <div>
                                        <div className="flex items-center space-x-2">
                                            <h4 className="text-xl font-black text-gray-900">{pet.pet_name}</h4>
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase ${pet.pet_type.toLowerCase() === 'dog' ? 'bg-orange-50 text-orange-600' : 'bg-purple-50 text-purple-600'}`}>
                                                {pet.pet_type}
                                            </span>
                                        </div>
                                        <p className="text-xs text-gray-400 font-extrabold uppercase tracking-wider mt-1">{pet.breed || 'Unknown Breed'}</p>
                                        
                                        <div className="grid grid-cols-2 gap-3 mt-4 text-xs font-semibold text-gray-600">
                                            <div>
                                                <span className="text-[10px] font-extrabold text-gray-400 uppercase block tracking-wider">Gender</span>
                                                <span className="text-gray-800">{pet.gender || 'Unknown'}</span>
                                            </div>
                                            <div>
                                                <span className="text-[10px] font-extrabold text-gray-400 uppercase block tracking-wider">Estimated Age</span>
                                                <span className="text-gray-800">{pet.estimated_age || 'Not Registered'}</span>
                                            </div>
                                            <div>
                                                <span className="text-[10px] font-extrabold text-gray-400 uppercase block tracking-wider">Temperament</span>
                                                <span className={`text-gray-800 font-bold ${pet.temperament === 'Aggressive' ? 'text-red-500' : 'text-green-600'}`}>{pet.temperament || 'Friendly'}</span>
                                            </div>
                                            <div>
                                                <span className="text-[10px] font-extrabold text-gray-400 uppercase block tracking-wider">Neutered</span>
                                                <span className="text-gray-800">{pet.is_neutered ? 'Yes' : 'No'}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Health Alerts / Notes */}
                            <div className="bg-orange-50/50 rounded-2xl p-5 border border-orange-100/50 text-xs flex flex-col gap-2">
                                <div className="flex justify-between items-center">
                                    <div className="flex items-center space-x-1.5 font-bold text-orange-800 uppercase tracking-widest text-[10px]">
                                        <span>Medical Status</span>
                                    </div>
                                    <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider ${pet.is_vaccinated ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                                        {pet.is_vaccinated ? 'Fully Vaccinated' : 'Unvaccinated'}
                                    </span>
                                </div>
                                <p className="text-gray-600 font-medium leading-relaxed mt-1">
                                    <span className="font-extrabold text-gray-800">Health notes:</span> {pet.health_condition || 'No specific health issues declared.'}
                                </p>
                                {pet.notes && (
                                    <p className="text-gray-500 font-medium leading-relaxed italic border-t border-orange-200/40 pt-2 mt-1">
                                        "{pet.notes}"
                                    </p>
                                )}
                            </div>

                            {/* Linked Owner Card - HIGHEST VISUAL HIERARCHY */}
                            <div className="bg-[#1A4543] rounded-[2rem] p-6 text-white shadow-lg relative overflow-hidden">
                                <div className="absolute bottom-0 right-0 w-40 h-40 bg-white/5 rounded-full blur-2xl translate-x-12 translate-y-12"></div>
                                <div className="absolute top-0 left-0 w-24 h-24 bg-white/5 rounded-full blur-xl -translate-x-6 -translate-y-6"></div>
                                
                                <div className="flex justify-between items-start z-10 relative">
                                    <div>
                                        <span className="text-[9px] font-black text-teal-300 uppercase tracking-widest">Registered Owner Details</span>
                                        {owner ? (
                                            <>
                                                <h4 className="text-2xl font-black tracking-tight mt-1.5">{owner.name}</h4>
                                                <p className="text-teal-100/70 text-xs font-semibold mt-1">{owner.address || 'Subdivision Resident'}</p>
                                            </>
                                        ) : (
                                            <h4 className="text-xl font-black text-teal-100/60 tracking-tight mt-2">No Linked Owner Found</h4>
                                        )}
                                    </div>
                                    
                                    <div className="bg-white/10 rounded-2xl p-2.5 backdrop-blur-sm">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-teal-300" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                                        </svg>
                                    </div>
                                </div>

                                {owner && (
                                    <div className="grid grid-cols-2 gap-4 mt-6 pt-6 border-t border-white/10 z-10 relative text-xs">
                                        {owner.phone && (
                                            <a 
                                                href={`tel:${owner.phone}`} 
                                                className="flex items-center space-x-3 bg-white/5 hover:bg-white/10 p-3 rounded-2xl border border-white/5 transition-all text-white group"
                                            >
                                                <div className="w-8 h-8 rounded-xl bg-teal-300/10 flex items-center justify-center text-teal-300 group-hover:scale-105 transition-transform">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.94.725l.548 2.2a1 1 0 01-.321.988l-1.305.98a10.582 10.582 0 004.872 4.872l.98-1.305a1 1 0 01.988-.321l2.2.548a1 1 0 01.725.94V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                                    </svg>
                                                </div>
                                                <div>
                                                    <span className="text-[8px] font-black text-teal-300 uppercase block tracking-wider">Call Contact</span>
                                                    <span className="font-extrabold tracking-wide">{owner.phone}</span>
                                                </div>
                                            </a>
                                        )}
                                        <a 
                                            href={`mailto:${owner.email}`} 
                                            className="flex items-center space-x-3 bg-white/5 hover:bg-white/10 p-3 rounded-2xl border border-white/5 transition-all text-white group"
                                        >
                                            <div className="w-8 h-8 rounded-xl bg-teal-300/10 flex items-center justify-center text-teal-300 group-hover:scale-105 transition-transform">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                                </svg>
                                            </div>
                                            <div className="min-w-0">
                                                <span className="text-[8px] font-black text-teal-300 uppercase block tracking-wider">Send Email</span>
                                                <span className="font-extrabold tracking-wide block truncate">{owner.email}</span>
                                            </div>
                                        </a>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                </div>

                {/* Footer / Buttons */}
                <div className="px-8 py-6 bg-gray-50 border-t border-gray-100 flex gap-4 shrink-0 justify-end">
                    {pet ? (
                        <button
                            onClick={resetStates}
                            className="px-6 py-3.5 bg-orange-100 hover:bg-orange-200 text-orange-600 rounded-2xl text-xs font-extrabold tracking-wider uppercase transition-all flex items-center space-x-2 cursor-pointer"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 6H16" />
                            </svg>
                            <span>Scan Another</span>
                        </button>
                    ) : (
                        activeTab === 'camera' && cameraActive && (
                            <button
                                onClick={stopCamera}
                                className="px-6 py-3.5 bg-gray-200 hover:bg-gray-300 text-gray-600 rounded-2xl text-xs font-extrabold tracking-wider uppercase transition-all cursor-pointer"
                            >
                                Stop Camera
                            </button>
                        )
                    )}
                    <button
                        onClick={onClose}
                        className="px-6 py-3.5 bg-gray-900 hover:bg-black text-white rounded-2xl text-xs font-extrabold tracking-wider uppercase shadow-md transition-all cursor-pointer"
                    >
                        Close
                    </button>
                </div>

            </div>

            {/* Injected scan laser animation style block */}
            <style>{`
                @keyframes scan {
                    0% { top: 15%; opacity: 0.3; }
                    50% { top: 85%; opacity: 1; }
                    100% { top: 15%; opacity: 0.3; }
                }
            `}</style>
        </div>
    );
};

export default QRScannerModal;
