// Incident rules shared by the Admin, Barangay and Subdivision Leader maps.
// Restored from 3bbb263; see the restoration checklist under docs/06-future-proposals/.
// Pins show what needs action now (active reports, at the animal's current place);
// the heat layer and hotspots show where incidents happen (valid incidents, at the original sighting).
import { getReportSighting } from './originalSighting.ts';

/** Same as CLOSED_REPORT_STATUS_IDS in backend/app/utils/case_closure.py; keep the two in step. */
export const CLOSED_STATUS_IDS: readonly number[] = [3, 9, 10, 11, 12, 14, 17, 18];
/** Rejected, False Alarm, Merged duplicate: not real incidents, never counted on the heat layer. */
export const INVALID_INCIDENT_STATUS_IDS: readonly number[] = [3, 14, 18];
export const LOST_PET_CATEGORY_ID = 6;

// Team-defined operational thresholds (not an official standard)
export const HOTSPOT_RADIUS_M = 50;
export const HOTSPOT_WINDOW_DAYS = 30;
export const HOTSPOT_MIN_INCIDENTS = 3;
export const HIGH_DENSITY_MIN_INCIDENTS = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface IncidentReport {
    report_id?: number | string;
    status_id?: number | string | null;
    current_status_id?: number | string | null;
    category_id?: number | string | null;
    priority_level?: string | null;
    created_at?: string | Date | null;
    duplicate_of_report_id?: number | string | null;
    split_from_report_id?: number | string | null;
    initial_latitude?: unknown;
    initial_longitude?: unknown;
    initial_landmark?: unknown;
    latitude?: unknown;
    longitude?: unknown;
    landmark?: unknown;
    facility_id?: unknown;
    custody_status?: unknown;
}

export type DatePreset = '7d' | '30d' | '90d' | 'all' | 'custom';
export const DEFAULT_DATE_PRESET: DatePreset = '30d';
export const DATE_PRESET_LABELS: Record<DatePreset, string> = {
    '7d': 'Past 7 Days',
    '30d': 'Past 30 Days',
    '90d': 'Past 90 Days',
    all: 'All Time',
    custom: 'Custom Range',
};

export function reportStatusId(report: IncidentReport): number {
    return Number(report?.status_id ?? report?.current_status_id ?? 1);
}

/** Active = not closed (the backend's definition). Picked Up (6) is active: the case is still open. */
export function isActiveReport(report: IncidentReport): boolean {
    return !report.duplicate_of_report_id && !CLOSED_STATUS_IDS.includes(reportStatusId(report));
}

export function isValidIncident(report: IncidentReport): boolean {
    return !report.duplicate_of_report_id && !report.split_from_report_id
        && !INVALID_INCIDENT_STATUS_IDS.includes(reportStatusId(report));
}

export function isLostPetReport(report: IncidentReport): boolean {
    return Number(report?.category_id) === LOST_PET_CATEGORY_ID;
}

/** High priority weighs more on the heat layer. */
export function heatWeight(report: IncidentReport): number {
    return report?.priority_level === 'High' ? 1.0 : 0.6;
}

/** Where the incident happened: the original sighting, never a facility the animal was moved to. */
export function sightingPoint(report: IncidentReport): [number, number] | null {
    return getReportSighting(report).point;
}

/** Custom dates are inclusive Manila calendar days, independent of the browser's timezone. */
function calendarDayStart(value: string): number {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
    const utc = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(utc.getTime()) || utc.toISOString().slice(0, 10) !== value) return NaN;
    return Date.parse(`${value}T00:00:00+08:00`);
}

export function isInDateRange(report: IncidentReport, preset: DatePreset, customStart = '', customEnd = '', now = new Date()): boolean {
    const created = new Date(report.created_at instanceof Date ? report.created_at.getTime() : report.created_at || NaN);
    if (Number.isNaN(created.getTime())) return preset === 'all';
    if (created > now) return false;
    if (preset === 'all') return true;
    if (preset === 'custom') {
        const start = customStart ? calendarDayStart(customStart) : -Infinity;
        const end = customEnd ? calendarDayStart(customEnd) + DAY_MS : Infinity;
        return !Number.isNaN(start) && !Number.isNaN(end) && start < end
            && created.getTime() >= start && created.getTime() < end;
    }
    const days = preset === '7d' ? 7 : preset === '90d' ? 90 : 30;
    return created.getTime() >= now.getTime() - days * DAY_MS;
}

