// Installing StraySafe as an app from the browser (PWA: public/manifest.webmanifest + public/sw.js).
// Chrome on Android fires `beforeinstallprompt` once, early, often before the landing page is on screen, so it is
// captured here at start-up (imported by main.tsx) and handed to whoever asks for it later.

type InstallPromptEvent = Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

if (typeof window !== 'undefined') {
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();               // keep it for our own "Install App" button
        deferred = e as InstallPromptEvent;
        notify();
    });
    window.addEventListener('appinstalled', () => {
        deferred = null;
        notify();
    });
}

/** True when StraySafe is already running as an installed app (no need to offer installing it). */
export function isInstalledApp(): boolean {
    if (typeof window === 'undefined') return false;
    return window.matchMedia?.('(display-mode: standalone)').matches
        || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** True when the browser offered its own install prompt (Chrome / Edge on Android and desktop, over HTTPS). */
export function canPromptInstall(): boolean {
    return deferred !== null;
}

/** Shows the browser's install prompt. Returns false when there is none (then show the manual steps instead). */
export async function promptInstall(): Promise<boolean> {
    if (!deferred) return false;
    const e = deferred;
    deferred = null;                      // the prompt can only be used once
    notify();
    await e.prompt();
    await e.userChoice.catch(() => undefined);
    return true;
}

export function onInstallChange(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
}
