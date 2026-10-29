// Run with Vite on port 5173: node frontend/tests/chatCache.browser.mjs
// Shared device: cached chat messages of a previous account are never shown, and sign-in/out clears them.
// Uses an isolated Chrome profile and intercepts every API call; no live data is changed.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const base = process.env.CHAT_CACHE_TEST_URL || 'http://127.0.0.1:5173';
const chromeBin = process.env.CHROME_BIN || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile = await mkdtemp(join(tmpdir(), 'straysafe-chat-cache-test-'));
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
    let mode = 'denied';  // what the server answers for the conversation's messages
    const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="fixture"></div><script type="module">
        import RefreshRuntime from '/@react-refresh';
        RefreshRuntime.injectIntoGlobalHook(window);
        window.$RefreshReg$ = () => {};
        window.$RefreshSig$ = () => type => type;
        window.__vite_plugin_react_preamble_installed__ = true;
        await import('/@vite/client');
        await import('/tests/fixtures/chatCache.tsx');
    </script></body></html>`;
    const message = (id, text, sender = 31) => ({ message_id: id, thread_id: 9, sender_id: sender, sender_name: 'Resident B', sender_role: 'Resident',
        message_text: text, media_url: null, is_read: true, is_system: false, sent_at: new Date().toISOString() });
    const intercept = async ({ requestId, request }) => {
        const url = new URL(request.url);
        let body = [];
        let code = 200;
        let type = 'application/json';
        if (url.pathname === '/__chat_cache__') { body = fixture; type = 'text/html'; }
        else if (/\/chat\/reports\/\d+\/messages$/.test(url.pathname)) {
            if (mode === 'denied') { code = 403; body = { detail: 'Not allowed to view this conversation' }; }
            else if (mode === 'empty') body = [];
            else body = [message(1, 'My own question about the dog')];
        } else if (/\/chat\/reports\/\d+\/thread$/.test(url.pathname)) {
            if (mode === 'denied') { code = 403; body = { detail: 'Not allowed to view this conversation' }; }
            else body = { thread_id: null, report_id: 7, can_interact: true, is_closed: false };
        } else if (/\/chat\/reports\/\d+\/stats$/.test(url.pathname)) {
            body = { thread_id: null, total_messages: 0, unread_messages: 0, is_closed: false };
        } else if (/\/reports\/\d+$/.test(url.pathname)) {
            body = { report_id: 7, user_id: 31, status_id: 2, animal_type: 'Dog' };
        }
        await command('Fetch.fulfillRequest', { requestId, responseCode: code, responseHeaders: [{ name: 'Content-Type', value: type }],
            body: Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)).toString('base64') });
    };
    socket.onmessage = event => {
        const msg = JSON.parse(event.data);
        if (msg.id) {
            const task = pending.get(msg.id);
            if (!task) return;
            clearTimeout(task.timer); pending.delete(msg.id);
            msg.error ? task.reject(new Error(JSON.stringify(msg.error))) : task.resolve(msg.result);
        } else if (msg.method === 'Fetch.requestPaused') intercept(msg.params).catch(error => browserErrors.push(error.message));
        else if (msg.method === 'Runtime.exceptionThrown') browserErrors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
    };
    await command('Page.enable');
    await command('Runtime.enable');
    await command('Fetch.enable', { patterns: [{ urlPattern: '*://*/api/*' }, { urlPattern: '*://*/__chat_cache__*' }] });
    const evaluate = async expression => {
        const response = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
        return response.result.value;
    };
    const waitFor = async (expression, label) => {
        for (let i = 0; i < 150; i++) { if (await evaluate(expression)) return; await delay(100); }
        throw new Error(`Timed out: ${label}; errors: ${browserErrors.join('; ')}`);
    };
    const signedInWithCache = (cachedText) => `(() => {
        localStorage.clear(); sessionStorage.clear();
        localStorage.setItem('resident_user', JSON.stringify({ user_id: 31, name: 'Resident B', role_id: 1,
            access_token: 'test.' + btoa(JSON.stringify({ user_id: 31, exp: 4102444800 })) + '.test' }));
        localStorage.setItem('straysafe_report_chat_7', JSON.stringify([{ id: 'msg-99', senderId: 30, senderName: 'Resident A',
            senderRole: 'Resident', text: ${JSON.stringify(cachedText)}, timestamp: 'Yesterday', isRead: true }]));
        return true; })()`;
    const page = () => evaluate('document.body.innerText');

    for (const width of [1280, 390]) {
        await command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 640 });

        // 1. Someone else's cached conversation, server says no: nothing of it shows, the cache is dropped
        mode = 'denied';
        await command('Page.navigate', { url: base + '/__chat_cache__' });
        await waitFor(`!!document.getElementById('fixture')`, 'fixture');
        await evaluate(signedInWithCache("Resident A's private message"));
        await command('Page.navigate', { url: base + '/__chat_cache__?report=7' });
        await waitFor(`document.body.innerText.includes("You don't have access to this conversation")`, 'access notice');
        await delay(500);
        assert.equal((await page()).includes("Resident A's private message"), false, 'cached message of another account is not shown');
        assert.equal(await evaluate(`localStorage.getItem('straysafe_report_chat_7')`), null, 'refused conversation removed from the cache');
        assert.equal(await evaluate(`!!document.querySelector('textarea, input[type=text]') && !document.querySelector('textarea, input[type=text]').disabled && document.body.innerText.includes('Send')`), false, 'no way to send');

        // 2. The server has no messages but an old copy is cached: the welcome note replaces it
        mode = 'empty';
        await evaluate(signedInWithCache('Stale message from an older session'));
        await command('Page.navigate', { url: base + '/__chat_cache__?report=7' });
        await waitFor(`document.body.innerText.includes('Case chat initialized for Report #STR-0007')`, 'welcome note');
        assert.equal((await page()).includes('Stale message from an older session'), false, 'stale cache replaced');

        // 3. Normal conversation still loads
        mode = 'ok';
        await command('Page.navigate', { url: base + '/__chat_cache__?report=7' });
        await waitFor(`document.body.innerText.includes('My own question about the dog')`, 'own messages');

        // 4. Signing in, out or a session ending clears every cached conversation
        await evaluate(`localStorage.setItem('straysafe_report_chat_3', '[]'); localStorage.setItem('straysafe_match_chat_2', '[]'); localStorage.setItem('straysafe_report_chat_7', '[]'); localStorage.setItem('straysafe_theme', 'light'); true`);
        await evaluate('window.__clearAuthStorage(); true');
        const left = await evaluate(`Object.keys(localStorage).filter(k => /^straysafe_(report|match)_chat_/.test(k))`);
        assert.deepEqual(left, [], 'chat caches cleared');
        assert.equal(await evaluate(`localStorage.getItem('straysafe_theme')`), 'light', 'other settings kept');
        console.log(`PASS ${width}px: refused conversation shows nothing cached; stale cache replaced; own chat loads; sign-in/out clears chat caches`);
    }
    assert.equal(browserErrors.length, 0, browserErrors.join('\n'));
    console.log('PASS no uncaught browser errors; all application API calls mocked');
} finally {
    if (command) { try { await command('Browser.close'); } catch {} }
    socket?.close();
    browser.kill();
    // Only remove the isolated profile created by this test, after verifying its absolute parent and prefix.
    const resolvedProfile = resolve(profile);
    if (resolvedProfile.startsWith(resolve(tmpdir()) + '\\straysafe-chat-cache-test-')) {
        await rm(resolvedProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
    }
}
