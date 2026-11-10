// The Connection Settings screen (src/resident/devConnection/ConnectionPage.tsx) rendered to HTML on the server side by React, in the
// Android DEBUG mode. A render check only: it shows the screen builds without errors and says the right things for the three starting
// situations. Taps, typing and the confirmation sheet are NOT exercised here (that needs a browser or a phone); the logic behind them is
// covered by devBackend.test.mjs. No browser, no network, no backend, no database.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';
import { DEV_BACKEND_KEY } from '../src/utils/devBackend.ts';

const frontendDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scratch = await mkdtemp(join(tmpdir(), 'straysafe-page-render-'));
after(() => rm(scratch, { recursive: true, force: true }));

class MemoryStorage {
  constructor(entries = {}) { this.map = new Map(Object.entries(entries)); }
  get length() { return this.map.size; }
  key(i) { return [...this.map.keys()][i] ?? null; }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
}

async function render({ buildUrl, stored = {}, firstRun = false }) {
  if (buildUrl === undefined) delete process.env.VITE_API_BASE_URL; else process.env.VITE_API_BASE_URL = buildUrl;
  globalThis.localStorage = new MemoryStorage(stored);
  globalThis.sessionStorage = new MemoryStorage();
  globalThis.window = { location: { pathname: '/resident-app/connection', protocol: 'http:' }, dispatchEvent() {}, addEventListener() {}, removeEventListener() {} };
  const server = await createServer({
    root: frontendDir, configFile: false, mode: 'android-debug', envDir: scratch, cacheDir: join(scratch, '.vite'), logLevel: 'silent', appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, watch: null },
  });
  try {
    const page = (await server.ssrLoadModule('/src/resident/devConnection/ConnectionPage.tsx')).default;
    return renderToString(createElement(MemoryRouter, null, createElement(page, { firstRun })));
  } finally { await server.close(); }
}

test('with a saved address: shows it, where it came from, the address field and both actions', async () => {
  const html = await render({ buildUrl: 'https://built-in.example.org', stored: { [DEV_BACKEND_KEY]: 'http://192.168.1.10:8000' } });
  for (const text of ['Connection settings', '192.168.1.10:8000', 'Saved on this phone', 'Backend API address', 'Test connection', 'Save &amp; connect', 'Debug build', 'localhost']) {
    assert.ok(html.includes(text), `missing: ${text}`);
  }
  assert.ok(html.includes('value="http://192.168.1.10:8000"'), 'the field starts with the current address');
  assert.ok(!html.includes('Save anyway'), '"Save anyway" appears only after a failed check');
  assert.ok(!html.includes('Switch backend?'), 'the confirmation appears only after Save & connect');
});

test('with only the built-in address: says it is built in', async () => {
  const html = await render({ buildUrl: 'https://built-in.example.org' });
  assert.ok(html.includes('built-in.example.org'));
  assert.ok(html.includes('Built into this app'));
  assert.ok(!html.includes('Saved on this phone'));
});

test('first launch with no address at all: asks for one, with an empty field and no back button', async () => {
  const html = await render({ buildUrl: undefined, firstRun: true });
  for (const text of ['Connect to a backend', 'No backend set', 'Enter an address below to start', 'Backend API address']) {
    assert.ok(html.includes(text), `missing: ${text}`);
  }
  assert.ok(html.includes('value=""'));
  assert.ok(!html.includes('aria-label="Back"'), 'nothing to go back to before the first address is set');
});
