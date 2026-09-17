export const REPORT_STATUS_MAP: Record<number, string> = {
    1: 'Reported',
    2: 'Verified',
    3: 'Rejected',
    4: 'Escalated to Barangay',
    5: 'Rescue In Progress',
    6: 'Picked Up',
    7: 'Under Observation',
    8: 'Impounded',
    9: 'Claimed by Owner',
    10: 'Released',
    11: 'Incident Resolved',
    12: 'Deceased',
    13: 'Approved',
    14: 'False Alarm / Dismissed',
    15: 'Disputed',
    16: 'Under Investigation',
    17: 'Animal Cannot Be Found',
    18: 'Merged — Duplicate'
};

export const getReportStatusLabel = (statusId: number | null | undefined): string => {
    if (!statusId) return 'Reported';
    return REPORT_STATUS_MAP[statusId] || 'Reported';
};

export const getReportStatusBadgeStyle = (statusId: number | null | undefined): string => {
    const id = statusId || 1;
    if ([6, 9, 10, 11].includes(id)) {
        // Resolved, Picked Up, Claimed by Owner, Released
        return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/60';
    } else if ([2, 13].includes(id)) {
        // Verified, Approved
        return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800/60';
    } else if (id === 4) {
        // Escalated to Barangay
        return 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800/60';
    } else if (id === 5) {
        // Rescue In Progress
        return 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-800/60';
    } else if ([7, 8].includes(id)) {
        // Observation, Impounded
        return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/60';
    } else if (id === 16) {
        // Under Investigation
        return 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800/60';
    } else if (id === 15) {
        // Disputed
        return 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/70 dark:text-amber-200 dark:border-amber-800';
    } else if (id === 17) {
        // Animal Cannot Be Found
        return 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/60';
    } else if (id === 18) {
        // Merged — Duplicate
        return 'bg-stone-100 text-stone-700 border-stone-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
    } else if ([3, 12, 14].includes(id)) {
        // Rejected, Deceased, False Alarm
        return 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800/60';
    } else {
        // Reported (1) or default
        return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
    }
};
