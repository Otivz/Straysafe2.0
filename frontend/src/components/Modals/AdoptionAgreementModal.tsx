import React, { useState } from 'react';
import { api } from '../../utils/api';
import { 
    X, 
    CheckCircle2, 
    Heart, 
    PenTool, 
    AlertCircle
} from 'lucide-react';

interface AdoptionAgreementModalProps {
    adoptionId: number;
    animalName: string;
    applicantName: string;
    isOpen: boolean;
    onClose: () => void;
    onAgreementSigned: (certificate: any) => void;
}

export const AdoptionAgreementModal: React.FC<AdoptionAgreementModalProps> = ({
    adoptionId,
    animalName,
    applicantName,
    isOpen,
    onClose,
    onAgreementSigned,
}) => {
    const [typedSignature, setTypedSignature] = useState('');
    const [agreedTerms, setAgreedTerms] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!agreedTerms) {
            setError("You must acknowledge and agree to the adoption terms and conditions.");
            return;
        }
        if (!typedSignature.trim()) {
            setError("Please type your legal full name as your official digital signature.");
            return;
        }

        setSubmitting(true);
        setError(null);
        try {
            const res = await api.post(`/adoptions/${adoptionId}/agreement/sign`, {
                signature_data_url: `DIGITAL_SIG:${typedSignature.trim()}`,
                agreed_terms: true,
            });
            onAgreementSigned(res.data);
            onClose();
        } catch (err: any) {
            console.error("Failed to sign adoption agreement:", err);
            setError(err.response?.data?.detail || "Failed to sign agreement. Please try again.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
            <div className="bg-white dark:bg-[#151C2C] rounded-3xl max-w-xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 my-auto max-h-[90vh] overflow-y-auto">
                {/* Modal Header */}
                <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-2xl bg-role-muted dark:bg-role-strong/60 text-role-hover dark:text-role flex items-center justify-center">
                            <PenTool className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                                Stage 7: Digital Adoption Agreement
                            </h2>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                Official Deed of Commitment for {animalName || 'your adopted pet'}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={submitting}
                        className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {error && (
                    <div className="mt-4 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-800 dark:text-red-300 text-xs font-bold flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                        <span>{error}</span>
                    </div>
                )}

                {/* Agreement Terms Scrollbox */}
                <div className="mt-4 p-4 rounded-2xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 space-y-3 max-h-56 overflow-y-auto text-left">
                    <h4 className="font-black text-slate-900 dark:text-white uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                        <Heart className="w-3.5 h-3.5 text-role" />
                        Terms of Responsible Guardianship (RA 8485 / RA 10631)
                    </h4>
                    
                    <p className="leading-relaxed">
                        I, <strong>{applicantName}</strong>, hereby accept legal guardianship and responsibility for the care, welfare, and safety of <strong>{animalName}</strong> under the following conditions:
                    </p>

                    <ol className="list-decimal pl-5 space-y-2 leading-relaxed text-slate-600 dark:text-slate-400">
                        <li>
                            <strong>Humane Treatment:</strong> I agree to provide adequate food, clean water, clean shelter, and humane care. The animal shall not be subjected to physical abuse, neglect, or prolonged restrictive tethering/chaining.
                        </li>
                        <li>
                            <strong>Veterinary Care & Vaccination:</strong> I commit to keeping the animal's anti-rabies vaccination up to date pursuant to RA 9482 (Anti-Rabies Act) and seeking veterinary care whenever necessary.
                        </li>
                        <li>
                            <strong>30-Day Welfare Monitoring:</strong> I agree to submit required welfare check-ins with photo evidence on <strong>Day 7, Day 14, and Day 30</strong> following physical handover.
                        </li>
                        <li>
                            <strong>No Abandonment or Resale:</strong> I shall not sell, surrender to illegal trade, or abandon this animal. If I am no longer able to care for the pet, I will notify Barangay Animal Welfare Services immediately.
                        </li>
                        <li>
                            <strong>Barangay Rights of Inspection:</strong> Authorized Barangay Welfare Officers reserve the right to verify the animal's welfare during the 1-month monitoring period.
                        </li>
                    </ol>
                </div>

                {/* Signing Form */}
                <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                            Type Legal Full Name as Digital Signature <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={typedSignature}
                            onChange={(e) => setTypedSignature(e.target.value)}
                            placeholder={applicantName || "Your Full Name"}
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151C2C] text-slate-900 dark:text-white text-xs font-bold focus:border-role focus:outline-hidden"
                            required
                        />
                        <span className="text-[10px] text-slate-400 mt-1 block">
                            By typing your full name, you establish a legally binding digital signature under the E-Commerce Act of 2000 (RA 8792).
                        </span>
                    </div>

                    <label className="flex items-start gap-2.5 cursor-pointer text-xs text-slate-700 dark:text-slate-300">
                        <input
                            type="checkbox"
                            checked={agreedTerms}
                            onChange={(e) => setAgreedTerms(e.target.checked)}
                            className="mt-0.5 rounded border-slate-300 text-role-hover focus:ring-role w-4 h-4 cursor-pointer"
                        />
                        <span className="font-semibold leading-relaxed">
                            I solemnly swear that the information provided is true and correct, and I willingly accept full legal guardianship of this animal.
                        </span>
                    </label>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-2.5 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={submitting}
                            className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={submitting || !agreedTerms || !typedSignature.trim()}
                            className="px-5 py-2.5 bg-role hover:bg-role-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-xs rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer active:scale-95"
                        >
                            {submitting ? (
                                <>
                                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    <span>Generating Certificate...</span>
                                </>
                            ) : (
                                <>
                                    <CheckCircle2 className="w-4 h-4" />
                                    <span>Sign Agreement & Issue Certificate</span>
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AdoptionAgreementModal;
