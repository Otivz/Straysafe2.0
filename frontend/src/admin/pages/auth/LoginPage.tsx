import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { adminPath } from '../../config';
import { useAuth } from '../../auth/context';
import { AuthShell } from '../../components/AuthShell';
import { Button } from '../../components/Button';
import { Field, Input, PasswordInput } from '../../components/form';
import { Callout, FormError } from '../../components/layout';
import { usePageTitle } from '../../lib/hooks';
import { useSubmit } from '../../lib/useSubmit';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A01 — Admin login. */
export default function LoginPage() {
  usePageTitle('Sign in');
  const { session, signIn, notice } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const origin = (location.state ?? null) as { from?: string } | null;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const { pending, error, run } = useSubmit();

  if (session) return <Navigate to={adminPath('/dashboard')} replace />;

  const go = async (e: string, p: string) => {
    if (await run(() => signIn(e, p))) navigate(origin?.from ?? adminPath('/dashboard'), { replace: true });
  };

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    const next: typeof errors = {};
    if (!email.trim()) next.email = 'Enter your email address.';
    else if (!EMAIL.test(email.trim())) next.email = 'Enter a valid email address, like name@example.com.';
    if (!password) next.password = 'Enter your password.';
    setErrors(next);
    if (Object.keys(next).length === 0) void go(email.trim(), password);
  };

  return (
    <AuthShell>
      <h1 className="sa-auth__title">Welcome back</h1>
      <p className="sa-text-2 mt-1">Sign in to manage animal concerns in your subdivision.</p>

      <form className="sa-auth__form" onSubmit={submit} noValidate>
        {notice === 'expired' ? <Callout tone="amber">Your session expired. Sign in again to continue.</Callout> : null}
        {notice === 'password_changed' ? <Callout tone="amber">Your password was changed and you were signed out everywhere. Sign in with the new one.</Callout> : null}
        {error ? <FormError message={error} /> : null}
        <Field label="Email" error={errors.email}>
          <Input type="email" name="email" autoComplete="username" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
        </Field>
        <Field label="Password" error={errors.password}>
          <PasswordInput name="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <div className="flex justify-end">
          <Link to={adminPath('/forgot-password')} className="sa-auth__link sa-small font-semibold">Forgot password?</Link>
        </div>
        <Button type="submit" variant="primary" block loading={pending}>Sign in</Button>
      </form>
    </AuthShell>
  );
}
