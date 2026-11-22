import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Download,
  ExternalLink,
  Eye,
  History,
  Mail,
  MapPin,
  MessageSquare,
  Paperclip,
  PawPrint,
  Phone,
  PhoneOff,
  Send,
  ShieldAlert,
  Trash2,
  Upload,
  User,
  UserRoundSearch,
} from 'lucide-react';
import { adminPath } from '../../config';
import { Badge } from '../../components/Badge';
import { Button, LinkButton } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { Field, Input, Select, Textarea } from '../../components/form';
import { Block, Callout, FormError, Kv } from '../../components/layout';
import { useMediaViewer } from '../../components/MediaLightbox';
import {
  SubdivisionContactFields,
  useSubdivisionContactAutofill,
} from '../../components/SubdivisionContactFields';
import { useToast } from '../../components/toast';
import type { Tone } from '../../data/constants';
import { useAdminData } from '../../data/context';
import type { Case, ReferralAttachment, Warning } from '../../data/types';
import {
  adminApi,
  type ApiOwnerEvent,
  type ApiOwnerRequest,
  type ApiOwnerStatus,
  type ApiPossibleOwner,
  type ApiPossibleOwners,
} from '../../live/api';
import { useSubmit } from '../../lib/useSubmit';
import { reportIdOf } from '../../../live/refs';
import { fromServer } from '../../../live/dates';
import { errorMessage } from '../../../preview/lib/errors';
import { fmtDateTime, fromLocalInput, plural, toLocalInput } from '../../../preview/lib/format';

const PAGE_SIZE = 5;
const HIGH_CONFIDENCE_THRESHOLD = 70;
const MAX_MESSAGE = 2000;

function isHighConfidenceCandidate(o: ApiPossibleOwner): boolean {
  if (o.status !== 'identified') return true;
  const score = o.matching?.score;
  if (score === null || score === undefined) return true;
  return score >= HIGH_CONFIDENCE_THRESHOLD;
}
const STATUS_TONE: Record<ApiOwnerStatus, Tone> = {
  identified: 'neutral',
  awaiting: 'amber',
  owner_confirmed: 'brand',
  owner_declined: 'amber',
  verified: 'sage',
  not_confirmed: 'red',
  unable_to_contact: 'ink',
};
const CLASS_TONE: Record<string, Tone> = {
  strong: 'sage',
  potential: 'brand',
  low: 'neutral',
  insufficient: 'neutral',
};
type Decision = 'CONFIRMED_MATCH' | 'NOT_A_MATCH' | 'UNABLE_TO_VERIFY';

export const WARNING_CATEGORIES = [
  'Pet Roaming Without Supervision',
  'Pet Causing Disturbance',
  'Aggressive or Dangerous Animal Behavior',
  'Pet Involved in an Incident',
  'Responsible Pet Ownership Reminder',
  'Other',
] as const;

export const WARNING_WORKFLOW_STATUSES = [
  'Draft',
  'Sent',
  'Acknowledged',
  'Awaiting Owner Response',
  'Responded',
  'Closed',
] as const;

const WARNING_STATUS_TONE: Record<string, Tone> = {
  Draft: 'neutral',
  Sent: 'amber',
  Pending: 'amber',
  Acknowledged: 'sage',
  'Awaiting Owner Response': 'amber',
  Responded: 'brand',
  Closed: 'neutral',
  Resolved: 'neutral',
};

const DEFAULT_OWNERSHIP_VERIFICATION_MESSAGE =
  'Hello! The Subdivision Administration received a report involving an animal that may match your registered pet. We would like to verify whether this animal belongs to you. Please review the details and select Confirm Ownership or Decline Ownership.';

type Open =
  | { kind: 'details'; owner: ApiPossibleOwner; rank: number; isTopMatch: boolean }
  | { kind: 'message'; owner: ApiPossibleOwner; initialType?: 'ownership_verification' | 'direct_message' }
  | { kind: 'warning'; owner: ApiPossibleOwner }
  | { kind: 'unable'; owner: ApiPossibleOwner }
  | { kind: 'decide'; owner: ApiPossibleOwner; decision: Decision };

const when = (iso: string | null | undefined) => (iso ? fmtDateTime(fromServer(iso)) : '');
const newKey = (prefix = 'ov') =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

function canSendOwnerWarning(c: Case, owner?: ApiPossibleOwner): boolean {
  if (c.status === 'closed') return false;
  if (c.identity.status !== 'identified' || c.ownership.status !== 'confirmed') return false;
  if (owner && owner.status !== 'verified') return false;
  return true;
}

export interface OwnerWarningTarget {
  userId: number;
  ownerName: string;
  ownerPhone?: string | null;
  ownerEmail?: string | null;
  ownerAddress?: string | null;
  petId?: number | null;
  petName?: string | null;
  petSpecies?: string | null;
  petBreed?: string | null;
  petColour?: string | null;
  petReference?: string | null;
}

/**
 * Possible Pet Owners (docs/01-system/POSSIBLE_OWNER_VERIFICATION.md): the registered pets linked or matched to this report,
 * with their owner, pet attributes, contact info, Message Owner action, Send Warning action, and verification workflow.
 */
