import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { CircleHelp, KeyRound, LockKeyhole, LogOut } from 'lucide-react';
import { isPasswordValid } from '../../../utils/passwordPolicy';
import { useAuth } from '../../auth/context';
import { Field, PasswordInput, ToggleRow } from '../../components/form';
import { LogoutSheet } from '../../components/LogoutSheet';
import { Screen } from '../../components/Screen';
import { DiscardSheet, Sheet } from '../../components/Sheet';
import { useToast } from '../../components/toast';
import { Button, FormError, Row, Section } from '../../components/ui';
import { residentPath } from '../../config';
import { useResidentData } from '../../data/context';
import type { Settings } from '../../data/types';
import { useFormFocus, useLeaveGuard, useSubmit } from '../../lib/hooks';
import { PasswordRules } from '../auth/AuthShell';

/** The change-password sheet. The password is only ever sent to the (simulated) server, never stored. */
function PasswordSheet({ onClose }: { onClose: () => void }) {
  const { changePassword } = useAuth();
  const toast = useToast();
  const { ref, invalid } = useFormFocus();
  const { pending, error, run } = useSubmit();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Partial<Record<'current' | 'next' | 'confirm', string>>>({});

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    const found: typeof errors = {};
    if (!current) found.current = 'Enter your current password.';
    if (!next) found.next = 'Choose a new password.';
    else if (!isPasswordValid(next)) found.next = 'Your new password does not meet all the requirements yet.';
    else if (next === current) found.next = 'Choose a password that is different from the current one.';
    if (!confirm) found.confirm = 'Type your new password again.';
    else if (confirm !== next) found.confirm = 'The two passwords do not match.';
    setErrors(found);
    if (Object.keys(found).length > 0) { invalid(); return; }
    if (await run(() => changePassword(current, next))) { toast.success('Password updated'); onClose(); }
  };

  return (
    <Sheet
      title="Change password"
      tall
      dirty={current !== '' || next !== '' || confirm !== ''}
      onClose={onClose}
      onSubmit={(e) => void submit(e)}
      footer={({ requestClose }) => (
        <>
          <Button type="submit" variant="primary" block loading={pending}>Update password</Button>
          <Button variant="ghost" block onClick={requestClose} disabled={pending}>Cancel</Button>
        </>
      )}
    >
      {error ? <FormError message={error} /> : null}
      <div ref={ref} className="rs-stack">
        <Field label="Current password" error={errors.current}>
          <PasswordInput value={current} onChange={(e) => { setCurrent(e.target.value); setErrors((p) => ({ ...p, current: undefined })); }} autoComplete="current-password" autoFocus />
        </Field>
        <Field label="New password" error={errors.next}>
          <PasswordInput value={next} onChange={(e) => { setNext(e.target.value); setErrors((p) => ({ ...p, next: undefined })); }} autoComplete="new-password" />
        </Field>
        <PasswordRules password={next} />
        <Field label="Confirm new password" error={errors.confirm}>
          <PasswordInput value={confirm} onChange={(e) => { setConfirm(e.target.value); setErrors((p) => ({ ...p, confirm: undefined })); }} autoComplete="new-password" />
        </Field>
      </div>
    </Sheet>
  );
}

/** R36 — Notification choices and password. */
export default function SettingsPage() {
  const { state, dispatch } = useResidentData();
  const navigate = useNavigate();
  const toast = useToast();
  const { pending, error, run } = useSubmit();
  const [initial] = useState<Settings>(() => state.settings);
  const [draft, setDraft] = useState<Settings>(initial);
  const [changing, setChanging] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const guard = useLeaveGuard(dirty, residentPath('/profile'));

  const topic = (key: keyof Settings['notifications']) => (v: boolean) => setDraft((d) => ({ ...d, notifications: { ...d.notifications, [key]: v } }));
  const channel = (key: keyof Settings['channels']) => (v: boolean) => setDraft((d) => ({ ...d, channels: { ...d.channels, [key]: v } }));

  const save = async () => {
    if (await run(async () => { await dispatch({ type: 'settings/set', settings: draft }); })) {
      toast.success('Settings saved');
      navigate(residentPath('/profile'), { replace: true });
    }
  };

  return (
    <Screen
      title="Settings"
      onBack={guard.leave}
      footer={dirty ? (
        <>
          <Button variant="primary" block loading={pending} onClick={() => void save()}>Save changes</Button>
          <Button variant="ghost" block onClick={guard.leave} disabled={pending}>Cancel</Button>
        </>
      ) : undefined}
    >
      {error ? <FormError message={error} /> : null}
      <Section title="What you hear about">
        <div className="rs-list">
          <ToggleRow title="Updates on my reports" meta="When a status changes or the subdivision writes to you" checked={draft.notifications.reportUpdates} onChange={topic('reportUpdates')} />
          <ToggleRow title="Sightings of my lost pet" meta="When a neighbour reports seeing your pet" checked={draft.notifications.sightings} onChange={topic('sightings')} />
          <ToggleRow title="Ownership claim updates" checked={draft.notifications.claims} onChange={topic('claims')} />
          <ToggleRow title="New community notices" meta="Lost and found animals near you" checked={draft.notifications.community} onChange={topic('community')} />
          <ToggleRow title="Safety advisories" meta="Always on, for your safety" checked disabled onChange={topic('advisories')} />
        </div>
      </Section>
      <Section title="How you hear">
        <div className="rs-list">
          <ToggleRow title="Notifications in the app" checked={draft.channels.push} onChange={channel('push')} />
          <ToggleRow title="Email" checked={draft.channels.email} onChange={channel('email')} />
          <ToggleRow title="Text message" meta="Only for urgent updates" checked={draft.channels.sms} onChange={channel('sms')} />
        </div>
      </Section>
      <Section title="Security">
        <div className="rs-list">
          <Row icon={KeyRound} title="Change password" onClick={() => setChanging(true)} />
        </div>
      </Section>
      <Section title="Privacy, help and account">
        <div className="rs-list">
          <Row icon={LockKeyhole} title="Privacy and your data" meta="What is shared, and with whom" onClick={() => guard.leaveTo(residentPath('/privacy'))} />
          <Row icon={CircleHelp} title="Help" meta="Questions about reports, notices and claims" onClick={() => guard.leaveTo(residentPath('/help'))} />
          <Row icon={LogOut} title="Sign out" onClick={() => setLeaving(true)} danger />
        </div>
      </Section>
      {changing ? <PasswordSheet onClose={() => setChanging(false)} /> : null}
      {leaving ? <LogoutSheet onClose={() => setLeaving(false)} /> : null}
      {guard.asking ? <DiscardSheet onDiscard={guard.discard} onKeep={guard.keep} /> : null}
    </Screen>
  );
}
