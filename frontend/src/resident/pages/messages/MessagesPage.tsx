import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Lock, MessageSquare, MessageSquarePlus } from 'lucide-react';
import { relative } from '../../../preview/lib/format';
import { Screen } from '../../components/Screen';
import { EmptyState, Pill, Row, Section, Segmented } from '../../components/ui';
import { residentPath } from '../../config';
import { useResidentData } from '../../data/context';
import type { CaseConversation } from '../../data/types';
import { useNow } from '../../lib/hooks';

type Filter = 'all' | 'unread' | 'open' | 'closed';

/**
 * The resident's conversations with the Subdivision Administration (and the lost/found conversations they are in), the most recent first:
 * subject, report reference, last message, when, unread and Open/Closed. A general conversation (about no report) starts here; a
 * conversation about a report starts from that report ("Message Subdivision Administration").
 */
export default function MessagesPage() {
  const { state } = useResidentData();
  const now = useNow();
  const [filter, setFilter] = useState<Filter>('all');
  const all = state.conversations ?? [];
  const counts = {
    all: all.length, unread: all.filter((c) => c.unread > 0).length,
    open: all.filter((c) => c.status === 'open').length, closed: all.filter((c) => c.status === 'closed').length,
  };
  const shown = all.filter((c) => filter === 'all' || (filter === 'unread' ? c.unread > 0 : c.status === filter));

  return (
    <Screen title="Messages" subtitle="With your Subdivision Administration" back="/home">
      <Section title="Conversations">
        <Segmented label="Show conversations" value={filter} onChange={setFilter} options={[
          { value: 'all', label: 'All', count: counts.all }, { value: 'unread', label: 'Unread', count: counts.unread },
          { value: 'open', label: 'Open', count: counts.open }, { value: 'closed', label: 'Closed', count: counts.closed },
        ]} />
        {shown.length === 0 ? (
          <EmptyState icon={MessageSquare} title={all.length === 0 ? 'No conversations yet' : 'Nothing here'}>
            {all.length === 0 ? 'Start a conversation with your Subdivision Administration, or message them from one of your reports.' : 'No conversation matches this filter.'}
          </EmptyState>
        ) : (
          <div className="rs-list" aria-live="polite">
            {shown.map((c) => <ConversationRow key={c.id} c={c} now={now} />)}
          </div>
        )}
      </Section>

      <p className="rs-hint m-0 pb-16 text-center">
        About one of your reports? Open the report and choose “Message Subdivision Administration”, so the conversation is linked to it.
      </p>

      <div className="pointer-events-none sticky bottom-5 z-20 mt-auto flex justify-end">
        <Link
          to={residentPath('/messages/new')}
          aria-label="New Message"
          title="New Message"
          className="pointer-events-auto rs-btn rs-btn--primary !h-14 !w-14 !min-h-0 !rounded-full !p-0 shadow-lg transition-transform duration-150 hover:scale-105 active:scale-95"
        >
          <MessageSquarePlus size={24} strokeWidth={2} aria-hidden="true" />
        </Link>
      </div>
    </Screen>
  );
}

function ConversationRow({ c, now }: { c: CaseConversation; now: Date }) {
  const closed = c.status === 'closed';
  const preview = c.lastText || (closed ? c.endedReason ?? 'Conversation closed' : c.subtitle);
  return (
    <Row
      to={residentPath(`/conversations/${c.id}`)}
      icon={closed ? Lock : MessageSquare}
      title={<>{c.unread > 0 ? <span className="rs-msg-unread" aria-label={`${c.unread} unread`} /> : null}{c.title}</>}
      meta={(
        <span className="rs-convrow">
          <span className="rs-convrow__preview">{c.reportRef ? `${c.reportRef} · ` : ''}{preview}</span>
          <span className="rs-convrow__meta">
            <Pill tone={closed ? 'neutral' : 'sage'} dot>{closed ? 'Closed' : 'Open'}</Pill>
            {c.unread > 0 ? <Pill tone="brand">{c.unread} unread</Pill> : null}
            <span>{relative(c.lastAt, now)}</span>
          </span>
        </span>
      )}
    />
  );
}
