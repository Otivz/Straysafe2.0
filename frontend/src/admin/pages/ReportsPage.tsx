import { useSearchParams } from 'react-router-dom';
import { ChartNoAxesColumn } from 'lucide-react';
import { ChartCard, BarList, DataTable, LineChart, SegmentedBar, type SegPart } from '../components/charts';
import { Field, Input, Segmented } from '../components/form';
import { Callout, EmptyState, ErrorState, PageHeader, PageSkeleton, Panel } from '../components/layout';
import { OUTCOME_GROUPS, REFERRAL_STATUS } from '../data/constants';
import type { DateRange } from '../data/selectors';
import { addDays, fmtDate, plural, startOfDay } from '../../preview/lib/format';
import { usePageTitle } from '../lib/hooks';
import { useAnalytics } from '../lib/useAnalytics';
import { useNow } from '../../preview/lib/hooks';

type Preset = '30' | '90' | 'ytd' | 'custom';
const PRESETS: { value: Preset; label: string }[] = [{ value: '30', label: 'Last 30 days' }, { value: '90', label: 'Last 90 days' }, { value: 'ytd', label: 'Year to date' }, { value: 'custom', label: 'Custom range' }];
const OUTCOME_COLOR: Record<'resolved' | 'unresolved' | 'invalid', Pick<SegPart, 'color' | 'ink'>> = {
  resolved: { color: 'var(--sa-chart-resolved)', ink: 'light' },
  unresolved: { color: 'var(--sa-chart-unresolved)', ink: 'dark' },
  invalid: { color: 'var(--sa-chart-neutral)', ink: 'light' },
};

const parseDay = (v: string | null): Date | null => { if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null; const d = new Date(`${v}T00:00:00`); return Number.isNaN(d.getTime()) ? null : d; };
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Only compare with the earlier period when it actually has data; otherwise the difference means nothing. */
function delta(now: number, before: number, hasEarlier: boolean, period: string): string {
  if (!hasEarlier) return 'No earlier period to compare';
  const d = now - before;
  return d === 0 ? `No change vs ${period}` : `${d > 0 ? '+' : '−'}${Math.abs(d)} vs ${period}`;
}

