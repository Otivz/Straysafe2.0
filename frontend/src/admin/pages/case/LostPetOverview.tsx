import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Camera, CalendarPlus, Check, Handshake, Landmark, Lock, MapPin, MessageSquare, Megaphone, Plus } from 'lucide-react';
import { isValidLatLng } from '../../../preview/geo';
import { LocationMapPreview } from '../../../preview/map/LocationMapPreview';
import { MapLegend } from '../../../preview/map/MapLegend';
import type { NumberedPoint } from '../../../preview/map/types';
import { ago, dueInfo, fmtDateTime, plural } from '../../../preview/lib/format';
import { adminPath } from '../../config';
import { Badge, IdentityBadge, OutcomeBadge, OwnershipBadge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { EvidenceTile } from '../../components/Evidence';
import { Block, Callout, Kv, Panel } from '../../components/layout';
import { DISPOSITIONS, NOTICE_STATUS, RECOVERY_SOURCES, REFERRAL_STATUS } from '../../data/constants';
import { useAdminData } from '../../data/context';
import { currentActivity, mediationOf, pendingFollowUpsOf } from '../../data/selectors';
import type { Case, LostPetConversation, LostPetSighting, Referral } from '../../data/types';
import type { OpenCaseDialog } from './dialogState';
import RegisteredPetPanel from './RegisteredPetPanel';
import RelatedReportsBlock from './RelatedReportsBlock';

/** How many sightings (and possible recoveries) are listed before "Show all". The case stays readable when a neighbourhood is very helpful. */
const SHOWN = 5;

const reviewBadge = (s: LostPetSighting) => (s.review === 'verified' ? <Badge tone="sage">Checked</Badge> : s.review === 'dismissed' ? <Badge>Not a match</Badge> : <Badge tone="amber">Not reviewed</Badge>);

/** One sighting or possible recovery: when, where, what, who wrote it (the Leader is given the name) and what the Leader decided about it. */
function SightingRow({ s, n, closed, openDialog }: { s: LostPetSighting; n: number; closed: boolean; openDialog: OpenCaseDialog }) {
  const lead = s.kind === 'secured';
  return (
    <li className="sa-record">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2"><span className="sa-semibold">{lead ? 'Possible recovery' : 'Sighting'} {n}</span>{reviewBadge(s)}</p>
          <p className="sa-meta mt-0.5">{fmtDateTime(s.seenAt)} · reported by {s.reportedBy}</p>
        </div>
        {!closed ? <Button size="sm" onClick={() => openDialog({ kind: 'reviewSighting', sightingId: s.id })}>Review</Button> : null}
      </div>
      <p className="sa-small mt-2 flex items-start gap-1.5"><MapPin size={14} className="mt-[3px] shrink-0" aria-hidden="true" />{s.place}</p>
      <p className="mt-2">{s.description || 'No description was given.'}</p>
      {lead && s.careNote ? <p className="sa-small mt-2"><span className="sa-semibold">Where it is being kept (private):</span> {s.careNote}</p> : null}
      {s.photoUrl ? <a href={s.photoUrl} target="_blank" rel="noreferrer" className="sa-small mt-2 inline-flex items-center gap-1.5 font-semibold"><Camera size={14} aria-hidden="true" />View photo</a> : null}
      {s.review !== 'unverified' ? (
        <p className="sa-meta mt-2">{s.review === 'verified' ? 'Checked' : 'Not a match'}{s.reviewedBy ? ` by ${s.reviewedBy}` : ''}{s.reviewedAt ? ` · ${fmtDateTime(s.reviewedAt)}` : ''}{s.reviewNote ? ` · ${s.reviewNote}` : ''}</p>
      ) : null}
    </li>
  );
}

const telOf = (phone: string) => (phone && phone !== '—' ? <a href={`tel:${phone}`} className="font-semibold">{phone}</a> : <span className="sa-text-3">No phone number</span>);

/**
 * One conversation between the owner and the person who may have the pet. The Leader never reads their messages. Phone numbers are shown only
 * once one of them asked the Leader to help: that is the one case where the Leader needs them.
 */
function ConversationRow({ x, c, sighting, closed, openDialog }: { x: LostPetConversation; c: Case; sighting?: LostPetSighting; closed: boolean; openDialog: OpenCaseDialog }) {
  const owner = x.owner?.name ?? 'The owner';
  const finder = x.finder?.name ?? 'A neighbour';
  const asked = x.requestedBy === 'owner' ? owner : x.requestedBy === 'finder' ? finder : 'One of them';
  return (
    <li className="sa-record">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="sa-semibold">{owner} and {finder}</p>
          <p className="sa-meta mt-0.5">{sighting ? `About the possible recovery of ${fmtDateTime(sighting.seenAt)}` : 'About a possible recovery'}</p>
        </div>
        {x.status === 'resolved' ? <Badge>Finished</Badge> : x.mode === 'leader' ? <Badge tone="amber" dot>Waiting for you</Badge> : x.mode === 'direct' ? <Badge tone="sage">Messaging each other</Badge> : <Badge>Not agreed yet</Badge>}
      </div>

      {x.status === 'resolved' ? (
        <p className="sa-small mt-3">Finished{x.resolvedAt ? ` ${fmtDateTime(x.resolvedAt)}` : ''}.{x.resolutionNote ? ` ${x.resolutionNote}` : ''}</p>
      ) : x.mode === 'leader' ? (
        <>
          <Callout className="mt-3" tone="amber" title={`${asked} asked you to help${x.requestedAt ? ` ${ago(x.requestedAt, new Date()) || fmtDateTime(x.requestedAt)}` : ''}.`}>
            No reason was asked for. Direct messages between them are closed. Contact them, record what you did, and mark it finished.
          </Callout>
          <Kv rows={[[`Owner · ${owner}`, telOf(x.owner?.phone ?? '—')], [`Neighbour · ${finder}`, telOf(x.finder?.phone ?? '—')]]} wide />
          {!closed ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="primary" size="sm" icon={MessageSquare} onClick={() => openDialog({ kind: 'followUp', mode: 'owner' })}>Record contact</Button>
              <Button size="sm" icon={CalendarPlus} onClick={() => openDialog({ kind: 'followUp', mode: 'follow_up' })}>Schedule next step</Button>
              <Button size="sm" icon={Check} onClick={() => openDialog({ kind: 'resolveConversation', conversationId: x.id })}>Mark as finished</Button>
            </div>
          ) : null}
        </>
      ) : x.mode === 'direct' ? (
        <p className="sa-small sa-text-2 mt-3">They agreed to message each other in the app. You do not see their messages, and nothing is needed from you unless one of them asks for your help.</p>
      ) : (
        <p className="sa-small sa-text-2 mt-3">Waiting for them to choose. Owner: {x.ownerAgreed ? 'agreed to message' : 'has not agreed yet'}. Neighbour: {x.finderAgreed ? 'agreed to message' : 'has not agreed yet'}. Either can ask you to help instead, with no reason.</p>
      )}
      {c.status === 'closed' && x.status === 'open' ? <p className="sa-meta mt-2">The case is closed.</p> : null}
    </li>
  );
}

