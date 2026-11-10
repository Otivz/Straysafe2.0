// The Android debug app's backend address handling (src/utils/devBackend.ts). Pure logic: no network (fetch is replaced by a stub), no
// browser (storage is replaced by a small in-memory Storage), no database, no Android tooling.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEV_BACKEND_KEY, parseBackendUrl, pageBlocksAddress, readDevBackend, shortBackend, switchBackend, testBackend, wipeDeviceData,
} from '../src/utils/devBackend.ts';

// ---- helpers -------------------------------------------------------------------------------------------------------------------

/** The part of the Web Storage interface the code uses, backed by a Map (what survives an "app restart" is the Map). */
class MemoryStorage {
  constructor(map = new Map()) { this.map = map; }
  get length() { return this.map.size; }
  key(i) { return [...this.map.keys()][i] ?? null; }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
}

const good = (input) => {
  const r = parseBackendUrl(input);
  assert.ok(r.ok, `expected ${JSON.stringify(input)} to be accepted, got: ${r.message}`);
  return r;
};
const refused = (input, pattern) => {
  const r = parseBackendUrl(input);
  assert.equal(r.ok, false, `expected ${JSON.stringify(input)} to be refused`);
  assert.match(r.message, pattern);
};
const json = (body, init = {}) => new Response(JSON.stringify(body), { status: 200, ...init });

// ---- URL normalization and validation ------------------------------------------------------------------------------------------

test('a LAN http address and an https tunnel address are accepted as typed', () => {
  assert.deepEqual(good('http://192.168.1.10:8000'), { ok: true, url: 'http://192.168.1.10:8000', secure: false });
  assert.deepEqual(good('https://example-tunnel.example.com'), { ok: true, url: 'https://example-tunnel.example.com', secure: true });
  assert.equal(good('http://10.0.2.2:8000').url, 'http://10.0.2.2:8000');                       // the Android emulator's name for the computer
  assert.equal(good('http://172.16.5.4:8000').url, 'http://172.16.5.4:8000');
  assert.equal(good('http://100.101.102.103:8000').url, 'http://100.101.102.103:8000');         // a VPN range (Tailscale)
  assert.equal(good('http://my-pc.local:8000').url, 'http://my-pc.local:8000');                 // mDNS name
  assert.equal(good('http://devpc:8000').url, 'http://devpc:8000');                             // one-word name on the network
  assert.equal(good('https://example.org:8443/api').url, 'https://example.org:8443/api');       // port and path prefix
});

test('whitespace, trailing slashes, case and shorthand are normalized', () => {
  assert.equal(good('  https://Example-Tunnel.example.com/  ').url, 'https://example-tunnel.example.com');
  assert.equal(good('http://192.168.1.10:8000///').url, 'http://192.168.1.10:8000');
  assert.equal(good('192.168.1.10').url, 'http://192.168.1.10:8000');                           // bare LAN address: http and the usual port
  assert.equal(good('192.168.1.10:9000').url, 'http://192.168.1.10:9000');                      // an explicit port is kept
  assert.equal(good('example-tunnel.example.com').url, 'https://example-tunnel.example.com');  // bare name: https
  assert.equal(good('HTTP://192.168.1.10:80').url, 'http://192.168.1.10');                      // default port dropped by the URL parser
});

test('localhost and every other name for "this device" are refused, with the reason', () => {
  for (const host of ['localhost', 'LOCALHOST', '127.0.0.1', '127.1.2.3', '0.0.0.0', '[::1]', 'foo.localhost']) {
    refused(`http://${host}:8000`, /means the phone itself/);
    refused(`https://${host}:8000`, /means the phone itself/);
  }
  refused('localhost:8000', /means the phone itself/);
  refused('127.0.0.1', /means the phone itself/);
});

test('plain http is only for the local network: a public host needs https', () => {
  refused('http://example.org', /own network/);
  refused('http://api.example-tunnel.example.com', /own network/);
  refused('http://8.8.8.8:8000', /own network/);
  refused('http://172.32.0.1:8000', /own network/);           // just outside 172.16.0.0/12
  refused('http://100.63.0.1:8000', /own network/);           // just outside 100.64.0.0/10
  refused('http://[fd00::1]:8000', /own network/);
  assert.ok(parseBackendUrl('https://8.8.8.8:8000').ok);      // https is fine for any host
});

