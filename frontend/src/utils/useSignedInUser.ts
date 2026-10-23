import { useEffect, useState } from 'react';
import { api, getStoredToken, SESSION_ENDED_EVENT } from './api';

// Public pages (landing page, adoption catalog) work signed in or not, but must say honestly which: an account kept in
// this browser counts only once the server confirms its session is still valid (it may have been signed out, revoked
// or expired), and stops counting as soon as the session ends.

const readStoredUser = () => {
    try {
        const raw = localStorage.getItem('resident_user') || sessionStorage.getItem('resident_user') ||
            localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user') ||
            localStorage.getItem('admin_user') || sessionStorage.getItem('admin_user');
        return raw && getStoredToken() ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
};

export const homePathFor = (user: any): string =>
    user?.role_id === 4 ? '/admin/dashboard'
        : user?.role_id === 2 ? '/subd/dashboard'
            : user?.role_id === 3 ? '/brgy/dashboard'
                : '/resident-home';

export function useSignedInUser() {
    const [user, setUser] = useState<any | null>(null);
    const [checked, setChecked] = useState(false);

    useEffect(() => {
        let alive = true;
        const onEnded = () => setUser(null);
        window.addEventListener(SESSION_ENDED_EVENT, onEnded);
        if (readStoredUser()) {
            api.get('/auth/verify-session')
                .then((res) => { if (alive && res.data?.status === 'valid') setUser(readStoredUser()); })
                .catch(() => { /* not signed in (or offline): the page stays in its signed-out form */ })
                .finally(() => { if (alive) setChecked(true); });
        } else {
            setChecked(true);
        }
        return () => { alive = false; window.removeEventListener(SESSION_ENDED_EVENT, onEnded); };
    }, []);

    return { user, checked };
}
