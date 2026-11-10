import { useParams } from 'react-router-dom';
import { Footprints } from 'lucide-react';
import { LocationMapPreview } from '../../../preview/map/LocationMapPreview';
import { MapLegend, type KeyKind } from '../../../preview/map/MapLegend';
import { SightingCard } from '../../components/Cards';
import { Screen } from '../../components/Screen';
import { EmptyState, ErrorState, LinkButton, ListSkeleton, NotFoundState } from '../../components/ui';
import { residentPath } from '../../config';
import { useResidentData } from '../../data/context';
import { noticeById, reportById } from '../../data/selectors';
import { useNow } from '../../lib/hooks';
import { useLoadNotice } from '../../lib/useLoadNotice';
import { sightingMap } from '../../lib/location';

/**
 * R20 — Everything reported about a lost pet or a found animal, newest first, with a map. People are never named. Each
 * sighting is a report from a person at the time shown, so this is a history and never live tracking; the screen says so.
 *
 * Precision depends on the viewer: the owner of the notice sees exact markers, everyone else sees rounded general areas
 * (a neighbour still sees their own sightings exactly). A sighting without coordinates is listed in words and not plotted.
 */
export default function SightingHistoryPage() {
  const { state } = useResidentData();
  const now = useNow();
  const { noticeId } = useParams();
  const notice = noticeById(state, noticeId);
  const detail = useLoadNotice(noticeId);
  if (detail.status === 'idle' || detail.status === 'loading') return <Screen title="Sightings" back={noticeId ? `/community/${noticeId}` : '/community'}><ListSkeleton rows={3} /></Screen>;
  if (detail.status === 'error') return <Screen title="Sightings" back="/community"><ErrorState onRetry={detail.retry}>{detail.error}</ErrorState></Screen>;
  if (!notice || notice.type === 'safety_advisory') return <Screen title="Sightings" back="/community"><NotFoundState what="notice" to="/community" label="Go to Community" /></Screen>;

  const sightings = [...notice.sightings].sort((a, b) => b.observedAt.localeCompare(a.observedAt));
  const active = notice.status === 'active';
  const lost = notice.type === 'lost_pet';
  const subject = lost ? 'this pet' : 'this animal';
  const add = notice.mine ? 'Add a sighting someone told me about' : `I saw ${subject}`;

  const map = sightingMap(notice, reportById(state, notice.reportId));
  const hasMap = Boolean(map.pin) || map.areas.length > 0 || map.numbered.length > 0;
  const rounded = map.numbered.some((p) => p.general);
  const unplotted = sightings.length - map.plotted.size;
  const legend: { kind: KeyKind; label: string }[] = [];
  const what = lost ? 'last seen' : 'found';
  if (map.pin) legend.push({ kind: 'pin', label: lost ? 'Last seen' : 'Found here' });
  if (map.numbered.length > 0) legend.push({ kind: 'dot', label: 'Reported sighting (oldest is 1)' });
  if (map.numbered.some((p) => p.latest)) legend.push({ kind: 'latest', label: 'Most recent' });
  // A circle means "somewhere in here": the place it was last seen and/or the sightings, rounded for neighbours.
  if (map.areas.length > 0 || rounded) {
    legend.push({ kind: 'area', label: map.areas.length > 0 && rounded ? `General areas (rounded): where it was ${what}, and the sightings` : map.areas.length > 0 ? `General area where it was ${what}` : 'General area (rounded)' });
  }
  legend.push({ kind: 'outline', label: 'Approximate subdivision outline' });

  return (
    <Screen
      title="Sightings"
      subtitle={notice.title}
      back={`/community/${notice.id}`}
      footer={active ? (
        <LinkButton variant={notice.mine ? 'secondary' : 'primary'} block icon={Footprints} to={residentPath(`/community/${notice.id}/sighting`)}>{add}</LinkButton>
      ) : undefined}
    >
      {sightings.length === 0 && !hasMap ? (
        <EmptyState icon={Footprints} title="No sightings yet" action={active && !notice.mine ? <LinkButton variant="primary" to={residentPath(`/community/${notice.id}/sighting`)}>{add}</LinkButton> : undefined}>
          {notice.mine ? `When a neighbour reports seeing ${lost ? 'your pet' : 'the animal you found'}, it appears here and you get a notification.` : `Be the first to report if you see ${subject}.`}
        </EmptyState>
      ) : (
        <>
          {hasMap ? (
            <div>
              <LocationMapPreview
                pin={map.pin}
                areas={map.areas}
                numbered={map.numbered}
                height={240}
                interactive
                label={`Map of the ${lost ? 'last seen place and ' : ''}reported sightings, on the approximate subdivision outline`}
              />
              <MapLegend items={legend} />
              <p className="rs-hint">
                {notice.mine ? 'You see the exact spots. Neighbours see only general areas.' : 'Neighbours see general areas, not exact spots. The owner and subdivision administrators see the exact spots.'}
                {unplotted > 0 ? ` ${unplotted} ${unplotted === 1 ? 'sighting has' : 'sightings have'} no pin and ${unplotted === 1 ? 'is' : 'are'} described in words only.` : ''}
              </p>
            </div>
          ) : null}
          {sightings.length > 0 ? (
            <>
              <div className="rs-stack-sm">
                <p className="rs-sub">{sightings.length} {sightings.length === 1 ? 'sighting' : 'sightings'}. The most recent is at the top.</p>
                <p className="rs-hint">Each one is a report from a person at the time shown. It is not live tracking and does not show where the animal is now.</p>
              </div>
              <ol className="rs-sightings" aria-label="Sightings, newest first">
                {sightings.map((s, i) => <SightingCard key={s.id} sighting={s} now={now} latest={i === 0} number={map.numberOf.get(s.id)} onMap={map.plotted.has(s.id)} />)}
              </ol>
            </>
          ) : null}
        </>
      )}
    </Screen>
  );
}
