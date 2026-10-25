// Run with Vite on port 5173: node frontend/tests/claimEvidence.browser.mjs
// Uses an isolated Chrome profile and intercepts every API call; no live data is changed.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const base = process.env.CLAIM_EVIDENCE_TEST_URL || 'http://127.0.0.1:5173';
const chromeBin = process.env.CHROME_BIN || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile = await mkdtemp(join(tmpdir(), 'straysafe-claim-evidence-test-'));
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
    const requests = [];
    const alerts = [];
    let currentClaim = null;
    let failSave = false;
    let cloudUploads = 0;
    const pet = { pet_id: 10, owner_id: 42, pet_name: 'Test Pet', pet_type: 'Dog', status: 'Lost', registered_latitude: 14.8017, registered_longitude: 121.003, registered_address: 'Home', owner: { user_id: 42, email: 'review@example.test' } };
    const report = { report_id: 1, latitude: 14.80108707, longitude: 121.004574, initial_latitude: 14.80108707, initial_longitude: 121.004574, current_status_id: 2, landmark: 'Rose Street', animal_type: 'Dog', media: [], created_at: '2026-10-25T08:00:00Z' };
    const match = { match_id: 5, matched_pet_id: 10, matched_pet: pet, similarity_score: 85, owner_confirmation_status: 'PENDING', status: 'AI_SUGGESTED' };
    const claim = id => ({ claim_id: id, report_id: 1, pet_id: 10, pet, report, status: 'Evidence Requested', case_report_ids: [1], additional_photos_url: '' });
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
        let status = 200;
        let contentType = 'application/json';
        if (url.pathname === '/__claim_evidence_review__') { body = fixture; contentType = 'text/html'; }
        else if (url.hostname === 'api.cloudinary.com') {
            if (request.method === 'POST') {
                cloudUploads++;
                body = { secure_url: `https://res.cloudinary.com/demo/image/upload/claims/evidence${cloudUploads}.png` };
            }
        } else if (url.hostname === 'nominatim.openstreetmap.org') body = { address: { road: 'Rose Street' } };
        else if (url.hostname === 'router.project-osrm.org') body = { routes: [] };
        else {
            const path = url.pathname.replace(/^\/api/, '');
            requests.push({ path, method: request.method, body: request.postData ? JSON.parse(request.postData) : null });
            if (path === '/claims/' && request.method === 'POST') {
                const payload = JSON.parse(request.postData);
                if (failSave) { status = 500; body = { detail: 'Simulated save failure' }; }
                else {
                    const photos = new Set([...(currentClaim?.additional_photos_url || '').split(',').filter(Boolean), ...(payload.additional_photos_url || '').split(',').filter(Boolean)]);
                    currentClaim = { ...(currentClaim || claim(37)), ...payload, claim_id: currentClaim?.claim_id || 37, additional_photos_url: [...photos].join(','), status: 'Pending Review' };
                    body = currentClaim;
                }
            } else if (path === '/matches/case-review/1') body = { pet, claim: currentClaim, canonical_claim_report_id: 1, initial_claim_completed: !!currentClaim,
                reports: [{ report_id: 1, tab_label: 'Initial Claim', is_initial_claim: true, tab_status: 'Awaiting Response', report, match }] };
            else if (path === '/reports/1') body = report;
            else if (path === '/matches/report/1') body = [match];
            else if (path === '/pets/owner/42') body = [pet];
            else if (path === '/claims/' && request.method === 'GET') body = currentClaim ? [currentClaim] : [];
            else if (path === '/claims/proof-on-file') body = { has_proof: false };
            else if (path === '/users/42') body = { user_id: 42, role_id: 1, name: 'Match Reviewer', email: 'review@example.test', is_verified: true };
            else if (path === '/reports/coverage-area') body = { center_latitude: 14.801, center_longitude: 121.004, radius_meters: 1000, boundary_polygon: [] };
            else if (path === '/landmarks/barangay/1/hq') body = {};
        }
        await command('Fetch.fulfillRequest', { requestId, responseCode: status, responseHeaders: [{ name: 'Content-Type', value: contentType }, { name: 'Access-Control-Allow-Origin', value: '*' }, { name: 'Access-Control-Allow-Methods', value: 'GET, POST, OPTIONS' }, { name: 'Access-Control-Allow-Headers', value: '*' }], body: Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)).toString('base64') });
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
        else if (message.method === 'Page.javascriptDialogOpening') { alerts.push(message.params.message); command('Page.handleJavaScriptDialog', { accept: true }).catch(() => {}); }
    };
    await command('Page.enable');
    await command('Runtime.enable');
    await command('Network.enable');
    await command('Network.setBlockedURLs', { urls: ['*tile.openstreetmap.org*', '*res.cloudinary.com*', '*unsplash.com*'] });
    await command('Fetch.enable', { patterns: [{ urlPattern: '*://*/api/*' }, { urlPattern: '*://*/__claim_evidence_review__*' }, { urlPattern: '*://api.cloudinary.com/*' }, { urlPattern: '*://nominatim.openstreetmap.org/*' }, { urlPattern: '*://router.project-osrm.org/*' }] });
    const evaluate = async expression => {
        const response = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
        return response.result.value;
    };
    const waitFor = async (expression, label) => {
        for (let i = 0; i < 150; i++) { if (await evaluate(expression)) return; await delay(100); }
        throw new Error(`Timed out: ${label}; errors: ${browserErrors.join('; ')}; alerts: ${alerts.join('; ')}`);
    };
    const load = async width => {
        await command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 640 });
        await command('Page.navigate', { url: base + '/__claim_evidence_review__?staleClaim=1' });
        await waitFor(`Array.from(document.querySelectorAll('h1')).some(h=>h.textContent.includes('Match Review'))`, 'match review mounts');
    };
    const uploadButton = `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Upload & Submit Proof Documents'))`;
    const selectPhoto = async () => {
        await waitFor(`!!(${uploadButton})`, 'existing claim proof form');
        await evaluate(`(() => { const input=Array.from(document.querySelectorAll('input[type="file"][multiple]')).find(i=>i.accept==='image/*,video/*'); if(!input)throw new Error('Photo input missing'); const data=new DataTransfer(); data.items.add(new File(['test-image'],'Screenshot 2026-06-10 191125.png',{type:'image/png'})); input.files=data.files; input.dispatchEvent(new Event('change',{bubbles:true})); })()`);
        await waitFor(`!(${uploadButton}).disabled`, 'selected proof can be submitted');
    };
    const submit = async () => {
        await evaluate(`(${uploadButton}).click()`);
        await waitFor(`!!(${uploadButton}) && !(${uploadButton}).disabled`, 'upload request finishes');
    };

    // A deleted server claim must not reappear from localStorage on page load.
    await load(1280);
    await waitFor(`Array.from(document.querySelectorAll('h3')).some(h=>h.textContent==='Is This Your Pet?')`, 'stale local claim ignored');
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('h3')).some(h=>h.textContent==='Claim Status')`), false);
    assert.equal(cloudUploads, 0);
    console.log('PASS deleted cached claim #1 is not restored as a live server claim');

    // The claim can also disappear after a form was opened. Its proof is saved by
    // report/pet, without posting to the now-missing /claims/1/evidence route.
    currentClaim = claim(1);
    await load(390); await selectPhoto();
    currentClaim = null;
    await evaluate(`(${uploadButton}).click()`);
    await waitFor(`document.body.textContent.includes('Pending Review') && !document.body.textContent.includes('Attached: Screenshot')`, 'missing claim recovered');
    assert.equal(currentClaim.claim_id, 37);
    assert.equal(currentClaim.additional_photos_url, 'https://res.cloudinary.com/demo/image/upload/claims/evidence1.png');
    assert.equal(requests.filter(r=>r.method==='POST' && /\/claims\/\d+\/evidence/.test(r.path)).length, 0);
    console.log('PASS mobile: deleting the open claim does not break screenshot submission; the real server claim is used');

    // A save failure retains the file and its uploaded URL; retry submits the
    // same URL without another Cloudinary upload.
    currentClaim = claim(1); failSave = true;
    await load(1280); await selectPhoto();
    const beforeUploads = cloudUploads;
    await submit();
    assert.equal(await evaluate(`document.body.textContent.includes('Attached: Screenshot 2026-06-10 191125.png')`), true);
    assert(alerts.some(text=>text.includes('selected files have been kept for retry')));
    assert.equal(cloudUploads - beforeUploads, 1);
    failSave = false;
    await evaluate(`(${uploadButton}).click()`);
    await waitFor(`document.body.textContent.includes('Pending Review') && !document.body.textContent.includes('Attached: Screenshot')`, 'retry succeeds');
    assert.equal(cloudUploads - beforeUploads, 1);
    assert(currentClaim.additional_photos_url);
    console.log('PASS desktop: failed save preserves the selected screenshot, retry succeeds and does not re-upload to Cloudinary');
    assert.equal(browserErrors.length, 0, browserErrors.join('\n'));
    console.log('PASS no uncaught browser errors; API and Cloudinary traffic mocked');

} finally {
    if (command) { try { await command('Browser.close'); } catch {} }
    socket?.close();
    browser.kill();
    // Only remove the isolated profile created by this test, after verifying its absolute parent and prefix.
    const resolvedProfile = resolve(profile);
    if (resolvedProfile.startsWith(resolve(tmpdir()) + '\\straysafe-claim-evidence-test-')) {
        await rm(resolvedProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
    }
}
