import { parseReportDescription } from '../utils/reportDescription';

// The reporter's description as labelled rows instead of one long "a | b | c" line.
// notesOnly: for the full report, where custody, coat pattern and condition already have their own cards.
// Then only what the reporter wrote themselves is shown (their notes, plus markings which appear nowhere else).
export default function ReportDescription({ description, emptyText = 'No additional notes provided by the citizen.', notesOnly = false }: { description?: string | null; emptyText?: string; notesOnly?: boolean }) {
    const d = parseReportDescription(description);
    const rows: Array<[string, string]> = (notesOnly
        ? [['Markings', d.markings]]
        : [['Custody', d.custody], ['Coat pattern', d.pattern], ['Markings', d.markings], ['Observed condition', d.conditions]]
    ).filter(([, v]) => v) as Array<[string, string]>;

    if (rows.length === 0 && !d.notes) return <p className="text-xs font-semibold text-gray-500 italic">{emptyText}</p>;
    return (
        <div className="space-y-3" data-testid="report-description">
            {rows.length > 0 && (
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
                    {rows.map(([label, value]) => (
                        <div key={label} className="min-w-0">
                            <dt className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{label}</dt>
                            <dd className="text-xs font-bold text-gray-800 mt-0.5 break-words">{value}</dd>
                        </div>
                    ))}
                </dl>
            )}
            {d.notes && (
                <div className={rows.length > 0 ? 'pt-3 border-t border-gray-200/80' : ''}>
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Reporter's notes</p>
                    <p className="text-xs font-semibold text-gray-700 leading-relaxed mt-0.5 whitespace-pre-wrap break-words">{d.notes}</p>
                </div>
            )}
        </div>
    );
}
