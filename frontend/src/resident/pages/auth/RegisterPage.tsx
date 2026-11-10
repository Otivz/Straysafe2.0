import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { isPasswordValid } from '../../../utils/passwordPolicy';
import { useAuth } from '../../auth/context';
import { Checkbox, Field, Input, PasswordInput, Select } from '../../components/form';
import { Button, FormError } from '../../components/ui';
import { residentPath } from '../../config';
import { useFormFocus, useSubmit } from '../../lib/hooks';
import { AuthShell, PasswordRules } from './AuthShell';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PH_MOBILE = /^(?:\+?63|0)9\d{9}$/;

interface Values { name: string; email: string; phone: string; unit: string; street: string; subdivision: string; password: string; confirm: string; agree: boolean }
const EMPTY: Values = { name: '', email: '', phone: '', unit: '', street: '', subdivision: '', password: '', confirm: '', agree: false };

function validate(v: Values, chooseSubdivision: boolean): Partial<Record<keyof Values, string>> {
  const e: Partial<Record<keyof Values, string>> = {};
  if (v.name.trim().length < 2) e.name = 'Enter your full name.';
  if (!v.email.trim()) e.email = 'Enter your email address.';
  else if (!EMAIL.test(v.email.trim())) e.email = 'Enter a valid email address, like name@example.com.';
  if (!v.phone.trim()) e.phone = 'Enter your mobile number.';
  else if (!PH_MOBILE.test(v.phone.replace(/[\s-]/g, ''))) e.phone = 'Enter a mobile number like 0917 123 4567.';
  if (!v.unit.trim()) e.unit = 'Enter your block and lot, for example Block 4, Lot 21.';
  if (!v.street.trim()) e.street = 'Enter your street.';
  if (chooseSubdivision && !v.subdivision) e.subdivision = 'Choose your subdivision.';
  if (!v.password) e.password = 'Create a password.';
  else if (!isPasswordValid(v.password)) e.password = 'Your password does not meet all the requirements yet.';
  if (!v.confirm) e.confirm = 'Type your password again.';
  else if (v.confirm !== v.password) e.confirm = 'The two passwords do not match.';
  if (!v.agree) e.agree = 'Please agree to continue.';
  return e;
}

/**
 * R02 — Create an account. The password is sent to the server and never kept in this tab; only the profile is kept until the
 * code is entered. The street is typed (there is no street list on the server), and the subdivision is asked for only when the
 * server offers more than one.
 */
export default function RegisterPage() {
  const { register, subdivisions } = useAuth();
  const navigate = useNavigate();
  const origin = ((useLocation().state ?? null) as { from?: string } | null)?.from;
  const { pending, error, run } = useSubmit();
  const { ref, invalid } = useFormFocus();
  const [v, setV] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof Values, string>>>({});
  const [options, setOptions] = useState<{ id: number; name: string }[]>([]);
  const chooseSubdivision = options.length > 1;

  // The subdivisions a new resident can join.
  useEffect(() => {
    let cancelled = false;
    subdivisions().then((list) => { if (!cancelled) setOptions(list); }, () => { /* the server will say if none is open when the form is sent */ });
    return () => { cancelled = true; };
  }, [subdivisions]);

  const set = <K extends keyof Values>(key: K, value: Values[K]) => {
    setV((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    const found = validate(v, chooseSubdivision);
    setErrors(found);
    if (Object.keys(found).length > 0) { invalid(); return; }
    const ok = await run(() => register(
      { name: v.name.trim(), email: v.email.trim(), phone: v.phone.trim(), unit: v.unit.trim(), street: v.street.trim(), ...(chooseSubdivision ? { subdivisionId: Number(v.subdivision) } : {}) },
      v.password,
    ));
    if (ok) navigate(residentPath('/verify'), { state: { from: origin } });
  };

  return (
    <AuthShell title="Create your account" lead="Use your real name and the address where you live. Neighbours never see your name, phone or address." back="/welcome">
      <form className="rs-stack" onSubmit={(e) => void submit(e)} noValidate>
        {error ? <FormError message={error} /> : null}
        <div ref={ref} className="rs-stack">
          <Field label="Full name" error={errors.name}>
            <Input value={v.name} onChange={(e) => set('name', e.target.value)} autoComplete="name" placeholder="Maria Santos" />
          </Field>
          <Field label="Email" error={errors.email}>
            <Input type="email" inputMode="email" value={v.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" placeholder="name@example.com" />
          </Field>
          <Field label="Mobile number" hint="Used for verification and urgent updates." error={errors.phone}>
            <Input type="tel" inputMode="tel" value={v.phone} onChange={(e) => set('phone', e.target.value)} autoComplete="tel" placeholder="0917 123 4567" />
          </Field>
          {chooseSubdivision ? (
            <Field label="Subdivision" error={errors.subdivision}>
              <Select value={v.subdivision} onChange={(e) => set('subdivision', e.target.value)}>
                <option value="">Choose your subdivision</option>
                {options.map((o) => <option key={o.id} value={String(o.id)}>{o.name}</option>)}
              </Select>
            </Field>
          ) : null}
          <Field label="Block and lot" error={errors.unit}>
            <Input value={v.unit} onChange={(e) => set('unit', e.target.value)} autoComplete="off" placeholder="Block 4, Lot 21" />
          </Field>
          <Field label="Street" error={errors.street}>
            <Input value={v.street} onChange={(e) => set('street', e.target.value)} autoComplete="street-address" placeholder="Street name" />
          </Field>
          <Field label="Password" error={errors.password}>
            <PasswordInput value={v.password} onChange={(e) => set('password', e.target.value)} autoComplete="new-password" />
          </Field>
          <PasswordRules password={v.password} />
          <Field label="Confirm password" error={errors.confirm}>
            <PasswordInput value={v.confirm} onChange={(e) => set('confirm', e.target.value)} autoComplete="new-password" />
          </Field>
          <Checkbox
            checked={v.agree}
            onChange={(e) => set('agree', e.target.checked)}
            error={errors.agree}
            label="I agree to the terms of use and the privacy notice."
            hint="Administrators can see who sent a report. We do not offer anonymous reporting."
          />
        </div>
        <Button type="submit" variant="primary" block loading={pending}>Create account</Button>
        <p className="rs-center rs-sub">Already have an account? <Link to={residentPath('/login')}>Sign in</Link></p>
      </form>
    </AuthShell>
  );
}
