import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, GitMerge, Link2, Mail, MapPin, MessageSquare, PawPrint, Phone, SearchX, Unlink } from 'lucide-react';
import { adminPath } from '../../config';
import { Badge, StatusBadge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { Field, Textarea } from '../../components/form';
import { Block, Callout, EmptyState, FormError } from '../../components/layout';
import { useMediaViewer } from '../../components/MediaLightbox';
import { useToast } from '../../components/toast';
import { CATEGORIES } from '../../data/constants';
import { useAdminData } from '../../data/context';
import type { Case, MergedReportInfo } from '../../data/types';
import { DuplicateReviewDialog, type RelatedCandidate } from '../../dialogs/DuplicateReviewDialog';
import { adminApi } from '../../live/api';
import { reportIdOf } from '../../../live/refs';
import { fmtDateTime } from '../../../preview/lib/format';
import type { OpenCaseDialog } from './dialogState';

interface UnifiedCandidate {
  key: string;
  reference: string;
  categoryLabel: string;
  classification: string;
  scorePct: number | null;
  isStrong: boolean;
  locationText: string;
  distanceMeters: number | null;
  speciesStatus: string | null;
  breedStatus: string | null;
  colourStatus: string | null;
  dateTimeText: string | null;
  description: string | null;
  reasons: string[];
  reviewCandidate: RelatedCandidate | null;
}

function formatCategory(raw: string | null | undefined): string {
  if (!raw) return 'General Report';
  const mapped = CATEGORIES[raw as keyof typeof CATEGORIES];
  if (mapped) return mapped.label;
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function formatMatchBadge(label: string, value: string | null, score: number | null): string | null {
  if (!value && score === null) return null;
  if (value && score !== null) {
    return `${label}: ${value} (${Math.round(score * 100)}%)`;
  }
  if (value) return `${label}: ${value}`;
  return `${label}: ${Math.round((score ?? 0) * 100)}% match`;
}

function formatDateTimeComparison(
  incidentAt: string | null,
  createdAt: string | null,
  dateScore: number | null,
  timeScore: number | null,
): string | null {
  const ts = incidentAt || createdAt;
  if (!ts && dateScore === null && timeScore === null) return null;
  const formatted = ts ? fmtDateTime(ts) : null;
  const hints: string[] = [];
  if (dateScore !== null) {
    if (dateScore >= 1) hints.push('same date');
    else if (dateScore >= 0.8) hints.push('1 day apart');
    else if (dateScore >= 0.5) hints.push('within days');
  }
  if (timeScore !== null) {
    if (timeScore >= 0.9) hints.push('similar time');
    else if (timeScore >= 0.6) hints.push('within hours');
  }
  if (formatted && hints.length > 0) return `${formatted} (${hints.join(', ')})`;
  if (formatted) return formatted;
  return hints.length > 0 ? hints.join(', ') : null;
}

/** Unified Related Reports section: candidate review cards, linked report traceability, and unlink support. */
export default function RelatedReportsBlock({ c, openDialog }: { c: Case; openDialog: OpenCaseDialog }) {
  const { state, reload } = useAdminData();
  const { openMedia } = useMediaViewer();
  const toast = useToast();
  const linked = state.cases.filter((x) => c.relatedCaseIds.includes(x.id));
  const closed = c.status === 'closed';
  const rid = reportIdOf(c.id);

  const [dupCandidates, setDupCandidates] = useState<RelatedCandidate[]>([]);
  const [dupLoading, setDupLoading] = useState(false);
  const [reviewing, setReviewing] = useState<RelatedCandidate | null>(null);
  const [unmerging, setUnmerging] = useState<MergedReportInfo | null>(null);
  const [unmergeReason, setUnmergeReason] = useState('');
  const [unmergeBusy, setUnmergeBusy] = useState(false);
  const [unmergeError, setUnmergeError] = useState<string | null>(null);

  const loadDuplicates = useCallback(async () => {
    if (!rid || closed || c.duplicateOfReportId) {
      setDupCandidates([]);
      return;
    }
    setDupLoading(true);
    try {
      const res = await adminApi.duplicates(rid);
      setDupCandidates(res.candidates ?? []);
    } catch {
      // Non-blocking: related report detection is advisory
    } finally {
      setDupLoading(false);
    }
  }, [rid, closed, c.duplicateOfReportId]);

  useEffect(() => {
    void loadDuplicates();
  }, [loadDuplicates]);

  const doUnmerge = async () => {
    if (!unmerging) return;
    if (unmergeReason.trim().length < 5) {
      setUnmergeError('Please provide a reason for unlinking (at least 5 characters).');
      return;
    }
    setUnmergeBusy(true);
    setUnmergeError(null);
    try {
      await adminApi.unmergeReport(unmerging.reportId, unmergeReason.trim());
      toast.success(`Restored ${unmerging.reference} as an independent report`);
      setUnmerging(null);
      setUnmergeReason('');
      reload();
    } catch (e) {
      setUnmergeError(e instanceof Error ? e.message : 'Could not unlink report.');
    } finally {
      setUnmergeBusy(false);
    }
  };

  const candidates = useMemo<UnifiedCandidate[]>(() => {
    if (closed || c.duplicateOfReportId) return [];

    const seenRefs = new Set<string>();
    const list: UnifiedCandidate[] = [];

    for (const cand of dupCandidates) {
      seenRefs.add(cand.reference);
      const scorePct = typeof cand.combined_score === 'number' ? Math.round(cand.combined_score * 100) : null;
      list.push({
        key: `api-${cand.report_id}`,
        reference: cand.reference,
        categoryLabel: formatCategory(cand.category),
        classification: cand.classification || 'Potentially Related',
        scorePct,
        isStrong: cand.classification === 'Strongly Related',
        locationText: cand.landmark || 'Location not specified',
        distanceMeters: cand.distance_meters ?? null,
        speciesStatus: cand.species_status || (cand.animal_type ? `${cand.animal_type}` : null),
        breedStatus: formatMatchBadge('Breed', cand.breed, cand.scores?.breed ?? null),
        colourStatus: formatMatchBadge('Colour', cand.color, cand.scores?.colour ?? null),
        dateTimeText: formatDateTimeComparison(
          cand.incident_at,
          cand.created_at,
          cand.scores?.date ?? null,
          cand.scores?.time ?? null,
        ),
        description: cand.description,
        reasons: cand.reasons ?? [],
        reviewCandidate: cand,
      });
    }

    return list;
  }, [closed, c.duplicateOfReportId, dupCandidates]);

  const mergedList = c.mergedReports ?? [];
  const candidateCount = candidates.length;
  const countSummary = dupLoading
    ? 'Checking for potentially related reports…'
    : `${candidateCount} potentially related ${candidateCount === 1 ? 'report' : 'reports'} found.`;

  return (
    <Block
      title="Related Reports"
      description="Reports with similar incident details based on location, animal information, and incident date."
      action={!closed ? <Button size="sm" icon={Link2} onClick={() => openDialog({ kind: 'link' })}>Link Reports</Button> : undefined}
    >
      {c.duplicateOfReportId ? (
        <Callout tone="amber" title={`Merged into Case #SS-${new Date(c.reportedAt).getFullYear()}-${String(c.duplicateOfReportId).padStart(4, '0')}`} className="mb-4">
          This report was merged into the master case while preserving its original details, reporter, media, location, and independent concern tracking.
        </Callout>
      ) : null}

      {!closed && !c.duplicateOfReportId ? (
        <div className="mb-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="sa-small sa-text-2 m-0 font-medium">{countSummary}</p>
          </div>

          {candidateCount === 0 && !dupLoading ? (
            <EmptyState
              icon={SearchX}
              title="No Related Reports Found"
              compact
            >
              Other reports with similar incident details will appear here when available.
            </EmptyState>
          ) : (
            <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0">
              {candidates.map((cand) => (
                <li
                  key={cand.key}
                  className={`rounded-xl border p-4 transition-colors ${cand.isStrong
                    ? 'border-[#d97706]/45 bg-[#fffbeb]/50'
                    : 'border-[var(--sa-line-soft,#e7e2da)] bg-[var(--sa-surface,#ffffff)]'
                    }`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1 space-y-2">
                      {/* Reference + Category + Classification */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="sa-ref text-sm font-semibold tracking-tight">{cand.reference}</span>
                        <Badge tone="neutral">{cand.categoryLabel}</Badge>
                        <Badge tone={cand.isStrong ? 'amber' : 'neutral'}>
                          {cand.scorePct !== null ? `${cand.scorePct}% · ${cand.classification}` : cand.classification}
                        </Badge>
                      </div>

                      {/* Description */}
                      {cand.description ? (
                        <p className="sa-small m-0 line-clamp-2 text-[var(--sa-ink,#1c1917)]">
                          {cand.description}
                        </p>
                      ) : null}

                      {/* Location, Distance, Date/Time */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--sa-ink-2,#57534e)]">
                        <span className="inline-flex items-center gap-1">
                          <MapPin size={13} aria-hidden="true" />
                          <span>
                            {cand.locationText}
                            {cand.distanceMeters !== null ? ` (~${Math.round(cand.distanceMeters)} m away)` : ''}
                          </span>
                        </span>
                        {cand.dateTimeText ? (
                          <span className="inline-flex items-center gap-1">
                            <CalendarClock size={13} aria-hidden="true" />
                            <span>{cand.dateTimeText}</span>
                          </span>
                        ) : null}
                      </div>

                      {/* Compact Attribute Badges */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                        {cand.speciesStatus ? (
                          <Badge tone="neutral">
                            <span className="inline-flex items-center gap-1">
                              <PawPrint size={11} aria-hidden="true" />
                              {cand.speciesStatus}
                            </span>
                          </Badge>
                        ) : null}
                        {cand.breedStatus ? <Badge tone="neutral">{cand.breedStatus}</Badge> : null}
                        {cand.colourStatus ? <Badge tone="neutral">{cand.colourStatus}</Badge> : null}
                      </div>
                    </div>

                    {/* Compare & Review Action */}
                    <div className="shrink-0 pt-1 sm:pt-0">
                      <Button
                        size="sm"
                        variant="primary"
                        className="w-full sm:w-auto"
                        onClick={() => {
                          if (cand.reviewCandidate) {
                            setReviewing(cand.reviewCandidate);
                          } else {
                            openDialog({ kind: 'link' });
                          }
                        }}
                      >
                        Compare &amp; Review
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {mergedList.length > 0 ? (
        <div className="mt-4 border-t border-solid pt-4" style={{ borderColor: 'var(--sa-line-soft)' }}>
          <p className="sa-label mb-2 flex items-center gap-1.5">
            <GitMerge size={14} aria-hidden="true" />
            Merged Reports ({mergedList.length})
          </p>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {mergedList.map((m) => {
              const mediaItems = (m.media ?? []).map((med, i) => ({
                url: med.fileUrl,
                kind: (med.mediaType || '').toLowerCase().includes('video') ? ('video' as const) : ('photo' as const),
                title: `${m.reference} · Media ${i + 1}`,
                source: `Submitted by ${m.reporterName || 'original reporter'}`,
                date: m.createdAt ? fmtDateTime(m.createdAt) : '',
              }));
              return (
                <li key={m.reportId} className="sa-record flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="sa-ref">{m.reference}</span>
                      <Badge tone="neutral">{m.mergedIntoLabel || `Merged into Case #${c.id}`}</Badge>
                      {m.categoryLabel ? <Badge tone="brand">{m.categoryLabel}</Badge> : null}
                      {m.originalStatusLabel ? <Badge tone="neutral">Original status: {m.originalStatusLabel}</Badge> : null}
                      {m.photoCount > 0 ? <Badge>{m.photoCount} media item(s)</Badge> : null}
                    </div>

                    <p className="sa-small text-[#1c1917]">{m.description || 'No description'}</p>
                    {m.condition ? (
                      <p className="sa-small sa-text-2 whitespace-pre-line rounded border border-[var(--sa-line-soft,#e7e2da)] bg-[var(--sa-sand,#f5f4f0)]/50 px-2.5 py-1.5">
                        {m.condition}
                      </p>
                    ) : null}

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--sa-ink-2,#57534e)]">
                      {m.locationLandmark || (m.latitude != null && m.longitude != null) ? (
                        <span className="inline-flex items-center gap-1">
                          <MapPin size={12} aria-hidden="true" />
                          <span>
                            {m.locationLandmark || 'Pinned spot'}
                            {m.latitude != null && m.longitude != null ? ` (${m.latitude.toFixed(5)}, ${m.longitude.toFixed(5)})` : ''}
                          </span>
                        </span>
                      ) : null}
                      <span>
                        Reporter: {m.reporterName || 'Unknown'}
                        {m.reporterUnit ? ` (${m.reporterUnit})` : ''}
                      </span>
                      {m.reporterPhone ? (
                        <span className="inline-flex items-center gap-1"><Phone size={12} aria-hidden="true" />{m.reporterPhone}</span>
                      ) : null}
                      {m.reporterEmail ? (
                        <span className="inline-flex items-center gap-1"><Mail size={12} aria-hidden="true" />{m.reporterEmail}</span>
                      ) : null}
                    </div>

                    <p className="sa-meta">
                      Report ID #{m.reportId}
                      {m.createdAt ? ` · Submitted ${fmtDateTime(m.createdAt)}` : ''}
                      {m.mergedAt ? ` · Merged ${fmtDateTime(m.mergedAt)}` : ''}
                      {m.mergedByName ? ` by ${m.mergedByName}` : ''}
                    </p>
                    {m.mergeNotes ? <p className="sa-small sa-text-2">Merge notes: {m.mergeNotes}</p> : null}

                    {mediaItems.length > 0 ? (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {mediaItems.map((item, idx) => (
                          <button
                            key={`${m.reportId}-med-${idx}`}
                            type="button"
                            onClick={() => openMedia(mediaItems, idx)}
                            className="h-14 w-14 overflow-hidden rounded-lg border border-[var(--sa-line,#e7e2da)] bg-stone-100 hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--sa-brand-tint)]"
                            title={`Open ${item.title}`}
                          >
                            {item.kind === 'video' ? (
                              <span className="flex h-full w-full items-center justify-center text-[11px] font-medium text-stone-700">Video</span>
                            ) : (
                              <img src={item.url} alt={item.title} className="h-full w-full object-cover" />
                            )}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {!closed && m.reporterId ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={MessageSquare}
                        onClick={() => {
                          const firstName = (m.reporterName || '').trim().split(/\s+/)[0] || 'reporter';
                          openDialog({
                            kind: 'messages',
                            target: {
                              kind: 'direct',
                              party: 'reporter',
                              name: m.reporterName || 'Reporter',
                              label: `Message ${firstName}`,
                              reportId: m.reference,
                            },
                          });
                        }}
                      >
                        Message {(m.reporterName || '').trim().split(/\s+/)[0] || 'reporter'}
                      </Button>
                    ) : null}
                    {!closed ? (
                      <Button size="sm" variant="ghost" icon={Unlink} onClick={() => { setUnmerging(m); setUnmergeReason(''); setUnmergeError(null); }}>
                        Unmerge
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {linked.length > 0 ? (
        <div className="mt-4 border-t border-solid pt-4" style={{ borderColor: 'var(--sa-line-soft)' }}>
          <p className="sa-label mb-2">Linked Cases ({linked.length})</p>
          <ul className="m-0 flex list-none flex-col p-0">
            {linked.map((o) => (
              <li key={o.id} className="flex items-start justify-between gap-4 border-t border-solid py-3 first:border-t-0 first:pt-0" style={{ borderColor: 'var(--sa-line-soft)' }}>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <Link to={adminPath(`/cases/${o.id}`)} className="sa-ref">{o.id}</Link>
                    <StatusBadge status={o.status} />
                  </p>
                  <p className="sa-rowtitle mt-1">{o.title}</p>
                  <p className="sa-meta mt-0.5">{o.location.area} · observed {fmtDateTime(o.observedAt)}</p>
                </div>
                {!closed ? <Button size="sm" variant="ghost" icon={Unlink} onClick={() => openDialog({ kind: 'unlink', otherId: o.id })}>Unlink</Button> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {reviewing ? (
        <DuplicateReviewDialog
          c={c}
          candidate={reviewing}
          onClose={() => setReviewing(null)}
          onResolved={() => { void loadDuplicates(); }}
        />
      ) : null}

      {unmerging ? (
        <Dialog
          size="md"
          title={`Unlink ${unmerging.reference}`}
          description={`Restore ${unmerging.reference} as an independent report separated from ${c.id}.`}
          onClose={() => setUnmerging(null)}
          dirty={unmergeReason !== ''}
          footer={(
            <>
              <Button onClick={() => setUnmerging(null)} disabled={unmergeBusy}>Cancel</Button>
              <Button variant="primary" icon={Unlink} loading={unmergeBusy} onClick={() => { void doUnmerge(); }}>Confirm unlink</Button>
            </>
          )}
        >
          <Callout tone="info">
            The original link record stays in the audit log. Unlinking creates a new historical event and restores this report to active review.
          </Callout>
          <Field label="Reason for unlinking" required>
            <Textarea
              value={unmergeReason}
              onChange={(e) => { setUnmergeReason(e.target.value); setUnmergeError(null); }}
              rows={3}
              placeholder="e.g. Later evidence showed this was a different animal with a similar coat."
            />
          </Field>
          {unmergeError ? <FormError message={unmergeError} /> : null}
        </Dialog>
      ) : null}
    </Block>
  );
}
