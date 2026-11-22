import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { CircleCheck, Eye, SearchX, UserCheck, UserX } from 'lucide-react';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { ConfirmDialog, Dialog } from '../components/Dialog';
import { Field, Segmented, SearchInput, Textarea } from '../components/form';
import { Callout, EmptyState, ErrorState, FormError, PageHeader, Panel, Skeleton } from '../components/layout';
import { useToast } from '../components/toast';
import type { Tone } from '../data/constants';
import { residentApplicationsApi, type Application, type ApplicationDetail, type ApplicationStatus, type MatchResult } from '../live/residentApplications';
import { usePageTitle } from '../lib/hooks';
import { useSubmit } from '../lib/useSubmit';
import { fmtDateTime } from '../../preview/lib/format';
import { errorMessage } from '../../preview/lib/errors';
import { ResidentsTabs } from './ResidentsTabs';

const STATUS_LABEL: Record<ApplicationStatus, string> = {
  PENDING_RESIDENCY_VERIFICATION: 'Awaiting review', PENDING_EMAIL_VERIFICATION: 'Email not verified', ACTIVE: 'Approved', REJECTED: 'Rejected',
};
const STATUS_TONE: Record<ApplicationStatus, Tone> = { PENDING_RESIDENCY_VERIFICATION: 'amber', PENDING_EMAIL_VERIFICATION: 'neutral', ACTIVE: 'sage', REJECTED: 'red' };
const MATCH_TONE: Record<MatchResult, Tone> = { 'Match Found': 'sage', 'Possible Match': 'amber', 'No Match Found': 'neutral' };
const FILTERS: ApplicationStatus[] = ['PENDING_RESIDENCY_VERIFICATION', 'REJECTED', 'ACTIVE', 'PENDING_EMAIL_VERIFICATION'];

/**
 * Residents > Applications: people who registered on their own. Each waits for a residency decision by the Subdivision Leader (or
 * an Admin). The comparison with the official list is only an aid: approving and rejecting stay a person's decision.
 */
