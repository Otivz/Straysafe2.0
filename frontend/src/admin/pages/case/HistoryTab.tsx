import { useMemo, useState } from 'react';
import { History } from 'lucide-react';
import { Button } from '../../components/Button';
import { SearchInput, Segmented } from '../../components/form';
import { Block, EmptyState, Panel } from '../../components/layout';
import { EventTimeline } from '../../components/Timeline';
import type { Case, EventKind, TimelineEvent } from '../../data/types';

type Filter = 'all' | 'status' | 'actions' | 'referrals' | 'warnings' | 'assessment' | 'notes';

const GROUPS: Record<Exclude<Filter, 'all'>, EventKind[]> = {
  status: ['status', 'priority', 'reopen', 'closure'],
  actions: ['follow_up', 'owner_contact', 'warning', 'compliance', 'referral', 'referral_update', 'notice', 'link', 'unlink'],
  referrals: ['referral', 'referral_update'],
  warnings: ['warning', 'compliance'],
  assessment: ['assessment', 'identity', 'ownership', 'claim'],
  notes: ['note', 'info', 'reported'],
};

function matchesSearch(e: TimelineEvent, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  if (e.title.toLowerCase().includes(q)) return true;
  if (e.detail && e.detail.toLowerCase().includes(q)) return true;
  if (e.actor.toLowerCase().includes(q)) return true;
  if (
    e.changes?.some(
      (ch) =>
        ch.field.toLowerCase().includes(q) ||
        (ch.before ?? 'Previous value not recorded').toLowerCase().includes(q) ||
        ch.after.toLowerCase().includes(q),
    )
  ) {
    return true;
  }
  return false;
}

/** The audit trail: who changed what, and when. Original reports and decisions are never rewritten. */
export default function HistoryTab({ c, now }: { c: Case; now: Date }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const trimmedSearch = search.trim();

  const searchFiltered = useMemo(
    () => (trimmedSearch ? c.timeline.filter((e) => matchesSearch(e, trimmedSearch)) : c.timeline),
    [c.timeline, trimmedSearch],
  );

  const count = (f: Filter) =>
    f === 'all' ? searchFiltered.length : searchFiltered.filter((e) => GROUPS[f].includes(e.kind)).length;

  const events = useMemo(
    () => (filter === 'all' ? searchFiltered : searchFiltered.filter((e) => GROUPS[filter].includes(e.kind))),
    [searchFiltered, filter],
  );

  const hasActiveFilter = filter !== 'all' || trimmedSearch !== '';

  return (
    <div className="max-w-[900px]">
      <Panel>
        <Block>
          <p className="sa-small sa-text-3 mb-3.5">Every significant update, decision and status change, with who made it and when.</p>
          <div className="mb-5 flex flex-col gap-3">
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search history by activity, actor, or change…"
              aria-label="Search case history"
            />
            <div className="overflow-x-auto pb-1">
              <Segmented
                label="Filter history"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'all', label: 'All Activities', count: count('all') },
                  { value: 'status', label: 'Status & priority', count: count('status') },
                  { value: 'actions', label: 'Actions', count: count('actions') },
                  { value: 'referrals', label: 'Referrals', count: count('referrals') },
                  { value: 'warnings', label: 'Warnings', count: count('warnings') },
                  { value: 'assessment', label: 'Assessment', count: count('assessment') },
                  { value: 'notes', label: 'Notes', count: count('notes') },
                ]}
              />
            </div>
          </div>
          {events.length === 0 ? (
            <EmptyState
              compact
              icon={History}
              title={trimmedSearch ? 'No matching history entries' : 'No events in this group'}
              action={
                hasActiveFilter ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setFilter('all');
                      setSearch('');
                    }}
                  >
                    Clear filters
                  </Button>
                ) : undefined
              }
            >
              {trimmedSearch
                ? `No case history entries matched “${trimmedSearch}”${filter !== 'all' ? ' in this filter' : ''}.`
                : 'No recorded activities belong to this filter yet.'}
            </EmptyState>
          ) : (
            <EventTimeline events={events} now={now} />
          )}
        </Block>
      </Panel>
    </div>
  );
}
