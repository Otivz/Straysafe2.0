// The REAL shared API client (src/utils/api.ts) loaded by Vite in each build mode, with fake storage and a stub network adapter.
// Shows which backend every request goes to: the sign-in screens' API_BASE_URL, the shared `api` client, the token refresh and the
// sign-out. No browser, no real network (every request is answered by the stub), no backend, no database, no Android tooling.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import axios from 'axios';
import { createServer } from 'vite';
import { DEV_BACKEND_KEY } from '../src/utils/devBackend.ts';

const frontendDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scratch = await mkdtemp(join(tmpdir(), 'straysafe-api-mode-'));
after(() => rm(scratch, { recursive: true, force: true }));

class MemoryStorage {
  constructor(entries = {}) { this.map = new Map(Object.entries(entries)); }
  get length() { return this.map.size; }
  key(i) { return [...this.map.keys()][i] ?? null; }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
}

/**
 * Loads api.ts as Vite would for `vite build --mode <mode>`: `import.meta.env.MODE` and VITE_API_BASE_URL come from the mode and from
 * the environment, and the page's storage holds `stored`. A scratch folder stands in for the repository's .env (never read here).
 */
async function loadApi(mode, { buildUrl, stored = {}, pathname = '/resident-app/home', production = false }) {
  if (buildUrl === undefined) delete process.env.VITE_API_BASE_URL; else process.env.VITE_API_BASE_URL = buildUrl;
  globalThis.localStorage = new MemoryStorage(stored);
  globalThis.sessionStorage = new MemoryStorage();
  globalThis.window = { location: { pathname, protocol: 'http:' }, dispatchEvent() {}, addEventListener() {}, removeEventListener() {} };
  const server = await createServer({
    root: frontendDir, configFile: false, mode, envDir: scratch, cacheDir: join(scratch, '.vite'), logLevel: 'silent', appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] },
    // a dev server always says DEV: a production web build says not-DEV, as `vite build` does
    ...(production ? { define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true' } } : {}),
    server: { middlewareMode: true, hmr: false, watch: null },
  });
  try {
    return { mod: await server.ssrLoadModule('/src/utils/api.ts'), server };
  } catch (err) {
    await server.close();
    throw err;
  }
}

/** Answers every request itself and records the absolute address each one was sent to. */
function stubNetwork(api) {
  const seen = [];
  const adapter = async (config) => {
    const relative = !/^https?:\/\//i.test(String(config.url));
    const full = relative ? `${String(config.baseURL ?? '').replace(/\/+$/, '')}/${String(config.url).replace(/^\/+/, '')}` : String(config.url);
    seen.push(`${(config.method || 'get').toUpperCase()} ${full}`);
    const respond = (status, data) => ({ data, status, statusText: String(status), headers: {}, config, request: {} });
    const bearer = String(config.headers?.Authorization ?? config.headers?.get?.('Authorization') ?? '');
    if (full.endsWith('/auth/refresh')) return respond(200, { access_token: 'new-token' });
    if (full.endsWith('/needs-refresh') && bearer !== 'Bearer new-token') {
      throw new axios.AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, {}, respond(401, { detail: 'expired' }));
    }
    return respond(200, {});
  };
  api.defaults.adapter = adapter;
  axios.defaults.adapter = adapter;
  return seen;
}

const SIGNED_IN = { resident_user: JSON.stringify({ user_id: 7, access_token: 'old-token' }), access_token: 'old-token' };

