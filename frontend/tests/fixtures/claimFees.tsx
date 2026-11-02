import React from 'react';
import { createRoot } from 'react-dom/client';
import { api } from '../../src/utils/api';
import ClaimAssessmentPanel from '../../src/components/ClaimAssessmentPanel';
import ClaimFeeSettingsCard from '../../src/components/ClaimFeeSettingsCard';
import '../../src/index.css';

// Synthetic data only. ?mode=panel|settings  &species=Dog|Cat  &viewer=staff|leader|owner  &paid
const params = new URLSearchParams(location.search);
const mode = params.get('mode') || 'panel';
const species = (params.get('species') || 'Dog') as 'Dog' | 'Cat';
const viewer = (params.get('viewer') || 'staff') as 'staff' | 'leader' | 'owner';
localStorage.clear(); sessionStorage.clear();

const DOG_BASIS = 'Republic Act No. 9482 (Anti-Rabies Act of 2007), Section 11(6) (synthetic fixture text)';
const fineOpt = species === 'Dog'
    ? { category: 'DOG_IMPOUNDING_FINE', label: 'Dog Impounding Fine', configured: true, min: 500, max: 1000, legal_basis: DOG_BASIS }
    : { category: 'CAT_CLAIMING_FINE', label: 'Cat Claiming Charge', entry: 'manual', configured: false, min: null, max: null, legal_basis: null };
const quote = { claim_id: 7, species, holding_id: 3, fine: fineOpt,
    impounding_fee: { configured: false, min: null, max: null, legal_basis: null },
    boarding_fee: { configured: false, min: null, max: null, legal_basis: null, days: 3 } };

type A = Record<string, unknown> & { status: string; total_due: number; changes: unknown[] };
let assessment: A | null = params.has('paid') ? {
    assessment_id: 5, claim_id: 7, claim_reference: 'CLM-00007', animal_id: 'P-00011', animal_name: 'Synthetic pet', species,
    owner_name: 'Synthetic owner', fine_category: fineOpt.category, fine_label: fineOpt.label, fine_amount: 600, fine_configured: true,
    fine_note: null, fine_legal_basis: DOG_BASIS, impounding_fee: 0, boarding_days: 0, boarding_fee: 0, total_due: 600, status: 'Paid',
    assessed_by_name: 'Synthetic staff', assessed_at: new Date().toISOString(), amount_paid: 600, receipt_number: 'OR-TEST-1',
    payment_recorded_by_name: 'Synthetic staff', paid_at: new Date().toISOString(), changes: [] } : null;
const schedules: Record<string, unknown>[] = [];
const requests: { method: string; path: string; body: unknown }[] = [];
const settled: boolean[] = [];
Object.assign(window, { feeRequests: requests, feeSettled: settled });

const view = (body: Record<string, string | number | boolean | null>): A => {
    // Mirrors the server: dogs take the RA 9482 amount; cats exactly what staff typed, or no charge
    const cat = species === 'Cat';
    const fine = cat ? (body.no_charge ? null : Number(body.fine_amount)) : Number(body.fine_amount);
    return { charge_entry: cat ? 'manual' : 'legal_range', charge_description: cat ? (body.no_charge ? 'No charge applicable' : body.charge_description) : null,
        no_charge_applicable: cat && Boolean(body.no_charge), assessment_id: 5, claim_id: 7, claim_reference: 'CLM-00007', animal_id: 'P-00011', animal_name: 'Synthetic pet', species,
        owner_name: 'Synthetic owner', fine_category: fineOpt.category, fine_label: fineOpt.label, fine_amount: fine,
        fine_configured: fine != null, fine_note: fine == null ? 'No charge applicable' : null,
        fine_legal_basis: cat ? body.charge_basis : fineOpt.legal_basis,
        impounding_fee: 0, impounding_fee_basis: null, boarding_days: 0, boarding_fee: 0, boarding_fee_basis: null,
        total_due: fine ?? 0, status: 'Assessed', notes: null, assessed_by_name: 'Synthetic staff', assessed_at: new Date().toISOString(),
        amount_paid: null, receipt_number: null, payment_recorded_by_name: null, paid_at: null, waiver_reason: null, waived_by_name: null,
        waived_at: null, changes: [{ action: 'created', field: null, previous_value: null, new_value: String(fine ?? 0),
            reason: null, changed_by_name: 'Synthetic staff', changed_at: new Date().toISOString() }] };
};

api.defaults.adapter = async config => {
    const path = new URL(String(config.url), location.origin).pathname.replace(/\/$/, '');
    const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
    const method = String(config.method);
    requests.push({ method, path, body });
    let data: unknown = {};
    if (path === '/claim-assessments/claims/7' && method === 'get') data = { claim_id: 7, can_manage: viewer === 'staff', assessment };
    else if (path === '/claim-assessments/claims/7/quote') data = quote;
    else if (path === '/claim-assessments/claims/7' && method === 'post') data = assessment = view(body);
    else if (path === '/claim-assessments/5/payment' && assessment) data = assessment = { ...assessment, status: 'Paid', amount_paid: body.amount_paid,
        receipt_number: body.receipt_number, payment_recorded_by_name: 'Synthetic staff', paid_at: new Date().toISOString() };
    else if (path === '/claim-assessments/5/waive' && assessment) data = assessment = { ...assessment, status: 'Waived', waiver_reason: body.reason,
        waived_by_name: 'Synthetic staff', waived_at: new Date().toISOString() };
    else if (path === '/claim-assessments/schedules' && method === 'get') data = {
        dog_fine: { category: 'DOG_IMPOUNDING_FINE', label: 'Dog Impounding Fine', min: 500, max: 1000, legal_basis: DOG_BASIS, editable: false },
        schedules, can_configure: true };
    else if (path === '/claim-assessments/schedules' && method === 'post') {
        const row = { schedule_id: schedules.length + 1, label: 'Impounding Fee', created_at: null, ...body };
        schedules.splice(0, schedules.length, row);
        data = row;
    }
    return { config, status: 200, statusText: 'OK', headers: {}, data };
};

const content = mode === 'settings'
    ? <ClaimFeeSettingsCard />
    : <ClaimAssessmentPanel key={7} claimId={7} claimStatus="Approved" viewer={viewer} onSettledChange={s => settled.push(s)} />;
const root = createRoot(document.getElementById('fixture')!);
root.render(<React.StrictMode>{content}</React.StrictMode>);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
