/**
 * What the entry component (ResidentLiveRoot.tsx) hands to the Resident screens: the sign-in gateway, the data store and, in the
 * Android debug build, Connection Settings. The screens read it from here and never import an entry's code themselves.
 */
import { createContext, useContext, type ComponentType, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { ResidentGateway } from './auth/gateway';

export interface ResidentMode {
  gateway: ResidentGateway;
  /** The data store behind every signed-in screen (state + async dispatch + load status). */
  DataProvider: ComponentType<{ children: ReactNode }>;
  /** The permanent bar at the top of every screen: the Android debug build's backend bar. */
  Banner?: ComponentType<{ signedIn: boolean }>;
  /**
   * Connection Settings of the Android DEBUG build (a screen at /connection, a row in Settings, and the first screen when no backend is
   * set). Undefined in every other build, which is how the shared screens know not to offer it.
   */
  devConnection?: { Page: ComponentType<{ firstRun?: boolean }>; title: string; meta: () => string; icon: LucideIcon };
}

export const ResidentModeContext = createContext<ResidentMode | null>(null);

export function useResidentMode(): ResidentMode {
  const value = useContext(ResidentModeContext);
  if (!value) throw new Error('useResidentMode must be used inside <ResidentApp>');
  return value;
}
