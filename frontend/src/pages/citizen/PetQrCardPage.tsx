import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { DEFAULT_PET_AVATAR, getPetPicture } from '../../utils/avatar';
import ResiNavbar from '../../components/Navbars/ResiNavbar';
import SubdNavbar from '../../components/Navbars/SubdNavbar';
import Button from '../../components/Button';

interface PetOwner {
    name: string;
    email: string;
    phone?: string | null;
}

interface PetDetails {
    pet_id: number;
    pet_name: string;
    pet_type: string;
    breed: string;
    gender: string;
    estimated_age: string;
    size_category?: string;
    photo_url: string;
    emergency_contact_name: string | null;
    emergency_contact_phone: string | null;
    owner: PetOwner | null;
}

interface QrDetails {
    qr_image_url: string;
    qr_token: string;
    is_active: boolean;
}

const PetQrCardPage = () => {
    const { petId } = useParams<{ petId: string }>();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const rawStaffUser = localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user');
    const rawAdminUser = localStorage.getItem('admin_user') || sessionStorage.getItem('admin_user');
    const rawResidentUser = localStorage.getItem('resident_user') || sessionStorage.getItem('resident_user');
    const currentUser = JSON.parse(rawStaffUser || rawAdminUser || rawResidentUser || 'null');

    const isSubdMode = searchParams.get('mode') === 'subd' || window.location.pathname.startsWith('/subd') || currentUser?.role_id === 2 || currentUser?.role_id === 3 || currentUser?.role_id === 4;

    const [pet, setPet] = useState<PetDetails | null>(null);
    const [qr, setQr] = useState<QrDetails | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);

    const backPath = isSubdMode ? '/subd/pet-records' : '/resident/pets';
    const scanHistoryPath = isSubdMode
        ? `/subd/pet/${petId}/scan-history`
        : `/resident/pet/${petId}/scan-history`;
    const loginPath = isSubdMode ? '/staff/login' : '/login';

    useEffect(() => {
        if (!currentUser) {
            navigate(loginPath);
            return;
        }
        fetchData();
    }, [petId]);

    const fetchData = async () => {
        try {
            setLoading(true);
            const petRes = await axios.get(`http://localhost:8000/pets/${petId}`);
            setPet(petRes.data);

            // Fetch active QR code
            try {
                const qrRes = await axios.get(`http://localhost:8000/pets/${petId}/qr`);
                setQr(qrRes.data);
            } catch (err) {
                console.error("Failed to fetch QR automatically:", err);
            }
        } catch (err) {
            console.error(err);
            setError("Failed to load pet registry records.");
        } finally {
            setLoading(false);
        }
    };

    const handleGenerateNew = async () => {
        if (!pet) return;
        if (window.confirm("Generating a new QR code will deactivate the old tag. Are you sure you want to proceed?")) {
            try {
                setIsGenerating(true);
                const res = await axios.post(`http://localhost:8000/pets/${pet.pet_id}/generate-qr`);
                setQr(res.data);
                alert("New QR Identification Tag generated successfully!");
            } catch (err) {
                console.error(err);
                alert("Failed to generate new QR Tag.");
            } finally {
                setIsGenerating(false);
            }
        }
    };

    const handleDownloadQr = () => {
        if (!qr || !qr.qr_image_url) return;
        
        // Fetch image and trigger browser download
        fetch(qr.qr_image_url)
            .then(response => response.blob())
            .then(blob => {
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `straysafe_qr_${pet?.pet_name || 'pet'}.png`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
            })
            .catch(err => {
                console.error("Failed to download image:", err);
                // Fallback to opening in new window
                window.open(qr.qr_image_url, '_blank');
            });
    };

    const handlePrint = () => {
        window.print();
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[#FAFAF9] dark:bg-[#121212] flex items-center justify-center">
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-[#F97316]/20 border-t-[#F97316] rounded-full animate-spin mb-4 mx-auto"></div>
                    <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest animate-pulse">Loading Smart Tag</span>
                </div>
            </div>
        );
    }

    if (!pet) {
        return (
            <div className="min-h-screen bg-[#FAFAF9] dark:bg-[#121212] flex items-center justify-center p-4">
                <div className="max-w-md w-full bg-white dark:bg-[#1E293B] rounded-3xl p-8 border border-gray-100 dark:border-gray-800 shadow-xl text-center">
                    <div className="w-16 h-16 bg-red-50 dark:bg-red-950/40 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <h3 className="text-xl font-black text-[#1a1208] dark:text-white uppercase">Retrieval Failed</h3>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-2">{error || "Pet not found."}</p>
                    <button 
                        onClick={() => navigate(backPath)}
                        className="mt-6 px-6 py-3.5 bg-[#1a1208] text-white text-xs font-black uppercase tracking-widest rounded-xl"
                    >
                        Back to Pets
                    </button>
                </div>
            </div>
        );
    }

    const emergencyName = pet.emergency_contact_name || pet.owner?.name || 'Registered Owner';
    const emergencyPhone = pet.emergency_contact_phone || pet.owner?.phone || 'No phone registered';

    return (
        <div className="min-h-screen bg-[#FAFAF9] dark:bg-[#121212] font-sans pb-24 transition-colors">
            {/* Styles for print mode */}
            <style dangerouslySetInnerHTML={{__html: `
                @media screen {
                    .print-only {
                        display: none !important;
                    }
                }
                @media print {
                    @page {
                        margin: 0.5in;
                        size: portrait;
                    }
                    *, *::before, *::after {
                        background: transparent !important;
                        background-color: transparent !important;
                        box-shadow: none !important;
                        text-shadow: none !important;
                        filter: none !important;
                    }
                    html, body, #root, div, main, section, .min-h-screen {
                        background: #ffffff !important;
                        background-color: #ffffff !important;
                        color: #000000 !important;
                        margin: 0 !important;
                        padding: 0 !important;
                    }
                    .no-print, .screen-only {
                        display: none !important;
                    }
                    .print-only {
                        display: flex !important;
                        flex-direction: column !important;
                        align-items: center !important;
                        justify-content: center !important;
                        margin: 50px auto 0 !important;
                        padding: 0 !important;
                        background: #ffffff !important;
                        background-color: #ffffff !important;
                        width: 100% !important;
                        max-width: 3.5in !important;
                        page-break-inside: avoid !important;
                    }
                    .print-qr-img {
                        width: 2.8in !important;
                        height: 2.8in !important;
                        max-width: 2.8in !important;
                        max-height: 2.8in !important;
                        display: block !important;
                        margin: 0 auto !important;
                        object-fit: contain !important;
                        background: #ffffff !important;
                    }
                }
            `}} />

            <div className="no-print">
                {isSubdMode ? <SubdNavbar /> : <ResiNavbar />}
            </div>

            <main className="max-w-4xl mx-auto p-4 sm:p-8 pt-24 sm:pt-32">
                {/* Header controls */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4 no-print">
                    <div>
                        <button 
                            onClick={() => navigate(backPath)}
                            className="text-xs font-black uppercase text-gray-400 hover:text-[#F97316] tracking-widest flex items-center gap-2 mb-2 transition-colors cursor-pointer"
                        >
                            ← {isSubdMode ? 'Back to Pet Records' : 'Back to Pet Records'}
                        </button>
                        <h1 className="text-3xl font-black text-[#1a1208] dark:text-white uppercase tracking-tighter">
                            Smart QR Code <span className="text-[#F97316]">Tag</span>
                        </h1>
                        {isSubdMode && (
                            <span className="inline-flex items-center gap-1.5 mt-1 px-2.5 py-1 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 text-[9px] font-black uppercase tracking-widest rounded-full">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                Subd Leader View
                            </span>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-3 w-full sm:w-auto items-center">
                        {/* Only pet owners can regenerate QR — hidden for subd leaders */}
                        {!isSubdMode && (
                            <Button 
                                variant="light"
                                onClick={handleGenerateNew}
                                disabled={isGenerating}
                                className="flex-1 sm:flex-initial bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 text-gray-800 dark:text-gray-100 hover:text-gray-900 px-5 py-3 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-gray-50 dark:hover:bg-slate-700 shadow-sm transition-all cursor-pointer"
                            >
                                {isGenerating ? "Regenerating..." : "Regenerate QR"}
                            </Button>
                        )}
                        <Button 
                            variant="primary"
                            onClick={handlePrint}
                            className="flex-1 sm:flex-initial bg-[#F97316] text-white px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest shadow-md hover:bg-orange-600 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                            </svg>
                            Print QR Code
                        </Button>
                    </div>
                </div>

                {/* Main Card View */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {/* The Display Tag Column */}
                    <div className="md:col-span-2 flex justify-center items-start">
                        {/* SCREEN-ONLY FULL ID BADGE (Only remains on screen) */}
                        <div id="printable-card" className="screen-only tag-card bg-white dark:bg-[#1E293B] w-full max-w-sm rounded-[2.5rem] border border-gray-100 dark:border-gray-800 shadow-2xl p-8 text-center flex flex-col justify-between relative overflow-hidden transition-colors">
                            {/* Accent line */}
                            <div className="absolute top-0 left-0 right-0 h-3 bg-gradient-to-r from-orange-400 to-[#F97316]" />
                            
                            {/* Card Header */}
                            <div className="flex justify-between items-center mb-6 pt-2">
                                <div className="text-left">
                                    <span className="text-[10px] font-black text-[#F97316] uppercase tracking-[0.2em] block">STRAY-SAFE</span>
                                    <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest block">Community Recovery Tag</span>
                                </div>
                                <span className="text-[10px] font-black px-2.5 py-1 bg-green-50 dark:bg-green-950/40 text-green-600 dark:text-green-400 border border-green-100 dark:border-green-800 rounded-full uppercase tracking-widest">
                                    Active ID
                                </span>
                            </div>

                            {/* Pet Avatar in Circle */}
                            <div className="w-32 h-32 mx-auto rounded-full overflow-hidden border-4 border-orange-50 dark:border-slate-700 shadow-md mb-4 bg-gray-50 dark:bg-slate-800">
                                <img 
                                    src={getPetPicture(pet.photo_url)} 
                                    alt={pet.pet_name} 
                                    className="w-full h-full object-cover" 
                                    onError={(e) => { e.currentTarget.src = DEFAULT_PET_AVATAR; }}
                                />
                            </div>

                            {/* Pet details */}
                            <div className="space-y-1 mb-6">
                                <h2 className="text-3xl font-black text-[#1a1208] dark:text-white uppercase tracking-tight">{pet.pet_name}</h2>
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                    {pet.breed || pet.pet_type} • {pet.gender} • {pet.estimated_age} • {pet.size_category || 'Medium'}
                                </p>
                            </div>

                            {/* Real QR Code Container (Always clean white for maximum scan contrast) */}
                            <div className="w-48 h-48 mx-auto bg-white border-2 border-dashed border-[#F97316]/30 rounded-[2rem] p-4 flex items-center justify-center relative mb-6 shadow-inner group">
                                {qr?.qr_image_url ? (
                                    <img src={qr.qr_image_url} alt="QR Recovery Code" className="w-full h-full object-contain" />
                                ) : (
                                    <div className="text-center">
                                        <div className="w-8 h-8 border-2 border-[#F97316]/20 border-t-[#F97316] rounded-full animate-spin mx-auto mb-2"></div>
                                        <span className="text-[8px] font-bold text-gray-400 uppercase">Generating</span>
                                    </div>
                                )}
                            </div>

                            {/* Emergency Contact & Message (High contrast in both Light and Dark mode) */}
                            <div className="bg-orange-50 dark:bg-slate-800/90 rounded-2xl p-4 border border-orange-200/70 dark:border-slate-700 space-y-1.5 mb-4 text-center transition-colors">
                                <span className="text-[9px] font-black text-[#F97316] dark:text-orange-400 uppercase tracking-widest block">
                                    Emergency Contact
                                </span>
                                <span className="text-sm font-black text-gray-900 dark:text-white block uppercase tracking-tight">
                                    {emergencyName}
                                </span>
                                <span className="text-sm sm:text-base font-black text-gray-900 dark:text-amber-300 block font-mono tracking-wider">
                                    {emergencyPhone}
                                </span>
                            </div>

                            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">
                                Scan QR code to report pet found & view health info
                            </p>
                        </div>

                        {/* PRINT-ONLY TARGET: ONLY THE QR CODE IS PRINTED (Pure white background, no card/photo/page background) */}
                        <div id="print-qr-target" className="print-only">
                            <div className="text-center p-4 bg-white flex flex-col items-center justify-center">
                                {/* Scannable High-Contrast QR Code */}
                                <div className="w-[2.8in] h-[2.8in] p-2 bg-white flex items-center justify-center mx-auto mb-2">
                                    {qr?.qr_image_url ? (
                                        <img 
                                            src={qr.qr_image_url} 
                                            alt="Pet Recovery QR Code" 
                                            className="print-qr-img" 
                                        />
                                    ) : (
                                        <p>No QR Code Available</p>
                                    )}
                                </div>

                                {/* Pet Name & ID Reference */}
                                <h2 className="text-2xl font-black uppercase tracking-tight mb-0.5" style={{ color: '#000000', fontSize: '18pt' }}>
                                    {pet.pet_name}
                                </h2>
                                <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: '#444444', fontSize: '9pt' }}>
                                    StraySafe Community Recovery QR • Pet #{pet.pet_id}
                                </p>

                                {/* Emergency Contact Phone Number */}
                                {emergencyPhone && emergencyPhone !== 'No phone registered' && (
                                    <div className="border border-black px-4 py-1.5 rounded-lg text-center mt-1 inline-block" style={{ borderColor: '#000000' }}>
                                        <span className="text-[9px] font-black uppercase tracking-wider block" style={{ color: '#000000' }}>
                                            IF FOUND, PLEASE CALL:
                                        </span>
                                        <span className="text-sm font-black tracking-wider block" style={{ color: '#000000' }}>
                                            {emergencyPhone}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Download & Instructions Column */}
                    <div className="bg-white dark:bg-[#1E293B] rounded-[2.5rem] border border-gray-100 dark:border-gray-800 shadow-xl p-8 space-y-6 no-print transition-colors">
                        <h3 className="text-lg font-black text-[#1a1208] dark:text-white uppercase tracking-tight">Tag Management</h3>
                        <p className="text-xs font-semibold text-gray-400 leading-relaxed">
                            This tag should be attached to {pet.pet_name}'s collar. If your pet goes missing, anyone scanning this tag can contact you directly and transmit their location.
                        </p>
                        
                        <div className="border-t border-gray-50 dark:border-gray-800 pt-6 space-y-4">
                            <button
                                onClick={handleDownloadQr}
                                disabled={!qr?.qr_image_url}
                                className="w-full py-4 bg-orange-50 dark:bg-orange-950/40 hover:bg-orange-100 dark:hover:bg-orange-900/60 text-[#F97316] dark:text-orange-400 rounded-2xl text-xs font-black uppercase tracking-widest transition-all hover:scale-[1.02] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                Download QR Image
                            </button>
                            <button
                                onClick={() => navigate(scanHistoryPath)}
                                className="w-full py-4 bg-gray-50 dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-200 rounded-2xl text-xs font-black uppercase tracking-widest transition-all hover:scale-[1.02] flex items-center justify-center gap-2 border border-gray-200 dark:border-gray-700 cursor-pointer"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                                </svg>
                                View Scan History
                            </button>
                        </div>

                        <div className="bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40 rounded-2xl p-4 space-y-1">
                            <span className="text-[9px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest block">Printing Tips</span>
                            <p className="text-[10px] font-semibold text-amber-800 dark:text-amber-300/80 leading-normal">
                                Clicking <strong>Print QR Code</strong> will print strictly the QR code and emergency contact on a clean white sheet with zero background ink waste.
                            </p>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default PetQrCardPage;
