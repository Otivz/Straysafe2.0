// Barangay portal caching (stale-while-revalidate on top of utils/cache.ts, which scopes every entry to the
// signed-in account and clears everything on sign-out):
//  - useCachedState: a list or record that shows instantly from the cache when you come back to a module, while the
//    page's normal fetch refreshes it silently. Saving the same data again doesn't re-render (no flicker).
//  - usePersistentState: filters, search, tabs and view modes that survive leaving and returning to a module.
// The server still decides what each account may see: the cache only keeps what that account already received.
import { useCallback, useRef, useState } from 'react';
import { getCachedData, setCachedData } from './cache';

const DATA_TTL_MS = 10 * 60 * 1000;      // data older than this is fetched with the loading screen again
const UI_TTL_MS = 8 * 60 * 60 * 1000;    // filters / tabs: kept for a working session

export const hasCachedData = (key: string): boolean => getCachedData(key) !== null;

type Setter<T> = (value: T | ((prev: T) => T)) => void;

function useStoredState<T>(key: string, initial: T, ttlMs: number, namespace: string): [T, Setter<T>] {
    const fullKey = `${namespace}${key}`;
    const [value, setValue] = useState<T>(() => {
        const cached = getCachedData<T>(fullKey);
        return cached !== null ? cached : initial;
    });
    const lastJson = useRef<string | null>(null);
    const set = useCallback<Setter<T>>((next) => {
        setValue((prev) => {
            const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
            let json: string | null = null;
            try { json = JSON.stringify(resolved); } catch { /* not serialisable: keep in memory only */ }
            if (json !== null) {
                if (json === lastJson.current || json === safeJson(prev)) {
                    setCachedData(fullKey, resolved, ttlMs);  // refresh the timestamp, but keep the same object
                    return prev;                             // identical data: no re-render, no flicker
                }
                lastJson.current = json;
                setCachedData(fullKey, resolved, ttlMs);
            }
            return resolved;
        });
    }, [fullKey, ttlMs]);
    return [value, set];
}

const safeJson = (v: unknown): string | null => { try { return JSON.stringify(v); } catch { return null; } };

/** Data shown instantly from the cache when returning to a module; refreshed by the page's own fetch. */
export function useCachedState<T>(key: string, initial: T): [T, Setter<T>] {
    return useStoredState(key, initial, DATA_TTL_MS, 'data:');
}

/** Filters, search text, tabs and view modes that survive navigating away and back. */
export function usePersistentState<T>(key: string, initial: T): [T, Setter<T>] {
    return useStoredState(key, initial, UI_TTL_MS, 'ui:');
}