/** Lost pets are missing owned animals, not stray density: left out unless asked for. */
export function heatIncidents<T extends IncidentReport>(reports: T[], includeLostPets = false): T[] {
    const seen = new Set<string>();
    return reports.filter(r => {
        if (!isValidIncident(r) || (!includeLostPets && isLostPetReport(r))) return false;
        if (r.report_id == null) return true;
        const id = String(r.report_id);
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
    });
}

export function heatPoints(reports: IncidentReport[], includeLostPets = false): [number, number, number][] {
    const points: [number, number, number][] = [];
    for (const r of heatIncidents(reports, includeLostPets)) {
        const point = sightingPoint(r);
        if (point) points.push([point[0], point[1], heatWeight(r)]);
    }
    return points;
}

export function distanceMeters(a: [number, number], b: [number, number]): number {
    const rad = Math.PI / 180;
    const dLat = (b[0] - a[0]) * rad;
    const dLng = (b[1] - a[1]) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * 6371000 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

export type HotspotLevel = 'Hotspot' | 'High Incident Density';

export interface Hotspot {
    center: [number, number];
    count: number;
    level: HotspotLevel;
    label: string;
    reportIds: number[];
}

/**
 * Hotspots: 3 or more valid incidents within 50 m of a centre incident, over the last 30 days
 * (always the trailing window, whatever date range the map shows). 5 or more is High Incident Density.
 * Grouping: the incident with the most neighbours becomes a centre, it and its neighbours form one group,
 * and the next centre is chosen from the rest, so an incident belongs to at most one hotspot.
 */
export function findHotspots(reports: IncidentReport[], options: { includeLostPets?: boolean; now?: Date } = {}): Hotspot[] {
    const now = options.now ?? new Date();
    const since = now.getTime() - HOTSPOT_WINDOW_DAYS * DAY_MS;
    let left = heatIncidents(reports, options.includeLostPets)
        .filter(r => {
            const t = new Date(r.created_at instanceof Date ? r.created_at.getTime() : r.created_at || NaN).getTime();
            return Number.isFinite(t) && t >= since && t <= now.getTime();
        })
        .map(r => ({ report: r, point: sightingPoint(r) }))
        .filter((x): x is { report: IncidentReport; point: [number, number] } => x.point !== null);

    const hotspots: Hotspot[] = [];
    while (left.length >= HOTSPOT_MIN_INCIDENTS) {
        const near = (c: { point: [number, number] }) => left.filter(x => distanceMeters(c.point, x.point) <= HOTSPOT_RADIUS_M);
        let best = near(left[0]);
        for (const c of left.slice(1)) {
            const group = near(c);
            if (group.length > best.length) best = group;
        }
        if (best.length < HOTSPOT_MIN_INCIDENTS) break;

        const center: [number, number] = [
            best.reduce((s, x) => s + x.point[0], 0) / best.length,
            best.reduce((s, x) => s + x.point[1], 0) / best.length,
        ];
        hotspots.push({
            center,
            count: best.length,
            level: best.length >= HIGH_DENSITY_MIN_INCIDENTS ? 'High Incident Density' : 'Hotspot',
            label: commonLandmark(best.map(x => x.report)) ?? center.map(v => v.toFixed(5)).join(', '),
            reportIds: best.map(x => Number(x.report?.report_id)),
        });
        left = left.filter(x => !best.includes(x));
    }
    return hotspots.sort((a, b) => b.count - a.count);
}

/** The most common recorded sighting landmark in a group, or null when none was recorded. */
function commonLandmark(reports: IncidentReport[]): string | null {
    const counts = new Map<string, number>();
    for (const r of reports) {
        const name = getReportSighting(r).landmark;
        if (typeof name === 'string' && name) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    let top: string | null = null;
    for (const [name, n] of counts) if (top === null || n > (counts.get(top) ?? 0)) top = name;
    return top;
}
