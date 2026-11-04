/**
 * Lightweight in-memory & sessionStorage client-side cache manager (Stale-While-Revalidate pattern).
 * Provides immediate instant-load capability when switching between tabs/routes,
 * while allowing background revalidation.
 */

interface CacheEntry<T> {
    data: T;
    timestamp: number;
    ttlMs: number;
}

import { getStoredToken, onBeforeClearAuth } from './api';

const memoryCache = new Map<string, CacheEntry<any>>();
const CACHE_PREFIX = 'straysafe_cache_';
const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes default TTL
export const FACILITY_SYNC_STORAGE_KEY = 'straysafe_facility_sync_ts';
const FACILITY_SYNC_CHANNEL = 'straysafe_facility_sync';

/**
 * Every entry belongs to the signed-in account (its user id, read from the session token), so another person
 * signing in on the same tab never sees the previous person's cached data. Callers use plain keys; the scope is
 * added here.
 */
function cacheScope(): string {
    const token = getStoredToken();
    if (!token) return 'anon';
    try {
        const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        return `u${payload.user_id ?? payload.sub ?? 'x'}`;
    } catch {
        return 'anon';
    }
}
const scoped = (key: string) => `${cacheScope()}:${key}`;

/**
 * Retrieve data from in-memory cache or sessionStorage
 */
export function getCachedData<T>(rawKey: string): T | null {
    const key = scoped(rawKey);
    const now = Date.now();

    // 1. Check in-memory cache
    if (memoryCache.has(key)) {
        const entry = memoryCache.get(key)!;
        if (now - entry.timestamp <= entry.ttlMs) {
            return entry.data as T;
        }
        memoryCache.delete(key);
    }

    // 2. Fallback to sessionStorage
    try {
        const stored = sessionStorage.getItem(`${CACHE_PREFIX}${key}`);
        if (stored) {
            const entry: CacheEntry<T> = JSON.parse(stored);
            if (now - entry.timestamp <= entry.ttlMs) {
                // Populate memory cache for faster future reads
                memoryCache.set(key, entry);
                return entry.data;
            } else {
                sessionStorage.removeItem(`${CACHE_PREFIX}${key}`);
            }
        }
    } catch {
        // Ignore sessionStorage read/quota errors
    }

    return null;
}

/**
 * Store data into in-memory cache and sessionStorage
 */
export function setCachedData<T>(rawKey: string, data: T, ttlMs: number = DEFAULT_TTL_MS): void {
    const key = scoped(rawKey);
    const entry: CacheEntry<T> = {
        data,
        timestamp: Date.now(),
        ttlMs,
    };

    memoryCache.set(key, entry);

    try {
        sessionStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify(entry));
    } catch {
        // Quota exceeded or private mode, ignore silently
    }
}

/**
 * Invalidate a specific cache key or all keys matching a prefix
 */
export function invalidateCache(keyOrPrefix?: string): void {
    if (!keyOrPrefix) {
        memoryCache.clear();
        try {
            const keysToRemove: string[] = [];
            for (let i = 0; i < sessionStorage.length; i++) {
                const key = sessionStorage.key(i);
                if (key && key.startsWith(CACHE_PREFIX)) {
                    keysToRemove.push(key);
                }
            }
            keysToRemove.forEach(k => sessionStorage.removeItem(k));
        } catch {
            // Ignore
        }
        return;
    }

    // Target specific or prefixed keys (of the signed-in account)
    const scopedPrefix = scoped(keyOrPrefix);
    for (const key of Array.from(memoryCache.keys())) {
        if (key === scopedPrefix || key.startsWith(scopedPrefix) || key.includes(`:${keyOrPrefix}`)) {
            memoryCache.delete(key);
        }
    }

    try {
        const fullPrefix = `${CACHE_PREFIX}${scopedPrefix}`;
        const keysToRemove: string[] = [];
        for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            if (key && (key === fullPrefix || key.startsWith(fullPrefix) || key.includes(`:${keyOrPrefix}`))) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(k => sessionStorage.removeItem(k));
    } catch {
        // Ignore
    }
}

/**
 * Invalidate any cached entry matching any of the given raw keys across ALL user scopes.
 */
export function invalidateCacheAcrossScopes(rawKeys: string[]): void {
    for (const key of Array.from(memoryCache.keys())) {
        if (rawKeys.some(rk => key.includes(rk))) {
            memoryCache.delete(key);
        }
    }
    try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            if (key && rawKeys.some(rk => key.includes(rk))) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(k => sessionStorage.removeItem(k));
    } catch {
        // Ignore
    }
}

/**
 * Clear all facility, landmark, and Barangay HQ caches and notify all open tabs/components.
 */
export function broadcastFacilitySync(): void {
    const targetKeys = [
        'straysafe_landmarks',
        'straysafe_brgy_hq',
        'holding_animals',
        'holding_metrics',
        'reports'
    ];
    invalidateCacheAcrossScopes(targetKeys);

    const ts = String(Date.now());
    try {
        localStorage.setItem(FACILITY_SYNC_STORAGE_KEY, ts);
    } catch {
        // Ignore storage errors
    }

    try {
        if (typeof BroadcastChannel !== 'undefined') {
            const bc = new BroadcastChannel(FACILITY_SYNC_CHANNEL);
            bc.postMessage({ type: 'FACILITY_SYNC', timestamp: ts });
            bc.close();
        }
    } catch {
        // Ignore BroadcastChannel errors
    }

    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('straysafe:facility-sync', { detail: { timestamp: ts } }));
    }
}

/**
 * Subscribe to facility/landmark/HQ synchronization events across the current window and other browser tabs.
 */
export function onFacilitySync(callback: () => void): () => void {
    const clearLocalFacilityCaches = () => {
        invalidateCacheAcrossScopes([
            'straysafe_landmarks',
            'straysafe_brgy_hq',
            'holding_animals',
            'holding_metrics',
            'reports'
        ]);
    };

    const handleCustomEvent = () => {
        clearLocalFacilityCaches();
        callback();
    };

    const handleStorageEvent = (e: StorageEvent) => {
        if (e.key === FACILITY_SYNC_STORAGE_KEY) {
            clearLocalFacilityCaches();
            callback();
        }
    };

    let bc: BroadcastChannel | null = null;
    try {
        if (typeof BroadcastChannel !== 'undefined') {
            bc = new BroadcastChannel(FACILITY_SYNC_CHANNEL);
            bc.onmessage = (ev) => {
                if (ev?.data?.type === 'FACILITY_SYNC') {
                    clearLocalFacilityCaches();
                    callback();
                }
            };
        }
    } catch {
        bc = null;
    }

    if (typeof window !== 'undefined') {
        window.addEventListener('straysafe:facility-sync', handleCustomEvent);
        window.addEventListener('storage', handleStorageEvent);
    }

    return () => {
        if (typeof window !== 'undefined') {
            window.removeEventListener('straysafe:facility-sync', handleCustomEvent);
            window.removeEventListener('storage', handleStorageEvent);
        }
        if (bc) {
            try {
                bc.close();
            } catch {
                // Ignore
            }
        }
    };
}

export const removeCachedData = invalidateCache;

// Signing out (or a session ending) clears every cached entry: nothing sensitive stays in this tab
onBeforeClearAuth(() => invalidateCache());
