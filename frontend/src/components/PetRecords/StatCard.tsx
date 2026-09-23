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
        success: 'bg-green-50 text-green-600 border border-green-100',
        warning: 'bg-orange-50 text-orange-600 border border-orange-100',
        error: 'bg-red-50 text-red-600 border border-red-100',
        info: 'bg-sky-50 text-sky-600 border border-sky-100',
    };

    return (
        <div className="group relative bg-white rounded-3xl p-3 sm:p-5 md:p-6 shadow-[0_2px_12px_rgba(0,0,0,0.02)] border border-slate-200/80 flex flex-col justify-between min-h-[90px] sm:min-h-[110px] md:h-36 transition-all duration-300 hover:shadow-lg hover:border-orange-200 overflow-hidden cursor-pointer">
            <div className="flex flex-col gap-1 relative z-10 min-w-0">
                {icon && (
                    <div className="flex items-center text-base sm:text-lg mb-0.5 shrink-0">
                        {icon}
                    </div>
                )}
                <p className="text-[8px] sm:text-[10px] md:text-[11px] font-black text-slate-600 tracking-wider uppercase truncate leading-tight">
                    {label}
                </p>
            </div>
            
            <div className="flex items-end justify-between relative z-10 gap-1 mt-1 sm:mt-2">
                <p className="text-xl sm:text-2xl md:text-3xl font-black text-slate-900 leading-none">
                    {value}
                </p>
                {badge && (
                    <span className={`text-[8px] sm:text-[10px] font-black px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full shrink-0 leading-tight ${badgeColors[badgeVariant]}`}>
                        {badge}
                    </span>
                )}
            </div>

            {trend && (
                <div className={`hidden sm:flex items-center text-[10px] font-bold mt-2 ${trendPositive ? 'text-green-600' : 'text-red-600'}`}>
                    {trendPositive ? '+' : '-'}{trend}
                </div>
            )}
        </div>
    );
};

export default StatCard;
