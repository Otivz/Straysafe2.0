// Synthetic browser fixture for the Manual Matching, owner-first pet matching and Phase 6-8 screens. Every API call is
// answered in memory (no backend, no live data); the runner also blocks backend and external requests.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { api } from '../../src/utils/api';
import { ThemeProvider } from '../../src/context/ThemeContext';
import { ToastProvider } from '../../src/context/ToastContext';
import '../../src/index.css';

const params = new URLSearchParams(location.search);
const mode = params.get('mode') || 'matching';
const role = Number(params.get('role') || (mode === 'owner' || mode === 'notices' || mode === 'claim-owner' ? 1 : 2));
const dark = params.has('dark');
localStorage.clear(); sessionStorage.clear();
const user = { user_id: role === 1 ? 10 : 42, name: role === 1 ? 'Synthetic owner' : 'Synthetic leader', role_id: role,
    subdivision_id: 1, barangay_id: 1, is_verified: true, status: 'Active',
    access_token: `test.${btoa(JSON.stringify({ user_id: role === 1 ? 10 : 42, role_id: role, exp: 4102444800 }))}.test` };
localStorage.setItem(role === 1 ? 'resident_user' : 'staff_user', JSON.stringify(user));

const long = 'Seen roaming beside the basketball court and along the creek path several times this week. '.repeat(6);
const dueIso = new Date(Date.now() + 2 * 86400000).toISOString();
const photo = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#f59e0b"/></svg>');
const sourceReport = { report_id: 501, report_type: 'Stray Animal', category: 'Roaming Animal', photo_url: photo, photos: [photo],
    animal_type: 'Dog', breed: 'Aspin', color: 'Brown', size: 'Medium', gender: 'Male', coat_pattern: null, landmark: 'Synthetic gate',
    subdivision: 'Synthetic Subdivision', latitude: 14.8, longitude: 121.0, created_at: new Date().toISOString(), status: 'Verified',
    case_id: 501, reporter: { user_id: 7, name: 'Synthetic reporter', phone: '09170000000' }, description: long, condition: null,
    custody_status: 'Sighting' };
const conf = (status: string, extra: Record<string, unknown> = {}) => ({ request_id: 90, status,
    status_label: ({ AWAITING_OWNER_CONFIRMATION: 'Awaiting Owner Confirmation', OWNER_CONFIRMED: 'Owner Confirmed', OWNER_REJECTED: 'Owner Rejected' } as Record<string, string>)[status],
    can_finalize: status === 'OWNER_CONFIRMED', requested_by_name: 'Synthetic leader', requested_at: new Date().toISOString(),
    staff_message: null, owner_response: status === 'OWNER_CONFIRMED' ? 'YES' : status === 'OWNER_REJECTED' ? 'NO' : null,
    owner_note: status === 'OWNER_CONFIRMED' ? 'That is his red collar' : null, owner_response_at: new Date().toISOString(),
    cancel_reason: null, cancelled_at: null, final_decision: null, final_by_name: null, final_at: null, ...extra });
const petCard = (id: number, name: string, confirmation: unknown, can_send_reason: string | null = null) => ({ pet_id: id,
    reference_code: `P-${id}`, pet_name: name, animal_type: 'Dog', breed: 'Aspin', color: 'Brown', gender: 'Male', size: 'Medium',
    distinctive_markings: 'Red collar', photo_url: photo, photos: [photo], pet_status: 'Lost', registered_address: 'Synthetic street',
    last_seen_at: null, owner: { user_id: 10, name: 'Synthetic owner', phone: '09171111111', outside_area: false },
    pair: null, distance_km: 0.3, shared_details: ['Both dogs', 'Shares color: brown'], confirmation, can_send_reason });
const pets = [petCard(1, 'Fresh', null), petCard(2, 'Waiting', conf('AWAITING_OWNER_CONFIRMATION')),
    petCard(3, 'Confirmed', conf('OWNER_CONFIRMED')), petCard(4, 'Declined', conf('OWNER_REJECTED'), 'The owner said this is not their pet. Search for another registered pet.')];

const requests: { method: string; path: string; body: unknown }[] = [];
Object.assign(window, { fixtureRequests: requests });
window.alert = () => {};
window.confirm = () => true;

