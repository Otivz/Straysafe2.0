import { useCallback, useEffect, useState } from 'react';
import api from '../utils/api';
import { peso } from '../utils/claimCharges';

// Claiming fee schedules (docs/01-system/CLAIM_FEE_ASSESSMENT_RULES.md). The dog fine is fixed by RA 9482 and not
// editable. Impounding and boarding fees exist only when the Barangay Head Officer (or an Admin) configures them from an
// approved ordinance or policy, with its legal basis. Cat claiming charges are entered by staff on each assessment.

interface Schedule {
    schedule_id: number;
    fee_type: string;
    label: string;
    min_amount: number;
    max_amount: number;
    legal_basis: string;
    created_at: string | null;
}
interface ScheduleList {
    dog_fine: { label: string; min: number; max: number; legal_basis: string };
    schedules: Schedule[];
    can_configure: boolean;
}

const FEE_TYPES = [
    { id: 'IMPOUNDING_FEE', label: 'Impounding Fee', hint: 'A service fee per claim, if an ordinance authorizes it.' },
    { id: 'BOARDING_FEE_PER_DAY', label: 'Boarding Fee (per day)', hint: 'Charged per day at the facility, if an ordinance authorizes it.' },
];
const errorText = (e: unknown, fallback: string) => {
    const d = (e as { response?: { data?: { detail?: unknown } } } | null)?.response?.data?.detail;
    return typeof d === 'string' ? d : fallback;
};
const inputCls = 'w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-role/30 focus:border-role';

