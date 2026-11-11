import { useState, type ReactNode } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Hourglass } from 'lucide-react';
import { fmtDateTime, fromLocalInput } from '../../../preview/lib/format';
import { LocationMapPreview } from '../../../preview/map/LocationMapPreview';
import { MapLegend } from '../../../preview/map/MapLegend';
import { Checkbox } from '../../components/form';
import { NOTICE_ICON } from '../../components/icons';
import { Button, Callout, FormError, MediaThumbs } from '../../components/ui';
import { residentPath } from '../../config';
import { ANIMAL_TYPES, CATEGORIES, EXTRA_FIELD, VISIBILITY_COPY } from '../../data/constants';
import { useResidentData } from '../../data/context';
import { accepts } from '../../data/entries';
import { nextReportId, visibilityAfterSending } from '../../data/selectors';
import type { Draft } from '../../data/types';
import { stepPath } from '../../lib/flow';
import { useSubmit } from '../../lib/hooks';
import { PINNED_LABEL, pointOf } from '../../lib/location';
import { FlowScreen } from './FlowScreen';

const LostIcon = NOTICE_ICON.lost_pet;

function Item({ label, to, children }: { label: string; to?: string; children: ReactNode }) {
  return (
    <div className="rs-summary__item">
      <dt>{label}</dt>
      <dd>{children}</dd>
      {to ? <Link to={`${to}?from=review`} className="rs-summary__edit" aria-label={`Change ${label.toLowerCase()}`}>Change</Link> : null}
    </div>
  );
}

