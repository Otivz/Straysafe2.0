import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Camera, ChevronRight, ImageIcon, MapPin, PawPrint } from 'lucide-react';
import { fmtDateTime, fmtDay, fmtTime, relative } from '../../preview/lib/format';
import { placePhrase } from '../../preview/lib/place';
import { residentPath } from '../config';
import { NOTICE_TYPES } from '../data/constants';
import { noticeName } from '../data/selectors';
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

const lowerFirst = (t: string) => (t ? t[0].toLowerCase() + t.slice(1) : t);

/** What the animal looks like, in a few words ("Shih Tzu · white and golden"), from what the server shared; else the notice's own words. */
function looksOf(n: Notice): string {
  const id = n.identity;
  const words = [id?.breed?.trim(), id?.color?.trim() ? lowerFirst(id.color.trim()) : ''].filter(Boolean).join(' · ');
  return words || n.description;
}

/**
 * One community notice in a list. Private reports can never appear here. A missing pet leads with its photo and its name, then what it looks
 * like, then since when and where it is missing: that is what a neighbour scans for. `kicker` names the kind of notice where kinds are mixed
 * (Home); a list of one kind (a Community tab, the directory) leaves it out.
 */
export function NoticeCard({ notice, kicker = true }: { notice: Notice; kicker?: boolean }) {
  const Icon = NOTICE_ICON[notice.type];
  const photo = notice.photoUrls?.[0];
  const lost = notice.type === 'lost_pet';
  const advisory = notice.type === 'safety_advisory';
  const at = notice.lastSeenAt ?? notice.publishedAt;
  const sightings = notice.sightingCount ?? notice.sightings.length;
  const when = advisory ? fmtDay(notice.publishedAt) : lost ? `Missing since ${fmtDay(at)}, ${fmtTime(at)}` : `Found ${fmtDay(at)}`;
  const meta = [when, notice.area, lost && sightings > 0 ? `${sightings} ${sightings === 1 ? 'sighting' : 'sightings'}` : ''].filter(Boolean).join(' · ');
  return (
    <Link to={residentPath(`/community/${notice.id}`)} className={`rs-card rs-card--link rs-card--${advisory ? 'advisory' : 'plain'}`}>
      <span className={`rs-card__icon${photo ? ' rs-card__icon--photo' : ''}`}>{photo ? <img src={photo} alt="" loading="lazy" /> : <Icon size={19} aria-hidden="true" />}</span>
      <span className="rs-card__text">
        {kicker || notice.mine ? <span className="rs-card__kicker">{kicker ? NOTICE_TYPES[notice.type].label : null}{notice.mine ? <Pill tone="brand">Your notice</Pill> : null}</span> : null}
        <span className="rs-card__title">{noticeName(notice)}</span>
        {(advisory ? notice.description : looksOf(notice)) ? <span className="rs-card__desc">{advisory ? notice.description : looksOf(notice)}</span> : null}
        <span className="rs-card__meta">{meta}</span>
      </span>
    </Link>
  );
}

/**
 * The resident's own missing pet, once, at the top of Home: whether anyone has seen it, and since when it is missing. It opens the report,
 * which is the owner's one screen for it (the notice, the sightings, the alerts and "My pet is home").
 */
export function MissingPetCard({ report, notice, now }: { report: Report; notice?: Notice; now: Date }) {
  const photo = notice?.photoUrls?.[0] ?? report.media.find((m) => m.kind === 'photo' && m.url)?.url;
  const name = report.petName?.trim() || 'Your pet';
  const count = notice ? (notice.sightingCount ?? notice.sightings.length) : 0;
  const latest = notice ? [...notice.sightings].sort((a, b) => b.observedAt.localeCompare(a.observedAt))[0] ?? notice.latestSighting : undefined;
  const seen = count === 0 ? 'No sightings yet' : `${count} ${count === 1 ? 'sighting' : 'sightings'}${latest ? `, the latest ${lowerFirst(relative(latest.observedAt, now))}` : ''}`;
  const where = report.location.label && report.location.label !== 'Pinned on the map' ? ` · ${placePhrase(report.location.label)}` : '';
  return (
    <Link to={residentPath(`/reports/${report.id}`)} className="rs-card rs-card--link rs-card--plain">
      <span className={`rs-card__icon${photo ? ' rs-card__icon--photo' : ''}`}>{photo ? <img src={photo} alt="" loading="lazy" /> : <PawPrint size={19} aria-hidden="true" />}</span>
      <span className="rs-card__text">
        <span className="rs-card__title">{name} is missing</span>
        <span className="rs-card__desc">{seen}</span>
        <span className="rs-card__meta">Since {fmtDay(report.observedAt)}, {fmtTime(report.observedAt)}{where}</span>
      </span>
      <ChevronRight size={18} className="rs-row__chev" aria-hidden="true" />
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
