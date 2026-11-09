import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { AlertTriangle } from 'lucide-react';
import { DISPOSITIONS, IDENTITY, OUTCOME_GROUPS, OWNERSHIP, PRIORITIES, STATUSES, type Tone } from '../data/constants';
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
export const IdentityBadge = ({ status }: { status: IdentityStatus }) => <Badge tone={IDENTITY[status].tone}>{IDENTITY[status].label}</Badge>;
