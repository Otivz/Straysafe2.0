import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ExternalLink, PawPrint } from 'lucide-react';
import { api } from '../utils/api';
import { cloudinaryResized } from '../utils/cloudinaryImage';
import PetDetailPanel from './PetRecords/PetDetailPanel';
import { type PetRecord, mapRawPetToPetRecord } from './PetRecords/types';

// Shown instead of "Add Record" once the animal case is tied to a registered pet: the pet's photo and a short
// label, with the full name in the tooltip (never the pet's database id). Clicking it opens the pet's profile.
export default function CasePetBadge({ report, className = '' }: { report: any; className?: string }) {
    const own = report?.case_pet_id && report.case_pet_id === report.pet_id;
    const name: string = report?.case_pet_name || 'a registered pet';
    const photo: string | undefined = report?.case_pet_photo || undefined;
    const desc: string = report?.case_pet_description ? ` (${report.case_pet_description})` : '';
    const petId = report?.case_pet_id || report?.pet_id;
    const [pet, setPet] = useState<PetRecord | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const openProfile = async () => {
        if (!petId || loading) return;
        setLoading(true);
        setError('');
        try {
            const res = await api.get(`/pets/${petId}`);
            setPet(mapRawPetToPetRecord(res.data));
        } catch (e: any) {
            setError(e.response?.data?.detail || 'Could not open the pet profile.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <button
                type="button"
                onClick={openProfile}
                disabled={!petId || loading}
                title={`${own ? `This report is linked to ${name}${desc}.` : `This animal case is already identified as ${name}${desc}.`} Click to open the pet profile.`}
                className={`w-full py-2 px-3 border border-gray-700 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-xl text-[11px] font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-2xs cursor-pointer disabled:cursor-not-allowed disabled:opacity-80 transition-colors ${className}`}
            >
                {photo ? (
                    <img loading="lazy" decoding="async" src={cloudinaryResized(photo, 96)} alt="" className="w-6 h-6 rounded-full object-cover border border-emerald-400/70 shrink-0" />
                ) : (
                    <span className="w-6 h-6 rounded-full bg-gray-700 border border-emerald-400/70 flex items-center justify-center shrink-0">
                        <PawPrint className="w-3.5 h-3.5 text-emerald-300" />
                    </span>
                )}
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="truncate">{loading ? 'Opening…' : own ? 'Record Already Added' : 'Case Already Identified'}</span>
                {petId && !loading && (
                    <span className="ml-auto flex items-center gap-1 text-[9px] text-emerald-300 normal-case tracking-normal font-bold shrink-0">
                        View pet profile <ExternalLink className="w-3 h-3" />
                    </span>
                )}
            </button>
            {error && <p className="mt-1 text-[10px] font-semibold text-rose-600">{error}</p>}

            {pet && createPortal(
                <div className="fixed inset-0 z-[10000] flex items-center justify-center p-0 sm:p-6 md:p-10 bg-black/60 backdrop-blur-sm"
                    onClick={() => setPet(null)}>
                    <div className="w-full h-full sm:h-auto sm:max-h-[90vh] max-w-6xl rounded-none sm:rounded-[2.5rem] shadow-2xl bg-[#FAFAF9] overflow-hidden flex flex-col"
                        onClick={(e) => e.stopPropagation()}>
                        <PetDetailPanel pet={pet} onClose={() => setPet(null)} />
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
