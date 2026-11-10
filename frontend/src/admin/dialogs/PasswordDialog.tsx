import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/context';
import { Button } from '../components/Button';
import { Dialog } from '../components/Dialog';
import { Field, PasswordInput } from '../components/form';
import { Callout, FormError } from '../components/layout';
import { PasswordRules } from '../components/PasswordRules';
import { useToast } from '../components/toast';
import { useSubmit } from '../lib/useSubmit';
import { isPasswordValid } from '../../utils/passwordPolicy';

/** Change password (A22). Follows the platform's password policy. */
export function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const { changePassword } = useAuth();
  const toast = useToast();
  const { pending, error, run } = useSubmit();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const found: Record<string, string> = {};
    if (!current) found.current = 'Enter your current password.';
    if (!isPasswordValid(next)) found.next = 'Your new password does not meet all the requirements.';
    if (confirm !== next) found.confirm = 'The two passwords do not match.';
    setErrors(found);
    if (Object.keys(found).length) return;
    if (await run(() => changePassword(current, next))) { toast.success('Password changed'); onClose(); }
  };

  return (
    <Dialog size="sm" title="Change password" description="Choose something you don’t use anywhere else." onClose={onClose} dirty={current !== '' || next !== '' || confirm !== ''} onSubmit={submit}
      footer={({ requestClose }) => (<><Button onClick={requestClose} disabled={pending}>Cancel</Button><Button type="submit" variant="primary" loading={pending}>Change password</Button></>)}>
      <Field label="Current password" error={errors.current}><PasswordInput autoFocus autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></Field>
      <Field label="New password" error={errors.next}><PasswordInput autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></Field>
      <PasswordRules password={next} />
      <Field label="Confirm new password" error={errors.confirm}><PasswordInput autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
      <Callout>For your security you will be signed out everywhere, including on this device, and asked to sign in with the new password.</Callout>
      {error ? <FormError message={error} /> : null}
    </Dialog>
  );
}
