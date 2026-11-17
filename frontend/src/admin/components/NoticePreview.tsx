import { Camera, MapPin } from 'lucide-react';
import { NOTICE_TYPES } from '../data/constants';
import type { NoticeMedia, NoticeType } from '../data/types';
import { NOTICE_ICON } from './icons';

/** How a resident sees the notice. Contains only what the admin typed: no case data, no reporter details. */
export function NoticePreview({ type, title, description, location, media, subdivision, postedBy = 'Subdivision administration' }: {
  type: NoticeType; title: string; description: string; location: string; media: NoticeMedia[]; subdivision: string; postedBy?: string;
}) {
  const Icon = NOTICE_ICON[type];
  return (
    <article className="sa-panel sa-noticecard overflow-hidden break-words" style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }} aria-label="Notice preview">
      <p className="sa-meta flex items-center gap-1.5" style={{ fontWeight: 600 }}><Icon size={14} aria-hidden="true" />{NOTICE_TYPES[type].label} · {subdivision}</p>
      <h3 className="mt-2 break-words" style={{ fontFamily: 'var(--sa-font-display)', fontSize: 18, lineHeight: '26px', fontWeight: 700, letterSpacing: '-0.012em', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{title.trim() || <span className="sa-text-3" style={{ fontWeight: 500 }}>Your title appears here</span>}</h3>
      {media.length > 0 ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {media.slice(0, 4).map((m) => (
            m.url
              ? <img key={m.id} src={m.url} alt="" className="aspect-[4/3] w-full rounded-md object-cover" />
              : <span key={m.id} className="sa-tile__art rounded-md"><Camera size={20} aria-hidden="true" /></span>
          ))}
        </div>
      ) : null}
      <p className="mt-3 whitespace-pre-line break-words" style={{ lineHeight: 1.6, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{description.trim() || <span className="sa-text-3">The description appears here.</span>}</p>
      <p className="sa-small sa-text-2 mt-3 flex items-center gap-1.5 break-words" style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}><MapPin size={14} className="shrink-0" aria-hidden="true" /><span className="min-w-0 break-words">{location.trim() || 'General location'}</span></p>
      <p className="sa-meta mt-3 border-t border-solid pt-3" style={{ borderColor: 'var(--sa-line-soft)' }}>Posted by {postedBy}</p>
    </article>
  );
}
