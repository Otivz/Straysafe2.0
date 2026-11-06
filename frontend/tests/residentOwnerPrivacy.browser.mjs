// Resident owner-information privacy and evidence-backed notification activity. All API requests are mocked.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const base = process.env.OWNER_PRIVACY_TEST_URL || 'http://127.0.0.1:5173';
const chromeBin = process.env.CHROME_BIN || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile = await mkdtemp(join(tmpdir(), 'straysafe-owner-privacy-test-'));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const browser = spawn(chromeBin, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-background-networking', 'about:blank'], { windowsHide: true, stdio: 'ignore' });

const baseReport = {
    report_id: 9, user_id: 42, subdivision_id: 1, category_id: 4, created_at: '2026-11-06T08:00:00',
    animal_type: 'Dog', animal_count: 1, status_id: 2, current_status_id: 2,
    latitude: 14.801, longitude: 121.003, initial_latitude: 14.801, initial_longitude: 121.003,
    landmark: 'Test Gate', description: 'Synthetic dog sighting.', visibility: 'Private', viewer_access: 'reporter',
    priority_level: 'Medium', media: [], comments: [], history: [], disputes: [], merged_reports: [],
    pet_id: 7, pet_name: 'Private Test Pet', owner_id: 7, owner_name: 'Private Test Owner', owner_phone: '09170000000',
    can_view_owner_details: false, owner_notification_events: [],
};
let currentReport = { ...baseReport };

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

    const browserErrors = [];
    const answer = url => {
        const path = url.pathname.replace(/^\/api/, '');
        if (path === '/auth/verify-session') return [200, { status: 'valid', role_id: 1, is_verified: true, is_profile_complete: true }];
        if (path === '/reports/9') return [200, currentReport];
        if (path.startsWith('/holding/by-report')) return [404, { detail: 'Not found' }];
        if (path.startsWith('/lost-pet-alerts/reports/')) return [200, { alert: null }];
        return [200, []];
    };
    const intercept = async ({ requestId, request }) => {
        const url = new URL(request.url);
        const [status, body] = url.pathname.startsWith('/api/') ? answer(url) : [200, {}];
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
        { urlPattern: '*basemaps.cartocdn.com*' }, { urlPattern: '*router.project-osrm.org*' }] });
    const token = 'test.' + Buffer.from(JSON.stringify({ user_id: 42, exp: 4102444800 })).toString('base64') + '.test';
    await command('Page.addScriptToEvaluateOnNewDocument', { source:
        `try { localStorage.setItem('resident_user', JSON.stringify({ user_id: 42, name: 'Owner One', role_id: 1, is_verified: true, access_token: '${token}' })); } catch (e) {}` });
    const evaluate = async expression => {
        const response = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
        return response.result.value;
    };
    const waitFor = async (expression, label) => {
        for (let i = 0; i < 200; i++) { if (await evaluate(expression)) return; await delay(100); }
        throw new Error(`Timed out: ${label}; errors: ${browserErrors.join('; ')}`);
    };
    for (const width of [1280, 390]) {
        await command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 640 });
        const open = async report => {
            currentReport = report;
            await command('Page.navigate', { url: base + '/resident/reports/9' });
            await waitFor(`document.body.textContent.includes('Synthetic dog sighting.')`, 'report loaded');
        };
        await open({ ...baseReport });
        assert.equal(await evaluate(`!!document.querySelector('[data-owner-information]')`), false, 'reporter is not the owner');
        let text = await evaluate('document.body.innerText');
        assert.equal(/Private Test Pet|Private Test Owner|No Private Owner Contact|POTENTIAL OWNER NOTIFIED/i.test(text), false, 'no owner block or invented notice');
        await open({ ...baseReport, user_id: null, viewer_access: 'public' });
        assert.equal(await evaluate(`!!document.querySelector('[data-owner-information]')`), false, 'other resident has no owner block');
        const notice = { notified_at: '2026-11-06T08:15:00', response: 'pending' };
        await open({ ...baseReport, owner_notification_events: [notice] });
        await waitFor(`document.body.textContent.includes('A possible owner has been notified. Their response is pending.')`, 'anonymous notification event');
        text = await evaluate('document.body.innerText');
        assert.match(text, /POTENTIAL OWNER NOTIFIED/i);
        assert.equal(/Private Test Pet|Private Test Owner|No Private Owner Contact/i.test(text), false, 'notification reveals no identity');
        assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), true, 'no horizontal overflow');
        for (const [response, expected] of [['confirmed', 'Official match verification is separate.'], ['declined', 'said this is not their pet.']]) {
            await open({ ...baseReport, owner_notification_events: [{ ...notice, response }] });
            await waitFor(`document.body.textContent.includes(${JSON.stringify(expected)})`, response + ' activity');
            assert.equal((await evaluate('document.body.innerText')).includes('Their response is pending.'), false, 'response does not remain pending');
        }
        await open({ ...baseReport, owner_id: 42, can_view_owner_details: true });
        await waitFor(`!!document.querySelector('[data-owner-information]')`, 'owner retains information block');
        assert.match(await evaluate(`document.querySelector('[data-owner-information]').textContent`), /Private Test Pet/);
        console.log(`PASS ${width}px: reporter/public privacy, actual notification, responses, owner access and no overflow`);
    }
    assert.equal(browserErrors.length, 0, browserErrors.join('\n'));
    console.log('PASS no uncaught browser errors; all API calls mocked');
} finally {
    if (command) { try { await command('Browser.close'); } catch {} }
    socket?.close();
    browser.kill();
    // Only remove the isolated profile created by this test, after verifying its absolute parent and prefix.
    const resolvedProfile = resolve(profile);
    if (resolvedProfile.startsWith(resolve(tmpdir()) + '\\straysafe-owner-privacy-test-')) {
        await rm(resolvedProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
    }
}
