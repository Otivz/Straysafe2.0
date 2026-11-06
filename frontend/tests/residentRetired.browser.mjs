// Run with Vite on port 5173: node frontend/tests/residentRetired.browser.mjs
// Subdivision-only Phase 3d: residents have no adoption or claim pages (they show "no longer available"), no adoption
// links on the landing page, and after "Yes, this is my pet" in Pet Match Review they are told their Subdivision Leader
// will help instead of filing a claim. Isolated Chrome profile and a mocked API; no live data.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const base = process.env.RESIDENT_TEST_URL || 'http://127.0.0.1:5173';
const chromeBin = process.env.CHROME_BIN || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile = await mkdtemp(join(tmpdir(), 'straysafe-resident-retired-test-'));
const delay = ms => new Promise(r => setTimeout(r, ms));
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
    const writes = [];
    const pet = { pet_id: 10, owner_id: 42, pet_name: 'Test Pet', pet_type: 'Dog', status: 'Lost', registered_latitude: 14.8017, registered_longitude: 121.003, registered_address: 'Registered address', owner: { user_id: 42 } };
    const report = { report_id: 1, latitude: 14.801, longitude: 121.005, initial_latitude: 14.801, initial_longitude: 121.005, landmark: 'Rose Street', current_status_id: 2, status_id: 2, animal_type: 'Dog', subdivision_id: 1, media: [], history: [], viewer_access: 'match_owner' };
    let match = { match_id: 1, matched_pet_id: 10, matched_pet: pet, similarity_score: 85, owner_confirmation_status: 'PENDING', status: 'AI_SUGGESTED', source_report_id: 1 };
    const caseData = () => ({ pet, canonical_claim_report_id: 1, initial_claim_completed: false, reports: [
        { report_id: 1, tab_label: 'Initial Claim', tab_number: 1, is_initial_claim: true, tab_status: 'Awaiting Response', report, match } ] });
    const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="fixture"></div><script type="module">
        import RefreshRuntime from '/@react-refresh';
        RefreshRuntime.injectIntoGlobalHook(window);
        window.$RefreshReg$ = () => {};
        window.$RefreshSig$ = () => type => type;
        window.__vite_plugin_react_preamble_installed__ = true;
        await import('/@vite/client');
        await import('/tests/fixtures/matchReview.tsx');
    </script></body></html>`;
    const answer = (path, method, body) => {
        if (method !== 'GET') writes.push(`${method} ${path}`);
        if (path === '/auth/verify-session') return { status: 'valid', role_id: 1, is_verified: true, is_profile_complete: true };
        if (path === '/matches/case-review/1') return caseData();
        if (path === '/reports/1') return report;
        if (path === '/matches/report/1') return [match];
        if (path === '/pets/owner/42') return [pet];
        if (path === '/claims/proof-on-file') return { has_proof: false };
        if (path === '/users/42') return { user_id: 42, role_id: 1, name: 'Match Reviewer', email: 'review@example.test', is_verified: true };
        if (path === '/reports/coverage-area') return { center_latitude: 14.801, center_longitude: 121.004, radius_meters: 1000, boundary_polygon: [] };
        if (path === '/landmarks/barangay/1/hq') return {};
        if (path === '/matches/1/owner-feedback' && method === 'POST') {
            match = { ...match, owner_confirmation_status: 'OWNER_CONFIRMED', owner_notes: JSON.parse(body || '{}').remarks };
            return match;
        }
        return [];
    };
    const intercept = async ({ requestId, request }) => {
        const url = new URL(request.url);
        let body = {};
        let contentType = 'application/json';
        if (url.pathname === '/__resident_match_review__') { body = fixture; contentType = 'text/html'; }
        else if (url.pathname.startsWith('/api/')) body = answer(url.pathname.replace(/^\/api/, ''), request.method, request.postData);
        await command('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: contentType }, { name: 'Access-Control-Allow-Origin', value: '*' }],
            body: Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)).toString('base64') });
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
        else if (message.method === 'Page.javascriptDialogOpening') { browserErrors.push('dialog: ' + message.params.message); command('Page.handleJavaScriptDialog', { accept: true }).catch(() => {}); }
    };
    await command('Page.enable');
    await command('Runtime.enable');
    await command('Network.enable');
    await command('Network.setBlockedURLs', { urls: ['*tile.openstreetmap.org*', '*res.cloudinary.com*', '*unsplash.com*', '*nominatim.openstreetmap.org*', '*router.project-osrm.org*', '*basemaps.cartocdn.com*'] });
    await command('Fetch.enable', { patterns: [{ urlPattern: '*://*/api/*' }, { urlPattern: '*://*/__resident_match_review__*' }] });
    const evaluate = async expression => {
        const response = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
        return response.result.value;
    };
    const waitFor = async (expression, label) => {
        for (let i = 0; i < 200; i++) { if (await evaluate(expression)) return; await delay(100); }
        throw new Error(`Timed out: ${label}; at ${await evaluate('location.pathname')}; errors: ${browserErrors.join('; ')}`);
    };
    const NLA = `document.body.innerText.includes('This page is no longer available')`;
    await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });

    // 1. Retired resident pages
    for (const path of ['/adopt', '/adopt/journey/3', '/adopt/applications', '/adopt/apply/3', '/resident/pet/10/claims-dashboard']) {
        await command('Page.navigate', { url: base + path });
        if (path !== '/adopt' && path !== '/adopt/journey/3') {
            await evaluate(`(localStorage.setItem('resident_user', JSON.stringify({ user_id: 42, name: 'Match Reviewer', role_id: 1, is_verified: true, is_profile_complete: true, access_token: 'test.e30.test' })), localStorage.setItem('access_token', 'test.e30.test'), true)`);
            await command('Page.navigate', { url: base + path });
        }
        await waitFor(NLA, `${path} shows "no longer available"`);
    }
    assert.equal(await evaluate(`document.documentElement.scrollWidth <= window.innerWidth + 1`), true, 'no horizontal scroll at 390px');
    console.log('PASS /adopt, /adopt/journey/3, /adopt/applications, /adopt/apply/3, /resident/pet/10/claims-dashboard show "no longer available"');

    // 2. Landing page: no adoption links or banner
    await evaluate(`(localStorage.clear(), sessionStorage.clear(), true)`);
    await command('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await command('Page.navigate', { url: base + '/' });
    await waitFor(`document.body.innerText.length > 500`, 'landing page');
    await delay(500);
    const landing = await evaluate(`document.body.innerText`);
    assert.equal(/Adopt a Pet|Browse Adoption Catalog|Public Adoption Catalog|Looking to Adopt/.test(landing), false, 'landing: no adoption entry points'); // descriptive wording is Phase 4
    assert.equal(await evaluate(`[...document.querySelectorAll('a')].some(a => (a.getAttribute('href') || '').startsWith('/adopt'))`), false, 'landing: no /adopt links');
    for (const stale of [/Barangay Personnel/i, /Barangay Staff/i, /4 Dedicated Roles/i, /adoption catalog/i, /Holding Place Oversight/i, /Adoption Pipeline/i]) {
        assert.equal(stale.test(landing), false, `landing excludes ${stale}`);
    }
    assert.match(landing, /3 Dedicated Roles/i);
    assert.match(landing, /outside StraySafe/i);
    assert.equal(await evaluate(`document.querySelectorAll('#roles h3').length`), 3, 'three role cards');
    console.log('PASS landing page has no adoption links, banner or footer link');

    // 3. Pet Match Review: "Yes, this is my pet" leads to the leader, not a claim form
    for (const width of [390, 1280]) {
        match = { ...match, owner_confirmation_status: 'PENDING' };
        writes.length = 0;
        await command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 640 });
        await command('Page.navigate', { url: base + '/__resident_match_review__' });
        await waitFor(`[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Yes, this is my pet')`, 'Yes button');
        await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Yes, this is my pet').click()`);
        await waitFor(`[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Yes, Confirm')`, 'confirmation dialog');
        await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Yes, Confirm').click()`);
        await waitFor(`!!document.querySelector('[data-owner-confirmed-next]')`, 'leader message after confirming');
        const text = await evaluate(`document.body.innerText`);
        assert.match(text, /Your Subdivision Leader has been notified and will help you get your pet back/, `${width}px: leader message`);
        assert.equal(/Submit Pet Claim|Submit Claim|Proof of Ownership Submission/i.test(text), false, `${width}px: no claim form`);
        assert.deepEqual(writes, ['POST /matches/1/owner-feedback'], `${width}px: only the owner's confirmation is sent (no claim): ${writes.join(', ')}`);
        assert.equal(await evaluate(`document.documentElement.scrollWidth <= window.innerWidth + 1`), true, `${width}px: no horizontal scroll`);
        console.log(`PASS ${width}px Pet Match Review: confirmation sent, "Your Subdivision Leader … will help" shown, no claim filed`);
    }

    assert.equal(browserErrors.length, 0, browserErrors.join('\n'));
    console.log('PASS no uncaught browser errors or alerts; all API calls mocked');
} finally {
    if (command) { try { await command('Browser.close'); } catch {} }
    socket?.close();
    browser.kill();
    const resolvedProfile = resolve(profile);
    if (resolvedProfile.startsWith(resolve(tmpdir()) + '\\straysafe-resident-retired-test-')) {
        await rm(resolvedProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
    }
}
