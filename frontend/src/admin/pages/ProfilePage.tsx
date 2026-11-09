import { useState, type FormEvent } from 'react';
import { KeyRound } from 'lucide-react';
import { useAuth } from '../auth/context';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Field, Input } from '../components/form';
import { Avatar, Block, FormError, Kv, PageHeader, Panel } from '../components/layout';
import { SaveBar } from '../components/SaveBar';
import { useToast } from '../components/toast';
import { useAdminData } from '../data/context';
import { ChangePasswordDialog } from '../dialogs/PasswordDialog';
import { fmtDate, fmtDateTime } from '../../preview/lib/format';
import { usePageTitle } from '../lib/hooks';
import { useUnsavedGuard } from '../lib/navGuard';
import { useSubmit } from '../lib/useSubmit';

/** A22 — Admin profile: name, contact information, password and account information. */
export default function ProfilePage() {
  usePageTitle('Your profile');
  const { state, dispatch } = useAdminData();
  const { session } = useAuth();
  const toast = useToast();
  const { pending, error, run } = useSubmit();
  const a = state.admin;
  const initial = { name: a.name, title: a.title, email: a.email, phone: a.phone };
  const [f, setF] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [changing, setChanging] = useState(false);
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);
  useUnsavedGuard(dirty);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (f.name.trim().length < 2) next.name = 'Enter your name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) next.email = 'Enter a valid email address.';
    setErrors(next);
    if (Object.keys(next).length) return;
    if (await run(() => dispatch({ type: 'admin/updateProfile', patch: { name: f.name.trim(), title: f.title.trim(), email: f.email.trim(), phone: f.phone.trim() } }))) toast.success('Profile saved');
  };

  return (
    <div className="max-w-[760px]">
      <PageHeader title="Your profile" description="How you appear in case history and to the people you coordinate with." />
      <div className="flex flex-col gap-5">
        <form onSubmit={submit} noValidate>
          <Panel>
            <Block>
              <div className="mb-5 flex items-center gap-4"><Avatar name={f.name || a.name} size="lg" brand /><div><p className="sa-semibold">{a.name}</p><p className="sa-small sa-text-2">{a.role} · {a.subdivision}</p></div></div>
              <div className="flex flex-col gap-5">
                <div className="sa-grid2">
                  <Field label="Name" required error={errors.name}><Input value={f.name} autoComplete="name" onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
                  <Field label="Position" optional><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
                </div>
                <div className="sa-grid2">
                  <Field label="Email" required error={errors.email}><Input type="email" value={f.email} autoComplete="email" onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
                  <Field label="Phone" optional><Input type="tel" value={f.phone} autoComplete="tel" onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
                </div>
                {error ? <FormError message={error} /> : null}
              </div>
            </Block>
          </Panel>
          <SaveBar dirty={dirty} pending={pending} label="Save profile" onDiscard={() => { setF(initial); setErrors({}); }} />
        </form>

        <Panel>
          <Block title="Password" description="Use at least 12 characters, with upper and lower case letters, a number and a special character." action={<Button icon={KeyRound} onClick={() => setChanging(true)}>Change password</Button>}>
            <p className="sa-small sa-text-2">You will stay signed in on this device after changing it.</p>
          </Block>
        </Panel>

        <Panel>
          <Block title="Account information">
            <Kv wide rows={[
              ['Role', a.role], ['Subdivision', a.subdivision], ['Member since', fmtDate(a.memberSince)],
              ['This session', session ? <span>Started {fmtDateTime(session.startedAt)} <Badge>Preview</Badge></span> : '—'],
            ]} />
          </Block>
        </Panel>
      </div>
      {changing ? <ChangePasswordDialog onClose={() => setChanging(false)} /> : null}
    </div>
  );
}
