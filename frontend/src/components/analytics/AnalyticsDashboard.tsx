import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Activity, ArrowDownUp, Building2, CheckCircle2, Clock3, Download, Filter, Menu, Printer, RefreshCw, RotateCcw, Search, ShieldAlert } from 'lucide-react';
import AdminSidebar from '../AdminSidebar';
import SubdSidebar from '../SubdSidebar';
import AdminNavbar from '../Navbars/AdminNavbar';
import SubdNavbar from '../Navbars/SubdNavbar';
import SubdBottomNav from '../Navbars/SubdBottomNav';
import { CategoryChart, Distribution, IncidentChart } from './AnalyticsCharts';
import { count, dateLabel, duration, exportAnalytics, manilaToday, periods, rate, readFilters, requestParams, useAnalytics, useBenchmarkRows } from './analytics';
import type { AnalyticsMode, Benchmark } from './analytics';
import './analytics.css';

function Stat({ label, value, detail, icon }: { label: string; value: string; detail: ReactNode; icon: ReactNode }) {
    return <div className="analytics-card !p-5"><div className="flex items-center justify-between gap-3"><h2 className="text-xs font-semibold text-slate-500 dark:text-zinc-400">{label}</h2><span className="rounded-lg bg-emerald-50 p-2 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">{icon}</span></div><p className="mt-3 text-3xl font-bold tracking-tight tabular-nums">{value}</p><div className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-zinc-400">{detail}</div></div>;
}

