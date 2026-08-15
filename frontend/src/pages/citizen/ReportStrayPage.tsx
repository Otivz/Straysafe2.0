import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
    Upload,
    Camera,
    X,
    Sparkles,
    CheckCircle2,
    ArrowLeft,
    ArrowRight,
    MapPin,
    Eye,
    Shield,
    Info,
    Loader2
} from 'lucide-react';
import ResiNavbar from '../../components/Navbars/ResiNavbar';
import ResiMobileNav from '../../components/Navbars/ResiMobileNav';
import { MapContainer, TileLayer, Marker, useMapEvents, Polygon, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIconRetina from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import ReturnToSeleraButton from '../../components/MapControls/ReturnToSeleraButton';

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

const SELERA_POLYGON = [
    { lat: 14.801496, lng: 121.005174 },
    { lat: 14.799577, lng: 121.003911 },
    { lat: 14.800634, lng: 121.002228 },
    { lat: 14.802461, lng: 121.003280 }
];

const LocationPicker = ({ onLocationSelect, position, disabled }: { onLocationSelect: (lat: number, lng: number) => void, position: [number, number], disabled?: boolean }) => {
    useMapEvents({
        click(e) {
            if (!disabled) {
                onLocationSelect(e.latlng.lat, e.latlng.lng);
            }
        },
    });

    return position ? <Marker position={position} /> : null;
};

const RecenterMap = ({ center }: { center: [number, number] }) => {
    const map = useMap();
    useEffect(() => {
        map.setView(center, map.getZoom());
    }, [center, map]);
    return null;
};

const steps = [
    { id: 1, title: 'Upload Media' },
    { id: 2, title: 'Report Category' },
    { id: 3, title: 'AI Analysis' },
    { id: 4, title: 'Animal Details' },
    { id: 5, title: 'Observed Condition' },
    { id: 6, title: 'Location' },
    { id: 7, title: 'Additional Info' },
    { id: 8, title: 'Visibility' },
    { id: 9, title: 'Review & Submit' }
];

export default function ReportStrayPage() {
    const navigate = useNavigate();
    const [currentStep, setCurrentStep] = useState(1);
    const [isAiProcessing, setIsAiProcessing] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isGeocoding, setIsGeocoding] = useState(false);
    const [resolvedAddress, setResolvedAddress] = useState('');
    const [declaration, setDeclaration] = useState(false);

    // Live Camera State
    const [isCameraOpen, setIsCameraOpen] = useState(false);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);

    const startCamera = async () => {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            document.getElementById('camera-file-input')?.click();
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: 'environment' } },
                audio: false
            });
            mediaStreamRef.current = stream;
            setIsCameraOpen(true);
        } catch (err) {
            console.warn('MediaDevices camera access failed/rejected, using native camera picker fallback:', err);
            document.getElementById('camera-file-input')?.click();
        }
    };

    const stopCamera = () => {
        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach(track => track.stop());
            mediaStreamRef.current = null;
        }
        setIsCameraOpen(false);
    };

    useEffect(() => {
        if (isCameraOpen && videoRef.current && mediaStreamRef.current) {
            videoRef.current.srcObject = mediaStreamRef.current;
            videoRef.current.play().catch(console.error);
        }
    }, [isCameraOpen]);

    const capturePhoto = () => {
        if (!videoRef.current) return;
        const video = videoRef.current;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
            if (!blob) return;
            const capturedFile = new File([blob], `stray_camera_${Date.now()}.jpg`, { type: 'image/jpeg' });
            setFormData(prev => ({
                ...prev,
                mediaFiles: [...prev.mediaFiles, capturedFile]
            }));
            stopCamera();
        }, 'image/jpeg', 0.92);
    };

    // Main Form State
    const [formData, setFormData] = useState({
        category: 'Injured Animal',
        category_id: 1,
        animalCount: 1,
        landmark: '',
        visibility: 'Public',
        priorityLevel: 'Medium',
        isPossibleOwned: false,
        animalType: 'Cat',
        animalBreed: 'Puspin',
        primaryColor: 'Black',
        secondaryColor: 'None',
        coatPattern: 'Solid',
        distinctiveMarkings: '',
        observedConditions: [] as string[],
        estimatedSize: 'Small',
        description: '',
        latitude: 14.801313,
        longitude: 121.003109,
        mediaFiles: [] as File[],
        collarDetected: false,
        qrTagDetected: false,
        visibleInjuryDetected: false
    });

    const [aiAnalysisResult, setAiAnalysisResult] = useState<{
        animalType: string;
        primaryColor: string;
        secondaryColor: string;
        coatPattern: string;
        estimatedSize: string;
        possibleBreed: string;
        collarDetected: boolean;
        qrTagDetected: boolean;
    } | null>(null);

    const userStr = localStorage.getItem('resident_user') || sessionStorage.getItem('resident_user');
    const currentUser = userStr ? JSON.parse(userStr) : null;
    const currentUserId = currentUser ? Number(currentUser.user_id || currentUser.id) : null;
    const currentSubdivisionId = currentUser ? Number(currentUser.subdivision_id || 1) : 1;

    // Auto Reverse Geocode Location
    useEffect(() => {
        const fetchAddress = async () => {
            setIsGeocoding(true);
            try {
                const response = await axios.get('https://nominatim.openstreetmap.org/reverse', {
                    params: {
                        format: 'jsonv2',
                        lat: formData.latitude,
                        lon: formData.longitude,
                        addressdetails: 1
                    },
                    headers: { 'Accept-Language': 'en' }
                });
                if (response.data && response.data.address) {
                    const addr = response.data.address;
                    const parts = [];
                    if (addr.road) parts.push(addr.road);
                    if (addr.suburb || addr.neighbourhood) parts.push(addr.suburb || addr.neighbourhood);
                    if (addr.city || addr.town) parts.push(addr.city || addr.town);
                    setResolvedAddress(parts.join(', ') || response.data.display_name);
                } else {
                    setResolvedAddress(`${formData.latitude.toFixed(6)}, ${formData.longitude.toFixed(6)}`);
                }
            } catch (err) {
                setResolvedAddress(`${formData.latitude.toFixed(6)}, ${formData.longitude.toFixed(6)}`);
            } finally {
                setIsGeocoding(false);
            }
        };

        const timer = setTimeout(() => {
            fetchAddress();
        }, 400);

        return () => clearTimeout(timer);
    }, [formData.latitude, formData.longitude]);

    // Handle Media Files Upload
    const handleFileChange = (files: FileList | null) => {
        if (!files) return;
        const newFiles = Array.from(files);
        setFormData(prev => ({
            ...prev,
            mediaFiles: [...prev.mediaFiles, ...newFiles]
        }));
    };

    const handleRemoveFile = (index: number) => {
        setFormData(prev => ({
            ...prev,
            mediaFiles: prev.mediaFiles.filter((_, i) => i !== index)
        }));
    };

    // Step 3 Real AI Processing via backend API
    const VALID_COAT_PATTERNS = ['Solid', 'Bicolor', 'Tricolor', 'Spotted', 'Striped', 'Patched', 'Brindle', 'Merle', 'Tabby', 'Calico', 'Tortoiseshell', 'Mixed', 'Unknown'];
    const VALID_PRIMARY_COLORS = ['Black', 'Brown', 'White', 'Gray', 'Tan', 'Golden', 'Cream', 'Orange', 'Mixed'];
    const VALID_SECONDARY_COLORS = ['None', 'Black', 'Brown', 'White', 'Gray', 'Tan', 'Golden', 'Cream', 'Orange'];

    const normalizeOption = (val: string, options: string[], defaultVal: string) => {
        if (!val) return defaultVal;
        const clean = val.trim();
        const found = options.find(o => o.toLowerCase() === clean.toLowerCase());
        if (found) return found;
        const partial = options.find(o => clean.toLowerCase().includes(o.toLowerCase()) || o.toLowerCase().includes(clean.toLowerCase()));
        return partial || defaultVal;
    };

    const triggerAiAnalysis = async () => {
        setIsAiProcessing(true);
        if (formData.mediaFiles && formData.mediaFiles.length > 0) {
            try {
                const mediaData = new FormData();
                mediaData.append("file", formData.mediaFiles[0]);
                const res = await axios.post('http://localhost:8000/reports/analyze-media', mediaData);
                if (res.status === 200 && res.data) {
                    const ai = res.data;
                    const normType = ['Dog', 'Cat'].includes(ai.animal_type) ? ai.animal_type : (ai.animal_type?.toLowerCase().includes('dog') ? 'Dog' : 'Cat');
                    const normPrimary = normalizeOption(ai.primary_color, VALID_PRIMARY_COLORS, 'Black');
                    const normSecondary = normalizeOption(ai.secondary_color, VALID_SECONDARY_COLORS, 'None');
                    const normPattern = normalizeOption(ai.coat_pattern, VALID_COAT_PATTERNS, 'Solid');
                    const normSize = ['Small', 'Medium', 'Large'].includes(ai.estimated_size) ? ai.estimated_size : 'Medium';

                    const resultObj = {
                        animalType: normType,
                        primaryColor: normPrimary,
                        secondaryColor: normSecondary,
                        coatPattern: normPattern,
                        estimatedSize: normSize,
                        possibleBreed: ai.possible_breed || 'Puspin',
                        collarDetected: Boolean(ai.collar_detected),
                        qrTagDetected: Boolean(ai.qr_tag_detected)
                    };
                    setAiAnalysisResult(resultObj);
                    setFormData(prev => ({
                        ...prev,
                        animalType: resultObj.animalType,
                        primaryColor: resultObj.primaryColor,
                        secondaryColor: resultObj.secondaryColor,
                        coatPattern: resultObj.coatPattern,
                        estimatedSize: resultObj.estimatedSize,
                        animalBreed: resultObj.possibleBreed,
                        collarDetected: resultObj.collarDetected,
                        qrTagDetected: resultObj.qrTagDetected
                    }));
                }
            } catch (err) {
                console.warn('AI media analysis error, using defaults:', err);
            }
        }
        setIsAiProcessing(false);
    };

    const handleNext = () => {
        if (currentStep === 1 && formData.mediaFiles.length === 0) {
            alert('Please upload at least one photo or video before proceeding.');
            return;
        }

        if (currentStep === 2) {
            triggerAiAnalysis();
        }

        if (currentStep === 5 && formData.observedConditions.length === 0) {
            alert('Please select at least one observed condition.');
            return;
        }

        if (currentStep < 9) {
            setCurrentStep(prev => prev + 1);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    const handleBack = () => {
        if (currentStep > 1) {
            setCurrentStep(prev => prev - 1);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            navigate('/resident-home');
        }
    };

    const handleGetUseCurrentLocation = () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    setFormData(prev => ({
                        ...prev,
                        latitude: pos.coords.latitude,
                        longitude: pos.coords.longitude
                    }));
                },
                (err) => {
                    alert('Could not retrieve GPS location: ' + err.message);
                }
            );
        } else {
            alert('Geolocation is not supported by your browser.');
        }
    };

    const handleSubmit = async () => {
        if (!declaration) {
            alert('Please confirm that the information provided is accurate by checking the declaration.');
            return;
        }

        setIsSubmitting(true);
        try {
            const compiledColor = formData.secondaryColor !== 'None'
                ? `${formData.primaryColor} and ${formData.secondaryColor}`
                : formData.primaryColor;

            const extraDetails = [
                formData.coatPattern !== 'Unknown' ? `Pattern: ${formData.coatPattern}` : null,
                formData.distinctiveMarkings ? `Markings: ${formData.distinctiveMarkings}` : null,
                formData.observedConditions.length > 0 ? `Observed Conditions: ${formData.observedConditions.join(', ')}` : null,
                formData.description ? `Notes: ${formData.description}` : null
            ].filter(Boolean).join(' | ');

            const payload = {
                user_id: currentUserId,
                subdivision_id: currentSubdivisionId,
                category_id: formData.category_id || 1,
                animal_type: formData.animalType,
                animal_breed: formData.animalBreed || 'Unknown',
                animal_color: compiledColor,
                estimated_size: formData.estimatedSize,
                description: extraDetails || 'No additional details provided.',
                latitude: formData.latitude,
                longitude: formData.longitude,
                animal_count: formData.animalCount,
                landmark: formData.landmark || '',
                priority_level: formData.priorityLevel,
                visibility: formData.visibility,
                is_possible_owned: formData.isPossibleOwned,
                status_id: 1,
                ai_animal_type: aiAnalysisResult?.animalType || formData.animalType,
                ai_dominant_color: aiAnalysisResult?.primaryColor || formData.primaryColor,
                ai_coat_pattern: aiAnalysisResult?.coatPattern || formData.coatPattern,
                ai_estimated_size: aiAnalysisResult?.estimatedSize || formData.estimatedSize,
                ai_possible_breed: aiAnalysisResult?.possibleBreed || formData.animalBreed || 'Unknown',
                ai_suggested_risk_level: 'Low Risk',
                ai_suggested_priority: formData.priorityLevel
            };

            const response = await axios.post('http://localhost:8000/reports/', payload);
            if (response.status === 200 || response.status === 201) {
                const actualReportId = response.data.report_id;
                if (actualReportId && formData.mediaFiles && formData.mediaFiles.length > 0) {
                    for (const file of formData.mediaFiles) {
                        const mediaData = new FormData();
                        mediaData.append("file", file);
                        mediaData.append("status_id", "1");
                        mediaData.append("is_evidence", "false");
                        try {
                            await axios.post(`http://localhost:8000/reports/${actualReportId}/media`, mediaData);
                        } catch (err: any) {
                            console.error('Media upload error:', err?.response?.data || err);
                        }
                    }
                }
                alert('Report submitted successfully to backend database!');
                navigate('/resident-home');
            }
        } catch (err: any) {
            console.error('Error submitting report:', err?.response?.data || err);
            const detailMsg = err?.response?.data?.detail 
                ? (typeof err.response.data.detail === 'string' ? err.response.data.detail : JSON.stringify(err.response.data.detail))
                : (err.message || 'Failed to submit report. Please try again.');
            alert(`Failed to submit report: ${detailMsg}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#F7F7F7] font-sans pb-28">
            <ResiNavbar />

            <main className="max-w-4xl mx-auto px-4 sm:px-6 pt-24 sm:pt-28">
                {/* Header Title */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <button
                            onClick={handleBack}
                            className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-gray-400 hover:text-[#F97316] transition-colors mb-2"
                        >
                            <ArrowLeft className="w-4 h-4" /> Back to Feed
                        </button>
                        <h1 className="text-2xl sm:text-3xl font-black text-[#1a1208] uppercase tracking-tight flex items-center gap-3">
                            <span>📝 STRAY-SAFE Report a Stray Animal</span>
                        </h1>
                    </div>
                    <span className="px-4 py-1.5 rounded-full bg-orange-100 text-[#F97316] text-xs font-black uppercase tracking-widest">
                        Step {currentStep} of 9
                    </span>
                </div>

                {/* Top Stepper Indicator */}
                <div className="mb-8 overflow-x-auto custom-scrollbar pb-2">
                    <div className="flex items-center min-w-max space-x-2 sm:space-x-3 bg-white p-3 rounded-3xl border border-gray-100 shadow-sm">
                        {steps.map((step) => {
                            const isActive = currentStep === step.id;
                            const isCompleted = currentStep > step.id;
                            return (
                                <div key={step.id} className="flex items-center gap-2">
                                    <button
                                        onClick={() => {
                                            if (step.id < currentStep) setCurrentStep(step.id);
                                        }}
                                        disabled={step.id > currentStep}
                                        className={`flex items-center gap-2 px-3.5 py-2 rounded-2xl text-xs font-black transition-all ${isActive
                                                ? 'bg-[#F97316] text-white shadow-md shadow-orange-100'
                                                : isCompleted
                                                    ? 'bg-orange-50 text-[#F97316] hover:bg-orange-100'
                                                    : 'bg-gray-50 text-gray-400 opacity-60'
                                            }`}
                                    >
                                        <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[10px]">
                                            {isCompleted ? '✓' : step.id}
                                        </span>
                                        <span className="uppercase tracking-wider text-[11px] whitespace-nowrap">{step.title}</span>
                                    </button>
                                    {step.id < steps.length && <div className="w-3 h-0.5 bg-gray-200" />}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Step Content Cards */}
                <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-xl overflow-hidden p-6 sm:p-10 mb-8 transition-all duration-300">

                    {/* STEP 1: Upload Media */}
                    {currentStep === 1 && (
                        <div className="space-y-6">
                            <div>
                                <h2 className="text-xl font-black text-[#1a1208] uppercase tracking-tight flex items-center gap-2">
                                    <span>Upload Photos or Videos</span>
                                    <span className="text-red-500 text-sm">*</span>
                                </h2>
                                <p className="text-xs font-bold text-gray-400 mt-1">
                                    Upload clear photos or videos of the stray animal. The AI will analyze the uploaded media to assist in identifying the animal.
                                </p>
                            </div>

                            {/* Alert Notice */}
                            <div className="flex items-center gap-3 p-4 bg-orange-50/60 border border-orange-100 rounded-2xl text-xs font-bold text-[#F97316]">
                                <Sparkles className="w-5 h-5 shrink-0" />
                                <span>AI analysis will begin automatically after media upload.</span>
                            </div>

                            {/* Drag & Drop Area */}
                            <div
                                onClick={() => document.getElementById('media-file-input')?.click()}
                                className="border-2 border-dashed border-gray-200 hover:border-orange-400 bg-[#FAFAF9] hover:bg-orange-50/20 rounded-[2rem] p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3"
                            >
                                <div className="w-14 h-14 rounded-2xl bg-white shadow-sm flex items-center justify-center text-[#F97316]">
                                    <Upload className="w-7 h-7" />
                                </div>
                                <div>
                                    <p className="text-xs font-black text-[#1a1208] uppercase tracking-wider">Drag & drop files here or click to browse</p>
                                    <p className="text-[10px] font-bold text-gray-400 mt-1">Supports PNG, JPG, JPEG, MP4 (Max 10MB per file)</p>
                                </div>
                            </div>

                            <div className="flex gap-4">
                                <button
                                    type="button"
                                    onClick={() => document.getElementById('media-file-input')?.click()}
                                    className="flex-1 py-3.5 px-4 bg-gray-100 hover:bg-gray-200 text-[#1a1208] rounded-2xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all"
                                >
                                    <Upload className="w-4 h-4" /> Upload Button
                                </button>
                                <button
                                    type="button"
                                    onClick={startCamera}
                                    className="flex-1 py-3.5 px-4 bg-orange-50 hover:bg-orange-100 text-[#F97316] rounded-2xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-sm active:scale-98"
                                >
                                    <Camera className="w-4 h-4" /> Camera Button
                                </button>
                            </div>

                            <input
                                id="media-file-input"
                                type="file"
                                accept="image/*,video/*"
                                multiple
                                className="hidden"
                                onChange={(e) => handleFileChange(e.target.files)}
                            />
                            <input
                                id="camera-file-input"
                                type="file"
                                accept="image/*"
                                capture="environment"
                                className="hidden"
                                onChange={(e) => handleFileChange(e.target.files)}
                            />

                            {/* Live Device Camera Modal Overlay */}
                            {isCameraOpen && (
                                <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4">
                                    <div className="relative w-full max-w-lg bg-black rounded-3xl overflow-hidden border border-white/20 shadow-2xl flex flex-col items-center">
                                        {/* Camera Viewfinder Header */}
                                        <div className="w-full flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent absolute top-0 z-10">
                                            <span className="text-white text-xs font-black uppercase tracking-wider flex items-center gap-2">
                                                <Camera className="w-4 h-4 text-[#F97316]" /> Live Camera
                                            </span>
                                            <button
                                                type="button"
                                                onClick={stopCamera}
                                                className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-all"
                                            >
                                                <X className="w-5 h-5" />
                                            </button>
                                        </div>

                                        {/* Live Video Feed */}
                                        <video
                                            ref={videoRef}
                                            playsInline
                                            muted
                                            className="w-full h-[65vh] object-cover bg-black"
                                        />

                                        {/* Shutter Capture Controls */}
                                        <div className="w-full p-6 bg-gradient-to-t from-black/90 to-transparent flex items-center justify-center">
                                            <button
                                                type="button"
                                                onClick={capturePhoto}
                                                className="w-16 h-16 rounded-full bg-white border-4 border-[#F97316] flex items-center justify-center shadow-lg active:scale-90 transition-all hover:scale-105"
                                                title="Take Photo"
                                            >
                                                <div className="w-11 h-11 rounded-full bg-[#F97316] flex items-center justify-center text-white">
                                                    <Camera className="w-6 h-6" />
                                                </div>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Previews */}
                            {formData.mediaFiles.length > 0 && (
                                <div className="space-y-3 pt-2">
                                    <p className="text-xs font-black text-gray-400 uppercase tracking-widest">
                                        Uploaded Files ({formData.mediaFiles.length})
                                    </p>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                        {formData.mediaFiles.map((file, idx) => (
                                            <div key={idx} className="relative aspect-square rounded-2xl overflow-hidden border-2 border-orange-200 group">
                                                {file.type.startsWith('video/') ? (
                                                    <video src={URL.createObjectURL(file)} className="w-full h-full object-cover" />
                                                ) : (
                                                    <img src={URL.createObjectURL(file)} className="w-full h-full object-cover" />
                                                )}
                                                <button
                                                    onClick={() => handleRemoveFile(idx)}
                                                    className="absolute top-2 right-2 bg-black/60 hover:bg-red-500 text-white rounded-full p-1.5 transition-colors"
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* STEP 2: Report Category */}
                    {currentStep === 2 && (
                        <div className="space-y-6">
                            <div>
                                <h2 className="text-xl font-black text-[#1a1208] uppercase tracking-tight flex items-center gap-2">
                                    <span>Why are you reporting this animal?</span>
                                    <span className="text-red-500 text-sm">*</span>
                                </h2>
                                <p className="text-xs font-bold text-gray-400 mt-1">Select the primary category that best describes the incident.</p>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {[
                                    'Injured Animal',
                                    'Sick Animal',
                                    'Aggressive Animal',
                                    'Possible Rabies Risk',
                                    'Roaming Animal',
                                    'Animal Needs Rescue',
                                    'Dead Animal',
                                    'Other'
                                ].map((cat, idx) => (
                                    <label
                                        key={cat}
                                        className={`p-4 rounded-2xl border-2 cursor-pointer flex items-center gap-3 transition-all ${formData.category === cat
                                                ? 'border-[#F97316] bg-orange-50/50 shadow-sm'
                                                : 'border-gray-100 bg-[#FAFAF9] hover:border-gray-200'
                                            }`}
                                    >
                                        <input
                                            type="radio"
                                            name="catRadio"
                                            value={cat}
                                            checked={formData.category === cat}
                                            onChange={() => setFormData(prev => ({ ...prev, category: cat, category_id: idx + 1 }))}
                                            className="accent-[#F97316] w-4 h-4"
                                        />
                                        <span className="text-xs font-black text-[#1a1208]">{cat}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* STEP 3: AI Analysis */}
                    {currentStep === 3 && (
                        <div className="space-y-6">
                            {isAiProcessing ? (
                                <div className="py-16 flex flex-col items-center justify-center gap-4 text-center">
                                    <Loader2 className="w-12 h-12 text-[#F97316] animate-spin" />
                                    <div>
                                        <h3 className="text-base font-black text-[#1a1208] uppercase tracking-wider">🤖 AI is analyzing your uploaded media...</h3>
                                        <p className="text-xs font-bold text-gray-400 mt-1">Extracting features, colors, breed likelihood, and collar metrics</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-6 animate-in fade-in duration-300">
                                    <div>
                                        <h2 className="text-xl font-black text-[#1a1208] uppercase tracking-tight flex items-center gap-2">
                                            <span>🤖 AI Suggestions</span>
                                        </h2>
                                        <p className="text-xs font-bold text-gray-400 mt-1">Review the AI animal analysis predictions generated from your media.</p>
                                    </div>

                                    {/* Alert Info */}
                                    <div className="flex items-start gap-3 p-4 bg-blue-50/80 border border-blue-100 rounded-2xl text-xs font-bold text-blue-700">
                                        <Info className="w-5 h-5 shrink-0 mt-0.5" />
                                        <span>AI suggestions are provided to assist reporting. Please review and correct any information before submitting.</span>
                                    </div>

                                    {/* Editable AI Suggestions Table */}
                                    <div className="p-6 bg-[#FAFAF9] border border-gray-100 rounded-3xl space-y-4">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div className="bg-white p-3.5 rounded-2xl border border-gray-100">
                                                <span className="text-[10px] font-black text-gray-400 block uppercase">Animal Type</span>
                                                <span className="text-xs font-black text-[#F97316]">{formData.animalType}</span>
                                            </div>
                                            <div className="bg-white p-3.5 rounded-2xl border border-gray-100">
                                                <span className="text-[10px] font-black text-gray-400 block uppercase">Animal Count</span>
                                                <span className="text-xs font-black text-[#F97316]">{formData.animalCount}</span>
                                            </div>
                                            <div className="bg-white p-3.5 rounded-2xl border border-gray-100">
                                                <span className="text-[10px] font-black text-gray-400 block uppercase">Estimated Size</span>
                                                <span className="text-xs font-black text-[#F97316]">{formData.estimatedSize}</span>
                                            </div>
                                            <div className="bg-white p-3.5 rounded-2xl border border-gray-100">
                                                <span className="text-[10px] font-black text-gray-400 block uppercase">Primary Color</span>
                                                <span className="text-xs font-black text-[#F97316]">{formData.primaryColor}</span>
                                            </div>
                                            <div className="bg-white p-3.5 rounded-2xl border border-gray-100">
                                                <span className="text-[10px] font-black text-gray-400 block uppercase">Secondary Color</span>
                                                <span className="text-xs font-black text-[#F97316]">{formData.secondaryColor}</span>
                                            </div>
                                            <div className="bg-white p-3.5 rounded-2xl border border-gray-100">
                                                <span className="text-[10px] font-black text-gray-400 block uppercase">Coat Pattern</span>
                                                <span className="text-xs font-black text-[#F97316]">{formData.coatPattern}</span>
                                            </div>
                                            <div className="bg-white p-3.5 rounded-2xl border border-gray-100">
                                                <span className="text-[10px] font-black text-gray-400 block uppercase">Possible Breed</span>
                                                <span className="text-xs font-black text-[#F97316]">{formData.animalBreed || 'Mixed Breed (61%)'}</span>
                                            </div>
                                            <div className="bg-white p-3.5 rounded-2xl border border-gray-100">
                                                <span className="text-[10px] font-black text-gray-400 block uppercase">Collar / QR Tag</span>
                                                <span className={`text-xs font-black ${formData.collarDetected || formData.qrTagDetected ? 'text-emerald-600' : 'text-gray-500'}`}>
                                                    {formData.qrTagDetected ? 'QR Tag Detected' : (formData.collarDetected ? 'Collar Detected' : 'None Detected')}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* STEP 4: Animal Details */}
                    {currentStep === 4 && (
                        <div className="space-y-6">
                            <div>
                                <h2 className="text-xl font-black text-[#1a1208] uppercase tracking-tight flex items-center gap-2">
                                    <span>Animal Details</span>
                                </h2>
                                <p className="text-xs font-bold text-gray-400 mt-1">Specify exact attributes for accurate record matching.</p>
                            </div>

                            {/* Animal Type */}
                            <div>
                                <label className="text-xs font-black text-[#1a1208] uppercase tracking-wider mb-2 block">Animal Type</label>
                                <div className="flex gap-4">
                                    {['Dog', 'Cat', 'Unknown'].map((t) => (
                                        <label key={t} className={`flex-1 p-3.5 rounded-2xl border-2 text-center cursor-pointer font-black text-xs transition-all ${formData.animalType === t ? 'border-[#F97316] bg-orange-50/40 text-[#F97316]' : 'border-gray-100 bg-[#FAFAF9]'}`}>
                                            <input type="radio" name="animalType" value={t} checked={formData.animalType === t} onChange={() => setFormData(prev => ({ ...prev, animalType: t }))} className="hidden" />
                                            {t}
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Animal Count */}
                            <div>
                                <label className="text-xs font-black text-[#1a1208] uppercase tracking-wider mb-2 block">Animal Count</label>
                                <input
                                    type="number"
                                    min={1}
                                    className="w-full h-12 bg-[#FAFAF9] border border-gray-100 rounded-2xl px-5 text-xs font-bold text-[#1a1208]"
                                    value={formData.animalCount}
                                    onChange={(e) => setFormData(prev => ({ ...prev, animalCount: parseInt(e.target.value) || 1 }))}
                                />
                            </div>

                            {/* Estimated Size */}
                            <div>
                                <label className="text-xs font-black text-[#1a1208] uppercase tracking-wider mb-2 block">Estimated Size</label>
                                <div className="grid grid-cols-4 gap-2">
                                    {['Small', 'Medium', 'Large', 'Unknown'].map((sz) => (
                                        <label key={sz} className={`p-3 rounded-2xl border-2 text-center cursor-pointer font-black text-xs transition-all ${formData.estimatedSize === sz ? 'border-[#F97316] bg-orange-50/40 text-[#F97316]' : 'border-gray-100 bg-[#FAFAF9]'}`}>
                                            <input type="radio" name="estimatedSize" value={sz} checked={formData.estimatedSize === sz} onChange={() => setFormData(prev => ({ ...prev, estimatedSize: sz }))} className="hidden" />
                                            {sz}
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Colors */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-black text-[#1a1208] uppercase tracking-wider mb-2 block">Primary Color</label>
                                    <select
                                        className="w-full h-12 bg-[#FAFAF9] border border-gray-100 rounded-2xl px-4 text-xs font-bold text-[#1a1208]"
                                        value={formData.primaryColor}
                                        onChange={(e) => setFormData(prev => ({ ...prev, primaryColor: e.target.value }))}
                                    >
                                        {['Black', 'Brown', 'White', 'Gray', 'Tan', 'Golden', 'Cream', 'Orange', 'Mixed'].map(c => (
                                            <option key={c} value={c}>{c}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-black text-[#1a1208] uppercase tracking-wider mb-2 block">Secondary Color</label>
                                    <select
                                        className="w-full h-12 bg-[#FAFAF9] border border-gray-100 rounded-2xl px-4 text-xs font-bold text-[#1a1208]"
                                        value={formData.secondaryColor}
                                        onChange={(e) => setFormData(prev => ({ ...prev, secondaryColor: e.target.value }))}
                                    >
                                        {['None', 'Black', 'Brown', 'White', 'Gray', 'Tan', 'Golden', 'Cream', 'Orange'].map(c => (
                                            <option key={c} value={c}>{c}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Pattern & Breed */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-black text-[#1a1208] uppercase tracking-wider mb-2 block">Coat Pattern</label>
                                    <select
                                        className="w-full h-12 bg-[#FAFAF9] border border-gray-100 rounded-2xl px-4 text-xs font-bold text-[#1a1208]"
                                        value={formData.coatPattern}
                                        onChange={(e) => setFormData(prev => ({ ...prev, coatPattern: e.target.value }))}
                                    >
                                        {VALID_COAT_PATTERNS.map(p => (
                                            <option key={p} value={p}>{p}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-black text-[#1a1208] uppercase tracking-wider mb-2 block">Possible Breed</label>
                                    <input
                                        type="text"
                                        className="w-full h-12 bg-[#FAFAF9] border border-gray-100 rounded-2xl px-4 text-xs font-bold text-[#1a1208]"
                                        placeholder="Default: Unknown"
                                        value={formData.animalBreed}
                                        onChange={(e) => setFormData(prev => ({ ...prev, animalBreed: e.target.value }))}
                                    />
                                </div>
                            </div>

                            {/* Distinctive Markings */}
                            <div>
                                <label className="text-xs font-black text-[#1a1208] uppercase tracking-wider mb-2 block">Distinctive Markings</label>
                                <textarea
                                    rows={3}
                                    className="w-full bg-[#FAFAF9] border border-gray-100 rounded-2xl p-4 text-xs font-medium text-[#1a1208] focus:outline-none focus:border-orange-300"
                                    placeholder="Example: White stripe on forehead, black left ear, curled tail, blue collar."
                                    value={formData.distinctiveMarkings}
                                    onChange={(e) => setFormData(prev => ({ ...prev, distinctiveMarkings: e.target.value }))}
                                />
                            </div>
                        </div>
                    )}

                    {/* STEP 5: Observed Condition */}
                    {currentStep === 5 && (
                        <div className="space-y-6">
                            <div>
                                <h2 className="text-xl font-black text-[#1a1208] uppercase tracking-tight flex items-center gap-2">
                                    <span>What did you observe?</span>
                                    <span className="text-red-500 text-sm">*</span>
                                </h2>
                                <p className="text-xs font-bold text-gray-400 mt-1">Select all conditions that apply to help responders prioritize dispatch.</p>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                {[
                                    'Injured', 'Bleeding', 'Limping', 'Weak',
                                    'Sick', 'Aggressive', 'Chasing People', 'Unable to Walk',
                                    'Crying', 'Pregnant', 'With Puppies/Kittens', 'Wearing Collar',
                                    'Wearing QR Tag', 'Dead', 'Trapped', 'Other'
                                ].map((cond) => {
                                    const isChecked = formData.observedConditions.includes(cond);
                                    return (
                                        <label
                                            key={cond}
                                            className={`p-3.5 rounded-2xl border-2 cursor-pointer flex items-center gap-3 transition-all ${isChecked ? 'border-[#F97316] bg-orange-50/50 shadow-sm' : 'border-gray-100 bg-[#FAFAF9]'}`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={isChecked}
                                                onChange={() => {
                                                    const updated = isChecked
                                                        ? formData.observedConditions.filter(c => c !== cond)
                                                        : [...formData.observedConditions, cond];
                                                    setFormData(prev => ({ ...prev, observedConditions: updated }));
                                                }}
                                                className="accent-[#F97316] w-4 h-4"
                                            />
                                            <span className="text-xs font-black text-[#1a1208]">{cond}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* STEP 6: Location */}
                    {currentStep === 6 && (
                        <div className="space-y-6">
                            <div>
                                <h2 className="text-xl font-black text-[#1a1208] uppercase tracking-tight flex items-center gap-2">
                                    <span>Location</span>
                                    <span className="text-red-500 text-sm">*</span>
                                </h2>
                                <p className="text-xs font-bold text-gray-400 mt-1">Confirm exact sighting position within the subdivision boundary.</p>
                            </div>

                            <div className="flex items-center justify-between p-4 bg-orange-50/50 border border-orange-100 rounded-2xl">
                                <div className="flex items-center gap-3">
                                    <MapPin className="w-5 h-5 text-[#F97316]" />
                                    <div>
                                        <span className="text-[10px] font-black text-gray-400 uppercase block">Current GPS Location</span>
                                        <span className="text-xs font-black text-[#F97316]">
                                            {formData.latitude.toFixed(6)}, {formData.longitude.toFixed(6)}
                                        </span>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleGetUseCurrentLocation}
                                    className="px-4 py-2 bg-[#F97316] text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-sm hover:scale-105 transition-all"
                                >
                                    Use Current Location
                                </button>
                            </div>

                            {/* Interactive Map */}
                            <div className="relative w-full h-64 rounded-3xl overflow-hidden border border-gray-100 shadow-inner">
                                <MapContainer
                                    center={[formData.latitude, formData.longitude]}
                                    zoom={17}
                                    className="h-full w-full"
                                    scrollWheelZoom={true}
                                >
                                    <TileLayer
                                        attribution='&copy; OpenStreetMap'
                                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                    />
                                    <RecenterMap center={[formData.latitude, formData.longitude]} />
                                    <LocationPicker
                                        position={[formData.latitude, formData.longitude]}
                                        onLocationSelect={(lat, lng) => setFormData(prev => ({ ...prev, latitude: lat, longitude: lng }))}
                                    />
                                    <Polygon
                                        positions={SELERA_POLYGON.map(p => [p.lat, p.lng] as [number, number])}
                                        pathOptions={{ color: '#F97316', fillColor: '#F97316', fillOpacity: 0.1, weight: 2, dashArray: '5, 10' }}
                                    />
                                    <ReturnToSeleraButton />
                                </MapContainer>
                            </div>

                            {/* Fields */}
                            <div>
                                <label className="text-xs font-black text-[#1a1208] uppercase tracking-wider mb-2 block">Street Address</label>
                                <input
                                    type="text"
                                    className="w-full h-12 bg-white border border-gray-200 rounded-2xl px-4 text-xs font-bold text-[#1a1208]"
                                    value={resolvedAddress || (isGeocoding ? 'Resolving street address...' : 'Selera Homes')}
                                    readOnly
                                />
                            </div>

                            <div>
                                <label className="text-xs font-black text-[#1a1208] uppercase tracking-wider mb-2 block">Landmark</label>
                                <input
                                    type="text"
                                    className="w-full h-12 bg-[#FAFAF9] border border-gray-100 rounded-2xl px-4 text-xs font-bold text-[#1a1208]"
                                    placeholder="Near Barangay Hall, beside basketball court, etc."
                                    value={formData.landmark}
                                    onChange={(e) => setFormData(prev => ({ ...prev, landmark: e.target.value }))}
                                />
                            </div>
                        </div>
                    )}

                    {/* STEP 7: Additional Information */}
                    {currentStep === 7 && (
                        <div className="space-y-6">
                            <div>
                                <h2 className="text-xl font-black text-[#1a1208] uppercase tracking-tight">Additional Information</h2>
                                <p className="text-xs font-bold text-gray-400 mt-1">Optional notes to assist field rescuers.</p>
                            </div>

                            <textarea
                                rows={5}
                                className="w-full bg-[#FAFAF9] border border-gray-100 rounded-3xl p-5 text-xs font-medium text-[#1a1208] focus:outline-none focus:border-orange-300 shadow-inner"
                                placeholder="Tell us anything else that may help rescuers..."
                                value={formData.description}
                                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                            />
                        </div>
                    )}

                    {/* STEP 8: Report Visibility */}
                    {currentStep === 8 && (
                        <div className="space-y-6">
                            <div>
                                <h2 className="text-xl font-black text-[#1a1208] uppercase tracking-tight">Report Visibility</h2>
                                <p className="text-xs font-bold text-gray-400 mt-1">Control who can view this sighting report in the subdivision feed.</p>
                            </div>

                            <div className="space-y-4">
                                <label className={`p-5 rounded-3xl border-2 flex items-center justify-between cursor-pointer transition-all ${formData.visibility === 'Public' ? 'border-[#F97316] bg-orange-50/50 shadow-sm' : 'border-gray-100 bg-[#FAFAF9]'}`}>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <Eye className="w-4 h-4 text-blue-500" />
                                            <span className="text-xs font-black text-[#1a1208]">Public</span>
                                        </div>
                                        <p className="text-[11px] font-semibold text-gray-400 mt-1">Visible to community members in the subdivision feed.</p>
                                    </div>
                                    <input type="radio" name="visibility" value="Public" checked={formData.visibility === 'Public'} onChange={() => setFormData(prev => ({ ...prev, visibility: 'Public' }))} className="accent-[#F97316] w-4 h-4" />
                                </label>

                                <label className={`p-5 rounded-3xl border-2 flex items-center justify-between cursor-pointer transition-all ${formData.visibility === 'Private' ? 'border-[#F97316] bg-orange-50/50 shadow-sm' : 'border-gray-100 bg-[#FAFAF9]'}`}>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <Shield className="w-4 h-4 text-amber-600" />
                                            <span className="text-xs font-black text-[#1a1208]">Private</span>
                                        </div>
                                        <p className="text-[11px] font-semibold text-gray-400 mt-1">Visible only to authorized personnel (Leaders, Barangay Staff, Admin).</p>
                                    </div>
                                    <input type="radio" name="visibility" value="Private" checked={formData.visibility === 'Private'} onChange={() => setFormData(prev => ({ ...prev, visibility: 'Private' }))} className="accent-[#F97316] w-4 h-4" />
                                </label>
                            </div>
                        </div>
                    )}

                    {/* STEP 9: Review & Submit */}
                    {currentStep === 9 && (
                        <div className="space-y-6">
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="px-3 py-0.5 rounded-full bg-orange-100 text-[#F97316] text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                                        <Sparkles className="w-3 h-3" /> AI-Assisted Sighting
                                    </span>
                                </div>
                                <h2 className="text-xl font-black text-[#1a1208] uppercase tracking-tight">Review & Submit Report</h2>
                                <p className="text-xs font-bold text-gray-400 mt-1">Double check all report details before sending to rescuers.</p>
                            </div>

                            {/* Summary Card */}
                            <div className="p-6 bg-[#FAFAF9] border border-gray-100 rounded-3xl space-y-4 text-xs font-bold text-[#1a1208]">
                                <div className="flex justify-between py-2 border-b border-gray-200">
                                    <span className="text-gray-400">Uploaded Media:</span>
                                    <span>{formData.mediaFiles.length} file(s) uploaded</span>
                                </div>
                                <div className="flex justify-between py-2 border-b border-gray-200">
                                    <span className="text-gray-400">Category:</span>
                                    <span className="text-[#F97316] font-black">{formData.category}</span>
                                </div>
                                <div className="flex justify-between py-2 border-b border-gray-200">
                                    <span className="text-gray-400">Animal Details:</span>
                                    <span>
                                        {formData.animalType}
                                        {formData.animalBreed && formData.animalBreed !== 'Unknown' ? ` - ${formData.animalBreed}` : ''}
                                        {` (${formData.estimatedSize}, ${formData.primaryColor}${formData.secondaryColor && formData.secondaryColor !== 'None' ? ` and ${formData.secondaryColor}` : ''})`}
                                    </span>
                                </div>
                                <div className="flex justify-between py-2 border-b border-gray-200">
                                    <span className="text-gray-400">Observed Conditions:</span>
                                    <span>{formData.observedConditions.join(', ') || 'None specified'}</span>
                                </div>
                                <div className="flex justify-between py-2 border-b border-gray-200">
                                    <span className="text-gray-400">Location:</span>
                                    <span>{formData.landmark || resolvedAddress || 'Selera Homes'}</span>
                                </div>
                                <div className="flex justify-between py-2 border-b border-gray-200">
                                    <span className="text-gray-400">Visibility:</span>
                                    <span>{formData.visibility}</span>
                                </div>
                            </div>

                            {/* Declaration Checkbox */}
                            <label className="flex items-center gap-3 p-4 bg-orange-50/50 border border-orange-100 rounded-2xl cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={declaration}
                                    onChange={(e) => setDeclaration(e.target.checked)}
                                    className="accent-[#F97316] w-4 h-4"
                                />
                                <span className="text-xs font-black text-[#1a1208]">
                                    I confirm that the information provided is accurate to the best of my knowledge.
                                </span>
                            </label>
                        </div>
                    )}
                </div>

                {/* Footer Navigation Buttons */}
                <div className="flex items-center justify-between">
                    <button
                        type="button"
                        onClick={handleBack}
                        className="px-6 py-4 bg-white border border-gray-100 hover:bg-gray-50 text-gray-700 font-black text-xs uppercase tracking-wider rounded-2xl transition-all shadow-sm flex items-center gap-2"
                    >
                        <ArrowLeft className="w-4 h-4" /> Back
                    </button>

                    {currentStep < 9 ? (
                        <button
                            type="button"
                            onClick={handleNext}
                            className="px-8 py-4 bg-[#F97316] hover:bg-orange-600 text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-lg shadow-orange-100 transition-all hover:scale-105 flex items-center gap-2"
                        >
                            Next <ArrowRight className="w-4 h-4" />
                        </button>
                    ) : (
                        <button
                            type="button"
                            disabled={isSubmitting}
                            onClick={handleSubmit}
                            className={`px-10 py-4 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl transition-all flex items-center gap-2 ${isSubmitting ? 'bg-gray-400 cursor-not-allowed' : 'bg-[#F97316] hover:scale-105'}`}
                        >
                            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                            {isSubmitting ? 'Submitting...' : 'Submit Report'}
                        </button>
                    )}
                </div>
            </main>

            <ResiMobileNav feedTab="reports" onFeedTabChange={() => { }} isNavbarMenuOpen={false} isSearchOpen={false} onSearchClick={() => { }} onAddReportClick={() => navigate('/resident/report/new')} />
        </div>
    );
}
