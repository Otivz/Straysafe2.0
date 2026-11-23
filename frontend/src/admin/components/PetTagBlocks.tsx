import { useEffect, useState } from 'react';
import { Image as ImageIcon, MapPin, Phone, QrCode } from 'lucide-react';
import { fmtDate, fmtDateTime } from '../../preview/lib/format';
import { fromServer } from '../../live/dates';
import { adminApi, type ApiPetTagInfo, type ApiTagFoundReport } from '../live/api';
import { Badge } from './Badge';
import { Block, Panel } from './layout';

/**
 * Pet QR tags in the Leader admin (Phase 3 of docs/06-future-proposals/PET_QR_TAGS_PLAN_2026-11-17.md). The Leader sees whether a
 * pet has a tag and the messages people left after scanning it, and can turn off a tag that is being misused. Only the owner
 * creates or prints a tag, and only the owner sees a phone number a finder shared.
 */

/** New -> Viewed (the owner opened it) -> Pet returned, or Not the pet; "Done" closes a message without either. */
const STATUS: Record<ApiTagFoundReport['status'], { label: string; tone: 'brand' | 'amber' | 'sage' | 'neutral' }> = {
  new: { label: 'New · not seen by the owner', tone: 'amber' },
  seen_by_owner: { label: 'Viewed by the owner', tone: 'neutral' },
  returned: { label: 'Pet returned', tone: 'sage' },
  dismissed: { label: 'Not the pet', tone: 'neutral' },
  resolved: { label: 'Done', tone: 'sage' },
};
const isClosed = (r: ApiTagFoundReport) => r.status === 'resolved' || r.status === 'returned' || r.status === 'dismissed';

/** "1 new · 1 viewed · 1 closed" */
function tagMessageSummary(reports: ApiTagFoundReport[]): string {
  const n = (f: (r: ApiTagFoundReport) => boolean) => reports.filter(f).length;
  const parts: [number, string][] = [[n((r) => r.status === 'new'), 'new'], [n((r) => r.status === 'seen_by_owner'), 'viewed'], [n(isClosed), 'closed']];
  return parts.filter(([k]) => k > 0).map(([k, w]) => `${k} ${w}`).join(' · ');
}

/** A finder's photo: a guest's (no account) stays hidden until tapped, since nobody has checked it. */
function LeaderFinderPhoto({ url, fromGuest }: { url: string; fromGuest: boolean }) {
  const [shown, setShown] = useState(!fromGuest);
  if (!shown) {
    return (
      <button type="button" className="sa-btn sa-btn--secondary sa-btn--sm" style={{ alignSelf: 'flex-start' }} onClick={() => setShown(true)}>
        <ImageIcon size={14} aria-hidden="true" /> Tap to view · photo from a visitor (not checked)
      </button>
    );
  }
  return <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Photo sent by the finder" loading="lazy" style={{ maxWidth: 220, borderRadius: 8 }} /></a>;
}

/**
 * The messages people left after scanning a pet's tag. Open ones (new or viewed) come first; closed ones (pet returned, not the pet,
 * done) are folded under "Earlier messages", because they need nothing from the Leader.
 */
export function TagMessageList({ reports }: { reports: ApiTagFoundReport[] }) {
  const waiting = reports.filter((r) => !isClosed(r));
  const answered = reports.filter(isClosed);
  return (
    <div className="flex flex-col gap-3">
      <p className="sa-meta m-0">{tagMessageSummary(reports)}</p>
      {waiting.length > 0 ? <MessageItems reports={waiting} /> : <p className="sa-small sa-text-2 m-0">No open messages.</p>}
      {answered.length > 0 ? (
        <details>
          <summary className="sa-small cursor-pointer font-semibold">Earlier messages ({answered.length}), closed</summary>
          <div className="mt-2"><MessageItems reports={answered} /></div>
        </details>
      ) : null}
    </div>
  );
}

