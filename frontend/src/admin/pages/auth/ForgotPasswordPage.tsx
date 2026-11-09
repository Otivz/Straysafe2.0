import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, MailCheck } from 'lucide-react';
import { adminPath } from '../../config';
import { useAuth } from '../../auth/context';
import { AuthShell, DevPreviewNote } from '../../components/AuthShell';
import { Button, LinkButton } from '../../components/Button';
import { Field, Input } from '../../components/form';
import { FormError } from '../../components/layout';
import { usePageTitle } from '../../lib/hooks';
import { useSubmit } from '../../lib/useSubmit';

/** A02 — Forgot password. The confirmation never reveals whether an account exists for the address. */
export default function ForgotPasswordPage() {
  usePageTitle('Reset your password');
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<string>();
  const [sent, setSent] = useState(false);
  const { pending, error, run } = useSubmit();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setFieldError('Enter the email address for your account.'); return; }
    setFieldError(undefined);
    if (await run(() => requestPasswordReset(email.trim()))) setSent(true);
  };

  return (
    <AuthShell
      below={sent ? (
        <DevPreviewNote>
          <p>No email is sent in the preview. In the real flow the link arrives by email.</p>
          <LinkButton className="mt-3" size="sm" to={`${adminPath('/reset-password')}?token=preview`}>Open the reset screen</LinkButton>
        </DevPreviewNote>
      ) : undefined}
    >
      {sent ? (
        <div className="flex flex-col gap-4">
          <span className="sa-empty__icon !mb-0"><MailCheck size={20} aria-hidden="true" /></span>
          <div>
            <h1 className="sa-auth__title">Check your email</h1>
            <p className="sa-text-2 mt-2">If an account exists for <strong>{email.trim()}</strong>, we’ve sent instructions to reset your password. The link works for 60 minutes.</p>
          </div>
          <LinkButton to={adminPath('/login')} block>Back to sign in</LinkButton>
        </div>
      ) : (
        <>
          <h1 className="sa-auth__title">Forgot your password?</h1>
          <p className="sa-text-2 mt-1">Enter your email and we’ll send you a link to choose a new one.</p>
          <form className="sa-auth__form" onSubmit={submit} noValidate>
            {error ? <FormError message={error} /> : null}
            <Field label="Email" error={fieldError}>
              <Input type="email" name="email" autoComplete="username" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
            </Field>
            <Button type="submit" variant="primary" block loading={pending}>Send reset link</Button>
            <Link to={adminPath('/login')} className="sa-small inline-flex items-center justify-center gap-1.5 font-semibold"><ArrowLeft size={14} aria-hidden="true" />Back to sign in</Link>
          </form>
        </>
      )}
    </AuthShell>
  );
}
