import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Clock, Download, MessageSquare, PackageCheck, Printer, QrCode, Tag } from 'lucide-react';
import { fmtDate, fmtDateTime } from '../../../preview/lib/format';
import { errorMessage } from '../../../preview/lib/errors';
import { fromServer } from '../../../live/dates';
import { PetTagScans } from './PetTagScans';
import { Field, Textarea } from '../../components/form';
import { Button, Callout, FormError, LinkButton, Pill, Section, Skeleton } from '../../components/ui';
import { residentPath } from '../../config';
import { residentApi, type ApiPetTag, type ApiPetTagScans, type ApiQrCollarRequest } from '../../live/api';

const COLLAR_TONE: Record<ApiQrCollarRequest['status'], 'neutral' | 'brand' | 'sage'> = {
  pending: 'neutral',
  accepted: 'brand',
  ready_for_pickup: 'sage',
  completed: 'sage',
};

/**
 * The pet's permanent, unique QR tag: view, print, download, and request a physical QR collar.
 * Every registered pet is assigned one permanent QR code that stays active across profile updates and lost/found status changes.
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
  const numericId = Number(petId);
  const valid = Number.isInteger(numericId) && numericId > 0;
  const [tag, setTag] = useState<ApiPetTag | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [qrBlob, setQrBlob] = useState<Blob | null>(null);
  const [loadError, setLoadError] = useState(false);

  const [collarRequests, setCollarRequests] = useState<ApiQrCollarRequest[] | null>(null);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [requestNotes, setRequestNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [requestErr, setRequestErr] = useState('');
  const [requestSuccess, setRequestSuccess] = useState('');

  const loadCollarRequests = useCallback(() => {
    if (!valid) return;
    residentApi.qrCollarRequests(numericId).then(
      (res) => setCollarRequests(res.items),
      () => setCollarRequests([]),
    );
  }, [valid, numericId]);

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
    residentApi.qrCollarRequests(numericId).then(
      (res) => { if (live) setCollarRequests(res.items); },
      () => { if (live) setCollarRequests([]); },
    );
    return () => { live = false; };
  }, [valid, numericId, onScansUnavailable]);

  useEffect(() => {
    if (!valid || !tag?.has_tag || !tag.can_manage) {
      setQrUrl(null);
      setQrBlob(null);
      return;
    }
    let live = true;
    let objectUrl: string | null = null;
    residentApi.petTagQr(numericId).then(
      (blob) => {
        if (!live) return;
        objectUrl = URL.createObjectURL(blob);
        setQrBlob(blob);
        setQrUrl(objectUrl);
      },
      () => undefined,
    );
    return () => {
      live = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [valid, numericId, tag?.has_tag, tag?.can_manage, tag?.tag_id]);

  if (!valid) return null;

  const downloadQr = () => {
    if (!qrBlob) return;
    const url = URL.createObjectURL(qrBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${petName.replace(/[^\w-]+/g, '_') || 'pet'}-qr-tag.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  const submitCollarRequest = async () => {
    if (submitting) return;
    setSubmitting(true);
    setRequestErr('');
    setRequestSuccess('');
    try {
      const created = await residentApi.requestQrCollar(numericId, requestNotes);
      setCollarRequests((prev) => [created, ...(prev ?? [])]);
      setShowRequestForm(false);
      setRequestNotes('');
      setRequestSuccess(`QR collar request ${created.reference} submitted.`);
    } catch (e) {
      setRequestErr(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  const activeCollarRequest = (collarRequests ?? []).find((r) => r.status !== 'completed');

  return (
    <>
      <Section title="QR tag">
        {loadError ? (
          <Callout tone="amber">Couldn’t load the QR tag right now.</Callout>
        ) : !tag ? (
          <Skeleton h={44} />
        ) : tag.has_tag ? (
          <div className="rs-stack-sm">
            <p className="rs-sub">
              {petName} has a permanent QR tag{tag.created_at ? ` (assigned ${fmtDate(fromServer(tag.created_at))})` : ''}. Anyone who finds {petName} can scan it with a phone camera.
              Your name, address and phone number are never shown.
            </p>
            {tag.can_manage && qrUrl ? (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-[#e7e2da] bg-[#faf6f0] p-4 text-center">
                <img src={qrUrl} alt={`QR code for ${petName}`} className="h-36 w-36 rounded-lg bg-white p-1.5 shadow-xs" />
                <span className="rs-meta">Unique StraySafe QR code for {petName}</span>
              </div>
            ) : null}
            {!tag.link_is_public ? (
              <Callout tone="amber">The app’s public address is not set yet, so this tag only opens on this network. Ask the office before printing a tag to keep.</Callout>
            ) : null}
            {tag.can_manage ? (
              <>
                <LinkButton variant="primary" block icon={Printer} to={residentPath(`/pets/${petId}/tag`)}>View and print the tag</LinkButton>
                <Button block icon={Download} disabled={!qrBlob} onClick={downloadQr}>Download QR code</Button>
              </>
            ) : null}
          </div>
        ) : (
          <p className="rs-meta">
            {inactive ? 'This pet record is not active, so it does not have an active QR tag.' : `No QR tag is available for ${petName}.`}
          </p>
        )}

        {tag ? <PetTagScans petId={numericId} petName={petName} owner={tag.can_manage} onScans={onScansLoaded} onError={onScansUnavailable} /> : null}
      </Section>

      {tag?.can_manage && !inactive ? (
        <Section title="QR collar request">
          {requestSuccess ? (
            <Callout tone="info" icon={CheckCircle2}>
              {requestSuccess} Subdivision Administration has been notified.
            </Callout>
          ) : null}

          {collarRequests === null ? (
            <Skeleton h={44} />
          ) : activeCollarRequest ? (
            <div className="rounded-xl border border-[#e7e2da] bg-[#faf6f0] p-3.5 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <QrCode size={16} className="text-[#b45309]" aria-hidden="true" />
                  <span className="font-mono text-xs font-semibold text-[#1c1917]">{activeCollarRequest.reference}</span>
                </div>
                <Pill tone={COLLAR_TONE[activeCollarRequest.status]} dot>
                  {activeCollarRequest.status_label}
                </Pill>
              </div>
              <p className="m-0 text-xs text-[#57534e]">
                Requested {fmtDateTime(fromServer(activeCollarRequest.requested_at))}
                {activeCollarRequest.status === 'accepted' && activeCollarRequest.accepted_at
                  ? ` · Accepted ${fmtDateTime(fromServer(activeCollarRequest.accepted_at))}`
                  : ''}
                {activeCollarRequest.status === 'ready_for_pickup' && activeCollarRequest.ready_at
                  ? ` · Ready since ${fmtDateTime(fromServer(activeCollarRequest.ready_at))}`
                  : ''}
              </p>
              {activeCollarRequest.status === 'ready_for_pickup' ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-2.5 text-xs text-emerald-900 space-y-2">
                  <p className="m-0 font-medium">
                    Your QR collar for {petName} is ready for pickup at the Subdivision Administration office.
                  </p>
                  {activeCollarRequest.thread_id ? (
                    <LinkButton
                      size="sm"
                      variant="primary"
                      icon={MessageSquare}
                      to={residentPath(`/conversations/${activeCollarRequest.thread_id}`)}
                    >
                      Open pickup message
                    </LinkButton>
                  ) : null}
                </div>
              ) : null}
              {activeCollarRequest.notes ? (
                <p className="m-0 text-xs text-[#57534e]">Note: {activeCollarRequest.notes}</p>
              ) : null}
            </div>
          ) : showRequestForm ? (
            <div className="rounded-xl border border-[#e7e2da] bg-[#faf6f0] p-3.5 space-y-3">
              <p className="m-0 text-xs text-[#57534e]">
                Request an official physical QR collar for <strong>{petName}</strong> from Subdivision Administration.
              </p>
              <Field label="Notes for Subdivision Administration" optional hint="Optional collar size preference or pickup note.">
                <Textarea
                  rows={2}
                  maxLength={500}
                  value={requestNotes}
                  onChange={(e) => setRequestNotes(e.target.value)}
                  disabled={submitting}
                  placeholder="e.g. Medium collar size, available weekends"
                />
              </Field>
              {requestErr ? <FormError message={requestErr} /> : null}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  disabled={submitting}
                  onClick={() => { setShowRequestForm(false); setRequestErr(''); }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  icon={Tag}
                  loading={submitting}
                  onClick={() => { void submitCollarRequest(); }}
                >
                  Submit QR Collar Request
                </Button>
              </div>
            </div>
          ) : (
            <div className="rs-stack-sm">
              <p className="rs-sub">
                Need a physical QR collar for {petName}? Submit a request to Subdivision Administration and track its status here.
              </p>
              <Button
                block
                variant="secondary"
                icon={Tag}
                onClick={() => { setShowRequestForm(true); setRequestErr(''); setRequestSuccess(''); }}
              >
                Request QR Collar
              </Button>
            </div>
          )}

          {collarRequests && collarRequests.length > 0 ? (
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-[#78716c]">Request history</span>
                <button type="button" onClick={loadCollarRequests} className="text-xs font-medium text-[#b45309] hover:underline">
                  Refresh
                </button>
              </div>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {collarRequests.map((req) => (
                  <li key={req.request_id} className="rounded-xl border border-[#e7e2da] bg-white p-3 text-xs space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono font-semibold text-[#1c1917]">{req.reference}</span>
                      <Pill tone={COLLAR_TONE[req.status]} dot>{req.status_label}</Pill>
                    </div>
                    <ol className="m-0 flex list-none flex-col gap-1 p-0 text-[#57534e]">
                      {req.history.map((h, i) => (
                        <li key={`${req.request_id}-${h.status}-${i}`} className="flex flex-wrap items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1">
                            {h.status === 'ready_for_pickup' || h.status === 'completed' ? (
                              <PackageCheck size={12} className="text-emerald-700" aria-hidden="true" />
                            ) : (
                              <Clock size={12} className="text-[#78716c]" aria-hidden="true" />
                            )}
                            <span className="font-medium text-[#1c1917]">{h.label}</span>
                            {h.by_name ? <span>· {h.by_name}</span> : null}
                          </span>
                          <span>{fmtDateTime(fromServer(h.at))}</span>
                        </li>
                      ))}
                    </ol>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Section>
      ) : null}
    </>
  );
}
