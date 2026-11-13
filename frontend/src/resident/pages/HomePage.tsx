import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, ClipboardList, Dog, MessageSquare, PawPrint, Pencil, Search, UserCheck, type LucideIcon } from 'lucide-react';
import { greeting, relative } from '../../preview/lib/format';
import { MissingPetCard, NoticeCard } from '../components/Cards';
import { PrimaryScreen } from '../components/Screen';
import { Callout, Button, EmptyState, LinkButton, Row, Section, StatusPill } from '../components/ui';
import { residentPath } from '../config';
import { CATEGORIES } from '../data/constants';
import { useResidentData } from '../data/context';
import { accepts } from '../data/entries';
import { conversationAttention, feed, latestAdvisory, noticeById, recentUpdates, reportablePets, unreadCount } from '../data/selectors';
import { registerForLostPath, useStartReport } from '../lib/flow';
import { useNow } from '../lib/hooks';
import { useSubdivisionName } from '../lib/useOffice';

interface Attention { id: string; icon: LucideIcon; title: string; meta: string; to: string }

/**
 * R07 — Home: the resident's own missing pet (once, at the top), what needs them (only things to act on), quick ways to report, their other
 * reports and the latest from neighbours. Reporting anything else is the + in the bottom bar.
 */
export default function HomePage() {
  const { state, refreshConversations } = useResidentData();
  useEffect(() => { void refreshConversations(); }, [refreshConversations]);
  const subdivision = useSubdivisionName();
  const start = useStartReport();
  const navigate = useNavigate();
  const now = useNow();
  const unread = unreadCount(state);
  const advisory = latestAdvisory(state);
  // Lost Pet is for a registered pet of this resident: with none, the shortcut leads to registering one first
  const noPets = reportablePets(state).length === 0;

  const attention: Attention[] = [];
  const conversations = conversationAttention(state);
  const needingAttention = new Set(conversations.map((c) => c.id));
  const recentConversations = (state.conversations ?? []).filter((c) => !needingAttention.has(c.id)).slice(0, 3);
  for (const c of state.claims) {
    if (c.status === 'needs_info') attention.push({ id: c.id, icon: UserCheck, title: 'More information requested', meta: 'About your ownership claim', to: `/claims/${c.id}` });
  }
  for (const o of state.ownershipRequests ?? []) {
    attention.push({ id: `pet-${o.id}`, icon: Dog, title: `Is ${o.petName} your pet?`, meta: 'Your subdivision office linked this pet to you', to: '/pets' });
  }
  // only a real message from a person (the case chat): the lines the system records (a notice went out, a sighting came in) are not messages
  for (const r of state.reports) {
    if (r.status !== 'closed' && r.updates[0]?.kind === 'message') attention.push({ id: r.id, icon: MessageSquare, title: 'Message from the subdivision', meta: `${r.id} · ${r.title}`, to: `/reports/${r.id}` });
  }

  // the resident's own missing pets are shown once, at the top; "still missing" is a state, not a task
  const missing = state.reports.filter((r) => r.kind === 'lost' && r.status !== 'closed').sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  const shownAbove = new Set(missing.map((r) => r.id));
  const updates = recentUpdates({ ...state, reports: state.reports.filter((r) => !shownAbove.has(r.id)) }, 3);
  const community = feed(state, 'all').filter((n) => n.id !== advisory?.id && !n.mine).slice(0, 2);
  const first = state.profile.name.split(' ')[0];

  return (
    <PrimaryScreen
      title={`${greeting(now)}, ${first}`}
      docTitle="Home"
      lead={subdivision}
      actions={(
        <Link to={residentPath('/notifications')} className="rs-iconbtn rs-bell" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} title="Notifications">
          <Bell size={21} strokeWidth={1.9} aria-hidden="true" />
          {unread > 0 ? <span className="rs-bell__count" aria-hidden="true">{unread}</span> : null}
        </Link>
      )}
    >
      {missing.length > 0 ? (
        <Section title={missing.length === 1 ? 'Your missing pet' : 'Your missing pets'}>
          <ul className="rs-stack-sm rs-plain" aria-label="Your missing pets">
            {missing.map((r) => <li key={r.id}><MissingPetCard report={r} notice={noticeById(state, r.noticeId ?? undefined)} now={now} /></li>)}
          </ul>
        </Section>
      ) : null}

      {advisory ? <NoticeCard notice={advisory} /> : null}

      {state.draft ? (
        <Callout tone="amber" title="You have an unfinished report.">
          <span>{CATEGORIES[state.draft.category].label}.</span>
          <span className="rs-row-actions rs-mt"><Button size="sm" variant="primary" icon={Pencil} onClick={() => navigate(residentPath('/report/details'))}>Continue</Button></span>
        </Callout>
      ) : null}

      <div className="rs-tiles" role="group" aria-label="Quick actions">
        {accepts(state.accepting, 'lost_pet') ? (noPets
          ? <Link to={registerForLostPath()} className="rs-tile rs-tile--muted"><Search size={22} aria-hidden="true" /><span>My pet is lost<span className="rs-tile__hint">Register your pet first</span></span></Link>
          : <button type="button" className="rs-tile" onClick={() => start('lost_pet')}><Search size={22} aria-hidden="true" /><span>My pet is lost</span></button>) : null}
        {accepts(state.accepting, 'found_animal') ? <button type="button" className="rs-tile" onClick={() => start('found_animal')}><PawPrint size={22} aria-hidden="true" /><span>I found an animal</span></button> : null}
        <Link to={residentPath('/pets')} className="rs-tile"><Dog size={22} aria-hidden="true" /><span>My pets</span></Link>
      </div>

      {conversations.length > 0 || attention.length > 0 ? (
        <Section title="Needs your attention">
          <div className="rs-list">
            {conversations.map((c) => <Row key={`conversation-${c.id}`} to={residentPath(`/conversations/${c.id}`)} icon={MessageSquare} title={c.title} meta={`${c.unread} unread · ${c.subtitle}`} />)}
            {attention.slice(0, 3).map((a) => <Row key={a.id} to={residentPath(a.to)} icon={a.icon} title={a.title} meta={a.meta} />)}
          </div>
        </Section>
      ) : null}

      {missing.length > 0 && updates.length === 0 ? null : (
      <Section title={missing.length > 0 ? 'Your other reports' : 'Your reports'} action={state.reports.length > 0 ? <Link to={residentPath('/reports')} className="rs-seeall">See all</Link> : undefined}>
        {updates.length === 0 ? (
          <EmptyState icon={ClipboardList} title="No reports yet" action={<LinkButton variant="primary" to={residentPath('/report')}>Report a concern</LinkButton>}>
            When you report something, you can follow every step here.
          </EmptyState>
        ) : (
          <div className="rs-list">
            {updates.map(({ report, update }) => (
              <Row
                key={report.id}
                to={residentPath(`/reports/${report.id}`)}
                title={report.title}
                meta={<><span>{update.title} · {relative(update.at, now)}</span><span><StatusPill status={report.status} /></span></>}
              />
            ))}
          </div>
        )}
      </Section>
      )}

      {recentConversations.length > 0 ? (
        <Section title="Recent conversations">
          <div className="rs-list">
            {recentConversations.map((c) => <Row key={c.id} to={residentPath(`/conversations/${c.id}`)} icon={MessageSquare} title={c.title} meta={`${c.status === 'closed' ? 'Conversation ended' : c.subtitle} · ${relative(c.lastAt, now)}`} />)}
          </div>
          <p className="rs-hint">You can also reopen conversations from the report they belong to.</p>
        </Section>
      ) : null}

      <Section title="In your community" action={<Link to={residentPath('/community')} className="rs-seeall">See all</Link>}>
        {community.length === 0 ? <p className="rs-sub">Nothing new from neighbours right now.</p> : community.map((n) => <NoticeCard key={n.id} notice={n} />)}
      </Section>
    </PrimaryScreen>
  );
}
