import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { isPasswordValid } from '../../../utils/passwordPolicy';
import { useAuth } from '../../auth/context';
import { residentApplications } from '../../auth/applications';
import { Field, Input, PasswordInput, Select } from '../../components/form';
import { Button, Callout, FormError } from '../../components/ui';
import { residentPath } from '../../config';
import { useFormFocus, useSubmit } from '../../lib/hooks';
import { AuthShell, PasswordRules } from './AuthShell';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Form { name: string; email: string; contact: string; block: string; lot: string; subdivision: string; password: string; confirm: string }
const EMPTY: Form = { name: '', email: '', contact: '', block: '', lot: '', subdivision: '', password: '', confirm: '' };

/**
 * R02 — Create an account. Three checks follow, all on the server: the 6-digit code e-mailed to this address, then the residency
 * review by the Subdivision Leader or an Admin. Until that review approves it, the account cannot use resident features.
 */
export default function RegisterPage() {
  const { subdivisions, signIn } = useAuth();
  const navigate = useNavigate();
  const origin = ((useLocation().state ?? null) as { from?: string } | null)?.from;
  const [v, setV] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [options, setOptions] = useState<{ id: number; name: string }[]>([]);
  const { pending, error, run } = useSubmit();
  const { ref, invalid } = useFormFocus();
  const chooseSubdivision = options.length > 1;

  useEffect(() => {
    let cancelled = false;
    subdivisions().then((list) => { if (!cancelled) setOptions(list); }, () => { /* the server picks the subdivision when there is one */ });
    return () => { cancelled = true; };
  }, [subdivisions]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => { setV((p) => ({ ...p, [key]: value })); setErrors((p) => ({ ...p, [key]: undefined })); };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    const e: Partial<Record<keyof Form, string>> = {};
    if (v.name.trim().length < 2) e.name = 'Enter your full name.';
    if (!EMAIL.test(v.email.trim())) e.email = 'Enter a valid email address, like name@example.com.';
    if (v.contact.trim() && v.contact.replace(/\D/g, '').length < 10) e.contact = 'Enter a mobile number like 0917 123 4567, or leave it empty.';
    if (!v.block.trim()) e.block = 'Enter your block number.';
    if (!v.lot.trim()) e.lot = 'Enter your lot number.';
    if (chooseSubdivision && !v.subdivision) e.subdivision = 'Choose your subdivision.';
    if (!v.password) e.password = 'Create a password.';
    else if (!isPasswordValid(v.password)) e.password = 'Your password does not meet all the requirements yet.';
    if (v.confirm !== v.password) e.confirm = 'The two passwords do not match.';
    setErrors(e);
    if (Object.keys(e).length > 0) { invalid(); return; }
    let verifying = false;
    const ok = await run(async () => {
      await residentApplications.register({ fullName: v.name, email: v.email, contact: v.contact, block: v.block, lot: v.lot,
        ...(chooseSubdivision ? { subdivisionId: Number(v.subdivision) } : {}) }, v.password, v.confirm);
      // Signing in right away is what e-mails the verification code (the existing flow).
      verifying = (await signIn(v.email.trim(), v.password)).status === 'verify';
    });
    if (!ok) { invalid(); return; }
    navigate(residentPath(verifying ? '/verify' : '/login'), { replace: true, state: { from: origin } });
  };

  return (
    <AuthShell title="Create your account" lead="Register with your own details. After you verify your email, your Subdivision Leader confirms that you live in the subdivision before you can use StraySafe." back="/welcome">
      <form className="rs-stack" onSubmit={(e) => void submit(e)} noValidate>
        <Callout tone="info">Your account needs residency verification. You can sign in to see its status, but reporting and the other resident features open only after it is approved.</Callout>
        {error ? <FormError message={error} /> : null}
        <div ref={ref} className="rs-stack">
          <Field label="Full name" error={errors.name}>
            <Input value={v.name} onChange={(e) => set('name', e.target.value)} autoComplete="name" placeholder="Maria Santos" maxLength={100} />
          </Field>
          <Field label="Email address" hint="We send a verification code here." error={errors.email}>
            <Input type="email" inputMode="email" value={v.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" placeholder="name@example.com" />
          </Field>
          <Field label="Contact number" optional error={errors.contact}>
            <Input inputMode="tel" value={v.contact} onChange={(e) => set('contact', e.target.value)} autoComplete="tel" placeholder="0917 123 4567" maxLength={20} />
          </Field>
          {chooseSubdivision ? (
            <Field label="Subdivision" error={errors.subdivision}>
              <Select value={v.subdivision} onChange={(e) => set('subdivision', e.target.value)}>
                <option value="">Choose your subdivision</option>
                {options.map((o) => <option key={o.id} value={String(o.id)}>{o.name}</option>)}
              </Select>
            </Field>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Block number" error={errors.block}><Input value={v.block} onChange={(e) => set('block', e.target.value)} placeholder="4" maxLength={30} /></Field>
            <Field label="Lot number" error={errors.lot}><Input value={v.lot} onChange={(e) => set('lot', e.target.value)} placeholder="21" maxLength={30} /></Field>
          </div>
          <Field label="Password" error={errors.password}>
            <PasswordInput value={v.password} onChange={(e) => set('password', e.target.value)} autoComplete="new-password" />
          </Field>
          <PasswordRules password={v.password} />
          <Field label="Confirm password" error={errors.confirm}>
            <PasswordInput value={v.confirm} onChange={(e) => set('confirm', e.target.value)} autoComplete="new-password" />
          </Field>
        </div>
        <Button type="submit" variant="primary" block loading={pending}>Create account</Button>
        <p className="rs-center rs-sub">Already have an account? <Link to={residentPath('/login')}>Sign in</Link></p>
        <p className="rs-center rs-sub">Did your Subdivision Leader create your account? Open the activation link in the email we sent you instead.</p>
      </form>
    </AuthShell>
  );
}
