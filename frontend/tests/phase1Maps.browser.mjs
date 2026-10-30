// Run with local Vite: PHASE1_MAPS_TEST_URL defaults to http://127.0.0.1:5174.
// The fixture answers all API requests in memory; this runner also blocks backend and external requests.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const base = process.env.PHASE1_MAPS_TEST_URL || 'http://127.0.0.1:5174';
const chrome = process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const profilePrefix = join(tmpdir(), 'straysafe-phase1-maps-');
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
    const snapshots = () => evaluate('window.phase1Snapshot()');
    const setSelect = (index, value) => evaluate(`(() => { const e = document.querySelectorAll('select')[${index}]; e.value = ${JSON.stringify(value)}; e.dispatchEvent(new Event('change', {bubbles:true})); })()`);
    let scenarios = 0;
    for (const width of [390, 1280]) {
        await command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
        const navigate = async query => {
            errors.length = 0;
            await command('Page.navigate', { url: `${base}/tests/fixtures/phase1Maps.html?${query}` });
            await waitFor('typeof window.phase1Snapshot === "function" && window.phase1Snapshot().length > 0', query);
            await pause(300);
            assert.deepEqual(errors, [], query);
        };

        await navigate('portal=admin');
        assert.equal(await evaluate('document.querySelector("select").value'), '30d');
        await waitFor('document.body.innerText.includes("2 INCIDENTS")', 'two active incidents');
        await click(button('Heatmap'));
        await waitFor('window.phase1Snapshot().some(m => m.heat.length === 3)', 'three historical heat incidents');
        let state = await snapshots();
        assert(state.some(m => m.heat.some(p => Math.abs(p[0] - 14.8008) < .000001)), 'moved animal uses original sighting');
        assert(!state.some(m => m.heat.some(p => Math.abs(p[0] - 14.806906) < .000001)), 'facility is not incident density');
        await click(button('Resolved Pins: Off'));
        await waitFor('document.body.textContent.includes("3 matching pins")', 'resolved pin shown');
        assert((await snapshots()).some(m => m.heat.length === 3), 'resolved toggle does not change heat');
        await click(button('Lost Pets: Excluded'));
        await waitFor('window.phase1Snapshot().some(m => m.heat.length === 4)', 'lost inclusion changes heat');
        await setSelect(1, '1');
        await waitFor('window.phase1Snapshot().every(m => m.heat.length === 0)', 'category filter changes heat');
        await click(titled('Open Hotspot Analysis & Temporal Flow'));
        await waitFor('document.body.innerText.includes("No hotspots:")', 'category filter changes hotspots');
        await setSelect(1, '4');
        await waitFor(`${titled('Show this hotspot on the map')} !== null`, 'real hotspot');
        await click(titled('Show this hotspot on the map'));
        await waitFor('window.phase1Snapshot().some(m => m.zoom === 18)', 'hotspot click centers/zooms map');
        await click(button('Pinpoint'));
        await evaluate('window.phase1ClickReport()');
        await waitFor('document.querySelector("[data-report-card]") !== null', 'report card opens on pin click');
        assert(!(await snapshots()).some(m => m.circles.includes(22)), 'no report selection ring');
        const markerCount = (await snapshots()).reduce((n, m) => n + m.markers.length, 0);
        await evaluate('window.phase1ClickEmpty()');
        await pause(150);
        assert.equal(await evaluate('document.querySelector("[data-report-card]") === null'), true, 'empty click closes report card');
        assert.equal((await snapshots()).reduce((n, m) => n + m.markers.length, 0), markerCount, 'empty map click does not add a marker');
        scenarios++;

        await navigate('portal=admin&empty');
        assert((await snapshots()).every(m => m.heat.length === 0), 'empty data has no heat');
        scenarios++;

        for (const portal of ['subd', 'brgy']) {
            await navigate(`portal=${portal}`);
            if (portal === 'brgy') assert.equal(await evaluate(`[...document.querySelectorAll('button')].filter(e => e.textContent.trim() === 'Heatmap').length`), 0);
            else await waitFor('window.phase1Snapshot().some(m => m.heat.length === 3)', 'subdivision retains resolved heat');
            const maps = await snapshots();
            assert(maps.some(m => m.markers.some(p => Math.abs(p.lat - 14.806906) < .000001)), 'picked-up incident stays actionable');
            assert(!maps.some(m => m.markers.some(p => Math.abs(p.lat - 14.8009) < .000001)), 'lost pet excluded');
            assert(!maps.some(m => m.markers.some(p => Math.abs(p.lat - 14.8006) < .000001 && p.tooltip)), 'report pin has no hover label');
            const before = maps.reduce((n, m) => n + m.markers.length, 0);
            await evaluate('window.phase1ClickEmpty()'); await pause(150);
            assert.equal((await snapshots()).reduce((n, m) => n + m.markers.length, 0), before);
            await click(portal === 'brgy' ? titled('Expand Map') : button('Expand'));
            await waitFor('window.phase1Snapshot().length >= 2', 'expanded dashboard map');
            const expandedCount = (await snapshots()).reduce((n, m) => n + m.markers.length, 0);
            await evaluate('window.phase1ClickEmpty()'); await pause(150);
            assert.equal((await snapshots()).reduce((n, m) => n + m.markers.length, 0), expandedCount, 'expanded map does not add a marker');
            scenarios++;
        }

        for (const access of ['public', 'owner', 'adopter']) {
            await navigate(`portal=resident&access=${access}`);
            const directions = await evaluate(`${titled('Use device GPS sensor')} !== null`);
            assert.equal(directions, access !== 'public', `directions: ${access}`);
            await click(titled('Open Fullscreen Expanded Map'));
            await waitFor('window.phase1Snapshot().length >= 2', 'expanded resident map');
            const routeControls = await evaluate(`[...document.querySelectorAll('button')].filter(e => e.title === 'Route from your registered home coordinates').length`);
            assert.equal(routeControls > 0, access !== 'public', `expanded directions: ${access}`);
            scenarios++;
        }
    }
    assert.deepEqual(backendAttempts, [], 'no backend requests');
    console.log(JSON.stringify({ result: 'PASS', scenarios, widths: [390, 1280], backendRequests: 0 }));
} finally {
    socket?.close(); browser.kill(); await pause(500);
    assert(profile.startsWith(profilePrefix));
    await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
}
