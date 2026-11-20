import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { errorMessage } from '../../../preview/lib/errors';
import { Screen } from '../../components/Screen';
import { Callout, ErrorState, ListSkeleton, NotFoundState } from '../../components/ui';
import { residentApi, type ApiOwnershipVerification } from '../../live/api';
import { OwnershipVerificationCard } from './OwnershipVerificationCard';

/**
 * Ownership verification page, opened from the request message or notification: the reported animal beside the resident's registered pet,
 * the details, and Confirm Ownership / Decline Ownership. Only the pet's registered owner can open it (the server answers 404 to anyone else).
 */
export default function OwnershipVerificationPage() {
  const { requestId } = useParams();
  const id = Number(requestId);
  const valid = Number.isInteger(id) && id > 0;
  const [v, setV] = useState<ApiOwnershipVerification | null>(null);
  const [loading, setLoading] = useState(valid);
  const [err, setErr] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(() => {
    if (!valid) return Promise.resolve();
    return residentApi.ownershipVerification(id).then(
      (data) => { setV(data); setErr(null); },
      (e: unknown) => {
        const status = (e as { status?: number })?.status;
        if (status === 404 || status === 403) setNotFound(true);
        else setErr(errorMessage(e));
      },
    ).finally(() => setLoading(false));
  }, [id, valid]);

  useEffect(() => {
    let live = true;
    if (valid) {
      residentApi.ownershipVerification(id).then(
        (data) => { if (live) { setV(data); setErr(null); } },
        (e: unknown) => {
          if (!live) return;
          const status = (e as { status?: number })?.status;
          if (status === 404 || status === 403) setNotFound(true);
          else setErr(errorMessage(e));
        },
      ).finally(() => { if (live) setLoading(false); });
    }
    return () => { live = false; };
  }, [id, valid]);

  const title = 'Ownership verification';
  if (!valid || notFound) return <Screen title={title} back="/messages"><NotFoundState what="verification request" /></Screen>;
  if (loading) return <Screen title={title} back="/messages"><ListSkeleton rows={3} /></Screen>;
  if (!v) return <Screen title={title} back="/messages"><ErrorState onRetry={() => { void load(); }}>{err}</ErrorState></Screen>;

  return (
    <Screen title={title} subtitle={v.reported_animal?.reference ? `Report ${v.reported_animal.reference}` : undefined}
      back={v.thread_id ? `/conversations/${v.thread_id}` : '/messages'}>
      <div className="flex flex-col gap-3">
        <Callout tone="info">
          Compare the reported animal with your registered pet before you answer. Your response is supporting information only: the
          Subdivision Administration reviews all the evidence and makes the final ownership decision.
        </Callout>
        <OwnershipVerificationCard v={v} variant="page" onAnswered={load} />
      </div>
    </Screen>
  );
}
