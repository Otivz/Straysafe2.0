// Run with Vite on port 5173: node frontend/tests/holdingStayLimit.browser.mjs
// The Barangay's holding stay limit comes from the server (GET /holding/stay-limit), not the browser:
// - Holding Facility: regular staff see "N of 7 days held · available on <date>"; the Head Officer must give a reason
//   to promote early, and the reason is sent (no browser stay number is sent).
// - Barangay Settings: only the Head Officer / an Administrator can change it; saving sends PUT /holding/stay-limit.
// Uses an isolated Chrome profile and a mocked API; no live data is read or changed.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const base = process.env.STAY_LIMIT_TEST_URL || 'http://127.0.0.1:5173';
const chromeBin = process.env.CHROME_BIN || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile = await mkdtemp(join(tmpdir(), 'straysafe-stay-limit-test-'));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const browser = spawn(chromeBin, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-background-networking', 'about:blank'], { windowsHide: true, stdio: 'ignore' });

const twoDaysAgo = new Date(Date.now() - 2 * 86400000 - 3600000).toISOString();
const ANIMAL = {
    holding_id: 1, report_id: 10, rescue_id: null, facility_id: 5, facility_name: 'Barangay Shelter', facility_type: 'barangay',
    subdivision_id: 1, barangay_id: 1, animal_type: 'Dog', animal_name: 'Brownie', breed: 'Aspin', color: 'Brown', estimated_size: 'Medium',
    facility_status: 2, facility_status_name: 'Healthy', kennel_slot: 'K1', medical_notes: null, intake_date: twoDaysAgo,
    facility_intake_date: twoDaysAgo, discharge_date: null, intake_staff_name: 'Staff Cruz', report_landmark: 'Phase 1 Gate',
    report_category: 'Roaming Animal', adoption_eligible: true, timeline: [], media: [],
};
const availableOn = new Date(Date.parse(twoDaysAgo) + 7 * 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

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
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let nextId = 0;
    const pending = new Map();
    command = (method, params = {}) => new Promise((resolve, reject) => {
        const id = ++nextId;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 20000);
        pending.set(id, { resolve, reject, timer });
        socket.send(JSON.stringify({ id, method, params }));
    });

    let head = false;
    const sent = [];
    const browserErrors = [];
    const answer = (url, method, body) => {
        const path = url.pathname.replace(/^\/api/, '');
        if (path === '/auth/verify-session') return [200, { status: 'valid', role_id: 3, is_verified: true }];
        if (path === '/holding/stay-limit' && method === 'GET') return [200, { days: 7, default_days: 7, max_days: 90, is_default: false,
            updated_at: '2026-11-03T08:00:00', updated_by_name: 'Head Reyes', can_edit: head }];
        if (path === '/holding/stay-limit' && method === 'PUT') { sent.push({ path, method, body }); const d = JSON.parse(body || '{}').days;
            return [200, { days: d, default_days: 7, max_days: 90, is_default: false, updated_at: null, updated_by_name: 'Head Reyes', can_edit: true }]; }
        if (path === '/landmarks') return [200, [{ landmark_id: 5, name: 'Barangay Shelter', category: 'facility', is_holding_facility: true, barangay_id: 1,
            subdivision_id: null, latitude: 14.8069, longitude: 121.0039, status: 'Active', capacity: 20 }]];
        if (path === '/holding/') return [200, [ANIMAL]];
        if (path === '/holding/1') return [200, ANIMAL];
        if (path === '/holding/metrics') { sent.push({ path, method, query: url.search }); return [200, { total: 1, need_treatment: 0, healthy: 1, nearing_expiry: 0, resolved_today: 0, needs_impoundment: 0 }]; }
        if (path === '/adoptions/promote/1') { sent.push({ path, method, body }); return [200, { message: 'ok' }]; }
        return [200, []];
    };
    const intercept = async ({ requestId, request }) => {
        const url = new URL(request.url);
        const [status, body] = url.pathname.startsWith('/api/') ? answer(url, request.method, request.postData) : [200, {}];
        await command('Fetch.fulfillRequest', { requestId, responseCode: status,
            responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify(body)).toString('base64') });
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
    await command('Fetch.enable', { patterns: [{ urlPattern: '*://*/api/*' }, { urlPattern: '*nominatim.openstreetmap.org*' }, { urlPattern: '*tile.openstreetmap.org*' },
        { urlPattern: '*basemaps.cartocdn.com*' }, { urlPattern: '*res.cloudinary.com*' }] });
    await command('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    const evaluate = async expression => {
        const response = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
        return response.result.value;
    };
    const waitFor = async (expression, label) => {
        for (let i = 0; i < 200; i++) { if (await evaluate(expression)) return; await delay(100); }
        throw new Error(`Timed out: ${label}; errors: ${browserErrors.join('; ')}`);
    };
    const token = 'test.' + Buffer.from(JSON.stringify({ user_id: 42, exp: 4102444800 })).toString('base64') + '.test';
    const signIn = isHead => command('Page.addScriptToEvaluateOnNewDocument', { source:
        `try { localStorage.setItem('staff_user', JSON.stringify({ user_id: 42, name: '${isHead ? 'Head Reyes' : 'Staff Cruz'}', role_id: 3, barangay_id: 1, is_head_officer: ${isHead}, access_token: '${token}' }));
               localStorage.setItem('holding_impound_stay_duration', '0'); } catch (e) {}` });  // an old browser value of 0 must be ignored
    const openBrownie = async () => {
        await command('Page.navigate', { url: base + '/brgy/holding-facility' });
        await waitFor(`[...document.querySelectorAll('main *')].some(e => e.children.length === 0 && e.textContent.trim() === 'Brownie')`, 'Brownie card');
        await evaluate(`(() => { const t = [...document.querySelectorAll('main *')].find(e => e.children.length === 0 && e.textContent.trim() === 'Brownie');
            let n = t; while (n && !(n.onclick || n.getAttribute?.('role') === 'button' || n.tagName === 'BUTTON')) n = n.parentElement; (n || t).click(); })()`);
    };
    const setText = (selector, value) => evaluate(`(() => { const el = document.querySelector('${selector}');
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; setter.call(el, ${JSON.stringify(value)});
        el.dispatchEvent(new Event('input', { bubbles: true })); })()`);

    // 1. Regular staff: the lock note with the date, from the server's 7 days (the old browser value 0 is ignored)
    head = false;
    let session = await signIn(false);
    await openBrownie();
    await waitFor(`document.body.innerText.includes('of 7 days held')`, 'staff lock note');
    const body = await evaluate('document.body.innerText');
    assert.ok(body.includes(`2 of 7 days held · available on ${availableOn}`), `staff: lock note with the date (expected "2 of 7 days held · available on ${availableOn}")`);
    assert.equal(await evaluate(`[...document.querySelectorAll('button')].some(b => b.offsetParent !== null && /Promote to adoption/i.test(b.textContent))`), false,
        'staff: no early promote button');
    assert.ok(sent.filter(x => x.path === '/holding/metrics').every(x => !/impound_days/.test(x.query)), 'metrics: no browser stay number sent');
    console.log(`PASS staff: "2 of 7 days held · available on ${availableOn}", no early promote, server limit used`);
    await command('Page.removeScriptToEvaluateOnNewDocument', { identifier: session.identifier });

    // 2. Head Officer: early promotion needs a reason, which is sent (and no browser stay number)
    head = true;
    session = await signIn(true);
    await openBrownie();
    await waitFor(`[...document.querySelectorAll('button')].some(b => b.textContent.includes('Promote to adoption'))`, 'head officer promote button');
    await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('Promote to adoption')).click()`);
    await waitFor(`!!document.querySelector('[data-early-reason]')`, 'early reason box');
    const promoteBtn = `[...document.querySelectorAll('button')].filter(b => /Promote|Publish/i.test(b.textContent) && b.closest('.fixed')).pop()`;
    assert.equal(await evaluate(`${promoteBtn}.disabled`), true, 'head officer: promote disabled without a reason');
    await setText('[data-early-reason]', 'Needs a home before the typhoon.');
    await waitFor(`!(${promoteBtn}).disabled`, 'promote enabled with a reason');
    await evaluate(`${promoteBtn}.click()`);
    await waitFor(`true`, 'click');
    for (let i = 0; i < 50 && !sent.some(x => x.path === '/adoptions/promote/1'); i++) await delay(100);
    const promote = sent.find(x => x.path === '/adoptions/promote/1');
    assert.ok(promote, 'head officer: promote request sent');
    const promoteBody = JSON.parse(promote.body || '{}');
    assert.equal(promoteBody.early_reason, 'Needs a home before the typhoon.', 'head officer: reason sent');
    assert.equal('min_stay_days' in promoteBody, false, 'no browser stay number sent');
    console.log('PASS head officer: early promote needs a reason; the reason is sent, no browser stay number');
    await command('Page.removeScriptToEvaluateOnNewDocument', { identifier: session.identifier });

    // 3. Barangay Settings: read-only for staff; the Head Officer's change is saved on the server
    const openSettings = async () => {
        await command('Page.navigate', { url: base + '/brgy/settings' });
        await waitFor(`[...document.querySelectorAll('button')].some(b => b.textContent.includes('Holding Place & Quarantine'))`, 'settings tabs');
        await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('Holding Place & Quarantine')).click()`);
        await waitFor(`!!document.querySelector('[data-stay-limit-note]')`, 'stay limit note');
    };
    const stayInput = `[...document.querySelectorAll('input[type=number]')].find(i => i.closest('div')?.textContent.includes('days'))`;
    head = false;
    session = await signIn(false);
    await openSettings();
    assert.match(await evaluate(`document.querySelector('[data-stay-limit-note]').textContent`), /Only the Head Officer or an Administrator can change it\. Last set by Head Reyes\./);
    assert.equal(await evaluate(`${stayInput}.value`), '7', 'settings: shows the server value 7, not the old browser 0');
    assert.equal(await evaluate(`${stayInput}.disabled`), true, 'settings: staff cannot edit');
    console.log('PASS settings (staff): server value shown, read-only');
    await command('Page.removeScriptToEvaluateOnNewDocument', { identifier: session.identifier });

    head = true;
    session = await signIn(true);
    await openSettings();
    assert.equal(await evaluate(`${stayInput}.disabled`), false, 'settings: head officer can edit');
    await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim().startsWith('5d')).click()`);
    await evaluate(`[...document.querySelectorAll('button')].filter(b => /Save/i.test(b.textContent) && b.offsetParent !== null).pop().click()`);
    for (let i = 0; i < 50 && !sent.some(x => x.path === '/holding/stay-limit' && x.method === 'PUT'); i++) await delay(100);
    const put = sent.find(x => x.path === '/holding/stay-limit' && x.method === 'PUT');
    assert.ok(put && JSON.parse(put.body).days === 5, `settings: head officer's change saved on the server (${put && put.body})`);
    console.log('PASS settings (head officer): change saved with PUT /holding/stay-limit');

    assert.equal(browserErrors.length, 0, browserErrors.join('\n'));
    console.log('PASS no uncaught browser errors; all API calls mocked');
} finally {
    if (command) { try { await command('Browser.close'); } catch {} }
    socket?.close();
    browser.kill();
    // Only remove the isolated profile created by this test, after verifying its absolute parent and prefix.
    const resolvedProfile = resolve(profile);
    if (resolvedProfile.startsWith(resolve(tmpdir()) + '\\straysafe-stay-limit-test-')) {
        await rm(resolvedProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
    }
}
