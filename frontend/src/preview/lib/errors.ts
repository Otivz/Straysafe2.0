/**
 * Every mutation the UI performs is async and may fail. In the preview these failures are simulated from the
 * "Preview tools" menu; once the data layer talks to the API, the same three kinds map to a failed request, a 401,
 * and a 5xx/4xx response, so the screens do not need to change.
 */
export type AdminErrorKind = 'network' | 'session' | 'server';

export class AdminApiError extends Error {
  readonly kind: AdminErrorKind;

  constructor(kind: AdminErrorKind, message?: string) {
    super(message ?? defaultMessage(kind));
    this.name = 'AdminApiError';
    this.kind = kind;
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