api.defaults.adapter = async config => {
    const url = new URL(String(config.url), location.origin);
    const path = url.pathname.replace(/\/$/, '');
    const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
    requests.push({ method: String(config.method), path, body });
    let data: unknown = [];
    let status = 200;
    if (path === '/manual-matching/status') data = { state: 'disabled', ai_available: false, manual_mode_active: true, reason: 'Google Gemini is turned OFF in Admin Settings.' };
    else if (path === '/manual-matching/match-pair') {
        const candidate = pets.find(p => p.pet_id === (body as {pet_id:number}).pet_id)!;
        const confirmation = candidate.confirmation as {status:string;owner_note?:string} | null;
        data = {match_id:candidate.pet_id,source_report_id:501,source_report:{...sourceReport,media:[]},matched_pet_id:candidate.pet_id,
            matched_pet:{...candidate,owner_id:10,pet_type:'Dog'},matching_mode:'manual',ai_evidence:{engine:'manual'},
            status:'PENDING_VERIFICATION',owner_confirmation_status:confirmation?.status || 'PENDING',owner_note:confirmation?.owner_note};
    }
    else if (path === '/manual-matching/reports') data = { results: [sourceReport], count: 1 };
    else if (path === '/manual-matching/reports/501') data = sourceReport;
    else if (path === '/manual-matching/reports/501/pet-candidates') data = { source: sourceReport, results: pets, count: pets.length, blocked_reason: null };
    else if (path === '/manual-matching/reports/501/candidates') data = { source: sourceReport, results: [], count: 0 };
    else if (/^\/manual-matching\/pets\/\d+$/.test(path)) data = pets.find(p => p.pet_id === Number(path.split('/').pop()));
    else if (path === '/manual-matching/pet-confirmations') data = { results: [] };
    else if (path === '/manual-matching/history') data = { results: [] };
    else if (path === '/pet-match-confirmations/mine') data = { pending: 1, results: [
        { request_id: 90, question: 'Is this the animal you registered as your pet?', status: 'AWAITING_OWNER_CONFIRMATION', status_label: 'Awaiting Owner Confirmation',
          requested_at: new Date().toISOString(), requested_by_name: 'Synthetic leader', staff_message: 'Please check the collar', owner_response: null,
          owner_note: null, owner_response_at: null, final_label: null, final_at: null,
          reported_animal: { report_id: 501, photos: [photo], animal_type: 'Dog', breed: 'Aspin', color: 'Brown', size: 'Medium', coat_pattern: null,
              description: long, condition: null, landmark: 'Synthetic gate', subdivision: 'Synthetic Subdivision', reported_at: new Date().toISOString() },
          your_pet: { pet_id: 1, pet_name: 'Bantay', reference_code: 'P-1', photos: [photo], animal_type: 'Dog', breed: 'Aspin', color: 'Brown', gender: 'Male', distinctive_markings: 'Red collar' } }] };
    else if (/^\/pet-match-confirmations\/\d+\/respond$/.test(path)) data = { message: 'Thank you.', request: null };
    else if (path === '/owner-followups/by-report/501') data = { followup_id: 5, status: 'observing', owner_id: params.has('offline') ? null : 10 };
    else if (path === '/owner-followups/5/repeated-reports') data = { followup_id: 5, observed_report_id: 501, can_log: true,
        candidates: [{ report_id: 502, landmark: 'Synthetic court', created_at: new Date().toISOString(), description: long.slice(0, 160) }], logged: [] };
    else if (path === '/warnings/followup/5/incidents') data = { followup_id: 5, incidents: [{ report_id: 501, kind: 'observed', incident_date: new Date().toISOString(),
        warnings: [{ warning_id: 1, warning_level: '1st Warning', violation_type: 'Free-Roaming Unleashed', status: 'Pending' }],
        prefill: { suggested_tier: '2nd Warning', comply_by: dueIso } }] };
    else if (path === '/owner-followups/5/repeated-incidents') data = { incident_id: 1, report_id: 502 };
    else if (path === '/leader-identity/reports/501') data = { report_id: 501, methods: ['In-Person Inspection', 'Owner Interview'], matches: [
        { match_id: 77, pet_id: 1, pet_name: 'Bantay', owner_confirmation_status: 'OWNER_REJECTED', staff_confirmed_at: new Date().toISOString(),
          eligible: true, trigger: 'OWNER_REJECTED', blocked_reason: null, verification: null }] };
    else if (path === '/warnings/report/501') data = [{ warning_id: 3, warning_level: '1st Warning', violation_type: 'Free-Roaming Unleashed',
        description: long, status: 'Pending', issued_at: new Date().toISOString(), acknowledged_at: null, issuer_name: 'Synthetic leader', issuer_role: 'Subdivision Leader', pet_name: 'Bantay' }];
    else if (/^\/warnings\/\d+\/acknowledge$/.test(path)) data = { warning_id: 3, status: 'Acknowledged' };
    else if (/^\/claims\/\d+\/(whereabouts|close-not-needed)$/.test(path)) data = { claim_id: 8, status: path.endsWith('close-not-needed') ? 'Not Needed' : 'Pending Review',
        custody: { held: false, holder: null, reason: 'Nobody has picked up or is holding this animal, so there is nothing to claim yet.', adopted: false, returned: false, not_needed: !path.endsWith('close-not-needed') },
        owner_whereabouts: (body as { answer?: string })?.answer || null, closed_reason: (body as { reason?: string })?.reason || null };
    else if (path.includes('/sidebar') || path.includes('/unread')) data = {};
    else status = 200;
    return { config, status, statusText: 'OK', headers: {}, data };
};

