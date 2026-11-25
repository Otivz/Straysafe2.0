import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowRight, CheckCircle2, ChevronDown, Copy, ImageOff, RefreshCw, Sparkles } from 'lucide-react';
import { PriorityMark } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Callout } from '../../components/layout';
import { useToast } from '../../components/toast';
import { CATEGORIES, PRIORITIES } from '../../data/constants';
import { useAdminData } from '../../data/context';
import { isLostOrFound, matchesOf, pendingFollowUpsOf } from '../../data/selectors';
import type { Case, Priority } from '../../data/types';
import { adminApi, type AiEvidenceFlag, type AiGuidanceAction, type ApiAiGuidance, type ApiAiInsights } from '../../live/api';
import { useSubmit } from '../../lib/useSubmit';
import { dueInfo, fmtDateTime } from '../../../preview/lib/format';
import { useNow } from '../../../preview/lib/hooks';
import { reportIdOf } from '../../../live/refs';
import type { OpenCaseDialog } from './dialogState';

const EVIDENCE_FLAG_LABEL: Record<AiEvidenceFlag, string> = {
  blurry: 'Blurry photo',
  no_animal: 'No animal detected',
  contradicts_description: 'Photo may contradict description',
};

type Load = { state: 'loading' } | { state: 'ready'; data: ApiAiInsights } | { state: 'failed' };

/**
 * Next steps, missing information and a recap. Each next step only OPENS the ordinary screen for it (a dialog, the form below, or the
 * Overview tab): nothing is done for the Leader. `actionFor` returns null when there is nothing to open (no handler, no item found).
 */
