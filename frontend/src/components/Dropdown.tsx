import React from 'react';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
    label?: string;
    options: { value: string | number; label: string }[];
    error?: string;
    containerClassName?: string;
}

const Select: React.FC<SelectProps> = ({ label, options, error, className = '', containerClassName = '', ...props }) => {
    return (
        <div className={`space-y-1 ${containerClassName}`}>
            {label && (
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">
                    {label}
                </label>
            )}
            <div className="relative group">
                <select
                    className={`w-full pl-3.5 pr-8 py-2 bg-gray-50 hover:bg-gray-100/80 border border-gray-200/80 rounded-xl text-xs sm:text-sm font-semibold text-slate-700 focus:ring-2 focus:ring-role focus:bg-white outline-none transition-all appearance-none cursor-pointer truncate shadow-2xs ${className} ${error ? 'border-red-300 ring-red-100' : ''}`}
                    {...props}
                >
                    {options.map((option) => (
                        <option key={option.value} value={option.value} className="text-slate-800 font-medium py-1">
                            {option.label}
                        </option>
                    ))}
                </select>
                {/* Custom Arrow Icon */}
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 group-hover:text-role transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </div>
            </div>
            {error && <p className="text-[10px] text-red-500 font-bold ml-1">{error}</p>}
        </div>
    );
};

export default Select;
