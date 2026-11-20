import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Info, Lock, MessageSquare, Send, ShieldCheck } from 'lucide-react';
import { fromServer } from '../../../live/dates';
import { reportIdOf } from '../../../live/refs';
import { fmtDate } from '../../../preview/lib/format';
import { MessageThread } from '../../../admin/components/MessageThread';
import { Screen } from '../../components/Screen';
import { Callout, ErrorState, FormError, ListSkeleton, NotFoundState, Pill } from '../../components/ui';
import { residentPath } from '../../config';
import { useResidentData } from '../../data/context';
import { useCaseConversation } from '../../lib/useCaseConversation';
import { useBack, usePageTitle, useSubmit } from '../../lib/hooks';
import { OwnershipVerificationCard } from './OwnershipVerificationCard';

/** Messenger-style conversation view opened from Home, a notification, or a resident report. */
export default function ConversationPage() {
  const { conversationId } = useParams();
  return <ConversationContent key={conversationId} conversationId={conversationId} />;
}

function ConversationContent({ conversationId }: { conversationId: string | undefined }) {
  usePageTitle('Conversation');
  const navigate = useNavigate();
  const { state } = useResidentData();
  const { conversation: c, loading, error: loadError, readError, valid, refresh, send } = useCaseConversation(conversationId);
  const [text, setText] = useState('');
  const [showInfo, setShowInfo] = useState(false);
  const { pending, error, run } = useSubmit();

  const report = c ? state.reports.find((r) => reportIdOf(r.id) === (c.my_report_id ?? c.report_id)) : undefined;
  const back = report ? `/reports/${report.id}` : '/messages';
  const goBack = useBack(residentPath(back));

  if (!valid) return <Screen title="Conversation"><NotFoundState what="conversation" /></Screen>;
  if (loading) return <Screen title="Conversation"><ListSkeleton rows={3} /></Screen>;
  if (!c) return <Screen title="Conversation"><ErrorState onRetry={() => { void refresh(); }}>{loadError}</ErrorState></Screen>;

  const sendMessage = async () => {
    const trimmed = text.trim();
    if (!trimmed || pending || !c.can_reply) return;
    if (await run(() => send(trimmed))) {
      setText('');
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void sendMessage();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  };

  const headerTitle = c.kind === 'bridge' ? 'Direct Conversation' : 'Subdivision Administration';

  return (
    <div className="mx-auto flex h-[100dvh] w-full max-w-[600px] min-w-0 flex-col overflow-hidden overflow-x-hidden bg-white sm:my-3 sm:h-[calc(100dvh-1.5rem)] sm:rounded-2xl sm:border sm:border-[#e7e2da] sm:shadow-sm">
      {/* Fixed Chat Header */}
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-[#e7e2da] bg-white px-3 py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <button
            type="button"
            onClick={goBack}
            aria-label="Back"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#44403c] transition-colors hover:bg-[#f5f0e8]"
          >
            <ArrowLeft size={19} aria-hidden="true" />
          </button>

          <div
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#b45309] text-white shadow-xs"
          >
            <ShieldCheck size={18} />
          </div>

          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-1.5">
              <h1 className="m-0 truncate text-sm font-bold text-[#1c1917] sm:text-base">{headerTitle}</h1>
              <span className="shrink-0">
                <Pill tone={c.can_reply ? 'sage' : 'neutral'} dot>
                  {c.can_reply ? 'Open' : 'Closed'}
                </Pill>
              </span>
            </div>
            <p className="m-0 truncate text-xs text-[#78716c]">
              {c.kind === 'bridge' ? 'Owner & finder coordination' : 'Official subdivision support'}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {report ? (
            <Link
              to={residentPath(`/reports/${report.id}`)}
              className="inline-flex h-8 items-center gap-1 rounded-full border border-[#e7e2da] bg-[#faf6f0] px-2.5 text-xs font-medium text-[#292524] no-underline transition-colors hover:bg-[#f0e9df]"
            >
              <span>Report</span>
              <ExternalLink size={12} aria-hidden="true" />
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => navigate(residentPath('/messages'))}
              className="inline-flex h-8 items-center rounded-full border border-[#e7e2da] bg-[#faf6f0] px-2.5 text-xs font-medium text-[#292524] transition-colors hover:bg-[#f0e9df]"
            >
              All
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowInfo((v) => !v)}
            aria-label="Conversation information"
            aria-expanded={showInfo}
            className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${showInfo ? 'bg-[#fef3c7] text-[#b45309]' : 'text-[#57534e] hover:bg-[#f5f0e8]'
              }`}
          >
            <Info size={18} aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* Compact Conversation Information Strip */}
      <div className="shrink-0 border-b border-[#e7e2da] bg-[#faf6f0] px-3.5 py-2 text-xs text-[#57534e]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {c.report_ref ? (
              <span className="rounded-md bg-[#ede8df] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[#1c1917]">
                {c.report_ref}
              </span>
            ) : (
              <span className="rounded-md bg-[#ede8df] px-1.5 py-0.5 text-[11px] font-medium text-[#1c1917]">
                General Inquiry
              </span>
            )}
            {c.report_category ? <span className="truncate font-medium text-[#292524]">· {c.report_category}</span> : null}
            {c.case_status ? <span className="text-[#78716c]">· {c.case_status}</span> : null}
          </div>
          <span className="text-[11px] font-medium text-[#78716c]">
            {c.can_reply ? 'Active' : 'Closed'}
          </span>
        </div>

        {showInfo ? (
          <div className="mt-2 space-y-1 break-words [overflow-wrap:anywhere] border-t border-[#e7e2da] pt-2 text-xs text-[#57534e]">
            <p className="m-0 font-semibold text-[#1c1917]">{c.title}</p>
            {c.subtitle ? <p className="m-0">{c.subtitle}</p> : null}
            <p className="m-0">
              Participants: {c.people.map((p) => `${p.me ? 'You' : p.name}${p.label ? ` (${p.label})` : ''}`).join(', ')}
            </p>
            <p className="m-0 text-[11px] text-[#78716c]">
              Your account phone number and address are not shared automatically.
            </p>
          </div>
        ) : null}
      </div>

      {/* Notices */}
      {c.kind === 'bridge' && c.can_reply ? (
        <div className="shrink-0 border-b border-[#e7e2da] bg-white px-3 py-2">
          <Callout tone="info" icon={MessageSquare}>
            Linked report coordination: coordinate directly here. The pet remains listed as missing until safe return is confirmed.
          </Callout>
        </div>
      ) : null}
      {loadError || readError ? (
        <div className="shrink-0 px-3 pt-2">
          <Callout tone="amber">{loadError ?? readError}</Callout>
        </div>
      ) : null}

      {c.verification && c.verification.your_pet ? (
        <OwnershipVerificationCard v={c.verification} onAnswered={refresh} />
      ) : c.report_photos && c.report_photos.length > 0 ? (
        <div className="shrink-0 border-b border-[#e7e2da] bg-[#faf6f0] px-3 py-2.5 sm:px-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-[#57534e]">
              Reported animal {c.report_ref ? `· ${c.report_ref}` : ''}
            </span>
            {report ? (
              <Link
                to={residentPath(`/reports/${report.id}`)}
                className="text-xs font-semibold text-[#b45309] no-underline hover:underline"
              >
                View report
              </Link>
            ) : null}
          </div>
          <div className="mt-1.5 flex gap-2 overflow-x-auto">
            {c.report_photos.slice(0, 2).map((url, i) => (
              <a key={url} href={url} target="_blank" rel="noreferrer" className="shrink-0">
                <img
                  src={url}
                  alt={`Reported animal photo ${i + 1}`}
                  loading="lazy"
                  className="h-16 w-16 rounded-lg border border-[#e7e2da] object-cover"
                />
              </a>
            ))}
          </div>
        </div>
      ) : null}

      {/* Scrollable Messenger Chat Area */}
      <MessageThread
        linkPrefix={residentPath('')}
        messages={c.messages.map((m) => ({
          id: m.message_id,
          kind: m.kind,
          mine: m.mine,
          senderName: m.sender_name,
          label: m.label,
          at: m.at ? fromServer(m.at) : '',
          body: m.body,
          deliveryStatus: m.delivery_status,
        }))}
        emptyText={
          c.started_by_resident
            ? 'No messages yet. Write your first message to the Subdivision Administration below.'
            : 'No messages yet. Your Subdivision Leader opened this conversation about your report.'
        }
      />

      {/* Fixed Bottom Composer or Closed Notice */}
      {c.can_reply ? (
        <form
          className="shrink-0 border-t border-[#e7e2da] bg-white px-3 py-2.5"
          onSubmit={submit}
          noValidate
        >
          {error ? <div className="mb-2"><FormError message={error} /></div> : null}
          <div className="flex min-w-0 items-end gap-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              aria-label="Write a message"
              placeholder="Write a message… (Enter to send)"
              maxLength={2000}
              rows={1}
              disabled={pending}
              className="max-h-28 min-h-[42px] min-w-0 flex-1 resize-none rounded-2xl border border-[#ddd5ca] bg-[#faf6f0] px-3.5 py-2.5 text-sm leading-snug text-[#1c1917] placeholder:text-[#78716c] focus:border-[#b45309] focus:bg-white focus:outline-none"
            />
            <button
              type="submit"
              aria-label="Send message"
              disabled={!text.trim() || pending}
              className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-[#b45309] text-white shadow-xs transition-colors hover:bg-[#9a3412] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Send size={17} aria-hidden="true" />
            </button>
          </div>
        </form>
      ) : (
        <div
          className="shrink-0 border-t border-[#e7e2da] bg-[#faf6f0] px-4 py-3 text-xs text-[#57534e]"
          role="status"
          aria-label="Conversation closed"
        >
          <div className="flex items-start gap-2">
            <Lock size={15} className="mt-0.5 shrink-0 text-[#78716c]" aria-hidden="true" />
            <div className="min-w-0">
              <p className="m-0 font-semibold text-[#1c1917]">Conversation closed</p>
              <p className="m-0 mt-0.5">
                {c.close_trigger === 'case_closed'
                  ? `This conversation was automatically closed because the associated case is ${c.case_status === 'Resolved' ? 'resolved' : 'completed/closed'}.`
                  : c.ended_reason ?? 'This conversation has been closed.'}
                {c.closed_at ? ` Closed on ${fmtDate(fromServer(c.closed_at))}.` : ''} You can still read previous messages, but sending new messages is disabled.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
