import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { api } from '../../src/utils/api';
import { ThemeProvider } from '../../src/context/ThemeContext';
import { ToastProvider } from '../../src/context/ToastContext';
import { usePetPhotoGuard, PetPhotoGuardPanel } from '../../src/components/PetPhotoGuard';
import { mapRawPetToPetRecord } from '../../src/components/PetRecords/types';
import '../../src/index.css';

const params = new URLSearchParams(location.search);
const mode = params.get('mode') || 'guard';
const role = mode === 'resident' ? 1 : params.has('brgy') ? 3 : 2;
const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6NKsAAAAASUVORK5CYII=';
localStorage.clear(); sessionStorage.clear();
const actor = { user_id: 42, name: 'Synthetic actor', role_id: role, barangay_id: 1, subdivision_id: 1,
    is_verified: true, is_head_officer: true, status: 'Active', access_token: `test.${btoa(JSON.stringify({ user_id: 42, role_id: role, exp: 4102444800 }))}.test` };
localStorage.setItem(role === 1 ? 'resident_user' : 'staff_user', JSON.stringify(actor));
const pet = { pet_id: 11, pet_name: 'Synthetic pet', pet_type: 'Dog', breed: 'Aspin', owner_id: params.has('adopted') ? null : 42,
    owner: params.has('adopted') ? null : actor, gender: 'Male', status: 'Active', primary_color: 'Brown', size_category: 'Medium',
    color_markings: 'Tricolor coat', distinctive_markings: 'Tricolor coat', photo_url: photo,
    declared_bite_history: true, declared_chase_behavior: true, verified_bite_count: 0, verified_chase_count: 0,
    photo_check_status: 'ai_generated', photo_check_details: 'Legacy verdict must not display',
    adoption_info: params.has('adopted') ? { state: 'in_progress', adopter_name: 'Synthetic adopter', adoption_id: 99 } : null };
const report = { report_id: 1, animal_type: 'Dog', animal_breed: 'Aspin', animal_color: 'Brown',
    subdivision_id: 1, current_status_id: 2, status_id: 2, user_id: 41, animal_count: 1, media: [],
    description: 'Custody: Hidden custody sentinel | Pattern: Tricolor | Markings: Left ear scar | Notes: Hidden encounter sentinel',
    created_at: '2026-10-29T10:00:00Z' };
const claim = { claim_id: 17, pet_id: 11, report_id: 1, status: 'Pending Review', remarks: 'I confirm this is my pet.',
    pet, report, vaccine_card_url: photo, created_at: '2026-10-29T12:00:00Z' };
const match = { match_id: 1, source_report_id: 1, source_report: report, matched_pet_id: 11,
    matched_pet: pet, status: 'CONFIRMED_MATCH', owner_confirmation_status: 'OWNER_CONFIRMED',
    similarity_score: 90, claim_id: 17, claim_status: 'Pending Review' };
const requests: { path: string; method: string; body: unknown }[] = [];
const state = { verdict: 'one', guard: null as unknown, requests, closed: false };
Object.assign(window, { phase5: state });
window.alert = () => {};
window.confirm = () => true;
const realFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.origin);
    return url.origin === location.origin ? realFetch(input, init) : Promise.resolve(new Response('[]', { headers: { 'Content-Type': 'application/json' } }));
};
api.defaults.adapter = async config => {
    const path = new URL(String(config.url), location.origin).pathname.replace(/\/$/, '');
    const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
    requests.push({ path, method: String(config.method), body });
    let data: unknown = [];
    if (path === '/reports/analyze-media') {
        if (state.verdict === 'error') throw new Error('Synthetic detector unavailable');
        data = { animal_detected: state.verdict === 'offline' ? null : state.verdict !== 'none', animal_type: 'Cat',
            primary_color: 'Black', secondary_color: 'White', tertiary_color: 'None',
            detected_animal_count: state.verdict === 'multi' ? 2 : state.verdict === 'none' ? 0 : 1,
            multiple_animals_detected: state.verdict === 'multi', possible_breed: 'Unsupported breed', estimated_size: 'Large' };
    } else if (path === '/pets/owner/42') data = [pet];
    else if (path === '/pets/11') data = config.method === 'put' ? { ...pet, ...(body as object) } : pet;
    else if (path === '/claims') data = [claim];
    else if (path === '/reports/1') data = report;
    else if (path.includes('/sidebar') || path.includes('/unread-count')) data = {};
    else if (path === '/users/me' || path === '/users/42') data = actor;
    else if (path === '/pets/existing-for-me') data = { candidates: [] };
    else if (path === '/pet-ownership/by-pet/11') data = null;
    return { config, status: 200, statusText: 'OK', headers: {}, data };
};

export function GuardHarness() {
    const guard = usePetPhotoGuard();
    useEffect(() => { state.guard = guard; }, [guard]);
    const check = () => guard.check(new File(['synthetic'], 'pet.jpg', { type: 'image/jpeg' }), false);
    return <><button onClick={check}>Check synthetic photo</button><output>{JSON.stringify({ noAnimal: guard.noAnimal, blocked: guard.blocked, count: guard.count, checking: guard.checking })}</output>
        <PetPhotoGuardPanel guard={guard} onCropped={file => guard.check(file, true)} /></>;
}
export function LocationProbe() { const route = useLocation(); return <output id="route">{route.pathname + route.search}</output>; }
const [{ default: AddPetModal }, { default: ResidentPet }, { default: AIMatchReviewModal },
    { default: SubdPetClaims }, { default: BrgyPetClaims }, { default: PetDetailPanel }] = await Promise.all([
    import('../../src/components/PetRecords/AddPetModal'), import('../../src/pages/citizen/ResidentPet'),
    import('../../src/components/Modals/AIMatchReviewModal'), import('../../src/pages/Subd_Leaders/SubdPetClaims'),
    import('../../src/pages/Barangay_Staff/BrgyPetClaims'), import('../../src/components/PetRecords/PetDetailPanel'),
]);
export function Fixture() {
    const [open, setOpen] = useState(true);
    return <><LocationProbe />{mode === 'guard' ? <GuardHarness />
        : mode === 'staff' ? <AddPetModal isOpen editPetData={params.has('edit') ? pet : undefined} onClose={() => {}} />
        : mode === 'resident' ? <ResidentPet />
        : mode === 'match' ? <AIMatchReviewModal isOpen={open} match={match} isStaff onClose={() => { state.closed = true; setOpen(false); }} />
        : mode === 'claims' ? role === 3 ? <BrgyPetClaims /> : <SubdPetClaims />
        : <PetDetailPanel pet={mapRawPetToPetRecord(pet)} onClose={() => {}} />}</>;
}
const route = role === 3 ? '/brgy' : role === 1 ? '/resident' : '/subd';
createRoot(document.getElementById('fixture')!).render(<MemoryRouter initialEntries={[`${route}/${mode === 'claims' ? 'pet-claims?claim_id=17' : 'reports/1'}`]}>
    <ThemeProvider><ToastProvider><Fixture /></ToastProvider></ThemeProvider></MemoryRouter>);