let content: React.ReactNode;
if (mode === 'matching') {
    const { default: Workspace } = await import('../../src/components/ManualMatching/ManualMatchingWorkspace');
    content = <Workspace reportPath={(id: number) => `/subd/reports/${id}`} />;
} else if (mode === 'owner') {
    const { default: Panel } = await import('../../src/components/PetMatchConfirmationRequests');
    content = <Panel />;
} else if (mode === 'repeat') {
    const { default: Banner } = await import('../../src/components/RepeatedReportBanner');
    const { default: Identity } = await import('../../src/components/LeaderIdentityConfirm');
    content = <div className="space-y-3 p-3"><Banner reportId={501} /><Identity reportId={501} /></div>;
} else if (mode === 'notices') {
    const { default: Notices } = await import('../../src/components/ReportWarningNotices');
    content = <div className="p-3"><Notices reportId={501} /></div>;
} else if (mode === 'claim-owner' || mode === 'claim-staff') {
    const { default: Panel } = await import('../../src/components/ClaimNotNeededPanel');
    const claim = { claim_id: 8, status: params.get('status') || 'Pending Review', owner_whereabouts: 'still_missing', owner_whereabouts_note: 'Looking near the creek',
        owner_whereabouts_at: new Date().toISOString(),
        custody: { held: false, holder: null, reason: 'Nobody has picked up or is holding this animal, so there is nothing to claim yet.', adopted: false, returned: false, not_needed: true } };
    const Wrapper = () => {
        const [c, setC] = React.useState<typeof claim>(claim);
        return <div className="p-3"><Panel claim={c} viewer={mode === 'claim-owner' ? 'owner' : 'staff'} onChanged={(u) => setC({ ...c, ...(u as typeof claim) })} /></div>;
    };
    content = <Wrapper />;
} else if (mode === 'timeline') {
    const { default: Timeline } = await import('../../src/components/RescueTimeline');
    const { getCaseStages } = await import('../../src/utils/caseStages');
    const t = (h: number) => new Date(Date.now() - h * 3600000).toISOString();
    const history = [
        { history_id: 1, report_status_id: 2, remarks: 'Incident verified by the subdivision.', created_at: t(72) },
        { history_id: 2, report_status_id: 7, remarks: 'Observation started: the owner has until Nov 04, 2026 01:00 PM to address the report.', created_at: t(48) },
        { history_id: 3, report_status_id: 7, remarks: 'Observation extended by 2 days: new deadline Nov 06, 2026 01:00 PM.', created_at: t(24) },
        { history_id: 4, report_status_id: 7, remarks: long, created_at: t(12) },
        { history_id: 5, report_status_id: 4, remarks: 'Observation ended: endorsed to the Barangay.', created_at: t(6) },
        { history_id: 6, report_status_id: 5, remarks: 'Rescue team dispatched to the location.', created_at: t(3) },
        { history_id: 7, report_status_id: 8, remarks: 'Animal admitted to the holding place. Promoted for adoption after the stay.', created_at: t(1) },
    ];
    const report = { report_id: 501, status_id: 7, history, created_at: t(80), custody_status: 'Sighting',
        observation: { open: true, status: 'observing', due_at: dueIso, extended: true, ended_at: null, outcome: null } };
    Object.assign(window, { fixtureStages: getCaseStages(report, null) });
    content = <div className="p-3"><Timeline history={history as never} currentStatusId={8} reportCreatedAt={t(80)} animalType="Dog" landmark="Synthetic gate" /></div>;
}

// The theme key follows the page path, so dark mode is applied directly once the providers have mounted
if (dark) setTimeout(() => document.documentElement.classList.add('dark'), 300);

createRoot(document.getElementById('fixture')!).render(
    <MemoryRouter initialEntries={[mode === 'matching' ? '/subd/manual-matching?report=501&kind=pet' : '/']}><ThemeProvider><ToastProvider>{content}</ToastProvider></ThemeProvider></MemoryRouter>
);
