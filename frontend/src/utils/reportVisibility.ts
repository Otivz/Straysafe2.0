// Report visibility (REPORT_VISIBILITY_IMPLEMENTATION.md): the Subdivision Leader decides Public / Private after
// verifying; the server enforces who sees what. These helpers only word it the same way on every page.

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
            return { label: 'Hidden', hint: 'Not shown to other residents (not verified yet, or closed as false / merged).', isPublic: false };
        }
        return { label: 'Public', hint: 'Other residents can see this report on the map. The reporter\'s identity is never shown.', isPublic: true };
    }
    return { label: 'Awaiting Review', hint: 'Only the reporter and officials can see this until the Subdivision Leader reviews it.', isPublic: false };
}

/** The message shown when a report is opened that the viewer may no longer see (it became private, false...). */
export const REPORT_UNAVAILABLE = 'This report is no longer available.';
