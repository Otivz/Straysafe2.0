import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Check, type LucideIcon } from 'lucide-react';
import { cx } from '../../preview/lib/cx';

export type MenuItem =
  | { kind?: 'item'; label: string; icon?: LucideIcon; onSelect?: () => void; to?: string; danger?: boolean; checked?: boolean; disabled?: boolean }
  | { kind: 'separator' }
  | { kind: 'label'; label: string };

export interface TriggerProps {
  'aria-haspopup': 'menu';
  'aria-expanded': boolean;
  onClick: () => void;
}

/** A small action menu: closes on outside click, Esc or selection; arrow keys move between items. */
export function Menu({ trigger, items, align = 'right', direction = 'down', width, fill }: {
  trigger: (props: TriggerProps) => ReactNode; items: MenuItem[]; align?: 'left' | 'right'; direction?: 'up' | 'down'; width?: number;
  /** Let the trigger stretch to the available width (sidebar account button). */
  fill?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); wrap.current?.querySelector<HTMLElement>('[aria-haspopup]')?.focus(); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    wrap.current?.querySelector<HTMLElement>('[role^="menuitem"]:not([disabled])')?.focus();
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const onMenuKey = (e: ReactKeyEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const nodes = Array.from(wrap.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([disabled])') ?? []);
    const i = nodes.indexOf(document.activeElement as HTMLElement);
    nodes[(i + (e.key === 'ArrowDown' ? 1 : nodes.length - 1)) % nodes.length]?.focus();
  };

  return (
    <div className={cx('sa-menuwrap', fill && 'sa-menuwrap--fill')} ref={wrap}>
      {trigger({ 'aria-haspopup': 'menu', 'aria-expanded': open, onClick: () => setOpen((v) => !v) })}
      {open ? (
        <div className={cx('sa-menu', align === 'right' && 'sa-menu--right', direction === 'up' ? 'sa-menu--up' : 'sa-menu--down')} style={width ? { minWidth: width } : undefined} role="menu" onKeyDown={onMenuKey}>
          {items.map((item, i) => {
            if (item.kind === 'separator') return <div key={i} className="sa-menu__sep" role="separator" />;
            if (item.kind === 'label') return <div key={i} className="sa-menu__label">{item.label}</div>;
            const Icon = item.icon;
            const inner = <>{Icon ? <Icon size={16} aria-hidden="true" /> : null}<span>{item.label}</span></>;
            const className = cx('sa-menu__item', item.danger && 'sa-menu__item--danger');
            if (item.to) return <Link key={i} role="menuitem" className={className} to={item.to} onClick={() => setOpen(false)}>{inner}</Link>;
            const isCheckbox = item.checked !== undefined;
            return (
              <button key={i} type="button" role={isCheckbox ? 'menuitemcheckbox' : 'menuitem'} className={className} disabled={item.disabled} aria-checked={isCheckbox ? item.checked : undefined} onClick={() => { setOpen(false); item.onSelect?.(); }}>
                {inner}
                {item.checked ? <Check size={15} className="ml-auto" aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
