import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Check, CircleCheck, ExternalLink, House, MapPin, PawPrint, Phone } from 'lucide-react';
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
import { petById } from '../../data/selectors';
import { residentApi, type ApiPetTagFoundReport, type ApiPetTagScans } from '../../live/api';

const STATUS_PILL = {
  new: { tone: 'brand', label: 'New' },
  seen_by_owner: { tone: 'amber', label: 'Open' },
  resolved: { tone: 'sage', label: 'Done' },
} as const;

/**
 * Separate owner notification page for a pet's QR tag scans (`/pets/:petId/scans` and `/pets/:petId/scans/:scanId`).
 * Shows the finder's message, embedded map pin, optional photo and phone number, and lets the owner mark each scan done.
 */
export default function PetTagScansPage() {
  const { state } = useResidentData();
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
  const markDone = async (id: number) => {
    setBusyId(id);
    try {
      await residentApi.resolvePetTagScan(numericId, id);
      await load();
      toast.success('Marked as done');
    } catch (err) {
      toast.error((err as Error)?.message || 'Could not update the message.');
    } finally {
      setBusyId(null);
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
            This scan message is marked as done and reflects as Done on {pet.name}’s profile.
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

          {owner && openCount > 1 ? (
            <Button variant="secondary" block icon={House} onClick={() => setConfirmHome(true)}>
              {pet.name} is back home (mark all done)
            </Button>
          ) : null}

          <LinkButton variant="secondary" block to={residentPath(petProfilePath)}>
            Open {pet.name}’s profile
          </LinkButton>
        </div>
      )}

      {confirmHome ? (
        <ConfirmSheet
          title={`Is ${pet.name} back home?`}
          message="Every open message from a tag scan is marked done, and any phone number a finder shared is deleted. If you reported a lost pet, close that report from its own page too."
          confirmLabel="Yes, mark all done"
          onConfirm={async () => {
            await residentApi.resolveAllPetTagScans(numericId);
            await load();
            toast.success(`Glad ${pet.name} is home!`);
          }}
          onClose={() => setConfirmHome(false)}
        />
      ) : null}
    </Screen>
  );
}
