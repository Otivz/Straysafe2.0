/**
 * The backend address of the Android DEBUG app, changeable on the phone without rebuilding (docs/05-operations/ANDROID_RESIDENT_APP.md).
 *
 * Pure and dependency-free (it takes `fetch` and the two storages as arguments), so the unit test runs it in Node. It is used only by
 * the `android-debug` build (src/utils/buildMode.ts); a release build neither contains the screen that calls it nor reads the saved
 * address (utils/api.ts).
 *
 *   parseBackendUrl   what was typed -> one normalized address, or a sentence saying what is wrong
 *   testBackend       a read-only "is this the StraySafe API?" request (GET /, which only returns a greeting), with a time limit
 *   readDevBackend    the address saved on this phone (validated again on every read)
 *   switchBackend     forget everything the app stored for the old backend, then keep only the new address
 */

/** The same key the older "Server settings" screen used (utils/serverAddress.ts): one saved address, not two. */
export const DEV_BACKEND_KEY = 'straysafe_server_url';
/** Typed as a bare IPv4 address ("192.168.1.10"), the address gets http:// and this port (the backend's usual dev port). */
const DEFAULT_LAN_PORT = '8000';
const MAX_LENGTH = 200;
export const TEST_TIMEOUT_MS = 8000;

export type ParsedBackend = { ok: true; url: string; secure: boolean } | { ok: false; message: string };

const fail = (message: string): ParsedBackend => ({ ok: false, message });

/** On a phone, these names mean the phone itself. */
const LOOPBACK = /^(localhost|[^.]+\.localhost|127(\.\d{1,3}){3}|0\.0\.0\.0|\[::1?\])$/i;
const BARE_IPV4 = /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/|$)/;

/** A computer on the same network: private IPv4 ranges (and the 100.64/10 range VPNs such as Tailscale use), `name.local`, or a one-word name. */
function isNetworkLocal(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(host);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
  }
  if (host.startsWith('[')) return false;
  return /\.local$/i.test(host) || !host.includes('.');
}

/**
 * What the developer typed -> the one address the app will use. Accepts `http://192.168.1.10:8000` (a computer on the same network),
 * `https://something.example.com` (a tunnel or server), and shorthand: a bare IPv4 address means `http://<it>:8000`, a bare name means
 * `https://<it>`. Refuses `localhost`/`127.0.0.1` (the phone itself), plain http to anything that is not on the local network,
 * credentials, query strings and fragments. The result has no trailing slash.
 */
