// Leader's owner follow-up card: 3-day observation of a complaint about a registered pet
// (docs/06-future-proposals/SUBDIVISION_OWNER_FOLLOW_UP_PLAN.md, section 7.1). Saved on the server.
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
    Eye, Phone, CheckCircle2, Clock, Plus, XCircle, Send, AlertTriangle, CalendarPlus, ShieldAlert,
    Users, Smartphone, Image as ImageIcon, MessageSquare, X,
} from 'lucide-react';
import Button from './Button';
import {
    type CloseOutcome, type ContactMethod, type IncidentWarning, type OwnerFollowUp, type WarningTarget, acknowledgeFollowUp,
    addFollowUpContact, closeFollowUp, extendFollowUp, followUpError, getFollowUpForReport, getReportWarnings, startFollowUp,
} from '../utils/ownerFollowUp';

type LeaderMethod = 'Phone' | 'In person' | 'In-app' | 'Repeated incident';
type Decision = 'complied' | 'close' | 'extend' | null;

interface Props {
    reportId: number;
    eligible: boolean;               // the report may start a follow-up (the server checks again)
    canAct: boolean;                 // the leader handling this report
    petName?: string | null;
    ownerName?: string | null;
    ownerPhone?: string | null;
    ownerHasAccount: boolean;
    onChanged?: () => void;          // the report itself changed (closed): refresh the page
    onEscalate?: () => void;         // the page's existing escalation dialog
    onIssueWarning?: (target: WarningTarget) => void;   // the page's owner warning form (owner with an account only)
    warningsRefreshKey?: number;     // changes when the page issued a warning: reload the incidents' warnings
    categoryId?: number;             // 3 Rabies Risk cannot be observed; 1 Injured and 2 Aggressive get a caution
    priority?: string | null;
    reportBasePath?: string;         // where a repeated report opens, e.g. /subd/reports
}

const RABIES_RISK = 3;
const CAUTION_CATEGORIES: Record<number, string> = { 1: 'Injured', 2: 'Aggressive' };

