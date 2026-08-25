// frontend/src/utils/chatUtils.ts
import { useState, useEffect } from 'react';
import { api } from './api';

export interface StoredChatMessage {
    id: string;
    senderId: number;
    senderName: string;
    senderRole: string;
    senderAvatar?: string;
    text: string;
    mediaUrl?: string;
    timestamp: string;
    isRead?: boolean;
    isSystemMessage?: boolean;
}

export const CHAT_UPDATED_EVENT = 'straysafe_chat_updated';

export function getReportMessages(reportId: number): StoredChatMessage[] {
    if (!reportId) return [];
    try {
        const stored = localStorage.getItem(`straysafe_report_chat_${reportId}`);
        if (stored) {
            return JSON.parse(stored);
        }
    } catch (e) {
        console.error('Error reading report messages:', e);
    }
    return [];
}

export function getReportMessageStats(reportId: number, currentUserId?: number): { total: number; unread: number; countDisplay: number } {
    if (!reportId) return { total: 0, unread: 0, countDisplay: 0 };
    
    const messages = getReportMessages(reportId);
    
    if (messages.length === 0) {
        return { total: 0, unread: 0, countDisplay: 0 };
    }

    const nonSystem = messages.filter(m => !m.isSystemMessage);
    // Unread count: messages sent by OTHER people that haven't been read yet
    const unreadCount = nonSystem.filter(m => currentUserId ? m.senderId !== currentUserId && !m.isRead : !m.isRead).length;

    return {
        total: nonSystem.length,
        unread: unreadCount,
        countDisplay: unreadCount // Badge displays unread count (goes back to 0 when seen)
    };
}

export function markReportChatAsSeen(reportId: number, currentUserId?: number) {
    if (!reportId) return;

    try {
        const storageKey = `straysafe_report_chat_${reportId}`;
        const stored = localStorage.getItem(storageKey);
        if (stored) {
            const messages: StoredChatMessage[] = JSON.parse(stored);
            let changed = false;
            const updated = messages.map(m => {
                // If message was sent by counterpart and unread, mark as read
                if ((!currentUserId || m.senderId !== currentUserId) && !m.isRead) {
                    changed = true;
                    return { ...m, isRead: true };
                }
                return m;
            });

            if (changed) {
                localStorage.setItem(storageKey, JSON.stringify(updated));
                notifyChatUpdated(reportId);
            }
        }

        // Notify backend asynchronously
        api.patch(`/chat/reports/${reportId}/read`).catch(() => {
            // Ignore if offline / unauthenticated
        });
    } catch (e) {
        console.warn('Error marking report chat as seen:', e);
    }
}

export function notifyChatUpdated(reportId: number) {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(CHAT_UPDATED_EVENT, { detail: { reportId } }));
    }
}

export function useReportChatCount(reportId: number, currentUserId?: number) {
    const [count, setCount] = useState<number>(() => getReportMessageStats(reportId, currentUserId).countDisplay);

    useEffect(() => {
        const update = () => {
            setCount(getReportMessageStats(reportId, currentUserId).countDisplay);
        };

        update();

        const handleChatEvent = (e: any) => {
            if (!e.detail?.reportId || e.detail.reportId === reportId) {
                update();
            }
        };

        window.addEventListener(CHAT_UPDATED_EVENT, handleChatEvent);
        window.addEventListener('storage', update);

        return () => {
            window.removeEventListener(CHAT_UPDATED_EVENT, handleChatEvent);
            window.removeEventListener('storage', update);
        };
    }, [reportId, currentUserId]);

    return count;
}


