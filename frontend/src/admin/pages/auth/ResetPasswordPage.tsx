import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CircleCheck } from 'lucide-react';
import { adminPath } from '../../config';
import { useAuth } from '../../auth/context';
import { AuthShell } from '../../components/AuthShell';
import { Button, LinkButton } from '../../components/Button';
import { Field, Input, PasswordInput } from '../../components/form';
import { Callout, FormError } from '../../components/layout';
import { PasswordRules } from '../../components/PasswordRules';
import { usePageTitle } from '../../lib/hooks';
import { useSubmit } from '../../lib/useSubmit';
import { isPasswordValid } from '../../../utils/passwordPolicy';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * A03 — Reset password. The person types the email address and the 6-digit code that was emailed, together with the new password.
 */
export default function ResetPasswordPage() {
  usePageTitle('Choose a new password');
  const { resetPassword, resetPasswordWithCode, recovery } = useAuth();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const byCode = recovery === 'code';

  const [email, setEmail] = useState(params.get('email') ?? '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ email?: string; code?: string; password?: string; confirm?: string }>({});
  const [done, setDone] = useState(false);
  const { pending, error, run } = useSubmit();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (byCode) {
      if (!EMAIL.test(email.trim())) next.email = 'Enter the email address for your account.';
      if (!/^\d{6}$/.test(code.trim())) next.code = 'Enter the 6-digit code from the email.';
    }
    if (!isPasswordValid(password)) next.password = 'Your password does not meet all the requirements below.';
    if (confirm !== password) next.confirm = 'The two passwords do not match.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    const ok = await run(() => (byCode ? resetPasswordWithCode(email.trim(), code.trim(), password) : resetPassword(token, password)));
    if (ok) setDone(true);
  };

  if (!byCode && !token) {
    return (
      <AuthShell>
        <h1 className="sa-auth__title">This link isn’t valid</h1>
        <div className="mt-4 flex flex-col gap-4">
          <Callout tone="amber">The reset link is missing or has expired. Request a new one to continue.</Callout>
          <LinkButton to={adminPath('/forgot-password')} variant="primary" block>Request a new link</LinkButton>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      {done ? (
        <div className="flex flex-col gap-4">
          <span className="sa-empty__icon !mb-0" style={{ background: 'var(--sa-sage-soft)', color: 'var(--sa-sage-ink)' }}><CircleCheck size={20} aria-hidden="true" /></span>
          <div>
            <h1 className="sa-auth__title">Password updated</h1>
            <p className="sa-text-2 mt-2">Your new password is saved. Sign in with it to continue.</p>
          </div>
          <LinkButton to={adminPath('/login')} variant="primary" block>Go to sign in</LinkButton>
        </div>
      ) : (
        <>
          <h1 className="sa-auth__title">Choose a new password</h1>
          <p className="sa-text-2 mt-1">{byCode ? 'Enter the 6-digit code we emailed you, then choose a password you don’t use anywhere else.' : 'Use something you don’t use anywhere else.'}</p>
          <form className="sa-auth__form" onSubmit={submit} noValidate>
            {error ? <FormError message={error} /> : null}
            {byCode ? (
              <>
                <Field label="Email" error={errors.email}>
                  <Input type="email" name="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
                </Field>
                <Field label="6-digit code" error={errors.code}>
                  <Input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus={!!email} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="123456" />
                </Field>
              </>
            ) : null}
            <Field label="New password" error={errors.password}>
              <PasswordInput name="new-password" autoComplete="new-password" autoFocus={!byCode} value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <PasswordRules password={password} />
            <Field label="Confirm new password" error={errors.confirm}>
              <PasswordInput name="confirm-password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </Field>
            <Button type="submit" variant="primary" block loading={pending}>Save password</Button>
            <Link to={adminPath('/login')} className="sa-small text-center font-semibold">Back to sign in</Link>
          </form>
        </>
      )}
    </AuthShell>
  );
}
