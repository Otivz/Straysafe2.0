import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import L from 'leaflet';
import { ThemeProvider } from '../../src/context/ThemeContext';
import { ToastProvider } from '../../src/context/ToastContext';
import '../../src/index.css';

localStorage.clear(); sessionStorage.clear();
localStorage.setItem('resident_user', JSON.stringify({
    user_id: 42, name: 'Match Reviewer', email: 'review@example.test', role_id: 1,
    is_verified: true, is_profile_complete: true, subdivision_id: 1,
    access_token: 'test.' + btoa(JSON.stringify({ user_id: 42, exp: 4102444800 })) + '.test',
}));
if (new URLSearchParams(location.search).has('staleClaim')) {
    localStorage.setItem('straysafe_claims_submitted', JSON.stringify([{
        claim_id: 1, report_id: 1, pet_id: 10, status: 'Evidence Requested',
        pet: { status: 'Lost', owner: { email: 'review@example.test' } },
    }]));
}

const maps: L.Map[] = [];
L.Map.addInitHook(function(this: L.Map) { maps.push(this); });
Object.assign(window, {
    reviewMarkerPoints: () => {
        const points: number[][] = [];
        for (const map of maps) map.eachLayer(layer => {
            if (layer instanceof L.Marker && layer.options.icon?.options.className !== 'custom-hq-pin') {
                const point = layer.getLatLng();
                points.push([point.lat, point.lng]);
            }
        });
        return points;
    },
});
const Component = (await import('../../src/pages/citizen/PetMatchReview')).default;
const fixtureWindow = window as Window & { reviewRoot?: ReturnType<typeof createRoot> };
fixtureWindow.reviewRoot?.unmount();
const root = createRoot(document.getElementById('fixture')!);
fixtureWindow.reviewRoot = root;
root.render(
    <MemoryRouter initialEntries={['/resident/reports/1/match-review']}>
        <ThemeProvider><ToastProvider>
            <Routes><Route path="/resident/reports/:reportId/match-review" element={<Component />} /></Routes>
        </ToastProvider></ThemeProvider>
    </MemoryRouter>,
);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
