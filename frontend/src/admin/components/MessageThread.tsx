import { useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { fmtDate, fmtTime } from '../../preview/lib/format';

export interface ThreadMessageItem {
  id: string | number;
  kind: 'message' | 'system' | string;
  mine: boolean;
  senderName?: string | null;
  label: string;
  at: string;
  body: string;
  deliveryStatus?: 'sent' | 'delivered' | 'read' | string | null;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function isStaffRole(label: string): boolean {
  return /leader|admin|staff|officer/i.test(label);
}

function dayKey(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDayLabel(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fmtDate(iso);
  const now = new Date();
  const todayKey = dayKey(now.toISOString());
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yestKey = dayKey(yesterday.toISOString());
  const k = dayKey(iso);
  if (k === todayKey) return 'Today';
  if (k === yestKey) return 'Yesterday';
  return fmtDate(iso);
}

/**
 * Message text with in-app links made clickable: a path that starts with `linkPrefix` (for example a warning letter or an ownership
 * verification page in the resident app) becomes a link. Nothing else is interpreted; the text stays plain.
 */
function withLinks(body: string, linkPrefix: string | undefined, mine: boolean): ReactNode {
  if (!linkPrefix) return body;
  const esc = linkPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(${esc}/[A-Za-z0-9/_-]+)`, 'g');
  const parts = body.split(re);
  if (parts.length === 1) return body;
  return parts.map((part, i) => (i % 2 === 1 ? (
    <Link key={i} to={part} className={`break-words [overflow-wrap:anywhere] font-semibold underline ${mine ? 'text-white' : 'text-[#b45309]'}`}>
      {/\/warnings\//.test(part)
        ? 'Open the warning letter'
        : /\/ownership\//.test(part)
          ? 'Review and respond'
          : /\/reports\/([A-Za-z0-9_-]+)/.test(part)
            ? `View report (${part.match(/\/reports\/([A-Za-z0-9_-]+)/)?.[1] ?? 'details'})`
            : part}
    </Link>
  ) : part));
}

export function MessageThread({
  messages,
  maxHeightClass = '',
  emptyText = 'No messages yet.',
  className = '',
  linkPrefix,
}: {
  messages: ThreadMessageItem[];
  maxHeightClass?: string;
  emptyText?: string;
  className?: string;
  /** Paths under this prefix in a message become links (the resident app passes its own base). */
  linkPrefix?: string;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);

  useEffect(() => {
    const count = messages.length;
    if (count > 0) {
      bottomRef.current?.scrollIntoView({
        behavior: prevCountRef.current === 0 ? 'auto' : 'smooth',
        block: 'end',
      });
    }
    prevCountRef.current = count;
  }, [messages.length]);

  let lastDay = '';

  return (
    <div
      className={`min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-[#faf6f0] px-3 py-4 sm:px-4 ${maxHeightClass} ${className}`}
      aria-label="Conversation messages"
      aria-live="polite"
    >
      {messages.length === 0 ? (
        <div className="flex h-full min-h-[12rem] items-center justify-center px-4 text-center">
          <p className="m-0 max-w-xs text-sm text-[#78716c]">{emptyText}</p>
        </div>
      ) : (
        <ol className="m-0 flex min-w-0 list-none flex-col gap-3 p-0">
          {messages.map((m) => {
            const currentDay = dayKey(m.at);
            const showDateSeparator = Boolean(currentDay && currentDay !== lastDay);
            if (currentDay) lastDay = currentDay;

            const dateSeparator = showDateSeparator ? (
              <li key={`day-${currentDay}-${m.id}`} className="my-1 flex justify-center">
                <span className="rounded-full bg-[#ebe5dc] px-3 py-0.5 text-[11px] font-medium text-[#57534e]">
                  {formatDayLabel(m.at)}
                </span>
              </li>
            ) : null;

            if (m.kind === 'system') {
              return (
                <div key={m.id} className="contents">
                  {dateSeparator}
                  <li className="my-1 flex min-w-0 flex-col items-center text-center">
                    <span className="inline-block max-w-[88%] break-words [overflow-wrap:anywhere] rounded-full border border-[#e7e2da] bg-white/90 px-3 py-1 text-xs text-[#78716c]">
                      {m.body}
                    </span>
                    {m.at ? (
                      <span className="mt-1 text-[11px] text-[#78716c]">{fmtTime(m.at)}</span>
                    ) : null}
                  </li>
                </div>
              );
            }

            const displayName = m.mine ? 'You' : (m.senderName?.trim() || m.label);
            const staff = isStaffRole(m.label);
            const initials = initialsOf(m.mine ? (m.senderName?.trim() || 'You') : displayName);

            return (
              <div key={m.id} className="contents">
                {dateSeparator}
                <li className={`flex min-w-0 items-end gap-2 ${m.mine ? 'flex-row-reverse' : 'flex-row'}`}>
                  {!m.mine ? (
                    <div
                      aria-hidden="true"
                      title={`${displayName} (${m.label})`}
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold shadow-xs ${
                        staff
                          ? 'bg-[#7c2d12] text-white'
                          : 'border border-[#d6cfc7] bg-[#e7e2da] text-[#292524]'
                      }`}
                    >
                      {initials}
                    </div>
                  ) : null}

                  <div className={`flex min-w-0 max-w-[82%] flex-col sm:max-w-[72%] ${m.mine ? 'items-end' : 'items-start'}`}>
                    {!m.mine ? (
                      <div className="mb-1 flex max-w-full flex-wrap items-center gap-1.5 px-1 text-[11px]">
                        <span className="font-semibold text-[#292524]">{displayName}</span>
                        {m.label ? (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-[#ebe5dc] px-1.5 py-0.5 text-[10px] font-medium text-[#57534e]">
                            {staff ? <ShieldCheck size={10} aria-hidden="true" /> : null}
                            {m.label}
                          </span>
                        ) : null}
                      </div>
                    ) : null}

                    <div
                      className={`max-w-full min-w-0 rounded-2xl px-3.5 py-2 text-sm leading-relaxed shadow-xs ${
                        m.mine
                          ? 'rounded-br-sm bg-[#b45309] text-white'
                          : 'rounded-bl-sm border border-[#e2dad0] bg-[#ede8df] text-[#1c1917]'
                      }`}
                    >
                      <p className="m-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{withLinks(m.body, linkPrefix, m.mine)}</p>
                    </div>

                    {m.at ? (
                      <span className="mt-1 px-1 text-[11px] text-[#78716c]">
                        {fmtTime(m.at)}
                        {m.mine && m.deliveryStatus
                          ? ` · ${
                              m.deliveryStatus === 'read'
                                ? 'Read'
                                : m.deliveryStatus === 'delivered'
                                  ? 'Delivered'
                                  : 'Sent'
                            }`
                          : ''}
                      </span>
                    ) : null}
                  </div>
                </li>
              </div>
            );
          })}
        </ol>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
