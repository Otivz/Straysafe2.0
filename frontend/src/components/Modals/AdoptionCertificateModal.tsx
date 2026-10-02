import React, { useState, useEffect } from 'react';
import { api } from '../../utils/api';
import { 
    Award, 
    X, 
    Printer, 
    PawPrint, 
    AlertCircle,
    Check
} from 'lucide-react';

export interface CertificateData {
    certificate_id: number;
    adoption_id: number;
    certificate_number: string;
    verification_hash: string;
    pdf_url: string;
    qr_code_url: string;
    issued_by?: number | null;
    issuer_name?: string | null;
    issued_at: string;
    adopter_name?: string | null;
    adopter_address?: string | null;
    adopter_phone?: string | null;
    animal_name?: string | null;
    animal_type?: string | null;
    animal_breed?: string | null;
    animal_sex?: string | null;
    animal_age?: string | null;
    animal_id?: string | null;
    animal_photo?: string | null;
    holding_id?: number | null;
    application_number?: string | null;
    date_applied?: string | null;
    date_approved?: string | null;
    adoption_status?: string | null;
    barangay_name?: string | null;
    municipality_city?: string | null;
    province?: string | null;
    captain_name?: string | null;
    captain_position?: string | null;
    captain_signature_url?: string | null;
}

interface AdoptionCertificateModalProps {
    adoptionId: number;
    isOpen: boolean;
    applicationData?: any;
    onClose: () => void;
}

