import React from 'react';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
    label?: string;
    options: { value: string | number; label: string }[];
    error?: string;
}

const Select: React.FC<SelectProps> = ({ label, options, error, className = '', ...props }) => {
    return (
        <div className="space-y-1.5 w-full">
            {label && (
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">
                    {label}
                </label>
            )}
            <div className="relative group">
                <select
                    className={`w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm focus:ring-2 focus:ring-[#F97316] outline-none transition-all appearance-none cursor-pointer pr-10 font-medium text-gray-700 ${className} ${error ? 'border-red-300 ring-red-100' : ''}`}
                    {...props}
                >
                    {options.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
                {/* Custom Arrow Icon */}
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 group-hover:text-[#F97316] transition-colors">
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
