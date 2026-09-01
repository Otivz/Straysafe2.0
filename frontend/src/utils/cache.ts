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

const memoryCache = new Map<string, CacheEntry<any>>();
const CACHE_PREFIX = 'straysafe_cache_';
const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes default TTL

/**
 * Retrieve data from in-memory cache or sessionStorage
 */
export function getCachedData<T>(key: string): T | null {
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
export function setCachedData<T>(key: string, data: T, ttlMs: number = DEFAULT_TTL_MS): void {
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

    // Target specific or prefixed keys
    for (const key of memoryCache.keys()) {
        if (key === keyOrPrefix || key.startsWith(keyOrPrefix)) {
            memoryCache.delete(key);
        }
    }

    try {
        const fullPrefix = `${CACHE_PREFIX}${keyOrPrefix}`;
        const keysToRemove: string[] = [];
        for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            if (key && (key === fullPrefix || key.startsWith(fullPrefix))) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(k => sessionStorage.removeItem(k));
    } catch {
        // Ignore
    }
}

export const removeCachedData = invalidateCache;

