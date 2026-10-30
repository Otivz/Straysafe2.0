// Run with local Vite: PHASE2_HOLDING_TEST_URL defaults to http://127.0.0.1:5174.
// The fixture answers all API requests in memory; this runner also blocks backend and external requests.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const base = process.env.PHASE2_HOLDING_TEST_URL || 'http://127.0.0.1:5174';
const chrome = process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const profilePrefix = join(tmpdir(), 'straysafe-phase2-maps-');
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
            await command(backend || url.origin !== new URL(base).origin ? 'Fetch.failRequest' : 'Fetch.continueRequest',
                backend || url.origin !== new URL(base).origin
                    ? { requestId: request.requestId, errorReason: 'BlockedByClient' }
                    : { requestId: request.requestId });
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
        throw new Error(`${label}: ${JSON.stringify(errors)}; ${await evaluate('document.body.innerText.slice(0, 450)')}`);
    };
    const click = async expression => assert(await evaluate(`(() => { const e = ${expression}; if (!e) return false; e.click(); return true; })()`), expression);
    const button = text => `[...document.querySelectorAll('button')].find(e => e.textContent.trim() === ${JSON.stringify(text)})`;
    const titled = title => `document.querySelector(${JSON.stringify(`button[title="${title}"]`)})`;

    let scenarios = 0;
    for (const width of [390, 1280]) {
        await command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
        const navigate = async query => {
            errors.length = 0;
            await command('Page.navigate', { url: `${base}/tests/fixtures/phase2Holding.html?${query}` });
            await waitFor('document.querySelector("#fixture")?.textContent.length > 20', query);
            await pause(250);
            assert.deepEqual(errors, [], query);
        };
        await navigate('mode=holding');
        for (const label of ['Municipal Holding Facility', 'Municipal Holding Place']) {
            assert.equal(await evaluate(`window.phase2SightingLabel(${JSON.stringify(label)})`), null, 'both holding wordings remain recognized');
        }
        await waitFor('document.body.textContent.includes("Neighbor synthetic animal")', 'same-Barangay neighboring animal');
        assert.equal(await evaluate('document.querySelector("[aria-label=\\"Stay limit in days\\"]") !== null'), false);
        assert.equal(await evaluate('document.body.textContent.includes("Earlier Subdivision Pen")'), false);
        await click(`[...document.querySelectorAll('button')].find(e => e.textContent.trim() === 'Manage')`);
        await waitFor('document.body.textContent.includes("At the Barangay holding place (view only)")', 'read-only detail');
        assert.equal(await evaluate(`[...document.querySelectorAll('button')].some(e => /Update condition|Save changes|Add care/i.test(e.textContent))`), false);
        scenarios++;
        await navigate('mode=holding&legacy');
        await waitFor('document.body.textContent.includes("Earlier Subdivision Pen")', 'earlier pen retained');
        await click(`[...document.querySelectorAll('button')].find(e => e.textContent.includes('Earlier Subdivision Pen'))`);
        await waitFor('document.body.textContent.includes("Earlier pen animal")', 'earlier pen animals accessible');
        scenarios++;
        await navigate('mode=dashboard');
        await waitFor(`[...document.querySelectorAll('button')].some(e => e.textContent.includes('Your animals held'))`, 'Barangay dashboard card');
        const countCard = await evaluate(`[...document.querySelectorAll('button')].find(e => e.textContent.includes('Your animals held')).querySelector('span').textContent`);
        assert.equal(countCard, '2', 'holding count includes healthy/impounded Barangay cases and excludes earlier pens/discharges');
        scenarios++;
        await navigate('mode=modal');
        await waitFor(`[...document.querySelectorAll('h5')].some(e => e.textContent.includes('Secured by Resident'))`, 'resident custody choice');
        assert.equal(await evaluate(`document.body.textContent.includes('Select Holding Place / Shelter')`), false);
        await click(`[...document.querySelectorAll('h5')].find(e => e.textContent.includes('Secured by Resident'))`);
        await click(button('Confirm Status Update'));
        await waitFor('window.phase2Saved === true', 'resident custody saved');
        const saved = await evaluate(`window.phase2Requests.find(r => r.path === '/reports/1/status')?.body`);
        assert.equal(saved.status_id, 2);assert.equal(saved.custody_status, 'Secured by Resident');assert.equal(saved.facility_id, undefined);
        scenarios++;
        await navigate('mode=modal&held');
        await waitFor(`document.body.textContent.includes('Secured in')`, 'held-animal choice');
        assert.equal(await evaluate(`[...document.querySelectorAll('h5')].some(e => e.textContent.includes('Secured by Resident'))`), false);
        scenarios++;
        await navigate('mode=animals&count=1');
        await waitFor('/replace photo with a close-up/i.test(document.body.textContent)', 'single-animal photo action retained');
        assert.equal(await evaluate('document.body.textContent.includes("Animals in this report")'), false);
        scenarios++;
        await navigate('mode=animals&count=2');
        await waitFor('document.body.textContent.includes("Animals in this report")', 'multi-animal controls retained');
        scenarios++;
        await navigate('mode=settings');
        await click(`[...document.querySelectorAll('button')].find(e => e.textContent.includes('Landmarks'))`);
        await waitFor('document.body.textContent.includes("New animal admissions are managed by the Barangay")', 'landmark settings');
        assert.equal(await evaluate('document.body.textContent.includes("Designate as Animal Holding Place")'), false);
        scenarios++;
        await navigate('mode=barangay');
        await waitFor('document.body.textContent.includes("Own synthetic animal")', 'Barangay holding');
        const promote = await evaluate(`[...document.querySelectorAll('button')].some(e => /adopt/i.test(e.title) && !e.disabled)`);
        assert(promote, 'Barangay adoption promotion retained');
        await click(`[...document.querySelectorAll('button')].find(e => /adopt/i.test(e.title) && !e.disabled)`);
        await waitFor('document.body.textContent.includes("Adoption")', 'adoption promotion screen opens');
        scenarios++;
    }
    assert.deepEqual(backendAttempts, [], 'no backend requests');
    console.log(JSON.stringify({ result: 'PASS', scenarios, widths: [390,1280], backendRequests: 0 }));
} finally {
    socket?.close();browser.kill();await pause(500);
    assert(profile.startsWith(profilePrefix));
    await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:200});
}
