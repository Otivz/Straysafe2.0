import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import L from 'leaflet';
import { api } from '../../src/utils/api';
import { ThemeProvider } from '../../src/context/ThemeContext';
import { ToastProvider } from '../../src/context/ToastContext';
import '../../src/index.css';

const params = new URLSearchParams(location.search);
const portal = params.get('portal') || 'admin';
const role = portal === 'admin' ? 4 : portal === 'brgy' ? 3 : portal === 'subd' ? 2 : 1;
localStorage.clear(); sessionStorage.clear();
const user = { user_id: 42, role_id: role, name: 'Synthetic map reviewer', barangay_id: 1, subdivision_id: 1,
    is_head_officer: true, is_verified: true, is_profile_complete: true,
    access_token: `test.${btoa(JSON.stringify({ user_id: 42, role_id: role, exp: 4102444800 }))}.test` };
localStorage.setItem(role === 4 ? 'admin_user' : role === 1 ? 'resident_user' : 'staff_user', JSON.stringify(user));

const recent = new Date(Date.now() - 86400000).toISOString();
const report = (id: number, extra: Record<string, unknown> = {}) => ({ report_id: id, user_id: 42, subdivision_id: 1,
    status_id: 2, current_status_id: 2, status: { status_name: 'Verified' }, category_id: 4, animal_type: 'Dog',
    priority_level: 'Medium', description: 'Synthetic dog sighting', landmark: 'Synthetic street',
    initial_landmark: 'Synthetic street', latitude: 14.8005 + id * .0001, longitude: 121.0034,
    initial_latitude: 14.8005 + id * .0001, initial_longitude: 121.0034,
    created_at: recent, media: [], history: [], is_public: true, visibility: 'Public', ...extra });
const reports = [report(1), report(2, { status_id: 10, current_status_id: 10, status: { status_name: 'Released' } }),
    report(3, { status_id: 6, current_status_id: 6, status: { status_name: 'Picked Up' }, latitude: 14.806906, longitude: 121.0039297 }),
    report(4, { category_id: 6 }), report(5, { status_id: 14, current_status_id: 14 }),
    report(6, { split_from_report_id: 1 }), report(7, { duplicate_of_report_id: 1 }),
    report(8, { created_at: new Date(Date.now() - 45 * 86400000).toISOString() })];
const detail = report(1, { viewer_access: params.get('access') || 'public' });

// Every Axios request is answered here: these fixtures never reach the application database.
api.defaults.adapter = async config => {
    const path = new URL(String(config.url), location.origin).pathname.replace(/\/$/, '');
    let data: unknown = [];
    if (path === '/reports') data = params.has('empty') ? [] : reports;
    else if (path === '/reports/1') data = detail;
    else if (path === '/reports/coverage-area') data = { id: 1, subdivision_id: 1, center_label: 'Synthetic area',
        center_latitude: 14.801042, center_longitude: 121.003648, radius_meters: 1000 };
    else if (path === '/holding/by-report/1') data = null;
    else if (path.includes('/hq')) data = { hq_lat: 14.806906, hq_lng: 121.0039297, barangay_name: 'Synthetic Barangay' };
    else if (path.includes('/sidebar')) data = {};
    else if (path.includes('/unread-counts')) data = { counts: {}, total: 0 };
    return { config, status: 200, statusText: 'OK', headers: {}, data };
};

const maps: L.Map[] = [];
L.Map.addInitHook(function(this: L.Map) { maps.push(this); });
const liveMaps = () => maps.filter(map => map.getContainer().isConnected);
Object.assign(window, {
    phase1Snapshot: () => liveMaps().map(map => {
        const markers: { lat: number; lng: number; tooltip: boolean }[] = [];
        const heat: unknown[] = [];
        const circles: number[] = [];
        map.eachLayer(layer => {
            if (layer instanceof L.Marker) markers.push({ ...layer.getLatLng(), tooltip: !!layer.getTooltip() });
            if (layer instanceof L.CircleMarker) circles.push(layer.getRadius());
            const heatLayer = layer as L.Layer & { _latlngs?: unknown[]; _heat?: unknown };
            if (heatLayer._heat && heatLayer._latlngs) heat.push(...heatLayer._latlngs);
        });
        return { markers, heat, circles, zoom: map.getZoom() };
    }),
    phase1ClickEmpty: () => liveMaps().forEach(map => map.fire('click', { latlng: L.latLng(14.801, 121.004) })),
    phase1ClickReport: () => liveMaps().forEach(map => map.eachLayer(layer => {
        if (layer instanceof L.Marker && Math.abs(layer.getLatLng().lat - 14.8006) < .000001) layer.fire('click');
    })),
});

const file = portal === 'admin' ? '../../src/pages/Admin/AdminHeatMap'
    : portal === 'brgy' ? '../../src/pages/Barangay_Staff/BrgyDashboard'
    : portal === 'subd' ? '../../src/pages/Subd_Leaders/SubdDashboard'
    : '../../src/pages/citizen/ResiViewReport';
const Component = (await import(/* @vite-ignore */ file + '.tsx')).default;
const path = portal === 'admin' ? '/admin/heatmap' : portal === 'brgy' ? '/brgy/dashboard'
    : portal === 'subd' ? '/subd/dashboard' : '/resident/reports/1';
const root = createRoot(document.getElementById('fixture')!);
root.render(<MemoryRouter initialEntries={[path]}><ThemeProvider><ToastProvider>
    <Routes><Route path={portal === 'resident' ? '/resident/reports/:id' : path} element={<Component />} /></Routes>
</ToastProvider></ThemeProvider></MemoryRouter>);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
