import React from 'react';

interface SummaryCardProps {
    label: string;
    value: string | number;
    subValue?: string;
    icon?: React.ReactNode;
    color?: string; // Hex color for the top border
    accentColor?: string; // Optional accent color for the value
    variant?: 'dark' | 'light';
    className?: string;
}

const SummaryCard: React.FC<SummaryCardProps> = ({ 
    label, 
    value, 
    subValue, 
    icon, 
    color = '#F97316', 
    accentColor,
    variant = 'dark',
    className = "" 
}) => {
    const isDark = variant === 'dark';
    
    return (
        <div 
            className={`border-t-2 p-5 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.04)] flex flex-col justify-center min-w-[150px] transition-all hover:scale-[1.02] active:scale-[0.98] ${
                isDark 
                ? 'bg-[#1B4340] text-white' 
                : 'bg-white text-gray-900 border-gray-100 shadow-sm'
            } ${className}`}
            style={{ borderTopColor: color }}
        >
            <div className="flex items-center justify-between mb-1.5">
                <span className={`block text-[10px] font-black uppercase tracking-[0.2em] ${
                    isDark ? 'text-teal-100/60' : 'text-gray-400'
                }`}>
                    {label}
                </span>
                {icon && <div className={isDark ? 'text-teal-100/40' : 'text-gray-300'}>{icon}</div>}
            </div>
            
            <div className="flex items-baseline gap-2">
                <span 
                    className="text-3xl font-black tracking-tight drop-shadow-sm"
                    style={{ color: accentColor || (isDark ? 'white' : '#111827') }}
                >
                    {value}
                </span>
                {subValue && (
                    <span className={`text-[10px] font-bold uppercase ${
                        isDark ? 'text-teal-100/40' : 'text-gray-400'
                    }`}>
                        {subValue}
                    </span>
                )}
            </div>
        </div>
    );
};

export default SummaryCard;
