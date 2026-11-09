import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/context';
import { Field, Input } from '../../components/form';
import { Button, Callout, FormError, LinkButton } from '../../components/ui';
import { residentPath } from '../../config';
import { useFormFocus, useSubmit } from '../../lib/hooks';
import { AuthShell, DevNote } from './AuthShell';

/** R05 — Ask for a password reset link. The answer is the same whether or not an account exists. */
export default function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth();
  const { ref, invalid } = useFormFocus();
  const { pending, error, run } = useSubmit();
  const [identifier, setIdentifier] = useState('');
  const [fieldError, setFieldError] = useState<string>();
  const [sent, setSent] = useState(false);

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!identifier.trim()) { setFieldError('Enter your email or mobile number.'); invalid(); return; }
    if (await run(() => requestPasswordReset(identifier.trim()))) setSent(true);
  };

  if (sent) {
    return (
      <AuthShell title="Check your messages" back="/login">
        <Callout tone="sage">If an account matches <strong>{identifier.trim()}</strong>, we have sent a link to reset the password. It works for 30 minutes.</Callout>
        <div className="rs-stack-sm">
          <LinkButton variant="primary" block to={residentPath('/login')}>Back to sign in</LinkButton>
          <Button variant="ghost" block onClick={() => setSent(false)}>Use a different email or number</Button>
        </div>
        <DevNote>
          <p>No message is sent in this preview. Open the reset screen yourself:</p>
          <LinkButton size="sm" to={`${residentPath('/reset-password')}?token=preview`}>Open the reset link</LinkButton>
        </DevNote>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Forgot your password?" lead="Enter the email or mobile number you signed up with and we will send you a link to choose a new password." back="/login">
      <form className="rs-stack" onSubmit={(e) => void submit(e)} noValidate>
        {error ? <FormError message={error} /> : null}
        <div ref={ref}>
          <Field label="Email or mobile number" error={fieldError}>
            <Input value={identifier} onChange={(e) => { setIdentifier(e.target.value); setFieldError(undefined); }} autoComplete="username" autoFocus placeholder="name@example.com" />
          </Field>
        </div>
        <Button type="submit" variant="primary" block loading={pending}>Send reset link</Button>
        <p className="rs-center rs-sub">Remembered it? <Link to={residentPath('/login')}>Sign in</Link></p>
      </form>
    </AuthShell>
  );
}
