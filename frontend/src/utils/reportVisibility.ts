// Report visibility (REPORT_VISIBILITY_IMPLEMENTATION.md): every report starts Private and the Subdivision Leader
// handling it can make it Public at any time; the server enforces who sees what. These helpers only word it the same
// way on every page.

/** What other residents see instead of the reporter's name (set by the server). */
export const COMMUNITY_REPORTER = 'Community Reporter';

export type VisibilityValue = 'Public' | 'Private' | 'Pending Review';

export interface VisibilityBadge {
    label: string;
    hint: string;
    isPublic: boolean;
}

export function visibilityBadge(report: { visibility?: string | null; visible_to_residents?: boolean | null } | null | undefined): VisibilityBadge {
    const v = report?.visibility || 'Pending Review';
    if (v === 'Private') {
        return { label: 'Private', hint: 'Only the reporter and the officials handling it can see this report.', isPublic: false };
    }
    if (v === 'Public') {
        if (report?.visible_to_residents === false) {
            return { label: 'Hidden', hint: 'Not shown to other residents (closed as false / rejected or merged, or the reporter chose Public before leaders decided).', isPublic: false };
        }
        return { label: 'Public', hint: 'Other residents can see this report on the map. The reporter\'s identity is never shown.', isPublic: true };
    }
    // 'Pending Review' (older reports, or reset after an unmerge) is private too
    return { label: 'Private', hint: 'Only the reporter and the officials handling it can see this report.', isPublic: false };
}

/** The message shown when a report is opened that the viewer may no longer see (it became private, false...). */
export const REPORT_UNAVAILABLE = 'This report is no longer available.';
