import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Lock, PawPrint, Maximize2, MessageSquare, Send, ShieldAlert } from 'lucide-react';
import { adminPath } from '../../config';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { Field, Select, Textarea } from '../../components/form';
import { Block, Callout, FormError, Kv, Panel } from '../../components/layout';
import { useToast } from '../../components/toast';
import { identityDisplay } from '../../data/constants';
import { useAdminData } from '../../data/context';
import type { Case, PetFacts, RegisteredPet } from '../../data/types';
import { adminApi } from '../../live/api';
import { useSubmit } from '../../lib/useSubmit';
import { reportIdOf } from '../../../live/refs';
import { fmtDate, fmtDateTime } from '../../../preview/lib/format';
import { useMediaViewer, type LightboxMediaItem } from '../../components/MediaLightbox';
import { SendOwnerWarningDialog } from './PossibleOwnersBlock';

const NOT_GIVEN = 'Not given';

/** "colour and photos" from ["colour", "photos"]. */
const sentenceList = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

const factRows = (f: PetFacts): Array<[string, string]> => [['Name', f.name], ['Animal', `${f.species} · ${f.breed}`], ['Sex', f.sex], ['Colour', f.colour], ['Markings', f.markings], ['Age', f.age]];

function Title({ children }: { children: string }) {
  return <span className="flex items-center gap-2"><PawPrint size={14} aria-hidden="true" />{children}</span>;
}

/**
 * The registered pet a report names, beside the case (Overview). It says where each fact comes from: the registry record is what the owner
 * declared (registration is never proof of ownership), "as reported" is the same record frozen when the report was filed, and "identity"
 * is the team's own decision, which a reporter naming a pet does not make. Older reports with no pet get a plain sentence, not a blank panel.
 */
export default function RegisteredPetPanel({ c }: { c: Case }) {
  const pet = c.registeredPet;
  if (pet === undefined) return null;                                  // the case has not been read in full yet
  if (pet === null) {
    if (c.category !== 'lost_pet') return null;
    return (
      <Panel>
        <Block tight title={<Title>Registered pet</Title>}>
          <p className="sa-small sa-text-2">No registered pet is linked to this report. It was filed before reports named a registered pet, or the reporter described the animal in words. The animal description above is what the reporter wrote.</p>
        </Block>
      </Panel>
    );
  }
  if (pet.unavailable) return <Unavailable pet={pet} />;
  return <Available c={c} pet={pet} />;
}

function Unavailable({ pet }: { pet: RegisteredPet }) {
  return (
    <Panel>
      <Block tight title={<Title>Registered pet</Title>}>
        {pet.unavailable === 'restricted' ? (
          <Callout icon={Lock}>This pet is registered under another subdivision, so its record and its owner are not shown here.</Callout>
        ) : (
          <>
            <Callout tone="amber">The pet’s registry record was removed. Below is what was saved with the report when it was filed.</Callout>
            {pet.asReported ? <><p className="sa-label mb-2 mt-4">As reported</p><Kv stack rows={factRows(pet.asReported)} /></> : null}
          </>
        )}
        {pet.lastSeen ? <LastSeen pet={pet} /> : null}
      </Block>
    </Panel>
  );
}

function LastSeen({ pet }: { pet: RegisteredPet }) {
  const seen = pet.lastSeen;
  if (!seen) return null;
  const notice = pet.notice && (pet.notice.at !== seen.at || pet.notice.where !== seen.where) ? pet.notice : null;
  return (
    <div className="mt-4">
      <p className="sa-label mb-2">Last seen</p>
      <Kv stack rows={[['When', seen.at ? fmtDateTime(seen.at) : NOT_GIVEN], ['Where', seen.where || NOT_GIVEN]]} />
      {notice ? <p className="sa-hint mt-2">The community notice says: {notice.at ? fmtDateTime(notice.at) : NOT_GIVEN}{notice.where ? `, ${notice.where}` : ''}.</p> : null}
    </div>
  );
}

