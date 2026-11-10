import { useState, type FormEvent } from 'react';
import { Clock, Mail, MapPin, MessageSquareText, Phone } from 'lucide-react';
import { Field, Select, Textarea } from '../../components/form';
import { Screen } from '../../components/Screen';
import { Button, Callout, EmptyState, FormError, LinkButton } from '../../components/ui';
import { residentPath } from '../../config';
import { useResidentData } from '../../data/context';
import { useFormFocus, useSubmit } from '../../lib/hooks';
import { useOffice } from '../../lib/useOffice';

const TOPICS = ['A report I made', 'A lost or found notice', 'An ownership claim', 'My account or privacy', 'Something else'];

/** R39 — Contact the subdivision: the office's details and, where the app can send one, a message form. */
export default function ContactPage() {
  const { dispatch, capabilities } = useResidentData();
  const { office } = useOffice();
  const { ref, invalid } = useFormFocus();
  const { pending, error, run } = useSubmit();
  const [topic, setTopic] = useState('');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Partial<Record<'topic' | 'message', string>>>({});
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <Screen title="Contact the subdivision" back="/profile">
        <EmptyState tone="sage" icon={MessageSquareText} title="Message sent" action={<LinkButton variant="primary" to={residentPath('/profile')}>Back to Profile</LinkButton>}>
          The office replies to the email on your account.
        </EmptyState>
      </Screen>
    );
  }

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    const found: typeof errors = {};
    if (!topic) found.topic = 'Choose what your message is about.';
    if (message.trim().length < 10) found.message = 'Write a few words (at least 10 characters).';
    setErrors(found);
    if (Object.keys(found).length > 0) { invalid(); return; }
    if (await run(async () => { await dispatch({ type: 'contact/send', topic, message: message.trim() }); })) setSent(true);
  };

  return (
    <Screen
      title="Contact the subdivision"
      back="/profile"
      footer={capabilities.messageOffice ? <Button type="submit" form="contact-form" variant="primary" block loading={pending}>Send message</Button> : undefined}
    >
      {office ? (
        <section className="rs-office" aria-label="Office details">
          <p className="rs-office__title">{office.name}</p>
          <ul>
            {office.phone ? <li><Phone size={17} aria-hidden="true" /><span>{office.phone}</span></li> : null}
            {office.email ? <li><Mail size={17} aria-hidden="true" /><span>{office.email}</span></li> : null}
            {office.hours ? <li><Clock size={17} aria-hidden="true" /><span>{office.hours}</span></li> : null}
            {office.address ? <li><MapPin size={17} aria-hidden="true" /><span>{office.address}</span></li> : null}
          </ul>
        </section>
      ) : (
        <Callout tone="info" title="The office has not added its contact details yet.">Ask the guardhouse, or your Subdivision Leader, how to reach the office.</Callout>
      )}

      <Callout tone="amber" title="Not for emergencies.">If someone is in danger or hurt right now, call local emergency services or tell the guardhouse.</Callout>

      {error ? <FormError message={error} /> : null}
      {capabilities.messageOffice ? (
      <form id="contact-form" className="rs-stack" onSubmit={(e) => void submit(e)} noValidate>
        <div ref={ref} className="rs-stack">
          <Field label="What is it about?" required error={errors.topic}>
            <Select value={topic} onChange={(e) => { setTopic(e.target.value); setErrors((p) => ({ ...p, topic: undefined })); }}>
              <option value="">Choose one</option>
              {TOPICS.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </Field>
          <Field label="Your message" required error={errors.message} hint="If it is about a report, include its reference number. Please don’t include passwords.">
            <Textarea value={message} onChange={(e) => { setMessage(e.target.value); setErrors((p) => ({ ...p, message: undefined })); }} maxLength={800} rows={5} />
          </Field>
        </div>
      </form>
      ) : <p className="rs-sub">Sending a message from the app is not available yet. Use the details above, or talk to the guardhouse.</p>}
    </Screen>
  );
}
