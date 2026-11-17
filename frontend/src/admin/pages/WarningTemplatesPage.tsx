import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  Archive, CheckCircle2, Eye, FileText, FileUp, History, Pencil, Plus, RotateCcw, Star,
} from 'lucide-react';
import { WarningLetterDocument } from '../../components/WarningLetterDocument';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Dialog } from '../components/Dialog';
import { Checkbox, Field, FieldGroup, Input, Select } from '../components/form';
import { Block, Callout, EmptyState, ErrorState, FormError, PageHeader, PageSkeleton, Panel } from '../components/layout';
import { useToast } from '../components/toast';
import { useAdminData } from '../data/context';
import {
  adminApi,
  type ApiPlaceholderDef,
  type ApiTemplatePreviewResult,
  type ApiWarningTemplate,
  type ApiWarningTemplateVersion,
} from '../live/api';
import { usePageTitle } from '../lib/hooks';
import { fmtDateTime } from '../../preview/lib/format';
import { errorMessage } from '../../preview/lib/errors';

const LEVELS = [
  { value: '', label: 'All warning levels (general)' },
  { value: 'Notice', label: 'Notice' },
  { value: '1st Warning', label: '1st Warning' },
  { value: '2nd Warning', label: '2nd Warning' },
  { value: 'Final Notice / Escalation', label: 'Final Notice / Escalation' },
];

