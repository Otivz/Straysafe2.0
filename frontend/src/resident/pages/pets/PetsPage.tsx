import { Link } from 'react-router-dom';
import { Dog, Plus } from 'lucide-react';
import { ANIMAL_ICON } from '../../components/icons';
import { Screen } from '../../components/Screen';
import { useToast } from '../../components/toast';
import { Button, Callout, EmptyState, FormError, LinkButton, Pill } from '../../components/ui';
import { residentPath } from '../../config';
import { useResidentData } from '../../data/context';
import { activeLostReport } from '../../data/selectors';
import type { OwnershipRequest } from '../../data/types';
import { useSubmit } from '../../lib/hooks';
import { petSummary } from '../../lib/pets';

/** The office linked a pet record to this account: it becomes theirs only when they say yes (nothing moves before that). */
function OwnershipRequestCard({ request }: { request: OwnershipRequest }) {
  const { dispatch } = useResidentData();
  const toast = useToast();
  const { pending, error, run } = useSubmit();
  const answer = async (accept: boolean) => {
    const ok = await run(async () => { await dispatch({ type: 'ownership/answer', id: request.id, accept }); });
    if (ok) toast.success(accept ? `${request.petName} is now in your pets` : 'Thanks, we told the office it is not your pet');
  };
  return (
    <Callout tone="amber" title={`Is ${request.petName} your pet?`}>
      <span>{request.proposedBy} linked this pet record to your account. Say yes only if it is your pet: it is added to My pets when you do.</span>
      {error ? <FormError message={error} /> : null}
      <span className="rs-row-actions rs-mt">
        <Button size="sm" variant="primary" loading={pending} onClick={() => void answer(true)}>Yes, it’s mine</Button>
        <Button size="sm" disabled={pending} onClick={() => void answer(false)}>No, it’s not mine</Button>
      </span>
    </Callout>
  );
}

/** R29 — The pets this resident has registered: the pets that can be reported missing. */
export default function PetsPage() {
  const { state } = useResidentData();
  const requests = state.ownershipRequests ?? [];
  return (
    <Screen
      title="My pets"
      back="/profile"
      footer={state.pets.length > 0 ? <LinkButton variant="primary" block icon={Plus} to={residentPath('/pets/new')}>Register a pet</LinkButton> : undefined}
    >
      {requests.map((o) => <OwnershipRequestCard key={o.id} request={o} />)}
      {state.pets.length === 0 ? (
        <EmptyState icon={Dog} title="No pets registered yet" action={<LinkButton variant="primary" icon={Plus} to={residentPath('/pets/new')}>Register a pet</LinkButton>}>
          Register each pet you own. A registered pet is how you report it missing in a few taps, and it helps neighbours recognise your pet.
        </EmptyState>
      ) : (
        <ul className="rs-stack-sm rs-plain" aria-label="Your pets">
          {state.pets.map((p) => {
            const Icon = ANIMAL_ICON[p.type];
            const missing = activeLostReport(state, p.id);
            return (
              <li key={p.id}>
                <Link to={residentPath(`/pets/${p.id}`)} className="rs-card rs-card--link">
                  <span className="rs-card__icon">{p.photoUrl ? <img src={p.photoUrl} alt="" /> : <Icon size={22} aria-hidden="true" />}</span>
                  <span className="rs-card__text">
                    <span className="rs-card__title">{p.name}</span>
                    <span className="rs-card__meta">{petSummary(p)}</span>
                    {missing ? <span className="rs-card__row"><Pill tone="amber" dot>Reported missing</Pill></span> : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <Callout tone="info">Registering your pets is how you report one missing. A registration is what you declare: it does not prove ownership by itself, and an administrator decides ownership claims by looking at everything you provide.</Callout>
    </Screen>
  );
}
