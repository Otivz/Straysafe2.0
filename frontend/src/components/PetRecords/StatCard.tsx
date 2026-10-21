interface StatCardProps {
    label: string;
    value: string | number;
    badge?: string;
    badgeVariant?: 'success' | 'warning' | 'error' | 'info';
    icon?: React.ReactNode;
    trend?: string;
    trendPositive?: boolean;
}

const StatCard = ({ label, value, badge, badgeVariant = 'info', icon, trend, trendPositive }: StatCardProps) => {
    const badgeColors = {
        success: 'bg-green-50 text-green-700',
        warning: 'bg-role-soft text-role-hover',
        error: 'bg-red-50 text-red-600',
        info: 'bg-sky-50 text-sky-700',
    };

    return (
        <div className="bg-white rounded-2xl p-3 sm:p-4 border border-slate-200/80 flex flex-col gap-2 h-full min-w-0">
            {icon && (
                <span className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-base shrink-0">
                    {icon}
                </span>
            )}

            {/* Number with its badge on the same line */}
            <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                <p className="text-2xl sm:text-3xl font-black text-slate-900 leading-none">
                    {value}
                </p>
                {badge && (
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full truncate min-w-0 max-w-full ${badgeColors[badgeVariant]}`}>
                        {badge}
                    </span>
                )}
            </div>
            <p className="text-[11px] sm:text-xs font-bold text-slate-500 leading-tight line-clamp-2 break-words">
                {label}
            </p>

            {trend && (
                <div className={`hidden sm:flex items-center text-[10px] font-bold ${trendPositive ? 'text-green-600' : 'text-red-600'}`}>
                    {trendPositive ? '+' : '-'}{trend}
                </div>
            )}
        </div>
    );
};

export default StatCard;
