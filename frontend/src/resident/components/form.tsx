import { cloneElement, useId, useState, type InputHTMLAttributes, type ReactElement, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { CircleAlert, Eye, EyeOff, Search, type LucideIcon } from 'lucide-react';
import { cx } from '../../preview/lib/cx';

type ControlProps = { id?: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string };

/** Label + control + hint + error, wired together for screen readers. The child must be a single form control. */
export function Field({ label, hint, error, required, optional, children }: { label: string; hint?: ReactNode; error?: string; required?: boolean; optional?: boolean; children: ReactElement<ControlProps> }) {
  const id = useId();
  const describedBy = [hint ? `${id}-h` : '', error ? `${id}-e` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className="rs-field">
      <label className="rs-label" htmlFor={id}>{label}{required ? <span className="rs-req" aria-hidden="true"> *</span> : null}{optional ? <span className="rs-opt"> optional</span> : null}</label>
      {cloneElement(children, { id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })}
      {hint ? <p id={`${id}-h`} className="rs-hint">{hint}</p> : null}
      {error ? <p id={`${id}-e`} className="rs-error" role="alert"><CircleAlert size={15} aria-hidden="true" />{error}</p> : null}
    </div>
  );
}

/** For groups of choices, which have no single control to label. */
export function FieldGroup({ label, hint, error, required, children }: { label: string; hint?: ReactNode; error?: string; required?: boolean; children: ReactNode }) {
  const id = useId();
  return (
    <div className="rs-field" role="group" aria-labelledby={`${id}-l`}>
      <span id={`${id}-l`} className="rs-label">{label}{required ? <span className="rs-req" aria-hidden="true"> *</span> : null}</span>
      {hint ? <p className="rs-hint">{hint}</p> : null}
      {children}
      {error ? <p className="rs-error" role="alert"><CircleAlert size={15} aria-hidden="true" />{error}</p> : null}
    </div>
  );
}

export const Input = ({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) => <input className={cx('rs-input', className)} {...rest} />;
export const Textarea = ({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea className={cx('rs-input', className)} {...rest} />;
export const Select = ({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) => <select className={cx('rs-input', className)} {...rest}>{children}</select>;

export function SearchInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <div className={cx('rs-search', className)}><Search size={18} aria-hidden="true" /><input type="search" className="rs-input" {...rest} /></div>;
}

export function PasswordInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [shown, setShown] = useState(false);
  return (
    <div className="rs-pwd">
      <input {...props} type={shown ? 'text' : 'password'} className={cx('rs-input', props.className)} />
      <button type="button" className="rs-pwd__toggle" onClick={() => setShown((v) => !v)} aria-label={shown ? 'Hide password' : 'Show password'} aria-pressed={shown}>
        {shown ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}
      </button>
    </div>
  );
}

export function Checkbox({ label, hint, error, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: ReactNode; hint?: ReactNode; error?: string }) {
  return (
    <div className="rs-field">
      <label className="rs-check"><input type="checkbox" {...rest} /><span>{label}{hint ? <small>{hint}</small> : null}</span></label>
      {error ? <p className="rs-error" role="alert"><CircleAlert size={15} aria-hidden="true" />{error}</p> : null}
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className="rs-switch" onClick={() => onChange(!checked)} />;
}

/** Single-choice chips that wrap (animal type and similar short lists). */
export function ChoiceChips<T extends string>({ value, onChange, options, label }: { value: T | ''; onChange: (v: T) => void; options: { value: T; label: string; icon?: LucideIcon }[]; label: string }) {
  return (
    <div className="rs-chips" role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const Icon = o.icon;
        return (
          <label key={o.value} className="rs-chip">
            <input type="radio" name={label} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
            <span>{Icon ? <Icon size={16} aria-hidden="true" /> : null}{o.label}</span>
          </label>
        );
      })}
    </div>
  );
}

/** Radio rows with a title and a short description (report categories, claim options). */
export function OptionList<T extends string>({ name, value, onChange, options }: { name: string; value: T | ''; onChange: (v: T) => void; options: { value: T; label: ReactNode; description?: ReactNode; icon?: LucideIcon }[] }) {
  return (
    <div className="rs-options" role="radiogroup" aria-label={name}>
      {options.map((o) => {
        const Icon = o.icon;
        return (
          <label key={o.value} className="rs-option">
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
            {Icon ? <span className="rs-option__icon"><Icon size={19} aria-hidden="true" /></span> : null}
            <span className="rs-option__text"><span className="rs-option__title">{o.label}</span>{o.description ? <span className="rs-option__desc">{o.description}</span> : null}</span>
          </label>
        );
      })}
    </div>
  );
}

/** A setting with a title, a short explanation and a switch. The switch is a sibling of the text, never nested in a button. */
export function ToggleRow({ title, meta, checked, onChange, disabled }: { title: string; meta?: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="rs-row rs-row--toggle">
      <span className="rs-row__text"><span className="rs-row__title">{title}</span>{meta ? <span className="rs-row__meta">{meta}</span> : null}</span>
      <Switch label={title} checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );
}
