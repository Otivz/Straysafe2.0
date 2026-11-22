/**
 * Claiming a resident account (backend/app/routes/resident_activation.py). The link in the invitation e-mail carries a single-use
 * token. Nothing is kept in storage: the token is read from the address and used once; the password is only ever sent over the call.
 */
import { httpGet, httpPost } from '../../live/http';

const server = { unauthorized: 'server' } as const;

export interface LinkCheck { valid: boolean; full_name: string; masked_email: string }

export const accountActivation = {
  check: (token: string) => httpGet<LinkCheck>('/resident-activation/check', { token }, server),
  complete: (token: string, password: string, confirm: string) =>
    httpPost<{ status: string; email: string; message: string }>('/resident-activation/complete', { token, password, confirm_password: confirm }, server),
  requestLink: (email: string) => httpPost<{ message: string }>('/resident-activation/request-link', { email: email.trim() }, server),
};
