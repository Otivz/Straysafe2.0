import { createContext, useContext, useEffect, useId } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBeforeUnload } from '../../preview/lib/hooks';

/**
 * Unsaved-changes guard for in-app navigation. The app uses <BrowserRouter>, which cannot block navigation itself,
 * so forms register their dirty state here and every in-app link/back button goes through `go()`.
 * (Closing or reloading the tab is covered by `beforeunload`; the browser's own Back button is not intercepted.)
 */
export interface NavGuard {
  register(key: string, dirty: boolean): void;
  isDirty(): boolean;
  /** Navigates, or asks "Discard unsaved changes?" first when a form is dirty. */
  go(to: string): void;
}

export const NavGuardContext = createContext<NavGuard | null>(null);

export function useUnsavedGuard(dirty: boolean): void {
  const guard = useContext(NavGuardContext);
  const key = useId();
  useEffect(() => {
    guard?.register(key, dirty);
    return () => guard?.register(key, false);
  }, [dirty, guard, key]);
  useBeforeUnload(dirty);
}

/** `navigate`, but respects the unsaved-changes guard. */
export function useGuardedNavigate(): (to: string) => void {
  const guard = useContext(NavGuardContext);
  const navigate = useNavigate();
  return (to: string) => (guard ? guard.go(to) : navigate(to));
}
