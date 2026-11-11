import { useState, type FormEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bell, Building2, ListChecks, Lock, Pencil, Plus, ScrollText, ShieldCheck, Trash2, UserRound } from 'lucide-react';
import { adminPath } from '../config';
import { useAuth } from '../auth/context';
import { Badge } from '../components/Badge';
import { Button, LinkButton } from '../components/Button';
import { ConfirmDialog } from '../components/Dialog';
import { Field, FieldGroup, Input, OptionGroup, Switch } from '../components/form';
import { Block, Callout, FormError, Kv, PageHeader, Panel } from '../components/layout';
import { SaveBar } from '../components/SaveBar';
import { useToast } from '../components/toast';
import { CATEGORIES, CATEGORY_IDS } from '../data/constants';
import { useAdminData } from '../data/context';
import type { CategoryId, Policy, PublicationMode, Settings } from '../data/types';
import { PolicyDialog } from '../dialogs/PolicyDialog';
import { fmtDateTime } from '../../preview/lib/format';
import { usePageTitle } from '../lib/hooks';
import { useGuardedNavigate, useUnsavedGuard } from '../lib/navGuard';
import { useSubmit } from '../lib/useSubmit';

type SectionKey = 'profile' | 'account' | 'notifications' | 'categories' | 'policies' | 'privacy';
const SECTIONS: { key: SectionKey; label: string; icon: typeof Bell }[] = [
  { key: 'profile', label: 'Subdivision profile', icon: Building2 },
  { key: 'account', label: 'Administrator account', icon: UserRound },
  { key: 'notifications', label: 'Notifications', icon: Bell },
  { key: 'categories', label: 'Incident categories', icon: ListChecks },
  { key: 'policies', label: 'Policy references', icon: ScrollText },
  { key: 'privacy', label: 'Privacy & access', icon: ShieldCheck },
];

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Shared by every section: the current settings and a save that reports success or failure the same way. */
function useSaveSettings() {
  const { state, dispatch } = useAdminData();
  const toast = useToast();
  const submit = useSubmit();
  const save = (next: Settings, message: string) => submit.run(async () => { await dispatch({ type: 'settings/set', settings: next }); toast.success(message); });
  return { settings: state.settings, save, pending: submit.pending, error: submit.error };
}

