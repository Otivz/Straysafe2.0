import type {
  AnimalType, CaseStatus, CategoryId, ClaimStatus, ComplianceResult, ContactMethod, DispositionId, EvidenceSufficiency,
  FollowUpKind, IdentityStatus, IncidentVerification, NoticeStatus, NoticeType, OutcomeGroup, OwnershipStatus, Priority,
  ReferralStatus, UrgencyLevel, WarningDelivery,
} from './types';

export type Tone = 'neutral' | 'brand' | 'amber' | 'sage' | 'red' | 'ink';

export const CATEGORIES: Record<CategoryId, { label: string; description: string; /** nuisance-type concerns that can involve an owner violation */ violation: boolean }> = {
  lost_pet: { label: 'Lost Pet', description: 'A resident’s pet is missing.', violation: false },
  found_animal: { label: 'Found / Unidentified Animal', description: 'An animal with no known owner was found or sighted.', violation: false },
  nuisance: { label: 'Animal Nuisance', description: 'Repeated disturbance, roaming or noise from an animal.', violation: true },
  safety: { label: 'Animal Safety Concern', description: 'Aggressive animal, bite or another risk to residents.', violation: true },
  injured: { label: 'Injured / Distressed Animal', description: 'An animal that appears hurt, trapped or in distress.', violation: false },
  other: { label: 'Other Animal Concern', description: 'Any other animal-related concern.', violation: false },
};
export const CATEGORY_IDS = Object.keys(CATEGORIES) as CategoryId[];

export const STATUSES: Record<CaseStatus, { label: string; description: string; tone: Tone; rank: number }> = {
  reported: { label: 'Reported', description: 'Submitted and waiting to be assessed.', tone: 'amber', rank: 0 },
  under_review: { label: 'Under review', description: 'Being assessed.', tone: 'neutral', rank: 1 },
  in_progress: { label: 'In progress', description: 'Action, coordination or monitoring is ongoing.', tone: 'brand', rank: 2 },
  closed: { label: 'Closed', description: 'A documented outcome has been recorded.', tone: 'ink', rank: 3 },
};

export const PRIORITIES: Record<Priority, { label: string; description: string; rank: number }> = {
  urgent: { label: 'Urgent', description: 'Possible immediate risk to people or the animal. Coordinate safety first.', rank: 3 },
  high: { label: 'High', description: 'Needs prompt attention within the day.', rank: 2 },
  normal: { label: 'Normal', description: 'Routine handling.', rank: 1 },
  low: { label: 'Low', description: 'No time pressure.', rank: 0 },
};
export const PRIORITY_IDS = Object.keys(PRIORITIES) as Priority[];

export const ANIMAL_TYPES: Record<AnimalType, string> = {
  dog: 'Dog', cat: 'Cat', bird: 'Bird', small_mammal: 'Small mammal', reptile: 'Reptile',
  livestock: 'Livestock', wildlife: 'Wildlife', other: 'Other / unknown',
};
export const ANIMAL_TYPE_IDS = Object.keys(ANIMAL_TYPES) as AnimalType[];

export const OWNERSHIP: Record<OwnershipStatus, { label: string; description: string; tone: Tone }> = {
  unknown: { label: 'Unknown', description: 'No potential owner has been identified.', tone: 'neutral' },
  claimed: { label: 'Claimed', description: 'A person has asserted ownership. Not yet assessed.', tone: 'amber' },
  under_review: { label: 'Under review', description: 'The available ownership evidence is being assessed.', tone: 'amber' },
  confirmed: { label: 'Confirmed', description: 'Ownership is sufficiently established for the relevant procedure.', tone: 'sage' },
  disputed: { label: 'Disputed', description: 'Ownership is contested.', tone: 'red' },
  unconfirmed: { label: 'Unconfirmed', description: 'The available evidence is insufficient.', tone: 'neutral' },
};
export const OWNERSHIP_IDS = Object.keys(OWNERSHIP) as OwnershipStatus[];

