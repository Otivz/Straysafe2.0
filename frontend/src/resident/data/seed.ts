/**
 * SAMPLE DATA for the resident preview. Entirely fictional: no real people, pets, numbers or addresses.
 * Dates are relative to "now" so "2 h ago" and "yesterday" always make sense when the preview opens.
 * The sample resident matches the Admin preview's Angelica Reyes, so both previews tell one story.
 *
 * Coordinates are SAMPLE points made up inside the approximate subdivision outline (`samplePoint`); a place that names the
 * clubhouse, the park or the gate lands near that registered landmark. A few places are left as words only (no coordinates)
 * on purpose, so the screens can show how a place without a pin is handled.
 */
import { generalize, samplePoint } from '../../preview/geo';
import type {
  Claim, GeoPoint, Media, Notice, Notification, Pet, Profile, Report, ReportUpdate, ResidentState, Sighting,
} from './types';

export const SAMPLE_ACCOUNT = { id: 'res-sample', email: 'angelica.reyes@mail.example', password: 'Preview#2026', name: 'Angelica Reyes' } as const;

export function buildSeed(now: Date, variant: 'sample' | 'new', signup?: Pick<Profile, 'id' | 'name' | 'email' | 'phone' | 'unit' | 'street'>): ResidentState {
  const T = now.getTime();
  const hoursAgo = (h: number) => new Date(T - h * 3_600_000).toISOString();
  const dayAt = (d: number, h: number, m = 0) => { const x = new Date(now); x.setDate(x.getDate() - d); x.setHours(h, m, 0, 0); return x.toISOString(); };
  let n = 0;
  const sid = (p: string) => `${p}-s${++n}`;
  const up = (at: string, kind: ReportUpdate['kind'], title: string, body?: string): ReportUpdate => ({ id: sid('up'), at, kind, title, body });
  const photo = (name: string): Media => ({ id: sid('m'), name, kind: 'photo', size: 240_000 });

  // Places. `exact` is for data the sample resident owns; `rounded` is for other people's notices, where the client only
  // ever holds the rounded position, as it would from a redacted API response. `typed` has no coordinates at all.
  const exact = (label: string, key = label): GeoPoint => ({ label, ...samplePoint(key), manual: false });
  const rounded = (label: string, key = label): GeoPoint => { const p = samplePoint(key); const g = generalize(p.lat, p.lng); return { label, lat: g.lat, lng: g.lng, manual: false }; };
  const typed = (label: string): GeoPoint => ({ label, lat: null, lng: null, manual: true });
  const general = (key: string) => { const p = samplePoint(key); return generalize(p.lat, p.lng); };

  const spot = (at: string, location: GeoPoint, description: string, by: Sighting['by'] = 'neighbour', onBehalf = false, photos = 0): Sighting => ({
    id: sid('sg'), observedAt: at, submittedAt: at, location, description, by, onBehalf, photos,
  });

  const settings = { notifications: { reportUpdates: true, sightings: true, claims: true, community: true, advisories: true }, channels: { push: true, email: true, sms: false } };

  // ----------------------------------------------------------------- community notices (the same for every resident)
  const notices: Notice[] = [
    {
      id: 'n-adv-park', type: 'safety_advisory', title: 'An unfamiliar dog was reported near the park', area: 'Around the park', approx: general('Around the park'), photos: 0, publishedAt: dayAt(2, 10, 15), source: 'admin', mine: false, status: 'active', sightings: [],
      description: 'A resident was bitten by a dog on the park path. The dog has not been located and its owner is unknown. Please keep a safe distance and report any sighting to the guardhouse or the HOA office.',
      guidance: ['Keep a safe distance from unfamiliar dogs.', 'Keep children and pets close when walking near the park.', 'Do not try to catch, feed or corner the animal.', 'Report any sighting to the guardhouse or the HOA office.', 'Anyone who was bitten should seek medical advice promptly.'],
      updates: [{ id: sid('nu'), at: dayAt(1, 15, 0), text: 'The barangay has been asked to help locate the dog. There has been no new sighting since yesterday.' }],
    },
    {
      id: 'n-found-dog', type: 'found_animal', title: 'Found: friendly brown dog with a red collar', area: 'Near the clubhouse', approx: general('Near the clubhouse'), animalType: 'dog', photos: 1, publishedAt: dayAt(4, 11, 30), source: 'admin', mine: false, status: 'active',
      description: 'A friendly short-haired brown dog with a red collar (no tag) has been around the clubhouse since Saturday. It is safe and being watched. If this is your dog, you can submit a claim and the subdivision will review it.',
      sightings: [spot(dayAt(2, 18, 30), rounded('Clubhouse parking', 'clubhouse parking'), 'Seen again in the clubhouse parking area.')],
    },
    {
      id: 'n-lost-luna', type: 'lost_pet', title: 'Lost cat: Luna, gray tabby with white paws', area: 'Near Block 9 and the Phase 1 playground', approx: general('luna last seen'), animalType: 'cat', photos: 2, publishedAt: dayAt(7, 9, 30), source: 'owner', mine: false, lastSeenAt: dayAt(8, 18, 30), status: 'active',
      description: 'Luna went missing on Sunday evening. She is small and gray with white paws and wears a green collar. She is shy but may come to her name. Please do not chase her.',
      sightings: [
        spot(dayAt(5, 19, 0), rounded('Near the Phase 1 playground', 'luna playground'), 'Seen under a bench at dusk.'),
        spot(dayAt(1, 6, 45), rounded('Block 8 carports', 'luna block 8'), 'Under a parked car, looked well.', 'neighbour', false, 1),
      ],
    },
    {
      id: 'n-adv-leash', type: 'safety_advisory', title: 'Reminder: keep dogs leashed in common areas', area: 'All common areas', photos: 0, publishedAt: dayAt(12, 9, 0), source: 'admin', mine: false, status: 'active', sightings: [],
      description: 'Please keep dogs on a leash in the park, playgrounds and sidewalks. This helps children, joggers and other pets feel safe.',
      guidance: ['Use a leash in all common areas.', 'Pick up after your pet.', 'If your pet gets out, let the guardhouse know so neighbours can help.'],
    },
    {
      id: 'n-found-rabbit', type: 'found_animal', title: 'Found: white rabbit near the Phase 1 playground', area: 'Near the Phase 1 playground', approx: general('rabbit playground'), animalType: 'small_mammal', photos: 1, publishedAt: hoursAgo(30), source: 'admin', mine: false, status: 'active', sightings: [],
      description: 'A small white rabbit was seen hopping near the Phase 1 playground and is being looked after. If it is yours, you can submit a claim and describe how to recognise it.',
    },
    {
      id: 'n-found-cat', type: 'found_animal', title: 'Found: orange tabby cat near Block 6', area: 'Near Block 6', approx: general('cat block 6'), animalType: 'cat', photos: 1, publishedAt: dayAt(3, 16, 0), source: 'admin', mine: false, status: 'active', sightings: [],
      description: 'An orange tabby cat with a small nick in one ear is at a Block 6 garden. It is healthy and has been given water. If this is your cat, you can submit a claim.',
    },
  ];

  if (variant === 'new') {
    const profile: Profile = { ...(signup ?? { id: 'res-new', name: 'New Resident', email: 'new.resident@mail.example', phone: '0917 000 0000', unit: 'Block 1, Lot 1', street: 'Molave St.' }), memberSince: now.toISOString() };
    return {
      profile, settings, reports: [], notices: notices.filter((x) => !x.mine), claims: [], pets: [], draft: null, nextRef: 168, seq: 1000,
      notifications: [{ id: sid('nt'), kind: 'community_notice', title: 'Welcome to StraySafe', body: 'Report an animal concern, share a lost or found pet, and follow what happens next. Start with the Help section if you like.', at: now.toISOString(), read: false, to: '/help' }],
    };
  }

  // ----------------------------------------------------------------------------------------------------- this resident
  const profile: Profile = { id: SAMPLE_ACCOUNT.id, name: SAMPLE_ACCOUNT.name, email: SAMPLE_ACCOUNT.email, phone: '0917 000 0104', unit: 'Block 4, Lot 21', street: 'Molave St.', memberSince: dayAt(300, 10) };

  const pets: Pet[] = [
    { id: 'pet-1', name: 'Mochi', type: 'dog', breed: 'Shih Tzu', color: 'White and gold', ageText: '3 years', markings: ['Gold ear tips', 'Pink collar with tag'], description: 'Shy with strangers. Answers to her name.', registeredAt: dayAt(200, 11) },
    { id: 'pet-2', name: 'Biscuit', type: 'cat', breed: 'Domestic shorthair', color: 'Orange tabby', ageText: '4 years', markings: ['Small nick on the left ear'], description: 'Indoor-outdoor cat, usually home by dusk.', registeredAt: dayAt(150, 14) },
  ];

  // Mochi was last seen near the clubhouse: the report keeps the exact spot, the notice only the rounded area around it.
  const mochiSeen = exact('Near the clubhouse', 'mochi near the clubhouse');
  notices.unshift({
    id: 'n-lost-mochi', type: 'lost_pet', title: 'Lost dog: Mochi, white and gold Shih Tzu', area: 'Near the clubhouse', approx: generalize(mochiSeen.lat as number, mochiSeen.lng as number), animalType: 'dog', photos: 1, publishedAt: hoursAgo(3.9), source: 'owner', mine: true, reportId: 'SS-2026-0165', lastSeenAt: hoursAgo(5.6), status: 'active',
    description: 'Mochi slipped out of the gate this afternoon. She is small, white and gold, with a pink collar and a tag. She is shy with strangers and answers to her name. Please do not chase her.',
    // Mochi's owner sees these exactly. The last one was told to her by a neighbour and has no pin, only words.
    sightings: [
      spot(hoursAgo(2.1), exact('Near the clubhouse entrance', 'mochi clubhouse entrance'), 'A small white dog was sitting by the clubhouse entrance for a few minutes.'),
      spot(hoursAgo(1.3), exact('Molave Street', 'mochi molave street'), 'Heading toward Molave Street, not wearing a leash.'),
      spot(hoursAgo(0.8), typed('Block 4'), 'My neighbour says she saw a small white dog near the Block 4 playground.', 'you', true),
    ],
  });

  const reports: Report[] = [
    {
      id: 'SS-2026-0165', kind: 'lost', category: 'lost_pet', status: 'in_progress', title: 'Lost pet: Mochi', animalType: 'dog', petName: 'Mochi', petId: 'pet-1', visibility: 'published', noticeId: 'n-lost-mochi',
      description: 'Small white and gold Shih Tzu with a pink collar and a tag. Shy with strangers and answers to her name.', location: mochiSeen,
      observedAt: hoursAgo(5.6), submittedAt: hoursAgo(4.8), updatedAt: hoursAgo(0.8), media: [photo('mochi-at-home.jpg')], outcome: null,
      updates: [
        up(hoursAgo(4.8), 'received', 'Report received', 'Your lost-pet report was submitted.'),
        up(hoursAgo(4.2), 'status', 'Under review', 'An administrator is looking at your report.'),
        up(hoursAgo(3.9), 'status', 'In progress', 'Your lost-pet notice was published to neighbours. Your contact details are not shown.'),
        up(hoursAgo(2.1), 'sighting', 'A neighbour reported a sighting', 'A small white dog was seen near the clubhouse entrance.'),
        up(hoursAgo(0.8), 'you', 'You added a sighting', 'Someone told you they saw her near the Block 4 playground.'),
      ].reverse(),
    },
    {
      id: 'SS-2026-0161', kind: 'incident', category: 'nuisance', status: 'under_review', title: 'Cats gathering near the Block 4 playground bins', animalType: 'cat', visibility: 'private', noticeId: null,
      description: 'At least four cats sleep near the garbage collection point and someone leaves food out. There is a smell and the cats fight at night.', location: exact('Block 4 · Molave St.', 'bins block 4'),
      observedAt: dayAt(4, 20, 0), submittedAt: dayAt(3, 21, 15), updatedAt: dayAt(1, 14, 30), media: [photo('cats-near-bins.jpg')], outcome: null,
      updates: [
        up(dayAt(3, 21, 15), 'received', 'Report received', 'This report is private. Only authorized subdivision administrators can see it.'),
        up(dayAt(2, 9, 0), 'status', 'Under review', 'An administrator is reviewing your report.'),
        up(dayAt(1, 14, 30), 'message', 'Message from the subdivision', 'Could you tell us which evenings you saw the cats, and whether anyone was feeding them? You can add the details to this report.'),
      ].reverse(),
    },
    {
      id: 'SS-2026-0156', kind: 'incident', category: 'safety', status: 'in_progress', title: 'Dog off-leash near the park path', animalType: 'dog', visibility: 'private', noticeId: null,
      description: 'A medium brown dog without a leash ran toward joggers near the park path this morning. I kept my distance and did not take photos.', location: exact('Around the park', 'dog off leash near the park'),
      observedAt: dayAt(2, 6, 40), submittedAt: dayAt(2, 7, 5), updatedAt: dayAt(1, 15, 0), media: [], outcome: null,
      updates: [
        up(dayAt(2, 7, 5), 'received', 'Report received', 'This report is private. Only authorized subdivision administrators can see it.'),
        up(dayAt(2, 7, 40), 'status', 'Under review', 'An administrator is reviewing your report.'),
        up(dayAt(2, 8, 10), 'status', 'In progress', 'The subdivision started coordinating a response and asked outside help. Please keep a safe distance from the animal.'),
        up(dayAt(1, 15, 0), 'message', 'Message from the subdivision', 'There has been no new sighting since yesterday. A safety reminder was shared with neighbours.'),
      ].reverse(),
    },
    {
      id: 'SS-2026-0129', kind: 'incident', category: 'injured', status: 'closed', title: 'Injured pigeon unable to fly', animalType: 'bird', visibility: 'private', noticeId: null,
      description: 'A pigeon with a drooping wing was sitting in our garden and could not fly.', location: exact('Block 4 · Molave St.', 'pigeon garden block 4'),
      observedAt: dayAt(20, 8, 30), submittedAt: dayAt(20, 9, 0), updatedAt: dayAt(18, 15, 0), media: [photo('pigeon.jpg')],
      outcome: { label: 'Handled by the animal welfare group', summary: 'The Local Animal Welfare Group collected the bird and took it for care. Nothing further is needed from you.', resolved: true, at: dayAt(18, 15, 0) },
      updates: [
        up(dayAt(20, 9, 0), 'received', 'Report received'),
        up(dayAt(20, 10, 0), 'status', 'In progress', 'The subdivision asked a local animal welfare group for help.'),
        up(dayAt(18, 15, 0), 'outcome', 'Closed', 'The welfare group collected the bird.'),
      ].reverse(),
    },
    {
      id: 'SS-2026-0127', kind: 'incident', category: 'nuisance', status: 'closed', title: 'Barking dog at night, Block 7', animalType: 'dog', visibility: 'private', noticeId: null,
      description: 'A dog barked late into the night several times a week.', location: typed('Block 7 · Acacia St.'),
      observedAt: dayAt(33, 23, 0), submittedAt: dayAt(32, 8, 0), updatedAt: dayAt(26, 11, 0), media: [],
      outcome: { label: 'Closed without a confirmed resolution', summary: 'Security patrols did not hear the barking on the nights they checked, and no owner could be confirmed. The case can be reopened if it returns.', resolved: false, at: dayAt(26, 11, 0) },
      updates: [
        up(dayAt(32, 8, 0), 'received', 'Report received'),
        up(dayAt(31, 9, 0), 'status', 'Under review'),
        up(dayAt(26, 11, 0), 'outcome', 'Closed', 'Closed without a confirmed resolution.'),
      ].reverse(),
    },
    {
      id: 'SS-2026-0118', kind: 'found', category: 'found_animal', status: 'closed', title: 'Found: orange kitten near Block 6', animalType: 'cat', visibility: 'private', noticeId: null,
      description: 'A small orange kitten was crying under a car near Block 6.', location: typed('Near Block 6'),
      observedAt: dayAt(41, 16, 0), submittedAt: dayAt(41, 16, 20), updatedAt: dayAt(39, 10, 0), media: [photo('kitten.jpg')],
      outcome: { label: 'Owner found', summary: 'A neighbour recognised the kitten and it was returned home after the subdivision confirmed with them.', resolved: true, at: dayAt(39, 10, 0) },
      updates: [
        up(dayAt(41, 16, 20), 'received', 'Report received'),
        up(dayAt(41, 17, 0), 'status', 'In progress', 'A found-animal notice was published.'),
        up(dayAt(39, 10, 0), 'outcome', 'Closed', 'The owner was found.'),
      ].reverse(),
    },
  ];

  const claims: Claim[] = [
    {
      id: 'cl-1', noticeId: 'n-found-cat', petId: 'pet-2', status: 'under_review', submittedAt: dayAt(1, 17, 0),
      statement: 'He looks like my orange tabby Biscuit. He went out on Sunday and has a small nick on his left ear.', evidence: ['Registered pet profile (Biscuit)', 'Two photos showing the nicked ear'],
      updates: [up(dayAt(1, 17, 0), 'received', 'Claim submitted'), up(dayAt(1, 17, 5), 'status', 'Under review', 'An administrator is comparing your information with the found cat.')].reverse(),
    },
  ];

  const notifications: Notification[] = [
    { id: sid('nt'), kind: 'report_update', title: 'Message about SS-2026-0161', body: 'The subdivision asked which evenings you saw the cats.', at: dayAt(1, 14, 30), read: false, to: '/reports/SS-2026-0161' },
    { id: sid('nt'), kind: 'sighting', title: 'Possible sighting of Mochi', body: 'Seen near the clubhouse entrance a couple of hours ago.', at: hoursAgo(2.1), read: false, to: '/community/n-lost-mochi/sightings' },
    { id: sid('nt'), kind: 'claim_update', title: 'Your ownership claim is under review', body: 'Found: orange tabby cat near Block 6.', at: dayAt(1, 17, 5), read: false, to: '/claims/cl-1' },
    { id: sid('nt'), kind: 'safety_advisory', title: 'Safety advisory: unfamiliar dog near the park', body: 'Keep a safe distance and report sightings to the guardhouse.', at: dayAt(2, 10, 15), read: true, to: '/community/n-adv-park' },
    { id: sid('nt'), kind: 'report_update', title: 'SS-2026-0156 is now in progress', body: 'The subdivision started coordinating a response.', at: dayAt(2, 8, 10), read: true, to: '/reports/SS-2026-0156' },
    { id: sid('nt'), kind: 'community_notice', title: 'New notice: found white rabbit', body: 'Near the Phase 1 playground.', at: hoursAgo(30), read: true, to: '/community/n-found-rabbit' },
  ];

  return { profile, settings, reports, notices, claims, pets, notifications, draft: null, nextRef: 168, seq: 1000 };
}
