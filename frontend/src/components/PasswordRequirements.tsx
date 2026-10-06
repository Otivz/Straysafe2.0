import { passwordRules } from '../utils/passwordPolicy';

interface PasswordRequirementsProps {
    password: string;
    className?: string;
}

const PasswordRequirements = ({ password, className = '' }: PasswordRequirementsProps) => {
    const rules = passwordRules(password);
    const started = password.length > 0;

    return (
        <ul className={`grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[11px] font-semibold ${className}`} aria-label="Password requirements">
            {rules.map((rule) => (
                <li
                    key={rule.id}
                    className={rule.met ? 'text-emerald-600' : started ? 'text-gray-500' : 'text-gray-400'}
                >
                    <span aria-hidden="true" className="inline-block w-4">{rule.met ? '✓' : '○'}</span>
                    {rule.label}
                    <span className="sr-only">{rule.met ? ' (met)' : ' (not met yet)'}</span>
                </li>
            ))}
        </ul>
    );
};

export default PasswordRequirements;
