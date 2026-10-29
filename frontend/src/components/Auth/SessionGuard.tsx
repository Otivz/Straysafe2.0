import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { clearAuthStorage, getStoredToken, tokenUserId } from '../../utils/api';

// One account per browser: the server keeps one sign-in (one refresh cookie) per browser, so signing in as someone
// else in another tab replaces this tab's account. This guard notices when a page belongs to a different account
// than the one the browser is now signed in as, and says so plainly instead of every request failing with 403.
type SessionKey = 'resident_user' | 'staff_user' | 'admin_user';

const keyForPath = (path: string): SessionKey | null => {
    if (path.startsWith('/admin') && !path.startsWith('/admin/login')) return 'admin_user';
    if ((path.startsWith('/subd') || path.startsWith('/brgy') || path.startsWith('/staff')) && !path.startsWith('/staff/login')) return 'staff_user';
    if (path.startsWith('/resident')) return 'resident_user';
    return null;
};
const LOGIN: Record<SessionKey, string> = { resident_user: '/login', staff_user: '/staff/login', admin_user: '/admin/login' };
const ROLE_LABEL: Record<number, string> = { 1: 'Resident', 2: 'Subdivision Leader', 3: 'Barangay Staff', 4: 'Admin' };

const readSession = (key: SessionKey): any | null => {
    const raw = sessionStorage.getItem(key) || localStorage.getItem(key);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
};

const homeFor = (u: any): string => {
    if (u?.role_id === 4) return '/admin/dashboard';
    if (u?.role_id === 2) return '/subd/dashboard';
    if (u?.role_id === 3) return '/brgy/dashboard';
    return '/resident-home';
};

type Mismatch = { pageUser: any; pageKey: SessionKey; signedIn: any | null; signedInKey: SessionKey | null };

export default function SessionGuard() {
    const location = useLocation();
    const navigate = useNavigate();
    const [mismatch, setMismatch] = useState<Mismatch | null>(null);

    useEffect(() => {
        const check = () => {
            const pageKey = keyForPath(window.location.pathname);
            const pageUser = pageKey ? readSession(pageKey) : null;
            const tokenUser = tokenUserId(getStoredToken());
            if (!pageKey || !pageUser?.user_id || tokenUser === null || Number(pageUser.user_id) === tokenUser) {
                setMismatch(null);
                return;
            }
            // Which stored account does the browser's sign-in belong to?
            let signedIn: any = null;
            let signedInKey: SessionKey | null = null;
            for (const k of ['admin_user', 'staff_user', 'resident_user'] as SessionKey[]) {
                const u = readSession(k);
                if (u?.user_id && Number(u.user_id) === tokenUser) { signedIn = u; signedInKey = k; break; }
            }
            setMismatch({ pageUser, pageKey, signedIn, signedInKey });
        };
        check();
        const onStorage = (e: StorageEvent) => {
            if (!e.key || ['access_token', 'resident_user', 'staff_user', 'admin_user'].includes(e.key)) check();
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, [location.pathname]);

    if (!mismatch) return null;
    const { pageUser, pageKey, signedIn, signedInKey } = mismatch;

    const signInAgain = () => {
        clearAuthStorage();
        setMismatch(null);
        navigate(LOGIN[pageKey], { replace: true });
    };
    const continueAsCurrent = () => {
        // Drop the replaced account's leftover so this tab follows the account that is really signed in
        localStorage.removeItem(pageKey);
        sessionStorage.removeItem(pageKey);
        setMismatch(null);
        navigate(homeFor(signedIn), { replace: true });
    };

    return (
        <div className="fixed inset-0 z-[2147482000] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" role="alertdialog" aria-modal="true">
            <div className="w-full max-w-md bg-white dark:bg-[#151C2C] rounded-3xl shadow-2xl p-6 space-y-4">
                <div className="flex items-start gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                        <ShieldAlert className="w-6 h-6" />
                    </div>
                    <div>
                        <h2 className="text-base font-black text-gray-900 dark:text-white">You're signed in as another account</h2>
                        <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mt-1 leading-relaxed">
                            This page belongs to <b>{pageUser.name || 'another account'}</b>, but this browser is now signed in as{' '}
                            <b>{signedIn ? `${signedIn.name} (${ROLE_LABEL[signedIn.role_id] || 'User'})` : 'a different account'}</b>.
                            Only one account can be signed in per browser at a time.
                        </p>
                        <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mt-2">
                            To use two accounts at once, open the second one in a private (incognito) window or another browser.
                        </p>
                    </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                    <button type="button" onClick={signInAgain}
                        className="flex-1 py-2.5 bg-[#F97316] hover:bg-orange-600 text-white rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer">
                        Sign in as {(pageUser.name || 'this account').split(' ')[0]}
                    </button>
                    {signedIn && signedInKey && (
                        <button type="button" onClick={continueAsCurrent}
                            className="flex-1 py-2.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 text-gray-700 dark:text-gray-200 rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer">
                            Continue as {(signedIn.name || 'current account').split(' ')[0]}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
