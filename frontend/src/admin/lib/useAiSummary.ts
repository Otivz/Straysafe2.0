import { useCallback, useEffect, useRef, useState } from 'react';
import { adminApi, type ApiAiSummary } from '../live/api';

export type AiSummaryState =
  | { phase: 'loading' }
  | { phase: 'failed' }
  | { phase: 'ready'; data: ApiAiSummary };

/**
 * The Analytics page's AI trend and hotspot summary for one date range (YYYY-MM-DD, both days included).
 * It reads the cache on its own (GET, never Gemini) and asks the AI only when the Leader presses Generate / Refresh.
 * Every failure is a state, not an error: the page around it carries on exactly as before. `enabled` is false in the
 * sample-data mode, which has no server to ask.
 */
export function useAiSummary(from: string, to: string, enabled: boolean) {
  const key = `${from}|${to}`;
  const [read, setRead] = useState<{ key: string; state: AiSummaryState } | null>(null);
  const [making, setMaking] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    const mine = ++seq.current;
    adminApi.aiSummary(from, to).then(
      (data) => { if (mine === seq.current) setRead({ key, state: { phase: 'ready', data } }); },
      () => { if (mine === seq.current) setRead({ key, state: { phase: 'failed' } }); },
    );
  }, [enabled, from, to, key]);

  const generate = useCallback(async (refresh: boolean) => {
    const mine = ++seq.current;
    setMaking(true);
    try {
      const data = await adminApi.generateAiSummary(from, to, refresh);
      if (mine === seq.current) setRead({ key, state: { phase: 'ready', data } });
    } catch {
      if (mine === seq.current) setRead((prev) => ({ key, state: prev && prev.key === key && prev.state.phase === 'ready' ? prev.state : { phase: 'failed' } }));
    } finally {
      setMaking(false);
    }
  }, [from, to, key]);

  const state: AiSummaryState = !enabled ? { phase: 'failed' } : read && read.key === key ? read.state : { phase: 'loading' };
  return { state, making, generate, enabled };
}

export type AiSummary = ReturnType<typeof useAiSummary>;
