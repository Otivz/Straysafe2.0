// Web Push in the browser (PUSH_NOTIFICATION_IMPLEMENTATION.md P13). Permission is only asked when the person
// presses "Turn on"; signing out stops pushes on this device; another account in the same browser never gets
// the previous account's pushes.
import { api, API_BASE_URL, onBeforeClearAuth } from './api';

export type PushState = 'unsupported' | 'unavailable' | 'untrusted' | 'denied' | 'on' | 'off';

const OPT_IN_KEY = (userId: number | string) => `straysafe_push_opt_in_${userId}`;

export const pushSupported = (): boolean =>
    typeof window !== 'undefined' && window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const urlBase64ToUint8Array = (base64: string): Uint8Array => {
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
};

// Set when the browser refused the service worker, e.g. the dev server's self-signed HTTPS certificate isn't
// trusted (browsers never allow service workers over a certificate you clicked through)
let registrationError: string | null = null;
export const serviceWorkerError = () => registrationError;

let registration: Promise<ServiceWorkerRegistration | null> | null = null;
export const registerServiceWorker = (): Promise<ServiceWorkerRegistration | null> | null => {
    if (!pushSupported()) return null;
    registration = registration || navigator.serviceWorker.register('/sw.js').catch((e: any) => {
        registrationError = String(e?.message || e);
        console.warn('Push notifications unavailable: the service worker could not be registered.', registrationError);
        return null;
    });
    return registration;
};

const currentSubscription = async (): Promise<PushSubscription | null> => {
    const reg = await registerServiceWorker();
    return reg ? reg.pushManager.getSubscription() : null;
};

const untrusted = async (): Promise<boolean> => {
    const reg = await registerServiceWorker();
    return !reg && /ssl|certificate/i.test(registrationError || '');
};

let serverKey: Promise<string | null> | null = null;
const publicKey = (): Promise<string | null> => {
    serverKey = serverKey || api.get('/push/public-key').then(r => (r.data?.enabled ? r.data.public_key : null)).catch(() => null);
    return serverKey;
};

/** What the switch should show for this browser and account. */
export const currentPushState = async (): Promise<PushState> => {
    if (!pushSupported()) return 'unsupported';
    if (!(await publicKey())) return 'unavailable';
    if (await untrusted()) return 'untrusted';
    if (Notification.permission === 'denied') return 'denied';
    const sub = await currentSubscription();
    if (!sub || Notification.permission !== 'granted') return 'off';
    try {
        const res = await api.get('/push/status', { params: { endpoint: sub.endpoint } });
        return res.data?.this_device ? 'on' : 'off';
    } catch {
        return 'off';
    }
};

/** Asks permission (only call from a button press), subscribes, and registers this device for the signed-in account. */
export const enablePush = async (userId?: number | string): Promise<PushState> => {
    if (!pushSupported()) return 'unsupported';
    const key = await publicKey();
    if (!key) return 'unavailable';
    if (await untrusted()) return 'untrusted';
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
    const reg = await registerServiceWorker();
    if (!reg) return 'unsupported';
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) as BufferSource });
    }
    await api.post('/push/subscribe', sub.toJSON());
    if (userId != null) {
        try { localStorage.setItem(OPT_IN_KEY(userId), '1'); } catch { /* ignore */ }
    }
    return 'on';
};

/** Stops pushes on this device for the signed-in account. */
export const disablePush = async (userId?: number | string): Promise<PushState> => {
    if (userId != null) {
        try { localStorage.removeItem(OPT_IN_KEY(userId)); } catch { /* ignore */ }
    }
    const sub = await currentSubscription().catch(() => null);
    if (sub) {
        await api.post('/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => undefined);
        await sub.unsubscribe().catch(() => undefined);
    }
    return 'off';
};

/** After sign-in: if this account turned push on in this browser before, quietly turn it back on (no prompt). */
export const resumePushIfOptedIn = async (userId?: number | string): Promise<void> => {
    if (userId == null || !pushSupported() || Notification.permission !== 'granted') return;
    let opted = false;
    try { opted = localStorage.getItem(OPT_IN_KEY(userId)) === '1'; } catch { /* ignore */ }
    if (opted) await enablePush(userId).catch(() => undefined);
};

// Sign-out: this device stops getting this account's pushes (the request carries the token being cleared)
onBeforeClearAuth((token) => {
    if (!pushSupported()) return;
    void (async () => {
        const sub = await currentSubscription().catch(() => null);
        if (!sub) return;
        if (token) {
            await fetch(`${API_BASE_URL}/push/unsubscribe`, {
                method: 'POST', keepalive: true,
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ endpoint: sub.endpoint }),
            }).catch(() => undefined);
        }
        await sub.unsubscribe().catch(() => undefined);
    })();
});
