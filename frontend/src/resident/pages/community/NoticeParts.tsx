import { fmtDate } from '../../../preview/lib/format';
import { LocationMapPreview } from '../../../preview/map/LocationMapPreview';
import { MapLegend } from '../../../preview/map/MapLegend';
import { Pill } from '../../components/ui';
import { NOTICE_TYPES } from '../../data/constants';
import { noticeEndedLabel } from '../../data/selectors';
import type { Notice } from '../../data/types';

/**
 * The only map a community notice may show: a general area (a rounded position with a circle around it), never the exact
 * spot. The exact spot stays on the owner's own report, visible to them and to administrators.
 */
export function GeneralAreaMap({ notice, what }: { notice: Notice; what: 'last seen' | 'found' }) {
  if (!notice.approx) return null;
  return (
    <figure className="rs-figure">
      <LocationMapPreview areas={[notice.approx]} height={170} label={`Map of the general area where it was ${what}: ${notice.area}`} />
      <MapLegend items={[{ kind: 'area', label: `General area where it was ${what}` }, { kind: 'outline', label: 'Approximate subdivision outline' }]} />
      <figcaption className="rs-hint">A general area only. The exact spot is shown only to {notice.mine ? 'you' : 'the person who reported it'} and subdivision administrators.</figcaption>
    </figure>
  );
}

export function NoticeHead({ notice }: { notice: Notice }) {
  const ended = noticeEndedLabel(notice);
  return (
    <header className="rs-stack-sm">
      <p className="rs-card__kicker">
        {NOTICE_TYPES[notice.type].label}
        {notice.mine ? <Pill tone="brand">Your notice</Pill> : null}
        {notice.status !== 'active' ? <Pill tone={ended === 'Pet is home' || ended === 'Recovered' ? 'sage' : 'neutral'}>{ended}</Pill> : null}
      </p>
      <h2 className="rs-title rs-title--sm">{notice.title}</h2>
      <p className="rs-meta">{notice.area} · published {fmtDate(notice.publishedAt)}</p>
    </header>
  );
}
