import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

const POLL_MS = 10000;

/**
 * Unread adoption-chat messages per application for the signed-in user.
 * The backend only returns applications the user is allowed to access.
 */
export const useAdoptionChatUnread = () => {
    const [counts, setCounts] = useState<Record<number, number>>({});
    const [total, setTotal] = useState(0);

    const refresh = useCallback(async () => {
        try {
            const res = await api.get<{ counts: Record<string, number>; total: number }>('/chat/adoptions/unread-counts');
            const parsed: Record<number, number> = {};
            Object.entries(res.data.counts || {}).forEach(([id, n]) => { parsed[Number(id)] = n; });
            setCounts(parsed);
            setTotal(res.data.total || 0);
        } catch {
            // Keep the previous counts on a transient failure
        }
    }, []);

    useEffect(() => {
        refresh();
        const timer = window.setInterval(() => {
            if (document.visibilityState === 'visible') refresh();
        }, POLL_MS);
        return () => window.clearInterval(timer);
    }, [refresh]);

    return { counts, total, refresh };
};