function BenchmarkTable({ rows, onSelect }: { rows: Benchmark[]; onSelect: (id: string) => void }) {
    const [search, setSearch] = useState('');
    const [sort, setSort] = useState('total');
    const filtered = useBenchmarkRows(rows, search, sort);
    const max = Math.max(1, ...rows.map(row => row.total_reports));
    return <section className="analytics-card">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="analytics-eyebrow">AREA COMPARISON</p><h2 className="analytics-title">Subdivision benchmarks</h2><p className="analytics-description">Compare the selected incident cohort. Select an area to inspect its analytics.</p></div>
            <div className="flex flex-wrap gap-2 print:hidden"><label className="relative"><span className="sr-only">Search subdivisions</span><Search size={14} className="absolute left-3 top-3 text-slate-400" /><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Find subdivision" className="analytics-input !pl-9" /></label>
                <label className="flex items-center gap-2"><ArrowDownUp size={14} /><span className="sr-only">Sort subdivisions</span><select value={sort} onChange={event => setSort(event.target.value)} className="analytics-input"><option value="total">Most incidents</option><option value="active">Most active cases</option><option value="resolution">Highest resolution rate</option><option value="name">Name A–Z</option></select></label></div>
        </div>
        <div className="mt-5 overflow-x-auto"><table className="analytics-table"><caption className="sr-only">Subdivision incident counts and current registry snapshots</caption><thead><tr><th>Subdivision</th><th className="min-w-36">Incident volume</th><th>Active</th><th>Resolved</th><th>Resolution</th><th>Current pets</th><th>Warnings</th><th className="print:hidden"><span className="sr-only">Inspect</span></th></tr></thead><tbody>
            {filtered.map(row => <tr key={row.subdivision_id}><td className="font-semibold">{row.subdivision_name}</td><td><div className="flex items-center gap-3"><span className="w-9 tabular-nums">{count(row.total_reports)}</span><div className="h-1.5 w-24 rounded-full bg-slate-100 dark:bg-zinc-800"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${row.total_reports / max * 100}%` }} /></div></div></td><td>{count(row.active_reports)}</td><td>{count(row.resolved_reports)}</td><td>{rate(row.resolution_rate)}</td><td>{count(row.registered_pets)}</td><td>{count(row.warnings_count)}</td><td className="print:hidden"><button onClick={() => onSelect(String(row.subdivision_id))} type="button" aria-label={`View ${row.subdivision_name} analytics`} className="font-semibold text-emerald-700 hover:underline dark:text-emerald-400">View</button></td></tr>)}
            {!filtered.length && <tr><td colSpan={8} className="!py-8 text-center text-slate-500">{search ? 'No subdivisions match your search.' : 'No subdivisions are available.'}</td></tr>}
        </tbody></table></div>
        <p className="mt-3 text-xs text-slate-500">Reports without an assigned subdivision remain in system totals. Pet counts are current registry snapshots.</p>
    </section>;
}

export default function AnalyticsDashboard({ mode }: { mode: AnalyticsMode }) {
    const admin = mode === 'admin';
    const [mobileOpen, setMobileOpen] = useState(false);
    const [search, setSearch] = useSearchParams();
    const filters = useMemo(() => readFilters(search), [search]);
    const params = useMemo(() => requestParams(filters, mode), [filters, mode]);
    const { data, loading, refreshing, error, options, refresh } = useAnalytics(mode, params);
    const [customEditing, setCustomEditing] = useState(false);
    const draftKey = `${filters.start}|${filters.end}`;
    const [draft, setDraft] = useState({ key: draftKey, start: filters.start, end: filters.end || manilaToday() });
    const draftStart = draft.key === draftKey ? draft.start : filters.start;
    const draftEnd = draft.key === draftKey ? draft.end : filters.end || manilaToday();
    const [dateError, setDateError] = useState('');
    const today = manilaToday();
    const title = admin ? 'Municipal analytics' : 'Community analytics';
    const selectedArea = options.subdivisions.find(option => String(option.id) === filters.subdivision);
    const scope = admin ? selectedArea?.name || (filters.subdivision ? 'Selected subdivision' : 'All subdivisions') : data?.subdivision?.name || 'Your subdivision';
    const filteredCount = [admin && filters.subdivision, filters.animal, filters.priority, filters.category, filters.status !== 'all'].filter(Boolean).length;
    const update = (key: string, value: string) => {
        setSearch(current => { const next = new URLSearchParams(current); if (value) next.set(key, value); else next.delete(key); return next; });
    };
    const changePeriod = (value: string) => {
        setDateError('');
        if (value === 'custom') { setCustomEditing(true); return; }
        setCustomEditing(false);
        setSearch(current => { const next = new URLSearchParams(current); next.set('range', value); next.delete('start'); next.delete('end'); return next; });
    };
    const applyDates = () => {
        if (!draftStart || !draftEnd) { setDateError('Choose both a start and an end date.'); return; }
        if (draftStart > draftEnd) { setDateError('Start date must be on or before end date.'); return; }
        if (draftEnd > today) { setDateError('End date cannot be in the future.'); return; }
        setDateError('');
        setCustomEditing(false);
        setSearch(current => { const next = new URLSearchParams(current); next.set('range', 'custom'); next.set('start', draftStart); next.set('end', draftEnd); return next; });
    };
    const reset = () => { setSearch({}); setCustomEditing(false); setDraft({ key: '|', start: '', end: today }); setDateError(''); };
    const selectedCategory = options.categories.find(option => String(option.id) === filters.category)?.name || '';
    const comparison = data?.comparison;
    const comparisonText = comparison?.available
        ? comparison.report_change_percent != null ? comparison.report_change_percent === 0 ? 'No change from the previous equal-length period' : `${Math.abs(comparison.report_change_percent)}% ${comparison.report_change_percent < 0 ? 'fewer' : 'more'} than the previous equal-length period`
            : comparison.previous_total === 0 ? `${data?.kpis.total_reports || 0} incidents; previous period had none` : 'Comparison unavailable'
        : 'Unique report submissions; merged sightings and animal child records excluded';
    const controls = <div className="flex min-w-0 items-center gap-3"><button type="button" onClick={() => setMobileOpen(value => !value)} aria-label="Open navigation" className="shrink-0 rounded-lg p-2 hover:bg-slate-100 md:hidden"><Menu size={20} /></button><div className="min-w-0"><h1 className="truncate">{title}</h1><p className="truncate">Incident trends and operational performance</p></div></div>;

    return <div className="analytics-page flex h-screen overflow-hidden bg-slate-50 font-sans text-slate-900 dark:bg-zinc-950 dark:text-zinc-100">
        <div className="contents print:hidden">{admin ? <AdminSidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} /> : <SubdSidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />}</div>
        <div className="analytics-content flex min-w-0 flex-1 flex-col overflow-y-auto">
            <div className="print:hidden">{admin ? <AdminNavbar leftContent={controls} /> : <SubdNavbar onMenuToggle={() => setMobileOpen(value => !value)} />}</div>
            <main className="mx-auto w-full max-w-[1480px] space-y-6 p-4 pb-28 sm:p-6 lg:p-8 print:p-0" aria-busy={refreshing}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div><div className="mb-2 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"><Building2 size={13} />{scope}</div>
                        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500 dark:text-zinc-400">Understand reporting trends, identify where attention is needed, and turn community data into clear decisions.</p></div>
                    <div className="flex flex-wrap gap-2 print:hidden"><button type="button" onClick={refresh} disabled={refreshing} className="analytics-button" aria-label="Refresh analytics"><RefreshCw size={15} className={refreshing ? 'animate-spin motion-reduce:animate-none' : ''} />Refresh</button>
                        <button type="button" disabled={!data || refreshing} onClick={() => data && exportAnalytics(data, scope)} className="analytics-button"><Download size={15} />Export CSV</button><button type="button" disabled={!data || refreshing} onClick={() => window.print()} className="analytics-button !border-emerald-700 !bg-emerald-700 !text-white"><Printer size={15} />Print / PDF</button></div>
                </div>

                <section className="analytics-card print:hidden" aria-label="Analytics filters">
                    <div className="mb-4 flex items-center justify-between gap-4"><h2 className="flex items-center gap-2 text-sm font-semibold"><Filter size={16} className="text-emerald-600" />Filter your view{filteredCount > 0 && <span className="rounded-full bg-emerald-50 px-2 text-xs text-emerald-800">{filteredCount}</span>}</h2><button type="button" onClick={reset} className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-emerald-700"><RotateCcw size={13} />Reset filters</button></div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-7">
                        <label className="analytics-label">Date range<select className="analytics-input" value={customEditing ? 'custom' : filters.range} onChange={event => changePeriod(event.target.value)}>{periods.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
                        {admin && <label className="analytics-label">Subdivision<select className="analytics-input" value={filters.subdivision} onChange={event => update('subdivision', event.target.value)}><option value="">All subdivisions</option>{options.subdivisions.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>}
                        <label className="analytics-label">Animal<select className="analytics-input" value={filters.animal} onChange={event => update('animal', event.target.value)}><option value="">All animals</option>{['Dog', 'Cat', 'Other'].map(value => <option key={value}>{value}</option>)}</select></label>
                        <label className="analytics-label">Priority<select className="analytics-input" value={filters.priority} onChange={event => update('priority', event.target.value)}><option value="">All priorities</option>{['Low', 'Medium', 'High'].map(value => <option key={value}>{value}</option>)}</select></label>
                        <label className="analytics-label">Case status<select className="analytics-input" value={filters.status} onChange={event => update('status', event.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="closed">Closed</option><option value="resolved">Successfully resolved</option></select></label>
                        <label className="analytics-label">Category<select className="analytics-input" value={filters.category} onChange={event => update('category', event.target.value)}><option value="">All categories</option>{options.categories.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
                        <label className="analytics-label">Chart interval<select className="analytics-input" value={filters.interval} onChange={event => update('interval', event.target.value)}><option value="auto">Automatic</option><option value="day">Daily</option><option value="week">Weekly</option><option value="month">Monthly</option></select></label>
                    </div>
                    {(customEditing || filters.range === 'custom') && <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4 dark:border-zinc-800">
                        <label className="analytics-label">Start date<input type="date" max={today} value={draftStart} onChange={event => setDraft({ key: draftKey, start: event.target.value, end: draftEnd })} className="analytics-input" /></label>
                        <label className="analytics-label">End date<input type="date" min={draftStart || undefined} max={today} value={draftEnd} onChange={event => setDraft({ key: draftKey, start: draftStart, end: event.target.value })} className="analytics-input" /></label><button type="button" onClick={applyDates} className="analytics-button !bg-emerald-700 !text-white">Apply dates</button>
                        <p className="w-full text-xs text-slate-500">Dates include both selected days and use Philippine time.</p>{dateError && <p role="alert" className="w-full text-sm text-rose-600">{dateError}</p>}
                    </div>}
                </section>

                {error && <div role="alert" className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"><ShieldAlert size={19} className="shrink-0" /><div><p className="font-semibold">{error}</p>{data && <p className="mt-1 text-xs">Showing saved results for these exact filters. Check the update time below.</p>}<button type="button" onClick={refresh} className="mt-2 font-semibold underline">Try again</button></div></div>}

                {loading ? <div role="status" aria-label="Loading analytics" className="space-y-6"><div className="grid grid-cols-2 gap-4 xl:grid-cols-4">{[0, 1, 2, 3].map(i => <div key={i} className="h-36 animate-pulse rounded-2xl bg-slate-200 motion-reduce:animate-none dark:bg-zinc-800" />)}</div><div className="h-96 animate-pulse rounded-2xl bg-slate-200 motion-reduce:animate-none dark:bg-zinc-800" /><span className="sr-only">Loading analytics</span></div> : data && <>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-zinc-400"><p><strong className="text-slate-700 dark:text-zinc-200">{scope}</strong> · {dateLabel(data.metadata.start_date)} {data.metadata.start_date.slice(0, 4)} – {dateLabel(data.metadata.end_date)} {data.metadata.end_date.slice(0, 4)} · {data.metadata.group_by === 'day' ? 'Daily' : data.metadata.group_by === 'week' ? 'Weekly' : 'Monthly'} · Philippine time</p><p>{refreshing ? 'Updating…' : 'Updated'} {new Date(data.metadata.generated_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p></div>
                    <p className="text-xs text-slate-500 dark:text-zinc-400">Applied filters: {data.metadata.filters.animal_type || 'All animals'} &middot; {data.metadata.filters.priority ? `${data.metadata.filters.priority} priority` : 'All priorities'} &middot; {data.metadata.filters.status === 'all' ? 'All statuses' : data.metadata.filters.status === 'resolved' ? 'Successfully resolved' : data.metadata.filters.status === 'closed' ? 'Closed' : 'Active'} &middot; {options.categories.find(option => option.id === data.metadata.filters.category_id)?.name || 'All categories'}</p>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        <Stat label="Incidents filed" value={count(data.kpis.total_reports)} detail={comparisonText} icon={<Activity size={17} />} />
                        <Stat label="Still active" value={count(data.kpis.active_reports)} detail={`${count(data.kpis.closed_reports)} closed from the selected reporting cohort`} icon={<ShieldAlert size={17} />} />
                        <Stat label="Successful resolution" value={rate(data.kpis.resolution_rate)} detail={`${count(data.kpis.resolved_reports)} claimed, released or resolved out of ${count(data.kpis.total_reports)} incidents`} icon={<CheckCircle2 size={17} />} />
                        {admin ? <Stat label="Average verification time" value={duration(data.kpis.avg_verification_hours)} detail={`${count(data.kpis.verified_reports)} valid report-to-verification samples`} icon={<Clock3 size={17} />} /> : <Stat label="Vaccination recorded" value={rate(data.pet_compliance.compliance_rate)} detail={`${count(data.pet_compliance.vaccinated)} of ${count(data.pet_compliance.total_pets)} current pets; area and animal filters only`} icon={<CheckCircle2 size={17} />} />}
                    </div>
                    {comparison?.available && <p className="text-xs text-slate-500">Incident count comparison: {comparison.previous_start_date} – {comparison.previous_end_date}. This compares reports filed, not the number of individual stray animals.</p>}

                    <IncidentChart key={`${data.metadata.start_date}-${data.metadata.end_date}-${data.metadata.group_by}`} points={data.incident_timeline} grouping={data.metadata.group_by} />
                    <div className="grid gap-6 xl:grid-cols-2"><CategoryChart rows={data.category_breakdown} selected={selectedCategory} onSelect={name => { const category = options.categories.find(option => option.name === name); if (category) update('category', String(category.id) === filters.category ? '' : String(category.id)); }} />
                        <div className="grid gap-6 sm:grid-cols-2"><Distribution title="Animal types" description="Select a type to filter." values={data.animal_distribution} onSelect={value => update('animal', filters.animal === value ? '' : value)} /><Distribution title="Priority levels" description="Select a priority to filter." values={data.priority_distribution} onSelect={value => update('priority', filters.priority === value ? '' : value)} /></div>
                    </div>
                    {admin && <BenchmarkTable rows={data.subdivisions_comparison || []} onSelect={id => update('subdivision', id)} />}

                    <div className="grid gap-6 lg:grid-cols-3">
                        <section className="analytics-card"><p className="analytics-eyebrow">RESPONSE DURATION</p><h2 className="analytics-title">From report to action</h2><dl className="analytics-metrics mt-5"><div><dt>Report → verified</dt><dd>{duration(data.kpis.avg_verification_hours)}</dd></div><div><dt>Valid verification samples</dt><dd>{count(data.kpis.verified_reports)}</dd></div>{admin && <><div><dt>Rescue started → completed</dt><dd>{duration(data.sla_metrics?.avg_rescue_hours)}</dd></div><div><dt>Completed rescue samples</dt><dd>{count(data.sla_metrics?.total_completed_rescues || 0)}</dd></div></>}</dl><p className="mt-4 text-xs leading-relaxed text-slate-500">N/A means no valid timing samples. These are measured durations, not compliance with a defined response-time target.</p></section>
                        <section className="analytics-card"><p className="analytics-eyebrow">HOLDING & OUTCOMES</p><h2 className="analytics-title">Intakes in this period</h2><dl className="analytics-metrics mt-5"><div><dt>Total intakes</dt><dd>{count(data.holding_summary.total_intake)}</dd></div><div><dt>Still held from those intakes</dt><dd>{count(data.holding_summary.currently_held)}</dd></div><div><dt>Returned to owner</dt><dd>{count(data.holding_summary.returned_to_owner)}</dd></div><div><dt>Transferred</dt><dd>{count(data.holding_summary.transferred_to_shelter)}</dd></div></dl><p className="mt-4 text-xs leading-relaxed text-slate-500">Includes treatment, healthy, for-adoption and impounded animals still in care. Counts follow intake dates and current outcomes.</p></section>
                        {admin ? <section className="analytics-card"><p className="analytics-eyebrow">ADOPTION APPLICATIONS</p><h2 className="analytics-title">Applications in this period</h2><dl className="analytics-metrics mt-5"><div><dt>Applications received</dt><dd>{count(data.holding_and_adoption?.total_adoptions || 0)}</dd></div><div><dt>Approved applications</dt><dd>{count(data.holding_and_adoption?.approved_adoptions || 0)}</dd></div><div><dt>Pending applications</dt><dd>{count(data.holding_and_adoption?.pending_adoptions || 0)}</dd></div><div><dt>Completed handovers</dt><dd>{count(data.holding_and_adoption?.completed_handovers || 0)}</dd></div></dl><p className="mt-4 text-xs text-slate-500">Approval rate: {rate(data.holding_and_adoption?.adoption_rate)}. Approval and physical handover are separate outcomes.</p></section>
                            : <Distribution title="Owner warnings" description="Warnings issued in this period, scoped to your subdivision." values={Object.fromEntries(data.warnings_breakdown.map(item => [item.violation, item.count]))} />}
                    </div>
                    {admin ? <div className="grid gap-6 lg:grid-cols-2"><section className="analytics-card"><p className="analytics-eyebrow">AI MATCH REVIEWS</p><h2 className="analytics-title">Review outcomes, not accuracy claims</h2><dl className="analytics-metrics mt-5"><div><dt>Suggestions created</dt><dd>{count(data.ai_performance?.total_matches_suggested || 0)}</dd></div><div><dt>Human-reviewed suggestions</dt><dd>{count(data.ai_performance?.reviewed_matches || 0)}</dd></div><div><dt>Confirmed suggestions</dt><dd>{count(data.ai_performance?.confirmed_matches || 0)}</dd></div><div><dt>Accepted among reviewed</dt><dd>{rate(data.ai_performance?.review_acceptance_rate)}</dd></div><div><dt>Mean confirmed-match similarity</dt><dd>{rate(data.ai_performance?.average_confidence_score)}</dd></div></dl><p className="mt-4 text-xs leading-relaxed text-slate-500">A similarity score is not measured AI accuracy, and a confirmed match is not a completed reunion.</p></section>
                        <section className="analytics-card"><p className="analytics-eyebrow">ACCOUNT SNAPSHOT</p><h2 className="analytics-title">Current registered accounts</h2><dl className="analytics-metrics mt-5"><div><dt>Registered users</dt><dd>{count(data.security_overview?.total_users || 0)}</dd></div><div><dt>Active accounts</dt><dd>{count(data.security_overview?.active_users || 0)}</dd></div><div><dt>Inactive or suspended</dt><dd>{count(data.security_overview?.suspended_users || 0)}</dd></div><div><dt>Audit events in this period</dt><dd>{count(data.security_overview?.audit_events_count || 0)}</dd></div></dl><p className="mt-4 text-xs leading-relaxed text-slate-500">Account counts use the area filter only and reflect current status. Audit events use the selected dates and account area.</p></section></div>
                        : <section className="analytics-card"><p className="analytics-eyebrow">CURRENT PET REGISTRY</p><h2 className="analytics-title">Vaccination records</h2><dl className="analytics-metrics mt-5"><div><dt>Unarchived registered pets</dt><dd>{count(data.pet_compliance.total_pets)}</dd></div><div><dt>Vaccination marked current</dt><dd>{count(data.pet_compliance.vaccinated)}</dd></div><div><dt>Unvaccinated or expired record</dt><dd>{count(data.pet_compliance.unvaccinated)}</dd></div><div><dt>Pets with recorded bite history</dt><dd>{count(data.pet_compliance.bite_history_count)}</dd></div></dl><p className="mt-4 text-xs leading-relaxed text-slate-500">Current registry; only area and animal filters apply. Based on the recorded vaccination flag and expiry when available. This does not certify vaccination or clinical protection.</p></section>}
                </>}
                <footer className="border-t border-slate-200 pt-4 text-xs leading-relaxed text-slate-400 dark:border-zinc-800">StraySafe · Analytics uses incident creation dates. Related operations use their own event dates; snapshot cards are labeled separately. All date boundaries use Asia/Manila.</footer>
            </main>
        </div>
        {!admin && <div className="contents print:hidden"><SubdBottomNav /></div>}
    </div>;
}
