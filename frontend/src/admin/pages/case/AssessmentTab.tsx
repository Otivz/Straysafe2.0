import { useState, type FormEvent, type ReactNode } from 'react';
import { Eye, MessageSquare, PawPrint } from 'lucide-react';
import { Badge, OwnershipBadge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Checkbox, Field, FieldGroup, OptionGroup, Select, Textarea } from '../../components/form';
import { Block, Callout, FormError, Panel } from '../../components/layout';
import { SaveBar } from '../../components/SaveBar';
import { useToast } from '../../components/toast';
import { ANIMAL_TYPES, CLAIM_STATUS, IDENTITY, OWNERSHIP, OWNERSHIP_EVIDENCE, OWNERSHIP_IDS, SIZE_LABEL, SUFFICIENCY, URGENCY, VERIFICATION } from '../../data/constants';
import { useAdminData } from '../../data/context';
import { registryMatches, residentById } from '../../data/selectors';
import type { Assessment, Case, EvidenceSufficiency, IdentityReview, IdentityStatus, IncidentVerification, MatchDecision, OwnershipReview, OwnershipStatus, UrgencyLevel } from '../../data/types';
import { fmtDateTime, relative } from '../../../preview/lib/format';
import { useNow } from '../../../preview/lib/hooks';
import { useUnsavedGuard } from '../../lib/navGuard';
import { useSubmit } from '../../lib/useSubmit';
import type { OpenCaseDialog } from './dialogState';

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The assessment fields without the save stamp (the reducer adds who/when). */
const bare = (a: Assessment): Omit<Assessment, 'savedAt' | 'savedBy'> => ({
  incident: a.incident, incidentBasis: a.incidentBasis, evidenceSufficiency: a.evidenceSufficiency, evidenceReviewed: a.evidenceReviewed,
  urgency: a.urgency, urgencyNote: a.urgencyNote, notes: a.notes,
});

/** A form that is read-only once the case is closed. */
const Lockable = ({ locked, children }: { locked: boolean; children: ReactNode }) => <fieldset disabled={locked} className="m-0 min-w-0 border-0 p-0">{children}</fieldset>;

// ------------------------------------------------------------------------------------------------ incident review
interface IncidentForm { incident: IncidentVerification; basis: string; reviewed: string[]; sufficiency: EvidenceSufficiency; urgency: UrgencyLevel; urgencyNote: string; notes: string; setUrgent: boolean }
const incidentInit = (a: Assessment): IncidentForm => ({ incident: a.incident, basis: a.incidentBasis, reviewed: a.evidenceReviewed, sufficiency: a.evidenceSufficiency, urgency: a.urgency, urgencyNote: a.urgencyNote, notes: a.notes, setUrgent: false });

