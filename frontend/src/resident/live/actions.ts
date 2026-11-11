/**
 * What each change the Resident screens make (a ResidentAction, data/reducer.ts) does on the real backend: one or a few
 * requests, in the order the server's rules need. The server is the authority on who may do what, what is published and what is
 * private; this file only translates, and a refusal reaches the screen as the server's own sentence.
 *
 * Nothing is applied optimistically. The provider re-reads what an action touched, so the screen shows what the server holds.
 * Where a change is made of a save and a follow-up (a report and its photos, a report and the notice it asks for), the save is
 * what counts: a follow-up that fails is reported beside the result, never as a failed save (a second try would file it twice).
 */
import { AdminApiError, errorMessage } from '../../preview/lib/errors';
import { fromLocalInput } from '../../preview/lib/format';
import { toServer } from '../../live/dates';
import { reportIdOf } from '../../live/refs';
import { uploadDirectToCloudinary } from '../../utils/cloudinaryUpload';
import type { ResidentAction } from '../data/reducer';
import type { CategoryId, Draft, Media, Notice, ResidentState } from '../data/types';
import { ANIMAL_LABEL, PINNED_LABEL, evidenceIdsFrom, joinAddress, joinExtra, noticeRef, petToApi, preferencesFrom, withPetName } from './adapters';
import { residentApi, type ApiResidentCategories } from './api';

export interface ResidentActionContext {
  userId: number;
  state(): ResidentState;
  /** The stored id a report of this kind is filed with. */
  categoryIdOf(family: CategoryId): number | null;
  /** Hands the provider what the server just said about the kinds of report (what is accepted, and the stored id of each). */
  categoriesRead?(cats: ApiResidentCategories): void;
}

/** What to read again afterwards, and what the screen asked to hear back. */
export interface ResidentActionResult {
  /** A report this change just filed (the provider turns it into the reference the screens route by). */
  created?: { number: number; createdAt: string };
  petId?: string;
  /** The reports to read again, by number. */
  reportNumbers: number[];
  notices?: boolean;
  claims?: boolean;
  pets?: boolean;
  profile?: boolean;
  settings?: boolean;
  /** Things that did not go as hoped although the change itself was saved (a photo that would not upload). */
  warnings?: string[];
}

const done = (r: Partial<ResidentActionResult> = {}): ResidentActionResult => ({ reportNumbers: [], ...r });
const fail = (message: string, status = 409): never => { throw new AdminApiError('server', message, status); };

const reportNumber = (ref: string): number => reportIdOf(ref) ?? fail('That report could not be found.', 404);
const numeric = (value: string, what: string): number => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fail(`That ${what} could not be found.`, 404);
};

/** The one short question the form asks for some kinds of concern, kept with the answer (see adapters.splitExtra). */
const EXTRA_LABEL: Partial<Record<CategoryId, string>> = { nuisance: 'How often does it happen?', injured: 'Can the animal move?', found_animal: 'Where is the animal now?' };

const KIND_ALERT = { lost: 'lost_pet', found: 'found_animal' } as const;

/** The report's description, with when it was seen when that was not right now (a report has no field for it). */
function descriptionOf(draft: Draft): string {
  const base = draft.kind === 'lost' ? withPetName(draft.petName, draft.description) : draft.description.trim();
  const seen = new Date(fromLocalInput(draft.observedAt));
  if (Number.isNaN(seen.getTime()) || draft.kind !== 'incident' || Date.now() - seen.getTime() < 15 * 60_000) return base;
  const when = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(seen);
  return `${base}\n\n(Seen ${when}.)`;
}

async function uploadReportPhotos(reportId: number, media: Media[]): Promise<string[]> {
  const warnings: string[] = [];
  for (const m of media) {
    if (!m.file) continue;
    try { await residentApi.uploadReportMedia(reportId, m.file); } catch (err) { warnings.push(`“${m.name}” could not be added: ${errorMessage(err)}`); }
  }
  return warnings;
}

async function submitReport(ctx: ResidentActionContext): Promise<ResidentActionResult> {
  const draft = ctx.state().draft ?? fail('There is no report to send. Start again from Report.');
  const animal = draft.animalType;
  if (!animal || draft.description.trim().length < 10) return fail('Add the animal and a description first.', 422);
  const loc = draft.location ?? fail('Choose where the animal was.', 422);
  if (loc.lat === null || loc.lng === null) return fail('Pin the spot on the map or use your location. The subdivision needs a position to follow up.', 422);
  // The Leader may have switched this kind off since the app last asked. Ask again: the resident hears it in plain words before anything
  // is filed (what they wrote is kept) and the screens stop offering it. The server still refuses a switched-off kind on its own.
  const fresh = await residentApi.categories().then((c) => c, () => null);
  if (fresh) ctx.categoriesRead?.(fresh);
  const entry = fresh?.categories.find((c) => c.id === draft.category);
  if (fresh && !(entry?.enabled && entry.category_id !== null)) return fail('Your subdivision isn’t accepting this kind of report right now. What you wrote is kept: choose another type.', 409);
  const category = entry?.category_id ?? ctx.categoryIdOf(draft.category) ?? fail('This kind of report is not available in your subdivision.', 422);
  const label = loc.label === PINNED_LABEL ? null : loc.label;
  const extraLabel = EXTRA_LABEL[draft.category];

  const created = await residentApi.createReport({
    category_id: category, animal_type: ANIMAL_LABEL[animal], description: descriptionOf(draft), condition: extraLabel && draft.extra ? joinExtra(extraLabel, draft.extra) : null,
    latitude: loc.lat, longitude: loc.lng, landmark: label, animal_count: 1, pet_id: draft.petId ? numeric(draft.petId, 'pet') : null,
  });

  // The report is filed. Its photos and the notice it asks for come next, and a problem with them never undoes it.
  const warnings = await uploadReportPhotos(created.report_id, draft.media);
  if (draft.kind !== 'incident') {
    try {
      await residentApi.requestAlert(created.report_id, {
        alert_type: KIND_ALERT[draft.kind], last_seen_at: toServer(draft.observedAt), last_seen_location: label, last_seen_lat: loc.lat, last_seen_lng: loc.lng,
        contact_preference: 'app_message', owner_note: draft.description.trim().slice(0, 1000),
      });
    } catch (err) { warnings.push(`Your report was received, but the notice could not be requested: ${errorMessage(err)}`); }
  }
  return done({ created: { number: created.report_id, createdAt: created.created_at }, reportNumbers: [created.report_id], notices: true, warnings });
}

