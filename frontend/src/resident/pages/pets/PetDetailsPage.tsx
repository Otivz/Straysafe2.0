import { Link, useNavigate, useParams } from 'react-router-dom';
import { Pencil, Search } from 'lucide-react';
import { fmtDate } from '../../../preview/lib/format';
import { ANIMAL_ICON } from '../../components/icons';
import { Screen } from '../../components/Screen';
import { Button, Callout, IconButton, LinkButton, NotFoundState, Section } from '../../components/ui';
import { residentPath } from '../../config';
import { ANIMAL_TYPES, SEX_LABEL } from '../../data/constants';
import { useResidentData } from '../../data/context';
import { accepts } from '../../data/entries';
import { activeLostReport, petById } from '../../data/selectors';
import { useStartReport } from '../../lib/flow';

/** R31 — One registered pet, with the shortcut to report them lost. */
export default function PetDetailsPage() {
  const { state } = useResidentData();
  const navigate = useNavigate();
  const start = useStartReport();
  const pet = petById(state, useParams().petId);
  if (!pet) return <Screen title="Pet" back="/pets"><NotFoundState what="pet" to="/pets" label="Go to My pets" /></Screen>;

  const Icon = ANIMAL_ICON[pet.type];
  const missing = activeLostReport(state, pet.id);

  return (
    <Screen
      title={pet.name}
      back="/pets"
      actions={<IconButton label="Edit pet" icon={Pencil} onClick={() => navigate(residentPath(`/pets/${pet.id}/edit`))} />}
      footer={missing ? (
        <LinkButton variant="primary" block to={residentPath(`/reports/${missing.id}`)}>View the lost-pet report</LinkButton>
      ) : accepts(state.accepting, 'lost_pet') && pet.status !== 'Deceased' ? (
        <Button variant="primary" block icon={Search} onClick={() => start('lost_pet', { petId: pet.id, petName: pet.name, animalType: pet.type })}>
          {pet.name} is lost
        </Button>
      ) : undefined}
    >
      <div className="rs-pethero">
        <span className="rs-pethero__photo">{pet.photoUrl ? <img src={pet.photoUrl} alt={`${pet.name}`} /> : <Icon size={40} aria-hidden="true" />}</span>
        <div>
          <h2 className="rs-title rs-title--sm">{pet.name}</h2>
          <p className="rs-meta">{ANIMAL_TYPES[pet.type]}{pet.breed ? ` · ${pet.breed}` : ''}</p>
        </div>
      </div>

      {missing ? (
        <Callout tone="amber" title={`${pet.name} is reported missing.`}>
          <Link to={residentPath(`/reports/${missing.id}`)}>Open the report</Link>, or tell us when {pet.name} is home.
        </Callout>
      ) : null}

      <Section title="About">
        <dl className="rs-kv">
          <div><dt>Colour or coat</dt><dd>{pet.color}</dd></div>
          {pet.sex !== 'unknown' ? <div><dt>Sex</dt><dd>{SEX_LABEL[pet.sex]}</dd></div> : null}
          {pet.ageText ? <div><dt>Age</dt><dd>{pet.ageText}</dd></div> : null}
          <div><dt>Registered</dt><dd>{fmtDate(pet.registeredAt)}</dd></div>
          {pet.description ? <div><dt>Notes</dt><dd>{pet.description}</dd></div> : null}
        </dl>
        {pet.markings.length > 0 ? (
          <div className="rs-stack-sm">
            <h3 className="rs-label">Marks, collar or tag</h3>
            <ul className="rs-tags">{pet.markings.map((m) => <li key={m}>{m}</li>)}</ul>
          </div>
        ) : null}
      </Section>

      <Callout tone="info">This profile is private. It is shared only if you report {pet.name} lost, or make an ownership claim. A registration is what you declare, not proof of ownership.</Callout>
    </Screen>
  );
}
