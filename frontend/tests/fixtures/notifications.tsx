// Browser fixture: actual application components, an isolated session and mocked API traffic.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { ThemeProvider } from '../../src/context/ThemeContext';
import { ToastProvider } from '../../src/context/ToastContext';
import '../../src/index.css';

const params = new URLSearchParams(location.search);
const role = params.get('role') || 'resident';
const mode = params.get('mode');
const roleId = { resident: 1, subd: 2, brgy: 3, admin: 4 }[role];
const user = {
    user_id: 42, name: 'Notification Reviewer', email: 'review@example.test', role_id: roleId,
    barangay_id: 1, subdivision_id: 1, status: 'Active', is_verified: true, is_profile_complete: true,
    access_token: 'test.' + btoa(JSON.stringify({ user_id: 42, exp: 4102444800 })) + '.test',
};
localStorage.clear(); sessionStorage.clear();
localStorage.setItem(role === 'resident' ? 'resident_user' : role === 'admin' ? 'admin_user' : 'staff_user', JSON.stringify(user));

const components = {
    resident: () => import('../../src/components/Navbars/ResiNavbar'),
    subd: () => import('../../src/components/Navbars/SubdNavbar'),
    brgy: () => import('../../src/components/Navbars/BrgyNavbar'),
    admin: () => import('../../src/components/Navbars/AdminNavbar'),
};
const Component = (await (mode === 'home' ? import('../../src/pages/citizen/ResiHomePage')
    : mode === 'settings' ? import('../../src/pages/citizen/ResidentSettings')
    : components[role as keyof typeof components]())).default;

function LocationProbe() {
    const value = useLocation();
    Object.assign(window, { reviewLocation: value.pathname });
    return null;
}
const props = mode === 'empty' ? { notifications: [] } : {};
const fixtureWindow = window as Window & { reviewRoot?: ReturnType<typeof createRoot> };
fixtureWindow.reviewRoot?.unmount();
const root = createRoot(document.getElementById('fixture')!);
fixtureWindow.reviewRoot = root;
root.render(
    <MemoryRouter initialEntries={['/' + role + (mode === 'home' ? '' : '/settings')]}>
        <ThemeProvider><ToastProvider><Component {...props} /><LocationProbe /></ToastProvider></ThemeProvider>
    </MemoryRouter>,
);
Object.assign(window, { reviewReady: true });
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
