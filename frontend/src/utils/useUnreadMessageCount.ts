import { useState, useEffect, useCallback } from 'react';
import { api } from './api';
import { CHAT_UPDATED_EVENT } from './chatUtils';

export interface ChatThreadSummary {
    thread_id: number;
    thread_type: 'Report' | 'Direct' | 'Adoption';
    thread_mode: 'report' | 'match' | 'adoption';
    report_id?: number | null;
    match_id?: number | null;
    adoption_id?: number | null;
    adoption?: {
        adoption_id: number;
        pet_name?: string | null;
        pet_photo?: string | null;
        applicant_name?: string | null;
        stage_label?: string | null;
    } | null;
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

// includeAdoptions: also list adoption application chats (opened in the Barangay Case Messages inbox).
export function useUnreadMessageCount(userId?: number, includeAdoptions: boolean = false) {
    const [unreadCount, setUnreadCount] = useState<number>(0);
    const [threads, setThreads] = useState<ChatThreadSummary[]>([]);
    const [loading, setLoading] = useState<boolean>(false);

    const fetchThreads = useCallback(async () => {
        try {
            const [res, adoptionRes] = await Promise.all([
                api.get('/chat/threads'),
                includeAdoptions ? api.get('/chat/adoptions/threads').catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
            ]);
            if (Array.isArray(res.data)) {
                const adoptionThreads = Array.isArray(adoptionRes.data) ? adoptionRes.data : [];
                const sorted = [...res.data, ...adoptionThreads].sort((a, b) => {
                    const timeA = new Date(a.last_message?.sent_at || a.updated_at || a.created_at).getTime();
                    const timeB = new Date(b.last_message?.sent_at || b.updated_at || b.created_at).getTime();
                    return timeB - timeA;
                });
                setThreads(sorted);
                const totalUnread = sorted.reduce((sum: number, t: any) => sum + (Number(t.unread_count) || 0), 0);
                setUnreadCount(totalUnread);
            }
        } catch {
            // Silently ignore if unauthenticated or endpoint is idle
        }
    }, [includeAdoptions]);

    useEffect(() => {
        setLoading(true);
        fetchThreads().finally(() => setLoading(false));

        const interval = setInterval(fetchThreads, 10000);

        const handleChatUpdate = () => {
            fetchThreads();
        };

        window.addEventListener(CHAT_UPDATED_EVENT, handleChatUpdate);
        window.addEventListener('storage', handleChatUpdate);

        return () => {
            clearInterval(interval);
            window.removeEventListener(CHAT_UPDATED_EVENT, handleChatUpdate);
            window.removeEventListener('storage', handleChatUpdate);
        };
    }, [fetchThreads, userId]);

    return {
        unreadCount,
        threads,
        refreshThreads: fetchThreads,
        loading
    };
}
