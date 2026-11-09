import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { ChevronRight, CircleAlert, CircleCheck, CloudOff, Info, RefreshCw, SearchX, TriangleAlert, type LucideIcon } from 'lucide-react';
import { cx } from '../../preview/lib/cx';
import { initials, relative, fmtDateTime } from '../../preview/lib/format';
import { residentPath } from '../config';
import { CLAIM_STATUS, STATUS, type Tone } from '../data/constants';
import type { CaseStatus, ClaimStatus, Media, ReportUpdate } from '../data/types';
import { UPDATE_ICON } from './icons';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link';
interface Look { variant?: Variant; block?: boolean; size?: 'md' | 'sm'; icon?: LucideIcon }
const look = ({ variant = 'secondary', block, size = 'md' }: Look, extra?: string) => cx('rs-btn', `rs-btn--${variant}`, block && 'rs-btn--block', size === 'sm' && 'rs-btn--sm', extra);

export function Button({ variant, block, size, icon: Icon, loading = false, className, children, disabled, type = 'button', ...rest }: Look & ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button type={type} className={look({ variant, block, size }, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <span className="rs-spinner" aria-hidden="true" /> : Icon ? <Icon size={18} strokeWidth={1.9} aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export function LinkButton({ variant, block, size, icon: Icon, className, children, ...rest }: Look & LinkProps & { children?: ReactNode }) {
  return (
    <Link className={look({ variant, block, size }, className)} {...rest}>
      {Icon ? <Icon size={18} strokeWidth={1.9} aria-hidden="true" /> : null}
      {children}
    </Link>
  );
}

export function IconButton({ label, icon: Icon, className, ...rest }: { label: string; icon: LucideIcon } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={cx('rs-iconbtn', className)} aria-label={label} title={label} {...rest}><Icon size={21} strokeWidth={1.9} aria-hidden="true" /></button>;
}

export const Pill = ({ tone = 'neutral', dot, children }: { tone?: Tone; dot?: boolean; children: ReactNode }) => (
  <span className={cx('rs-pill', tone !== 'neutral' && `rs-pill--${tone}`)}>{dot ? <span className="rs-pill__dot" aria-hidden="true" /> : null}{children}</span>
);
export const StatusPill = ({ status }: { status: CaseStatus }) => <Pill tone={STATUS[status].tone} dot>{STATUS[status].label}</Pill>;
export const ClaimPill = ({ status }: { status: ClaimStatus }) => <Pill tone={CLAIM_STATUS[status].tone} dot>{CLAIM_STATUS[status].label}</Pill>;

const CALLOUT_ICON: Record<'info' | 'amber' | 'red' | 'sage', LucideIcon> = { info: Info, amber: TriangleAlert, red: CircleAlert, sage: CircleCheck };
export function Callout({ tone = 'info', icon, title, children, className }: { tone?: 'info' | 'amber' | 'red' | 'sage'; icon?: LucideIcon; title?: string; children: ReactNode; className?: string }) {
  const Icon = icon ?? CALLOUT_ICON[tone];
  return (
    <div className={cx('rs-callout', tone !== 'info' && `rs-callout--${tone}`, className)} role={tone === 'red' ? 'alert' : undefined}>
      <Icon size={18} aria-hidden="true" />
      <div className="min-w-0">{title ? <strong>{title} </strong> : null}{children}</div>
    </div>
  );
}
export const FormError = ({ message }: { message: string }) => <Callout tone="red">{message}</Callout>;

/** `tone="sage"` is for a success (verified, saved, recovered); the default is the quiet neutral used for empty and error states. */
export function EmptyState({ icon: Icon, title, children, action, tone }: { icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode; tone?: 'sage' }) {
  return (
    <div className="rs-empty">
      <span className={cx('rs-empty__icon', tone === 'sage' && 'rs-empty__icon--sage')}><Icon size={22} aria-hidden="true" /></span>
      <p className="rs-empty__title">{title}</p>
      {children ? <p className="rs-empty__text">{children}</p> : null}
      {action ? <div className="rs-empty__action">{action}</div> : null}
    </div>
  );
}

/** A load or save that failed for a reason the resident can act on. */
export function ErrorState({ onRetry, title = 'We couldn’t load this', children }: { onRetry?: () => void; title?: string; children?: ReactNode }) {
  return (
    <EmptyState icon={CloudOff} title={title} action={onRetry ? <Button variant="primary" icon={RefreshCw} onClick={onRetry}>Try again</Button> : undefined}>
      {children ?? 'Check your connection and try again. Nothing you already submitted was lost.'}
    </EmptyState>
  );
}

/** A link led somewhere that does not exist (or no longer does). */
export function NotFoundState({ what = 'page', to = '/home', label = 'Go to Home' }: { what?: string; to?: string; label?: string }) {
  return (
    <EmptyState icon={SearchX} title={`We can’t find that ${what}`} action={<LinkButton variant="primary" to={residentPath(to)}>{label}</LinkButton>}>
      It may have been removed, or the link may be out of date.
    </EmptyState>
  );
}

export const Skeleton = ({ h = 16, w = '100%', className }: { h?: number; w?: number | string; className?: string }) => <div className={cx('rs-skel', className)} style={{ height: h, width: w }} aria-hidden="true" />;

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading" className="rs-skelstack">
      <Skeleton h={26} w="55%" />
      {Array.from({ length: rows }, (_, i) => <div key={i} className="rs-skelrow"><Skeleton h={40} w={40} /><div className="rs-skelrow__text"><Skeleton h={14} w="70%" /><Skeleton h={12} w="45%" /></div></div>)}
    </div>
  );
}

export function Section({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('rs-section', className)}>
      {title || action ? <div className="rs-section__head">{title ? <h2 className="rs-h2">{title}</h2> : <span />}{action}</div> : null}
      {children}
    </section>
  );
}

