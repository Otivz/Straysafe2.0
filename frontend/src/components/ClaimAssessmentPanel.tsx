import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../utils/api';
import { assessmentSettled, parsePesoAmount, peso } from '../utils/claimCharges';

// Pet claiming fees (docs/01-system/CLAIM_FEE_ASSESSMENT_RULES.md).
// Dogs: Dog Impounding Fine, PHP 500-1,000 (RA 9482). Cats: a Cat Claiming Charge that Barangay staff type in by hand
// (amount, charge description, reason / basis) or record as "No charge applicable"; never a default or computed amount. Impounding / boarding fees only when
// configured. Barangay staff assess and collect; Subdivision Leaders and residents only see it. The server enforces all
// of this; the panel only shows what applies. Recording a payment never completes the handover.

export interface AssessmentChange {
    action: string;
    field: string | null;
    previous_value: string | null;
    new_value: string | null;
    reason: string | null;
    changed_by_name: string | null;
    changed_at: string | null;
}

export interface ClaimAssessment {
    assessment_id: number;
    claim_id: number;
    claim_reference: string;
    animal_id: string | null;
    animal_name: string | null;
    species: 'Dog' | 'Cat';
    owner_name: string | null;
    fine_category: string;
    fine_label: string;
    fine_amount: number | null;
    fine_configured: boolean;
    fine_note: string | null;
    charge_entry?: 'manual' | 'legal_range';
    charge_description?: string | null;
    no_charge_applicable?: boolean;
    fine_legal_basis: string | null;
    impounding_fee: number | null;
    impounding_fee_basis: string | null;
    boarding_days: number;
    boarding_fee: number | null;
    boarding_fee_basis: string | null;
    total_due: number | null;
    status: 'Assessed' | 'Paid' | 'Waived' | 'Cancelled';
    notes: string | null;
    assessed_by_name: string | null;
    assessed_at: string | null;
    amount_paid: number | null;
    receipt_number: string | null;
    payment_recorded_by_name: string | null;
    paid_at: string | null;
    waiver_reason: string | null;
    waived_by_name: string | null;
    waived_at: string | null;
    changes: AssessmentChange[];
}

interface FeeOption { configured: boolean; min: number | null; max: number | null; legal_basis: string | null }
interface Quote {
    species: 'Dog' | 'Cat' | null;
    fine: (FeeOption & { category: string; label: string; warning?: string; entry?: 'manual' }) | null;
    impounding_fee: FeeOption | null;
    boarding_fee: (FeeOption & { days: number }) | null;
}

const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
const errorText = (e: unknown, fallback: string) => {
    const d = (e as { response?: { data?: { detail?: unknown } } } | null)?.response?.data?.detail;
    return typeof d === 'string' ? d : fallback;
};
const num = (s: string) => (s.trim() === '' ? null : Number(s));
const range = (o: FeeOption | null | undefined) => (o && o.configured ? `${peso(o.min)} – ${peso(o.max)}` : '');
const STATUS_STYLE: Record<string, string> = {
    Assessed: 'bg-amber-50 text-amber-800 border-amber-200',
    Paid: 'bg-green-50 text-green-800 border-green-200',
    Waived: 'bg-sky-50 text-sky-800 border-sky-200',
    Cancelled: 'bg-gray-50 text-gray-600 border-gray-200',
};
const STATUS_TEXT: Record<string, string> = { Assessed: 'Awaiting payment', Paid: 'Paid', Waived: 'Waived', Cancelled: 'Cancelled' };
const ACTION_TEXT: Record<string, string> = {
    created: 'Assessed', adjusted: 'Adjusted', waived: 'Waived', payment_recorded: 'Payment recorded', cancelled: 'Cancelled',
};
const FIELD_TEXT: Record<string, string> = {
    fine_amount: 'Fine', impounding_fee: 'Impounding fee', boarding_fee: 'Boarding fee', boarding_days: 'Boarding days', total_due: 'Total',
};
const MIN_REASON = 10;
const MIN_CHARGE_DESCRIPTION = 3;
const MIN_CHARGE_BASIS = 5;
// Common wordings staff can pick from or replace; no amount is attached to any of them
const CAT_CHARGE_DESCRIPTIONS = ['Cat claiming charge', 'Claiming / release charge', 'Custody and care charge'];
const signedInStaffName = () => {
    try {
        const raw = localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user');
        return raw ? (JSON.parse(raw)?.name as string | undefined) || null : null;
    } catch { return null; }
};

