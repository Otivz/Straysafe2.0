import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Camera, FileQuestion, Link2, Lock } from 'lucide-react';
import { adminPath } from '../config';
import { Badge, StatusBadge } from '../components/Badge';
import { Button, LinkButton } from '../components/Button';
import { Block, Callout, EmptyState, Kv, Panel } from '../components/layout';
import { PetAvatar } from '../components/PetAvatar';
import { ANIMAL_TYPES, CATEGORIES, LINKED_BY_REPORTER, SIZE_LABEL, VACCINATION } from '../data/constants';
import { useAdminData } from '../data/context';
import { petById, petCases, residentById } from '../data/selectors';
import type { Case, MatchDecision } from '../data/types';
import { fmtDate, maskPhone } from '../../preview/lib/format';
import { usePageTitle } from '../lib/hooks';
import { LinkOwnerDialog } from '../dialogs/PetDialogs';

const DECISION: Record<MatchDecision, { label: string; tone: 'amber' | 'neutral' | 'sage' }> = {
  possible: { label: 'Possible match', tone: 'amber' },
  not_match: { label: 'Ruled out', tone: 'neutral' },
  confirmed: { label: 'Identity confirmed', tone: 'sage' },
};

/** How a case relates to this pet: a decision the team made, or only the reporter having named the pet (which decides nothing). */
const decisionOf = (c: Case, petId: string) => {
  const d = c.identity.matches[petId];
  return d === 'confirmed' && c.identity.decided === false ? { label: LINKED_BY_REPORTER.label, tone: 'neutral' as const } : DECISION[d];
};

