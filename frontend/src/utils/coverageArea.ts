import { api } from './api';

export const SELERA_DEFAULT_POLYGON = [
    { lat: 14.801496, lng: 121.005174 },
    { lat: 14.799577, lng: 121.003911 },
    { lat: 14.800634, lng: 121.002228 },
    { lat: 14.802461, lng: 121.003280 }
];

// Official fixed geographic Lat/Lng coordinates for Selera Homes boundary polygon
export const SELERA_POLYGON_BOUNDS: [number, number][] = [
    [14.801496, 121.005174],
    [14.799577, 121.003911],
    [14.800634, 121.002228],
    [14.802461, 121.003280]
];

// Preserved official orange dashed boundary style
export const SELERA_BOUNDARY_PATH_OPTIONS = {
    color: '#F97316',
    fillColor: '#F97316',
    fillOpacity: 0.12,
    weight: 2.5,
    dashArray: '6, 8',
    className: 'outline-none focus:outline-none cursor-pointer'
};

// Convert array of {lat, lng} to stable [lat, lng][] array
export const getPolygonLatLngs = (polygon?: Array<{ lat: number; lng: number }> | null): [number, number][] => {
    if (!polygon || !Array.isArray(polygon) || polygon.length === 0) {
        return SELERA_POLYGON_BOUNDS;
    }
    return polygon.map(p => [p.lat, p.lng] as [number, number]);
};

// Calculated centroid from Selera Homes boundary polygon
export const SELERA_DEFAULT_CENTER: [number, number] = [14.801042, 121.003648];

// Official fixed coordinates for Barangay San Vicente New Barangay Hall HQ (R243+QH)
export const SAN_VICENTE_HQ: [number, number] = [14.806906, 121.0039297];
export const BARANGAY_SAN_VICENTE_HQ: [number, number] = SAN_VICENTE_HQ;
export const ADMIN_HQ: [number, number] = SAN_VICENTE_HQ;

/** True only for a real, usable map coordinate (rejects null, "", NaN, 0,0 and out-of-range values). */
export const isValidLatLng = (lat: unknown, lng: unknown): boolean => {
    if (lat === null || lat === undefined || lat === '' || lng === null || lng === undefined || lng === '') return false;
    const nLat = Number(lat);
    const nLng = Number(lng);
    return Number.isFinite(nLat) && Number.isFinite(nLng) && !(nLat === 0 && nLng === 0) && Math.abs(nLat) <= 90 && Math.abs(nLng) <= 180;
};

export const COVERAGE_OUTSIDE_ERROR_MESSAGE = "This report location is outside the current STRAY-SAFE reporting coverage area.";

export interface CoverageAreaInfo {
    id: number;
    subdivision_id: number;
    center_label: string;
    center_latitude: number;
    center_longitude: number;
    radius_meters: number;
    boundary_polygon: Array<{ lat: number; lng: number }>;
    is_active: boolean;
    updated_at?: string;
}

export const calculateDistanceMeters = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 6371000; // Earth radius in meters
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lng2 - lng1) * Math.PI) / 180;

    const a =
        Math.sin(deltaPhi / 2) ** 2 +
        Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

export const fetchCoverageArea = async (): Promise<CoverageAreaInfo> => {
    try {
        const res = await api.get<CoverageAreaInfo>('/reports/coverage-area');
        if (res.data && res.data.center_latitude) {
            return res.data;
        }
    } catch (e) {
        console.warn('Failed to fetch coverage area from server, using default Selera Homes center:', e);
    }
    return {
        id: 1,
        subdivision_id: 1,
        center_label: 'Selera Homes',
        center_latitude: SELERA_DEFAULT_CENTER[0],
        center_longitude: SELERA_DEFAULT_CENTER[1],
        radius_meters: 1000,
        boundary_polygon: SELERA_DEFAULT_POLYGON,
        is_active: true
    };
};

export const isWithinCoverage = (
    lat: number,
    lng: number,
    coverage: CoverageAreaInfo | null
): { isInside: boolean; distance: number; allowedRadius: number; message: string } => {
    const centerLat = coverage?.center_latitude ?? SELERA_DEFAULT_CENTER[0];
    const centerLng = coverage?.center_longitude ?? SELERA_DEFAULT_CENTER[1];
    const allowedRadius = coverage?.radius_meters ?? 1000;

    const distance = calculateDistanceMeters(lat, lng, centerLat, centerLng);
    const isInside = distance <= allowedRadius;

    return {
        isInside,
        distance,
        allowedRadius,
        message: isInside ? 'Location is within coverage area.' : COVERAGE_OUTSIDE_ERROR_MESSAGE
    };
};
