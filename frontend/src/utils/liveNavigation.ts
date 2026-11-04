import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';

// Live GPS while following directions. The "you" marker follows every GPS fix, but the route is only recalculated
// after moving RECALC_METERS (or MIN_MOVE_METERS once RECALC_MS has passed), so the free OSRM service isn't flooded
// and the route doesn't flicker on every small GPS jitter.
export const RECALC_METERS = 25;
export const MIN_MOVE_METERS = 5;
export const RECALC_MS = 15000;
export const ARRIVED_METERS = 30;

// StraySafe's active jurisdiction is Barangay San Vicente / Selera Homes in Santa Maria, Bulacan.
// Desktop PCs on wired Ethernet have no GPS or Wi-Fi triangulation, so browsers fall back to coarse ISP IP gateways
// (often 50–200 km away in Pangasinan/La Union or Metro Manila, with multi-kilometre accuracy circles).
export const BULACAN_REFERENCE_CENTER: [number, number] = [14.801042, 121.003648];
export const MAX_RELIABLE_GPS_ACCURACY_METERS = 2500;
export const MAX_LOCAL_ROUTE_DISTANCE_METERS = 30000;

export function metersBetween(a: [number, number], b: [number, number]): number {
    const R = 6371000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(b[0] - a[0]);
    const dLng = toRad(b[1] - a[1]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

export interface GpsFixCheck {
    reliable: boolean;
    reason: 'invalid_coords' | 'coarse_accuracy' | 'outside_bulacan' | null;
    distanceMeters: number;
    accuracyMeters: number | null;
    message: string | null;
}

export function checkLocalGpsFix(
    coords?: Pick<GeolocationCoordinates, 'latitude' | 'longitude' | 'accuracy'> | null,
    referencePoint: [number, number] = BULACAN_REFERENCE_CENTER,
): GpsFixCheck {
    const lat = Number(coords?.latitude);
    const lng = Number(coords?.longitude);
    if (!coords || !Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        return {
            reliable: false,
            reason: 'invalid_coords',
            distanceMeters: Infinity,
            accuracyMeters: null,
            message: 'Your device returned invalid GPS coordinates.',
        };
    }

    const accuracyMeters = Number.isFinite(coords.accuracy) && coords.accuracy > 0 ? Math.round(coords.accuracy) : null;
    const ref: [number, number] =
        Number.isFinite(referencePoint?.[0]) && Number.isFinite(referencePoint?.[1])
            ? referencePoint
            : BULACAN_REFERENCE_CENTER;
    const distanceMeters = Math.round(metersBetween([lat, lng], ref));

    if (distanceMeters > MAX_LOCAL_ROUTE_DISTANCE_METERS) {
        return {
            reliable: false,
            reason: 'outside_bulacan',
            distanceMeters,
            accuracyMeters,
            message:
                'Your browser reported an approximate network/ISP location outside Bulacan (common on desktop PCs without a GPS sensor). Please use "From My Home", "From Brgy HQ", or place your starting pinpoint on the map.',
        };
    }

    if (accuracyMeters !== null && accuracyMeters > MAX_RELIABLE_GPS_ACCURACY_METERS) {
        return {
            reliable: false,
            reason: 'coarse_accuracy',
            distanceMeters,
            accuracyMeters,
            message:
                `Your device location is too approximate (±${(accuracyMeters / 1000).toFixed(1)} km network estimate) to pinpoint your street. Please use "From My Home", "From Brgy HQ", or place your starting pinpoint on the map.`,
        };
    }

    return {
        reliable: true,
        reason: null,
        distanceMeters,
        accuracyMeters,
        message: null,
    };
}

/** Should the route be recalculated from `next`? (pure: used by the hook and easy to reason about) */
export function shouldRecalculate(last: [number, number] | null, next: [number, number], msSinceLast: number): boolean {
    if (!last) return true;
    const moved = metersBetween(last, next);
    return moved >= RECALC_METERS || (moved >= MIN_MOVE_METERS && msSinceLast >= RECALC_MS);
}

export interface LiveRoute {
    routeStart: [number, number] | null;   // where the route is drawn from (throttled only for noisy live GPS)
    livePos: [number, number] | null;      // latest GPS fix (for the "you" marker)
    accuracy: number | null;               // metres
    gpsError: string | null;
    arrived: boolean;
    lastFixAt: number | null;
}

export function useLiveRoute(routing?: { start: [number, number]; end: [number, number]; live?: boolean } | null): LiveRoute {
    const live = Boolean(routing?.live);
    const [livePos, setLivePos] = useState<[number, number] | null>(null);
    const [accuracy, setAccuracy] = useState<number | null>(null);
    const [gpsError, setGpsError] = useState<string | null>(null);
    const [lastFixAt, setLastFixAt] = useState<number | null>(null);
    const [routeStart, setRouteStart] = useState<[number, number] | null>(null);
    const lastRecalcAt = useRef(0);
    const routeStartRef = useRef<[number, number] | null>(null);
    const routingEndRef = useRef<[number, number] | null>(routing?.end || null);
    routingEndRef.current = routing?.end || null;

    // Follow the GPS only while a live route is shown
    useEffect(() => {
        setLivePos(null);
        setGpsError(null);
        if (!live || !('geolocation' in navigator)) return;

        let activeWatchId: number | null = null;
        let usedLowAccuracyFallback = false;
        let cancelled = false;

        const startWatch = (highAccuracy: boolean) => {
            if (cancelled) return;
            activeWatchId = navigator.geolocation.watchPosition(
                (p) => {
                    if (cancelled) return;
                    const check = checkLocalGpsFix(p.coords, routingEndRef.current || BULACAN_REFERENCE_CENTER);
                    if (!check.reliable) {
                        setGpsError('Coarse network location ignored; keeping your starting pin');
                        return;
                    }
                    setLivePos([p.coords.latitude, p.coords.longitude]);
                    setAccuracy(Number.isFinite(p.coords.accuracy) ? Math.round(p.coords.accuracy) : null);
                    setLastFixAt(Date.now());
                    setGpsError(null);
                },
                (err) => {
                    if (cancelled) return;
                    if (highAccuracy && !usedLowAccuracyFallback && err.code !== err.PERMISSION_DENIED) {
                        usedLowAccuracyFallback = true;
                        if (activeWatchId !== null) navigator.geolocation.clearWatch(activeWatchId);
                        startWatch(false);
                        return;
                    }
                    setGpsError(err.code === err.PERMISSION_DENIED ? 'Location permission denied' : 'GPS signal lost: using your starting pin');
                },
                highAccuracy
                    ? { enableHighAccuracy: true, maximumAge: 5000, timeout: 12000 }
                    : { enableHighAccuracy: false, maximumAge: 10000, timeout: 20000 },
            );
        };

        startWatch(true);
        return () => {
            cancelled = true;
            if (activeWatchId !== null) navigator.geolocation.clearWatch(activeWatchId);
        };
    }, [live]);

    const desired: [number, number] | null = routing ? (live && livePos ? livePos : routing.start) : null;

    // Non-live routes (From Brgy HQ, From My Home, dragged pin, live dispatch follow) update immediately whenever
    // `desired` moves; noisy device GPS (`live`) uses throttled recalculation so OSRM isn't flooded.
    useEffect(() => {
        const tick = () => {
            if (!desired) {
                routeStartRef.current = null;
                setRouteStart(null);
                return;
            }
            const now = Date.now();
            if (!live) {
                const prev = routeStartRef.current;
                if (!prev || Math.abs(prev[0] - desired[0]) > 1e-7 || Math.abs(prev[1] - desired[1]) > 1e-7) {
                    routeStartRef.current = desired;
                    lastRecalcAt.current = now;
                    setRouteStart(desired);
                }
                return;
            }
            if (shouldRecalculate(routeStartRef.current, desired, now - lastRecalcAt.current)) {
                routeStartRef.current = desired;
                lastRecalcAt.current = now;
                setRouteStart(desired);
            }
        };
        tick();
        if (!live) return;
        const t = window.setInterval(tick, 4000);
        return () => window.clearInterval(t);
    }, [desired?.[0], desired?.[1], live]);

    const arrived = Boolean(live && livePos && routing && metersBetween(livePos, routing.end) <= ARRIVED_METERS);
    return { routeStart, livePos, accuracy, gpsError, arrived, lastFixAt };
}

export interface LiveDispatchLocation {
    is_active: boolean;
    report_id: number;
    latitude?: number | null;
    longitude?: number | null;
    heading?: number | null;
    accuracy?: number | null;
    responder_id?: number | null;
    responder_name?: string | null;
    updated_at?: number | null;
}

export function useDispatchBroadcaster(
    reportId: number | null,
    enabled: boolean,
    initialFallbackPos?: [number, number] | null,
) {
    const [gpsError, setGpsError] = useState<string | null>(null);
    const [lastSentPos, setLastSentPos] = useState<[number, number] | null>(null);
    const lastSentRef = useRef<{ pos: [number, number] | null; time: number }>({ pos: null, time: 0 });
    const fallbackRef = useRef<[number, number] | null>(initialFallbackPos || null);
    fallbackRef.current = initialFallbackPos || null;

    const handlePostError = useCallback((err: any) => {
        const status = err?.response?.status;
        const detail = err?.response?.data?.detail;
        if (status === 403) {
            setGpsError(detail || 'Only assigned rescue personnel or Head Officers can broadcast live GPS for this report.');
        } else if (status === 400) {
            setGpsError(detail || 'Live GPS broadcast is only available while the team is dispatched.');
        }
    }, []);

    // Allows Barangay responders on a desktop PC (or adjusting pin manually) to drag the 🚓 Dispatch Team pin
    // and broadcast the updated Barangay position live to Resident, Subdivision, and Barangay maps.
    const sendManualPosition = useCallback((lat: number, lng: number) => {
        if (!enabled || !reportId || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
        lastSentRef.current = { pos: [lat, lng], time: Date.now() };
        setLastSentPos([lat, lng]);
        api.post(`/reports/${reportId}/live-location`, {
            latitude: lat,
            longitude: lng,
            heading: null,
            accuracy: 10,
        }).catch(handlePostError);
    }, [enabled, reportId, handlePostError]);

    useEffect(() => {
        setGpsError(null);
        if (!enabled || !reportId) {
            setLastSentPos(null);
            lastSentRef.current = { pos: null, time: 0 };
            return;
        }

        const seedFallbackIfNeeded = (notice: string) => {
            setGpsError(notice);
            const fb = fallbackRef.current;
            if (!lastSentRef.current.pos && fb && Number.isFinite(fb[0]) && Number.isFinite(fb[1])) {
                lastSentRef.current = { pos: [fb[0], fb[1]], time: Date.now() };
                setLastSentPos([fb[0], fb[1]]);
                api.post(`/reports/${reportId}/live-location`, {
                    latitude: fb[0],
                    longitude: fb[1],
                    accuracy: 25,
                }).catch(handlePostError);
            }
        };

        if (!('geolocation' in navigator)) {
            seedFallbackIfNeeded('No GPS sensor on this device — drag the 🚓 Dispatch Team pin on the map to move your live position.');
            return;
        }

        let wakeLock: any = null;
        if ('wakeLock' in navigator) {
            (navigator as any).wakeLock.request('screen').then((wl: any) => {
                wakeLock = wl;
            }).catch(() => {});
        }

        const sendPing = (lat: number, lng: number, heading: number | null, accuracy: number | null) => {
            const now = Date.now();
            const prev = lastSentRef.current.pos;
            const elapsed = now - lastSentRef.current.time;
            const moved = prev ? metersBetween(prev, [lat, lng]) : 9999;

            if (!prev || moved >= 3 || elapsed >= 3000) {
                lastSentRef.current = { pos: [lat, lng], time: now };
                setLastSentPos([lat, lng]);
                api.post(`/reports/${reportId}/live-location`, {
                    latitude: lat,
                    longitude: lng,
                    heading,
                    accuracy
                }).catch(handlePostError);
            }
        };

        let activeWatchId: number | null = null;
        let usedLowAccuracyFallback = false;
        let cancelled = false;

        const startWatch = (highAccuracy: boolean) => {
            if (cancelled) return;
            activeWatchId = navigator.geolocation.watchPosition(
                (p) => {
                    if (cancelled) return;
                    const check = checkLocalGpsFix(p.coords, BULACAN_REFERENCE_CENTER);
                    if (!check.reliable) {
                        seedFallbackIfNeeded(
                            'Desktop/ISP network location detected — started pin at Barangay HQ. Drag the 🚓 Dispatch Team pin on the map to move it live, or open on a mobile phone for automatic GPS.'
                        );
                        return;
                    }
                    setGpsError(null);
                    sendPing(
                        p.coords.latitude,
                        p.coords.longitude,
                        Number.isFinite(p.coords.heading) ? p.coords.heading : null,
                        Number.isFinite(p.coords.accuracy) ? Math.round(p.coords.accuracy) : null
                    );
                },
                (err) => {
                    if (cancelled) return;
                    if (highAccuracy && !usedLowAccuracyFallback && err.code !== err.PERMISSION_DENIED) {
                        usedLowAccuracyFallback = true;
                        if (activeWatchId !== null) navigator.geolocation.clearWatch(activeWatchId);
                        startWatch(false);
                        return;
                    }
                    seedFallbackIfNeeded(
                        err.code === err.PERMISSION_DENIED
                            ? 'Location permission denied — drag the 🚓 Dispatch Team pin on the map to update position manually, or allow GPS access.'
                            : 'Waiting for GPS signal — drag the 🚓 Dispatch Team pin on the map to move it manually (on phone browsers, open via https://).'
                    );
                },
                highAccuracy
                    ? { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
                    : { enableHighAccuracy: false, maximumAge: 8000, timeout: 18000 }
            );
        };

        startWatch(true);

        const heartbeat = window.setInterval(() => {
            if (lastSentRef.current.pos) {
                const [lat, lng] = lastSentRef.current.pos;
                api.post(`/reports/${reportId}/live-location`, {
                    latitude: lat,
                    longitude: lng
                }).catch(handlePostError);
            }
        }, 10000);

        return () => {
            cancelled = true;
            if (activeWatchId !== null) navigator.geolocation.clearWatch(activeWatchId);
            window.clearInterval(heartbeat);
            if (wakeLock && wakeLock.release) {
                wakeLock.release().catch(() => {});
            }
            api.delete(`/reports/${reportId}/live-location`).catch(() => {});
        };
    }, [reportId, enabled, handlePostError]);

    return { gpsError, lastSentPos, sendManualPosition };
}

export function useWatchDispatchLocation(reportId: number | null, isDispatchedStatus: boolean) {
    const [liveLocation, setLiveLocation] = useState<LiveDispatchLocation | null>(null);

    useEffect(() => {
        if (!reportId || !isDispatchedStatus) {
            setLiveLocation(null);
            return;
        }
        let cancelled = false;
        const poll = () => {
            api.get(`/reports/${reportId}/live-location`)
                .then((res) => {
                    if (!cancelled) {
                        setLiveLocation(res.data);
                    }
                })
                .catch(() => {});
        };
        poll();
        const interval = window.setInterval(poll, 2500);
        return () => {
            cancelled = true;
            window.clearInterval(interval);
        };
    }, [reportId, isDispatchedStatus]);

    return { liveLocation };
}
