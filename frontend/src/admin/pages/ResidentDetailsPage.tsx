import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { EllipsisVertical, FileQuestion, Lock, ShieldCheck, ShieldOff, UserCheck } from 'lucide-react';
import { adminPath } from '../config';
import { Badge } from '../components/Badge';
import { Button, LinkButton } from '../components/Button';
import { ConfirmDialog } from '../components/Dialog';
import { Avatar, Block, Callout, EmptyState, Kv, Panel } from '../components/layout';
import { Menu } from '../components/Menu';
import { PetAvatar } from '../components/PetAvatar';
import { useToast } from '../components/toast';
import { ANIMAL_TYPES, RESIDENT_STATUS } from '../data/constants';
import { useAdminData } from '../data/context';
import { petById, residentById, residentStats } from '../data/selectors';
import type { Resident } from '../data/types';
import { fmtDate, plural, relative } from '../../preview/lib/format';
import { usePageTitle } from '../lib/hooks';
import { useNow } from '../../preview/lib/hooks';

const ACTIONS: Record<Resident['status'], { label: string; icon: typeof ShieldOff; next: Resident['status']; danger?: boolean; title: string; message: string; confirm: string; done: string }[]> = {
  active: [{ label: 'Suspend account', icon: ShieldOff, next: 'suspended', danger: true, title: 'Suspend this account?', message: 'The resident will not be able to sign in or submit reports until you reactivate the account. Their existing reports and records are kept.', confirm: 'Suspend account', done: 'Account suspended' }],
  pending: [{ label: 'Verify resident', icon: UserCheck, next: 'active', title: 'Verify this resident?', message: 'Confirm that this person lives in the subdivision. They will be able to submit reports and register pets.', confirm: 'Verify resident', done: 'Resident verified' }],
  suspended: [{ label: 'Reactivate account', icon: ShieldCheck, next: 'active', title: 'Reactivate this account?', message: 'The resident will be able to sign in and submit reports again.', confirm: 'Reactivate account', done: 'Account reactivated' }],
};

/** A19 — Resident details. Shows only what an administrator needs, and never who complained about a resident's animal. */
export default function ResidentDetailsPage() {
  const { residentId } = useParams();
  const { state, dispatch } = useAdminData();
  const toast = useToast();
  const now = useNow();
  const [action, setAction] = useState<(typeof ACTIONS)['active'][number] | null>(null);
  const resident = residentById(state, residentId);
  usePageTitle(resident ? resident.name : 'Resident not found');

  if (!resident) {
    return <Panel><EmptyState icon={FileQuestion} title="We can’t find that resident" action={<LinkButton variant="primary" to={adminPath('/residents')}>Back to residents</LinkButton>}>The profile may have been removed.</EmptyState></Panel>;
  }
  const stats = residentStats(state.cases, resident);
  const pets = resident.petIds.map((id) => petById(state, id)).filter((p) => p !== undefined);
  const s = RESIDENT_STATUS[resident.status];
  const actions = ACTIONS[resident.status];
  const refs = (cases: { id: string }[]) => (cases.length ? <span className="flex flex-wrap gap-x-3 gap-y-1">{cases.slice(0, 4).map((c) => <Link key={c.id} to={adminPath(`/cases/${c.id}`)} className="sa-ref">{c.id}</Link>)}{cases.length > 4 ? <span className="sa-meta">+{cases.length - 4} more</span> : null}</span> : null);

  return (
    <div>
      <Link className="sa-back" to={adminPath('/residents')}>← Residents</Link>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar name={resident.name} size="lg" />
          <div>
            <h1 className="sa-h1">{resident.name}</h1>
            <p className="sa-text-2 mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">{resident.unit} · {resident.street}<Badge tone={s.tone} dot>{s.label}</Badge></p>
          </div>
        </div>
        <Menu
          width={230}
          trigger={(p) => <Button className="sa-btn--icon" aria-label="Account actions" {...p}><EllipsisVertical size={17} aria-hidden="true" /></Button>}
          items={actions.map((a) => ({ label: a.label, icon: a.icon, danger: a.danger, onSelect: () => setAction(a) }))}
        />
      </header>

      <div className="sa-case" style={{ marginTop: 0 }}>
        <Panel>
          <Block title={<span className="flex items-center gap-2"><Lock size={14} aria-hidden="true" />Contact information</span>} description="Visible to administrators only. Share it only when a case needs it.">
            <Kv wide rows={[['Phone', resident.phone], ['Email', resident.email], ['Address', `${resident.unit}, ${resident.street}`]]} />
          </Block>
          <Block title="Registered pets" description={pets.length ? `${plural(pets.length, 'pet')} registered by this resident` : undefined}>
            {pets.length === 0 ? <p className="sa-small sa-text-2">No pets registered.</p> : (
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {pets.map((p) => (
                  <li key={p.id} className="flex items-center gap-3">
                    <PetAvatar type={p.type} />
                    <div className="min-w-0"><p className="sa-rowtitle"><Link to={adminPath(`/pets/${p.id}`)}>{p.name}</Link></p><p className="sa-meta">{ANIMAL_TYPES[p.type]} · {p.breed}</p></div>
                  </li>
                ))}
              </ul>
            )}
          </Block>
          <Block title="Administrative information">
            <Kv wide rows={[
              ['Member since', fmtDate(resident.joinedAt)],
              ['Last active', relative(resident.lastActiveAt, now)],
              ['Reports submitted', stats.reported.length ? <span className="flex flex-col gap-1"><span>{stats.reported.length}</span>{refs(stats.reported)}</span> : '0'],
              ['Confirmed owner in', stats.asOwner.length ? <span className="flex flex-col gap-1"><span>{plural(stats.asOwner.length, 'case')}</span>{refs(stats.asOwner)}</span> : 'None'],
              ['Warnings on record', stats.warnings.length ? `${stats.warnings.length} (${stats.warnings.filter((w) => w.status === 'active').length} active)` : 'None'],
              ['Ownership claims', stats.claims.length ? String(stats.claims.length) : 'None'],
            ]} />
          </Block>
        </Panel>

        <aside className="sa-case__aside" aria-label="Account and privacy">
          <Panel>
            <Block tight title="Account status">
              <p className="mb-2"><Badge tone={s.tone} dot large>{s.label}</Badge></p>
              <p className="sa-small sa-text-2">{s.description}</p>
              {actions.map((a) => <Button key={a.label} className="mt-3" size="sm" variant={a.danger ? 'danger' : 'secondary'} icon={a.icon} onClick={() => setAction(a)}>{a.label}</Button>)}
            </Block>
          </Panel>
          <Callout icon={Lock} title="Privacy.">Who reported a complaint about this resident’s animals is never shown on this page, and private complaints are never published.</Callout>
        </aside>
      </div>

      {action ? (
        <ConfirmDialog
          title={action.title} message={action.message} confirmLabel={action.confirm} tone={action.danger ? 'danger' : 'primary'} onClose={() => setAction(null)}
          onConfirm={async () => { await dispatch({ type: 'resident/setStatus', id: resident.id, status: action.next }); toast.success(action.done); }}
        />
      ) : null}
    </div>
  );
}
