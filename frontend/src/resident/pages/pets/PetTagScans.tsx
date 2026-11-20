import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, House, MapPin, Phone } from 'lucide-react';
import { fmtDateTime } from '../../../preview/lib/format';
import { fromServer } from '../../../live/dates';
import { LocationMapPreview } from '../../../preview/map/LocationMapPreview';
import { ConfirmSheet } from '../../components/Sheet';
import { Button, Callout, Pill } from '../../components/ui';
import { useToast } from '../../components/toast';
import { residentPath } from '../../config';
import { residentApi, type ApiPetTagScans } from '../../live/api';

const STATUS_PILL = { new: { tone: 'brand', label: 'New' }, seen_by_owner: { tone: 'amber', label: 'Open' }, resolved: { tone: 'sage', label: 'Done' } } as const;

/**
 * Messages from people who scanned the pet's QR tag (Phase 2 of the pet QR tags plan). The owner sees a phone number a
 * finder chose to share, and can resolve a message or say "back home", which resolves every open one and deletes the numbers.
 */
export function PetTagScans({
  petId,
  petName,
  owner,
  onScans,
  onError,
}: {
  petId: number;
  petName: string;
  owner: boolean;
  onScans?: (data: ApiPetTagScans) => void;
  onError?: () => void;
}) {
  const toast = useToast();
  const [data, setData] = useState<ApiPetTagScans | null>(null);
  const [failed, setFailed] = useState(false);
  const [confirmHome, setConfirmHome] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(() => residentApi.petTagScans(petId).then(
    (d) => { setData(d); setFailed(false); onScans?.(d); },
    () => { setFailed(true); onError?.(); },
  ), [petId, onScans, onError]);

  useEffect(() => {
    let live = true;
    residentApi.petTagScans(petId).then(
      (d) => { if (live) { setData(d); setFailed(false); onScans?.(d); } },
      () => { if (live) { setFailed(true); onError?.(); } },
    );
    return () => { live = false; };
  }, [petId, onScans, onError]);

  if (failed) return <Callout tone="amber">Couldn’t load the messages from tag scans right now.</Callout>;
  if (!data || (data.found_reports.length === 0 && data.views.count === 0)) return null;
  const openReports = data.found_reports.filter((r) => r.status !== 'resolved');
  const open = openReports.length;
  if (open === 0) {
    if (data.views.count === 0) return null;
    return (
      <p className="rs-meta">
        The tag page was opened {data.views.count} time{data.views.count === 1 ? '' : 's'}
        {data.views.last_at ? `, last ${fmtDateTime(fromServer(data.views.last_at))}` : ''}.
      </p>
    );
  }

  const resolve = async (scanId: number) => {
    setBusyId(scanId);
    try {
      await residentApi.resolvePetTagScan(petId, scanId);
      await load();
    } catch (err) {
      toast.error((err as Error)?.message || 'Could not update the message.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="rs-stack-sm">
      <h3 className="rs-label">Messages from people who scanned the tag ({open})</h3>
      <p className="rs-meta">
        {data.views.count > 0
          ? `The tag page was opened ${data.views.count} time${data.views.count === 1 ? '' : 's'}${data.views.last_at ? `, last ${fmtDateTime(fromServer(data.views.last_at))}` : ''}.`
          : 'Nobody has opened the tag page yet.'}
      </p>
      {openReports.map((r) => {
        const pill = STATUS_PILL[r.status];
        const map = r.latitude !== null && r.longitude !== null ? `https://www.google.com/maps?q=${r.latitude},${r.longitude}` : null;
        return (
          <div key={r.scan_id} className="rs-card rs-stack-sm" style={{ alignItems: 'stretch' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span className="rs-row__title">{r.from_signed_in_resident ? 'A neighbour' : 'Someone'} · {fmtDateTime(fromServer(r.created_at))}</span>
              <Pill tone={pill.tone}>{pill.label}</Pill>
            </div>
            {r.location_label || map ? (
              <div className="rs-stack-sm">
                <p className="rs-sub" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <MapPin size={15} aria-hidden="true" />
                  <span>{r.location_label}{map ? <> {r.location_label ? '· ' : ''}<a href={map} target="_blank" rel="noreferrer">Open the map</a></> : null}</span>
                </p>
                {r.latitude !== null && r.longitude !== null ? (
                  <LocationMapPreview pin={{ lat: r.latitude, lng: r.longitude }} height={160} label={`Where ${petName} was spotted`} />
                ) : null}
              </div>
            ) : null}
            {r.note ? <p className="rs-sub" style={{ whiteSpace: 'pre-wrap' }}>{r.note}</p> : null}
            {r.photo_url ? <img src={r.photo_url} alt={`Photo from the person who found ${petName}`} style={{ maxWidth: '100%', borderRadius: 12 }} /> : null}
            {r.finder_phone ? (
              <p className="rs-sub" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <Phone size={15} aria-hidden="true" /><a href={`tel:${r.finder_phone}`}>{r.finder_phone}</a>
                <span className="rs-meta">· meet in a public place or at the guardhouse</span>
              </p>
            ) : r.status === 'resolved' ? (
              <p className="rs-meta">Marked as done.</p>
            ) : r.phone_shared ? <p className="rs-meta">The finder shared a phone number with the owner.</p> : null}
            <div className="rs-row-actions">
              <Link className="rs-btn rs-btn--secondary rs-btn--sm" to={residentPath(`/pets/${petId}/scans/${r.scan_id}`)}>Open details</Link>
              {owner && r.status !== 'resolved' ? (
                <Button size="sm" icon={Check} loading={busyId === r.scan_id} onClick={() => { void resolve(r.scan_id); }}>Mark as done</Button>
              ) : null}
            </div>
          </div>
        );
      })}
      {owner && open > 0 ? (
        <Button variant="primary" block icon={House} onClick={() => setConfirmHome(true)}>{petName} is back home</Button>
      ) : null}
      {confirmHome ? (
        <ConfirmSheet
          title={`Is ${petName} back home?`}
          message="Every open message from a tag scan is marked done, and any phone number a finder shared is deleted. If you reported a lost pet, close that report from its own page too."
          confirmLabel="Yes, back home"
          onConfirm={async () => {
            await residentApi.resolveAllPetTagScans(petId);
            await load();
            toast.success(`Glad ${petName} is home!`);
          }}
          onClose={() => setConfirmHome(false)}
        />
      ) : null}
    </div>
  );
}
