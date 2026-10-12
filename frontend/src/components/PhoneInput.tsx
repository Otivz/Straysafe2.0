import type { ChangeEvent, InputHTMLAttributes } from 'react';
import { PHONE_HELP, isValidPhPhone } from '../utils/phone';

// Philippine phone field with a fixed +63 in front: people type only the rest (917 123 4567).
// The parent gets "+63XXXXXXXXXX" back in e.target.value (the server stores it as 09XXXXXXXXX); an empty field gives "".
type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
    value?: string | null;
    onChange?: (e: { target: { value: string; name?: string } }) => void;
};

// What follows +63 for a stored number: 09171234567 / +639171234567 / 639171234567 -> 9171234567
function nationalPart(value?: string | null): string {
    let d = (value || '').replace(/\D/g, '');
    if (d.startsWith('63')) d = d.slice(2);
    else if (d.startsWith('0')) d = d.slice(1);
    return d.slice(0, 10);
}

// 9171234567 -> "917 123 4567"
function spaced(d: string): string {
    return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 10)].filter(Boolean).join(' ');
}

export default function PhoneInput({ value, onChange, className, placeholder, style, name, ...rest }: Props) {
    const digits = nationalPart(value);

    const handle = (e: ChangeEvent<HTMLInputElement>) => {
        const d = nationalPart(e.target.value.replace(/^\+?63/, '').replace(/^0/, ''));
        const full = d ? `+63${d}` : '';
        e.target.setCustomValidity(!full || isValidPhPhone(full) ? '' : PHONE_HELP);
        onChange?.({ target: { value: full, name } });
    };

    return (
        <div className="relative w-full">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-500 dark:text-gray-400 pointer-events-none select-none">
                +63
            </span>
            <input
                {...rest}
                name={name}
                type="tel"
                inputMode="tel"
                autoComplete={rest.autoComplete || 'tel-national'}
                value={spaced(digits)}
                onChange={handle}
                maxLength={12}
                title={PHONE_HELP}
                placeholder={placeholder && !/^0?9X/i.test(placeholder) ? placeholder : '917 123 4567'}
                className={className}
                style={{ ...(style || {}), paddingLeft: '3.25rem' }}
            />
        </div>
    );
}
