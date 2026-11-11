import type { AnimalType, CaseStatus, CategoryId, ClaimStatus, NoticeType, ReportKind } from './types';

export type Tone = 'neutral' | 'brand' | 'amber' | 'sage' | 'red';

/**
 * The six kinds of report the subdivision works with. `label` is what a resident reads once a kind is chosen (the form's step line, My
 * reports, a report's details), in plain words; the identifiers, the stored categories and the Leader's own names for them are unchanged.
 * How the first Report screen groups the six is data/entries.ts. `private` ones are never published automatically.
 */
export const CATEGORIES: Record<CategoryId, { label: string; kind: ReportKind; private: boolean; careful?: boolean }> = {
  lost_pet: { label: 'Lost pet', kind: 'lost', private: false },
  found_animal: { label: 'Lost or stray animal', kind: 'found', private: false },
  nuisance: { label: 'Animal complaint', kind: 'incident', private: true },
  safety: { label: 'Possibly dangerous animal', kind: 'incident', private: true, careful: true },
  injured: { label: 'Animal that needs help', kind: 'incident', private: true, careful: true },
  other: { label: 'Other animal report', kind: 'incident', private: true },
};

/** One short multiple-choice question that helps an administrator, for the categories that benefit from it. */
export const EXTRA_FIELD: Partial<Record<CategoryId, { label: string; options: string[] }>> = {
  nuisance: { label: 'How often does it happen?', options: ['Once', 'Now and then', 'Often', 'Every day'] },
  injured: { label: 'Can the animal move?', options: ['Yes', 'A little', 'No', 'Not sure'] },
  found_animal: { label: 'Where is the animal now?', options: ['With me', 'Where I found it', 'With a neighbour', 'Not sure'] },
};

/** What happens to a report after it is sent. Shown before submitting and after, so nothing is a surprise. */
export const VISIBILITY_COPY = {
  private: { short: 'Private', long: 'Only authorized subdivision administrators can see this report. It never appears in Community.' },
  pending_review: { short: 'Awaiting review', long: 'An administrator reviews this before any notice is shared. Until then it stays private.' },
  published: { short: 'Visible to neighbours', long: 'A notice from this report is visible to neighbours. It shows the animal, the general area and when it was seen. Your name, phone and address are never shown.' },
} as const;

export const ANIMAL_TYPES: Record<AnimalType, string> = {
  dog: 'Dog', cat: 'Cat', bird: 'Bird', small_mammal: 'Small mammal', reptile: 'Reptile', livestock: 'Livestock', wildlife: 'Wild animal', other: 'Other / not sure',
};
export const ANIMAL_TYPE_IDS = Object.keys(ANIMAL_TYPES) as AnimalType[];
/** Types a resident can register as a pet (not livestock or wildlife). */
export const PET_TYPE_IDS: AnimalType[] = ['dog', 'cat', 'bird', 'small_mammal', 'reptile', 'other'];

/** The same four global statuses as the Admin UI. */
export const STATUS: Record<CaseStatus, { label: string; tone: Tone; hint: string; rank: number }> = {
  reported: { label: 'Reported', tone: 'amber', hint: 'Received and waiting for an administrator.', rank: 0 },
  under_review: { label: 'Under review', tone: 'neutral', hint: 'An administrator is looking at it.', rank: 1 },
  in_progress: { label: 'In progress', tone: 'brand', hint: 'Action or follow-up is under way.', rank: 2 },
  closed: { label: 'Closed', tone: 'neutral', hint: 'A final outcome was recorded.', rank: 3 },
};

/** Ownership-claim states. Separate from the case statuses on purpose. */
export const CLAIM_STATUS: Record<ClaimStatus, { label: string; tone: Tone; hint: string }> = {
  submitted: { label: 'Submitted', tone: 'amber', hint: 'Waiting for an administrator to start the review.' },
  under_review: { label: 'Under review', tone: 'neutral', hint: 'An administrator is comparing your information.' },
  needs_info: { label: 'More information requested', tone: 'amber', hint: 'An administrator needs a little more from you.' },
  approved: { label: 'Approved', tone: 'sage', hint: 'The subdivision accepted your claim.' },
  rejected: { label: 'Not approved', tone: 'neutral', hint: 'The information was not enough to confirm ownership.' },
};

export const NOTICE_TYPES: Record<NoticeType, { label: string; plural: string }> = {
  lost_pet: { label: 'Lost pet', plural: 'Lost pets' },
  found_animal: { label: 'Found animal', plural: 'Found animals' },
  safety_advisory: { label: 'Safety advisory', plural: 'Safety advisories' },
};
