import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { CircleCheck, MailCheck } from 'lucide-react';
import { useAuth } from '../../auth/context';
import { Field, Input } from '../../components/form';
import { useToast } from '../../components/toast';
import { Button, Callout, EmptyState, FormError, LinkButton } from '../../components/ui';
import { residentPath } from '../../config';
import { useCountdown, useSubmit } from '../../lib/hooks';
import { AuthShell } from './AuthShell';

const maskEmail = (email: string) => {
  const [name, domain] = email.split('@');
  return domain ? `${name.slice(0, 2)}•••@${domain}` : email;
};

/** R03 — Verify the account with the code that was sent. */
export default function VerifyPage() {
  const { pendingSignup, verify, resendCode, codeNotice } = useAuth();
  const navigate = useNavigate();
  const origin = ((useLocation().state ?? null) as { from?: string } | null)?.from;
  const toast = useToast();
  const [signup] = useState(() => pendingSignup());
  const [notice] = useState(() => codeNotice());
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string>();
  const [done, setDone] = useState(false);
  const [left, setLeft] = useCountdown(30);
  const check = useSubmit();
  const resend = useSubmit();

  // Signing in happens as soon as the code is accepted, so the guest layout lets this screen stay up to show the result.
  if (done && signup) {
    return (
      <AuthShell title="You’re verified">
        <EmptyState tone="sage" icon={CircleCheck} title="Your account is ready" action={<Button variant="primary" autoFocus onClick={() => navigate(origin ?? residentPath('/home'), { replace: true })}>Continue</Button>}>
          Welcome to StraySafe, {signup.name.split(' ')[0]}. You can report a concern, share a lost pet and follow every update.
        </EmptyState>
      </AuthShell>
    );
  }

  if (!signup) {
    return (
      <AuthShell title="Verify your account" back="/welcome">
        <EmptyState icon={MailCheck} title="Nothing to verify yet" action={<LinkButton variant="primary" to={residentPath('/register')}>Create an account</LinkButton>}>
          Start by creating an account, or sign in if you already have one: we will send you a code if it still needs verifying.
        </EmptyState>
        <p className="rs-center rs-sub">Already registered? <Link to={residentPath('/login')}>Sign in</Link></p>
      </AuthShell>
    );
  }

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (code.length !== 6) { setCodeError('Enter the 6-digit code.'); return; }
    const ok = await check.run(() => verify(code));
    if (ok) setDone(true);
  };

  const sendAgain = async () => {
    const ok = await resend.run(() => resendCode());
    if (ok) { setLeft(30); setCode(''); toast.success('A new code is on its way'); }
  };

  return (
    <AuthShell title="Verify your account" lead={<>Enter the 6-digit code we sent to <strong>{maskEmail(signup.email)}</strong>.</>} back="/register">
      <form className="rs-stack" onSubmit={(e) => void submit(e)} noValidate>
        {notice ? <Callout tone="amber">{notice}</Callout> : null}
        {check.error ? <FormError message={check.error} /> : null}
        {resend.error ? <FormError message={resend.error} /> : null}
        <Field label="Verification code" error={codeError}>
          <Input
            className="rs-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            autoFocus
            value={code}
            onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setCodeError(undefined); check.clearError(); }}
            placeholder="••••••"
          />
        </Field>
        <Button type="submit" variant="primary" block loading={check.pending}>Verify and continue</Button>
        <div className="rs-center">
          {left > 0 ? <p className="rs-sub">You can ask for a new code in {left}s.</p> : <Button variant="link" loading={resend.pending} onClick={() => void sendAgain()}>Send a new code</Button>}
        </div>
        <p className="rs-center rs-sub">Wrong address? <Link to={residentPath('/register')}>Start again</Link></p>
      </form>
    </AuthShell>
  );
}
