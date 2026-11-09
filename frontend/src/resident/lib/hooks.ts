import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminApiError, errorMessage } from '../../preview/lib/errors';
import { useBeforeUnload } from '../../preview/lib/hooks';
import { usePreviewFlags } from '../../preview/lib/previewFlags';
import { useAuth } from '../auth/context';

export { useNow } from '../../preview/lib/hooks';

/** Sets the tab title for the screen and restores the previous one on leave. */
export function usePageTitle(title: string): void {
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} · StraySafe`;
    return () => { document.title = previous; };
  }, [title]);
}

/**
 * Predictable Back: go to the previous screen when there is one inside this preview, otherwise to a sensible parent.
 * (React Router keeps an index in history.state; 0 means this is the first entry of the tab.)
 */
export function useBack(fallback: string): () => void {
  const navigate = useNavigate();
  return useCallback(() => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(fallback, { replace: true });
  }, [navigate, fallback]);
}

/**
 * Back that protects typed work. While `dirty`, Back, Cancel and `leaveTo` links ask first (`asking` drives a confirmation sheet) and closing
 * or reloading the tab shows the browser's own warning. The browser's Back button cannot be intercepted with this router.
 */
export function useLeaveGuard(dirty: boolean, fallback: string) {
  const back = useBack(fallback);
  const navigate = useNavigate();
  const [asking, setAsking] = useState(false);
  const [target, setTarget] = useState<string | null>(null);
  useBeforeUnload(dirty);
  return {
    asking,
    /** Back or Cancel. */
    leave: () => { if (dirty) { setTarget(null); setAsking(true); } else back(); },
    /** A link on the screen that leads somewhere else: asks first when there is unsaved work. */
    leaveTo: (to: string) => { if (dirty) { setTarget(to); setAsking(true); } else navigate(to); },
    discard: () => { setAsking(false); if (target) navigate(target); else back(); },
    keep: () => setAsking(false),
  };
}

/** When a submit fails validation, move focus to the first invalid field. Put `ref` on an element wrapping the fields. */
export function useFormFocus() {
  const ref = useRef<HTMLDivElement>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (attempt > 0) ref.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [attempt]);
  return { ref, invalid: () => setAttempt((n) => n + 1) };
}

/** Counts down from `start(seconds)` to 0 (resend-code cooldown). */
export function useCountdown(initial = 0) {
  const [left, setLeft] = useState(initial);
  useEffect(() => {
    if (left <= 0) return undefined;
    const timer = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [left]);
  return [left, setLeft] as const;
}

const subscribeOnline = (notify: () => void) => {
  window.addEventListener('online', notify);
  window.addEventListener('offline', notify);
  return () => { window.removeEventListener('online', notify); window.removeEventListener('offline', notify); };
};

/** True when the browser is offline, or when the preview's "Network unavailable" switch is on. */
export function useOffline(): boolean {
  const { offline } = usePreviewFlags();
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  return offline || !online;
}

/**
 * One behaviour for every form: show a pending state, turn a failed request into a readable message, and hand an expired
 * session to the shell. Resolves true when `fn` succeeded.
 */
export function useSubmit() {
  const { expireSession } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (fn: () => Promise<void>): Promise<boolean> => {
    setPending(true);
    setError(null);
    try {
      await fn();
      return true;
    } catch (err) {
      if (err instanceof AdminApiError && err.kind === 'session') expireSession();
      setError(errorMessage(err));
      return false;
    } finally {
      setPending(false);
    }
  }, [expireSession]);

  return { pending, error, run, clearError: useCallback(() => setError(null), []) };
}
