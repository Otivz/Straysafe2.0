import { createContext, useContext } from 'react';
import type { ResidentAction } from './reducer';
import type { CommunityQuery } from '../live/api';
import type { Notice, ResidentState } from './types';

export type LoadStatus = 'loading' | 'ready' | 'error';
/** Whether one report's or notice's full record has been read. */
export type DetailStatus = 'idle' | 'loading' | 'ready' | 'error';

/** A part of the data that could not be read. The rest of the app still works; the shell says what is missing. */
export interface LoadIssue { section: string; message: string }

/**
 * What the app can and cannot do because of what the backend offers: a control the backend cannot honour is turned off, with the
 * reason, instead of letting it fail or pretend.
 */
export interface ResidentCapabilities {
  /** Send a message to the subdivision office from the app. The backend has no such message yet: the office is reached by the details shown. */
  messageOffice: boolean;
  /** Separate switches for community notices and safety advisories. The backend always shows them in the app, so there is no switch. */
  communityToggles: boolean;
  /** Text messages as a channel. The backend sends none. */
  smsChannel: boolean;
}

/** What a change returns when the caller needs something the server decided (the reference of a report or the id of a pet it just created). */
export interface ActionOutcome { reportRef?: string; petId?: string }

export interface ResidentDataValue {
  state: ResidentState;
  status: LoadStatus;
  /** Why the first load failed. */
  loadError?: string;
  /** Parts that could not be read. */
  issues: LoadIssue[];
  /** Records a change. Rejects with an AdminApiError when the request fails; nothing is shown as saved until the server says so. */
  dispatch(action: ResidentAction): Promise<ActionOutcome | void>;
  /**
   * Applies a change that only concerns this device: a report being written. Immediate and never fails, so typing is not
   * delayed. (A notification marked as read is also applied here at once; the connected app tells the server as well.)
   */
  local(action: ResidentAction): void;
  /** Re-runs the load; used by Try again on the error state. */
  reload(): void;
  /** Reads one report in full (its timeline, photos, messages and notice). */
  loadReport(id: string): Promise<void>;
  /** Refresh the caller's conversation summaries after reading or sending, without replacing private case updates. */
  refreshConversations(): Promise<void>;
  reportStatus(id: string): { status: DetailStatus; error?: string };
  /** Reads one notice in full (its sightings). */
  loadNotice(id: string): Promise<void>;
  /** One page of the Community directory, searched and filtered on the server. The notices are kept, so their pages open. */
  loadCommunityPage(query: CommunityQuery): Promise<{ notices: Notice[]; total: number }>;
  noticeStatus(id: string): { status: DetailStatus; error?: string };
  capabilities: ResidentCapabilities;
}

export const ResidentDataContext = createContext<ResidentDataValue | null>(null);

export function useResidentData(): ResidentDataValue {
  const value = useContext(ResidentDataContext);
  if (!value) throw new Error('useResidentData must be used inside <ResidentDataProvider>');
  return value;
}
