import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Camera, Download, FileText, FolderOpen, Image as ImageIcon, Images, Maximize2, PawPrint, Play, Upload, UserRound, X } from 'lucide-react';
import { WarningLetterDocument } from '../../../components/WarningLetterDocument';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { Checkbox, Field, FieldGroup, Input, OptionGroup, Select, Textarea } from '../../components/form';
import { Callout, FormError } from '../../components/layout';
import { useMediaViewer, type LightboxMediaItem } from '../../components/MediaLightbox';
import { useToast } from '../../components/toast';
import { useAdminData } from '../../data/context';
import type { Case } from '../../data/types';
import { FormFooter } from '../../dialogs/BasicDialogs';
import { useSubmit } from '../../lib/useSubmit';
import { adminApi, type ApiGeneratedWarningLetter, type ApiTemplatePreviewResult } from '../../live/api';
import { reportIdOf } from '../../../live/refs';
import { toLocalInput } from '../../../preview/lib/format';
import { complaintsApi, type ApiComplaint, type ApiLeads, type ApiPersonRow, type EvidenceId, type ResponsibleIn, type StepAction } from '../../complaints/api';
import { letterOf, printLetter, type Letter } from '../../complaints/letter';
import {
  ATTENDANCE, EVIDENCE, NOT_DELIVERED, PROOF, STAGE_TEXT, STEP_TITLE, fmt, fmtDay, localToServer, newRequestId, ord, peso,
  type ComplaintDialogState,
} from '../../complaints/model';

interface Props { c: Case; d: ApiComplaint; refOf: (reportId: number) => string; onClose: () => void; onSaved: (next: ApiComplaint) => void }

const rid = (c: Case) => reportIdOf(c.id) ?? 0;
const today = () => toLocalInput(new Date()).slice(0, 10);

/** Every complaint window, opened by the complaint page. */
export function ComplaintDialogs({ dialog, ...p }: Props & { dialog: ComplaintDialogState | null }) {
  if (!dialog) return null;
  switch (dialog.kind) {
    case 'verify': return <VerifyDialog {...p} />;
    case 'resp': return <ResponsibleDialog {...p} correcting={!!dialog.correcting} />;
    case 'offense': return <OffenseDialog {...p} />;
    case 'same': return <SameOccurrenceDialog {...p} />;
    case 'print': return <PrintDialog {...p} stepId={dialog.stepId} />;
    default: return <StepDialog {...p} stepId={dialog.stepId} action={dialog.action} />;
  }
}

function useSave(p: Props, done: string) {
  const toast = useToast();
  const { loadCase } = useAdminData();
  const { pending, error, run } = useSubmit();
  const save = async (call: () => Promise<ApiComplaint>, after?: (next: ApiComplaint) => void) => {
    const ok = await run(async () => {
      const next = await call();
      p.onSaved(next);
      after?.(next);
      void loadCase(p.c.id);
    });
    if (ok) { toast.success(done); p.onClose(); }
  };
  return { pending, error, save };
}

// ------------------------------------------------------------------------------------------------------- verify
function VerifyDialog(p: Props) {
  const { state } = useAdminData();
  const rules = state.settings.policies.filter((x) => x.status === 'confirmed' && x.appliesTo.includes('nuisance'));
  const [v, setV] = useState<'verified' | 'unverified' | 'not_reviewed' | ''>(p.d.incident.status === 'verified' || p.d.incident.status === 'unverified' ? p.d.incident.status : '');
  const [basis, setBasis] = useState(p.d.incident.basis ?? '');
  const [rule, setRule] = useState(p.d.rule?.policy_id ?? (p.d.no_rule ? 'none' : ''));
  const [err, setErr] = useState<Record<string, string>>({});
  const { pending, error, save } = useSave(p, 'Saved');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!v) next.v = 'Choose whether it happened.';
    if (basis.trim().length < 5) next.basis = 'Say what the decision is based on.';
    if (v === 'verified' && !rule) next.rule = 'Choose the rule that was broken, or that none applies.';
    setErr(next);
    if (Object.keys(next).length || !v) return;
    void save(() => complaintsApi.verify(rid(p.c), { incident: v, basis: basis.trim(), policy_id: v === 'verified' && rule !== 'none' ? rule : null, no_rule: v === 'verified' && rule === 'none' }));
  };
  return (
    <Dialog title="Verify what happened" description={`${p.c.id} · ${p.c.title}`} onClose={p.onClose} onSubmit={submit} dirty={basis !== (p.d.incident.basis ?? '')}
      footer={({ requestClose }) => <FormFooter pending={pending} label="Save" requestClose={requestClose} />}>
      {error ? <FormError message={error} /> : null}
      {p.d.suspect ? <Callout><strong>The complainant suggested an owner.</strong> Who is responsible is a separate decision, made with evidence.</Callout> : null}
      <FieldGroup label="Did it happen?" required error={err.v}>
        <OptionGroup name="cm-v" label="Did it happen?" value={v} onChange={setV} options={[
          { value: 'verified', label: 'Verified: it happened', description: 'You saw it, or the evidence shows it.' },
          { value: 'unverified', label: 'Not verified', description: 'The evidence does not support it.' },
          { value: 'not_reviewed', label: 'Can’t tell yet', description: 'You need more to go on.' },
        ]} />
      </FieldGroup>
      <Field label="What you based it on" required error={err.basis}><Textarea rows={2} value={basis} onChange={(e) => setBasis(e.target.value)} placeholder="e.g. The guard also saw the dog on Tuesday evening." /></Field>
      {v === 'verified' ? (
        <Field label="Which rule was broken?" required error={err.rule} hint={rules.length ? 'Only confirmed rules are offered. History is counted per rule.' : 'No rule for animal complaints is confirmed yet. Add one in Settings, Policies.'}>
          <Select value={rule} onChange={(e) => setRule(e.target.value)}>
            <option value="">Choose a rule</option>
            {rules.map((r) => <option key={r.id} value={r.id}>{r.title}{r.reference ? ` (${r.reference})` : ''}</option>)}
            <option value="none">None of the subdivision’s rules applies</option>
          </Select>
        </Field>
      ) : null}
    </Dialog>
  );
}