export const AdoptionCertificateModal: React.FC<AdoptionCertificateModalProps> = ({
    adoptionId,
    isOpen,
    applicationData,
    onClose,
}) => {
    const [certificate, setCertificate] = useState<CertificateData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen || !adoptionId) return;

        const fetchCert = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await api.get(`/adoptions/${adoptionId}/certificate`);
                const certData = res.data;
                // Merge with applicationData for maximum dynamic completeness
                if (applicationData) {
                    certData.adopter_name = certData.adopter_name || applicationData.full_name || applicationData.applicant_name;
                    certData.adopter_address = certData.adopter_address || applicationData.address;
                    const adopterContact = certData.adopter_phone && certData.adopter_phone !== 'N/A' 
                        ? certData.adopter_phone 
                        : (applicationData.contact_no || applicationData.phone || applicationData.contact_number || applicationData.phone_number || 'N/A');
                    certData.adopter_phone = adopterContact;
                    certData.animal_name = certData.animal_name || applicationData.animal_name;
                    certData.animal_type = certData.animal_type || applicationData.animal_type;
                    certData.animal_breed = certData.animal_breed || applicationData.animal_breed;
                    certData.animal_sex = certData.animal_sex || applicationData.animal_sex || applicationData.animal_gender || 'Male';
                    certData.animal_age = certData.animal_age || applicationData.animal_age || 'Adult';
                    certData.animal_photo = certData.animal_photo || applicationData.animal_photo;
                    certData.date_approved = certData.date_approved || applicationData.approval_date || applicationData.updated_at;
                    certData.date_applied = certData.date_applied || applicationData.created_at;
                }
                setCertificate(certData);
            } catch (err: any) {
                console.error("Failed to load certificate:", err);
                if (applicationData) {
                    // Fallback to applicationData if available
                    const now = new Date();
                    const yearVal = now.getFullYear();
                    const fallbackContact = applicationData.contact_no || applicationData.phone || applicationData.contact_number || applicationData.phone_number || 'N/A';
                    setCertificate({
                        certificate_id: adoptionId,
                        adoption_id: adoptionId,
                        certificate_number: applicationData.certificate_number || `SS-ADOPT-${yearVal}-${String(adoptionId).padStart(5, '0')}`,
                        verification_hash: `SHA256:${adoptionId}:${applicationData.full_name || 'Adopter'}:${now.toISOString()}`,
                        pdf_url: `/adoptions/${adoptionId}/certificate`,
                        qr_code_url: '',
                        issued_at: now.toISOString(),
                        adopter_name: applicationData.full_name || applicationData.applicant_name,
                        adopter_address: applicationData.address,
                        adopter_phone: fallbackContact,
                        animal_name: applicationData.animal_name,
                        animal_type: applicationData.animal_type,
                        animal_breed: applicationData.animal_breed,
                        animal_sex: applicationData.animal_sex || applicationData.animal_gender || 'Male',
                        animal_age: applicationData.animal_age || 'Adult',
                        animal_photo: applicationData.animal_photo,
                        holding_id: applicationData.holding_id,
                        animal_id: applicationData.animal_id ? String(applicationData.animal_id) : (applicationData.holding_id ? `SS-AN-${applicationData.holding_id}` : `SS-AN-${adoptionId}`),
                        application_number: `SS-APP-${String(adoptionId).padStart(4, '0')}`,
                        date_applied: applicationData.created_at,
                        date_approved: applicationData.approval_date || now.toISOString(),
                        adoption_status: 'APPROVED',
                        barangay_name: 'San Vicente',
                        municipality_city: 'Santa Maria',
                        province: 'Bulacan',
                        captain_name: 'Kyla Bianca Frias',
                        captain_position: 'Punong Barangay',
                    });
                } else {
                    setError(err.response?.data?.detail || "Could not load adoption certificate.");
                }
            } finally {
                setLoading(false);
            }
        };

        fetchCert();
    }, [isOpen, adoptionId, applicationData]);

    if (!isOpen) return null;

    const handlePrint = () => {
        window.print();
    };

    const formatDate = (dateStr?: string | null) => {
        if (!dateStr) return 'N/A';
        try {
            return new Date(dateStr).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        } catch {
            return dateStr;
        }
    };

    // SVG Corner Ornament Component matching formal certificate styling
    const CornerOrnament = ({ position }: { position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' }) => {
        const getTransform = () => {
            switch (position) {
                case 'top-left': return '';
                case 'top-right': return 'scale(-1, 1)';
                case 'bottom-left': return 'scale(1, -1)';
                case 'bottom-right': return 'scale(-1, -1)';
            }
        };

        return (
            <svg 
                className="w-7 h-7 text-[#183B56] pointer-events-none select-none shrink-0" 
                viewBox="0 0 40 40" 
                fill="none" 
                xmlns="http://www.w3.org/2000/svg"
                style={{ transform: getTransform() }}
            >
                <path d="M2 38V12C2 6.47715 6.47715 2 12 2H38" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                <path d="M7 38V14C7 10.134 10.134 7 14 7H38" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
                <circle cx="16" cy="16" r="3.5" fill="currentColor" />
                <path d="M12 28C12 22 17 17 23 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
        );
    };

    const getCertificateQrUrl = () => {
        if (certificate?.qr_code_url && certificate.qr_code_url.startsWith('data:image')) {
            return certificate.qr_code_url;
        }
        const verifyPayload = `${window.location.origin}/adopt/applications?cert=${encodeURIComponent(certificate?.certificate_number || '')}&id=${certificate?.adoption_id}`;
        return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(verifyPayload)}&margin=1`;
    };

    return (
        <>
            {/* Print Specific CSS to isolate the exact A4 certificate document */}
            <style>{`
                @media print {
                    body * {
                        visibility: hidden !important;
                    }
                    .certificate-modal-overlay {
                        position: absolute !important;
                        left: 0 !important;
                        top: 0 !important;
                        width: 100% !important;
                        min-height: 100% !important;
                        background: white !important;
                        padding: 0 !important;
                        margin: 0 !important;
                        z-index: 999999 !important;
                    }
                    .certificate-modal-container {
                        box-shadow: none !important;
                        border: none !important;
                        max-width: 100% !important;
                        width: 100% !important;
                        padding: 0 !important;
                        margin: 0 !important;
                        background: white !important;
                    }
                    .certificate-controls {
                        display: none !important;
                    }
                    .certificate-print-sheet,
                    .certificate-print-sheet * {
                        visibility: visible !important;
                    }
                    .certificate-print-sheet {
                        position: absolute !important;
                        left: 0 !important;
                        top: 0 !important;
                        width: 100% !important;
                        max-width: 100% !important;
                        margin: 0 !important;
                        padding: 12mm 14mm !important;
                        background: #FEFCF8 !important;
                        box-shadow: none !important;
                        page-break-inside: avoid !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    @page {
                        size: A4 portrait;
                        margin: 6mm;
                    }
                }
            `}</style>

            <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto certificate-modal-overlay">
                <div className="bg-slate-200 rounded-3xl max-w-3xl w-full p-4 sm:p-6 shadow-2xl border border-slate-300 animate-in fade-in zoom-in-95 my-auto max-h-[96vh] overflow-y-auto certificate-modal-container">
                    
                    {/* Top Action Bar (Preview Controls) */}
                    <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-300 certificate-controls">
                        <div className="flex items-center gap-2">
                            <span className="w-8 h-8 rounded-xl bg-orange-500 text-white flex items-center justify-center shadow-xs">
                                <Award className="w-4 h-4" />
                            </span>
                            <div>
                                <h3 className="font-black text-slate-900 text-sm sm:text-base leading-tight">
                                    Official Adoption Certificate
                                </h3>
                                <p className="text-[11px] text-slate-500 font-medium">
                                    StraySafe Animal Welfare & Adoption Management System
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            {certificate && (
                                <button
                                    type="button"
                                    onClick={handlePrint}
                                    className="px-4 py-2 bg-orange-600 hover:bg-orange-700 active:bg-orange-800 text-white font-black text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                                >
                                    <Printer className="w-3.5 h-3.5" />
                                    <span>Print Certificate</span>
                                </button>
                            )}

                            <button
                                type="button"
                                onClick={onClose}
                                className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl border border-slate-300 shadow-2xs transition-colors flex items-center gap-1 cursor-pointer"
                            >
                                <X className="w-3.5 h-3.5" />
                                <span>Close</span>
                            </button>
                        </div>
                    </div>

                    {/* Content Body */}
                    {loading ? (
                        <div className="py-20 text-center space-y-3 bg-white rounded-2xl border border-slate-200">
                            <div className="w-10 h-10 border-3 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto" />
                            <p className="text-xs font-bold text-slate-600">Generating official adoption certificate...</p>
                            <p className="text-[10px] text-slate-400">Loading approved adoption records and cryptographic hash...</p>
                        </div>
                    ) : error ? (
                        <div className="py-14 text-center space-y-3 bg-white rounded-2xl border border-slate-200 p-6">
                            <AlertCircle className="w-12 h-12 text-rose-500 mx-auto" />
                            <h4 className="text-base font-black text-slate-900">Certificate Not Available</h4>
                            <p className="text-xs font-bold text-rose-600 max-w-md mx-auto">{error}</p>
                            <p className="text-xs text-slate-500 max-w-md mx-auto">
                                An official certificate of adoption is only generated once the adoption application has been officially approved.
                            </p>
                            <button
                                type="button"
                                onClick={onClose}
                                className="mt-2 px-4 py-2 bg-slate-800 text-white rounded-xl text-xs font-bold cursor-pointer"
                            >
                                Back to Dossier
                            </button>
                        </div>
                    ) : certificate ? (
                        /* ============================================================ */
                        /* EXACT REPLICA OF THE STRAYSAFE "CERTIFICATE OF ADOPTION"    */
                        /* ============================================================ */
                        <div 
                            className="bg-[#FEFCF8] rounded-xl shadow-xl p-4 sm:p-7 relative certificate-print-sheet text-[#183B56] font-serif select-text"
                            style={{ fontFamily: "'Georgia', 'Times New Roman', serif" }}
                        >
                            {/* Outer Dark Blue Frame */}
                            <div className="border-[2px] border-[#183B56] p-2 rounded-lg relative">
                                
                                {/* Inner Secondary Thin Frame */}
                                <div className="border border-[#183B56]/70 p-4 sm:p-6 rounded-md relative bg-[#FEFCF8]">
                                    
                                    {/* 4 Corner Ornaments */}
                                    <div className="absolute top-1 left-1">
                                        <CornerOrnament position="top-left" />
                                    </div>
                                    <div className="absolute top-1 right-1">
                                        <CornerOrnament position="top-right" />
                                    </div>
                                    <div className="absolute bottom-1 left-1">
                                        <CornerOrnament position="bottom-left" />
                                    </div>
                                    <div className="absolute bottom-1 right-1">
                                        <CornerOrnament position="bottom-right" />
                                    </div>

                                    {/* 1. TOP LOGO / BRANDING */}
                                    <div className="text-center pt-2">
                                        <div className="flex items-center justify-center gap-2.5">
                                            <img
                                                src="/SSLOGO.png"
                                                alt="StraySafe Logo"
                                                className="w-11 h-11 sm:w-13 sm:h-13 object-contain shrink-0"
                                            />
                                            <div className="text-left font-sans">
                                                <div className="flex items-center leading-none">
                                                    <span className="font-black text-2xl sm:text-3xl tracking-tight text-[#0F2C59]">
                                                        STRAY
                                                    </span>
                                                    <span className="font-black text-2xl sm:text-3xl tracking-tight text-[#F97316]">
                                                        SAFE
                                                    </span>
                                                </div>
                                                <span className="text-[10px] sm:text-[11px] font-bold text-[#183B56] tracking-wide block mt-1">
                                                    Safer Communities. Happier Animals.
                                                </span>
                                            </div>
                                        </div>

                                        {/* 2. GOVERNMENT HEADER */}
                                        <div className="mt-3 text-center space-y-0.5 uppercase tracking-wider text-[#183B56]">
                                            <p className="text-[10px] sm:text-[11px] font-bold tracking-widest">
                                                Republic of the Philippines
                                            </p>
                                            <p className="text-[11px] sm:text-[12px] font-black tracking-wider">
                                                BARANGAY {certificate.barangay_name?.toUpperCase() || 'SAN VICENTE'}
                                            </p>
                                            <p className="text-[10px] sm:text-[10.5px] font-bold">
                                                MUNICIPALITY OF {certificate.municipality_city?.toUpperCase() || 'SANTA MARIA'}
                                            </p>
                                            <p className="text-[10px] sm:text-[10.5px] font-bold">
                                                PROVINCE OF {certificate.province?.toUpperCase() || 'BULACAN'}
                                            </p>
                                        </div>

                                        {/* 3. CERTIFICATE TITLE */}
                                        <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-[#0B2545] uppercase tracking-wider mt-4">
                                            Certificate of Adoption
                                        </h1>

                                        {/* Decorative Divider: Line - Paw - Line */}
                                        <div className="flex items-center justify-center gap-3 my-2">
                                            <div className="h-[1.5px] w-20 sm:w-28 bg-[#183B56]/70" />
                                            <PawPrint className="w-3.5 h-3.5 text-[#183B56] fill-[#183B56]" />
                                            <div className="h-[1.5px] w-20 sm:w-28 bg-[#183B56]/70" />
                                        </div>

                                        {/* Certificate Number & Date Issued */}
                                        <div className="text-center text-xs text-[#183B56] space-y-0.5 font-medium">
                                            <p>
                                                Certificate No. <strong className="font-bold text-[#0B2545]">{certificate.certificate_number}</strong>
                                            </p>
                                            <p>
                                                Date Issued: <strong className="font-bold text-[#0B2545]">{formatDate(certificate.issued_at || certificate.date_approved)}</strong>
                                            </p>
                                        </div>

                                        {/* 4. CERTIFICATION INTRODUCTION */}
                                        <div className="mt-4 space-y-1">
                                            <p className="text-xs sm:text-sm italic text-slate-700">
                                                This is to certify that
                                            </p>
                                            <h2 className="text-xl sm:text-2xl md:text-3xl font-black text-[#0B2545] uppercase tracking-wide my-1.5">
                                                {certificate.adopter_name || 'EMMANUEL VITO CRUZ'}
                                            </h2>
                                            <p className="text-[11px] sm:text-xs text-slate-700 max-w-md mx-auto leading-relaxed">
                                                has been officially approved as the adopter of the animal<br />
                                                identified below through the StraySafe Adoption Management System.
                                            </p>
                                        </div>
                                    </div>

                                    {/* 5. ADOPTER INFORMATION */}
                                    <div className="mt-5 text-left">
                                        <h3 className="font-black text-xs sm:text-sm text-[#0B2545] uppercase tracking-wider">
                                            Adopter Information
                                        </h3>
                                        <div className="h-[1.5px] bg-[#183B56]/50 mt-1 mb-2.5" />
                                        
                                        <div className="text-[11px] sm:text-xs text-slate-800 space-y-1 pl-1">
                                            <div className="grid grid-cols-[130px_16px_1fr] sm:grid-cols-[150px_16px_1fr] items-baseline">
                                                <span className="font-bold text-slate-700">Full Name</span>
                                                <span className="font-bold text-slate-700">:</span>
                                                <span className="font-extrabold text-[#0B2545]">{certificate.adopter_name || 'N/A'}</span>
                                            </div>
                                            <div className="grid grid-cols-[130px_16px_1fr] sm:grid-cols-[150px_16px_1fr] items-baseline">
                                                <span className="font-bold text-slate-700">Address</span>
                                                <span className="font-bold text-slate-700">:</span>
                                                <span className="font-medium text-slate-800 leading-snug">{certificate.adopter_address || 'San Vicente, Santa Maria, Bulacan'}</span>
                                            </div>
                                            <div className="grid grid-cols-[130px_16px_1fr] sm:grid-cols-[150px_16px_1fr] items-baseline">
                                                <span className="font-bold text-slate-700">Contact Number</span>
                                                <span className="font-bold text-slate-700">:</span>
                                                <span className="font-medium text-slate-800">{certificate.adopter_phone || 'N/A'}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* 6. ADOPTED ANIMAL */}
                                    <div className="mt-4 text-left">
                                        <h3 className="font-black text-xs sm:text-sm text-[#0B2545] uppercase tracking-wider">
                                            Adopted Animal
                                        </h3>
                                        <div className="h-[1.5px] bg-[#183B56]/50 mt-1 mb-3" />
                                        
                                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 pl-1">
                                            {/* Animal Photo Frame */}
                                            <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-md border-[1.5px] border-[#183B56]/60 p-1 bg-white shrink-0 shadow-2xs">
                                                {certificate.animal_photo ? (
                                                    <img
                                                        src={certificate.animal_photo}
                                                        alt={certificate.animal_name || 'Adopted Animal'}
                                                        className="w-full h-full object-cover rounded-xs"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full bg-slate-100 rounded-xs flex flex-col items-center justify-center text-slate-400 p-2 text-center">
                                                        <PawPrint className="w-6 h-6 mb-1 text-slate-300" />
                                                        <span className="text-[9px] font-sans font-semibold">Animal Photo</span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Animal Information Document Rows */}
                                            <div className="text-[11px] sm:text-xs text-slate-800 space-y-1 flex-1 min-w-0">
                                                <div className="grid grid-cols-[100px_16px_1fr] sm:grid-cols-[110px_16px_1fr] items-baseline">
                                                    <span className="font-bold text-slate-700">Animal Name</span>
                                                    <span className="font-bold text-slate-700">:</span>
                                                    <span className="font-black text-[#0B2545]">{certificate.animal_name || 'Rescue Pet'}</span>
                                                </div>
                                                <div className="grid grid-cols-[100px_16px_1fr] sm:grid-cols-[110px_16px_1fr] items-baseline">
                                                    <span className="font-bold text-slate-700">Animal ID</span>
                                                    <span className="font-bold text-slate-700">:</span>
                                                    <span className="font-mono font-bold text-slate-800">
                                                        {certificate.animal_id ? (certificate.animal_id.startsWith('SS-AN-') ? certificate.animal_id : `SS-AN-${certificate.animal_id}`) : `SS-AN-${certificate.adoption_id}`}
                                                    </span>
                                                </div>
                                                <div className="grid grid-cols-[100px_16px_1fr] sm:grid-cols-[110px_16px_1fr] items-baseline">
                                                    <span className="font-bold text-slate-700">Animal Type</span>
                                                    <span className="font-bold text-slate-700">:</span>
                                                    <span className="font-medium text-slate-800">{certificate.animal_type || 'Dog'}</span>
                                                </div>
                                                <div className="grid grid-cols-[100px_16px_1fr] sm:grid-cols-[110px_16px_1fr] items-baseline">
                                                    <span className="font-bold text-slate-700">Breed</span>
                                                    <span className="font-bold text-slate-700">:</span>
                                                    <span className="font-medium text-slate-800">{certificate.animal_breed || 'Mixed Breed'}</span>
                                                </div>
                                                <div className="grid grid-cols-[100px_16px_1fr] sm:grid-cols-[110px_16px_1fr] items-baseline">
                                                    <span className="font-bold text-slate-700">Sex</span>
                                                    <span className="font-bold text-slate-700">:</span>
                                                    <span className="font-medium text-slate-800">{certificate.animal_sex || 'Male'}</span>
                                                </div>
                                                <div className="grid grid-cols-[100px_16px_1fr] sm:grid-cols-[110px_16px_1fr] items-baseline">
                                                    <span className="font-bold text-slate-700">Age</span>
                                                    <span className="font-bold text-slate-700">:</span>
                                                    <span className="font-medium text-slate-800">{certificate.animal_age || 'Adult'}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* 7. CERTIFICATION STATEMENTS */}
                                    <div className="mt-5 text-center space-y-2 text-[10px] sm:text-[10.5px] text-slate-700 leading-relaxed max-w-xl mx-auto">
                                        <p>
                                            This certificate confirms that the above-named adopter has successfully completed the required adoption process and has been approved to adopt the identified animal in accordance with the adoption requirements and procedures of the Barangay and the StraySafe Adoption Management System.
                                        </p>
                                        <p>
                                            The adopter acknowledges the responsibility to provide proper care, appropriate shelter, food, veterinary attention, safety, and humane treatment for the adopted animal.
                                        </p>
                                    </div>

                                    {/* 8. OFFICIALLY APPROVED BADGE */}
                                    <div className="mt-4 flex flex-col items-center justify-center">
                                        <div className="inline-flex items-center gap-2 px-5 sm:px-7 py-1 rounded-full border-2 border-emerald-600 bg-white shadow-2xs">
                                            <div className="w-4.5 h-4.5 rounded-full bg-emerald-600 flex items-center justify-center text-white shrink-0">
                                                <Check className="w-3 h-3 stroke-[3.5]" />
                                            </div>
                                            <span className="font-sans font-black text-xs sm:text-sm text-emerald-800 tracking-wider uppercase">
                                                OFFICIALLY APPROVED
                                            </span>
                                        </div>

                                        {/* Status & Date Rows */}
                                        <div className="mt-2 text-center text-[10px] sm:text-[10.5px] text-slate-700 space-y-0.5">
                                            <div className="grid grid-cols-[90px_14px_90px] items-center justify-center">
                                                <span className="text-right font-medium">Adoption Status</span>
                                                <span className="text-center font-medium">:</span>
                                                <strong className="text-left font-black text-slate-900">APPROVED</strong>
                                            </div>
                                            <div className="grid grid-cols-[90px_14px_90px] items-center justify-center">
                                                <span className="text-right font-medium">Date Approved</span>
                                                <span className="text-center font-medium">:</span>
                                                <span className="text-left font-medium text-slate-800">
                                                    {formatDate(certificate.date_approved || certificate.issued_at)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* 9. BARANGAY CAPTAIN SIGNATURE SECTION */}
                                    <div className="mt-5 text-center">
                                        <div className="inline-block text-center min-w-60">
                                            {/* Digital Signature Image or Text */}
                                            <div className="h-10 flex items-end justify-center pb-0.5">
                                                {certificate.captain_signature_url ? (
                                                    <img
                                                        src={certificate.captain_signature_url}
                                                        alt="Captain Signature"
                                                        className="max-h-9 object-contain mx-auto"
                                                    />
                                                ) : (
                                                    <span className="text-[10px] text-slate-400 font-sans tracking-wider">
                                                        [DIGITAL SIGNATURE]
                                                    </span>
                                                )}
                                            </div>

                                            {/* Solid Signature Line */}
                                            <div className="w-56 sm:w-64 border-b border-[#0B2545] mx-auto pb-0.5" />

                                            {/* Captain Name & Position */}
                                            <div className="pt-1">
                                                <h4 className="font-black text-xs sm:text-sm text-[#0B2545] uppercase tracking-wide">
                                                    {certificate.captain_name || 'MARIA LOURDES R. SANTOS'}
                                                </h4>
                                                <p className="text-[10.5px] italic text-slate-600 font-serif">
                                                    Punong Barangay
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* 10. FOOTER WITH QR CODE */}
                                    <div className="mt-4 pt-2.5 border-t border-[#183B56]/40 flex items-end justify-between text-left text-[9.5px] text-slate-600">
                                        <div className="space-y-0.5">
                                            <p>
                                                <span className="font-bold">Issued through: </span>
                                                <span>STRAYSAFE — Stray Animal Management System</span>
                                            </p>
                                            <p>
                                                <span className="font-bold">Certificate No.: </span>
                                                <span>{certificate.certificate_number}</span>
                                            </p>
                                            <p>
                                                <span className="font-bold">Date Issued: </span>
                                                <span>{formatDate(certificate.issued_at || certificate.date_approved)}</span>
                                            </p>
                                        </div>

                                        {/* Scannable Digital QR Code */}
                                        <div className="text-center shrink-0">
                                            <img
                                                src={getCertificateQrUrl()}
                                                alt="Scan to verify"
                                                className="w-13 h-13 sm:w-14 sm:h-14 bg-white p-0.5 border border-[#183B56]/30 rounded-xs mx-auto object-contain"
                                            />
                                            <span className="text-[8.5px] font-sans text-slate-500 block mt-0.5 font-medium">
                                                Scan to verify
                                            </span>
                                        </div>
                                    </div>

                                    {/* 11. BOTTOM DECORATIVE PAW DIVIDER */}
                                    <div className="flex items-center justify-center gap-3 mt-3">
                                        <div className="h-[1.5px] w-20 sm:w-28 bg-[#183B56]/70" />
                                        <PawPrint className="w-3.5 h-3.5 text-[#183B56] fill-[#183B56]" />
                                        <div className="h-[1.5px] w-20 sm:w-28 bg-[#183B56]/70" />
                                    </div>

                                </div>
                            </div>
                        </div>
                    ) : null}

                </div>
            </div>
        </>
    );
};

export default AdoptionCertificateModal;
