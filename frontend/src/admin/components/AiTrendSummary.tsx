import { useState } from 'react';
import { ChevronDown, Copy, MapPin, RefreshCw, Sparkles } from 'lucide-react';
import { Button } from './Button';
import { Callout } from './layout';
import { useToast } from './toast';
import type { AiSummary } from '../lib/useAiSummary';
import { fmtDateTime } from '../../preview/lib/format';

/** The one badge both pieces wear: what wrote the text, and that a person must check it against the data on the page. */
function SummaryBadge({ source }: { source: 'ai' | 'rules' | null }) {
  return (
    <span className="sa-autotag" title="Written from the aggregated numbers of this page. It can be wrong: check it against the charts and the map.">
      <Sparkles size={11} aria-hidden="true" />
      {source === 'rules' ? 'Rule-based summary · AI unavailable' : 'AI summary · Advisory only'}
    </span>
  );
}

/** Whether there is any text to show (an AI summary, or the rule-based one that comes with `unavailable`). */
const hasText = (s: AiSummary['state']) =>
  s.phase === 'ready' && (s.data.status === 'ready' || s.data.status === 'unavailable') && Boolean(s.data.trend_summary);

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers and non-secure pages: fall back to a hidden text box
    try {
      const box = document.createElement('textarea');
      box.value = text;
      box.setAttribute('readonly', '');
      box.style.position = 'fixed';
      box.style.opacity = '0';
      document.body.appendChild(box);
      box.select();
      const ok = document.execCommand('copy');
      box.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/**
 * "AI Trend & Hotspot Summary" on the Analytics page (section 2B of the AI-in-report-analysis proposal): a plain-words reading of the
 * trend and the repeat complaint patterns, and a digest the Leader can copy. Advisory only. When AI is switched OFF (or there is no server
 * to ask) it is simply not there; when the AI fails, the page shows a plain rule-based summary, labelled as such, and everything else works.
 */
export function AiTrendSummaryCard({ ai }: { ai: AiSummary }) {
  const toast = useToast();
  const [digestOpen, setDigestOpen] = useState(false);
  const { state, making, generate } = ai;

  if (!ai.enabled || state.phase === 'loading') return null;
  if (state.phase === 'ready' && state.data.status === 'disabled') return null;

  const data = state.phase === 'ready' ? state.data : null;
  const text = hasText(state);
  const insufficient = data?.status === 'insufficient_data';

  const copyDigest = async () => {
    if (!data?.monthly_digest) return;
    if (await copyText(data.monthly_digest)) toast.success('Digest copied');
    else toast.error('The digest could not be copied. Select the text and copy it by hand.');
  };

  return (
    <section className="sa-panel" aria-label="AI Trend and Hotspot Summary" style={{ borderColor: '#e7e2da' }}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4 sm:px-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="sa-h2 m-0">AI Trend &amp; Hotspot Summary</h2>
            <SummaryBadge source={data?.source ?? 'ai'} />
          </div>
          <p className="sa-small sa-text-3 mt-0.5">Review against the data below. It only describes the numbers; it decides nothing.</p>
        </div>
        {!insufficient ? (
          <Button size="sm" variant="secondary" icon={text ? RefreshCw : Sparkles} loading={making} onClick={() => void generate(text)}>
            {text ? 'Refresh summary' : 'Generate summary'}
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 px-4 pb-4 pt-3 sm:px-5">
        {state.phase === 'failed' ? <p className="sa-meta m-0">The AI summary could not be loaded. The page works as usual without it.</p> : null}
        {insufficient ? <p className="sa-small m-0">{data?.message ?? 'Not enough activity in this period for a summary.'}</p> : null}
        {data?.status === 'unavailable' ? <Callout tone="amber">{data.message ?? 'The AI summary is unavailable right now.'}</Callout> : null}
        {data?.status === 'not_generated' ? (
          <p className="sa-small m-0">Press <strong>Generate summary</strong> for a short reading of this period. Only totals and general areas are used: no names, phone numbers or addresses leave the server.</p>
        ) : null}

        {text && data ? (
          <>
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <h3 className="sa-label m-0 mb-1">Trend summary</h3>
                <p className="sa-body m-0">{data.trend_summary}</p>
              </div>
              <div>
                <h3 className="sa-label m-0 mb-1">Repeat complaint patterns</h3>
                {data.repeat_patterns.length === 0 ? <p className="sa-small sa-text-2 m-0">No repeat pattern stands out in this period.</p> : (
                  <ul className="m-0 flex list-disc flex-col gap-1 pl-5">
                    {data.repeat_patterns.map((p) => <li key={p} className="sa-small sa-text-2">{p}</li>)}
                  </ul>
                )}
              </div>
            </div>

            <div className="rounded-[var(--sa-radius)] border border-[#ede8df] bg-[#fcfaf6]">
              <button
                type="button"
                aria-expanded={digestOpen}
                onClick={() => setDigestOpen((v) => !v)}
                className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left"
              >
                <span className="text-[13.5px] font-semibold text-[var(--sa-ink)]">Monthly digest</span>
                <ChevronDown size={15} className={`shrink-0 text-[var(--sa-ink-3)] transition-transform duration-150 ${digestOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>
              {digestOpen ? (
                <div className="grid gap-2.5 border-t border-[#ede8df] px-3.5 py-3">
                  <p className="sa-body m-0">{data.monthly_digest}</p>
                  <div>
                    <Button size="sm" variant="secondary" icon={Copy} onClick={() => void copyDigest()}>Copy digest</Button>
                  </div>
                </div>
              ) : null}
            </div>

            <p className="sa-meta m-0">
              {data.source === 'rules' ? 'Built from the same numbers without AI. ' : data.generated_at ? `Made ${fmtDateTime(data.generated_at)}. ` : ''}
              Based only on totals and general areas for your subdivision.
            </p>
          </>
        ) : null}
      </div>
    </section>
  );
}

/**
 * The hotspot explanation, placed directly above the "Case locations" map so the Leader reads the context next to the pins.
 * Not there at all while there is no text (AI off, not generated yet, or the AI and its fallback both gave nothing).
 */
export function AiHotspotNote({ ai }: { ai: AiSummary }) {
  const { state } = ai;
  if (!ai.enabled || !hasText(state) || state.phase !== 'ready' || !state.data.hotspot_explanation) return null;
  return (
    <aside className="sa-panel flex flex-wrap items-start gap-x-3 gap-y-1.5 px-4 py-3 sm:px-5" aria-label="Hotspot explanation" style={{ borderColor: '#e7e2da' }}>
      <MapPin size={17} className="mt-0.5 shrink-0 text-[var(--sa-brand-ink)]" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex flex-wrap items-center gap-2">
          <span className="text-[13.5px] font-semibold text-[var(--sa-ink)]">Hotspot context</span>
          <SummaryBadge source={state.data.source} />
        </div>
        <p className="sa-body m-0">{state.data.hotspot_explanation}</p>
        <p className="sa-meta m-0 mt-1">Read it against the pins on the map below.</p>
      </div>
    </aside>
  );
}
