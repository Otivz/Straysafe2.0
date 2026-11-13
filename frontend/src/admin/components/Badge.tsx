import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { AlertTriangle } from 'lucide-react';
import { DISPOSITIONS, OUTCOME_GROUPS, OWNERSHIP, PRIORITIES, STATUSES, identityDisplay, type Tone } from '../data/constants';
import type { Case, CaseStatus, IdentityStatus, OutcomeGroup, OwnershipStatus, Priority } from '../data/types';
import { cx } from '../../preview/lib/cx';

export function Badge({ tone = 'neutral', dot, large, icon: Icon, children }: { tone?: Tone; dot?: boolean; large?: boolean; icon?: LucideIcon; children: ReactNode }) {
  return (
    <span className={cx('sa-badge', tone !== 'neutral' && `sa-badge--${tone}`, large && 'sa-badge--lg')}>
      {dot ? <span className="sa-badge__dot" aria-hidden="true" /> : null}
      {Icon ? <Icon size={12} strokeWidth={2.2} aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

export function StatusBadge({ status, large }: { status: CaseStatus; large?: boolean }) {
  const s = STATUSES[status];
  return <Badge tone={s.tone} dot large={large}>{s.label}</Badge>;
}

/**
 * A missing-pet or found-animal report is "Under monitoring" from the moment it is filed: it has no review or progress steps, so it shows no status
 * to move through. Every other kind of report shows its status; a closed report of any kind shows "Closed".
 */
export function CaseStatusBadge({ c, large }: { c: Pick<Case, 'category' | 'status'>; large?: boolean }) {
  if (c.status !== 'closed' && (c.category === 'lost_pet' || c.category === 'found_animal')) return <Badge tone="brand" dot large={large}>Under monitoring</Badge>;
  return <StatusBadge status={c.status} large={large} />;
}

/** Urgent and High are marked; Normal and Low stay quiet so the list is not a wall of badges. */
export function PriorityMark({ priority }: { priority: Priority }) {
  return (
    <span className={cx('sa-prio', `sa-prio--${priority}`)}>
      {priority === 'urgent' ? <AlertTriangle size={13} strokeWidth={2.2} aria-hidden="true" /> : <span className="sa-prio__dot" aria-hidden="true" />}
      {PRIORITIES[priority].label}
    </span>
  );
}

export function OutcomeBadge({ group, large }: { group: OutcomeGroup; large?: boolean }) {
  const o = OUTCOME_GROUPS[group];
  return <Badge tone={o.tone} large={large}>{o.label}</Badge>;
}

/** The outcome of a closed case, shown next to "Closed" so closure is never read as "resolved". */
export function ClosureOutcome({ c }: { c: Case }) {
  if (!c.closure) return null;
  return <span className="sa-meta" title={DISPOSITIONS[c.closure.disposition].label}>{OUTCOME_GROUPS[c.closure.outcome].label}</span>;
}

export const OwnershipBadge = ({ status }: { status: OwnershipStatus }) => <Badge tone={OWNERSHIP[status].tone}>{OWNERSHIP[status].label}</Badge>;
/** `decided` false = the reporter's own link to a registered pet, which is not a decision ("Linked by the reporter"). */
export const IdentityBadge = ({ status, decided }: { status: IdentityStatus; decided?: boolean }) => {
  const d = identityDisplay(status, decided);
  return <Badge tone={d.tone}>{d.label}</Badge>;
};
