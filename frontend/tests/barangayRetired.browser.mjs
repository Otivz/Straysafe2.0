// Run with Vite on port 5173: node frontend/tests/barangayRetired.browser.mjs
// Subdivision-only Phase 3b: every /brgy address shows the "handled outside StraySafe" page, a stale Barangay session is
// sent there and can sign out, the staff sign-in is for Subdivision Leaders only, and the Admin archive pages still open.
// Isolated Chrome profile and a mocked API; no live data.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const base = process.env.BRGY_TEST_URL || 'http://127.0.0.1:5173';
const chromeBin = process.env.CHROME_BIN || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile = await mkdtemp(join(tmpdir(), 'straysafe-brgy-retired-test-'));
const delay = ms => new Promise(r => setTimeout(r, ms));
const browser = spawn(chromeBin, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-background-networking', 'about:blank'], { windowsHide: true, stdio: 'ignore' });

const DISABLED = 'Barangay accounts are no longer used in StraySafe. The Barangay is contacted outside the system; your Subdivision Leader records its updates.';

let socket;
let command;
try {
    let port;
    for (let i = 0; i < 100; i++) {
        try { port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; } catch { await delay(100); }
    }
    assert(port, 'Chrome debugging port is available');
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new`, { method: 'PUT' })).json();
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { socket.onopen = res; socket.onerror = rej; });
    let nextId = 0;
    const pending = new Map();
    command = (method, params = {}) => new Promise((res, rej) => {
        const id = ++nextId;
        const timer = setTimeout(() => { pending.delete(id); rej(new Error(`CDP timeout: ${method}`)); }, 20000);
        pending.set(id, { resolve: res, reject: rej, timer });
        socket.send(JSON.stringify({ id, method, params }));
    });

    const browserErrors = [];
    let loginAs = 3;
    let sessionRole = 3;
    const json = (body, status = 200) => ({ status, body });
    const answer = (url, method) => {
        const path = url.pathname.replace(/^\/api/, '');
        if (path === '/auth/verify-session') return json({ status: 'valid', role_id: sessionRole, is_verified: true });
        if (path === '/auth/login' && method === 'POST') {
            if (loginAs === 3) return json({ detail: DISABLED }, 403);
            return json({ user_id: 2, name: 'Leader Santos', email: 'leader@example.com', role_id: 2, subdivision_id: 1, access_token: 'test.e30.test' });
        }
        return json([]);
    };
    const intercept = async ({ requestId, request }) => {
        const url = new URL(request.url);
        const external = !url.pathname.startsWith('/api/');
        const { status, body } = external ? json({}) : answer(url, request.method);
        await command('Fetch.fulfillRequest', { requestId, responseCode: status, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
            body: Buffer.from(JSON.stringify(body)).toString('base64') });
    };
    socket.onmessage = event => {
        const message = JSON.parse(event.data);
        if (message.id) {
            const task = pending.get(message.id);
            if (!task) return;
            clearTimeout(task.timer); pending.delete(message.id);
            message.error ? task.reject(new Error(JSON.stringify(message.error))) : task.resolve(message.result);
        } else if (message.method === 'Fetch.requestPaused') intercept(message.params).catch(error => browserErrors.push(error.message));
        else if (message.method === 'Runtime.exceptionThrown') browserErrors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    };
    await command('Page.enable');
    await command('Runtime.enable');
    await command('Fetch.enable', { patterns: [{ urlPattern: '*://*/api/*' }, { urlPattern: '*tile.openstreetmap.org*' }, { urlPattern: '*basemaps.cartocdn.com*' }] });
    const evaluate = async expression => {
        const response = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
        return response.result.value;
    };
    const waitFor = async (expression, label) => {
        for (let i = 0; i < 200; i++) { if (await evaluate(expression)) return; await delay(100); }
        throw new Error(`Timed out: ${label}; at ${await evaluate('location.pathname')}; errors: ${browserErrors.join('; ')}`);
    };
    const go = async path => { await command('Page.navigate', { url: base + path }); await delay(300); };
    const INFO = `document.body.innerText.includes('The Barangay is handled outside StraySafe')`;
    const clearStorage = () => evaluate(`(localStorage.clear(), sessionStorage.clear(), true)`);
    await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });

    // 1. Old Barangay addresses, signed out
    await go('/');
    await clearStorage();
    for (const path of ['/brgy', '/brgy/dashboard', '/brgy/reports/5', '/brgy/adoptions', '/brgy/pet/1/qr', '/brgy/adopt/journey']) {
        await go(path);
        await waitFor(INFO, `${path} information page`);
    }
    assert.equal(await evaluate(`[...document.querySelectorAll('a')].some(a => a.textContent.includes('Subdivision Leader sign-in') && a.getAttribute('href') === '/staff/login')`), true, 'sign-in link for leaders');
    assert.equal(await evaluate(`document.documentElement.scrollWidth <= window.innerWidth + 1`), true, 'no horizontal scroll at 390px');
    console.log('PASS /brgy, /brgy/dashboard, /brgy/reports/5, /brgy/adoptions, /brgy/pet/1/qr, /brgy/adopt/journey show the information page');

    // 2. A stale Barangay session is sent to the information page and can sign out
    await evaluate(`(localStorage.setItem('staff_user', JSON.stringify({ user_id: 4, name: 'Head Reyes', role_id: 3, access_token: 'test.e30.test' })), localStorage.setItem('access_token', 'test.e30.test'), true)`);
    sessionRole = 3;
    await go('/subd/dashboard');
    await waitFor(`location.pathname === '/brgy'`, 'stale Barangay session redirected');
    await waitFor(INFO, 'information page for the stale session');
    await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Sign out').click()`);
    await waitFor(`location.pathname === '/'`, 'signed out to home');
    assert.equal(await evaluate(`localStorage.getItem('staff_user')`), null, 'Barangay session cleared');
    console.log('PASS a stale Barangay session lands on the information page and "Sign out" clears it');

    // 3. Staff sign-in: Barangay refused with the server's message; a leader gets in
    const login = async () => {
        await go('/staff/login');
        await waitFor(`!!document.querySelector('input[type=email]') && !!document.querySelector('input[type=password]')`, 'staff sign-in form');
        await evaluate(`(() => { const set = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
            set(document.querySelector('input[type=email]'), 'someone@example.com'); set(document.querySelector('input[type=password]'), 'Password-123'); document.querySelector('form').requestSubmit(); return true; })()`);
    };
    const page = await evaluate(`document.body.innerText`);
    loginAs = 3;
    await login();
    await waitFor(`document.body.innerText.includes(${JSON.stringify(DISABLED)})`, 'Barangay sign-in refused');
    assert.equal(await evaluate(`location.pathname`), '/staff/login', 'stays on sign-in');
    assert.equal(/Barangay Staff/.test(await evaluate(`document.body.innerText`)), false, 'sign-in page no longer mentions Barangay Staff');
    loginAs = 2;
    sessionRole = 2;
    await login();
    await waitFor(`location.pathname === '/subd/dashboard'`, 'leader signed in');
    console.log('PASS staff sign-in: Barangay account refused with the server message; Subdivision Leader signs in');
    void page;

    // 4. Admin archive pages still open for the Administrator (made read-only in part 3c)
    await clearStorage();
    sessionRole = 4;
    await evaluate(`(localStorage.setItem('admin_user', JSON.stringify({ user_id: 9, name: 'Admin Reyes', role_id: 4, access_token: 'test.e30.test' })), true)`);
    for (const path of ['/admin/adoptions', '/admin/holding-facility']) {
        await go(path);
        await delay(1500);
        assert.equal(await evaluate(`location.pathname`), path, `${path} stays`);
        assert.equal(await evaluate(INFO), false, `${path} is not the information page`);
    }
    console.log('PASS /admin/adoptions and /admin/holding-facility still open for the Administrator');

    assert.equal(browserErrors.length, 0, browserErrors.join('\n'));
    console.log('PASS no uncaught browser errors; all API calls mocked');
} finally {
    if (command) { try { await command('Browser.close'); } catch {} }
    socket?.close();
    browser.kill();
    const resolvedProfile = resolve(profile);
    if (resolvedProfile.startsWith(resolve(tmpdir()) + '\\straysafe-brgy-retired-test-')) {
        await rm(resolvedProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
    }
}
