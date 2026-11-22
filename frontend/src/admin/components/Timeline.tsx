import type { ReactNode } from 'react';
import { Calendar, ArrowRight, type LucideIcon } from 'lucide-react';
import type { TimelineEvent } from '../data/types';
import { cx } from '../../preview/lib/cx';
import { addDays, fmtDate, fmtDateTime, fmtTime, relative, sameDay } from '../../preview/lib/format';
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

function dateGroupKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'unknown';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dateGroupHeading(iso: string, now: Date): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Date not recorded';
  const formatted = fmtDate(iso);
  if (sameDay(d, now)) return `Today · ${formatted}`;
  if (sameDay(d, addDays(now, -1))) return `Yesterday · ${formatted}`;
  return formatted;
}

/** Audit trail lines grouped by calendar date: who did what, exact date & clock time, and before/after changes. */
export function EventTimeline({ events, now, label = 'Case history' }: { events: TimelineEvent[]; now: Date; label?: string }) {
  const groups: { key: string; heading: string; events: TimelineEvent[] }[] = [];
  const byKey = new Map<string, { key: string; heading: string; events: TimelineEvent[] }>();

  for (const ev of events) {
    const key = dateGroupKey(ev.at);
    let group = byKey.get(key);
    if (!group) {
      group = { key, heading: dateGroupHeading(ev.at, now), events: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.events.push(ev);
  }

  return (
    <div className="flex flex-col gap-6" aria-label={label}>
      {groups.map((g) => (
        <section key={g.key} aria-label={g.heading} className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2 border-b border-[var(--sa-line-soft)] pb-1.5">
            <h3 className="m-0 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--sa-ink-2)]">
              <Calendar size={13} aria-hidden="true" />
              <span>{g.heading}</span>
            </h3>
            <span className="sa-meta text-xs">{g.events.length} {g.events.length === 1 ? 'event' : 'events'}</span>
          </div>
          <Timeline
            label={`${label} (${g.heading})`}
            items={g.events.map((e) => {
              const { icon, tone } = EVENT_ICON[e.kind];
              const validDate = !Number.isNaN(new Date(e.at).getTime());
              const rel = validDate ? relative(e.at, now) : '';
              return {
                id: e.id,
                icon,
                tone,
                title: e.title,
                meta: (
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span>{e.actor}</span>
                    <span aria-hidden="true">·</span>
                    <time dateTime={e.at}>
                      {validDate ? `${fmtDate(e.at)} · ${fmtTime(e.at)}` : 'Timestamp not recorded'}
                    </time>
                    {rel && rel !== fmtDate(e.at) && rel !== fmtDateTime(e.at) ? (
                      <span className="sa-text-3">({rel})</span>
                    ) : null}
                  </span>
                ),
                body:
                  (e.changes && e.changes.length > 0) || e.detail ? (
                    <div className="flex flex-col gap-2">
                      {e.changes && e.changes.length > 0 ? (
                        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
                          {e.changes.map((ch, idx) => (
                            <li
                              key={`${ch.field}-${idx}`}
                              className="inline-flex flex-wrap items-center gap-1.5 rounded-md border border-[var(--sa-line)] bg-[var(--sa-sand)]/55 px-2.5 py-1 text-xs"
                            >
                              <span className="font-semibold text-[var(--sa-ink)]">{ch.field}:</span>
                              <span className={ch.before ? 'text-[var(--sa-ink-2)]' : 'italic text-[var(--sa-ink-3)]'}>
                                {ch.before ?? 'Previous value not recorded'}
                              </span>
                              <ArrowRight size={12} aria-hidden="true" className="text-[var(--sa-ink-3)]" />
                              <span className="font-semibold text-[var(--sa-ink)]">{ch.after}</span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {e.detail ? <p className="sa-small sa-text-2 m-0 whitespace-pre-line">{e.detail}</p> : null}
                    </div>
                  ) : undefined,
              };
            })}
          />
        </section>
      ))}
    </div>
  );
}
