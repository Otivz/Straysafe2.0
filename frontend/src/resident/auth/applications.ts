/**
 * Individual self-registration (backend/app/routes/resident_applications.py). Registering creates the account; signing in then
 * e-mails the existing 6-digit code; after the code the account waits for the Subdivision Leader's residency review.
 */
import { httpPost } from '../../live/http';

const server = { unauthorized: 'server' } as const;

export interface RegistrationDetails {
  fullName: string; email: string; contact: string; block: string; lot: string; subdivisionId?: number;
}

export const residentApplications = {
  register: (d: RegistrationDetails, password: string, confirm: string) => httpPost<{ status: string; email: string; message: string }>(
    '/resident-applications/register', {
      full_name: d.fullName.trim(), email: d.email.trim(), contact_number: d.contact.trim() || null, block_number: d.block.trim(),
      lot_number: d.lot.trim(), password, confirm_password: confirm, ...(d.subdivisionId ? { subdivision_id: d.subdivisionId } : {}),
    }, server),
  resubmit: (email: string, password: string, d: Omit<RegistrationDetails, 'email'>) => httpPost<{ status: string; message: string }>(
    '/resident-applications/resubmit', {
      email: email.trim(), password, full_name: d.fullName.trim(), contact_number: d.contact.trim() || null,
      block_number: d.block.trim(), lot_number: d.lot.trim(),
    }, server),
};
