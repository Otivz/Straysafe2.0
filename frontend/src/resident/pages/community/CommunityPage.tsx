import { useState } from 'react';
import { Megaphone, SearchX } from 'lucide-react';
import { NoticeCard } from '../../components/Cards';
import { SearchInput } from '../../components/form';
import { PrimaryScreen } from '../../components/Screen';
import { Button, Callout, EmptyState, Segmented } from '../../components/ui';
import { NOTICE_TYPES } from '../../data/constants';
import { useResidentData } from '../../data/context';
import { feed } from '../../data/selectors';
import type { NoticeType } from '../../data/types';
import { useSubdivisionName } from '../../lib/useOffice';

type Filter = 'all' | NoticeType;

/**
 * R26 — Community: lost-pet notices, found animals and safety advisories. This is the only place published information
 * appears. A private report can never be listed here: the feed is built only from published, active notices.
 */
export default function CommunityPage() {
  const { state } = useResidentData();
  const subdivision = useSubdivisionName();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const all = feed(state, 'all');
  const count = (t: NoticeType) => all.filter((n) => n.type === t).length;
  const shown = feed(state, filter).filter((n) => !q || `${n.title} ${n.description} ${n.area}`.toLowerCase().includes(q));

  return (
    <PrimaryScreen title="Community" lead={`Lost pets, found animals and safety advisories shared in ${subdivision === 'Your subdivision' ? 'your subdivision' : subdivision}.`}>
      <Segmented<Filter>
        label="Show"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'All', count: all.length },
          { value: 'lost_pet', label: 'Lost', count: count('lost_pet') },
          { value: 'found_animal', label: 'Found', count: count('found_animal') },
          { value: 'safety_advisory', label: 'Advisories', count: count('safety_advisory') },
        ]}
      />
      <SearchInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search notices" aria-label="Search notices" />

      {shown.length > 0 ? (
        <ul className="rs-stack-sm rs-plain" aria-label={filter === 'all' ? 'All notices' : NOTICE_TYPES[filter].plural}>
          {shown.map((n) => <li key={n.id}><NoticeCard notice={n} /></li>)}
        </ul>
      ) : q ? (
        <EmptyState icon={SearchX} title="No notices match" action={<Button onClick={() => setQuery('')}>Clear search</Button>}>
          Try a different word, or look under All.
        </EmptyState>
      ) : (
        <EmptyState icon={Megaphone} title={filter === 'all' ? 'No notices right now' : `No ${NOTICE_TYPES[filter].plural.toLowerCase()} right now`}>
          New notices appear here as soon as the subdivision or a neighbour shares them.
        </EmptyState>
      )}

      <Callout tone="info" title="What appears here.">
        Notices from lost-pet reports, found animals the subdivision has published, and advisories from the administrators. Private reports never appear here, and no notice shows who sent it.
      </Callout>
    </PrimaryScreen>
  );
}
