import React, { useState } from 'react';
import { Eye, EyeOff, Lock, ShieldCheck } from 'lucide-react';

export interface MaskedIdDisplayProps {
    idNumber?: string | null;
    idType?: string | null;
    className?: string;
    compact?: boolean;
    buttonText?: {
        reveal?: string;
        hide?: string;
    };
}

/**
 * Mask government-issued IDs for security & privacy.
 * Formats IDs by default with masking bullets preserving only the last 4 characters.
 * Example: '23456789654' -> '••••••••9654'
 */
export const formatMaskedId = (rawId?: string | null): string => {
    if (!rawId) return '';
    const clean = rawId.trim();
    if (clean.length <= 4) {
        return '••••' + clean;
    }
    return `••••••••${clean.slice(-4)}`;
};

export const MaskedIdDisplay: React.FC<MaskedIdDisplayProps> = ({
    idNumber,
    idType,
    className = '',
    compact = false,
    buttonText = {
        reveal: 'Reveal ID',
        hide: 'Hide ID'
    }
}) => {
    const [isRevealed, setIsRevealed] = useState<boolean>(false);

    if (!idNumber) return null;

    const maskedValue = formatMaskedId(idNumber);
    const isPhilSys = (idType || '').toLowerCase().includes('philsys') || (idType || '').toLowerCase().includes('national');

    return (
        <div className={`inline-flex items-center gap-1.5 flex-wrap ${className}`}>
            {/* ID Number Tag */}
            <div 
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-mono text-[11px] transition-all select-all ${
                    isRevealed
                        ? 'bg-amber-50/90 text-amber-950 border-amber-300 font-bold shadow-2xs'
                        : 'bg-white text-gray-700 border-gray-200/90 shadow-2xs'
                }`}
                title={isRevealed ? (isPhilSys ? 'Full PhilSys National ID visible' : 'Full Government ID visible') : 'Government ID is masked for privacy and security'}
            >
                {isRevealed ? (
                    <ShieldCheck className="w-3 h-3 text-amber-600 shrink-0" />
                ) : (
                    <Lock className="w-3 h-3 text-gray-400 shrink-0" />
                )}
                
                <span className="tracking-wider">
                    {isRevealed ? idNumber : maskedValue}
                </span>

                {!compact && !isRevealed && (
                    <span className="text-[9px] font-sans font-bold uppercase tracking-wider text-gray-400 bg-gray-100 px-1 py-0.2 rounded">
                        Masked
                    </span>
                )}
            </div>

            {/* Reveal / Hide Action Button */}
            <button
                type="button"
                onClick={() => setIsRevealed(prev => !prev)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-black transition-all cursor-pointer shadow-2xs active:scale-95 ${
                    isRevealed
                        ? 'bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300'
                        : 'bg-role-soft hover:bg-role-muted text-role border border-role-border/90'
                }`}
                aria-label={isRevealed ? 'Hide Government ID Number' : 'Reveal Full Government ID Number'}
                title={isRevealed ? 'Hide full ID number' : 'Reveal full ID number'}
            >
                {isRevealed ? (
                    <>
                        <EyeOff className="w-3 h-3" />
                        <span>{buttonText.hide || 'Hide ID'}</span>
                    </>
                ) : (
                    <>
                        <Eye className="w-3 h-3" />
                        <span>{buttonText.reveal || 'Reveal ID'}</span>
                    </>
                )}
            </button>
        </div>
    );
};

export default MaskedIdDisplay;
