export interface ObservationRemaining {
    text: string;
    isOverdue: boolean;
    percentLeft: number;
}

/**
 * Format remaining observation time into human-friendly format.
 */
export const formatObservationRemaining = (dueAtString: string | null | undefined): ObservationRemaining => {
    if (!dueAtString) {
        return { text: 'No due date', isOverdue: false, percentLeft: 0 };
    }

    const dueAt = new Date(dueAtString).getTime();
    if (isNaN(dueAt)) {
        return { text: 'Invalid due date', isOverdue: false, percentLeft: 0 };
    }

    const now = Date.now();
    const diffMs = dueAt - now;

    if (diffMs <= 0) {
        const overdueHours = Math.abs(Math.floor(diffMs / (1000 * 60 * 60)));
        const overdueDays = Math.floor(overdueHours / 24);
        const text = overdueDays > 0 ? `${overdueDays}d ${overdueHours % 24}h overdue` : `${overdueHours}h overdue`;
        return { text, isOverdue: true, percentLeft: 100 };
    }

    const totalHours = Math.floor(diffMs / (1000 * 60 * 60));
    const totalDays = Math.floor(totalHours / 24);
    const remHours = totalHours % 24;

    const text = totalDays > 0 ? `${totalDays}d ${remHours}h remaining` : `${remHours}h remaining`;
    return { text, isOverdue: false, percentLeft: Math.min(100, Math.max(5, (totalHours / 72) * 100)) };
};

/**
 * Normalizes duration settings to a positive integer fallback of 3.
 */
export const normalizeFollowUpDuration = (days: number | null | undefined): number => {
    if (!days || typeof days !== 'number' || days <= 0) {
        return 3;
    }
    return Math.floor(days);
};
