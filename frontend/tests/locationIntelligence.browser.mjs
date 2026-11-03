// Run with Vite on port 5173: node frontend/tests/locationIntelligence.browser.mjs
// Resident report page, Location Intelligence: an owner-observation case (status 7, no facility) shows the last reported
// sighting and "with its owner", never the holding place; a recorded intake (facility) shows the holding place.
// Uses an isolated Chrome profile and a mocked API; no live data is read or changed.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const base = process.env.LOCATION_TEST_URL || 'http://127.0.0.1:5173';
const chromeBin = process.env.CHROME_BIN || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile = await mkdtemp(join(tmpdir(), 'straysafe-location-test-'));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const browser = spawn(chromeBin, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-background-networking', 'about:blank'], { windowsHide: true, stdio: 'ignore' });

const FACILITY = { landmark_id: 9, name: 'Barangay San Vicente Animal Impound Facility', latitude: 14.806906, longitude: 121.0039297, is_holding_facility: true };
const baseReport = {
    user_id: 42, subdivision_id: 1, category_id: 4, created_at: '2026-11-03T10:03:44', animal_type: 'Dog', animal_count: 1,
    latitude: 14.80148264, longitude: 121.00332141, initial_latitude: 14.80148264, initial_longitude: 121.00332141,
    landmark: 'Phase 1 Gate', initial_landmark: 'Phase 1 Gate', description: 'Roaming dog.', visibility: 'Private',
    priority_level: 'Medium', media: [], comments: [], history: [], disputes: [], merged_reports: [],
};
const reportsById = {
    // The reported bug: a First Warning started the owner observation; no escalation, rescue or intake
    2: { ...baseReport, report_id: 2, status_id: 7, current_status_id: 7, custody_status: 'Sighting', facility_id: null, facility: null,
        observation: { open: true, status: 'observing', due_at: '2026-11-06T02:07:44+00:00', extended: false } },
    // A recorded intake: impounded at a facility
    3: { ...baseReport, report_id: 3, status_id: 8, current_status_id: 8, custody_status: 'Secured in Facility', facility_id: 9, facility: FACILITY,
        latitude: FACILITY.latitude, longitude: FACILITY.longitude, landmark: FACILITY.name },
    // Escalated, not picked up: last reported sighting, location not confirmed
    4: { ...baseReport, report_id: 4, status_id: 4, current_status_id: 4, custody_status: 'Sighting', facility_id: null, facility: null },
};

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
        const m = path.match(/^\/reports\/(\d+)$/);
        if (m && reportsById[m[1]]) return [200, reportsById[m[1]]];
        if (path.startsWith('/holding/by-report')) return [404, { detail: 'Not found' }];
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
    // The Location Intelligence card (heading text as written; it is styled uppercase)
    const card = () => evaluate(`(() => {
        const h = [...document.querySelectorAll('h4')].find(x => x.textContent.trim() === 'Location Intelligence');
        return h ? h.closest('.relative.z-10').textContent.replace(/\\s+/g, ' ') : '';
    })()`);

    for (const width of [1280, 390]) {
        await command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 640 });

        await command('Page.navigate', { url: base + '/resident/reports/2' });
        await waitFor(`[...document.querySelectorAll('h4')].some(x => x.textContent.trim() === 'Location Intelligence')`, 'report 2 location card');
        const obs = await card();
        assert.match(obs, /Last reported sighting/, `observation case: last reported sighting (${width}px)`);
        assert.match(obs, /Current location: with its owner during the observation period \(not in a holding place\)/, `observation case: with its owner (${width}px)`);
        assert.doesNotMatch(obs, /Animal Secured at Holding Place|Impound Facility|Caretaker/, `observation case: no holding place (${width}px)`);

        await command('Page.navigate', { url: base + '/resident/reports/4' });
        await waitFor(`[...document.querySelectorAll('h4')].some(x => x.textContent.trim() === 'Location Intelligence')`, 'report 4 location card');
        const esc = await card();
        assert.match(esc, /Last reported sighting/, `escalated case: last reported sighting (${width}px)`);
        assert.match(esc, /Current location: not confirmed/, `escalated case: location not confirmed (${width}px)`);
        assert.doesNotMatch(esc, /Animal Secured at Holding Place|Impound Facility/, `escalated case: no holding place (${width}px)`);

        await command('Page.navigate', { url: base + '/resident/reports/3' });
        await waitFor(`[...document.querySelectorAll('h4')].some(x => x.textContent.trim() === 'Location Intelligence')`, 'report 3 location card');
        const heldText = await card();
        assert.match(heldText, /Current location\s*Barangay San Vicente Animal Impound Facility/, `recorded intake: the holding place (${width}px)`);
        assert.match(heldText, /Animal Secured at Holding Place|Secured/, `recorded intake: secured badge (${width}px)`);
        assert.match(heldText, /Original sighting location\s*Phase 1 Gate/, `recorded intake: original sighting kept (${width}px)`);
        assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true, `no sideways scroll at ${width}px`);
        console.log(`PASS ${width}px: observation case with its owner, escalated case not confirmed, recorded intake at the holding place`);
    }
    assert.equal(browserErrors.length, 0, browserErrors.join('\n'));
    console.log('PASS no uncaught browser errors; all API calls mocked');
} finally {
    if (command) { try { await command('Browser.close'); } catch {} }
    socket?.close();
    browser.kill();
    // Only remove the isolated profile created by this test, after verifying its absolute parent and prefix.
    const resolvedProfile = resolve(profile);
    if (resolvedProfile.startsWith(resolve(tmpdir()) + '\\straysafe-location-test-')) {
        await rm(resolvedProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
    }
}
