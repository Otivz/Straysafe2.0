import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  Archive, CheckCircle2, Eye, FileText, FileUp, History, Pencil, Plus, RotateCcw, Star,
} from 'lucide-react';
import { WarningLetterDocument } from '../../components/WarningLetterDocument';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Dialog } from '../components/Dialog';
import { Checkbox, Field, FieldGroup, Input, Select } from '../components/form';
import { PlaceholderEditor, type PlaceholderEditorHandle } from '../components/PlaceholderEditor';
import { startPlaceholderDrag } from '../lib/placeholders';
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
import { fmtDate, fmtDateTime } from '../../preview/lib/format';
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

  // Archived templates appear only under Archived; All and Active list the ones in use.
  const shown = templates.filter((t) => (filter === 'archived' ? t.status === 'archived' : t.status !== 'archived'));
  const inUse = templates.filter((t) => t.status !== 'archived').length;

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
          description="Each template keeps its earlier versions under History. Letters already issued keep the exact version they were issued with."
          action={(
            <div className="flex gap-1.5">
              {(['all', 'active', 'archived'] as const).map((k) => (
                <Button key={k} size="sm" variant={filter === k ? 'primary' : 'ghost'} onClick={() => setFilter(k)}>
                  {k === 'all' ? `All (${inUse})` : k === 'active' ? `Active (${inUse})` : `Archived (${templates.length - inUse})`}
                </Button>
              ))}
            </div>
          )}
        >
          {shown.length === 0 ? (
            <EmptyState
              icon={FileText}
              title={filter === 'archived' ? 'No archived templates' : templates.length > 0 ? 'No active templates' : 'No warning letter templates yet'}
              action={filter === 'archived' ? undefined : <Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>Create template</Button>}
            >
              {filter === 'archived'
                ? 'Templates you archive are kept here, with their history. Activate one to use it again.'
                : templates.length > 0
                  ? 'Every template is archived. Open Archived to activate one, or create a new template.'
                  : 'Create a template in the editor or import an existing Word (.docx) document with placeholders.'}
            </EmptyState>
          ) : (
            <ul className="m-0 grid list-none gap-3 p-0 lg:grid-cols-2">
              {shown.map((t) => {
                const active = t.status === 'active';
                const sameName = templates.some((o) => o.template_id !== t.template_id && o.name.trim().toLowerCase() === t.name.trim().toLowerCase());
                const used = t.current_version?.placeholders_used?.length ?? 0;
                return (
                  <li key={t.template_id} className={`sa-record flex flex-col gap-2 ${active ? '' : 'opacity-80'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="m-0 min-w-0 truncate text-[15px] font-semibold" title={t.name}>{t.name}</h3>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {t.is_default ? <Badge tone="brand" dot>Default</Badge> : null}
                        <Badge tone={active ? 'sage' : 'neutral'}>{active ? 'Active' : 'Archived'}</Badge>
                      </div>
                    </div>
                    <p className="sa-meta m-0">
                      {t.warning_level || 'All levels'} · v{t.current_version_number}{used ? ` · ${used} placeholder${used === 1 ? '' : 's'}` : ''}
                      {sameName ? ` · #${t.template_id}${t.created_at ? `, created ${fmtDate(t.created_at)}` : ''}` : ''}
                    </p>
                    {t.description ? <p className="sa-small sa-text-2 m-0 line-clamp-2">{t.description}</p> : null}
                    {t.updated_at ? (
                      <p className="sa-meta m-0">Updated {fmtDate(t.updated_at)}{t.updated_by_name ? ` by ${t.updated_by_name}` : ''}</p>
                    ) : null}
                    <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
                      {active ? <Button size="sm" icon={Pencil} onClick={() => setEditing(t)}>Edit</Button> : null}
                      <Button size="sm" icon={Eye} onClick={() => setPreviewTarget({ template: t })}>Preview</Button>
                      <Button size="sm" icon={History} onClick={() => void openHistory(t)}>History{t.version_count > 1 ? ` (${t.version_count})` : ''}</Button>
                      {active && !t.is_default ? <Button size="sm" variant="ghost" icon={Star} onClick={() => void setDefault(t)}>Set as default</Button> : null}
                      <Button size="sm" variant="ghost" icon={active ? Archive : RotateCcw} className="ml-auto" onClick={() => void toggleArchive(t)}>
                        {active ? 'Archive' : 'Activate'}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Block>
      </Panel>

      <Panel className="mt-5">
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 sm:px-5">
            <span>
              <span className="sa-semibold block text-[15px]">Supported placeholders ({placeholders.length})</span>
              <span className="sa-meta">Filled in automatically from case, pet, policy and resident records. Drag them into a template in the editor.</span>
            </span>
            <span className="sa-meta shrink-0 group-open:hidden">Show</span>
            <span className="sa-meta hidden shrink-0 group-open:inline">Hide</span>
          </summary>
          <div className="grid gap-2.5 px-4 pb-4 sm:grid-cols-2 sm:px-5 lg:grid-cols-3">
            {placeholders.map((p) => (
              <div key={p.key} className="rounded-lg border border-[var(--sa-line-soft)] bg-[var(--sa-surface-2)] p-2.5">
                <p className="flex items-center justify-between gap-2">
                  <span className="sa-ph sa-ph--static">{p.label}</span>
                  {p.requirement === 'required' ? <Badge tone="amber">Always needed</Badge>
                    : p.requirement === 'conditional' ? <Badge tone="amber">Needed when used</Badge>
                    : p.requirement === 'system' ? <Badge>Automatic</Badge>
                    : <Badge>Optional</Badge>}
                </p>
                <p className="sa-meta mt-1.5">{p.description}</p>
              </div>
            ))}
          </div>
        </details>
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
  const subjectEd = useRef<PlaceholderEditorHandle>(null);
  const bodyEd = useRef<PlaceholderEditorHandle>(null);
  const lastField = useRef<'subject' | 'body'>('body');       // a clicked placeholder goes where the Leader was last typing
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

  const insertPlaceholder = (key: string) => (lastField.current === 'subject' ? subjectEd : bodyEd).current?.insert(key);

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
      description={template ? `Saving creates version v${template.current_version_number + 1}. Earlier issued warning letters remain unchanged.` : 'Drag placeholders into the subject or letter to fill in resident, pet, case, and policy details automatically.'}
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
          <FieldGroup label="Placeholders" hint="Drag a placeholder into the subject or the letter. You can also click one to insert it where the cursor is, drag boxes to move them, and press Backspace to remove one.">
            <div className="flex flex-wrap gap-1.5">
              {placeholders.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  draggable
                  onDragStart={(e) => startPlaceholderDrag(e, p.key)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insertPlaceholder(p.key)}
                  className="sa-ph"
                  title={p.description}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </FieldGroup>

          <Field label="Subject template" required>
            <PlaceholderEditor ref={subjectEd} single value={subject} onChange={setSubject} placeholders={placeholders} onFocus={() => { lastField.current = 'subject'; }} />
          </Field>

          <Field label="Letter body template" required>
            <PlaceholderEditor ref={bodyEd} value={body} onChange={setBody} placeholders={placeholders} onFocus={() => { lastField.current = 'body'; }} />
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
