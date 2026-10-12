import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BellRing, X } from 'lucide-react';
import { api, getStoredToken } from '../utils/api';
import { currentPushState, enablePush, pushSupported, registerServiceWorker, resumePushIfOptedIn } from '../utils/push';

// Push notifications glue (PUSH_NOTIFICATION_IMPLEMENTATION.md P13-P14): opens the page a tapped push points to,
// marks that notification read, quietly resumes push for an account that turned it on before, and offers push once
// (never asks the browser for permission without a button press).
const DISMISS_KEY = 'straysafe_push_prompt_dismissed_until';
const DISMISS_DAYS = 7;

const signedInUser = (): { user_id: number; role_id: number } | null => {
    // The same account the API calls use on this page (staff pages prefer the staff session)
    const path = window.location.pathname;
    const keys = path.startsWith('/admin') ? ['admin_user', 'staff_user', 'resident_user']
        : (path.startsWith('/subd') || path.startsWith('/brgy') || path.startsWith('/staff')) ? ['staff_user', 'admin_user', 'resident_user']
            : ['resident_user', 'staff_user', 'admin_user'];
    for (const key of keys) {
        const raw = localStorage.getItem(key) || sessionStorage.getItem(key);
        if (!raw) continue;
        try {
            const u = JSON.parse(raw);
            if (u?.user_id) return { user_id: Number(u.user_id), role_id: Number(u.role_id || (key === 'resident_user' ? 1 : 0)) };
        } catch { /* ignore */ }
    }
    return null;
};

export default function PushBridge() {
    const navigate = useNavigate();
    const location = useLocation();
    const [showPrompt, setShowPrompt] = useState(false);
    const [busy, setBusy] = useState(false);
    const [note, setNote] = useState('');
    const user = getStoredToken() ? signedInUser() : null;
    const userId = user?.user_id;

    // Service worker + "open this page" messages from a tapped push while a tab is already open
    useEffect(() => {
        if (!pushSupported()) return;
        registerServiceWorker()?.catch(() => undefined);
        const onMessage = (e: MessageEvent) => {
            if (e.data?.type === 'straysafe-open' && typeof e.data.url === 'string' && e.data.url.startsWith('/')) {
                navigate(e.data.url);
            }
        };
        navigator.serviceWorker.addEventListener('message', onMessage);
        return () => navigator.serviceWorker.removeEventListener('message', onMessage);
    }, [navigate]);

    // ?pushNotif=ID: the person opened that notification from the lock screen -> mark it read, tidy the URL
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const nid = params.get('pushNotif');
        if (!nid) return;
        params.delete('pushNotif');
        if (getStoredToken()) api.patch(`/notifications/${nid}`, { is_read: true }).catch(() => undefined);
        navigate({ pathname: location.pathname, search: params.toString() ? `?${params}` : '' }, { replace: true, state: location.state });
    }, [location.search]); // eslint-disable-line react-hooks/exhaustive-deps

    // After sign-in: resume push if this account had it on here; otherwise maybe offer it (once per 7 days)
    useEffect(() => {
        if (!userId) { setShowPrompt(false); return; }
        let cancelled = false;
        (async () => {
            await resumePushIfOptedIn(userId);
            const state = await currentPushState();
            let dismissedUntil = 0;
            try { dismissedUntil = Number(localStorage.getItem(DISMISS_KEY) || 0); } catch { /* ignore */ }
            if (!cancelled) setShowPrompt(state === 'off' && Notification.permission === 'default' && Date.now() > dismissedUntil);
        })();
        return () => { cancelled = true; };
    }, [userId]);

    if (!showPrompt || !user) return null;
    const staff = user.role_id !== 1;

    const turnOn = async () => {
        setBusy(true);
        const state = await enablePush(user.user_id).catch(() => 'off' as const);
        setBusy(false);
        if (state === 'on') { setShowPrompt(false); return; }
        if (state === 'untrusted') setNote('This connection\'s certificate isn\'t trusted, so push can\'t work here.');
        else if (state === 'denied') setNote('Notifications are blocked for this site. You can allow them in your browser settings.');
        else setNote('Push notifications could not be turned on here.');
    };
    const notNow = () => {
        try { localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_DAYS * 86400000)); } catch { /* ignore */ }
        setShowPrompt(false);
    };

    return (
        <div className="fixed bottom-20 sm:bottom-6 left-4 right-4 sm:left-auto sm:right-6 sm:w-96 z-[9000] bg-white dark:bg-[#151C2C] border border-orange-200 dark:border-orange-900/50 rounded-2xl shadow-xl p-4 flex gap-3 animate-in fade-in slide-in-from-bottom-3 duration-300">
            <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-950/60 text-[#F97316] flex items-center justify-center shrink-0">
                <BellRing className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-xs font-black text-gray-900 dark:text-white">{staff ? 'Get rescue and report alerts' : 'Get notified, even when StraySafe is closed'}</p>
                <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">
                    {staff ? 'New reports, rescue updates and messages on this device.' : 'Updates on your reports, possible matches for your pets and messages.'}
                </p>
                {note && <p className="text-[10px] font-semibold text-rose-600 mt-1">{note}</p>}
                <div className="flex gap-2 mt-2.5">
                    <button type="button" onClick={turnOn} disabled={busy}
                        className="px-3 py-1.5 bg-[#F97316] hover:bg-orange-600 disabled:opacity-60 text-white rounded-lg text-[10px] font-black uppercase tracking-wider cursor-pointer">
                        {busy ? 'Turning on…' : 'Turn on'}
                    </button>
                    <button type="button" onClick={notNow}
                        className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 text-gray-600 dark:text-gray-300 rounded-lg text-[10px] font-black uppercase tracking-wider cursor-pointer">
                        Not now
                    </button>
                </div>
            </div>
            <button type="button" onClick={notNow} className="self-start p-1 text-gray-400 hover:text-gray-600 cursor-pointer" aria-label="Close">
                <X className="w-4 h-4" />
            </button>
        </div>
    );
}
