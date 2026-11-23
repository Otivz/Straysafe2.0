import { useState, type Dispatch, type FormEvent, type ReactNode, type SetStateAction } from 'react';
import { AlertTriangle, CheckCheck, ChevronDown, ClipboardCheck, Eye, Flag, Images, MessageSquare, NotebookPen, PawPrint, ShieldAlert, Stethoscope } from 'lucide-react';
import { Badge, IdentityBadge, OwnershipBadge, PriorityMark } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Checkbox, Field, FieldGroup, OptionGroup, Select, Textarea } from '../../components/form';
import { ResidentCombobox } from '../../components/ResidentCombobox';
import { Block, Callout, FormError, Panel } from '../../components/layout';
import { SaveBar } from '../../components/SaveBar';
import { useToast } from '../../components/toast';
import { ANIMAL_TYPES, CLAIM_STATUS, IDENTITY, OWNERSHIP, OWNERSHIP_EVIDENCE, OWNERSHIP_IDS, PRIORITIES, SIZE_LABEL, URGENCY, VERIFICATION } from '../../data/constants';
import { useAdminData } from '../../data/context';
import { registryMatches, residentById } from '../../data/selectors';
import type { Assessment, Case, DangerousAssessment, EvidenceSufficiency, IdentityReview, IdentityStatus, IncidentVerification, InjuredAssessment, MatchDecision, OwnershipReview, OwnershipStatus, UrgencyLevel } from '../../data/types';
import { fmtDateTime, plural, relative } from '../../../preview/lib/format';
import { useNow } from '../../../preview/lib/hooks';
import { useUnsavedGuard } from '../../lib/navGuard';
import { useSubmit } from '../../lib/useSubmit';
import { useMediaViewer, type LightboxMediaItem } from '../../components/MediaLightbox';
import type { OpenCaseDialog } from './dialogState';

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The assessment fields without the save stamp (who and when come from the saved record). */
const bare = (a: Assessment): Omit<Assessment, 'savedAt' | 'savedBy'> => ({
  incident: a.incident, incidentBasis: a.incidentBasis, evidenceSufficiency: a.evidenceSufficiency, evidenceReviewed: a.evidenceReviewed,
  urgency: a.urgency, urgencyNote: a.urgencyNote, notes: a.notes,
});

/** A form that is read-only once the case is closed. */
const Lockable = ({ locked, children }: { locked: boolean; children: ReactNode }) => <fieldset disabled={locked} className="m-0 min-w-0 border-0 p-0">{children}</fieldset>;

// ------------------------------------------------------------------------------------------------ incident review
interface IncidentForm {
  incident: IncidentVerification;
  basis: string;
  reviewed: string[];
  sufficiency: EvidenceSufficiency;
  urgency: UrgencyLevel;
  urgencyNote: string;
  notes: string;
  injuredAssessment: InjuredAssessment;
  dangerousAssessment: DangerousAssessment;
}
const emptyInjuredAssessment = (): InjuredAssessment => ({
  injurySeverity: '', bleeding: '', illnessSigns: '', weakness: '', mobility: '', trapped: '', neglectSuspected: '',
});
const emptyDangerousAssessment = (): DangerousAssessment => ({
  aggressiveSeverity: '', attackOrBiteOccurred: '', peopleThreatened: '', animalsThreatened: '',
  stillInArea: '', threatOngoing: '', rabiesSignsReported: '', securityRequired: '',
});

const INJURED_SUMMARY_MAP: Record<string, keyof InjuredAssessment> = {
  'injury severity': 'injurySeverity',
  'bleeding': 'bleeding',
  'signs of illness': 'illnessSigns',
  'physical weakness': 'weakness',
  'mobility condition': 'mobility',
  'trapped / stuck': 'trapped',
  'neglect / abandonment': 'neglectSuspected',
};

const DANGEROUS_SUMMARY_MAP: Record<string, keyof DangerousAssessment> = {
  'aggressive severity': 'aggressiveSeverity',
  'attack/bite occurred': 'attackOrBiteOccurred',
  'people threatened': 'peopleThreatened',
  'animals threatened': 'animalsThreatened',
  'still in area': 'stillInArea',
  'threat ongoing': 'threatOngoing',
  'suspected rabies signs': 'rabiesSignsReported',
  'security assistance required': 'securityRequired',
};

function parseSavedInjuredAssessment(c: Case): InjuredAssessment {
  const out = emptyInjuredAssessment();
  const events = [...c.timeline].sort((a, b) => b.at.localeCompare(a.at));
  for (const ev of events) {
    const text = `${ev.title}\n${ev.detail ?? ''}`;
    const line = text.split('\n').find((l) => /^Condition assessment:\s*/i.test(l.trim()));
    if (!line) continue;
    const body = line.replace(/^Condition assessment:\s*/i, '').trim();
    for (const part of body.split(';')) {
      const idx = part.indexOf(':');
      if (idx === -1) continue;
      const key = part.slice(0, idx).trim().toLowerCase();
      const val = part.slice(idx + 1).trim();
      const field = INJURED_SUMMARY_MAP[key];
      if (field && val) out[field] = val;
    }
    break;
  }
  return out;
}

function parseSavedDangerousAssessment(c: Case): DangerousAssessment {
  const out = emptyDangerousAssessment();
  const events = [...c.timeline].sort((a, b) => b.at.localeCompare(a.at));
  for (const ev of events) {
    const text = `${ev.title}\n${ev.detail ?? ''}`;
    const line = text.split('\n').find((l) => /^Safety risk assessment:\s*/i.test(l.trim()));
    if (!line) continue;
    const body = line.replace(/^Safety risk assessment:\s*/i, '').trim();
    for (const part of body.split(';')) {
      const idx = part.indexOf(':');
      if (idx === -1) continue;
      const key = part.slice(0, idx).trim().toLowerCase();
      const val = part.slice(idx + 1).trim();
      const field = DANGEROUS_SUMMARY_MAP[key];
      if (field && val) out[field] = val;
    }
    break;
  }
  return out;
}

const incidentInit = (c: Case): IncidentForm => {
  const a = c.assessment;
  return {
    incident: a.incident, basis: a.incidentBasis, reviewed: a.evidenceReviewed, sufficiency: a.evidenceSufficiency,
    urgency: a.urgency, urgencyNote: a.urgencyNote, notes: a.notes,
    injuredAssessment: parseSavedInjuredAssessment(c), dangerousAssessment: parseSavedDangerousAssessment(c),
  };
};

