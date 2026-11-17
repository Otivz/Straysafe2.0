import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Eye } from 'lucide-react';
import { WarningLetterDocument } from '../../components/WarningLetterDocument';
import { adminPath } from '../config';
import { Button } from '../components/Button';
import { Dialog } from '../components/Dialog';
import { Checkbox, Field, FieldGroup, Input, OptionGroup, Select, Textarea } from '../components/form';
import { Callout, FormError, Kv } from '../components/layout';
import { useToast } from '../components/toast';
import { COMPLIANCE_RESULTS, CONTACT_METHODS, CONTACT_OUTCOMES, FOLLOWUP_KINDS, FOLLOWUP_MANUAL_KINDS, WARNING_DELIVERY } from '../data/constants';
import { useAdminData } from '../data/context';
import { residentById } from '../data/selectors';
import type { ComplianceResult, ContactMethod, FollowUpKind, OwnerContact, WarningDelivery } from '../data/types';
import { adminApi, type ApiTemplatePreviewResult, type ApiWarningTemplate } from '../live/api';
import { reportIdOf } from '../../live/refs';
import { errorMessage } from '../../preview/lib/errors';
import { fmtDateTime, fromLocalInput, isValidLocalInput, toLocalInput } from '../../preview/lib/format';
import { useSubmit } from '../lib/useSubmit';
import { FormFooter, type CaseDialogProps } from './BasicDialogs';

const tomorrowNine = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return toLocalInput(d); };

/** What a contact can come to on a missing pet or a found animal (there is no ownership to deny): reached, no answer, or something else. */
const PLAIN_OUTCOMES: OwnerContact['outcome'][] = ['cooperative', 'no_response', 'other'];
const PLAIN_OUTCOME_LABEL: Record<OwnerContact['outcome'], string> = { cooperative: 'Reached them', no_response: 'No answer', other: 'Something else', denied_ownership: 'Denies ownership' };

