import { useState } from 'react';
import { ArrowLeft, CheckCircle2, Clock, Link2, ShieldCheck, XCircle } from 'lucide-react';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Dialog } from '../components/Dialog';
import { Field, Textarea } from '../components/form';
import { Callout, FormError } from '../components/layout';
import { useToast } from '../components/toast';
import { ANIMAL_TYPES, CATEGORIES } from '../data/constants';
import { useAdminData } from '../data/context';
import type { Case } from '../data/types';
import { adminApi } from '../live/api';
import { reportIdOf } from '../../live/refs';
import { fmtDate, fmtTime } from '../../preview/lib/format';
import { fromServer } from '../../live/dates';

export type RelatedCandidate = Awaited<ReturnType<typeof adminApi.duplicates>>['candidates'][number];

function ScoreBar({ label, value }: { label: string; value: number | null }) {
  if (value === null) {
    return (
      <div className="flex items-center justify-between text-xs text-[var(--sa-ink-3,#78716c)]">
        <span>{label}</span>
        <span>Unavailable</span>
      </div>
    );
  }
  const pct = Math.round(value * 100);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-[var(--sa-ink,#1c1917)]">{label}</span>
        <span className="font-semibold">{pct}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#e7e2da]">
        <div
          className="h-full rounded-full bg-[#b45309]"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function DuplicateReviewDialog({
  c,
  candidate,
  onClose,
  onResolved,
}: {
  c: Case;
  candidate: RelatedCandidate;
  onClose: () => void;
  onResolved: () => void;
}) {
  const { reload } = useAdminData();
  const toast = useToast();
  const [mode, setMode] = useState<'compare' | 'link' | 'reject'>('compare');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentRid = reportIdOf(c.id);
  const hasComputedScores = Object.values(candidate.scores).some((v) => v !== null);
  const overallPct = Math.round(candidate.combined_score * 100);
  const strong = candidate.classification === 'Strongly Related';

  const doDefer = async () => {
    if (!currentRid) return;
    setBusy(true);
    setError(null);
    try {
      await adminApi.duplicateDecision(currentRid, { other_report_id: candidate.report_id, decision: 'defer' });
      toast.success('Related report review deferred');
      onResolved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not defer review.');
    } finally {
      setBusy(false);
    }
  };

  const doReject = async () => {
    if (!currentRid) return;
    if (reason.trim().length < 5) {
      setError('Please explain why these reports are not related (at least 5 characters).');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await adminApi.duplicateDecision(currentRid, {
        other_report_id: candidate.report_id,
        decision: 'not_duplicate',
        reason: reason.trim(),
      });
      toast.success(`Marked ${candidate.reference} as Not Related`);
      onResolved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not record decision.');
    } finally {
      setBusy(false);
    }
  };

  const doLink = async () => {
    if (!currentRid) return;
    if (reason.trim().length < 5) {
      setError('Please provide a reason for linking these reports (at least 5 characters).');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await adminApi.mergeReports({
        report_ids: [currentRid, candidate.report_id],
        primary_report_id: currentRid,
        notes: reason.trim(),
      });
      toast.success('Relationship confirmed and reports linked');
      reload();
      onResolved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not link reports.');
    } finally {
      setBusy(false);
    }
  };

  if (mode === 'link' && currentRid) {
    return (
      <Dialog
        size="lg"
        title="Confirm Relationship & Link Reports"
        description={`Link ${candidate.reference} under ${c.id}. All original reports, reporters, descriptions, and evidence remain preserved.`}
        onClose={onClose}
        dirty={reason !== ''}
        footer={(
          <>
            <Button icon={ArrowLeft} onClick={() => { setMode('compare'); setError(null); }} disabled={busy}>Back</Button>
            <Button variant="primary" icon={Link2} loading={busy} onClick={() => { void doLink(); }}>Confirm &amp; Link Reports</Button>
          </>
        )}
      >
        <Callout tone="info" title={`Primary master case: ${c.id}.`}>
          <strong>{candidate.reference}</strong> will be marked as <strong>Merged into Case #{c.id}</strong> under <strong>Merged Reports</strong>. Its original reporter, description, photographs, location, and concern workflow remain independently tracked and preserved.
        </Callout>

        <div className="rounded-lg border border-[var(--sa-line)] bg-[var(--sa-sand)] p-3.5">
          <p className="sa-small m-0 font-semibold text-[var(--sa-ink-3,#78716c)]">Report to be linked</p>
          <p className="mt-1 font-semibold text-[var(--sa-ink,#1c1917)]">
            {candidate.reference} · {candidate.category || 'Report'}
          </p>
          <p className="sa-small sa-text-2 mt-0.5">
            Reporter: {candidate.reporter_name} · Observed {candidate.incident_at ? fmtDate(fromServer(candidate.incident_at)) : '—'} · {candidate.photo_urls.length} photo(s)
          </p>
        </div>

        <Field label="Relationship notes" required hint="Recorded in the audit trail and case history.">
          <Textarea
            value={reason}
            onChange={(e) => { setReason(e.target.value); setError(null); }}
            rows={3}
            placeholder="e.g. Same brown Aspin with white chest patch near the main gate within 30 minutes."
          />
        </Field>
        {error ? <FormError message={error} /> : null}
      </Dialog>
    );
  }

  if (mode === 'reject') {
    return (
      <Dialog
        size="md"
        title="Mark as Not Related"
        description={`Confirm that ${candidate.reference} is not related to ${c.id}.`}
        onClose={onClose}
        dirty={reason !== ''}
        footer={(
          <>
            <Button icon={ArrowLeft} onClick={() => { setMode('compare'); setError(null); }} disabled={busy}>Back</Button>
            <Button variant="primary" icon={XCircle} loading={busy} onClick={() => { void doReject(); }}>Confirm Not Related</Button>
          </>
        )}
      >
        <Field label="Reason" required hint="Required so this pair is not suggested again.">
          <Textarea
            value={reason}
            onChange={(e) => { setReason(e.target.value); setError(null); }}
            rows={3}
            placeholder="e.g. Different coat markings and located at opposite ends of the subdivision."
          />
        </Field>
        {error ? <FormError message={error} /> : null}
      </Dialog>
    );
  }

  const candIncident = candidate.incident_at ? fromServer(candidate.incident_at) : null;

  return (
    <Dialog
      size="lg"
      title="Related Report Review"
      description="Compare the reports and review their similarities before linking them to the same incident."
      onClose={onClose}
      footer={(
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <Button icon={Clock} onClick={() => { void doDefer(); }} disabled={busy}>Defer Review</Button>
            <Button icon={XCircle} onClick={() => { setMode('reject'); setError(null); }} disabled={busy}>Mark as Not Related</Button>
          </div>
          <Button variant="primary" icon={Link2} onClick={() => { setMode('link'); setError(null); }} disabled={busy}>
            Confirm Relationship &amp; Link Reports
          </Button>
        </div>
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--sa-line)] bg-[var(--sa-sand)] p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={strong ? 'amber' : 'neutral'}>{candidate.classification}</Badge>
          {hasComputedScores ? <span className="text-sm font-bold">Overall Similarity: {overallPct}%</span> : null}
          <Badge tone="sage" icon={ShieldCheck}>{candidate.species_status}</Badge>
          {candidate.distance_meters !== null ? (
            <span className="sa-small sa-text-2">· {candidate.location_class} (~{Math.round(candidate.distance_meters)} m apart)</span>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-[var(--sa-line)] bg-white p-3.5">
          <p className="sa-small m-0 font-bold uppercase tracking-wide text-[var(--sa-ink-3,#78716c)]">Current Report</p>
          <p className="sa-ref mt-0.5">{c.id}</p>
          <dl className="mt-2 space-y-1 text-xs">
            <div><dt className="inline font-semibold">Category: </dt><dd className="inline">{CATEGORIES[c.category].label}</dd></div>
            <div><dt className="inline font-semibold">Species: </dt><dd className="inline">{c.animal.customType || ANIMAL_TYPES[c.animal.type]}</dd></div>
            <div><dt className="inline font-semibold">Appearance / Breed / Colour: </dt><dd className="inline">{c.animal.description || 'Not recorded'}</dd></div>
            <div><dt className="inline font-semibold">Location: </dt><dd className="inline">{c.location.area}</dd></div>
            <div><dt className="inline font-semibold">Incident Date: </dt><dd className="inline">{fmtDate(c.observedAt)}</dd></div>
            <div><dt className="inline font-semibold">Incident Time: </dt><dd className="inline">{fmtTime(c.observedAt)}</dd></div>
            <div><dt className="inline font-semibold">Reporter: </dt><dd className="inline">{c.reporter.name}</dd></div>
          </dl>
          <p className="mt-2 whitespace-pre-line text-xs text-[var(--sa-ink-2,#44403c)]">{c.description || 'No description'}</p>
          {c.evidence.filter((e) => e.url).length > 0 ? (
            <div className="mt-2">
              <p className="mb-1 text-[11px] font-medium text-[var(--sa-ink-3,#78716c)]">Supporting photos (manual review only):</p>
              <div className="flex flex-wrap gap-1.5">
                {c.evidence.filter((e) => e.url).slice(0, 3).map((e) => (
                  <img key={e.id} src={e.url} alt="" className="h-14 w-14 rounded border border-[var(--sa-line)] object-cover" />
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="rounded-lg border border-[var(--sa-line)] bg-white p-3.5">
          <p className="sa-small m-0 font-bold uppercase tracking-wide text-[var(--sa-ink-3,#78716c)]">Related Report</p>
          <p className="sa-ref mt-0.5">{candidate.reference}</p>
          <dl className="mt-2 space-y-1 text-xs">
            <div><dt className="inline font-semibold">Category: </dt><dd className="inline">{candidate.category || 'Report'}</dd></div>
            <div><dt className="inline font-semibold">Species: </dt><dd className="inline">{candidate.animal_type || 'Unknown'}</dd></div>
            <div><dt className="inline font-semibold">Breed: </dt><dd className="inline">{candidate.breed || 'Not specified'}</dd></div>
            <div><dt className="inline font-semibold">Colour / Coat: </dt><dd className="inline">{candidate.color || 'Not specified'}</dd></div>
            <div><dt className="inline font-semibold">Location: </dt><dd className="inline">{candidate.landmark || 'Location not named'}</dd></div>
            <div><dt className="inline font-semibold">Incident Date: </dt><dd className="inline">{candIncident ? fmtDate(candIncident) : '—'}</dd></div>
            <div><dt className="inline font-semibold">Incident Time: </dt><dd className="inline">{candIncident ? fmtTime(candIncident) : '—'}</dd></div>
            <div><dt className="inline font-semibold">Reporter: </dt><dd className="inline">{candidate.reporter_name}</dd></div>
          </dl>
          <p className="mt-2 whitespace-pre-line text-xs text-[var(--sa-ink-2,#44403c)]">{candidate.description || 'No description'}</p>
          {candidate.photo_urls.length > 0 ? (
            <div className="mt-2">
              <p className="mb-1 text-[11px] font-medium text-[var(--sa-ink-3,#78716c)]">Supporting photos (manual review only):</p>
              <div className="flex flex-wrap gap-1.5">
                {candidate.photo_urls.slice(0, 3).map((u, idx) => (
                  <img key={idx} src={u} alt="" className="h-14 w-14 rounded border border-[var(--sa-line)] object-cover" />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="rounded-lg border border-[var(--sa-line)] bg-[var(--sa-sand)]/50 p-3.5">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold"><CheckCircle2 size={14} aria-hidden="true" />Attribute Similarity Breakdown</p>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <ScoreBar label="Location (25%)" value={candidate.scores.location} />
          <ScoreBar label="Breed (15%)" value={candidate.scores.breed} />
          <ScoreBar label="Colour / Coat (15%)" value={candidate.scores.colour} />
          <ScoreBar label="Description (20%)" value={candidate.scores.description} />
          <ScoreBar label="Date (15%)" value={candidate.scores.date} />
          <ScoreBar label="Time (10%)" value={candidate.scores.time} />
        </div>
        {candidate.reasons.length > 0 ? (
          <ul className="mt-3 list-disc space-y-0.5 pl-4 text-xs text-[var(--sa-ink-2,#44403c)]">
            {candidate.reasons.map((r) => <li key={r}>{r}</li>)}
          </ul>
        ) : null}
      </div>
      {error ? <FormError message={error} /> : null}
    </Dialog>
  );
}
