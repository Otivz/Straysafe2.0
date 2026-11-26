import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Activity, ArrowRight, Camera, ChevronLeft, ChevronRight, FileText, Lock, Megaphone, MessageSquare, NotebookPen, Plus } from 'lucide-react';
import { isValidLatLng } from '../../../preview/geo';
import { LocationMapPreview } from '../../../preview/map/LocationMapPreview';
import { MapLegend } from '../../../preview/map/MapLegend';
import { adminPath } from '../../config';
import { Badge, IdentityBadge, OutcomeBadge, OwnershipBadge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { EvidenceTile } from '../../components/Evidence';
import { useMediaViewer, type LightboxMediaItem } from '../../components/MediaLightbox';
import { Block, Callout, Kv, Panel } from '../../components/layout';
import { ANIMAL_TYPES, DISPOSITIONS, NOTICE_STATUS, VERIFICATION } from '../../data/constants';
import { useAdminData } from '../../data/context';
import { currentActivity, pendingFollowUpsOf } from '../../data/selectors';
import type { Case } from '../../data/types';
import { ago, dueInfo, fmtDateTime, plural } from '../../../preview/lib/format';
import type { OpenCaseDialog } from './dialogState';
import ConcernsSection from './ConcernsSection';
import PossibleOwnersBlock from './PossibleOwnersBlock';
import RegisteredPetPanel from './RegisteredPetPanel';
import RelatedReportsBlock from './RelatedReportsBlock';

const upperFirst = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t);

