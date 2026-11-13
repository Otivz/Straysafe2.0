import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { MessageSquare, Send } from 'lucide-react';
import { fromServer } from '../../../live/dates';
import { reportIdOf } from '../../../live/refs';
import { fmtDateTime } from '../../../preview/lib/format';
import { Screen } from '../../components/Screen';
import { Textarea } from '../../components/form';
import { Button, Callout, ErrorState, FormError, LinkButton, ListSkeleton, NotFoundState } from '../../components/ui';
import { residentPath } from '../../config';
import { useResidentData } from '../../data/context';
import { useCaseConversation } from '../../lib/useCaseConversation';
import { useSubmit } from '../../lib/hooks';

/** A contextual conversation opened from Home, a notification or the resident's own report. */
export default function ConversationPage() {
  const { conversationId } = useParams();
  return <ConversationContent key={conversationId} conversationId={conversationId} />;
}

function ConversationContent({ conversationId }: { conversationId: string | undefined }) {
  const { state } = useResidentData();
  const { conversation: c, loading, error: loadError, readError, valid, refresh, send } = useCaseConversation(conversationId);
  const [text, setText] = useState('');
  const { pending, error, run } = useSubmit();
  const report = c ? state.reports.find((r) => reportIdOf(r.id) === c.my_report_id) : undefined;
  const back = report ? `/reports/${report.id}` : '/home';

  if (!valid) return <Screen title="Conversation"><NotFoundState what="conversation" /></Screen>;
  if (loading) return <Screen title="Conversation"><ListSkeleton rows={3} /></Screen>;
  if (!c) return <Screen title="Conversation"><ErrorState onRetry={() => { void refresh(); }}>{loadError}</ErrorState></Screen>;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || pending) return;
    if (await run(() => send(text))) setText('');
  };

  return (
    <Screen title="Conversation" subtitle={c.kind === 'bridge' ? 'Direct conversation between owner and finder' : 'With your Subdivision Leader'} back={back}>
      <header className="rs-stack-sm">
        <h2 className="rs-title rs-title--sm">{c.title}</h2>
        <p className="rs-sub">{c.subtitle}</p>
        <p className="rs-hint">{c.people.map((p) => `${p.me ? 'You' : p.name}${p.label ? ` (${p.label})` : ''}`).join(' · ')}</p>
      </header>
      {c.kind === 'bridge' && c.can_reply ? <Callout tone="info" icon={MessageSquare}>The Subdivision Leader linked the reports so you two can coordinate directly here. The pet is still missing until its owner confirms safe return.</Callout> : null}
      {!c.can_reply ? <Callout tone="info" title="This conversation has ended.">{c.ended_reason ?? 'You can still read the messages below.'}</Callout> : null}
      {loadError || readError ? <Callout tone="amber">{loadError ?? readError}</Callout> : null}
      {c.messages.length === 0 ? <p className="rs-sub">No messages yet. Your Subdivision Leader opened this conversation about your report.</p> : (
        <ol className="rs-thread" aria-label="Case conversation messages" aria-live="polite">
          {c.messages.map((m) => m.kind === 'system' ? (
            <li key={m.message_id}><p className="rs-hint">{m.body}</p><p className="rs-meta">{fmtDateTime(fromServer(m.at))}</p></li>
          ) : (
            <li key={m.message_id} className={`rs-msg${m.mine ? ' rs-msg--mine' : ''}`}>
              <p className="rs-msg__text">{m.body}</p>
              <p className="rs-msg__meta">{m.mine ? 'You' : m.sender_name ?? m.label}{m.at ? ` · ${fmtDateTime(fromServer(m.at))}` : ''}</p>
            </li>
          ))}
        </ol>
      )}
      {c.can_reply ? (
        <form className="rs-composer" onSubmit={(e) => void submit(e)} noValidate>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} aria-label="Write a message" placeholder="Write a message" maxLength={1000} rows={3} disabled={pending} />
          <Button type="submit" variant="primary" icon={Send} loading={pending} disabled={!text.trim()}>Send message</Button>
          {error ? <FormError message={error} /> : null}
          <p className="rs-hint">Your account phone number and address are not shared automatically. Share only what is needed to coordinate.</p>
        </form>
      ) : null}
      {report ? <LinkButton block to={residentPath(`/reports/${report.id}`)}>View my report</LinkButton> : <LinkButton block to={residentPath('/home')}>Back to Home</LinkButton>}
    </Screen>
  );
}
