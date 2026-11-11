import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Megaphone, PawPrint, SearchX } from 'lucide-react';
import { errorMessage } from '../../../preview/lib/errors';
import { NoticeCard } from '../../components/Cards';
import { SearchInput } from '../../components/form';
import { Screen } from '../../components/Screen';
import { Button, EmptyState, ErrorState, FormError, ListSkeleton, Segmented } from '../../components/ui';
import { residentPath } from '../../config';
import { NOTICE_TYPES } from '../../data/constants';
import { useResidentData } from '../../data/context';
import type { Notice } from '../../data/types';
import type { CommunityQuery } from '../../live/api';

/** Notices read at a time. The server caps a page at 50; 20 fits a phone screen or two without a wall of cards. */
const PAGE = 20;
/** How long typing waits for a pause before the server is asked. */
const TYPING_PAUSE_MS = 350;

type Species = 'all' | 'dog' | 'cat' | 'other';
const SPECIES: { value: Species; label: string }[] = [
  { value: 'all', label: 'All' }, { value: 'dog', label: 'Dogs' }, { value: 'cat', label: 'Cats' }, { value: 'other', label: 'Other' },
];
const speciesOf = (v: string | null): Species => (v === 'dog' || v === 'cat' || v === 'other' ? v : 'all');

const pageQuery = (kind: CommunityQuery['alert_type'], q: string, species: Species, offset: number): CommunityQuery =>
  ({ alert_type: kind, q: q || undefined, species: species === 'all' ? undefined : species, limit: PAGE, offset });

/** What one search read. It carries the search it answers, so an answer to an older search (or none yet) is simply "still loading". */
interface Loaded { key: string; items: Notice[]; total: number; error?: string }

/**
 * The directory of one kind of notice: every lost pet, or every found animal, searched and filtered by the server and read a page at a time
 * (so a subdivision with many notices never loads or draws them all at once). Newest first, always: the order is the server's, so "Show more"
 * continues the same list. The search words and the animal filter live in the address (and replace each other, so Back leaves the directory
 * instead of stepping through every word typed).
 */
