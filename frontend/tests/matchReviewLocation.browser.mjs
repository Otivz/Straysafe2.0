// Run with Vite on port 5173: node frontend/tests/matchReviewLocation.browser.mjs
// Uses an isolated Chrome profile and intercepts every API call; no live data is changed.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const base = process.env.MATCH_REVIEW_TEST_URL || 'http://127.0.0.1:5173';
const chromeBin = process.env.CHROME_BIN || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile = await mkdtemp(join(tmpdir(), 'straysafe-match-location-test-'));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const browser = spawn(chromeBin, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-background-networking', 'about:blank'], { windowsHide: true, stdio: 'ignore' });
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
    const geoCalls = [];
    const routeCalls = [];
    const firstPoint = [14.80108707, 121.004574];
    const secondPoint = [14.80234567, 121.00567891];
    const pet = { pet_id: 10, owner_id: 42, pet_name: 'Test Pet', pet_type: 'Dog', status: 'Lost', registered_latitude: 14.8017, registered_longitude: 121.003, registered_address: 'Registered address', owner: { user_id: 42 } };
    const firstReport = { report_id: 1, latitude: 14.801, longitude: 121.005, initial_latitude: firstPoint[0], initial_longitude: firstPoint[1], initial_landmark: 'Rose Street', landmark: 'Current report location', current_status_id: 2, animal_type: 'Dog', animal_breed: 'Mixed', media: [], created_at: '2026-10-25T08:00:00Z' };
    const secondReport = { ...firstReport, report_id: 2, latitude: 14.806906, longitude: 121.0039297, initial_latitude: secondPoint[0], initial_longitude: secondPoint[1], initial_landmark: 'Second Street', landmark: 'Holding Facility', custody_status: 'In Barangay Facility', current_status_id: 8 };
    const match = { match_id: 1, matched_pet_id: 10, matched_pet: pet, similarity_score: 85, owner_confirmation_status: 'PENDING', status: 'AI_SUGGESTED' };
    const caseData = { pet, canonical_claim_report_id: 1, initial_claim_completed: true, reports: [
        { report_id: 1, tab_label: 'Initial Claim', tab_number: 1, is_initial_claim: true, tab_status: 'Awaiting Response', report: firstReport, match },
        { report_id: 2, tab_label: 'Second sighting', tab_number: 2, is_initial_claim: false, tab_status: 'Awaiting Response', report: secondReport, match: { ...match, match_id: 2 } },
    ] };
    const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="fixture"></div><script type="module">
        import RefreshRuntime from '/@react-refresh';
        RefreshRuntime.injectIntoGlobalHook(window);
        window.$RefreshReg$ = () => {};
        window.$RefreshSig$ = () => type => type;
        window.__vite_plugin_react_preamble_installed__ = true;
        await import('/@vite/client');
        await import('/tests/fixtures/matchReview.tsx');
    </script></body></html>`;
    const intercept = async ({ requestId, request }) => {
        const url = new URL(request.url);
        let body = [];
        let contentType = 'application/json';
        if (url.pathname === '/__match_location_review__') { body = fixture; contentType = 'text/html'; }
        else if (url.hostname === 'nominatim.openstreetmap.org') {
            const point = [Number(url.searchParams.get('lat')), Number(url.searchParams.get('lon'))];
            geoCalls.push(point);
            body = { address: { road: point[0] === firstPoint[0] ? 'Rose Street' : 'Second Street', suburb: 'San Vicente' } };
        } else if (url.hostname === 'router.project-osrm.org') {
            routeCalls.push(url.pathname);
            const coordinates = url.pathname.split('/').at(-1).split(';').map(pair => pair.split(',').map(Number));
            body = { routes: [{ distance: coordinates[0][1] === firstPoint[0] ? 315 : 777, geometry: { coordinates } }] };
            await delay(400);
        } else {
            const path = url.pathname.replace(/^\/api/, '');
            assert.equal(request.method, 'GET', `review must not write live records: ${path}`);
            if (path === '/matches/case-review/1') body = caseData;
            else if (path === '/reports/1') body = { ...firstReport, initial_latitude: null, initial_longitude: null, viewer_access: 'match_owner' };
            else if (path === '/matches/report/1') body = [match];
            else if (path === '/pets/owner/42') body = [pet];
            else if (path === '/claims/proof-on-file') body = { has_proof: false };
            else if (path === '/users/42') body = { user_id: 42, role_id: 1, name: 'Match Reviewer', email: 'review@example.test', is_verified: true };
            else if (path === '/reports/coverage-area') body = { center_latitude: 14.801, center_longitude: 121.004, radius_meters: 1000, boundary_polygon: [] };
            else if (path === '/landmarks/barangay/1/hq') body = {};
        }
        await command('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: contentType }, { name: 'Access-Control-Allow-Origin', value: '*' }], body: Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)).toString('base64') });
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
    await command('Network.enable');
    await command('Network.setBlockedURLs', { urls: ['*tile.openstreetmap.org*', '*res.cloudinary.com*', '*unsplash.com*'] });
    await command('Fetch.enable', { patterns: [{ urlPattern: '*://*/api/*' }, { urlPattern: '*://*/__match_location_review__*' }, { urlPattern: '*://nominatim.openstreetmap.org/*' }, { urlPattern: '*://router.project-osrm.org/*' }] });
    const evaluate = async expression => {
        const response = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
        return response.result.value;
    };
    const waitFor = async (expression, label) => {
        for (let i = 0; i < 150; i++) { if (await evaluate(expression)) return; await delay(100); }
        throw new Error(`Timed out: ${label}; errors: ${browserErrors.join('; ')}`);
    };
    const hasPoint = point => `window.reviewMarkerPoints?.().some(p=>Math.abs(p[0]-${point[0]})<1e-9 && Math.abs(p[1]-${point[1]})<1e-9)`;
    for (const width of [390, 1280]) {
        await command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 640 });
        await command('Page.navigate', { url: base + '/__match_location_review__' });
        await waitFor(hasPoint(firstPoint), 'actual Leaflet sighting marker at full report precision');
        assert.equal(await evaluate(hasPoint([14.801, 121.005])), false, 'rounded match-card point is not used');
        await waitFor(`document.body.textContent.includes('315 meters away')`, 'route distance from exact sighting');
        assert(geoCalls.some(point => point[0] === firstPoint[0] && point[1] === firstPoint[1]), 'street lookup uses the same exact pin');
        assert(routeCalls.some(path => path.includes(`${firstPoint[1]},${firstPoint[0]}`)), 'route uses the same exact pin');
        await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Report #2') && b.textContent.includes('Second sighting')).click()`);
        await waitFor(hasPoint(secondPoint), 'switching tabs moves the actual marker to the second original sighting');
        assert.equal(await evaluate(hasPoint([14.806906, 121.0039297])), false, 'holding facility does not become the sighting pin');
        await waitFor(`document.body.textContent.includes('777 meters away')`, 'distance updates to the second sighting');
        assert(geoCalls.some(point => point[0] === secondPoint[0] && point[1] === secondPoint[1]), 'second street lookup uses its own original pin');
        assert(routeCalls.some(path => path.includes(`${secondPoint[1]},${secondPoint[0]}`)), 'second route uses its own original pin');
        console.log(`PASS ${width}px: exact Leaflet marker, matching street/route coordinates, tab switch, relocated original pin and updated distance`);
    }
    assert.equal(browserErrors.length, 0, browserErrors.join('\n'));
    console.log('PASS no uncaught browser errors; all API and map service requests mocked');

} finally {
    if (command) { try { await command('Browser.close'); } catch {} }
    socket?.close();
    browser.kill();
    // Only remove the isolated profile created by this test, after verifying its absolute parent and prefix.
    const resolvedProfile = resolve(profile);
    if (resolvedProfile.startsWith(resolve(tmpdir()) + '\\straysafe-match-location-test-')) {
        await rm(resolvedProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
    }
}
