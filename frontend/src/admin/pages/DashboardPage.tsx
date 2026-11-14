import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarClock, CircleCheck, Clock3, Handshake, Landmark, PawPrint } from 'lucide-react';
import { adminPath } from '../config';
import { LinkButton } from '../components/Button';
import { EmptyState, Panel } from '../components/layout';
import { MatchCard } from '../components/MatchParts';
import { CATEGORIES } from '../data/constants';
import { useAdminData } from '../data/context';
import { attentionItems, dashboardCounts, isLostOrFound, isOpen, matchesToReview, mediationOf, pendingFollowUps, recentActivity, type ReasonKind } from '../data/selectors';
import { MatchCompareDialog } from '../dialogs/MatchDialogs';
import { addDays, fmtTime, fmtWeekday, greeting, plural, relative, sameDay } from '../../preview/lib/format';
import { usePageTitle } from '../lib/hooks';
import { useNow } from '../../preview/lib/hooks';
import { cx } from '../../preview/lib/cx';

/** What each reason looks like in the attention list: a request for help and the Barangay are not clocks. */
const REASON_ICON: Partial<Record<ReasonKind, typeof Clock3>> = { mediation: Handshake, barangay: Landmark };

const listSentence = (parts: string[]) => (parts.length <= 1 ? parts[0] ?? '' : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`);

/** A04 — Dashboard. Answers one question: what needs my attention today? */
export default function DashboardPage() {
  usePageTitle('Dashboard');
  const { state } = useAdminData();
  const now = useNow();
  const [reviewing, setReviewing] = useState<string | null>(null);

  const counts = dashboardCounts(state.cases, now);
  // Possible matches between a missing-pet and a found-animal report: found by the system, decided only by a Leader
  const toReview = matchesToReview(state.matches);
  const attention = attentionItems(state.cases, now);
  const horizon = addDays(now, 7);
  const upcoming = pendingFollowUps(state.cases).filter((x) => { const t = new Date(x.followUp.dueAt!); return t >= now && t <= horizon; }).slice(0, 7);
  const recent = recentActivity(state.cases, 7);

  // Missing pets and found animals are listed on their own: each is visible, none is a task by itself (they are monitored from the start; a missing
  // pet's notice is published when the report is filed)
  const watched = state.cases.filter((c) => isOpen(c) && isLostOrFound(c)).sort((x, y) => y.reportedAt.localeCompare(x.reportedAt));

  const parts: string[] = [];
  if (toReview.length) parts.push(`${plural(toReview.length, 'possible match', 'possible matches')} between a missing pet and a found animal ${toReview.length === 1 ? 'is' : 'are'} waiting for you to confirm`);
  if (counts.mediation) parts.push(`${plural(counts.mediation, 'owner and neighbour')} ${counts.mediation === 1 ? 'is' : 'are'} waiting for your help to get in touch`);
  if (counts.urgent) parts.push(`${plural(counts.urgent, 'urgent case')} ${counts.urgent === 1 ? 'is' : 'are'} open`);
  if (counts.newReports) parts.push(`${plural(counts.newReports, 'new report')} ${counts.newReports === 1 ? 'is' : 'are'} waiting for review`);
  if (counts.followUpsDue) parts.push(`${plural(counts.followUpsDue, 'follow-up')} ${counts.followUpsDue === 1 ? 'is' : 'are'} due today or overdue`);
  const sentence = parts.length ? `${listSentence(parts)}.` : 'Nothing needs your attention right now. New reports and reminders will show up here.';

  const days: { label: string; items: typeof upcoming }[] = [];
  for (const item of upcoming) {
    const d = new Date(item.followUp.dueAt!);
    const label = sameDay(d, now) ? 'Today' : sameDay(d, addDays(now, 1)) ? 'Tomorrow' : fmtWeekday(d);
    const bucket = days.find((x) => x.label === label);
    if (bucket) bucket.items.push(item); else days.push({ label, items: [item] });
  }

  const link = (id: string) => adminPath(`/cases/${id}`);

  return (
    <div className="flex flex-col gap-7">
      <header>
        <p className="sa-greet__date">{fmtWeekday(now)} · {state.settings.subdivision.name}</p>
        <h1 className="sa-h1 mt-1">{greeting(now)}, {state.admin.name.split(' ')[0]}</h1>
        <p className="sa-greet__line">{sentence}</p>
      </header>

      <div className="sa-stats" role="list" aria-label="Summary">
        <Link role="listitem" className="sa-stat" to={`${adminPath('/cases')}?status=reported`}><span className="sa-stat__value sa-num">{counts.newReports}</span><span className="sa-stat__label">New reports</span></Link>
        <Link role="listitem" className="sa-stat" to={`${adminPath('/cases')}?status=open`}><span className="sa-stat__value sa-num">{counts.active}</span><span className="sa-stat__label">Active cases</span></Link>
        <Link role="listitem" className={cx('sa-stat', counts.urgent > 0 && 'sa-stat--alert')} to={`${adminPath('/cases')}?status=open&priority=urgent`}><span className="sa-stat__value sa-num">{counts.urgent}</span><span className="sa-stat__label">Urgent cases</span></Link>
        <a role="listitem" className="sa-stat" href="#attention"><span className="sa-stat__value sa-num">{counts.followUpsDue}</span><span className="sa-stat__label">Follow-ups due</span></a>
      </div>

      {toReview.length > 0 ? (
        <section aria-labelledby="matches-h" id="matches" className="scroll-mt-6">
          <h2 id="matches-h" className="sa-h2 mb-3">Possible matches to review ({toReview.length})</h2>
          <Panel className="overflow-hidden">
            <ul className="m-0 list-none p-0">{toReview.slice(0, 5).map((m) => <MatchCard key={m.id} m={m} now={now} onReview={setReviewing} />)}</ul>
            {toReview.length > 5 ? <div className="sa-pager"><span>{toReview.length - 5} more after these</span></div> : null}
          </Panel>
        </section>
      ) : null}

      <div className="sa-grid">
        <section aria-labelledby="attention-h" id="attention" className="scroll-mt-6">
          <h2 id="attention-h" className="sa-h2 mb-3">Needs your attention</h2>
          <Panel>
            {attention.length === 0 ? (
              <EmptyState icon={CircleCheck} title="You’re all caught up">No urgent cases, new reports or overdue follow-ups. Take a moment to check on active cases from the Cases page.</EmptyState>
            ) : (
              <ul className="sa-attn">
                {attention.slice(0, 8).map(({ case: c, reasons }) => {
                  const tone = reasons.find((r) => r.tone === 'red') ? 'red' : reasons.find((r) => r.tone === 'amber') ? 'amber' : 'neutral';
                  return (
                    <li key={c.id} className="sa-attn__item">
                      <span className="sa-attn__bar" data-tone={tone} aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5"><span className="sa-ref">{c.id}</span><span className="sa-meta">{CATEGORIES[c.category].label}</span></p>
                        <p className="sa-rowtitle mt-0.5"><Link to={link(c.id)}>{c.title}</Link></p>
                        {reasons.slice(0, 2).map((r) => { const Icon = REASON_ICON[r.kind] ?? Clock3; return <p key={r.kind} className="sa-reason" data-tone={r.tone}><Icon size={13} className="shrink-0" aria-hidden="true" />{r.label}</p>; })}
                      </div>
                      <LinkButton size="sm" to={link(c.id)} aria-label={`Review ${c.id}`}>Review<ArrowRight size={14} aria-hidden="true" /></LinkButton>
                    </li>
                  );
                })}
              </ul>
            )}
            {attention.length > 8 ? (
              <div className="sa-pager"><span>{attention.length - 8} more need attention</span><Link to={`${adminPath('/cases')}?status=open&sort=priority`} className="font-semibold">View in Cases</Link></div>
            ) : null}
          </Panel>
        </section>

        <div className="sa-stack">
          <section aria-labelledby="missing-h">
            <h2 id="missing-h" className="sa-h2 mb-3">Missing and found animals{watched.length > 0 ? ` (${watched.length})` : ''}</h2>
            <Panel className="overflow-hidden">
              {watched.length === 0 ? (
                <EmptyState icon={PawPrint} title="No missing or found animals" compact>When a resident reports a missing pet or a found animal it is listed here and monitored from the start. Nothing needs your approval.</EmptyState>
              ) : (
                <ul className="sa-feed">
                  {watched.slice(0, 5).map((c) => (
                    <li key={c.id}>
                      <span className="sa-feed__dot" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="font-medium"><Link to={link(c.id)}>{c.title}</Link></p>
                        <p className="sa-meta mt-0.5"><span className="sa-ref">{c.id}</span> · {c.category === 'found_animal' ? 'found' : 'missing'} · reported {relative(c.reportedAt, now)}{mediationOf(c).length > 0 ? ' · asking for your help' : ''}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {watched.length > 5 ? <div className="sa-pager"><span>{watched.length - 5} more</span><Link to={`${adminPath('/cases')}?status=open`} className="font-semibold">View in Cases</Link></div> : null}
            </Panel>
          </section>

          <section aria-labelledby="upcoming-h">
            <h2 id="upcoming-h" className="sa-h2 mb-3">Upcoming follow-ups</h2>
            <Panel className="overflow-hidden">
              {days.length === 0 ? (
                <EmptyState icon={CalendarClock} title="Nothing scheduled" compact>No follow-ups are due in the next 7 days.</EmptyState>
              ) : days.map((day) => (
                <div key={day.label}>
                  <p className="sa-day">{day.label}</p>
                  <ul className="sa-feed">
                    {day.items.map(({ case: c, followUp: f }) => (
                      <li key={f.id}>
                        <span className="sa-feed__dot" aria-hidden="true" />
                        <div className="min-w-0">
                          <p className="font-medium">{f.title}</p>
                          <p className="sa-meta mt-0.5"><Link to={link(c.id)} className="sa-ref">{c.id}</Link> · {fmtTime(f.dueAt!)}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </Panel>
          </section>

          <section aria-labelledby="recent-h">
            <h2 id="recent-h" className="sa-h2 mb-3">Recent activity</h2>
            <Panel className="overflow-hidden">
              <ul className="sa-feed">
                {recent.map(({ case: c, event: e }) => (
                  <li key={e.id}>
                    <span className="sa-feed__dot" aria-hidden="true" />
                    <div className="min-w-0">
                      <p>{e.title}</p>
                      <p className="sa-meta mt-0.5"><Link to={link(c.id)} className="sa-ref">{c.id}</Link> · {e.actor} · {relative(e.at, now)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          </section>
        </div>
      </div>

      {reviewing ? <MatchCompareDialog matchId={reviewing} onClose={() => setReviewing(null)} /> : null}
    </div>
  );
}
