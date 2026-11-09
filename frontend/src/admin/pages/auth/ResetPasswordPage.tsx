import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CircleCheck } from 'lucide-react';
import { adminPath } from '../../config';
import { useAuth } from '../../auth/context';
import { AuthShell, DevPreviewNote } from '../../components/AuthShell';
import { Button, LinkButton } from '../../components/Button';
import { Field, PasswordInput } from '../../components/form';
import { Callout, FormError } from '../../components/layout';
import { PasswordRules } from '../../components/PasswordRules';
import { usePageTitle } from '../../lib/hooks';
import { useSubmit } from '../../lib/useSubmit';
import { isPasswordValid } from '../../../utils/passwordPolicy';

/** A03 — Reset password. Reached from the emailed link (`?token=…`). */
export default function ResetPasswordPage() {
  usePageTitle('Choose a new password');
  const { resetPassword } = useAuth();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [done, setDone] = useState(false);
  const { pending, error, run } = useSubmit();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!isPasswordValid(password)) next.password = 'Your password does not meet all the requirements below.';
    if (confirm !== password) next.confirm = 'The two passwords do not match.';
    setErrors(next);
    if (Object.keys(next).length === 0 && await run(() => resetPassword(token, password))) setDone(true);
  };

  if (!token) {
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
    <AuthShell below={done ? <DevPreviewNote><p>The preview checks this flow but keeps the sample account’s sample password, so you can sign in with it as before.</p></DevPreviewNote> : undefined}>
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
          <p className="sa-text-2 mt-1">Use something you don’t use anywhere else.</p>
          <form className="sa-auth__form" onSubmit={submit} noValidate>
            {error ? <FormError message={error} /> : null}
            <Field label="New password" error={errors.password}>
              <PasswordInput name="new-password" autoComplete="new-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
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