function IncidentSection({ c, locked, openDialog }: { c: Case; locked: boolean; openDialog: OpenCaseDialog }) {
  const { dispatch } = useAdminData();
  const toast = useToast();
  const { pending, error, run } = useSubmit();
  const initial = incidentInit(c.assessment);
  const [f, setF] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (patch: Partial<IncidentForm>) => setF((p) => ({ ...p, ...patch }));
  const dirty = !same(f, initial);
  useUnsavedGuard(dirty);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (f.incident !== 'not_reviewed' && f.basis.trim().length < 5) next.basis = 'Say what the decision is based on.';
    setErrors(next);
    if (Object.keys(next).length) return;
    const assessment: Omit<Assessment, 'savedAt' | 'savedBy'> = { incident: f.incident, incidentBasis: f.basis.trim(), evidenceSufficiency: f.sufficiency, evidenceReviewed: f.reviewed, urgency: f.urgency, urgencyNote: f.urgencyNote.trim(), notes: f.notes.trim() };
    if (await run(() => dispatch({ type: 'case/saveAssessment', id: c.id, assessment, identity: c.identity, ownership: c.ownership, alsoSetUrgent: f.setUrgent && f.urgency === 'immediate' }))) toast.success('Assessment saved');
  };

  return (
    <form onSubmit={submit} noValidate>
      <Lockable locked={locked}>
        <Panel>
          <Block title="Incident review" description="Did the reported incident occur? This is separate from which animal was involved and who is responsible for it.">
            <FieldGroup label="Verification">
              <OptionGroup name="incident" cols={2} label="Incident verification" value={f.incident} onChange={(v) => set({ incident: v })} options={(Object.keys(VERIFICATION) as IncidentVerification[]).map((v) => ({ value: v, label: VERIFICATION[v].label, description: VERIFICATION[v].description }))} />
            </FieldGroup>
            <Field className="mt-4" label="What the decision is based on" required={f.incident !== 'not_reviewed'} error={errors.basis}><Textarea rows={2} value={f.basis} onChange={(e) => set({ basis: e.target.value })} placeholder="e.g. The guard also saw the dog on Tuesday evening." /></Field>
          </Block>

          <Block title="Evidence review" description={c.evidence.length ? 'Mark what you have looked at, then say whether it is enough to act on.' : 'Evidence is optional. A report can be assessed from its description alone.'}>
            {c.evidence.length > 0 ? (
              <ul className="m-0 mb-4 flex list-none flex-col gap-2 p-0">
                {c.evidence.map((ev) => (
                  <li key={ev.id} className="flex items-center justify-between gap-3">
                    <Checkbox label={<>{ev.label} <span className="sa-text-3">· {fmtDateTime(ev.capturedAt).split(' · ')[0]}</span></>} checked={f.reviewed.includes(ev.id)} onChange={(e) => set({ reviewed: e.target.checked ? [...f.reviewed, ev.id] : f.reviewed.filter((x) => x !== ev.id) })} />
                    <Button size="sm" variant="ghost" icon={Eye} type="button" onClick={() => openDialog({ kind: 'evidence', evidenceId: ev.id })}>View</Button>
                  </li>
                ))}
              </ul>
            ) : null}
            <FieldGroup label="Is the evidence sufficient?">
              <OptionGroup name="sufficiency" label="Evidence sufficiency" inline value={f.sufficiency} onChange={(v) => set({ sufficiency: v })} options={(Object.keys(SUFFICIENCY) as EvidenceSufficiency[]).map((s) => ({ value: s, label: SUFFICIENCY[s] }))} />
            </FieldGroup>
            {f.sufficiency === 'needs_more' && !locked ? <Button className="mt-3" size="sm" icon={MessageSquare} type="button" onClick={() => openDialog({ kind: 'followUp', mode: 'follow_up' })}>Schedule a request to the reporter</Button> : null}
          </Block>

          <Block title="Urgency" description="Is anyone, or the animal, at immediate risk? Urgent concerns do not wait for routine steps.">
            <OptionGroup name="urgency" cols={3} label="Urgency" value={f.urgency} onChange={(v) => set({ urgency: v })} options={(['immediate', 'possible', 'none'] as UrgencyLevel[]).map((u) => ({ value: u, label: URGENCY[u].label, description: URGENCY[u].description }))} />
            <Field className="mt-4" label="Urgency notes" optional><Textarea rows={2} value={f.urgencyNote} onChange={(e) => set({ urgencyNote: e.target.value })} /></Field>
            {f.urgency === 'immediate' && c.priority !== 'urgent' ? <Checkbox className="mt-3" label="Also set the case priority to Urgent" checked={f.setUrgent} onChange={(e) => set({ setUrgent: e.target.checked })} /> : null}
          </Block>

          <Block title="Assessment notes">
            <Field label="Notes" optional hint="Your reasoning, for whoever picks this case up next."><Textarea rows={3} value={f.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
            {error ? <div className="mt-4"><FormError message={error} /></div> : null}
          </Block>
        </Panel>
      </Lockable>
      {!locked ? <SaveBar dirty={dirty} pending={pending} label="Save assessment" onDiscard={() => { setF(initial); setErrors({}); }} /> : null}
    </form>
  );
}

// ---------------------------------------------------------------------------------------------------------- identity
const DECISIONS: { value: MatchDecision; label: string }[] = [{ value: 'not_match', label: 'Not a match' }, { value: 'possible', label: 'Possibly the same' }, { value: 'confirmed', label: 'Confirm identity' }];

