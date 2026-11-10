import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CircleCheck, LinkIcon } from 'lucide-react';
import { isPasswordValid } from '../../../utils/passwordPolicy';
import { useAuth } from '../../auth/context';
import { Field, Input, PasswordInput } from '../../components/form';
import { Button, EmptyState, FormError, LinkButton } from '../../components/ui';
import { residentPath } from '../../config';
import { useFormFocus, useSubmit } from '../../lib/hooks';
import { AuthShell, PasswordRules } from './AuthShell';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * R06 — Choose a new password. The resident types the email address and the 6-digit code that was emailed, together with the new
 * password.
 */
export default function ResetPasswordPage() {
  const { resetPassword, resetPasswordWithCode, recovery } = useAuth();
  const params = useSearchParams()[0];
  const token = params.get('token');
  const byCode = recovery === 'code';
  const { ref, invalid } = useFormFocus();
  const { pending, error, run } = useSubmit();
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ email?: string; code?: string; password?: string; confirm?: string }>({});
  const [done, setDone] = useState(false);

  if (!byCode && !token) {
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
    if (byCode) {
      if (!EMAIL.test(email.trim())) next.email = 'Enter the email address you registered with.';
      if (!/^\d{6}$/.test(code.trim())) next.code = 'Enter the 6-digit code from the email.';
    }
    if (!password) next.password = 'Choose a new password.';
    else if (!isPasswordValid(password)) next.password = 'Your password does not meet all the requirements yet.';
    if (!confirm) next.confirm = 'Type your new password again.';
    else if (confirm !== password) next.confirm = 'The two passwords do not match.';
    setErrors(next);
    if (Object.keys(next).length > 0) { invalid(); return; }
    if (await run(() => (byCode ? resetPasswordWithCode(email.trim(), code.trim(), password) : resetPassword(token ?? '', password)))) setDone(true);
  };

  return (
    <AuthShell title="Choose a new password" lead={byCode ? 'Enter the 6-digit code we emailed you and pick something you do not use anywhere else.' : 'Pick something you do not use anywhere else.'} back="/login">
      <form className="rs-stack" onSubmit={(e) => void submit(e)} noValidate>
        {error ? <FormError message={error} /> : null}
        <div ref={ref} className="rs-stack">
          {byCode ? (
            <>
              <Field label="Email" error={errors.email}>
                <Input value={email} onChange={(e) => { setEmail(e.target.value); setErrors((p) => ({ ...p, email: undefined })); }} autoComplete="username" inputMode="email" placeholder="name@example.com" />
              </Field>
              <Field label="6-digit code" error={errors.code}>
                <Input className="rs-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus={!!email} value={code} onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setErrors((p) => ({ ...p, code: undefined })); }} placeholder="••••••" />
              </Field>
            </>
          ) : null}
          <Field label="New password" error={errors.password}>
            <PasswordInput value={password} onChange={(e) => { setPassword(e.target.value); setErrors((p) => ({ ...p, password: undefined })); }} autoComplete="new-password" autoFocus={!byCode} />
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