/** A Barangay (or other) request for help. Saving it is not contact: only an attempt the Leader records says anyone was reached. */
function ReferralRow({ r, closed, openDialog }: { r: Referral; closed: boolean; openDialog: OpenCaseDialog }) {
  const s = REFERRAL_STATUS[r.status];
  const unsent = r.status === 'to_contact';
  const last = r.notes[0];
  return (
    <li className="sa-record">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="sa-semibold">{r.orgName}</p>
          <p className="sa-meta mt-0.5">{unsent ? `Written down ${fmtDateTime(r.referredAt)}` : `Contacted ${fmtDateTime(r.referredAt)}${r.contactPerson ? ` · ${r.contactPerson}` : ''}${r.contactChannel ? ` · ${r.contactChannel}` : ''}`}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={s.tone} dot>{s.label}</Badge>
          {!closed ? <Button size="sm" variant={unsent ? 'primary' : 'secondary'} icon={Handshake} onClick={() => openDialog({ kind: 'coordination', referralId: r.id, ...(unsent ? { contact: true } : {}) })}>{unsent ? 'Record contact attempt' : 'Record update'}</Button> : null}
        </div>
      </div>
      <p className="mt-2">{r.reason}</p>
      {unsent ? <Callout className="mt-3" tone="amber">Nobody has been contacted yet. This is only a note that help is needed; it counts as contact once you record the attempt.</Callout> : null}
      {last && !unsent ? <p className="sa-small sa-text-2 mt-2"><span className="sa-text-3">{fmtDateTime(last.at)}</span> · {last.text}</p> : null}
      {r.externalOutcome ? <p className="sa-small mt-2"><span className="sa-semibold">Their outcome:</span> {r.externalOutcome}</p> : null}
      {r.remainingFollowUp ? <p className="sa-small mt-1"><span className="sa-semibold">Still to do:</span> {r.remainingFollowUp}</p> : null}
    </li>
  );
}

