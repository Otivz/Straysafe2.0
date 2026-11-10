/**
 * The backend address an Android build may carry (VITE_API_BASE_URL), checked before anything is bundled.
 *
 * The Android app is the live Resident interface in a Capacitor shell (see docs/05-operations/ANDROID_RESIDENT_APP.md):
 *   - `vite build --mode android` (release-style) must carry one fixed HTTPS address;
 *   - `vite build --mode android-debug` (the debug APK) may carry none, because its Connection Settings screen sets the address on the
 *     phone, but one that is given must pass the same checks.
 * On a phone there is no dev-server proxy and `localhost` is the phone itself, so an APK built with a loopback or malformed address could
 * never reach the server. Rather than ship one that fails (or quietly talks to the wrong place), the build stops here with a sentence
 * saying what to change. A build-time address is always HTTPS: nothing about a developer's own network (a plain-http LAN address) is baked
 * into an APK; that is typed into the debug app's Connection Settings on the phone.
 *
 * Pure and dependency-free so vite.config.ts and the unit test (tests/androidApiUrl.test.mjs) share it.
 */

const LOOPBACK = /^(localhost|127(\.\d{1,3}){3}|0\.0\.0\.0|\[?::1\]?)$/i;

/**
 * @param value    what VITE_API_BASE_URL holds
 * @param optional true for the debug build, where an empty value is fine (the address is entered in the app)
 * @returns a plain sentence describing the problem, or null when the address may be used
 */
export function androidApiUrlProblem(value: string | undefined | null, optional = false): string | null {
  const text = (value ?? '').trim();
  if (!text) {
    if (optional) return null;
    return 'VITE_API_BASE_URL is not set. Set it to the address of the backend the app should call, for example https://api.example.org '
      + '(for GitHub Actions: repository variable VITE_API_BASE_URL).';
  }
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return `VITE_API_BASE_URL ("${text}") is not a web address. Use the full address, for example https://api.example.org.`;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return `VITE_API_BASE_URL must start with https:// (it starts with ${url.protocol}//).`;
  }
  if (url.protocol === 'http:') {
    return 'VITE_API_BASE_URL uses http://, but an address built into the app must be HTTPS. To test against a computer on your own network, '
      + 'install the debug build and enter its address in Connection Settings on the phone.';
  }
  if (LOOPBACK.test(url.hostname)) {
    return `VITE_API_BASE_URL points at ${url.hostname}, which on a phone is the phone itself. Use an address the phone can reach `
      + '(a public HTTPS address).';
  }
  if (url.username || url.password) {
    return 'VITE_API_BASE_URL must not contain a user name or password: everything in it is readable inside the app.';
  }
  if (url.search || url.hash) {
    return 'VITE_API_BASE_URL must be the server address only (no ? or # part).';
  }
  if (text.endsWith('/')) {
    return 'VITE_API_BASE_URL must not end with a slash (the app adds it: https://api.example.org, not https://api.example.org/).';
  }
  return null;
}
