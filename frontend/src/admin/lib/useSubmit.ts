import { useCallback, useState } from 'react';
import { useAuth } from '../auth/context';
import { AdminApiError, errorMessage } from '../../preview/lib/errors';

/**
 * One behaviour for every form: show a pending state, turn a failed request into a readable message, and hand an
 * expired session to the shell (which asks the admin to sign in again). Resolves true when `fn` succeeded.
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

  const clearError = useCallback(() => setError(null), []);
  return { pending, error, run, clearError };
}
