import { Archive } from 'lucide-react';

/** Read-only archive notice for records of workflows the Barangay now handles outside StraySafe (Subdivision-only). */
export default function ArchiveBanner({ what }: { what: string }) {
    return (
        <div role="note" data-archive-banner className="flex items-start gap-3 p-3 sm:p-4 rounded-2xl border border-slate-300 bg-slate-100 text-slate-800">
            <Archive className="w-5 h-5 shrink-0 mt-0.5 text-slate-600" aria-hidden="true" />
            <div className="min-w-0">
                <p className="text-sm font-black">Archive, read-only</p>
                <p className="text-xs font-medium leading-relaxed text-slate-700">
                    {what} are now handled by the Barangay outside StraySafe. These earlier records are kept for reference and cannot be changed.
                </p>
            </div>
        </div>
    );
}
