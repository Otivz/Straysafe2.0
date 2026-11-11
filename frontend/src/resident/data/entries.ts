/**
 * What the Report screens offer a resident, in a resident's words, and how each choice maps to the six kinds of report the subdivision
 * works with (`CategoryId`). The six keep their identifiers, their stored categories and every rule that depends on them (privacy,
 * notices, warnings, counting): this file only groups them for the resident, so nothing about how a report is filed or handled lives here.
 *
 *   Lost pet            -> lost_pet
 *   Animal complaint    -> nuisance
 *   Report an animal    -> asks "What’s happening with the animal?" -> found_animal | injured | safety | other
 *
 * Imports carry their `.ts` extension so the unit tests can load this file as it is (tests/residentCategories.test.mjs).
 */
import { CATEGORIES } from './constants.ts';
import type { CategoryId, Draft, ResidentState } from './types.ts';

export type EntryId = 'lost_pet' | 'complaint' | 'animal';

export const SITUATION_QUESTION = 'What’s happening with the animal?';

/** Said wherever a lost-pet report is asked for and the resident has no registered pet (the server refuses it with the same words). */
export const REGISTER_FIRST = 'Register your pet first to report it missing.';

/** The answers to the question, in the order shown. Each one is filed as one of the existing kinds of report and opens that kind's own form. */
export const SITUATIONS: { family: CategoryId; title: string }[] = [
  { family: 'found_animal', title: 'It looks lost or has no owner nearby' },
  { family: 'injured', title: 'It is hurt or needs help' },
  { family: 'safety', title: 'It may be dangerous' },
  { family: 'other', title: 'Something else, or I’m not sure' },
];

/** The first Report screen. `filter` is the wording of the same group in the My reports filter. */
export const ENTRIES: Record<EntryId, { title: string; blurb: string; filter: string; families: CategoryId[] }> = {
  lost_pet: { title: 'Lost pet', blurb: 'My pet is missing.', filter: 'Lost pets', families: ['lost_pet'] },
  complaint: { title: 'Animal complaint', blurb: 'An animal is causing a problem.', filter: 'Animal complaints', families: ['nuisance'] },
  animal: { title: 'Report an animal', blurb: 'I saw an animal that may need attention.', filter: 'Animals reported', families: SITUATIONS.map((s) => s.family) },
};
export const ENTRY_IDS = Object.keys(ENTRIES) as EntryId[];

/** Which entry a kind of report belongs to (every kind belongs to exactly one, an older report's included). */
export const entryOf = (family: CategoryId): EntryId => ENTRY_IDS.find((id) => ENTRIES[id].families.includes(family)) ?? 'animal';

type Accepting = ResidentState['accepting'];

/** True only when the server has said the subdivision accepts this kind of report (an unread or unreadable answer is not a yes). */
export const accepts = (accepting: Accepting, family: CategoryId): boolean => accepting?.[family] === true;
export const offeredSituations = (accepting: Accepting) => SITUATIONS.filter((s) => accepts(accepting, s.family));
/** An entry is offered while at least one of its kinds is accepted; "Report an animal" disappears when all four are switched off. */
export const offeredEntries = (accepting: Accepting): EntryId[] => ENTRY_IDS.filter((id) => ENTRIES[id].families.some((f) => accepts(accepting, f)));

/**
 * What a resident has already written, carried over to another kind of report when theirs stopped being accepted before they sent it.
 * What the new kind cannot hold is left out (a pet's name, the answer to the old kind's extra question, videos on a lost or found
 * report); the details form still checks everything again, so nothing reaches the server unchecked.
 */
export function carryOver(from: Draft, to: CategoryId): Partial<Draft> {
  const kind = CATEGORIES[to].kind;
  // A Lost Pet report is about one registered pet and asks only when and where it was last seen: nothing else is carried into it.
  if (kind === 'lost') return { observedAt: from.observedAt, location: from.location };
  return {
    description: from.description,
    observedAt: from.observedAt,
    location: from.location,
    animalType: from.animalType,
    media: kind === 'incident' ? from.media : from.media.filter((m) => m.kind === 'photo').slice(0, 3),
  };
}

/** What the first step says about the notice, which follows the subdivision's publication setting. */
export const LOST_NOTE = { tone: 'info', text: 'After you submit, a notice with your pet’s photo, description and the general area is visible to neighbours. Your name, phone and address are never shown.' } as const;
export const LOST_REVIEWED_NOTE = { tone: 'info', text: 'An administrator reviews this before a notice is shown to neighbours. Once it is, the notice shows your pet’s photo, description and the general area. Your name, phone and address are never shown.' } as const;
