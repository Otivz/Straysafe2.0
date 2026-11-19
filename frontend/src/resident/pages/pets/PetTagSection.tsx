import { useEffect, useState } from 'react';
import { Printer, QrCode, RefreshCw, PowerOff } from 'lucide-react';
import { fmtDate } from '../../../preview/lib/format';
import { fromServer } from '../../../live/dates';
import { PetTagScans } from './PetTagScans';
import { ConfirmSheet } from '../../components/Sheet';
import { Button, Callout, LinkButton, Section, Skeleton } from '../../components/ui';
import { useToast } from '../../components/toast';
import { residentPath } from '../../config';
import { residentApi, type ApiPetTag, type ApiPetTagScans } from '../../live/api';

/**
 * The pet's QR tag (Phase 1 of docs/06-future-proposals/PET_QR_TAGS_PLAN_2026-11-17.md): create, print, replace, turn off.
 * A tag is optional. Replacing it makes the old printed tag stop working at once.
 */
export function PetTagSection({
  petId,
  petName,
  inactive,
  onScansLoaded,
  onScansUnavailable,
}: {
  petId: string;
  petName: string;
  inactive: boolean;
  onScansLoaded?: (data: ApiPetTagScans) => void;
  onScansUnavailable?: () => void;
}) {
  const toast = useToast();
  const numericId = Number(petId);
  const valid = Number.isInteger(numericId) && numericId > 0;
  const [tag, setTag] = useState<ApiPetTag | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<'replace' | 'disable' | null>(null);

  useEffect(() => {
    if (!valid) {
      onScansUnavailable?.();
      return;
    }
    let live = true;
    residentApi.petTag(numericId).then(
      (t) => { if (live) { setTag(t); setLoadError(false); } },
      () => { if (live) { setLoadError(true); onScansUnavailable?.(); } },
    );
    return () => { live = false; };
  }, [valid, numericId, onScansUnavailable]);

  if (!valid) return null;

  const create = async () => {
    setBusy(true);
    try {
      setTag(await residentApi.createPetTag(numericId));
      toast.success(`QR tag created for ${petName}`);
    } catch (err) {
      toast.error((err as Error)?.message || 'The QR tag could not be created.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="QR tag">
      {loadError ? (
        <Callout tone="amber">Couldn’t load the QR tag right now.</Callout>
      ) : !tag ? (
        <Skeleton h={44} />
      ) : tag.has_tag ? (
        <div className="rs-stack-sm">
          <p className="rs-sub">
            {petName} has a QR tag{tag.created_at ? ` (made ${fmtDate(fromServer(tag.created_at))})` : ''}. Anyone who finds {petName} can scan it with a phone camera.
            Your name, address and phone number are never shown.
          </p>
          {!tag.link_is_public ? (
            <Callout tone="amber">The app’s public address is not set yet, so this tag only opens on this network. Ask the office before printing a tag to keep.</Callout>
          ) : null}
          {tag.can_manage ? (
            <>
              <LinkButton variant="primary" block icon={Printer} to={residentPath(`/pets/${petId}/tag`)}>View and print the tag</LinkButton>
              <Button block icon={RefreshCw} disabled={busy} onClick={() => setConfirm('replace')}>Replace tag (lost or damaged)</Button>
            </>
          ) : null}
          {tag.can_disable ? <Button variant="ghost" block icon={PowerOff} disabled={busy} onClick={() => setConfirm('disable')}>Turn off tag</Button> : null}
        </div>
      ) : (
        <div className="rs-stack-sm">
          <p className="rs-sub">
            A QR tag on {petName}’s collar lets anyone who finds {petName} tell you, without seeing your name, address or phone number. It is optional.
          </p>
          {tag.can_manage && !inactive ? (
            <Button variant="primary" block icon={QrCode} loading={busy} onClick={() => { void create(); }}>Create a QR tag</Button>
          ) : inactive ? (
            <p className="rs-meta">This pet record is not active, so it cannot have a QR tag.</p>
          ) : null}
        </div>
      )}

      {tag ? <PetTagScans petId={numericId} petName={petName} owner={tag.can_manage} onScans={onScansLoaded} onError={onScansUnavailable} /> : null}

      {confirm === 'replace' ? (
        <ConfirmSheet
          title="Replace the QR tag?"
          message={`A new tag is made, and the one ${petName} wears now stops working at once. Print and attach the new one.`}
          confirmLabel="Replace tag"
          onConfirm={async () => {
            setTag(await residentApi.createPetTag(numericId));
            toast.success('New QR tag made. Print it from “View and print the tag”.');
          }}
          onClose={() => setConfirm(null)}
        />
      ) : confirm === 'disable' ? (
        <ConfirmSheet
          title="Turn off the QR tag?"
          message={`Scanning ${petName}’s printed tag will no longer show anything. You can make a new tag later.`}
          confirmLabel="Turn off"
          tone="danger"
          onConfirm={async () => {
            setTag(await residentApi.disablePetTag(numericId));
            toast.success('QR tag turned off');
          }}
          onClose={() => setConfirm(null)}
        />
      ) : null}
    </Section>
  );
}