export default function PossibleOwnersBlock({
  c,
  variant = 'block',
}: {
  c: Case;
  variant?: 'block' | 'section';
}) {
  const rid = reportIdOf(c.id);
  const [data, setData] = useState<ApiPossibleOwners | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [open, setOpen] = useState<Open | null>(null);
  const [page, setPage] = useState(1);
  const [showAllLower, setShowAllLower] = useState(false);

  const load = useCallback(() => {
    if (!rid) return;
    adminApi
      .possibleOwners(rid)
      .then((res) => {
        setData(res);
        setLoadError(null);
      })
      .catch((err: unknown) =>
        setLoadError(err instanceof Error ? err.message : 'Could not load the possible owners.'),
      );
  }, [rid]);
  useEffect(() => {
    load();
  }, [load, c.status]);

  useEffect(() => {
    setPage(1);
  }, [rid]);

  if (!rid || (data && !data.applicable)) return null;
  if (!data && !loadError) return null;

  const allCandidates = data?.candidates ?? [];
  const highConfidenceCandidates = allCandidates.filter(isHighConfidenceCandidate);
  const lowerScoringCount = allCandidates.length - highConfidenceCandidates.length;
  const canFilterLower = lowerScoringCount > 0;
  const candidates = canFilterLower && !showAllLower ? highConfidenceCandidates : allCandidates;
  const total = candidates.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const pagedCandidates = candidates.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const body =
    loadError && !data ? (
      <Callout tone="amber">
        {loadError}{' '}
        <Button variant="link" size="sm" onClick={load}>
          Try again
        </Button>
      </Callout>
    ) : data ? (
      <>
        {data.blocked_reason && data.candidates.length > 0 ? (
          <Callout className="mb-3">{data.blocked_reason}</Callout>
        ) : null}
        {allCandidates.length === 0 ? (
          <p className="sa-small sa-text-2">
            No registered pet matches this report yet. When the Pet Registry matching finds one, its owner appears here so you can message them or send an official warning.
          </p>
        ) : (
          <>
            {canFilterLower ? (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#e7e2da] bg-[#faf7f2] px-3 py-2 text-xs">
                <span className="text-[var(--sa-text-2)]">
                  {showAllLower
                    ? `Showing all ${plural(allCandidates.length, 'candidate')} (including ${lowerScoringCount} under ${HIGH_CONFIDENCE_THRESHOLD}%)`
                    : highConfidenceCandidates.length > 0
                      ? `Showing ${plural(highConfidenceCandidates.length, 'high-confidence match')} (≥ ${HIGH_CONFIDENCE_THRESHOLD}%)`
                      : `No high-confidence matches (≥ ${HIGH_CONFIDENCE_THRESHOLD}%) — ${plural(lowerScoringCount, 'lower-scoring candidate')} hidden`}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setShowAllLower((prev) => !prev);
                    setPage(1);
                  }}
                  aria-expanded={showAllLower}
                  className="inline-flex cursor-pointer items-center gap-1.5 font-semibold text-[var(--sa-brand)] hover:underline"
                >
                  <span>
                    {showAllLower
                      ? 'Hide lower-scoring candidates'
                      : `Show lower-scoring candidates (${lowerScoringCount})`}
                  </span>
                  <ChevronDown
                    size={14}
                    aria-hidden="true"
                    className={`transition-transform duration-200 ${showAllLower ? 'rotate-180' : ''}`}
                  />
                </button>
              </div>
            ) : null}
            <ul className="sa-po-list">
              {pagedCandidates.map((o, idx) => {
                const overallIdx = (current - 1) * PAGE_SIZE + idx;
                return (
                  <OwnerCard
                    key={o.pet_id}
                    c={c}
                    o={o}
                    rank={o.rank ?? overallIdx + 1}
                    isTopMatch={Boolean(
                      o.is_top_match ?? (overallIdx === 0 && (o.matching?.score ?? 0) > 0),
                    )}
                    onOpen={setOpen}
                  />
                );
              })}
            </ul>
            {total > PAGE_SIZE ? (
              <div className="sa-pager mt-3">
                <span>
                  Showing {(current - 1) * PAGE_SIZE + 1}–{Math.min(current * PAGE_SIZE, total)} of{' '}
                  {plural(total, 'candidate')}
                </span>
                <span className="flex items-center gap-2">
                  <Button
                    size="sm"
                    disabled={current <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <span className="sa-num">
                    Page {current} of {totalPages}
                  </span>
                  <Button
                    size="sm"
                    disabled={current >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next
                  </Button>
                </span>
              </div>
            ) : null}
          </>
        )}
        <p className="sa-hint mt-3">
          A possible match is not proof of ownership. The owner's Confirm or Decline is supporting evidence only: review it with the photos and registered pet details, then make the final ownership decision.
        </p>
      </>
    ) : null;

  const dialog =
    open && data ? (
      open.kind === 'details' ? (
        <OwnerDetailsDialog
          c={c}
          o={open.owner}
          rank={open.rank}
          isTopMatch={open.isTopMatch}
          animal={data.animal}
          onClose={() => setOpen(null)}
          onOpenMessage={() =>
            setOpen({
              kind: 'message',
              owner: open.owner,
              initialType:
                open.owner.status === 'identified' || open.owner.status === 'unable_to_contact'
                  ? 'ownership_verification'
                  : 'direct_message',
            })
          }
          onOpenWarning={() => setOpen({ kind: 'warning', owner: open.owner })}
        />
      ) : open.kind === 'warning' ? (
        canSendOwnerWarning(c, open.owner) ? (
        <SendOwnerWarningDialog
          c={c}
          target={{
            userId: open.owner.resident.user_id,
            ownerName: open.owner.resident.name,
            ownerPhone: open.owner.resident.phone,
            ownerEmail: open.owner.resident.email,
            ownerAddress: open.owner.resident.address || open.owner.registered_address,
            petId: open.owner.pet_id,
            petName: open.owner.pet.name,
            petSpecies: open.owner.pet.species,
            petBreed: open.owner.pet.breed,
            petColour: open.owner.pet.colour,
            petReference: open.owner.pet.reference_code,
          }}
          onClose={() => setOpen(null)}
          onSent={() => {
            load();
            setOpen(null);
          }}
        />
        ) : null
      ) : (
        <OwnerDialog
          open={open}
          data={data}
          reportId={rid}
          caseId={c.id}
          onClose={() => setOpen(null)}
          onDone={(next) => {
            if (next) setData(next);
            else load();
            setOpen(null);
          }}
        />
      )
    ) : null;

  if (variant === 'section') {
    return (
      <section className="sa-mc-sec" aria-labelledby="mc-possible-owners">
        <div className="sa-mc-sec__head">
          <h2 id="mc-possible-owners" className="sa-mc-sec__title">
            Possible Pet Owners
          </h2>
        </div>
        {body}
        {dialog}
      </section>
    );
  }
  return (
    <Block
      title={
        <span className="inline-flex items-center gap-2">
          <UserRoundSearch size={17} className="text-[var(--sa-brand)]" aria-hidden="true" />
          <span>Possible Pet Owners</span>
        </span>
      }
      description="Registered pets that may be this animal, and their owners. Visible to authorized administrators only."
    >
      {body}
      {dialog}
    </Block>
  );
}

