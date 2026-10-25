// Run with Vite on port 5173: node frontend/tests/petBehaviorHistory.browser.mjs
// Bite / chasing history: verified counts shown read-only, a resident's saved declaration locked, staff can change it.
// Uses an isolated Chrome profile and intercepts every API call; no live data is changed.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const base = process.env.PET_BEHAVIOR_TEST_URL || 'http://127.0.0.1:5173';
const chromeBin = process.env.CHROME_BIN || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile = await mkdtemp(join(tmpdir(), 'straysafe-pet-behavior-test-'));
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
    const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="fixture"></div><script type="module">
        import RefreshRuntime from '/@react-refresh';
        RefreshRuntime.injectIntoGlobalHook(window);
        window.$RefreshReg$ = () => {};
        window.$RefreshSig$ = () => type => type;
        window.__vite_plugin_react_preamble_installed__ = true;
        await import('/@vite/client');
        await import('/tests/fixtures/petBehaviorHistory.tsx');
    </script></body></html>`;
    const intercept = async ({ requestId, request }) => {
        const url = new URL(request.url);
        const html = url.pathname === '/__pet_behavior_history__';
        await command('Fetch.fulfillRequest', { requestId, responseCode: 200,
            responseHeaders: [{ name: 'Content-Type', value: html ? 'text/html' : 'application/json' }],
            body: Buffer.from(html ? fixture : '[]').toString('base64') });
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
    await command('Fetch.enable', { patterns: [{ urlPattern: '*://*/api/*' }, { urlPattern: '*://*/__pet_behavior_history__*' }] });
    const evaluate = async expression => {
        const response = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
        return response.result.value;
    };
    const waitFor = async (expression, label) => {
        for (let i = 0; i < 150; i++) { if (await evaluate(expression)) return; await delay(100); }
        throw new Error(`Timed out: ${label}; errors: ${browserErrors.join('; ')}`);
    };
    const boxes = form => `[...document.querySelectorAll('[data-form=${form}] input[type=checkbox]')]`;
    const state = form => evaluate(`JSON.parse(document.querySelector('[data-form=${form}] [data-state]').textContent)`);
    const noSidewaysScroll = () => evaluate('document.documentElement.scrollWidth <= window.innerWidth');

    for (const width of [1280, 390]) {
        await command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 640 });

        // Detail panel: verified and declared shown separately
        await command('Page.navigate', { url: base + '/__pet_behavior_history__' });
        await waitFor(`[...document.querySelectorAll('button')].some(b => b.textContent.includes('Behavior Information'))`, 'panel tabs');
        await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('Behavior Information')).click()`);
        await waitFor(`document.body.textContent.includes('Bite history')`, 'behavior tab');
        const text = await evaluate('document.body.textContent');
        assert.match(text, /2 verified incidents/, 'verified bite count shown');
        assert.equal((text.match(/Declared, not verified/g) || []).length, 2, 'both declarations labelled');
        assert.match(text, /DECLARED/, 'chasing shows DECLARED (declared but not verified)');
        assert.equal(await noSidewaysScroll(), true, `no sideways scroll at ${width}px (panel)`);

        // Forms: resident cannot remove a saved declaration; staff can; verified count read-only with the dispute note
        await command('Page.navigate', { url: base + '/__pet_behavior_history__?view=fields' });
        await waitFor(`${boxes('resident')}.length === 2`, 'form fields');
        const residentText = await evaluate(`document.querySelector('[data-form=resident]').textContent`);
        assert.match(residentText, /Verified: 2 incidents from incident reports/);
        assert.match(residentText, /dispute that report/);
        assert.match(residentText, /Only the subdivision leader or barangay staff can remove it/);
        assert.deepEqual(await evaluate(`${boxes('resident')}.map(b => [b.checked, b.disabled])`), [[true, true], [false, false]]);
        await evaluate(`${boxes('resident')}[0].click()`);
        await evaluate(`${boxes('resident')}[1].click()`);
        assert.deepEqual(await state('resident'), { bite: true, chase: true }, 'locked bite stays, chase can be declared');
        await evaluate(`${boxes('staff')}[0].click()`);
        assert.deepEqual(await state('staff'), { bite: false }, 'staff can remove a declaration');
        assert.equal(await noSidewaysScroll(), true, `no sideways scroll at ${width}px (forms)`);
        console.log(`PASS ${width}px: verified and declared shown apart; resident declaration locked; staff can change it`);
    }
    assert.equal(browserErrors.length, 0, browserErrors.join('\n'));
    console.log('PASS no uncaught browser errors; all application API calls mocked');
} finally {
    if (command) { try { await command('Browser.close'); } catch {} }
    socket?.close();
    browser.kill();
    // Only remove the isolated profile created by this test, after verifying its absolute parent and prefix.
    const resolvedProfile = resolve(profile);
    if (resolvedProfile.startsWith(resolve(tmpdir()) + '\\straysafe-pet-behavior-test-')) {
        await rm(resolvedProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
    }
}
