import { Link } from 'react-router-dom';
import { Camera, Link2, MapPin, Unlink } from 'lucide-react';
import { ago, fmtDateTime, plural, relative } from '../../../../preview/lib/format';
import { adminPath } from '../../../config';
import { Badge, CaseStatusBadge, OwnershipBadge } from '../../../components/Badge';
import { Button } from '../../../components/Button';
import { KindBadge, MatchPhoto } from '../../../components/MatchParts';
import { CaseReferralsSection } from '../../../dialogs/CoordinationDialogs';
import { useAdminData } from '../../../data/context';
import { isLinkRecord } from '../../../data/monitored';
import { caseById, matchesOf, partnerOf, sameReport } from '../../../data/selectors';
import type { Case, LostPetSighting, PossibleMatch } from '../../../data/types';
import AssessmentTab from '../AssessmentTab';
import type { OpenCaseDialog } from '../dialogState';
import { useMediaViewer, type LightboxMediaItem } from '../../../components/MediaLightbox';

const reviewBadge = (s: LostPetSighting) => (s.review === 'verified' ? <Badge tone="sage">Checked</Badge> : s.review === 'dismissed' ? <Badge>Not a match</Badge> : null);

/**
 * What neighbours reported seeing, newest first. An ordinary sighting is not a task: it is listed so it can be read, and the Leader may mark it checked.
 * A possible recovery (someone says they may have the pet) that has not been answered is a task and is in "Needs you", not here.
 */
