export const DATA_CHANGED_EVENT = 'straysafe:data-changed';
export const DATA_CHANGED_STORAGE_KEY = 'straysafe_data_changed';

/** Ignore read receipts, authentication and uploads that do not change application records. */
export function isDataMutation(method: string | undefined, url: string | undefined): boolean {
    if (!['post', 'put', 'patch', 'delete'].includes((method || '').toLowerCase())) return false;
    const path = (url || '').replace(/^https?:\/\/[^/]+/i, '').replace(/^\/api(?=\/)/, '');
    return /^\/(reports|report-returns|rescue-requests|holding|pets|pet-ownership|claims|users|landmarks|announcements|matches|warnings|owner-warnings|positions|coverage)(\/|\?|$)/.test(path);
}

export function refreshScope(token: string | null): string | null {
    if (!token) return null;
    try {
        const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        const id = payload.user_id ?? payload.sub;
        return id == null ? null : String(id);
    } catch { return null; }
}

/** Share only an invalidation signal, never records or authentication tokens. */
export function notifyDataChanged(scope: string | null): void {
    if (!scope || typeof window === 'undefined') return;
    const signal = { scope, timestamp: Date.now(), nonce: Math.random() };
    window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT, { detail: signal }));
    try { localStorage.setItem(DATA_CHANGED_STORAGE_KEY, JSON.stringify(signal)); } catch { /* Storage is optional. */ }
}

interface RefreshEnvironment {
    window: EventTarget;
    document: EventTarget;
    isVisible: () => boolean;
    scope: () => string | null;
    intervalMs?: number;
    debounceMs?: number;
    onError?: (error: unknown) => void;
}

/** Coalesce save/focus events and serialize background reads, including a save during an in-flight read. */
export function startAutoRefresh(refresh: () => unknown | Promise<unknown>, environment: RefreshEnvironment): () => void {
    const { window: target, document: visibilityTarget, isVisible, scope, intervalMs = 15000, debounceMs = 150, onError = () => {} } = environment;
    let disposed = false;
    let running = false;
    let pending = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const request = () => {
        if (disposed || !scope()) return;
        pending = true;
        if (!isVisible() || running || timer !== undefined) return;
        timer = setTimeout(() => {
            timer = undefined;
            if (disposed || !isVisible() || !scope()) return;
            pending = false;
            running = true;
            Promise.resolve().then(refresh).catch(onError).finally(() => {
                running = false;
                if (pending && !disposed) request();
            });
        }, debounceMs);
    };
    const changed = (event: Event) => {
        const detail: unknown = (event as CustomEvent).detail;
        if (detail && typeof detail === 'object' && 'scope' in detail && detail.scope === scope()) request();
    };
    const stored = (event: Event) => {
        const storageEvent = event as StorageEvent;
        if (storageEvent.key !== DATA_CHANGED_STORAGE_KEY || !storageEvent.newValue) return;
        try {
            const signal = JSON.parse(storageEvent.newValue);
            if (signal?.scope === scope()) request();
        } catch { /* Ignore malformed signals from other tabs. */ }
    };
    target.addEventListener(DATA_CHANGED_EVENT, changed);
    target.addEventListener('storage', stored);
    target.addEventListener('focus', request);
    target.addEventListener('online', request);
    visibilityTarget.addEventListener('visibilitychange', request);
    const interval = setInterval(request, intervalMs);
    return () => {
        disposed = true;
        clearInterval(interval);
        if (timer !== undefined) clearTimeout(timer);
        target.removeEventListener(DATA_CHANGED_EVENT, changed);
        target.removeEventListener('storage', stored);
        target.removeEventListener('focus', request);
        target.removeEventListener('online', request);
        visibilityTarget.removeEventListener('visibilitychange', request);
    };
}
