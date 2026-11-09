import { useState } from 'react';
import { Segmented } from '../../components/form';
import { Block, Panel } from '../../components/layout';
import { EventTimeline } from '../../components/Timeline';
import type { Case, EventKind } from '../../data/types';

type Filter = 'all' | 'status' | 'actions' | 'assessment' | 'notes';

const GROUPS: Record<Exclude<Filter, 'all'>, EventKind[]> = {
  status: ['status', 'priority', 'reopen', 'closure'],
  actions: ['follow_up', 'owner_contact', 'warning', 'compliance', 'referral', 'referral_update', 'notice', 'link', 'unlink'],
  assessment: ['assessment', 'identity', 'ownership', 'claim'],
  notes: ['note', 'info', 'reported'],
};

/** The audit trail: who changed what, and when. Original reports and decisions are never rewritten. */
export default function HistoryTab({ c, now }: { c: Case; now: Date }) {
  const [filter, setFilter] = useState<Filter>('all');
  const count = (f: Filter) => (f === 'all' ? c.timeline.length : c.timeline.filter((e) => GROUPS[f].includes(e.kind)).length);
  const events = filter === 'all' ? c.timeline : c.timeline.filter((e) => GROUPS[filter].includes(e.kind));

  return (
    <div className="max-w-[900px]">
      <Panel>
        <Block title="History" description="Every significant update, decision and status change, with who made it and when.">
          <div className="mb-5">
            <Segmented
              label="Filter history"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'All', count: count('all') },
                { value: 'status', label: 'Status & priority', count: count('status') },
                { value: 'actions', label: 'Actions', count: count('actions') },
                { value: 'assessment', label: 'Assessment', count: count('assessment') },
                { value: 'notes', label: 'Notes', count: count('notes') },
              ]}
            />
          </div>
          {events.length === 0 ? <p className="sa-small sa-text-2">No events in this group.</p> : <EventTimeline events={events} now={now} />}
        </Block>
      </Panel>
    </div>
  );
}