/** Record follow-up (scheduled or already done) and Record owner coordination share one dialog; only the fields differ. */
export function FollowUpDialog({ c, mode, onClose }: CaseDialogProps & { mode: 'follow_up' | 'owner' }) {
  const { state, dispatch } = useAdminData();
  const toast = useToast();
  const { pending, error, run } = useSubmit();
  const owner = residentById(state, c.ownership.ownerResidentId);
  // On a missing pet or a found animal this is just "a contact": who was reached, how, and what came of it
  const plain = c.category === 'lost_pet' || c.category === 'found_animal';

  // follow-up
  const [kind, setKind] = useState<FollowUpKind>('follow_up');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [when, setWhen] = useState<'later' | 'done'>('later');
  const [due, setDue] = useState(tomorrowNine);
  // owner coordination
  const [method, setMethod] = useState<ContactMethod>('in_person');
  const [withWhom, setWithWhom] = useState(owner ? `${owner.name} (owner)` : '');
  const [at, setAt] = useState(() => toLocalInput(new Date()));
  const [summary, setSummary] = useState('');
  const [outcome, setOutcome] = useState<OwnerContact['outcome']>('cooperative');
  const [nextStep, setNextStep] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const dirty = mode === 'owner' ? summary !== '' || withWhom !== (owner ? `${owner.name} (owner)` : '') : title !== '' || notes !== '';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (mode === 'follow_up') {
      if (title.trim().length < 3) next.title = 'Describe what needs to happen.';
      if (when === 'later' && !isValidLocalInput(due)) next.due = 'Choose a date and time.';
    } else {
      if (!withWhom.trim()) next.withWhom = 'Who did you speak with?';
      if (summary.trim().length < 10) next.summary = 'Summarise what was discussed (at least a sentence).';
      if (!isValidLocalInput(at)) next.at = 'Choose when this happened.';
    }
    setErrors(next);
    if (Object.keys(next).length) return;
    const ok = await run(() => (mode === 'follow_up'
      ? dispatch({ type: 'case/recordFollowUp', id: c.id, kind, title: title.trim(), notes: notes.trim() || undefined, dueAt: when === 'later' ? fromLocalInput(due) : null, doneNow: when === 'done' })
      : dispatch({ type: 'case/recordOwnerContact', id: c.id, at: fromLocalInput(at), method, withWhom: withWhom.trim(), summary: summary.trim(), outcome, nextStepAt: nextStep && isValidLocalInput(nextStep) ? fromLocalInput(nextStep) : null })));
    if (ok) { toast.success(mode === 'owner' ? (plain ? 'Contact recorded' : 'Owner coordination recorded') : when === 'later' ? 'Follow-up scheduled' : 'Follow-up recorded'); onClose(); }
  };

  return (
    <Dialog
      title={mode === 'owner' ? (plain ? 'Record a contact' : 'Record owner coordination') : 'Record follow-up'}
      description={mode === 'owner' ? (plain ? 'Write down who you spoke with, how, and what came of it.' : 'Log a conversation or notice with the person who may be responsible for the animal.') : 'Schedule a check, or record one that already happened.'}
      onClose={onClose} dirty={dirty} onSubmit={submit}
      footer={({ requestClose }) => <FormFooter pending={pending} label={mode === 'owner' ? (plain ? 'Record contact' : 'Record coordination') : when === 'later' ? 'Schedule follow-up' : 'Record follow-up'} requestClose={requestClose} />}
    >
      {mode === 'follow_up' ? (
        <>
          <Field label="Type"><Select value={kind} onChange={(e) => setKind(e.target.value as FollowUpKind)}>{FOLLOWUP_MANUAL_KINDS.map((k) => <option key={k} value={k}>{FOLLOWUP_KINDS[k]}</option>)}</Select></Field>
          <Field label="What needs to happen" required error={errors.title}><Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Ask the guard whether the dog was seen again" /></Field>
          <Field label="Details" optional><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} /></Field>
          <FieldGroup label="When">
            <OptionGroup name="when" label="When" inline value={when} onChange={setWhen} options={[{ value: 'later', label: 'Schedule for later' }, { value: 'done', label: 'Already done' }]} />
          </FieldGroup>
          {when === 'later' ? <Field label="Due" required error={errors.due} hint={isValidLocalInput(due) && new Date(due) < new Date() ? 'That time has passed, so it will show as overdue.' : undefined}><Input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} /></Field> : null}
        </>
      ) : (
        <>
          <div className="sa-grid2">
            <Field label="How"><Select value={method} onChange={(e) => setMethod(e.target.value as ContactMethod)}>{(Object.keys(CONTACT_METHODS) as ContactMethod[]).map((m) => <option key={m} value={m}>{CONTACT_METHODS[m]}</option>)}</Select></Field>
            <Field label="When" required error={errors.at}><Input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} /></Field>
          </div>
          <Field label="Who you spoke with" required error={errors.withWhom} hint="Use the name and relationship, e.g. “Maria Cruz (neighbour)”."><Input value={withWhom} onChange={(e) => setWithWhom(e.target.value)} /></Field>
          <Field label={plain ? 'What came of it' : 'What was discussed'} required error={errors.summary}><Textarea autoFocus value={summary} onChange={(e) => setSummary(e.target.value)} rows={plain ? 3 : 4} /></Field>
          <Field label="Outcome"><Select value={outcome} onChange={(e) => setOutcome(e.target.value as OwnerContact['outcome'])}>{(plain ? PLAIN_OUTCOMES : (Object.keys(CONTACT_OUTCOMES) as OwnerContact['outcome'][])).map((o) => <option key={o} value={o}>{plain ? PLAIN_OUTCOME_LABEL[o] : CONTACT_OUTCOMES[o]}</option>)}</Select></Field>
          {outcome === 'denied_ownership' ? <Callout>A denial is recorded as a <strong>dispute of ownership</strong>. It does not close the case, and it is not treated as dishonesty. Assess the evidence under your established procedure.</Callout> : null}
          <Field label="Next step" optional hint="Creates a follow-up for this date."><Input type="datetime-local" value={nextStep} onChange={(e) => setNextStep(e.target.value)} /></Field>
        </>
      )}
      {error ? <FormError message={error} /> : null}
    </Dialog>
  );
}

