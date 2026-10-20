// Multi-animal reports (MULTI_ANIMAL_REPORT_PLAN.md): one card / row / map pin per incident.
// An animal record (split_from_report_id) is left out while its group report is in the same list; the group's page
// shows its animal records. An animal record whose group isn't in the list keeps its own entry, so nothing is lost.
export function onePerIncident<T = any>(reports: T[]): T[] {
    const ids = new Set(reports.map((r: any) => r?.report_id));
    return reports.filter((r: any) => !(r?.split_from_report_id && ids.has(r.split_from_report_id)));
}
