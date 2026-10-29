// Run with Vite on port 5173: node frontend/tests/petPhotoAccess.browser.mjs
// Uses an isolated Chrome profile and intercepts every API call; no live data is changed.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const base = process.env.PET_PHOTO_ACCESS_TEST_URL || 'http://127.0.0.1:5173';
const chromeBin = process.env.CHROME_BIN || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile = await mkdtemp(join(tmpdir(), 'straysafe-pet-photo-test-'));
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
    let uploads = 0;
    let denyUpload = false;
    const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="fixture"></div><script type="module">
        import RefreshRuntime from '/@react-refresh';
        RefreshRuntime.injectIntoGlobalHook(window);
        window.$RefreshReg$ = () => {};
        window.$RefreshSig$ = () => type => type;
        window.__vite_plugin_react_preamble_installed__ = true;
        await import('/@vite/client');
        await import('/tests/fixtures/petPhotoAccess.tsx');
    </script></body></html>`;
    const intercept = async ({ requestId, request }) => {
        const url = new URL(request.url);
        let body = [];
        let contentType = 'application/json';
        let responseCode = 200;
        if (url.pathname === '/__pet_photo_access__') { body = fixture; contentType = 'text/html'; }
        else if (url.pathname === '/api/pets/3/photo') {
            uploads++;
            if (denyUpload) { responseCode = 403; body = { detail: 'Animal left official care while this panel was open. Editing is no longer allowed.' }; }
            else body = { photo_url: base + '/assets/photo-test.png' };
        }
        await command('Fetch.fulfillRequest', { requestId, responseCode,
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
    await command('Fetch.enable', { patterns: [{ urlPattern: '*://*/api/*' }, { urlPattern: '*://*/__pet_photo_access__*' }] });
    const evaluate = async expression => {
        const response = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
        return response.result.value;
    };
    const waitFor = async (expression, label) => {
        for (let i = 0; i < 150; i++) { if (await evaluate(expression)) return; await delay(100); }
        throw new Error(`Timed out: ${label}; errors: ${browserErrors.join('; ')}`);
    };
    const upload = () => evaluate(`(() => {
        const input = document.querySelector('input[type=file]');
        const data = new DataTransfer();
        data.items.add(new File(['mock png'], 'dog.png', {type: 'image/png'}));
        input.files = data.files;
        input.dispatchEvent(new Event('change', {bubbles: true}));
    })()`);
    for (const width of [1280, 390]) {
        denyUpload = false;
        await command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 640 });
        await command('Page.navigate', { url: base + '/__pet_photo_access__' });
        await waitFor(`document.body.textContent.includes('Change Photo')`, 'care permits editing before handover');
        assert.equal(await evaluate(`document.body.textContent.includes('Edit Pet Details')`), true);
        await upload();
        await waitFor(`document.querySelector('[role=status]')?.textContent.includes('Pet photo updated successfully.')`, 'photo success banner');
        denyUpload = true;
        await upload();
        await waitFor(`document.querySelector('[role=alert]')?.textContent.includes('Animal left official care while this panel was open.')`, 'server error is visible');
        assert.equal(await evaluate(`document.body.textContent.includes('Pet photo updated successfully.')`), false);
        await command('Page.navigate', { url: base + '/__pet_photo_access__?readOnly=1' });
        await waitFor(`document.body.textContent.includes('Staff can only edit dogs or cats currently in official care')`, 'read-only restriction');
        assert.equal(await evaluate(`document.body.textContent.includes('Change Photo')`), false);
        assert.equal(await evaluate(`document.body.textContent.includes('Edit Pet Details')`), false);
        console.log(`PASS ${width}px: editing available to another officer while in care; upload success/error banners shown; read-only controls hidden`);
    }
    assert.equal(uploads, 4);
    assert.equal(browserErrors.length, 0, browserErrors.join('\n'));
    console.log('PASS no uncaught browser errors; all application API calls mocked');
} finally {
    if (command) { try { await command('Browser.close'); } catch {} }
    socket?.close();
    browser.kill();
    // Only remove the isolated profile created by this test, after verifying its absolute parent and prefix.
    const resolvedProfile = resolve(profile);
    if (resolvedProfile.startsWith(resolve(tmpdir()) + '\\straysafe-pet-photo-test-')) {
        await rm(resolvedProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
    }
}
