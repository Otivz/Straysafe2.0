import { lazy, Suspense, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CircleCheck,
  Clock3,
  FilePlus2,
  FolderOpen,
  Handshake,
  Landmark,
  MapPin,
  PawPrint,
  Share2,
  type LucideIcon,
} from 'lucide-react';
import { adminPath } from '../config';
import { Badge, CaseStatusBadge } from '../components/Badge';
import { LinkButton } from '../components/Button';
import { ANIMAL_ICON } from '../components/icons';
import { EmptyState } from '../components/layout';
import { MatchCard } from '../components/MatchParts';
import { CATEGORIES } from '../data/constants';
import { useAdminData } from '../data/context';
import { attentionItems, dashboardCounts, dueReferralItems, isLostOrFound, isOpen, matchesToReview, mediationOf, pendingFollowUps, recentActivity, type ReasonKind } from '../data/selectors';
import { MatchCompareDialog } from '../dialogs/MatchDialogs';
import { addDays, dueInfo, fmtTime, fmtWeekday, greeting, plural, relative, sameDay } from '../../preview/lib/format';
import { usePageTitle } from '../lib/hooks';
import { useNow } from '../../preview/lib/hooks';

const CasesMap = lazy(() => import('../components/CasesMap'));

/** What each reason looks like in the attention list: a request for help and the Barangay are not clocks. */
const REASON_ICON: Partial<Record<ReasonKind, typeof Clock3>> = { mediation: Handshake, barangay: Landmark };

