import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { api } from '../../utils/api';
import { getCachedData, setCachedData } from '../../utils/cache';

export type AnalyticsMode = 'admin' | 'subdivision';
export type TimelinePoint = { date: string; total: number; resolved: number; high_risk: number };
export type Benchmark = { subdivision_id: number; subdivision_name: string; total_reports: number; resolved_reports: number; active_reports: number; resolution_rate: number | null; registered_pets: number; warnings_count: number };
export interface AnalyticsData {
    metadata: { start_date: string; end_date: string; group_by: 'day' | 'week' | 'month'; timezone: string; generated_at: string; subdivision_id: number | null; filters: Record<string, string | number | null> };
    filter_options: { subdivisions: { id: number; name: string }[]; categories: { id: number; name: string }[] };
    comparison: { available: boolean; previous_total: number | null; report_change_percent: number | null; previous_start_date: string | null; previous_end_date: string | null };
    subdivision?: { id: number; name: string; barangay_name: string };
    kpis: { total_reports: number; resolved_reports: number; closed_reports: number; active_reports: number; resolution_rate: number | null; avg_verification_hours: number | null; verified_reports: number; total_pets: number; total_warnings: number; vaccination_rate: number | null };
    incident_timeline: TimelinePoint[];
    category_breakdown: { category: string; count: number; percentage: number }[];
    animal_distribution: Record<string, number>;
    priority_distribution: Record<string, number>;
    pet_compliance: { total_pets: number; vaccinated: number; unvaccinated: number; compliance_rate: number | null; bite_history_count: number };
    warnings_breakdown: { violation: string; count: number }[];
    holding_summary: { total_intake: number; returned_to_owner: number; currently_held: number; transferred_to_shelter: number };
    subdivisions_comparison?: Benchmark[];
    sla_metrics?: { avg_verification_hours: number | null; avg_rescue_hours: number | null; total_verified_cases: number; total_completed_rescues: number };
    holding_and_adoption?: { total_intake: number; currently_held: number; returned_to_owner: number; approved_adoptions: number; pending_adoptions: number; completed_handovers: number; total_adoptions: number; adoption_rate: number | null };
    ai_performance?: { total_matches_suggested: number; confirmed_matches: number; reviewed_matches: number; review_acceptance_rate: number | null; average_confidence_score: number | null };
    security_overview?: { total_users: number; active_users: number; suspended_users: number; audit_events_count: number };
}

