import { useState } from 'react';
import { Megaphone, PawPrint, ShieldAlert } from 'lucide-react';
import { NoticeCard } from '../../components/Cards';
import { SearchInput } from '../../components/form';
import { PrimaryScreen } from '../../components/Screen';
import { EmptyState, LinkButton, Segmented } from '../../components/ui';
import { residentPath } from '../../config';
import { ANIMAL_TYPES } from '../../data/constants';
import { useResidentData } from '../../data/context';
import { feed, noticeName } from '../../data/selectors';
import type { Notice } from '../../data/types';
import { useSubdivisionName } from '../../lib/useOffice';

type Tab = 'lost' | 'found' | 'advisories';

/** Whether a notice matches what the resident typed: its name, what it looks like, where, or what kind of animal. */
function matches(n: Notice, q: string): boolean {
  if (!q) return true;
  const words = [noticeName(n), n.title, n.description, n.area, n.identity?.breed, n.identity?.color, n.identity?.marks, n.animalType ? ANIMAL_TYPES[n.animalType] : ''];
  return words.some((w) => (w ?? '').toLowerCase().includes(q));
}

/**
 * R26 — Community: the lost pets, found animals and safety advisories shared in the subdivision, one kind at a time, with one search that filters
 * as you type. Only published, active notices are listed: a private report never is. When the subdivision holds more than the newest few, the
 * directory (searched and read a page at a time by the server) is one tap away. Notification alerts never appear here: Community holds notices only.
 */
export default function CommunityPage() {
  const { state } = useResidentData();
  const subdivision = useSubdivisionName();
  const [tab, setTab] = useState<Tab>('lost');
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

  const lists: Record<Tab, Notice[]> = { lost: feed(state, 'lost_pet'), found: feed(state, 'found_animal'), advisories: feed(state, 'safety_advisory') };
  const totals: Record<Tab, number> = {
    lost: Math.max(state.community?.lostTotal ?? 0, lists.lost.length), found: Math.max(state.community?.foundTotal ?? 0, lists.found.length), advisories: lists.advisories.length,
  };
  const shown = lists[tab].filter((n) => matches(n, q));
  const more = tab !== 'advisories' && totals[tab] > lists[tab].length;
  const directory = residentPath(`/community/${tab === 'lost' ? 'lost' : 'found'}${q ? `?q=${encodeURIComponent(query.trim())}` : ''}`);
  const what = tab === 'lost' ? 'lost pets' : 'found animals';

  return (
    <PrimaryScreen title="Community" lead={`Lost pets, found animals and advisories in ${subdivision === 'Your subdivision' ? 'your subdivision' : subdivision}.`}>
      <SearchInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, breed or colour" aria-label="Search the Community" enterKeyHint="search" maxLength={60} />
      <Segmented<Tab>
        label="Show" value={tab} onChange={setTab}
        options={[
          { value: 'lost', label: 'Lost pets', count: q ? lists.lost.filter((n) => matches(n, q)).length : totals.lost },
          { value: 'found', label: 'Found animals', count: q ? lists.found.filter((n) => matches(n, q)).length : totals.found },
          { value: 'advisories', label: 'Advisories', count: q ? lists.advisories.filter((n) => matches(n, q)).length : totals.advisories },
        ]}
      />

      {shown.length > 0 ? (
        <ul className="rs-stack-sm rs-plain" aria-label={`${tab === 'advisories' ? 'Safety advisories' : tab === 'lost' ? 'Lost pets' : 'Found animals'}, newest first`}>
          {shown.map((n) => <li key={n.id}><NoticeCard notice={n} kicker={false} /></li>)}
        </ul>
      ) : q ? (
        <p className="rs-sub">Nothing here matches “{query.trim()}”.</p>
      ) : tab === 'lost' ? (
        <EmptyState icon={PawPrint} title="No lost pets right now">When a neighbour reports a pet missing, the notice appears here.</EmptyState>
      ) : tab === 'found' ? (
        <EmptyState icon={Megaphone} title="No found animals right now">Animals the subdivision has taken in and published appear here.</EmptyState>
      ) : (
        <EmptyState icon={ShieldAlert} title="No advisories right now">Safety advisories from the subdivision appear here.</EmptyState>
      )}

      {tab !== 'advisories' && (more || q) && totals[tab] > 0 ? (
        <LinkButton block to={directory}>{q ? `Search all ${totals[tab]} ${what}` : `See all ${totals[tab]} ${what}`}</LinkButton>
      ) : null}

      <p className="rs-hint">Only animals the subdivision shares appear here, and a notice never shows who sent it.</p>
    </PrimaryScreen>
  );
}
