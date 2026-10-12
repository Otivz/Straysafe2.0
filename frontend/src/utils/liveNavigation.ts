import { useEffect, useRef, useState } from 'react';

// Live GPS while following directions. The "you" marker follows every GPS fix, but the route is only recalculated
// after moving RECALC_METERS (or MIN_MOVE_METERS once RECALC_MS has passed), so the free OSRM service isn't flooded
// and the route doesn't flicker on every small GPS jitter.
export const RECALC_METERS = 25;
export const MIN_MOVE_METERS = 5;
export const RECALC_MS = 15000;
export const ARRIVED_METERS = 30;

export function metersBetween(a: [number, number], b: [number, number]): number {
    const R = 6371000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(b[0] - a[0]);
    const dLng = toRad(b[1] - a[1]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

/** Should the route be recalculated from `next`? (pure: used by the hook and easy to reason about) */
export function shouldRecalculate(last: [number, number] | null, next: [number, number], msSinceLast: number): boolean {
    if (!last) return true;
    const moved = metersBetween(last, next);
    return moved >= RECALC_METERS || (moved >= MIN_MOVE_METERS && msSinceLast >= RECALC_MS);
}

export interface LiveRoute {
    routeStart: [number, number] | null;   // where the route is drawn from (throttled)
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

    // Follow the GPS only while a live route is shown
    useEffect(() => {
        setLivePos(null);
        setGpsError(null);
        if (!live || !('geolocation' in navigator)) return;
        const id = navigator.geolocation.watchPosition(
            (p) => {
                setLivePos([p.coords.latitude, p.coords.longitude]);
                setAccuracy(Number.isFinite(p.coords.accuracy) ? Math.round(p.coords.accuracy) : null);
                setLastFixAt(Date.now());
                setGpsError(null);
            },
            (err) => setGpsError(err.code === err.PERMISSION_DENIED ? 'Location permission denied' : 'GPS signal lost: using the last known position'),
            { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
        );
        return () => navigator.geolocation.clearWatch(id);
    }, [live]);

    const desired: [number, number] | null = routing ? (live && livePos ? livePos : routing.start) : null;

    // Throttled route start; also re-checked every few seconds so a slow walk still updates after RECALC_MS
    useEffect(() => {
        const tick = () => {
            if (!desired) {
                routeStartRef.current = null;
                setRouteStart(null);
                return;
            }
            const now = Date.now();
            if (shouldRecalculate(routeStartRef.current, desired, now - lastRecalcAt.current)) {
                routeStartRef.current = desired;
                lastRecalcAt.current = now;
                setRouteStart(desired);
            }
        };
        tick();
        if (!live) return;
        const t = window.setInterval(tick, 5000);
        return () => window.clearInterval(t);
    }, [desired?.[0], desired?.[1], live]);

    const arrived = Boolean(live && livePos && routing && metersBetween(livePos, routing.end) <= ARRIVED_METERS);
    return { routeStart, livePos, accuracy, gpsError, arrived, lastFixAt };
}
