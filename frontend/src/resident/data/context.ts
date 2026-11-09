import { createContext, useContext } from 'react';
import type { ResidentAction } from './reducer';
import type { ResidentState } from './types';

export type LoadStatus = 'loading' | 'ready' | 'error';

export interface ResidentDataValue {
  state: ResidentState;
  status: LoadStatus;
  /** Records a change. Rejects with an AdminApiError when the (simulated) request fails. */
  dispatch(action: ResidentAction): Promise<void>;
  /**
   * Applies a change that only concerns this device: a report being written, a notification marked as read.
   * Immediate and never fails, so typing is not delayed. When connected to the API, drafts stay client-side.
   */
  local(action: ResidentAction): void;
  /** Re-runs the initial load; used by Try again on the error state. */
  reload(): void;
  /** Preview only: throws the sample data away and starts again. */
  resetSample(): void;
}

export const ResidentDataContext = createContext<ResidentDataValue | null>(null);

export function useResidentData(): ResidentDataValue {
  const value = useContext(ResidentDataContext);
  if (!value) throw new Error('useResidentData must be used inside <ResidentDataProvider>');
  return value;
}