export default function WarningTemplatesPage() {
  usePageTitle('Warning Letter Templates');
  const { state } = useAdminData();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [templates, setTemplates] = useState<ApiWarningTemplate[]>([]);
  const [placeholders, setPlaceholders] = useState<ApiPlaceholderDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'archived'>('all');

  const [editing, setEditing] = useState<ApiWarningTemplate | 'new' | null>(null);
  const [previewTarget, setPreviewTarget] = useState<{ template: ApiWarningTemplate; version?: ApiWarningTemplateVersion } | null>(null);
  const [historyTarget, setHistoryTarget] = useState<ApiWarningTemplate | null>(null);
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tplRes, phRes] = await Promise.all([
        adminApi.warningTemplates('all'),
        adminApi.warningTemplatePlaceholders(),
      ]);
      setTemplates(tplRes.items);
      setPlaceholders(phRes.placeholders);
      setLoadErr(null);
    } catch (e) {
      setLoadErr(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleImportDocx = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.docx')) {
      toast.error('Please select a valid .docx Word document.');
      return;
    }
    setImporting(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const created = await adminApi.importWarningTemplateDocx(form);
      toast.success(`Imported "${created.name}" (${created.current_version?.placeholders_used?.length ?? 0} placeholders detected)`);
      await load();
      setEditing(created);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const setDefault = async (t: ApiWarningTemplate) => {
    try {
      await adminApi.setDefaultWarningTemplate(t.template_id);
      toast.success(`"${t.name}" set as default template`);
      await load();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const toggleArchive = async (t: ApiWarningTemplate) => {
    const next = t.status === 'active' ? 'archived' : 'active';
    try {
      await adminApi.setWarningTemplateStatus(t.template_id, next);
      toast.success(next === 'archived' ? 'Template archived' : 'Template activated');
      await load();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const openHistory = async (t: ApiWarningTemplate) => {
    try {
      const full = await adminApi.warningTemplateDetail(t.template_id);
      setHistoryTarget(full);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  if (loading && templates.length === 0) return <PageSkeleton />;
  if (loadErr && templates.length === 0) return <ErrorState message={loadErr} onRetry={() => void load()} />;

  const shown = templates.filter((t) => filter === 'all' || t.status === filter);

  return (
    <div>
      <PageHeader
        title="Warning letter templates"
        description="Customize official warning letters, import Word (.docx) formats, preview dynamic placeholders, and manage template versions without editing code."
        actions={(
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleImportDocx(file);
              }}
            />
            <Button icon={FileUp} loading={importing} onClick={() => fileInputRef.current?.click()}>
              Import DOCX
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>
              New template
            </Button>
          </div>
        )}
      />

      <Panel>
        <Block
          title="Templates"
          description="Previously issued warning letters keep an immutable snapshot of the exact version used when they were issued."
          action={(
            <div className="flex gap-1.5">
              {(['all', 'active', 'archived'] as const).map((k) => (
                <Button key={k} size="sm" variant={filter === k ? 'primary' : 'ghost'} onClick={() => setFilter(k)}>
                  {k === 'all' ? `All (${templates.length})` : k === 'active' ? `Active (${templates.filter((x) => x.status === 'active').length})` : `Archived (${templates.filter((x) => x.status === 'archived').length})`}
                </Button>
              ))}
            </div>
          )}
        >
          {shown.length === 0 ? (
            <EmptyState
              icon={FileText}
              title={filter === 'archived' ? 'No archived templates' : 'No warning letter templates yet'}
              action={<Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>Create template</Button>}
            >
              Create a template in the editor or import an existing Word (.docx) document with placeholders.
            </EmptyState>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {shown.map((t) => (
                <li key={t.template_id} className="sa-record">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="sa-semibold text-[15px]">{t.name}</span>
                        {t.is_default ? <Badge tone="brand" dot>Default</Badge> : null}
                        <Badge tone={t.status === 'active' ? 'sage' : 'neutral'}>{t.status === 'active' ? 'Active' : 'Archived'}</Badge>
                        <Badge>{t.warning_level || 'All levels'}</Badge>
                        <Badge tone="neutral">v{t.current_version_number}</Badge>
                        <Badge tone="neutral">{t.source_type === 'docx_import' ? 'DOCX import' : 'Editor'}</Badge>
                      </p>
                      {t.description ? <p className="sa-small sa-text-2 mt-1">{t.description}</p> : null}
                      <p className="sa-meta mt-1.5">
                        Subject: <code className="text-xs">{t.current_version?.subject_template || '—'}</code>
                        {t.updated_at ? ` · Updated ${fmtDateTime(t.updated_at)}` : ''}
                        {t.updated_by_name ? ` by ${t.updated_by_name}` : ''}
                      </p>
                      {t.current_version?.placeholders_used?.length ? (
                        <p className="sa-meta mt-1">
                          Placeholders ({t.current_version.placeholders_used.length}):{' '}
                          {t.current_version.placeholders_used.map((k) => `{{${k}}}`).join(', ')}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" icon={Pencil} onClick={() => setEditing(t)}>Edit</Button>
                    <Button size="sm" icon={Eye} onClick={() => setPreviewTarget({ template: t })}>Preview</Button>
                    <Button size="sm" icon={History} onClick={() => void openHistory(t)}>
                      History ({t.version_count})
                    </Button>
                    {t.status === 'active' && !t.is_default ? (
                      <Button size="sm" icon={Star} onClick={() => void setDefault(t)}>Set as default</Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={t.status === 'active' ? Archive : RotateCcw}
                      onClick={() => void toggleArchive(t)}
                    >
                      {t.status === 'active' ? 'Archive' : 'Activate'}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Block>
      </Panel>

      <Panel className="mt-5">
        <Block title="Supported dynamic placeholders" description="Click any placeholder in the editor to insert it. StraySafe populates these fields automatically from case, pet, policy, and resident records.">
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {placeholders.map((p) => (
              <div key={p.key} className="rounded-lg border border-[var(--sa-line-soft)] bg-[var(--sa-surface-2)] p-2.5">
                <p className="flex items-center justify-between gap-2">
                  <code className="text-xs font-semibold text-[var(--sa-brand)]">{`{{${p.key}}}`}</code>
                  {p.required ? <Badge tone="amber">Required</Badge> : <Badge>Optional</Badge>}
                </p>
                <p className="sa-small font-medium mt-1">{p.label}</p>
                <p className="sa-meta mt-0.5">{p.description}</p>
              </div>
            ))}
          </div>
        </Block>
      </Panel>

      {editing ? (
        <TemplateEditorDialog
          template={editing === 'new' ? undefined : editing}
          placeholders={placeholders}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void load(); }}
        />
      ) : null}

      {previewTarget ? (
        <TemplatePreviewDialog
          template={previewTarget.template}
          version={previewTarget.version}
          cases={state.cases}
          onClose={() => setPreviewTarget(null)}
        />
      ) : null}

      {historyTarget ? (
        <VersionHistoryDialog
          template={historyTarget}
          onClose={() => setHistoryTarget(null)}
          onPreview={(ver) => { setHistoryTarget(null); setPreviewTarget({ template: historyTarget, version: ver }); }}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Template Editor Dialog (Create / New Version + Live Preview)
// ---------------------------------------------------------------------------
function TemplateEditorDialog({
  template,
  placeholders,
  onClose,
  onSaved,
}: {
  template?: ApiWarningTemplate;
  placeholders: ApiPlaceholderDef[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const docxRef = useRef<HTMLInputElement | null>(null);

  const [name, setName] = useState(template?.name ?? '');
  const [description, setDescription] = useState(template?.description ?? '');
  const [warningLevel, setWarningLevel] = useState(template?.warning_level ?? '');
  const [isDefault, setIsDefault] = useState(template?.is_default ?? false);
  const [subject, setSubject] = useState(template?.current_version?.subject_template ?? '{{warning_level}} ({{warning_reference}}) — {{case_reference}}');
  const [body, setBody] = useState(
    template?.current_version?.body_template ??
    `{{subdivision_name}} — Office of the Subdivision Leader\n\nDate Issued: {{issue_date}}\nWarning Reference: {{warning_reference}}\nCase Reference: {{case_reference}}\n\nTO: {{resident_name}}\nAddress: {{resident_address}}\n\nDear {{resident_name}},\n\nThis {{warning_level}} is issued regarding {{case_reference}} on {{incident_date}} involving {{pet_name}} ({{pet_type}}).\n\nViolation Details:\n{{violation_description}}\n\nApplicable Policy:\n{{policy_reference}}\n\nRequired Corrective Action:\n{{required_action}}\n\nIssued by:\n{{issued_by}}`
  );
  const [changeNote, setChangeNote] = useState(template ? '' : 'Initial template');
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  const [preview, setPreview] = useState<ApiTemplatePreviewResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const insertPlaceholder = (key: string) => {
    const token = `{{${key}}}`;
    const el = bodyRef.current;
    if (!el) {
      setBody((b) => `${b}${token}`);
      return;
    }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + token + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const runPreview = async () => {
    setErr(null);
    try {
      const res = await adminApi.previewWarningTemplate({
        subject_template: subject,
        body_template: body,
        warning_level: warningLevel || '1st Warning',
        recipient_name: 'Juan Dela Cruz',
        recipient_address: 'Block 3 Lot 8, Narra St.',
        policy_reference: 'House Rules §6.3 — Free-Roaming Pets',
        violation_description: 'Dog was observed roaming outside the property without a leash.',
        required_action: 'Keep your pet secured inside your property or on a leash when outside.',
        field_overrides: { pet_name: 'Bantay', pet_type: 'Dog' },
      });
      setPreview(res);
      setTab('preview');
    } catch (e) {
      setErr(errorMessage(e));
    }
  };

  const handleImportNewVersionDocx = async (file: File) => {
    if (!template) return;
    setSaving(true);
    setErr(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('template_id', String(template.template_id));
      const updated = await adminApi.importWarningTemplateDocx(form);
      toast.success(`Imported "${file.name}" as v${updated.current_version_number}`);
      onSaved();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) { setErr('Enter a template name.'); return; }
    if (subject.trim().length < 2) { setErr('Enter a letter subject template.'); return; }
    if (body.trim().length < 10) { setErr('Enter the letter body template (at least 10 characters).'); return; }
    setSaving(true);
    setErr(null);
    try {
      if (template) {
        await adminApi.updateWarningTemplate(template.template_id, {
          name: name.trim(),
          description: description.trim() || null,
          warning_level: warningLevel || null,
          subject_template: subject.trim(),
          body_template: body.trim(),
          is_default: isDefault,
          change_note: changeNote.trim() || undefined,
        });
        toast.success(`Saved new version of "${name.trim()}"`);
      } else {
        await adminApi.createWarningTemplate({
          name: name.trim(),
          description: description.trim() || null,
          warning_level: warningLevel || null,
          subject_template: subject.trim(),
          body_template: body.trim(),
          is_default: isDefault,
          change_note: changeNote.trim() || 'Initial version',
        });
        toast.success(`Template "${name.trim()}" created`);
      }
      onSaved();
    } catch (e2) {
      setErr(errorMessage(e2));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      size="lg"
      title={template ? `Edit template: ${template.name}` : 'Create warning letter template'}
      description={template ? `Saving creates version v${template.current_version_number + 1}. Earlier issued warning letters remain unchanged.` : 'Use {{placeholders}} to populate resident, pet, case, and policy details automatically.'}
      onClose={onClose}
      onSubmit={submit}
      dirty
      footer={({ requestClose }) => (
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            <Button type="button" variant="ghost" icon={Eye} onClick={() => void runPreview()}>
              {tab === 'preview' ? 'Refresh preview' : 'Preview letter'}
            </Button>
            {template ? (
              <>
                <input
                  ref={docxRef}
                  type="file"
                  accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleImportNewVersionDocx(f);
                  }}
                />
                <Button type="button" variant="ghost" icon={FileUp} onClick={() => docxRef.current?.click()}>
                  Replace from DOCX
                </Button>
              </>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button type="button" onClick={requestClose} disabled={saving}>Cancel</Button>
            <Button type="submit" variant="primary" loading={saving}>
              {template ? `Save as v${template.current_version_number + 1}` : 'Save template'}
            </Button>
          </div>
        </div>
      )}
    >
      {err ? <FormError message={err} /> : null}

      <div className="flex gap-2 border-b border-[var(--sa-line-soft)] pb-2">
        <Button type="button" size="sm" variant={tab === 'edit' ? 'primary' : 'ghost'} onClick={() => setTab('edit')}>Editor</Button>
        <Button type="button" size="sm" variant={tab === 'preview' ? 'primary' : 'ghost'} onClick={() => void runPreview()}>Live preview</Button>
      </div>

      {tab === 'edit' ? (
        <div className="flex flex-col gap-4">
          <div className="sa-grid2">
            <Field label="Template name" required><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Standard Subdivision Warning Letter" /></Field>
            <Field label="Applies to warning level"><Select value={warningLevel} onChange={(e) => setWarningLevel(e.target.value)}>{LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}</Select></Field>
          </div>
          <Field label="Description" optional><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="When should leaders use this template?" /></Field>
          <Field label="Subject template" required><Input value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>

          <FieldGroup label="Insert dynamic placeholder" hint="Click a chip to insert at cursor position in the letter body.">
            <div className="flex flex-wrap gap-1.5">
              {placeholders.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => insertPlaceholder(p.key)}
                  className="rounded border border-[var(--sa-line)] bg-[var(--sa-surface-2)] px-2 py-0.5 text-xs font-mono text-[var(--sa-ink)] hover:border-[var(--sa-brand)] hover:text-[var(--sa-brand)] cursor-pointer"
                  title={p.description}
                >
                  {`{{${p.key}}}`}
                </button>
              ))}
            </div>
          </FieldGroup>

          <Field label="Letter body template" required>
            <textarea
              ref={bodyRef}
              className="sa-input min-h-[260px] w-full font-mono text-[13px] leading-relaxed"
              rows={12}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </Field>

          <div className="sa-grid2">
            <Field label="Version change note" optional>
              <Input value={changeNote} onChange={(e) => setChangeNote(e.target.value)} placeholder="e.g. Updated legal clause wording" />
            </Field>
            <div className="flex items-end pb-2">
              <Checkbox label="Set as default template for this scope" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {preview ? (
            <>
              <Callout title="Sample Data Preview">
                Showing how placeholders render with sample resident, pet, and policy data.
              </Callout>
              <div className="sa-cm-letter">
                <p className="text-xs text-[var(--sa-ink-3)]"><strong>Subject:</strong> {preview.subject}</p>
                <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{preview.body}</div>
              </div>
            </>
          ) : <p className="sa-small sa-text-2">Generating preview...</p>}
        </div>
      )}
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Template Preview Dialog (against real subdivision cases or sample data)
// ---------------------------------------------------------------------------
function TemplatePreviewDialog({
  template,
  version,
  cases,
  onClose,
}: {
  template: ApiWarningTemplate;
  version?: ApiWarningTemplateVersion;
  cases: { id: string; title: string }[];
  onClose: () => void;
}) {
  const [selectedCase, setSelectedCase] = useState<string>('');
  const [preview, setPreview] = useState<ApiTemplatePreviewResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const ridMatch = /^SS-\d{4}-(\d+)$/.exec(selectedCase);
    const rid = ridMatch ? Number(ridMatch[1]) : undefined;
    adminApi.previewWarningTemplate({
      template_id: template.template_id,
      ...(version ? { version_id: version.version_id } : {}),
      ...(rid ? { report_id: rid } : {
        recipient_name: 'Juan Dela Cruz',
        recipient_address: 'Block 3 Lot 8, Narra St.',
        policy_reference: 'House Rules §6.3 — Free-Roaming Pets',
        violation_description: 'Pet was seen outside unattended.',
        required_action: 'Keep your pet secured inside your property or on a leash.',
        field_overrides: { pet_name: 'Bantay', pet_type: 'Dog' },
      }),
      warning_level: template.warning_level || '1st Warning',
    }).then((res) => { setPreview(res); setErr(null); }, (e) => setErr(errorMessage(e)));
  }, [template, version, selectedCase]);

  return (
    <Dialog
      size="lg"
      title={`Preview: ${template.name} (v${version?.version_number ?? template.current_version_number})`}
      description="Inspect how this template renders dynamically."
      onClose={onClose}
      footer={<Button variant="primary" onClick={onClose}>Close</Button>}
    >
      <Field label="Test with real case (optional)" optional>
        <Select value={selectedCase} onChange={(e) => setSelectedCase(e.target.value)}>
          <option value="">Sample resident & pet data</option>
          {cases.slice(0, 30).map((c) => <option key={c.id} value={c.id}>{c.id} · {c.title}</option>)}
        </Select>
      </Field>
      {err ? <FormError message={err} /> : null}
      {preview ? (
        <div className="flex flex-col gap-3">
          {preview.missing_fields.length > 0 ? (
            <Callout tone="amber" title="Missing fields detected for this case">
              {preview.missing_fields.map((m) => m.label).join(', ')} — the issuer will be prompted to confirm or supply these before issuing.
            </Callout>
          ) : (
            <Callout tone="sage">
              <span className="flex items-center gap-1.5"><CheckCircle2 size={15} />All placeholders in this template populated cleanly.</span>
            </Callout>
          )}
          <WarningLetterDocument
            subdivisionName={preview.placeholders?.subdivision_name}
            subdivisionAddress={preview.placeholders?.subdivision_address}
            subdivisionPhone={preview.placeholders?.subdivision_phone}
            subdivisionEmail={preview.placeholders?.subdivision_email}
            warningLevel={preview.placeholders?.warning_level || template.warning_level || '1st Warning'}
            warningReference={preview.placeholders?.warning_reference || 'WARN-PREVIEW'}
            caseReference={preview.placeholders?.case_reference || selectedCase || 'SS-2026-0001'}
            issueDate={preview.placeholders?.issue_date || '—'}
            recipientName={preview.placeholders?.resident_name || 'Juan Dela Cruz'}
            recipientAddress={preview.placeholders?.resident_address}
            subject={preview.subject}
            body={preview.body}
            issuerName={preview.placeholders?.issuer_name || preview.placeholders?.issued_by || 'Subdivision Leader'}
            issuerRole={preview.placeholders?.issuer_role}
          />
        </div>
      ) : null}
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Version History Dialog
// ---------------------------------------------------------------------------
function VersionHistoryDialog({
  template,
  onClose,
  onPreview,
}: {
  template: ApiWarningTemplate;
  onClose: () => void;
  onPreview: (v: ApiWarningTemplateVersion) => void;
}) {
  const versions = template.versions ?? [];
  return (
    <Dialog
      size="lg"
      title={`Version history: ${template.name}`}
      description="Every edit or DOCX import creates a new version. Previously issued letters keep the exact version they used."
      onClose={onClose}
      footer={<Button variant="primary" onClick={onClose}>Close</Button>}
    >
      {versions.length === 0 ? (
        <p className="sa-small sa-text-2">No versions recorded.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {versions.map((v) => (
            <li key={v.version_id} className="sa-record">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="sa-semibold">Version {v.version_number}</span>
                  {v.version_id === template.current_version_id ? <Badge tone="brand">Current</Badge> : null}
                  {v.source_filename ? <Badge>DOCX: {v.source_filename}</Badge> : null}
                </div>
                <Button size="sm" icon={Eye} onClick={() => onPreview(v)}>Preview v{v.version_number}</Button>
              </div>
              <p className="sa-small sa-text-2 mt-1">{v.change_note || 'No change note'}</p>
              <p className="sa-meta mt-1">
                {v.created_at ? fmtDateTime(v.created_at) : ''}
                {v.created_by_name ? ` · by ${v.created_by_name}` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
