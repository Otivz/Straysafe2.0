import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Megaphone, PawPrint, Search } from 'lucide-react';
import { NoticeCard } from '../../components/Cards';
import { SearchInput } from '../../components/form';
import { PrimaryScreen } from '../../components/Screen';
import { Button, EmptyState, LinkButton, Section } from '../../components/ui';
import { residentPath } from '../../config';
import { useResidentData } from '../../data/context';
import { feed } from '../../data/selectors';
import { useSubdivisionName } from '../../lib/useOffice';

/** How many notices of each kind the overview shows. The rest are one tap away in the directory, a page at a time. */
const PREVIEW = 4;
/** How many safety advisories are shown before "Show all". */
const ADVISORIES = 2;

/**
 * R26 — Community: a short overview of the lost pets, found animals and safety advisories shared in the subdivision. It is deliberately not
 * a feed: each kind shows its newest few with how many there are in all, and "View all" opens the directory (searched, filtered and read
 * a page at a time by the server). A private report can never be listed here: only published, active notices are.
 */
export default function CommunityPage() {
  const { state } = useResidentData();
  const navigate = useNavigate();
  const subdivision = useSubdivisionName();
  const [query, setQuery] = useState('');
  const [allAdvisories, setAllAdvisories] = useState(false);

  const advisories = feed(state, 'safety_advisory');
  const lost = feed(state, 'lost_pet');
  const found = feed(state, 'found_animal');
  const lostTotal = Math.max(state.community?.lostTotal ?? 0, lost.length);
  const foundTotal = Math.max(state.community?.foundTotal ?? 0, found.length);
  const shownAdvisories = allAdvisories ? advisories : advisories.slice(0, ADVISORIES);

  // A search reads from the lost pets (where most searches are); the directory offers the found animals with the same words.
  const search = (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    navigate(residentPath(`/community/lost${q ? `?q=${encodeURIComponent(q)}` : ''}`));
  };

  return (
    <PrimaryScreen title="Community" lead={`Lost pets, found animals and safety advisories shared in ${subdivision === 'Your subdivision' ? 'your subdivision' : subdivision}.`}>
      <form role="search" className="rs-searchform" onSubmit={search}>
        <SearchInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, breed or colour" aria-label="Search lost pets and found animals" enterKeyHint="search" />
        <Button type="submit" icon={Search}>Search</Button>
      </form>

      {advisories.length > 0 ? (
        <Section
          title="Safety advisories"
          action={advisories.length > ADVISORIES ? <button type="button" className="rs-seeall rs-linkbtn" onClick={() => setAllAdvisories((v) => !v)}>{allAdvisories ? 'Show fewer' : `Show all ${advisories.length}`}</button> : undefined}
        >
          <ul className="rs-stack-sm rs-plain" aria-label="Safety advisories">
            {shownAdvisories.map((n) => <li key={n.id}><NoticeCard notice={n} /></li>)}
          </ul>
        </Section>
      ) : null}

      <Section title={<>Lost pets <span className="rs-count rs-meta">({lostTotal})</span></>} action={lostTotal > 0 ? <Link to={residentPath('/community/lost')} className="rs-seeall">View all ({lostTotal})</Link> : undefined}>
        {lost.length > 0 ? (
          <ul className="rs-stack-sm rs-plain" aria-label="Lost pets, newest first">
            {lost.slice(0, PREVIEW).map((n) => <li key={n.id}><NoticeCard notice={n} /></li>)}
          </ul>
        ) : (
          <EmptyState icon={PawPrint} title="No lost pets right now">When a neighbour reports a pet missing, the notice appears here.</EmptyState>
        )}
        {lostTotal > PREVIEW ? <LinkButton block to={residentPath('/community/lost')}>See all {lostTotal} lost pets</LinkButton> : null}
      </Section>

      <Section title={<>Found animals <span className="rs-count rs-meta">({foundTotal})</span></>} action={foundTotal > 0 ? <Link to={residentPath('/community/found')} className="rs-seeall">View all ({foundTotal})</Link> : undefined}>
        {found.length > 0 ? (
          <ul className="rs-stack-sm rs-plain" aria-label="Found animals, newest first">
            {found.slice(0, PREVIEW).map((n) => <li key={n.id}><NoticeCard notice={n} /></li>)}
          </ul>
        ) : (
          <EmptyState icon={Megaphone} title="No found animals right now">Animals the subdivision has taken in and published appear here.</EmptyState>
        )}
        {foundTotal > PREVIEW ? <LinkButton block to={residentPath('/community/found')}>See all {foundTotal} found animals</LinkButton> : null}
      </Section>

      <p className="rs-hint">Notices come from lost-pet reports, animals the subdivision has published, and advisories from the administrators. Private reports never appear here, and no notice shows who sent it.</p>
    </PrimaryScreen>
  );
}
