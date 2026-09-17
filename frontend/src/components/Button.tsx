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
      variantStyle = "bg-[#F97316] text-white hover:bg-[#EA580C] shadow-sm border border-orange-600/30 active:scale-[0.98]";
      break;
    case 'secondary':
      variantStyle = "bg-[#EA580C] text-white hover:bg-[#C2410C] shadow-sm active:scale-[0.98]";
      break;
    case 'danger':
      variantStyle = "bg-red-600 text-white hover:bg-red-700 shadow-sm active:scale-[0.98]";
      break;
    case 'warning':
      variantStyle = "bg-amber-600 text-white hover:bg-amber-700 shadow-sm active:scale-[0.98]";
      break;
    case 'soft-warning':
      variantStyle = "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 border border-amber-200 dark:border-amber-800/60";
      break;
    case 'gray':
      variantStyle = "bg-gray-100 dark:bg-[#1A2338] text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-[#222E48] border border-gray-200/60 dark:border-gray-700/60";
      break;
    case 'light':
      variantStyle = "bg-white dark:bg-[#151C2C] text-gray-700 dark:text-gray-200 shadow-sm border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-[#1E2738]";
      break;
    case 'ghost':
      variantStyle = "bg-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100/60 dark:hover:bg-gray-800/60";
      break;
    case 'soft-primary':
      variantStyle = "bg-orange-50 dark:bg-orange-950/40 text-[#F97316] dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900/40 border border-orange-200/60 dark:border-orange-800/40";
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
