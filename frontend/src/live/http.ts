/**
 * The one door from the new interfaces to the backend.
 *
 * It sits on the EXISTING API client (utils/api.ts): that client already attaches the bearer token, renews it from the
 * refresh cookie on a 401, ends the session when the renewal fails, and turns FastAPI validation errors into one sentence.
 * This file only does what the new screens need on top of it: every failure becomes an AdminApiError ('network' | 'session' |
 * 'server') carrying the server's own explanation, so a screen shows what the backend said (for example why a transition is
 * refused) instead of a generic message, and never falls back to sample data.
 */
import axios from 'axios';
import { api } from '../utils/api';
import { AdminApiError } from '../preview/lib/errors';
import { detailOf } from './detail';

export type Query = Record<string, string | number | boolean | null | undefined>;

export interface CallOptions {
  /** What a 401 means for this call. Sign-in endpoints answer 401 for a wrong password, which is not an expired session. */
  unauthorized?: 'session' | 'server';
  /** Abort after this many milliseconds (uploads pass a longer one). Default 30 s. */
  timeoutMs?: number;
  /** Extra headers, for example the restricted token of a sign-up that is not verified yet. */
  headers?: Record<string, string>;
}

const TOO_MANY = 'Too many attempts. Please wait a minute and try again.';

/** Turns anything thrown by a request into an AdminApiError. */
export function toApiError(err: unknown, options: Pick<CallOptions, 'unauthorized'> = {}): AdminApiError {
  if (err instanceof AdminApiError) return err;
  if (axios.isAxiosError(err)) {
    if (!err.response) return new AdminApiError('network');           // offline, refused, DNS, CORS or timed out
    const status = err.response.status;
    const detail = detailOf(err.response.data);
    if (status === 401) return options.unauthorized === 'server' ? new AdminApiError('server', detail ?? 'The email or password is not correct.', 401) : new AdminApiError('session', undefined, 401);
    if (status === 429) return new AdminApiError('server', TOO_MANY, 429);
    // A 5xx body can carry internals: show our own sentence, keep the status for whoever needs it.
    if (status >= 500) return new AdminApiError('server', undefined, status);
    return new AdminApiError('server', detail ?? undefined, status);
  }
  return new AdminApiError('server');
}

async function call<T>(method: 'get' | 'post' | 'put' | 'patch' | 'delete', url: string, data: unknown, params: Query | undefined, options: CallOptions): Promise<T> {
  try {
    const res = await api.request<T>({
      method, url, data, params,
      timeout: options.timeoutMs ?? 30_000,
      headers: options.headers,
    });
    return res.data;
  } catch (err) {
    throw toApiError(err, options);
  }
}

export const httpGet = <T>(url: string, params?: Query, options: CallOptions = {}) => call<T>('get', url, undefined, params, options);
export const httpPost = <T>(url: string, data?: unknown, options: CallOptions = {}) => call<T>('post', url, data ?? {}, undefined, options);
export const httpPut = <T>(url: string, data?: unknown, options: CallOptions = {}) => call<T>('put', url, data ?? {}, undefined, options);
export const httpPatch = <T>(url: string, data?: unknown, options: CallOptions = {}) => call<T>('patch', url, data ?? {}, undefined, options);
export const httpDelete = <T>(url: string, options: CallOptions = {}) => call<T>('delete', url, undefined, undefined, options);

/** A GET that also returns the paging headers the report list sends (X-Total-Count, X-Has-More). */
export async function httpGetPage<T>(url: string, params?: Query, options: CallOptions = {}): Promise<{ items: T; total: number | null; hasMore: boolean }> {
  try {
    const res = await api.get<T>(url, { params, timeout: options.timeoutMs ?? 30_000, headers: options.headers });
    const total = Number(res.headers?.['x-total-count']);
    return { items: res.data, total: Number.isFinite(total) ? total : null, hasMore: String(res.headers?.['x-has-more'] ?? '').toLowerCase() === 'true' };
  } catch (err) {
    throw toApiError(err, options);
  }
}

/** Multipart upload with a longer limit. Rejects with the server's reason (file type, size, not your report). */
export async function httpUpload<T>(url: string, form: FormData, options: CallOptions = {}): Promise<T> {
  return call<T>('post', url, form, undefined, { timeoutMs: 120_000, ...options });
}