/** A tappable list row (>= 56px). Renders a link when `to` is given, otherwise a button. */
export function Row({ to, onClick, icon: Icon, title, meta, trailing, danger }: { to?: string; onClick?: () => void; icon?: LucideIcon; title: ReactNode; meta?: ReactNode; trailing?: ReactNode; danger?: boolean }) {
  const inner = (
    <>
      {Icon ? <span className="rs-row__icon"><Icon size={19} aria-hidden="true" /></span> : null}
      <span className="rs-row__text"><span className="rs-row__title">{title}</span>{meta ? <span className="rs-row__meta">{meta}</span> : null}</span>
      {trailing ?? (danger ? null : <ChevronRight size={18} className="rs-row__chev" aria-hidden="true" />)}
    </>
  );
  const className = cx('rs-row', danger && 'rs-row--danger');
  return to ? <Link to={to} className={className}>{inner}</Link> : <button type="button" onClick={onClick} className={className}>{inner}</button>;
}

export const Avatar = ({ name, size = 'md' }: { name: string; size?: 'md' | 'lg' }) => <span className={cx('rs-avatar', size === 'lg' && 'rs-avatar--lg')} aria-hidden="true">{initials(name)}</span>;

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; count?: number }[]; label: string }) {
  return (
    <div className="rs-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className="rs-seg__btn" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}{o.count !== undefined ? <span className="rs-seg__count">{o.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

/** Resident-visible updates, newest first. Internal administrative notes never reach this component. */
export function UpdateTimeline({ updates, now, label = 'Updates' }: { updates: ReportUpdate[]; now: Date; label?: string }) {
  return (
    <ol className="rs-timeline" aria-label={label}>
      {updates.map((u) => {
        const Icon = UPDATE_ICON[u.kind];
        return (
          <li key={u.id} className="rs-timeline__item">
            <span className={cx('rs-timeline__dot', `rs-timeline__dot--${u.kind}`)}><Icon size={14} aria-hidden="true" /></span>
            <div className="min-w-0">
              <p className="rs-timeline__title">{u.title}</p>
              {u.body ? <p className="rs-timeline__body">{u.body}</p> : null}
              <p className="rs-meta"><time dateTime={u.at} title={fmtDateTime(u.at)}>{relative(u.at, now)}</time></p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Evidence thumbnails. Photos picked in this tab show; anything else is a neutral placeholder. */
export function MediaThumbs({ media }: { media: Media[] }) {
  if (media.length === 0) return null;
  return (
    <ul className="rs-thumbs" aria-label="Evidence">
      {media.map((m) => (
        <li key={m.id} className="rs-thumb" title={m.name}>
          {m.url && m.kind === 'photo' ? <img src={m.url} alt={m.name} /> : <span className="rs-thumb__ph">{m.kind === 'video' ? 'Video' : 'Photo'}</span>}
        </li>
      ))}
    </ul>
  );
}