export function Sightings({ c, now, openDialog }: { c: Case; now: Date; openDialog: OpenCaseDialog }) {
  const { openMedia } = useMediaViewer();
  const closed = c.status === 'closed';
  const list = (c.lostPet?.sightings ?? []).filter((s) => !isLinkRecord(s) && !(s.kind === 'secured' && s.review === 'unverified' && !closed));
  if (list.length === 0) return null;

  const sightingMedia: LightboxMediaItem[] = list
    .filter((s) => Boolean(s.photoUrl))
    .map((s) => ({
      url: s.photoUrl!,
      kind: 'photo',
      title: `Sighting: ${s.place}`,
      date: fmtDateTime(s.seenAt),
      source: `Reported by ${s.reportedBy}`,
      caption: s.description || undefined,
    }));

  return (
    <section className="sa-mc-sec" aria-labelledby="mc-sightings">
      <div className="sa-mc-sec__head"><h2 id="mc-sightings" className="sa-mc-sec__title">Sightings <span className="sa-text-3">{list.length}</span></h2></div>
      <ul className="sa-mc-list">
        {list.map((s) => {
          const mediaIdx = sightingMedia.findIndex((m) => m.url === s.photoUrl);
          return (
            <li key={s.id} className="sa-mc-row">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2"><span className="sa-semibold">{s.kind === 'secured' ? 'Possible recovery' : 'Seen'}</span><span className="sa-meta">{fmtDateTime(s.seenAt)}{ago(s.seenAt, now) ? ` · ${ago(s.seenAt, now)}` : ''}</span>{reviewBadge(s)}</p>
                <p className="sa-small mt-1 flex items-start gap-1.5"><MapPin size={14} className="mt-[3px] shrink-0" aria-hidden="true" />{s.place}</p>
                {s.description ? <p className="mt-1.5">{s.description}</p> : null}
                {s.kind === 'secured' && s.careNote ? <p className="sa-small mt-1.5"><span className="sa-semibold">Where it is being kept (private):</span> {s.careNote}</p> : null}
                <p className="sa-meta mt-1.5">
                  Reported by {s.reportedBy}
                  {s.photoUrl ? (
                    <>
                      {' · '}
                      <button
                        type="button"
                        onClick={() => openMedia(sightingMedia, Math.max(0, mediaIdx))}
                        className="inline-flex items-center gap-1 font-semibold text-[var(--sa-brand-ink)] hover:underline cursor-zoom-in"
                        aria-label={`Preview sighting photo at ${s.place}`}
                      >
                        <Camera size={13} aria-hidden="true" />photo
                      </button>
                    </>
                  ) : null}
                </p>
              </div>
              {!closed && s.review === 'unverified' ? <Button size="sm" variant="ghost" onClick={() => openDialog({ kind: 'reviewSighting', sightingId: s.id })}>Mark as checked</Button> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** How the owner and the finder are getting in touch after a Leader linked their reports. They choose; the Leader is asked only when one of them wants help. */
function touchText(m: PossibleMatch): string {
  return m.lost.open && m.found.open ? 'Direct conversation open between the owner and the finder.' : 'The reports are closed, so the conversation between the owner and the finder has ended.';
}

/**
 * The reports linked to this one and the ones ruled out. The possible matches still waiting are in "Needs you". Linking never merges or hides a report;
 * a link made from a match is not undone by a click here (the earlier, hand-made links keep their Unlink).
 */
export function LinkedReports({ c, now, openDialog }: { c: Case; now: Date; openDialog: OpenCaseDialog }) {
  const { state } = useAdminData();
  const closed = c.status === 'closed';
  const { linked, ruledOut } = matchesOf(state.matches, c.id);
  const byHand = state.cases.filter((x) => c.relatedCaseIds.includes(x.id) && !linked.some((m) => sameReport(partnerOf(m, c.id).caseId, x.id)));
  if (linked.length === 0 && byHand.length === 0 && ruledOut.length === 0) return null;
  const review = (matchId: string) => openDialog({ kind: 'match', matchId });
  return (
    <section className="sa-mc-sec" aria-labelledby="mc-linked">
      <div className="sa-mc-sec__head"><h2 id="mc-linked" className="sa-mc-sec__title">Linked reports</h2>{!closed ? <Button variant="link" size="sm" icon={Link2} onClick={() => openDialog({ kind: 'link' })}>Link a report</Button> : null}</div>
      {linked.length === 0 && byHand.length === 0 ? <p className="sa-small sa-text-2">No report is linked yet. Link a missing-pet report to a found-animal report when they may be the same animal.</p> : null}
      <ul className="sa-mc-list">
        {linked.map((m) => {
          const p = partnerOf(m, c.id);
          const theirs = caseById(state, p.caseId);
          return (
            <li key={m.id} className="sa-mc-row sa-mc-row--photo">
              <MatchPhoto side={p} />
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2"><Link to={adminPath(`/cases/${p.caseId}`)} className="sa-semibold">{p.title}</Link><KindBadge kind={p.kind} />{theirs?.status === 'closed' ? <CaseStatusBadge c={theirs} /> : null}</p>
                <p className="sa-meta mt-0.5"><span className="sa-ref">{p.caseId}</span> · {p.kind === 'found' ? 'found by' : 'reported by'} {p.reporter?.name ?? 'a resident'}{m.decidedAt ? ` · linked ${relative(m.decidedAt, now)}` : ''}</p>
                {touchText(m) ? <p className="sa-small sa-text-2 mt-1">{touchText(m)}</p> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="ghost" onClick={() => review(m.id)}>See why</Button>
                {!closed && p.open ? <Button size="sm" variant="ghost" icon={Unlink} onClick={() => openDialog({ kind: 'unlinkMatch', matchId: m.id })}>Unlink</Button> : null}
              </div>
            </li>
          );
        })}
        {byHand.map((o) => (
          <li key={o.id} className="sa-mc-row">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2"><Link to={adminPath(`/cases/${o.id}`)} className="sa-ref">{o.id}</Link><CaseStatusBadge c={o} /></p>
              <p className="sa-rowtitle mt-1">{o.title}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {!closed ? <Button size="sm" variant="ghost" icon={Unlink} onClick={() => openDialog({ kind: 'unlink', otherId: o.id })}>Unlink</Button> : null}
            </div>
          </li>
        ))}
      </ul>
      {ruledOut.length > 0 ? (
        <details className="sa-mc-more">
          <summary>Ruled out ({ruledOut.length})</summary>
          <ul className="sa-mc-list mt-2">
            {ruledOut.map((m) => {
              const p = partnerOf(m, c.id);
              return (
                <li key={m.id} className="sa-mc-row sa-mc-row--photo">
                  <MatchPhoto side={p} />
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2"><Link to={adminPath(`/cases/${p.caseId}`)} className="sa-semibold">{p.title}</Link><KindBadge kind={p.kind} /></p>
                    <p className="sa-meta mt-0.5"><span className="sa-ref">{p.caseId}</span>{m.decidedAt ? ` · ruled out ${relative(m.decidedAt, now)}` : ''}. Nobody was told.</p>
                  </div>
                  {!closed && p.open ? <Button size="sm" variant="ghost" onClick={() => review(m.id)}>Review again</Button> : null}
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

/** External referrals for this case (Barangay, Veterinary, Animal Control, Welfare Groups) and their status/outcomes. */
export function BarangayHelp({ c, openDialog }: { c: Case; openDialog: OpenCaseDialog }) {
  return (
    <section className="sa-mc-sec" aria-labelledby="mc-barangay">
      <CaseReferralsSection c={c} openDialog={openDialog} />
    </section>
  );
}

/**
 * Who a found animal belongs to is still decided by a Leader, with evidence, and residents can still claim it. That form is rarely needed, so it sits
 * behind one line; a claim waiting for an answer is asked about in "Needs you".
 */
export function Ownership({ c, openDialog }: { c: Case; openDialog: OpenCaseDialog }) {
  const waiting = c.claims.filter((k) => k.status === 'submitted' || k.status === 'under_review' || k.status === 'needs_info').length;
  return (
    <details className="sa-mc-more sa-mc-more--section rounded-xl border border-[#e7e2da] bg-white px-4 py-3 shadow-xs">
      <summary className="cursor-pointer font-semibold text-[var(--sa-text-1)]">Who does it belong to? <OwnershipBadge status={c.ownership.status} />{c.claims.length > 0 ? <span className="sa-text-3 font-normal"> · {plural(c.claims.length, 'claim')}{waiting > 0 ? `, ${waiting} waiting` : ''}</span> : null}</summary>
      <div className="mt-3"><AssessmentTab c={c} openDialog={openDialog} ownershipOnly /></div>
    </details>
  );
}
