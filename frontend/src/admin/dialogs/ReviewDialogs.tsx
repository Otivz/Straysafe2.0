import { useState, type FormEvent } from 'react';
import { Maximize2, PawPrint, Play, SearchX } from 'lucide-react';
import { Badge, StatusBadge } from '../components/Badge';
import { Dialog } from '../components/Dialog';
import { Checkbox, Field, FieldGroup, OptionGroup, SearchInput, Textarea } from '../components/form';
import { ANIMAL_ICON } from '../components/icons';
import { Callout, EmptyState, FormError } from '../components/layout';
import { useMediaViewer } from '../components/MediaLightbox';
import { useToast } from '../components/toast';
import { CLAIM_STATUS, CATEGORIES } from '../data/constants';
import { useAdminData } from '../data/context';
import { petById, relatedCandidates, residentById } from '../data/selectors';
import type { Case, ClaimStatus } from '../data/types';
import { fmtDateTime, plural } from '../../preview/lib/format';
import { useSubmit } from '../lib/useSubmit';
import { FormFooter, type CaseDialogProps } from './BasicDialogs';

/**
 * Review ownership claim (A11). Registration is owner-declared and never proves ownership; visually similar animals are
 * not assumed identical. The decision states exactly what it will record, and accepting needs an explicit confirmation.
 */
export function ClaimReviewDialog({ c, claimId, onClose }: CaseDialogProps & { claimId: string }) {
  const { state, dispatch, capabilities } = useAdminData();
  const toast = useToast();
  const { pending, error, run } = useSubmit();
  const claim = c.claims.find((x) => x.id === claimId);
  const [decision, setDecision] = useState<ClaimStatus>(claim && claim.status !== 'submitted' ? claim.status : 'under_review');
  const [note, setNote] = useState(claim?.reviewNote ?? '');
  const [ack, setAck] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  if (!claim) return null;
  const pet = petById(state, claim.claimedPetId);
  const claimant = residentById(state, claim.claimantResidentId);
  const otherOpen = c.claims.filter((x) => x.id !== claim.id && (x.status === 'submitted' || x.status === 'under_review' || x.status === 'needs_info')).length;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (note.trim().length < 10) next.note = 'Record how you assessed the evidence (at least a sentence).';
    if (decision === 'accepted' && !ack) next.ack = 'Confirm before accepting the claim.';
    setErrors(next);
    if (Object.keys(next).length) return;
    if (await run(() => dispatch({ type: 'case/reviewClaim', id: c.id, claimId, decision, note: note.trim() }))) { toast.success('Claim review recorded'); onClose(); }
  };

  return (
    <Dialog size="lg" title="Review ownership claim" description={`${claim.claimantName} · submitted ${fmtDateTime(claim.submittedAt)}`} onClose={onClose} dirty={note !== (claim.reviewNote ?? '')} onSubmit={submit} footer={({ requestClose }) => <FormFooter pending={pending} label="Record decision" requestClose={requestClose} />}>
      <div className="sa-record">
        <p className="sa-label">Their statement</p>
        <p className="mt-1">“{claim.statement}”</p>
        <p className="sa-label mt-3">Supporting evidence</p>
        {claim.evidence.length === 0
          ? <p className="sa-small sa-text-3 mt-1">None provided.</p>
          : <ul className="mt-1 list-disc pl-5 sa-small">{claim.evidence.map((x) => <li key={x}>{x}</li>)}</ul>}
        <p className="sa-meta mt-3">Claimant: {claimant ? `${claimant.name} · ${claimant.unit} · ${claimant.status === 'pending' ? 'account not yet verified' : 'registered resident'}` : 'Walk-in / not a registered resident'}</p>
      </div>

      <div className="sa-grid2">
        <div className="sa-record"><p className="sa-label">Reported animal</p><p className="mt-1 sa-small">{c.animal.description}</p></div>
        <div className="sa-record">
          <p className="sa-label">{pet ? `Registered pet: ${pet.name}` : 'No registered pet named'}</p>
          <p className="mt-1 sa-small">{pet ? `${pet.color} · ${pet.breed}${pet.markings.length ? ` · ${pet.markings.join(', ').toLowerCase()}` : ''}` : 'Compare any photos and distinguishing marks directly.'}</p>
        </div>
      </div>
      <Callout>Registration is declared by the owner. It supports a claim but does not prove ownership, and a similar look is not proof of identity. Compare distinguishing marks and records.</Callout>

      <FieldGroup label="Decision">
        <OptionGroup name="decision" label="Decision" value={decision} onChange={setDecision} options={[
          { value: 'under_review', label: 'Keep under review', description: 'You are still assessing the evidence.' },
          { value: 'needs_info', label: 'Ask for more information', description: 'Ask the claimant for photos, records or markings.' },
          { value: 'accepted', label: 'Accept the claim', description: 'The evidence is sufficient for the procedure that applies.' },
          { value: 'rejected', label: 'Do not accept', description: 'The evidence is insufficient. This does not accuse the claimant of anything.' },
        ]} />
      </FieldGroup>
      <Field label="Verification notes" required error={errors.note}><Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="What did you compare, and what did you conclude?" /></Field>
      {decision === 'accepted' ? (
        <>
          {capabilities.acceptConfirmsOwnership ? (
            <Callout tone="sage" title="Accepting records:">ownership as <strong>Confirmed</strong>{claimant ? <> (owner: {claimant.name})</> : null}{pet ? <>, and the animal as <strong>identified</strong> as {pet.name}</> : null}.{otherOpen > 0 ? ` ${plural(otherOpen, 'other claim')} ${otherOpen === 1 ? 'is' : 'are'} still open. Review ${otherOpen === 1 ? 'it' : 'them'} too.` : ''}</Callout>
          ) : (
            <Callout tone="sage" title="Accepting records the claim as accepted.">The case’s ownership stays <strong>under review</strong> until you record the ownership decision, with the evidence you relied on, {c.category === 'found_animal' ? 'under “Who does it belong to?” on the report' : 'on the Assessment tab'}{claimant ? <> (the claimant is {claimant.name})</> : null}.{otherOpen > 0 ? ` ${plural(otherOpen, 'other claim')} ${otherOpen === 1 ? 'is' : 'are'} still open. Review ${otherOpen === 1 ? 'it' : 'them'} too.` : ''}</Callout>
          )}
          <Checkbox label="I compared distinguishing marks and records, and did not rely on registration alone." checked={ack} onChange={(e) => setAck(e.target.checked)} />
          {errors.ack ? <p className="sa-error" role="alert">{errors.ack}</p> : null}
        </>
      ) : null}
      <p className="sa-meta">Current status: <Badge tone={CLAIM_STATUS[claim.status].tone}>{CLAIM_STATUS[claim.status].label}</Badge></p>
      {error ? <FormError message={error} /> : null}
    </Dialog>
  );
}