export const IDENTITY: Record<IdentityStatus, { label: string; description: string; tone: Tone }> = {
  unidentified: { label: 'Not identified', description: 'The animal has not been matched to a known animal.', tone: 'neutral' },
  possible_match: { label: 'Possible match', description: 'One or more candidates are being compared. Not confirmed.', tone: 'amber' },
  identified: { label: 'Identity confirmed', description: 'The animal was identified by an explicit decision.', tone: 'sage' },
};

export const VERIFICATION: Record<IncidentVerification, { label: string; description: string }> = {
  not_reviewed: { label: 'Not yet reviewed', description: 'No decision recorded.' },
  verified: { label: 'Verified', description: 'The incident is supported by the available evidence.' },
  partial: { label: 'Partly verified', description: 'Some, but not all, of the report is supported.' },
  unverified: { label: 'Could not be verified', description: 'There is not enough information to confirm it.' },
  invalid: { label: 'Invalid report', description: 'The report was determined not to be valid.' },
};
export const SUFFICIENCY: Record<EvidenceSufficiency, string> = {
  not_assessed: 'Not assessed', sufficient: 'Sufficient for the next step', needs_more: 'More information needed',
};
export const URGENCY: Record<UrgencyLevel, { label: string; description: string }> = {
  not_assessed: { label: 'Not assessed', description: '' },
  immediate: { label: 'Immediate risk', description: 'People or the animal may be in immediate danger.' },
  possible: { label: 'Possible risk', description: 'Risk is plausible but not confirmed.' },
  none: { label: 'No immediate risk', description: 'Routine handling is appropriate.' },
};

export const DISPOSITIONS: Record<DispositionId, { label: string; group: OutcomeGroup; description: string }> = {
  resolved_intervention: { label: 'Concern resolved through intervention', group: 'resolved', description: 'Action taken by the subdivision or a partner resolved the concern.' },
  owner_compliance: { label: 'Owner compliance verified', group: 'resolved', description: 'A recorded warning was followed and compliance was observed.' },
  pet_recovered: { label: 'Missing pet recovered', group: 'resolved', description: 'The lost pet was found and returned or confirmed safe.' },
  handed_off: { label: 'Handed off, no remaining subdivision action', group: 'unresolved', description: 'An external authority took over and the subdivision has nothing left to do. The result is not confirmed as resolved.' },
  no_further_sightings: { label: 'No further sightings; monitoring ended', group: 'unresolved', description: 'The animal was not seen again and continued monitoring is no longer appropriate.' },
  unresolved_other: { label: 'Closed without confirmed resolution', group: 'unresolved', description: 'Closed for another reason. Explain it in the closure reason.' },
  invalid_report: { label: 'Report determined invalid', group: 'invalid', description: 'The report was not valid. No intervention was needed.' },
  duplicate_report: { label: 'Duplicate of another report', group: 'invalid', description: 'Covered by another case. Link the related report first.' },
};
export const DISPOSITION_IDS = Object.keys(DISPOSITIONS) as DispositionId[];
export const OUTCOME_GROUPS: Record<OutcomeGroup, { label: string; heading: string; tone: Tone }> = {
  resolved: { label: 'Resolved', heading: 'Concern resolved', tone: 'sage' },
  unresolved: { label: 'Not resolved', heading: 'Closed without confirmed resolution', tone: 'amber' },
  invalid: { label: 'No action needed', heading: 'Not a valid concern', tone: 'neutral' },
};

export const REFERRAL_STATUS: Record<ReferralStatus, { label: string; tone: Tone; open: boolean }> = {
  sent: { label: 'Sent', tone: 'amber', open: true },
  acknowledged: { label: 'Acknowledged', tone: 'amber', open: true },
  in_progress: { label: 'In progress', tone: 'brand', open: true },
  completed: { label: 'Completed externally', tone: 'sage', open: false },
  declined: { label: 'Declined', tone: 'neutral', open: false },
  no_response: { label: 'No response', tone: 'red', open: true },
};
export const REFERRAL_STATUS_IDS = Object.keys(REFERRAL_STATUS) as ReferralStatus[];

