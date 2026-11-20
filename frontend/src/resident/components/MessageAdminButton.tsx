import { useNavigate } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';
import { reportIdOf } from '../../live/refs';
import { residentPath } from '../config';
import { useResidentData } from '../data/context';
import { useSubmit } from '../lib/hooks';
import { residentApi } from '../live/api';
import { Button, FormError } from './ui';

/**
 * "Message Subdivision Administration" on the resident's own report. The server opens the conversation about this report (or returns the
 * one already open: one per case) under the report's subdivision, then the conversation screen opens.
 */
export function MessageAdminButton({ reportRef, block = true }: { reportRef: string; block?: boolean }) {
  const navigate = useNavigate();
  const { refreshConversations } = useResidentData();
  const { pending, error, run } = useSubmit();
  const open = () => run(async () => {
    const id = reportIdOf(reportRef);
    if (!id) throw new Error('That report could not be found.');
    const conversation = await residentApi.openReportConversation(id);
    await refreshConversations();
    navigate(residentPath(`/conversations/${conversation.thread_id}`));
  });
  return (
    <>
      <Button block={block} icon={MessageSquare} loading={pending} onClick={() => { void open(); }}>Message Subdivision Administration</Button>
      {error ? <FormError message={error} /> : null}
    </>
  );
}
