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
import { nextReportId } from '../../data/selectors';
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

  const visibility = cat.kind === 'lost' ? 'published' : cat.kind === 'found' ? 'pending_review' : 'private';
  const VisIcon = visibility === 'published' ? Eye : visibility === 'pending_review' ? Hourglass : EyeOff;
  const noticeTitle = `Lost ${animal.toLowerCase()}${draft.petName.trim() ? `: ${draft.petName.trim()}` : ''}`;

  const submit = async () => {
    if (cat.kind === 'lost' && !agree) { setAgreeError(true); return; }
    const id = nextReportId(state);
    onSending();
    const ok = await run(async () => { await dispatch({ type: 'report/submit' }); });
    if (ok) navigate(residentPath(`/report/submitted/${id}`), { replace: true });
  };

  return (
    <FlowScreen
      step="review"
      title="Review and submit"
      draft={draft}
      footer={(
        <Button variant="primary" block loading={pending} disabled={!complete} onClick={() => void submit()}>
          {cat.kind === 'lost' ? 'Publish notice and submit' : cat.kind === 'found' ? 'Submit for review' : 'Submit report'}
        </Button>
      )}
    >
      {!complete ? (
        <Callout tone="amber" title="A few details are missing.">
          Add {missing.map((m, i) => <span key={m.to}>{i > 0 ? ' and ' : ''}<Link to={m.to}>{m.text}</Link></span>)} before you submit.
        </Callout>
      ) : null}
      {error ? <FormError message={error} /> : null}

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
          <Checkbox
            checked={agree}
            onChange={(e) => { setAgree(e.target.checked); setAgreeError(false); }}
            error={agreeError ? 'Please confirm to publish the notice.' : undefined}
            label="I understand this notice and photo will be visible to my neighbours in Community."
          />
        </div>
      ) : null}

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