// ------------------------------------------------------------------------------------------- who is responsible
type Who = 'record' | 'new' | 'none' | '';
function ResponsibleDialog(p: Props & { correcting: boolean }) {
  const { state } = useAdminData();
  const { openMedia } = useMediaViewer();
  const cur = p.correcting ? p.d.respondent : null;
  const [leads, setLeads] = useState<ApiLeads | null>(null);
  const [households, setHouseholds] = useState<ApiPersonRow[]>([]);
  const [brokenPics, setBrokenPics] = useState<Record<string, boolean>>({});
  const [who, setWho] = useState<Who>('');
  const [person, setPerson] = useState('');
  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [evidence, setEvidence] = useState<EvidenceId[]>([]);
  const [note, setNote] = useState('');
  const [checkNote, setCheckNote] = useState('');
  const [reason, setReason] = useState('');
  const [ruled, setRuled] = useState<Record<string, { label: string; reason: string }>>({});
  const [picked, setPicked] = useState('');
  const [err, setErr] = useState<Record<string, string>>({});
  const { pending, error, save } = useSave(p, p.correcting ? 'Corrected' : 'Saved');

  useEffect(() => {
    let live = true;
    complaintsApi.leads(rid(p.c), cur?.respondent_id ?? null).then((l) => { if (live) setLeads(l); }, () => { if (live) setLeads({ suggestion: [], registry: [], earlier: [], ruled_out: [] }); });
    complaintsApi.workspace().then((w) => { if (live) setHouseholds(w.people.filter((x) => !x.has_account)); }, () => undefined);
    return () => { live = false; };
  }, [p.c, cur?.respondent_id]);

  const complainant = p.c.reporter.residentId;
  const residents = state.residents.filter((r) => r.id !== complainant && String(r.id) !== String(cur?.user_id ?? ''));
  // Everyone who can be chosen, searched as the Leader types (a subdivision can have thousands of residents: never one long list)
  const people = [
    ...residents.map((r) => ({ value: `u:${r.id}`, name: r.name, address: [r.unit, r.street].filter(Boolean).join(', '), kind: 'Resident' })),
    ...households.filter((h) => h.respondent_id !== cur?.respondent_id).map((h) => ({ value: `h:${h.respondent_id}`, name: h.name, address: h.address, kind: 'Household, no account' })),
  ];
  const chosen = people.find((x) => x.value === person) ?? null;
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = terms.length ? people.filter((x) => { const hay = `${x.name} ${x.address}`.toLowerCase(); return terms.every((t) => hay.includes(t)); }) : [];
  const shown = matches.slice(0, 8);
  const pick = (key: string, value: string) => { setWho('record'); setPerson(value); setPicked(key); };
  const toggleRule = (key: string, label: string) => setRuled((x) => { const n = { ...x }; if (n[key]) delete n[key]; else n[key] = { label, reason: '' }; return n; });
  const personValue = (userId: number | null, respondentId: number | null) => (userId ? `u:${userId}` : `h:${respondentId}`);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!who) next.who = p.correcting ? 'Choose who it really was.' : 'Choose the person responsible, or “Not identified yet”.';
    if (who === 'record' && !person) next.person = 'Choose the person.';
    if (who === 'new' && (name.trim().length < 2 || address.trim().length < 3)) next.new = 'Enter their name and house address.';
    if ((who === 'record' || who === 'new') && !evidence.length) next.evidence = 'Choose at least one kind of evidence.';
    if ((who === 'record' || who === 'new') && evidence.length === 1 && evidence[0] === 'registry') next.evidence = 'A registered pet profile is not enough on its own.';
    if ((who === 'record' || who === 'new') && note.trim().length < 10) next.note = 'Say how you established it.';
    if (who === 'none' && checkNote.trim().length < 5) next.check = 'Write what you checked so far.';
    if (p.correcting && reason.trim().length < 5) next.reason = 'Say why you are correcting it.';
    setErr(next);
    if (Object.keys(next).length) return;
    const ruled_out = Object.entries(ruled).map(([key, v]) => ({ key, label: v.label, reason: v.reason.trim() || null }));
    let body: ResponsibleIn;
    if (who === 'none') body = { mode: 'none', check_note: checkNote.trim(), ruled_out };
    else if (who === 'new') body = { mode: 'new', name: name.trim(), address: address.trim(), evidence, note: note.trim(), ruled_out };
    else if (person.startsWith('u:')) body = { mode: 'user', user_id: Number(person.slice(2)), evidence, note: note.trim(), ruled_out };
    else body = { mode: 'household', respondent_id: Number(person.slice(2)), evidence, note: note.trim(), ruled_out };
    if (p.correcting) body.correction_reason = reason.trim();
    void save(() => complaintsApi.responsible(rid(p.c), body));
  };

  const leadRow = (key: string, value: string, label: string, firstName: string, text: ReactNode, why: string[], pic: ReactNode) => {
    const isRuled = !!ruled[key];
    return (
      <div key={key} className="sa-cm-lead" data-picked={picked === key && !isRuled ? '' : undefined} data-ruled={isRuled ? '' : undefined}>
        {pic}
        <div className="min-w-0"><p className="sa-small">{text}</p><span className="sa-cm-lead__why">{why.map((w) => <span key={w}>{w}</span>)}</span></div>
        <div className="sa-cm-lead__acts">
          {!isRuled ? <Button size="sm" onClick={() => pick(key, value)}>It’s {firstName}</Button> : null}
          <Button size="sm" variant="ghost" onClick={() => toggleRule(key, label)}>{isRuled ? 'Undo' : 'Not this one'}</Button>
        </div>
        {isRuled ? <div className="sa-cm-lead__out"><Input aria-label={`Why not ${label}`} placeholder="Why not (optional), e.g. a different breed on the CCTV" value={ruled[key].reason}
          onChange={(e) => setRuled((x) => ({ ...x, [key]: { ...x[key], reason: e.target.value } }))} /></div> : null}
      </div>
    );
  };
  const first = (n: string) => n.split(' ')[0];
  const nLeads = leads ? leads.suggestion.length + leads.registry.length + leads.earlier.length : 0;

  return (
    <Dialog size="lg" title={p.correcting ? 'Correct the person responsible' : 'Who is responsible?'}
      description={p.correcting ? `${p.c.id} · now ${cur?.name ?? ''}` : `${p.c.id}${p.d.rule ? ` · ${p.d.rule.title}` : ''}`}
      onClose={p.onClose} onSubmit={submit} dirty={!!who || !!note || Object.keys(ruled).length > 0}
      footer={({ requestClose }) => <FormFooter pending={pending} label={p.correcting ? 'Save the correction' : 'Save'} requestClose={requestClose} />}>
      {error ? <FormError message={error} /> : null}
      {p.correcting && p.d.offense ? (
        <Callout tone="amber" title="Use this when you learn it was someone else.">
          {p.d.offense.counted && p.d.offense.number ? `The ${ord(p.d.offense.number)} offense confirmed for ${cur?.name} is marked corrected: it stays in the history but no longer counts. ` : 'Your decision on this complaint is marked corrected. '}
          What was already done (letters, a summons) stays recorded. Then you confirm the offense for the right person.
        </Callout>
      ) : null}
      {!p.correcting && p.d.suspect ? (
        <Callout tone="amber" title="Suggested by the complainant (unverified):">
          {[p.d.suspect.name, p.d.suspect.address].filter(Boolean).join(' · ')}{p.d.suspect.details ? ` (“${p.d.suspect.details.replace(/[.\s]+$/, '')}”)` : ''}. A suggestion is a lead to check. It is not evidence on its own.
        </Callout>
      ) : null}
      <FieldGroup label={`Leads to check${nLeads ? ` (${nLeads})` : ''}`} hint="StraySafe looked these up for you. They are leads only: a name, an address or a look-alike is never proof on its own. Not every animal is registered.">
        <div className="sa-cm-leads">
          {!leads ? <p className="sa-small sa-text-3">Looking in your records…</p> : null}
          {leads?.suggestion.length ? <div><p className="sa-cm-leads__kind">From the complainant’s suggestion</p>{leads.suggestion.map((x) => leadRow(x.key, personValue(x.user_id, x.respondent_id), x.name, first(x.name), <><b>{x.name}</b> · {x.address}</>, x.why, <span className="sa-cm-lead__pic" aria-hidden="true"><UserRound size={18} /></span>))}</div> : null}
          {leads?.registry.length ? <div><p className="sa-cm-leads__kind">Registered pets that fit the description</p>{leads.registry.map((x) => {
            const photoUrl = !brokenPics[x.key] ? (x.photo_url || state.pets.find((pet) => pet.id === String(x.pet_id))?.photoUrls?.[0] || null) : null;
            const pic = photoUrl ? (
              <button
                type="button"
                className="sa-cm-lead__pic sa-cm-lead__pic--btn"
                aria-label={`View photo of ${x.pet_name}`}
                title={`View photo of ${x.pet_name}`}
                onClick={() => openMedia([{ url: photoUrl, kind: 'photo', title: x.pet_name, source: `Registered pet · owner ${x.owner_name}` }], 0)}
              >
                <img src={photoUrl} alt={x.pet_name} loading="lazy" onError={() => setBrokenPics((prev) => ({ ...prev, [x.key]: true }))} />
              </button>
            ) : (
              <span className="sa-cm-lead__pic" aria-hidden="true"><PawPrint size={18} /></span>
            );
            return leadRow(x.key, `u:${x.owner_user_id}`, `${x.pet_name}, ${x.owner_name}’s ${(x.breed ?? x.pet_type).toLowerCase()}`, first(x.owner_name),
              <><b>{x.pet_name}</b> · {[x.breed, x.colour?.toLowerCase(), x.size?.toLowerCase()].filter(Boolean).join(', ')} · owner {x.owner_name}, {x.owner_address}</>, x.why, pic);
          })}</div> : null}
          {leads?.earlier.length ? <div><p className="sa-cm-leads__kind">Earlier complaints at this place</p>{leads.earlier.map((x) => leadRow(x.key, personValue(x.user_id, x.respondent_id), x.name, first(x.name),
            <><b>{x.name}</b> was confirmed responsible in {x.report_ids.map(p.refOf).join(', ')}</>, x.why, <span className="sa-cm-lead__pic" aria-hidden="true"><FolderOpen size={18} /></span>))}</div> : null}
          {leads && leads.ruled_out.length ? <p className="sa-small sa-text-3">Already ruled out: {leads.ruled_out.map((r) => r.label).join(', ')}</p> : null}
          {leads ? <p className="sa-small sa-text-2">{nLeads ? 'Check each lead where it happens. If none fits:' : 'No leads in your records.'} watch at the time it usually happens, ask the guardhouse or look at CCTV, ask the neighbours, or see where the animal goes home.</p> : null}
        </div>
      </FieldGroup>
      <FieldGroup label={p.correcting ? 'Who it really was' : 'The person responsible'} required error={err.who}>
        <OptionGroup name="cm-who" label="The person responsible" value={who} onChange={(v) => { setWho(v); if (v !== 'record') setPicked(''); }} options={[
          { value: 'record', label: 'Someone already on record', description: 'A resident with an account, or a household recorded before.' },
          { value: 'new', label: 'A household not in StraySafe yet', description: 'Recorded by name and house address. No account or registered pet needed.' },
          ...(p.correcting ? [] : [{ value: 'none' as const, label: 'Not identified yet', description: 'Save what you checked and ruled out, and keep checking. Nothing counts until a person is confirmed.' }]),
        ]} />
      </FieldGroup>
      {who === 'record' ? (
        <Field label="Person" required error={err.person} hint={chosen ? undefined : `Searches the ${people.length} ${people.length === 1 ? 'person' : 'people'} on record (residents and households) by name or house address.`}>
          {chosen ? (
            <div className="sa-cm-picker__chosen">
              <span className="min-w-0"><b>{chosen.name}</b>{chosen.address ? ` · ${chosen.address}` : ''}<span className="sa-cm-sub">{chosen.kind}</span></span>
              <Button size="sm" variant="link" onClick={() => { setPerson(''); setPicked(''); }}>Change</Button>
            </div>
          ) : (
            <div className="sa-cm-picker">
              <Input type="search" value={query} autoComplete="off" placeholder="Type a name, block or lot" aria-label="Search residents and households"
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (shown[0]) { setPerson(shown[0].value); setPicked(''); } } }} />
              {terms.length ? (
                <ul className="sa-cm-picker__list" aria-label="Matching people">
                  {shown.map((x) => (
                    <li key={x.value}>
                      <button type="button" className="sa-cm-picker__item" onClick={() => { setPerson(x.value); setPicked(''); }}>
                        <b>{x.name}</b>{x.address ? <span className="sa-text-2"> · {x.address}</span> : null}<span className="sa-cm-sub">{x.kind}</span>
                      </button>
                    </li>
                  ))}
                  {!matches.length ? <li className="sa-small sa-text-3 sa-cm-picker__none">Nobody matches. Check the spelling, or record them as a household not in StraySafe yet.</li> : null}
                  {matches.length > shown.length ? <li className="sa-small sa-text-3 sa-cm-picker__none">{matches.length - shown.length} more match: keep typing to narrow it down.</li> : null}
                </ul>
              ) : null}
            </div>
          )}
        </Field>
      ) : null}
      {who === 'new' ? (
        <div className="sa-grid2">
          <Field label="Name" required error={err.new}><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="House address" required><Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Block, lot and street" /></Field>
        </div>
      ) : null}
      {who === 'record' || who === 'new' ? (
        <>
          <FieldGroup label="Evidence you relied on" required error={err.evidence} hint="Choose at least one. A registered pet is never enough on its own, and is never required.">
            <div className="flex flex-col gap-2">{EVIDENCE.map((x) => <Checkbox key={x.id} label={x.label} checked={evidence.includes(x.id)} onChange={(e) => setEvidence((v) => (e.target.checked ? [...v, x.id] : v.filter((y) => y !== x.id)))} />)}</div>
          </FieldGroup>
          <Field label="How you established it" required error={err.note}><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Saw the dog go in at their gate; they confirmed it is theirs." /></Field>
        </>
      ) : null}
      {who === 'none' ? <Field label="What you checked so far" required error={err.check}><Textarea rows={2} value={checkNote} onChange={(e) => setCheckNote(e.target.value)} placeholder="e.g. Asked the guard; watched the street at 7 PM, no dog came out." /></Field> : null}
      {p.correcting ? <Field label="Why the correction" required error={err.reason}><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></Field> : null}
    </Dialog>
  );
}

