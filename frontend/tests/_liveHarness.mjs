// Shared plumbing for the browser tests of the connected interfaces (liveInterfaces.browser.mjs).
//
// It starts three things and tears them all down again:
//   1. the REAL backend code on a throwaway SQLite file (backend/tests/e2e_server.py): never app.main, never the configured
//      MySQL database, never port 8000;
//   2. a Vite dev server on its own port whose /api proxy points at (1) through STRAYSAFE_API_TARGET;
//   3. a headless Chrome with an isolated profile, driven over the DevTools protocol.
// Nothing here talks to anything outside this machine.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const frontendDir = resolve(here, '..');
export const backendDir = resolve(here, '..', '..', 'backend');
export const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const PYTHON = process.env.PYTHON || 'python';
const CHROME = process.env.CHROME_BIN || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function until(check, what, timeoutMs = 60000, stepMs = 200) {
  const end = Date.now() + timeoutMs;
  let last;
  while (Date.now() < end) {
    try { const v = await check(); if (v) return v; } catch (e) { last = e; }
    await delay(stepMs);
  }
  throw new Error(`Timed out waiting for ${what}${last ? `: ${last.message}` : ''}`);
}

/** Starts the isolated API and the Vite dev server. Returns their addresses and a stop() that kills both. */
export async function startStack({ apiPort = 8780, webPort = 5190 } = {}) {
  const children = [];
  const api = spawn(PYTHON, ['tests/e2e_server.py'], { cwd: backendDir, env: { ...process.env, E2E_API_PORT: String(apiPort), PYTHONIOENCODING: 'utf-8' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let apiLog = '';
  api.stdout.on('data', (d) => { apiLog += d; });
  api.stderr.on('data', (d) => { apiLog += d; });
  children.push(api);
  const apiUrl = `http://127.0.0.1:${apiPort}`;
  await until(async () => (await fetch(`${apiUrl}/__e2e/ids`)).ok, `the isolated API (${apiLog.slice(-400)})`, 90000);

  const web = spawn(process.execPath, [join(frontendDir, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(webPort), '--strictPort', '--host', '127.0.0.1'],
    { cwd: frontendDir, env: { ...process.env, STRAYSAFE_API_TARGET: apiUrl }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let webLog = '';
  web.stdout.on('data', (d) => { webLog += d; });
  web.stderr.on('data', (d) => { webLog += d; });
  children.push(web);
  const webUrl = `http://127.0.0.1:${webPort}`;
  await until(async () => (await fetch(`${webUrl}/`)).ok, `the Vite dev server (${webLog.slice(-400)})`, 90000);

  const stop = async () => {
    for (const c of children) { try { c.kill(); } catch { /* already gone */ } }
    if (process.platform === 'win32') for (const c of children) { try { spawn('taskkill', ['/pid', String(c.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); } catch { /* ignore */ } }
  };
  return { apiUrl, webUrl, stop };
}

/** A headless Chrome with an isolated profile. */
export async function openBrowser(webUrl) {
  const profile = await mkdtemp(join(tmpdir(), 'straysafe-live-test-'));
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--window-size=1280,900', 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  const port = await until(async () => Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]), 'Chrome');
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new`, { method: 'PUT' })).json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { socket.onopen = res; socket.onerror = rej; });
  let nextId = 0;
  const pending = new Map();
  const errors = [];
  const requests = [];           // every URL the page asked for, in order (to prove what the screens actually read from the server)
  const command = (method, params = {}) => new Promise((res, rej) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); rej(new Error(`CDP timeout: ${method}`)); }, 30000);
    pending.set(id, { res, rej, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
  socket.onmessage = (event) => {
    const m = JSON.parse(event.data);
    if (m.id) {
      const t = pending.get(m.id);
      if (!t) return;
      clearTimeout(t.timer); pending.delete(m.id);
      m.error ? t.rej(new Error(JSON.stringify(m.error))) : t.res(m.result);
    } else if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    else if (m.method === 'Network.requestWillBeSent') requests.push(m.params.request.url);
  };
  await command('Page.enable');
  await command('Runtime.enable');
  await command('Network.enable');
  await command('Emulation.setTimezoneOverride', { timezoneId: 'Asia/Manila' });

  const evaluate = async (expression) => {
    const r = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const waitFor = (expression, what, timeoutMs = 20000) => until(() => evaluate(expression), what, timeoutMs, 150);

  /** Calls `fn` until it answers true (a form that has not rendered yet is not a failure), for at most `ms`. */
  const retryUntil = async (fn, ms) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await delay(150); } return false; };

  const page = {
    errors,
    requests,
    command,
    evaluate,
    waitFor,
    async goto(path) { await command('Page.navigate', { url: `${webUrl}${path}` }); await delay(250); await waitFor('document.readyState === "complete"', `${path} to load`); },
    text: () => evaluate('document.body.innerText'),
    async waitText(text, timeoutMs = 20000) { await waitFor(`document.body.innerText.includes(${JSON.stringify(text)})`, `the text “${text}”`, timeoutMs); },
    async gone(text, timeoutMs = 20000) { await waitFor(`!document.body.innerText.includes(${JSON.stringify(text)})`, `“${text}” to go away`, timeoutMs); },
    path: () => evaluate('location.pathname + location.search'),
    /** Types into the control a <label> points at (React-controlled inputs need the native setter and an input event). */
    async fill(label, value, { within = 'document' } = {}) {
      const ok = await retryUntil(() => evaluate(`(() => {
        const root = ${within};
        const want = ${JSON.stringify(label.toLowerCase())};
        const labels = [...root.querySelectorAll('label')].filter((l) => l.innerText.replace(/\\s+/g, ' ').trim().toLowerCase().startsWith(want));
        // a control with no <label> (a search box) is found by its aria-label
        const named = [...root.querySelectorAll('input[aria-label],textarea[aria-label]')].filter((e) => (e.getAttribute('aria-label') || '').toLowerCase().startsWith(want));
        for (const l of [...labels, ...named.map((e) => ({ control: e }))]) {
          const el = l.control || (l.htmlFor && document.getElementById(l.htmlFor)) || l.querySelector('input,textarea,select');
          if (!el) continue;
          const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)});
          el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
          return true;
        }
        return false;
      })()`), 8000);
      assert(ok, `a field labelled “${label}”`);
    },
    /** Selects the option of a <select> whose text starts with `optionText`. */
    async choose(label, optionText) {
      // Several labels can start with the same words ("Confirmed owner" also starts the radio "Confirmed ownership is…"), so every
      // matching label is tried until one of them points at a <select> that has the option.
      const ok = await retryUntil(() => evaluate(`(() => {
        const labels = [...document.querySelectorAll('label')].filter((x) => x.innerText.replace(/\\s+/g, ' ').trim().toLowerCase().startsWith(${JSON.stringify(label.toLowerCase())}));
        for (const l of labels) {
          const el = (l.htmlFor && document.getElementById(l.htmlFor)) || l.querySelector('select');
          if (!el || el.tagName !== 'SELECT') continue;
          const opt = [...el.options].find((o) => o.text.trim().toLowerCase().startsWith(${JSON.stringify(optionText.toLowerCase())}));
          if (!opt) continue;
          Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, opt.value);
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
        return false;
      })()`), 8000);
      assert(ok, `option “${optionText}” in “${label}”`);
    },
    /** Clicks the first visible control (button, link, label, tab, list item) whose text matches, waiting for it to appear. */
    async click(text, { selector = 'button, a, label, [role=tab], [role=menuitem], [role=radio], summary', exact = false, contains = false, within = 'document', timeoutMs = 10000 } = {}) {
      // `contains` is for cards whose text starts with a kicker ("Found animal") before the title being looked for.
      const expression = `(() => {
        const norm = (s) => s.replace(/\\s+/g, ' ').trim().toLowerCase();
        const want = ${JSON.stringify(text.toLowerCase())};
        const els = [...${within}.querySelectorAll(${JSON.stringify(selector)})].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !e.disabled; });
        const el = els.find((e) => ${exact ? 'norm(e.innerText || e.getAttribute("aria-label") || "") === want' : contains ? 'norm(e.innerText || "").includes(want)' : '(norm(e.innerText || "").startsWith(want) || norm(e.getAttribute("aria-label") || "").startsWith(want))'});
        if (!el) return false;
        el.scrollIntoView({ block: 'center' });
        el.click();
        return true;
      })()`;
      const end = Date.now() + timeoutMs;
      while (Date.now() < end) { if (await evaluate(expression)) return; await delay(150); }
      assert.fail(`a control reading “${text}”`);
    },
    /** True when a visible control with this text exists. */
    has: (text, selector = 'button, a, label, [role=tab]') => evaluate(`[...document.querySelectorAll(${JSON.stringify(selector)})].some((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (e.innerText || '').replace(/\\s+/g, ' ').trim().toLowerCase().startsWith(${JSON.stringify(text.toLowerCase())}); })`),
    async clearSession() { await evaluate('sessionStorage.clear(); localStorage.clear(); true'); await command('Network.clearBrowserCookies'); },
    async offline(on) { await command('Network.emulateNetworkConditions', { offline: on, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }); },
  };

  const close = async () => {
    try { socket.close(); } catch { /* ignore */ }
    try { chrome.kill(); } catch { /* ignore */ }
    await delay(500);
    await rm(profile, { recursive: true, force: true }).catch(() => undefined);
  };
  return { page, close };
}

/** Sign in against the isolated API directly (to check what the screens saved, and to read what a screen cannot show). */
export async function apiLogin(apiUrl, email, password) {
  const res = await fetch(`${apiUrl}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  assert(res.ok, `API login for ${email}: ${res.status}`);
  const data = await res.json();
  const call = async (method, path, body) => {
    const r = await fetch(`${apiUrl}${path}`, { method, headers: { Authorization: `Bearer ${data.access_token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await r.text();
    return { status: r.status, body: text ? JSON.parse(text) : null };
  };
  return { user: data, get: (p) => call('GET', p), post: (p, b) => call('POST', p, b ?? {}), put: (p, b) => call('PUT', p, b ?? {}) };
}

export const PASSWORD = 'Test#Pass2026xx';
export const ACCOUNTS = { leader: 'leader@e2e-straysafe.com', resident: 'rita@e2e-straysafe.com', owner: 'owen@e2e-straysafe.com', admin: 'admin@e2e-straysafe.com' };
