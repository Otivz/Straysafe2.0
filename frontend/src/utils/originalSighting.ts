interface OriginalSightingFields {
    initial_landmark?: unknown;
    initial_latitude?: unknown;
    initial_longitude?: unknown;
}

const placeholders = new Set([
    'selera homes', 'selera', 'incident location', 'initial sighting spot',
    'sighting location', 'incident sighting location', 'rescue site',
    'reported incident location', 'unknown', 'n/a', 'none',
]);

/** Only saved original fields can describe the sighting, never the animal's current location. */
export function getOriginalSighting(report: OriginalSightingFields | null | undefined) {
    const name = typeof report?.initial_landmark === 'string' ? report.initial_landmark.trim() : '';
    const landmark = name && !placeholders.has(name.toLowerCase()) ? name : null;
    const coordinate = (value: unknown, limit: number): number | null => {
        if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') return null;
        const number = Number(value);
        return Number.isFinite(number) && Math.abs(number) <= limit ? number : null;
    };
    const lat = coordinate(report?.initial_latitude, 90);
    const lng = coordinate(report?.initial_longitude, 180);
    const point: [number, number] | null = lat !== null && lng !== null ? [lat, lng] : null;
    const label = landmark || (point ? point.map(value => value.toFixed(6)).join(', ') : null);
    return { landmark, point, label };
}

interface ReportSightingFields extends OriginalSightingFields {
    latitude?: unknown;
    longitude?: unknown;
    landmark?: unknown;
    status_id?: unknown;
    current_status_id?: unknown;
    custody_status?: unknown;
    facility_id?: unknown;
}

/** Match reviews and incident maps use the original pin, even after an animal is moved. */
export function getReportSighting(report: ReportSightingFields | null | undefined) {
    const original = getOriginalSighting(report);
    if (original.point && original.point.some(value => value !== 0)) return original;

    // Legacy reports without an origin can use a saved incident pin while still at
    // the sighting. A facility's current pin cannot stand in for an unknown origin.
    const custody = typeof report?.custody_status === 'string' ? report.custody_status.toLowerCase() : '';
    const relocated = report?.facility_id != null || [7, 8].includes(Number(report?.current_status_id ?? report?.status_id))
        || /facility|holding|impound/.test(custody);
    if (relocated) return { landmark: original.landmark, point: null, label: original.landmark };

    const legacy = getOriginalSighting({
        initial_latitude: report?.latitude,
        initial_longitude: report?.longitude,
        initial_landmark: report?.landmark,
    });
    return legacy.point?.some(value => value !== 0) ? legacy : { landmark: original.landmark, point: null, label: original.landmark };
}
