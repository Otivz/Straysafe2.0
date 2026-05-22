import React from 'react';

type ButtonVariant = 
  | 'primary'      // Vibrant orange
  | 'secondary'    // Dark orange
  | 'danger'       // Red
  | 'warning'      // Gold/Brown 
  | 'soft-warning' // White/70 with Gold text
  | 'gray'         // Gray 100 with Gray 600 text
  | 'light'        // White with shadow
  | 'ghost'        // Transparent
  | 'soft-primary';// Orange 50

type ButtonSize = 
  | 'xs'       // [9px] py-1
  | 'sm'       // [10px] py-2
  | 'md'       // [14px] py-2.5
  | 'lg'       // [14px] py-3 px-6 
  | 'icon-sm'  // w-6 h-6
  | 'icon'     // w-8 h-8
  | 'icon-lg'  // w-12 h-12
  | 'none';    // Base un-sized

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  children: React.ReactNode;
}

const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  size = 'md', 
  fullWidth = false, 
  className = '', 
  ...props 
}) => {
  const baseStyle = "inline-flex flex-shrink-0 items-center justify-center font-bold transition-all duration-200 outline-none";
  let variantStyle = "";
  let sizeStyle = "";

  // Set Variant
  switch (variant) {
    case 'primary':
      variantStyle = "bg-[#F97316] text-[#FAFAF9] hover:bg-[#EA580C] shadow-sm border border-orange-500/20";
      break;
    case 'secondary':
      variantStyle = "bg-[#B45309] text-white hover:bg-[#92400E] shadow-sm";
      break;
    case 'danger':
      variantStyle = "bg-[#B91C1C] text-white hover:bg-red-800 shadow-sm";
      break;
    case 'warning':
      variantStyle = "bg-[#856616] text-white hover:bg-yellow-900 shadow-sm";
      break;
    case 'soft-warning':
      variantStyle = "bg-white/90 hover:bg-white text-[#856616] shadow-sm";
      break;
    case 'gray':
      variantStyle = "bg-gray-100 text-gray-600 hover:bg-gray-200";
      break;
    case 'light':
      variantStyle = "bg-white text-gray-700 shadow border border-gray-50/50 hover:bg-gray-50";
      break;
    case 'ghost':
      variantStyle = "bg-transparent text-gray-400 hover:text-gray-600";
      break;
    case 'soft-primary':
      variantStyle = "bg-orange-50 text-[#F97316] hover:bg-orange-100";
      break;
  }

  // Set Size
  switch (size) {
    case 'xs': sizeStyle = "text-[9px] px-2 py-1.5 uppercase tracking-wider rounded"; break; 
    case 'sm': sizeStyle = "text-[10px] px-4 py-2 uppercase tracking-wider rounded-lg"; break; 
    case 'md': sizeStyle = "text-sm px-4 py-2.5 rounded-lg"; break; 
    case 'lg': sizeStyle = "text-sm px-6 py-3 rounded-xl"; break; 
    case 'icon-sm': sizeStyle = "w-6 h-6 rounded-full"; break; 
    case 'icon': sizeStyle = "w-8 h-8 rounded-lg"; break; 
    case 'icon-lg': sizeStyle = "w-12 h-12 rounded-full"; break; 
    case 'none': sizeStyle = ""; break; 
  }

  const widthStyle = fullWidth ? 'w-full' : '';

  // Filter overlapping generic flex classes if passed into className
  return (
    <button 
      className={`${baseStyle} ${variantStyle} ${sizeStyle} ${widthStyle} ${className}`.trim().replace(/\s+/g, ' ')}
      {...props}
    >
      {children}
    </button>
  );
};

export default Button;
