// Run with Vite on port 5173: node frontend/tests/petClaimRecords.browser.mjs
// Uses an isolated Chrome profile and intercepts every API call; no live data is changed.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const base = process.env.PET_CLAIM_RECORDS_TEST_URL || 'http://127.0.0.1:5173';
const chromeBin = process.env.CHROME_BIN || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile = await mkdtemp(join(tmpdir(), 'straysafe-claim-records-test-'));
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
    let approved = false;
    let claimsReads = 0;
    let reportsReads = 0;
    const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="fixture"></div><script type="module">
        import RefreshRuntime from '/@react-refresh';
        RefreshRuntime.injectIntoGlobalHook(window);
        window.$RefreshReg$ = () => {};
        window.$RefreshSig$ = () => type => type;
        window.__vite_plugin_react_preamble_installed__ = true;
        await import('/@vite/client');
        await import('/tests/fixtures/petClaimRecords.tsx');
    </script></body></html>`;
    const intercept = async ({ requestId, request }) => {
        const url = new URL(request.url);
        let body = [];
        let contentType = 'application/json';
        if (url.pathname === '/__pet_claim_records__') { body = fixture; contentType = 'text/html'; }
        else {
            const path = url.pathname.replace(/^\/api/, '');
            if (path === '/claims/') {
                claimsReads++;
                body = [{ claim_id: 1, report_id: 1, pet_id: 10, case_report_ids: [1, 2],
                    created_at: '2026-10-25T08:00:00Z', status: approved ? 'Handover Complete' : 'Pending Review' }];
            } else if (path === '/reports/') {
                reportsReads++;
                body = [1, 2].map(id => ({ report_id: id, pet_id: approved ? 10 : null, animal_type: 'Dog',
                    created_at: '2026-10-25T08:00:00Z', current_status_id: approved ? 9 : 2,
                    landmark: `Claim test street ${id}`, description: 'Test sighting', media: [] }));
            }
        }
        await command('Fetch.fulfillRequest', { requestId, responseCode: 200,
            responseHeaders: [{ name: 'Content-Type', value: contentType }],
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
    };
    await command('Page.enable');
    await command('Runtime.enable');
    await command('Fetch.enable', { patterns: [{ urlPattern: '*://*/api/*' }, { urlPattern: '*://*/__pet_claim_records__*' }] });
    const evaluate = async expression => {
        const response = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
        return response.result.value;
    };
    const waitFor = async (expression, label) => {
        for (let i = 0; i < 150; i++) { if (await evaluate(expression)) return; await delay(100); }
        throw new Error(`Timed out: ${label}; errors: ${browserErrors.join('; ')}`);
    };
    const click = text => evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim().startsWith(${JSON.stringify(text)})).click()`);
    for (const width of [1280, 390]) {
        approved = false;
        await command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 640 });
        await command('Page.navigate', { url: base + '/__pet_claim_records__' });
        await waitFor(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('Pet History'))`, 'pet panel');
        await click('Pet History');
        await waitFor(`document.body.textContent.includes('All History')`, 'history loaded');
        await click('Resolved');
        await waitFor(`document.body.textContent.includes('No Resolved Reports Found')`, 'pending claims are not resolved');
        const before = reportsReads;
        approved = true;
        await evaluate(`window.dispatchEvent(new CustomEvent('straysafe:data-changed', {detail:{scope:'42'}}))`);
        await waitFor(`document.body.textContent.includes('Reported Stray / Sighting for Kobe') && document.body.textContent.includes('#2')`, 'approved claim and merged report appear');
        assert(reportsReads > before, 'mounted panel fetched updated reports');
        assert.equal(await evaluate(`document.body.textContent.includes('No Resolved Reports Found')`), false);
        // The selected Resolved filter remains active across the background read.
        assert.equal(await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim().startsWith('Resolved')).className.includes('bg-emerald-600')`), true);
        const focusBefore = claimsReads;
        await evaluate(`window.dispatchEvent(new Event('focus'))`);
        for (let i = 0; i < 100 && claimsReads === focusBefore; i++) await delay(50);
        assert(claimsReads > focusBefore, 'returning from another screen/tab refreshes the claim');
        console.log(`PASS ${width}px: approved claim and merged reports appear without reloading; history tab/filter preserved; focus refresh works`);
    }
    assert.equal(browserErrors.length, 0, browserErrors.join('\n'));
    console.log('PASS no uncaught browser errors; all application API calls mocked');
} finally {
    if (command) { try { await command('Browser.close'); } catch {} }
    socket?.close();
    browser.kill();
    // Only remove the isolated profile created by this test, after verifying its absolute parent and prefix.
    const resolvedProfile = resolve(profile);
    if (resolvedProfile.startsWith(resolve(tmpdir()) + '\\straysafe-claim-records-test-')) {
        await rm(resolvedProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
    }
}
