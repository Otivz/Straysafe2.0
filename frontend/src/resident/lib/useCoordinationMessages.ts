import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '../../preview/lib/errors';
import { residentApi, type ApiCoordinationMessage } from '../live/api';

const POLL_MS = 15_000;

/**
 * The private messages of ONE conversation between the owner and the person who may have the pet. They are read when the panel opens, after
 * each message sent, and (while direct messaging is open and the screen is visible) every few seconds. The server decides who may read or
 * write; this only asks. Nothing here is kept in the app's state: leaving the screen leaves the messages on the server.
 */
export function useCoordinationMessages(coordinationId: string, poll: boolean) {
  const id = Number(coordinationId);
  const [loaded, setLoaded] = useState<{ id: number; messages: ApiCoordinationMessage[]; status: 'ready' | 'error'; error?: string } | null>(null);
  const current = loaded?.id === id ? loaded : null;
  const [round, setRound] = useState(0);              // each change reads the conversation again
  const pendingSend = useRef<{ id: number; text: string; key: string } | null>(null);

  useEffect(() => {
    let live = true;
    residentApi.coordinationMessages(id).then(
      (res) => { if (live) setLoaded({ id, messages: res.results, status: 'ready' }); },
      // a missed refresh keeps what is on screen; only a first read that failed is an error
      (err: unknown) => { if (live) setLoaded((old) => ({ id, messages: old?.id === id ? old.messages : [], status: old?.id === id && old.status === 'ready' ? 'ready' : 'error', error: errorMessage(err) })); },
    );
    return () => { live = false; };
  }, [id, round]);

  useEffect(() => {
    if (!poll) return undefined;
    const timer = setInterval(() => { if (document.visibilityState === 'visible') setRound((n) => n + 1); }, POLL_MS);
    return () => clearInterval(timer);
  }, [poll]);

  /** Sends one message, then reads the conversation again. Rejects with the server's own sentence when it is refused (for example once the Leader was asked). */
  const send = useCallback(async (text: string) => {
    const value = text.trim();
    if (!pendingSend.current || pendingSend.current.id !== id || pendingSend.current.text !== value) {
      pendingSend.current = { id, text: value, key: `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}` };
    }
    const submission = pendingSend.current;
    await residentApi.sendCoordinationMessage(id, value, submission.key);
    if (pendingSend.current === submission) pendingSend.current = null;
    setRound((n) => n + 1);
  }, [id]);

  return { messages: current?.messages ?? [], status: current?.status ?? 'loading', error: current?.error, send };
}
