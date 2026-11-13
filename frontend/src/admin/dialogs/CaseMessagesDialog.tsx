import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Send } from 'lucide-react';
import { reportIdOf } from '../../live/refs';
import { errorMessage } from '../../preview/lib/errors';
import { fmtDateTime } from '../../preview/lib/format';
import { Button } from '../components/Button';
import { Dialog } from '../components/Dialog';
import { Field, Textarea } from '../components/form';
import { Callout, FormError } from '../components/layout';
import { useAdminData } from '../data/context';
import type { Case, ThreadTarget, ThreadView } from '../data/types';
import { threadViewFromApi } from '../live/adapters';
import { adminApi, type ApiThreadView } from '../live/api';
import { useSubmit } from '../lib/useSubmit';

const POLL_MS = 10_000;
const numberOf = (id: string) => {
  const n = reportIdOf(id);
  if (!n) throw new Error('That report could not be found.');
  return n;
};

/** A case conversation, not a contact-log form. The server authorizes its people and logs actual Leader messages in Activity. */
export function CaseMessagesDialog({ c, target, onClose }: { c: Case; target: ThreadTarget; onClose: () => void }) {
  const { dispatch, loadCase } = useAdminData();
  const loadCaseRef = useRef(loadCase);
  useEffect(() => { loadCaseRef.current = loadCase; });
  const { pending, error, run } = useSubmit();
  const [view, setView] = useState<ThreadView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [text, setText] = useState('');
  const pendingOpen = useRef<{ key: string; promise: Promise<ApiThreadView> } | null>(null);
  const pendingSend = useRef<{ body: string; key: string } | null>(null);
  const targetReport = target.reportId ?? c.id;
  const party = target.party;
  const openKey = `${attempt}:${c.id}:${targetReport}:${party}`;

  const open = useCallback((): Promise<ApiThreadView> => adminApi.openReportThread(numberOf(targetReport), party), [party, targetReport]);

  useEffect(() => {
    let live = true;
    if (!pendingOpen.current || pendingOpen.current.key !== openKey) {
      pendingOpen.current = { key: openKey, promise: open() };
    }
    const currentOpen = pendingOpen.current.promise;
    currentOpen.then(async (result) => {
      if (pendingOpen.current?.promise === currentOpen) pendingOpen.current = null;
      if (!live) return;
      setView(threadViewFromApi(result));
      setLoadError(null);
      if (result.unread > 0 && result.messages.length) await adminApi.readThread(result.thread_id, Math.max(...result.messages.map((m) => m.message_id)));
      if (live) void loadCaseRef.current(c.id);
    }).catch((err: unknown) => {
      if (pendingOpen.current?.promise === currentOpen) pendingOpen.current = null;
      if (live) setLoadError(errorMessage(err));
    });
    return () => { live = false; };
  }, [c.id, open, openKey]);

  const threadId = view?.id;
  useEffect(() => {
    if (!threadId) return undefined;
    let live = true;
    const refresh = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const latest = await adminApi.thread(Number(threadId));
        if (!live) return;
        setView(threadViewFromApi(latest));
        setLoadError(null);
        if (latest.unread > 0) {
          if (latest.messages.length) await adminApi.readThread(latest.thread_id, Math.max(...latest.messages.map((m) => m.message_id)));
          if (live) void loadCaseRef.current(c.id);
        }
      } catch (err) { if (live) setLoadError(errorMessage(err)); }
    };
    const timer = setInterval(() => { void refresh(); }, POLL_MS);
    document.addEventListener('visibilitychange', refresh);
    return () => { live = false; clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [c.id, threadId]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const body = text.trim();
    if (!body || !view?.canReply) return;
    if (!pendingSend.current || pendingSend.current.body !== body) pendingSend.current = { body, key: `cm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}` };
    const submission = pendingSend.current;
    const saved = await run(() => dispatch({ type: 'thread/send', id: targetReport, threadId: view.id, body, clientRequestId: submission.key }));
    if (!saved) return;
    if (targetReport !== c.id) void loadCaseRef.current(c.id);
    pendingSend.current = null;
    setText('');
    try { setView(threadViewFromApi(await adminApi.thread(Number(view.id)))); setLoadError(null); }
    catch { setLoadError('Your message was sent and recorded in Activity. The conversation could not be refreshed; try refreshing it.'); }
  };

  const title = target.label;
  const close = () => { void loadCaseRef.current(c.id); onClose(); };
  return (
    <Dialog size="lg" title={title} description={view ? view.people.map((p) => p.name).join(' · ') : target.name} onClose={close} dirty={text.trim() !== ''} onSubmit={(e) => { void submit(e); }}
      footer={({ requestClose }) => <><Button onClick={requestClose} disabled={pending}>Close</Button>{view?.canReply ? <Button type="submit" variant="primary" icon={Send} loading={pending} disabled={!text.trim()}>Send message</Button> : null}</>}>
      {!view && !loadError ? <p className="sa-text-2" role="status">Opening the conversation…</p> : null}
      {loadError ? <><FormError message={loadError} /><Button size="sm" onClick={() => setAttempt((n) => n + 1)}>Refresh conversation</Button></> : null}
      {view ? <>
        <Callout>Only this resident and the authorized Leader can read this conversation. Your messages are recorded in the case Activity automatically.</Callout>
        <ol className="m-0 flex max-h-80 list-none flex-col gap-3 overflow-y-auto p-0" aria-label="Conversation messages" aria-live="polite">
          {view.messages.map((m) => <li key={m.id} className={m.kind === 'system' ? 'sa-small sa-text-3' : 'sa-record'}>
            {m.kind !== 'system' ? <p className="sa-meta">{m.mine ? 'You' : m.senderName ?? m.label} · {m.label} · {fmtDateTime(m.at)}</p> : null}
            <p className="whitespace-pre-wrap break-words">{m.body}</p>
          </li>)}
        </ol>
        {view.messages.every((m) => m.kind === 'system') ? <p className="sa-text-2">No messages yet. Write the first message below.</p> : null}
        {!view.canReply ? <Callout>{view.endedReason || 'This conversation is closed. Earlier messages remain available.'}</Callout> : <Field label="Message" required hint="Write what you want to say. Your phone number and address are never added automatically."><Textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} rows={3} /></Field>}
      </> : null}
      {error ? <FormError message={error} /> : null}
    </Dialog>
  );
}