export const periods = [
    ['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['180', 'Last 180 days'],
    ['ytd', 'Year to date'], ['all', 'All time'], ['custom', 'Custom dates'],
] as const;

export function manilaToday(): string {
    const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const part = (name: string) => parts.find(p => p.type === name)?.value;
    return `${part('year')}-${part('month')}-${part('day')}`;
}

export function readFilters(search: URLSearchParams) {
    const range = periods.some(([id]) => id === search.get('range')) ? search.get('range')! : '30';
    return {
        range, start: search.get('start') || '', end: search.get('end') || '',
        subdivision: search.get('subdivision') || '', category: search.get('category') || '',
        animal: search.get('animal') || '', priority: search.get('priority') || '', status: search.get('status') || 'all',
        interval: search.get('interval') || 'auto',
    };
}

export function requestParams(filters: ReturnType<typeof readFilters>, mode: AnalyticsMode) {
    const params: Record<string, string> = {};
    if (filters.range === 'custom') {
        params.start_date = filters.start;
        params.end_date = filters.end;
    } else if (filters.range === 'ytd') {
        const today = manilaToday();
        params.start_date = today.slice(0, 4) + '-01-01';
        params.end_date = today;
    } else if (filters.range !== 'all') params.days = filters.range;
    if (mode === 'admin' && filters.subdivision) params.subdivision_id = filters.subdivision;
    if (filters.category) params.category_id = filters.category;
    if (filters.animal) params.animal_type = filters.animal;
    if (filters.priority) params.priority = filters.priority;
    params.status = filters.status;
    params.group_by = filters.interval;
    return params;
}

export function useAnalytics(mode: AnalyticsMode, params: Record<string, string>) {
    const serialized = JSON.stringify(params);
    const key = `analytics_v2_${mode}_${serialized}`;
    const [revision, setRevision] = useState(0);
    const cached = useMemo(() => getCachedData<AnalyticsData>(key), [key]);
    const [state, setState] = useState<{ key: string; revision: number; data: AnalyticsData | null; error: string | null }>({ key: '', revision: -1, data: null, error: null });
    const [options, setOptions] = useState<AnalyticsData['filter_options']>({ subdivisions: [], categories: [] });
    useEffect(() => {
        const controller = new AbortController();
        let alive = true;
        const snapshot = getCachedData<AnalyticsData>(key);
        api.get<AnalyticsData>(`/analytics/${mode}`, { params: JSON.parse(serialized), signal: controller.signal })
            .then(response => {
                if (!alive) return;
                setCachedData(key, response.data, 3 * 60 * 1000);
                setOptions(response.data.filter_options);
                setState({ key, revision, data: response.data, error: null });
            })
            .catch((error: unknown) => {
                if (!alive || axios.isCancel(error)) return;
                const detail = axios.isAxiosError(error) ? error.response?.data?.detail : null;
                const message = typeof detail === 'string' ? detail : 'Analytics could not be loaded. Check your connection and try again.';
                setState({ key, revision, data: snapshot, error: message });
            });
        return () => { alive = false; controller.abort(); };
    }, [key, mode, serialized, revision]);
    // A response for a previous filter is never presented under the newly selected filter labels.
    const data = state.key === key ? state.data : cached;
    const pending = state.key !== key || state.revision !== revision;
    return { data, loading: pending && !data, refreshing: pending, error: !pending ? state.error : null, options: data?.filter_options || options, refresh: () => setRevision(r => r + 1) };
}

export const count = (value: number) => value.toLocaleString('en-PH');
export const rate = (value: number | null | undefined) => value == null ? 'N/A' : `${value.toLocaleString('en-PH', { maximumFractionDigits: 1 })}%`;
export const duration = (value: number | null | undefined) => value == null ? 'N/A' : value < 1 ? `${Math.round(value * 60)} min` : `${value.toLocaleString('en-PH', { maximumFractionDigits: 1 })} hrs`;
export function dateLabel(value: string, monthOnly = false) {
    return new Intl.DateTimeFormat('en-PH', { month: 'short', ...(monthOnly ? { year: 'numeric' as const } : { day: 'numeric' as const }) }).format(new Date(`${value.length === 7 ? value + '-01' : value}T12:00:00+08:00`));
}

export function exportAnalytics(data: AnalyticsData, scope: string) {
    const rows: (string | number | null)[][] = [
        ['Section', 'Metric / period', 'Value', 'Resolved', 'Active', 'High risk', 'Rate (%)'],
        ['Report', 'Scope', scope], ['Report', 'Date range', `${data.metadata.start_date} to ${data.metadata.end_date}`],
        ['Report', 'Time zone', data.metadata.timezone], ['Report', 'Interval', data.metadata.group_by],
        ['Report', 'Generated at', data.metadata.generated_at],
        ['Filters', 'subdivision_id', data.metadata.subdivision_id ?? 'All'],
    ];
    for (const [key, value] of Object.entries(data.metadata.filters ?? {})) rows.push(['Filters', key, value == null ? 'All' : String(value)]);
    for (const [key, value] of Object.entries(data.kpis)) rows.push(['Indicators', key.replaceAll('_', ' '), value]);
    for (const point of data.incident_timeline) rows.push(['Timeline', point.date, point.total, point.resolved, null, point.high_risk]);
    for (const item of data.category_breakdown) rows.push(['Categories', item.category, item.count, null, null, null, item.percentage]);
    for (const item of data.subdivisions_comparison ?? []) rows.push(['Subdivisions', item.subdivision_name, item.total_reports, item.resolved_reports, item.active_reports, null, item.resolution_rate]);
    for (const [key, value] of Object.entries(data.pet_compliance)) rows.push(['Current pet registry', key.replaceAll('_', ' '), value]);
    for (const item of data.warnings_breakdown) rows.push(['Owner warnings', item.violation, item.count]);
    for (const [key, value] of Object.entries(data.holding_and_adoption ?? data.holding_summary)) rows.push(['Holding / adoption cohort', key.replaceAll('_', ' '), value]);
    for (const [section, values] of [['Animal types', data.animal_distribution], ['Priority levels', data.priority_distribution], ['Response durations', data.sla_metrics], ['AI review outcomes', data.ai_performance], ['Current accounts and audit events', data.security_overview]] as const) {
        for (const [key, value] of Object.entries(values ?? {})) rows.push([section, key.replaceAll('_', ' '), value]);
    }
    const csv = rows.map(row => Array.from({ length: 7 }, (_, i) => {
        const cell = row[i];
        let text = cell == null ? '' : String(cell);
        if (typeof cell === 'string' && /^[\s]*[=+@-]/.test(text)) text = "'" + text;
        return `"${text.replaceAll('"', '""')}"`;
    }).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `StraySafe-analytics-${data.metadata.start_date}-${data.metadata.end_date}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function useBenchmarkRows(rows: Benchmark[], search: string, sort: string) {
    return useMemo(() => rows.filter(row => row.subdivision_name.toLowerCase().includes(search.trim().toLowerCase())).sort((a, b) => {
        if (sort === 'name') return a.subdivision_name.localeCompare(b.subdivision_name);
        if (sort === 'resolution') return (b.resolution_rate ?? -1) - (a.resolution_rate ?? -1) || b.total_reports - a.total_reports;
        return (sort === 'active' ? b.active_reports - a.active_reports : b.total_reports - a.total_reports) || a.subdivision_name.localeCompare(b.subdivision_name);
    }), [rows, search, sort]);
}
