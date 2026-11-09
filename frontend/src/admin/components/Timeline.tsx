import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { TimelineEvent } from '../data/types';
import { cx } from '../../preview/lib/cx';
import { fmtDateTime, relative } from '../../preview/lib/format';
import { EVENT_ICON } from './icons';

export interface TimelineItem {
  id: string;
  icon: LucideIcon;
  tone?: 'brand' | 'sage' | 'amber' | 'red';
  title: ReactNode;
  meta?: ReactNode;
  body?: ReactNode;
}

export function Timeline({ items, label }: { items: TimelineItem[]; label: string }) {
  return (
    <ol className="sa-timeline" aria-label={label}>
      {items.map(({ id, icon: Icon, tone, title, meta, body }) => (
        <li key={id} className="sa-tl">
          <span className={cx('sa-tl__icon', tone && `sa-tl__icon--${tone}`)}><Icon size={14} aria-hidden="true" /></span>
          <div className="min-w-0">
            <p className="sa-tl__title">{title}</p>
            {meta ? <p className="sa-tl__meta">{meta}</p> : null}
            {body ? <div className="sa-tl__body">{body}</div> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Audit trail lines: who did what and when. */
export function EventTimeline({ events, now, label = 'Case history' }: { events: TimelineEvent[]; now: Date; label?: string }) {
  return (
    <Timeline
      label={label}
      items={events.map((e) => {
        const { icon, tone } = EVENT_ICON[e.kind];
        return {
          id: e.id, icon, tone, title: e.title,
          meta: <>{e.actor} · <time dateTime={e.at} title={fmtDateTime(e.at)}>{relative(e.at, now)}</time></>,
          body: e.detail ? <p className="sa-small sa-text-2">{e.detail}</p> : undefined,
        };
      })}
    />
  );
}
