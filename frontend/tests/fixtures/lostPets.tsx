import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { api } from '../../src/utils/api';
import { ThemeProvider } from '../../src/context/ThemeContext';
import { ToastProvider } from '../../src/context/ToastContext';
import ResiLostPets from '../../src/pages/citizen/ResiLostPets';
import SubdLostPetAlerts from '../../src/pages/Subd_Leaders/SubdLostPetAlerts';
import '../../src/index.css';

// Synthetic data only. ?page=resident-list|resident-detail|leader-list|leader-detail
const params = new URLSearchParams(location.search);
const page = params.get('page') || 'resident-detail';
const leader = page.startsWith('leader');
localStorage.clear(); sessionStorage.clear();
const role = leader ? 2 : 1;
const user = { user_id: leader ? 5 : 2, name: leader ? 'Synthetic Leader' : 'Synthetic Neighbor', role_id: role, subdivision_id: 1, barangay_id: 1, is_verified: true, status: 'Active',
    access_token: `test.${btoa(JSON.stringify({ user_id: leader ? 5 : 2, role_id: role, exp: 4102444800 }))}.test` };
localStorage.setItem(leader ? 'staff_user' : 'resident_user', JSON.stringify(user));
localStorage.setItem('user_id', String(user.user_id));
const LAT = 14.801042, LNG = 121.003648;
const now = new Date();
const iso = (minAgo: number) => new Date(now.getTime() - minAgo * 60000).toISOString().slice(0, 19);
const sightings = [
    { sighting_id: 11, latitude: LAT + 0.0004, longitude: LNG, location_label: 'Lot 15', location_source: 'map_pin', seen_at: iso(75), submitted_at: iso(70),
        description: 'Drinking at the fountain', photo_url: null, status: 'verified', reported_by: leader ? 'Neighbor Ben' : 'A neighbor', is_mine: false },
    { sighting_id: 12, latitude: LAT - 0.0003, longitude: LNG + 0.0002, location_label: 'Clubhouse', location_source: 'device', seen_at: iso(58), submitted_at: iso(20),
        description: null, photo_url: null, status: 'unverified', reported_by: leader ? 'Neighbor Cy' : 'A neighbor', is_mine: false },
];
let status: 'requested' | 'active' | 'closed' = page === 'leader-detail' ? 'requested' : 'active';
const alertBody = () => ({
    alert_id: 7, report_id: 70, status, subdivision: 'Selera Homes',
    pet: { name: 'Bantay', photo_url: null, species: 'Dog', breed: 'Aspin', color: 'Brown with white socks', distinguishing_marks: 'Red collar', description: null },
    owner_first_name: 'Ana', last_seen: { at: iso(120), location: 'Subdivision entrance', latitude: LAT, longitude: LNG },
    contact_preference: 'app_message', contact_text: 'Message the owner through StraySafe (open the alert and use the chat).',
    owner_note: 'Shy, answers to Bantay', leader_message: null, requested_at: iso(130), activated_at: status === 'active' ? iso(110) : null,
    closed_at: null, close_outcome: null, close_reason: null, sighting_count: sightings.length,
    latest_sighting: sightings.slice().sort((a, b) => b.submitted_at.localeCompare(a.submitted_at))[0] || null,
    accepting_sightings: status === 'active', is_owner: false, can_manage: leader, residents_notified: leader ? 12 : null, sightings,
});
// Reverse geocoding (OpenStreetMap Nominatim) answered locally with a synthetic street named after the pin's coordinates
const geoRequests: string[] = [];
const realFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.includes('nominatim.openstreetmap.org/reverse')) return realFetch(input, init);
    geoRequests.push(url);
    const q = new URL(url).searchParams;
    const street = `Synthetic Street ${Number(q.get('lat')).toFixed(4)}`;
    return Promise.resolve(new Response(JSON.stringify({ display_name: street, address: { road: street, suburb: 'Test Phase', city: 'Test City' } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }));
};
Object.assign(window, { geoRequests });

const requests: { method: string; path: string; body: unknown }[] = [];
Object.assign(window, { lostRequests: requests });

api.defaults.adapter = async config => {
    const path = new URL(String(config.url), location.origin).pathname.replace(/\/$/, '');
    const method = String(config.method);
    let body: unknown = config.data;
    if (config.data instanceof FormData) body = Object.fromEntries(config.data.entries());
    else if (typeof config.data === 'string') body = JSON.parse(config.data);
    requests.push({ method, path, body });
    let data: unknown = [];
    if (path === '/lost-pet-alerts/active') data = { results: [alertBody()] };
    else if (path === '/lost-pet-alerts/7' && method === 'get') data = alertBody();
    else if (path === '/lost-pet-alerts/7/activate') { status = 'active'; data = alertBody(); }
    else if (path === '/lost-pet-alerts/7/sightings') {
        const b = body as Record<string, string>;
        const s = { sighting_id: 13, latitude: Number(b.latitude), longitude: Number(b.longitude), location_label: b.location_label || null, location_source: b.location_source,
            seen_at: b.seen_at, submitted_at: iso(0), description: b.description || null, photo_url: null, status: 'unverified', reported_by: 'You', is_mine: true };
        sightings.push(s as typeof sightings[number]);
        data = { sighting: s, duplicate: false };
    } else if (path === '/lost-pet-alerts/dashboard') data = {
        stats: { active_alerts: 1, requested_alerts: 1, total_sightings: 2, pets_reunited: 3, pending_lost_reports: 1 },
        requested: [], active: [alertBody()], resolved: [],
        recent_sightings: sightings.map(s => ({ ...s, alert_id: 7, pet_name: 'Bantay' })),
        pending_reports: [{ report_id: 71, created_at: iso(300), landmark: 'Phase 2', animal_type: 'Cat' }],
    };
    else if (path.includes('unread')) data = { counts: {}, total: 0 };
    else if (path.startsWith('/users/')) data = user;
    return { config, status: 200, statusText: 'OK', headers: {}, data };
};

const entry = { 'resident-list': '/resident/lost-pets', 'resident-detail': '/resident/lost-pets/7', 'leader-list': '/subd/lost-pet-alerts', 'leader-detail': '/subd/lost-pet-alerts/7' }[page] || '/resident/lost-pets/7';
const root = createRoot(document.getElementById('fixture')!);
root.render(<MemoryRouter initialEntries={[entry]}><ThemeProvider><ToastProvider><Routes>
    <Route path="/resident/lost-pets" element={<ResiLostPets />} />
    <Route path="/resident/lost-pets/:alertId" element={<ResiLostPets />} />
    <Route path="/subd/lost-pet-alerts" element={<SubdLostPetAlerts />} />
    <Route path="/subd/lost-pet-alerts/:alertId" element={<SubdLostPetAlerts />} />
    <Route path="*" element={<p>Navigated away</p>} />
</Routes></ToastProvider></ThemeProvider></MemoryRouter>);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
