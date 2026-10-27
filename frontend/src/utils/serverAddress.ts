// The backend address the installed app (APK) talks to, changeable on the phone.
// The APK is built with VITE_API_BASE_URL, but the PC running the backend gets a new IP on every Wi-Fi (home, school...).
// In the app, Server settings (login pages) saves a new address here, checked first, so no rebuild is needed.
// Only used inside the installed app: the browser and `npm run dev` keep their usual address.
import { Capacitor } from '@capacitor/core';

const KEY = 'straysafe_server_url';
const DEFAULT_PORT = '8000';

export function isNativeApp(): boolean {
    try {
        return Capacitor.isNativePlatform();
    } catch {
        return false;
    }
}

/** The address saved on this phone, or null (then the one the app was built with is used). */
export function getSavedServer(): string | null {
    if (!isNativeApp()) return null;
    try {
        return localStorage.getItem(KEY) || null;
    } catch {
        return null;
    }
}

/**
 * Turns what the user typed into a full address: "192.168.254.113" -> "http://192.168.254.113:8000".
 * Returns null when it doesn't look like a server address.
 */
export function normalizeServer(input: string): string | null {
    let v = (input || '').trim().replace(/\/+$/, '');
    if (!v) return null;
    if (!/^https?:\/\//i.test(v)) {
        const isIpOrLocal = /^(\d+\.\d+\.\d+\.\d+|localhost)(:\d+)?$/i.test(v);
        v = (isIpOrLocal ? 'http://' : 'https://') + v;
    }
    let url: URL;
    try {
        url = new URL(v);
    } catch {
        return null;
    }
    if (!url.hostname || (url.pathname && url.pathname !== '/')) return null;
    const isDomain = !/^\d+\.\d+\.\d+\.\d+$/.test(url.hostname) && url.hostname !== 'localhost';
    const port = url.port || (/^https:/i.test(v) || isDomain ? '' : DEFAULT_PORT);
    return `${url.protocol}//${url.hostname}${port ? ':' + port : ''}`;
}

/** True when the address answers as the StraySafe API ({"message": "Welcome to StraySafe API"}). */
export async function testServer(address: string, timeoutMs = 7000): Promise<{ ok: boolean; reason?: string }> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetch(address + '/', { signal: ctrl.signal, cache: 'no-store' });
        const body = await res.json().catch(() => ({}));
        if (res.ok && typeof body?.message === 'string' && body.message.includes('StraySafe')) return { ok: true };
        return { ok: false, reason: 'Something answered at this address, but it is not the StraySafe server.' };
    } catch (e: any) {
        return {
            ok: false,
            reason: e?.name === 'AbortError'
                ? 'No answer. Check the IP, that the phone is on the same Wi-Fi as the PC, and that the backend is running.'
                : 'Could not connect. Check the IP and that the backend is running with --host 0.0.0.0.',
        };
    } finally {
        clearTimeout(timer);
    }
}

export function saveServer(address: string): void {
    localStorage.setItem(KEY, address);
}

export function clearSavedServer(): void {
    localStorage.removeItem(KEY);
}