/** Link related reports (A12). Linking only adds an association: every original report stays intact and can be unlinked. */
export function LinkReportsDialog({ c, onClose }: CaseDialogProps) {
  const { state, dispatch } = useAdminData();
  const toast = useToast();
  const { pending, error, run } = useSubmit();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string[]>([]);

  const monitored = c.category === 'lost_pet' || c.category === 'found_animal';
  const eligible = (other: Case) => !monitored || (other.status !== 'closed' && other.category === (c.category === 'lost_pet' ? 'found_animal' : 'lost_pet'));
  const suggestions = relatedCandidates(state.cases, c, 5).filter((x) => eligible(x.case));
  const pool = state.cases.filter((x) => x.id !== c.id && !c.relatedCaseIds.includes(x.id) && eligible(x));
  const query = q.trim().toLowerCase();
  const found = query ? pool.filter((x) => [x.id, x.title, x.location.area, x.animal.description].some((t) => t.toLowerCase().includes(query))).slice(0, 8) : [];
  const rows = query ? found.map((x) => ({ case: x, reasons: [] as string[] })) : suggestions;
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (picked.length === 0) return;
    if (await run(() => dispatch({ type: 'case/linkCases', id: c.id, otherIds: picked, sameAnimal: monitored }))) { toast.success(`${plural(picked.length, 'report')} linked`); onClose(); }
  };

  return (
    <Dialog size="lg" title="Link related reports" description="Group reports about the same concern without merging them." onClose={onClose} dirty={picked.length > 0} onSubmit={submit} footer={({ requestClose }) => (
      <>
        <span className="sa-small sa-text-2 mr-auto">{picked.length ? plural(picked.length, 'report') + ' selected' : 'Select reports to link'}</span>
        <FormFooter pending={pending} label="Link selected" requestClose={requestClose} />
      </>
    )}>
      <Callout>Each report stays a separate record with its own evidence and history. Linking only connects them, and you can unlink at any time.{monitored ? ' It also opens a direct conversation between the owner and the finder in their Resident app. Linking never confirms ownership or recovery.' : ''}</Callout>
      <SearchInput aria-label="Find a report" placeholder="Search by reference, concern or location" value={q} onChange={(e) => setQ(e.target.value)} />
      <div>
        <p className="sa-label mb-2">{query ? `Search results (${found.length})` : 'Possibly related'}</p>
        {rows.length === 0 ? (
          <EmptyState icon={SearchX} title={query ? 'No reports match' : 'No likely matches'} compact>{query ? 'Try a reference number or part of the location.' : 'Search to find another report to link.'}</EmptyState>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {rows.map(({ case: o, reasons }) => (
              <li key={o.id}>
                <LinkReportOption
                  o={o}
                  reasons={reasons}
                  picked={picked.includes(o.id)}
                  onToggle={toggle}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
      {error ? <FormError message={error} /> : null}
    </Dialog>
  );
}

function LinkReportOption({
  o,
  reasons,
  picked,
  onToggle,
}: {
  o: Case;
  reasons: string[];
  picked: boolean;
  onToggle: (id: string) => void;
}) {
  const { openMedia } = useMediaViewer();
  const [imgFailed, setImgFailed] = useState(false);

  const photo =
    !imgFailed &&
    (o.evidence?.find((e) => e.url && e.kind === 'photo')?.url ||
      o.evidence?.find((e) => e.url)?.url ||
      o.registeredPet?.current?.photos?.[0] ||
      null);

  const isVideo = Boolean(
    photo && (photo.endsWith('.mp4') || photo.endsWith('.webm') || photo.includes('/video/upload/'))
  );

  const AnimalIcon = ANIMAL_ICON[o.animal.type] ?? PawPrint;

  return (
    <label className="sa-option items-center">
      <input
        type="checkbox"
        checked={picked}
        onChange={() => onToggle(o.id)}
        className="flex-shrink-0"
      />
      <div className="group/thumb relative h-14 w-14 sm:h-16 sm:w-16 flex-shrink-0 overflow-hidden rounded-lg border border-[var(--sa-line)] bg-[var(--sa-sand)] flex items-center justify-center text-[var(--sa-ink-3)]">
        {photo ? (
          isVideo ? (
            <div className="relative flex h-full w-full items-center justify-center bg-black">
              <video
                src={photo}
                preload="metadata"
                className="h-full w-full object-cover opacity-80"
              />
              <span className="absolute flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white pointer-events-none">
                <Play size={10} fill="currentColor" className="translate-x-0.5" />
              </span>
            </div>
          ) : (
            <img
              src={photo}
              alt={`Photo for ${o.id}`}
              loading="lazy"
              onError={() => setImgFailed(true)}
              className="h-full w-full object-cover"
            />
          )
        ) : (
          <AnimalIcon size={24} strokeWidth={1.6} aria-hidden="true" />
        )}
        {photo ? (
          <span
            role="button"
            tabIndex={0}
            className="absolute bottom-1 right-1 rounded bg-black/65 p-1 text-white opacity-0 group-hover/thumb:opacity-100 transition-opacity focus:opacity-100 cursor-zoom-in shadow-sm"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              openMedia([
                {
                  url: photo,
                  kind: isVideo ? 'video' : 'photo',
                  title: `${o.id}: ${o.title}`,
                  caption: `${o.location.area} · observed ${fmtDateTime(o.observedAt)} · ${CATEGORIES[o.category].label}`,
                },
              ]);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation();
                e.preventDefault();
                openMedia([
                  {
                    url: photo,
                    kind: isVideo ? 'video' : 'photo',
                    title: `${o.id}: ${o.title}`,
                    caption: `${o.location.area} · observed ${fmtDateTime(o.observedAt)} · ${CATEGORIES[o.category].label}`,
                  },
                ]);
              }
            }}
            title="Click for full-screen preview"
            aria-label={`Preview media of ${o.id}`}
          >
            <Maximize2 size={11} />
          </span>
        ) : null}
      </div>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="sa-ref">{o.id}</span>
          <StatusBadge status={o.status} />
        </span>
        <span className="sa-option__title mt-1">{o.title}</span>
        <span className="sa-option__desc">
          {o.location.area} · observed {fmtDateTime(o.observedAt)} · {CATEGORIES[o.category].label}
        </span>
        {reasons.length ? (
          <span className="mt-1.5 flex flex-wrap gap-1.5">
            {reasons.map((r) => (
              <Badge key={r}>{r}</Badge>
            ))}
          </span>
        ) : null}
      </span>
    </label>
  );
}
