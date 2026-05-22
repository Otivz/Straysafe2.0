import React from 'react';

interface CustomRadioProps {
    checked: boolean;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    name?: string;
    value?: string;
    label?: string;
    disabled?: boolean;
    className?: string;
}

export const RadioCircle: React.FC<{ checked: boolean; disabled?: boolean; className?: string }> = ({ 
    checked, 
    disabled,
    className = "" 
}) => (
    <div className={`relative flex items-center justify-center shrink-0 ${className} ${disabled ? 'opacity-50' : ''}`}>
        <div className={`w-5 h-5 rounded-full border-2 transition-all ${checked ? 'border-[#F97316]' : 'border-gray-200'}`}>
            <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-[#F97316] transition-transform ${checked ? 'scale-100' : 'scale-0'}`} />
        </div>
    </div>
);

const CustomRadio: React.FC<CustomRadioProps> = ({ 
    checked, 
    onChange, 
    name, 
    value, 
    label, 
    disabled, 
    className = "" 
}) => {
    return (
        <label className={`flex items-center gap-3 cursor-pointer group ${className} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <input
                type="radio"
                name={name}
                value={value}
                className="sr-only"
                checked={checked}
                onChange={onChange}
                disabled={disabled}
            />
            <RadioCircle checked={checked} />
            {label && (
                <span className={`text-[10px] font-black uppercase tracking-widest transition-colors ${checked ? 'text-[#1a1208]' : 'text-gray-400 group-hover:text-gray-500'}`}>
                    {label}
                </span>
            )}
        </label>
    );
};

export default CustomRadio;
