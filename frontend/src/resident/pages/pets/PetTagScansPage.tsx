import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Check, CircleCheck, CircleX, ExternalLink, House, MapPin, PawPrint, Phone } from 'lucide-react';
import { fromServer } from '../../../live/dates';
import { fmtDateTime } from '../../../preview/lib/format';
import { LocationMapPreview } from '../../../preview/map/LocationMapPreview';
import { Screen } from '../../components/Screen';
import { ConfirmSheet } from '../../components/Sheet';
import { useToast } from '../../components/toast';
import {
  Button, Callout, EmptyState, ErrorState, LinkButton, ListSkeleton, NotFoundState, Pill, Section,
} from '../../components/ui';
import { residentPath } from '../../config';
import { useResidentData } from '../../data/context';
import { activeLostReport, petById } from '../../data/selectors';
import { residentApi, type ApiPetTagFoundReport, type ApiPetTagScans } from '../../live/api';
import { STATUS_PILL, isClosedScan } from '../../lib/petTag';
import { FinderPhoto } from './PetTagScans';

/**
 * Separate owner notification page for a pet's QR tag scans (`/pets/:petId/scans` and `/pets/:petId/scans/:scanId`).
 * Shows the finder's message, embedded map pin, optional photo and phone number. A message goes New -> Viewed (opening this page)
 * -> "Pet returned" (the existing recovery, for a missing pet) or "Not the pet" (a prank or a mistake: the message is closed, its
 * photo link removed, and a neutral line is left on the case). For a pet that is not missing, a message can also be marked done.
 */