export default function ResidentApplicationsPage() {
  usePageTitle('Resident applications');
  const toast = useToast();
  const [status, setStatus] = useState<ApplicationStatus>('PENDING_RESIDENCY_VERIFICATION');
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Awaited<ReturnType<typeof residentApplicationsApi.list>> | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => { const t = setTimeout(() => { setDebounced(q.trim()); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);
  const load = useCallback(() => {
    residentApplicationsApi.list({ status, q: debounced, page }).then((d) => { setFailed(false); setData(d); }, () => setFailed(true));
  }, [status, debounced, page]);
  useEffect(() => { load(); }, [load]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;
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
      <PageHeader title="Resident applications" description="People who registered on their own. Approve only those you have confirmed live in the subdivision; until then they cannot sign in to StraySafe." />
      <ResidentsTabs />
      {failed ? <ErrorState onRetry={load} message="The applications could not be loaded." /> : !data ? (
        <Panel className="p-5"><Skeleton h={18} /><div className="mt-3"><Skeleton h={18} /></div></Panel>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <SearchInput className="w-full sm:w-[340px]" aria-label="Search applications" placeholder="Search name, email, block or lot" value={q} onChange={(e) => setQ(e.target.value)} maxLength={100} />
            <Segmented label="Application status" value={status} onChange={(s) => { setStatus(s); setPage(1); }}
              options={FILTERS.map((s) => ({ value: s, label: STATUS_LABEL[s], count: data.counts[s] }))} />
          </div>
          <Panel className="sa-fade-up overflow-hidden border-[#e7e2da] shadow-xs">
            {data.applications.length === 0 ? (
              q ? <EmptyState icon={SearchX} title="No applications match" action={<Button onClick={() => setQ('')}>Clear search</Button>}>Try another name, email, block or lot.</EmptyState>
                : <EmptyState icon={CircleCheck} title={status === 'PENDING_RESIDENCY_VERIFICATION' ? 'Nothing to review' : 'No applications here'}>
                  {status === 'PENDING_RESIDENCY_VERIFICATION' ? 'New registrations appear here once the applicant has verified their email.' : 'Applications with this status appear here.'}
                </EmptyState>
            ) : (
              <>
                <div className="sa-tablewrap">
                  <table className="sa-table sa-table--rows">
                    <caption className="sa-sr-only">Resident applications, {data.total} results</caption>
                    <thead><tr>
                      <th scope="col">Applicant</th><th scope="col">Block / Lot</th><th scope="col" className="hidden md:table-cell">Contact</th>
                      <th scope="col" className="hidden lg:table-cell">Registered</th><th scope="col">Official list</th><th scope="col">Status</th>
                      <th scope="col"><span className="sa-sr-only">Actions</span></th>
                    </tr></thead>
                    <tbody>
                      {data.applications.map((a) => (
                        <tr key={a.application_id} onClick={() => setOpen(a.application_id)}>
                          <td><p className="sa-rowtitle">{a.full_name}</p><p className="sa-meta">{a.email}{a.email_verified ? ' · email verified' : ' · email not verified'}</p></td>
                          <td className="sa-num">Block {a.block_number}, Lot {a.lot_number}</td>
                          <td className="hidden md:table-cell sa-small sa-num">{a.contact_number ?? '—'}</td>
                          <td className="hidden lg:table-cell sa-small">{a.registered_at ? fmtDateTime(a.registered_at) : '—'}</td>
                          <td>{a.match ? <Badge tone={MATCH_TONE[a.match]} dot>{a.match}</Badge> : null}</td>
                          <td><Badge tone={STATUS_TONE[a.status]} dot>{STATUS_LABEL[a.status]}</Badge></td>
                          <td className="sa-right">
                            <Button size="sm" icon={Eye} onClick={(e) => { e.stopPropagation(); setOpen(a.application_id); }} aria-label={`Review ${a.full_name}`}>
                              {a.status === 'PENDING_RESIDENCY_VERIFICATION' ? 'Review' : 'View'}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="sa-pager">
                  <span>{data.total} application{data.total === 1 ? '' : 's'}</span>
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
      {open !== null ? <ReviewDialog id={open} onClose={() => setOpen(null)} onDecided={(msg) => { setOpen(null); toast.success(msg); load(); window.dispatchEvent(new Event('straysafe:applications-changed')); }} /> : null}
    </div>
  );
}

function ReviewDialog({ id, onClose, onDecided }: { id: number; onClose: () => void; onDecided: (message: string) => void }) {
  const [app, setApp] = useState<ApplicationDetail | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  useEffect(() => {
    let live = true;
    residentApplicationsApi.detail(id).then((d) => { if (live) setApp(d); }, (e) => { if (live) setFailed(errorMessage(e)); });
    return () => { live = false; };
  }, [id]);

  const decided = (a: Application & { email_sent: boolean }, verb: string) =>
    onDecided(`${a.full_name} ${verb}.${a.email_sent ? ' They were emailed.' : ' The email could not be sent; tell them directly.'}`);

  const pendingReview = app?.status === 'PENDING_RESIDENCY_VERIFICATION';
  return (
    <Dialog
      title={app ? app.full_name : 'Application'}
      description={app ? `Registered ${app.registered_at ? fmtDateTime(app.registered_at) : ''}` : undefined}
      size="lg"
      onClose={onClose}
      footer={({ requestClose }) => (
        <>
          <Button onClick={requestClose}>Close</Button>
          {pendingReview ? <Button variant="danger" icon={UserX} onClick={() => setRejecting(true)}>Reject</Button> : null}
          {pendingReview ? <Button variant="primary" icon={UserCheck} onClick={() => setApproving(true)}>Approve</Button> : null}
        </>
      )}
    >
      {failed ? <FormError message={failed} /> : !app ? <Skeleton h={18} /> : (
        <div className="grid gap-4">
          <dl className="grid grid-cols-2 gap-3 sa-small">
            <div><dt className="sa-meta">Email</dt><dd>{app.email}</dd></div>
            <div><dt className="sa-meta">Contact number</dt><dd className="sa-num">{app.contact_number ?? '—'}</dd></div>
            <div><dt className="sa-meta">Block / Lot</dt><dd className="sa-num">Block {app.block_number}, Lot {app.lot_number}</dd></div>
            <div><dt className="sa-meta">Email verification</dt><dd>{app.email_verified ? `Verified ${app.email_verified_at ? fmtDateTime(app.email_verified_at) : ''}` : 'Not verified'}</dd></div>
            <div><dt className="sa-meta">Residency verification</dt><dd><Badge tone={STATUS_TONE[app.status]} dot>{STATUS_LABEL[app.status]}</Badge></dd></div>
            {app.reviewed_at ? <div><dt className="sa-meta">Decided</dt><dd>{app.reviewed_by ?? '—'}, {fmtDateTime(app.reviewed_at)}</dd></div> : null}
            {app.resubmit_count ? <div><dt className="sa-meta">Resubmitted</dt><dd>{app.resubmit_count} time{app.resubmit_count === 1 ? '' : 's'}</dd></div> : null}
          </dl>
          {app.rejection_reason ? <Callout tone="red" title="Rejection reason">{app.rejection_reason}</Callout> : null}
          <div>
            <h3 className="sa-h3 mb-2">Official resident list <Badge tone={MATCH_TONE[app.match.result]} dot>{app.match.result}</Badge></h3>
            <p className="sa-meta mb-2">A comparison to help you decide. It never approves or rejects anyone by itself.</p>
            {app.match.candidates.length === 0 ? <p className="sa-small">No record on the official list has this name, or this block and lot.</p> : (
              <ul className="grid gap-2">
                {app.match.candidates.map((c) => (
                  <li key={c.record_id} className="sa-panel p-3 sa-small">
                    <p className="sa-rowtitle">{c.full_name}</p>
                    <p className="sa-meta">Block {c.block_number}, Lot {c.lot_number} · {c.why}{c.email_matches ? ' · same email' : ''} · {c.registration_status}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
      {approving && app ? (
        <ConfirmDialog title={`Approve ${app.full_name}?`} confirmLabel="Approve"
          message="Confirm only after you have checked that this person lives in the subdivision. Their account becomes active and they are emailed."
          onConfirm={async () => { decided(await residentApplicationsApi.approve(app.application_id), 'was approved'); }} onClose={() => setApproving(false)} />
      ) : null}
      {rejecting && app ? <RejectDialog app={app} onClose={() => setRejecting(false)} onDone={(a) => decided(a, 'was rejected')} /> : null}
    </Dialog>
  );
}

function RejectDialog({ app, onClose, onDone }: { app: ApplicationDetail; onClose: () => void; onDone: (a: Application & { email_sent: boolean }) => void }) {
  const [reason, setReason] = useState('');
  const { pending, error, run } = useSubmit();
  const submit = (e: FormEvent) => { e.preventDefault(); void run(async () => { onDone(await residentApplicationsApi.reject(app.application_id, reason.trim())); }); };
  return (
    <Dialog title={`Reject ${app.full_name}?`} description="The applicant is emailed this reason and can correct their details and ask for another review." size="sm" onClose={onClose} onSubmit={submit}
      footer={({ requestClose }) => (<><Button onClick={requestClose} disabled={pending}>Cancel</Button><Button type="submit" variant="danger" loading={pending} disabled={reason.trim().length < 5}>Reject</Button></>)}>
      <div className="grid gap-3">
        {error ? <FormError message={error} /> : null}
        <Field label="Reason" required hint="For example: no resident with this name at this block and lot.">
          <Textarea rows={4} value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}
