import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Check, CircleCheck, ExternalLink, House, MapPin, PawPrint, Phone } from 'lucide-react';
import { fromServer } from '../../../live/dates';
import { fmtDateTime } from '../../../preview/lib/format';
import { LocationMapPreview } from '../../../preview/map/LocationMapPreview';
import { Screen } from '../../components/Screen';
import { ConfirmSheet, Sheet } from '../../components/Sheet';
import { useToast } from '../../components/toast';
import {
  Button, Callout, EmptyState, ErrorState, LinkButton, ListSkeleton, NotFoundState, Pill, Section,
} from '../../components/ui';
import { residentPath } from '../../config';
import { useResidentData } from '../../data/context';
import { activeLostReport, petById } from '../../data/selectors';
import { residentApi, type ApiPetTagFoundReport, type ApiPetTagScans } from '../../live/api';

const STATUS_PILL = {
  new: { tone: 'brand', label: 'New' },
  seen_by_owner: { tone: 'amber', label: 'Open' },
  resolved: { tone: 'sage', label: 'Done' },
} as const;

/**
 * Separate owner notification page for a pet's QR tag scans (`/pets/:petId/scans` and `/pets/:petId/scans/:scanId`).
 * Shows the finder's message, embedded map pin, optional photo and phone number, and lets the owner mark each scan done
 * or confirm that a lost pet is back home.
 */
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
  const [busyId, setBusyId] = useState<number | null>(null);
  const [resolveChoiceScanId, setResolveChoiceScanId] = useState<number | null>(null);
  const [choiceBusy, setChoiceBusy] = useState<'done' | 'recover' | null>(null);
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

  const runResolve = async (opts: { scanId?: number; recovered: boolean }) => {
    await dispatch({ type: 'petTag/resolve', petId: pet.id, scanId: opts.scanId, recovered: opts.recovered });
    await load();
    toast.success(opts.recovered ? `Glad ${pet.name} is home!` : 'Marked as done');
  };

  const markDone = async (id: number) => {
    if (isLost) {
      setResolveChoiceScanId(id);
      return;
    }
    setBusyId(id);
    try {
      await runResolve({ scanId: id, recovered: false });
    } catch (err) {
      toast.error((err as Error)?.message || 'Could not update the message.');
    } finally {
      setBusyId(null);
    }
  };

  const chooseResolution = async (recovered: boolean) => {
    if (resolveChoiceScanId === null) return;
    setChoiceBusy(recovered ? 'recover' : 'done');
    try {
      await runResolve({ scanId: resolveChoiceScanId, recovered });
      setResolveChoiceScanId(null);
    } catch (err) {
      toast.error((err as Error)?.message || 'Could not update the message.');
    } finally {
      setChoiceBusy(null);
    }
  };

  const reports = data?.found_reports ?? [];
  const focused = focusedScanId !== null ? reports.find((r) => r.scan_id === focusedScanId) ?? null : null;
  const rest = focused ? reports.filter((r) => r.scan_id !== focused.scan_id) : reports;
  const openCount = reports.filter((r) => r.status !== 'resolved').length;

  const renderCard = (r: ApiPetTagFoundReport) => {
    const pill = STATUS_PILL[r.status];
    const hasCoords = r.latitude !== null && r.longitude !== null;
    const mapsUrl = hasCoords ? `https://www.google.com/maps?q=${r.latitude},${r.longitude}` : null;
    return (
      <div key={r.scan_id} className="rs-card rs-stack" style={{ alignItems: 'stretch' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span className="rs-row__title">
            {r.from_signed_in_resident ? 'A neighbour' : 'Someone'} · {fmtDateTime(fromServer(r.created_at))}
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

        {r.photo_url ? (
          <img
            src={r.photo_url}
            alt={`Photo from the person who found ${pet.name}`}
            style={{ maxWidth: '100%', borderRadius: 12 }}
          />
        ) : null}

        {r.finder_phone ? (
          <p className="rs-sub" style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <Phone size={15} aria-hidden="true" />
            <a href={`tel:${r.finder_phone}`}>{r.finder_phone}</a>
            <span className="rs-meta">· meet in a public place or at the guardhouse</span>
          </p>
        ) : r.status === 'resolved' ? (
          <p className="rs-meta">Any shared finder phone number was cleared for privacy.</p>
        ) : r.phone_shared ? (
          <p className="rs-meta">The finder shared a phone number with the owner.</p>
        ) : null}

        {r.status === 'resolved' ? (
          <Callout tone="sage" icon={CircleCheck} title="Done">
            {isLost
              ? `This scan message is marked as done, and ${pet.name} is still marked Lost.`
              : `This scan message is marked as done and reflects as Done on ${pet.name}’s profile.`}
          </Callout>
        ) : owner ? (
          <Button
            variant="primary"
            block
            icon={Check}
            loading={busyId === r.scan_id}
            onClick={() => { void markDone(r.scan_id); }}
          >
            Mark as done
          </Button>
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

          {owner && isLost ? (
            <Button variant="primary" block icon={House} onClick={() => setConfirmHome(true)}>
              {pet.name} is back home (Mark as recovered)
            </Button>
          ) : owner && openCount > 1 ? (
            <Button variant="secondary" block icon={House} onClick={() => setConfirmHome(true)}>
              Mark all messages as done
            </Button>
          ) : null}

          <LinkButton variant="secondary" block to={residentPath(petProfilePath)}>
            Open {pet.name}’s profile
          </LinkButton>
        </div>
      )}

      {resolveChoiceScanId !== null ? (
        <Sheet
          title={`Is ${pet.name} back home?`}
          description={`${pet.name} is currently marked Lost. Choose whether this QR scan brought ${pet.name} safely home or if you are just clearing this sighting message.`}
          dismissible={choiceBusy === null}
          onClose={() => { if (choiceBusy === null) setResolveChoiceScanId(null); }}
        >
          <div className="rs-stack-sm">
            <Button
              variant="primary"
              block
              icon={House}
              loading={choiceBusy === 'recover'}
              disabled={choiceBusy !== null}
              onClick={() => { void chooseResolution(true); }}
            >
              Yes, {pet.name} is back home (Mark as recovered)
            </Button>
            <Button
              variant="secondary"
              block
              icon={Check}
              loading={choiceBusy === 'done'}
              disabled={choiceBusy !== null}
              onClick={() => { void chooseResolution(false); }}
            >
              No, still missing (Just mark scan done)
            </Button>
            <p className="rs-meta">
              Marking as recovered marks QR scan messages done, deletes shared finder phone numbers, closes any open Lost Pet notice and report, and sets {pet.name} back to Active.
            </p>
          </div>
        </Sheet>
      ) : null}

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