/** Mark a pending follow-up done, with an optional note about what happened. */
export function CompleteFollowUpDialog({ c, followUpId, onClose }: CaseDialogProps & { followUpId: string }) {
  const { dispatch } = useAdminData();
  const toast = useToast();
  const { pending, error, run } = useSubmit();
  const [note, setNote] = useState('');
  const f = c.followUps.find((x) => x.id === followUpId);
  if (!f) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (await run(() => dispatch({ type: 'case/completeFollowUp', id: c.id, followUpId, note: note.trim() || undefined }))) { toast.success('Follow-up marked as done'); onClose(); }
  };

  return (
    <Dialog size="sm" title="Mark follow-up as done" description={f.title} onClose={onClose} dirty={note !== ''} onSubmit={submit} footer={({ requestClose }) => <FormFooter pending={pending} label="Mark as done" requestClose={requestClose} />}>
      <Field label="What happened" optional><Textarea autoFocus value={note} onChange={(e) => setNote(e.target.value)} rows={3} /></Field>
      {error ? <FormError message={error} /> : null}
    </Dialog>
  );
}

const DAY = 86_400_000;

/**
 * Issue an applicable warning (A09). It needs a confirmed owner, a confirmed policy and details that support it.
 * The observation period comes from the policy. No universal period is assumed and no fine is ever assessed.
 */
const WARNING_LEVELS = ['Notice', '1st Warning', '2nd Warning', 'Final Notice / Escalation'] as const;