const SpeciesBadge = ({ species }: { species: string | null | undefined }) => (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-wide ${species === 'Cat' ? 'bg-violet-50 text-violet-800 border-violet-200' : 'bg-orange-50 text-orange-800 border-orange-200'}`}>
        {species === 'Cat' ? '🐱 Cat' : species === 'Dog' ? '🐶 Dog' : 'Species unknown'}
    </span>
);

const Row = ({ label, value, sub, strong }: { label: string; value: string; sub?: string | null; strong?: boolean }) => (
    <div className="flex items-start justify-between gap-3 py-1">
        <div className="min-w-0">
            <p className={`text-[11px] ${strong ? 'font-black text-gray-900' : 'font-bold text-gray-700'}`}>{label}</p>
            {sub && <p className="text-[9px] text-gray-500 leading-snug">{sub}</p>}
        </div>
        <p className={`text-[11px] shrink-0 tabular-nums ${strong ? 'font-black text-gray-900' : 'font-bold text-gray-800'}`}>{value}</p>
    </div>
);

const inputCls = 'w-full px-3 py-2 rounded-lg border border-gray-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-role/30 focus:border-role';

type Mode = 'idle' | 'form' | 'confirm' | 'pay' | 'waive' | 'cancel';

const ClaimAssessmentPanel = ({ claimId, claimStatus, viewer, onSettledChange }: {
    claimId: number;
    claimStatus: string;
    viewer: 'staff' | 'leader' | 'owner';
    onSettledChange?: (settled: boolean, assessment: ClaimAssessment | null) => void;
}) => {
    const [assessment, setAssessment] = useState<ClaimAssessment | null>(null);
    const [canManage, setCanManage] = useState(false);
    const [quote, setQuote] = useState<Quote | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [mode, setMode] = useState<Mode>('idle');
    const [editing, setEditing] = useState(false); // adjusting an existing assessment
    const [fine, setFine] = useState('');
    const [impound, setImpound] = useState('');
    const [rate, setRate] = useState('');
    const [days, setDays] = useState('');
    const [notes, setNotes] = useState('');
    // Cats: the manually entered claiming charge
    const [chargeDescription, setChargeDescription] = useState('');
    const [chargeBasis, setChargeBasis] = useState('');
    const [noCharge, setNoCharge] = useState(false);
    const [reason, setReason] = useState('');
    const [receipt, setReceipt] = useState('');
    const [paid, setPaid] = useState('');
    const [showLog, setShowLog] = useState(false);

    const manageable = viewer === 'staff' && canManage;
    const settledRef = useRef(onSettledChange);
    useEffect(() => { settledRef.current = onSettledChange; }, [onSettledChange]);
    const report = useCallback((a: ClaimAssessment | null) => {
        setAssessment(a);
        settledRef.current?.(assessmentSettled(a), a);
    }, []);

    // Render with key={claimId}: a different claim remounts the panel with fresh state.
    useEffect(() => {
        let active = true;
        (async () => {
            try {
                const res = await api.get(`/claim-assessments/claims/${claimId}`);
                const manage = Boolean(res.data?.can_manage);
                const q = viewer === 'staff' && manage ? await api.get(`/claim-assessments/claims/${claimId}/quote`) : null;
                if (!active) return;
                setCanManage(manage);
                setQuote(q ? q.data : null);
                report(res.data?.assessment ?? null);
            } catch (e) {
                if (active) setError(errorText(e, 'Could not load the claiming charges.'));
            } finally {
                if (active) setLoading(false);
            }
        })();
        return () => { active = false; };
    }, [claimId, viewer, report]);

    const fineOpt = quote?.fine ?? null;
    const isCat = quote?.species === 'Cat';
    const impOpt = quote?.impounding_fee ?? null;
    const boardOpt = quote?.boarding_fee ?? null;

    const openForm = (adjust: boolean) => {
        setEditing(adjust);
        setError('');
        setReason('');
        if (adjust && assessment) {
            setFine(assessment.fine_amount != null ? String(assessment.fine_amount) : '');
            setImpound(assessment.impounding_fee ? String(assessment.impounding_fee) : '');
            setDays(String(assessment.boarding_days || 0));
            setRate(assessment.boarding_days ? String(Number(assessment.boarding_fee || 0) / assessment.boarding_days) : (boardOpt?.min != null ? String(boardOpt.min) : ''));
            setNotes(assessment.notes || '');
            setChargeDescription(assessment.charge_description || '');
            setChargeBasis(assessment.species === 'Cat' ? (assessment.fine_legal_basis || '') : '');
            setNoCharge(Boolean(assessment.no_charge_applicable));
        } else {
            setFine('');
            setImpound(impOpt?.configured && impOpt.min === impOpt.max && impOpt.min != null ? String(impOpt.min) : '');
            setRate(boardOpt?.configured && boardOpt.min != null ? String(boardOpt.min) : '');
            setDays(String(boardOpt?.days ?? 0));
            setNotes('');
            setChargeDescription('');
            setChargeBasis('');
            setNoCharge(false);
        }
        setMode('form');
    };

    // Preview of what the server will compute (it recomputes and validates everything).
    const catAmount = isCat && !noCharge ? parsePesoAmount(fine) : { value: null, error: null };
    const fineVal = isCat ? (noCharge ? null : catAmount.value) : fineOpt?.configured ? num(fine) : null;
    const impVal = impOpt?.configured ? (num(impound) ?? 0) : 0;
    const boardDays = boardOpt?.configured ? Math.max(0, Math.floor(num(days) ?? 0)) : 0;
    const boardVal = boardOpt?.configured ? Math.round((num(rate) ?? 0) * boardDays * 100) / 100 : 0;
    const total = (fineVal ?? 0) + impVal + boardVal;
    const outOf = (v: number | null, o: FeeOption | null | undefined) =>
        v != null && o?.configured && o.min != null && o.max != null && (v < o.min || v > o.max);
    const formProblem =
        !quote?.species ? 'Record whether the animal is a dog or a cat before assessing the claim.'
            : isCat && !noCharge && catAmount.error ? catAmount.error
            : isCat && !noCharge && chargeDescription.trim().length < MIN_CHARGE_DESCRIPTION ? 'Enter the charge description.'
            : isCat && chargeBasis.trim().length < MIN_CHARGE_BASIS ? (noCharge ? 'Give the reason why no charge applies.' : 'Enter the reason / basis for the charge.')
            : !isCat && fineOpt?.configured && fineVal == null ? `Enter the ${fineOpt.label} amount (${range(fineOpt)}).`
                : outOf(fineVal, fineOpt) ? `The ${fineOpt?.label} must be within ${range(fineOpt)}.`
                    : impOpt?.configured && outOf(impVal, impOpt) ? `The impounding fee must be within ${range(impOpt)}.`
                        : boardOpt?.configured && boardDays > 0 && outOf(num(rate), boardOpt) ? `The boarding fee per day must be within ${range(boardOpt)}.`
                            : editing && reason.trim().length < MIN_REASON ? `Give the reason for the adjustment (at least ${MIN_REASON} characters).`
                                : '';

    const body = () => ({
        // Cats: the typed amount as text (exact pesos and centavos), description and basis; dogs: the RA 9482 fine
        fine_amount: isCat ? (noCharge ? null : fine.trim()) : fineOpt?.configured ? fineVal : null,
        ...(isCat ? { charge_description: noCharge ? null : chargeDescription.trim(),
            charge_basis: chargeBasis.trim(), no_charge: noCharge } : {}),
        impounding_fee: impOpt?.configured ? impVal : null,
        boarding_rate: boardOpt?.configured ? (num(rate) ?? 0) : null,
        boarding_days: boardOpt?.configured ? boardDays : null,
        notes: notes.trim() || null,
    });

    const run = async (fn: () => Promise<{ data: ClaimAssessment }>, fallback: string) => {
        setBusy(true);
        setError('');
        try {
            const res = await fn();
            report(res.data);
            setMode('idle');
            setEditing(false);
            setReason('');
        } catch (e) {
            setError(errorText(e, fallback));
        } finally {
            setBusy(false);
        }
    };

    const submitAssessment = () => run(
        () => (editing && assessment
            ? api.patch(`/claim-assessments/${assessment.assessment_id}`, { ...body(), reason: reason.trim() })
            : api.post(`/claim-assessments/claims/${claimId}`, body())),
        'Could not save the assessment.',
    );
    const submitPayment = () => assessment && run(
        () => api.post(`/claim-assessments/${assessment.assessment_id}/payment`, { receipt_number: receipt.trim(), amount_paid: num(paid) ?? 0 }),
        'Could not record the payment.',
    );
    const submitReason = (kind: 'waive' | 'cancel') => assessment && run(
        () => api.post(`/claim-assessments/${assessment.assessment_id}/${kind}`, { reason: reason.trim() }),
        kind === 'waive' ? 'Could not waive the charges.' : 'Could not cancel the assessment.',
    );

    const header = (
        <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Claiming Charges</p>
            <div className="flex items-center gap-1.5">
                <SpeciesBadge species={assessment?.species ?? quote?.species} />
                {assessment && (
                    <span className={`px-2 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-wide ${STATUS_STYLE[assessment.status]}`}>
                        {STATUS_TEXT[assessment.status]}
                    </span>
                )}
            </div>
        </div>
    );

    if (loading) {
        return <div className="p-3.5 rounded-2xl border border-gray-200 bg-white text-[11px] text-gray-500 font-medium" data-testid="claim-assessment-panel">Loading claiming charges…</div>;
    }

    const preHandover = claimStatus === 'Approved';

    // ── Breakdown ──
    const breakdown = assessment && (
        <div className="space-y-2">
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
                <p className="text-gray-500">Claim reference <span className="block font-bold text-gray-800">{assessment.claim_reference}</span></p>
                <p className="text-gray-500">Animal ID <span className="block font-bold text-gray-800">{assessment.animal_id || '—'}</span></p>
                <p className="text-gray-500">Animal <span className="block font-bold text-gray-800">{assessment.animal_name || '—'} ({assessment.species})</span></p>
                <p className="text-gray-500">Owner <span className="block font-bold text-gray-800">{assessment.owner_name || '—'}</span></p>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50/60 px-3 py-1.5">
                <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 pt-1">{assessment.species === 'Cat' ? 'Claiming charge' : 'Fine'}</p>
                {assessment.species === 'Cat' ? (
                    <div className="py-1 space-y-0.5" data-testid="cat-charge-breakdown">
                        <Row label={assessment.charge_description || assessment.fine_label}
                            value={assessment.no_charge_applicable ? 'No charge applicable' : assessment.fine_amount != null ? peso(assessment.fine_amount) : (assessment.fine_note || 'Not charged')}
                            sub={assessment.fine_legal_basis ? `Reason / basis: ${assessment.fine_legal_basis}` : null} />
                        <p className="text-[9px] text-gray-500">{assessment.fine_label} · entered manually by {assessment.assessed_by_name || 'Barangay staff'}</p>
                    </div>
                ) : assessment.fine_configured ? (
                    <Row label={assessment.fine_label} value={peso(assessment.fine_amount)} sub={assessment.fine_legal_basis} />
                ) : (
                    <div className="py-1">
                        <p className="text-[11px] font-bold text-gray-700">{assessment.fine_label}</p>
                        <p className="text-[10px] font-bold text-amber-700">{assessment.fine_note} — no fine charged</p>
                    </div>
                )}
                {((Boolean(assessment.impounding_fee) && Number(assessment.impounding_fee) > 0) || (Boolean(assessment.boarding_fee) && Number(assessment.boarding_fee) > 0)) && (
                    <>
                        <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 pt-2 border-t border-gray-100 mt-1">Service fees</p>
                        {Boolean(assessment.impounding_fee) && Number(assessment.impounding_fee) > 0 && (
                            <Row label="Impounding fee" value={peso(assessment.impounding_fee)} sub={assessment.impounding_fee_basis} />
                        )}
                        {Boolean(assessment.boarding_fee) && Number(assessment.boarding_fee) > 0 && (
                            <Row label={`Boarding fee${assessment.boarding_days ? ` (${assessment.boarding_days} day${assessment.boarding_days === 1 ? '' : 's'})` : ''}`} value={peso(assessment.boarding_fee)} sub={assessment.boarding_fee_basis} />
                        )}
                    </>
                )}
                <div className="border-t border-gray-200 mt-1 pt-1">
                    <Row label="Total amount due" value={peso(assessment.total_due)} strong />
                </div>
            </div>
            <p className="text-[9px] text-gray-500">
                Assessed {fmt(assessment.assessed_at)}{assessment.assessed_by_name ? ` by ${assessment.assessed_by_name}` : ''}
                {assessment.notes ? ` · ${assessment.notes}` : ''}
            </p>
            {assessment.status === 'Paid' && (
                <div className="p-2.5 rounded-xl bg-green-50 border border-green-200 text-[10px] text-green-900">
                    <p className="font-black">Paid {peso(assessment.amount_paid)} · OR / Ref. No. {assessment.receipt_number}</p>
                    <p>Recorded {fmt(assessment.paid_at)}{assessment.payment_recorded_by_name ? ` by ${assessment.payment_recorded_by_name}` : ''}</p>
                </div>
            )}
            {assessment.status === 'Waived' && (
                <div className="p-2.5 rounded-xl bg-sky-50 border border-sky-200 text-[10px] text-sky-900">
                    <p className="font-black">Charges waived</p>
                    <p>{assessment.waiver_reason}</p>
                    <p className="text-sky-700">{fmt(assessment.waived_at)}{assessment.waived_by_name ? ` · ${assessment.waived_by_name}` : ''}</p>
                </div>
            )}
            {assessment.changes.length > 0 && (
                <div>
                    <button type="button" onClick={() => setShowLog(v => !v)} className="text-[10px] font-black text-role hover:underline cursor-pointer bg-transparent border-0 p-0">
                        {showLog ? 'Hide' : 'Show'} change history ({assessment.changes.length})
                    </button>
                    {showLog && (
                        <ul className="mt-1.5 space-y-1.5" data-testid="assessment-change-log">
                            {assessment.changes.map((c, i) => (
                                <li key={i} className="text-[10px] text-gray-700 border-l-2 border-gray-200 pl-2">
                                    <span className="font-black">{ACTION_TEXT[c.action] || c.action}</span>
                                    {c.field && <> · {FIELD_TEXT[c.field] || c.field}: {c.previous_value ?? '—'} → {c.new_value ?? '—'}</>}
                                    {!c.field && c.new_value && <> · {c.new_value}</>}
                                    {c.reason && <span className="block text-gray-500">Reason: {c.reason}</span>}
                                    <span className="block text-gray-400">{fmt(c.changed_at)}{c.changed_by_name ? ` · ${c.changed_by_name}` : ''}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );

    // ── Read-only (Subdivision Leader, resident) ──
    if (!manageable) {
        return (
            <div className="p-3.5 rounded-2xl border border-gray-200 bg-white space-y-2.5" data-testid="claim-assessment-panel">
                {header}
                {error && <p className="text-[11px] font-bold text-red-700">{error}</p>}
                {assessment ? breakdown : (
                    <p className="text-[11px] text-gray-500 font-medium">
                        {viewer === 'owner' ? 'The Barangay has not assessed any claiming charges for this claim.' : 'No claiming charges assessed by the Barangay yet.'}
                    </p>
                )}
                {assessment?.status === 'Assessed' && Number(assessment.total_due) > 0 && (
                    <p className="text-[10px] font-bold text-amber-800">
                        {viewer === 'owner'
                            ? 'Pay this amount at the Barangay hall and keep your official receipt. The handover happens after payment.'
                            : 'Payment is collected by the Barangay. Subdivision personnel only monitor.'}
                    </p>
                )}
            </div>
        );
    }

    // ── Barangay staff ──
    const species = quote?.species;
    return (
        <div className="p-3.5 rounded-2xl border border-role-border bg-white space-y-2.5" data-testid="claim-assessment-panel">
            {header}
            {error && <p className="p-2 rounded-lg bg-red-50 border border-red-200 text-[11px] font-bold text-red-700" role="alert">{error}</p>}

            {mode === 'idle' && (
                <>
                    {assessment ? breakdown : (
                        <div className="space-y-1.5">
                            {!species ? (
                                <p className="text-[11px] font-bold text-amber-800">Record whether the animal is a dog or a cat before assessing the claim.</p>
                            ) : isCat ? (
                                <p className="text-[11px] text-gray-600 font-medium">Cat Claiming Charge: entered by Barangay staff (no default amount).</p>
                            ) : (
                                <p className="text-[11px] text-gray-600 font-medium">{fineOpt?.label}: {range(fineOpt)}</p>
                            )}
                            <p className="text-[10px] text-gray-500">No claiming charges assessed yet.{preHandover ? ' Assess them before the handover if any apply.' : ''}</p>
                        </div>
                    )}
                    {preHandover && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                            {!assessment && species && (
                                <button type="button" onClick={() => openForm(false)} className="px-3 py-1.5 rounded-lg bg-role hover:bg-role-hover text-white text-[11px] font-black cursor-pointer border-0">Assess charges</button>
                            )}
                            {assessment?.status === 'Assessed' && (
                                <>
                                    {Number(assessment.total_due) > 0 && (
                                        <button type="button" onClick={() => { setReceipt(''); setPaid(String(assessment.total_due ?? '')); setError(''); setMode('pay'); }} className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black cursor-pointer border-0">Record payment</button>
                                    )}
                                    <button type="button" onClick={() => openForm(true)} className="px-3 py-1.5 rounded-lg bg-role-soft hover:bg-role-muted text-role border border-role-border text-[11px] font-black cursor-pointer">Adjust</button>
                                    {Number(assessment.total_due) > 0 && (
                                        <button type="button" onClick={() => { setReason(''); setError(''); setMode('waive'); }} className="px-3 py-1.5 rounded-lg bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 text-[11px] font-black cursor-pointer">Waive</button>
                                    )}
                                    <button type="button" onClick={() => { setReason(''); setError(''); setMode('cancel'); }} className="px-3 py-1.5 rounded-lg bg-white hover:bg-red-50 text-red-700 border border-red-200 text-[11px] font-black cursor-pointer">Cancel assessment</button>
                                </>
                            )}
                        </div>
                    )}
                </>
            )}

            {mode === 'form' && (
                <div className="space-y-2.5" data-testid="assessment-form">
                    <p className="text-[11px] font-black text-gray-800">{editing ? 'Adjust the assessment' : 'Assess claiming charges'}</p>
                    {isCat && (
                        <fieldset className="space-y-2 rounded-xl border border-violet-200 bg-violet-50/40 p-2.5" data-testid="cat-charge-form">
                            <legend className="px-1 text-[10px] font-black uppercase tracking-wide text-violet-900">🐱 Cat Claiming Charge</legend>
                            <label className="flex items-center gap-2 text-[11px] font-bold text-gray-800">
                                <input type="checkbox" checked={noCharge} onChange={e => setNoCharge(e.target.checked)} aria-label="No claiming charge applies" />
                                No claiming charge applies to this cat
                            </label>
                            {!noCharge && (
                                <>
                                    <label className="block space-y-1">
                                        <span className="text-[10px] font-black text-gray-700">Charge description</span>
                                        <input type="text" list="cat-charge-descriptions" value={chargeDescription} maxLength={200}
                                            onChange={e => setChargeDescription(e.target.value)} className={inputCls} aria-label="Charge description"
                                            placeholder="Enter charge description" />
                                        <datalist id="cat-charge-descriptions">
                                            {CAT_CHARGE_DESCRIPTIONS.map(d => <option key={d} value={d} />)}
                                        </datalist>
                                    </label>
                                    <label className="block space-y-1">
                                        <span className="text-[10px] font-black text-gray-700">Amount (₱)</span>
                                        <input type="text" inputMode="decimal" autoComplete="off" value={fine}
                                            onChange={e => setFine(e.target.value)} className={inputCls} aria-label="Cat claiming charge amount"
                                            placeholder="Enter amount" aria-invalid={Boolean(fine.trim() && catAmount.error)} />
                                        {fine.trim() && catAmount.error && <span className="block text-[10px] font-bold text-red-700">{catAmount.error}</span>}
                                    </label>
                                </>
                            )}
                            <label className="block space-y-1">
                                <span className="text-[10px] font-black text-gray-700">{noCharge ? 'Reason no charge applies' : 'Reason / basis'}</span>
                                <textarea rows={2} value={chargeBasis} maxLength={2000} onChange={e => setChargeBasis(e.target.value)} className={inputCls}
                                    aria-label="Reason / basis" placeholder="Enter reason" />
                            </label>
                            <div className="grid grid-cols-2 gap-2 text-[10px]">
                                <p className="text-gray-500">Assessed by <span className="block font-bold text-gray-800">{signedInStaffName() || 'Signed-in Barangay staff'}</span></p>
                                <p className="text-gray-500">Date assessed <span className="block font-bold text-gray-800">Recorded automatically</span></p>
                            </div>
                        </fieldset>
                    )}
                    {fineOpt && !isCat && (fineOpt.configured ? (
                        <label className="block space-y-1">
                            <span className="text-[10px] font-black text-gray-700">{fineOpt.label} ({range(fineOpt)})</span>
                            <input type="number" min={fineOpt.min ?? 0} max={fineOpt.max ?? undefined} step="0.01" value={fine} onChange={e => setFine(e.target.value)} className={inputCls} aria-label={`${fineOpt.label} amount`} />
                            <span className="block text-[9px] text-gray-500 leading-snug">{fineOpt.legal_basis}</span>
                        </label>
                    ) : (
                        null
                    ))}
                    {impOpt?.configured ? (
                        <label className="block space-y-1">
                            <span className="text-[10px] font-black text-gray-700">Impounding fee ({range(impOpt)})</span>
                            <input type="number" min={impOpt.min ?? 0} max={impOpt.max ?? undefined} step="0.01" value={impound} onChange={e => setImpound(e.target.value)} className={inputCls} aria-label="Impounding fee" />
                            <span className="block text-[9px] text-gray-500 leading-snug">{impOpt.legal_basis}</span>
                        </label>
                    ) : <p className="text-[10px] text-gray-500">Impounding fee: none authorized.</p>}
                    {boardOpt?.configured ? (
                        <div className="space-y-1">
                            <span className="text-[10px] font-black text-gray-700">Boarding fee per day ({range(boardOpt)})</span>
                            <div className="grid grid-cols-2 gap-2">
                                <input type="number" min={boardOpt.min ?? 0} max={boardOpt.max ?? undefined} step="0.01" value={rate} onChange={e => setRate(e.target.value)} className={inputCls} aria-label="Boarding fee per day" />
                                <input type="number" min={0} max={365} step="1" value={days} onChange={e => setDays(e.target.value)} className={inputCls} aria-label="Boarding days" />
                            </div>
                            <span className="block text-[9px] text-gray-500 leading-snug">Days at the facility: {boardOpt.days}. {boardOpt.legal_basis}</span>
                        </div>
                    ) : <p className="text-[10px] text-gray-500">Boarding fee: none authorized.</p>}
                    <label className="block space-y-1">
                        <span className="text-[10px] font-black text-gray-700">Notes (optional)</span>
                        <input type="text" value={notes} onChange={e => setNotes(e.target.value)} className={inputCls} maxLength={2000} />
                    </label>
                    {editing && (
                        <label className="block space-y-1">
                            <span className="text-[10px] font-black text-gray-700">Reason for the adjustment (required)</span>
                            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} className={inputCls} aria-label="Reason for the adjustment" />
                        </label>
                    )}
                    <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-role-soft border border-role-border">
                        <span className="text-[11px] font-black text-gray-800">Total amount due</span>
                        <span className="text-sm font-black text-gray-900 tabular-nums" data-testid="assessment-total-preview">{peso(total)}</span>
                    </div>
                    {formProblem && <p className="text-[10px] font-bold text-amber-800">{formProblem}</p>}
                    <div className="flex gap-1.5">
                        <button type="button" disabled={Boolean(formProblem)} onClick={() => setMode('confirm')} className="px-3 py-1.5 rounded-lg bg-role hover:bg-role-hover disabled:bg-gray-100 disabled:text-gray-400 text-white text-[11px] font-black cursor-pointer border-0">Review total</button>
                        <button type="button" onClick={() => { setMode('idle'); setEditing(false); setError(''); }} className="px-3 py-1.5 rounded-lg bg-white text-gray-700 border border-gray-200 text-[11px] font-black cursor-pointer">Back</button>
                    </div>
                </div>
            )}

            {mode === 'confirm' && (
                <div className="space-y-2" data-testid="assessment-confirm">
                    <p className="text-[11px] font-black text-gray-800">Confirm the {editing ? 'adjusted ' : ''}charges for this {species?.toLowerCase()}</p>
                    <div className="rounded-xl border border-gray-100 bg-gray-50/60 px-3 py-1.5">
                        {isCat ? (
                            <Row label={noCharge ? 'Cat Claiming Charge' : (chargeDescription.trim() || 'Cat Claiming Charge')}
                                value={noCharge ? 'No charge applicable' : peso(fineVal)} sub={`Reason / basis: ${chargeBasis.trim()}`} />
                        ) : (
                            <Row label={fineOpt?.label || 'Fine'} value={fineOpt?.configured ? peso(fineVal) : 'Not charged'} />
                        )}
                        {impVal ? <Row label="Impounding fee" value={peso(impVal)} /> : null}
                        {boardVal ? <Row label={`Boarding fee${boardDays ? ` (${boardDays} day${boardDays === 1 ? '' : 's'})` : ''}`} value={peso(boardVal)} /> : null}
                        <div className="border-t border-gray-200 mt-1 pt-1"><Row label="Total amount due" value={peso(total)} strong /></div>
                    </div>
                    {editing && <p className="text-[10px] text-gray-600">Reason: {reason.trim()}</p>}
                    <div className="flex gap-1.5">
                        <button type="button" disabled={busy} onClick={submitAssessment} className="px-3 py-1.5 rounded-lg bg-role hover:bg-role-hover disabled:opacity-60 text-white text-[11px] font-black cursor-pointer border-0">{busy ? 'Saving…' : 'Confirm assessment'}</button>
                        <button type="button" disabled={busy} onClick={() => setMode('form')} className="px-3 py-1.5 rounded-lg bg-white text-gray-700 border border-gray-200 text-[11px] font-black cursor-pointer">Edit</button>
                    </div>
                </div>
            )}

            {mode === 'pay' && assessment && (
                <div className="space-y-2" data-testid="payment-form">
                    <p className="text-[11px] font-black text-gray-800">Record payment of {peso(assessment.total_due)}</p>
                    <label className="block space-y-1">
                        <span className="text-[10px] font-black text-gray-700">Official receipt (OR) / reference number</span>
                        <input type="text" value={receipt} onChange={e => setReceipt(e.target.value)} className={inputCls} maxLength={60} aria-label="Official receipt number" />
                    </label>
                    <label className="block space-y-1">
                        <span className="text-[10px] font-black text-gray-700">Amount received</span>
                        <input type="number" min={0} step="0.01" value={paid} onChange={e => setPaid(e.target.value)} className={inputCls} aria-label="Amount received" />
                    </label>
                    {num(paid) !== Number(assessment.total_due) && <p className="text-[10px] font-bold text-amber-800">The amount received must equal the total due ({peso(assessment.total_due)}).</p>}
                    <p className="text-[10px] text-gray-500">Recording the payment does not complete the handover. Mark the handover complete separately once the owner receives the animal.</p>
                    <div className="flex gap-1.5">
                        <button type="button" disabled={busy || receipt.trim().length < 3 || num(paid) !== Number(assessment.total_due)} onClick={submitPayment} className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-100 disabled:text-gray-400 text-white text-[11px] font-black cursor-pointer border-0">{busy ? 'Saving…' : 'Confirm payment'}</button>
                        <button type="button" disabled={busy} onClick={() => setMode('idle')} className="px-3 py-1.5 rounded-lg bg-white text-gray-700 border border-gray-200 text-[11px] font-black cursor-pointer">Back</button>
                    </div>
                </div>
            )}

            {(mode === 'waive' || mode === 'cancel') && assessment && (
                <div className="space-y-2" data-testid={`${mode}-form`}>
                    <p className="text-[11px] font-black text-gray-800">{mode === 'waive' ? `Waive ${peso(assessment.total_due)}` : 'Cancel this assessment'}</p>
                    <label className="block space-y-1">
                        <span className="text-[10px] font-black text-gray-700">{mode === 'waive' ? 'Authorized reason for the waiver (required)' : 'Reason (required)'}</span>
                        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} className={inputCls} aria-label={mode === 'waive' ? 'Reason for the waiver' : 'Reason for cancelling'} />
                    </label>
                    {reason.trim().length < MIN_REASON && <p className="text-[10px] text-gray-500">At least {MIN_REASON} characters.</p>}
                    <div className="flex gap-1.5">
                        <button type="button" disabled={busy || reason.trim().length < MIN_REASON} onClick={() => submitReason(mode)} className={`px-3 py-1.5 rounded-lg disabled:bg-gray-100 disabled:text-gray-400 text-white text-[11px] font-black cursor-pointer border-0 ${mode === 'waive' ? 'bg-sky-600 hover:bg-sky-700' : 'bg-red-600 hover:bg-red-700'}`}>{busy ? 'Saving…' : mode === 'waive' ? 'Confirm waiver' : 'Confirm cancellation'}</button>
                        <button type="button" disabled={busy} onClick={() => setMode('idle')} className="px-3 py-1.5 rounded-lg bg-white text-gray-700 border border-gray-200 text-[11px] font-black cursor-pointer">Back</button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ClaimAssessmentPanel;
