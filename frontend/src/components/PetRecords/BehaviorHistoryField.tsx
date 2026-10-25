// Bite / chasing history on the pet forms. The verified count comes only from verified incident reports and is shown
// read-only; the checkbox is the person's own declaration. A resident can add a declaration but not remove one
// (the server enforces both, see backend/app/routes/pets.py check_behavior_edit).
interface BehaviorHistoryFieldProps {
    label: string;
    question: string;
    verifiedCount: number;
    declared: boolean;
    /** a saved declaration a resident may not remove */
    locked?: boolean;
    accent?: string;
    onChange: (declared: boolean) => void;
}

const BehaviorHistoryField = ({ label, question, verifiedCount, declared, locked = false, accent = 'accent-[#F97316]', onChange }: BehaviorHistoryFieldProps) => (
    <div className="space-y-2 min-w-0">
        <span className="block text-[11px] font-black text-[#1a1208] uppercase tracking-widest">{label}</span>
        {verifiedCount > 0 && (
            <p className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
                Verified: {verifiedCount} incident{verifiedCount === 1 ? '' : 's'} from incident reports.
                <span className="block font-semibold text-rose-600/90 mt-0.5">This can't be edited here. If a report is wrong, dispute that report.</span>
            </p>
        )}
        <label className={`flex items-start gap-3 bg-[#FAFAF9] border border-gray-100 rounded-2xl px-4 py-3 ${locked ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
            <input
                type="checkbox"
                className={`mt-0.5 w-4 h-4 shrink-0 ${accent}`}
                checked={declared}
                disabled={locked}
                onChange={(e) => onChange(e.target.checked)}
            />
            <span className="text-xs font-bold text-gray-700 min-w-0">
                {question}
                {locked && (
                    <span className="block mt-1 text-[11px] font-semibold text-gray-500">
                        Declared. Only the subdivision leader or barangay staff can remove it.
                    </span>
                )}
            </span>
        </label>
    </div>
);

export default BehaviorHistoryField;
