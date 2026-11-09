import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { cx } from '../../preview/lib/cx';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-solid' | 'link';

interface Look {
  variant?: Variant;
  size?: 'sm' | 'md';
  block?: boolean;
  icon?: LucideIcon;
}

const look = ({ variant = 'secondary', size = 'md', block }: Look, extra?: string) =>
  cx('sa-btn', `sa-btn--${variant}`, size === 'sm' && 'sa-btn--sm', block && 'sa-btn--block', extra);

export function Button({
  variant, size, block, icon: Icon, loading = false, className, children, disabled, type = 'button', ...rest
}: Look & ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button type={type} className={look({ variant, size, block }, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <span className="sa-spinner" aria-hidden="true" /> : Icon ? <Icon size={16} strokeWidth={1.9} aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export function LinkButton({ variant, size, block, icon: Icon, className, children, ...rest }: Look & LinkProps & { children?: ReactNode }) {
  return (
    <Link className={look({ variant, size, block }, className)} {...rest}>
      {Icon ? <Icon size={16} strokeWidth={1.9} aria-hidden="true" /> : null}
      {children}
    </Link>
  );
}

export function IconButton({
  label, icon: Icon, variant = 'ghost', size = 'md', className, ...rest
}: { label: string; icon: LucideIcon; variant?: Variant; size?: 'sm' | 'md' } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={cx('sa-btn', 'sa-btn--icon', `sa-btn--${variant}`, size === 'sm' && 'sa-btn--sm', className)} aria-label={label} title={label} {...rest}>
      <Icon size={size === 'sm' ? 15 : 17} strokeWidth={1.9} aria-hidden="true" />
    </button>
  );
}
