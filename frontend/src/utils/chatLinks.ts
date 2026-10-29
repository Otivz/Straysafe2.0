import type { ChatThreadSummary } from './useUnreadMessageCount';

// Where a conversation opens when it's clicked in the message dropdown or drawer, so the right thread is selected.
// Staff: their messages page with ?reportId / ?matchId (the page opens that thread).
// Residents: the report / match-review page with the chat open.
export function chatThreadPath(thread: ChatThreadSummary, role: 'citizen' | 'subd' | 'brgy' | 'admin' = 'citizen'): string | null {
    if (role === 'subd' || role === 'brgy') {
        const base = role === 'subd' ? '/subd/messages' : '/brgy/messages';
        if (thread.thread_mode === 'match' && thread.match_id) return `${base}?matchId=${thread.match_id}`;
        if (thread.report_id) return `${base}?reportId=${thread.report_id}`;
        return base;
    }
    if (thread.thread_mode === 'match' && thread.report_id) return `/resident/reports/${thread.report_id}/match-review?openChat=true`;
    if (thread.report_id) return `/resident/reports/${thread.report_id}?openChat=true`;
    return null;
}
