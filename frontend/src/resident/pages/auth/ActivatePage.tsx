import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CircleCheck, MailWarning } from 'lucide-react';
import { isPasswordValid } from '../../../utils/passwordPolicy';
import { accountActivation, type LinkCheck } from '../../auth/activation';
import { Field, Input, PasswordInput } from '../../components/form';
import { Button, Callout, EmptyState, FormError, LinkButton } from '../../components/ui';
import { residentPath } from '../../config';
import { useFormFocus, useSubmit } from '../../lib/hooks';
import { errorMessage } from '../../../preview/lib/errors';
import { AuthShell, PasswordRules } from './AuthShell';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Phase = 'checking' | 'password' | 'done' | 'problem';

/**
 * Claim your StraySafe account. The Subdivision Leader's resident list created the account; the e-mailed link proves you have the
 * mailbox on that record. You choose your own password here: nobody else can see or set it. There is no public sign-up, so without a
 * valid link this page only offers to e-mail a new one to the address on the list.
 */
export default function ActivatePage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [phase, setPhase] = useState<Phase>(token ? 'checking' : 'problem');
  const [problem, setProblem] = useState(token ? '' : 'This page opens from the activation link in the email your Subdivision Leader’s invitation sent you.');
  const [who, setWho] = useState<LinkCheck | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string>();
  const [asked, setAsked] = useState<string | null>(null);
  const finish = useSubmit();
  const ask = useSubmit();
  const { ref, invalid } = useFormFocus();

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    accountActivation.check(token).then(
      (r) => { if (!cancelled) { setWho(r); setPhase('password'); } },
      (e) => { if (!cancelled) { setProblem(errorMessage(e)); setPhase('problem'); } },
    );
    return () => { cancelled = true; };
  }, [token]);

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    const e: { password?: string; confirm?: string } = {};
    if (!password) e.password = 'Create a password.';
    else if (!isPasswordValid(password)) e.password = 'Your password does not meet all the requirements yet.';
    if (!confirm) e.confirm = 'Type your password again.';
    else if (confirm !== password) e.confirm = 'The two passwords do not match.';
    setErrors(e);
    if (Object.keys(e).length > 0) { invalid(); return; }
    const ok = await finish.run(async () => { await accountActivation.complete(token, password, confirm); setPassword(''); setConfirm(''); setPhase('done'); });
    if (!ok) invalid();
  };

  const requestNew = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!EMAIL.test(email.trim())) { setEmailError('Enter the email address on your resident record.'); return; }
    await ask.run(async () => { const r = await accountActivation.requestLink(email); setAsked(r.message); });
  };

  if (phase === 'checking') return <AuthShell title="Checking your link"><p className="rs-sub rs-center" role="status">One moment…</p></AuthShell>;

  if (phase === 'done') {
    return (
      <AuthShell title="Your account is active">
        <EmptyState tone="sage" icon={CircleCheck} title="You’re all set" action={<LinkButton variant="primary" to={residentPath('/login')}>Sign in</LinkButton>}>
          Welcome to StraySafe. Sign in with {who?.masked_email ?? 'your registered email'} and the password you just created.
        </EmptyState>
      </AuthShell>
    );
  }

  if (phase === 'problem') {
    return (
      <AuthShell title="This link can’t be used" back="/welcome">
        <EmptyState tone="amber" icon={MailWarning} title="We couldn’t open your activation link">{problem}</EmptyState>
        {asked ? <Callout tone="sage">{asked}</Callout> : (
          <form className="rs-stack" onSubmit={(e) => void requestNew(e)} noValidate>
            {ask.error ? <FormError message={ask.error} /> : null}
            <Field label="Email address on your resident record" error={emailError} hint="We only send a new link to the address your Subdivision Leader registered for you.">
              <Input type="email" inputMode="email" autoComplete="email" value={email} placeholder="name@example.com"
                onChange={(e) => { setEmail(e.target.value); setEmailError(undefined); ask.clearError(); }} />
            </Field>
            <Button type="submit" variant="primary" block loading={ask.pending}>Email me a new link</Button>
          </form>
        )}
        <p className="rs-center rs-sub">Already activated? <Link to={residentPath('/login')}>Sign in</Link></p>
        <p className="rs-center rs-sub">Not on the list, or your details are wrong? Contact your Subdivision Leader.</p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Claim your account" lead={<>Welcome{who?.full_name ? `, ${who.full_name}` : ''}. Your account is linked to <strong>{who?.masked_email}</strong>. Choose a password only you know; nobody, including your Subdivision Leader, can see or set it.</>}>
      <form className="rs-stack" onSubmit={(e) => void submit(e)} noValidate>
        {finish.error ? <FormError message={finish.error} /> : null}
        <div ref={ref} className="rs-stack">
          <Field label="New password" error={errors.password}>
            <PasswordInput value={password} onChange={(e) => { setPassword(e.target.value); setErrors((p) => ({ ...p, password: undefined })); }} autoComplete="new-password" autoFocus />
          </Field>
          <PasswordRules password={password} />
          <Field label="Confirm password" error={errors.confirm}>
            <PasswordInput value={confirm} onChange={(e) => { setConfirm(e.target.value); setErrors((p) => ({ ...p, confirm: undefined })); }} autoComplete="new-password" />
          </Field>
        </div>
        <Button type="submit" variant="primary" block loading={finish.pending}>Activate my account</Button>
        <p className="rs-center rs-sub">By continuing you agree that StraySafe keeps the details on your resident record (name, email, block and lot, and contact number) only to run reporting for your subdivision.</p>
      </form>
    </AuthShell>
  );
}
