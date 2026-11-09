import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CircleAlert, CircleCheck } from 'lucide-react';
import { cx } from '../../preview/lib/cx';
import { ToastContext } from './toast';

interface Item { id: number; message: string; tone: 'success' | 'error' }

/** Toasts live in the top layer (popover) so they stay visible above an open sheet. A hidden live region announces them. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const counter = useRef(0);
  const host = useRef<HTMLDivElement>(null);

  const push = useCallback((message: string, tone: Item['tone']) => {
    const id = ++counter.current;
    setItems((list) => [...list.slice(-1), { id, message, tone }]);
    setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), tone === 'error' ? 6500 : 3500);
  }, []);
  const api = useMemo(() => ({ success: (m: string) => push(m, 'success'), error: (m: string) => push(m, 'error') }), [push]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    if (el.matches(':popover-open')) el.hidePopover();
    if (items.length > 0) el.showPopover(); // re-stacks above any sheet opened since the last toast
  }, [items]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="rs-sr-only" role="status" aria-live="polite">{items[items.length - 1]?.message}</div>
      <div ref={host} popover="manual" className="rs-toasts">
        {items.map((t) => (
          <div key={t.id} className={cx('rs-toast', t.tone === 'error' && 'rs-toast--error')}>
            {t.tone === 'error' ? <CircleAlert size={18} aria-hidden="true" /> : <CircleCheck size={18} aria-hidden="true" />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
