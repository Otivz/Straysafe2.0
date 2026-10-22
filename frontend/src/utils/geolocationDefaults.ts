// Safe defaults for every one-off location request in the app.
// Most pages call navigator.geolocation.getCurrentPosition(success, error) with no options, and the browser default
// timeout is "wait forever": with GPS off or no signal (common on Android) the request never answers and the page
// stays on "locating…". Here every call gets a time limit, may reuse a fix up to 30 s old, and asks for the precise
// position. Options a page passes itself still win.
const DEFAULTS: PositionOptions = { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 };

if (typeof navigator !== 'undefined' && navigator.geolocation && !(navigator.geolocation as any).__straysafeDefaults) {
    const geo = navigator.geolocation;
    const original = geo.getCurrentPosition.bind(geo);
    geo.getCurrentPosition = (success: PositionCallback, error?: PositionErrorCallback | null, options?: PositionOptions) =>
        original(success, error ?? undefined, { ...DEFAULTS, ...(options || {}) });
    (geo as any).__straysafeDefaults = true;
}

// Plain message for a failed location request (GPS off, location blocked, no fix in time). Every page that asks has
// a map, so the message says the pin can be placed by tapping it.
export const locationErrorMessage = (err?: GeolocationPositionError | null): string => {
    if (err?.code === 1) return 'Location is blocked for StraySafe. Allow it in your browser or phone settings, or tap the map to place the pin.';
    if (err?.code === 3) return 'Finding your location took too long. Check that GPS is on, or tap the map to place the pin.';
    return 'Your location is not available right now. Check that GPS is on, or tap the map to place the pin.';
};
