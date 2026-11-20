import { useState } from 'react';
import { CheckCircle2, ClipboardCheck, ShieldAlert } from 'lucide-react';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Block, Callout } from '../../components/layout';
import { CONCERN_STATUS_META } from '../../data/constants';
import type { Case, CaseConcern } from '../../data/types';
import { ConcernResolutionDialog } from '../../dialogs/ConcernResolutionDialog';
import { fmtDateTime } from '../../../preview/lib/format';

/**
 * Displays each concern in a consolidated/merged case with its own independent resolution status.
 * Resolving one concern keeps the master case active until every associated concern is resolved.
 */
export default function ConcernsSection({ c }: { c: Case }) {
  const concerns = c.concerns ?? [];
  const [editing, setEditing] = useState<CaseConcern | null>(null);
  if (concerns.length <= 1) return null;

  const closed = c.status === 'closed';
  const resolvedCount = concerns.filter((x) => x.status === 'resolved' || x.status === 'not_applicable').length;
  const openCount = concerns.length - resolvedCount;

  return (
    <Block
      title={`Consolidated Concerns (${concerns.length})`}
      description="Each concern from merged reports retains its own resolution workflow. All concerns must be resolved before the master case can close."
      action={
        <Badge tone={openCount > 0 ? 'amber' : 'sage'} dot>
          {openCount > 0 ? `${resolvedCount} resolved · ${openCount} active` : 'All concerns resolved'}
        </Badge>
      }
    >
      {openCount > 0 ? (
        <Callout tone="amber" icon={ShieldAlert} className="mb-3" title="Master case stays active while unresolved concerns remain">
          Resolving one concern will not close {c.id}. Update each concern below independently as its investigation completes.
        </Callout>
      ) : (
        <Callout tone="sage" icon={CheckCircle2} className="mb-3" title="All consolidated concerns resolved">
          Every concern in this consolidated case has met its resolution requirements. You may now close {c.id} with a documented final disposition.
        </Callout>
      )}

      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {concerns.map((item) => {
          const meta = CONCERN_STATUS_META[item.status] ?? { label: item.statusLabel, tone: 'neutral' as const };
          const isResolved = item.status === 'resolved' || item.status === 'not_applicable';
          return (
            <li
              key={item.concernId}
              className={`rounded-xl border p-4 transition-colors ${
                isResolved
                  ? 'border-emerald-200/80 bg-emerald-50/30'
                  : 'border-[#e7e2da] bg-gradient-to-b from-white to-[#fcfaf6]'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-[#1c1917]">{item.concernLabel}</span>
                    <Badge tone={meta.tone} dot>{meta.label}</Badge>
                    <Badge tone="neutral">
                      {item.isPrimary ? `Primary · ${item.sourceReference}` : `Merged from ${item.sourceReference}`}
                    </Badge>
                  </div>

                  {item.outcome ? (
                    <p className="sa-small text-[#1c1917]">
                      <strong>Outcome:</strong> {item.outcome}
                      {item.threatOngoing ? ` · Threat ongoing: ${item.threatOngoing}` : ''}
                    </p>
                  ) : null}

                  {item.resolutionNotes ? (
                    <p className="sa-small sa-text-2">{item.resolutionNotes}</p>
                  ) : null}

                  {Object.keys(item.details ?? {}).length > 0 ? (
                    <p className="sa-meta">
                      {Object.entries(item.details)
                        .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`)
                        .join(' · ')}
                    </p>
                  ) : null}

                  <p className="sa-meta">
                    {item.originalStatusLabel ? `Original report status: ${item.originalStatusLabel}` : null}
                    {item.resolvedAt
                      ? `${item.originalStatusLabel ? ' · ' : ''}Resolved ${fmtDateTime(item.resolvedAt)}${item.resolvedByName ? ` by ${item.resolvedByName}` : ''}`
                      : item.updatedAt
                        ? `${item.originalStatusLabel ? ' · ' : ''}Updated ${fmtDateTime(item.updatedAt)}${item.updatedByName ? ` by ${item.updatedByName}` : ''}`
                        : ''}
                  </p>
                </div>

                {!closed ? (
                  <Button
                    size="sm"
                    variant={isResolved ? 'secondary' : 'primary'}
                    icon={ClipboardCheck}
                    onClick={() => setEditing(item)}
                  >
                    {isResolved ? 'Edit status' : 'Update / Resolve'}
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      {editing ? (
        <ConcernResolutionDialog
          caseId={c.id}
          concern={editing}
          otherCount={concerns.length - 1}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </Block>
  );
}
