// The pet owner's side of an owner follow-up (docs/06-future-proposals/SUBDIVISION_OWNER_FOLLOW_UP_PLAN.md, 7.3):
// the complaint, the date the subdivision checks until, "I received this", and updates with a photo.
// The server answers only the pet's owner, so the panel shows nothing to anyone else.
import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Camera, Send, Eye } from 'lucide-react';
import Button from './Button';
import { type OwnerFollowUp, acknowledgeFollowUp, followUpError, getFollowUpForReport, sendOwnerUpdate } from '../utils/ownerFollowUp';

const fmt = (s?: string | null) => s ? new Date(s).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
const fmtDate = (s?: string | null) => s ? new Date(s).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' }) : '';

export default function OwnerFollowUpOwnerPanel({ reportId }: { reportId: number }) {
    const [f, setF] = useState<OwnerFollowUp | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [note, setNote] = useState('');
    const [photo, setPhoto] = useState<File | null>(null);
    const [sent, setSent] = useState(false);

    useEffect(() => {
        let current = true;
        getFollowUpForReport(reportId)
            .then(data => { if (current) setF(data && data.my_updates !== undefined ? data : null); })  // owner view only
            .catch(() => { if (current) setF(null); });
        return () => { current = false; };
    }, [reportId]);

    if (!f) return null;
    const observing = f.status === 'Observing';
    const pet = f.pet_name || 'your pet';
    const updates = f.my_updates || [];

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