const Row = ({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) => (
  <div className="sa-setting"><div className="min-w-0"><p className="font-medium">{title}</p>{description ? <p className="sa-small sa-text-3">{description}</p> : null}</div>{children}</div>
);

// ------------------------------------------------------------------------------------------------------ profile
function ProfileSection() {
  const { settings, save, pending, error } = useSaveSettings();
  const { capabilities } = useAdminData();
  const initial = settings.subdivision;
  const [f, setF] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const dirty = !same(f, initial);
  useUnsavedGuard(dirty);
  const set = (patch: Partial<typeof f>) => setF((p) => ({ ...p, ...patch }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (capabilities.editSubdivisionIdentity && f.name.trim().length < 2) next.name = 'Enter the subdivision’s name.';
    if (f.officeEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.officeEmail)) next.officeEmail = 'Enter a valid email address.';
    setErrors(next);
    if (Object.keys(next).length === 0) await save({ ...settings, subdivision: { ...f, name: f.name.trim() } }, 'Subdivision profile saved');
  };

  return (
    <form onSubmit={submit} noValidate>
      <Panel>
        <Block title="Subdivision profile" description="Shown to residents. The office contact is how neighbours reach you from a notice, so no personal numbers are needed.">
          <div className="flex flex-col gap-5">
            <Field label="Subdivision name" required error={errors.name} hint={capabilities.editSubdivisionIdentity ? undefined : 'Set by the system administrator.'}><Input value={f.name} disabled={!capabilities.editSubdivisionIdentity} onChange={(e) => set({ name: e.target.value })} /></Field>
            <div className="sa-grid2">
              <Field label="City or municipality" optional hint={capabilities.editSubdivisionIdentity ? undefined : 'Set by the system administrator.'}><Input value={f.city} disabled={!capabilities.editSubdivisionIdentity} onChange={(e) => set({ city: e.target.value })} /></Field>
              <Field label="Office address"><Input value={f.address} onChange={(e) => set({ address: e.target.value })} /></Field>
            </div>
            <div className="sa-grid2">
              <Field label="Office phone"><Input value={f.officePhone} onChange={(e) => set({ officePhone: e.target.value })} /></Field>
              <Field label="Office email" error={errors.officeEmail}><Input type="email" value={f.officeEmail} onChange={(e) => set({ officeEmail: e.target.value })} /></Field>
            </div>
            <Field label="Office hours"><Input value={f.officeHours} onChange={(e) => set({ officeHours: e.target.value })} /></Field>
            {error ? <FormError message={error} /> : null}
          </div>
        </Block>
      </Panel>
      <SaveBar dirty={dirty} pending={pending} label="Save profile" onDiscard={() => { setF(initial); setErrors({}); }} />
    </form>
  );
}

// ------------------------------------------------------------------------------------------------------ account
function AccountSection() {
  const { state } = useAdminData();
  const { session } = useAuth();
  return (
    <Panel>
      <Block title="Administrator account" description="One administrator role covers reviewing reports, coordinating, monitoring and closing cases.">
        <Kv wide rows={[['Name', state.admin.name], ['Email', state.admin.email], ['Role', state.admin.role], ['Signed in', session ? <span>{fmtDateTime(session.startedAt)}</span> : '—']]} />
        <div className="mt-5 flex flex-wrap gap-2"><LinkButton to={adminPath('/profile')} icon={Pencil}>Edit profile and password</LinkButton></div>
      </Block>
      <Block title="Roles"><p className="sa-small sa-text-2 sa-prose">StraySafe starts with a single administrator role. Additional internal roles should only be introduced when your subdivision’s operations genuinely need them. External authorities such as the barangay do not have their own accounts. Record what they tell you under External coordination in a case.</p></Block>
    </Panel>
  );
}

// ----------------------------------------------------------------------------------------------- notifications
function NotificationsSection() {
  const { settings, save, pending, error } = useSaveSettings();
  const initial = settings.notifications;
  const [f, setF] = useState(initial);
  const dirty = !same(f, initial);
  useUnsavedGuard(dirty);
  const flag = (key: 'newReports' | 'followUps' | 'claims' | 'caseActivity') => (v: boolean) => setF((p) => ({ ...p, [key]: v }));
  const channel = (key: 'email' | 'push') => (v: boolean) => setF((p) => ({ ...p, channels: { ...p.channels, [key]: v } }));

  return (
    <form onSubmit={(e) => { e.preventDefault(); void save({ ...settings, notifications: f }, 'Notification preferences saved'); }} noValidate>
      <Panel>
        <Block title="What to be notified about" description="Not every update needs a notification. These control what reaches you.">
          <Row title="New reports" description="A resident submits a report."><Switch label="New reports" checked={f.newReports} onChange={flag('newReports')} /></Row>
          <Row title="Urgent incidents" description="Always on. Urgent safety concerns must never wait."><Switch label="Urgent incidents (always on)" checked disabled onChange={() => undefined} /></Row>
          <Row title="Follow-up reminders" description="A follow-up or observation period is due."><Switch label="Follow-up reminders" checked={f.followUps} onChange={flag('followUps')} /></Row>
          <Row title="Ownership claim updates" description="Someone submits or updates a claim."><Switch label="Ownership claim updates" checked={f.claims} onChange={flag('claims')} /></Row>
          <Row title="Relevant case activity" description="Reporters add information or sightings."><Switch label="Relevant case activity" checked={f.caseActivity} onChange={flag('caseActivity')} /></Row>
        </Block>
        <Block title="Where to receive them">
          <Row title="In the app" description="The bell in the sidebar. Always on."><Switch label="In-app notifications (always on)" checked disabled onChange={() => undefined} /></Row>
          <Row title="Email" description="Sent to your administrator email."><Switch label="Email notifications" checked={f.channels.email} onChange={channel('email')} /></Row>
          <Row title="Push notifications" description="On devices where you installed the app."><Switch label="Push notifications" checked={f.channels.push} onChange={channel('push')} /></Row>
          {error ? <div className="mt-4"><FormError message={error} /></div> : null}
        </Block>
      </Panel>
      <SaveBar dirty={dirty} pending={pending} label="Save preferences" onDiscard={() => setF(initial)} />
    </form>
  );
}

// ------------------------------------------------------------------------------------------------- categories
function CategoriesSection() {
  const { settings, save, pending, error } = useSaveSettings();
  const initial = settings.categories;
  const [f, setF] = useState(initial);
  const dirty = !same(f, initial);
  useUnsavedGuard(dirty);
  const enabled = CATEGORY_IDS.filter((id) => f[id]).length;

  return (
    <form onSubmit={(e) => { e.preventDefault(); void save({ ...settings, categories: f }, 'Incident categories saved'); }} noValidate>
      <Panel>
        <Block title="Incident categories" description="The kinds of concern residents can report. Turning one off hides it from the report form. Existing cases keep their category.">
          {CATEGORY_IDS.map((id: CategoryId) => (
            <Row key={id} title={CATEGORIES[id].label} description={CATEGORIES[id].description}>
              <Switch label={`${CATEGORIES[id].label} enabled`} checked={f[id]} disabled={f[id] && enabled === 1} onChange={(v) => setF((p) => ({ ...p, [id]: v }))} />
            </Row>
          ))}
          <p className="sa-hint mt-3">At least one category stays on. Reports of any animal type are accepted: dogs, cats, birds, reptiles, livestock and others.</p>
          {error ? <div className="mt-4"><FormError message={error} /></div> : null}
        </Block>
      </Panel>
      <SaveBar dirty={dirty} pending={pending} label="Save categories" onDiscard={() => setF(initial)} />
    </form>
  );
}

// ---------------------------------------------------------------------------------------------------- policies
function PoliciesSection() {
  const { settings, save, error } = useSaveSettings();
  const [editing, setEditing] = useState<Policy | 'new' | null>(null);
  const [removing, setRemoving] = useState<Policy | null>(null);

  const upsert = async (p: Policy) => {
    const exists = settings.policies.some((x) => x.id === p.id);
    const policies = exists ? settings.policies.map((x) => (x.id === p.id ? p : x)) : [...settings.policies, p];
    if (await save({ ...settings, policies }, exists ? 'Policy updated' : 'Policy added')) setEditing(null);
  };

  return (
    <>
      <Panel>
        <Block title="Policy references" description="The rules your subdivision actually has. Warnings are issued under a confirmed policy, and the observation period comes from the policy itself." action={<Button size="sm" icon={Plus} onClick={() => setEditing('new')}>Add policy</Button>}>
          {settings.policies.length === 0 ? <p className="sa-small sa-text-2">No policies yet. Without a confirmed policy, no warning can be issued.</p> : (
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {settings.policies.map((p) => (
                <li key={p.id} className="sa-record">
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1.5"><span className="sa-semibold">{p.reference}</span><span className="sa-text-2">{p.title}</span><Badge tone={p.status === 'confirmed' ? 'sage' : 'amber'} dot>{p.status === 'confirmed' ? 'Confirmed' : 'Awaiting confirmation'}</Badge></p>
                  <p className="sa-small sa-text-2 mt-1.5">{p.summary || 'No summary.'}</p>
                  <p className="sa-meta mt-2">Applies to {p.appliesTo.map((c) => CATEGORIES[c].label).join(', ')} · {p.observationDays ? `${p.observationDays}-day observation period` : 'no observation period defined'}</p>
                  <div className="mt-3 flex gap-2"><Button size="sm" icon={Pencil} onClick={() => setEditing(p)}>Edit</Button><Button size="sm" variant="ghost" icon={Trash2} onClick={() => setRemoving(p)}>Remove</Button></div>
                </li>
              ))}
            </ul>
          )}
          {error ? <div className="mt-4"><FormError message={error} /></div> : null}
        </Block>
      </Panel>
      {editing ? <PolicyDialog policy={editing === 'new' ? undefined : editing} onSave={(p) => { void upsert(p); }} onClose={() => setEditing(null)} /> : null}
      {removing ? (
        <ConfirmDialog title="Remove this policy?" tone="danger" confirmLabel="Remove policy" onClose={() => setRemoving(null)}
          message={<>“{removing.reference} — {removing.title}” will no longer be available for new warnings. Warnings already issued keep their record of it.</>}
          onConfirm={async () => { await save({ ...settings, policies: settings.policies.filter((x) => x.id !== removing.id) }, 'Policy removed'); }} />
      ) : null}
    </>
  );
}

// ------------------------------------------------------------------------------------------------------ privacy
const RULES = [
  'Reporter identity and contact details are visible to subdivision administrators only.',
  'Private complaints about a neighbour are never published, even when a related notice exists.',
  'Public notices never include exact addresses, phone numbers or private owner information.',
  'Pet registration is declared by the owner and is never treated as proof of ownership.',
  'A case can be closed only with a documented outcome, and a closed case is not always a resolved one.',
];

function PrivacySection() {
  const { settings, save, pending, error } = useSaveSettings();
  const initial = settings.privacy;
  const [f, setF] = useState(initial);
  const dirty = !same(f, initial);
  useUnsavedGuard(dirty);
  const options: { value: PublicationMode; label: string; description: string }[] = [
    { value: 'immediate', label: 'Publish as soon as it is ready', description: 'Shown to residents as owner-reported information. You can still moderate or archive it.' },
    { value: 'review', label: 'Review before publishing', description: 'An administrator checks every notice first.' },
  ];

  return (
    <form onSubmit={(e) => { e.preventDefault(); void save({ ...settings, privacy: f }, 'Privacy and access rules saved'); }} noValidate>
      <Panel>
        <Block title="Always enforced" description="These protect residents and cannot be turned off.">
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">{RULES.map((r) => <li key={r} className="flex items-start gap-2.5 sa-small"><Lock size={14} className="sa-text-3 mt-1 shrink-0" aria-hidden="true" /><span>{r}</span></li>)}</ul>
        </Block>
        <Block title="Community publication" description="How notices reach residents, according to your community policy.">
          <div className="flex flex-col gap-5">
            <FieldGroup label="Lost-pet notices">
              <p className="sa-small"><Lock size={13} className="sa-text-3 mr-1.5 inline" aria-hidden="true" /><strong>Published at once, always.</strong> A missing pet’s notice appears as soon as the owner files the report. Nobody has to approve it, and a Leader is not asked to. You can still edit or close a notice from its case.</p>
            </FieldGroup>
            <FieldGroup label="Found-animal notices"><OptionGroup name="found" label="Found-animal publication" value={f.foundPublication} onChange={(v) => setF((p) => ({ ...p, foundPublication: v }))} options={options} /></FieldGroup>
            <Callout>Safety advisories are always published by an administrator after checking the facts.</Callout>
          </div>
          {error ? <div className="mt-4"><FormError message={error} /></div> : null}
        </Block>
      </Panel>
      <SaveBar dirty={dirty} pending={pending} label="Save rules" onDiscard={() => setF(initial)} />
    </form>
  );
}

/** A21 — Settings. Essential configuration only. */
export default function SettingsPage() {
  usePageTitle('Settings');
  const [params] = useSearchParams();
  const go = useGuardedNavigate();
  const requested = params.get('section') as SectionKey | null;
  const section: SectionKey = SECTIONS.some((s) => s.key === requested) ? (requested as SectionKey) : 'profile';

  return (
    <div>
      <PageHeader title="Settings" description="Configure your subdivision profile, how you are notified, what residents can report, and the rules warnings rely on." />
      <div className="sa-settings">
        <nav className="sa-subnav" aria-label="Settings sections">
          {SECTIONS.map(({ key, label, icon: Icon }) => (
            <button key={key} type="button" aria-current={section === key ? 'true' : undefined} onClick={() => go(`${adminPath('/settings')}?section=${key}`)}><Icon size={16} aria-hidden="true" />{label}</button>
          ))}
        </nav>
        <div className="min-w-0 max-w-[820px]">
          {section === 'profile' ? <ProfileSection /> : null}
          {section === 'account' ? <AccountSection /> : null}
          {section === 'notifications' ? <NotificationsSection /> : null}
          {section === 'categories' ? <CategoriesSection /> : null}
          {section === 'policies' ? <PoliciesSection /> : null}
          {section === 'privacy' ? <PrivacySection /> : null}
        </div>
      </div>
    </div>
  );
}
