import { useRef, useState } from 'react';
import {
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  MessageSquarePlus,
  Paperclip,
  Phone,
  Trash2,
  Upload,
  User,
} from 'lucide-react';
import { errorMessage } from '../../preview/lib/errors';
import { fmtDate, fmtDateTime, fromLocalInput, toLocalInput } from '../../preview/lib/format';
import { reportIdOf } from '../../live/refs';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Dialog } from '../components/Dialog';
import { Field, Input, Select, Textarea } from '../components/form';
import { Callout, Kv } from '../components/layout';
import {
  SubdivisionContactFields,
  useSubdivisionContactAutofill,
} from '../components/SubdivisionContactFields';
import { useToast } from '../components/toast';
import {
  CONTACT_METHODS,
  ORGANIZATIONS,
  PRIMARY_REFERRAL_STATUS_IDS,
  REFERRAL_PRIORITY_LABELS,
  REFERRAL_STATUS,
} from '../data/constants';
import { useAdminData } from '../data/context';
import type {
  Case,
  ReferralAttachment,
  ReferralPriority,
  ReferralStatus,
} from '../data/types';
import { adminApi } from '../live/api';

const TERMINAL_REFERRAL_STATUSES: ReferralStatus[] = ['resolved', 'completed', 'declined', 'cancelled'];

function LocalDateTimeField({
  label,
  required,
  optional,
  value,
  onChange,
  hint,
  error,
}: {
  label: string;
  required?: boolean;
  optional?: boolean;
  value: string | null;
  onChange: (iso: string | null) => void;
  hint?: string;
  error?: string;
}) {
  const localVal = value ? toLocalInput(new Date(value)) : '';
  return (
    <Field label={label} required={required} optional={optional} hint={hint} error={error}>
      <Input
        type="datetime-local"
        value={localVal}
        onChange={(e) => {
          const raw = e.target.value;
          if (!raw) {
            onChange(null);
            return;
          }
          onChange(fromLocalInput(raw));
        }}
      />
    </Field>
  );
}