export function WarningDialog({ c, onClose }: CaseDialogProps) {
  const { state, dispatch, capabilities } = useAdminData();
  const terms = capabilities.warningTerms;
  const toast = useToast();
  const { pending, error, run } = useSubmit();
  const owner = residentById(state, c.ownership.ownerResidentId);
  const policies = state.settings.policies.filter((p) => p.appliesTo.includes(c.category));

  const [policyId, setPolicyId] = useState(policies.find((p) => p.status === 'confirmed')?.id ?? '');
  const [warningLevel, setWarningLevel] = useState<string>('1st Warning');
  const [templates, setTemplates] = useState<ApiWarningTemplate[]>([]);
  const [templateId, setTemplateId] = useState<string>('');
  const [details, setDetails] = useState('');
  const [requiredAction, setRequiredAction] = useState('Keep your pet secured and supervised in accordance with subdivision rules.');
  const [delivery, setDelivery] = useState<WarningDelivery>('written');
  const [established, setEstablished] = useState(false);
  const [days, setDays] = useState('');
  const [noPeriod, setNoPeriod] = useState(false);
  const [start, setStart] = useState(() => toLocalInput(new Date()));
  const [followOverride, setFollowOverride] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Step 2: letter preview & missing field completion
  const [step, setStep] = useState<'form' | 'preview'>('form');
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<ApiTemplatePreviewResult | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  const policy = policies.find((p) => p.id === policyId);
  const observationDays = policy ? (policy.observationDays ?? (terms && !noPeriod ? Number(days) || null : null)) : null;
  const endLocal = observationDays && isValidLocalInput(start) ? toLocalInput(new Date(new Date(start).getTime() + observationDays * DAY)) : '';
  const followLocal = followOverride || endLocal;

  useEffect(() => {
    let live = true;
    adminApi.warningTemplates('active').then((res) => {
      if (!live) return;
      setTemplates(res.items);
      const def = res.items.find((t) => t.is_default && t.warning_level === warningLevel)
        || res.items.find((t) => t.is_default && !t.warning_level)
        || res.items[0];
      if (def) setTemplateId(String(def.template_id));
    }).catch(() => undefined);
    const rid = reportIdOf(c.id);
    if (rid && owner) {
      const viol = c.category === 'nuisance' || c.category === 'safety' ? 'Nuisance / Aggressive Behavior' : 'Other';
      adminApi.warningSuggestion({ violation_type: viol, report_id: rid, owner_id: Number(owner.id), policy_id: policyId || (policies[0]?.id ?? '') })
        .then((s) => {
          if (!live) return;
          if (s.suggested_tier) setWarningLevel(s.suggested_tier);
          if (s.instructions) setRequiredAction(s.instructions);
        })
        .catch(() => undefined);
    }
    return () => { live = false; };
  }, [c.id, c.category]); // eslint-disable-line react-hooks/exhaustive-deps

  const validateForm = () => {
    const next: Record<string, string> = {};
    if (!policy || policy.status !== 'confirmed') next.policy = 'Choose a confirmed policy that applies.';
    if (details.trim().length < 20) next.details = 'Describe the violation (at least 20 characters).';
    if (requiredAction.trim().length < 5) next.requiredAction = 'Specify the required corrective action.';
    if (!established) next.established = 'Confirm that the violation is sufficiently established.';
    if (terms && policy && policy.observationDays === null && !noPeriod && !(Number(days) >= 1 && Number(days) <= 60)) next.days = 'Enter a period from 1 to 60 days, or tick “No observation period”.';
    if (terms && !isValidLocalInput(start)) next.start = 'Choose when the warning starts.';
    setErrors(next);
    return Object.keys(next).length === 0 && !!policy;
  };

  const loadPreview = async (nextOverrides: Record<string, string> = overrides) => {
    if (!validateForm() || !policy) return;
    setPreviewing(true);
    try {
      const rid = reportIdOf(c.id);
      const res = await adminApi.previewWarningTemplate({
        ...(templateId ? { template_id: Number(templateId) } : {}),
        ...(rid ? { report_id: rid } : {}),
        ...(owner ? { user_id: Number(owner.id) } : {}),
        warning_level: warningLevel,
        violation_description: details.trim(),
        required_action: requiredAction.trim(),
        policy_id: policy.id,
        policy_reference: `${policy.reference} — ${policy.title}`,
        field_overrides: nextOverrides,
      });
      setPreview(res);
      setStep('preview');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setPreviewing(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (step === 'form') {
      await loadPreview();
      return;
    }
    if (!validateForm() || !policy) return;
    const ok = await run(() => dispatch({
      type: 'case/issueWarning',
      id: c.id,
      policyId: policy.id,
      details: details.trim(),
      delivery,
      observationDays,
      observationStart: observationDays ? fromLocalInput(start) : null,
      followUpAt: followLocal && isValidLocalInput(followLocal) ? fromLocalInput(followLocal) : null,
      warningLevel,
      templateId: templateId ? Number(templateId) : undefined,
      requiredAction: requiredAction.trim(),
      fieldOverrides: overrides,
    }));
    if (ok) { toast.success(`Warning letter issued and resident notified under ${policy.reference}`); onClose(); }
  };

  return (
    <Dialog
      size="lg"
      title={step === 'preview' ? 'Preview & confirm warning letter' : 'Issue a warning'}
      description={step === 'preview' ? 'Review the populated warning letter before issuing it to the resident.' : 'Select the warning level, policy, and letter template.'}
      onClose={onClose}
      dirty={details !== '' || established}
      onSubmit={submit}
      footer={({ requestClose }) => (
        step === 'preview' ? (
          <div className="flex w-full items-center justify-between gap-2">
            <Button type="button" onClick={() => setStep('form')} disabled={pending}>← Back to edit</Button>
            <div className="flex gap-2">
              <Button type="button" onClick={requestClose} disabled={pending}>Cancel</Button>
              <Button type="submit" variant="primary" loading={pending} disabled={!!preview && !preview.can_issue}>
                Confirm & issue warning
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex w-full items-center justify-end gap-2">
            <Button type="button" onClick={requestClose} disabled={previewing}>Cancel</Button>
            <Button type="submit" variant="primary" icon={Eye} loading={previewing}>Preview letter →</Button>
          </div>
        )
      )}
    >
      {c.priority === 'urgent' ? <Callout tone="red" title="This is an urgent case.">Coordinate safety first. A routine warning and observation period must not delay that response.</Callout> : null}

      {step === 'form' ? (
        <>
          <Kv rows={[['Confirmed owner', owner ? <span><strong>{owner.name}</strong> · {owner.unit}</span> : 'Not recorded'], ['Concern', c.title]]} />
          <div className="sa-grid2">
            <Field label="Warning level" required>
              <Select value={warningLevel} onChange={(e) => setWarningLevel(e.target.value)}>
                {WARNING_LEVELS.map((lvl) => <option key={lvl} value={lvl}>{lvl}</option>)}
              </Select>
            </Field>
            <Field label="Warning letter template" hint={<Link to={adminPath('/warning-templates')} onClick={onClose}>Manage templates</Link>}>
              <Select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                {templates.length === 0 ? <option value="">Default subdivision template</option> : null}
                {templates.map((t) => (
                  <option key={t.template_id} value={String(t.template_id)}>
                    {t.name} (v{t.current_version_number}){t.is_default ? ' · Default' : ''}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Applicable policy" required error={errors.policy}>
            <Select value={policyId} onChange={(e) => setPolicyId(e.target.value)}>
              {policies.map((p) => <option key={p.id} value={p.id} disabled={p.status !== 'confirmed'}>{p.reference} — {p.title}{p.status !== 'confirmed' ? ' (awaiting confirmation)' : ''}</option>)}
            </Select>
          </Field>
          {policy ? <p className="sa-small sa-text-2">{policy.summary}</p> : null}
          <Field label="Violation description" required error={errors.details} hint="Factual description of what occurred (populates {{violation_description}})."><Textarea autoFocus value={details} onChange={(e) => setDetails(e.target.value)} rows={3} /></Field>
          <Field label="Required corrective action" required error={errors.requiredAction} hint="What the resident must do (populates {{required_action}})."><Textarea value={requiredAction} onChange={(e) => setRequiredAction(e.target.value)} rows={2} /></Field>
          {terms ? (
            <div className="sa-grid2">
              <Field label="How it is delivered"><Select value={delivery} onChange={(e) => setDelivery(e.target.value as WarningDelivery)}>{(Object.keys(WARNING_DELIVERY) as WarningDelivery[]).map((d) => <option key={d} value={d}>{WARNING_DELIVERY[d]}</option>)}</Select></Field>
              <Field label="Warning starts" required error={errors.start}><Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
            </div>
          ) : <p className="sa-small sa-text-2">Issuing generates an immutable warning letter, sends an in-app + push + email notification to the resident, and starts any policy observation period.</p>}

          <FieldGroup label="Observation period" hint={policy?.observationDays != null ? `Set by ${policy.reference}.` : 'This policy does not define one, so none is assumed.'} error={errors.days}>
            {policy?.observationDays != null ? (
              <p className="sa-semibold">{policy.observationDays} {policy.observationDays === 1 ? 'day' : 'days'}{endLocal && terms ? <span className="sa-text-2" style={{ fontWeight: 400 }}> · ends {fmtDateTime(fromLocalInput(endLocal))}</span> : null}</p>
            ) : terms ? (
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2"><Input type="number" min={1} max={60} className="!w-24" aria-label="Days" disabled={noPeriod} value={days} onChange={(e) => setDays(e.target.value)} /><span className="sa-small">days</span></div>
                <Checkbox label="No observation period" checked={noPeriod} onChange={(e) => setNoPeriod(e.target.checked)} />
              </div>
            ) : <p className="sa-semibold">None</p>}
          </FieldGroup>
          {terms && observationDays ? <Field label="Follow-up check" hint="Defaults to the end of the observation period."><Input type="datetime-local" value={followLocal} onChange={(e) => setFollowOverride(e.target.value)} /></Field> : null}

          <Checkbox label="The violation is sufficiently established and the owner has been appropriately identified." checked={established} onChange={(e) => setEstablished(e.target.checked)} />
          {errors.established ? <p className="sa-error" role="alert">{errors.established}</p> : null}
        </>
      ) : (
        <div className="flex flex-col gap-3">
          {preview && preview.missing_fields.length > 0 ? (
            <Callout tone="amber" title="Missing information for template placeholders">
              <p className="sa-small mb-2">Fill in any missing fields below and click <strong>Refresh preview</strong> before issuing:</p>
              <div className="flex flex-col gap-2">
                {preview.missing_fields.map((m) => (
                  <div key={m.key} className="flex flex-wrap items-center gap-2">
                    <label className="sa-small font-medium w-40">{m.label}{m.required ? ' *' : ''}</label>
                    <Input
                      className="flex-1"
                      value={overrides[m.key] ?? ''}
                      onChange={(e) => setOverrides((prev) => ({ ...prev, [m.key]: e.target.value }))}
                      placeholder={`Enter ${m.label.toLowerCase()}`}
                    />
                  </div>
                ))}
                <div>
                  <Button type="button" size="sm" loading={previewing} onClick={() => void loadPreview(overrides)}>Refresh preview</Button>
                </div>
              </div>
            </Callout>
          ) : null}
          {preview ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-[var(--sa-ink-3)]">
                <strong>Template:</strong> {preview.template?.name ?? 'Default'} (v{preview.template?.version_number ?? 1})
              </p>
              <WarningLetterDocument
                subdivisionName={preview.placeholders?.subdivision_name}
                subdivisionAddress={preview.placeholders?.subdivision_address}
                subdivisionPhone={preview.placeholders?.subdivision_phone}
                subdivisionEmail={preview.placeholders?.subdivision_email}
                warningLevel={preview.placeholders?.warning_level || warningLevel}
                warningReference={preview.placeholders?.warning_reference || 'WARN-PREVIEW'}
                caseReference={preview.placeholders?.case_reference || c.id}
                issueDate={preview.placeholders?.issue_date || '—'}
                recipientName={preview.placeholders?.resident_name || owner?.name || ''}
                recipientAddress={preview.placeholders?.resident_address || owner?.unit}
                subject={preview.subject}
                body={preview.body}
                issuerName={preview.placeholders?.issuer_name || preview.placeholders?.issued_by || 'Subdivision Leader'}
                issuerRole={preview.placeholders?.issuer_role}
              />
            </div>
          ) : null}
        </div>
      )}
      {error ? <FormError message={error} /> : null}
    </Dialog>
  );
}

const RESULT_HELP: Record<ComplianceResult, string> = {
  compliant: 'The owner is following the warning.',
  partial: 'Some requirements were followed and some were not.',
  non_compliant: 'The behaviour continued after the warning.',
  unable_to_observe: 'It could not be checked, or the animal was not seen.',
};

/** Record a compliance observation (A09), optionally concluding the observation with the outcome. */
export function ComplianceDialog({ c, onClose }: CaseDialogProps) {
  const { dispatch } = useAdminData();
  const toast = useToast();
  const { pending, error, run } = useSubmit();
  const active = c.warnings.filter((w) => w.status === 'active');
  const [warningId, setWarningId] = useState(active[0]?.id ?? '');
  const [at, setAt] = useState(() => toLocalInput(new Date()));
  const [result, setResult] = useState<ComplianceResult>('compliant');
  const [notes, setNotes] = useState('');
  const [conclude, setConclude] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const canConclude = result === 'compliant' || result === 'non_compliant';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (notes.trim().length < 5) next.notes = 'Say what you observed.';
    if (!isValidLocalInput(at)) next.at = 'Choose when you observed it.';
    setErrors(next);
    if (Object.keys(next).length || !warningId) return;
    const ok = await run(() => dispatch({ type: 'case/recordCompliance', id: c.id, warningId, observedAt: fromLocalInput(at), result, notes: notes.trim(), conclude: conclude && canConclude ? (result as 'compliant' | 'non_compliant') : null }));
    if (ok) { toast.success(conclude && canConclude ? 'Observation concluded' : 'Compliance observation recorded'); onClose(); }
  };

  return (
    <Dialog title="Record compliance observation" description="What did you see, and when?" onClose={onClose} dirty={notes !== ''} onSubmit={submit} footer={({ requestClose }) => <FormFooter pending={pending} label="Record observation" requestClose={requestClose} />}>
      {active.length > 1 ? <Field label="Warning"><Select value={warningId} onChange={(e) => setWarningId(e.target.value)}>{active.map((w) => <option key={w.id} value={w.id}>{w.policyRef} · {w.ownerName}</option>)}</Select></Field> : null}
      <Field label="Observed" required error={errors.at}><Input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} /></Field>
      <FieldGroup label="Result">
        <OptionGroup name="result" label="Result" value={result} onChange={setResult} options={(Object.keys(COMPLIANCE_RESULTS) as ComplianceResult[]).map((r) => ({ value: r, label: COMPLIANCE_RESULTS[r].label, description: RESULT_HELP[r] }))} />
      </FieldGroup>
      <Field label="Notes" required error={errors.notes}><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} /></Field>
      {canConclude ? <Checkbox label="End the observation with this outcome" hint="Marks the warning as concluded and completes the end-of-observation follow-up." checked={conclude} onChange={(e) => setConclude(e.target.checked)} /> : null}
      {result === 'non_compliant' ? <Callout tone="amber" title="Follow your confirmed procedure.">No fine is assessed by the subdivision. If the procedure refers repeated violations to the barangay, record that under External coordination.</Callout> : null}
      {error ? <FormError message={error} /> : null}
    </Dialog>
  );
}
