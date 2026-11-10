/**
 * What the entry component (AdminLiveRoot.tsx) hands to the Admin screens: the sign-in gateway and the data store. The screens read
 * it from here and never import an entry's code themselves.
 */
import { createContext, useContext, type ComponentType, type ReactNode } from 'react';
import type { AuthGateway } from './auth/gateway';

export interface AdminMode {
  gateway: AuthGateway;
  /** The data store behind every screen (state + async dispatch + load status). */
  DataProvider: ComponentType<{ children: ReactNode }>;
}

export const AdminModeContext = createContext<AdminMode | null>(null);

export function useAdminMode(): AdminMode {
  const value = useContext(AdminModeContext);
  if (!value) throw new Error('useAdminMode must be used inside <AdminApp>');
  return value;
}