function Available({ c, pet }: { c: Case; pet: RegisteredPet }) {
  const { openMedia } = useMediaViewer();
  const { loadCase } = useAdminData();
  const toast = useToast();
  const { pending, error, run } = useSubmit();
  const [msgModalOpen, setMsgModalOpen] = useState(false);
  const [warnModalOpen, setWarnModalOpen] = useState(false);
  const [msgType, setMsgType] = useState<'ownership_verification' | 'direct_message'>('ownership_verification');
  const [msgText, setMsgText] = useState(
    'Hello! The Subdivision Administration received a report involving an animal that may match your registered pet. We would like to verify whether this animal belongs to you. Please review the details and select Confirm Ownership or Decline Ownership.',
  );

  const now = pet.current;
  if (!now) return null;
  const registration = pet.registration;
  const owner = pet.owner;
  const identity = identityDisplay(c.identity.status, c.identity.decided);
  const rid = reportIdOf(c.id);

  const handleSendOwnerMessage = async () => {
    if (!rid || !pet.petId || !msgText.trim() || pending) return;
    const reqKey = `rp-msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const ok = await run(async () => {
      await adminApi.messagePossibleOwner(rid, Number(pet.petId), msgType, msgText.trim(), reqKey);
      await loadCase(c.id);
    });
    if (ok) {
      toast.success(
        msgType === 'ownership_verification'
          ? `Ownership Verification request sent to ${owner?.name ?? 'the owner'}.`
          : `Message sent to ${owner?.name ?? 'the owner'}.`,
      );
      setMsgModalOpen(false);
    }
  };

  const petMediaItems: LightboxMediaItem[] = (now.photos || []).map((url, i) => ({
    url,
    kind: 'photo',
    title: `${now.name} · Photo ${i + 1}`,
    caption: `${now.species} · ${now.breed}`,
    source: registration?.byOwner ? 'Declared by pet owner' : 'Registered by office',
  }));

  return (
    <>
      <Panel>
        <Block tight title={<Title>Registered pet</Title>} description="From the pet registry. A registration is declared, not verified.">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="sa-semibold">{now.name}</p>
              <p className="sa-meta">{now.species} · {now.breed}</p>
            </div>
            {registration ? <Badge tone={registration.byOwner ? 'neutral' : 'amber'}>{registration.byOwner ? 'Declared by the owner' : 'Entered by the office'}</Badge> : null}
          </div>
          {now.photos.length > 0 ? (
            <p className="sa-petphotos mt-3">
              {now.photos.slice(0, 4).map((url, i) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => openMedia(petMediaItems, i)}
                  className="group relative cursor-zoom-in overflow-hidden rounded-lg border border-[var(--sa-line)] bg-[var(--sa-sand)] focus:outline-none focus:ring-2 focus:ring-[var(--sa-brand-tint)]"
                  aria-label={`Preview photo ${i + 1} of ${now.name}`}
                >
                  <img
                    src={url}
                    alt={`Photo ${i + 1} of ${now.name}`}
                    loading="lazy"
                    className="w-16 h-16 object-cover transition-transform duration-200 group-hover:scale-110"
                  />
                  <span className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-colors flex items-center justify-center">
                    <Maximize2 size={14} className="text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
                  </span>
                </button>
              ))}
            </p>
          ) : null}
          <div className="mt-3"><Kv stack rows={[['Sex', now.sex], ['Colour', now.colour], ['Markings', now.markings], ['Age', now.age]]} /></div>
          {registration ? <p className="sa-meta mt-3">Registered {registration.registeredAt ? fmtDate(registration.registeredAt) : 'on an unknown date'} by {registration.byOwner ? 'the owner' : registration.registeredBy}.</p> : null}

          {pet.linkedByReporter ? (
            <Callout className="mt-4" tone="amber" title={`${identity.label}.`}>
              The reporter named this pet. Nobody on the team has confirmed the animal yet. <Link to="?tab=assessment" className="font-semibold">Record your decision</Link> on the Assessment tab, with how you checked.
            </Callout>
          ) : null}

          <div className="mt-4">
            <p className="sa-label mb-2">As reported</p>
            {pet.asReported ? (
              pet.changedSince.length > 0 ? (
                <>
                  <Callout tone="amber">The registry has changed since this report was filed: {sentenceList(pet.changedSince)}. These are the details the report was filed with.</Callout>
                  <div className="mt-3"><Kv stack rows={factRows(pet.asReported)} /></div>
                </>
              ) : <p className="sa-small sa-text-2">The registry still matches what was reported.</p>
            ) : <p className="sa-small sa-text-2">This report was filed before the pet’s details were saved with it, so there is nothing to compare.</p>}
          </div>

          <LastSeen pet={pet} />
          <p className="sa-small mt-4"><Link to={adminPath(`/pets/${pet.petId}`)} className="font-semibold">Open the pet record</Link></p>
        </Block>
      </Panel>

      <Panel>
        <Block tight title={<span className="flex items-center gap-2"><Lock size={14} aria-hidden="true" />Registered owner</span>} description="As declared at registration, not verified. Visible to authorized administrators only.">
          {owner ? (
            <>
              <Kv stack rows={[
                ['Name', owner.name], ['Phone', owner.phone], ['Email', <span className="break-all">{owner.email}</span>], ['Address', owner.address],
                ...(owner.emergencyContact ? [['Emergency contact', owner.emergencyContact] as [string, string]] : []),
              ]} />
              {pet.reporterIsOwner ? <p className="sa-meta mt-3">The owner is the person who filed this report.</p> : null}
              {owner.residentId && c.status !== 'closed' ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    icon={MessageSquare}
                    onClick={() => setMsgModalOpen(true)}
                  >
                    Message Owner
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={ShieldAlert}
                    onClick={() => setWarnModalOpen(true)}
                  >
                    Send Warning
                  </Button>
                </div>
              ) : null}
              {owner.residentId ? <p className="sa-small mt-3"><Link to={adminPath(`/residents/${owner.residentId}`)} className="font-semibold">View resident profile</Link></p> : null}
            </>
          ) : <p className="sa-small sa-text-2">No resident account is linked to this pet record yet. <Link to={adminPath(`/pets/${pet.petId}`)} className="font-semibold">Open the pet record</Link> to ask a resident to confirm it is theirs.</p>}
          <p className="sa-hint mt-3">Ownership is decided on the Assessment tab, with evidence other than the registry.</p>
        </Block>
      </Panel>

      {msgModalOpen && owner?.residentId ? (
        <Dialog
          size="md"
          title={`Message Owner — ${owner.name}`}
          description={`Case ${c.id} · Registered pet ${now.name} (${now.species} · ${now.breed} · ${now.colour})`}
          onClose={() => setMsgModalOpen(false)}
          footer={
            <>
              <Button variant="ghost" disabled={pending} onClick={() => setMsgModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                icon={Send}
                loading={pending}
                disabled={!msgText.trim()}
                onClick={() => void handleSendOwnerMessage()}
              >
                {msgType === 'ownership_verification' ? 'Send Ownership Verification' : 'Send Message'}
              </Button>
            </>
          }
        >
          <div className="space-y-3.5">
            <Field label="Message Type" required>
              <Select
                value={msgType}
                onChange={(e) => {
                  const next = e.target.value as 'ownership_verification' | 'direct_message';
                  setMsgType(next);
                  if (next === 'ownership_verification') {
                    setMsgText(
                      'Hello! The Subdivision Administration received a report involving an animal that may match your registered pet. We would like to verify whether this animal belongs to you. Please review the details and select Confirm Ownership or Decline Ownership.',
                    );
                  } else {
                    setMsgText(
                      `Hello! We are contacting you regarding Case ${c.id} involving your registered pet ${now.name}. Please check your messages and reply here.`,
                    );
                  }
                }}
              >
                <option value="ownership_verification">
                  Ownership Verification Request (with Confirm / Decline Ownership actions)
                </option>
                <option value="direct_message">Direct / Follow-up Message to Owner</option>
              </Select>
            </Field>
            <Field label="Message Content" required hint="Review and edit before sending.">
              <Textarea
                rows={5}
                value={msgText}
                onChange={(e) => setMsgText(e.target.value)}
                disabled={pending}
              />
            </Field>
            {error ? <FormError message={error} /> : null}
          </div>
        </Dialog>
      ) : null}

      {warnModalOpen && owner?.residentId ? (
        <SendOwnerWarningDialog
          c={c}
          target={{
            userId: Number(owner.residentId),
            ownerName: owner.name,
            ownerPhone: owner.phone,
            ownerEmail: owner.email,
            ownerAddress: owner.address,
            petId: Number(pet.petId),
            petName: now.name,
            petSpecies: now.species,
            petBreed: now.breed,
            petColour: now.colour,
          }}
          onClose={() => setWarnModalOpen(false)}
          onSent={() => setWarnModalOpen(false)}
        />
      ) : null}
    </>
  );
}
