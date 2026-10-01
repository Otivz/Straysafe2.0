import React from 'react';

export type BadgeTone = 'green' | 'amber' | 'red' | 'purple' | 'blue' | 'indigo' | 'gray' | 'auto';

export interface StatusBadgeProps {
    status?: string | null;
    tone?: BadgeTone;
    dot?: boolean;
    size?: 'sm' | 'md';
    className?: string;
    icon?: React.ReactNode;
}

export const getStatusTone = (statusName?: string | null): BadgeTone => {
    if (!statusName) return 'gray';
    const s = statusName.toLowerCase().trim();

    // 1. Green: Approved, Healthy, Resolved, Active, Claimed, Released, Low Risk, First Notice / Low Level
    if (
        s.includes('active') ||
        s.includes('approved') ||
        s.includes('healthy') ||
        s.includes('resolved') ||
        s.includes('claimed') ||
        s.includes('released') ||
        s.includes('low risk') ||
        s === 'low' ||
        s.includes('first notice') ||
        s.includes('closed')
    ) {
        return 'green';
    }

    // 2. Yellow/Amber: Pending, In Progress, Under Observation, Under Review, Reported, Disputed, Medium Risk
    if (
        s.includes('pending') ||
        s.includes('reported') ||
        s.includes('under observation') ||
        s.includes('observation') ||
        s.includes('under review') ||
        s.includes('disputed') ||
        s.includes('in progress') ||
        s.includes('medium risk') ||
        s === 'medium' ||
        s.includes('second notice') ||
        s.includes('warning')
    ) {
        return 'amber';
    }

    // 3. Red: Rejected, Deceased, Critical Risk, High Bite Count, Suspended, Inactive, Deactivated, False Alarm
    if (
        s.includes('reject') ||
        s.includes('deceased') ||
        s.includes('critical') ||
        s.includes('bite') ||
        s.includes('high') ||
        s.includes('emergency') ||
        s.includes('suspended') ||
        s.includes('inactive') ||
        s.includes('deactivated') ||
        s.includes('false alarm') ||
        s.includes('dismissed') ||
        s.includes('cannot be found') ||
        s.includes('final notice') ||
        s.includes('security')
    ) {
        return 'red';
    }

    // 4. Purple/Indigo/Blue: Impounded, In Holding, Picked Up, Escalated to Barangay, Verified, Under Investigation
    if (
        s.includes('impounded') ||
        s.includes('in holding') ||
        s.includes('holding') ||
        s.includes('picked up') ||
        s.includes('escalated') ||
        s.includes('forwarded')
    ) {
        return 'purple';
    }

    if (
        s.includes('verified') ||
        s.includes('investigation') ||
        s.includes('operation') ||
        s.includes('leader')
    ) {
        return 'blue';
    }

    return 'gray';
};

export const getToneStyle = (tone: BadgeTone): string => {
    switch (tone) {
        case 'green':
            return 'bg-emerald-50 text-emerald-700 border-emerald-200/90 shadow-2xs';
        case 'amber':
            return 'bg-amber-50 text-amber-800 border-amber-200/90 shadow-2xs';
        case 'red':
            return 'bg-rose-50 text-rose-700 border-rose-200/90 shadow-2xs';
        case 'purple':
            return 'bg-purple-50 text-purple-700 border-purple-200/90 shadow-2xs';
        case 'blue':
            return 'bg-sky-50 text-sky-700 border-sky-200/90 shadow-2xs';
        case 'indigo':
            return 'bg-indigo-50 text-indigo-700 border-indigo-200/90 shadow-2xs';
        case 'gray':
        default:
            return 'bg-slate-100 text-slate-700 border-slate-200/80 shadow-2xs';
    }
};

const StatusBadge: React.FC<StatusBadgeProps> = ({
    status = 'Unknown',
    tone = 'auto',
    dot = true,
    size = 'sm',
    className = '',
    icon
}) => {
    const finalTone = tone === 'auto' ? getStatusTone(status) : tone;
    const toneStyle = getToneStyle(finalTone);
    const sizeStyle = size === 'sm' ? 'px-2.5 py-0.5 text-[10px]' : 'px-3 py-1 text-[11px]';

    return (
        <span className={`inline-flex items-center gap-1.5 rounded-full font-black uppercase tracking-wider border ${toneStyle} ${sizeStyle} ${className}`}>
            {dot && (
                <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80 shrink-0" />
            )}
            {icon && <span className="shrink-0">{icon}</span>}
            <span className="truncate">{status}</span>
        </span>
    );
};

export default StatusBadge;
