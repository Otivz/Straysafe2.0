import { useEffect, useRef } from 'react';
import { getStoredToken } from './api';
import { refreshScope, startAutoRefresh } from './dataRefresh';

/** Keep mounted data views current without reloading the page or resetting its filters. */
export function useAutoRefresh(refresh: () => unknown | Promise<unknown>, enabled = true, intervalMs = 15000): void {
    const latest = useRef(refresh);
    useEffect(() => { latest.current = refresh; }, [refresh]);
    useEffect(() => {
        if (!enabled) return;
        return startAutoRefresh(() => latest.current(), {
            window, document,
            isVisible: () => document.visibilityState === 'visible',
            scope: () => refreshScope(getStoredToken()),
            intervalMs,
            onError: error => console.error('Could not automatically refresh this view:', error),
        });
    }, [enabled, intervalMs]);
}
