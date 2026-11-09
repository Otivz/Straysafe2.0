import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cx } from '../../preview/lib/cx';
import { useSubmit } from '../lib/useSubmit';
import { Button, IconButton } from './Button';
import { FormError } from './layout';

/**
 * Modal built on the native <dialog>: focus is trapped, the page behind is inert, Esc and the backdrop close it.
 * Mount it only while it should be open; every open starts with fresh form state.
 * `dirty` guards against losing typed work (Esc, backdrop, ✕ and Cancel all ask first).
 */
export function Dialog({ title, description, size = 'md', variant = 'modal', flush = false, onClose, dirty = false, dismissible = true, onSubmit, children, footer }: {
  title: string;
  description?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'modal' | 'drawer';
  /** Remove the body padding (lists that run edge to edge). */
  flush?: boolean;
  onClose: () => void;
  dirty?: boolean;
  dismissible?: boolean;
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
  /** Buttons row. Use the function form to get `requestClose`, so Cancel respects the discard-changes guard. */
  footer?: ReactNode | ((api: { requestClose: () => void }) => ReactNode);
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const pressedOnBackdrop = useRef(false);
  const [askDiscard, setAskDiscard] = useState(false);
  const id = useId();

  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
  }, []);

  const requestClose = () => {
    if (!dismissible) return;
    if (dirty) setAskDiscard(true);
    else onClose();
  };

  const inner = (
    <>
      <div className={cx('sa-dialog__body', flush && 'sa-dialog__body--flush')}>{children}</div>
      {footer ? <div className="sa-dialog__foot">{typeof footer === 'function' ? footer({ requestClose }) : footer}</div> : null}
    </>
  );

  return (
    <dialog
      ref={ref}
      className={cx('sa-dialog', size === 'sm' && 'sa-dialog--sm', size === 'lg' && 'sa-dialog--lg', variant === 'drawer' && 'sa-drawer')}
      aria-labelledby={`${id}-t`}
      aria-describedby={description ? `${id}-d` : undefined}
      onCancel={(e) => { e.preventDefault(); requestClose(); }}
      onMouseDown={(e) => { pressedOnBackdrop.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (pressedOnBackdrop.current && e.target === e.currentTarget) requestClose(); }}
    >
      <div className="sa-dialog__head">
        <h2 id={`${id}-t`} className="sa-dialog__title pr-8">{title}</h2>
        {description ? <p id={`${id}-d`} className="sa-dialog__desc">{description}</p> : null}
      </div>
      {dismissible ? <IconButton className="sa-dialog__close" label="Close" icon={X} size="sm" onClick={requestClose} /> : null}
      {onSubmit ? <form noValidate onSubmit={onSubmit} className="sa-dialog__form">{inner}</form> : inner}

      {askDiscard ? (
        <div className="sa-discard" role="alertdialog" aria-labelledby={`${id}-dt`}>
          <div>
            <h3 id={`${id}-dt`} className="sa-h2">Discard unsaved changes?</h3>
            <p className="sa-text-2">What you entered here will be lost.</p>
            <div className="flex gap-2">
              <Button autoFocus onClick={() => setAskDiscard(false)}>Keep editing</Button>
              <Button variant="danger-solid" onClick={onClose}>Discard changes</Button>
            </div>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}

/** Yes/no confirmation for destructive or hard-to-undo steps. */
export function ConfirmDialog({ title, message, confirmLabel = 'Confirm', tone = 'primary', onConfirm, onClose }: {
  title: string; message: ReactNode; confirmLabel?: string; tone?: 'primary' | 'danger'; onConfirm: () => Promise<void> | void; onClose: () => void;
}) {
  const { pending, error, run } = useSubmit();
  return (
    <Dialog
      size="sm"
      title={title}
      onClose={onClose}
      footer={(
        <>
          <Button onClick={onClose} disabled={pending}>Cancel</Button>
          <Button variant={tone === 'danger' ? 'danger-solid' : 'primary'} loading={pending} onClick={() => { void run(async () => { await onConfirm(); onClose(); }); }}>{confirmLabel}</Button>
        </>
      )}
    >
      <div className="sa-text-2">{message}</div>
      {error ? <FormError message={error} /> : null}
    </Dialog>
  );
}
