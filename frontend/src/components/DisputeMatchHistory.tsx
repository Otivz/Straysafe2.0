// The look-alike match a formal dispute is about: AI score, staff decision, owner answer and the decision trail.
const STATUS_LABEL: Record<string, string> = {
    AI_SUGGESTED: 'AI suggested', PENDING_VERIFICATION: 'Pending verification', CONFIRMED_MATCH: 'Confirmed by staff',
    NOT_A_MATCH: 'Not a match', UNABLE_TO_VERIFY: 'Unable to verify', COVERED_BY_CASE: 'Covered by case',
    SUPERSEDED_BY_CASE: 'Superseded by case',
};
const OWNER_LABEL: Record<string, string> = {
    PENDING: 'No answer yet', OWNER_CONFIRMED: 'Said it is their pet', OWNER_REJECTED: 'Said it is not their pet', NO_RESPONSE: 'No response',
};

export default function DisputeMatchHistory({ history }: { history?: any }) {
    if (!history) return null;
    const when = (v?: string | null) => (v ? new Date(v).toLocaleString() : '');
    return (
        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 space-y-1.5">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                Disputed match #{history.match_id} (Report #{history.source_report_id})
            </p>
            <p><strong>AI similarity:</strong> {history.similarity_score ?? '—'}%</p>
            <p>
                <strong>Staff decision:</strong> {STATUS_LABEL[history.status] || history.status}
                {history.reviewer_name && <> by {history.reviewer_name}{history.reviewer_role ? ` (${history.reviewer_role})` : ''}</>}
                {history.verified_at && <> on {when(history.verified_at)}</>}
            </p>
            {history.verification_notes && <p><strong>Staff notes:</strong> {history.verification_notes}</p>}
            <p>
                <strong>Owner:</strong> {OWNER_LABEL[history.owner_confirmation_status] || history.owner_confirmation_status}
                {history.owner_dispute_count > 0 && <> · asked for a second review {history.owner_dispute_count}×</>}
            </p>
            {history.owner_notes && <p><strong>Owner's note:</strong> {history.owner_notes}</p>}
            {Array.isArray(history.events) && history.events.length > 0 && (
                <details className="pt-1">
                    <summary className="cursor-pointer font-bold text-slate-600">Decision trail ({history.events.length})</summary>
                    <ul className="mt-1.5 space-y-1 border-l-2 border-slate-200 pl-2.5">
                        {history.events.map((e: any, i: number) => (
                            <li key={i}>
                                <span className="text-[10px] text-slate-500">{when(e.at)}</span>
                                <span className="block">{e.description || e.action}</span>
                            </li>
                        ))}
                    </ul>
                </details>
            )}
        </div>
    );
}
