import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Field, Input, Select } from '../../components/form';
import { Screen } from '../../components/Screen';
import { DiscardSheet } from '../../components/Sheet';
import { useToast } from '../../components/toast';
import { Button, Callout, FormError } from '../../components/ui';
import { residentPath } from '../../config';
import { useResidentData } from '../../data/context';
import { useFormFocus, useLeaveGuard, useSubmit } from '../../lib/hooks';

const STREETS = ['Acacia St.', 'Molave St.', 'Narra Ave.', 'Mahogany Ln.', 'Kamagong St.'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PH_MOBILE = /^(?:\+?63|0)9\d{9}$/;

interface Values { name: string; email: string; phone: string; unit: string; street: string }
type Errors = Partial<Record<keyof Values, string>>;

/** R35 — Edit the profile. Changes are shown straight away on the Profile screen. */
export default function EditProfilePage() {
  const { state, dispatch } = useResidentData();
  const navigate = useNavigate();
  const toast = useToast();
  const { ref, invalid } = useFormFocus();
  const { pending, error, run } = useSubmit();
  const { profile } = state;
  const [initial] = useState<Values>(() => ({ name: profile.name, email: profile.email, phone: profile.phone, unit: profile.unit, street: profile.street }));
  const [v, setV] = useState<Values>(initial);
  const [errors, setErrors] = useState<Errors>({});
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);
  const guard = useLeaveGuard(dirty, residentPath('/profile'));
  const set = (key: keyof Values, value: string) => { setV((p) => ({ ...p, [key]: value })); setErrors((p) => ({ ...p, [key]: undefined })); };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    const found: Errors = {};
    if (v.name.trim().length < 2) found.name = 'Enter your full name.';
    if (!EMAIL.test(v.email.trim())) found.email = 'Enter a valid email address, like name@example.com.';
    if (!PH_MOBILE.test(v.phone.replace(/[\s-]/g, ''))) found.phone = 'Enter a mobile number like 0917 123 4567.';
    if (!v.unit.trim()) found.unit = 'Enter your block and lot.';
    if (!v.street) found.street = 'Choose your street.';
    setErrors(found);
    if (Object.keys(found).length > 0) { invalid(); return; }
    if (!dirty) { navigate(residentPath('/profile'), { replace: true }); return; }
    const ok = await run(async () => {
      await dispatch({ type: 'profile/update', patch: { name: v.name.trim(), email: v.email.trim(), phone: v.phone.trim(), unit: v.unit.trim(), street: v.street } });
    });
    if (ok) { toast.success('Profile updated'); navigate(residentPath('/profile'), { replace: true }); }
  };

  return (
    <Screen
      title="Edit profile"
      onBack={guard.leave}
      footer={(
        <>
          <Button type="submit" form="profile-form" variant="primary" block loading={pending}>Save changes</Button>
          <Button variant="ghost" block onClick={guard.leave} disabled={pending}>Cancel</Button>
        </>
      )}
    >
      <Callout tone="info">Neighbours never see your name, phone number or address. Administrators can see them so they can follow up on your reports.</Callout>
      {error ? <FormError message={error} /> : null}
      <form id="profile-form" className="rs-stack" onSubmit={(e) => void submit(e)} noValidate>
        <div ref={ref} className="rs-stack">
          <Field label="Full name" required error={errors.name}>
            <Input value={v.name} onChange={(e) => set('name', e.target.value)} autoComplete="name" />
          </Field>
          <Field label="Email" required error={errors.email} hint="In the real app, changing your email asks you to verify the new address.">
            <Input type="email" inputMode="email" value={v.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" />
          </Field>
          <Field label="Mobile number" required error={errors.phone}>
            <Input type="tel" inputMode="tel" value={v.phone} onChange={(e) => set('phone', e.target.value)} autoComplete="tel" />
          </Field>
          <Field label="Block and lot" required error={errors.unit}>
            <Input value={v.unit} onChange={(e) => set('unit', e.target.value)} autoComplete="off" />
          </Field>
          <Field label="Street" required error={errors.street}>
            <Select value={v.street} onChange={(e) => set('street', e.target.value)}>
              <option value="">Choose your street</option>
              {STREETS.includes(v.street) ? null : <option value={v.street}>{v.street}</option>}
              {STREETS.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </Field>
        </div>
      </form>
      {guard.asking ? <DiscardSheet onDiscard={guard.discard} onKeep={guard.keep} /> : null}
    </Screen>
  );
}
