import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CircleCheck, LinkIcon } from 'lucide-react';
import { isPasswordValid } from '../../../utils/passwordPolicy';
import { useAuth } from '../../auth/context';
import { Field, PasswordInput } from '../../components/form';
import { Button, EmptyState, FormError, LinkButton } from '../../components/ui';
import { residentPath } from '../../config';
import { useFormFocus, useSubmit } from '../../lib/hooks';
import { AuthShell, PasswordRules } from './AuthShell';

/** R06 — Choose a new password from the link in the reset message. */
export default function ResetPasswordPage() {
  const { resetPassword } = useAuth();
  const token = useSearchParams()[0].get('token');
  const { ref, invalid } = useFormFocus();
  const { pending, error, run } = useSubmit();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <AuthShell title="Reset your password" back="/login">
        <EmptyState icon={LinkIcon} title="This link is not valid" action={<LinkButton variant="primary" to={residentPath('/forgot-password')}>Request a new link</LinkButton>}>
          The reset link is missing or has expired. Request a new one and try again.
        </EmptyState>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell title="Password updated">
        <EmptyState tone="sage" icon={CircleCheck} title="You can sign in with your new password" action={<LinkButton variant="primary" to={residentPath('/login')}>Go to sign in</LinkButton>}>
          For your security, you were signed out everywhere else.
        </EmptyState>
      </AuthShell>
    );
  }

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    const next: typeof errors = {};
    if (!password) next.password = 'Choose a new password.';
    else if (!isPasswordValid(password)) next.password = 'Your password does not meet all the requirements yet.';
    if (!confirm) next.confirm = 'Type your new password again.';
    else if (confirm !== password) next.confirm = 'The two passwords do not match.';
    setErrors(next);
    if (Object.keys(next).length > 0) { invalid(); return; }
    if (await run(() => resetPassword(token, password))) setDone(true);
  };

  return (
    <AuthShell title="Choose a new password" lead="Pick something you do not use anywhere else." back="/login">
      <form className="rs-stack" onSubmit={(e) => void submit(e)} noValidate>
        {error ? <FormError message={error} /> : null}
        <div ref={ref} className="rs-stack">
          <Field label="New password" error={errors.password}>
            <PasswordInput value={password} onChange={(e) => { setPassword(e.target.value); setErrors((p) => ({ ...p, password: undefined })); }} autoComplete="new-password" autoFocus />
          </Field>
          <PasswordRules password={password} />
          <Field label="Confirm new password" error={errors.confirm}>
            <PasswordInput value={confirm} onChange={(e) => { setConfirm(e.target.value); setErrors((p) => ({ ...p, confirm: undefined })); }} autoComplete="new-password" />
          </Field>
        </div>
        <Button type="submit" variant="primary" block loading={pending}>Update password</Button>
      </form>
    </AuthShell>
  );
}
