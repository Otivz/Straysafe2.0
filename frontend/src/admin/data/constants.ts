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

/** The reporter named a registered pet and nobody on the team has decided who the animal is: shown instead of "Identity confirmed". */
export const LINKED_BY_REPORTER: { label: string; description: string; tone: Tone } = {
  label: 'Linked by the reporter', description: 'The reporter named this registered pet. Nobody on the team has confirmed the animal yet.', tone: 'neutral',
};
/** How an identity reads: a status the team decided, or only the reporter's own link. */
export const identityDisplay = (status: IdentityStatus, decided?: boolean) => (status === 'identified' && decided === false ? LINKED_BY_REPORTER : IDENTITY[status]);

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
  withdrawn_by_reporter: { label: 'Withdrawn by the reporter', group: 'invalid', description: 'The owner withdrew their own report. Only the owner can do this.' },
};
export const DISPOSITION_IDS = Object.keys(DISPOSITIONS) as DispositionId[];
/** What a Leader may choose when closing a case. A withdrawal is the reporter's own act, so it is never offered here. */
export const OFFERED_DISPOSITION_IDS = DISPOSITION_IDS.filter((d) => d !== 'withdrawn_by_reporter');
export const OUTCOME_GROUPS: Record<OutcomeGroup, { label: string; heading: string; tone: Tone }> = {
  resolved: { label: 'Resolved', heading: 'Concern resolved', tone: 'sage' },
  unresolved: { label: 'Not resolved', heading: 'Closed without confirmed resolution', tone: 'amber' },
  invalid: { label: 'No action needed', heading: 'Not a valid concern', tone: 'neutral' },
};

export const REFERRAL_STATUS: Record<ReferralStatus, { label: string; tone: Tone; open: boolean; description?: string }> = {
  pending: { label: 'Pending', tone: 'amber', open: true, description: 'Referral has been created and is awaiting dispatch.' },
  to_contact: { label: 'Pending', tone: 'amber', open: true, description: 'Referral has been created and is awaiting dispatch.' },
  sent: { label: 'Sent', tone: 'amber', open: true, description: 'Referral has been sent or communicated to the receiving agency.' },
  acknowledged: { label: 'Acknowledged', tone: 'amber', open: true, description: 'The external agency confirmed receipt of the referral.' },
  in_progress: { label: 'In Progress', tone: 'brand', open: true, description: 'The external agency is actively handling or assisting with the case.' },
  awaiting_response: { label: 'Awaiting Response', tone: 'amber', open: true, description: 'Waiting for feedback or update from the external agency.' },
  no_response: { label: 'Awaiting Response', tone: 'red', open: true, description: 'Waiting for feedback or response from the external agency.' },
  resolved: { label: 'Resolved', tone: 'sage', open: false, description: 'The referral objective has been completed by the external agency.' },
  completed: { label: 'Resolved', tone: 'sage', open: false, description: 'The referral objective has been completed by the external agency.' },
  declined: { label: 'Declined', tone: 'red', open: false, description: 'The external agency could not accept or handle the referral.' },
  cancelled: { label: 'Cancelled', tone: 'neutral', open: false, description: 'The referral was cancelled by the referring office.' },
};
export const REFERRAL_STATUS_IDS = Object.keys(REFERRAL_STATUS) as ReferralStatus[];
/** The 8 standard referral statuses exposed in the External Referral Management workflow. */
export const PRIMARY_REFERRAL_STATUS_IDS: ReferralStatus[] = [
  'pending',
  'sent',
  'acknowledged',
  'in_progress',
  'awaiting_response',
  'resolved',
  'declined',
  'cancelled',
];

export const REFERRAL_PRIORITY_LABELS: Record<'normal' | 'high' | 'urgent', { label: string; tone: Tone }> = {
  normal: { label: 'Normal', tone: 'neutral' },
  high: { label: 'High', tone: 'amber' },
  urgent: { label: 'Urgent', tone: 'red' },
};

export const ORGANIZATIONS = [
  { id: 'barangay', name: 'Barangay Hall — Peace & Order', kind: 'Barangay' },
  { id: 'vet_office', name: 'City Veterinary Office', kind: 'Veterinary' },
  { id: 'animal_control', name: 'Animal Control Personnel', kind: 'Animal control' },
  { id: 'welfare', name: 'Local Animal Welfare / Rescue Group', kind: 'Animal welfare' },
  { id: 'wildlife', name: 'Wildlife Response Unit (DENR / LGU)', kind: 'Wildlife' },
  { id: 'other', name: 'Other External Agency / Clinic', kind: 'Other agency' },
] as const;

export const FOLLOWUP_KINDS: Record<FollowUpKind, string> = {
  follow_up: 'Follow-up',
  coordination_update: 'Coordination Update',
  rescue_update: 'Rescue Update',
  welfare_check: 'Welfare Check',
  site_check: 'Site check',
  reporter_update: 'Update from reporter',
  referral_check: 'Referral check',
  warning_end: 'End of observation',
  post_closure: 'Post-closure check',
};
export const FOLLOWUP_MANUAL_KINDS: FollowUpKind[] = ['follow_up', 'coordination_update', 'rescue_update', 'welfare_check'];

/** How an owner's confirmation that the pet is home reached the record. */
export const RECOVERY_SOURCES: Record<'owner_app' | 'phone' | 'in_person', string> = { owner_app: 'In the app', phone: 'By phone', in_person: 'In person' };

export const CONTACT_METHODS: Record<ContactMethod, string> = {
  phone: 'Phone Call',
  email: 'Email',
  in_person: 'In-Person',
  message: 'Message',
  letter: 'Written notice',
  other: 'Other',
};
export const STANDARD_CONTACT_METHODS: { id: ContactMethod; label: string }[] = [
  { id: 'phone', label: 'Phone Call' },
  { id: 'email', label: 'Email' },
  { id: 'in_person', label: 'In-Person' },
  { id: 'other', label: 'Other' },
];
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

export const LANDMARK_CATEGORIES: { value: string; label: string }[] = [
  { value: 'gate', label: 'Main Gate / Entrance' },
  { value: 'park', label: 'Park / Clubhouse' },
  { value: 'street', label: 'Street / Block Corner' },
  { value: 'office', label: 'Guardhouse / Admin Office' },
  { value: 'general', label: 'General Landmark' },
];

export const WELFARE_OUTCOMES = [
  'Treated and Released',
  'Retrieved by Owner',
  'Transferred to Veterinary Clinic',
  'Transferred to Animal Shelter / Barangay',
  'Under Continued Monitoring',
  'Deceased / Humanely Handled',
  'Other',
] as const;

export const DANGEROUS_OUTCOMES = [
  'Animal No Longer Present',
  'Animal Behavior No Longer Threatening',
  'Retrieved or Handled by Authorized Personnel',
  'Referred to Appropriate Authorities',
  'Owner Identified and Contacted',
  'Under Continued Monitoring',
  'Other',
] as const;

export const CONCERN_STATUS_META: Record<'ongoing_assessment' | 'in_progress' | 'resolved' | 'not_applicable', { label: string; tone: Tone }> = {
  ongoing_assessment: { label: 'Ongoing Assessment', tone: 'amber' },
  in_progress: { label: 'In Progress', tone: 'brand' },
  resolved: { label: 'Resolved', tone: 'sage' },
  not_applicable: { label: 'Dismissed / N/A', tone: 'neutral' },
};
