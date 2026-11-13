import { useCallback, useEffect, useRef, useState } from 'react';
import { AdminApiError, errorMessage } from '../../preview/lib/errors';
import { useAuth } from '../auth/context';
import { useResidentData } from '../data/context';
import { residentApi, type ApiCaseConversationDetail } from '../live/api';

/** One case-linked conversation. Its messages stay separate from the original reporter/staff chat. */
export function useCaseConversation(threadId: string | undefined) {
  const id = Number(threadId);
  const valid = Number.isInteger(id) && id > 0;
  const { refreshConversations } = useResidentData();
  const { expireSession } = useAuth();
  const [loaded, setLoaded] = useState<{ id: number; conversation: ApiCaseConversationDetail | null; error?: string } | null>(null);
  const current = loaded?.id === id ? loaded : null;
  const sequence = useRef(0);
  const pendingSend = useRef<{ id: number; body: string; key: string } | null>(null);
  const [readError, setReadError] = useState<string>();

  const refresh = useCallback(async () => {
    if (!valid) return;
    const turn = ++sequence.current;
    try {
      const conversation = await residentApi.conversation(id);
      if (turn === sequence.current) setLoaded({ id, conversation });
    } catch (err) {
      if (err instanceof AdminApiError && err.kind === 'session') { expireSession(); return; }
      if (turn !== sequence.current) return;
      const restricted = err instanceof AdminApiError && (err.status === 403 || err.status === 404);
      setLoaded((old) => ({ id, conversation: restricted ? null : old?.id === id ? old.conversation : null, error: errorMessage(err) }));
    }
  }, [expireSession, id, valid]);

  useEffect(() => {
    void refresh();
    const update = () => { if (document.visibilityState === 'visible') void refresh(); };
    const timer = setInterval(update, 10_000);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => { sequence.current += 1; clearInterval(timer); window.removeEventListener('focus', update); document.removeEventListener('visibilitychange', update); };
  }, [refresh]);

  // Only mark messages already rendered, never a message that arrived between the detail read and this request.
  useEffect(() => {
    const conversation = current?.conversation;
    if (!conversation || conversation.unread === 0 || document.visibilityState !== 'visible') return;
    const through = Math.max(0, ...conversation.messages.map((m) => m.message_id));
    let live = true;
    residentApi.readConversation(id, through).then(async () => {
      if (!live) return;
      setReadError(undefined);
      await refreshConversations();
    }, () => { if (live) setReadError('The conversation opened, but its read mark could not be saved. It will retry automatically.'); });
    return () => { live = false; };
  }, [current?.conversation, id, refreshConversations]);

  const send = useCallback(async (body: string) => {
    const text = body.trim();
    if (!text || !valid) return;
    if (!pendingSend.current || pendingSend.current.id !== id || pendingSend.current.body !== text) {
      pendingSend.current = { id, body: text, key: `case-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}` };
    }
    const submission = pendingSend.current;
    let conversation: ApiCaseConversationDetail;
    try { conversation = await residentApi.sendConversationMessage(id, text, submission.key); }
    catch (err) { if (err instanceof AdminApiError && err.kind === 'session') expireSession(); throw err; }
    if (pendingSend.current === submission) pendingSend.current = null;
    sequence.current += 1;       // an older background read cannot replace the saved message
    setLoaded({ id, conversation });
    await refreshConversations();
  }, [expireSession, id, refreshConversations, valid]);

  return { conversation: current?.conversation ?? null, loading: valid && current === null, error: current?.error, readError, valid, refresh, send };
}
