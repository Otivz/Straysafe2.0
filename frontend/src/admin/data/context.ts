import { createContext, useContext } from 'react';
import type { AdminAction } from './actions';
import type { DateRange, Analytics } from './selectors';
import type { AdminState } from './types';

export type LoadStatus = 'loading' | 'ready' | 'error';
/** Whether one case's full record (assessment, referrals, follow-ups, timeline, evidence) has been read. */
export type DetailStatus = 'idle' | 'loading' | 'ready' | 'error';

/** A part of the data that could not be read. The rest of the screen still works; the shell says what is missing. */
export interface LoadIssue { section: string; message: string }

/**
 * What the interface can and cannot do because of what the backend offers: a control the backend cannot honour is turned off,
 * with the reason, instead of letting it fail or pretend.
 */
export interface AdminCapabilities {
  /** Suspend or reactivate a resident account (the backend allows only the system administrator). */
  changeResidentStatus: boolean;
  /** Edit the position title on the profile (given by the administrator on the backend). */
  editProfileTitle: boolean;
  /** Rename the subdivision or change its city (set by the system administrator on the backend). */
  editSubdivisionIdentity: boolean;
  /** Compare candidate registry pets one by one. The backend records the identity status and note, not a decision per candidate. */
  petMatchDecisions: boolean;
  /** Choose how a warning is delivered, when it starts and its observation period. The backend sends it in the app and by email at once, and the confirmed policy sets the period. */
  warningTerms: boolean;
  /** Write a lost-pet or found-animal notice without a case. The backend keeps these notices on a case. */
  noticeWithoutCase: boolean;
  /** Accepting an ownership claim also records the ownership as confirmed. The backend does not: it marks the claim accepted and leaves the case's ownership under review until the ownership decision, with evidence, is recorded on the Assessment tab. */
  acceptConfirmsOwnership: boolean;
}

export interface AdminDataValue {
  state: AdminState;
  status: LoadStatus;
  /** Why the first load failed. */
  loadError?: string;
  /** Parts that could not be read. */
  issues: LoadIssue[];
  /** Records a change. Rejects with an AdminApiError when the request fails; nothing is shown as saved until the server says so. */
  dispatch(action: AdminAction): Promise<void>;
  /** Re-runs the load; used by the Retry button on the error state. */
  reload(): void;
  /** Reads one case's full record. */
  loadCase(id: string): Promise<void>;
  detailStatus(id: string): { status: DetailStatus; error?: string };
  /** The server's analytics for a date range. */
  fetchAnalytics?(range: DateRange): Promise<Analytics>;
  capabilities: AdminCapabilities;
}

export const AdminDataContext = createContext<AdminDataValue | null>(null);

export function useAdminData(): AdminDataValue {
  const value = useContext(AdminDataContext);
  if (!value) throw new Error('useAdminData must be used inside <AdminDataProvider>');
  return value;
}
