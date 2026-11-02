import { useCallback, useEffect, useState } from 'react';
import api from '../utils/api';

// Subdivision notices for this report, shown on the owner's report page (Phase 6). The server returns only the
// signed-in owner's own notices, so other residents see nothing here. Acknowledging needs the checkbox ticked.

interface Notice {
    warning_id: number;
    warning_level: string;
    violation_type: string;
    description: string;
    status: string;
    issued_at: string | null;
    acknowledged_at: string | null;
    issuer_name: string | null;
    issuer_role: string | null;
    pet_name: string | null;
}

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
}) : '—');

const errorText = (e: unknown) => {
    const d = (e as { response?: { data?: { detail?: unknown } } } | null)?.response?.data?.detail;
    return typeof d === 'string' ? d : 'Could not acknowledge the notice. Please try again.';
};

const ReportWarningNotices = ({ reportId }: { reportId: number }) => {
    const [notices, setNotices] = useState<Notice[]>([]);
    const [checked, setChecked] = useState<Record<number, boolean>>({});
    const [busy, setBusy] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const r = await api.get(`/warnings/report/${reportId}`);
            setNotices(Array.isArray(r.data) ? r.data : []);
        } catch {
            setNotices([]);
        }
    }, [reportId]);

    useEffect(() => {
        let cancelled = false;
        api.get(`/warnings/report/${reportId}`)
            .then((r) => { if (!cancelled) setNotices(Array.isArray(r.data) ? r.data : []); })
            .catch(() => { if (!cancelled) setNotices([]); });
        return () => { cancelled = true; };
    }, [reportId]);

    const acknowledge = async (n: Notice) => {
        if (!checked[n.warning_id]) return;
        setBusy(n.warning_id);
        setError(null);
        try {
            await api.patch(`/warnings/${n.warning_id}/acknowledge`, { confirmed: true });
            await load();
        } catch (e) {
            setError(errorText(e));
        } finally {
            setBusy(null);
        }
    };

    if (notices.length === 0) return null;

    return (
        <section className="space-y-3 rounded-xl border-2 border-red-200 bg-red-50/60 p-3.5 dark:border-red-900/60 dark:bg-red-950/20 sm:rounded-3xl sm:p-5" aria-label="Subdivision notices">
            <h3 className="text-xs font-black uppercase tracking-wider text-red-800 dark:text-red-300">Subdivision notices about your pet</h3>
            {error && <p className="text-xs font-bold text-red-700" role="alert">{error}</p>}
            {notices.map((n) => (
                <div key={n.warning_id} className="space-y-2 rounded-xl border border-red-100 bg-white p-3 dark:border-red-900/50 dark:bg-[#1A1A1A]">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-black uppercase text-white">{n.warning_level}</span>
                        <span className="text-xs font-black text-gray-900 dark:text-white">{n.violation_type}</span>
                        {n.pet_name && <span className="text-xs font-semibold text-gray-500">· {n.pet_name}</span>}
                    </div>
                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">{n.description}</p>
                    <p className="text-[11px] font-semibold text-gray-500">
                        Issued {fmt(n.issued_at)} by {n.issuer_name || 'your Subdivision Leader'}{n.issuer_role ? ` (${n.issuer_role})` : ''}
                    </p>
                    {n.status === 'Acknowledged' ? (
                        <p className="text-[11px] font-bold text-emerald-700">You acknowledged this notice on {fmt(n.acknowledged_at)}.</p>
                    ) : (
                        <>
                            <label className="flex items-start gap-2 text-[11px] font-semibold text-gray-700 dark:text-gray-200">
                                <input
                                    type="checkbox"
                                    className="mt-0.5 h-4 w-4 accent-red-600"
                                    checked={!!checked[n.warning_id]}
                                    onChange={(e) => setChecked((c) => ({ ...c, [n.warning_id]: e.target.checked }))}
                                />
                                <span>I acknowledge receipt of this notice. I understand that repeated violations may be escalated to the Barangay.</span>
                            </label>
                            <button
                                type="button"
                                onClick={() => acknowledge(n)}
                                disabled={!checked[n.warning_id] || busy === n.warning_id}
                                className="action-primary w-full rounded-xl py-2.5 text-xs font-black uppercase tracking-wider disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                {busy === n.warning_id ? 'Saving…' : 'Acknowledge notice'}
                            </button>
                        </>
                    )}
                </div>
            ))}
        </section>
    );
};

export default ReportWarningNotices;