function OwnerCard({
  c,
  o,
  rank,
  isTopMatch,
  onOpen,
}: {
  c: Case;
  o: ApiPossibleOwner;
  rank: number;
  isTopMatch: boolean;
  onOpen: (open: Open) => void;
}) {
  const r = o.request;
  const m = o.matching;
  const facts = [
    o.pet.species ? `Species: ${o.pet.species}` : null,
    o.pet.breed ? `Breed: ${o.pet.breed}` : null,
    o.pet.colour ? `Colors: ${o.pet.colour}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const reasons =
    m?.reasons && m.reasons.length > 0
      ? m.reasons
      : m?.explanation
        ? [m.explanation]
        : [];
  const history = [...o.earlier_requests]
    .reverse()
    .flatMap((x) => x.events)
    .concat(r?.events ?? []);
  const hasValidOwner = Boolean(o.resident?.user_id);
  const closed = c.status === 'closed';

  return (
    <li className="sa-po rounded-xl border border-[#e7e2da] bg-gradient-to-b from-white to-[#fcfaf6] p-4 shadow-xs transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-[#d6cfc7] hover:shadow-sm">
      <div className="sa-po__top">
        {o.pet.photo_url ? (
          <img
            className="sa-po__photo"
            src={o.pet.photo_url}
            alt={`Registered photo of ${o.pet.name}`}
            loading="lazy"
          />
        ) : (
          <span className="sa-po__photo sa-po__photo--none" aria-hidden="true">
            <PawPrint size={18} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            <span className="sa-semibold">
              {rank}. {o.resident.name} – {o.pet.name}
            </span>
            {isTopMatch ? (
              <Badge tone="sage" dot>
                Highest-ranked candidate
              </Badge>
            ) : null}
            <Badge tone={STATUS_TONE[o.status]} dot>
              {o.status_label}
            </Badge>
            <span className="sa-ref text-xs">Case {c.id}</span>
          </p>
          <p className="sa-small mt-0.5">
            Registered pet <span className="sa-semibold">{o.pet.name}</span>
            {o.pet.reference_code ? (
              <span className="sa-text-3"> · {o.pet.reference_code}</span>
            ) : null}
            <span className="sa-text-3"> · Pet ID #{o.pet_id}</span>
          </p>
          {facts ? <p className="sa-meta mt-0.5">{facts}</p> : null}
          {reasons.length > 0 ? (
            <div className="mt-2 rounded-lg border border-[#ede7de] bg-[#faf7f2]/85 px-3 py-1.5 text-xs leading-relaxed text-[var(--sa-text-2)]">
              <span className="font-semibold text-[var(--sa-text-1)]">Reasons: </span>
              {reasons.join(' ')}
            </div>
          ) : null}
          <div className="sa-meta mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5">
            {o.resident.phone ? (
              <span className="inline-flex items-center gap-1">
                <Phone size={11} /> {o.resident.phone}
              </span>
            ) : null}
            {o.resident.email ? (
              <span className="inline-flex items-center gap-1">
                <Mail size={11} /> {o.resident.email}
              </span>
            ) : null}
            {o.registered_address || o.resident.address || o.resident.subdivision ? (
              <span className="inline-flex items-center gap-1">
                <MapPin size={11} /> {o.registered_address || o.resident.address || o.resident.subdivision}
              </span>
            ) : null}
          </div>
        </div>
        {m && m.score !== null ? (
          <div className="sa-po__score">
            <span className="sa-po__pct">{m.score}%</span>
            {m.classification_label ? (
              <Badge tone={CLASS_TONE[m.classification ?? ''] ?? 'neutral'}>
                {m.classification_label}
              </Badge>
            ) : null}
            {m.coverage !== null ? (
              <span className="sa-meta">{m.coverage}% of the information</span>
            ) : null}
          </div>
        ) : m?.method === 'manual' ? (
          <span className="sa-meta">Staff-identified match</span>
        ) : null}
      </div>

      {m && m.attributes.some((a) => a.available) ? (
        <ul className="mt-3 grid list-none grid-cols-1 gap-1.5 p-0 sm:grid-cols-2" aria-label="Matching attributes">
          {m.attributes
            .filter((a) => a.available)
            .map((a) => (
              <li
                key={a.key}
                className="flex flex-col gap-0.5 rounded-lg border border-[#ede7de] bg-white/80 px-2.5 py-1.5 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-[var(--sa-text-1)]">{a.label}</span>
                  {a.score !== null ? (
                    <span className="rounded-full bg-[#f5f0e8] px-1.5 py-0.5 text-[11px] font-semibold text-[#57534e]">
                      {a.score}%
                    </span>
                  ) : null}
                </div>
                {a.explanation ? (
                  <span className="text-[11px] leading-snug text-[var(--sa-text-2)]">{a.explanation}</span>
                ) : null}
              </li>
            ))}
        </ul>
      ) : null}

      {r ? <RequestLine r={r} /> : null}

      <div className="sa-po__actions">
        <Button
          variant="secondary"
          size="sm"
          icon={Eye}
          onClick={() => onOpen({ kind: 'details', owner: o, rank, isTopMatch })}
        >
          View Details
        </Button>

        {hasValidOwner ? (
          <>
            {!closed ? (
              <>
                <Button
                  variant="primary"
                  size="sm"
                  icon={MessageSquare}
                  onClick={() =>
                    onOpen({
                      kind: 'message',
                      owner: o,
                      initialType:
                        o.status === 'identified' || o.status === 'unable_to_contact'
                          ? 'ownership_verification'
                          : 'direct_message',
                    })
                  }
                >
                  Message Owner
                </Button>
                {canSendOwnerWarning(c, o) ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={ShieldAlert}
                    onClick={() => onOpen({ kind: 'warning', owner: o })}
                  >
                    Send Warning
                  </Button>
                ) : null}
              </>
            ) : null}

            {r?.thread_id ? (
              <LinkButton size="sm" icon={MessageSquare} to={adminPath(`/messages/${r.thread_id}`)}>
                Open conversation
                {r.unread > 0 ? <Badge tone="brand">{r.unread} new</Badge> : null}
              </LinkButton>
            ) : null}

            {o.actions.finalize ? (
              <>
                <Button
                  variant="primary"
                  size="sm"
                  icon={CheckCircle2}
                  onClick={() =>
                    onOpen({ kind: 'decide', owner: o, decision: 'CONFIRMED_MATCH' })
                  }
                >
                  Verify ownership
                </Button>
                <Button
                  size="sm"
                  onClick={() => onOpen({ kind: 'decide', owner: o, decision: 'NOT_A_MATCH' })}
                >
                  Not the owner
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    onOpen({ kind: 'decide', owner: o, decision: 'UNABLE_TO_VERIFY' })
                  }
                >
                  Needs more information
                </Button>
              </>
            ) : null}

            {o.actions.mark_unable ? (
              <Button
                size="sm"
                variant="ghost"
                icon={PhoneOff}
                onClick={() => onOpen({ kind: 'unable', owner: o })}
              >
                Unable to contact
              </Button>
            ) : null}
          </>
        ) : null}
      </div>

      {history.length > 0 ? (
        <details className="sa-po__history">
          <summary>
            <History size={13} aria-hidden="true" /> Verification & communication history (
            {history.length})
          </summary>
          <ol>
            {history.map((e, i) => (
              <EventRow key={`${e.at}-${e.kind}-${i}`} e={e} />
            ))}
          </ol>
        </details>
      ) : null}
    </li>
  );
}

function RequestLine({ r }: { r: ApiOwnerRequest }) {
  return (
    <div className="sa-po__req">
      {r.requested_at ? (
        <p>
          Contacted {when(r.requested_at)}
          {r.requested_by_name ? ` by ${r.requested_by_name}` : ''}
          {r.follow_up_count > 0
            ? ` · ${r.follow_up_count} follow-up${r.follow_up_count === 1 ? '' : 's'}, last ${when(r.last_follow_up_at)}`
            : ''}
        </p>
      ) : null}
      {r.owner_response ? (
        <p>
          <span className="sa-semibold">
            {r.owner_response === 'YES'
              ? 'Owner Confirmed – Pending Admin Review'
              : 'Owner Declined – Pending Admin Review'}
          </span>
          {r.owner_response_at ? ` · ${when(r.owner_response_at)}` : ''}
          {r.owner_note ? <span className="block sa-text-2">“{r.owner_note}”</span> : null}
        </p>
      ) : r.raw_status === 'AWAITING_OWNER_CONFIRMATION' ? (
        <p className="sa-text-2">Awaiting Owner Response. Silence never confirms or declines ownership.</p>
      ) : null}
      {r.final_label ? (
        <p>
          Final verification: <span className="sa-semibold">{r.final_label}</span>
          {r.final_by_name ? ` by ${r.final_by_name}` : ''}
          {r.final_at ? ` · ${when(r.final_at)}` : ''}
        </p>
      ) : null}
    </div>
  );
}

function EventRow({ e }: { e: ApiOwnerEvent }) {
  const who = e.by_name ?? (e.kind === 'identified' ? 'Pet Registry matching' : null);
  return (
    <li>
      <span className="sa-text-3">{when(e.at)}</span> ·{' '}
      <span className="sa-semibold">
        {e.label}
        {e.attempt ? ` #${e.attempt}` : ''}
      </span>
      {who ? ` · ${who}` : ''}
      {e.note ? <span className="block sa-text-2">{e.note}</span> : null}
    </li>
  );
}

const DECISION_COPY: Record<
  Decision,
  { title: string; button: string; done: string; hint: string }
> = {
  CONFIRMED_MATCH: {
    title: 'Finalize Ownership Verification',
    button: 'Verify Ownership',
    done: 'Ownership verified. The owner and case record have been updated.',
    hint: 'Record how you verified ownership (e.g., owner confirmation, markings, photos, or inspection). Verifying links this case to the registered pet and marks status as Ownership Verified.',
  },
  NOT_A_MATCH: {
    title: 'Mark Ownership Not Verified',
    button: 'Record as Not Verified',
    done: 'Recorded as Ownership Not Verified. The owner was notified.',
    hint: 'Explain why this animal is not their pet. You can contact another possible owner afterwards.',
  },
  UNABLE_TO_VERIFY: {
    title: 'Needs More Information',
    button: 'Save',
    done: 'Saved. You can ask the owner for more details in the conversation.',
    hint: 'Record what information is still needed before finalizing.',
  },
};