type Answer = 'not_yet' | 'not_real';
const ANSWER_TOAST: Record<Answer, string> = { not_yet: 'Noted: still looking.', not_real: 'Marked as not your pet.' };
export default function PetTagScansPage() {
  const { state, dispatch } = useResidentData();
  const { petId, scanId } = useParams();
  const toast = useToast();
  const pet = petById(state, petId);
  const numericId = Number(petId);
  const focusedScanId = scanId ? Number(scanId) : null;
  const valid = Boolean(pet) && Number.isInteger(numericId) && numericId > 0;

  const [data, setData] = useState<ApiPetTagScans | null>(null);
  const [owner, setOwner] = useState(false);
  const [loading, setLoading] = useState(valid);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<{ id: number; what: 'done' | Answer } | null>(null);
  const [confirmHome, setConfirmHome] = useState(false);

  const load = useCallback(async () => {
    if (!valid) return;
    setError(false);
    try {
      const [tag, scans] = await Promise.all([
        residentApi.petTag(numericId),
        residentApi.petTagScans(numericId),
      ]);
      setOwner(tag.can_manage);
      setData(scans);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [valid, numericId]);

  useEffect(() => {
    if (!valid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void load();
  }, [valid, load]);

  if (!pet) {
    return (
      <Screen title="Tag scan" back="/pets">
        <NotFoundState what="pet" to="/pets" label="Go to My pets" />
      </Screen>
    );
  }

  const petProfilePath = `/pets/${pet.id}`;
  const missing = activeLostReport(state, pet.id);
  const isLost = Boolean(missing) || pet.status === 'Lost';

  const runResolve = async (opts: { scanId?: number; recovered: boolean; answer?: Answer }) => {
    await dispatch({ type: 'petTag/resolve', petId: pet.id, scanId: opts.scanId, recovered: opts.recovered, answer: opts.answer });
    await load();
    toast.success(opts.recovered ? `Glad ${pet.name} is home!` : opts.answer ? ANSWER_TOAST[opts.answer] : 'Marked as done');
  };

  /** One message: marked done (a pet that is not missing), or answered "not yet" / "not real" (a missing pet). */
  const settle = async (id: number, what: 'done' | Answer) => {
    setBusy({ id, what });
    try {
      await runResolve({ scanId: id, recovered: false, answer: what === 'done' ? undefined : what });
    } catch (err) {
      toast.error((err as Error)?.message || 'Could not update the message.');
    } finally {
      setBusy(null);
    }
  };
  const isBusy = (id: number, what: 'done' | Answer) => busy?.id === id && busy.what === what;

  const reports = data?.found_reports ?? [];
  const focused = focusedScanId !== null ? reports.find((r) => r.scan_id === focusedScanId) ?? null : null;
  const rest = focused ? reports.filter((r) => r.scan_id !== focused.scan_id) : reports;
  const openCount = reports.filter((r) => !isClosedScan(r.status)).length;

  const renderCard = (r: ApiPetTagFoundReport) => {
    const pill = STATUS_PILL[r.status];
    const hasCoords = r.latitude !== null && r.longitude !== null;
    const mapsUrl = hasCoords ? `https://www.google.com/maps?q=${r.latitude},${r.longitude}` : null;
    return (
      <div key={r.scan_id} className="rs-card rs-stack" style={{ alignItems: 'stretch' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span className="rs-row__title">
            {r.from_signed_in_resident ? 'A neighbour' : 'A guest (not signed in)'} · {fmtDateTime(fromServer(r.created_at))}
          </span>
          <Pill tone={pill.tone}>{pill.label}</Pill>
        </div>

        {r.location_label || mapsUrl ? (
          <div className="rs-stack-sm">
            <p className="rs-sub" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <MapPin size={15} aria-hidden="true" />
              <span>{r.location_label || 'Pinned location'}</span>
            </p>
            {hasCoords ? (
              <>
                <LocationMapPreview
                  pin={{ lat: r.latitude as number, lng: r.longitude as number }}
                  height={220}
                  label={`Where ${pet.name} was spotted`}
                />
                {mapsUrl ? (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rs-meta"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  >
                    <ExternalLink size={13} aria-hidden="true" /> Open in Google Maps
                  </a>
                ) : null}
              </>
            ) : (
              <p className="rs-meta">No GPS map pin was shared with this message.</p>
            )}
          </div>
        ) : null}

        {r.note ? <p className="rs-sub" style={{ whiteSpace: 'pre-wrap' }}>{r.note}</p> : null}

        {r.photo_url ? <FinderPhoto url={r.photo_url} fromGuest={!r.from_signed_in_resident} petName={pet.name} /> : null}

        {r.finder_phone ? (
          <p className="rs-sub" style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <Phone size={15} aria-hidden="true" />
            <a href={`tel:${r.finder_phone}`}>{r.finder_phone}</a>
            <span className="rs-meta">· meet in a public place or at the guardhouse</span>
          </p>
        ) : isClosedScan(r.status) ? (
          <p className="rs-meta">Any shared finder phone number was cleared for privacy.</p>
        ) : r.phone_shared ? (
          <p className="rs-meta">The finder shared a phone number with the owner.</p>
        ) : !r.from_signed_in_resident ? (
          <p className="rs-meta">This guest left no phone number and cannot be contacted through StraySafe. Go to the place they described, or ask the Subdivision Leader for help.</p>
        ) : null}

        {r.status === 'returned' ? (
          <Callout tone="sage" icon={House} title="Pet returned">{pet.name} is home. This message is closed.</Callout>
        ) : r.status === 'dismissed' ? (
          <Callout tone="info" icon={CircleX} title="Not the pet">You marked this message as not about {pet.name}.</Callout>
        ) : r.status === 'resolved' ? (
          <Callout tone="sage" icon={CircleCheck} title="Done">This message is closed.</Callout>
        ) : owner && isLost ? (
          <div className="rs-stack-sm">
            <Button variant="primary" block icon={House} disabled={busy !== null} onClick={() => setConfirmHome(true)}>
              Pet returned
            </Button>
            <Button variant="secondary" block icon={CircleX} loading={isBusy(r.scan_id, 'not_real')} disabled={busy !== null}
              onClick={() => { void settle(r.scan_id, 'not_real'); }}>
              Not my pet / fake
            </Button>
            <p className="rs-meta">Still looking? Leave it as it is: it stays here as Viewed until {pet.name} is home.</p>
          </div>
        ) : owner ? (
          <div className="rs-stack-sm">
            <Button variant="primary" block icon={Check} loading={isBusy(r.scan_id, 'done')} disabled={busy !== null}
              onClick={() => { void settle(r.scan_id, 'done'); }}>
              Mark as done
            </Button>
            <Button variant="secondary" block icon={CircleX} loading={isBusy(r.scan_id, 'not_real')} disabled={busy !== null}
              onClick={() => { void settle(r.scan_id, 'not_real'); }}>
              Not my pet / fake
            </Button>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <Screen title={`Someone found ${pet.name}`} back={petProfilePath}>
      {loading ? (
        <ListSkeleton rows={3} />
      ) : error ? (
        <ErrorState onRetry={() => { void load(); }}>Couldn’t load the tag scan messages right now.</ErrorState>
      ) : reports.length === 0 ? (
        <EmptyState
          icon={PawPrint}
          title="No tag scan messages yet"
          action={<LinkButton variant="primary" to={residentPath(petProfilePath)}>View {pet.name}’s profile</LinkButton>}
        >
          When someone scans {pet.name}’s QR tag and leaves a message, it appears here with the map and phone number.
        </EmptyState>
      ) : (
        <div className="rs-stack">
          {focused ? (
            <Section title="Reported scan">
              {renderCard(focused)}
            </Section>
          ) : null}

          {rest.length > 0 ? (
            <Section title={focused ? `Other messages (${rest.length})` : `Tag scan messages (${rest.length})`}>
              <div className="rs-stack-sm">
                {rest.map(renderCard)}
              </div>
            </Section>
          ) : null}

          {owner && !isLost && openCount > 1 ? (
            <Button variant="secondary" block icon={House} onClick={() => setConfirmHome(true)}>
              Mark all messages as done
            </Button>
          ) : null}

          <LinkButton variant="secondary" block to={residentPath(petProfilePath)}>
            Open {pet.name}’s profile
          </LinkButton>
        </div>
      )}

      {confirmHome ? (
        <ConfirmSheet
          title={isLost ? `Confirm ${pet.name} is back home?` : 'Mark all tag scans as done?'}
          message={
            isLost
              ? `Confirm that ${pet.name} is safely back with you. Any open Lost Pet report and Community notice will be closed, ${pet.name}’s status will return to Active, open scan messages will be marked done, and shared finder phone numbers will be deleted.`
              : 'Every open message from a tag scan is marked done, and any phone number a finder shared is deleted.'
          }
          confirmLabel={isLost ? 'Yes, mark as recovered' : 'Yes, mark all done'}
          onConfirm={async () => {
            await runResolve({ recovered: isLost });
          }}
          onClose={() => setConfirmHome(false)}
        />
      ) : null}
    </Screen>
  );
}
