import { useRef, useState, type ChangeEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Archive, Check, FileQuestion, ImagePlus, Trash2, TriangleAlert, X } from 'lucide-react';
import { adminPath } from '../config';
import { Button, LinkButton } from '../components/Button';
import { ConfirmDialog } from '../components/Dialog';
import { Field, FieldGroup, Input, OptionGroup, Select, Textarea } from '../components/form';
import { Block, Callout, EmptyState, FormError, PageHeader, Panel } from '../components/layout';
import { NoticePreview } from '../components/NoticePreview';
import { useToast } from '../components/toast';
import { ANIMAL_TYPES, NOTICE_TYPES } from '../data/constants';
import { useAdminData } from '../data/context';
import { caseById } from '../data/selectors';
import type { Case, Notice, NoticeMedia, NoticeType } from '../data/types';
import { ArchiveNoticeDialog, PublishNoticeDialog } from '../dialogs/NoticeDialogs';
import { EMAIL_PATTERN, EXACT_ADDRESS_PATTERN, PHONE_PATTERN } from '../../preview/lib/format';
import { usePageTitle } from '../lib/hooks';
import { useGuardedNavigate, useUnsavedGuard } from '../lib/navGuard';
import { useSubmit } from '../lib/useSubmit';

interface Form { type: NoticeType; title: string; description: string; location: string; caseId: string; media: NoticeMedia[] }

const MAX_PHOTOS = 4;
const MAX_BYTES = 5 * 1024 * 1024;
const TITLE_MAX = 90;
const BODY_MAX = 600;

const TYPE_HELP: Record<NoticeType, string> = {
  lost_pet: 'Describe the animal and where it was last seen. Leave out your home address.',
  found_animal: 'Describe the animal. Keep one identifying detail back, so the real owner can confirm it.',
  safety_advisory: 'Describe what was observed and sensible precautions. Do not present unverified claims as confirmed facts.',
};

function initialForm(existing: Notice | undefined, from: Case | undefined): Form {
  if (existing) return { type: existing.type, title: existing.title, description: existing.description, location: existing.location, caseId: existing.caseId ?? '', media: existing.media };
  if (from) {
    const type: NoticeType = from.category === 'found_animal' ? 'found_animal' : from.category === 'safety' ? 'safety_advisory' : 'lost_pet';
    const animal = ANIMAL_TYPES[from.animal.type].toLowerCase();
    return {
      type, caseId: from.id, media: [], description: '',
      title: type === 'lost_pet' ? `Lost ${animal}` : type === 'found_animal' ? `Found ${animal}` : 'Safety reminder',
      location: `Near ${from.location.area.split(' · ')[0]}`,
    };
  }
  return { type: 'lost_pet', title: '', description: '', location: '', caseId: '', media: [] };
}

/** A15 — Create / edit community notice. Wrapper only resolves what is being edited; the form is keyed so it starts fresh. */
export default function NoticeEditorPage() {
  const { noticeId } = useParams();
  const [params] = useSearchParams();
  const { state } = useAdminData();
  const existing = noticeId ? state.notices.find((n) => n.id === noticeId) : undefined;
  const from = caseById(state, params.get('fromCase') ?? undefined);
  usePageTitle(existing ? 'Edit notice' : 'Create notice');

  if (noticeId && !existing) {
    return (
      <Panel>
        <EmptyState icon={FileQuestion} title="We can’t find that notice" action={<LinkButton variant="primary" to={adminPath('/community')}>Back to Community</LinkButton>}>It may have been deleted.</EmptyState>
      </Panel>
    );
  }
  return <NoticeEditor key={noticeId ?? `new-${from?.id ?? ''}`} existing={existing} from={from} />;
}

