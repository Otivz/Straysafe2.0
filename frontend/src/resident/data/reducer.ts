/**
 * The device-local part of the Resident data: a report being written (the draft) and the read marks of notifications. Everything else a
 * screen changes is the server's (src/resident/live/actions.ts): `ResidentAction` is the full set of changes a screen can ask for, and
 * the data layer turns each one into one or a few requests. Timestamps arrive on the action, so the reducer stays pure under StrictMode.
 */
import { toLocalInput } from '../../preview/lib/format';
import type { CategoryId, Draft, GeoPoint, Media, Pet, Profile, ReportKind, ResidentState, Settings } from './types';

export type ResidentAction =
  | { type: 'draft/start'; kind: ReportKind; category: CategoryId; patch?: Partial<Draft> }
  | { type: 'draft/patch'; patch: Partial<Draft> }
  | { type: 'draft/clear' }
  | { type: 'report/submit' }
  | { type: 'report/addUpdate'; reportId: string; text: string; media?: Media[] }
  | { type: 'lost/recover'; reportId: string; note: string }
  | { type: 'sighting/add'; noticeId: string; observedAt: string; location: GeoPoint; description: string; onBehalf: boolean; photos: number; /** the photos themselves (the app uploads the first) */ media?: Media[] }
  | { type: 'claim/submit'; noticeId: string; petId: string | null; statement: string; evidence: string[]; /** the photos themselves (the app uploads them as the claim's evidence) */ media?: Media[] }
  | { type: 'claim/addInfo'; claimId: string; text: string }
  | { type: 'pet/save'; pet: Pet; /** the photo file the person just chose (the app uploads it) */ photo?: File }
  | { type: 'notification/read'; id: string }
  | { type: 'notification/readAll' }
  | { type: 'profile/update'; patch: Partial<Pick<Profile, 'name' | 'email' | 'phone' | 'unit' | 'street'>> }
  | { type: 'settings/set'; settings: Settings }
  | { type: 'contact/send'; topic: string; message: string };

export type Stamped = ResidentAction & { now: string };

export const refId = (n: number) => `SS-2026-${String(n).padStart(4, '0')}`;

export const emptyDraft = (kind: ReportKind, category: CategoryId, now: string): Draft => ({
  kind, category, animalType: '', petId: null, petName: '', description: '', observedAt: toLocalInput(now), location: null, media: [], extra: '',
});

/** Applies the local actions (the draft and the read marks). Every other action is handled by the server, never by this reducer. */
export function reducer(state: ResidentState, a: Stamped): ResidentState {
  switch (a.type) {
    case 'draft/start':
      return { ...state, draft: { ...emptyDraft(a.kind, a.category, a.now), ...a.patch } };
    case 'draft/patch':
      return state.draft ? { ...state, draft: { ...state.draft, ...a.patch } } : state;
    case 'draft/clear':
      return { ...state, draft: null };
    case 'notification/read':
      return { ...state, notifications: state.notifications.map((n) => (n.id === a.id ? { ...n, read: true } : n)) };
    case 'notification/readAll':
      return { ...state, notifications: state.notifications.map((n) => ({ ...n, read: true })) };
    default:
      return state;
  }
}
