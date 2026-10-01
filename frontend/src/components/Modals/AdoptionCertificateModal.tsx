import React, { useState, useEffect } from 'react';
import { api } from '../../utils/api';
import { 
    Award, 
    X, 
    Printer, 
    ShieldCheck, 
    Calendar, 
    User, 
    PawPrint, 
    AlertCircle
} from 'lucide-react';

interface CertificateData {
    certificate_id: number;
    adoption_id: number;
    certificate_number: string;
    verification_hash: string;
    pdf_url: string;
    qr_code_url: string;
    issued_by?: number | null;
    issuer_name?: string | null;
    issued_at: string;
    animal_name?: string | null;
    adopter_name?: string | null;
    animal_breed?: string | null;
    animal_type?: string | null;
}

interface AdoptionCertificateModalProps {
    adoptionId: number;
    isOpen: boolean;
    onClose: () => void;
}

export const AdoptionCertificateModal: React.FC<AdoptionCertificateModalProps> = ({
    adoptionId,
    isOpen,
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
                setCertificate(res.data);
            } catch (err: any) {
                console.error("Failed to load certificate:", err);
                setError(err.response?.data?.detail || "Could not load adoption certificate.");
            } finally {
                setLoading(false);
            }
        };

        fetchCert();
    }, [isOpen, adoptionId]);

    if (!isOpen) return null;

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
            <div className="bg-white dark:bg-[#151C2C] rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 my-auto max-h-[90vh] overflow-y-auto">
                {/* Header Action Bar */}
                <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 flex items-center justify-center">
                            <Award className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                                Official Adoption Certificate
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                                    <ShieldCheck className="w-3 h-3" /> Verified
                                </span>
                            </h2>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                Republic Act 8485 & 10631 (Philippine Animal Welfare Act) Compliant
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {loading ? (
                    <div className="py-16 text-center space-y-3">
                        <div className="w-10 h-10 border-3 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto" />
                        <p className="text-xs font-bold text-slate-500">Retrieving official digital certificate & cryptographic verification hash...</p>
                    </div>
                ) : error ? (
                    <div className="py-12 text-center space-y-3">
                        <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
                        <p className="text-sm font-bold text-red-600 dark:text-red-400">{error}</p>
                        <p className="text-xs text-slate-500">Please make sure the adoption agreement has been signed by the adopter.</p>
                    </div>
                ) : certificate ? (
                    <div className="mt-6 space-y-6">
                        {/* Printable Certificate Frame */}
                        <div className="relative border-4 border-double border-amber-300 dark:border-amber-600/60 rounded-3xl p-6 sm:p-8 bg-gradient-to-b from-amber-50/40 via-white to-orange-50/20 dark:from-[#151C2C] dark:via-[#111624] dark:to-[#151C2C] text-center shadow-inner">
                            {/* Watermark Paw */}
                            <div className="absolute inset-0 flex items-center justify-center opacity-5 pointer-events-none select-none">
                                <PawPrint className="w-72 h-72 text-amber-900 dark:text-amber-100" />
                            </div>

                            {/* Header */}
                            <div className="space-y-1 relative z-10">
                                <span className="text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-400">
                                    BARANGAY ANIMAL CARE & ADOPTION SERVICES
                                </span>
                                <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight uppercase">
                                    Certificate of Adoption
                                </h1>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                    This certifies that the animal described below has been officially and legally adopted into a loving home.
                                </p>
                            </div>

                            {/* Adopter & Animal Info */}
                            <div className="my-6 py-4 border-y border-amber-200/80 dark:border-amber-800/60 grid grid-cols-1 sm:grid-cols-2 gap-4 text-left relative z-10">
                                <div className="space-y-1">
                                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                        Pet Information
                                    </span>
                                    <div className="font-black text-lg text-orange-600 dark:text-orange-400 flex items-center gap-1.5">
                                        <PawPrint className="w-4 h-4" />
                                        {certificate.animal_name || 'Adopted Pet'}
                                    </div>
                                    <p className="text-xs text-slate-600 dark:text-slate-300">
                                        {certificate.animal_type || 'Rescue Animal'} • {certificate.animal_breed || 'Mixed Breed'}
                                    </p>
                                </div>

                                <div className="space-y-1">
                                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                        Adoptive Parent / Guardian
                                    </span>
                                    <div className="font-black text-base text-slate-900 dark:text-white flex items-center gap-1.5">
                                        <User className="w-4 h-4 text-slate-400" />
                                        {certificate.adopter_name || 'Resident Adopter'}
                                    </div>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                                        <Calendar className="w-3.5 h-3.5" />
                                        Issued: {new Date(certificate.issued_at).toLocaleDateString(undefined, {
                                            year: 'numeric',
                                            month: 'long',
                                            day: 'numeric',
                                        })}
                                    </p>
                                </div>
                            </div>

                            {/* QR & Verification Box */}
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-white/90 dark:bg-[#0B0F19]/80 border border-slate-200 dark:border-slate-800 text-left relative z-10">
                                <div className="flex items-center gap-3">
                                    {certificate.qr_code_url && (
                                        <img
                                            src={certificate.qr_code_url}
                                            alt="Certificate QR Code"
                                            className="w-20 h-20 rounded-xl bg-white p-1 border border-slate-200 shrink-0 shadow-xs"
                                        />
                                    )}
                                    <div className="space-y-1 min-w-0">
                                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                                            Certificate Number:
                                        </span>
                                        <p className="font-mono text-xs font-black text-slate-900 dark:text-white break-all">
                                            {certificate.certificate_number}
                                        </p>
                                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block">
                                            Authorized by: {certificate.issuer_name || 'Barangay Head Officer'}
                                        </span>
                                    </div>
                                </div>

                                <div className="text-[10px] text-slate-400 max-w-xs text-right hidden sm:block">
                                    Scan QR code using any smartphone camera to verify certificate authenticity against Barangay records.
                                </div>
                            </div>

                            {/* SHA-256 Hash Integrity Badge */}
                            <div className="mt-3 pt-2 flex items-center justify-center gap-1.5 text-[9px] font-mono text-slate-400 dark:text-slate-500 truncate relative z-10">
                                <ShieldCheck className="w-3 h-3 text-emerald-500 shrink-0" />
                                <span>SHA-256: {certificate.verification_hash}</span>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center justify-end gap-3 pt-2">
                            <button
                                onClick={handlePrint}
                                className="px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-black text-xs rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer"
                            >
                                <Printer className="w-4 h-4" />
                                <span>Print / Save Certificate</span>
                            </button>
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
};

export default AdoptionCertificateModal;