function IdentitySection({ c, locked }: { c: Case; locked: boolean }) {
  const { state, dispatch } = useAdminData();
  const toast = useToast();
  const { pending, error, run } = useSubmit();
  const initial: IdentityReview = c.identity;
  const [f, setF] = useState<IdentityReview>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const dirty = !same(f, initial);
  useUnsavedGuard(dirty);
  const candidates = registryMatches(state.pets, c);

  const decide = (petId: string, d: MatchDecision) => {
    const matches = { ...f.matches, [petId]: d };
    const values = Object.values(matches);
    let status: IdentityStatus = f.status;
    if (d === 'confirmed') status = 'identified';
    else if (d === 'possible' && f.status === 'unidentified') status = 'possible_match';
    else if (d === 'not_match' && f.status !== 'identified' && !values.includes('possible') && !values.includes('confirmed')) status = 'unidentified';
    setF({ ...f, matches, status });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (f.status === 'identified' && f.note.trim().length < 10) next.note = 'Say how the animal was identified (marks compared, who recognised it).';
    setErrors(next);
    if (Object.keys(next).length) return;
    if (await run(() => dispatch({ type: 'case/saveAssessment', id: c.id, assessment: bare(c.assessment), identity: { ...f, note: f.note.trim() }, ownership: c.ownership, alsoSetUrgent: false }))) toast.success('Animal identity saved');
  };

  return (
    <form onSubmit={submit} noValidate>
      <Lockable locked={locked}>
        <Panel>
          <Block title="Animal identity" description="Which animal was involved? An unknown animal is never treated as identified until you decide it is.">
            <FieldGroup label="Identity status">
              <OptionGroup name="identity" cols={3} label="Identity status" value={f.status} onChange={(v) => setF({ ...f, status: v })} options={(Object.keys(IDENTITY) as IdentityStatus[]).map((s) => ({ value: s, label: IDENTITY[s].label, description: IDENTITY[s].description }))} />
            </FieldGroup>

            <div className="mt-5">
              <p className="sa-label mb-1">Possible registry matches</p>
              <p className="sa-hint mb-3">Registered pets that could look similar. Looking alike is not confirmation, and a registered pet is a reference, not proof of ownership.</p>
              {candidates.length === 0 ? (
                <p className="sa-small sa-text-2">No registered pets look similar. You can still record an identity from other evidence, such as the guard recognising the animal.</p>
              ) : candidates.map((p) => {
                const owner = residentById(state, p.ownerId);
                const d = f.matches[p.id];
                return (
                  <div key={p.id} className="sa-match">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2"><PawPrint size={15} aria-hidden="true" /><span className="sa-semibold">{p.name}</span><span className="sa-meta">{ANIMAL_TYPES[p.type]} · {p.breed}</span></p>
                      <p className="sa-small sa-text-2 mt-1">{p.color} · {SIZE_LABEL[p.size].toLowerCase()} · {p.ageText}{p.markings.length ? ` · ${p.markings.join(', ').toLowerCase()}` : ''}</p>
                      <p className="sa-meta mt-1">Registered by {owner?.name ?? 'a resident'} · owner-declared</p>
                    </div>
                    <div className="sa-seg" role="group" aria-label={`Decision for ${p.name}`}>
                      {DECISIONS.map((x) => <button key={x.value} type="button" className="sa-seg__btn" aria-pressed={d === x.value} onClick={() => decide(p.id, x.value)}>{x.label}</button>)}
                    </div>
                  </div>
                );
              })}
            </div>

            <Field className="mt-5" label="Identification notes" required={f.status === 'identified'} error={errors.note} hint="Distinguishing marks compared, photos, who recognised the animal."><Textarea rows={3} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
            {error ? <div className="mt-4"><FormError message={error} /></div> : null}
          </Block>
        </Panel>
      </Lockable>
      {!locked ? <SaveBar dirty={dirty} pending={pending} label="Save identity" onDiscard={() => { setF(initial); setErrors({}); }} /> : null}
    </form>
  );
}

