import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Inbox, Info, Lock, MessageSquare, Send } from 'lucide-react';
import { fromServer } from '../../live/dates';
import { errorMessage } from '../../preview/lib/errors';
import { fmtDate, fmtDateTime } from '../../preview/lib/format';
import { adminPath } from '../config';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { MessageThread } from '../components/MessageThread';
import { Field, Input, SearchInput, Segmented } from '../components/form';
import { Callout, EmptyState, ErrorState, FormError, PageHeader, Panel, Skeleton } from '../components/layout';
import { adminApi, type ApiInbox, type ApiInboxThread, type ApiInboxThreadView, type InboxFilter } from '../live/api';
import { usePageTitle } from '../lib/hooks';
import { useSubmit } from '../lib/useSubmit';

const POLL_MS = 10_000;
const FILTERS: InboxFilter[] = ['all', 'unread', 'open', 'closed'];
const FILTER_LABEL: Record<InboxFilter, string> = { all: 'All Conversations', unread: 'Unread', open: 'Open', closed: 'Closed' };
const at = (iso: string | null) => (iso ? fromServer(iso) : '');

/**
 * Messages: the Subdivision Administration's inbox of resident conversations (about a report, or general). The server decides who sees
 * what (this subdivision only), refuses writing in a closed conversation, and closes a report's conversation itself when the case is
 * resolved or closed. This screen only shows that.
 */
