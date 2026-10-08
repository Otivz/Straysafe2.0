import { useState } from 'react';
import { api } from '../utils/api';

// For a report whose pet identity was inherited from its merged case: it is shown everywhere, but it only counts
// toward the pet's bite/chase history, owner warnings and ownership proof at handover once staff re-check it.
export default function InheritedIdentityNotice({ report, canRecheck = true, onDone }: {
    report: any;
    canRecheck?: boolean;
    onDone?: () => void;
}) {
    const [open, setOpen] = useState(false);
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    if (!report?.pet_inherited_from_match_id || !report?.pet_id) return null;
    const from = report.pet_inherited_from_report_id ? `Report #${report.pet_inherited_from_report_id}` : 'the case';
    const name = report.case_pet_name || 'the registered pet';

    if (report.identity_rechecked_at) {
        return (
            <div className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-900 font-medium">
                ✓ Identity re-checked{report.identity_rechecked_by_name ? ` by ${report.identity_rechecked_by_name}` : ''} on{' '}
                {new Date(report.identity_rechecked_at).toLocaleDateString()}: this report counts as {name}.
            </div>
        );
    }

    const submit = async () => {
        setBusy(true);
        setError('');
        try {
            await api.post(`/reports/${report.report_id}/recheck-identity`, { note: note.trim() });
            setOpen(false);
            setNote('');
            onDone?.();
        } catch (e: any) {
            setError(e.response?.data?.detail || 'Could not save the re-check.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 space-y-2">
            <p>
                <strong>Identity inherited from {from}</strong>, not re-checked for this report. It's shown as {name}, but it
                won't count toward the pet's bite/chase history, owner warnings or ownership proof at handover until staff re-check it.
            </p>
            {canRecheck && !open && (
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    className="px-3 py-1.5 rounded-lg border border-amber-300 bg-white hover:bg-amber-100 text-amber-900 font-bold cursor-pointer"
                >
                    Re-check identity
                </button>
            )}
            {open && (
                <div className="space-y-2">
                    <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        rows={2}
                        maxLength={1000}
                        placeholder={`What confirms this report is ${name}? (e.g. same collar and scar, seen in person)`}
                        className="w-full p-2 rounded-lg border border-amber-300 bg-white text-[11px] focus:outline-none focus:ring-2 focus:ring-amber-300"
                    />
                    {error && <p className="text-rose-700 font-semibold">{error}</p>}
                    <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => { setOpen(false); setError(''); }} className="px-3 py-1.5 rounded-lg border border-amber-300 bg-white font-bold cursor-pointer">
                            Cancel
                        </button>
                        <button
                            type="button"
                            disabled={busy || note.trim().length < 10}
                            onClick={submit}
                            className="px-3 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-800 text-white font-bold cursor-pointer disabled:opacity-50"
                        >
                            {busy ? 'Saving…' : `Confirm this report is ${name}`}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
