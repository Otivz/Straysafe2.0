import { useEffect, useState } from 'react';
import { MapPin, Phone, PowerOff, QrCode } from 'lucide-react';
import { fmtDate, fmtDateTime } from '../../preview/lib/format';
import { fromServer } from '../../live/dates';
import { adminApi, type ApiPetTagInfo, type ApiTagFoundReport } from '../live/api';
import { Badge } from './Badge';
import { Button } from './Button';
import { ConfirmDialog } from './Dialog';
import { Block, Panel } from './layout';
import { useToast } from './toast';

/**
 * Pet QR tags in the Leader admin (Phase 3 of docs/06-future-proposals/PET_QR_TAGS_PLAN_2026-11-17.md). The Leader sees whether a
 * pet has a tag and the messages people left after scanning it, and can turn off a tag that is being misused. Only the owner
 * creates or prints a tag, and only the owner sees a phone number a finder shared.
 */

const STATUS: Record<ApiTagFoundReport['status'], { label: string; tone: 'brand' | 'amber' | 'sage' }> = {
  new: { label: 'Not read by the owner', tone: 'brand' },
  seen_by_owner: { label: 'Read by the owner', tone: 'amber' },
  resolved: { label: 'Resolved', tone: 'sage' },
};

export function TagMessageList({ reports }: { reports: ApiTagFoundReport[] }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-3 p-0">
      {reports.map((r) => {
        const map = r.latitude !== null && r.longitude !== null ? `https://www.google.com/maps?q=${r.latitude},${r.longitude}` : null;
        return (
          <li key={r.scan_id} className="flex flex-col gap-1">
            <p className="flex flex-wrap items-center gap-2">
              <span className="sa-small font-semibold">{r.from_signed_in_resident ? 'A resident' : 'A visitor (no account)'}</span>
              <span className="sa-meta">{fmtDateTime(fromServer(r.created_at))}</span>
              <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
            </p>
            {r.location_label || map ? (
              <p className="sa-small flex items-center gap-1.5"><MapPin size={14} aria-hidden="true" />{r.location_label}{map ? <a href={map} target="_blank" rel="noreferrer">{r.location_label ? ' · map' : 'Open the map'}</a> : null}</p>
            ) : null}
            {r.note ? <p className="sa-small sa-text-2" style={{ whiteSpace: 'pre-wrap' }}>{r.note}</p> : null}
            {r.photo_url ? <a href={r.photo_url} target="_blank" rel="noreferrer"><img src={r.photo_url} alt="Photo sent by the finder" loading="lazy" style={{ maxWidth: 220, borderRadius: 8 }} /></a> : null}
            {r.phone_shared ? <p className="sa-hint flex items-center gap-1.5"><Phone size={13} aria-hidden="true" />The finder shared a phone number with the owner (not shown here).</p> : null}
          </li>
        );
      })}
    </ul>
  );
}

/** The aside panel on the Leader's pet page. */
export function PetTagPanel({ petId, petName }: { petId: string; petName: string }) {
  const toast = useToast();
  const id = Number(petId);
  const [tag, setTag] = useState<ApiPetTagInfo | null>(null);
  const [reports, setReports] = useState<ApiTagFoundReport[]>([]);
  const [failed, setFailed] = useState(false);
  const [confirm, setConfirm] = useState(false);

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
      <Block tight title={<span className="flex items-center gap-2"><QrCode size={14} aria-hidden="true" />QR tag</span>} description="A printed tag on the collar. Anyone who scans it can tell the owner, without seeing who the owner is.">
        {failed ? <p className="sa-small sa-text-2">The QR tag could not be loaded.</p> : !tag ? <p className="sa-small sa-text-2">Loading…</p> : (
          <>
            {tag.has_tag ? (
              <>
                <p className="flex items-center gap-2"><Badge tone="sage" dot>Has a QR tag</Badge>{tag.created_at ? <span className="sa-meta">since {fmtDate(fromServer(tag.created_at))}</span> : null}</p>
                {tag.can_disable ? <Button className="mt-3" size="sm" variant="ghost" icon={PowerOff} onClick={() => setConfirm(true)}>Turn off tag</Button> : null}
              </>
            ) : <p className="sa-small sa-text-2">{petName} has no active QR tag. Only the owner can make one, from the resident app.</p>}
            <h3 className="sa-small mt-4 font-semibold">Messages from scans ({reports.length})</h3>
            {reports.length === 0 ? <p className="sa-small sa-text-2">Nobody has sent a message through this pet’s tag.</p> : <div className="mt-2"><TagMessageList reports={reports} /></div>}
          </>
        )}
      </Block>
      {confirm ? (
        <ConfirmDialog
          title={`Turn off ${petName}’s QR tag?`}
          message="Scanning the printed tag will show “This tag is no longer active”. Use this when a tag is being misused. The owner can make a new tag."
          confirmLabel="Turn off tag"
          tone="danger"
          onConfirm={async () => {
            setTag(await adminApi.disablePetTag(id));
            toast.success('QR tag turned off');
          }}
          onClose={() => setConfirm(false)}
        />
      ) : null}
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
      <div className="sa-mc-sec__head"><h2 id="mc-tag-messages" className="sa-mc-sec__title">QR tag messages <span className="sa-text-3">{reports.length}</span></h2></div>
      <p className="sa-hint mb-3">Left by people who scanned the pet’s QR tag while this notice was open. They are sent to the owner; they are not shown to neighbours as sightings.</p>
      <TagMessageList reports={reports} />
    </section>
  );
}