function SupportingDocumentsField({
  caseRefId,
  documents,
  onChange,
  disabled,
  label = 'Supporting Documents',
  hint = 'Upload photos, PDFs, or Word documents (up to 10 MB each).',
}: {
  caseRefId: string;
  documents: ReferralAttachment[];
  onChange: (next: ReferralAttachment[]) => void;
  disabled?: boolean;
  label?: string;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState('');

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const rid = reportIdOf(caseRefId);
    if (!rid) {
      setUploadErr('Unable to resolve case ID for file upload.');
      return;
    }
    setUploadErr('');
    setUploading(true);
    const added: ReferralAttachment[] = [];
    try {
      for (const file of Array.from(files)) {
        const res = await adminApi.uploadReferralDocument(rid, file);
        added.push({
          name: res.name || file.name,
          url: res.url,
          type: res.type || (file.type.startsWith('image/') ? 'image' : 'document'),
          uploadedAt: res.uploaded_at || new Date().toISOString(),
        });
      }
      onChange([...documents, ...added]);
    } catch (e) {
      setUploadErr(errorMessage(e));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const removeDoc = (idx: number) => {
    onChange(documents.filter((_, i) => i !== idx));
  };

  return (
    <Field label={label} optional hint={hint} error={uploadErr || undefined}>
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,image/jpeg,image/png,image/webp,application/pdf"
            multiple
            className="hidden"
            disabled={disabled || uploading}
            onChange={(e) => {
              void handleFiles(e.target.files);
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            icon={Upload}
            disabled={disabled || uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? 'Uploading document…' : 'Upload file or photo'}
          </Button>
          <span className="sa-meta">JPG, PNG, WEBP, PDF, DOC, DOCX</span>
        </div>

        {documents.length > 0 ? (
          <ul className="space-y-1.5">
            {documents.map((doc, idx) => {
              const isImg =
                doc.type === 'image' || /\.(jpg|jpeg|png|webp)$/i.test(doc.url || doc.name);
              return (
                <li
                  key={`${doc.url}-${idx}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-[var(--sa-border)] bg-[var(--sa-surface-2)] px-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {isImg ? (
                      <img
                        src={doc.url}
                        alt={doc.name}
                        className="h-9 w-9 rounded object-cover border border-[var(--sa-border)] shrink-0"
                      />
                    ) : (
                      <FileText size={16} className="text-[var(--sa-brand-ink)] shrink-0" />
                    )}
                    <div className="min-w-0">
                      <a
                        href={doc.url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-[var(--sa-brand-ink)] hover:underline truncate block"
                      >
                        {doc.name}
                      </a>
                      <span className="sa-meta text-xs">
                        {isImg ? 'Image attachment' : 'Supporting document'}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => removeDoc(idx)}
                    className="p-1 text-[var(--sa-text-3)] hover:text-red-600 rounded"
                    aria-label={`Remove ${doc.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </Field>
  );
}

/**
 * 1. Create Referral Dialog
 * Allows authorized personnel to create an external referral for a case with required & optional fields,
 * supporting document upload, and a confirmation step before submission.
 */
const mapAgencyTypeToOrgId = (t: string): string => {
  switch (t) {
    case 'barangay':
      return 'barangay';
    case 'veterinary_office':
    case 'municipal_vet':
      return 'vet';
    case 'animal_welfare':
      return 'welfare';
    case 'animal_control':
      return 'control';
    default:
      return 'other';
  }
};

export function ReferralDialog({ c, initialAgencyId, onClose }: { c: Case; initialAgencyId?: string; onClose: () => void }) {
  const { state, dispatch } = useAdminData();
  const toast = useToast();
  const agencies = state.settings.externalCoordination.agencies;

  const defaultOrg = ORGANIZATIONS[0];
  // Opened from a saved agency's button on the case: start with that agency (or 'manual' for another organization).
  const startAgency = initialAgencyId && initialAgencyId !== 'manual' ? agencies.find((a) => a.id === initialAgencyId) ?? null : null;
  const [selectedAgencyId, setSelectedAgencyId] = useState<string>(() => (startAgency ? startAgency.id : initialAgencyId === 'manual' || agencies.length === 0 ? 'manual' : ''));
  const selectedAgency = agencies.find((a) => a.id === selectedAgencyId) ?? null;
  const contactAutofill = useSubdivisionContactAutofill('phone', 'external', selectedAgency);

  const [orgId, setOrgId] = useState<string>(() => (startAgency ? mapAgencyTypeToOrgId(startAgency.type) : initialAgencyId === 'manual' ? 'other' : defaultOrg.id));
  const [orgName, setOrgName] = useState<string>(() => startAgency?.name ?? '');
  const [reason, setReason] = useState('');
  const [priorityLevel, setPriorityLevel] = useState<ReferralPriority>(
    c.priority === 'urgent' ? 'urgent' : c.priority === 'high' ? 'high' : 'normal',
  );
  const [referredAt, setReferredAt] = useState<string | null>(() => new Date().toISOString());
  const [initialStatus, setInitialStatus] = useState<'sent' | 'pending'>('sent');
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [documents, setDocuments] = useState<ReferralAttachment[]>([]);

  const [tried, setTried] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const handleSelectedAgencyChange = (nextId: string) => {
    setSelectedAgencyId(nextId);
    if (nextId === 'manual' || !nextId) {
      if (agencies.some((a) => a.name === orgName)) setOrgName('');
      if (nextId === 'manual') setOrgId('other');
      return;
    }
    const found = agencies.find((a) => a.id === nextId);
    if (found) {
      setOrgName(found.name);
      setOrgId(mapAgencyTypeToOrgId(found.type));
    }
  };

  const validSelection = agencies.length === 0 || Boolean(selectedAgencyId);
  const validOrgName = orgName.trim().length >= 2;
  const validReason = reason.trim().length >= 3;
  const validDate = Boolean(referredAt);
  const isFormValid = validSelection && validOrgName && validReason && validDate;

  const handleReviewBeforeSubmit = () => {
    setTried(true);
    setErr('');
    if (!isFormValid) return;
    setConfirming(true);
  };

  const effectiveContactPerson = contactAutofill.contactPerson.trim() || 'Not recorded';
  const effectiveContactDetail = contactAutofill.contactDetail.trim();
  const mergedAdditionalNotes = additionalNotes.trim();

  const handleConfirmCreate = async () => {
    if (!isFormValid || !referredAt || busy) return;
    setBusy(true);
    setErr('');
    try {
      await dispatch({
        type: 'case/createReferral',
        id: c.id,
        orgId,
        orgName: orgName.trim(),
        reason: reason.trim(),
        priorityLevel,
        referredAt,
        contactMethod: contactAutofill.contactMethod,
        contactPerson: effectiveContactPerson,
        contactChannel: effectiveContactDetail || CONTACT_METHODS[contactAutofill.contactMethod],
        contactDetail: effectiveContactDetail,
        notes: mergedAdditionalNotes,
        additionalNotes: mergedAdditionalNotes,
        supportingDocuments: documents,
        initialStatus,
        contacted: initialStatus === 'sent',
      });
      toast.success(
        initialStatus === 'sent'
          ? `Referral to ${orgName.trim()} created and marked Sent`
          : `Referral to ${orgName.trim()} created as Pending`,
      );
      onClose();
    } catch (e) {
      setErr(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={confirming ? 'Confirm External Referral' : 'Create External Referral'}
      description={`Case ${c.id} · ${c.title}. Creating or resolving a referral never automatically closes the case.`}
      onClose={onClose}
      size="lg"
      footer={
        confirming ? (
          <>
            <Button variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>
              Back to Edit
            </Button>
            <Button variant="primary" disabled={busy} onClick={handleConfirmCreate}>
              {busy ? 'Creating Referral…' : 'Confirm & Create Referral'}
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" disabled={busy} onClick={handleReviewBeforeSubmit}>
              Review & Create Referral
            </Button>
          </>
        )
      }
    >
      <div className="space-y-4">
        {err ? <Callout tone="red">{err}</Callout> : null}

        {confirming ? (
          <div className="space-y-4">
            <Callout tone="amber" title="Please confirm the referral details before saving">
              This referral will be associated with case <strong>{c.id}</strong> and tracked independently.
              The case itself will remain open until an authorized administrator closes it.
            </Callout>
            <div className="rounded-xl border border-[var(--sa-border)] bg-[var(--sa-surface-2)] p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--sa-border)] pb-2.5">
                <div>
                  <span className="sa-eyebrow">Receiving Organization / Agency</span>
                  <h4 className="text-base font-semibold text-[var(--sa-text-1)]">{orgName.trim()}</h4>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={REFERRAL_PRIORITY_LABELS[priorityLevel].tone}>
                    {REFERRAL_PRIORITY_LABELS[priorityLevel].label} Priority
                  </Badge>
                  <Badge tone={REFERRAL_STATUS[initialStatus].tone} dot>
                    {REFERRAL_STATUS[initialStatus].label}
                  </Badge>
                </div>
              </div>
              <Kv
                wide
                rows={[
                  ['Case Reference', `${c.id} (${c.title})`],
                  ['Referral Date', referredAt ? fmtDateTime(referredAt) : 'Now'],
                  ['Contact Method', contactAutofill.methodDisplayLabel],
                  [
                    'Organization Contact Details',
                    contactAutofill.contactDetail.trim() || 'Not specified',
                  ],
                  [
                    'Organization Contact Representative',
                    contactAutofill.contactPerson.trim() || 'Not specified',
                  ],
                  [
                    'Supporting Documents',
                    documents.length > 0 ? `${documents.length} file(s) attached` : 'None',
                  ],
                ]}
              />
              <div>
                <div className="sa-eyebrow">Referral Reason</div>
                <p className="text-sm mt-1 whitespace-pre-wrap">{reason.trim()}</p>
              </div>
              {additionalNotes.trim() ? (
                <div>
                  <div className="sa-eyebrow">Additional Notes</div>
                  <p className="text-sm mt-1 whitespace-pre-wrap">{additionalNotes.trim()}</p>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <>
            <div className="rounded-lg border border-[var(--sa-border)] bg-[var(--sa-surface-2)] px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="sa-eyebrow">Case Reference</span>
                <p className="text-sm font-semibold">
                  <span className="sa-ref">{c.id}</span> · {c.title}
                </p>
              </div>
              <Badge tone="neutral">Case remains open</Badge>
            </div>

            {agencies.length > 0 ? (
              <Field
                label="Receiving Organization (Saved in External Coordination)"
                required
                error={tried && !validSelection ? 'Select the receiving organization first.' : undefined}
                hint="Selecting a saved organization populates only that organization's contact information."
              >
                <Select
                  value={selectedAgencyId}
                  onChange={(e) => handleSelectedAgencyChange(e.target.value)}
                >
                  <option value="">-- Select receiving organization --</option>
                  {agencies.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.type.replace(/_/g, ' ')})
                    </option>
                  ))}
                  <option value="manual">Other / Enter organization manually</option>
                </Select>
              </Field>
            ) : null}

            <Field
              label="Receiving Organization / Agency Name"
              required
              error={tried && !validOrgName ? 'Enter the receiving organization or agency name.' : undefined}
            >
              <Input
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="e.g. City Veterinary Office, Barangay Hall, PAWS…"
              />
            </Field>

            <Field
              label="Referral Reason"
              required
              hint="Describe why this case requires external agency assistance."
              error={tried && !validReason ? 'Please describe why external assistance is needed.' : undefined}
            >
              <Textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Injured stray dog near main gate needing veterinary evaluation and municipal pickup…"
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <Field label="Priority Level" required>
                <Select
                  value={priorityLevel}
                  onChange={(e) => setPriorityLevel(e.target.value as ReferralPriority)}
                >
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </Select>
              </Field>

              <Field label="Initial Referral Status" required>
                <Select
                  value={initialStatus}
                  onChange={(e) => setInitialStatus(e.target.value as 'sent' | 'pending')}
                >
                  <option value="sent">Sent (Communicated to agency)</option>
                  <option value="pending">Pending (Created, not yet sent)</option>
                </Select>
              </Field>

              <LocalDateTimeField
                label="Referral Date & Time"
                required
                value={referredAt}
                onChange={setReferredAt}
                error={tried && !validDate ? 'Enter a valid referral date and time.' : undefined}
              />
            </div>

            <SubdivisionContactFields
              autofill={contactAutofill}
              methodLabel="Contact Method (How You Reached Them)"
              title={selectedAgency ? `${selectedAgency.name} Contact Information` : 'Receiving Organization Contact Information'}
              subtitle={
                selectedAgency
                  ? `Populated strictly from ${selectedAgency.name}'s saved External Coordination details. Fields remain blank if not saved.`
                  : 'Enter contact details manually for this receiving organization.'
              }
            />

            <SupportingDocumentsField
              caseRefId={c.id}
              documents={documents}
              onChange={setDocuments}
              disabled={busy}
            />

            <Field
              label="Additional Notes"
              optional
              hint="Extra coordination instructions, reference numbers, or context."
            >
              <Textarea
                rows={2}
                value={additionalNotes}
                onChange={(e) => setAdditionalNotes(e.target.value)}
                placeholder="e.g. Barangay desk logged under blotter entry #104; patrol unit will pass by at 3 PM."
              />
            </Field>
          </>
        )}
      </div>
    </Dialog>
  );
}

/**
 * 2. View Referral Details Modal
 * Displays the complete referral record, supporting documents, status history,
 * chronological external agency responses timeline, and documented outcome.
 */
export function ReferralDetailsDialog({
  c,
  referralId,
  onClose,
}: {
  c: Case;
  referralId: string;
  onClose: () => void;
}) {
  const r = c.referrals.find((x) => x.id === referralId);
  const [subAction, setSubAction] = useState<'status' | 'response' | 'outcome' | null>(null);

  if (!r) return null;

  if (subAction) {
    return (
      <CoordinationDialog
        c={c}
        referralId={r.id}
        initialMode={subAction}
        onClose={() => setSubAction(null)}
      />
    );
  }

  const st = REFERRAL_STATUS[r.status] ?? { label: r.status, tone: 'neutral' as const, open: true };
  const pr = REFERRAL_PRIORITY_LABELS[r.priorityLevel ?? 'normal'];
  const isTerminal = TERMINAL_REFERRAL_STATUSES.includes(r.status);
  const caseClosed = c.status === 'closed';

  // Aggregate all supporting documents from the referral and its updates
  const allDocs: (ReferralAttachment & { sourceLabel: string })[] = [
    ...(r.supportingDocuments ?? []).map((d) => ({ ...d, sourceLabel: 'Initial referral' })),
    ...r.notes.flatMap((n) =>
      (n.supportingDocuments ?? []).map((d) => ({
        ...d,
        sourceLabel: `${n.updateType === 'outcome' ? 'Outcome proof' : 'Agency response'} (${fmtDate(n.at)})`,
      })),
    ),
  ];

  return (
    <Dialog
      title={`${r.referenceNo} · ${r.orgName}`}
      description={`External Referral for Case ${c.id} (${c.title})`}
      onClose={onClose}
      size="lg"
      footer={
        <div className="flex flex-wrap items-center justify-between w-full gap-2">
          <div className="flex flex-wrap gap-2">
            {!caseClosed ? (
              <>
                <Button size="sm" variant="secondary" onClick={() => setSubAction('status')}>
                  Update Status
                </Button>
                {!isTerminal ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={MessageSquarePlus}
                    onClick={() => setSubAction('response')}
                  >
                    Record Agency Response
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="primary"
                  icon={CheckCircle2}
                  onClick={() => setSubAction('outcome')}
                >
                  {r.status === 'resolved' || r.status === 'completed'
                    ? 'Update Referral Outcome'
                    : 'Record Referral Outcome'}
                </Button>
              </>
            ) : null}
          </div>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Status & Priority Header Banner */}
        <div className="rounded-xl border border-[var(--sa-border)] bg-[var(--sa-surface-2)] p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="sa-ref font-semibold text-sm">{r.referenceNo}</span>
              <Badge tone={st.tone} dot>
                {st.label}
              </Badge>
              <Badge tone={pr.tone}>{pr.label} Priority</Badge>
            </div>
            {st.description ? <p className="sa-small sa-text-2">{st.description}</p> : null}
          </div>
          <div className="text-right sa-meta">
            <div>Created {fmtDateTime(r.referredAt)} by {r.createdBy}</div>
            <div>Last updated {fmtDateTime(r.updatedAt)}</div>
          </div>
        </div>

        {/* Original Referral Information & Contact Info */}
        <div className="rounded-xl border border-[var(--sa-border)] p-4 space-y-3">
          <h4 className="sa-eyebrow">Referral & Organization Information</h4>
          <Kv
            wide
            rows={[
              ['Case Reference', `${c.id} · ${c.title}`],
              ['Referral ID', r.referenceNo],
              ['Receiving Organization', r.orgName],
              ['Priority Level', pr.label],
              ['Referral Date', fmtDateTime(r.referredAt)],
              ['Contact Method', CONTACT_METHODS[r.contactMethod] ?? r.contactChannel ?? 'Phone'],
              ['Contact Person', r.contactPerson || 'Not specified'],
              ['Contact Details', r.contactDetail || r.contactChannel || 'Not specified'],
            ]}
          />
          <div className="pt-2 border-t border-[var(--sa-border)]">
            <div className="sa-eyebrow">Referral Reason</div>
            <p className="text-sm mt-1 whitespace-pre-wrap">{r.reason}</p>
          </div>
          {r.additionalNotes ? (
            <div className="pt-2 border-t border-[var(--sa-border)]">
              <div className="sa-eyebrow">Additional Notes</div>
              <p className="text-sm mt-1 whitespace-pre-wrap">{r.additionalNotes}</p>
            </div>
          ) : null}
        </div>

        {/* Documented Outcome Card */}
        {r.externalOutcome || r.assistanceProvided || r.actionsCompleted || r.status === 'resolved' || r.status === 'completed' ? (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-4 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold flex items-center gap-1.5 text-emerald-900 dark:text-emerald-200">
                <CheckCircle2 size={16} /> Documented Referral Outcome
              </h4>
              {r.outcomeDate ? (
                <span className="sa-meta">Completed {fmtDate(r.outcomeDate)}</span>
              ) : null}
            </div>
            {r.externalOutcome ? (
              <div>
                <span className="sa-eyebrow">Final Outcome / Result</span>
                <p className="text-sm mt-0.5 whitespace-pre-wrap">{r.externalOutcome}</p>
              </div>
            ) : null}
            {r.assistanceProvided ? (
              <div>
                <span className="sa-eyebrow">Assistance Provided by External Agency</span>
                <p className="text-sm mt-0.5 whitespace-pre-wrap">{r.assistanceProvided}</p>
              </div>
            ) : null}
            {r.actionsCompleted ? (
              <div>
                <span className="sa-eyebrow">Actions Completed</span>
                <p className="text-sm mt-0.5 whitespace-pre-wrap">{r.actionsCompleted}</p>
              </div>
            ) : null}
            {r.remainingFollowUp ? (
              <div>
                <span className="sa-eyebrow">Remaining Concerns / Follow-up Recommendations</span>
                <p className="text-sm mt-0.5 whitespace-pre-wrap">{r.remainingFollowUp}</p>
              </div>
            ) : null}
            {r.outcomeNote && r.outcomeNote !== r.externalOutcome ? (
              <div>
                <span className="sa-eyebrow">Final Notes</span>
                <p className="text-sm mt-0.5 whitespace-pre-wrap">{r.outcomeNote}</p>
              </div>
            ) : null}
            {r.outcomeRecordedBy ? (
              <p className="sa-meta pt-1">
                Outcome documented by {r.outcomeRecordedBy}
                {r.outcomeRecordedAt ? ` on ${fmtDateTime(r.outcomeRecordedAt)}` : ''}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* Supporting Documents / Attachments */}
        <div className="rounded-xl border border-[var(--sa-border)] p-4 space-y-2.5">
          <h4 className="sa-eyebrow flex items-center gap-1.5">
            <Paperclip size={13} /> Supporting Documents & Attachments ({allDocs.length})
          </h4>
          {allDocs.length === 0 ? (
            <p className="sa-small sa-text-2">No supporting documents uploaded for this referral yet.</p>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {allDocs.map((doc, idx) => {
                const isImg =
                  doc.type === 'image' || /\.(jpg|jpeg|png|webp)$/i.test(doc.url || doc.name);
                return (
                  <li
                    key={`${doc.url}-${idx}`}
                    className="flex items-center justify-between gap-2 rounded-lg border border-[var(--sa-border)] bg-[var(--sa-surface-2)] px-3 py-2 text-sm"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {isImg ? (
                        <img
                          src={doc.url}
                          alt={doc.name}
                          className="h-9 w-9 rounded object-cover border border-[var(--sa-border)] shrink-0"
                        />
                      ) : (
                        <FileText size={16} className="text-[var(--sa-brand-ink)] shrink-0" />
                      )}
                      <div className="min-w-0">
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-[var(--sa-brand-ink)] hover:underline truncate block"
                        >
                          {doc.name}
                        </a>
                        <span className="sa-meta text-xs">{doc.sourceLabel}</span>
                      </div>
                    </div>
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noreferrer"
                      className="p-1 text-[var(--sa-text-2)] hover:text-[var(--sa-brand-ink)]"
                      title="Open attachment"
                    >
                      <ExternalLink size={14} />
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Agency Responses and Updates Timeline */}
        <div className="rounded-xl border border-[var(--sa-border)] p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="sa-eyebrow">Agency Responses & Status History ({r.notes.length})</h4>
            {isTerminal ? (
              <span className="sa-meta">Referral is {st.label.toLowerCase()} — response logging closed</span>
            ) : null}
          </div>

          {r.notes.length === 0 ? (
            <p className="sa-small sa-text-2">No status updates or external agency responses recorded yet.</p>
          ) : (
            <ol className="space-y-3">
              {r.notes.map((n) => {
                const noteSt = n.status ? REFERRAL_STATUS[n.status] : null;
                const typeBadge =
                  n.updateType === 'agency_response'
                    ? 'External Agency Response'
                    : n.updateType === 'outcome'
                      ? 'Outcome Documented'
                      : n.updateType === 'created'
                        ? 'Referral Created'
                        : 'Status Update';
                return (
                  <li
                    key={n.id}
                    className="rounded-lg border border-[var(--sa-border)] bg-[var(--sa-surface-2)] p-3.5 space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--sa-brand-ink)]">
                          {typeBadge}
                        </span>
                        {noteSt ? (
                          <Badge tone={noteSt.tone} dot>
                            {noteSt.label}
                          </Badge>
                        ) : null}
                        {n.responderName ? (
                          <span className="sa-small font-medium">· Responder: {n.responderName}</span>
                        ) : null}
                      </div>
                      <span className="sa-meta">
                        {fmtDateTime(n.at)} · Recorded by {n.by}
                      </span>
                    </div>

                    <p className="text-sm whitespace-pre-wrap">{n.text}</p>

                    {n.assistanceProvided ? (
                      <div className="text-xs bg-[var(--sa-surface-1)] rounded p-2 border border-[var(--sa-border)]">
                        <span className="font-semibold">Assistance / Action Provided:</span>{' '}
                        {n.assistanceProvided}
                      </div>
                    ) : null}
                    {n.progressNotes ? (
                      <div className="text-xs bg-[var(--sa-surface-1)] rounded p-2 border border-[var(--sa-border)]">
                        <span className="font-semibold">Current Progress:</span> {n.progressNotes}
                      </div>
                    ) : null}
                    {n.followUpInstructions ? (
                      <div className="text-xs bg-[var(--sa-surface-1)] rounded p-2 border border-[var(--sa-border)]">
                        <span className="font-semibold">Follow-up Instructions:</span>{' '}
                        {n.followUpInstructions}
                      </div>
                    ) : null}
                    {n.additionalNotes && n.additionalNotes !== n.text ? (
                      <p className="sa-small sa-text-2">
                        <span className="font-semibold">Notes:</span> {n.additionalNotes}
                      </p>
                    ) : null}
                    {n.supportingDocuments && n.supportingDocuments.length > 0 ? (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {n.supportingDocuments.map((doc, idx) => (
                          <a
                            key={`${doc.url}-${idx}`}
                            href={doc.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 rounded border border-[var(--sa-border)] bg-[var(--sa-surface-1)] px-2.5 py-1 text-xs font-medium text-[var(--sa-brand-ink)] hover:underline"
                          >
                            <Paperclip size={12} />
                            {doc.name}
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </Dialog>
  );
}

/**
 * 3. CoordinationDialog (Update Status / Record External Agency Response / Record Referral Outcome)
 * Works for all external organizations (Barangay, Veterinary, Animal Control, Welfare, Wildlife, Other).
 */
export function CoordinationDialog({
  c,
  referralId,
  contact,
  initialMode,
  onClose,
}: {
  c: Case;
  referralId: string;
  contact?: boolean;
  initialMode?: 'status' | 'response' | 'outcome';
  onClose: () => void;
}) {
  const { state, dispatch } = useAdminData();
  const toast = useToast();
  const r = c.referrals.find((x) => x.id === referralId);

  const defaultMode: 'status' | 'response' | 'outcome' =
    initialMode ??
    (contact || r?.status === 'to_contact' || r?.status === 'pending' ? 'status' : 'response');

  const [mode, setMode] = useState<'status' | 'response' | 'outcome'>(defaultMode);

  // Shared fields
  const [status, setStatus] = useState<ReferralStatus>(() => {
    if (!r) return 'sent';
    if (defaultMode === 'outcome') return 'resolved';
    if (r.status === 'to_contact' || r.status === 'pending') return 'sent';
    if (r.status === 'sent') return 'acknowledged';
    if (r.status === 'completed') return 'resolved';
    if (r.status === 'no_response') return 'awaiting_response';
    return r.status;
  });
  const [updateDate, setUpdateDate] = useState<string | null>(() => new Date().toISOString());
  const [note, setNote] = useState('');
  const [responderName, setResponderName] = useState(r?.contactPerson ?? '');
  const [assistanceProvided, setAssistanceProvided] = useState(r?.assistanceProvided ?? '');
  const [actionsCompleted, setActionsCompleted] = useState(r?.actionsCompleted ?? '');
  const [progressNotes, setProgressNotes] = useState('');
  const [followUpInstructions, setFollowUpInstructions] = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [externalOutcome, setExternalOutcome] = useState(r?.externalOutcome ?? '');
  const [remainingFollowUp, setRemainingFollowUp] = useState(r?.remainingFollowUp ?? '');
  const [followUpAt, setFollowUpAt] = useState<string | null>(r?.followUpAt ?? null);
  const [completionDate, setCompletionDate] = useState<string | null>(() => new Date().toISOString());
  const [documents, setDocuments] = useState<ReferralAttachment[]>([]);

  // Contact fields when recording initial dispatch/contact — match strictly to this referral's receiving organization
  const matchedAgency =
    state.settings.externalCoordination.agencies.find(
      (a) => a.name.trim().toLowerCase() === (r?.orgName ?? '').trim().toLowerCase(),
    ) ?? null;
  const contactAutofill = useSubdivisionContactAutofill(r?.contactMethod ?? 'phone', 'external', matchedAgency);
  const [agencyPerson, setAgencyPerson] = useState(r?.contactPerson ?? '');

  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  if (!r) return null;

  const isTerminal = TERMINAL_REFERRAL_STATUSES.includes(r.status);

  const switchMode = (nextMode: 'status' | 'response' | 'outcome') => {
    setMode(nextMode);
    setTried(false);
    setErr('');
    if (nextMode === 'outcome') {
      setStatus('resolved');
    } else if (nextMode === 'response' && (status === 'resolved' || status === 'completed')) {
      setStatus('in_progress');
    }
  };

  const handleSave = async () => {
    setTried(true);
    setErr('');

    if (mode === 'outcome') {
      if (externalOutcome.trim().length < 3) return;
      if (assistanceProvided.trim().length < 3) return;
    } else {
      if (note.trim().length < 3) return;
      if (status === 'resolved' && externalOutcome.trim().length < 3 && note.trim().length < 3) {
        return;
      }
    }

    setBusy(true);
    try {
      const effectiveNote =
        mode === 'outcome'
          ? externalOutcome.trim()
          : note.trim();

      await dispatch({
        type: 'case/updateReferral',
        id: c.id,
        referralId: r.id,
        status,
        note: effectiveNote,
        updateType:
          mode === 'outcome'
            ? 'outcome'
            : mode === 'response'
              ? 'agency_response'
              : 'status_change',
        responderName: responderName.trim() || undefined,
        assistanceProvided: assistanceProvided.trim() || undefined,
        actionsCompleted: actionsCompleted.trim() || undefined,
        progressNotes: progressNotes.trim() || undefined,
        followUpInstructions: followUpInstructions.trim() || undefined,
        additionalNotes: additionalNotes.trim() || undefined,
        externalOutcome:
          mode === 'outcome' || status === 'resolved'
            ? externalOutcome.trim() || effectiveNote
            : externalOutcome.trim() || undefined,
        remainingFollowUp:
          (mode === 'outcome' ? remainingFollowUp.trim() : followUpInstructions.trim() || remainingFollowUp.trim()) ||
          undefined,
        followUpAt: followUpAt || null,
        updateDate,
        completionDate: mode === 'outcome' ? completionDate : null,
        supportingDocuments: documents,
        ...(contact || r.status === 'to_contact' || r.status === 'pending'
          ? {
            contact: {
              method: contactAutofill.contactMethod,
              person: agencyPerson.trim() || contactAutofill.contactPerson.trim(),
              detail: contactAutofill.contactDetail.trim(),
            },
          }
          : {}),
      });

      toast.success(
        mode === 'outcome'
          ? `Referral outcome recorded (${REFERRAL_STATUS[status].label})`
          : mode === 'response'
            ? `External agency response recorded for ${r.orgName}`
            : `Referral status updated to ${REFERRAL_STATUS[status].label}`,
      );
      onClose();
    } catch (e) {
      setErr(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={
        mode === 'outcome'
          ? `Record Referral Outcome — ${r.referenceNo}`
          : mode === 'response'
            ? `Record External Agency Response — ${r.referenceNo}`
            : `Update Referral Status — ${r.referenceNo}`
      }
      description={`${r.orgName} · Case ${c.id}. Updating or resolving a referral never automatically closes the case.`}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy} onClick={handleSave}>
            {busy
              ? 'Saving…'
              : mode === 'outcome'
                ? 'Save Referral Outcome'
                : mode === 'response'
                  ? 'Save Agency Response'
                  : 'Save Status Update'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {err ? <Callout tone="red">{err}</Callout> : null}

        {/* Mode Switcher Tabs */}
        <div className="flex flex-wrap gap-1.5 rounded-lg border border-[var(--sa-border)] bg-[var(--sa-surface-2)] p-1">
          <button
            type="button"
            onClick={() => switchMode('response')}
            disabled={isTerminal}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition ${mode === 'response'
              ? 'bg-[var(--sa-surface-1)] text-[var(--sa-brand-ink)] shadow-sm'
              : isTerminal
                ? 'opacity-40 cursor-not-allowed text-[var(--sa-text-3)]'
                : 'text-[var(--sa-text-2)] hover:text-[var(--sa-text-1)]'
              }`}
          >
            1. Record Agency Response
          </button>
          <button
            type="button"
            onClick={() => switchMode('status')}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition ${mode === 'status'
              ? 'bg-[var(--sa-surface-1)] text-[var(--sa-brand-ink)] shadow-sm'
              : 'text-[var(--sa-text-2)] hover:text-[var(--sa-text-1)]'
              }`}
          >
            2. Update Referral Status
          </button>
          <button
            type="button"
            onClick={() => switchMode('outcome')}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition ${mode === 'outcome'
              ? 'bg-[var(--sa-surface-1)] text-[var(--sa-brand-ink)] shadow-sm'
              : 'text-[var(--sa-text-2)] hover:text-[var(--sa-text-1)]'
              }`}
          >
            3. Record Referral Outcome
          </button>
        </div>

        {/* MODE 1: RECORD EXTERNAL AGENCY RESPONSE */}
        {mode === 'response' ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <LocalDateTimeField
                label="Response Date & Time"
                required
                value={updateDate}
                onChange={setUpdateDate}
              />
              <Field
                label="Responding Agency / Contact Person"
                optional
                hint="Name of the representative who provided the response."
              >
                <Input
                  value={responderName}
                  onChange={(e) => setResponderName(e.target.value)}
                  placeholder={`e.g. ${r.contactPerson || 'Desk Officer / Veterinarian'}`}
                />
              </Field>
            </div>

            <Field
              label="Response Details"
              required
              hint="What the external organization reported or communicated."
              error={
                tried && note.trim().length < 3
                  ? 'Please enter the external agency response details.'
                  : undefined
              }
            >
              <Textarea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. City Vet confirmed receipt of referral and dispatched field team to inspect the animal…"
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <Field
                label="Assistance or Action Provided"
                optional
                hint="Specific actions or services performed by the agency so far."
              >
                <Input
                  value={assistanceProvided}
                  onChange={(e) => setAssistanceProvided(e.target.value)}
                  placeholder="e.g. On-site first aid, transport to clinic, patrol check"
                />
              </Field>
              <Field label="Current Progress / Status" required>
                <Select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as ReferralStatus)}
                >
                  <option value="sent">Sent</option>
                  <option value="acknowledged">Acknowledged</option>
                  <option value="in_progress">In Progress</option>
                  <option value="awaiting_response">Awaiting Response</option>
                  <option value="declined">Declined</option>
                  <option value="cancelled">Cancelled</option>
                </Select>
              </Field>
            </div>

            <Field label="Current Progress Notes" optional>
              <Input
                value={progressNotes}
                onChange={(e) => setProgressNotes(e.target.value)}
                placeholder="e.g. Animal is under 24-hour observation at the municipal clinic"
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <Field
                label="Follow-up Instructions"
                optional
                hint="Next steps or coordination required from the subdivision."
              >
                <Input
                  value={followUpInstructions}
                  onChange={(e) => setFollowUpInstructions(e.target.value)}
                  placeholder="e.g. Call clinic tomorrow morning for medical clearance"
                />
              </Field>
              <LocalDateTimeField
                label="Schedule Next Follow-up Check"
                optional
                value={followUpAt}
                onChange={setFollowUpAt}
              />
            </div>

            <SupportingDocumentsField
              caseRefId={c.id}
              documents={documents}
              onChange={setDocuments}
              disabled={busy}
              label="Supporting Documents (if any)"
            />

            <Field label="Additional Notes" optional>
              <Textarea
                rows={2}
                value={additionalNotes}
                onChange={(e) => setAdditionalNotes(e.target.value)}
                placeholder="Any extra remarks or reference numbers…"
              />
            </Field>
          </div>
        ) : null}

        {/* MODE 2: UPDATE REFERRAL STATUS */}
        {mode === 'status' ? (
          <div className="space-y-4">
            <Field label="Referral Status" required>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {PRIMARY_REFERRAL_STATUS_IDS.map((s) => (
                  <label
                    key={s}
                    className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition ${status === s
                      ? 'border-[var(--sa-brand-ink)] bg-[var(--sa-surface-2)]'
                      : 'border-[var(--sa-border)] hover:bg-[var(--sa-surface-2)]'
                      }`}
                  >
                    <input
                      type="radio"
                      name="ref-status"
                      checked={status === s}
                      onChange={() => setStatus(s)}
                      className="mt-1"
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">{REFERRAL_STATUS[s].label}</div>
                      {REFERRAL_STATUS[s].description ? (
                        <div className="sa-meta text-xs mt-0.5">{REFERRAL_STATUS[s].description}</div>
                      ) : null}
                    </div>
                  </label>
                ))}
              </div>
            </Field>

            {(contact || r.status === 'to_contact' || r.status === 'pending') && status !== 'pending' ? (
              <div className="space-y-3">
                <SubdivisionContactFields
                  autofill={contactAutofill}
                  methodLabel="How they were contacted (Contact Method)"
                  compact
                />
                <Field label="Receiving Agency Contact Person (Optional)" optional hint="Separate from the Barangay Official Contact representative.">
                  <Input
                    value={agencyPerson}
                    onChange={(e) => setAgencyPerson(e.target.value)}
                    placeholder="e.g. Desk Officer Santos"
                  />
                </Field>
              </div>
            ) : null}

            <Field
              label={
                status === 'declined'
                  ? 'Reason for Declining'
                  : status === 'cancelled'
                    ? 'Reason for Cancellation'
                    : status === 'resolved'
                      ? 'Outcome Summary & Resolution Note'
                      : 'Status Update Note'
              }
              required
              error={
                tried && note.trim().length < 3
                  ? status === 'declined' || status === 'cancelled'
                    ? `A reason is required when a referral is ${status}.`
                    : 'Please enter a note explaining this status update.'
                  : undefined
              }
            >
              <Textarea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={
                  status === 'declined'
                    ? 'Explain why the external agency declined the referral…'
                    : status === 'cancelled'
                      ? 'Explain why this referral is being cancelled…'
                      : status === 'resolved'
                        ? 'Summarize how the referral objective was completed…'
                        : 'Record the details of this status change…'
                }
              />
            </Field>
          </div>
        ) : null}

        {/* MODE 3: RECORD REFERRAL OUTCOME */}
        {mode === 'outcome' ? (
          <div className="space-y-4">
            <Callout tone="sage" title="Documenting Referral Completion">
              Recording the referral outcome marks this referral as <strong>Resolved</strong> (or your selected final status) while keeping Case <strong>{c.id}</strong> open so you can review or close the case when ready.
            </Callout>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <Field label="Final Referral Status" required>
                <Select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as ReferralStatus)}
                >
                  <option value="resolved">Resolved (Objective completed)</option>
                  <option value="declined">Declined by External Agency</option>
                  <option value="cancelled">Cancelled</option>
                </Select>
              </Field>
              <LocalDateTimeField
                label="Date of Completion"
                required
                value={completionDate}
                onChange={setCompletionDate}
              />
            </div>

            <Field
              label="Final Outcome / Result"
              required
              hint="Describe the final outcome achieved through this referral."
              error={
                tried && externalOutcome.trim().length < 3
                  ? 'Document the final outcome or result of the referral.'
                  : undefined
              }
            >
              <Textarea
                rows={3}
                value={externalOutcome}
                onChange={(e) => setExternalOutcome(e.target.value)}
                placeholder="e.g. Dog was safely rescued, treated for minor wound at City Vet, and cleared for shelter intake…"
              />
            </Field>

            <Field
              label="Assistance Provided by the External Agency"
              required
              error={
                tried && assistanceProvided.trim().length < 3
                  ? 'Describe the assistance provided by the external agency.'
                  : undefined
              }
            >
              <Textarea
                rows={2}
                value={assistanceProvided}
                onChange={(e) => setAssistanceProvided(e.target.value)}
                placeholder="e.g. Emergency veterinary treatment, anti-rabies vaccination, and transport…"
              />
            </Field>

            <Field label="Actions Completed" optional>
              <Textarea
                rows={2}
                value={actionsCompleted}
                onChange={(e) => setActionsCompleted(e.target.value)}
                placeholder="e.g. Field capture completed, medical assessment signed, turnover certificate issued…"
              />
            </Field>

            <Field
              label="Remaining Concerns or Follow-up Recommendations"
              optional
              hint="Any post-referral monitoring or recommendations for the subdivision."
            >
              <Textarea
                rows={2}
                value={remainingFollowUp}
                onChange={(e) => setRemainingFollowUp(e.target.value)}
                placeholder="e.g. Monitor main gate area for other strays; check shelter adoption status next week."
              />
            </Field>

            <SupportingDocumentsField
              caseRefId={c.id}
              documents={documents}
              onChange={setDocuments}
              disabled={busy}
              label="Supporting Documents or Proof of Completion"
              hint="Upload medical certificates, turnover receipts, or completion photos."
            />

            <Field label="Final Notes" optional>
              <Textarea
                rows={2}
                value={additionalNotes}
                onChange={(e) => setAdditionalNotes(e.target.value)}
                placeholder="Additional closing remarks for this referral record…"
              />
            </Field>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}

/**
 * Shared External Referrals Panel used in both CaseDetailPage ("Referrals" tab & "Actions & follow-ups" tab)
 * and MonitoredCasePage.
 */
/** Short agency type labels for the "Refer to" buttons (the full labels are in Settings). */
const AGENCY_SHORT: Record<string, string> = {
  barangay: 'Barangay', veterinary_office: 'Vet office', municipal_vet: 'City vet', animal_welfare: 'Welfare group', animal_control: 'Animal control', other: 'Agency',
};

export function CaseReferralsSection({
  c,
  openDialog,
  hideCreateButton = false,
}: {
  c: Case;
  openDialog: (
    d:
      | { kind: 'referral'; agencyId?: string }
      | { kind: 'referralDetail'; referralId: string }
      | {
        kind: 'coordination';
        referralId: string;
        contact?: boolean;
        mode?: 'status' | 'response' | 'outcome';
      },
  ) => void;
  hideCreateButton?: boolean;
}) {
  const { state } = useAdminData();
  const agencies = state.settings.externalCoordination.agencies;
  const closed = c.status === 'closed';
  const referrals = c.referrals;
  const canCreate = !hideCreateButton && !closed;

  return (
    <div className="sa-card">
      <div className="sa-card__head">
        <h3 className="sa-card__title flex items-center gap-2">
          External referrals
          <span className="sa-pill">{referrals.length}</span>
        </h3>
      </div>

      <div className="sa-card__body space-y-4">
        {canCreate ? (
          // One tap per saved External Coordination agency (Settings): opens "Create Referral" with that organization filled in.
          <div className="flex flex-wrap items-center gap-2">
            <span className="sa-small sa-text-2">Refer to:</span>
            {agencies.map((a) => (
              <Button key={a.id} size="sm" icon={Building2} onClick={() => openDialog({ kind: 'referral', agencyId: a.id })}>
                {a.name}<span className="sa-text-3 font-normal"> · {AGENCY_SHORT[a.type] ?? 'Agency'}</span>
              </Button>
            ))}
            <Button size="sm" variant="ghost" onClick={() => openDialog({ kind: 'referral', agencyId: 'manual' })}>+ Other organization</Button>
          </div>
        ) : null}
        {canCreate && agencies.length === 0 ? (
          <p className="sa-hint">No agencies saved yet. Add the ones you work with in Settings, External Coordination, and they appear here.</p>
        ) : null}

        {referrals.length === 0 ? (
          <p className="sa-small sa-text-2">No referrals for this case yet.</p>
        ) : (
          <div className="space-y-3">
            {referrals.map((r, idx) => {
              const st = REFERRAL_STATUS[r.status] ?? {
                label: r.status,
                tone: 'neutral' as const,
                open: true,
              };
              const pr = REFERRAL_PRIORITY_LABELS[r.priorityLevel ?? 'normal'];
              const isTerminal = TERMINAL_REFERRAL_STATUSES.includes(r.status);
              const latestNote = r.notes[0];
              const resolved = r.status === 'resolved' || r.status === 'completed';

              return (
                <div
                  key={r.id}
                  style={{ animationDelay: `${idx * 55}ms` }}
                  className={`sa-fade-up rounded-xl border border-[#e7e2da] border-l-[3.5px] ${resolved ? 'border-l-emerald-600' : isTerminal ? 'border-l-stone-400' : 'border-l-[#b45309]'
                    } bg-gradient-to-b from-white to-[#fcfaf6] p-4 space-y-3 shadow-xs transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-[#d6cfc7] hover:shadow-sm`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="sa-ref font-semibold text-xs">{r.referenceNo}</span>
                        <span className="font-semibold text-base text-[var(--sa-text-1)]">
                          {r.orgName}
                        </span>
                        <Badge tone={st.tone} dot>
                          {st.label}
                        </Badge>
                        <Badge tone={pr.tone}>{pr.label} Priority</Badge>
                      </div>
                      <div className="sa-meta flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="inline-flex items-center gap-1">
                          <Calendar size={12} /> Referred: {fmtDateTime(r.referredAt)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <User size={12} /> Contact: {r.contactPerson || 'Not specified'}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Phone size={12} /> {r.contactChannel || CONTACT_METHODS[r.contactMethod]}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Clock size={12} /> Last Updated: {fmtDateTime(r.updatedAt)}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => openDialog({ kind: 'referralDetail', referralId: r.id })}
                      >
                        View Details
                      </Button>
                      {!closed && !isTerminal ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            openDialog({
                              kind: 'coordination',
                              referralId: r.id,
                              mode: 'response',
                            })
                          }
                        >
                          Record Response
                        </Button>
                      ) : null}
                      {!closed && r.status !== 'resolved' && r.status !== 'completed' ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            openDialog({
                              kind: 'coordination',
                              referralId: r.id,
                              mode: 'outcome',
                            })
                          }
                        >
                          Record Outcome
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  <p className="text-sm text-[var(--sa-text-1)]">{r.reason}</p>

                  {r.externalOutcome ? (
                    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs">
                      <span className="font-semibold text-emerald-900 dark:text-emerald-200">
                        Documented Outcome:
                      </span>{' '}
                      {r.externalOutcome}
                      {r.assistanceProvided ? ` · Assistance: ${r.assistanceProvided}` : ''}
                    </div>
                  ) : latestNote ? (
                    <div className="rounded-lg border border-[var(--sa-border)] bg-[var(--sa-surface-2)] px-3 py-2 text-xs text-[var(--sa-text-2)]">
                      <span className="font-semibold">Latest Update ({fmtDateTime(latestNote.at)}):</span>{' '}
                      {latestNote.text}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
