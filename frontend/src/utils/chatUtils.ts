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

export interface MemorableTitleOptions {
    isMatch?: boolean;
    reportId?: number | string | null;
    categoryName?: string | null;
    categoryId?: number | null;
    animalType?: string | null;
    animalBreed?: string | null;
    animalColor?: string | null;
    streetAddress?: string | null;
    landmark?: string | null;
    subdivisionName?: string | null;
    matchedPetName?: string | null;
    matchedPetBreed?: string | null;
    serverTitle?: string | null;
}

export function generateMemorableTitle(data: MemorableTitleOptions): string {
    // If backend already provided a formatted title, use it unless generic
    if (data.serverTitle && !data.serverTitle.startsWith('Incident Report #') && !data.serverTitle.endsWith('Case Coordination')) {
        return data.serverTitle;
    }

    if (data.isMatch) {
        const petName = data.matchedPetName || 'Candidate Pet';
        const descriptor = data.matchedPetBreed || data.animalBreed || data.animalType || 'Pet';
        const loc = formatLocationString(data.streetAddress, data.landmark, data.subdivisionName);
        if (loc) {
            return `Match: ${petName} (${descriptor}) • ${loc}`;
        }
        return `Match: ${petName} (${descriptor})`;
    }

    // Category Prefix
    let prefix = 'Report';
    const cat = (data.categoryName || '').toLowerCase();
    if (cat.includes('lost') || data.categoryId === 6) prefix = 'Lost';
    else if (cat.includes('injured') || data.categoryId === 1) prefix = 'Injured';
    else if (cat.includes('aggressive') || data.categoryId === 2) prefix = 'Aggressive';
    else if (cat.includes('rabies') || data.categoryId === 3) prefix = 'Rabies Alert';
    else if (cat.includes('roaming') || data.categoryId === 4) prefix = 'Roaming';
    else if (cat.includes('rescue') || data.categoryId === 5) prefix = 'Rescue';
    else if (data.categoryName) prefix = data.categoryName;

    // Animal Description
    const color = cleanTitleVal(data.animalColor);
    const breed = cleanTitleVal(data.animalBreed);
    let type = cleanTitleVal(data.animalType);
    if (type?.toLowerCase() === 'unknown') type = null;

    const parts: string[] = [];
    if (color) parts.push(color);
    if (breed && breed.toLowerCase() !== 'unknown' && breed.toLowerCase() !== 'mixed') {
        parts.push(breed);
    } else if (type) {
        parts.push(type);
    } else {
        parts.push('Animal');
    }
    const animalDesc = parts.join(' ') || 'Animal';

    // Location: Street + Landmark
    const loc = formatLocationString(data.streetAddress, data.landmark, data.subdivisionName);

    if (loc) {
        return `${prefix}: ${animalDesc} ${loc}`;
    }
    return `${prefix}: ${animalDesc} (Report #${data.reportId || 'Case'})`;
}

function formatLocationString(street?: string | null, landmark?: string | null, subdivision?: string | null): string {
    const cleanStreet = cleanTitleVal(street);
    let cleanLandmark = cleanTitleVal(landmark);
    if (cleanLandmark && cleanLandmark.toLowerCase().includes('no landmark')) {
        cleanLandmark = null;
    }
    const cleanSubd = cleanTitleVal(subdivision) || 'Selera Homes';

    if (cleanStreet && cleanLandmark) {
        if (cleanStreet.toLowerCase() === cleanLandmark.toLowerCase()) {
            return `at ${cleanStreet}`;
        }
        return `at ${cleanStreet} (near ${cleanLandmark})`;
    } else if (cleanStreet) {
        return `at ${cleanStreet}`;
    } else if (cleanLandmark) {
        return `near ${cleanLandmark}`;
    } else if (cleanSubd) {
        return `in ${cleanSubd}`;
    }
    return '';
}

function cleanTitleVal(v?: string | null): string | null {
    if (!v) return null;
    const trimmed = v.trim();
    if (!trimmed || trimmed.toLowerCase() === 'unknown' || trimmed.toLowerCase() === 'n/a' || trimmed.toLowerCase() === 'null') {
        return null;
    }
    return trimmed;
}


