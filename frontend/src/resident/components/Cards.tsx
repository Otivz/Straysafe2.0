import type { ReactNode } from 'react';
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

/**
 * One community notice in a list. Private reports can never appear here. A missing pet leads with its photo and when it was last seen:
 * that is what a neighbour scans for.
 */
export function NoticeCard({ notice }: { notice: Notice }) {
  const Icon = NOTICE_ICON[notice.type];
  const photo = notice.photoUrls?.[0];
  const lost = notice.type === 'lost_pet';
  const when = lost && notice.lastSeenAt ? `Last seen ${relative(notice.lastSeenAt, new Date())}` : fmtDay(notice.publishedAt);
  return (
    <Link to={residentPath(`/community/${notice.id}`)} className={`rs-card rs-card--link rs-card--${notice.type === 'safety_advisory' ? 'advisory' : 'plain'}`}>
      <span className={`rs-card__icon${photo ? ' rs-card__icon--photo' : ''}`}>{photo ? <img src={photo} alt="" loading="lazy" /> : <Icon size={19} aria-hidden="true" />}</span>
      <span className="rs-card__text">
        <span className="rs-card__kicker">{NOTICE_TYPES[notice.type].label}{notice.mine ? <Pill tone="brand">Your notice</Pill> : null}</span>
        <span className="rs-card__title">{notice.title}</span>
        <span className="rs-card__desc">{notice.description}</span>
        <span className="rs-card__meta">{when} · {notice.area}</span>
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

/**
 * One sighting: when, where and what was seen. A sighting is a report from a person, never live tracking, and nobody is named.
 * A possible-recovery report ("I may have this pet safely with me") is marked as such and may carry where the pet is being kept (private:
 * the server only sends that to the owner, the Leader and the person who wrote it). `children` is what belongs with this one report (the
 * conversation about it).
 */
export function SightingCard({ sighting, now, latest = false, number, onMap, children }: { sighting: Sighting; now: Date; latest?: boolean; number?: number; onMap?: boolean; children?: ReactNode }) {
  const lead = sighting.kind === 'secured';
  return (
    <li className={`rs-sighting${lead ? ' rs-sighting--lead' : ''}`}>
      <div className="rs-sighting__head">
        <span className="rs-sighting__time">
          {number ? <span className="rs-sighting__num" aria-label={`Sighting ${number}`}>{number}</span> : null}
          <time dateTime={sighting.observedAt}>{relative(sighting.observedAt, now)}</time>
          {lead ? <Pill tone="amber">Possible recovery</Pill> : latest ? <Pill tone="brand">Latest</Pill> : null}
        </span>
        <span className="rs-meta">{sighting.by === 'you' ? 'You' : 'A neighbour'}</span>
      </div>
      <p className="rs-meta">Seen {fmtDateTime(sighting.observedAt)} · reported {fmtDateTime(sighting.submittedAt)}</p>
      <p className="rs-sighting__place"><MapPin size={15} aria-hidden="true" />{sighting.location.label}</p>
      {onMap === false ? <p className="rs-meta">Not on the map: no pin was placed, so this is described in words only.</p> : null}
      <p>{sighting.description}</p>
      {lead && sighting.careNote ? <p className="rs-sighting__care"><strong>Where it is being kept:</strong> {sighting.careNote}</p> : null}
      {sighting.onBehalf || sighting.photos > 0 ? (
        <p className="rs-meta">
          {sighting.onBehalf ? 'Told to the reporter by someone else' : null}
          {sighting.photos > 0 ? <span className="rs-sighting__photo"><Camera size={13} aria-hidden="true" />{sighting.photos} {sighting.photos === 1 ? 'photo' : 'photos'}</span> : null}
        </p>
      ) : null}
      {sighting.review ? <p className="rs-meta">{sighting.review.status === 'verified' ? 'Checked by the Subdivision Leader.' : 'Reviewed by the Subdivision Leader: not a match.'}{sighting.review.at ? ` ${fmtDateTime(sighting.review.at)}.` : ''}{sighting.review.note ? ` ${sighting.review.note}` : ''}</p> : <p className="rs-meta">Not verified.</p>}
      {children}
    </li>
  );
}