const INCIDENT_VERIFICATION_OPTIONS: IncidentVerification[] = [
  'not_reviewed',
  'verified',
  'partial',
  'invalid',
];

const EVIDENCE_SUFFICIENCY_OPTIONS: { value: EvidenceSufficiency; label: string }[] = [
  { value: 'sufficient', label: 'Enough' },
  { value: 'needs_more', label: 'Need more' },
  { value: 'not_assessed', label: 'None' },
];

function parseConditionFacts(raw: string | null | undefined): Array<{ label: string; value: string }> {
  if (!raw) return [];
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const idx = line.indexOf(':');
      if (idx === -1) return { label: 'Detail', value: line };
      return {
        label: line.slice(0, idx).replace(/\?$/, '').trim(),
        value: line.slice(idx + 1).trim(),
      };
    })
    .filter((item) => Boolean(item.value));
}

function ConditionContextCard({
  title,
  description,
  icon: Icon,
  isAutoUrgent,
  autoUrgentTone,
  autoUrgentTitle,
  autoUrgentBody,
  conditionText,
  emptyLabel,
}: {
  title: string;
  description: string;
  icon: typeof ShieldAlert;
  isAutoUrgent: boolean;
  autoUrgentTone: 'red' | 'amber';
  autoUrgentTitle: string;
  autoUrgentBody: string;
  conditionText: string | null | undefined;
  emptyLabel: string;
}) {
  const facts = parseConditionFacts(conditionText);
  return (
    <Panel className="sa-fade-up border-[#e7e2da] shadow-xs" >
      <Block
        title={
          <span className="flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#f5f0e8] text-[#78716c]">
              <Icon size={15} aria-hidden="true" />
            </span>
            <span>{title}</span>
          </span>
        }
        description={description}
      >
        {isAutoUrgent ? (
          <Callout className="mb-4" tone={autoUrgentTone} title={autoUrgentTitle}>
            {autoUrgentBody}
          </Callout>
        ) : null}
        {facts.length > 0 ? (
          <dl
            className={`m-0 grid grid-cols-1 gap-2.5 ${facts.length === 1
              ? ''
              : facts.length === 3
                ? 'sm:grid-cols-3'
                : 'sm:grid-cols-2'
              }`}
          >
            {facts.map((item, idx) => (
              <div
                key={`${item.label}-${idx}`}
                className="rounded-xl border border-[#e7e2da] bg-gradient-to-b from-white to-[#fcfaf6] px-3.5 py-2.5 shadow-xs transition-colors hover:border-[#d6cfc7]"
              >
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--sa-ink-3)]">
                  {item.label}
                </dt>
                <dd className="m-0 mt-0.5 text-sm font-medium text-[var(--sa-ink)]">
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="sa-small sa-text-3 m-0">{emptyLabel}</p>
        )}
      </Block>
    </Panel>
  );
}

function IncidentSection({
  c,
  locked,
  openDialog,
  f,
  setF,
  checklistOpen,
  setChecklistOpen,
  evidencePickerOpen,
  setEvidencePickerOpen,
  urgencyNoteOpen,
  setUrgencyNoteOpen,
  errors,
}: {
  c: Case;
  locked: boolean;
  openDialog: OpenCaseDialog;
  f: IncidentForm;
  setF: Dispatch<SetStateAction<IncidentForm>>;
  checklistOpen: boolean;
  setChecklistOpen: Dispatch<SetStateAction<boolean>>;
  evidencePickerOpen: boolean;
  setEvidencePickerOpen: Dispatch<SetStateAction<boolean>>;
  urgencyNoteOpen: boolean;
  setUrgencyNoteOpen: Dispatch<SetStateAction<boolean>>;
  errors: Record<string, string>;
}) {
  const { openMedia } = useMediaViewer();
  const set = (patch: Partial<IncidentForm>) => setF((p) => ({ ...p, ...patch }));
  const setInjured = (patch: Partial<InjuredAssessment>) => setF((p) => ({ ...p, injuredAssessment: { ...p.injuredAssessment, ...patch } }));
  const setDangerous = (patch: Partial<DangerousAssessment>) => setF((p) => ({ ...p, dangerousAssessment: { ...p.dangerousAssessment, ...patch } }));
  const isInjured = c.category === 'injured';
  const isSafety = c.category === 'safety';
  const isAutoUrgent = (isInjured && c.priority === 'urgent' && (/unable to move/i.test(c.assessment.urgencyNote) || /Can the animal move\?:\s*No/i.test(c.animal.condition ?? '')))
    || (isSafety && /Automatic safety priority/i.test(c.assessment.urgencyNote));

  const evidenceMediaItems: LightboxMediaItem[] = c.evidence
    .filter((e) => Boolean(e.url))
    .map((e) => ({
      url: e.url!,
      kind: e.kind,
      title: e.label,
      source: { reporter: 'Submitted by the reporter', admin: 'Added by an administrator', resident: 'Another resident', external: 'External authority' }[e.source],
      date: fmtDateTime(e.capturedAt),
      caption: e.note,
    }));

  return (
    <Lockable locked={locked}>
      <div className="flex flex-col gap-5">
        {isInjured ? (
          <ConditionContextCard
            title="Reported animal condition & mobility"
            description="Recorded by the reporting resident at submission."
            icon={Stethoscope}
            isAutoUrgent={isAutoUrgent}
            autoUrgentTone="red"
            autoUrgentTitle="Automatically flagged as URGENT"
            autoUrgentBody="This injured/sick animal report was automatically prioritized as Urgent because the resident reported the animal is unable to move."
            conditionText={c.animal.condition}
            emptyLabel="No structured condition details recorded."
          />
        ) : null}

        {isSafety ? (
          <ConditionContextCard
            title="Reported dangerous behavior & threat context"
            description="Recorded by the reporting resident at submission."
            icon={ShieldAlert}
            isAutoUrgent={isAutoUrgent}
            autoUrgentTone={c.priority === 'urgent' ? 'red' : 'amber'}
            autoUrgentTitle={`Automatically prioritized (${c.priority.toUpperCase()})`}
            autoUrgentBody={c.assessment.urgencyNote}
            conditionText={c.animal.condition}
            emptyLabel="No structured behavior details recorded."
          />
        ) : null}

        <Panel className="sa-fade-up border-[#e7e2da] shadow-xs" >
          <div style={{ animationDelay: '60ms' }}>
            <Block
              title={
                <span className="flex items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#fff7ed] text-[#b45309]">
                    <ClipboardCheck size={15} aria-hidden="true" />
                  </span>
                  <span>Incident review</span>
                </span>
              }
              description="Did the reported incident occur? This is separate from which animal was involved and who is responsible for it."
            >
              <Field label="Verification" hint={VERIFICATION[f.incident]?.description}>
                <Select
                  value={f.incident}
                  onChange={(e) => set({ incident: e.target.value as IncidentVerification })}
                >
                  {f.incident === 'unverified' ? (
                    <option value="unverified" disabled>
                      {VERIFICATION.unverified.label} (legacy)
                    </option>
                  ) : null}
                  {INCIDENT_VERIFICATION_OPTIONS.map((v) => (
                    <option key={v} value={v}>
                      {VERIFICATION[v].label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field className="mt-4" label="What the decision is based on" required={f.incident !== 'not_reviewed'} error={errors.basis}><Textarea rows={2} value={f.basis} onChange={(e) => set({ basis: e.target.value })} placeholder="e.g. The guard also saw the dog on Tuesday evening." /></Field>
            </Block>

            {(isInjured || isSafety) ? (() => {
              const checklistValues = isInjured
                ? [
                  f.injuredAssessment.injurySeverity,
                  f.injuredAssessment.bleeding,
                  f.injuredAssessment.mobility,
                  f.injuredAssessment.trapped,
                ]
                : [
                  f.dangerousAssessment.aggressiveSeverity,
                  f.dangerousAssessment.attackOrBiteOccurred,
                  f.dangerousAssessment.rabiesSignsReported,
                  f.dangerousAssessment.securityRequired,
                ];
              const totalChecklistCount = checklistValues.length;
              const answeredChecklistCount = checklistValues.filter((v) => Boolean(v && v.trim())).length;
              return (
                <Block>
                  <button
                    type="button"
                    aria-expanded={checklistOpen}
                    onClick={() => setChecklistOpen((o) => !o)}
                    className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg border border-[var(--sa-line)] bg-[var(--sa-sand)]/55 px-3.5 py-2.5 text-left transition-colors hover:bg-[var(--sa-sand)]"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="sa-h2 m-0 text-sm">Detailed Checklist (Optional)</span>
                        <Badge tone={answeredChecklistCount > 0 ? 'brand' : 'neutral'}>
                          {answeredChecklistCount} of {totalChecklistCount} answered
                        </Badge>
                      </div>
                      <p className="sa-small sa-text-3 m-0 mt-0.5">
                        {isInjured
                          ? 'Record your clinical and physical condition findings based on site checks and evidence.'
                          : 'Assess the safety threat to residents and animals based on verification and site checks.'}
                      </p>
                    </div>
                    <ChevronDown
                      size={18}
                      aria-hidden="true"
                      className={`shrink-0 text-[var(--sa-ink-2)] transition-transform duration-200 ${checklistOpen ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {checklistOpen && isInjured ? (
                    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Field label="Visible injury severity" optional>
                        <Select value={f.injuredAssessment.injurySeverity ?? ''} onChange={(e) => setInjured({ injurySeverity: e.target.value })}>
                          <option value="">Not assessed</option>
                          <option value="None">None</option>
                          <option value="Minor">Minor</option>
                          <option value="Moderate">Moderate</option>
                          <option value="Severe">Severe</option>
                        </Select>
                      </Field>
                      <Field label="Presence of bleeding" optional>
                        <Select value={f.injuredAssessment.bleeding ?? ''} onChange={(e) => setInjured({ bleeding: e.target.value })}>
                          <option value="">Not assessed</option>
                          <option value="None">None</option>
                          <option value="Minor bleeding">Minor bleeding</option>
                          <option value="Active / heavy bleeding">Active / heavy bleeding</option>
                          <option value="Not observed">Not observed</option>
                        </Select>
                      </Field>
                      <Field label="Mobility condition" optional>
                        <Select value={f.injuredAssessment.mobility ?? ''} onChange={(e) => setInjured({ mobility: e.target.value })}>
                          <option value="">Not assessed</option>
                          <option value="Mobile">Mobile</option>
                          <option value="Limited mobility">Limited mobility</option>
                          <option value="Unable to move">Unable to move</option>
                          <option value="Unknown">Unknown</option>
                        </Select>
                      </Field>
                      <Field label="Trapped or stuck" optional>
                        <Select value={f.injuredAssessment.trapped ?? ''} onChange={(e) => setInjured({ trapped: e.target.value })}>
                          <option value="">Not assessed</option>
                          <option value="No">No</option>
                          <option value="Yes">Yes</option>
                        </Select>
                      </Field>
                    </div>
                  ) : null}

                  {checklistOpen && isSafety ? (
                    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Field label="Aggressive behavior severity" optional>
                        <Select value={f.dangerousAssessment.aggressiveSeverity ?? ''} onChange={(e) => setDangerous({ aggressiveSeverity: e.target.value })}>
                          <option value="">Not assessed</option>
                          <option value="Low / calm">Low / calm</option>
                          <option value="Moderate / threatening">Moderate / threatening</option>
                          <option value="Severe / attacking">Severe / attacking</option>
                        </Select>
                      </Field>
                      <Field label="Attack or bite occurred?" optional>
                        <Select value={f.dangerousAssessment.attackOrBiteOccurred ?? ''} onChange={(e) => setDangerous({ attackOrBiteOccurred: e.target.value })}>
                          <option value="">Not assessed</option>
                          <option value="Yes — confirmed">Yes — confirmed</option>
                          <option value="Attempted only">Attempted only</option>
                          <option value="No">No</option>
                          <option value="Unverified">Unverified</option>
                        </Select>
                      </Field>
                      <Field label="Suspected rabies warning signs reported?" optional>
                        <Select value={f.dangerousAssessment.rabiesSignsReported ?? ''} onChange={(e) => setDangerous({ rabiesSignsReported: e.target.value })}>
                          <option value="">Not assessed</option>
                          <option value="Yes — refer to vet/health authority">Yes — refer to vet/health authority</option>
                          <option value="No">No</option>
                        </Select>
                      </Field>
                      <Field label="Immediate security assistance required?" optional>
                        <Select value={f.dangerousAssessment.securityRequired ?? ''} onChange={(e) => setDangerous({ securityRequired: e.target.value })}>
                          <option value="">Not assessed</option>
                          <option value="Yes — urgent guardhouse dispatch">Yes — urgent guardhouse dispatch</option>
                          <option value="Monitoring only">Monitoring only</option>
                          <option value="No">No</option>
                        </Select>
                      </Field>
                    </div>
                  ) : null}
                </Block>
              );
            })() : null}

            <Block
              title={
                <span className="flex items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#f5f0e8] text-[#57534e]">
                    <Images size={15} aria-hidden="true" />
                  </span>
                  <span>Evidence review</span>
                </span>
              }
              description={c.evidence.length ? 'Mark what you have looked at, then say whether it is enough to act on.' : 'Evidence is optional. A report can be assessed from its description alone.'}
            >
              {c.evidence.length > 0 ? (() => {
                const allEvidenceIds = c.evidence.map((ev) => ev.id);
                const reviewedCount = c.evidence.filter((ev) => f.reviewed.includes(ev.id)).length;
                const allReviewed = reviewedCount === c.evidence.length;
                return (
                  <div className="mb-4 flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={allReviewed ? 'sage' : reviewedCount > 0 ? 'brand' : 'neutral'}>
                          {reviewedCount} of {c.evidence.length} reviewed
                        </Badge>
                        <Button
                          size="sm"
                          type="button"
                          variant="secondary"
                          icon={CheckCheck}
                          disabled={locked || allReviewed}
                          onClick={() => set({ reviewed: Array.from(new Set([...f.reviewed, ...allEvidenceIds])) })}
                        >
                          Mark All as Reviewed
                        </Button>
                      </div>
                      <button
                        type="button"
                        aria-expanded={evidencePickerOpen}
                        onClick={() => setEvidencePickerOpen((o) => !o)}
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--sa-line)] bg-[var(--sa-sand)]/55 px-3 py-1.5 text-xs font-semibold text-[var(--sa-ink)] transition-colors hover:bg-[var(--sa-sand)]"
                      >
                        <span>Choose Photos One by One</span>
                        <ChevronDown
                          size={15}
                          aria-hidden="true"
                          className={`shrink-0 text-[var(--sa-ink-2)] transition-transform duration-200 ${evidencePickerOpen ? 'rotate-180' : ''}`}
                        />
                      </button>
                    </div>

                    {evidencePickerOpen ? (
                      <ul className="m-0 flex list-none flex-col gap-2 rounded-lg border border-[var(--sa-line-soft)] bg-[var(--sa-sand)]/30 p-3">
                        {c.evidence.map((ev) => {
                          const mediaIdx = evidenceMediaItems.findIndex((m) => m.url === ev.url);
                          return (
                            <li key={ev.id} className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2.5 min-w-0">
                                {ev.url && ev.kind === 'photo' ? (
                                  <button
                                    type="button"
                                    onClick={() => openMedia(evidenceMediaItems, mediaIdx)}
                                    className="cursor-zoom-in group relative h-8 w-8 shrink-0 overflow-hidden rounded border border-[var(--sa-line)] bg-[var(--sa-sand)] focus:outline-none focus:ring-1 focus:ring-[var(--sa-brand-tint)]"
                                    title={`Preview ${ev.label} full screen`}
                                  >
                                    <img src={ev.url} alt="" className="h-full w-full object-cover transition-transform group-hover:scale-110" />
                                  </button>
                                ) : null}
                                <Checkbox label={<>{ev.label} <span className="sa-text-3">· {fmtDateTime(ev.capturedAt).split(' · ')[0]}</span></>} checked={f.reviewed.includes(ev.id)} onChange={(e) => set({ reviewed: e.target.checked ? [...f.reviewed, ev.id] : f.reviewed.filter((x) => x !== ev.id) })} />
                              </div>
                              <Button size="sm" variant="ghost" icon={Eye} type="button" onClick={() => openDialog({ kind: 'evidence', evidenceId: ev.id })}>View</Button>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </div>
                );
              })() : null}
              <FieldGroup label="Is the evidence sufficient?">
                <OptionGroup name="sufficiency" label="Evidence sufficiency" inline value={f.sufficiency} onChange={(v) => set({ sufficiency: v })} options={EVIDENCE_SUFFICIENCY_OPTIONS} />
              </FieldGroup>
              {f.sufficiency === 'needs_more' && !locked ? <Button className="mt-3" size="sm" icon={MessageSquare} type="button" onClick={() => openDialog({ kind: 'followUp', mode: 'follow_up' })}>Schedule a request to the reporter</Button> : null}
            </Block>

            <Block
              title={
                <span className="flex items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#fef3c7] text-[#b45309]">
                    <AlertTriangle size={15} aria-hidden="true" />
                  </span>
                  <span>Urgency</span>
                </span>
              }
              description="Is anyone, or the animal, at immediate risk? Urgent concerns do not wait for routine steps."
            >
              <OptionGroup name="urgency" cols={3} label="Urgency" value={f.urgency} onChange={(v) => set({ urgency: v })} options={(['immediate', 'possible', 'none'] as UrgencyLevel[]).map((u) => ({ value: u, label: URGENCY[u].label, description: URGENCY[u].description }))} />
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--sa-line)] bg-[var(--sa-sand)]/45 px-3.5 py-2.5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="sa-label m-0 text-xs">Current case priority</span>
                    <PriorityMark priority={c.priority} />
                  </div>
                  <p className="sa-small sa-text-3 m-0 mt-0.5">
                    {PRIORITIES[c.priority].description}
                  </p>
                </div>
                {!locked ? (
                  <Button size="sm" type="button" variant="secondary" icon={Flag} onClick={() => openDialog({ kind: 'priority' })}>
                    Change Priority
                  </Button>
                ) : null}
              </div>
              {(() => {
                const urgencyNoteRequired = isAutoUrgent && f.urgency !== 'immediate';
                const showUrgencyNote = urgencyNoteOpen || urgencyNoteRequired || Boolean(errors.urgencyNote);
                return (
                  <div className="mt-4">
                    <button
                      type="button"
                      aria-expanded={showUrgencyNote}
                      onClick={() => setUrgencyNoteOpen((o) => !o)}
                      className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--sa-line)] bg-[var(--sa-sand)]/55 px-3 py-1.5 text-xs font-semibold text-[var(--sa-ink)] transition-colors hover:bg-[var(--sa-sand)]"
                    >
                      <NotebookPen size={14} aria-hidden="true" className="text-[var(--sa-ink-2)]" />
                      <span>{f.urgencyNote.trim() ? 'Urgency Note' : 'Add a Note'}</span>
                      {f.urgencyNote.trim() ? <Badge tone="brand">Saved</Badge> : null}
                      {urgencyNoteRequired ? <Badge tone="amber">Required</Badge> : null}
                      <ChevronDown
                        size={14}
                        aria-hidden="true"
                        className={`shrink-0 text-[var(--sa-ink-2)] transition-transform duration-200 ${showUrgencyNote ? 'rotate-180' : ''}`}
                      />
                    </button>
                    {showUrgencyNote ? (
                      <Field
                        className="mt-3"
                        label="Urgency notes"
                        required={urgencyNoteRequired}
                        error={errors.urgencyNote}
                        optional={!urgencyNoteRequired}
                      >
                        <Textarea
                          rows={2}
                          value={f.urgencyNote}
                          onChange={(e) => set({ urgencyNote: e.target.value })}
                          placeholder={urgencyNoteRequired ? 'Explain why urgency is being lowered on this automatically prioritized Urgent report.' : 'Optional note about the urgency decision.'}
                        />
                      </Field>
                    ) : null}
                  </div>
                );
              })()}
            </Block>

            <Block
              title={
                <span className="flex items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#f5f0e8] text-[#57534e]">
                    <NotebookPen size={15} aria-hidden="true" />
                  </span>
                  <span>Assessment notes</span>
                </span>
              }
            >
              <Field label="Notes" optional hint="Your reasoning, for whoever picks this case up next."><Textarea rows={3} value={f.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
            </Block>
      </div>
    </Panel>
      </div >
    </Lockable >
  );
}

// ---------------------------------------------------------------------------------------------------------- identity
const DECISIONS: { value: MatchDecision; label: string }[] = [{ value: 'not_match', label: 'Not a match' }, { value: 'possible', label: 'Possibly the same' }, { value: 'confirmed', label: 'Confirm identity' }];

function IdentitySection({
  c,
  locked,
  f,
  setF,
  open,
  setOpen,
  noteOpen,
  setNoteOpen,
  errors,
}: {
  c: Case;
  locked: boolean;
  f: IdentityReview;
  setF: Dispatch<SetStateAction<IdentityReview>>;
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  noteOpen: boolean;
  setNoteOpen: Dispatch<SetStateAction<boolean>>;
  errors: Record<string, string>;
}) {
  const { state, capabilities } = useAdminData();
  // The backend records the identity status and the notes, not a decision for each candidate pet. Where it cannot keep those
  // decisions the candidates are not offered, rather than letting a click look saved.
  const candidates = capabilities.petMatchDecisions ? registryMatches(state.pets, c) : [];

  const decide = (petId: string, d: MatchDecision) => {
    const matches = { ...f.matches, [petId]: d };
    const values = Object.values(matches);
    let status: IdentityStatus = f.status;
    if (d === 'confirmed') status = 'identified';
    else if (d === 'possible' && f.status === 'unidentified') status = 'possible_match';
    else if (d === 'not_match' && f.status !== 'identified' && !values.includes('possible') && !values.includes('confirmed')) status = 'unidentified';
    setF({ ...f, matches, status });
  };

  const linkedPetName = c.registeredPet?.current?.name ?? c.registeredPet?.asReported?.name;
  const isReporterLinkedPending =
    c.identity.status === 'identified' && c.identity.decided === false && f.status === 'identified' && !f.note.trim();
  const identitySummary =
    isReporterLinkedPending || f.status === 'possible_match'
      ? linkedPetName
        ? `Identification pending · Linked to ${linkedPetName}.`
        : 'Identification pending.'
      : f.status === 'identified'
        ? linkedPetName
          ? `Animal identified · ${linkedPetName}.`
          : 'Animal identified.'
        : 'Animal not yet identified.';
  const decidedBadge = f.status !== c.identity.status || Boolean(f.note.trim()) ? true : c.identity.decided;

  return (
    <Panel className="sa-fade-up border-[#e7e2da] shadow-xs transition-shadow hover:shadow-sm">
      <Block>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="sa-h2 m-0 inline-flex items-center gap-2">
                <PawPrint size={16} className="text-[var(--sa-brand)]" aria-hidden="true" />
                <span>Animal identity</span>
              </h2>
              <IdentityBadge status={f.status} decided={decidedBadge} />
            </div>
            <p className="sa-small sa-text-2 m-0 mt-1">{identitySummary}</p>
          </div>
          <Button
            size="sm"
            type="button"
            variant={open ? 'ghost' : 'secondary'}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? 'Hide' : 'Review'}
            <ChevronDown
              size={15}
              aria-hidden="true"
              className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            />
          </Button>
        </div>

        {open ? (
          <Lockable locked={locked}>
            <div className="mt-4 border-t border-[var(--sa-line-soft)] pt-4">
              <p className="sa-small sa-text-3 mb-3.5">
                Which animal was involved? An unknown animal is never treated as identified until you decide it is.
              </p>
              {c.identity.status === 'identified' && c.identity.decided === false ? (
                <Callout className="mb-4" tone="amber" title="Linked by the reporter. You have not decided yet.">
                  The reporter named {linkedPetName ?? 'a registered pet'} from the pet registry. That does not confirm the animal. To record your own decision, keep “Identity confirmed” and write how you checked, or choose another status, then save.
                </Callout>
              ) : null}
              <FieldGroup label="Identity status">
                <OptionGroup name="identity" cols={3} label="Identity status" value={f.status} onChange={(v) => setF({ ...f, status: v })} options={(Object.keys(IDENTITY) as IdentityStatus[]).map((s) => ({ value: s, label: IDENTITY[s].label, description: IDENTITY[s].description }))} />
              </FieldGroup>

              {capabilities.petMatchDecisions ? (
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
              ) : null}

                {(() => {
                  const identityNoteRequired = f.status === 'identified';
                  const showIdentityNote = noteOpen || identityNoteRequired || Boolean(errors.identityNote);
                  return (
                    <div className="mt-5">
                      <button
                        type="button"
                        aria-expanded={showIdentityNote}
                        onClick={() => setNoteOpen((o) => !o)}
                        className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--sa-line)] bg-[var(--sa-sand)]/55 px-3 py-1.5 text-xs font-semibold text-[var(--sa-ink)] transition-colors hover:bg-[var(--sa-sand)]"
                      >
                        <NotebookPen size={14} aria-hidden="true" className="text-[var(--sa-ink-2)]" />
                        <span>{f.note.trim() ? 'Identification Note' : 'Add a Note'}</span>
                        {f.note.trim() ? <Badge tone="brand">Saved</Badge> : null}
                        {identityNoteRequired ? <Badge tone="amber">Required</Badge> : null}
                        <ChevronDown
                          size={14}
                          aria-hidden="true"
                          className={`shrink-0 text-[var(--sa-ink-2)] transition-transform duration-200 ${showIdentityNote ? 'rotate-180' : ''}`}
                        />
                      </button>
                      {showIdentityNote ? (
                        <Field
                          className="mt-3"
                          label="Identification notes"
                          required={identityNoteRequired}
                          optional={!identityNoteRequired}
                          error={errors.identityNote}
                          hint="Distinguishing marks compared, photos, who recognised the animal."
                        >
                          <Textarea rows={3} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
                        </Field>
                      ) : null}
                    </div>
                  );
                })()}
              </div>
          </Lockable>
        ) : null}
      </Block>
    </Panel>
  );
}

// -------------------------------------------------------------------------------------------------------- ownership
function OwnershipSection({
  c,
  locked,
  openDialog,
  f,
  setF,
  open,
  setOpen,
  noteOpen,
  setNoteOpen,
  errors,
}: {
  c: Case;
  locked: boolean;
  openDialog: OpenCaseDialog;
  f: OwnershipReview;
  setF: Dispatch<SetStateAction<OwnershipReview>>;
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  noteOpen: boolean;
  setNoteOpen: Dispatch<SetStateAction<boolean>>;
  errors: Record<string, string>;
}) {
  const { state, capabilities } = useAdminData();
  const now = useNow();
  const residents = [...state.residents].sort((a, b) => a.name.localeCompare(b.name));
  const pendingClaimsCount = c.claims.filter((cl) => cl.status !== 'accepted' && cl.status !== 'rejected').length;
  const confirmedOwner = f.ownerResidentId ? residentById(state, f.ownerResidentId) : undefined;
  const ownershipSummary =
    f.status === 'confirmed'
      ? confirmedOwner
        ? `Ownership confirmed · ${confirmedOwner.name} (${confirmedOwner.unit}).`
        : 'Ownership confirmed.'
      : f.status === 'unconfirmed' || f.status === 'disputed' || pendingClaimsCount > 0
        ? f.status === 'disputed'
          ? 'Ownership under verification · Disputed by owner.'
          : 'Ownership under verification.'
        : 'Ownership unconfirmed.';

  return (
    <div className="flex flex-col gap-5">
      <Panel className="sa-fade-up border-[#e7e2da] shadow-xs transition-shadow hover:shadow-sm">
        <Block>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="sa-h2 m-0">Ownership</h2>
                <OwnershipBadge status={f.status} />
                {pendingClaimsCount > 0 ? (
                  <Badge tone="amber" dot>
                    {plural(pendingClaimsCount, 'pending claim')}
                  </Badge>
                ) : null}
              </div>
              <p className="sa-small sa-text-2 m-0 mt-1">{ownershipSummary}</p>
            </div>
            <Button
              size="sm"
              type="button"
              variant={open ? 'ghost' : 'secondary'}
              aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
            >
              {open ? 'Hide' : 'Review'}
              <ChevronDown
                size={15}
                aria-hidden="true"
                className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
              />
            </Button>
          </div>

          {open ? (
            <div className="mt-4 border-t border-[var(--sa-line-soft)] pt-4">
              <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
                <p className="sa-small sa-text-3 m-0">
                  Who, if anyone, is responsible for the animal? Registering a pet is owner-declared and does not prove ownership.
                </p>
                {!locked ? (
                  <Button size="sm" type="button" icon={MessageSquare} onClick={() => openDialog({ kind: 'followUp', mode: 'owner' })}>
                    Record owner coordination
                  </Button>
                ) : null}
              </div>

              <Lockable locked={locked}>
                <FieldGroup label="Ownership status">
                  <OptionGroup name="ownership" cols={2} label="Ownership status" value={f.status} onChange={(v: OwnershipStatus) => setF({ ...f, status: v })} options={OWNERSHIP_IDS.map((s) => ({ value: s, label: OWNERSHIP[s].label, description: OWNERSHIP[s].description }))} />
                </FieldGroup>

                {f.status === 'confirmed' ? (
                  <div className="mt-5 flex flex-col gap-4">
                    <Field label="Confirmed owner" required error={errors.owner}>
                      <ResidentCombobox residents={residents} value={f.ownerResidentId ?? ''} label="Confirmed owner" placeholder="Type the owner's name, or choose…"
                        invalid={!!errors.owner} onChange={(id) => setF({ ...f, ownerResidentId: id || null })} />
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

                {(() => {
                  const ownershipNoteRequired = f.status === 'confirmed' || f.status === 'disputed' || f.status === 'unconfirmed';
                  const showOwnershipNote = noteOpen || ownershipNoteRequired || Boolean(errors.ownershipNote);
                  return (
                    <div className="mt-5">
                      <button
                        type="button"
                        aria-expanded={showOwnershipNote}
                        onClick={() => setNoteOpen((o) => !o)}
                        className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--sa-line)] bg-[var(--sa-sand)]/55 px-3 py-1.5 text-xs font-semibold text-[var(--sa-ink)] transition-colors hover:bg-[var(--sa-sand)]"
                      >
                        <NotebookPen size={14} aria-hidden="true" className="text-[var(--sa-ink-2)]" />
                        <span>{f.note.trim() ? 'Verification Note' : 'Add a Note'}</span>
                        {f.note.trim() ? <Badge tone="brand">Saved</Badge> : null}
                        {ownershipNoteRequired ? <Badge tone="amber">Required</Badge> : null}
                        <ChevronDown
                          size={14}
                          aria-hidden="true"
                          className={`shrink-0 text-[var(--sa-ink-2)] transition-transform duration-200 ${showOwnershipNote ? 'rotate-180' : ''}`}
                        />
                      </button>
                      {showOwnershipNote ? (
                        <Field
                          className="mt-3"
                          label="Verification notes"
                          required={ownershipNoteRequired}
                          optional={!ownershipNoteRequired}
                          error={errors.ownershipNote}
                          hint="Statements recorded, what was compared and why you reached this status."
                        >
                          <Textarea rows={3} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
                        </Field>
                      ) : null}
                    </div>
                  );
                })()}
                {f.status === 'disputed' ? <Callout className="mt-4">An owner’s denial is recorded, not assumed to be dishonest, and it does not close the case. Owner warnings stay unavailable until ownership is confirmed.</Callout> : null}
              </Lockable>
            </div>
          ) : null}
        </Block>
      </Panel>

      {open && c.claims.length > 0 ? (
        <Panel>
          <Block title="Ownership claims" description={capabilities.acceptConfirmsOwnership ? 'Review each claim against the evidence. Accepting one records ownership as confirmed.' : 'Review each claim against the evidence. Accepting one does not confirm ownership: record that decision above, with the evidence you relied on.'}>
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {c.claims.map((cl) => (
                <li key={cl.id} className="sa-record">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2"><span className="sa-semibold">{cl.claimantName}</span><Badge tone={CLAIM_STATUS[cl.status].tone}>{CLAIM_STATUS[cl.status].label}</Badge></p>
                      <p className="sa-meta mt-0.5">Submitted {relative(cl.submittedAt, now)}</p>
                    </div>
                    {!locked ? <Button size="sm" type="button" onClick={() => openDialog({ kind: 'claim', claimId: cl.id })}>{cl.status === 'accepted' || cl.status === 'rejected' ? 'View decision' : 'Review claim'}</Button> : null}
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
    </div>
  );
}

function UnifiedAssessmentForm({ c, openDialog, ownershipOnly }: { c: Case; openDialog: OpenCaseDialog; ownershipOnly: boolean }) {
  const { dispatch } = useAdminData();
  const toast = useToast();
  const { pending, error, run } = useSubmit();
  const locked = c.status === 'closed';
  const domestic = c.animal.type !== 'wildlife';
  const isInjured = c.category === 'injured';
  const isSafety = c.category === 'safety';
  const isAutoUrgent = (isInjured && c.priority === 'urgent' && (/unable to move/i.test(c.assessment.urgencyNote) || /Can the animal move\?:\s*No/i.test(c.animal.condition ?? '')))
    || (isSafety && /Automatic safety priority/i.test(c.assessment.urgencyNote));

  const initialIncident = incidentInit(c);
  const initialIdentity: IdentityReview = { status: c.identity.status, matches: c.identity.matches, note: c.identity.note };
  const initialOwnership: OwnershipReview = c.ownership;

  const [f, setF] = useState<IncidentForm>(initialIncident);
  const [idForm, setIdForm] = useState<IdentityReview>(initialIdentity);
  const [ownForm, setOwnForm] = useState<OwnershipReview>(initialOwnership);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const hasSavedChecklist =
    Object.values(initialIncident.injuredAssessment).some((v) => Boolean(v && v.trim())) ||
    Object.values(initialIncident.dangerousAssessment).some((v) => Boolean(v && v.trim()));
  const [checklistOpen, setChecklistOpen] = useState(hasSavedChecklist);
  const [evidencePickerOpen, setEvidencePickerOpen] = useState(false);
  const [urgencyNoteOpen, setUrgencyNoteOpen] = useState(() => Boolean(initialIncident.urgencyNote.trim()));
  const [identityOpen, setIdentityOpen] = useState(false);
  const [identityNoteOpen, setIdentityNoteOpen] = useState(() => Boolean(initialIdentity.note.trim()) || initialIdentity.status === 'identified');
  const [ownershipOpen, setOwnershipOpen] = useState(ownershipOnly);
  const [ownershipNoteOpen, setOwnershipNoteOpen] = useState(
    () => Boolean(initialOwnership.note.trim()) || initialOwnership.status === 'confirmed' || initialOwnership.status === 'disputed' || initialOwnership.status === 'unconfirmed',
  );

  const incidentDirty = !ownershipOnly && !same(f, initialIncident);
  const identityDirty = !ownershipOnly && domestic && !same(idForm, initialIdentity);
  const ownershipDirty = domestic && !same(ownForm, initialOwnership);
  const dirty = incidentDirty || identityDirty || ownershipDirty;

  useUnsavedGuard(dirty);

  const discardAll = () => {
    setF(initialIncident);
    setIdForm(initialIdentity);
    setOwnForm(initialOwnership);
    setErrors({});
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};

    if (!ownershipOnly && incidentDirty) {
      if (f.incident !== 'not_reviewed' && f.basis.trim().length < 5) {
        next.basis = 'Say what the decision is based on.';
      }
      if (isAutoUrgent && f.urgency !== 'immediate' && f.urgencyNote.trim().length < 5) {
        next.urgencyNote = 'Provide a reason for lowering urgency on an automatically prioritized Urgent report (at least 5 characters).';
        setUrgencyNoteOpen(true);
      }
    }

    if (!ownershipOnly && domestic && identityDirty) {
      if (idForm.status === 'identified' && idForm.note.trim().length < 10) {
        next.identityNote = 'Say how the animal was identified (marks compared, who recognised it).';
        setIdentityOpen(true);
        setIdentityNoteOpen(true);
      }
    }

    if (domestic && ownershipDirty) {
      if (ownForm.status === 'confirmed') {
        if (!ownForm.ownerResidentId) next.owner = 'Choose who the confirmed owner is.';
        if (ownForm.evidence.filter((x) => x !== 'registry').length === 0) {
          next.evidence = 'Pet registration alone is not enough. Select at least one other kind of supporting evidence.';
        }
        if (ownForm.note.trim().length < 10) next.ownershipNote = 'Record how ownership was established.';
      } else if ((ownForm.status === 'disputed' || ownForm.status === 'unconfirmed') && ownForm.note.trim().length < 10) {
        next.ownershipNote = 'Record why ownership is contested or unconfirmed.';
      }
      if (next.owner || next.evidence || next.ownershipNote) {
        setOwnershipOpen(true);
        if (next.ownershipNote) setOwnershipNoteOpen(true);
      }
    }

    setErrors(next);
    if (Object.keys(next).length) return;

    const assessmentPayload: Omit<Assessment, 'savedAt' | 'savedBy'> = incidentDirty
      ? {
        incident: f.incident,
        incidentBasis: f.basis.trim(),
        evidenceSufficiency: f.sufficiency,
        evidenceReviewed: f.reviewed,
        urgency: f.urgency,
        urgencyNote: f.urgencyNote.trim(),
        notes: f.notes.trim(),
      }
      : bare(c.assessment);

    const identityPayload: IdentityReview = identityDirty
      ? { ...idForm, note: idForm.note.trim() }
      : c.identity;

    const ownershipPayload: OwnershipReview = ownershipDirty
      ? {
        ...ownForm,
        ownerResidentId: ownForm.status === 'confirmed' ? ownForm.ownerResidentId : null,
        note: ownForm.note.trim(),
      }
      : c.ownership;

    const injuredModified = isInjured && !same(f.injuredAssessment, initialIncident.injuredAssessment) && Object.values(f.injuredAssessment).some((v) => Boolean(v && v.trim()));
    const dangerousModified = isSafety && !same(f.dangerousAssessment, initialIncident.dangerousAssessment) && Object.values(f.dangerousAssessment).some((v) => Boolean(v && v.trim()));

    if (
      await run(() =>
        dispatch({
          type: 'case/saveAssessment',
          id: c.id,
          assessment: assessmentPayload,
          identity: identityPayload,
          ownership: ownershipPayload,
          alsoSetUrgent: incidentDirty && f.urgency === 'immediate',
          ...(injuredModified ? { injuredAssessment: f.injuredAssessment } : {}),
          ...(dangerousModified ? { dangerousAssessment: f.dangerousAssessment } : {}),
        }),
      )
    ) {
      toast.success('Assessment saved');
    }
  };

  if (ownershipOnly) {
    return (
      <form onSubmit={submit} noValidate className="flex max-w-[920px] flex-col gap-5 pb-4">
        <style>{`
          @keyframes saFadeUp {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .sa-fade-up {
            animation: saFadeUp 280ms cubic-bezier(0.16, 1, 0.3, 1) both;
          }
        `}</style>
        {locked ? <Callout>This case is closed, so ownership is read-only. Reopen the case to change it.</Callout> : null}
        {domestic ? (
          <>
            <OwnershipSection c={c} locked={locked} openDialog={openDialog} f={ownForm} setF={setOwnForm} open={ownershipOpen} setOpen={setOwnershipOpen} noteOpen={ownershipNoteOpen} setNoteOpen={setOwnershipNoteOpen} errors={errors} />
            {error ? <FormError message={error} /> : null}
            {!locked ? <SaveBar dirty={dirty} pending={pending} label="Save assessment" onDiscard={discardAll} /> : null}
          </>
        ) : (
          <Callout>This is a wild animal, so ownership does not apply. Coordinate with an appropriate wildlife responder under Actions &amp; follow-ups.</Callout>
        )}
      </form>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex max-w-[920px] flex-col gap-5 pb-4">
      <style>{`
        @keyframes saFadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .sa-fade-up {
          animation: saFadeUp 280ms cubic-bezier(0.16, 1, 0.3, 1) both;
        }
      `}</style>
      {locked ? <Callout>This case is closed, so the assessment is read-only. Reopen the case to change it.</Callout> : null}
      <IncidentSection
        c={c}
        locked={locked}
        openDialog={openDialog}
        f={f}
        setF={setF}
        checklistOpen={checklistOpen}
        setChecklistOpen={setChecklistOpen}
        evidencePickerOpen={evidencePickerOpen}
        setEvidencePickerOpen={setEvidencePickerOpen}
        urgencyNoteOpen={urgencyNoteOpen}
        setUrgencyNoteOpen={setUrgencyNoteOpen}
        errors={errors}
      />
      {domestic ? (
        <>
          <IdentitySection c={c} locked={locked} f={idForm} setF={setIdForm} open={identityOpen} setOpen={setIdentityOpen} noteOpen={identityNoteOpen} setNoteOpen={setIdentityNoteOpen} errors={errors} />
          <OwnershipSection c={c} locked={locked} openDialog={openDialog} f={ownForm} setF={setOwnForm} open={ownershipOpen} setOpen={setOwnershipOpen} noteOpen={ownershipNoteOpen} setNoteOpen={setOwnershipNoteOpen} errors={errors} />
        </>
      ) : (
        <Callout>This is a wild animal, so identity and ownership do not apply. Coordinate with an appropriate wildlife responder under Actions &amp; follow-ups.</Callout>
      )}
      {error ? <FormError message={error} /> : null}
      {!locked ? <SaveBar dirty={dirty} pending={pending} label="Save assessment" onDiscard={discardAll} /> : null}
    </form>
  );
}

/**
 * A07 Case assessment, with A11 animal and ownership review. `ownershipOnly` is for a found-animal report: it is monitored from the start, so it has no
 * incident or identity assessment, only the ownership decision (and the claims residents made), which a Leader still records with evidence.
 */
export default function AssessmentTab({ c, openDialog, ownershipOnly = false }: { c: Case; openDialog: OpenCaseDialog; ownershipOnly?: boolean }) {
  const formKey = `${JSON.stringify(c.assessment)}:${JSON.stringify(c.identity)}:${JSON.stringify(c.ownership)}:${c.priority}:${c.timeline.length}:${c.claims.map((x) => x.status).join()}`;
  return <UnifiedAssessmentForm key={formKey} c={c} openDialog={openDialog} ownershipOnly={ownershipOnly} />;
}
