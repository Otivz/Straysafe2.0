import { getCachedData, setCachedData } from './cache';

// Street-address look-ups (OpenStreetMap Nominatim), cached per coordinate (STRAYSAFE_PERFORMANCE_AUDIT.md M6 / C4).
// Nominatim allows about one request per second per client and often takes 0.5-2 s. Opening the same report again,
// or the same pin on another page, now reuses the answer for the rest of the session instead of asking again.
// The cache is per tab and per signed-in account, and is cleared on sign-out (utils/cache.ts).
const TTL_MS = 24 * 60 * 60 * 1000;
const inFlight = new Map<string, Promise<any>>();

/**
 * Same request and same JSON as calling https://nominatim.openstreetmap.org/reverse directly. Rejects when the request
 * fails (network error, timeout or a non-OK status), like axios.get does, so callers' existing catch blocks still run;
 * for a non-OK status the error carries `httpStatus`.
 * Coordinates are matched to 5 decimals (about 1 m); the extra params (format, addressdetails, zoom, accept-language,
 * ...) are part of the cache key, so each kind of request keeps its own answer.
 */
export function nominatimReverse(
    lat: number | string,
    lng: number | string,
    params: Record<string, string | number> = {},
    options: { timeoutMs?: number } = {}
): Promise<any> {
    const la = Number(lat);
    const ln = Number(lng);
    if (!Number.isFinite(la) || !Number.isFinite(ln)) return Promise.reject(new Error('Invalid coordinates'));

    const extra = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('&');
    const key = `geo_reverse|${extra}|${la.toFixed(5)},${ln.toFixed(5)}`;
    const hit = getCachedData<any>(key);
    if (hit) return Promise.resolve(hit);
    const running = inFlight.get(key);
    if (running) return running;

    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => query.set(k, String(v)));
    query.set('lat', String(lat));
    query.set('lon', String(lng));
    const controller = options.timeoutMs ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), options.timeoutMs) : null;
    const p = fetch(`https://nominatim.openstreetmap.org/reverse?${query.toString()}`, controller ? { signal: controller.signal } : undefined)
        .then(async (res) => {
            if (!res.ok) throw Object.assign(new Error(`Address look-up failed (${res.status})`), { httpStatus: res.status });
            const data = await res.json();
            if (data && !data.error) setCachedData(key, data, TTL_MS); // "Unable to geocode" answers are not kept
            return data;
        })
        .finally(() => {
            if (timer) clearTimeout(timer);
            inFlight.delete(key);
        });
    inFlight.set(key, p);
    return p;
}
