import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronDown, ChevronUp, ExternalLink, PawPrint, X } from 'lucide-react';
import { fromServer } from '../../../live/dates';
import { fmtDate, fmtDateTime } from '../../../preview/lib/format';
import { FormError, Pill } from '../../components/ui';
import { residentPath } from '../../config';
import { useSubmit } from '../../lib/hooks';
import { residentApi, type ApiOwnershipVerification } from '../../live/api';

const TONE: Record<ApiOwnershipVerification['status'], 'neutral' | 'sage' | 'brand'> = {
  identified: 'neutral', awaiting: 'brand', owner_confirmed: 'sage', owner_declined: 'neutral', verified: 'sage', not_confirmed: 'neutral',
  unable_to_contact: 'neutral',
};

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex min-w-0 gap-1.5 text-xs">
      <dt className="shrink-0 text-[#78716c]">{label}:</dt>
      <dd className="m-0 min-w-0 break-words [overflow-wrap:anywhere] text-[#292524]">{value}</dd>
    </div>
  );
}

/**
 * The ownership question (Possible Pet Owner Verification): the reported animal next to the resident's own registered pet, with
 * Confirm Ownership / Decline Ownership. The answer is supporting evidence only; the Subdivision Administration makes the final decision.
 * Nothing about who reported the animal is shown. `variant="page"` is the full verification page linked from the request message.
 */