// ------------------------------------------------------------------------------------------------ the offense
function OffenseDialog(p: Props) {
  const n = p.d.suggestion ?? 1;
  const h = p.d.history;
  const [decision, setDecision] = useState<'counted' | 'not_counted' | ''>('');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const { pending, error, save } = useSave(p, decision === 'not_counted' ? 'Recorded: not counted' : `Confirmed as the ${ord(n)} offense`);
  const earlier = (h?.counted ?? []).filter((x) => x.report_id !== rid(p.c));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!decision) { setErr('Choose your decision.'); return; }
    if (decision === 'not_counted' && reason.trim().length < 5) { setErr('Say why it should not count.'); return; }
    void save(() => complaintsApi.offense(rid(p.c), decision === 'counted' ? { decision, expected_number: n } : { decision, reason: reason.trim() }));
  };
  return (
    <Dialog size="lg" title="Confirm the offense" description={`${p.d.respondent?.name ?? ''} · ${p.d.rule?.title ?? ''}`} onClose={p.onClose} onSubmit={submit} dirty={!!decision}
      footer={({ requestClose }) => <FormFooter pending={pending} label="Save" requestClose={requestClose} />}>
      {error ? <FormError message={error} /> : null}
      <Callout title={`StraySafe suggests the ${ord(n)} offense.`}>It counted the verified incidents of this rule where you confirmed {p.d.respondent?.name} as responsible{h?.count_window_days ? `, within ${h.count_window_days} days` : ''}. Each occurrence counts once.</Callout>
      <FieldGroup label="Counted">
        <ul className="sa-cm-mini">
          {earlier.map((x) => <li key={x.offense_id}><b>{x.number ? ord(x.number) : '—'}</b><span>{p.refOf(x.report_id)} · seen {fmtDay(x.incident_at)} · {x.steps.map((s) => `${s.label.toLowerCase()}: ${s.state.replace(/_/g, ' ')}`).join(' · ')}</span></li>)}
          <li><b>{ord(n)}</b><span><b>This complaint</b> · seen {fmtDay(p.d.incident_at)}</span></li>
        </ul>
      </FieldGroup>
      {h && h.not_counted.length ? <FieldGroup label="Not counted"><ul className="sa-cm-mini">{h.not_counted.filter((x) => x.report_id !== rid(p.c)).map((x) => <li key={`${x.kind}-${x.report_id}`}><b>—</b><span>{p.refOf(x.report_id)} · {x.why}</span></li>)}</ul></FieldGroup> : null}
      {STAGE_TEXT[n]
        ? <Callout><strong>For a {ord(n)} offense the rule asks for</strong> {STAGE_TEXT[n]}.</Callout>
        : <Callout tone="amber" title={`The rules don’t say what a ${ord(n)} offense requires.`}>An open question for the subdivision. Record what you do as notes until it is decided.</Callout>}
      <FieldGroup label="Your decision" required error={err}>
        <OptionGroup name="cm-decision" label="Your decision" value={decision} onChange={setDecision} options={[
          { value: 'counted', label: `Confirm as the ${ord(n)} offense`, description: 'Its steps are added to this complaint.' },
          { value: 'not_counted', label: 'Don’t count this incident', description: 'Record why. It stays in the history, marked as not counted.' },
        ]} />
      </FieldGroup>
      {decision === 'not_counted' ? <Field label="Why it should not count" required><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></Field> : null}
    </Dialog>
  );
}

