/**
 * SAMPLE DATA for the development preview. Entirely fictional: no real people, pets, phone numbers or addresses.
 * Dates are generated relative to "now" so overdue / due today / upcoming always make sense when the preview opens.
 * This file is the only place mock records live; nothing here is used by the API layer.
 */
import { samplePoint } from '../../preview/geo';
import { DISPOSITIONS, ORGANIZATIONS, STATUSES } from './constants';
import type {
  AdminNotification, AdminState, Assessment, Case, CaseStatus, CategoryId, DispositionId, Evidence, FollowUp, Notice, Pet,
  Policy, Priority, Referral, ReferralStatus, Reporter, Resident, TimelineEvent, AnimalType,
} from './types';

export const ADMIN_ACTOR = 'Carla Mendoza';
const A = ADMIN_ACTOR;

export function buildSeed(now: Date): AdminState {
  const T = now.getTime();
  const minsAgo = (m: number) => new Date(T - m * 60_000).toISOString();
  const hoursAgo = (h: number) => minsAgo(h * 60);
  const inHours = (h: number) => new Date(T + h * 3_600_000).toISOString();
  const dayAt = (d: number, h: number, m = 0) => { const x = new Date(now); x.setDate(x.getDate() - d); x.setHours(h, m, 0, 0); return x.toISOString(); };
  const aheadAt = (d: number, h: number, m = 0) => dayAt(-d, h, m);

  let n = 0;
  const sid = (p: string) => `${p}-s${++n}`;
  const ev = (at: string, actor: string, kind: TimelineEvent['kind'], title: string, detail?: string): TimelineEvent => ({ id: sid('ev'), at, actor, kind, title, detail });
  const st = (at: string, to: CaseStatus, detail?: string) => ev(at, A, 'status', `Status changed to ${STATUSES[to].label}`, detail);

  // ---------------------------------------------------------------------------------------------------- residents
  const mkRes = (num: number, name: string, unit: string, street: string, status: Resident['status'], joined: number, active: number): Resident => ({
    id: `res-${num}`, name, unit, street,
    phone: `0917 000 01${String(num).padStart(2, '0')}`,
    email: `${name.toLowerCase().replace(/[^a-z ]/g, '').replace(/ /g, '.')}@mail.example`,
    status, joinedAt: dayAt(joined, 10), lastActiveAt: hoursAgo(active), petIds: [],
  });
  const residents: Resident[] = [
    mkRes(1, 'Rafael Aquino', 'Block 7, Lot 12', 'Acacia St.', 'active', 380, 6),
    mkRes(2, 'Teresita Villanueva', 'Block 7, Lot 14', 'Acacia St.', 'active', 410, 30),
    mkRes(3, 'Jomar Dela Cruz', 'Block 12, Lot 3', 'Narra Ave.', 'active', 220, 3),
    mkRes(4, 'Angelica Reyes', 'Block 4, Lot 21', 'Molave St.', 'active', 300, 1),
    mkRes(5, 'Mark Anthony Santos', 'Block 9, Lot 8', 'Narra Ave.', 'active', 150, 2),
    mkRes(6, 'Beatrice Navarro', 'Block 4, Lot 7', 'Molave St.', 'active', 500, 14),
    mkRes(7, 'Dennis Garcia', 'Block 7, Lot 9', 'Acacia St.', 'pending', 12, 20),
    mkRes(8, 'Lourdes Mercado', 'Block 11, Lot 17', 'Narra Ave.', 'active', 260, 5),
    mkRes(9, 'Paolo Castillo', 'Block 3, Lot 2', 'Molave St.', 'active', 90, 40),
    mkRes(10, 'Imelda Salazar', 'Block 5, Lot 11', 'Acacia St.', 'suspended', 340, 700),
    mkRes(11, 'Ricardo Pascual', 'Block 4, Lot 14', 'Molave St.', 'active', 280, 9),
    mkRes(12, 'Grace Domingo', 'Block 5, Lot 3', 'Acacia St.', 'active', 190, 4),
    mkRes(13, 'Nestor Flores', 'Block 8, Lot 14', 'Narra Ave.', 'active', 120, 26),
    mkRes(14, 'Hannah Lim', 'Block 6, Lot 3', 'Acacia St.', 'pending', 6, 50),
  ];

  // ---------------------------------------------------------------------------------------------------------- pets
  const mkPet = (num: number, name: string, type: AnimalType, breed: string, color: string, sex: Pet['sex'], age: string, size: Pet['size'],
    markings: string[], description: string, photos: number, ownerNum: number, vax: Pet['vaccination'] = 'up_to_date'): Pet => ({
    id: `pet-${num}`, name, type, breed, color, sex, ageText: age, size, markings, description, photos, ownerId: `res-${ownerNum}`,
    registeredAt: dayAt(120 + num * 17, 11), vaccination: vax, microchipped: num % 4 === 0,
  });
  const pets: Pet[] = [
    mkPet(1, 'Brownie', 'dog', 'Labrador mix', 'Brown', 'male', '4 years', 'large', ['White patch on chest', 'Notched left ear'], 'Friendly and large. Usually kept indoors at night.', 3, 1),
    mkPet(2, 'Mochi', 'dog', 'Shih Tzu', 'White and gold', 'female', '3 years', 'small', ['Gold ear tips', 'Pink collar with tag'], 'Shy with strangers. Answers to her name.', 4, 4),
    mkPet(3, 'Luna', 'cat', 'Domestic shorthair', 'Gray tabby', 'female', '2 years', 'small', ['White paws', 'Green collar'], 'Indoor-outdoor cat, usually home by dusk.', 3, 5),
    mkPet(4, 'Kiko', 'bird', 'Cockatiel', 'Gray and yellow', 'unknown', '5 years', 'small', ['Orange cheek patches'], 'Kept in an aviary on the porch.', 2, 6),
    mkPet(5, 'Snow', 'small_mammal', 'Rabbit (Dutch mix)', 'White with gray ears', 'female', '1 year', 'small', ['Gray ears'], 'Kept in an outdoor hutch.', 2, 6),
    mkPet(6, 'Coco', 'dog', 'Aspin', 'Tan with a black muzzle', 'male', '6 years', 'medium', ['Kinked tail', 'Black muzzle'], 'Calm and friendly. Wears a red collar.', 4, 8),
    mkPet(7, 'Tiger', 'cat', 'Domestic shorthair', 'Orange tabby', 'male', '4 years', 'medium', [], 'Stays mostly indoors.', 2, 8),
    mkPet(8, 'Spike', 'reptile', 'Bearded dragon', 'Sandy brown', 'unknown', '3 years', 'small', [], 'Kept in a terrarium.', 2, 9, 'unknown'),
    mkPet(9, 'Bruno', 'dog', 'Aspin mix', 'Black with white socks', 'male', '2 years', 'medium', ['White socks', 'Notched tail tip'], 'Energetic. Needs regular walks.', 3, 11, 'overdue'),
    mkPet(10, 'Pepper', 'cat', 'Domestic shorthair', 'Black', 'female', '3 years', 'small', ['White spot on chest'], 'Likes to explore the neighbourhood.', 2, 12),
    mkPet(11, 'Max', 'dog', 'Beagle mix', 'Tri-colour', 'male', '5 years', 'medium', ['Tri-colour saddle'], 'Follows his nose. Wears a blue harness.', 3, 13),
    mkPet(12, 'Pogi', 'dog', 'Aspin', 'Golden', 'male', '1 year', 'medium', ['Golden coat'], 'Playful puppy.', 2, 3),
  ];
  residents.forEach((r) => { r.petIds = pets.filter((p) => p.ownerId === r.id).map((p) => p.id); });
  const res = (num: number) => residents[num - 1];
  const rep = (num: number, preferred: Reporter['preferredContact'] = 'in_app'): Reporter => {
    const r = res(num);
    return { residentId: r.id, name: r.name, unit: r.unit, phone: r.phone, email: r.email, preferredContact: preferred };
  };

  // -------------------------------------------------------------------------------------------------------- policies
  const policies: Policy[] = [
    { id: 'pol-1', title: 'Animals outside the owner’s lot', reference: 'House Rules §6.3', summary: 'Owners keep pets within their lot or on a leash in common areas. After a written or verbal warning the owner has an observation period to comply.', appliesTo: ['nuisance', 'safety'], observationDays: 3, status: 'confirmed' },
    { id: 'pol-2', title: 'Noise disturbance from animals', reference: 'House Rules §6.5', summary: 'Persistent animal noise at night may lead to a warning. The HOA sets the observation period case by case.', appliesTo: ['nuisance'], observationDays: null, status: 'confirmed' },
    { id: 'pol-3', title: 'Leash requirement in common areas', reference: 'House Rules §6.1', summary: 'Awaiting HOA board confirmation of the wording and the procedure.', appliesTo: ['nuisance', 'safety'], observationDays: null, status: 'pending_confirmation' },
  ];

  // ---------------------------------------------------------------------------------------------- case construction
  const emptyAssessment = (): Assessment => ({ incident: 'not_reviewed', incidentBasis: '', evidenceSufficiency: 'not_assessed', evidenceReviewed: [], urgency: 'not_assessed', urgencyNote: '', notes: '', savedAt: null, savedBy: null });
  type CaseInput = Partial<Case> & Pick<Case, 'id' | 'category' | 'title' | 'description' | 'animal' | 'location' | 'observedAt' | 'reportedAt' | 'reporter'>;
  const mk = (c: CaseInput): Case => {
    const base: Case = {
      status: 'reported', priority: 'normal', updatedAt: c.reportedAt, sensitive: false, assignedTo: A, evidence: [],
      assessment: emptyAssessment(), identity: { status: 'unidentified', matches: {}, note: '' },
      ownership: { status: 'unknown', ownerResidentId: null, evidence: [], note: '' },
      claims: [], followUps: [], ownerContacts: [], warnings: [], referrals: [], relatedCaseIds: [], notes: [], timeline: [], closure: null,
      ...c,
    };
    base.timeline = [ev(c.reportedAt, 'Reporter', 'reported', 'Report submitted'), ...base.timeline].sort((x, y) => y.at.localeCompare(x.at));
    base.notes.sort((x, y) => y.at.localeCompare(x.at));
    base.ownerContacts.sort((x, y) => y.at.localeCompare(x.at));
    base.updatedAt = base.timeline[0].at;
    return base;
  };
  const photo = (label: string, at: string, source: Evidence['source'] = 'reporter', note?: string): Evidence => ({ id: sid('evd'), kind: 'photo', label, capturedAt: at, source, note });
  const sighting = (label: string, at: string, source: Evidence['source'] = 'resident'): Evidence => ({ id: sid('evd'), kind: 'sighting', label, capturedAt: at, source });
  const fu = (kind: FollowUp['kind'], title: string, dueAt: string | null, createdAt: string, notes?: string): FollowUp => ({ id: sid('fu'), kind, title, notes, dueAt, status: 'pending', createdAt, createdBy: A });
  const org = (id: string) => ORGANIZATIONS.find((o) => o.id === id)!;
  const referral = (orgId: string, reason: string, at: string, status: ReferralStatus, contact: string, channel: string, notes: Array<[string, string, ReferralStatus?]> = [], extra: Partial<Referral> = {}): Referral => ({
    id: sid('ref'), orgId, orgName: org(orgId).name, reason, referredAt: at, contactPerson: contact, contactChannel: channel, status,
    notes: notes.map(([t, text, s]) => ({ id: sid('rn'), at: t, by: A, text, status: s })).sort((x, y) => y.at.localeCompare(x.at)),
    createdBy: A, updatedAt: notes.length ? notes[notes.length - 1][0] : at, ...extra,
  });

  const rich: Case[] = [
    mk({
      id: 'SS-2026-0167', category: 'safety', priority: 'urgent', title: 'Aggressive dog lunging at joggers near the Phase 2 gate',
      description: 'A medium-sized brown dog has been barking and lunging at people jogging along the sidewalk beside the guardhouse. It seems to be alone and has no collar that I could see. I did not go near it. Two other joggers turned back.',
      animal: { type: 'dog', description: 'Medium build, short brown coat, no visible collar', count: 1 },
      location: { area: 'Phase 2 Gate · Acacia St.', detail: 'Sidewalk beside the guardhouse' },
      observedAt: minsAgo(52), reportedAt: minsAgo(38), reporter: rep(5),
      noPhotoReason: 'The reporter did not approach the animal and took no photo for safety.',
    }),
    mk({
      id: 'SS-2026-0166', category: 'injured', priority: 'high', title: 'Cat with an injured hind leg hiding under a parked car, Block 12',
      description: 'An orange-and-white cat is dragging its left hind leg and hiding under a silver sedan in the Lot 6 carport. It hisses when anyone gets close and looks thin. I put out water but kept my distance.',
      animal: { type: 'cat', description: 'Orange and white, limping on the left hind leg', count: 1 },
      location: { area: 'Block 12 · Narra Ave.', detail: 'Carport of Lot 6' },
      observedAt: hoursAgo(2.7), reportedAt: hoursAgo(2.2), reporter: rep(3, 'phone'),
      evidence: [photo('Cat under the car, taken from a distance', hoursAgo(2.7)), photo('Wider view of the carport', hoursAgo(2.7))],
    }),
    mk({
      id: 'SS-2026-0165', category: 'lost_pet', title: 'Missing: Shih Tzu “Mochi”, last seen near the clubhouse',
      description: 'Our Shih Tzu, Mochi, slipped out of the gate this afternoon when a delivery rider was leaving. She is small, white and gold, with a pink collar and a tag. She answers to her name but is shy with strangers.',
      animal: { type: 'dog', description: 'Shih Tzu, white and gold, pink collar with tag', count: 1 },
      location: { area: 'Clubhouse area · Molave St.', detail: 'Last seen heading toward the clubhouse' },
      observedAt: hoursAgo(5.6), reportedAt: hoursAgo(4.8), reporter: rep(4, 'phone'),
      evidence: [photo('Reference photo of Mochi at home', hoursAgo(4.8))],
      identity: { status: 'possible_match', matches: { 'pet-2': 'possible' }, note: 'The reporter says this is her registered pet. Owner-declared; not yet reviewed.' },
      ownership: { status: 'claimed', ownerResidentId: 'res-4', evidence: [], note: '' },
    }),
    mk({
      id: 'SS-2026-0162', category: 'injured', title: 'Injured pigeon unable to fly, garden at Block 5',
      description: 'A pigeon with a drooping left wing is sitting in the garden near Lot 5 and cannot fly. It lets me come close but is not eating.',
      animal: { type: 'bird', description: 'Pigeon with a drooping left wing', count: 1 },
      location: { area: 'Block 5 · Acacia St.', detail: 'Garden beside Lot 5' },
      observedAt: hoursAgo(27), reportedAt: hoursAgo(26), reporter: rep(6), status: 'in_progress',
      evidence: [photo('Pigeon in the garden', hoursAgo(27))],
      assessment: { ...emptyAssessment(), incident: 'verified', incidentBasis: 'Photo shows the drooping wing.', evidenceSufficiency: 'sufficient', evidenceReviewed: [], urgency: 'none', notes: 'Wild bird. Needs rehabilitation, not a subdivision action.', savedAt: hoursAgo(25), savedBy: A },
      referrals: [referral('welfare', 'Injured wild bird that cannot fly needs veterinary or rehabilitation care.', hoursAgo(24), 'sent', 'Volunteer coordinator', 'Group chat message', [[hoursAgo(24), 'Sent photos and the location. Asked for a time they can collect or advise.']])],
      followUps: [fu('referral_check', 'Check whether the welfare group acknowledged the referral', aheadAt(1, 9), hoursAgo(24))],
      timeline: [st(hoursAgo(25), 'under_review'), ev(hoursAgo(25), A, 'assessment', 'Assessment recorded', 'Incident verified. No immediate risk.'), ev(hoursAgo(24), A, 'referral', 'Referred to Local Animal Welfare Group'), st(hoursAgo(24), 'in_progress', 'Referral sent')],
    }),
    mk({
      id: 'SS-2026-0160', category: 'other', title: 'Three goats grazing on the vacant lot beside Block 9',
      description: 'Three goats have been grazing on the vacant lot beside Block 9 for two days. In the evenings they wander toward the road. I don’t know whose they are.',
      animal: { type: 'livestock', description: 'Three goats, one with a bell', count: 3 },
      location: { area: 'Block 9 · Narra Ave.', detail: 'Vacant lot beside Block 9' },
      observedAt: dayAt(1, 7, 30), reportedAt: dayAt(1, 8, 20), reporter: rep(13), status: 'under_review',
      evidence: [photo('Goats on the lot', dayAt(1, 7, 30)), photo('Goats near the road at dusk', dayAt(2, 17, 40))],
      assessment: { ...emptyAssessment(), incident: 'verified', incidentBasis: 'The guard confirmed the goats were there.', evidenceSufficiency: 'sufficient', urgency: 'possible', urgencyNote: 'They reach the road at dusk.', notes: 'Owner unknown. Not a subdivision pet.', savedAt: dayAt(1, 9, 5), savedBy: A },
      followUps: [fu('site_check', 'Ask the guardhouse to note where the goats go at dusk', aheadAt(1, 18), dayAt(1, 9, 5))],
      timeline: [st(dayAt(1, 9, 5), 'under_review'), ev(dayAt(1, 9, 5), A, 'assessment', 'Assessment recorded', 'Incident verified. Possible risk near the road.')],
    }),
    mk({
      id: 'SS-2026-0158', category: 'nuisance', priority: 'high', sensitive: true, title: 'Dog barking through the night and roaming off-leash, Block 7',
      description: 'A brown dog in Block 7 barks from about 11 PM to 4 AM almost every night and has been seen roaming without a leash near Lots 9 to 14. I haven’t slept properly for a week. I don’t know whose dog it is.',
      animal: { type: 'dog', description: 'Brown dog, barks at night, seen off-leash', count: 1 },
      location: { area: 'Block 7 · Acacia St.', detail: 'Lots 9–14, mostly at night' },
      observedAt: dayAt(4, 23, 30), reportedAt: dayAt(3, 8, 15), reporter: rep(2, 'email'), status: 'under_review',
      assessment: { ...emptyAssessment(), incident: 'partial', incidentBasis: 'Noise reported by two households. The guard saw the dog roaming once.', evidenceSufficiency: 'needs_more', urgency: 'none', notes: 'Do not issue a warning until ownership is established.', savedAt: dayAt(2, 14, 0), savedBy: A },
      identity: { status: 'possible_match', matches: { 'pet-1': 'possible' }, note: 'The registry shows one brown dog in Block 7. This is visual similarity only.' },
      ownership: { status: 'disputed', ownerResidentId: null, evidence: [], note: 'The suspected owner denies the dog is theirs. The statement is recorded; no further evidence yet.' },
      ownerContacts: [{ id: sid('oc'), at: dayAt(1, 16, 40), by: A, method: 'in_person', withWhom: 'Rafael Aquino (suspected owner)', summary: 'Visited Lot 12. He says his dog stays indoors at night and the barking dog is a different brown dog. He allowed a look at his dog.', outcome: 'denied_ownership' }],
      followUps: [fu('site_check', 'Ask the night guard to log barking and sightings for three nights', inHours(3), dayAt(1, 16, 50))],
      relatedCaseIds: ['SS-2026-0152'],
      notes: [{ id: sid('n'), at: dayAt(2, 14, 5), by: A, text: 'A second household reported the same noise (see SS-2026-0152). Not treating as a repeated violation until the dog is identified.' }],
      timeline: [st(dayAt(3, 9, 0), 'under_review'), ev(dayAt(2, 14, 0), A, 'assessment', 'Assessment recorded', 'Incident partly verified. More information needed.'), ev(dayAt(2, 14, 10), A, 'link', 'Linked to SS-2026-0152'), ev(dayAt(1, 16, 40), A, 'owner_contact', 'Owner coordination recorded', 'In person · Denies ownership'), ev(dayAt(1, 16, 45), A, 'ownership', 'Ownership marked Disputed', 'The suspected owner’s statement was recorded. No warning can be issued yet.')],
    }),
    mk({
      id: 'SS-2026-0155', category: 'safety', priority: 'urgent', title: 'Dog bite on the park path; the dog was not located',
      description: 'A dog bit my arm while I was walking on the park path this morning. I got away, cleaned the wound and am seeing a doctor. The dog ran toward Block 10. I don’t know whose dog it is.',
      animal: { type: 'dog', description: 'Large, light-brown coat, no collar', count: 1 },
      location: { area: 'Park · Phase 2', detail: 'Path between the playground and Block 10' },
      observedAt: dayAt(2, 6, 40), reportedAt: dayAt(2, 7, 5), reporter: rep(9, 'phone'), status: 'in_progress',
      assessment: { ...emptyAssessment(), incident: 'verified', incidentBasis: 'A jogger also saw the dog near the path. The reporter was advised to seek medical assessment.', evidenceSufficiency: 'sufficient', urgency: 'immediate', urgencyNote: 'A person was bitten and the dog is still loose.', savedAt: dayAt(2, 7, 25), savedBy: A },
      referrals: [
        referral('barangay', 'Help locating and containing a dog that bit a resident.', dayAt(2, 8, 0), 'in_progress', 'Duty officer', 'Phone call', [[dayAt(2, 8, 40), 'Barangay acknowledged and will send staff.', 'acknowledged'], [dayAt(1, 14, 0), 'Staff patrolled twice and did not find the dog. They will try again tomorrow morning.', 'in_progress']], { remainingFollowUp: 'Subdivision keeps guards alert and keeps the safety advisory current.' }),
        referral('vet_office', 'Advice on bite follow-up and on observing the animal if it is found.', dayAt(2, 9, 30), 'acknowledged', 'Veterinary clerk', 'Phone call', [[dayAt(2, 10, 0), 'They will advise on the procedure once the animal is located.', 'acknowledged']]),
      ],
      followUps: [fu('referral_check', 'Call the barangay for an update on locating the dog', hoursAgo(2), dayAt(1, 14, 5))],
      notes: [{ id: sid('n'), at: dayAt(1, 15, 0), by: A, text: 'Residents near Block 10 asked at the guardhouse. No sighting since yesterday. Advisory posted.' }],
      timeline: [ev(dayAt(2, 7, 20), A, 'priority', 'Priority set to Urgent', 'A person was bitten.'), st(dayAt(2, 7, 40), 'in_progress', 'Safety coordination started'), ev(dayAt(2, 8, 0), A, 'referral', 'Referred to Barangay Hall — Peace & Order'), ev(dayAt(2, 8, 40), A, 'referral_update', 'Barangay acknowledged the referral'), ev(dayAt(2, 9, 30), A, 'referral', 'Referred to City Veterinary Office'), ev(dayAt(2, 10, 15), A, 'notice', 'Safety advisory published'), ev(dayAt(1, 14, 0), A, 'referral_update', 'Barangay update: not yet located'), ev(dayAt(1, 15, 0), A, 'note', 'Internal note added')],
    }),
    mk({
      id: 'SS-2026-0152', category: 'nuisance', sensitive: true, title: 'Dog barking late at night near Lot 12, Block 7',
      description: 'A dog barks late into the night near Lot 12. It started about two weeks ago and wakes our baby. We have not spoken to the neighbours.',
      animal: { type: 'dog', description: 'Unknown breed, heard but not seen', count: 1 },
      location: { area: 'Block 7 · Acacia St.', detail: 'Near Lot 12' },
      observedAt: dayAt(10, 23, 0), reportedAt: dayAt(9, 21, 40), reporter: rep(7, 'in_app'), status: 'under_review',
      relatedCaseIds: ['SS-2026-0158'],
      timeline: [st(dayAt(9, 22, 30), 'under_review'), ev(dayAt(2, 14, 10), A, 'link', 'Linked to SS-2026-0158')],
    }),
    mk({
      id: 'SS-2026-0151', category: 'found_animal', title: 'Found: friendly brown dog with a red collar near the clubhouse',
      description: 'A friendly short-haired brown dog with a red collar (no tag) has been around the clubhouse since Saturday morning. It follows people but does not bark. I gave it water and have been keeping an eye on it.',
      animal: { type: 'dog', description: 'Medium build, short brown coat, red collar without a tag', count: 1 },
      location: { area: 'Clubhouse area · Molave St.', detail: 'Mostly the clubhouse parking' },
      observedAt: dayAt(4, 8, 40), reportedAt: dayAt(4, 9, 10), reporter: rep(12), status: 'in_progress',
      evidence: [photo('Dog at the clubhouse entrance', dayAt(4, 8, 45)), photo('Close view of the red collar', dayAt(4, 8, 50)), sighting('Seen again in the clubhouse parking', dayAt(2, 18, 30), 'resident')],
      assessment: { ...emptyAssessment(), incident: 'verified', incidentBasis: 'Seen by the guard and two residents.', evidenceSufficiency: 'sufficient', urgency: 'none', notes: 'Friendly and healthy. The HOA does not take custody.', savedAt: dayAt(4, 10, 0), savedBy: A },
      identity: { status: 'possible_match', matches: { 'pet-6': 'possible', 'pet-1': 'not_match' }, note: 'Brownie is ruled out by size and markings. Coco is a candidate. Compare the vaccination card and photos.' },
      ownership: { status: 'under_review', ownerResidentId: null, evidence: [], note: 'Two claims received. Registered profiles alone do not prove ownership.' },
      claims: [
        { id: sid('cl'), claimantResidentId: 'res-8', claimantName: 'Lourdes Mercado', claimedPetId: 'pet-6', submittedAt: dayAt(1, 18, 30), statement: 'Coco slipped out of our gate on Saturday morning. He is tan with a black muzzle and a kinked tail, and he was wearing a red collar.', evidence: ['Registered pet profile (Coco)', 'Two photos with the dog showing the kinked tail', 'Vaccination card'], status: 'under_review' },
        { id: sid('cl'), claimantResidentId: 'res-7', claimantName: 'Dennis Garcia', claimedPetId: null, submittedAt: hoursAgo(20), statement: 'That dog looks like one my cousin lost. I do not have a photo.', evidence: [], status: 'submitted' },
      ],
      referrals: [referral('barangay', 'Found dog with an unknown owner. Asked whether the barangay has a lost-dog report.', dayAt(3, 11, 0), 'acknowledged', 'Front desk', 'Phone call', [[dayAt(3, 14, 20), 'No matching lost-dog report on file. They will tell us if one comes in.', 'acknowledged']])],
      followUps: [fu('follow_up', 'Ask Lourdes Mercado to bring the vaccination card and photos to the HOA office', aheadAt(1, 10), dayAt(1, 18, 45))],
      timeline: [st(dayAt(4, 9, 40), 'under_review'), ev(dayAt(4, 10, 0), A, 'assessment', 'Assessment recorded'), ev(dayAt(4, 11, 30), A, 'notice', 'Found-animal notice published'), ev(dayAt(3, 11, 0), A, 'referral', 'Referred to Barangay Hall — Peace & Order'), st(dayAt(3, 11, 0), 'in_progress', 'Referral sent'), ev(dayAt(2, 12, 0), A, 'identity', 'Brownie ruled out as a match', 'Different size and markings.'), ev(dayAt(1, 18, 30), 'Resident', 'claim', 'Ownership claim submitted', 'Lourdes Mercado'), ev(hoursAgo(20), 'Resident', 'claim', 'Ownership claim submitted', 'Dennis Garcia')],
    }),
    mk({
      id: 'SS-2026-0149', category: 'nuisance', sensitive: true, title: 'Dog repeatedly off-leash near the Block 4 playground',
      description: 'A black-and-white dog has been let out without a leash near the playground on several evenings this week. Children get nervous when it runs up to them. I would like the owner to be reminded.',
      animal: { type: 'dog', description: 'Medium, black with white socks', count: 1 },
      location: { area: 'Block 4 · Molave St.', detail: 'Playground and nearby sidewalk, evenings' },
      observedAt: dayAt(6, 18, 10), reportedAt: dayAt(6, 19, 0), reporter: rep(6, 'email'), status: 'in_progress',
      assessment: { ...emptyAssessment(), incident: 'verified', incidentBasis: 'Seen by the guard on two evenings.', evidenceSufficiency: 'sufficient', urgency: 'none', notes: 'Owner identified and confirmed. House Rules §6.3 applies.', savedAt: dayAt(5, 9, 0), savedBy: A },
      identity: { status: 'identified', matches: { 'pet-9': 'confirmed' }, note: 'Confirmed by the guard and by the white socks and notched tail tip.' },
      ownership: { status: 'confirmed', ownerResidentId: 'res-11', evidence: ['registry', 'markings', 'firsthand', 'statement'], note: 'The owner acknowledged the dog is his when approached. The registry profile was not relied on alone.' },
      ownerContacts: [{ id: sid('oc'), at: dayAt(3, 17, 30), by: A, method: 'in_person', withWhom: 'Ricardo Pascual (owner)', summary: 'Explained the report and the house rule on animals outside the lot. He confirmed the dog is his and agreed to keep it leashed.', outcome: 'cooperative' }],
      warnings: [{
        id: sid('war'), ownerResidentId: 'res-11', ownerName: 'Ricardo Pascual', policyId: 'pol-1', policyTitle: 'Animals outside the owner’s lot', policyRef: 'House Rules §6.3',
        details: 'The dog was off-leash in a common area on several evenings. The owner is asked to keep the dog leashed or inside the lot while observation is under way.',
        delivery: 'written', issuedAt: dayAt(2, 17, 0), issuedBy: A, observationDays: 3, observationStart: dayAt(2, 17, 0), observationEnd: aheadAt(1, 17, 0), followUpAt: aheadAt(1, 17, 0), status: 'active',
        observations: [{ id: sid('obs'), at: dayAt(1, 18, 15), by: A, result: 'partial', notes: 'The dog was leashed on the evening walk, but the gate was left open once and the dog reached the sidewalk.' }],
      }],
      followUps: [fu('warning_end', 'End of observation: record the outcome', aheadAt(1, 17), dayAt(2, 17, 0), 'Observation period set by House Rules §6.3.')],
      timeline: [st(dayAt(5, 8, 30), 'under_review'), ev(dayAt(5, 9, 0), A, 'assessment', 'Assessment recorded'), ev(dayAt(3, 17, 30), A, 'owner_contact', 'Owner coordination recorded', 'In person · Cooperative'), ev(dayAt(3, 17, 45), A, 'ownership', 'Ownership confirmed', 'Evidence: markings, firsthand observation, owner statement.'), ev(dayAt(2, 17, 0), A, 'warning', 'Warning issued under House Rules §6.3', 'Observation period: 3 days.'), st(dayAt(2, 17, 0), 'in_progress', 'Warning issued'), ev(dayAt(1, 18, 15), A, 'compliance', 'Compliance observation: partly compliant')],
    }),
    mk({
      id: 'SS-2026-0147', category: 'nuisance', title: 'Stray cats gathering near the Block 5 garbage area',
      description: 'At least four cats now sleep near the garbage collection point and someone seems to be leaving food out. There is a smell and the cats fight at night.',
      animal: { type: 'cat', description: 'Four or more cats, mixed colours', count: 4 },
      location: { area: 'Block 5 · Acacia St.', detail: 'Garbage collection point' },
      observedAt: dayAt(5, 20, 0), reportedAt: dayAt(5, 21, 15), reporter: rep(12), status: 'under_review',
      assessment: { ...emptyAssessment(), incident: 'verified', incidentBasis: 'The guard confirmed four cats on two nights.', evidenceSufficiency: 'needs_more', urgency: 'none', notes: 'No identifiable owner. Warnings do not apply. Consider a community reminder about feeding.', savedAt: dayAt(4, 15, 0), savedBy: A },
      evidence: [photo('Cats near the bins', dayAt(5, 20, 5))],
      timeline: [st(dayAt(4, 14, 30), 'under_review'), ev(dayAt(4, 15, 0), A, 'assessment', 'Assessment recorded')],
    }),
    mk({
      id: 'SS-2026-0143', category: 'lost_pet', title: 'Missing: gray tabby cat “Luna”, Block 9',
      description: 'Luna has been missing since Sunday evening. She is a small gray tabby with white paws and a green collar. She usually comes home by dusk.',
      animal: { type: 'cat', description: 'Gray tabby, white paws, green collar', count: 1 },
      location: { area: 'Block 9 · Narra Ave.', detail: 'Last seen near the Phase 1 playground' },
      observedAt: dayAt(8, 18, 30), reportedAt: dayAt(8, 20, 10), reporter: rep(5, 'phone'), status: 'in_progress',
      evidence: [photo('Reference photo of Luna', dayAt(8, 20, 10)), photo('Luna wearing her collar', dayAt(8, 20, 10)), sighting('Seen near the Phase 1 playground (neighbour message)', dayAt(5, 19, 0)), sighting('Seen under a parked car in Block 8', dayAt(1, 6, 45))],
      identity: { status: 'possible_match', matches: { 'pet-3': 'possible' }, note: 'Owner-declared registered pet.' },
      ownership: { status: 'claimed', ownerResidentId: 'res-5', evidence: [], note: '' },
      followUps: [fu('follow_up', 'Check for new sightings and update the owner', aheadAt(2, 10), dayAt(1, 7, 0))],
      timeline: [st(dayAt(8, 21, 0), 'under_review'), ev(dayAt(7, 9, 30), A, 'notice', 'Lost-pet notice published'), st(dayAt(7, 9, 30), 'in_progress', 'Notice published and sightings are being collected'), ev(dayAt(5, 19, 5), 'Resident', 'info', 'Sighting added'), ev(dayAt(1, 6, 50), 'Resident', 'info', 'Sighting added')],
    }),
    mk({
      id: 'SS-2026-0139', category: 'other', priority: 'high', title: 'Snake seen near the drainage, Block 3',
      description: 'A dark brown snake about one metre long was seen going into the drainage near Block 3. Children play nearby.',
      animal: { type: 'wildlife', description: 'Snake, about 1 m, dark brown', count: 1 },
      location: { area: 'Block 3 · Molave St.', detail: 'Drainage opening beside Lot 2' },
      observedAt: dayAt(14, 9, 10), reportedAt: dayAt(14, 9, 40), reporter: rep(13), status: 'closed',
      assessment: { ...emptyAssessment(), incident: 'verified', incidentBasis: 'Photo and guard confirmation.', evidenceSufficiency: 'sufficient', urgency: 'possible', savedAt: dayAt(14, 10, 10), savedBy: A },
      referrals: [referral('wildlife', 'Wild snake near a children’s play area needs safe capture and relocation.', dayAt(14, 10, 30), 'completed', 'Duty responder', 'Phone call', [[dayAt(14, 11, 0), 'Acknowledged. Team will visit this afternoon.', 'acknowledged'], [dayAt(13, 9, 0), 'Snake captured and relocated.', 'completed']], { externalOutcome: 'The wildlife unit captured the snake and relocated it away from the subdivision.', remainingFollowUp: 'None. Guards report any new sighting.' })],
      closure: { disposition: 'resolved_intervention', outcome: 'resolved', reason: 'The wildlife unit captured and relocated the animal. No further sightings after three days of guard checks.', followUpCheck: null, closedAt: dayAt(10, 15, 0), closedBy: A },
      timeline: [st(dayAt(14, 10, 10), 'under_review'), ev(dayAt(14, 10, 30), A, 'referral', 'Referred to Wildlife Response Unit'), st(dayAt(14, 10, 30), 'in_progress', 'Referral sent'), ev(dayAt(13, 9, 0), A, 'referral_update', 'Wildlife unit completed the capture'), ev(dayAt(10, 15, 0), A, 'closure', 'Case closed — Concern resolved through intervention')],
    }),
    mk({
      id: 'SS-2026-0131', category: 'nuisance', priority: 'low', sensitive: true, title: 'Cat repeatedly entering a neighbour’s garden, Block 5',
      description: 'A black cat keeps digging in our garden beds and leaving droppings. I would like the owner to keep it in.',
      animal: { type: 'cat', description: 'Black cat with a white chest spot', count: 1 },
      location: { area: 'Block 5 · Acacia St.', detail: 'Garden of Lot 3' },
      observedAt: dayAt(23, 7, 30), reportedAt: dayAt(23, 9, 0), reporter: rep(9, 'email'), status: 'closed',
      assessment: { ...emptyAssessment(), incident: 'verified', evidenceSufficiency: 'sufficient', urgency: 'none', savedAt: dayAt(22, 10, 0), savedBy: A },
      identity: { status: 'identified', matches: { 'pet-10': 'confirmed' }, note: 'Confirmed by the owner and by the white chest spot.' },
      ownership: { status: 'confirmed', ownerResidentId: 'res-12', evidence: ['markings', 'statement'], note: 'The owner acknowledged the cat is hers.' },
      warnings: [{
        id: sid('war'), ownerResidentId: 'res-12', ownerName: 'Grace Domingo', policyId: 'pol-1', policyTitle: 'Animals outside the owner’s lot', policyRef: 'House Rules §6.3',
        details: 'The cat enters a neighbour’s garden. The owner is asked to keep the cat within the lot.', delivery: 'verbal', issuedAt: dayAt(19, 16, 0), issuedBy: A,
        observationDays: 3, observationStart: dayAt(19, 16, 0), observationEnd: dayAt(16, 16, 0), followUpAt: dayAt(16, 16, 0), status: 'concluded', outcome: 'compliant', outcomeNote: 'No further incidents during the observation period.', concludedAt: dayAt(16, 16, 30),
        observations: [{ id: sid('obs'), at: dayAt(17, 18, 0), by: A, result: 'compliant', notes: 'Cat stayed inside the lot.' }, { id: sid('obs'), at: dayAt(16, 16, 15), by: A, result: 'compliant', notes: 'No digging reported. Neighbour confirms.' }],
      }],
      closure: { disposition: 'owner_compliance', outcome: 'resolved', reason: 'The cat stayed within its own lot for the full observation period and the reporter confirmed.', followUpCheck: null, closedAt: dayAt(14, 11, 0), closedBy: A },
      timeline: [st(dayAt(22, 9, 30), 'under_review'), ev(dayAt(19, 16, 0), A, 'warning', 'Warning issued under House Rules §6.3'), st(dayAt(19, 16, 0), 'in_progress', 'Warning issued'), ev(dayAt(16, 16, 30), A, 'compliance', 'Observation concluded: compliant'), ev(dayAt(14, 11, 0), A, 'closure', 'Case closed — Owner compliance verified')],
    }),
    mk({
      id: 'SS-2026-0128', category: 'found_animal', priority: 'low', title: 'Stray puppy seen near the Phase 1 playground',
      description: 'A small brown puppy was sitting near the Phase 1 playground and ran away when I approached.',
      animal: { type: 'dog', description: 'Small brown puppy', count: 1 },
      location: { area: 'Phase 1 playground · Narra Ave.', detail: 'Behind the slide' },
      observedAt: dayAt(30, 7, 50), reportedAt: dayAt(30, 8, 0), reporter: rep(8), status: 'closed',
      closure: { disposition: 'no_further_sightings', outcome: 'unresolved', reason: 'No sighting after the first day. Guards checked for ten days. Closed without a confirmed outcome; the case reopens if the puppy returns.', followUpCheck: null, closedAt: dayAt(18, 10, 0), closedBy: A },
      timeline: [st(dayAt(30, 9, 0), 'under_review'), st(dayAt(29, 10, 0), 'in_progress', 'Guards asked to watch'), ev(dayAt(18, 10, 0), A, 'closure', 'Case closed — No further sightings; monitoring ended')],
    }),
    mk({
      id: 'SS-2026-0120', category: 'lost_pet', title: 'Missing: tri-colour Beagle “Max”',
      description: 'Max got out when the gate was left open. Tri-colour Beagle mix with a blue harness. He follows his nose and may not respond to calls.',
      animal: { type: 'dog', description: 'Beagle mix, tri-colour, blue harness', count: 1 },
      location: { area: 'Block 8 · Narra Ave.', detail: 'Gate of Lot 14' },
      observedAt: dayAt(41, 16, 0), reportedAt: dayAt(41, 17, 0), reporter: rep(13, 'phone'), status: 'closed',
      identity: { status: 'identified', matches: { 'pet-11': 'confirmed' }, note: 'The owner recognised the dog on return.' },
      ownership: { status: 'confirmed', ownerResidentId: 'res-13', evidence: ['photos', 'statement'], note: 'Confirmed by the owner with photos.' },
      closure: { disposition: 'pet_recovered', outcome: 'resolved', reason: 'A neighbour found Max near Block 6 and he was returned the same evening. The owner confirmed.', followUpCheck: null, closedAt: dayAt(40, 20, 0), closedBy: A },
      timeline: [st(dayAt(41, 17, 30), 'under_review'), ev(dayAt(41, 18, 0), A, 'notice', 'Lost-pet notice published'), st(dayAt(41, 18, 0), 'in_progress'), ev(dayAt(40, 20, 0), A, 'closure', 'Case closed — Missing pet recovered')],
    }),
  ];

  // ------------------------------------------------------------- earlier cases (compact; feed lists and analytics)
  type Light = [num: number, cat: CategoryId, animal: AnimalType, title: string, area: string, ageDays: number, durDays: number | null, disp: DispositionId | null, prio: Priority, org?: string, openStatus?: CaseStatus];
  const lightRows: Light[] = [
    [104, 'nuisance', 'dog', 'Barking dog at a corner lot', 'Block 2 · Molave St.', 84, 6, 'resolved_intervention', 'normal'],
    [106, 'found_animal', 'cat', 'Kitten found near the main gate', 'Main gate · Acacia St.', 81, 3, 'resolved_intervention', 'low'],
    [108, 'lost_pet', 'dog', 'Missing: Aspin “Bantay”', 'Block 10 · Narra Ave.', 79, 2, 'pet_recovered', 'normal'],
    [111, 'safety', 'dog', 'Dog chasing cyclists on Narra Avenue', 'Narra Ave.', 75, 9, 'handed_off', 'high', 'barangay'],
    [113, 'injured', 'cat', 'Cat with a wound on its back', 'Block 6 · Acacia St.', 72, 4, 'resolved_intervention', 'high', 'welfare'],
    [115, 'nuisance', 'cat', 'Cats fighting at night near Block 6', 'Block 6 · Acacia St.', 70, 12, 'unresolved_other', 'normal'],
    [117, 'other', 'livestock', 'Chickens roaming loose in the common area', 'Common area · Phase 1', 66, 5, 'resolved_intervention', 'low'],
    [119, 'lost_pet', 'bird', 'Missing: cockatiel “Kiwi”', 'Block 1 · Molave St.', 63, 3, 'pet_recovered', 'normal'],
    [121, 'nuisance', 'dog', 'Dog digging under a shared fence', 'Block 9 · Narra Ave.', 61, 15, 'owner_compliance', 'normal'],
    [123, 'found_animal', 'dog', 'Stray dog sleeping near the clubhouse', 'Clubhouse area', 58, 8, 'handed_off', 'normal', 'animal_control'],
    [125, 'nuisance', 'dog', 'Dog off-leash at the park', 'Park · Phase 2', 55, 7, 'owner_compliance', 'normal'],
    [126, 'injured', 'bird', 'Bird with a broken wing', 'Block 11 · Narra Ave.', 52, 2, 'handed_off', 'normal', 'welfare'],
    [129, 'safety', 'dog', 'Aggressive dog behind a fence, Block 10', 'Block 10 · Narra Ave.', 49, 10, 'resolved_intervention', 'high', 'barangay'],
    [132, 'nuisance', 'dog', 'Barking at night, Block 7 (duplicate)', 'Block 7 · Acacia St.', 46, 1, 'duplicate_report', 'low'],
    [134, 'other', 'other', 'Reported “wild animal” turned out to be a toy', 'Block 4 · Molave St.', 44, 1, 'invalid_report', 'low'],
    [135, 'found_animal', 'cat', 'Orange cat with a collar near Block 11', 'Block 11 · Narra Ave.', 41, 6, 'resolved_intervention', 'normal'],
    [136, 'nuisance', 'cat', 'Cat on a car roof scratching the paint', 'Block 2 · Molave St.', 38, 12, 'unresolved_other', 'low'],
    [137, 'lost_pet', 'dog', 'Missing: Pomeranian “Peanut”', 'Block 12 · Narra Ave.', 36, 4, 'pet_recovered', 'normal'],
    [138, 'nuisance', 'cat', 'Strays attracted by feeding, Block 5', 'Block 5 · Acacia St.', 33, 14, 'no_further_sightings', 'normal'],
    [140, 'injured', 'dog', 'Dog limping near the gate', 'Main gate · Acacia St.', 29, 5, 'handed_off', 'high', 'vet_office'],
    [141, 'nuisance', 'dog', 'Barking dog in Block 7', 'Block 7 · Acacia St.', 27, 11, 'resolved_intervention', 'normal'],
    [144, 'safety', 'dog', 'Two dogs fighting in the street', 'Molave St.', 22, 3, 'resolved_intervention', 'high'],
    [145, 'found_animal', 'small_mammal', 'Rabbit found in a garden', 'Block 6 · Acacia St.', 20, 5, 'resolved_intervention', 'normal'],
    [146, 'other', 'wildlife', 'Monitor lizard seen near the creek', 'Creek side · Phase 2', 18, 7, 'handed_off', 'normal', 'wildlife'],
    [148, 'nuisance', 'dog', 'Dog roaming near Block 9', 'Block 9 · Narra Ave.', 12, null, null, 'normal', undefined, 'in_progress'],
    [150, 'found_animal', 'dog', 'Small white dog seen near Phase 1', 'Phase 1 · Narra Ave.', 7, null, null, 'normal', undefined, 'under_review'],
    [153, 'lost_pet', 'cat', 'Missing: black cat with a white chest', 'Block 6 · Acacia St.', 5, null, null, 'normal', undefined, 'in_progress'],
  ];
  const closureReason: Record<DispositionId, string> = {
    resolved_intervention: 'Follow-up with the residents involved resolved the concern.',
    owner_compliance: 'The owner followed the warning and compliance was observed.',
    pet_recovered: 'The pet was found and the owner confirmed.',
    handed_off: 'The external authority took over and the subdivision has no remaining action.',
    no_further_sightings: 'No further sightings; monitoring ended.',
    unresolved_other: 'Closed without a confirmed resolution after repeated follow-up.',
    invalid_report: 'The report was determined not to be valid.',
    duplicate_report: 'Covered by an existing case.',
  };
  const light: Case[] = lightRows.map(([num, category, animal, title, area, age, dur, disp, priority, orgId, openStatus], i) => {
    const id = `SS-2026-${String(num).padStart(4, '0')}`;
    const reportedAt = dayAt(age, 8 + (i % 9), (i * 13) % 60);
    const after = (days: number, hoursExtra = 0) => new Date(new Date(reportedAt).getTime() + days * 86_400_000 + hoursExtra * 3_600_000).toISOString();
    const events: TimelineEvent[] = [st(after(0, 1.5), 'under_review')];
    const referrals: Referral[] = [];
    const status: CaseStatus = openStatus ?? 'closed';
    let closure: Case['closure'] = null;
    if (orgId) {
      referrals.push(referral(orgId, 'Referred for the authority’s specialised response.', after(1), 'completed', 'Duty officer', 'Phone call', [[after(1, 2), 'Acknowledged.', 'acknowledged'], [after(Math.max(2, (dur ?? 3) - 1)), 'Completed on their side.', 'completed']], { externalOutcome: 'Handled by the external authority.', remainingFollowUp: 'None.' }));
      events.push(ev(after(1), A, 'referral', `Referred to ${org(orgId).name}`), st(after(1), 'in_progress', 'Referral sent'));
    } else if ((dur ?? 0) >= 4 || status === 'in_progress') {
      events.push(st(after(1), 'in_progress'));
    }
    if (dur !== null && disp) {
      closure = { disposition: disp, outcome: DISPOSITIONS[disp].group, reason: closureReason[disp], followUpCheck: null, closedAt: after(dur), closedBy: A };
      events.push(ev(after(dur), A, 'closure', `Case closed — ${DISPOSITIONS[disp].label}`));
    } else if (openStatus === 'in_progress') {
      events.length = 0;
      events.push(st(after(0, 2), 'under_review'), st(after(2), 'in_progress', 'Waiting for photos from the reporter'));
    }
    return mk({
      id, category, priority, title, status, closure, referrals, timeline: events,
      description: `${title}. Reported by a resident; details were checked with the guardhouse.`,
      animal: { type: animal, description: animal === 'dog' ? 'Dog, unidentified' : animal === 'cat' ? 'Cat, unidentified' : 'Details in the original report', count: 1 },
      location: { area, detail: 'As described by the reporter' },
      observedAt: new Date(new Date(reportedAt).getTime() - 3_600_000).toISOString(), reportedAt, reporter: rep((i % 13) + 1),
      sensitive: category === 'nuisance',
      ownership: disp === 'owner_compliance' ? { status: 'confirmed', ownerResidentId: `res-${((i + 6) % 13) + 1}`, evidence: ['markings', 'statement'], note: 'Confirmed by the owner.' } : { status: 'unknown', ownerResidentId: null, evidence: [], note: '' },
    });
  });

  // SAMPLE coordinates so every case can show its location on a map. Made up, inside the approximate outline: not real report positions.
  const located = (c: Case): Case => ({ ...c, location: { ...c.location, ...samplePoint(`${c.location.area} ${c.location.detail} ${c.id}`) } });
  const cases = [...rich, ...light].map(located).sort((a, b) => b.reportedAt.localeCompare(a.reportedAt));

  // ------------------------------------------------------------------------------------------------------- notices
  const notice = (n: Partial<Notice> & Pick<Notice, 'type' | 'title' | 'description' | 'location' | 'status'>): Notice => ({
    id: sid('notice'), media: [], caseId: null, source: 'admin', createdAt: n.publishedAt ?? dayAt(1, 9), updatedAt: n.publishedAt ?? dayAt(1, 9), publishedAt: null, author: A, ...n,
  });
  const notices: Notice[] = [
    notice({ type: 'safety_advisory', status: 'published', title: 'Safety reminder: an unfamiliar dog was reported near the park', location: 'Around the park', caseId: 'SS-2026-0155', publishedAt: dayAt(2, 10, 15),
      description: 'A resident was bitten by a dog on the park path. The dog has not been located and its owner is unknown. Please keep a safe distance from unfamiliar dogs, keep children and pets close when walking near the park, and do not try to catch or feed the animal. Report any sighting to the guardhouse or the HOA office. Anyone bitten should seek medical advice promptly.' }),
    notice({ type: 'found_animal', status: 'published', title: 'Found: friendly brown dog with a red collar', location: 'Near the clubhouse', caseId: 'SS-2026-0151', publishedAt: dayAt(4, 11, 30), media: [{ id: sid('m'), name: 'found-dog-1.jpg' }],
      description: 'A friendly short-haired brown dog with a red collar (no tag) has been around the clubhouse since Saturday. It is safe and being watched. If this is your dog, please contact the HOA office and be ready to describe its markings so we can confirm.' }),
    notice({ type: 'lost_pet', status: 'published', title: 'Lost cat: Luna, gray tabby with white paws', location: 'Near Block 9 and the Phase 1 playground', caseId: 'SS-2026-0143', publishedAt: dayAt(7, 9, 30), source: 'resident', author: 'Owner-reported', media: [{ id: sid('m'), name: 'luna-1.jpg' }, { id: sid('m'), name: 'luna-2.jpg' }],
      description: 'Luna went missing on Sunday evening. She is small and gray with white paws and wears a green collar. She is shy but may come to her name. If you see her, please tell the HOA office the time and general area. Please do not chase her.' }),
    notice({ type: 'safety_advisory', status: 'published', title: 'Reminder: keep dogs leashed in common areas', location: 'All common areas', publishedAt: dayAt(12, 9, 0),
      description: 'Please keep dogs on a leash in the park, playgrounds and sidewalks. This helps children, joggers and other pets feel safe. Thank you for looking after your neighbours.' }),
    notice({ type: 'found_animal', status: 'draft', title: 'Found: white rabbit near the Phase 1 playground', location: 'Near the Phase 1 playground', createdAt: hoursAgo(30), updatedAt: hoursAgo(30),
      description: 'A small white rabbit was seen hopping near the Phase 1 playground. If it is yours, please contact the HOA office and describe it so we can confirm.' }),
    notice({ type: 'lost_pet', status: 'archived', title: 'Lost dog: Max, tri-colour Beagle', location: 'Near Block 8', caseId: 'SS-2026-0120', publishedAt: dayAt(41, 18, 0), source: 'resident', author: 'Owner-reported', archivedReason: 'Pet recovered; case closed.',
      description: 'Max, a tri-colour Beagle mix with a blue harness, went missing from Block 8. Please tell the HOA office if you see him.' }),
  ];

  // ---------------------------------------------------------------------------------------------- notifications
  const note = (n: Omit<AdminNotification, 'id'>): AdminNotification => ({ id: sid('nt'), ...n });
  const notifications: AdminNotification[] = [
    note({ kind: 'urgent', title: 'Urgent report: aggressive dog near the Phase 2 gate', body: 'SS-2026-0167 · Reported 38 minutes ago. No assessment yet.', at: minsAgo(38), read: false, caseId: 'SS-2026-0167' }),
    note({ kind: 'new_report', title: 'New report: injured cat in Block 12', body: 'SS-2026-0166 · Marked high priority by the reporter’s description.', at: hoursAgo(2.2), read: false, caseId: 'SS-2026-0166' }),
    note({ kind: 'follow_up', title: 'Follow-up overdue: call the barangay', body: 'SS-2026-0155 · Update on locating the dog was due 2 hours ago.', at: hoursAgo(2), read: false, caseId: 'SS-2026-0155' }),
    note({ kind: 'new_report', title: 'New lost-pet report: Mochi', body: 'SS-2026-0165 · No community notice has been published yet.', at: hoursAgo(4.8), read: false, caseId: 'SS-2026-0165' }),
    note({ kind: 'ownership_claim', title: 'New ownership claim on the found dog', body: 'SS-2026-0151 · A second claim was submitted without evidence.', at: hoursAgo(20), read: false, caseId: 'SS-2026-0151' }),
    note({ kind: 'follow_up', title: 'Observation ends tomorrow', body: 'SS-2026-0149 · Record the compliance outcome by 5:00 PM.', at: hoursAgo(5), read: true, caseId: 'SS-2026-0149' }),
    note({ kind: 'case_activity', title: 'Reporter added a sighting', body: 'SS-2026-0143 · Seen under a parked car in Block 8.', at: dayAt(1, 6, 50), read: true, caseId: 'SS-2026-0143' }),
    note({ kind: 'referral', title: 'Barangay acknowledged the referral', body: 'SS-2026-0151 · No matching lost-dog report on file.', at: dayAt(3, 14, 20), read: true, caseId: 'SS-2026-0151' }),
  ];

  return {
    admin: { id: 'adm-1', name: A, title: 'HOA Operations Officer', email: 'carla.mendoza@selera-homes.example', phone: '0917 000 0101', role: 'Subdivision Admin', subdivision: 'Selera Homes', memberSince: dayAt(210, 9) },
    cases, residents, pets, notices, notifications,
    settings: {
      subdivision: { name: 'Selera Homes', city: '', address: 'HOA Office, Clubhouse, Acacia Street', officePhone: '(02) 5555 0142', officeEmail: 'office@selera-homes.example', officeHours: 'Mon–Sat, 8:00 AM – 5:00 PM' },
      notifications: { newReports: true, urgent: true, followUps: true, claims: true, caseActivity: false, channels: { inApp: true, email: true, push: false } },
      categories: { lost_pet: true, found_animal: true, nuisance: true, safety: true, injured: true, other: true },
      policies,
      privacy: { lostPetPublication: 'immediate', foundPublication: 'review' },
    },
    seq: 1000,
  };
}
