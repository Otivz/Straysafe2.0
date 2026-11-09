import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CircleAlert, CircleCheck, X } from 'lucide-react';
import { cx } from '../../preview/lib/cx';
import { ToastContext } from './toast';

interface Item { id: number; message: string; tone: 'success' | 'error' }

/**
 * Toasts live in the top layer (popover), so they stay visible above an open dialog or drawer.
 * A visually hidden live region announces each message to screen readers.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const counter = useRef(0);
  const host = useRef<HTMLDivElement>(null);

  const remove = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), []);
  const push = useCallback((message: string, tone: Item['tone']) => {
    const id = ++counter.current;
    setItems((list) => [...list.slice(-2), { id, message, tone }]);
    setTimeout(() => remove(id), tone === 'error' ? 7000 : 4000);
  }, [remove]);

  const api = useMemo(() => ({ success: (m: string) => push(m, 'success'), error: (m: string) => push(m, 'error') }), [push]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    if (el.matches(':popover-open')) el.hidePopover();
    if (items.length > 0) el.showPopover(); // re-stacks above any dialog opened since the last toast
  }, [items]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="sa-sr-only" role="status" aria-live="polite">{items[items.length - 1]?.message}</div>
      <div ref={host} popover="manual" className="sa-toasts">
        {items.map((t) => (
          <div key={t.id} className={cx('sa-toast', t.tone === 'error' && 'sa-toast--error')}>
            {t.tone === 'error' ? <CircleAlert size={17} aria-hidden="true" /> : <CircleCheck size={17} aria-hidden="true" />}
            <span>{t.message}</span>
            <button type="button" aria-label="Dismiss" onClick={() => remove(t.id)}><X size={15} aria-hidden="true" /></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
