import { createContext, useContext } from 'react';
import type { AdminAction } from './reducer';
import type { AdminState } from './types';

export type LoadStatus = 'loading' | 'ready' | 'error';

export interface AdminDataValue {
  state: AdminState;
  status: LoadStatus;
  /** Records a change. Rejects with an AdminApiError when the (simulated) request fails. */
  dispatch(action: AdminAction): Promise<void>;
  /** Re-runs the initial load; used by the Retry button on the error state. */
  reload(): void;
  /** Preview only: throws the sample data away and starts again. */
  resetSample(): void;
}

export const AdminDataContext = createContext<AdminDataValue | null>(null);

export function useAdminData(): AdminDataValue {
  const value = useContext(AdminDataContext);
  if (!value) throw new Error('useAdminData must be used inside <AdminDataProvider>');
  return value;
}
