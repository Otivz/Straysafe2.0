import { Fragment, type KeyboardEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CircleAlert, CircleCheck, Info, TriangleAlert, WifiOff, type LucideIcon } from 'lucide-react';
import { cx } from '../../preview/lib/cx';
import { initials } from '../../preview/lib/format';
import { Button } from './Button';

export function PageHeader({ title, description, actions, back }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: { to: string; label: string } }) {
  return (
    <header>
      {back ? <Link className="sa-back" to={back.to}><ArrowLeft size={15} aria-hidden="true" />{back.label}</Link> : null}
      <div className="sa-pageheader">
        <div className="min-w-0">
          <h1 className="sa-h1">{title}</h1>
          {description ? <p className="sa-pageheader__desc">{description}</p> : null}
        </div>
        {actions ? <div className="sa-pageheader__actions">{actions}</div> : null}
      </div>
    </header>
  );
}

export const Panel = ({ className, children }: { className?: string; children: ReactNode }) => <div className={cx('sa-panel', className)}>{children}</div>;

/** A titled section inside a panel. Sections are separated by hairlines instead of being nested cards. */
export function Block({ title, description, action, tight, children, className }: { title?: ReactNode; description?: ReactNode; action?: ReactNode; tight?: boolean; children: ReactNode; className?: string }) {
  return (
    <section className={cx('sa-block', tight && 'sa-block--tight', className)}>
      {title || action ? (
        <div className="sa-block__head">
          <div>
            {title ? <h2 className="sa-h2">{title}</h2> : null}
            {description ? <p className="sa-small sa-text-3">{description}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

const CALLOUT_ICON: Record<'info' | 'amber' | 'red' | 'sage', LucideIcon> = { info: Info, amber: TriangleAlert, red: CircleAlert, sage: CircleCheck };

export function Callout({ tone = 'info', title, icon, className, children }: { tone?: 'info' | 'amber' | 'red' | 'sage'; title?: string; icon?: LucideIcon; className?: string; children: ReactNode }) {
  const Icon = icon ?? CALLOUT_ICON[tone];
  return (
    <div className={cx('sa-callout', tone !== 'info' && `sa-callout--${tone}`, className)} role={tone === 'red' ? 'alert' : undefined}>
      <Icon size={17} aria-hidden="true" />
      <div className="min-w-0">{title ? <strong>{title} </strong> : null}{children}</div>
    </div>
  );
}

export const FormError = ({ message }: { message: string }) => <Callout tone="red">{message}</Callout>;

export function EmptyState({ icon: Icon, title, children, action, compact }: { icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={cx('sa-empty', compact && 'sa-empty--compact')}>
      <span className="sa-empty__icon"><Icon size={20} aria-hidden="true" /></span>
      <p className="sa-empty__title">{title}</p>
      {children ? <p className="sa-empty__text">{children}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="sa-panel">
      <EmptyState icon={WifiOff} title="We can’t reach the server" action={<Button variant="primary" onClick={onRetry}>Try again</Button>}>
        Check your connection and try again. Anything you already saved is safe.
      </EmptyState>
    </div>
  );
}

export const Skeleton = ({ h = 16, w = '100%', className }: { h?: number; w?: number | string; className?: string }) => (
  <div className={cx('sa-skel', className)} style={{ height: h, width: w }} aria-hidden="true" />
);

export function PageSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-6">
      <div className="flex flex-col gap-3"><Skeleton h={28} w={260} /><Skeleton h={16} w={420} /></div>
      <Skeleton h={84} />
      <div className="sa-panel">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="sa-skelrow">
            <Skeleton h={14} w={96} /><Skeleton h={14} className="flex-1" /><Skeleton h={14} w={70} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function Kv({ rows, wide, stack }: { rows: Array<[string, ReactNode]>; wide?: boolean; /** label above value (narrow rails) */ stack?: boolean }) {
  return (
    <dl className={cx('sa-kv', wide && 'sa-kv--wide', stack && 'sa-kv--stack')}>
      {rows.map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}
    </dl>
  );
}

export function Avatar({ name, size, brand }: { name: string; size?: 'sm' | 'lg'; brand?: boolean }) {
  return <span className={cx('sa-avatar', size === 'sm' && 'sa-avatar--sm', size === 'lg' && 'sa-avatar--lg', brand && 'sa-avatar--brand')} aria-hidden="true">{initials(name)}</span>;
}

export function Tabs<T extends string>({ items, value, onChange, label, idPrefix }: {
  items: { key: T; label: string; count?: number; alert?: boolean }[]; value: T; onChange: (key: T) => void; label: string; idPrefix: string;
}) {
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = items.findIndex((t) => t.key === value);
    const next = items[(i + (e.key === 'ArrowRight' ? 1 : items.length - 1)) % items.length];
    onChange(next.key);
    requestAnimationFrame(() => document.getElementById(`${idPrefix}-tab-${next.key}`)?.focus());
  };
  return (
    <div className="sa-tabs" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {items.map((t) => (
        <button key={t.key} type="button" role="tab" id={`${idPrefix}-tab-${t.key}`} aria-selected={value === t.key} aria-controls={`${idPrefix}-panel`} tabIndex={value === t.key ? 0 : -1} className="sa-tab" onClick={() => onChange(t.key)}>
          {t.label}
          {t.count !== undefined && t.count > 0 ? <span className={cx('sa-tab__count', t.alert && 'sa-tab__count--alert')}>{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}
