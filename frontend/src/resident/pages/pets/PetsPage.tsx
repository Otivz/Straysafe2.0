import { Link } from 'react-router-dom';
import { Dog, Plus } from 'lucide-react';
import { ANIMAL_ICON } from '../../components/icons';
import { Screen } from '../../components/Screen';
import { Callout, EmptyState, LinkButton } from '../../components/ui';
import { residentPath } from '../../config';
import { useResidentData } from '../../data/context';
import { petSummary } from '../../lib/pets';

/** R29 — The pets this resident has registered. */
export default function PetsPage() {
  const { state } = useResidentData();
  return (
    <Screen
      title="My pets"
      back="/profile"
      footer={state.pets.length > 0 ? <LinkButton variant="primary" block icon={Plus} to={residentPath('/pets/new')}>Register a pet</LinkButton> : undefined}
    >
      {state.pets.length === 0 ? (
        <EmptyState icon={Dog} title="No pets registered yet" action={<LinkButton variant="primary" icon={Plus} to={residentPath('/pets/new')}>Register a pet</LinkButton>}>
          A pet profile helps you write a lost-pet notice in seconds, and helps neighbours recognise your pet.
        </EmptyState>
      ) : (
        <ul className="rs-stack-sm rs-plain" aria-label="Your pets">
          {state.pets.map((p) => {
            const Icon = ANIMAL_ICON[p.type];
            return (
              <li key={p.id}>
                <Link to={residentPath(`/pets/${p.id}`)} className="rs-card rs-card--link">
                  <span className="rs-card__icon">{p.photoUrl ? <img src={p.photoUrl} alt="" /> : <Icon size={22} aria-hidden="true" />}</span>
                  <span className="rs-card__text">
                    <span className="rs-card__title">{p.name}</span>
                    <span className="rs-card__meta">{petSummary(p)}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <Callout tone="info">Registering a pet is optional. It does not prove ownership by itself: an administrator decides ownership claims by looking at everything you provide.</Callout>
    </Screen>
  );
}
