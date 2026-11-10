import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/context';
import { Field, Input, PasswordInput } from '../../components/form';
import { Button, Callout, FormError } from '../../components/ui';
import { residentPath } from '../../config';
import { useFormFocus, useSubmit } from '../../lib/hooks';
import { AuthShell } from './AuthShell';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** R04 — Sign in with email or mobile number (the real backend accepts the email address only). */
export default function LoginPage() {
  const { signIn, notice, signInWith } = useAuth();
  const navigate = useNavigate();
  const origin = ((useLocation().state ?? null) as { from?: string } | null)?.from;
  const { ref, invalid } = useFormFocus();
  const { pending, error, run } = useSubmit();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ identifier?: string; password?: string }>({});
  const emailOnly = signInWith === 'email';

  const go = async (id: string, pw: string) => {
    let verifying = false;
    const ok = await run(async () => { verifying = (await signIn(id, pw)).status === 'verify'; });
    // An account that was never verified is sent on to enter the code the server has just emailed.
    if (ok) navigate(verifying ? residentPath('/verify') : origin ?? residentPath('/home'), { replace: true, state: verifying ? { from: origin } : undefined });
  };

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    const next: typeof errors = {};
    if (!identifier.trim()) next.identifier = emailOnly ? 'Enter your email address.' : 'Enter your email or mobile number.';
    else if (emailOnly && !EMAIL.test(identifier.trim())) next.identifier = 'Enter the email address you registered with, like name@example.com.';
    if (!password) next.password = 'Enter your password.';
    setErrors(next);
    if (Object.keys(next).length > 0) { invalid(); return; }
    void go(identifier.trim(), password);
  };

  return (
    <AuthShell
      title="Welcome back"
      lead="Sign in to report a concern and follow your reports."
      back="/welcome"
    >
      <form className="rs-stack" onSubmit={submit} noValidate>
        {notice === 'expired' ? <Callout tone="amber">Your session expired. Sign in again to continue.</Callout> : null}
        {notice === 'password_changed' ? <Callout tone="amber">Your password was changed and you were signed out everywhere. Sign in with the new one.</Callout> : null}
        {error ? <FormError message={error} /> : null}
        <div ref={ref} className="rs-stack">
          <Field label={emailOnly ? 'Email' : 'Email or mobile number'} error={errors.identifier}>
            <Input value={identifier} onChange={(e) => { setIdentifier(e.target.value); setErrors((p) => ({ ...p, identifier: undefined })); }} autoComplete="username" inputMode="email" autoFocus placeholder="name@example.com" />
          </Field>
          <Field label="Password" error={errors.password}>
            <PasswordInput value={password} onChange={(e) => { setPassword(e.target.value); setErrors((p) => ({ ...p, password: undefined })); }} autoComplete="current-password" />
          </Field>
        </div>
        <div className="rs-right"><Link to={residentPath('/forgot-password')}>Forgot password?</Link></div>
        <Button type="submit" variant="primary" block loading={pending}>Sign in</Button>
        <p className="rs-center rs-sub">New to StraySafe? <Link to={residentPath('/register')} state={{ from: origin }}>Create an account</Link></p>
      </form>
    </AuthShell>
  );
}