test('empty, malformed, non-web, credentials, query and fragment are refused', () => {
  refused('', /Enter the backend address/);
  refused('   ', /Enter the backend address/);
  refused(undefined, /Enter the backend address/);
  refused(null, /Enter the backend address/);
  refused('http://', /not a valid address/);
  refused('https://exa mple.com', /not a valid address/);
  refused('ftp://files.example.org', /Only http:\/\/ and https:\/\//);
  refused('capacitor://localhost', /Only http:\/\/ and https:\/\//);
  refused('javascript://example.org/%0Aalert(1)', /Only http:\/\/ and https:\/\//);
  refused('https://user:secret@api.example.org', /user name or password/);
  refused('https://user@api.example.org', /user name or password/);
  refused('https://api.example.org?key=abc', /after \? or #/);
  refused('https://api.example.org#top', /after \? or #/);
  refused(`https://${'a'.repeat(250)}.example.org`, /too long/);
});

test('shortBackend drops the scheme for display', () => {
  assert.equal(shortBackend('http://192.168.1.10:8000'), '192.168.1.10:8000');
  assert.equal(shortBackend('https://x.example.org/api'), 'x.example.org/api');
});

test('an https page may not call an http address (mixed content), and says so', () => {
  assert.match(pageBlocksAddress('http://192.168.1.10:8000', 'https:'), /blocks plain http/);
  assert.equal(pageBlocksAddress('http://192.168.1.10:8000', 'http:'), null);                  // the debug app is served as http://localhost
  assert.equal(pageBlocksAddress('https://x.example.org', 'https:'), null);
});

// ---- Test Connection ---------------------------------------------------------------------------------------------------------------

test('a StraySafe backend is "compatible": GET / with no credentials, nothing changed', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return json({ message: 'Welcome to StraySafe API' }); };
  assert.deepEqual(await testBackend('http://192.168.1.10:8000', { fetchImpl }), { status: 'compatible' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'http://192.168.1.10:8000/');
  assert.equal(calls[0].init.method, undefined);                 // a plain GET
  assert.equal(calls[0].init.credentials, 'omit');               // no cookies
  assert.equal(calls[0].init.body, undefined);
  assert.deepEqual(Object.keys(calls[0].init.headers), ['Accept']);   // no Authorization, nothing that needs a CORS preflight
});

test('an address with a path prefix is tested at its own root', async () => {
  let asked = '';
  await testBackend('https://example.org/api', { fetchImpl: async (url) => { asked = url; return json({ message: 'Welcome to StraySafe API' }); } });
  assert.equal(asked, 'https://example.org/api/');
});

test('no answer in time is "unreachable"', async () => {
  const fetchImpl = (_url, { signal }) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  });
  const r = await testBackend('http://192.168.1.10:8000', { fetchImpl, timeoutMs: 30 });
  assert.equal(r.status, 'unreachable');
  assert.match(r.message, /No answer within/);
});

test('a failed connection is a "network" problem, worded for the kind of address', async () => {
  const fetchImpl = async () => { throw new TypeError('Failed to fetch'); };
  const lan = await testBackend('http://192.168.1.10:8000', { fetchImpl });
  assert.equal(lan.status, 'network');
  assert.match(lan.message, /same Wi-Fi/);
  assert.match(lan.message, /--host 0\.0\.0\.0/);
  const tls = await testBackend('https://example-tunnel.example.com', { fetchImpl });
  assert.equal(tls.status, 'network');
  assert.match(tls.message, /certificate/);
  assert.doesNotMatch(tls.message, /same Wi-Fi/);
});

test('an answer that is not the StraySafe API is "incompatible"', async () => {
  const cases = [
    new Response('<html>Tunnel warning</html>', { status: 200 }),                  // a warning page
    json({ message: 'Hello from another service' }),
    json({ status: 'ok' }),
    json(['not', 'an', 'object']),
    new Response('null', { status: 200 }),
    new Response('', { status: 200 }),
    new Response('Bad gateway', { status: 502 }),                                  // a tunnel whose backend is down
    new Response('Not found', { status: 404 }),
  ];
  for (const response of cases) {
    const r = await testBackend('https://example-tunnel.example.com', { fetchImpl: async () => response });
    assert.equal(r.status, 'incompatible', `${response.status} should be incompatible`);
    assert.ok(r.message.length > 20);
  }
  const bad = await testBackend('https://x.example.org', { fetchImpl: async () => new Response('x', { status: 502 }) });
  assert.match(bad.message, /HTTP 502/);
});

test('a check never leaks credentials, tokens or database details into its result', async () => {
  const body = { message: 'Welcome to StraySafe API', database_url: 'mysql://root:pw@db', secret: 'x' };
  const r = await testBackend('https://x.example.org', { fetchImpl: async () => json(body) });
  assert.deepEqual(r, { status: 'compatible' });                                 // only the verdict is kept
});

// ---- persistence across an app restart ------------------------------------------------------------------------------------------

test('the saved address survives an app restart and is validated on every read', () => {
  const disk = new Map();                                                         // the web view's storage: outlives the app process
  const first = new MemoryStorage(disk);
  assert.equal(readDevBackend(first), null);                                      // nothing saved yet
  first.setItem(DEV_BACKEND_KEY, 'http://192.168.1.10:8000');
  const afterRestart = new MemoryStorage(disk);                                   // a new process, the same disk
  assert.equal(readDevBackend(afterRestart), 'http://192.168.1.10:8000');
});

test('a damaged or hand-edited saved value is ignored, never used', () => {
  for (const value of ['', 'garbage', 'http://localhost:8000', 'http://evil.example.org', 'javascript:alert(1)', 'https://u:p@x.example.org']) {
    const s = new MemoryStorage();
    s.setItem(DEV_BACKEND_KEY, value);
    assert.equal(readDevBackend(s), null, `${value} must not be used`);
  }
  assert.equal(readDevBackend({ getItem() { throw new Error('storage blocked'); } }), null);
});

// ---- switching backends clears the session and cached data -----------------------------------------------------------------------

const populated = () => {
  const local = new MemoryStorage();
  const session = new MemoryStorage();
  local.setItem(DEV_BACKEND_KEY, 'http://192.168.1.10:8000');
  local.setItem('access_token', 'jwt-old');
  local.setItem('resident_user', JSON.stringify({ user_id: 7, access_token: 'jwt-old', name: 'Ana' }));
  local.setItem('straysafe_app_refresh_token', 'refresh-old');
  local.setItem('straysafe_report_chat_12', '[{"text":"private"}]');
  local.setItem('straysafe_push_opt_in_7', '1');
  local.setItem('straysafe:last_activity', '1234');
  session.setItem('access_token', 'jwt-old');
  session.setItem('staff_user', '{"user_id":1}');
  session.setItem('straysafe_cache_cases', '{"data":[1]}');
  session.setItem('pending_signup', '{"email":"a@b.c"}');
  return { local, session };
};

test('switching backend removes the session, tokens, caches and pending sign-up, and keeps only the new address', () => {
  const { local, session } = populated();
  switchBackend('https://example-tunnel.example.com', { local, session });
  assert.deepEqual([...local.map.entries()], [[DEV_BACKEND_KEY, 'https://example-tunnel.example.com']]);
  assert.equal(session.length, 0);
  assert.equal(readDevBackend(local), 'https://example-tunnel.example.com');
});

test('the sign-out hook runs before the wipe, and a failure in it never blocks the switch', () => {
  const { local, session } = populated();
  const order = [];
  switchBackend('https://example-tunnel.example.com', { local, session }, () => { order.push(['hook', local.getItem('access_token')]); });
  assert.deepEqual(order, [['hook', 'jwt-old']]);                                  // it still saw the old session
  const again = populated();
  switchBackend('https://x.example.org', again, () => { throw new Error('push server unreachable'); });
  assert.equal(again.local.getItem('access_token'), null);
  assert.equal(again.local.getItem(DEV_BACKEND_KEY), 'https://x.example.org');
});

test('wiping alone keeps the saved address and nothing else', () => {
  const { local, session } = populated();
  wipeDeviceData(local, session);
  assert.deepEqual([...local.map.keys()], [DEV_BACKEND_KEY]);
  assert.equal(session.length, 0);
});
