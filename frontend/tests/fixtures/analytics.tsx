import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { api } from '../../src/utils/api';
import { ThemeProvider } from '../../src/context/ThemeContext';
import { ToastProvider } from '../../src/context/ToastContext';
import AnalyticsDashboard from '../../src/components/analytics/AnalyticsDashboard';
import '../../src/index.css';

// Synthetic data only. ?mode=subdivision|admin  &fail (first request fails)  &empty
const params = new URLSearchParams(location.search);
const mode = (params.get('mode') || 'admin') as 'subdivision' | 'admin';
localStorage.clear(); sessionStorage.clear();
const role = mode === 'admin' ? 4 : 2;
localStorage.setItem('staff_user', JSON.stringify({ user_id: 9, name: 'Synthetic staff', role_id: role, barangay_id: 1, subdivision_id: 1, is_verified: true, status: 'Active',
    access_token: `test.${btoa(JSON.stringify({ user_id: 9, role_id: role, exp: 4102444800 }))}.test` }));
const empty = params.has('empty');
const n = (v: number) => (empty ? 0 : v);
const statuses = [['pending', 'Pending', 2], ['under_review', 'Under review', 1], ['verified', 'Verified', 1], ['endorsed', 'Endorsed to Barangay', 3],
    ['in_progress', 'Rescue / custody in progress', 2], ['resolved', 'Resolved', 4], ['rejected', 'Rejected / dismissed', 1], ['closed_other', 'Closed (deceased / not found)', 0]] as const;
const total = statuses.reduce((sum, [, , c]) => sum + n(c), 0);
const payload = () => ({
    metadata: { start_date: '2026-10-04', end_date: '2026-11-02', group_by: 'day', timezone: 'Asia/Manila', generated_at: new Date().toISOString(), subdivision_id: null,
        filters: { animal_type: null, priority: null, status: requestsLog.at(-1)?.status || 'all', category_id: null } },
    filter_options: { subdivisions: [{ id: 1, name: 'Selera Homes' }], categories: [{ id: 4, name: 'Roaming Animal' }] },
    comparison: { available: true, previous_total: 10, report_change_percent: 40, previous_start_date: '2026-09-04', previous_end_date: '2026-10-03' },
    subdivision: mode === 'subdivision' ? { id: 1, name: 'Selera Homes', barangay_name: 'San Vicente' } : undefined,
    kpis: { total_reports: total, resolved_reports: n(4), closed_reports: n(5), active_reports: total - n(5), resolution_rate: total ? 28.6 : null, avg_verification_hours: empty ? null : 2.5,
        verified_reports: n(6), total_pets: n(5), total_warnings: n(2), vaccination_rate: null, pending_reports: n(2), under_review_reports: n(1), verified_status_reports: n(1),
        endorsed_reports: n(3), in_progress_reports: n(2), rejected_reports: n(1), total_rescues: n(5), completed_rescues: n(2), total_adoptions: n(1), total_intake: n(3) },
    status_distribution: statuses.map(([key, label, c]) => ({ key, label, count: n(c) })),
    top_locations: empty ? [] : [{ location: 'Gate 1', count: 5 }, { location: 'Clubhouse', count: 2 }],
    observations: { active_now: n(2), resolved_in_period: n(1), other_endings_in_period: 0 },
    incident_timeline: [{ date: '2026-11-01', total, resolved: n(4), high_risk: n(1) }],
    category_breakdown: empty ? [] : [{ category: 'Roaming Animal', count: total, percentage: 100 }],
    animal_distribution: { Dog: n(10), Cat: n(4), Other: 0 }, priority_distribution: { Low: 0, Medium: n(14), High: 0, Unspecified: 0 },
    pet_compliance: { total_pets: n(5), vaccinated: n(3), unvaccinated: n(2), compliance_rate: empty ? null : 60, bite_history_count: 0 },
    warnings_breakdown: [], holding_summary: { total_intake: n(3), returned_to_owner: n(1), currently_held: n(2), transferred_to_shelter: 0 },
    ...(mode !== 'subdivision' ? {
        rescue_summary: { total: n(5), pending: n(1), active: n(2), completed: n(2), cancelled: 0, avg_report_to_start_hours: empty ? null : 1.5, response_samples: n(3) },
        custody_snapshot: { in_custody_now: n(4), available_for_adoption_now: n(1), returned_to_owner_total: n(2), adopted_total: n(1) },
        claims_summary: { submitted: n(3), approved_pending_handover: n(1), handed_over: n(1), rejected: n(1) },
        sla_metrics: { avg_verification_hours: 2.5, avg_rescue_hours: 1.0, total_verified_cases: n(6), total_completed_rescues: n(2) },
        holding_and_adoption: { total_intake: n(3), currently_held: n(2), returned_to_owner: n(1), approved_adoptions: n(2), pending_adoptions: n(1), completed_handovers: n(1), successful_adoptions: n(1), total_adoptions: n(4), adoption_rate: 50 },
    } : {}),
});
const requestsLog: Record<string, string>[] = [];
let failNext = params.has('fail');
Object.assign(window, { analyticsRequests: requestsLog });
api.defaults.adapter = async config => {
    const path = new URL(String(config.url), location.origin).pathname;
    if (path.startsWith('/analytics/')) {
        requestsLog.push({ path, ...(config.params || {}) });
        if (failNext) { failNext = false; return Promise.reject(Object.assign(new Error('Server error'), { isAxiosError: true, response: { status: 500, data: { detail: 'Analytics could not be loaded (synthetic failure).' } }, config })); }
        return { config, status: 200, statusText: 'OK', headers: {}, data: payload() };
    }
    return { config, status: 200, statusText: 'OK', headers: {}, data: path.includes('unread') ? { counts: {}, total: 0 } : [] };
};
const root = createRoot(document.getElementById('fixture')!);
root.render(<MemoryRouter><ThemeProvider><ToastProvider><AnalyticsDashboard mode={mode} /></ToastProvider></ThemeProvider></MemoryRouter>);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
