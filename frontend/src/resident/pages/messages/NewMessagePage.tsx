import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, ShieldCheck } from 'lucide-react';
import { Field, Input, Textarea } from '../../components/form';
import { Button, FormError } from '../../components/ui';
import { residentPath } from '../../config';
import { useResidentData } from '../../data/context';
import { useBack, usePageTitle, useSubmit } from '../../lib/hooks';
import { residentApi } from '../../live/api';

const MAX_SUBJECT = 160;
const MAX_BODY = 2000;

/**
 * Dedicated message composition page for starting a general conversation with
 * the Subdivision Administration, matching the ConversationPage layout.
 */
export default function NewMessagePage() {
  usePageTitle('New Message');
  const navigate = useNavigate();
  const goBack = useBack(residentPath('/messages'));
  const { refreshConversations } = useResidentData();
  const { pending, error, run } = useSubmit();

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [key] = useState(() => `gen-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);

  const canSend = subject.trim().length > 0 && body.trim().length > 0 && !pending;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSend) return;

    let createdId: number | undefined;
    const ok = await run(async () => {
      const created = await residentApi.startGeneralConversation(subject.trim(), body.trim(), key);
      createdId = created?.thread_id;
      void refreshConversations();
    });

    if (ok) {
      navigate(
        createdId ? residentPath(`/conversations/${createdId}`) : residentPath('/messages'),
        { replace: true },
      );
    }
  };

  return (
    <div className="mx-auto flex h-[100dvh] w-full max-w-[600px] min-w-0 flex-col overflow-hidden overflow-x-hidden bg-white sm:my-3 sm:h-[calc(100dvh-1.5rem)] sm:rounded-2xl sm:border sm:border-[#e7e2da] sm:shadow-sm">
      <header className="flex shrink-0 items-center gap-2.5 border-b border-[#e7e2da] bg-white px-3 py-2.5">
        <button
          type="button"
          onClick={goBack}
          aria-label="Back to Messages"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#44403c] transition-colors hover:bg-[#f5f0e8]"
        >
          <ArrowLeft size={19} aria-hidden="true" />
        </button>

        <div
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#b45309] text-white shadow-xs"
        >
          <ShieldCheck size={18} />
        </div>

        <div className="min-w-0">
          <h1 className="m-0 truncate text-sm font-bold text-[#1c1917] sm:text-base">
            New Message
          </h1>
          <p className="m-0 truncate text-xs text-[#78716c]">
            To your Subdivision Administration
          </p>
        </div>
      </header>

      <form onSubmit={(e) => void submit(e)} className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
          <p className="rs-hint m-0">
            Start a general conversation with your Subdivision Administration. About a specific report? Open the report and choose “Message Subdivision Administration” instead.
          </p>

          <Field label="Subject" required>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={MAX_SUBJECT}
              placeholder="What is it about?"
              disabled={pending}
              autoFocus
              className="w-full"
            />
          </Field>

          <Field label="Message" required hint="Your phone number and address are not shared automatically.">
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={MAX_BODY}
              rows={6}
              placeholder="Write your message to the administration..."
              disabled={pending}
              className="w-full"
            />
          </Field>

          {error ? <FormError message={error} /> : null}
        </div>

        <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-[#e7e2da] bg-white px-4 py-3 sm:flex-row sm:justify-end">
          <Button
            type="button"
            onClick={goBack}
            disabled={pending}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            icon={Send}
            loading={pending}
            disabled={!canSend}
            className="w-full sm:w-auto"
          >
            Send Message
          </Button>
        </footer>
      </form>
    </div>
  );
}