export default function OverviewTab({ c, now, openDialog }: { c: Case; now: Date; openDialog: OpenCaseDialog }) {
  const { state } = useAdminData();
  const { openMedia } = useMediaViewer();
  const [evidenceIdx, setEvidenceIdx] = useState(0);
  const navigate = useNavigate();
  const notice = state.notices.find((n) => n.caseId === c.id && n.status !== 'archived');
  const publishable = !c.sensitive && (c.category === 'lost_pet' || c.category === 'found_animal' || c.category === 'safety');
  const next = pendingFollowUpsOf(c).filter((f) => f.dueAt).sort((a, b) => a.dueAt!.localeCompare(b.dueAt!))[0];
  const recentNotes = [...c.notes].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 3);
  const closed = c.status === 'closed';
  // Administrators are authorized to see the exact spot. A case with no pin shows only its words.
  const pin = isValidLatLng(c.location.lat, c.location.lng) ? { lat: c.location.lat as number, lng: c.location.lng as number } : null;

  const evidenceMediaItems: LightboxMediaItem[] = c.evidence
    .filter((e) => Boolean(e.url))
    .map((e) => ({
      url: e.url!,
      kind: e.kind,
      title: e.label,
      source: { reporter: 'Submitted by the reporter', admin: 'Added by an administrator', resident: 'Another resident', external: 'External authority' }[e.source],
      date: fmtDateTime(e.capturedAt),
      caption: e.note,
    }));

  const reportText =
    c.description.trim() ||
    (c.category === 'lost_pet'
      ? 'The owner reported this pet missing and added no further details. The registered pet, and when and where it was last seen, are beside this report.'
      : '');

  return (
    <div className="sa-case">
      <Panel className="sa-fade-up">
        <Block
          title={
            <span className="inline-flex items-center gap-2">
              <FileText size={17} className="text-[var(--sa-brand)]" aria-hidden="true" />
              <span>What was reported</span>
            </span>
          }
        >
          {reportText ? (
            <div className="rounded-xl border border-[var(--sa-line)] bg-[var(--sa-warm)] px-4 py-3 text-[15px] leading-relaxed text-[var(--sa-ink)] whitespace-pre-wrap">
              {reportText}
            </div>
          ) : null}
          <dl className="sa-facts mt-5">
            <div><dt>Observed</dt><dd>{fmtDateTime(c.observedAt)}</dd></div>
            <div><dt>Reported</dt><dd>{fmtDateTime(c.reportedAt)}{ago(c.reportedAt, now) ? <span className="sa-text-3"> · {ago(c.reportedAt, now)}</span> : null}</dd></div>
            <div><dt>Location</dt><dd>{c.location.area}<span className="sa-text-3 block">{c.location.detail}</span></dd></div>
            <div><dt>Animal</dt><dd>{c.animal.customType || ANIMAL_TYPES[c.animal.type]}{c.animal.count > 1 ? ` × ${c.animal.count}` : ''}<span className="sa-text-3 block">{c.animal.description}</span></dd></div>
          </dl>
          {pin ? (
            <figure className="mt-5 flex flex-col">
              <LocationMapPreview pin={pin} height={200} label={`Map of the reported location: ${c.location.area}`} />
              <MapLegend items={[{ kind: 'pin', label: 'Reported location' }, { kind: 'outline', label: 'Approximate subdivision outline' }]} />
              <figcaption className="sa-meta mt-1.5">The outline is approximate and unverified. Only authorized administrators see the exact spot.</figcaption>
            </figure>
          ) : null}
        </Block>

        <Block
          title={
            <span className="inline-flex items-center gap-2">
              <Camera size={17} className="text-[var(--sa-brand)]" aria-hidden="true" />
              <span>Evidence</span>
            </span>
          }
          description={c.evidence.length ? `${plural(c.evidence.length, 'item')} submitted` : undefined}
        >
          {c.evidence.length === 0 ? (
            <p className="sa-small sa-text-2">{c.noPhotoReason ?? 'No photos or videos were submitted. A photo is never required, especially when it is not safe to take one.'}</p>
          ) : (
            <div>
              {/* When 2 or more uploaded media items exist, provide an interactive < image > carousel */}
              {evidenceMediaItems.length >= 2 && (
                <div className="relative mb-4 flex items-center justify-center rounded-xl border border-[var(--sa-line)] bg-stone-950 overflow-hidden shadow-sm h-64 sm:h-72">
                  {evidenceMediaItems[((evidenceIdx % evidenceMediaItems.length) + evidenceMediaItems.length) % evidenceMediaItems.length]?.kind === 'video' ? (
                    <video
                      key={evidenceMediaItems[((evidenceIdx % evidenceMediaItems.length) + evidenceMediaItems.length) % evidenceMediaItems.length].url}
                      src={evidenceMediaItems[((evidenceIdx % evidenceMediaItems.length) + evidenceMediaItems.length) % evidenceMediaItems.length].url}
                      controls
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <img
                      key={evidenceMediaItems[((evidenceIdx % evidenceMediaItems.length) + evidenceMediaItems.length) % evidenceMediaItems.length].url}
                      src={evidenceMediaItems[((evidenceIdx % evidenceMediaItems.length) + evidenceMediaItems.length) % evidenceMediaItems.length].url}
                      alt={evidenceMediaItems[((evidenceIdx % evidenceMediaItems.length) + evidenceMediaItems.length) % evidenceMediaItems.length].title || 'Uploaded media'}
                      className="max-h-full max-w-full object-contain cursor-zoom-in transition-transform duration-200 hover:scale-[1.01]"
                      onClick={() => openMedia(evidenceMediaItems, ((evidenceIdx % evidenceMediaItems.length) + evidenceMediaItems.length) % evidenceMediaItems.length)}
                    />
                  )}

                  {/* < Previous button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEvidenceIdx((i) => i - 1);
                    }}
                    aria-label="Previous uploaded media"
                    className="absolute left-3 top-1/2 -translate-y-1/2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 hover:bg-black/90 text-white border border-white/20 shadow-md transition-all focus:outline-none"
                    title="Previous media (<)"
                  >
                    <ChevronLeft size={20} />
                  </button>

                  {/* > Next button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEvidenceIdx((i) => i + 1);
                    }}
                    aria-label="Next uploaded media"
                    className="absolute right-3 top-1/2 -translate-y-1/2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 hover:bg-black/90 text-white border border-white/20 shadow-md transition-all focus:outline-none"
                    title="Next media (>)"
                  >
                    <ChevronRight size={20} />
                  </button>

                  {/* Caption & Counter */}
                  <div className="absolute bottom-2 inset-x-3 z-10 flex items-center justify-between text-xs text-white/90 bg-black/65 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-white/10">
                    <span className="font-medium truncate">{evidenceMediaItems[((evidenceIdx % evidenceMediaItems.length) + evidenceMediaItems.length) % evidenceMediaItems.length]?.title}</span>
                    <span className="font-semibold shrink-0 ml-2">{(((evidenceIdx % evidenceMediaItems.length) + evidenceMediaItems.length) % evidenceMediaItems.length) + 1} of {evidenceMediaItems.length}</span>
                  </div>
                </div>
              )}

              <div className="sa-evgrid">
                {c.evidence.map((e) => {
                  const mediaIdx = evidenceMediaItems.findIndex((m) => m.url === e.url);
                  return (
                    <EvidenceTile
                      key={e.id}
                      item={e}
                      reviewed={c.assessment.evidenceReviewed.includes(e.id)}
                      onOpen={() => {
                        if (e.url && mediaIdx !== -1) {
                          openMedia(evidenceMediaItems, mediaIdx);
                        } else {
                          openDialog({ kind: 'evidence', evidenceId: e.id });
                        }
                      }}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </Block>

        <ConcernsSection c={c} />

        <RelatedReportsBlock c={c} openDialog={openDialog} />

        {c.animal.type !== 'wildlife' && c.category !== 'lost_pet' ? <PossibleOwnersBlock c={c} /> : null}

        {c.closure ? (
          <Block title="Closure">
            <p className="flex flex-wrap items-center gap-2"><span className="sa-semibold">{DISPOSITIONS[c.closure.disposition].label}</span><OutcomeBadge group={c.closure.outcome} /></p>
            <p className="sa-prose mt-2">{c.closure.reason}</p>
            {c.closure.outcome !== 'resolved' ? <Callout className="mt-3" tone={c.closure.outcome === 'unresolved' ? 'amber' : 'info'}>Closed does not mean resolved. {c.closure.outcome === 'unresolved' ? 'This case ended without a confirmed resolution.' : 'This case did not require action.'}</Callout> : null}
            <p className="sa-meta mt-3">Closed by {c.closure.closedBy} · {fmtDateTime(c.closure.closedAt)}{c.closure.followUpCheck ? ` · follow-up check ${dueInfo(c.closure.followUpCheck, now).label.toLowerCase()}` : ''}</p>
          </Block>
        ) : null}
      </Panel>

      <aside className="sa-case__aside" aria-label="Case details">
        <Panel className="sa-fade-up">
          <Block
            tight
            title={
              <span className="inline-flex items-center gap-2">
                <Activity size={15} className="text-[var(--sa-brand)]" aria-hidden="true" />
                <span>Where things stand</span>
              </span>
            }
          >
            <Kv stack rows={[
              ['Incident', VERIFICATION[c.assessment.incident].label],
              // identity and ownership do not apply to wild animals
              ...(c.animal.type === 'wildlife' ? [] : [['Animal', <IdentityBadge status={c.identity.status} decided={c.identity.decided} />] as [string, ReactNode], ['Ownership', <OwnershipBadge status={c.ownership.status} />] as [string, ReactNode]]),
              ['Right now', currentActivity(c, now)],
              ['Next follow-up', next ? <span className={dueInfo(next.dueAt, now).overdue ? 'sa-text-red' : ''}>{dueInfo(next.dueAt, now).label}<span className="sa-text-3 block">{next.title}</span></span> : '—'],
            ]} />
            <p className="sa-small mt-4">
              <Link to="?tab=assessment" className="inline-flex items-center gap-1 font-semibold text-[var(--sa-brand)] hover:underline">
                Open assessment <ArrowRight size={13} aria-hidden="true" />
              </Link>
            </p>
          </Block>
        </Panel>

        <RegisteredPetPanel c={c} />

        <Panel className="sa-fade-up">
          <Block tight title={<span className="flex items-center gap-2"><Lock size={14} className="text-[var(--sa-brand)]" aria-hidden="true" />Reporter</span>} description="Visible to authorized administrators only.">
            <Kv stack rows={[
              ['Name', c.reporter.name],
              ['Reported', c.reporter.channel === 'self' ? 'Filed by the Subdivision Leader' : c.reporter.channelLabel ? upperFirst(c.reporter.channelLabel) : 'Via app'],
              ...(c.reporter.channel && c.reporter.channel !== 'self' && c.reporter.filedBy ? [['Filed by', c.reporter.filedBy] as [string, string]] : []),
              ['Unit', c.reporter.unit], ['Phone', c.reporter.phone], ['Email', <span className="break-all">{c.reporter.email}</span>],
            ]} />
            {c.reporter.residentId ? (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {!closed && !c.reporter.channel ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={MessageSquare}
                    onClick={() => openDialog({
                      kind: 'messages',
                      target: { kind: 'direct', party: 'reporter', name: c.reporter.name, label: `Message ${c.reporter.name}` },
                    })}
                  >
                    Message reporter
                  </Button>
                ) : null}
                <Link to={adminPath(`/residents/${c.reporter.residentId}`)} className="inline-flex items-center gap-1 sa-small font-semibold text-[var(--sa-brand)] hover:underline">
                  View resident profile <ArrowRight size={12} aria-hidden="true" />
                </Link>
              </div>
            ) : null}
          </Block>
        </Panel>

        <Panel className="sa-fade-up">
          <Block tight title={<span className="flex items-center gap-2"><NotebookPen size={14} className="text-[var(--sa-brand)]" aria-hidden="true" />Recent internal notes</span>} description="Staff-only notes. Never shown to residents.">
            {recentNotes.length === 0 ? (
              <p className="sa-small sa-text-2">No internal notes recorded yet.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                {recentNotes.map((n) => (
                  <li key={n.id} className="rounded-lg border border-[var(--sa-line-soft)] bg-[var(--sa-sand)]/45 px-3 py-2">
                    <p className="m-0 text-xs font-medium text-[var(--sa-ink)] whitespace-pre-line">{n.text}</p>
                    <p className="sa-meta mt-1">{n.by} · {fmtDateTime(n.at)}</p>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button size="sm" variant="secondary" icon={NotebookPen} onClick={() => openDialog({ kind: 'note' })}>
                Add internal note
              </Button>
              {c.notes.length > 3 ? (
                <Link to="?tab=history" className="sa-small font-semibold">View all {c.notes.length}</Link>
              ) : null}
            </div>
          </Block>
        </Panel>

        <Panel>
          <Block tight title={<span className="flex items-center gap-2"><Megaphone size={14} aria-hidden="true" />Community notice</span>}>
            {notice ? (
              <div className="flex flex-col gap-2">
                <p className="font-medium">{notice.title}</p>
                <p className="flex items-center gap-2"><Badge tone={NOTICE_STATUS[notice.status].tone}>{NOTICE_STATUS[notice.status].label}</Badge></p>
                <p><Link to={adminPath(`/community/${notice.id}/edit`)} className="sa-small font-semibold">Open notice</Link></p>
              </div>
            ) : c.sensitive ? (
              <Callout icon={Lock}>This is a private complaint. It is never published, and reporter details never appear in a notice.</Callout>
            ) : (
              <>
                <p className="sa-small sa-text-2">Not published. Publishing a notice is a separate step from the case, and the case record stays private.</p>
                {publishable && !closed ? <Button className="mt-3" size="sm" icon={Plus} onClick={() => navigate(`${adminPath('/community/new')}?fromCase=${c.id}`)}>Create notice</Button> : null}
              </>
            )}
          </Block>
        </Panel>
      </aside>
    </div>
  );
}