export default function NoticeDirectoryPage({ kind }: { kind: 'lost_pet' | 'found_animal' }) {
  const { loadCommunityPage } = useResidentData();
  const [params, setParams] = useSearchParams();
  const q = (params.get('q') ?? '').trim();
  const species = speciesOf(params.get('species'));
  const [typed, setTyped] = useState({ query: q, text: q });
  // Back/Forward can change the query without remounting this page. Never write an old input over that URL.
  const text = typed.query === q ? typed.text : q;
  const setText = (value: string) => setTyped({ query: q, text: value });
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [moreState, setMoreState] = useState<{ key: string; status: 'loading' | 'error' } | null>(null);
  const load = useRef(loadCommunityPage);
  useEffect(() => { load.current = loadCommunityPage; });      // the provider's function changes with its state; a search must not restart because of that

  const lost = kind === 'lost_pet';
  const plural = NOTICE_TYPES[kind].plural;
  const other = lost ? { to: '/community/found', label: 'found animals' } : { to: '/community/lost', label: 'lost pets' };
  const filtered = q !== '' || species !== 'all';

  // Which search the screen is showing; a "Try again" is a new one.
  const key = `${kind}|${q}|${species}|${attempt}`;
  const current = loaded?.key === key ? loaded : null;
  const phase: 'loading' | 'ready' | 'error' = current === null ? 'loading' : current.error !== undefined ? 'error' : 'ready';
  const items = current?.items ?? [];
  const total = current?.total ?? 0;
  const more = moreState?.key === key ? moreState.status : 'idle';

  useEffect(() => {
    let live = true;                                           // a search that was replaced before it answered is dropped
    load.current(pageQuery(kind, q, species, 0)).then(
      (first) => { if (live) setLoaded({ key, items: first.notices, total: first.total }); },
      (err: unknown) => { if (live) setLoaded({ key, items: [], total: 0, error: errorMessage(err) }); },
    );
    return () => { live = false; };
  }, [key, kind, q, species]);

  // What is typed becomes the search a moment after the typing pauses.
  useEffect(() => {
    if (text.trim() === q) return undefined;
    const timer = setTimeout(() => setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (text.trim()) next.set('q', text.trim()); else next.delete('q');
      return next;
    }, { replace: true }), TYPING_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [text, q, setParams]);

  const pickSpecies = (value: Species) => setParams((prev) => {
    const next = new URLSearchParams(prev);
    if (value === 'all') next.delete('species'); else next.set('species', value);
    return next;
  }, { replace: true });

  const clear = () => { setText(''); setParams({}, { replace: true }); };

  const showMore = async () => {
    const asked = key;
    setMoreState({ key: asked, status: 'loading' });
    try {
      const next = await load.current(pageQuery(kind, q, species, items.length));
      setLoaded((prev) => {
        if (!prev || prev.key !== asked) return prev;           // the search changed meanwhile: this page belongs to an older one
        const have = new Set(prev.items.map((n) => n.id));
        return { ...prev, items: [...prev.items, ...next.notices.filter((n) => !have.has(n.id))], total: next.total };
      });
      setMoreState((prev) => (prev?.key === asked ? null : prev));
    } catch {
      setMoreState((prev) => (prev?.key === asked ? { key: asked, status: 'error' } : prev));
    }
  };

  return (
    <Screen title={plural} back="/community" subtitle={phase === 'ready' ? `${total} ${total === 1 ? 'notice' : 'notices'}${filtered ? ' match' : ''}` : undefined}>
      <div className="rs-stack-sm">
        <SearchInput value={text} onChange={(e) => setText(e.target.value)} placeholder={lost ? 'Search by name, breed, colour or place' : 'Search by breed, colour or place'} aria-label={`Search ${plural.toLowerCase()}`} enterKeyHint="search" maxLength={60} />
        <Segmented<Species> label="Animal" value={species} onChange={pickSpecies} options={SPECIES} />
      </div>

      {phase === 'loading' ? <ListSkeleton rows={4} /> : null}
      {phase === 'error' ? <ErrorState onRetry={() => setAttempt((n) => n + 1)}>{current?.error}</ErrorState> : null}

      {phase === 'ready' && items.length > 0 ? (
        <>
          <ul className="rs-stack-sm rs-plain" aria-label={`${plural}, newest first`}>
            {items.map((n) => <li key={n.id}><NoticeCard notice={n} /></li>)}
          </ul>
          {items.length < total ? (
            <div className="rs-stack-sm">
              <p className="rs-meta rs-center" aria-live="polite">Showing {items.length} of {total}</p>
              {more === 'error' ? <FormError message="More notices could not be loaded. Check your connection and try again." /> : null}
              <Button block loading={more === 'loading'} onClick={() => void showMore()}>{more === 'error' ? 'Try again' : 'Show more'}</Button>
            </div>
          ) : null}
        </>
      ) : null}

      {phase === 'ready' && items.length === 0 ? (
        filtered ? (
          <EmptyState icon={SearchX} title="No notices match" action={<Button onClick={clear}>Clear search</Button>}>
            Try a different word or animal. You can also look at the <Link to={residentPath(`${other.to}${q ? `?q=${encodeURIComponent(q)}` : ''}`)}>{other.label}</Link>.
          </EmptyState>
        ) : (
          <EmptyState icon={lost ? PawPrint : Megaphone} title={`No ${plural.toLowerCase()} right now`}>
            {lost ? 'When a neighbour reports a pet missing, the notice appears here.' : 'Animals the subdivision has taken in and published appear here.'}
          </EmptyState>
        )
      ) : null}

      {phase === 'ready' && q && items.length > 0 ? (
        <p className="rs-hint">Looking for something else? Try the <Link to={residentPath(`${other.to}?q=${encodeURIComponent(q)}`)}>{other.label}</Link>.</p>
      ) : null}
    </Screen>
  );
}
