import { cloneElement, useId, useState, type InputHTMLAttributes, type ReactElement, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { CircleAlert, Eye, EyeOff, Search } from 'lucide-react';
import { cx } from '../../preview/lib/cx';

type ControlProps = { id?: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string };

/** Label + control + hint + error, wired together for screen readers. The child must be a single form control. */
export function Field({ label, hint, error, required, optional, className, children }: {
  label: string; hint?: ReactNode; error?: string; required?: boolean; optional?: boolean; className?: string; children: ReactElement<ControlProps>;
}) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-err` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cx('sa-field', className)}>
      <label className="sa-label" htmlFor={id}>
        {label}
        {required ? <span className="sa-req" aria-hidden="true">*</span> : null}
        {optional ? <span className="sa-optional">optional</span> : null}
      </label>
      {cloneElement(children, { id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })}
      {hint ? <p id={`${id}-hint`} className="sa-hint">{hint}</p> : null}
      {error ? <p id={`${id}-err`} className="sa-error" role="alert"><CircleAlert size={14} className="mt-[2px] shrink-0" aria-hidden="true" />{error}</p> : null}
    </div>
  );
}

/** For groups of radios or checkboxes, which have no single control to label. */
export function FieldGroup({ label, hint, error, required, children }: { label: string; hint?: ReactNode; error?: string; required?: boolean; children: ReactNode }) {
  const id = useId();
  return (
    <div className="sa-field" role="group" aria-labelledby={`${id}-l`}>
      <span id={`${id}-l`} className="sa-label">{label}{required ? <span className="sa-req" aria-hidden="true">*</span> : null}</span>
      {hint ? <p className="sa-hint">{hint}</p> : null}
      {children}
      {error ? <p className="sa-error" role="alert"><CircleAlert size={14} className="mt-[2px] shrink-0" aria-hidden="true" />{error}</p> : null}
    </div>
  );
}

export const Input = ({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) => <input className={cx('sa-input', className)} {...rest} />;
export const Textarea = ({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea className={cx('sa-input', className)} {...rest} />;
export const Select = ({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) => <select className={cx('sa-input', className)} {...rest}>{children}</select>;

export function SearchInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={cx('sa-search', className)}>
      <Search size={16} aria-hidden="true" />
      <input type="search" className="sa-input" {...rest} />
    </div>
  );
}

export function PasswordInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [shown, setShown] = useState(false);
  return (
    <div className="sa-pwd">
      <input {...props} type={shown ? 'text' : 'password'} className={cx('sa-input', props.className)} />
      <button type="button" className="sa-pwd__toggle" onClick={() => setShown((v) => !v)} aria-label={shown ? 'Hide password' : 'Show password'} aria-pressed={shown}>
        {shown ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
      </button>
    </div>
  );
}

export function Checkbox({ label, hint, className, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: ReactNode; hint?: ReactNode }) {
  return (
    <label className={cx('sa-check', className)}>
      <input type="checkbox" {...rest} />
      <span>{label}{hint ? <small>{hint}</small> : null}</span>
    </label>
  );
}

export interface Option<T extends string> { value: T; label: ReactNode; description?: ReactNode; disabled?: boolean }

export function OptionGroup<T extends string>({ name, value, onChange, options, inline, cols, label }: {
  name: string; value: T | ''; onChange: (v: T) => void; options: Option<T>[]; inline?: boolean; label: string;
  /** Lay the options out in 2 or 3 columns on wide screens (one column on narrow ones). */
  cols?: 2 | 3;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cx('sa-options', inline && 'sa-options--inline', cols && `sa-options--${cols}`)}>
      {options.map((o) => (
        <label key={o.value} className="sa-option">
          <input type="radio" name={name} value={o.value} checked={value === o.value} disabled={o.disabled} onChange={() => onChange(o.value)} />
          <span className="min-w-0">
            <span className="sa-option__title">{o.label}</span>
            {o.description ? <span className="sa-option__desc">{o.description}</span> : null}
          </span>
        </label>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className="sa-switch" onClick={() => onChange(!checked)} />;
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; count?: number }[]; label: string }) {
  return (
    <div className="sa-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className="sa-seg__btn" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
          {o.count !== undefined ? <span className="sa-seg__count">{o.count}</span> : null}
        </button>
      ))}
    </div>
  );
}