// -------------------------------------------------------------------------------------------------------- ownership
function OwnershipSection({ c, locked, openDialog }: { c: Case; locked: boolean; openDialog: OpenCaseDialog }) {
  const { state, dispatch } = useAdminData();
  const toast = useToast();
  const { pending, error, run } = useSubmit();
  const now = useNow();
  const initial: OwnershipReview = c.ownership;
  const [f, setF] = useState<OwnershipReview>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const dirty = !same(f, initial);
  useUnsavedGuard(dirty);
  const residents = [...state.residents].sort((a, b) => a.name.localeCompare(b.name));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (f.status === 'confirmed') {
      if (!f.ownerResidentId) next.owner = 'Choose who the confirmed owner is.';
      if (f.evidence.filter((x) => x !== 'registry').length === 0) next.evidence = 'Pet registration alone is not enough. Select at least one other kind of supporting evidence.';
      if (f.note.trim().length < 10) next.note = 'Record how ownership was established.';
    } else if ((f.status === 'disputed' || f.status === 'unconfirmed') && f.note.trim().length < 10) {
      next.note = 'Record why ownership is contested or unconfirmed.';
    }
    setErrors(next);
    if (Object.keys(next).length) return;
    if (await run(() => dispatch({ type: 'case/saveAssessment', id: c.id, assessment: bare(c.assessment), identity: c.identity, ownership: { ...f, ownerResidentId: f.status === 'confirmed' ? f.ownerResidentId : null, note: f.note.trim() }, alsoSetUrgent: false }))) toast.success('Ownership review saved');
  };

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={submit} noValidate>
        <Lockable locked={locked}>
          <Panel>
            <Block title="Ownership" description="Who, if anyone, is responsible for the animal? Registering a pet is owner-declared and does not prove ownership." action={!locked ? <Button size="sm" type="button" icon={MessageSquare} onClick={() => openDialog({ kind: 'followUp', mode: 'owner' })}>Record owner coordination</Button> : undefined}>
              <FieldGroup label="Ownership status">
                <OptionGroup name="ownership" cols={2} label="Ownership status" value={f.status} onChange={(v: OwnershipStatus) => setF({ ...f, status: v })} options={OWNERSHIP_IDS.map((s) => ({ value: s, label: OWNERSHIP[s].label, description: OWNERSHIP[s].description }))} />
              </FieldGroup>

              {f.status === 'confirmed' ? (
                <div className="mt-5 flex flex-col gap-4">
                  <Field label="Confirmed owner" required error={errors.owner}>
                    <Select value={f.ownerResidentId ?? ''} onChange={(e) => setF({ ...f, ownerResidentId: e.target.value || null })}>
                      <option value="">Choose a resident…</option>
                      {residents.map((r) => <option key={r.id} value={r.id}>{r.name} · {r.unit}</option>)}
                    </Select>
                  </Field>
                  <FieldGroup label="Evidence relied on" required error={errors.evidence} hint="No single kind of evidence establishes ownership on its own.">
                    <div className="flex flex-col gap-2">
                      {OWNERSHIP_EVIDENCE.map((x) => (
                        <Checkbox key={x.id} label={x.label} hint={'weak' in x && x.weak ? 'Owner-declared. Supports a claim but is never enough alone.' : undefined} checked={f.evidence.includes(x.id)} onChange={(e) => setF({ ...f, evidence: e.target.checked ? [...f.evidence, x.id] : f.evidence.filter((y) => y !== x.id) })} />
                      ))}
                    </div>
                  </FieldGroup>
                </div>
              ) : null}

              <Field className="mt-5" label="Verification notes" required={f.status === 'confirmed' || f.status === 'disputed' || f.status === 'unconfirmed'} error={errors.note} hint="Statements recorded, what was compared and why you reached this status."><Textarea rows={3} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
              {f.status === 'disputed' ? <Callout className="mt-4">An owner’s denial is recorded, not assumed to be dishonest, and it does not close the case. Owner warnings stay unavailable until ownership is confirmed.</Callout> : null}
              {error ? <div className="mt-4"><FormError message={error} /></div> : null}
            </Block>
          </Panel>
        </Lockable>
        {!locked ? <SaveBar dirty={dirty} pending={pending} label="Save ownership" onDiscard={() => { setF(initial); setErrors({}); }} /> : null}
      </form>

      {c.claims.length > 0 ? (
        <Panel>
          <Block title="Ownership claims" description="Review each claim against the evidence. Accepting one records ownership as confirmed.">
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {c.claims.map((cl) => (
                <li key={cl.id} className="sa-record">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2"><span className="sa-semibold">{cl.claimantName}</span><Badge tone={CLAIM_STATUS[cl.status].tone}>{CLAIM_STATUS[cl.status].label}</Badge></p>
                      <p className="sa-meta mt-0.5">Submitted {relative(cl.submittedAt, now)}</p>
                    </div>
                    {!locked ? <Button size="sm" onClick={() => openDialog({ kind: 'claim', claimId: cl.id })}>{cl.status === 'accepted' || cl.status === 'rejected' ? 'View decision' : 'Review claim'}</Button> : null}
                  </div>
                  <p className="sa-small sa-text-2 mt-2">“{cl.statement}”</p>
                  <p className="mt-2 flex flex-wrap gap-1.5">{cl.evidence.length ? cl.evidence.map((x) => <Badge key={x}>{x}</Badge>) : <span className="sa-meta">No supporting evidence provided</span>}</p>
                  {cl.reviewNote ? <p className="sa-meta mt-2">Review note: {cl.reviewNote}</p> : null}
                </li>
              ))}
            </ul>
          </Block>
        </Panel>
      ) : null}
      <p className="sa-meta">Current ownership status: <OwnershipBadge status={c.ownership.status} /></p>
    </div>
  );
}

/** A07 Case assessment, with A11 animal and ownership review. */
export default function AssessmentTab({ c, openDialog }: { c: Case; openDialog: OpenCaseDialog }) {
  const locked = c.status === 'closed';
  const domestic = c.animal.type !== 'wildlife';
  return (
    <div className="flex max-w-[880px] flex-col gap-5">
      {locked ? <Callout>This case is closed, so the assessment is read-only. Reopen the case to change it.</Callout> : null}
      {c.priority === 'urgent' && !locked ? <Callout tone="red" title="Urgent safety concern.">Begin safety coordination now. You do not need to identify the animal or confirm ownership first.</Callout> : null}
      <IncidentSection key={JSON.stringify(c.assessment)} c={c} locked={locked} openDialog={openDialog} />
      {domestic ? (
        <>
          <IdentitySection key={JSON.stringify(c.identity)} c={c} locked={locked} />
          <OwnershipSection key={JSON.stringify(c.ownership) + c.claims.map((x) => x.status).join()} c={c} locked={locked} openDialog={openDialog} />
        </>
      ) : <Callout>This is a wild animal, so identity and ownership do not apply. Coordinate with an appropriate wildlife responder under Actions &amp; follow-ups.</Callout>}
    </div>
  );
}
