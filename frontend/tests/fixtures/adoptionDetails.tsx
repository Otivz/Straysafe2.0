import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '../../src/context/ThemeContext';
import { ToastProvider } from '../../src/context/ToastContext';
import BrgyAdoptions from '../../src/pages/Barangay_Staff/BrgyAdoptions';
import '../../src/index.css';

const parameters = new URLSearchParams(location.search);
localStorage.clear(); sessionStorage.clear();
const role = parameters.has('admin') ? 4 : 3;
localStorage.setItem(role === 4 ? 'admin_user' : 'staff_user', JSON.stringify({
    user_id: 42, role_id: role, name: 'Test officer', barangay_id: 1,
    is_head_officer: !parameters.has('staff'), is_verified: true,
    access_token: 'test.' + btoa(JSON.stringify({ user_id: 42, role_id: role, exp: 4102444800 })) + '.test',
}));
Object.assign(window, { adoptionPrints: 0 });
window.print = () => { (window as any).adoptionPrints++; };
const root = createRoot(document.getElementById('fixture')!);
root.render(<MemoryRouter initialEntries={[role === 4 ? '/admin/adoptions?view=1' : '/brgy/adoptions?view=1']}><ThemeProvider><ToastProvider><BrgyAdoptions /></ToastProvider></ThemeProvider></MemoryRouter>);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
