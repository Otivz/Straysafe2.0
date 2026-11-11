import { useState, type FormEvent } from 'react';
import { HeartHandshake, MessagesSquare, Send } from 'lucide-react';
import { fmtDateTime } from '../../preview/lib/format';
import { useResidentData } from '../data/context';
import type { ResidentAction } from '../data/reducer';
import type { Coordination, Notice } from '../data/types';
import { useSubmit } from '../lib/hooks';
import { useCoordinationMessages } from '../lib/useCoordinationMessages';
import { Textarea } from './form';
import { useToast } from './toast';
import { Button, Callout, FormError, ListSkeleton } from './ui';

/** The private messages of one conversation, and (only while both agreed) the box to write in. Read-only once the Leader was asked or it finished. */
function MessageThread({ coordination: c, readOnly }: { coordination: Coordination; readOnly: boolean }) {
  const { messages, status, error: loadError, send } = useCoordinationMessages(c.id, !readOnly);
  const [text, setText] = useState('');
  const { pending, error, run } = useSubmit();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    if (await run(async () => { await send(value); })) setText('');          // a refused message stays in the box, with the server's reason above it
  };

  if (readOnly && status === 'ready' && messages.length === 0) return null;     // nothing was said: nothing to show

  return (
    <div className="rs-stack-sm">
      {status === 'loading' ? <ListSkeleton rows={1} /> : null}
      {loadError ? <FormError message={loadError} /> : null}
      {status === 'ready' && messages.length === 0 ? <p className="rs-hint">Say hello to {c.otherName}. Only the two of you can read this.</p> : null}
      {messages.length > 0 ? (
        <ol className="rs-thread" aria-label={`Messages with ${c.otherName}`} aria-live="polite">
          {messages.map((m) => (
            <li key={m.message_id} className={`rs-msg${m.is_mine ? ' rs-msg--mine' : ''}`}>
              <p className="rs-msg__text">{m.text}</p>
              <p className="rs-msg__meta">{m.is_mine ? 'You' : c.otherName}{m.sent_at ? ` · ${fmtDateTime(m.sent_at)}` : ''}</p>
            </li>
          ))}
        </ol>
      ) : null}
      {!readOnly ? (
        <form className="rs-composer" onSubmit={(e) => void submit(e)} noValidate>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={1000} aria-label={`Write to ${c.otherName}`} placeholder="Write a message" />
          <Button type="submit" variant="primary" icon={Send} loading={pending} disabled={!text.trim()}>Send</Button>
          {error ? <FormError message={error} /> : null}
        </form>
      ) : null}
    </div>
  );
}

/**
 * How the owner and the person who may have the pet get in touch, for ONE possible-recovery report. Both see this, each from their own side.
 * Nothing here marks the pet recovered: that is only the owner's own confirmation ("My pet is home").
 *
 *   nothing agreed   -> "Message {name}" (you agree) or "Ask the Subdivision Leader to help" (no reason needed)
 *   both agreed      -> private messages; the Leader can still be asked to help instead
 *   the Leader asked -> messages are closed, what was said stays readable
 *   finished         -> the Leader finished helping, or the pet is home
 */
export function CoordinationPanel({ notice, coordination: c }: { notice: Notice; coordination: Coordination }) {
  const { dispatch } = useResidentData();
  const toast = useToast();
  const { pending, error, run } = useSubmit();
  const owner = c.youAre === 'owner';
  const pet = notice.petName ?? (owner ? 'your pet' : 'the pet');

  const act = async (action: ResidentAction, done: string) => { if (await run(async () => { await dispatch(action); })) toast.success(done); };
  const askLeader = () => act({ type: 'coordination/mediation', id: c.id }, 'The Subdivision Leader was asked to help');

  if (c.status === 'resolved') {
    return (
      <div className="rs-stack-sm">
        <Callout tone="sage" icon={HeartHandshake} title="This conversation is finished.">{c.resolutionNote ?? 'It is closed.'}</Callout>
        {c.mode !== 'none' ? <MessageThread coordination={c} readOnly /> : null}
      </div>
    );
  }

  if (c.mode === 'leader') {
    return (
      <section className="rs-stack-sm" aria-label={`Getting in touch with ${c.otherName}`}>
        <Callout tone="info" icon={HeartHandshake} title="Your Subdivision Leader is helping.">
          {c.mediationByYou ? `You asked the Subdivision Leader to help you and ${c.otherName} get in touch.` : `${c.otherName} asked the Subdivision Leader to help you both get in touch.`} Direct messages are closed. The Leader will contact you.
        </Callout>
        <MessageThread coordination={c} readOnly />
      </section>
    );
  }

  if (c.mode === 'direct') {
    return (
      <section className="rs-stack-sm" aria-label={`Messages with ${c.otherName}`}>
        <Callout tone="sage" icon={MessagesSquare} title={`You and ${c.otherName} can message each other.`}>Only the two of you can read this. Your phone number and address are not shared.</Callout>
        <MessageThread coordination={c} readOnly={false} />
        {error ? <FormError message={error} /> : null}
        <Button variant="ghost" block loading={pending} onClick={() => void askLeader()}>Ask the Subdivision Leader to help instead</Button>
      </section>
    );
  }

  return (
    <section className="rs-stack-sm" aria-label={`Getting in touch with ${c.otherName}`}>
      {c.otherAgreed ? (
        <Callout tone="info" icon={MessagesSquare} title={`${c.otherName} agreed to message you.`}>Agree too, and you can message each other. Nothing is shared until you do.</Callout>
      ) : c.youAgreed ? (
        <Callout tone="info" icon={MessagesSquare} title={`You agreed to message ${c.otherName}.`}>Waiting for them to agree too. Nothing is shared until they do.</Callout>
      ) : (
        <p className="rs-sub">{owner ? `${c.otherName} may have ${pet}. ` : `${c.otherName} is looking for ${pet}. `}Choose how to get in touch. You never have to say why.</p>
      )}
      {error ? <FormError message={error} /> : null}
      <div className="rs-row-actions">
        {!c.youAgreed ? <Button variant="primary" icon={MessagesSquare} loading={pending} onClick={() => void act({ type: 'coordination/consent', id: c.id, allow: true }, c.otherAgreed ? 'You can message each other now' : `Agreed. ${c.otherName} will be told`)}>Message {c.otherName}</Button> : null}
        <Button icon={HeartHandshake} loading={pending} onClick={() => void askLeader()}>Ask the Subdivision Leader to help</Button>
      </div>
      <p className="rs-hint">Private messages open only when you both agree. The details in your possible-recovery report were shared as explained on the form. If you ask the Subdivision Leader to help, they can use your account contact details to contact you both.</p>
    </section>
  );
}
