// Analytics page (docs/01-system/ANALYTICS_RULES.md). Run with local Vite:
// ANALYTICS_TEST_URL defaults to http://127.0.0.1:5175. The fixture answers all API requests in memory with synthetic
// data; this runner also blocks backend and external requests.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const base = process.env.ANALYTICS_TEST_URL || 'http://127.0.0.1:5175';
const chrome = process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const profilePrefix = join(tmpdir(), 'straysafe-analytics-');
const profile = await mkdtemp(profilePrefix);
const browser = spawn(chrome, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-background-networking', 'about:blank'],
{ windowsHide: true, stdio: 'ignore' });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
try {
    let port;
    for (let i = 0; i < 100; i++) {
        try { port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; }
        catch { await pause(100); }
    }
    assert(port, 'Chrome debugging port available');
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new`, { method: 'PUT' })).json();
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let id = 0;
    const pending = new Map();
    const errors = [];
    const backendAttempts = [];
    const command = (method, params = {}) => new Promise((resolve, reject) => {
        const requestId = ++id;
        const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(`${method} timed out`)); }, 20000);
        pending.set(requestId, { resolve, reject, timer });
        socket.send(JSON.stringify({ id: requestId, method, params }));
    });
    socket.onmessage = async event => {
        const message = JSON.parse(event.data);
        if (message.id) {
            const task = pending.get(message.id);
            if (task) {
                clearTimeout(task.timer); pending.delete(message.id);
                if (message.error) task.reject(new Error(message.error.message)); else task.resolve(message.result);
            }
        } else if (message.method === 'Runtime.exceptionThrown') {
            errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
        } else if (message.method === 'Fetch.requestPaused') {
            const request = message.params;
            const url = new URL(request.request.url);
            const backend = url.pathname.startsWith('/api/');
            if (backend) backendAttempts.push(url.pathname);
            const block = backend || url.origin !== new URL(base).origin;
            await command(block ? 'Fetch.failRequest' : 'Fetch.continueRequest',
                block ? { requestId: request.requestId, errorReason: 'BlockedByClient' } : { requestId: request.requestId });
        }
    };
    await command('Page.enable'); await command('Runtime.enable');
    await command('Fetch.enable', { patterns: [{ urlPattern: 'http*://*/*', requestStage: 'Request' }] });
    const evaluate = async expression => {
        const response = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
        return response.result.value;
    };
    const waitFor = async (expression, label) => {
        for (let i = 0; i < 150; i++) { if (await evaluate(expression)) return; await pause(100); }
        throw new Error(`${label}: ${JSON.stringify(errors)}; ${await evaluate('document.body.innerText.slice(0, 600)')}`);
    };
    const click = async expression => assert(await evaluate(`(() => { const e = ${expression}; if (!e) return false; e.click(); return true; })()`), expression);
    const button = text => `[...document.querySelectorAll('button')].find(e => e.textContent.trim() === ${JSON.stringify(text)})`;
    // React-controlled inputs: set through the native setter so React sees the change
    const type = async (label, value) => assert(await evaluate(`(() => {
        const e = document.querySelector(${JSON.stringify(`[aria-label="${label}"]`)}); if (!e) return false;
        const proto = e.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(e, ${JSON.stringify(value)});
        e.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`), label);
    const text = () => evaluate('document.body.textContent');
    const disabled = label => evaluate(`${button(label)}?.disabled === true`);
    const lastSettled = () => evaluate('window.feeSettled[window.feeSettled.length - 1]');
    const posted = () => evaluate('window.feeRequests.find(r => r.method === "post")?.body ?? null');

    let scenarios = 0;
    for (const width of [390, 1280]) {
        await command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
        const navigate = async query => {
            errors.length = 0;
            await command('Page.navigate', { url: `${base}/tests/fixtures/analytics.html?${query}` });
            await waitFor('document.body.textContent.includes("Incidents filed") || !!document.querySelector("[role=alert]")', query);
            await pause(300);
            assert.deepEqual(errors, [], query);
        };
        const overflow = () => evaluate('document.querySelector(".analytics-content").scrollWidth > document.querySelector(".analytics-content").clientWidth + 2');

        // Admin: operations KPIs, status groups, locations, observations, rescues, claims, admin-only sections
        await navigate('mode=admin');
        for (const t of ['Municipal analytics', 'Rescue requests', 'In Barangay custody now', 'Available for adoption now', 'Successful adoptions',
            'Report status', 'Most frequent locations', 'Gate 1', 'Under observation now', 'Report → rescue started', 'Claims filed in this period', 'AI MATCH REVIEWS']) {
            assert((await text()).includes(t), `admin shows ${t}`);
        }
        assert(!(await text()).includes('Barangay analytics'), 'no Barangay analytics');
        assert.equal(await overflow(), false, 'no horizontal overflow');
        await click('[...document.querySelectorAll("button")].find(b => b.textContent.trim() === "Endorsed to Barangay")');
        await waitFor('window.analyticsRequests.some(r => r.status === "endorsed")', 'status filter request');
        await evaluate('(() => { const s = [...document.querySelectorAll("select")].find(x => [...x.options].some(o => o.value === "week")); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set; set.call(s, "week"); s.dispatchEvent(new Event("change", { bubbles: true })); })()');
        await waitFor('window.analyticsRequests.some(r => r.start_date && r.end_date && !r.days)', 'this-week preset sends dates');
        const req = await evaluate('window.analyticsRequests.filter(r => r.start_date).at(-1)');
        assert.equal(new Date(req.start_date + 'T12:00:00Z').getUTCDay(), 1, 'week starts on Monday');
        scenarios++;

        // Subdivision: no operations sections
        await navigate('mode=subdivision');
        assert((await text()).includes('Community analytics') && (await text()).includes('Report status') && (await text()).includes('Owner observations'), 'subdivision sections');
        assert(!(await text()).includes('In Barangay custody now') && !(await text()).includes('Claims filed in this period'), 'subdivision has no operations sections');
        scenarios++;

        // Empty data: honest empty states, no fabricated numbers
        await navigate('mode=admin&empty');
        assert((await text()).includes('No incidents match these filters') && (await text()).includes('No location recorded'), 'empty states');
        scenarios++;

        // Error then retry
        await navigate('mode=admin&fail');
        await waitFor('document.body.textContent.includes("synthetic failure")', 'error shown');
        assert.equal(await evaluate('document.body.textContent.includes("Incidents filed")'), false, 'no made-up figures on error');
        await click('[...document.querySelectorAll("button")].find(b => b.textContent.trim() === "Retry")');
        await waitFor('document.body.textContent.includes("Incidents filed") && !document.body.textContent.includes("synthetic failure")', 'retry loads data');
        scenarios++;
    }
    assert.deepEqual(backendAttempts, [], 'no backend requests');
    console.log(JSON.stringify({ result: 'PASS', scenarios, widths: [390, 1280], backendRequests: 0 }));
} finally {
    socket?.close(); browser.kill(); await pause(500);
    assert(profile.startsWith(profilePrefix));
    await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
}