function MessageItems({ reports }: { reports: ApiTagFoundReport[] }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-3 p-0">
      {reports.map((r) => {
        const map = r.latitude !== null && r.longitude !== null ? `https://www.google.com/maps?q=${r.latitude},${r.longitude}` : null;
        return (
          <li key={r.scan_id} className="flex flex-col gap-1">
            <p className="flex flex-wrap items-center gap-2">
              <span className="sa-small font-semibold">{r.from_signed_in_resident ? 'A resident (signed in)' : 'A visitor (no account)'}</span>
              <span className="sa-meta">{fmtDateTime(fromServer(r.created_at))}</span>
              <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
            </p>
            {r.location_label || map ? (
              <p className="sa-small flex items-center gap-1.5"><MapPin size={14} aria-hidden="true" />{r.location_label}{map ? <a href={map} target="_blank" rel="noreferrer">{r.location_label ? ' · map' : 'Open the map'}</a> : null}</p>
            ) : null}
            {r.note ? <p className="sa-small sa-text-2" style={{ whiteSpace: 'pre-wrap' }}>{r.note}</p> : null}
            {r.photo_url ? <LeaderFinderPhoto url={r.photo_url} fromGuest={!r.from_signed_in_resident} /> : null}
            {r.phone_shared ? <p className="sa-hint flex items-center gap-1.5"><Phone size={13} aria-hidden="true" />The finder shared a phone number with the owner (not shown here).</p> : null}
          </li>
        );
      })}
    </ul>
  );
}

/** The aside panel on the Leader's pet page. */
export function PetTagPanel({ petId, petName }: { petId: string; petName: string }) {
  const id = Number(petId);
  const [tag, setTag] = useState<ApiPetTagInfo | null>(null);
  const [reports, setReports] = useState<ApiTagFoundReport[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!Number.isInteger(id) || id <= 0) return;
    let live = true;
    Promise.all([adminApi.petTag(id), adminApi.petTagScans(id)]).then(
      ([t, s]) => { if (live) { setTag(t); setReports(s.found_reports); setFailed(false); } },
      () => { if (live) setFailed(true); },
    );
    return () => { live = false; };
  }, [id]);

  if (!Number.isInteger(id) || id <= 0) return null;
  return (
    <Panel>
      <Block tight title={<span className="flex items-center gap-2"><QrCode size={14} aria-hidden="true" />QR tag</span>} description="A permanent QR tag on the collar. Anyone who scans it can tell the owner, without seeing who the owner is.">
        {failed ? <p className="sa-small sa-text-2">The QR tag could not be loaded.</p> : !tag ? <p className="sa-small sa-text-2">Loading…</p> : (
          <>
            {tag.has_tag ? (
              <p className="flex items-center gap-2"><Badge tone="sage" dot>Permanent QR tag active</Badge>{tag.created_at ? <span className="sa-meta">since {fmtDate(fromServer(tag.created_at))}</span> : null}</p>
            ) : <p className="sa-small sa-text-2">{petName} has no active QR tag.</p>}
            <h3 className="sa-small mt-4 font-semibold">Messages from people who scanned the tag</h3>
            {reports.length === 0 ? <p className="sa-small sa-text-2">Nobody has sent a message through this pet’s tag.</p> : <div className="mt-2"><TagMessageList reports={reports} /></div>}
          </>
        )}
      </Block>
    </Panel>
  );
}

/** "Tell the owner" messages filed under a lost-pet notice, for the case page (listed beside the sightings). Renders nothing when there are none. */
export function AlertTagMessages({ alertId }: { alertId: string | null }) {
  const id = Number(alertId);
  const [reports, setReports] = useState<ApiTagFoundReport[]>([]);

  useEffect(() => {
    if (!Number.isInteger(id) || id <= 0) return;
    let live = true;
    adminApi.alertTagScans(id).then((r) => { if (live) setReports(r.found_reports); }, () => undefined);
    return () => { live = false; };
  }, [id]);

  if (reports.length === 0) return null;
  return (
    <section className="sa-mc-sec" aria-labelledby="mc-tag-messages">
      <div className="sa-mc-sec__head"><h2 id="mc-tag-messages" className="sa-mc-sec__title">QR tag messages</h2></div>
      <p className="sa-hint mb-3">Left by people who scanned the pet’s QR tag while this notice was open. They are sent to the owner; they are not shown to neighbours as sightings.</p>
      <TagMessageList reports={reports} />
    </section>
  );
}
