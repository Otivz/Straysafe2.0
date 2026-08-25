import React from 'react';
import { useReportChatCount } from '../../utils/chatUtils';

interface ReportChatBadgeProps {
    reportId: number;
    currentUserId?: number;
    onClick: (e: React.MouseEvent) => void;
    size?: 'small' | 'normal';
}

export default function ReportChatBadge({
    reportId,
    currentUserId,
    onClick,
    size = 'normal'
}: ReportChatBadgeProps) {
    const unreadCount = useReportChatCount(reportId, currentUserId);
    const isSmall = size === 'small';

    return (
        <button
            type="button"
            onClick={onClick}
            className={`${isSmall ? 'px-1.5 py-0.5' : 'px-2 py-1'} bg-orange-50 hover:bg-orange-100 text-[#F97316] border border-orange-200/80 rounded-lg hover:scale-105 active:scale-95 transition-all shadow-2xs cursor-pointer flex items-center gap-1 shrink-0`}
            title={`Open Case Chat (${unreadCount} unread)`}
        >
            <svg xmlns="http://www.w3.org/2000/svg" className={isSmall ? "h-3 w-3" : "h-3.5 w-3.5"} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            {unreadCount > 0 && (
                <span className={`${isSmall ? 'text-[9px]' : 'text-[10px]'} font-black text-[#F97316] leading-none`}>
                    ({unreadCount})
                </span>
            )}
        </button>
    );
}