// ------------------------------------------------------------------------------------------- same occurrence?
function SameOccurrenceDialog(p: Props) {
  const o = p.d.maybe_same;
  const { openMedia } = useMediaViewer();
  const [decision, setDecision] = useState<'same' | 'separate' | ''>('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const { pending, error, save } = useSave(p, decision === 'same' ? 'Linked as the same occurrence' : 'Kept as a separate incident');
  if (!o) return null;

  // Media from earlier complaint candidate
  const oMedia: LightboxMediaItem[] = (o.media ?? []).map((m, i) => ({
    url: m.url,
    kind: m.type === 'video' ? 'video' : 'photo',
    title: `${p.refOf(o.report_id)} · ${m.type === 'video' ? 'Video' : 'Photo'} ${i + 1}`,
    source: o.reporter ? `Reported by ${o.reporter}` : 'Earlier complaint',
    caption: o.description || undefined,
  }));

  // Media from current complaint
  const cMedia: LightboxMediaItem[] = (p.d.media && p.d.media.length > 0)
    ? p.d.media.map((m, i) => ({
        url: m.url,
        kind: m.type === 'video' ? 'video' : 'photo',
        title: `${p.c.id} · ${m.type === 'video' ? 'Video' : 'Photo'} ${i + 1}`,
        source: p.c.reporter.name ? `Reported by ${p.c.reporter.name}` : 'Current complaint',
        caption: p.c.description || undefined,
      }))
    : (p.c.evidence ?? []).filter((e): e is typeof e & { url: string } => Boolean(e.url)).map((e, i) => ({
        url: e.url,
        kind: e.kind,
        title: `${p.c.id} · ${e.kind === 'video' ? 'Video' : 'Photo'} ${i + 1}`,
        source: p.c.reporter.name ? `Reported by ${p.c.reporter.name}` : 'Current complaint',
        caption: p.c.description || undefined,
      }));

  const allCompareMedia = [...oMedia, ...cMedia];

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!decision) { setErr('Choose your decision.'); return; }
    void save(() => complaintsApi.sameOccurrence(rid(p.c), { other_report_id: o.report_id, decision, note: note.trim() || undefined }));
  };

  return (
    <Dialog size="lg" title={`Same occurrence as ${p.refOf(o.report_id)}?`} description="Two neighbours can report the same thing. It should count once." onClose={p.onClose} onSubmit={submit} dirty={!!decision}
      footer={({ requestClose }) => <FormFooter pending={pending} label="Save" requestClose={requestClose} />}>
      {error ? <FormError message={error} /> : null}

      {allCompareMedia.length > 0 ? (
        <div className="sa-cm-compare__bar">
          <span className="sa-small sa-text-2 font-medium">Compare reports & evidence photos</span>
          <Button
            type="button"
            variant="ghost"
            icon={Images}
            onClick={() => openMedia(allCompareMedia, 0)}
          >
            Compare all photos ({allCompareMedia.length})
          </Button>
        </div>
      ) : null}

      <div className="sa-cm-compare">
        <div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="sa-ref">{p.refOf(o.report_id)}</span>
              {o.animal_type ? <span className="sa-mc__chip text-xs">{o.animal_type.charAt(0).toUpperCase() + o.animal_type.slice(1)}</span> : null}
              {o.animal_breed ? <span className="sa-mc__chip text-xs">{o.animal_breed}</span> : null}
              {(o.animal_colors ?? []).map((col) => <span key={col} className="sa-mc__chip text-xs">{col}</span>)}
            </div>
            <span className="sa-small sa-text-3 font-medium">Earlier complaint</span>
          </div>
          <span className="sa-small sa-text-2">Seen {fmt(o.incident_at)} · filed {fmt(o.created_at)}</span>
          {o.landmark ? <span className="sa-small sa-text-2 font-medium">{o.landmark}</span> : null}
          <div className="sa-cm-compare__quote">“{o.description}”</div>
          {o.reporter ? <span className="sa-small sa-text-3">From {o.reporter}</span> : null}

          <div className="sa-cm-compare__media">
            <div className="sa-cm-compare__media-header">
              <span className="flex items-center gap-1.5"><Camera size={13} aria-hidden="true" />Evidence media ({oMedia.length})</span>
            </div>
            {oMedia.length > 0 ? (
              <div className="sa-cm-compare__thumbs">
                {oMedia.map((m, i) => (
                  <button
                    key={m.url + i}
                    type="button"
                    className="sa-cm-thumb-btn"
                    onClick={() => openMedia(allCompareMedia, i)}
                    title={`View ${m.title}`}
                    aria-label={`View ${m.title}`}
                  >
                    {m.kind === 'video' ? (
                      <div className="sa-cm-thumb-video">
                        <Play size={16} fill="currentColor" />
                        <span>Video</span>
                      </div>
                    ) : (
                      <img src={m.url} alt={m.title || 'Evidence photo'} className="sa-cm-thumb-img" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                    )}
                    <span className="sa-cm-thumb-zoom">
                      <Maximize2 size={12} />
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="sa-cm-compare__no-media">
                <ImageIcon size={13} aria-hidden="true" />
                <span>No photos or videos attached</span>
              </p>
            )}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="sa-ref">{p.c.id}</span>
              {p.c.animal?.type ? <span className="sa-mc__chip text-xs">{p.c.animal.type.charAt(0).toUpperCase() + p.c.animal.type.slice(1)}</span> : null}
              {p.d.animal_breed ? <span className="sa-mc__chip text-xs">{p.d.animal_breed}</span> : null}
              {(p.d.animal_colors ?? []).map((col) => <span key={col} className="sa-mc__chip text-xs">{col}</span>)}
            </div>
            <span className="sa-small sa-text-3 font-medium">This complaint</span>
          </div>
          <span className="sa-small sa-text-2">Seen {fmt(p.d.incident_at)}</span>
          <span className="sa-small sa-text-2 font-medium">{p.c.location.area}</span>
          <div className="sa-cm-compare__quote">“{p.c.description}”</div>
          <span className="sa-small sa-text-3">From {p.c.reporter.name}</span>

          <div className="sa-cm-compare__media">
            <div className="sa-cm-compare__media-header">
              <span className="flex items-center gap-1.5"><Camera size={13} aria-hidden="true" />Evidence media ({cMedia.length})</span>
            </div>
            {cMedia.length > 0 ? (
              <div className="sa-cm-compare__thumbs">
                {cMedia.map((m, i) => (
                  <button
                    key={m.url + i}
                    type="button"
                    className="sa-cm-thumb-btn"
                    onClick={() => openMedia(allCompareMedia, oMedia.length + i)}
                    title={`View ${m.title}`}
                    aria-label={`View ${m.title}`}
                  >
                    {m.kind === 'video' ? (
                      <div className="sa-cm-thumb-video">
                        <Play size={16} fill="currentColor" />
                        <span>Video</span>
                      </div>
                    ) : (
                      <img src={m.url} alt={m.title || 'Evidence photo'} className="sa-cm-thumb-img" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                    )}
                    <span className="sa-cm-thumb-zoom">
                      <Maximize2 size={12} />
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="sa-cm-compare__no-media">
                <ImageIcon size={13} aria-hidden="true" />
                <span>No photos or videos attached</span>
              </p>
            )}
          </div>
        </div>
      </div>

      <FieldGroup label="Your decision" required error={err}>
        <OptionGroup name="cm-same" label="Your decision" value={decision} onChange={setDecision} options={[
          { value: 'same', label: `The same occurrence: link it to ${p.refOf(o.report_id)}`, description: `Kept and shown with ${p.refOf(o.report_id)}, and counted once. Both complainants hear the outcome.` },
          { value: 'separate', label: 'A separate incident', description: 'It stays its own complaint and counts only if you verify it on its own.' },
        ]} />
      </FieldGroup>
      <Field label="Note" optional><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------------------------------- letters
function useLetter(p: Props, kind: 'letter_1' | 'letter_2', letterDate: string, summonsAt?: string | null, place?: string | null): Letter | null {
  const { state } = useAdminData();
  if (!p.d.respondent || !p.d.rule) return null;
  return letterOf({
    kind, subdivision: p.d.subdivision_name ?? state.admin.subdivision, leaderName: state.admin.name, letterDate,
    respondentName: p.d.respondent.name, respondentAddress: p.d.respondent.address, ruleTitle: p.d.rule.title ?? '', ruleReference: p.d.rule.reference,
    ruleSummary: p.d.rule.summary, incidentAt: p.d.incident_at, where: p.c.location.detail || p.c.location.area, summonsAt, summonsPlace: place,
  });
}

function LetterView({ letter }: { letter: Letter }) {
  return (
    <div className="sa-cm-letter" aria-label="Letter preview">
      <p>{letter.heading}</p><p>{letter.date}</p><p>{letter.to[0]}<br />{letter.to[1]}</p><p><b>{letter.subject}</b></p>
      {letter.paragraphs.map((x) => <p key={x}>{x}</p>)}
      <p>{letter.signature[0]}<br />{letter.signature[1]}</p>
      <p className="sa-cm-letter__receipt">Received by: ____________________ Date and time: ______________</p>
    </div>
  );
}

function PrintDialog(p: Props & { stepId: number }) {
  const step = p.d.steps.find((s) => s.step_id === p.stepId);
  const kind = step?.kind === 'letter_2' ? 'letter_2' : 'letter_1';
  const det = (step?.details ?? {}) as Record<string, unknown>;
  const summons = p.d.steps.find((s) => s.kind === 'summons');
  const letter = useLetter(p, kind, String(det.letter_date ?? today()), summons?.due_at, (summons?.details as Record<string, string> | undefined)?.place);
  const storedId = typeof det.letter_id === 'number' ? det.letter_id : null;
  const [stored, setStored] = useState<ApiGeneratedWarningLetter | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (!storedId) return;
    let live = true;
    adminApi.warningLetterDetail(storedId).then((res) => { if (live) setStored(res); }, () => undefined);
    return () => { live = false; };
  }, [storedId]);

  const dl = (format: 'pdf' | 'docx') => {
    if (!storedId) return;
    void adminApi.downloadWarningLetter(storedId, stored?.warning_reference || `WARN-${storedId}`, format).catch((e) => toast.error(String(e)));
  };

  const storedAttachmentUrl = stored?.attachment_url || (typeof det.attachment_url === 'string' ? det.attachment_url : null);
  const storedAttachmentName = stored?.attachment_name || (typeof det.attachment_name === 'string' ? det.attachment_name : 'Attached file');

  return (
    <Dialog size="lg" title={stored ? `${stored.warning_reference} · ${STEP_TITLE[kind]}` : STEP_TITLE[kind]}
      description={stored ? `Template: ${stored.template_name} (v${stored.template_version_number})` : 'As it prints'}
      onClose={p.onClose}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {storedId ? (
              <>
                <Button size="sm" icon={Download} onClick={() => dl('pdf')}>Download PDF</Button>
                <Button size="sm" icon={Download} onClick={() => dl('docx')}>Download DOCX</Button>
              </>
            ) : null}
            {storedAttachmentUrl ? (
              <a
                href={storedAttachmentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="sa-btn sa-btn--sm sa-btn--ghost inline-flex items-center gap-1.5"
              >
                <FileText size={14} aria-hidden="true" />
                {storedAttachmentName}
              </a>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button onClick={p.onClose}>Close</Button>
            <Button variant="primary" onClick={() => { if (letter) printLetter(letter); }}>Print</Button>
          </div>
        </div>
      }>
      {stored ? (
        <WarningLetterDocument
          subdivisionName={stored.subdivision_name || stored.placeholders?.subdivision_name}
          subdivisionAddress={stored.subdivision_address || stored.placeholders?.subdivision_address}
          subdivisionPhone={stored.subdivision_phone || stored.placeholders?.subdivision_phone}
          subdivisionEmail={stored.subdivision_email || stored.placeholders?.subdivision_email}
          warningLevel={stored.warning_level}
          warningReference={stored.warning_reference}
          caseReference={stored.case_reference}
          issueDate={stored.placeholders?.issue_date || (stored.issued_at ? fmt(stored.issued_at) : '')}
          recipientName={stored.recipient_name}
          recipientAddress={stored.recipient_address}
          subject={stored.rendered_subject}
          body={stored.rendered_body}
          issuerName={stored.issuer_name || stored.placeholders?.issuer_name || stored.issued_by_name}
          issuerRole={stored.issuer_role || stored.placeholders?.issuer_role}
        />
      ) : letter ? <LetterView letter={letter} /> : null}
      <p className="sa-hint">The letter never names the complainant.</p>
    </Dialog>
  );
}

// ------------------------------------------------------------------------------------------------------ steps
function StepDialog(p: Props & { stepId: number; action: StepAction }) {
  const { state } = useAdminData();
  const step = p.d.steps.find((s) => s.step_id === p.stepId);
  const now = useState(() => toLocalInput(new Date()))[0];
  const [f, setF] = useState<Record<string, string | boolean>>({
    letter_date: now.slice(0, 10),
    place: p.action === 'arrange' ? 'Barangay hall' : 'Subdivision office',
    at: '',
    occurred_at: now,
    via: 'You, by hand',
    proof: 'signed',
    reason: 'nobody_home',
    told: 'In writing, delivered like the letters',
    imposed_on: now.slice(0, 10),
    paid_on: now.slice(0, 10),
    received_by: p.action === 'pay' ? state.admin.name : '',
    required_action: p.d.rule?.summary || 'Comply with subdivision rules and prevent recurrence.',
    a_c: false,
    a_r: false,
    a_l: false,
    agreed: false,
  });
  const [err, setErr] = useState('');
  const set = (k: string, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  const s = (k: string) => String(f[k] ?? '');
  const kind = step?.kind ?? 'letter_1';
  const letterKind = kind === 'letter_2' ? 'letter_2' : 'letter_1';
  const letter = useLetter(p, letterKind, s('letter_date') || today(), s('summons_at') || null, s('place'));
  const existingStepDet = (step?.details ?? {}) as Record<string, unknown>;
  const existingAttachmentUrl = typeof existingStepDet.attachment_url === 'string' ? existingStepDet.attachment_url : null;
  const existingAttachmentName = typeof existingStepDet.attachment_name === 'string' ? existingStepDet.attachment_name : 'Attached warning letter';
  const [letterSource, setLetterSource] = useState<'generated' | 'import'>(() => (existingAttachmentUrl ? 'import' : 'generated'));
  const label = {
    prepare: letterSource === 'import' ? 'Save warning letter' : 'Save and print',
    issue: 'Mark as issued', deliver: 'Save', attendance: 'Save', reschedule: 'Save', impose: 'Impose', pay: 'Save', arrange: 'Save', meeting: 'Save',
  }[p.action];
  const { pending, error, save } = useSave(p, 'Saved');

  const [templateId, setTemplateId] = useState<string>('');
  const [tplPreview, setTplPreview] = useState<ApiTemplatePreviewResult | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [attachedFile, setAttachedFile] = useState<File | null>(null);

  useEffect(() => {
    if (p.action !== 'prepare') return;
    let live = true;
    const wlevel = letterKind === 'letter_2' ? '2nd Warning' : '1st Warning';
    adminApi.warningTemplates('active').then((res) => {
      if (!live) return;
      const def = res.items.find((t) => t.is_default && t.warning_level === wlevel)
        || res.items.find((t) => t.is_default && !t.warning_level)
        || res.items.find((t) => t.warning_level === wlevel)
        || res.items[0];
      if (def) setTemplateId(String(def.template_id));
    }).catch(() => undefined);
    return () => { live = false; };
  }, [p.action, letterKind]);

  useEffect(() => {
    if (p.action !== 'prepare' || !p.d.respondent || !p.d.rule) return;
    let live = true;
    const wlevel = letterKind === 'letter_2' ? '2nd Warning' : '1st Warning';
    adminApi.previewWarningTemplate({
      ...(templateId ? { template_id: Number(templateId) } : {}),
      report_id: rid(p.c),
      ...(p.d.respondent.user_id ? { user_id: p.d.respondent.user_id } : {}),
      recipient_name: p.d.respondent.name,
      recipient_address: p.d.respondent.address,
      warning_level: wlevel,
      violation_description: p.c.description || p.d.rule.title || '',
      required_action: s('required_action'),
      policy_id: p.d.rule.policy_id,
      policy_reference: p.d.rule.reference ? `${p.d.rule.reference} — ${p.d.rule.title ?? ''}` : (p.d.rule.title ?? ''),
      ...(s('letter_date') ? { issue_date: `${s('letter_date')}T09:00:00` } : {}),
      ...(letterKind === 'letter_2' && s('summons_at') ? { summons_at: localToServer(s('summons_at')), summons_place: s('place') } : {}),
      field_overrides: overrides,
    }).then((res) => { if (live) setTplPreview(res); }, () => undefined);
    return () => { live = false; };
  }, [p.action, p.c, p.d.respondent, p.d.rule, templateId, letterKind, f.letter_date, f.summons_at, f.place, f.required_action, overrides]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!step) return null;
  const title = STEP_TITLE[step.kind];
  const fineAmount = p.d.rule?.fine_amount ?? null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const need = (k: string, msg: string) => { if (!s(k).trim()) throw new Error(msg); };
    let body: Record<string, unknown> & { action: StepAction };
    try {
      switch (p.action) {
        case 'prepare':
          need('letter_date', 'Choose the date on the letter.');
          if (step.kind === 'letter_2') need('summons_at', 'Choose the date and time of the summons.');
          if (letterSource === 'import' && !attachedFile && !existingAttachmentUrl) {
            throw new Error('Choose a PDF, Word document, or image file to import.');
          }
          body = {
            action: 'prepare',
            letter_date: s('letter_date'),
            ...(step.kind === 'letter_2' ? { summons_at: localToServer(s('summons_at')), place: s('place') } : {}),
            ...(templateId ? { template_id: Number(templateId) } : {}),
            ...(s('required_action').trim() ? { required_action: s('required_action').trim() } : {}),
            ...(Object.keys(overrides).length ? { field_overrides: overrides } : {}),
            ...(letterSource === 'import' && !attachedFile && existingAttachmentUrl
              ? { attachment_url: existingAttachmentUrl, attachment_name: existingAttachmentName }
              : {}),
          };
          break;
        case 'issue':
          if (s('via') === 'other') need('via_other', 'Say who delivers it.');
          body = { action: 'issue', via: s('via') === 'other' ? s('via_other').trim() : s('via') };
          break;
        case 'deliver':
          if (!s('ok')) throw new Error('Choose what happened.');
          need('occurred_at', 'Choose when.');
          if (s('ok') === 'yes') need('received_by', 'Say who received it.');
          body = s('ok') === 'yes'
            ? { action: 'deliver', delivered: true, occurred_at: localToServer(s('occurred_at')), received_by: s('received_by').trim(), proof: s('proof') }
            : { action: 'deliver', delivered: false, occurred_at: localToServer(s('occurred_at')), reason: s('reason'), note: s('note').trim() || undefined };
          break;
        case 'attendance':
          if (!s('result')) throw new Error('Choose whether they came.');
          if (s('note').trim().length < 5) throw new Error('Write what was agreed, or what happened.');
          body = { action: 'attendance', result: s('result'), note: s('note').trim() };
          break;
        case 'reschedule':
          need('at', 'Choose the new date and time.'); need('told', 'Say how you told them.');
          body = { action: 'reschedule', at: localToServer(s('at')), place: s('place'), told: s('told').trim() };
          break;
        case 'impose':
          if (fineAmount == null) throw new Error('This rule has no fine amount yet.');
          need('imposed_on', 'Choose the date.');
          body = { action: 'impose', imposed_on: s('imposed_on'), told: s('told'), note: s('note').trim() || undefined };
          break;
        case 'pay':
          need('paid_on', 'Choose the date it was paid.'); need('received_by', 'Say who received it.');
          body = { action: 'pay', paid_on: s('paid_on'), received_by: s('received_by').trim(), note: s('note').trim() || undefined };
          break;
        case 'arrange':
          need('contact', 'Say who you spoke with at the Barangay.'); need('at', 'Choose the date and time.');
          body = { action: 'arrange', contact: s('contact').trim(), at: localToServer(s('at')), place: s('place'), complainant_agreed: !!f.agreed };
          break;
        default:
          if (!s('held')) throw new Error('Choose whether it took place.');
          if (s('outcome').trim().length < 5) throw new Error('Write the outcome.');
          body = { action: 'meeting', held: s('held') === 'yes', outcome: s('outcome').trim(), attendance: { complainant: !!f.a_c, respondent: !!f.a_r, leader: !!f.a_l } };
      }
    } catch (x) { setErr((x as Error).message); return; }
    setErr('');
    body.client_request_id = newRequestId();
    void save(async () => {
      if (p.action === 'prepare' && letterSource === 'import' && attachedFile) {
        const uploaded = await adminApi.uploadComplaintAttachment(rid(p.c), attachedFile);
        body.attachment_url = uploaded.file_url;
        body.attachment_name = attachedFile.name;
      }
      return complaintsApi.step(rid(p.c), step.step_id, body);
    }, p.action === 'prepare' && letterSource === 'generated' && letter ? () => printLetter(letter) : undefined);
  };

  const heading: Record<StepAction, string> = { prepare: `Prepare the ${title.toLowerCase()}`, issue: 'Issue the letter for delivery', deliver: 'Record the delivery', attendance: 'Record the summons attendance',
    reschedule: 'Set a new summons date', impose: 'Impose the fine', pay: 'Record payment', arrange: 'Arrange the meeting at the Barangay', meeting: 'Record the Barangay meeting' };
  return (
    <Dialog size={p.action === 'prepare' ? 'lg' : 'md'} title={heading[p.action]} description={`${title} · ${p.d.respondent?.name ?? ''}`} onClose={p.onClose} onSubmit={submit}
      footer={({ requestClose }) => <FormFooter pending={pending} label={label} requestClose={requestClose} />}>
      {error ? <FormError message={error} /> : null}
      {err ? <FormError message={err} /> : null}
      {p.action === 'prepare' ? (
        <>
          <Field label="Letter date" required><Input type="date" value={s('letter_date')} onChange={(e) => set('letter_date', e.target.value)} /></Field>
          {step.kind === 'letter_2' ? (
            <div className="sa-grid2">
              <Field label="Summons: date and time" required hint="You choose it; no waiting period is assumed."><Input type="datetime-local" value={s('summons_at')} onChange={(e) => set('summons_at', e.target.value)} /></Field>
              <Field label="Summons: place" required><Input value={s('place')} onChange={(e) => set('place', e.target.value)} /></Field>
            </div>
          ) : null}
          <FieldGroup label="Which letter would you like to use?" required>
            <OptionGroup
              name="cm-letter-source"
              label="Warning letter source"
              value={letterSource}
              onChange={(v) => setLetterSource(v)}
              cols={2}
              options={[
                { value: 'generated', label: 'Use StraySafe standard letter', description: 'Automatically filled from the subdivision’s fixed letter.' },
                { value: 'import', label: 'Import your own file', description: 'Upload a PDF, Word document (.doc, .docx), or image.' },
              ]}
            />
          </FieldGroup>
          {letterSource === 'import' ? (
            <FieldGroup
              label="Import warning letter file"
              required
              hint="Upload a PDF, Word document (.doc, .docx), or image (JPG, PNG, WEBP) up to 10 MB."
            >
              <div className="flex flex-wrap items-center gap-2">
                <label className="sa-btn sa-btn--sm cursor-pointer inline-flex items-center gap-1.5">
                  <Upload size={14} aria-hidden="true" />
                  {attachedFile ? 'Replace file' : existingAttachmentUrl ? 'Replace uploaded file' : 'Choose file (PDF, DOCX, image)'}
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      if (file) setAttachedFile(file);
                      e.currentTarget.value = '';
                    }}
                  />
                </label>
                {attachedFile ? (
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--sa-line)] bg-[var(--sa-surface-soft)] px-2.5 py-1 text-xs">
                    <FileText size={13} aria-hidden="true" />
                    <span className="font-medium">{attachedFile.name}</span>
                    <span className="sa-text-3">({Math.max(1, Math.round(attachedFile.size / 1024))} KB)</span>
                    <button
                      type="button"
                      aria-label="Remove selected file"
                      className="ml-1 text-[var(--sa-ink-3)] hover:text-[var(--sa-ink-1)]"
                      onClick={() => setAttachedFile(null)}
                    >
                      <X size={13} />
                    </button>
                  </span>
                ) : existingAttachmentUrl ? (
                  <a
                    href={existingAttachmentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs underline text-[var(--sa-brand)]"
                  >
                    <FileText size={13} aria-hidden="true" />
                    {existingAttachmentName}
                  </a>
                ) : null}
              </div>
            </FieldGroup>
          ) : (
            <>
              {tplPreview && tplPreview.missing_fields.length > 0 ? (
                <Callout tone="amber" title="Complete missing template fields">
                  <div className="flex flex-col gap-2 mt-1">
                    {tplPreview.missing_fields.map((m) => (
                      <div key={m.key} className="flex flex-wrap items-center gap-2">
                        <label className="sa-small font-medium w-36">{m.label}</label>
                        <Input className="flex-1" value={overrides[m.key] ?? ''} onChange={(e) => setOverrides((x) => ({ ...x, [m.key]: e.target.value }))} placeholder={`Enter ${m.label.toLowerCase()}`} />
                      </div>
                    ))}
                  </div>
                </Callout>
              ) : null}
              {tplPreview ? (
                <WarningLetterDocument
                  subdivisionName={tplPreview.placeholders?.subdivision_name}
                  subdivisionAddress={tplPreview.placeholders?.subdivision_address}
                  subdivisionPhone={tplPreview.placeholders?.subdivision_phone}
                  subdivisionEmail={tplPreview.placeholders?.subdivision_email}
                  warningLevel={tplPreview.placeholders?.warning_level || (letterKind === 'letter_2' ? '2nd Warning' : '1st Warning')}
                  warningReference={tplPreview.placeholders?.warning_reference || 'WARN-PREVIEW'}
                  caseReference={tplPreview.placeholders?.case_reference || p.c.id}
                  issueDate={tplPreview.placeholders?.issue_date || s('letter_date')}
                  recipientName={tplPreview.placeholders?.resident_name || p.d.respondent?.name || ''}
                  recipientAddress={tplPreview.placeholders?.resident_address || p.d.respondent?.address}
                  subject={tplPreview.subject}
                  body={tplPreview.body}
                  issuerName={tplPreview.placeholders?.issuer_name || tplPreview.placeholders?.issued_by || state.admin.name}
                  issuerRole={tplPreview.placeholders?.issuer_role}
                />
              ) : (letter ? <LetterView letter={letter} /> : null)}
            </>
          )}
          <p className="sa-hint">The letter never names the complainant.</p>
          <Callout tone="amber">Printing the letter does not mean it was delivered. You record the delivery after it happens. Marking as issued will also notify the resident automatically if they have a StraySafe account.</Callout>
        </>
      ) : null}
      {p.action === 'issue' ? (
        <>
          <FieldGroup label="Who delivers it?" required>
            <OptionGroup name="cm-via" label="Who delivers it?" value={s('via')} onChange={(v) => set('via', v)} options={[
              { value: 'You, by hand', label: 'You, by hand' }, { value: 'The guard on duty', label: 'The guard on duty' }, { value: 'other', label: 'Someone else' }]} />
          </FieldGroup>
          {s('via') === 'other' ? <Field label="Name" required><Input value={s('via_other')} onChange={(e) => set('via_other', e.target.value)} /></Field> : null}
          <p className="sa-hint">Issued means it left your hands. It is not delivered until someone confirms it reached the person.</p>
        </>
      ) : null}
      {p.action === 'deliver' ? (
        <>
          <FieldGroup label="What happened?" required>
            <OptionGroup name="cm-ok" label="What happened?" value={s('ok')} onChange={(v) => set('ok', v)} options={[
              { value: 'yes', label: 'Delivered', description: 'It reached the person or their household.' }, { value: 'no', label: 'Not delivered', description: 'Nobody received it this time.' }]} />
          </FieldGroup>
          {s('ok') ? <Field label={s('ok') === 'yes' ? 'Delivered on' : 'When'} required><Input type="datetime-local" value={s('occurred_at')} onChange={(e) => set('occurred_at', e.target.value)} /></Field> : null}
          {s('ok') === 'yes' ? (
            <>
              <Field label="Received by" required><Input value={s('received_by')} onChange={(e) => set('received_by', e.target.value)} placeholder={`e.g. ${p.d.respondent?.name ?? ''}, or a household member’s name`} /></Field>
              <Field label="How you know" required><Select value={s('proof')} onChange={(e) => set('proof', e.target.value)}>{Object.entries(PROOF).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            </>
          ) : null}
          {s('ok') === 'no' ? (
            <>
              <Field label="What happened" required><Select value={s('reason')} onChange={(e) => set('reason', e.target.value)}>{Object.entries(NOT_DELIVERED).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
              <Field label="Note" optional><Textarea rows={2} value={s('note')} onChange={(e) => set('note', e.target.value)} /></Field>
              <p className="sa-hint">The attempt is kept. You can try again later.</p>
            </>
          ) : null}
        </>
      ) : null}
      {p.action === 'attendance' ? (
        <>
          <FieldGroup label="Did they come?" required>
            <OptionGroup name="cm-att" label="Did they come?" value={s('result')} onChange={(v) => set('result', v)} options={Object.entries(ATTENDANCE).map(([value, l]) => ({ value, label: l }))} />
          </FieldGroup>
          <Field label="What was agreed, or what happened" required><Textarea rows={3} value={s('note')} onChange={(e) => set('note', e.target.value)} /></Field>
        </>
      ) : null}
      {p.action === 'reschedule' ? (
        <>
          <Field label="New date and time" required><Input type="datetime-local" value={s('at')} onChange={(e) => set('at', e.target.value)} /></Field>
          <Field label="Place" required><Input value={s('place')} onChange={(e) => set('place', e.target.value)} /></Field>
          <Field label="How you told them" required><Input value={s('told')} onChange={(e) => set('told', e.target.value)} placeholder="e.g. By phone; a note left at the gate" /></Field>
        </>
      ) : null}
      {p.action === 'impose' ? (
        <>
          {fineAmount == null
            ? <Callout tone="amber" title="This rule has no fine amount yet.">Add it to the rule in Settings, Policies, once the subdivision has confirmed it. StraySafe never works out an amount.</Callout>
            : <Field label="Amount" hint="Read from the confirmed rule. StraySafe never works out an amount."><p className="sa-semibold">{peso(fineAmount)}</p></Field>}
          <Field label="Imposed on" required><Input type="date" value={s('imposed_on')} onChange={(e) => set('imposed_on', e.target.value)} /></Field>
          <Field label="How the person is told" required hint="An open question for the subdivision.">
            <Select value={s('told')} onChange={(e) => set('told', e.target.value)}>
              {['In writing, delivered like the letters', 'In person, at the subdivision office', 'At the Barangay meeting'].map((v) => <option key={v} value={v}>{v}</option>)}
            </Select>
          </Field>
          <Field label="Note" optional><Textarea rows={2} value={s('note')} onChange={(e) => set('note', e.target.value)} /></Field>
        </>
      ) : null}
      {p.action === 'pay' ? (
        <>
          <Field label="Paid on" required><Input type="date" value={s('paid_on')} onChange={(e) => set('paid_on', e.target.value)} /></Field>
          <Field label="Received by" required><Input value={s('received_by')} onChange={(e) => set('received_by', e.target.value)} /></Field>
          <Field label="Note" optional><Textarea rows={2} value={s('note')} onChange={(e) => set('note', e.target.value)} /></Field>
          <p className="sa-hint">StraySafe records only that it was paid. It does not take payments or keep receipts.</p>
        </>
      ) : null}
      {p.action === 'arrange' ? (
        <>
          <Callout>A meeting with the complainant, the person responsible and you. It is also written in this case’s Barangay referral log.</Callout>
          <Field label="Who you spoke with at the Barangay" required><Input value={s('contact')} onChange={(e) => set('contact', e.target.value)} placeholder="Name and role" /></Field>
          <div className="sa-grid2">
            <Field label="Date and time" required><Input type="datetime-local" value={s('at')} onChange={(e) => set('at', e.target.value)} /></Field>
            <Field label="Place" required><Input value={s('place')} onChange={(e) => set('place', e.target.value)} /></Field>
          </div>
          <Checkbox label="The complainant agreed to attend" hint="Their name becomes known to the person responsible at the meeting. Ask them first." checked={!!f.agreed} onChange={(e) => set('agreed', e.target.checked)} />
        </>
      ) : null}
      {p.action === 'meeting' ? (
        <>
          <FieldGroup label="Did it take place?" required>
            <OptionGroup name="cm-held" label="Did it take place?" value={s('held')} onChange={(v) => set('held', v)} options={[{ value: 'yes', label: 'It took place' }, { value: 'no', label: 'It did not take place' }]} />
          </FieldGroup>
          {s('held') === 'yes' ? (
            <FieldGroup label="Who attended">
              <div className="flex flex-col gap-2">
                <Checkbox label="The complainant" checked={!!f.a_c} onChange={(e) => set('a_c', e.target.checked)} />
                <Checkbox label="The person responsible" checked={!!f.a_r} onChange={(e) => set('a_r', e.target.checked)} />
                <Checkbox label="You" checked={!!f.a_l} onChange={(e) => set('a_l', e.target.checked)} />
              </div>
            </FieldGroup>
          ) : null}
          <Field label="Outcome, as the Barangay recorded it" required><Textarea rows={3} value={s('outcome')} onChange={(e) => set('outcome', e.target.value)} /></Field>
        </>
      ) : null}
    </Dialog>
  );
}
