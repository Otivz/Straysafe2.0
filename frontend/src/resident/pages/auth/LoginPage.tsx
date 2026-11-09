import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/context';
import { Field, Input, PasswordInput } from '../../components/form';
import { Button, Callout, FormError } from '../../components/ui';
import { residentPath } from '../../config';
import { SAMPLE_ACCOUNT } from '../../data/seed';
import { useFormFocus, useSubmit } from '../../lib/hooks';
import { AuthShell, DevNote } from './AuthShell';

/** R04 — Sign in with email or mobile number. */
export default function LoginPage() {
  const { signIn, notice } = useAuth();
  const navigate = useNavigate();
  const origin = ((useLocation().state ?? null) as { from?: string } | null)?.from;
  const { ref, invalid } = useFormFocus();
  const { pending, error, run, clearError } = useSubmit();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ identifier?: string; password?: string }>({});

  const go = async (id: string, pw: string) => {
    if (await run(async () => { await signIn(id, pw); })) navigate(origin ?? residentPath('/home'), { replace: true });
  };

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    const next: typeof errors = {};
    if (!identifier.trim()) next.identifier = 'Enter your email or mobile number.';
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
      below={(
        <DevNote>
          <p>Sign in with the sample resident to explore the interface with sample data.</p>
          <p>Email <code>{SAMPLE_ACCOUNT.email}</code><br />Password <code>{SAMPLE_ACCOUNT.password}</code></p>
          <div className="rs-row-actions">
            <Button size="sm" onClick={() => { setIdentifier(SAMPLE_ACCOUNT.email); setPassword(SAMPLE_ACCOUNT.password); setErrors({}); clearError(); }}>Fill in</Button>
            <Button size="sm" loading={pending} onClick={() => void go(SAMPLE_ACCOUNT.email, SAMPLE_ACCOUNT.password)}>Sign in as the sample resident</Button>
          </div>
        </DevNote>
      )}
    >
      <form className="rs-stack" onSubmit={submit} noValidate>
        {notice === 'expired' ? <Callout tone="amber">Your session expired. Sign in again to continue.</Callout> : null}
        {error ? <FormError message={error} /> : null}
        <div ref={ref} className="rs-stack">
          <Field label="Email or mobile number" error={errors.identifier}>
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