/** Same wording as the server's caution (utils/owner_followups.py), shown before the observation starts. */
function startCaution(categoryId?: number, priority?: string | null): string | null {
    const reasons: string[] = [];
    if (categoryId && CAUTION_CATEGORIES[categoryId]) reasons.push(`it was reported as ${CAUTION_CATEGORIES[categoryId]}`);
    if (priority === 'High') reasons.push('it has High priority');
    return reasons.length ? `Take care: ${reasons.join(' and ')}. You can escalate to the Barangay at any time instead of waiting for the observation to end.` : null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const fmt = (s?: string | null) => s ? new Date(s).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
const telHref = (p: string) => `tel:${p.replace(/[^\d+]/g, '')}`;

const METHOD_STYLE: Record<ContactMethod, { icon: ReactNode; tone: string }> = {
    'Phone': { icon: <Phone className="w-3.5 h-3.5" />, tone: 'bg-blue-50 text-blue-600 border-blue-100' },
    'In person': { icon: <Users className="w-3.5 h-3.5" />, tone: 'bg-indigo-50 text-indigo-600 border-indigo-100' },
    'In-app': { icon: <Smartphone className="w-3.5 h-3.5" />, tone: 'bg-gray-50 text-gray-600 border-gray-200' },
    'Owner update': { icon: <ImageIcon className="w-3.5 h-3.5" />, tone: 'bg-emerald-50 text-emerald-600 border-emerald-100' },
    'Repeated incident': { icon: <AlertTriangle className="w-3.5 h-3.5" />, tone: 'bg-red-50 text-red-600 border-red-100' },
};

const inputCls = 'h-9 w-full px-3 bg-white border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-role-border';
const sectionTitle = 'text-[11px] font-black uppercase tracking-wider text-gray-400';

export default function OwnerFollowUpCard({ reportId, eligible, canAct, petName, ownerName, ownerPhone, ownerHasAccount,
    onChanged, onEscalate, onIssueWarning, categoryId, priority, reportBasePath = '/subd/reports', warningsRefreshKey = 0 }: Props) {
    const [followUp, setFollowUp] = useState<OwnerFollowUp | null>(null);
    const [loaded, setLoaded] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [method, setMethod] = useState<LeaderMethod>('Phone');
    const [note, setNote] = useState('');
    const [relatedReport, setRelatedReport] = useState('');
    const [ackNote, setAckNote] = useState('');
    const [decision, setDecision] = useState<Decision>(null);
    const [reason, setReason] = useState('');
    const [closeOutcome, setCloseOutcome] = useState<Exclude<CloseOutcome, 'owner_complied'>>('incident_resolved');
    const [now, setNow] = useState(() => Date.now());   // for the progress bar; refreshed on every load and save
    const [warnings, setWarnings] = useState<Record<number, IncidentWarning[]>>({});
    const [verbalOpen, setVerbalOpen] = useState(false);
    const [verbalMethod, setVerbalMethod] = useState<'Phone' | 'In person'>('Phone');
    const [verbalNote, setVerbalNote] = useState('');

    useEffect(() => {
        let current = true;   // ignore a late answer for a report we already left
        getFollowUpForReport(reportId)
            .then(f => { if (current) { setFollowUp(f); setNow(Date.now()); } })
            .catch(() => { if (current) setFollowUp(null); })
            .finally(() => { if (current) setLoaded(true); });
        return () => { current = false; };
    }, [reportId]);

    // One warning per incident: the observed report and each logged repeated incident (Phase 5D)
    const incidentKey = followUp
        ? [followUp.report_id, ...(followUp.contacts || []).filter(c => c.method === 'Repeated incident' && c.related_report_id)
            .map(c => c.related_report_id as number)].filter((id, i, all) => all.indexOf(id) === i).join(',')
        : '';
    useEffect(() => {
        if (!incidentKey) return;
        let current = true;
        const ids = incidentKey.split(',').map(Number);
        Promise.all(ids.map(id => getReportWarnings(id).then(list => [id, list] as const).catch(() => [id, []] as const)))
            .then(rows => { if (current) setWarnings(Object.fromEntries(rows)); });
        return () => { current = false; };
    }, [incidentKey, warningsRefreshKey]);

    const run = async (action: () => Promise<OwnerFollowUp>, reportChanged = false) => {
        setBusy(true);
        setError('');
        try {
            setFollowUp(await action());
            setNow(Date.now());
            if (reportChanged) onChanged?.();
            return true;
        } catch (err) {
            setError(followUpError(err));
            return false;
        } finally {
            setBusy(false);
        }
    };

    if (!loaded) return null;
    if (!followUp && !eligible) return null;

    const f = followUp;
    const observing = f?.status === 'Observing';
    const owner = f?.owner_name || ownerName || 'the registered owner';
    const phone = f?.owner_phone ?? ownerPhone;
    const hasAccount = f ? Boolean(f.owner_has_account) : ownerHasAccount;
    const pet = f?.pet_name || petName;
    const contacts = f?.contacts || [];

    // Countdown progress (elapsed share of the whole observation, extension included)
    let progress = 0;
    if (f && observing) {
        const total = new Date(f.due_at).getTime() - new Date(f.opened_at).getTime();
        progress = total > 0 ? Math.min(100, Math.max(0, ((now - new Date(f.opened_at).getTime()) / total) * 100)) : 100;
    }
    const totalDays = f ? Math.round((new Date(f.due_at).getTime() - new Date(f.opened_at).getTime()) / DAY_MS) : 3;

    const rabiesRisk = categoryId === RABIES_RISK;
    const caution = f ? (observing ? f.caution : null) : startCaution(categoryId, priority);
    const repeats = observing ? (f?.unlogged_repeat_report_ids || []) : [];

    const logRepeat = (id: number) => run(() => addFollowUpContact(f!.followup_id, {
        method: 'Repeated incident', related_report_id: id,
        note: `Report #${id}: ${pet || 'the pet'} was reported again during the observation.`,
    }));

    const incidents = incidentKey ? incidentKey.split(',').map(Number) : [];
    const day = (s: string) => new Date(s).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    const warningPrefill = (id: number) => f ? (
        `Owner follow-up on Report #${f.report_id}: ${pet || 'your pet'} was under observation from ${day(f.opened_at)} to ${day(f.due_at)}. `
        + (id === f.report_id ? `Reported roaming in Report #${id}. ` : `Reported again during the observation in Report #${id}. `)
        + `Keep ${pet || 'your pet'} safely confined at home and on a leash outside. A repeat may lead to the next warning or to escalation to the Barangay.`
    ) : '';
    const issueFor = (id: number) => onIssueWarning?.({ reportId: id, prefill: warningPrefill(id) });
    const logVerbal = async () => {
        if (!f || verbalNote.trim().length < 3) return;
        if (await run(() => addFollowUpContact(f.followup_id, { method: verbalMethod, note: `Verbal warning: ${verbalNote.trim()}` }))) {
            setVerbalOpen(false); setVerbalNote('');
        }
    };

    const openDecision = (d: Decision) => { setDecision(prev => prev === d ? null : d); setReason(''); setError(''); };

    const addContact = async () => {
        if (note.trim().length < 3) return;
        const related = method === 'Repeated incident' && relatedReport.trim() ? Number(relatedReport.trim().replace('#', '')) : null;
        if (related !== null && !Number.isInteger(related)) { setError('Enter the repeated incident\'s report number.'); return; }
        if (await run(() => addFollowUpContact(f!.followup_id, { method, note: note.trim(), related_report_id: related }))) {
            setNote(''); setRelatedReport('');
        }
    };

    const confirmDecision = async () => {
        if (!f || reason.trim().length < 5) return;
        const action = decision === 'extend'
            ? () => extendFollowUp(f.followup_id, reason.trim())
            : () => closeFollowUp(f.followup_id, decision === 'complied' ? 'owner_complied' : closeOutcome, reason.trim());
        if (await run(action, decision !== 'extend')) { setDecision(null); setReason(''); }
    };

    const decisionCopy: Record<Exclude<Decision, null>, { title: string; hint: string; placeholder: string; confirm: string }> = {
        complied: {
            title: 'The owner complied', hint: 'The report is closed as Incident Resolved.',
            placeholder: 'What did the owner do? e.g. Dog kept inside, gate fixed, checked on site', confirm: 'Confirm: owner complied',
        },
        close: {
            title: 'Close the case', hint: 'Choose how it ended. The report is closed with this outcome.',
            placeholder: 'Reason for closing', confirm: 'Close case',
        },
        extend: {
            title: 'Extend the observation once', hint: `Adds another ${totalDays} day${totalDays === 1 ? '' : 's'}. The owner is told the new date. Only once.`,
            placeholder: 'Why more time is needed', confirm: 'Extend',
        },
    };

    return (
        <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden" aria-label="Owner follow-up">
            {/* Header */}
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50/60">
                <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-role-soft text-role-hover flex items-center justify-center shrink-0">
                        <Eye className="w-4.5 h-4.5" />
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-sm font-black text-gray-900 leading-tight">Owner follow-up</h3>
                        <p className="text-[11px] font-semibold text-gray-500 truncate">3-day observation{pet ? ` · ${pet}` : ''}</p>
                    </div>
                </div>
                {f && (
                    <span className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wide border ${
                        observing ? (f.is_due ? 'bg-red-50 border-red-200 text-red-700' : 'bg-role-soft border-role-border text-role-strong')
                            : 'bg-gray-100 border-gray-200 text-gray-600'}`}>
                        {observing ? (f.is_due ? 'Due' : 'Under Observation') : f.status}
                    </span>
                )}
            </div>

            <div className="p-4 space-y-4">
                {error && (
                    <p role="alert" className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 flex items-start gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {error}
                    </p>
                )}

                {caution && !rabiesRisk && (
                    <p role="note" className="text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex items-start gap-1.5">
                        <ShieldAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {caution}
                    </p>
                )}

                {repeats.length > 0 && (
                    <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 space-y-2">
                        <p className="text-xs font-black text-red-800 flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            {pet || 'This pet'} was reported again during the observation
                        </p>
                        <ul className="space-y-1.5">
                            {repeats.map(id => (
                                <li key={id} className="flex flex-wrap items-center justify-between gap-2">
                                    <Link to={`${reportBasePath}/${id}`} className="text-xs font-bold text-red-700 underline underline-offset-2 hover:text-red-900">
                                        Report #{id}
                                    </Link>
                                    {canAct && (
                                        <Button size="sm" variant="light" disabled={busy} onClick={() => logRepeat(id)}>
                                            <Plus className="w-3.5 h-3.5 mr-1" /> Log as repeated incident
                                        </Button>
                                    )}
                                </li>
                            ))}
                        </ul>
                        <p className="text-[11px] text-red-700">If it is the same event, merge that report into this one instead. A repeat can get the next owner warning.</p>
                    </div>
                )}

                {/* Owner */}
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5">
                    <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Owner</p>
                        <p className="text-sm font-black text-gray-900 truncate">{owner}</p>
                        <p className="text-[11px] text-gray-500">{hasAccount ? 'Has a StraySafe account · notified in the app' : 'No account · phone only'}</p>
                    </div>
                    {phone ? (
                        <a href={telHref(phone)} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-white border border-gray-200 text-xs font-bold text-gray-800 hover:border-role-border hover:text-role-hover transition-colors">
                            <Phone className="w-3.5 h-3.5" /> {phone}
                        </a>
                    ) : (
                        <span className="text-xs text-gray-400">No phone on record</span>
                    )}
                </div>

                {/* 1. Not started */}
                {!f && rabiesRisk && (
                    <div className="space-y-3">
                        <p role="note" className="text-xs font-semibold text-red-800 bg-red-50 border border-red-200 rounded-xl px-3 py-2 flex items-start gap-1.5">
                            <ShieldAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                            A Rabies Risk report cannot be observed: escalate it to the Barangay.
                        </p>
                        {canAct && onEscalate && (
                            <Button size="sm" variant="warning" onClick={onEscalate}>
                                <Send className="w-3.5 h-3.5 mr-1.5" /> Escalate to Barangay
                            </Button>
                        )}
                    </div>
                )}

                {!f && !rabiesRisk && (
                    <div className="space-y-3">
                        <p className="text-xs text-gray-600 leading-relaxed">
                            This report is about a registered pet with a known owner. Contact the owner, ask them to keep the pet
                            safely confined, and check for 3 days whether they act. The pet is not moved anywhere. You decide the
                            outcome; nothing closes by itself.
                        </p>
                        {canAct ? (
                            <Button size="md" disabled={busy} onClick={() => run(() => startFollowUp(reportId))}>
                                <Clock className="w-4 h-4 mr-1.5" /> {busy ? 'Starting...' : 'Start 3-day observation'}
                            </Button>
                        ) : (
                            <p className="text-[11px] text-gray-400">Only the leader handling this report can start it.</p>
                        )}
                    </div>
                )}

                {/* 2. Under observation */}
                {f && observing && (
                    <>
                        {/* Countdown */}
                        <div className={`rounded-xl border px-3 py-3 ${f.is_due ? 'bg-red-50 border-red-200' : 'bg-role-soft/50 border-role-muted'}`}>
                            <div className="flex items-baseline justify-between gap-2">
                                <p className={`text-base font-black ${f.is_due ? 'text-red-700' : 'text-role-strong'}`}>
                                    {f.is_due ? 'Time is up: decide now' : `${f.days_left} day${f.days_left === 1 ? '' : 's'} left`}
                                </p>
                                <p className="text-[11px] font-semibold text-gray-500">Due {fmt(f.due_at)}</p>
                            </div>
                            <div className="mt-2 h-1.5 rounded-full bg-white/80 overflow-hidden" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
                                <div className={`h-full rounded-full ${f.is_due ? 'bg-red-500' : 'bg-role'}`} style={{ width: `${progress}%` }} />
                            </div>
                            <p className="mt-1.5 text-[11px] text-gray-500">
                                Started {fmt(f.opened_at)}{f.extended ? ` · Extended once: ${f.extension_reason}` : ''}
                            </p>
                        </div>

                        {/* Owner's response */}
                        <div className="space-y-1.5">
                            <p className={sectionTitle}>Owner's response</p>
                            {f.acknowledged ? (
                                <p className="text-xs font-bold text-emerald-700 inline-flex items-center gap-1.5">
                                    <CheckCircle2 className="w-4 h-4" /> Acknowledged {f.acknowledged_via === 'App' ? 'in the app' : 'by phone'} · {fmt(f.acknowledged_at)}
                                </p>
                            ) : hasAccount ? (
                                <p className="text-xs text-gray-600 inline-flex items-center gap-1.5">
                                    <Clock className="w-3.5 h-3.5 text-gray-400" /> Notified in the app. Waiting for the owner to acknowledge.
                                </p>
                            ) : canAct ? (
                                <div className="flex flex-col sm:flex-row gap-2">
                                    <input value={ackNote} onChange={e => setAckNote(e.target.value)} placeholder="What the owner said on the phone"
                                        className={`${inputCls} sm:flex-1`} />
                                    <Button size="sm" variant="light" disabled={busy || ackNote.trim().length < 3}
                                        onClick={async () => { if (await run(() => acknowledgeFollowUp(f.followup_id, ackNote.trim()))) setAckNote(''); }}>
                                        Log acknowledgement
                                    </Button>
                                </div>
                            ) : (
                                <p className="text-xs text-gray-600">Not acknowledged yet (the leader confirms by phone).</p>
                            )}
                        </div>

                        {/* Log */}
                        <div className="space-y-2">
                            <p className={sectionTitle}>Contact log {contacts.length > 0 && <span className="text-gray-300">· {contacts.length}</span>}</p>
                            {contacts.length === 0 ? (
                                <p className="text-xs text-gray-400 flex items-center gap-1.5"><MessageSquare className="w-3.5 h-3.5" /> Nothing logged yet. Log each call, visit or update below.</p>
                            ) : (
                                <ol className="space-y-2">
                                    {contacts.map(c => {
                                        const st = METHOD_STYLE[c.method] || METHOD_STYLE['In-app'];
                                        return (
                                            <li key={c.contact_id} className="flex gap-2.5">
                                                <span className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 ${st.tone}`}>{st.icon}</span>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-[11px] text-gray-500">
                                                        <span className="font-bold text-gray-800">{c.method}</span>
                                                        {c.related_report_id && <span> · Report #{c.related_report_id}</span>}
                                                        <span> · {fmt(c.contacted_at)}{c.contacted_by_name ? ` · ${c.contacted_by_name}` : ''}</span>
                                                    </p>
                                                    <p className="text-xs text-gray-700 break-words">{c.note}</p>
                                                    {c.photo_url && (
                                                        <a href={c.photo_url} target="_blank" rel="noreferrer" className="inline-block mt-1">
                                                            <img src={c.photo_url} alt="Owner's photo" className="w-20 h-20 object-cover rounded-lg border border-gray-200" />
                                                        </a>
                                                    )}
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ol>
                            )}
                            {canAct && (
                                <div className="rounded-xl border border-dashed border-gray-200 p-2.5 space-y-2">
                                    <div className="flex flex-col sm:flex-row gap-2">
                                        <select value={method} onChange={e => setMethod(e.target.value as LeaderMethod)} aria-label="Contact type"
                                            className="h-9 px-2 bg-white border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 sm:w-40">
                                            <option>Phone</option><option>In person</option><option>In-app</option><option>Repeated incident</option>
                                        </select>
                                        {method === 'Repeated incident' && (
                                            <input value={relatedReport} onChange={e => setRelatedReport(e.target.value)} placeholder="Report #"
                                                inputMode="numeric" aria-label="Report number" className={`${inputCls} sm:w-28`} />
                                        )}
                                    </div>
                                    <div className="flex gap-2">
                                        <input value={note} onChange={e => setNote(e.target.value)} aria-label="Note"
                                            onKeyDown={e => { if (e.key === 'Enter') addContact(); }}
                                            placeholder={method === 'Repeated incident' ? 'What happened again?' : 'e.g. Called the owner, will fix the gate today'}
                                            className={`${inputCls} flex-1 min-w-0`} />
                                        <Button size="sm" variant="light" onClick={addContact} disabled={busy || note.trim().length < 3}>
                                            <Plus className="w-3.5 h-3.5 mr-1" /> Add
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Warnings: one per incident (the observed report, then each logged repeat) */}
                        {(hasAccount || canAct) && (
                            <div className="space-y-2">
                                <p className={sectionTitle}>Owner warnings</p>
                                {hasAccount ? (
                                    <ul className="space-y-1.5">
                                        {incidents.map(id => {
                                            const list = warnings[id] || [];
                                            return (
                                                <li key={id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                                                    <div className="min-w-0">
                                                        <p className="text-[11px] font-bold text-gray-800">
                                                            Report #{id}{id === f.report_id ? ' · this report' : ' · repeated incident'}
                                                        </p>
                                                        {list.length > 0 ? list.map(w => (
                                                            <p key={w.warning_id} className="text-[11px] text-amber-800">
                                                                <ShieldAlert className="w-3 h-3 inline mr-1" />{w.warning_level} · {w.violation_type}
                                                                {w.created_at ? ` · ${fmt(w.created_at)}` : ''} · {w.status}
                                                            </p>
                                                        )) : <p className="text-[11px] text-gray-500">No warning for this incident</p>}
                                                    </div>
                                                    {canAct && onIssueWarning && list.length === 0 && (
                                                        <Button size="sm" variant="soft-warning" onClick={() => issueFor(id)}>
                                                            <ShieldAlert className="w-3.5 h-3.5 mr-1.5" /> Issue warning
                                                        </Button>
                                                    )}
                                                </li>
                                            );
                                        })}
                                    </ul>
                                ) : (
                                    <div className="space-y-2">
                                        <p className="text-[11px] text-gray-500">
                                            The owner has no account, so a written warning can't be sent. Warn them by phone or in person and log it here.
                                        </p>
                                        {!verbalOpen ? (
                                            <Button size="sm" variant="soft-warning" onClick={() => { setVerbalOpen(true); setError(''); }}>
                                                <ShieldAlert className="w-3.5 h-3.5 mr-1.5" /> Log verbal warning
                                            </Button>
                                        ) : (
                                            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-2.5 space-y-2">
                                                <div className="flex flex-col sm:flex-row gap-2">
                                                    <select value={verbalMethod} onChange={e => setVerbalMethod(e.target.value as 'Phone' | 'In person')} aria-label="How the owner was warned"
                                                        className="h-9 px-2 bg-white border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 sm:w-36">
                                                        <option>Phone</option><option>In person</option>
                                                    </select>
                                                    <input value={verbalNote} onChange={e => setVerbalNote(e.target.value)} aria-label="What the owner was told"
                                                        placeholder="What you told the owner, e.g. keep the dog inside; next time it goes to the Barangay"
                                                        className={`${inputCls} flex-1 min-w-0`} />
                                                </div>
                                                <div className="flex justify-end gap-2">
                                                    <Button size="sm" variant="ghost" onClick={() => { setVerbalOpen(false); setVerbalNote(''); }}>Cancel</Button>
                                                    <Button size="sm" disabled={busy || verbalNote.trim().length < 3} onClick={logVerbal}>Log verbal warning</Button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Decision: always the leader, never automatic */}
                        {canAct && (
                            <div className="space-y-2.5 pt-3 border-t border-gray-100">
                                <p className={sectionTitle}>Decision</p>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                    <Button size="sm" variant={decision === 'complied' ? 'primary' : 'soft-primary'} onClick={() => openDecision('complied')}>
                                        <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Owner complied
                                    </Button>
                                    <Button size="sm" variant={decision === 'close' ? 'primary' : 'gray'} onClick={() => openDecision('close')}>
                                        <XCircle className="w-3.5 h-3.5 mr-1.5" /> Close case
                                    </Button>
                                    {!f.extended ? (
                                        <Button size="sm" variant={decision === 'extend' ? 'primary' : 'light'} onClick={() => openDecision('extend')}>
                                            <CalendarPlus className="w-3.5 h-3.5 mr-1.5" /> Extend once
                                        </Button>
                                    ) : (
                                        <span className="h-8 inline-flex items-center justify-center text-[11px] font-semibold text-gray-400">Already extended</span>
                                    )}
                                </div>

                                {decision && (
                                    <div className="rounded-xl border border-role-border bg-role-soft/40 p-3 space-y-2">
                                        <div className="flex items-start justify-between gap-2">
                                            <div>
                                                <p className="text-xs font-black text-gray-900">{decisionCopy[decision].title}</p>
                                                <p className="text-[11px] text-gray-600">{decisionCopy[decision].hint}</p>
                                            </div>
                                            <button type="button" onClick={() => setDecision(null)} aria-label="Cancel"
                                                className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-white cursor-pointer">
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                        {decision === 'close' && (
                                            <div className="flex gap-2" role="radiogroup" aria-label="Outcome">
                                                {([['incident_resolved', 'Incident Resolved'], ['false_alarm', 'False Alarm']] as const).map(([value, label]) => (
                                                    <button key={value} type="button" role="radio" aria-checked={closeOutcome === value}
                                                        onClick={() => setCloseOutcome(value)}
                                                        className={`flex-1 h-8 rounded-lg border text-xs font-bold cursor-pointer transition-colors ${closeOutcome === value
                                                            ? 'bg-white border-role text-role-strong' : 'bg-white/60 border-gray-200 text-gray-500 hover:text-gray-800'}`}>
                                                        {label}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                        <input value={reason} onChange={e => setReason(e.target.value)} placeholder={decisionCopy[decision].placeholder}
                                            aria-label="Reason" className={inputCls} />
                                        <div className="flex justify-end gap-2">
                                            <Button size="sm" variant="ghost" onClick={() => setDecision(null)}>Cancel</Button>
                                            <Button size="sm" disabled={busy || reason.trim().length < 5} onClick={confirmDecision}>
                                                {busy ? 'Saving...' : decisionCopy[decision].confirm}
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                {(onEscalate || (hasAccount && onIssueWarning)) && (
                                    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 space-y-2">
                                        <p className="text-[11px] text-amber-900">
                                            <strong>Not complying, or the pet is a danger?</strong> You can act any time, without waiting for the deadline.
                                            Warn first if you want to: after escalation the subdivision can no longer issue a warning.
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {hasAccount && onIssueWarning && (
                                                <Button size="sm" variant="soft-warning" onClick={() => issueFor(f.report_id)}>
                                                    <ShieldAlert className="w-3.5 h-3.5 mr-1.5" /> Issue owner warning
                                                </Button>
                                            )}
                                            {onEscalate && (
                                                <Button size="sm" variant="warning" onClick={onEscalate}>
                                                    <Send className="w-3.5 h-3.5 mr-1.5" /> Escalate to Barangay
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}

                {/* 3. Ended */}
                {f && !observing && (
                    <div className="space-y-3">
                        <div className="rounded-xl px-3 py-2.5 bg-gray-50 border border-gray-200">
                            <p className="text-sm font-black text-gray-900">{f.closing_outcome || f.status}</p>
                            {f.closing_reason && <p className="text-xs text-gray-600 mt-0.5">{f.closing_reason}</p>}
                            <p className="text-[11px] text-gray-400 mt-1">
                                Observed {fmt(f.opened_at)} to {fmt(f.closed_at)}{f.closed_by_name ? ` · by ${f.closed_by_name}` : ''}
                            </p>
                        </div>
                        {incidents.some(id => (warnings[id] || []).length > 0) && (
                            <div className="space-y-1.5">
                                <p className={sectionTitle}>Owner warnings</p>
                                <ul className="space-y-1">
                                    {incidents.flatMap(id => (warnings[id] || []).map(w => (
                                        <li key={w.warning_id} className="text-[11px] text-amber-800">
                                            <ShieldAlert className="w-3 h-3 inline mr-1" />Report #{id}: {w.warning_level} · {w.violation_type}
                                            {w.created_at ? ` · ${fmt(w.created_at)}` : ''} · {w.status}
                                        </li>
                                    )))}
                                </ul>
                            </div>
                        )}
                        {contacts.length > 0 && (
                            <div className="space-y-1.5">
                                <p className={sectionTitle}>Contact log · {contacts.length}</p>
                                <ol className="space-y-1.5">
                                    {contacts.map(c => {
                                        const st = METHOD_STYLE[c.method] || METHOD_STYLE['In-app'];
                                        return (
                                            <li key={c.contact_id} className="flex gap-2 text-[11px] text-gray-600">
                                                <span className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${st.tone}`}>{st.icon}</span>
                                                <span className="min-w-0 break-words"><span className="font-bold">{c.method}</span> · {fmt(c.contacted_at)}: {c.note}</span>
                                            </li>
                                        );
                                    })}
                                </ol>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </section>
    );
}
