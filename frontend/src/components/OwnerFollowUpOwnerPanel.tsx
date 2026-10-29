// The pet owner's side of an owner follow-up (docs/06-future-proposals/SUBDIVISION_OWNER_FOLLOW_UP_PLAN.md, 7.3):
// the complaint, the date the subdivision checks until, "I received this", and updates with a photo.
// The server answers only the pet's owner, so the panel shows nothing to anyone else.
// It also shows the owner warnings issued to this owner for the report, acknowledged here (the same as the home notice).
import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Camera, Send, Eye, ShieldAlert } from 'lucide-react';
import Button from './Button';
import api from '../utils/api';
import { type OwnerFollowUp, acknowledgeFollowUp, followUpError, getFollowUpForReport, sendOwnerUpdate } from '../utils/ownerFollowUp';

interface MyWarning {
    warning_id: number;
    report_id?: number | null;
    warning_level: string;
    violation_type: string;
    description: string;
    status: string;
    created_at?: string | null;
    acknowledged_at?: string | null;
}

const fmt = (s?: string | null) => s ? new Date(s).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
const fmtDate = (s?: string | null) => s ? new Date(s).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' }) : '';

export default function OwnerFollowUpOwnerPanel({ reportId }: { reportId: number }) {
    const [f, setF] = useState<OwnerFollowUp | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [note, setNote] = useState('');
    const [photo, setPhoto] = useState<File | null>(null);
    const [sent, setSent] = useState(false);
    const [warnings, setWarnings] = useState<MyWarning[]>([]);
    const [ticked, setTicked] = useState<Record<number, boolean>>({});

    useEffect(() => {
        let current = true;
        getFollowUpForReport(reportId)
            .then(data => { if (current) setF(data && data.my_updates !== undefined ? data : null); })  // owner view only
            .catch(() => { if (current) setF(null); });
        // Warnings issued to me about this report (the server returns only my own)
        api.get('/warnings/my-warnings')
            .then(res => { if (current) setWarnings((Array.isArray(res.data) ? res.data : []).filter((w: MyWarning) => w.report_id === reportId)); })
            .catch(() => { if (current) setWarnings([]); });
        return () => { current = false; };
    }, [reportId]);

    const acknowledgeWarning = async (id: number) => {
        setBusy(true);
        setError('');
        try {
            const res = await api.patch(`/warnings/${id}/acknowledge`);
            setWarnings(ws => ws.map(w => w.warning_id === id ? { ...w, ...res.data } : w));
        } catch (err) {
            setError(followUpError(err, 'The notice could not be acknowledged. Try again.'));
        } finally {
            setBusy(false);
        }
    };

    if (!f && warnings.length === 0) return null;
    const observing = f?.status === 'Observing';
    const pet = f?.pet_name || 'your pet';
    const updates = f?.my_updates || [];

    const warningList = warnings.length > 0 && (
        <div className="space-y-2">
            <p className="text-[11px] font-black uppercase tracking-wider text-gray-500">Subdivision notices</p>
            {warnings.map(w => {
                const pending = w.status === 'Pending';
                return (
                    <div key={w.warning_id} className="rounded-xl border border-yellow-200 bg-white dark:bg-[#151C2C] dark:border-yellow-800 p-3 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                            <ShieldAlert className="w-4 h-4 text-yellow-600" />
                            <span className="px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 text-[10px] font-black uppercase tracking-wider">{w.warning_level}</span>
                            <span className="text-xs font-black text-red-600">{w.violation_type}</span>
                            {w.created_at && <span className="text-[11px] text-gray-400">{fmt(w.created_at)}</span>}
                        </div>
                        {w.description && <p className="text-xs text-gray-700 dark:text-gray-300 break-words">{w.description}</p>}
                        {pending ? (
                            <div className="space-y-2">
                                <label className="flex items-start gap-2 text-[11px] text-gray-700 dark:text-gray-300 cursor-pointer">
                                    <input type="checkbox" className="mt-0.5 w-4 h-4" checked={Boolean(ticked[w.warning_id])}
                                        onChange={e => setTicked(t => ({ ...t, [w.warning_id]: e.target.checked }))} />
                                    I acknowledge receipt of this warning. I understand that repeated violations may result in escalation to the Barangay.
                                </label>
                                <Button size="sm" disabled={busy || !ticked[w.warning_id]} onClick={() => acknowledgeWarning(w.warning_id)}>
                                    <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Acknowledge notice
                                </Button>
                            </div>
                        ) : (
                            <p className="text-xs font-bold text-emerald-700 inline-flex items-center gap-1.5">
                                <CheckCircle2 className="w-4 h-4" /> You acknowledged this notice{w.acknowledged_at ? ` on ${fmt(w.acknowledged_at)}` : ''}
                            </p>
                        )}
                    </div>
                );
            })}
        </div>
    );

    if (!f) {
        return <div className="mb-4 sm:mb-6 p-4 rounded-2xl border bg-yellow-50/60 border-yellow-200 dark:bg-yellow-950/20 dark:border-yellow-800 space-y-3"
            aria-label="Subdivision notices">{error && <p role="alert" className="text-xs font-semibold text-red-700">{error}</p>}{warningList}</div>;
    }

    const run = async (action: () => Promise<OwnerFollowUp>) => {
        setBusy(true);
        setError('');
        try {
            setF(await action());
            return true;
        } catch (err) {
            setError(followUpError(err));
            return false;
        } finally {
            setBusy(false);
        }
    };

    const submitUpdate = async () => {
        if (note.trim().length < 3) return;
        if (await run(() => sendOwnerUpdate(f.followup_id, note.trim(), photo))) {
            setNote(''); setPhoto(null); setSent(true);
        }
    };

    return (
        <div className={`mb-4 sm:mb-6 p-4 rounded-2xl border space-y-3 ${observing ? 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800'
            : 'bg-gray-50 border-gray-200 dark:bg-[#1E2738] dark:border-gray-700'}`} aria-label="Complaint about your pet">
            <div className="flex items-start gap-2.5">
                {observing ? <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" /> : <Eye className="w-5 h-5 text-gray-500 shrink-0 mt-0.5" />}
                <div className="min-w-0">
                    <p className="text-sm font-black text-gray-900 dark:text-gray-100">
                        {observing ? `A complaint was reported about your pet ${pet}` : `The complaint about ${pet} is closed`}
                    </p>
                    {observing ? (
                        <p className="text-xs text-gray-700 dark:text-gray-300 mt-0.5">
                            Please keep {pet} safely confined. Your Subdivision Leader is checking until <strong>{fmtDate(f.due_at)}</strong>
                            {f.extended ? ' (extended once)' : ''}. Let them know you received this, and send an update when you have acted.
                        </p>
                    ) : (
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">Outcome: {f.closing_outcome || f.status}{f.closed_at ? ` · ${fmt(f.closed_at)}` : ''}</p>
                    )}
                </div>
            </div>

            {error && <p role="alert" className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

            {warningList}

            {observing && (
                f.acknowledged ? (
                    <p className="text-xs font-bold text-emerald-700 inline-flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" /> You acknowledged this on {fmt(f.acknowledged_at)}
                    </p>
                ) : (
                    <Button size="sm" disabled={busy} onClick={() => run(() => acknowledgeFollowUp(f.followup_id))}>
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> I received this and I'm acting on it
                    </Button>
                )
            )}

            {observing && (
                <div className="space-y-2 pt-2 border-t border-amber-200/70 dark:border-amber-800/60">
                    <p className="text-[11px] font-black uppercase tracking-wider text-gray-500">Send an update</p>
                    <textarea value={note} onChange={e => { setNote(e.target.value); setSent(false); }} rows={2} maxLength={1000}
                        placeholder={`e.g. ${pet} is now kept inside the yard, the gate is fixed`}
                        className="w-full px-3 py-2 bg-white dark:bg-[#151C2C] border border-gray-200 dark:border-gray-700 rounded-lg text-xs" />
                    <div className="flex flex-wrap items-center gap-2">
                        <label className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#151C2C] text-xs font-semibold text-gray-700 dark:text-gray-300 cursor-pointer">
                            <Camera className="w-3.5 h-3.5" /> {photo ? photo.name : 'Add a photo (optional)'}
                            <input type="file" accept="image/*" className="hidden" onChange={e => setPhoto(e.target.files?.[0] || null)} />
                        </label>
                        <Button size="sm" disabled={busy || note.trim().length < 3} onClick={submitUpdate}>
                            <Send className="w-3.5 h-3.5 mr-1.5" /> {busy ? 'Sending...' : 'Send update'}
                        </Button>
                        {sent && <span className="text-xs font-bold text-emerald-700">Sent to your Subdivision Leader.</span>}
                    </div>
                </div>
            )}

            {updates.length > 0 && (
                <div className="space-y-1.5">
                    <p className="text-[11px] font-black uppercase tracking-wider text-gray-500">Your updates</p>
                    {updates.map((u, i) => (
                        <div key={i} className="text-xs bg-white/70 dark:bg-[#151C2C] border border-gray-100 dark:border-gray-700 rounded-lg px-2.5 py-1.5">
                            <span className="text-gray-400">{fmt(u.contacted_at)}</span>
                            <p className="text-gray-700 dark:text-gray-300">{u.note}</p>
                            {u.photo_url && <img src={u.photo_url} alt="Your update" className="mt-1 w-24 h-24 object-cover rounded-lg border border-gray-200" />}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
