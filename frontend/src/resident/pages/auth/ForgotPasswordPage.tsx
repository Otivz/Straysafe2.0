import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/context';
import { Field, Input } from '../../components/form';
import { Button, Callout, FormError, LinkButton } from '../../components/ui';
import { residentPath } from '../../config';
import { useFormFocus, useSubmit } from '../../lib/hooks';
import { AuthShell } from './AuthShell';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * R05 — Ask for a password reset. The answer is the same whether or not an account exists. The backend emails a 6-digit code
 * (valid for 10 minutes) that is entered on the next screen, and works with the email address only.
 */
export default function ForgotPasswordPage() {
  const { requestPasswordReset, recovery, signInWith } = useAuth();
  const { ref, invalid } = useFormFocus();
  const { pending, error, run } = useSubmit();
  const [identifier, setIdentifier] = useState('');
  const [fieldError, setFieldError] = useState<string>();
  const [sent, setSent] = useState(false);
  const byCode = recovery === 'code';
  const emailOnly = signInWith === 'email';

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!identifier.trim()) { setFieldError(emailOnly ? 'Enter your email address.' : 'Enter your email or mobile number.'); invalid(); return; }
    if (emailOnly && !EMAIL.test(identifier.trim())) { setFieldError('Enter the email address you registered with, like name@example.com.'); invalid(); return; }
    if (await run(() => requestPasswordReset(identifier.trim()))) setSent(true);
  };

  if (sent) {
    return (
      <AuthShell title="Check your messages" back="/login">
        <Callout tone="sage">
          {byCode
            ? <>If an account matches <strong>{identifier.trim()}</strong>, we have emailed a 6-digit code to reset the password. It works for 10 minutes.</>
            : <>If an account matches <strong>{identifier.trim()}</strong>, we have sent a link to reset the password. It works for 30 minutes.</>}
        </Callout>
        <div className="rs-stack-sm">
          {byCode ? <LinkButton variant="primary" block to={`${residentPath('/reset-password')}?email=${encodeURIComponent(identifier.trim())}`}>Enter the code</LinkButton> : null}
          <LinkButton variant={byCode ? 'secondary' : 'primary'} block to={residentPath('/login')}>Back to sign in</LinkButton>
          <Button variant="ghost" block onClick={() => setSent(false)}>{emailOnly ? 'Use a different email' : 'Use a different email or number'}</Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Forgot your password?"
      lead={byCode ? 'Enter the email you signed up with and we will email you a 6-digit code to choose a new password.' : 'Enter the email or mobile number you signed up with and we will send you a link to choose a new password.'}
      back="/login"
    >
      <form className="rs-stack" onSubmit={(e) => void submit(e)} noValidate>
        {error ? <FormError message={error} /> : null}
        <div ref={ref}>
          <Field label={emailOnly ? 'Email' : 'Email or mobile number'} error={fieldError}>
            <Input value={identifier} onChange={(e) => { setIdentifier(e.target.value); setFieldError(undefined); }} autoComplete="username" autoFocus placeholder="name@example.com" />
          </Field>
        </div>
        <Button type="submit" variant="primary" block loading={pending}>{byCode ? 'Send code' : 'Send reset link'}</Button>
        <p className="rs-center rs-sub">Remembered it? <Link to={residentPath('/login')}>Sign in</Link></p>
      </form>
    </AuthShell>
  );
}
