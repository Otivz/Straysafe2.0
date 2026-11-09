import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fmtDateTime } from '../../../preview/lib/format';
import { Field, Textarea } from '../../components/form';
import { Screen } from '../../components/Screen';
import { useToast } from '../../components/toast';
import { Button, Callout, ClaimPill, FormError, LinkButton, NotFoundState, Section, UpdateTimeline } from '../../components/ui';
import { residentPath } from '../../config';
import { CLAIM_STATUS, SAMPLE_OFFICE } from '../../data/constants';
import { useResidentData } from '../../data/context';
import { claimById, noticeById, petById } from '../../data/selectors';
import { useFormFocus, useNow, useSubmit } from '../../lib/hooks';

const STEPS = ['Submitted', 'Under review', 'Decision'];

/** R25 — Where an ownership claim stands. Claim states are their own; they never become case statuses. */
export default function ClaimStatusPage() {
  const { state, dispatch } = useResidentData();
  const now = useNow();
  const toast = useToast();
  const claim = claimById(state, useParams().claimId);
  const { ref, invalid } = useFormFocus();
  const { pending, error, run } = useSubmit();
  const [reply, setReply] = useState('');
  const [replyError, setReplyError] = useState<string>();

  if (!claim) return <Screen title="Ownership claim" back="/reports"><NotFoundState what="claim" to="/reports" label="Go to My reports" /></Screen>;

  const notice = noticeById(state, claim.noticeId);
  const pet = petById(state, claim.petId);
  const step = claim.status === 'submitted' ? 0 : claim.status === 'approved' || claim.status === 'rejected' ? 2 : 1;
  const request = claim.updates.find((u) => u.kind === 'message');

  const send = async (ev: FormEvent) => {
    ev.preventDefault();
    if (reply.trim().length < 5) { setReplyError('Write a few words in reply.'); invalid(); return; }
    const ok = await run(async () => { await dispatch({ type: 'claim/addInfo', claimId: claim.id, text: reply.trim() }); });
    if (ok) { setReply(''); toast.success('Sent to the subdivision'); }
  };

  return (
    <Screen title="Ownership claim" back="/reports">
      <header className="rs-stack-sm">
        <h2 className="rs-title rs-title--sm">{notice?.title ?? 'Found animal'}</h2>
        <div className="rs-row-actions"><ClaimPill status={claim.status} /></div>
        <p className="rs-sub">{CLAIM_STATUS[claim.status].hint}</p>
      </header>

      <ol className="rs-stepper" aria-label="Claim progress">
        {STEPS.map((label, i) => (
          <li key={label} className={i < step ? 'is-done' : i === step ? 'is-current' : undefined} aria-current={i === step ? 'step' : undefined}>
            <span className="rs-stepper__bar" aria-hidden="true" />
            <span className="rs-stepper__label">{label}</span>
          </li>
        ))}
      </ol>

      {claim.status === 'needs_info' ? (
        <form className="rs-stack" onSubmit={(e) => void send(e)} noValidate>
          <Callout tone="amber" title="The subdivision needs a little more.">{request?.body ?? 'Please add more detail about the animal.'}</Callout>
          {error ? <FormError message={error} /> : null}
          <div ref={ref}>
            <Field label="Your reply" required error={replyError}>
              <Textarea value={reply} onChange={(e) => { setReply(e.target.value); setReplyError(undefined); }} maxLength={500} rows={4} />
            </Field>
          </div>
          <Button type="submit" variant="primary" block loading={pending}>Send reply</Button>
        </form>
      ) : null}

      {claim.status === 'approved' ? (
        <Callout tone="sage" title="Your claim was approved.">
          {claim.decisionNote}
          <span className="rs-block rs-mt">{SAMPLE_OFFICE.name}: {SAMPLE_OFFICE.phone} · {SAMPLE_OFFICE.hours}</span>
          <span className="rs-row-actions rs-mt"><LinkButton size="sm" to={residentPath('/contact')}>Contact the office</LinkButton></span>
        </Callout>
      ) : null}
      {claim.status === 'rejected' ? (
        <Callout tone="info" title="Your claim was not approved.">
          {claim.decisionNote ?? 'The information was not enough to confirm ownership.'} If you have more to show, contact the subdivision office.
          <span className="rs-row-actions rs-mt"><LinkButton size="sm" to={residentPath('/contact')}>Contact the office</LinkButton></span>
        </Callout>
      ) : null}

      <Section title="Updates">
        <UpdateTimeline updates={claim.updates} now={now} label="Updates on this claim" />
      </Section>

      <Section title="Your claim">
        <dl className="rs-kv">
          <div><dt>Sent</dt><dd>{fmtDateTime(claim.submittedAt)}</dd></div>
          <div><dt>Notice</dt><dd>{notice ? <Link to={residentPath(`/community/${notice.id}`)}>{notice.title}</Link> : 'No longer published'}</dd></div>
          {pet ? <div><dt>Your pet</dt><dd><Link to={residentPath(`/pets/${pet.id}`)}>{pet.name}</Link></dd></div> : null}
          <div><dt>What you told us</dt><dd>{claim.statement}</dd></div>
          <div><dt>What you can show</dt><dd>{claim.evidence.length === 0 ? 'Nothing listed' : <ul className="rs-bullets">{claim.evidence.map((e) => <li key={e}>{e}</li>)}</ul>}</dd></div>
        </dl>
      </Section>
    </Screen>
  );
}