/**
 * A missing-pet case, in the order a Leader needs it: who the pet is and who owns it -> where it was last seen -> what neighbours reported since
 * (possible recoveries first) -> the owner and a neighbour who need help getting in touch -> the Barangay's help -> the history (its own tab).
 * Only what is relevant offers an action: nothing here asks the Leader to approve the notice (it was published when the report was filed) or to
 * move a status, and nothing here lets a Leader declare the pet recovered without the owner's confirmation.
 */
export default function LostPetOverview({ c, now, openDialog }: { c: Case; now: Date; openDialog: OpenCaseDialog }) {
  const { state } = useAdminData();
  const navigate = useNavigate();
  const [showAll, setShowAll] = useState(false);
  const lp = c.lostPet;
  if (!lp) return null;

  const closed = c.status === 'closed';
  const notice = state.notices.find((n) => n.caseId === c.id && n.status !== 'archived');
  const leads = lp.sightings.filter((s) => s.kind === 'secured');
  const seen = lp.sightings.filter((s) => s.kind !== 'secured');
  const ordered = [...lp.sightings].sort((a, b) => a.seenAt.localeCompare(b.seenAt));
  const numberOf = new Map(ordered.map((s, i) => [s.id, i + 1] as const));
  const asked = mediationOf(c);
  const unreviewedLeads = leads.filter((s) => s.review === 'unverified').length;
  const next = pendingFollowUpsOf(c).filter((f) => f.dueAt).sort((a, b) => a.dueAt!.localeCompare(b.dueAt!))[0];

  const pin = isValidLatLng(lp.lastSeen.lat, lp.lastSeen.lng) ? { lat: lp.lastSeen.lat as number, lng: lp.lastSeen.lng as number } : null;
  const numbered: NumberedPoint[] = ordered.flatMap((s, i) => (isValidLatLng(s.lat, s.lng) ? [{ n: i + 1, lat: s.lat as number, lng: s.lng as number, latest: i === ordered.length - 1 }] : []));
  const hasMap = pin !== null || numbered.length > 0;
  const shownLeads = showAll ? leads : leads.slice(0, SHOWN);
  const shownSeen = showAll ? seen : seen.slice(0, SHOWN);
  const hidden = leads.length - shownLeads.length + (seen.length - shownSeen.length);

  const conversations = [...lp.conversations].sort((x, y) => Number(x.status === 'resolved') - Number(y.status === 'resolved') || Number(y.mode === 'leader') - Number(x.mode === 'leader'));
  const sightingOf = (id: string) => lp.sightings.find((s) => s.id === id);

  return (
    <div className="sa-case">
      <div className="flex min-w-0 flex-col gap-5">
        <RegisteredPetPanel c={c} />

        <Panel>
          <Block title="Where it was last seen" description="From the owner’s report, when the pet went missing.">
            {c.description.trim() ? <p className="sa-prose mb-4">{c.description.trim()}</p> : null}
            <Kv rows={[['When', lp.lastSeen.at ? <span>{fmtDateTime(lp.lastSeen.at)}{ago(lp.lastSeen.at, now) ? <span className="sa-text-3"> · {ago(lp.lastSeen.at, now)}</span> : null}</span> : 'Not given'], ['Where', lp.lastSeen.where || c.location.area || 'Not given']]} />
            {hasMap ? (
              <figure className="mt-5 flex flex-col">
                <LocationMapPreview pin={pin ?? undefined} numbered={numbered} height={230} interactive label="Map of where the pet was last seen and the places neighbours reported" />
                <MapLegend items={[...(pin ? [{ kind: 'pin' as const, label: 'Last seen' }] : []), ...(numbered.length > 0 ? [{ kind: 'dot' as const, label: 'Reported by a neighbour (oldest is 1)' }] : []), { kind: 'outline' as const, label: 'Approximate subdivision outline' }]} />
                <figcaption className="sa-meta mt-1.5">Each pin is a report from a person at the time shown. It is not live tracking. Only authorized administrators see the exact spots.</figcaption>
              </figure>
            ) : null}
            {c.evidence.length > 0 ? (
              <div className="mt-5">
                <p className="sa-label mb-2">Photos in the report</p>
                <div className="sa-evgrid">{c.evidence.map((e) => <EvidenceTile key={e.id} item={e} reviewed={c.assessment.evidenceReviewed.includes(e.id)} onOpen={() => openDialog({ kind: 'evidence', evidenceId: e.id })} />)}</div>
              </div>
            ) : null}
          </Block>
        </Panel>

        <Panel>
          <Block
            title="Sightings and possible recoveries"
            description={lp.sightings.length > 0 ? `${plural(seen.length, 'sighting')} and ${plural(leads.length, 'possible recovery', 'possible recoveries')}, newest first.` : 'Reports from neighbours appear here, newest first.'}
          >
            {lp.sightings.length === 0 ? (
              <p className="sa-small sa-text-2">No one has reported seeing the pet yet. The notice was shown to residents{lp.notice?.residentsNotified ? ` (${plural(lp.notice.residentsNotified, 'resident')} notified)` : ''}, and the owner is told when someone reports a sighting. An ordinary sighting is not a task for you.</p>
            ) : (
              <div className="flex flex-col gap-5">
                {leads.length > 0 ? (
                  <div>
                    <p className="sa-label mb-2">Possible recoveries · someone may have the pet</p>
                    <ul className="m-0 flex list-none flex-col gap-3 p-0">{shownLeads.map((s) => <SightingRow key={s.id} s={s} n={numberOf.get(s.id) ?? 0} closed={closed} openDialog={openDialog} />)}</ul>
                    <p className="sa-hint mt-2">A possible recovery never marks the pet as home. Only the owner’s confirmation does.</p>
                  </div>
                ) : null}
                {seen.length > 0 ? (
                  <div>
                    <p className="sa-label mb-2">Sightings</p>
                    <ul className="m-0 flex list-none flex-col gap-3 p-0">{shownSeen.map((s) => <SightingRow key={s.id} s={s} n={numberOf.get(s.id) ?? 0} closed={closed} openDialog={openDialog} />)}</ul>
                  </div>
                ) : null}
                {hidden > 0 ? <Button size="sm" onClick={() => setShowAll(true)}>Show all {lp.sightings.length}</Button> : null}
              </div>
            )}
          </Block>
        </Panel>

        {conversations.length > 0 ? (
          <Panel>
            <Block title="Getting in touch" description="How the owner and each person who may have the pet get in touch. They choose; you are asked only if one of them wants your help.">
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {conversations.map((x) => <ConversationRow key={x.id} x={x} c={c} sighting={sightingOf(x.sightingId)} closed={closed} openDialog={openDialog} />)}
              </ul>
            </Block>
          </Panel>
        ) : null}

        <Panel>
          <Block
            title="Barangay assistance"
            description="Ask the Barangay for help looking for the pet. The Barangay has no account here, so only the contact you record counts."
            action={!closed ? <Button size="sm" icon={Landmark} onClick={() => openDialog({ kind: 'referral' })}>Ask for help</Button> : undefined}
          >
            {c.referrals.length === 0 ? <p className="sa-small sa-text-2">No one has been asked for help. Guards are not a default responder; add the Barangay or another organisation only when it helps.</p> : (
              <ul className="m-0 flex list-none flex-col gap-3 p-0">{c.referrals.map((r) => <ReferralRow key={r.id} r={r} closed={closed} openDialog={openDialog} />)}</ul>
            )}
          </Block>
        </Panel>

        <Panel><RelatedReportsBlock c={c} openDialog={openDialog} /></Panel>
      </div>

      <aside className="sa-case__aside" aria-label="Case details">
        {lp.recovery ? (
          <Panel>
            <Block tight title="The pet is home" description="Recorded from the owner’s confirmation.">
              <Kv stack rows={[
                ['How', RECOVERY_SOURCES[lp.recovery.source]], ['Confirmed', fmtDateTime(lp.recovery.at)], ['Recorded by', `${lp.recovery.recordedBy} · ${fmtDateTime(lp.recovery.recordedAt)}`],
                ...(lp.recovery.note ? [['Notes', lp.recovery.note] as [string, string]] : []),
              ]} />
            </Block>
          </Panel>
        ) : c.closure ? (
          <Panel>
            <Block tight title="Closure">
              <p className="flex flex-wrap items-center gap-2"><span className="sa-semibold">{DISPOSITIONS[c.closure.disposition].label}</span><OutcomeBadge group={c.closure.outcome} /></p>
              <p className="sa-prose mt-2">{c.closure.reason}</p>
              <p className="sa-meta mt-3">Closed by {c.closure.closedBy} · {fmtDateTime(c.closure.closedAt)}</p>
            </Block>
          </Panel>
        ) : null}

        <Panel>
          <Block tight title="Where things stand">
            <Kv stack rows={[
              ['Right now', currentActivity(c, now)],
              ['Animal', <IdentityBadge status={c.identity.status} decided={c.identity.decided} />],
              ['Ownership', <OwnershipBadge status={c.ownership.status} />],
              ['Sightings', seen.length === 0 ? 'None yet' : `${seen.length} · latest ${ago(seen[0].seenAt, now) || fmtDateTime(seen[0].seenAt)}`],
              ['Possible recoveries', leads.length === 0 ? 'None' : `${leads.length}${unreviewedLeads > 0 ? ` · ${unreviewedLeads} not reviewed` : ''}`],
              ['Asking for your help', asked.length === 0 ? 'No one' : plural(asked.length, 'request')],
              ['Next follow-up', next ? <span className={dueInfo(next.dueAt, now).overdue ? 'sa-text-red' : ''}>{dueInfo(next.dueAt, now).label}<span className="sa-text-3 block">{next.title}</span></span> : '—'],
            ]} />
          </Block>
        </Panel>

        <Panel>
          <Block tight title={<span className="flex items-center gap-2"><Megaphone size={14} aria-hidden="true" />Community notice</span>}>
            {lp.notice ? (
              <div className="flex flex-col gap-2">
                <p className="flex items-center gap-2">{notice ? <Badge tone={NOTICE_STATUS[notice.status].tone}>{NOTICE_STATUS[notice.status].label}</Badge> : <Badge>{lp.notice.status === 'closed' ? 'Closed' : 'Published'}</Badge>}</p>
                <p className="sa-small sa-text-2">Published automatically{lp.notice.publishedAt ? ` on ${fmtDateTime(lp.notice.publishedAt)}` : ''}. Nobody has to approve it.{lp.notice.residentsNotified ? ` ${plural(lp.notice.residentsNotified, 'resident')} notified.` : ''}</p>
                {notice ? <p><Link to={adminPath(`/community/${notice.id}/edit`)} className="sa-small font-semibold">Open notice</Link></p> : null}
              </div>
            ) : c.sensitive ? (
              <Callout icon={Lock}>This is a private complaint. It is never published.</Callout>
            ) : (
              <>
                <p className="sa-small sa-text-2">This older report has no missing-pet notice.</p>
                {!closed ? <Button className="mt-3" size="sm" icon={Plus} onClick={() => navigate(`${adminPath('/community/new')}?fromCase=${c.id}`)}>Create notice</Button> : null}
              </>
            )}
          </Block>
        </Panel>

        {!c.registeredPet?.reporterIsOwner ? (
          <Panel>
            <Block tight title={<span className="flex items-center gap-2"><Lock size={14} aria-hidden="true" />Reporter</span>} description="Visible to authorized administrators only.">
              <Kv stack rows={[['Name', c.reporter.name], ['Unit', c.reporter.unit], ['Phone', c.reporter.phone], ['Email', <span className="break-all">{c.reporter.email}</span>]]} />
              {c.reporter.residentId ? <p className="sa-small mt-3"><Link to={adminPath(`/residents/${c.reporter.residentId}`)} className="font-semibold">View resident profile</Link></p> : null}
            </Block>
          </Panel>
        ) : null}
      </aside>
    </div>
  );
}
