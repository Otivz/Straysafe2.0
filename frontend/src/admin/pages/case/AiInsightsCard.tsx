import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, ChevronDown, ImageOff, RefreshCw, Sparkles } from 'lucide-react';
import { PriorityMark } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Callout } from '../../components/layout';
import { useToast } from '../../components/toast';
import { CATEGORIES, PRIORITIES } from '../../data/constants';
import { useAdminData } from '../../data/context';
import type { Case, Priority } from '../../data/types';
import { adminApi, type AiEvidenceFlag, type ApiAiInsights } from '../../live/api';
import { useSubmit } from '../../lib/useSubmit';
import { fmtDateTime } from '../../../preview/lib/format';
import { reportIdOf } from '../../../live/refs';

const EVIDENCE_FLAG_LABEL: Record<AiEvidenceFlag, string> = {
  blurry: 'Blurry photo',
  no_animal: 'No animal detected',
  contradicts_description: 'Photo may contradict description',
};

type Load = { state: 'loading' } | { state: 'ready'; data: ApiAiInsights } | { state: 'failed' };

/**
 * "AI Insights (Suggested)" on the Assessment tab (Phase 1 of the AI-in-report-analysis proposal).
 *
 * Suggest only: nothing here changes the case by itself. "Apply priority" and "Switch category" are the Leader's own, ordinary,
 * audited changes. The card never gets in the way: when AI is switched OFF, not set up, not applicable (Lost Pet) or a request
 * fails, it shows a short note (or nothing) and the rest of the page is exactly as before.
 */
export default function AiInsightsCard({ c, }: { c: Case }) {
  const { dispatch } = useAdminData();
  const toast = useToast();
  const { pending: applying, error: applyError, run } = useSubmit();
  const [open, setOpen] = useState(false);
  // What was read, and for which content: a different content (or case) is "loading" until its own answer arrives
  const [read, setRead] = useState<{ key: string; result: Load } | null>(null);
  const [making, setMaking] = useState(false);
  const seq = useRef(0);
  const id = reportIdOf(c.id) ?? 0;
  const closed = c.status === 'closed';

  // Read the cache again when the case's content changes (a different category, description or animal is a different insight)
  const content = `${c.category}|${c.description}|${c.animal.type}|${c.animal.breed ?? ''}|${c.animal.color ?? ''}|${c.animal.condition ?? ''}`;
  const key = `${id}|${content}`;
  const load: Load = read && read.key === key ? read.result : { state: 'loading' };
  const setLoad = useCallback((result: Load | ((prev: Load) => Load)) => {
    setRead((prev) => ({ key, result: typeof result === 'function' ? result(prev && prev.key === key ? prev.result : { state: 'loading' }) : result }));
  }, [key]);
  useEffect(() => {
    const mine = ++seq.current;
    adminApi.aiInsights(id).then(
      (data) => { if (mine === seq.current) setRead({ key, result: { state: 'ready', data } }); },
      () => { if (mine === seq.current) setRead({ key, result: { state: 'failed' } }); },
    );
  }, [id, key]);

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
  if (c.category === 'lost_pet') return null;
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

  const headline = insight
    ? `${PRIORITIES[suggestedPriority as Priority].label} priority suggested${check?.mismatch ? ' · category may not fit' : ''}`
    : 'Summary, suggested priority and a category check';

  return (
    <section className="sa-panel mb-4" aria-label="AI Insights (Suggested)" style={{ borderColor: '#e7e2da' }}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <Sparkles size={16} className="shrink-0 text-[var(--sa-brand-ink)]" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block text-[14px] font-semibold text-[var(--sa-ink)]">AI Insights (Suggested)</span>
            <span className="sa-meta block truncate">AI suggestion · Review before applying — {headline}</span>
          </span>
        </span>
        <ChevronDown size={16} className={`shrink-0 text-[var(--sa-ink-3)] transition-transform duration-150 ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {open ? (
        <div className="grid gap-3 border-t border-[#ede8df] px-4 py-3.5">
          {!insight && data?.status !== 'unavailable' && load.state !== 'failed' ? (
            <p className="sa-small m-0">Make a short summary, a suggested priority and a check that this report is under the right kind of concern. It only suggests: you decide what to apply.</p>
          ) : null}
          {load.state === 'failed' ? <p className="sa-meta m-0">AI insights could not be loaded. The case works as usual without them.</p> : null}
          {data?.status === 'unavailable' ? <Callout tone="amber">{data.message ?? 'AI insights are unavailable right now. You can continue without them.'}</Callout> : null}
          {data?.status === 'disabled' ? <p className="sa-meta m-0">{data.message ?? 'AI insights are switched off.'}</p> : null}

          {insight ? (
            <>
              <p className="sa-body m-0">{insight.summary}</p>

              <div className="grid gap-1.5 rounded-[var(--sa-radius)] border border-[#ede8df] bg-[#fcfaf6] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="sa-meta font-semibold text-[var(--sa-ink)]">Suggested priority</span>
                  {suggestedPriority ? <PriorityMark priority={suggestedPriority} /> : null}
                  {insight.priority_confidence ? <span className="sa-meta">{insight.priority_confidence} confidence</span> : null}
                  {differsPriority && !closed ? (
                    <Button size="sm" variant="secondary" loading={applying} onClick={applyPriority}>Apply priority</Button>
                  ) : (
                    <span className="sa-meta">{suggestedPriority === c.priority ? 'Same as the current priority' : null}</span>
                  )}
                </div>
                {insight.priority_reason ? <p className="sa-small m-0">{insight.priority_reason}</p> : null}
              </div>

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
                  <p className="sa-meta m-0 mt-1.5">Look at the photo yourself before deciding the evidence sufficiency. The AI never rejects evidence.</p>
                </Callout>
              ) : null}
              {insight.evidence_check.status === 'ok' ? (
                <p className="sa-meta m-0 inline-flex items-center gap-1.5"><CheckCircle2 size={14} className="text-[var(--sa-sage-ink,#3f6b4f)]" aria-hidden="true" />Evidence photo matches report details.</p>
              ) : null}
              {insight.evidence_check.status === 'no_media' ? (
                <p className="sa-meta m-0 inline-flex items-center gap-1.5"><ImageOff size={14} aria-hidden="true" />No photo attached to check.</p>
              ) : null}
              {insight.evidence_check.status === 'unavailable' ? (
                <p className="sa-meta m-0">The evidence photo could not be checked ({insight.evidence_check.summary || 'unavailable'}).</p>
              ) : null}
              {applyError ? <p className="sa-error m-0" role="alert">{applyError}</p> : null}
            </>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="sa-meta m-0">
              {insight?.generated_at ? `Made ${fmtDateTime(insight.generated_at)}. ` : ''}Written by AI from the report with personal details removed; it can be wrong.
            </p>
            {data?.status !== 'disabled' ? (
              <Button size="sm" variant="secondary" icon={insight ? RefreshCw : Sparkles} loading={making} onClick={generate}>
                {insight ? 'Refresh' : 'Generate AI Insights'}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
