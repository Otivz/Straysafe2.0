import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { CircleCheck, Download, FileSpreadsheet, History, Pencil, SearchX, Send, ShieldCheck, Upload, UserCheck, UserX } from 'lucide-react';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { ConfirmDialog, Dialog } from '../components/Dialog';
import { Field, Input, Segmented, SearchInput } from '../components/form';
import { Callout, EmptyState, ErrorState, FormError, PageHeader, Panel, Skeleton, Tabs } from '../components/layout';
import { useToast } from '../components/toast';
import type { Tone } from '../data/constants';
import { residentRecordsApi, RECORD_STATUSES, type ImportBatch, type InvitationStatus, type ImportRow, type RecordStatus, type ResidentRecord, type RowFilter } from '../live/residentRecords';
import { usePageTitle } from '../lib/hooks';
import { ResidentsTabs } from './ResidentsTabs';
import { useSubmit } from '../lib/useSubmit';
import { fmtDateTime } from '../../preview/lib/format';
import { errorMessage } from '../../preview/lib/errors';

type TabKey = 'records' | 'import' | 'history';
const STATUS_TONE: Record<RecordStatus, Tone> = { 'Pending Activation': 'amber', Active: 'sage', Deactivated: 'neutral' };
const INVITE_TONE: Record<InvitationStatus, Tone> = { 'Pending Delivery': 'neutral', Sending: 'neutral', Sent: 'brand', 'Delivery Failed': 'red', 'Invitation Expired': 'amber', Claimed: 'sage' };
const RESULT_TONE: Record<ImportRow['result'], Tone> = { valid: 'sage', duplicate: 'amber', invalid: 'red', missing: 'red' };
const RESULT_LABEL: Record<ImportRow['result'], string> = { valid: 'Ready', duplicate: 'Duplicate', invalid: 'Invalid', missing: 'Missing info' };

/**
 * Resident Records (Subdivision Leader): upload the official resident list, review what the system found, confirm the import once,
 * then keep the list. Residents can only register against an active, unused record on this list.
 */
