import { useState } from 'react';
import { api } from '../utils/api';

// Staff override for a suggestion locked by the pet's active case: this report is a genuinely separate incident.
export function SeparateIncidentOverride({ match, onChanged }: { match: any; onChanged?: (m: any) => void }) {
    const [open, setOpen] = useState(false);
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const caseId = match?.separate_incident_case_id;
    if (!caseId) return null;

    const submit = async () => {
        setBusy(true);
        setError('');
        try {
            await api.post(`/reports/${match.source_report_id}/separate-incident`, { reason: reason.trim() });
            const res = await api.get(`/matches/${match.match_id}`);
            setOpen(false);
            setReason('');
            onChanged?.(res.data);
        } catch (e: any) {
            setError(e.response?.data?.detail || 'Could not mark it as a separate incident.');
        } finally {
            setBusy(false);
        }
    };

    if (!open) {
        return (
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 rounded-xl bg-white border border-amber-200 text-xs text-gray-700">
                <span>Not part of Case #{caseId}? (e.g. the pet went home and got out again)</span>
                <button type="button" onClick={() => setOpen(true)}
                    className="px-3 py-1.5 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold cursor-pointer">
                    Mark as separate incident
                </button>
            </div>
        );
    }
    return (
        <div className="px-4 py-3 rounded-xl bg-white border border-amber-200 text-xs text-gray-700 space-y-2">
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={1000}
                placeholder={`Why is Report #${match.source_report_id} a separate incident from Case #${caseId}?`}
                className="w-full p-2.5 rounded-lg border border-amber-200 text-xs focus:outline-none focus:ring-2 focus:ring-amber-200" />
            {error && <p className="text-rose-700 font-semibold">{error}</p>}
            <div className="flex justify-end gap-2">
                <button type="button" onClick={() => { setOpen(false); setError(''); }} className="px-3 py-1.5 rounded-lg border border-gray-300 font-bold cursor-pointer">Cancel</button>
                <button type="button" disabled={busy || reason.trim().length < 10} onClick={submit}
                    className="px-3 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-800 text-white font-bold cursor-pointer disabled:opacity-50">
                    {busy ? 'Saving…' : 'Confirm separate incident'}
                </button>
            </div>
            <p className="text-[10px] text-gray-500">The report becomes its own case and follows the normal review: you confirm it, then the owner is asked. The override is logged.</p>
        </div>
    );
}
