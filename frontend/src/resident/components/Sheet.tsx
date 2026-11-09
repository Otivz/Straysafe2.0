import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cx } from '../../preview/lib/cx';
import { useSubmit } from '../lib/hooks';
import { Button, FormError, IconButton } from './ui';

/**
 * Bottom sheet built on the native <dialog>: focus is trapped, the page behind is inert, Esc and the backdrop close it.
 * Mount it only while it should be open; every open starts with fresh form state.
 * `dirty` guards against losing typed work (Esc, backdrop, ✕ and Cancel all ask first).
 */
export function Sheet({ title, description, onClose, dirty = false, dismissible = true, tall = false, onSubmit, children, footer }: {
  title: string;
  description?: ReactNode;
  onClose: () => void;
  dirty?: boolean;
  dismissible?: boolean;
  /** A larger sheet for content like the map picker. */
  tall?: boolean;
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
  footer?: ReactNode | ((api: { requestClose: () => void }) => ReactNode);
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const pressedOnBackdrop = useRef(false);
  const [askDiscard, setAskDiscard] = useState(false);
  const id = useId();

  // Opening moves focus into the sheet; closing hands it back to whatever opened it. The sheet is unmounted rather than
  // closed natively, so the browser would otherwise leave focus on <body>. (`??=` keeps the first opener under StrictMode.)
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    opener.current ??= document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (el && !el.open) el.showModal();
    return () => {
      const back = opener.current;
      if (back?.isConnected) back.focus({ preventScroll: true });
    };
  }, []);

  const requestClose = () => {
    if (!dismissible) return;
    if (dirty) setAskDiscard(true);
    else onClose();
  };

  const inner = (
    <>
      <div className="rs-sheet__body">{children}</div>
      {footer ? <div className="rs-sheet__foot">{typeof footer === 'function' ? footer({ requestClose }) : footer}</div> : null}
    </>
  );

  return (
    <dialog
      ref={ref}
      className={cx('rs-sheet', tall && 'rs-sheet--tall')}
      aria-labelledby={`${id}-t`}
      aria-describedby={description ? `${id}-d` : undefined}
      onCancel={(e) => { e.preventDefault(); requestClose(); }}
      // Browsers let a second Esc press close a modal dialog even when `cancel` was prevented. A sheet that must not be
      // dismissed (an expired session) simply opens again.
      onClose={(e) => { if (!dismissible && !e.currentTarget.open) e.currentTarget.showModal(); }}
      onMouseDown={(e) => { pressedOnBackdrop.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (pressedOnBackdrop.current && e.target === e.currentTarget) requestClose(); }}
    >
      <div className="rs-sheet__grab" aria-hidden="true" />
      <div className="rs-sheet__head">
        <h2 id={`${id}-t`} className="rs-sheet__title">{title}</h2>
        {description ? <p id={`${id}-d`} className="rs-sheet__desc">{description}</p> : null}
      </div>
      {dismissible ? <IconButton className="rs-sheet__close" label="Close" icon={X} onClick={requestClose} /> : null}
      {onSubmit ? <form noValidate onSubmit={onSubmit} className="rs-sheet__form">{inner}</form> : inner}
      {askDiscard ? (
        <div className="rs-discard" role="alertdialog" aria-labelledby={`${id}-dt`}>
          <div>
            <h3 id={`${id}-dt`} className="rs-h2">Discard unsaved changes?</h3>
            <p className="rs-sub">What you entered here will be lost.</p>
            <div className="rs-stack-sm">
              <Button variant="primary" block autoFocus onClick={() => setAskDiscard(false)}>Keep editing</Button>
              <Button variant="danger" block onClick={onClose}>Discard changes</Button>
            </div>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}

/** Asked when Back or Cancel would throw away typed work. */
export function DiscardSheet({ onDiscard, onKeep }: { onDiscard: () => void; onKeep: () => void }) {
  return (
    <Sheet
      title="Discard your changes?"
      description="What you changed on this screen has not been saved."
      onClose={onKeep}
      footer={(
        <>
          <Button variant="primary" block autoFocus onClick={onKeep}>Keep editing</Button>
          <Button variant="danger" block onClick={onDiscard}>Discard changes</Button>
        </>
      )}
    >
      <span className="rs-sr-only">Your changes will be lost if you leave.</span>
    </Sheet>
  );
}

/** Yes/no confirmation for destructive or hard-to-undo steps. */
export function ConfirmSheet({ title, message, confirmLabel = 'Confirm', tone = 'primary', onConfirm, onClose }: {
  title: string; message: ReactNode; confirmLabel?: string; tone?: 'primary' | 'danger'; onConfirm: () => Promise<void> | void; onClose: () => void;
}) {
  const { pending, error, run } = useSubmit();
  return (
    <Sheet
      title={title}
      onClose={onClose}
      footer={(
        <>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} block loading={pending} onClick={() => { void run(async () => { await onConfirm(); onClose(); }); }}>{confirmLabel}</Button>
          <Button variant="ghost" block onClick={onClose} disabled={pending}>Cancel</Button>
        </>
      )}
    >
      <div className="rs-sub">{message}</div>
      {error ? <FormError message={error} /> : null}
    </Sheet>
  );
}
