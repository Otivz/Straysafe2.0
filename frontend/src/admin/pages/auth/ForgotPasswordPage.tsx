import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, MailCheck } from 'lucide-react';
import { adminPath } from '../../config';
import { useAuth } from '../../auth/context';
import { AuthShell } from '../../components/AuthShell';
import { Button, LinkButton } from '../../components/Button';
import { Field, Input } from '../../components/form';
import { FormError } from '../../components/layout';
import { usePageTitle } from '../../lib/hooks';
import { useSubmit } from '../../lib/useSubmit';

/**
 * A02 — Forgot password. The confirmation never reveals whether an account exists for the address.
 * The backend emails a 6-digit code that is entered on the next screen.
 */
export default function ForgotPasswordPage() {
  usePageTitle('Reset your password');
  const { requestPasswordReset, recovery } = useAuth();
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<string>();
  const [sent, setSent] = useState(false);
  const { pending, error, run } = useSubmit();
  const byCode = recovery === 'code';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setFieldError('Enter the email address for your account.'); return; }
    setFieldError(undefined);
    if (await run(() => requestPasswordReset(email.trim()))) setSent(true);
  };

  return (
    <AuthShell>
      {sent ? (
        <div className="flex flex-col gap-4">
          <span className="sa-empty__icon !mb-0"><MailCheck size={20} aria-hidden="true" /></span>
          <div>
            <h1 className="sa-auth__title">Check your email</h1>
            {byCode
              ? <p className="sa-text-2 mt-2">If an account exists for <strong>{email.trim()}</strong>, we’ve sent a 6-digit code to reset your password. It works for 10 minutes.</p>
              : <p className="sa-text-2 mt-2">If an account exists for <strong>{email.trim()}</strong>, we’ve sent instructions to reset your password. The link works for 60 minutes.</p>}
          </div>
          {byCode ? <LinkButton to={`${adminPath('/reset-password')}?email=${encodeURIComponent(email.trim())}`} variant="primary" block>Enter the code</LinkButton> : null}
          <LinkButton to={adminPath('/login')} block>Back to sign in</LinkButton>
        </div>
      ) : (
        <>
          <h1 className="sa-auth__title">Forgot your password?</h1>
          <p className="sa-text-2 mt-1">{byCode ? 'Enter your email and we’ll send you a 6-digit code to choose a new one.' : 'Enter your email and we’ll send you a link to choose a new one.'}</p>
          <form className="sa-auth__form" onSubmit={submit} noValidate>
            {error ? <FormError message={error} /> : null}
            <Field label="Email" error={fieldError}>
              <Input type="email" name="email" autoComplete="username" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
            </Field>
            <Button type="submit" variant="primary" block loading={pending}>{byCode ? 'Send code' : 'Send reset link'}</Button>
            <Link to={adminPath('/login')} className="sa-small inline-flex items-center justify-center gap-1.5 font-semibold"><ArrowLeft size={14} aria-hidden="true" />Back to sign in</Link>
          </form>
        </>
      )}
    </AuthShell>
  );
}