export function OwnershipVerificationCard({ v, onAnswered, variant = 'card' }: {
  v: ApiOwnershipVerification; onAnswered: () => Promise<void> | void; variant?: 'card' | 'page';
}) {
  const page = variant === 'page';
  const [open, setOpen] = useState(page || Boolean(v.can_answer));
  const [note, setNote] = useState('');
  const [choice, setChoice] = useState<'YES' | 'NO' | null>(null);
  const { pending, error, run } = useSubmit();
  const a = v.reported_animal;
  const pet = v.your_pet;
  const photo = page ? 'aspect-square w-full' : 'h-16 w-16 shrink-0';

  const answer = async (value: 'YES' | 'NO') => {
    if (pending) return;
    setChoice(value);
    const ok = await run(async () => { await residentApi.answerOwnershipVerification(v.request_id, value, note); await onAnswered(); });
    if (!ok) setChoice(null);
  };

  const body = (
    <div className={page ? 'flex flex-col gap-3' : 'mt-2.5 flex flex-col gap-2.5'}>
      {page ? (
        <div className="flex items-center justify-between gap-2">
          <p className="m-0 text-sm font-semibold text-[#292524]">{v.question ?? 'Is this your pet?'}</p>
          <Pill tone={TONE[v.status]} dot>{v.final_label ?? v.status_label}</Pill>
        </div>
      ) : null}
      <div className="grid min-w-0 grid-cols-2 gap-2.5">
        <div className="min-w-0 rounded-xl border border-[#e7e2da] bg-white p-2.5">
          <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-[#78716c]">Reported animal{a?.reference ? ` · ${a.reference}` : ''}</p>
          {a && a.photos.length > 0 ? (
            <div className={page ? 'mt-1.5 flex flex-col gap-1.5' : 'mt-1.5 flex gap-1.5 overflow-x-auto'}>
              {(page ? a.photos.slice(0, 1) : a.photos.slice(0, 4)).map((url, i) => (
                <a key={url} href={url} target="_blank" rel="noreferrer">
                  <img src={url} alt={`Reported animal, photo ${i + 1}`} loading="lazy" className={`${photo} rounded-lg border border-[#e7e2da] object-cover`} />
                </a>
              ))}
              {page && a.photos.length > 1 ? (
                <div className="flex gap-1.5 overflow-x-auto">
                  {a.photos.slice(1, 5).map((url, i) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer">
                      <img src={url} alt={`Reported animal, photo ${i + 2}`} loading="lazy" className="h-12 w-12 shrink-0 rounded-lg border border-[#e7e2da] object-cover" />
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
          ) : <p className="m-0 mt-1.5 text-xs text-[#78716c]">No photo was submitted.</p>}
          <dl className="m-0 mt-1.5 flex flex-col gap-0.5">
            <Detail label="Species" value={a?.animal_type} />
            <Detail label="Breed" value={a?.breed} />
            <Detail label="Colour" value={a?.color} />
            <Detail label="Size" value={a?.size} />
            <Detail label="Area" value={[a?.landmark, a?.subdivision].filter(Boolean).join(', ') || null} />
            <Detail label="Reported" value={a?.reported_at ? fmtDate(fromServer(a.reported_at)) : null} />
          </dl>
        </div>
        {pet ? (
          <div className="min-w-0 rounded-xl border border-[#e7e2da] bg-white p-2.5">
            <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-[#78716c]">Your registered pet</p>
            {pet.photos.length > 0 ? (
              <img src={pet.photos[0]} alt={`Your pet ${pet.pet_name}`} loading="lazy" className={`mt-1.5 ${photo} rounded-lg border border-[#e7e2da] object-cover`} />
            ) : <p className="m-0 mt-1.5 text-xs text-[#78716c]">No photo on file.</p>}
            <p className="m-0 mt-1.5 text-xs font-semibold">{pet.pet_name}{pet.reference_code ? ` · ${pet.reference_code}` : ''}</p>
            <dl className="m-0 mt-0.5 flex flex-col gap-0.5">
              <Detail label="Species" value={pet.animal_type} />
              <Detail label="Breed" value={pet.breed} />
              <Detail label="Colour" value={pet.color} />
              {page ? <Detail label="Size" value={pet.size} /> : null}
              {page ? <Detail label="Sex" value={pet.gender} /> : null}
              {page ? <Detail label="Markings" value={pet.distinctive_markings} /> : null}
            </dl>
          </div>
        ) : null}
      </div>

      {page && v.staff_message ? (
        <div className="rounded-xl border border-[#e7e2da] bg-white p-2.5 text-xs text-[#44403c]">
          <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-[#78716c]">Message from the Subdivision Administration</p>
          <p className="m-0 mt-1 whitespace-pre-wrap">{v.staff_message}</p>
        </div>
      ) : null}

      {v.can_answer ? (
        <>
          <label className="flex flex-col gap-1 text-xs font-medium text-[#44403c]">
            Anything that helps identify your pet (optional)
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={1000}
              rows={2}
              disabled={pending}
              placeholder="For example: a scar on the left ear, a red collar"
              className="resize-none rounded-xl border border-[#ddd5ca] bg-white px-3 py-2 text-sm font-normal text-[#1c1917] focus:border-[#b45309] focus:outline-none"
            />
          </label>
          {error ? <FormError message={error} /> : null}
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" disabled={pending} onClick={() => { void answer('YES'); }}
              className="inline-flex min-h-[42px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#b45309] px-3 text-sm font-semibold text-white transition-colors hover:bg-[#9a3412] disabled:opacity-50">
              <Check size={16} aria-hidden="true" />{pending && choice === 'YES' ? 'Sending…' : 'Confirm Ownership'}
            </button>
            <button type="button" disabled={pending} onClick={() => { void answer('NO'); }}
              className="inline-flex min-h-[42px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-[#ddd5ca] bg-white px-3 text-sm font-semibold text-[#292524] transition-colors hover:bg-[#f5f0e8] disabled:opacity-50">
              <X size={16} aria-hidden="true" />{pending && choice === 'NO' ? 'Sending…' : 'Decline Ownership'}
            </button>
          </div>
          <p className="m-0 text-[11px] text-[#78716c]">Your response is supporting information for the Subdivision Administration, who make the final ownership decision.</p>
        </>
      ) : v.owner_response ? (
        <p className="m-0 text-xs text-[#57534e]">
          You selected “{v.owner_response === 'YES' ? 'Confirm Ownership' : 'Decline Ownership'}”{v.owner_response_at ? ` on ${fmtDateTime(fromServer(v.owner_response_at))}` : ''}.
          {v.final_label ? ` Final decision by the Subdivision Administration: ${v.final_label}.` : ` Status: ${v.status_label}.`}
        </p>
      ) : null}

      {page && v.history && v.history.length > 0 ? (
        <div className="rounded-xl border border-[#e7e2da] bg-white p-2.5">
          <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-[#78716c]">History</p>
          <ol className="m-0 mt-1 flex list-none flex-col gap-0.5 p-0 text-xs">
            {v.history.map((h, i) => (
              <li key={`${h.label}-${i}`} className="flex justify-between gap-2">
                <span>{h.label}</span>
                <span className="shrink-0 text-[#78716c]">{h.at ? fmtDateTime(fromServer(h.at)) : ''}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {page && v.thread_id ? (
        <Link to={residentPath(`/conversations/${v.thread_id}`)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#b45309]">
          <ExternalLink size={14} aria-hidden="true" />Open the conversation with the Subdivision Administration
        </Link>
      ) : null}
    </div>
  );

  if (page) return body;

  return (
    <section className="max-h-[45dvh] shrink-0 overflow-y-auto overflow-x-hidden border-b border-[#e7e2da] bg-[#fffaf3] px-3.5 py-2.5 text-sm text-[#292524]" aria-label="Ownership verification">
      <button type="button" className="flex w-full items-center justify-between gap-2 text-left" onClick={() => setOpen((x) => !x)} aria-expanded={open}>
        <span className="flex min-w-0 items-center gap-2">
          <PawPrint size={16} className="shrink-0 text-[#b45309]" aria-hidden="true" />
          <span className="truncate font-semibold">{v.question ?? 'Is this your pet?'}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <Pill tone={TONE[v.status]} dot>{v.final_label ?? v.status_label}</Pill>
          {open ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
        </span>
      </button>
      {open ? body : null}
    </section>
  );
}