test('debug build: every request goes to the address saved on the phone (sign-in, uploads, pets, notices, cases, claims, notifications, refresh, logout)', async () => {
  const saved = 'http://192.168.1.10:8000';
  const { mod, server } = await loadApi('android-debug', { buildUrl: 'https://built-in-default.example.org', stored: { ...SIGNED_IN, [DEV_BACKEND_KEY]: saved } });
  try {
    assert.equal(mod.API_BASE_URL, saved);                                  // what the sign-in screens, push and avatars use
    assert.equal(mod.api.defaults.baseURL, saved);                          // the shared client
    const seen = stubNetwork(mod.api);
    await mod.api.post('/auth/login', { identifier: 'a', password: 'b' });
    await mod.api.post('/auth/verify-otp', { code: '123456' });
    await mod.api.post('/reports/', { x: 1 });
    await mod.api.post('/reports/12/media', new FormData());
    await mod.api.get('/pets/');
    await mod.api.get('/lost-pet-alerts/all');
    await mod.api.get('/cases/summaries');
    await mod.api.post('/reports/12/ownership-claims', {});
    await mod.api.get('/notifications/me');
    await mod.api.get('/needs-refresh');                                    // 401 -> POST /auth/refresh -> retried: the whole refresh path
    await mod.logoutUser();                                                 // POST /auth/logout
    assert.ok(seen.length >= 12, `expected the whole sequence, saw ${seen.length}`);
    assert.ok(seen.some((r) => r.endsWith('/auth/refresh')), 'the token refresh happened');
    assert.ok(seen.some((r) => r.endsWith('/auth/logout')), 'the sign-out happened');
    for (const request of seen) assert.ok(request.includes(` ${saved}/`), `${request} did not go to ${saved}`);
  } finally { await server.close(); }
});

test('debug build: with nothing saved it uses the optional built-in address, and with neither it has no address at all (so it opens Connection Settings)', async () => {
  const withDefault = await loadApi('android-debug', { buildUrl: 'https://built-in-default.example.org' });
  try { assert.equal(withDefault.mod.API_BASE_URL, 'https://built-in-default.example.org'); } finally { await withDefault.server.close(); }
  const neither = await loadApi('android-debug', { buildUrl: undefined });
  try {
    assert.equal(neither.mod.API_BASE_URL, '');                             // no localhost fallback, no dev-only /api path
    assert.equal(neither.mod.api.defaults.baseURL, '');
  } finally { await neither.server.close(); }
});

test('debug build: a damaged or hand-edited saved address is ignored, never used', async () => {
  for (const bad of ['http://localhost:8000', 'garbage', 'ftp://x.example.org', 'http://public.example.org']) {
    const { mod, server } = await loadApi('android-debug', { buildUrl: 'https://built-in-default.example.org', stored: { [DEV_BACKEND_KEY]: bad } });
    try { assert.equal(mod.API_BASE_URL, 'https://built-in-default.example.org', bad); } finally { await server.close(); }
  }
});

test('release-style Android build: the saved address is NOT read (no dev connection settings), only the fixed built-in HTTPS address is used', async () => {
  const { mod, server } = await loadApi('android', { buildUrl: 'https://api.straysafe.example', stored: { ...SIGNED_IN, [DEV_BACKEND_KEY]: 'http://192.168.1.10:8000' } });
  try {
    assert.equal(mod.API_BASE_URL, 'https://api.straysafe.example');
    const seen = stubNetwork(mod.api);
    await mod.api.get('/pets/');
    await mod.api.get('/needs-refresh');
    for (const request of seen) assert.ok(request.includes(' https://api.straysafe.example/'), request);
  } finally { await server.close(); }
});

test('web builds are unchanged by the Android settings: production uses its configured address, development the same-origin /api path', async () => {
  const prod = await loadApi('production', { production: true, buildUrl: 'https://web.straysafe.example', stored: { [DEV_BACKEND_KEY]: 'http://192.168.1.10:8000' } });
  try { assert.equal(prod.mod.API_BASE_URL, 'https://web.straysafe.example'); } finally { await prod.server.close(); }
  const dev = await loadApi('development', { buildUrl: 'https://web.straysafe.example', stored: { [DEV_BACKEND_KEY]: 'http://192.168.1.10:8000' } });
  try { assert.equal(dev.mod.API_BASE_URL, '/api'); } finally { await dev.server.close(); }
  const bare = await loadApi('production', { production: true, buildUrl: undefined });
  try { assert.equal(bare.mod.API_BASE_URL, 'http://localhost:8000'); } finally { await bare.server.close(); }   // the web build's old fallback, untouched
});
