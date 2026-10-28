// UI preview of the 3-day owner observation (docs/06-future-proposals/SUBDIVISION_OWNER_FOLLOW_UP_PLAN.md).
// Static: everything lives in this component's state, nothing is sent to the server or saved. Reloading the page resets it.
import { useState } from 'react';
import { Eye, Phone, CheckCircle2, Clock, MessageSquare, Plus, XCircle, Send, FlaskConical } from 'lucide-react';
import Button from './Button';

const OBSERVATION_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

type Method = 'Phone' | 'In person' | 'In-app';
interface Contact { at: Date; method: Method; note: string }
type Outcome = 'Owner Acted' | 'Closed by Leader' | 'Escalated';

interface Props {
    reportId: number;
    petName?: string | null;
    ownerName?: string | null;
    ownerPhone?: string | null;
    ownerHasAccount: boolean;
    canAct: boolean;  // the leader handling this report
}

const fmt = (d: Date) => d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function OwnerFollowUpPreview({ reportId, petName, ownerName, ownerPhone, ownerHasAccount, canAct }: Props) {
    const [startedAt, setStartedAt] = useState<Date | null>(null);
    const [daysPassed, setDaysPassed] = useState(0);  // preview only: move the clock forward to see "due"
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [method, setMethod] = useState<Method>('Phone');
    const [note, setNote] = useState('');
    const [confirmed, setConfirmed] = useState<{ via: 'App' | 'Phone'; at: Date } | null>(null);
    const [outcome, setOutcome] = useState<{ kind: Outcome; reason: string; at: Date } | null>(null);
    const [closeReason, setCloseReason] = useState('');

    const now = startedAt ? new Date(startedAt.getTime() + daysPassed * DAY_MS) : new Date();
    const dueAt = startedAt ? new Date(startedAt.getTime() + OBSERVATION_DAYS * DAY_MS) : null;
    const daysLeft = dueAt ? Math.ceil((dueAt.getTime() - now.getTime()) / DAY_MS) : OBSERVATION_DAYS;
    const isDue = Boolean(dueAt && now >= dueAt);
    const owner = ownerName || 'the registered owner';

    const reset = () => {
        setStartedAt(null); setDaysPassed(0); setContacts([]); setNote(''); setConfirmed(null); setOutcome(null); setCloseReason('');
    };
    const addContact = () => {
        if (note.trim().length < 3) return;
        setContacts(c => [...c, { at: now, method, note: note.trim() }]);
        setNote('');
    };
    const end = (kind: Outcome, reason: string) => setOutcome({ kind, reason, at: now });

    return (
        <div className="bg-white rounded-2xl border border-role-border/70 p-4 space-y-3" aria-label="Owner follow-up preview">
            <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-role-soft text-role-hover flex items-center justify-center shrink-0">
                        <Eye className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-sm font-black text-gray-900">Owner follow-up · {OBSERVATION_DAYS}-day observation</p>
                        <p className="text-[11px] font-semibold text-gray-500 truncate">
                            {petName ? `${petName} · ` : ''}Registered owner: {owner}
                        </p>
                    </div>
                </div>
                <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-black uppercase tracking-wide"
                    title="This is a preview: nothing is saved, and reloading the page resets it">
                    <FlaskConical className="w-3 h-3" /> Preview · not saved
                </span>
            </div>

            {/* 1. Not started */}
            {!startedAt && (
                <div className="space-y-2">
                    <p className="text-xs text-gray-600">
                        This animal is linked to a registered pet with an owner. Contact the owner and observe for {OBSERVATION_DAYS} days.
                        After that you decide: close the case, or escalate it to the Barangay. Nothing closes by itself.
                    </p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-700 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2">
                        <span className="font-bold">{owner}</span>
                        <span className="inline-flex items-center gap-1"><Phone className="w-3.5 h-3.5 text-gray-400" />{ownerPhone || 'No phone on record'}</span>
                        <span className="text-gray-500">{ownerHasAccount ? 'Has a StraySafe account (will be notified in the app)' : 'No account: phone only'}</span>
                    </div>
                    {canAct ? (
                        <Button size="sm" onClick={() => setStartedAt(new Date())}>
                            <Clock className="w-3.5 h-3.5 mr-1.5" /> Start {OBSERVATION_DAYS}-day observation
                        </Button>
                    ) : (
                        <p className="text-[11px] text-gray-400">Only the leader handling this report can start it.</p>
                    )}
                </div>
            )}

            {/* 2. Observing / due */}
            {startedAt && !outcome && dueAt && (
                <div className="space-y-3">
                    <div className={`flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 border ${isDue ? 'bg-red-50 border-red-200' : 'bg-role-soft/60 border-role-muted'}`}>
                        <span className={`text-sm font-black ${isDue ? 'text-red-700' : 'text-role-strong'}`}>
                            {isDue ? 'Due: decide now' : `Observing · ${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}
                        </span>
                        <span className="text-[11px] font-semibold text-gray-600">Started {fmt(startedAt)} · Due {fmt(dueAt)}</span>
                    </div>

                    {/* Owner confirmation */}
                    <div className="text-xs">
                        {confirmed ? (
                            <p className="inline-flex items-center gap-1.5 font-bold text-emerald-700">
                                <CheckCircle2 className="w-4 h-4" /> Owner confirmed it is their pet ({confirmed.via === 'App' ? 'in the app' : 'by phone'}, {fmt(confirmed.at)})
                            </p>
                        ) : ownerHasAccount ? (
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-gray-600">{owner} was notified in the app. Waiting for their confirmation.</span>
                                <button type="button" onClick={() => setConfirmed({ via: 'App', at: now })}
                                    className="px-2 py-1 rounded-lg border border-dashed border-gray-300 text-[10px] font-bold text-gray-500 hover:bg-gray-50 cursor-pointer"
                                    title="Preview only: shows what the card looks like after the owner confirms in the app">
                                    Simulate owner's app confirmation
                                </button>
                            </div>
                        ) : (
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-gray-600">No account: confirm with the owner by phone.</span>
                                <Button size="xs" variant="light" onClick={() => setConfirmed({ via: 'Phone', at: now })}>
                                    Log phone confirmation
                                </Button>
                            </div>
                        )}
                    </div>

                    {/* Contact log */}
                    <div className="space-y-2">
                        <p className="text-[11px] font-black uppercase tracking-wider text-gray-400 flex items-center gap-1">
                            <MessageSquare className="w-3.5 h-3.5" /> Contact log
                        </p>
                        {contacts.length === 0 ? (
                            <p className="text-xs text-gray-400">No contact logged yet.</p>
                        ) : (
                            <ul className="space-y-1.5">
                                {contacts.map((c, i) => (
                                    <li key={i} className="text-xs bg-gray-50 border border-gray-100 rounded-lg px-2.5 py-1.5">
                                        <span className="font-bold text-gray-800">{c.method}</span>
                                        <span className="text-gray-400"> · {fmt(c.at)}</span>
                                        <p className="text-gray-700">{c.note}</p>
                                    </li>
                                ))}
                            </ul>
                        )}
                        {canAct && (
                            <div className="flex flex-col sm:flex-row gap-2">
                                <select value={method} onChange={e => setMethod(e.target.value as Method)}
                                    className="h-9 px-2 bg-white border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 sm:w-32">
                                    <option>Phone</option><option>In person</option><option>In-app</option>
                                </select>
                                <input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Called the owner, will fetch the dog tomorrow"
                                    className="h-9 px-3 flex-1 min-w-0 bg-white border border-gray-200 rounded-lg text-xs" />
                                <Button size="sm" variant="light" onClick={addContact} disabled={note.trim().length < 3}>
                                    <Plus className="w-3.5 h-3.5 mr-1" /> Add
                                </Button>
                            </div>
                        )}
                    </div>

                    {/* Ending: always the leader */}
                    {canAct && (
                        <div className="space-y-2 pt-2 border-t border-gray-100">
                            <input value={closeReason} onChange={e => setCloseReason(e.target.value)} placeholder="Reason (needed to close)"
                                className="h-9 w-full px-3 bg-white border border-gray-200 rounded-lg text-xs" />
                            <div className="flex flex-wrap gap-2">
                                <Button size="sm" disabled={!confirmed} onClick={() => end('Owner Acted', 'The owner took the animal back.')}
                                    title={confirmed ? '' : 'Needs the owner\'s confirmation first'}>
                                    <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Owner acted
                                </Button>
                                <Button size="sm" variant="gray" disabled={closeReason.trim().length < 5} onClick={() => end('Closed by Leader', closeReason.trim())}>
                                    <XCircle className="w-3.5 h-3.5 mr-1.5" /> Close case
                                </Button>
                                <Button size="sm" variant="warning" onClick={() => end('Escalated', 'Escalated to the Barangay after the observation period.')}>
                                    <Send className="w-3.5 h-3.5 mr-1.5" /> Escalate to Barangay
                                </Button>
                            </div>
                            <p className="text-[10px] text-gray-400">In the real feature, these use the report's existing status rules and escalation.</p>
                        </div>
                    )}

                    {/* Preview-only clock */}
                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-dashed border-gray-200">
                        <span className="text-[10px] font-bold text-gray-400">Preview clock: day {daysPassed} of {OBSERVATION_DAYS}</span>
                        <button type="button" onClick={() => setDaysPassed(d => Math.min(d + 1, OBSERVATION_DAYS + 1))}
                            className="px-2 py-1 rounded-lg border border-dashed border-gray-300 text-[10px] font-bold text-gray-500 hover:bg-gray-50 cursor-pointer">
                            Skip 1 day →
                        </button>
                    </div>
                </div>
            )}

            {/* 3. Ended */}
            {outcome && startedAt && (
                <div className="space-y-2">
                    <div className="rounded-xl px-3 py-2 bg-gray-50 border border-gray-200">
                        <p className="text-sm font-black text-gray-900">{outcome.kind}</p>
                        <p className="text-xs text-gray-600">{outcome.reason}</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">Observed {fmt(startedAt)} to {fmt(outcome.at)} · {contacts.length} contact{contacts.length === 1 ? '' : 's'} logged</p>
                    </div>
                    <button type="button" onClick={reset}
                        className="text-[11px] font-bold text-role-hover hover:underline cursor-pointer">Reset preview</button>
                </div>
            )}
            <span className="sr-only">Report {reportId}</span>
        </div>
    );
}
