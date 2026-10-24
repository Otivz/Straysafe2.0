import { useId, useState } from 'react';
import { BarChart3, LineChart, Table2 } from 'lucide-react';
import { count, dateLabel } from './analytics';
import type { AnalyticsData, TimelinePoint } from './analytics';

const series = [
    { key: 'total', label: 'Incidents', color: '#059669' },
    { key: 'resolved', label: 'Resolved now', color: '#2563eb' },
    { key: 'high_risk', label: 'High risk', color: '#e11d48' },
] as const;
type SeriesKey = typeof series[number]['key'];
const colors = ['#059669', '#2563eb', '#d97706', '#e11d48', '#7c3aed', '#0891b2', '#64748b'];

export function IncidentChart({ points, grouping }: { points: TimelinePoint[]; grouping: string }) {
    const titleId = useId();
    const [mode, setMode] = useState<'line' | 'bar'>('line');
    const [visible, setVisible] = useState<SeriesKey[]>(['total', 'resolved', 'high_risk']);
    const [index, setIndex] = useState<number | null>(null);
    const [showTable, setShowTable] = useState(false);
    const activeSeries = series.filter(item => visible.includes(item.key));
    const selected = points[Math.min(index ?? points.length - 1, points.length - 1)];
    const max = Math.max(1, ...points.flatMap(point => activeSeries.map(item => point[item.key])));
    const top = Math.max(4, Math.ceil(max / 4) * 4);
    const width = Math.max(640, points.length * 24);
    const plotWidth = width - 80;
    const x = (i: number) => points.length === 1 ? 50 + plotWidth / 2 : 50 + i * plotWidth / (points.length - 1);
    const y = (n: number) => 235 - n / top * 205;
    const ticks = Math.max(1, Math.ceil(points.length / 8));
    const hasReports = points.some(point => point.total > 0);
    const periodLabel = (date: string) => `${grouping === 'week' ? 'Week of ' : ''}${dateLabel(date, grouping === 'month')}`;

    return <section className="analytics-card" aria-labelledby={titleId}>
        <div className="flex flex-wrap items-start justify-between gap-4">
            <div><p className="analytics-eyebrow">INCIDENT TRENDS</p><h2 id={titleId} className="analytics-title">See how reporting changes over time</h2>
                <p className="analytics-description">{grouping === 'day' ? 'Daily' : grouping === 'week' ? 'Weekly (Monday start)' : 'Monthly'} totals, including periods with no reports. Resolved counts reflect the current outcome of incidents filed in each period.</p></div>
            <div className="flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-zinc-800 print:hidden" aria-label="Chart display">
                <button type="button" aria-pressed={mode === 'line'} onClick={() => setMode('line')} className={`analytics-chart-toggle ${mode === 'line' ? 'bg-white shadow-sm dark:bg-zinc-700' : ''}`}><LineChart size={15} />Line</button>
                <button type="button" aria-pressed={mode === 'bar'} onClick={() => setMode('bar')} className={`analytics-chart-toggle ${mode === 'bar' ? 'bg-white shadow-sm dark:bg-zinc-700' : ''}`}><BarChart3 size={15} />Bars</button>
            </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2" aria-label="Visible chart series">
            {series.map(item => <button key={item.key} type="button" aria-pressed={visible.includes(item.key)} onClick={() => setVisible(current => current.includes(item.key) ? current.length > 1 ? current.filter(key => key !== item.key) : current : [...current, item.key])}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${visible.includes(item.key) ? 'border-slate-200 text-slate-800 dark:border-zinc-600 dark:text-zinc-100' : 'border-transparent text-slate-400 line-through'}`}>
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />{item.label}
            </button>)}
        </div>
        {!hasReports ? <div className="analytics-empty my-6"><BarChart3 size={28} className="mx-auto mb-3 text-slate-400" /><p className="font-semibold">No incidents match these filters</p><p className="mt-1 text-sm">Try a wider date range or clear a category, status or area filter.</p></div> : <>
            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl bg-slate-50 px-4 py-3 text-xs dark:bg-zinc-800/70" aria-live="polite" aria-atomic="true">
                <strong className="text-slate-700 dark:text-zinc-200">{selected && periodLabel(selected.date)}</strong>
                {selected && series.map(item => <span key={item.key}>{item.label}: <strong className="text-slate-900 dark:text-white">{count(selected[item.key])}</strong></span>)}
            </div>
            <div className="mt-3 overflow-x-auto pb-2" aria-label="Scrollable incident chart">
                <svg viewBox={`0 0 ${width} 285`} width={width} height={285} className="min-w-full text-slate-400 outline-emerald-500" role="img" aria-label="Incident trend chart. Use Left and Right arrow keys to inspect periods." tabIndex={0}
                    onKeyDown={event => {
                        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                        event.preventDefault();
                        setIndex(current => event.key === 'Home' ? 0 : event.key === 'End' ? points.length - 1 : Math.max(0, Math.min(points.length - 1, (current ?? points.length - 1) + (event.key === 'ArrowLeft' ? -1 : 1))));
                    }}>
                    <title>Incidents filed, currently resolved incidents, and high-risk incidents by {grouping}</title>
                    {[0, 1, 2, 3, 4].map(tick => <g key={tick}><line x1={50} x2={width - 30} y1={y(top / 4 * tick)} y2={y(top / 4 * tick)} stroke="currentColor" opacity={0.18} strokeDasharray="4 4" /><text x={39} y={y(top / 4 * tick) + 4} textAnchor="end" fontSize={11} fill="currentColor">{count(top / 4 * tick)}</text></g>)}
                    {mode === 'line' && activeSeries.map(item => <polyline key={item.key} points={points.map((point, i) => `${x(i)},${y(point[item.key])}`).join(' ')} fill="none" stroke={item.color} strokeWidth={2.5} strokeLinejoin="round" strokeDasharray={item.key === 'resolved' ? '6 4' : undefined} />)}
                    {points.map((point, i) => <g key={point.date} onPointerEnter={() => setIndex(i)} onClick={() => setIndex(i)}>
                        <title>{periodLabel(point.date)}: {point.total} incidents, {point.resolved} resolved, {point.high_risk} high risk</title>
                        {activeSeries.map((item, s) => mode === 'line'
                            ? <circle key={item.key} cx={x(i)} cy={y(point[item.key])} r={selected?.date === point.date ? 4.5 : points.length < 70 ? 2.5 : 0} fill={item.color} stroke="white" strokeWidth={1} />
                            : <rect key={item.key} x={x(i) + (s - (activeSeries.length - 1) / 2) * 6 - 2.5} y={y(point[item.key])} width={5} height={235 - y(point[item.key])} fill={item.color} rx={1} />)}
                        <rect x={x(i) - Math.min(20, plotWidth / Math.max(points.length, 1) / 2)} y={25} width={Math.min(40, plotWidth / Math.max(points.length, 1))} height={213} fill="transparent" className="cursor-crosshair" />
                        {(i % ticks === 0 || i === points.length - 1) && <text x={x(i)} y={258} textAnchor="middle" fontSize={11} fill="currentColor">{dateLabel(point.date, grouping === 'month')}</text>}
                    </g>)}
                    <text x={50} y={280} fontSize={10} fill="currentColor">{points.length > 20 ? 'Scroll horizontally to inspect all periods. ' : ''}Counts of incidents · Asia/Manila</text>
                </svg>
            </div>
        </>}
        <button type="button" onClick={() => setShowTable(v => !v)} aria-expanded={showTable} className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-400 print:hidden"><Table2 size={14} />{showTable ? 'Hide chart data' : 'View chart data'}</button>
        <div className={`mt-4 max-h-72 overflow-auto ${showTable ? '' : 'hidden print:block'}`}>
            <table className="analytics-table"><caption className="sr-only">Incident timeline data</caption><thead><tr><th>Period</th><th>Incidents</th><th>Resolved now</th><th>High risk</th></tr></thead><tbody>
                {points.map(point => <tr key={point.date}><td>{periodLabel(point.date)}</td><td>{count(point.total)}</td><td>{count(point.resolved)}</td><td>{count(point.high_risk)}</td></tr>)}
            </tbody></table>
        </div>
    </section>;
}

export function CategoryChart({ rows, onSelect, selected }: { rows: AnalyticsData['category_breakdown']; onSelect: (name: string) => void; selected: string }) {
    const total = rows.reduce((sum, row) => sum + row.count, 0);
    const gradient = rows.reduce<{ end: number; stops: string[] }>((acc, row, i) => {
        const end = acc.end + (total ? row.count / total * 100 : 0);
        return { end, stops: [...acc.stops, `${colors[i % colors.length]} ${acc.end}% ${end}%`] };
    }, { end: 0, stops: [] }).stops.join(', ');
    return <section className="analytics-card"><p className="analytics-eyebrow">INCIDENT MIX</p><h2 className="analytics-title">Reports by category</h2><p className="analytics-description">Select a category to filter the dashboard.</p>
        {!total ? <div className="analytics-empty mt-6">No category data for this selection.</div> : <div className="mt-6 flex flex-col items-center gap-6 sm:flex-row">
            <div className="relative h-40 w-40 shrink-0 rounded-full" role="img" aria-label={`Category distribution: ${rows.map(r => `${r.category}, ${r.count}`).join('; ')}`} style={{ background: `conic-gradient(${gradient})` }}>
                <div className="absolute inset-5 flex flex-col items-center justify-center rounded-full bg-white dark:bg-zinc-900"><strong className="text-2xl tabular-nums">{count(total)}</strong><span className="text-xs text-slate-500">incidents</span></div>
            </div>
            <div className="w-full space-y-2">{rows.map((row, i) => <button key={row.category} type="button" onClick={() => onSelect(row.category)} aria-pressed={selected === row.category} className="flex w-full items-center gap-3 rounded-lg p-2 text-left text-sm hover:bg-slate-50 focus-visible:outline-emerald-500 dark:hover:bg-zinc-800">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colors[i % colors.length] }} /><span className="flex-1">{row.category}</span><strong className="tabular-nums">{count(row.count)}</strong><span className="w-12 text-right text-xs text-slate-500">{row.percentage}%</span>
            </button>)}</div>
        </div>}
    </section>;
}

export function Distribution({ title, description, values, onSelect }: { title: string; description?: string; values: Record<string, number>; onSelect?: (value: string) => void }) {
    const total = Object.values(values).reduce((sum, value) => sum + value, 0);
    return <section className="analytics-card"><h2 className="analytics-title">{title}</h2>{description && <p className="analytics-description">{description}</p>}
        <div className="mt-5 space-y-4">{Object.entries(values).map(([label, value], i) => <div key={label}>
            <div className="mb-1.5 flex justify-between gap-3 text-xs"><button type="button" disabled={!onSelect || label === 'Unspecified'} onClick={() => onSelect?.(label)} className={onSelect ? 'text-left font-semibold underline-offset-4 enabled:hover:underline' : 'text-left font-medium'}>{label}</button><span className="tabular-nums">{count(value)} <span className="text-slate-400">{total ? `· ${Math.round(value / total * 100)}%` : ''}</span></span></div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-zinc-800"><div className="h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${total ? value / total * 100 : 0}%`, backgroundColor: colors[i % colors.length] }} /></div>
        </div>)}</div>
    </section>;
}