/** The first line of a case chat message is the text; each photo after it is its own message, so none is lost. */
async function sendUpdate(reportId: number, text: string, media: Media[]): Promise<void> {
  const urls: string[] = [];
  for (const m of media) {
    if (!m.file) continue;
    urls.push((await uploadDirectToCloudinary(m.file, 'case-chat')).url);          // nothing is sent until every photo is up, so a failure sends nothing
  }
  await residentApi.sendChat(reportId, text, urls[0] ?? null);
  for (const url of urls.slice(1)) await residentApi.sendChat(reportId, 'Photo', url);
}

async function sightingForm(a: Extract<ResidentAction, { type: 'sighting/add' }>): Promise<FormData> {
  if (a.location.lat === null || a.location.lng === null) fail('Pin the spot on the map where you saw it.', 422);
  const form = new FormData();
  form.append('latitude', String(a.location.lat));
  form.append('longitude', String(a.location.lng));
  form.append('location_source', 'map_pin');
  if (a.location.label && a.location.label !== PINNED_LABEL) form.append('location_label', a.location.label);
  form.append('seen_at', toServer(a.observedAt) ?? fail('Choose when you saw it.', 422));
  form.append('description', a.description.trim());
  form.append('accuracy_confirmed', 'true');
  form.append('client_request_id', `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);        // a double tap sends the same sighting once
  const photo = a.media?.find((m) => m.file)?.file;
  if (photo) form.append('photo', photo);
  return form;
}

async function submitClaim(a: Extract<ResidentAction, { type: 'claim/submit' }>, ctx: ResidentActionContext): Promise<ResidentActionResult> {
  const notice: Notice | undefined = ctx.state().notices.find((n) => n.id === a.noticeId);
  const number = notice?.reportNumber ?? fail('That notice could not be found.', 404);
  const urls: string[] = [];
  for (const m of a.media ?? []) {
    if (m.file) urls.push((await uploadDirectToCloudinary(m.file, 'ownership-claims')).url);
  }
  const proof = a.evidence.filter((e) => !e.startsWith('Photo: '));
  await residentApi.submitClaim(number, {
    statement: a.statement.trim(), evidence: evidenceIdsFrom(proof), evidence_urls: urls, claimed_pet_id: a.petId ? numeric(a.petId, 'pet') : null,
  });
  return done({ claims: true, notices: true });
}

export async function runAction(a: ResidentAction, ctx: ResidentActionContext): Promise<ResidentActionResult> {
  switch (a.type) {
    case 'report/submit': return submitReport(ctx);

    case 'report/addUpdate': {
      const number = reportNumber(a.reportId);
      await sendUpdate(number, a.text.trim(), a.media ?? []);
      return done({ reportNumbers: [number] });
    }

    case 'lost/recover': {
      const number = reportNumber(a.reportId);
      await residentApi.confirmReunited(number, a.note);
      return done({ reportNumbers: [number], notices: true });
    }

    case 'sighting/add': {
      const ref = noticeRef(a.noticeId) ?? fail('That notice could not be found.', 404);
      if (ref.kind !== 'alert') fail('Sightings are for lost-pet and found-animal notices.', 409);
      await residentApi.submitSighting(ref.id, await sightingForm(a));
      return done({ notices: true });
    }

    case 'claim/submit': return submitClaim(a, ctx);
    case 'claim/addInfo': await residentApi.claimInfo(numeric(a.claimId, 'claim'), a.text.trim()); return done({ claims: true });

    case 'pet/save': {
      const exists = ctx.state().pets.some((p) => p.id === a.pet.id);
      const saved = exists ? await residentApi.updatePet(numeric(a.pet.id, 'pet'), petToApi(a.pet)) : await residentApi.createPet(petToApi(a.pet));
      const warnings: string[] = [];
      if (a.photo) {
        try { await residentApi.uploadPetPhoto(saved.pet_id, a.photo); } catch (err) { warnings.push(`The photo could not be added: ${errorMessage(err)}`); }
      }
      return done({ pets: true, petId: String(saved.pet_id), warnings });
    }

    case 'profile/update': {
      const patch: Record<string, unknown> = {};
      const p = ctx.state().profile;
      if (a.patch.name !== undefined) patch.name = a.patch.name;
      if (a.patch.email !== undefined) patch.email = a.patch.email;
      if (a.patch.phone !== undefined) patch.phone = a.patch.phone;
      if (a.patch.unit !== undefined || a.patch.street !== undefined) patch.address = joinAddress(a.patch.unit ?? p.unit, a.patch.street ?? p.street);
      await residentApi.updateUser(ctx.userId, patch);
      return done({ profile: true });
    }

    case 'settings/set': await residentApi.savePreferences(preferencesFrom(a.settings)); return done({ settings: true });

    case 'contact/send': return fail('Sending a message to the office is not available in the app yet. Use the office details on this screen.', 501);

    // Handled on this device by the provider (drafts and the read marks).
    default: return done();
  }
}
