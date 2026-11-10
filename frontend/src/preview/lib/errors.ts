/**
 * Every mutation the UI performs is async and may fail. In the preview these failures are simulated from the
 * "Preview tools" menu; in live mode (src/live/http.ts) the same three kinds map to a request that never got an answer
 * ('network'), a 401 that the session refresh could not fix ('session'), and any other error response ('server', carrying
 * the server's own explanation), so the screens do not care which mode they run in.
 */
export type AdminErrorKind = 'network' | 'session' | 'server';

export class AdminApiError extends Error {
  readonly kind: AdminErrorKind;
  /** The HTTP status, when the error came from a response (live mode only). */
  readonly status?: number;

  constructor(kind: AdminErrorKind, message?: string, status?: number) {
    super(message ?? defaultMessage(kind));
    this.name = 'AdminApiError';
    this.kind = kind;
    this.status = status;
  }
}

function defaultMessage(kind: AdminErrorKind): string {
  switch (kind) {
    case 'network': return 'We can’t reach the server. Check your connection and try again.';
    case 'session': return 'Your session has expired. Sign in again to continue.';
    default: return 'Something went wrong and your change was not recorded. Please try again.';
  }
}

export const errorMessage = (err: unknown): string =>
  err instanceof AdminApiError ? err.message : 'Something went wrong. Please try again.';