export const ORGANIZATIONS = [
  { id: 'barangay', name: 'Barangay Hall — Peace & Order', kind: 'Barangay' },
  { id: 'animal_control', name: 'Animal Control Personnel', kind: 'Animal control' },
  { id: 'vet_office', name: 'City Veterinary Office', kind: 'Veterinary' },
  { id: 'welfare', name: 'Local Animal Welfare Group', kind: 'Animal welfare' },
  { id: 'wildlife', name: 'Wildlife Response Unit', kind: 'Wildlife' },
] as const;

export const FOLLOWUP_KINDS: Record<FollowUpKind, string> = {
  follow_up: 'Follow-up', site_check: 'Site check', reporter_update: 'Update from reporter',
  referral_check: 'Referral check', warning_end: 'End of observation', post_closure: 'Post-closure check',
};
export const FOLLOWUP_MANUAL_KINDS: FollowUpKind[] = ['follow_up', 'site_check', 'reporter_update', 'referral_check'];

export const CONTACT_METHODS: Record<ContactMethod, string> = {
  in_person: 'In person', phone: 'Phone call', message: 'Message', letter: 'Written notice',
};
export const CONTACT_OUTCOMES = {
  cooperative: 'Cooperative / will act', denied_ownership: 'Denies ownership', no_response: 'No response', other: 'Other',
} as const;
export const WARNING_DELIVERY: Record<WarningDelivery, string> = { verbal: 'Verbal', written: 'Written notice', in_app: 'In-app notice' };
export const COMPLIANCE_RESULTS: Record<ComplianceResult, { label: string; tone: Tone }> = {
  compliant: { label: 'Compliant', tone: 'sage' },
  partial: { label: 'Partly compliant', tone: 'amber' },
  non_compliant: { label: 'Not compliant', tone: 'red' },
  unable_to_observe: { label: 'Unable to observe', tone: 'neutral' },
};

export const CLAIM_STATUS: Record<ClaimStatus, { label: string; tone: Tone }> = {
  submitted: { label: 'New claim', tone: 'amber' },
  under_review: { label: 'Under review', tone: 'amber' },
  needs_info: { label: 'More information needed', tone: 'neutral' },
  accepted: { label: 'Accepted', tone: 'sage' },
  rejected: { label: 'Not accepted', tone: 'neutral' },
};

/** Evidence an administrator may rely on. Pet registration is owner-declared, so it can never be the only basis. */
export const OWNERSHIP_EVIDENCE = [
  { id: 'registry', label: 'Registered pet profile', weak: true },
  { id: 'photos', label: 'Photos of the animal with the person' },
  { id: 'markings', label: 'Distinctive markings match' },
  { id: 'cctv', label: 'CCTV or guardhouse record' },
  { id: 'firsthand', label: 'Firsthand observation by an administrator' },
  { id: 'interactions', label: 'Previous documented interactions' },
  { id: 'statement', label: 'Owner statement' },
  { id: 'vet', label: 'Veterinary or vaccination record' },
] as const;

export const NOTICE_TYPES: Record<NoticeType, { label: string; plural: string; hint: string }> = {
  lost_pet: { label: 'Lost pet', plural: 'Lost pets', hint: 'Help neighbours recognise a missing pet.' },
  found_animal: { label: 'Found animal', plural: 'Found animals', hint: 'Help the owner of a found animal come forward.' },
  safety_advisory: { label: 'Safety advisory', plural: 'Safety advisories', hint: 'Share observed concerns and reasonable precautions.' },
};
export const NOTICE_STATUS: Record<NoticeStatus, { label: string; tone: Tone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  published: { label: 'Published', tone: 'sage' },
  archived: { label: 'Archived', tone: 'neutral' },
};

export const RESIDENT_STATUS: Record<'active' | 'pending' | 'suspended', { label: string; tone: Tone; description: string }> = {
  active: { label: 'Active', tone: 'sage', description: 'Can sign in and use StraySafe.' },
  pending: { label: 'Pending verification', tone: 'amber', description: 'Registered, but the account has not been verified yet.' },
  suspended: { label: 'Suspended', tone: 'red', description: 'Cannot sign in until reactivated.' },
};

export const VACCINATION = { up_to_date: 'Up to date', overdue: 'Overdue', unknown: 'Not recorded' } as const;

export const SIZE_LABEL = { small: 'Small', medium: 'Medium', large: 'Large' } as const;
