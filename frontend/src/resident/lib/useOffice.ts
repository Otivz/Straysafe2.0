import { useResidentData } from '../data/context';
import type { Office } from '../data/types';

/**
 * How to reach the subdivision office: what the Leader recorded in the subdivision's settings, or nothing (`office: null`) when no
 * details were recorded, never an invented office.
 */
export function useOffice(): { office: Office | null } {
  const { state } = useResidentData();
  return { office: state.office ?? null };
}

/** The subdivision's name for a greeting: the server's, or a neutral fallback. */
export function useSubdivisionName(): string {
  const { state } = useResidentData();
  return state.subdivisionName?.trim() || 'Your subdivision';
}
