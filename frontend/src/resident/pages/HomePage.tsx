import { Link, useNavigate } from 'react-router-dom';
import { Bell, ClipboardList, Dog, Footprints, MessageSquare, PawPrint, Pencil, Plus, Search, UserCheck, type LucideIcon } from 'lucide-react';
import { greeting, relative } from '../../preview/lib/format';
import { NoticeCard } from '../components/Cards';
import { PrimaryScreen } from '../components/Screen';
import { Callout, Button, EmptyState, LinkButton, Row, Section, StatusPill } from '../components/ui';
import { residentPath } from '../config';
import { CATEGORIES } from '../data/constants';
import { useResidentData } from '../data/context';
import { feed, latestAdvisory, recentUpdates, unreadCount } from '../data/selectors';
import { useStartReport } from '../lib/flow';
import { useNow } from '../lib/hooks';

interface Attention { id: string; icon: LucideIcon; title: string; meta: string; to: string }

/** R07 — Home: what needs attention, quick ways to report, and the latest from the community. */
export default function HomePage() {
  const { state } = useResidentData();
  const start = useStartReport();
  const navigate = useNavigate();
  const now = useNow();
  const unread = unreadCount(state);
  const advisory = latestAdvisory(state);

  const attention: Attention[] = [];
  for (const c of state.claims) {
    if (c.status === 'needs_info') attention.push({ id: c.id, icon: UserCheck, title: 'More information requested', meta: 'About your ownership claim', to: `/claims/${c.id}` });
  }
  for (const r of state.reports) {
    if (r.status !== 'closed' && r.updates[0]?.kind === 'message') attention.push({ id: r.id, icon: MessageSquare, title: 'Message from the subdivision', meta: `${r.id} · ${r.title}`, to: `/reports/${r.id}` });
  }
  for (const n of state.notices) {
    if (!n.mine || n.type !== 'lost_pet' || n.status !== 'active') continue;
    const name = state.reports.find((r) => r.noticeId === n.id)?.petName ?? 'Your pet';
    attention.push({ id: n.id, icon: Footprints, title: `${name} is still missing`, meta: `${n.sightings.length} ${n.sightings.length === 1 ? 'sighting' : 'sightings'} so far`, to: `/community/${n.id}/sightings` });
  }

  const updates = recentUpdates(state, 3);
  const community = feed(state, 'all').filter((n) => n.id !== advisory?.id).slice(0, 2);
  const first = state.profile.name.split(' ')[0];

  return (
    <PrimaryScreen
      title={`${greeting(now)}, ${first}`}
      docTitle="Home"
      lead="Selera Homes"
      actions={(
        <Link to={residentPath('/notifications')} className="rs-iconbtn rs-bell" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} title="Notifications">
          <Bell size={21} strokeWidth={1.9} aria-hidden="true" />
          {unread > 0 ? <span className="rs-bell__count" aria-hidden="true">{unread}</span> : null}
        </Link>
      )}
    >
      {advisory ? <NoticeCard notice={advisory} /> : null}

      {state.draft ? (
        <Callout tone="amber" title="You have an unfinished report.">
          <span>{CATEGORIES[state.draft.category].label}.</span>
          <span className="rs-row-actions rs-mt"><Button size="sm" variant="primary" icon={Pencil} onClick={() => navigate(residentPath('/report/details'))}>Continue</Button></span>
        </Callout>
      ) : null}

      <div className="rs-tiles" role="group" aria-label="Quick actions">
        <Link to={residentPath('/report')} className="rs-tile rs-tile--primary"><Plus size={22} aria-hidden="true" /><span>Report a concern</span></Link>
        <button type="button" className="rs-tile" onClick={() => start('lost_pet')}><Search size={22} aria-hidden="true" /><span>My pet is lost</span></button>
        <button type="button" className="rs-tile" onClick={() => start('found_animal')}><PawPrint size={22} aria-hidden="true" /><span>I found an animal</span></button>
        <Link to={residentPath('/pets')} className="rs-tile"><Dog size={22} aria-hidden="true" /><span>My pets</span></Link>
      </div>

      {attention.length > 0 ? (
        <Section title="Needs your attention">
          <div className="rs-list">
            {attention.slice(0, 3).map((a) => <Row key={a.id} to={residentPath(a.to)} icon={a.icon} title={a.title} meta={a.meta} />)}
          </div>
        </Section>
      ) : null}

      <Section title="Your reports" action={state.reports.length > 0 ? <Link to={residentPath('/reports')} className="rs-seeall">See all</Link> : undefined}>
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

      <Section title="In your community" action={<Link to={residentPath('/community')} className="rs-seeall">See all</Link>}>
        {community.length === 0 ? <p className="rs-sub">Nothing new from neighbours right now.</p> : community.map((n) => <NoticeCard key={n.id} notice={n} />)}
      </Section>
    </PrimaryScreen>
  );
}
