import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Field, Input } from '../../components/form';
import { Screen } from '../../components/Screen';
import { DiscardSheet } from '../../components/Sheet';
import { useToast } from '../../components/toast';
import { Button, Callout, FormError } from '../../components/ui';
import { residentPath } from '../../config';
import { useResidentData } from '../../data/context';
import { useFormFocus, useLeaveGuard, useSubmit } from '../../lib/hooks';

const PH_MOBILE = /^(?:\+?63|0)9\d{9}$/;

interface Values { phone: string }
type Errors = Partial<Record<keyof Values, string>>;

/** R35 — Edit the profile. Name, email, and address are managed by the Subdivision Leader; only mobile number can be updated here. */
export default function EditProfilePage() {
  const { state, dispatch } = useResidentData();
  const navigate = useNavigate();
  const toast = useToast();
  const { ref, invalid } = useFormFocus();
  const { pending, error, run } = useSubmit();
  const { profile } = state;
  const [initial] = useState<Values>(() => ({ phone: profile.phone }));
  const [v, setV] = useState<Values>(initial);
  const [errors, setErrors] = useState<Errors>({});
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);
  const guard = useLeaveGuard(dirty, residentPath('/profile'));
  const set = (key: keyof Values, value: string) => { setV((p) => ({ ...p, [key]: value })); setErrors((p) => ({ ...p, [key]: undefined })); };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    const found: Errors = {};
    if (!PH_MOBILE.test(v.phone.replace(/[\s-]/g, ''))) found.phone = 'Enter a mobile number like 0917 123 4567.';
    setErrors(found);
    if (Object.keys(found).length > 0) { invalid(); return; }
    if (!dirty) { navigate(residentPath('/profile'), { replace: true }); return; }
    const ok = await run(async () => {
      await dispatch({ type: 'profile/update', patch: { phone: v.phone.trim() } });
    });
    if (ok) { toast.success('Profile updated'); navigate(residentPath('/profile'), { replace: true }); }
  };

  return (
    <Screen
      title="Edit profile"
      onBack={guard.leave}
      footer={(
        <>
          <Button type="submit" form="profile-form" variant="primary" block loading={pending} disabled={!dirty}>Save changes</Button>
          <Button variant="ghost" block onClick={guard.leave} disabled={pending}>Cancel</Button>
        </>
      )}
    >
      <Callout tone="info">Your name, email, and address are from your official subdivision record and cannot be changed here. Contact your Subdivision Leader if any of those details need correction.</Callout>
      {error ? <FormError message={error} /> : null}
      <form id="profile-form" className="rs-stack" onSubmit={(e) => void submit(e)} noValidate>
        <div ref={ref} className="rs-stack">
          <Field label="Full name" hint="Managed by your Subdivision Leader.">
            <Input value={profile.name} readOnly disabled autoComplete="name" />
          </Field>
          <Field label="Email" hint="This is the address you sign in with. Managed by your Subdivision Leader.">
            <Input type="email" value={profile.email} readOnly disabled autoComplete="email" />
          </Field>
          <Field label="Mobile number" required error={errors.phone}>
            <Input type="tel" inputMode="tel" value={v.phone} onChange={(e) => set('phone', e.target.value)} autoComplete="tel" />
          </Field>
          <Field label="Block and lot" hint="Managed by your Subdivision Leader.">
            <Input value={profile.unit} readOnly disabled autoComplete="off" />
          </Field>
          <Field label="Street" hint="Managed by your Subdivision Leader.">
            <Input value={profile.street} readOnly disabled autoComplete="street-address" />
          </Field>
        </div>
      </form>
      {guard.asking ? <DiscardSheet onDiscard={guard.discard} onKeep={guard.keep} /> : null}
    </Screen>
  );
}