function OwnerDetailsDialog({
  c,
  o,
  rank,
  isTopMatch,
  animal,
  onClose,
  onOpenMessage,
  onOpenWarning,
}: {
  c: Case;
  o: ApiPossibleOwner;
  rank: number;
  isTopMatch: boolean;
  animal: ApiPossibleOwners['animal'];
  onClose: () => void;
  onOpenMessage: () => void;
  onOpenWarning: () => void;
}) {
  const { openMedia } = useMediaViewer();
  const m = o.matching;
  const hasValidOwner = Boolean(o.resident?.user_id);
  const closed = c.status === 'closed';

  const casePhotoUrl =
    c.evidence?.find((e) => e.kind === 'photo' && e.url)?.url ||
    c.evidence?.find((e) => Boolean(e.url))?.url ||
    null;
  const petPhotoUrl = o.pet.photo_url || null;

  const reasons =
    m?.reasons && m.reasons.length > 0
      ? m.reasons
      : m?.explanation
        ? [m.explanation]
        : [];

  const history = [...o.earlier_requests]
    .reverse()
    .flatMap((x) => x.events)
    .concat(o.request?.events ?? []);

  return (
    <Dialog
      size="lg"
      title={`Candidate #${rank}: ${o.resident.name} – ${o.pet.name}`}
      description={
        <span className="flex flex-wrap items-center gap-2 mt-1">
          {isTopMatch ? (
            <Badge tone="sage" dot>
              Highest-ranked candidate
            </Badge>
          ) : null}
          <Badge tone={STATUS_TONE[o.status]} dot>
            {o.status_label}
          </Badge>
          <span className="sa-ref text-xs">Case {c.id}</span>
          {m?.score !== null && m?.score !== undefined ? (
            <Badge tone={CLASS_TONE[m.classification ?? ''] ?? 'neutral'}>
              {m.score}% · {m.classification_label ?? 'Match'}
            </Badge>
          ) : null}
        </span>
      }
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between w-full">
          <Button onClick={onClose}>Close</Button>
          <div className="flex items-center gap-2">
            {hasValidOwner && !closed ? (
              <>
                {canSendOwnerWarning(c, o) ? (
                  <Button
                    variant="secondary"
                    icon={ShieldAlert}
                    onClick={() => {
                      onClose();
                      onOpenWarning();
                    }}
                  >
                    Send Warning
                  </Button>
                ) : null}
                <Button
                  variant="primary"
                  icon={MessageSquare}
                  onClick={() => {
                    onClose();
                    onOpenMessage();
                  }}
                >
                  Message Owner
                </Button>
              </>
            ) : null}
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Side-by-side Photo & Profile Header */}
        <div className="sa-cmp__heads">
          <div className="sa-cmp__head p-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-sand/20">
            <div className="flex items-start gap-3">
              {casePhotoUrl ? (
                <img
                  src={casePhotoUrl}
                  alt={`Photo of animal in Case ${c.id}`}
                  className="w-20 h-20 rounded-lg object-cover border border-gray-200 dark:border-gray-700 cursor-zoom-in hover:scale-105 transition-transform shrink-0"
                  onClick={() =>
                    openMedia([
                      {
                        url: casePhotoUrl,
                        kind: 'photo',
                        title: `Reported Animal (Case ${c.id})`,
                        caption: [c.animal?.type, c.animal?.breed, c.animal?.color]
                          .filter(Boolean)
                          .join(' · '),
                      },
                    ])
                  }
                />
              ) : (
                <span className="w-20 h-20 rounded-lg border border-gray-200 dark:border-gray-700 bg-sand flex items-center justify-center text-gray-400 shrink-0">
                  <PawPrint size={28} />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge tone="brand">Reported Animal</Badge>
                  <span className="sa-ref text-xs">Case {c.id}</span>
                </div>
                <p className="font-semibold text-base mt-1 truncate">
                  {c.title || [c.animal?.type, c.animal?.breed].filter(Boolean).join(' · ') || `Case ${c.id}`}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {c.reporter?.name ? `Reported by ${c.reporter.name}` : 'Community Report'} · {when(c.reportedAt)}
                </p>
              </div>
            </div>
          </div>

          <div className="sa-cmp__head p-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-sand/20">
            <div className="flex items-start gap-3">
              {petPhotoUrl ? (
                <img
                  src={petPhotoUrl}
                  alt={`Registered photo of ${o.pet.name}`}
                  className="w-20 h-20 rounded-lg object-cover border border-gray-200 dark:border-gray-700 cursor-zoom-in hover:scale-105 transition-transform shrink-0"
                  onClick={() =>
                    openMedia([
                      {
                        url: petPhotoUrl,
                        kind: 'photo',
                        title: `Registered Pet: ${o.pet.name}`,
                        caption: `${o.pet.species || ''} · ${o.pet.breed || ''}`,
                      },
                    ])
                  }
                />
              ) : (
                <span className="w-20 h-20 rounded-lg border border-gray-200 dark:border-gray-700 bg-sand flex items-center justify-center text-gray-400 shrink-0">
                  <PawPrint size={28} />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge tone="sage">Registered Pet</Badge>
                  <span className="sa-ref text-xs">Pet #{o.pet_id}</span>
                </div>
                <p className="font-semibold text-base mt-1 truncate">
                  {o.pet.name} {o.pet.reference_code ? `(${o.pet.reference_code})` : ''}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Owner: <span className="font-medium text-gray-700 dark:text-gray-300">{o.resident.name}</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Side-by-Side Comparison Table */}
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
          <table className="sa-cmp__table">
            <thead>
              <tr>
                <th scope="col" className="w-[140px]">
                  Attribute
                </th>
                <th scope="col">Reported Animal (Case {c.id})</th>
                <th scope="col">Registered Pet ({o.pet.name})</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Species</th>
                <td>{c.animal?.type || animal?.animal_type || '—'}</td>
                <td>{o.pet.species || '—'}</td>
              </tr>
              <tr>
                <th scope="row">Breed</th>
                <td>{c.animal?.breed || animal?.breed || 'Not specified'}</td>
                <td>{o.pet.breed || 'Not recorded'}</td>
              </tr>
              <tr>
                <th scope="row">Color & Coat</th>
                <td>{c.animal?.color || animal?.colour || 'Not specified'}</td>
                <td>{o.pet.colour || 'Not recorded'}</td>
              </tr>
              <tr>
                <th scope="row">Size & Condition</th>
                <td>
                  {[c.animal?.customType || animal?.size, c.animal?.condition]
                    .filter(Boolean)
                    .join(' · ') || 'Not specified'}
                </td>
                <td>{o.pet.size || 'Not recorded'}</td>
              </tr>
              <tr>
                <th scope="row">Physical Details</th>
                <td>{c.animal?.description || c.description || 'Not specified'}</td>
                <td>{o.pet.markings || 'None recorded'}</td>
              </tr>
              <tr>
                <th scope="row">Location</th>
                <td>{[c.location?.detail, c.location?.area].filter(Boolean).join(' · ') || 'Not specified'}</td>
                <td>{o.registered_address || o.resident.address || o.resident.subdivision || 'Not recorded'}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Accuracy Scoring & Multi-Attribute Breakdown */}
        {m ? (
          <div className="sa-mscore">
            <div className="sa-mscore__head">
              <span className="sa-mscore__total">{m.score}%</span>
              <span className="sa-text-2">Matching Accuracy</span>
              {m.classification_label ? (
                <Badge tone={CLASS_TONE[m.classification ?? ''] ?? 'neutral'}>
                  {m.classification_label}
                </Badge>
              ) : null}
              {m.coverage !== null ? (
                <span className="sa-small sa-text-3">
                  {m.coverage}% of information compared
                </span>
              ) : null}
            </div>

            {reasons.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {reasons.map((r, i) => (
                  <Badge key={i} tone="sage" icon={Check}>
                    {r}
                  </Badge>
                ))}
              </div>
            ) : null}

            {m.attributes && m.attributes.length > 0 ? (
              <ul className="sa-mscore__attrs" aria-label="Matching details">
                {m.attributes.map((a) => {
                  const score = a.score;
                  const verdict =
                    a.verdict ||
                    (score !== null && score >= 80
                      ? 'match'
                      : score !== null && score >= 40
                        ? 'similar'
                        : 'differs');
                  return (
                    <li key={a.key} className="sa-mscore__attr" data-available={a.available}>
                      <span className="sa-mscore__name">{a.label}</span>
                      <span className="sa-mscore__num">
                        {a.available && score !== null ? `${score}%` : '—'}
                      </span>
                      <span className="sa-mscore__text">
                        {a.explanation || 'No details'}
                        {a.weight ? <span className="sa-text-3"> · weight {a.weight}%</span> : null}
                      </span>
                      {a.available && score !== null ? (
                        <span
                          className="sa-mscore__bar"
                          data-verdict={verdict}
                          role="img"
                          aria-label={`${a.label}: ${score}%`}
                        >
                          <span style={{ width: `${Math.min(100, Math.max(0, score))}%` }} />
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        ) : null}

        {/* Registered Owner & Household Information */}
        <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-sand/30 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="font-semibold text-base flex items-center gap-2">
                <User size={16} className="text-gray-500" />
                {o.resident.name}
              </h4>
              <p className="text-xs text-gray-500 mt-0.5">
                Registered Owner · User ID #{o.resident.user_id} · Pet #{o.pet_id} ({o.pet.name})
              </p>
            </div>
            <div className="flex items-center gap-2">
              <LinkButton
                size="sm"
                to={adminPath(`/pets/${o.pet_id}`)}
                target="_blank"
                rel="noopener noreferrer"
                icon={ExternalLink}
              >
                Pet Profile
              </LinkButton>
              {o.resident.user_id ? (
                <LinkButton
                  size="sm"
                  to={adminPath(`/residents/${o.resident.user_id}`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  icon={ExternalLink}
                >
                  Resident Profile
                </LinkButton>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm pt-2 border-t border-gray-200 dark:border-gray-800">
            <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
              <Phone size={14} className="text-gray-400 shrink-0" />
              <span>{o.resident.phone || 'No phone recorded'}</span>
            </div>
            <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
              <Mail size={14} className="text-gray-400 shrink-0" />
              <span className="truncate">{o.resident.email || 'No email recorded'}</span>
            </div>
            <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
              <MapPin size={14} className="text-gray-400 shrink-0" />
              <span className="truncate">
                {o.registered_address || o.resident.address || o.resident.subdivision || 'No address recorded'}
              </span>
            </div>
          </div>
        </div>

        {/* Verification & Communication History */}
        {history.length > 0 ? (
          <details className="sa-po__history">
            <summary>
              <History size={13} aria-hidden="true" /> Verification & communication history ({history.length})
            </summary>
            <ol>
              {history.map((e, i) => (
                <EventRow key={`${e.at}-${e.kind}-${i}`} e={e} />
              ))}
            </ol>
          </details>
        ) : null}
      </div>
    </Dialog>
  );
}

function OwnerDialog({
  open,
  data,
  reportId,
  caseId,
  onClose,
  onDone,
}: {
  open: Exclude<Open, { kind: 'warning' | 'details' }>;
  data: ApiPossibleOwners;
  reportId: number;
  caseId: string;
  onClose: () => void;
  onDone: (next: ApiPossibleOwners | null) => void;
}) {
  const { loadCase } = useAdminData();
  const toast = useToast();
  const { pending, error, run } = useSubmit();
  const contactAutofill = useSubdivisionContactAutofill('phone');
  const o = open.owner;

  const [msgType, setMsgType] = useState<'ownership_verification' | 'direct_message'>(
    open.kind === 'message'
      ? (open.initialType ?? 'ownership_verification')
      : 'ownership_verification',
  );

  const defaultVerificationText = data.template || DEFAULT_OWNERSHIP_VERIFICATION_MESSAGE;
  const defaultFollowUpText = `Hello! We are following up regarding Case ${caseId} involving an animal that may match your registered pet ${o.pet.name}. Please check your messages and let us know if you need any assistance.`;

  const [text, setText] = useState(() => {
    if (open.kind === 'message') {
      return (open.initialType ?? 'ownership_verification') === 'ownership_verification'
        ? defaultVerificationText
        : defaultFollowUpText;
    }
    return '';
  });
  const [key] = useState(() => newKey('msg'));

  const handleTypeChange = (nextType: 'ownership_verification' | 'direct_message') => {
    setMsgType(nextType);
    if (nextType === 'ownership_verification') {
      setText(defaultVerificationText);
    } else if (text === defaultVerificationText || !text.trim()) {
      setText(defaultFollowUpText);
    }
  };

  const minimum = open.kind === 'unable' || open.kind === 'decide' ? 5 : 1;
  const ready = text.trim().length >= minimum && text.length <= MAX_MESSAGE;
  const a = data.animal;

  const submit = async () => {
    if (!ready || pending) return;
    let next: ApiPossibleOwners | null = null;
    const ok = await run(async () => {
      if (open.kind === 'message') {
        next = await adminApi.messagePossibleOwner(
          reportId,
          o.pet_id,
          msgType,
          text.trim(),
          key,
          contactAutofill.contactMethod,
          null,
        );
        await loadCase(caseId);
      } else if (open.kind === 'unable' && o.request) {
        next = await adminApi.markOwnerUnreachable(o.request.request_id, text.trim());
      } else if (open.kind === 'decide') {
        await adminApi.decideOwnership(reportId, o.pet_id, open.decision, text.trim());
        await loadCase(caseId);
      }
    });
    if (!ok) return;
    toast.success(
      open.kind === 'message'
        ? msgType === 'ownership_verification'
          ? `Ownership Verification request sent to ${o.resident.name} and delivered to their Resident Inbox.`
          : `Message sent to ${o.resident.name} and delivered to their Resident Inbox.`
        : open.kind === 'unable'
          ? 'Recorded as unable to contact. Ownership was not decided.'
          : DECISION_COPY[open.decision].done,
    );
    onDone(next);
  };

  const title =
    open.kind === 'message'
      ? `Message Owner — ${o.resident.name}`
      : open.kind === 'unable'
        ? 'Unable to contact'
        : DECISION_COPY[open.decision].title;
  const button =
    open.kind === 'message'
      ? msgType === 'ownership_verification'
        ? 'Send Ownership Verification'
        : 'Send Message'
      : open.kind === 'unable'
        ? 'Record'
        : DECISION_COPY[open.decision].button;

  return (
    <Dialog
      size="lg"
      title={title}
      description={
        <>
          Case {caseId} · Owner: <strong>{o.resident.name}</strong> · Pet:{' '}
          <strong>{o.pet.name}</strong> ({[o.pet.species, o.pet.breed, o.pet.colour].filter(Boolean).join(' · ')})
        </>
      }
      onClose={onClose}
      dirty={text.trim() !== ''}
      dismissible={!pending}
      footer={({ requestClose }) => (
        <>
          <Button onClick={requestClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={
              open.kind === 'message'
                ? Send
                : open.kind === 'decide' && open.decision === 'CONFIRMED_MATCH'
                  ? CheckCircle2
                  : UserRoundSearch
            }
            loading={pending}
            disabled={!ready}
            onClick={() => {
              void submit();
            }}
          >
            {button}
          </Button>
        </>
      )}
    >
      <div className="flex flex-col gap-3.5">
        {open.kind === 'message' ? (
          <>
            {/* Clearly separate Recipient (Pet Owner) Personal Contact Details */}
            <div className="rounded-lg border border-[var(--sa-border)] bg-[var(--sa-surface-2)] px-3.5 py-2.5 text-xs">
              <span className="sa-eyebrow">Recipient (Registered Pet Owner) Personal Contact Details</span>
              <p className="mt-0.5 font-medium text-[var(--sa-text-1)]">
                {o.resident.name}
                {o.resident.phone ? ` · Phone: ${o.resident.phone}` : ''}
                {o.resident.email ? ` · Email: ${o.resident.email}` : ''}
                {o.registered_address || o.resident.address
                  ? ` · Address: ${o.registered_address || o.resident.address}`
                  : ''}
              </p>
            </div>

            <Field label="Message Type" required>
              <Select
                value={msgType}
                onChange={(e) =>
                  handleTypeChange(e.target.value as 'ownership_verification' | 'direct_message')
                }
              >
                <option value="ownership_verification">
                  Ownership Verification Request (with Confirm / Decline Ownership actions)
                </option>
                <option value="direct_message">
                  Direct / Follow-up Message to Owner
                </option>
              </Select>
            </Field>

            <Callout>
              This message will be delivered directly to <strong>{o.resident.name}</strong>’s Resident Inbox and generate an automatic in-app notification for Case <strong>{caseId}</strong>
              {a
                ? ` (${[a.animal_type, a.breed, a.colour, a.size].filter(Boolean).join(' · ') || 'reported animal'})`
                : ''}
              . The original reporter’s identity and private contact details are never exposed.
            </Callout>
          </>
        ) : null}

        {open.kind === 'unable' ? (
          <Callout tone="amber">
            This ends the request without an answer. It never counts as a confirmation or decline, and you can contact the owner again later.
          </Callout>
        ) : null}

        {open.kind === 'decide' && o.request?.owner_response === 'YES' ? (
          <Callout tone="sage" title="Owner Confirmed – Pending Administrator Verification">
            {o.request.owner_note
              ? `Owner's note: “${o.request.owner_note}”`
              : 'The owner confirmed that this animal is their registered pet.'}
          </Callout>
        ) : null}

        <Field
          label={
            open.kind === 'message'
              ? 'Message Content'
              : open.kind === 'unable'
                ? 'What was tried'
                : 'Verification Notes'
          }
          required
          hint={
            open.kind === 'message'
              ? `Review and edit the message before sending. ${text.length}/${MAX_MESSAGE}`
              : open.kind === 'decide'
                ? DECISION_COPY[open.decision].hint
                : 'For example: two follow-ups and a house visit, nobody answered.'
          }
        >
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={open.kind === 'message' ? 6 : 4}
            maxLength={MAX_MESSAGE}
            disabled={pending}
          />
        </Field>
        {error ? <FormError message={error} /> : null}
      </div>
    </Dialog>
  );
}

/**
 * 3. Send Official Warning Dialog
 * Allows authorized Subdivision Admins to create, preview, confirm, and send an official warning
 * directly to a registered pet owner's Resident account with automatic notification and Inbox delivery.
 */
export function SendOwnerWarningDialog({
  c,
  target,
  onClose,
  onSent,
}: {
  c: Case;
  target: OwnerWarningTarget;
  onClose: () => void;
  onSent?: () => void;
}) {
  const { loadCase } = useAdminData();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const contactAutofill = useSubdivisionContactAutofill('phone');

  const [category, setCategory] = useState<string>(WARNING_CATEGORIES[0]);
  const [warningLevel, setWarningLevel] = useState<string>('1st Warning');
  const [subject, setSubject] = useState<string>(
    () =>
      `Official Warning: ${WARNING_CATEGORIES[0]}${target.petName ? ` — ${target.petName}` : ''} (${c.id})`,
  );
  const [message, setMessage] = useState<string>(
    () =>
      `Dear ${target.ownerName},\n\nThe Subdivision Administration received a report (${c.id}) involving your registered pet${target.petName ? ` ${target.petName}` : ''}. Please ensure that your pet is properly supervised and complies with subdivision pet ownership guidelines.\n\nPlease review this official warning in your account and acknowledge receipt. You may also send a response or clarification through your inbox.`,
  );
  const [issueDate, setIssueDate] = useState<string>(() => toLocalInput(new Date()));
  const [additionalDetails, setAdditionalDetails] = useState<string>('');
  const [adminNotes, setAdminNotes] = useState<string>('');
  const [documents, setDocuments] = useState<ReferralAttachment[]>([]);
  const [uploading, setUploading] = useState(false);

  const [step, setStep] = useState<'form' | 'preview'>('form');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [reqKey] = useState(() => newKey('warn'));

  const handleCategoryChange = (nextCategory: string) => {
    setCategory(nextCategory);
    setSubject(
      `Official Warning: ${nextCategory}${target.petName ? ` — ${target.petName}` : ''} (${c.id})`,
    );
  };

  const handleUploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const rid = reportIdOf(c.id);
    if (!rid) return;
    setUploading(true);
    setErr('');
    try {
      const added: ReferralAttachment[] = [];
      for (const file of Array.from(files)) {
        const res = await adminApi.uploadReferralDocument(rid, file);
        added.push({
          name: res.name || file.name,
          url: res.url,
          type: res.type || 'document',
          uploadedAt: res.uploaded_at || new Date().toISOString(),
        });
      }
      setDocuments((prev) => [...prev, ...added]);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const validSubject = subject.trim().length >= 3;
  const validMessage = message.trim().length >= 10;
  const isValid = validSubject && validMessage && Boolean(issueDate);

  const handleProceedToPreview = () => {
    setTried(true);
    setErr('');
    if (!isValid) return;
    setStep('preview');
  };

  const handleConfirmSend = async () => {
    if (!isValid || busy) return;
    const rid = reportIdOf(c.id);
    setBusy(true);
    setErr('');
    try {
      const contactLine = contactAutofill.contactDetail.trim()
        ? `Subdivision Office Contact (${contactAutofill.methodDisplayLabel}): ${contactAutofill.contactDetail.trim()}${contactAutofill.contactPerson.trim()
          ? ` · Representative: ${contactAutofill.contactPerson.trim()}`
          : ''
        }`
        : '';
      const mergedAdditional = [additionalDetails.trim(), contactLine]
        .filter(Boolean)
        .join('\n');
      const overrides: Record<string, string> = {};
      if (contactAutofill.contactMethod === 'phone' && contactAutofill.contactDetail.trim()) {
        overrides.subdivision_phone = contactAutofill.contactDetail.trim();
      } else if (contactAutofill.contactMethod === 'email' && contactAutofill.contactDetail.trim()) {
        overrides.subdivision_email = contactAutofill.contactDetail.trim();
      } else if (
        contactAutofill.contactMethod === 'in_person' &&
        contactAutofill.contactDetail.trim()
      ) {
        overrides.subdivision_address = contactAutofill.contactDetail.trim();
      }

      await adminApi.issueWarning({
        user_id: target.userId,
        pet_id: target.petId ?? null,
        report_id: rid ?? null,
        warning_level: warningLevel,
        warning_category: category,
        warning_subject: subject.trim(),
        warning_message: message.trim(),
        description: message.trim(),
        issue_date: fromLocalInput(issueDate),
        additional_details: mergedAdditional || null,
        supporting_documents: documents,
        admin_notes: adminNotes.trim() || null,
        workflow_status: 'Sent',
        field_overrides: overrides,
        client_request_id: reqKey,
      });
      await loadCase(c.id);
      toast.success(
        `Official warning sent to ${target.ownerName}. Delivered to their Resident account with an in-app notification.`,
      );
      if (onSent) onSent();
      else onClose();
    } catch (e) {
      setErr(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Dialog
      size="lg"
      title={
        step === 'preview'
          ? 'Preview & Confirm Official Warning'
          : `Send Official Warning — ${target.ownerName}`
      }
      description={`Case ${c.id} · ${c.title}. This official warning will be delivered to the owner's Resident account and generate an in-app notification.`}
      onClose={onClose}
      footer={
        step === 'preview' ? (
          <div className="flex w-full items-center justify-between gap-2">
            <Button variant="ghost" disabled={busy} onClick={() => setStep('form')}>
              ← Back to Edit
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" disabled={busy} onClick={onClose}>
                Cancel
              </Button>
              <Button
                variant="primary"
                icon={ShieldAlert}
                loading={busy}
                onClick={() => void handleConfirmSend()}
              >
                Confirm & Send Warning
              </Button>
            </div>
          </div>
        ) : (
          <>
            <Button variant="ghost" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleProceedToPreview}>
              Preview Warning →
            </Button>
          </>
        )
      }
    >
      <div className="space-y-4">
        {err ? <Callout tone="red">{err}</Callout> : null}

        {step === 'preview' ? (
          <div className="space-y-4">
            <Callout tone="amber" title="Confirm Official Warning Details">
              Please review the warning content below. Upon confirmation, this warning will be saved, delivered to{' '}
              <strong>{target.ownerName}</strong>’s Resident account and Inbox, and trigger an automatic in-app notification.
            </Callout>

            <div className="rounded-xl border border-[var(--sa-border)] bg-[var(--sa-surface-2)] p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--sa-border)] pb-2.5">
                <div>
                  <span className="sa-eyebrow">{category}</span>
                  <h4 className="text-base font-semibold text-[var(--sa-text-1)]">{subject.trim()}</h4>
                </div>
                <Badge tone="amber">{warningLevel}</Badge>
              </div>

              <Kv
                wide
                rows={[
                  ['Owner', target.ownerName],
                  [
                    'Registered Pet',
                    target.petName
                      ? `${target.petName} (${[target.petSpecies, target.petBreed, target.petColour].filter(Boolean).join(' · ')})`
                      : 'Not specified',
                  ],
                  ['Related Case Reference', `${c.id} · ${c.title}`],
                  ['Warning Category', category],
                  ['Date Issued', fmtDateTime(fromLocalInput(issueDate))],
                  [
                    'Supporting Documents',
                    documents.length > 0 ? `${documents.length} file(s) attached` : 'None',
                  ],
                ]}
              />

              <div className="rounded-lg border border-[var(--sa-border)] bg-[var(--sa-surface-1)] p-3.5 space-y-2">
                <div className="sa-eyebrow">Warning Message</div>
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.trim()}</p>
                {additionalDetails.trim() ? (
                  <div className="pt-2 border-t border-[var(--sa-border)]">
                    <div className="sa-eyebrow">Additional Details</div>
                    <p className="text-sm whitespace-pre-wrap mt-0.5">{additionalDetails.trim()}</p>
                  </div>
                ) : null}
              </div>

              {adminNotes.trim() ? (
                <div>
                  <div className="sa-eyebrow">Administrative Notes (Staff Only)</div>
                  <p className="text-xs text-[var(--sa-text-2)] mt-0.5 whitespace-pre-wrap">
                    {adminNotes.trim()}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <>
            {/* Pre-selected Owner, Pet, and Case Reference Banner */}
            <div className="rounded-xl border border-[var(--sa-border)] bg-[var(--sa-surface-2)] p-3.5">
              <Kv
                wide
                rows={[
                  [
                    'Recipient (Pet Owner)',
                    [
                      target.ownerName,
                      target.ownerPhone ? `Phone: ${target.ownerPhone}` : null,
                      target.ownerEmail ? `Email: ${target.ownerEmail}` : null,
                      target.ownerAddress ? `Address: ${target.ownerAddress}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · '),
                  ],
                  [
                    'Registered Pet (Auto-selected)',
                    target.petName
                      ? `${target.petName}${target.petReference ? ` (${target.petReference})` : ''} · ${[target.petSpecies, target.petBreed, target.petColour].filter(Boolean).join(' · ')}`
                      : 'Associated case animal',
                  ],
                  ['Related Case Reference', `${c.id} · ${c.title}`],
                ]}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <Field label="Warning Category" required>
                <Select value={category} onChange={(e) => handleCategoryChange(e.target.value)}>
                  {WARNING_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Warning Level" required>
                <Select value={warningLevel} onChange={(e) => setWarningLevel(e.target.value)}>
                  <option value="Notice">Notice</option>
                  <option value="1st Warning">1st Warning</option>
                  <option value="2nd Warning">2nd Warning</option>
                  <option value="Final Notice / Escalation">Final Notice / Escalation</option>
                </Select>
              </Field>

              <Field label="Date Issued" required>
                <Input
                  type="datetime-local"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                />
              </Field>
            </div>

            <Field
              label="Warning Subject"
              required
              error={tried && !validSubject ? 'Enter a warning subject.' : undefined}
            >
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Official Warning: Pet Roaming Without Supervision"
              />
            </Field>

            <Field
              label="Warning Message"
              required
              hint="Official warning message delivered to the pet owner's Resident account."
              error={
                tried && !validMessage
                  ? 'Please enter the warning message (at least 10 characters).'
                  : undefined
              }
            >
              <Textarea
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Write the official warning message to the pet owner…"
              />
            </Field>

            <Field
              label="Additional Details"
              optional
              hint="Specific corrective actions, leash/containment instructions, or incident details."
            >
              <Textarea
                rows={2}
                value={additionalDetails}
                onChange={(e) => setAdditionalDetails(e.target.value)}
                placeholder="e.g. Please keep your pet secured within your property perimeter at all times."
              />
            </Field>

            <Field
              label="Supporting Documents or Evidence"
              optional
              hint="Attach photos or documents (JPG, PNG, WEBP, PDF, DOC, DOCX)."
            >
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx"
                    multiple
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => void handleUploadFiles(e.target.files)}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    icon={Upload}
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {uploading ? 'Uploading…' : 'Upload Evidence / Document'}
                  </Button>
                </div>
                {documents.length > 0 ? (
                  <ul className="space-y-1">
                    {documents.map((d, idx) => (
                      <li
                        key={`${d.url}-${idx}`}
                        className="flex items-center justify-between rounded border border-[var(--sa-border)] bg-[var(--sa-surface-2)] px-3 py-1.5 text-xs"
                      >
                        <a
                          href={d.url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-[var(--sa-brand-ink)] hover:underline truncate"
                        >
                          {d.name}
                        </a>
                        <button
                          type="button"
                          onClick={() =>
                            setDocuments((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="text-[var(--sa-text-3)] hover:text-red-600"
                        >
                          <Trash2 size={13} />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </Field>

            <Field
              label="Administrative Notes"
              optional
              hint="Internal staff notes recorded with this warning."
            >
              <Textarea
                rows={2}
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder="Internal notes for subdivision administration…"
              />
            </Field>
          </>
        )}
      </div>
    </Dialog>
  );
}

/**
 * 6. Subdivision Admin Warning Management Section (`CaseWarningsSection`)
 * Displays all official warnings on the case with Warning ID, Owner name, Registered pet,
 * Warning category, Warning subject, Date issued, Issuing administrator, Warning status,
 * Owner acknowledgment status, Owner response, and full management modal.
 */
export function CaseWarningsSection({ c, hideSendButton = false }: { c: Case; hideSendButton?: boolean }) {
  const { loadCase } = useAdminData();
  const toast = useToast();
  const [selectedWarning, setSelectedWarning] = useState<Warning | null>(null);
  const [sendTarget, setSendTarget] = useState<OwnerWarningTarget | null>(null);
  const [defaultTarget, setDefaultTarget] = useState<OwnerWarningTarget | null>(null);

  const rid = reportIdOf(c.id);
  useEffect(() => {
    if (c.registeredPet?.owner?.residentId && c.registeredPet.current) {
      setDefaultTarget({
        userId: Number(c.registeredPet.owner.residentId),
        ownerName: c.registeredPet.owner.name,
        ownerPhone: c.registeredPet.owner.phone,
        ownerEmail: c.registeredPet.owner.email,
        ownerAddress: c.registeredPet.owner.address,
        petId: Number(c.registeredPet.petId),
        petName: c.registeredPet.current.name,
        petSpecies: c.registeredPet.current.species,
        petBreed: c.registeredPet.current.breed,
        petColour: c.registeredPet.current.colour,
      });
      return;
    }
    if (!rid) return;
    adminApi
      .possibleOwners(rid)
      .then((res) => {
        const first = res.candidates[0];
        if (first && first.resident?.user_id) {
          setDefaultTarget({
            userId: first.resident.user_id,
            ownerName: first.resident.name,
            ownerPhone: first.resident.phone,
            ownerEmail: first.resident.email,
            ownerAddress: first.resident.address || first.registered_address,
            petId: first.pet_id,
            petName: first.pet.name,
            petSpecies: first.pet.species,
            petBreed: first.pet.breed,
            petColour: first.pet.colour,
            petReference: first.pet.reference_code,
          });
        }
      })
      .catch(() => undefined);
  }, [rid, c.registeredPet]);

  const warnings = c.warnings;

  const handleDownloadPdf = async (w: Warning) => {
    if (!w.letterId) return;
    try {
      await adminApi.downloadWarningLetter(
        w.letterId,
        w.warningReference || `WARN-${w.id}`,
        'pdf',
      );
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="rounded-xl border border-[#e7e2da] bg-white p-4 sm:p-5 shadow-xs space-y-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold text-[var(--sa-text-1)] flex items-center gap-2 m-0">
            <ShieldAlert size={16} className="text-[var(--sa-brand)]" aria-hidden="true" />
            <span>Official Warnings</span>
            <Badge tone="neutral">{warnings.length}</Badge>
          </h3>
          <p className="sa-small sa-text-2 mt-1 mb-0">
            Official warnings issued to registered pet owners on this case, including delivery, owner acknowledgment status, and owner responses.
          </p>
        </div>
        {!hideSendButton && canSendOwnerWarning(c) && defaultTarget ? (
          <Button
            size="sm"
            variant="primary"
            icon={ShieldAlert}
            onClick={() => setSendTarget(defaultTarget)}
          >
            Send Warning
          </Button>
        ) : null}
      </div>

      <div className="space-y-3">
        {warnings.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#dfd8ce] bg-[var(--sa-surface-2)]/45 px-3.5 py-3 text-xs text-[var(--sa-text-2)]">
            {canSendOwnerWarning(c) ? (
              <>
                No official warnings have been issued for this case yet. Use <strong>Send Warning</strong> beside the confirmed owner to issue one.
              </>
            ) : (
              'No official warnings have been issued for this case yet. Confirm the animal match and verify ownership before sending a warning.'
            )}
          </div>
        ) : (
          warnings.map((w) => {
            const wfStatus = w.workflowStatus || (w.acknowledgedAt ? 'Acknowledged' : 'Sent');
            const tone = WARNING_STATUS_TONE[wfStatus] ?? 'amber';
            return (
              <div
                key={w.id}
                className="rounded-xl border border-[var(--sa-border)] bg-[var(--sa-surface-1)] p-4 space-y-3 shadow-xs"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="sa-ref font-semibold text-xs">
                        {w.warningReference || `WARN-${w.id}`}
                      </span>
                      <span className="font-semibold text-base text-[var(--sa-text-1)]">
                        {w.warningSubject || `${w.warningLevel || 'Official Warning'}: ${w.warningCategory || w.policyTitle}`}
                      </span>
                      <Badge tone={tone} dot>
                        {wfStatus}
                      </Badge>
                      <Badge tone={w.acknowledgedAt ? 'sage' : 'neutral'}>
                        {w.acknowledgedAt
                          ? `Acknowledged ${fmtDateTime(w.acknowledgedAt)}`
                          : 'Awaiting Acknowledgment'}
                      </Badge>
                    </div>
                    <p className="sa-meta">
                      Owner: <strong>{w.ownerName}</strong>
                      {w.petName ? (
                        <>
                          {' · '}Pet: <strong>{w.petName}</strong>
                        </>
                      ) : null}
                      {w.warningCategory ? ` · Category: ${w.warningCategory}` : ''}
                      {` · Issued ${fmtDateTime(w.issuedAt)} by ${w.issuedBy}`}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setSelectedWarning(w)}
                    >
                      View Warning Details
                    </Button>
                    {w.threadId ? (
                      <LinkButton
                        size="sm"
                        variant="ghost"
                        icon={MessageSquare}
                        to={adminPath(`/messages/${w.threadId}`)}
                      >
                        Conversation
                      </LinkButton>
                    ) : null}
                    {w.letterId ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={Download}
                        onClick={() => void handleDownloadPdf(w)}
                      >
                        PDF
                      </Button>
                    ) : null}
                  </div>
                </div>

                <p className="text-sm text-[var(--sa-text-1)] whitespace-pre-wrap">{w.details}</p>

                {w.ownerResponse ? (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs space-y-0.5">
                    <div className="font-semibold text-[var(--sa-brand-ink)]">
                      Owner Response / Clarification
                      {w.ownerRespondedAt ? ` (${fmtDateTime(w.ownerRespondedAt)})` : ''}:
                    </div>
                    <p className="text-sm text-[var(--sa-text-1)] whitespace-pre-wrap m-0">
                      {w.ownerResponse}
                    </p>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      {sendTarget ? (
        <SendOwnerWarningDialog
          c={c}
          target={sendTarget}
          onClose={() => setSendTarget(null)}
          onSent={() => {
            setSendTarget(null);
            void loadCase(c.id);
          }}
        />
      ) : null}

      {selectedWarning ? (
        <WarningDetailsAdminModal
          c={c}
          w={selectedWarning}
          onClose={() => setSelectedWarning(null)}
          onUpdated={async () => {
            await loadCase(c.id);
            setSelectedWarning(null);
          }}
        />
      ) : null}
    </div>
  );
}

function WarningDetailsAdminModal({
  c,
  w,
  onClose,
  onUpdated,
}: {
  c: Case;
  w: Warning;
  onClose: () => void;
  onUpdated: () => Promise<void>;
}) {
  const toast = useToast();
  const contactAutofill = useSubdivisionContactAutofill('phone');
  const [wfStatus, setWfStatus] = useState<string>(
    w.workflowStatus || (w.acknowledgedAt ? 'Acknowledged' : 'Sent'),
  );
  const [adminNotes, setAdminNotes] = useState<string>(w.adminNotes || '');
  const [followUpMsg, setFollowUpMsg] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [reqKey] = useState(() => newKey('wupd'));

  const handleSave = async () => {
    setBusy(true);
    setErr('');
    try {
      const contactLine =
        followUpMsg.trim() && contactAutofill.contactDetail.trim()
          ? `\n\nSubdivision Office Contact (${contactAutofill.methodDisplayLabel}): ${contactAutofill.contactDetail.trim()}${contactAutofill.contactPerson.trim()
            ? ` · Representative: ${contactAutofill.contactPerson.trim()}`
            : ''
          }`
          : '';
      await adminApi.updateWarningAdmin(Number(w.id), {
        workflow_status: wfStatus,
        admin_notes: adminNotes.trim(),
        follow_up_message: followUpMsg.trim()
          ? `${followUpMsg.trim()}${contactLine}`
          : undefined,
        client_request_id: reqKey,
      });
      toast.success(
        followUpMsg.trim()
          ? 'Warning updated and follow-up message delivered to owner.'
          : 'Warning record updated.',
      );
      await onUpdated();
    } catch (e) {
      setErr(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Dialog
      size="lg"
      title={`${w.warningReference || `WARN-${w.id}`} · ${w.warningSubject || 'Official Warning'}`}
      description={`Issued to ${w.ownerName} on ${fmtDateTime(w.issuedAt)} by ${w.issuedBy}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void handleSave()}>
            Save Warning Update
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {err ? <Callout tone="red">{err}</Callout> : null}

        <div className="rounded-xl border border-[var(--sa-border)] bg-[var(--sa-surface-2)] p-4">
          <Kv
            wide
            rows={[
              ['Warning ID', w.warningReference || `WARN-${w.id}`],
              ['Owner Name', w.ownerName],
              ['Registered Pet', w.petName || 'Associated animal'],
              ['Related Case Reference', `${c.id} · ${c.title}`],
              ['Warning Category', w.warningCategory || w.policyTitle],
              ['Warning Level', w.warningLevel || '1st Warning'],
              ['Date Issued', fmtDateTime(w.issuedAt)],
              ['Issuing Administrator', w.issuedBy],
              [
                'Owner Viewed Status',
                w.viewedAt ? `Viewed on ${fmtDateTime(w.viewedAt)}` : 'Not yet opened by owner',
              ],
              [
                'Owner Acknowledgment Status',
                w.acknowledgedAt
                  ? `Acknowledged on ${fmtDateTime(w.acknowledgedAt)}`
                  : 'Pending owner acknowledgment',
              ],
            ]}
          />
        </div>

        <div className="rounded-xl border border-[var(--sa-border)] p-4 space-y-2">
          <div className="sa-eyebrow">Warning Subject & Message</div>
          <h4 className="text-sm font-semibold">{w.warningSubject}</h4>
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{w.details}</p>
          {w.additionalDetails ? (
            <div className="pt-2 border-t border-[var(--sa-border)]">
              <div className="sa-eyebrow">Additional Details</div>
              <p className="text-sm whitespace-pre-wrap mt-0.5">{w.additionalDetails}</p>
            </div>
          ) : null}
          {w.supportingDocuments && w.supportingDocuments.length > 0 ? (
            <div className="pt-2 border-t border-[var(--sa-border)] space-y-1.5">
              <div className="sa-eyebrow">Supporting Documents / Evidence</div>
              <div className="flex flex-wrap gap-2">
                {w.supportingDocuments.map((doc, idx) => (
                  <a
                    key={`${doc.url}-${idx}`}
                    href={doc.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded border border-[var(--sa-border)] bg-[var(--sa-surface-2)] px-2.5 py-1 text-xs font-medium text-[var(--sa-brand-ink)] hover:underline"
                  >
                    <Paperclip size={12} />
                    {doc.name}
                    <ExternalLink size={11} />
                  </a>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {w.ownerResponse ? (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="sa-eyebrow text-[var(--sa-brand-ink)]">
                Owner Response / Clarification
              </span>
              {w.ownerRespondedAt ? (
                <span className="sa-meta">{fmtDateTime(w.ownerRespondedAt)}</span>
              ) : null}
            </div>
            <p className="text-sm whitespace-pre-wrap m-0">{w.ownerResponse}</p>
          </div>
        ) : null}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <Field
            label="Warning Status"
            hint="Viewing or acknowledging a warning never automatically closes it."
          >
            <Select value={wfStatus} onChange={(e) => setWfStatus(e.target.value)}>
              {WARNING_WORKFLOW_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </Select>
          </Field>
          {w.threadId ? (
            <div className="flex items-end pb-1">
              <LinkButton
                size="sm"
                variant="secondary"
                icon={MessageSquare}
                to={adminPath(`/messages/${w.threadId}`)}
              >
                Open Full Conversation in Messages
              </LinkButton>
            </div>
          ) : null}
        </div>

        <SubdivisionContactFields
          autofill={contactAutofill}
          methodLabel="Follow-up Contact Method"
          compact
        />

        <Field
          label="Send Follow-up Message to Owner"
          optional
          hint="Delivered directly to the owner's Resident Inbox conversation with an automatic in-app notification."
        >
          <Textarea
            rows={2}
            value={followUpMsg}
            onChange={(e) => setFollowUpMsg(e.target.value)}
            placeholder="Write a follow-up message regarding this official warning…"
          />
        </Field>

        <Field label="Administrative Notes (Staff Only)" optional>
          <Textarea
            rows={2}
            value={adminNotes}
            onChange={(e) => setAdminNotes(e.target.value)}
            placeholder="Record internal administrative notes or observations…"
          />
        </Field>
      </div>
    </Dialog>
  );
}
