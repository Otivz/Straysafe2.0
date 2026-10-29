import { useState, useEffect, useCallback } from 'react';
import { api } from './api';
import { CHAT_UPDATED_EVENT } from './chatUtils';

export interface ChatThreadSummary {
    thread_id: number;
    thread_type: 'Report' | 'Direct';
    thread_mode: 'report' | 'match';
    report_id?: number | null;
    match_id?: number | null;
    title: string;
    is_closed: boolean;
    created_at: string;
    updated_at: string;
    report?: {
        report_id: number;
        user_id?: number | null;
        reporter_name?: string | null;
        reporter_photo?: string | null;
        animal_type?: string | null;
        animal_breed?: string | null;
        animal_color?: string | null;
        category_id?: number | null;
        category_name?: string | null;
        status_id?: number | null;
        landmark?: string | null;
        street_address?: string | null;
        subdivision_name?: string | null;
        media_url?: string | null;
        assigned_leader_id?: number | null;
        assigned_leader_name?: string | null;
    } | null;
    matched_pet?: {
        pet_id?: number | null;
        pet_name?: string | null;
        photo_url?: string | null;
        breed?: string | null;
        color?: string | null;
        size?: string | null;
        owner_id?: number | null;
        owner_name?: string | null;
        similarity_score?: number;
    } | null;
    counterpart?: {
        user_id?: number | null;
        name: string;
        role: string;
        avatar?: string | null;
    } | null;
    last_message?: {
        message_id: number;
        text: string;
        sender_id: number;
        sender_name: string;
        sent_at: string;
        is_read: boolean;
    } | null;
    unread_count: number;
}

// One shared poller per tab: the navbar and the sidebar both show the unread count,
// but /chat/threads is fetched once for both. It pauses while the tab is hidden, refreshes when the tab comes back,
// and reacts only to chat changes (not to every localStorage write: the activity tracker writes there on every
// request, which used to make open tabs wake each other up endlessly).
const POLL_MS = 10000;
const CHAT_STORAGE_PREFIX = 'straysafe_report_chat_';

type Snapshot = { threads: ChatThreadSummary[]; unreadCount: number; loaded: boolean };
type Store = {
    snapshot: Snapshot;
    listeners: Set<(s: Snapshot) => void>;
    inFlight: Promise<void> | null;
    timer: ReturnType<typeof setInterval> | null;
    detach: (() => void) | null;
};
const store: Store = { snapshot: { threads: [], unreadCount: 0, loaded: false }, listeners: new Set(), inFlight: null, timer: null, detach: null };

const fetchInto = (): Promise<void> => {
    if (store.inFlight) return store.inFlight;  // a fetch is already running: share it
    store.inFlight = (async () => {
        try {
            const res = await api.get('/chat/threads');
            if (Array.isArray(res.data)) {
                const sorted = [...res.data].sort((a, b) => {
                    const timeA = new Date(a.last_message?.sent_at || a.updated_at || a.created_at).getTime();
                    const timeB = new Date(b.last_message?.sent_at || b.updated_at || b.created_at).getTime();
                    return timeB - timeA;
                });
                const unreadCount = sorted.reduce((sum: number, t: any) => sum + (Number(t.unread_count) || 0), 0);
                store.snapshot = { threads: sorted, unreadCount, loaded: true };
                store.listeners.forEach(l => l(store.snapshot));
            }
        } catch {
            // Silently ignore if unauthenticated or endpoint is idle
        } finally {
            store.inFlight = null;
        }
    })();
    return store.inFlight;
};

const startPolling = () => {
    const refresh = () => { void fetchInto(); };
    const tick = () => { if (document.visibilityState === 'visible') refresh(); };
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    const onStorage = (e: StorageEvent) => { if (e.key && e.key.startsWith(CHAT_STORAGE_PREFIX)) refresh(); };
    store.timer = setInterval(tick, POLL_MS);
    window.addEventListener(CHAT_UPDATED_EVENT, refresh);
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisible);
    store.detach = () => {
        if (store.timer) clearInterval(store.timer);
        window.removeEventListener(CHAT_UPDATED_EVENT, refresh);
        window.removeEventListener('storage', onStorage);
        document.removeEventListener('visibilitychange', onVisible);
        store.timer = null;
        store.detach = null;
    };
};

export function useUnreadMessageCount(userId?: number) {
    const [snapshot, setSnapshot] = useState<Snapshot>(store.snapshot);
    const [loading, setLoading] = useState<boolean>(!store.snapshot.loaded);

    const refreshThreads = useCallback(() => fetchInto(), []);

    useEffect(() => {
        store.listeners.add(setSnapshot);
        if (!store.detach) startPolling();
        setLoading(true);
        fetchInto().finally(() => setLoading(false));
        return () => {
            store.listeners.delete(setSnapshot);
            if (store.listeners.size === 0 && store.detach) store.detach();
        };
    }, [userId]);

    return {
        unreadCount: snapshot.unreadCount,
        threads: snapshot.threads,
        refreshThreads,
        loading
    };
}