const listSentence = (parts: string[]) => (parts.length <= 1 ? parts[0] ?? '' : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`);

type Tone = 'red' | 'amber' | 'neutral';

/** A section heading with an icon, an optional count and an optional link. */
function SectionHead({ id, icon: Icon, title, count, link }: { id: string; icon: LucideIcon; title: string; count?: number; link?: { to: string; label: string } }) {
  return (
    <div className="sa-sec__head">
      <h2 id={id} className="sa-sec__title">
        <Icon size={17} aria-hidden="true" />
        <span>{title}</span>
        {count ? <span className="sa-sec__count" aria-label={`${count} items`}>{count}</span> : null}
      </h2>
      {link ? <Link to={link.to} className="sa-sec__link">{link.label}</Link> : null}
    </div>
  );
}

/** A04 — Dashboard. Answers one question: what needs my attention today? */
export default function DashboardPage() {
  usePageTitle('Dashboard');
  const { state } = useAdminData();
  const navigate = useNavigate();
  const now = useNow();
  const [reviewing, setReviewing] = useState<string | null>(null);

  const counts = dashboardCounts(state.cases, now);
  // Possible matches between a missing-pet and a found-animal report: found by the system, decided only by a Leader
  const toReview = matchesToReview(state.matches);
  const attention = attentionItems(state.cases, now);
  const dueReferrals = dueReferralItems(state.cases, now);
  const dueFollowUps = pendingFollowUps(state.cases).filter((x) => {
    const d = dueInfo(x.followUp.dueAt, now);
    return d.overdue || d.today;
  });
  const totalDueNow = counts.followUpsDue + counts.referralsDue;
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
  if (counts.referralsDue) parts.push(`${plural(counts.referralsDue, 'referral follow-up')} ${counts.referralsDue === 1 ? 'is' : 'are'} due today or overdue`);
  const sentence = parts.length ? `${listSentence(parts)}.` : 'Nothing needs your attention right now. New reports and reminders will show up here.';

  const days: { label: string; items: typeof upcoming }[] = [];
  for (const item of upcoming) {
    const d = new Date(item.followUp.dueAt!);
    const label = sameDay(d, now) ? 'Today' : sameDay(d, addDays(now, 1)) ? 'Tomorrow' : fmtWeekday(d);
    const bucket = days.find((x) => x.label === label);
    if (bucket) bucket.items.push(item); else days.push({ label, items: [item] });
  }

  const link = (id: string) => adminPath(`/cases/${id}`);
  const casesPath = adminPath('/cases');

  const kpis: { label: string; value: number; hint: string; icon: LucideIcon; tone: 'brand' | 'red' | 'neutral'; alert: boolean; to?: string; href?: string }[] = [
    { label: 'New reports', value: counts.newReports, hint: 'Awaiting review', to: `${casesPath}?status=reported`, icon: FilePlus2, tone: 'brand', alert: false },
    { label: 'Active cases', value: counts.active, hint: 'Open in the subdivision', to: `${casesPath}?status=open`, icon: FolderOpen, tone: 'neutral', alert: false },
    { label: 'Urgent cases', value: counts.urgent, hint: counts.urgent > 0 ? 'Needs immediate action' : 'No urgent cases', to: `${casesPath}?status=open&priority=urgent`,
      icon: AlertTriangle, tone: counts.urgent > 0 ? 'red' : 'neutral', alert: counts.urgent > 0 },
    { label: 'Due or overdue', value: totalDueNow, hint: counts.overdueTotal > 0 ? `${counts.overdueTotal} overdue` : 'Follow-ups and referrals', href: '#due-reminders',
      icon: CalendarClock, tone: counts.overdueTotal > 0 ? 'red' : 'neutral', alert: counts.overdueTotal > 0 },
  ];

  const dueCount = dueReferrals.length + dueFollowUps.length;

  const activeCases = state.cases.filter((c) => isOpen(c));

  return (
    <div className="sa-dash">
      <style>{`
        @keyframes saFadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .sa-fade-up {
          animation: saFadeUp 280ms cubic-bezier(0.16, 1, 0.3, 1) both;
        }
      `}</style>
      {/* Header: where and when, the one-sentence summary, the two most useful actions */}
      <header className="sa-fade-up flex flex-col gap-3 border-b border-[#e7e2da] pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="sa-dash-head__eyebrow"><span>{fmtWeekday(now)}</span><span>{state.settings.subdivision.name}</span></p>
          <h1 className="sa-dash-head__title">{greeting(now)}, {state.admin.name.split(' ')[0]}</h1>
          <p className="sa-dash-head__line">{sentence}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {counts.urgent > 0 ? (
            <LinkButton size="sm" variant="primary" to={`${casesPath}?status=open&priority=urgent`}>Review urgent ({counts.urgent})</LinkButton>
          ) : null}
          <LinkButton size="sm" variant="secondary" to={casesPath}>All cases <ArrowRight size={13} aria-hidden="true" /></LinkButton>
        </div>
      </header>

      {/* Key figures, each a shortcut to the matching list */}
      <ul className="sa-kpis sa-fade-up [animation-delay:50ms]" aria-label="Summary">
        {kpis.map((k) => {
          const Icon = k.icon;
          const inner = (
            <>
              <span className="sa-kpi__top">
                <span className="sa-kpi__label">{k.label}</span>
                <span className="sa-kpi__icon" data-tone={k.tone}><Icon size={16} aria-hidden="true" /></span>
              </span>
              <span className="sa-kpi__value">{k.value}</span>
              <span className="sa-kpi__hint">{k.hint}</span>
            </>
          );
          return (
            <li key={k.label}>
              {k.to
                ? <Link className="sa-kpi transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm" data-alert={k.alert} to={k.to}>{inner}</Link>
                : <a className="sa-kpi transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm" data-alert={k.alert} href={k.href}>{inner}</a>}
            </li>
          );
        })}
      </ul>

      {dueCount > 0 ? (
        <section aria-labelledby="due-h" id="due-reminders" className="sa-sec">
          <SectionHead id="due-h" icon={CalendarClock} title="Overdue and due today" count={dueCount} />
          <div className="sa-sec__card">
            <ul className="sa-due">
              {dueReferrals.slice(0, 6).map(({ case: c, referral: r, overdue, label }) => (
                <li key={`ref-${r.id}`} className="sa-ccard" data-tone={overdue ? 'red' : 'amber'}>
                  <div className="min-w-0">
                    <div className="sa-ccard__meta">
                      <span className="sa-due__kind"><Share2 size={11} aria-hidden="true" />Referral</span>
                      <Badge tone={overdue ? 'red' : 'amber'}>{label}</Badge>
                    </div>
                    <p className="sa-ccard__title sa-clamp-1">{r.orgName} ({r.referenceNo})</p>
                    <p className="sa-ccard__note"><span className="sa-ref">{c.id}</span> · {c.title}</p>
                  </div>
                  <LinkButton size="sm" variant="secondary" to={`${link(c.id)}?tab=referrals`}>Open</LinkButton>
                </li>
              ))}
              {dueFollowUps.slice(0, 6).map(({ case: c, followUp: f }) => {
                const d = dueInfo(f.dueAt, now);
                return (
                  <li key={`fu-${f.id}`} className="sa-ccard" data-tone={d.overdue ? 'red' : 'amber'}>
                    <div className="min-w-0">
                      <div className="sa-ccard__meta">
                        <span className="sa-due__kind"><CalendarClock size={11} aria-hidden="true" />Follow-up</span>
                        <Badge tone={d.overdue ? 'red' : 'amber'}>{d.label}</Badge>
                      </div>
                      <p className="sa-ccard__title sa-clamp-1">{f.title}</p>
                      <p className="sa-ccard__note"><span className="sa-ref">{c.id}</span> · {c.title}</p>
                    </div>
                    <LinkButton size="sm" variant="secondary" to={`${link(c.id)}?tab=actions`}>Open</LinkButton>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      ) : null}

      {toReview.length > 0 ? (
        <section aria-labelledby="matches-h" id="matches" className="sa-sec">
          <SectionHead id="matches-h" icon={PawPrint} title="Possible matches to review" count={toReview.length} />
          <div className="sa-sec__card">
            <ul className="m-0 list-none p-0">{toReview.slice(0, 5).map((m) => <MatchCard key={m.id} m={m} now={now} onReview={setReviewing} />)}</ul>
            {toReview.length > 5 ? <div className="sa-sec__foot"><span>{toReview.length - 5} more after these</span></div> : null}
          </div>
        </section>
      ) : null}

      <div className="sa-dash-cols sa-fade-up items-start [animation-delay:110ms]">
        <div className="flex min-w-0 flex-col gap-6">
          <section aria-labelledby="attention-h" id="attention" className="sa-sec">
            <SectionHead id="attention-h" icon={AlertTriangle} title="Needs your attention" count={attention.length}
              link={attention.length > 0 ? { to: `${casesPath}?status=open&sort=priority`, label: 'View in Cases' } : undefined} />
            <div className="sa-sec__card">
              {attention.length === 0 ? (
                <EmptyState icon={CircleCheck} title="You’re all caught up">No urgent cases, new reports or overdue follow-ups. Take a moment to check on active cases from the Cases page.</EmptyState>
              ) : (
                <ul className="sa-ccards">
                  {attention.slice(0, 8).map(({ case: c, reasons }) => {
                    const tone: Tone = c.priority === 'urgent' || reasons.some((r) => r.tone === 'red') ? 'red' : reasons.some((r) => r.tone === 'amber') ? 'amber' : 'neutral';
                    return (
                      <li key={c.id} className="sa-ccard" data-tone={tone}>
                        <div className="min-w-0">
                          <div className="sa-ccard__meta">
                            <span className="sa-id">{c.id}</span>
                            {c.priority === 'urgent' ? <Badge tone="red" dot>Urgent</Badge> : c.priority === 'high' ? <Badge tone="amber" dot>High</Badge> : null}
                            <span>{CATEGORIES[c.category].label}</span>
                            <span aria-hidden="true">·</span>
                            <span>{relative(c.reportedAt, now)}</span>
                          </div>
                          <p className="sa-ccard__title"><Link to={link(c.id)}>{c.title}</Link></p>
                          {(c.category === 'injured' || c.category === 'safety') && c.animal.condition ? (
                            <p className="sa-ccard__note">{c.animal.condition.replace(/\n+/g, ' · ')}</p>
                          ) : null}
                          <div className="sa-ccard__reasons">
                            {reasons.slice(0, 2).map((r) => {
                              const Icon = REASON_ICON[r.kind] ?? Clock3;
                              return (
                                <span key={r.kind} className="sa-reason" data-tone={r.tone}>
                                  <Icon size={12} className="shrink-0" aria-hidden="true" />
                                  <span>{r.label}</span>
                                </span>
                              );
                            })}
                          </div>
                        </div>
                        <LinkButton size="sm" variant="secondary" to={link(c.id)} aria-label={`Review ${c.id}`}>Review<ArrowRight size={13} aria-hidden="true" /></LinkButton>
                      </li>
                    );
                  })}
                </ul>
              )}
              {attention.length > 8 ? (
                <div className="sa-sec__foot"><span>{attention.length - 8} more need attention</span><Link to={`${casesPath}?status=open&sort=priority`} className="sa-sec__link">View in Cases</Link></div>
              ) : null}
            </div>
          </section>

          <section aria-labelledby="map-h" className="sa-sec">
            <SectionHead id="map-h" icon={MapPin} title="Active cases map" count={activeCases.length}
              link={{ to: `${casesPath}?view=map`, label: 'Open full map' }} />
            <Suspense fallback={<div className="pv-map pv-map--loading" style={{ height: 320 }} role="status" aria-label="Loading map" />}>
              <CasesMap cases={activeCases} onSelect={(id) => navigate(link(id))} height={320} />
            </Suspense>
          </section>
        </div>

        <div className="sa-dash-side">
          <section aria-labelledby="missing-h" className="sa-sec">
            <SectionHead id="missing-h" icon={PawPrint} title="Missing and found animals" count={watched.length}
              link={watched.length > 0 ? { to: `${casesPath}?status=open`, label: 'View all' } : undefined} />
            <div className="sa-sec__card">
              {watched.length === 0 ? (
                <EmptyState icon={PawPrint} title="No missing or found animals" compact>When a resident reports a missing pet or a found animal it is listed here and monitored from the start. Nothing needs your approval.</EmptyState>
              ) : (
                <ul className="sa-mf">
                  {watched.slice(0, 5).map((c) => {
                    const thumbUrl = c.evidence.find((e) => e.kind === 'photo' && e.url)?.url || c.registeredPet?.current?.photos?.[0] || null;
                    const AnimalIcon = ANIMAL_ICON[c.animal.type] ?? PawPrint;
                    const isFound = c.category === 'found_animal';
                    const helpAsked = mediationOf(c).length > 0;
                    return (
                      <li key={c.id}>
                        <Link to={link(c.id)} className="sa-mf__row" aria-label={`${isFound ? 'Found' : 'Missing'}: ${c.title} (${c.id})`}>
                          <span className="sa-mf__thumb">
                            {thumbUrl ? <img src={thumbUrl} alt="" loading="lazy" /> : <AnimalIcon size={20} aria-hidden="true" />}
                          </span>
                          <span className="min-w-0">
                            <span className="sa-mf__badges">
                              <span className="sa-id">{c.id}</span>
                              <Badge tone={isFound ? 'brand' : 'amber'}>{isFound ? 'Found' : 'Missing'}</Badge>
                              <CaseStatusBadge c={c} />
                            </span>
                            <span className="sa-mf__title" style={{ display: 'block' }}>{c.title}</span>
                            <span className="sa-mf__meta" style={{ display: 'block' }}>
                              Reported {relative(c.reportedAt, now)}{helpAsked ? ' · Asking for your help' : ''}
                            </span>
                          </span>
                          <ArrowRight size={15} className="sa-mf__go" aria-hidden="true" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
              {watched.length > 5 ? <div className="sa-sec__foot"><span>{watched.length - 5} more</span><Link to={`${casesPath}?status=open`} className="sa-sec__link">View in Cases</Link></div> : null}
            </div>
          </section>

          <section aria-labelledby="upcoming-h" className="sa-sec">
            <SectionHead id="upcoming-h" icon={CalendarClock} title="Upcoming follow-ups" count={upcoming.length} />
            <div className="sa-sec__card">
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
            </div>
          </section>

          <section aria-labelledby="recent-h" className="sa-sec">
            <SectionHead id="recent-h" icon={Activity} title="Recent activity" />
            <div className="sa-sec__card">
              {recent.length === 0 ? (
                <EmptyState icon={Activity} title="No activity yet" compact>Updates on cases appear here as they happen.</EmptyState>
              ) : (
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
              )}
            </div>
          </section>
        </div>
      </div>

      {reviewing ? <MatchCompareDialog matchId={reviewing} onClose={() => setReviewing(null)} /> : null}
    </div>
  );
}