export default function MessagesPage() {
  usePageTitle('Messages');
  const { threadId } = useParams();
  const [params, setParams] = useSearchParams();
  const status: InboxFilter = FILTERS.includes(params.get('status') as InboxFilter) ? (params.get('status') as InboxFilter) : 'all';
  const q = params.get('q') ?? '';
  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) { if (!v || v === 'all') next.delete(k); else next.set(k, v); }
    setParams(next, { replace: true });
  };

  const [inbox, setInbox] = useState<ApiInbox | null>(null);
  const [error, setError] = useState<string | null>(null);
  const turn = useRef(0);
  const load = useCallback(async () => {
    const mine = ++turn.current;
    try {
      const res = await adminApi.inbox(status, q);
      if (mine === turn.current) { setInbox(res); setError(null); }
    } catch (err) { if (mine === turn.current) setError(errorMessage(err)); }
  }, [q, status]);

  useEffect(() => {
    const first = setTimeout(() => { void load(); }, q ? 250 : 0);      // a short pause while typing a search
    const refresh = () => { if (document.visibilityState === 'visible') void load(); };
    const timer = setInterval(refresh, POLL_MS);
    document.addEventListener('visibilitychange', refresh);
    return () => { clearTimeout(first); clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [load, q]);

  const selected = threadId ? Number(threadId) : null;
  const linkTo = (id: number) => adminPath(`/messages/${id}${params.toString() ? `?${params.toString()}` : ''}`);

  return (
    <div>
      <PageHeader title="Messages" description="Conversations residents of your subdivision started with the administration, or that you opened from a case. A conversation linked to a case closes automatically when the case is resolved or closed." />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SearchInput className="w-full sm:w-[340px]" aria-label="Search conversations" placeholder="Search subject, report reference or resident" value={q} onChange={(e) => set({ q: e.target.value })} />
        <Segmented label="Show conversations" value={status} onChange={(s) => set({ status: s })}
          options={FILTERS.map((f) => ({ value: f, label: FILTER_LABEL[f], count: inbox?.counts[f] }))} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <div className={selected ? 'hidden lg:block' : undefined}>
          <Panel>
            {error && !inbox ? <ErrorState onRetry={() => { void load(); }} message={error} /> : !inbox ? (
              <div className="flex flex-col gap-3 p-4" role="status" aria-label="Loading conversations"><Skeleton h={56} /><Skeleton h={56} /><Skeleton h={56} /></div>
            ) : inbox.items.length === 0 ? (
              <EmptyState icon={Inbox} title={q || status !== 'all' ? 'No conversation matches' : 'No conversations yet'} compact>
                {q || status !== 'all' ? 'Try another filter or search.' : 'When a resident messages the administration, the conversation appears here.'}
              </EmptyState>
            ) : (
              <ul className="m-0 list-none p-0" aria-label="Conversations">
                {inbox.items.map((t) => <InboxRow key={t.thread_id} t={t} active={t.thread_id === selected} to={linkTo(t.thread_id)} />)}
              </ul>
            )}
            {error && inbox ? <p className="sa-small sa-text-3 p-3" role="status">Could not refresh: {error}</p> : null}
          </Panel>
        </div>
        <div className={selected ? undefined : 'hidden lg:block'}>
          {selected ? <ThreadPane key={selected} threadId={selected} onChanged={load} backTo={adminPath(`/messages${params.toString() ? `?${params.toString()}` : ''}`)} /> : (
            <Panel><EmptyState icon={MessageSquare} title="Choose a conversation" compact>Pick a conversation on the left to read it and reply.</EmptyState></Panel>
          )}
        </div>
      </div>
    </div>
  );
}

function InboxRow({ t, active, to }: { t: ApiInboxThread; active: boolean; to: string }) {
  const closed = t.status === 'closed';
  return (
    <li className="border-b border-[var(--sa-line)] last:border-b-0">
      <Link to={to} aria-current={active ? 'true' : undefined}
        className={`flex flex-col gap-1 px-4 py-3 no-underline ${active ? 'bg-[var(--sa-brand-soft)]' : 'hover:bg-[var(--sa-sand)]'}`}>
        <span className="flex items-start justify-between gap-2">
          <span className={`min-w-0 truncate ${t.unread > 0 ? 'font-bold' : 'font-semibold'}`}>{t.title}</span>
          <span className="sa-small sa-text-3 shrink-0">{t.last_at ? fmtDateTime(at(t.last_at)) : ''}</span>
        </span>
        <span className="sa-small sa-text-2 truncate">{t.subtitle || 'Resident'}</span>
        <span className="sa-small sa-text-3 truncate">{t.last_text || (closed ? t.ended_reason : 'No messages yet')}</span>
        <span className="flex flex-wrap items-center gap-2">
          <Badge tone={closed ? 'neutral' : 'sage'} dot>{closed ? 'Closed' : 'Open'}</Badge>
          {closed && t.close_trigger === 'case_closed' ? <Badge tone="neutral" icon={Lock}>Auto-closed: case {t.case_status === 'Resolved' ? 'resolved' : 'closed'}</Badge> : null}
          {t.report_ref ? <Badge tone="ink">{t.report_ref}</Badge> : <Badge tone="neutral">General</Badge>}
          {t.unread > 0 ? <Badge tone="brand">{t.unread} unread</Badge> : null}
        </span>
      </Link>
    </li>
  );
}

function ThreadPane({ threadId, onChanged, backTo }: { threadId: number; onChanged: () => Promise<void>; backTo: string }) {
  const navigate = useNavigate();
  const [view, setView] = useState<ApiInboxThreadView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [showInfo, setShowInfo] = useState(false);
  const [closing, setClosing] = useState(false);
  const [reason, setReason] = useState('');
  const send = useSubmit();
  const close = useSubmit();
  const pendingKey = useRef<{ body: string; key: string } | null>(null);
  const changed = useRef(onChanged);
  useEffect(() => { changed.current = onChanged; });

  const markRead = useCallback(async (v: ApiInboxThreadView) => {
    if (v.unread > 0 && v.messages.length) {
      await adminApi.readThread(v.thread_id, Math.max(...v.messages.map((m) => m.message_id)));
      void changed.current();
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const v = await adminApi.inboxThread(threadId);
      setView(v);
      setLoadError(null);
      if (document.visibilityState === 'visible') await markRead(v);
    } catch (err) { setLoadError(errorMessage(err)); }
  }, [markRead, threadId]);

  useEffect(() => {
    const first = setTimeout(() => { void refresh(); }, 0);
    const tick = () => { if (document.visibilityState === 'visible') void refresh(); };
    const timer = setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => { clearTimeout(first); clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, [refresh]);

  const submitMessage = async () => {
    const body = text.trim();
    if (!body || !view?.can_reply || send.pending) return;
    if (!pendingKey.current || pendingKey.current.body !== body) pendingKey.current = { body, key: `inbox-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}` };
    const key = pendingKey.current.key;
    const ok = await send.run(async () => { setView(await adminApi.sendInboxMessage(threadId, body, key)); });
    if (ok) { pendingKey.current = null; setText(''); void onChanged(); } else void refresh();
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void submitMessage();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submitMessage();
    }
  };

  const doClose = async () => {
    const ok = await close.run(async () => { setView(await adminApi.closeInboxThread(threadId, reason)); });
    if (ok) { setClosing(false); setReason(''); void onChanged(); }
  };

  if (!view) {
    return <Panel>{loadError ? <ErrorState onRetry={() => { void refresh(); }} message={loadError} /> : <div className="flex flex-col gap-3 p-4" role="status" aria-label="Loading conversation"><Skeleton h={24} /><Skeleton h={80} /></div>}</Panel>;
  }
  const closed = view.status === 'closed';
  const residentLabel = view.subtitle || view.title || 'Resident';
  const initials = residentLabel.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || 'R';

  return (
    <Panel className="flex h-[calc(100dvh-13rem)] min-h-[28rem] flex-col overflow-hidden p-0">
      {/* Compact Messenger-Style Header */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--sa-line)] bg-white px-3.5 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <button
            type="button"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#44403c] hover:bg-[#f5f0e8] lg:hidden"
            onClick={() => navigate(backTo)}
            aria-label="All conversations"
          >
            <ArrowLeft size={18} aria-hidden="true" />
          </button>
          <div
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#d6cfc7] bg-[#ebe5dc] text-xs font-bold text-[#292524]"
          >
            {initials}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="m-0 truncate text-sm font-bold text-[#1c1917] sm:text-base">{residentLabel}</h2>
              <Badge tone={closed ? 'neutral' : 'sage'} dot>{closed ? 'Closed' : 'Open'}</Badge>
            </div>
            <p className="m-0 truncate text-xs text-[#78716c]">{view.title}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {view.report_ref ? (
            <Link
              className="inline-flex h-8 items-center gap-1 rounded-full border border-[#e7e2da] bg-[#faf6f0] px-2.5 text-xs font-medium text-[#292524] no-underline hover:bg-[#f0e9df]"
              to={adminPath(`/cases/${view.report_ref}`)}
            >
              <span>Case {view.report_ref}</span>
              <ExternalLink size={12} aria-hidden="true" />
            </Link>
          ) : null}
          {!closed && view.can_reply && !closing ? (
            <Button size="sm" variant="ghost" onClick={() => setClosing(true)}>Close</Button>
          ) : null}
          <button
            type="button"
            onClick={() => setShowInfo((v) => !v)}
            aria-label="Conversation information"
            aria-expanded={showInfo}
            className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
              showInfo ? 'bg-[#fef3c7] text-[#b45309]' : 'text-[#57534e] hover:bg-[#f5f0e8]'
            }`}
          >
            <Info size={17} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Compact Conversation Information Strip */}
      <div className="shrink-0 border-b border-[var(--sa-line)] bg-[#faf6f0] px-3.5 py-2 text-xs text-[#57534e]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-md bg-[#ede8df] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[#1c1917]">
              {view.report_ref || 'General'}
            </span>
            {view.report_category ? <span className="font-medium text-[#292524]">· {view.report_category}</span> : null}
            {view.case_status ? <span>· {view.case_status}</span> : null}
          </div>
          <span className="text-[11px] text-[#78716c]">
            Started {view.started_by_resident ? 'by resident' : 'by administration'}
          </span>
        </div>
        {showInfo ? (
          <div className="mt-2 space-y-1 border-t border-[var(--sa-line)] pt-2 text-xs">
            <p className="m-0 text-[#57534e]">
              Messages to a resident about a case are recorded in the case Activity. Phone numbers and addresses are never added automatically.
            </p>
          </div>
        ) : null}
      </div>

      {/* Scrollable Messenger Chat Area */}
      <MessageThread
        messages={view.messages.map((m) => ({
          id: m.message_id,
          kind: m.kind,
          mine: m.mine,
          senderName: m.sender_name,
          label: m.label,
          at: at(m.at),
          body: m.body,
        }))}
      />

      {/* Close Confirmation Drawer */}
      {!closed && closing ? (
        <div className="shrink-0 border-t border-[var(--sa-line)] bg-white p-3">
          <Field label="Reason for closing" optional hint="The resident reads this. They can still read the conversation, and can start a new one.">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
          </Field>
          {close.error ? <FormError message={close.error} /> : null}
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="primary" loading={close.pending} onClick={() => { void doClose(); }}>Close conversation</Button>
            <Button size="sm" onClick={() => setClosing(false)} disabled={close.pending}>Cancel</Button>
          </div>
        </div>
      ) : null}

      {/* Fixed Bottom Composer or Closed/Read-Only Notice */}
      {!closed && view.can_reply ? (
        <form className="shrink-0 border-t border-[var(--sa-line)] bg-white px-3 py-2.5" onSubmit={submit} noValidate>
          {send.error ? <div className="mb-2"><FormError message={send.error} /></div> : null}
          <div className="flex items-end gap-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              aria-label="Reply"
              placeholder="Write a reply… (Enter to send)"
              maxLength={2000}
              rows={1}
              disabled={send.pending}
              className="max-h-28 min-h-[42px] flex-1 resize-none rounded-2xl border border-[#ddd5ca] bg-[#faf6f0] px-3.5 py-2.5 text-sm leading-snug text-[#1c1917] placeholder:text-[#78716c] focus:border-[#b45309] focus:bg-white focus:outline-none"
            />
            <button
              type="submit"
              aria-label="Send reply"
              disabled={!text.trim() || send.pending}
              className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-[#b45309] text-white shadow-xs transition-colors hover:bg-[#9a3412] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Send size={17} aria-hidden="true" />
            </button>
          </div>
        </form>
      ) : closed ? (
        <div className="shrink-0 border-t border-[var(--sa-line)] bg-[#faf6f0] px-4 py-3 text-xs text-[#57534e]" role="status">
          <div className="flex items-start gap-2">
            <Lock size={15} className="mt-0.5 shrink-0 text-[#78716c]" aria-hidden="true" />
            <div>
              <p className="m-0 font-semibold text-[#1c1917]">Conversation closed</p>
              <p className="m-0 mt-0.5">
                {view.close_trigger === 'case_closed'
                  ? `Closed automatically because the associated case was ${view.case_status === 'Resolved' ? 'resolved' : 'closed'}.`
                  : view.ended_reason}
                {view.closed_at ? ` Closed on ${fmtDate(at(view.closed_at))}.` : ''} History remains readable; no new messages can be sent.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="shrink-0 border-t border-[var(--sa-line)] bg-[#faf6f0] p-3">
          <Callout>This case is handled by another officer, so only they can reply here.</Callout>
        </div>
      )}

      {loadError ? <p className="sa-small sa-text-3 m-0 px-3 pb-2" role="status">Could not refresh: {loadError}</p> : null}
    </Panel>
  );
}