function GuidanceSection({ g, actionFor }: { g: ApiAiGuidance; actionFor: (a: AiGuidanceAction) => { label: string; run: () => void } | null }) {
  const toast = useToast();
  if (g.status === 'none') return <p className="sa-meta m-0">Next steps, missing information and a case recap are not made yet. Refresh to make them.</p>;
  if (g.status === 'unavailable') return <p className="sa-meta m-0">Guidance unavailable. The summary and suggestions above still apply.</p>;

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Question copied');
    } catch {
      toast.error('Could not copy. Select the text and copy it yourself.');
    }
  };

  return (
    <div className="sa-ai__guide">
      {g.stale ? <p className="sa-ai__stale"><RefreshCw size={13} aria-hidden="true" />The case changed since this was made. Refresh to update it.</p> : null}
      {g.decision ? (
        <section>
          <p className="sa-ai__label">Decision and why</p>
          <p className="sa-ai__text sa-ai__decision">{g.decision}</p>
        </section>
      ) : null}
      {g.recap ? (
        <section>
          <p className="sa-ai__label">Case recap</p>
          <p className="sa-ai__text">{g.recap}</p>
        </section>
      ) : null}
      {g.next_steps.length > 0 ? (
        <section>
          <p className="sa-ai__label">Recommended next steps</p>
          <ol className="sa-ai__steps">
            {g.next_steps.map((s, i) => {
              const act = actionFor(s.action);
              return (
                <li key={s.action} className="sa-ai__step" style={{ ['--i' as string]: i }}>
                  <div className="min-w-0">
                    <strong>{s.label}</strong>
                    {s.reason ? <p>{s.reason}</p> : null}
                  </div>
                  {act ? <Button size="sm" variant="secondary" icon={ArrowRight} onClick={act.run}>{act.label}</Button> : null}
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}
      {g.rule_suggestions && g.rule_suggestions.length > 0 ? (
        <section>
          <p className="sa-ai__label">Suggested rule</p>
          <ul className="sa-ai__list">
            {g.rule_suggestions.map((r) => <li key={r.id}><strong>{r.title ?? r.id}</strong>{r.reason ? `. ${r.reason}` : ''}</li>)}
          </ul>
          <p className="sa-ai__muted">AI suggestion. You choose the rule when you verify what happened.</p>
        </section>
      ) : g.rules_asked ? (
        <section>
          <p className="sa-ai__label">Suggested rule</p>
          <p className="sa-ai__muted">No clear match with the subdivision’s confirmed rules. You choose the rule when you verify what happened.</p>
        </section>
      ) : null}
      {g.missing.length > 0 ? (
        <section>
          <p className="sa-ai__label">Missing information</p>
          <ul className="sa-ai__list">
            {g.missing.map((m) => <li key={m}>{m}</li>)}
          </ul>
        </section>
      ) : null}
      {g.draft_question ? (
        <section>
          <p className="sa-ai__label">Draft question to the reporter</p>
          <div className="sa-ai__quote">
            <blockquote>{g.draft_question}</blockquote>
            <div className="sa-ai__rowline">
              <Button size="sm" variant="secondary" icon={Copy} onClick={() => void copy(g.draft_question ?? '')}>Copy</Button>
              <span className="sa-ai__muted">AI draft: check it before sending.</span>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

/**
 * "AI Insights (Suggested)" (Phase 1 of the AI-in-report-analysis proposal) on every case page: the Assessment tab of the standard case
 * page, the animal complaint page, and the monitored page of a missing pet or a found animal.
 *
 * Suggest only: nothing here changes the case by itself. "Apply priority" and "Switch category" are the Leader's own, ordinary,
 * audited changes (the monitored page has no priority to set, so it is not offered there). The card never gets in the way: when AI is
 * switched OFF, not set up, or a request fails, it shows a short note (or nothing) and the rest of the page is exactly as before.
 *
 * onComplaintAction: the complaint page's own dialogs ("verify", "resp") for the complaint next steps.
 */
export default function AiInsightsCard({ c, openDialog, onComplaintAction }: {
  c: Case; openDialog?: OpenCaseDialog; onComplaintAction?: (kind: 'verify' | 'resp') => void;
}) {
  const { state, dispatch } = useAdminData();
  const toast = useToast();
  const now = useNow();
  const [params, setParams] = useSearchParams();
  const { pending: applying, error: applyError, run } = useSubmit();
  const [open, setOpen] = useState(false);
  // What was read, and for which content: a different content (or case) is "loading" until its own answer arrives
  const [read, setRead] = useState<{ key: string; result: Load } | null>(null);
  const [making, setMaking] = useState(false);
  const seq = useRef(0);
  const id = reportIdOf(c.id) ?? 0;
  const closed = c.status === 'closed';
  // A missing pet or a found animal is monitored: no review, assessment, status or priority to set there
  const monitored = isLostOrFound(c);
  const waitingMatch = matchesOf(state.matches, c.id).waiting[0];

  // Read the cache again when the case's content changes (a different category, description or animal is a different insight)
  const content = `${c.category}|${c.description}|${c.animal.type}|${c.animal.breed ?? ''}|${c.animal.color ?? ''}|${c.animal.condition ?? ''}`;
  const key = `${id}|${content}`;
  const load: Load = read && read.key === key ? read.result : { state: 'loading' };
  const setLoad = useCallback((result: Load | ((prev: Load) => Load)) => {
    setRead((prev) => ({ key, result: typeof result === 'function' ? result(prev && prev.key === key ? prev.result : { state: 'loading' }) : result }));
  }, [key]);
  // Where the case stands (status, priority, assessment, follow-ups, referrals, claims): when it changes the cache is read again in the
  // background (the card keeps showing meanwhile), so the guidance can say the case changed and drop steps that no longer fit
  const caseState = [c.status, c.priority, c.assessment.savedAt ?? '', c.followUps.map((f) => `${f.id}:${f.status}`).join(),
    c.referrals.map((r) => `${r.id}:${r.status}`).join(), c.claims.map((k) => `${k.id}:${k.status}`).join(),
    (c.lostPet?.sightings ?? []).map((s) => `${s.id}:${s.review}`).join(), waitingMatch?.id ?? ''].join('|');
  useEffect(() => {
    const mine = ++seq.current;
    adminApi.aiInsights(id).then(
      (data) => { if (mine === seq.current) setRead({ key, result: { state: 'ready', data } }); },
      () => { if (mine === seq.current) setRead({ key, result: { state: 'failed' } }); },
    );
  }, [id, key, caseState]);

  const generate = useCallback(async () => {
    const mine = ++seq.current;
    setMaking(true);
    try {
      const data = await adminApi.generateAiInsights(id);
      if (mine === seq.current) { setLoad({ state: 'ready', data }); setOpen(true); }
    } catch {
      if (mine === seq.current) setLoad((prev) => (prev.state === 'ready' ? { state: 'ready', data: { ...prev.data, status: 'unavailable', message: 'AI insights are unavailable right now. You can continue without them.' } } : { state: 'failed' }));
    } finally {
      setMaking(false);
    }
  }, [id, setLoad]);

  // Nothing to show: the page is exactly as it was
  if (load.state === 'ready' && (load.data.status === 'disabled' || load.data.status === 'not_applicable')) return null;
  if (load.state === 'loading') return null;

  const data = load.state === 'ready' ? load.data : null;
  const insight = data?.insight ?? null;
  const suggestedPriority = insight ? (insight.suggested_priority.toLowerCase() as Priority) : null;
  const check = insight?.category_check ?? null;
  const differsPriority = suggestedPriority !== null && suggestedPriority !== c.priority;

  const applyPriority = async () => {
    if (!suggestedPriority) return;
    if (await run(() => dispatch({ type: 'case/changePriority', id: c.id, to: suggestedPriority, reason: 'Applied the AI-suggested priority after review.' }))) {
      toast.success(`Priority set to ${PRIORITIES[suggestedPriority].label}`);
    }
  };
  const switchCategory = async () => {
    const to = check?.suggested_category;
    if (!to) return;
    if (await run(() => dispatch({ type: 'case/changeCategory', id: c.id, to }))) toast.success(`Category changed to ${CATEGORIES[to].label}`);
  };

  // A suggested next step opens the screen for it; the Leader does the rest there
  const actionFor = (action: AiGuidanceAction): { label: string; run: () => void } | null => {
    if (closed) return null;
    const dialog = (d: Parameters<OpenCaseDialog>[0]) => (openDialog ? { label: 'Open', run: () => openDialog(d) } : null);
    switch (action) {
      case 'start_review':
      case 'mark_in_progress':
        return dialog({ kind: 'status' });
      case 'record_assessment':
        return null;  // the assessment form is right below this card
      case 'request_more_evidence':
        return dialog({ kind: 'followUp', mode: 'follow_up', initialTitle: 'Ask the reporter for more evidence' });
      case 'schedule_follow_up':
        return dialog({ kind: 'followUp', mode: 'follow_up' });
      case 'complete_follow_up': {
        const overdue = pendingFollowUpsOf(c).find((f) => dueInfo(f.dueAt, now).overdue);
        return overdue ? dialog({ kind: 'completeFollowUp', followUpId: overdue.id }) : null;
      }
      case 'create_referral':
        return dialog({ kind: 'referral' });
      case 'review_claim': {
        const claim = c.claims.find((k) => k.status === 'submitted' || k.status === 'under_review' || k.status === 'needs_info');
        return claim ? dialog({ kind: 'claim', claimId: claim.id }) : null;
      }
      case 'review_possible_owners':
        // On the monitored page Possible Pet Owners is further down this same page; on the standard page it is on the Overview tab
        if (monitored) return null;
        return { label: 'Go to Overview', run: () => { const next = new URLSearchParams(params); next.delete('tab'); setParams(next, { replace: true }); } };
      case 'verify_incident':
        return onComplaintAction ? { label: 'Open', run: () => onComplaintAction('verify') } : null;
      case 'find_respondent':
        return onComplaintAction ? { label: 'Open', run: () => onComplaintAction('resp') } : null;
      case 'review_possible_match':
        return waitingMatch ? dialog({ kind: 'match', matchId: waitingMatch.id }) : null;
      case 'review_sighting': {
        const sighting = (c.lostPet?.sightings ?? []).find((s) => s.review === 'unverified');
        return sighting ? dialog({ kind: 'reviewSighting', sightingId: sighting.id }) : null;
      }
      default:
        return null;
    }
  };

  const steps = insight?.guidance?.next_steps.length ?? 0;
  const headline = !insight
    ? (monitored ? 'Summary, next steps and what the report is missing' : 'Summary, suggested priority and a category check')
    : monitored
      ? `${steps ? `${steps} suggested next step${steps === 1 ? '' : 's'}` : 'Summary and case recap'}${check?.mismatch ? ' · category may not fit' : ''}`
      : `${PRIORITIES[suggestedPriority as Priority].label} priority suggested${check?.mismatch ? ' · category may not fit' : ''}`;

  return (
    <section className="sa-ai" data-open={open} aria-label="AI Insights (Suggested)">
      <button type="button" className="sa-ai__head" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="sa-ai__lead">
          <span className="sa-ai__mark"><Sparkles size={17} aria-hidden="true" /></span>
          <span className="min-w-0">
            <span className="sa-ai__title">AI Insights (Suggested)<span className="sa-ai__badge">AI</span></span>
            <span className="sa-ai__sub">Review before applying — {headline}</span>
          </span>
        </span>
        <ChevronDown size={18} className="sa-ai__chev" aria-hidden="true" />
      </button>

      <div className="sa-ai__body">
        <div className="sa-ai__clip" inert={!open}>
          <div className="sa-ai__content">
            {!insight && data?.status !== 'unavailable' && load.state !== 'failed' ? (
              <p className="sa-ai__text">Make a short summary, a suggested priority, a check that this report is under the right kind of concern, and suggested next steps with what the report is missing. It only suggests: you decide what to do.</p>
            ) : null}
            {load.state === 'failed' ? <p className="sa-ai__muted">AI insights could not be loaded. The case works as usual without them.</p> : null}
            {data?.status === 'unavailable' ? <Callout tone="amber">{data.message ?? 'AI insights are unavailable right now. You can continue without them.'}</Callout> : null}
            {data?.status === 'disabled' ? <p className="sa-ai__muted">{data.message ?? 'AI insights are switched off.'}</p> : null}

            {insight ? (
              <>
                <p className="sa-ai__summary">{insight.summary}</p>

                {monitored ? null : (
                  <div className="sa-ai__card">
                    <div className="sa-ai__rowline">
                      <span className="sa-ai__label">Suggested priority</span>
                      {suggestedPriority ? <PriorityMark priority={suggestedPriority} /> : null}
                      {insight.priority_confidence ? <span className="sa-ai__muted">{insight.priority_confidence} confidence</span> : null}
                      {differsPriority && !closed ? (
                        <Button size="sm" variant="secondary" loading={applying} onClick={applyPriority}>Apply priority</Button>
                      ) : suggestedPriority === c.priority ? (
                        <span className="sa-ai__ok"><CheckCircle2 size={14} aria-hidden="true" />Same as the current priority</span>
                      ) : null}
                    </div>
                    {insight.priority_reason ? <p className="sa-ai__text">{insight.priority_reason}</p> : null}
                  </div>
                )}

                {check?.mismatch && check.suggested_category ? (
                  <Callout tone="amber" title="This may be the wrong kind of concern.">
                    The report reads more like <strong>{check.suggested_category_label ?? CATEGORIES[check.suggested_category].label}</strong> than <strong>{CATEGORIES[c.category].label}</strong>.
                    {check.reason ? ` ${check.reason}` : ''}
                    {!closed ? (
                      <div className="mt-2">
                        <Button size="sm" variant="secondary" loading={applying} onClick={switchCategory}>Switch category</Button>
                      </div>
                    ) : null}
                  </Callout>
                ) : null}
                {insight.evidence_check.status === 'flag' ? (
                  <Callout tone="amber" title="Evidence check · AI suggestion.">
                    <ul className="m-0 mt-1 list-disc pl-5">
                      {insight.evidence_check.flags.map((f) => <li key={f}>{EVIDENCE_FLAG_LABEL[f]}</li>)}
                    </ul>
                    {insight.evidence_check.summary ? <p className="m-0 mt-1.5">{insight.evidence_check.summary}</p> : null}
                    <p className="sa-ai__muted m-0 mt-1.5">Look at the photo yourself before deciding the evidence sufficiency. The AI never rejects evidence.</p>
                  </Callout>
                ) : null}
                {insight.evidence_check.status === 'ok' ? (
                  <p className="sa-ai__ok"><CheckCircle2 size={14} aria-hidden="true" />Evidence photo matches report details.</p>
                ) : null}
                {insight.evidence_check.status === 'no_media' ? (
                  <p className="sa-ai__muted inline-flex items-center gap-1.5"><ImageOff size={14} aria-hidden="true" />No photo attached to check.</p>
                ) : null}
                {insight.evidence_check.status === 'unavailable' ? (
                  <p className="sa-ai__muted">The evidence photo could not be checked ({insight.evidence_check.summary || 'unavailable'}).</p>
                ) : null}
                {insight.guidance ? <GuidanceSection g={insight.guidance} actionFor={actionFor} /> : null}
                {applyError ? <p className="sa-error m-0" role="alert">{applyError}</p> : null}
              </>
            ) : null}

            <div className="sa-ai__foot">
              <p>{insight?.generated_at ? `Made ${fmtDateTime(insight.generated_at)}. ` : ''}Written by AI from the report with personal details removed; it can be wrong.</p>
              {data?.status !== 'disabled' ? (
                <Button size="sm" variant="secondary" icon={insight ? RefreshCw : Sparkles} loading={making} onClick={generate}>
                  {insight ? 'Refresh' : 'Generate AI Insights'}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
