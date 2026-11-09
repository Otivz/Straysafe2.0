import { Check, Circle } from 'lucide-react';
import { passwordRules } from '../../utils/passwordPolicy';

/** Live checklist for the platform's password policy (shared with the rest of the app). */
export function PasswordRules({ password }: { password: string }) {
  return (
    <ul className="sa-rules" aria-label="Password requirements">
      {passwordRules(password).map((rule) => (
        <li key={rule.id} data-met={rule.met}>
          {rule.met ? <Check size={14} aria-hidden="true" /> : <Circle size={14} aria-hidden="true" />}
          <span>{rule.label}<span className="sa-sr-only">{rule.met ? ' (met)' : ' (not met)'}</span></span>
        </li>
      ))}
    </ul>
  );
}
