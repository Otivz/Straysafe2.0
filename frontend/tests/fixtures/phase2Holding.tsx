import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { api } from '../../src/utils/api';
import { sightingLandmark } from '../../src/utils/sighting';
import { ThemeProvider } from '../../src/context/ThemeContext';
import { ToastProvider } from '../../src/context/ToastContext';
import '../../src/index.css';

const params = new URLSearchParams(location.search);
const mode = params.get('mode') || 'holding';
const count = Number(params.get('count') || 1);
const held = params.has('held');
localStorage.clear(); sessionStorage.clear();
const role = mode === 'barangay' ? 3 : 2;
localStorage.setItem('staff_user', JSON.stringify({ user_id: 42, name: 'Synthetic officer', role_id: role,
    is_head_officer: true, barangay_id: 1, subdivision_id: 1, is_verified: true, status: 'Active',
    access_token: `test.${btoa(JSON.stringify({ user_id: 42, role_id: role, exp: 4102444800 }))}.test` }));
const brgy = { landmark_id: 9, name: 'Synthetic Municipal Holding', subdivision_id: null, barangay_id: 1,
    is_holding_facility: true, facility_type: 'barangay_facility', latitude: 14.806906, longitude: 121.0039297, status: 'Active', capacity: 20 };
const pen = { ...brgy, landmark_id: 10, name: 'Earlier subdivision pen', subdivision_id: 1, facility_type: 'subdivision_facility' };
const animal = (id: number, subdivision_id: number, legacy = false) => ({ holding_id: id, report_id: 100 + id,
    facility_id: legacy ? 10 : 9, facility_name: legacy ? pen.name : brgy.name,
    facility_type: legacy ? pen.facility_type : brgy.facility_type, subdivision_id, barangay_id: 1,
    animal_type: 'Dog', animal_name: id === 1 ? 'Own synthetic animal' : id === 2 ? 'Neighbor synthetic animal' : 'Earlier pen animal',
    facility_status: 2, facility_status_name: 'Healthy', report_status_id: 7, custody_status: legacy ? 'In Subdivision Facility' : 'In Barangay Facility',
    intake_date: new Date(Date.now() - 10 * 86400000).toISOString(), discharge_date: null, timeline: [],
    report_media: [], media: [], report_category: 'Roaming Animal', report_landmark: 'Synthetic street', breed: 'Aspin' });
const rows = [animal(1, 1), animal(2, 2), animal(3, 1, true)];
const pet = { pet_id: 11, pet_name: 'Synthetic dog', pet_type: 'Dog', status: 'Found', breed: 'Aspin' };
const report = { report_id: 1, user_id: 41, assigned_leader_id: 42, pet_id: 11, pet, subdivision_id: 1,
    status_id: held ? 7 : 2, current_status_id: held ? 7 : 2, category_id: 4, category_name: 'Roaming Animal',
    animal_type: 'Dog', animal_count: count, description: 'Synthetic sighting', media: [], history: [],
    custody_status: held ? 'In Barangay Facility' : 'Stray sighting', facility_id: held ? 9 : null,
    facility: held ? brgy : null, latitude: 14.801, longitude: 121.003, landmark: 'Synthetic street' };
const requests: { method: string; path: string; body: unknown }[] = [];
Object.assign(window, { phase2Requests: requests, phase2Saved: false, phase2Alerts: [],
    phase2SightingLabel: (label: string) => sightingLandmark({ initial_landmark: label }) });
window.alert = message => { (window as unknown as { phase2Alerts: string[] }).phase2Alerts.push(String(message)); };
window.confirm = () => true;

api.defaults.adapter = async config => {
    const url = new URL(String(config.url), location.origin);
    const path = url.pathname.replace(/\/$/, '');
    const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
    requests.push({ method: String(config.method), path, body });
    let data: unknown = [];
    if (path === '/holding') data = mode === 'dashboard'
        ? [rows[0], rows[2], { ...rows[0], holding_id: 4, facility_status: 8, report_status_id: 8 },
            { ...rows[0], holding_id: 5, facility_status: 7, discharge_date: new Date().toISOString() }]
        : mode === 'barangay' || config.params?.barangay_only
            ? rows.slice(0, 2) : params.has('legacy') ? [rows[0], rows[2]] : [rows[0]];
    else if (/^\/holding\/\d+$/.test(path)) data = rows.find(a => a.holding_id === Number(path.split('/').pop()));
    else if (path === '/holding/metrics') data = { total: 2, healthy: 2, need_treatment: 0, for_adoption: 0, nearing_expiry: 0, overdue: 2, resolved_today: 0 };
    else if (path === '/landmarks') data = mode === 'settings' ? [pen] : config.params?.subdivision_id || url.searchParams.has('subdivision_id') ? [pen] : [brgy];
    else if (path.includes('/jurisdictions')) data = { barangays: [{ barangay_id: 1, barangay_name: 'Synthetic Barangay' }], subdivisions: [{ subdivision_id: 1, subdivision_name: 'Synthetic Subdivision', barangay_id: 1 }] };
    else if (path === '/reports/1') data = report;
    else if (/\/split-group$/.test(path)) data = { is_group: false, can_split: true, can_replace_photo: true, children: [], group: { animal_count: count } };
    else if (/\/reports\/1\/status$/.test(path)) data = { ...report, ...(body as object) };
    else if (path === '/reports/coverage-area') data = { id: 1, subdivision_id: 1, center_label: 'Synthetic area', center_latitude: 14.801042, center_longitude: 121.003648, radius_meters: 1000 };
    else if (/^\/pets\/11$/.test(path)) data = pet;
    else if (path.includes('/sidebar')) data = {};
    else if (path.includes('/unread-counts')) data = { counts: {}, total: 0 };
    else if (path.startsWith('/users/')) data = { user_id: 42, name: 'Synthetic officer', role_id: role, subdivision_id: 1, barangay_id: 1 };
    return { config, status: 200, statusText: 'OK', headers: {}, data };
};

let content: React.ReactNode;
if (mode === 'modal') {
    const { ResolveLostPetModal } = await import('../../src/components/Modals/ResolveLostPetModal');
    content = <ResolveLostPetModal isOpen onClose={() => {}} pet={pet} report={report} reportId={1}
        onSuccess={() => Object.assign(window, { phase2Saved: true })} />;
} else if (mode === 'animals') {
    const { default: Panel } = await import('../../src/components/AnimalRecordsPanel');
    content = <Panel reportId={1} basePath="/subd/reports" animalCount={count} />;
} else if (mode === 'dashboard') {
    const { default: Dashboard } = await import('../../src/pages/Subd_Leaders/SubdDashboard');
    content = <Dashboard />;
} else if (mode === 'settings') {
    const { default: Settings } = await import('../../src/pages/Subd_Leaders/SubdSettings');
    content = <Settings />;
} else if (mode === 'barangay') {
    const { default: Holding } = await import('../../src/pages/Barangay_Staff/BrgyHoldingFacility');
    content = <Holding />;
} else {
    const { default: Holding } = await import('../../src/pages/Subd_Leaders/SubdHoldingFacility');
    content = <Holding />;
}
const root = createRoot(document.getElementById('fixture')!);
root.render(<MemoryRouter><ThemeProvider><ToastProvider>{content}</ToastProvider></ThemeProvider></MemoryRouter>);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