function ReviewForm({ draft, onSending }: { draft: Draft; onSending: () => void }) {
  const { state, dispatch } = useResidentData();
  const navigate = useNavigate();
  const { pending, error, run } = useSubmit();
  const [agree, setAgree] = useState(false);
  const [agreeError, setAgreeError] = useState(false);
  const cat = CATEGORIES[draft.category];
  const extra = EXTRA_FIELD[draft.category];
  const animal = draft.animalType ? ANIMAL_TYPES[draft.animalType] : '';
  const pin = pointOf(draft.location);

  const missing: { text: string; to: string }[] = [];
  if (!draft.animalType || draft.description.trim().length < 10) missing.push({ text: 'the description', to: stepPath('details') });
  if (!draft.location) missing.push({ text: 'where the animal was', to: stepPath('location') });
  const complete = missing.length === 0;
  // The Leader switched this kind off while the report was being written (known once the app has read the subdivision's settings).
  const unavailable = state.accepting !== undefined && !accepts(state.accepting, draft.category);

  // What happens after sending is the subdivision's own publication setting.
  const visibility = cat.kind === 'incident' ? 'private' : visibilityAfterSending(state, cat.kind);
  // A notice that will be shown to neighbours needs the resident's say-so (even when an administrator approves it first).
  const consentNeeded = cat.kind === 'lost' || (cat.kind === 'found' && visibility === 'published');
  const VisIcon = visibility === 'published' ? Eye : visibility === 'pending_review' ? Hourglass : EyeOff;
  const noticeTitle = `Lost ${animal.toLowerCase()}${draft.petName.trim() ? `: ${draft.petName.trim()}` : ''}`;

  const consent = (
    <Checkbox
      checked={agree}
      onChange={(e) => { setAgree(e.target.checked); setAgreeError(false); }}
      error={agreeError ? (visibility === 'published' ? 'Please confirm to publish the notice.' : 'Please confirm to send the notice.') : undefined}
      label={visibility === 'published'
        ? 'I understand this notice and photo will be visible to my neighbours in Community.'
        : 'I understand this notice and photo will be visible to my neighbours in Community once an administrator approves it.'}
    />
  );

  const submit = async () => {
    if (consentNeeded && !agree) { setAgreeError(true); return; }
    // The server tells the real reference once the report is filed; until then this is the next number in line.
    let id = nextReportId(state);
    onSending();
    const ok = await run(async () => { const sent = await dispatch({ type: 'report/submit' }); if (sent?.reportRef) id = sent.reportRef; });
    if (ok) navigate(residentPath(`/report/submitted/${id}`), { replace: true });
  };

  return (
    <FlowScreen
      step="review"
      title="Review and submit"
      draft={draft}
      footer={(
        <Button variant="primary" block loading={pending} disabled={!complete || unavailable} onClick={() => void submit()}>
          {visibility === 'published' ? 'Publish notice and submit' : cat.kind === 'incident' ? 'Submit report' : 'Submit for review'}
        </Button>
      )}
    >
      {!complete ? (
        <Callout tone="amber" title="A few details are missing.">
          Add {missing.map((m, i) => <span key={m.to}>{i > 0 ? ' and ' : ''}<Link to={m.to}>{m.text}</Link></span>)} before you submit.
        </Callout>
      ) : null}
      {unavailable ? (
        <Callout tone="amber" title="Your subdivision isn’t accepting this kind of report right now.">
          <span>What you wrote is kept. Choose another type to send it.</span>
          <span className="rs-row-actions rs-mt">
            <Button size="sm" variant="primary" onClick={() => navigate({ pathname: residentPath('/report'), search: '?keep=1' })}>Choose another type</Button>
          </span>
        </Callout>
      ) : null}
      {error && !unavailable ? <FormError message={error} /> : null}

      <dl className="rs-summary">
        <Item label="Type" to={stepPath('details')}>{cat.label}</Item>
        <Item label="Animal" to={stepPath('details')}>{animal || 'Not chosen'}{draft.petName.trim() ? ` · ${draft.petName.trim()}` : ''}</Item>
        <Item label="Details" to={stepPath('details')}>{draft.description.trim() || 'Not added'}</Item>
        <Item label="When" to={stepPath('details')}>{fmtDateTime(fromLocalInput(draft.observedAt))}</Item>
        {extra && draft.extra ? <Item label={extra.label} to={stepPath('details')}>{draft.extra}</Item> : null}
        <Item label="Where" to={stepPath('location')}>{draft.location ? <>{draft.location.label}{draft.location.lat === null ? <span className="rs-meta"> · described in words</span> : draft.location.label === PINNED_LABEL ? null : <span className="rs-meta"> · pinned on the map</span>}</> : 'Not chosen'}</Item>
        <Item label="Photos" to={cat.kind === 'incident' ? stepPath('evidence') : stepPath('details')}>{draft.media.length === 0 ? 'None added' : <MediaThumbs media={draft.media} />}</Item>
      </dl>

      {pin ? (
        <figure className="rs-figure">
          <LocationMapPreview pin={pin} height={160} label="Map of the spot you chose" />
          <MapLegend items={[{ kind: 'pin', label: 'The spot you chose' }, { kind: 'outline', label: 'Approximate subdivision outline' }]} />
          <figcaption className="rs-hint">The exact spot is shown only to you and subdivision administrators.{cat.kind === 'incident' ? '' : ' Neighbours see only a general area.'}</figcaption>
        </figure>
      ) : null}

      <section className={`rs-visibility rs-visibility--${visibility}`} aria-label="Who can see this">
        <p className="rs-visibility__title"><VisIcon size={18} aria-hidden="true" />{visibility === 'private' ? 'Private report' : visibility === 'published' ? 'Visible to neighbours' : 'Reviewed before sharing'}</p>
        <p>{VISIBILITY_COPY[visibility].long}</p>
      </section>

      {cat.kind === 'lost' && draft.animalType && draft.location ? (
        <div className="rs-stack-sm">
          <h2 className="rs-h2">How the notice will look</h2>
          <div className="rs-card" role="group" aria-label="Notice preview">
            <span className="rs-card__icon"><LostIcon size={19} aria-hidden="true" /></span>
            <span className="rs-card__text">
              <span className="rs-card__kicker">Lost pet</span>
              <span className="rs-card__title">{noticeTitle}</span>
              <span className="rs-card__desc">{draft.description.trim()}</span>
              <span className="rs-card__meta">{draft.location.label} · last seen {fmtDateTime(fromLocalInput(draft.observedAt))}</span>
            </span>
          </div>
          <p className="rs-hint">Never shown: your name, phone number, address, or the exact spot.</p>
          {consent}
        </div>
      ) : null}
      {cat.kind === 'found' && consentNeeded ? <div className="rs-stack-sm">{consent}</div> : null}

      {cat.kind === 'incident' ? (
        <Callout tone="info">An administrator will review your report. You can follow it under My reports, and add information later.</Callout>
      ) : null}
    </FlowScreen>
  );
}

/**
 * R12 — Review everything before sending, including who will be able to see it.
 *
 * Sending clears the draft from the store while the screen is still showing it. Without `frozen`, that would trigger the
 * "no draft, go back to Report" guard and win the race against the navigation to the confirmation screen. The copy is taken
 * just before sending and only used until this screen is replaced.
 */
export default function ReviewPage() {
  const draft = useResidentData().state.draft;
  const [frozen, setFrozen] = useState<Draft | null>(null);
  const current = draft ?? frozen;
  return current ? <ReviewForm draft={current} onSending={() => setFrozen(draft)} /> : <Navigate to={residentPath('/report')} replace />;
}