function NoticeEditor({ existing, from }: { existing?: Notice; from?: Case }) {
  const { state, dispatch, capabilities } = useAdminData();
  const toast = useToast();
  const navigate = useNavigate();
  const go = useGuardedNavigate();
  const { pending, error, run } = useSubmit();
  const fileInput = useRef<HTMLInputElement>(null);

  const initial = initialForm(existing, from);
  const [f, setF] = useState<Form>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [photoError, setPhotoError] = useState<string>();
  const [confirmPublish, setConfirmPublish] = useState<Notice | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const archived = existing?.status === 'archived';
  const published = existing?.status === 'published';
  const dirty = JSON.stringify({ ...f, media: f.media.map((m) => m.id) }) !== JSON.stringify({ ...initial, media: initial.media.map((m) => m.id) });
  useUnsavedGuard(dirty);

  // Privacy check: contact details and exact addresses never go in a public notice, nor does the name of a resident.
  const text = `${f.title}\n${f.description}\n${f.location}`;
  const lower = text.toLowerCase();
  const namedResident = state.residents.find((r) => lower.includes(r.name.toLowerCase()));
  const checks = [
    { ok: !PHONE_PATTERN.test(text) && !EMAIL_PATTERN.test(text), pass: 'No phone numbers or email addresses', fail: 'Contains a phone number or email address. Residents should contact the office instead.' },
    { ok: !EXACT_ADDRESS_PATTERN.test(text), pass: 'General location only', fail: 'Looks like an exact address (lot number). Use a general area.' },
    { ok: !namedResident, pass: 'No resident is named', fail: `Mentions ${namedResident?.name ?? 'a resident'} by name. Public notices should not name people.` },
  ];
  const clean = checks.every((c) => c.ok);
  // A lost-pet alert and a found-animal notice are kept on a case by the backend, with a title made from the report and the report's
  // own photo. A safety advisory has no case.
  const onCase = !capabilities.noticeWithoutCase && f.type !== 'safety_advisory';
  const noCase = !capabilities.noticeWithoutCase && f.type === 'safety_advisory';
  const wantedCategory = f.type === 'found_animal' ? 'found_animal' : 'lost_pet';
  const linkable = state.cases.filter((c) => !c.sensitive && (c.status !== 'closed' || c.id === f.caseId) && (!onCase || c.category === wantedCategory));
  const set = (patch: Partial<Form>) => setF((p) => ({ ...p, ...patch }));

  const addPhotos = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    let message: string | undefined;
    const added: NoticeMedia[] = [];
    for (const file of files) {
      if (f.media.length + added.length >= MAX_PHOTOS) { message = `You can add up to ${MAX_PHOTOS} photos.`; break; }
      if (!file.type.startsWith('image/')) { message = `“${file.name}” is not an image.`; continue; }
      if (file.size > MAX_BYTES) { message = `“${file.name}” is larger than 5 MB.`; continue; }
      added.push({ id: `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, name: file.name, url: URL.createObjectURL(file), file });
    }
    setPhotoError(message);
    if (added.length) set({ media: [...f.media, ...added] });
  };
  const removePhoto = (m: NoticeMedia) => { if (m.file && m.url) URL.revokeObjectURL(m.url); set({ media: f.media.filter((x) => x.id !== m.id) }); };
  // A photo the server already holds cannot be removed from here (the backend has no way to), so no remove button is offered for it.
  const removable = (m: NoticeMedia) => !!m.file;

  const build = (): Notice => ({
    id: existing?.id ?? `notice-${Date.now().toString(36)}`, type: f.type, title: onCase ? (existing?.title ?? '') : f.title.trim(), description: f.description.trim(), location: f.location.trim(),
    media: f.media, status: existing?.status ?? 'draft', caseId: f.caseId || null, source: existing?.source ?? 'admin', createdAt: existing?.createdAt ?? '', updatedAt: '',
    publishedAt: existing?.publishedAt ?? null, author: existing?.author ?? state.admin.name,
  });

  const validate = (forPublish: boolean) => {
    const next: Record<string, string> = {};
    if (!onCase && f.title.trim().length < 5) next.title = 'Give the notice a clear title (at least 5 characters).';
    if (onCase && !f.caseId) next.caseId = 'Choose the case this notice is about.';
    if (forPublish) {
      if (f.description.trim().length < 20) next.description = 'Describe what residents need to know (at least 20 characters).';
      if (!f.location.trim()) next.location = 'Add a general location, such as “Near the clubhouse”.';
      if (!clean) next.privacy = 'Fix the items in the privacy check before publishing.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const saveDraft = async () => {
    if (!validate(false)) return;
    if (await run(() => dispatch({ type: 'notice/save', notice: build(), publish: false }))) { toast.success('Draft saved'); navigate(`${adminPath('/community')}?status=draft`); }
  };
  const publish = () => { if (validate(true)) setConfirmPublish(build()); };
  const hint = f.type === 'safety_advisory' ? 'Safety advisories are always published by an administrator.' : state.settings.privacy[f.type === 'lost_pet' ? 'lostPetPublication' : 'foundPublication'] === 'immediate' ? 'Community policy: these notices are published as soon as they are ready.' : 'Community policy: these notices are reviewed by an administrator before publishing.';

  return (
    <div>
      <PageHeader
        back={{ to: adminPath('/community'), label: 'Community' }}
        title={existing ? (archived ? 'Archived notice' : 'Edit notice') : 'Create notice'}
        description="Write what neighbours need to know. Nothing is published until you confirm."
        actions={existing ? (published ? <Button icon={Archive} onClick={() => setArchiving(true)}>Archive</Button> : existing.status === 'draft' ? <Button variant="danger" icon={Trash2} onClick={() => setDeleting(true)}>Delete draft</Button> : null) : null}
      />
      {archived ? <Callout className="mb-5">This notice is archived{existing?.archivedReason ? ` (${existing.archivedReason})` : ''}. Residents no longer see it, and it is kept on record.</Callout> : null}

      <div className="sa-editor">
        <form noValidate onSubmit={(e) => { e.preventDefault(); publish(); }}>
          <fieldset disabled={archived} className="m-0 min-w-0 border-0 p-0">
            <Panel>
              <Block title="Notice">
                <div className="flex flex-col gap-5">
                  <FieldGroup label="Type">
                    <OptionGroup name="type" label="Notice type" cols={3} value={f.type} onChange={(type) => set({ type })} options={(Object.keys(NOTICE_TYPES) as NoticeType[]).map((t) => ({ value: t, label: NOTICE_TYPES[t].label, description: NOTICE_TYPES[t].hint }))} />
                  </FieldGroup>
                  {onCase ? (
                    <Field label="Title" hint="Made from the case, for example “Missing dog: Mochi”, so it always matches the report."><p className="sa-small sa-semibold">{existing?.title || 'Made when the notice is saved'}</p></Field>
                  ) : (
                    <Field label="Title" required error={errors.title} hint={`${f.title.length}/${TITLE_MAX}`}><Input value={f.title} maxLength={TITLE_MAX} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Lost cat: gray tabby with white paws" /></Field>
                  )}
                  <Field label="Description" required error={errors.description} hint={`${TYPE_HELP[f.type]} (${f.description.length}/${BODY_MAX})`}><Textarea rows={6} value={f.description} maxLength={BODY_MAX} onChange={(e) => set({ description: e.target.value })} /></Field>
                  <Field label="General location" required error={errors.location} hint="A general area only. No house or lot numbers.">
                    <Input value={f.location} onChange={(e) => set({ location: e.target.value })} placeholder="e.g. Near the clubhouse" />
                  </Field>
                </div>
              </Block>

              {onCase ? (
                <Block title="Photos"><p className="sa-small sa-text-2">The notice shows the photo from the case, never one you add here. Choose a case with a clear photo of the animal.</p></Block>
              ) : (
                <Block title="Photos" description={`Optional. Up to ${MAX_PHOTOS}, 5 MB each. Avoid people, house numbers and licence plates.`}>
                  <div className="flex flex-wrap items-center gap-3">
                    {f.media.map((m) => (
                      <div key={m.id} className="relative">
                        {m.url ? <img src={m.url} alt={m.name} className="size-20 rounded-md object-cover" style={{ border: '1px solid var(--sa-line)' }} /> : <span className="sa-tile__art size-20 rounded-md" style={{ aspectRatio: '1' }} title={m.name}><ImagePlus size={18} aria-hidden="true" /></span>}
                        {removable(m) ? <button type="button" className="sa-btn sa-btn--secondary sa-btn--icon sa-btn--sm" style={{ position: 'absolute', top: -8, right: -8, width: 24, height: 24, borderRadius: 999 }} aria-label={`Remove ${m.name}`} onClick={() => removePhoto(m)}><X size={12} aria-hidden="true" /></button> : null}
                      </div>
                    ))}
                    {f.media.length < MAX_PHOTOS ? <Button icon={ImagePlus} onClick={() => fileInput.current?.click()}>Add photos</Button> : null}
                    <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={addPhotos} />
                  </div>
                  {photoError ? <p className="sa-error mt-2" role="alert">{photoError}</p> : null}
                </Block>
              )}

              {noCase ? null : (
                <Block title="Related case" description={onCase ? 'The case this notice is about. The notice is kept with it, and the case itself stays private.' : 'Optional. Links the notice to a case so the case history records it. The case itself stays private.'}>
                  <Field label="Case" required={onCase} error={errors.caseId}>
                    <Select value={f.caseId} disabled={onCase && !!existing} onChange={(e) => set({ caseId: e.target.value })}>
                      <option value="">{onCase ? 'Choose a case…' : 'Not linked to a case'}</option>
                      {linkable.map((c) => <option key={c.id} value={c.id}>{c.id} · {c.title}</option>)}
                    </Select>
                  </Field>
                  <p className="sa-hint mt-2">Private complaints are not listed here and can never be published.</p>
                </Block>
              )}
            </Panel>
          </fieldset>

          {errors.privacy ? <div className="mt-4"><FormError message={errors.privacy} /></div> : null}
          {error ? <div className="mt-4"><FormError message={error} /></div> : null}
          {!archived ? (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <Button onClick={() => go(adminPath('/community'))}>Cancel</Button>
              <span className="flex flex-wrap gap-2">
                {published ? null : <Button loading={pending} onClick={() => { void saveDraft(); }}>Save draft</Button>}
                <Button type="submit" variant="primary" disabled={pending}>{published ? 'Save changes' : 'Review and publish'}</Button>
              </span>
            </div>
          ) : null}
        </form>

        <aside className="sa-editor__aside" aria-label="Preview and privacy check">
          <div>
            <p className="sa-label mb-2">Publication preview</p>
            <NoticePreview type={f.type} title={f.title} description={f.description} location={f.location} media={f.media} subdivision={state.settings.subdivision.name} postedBy={existing?.source === 'resident' ? 'the owner, shared by the administration' : undefined} />
          </div>
          <Panel>
            <Block tight title="Privacy check" description="Checked as you type.">
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {checks.map((c) => (
                  <li key={c.pass} className="flex items-start gap-2.5 sa-small" style={{ color: c.ok ? 'var(--sa-sage-ink)' : 'var(--sa-red-ink)' }}>
                    {c.ok ? <Check size={16} className="mt-0.5 shrink-0" aria-hidden="true" /> : <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />}
                    <span>{c.ok ? c.pass : c.fail}</span>
                  </li>
                ))}
              </ul>
              <p className="sa-hint mt-3">The reporter’s identity and the case record are never part of a notice. {hint}</p>
            </Block>
          </Panel>
        </aside>
      </div>

      {confirmPublish ? <PublishNoticeDialog notice={confirmPublish} subdivision={state.settings.subdivision.name} update={published} onClose={() => setConfirmPublish(null)} onConfirmed={() => navigate(adminPath('/community'))} /> : null}
      {archiving && existing ? <ArchiveNoticeDialog notice={existing} onClose={() => setArchiving(false)} onDone={() => navigate(`${adminPath('/community')}?status=archived`)} /> : null}
      {deleting && existing ? <ConfirmDialog title="Delete this draft?" message="It has not been published. Deleting it cannot be undone." confirmLabel="Delete draft" tone="danger" onClose={() => setDeleting(false)} onConfirm={async () => { await dispatch({ type: 'notice/delete', id: existing.id }); toast.success('Draft deleted'); navigate(adminPath('/community')); }} /> : null}
    </div>
  );
}
