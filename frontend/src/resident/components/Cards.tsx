import { Link } from 'react-router-dom';
import { Camera, ChevronRight, ImageIcon, MapPin } from 'lucide-react';
import { fmtDateTime, fmtDay, relative } from '../../preview/lib/format';
import { residentPath } from '../config';
import { NOTICE_TYPES } from '../data/constants';
import type { Media, Notice, Report, Sighting } from '../data/types';
import { CATEGORY_ICON, NOTICE_ICON } from './icons';
import { MediaThumbs, Pill, StatusPill } from './ui';

/** One report in a list: what it is, where it stands, and when it last changed. */
export function ReportCard({ report, now }: { report: Report; now: Date }) {
  const Icon = CATEGORY_ICON[report.category];
  return (
    <Link to={residentPath(`/reports/${report.id}`)} className="rs-card rs-card--link">
      <span className="rs-card__icon"><Icon size={19} aria-hidden="true" /></span>
      <span className="rs-card__text">
        <span className="rs-card__title">{report.title}</span>
        <span className="rs-card__meta"><span className="sa-ref">{report.id}</span> · updated {relative(report.updatedAt, now)}</span>
        <span className="rs-card__row">
          <StatusPill status={report.status} />
          <span className="rs-meta">{report.visibility === 'private' ? 'Private' : report.visibility === 'pending_review' ? 'Awaiting review' : 'Visible to neighbours'}</span>
        </span>
      </span>
      <ChevronRight size={18} className="rs-row__chev" aria-hidden="true" />
    </Link>
  );
}

/** One community notice in a feed. Private reports can never appear here. */
export function NoticeCard({ notice }: { notice: Notice }) {
  const Icon = NOTICE_ICON[notice.type];
  return (
    <Link to={residentPath(`/community/${notice.id}`)} className={`rs-card rs-card--link rs-card--${notice.type === 'safety_advisory' ? 'advisory' : 'plain'}`}>
      <span className="rs-card__icon"><Icon size={19} aria-hidden="true" /></span>
      <span className="rs-card__text">
        <span className="rs-card__kicker">{NOTICE_TYPES[notice.type].label}{notice.mine ? <Pill tone="brand">Your notice</Pill> : null}</span>
        <span className="rs-card__title">{notice.title}</span>
        <span className="rs-card__desc">{notice.description}</span>
        <span className="rs-card__meta">{notice.area} · {fmtDay(notice.publishedAt)}</span>
      </span>
    </Link>
  );
}

/** Photos on a notice. The stored photo when the server has one, then thumbnails this tab has; otherwise a clearly labelled sample placeholder. */
export function PhotoStrip({ count, media, urls }: { count: number; media?: Media[]; urls?: string[] }) {
  if (urls && urls.length > 0) return <MediaThumbs media={urls.map((url, i) => ({ id: `u${i}`, name: `Photo ${i + 1}`, kind: 'photo' as const, size: 0, url }))} />;
  if (media && media.some((m) => m.url)) return <MediaThumbs media={media} />;
  if (count === 0) return <p className="rs-meta">No photo was added.</p>;
  return (
    <ul className="rs-thumbs" aria-label="Photos">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="rs-thumb rs-thumb--lg"><span className="rs-thumb__ph"><ImageIcon size={22} aria-hidden="true" />Sample photo {i + 1}</span></li>
      ))}
    </ul>
  );
}

/** One sighting: when, where and what was seen. A sighting is a report from a person, never live tracking, and nobody is named. */
export function SightingCard({ sighting, now, latest = false, number, onMap }: { sighting: Sighting; now: Date; latest?: boolean; number?: number; onMap?: boolean }) {
  return (
    <li className="rs-sighting">
      <div className="rs-sighting__head">
        <span className="rs-sighting__time">
          {number ? <span className="rs-sighting__num" aria-label={`Sighting ${number}`}>{number}</span> : null}
          <time dateTime={sighting.observedAt}>{relative(sighting.observedAt, now)}</time>{latest ? <Pill tone="brand">Latest</Pill> : null}
        </span>
        <span className="rs-meta">{sighting.by === 'you' ? 'You' : 'A neighbour'}</span>
      </div>
      <p className="rs-meta">{fmtDateTime(sighting.observedAt)}</p>
      <p className="rs-sighting__place"><MapPin size={15} aria-hidden="true" />{sighting.location.label}</p>
      {onMap === false ? <p className="rs-meta">Not on the map: no pin was placed, so this is described in words only.</p> : null}
      <p>{sighting.description}</p>
      {sighting.onBehalf || sighting.photos > 0 ? (
        <p className="rs-meta">
          {sighting.onBehalf ? 'Told to the reporter by someone else' : null}
          {sighting.photos > 0 ? <span className="rs-sighting__photo"><Camera size={13} aria-hidden="true" />{sighting.photos} {sighting.photos === 1 ? 'photo' : 'photos'}</span> : null}
        </p>
      ) : null}
    </li>
  );
}
