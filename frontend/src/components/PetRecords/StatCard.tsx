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
        success: 'bg-green-50 text-green-600',
        warning: 'bg-orange-50 text-orange-600',
        error: 'bg-red-50 text-red-600',
        info: 'bg-blue-50 text-blue-600',
    };

    return (
        <div className="group relative bg-white rounded-2xl p-6 shadow-[0_2px_14px_rgba(0,0,0,0.02)] border border-gray-100 flex flex-col justify-between h-36 transition-all duration-300 hover:shadow-xl hover:shadow-[#B35D25]/10 hover:border-[#B35D25]/30 hover:-translate-y-1 overflow-hidden cursor-pointer">
            <div className="absolute inset-0 bg-gradient-to-br from-[#B35D25]/0 to-transparent group-hover:from-[#B35D25]/5 transition-colors duration-300 pointer-events-none"></div>
            <div className="flex justify-between items-start relative z-10">
                <div className="flex flex-col">
                    <p className="text-[11px] font-extrabold text-gray-400 tracking-wider uppercase mb-1">{label}</p>
                    <p className="text-3xl font-black text-gray-900 leading-none">{value}</p>
                </div>
                {badge && (
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-lg ${badgeColors[badgeVariant]}`}>
                        {badge}
                    </span>
                )}
            </div>
            
            <div className="flex items-center justify-between mt-4">
                {trend && (
                    <div className={`flex items-center text-[10px] font-bold ${trendPositive ? 'text-green-600' : 'text-red-600'}`}>
                        {trendPositive ? '+' : '-'}{trend}
                    </div>
                )}
                {icon && <div className="text-gray-300">{icon}</div>}
            </div>
        </div>
    );
};

export default StatCard;