const ClaimFeeSettingsCard = () => {
    const [data, setData] = useState<ScheduleList | null>(null);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [busy, setBusy] = useState(false);
    const [editing, setEditing] = useState<string | null>(null);
    const [min, setMin] = useState('');
    const [max, setMax] = useState('');
    const [basis, setBasis] = useState('');
    const [removing, setRemoving] = useState<Schedule | null>(null);
    const [reason, setReason] = useState('');

    const fetchList = useCallback(() => api.get<ScheduleList>('/claim-assessments/schedules').then(r => r.data), []);
    const load = useCallback(async () => setData(await fetchList()), [fetchList]);
    useEffect(() => {
        let active = true;
        fetchList()
            .then(d => { if (active) setData(d); })
            .catch(e => { if (active) setError(errorText(e, 'Could not load the claiming fees.')); });
        return () => { active = false; };
    }, [fetchList]);

    const current = (feeType: string) => data?.schedules.find(s => s.fee_type === feeType) ?? null;

    const save = async () => {
        if (!editing) return;
        setBusy(true);
        setError('');
        try {
            await api.post('/claim-assessments/schedules', {
                fee_type: editing, species: null,
                min_amount: Number(min), max_amount: Number(max), legal_basis: basis.trim(),
            });
            setNotice('Saved. New assessments use this schedule; existing assessments keep their amounts.');
            setEditing(null);
            await load();
        } catch (e) {
            setError(errorText(e, 'Could not save the fee.'));
        } finally {
            setBusy(false);
        }
    };

    const remove = async () => {
        if (!removing) return;
        setBusy(true);
        setError('');
        try {
            await api.post(`/claim-assessments/schedules/${removing.schedule_id}/deactivate`, { reason: reason.trim() });
            setNotice(`${removing.label} removed. It can no longer be charged.`);
            setRemoving(null);
            await load();
        } catch (e) {
            setError(errorText(e, 'Could not remove the fee.'));
        } finally {
            setBusy(false);
        }
    };

    const minN = Number(min), maxN = Number(max);
    const formProblem = min.trim() === '' || max.trim() === '' ? 'Enter the minimum and maximum amounts (equal for a fixed amount).'
        : !(minN >= 0) || !(maxN >= 0) ? 'Amounts can\'t be negative.'
            : minN > maxN ? 'The minimum can\'t be greater than the maximum.'
                : basis.trim().length < 5 ? 'Cite the approved ordinance, resolution or policy that authorizes this charge.' : '';

    return (
        <div className="space-y-5" data-testid="claim-fee-settings">
            <div>
                <h3 className="text-base font-black text-gray-900">Pet Claiming Fines & Fees</h3>
                <p className="text-xs text-gray-500 font-medium mt-1">
                    Charges Barangay staff may assess when an owner claims an impounded animal. Only charges with an approved legal basis can be configured.
                    {data && !data.can_configure && ' Only the Barangay Head Officer can change them.'}
                </p>
            </div>
            {error && <p className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs font-bold text-red-700" role="alert">{error}</p>}
            {notice && <p className="p-2.5 rounded-lg bg-green-50 border border-green-200 text-xs font-bold text-green-800">{notice}</p>}

            {data && (
                <>
                    <div className="p-4 rounded-2xl border border-orange-200 bg-orange-50/50 space-y-1">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                            <p className="text-sm font-black text-gray-900">🐶 {data.dog_fine.label}</p>
                            <p className="text-sm font-black text-gray-900 tabular-nums">{peso(data.dog_fine.min)} – {peso(data.dog_fine.max)}</p>
                        </div>
                        <p className="text-[11px] text-gray-600 leading-snug">{data.dog_fine.legal_basis}</p>
                        <p className="text-[10px] font-bold text-gray-500">Set by national law; not editable here. Applies to dogs only.</p>
                    </div>

                    <div className="p-4 rounded-2xl border border-violet-200 bg-violet-50/50 space-y-1" data-testid="cat-charge-note">
                        <p className="text-sm font-black text-gray-900">🐱 Cat Claiming Charge</p>
                        <p className="text-[11px] text-gray-600 leading-snug">
                            Entered by authorized Barangay staff on each claim assessment: charge description, amount in pesos and reason / basis,
                            or a record that no charge applies. There is no default or configured cat amount.
                        </p>
                    </div>

                    {FEE_TYPES.map(t => {
                        const s = current(t.id);
                        return (
                            <div key={t.id} className="p-4 rounded-2xl border border-gray-200 bg-white space-y-2">
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <p className="text-sm font-black text-gray-900">{t.label}</p>
                                    {s ? (
                                        <p className="text-sm font-black text-gray-900 tabular-nums">{s.min_amount === s.max_amount ? peso(s.min_amount) : `${peso(s.min_amount)} – ${peso(s.max_amount)}`}</p>
                                    ) : (
                                        <span className="px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-[10px] font-black text-amber-800 uppercase tracking-wide">
                                            Not authorized
                                        </span>
                                    )}
                                </div>
                                <p className="text-[11px] text-gray-500">{s ? s.legal_basis : `${t.hint} Nothing is charged until it is configured.`}</p>
                                {data.can_configure && editing !== t.id && removing?.fee_type !== t.id && (
                                    <div className="flex gap-1.5">
                                        <button type="button" onClick={() => { setEditing(t.id); setRemoving(null); setNotice(''); setError(''); setMin(s ? String(s.min_amount) : ''); setMax(s ? String(s.max_amount) : ''); setBasis(s ? s.legal_basis : ''); }}
                                            className="px-3 py-1.5 rounded-lg bg-role-soft hover:bg-role-muted text-role border border-role-border text-[11px] font-black cursor-pointer">
                                            {s ? 'Change' : 'Configure'}
                                        </button>
                                        {s && (
                                            <button type="button" onClick={() => { setRemoving(s); setEditing(null); setReason(''); setNotice(''); setError(''); }}
                                                className="px-3 py-1.5 rounded-lg bg-white hover:bg-red-50 text-red-700 border border-red-200 text-[11px] font-black cursor-pointer">Remove</button>
                                        )}
                                    </div>
                                )}
                                {editing === t.id && (
                                    <div className="space-y-2 pt-1">
                                        <div className="grid grid-cols-2 gap-2">
                                            <label className="space-y-1"><span className="text-[10px] font-black text-gray-700">Minimum (₱)</span>
                                                <input type="number" min={0} step="0.01" value={min} onChange={e => setMin(e.target.value)} className={inputCls} aria-label={`${t.label} minimum`} /></label>
                                            <label className="space-y-1"><span className="text-[10px] font-black text-gray-700">Maximum (₱)</span>
                                                <input type="number" min={0} step="0.01" value={max} onChange={e => setMax(e.target.value)} className={inputCls} aria-label={`${t.label} maximum`} /></label>
                                        </div>
                                        <label className="block space-y-1"><span className="text-[10px] font-black text-gray-700">Legal basis (ordinance / resolution / policy, required)</span>
                                            <textarea rows={2} value={basis} onChange={e => setBasis(e.target.value)} className={inputCls} aria-label={`${t.label} legal basis`} placeholder="e.g. Barangay Ordinance No. __, Series of ____, Section __" /></label>
                                        {formProblem && <p className="text-[10px] font-bold text-amber-800">{formProblem}</p>}
                                        <div className="flex gap-1.5">
                                            <button type="button" disabled={busy || Boolean(formProblem)} onClick={save} className="px-3 py-1.5 rounded-lg bg-role hover:bg-role-hover disabled:bg-gray-100 disabled:text-gray-400 text-white text-[11px] font-black cursor-pointer border-0">{busy ? 'Saving…' : 'Save'}</button>
                                            <button type="button" disabled={busy} onClick={() => setEditing(null)} className="px-3 py-1.5 rounded-lg bg-white text-gray-700 border border-gray-200 text-[11px] font-black cursor-pointer">Cancel</button>
                                        </div>
                                    </div>
                                )}
                                {removing?.fee_type === t.id && (
                                    <div className="space-y-2 pt-1">
                                        <label className="block space-y-1"><span className="text-[10px] font-black text-gray-700">Reason for removing (required)</span>
                                            <textarea rows={2} value={reason} onChange={e => setReason(e.target.value)} className={inputCls} aria-label="Reason for removing the fee" /></label>
                                        <div className="flex gap-1.5">
                                            <button type="button" disabled={busy || reason.trim().length < 10} onClick={remove} className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 disabled:bg-gray-100 disabled:text-gray-400 text-white text-[11px] font-black cursor-pointer border-0">{busy ? 'Removing…' : 'Remove fee'}</button>
                                            <button type="button" disabled={busy} onClick={() => setRemoving(null)} className="px-3 py-1.5 rounded-lg bg-white text-gray-700 border border-gray-200 text-[11px] font-black cursor-pointer">Cancel</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </>
            )}
        </div>
    );
};

export default ClaimFeeSettingsCard;