/** A20 — Reports & analytics. A few operational insights, not an analytics platform. */
export default function ReportsPage() {
  usePageTitle('Analytics');
  const now = useNow();
  const [params, setParams] = useSearchParams();

  const today = startOfDay(now);
  const preset: Preset = (['30', '90', 'ytd', 'custom'] as string[]).includes(params.get('range') ?? '') ? (params.get('range') as Preset) : '90';
  const customFrom = parseDay(params.get('from'));
  const customTo = parseDay(params.get('to'));

  let from = addDays(today, preset === '30' ? -29 : -89);
  let to = addDays(today, 1);
  let rangeError: string | undefined;
  if (preset === 'ytd') from = new Date(today.getFullYear(), 0, 1);
  if (preset === 'custom') {
    from = customFrom ?? addDays(today, -29);
    to = addDays(customTo ?? today, 1);
    if (customFrom && customTo && customFrom > customTo) rangeError = 'The start date is after the end date.';
  }
  const range: DateRange = rangeError ? { from: addDays(today, -29), to: addDays(today, 1) } : { from, to };
  const lengthMs = range.to.getTime() - range.from.getTime();
  const previous: DateRange = { from: new Date(range.from.getTime() - lengthMs), to: range.from };
  const days = Math.round(lengthMs / 86_400_000);

  const result = useAnalytics(range, previous);
  const { data, before } = result;
  const period = `previous ${days} days`;
  const hasEarlier = before.received > 0 || before.closed > 0;

  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) { if (!v) next.delete(k); else next.set(k, v); }
    if (patch.range && patch.range !== 'custom') { next.delete('from'); next.delete('to'); }
    if (patch.range === '90') next.delete('range');
    setParams(next, { replace: true });
  };

  const weekly = data.weekly;
  const labels = weekly.map((w) => w.label);
  const parts: SegPart[] = data.outcomes.map((o) => ({ id: o.group, label: `${OUTCOME_GROUPS[o.group].label}`, value: o.count, ...OUTCOME_COLOR[o.group] }));

  return (
    <div>
      <PageHeader title="Analytics" description="What is being reported, how cases end, and how often outside help is needed. Based on the cases in your subdivision." />

      <div className="mb-5 flex flex-wrap items-end gap-4">
        <Segmented label="Date range" value={preset} onChange={(v) => set({ range: v, ...(v === 'custom' ? { from: ymd(range.from), to: ymd(addDays(range.to, -1)) } : {}) })} options={PRESETS} />
        {preset === 'custom' ? (
          <>
            <Field label="From" error={rangeError}><Input type="date" className="sa-input--sm" value={params.get('from') ?? ymd(range.from)} max={ymd(today)} onChange={(e) => set({ from: e.target.value })} /></Field>
            <Field label="To"><Input type="date" className="sa-input--sm" value={params.get('to') ?? ymd(addDays(range.to, -1))} max={ymd(today)} onChange={(e) => set({ to: e.target.value })} /></Field>
          </>
        ) : null}
        <p className="sa-small sa-text-3 sm:ml-auto">{fmtDate(range.from.toISOString())} – {fmtDate(addDays(range.to, -1).toISOString())}</p>
      </div>

      {result.status === 'loading' ? <PageSkeleton />
        : result.status === 'error' ? <ErrorState message={result.error} onRetry={result.retry} />
          : data.received === 0 && data.closed === 0 ? (
            <Panel><EmptyState icon={ChartNoAxesColumn} title="No activity in this period">Try a longer date range. Reports and closed cases that fall inside the range are counted here.</EmptyState></Panel>
          ) : (
        <div className="flex flex-col gap-6">
          <div className="sa-stats" role="list" aria-label="Summary for the selected period">
            <div role="listitem" className="sa-stat"><span className="sa-stat__value sa-num">{data.received}</span><span className="sa-stat__label">Reports received</span><span className="sa-meta">{delta(data.received, before.received, hasEarlier, period)}</span></div>
            <div role="listitem" className="sa-stat"><span className="sa-stat__value sa-num">{data.closed}</span><span className="sa-stat__label">Cases closed</span><span className="sa-meta">{delta(data.closed, before.closed, hasEarlier, period)}</span></div>
            <div role="listitem" className="sa-stat"><span className="sa-stat__value sa-num">{data.resolvedShare === null ? '—' : `${Math.round(data.resolvedShare * 100)}%`}</span><span className="sa-stat__label">Closed as resolved</span><span className="sa-meta">Closed does not always mean resolved</span></div>
            <div role="listitem" className="sa-stat"><span className="sa-stat__value sa-num">{data.medianDays === null ? '—' : data.medianDays < 10 ? data.medianDays.toFixed(1) : Math.round(data.medianDays)}</span><span className="sa-stat__label">Median days to close</span><span className="sa-meta">From report to closure</span></div>
          </div>

          <ChartCard
            title="Reports received and cases closed"
            description="Per week. Reports are counted by when they were submitted, closures by when the case was closed."
            table={<DataTable caption="Weekly reports received and cases closed" head={['Week of', 'Reports received', 'Cases closed']} rows={weekly.map((w) => [w.label, w.received, w.closed])} />}
          >
            <LineChart
              labels={labels}
              ariaLabel={`Line chart of weekly reports received and cases closed. ${plural(data.received, 'report')} received and ${plural(data.closed, 'case')} closed in total. Use the table view for each week.`}
              series={[
                { id: 'received', label: 'Reports received', color: 'var(--sa-chart-1)', values: weekly.map((w) => w.received), area: true },
                { id: 'closed', label: 'Cases closed', color: 'var(--sa-chart-2)', values: weekly.map((w) => w.closed) },
              ]}
            />
          </ChartCard>

          <div className="grid items-start gap-6 lg:grid-cols-2">
            <ChartCard
              title="Most reported categories"
              description="Reports received in the period."
              table={<DataTable caption="Reports received by category" head={['Category', 'Reports']} rows={data.categories.map((c) => [c.label, c.count])} />}
            >
              <BarList unit="reports" rows={data.categories.map((c) => ({ id: c.id, label: c.label, value: c.count }))} />
            </ChartCard>

            <ChartCard
              title="How cases ended"
              description="Cases closed in the period, by documented outcome."
              table={<DataTable caption="Closed cases by disposition" head={['Outcome', 'Disposition', 'Cases']} rows={data.outcomes.flatMap((o) => o.items.filter((i) => i.count > 0).map((i) => [OUTCOME_GROUPS[o.group].label, i.label, i.count]))} />}
            >
              <div>
                <SegmentedBar parts={parts} ariaLabel="Cases closed by outcome" />
                {data.closed > 0 ? (
                  <ul className="m-0 mt-5 flex list-none flex-col gap-1.5 p-0">
                    {data.outcomes.flatMap((o) => o.items.filter((i) => i.count > 0).map((i) => (
                      <li key={i.id} className="flex items-baseline justify-between gap-4 sa-small"><span className="sa-text-2">{i.label}</span><strong className="sa-num">{i.count}</strong></li>
                    )))}
                  </ul>
                ) : null}
              </div>
            </ChartCard>
          </div>

          <ChartCard
            title="External referral activity"
            description={`${plural(data.referrals.total, 'referral')} to outside organizations. A completed referral does not close the case.`}
            table={<DataTable caption="Referrals by organization" head={['Organization', 'Referrals']} rows={data.referrals.byOrg.map((o) => [o.name, o.count])} />}
          >
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
              <BarList unit="referrals" rows={data.referrals.byOrg.map((o) => ({ id: o.id, label: o.name, value: o.count }))} emptyText="No referrals were made in this period." />
              <div>
                <p className="sa-label mb-2">Where they stand now</p>
                {data.referrals.byStatus.length === 0 ? <p className="sa-small sa-text-2">No referrals in this period.</p> : (
                  <ul className="m-0 flex list-none flex-col gap-2 p-0">
                    {data.referrals.byStatus.map((s) => <li key={s.status} className="flex items-baseline justify-between gap-4 sa-small"><span className="sa-text-2">{REFERRAL_STATUS[s.status].label}</span><strong className="sa-num">{s.count}</strong></li>)}
                  </ul>
                )}
              </div>
            </div>
          </ChartCard>

          <Callout>These figures come from the cases you manage. They describe workload and outcomes. They are not a measure of anyone’s performance, and a closed case is not always a resolved one.</Callout>
        </div>
      )}
    </div>
  );
}
