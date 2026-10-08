import { Check, PawPrint } from 'lucide-react';

// Shown instead of "Add Record" once the animal case is tied to a registered pet: the pet's photo and a short
// label, with the full name in the tooltip (never the pet's database id).
export default function CasePetBadge({ report, className = '' }: { report: any; className?: string }) {
    const own = report?.case_pet_id && report.case_pet_id === report.pet_id;
    const name: string = report?.case_pet_name || 'a registered pet';
    const photo: string | undefined = report?.case_pet_photo || undefined;
    const desc: string = report?.case_pet_description ? ` (${report.case_pet_description})` : '';
    return (
        <button
            type="button"
            disabled
            title={own ? `This report is linked to ${name}${desc}.` : `This animal case is already identified as ${name}${desc}. Use that record instead of adding a new one.`}
            className={`w-full py-2 px-3 border border-gray-700 bg-gray-800 text-gray-200 rounded-xl text-[11px] font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-2xs cursor-not-allowed opacity-95 ${className}`}
        >
            {photo ? (
                <img src={photo} alt="" className="w-6 h-6 rounded-full object-cover border border-emerald-400/70 shrink-0" />
            ) : (
                <span className="w-6 h-6 rounded-full bg-gray-700 border border-emerald-400/70 flex items-center justify-center shrink-0">
                    <PawPrint className="w-3.5 h-3.5 text-emerald-300" />
                </span>
            )}
            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="truncate">{own ? 'Record Already Added' : 'Case Already Identified'}</span>
        </button>
    );
}