export function parseBackendUrl(input: string | null | undefined): ParsedBackend {
  let text = (input ?? '').trim();
  if (!text) return fail('Enter the backend address, for example http://192.168.1.10:8000 or https://your-tunnel.example.com.');
  if (text.length > MAX_LENGTH) return fail('That address is too long.');
  const bareIp = !/^[a-z][a-z0-9+.-]*:\/\//i.test(text) && BARE_IPV4.test(text);
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = `${bareIp ? 'http' : 'https'}://${text}`;

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return fail('That is not a valid address. Use the form http://192.168.1.10:8000 or https://your-tunnel.example.com.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return fail(`Only http:// and https:// addresses can be used (this one starts with ${url.protocol}//).`);
  if (!url.hostname) return fail('The address has no server name in it.');
  if (LOOPBACK.test(url.hostname)) {
    return fail(`${url.hostname} on a phone means the phone itself, not your computer. Use your computer's address on the same Wi-Fi (for example http://192.168.1.10:8000) or an https tunnel address.`);
  }
  if (url.username || url.password) return fail('The address must not contain a user name or password.');
  if (url.search || url.hash) return fail('Enter the server address only, without anything after ? or #.');
  if (url.protocol === 'http:' && !isNetworkLocal(url.hostname)) {
    return fail('Plain http:// is only for a computer on your own network (an address such as 192.168.x.x or 10.x.x.x). For anything on the internet, use its https:// address.');
  }
  if (bareIp && !url.port) url.port = DEFAULT_LAN_PORT;
  return { ok: true, url: `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, '')}`, secure: url.protocol === 'https:' };
}

/** "http://192.168.1.10:8000" -> "192.168.1.10:8000" (for display). */
export const shortBackend = (url: string): string => url.replace(/^https?:\/\//, '');

/** A page served over https may not call http:// addresses (mixed content): say so instead of letting the request fail mysteriously. */
export function pageBlocksAddress(url: string, pageProtocol: string): string | null {
  return pageProtocol === 'https:' && url.startsWith('http:')
    ? 'This app is currently served over HTTPS, so Android blocks plain http:// addresses. Use an https:// address, or install the debug build made by the GitHub workflow (it allows http:// on your own network).'
    : null;
}

export type BackendCheck =
  | { status: 'compatible' }
  | { status: 'unreachable' | 'network' | 'incompatible'; message: string };

/**
 * Asks the address "are you the StraySafe API?" with GET / (a fixed greeting: no database, no account, nothing is changed and no
 * credentials are sent). Four outcomes besides success, because they need different fixes:
 *   unreachable   no answer within the time limit
 *   network       the connection failed outright: wrong address, server off, phone offline, blocked, or a certificate Android does not trust
 *                 (the app never skips certificate checks; a browser cannot tell these apart, so the message lists them for the address kind)
 *   incompatible  something answered, but it is not the StraySafe API (an error page, a tunnel's warning page, another service)
 */
export async function testBackend(
  url: string,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<BackendCheck> {
  const { fetchImpl = fetch, timeoutMs = TEST_TIMEOUT_MS } = options;
  const secure = url.startsWith('https:');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${url}/`, { signal: controller.signal, cache: 'no-store', credentials: 'omit', headers: { Accept: 'application/json' } });
    if (!res.ok) {
      return { status: 'incompatible', message: `The address answered with an error (HTTP ${res.status}). If it is a tunnel, check that the tunnel and the backend behind it are running.` };
    }
    let body: unknown = null;
    try { body = JSON.parse(await res.text()); } catch { /* not JSON: handled below */ }
    const message = (body as { message?: unknown } | null)?.message;
    if (typeof message === 'string' && /straysafe/i.test(message)) return { status: 'compatible' };
    return { status: 'incompatible', message: 'Something answered at this address, but it is not the StraySafe API (it may be a web page, a tunnel warning page or another service).' };
  } catch (err) {
    if ((err as { name?: string } | null)?.name === 'AbortError') {
      return { status: 'unreachable', message: `No answer within ${Math.round(timeoutMs / 1000)} seconds. Check the address, that the phone has a connection, and that the backend is running.` };
    }
    return {
      status: 'network',
      message: secure
        ? 'Could not open a secure connection. The server or tunnel may be down, the phone may be offline, the HTTPS certificate may not be trusted by Android (self-signed and expired certificates are refused), or the server may be refusing this app.'
        : 'Could not connect. Check the address, that the phone is on the same Wi-Fi as the computer, that the backend was started to accept other devices (uvicorn --host 0.0.0.0) and that the firewall allows the port.',
    };
  } finally {
    clearTimeout(timer);
  }
}

type Reader = Pick<Storage, 'getItem'>;

/** The address saved on this phone, or null. It is validated again here, so a damaged or hand-edited value is ignored, never used. */
export function readDevBackend(store: Reader): string | null {
  try {
    const raw = store.getItem(DEV_BACKEND_KEY);
    if (!raw || !/^https?:\/\//i.test(raw)) return null;   // we always save a full address; typing shorthand ("garbage") is not one
    const parsed = parseBackendUrl(raw);
    return parsed.ok ? parsed.url : null;
  } catch {
    return null;
  }
}

type Wipeable = Pick<Storage, 'length' | 'key' | 'removeItem'>;

/** Removes everything this app stored in the web view (sign-in, refresh token, cached chats, sign-up in progress, flags) except the saved backend address. */
export function wipeDeviceData(local: Wipeable, session: Wipeable): void {
  for (const store of [local, session]) {
    const keys: string[] = [];
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i);
      if (key) keys.push(key);
    }
    for (const key of keys) if (key !== DEV_BACKEND_KEY) store.removeItem(key);
  }
}

/**
 * Switch to another backend: forget the old session and everything stored for the old environment, keep only the new address.
 * The caller reloads afterwards (utils/api.ts reads the address once, when the page loads) and the person signs in again.
 * `signOut` runs first and may do its own clean-up (for example stopping push notifications with the old server); a failure there
 * never stops the switch.
 */
export function switchBackend(url: string, stores: { local: Storage; session: Storage }, signOut?: () => void): void {
  try { signOut?.(); } catch { /* never block the switch */ }
  wipeDeviceData(stores.local, stores.session);
  stores.local.setItem(DEV_BACKEND_KEY, url);
}