/** A17 — Pet details. Declared information (by the owner, or by the office for them); never presented as verified ownership. */
export default function PetDetailsPage() {
  const { petId } = useParams();
  const { state } = useAdminData();
  const [linking, setLinking] = useState(false);
  const pet = petById(state, petId);
  usePageTitle(pet ? pet.name : 'Pet not found');

  if (!pet) {
    return <Panel><EmptyState icon={FileQuestion} title="We can’t find that pet" action={<LinkButton variant="primary" to={adminPath('/pets')}>Back to the registry</LinkButton>}>The record may have been removed.</EmptyState></Panel>;
  }
  const owner = residentById(state, pet.ownerId);
  const cases = petCases(state.cases, pet.id);
  // A record the office entered: its registrar is not the owner, or (registrar unknown) it has no owner account at all
  const byOffice = pet.registeredBy ? !pet.registeredBy.byOwner : !owner;
  // Only whoever entered an ownerless record (or the administrator) may link it: the server decides, this only avoids a button that cannot work
  const canLink = !owner && (!pet.registeredBy || pet.registeredBy.userId === null || pet.registeredBy.userId === state.admin.id);

  return (
    <div>
      <Link className="sa-back" to={adminPath('/pets')}>← Pet Registry</Link>
      <header className="mb-6 flex flex-wrap items-center gap-4">
        <PetAvatar type={pet.type} size="lg" />
        <div>
          <h1 className="sa-h1">{pet.name}</h1>
          <p className="sa-text-2 mt-0.5">{ANIMAL_TYPES[pet.type]} · {pet.breed} · registered {fmtDate(pet.registeredAt)}</p>
        </div>
      </header>

      {byOffice ? (
        <Callout className="mb-6" title="Entered by the office.">{pet.registeredBy?.name ?? 'The subdivision office'} recorded this pet. It is a reference for comparing animals and contacting owners. It is not verified proof of ownership{owner ? ', and the resident named here confirmed it is theirs.' : ', and no resident has confirmed it yet.'}</Callout>
      ) : (
        <Callout className="mb-6" title="Owner-declared registration.">This record was entered by the resident. It is a reference for comparing animals and contacting owners. It is not verified proof of ownership.</Callout>
      )}

      <div className="sa-case" style={{ marginTop: 0 }}>
        <div className="flex min-w-0 flex-col gap-5">
          <Panel>
            <Block title="Pet information">
              <Kv wide rows={[
                ['Animal', `${ANIMAL_TYPES[pet.type]} · ${pet.breed}`], ['Colour', pet.color], ['Sex', pet.sex === 'unknown' ? 'Not recorded' : pet.sex[0].toUpperCase() + pet.sex.slice(1)],
                ['Age', pet.ageText], ['Size', SIZE_LABEL[pet.size]],
                ['Vaccination', VACCINATION[pet.vaccination]],
              ]} />
            </Block>
            <Block title="Distinguishing characteristics" description="Useful when comparing with a reported animal.">
              {pet.markings.length ? <p className="flex flex-wrap gap-2">{pet.markings.map((m) => <Badge key={m}>{m}</Badge>)}</p> : <p className="sa-small sa-text-2">No distinguishing marks were recorded.</p>}
              <p className="sa-prose mt-3">{pet.description}</p>
            </Block>
            <Block title="Photos" description={`${pet.photos} uploaded by the owner`}>
              <div className="sa-evgrid">
                {Array.from({ length: pet.photos }, (_, i) => {
                  const url = pet.photoUrls?.[i];
                  return (
                    <span key={i} className="sa-tile" aria-label={`Photo ${i + 1} of ${pet.name}`}>
                      <span className="sa-tile__art">{url ? <img src={url} alt="" loading="lazy" /> : <Camera size={24} aria-hidden="true" />}</span>
                      <span className="sa-tile__cap"><strong>Photo {i + 1}</strong>{url ? null : <span className="sa-text-3">No preview available</span>}</span>
                    </span>
                  );
                })}
              </div>
            </Block>
          </Panel>
        </div>

        <aside className="sa-case__aside" aria-label="Owner and related cases">
          <Panel>
            <Block tight title={<span className="flex items-center gap-2"><Lock size={14} aria-hidden="true" />Registered owner</span>} description="As declared at registration, not verified. Visible to administrators only.">
              {owner ? (
                <>
                  <Kv stack rows={[['Name', owner.name], ['Unit', [owner.unit, owner.street].filter(Boolean).join(' · ')], ['Phone', maskPhone(owner.phone)]]} />
                  <p className="sa-small mt-3"><Link to={adminPath(`/residents/${owner.id}`)} className="font-semibold">View resident profile</Link></p>
                </>
              ) : (
                <>
                  <p className="sa-small sa-text-2">No resident account is linked to this pet record.</p>
                  <p className="sa-hint mt-2">A resident can report a pet missing only once it is on their account. Ask the resident to confirm it is theirs: nothing changes until they accept.</p>
                  {canLink
                    ? <Button className="mt-3" size="sm" icon={Link2} onClick={() => setLinking(true)}>Link to a resident</Button>
                    : <p className="sa-hint mt-2">Only {pet.registeredBy?.name ?? 'the person who entered this record'}, or the system administrator, can link it to a resident.</p>}
                </>
              )}
            </Block>
          </Panel>
          <Panel>
            <Block tight title="Related cases" description="Cases where this pet was compared with a reported animal.">
              {cases.length === 0 ? <p className="sa-small sa-text-2">This pet has not appeared in any case.</p> : (
                <ul className="m-0 flex list-none flex-col gap-3 p-0">
                  {cases.map((c) => (
                    <li key={c.id}>
                      <p className="flex flex-wrap items-center gap-2"><Link to={adminPath(`/cases/${c.id}`)} className="sa-ref">{c.id}</Link><StatusBadge status={c.status} /></p>
                      <p className="mt-1 font-medium">{c.title}</p>
                      <p className="sa-meta mt-0.5">{CATEGORIES[c.category].label}</p>
                      <p className="mt-1.5"><Badge tone={decisionOf(c, pet.id).tone}>{decisionOf(c, pet.id).label}</Badge></p>
                    </li>
                  ))}
                </ul>
              )}
              {cases.length ? <p className="sa-hint mt-3">Appearing in a case does not mean this pet or its owner did anything wrong.</p> : null}
            </Block>
          </Panel>
        </aside>
      </div>
      {linking ? <LinkOwnerDialog pet={pet} onClose={() => setLinking(false)} /> : null}
    </div>
  );
}