export default function ResidentRecordsPage() {
  usePageTitle('Resident Records');
  const [tab, setTab] = useState<TabKey>('records');
  const [reviewBatch, setReviewBatch] = useState<number | null>(null);
  const [revision, setRevision] = useState(0);        // bumped after an import so the other tabs reload

  return (
    <div>
      <PageHeader title="Resident Records" description="The official list of residents of your subdivision. Importing it creates each resident’s account and emails them an activation link; they claim the account and choose their own password. There is no public sign-up." />
      <ResidentsTabs />
      <Tabs
        idPrefix="rr"
        label="Resident records sections"
        value={tab}
        onChange={setTab}
        items={[{ key: 'records', label: 'Records' }, { key: 'import', label: 'Import' }, { key: 'history', label: 'Import history' }]}
      />
      <div id="rr-panel" role="tabpanel" className="mt-5">
        {tab === 'records' ? <RecordsTab revision={revision} onImport={() => setTab('import')} /> : null}
        {tab === 'import' ? <ImportTab key={reviewBatch ?? 'new'} batchId={reviewBatch} onDone={() => { setRevision((n) => n + 1); }} onReset={() => setReviewBatch(null)} /> : null}
        {tab === 'history' ? <HistoryTab revision={revision} onReview={(id) => { setReviewBatch(id); setTab('import'); }} /> : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------------ records */
function RecordsTab({ revision, onImport }: { revision: number; onImport: () => void }) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState<'all' | RecordStatus>('all');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Awaited<ReturnType<typeof residentRecordsApi.list>> | null>(null);
  const [failed, setFailed] = useState(false);
  const [edit, setEdit] = useState<ResidentRecord | null>(null);
  const [toggle, setToggle] = useState<ResidentRecord | null>(null);
  const [failedOnly, setFailedOnly] = useState(false);
  const [busy, setBusy] = useState<number | 'all' | null>(null);

  useEffect(() => { const t = setTimeout(() => { setDebounced(q.trim()); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);
  const load = useCallback(() => {
    residentRecordsApi.list({ q: debounced, status, page, ...(failedOnly ? { invitation: 'failed' as const } : {}) }).then((d) => { setFailed(false); setData(d); }, () => setFailed(true));
  }, [debounced, status, page, failedOnly]);
  useEffect(() => { load(); }, [load, revision]);

  const resend = async (r: ResidentRecord) => {
    setBusy(r.record_id);
    try {
      const res = await residentRecordsApi.resend(r.record_id);
      if (res.result === 'sent') toast.success(`Invitation sent to ${r.email}`);
      else toast.error('The invitation could not be delivered. It is marked Delivery Failed so you can try again.');
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(null); load(); }
  };
  const sendWaiting = async () => {
    setBusy('all');
    try {
      const r = await residentRecordsApi.sendInvitations();
      toast.success(r.queued ? `${r.queued} invitation${r.queued === 1 ? ' is' : 's are'} being sent. Refresh in a moment to see each result.` : 'No invitations are waiting.');
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(null); setTimeout(load, 2500); }
  };

  if (failed) return <ErrorState onRetry={load} message="The resident records could not be loaded." />;
  if (!data) return <Panel className="p-5"><Skeleton h={18} /><div className="mt-3"><Skeleton h={18} /></div><div className="mt-3"><Skeleton h={18} /></div></Panel>;

  const total = Object.values(data.counts).reduce((a, b) => a + b, 0);
  const pages = Math.max(1, Math.ceil(data.total / data.page_size));
  return (
    <div>
      <style>{`
        @keyframes saFadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .sa-fade-up {
          animation: saFadeUp 280ms cubic-bezier(0.16, 1, 0.3, 1) both;
        }
      `}</style>
      {total === 0 ? (
        <Panel className="sa-fade-up border-[#e7e2da] shadow-xs"><EmptyState icon={FileSpreadsheet} title="No resident records yet" action={<Button variant="primary" icon={Upload} onClick={onImport}>Import resident list</Button>}>
          Upload the official Excel or CSV list of residents. StraySafe creates their accounts and emails each resident an activation link.
        </EmptyState></Panel>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <SearchInput className="w-full sm:w-[340px]" aria-label="Search resident records" placeholder="Search name, email, block or lot" value={q} onChange={(e) => setQ(e.target.value)} maxLength={100} />
            <Segmented
              label="Account status"
              value={status}
              onChange={(s) => { setStatus(s); setPage(1); }}
              options={[{ value: 'all', label: 'All', count: total }, ...RECORD_STATUSES.map((s) => ({ value: s, label: s === 'Pending Activation' ? 'Pending' : s, count: data.counts[s] }))]}
            />
          </div>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5" role="group" aria-label="Resident account totals">
            {[
              { label: 'Total accounts', value: total, accent: 'border-[#e7e2da]' },
              { label: 'Pending activation', value: data.counts['Pending Activation'], accent: 'border-[#e7e2da]' },
              { label: 'Active residents', value: data.counts.Active, accent: 'border-emerald-500/30' },
              { label: 'Deactivated', value: data.counts.Deactivated, accent: 'border-[#e7e2da]' },
              { label: 'Failed invitations', value: data.failed_invitations, accent: data.failed_invitations > 0 ? 'border-red-300' : 'border-[#e7e2da]' },
            ].map((s, idx) => (
              <Panel
                key={s.label}
                style={{ animationDelay: `${idx * 40}ms` }}
                className={`sa-fade-up p-3.5 ${s.accent} bg-gradient-to-b from-white to-[#fcfaf6] shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm`}
              >
                <p className="sa-meta m-0">{s.label}</p>
                <p className="sa-h3 sa-num m-0 mt-1">{s.value}</p>
              </Panel>
            ))}
          </div>
          {data.counts['Pending Activation'] > 0 ? (
            <div className="sa-fade-up mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e7e2da] bg-[#faf7f2] px-3.5 py-2.5" style={{ animationDelay: '120ms' }}>
              <Button size="sm" variant="secondary" icon={Send} loading={busy === 'all'} onClick={() => void sendWaiting()}>Send waiting and failed invitations</Button>
              {data.failed_invitations > 0 || failedOnly ? (
                <label className="sa-small flex items-center gap-2"><input type="checkbox" checked={failedOnly} onChange={(e) => { setFailedOnly(e.target.checked); setPage(1); }} />Show only failed invitations</label>
              ) : null}
            </div>
          ) : null}
          <Panel className="sa-fade-up overflow-hidden border-[#e7e2da] shadow-xs" style={{ animationDelay: '160ms' }}>
            {data.records.length === 0 ? (
              <EmptyState icon={SearchX} title="No records match" action={<Button onClick={() => { setQ(''); setStatus('all'); }}>Clear filters</Button>}>Try another name, email, block or lot.</EmptyState>
            ) : (
              <>
                <div className="sa-tablewrap">
                  <table className="sa-table sa-table--rows">
                    <caption className="sa-sr-only">Official resident records, {data.total} results</caption>
                    <thead><tr>
                      <th scope="col">Resident</th><th scope="col">Block / Lot</th><th scope="col" className="hidden md:table-cell">Contact</th>
                      <th scope="col">Account</th><th scope="col" className="hidden lg:table-cell">Invitation</th><th scope="col"><span className="sa-sr-only">Actions</span></th>
                    </tr></thead>
                    <tbody>
                      {data.records.map((r) => (
                        <tr key={r.record_id}>
                          <td><p className="sa-rowtitle">{r.full_name}</p><p className="sa-meta">{r.email}</p></td>
                          <td className="sa-num">Block {r.block_number}, Lot {r.lot_number}</td>
                          <td className="hidden md:table-cell sa-small sa-num">{r.contact_number ?? '—'}</td>
                          <td>
                            <Badge tone={STATUS_TONE[r.registration_status]} dot>{r.registration_status}</Badge>
                            {r.registered_at ? <p className="sa-meta">Activated {fmtDateTime(r.registered_at)}</p> : null}
                          </td>
                          <td className="hidden lg:table-cell">
                            {r.invitation_status ? (
                              <>
                                <Badge tone={INVITE_TONE[r.invitation_status]} dot>{r.invitation_status}</Badge>
                                {r.invitation_status === 'Delivery Failed' && r.invitation_error ? <p className="sa-meta">{r.invitation_error}</p> : null}
                                {r.invitation_sent_at ? <p className="sa-meta">Last sent {fmtDateTime(r.invitation_sent_at)}</p> : null}
                              </>
                            ) : <span className="sa-meta">{'—'}</span>}
                          </td>
                          <td className="sa-right">
                            <span className="inline-flex gap-2">
                              {r.registration_status === 'Pending Activation'
                                ? <Button size="sm" icon={Send} loading={busy === r.record_id} onClick={() => void resend(r)} aria-label={`Send invitation to ${r.full_name}`}>{r.invitation_status === 'Pending Delivery' ? 'Send' : 'Resend'}</Button> : null}
                              <Button size="sm" icon={Pencil} onClick={() => setEdit(r)} aria-label={`Edit ${r.full_name}`}>Edit</Button>
                              {r.registration_status === 'Deactivated'
                                ? <Button size="sm" icon={UserCheck} onClick={() => setToggle(r)} aria-label={`Reactivate ${r.full_name}`}>Reactivate</Button>
                                : <Button size="sm" variant="danger" icon={UserX} onClick={() => setToggle(r)} aria-label={`Deactivate ${r.full_name}`}>Deactivate</Button>}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="sa-pager">
                  <span>Showing {(data.page - 1) * data.page_size + 1}–{Math.min(data.page * data.page_size, data.total)} of {data.total}</span>
                  {pages > 1 ? (
                    <span className="flex items-center gap-2">
                      <Button size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
                      <span className="sa-num">Page {page} of {pages}</span>
                      <Button size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button>
                    </span>
                  ) : null}
                </div>
              </>
            )}
          </Panel>
        </>
      )}
      {edit ? <EditDialog record={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); toast.success('Resident record updated'); load(); }} /> : null}
      {toggle ? (
        <ConfirmDialog
          title={toggle.registration_status === 'Deactivated' ? 'Reactivate this record?' : 'Deactivate this record?'}
          message={toggle.registration_status === 'Deactivated'
            ? `${toggle.full_name}'s account will work again${toggle.registered_at ? '' : '; they have not activated it yet, so send them a new invitation'}.`
            : `${toggle.full_name} will not be able to sign in or submit reports, and any invitation link stops working. Their pets, reports and messages are kept.`}
          confirmLabel={toggle.registration_status === 'Deactivated' ? 'Reactivate' : 'Deactivate'}
          tone={toggle.registration_status === 'Deactivated' ? 'primary' : 'danger'}
          onConfirm={async () => { await (toggle.registration_status === 'Deactivated' ? residentRecordsApi.reactivate(toggle.record_id) : residentRecordsApi.deactivate(toggle.record_id)); toast.success('Record updated'); load(); }}
          onClose={() => setToggle(null)}
        />
      ) : null}
    </div>
  );
}

function EditDialog({ record, onClose, onSaved }: { record: ResidentRecord; onClose: () => void; onSaved: () => void }) {
  const { pending, error, run } = useSubmit();
  const [v, setV] = useState({ full_name: record.full_name, email: record.email, block_number: record.block_number, lot_number: record.lot_number, contact_number: record.contact_number ?? '' });
  const set = (k: keyof typeof v, value: string) => setV((p) => ({ ...p, [k]: value }));
  const submit = (e: FormEvent) => { e.preventDefault(); void run(async () => { await residentRecordsApi.update(record.record_id, { ...v, contact_number: v.contact_number.trim() || null }); onSaved(); }); };
  return (
    <Dialog
      title="Edit resident record"
      description="Before the resident activates, the account follows these details; changing the email needs a new invitation."
      onClose={onClose}
      onSubmit={submit}
      footer={({ requestClose }) => (<><Button onClick={requestClose} disabled={pending}>Cancel</Button><Button type="submit" variant="primary" loading={pending}>Save changes</Button></>)}
    >
      <div className="grid gap-4">
        {error ? <FormError message={error} /> : null}
        <Field label="Full name" required><Input value={v.full_name} maxLength={100} onChange={(e) => set('full_name', e.target.value)} /></Field>
        <Field label="Email address" required hint={record.registered_at ? 'This resident already activated the account, so the email cannot change.' : 'The activation link is sent here.'}>
          <Input type="email" value={v.email} maxLength={100} disabled={record.registered_at !== null} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Block number" required><Input value={v.block_number} maxLength={30} onChange={(e) => set('block_number', e.target.value)} /></Field>
          <Field label="Lot number" required><Input value={v.lot_number} maxLength={30} onChange={(e) => set('lot_number', e.target.value)} /></Field>
        </div>
        <Field label="Contact number" optional><Input value={v.contact_number} maxLength={40} inputMode="tel" onChange={(e) => set('contact_number', e.target.value)} /></Field>
      </div>
    </Dialog>
  );
}

/* ------------------------------------------------------------------------------------------------------ import */
function ImportTab({ batchId, onDone, onReset }: { batchId: number | null; onDone: () => void; onReset: () => void }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const upload = useSubmit();
  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(batchId !== null);
  const [result, setResult] = useState<{ imported: number; accounts_created: number; skipped: number; linked_existing: number } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    if (batchId === null) return;
    let live = true;
    residentRecordsApi.batch(batchId, 'issues', 1).then((r) => { if (live) { setBatch(r.batch); setLoadingExisting(false); } }, () => { if (live) setLoadingExisting(false); });
    return () => { live = false; };
  }, [batchId]);

  const send = (file: File | undefined) => {
    if (!file) return;
    void upload.run(async () => { setResult(null); setBatch(await residentRecordsApi.upload(file)); });
    if (input.current) input.current.value = '';
  };
  const download = async (format: 'xlsx' | 'csv') => { setDownloadError(null); try { await residentRecordsApi.template(format); } catch (e) { setDownloadError(errorMessage(e)); } };
  const restart = () => { setBatch(null); setResult(null); onReset(); };

  if (loadingExisting) return <Panel className="p-5"><Skeleton h={18} /></Panel>;

  if (result && batch) {
    return (
      <Panel className="p-6">
        <EmptyState icon={CircleCheck} title="Import complete" action={<Button variant="primary" onClick={restart}>Import another file</Button>}>
          {result.accounts_created} resident account{result.accounts_created === 1 ? ' was' : 's were'} created as Pending Activation, and the invitation emails are being sent in the background. Check the Invitation column on the Records tab for each result.
          {result.linked_existing ? ` ${result.linked_existing} already had a StraySafe account and were linked as Active.` : ''}
          {result.skipped ? ` ${result.skipped} were skipped because they were added by another import after the file was checked.` : ''}
        </EmptyState>
      </Panel>
    );
  }

  if (batch && batch.status === 'Validated') {
    return (
      <div className="grid gap-5">
        <Summary batch={batch} />
        {batch.valid_rows === 0 ? <Callout tone="amber" title="Nothing can be imported">Every row has a problem. Correct the file and upload it again.</Callout>
          : batch.total_rows > batch.valid_rows ? <Callout tone="amber" title="Some rows will not be imported">Only the {batch.valid_rows} ready row{batch.valid_rows === 1 ? '' : 's'} will be imported. Rows with a problem are skipped and get no account.</Callout> : null}
        <RowsPanel batch={batch} />
        {upload.error ? <FormError message={upload.error} /> : null}
        <div className="flex flex-wrap justify-end gap-3">
          <Button onClick={() => setDiscarding(true)}>Discard this file</Button>
          <Button variant="primary" icon={ShieldCheck} disabled={batch.valid_rows === 0} onClick={() => setConfirming(true)}>Import {batch.valid_rows} valid record{batch.valid_rows === 1 ? '' : 's'}</Button>
        </div>
        {confirming ? (
          <ConfirmDialog
            title="Create these resident accounts?"
            message={`${batch.valid_rows} resident record${batch.valid_rows === 1 ? '' : 's'} from "${batch.filename}" will be imported: a resident account is created for each one, and an activation link is emailed to the address on its record. ${batch.total_rows - batch.valid_rows} row${batch.total_rows - batch.valid_rows === 1 ? '' : 's'} with problems will be left out. This cannot be repeated for the same file.`}
            confirmLabel="Import and send invitations"
            onConfirm={async () => { const r = await residentRecordsApi.confirm(batch.batch_id); setBatch(r.batch); setResult({ imported: r.imported, accounts_created: r.accounts_created, skipped: r.skipped, linked_existing: r.linked_existing }); onDone(); toast.success('Resident records imported'); }}
            onClose={() => setConfirming(false)}
          />
        ) : null}
        {discarding ? (
          <ConfirmDialog title="Discard this file?" message="Nothing will be imported. You can upload a corrected file afterwards." confirmLabel="Discard" tone="danger"
            onConfirm={async () => { await residentRecordsApi.discard(batch.batch_id); onDone(); restart(); toast.success('File discarded'); }} onClose={() => setDiscarding(false)} />
        ) : null}
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      {batch ? <Callout tone="info">This file was already {batch.status.toLowerCase()}. Upload a new file to continue.</Callout> : null}
      <Panel className="p-5">
        <h2 className="sa-h3">1. Get the template</h2>
        <p className="sa-small mt-1">Use these headings exactly: Full Name, Email Address, Block Number, Lot Number, Contact Number (optional).</p>
        <div className="mt-3 flex flex-wrap gap-3">
          <Button icon={Download} onClick={() => void download('xlsx')}>Excel template (.xlsx)</Button>
          <Button icon={Download} onClick={() => void download('csv')}>CSV template (.csv)</Button>
        </div>
        {downloadError ? <div className="mt-3"><FormError message={downloadError} /></div> : null}
      </Panel>
      <Panel className="p-5">
        <h2 className="sa-h3">2. Upload the official list</h2>
        <p className="sa-small mt-1">Excel (.xlsx) or CSV, up to 5 MB and 20,000 residents. The file is checked automatically; nothing is imported until you confirm.</p>
        <div
          className="mt-3 flex flex-col items-center gap-3 rounded-xl border-2 border-dashed p-8 text-center"
          style={{ borderColor: dragging ? 'var(--sa-brand)' : 'var(--sa-line)' }}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); send(e.dataTransfer.files[0]); }}
        >
          <FileSpreadsheet size={32} aria-hidden="true" />
          <p className="sa-small">Drag a file here, or</p>
          <Button variant="primary" icon={Upload} loading={upload.pending} onClick={() => input.current?.click()}>{upload.pending ? 'Checking the file…' : 'Choose a file'}</Button>
          <input ref={input} type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sa-sr-only" aria-label="Resident list file" onChange={(e) => send(e.target.files?.[0])} />
        </div>
        {upload.error ? <div className="mt-3"><FormError message={upload.error} /></div> : null}
      </Panel>
    </div>
  );
}

function Summary({ batch }: { batch: ImportBatch }) {
  const items: [string, number, string?][] = [
    ['Total rows', batch.total_rows], ['Valid', batch.valid_rows], ['Duplicates', batch.duplicate_rows, batch.duplicate_rows ? 'sa-stat--alert' : undefined],
    ['Invalid', batch.invalid_rows, batch.invalid_rows ? 'sa-stat--alert' : undefined], ['Missing information', batch.missing_rows, batch.missing_rows ? 'sa-stat--alert' : undefined],
  ];
  return (
    <div>
      <p className="sa-small mb-2">Validation summary for <strong>{batch.filename}</strong></p>
      <div className="sa-stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
        {items.map(([label, value, cls]) => (<div key={label} className={`sa-stat ${cls ?? ''}`}><span className="sa-stat__value sa-num">{value}</span><span className="sa-stat__label">{label}</span></div>))}
      </div>
    </div>
  );
}

function RowsPanel({ batch }: { batch: ImportBatch }) {
  const [filter, setFilter] = useState<RowFilter>(batch.total_rows > batch.valid_rows ? 'issues' : 'valid');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Awaited<ReturnType<typeof residentRecordsApi.batch>> | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => { residentRecordsApi.batch(batch.batch_id, filter, page).then((d) => { setFailed(false); setData(d); }, () => setFailed(true)); }, [batch.batch_id, filter, page]);
  useEffect(() => { load(); }, [load]);
  const issues = batch.total_rows - batch.valid_rows;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="sa-h3">{filter === 'valid' ? 'Preview: records that will be imported' : filter === 'issues' ? 'Rows with problems' : 'All rows'}</h2>
        <Segmented label="Rows to show" value={filter} onChange={(f) => { setFilter(f); setPage(1); }}
          options={[{ value: 'issues', label: 'Problems', count: issues }, { value: 'valid', label: 'Ready to import', count: batch.valid_rows }, { value: 'all', label: 'All', count: batch.total_rows }]} />
      </div>
      <Panel className="overflow-hidden">
        {failed ? <ErrorState onRetry={load} /> : !data ? <div className="p-5"><Skeleton h={18} /></div> : data.rows.length === 0 ? (
          <EmptyState compact icon={CircleCheck} title={filter === 'issues' ? 'No problems found' : 'No rows'}>{filter === 'issues' ? 'Every row passed validation.' : ''}</EmptyState>
        ) : (
          <>
            <div className="sa-tablewrap">
              <table className="sa-table">
                <caption className="sa-sr-only">Import rows</caption>
                <thead><tr><th scope="col">Row</th><th scope="col">Resident</th><th scope="col">Block / Lot</th><th scope="col">Result</th></tr></thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.row_number}>
                      <td className="sa-num">{r.row_number}</td>
                      <td><p className="sa-rowtitle">{r.full_name || '—'}</p><p className="sa-meta">{r.email || '—'}</p></td>
                      <td className="sa-num">{r.block_number || '—'} / {r.lot_number || '—'}</td>
                      <td><Badge tone={RESULT_TONE[r.result]} dot>{RESULT_LABEL[r.result]}</Badge>{r.reason ? <p className="sa-meta">{r.reason}</p> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="sa-pager">
              <span>{data.total} row{data.total === 1 ? '' : 's'}</span>
              {pages > 1 ? (
                <span className="flex items-center gap-2">
                  <Button size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
                  <span className="sa-num">Page {page} of {pages}</span>
                  <Button size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button>
                </span>
              ) : null}
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------------ history */
function HistoryTab({ revision, onReview }: { revision: number; onReview: (id: number) => void }) {
  const [rows, setRows] = useState<ImportBatch[] | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => { residentRecordsApi.history().then((r) => { setFailed(false); setRows(r); }, () => setFailed(true)); }, []);
  useEffect(() => { load(); }, [load, revision]);
  if (failed) return <ErrorState onRetry={load} />;
  if (!rows) return <Panel className="p-5"><Skeleton h={18} /></Panel>;
  if (rows.length === 0) return <Panel><EmptyState icon={History} title="No imports yet">Files you upload appear here with how many residents were imported.</EmptyState></Panel>;
  const tone: Record<ImportBatch['status'], Tone> = { Validated: 'amber', Imported: 'sage', Discarded: 'neutral' };
  return (
    <Panel className="overflow-hidden">
      <div className="sa-tablewrap">
        <table className="sa-table">
          <caption className="sa-sr-only">Upload and import history</caption>
          <thead><tr><th scope="col">File</th><th scope="col">Uploaded</th><th scope="col">Rows</th><th scope="col">Valid</th><th scope="col" className="hidden md:table-cell">Problems</th><th scope="col">Imported</th><th scope="col">Status</th><th scope="col"><span className="sa-sr-only">Action</span></th></tr></thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.batch_id}>
                <td><p className="sa-rowtitle">{b.filename}</p><p className="sa-meta">by {b.uploaded_by ?? 'a removed account'}</p></td>
                <td className="sa-small">{b.uploaded_at ? fmtDateTime(b.uploaded_at) : '—'}</td>
                <td className="sa-num">{b.total_rows}</td>
                <td className="sa-num">{b.valid_rows}</td>
                <td className="hidden md:table-cell sa-num">{b.duplicate_rows + b.invalid_rows + b.missing_rows}</td>
                <td className="sa-num">{b.imported_rows}</td>
                <td><Badge tone={tone[b.status]} dot>{b.status === 'Validated' ? 'Awaiting confirmation' : b.status}</Badge></td>
                <td className="sa-right">{b.status === 'Validated' ? <Button size="sm" variant="primary" onClick={() => onReview(b.batch_id)}>Review</Button> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
