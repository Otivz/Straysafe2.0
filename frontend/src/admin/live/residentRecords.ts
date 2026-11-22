/** The Leader's calls for the official resident list (backend/app/routes/resident_records.py). */
import { httpDownloadBlob, httpGet, httpPatch, httpPost, httpUpload } from '../../live/http';

export type RecordStatus = 'Pending Activation' | 'Active' | 'Deactivated';
export const RECORD_STATUSES: RecordStatus[] = ['Pending Activation', 'Active', 'Deactivated'];
export type InvitationStatus = 'Pending Delivery' | 'Sending' | 'Sent' | 'Delivery Failed' | 'Invitation Expired' | 'Claimed';

export interface ResidentRecord {
  record_id: number; full_name: string; email: string; block_number: string; lot_number: string; contact_number: string | null;
  registration_status: RecordStatus; has_account: boolean; imported_batch_id: number | null;
  registered_at: string | null; created_at: string | null; updated_at: string | null;
  invitation_status: InvitationStatus | null; invitation_sent_at: string | null; invitation_expires_at: string | null;
  invitation_error: string | null; invitation_sends: number;
}

export interface ImportBatch {
  batch_id: number; filename: string; status: 'Validated' | 'Imported' | 'Discarded'; uploaded_by: string | null;
  uploaded_at: string | null; confirmed_at: string | null;
  total_rows: number; valid_rows: number; duplicate_rows: number; invalid_rows: number; missing_rows: number;
  imported_rows: number; linked_existing_rows: number;
}

export interface ImportRow {
  row_number: number; full_name: string | null; email: string | null; block_number: string | null; lot_number: string | null;
  contact_number: string | null; result: 'valid' | 'duplicate' | 'invalid' | 'missing'; reason: string | null;
}

export type RowFilter = 'issues' | 'valid' | 'all';

export const residentRecordsApi = {
  list: (p: { q: string; status: string; page: number; invitation?: 'failed' }) =>
    httpGet<{ total: number; page: number; page_size: number; failed_invitations: number; counts: Record<RecordStatus, number>; records: ResidentRecord[] }>('/resident-records', { q: p.q, status: p.status, page: p.page, page_size: 20, ...(p.invitation ? { invitation: p.invitation } : {}) }),
  resend: (id: number) => httpPost<{ result: 'sent' | 'failed' | 'skipped'; record: ResidentRecord }>(`/resident-records/${id}/resend-invitation`),
  sendInvitations: () => httpPost<{ queued: number }>('/resident-records/send-invitations'),
  recordHistory: (id: number) => httpGet<{ action: string; description: string | null; at: string | null }[]>(`/resident-records/${id}/history`),
  update: (id: number, body: Partial<Pick<ResidentRecord, 'full_name' | 'email' | 'block_number' | 'lot_number' | 'contact_number'>>) => httpPatch<ResidentRecord>(`/resident-records/${id}`, body),
  deactivate: (id: number) => httpPost<ResidentRecord>(`/resident-records/${id}/deactivate`),
  reactivate: (id: number) => httpPost<ResidentRecord>(`/resident-records/${id}/reactivate`),
  template: (format: 'xlsx' | 'csv') => httpDownloadBlob('/resident-records/template', `straysafe-resident-records-template.${format}`, { format }),
  upload: (file: File) => { const form = new FormData(); form.append('file', file); return httpUpload<ImportBatch>('/resident-records/imports', form); },
  history: () => httpGet<ImportBatch[]>('/resident-records/imports'),
  batch: (id: number, result: RowFilter, page: number) =>
    httpGet<{ batch: ImportBatch; total: number; page: number; page_size: number; rows: ImportRow[] }>(`/resident-records/imports/${id}`, { result, page, page_size: 25 }),
  confirm: (id: number) => httpPost<{ batch: ImportBatch; imported: number; accounts_created: number; invitations_queued: number; skipped: number; linked_existing: number }>(`/resident-records/imports/${id}/confirm`),
  discard: (id: number) => httpPost<{ batch: ImportBatch }>(`/resident-records/imports/${id}/discard`),
};
