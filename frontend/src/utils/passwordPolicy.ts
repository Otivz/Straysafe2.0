export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export interface PasswordRule {
    id: string;
    label: string;
    met: boolean;
}

export const passwordRules = (password: string): PasswordRule[] => [
    {
        id: 'length',
        label: `${PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} characters`,
        met: password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH,
    },
    { id: 'upper', label: '1 uppercase letter', met: /\p{Lu}/u.test(password) },
    { id: 'lower', label: '1 lowercase letter', met: /\p{Ll}/u.test(password) },
    { id: 'number', label: '1 number', met: /\d/.test(password) },
    { id: 'special', label: '1 special character (! @ # $ % ...)', met: /[^\p{L}\p{N}\s]/u.test(password) },
];

export const isPasswordValid = (password: string): boolean => passwordRules(password).every((r) => r.met);

export const passwordError = (password: string): string | null => {
    if (isPasswordValid(password)) return null;
    const missing = passwordRules(password)
        .filter((r) => !r.met)
        .map((r) => r.label);
    return `Your password needs: ${missing.join(', ')}.`;
};
