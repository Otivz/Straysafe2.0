// Run with Vite on port 5173: node frontend/tests/notifications.browser.mjs
// Uses an isolated Chrome profile and intercepts every API call; no live data is changed.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const base = process.env.NOTIFICATION_TEST_URL || 'http://127.0.0.1:5173';
const chromeBin = process.env.CHROME_BIN || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile = await mkdtemp(join(tmpdir(), 'straysafe-notification-test-'));
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
    let rows = [];
    let requests = [];
    let failMarkAll = false;
    let activeUser;
    const browserErrors = [];
    const makeRows = () => [
        ...Array.from({ length: 14 }, (_, i) => ({ notification_id: 101 + i, user_id: 42, title: `Notice ${String(i + 1).padStart(2, '0')} ${i === 0 ? 'LongTitle'.repeat(25) : 'Report update'}`, message: `Update ${i + 1}: ${'LongDescriptionWithoutSpaces'.repeat(12)}\nAnimal is safely in care.`, type: 'status_update', related_id: 128, created_at: '2026-10-25T08:00:00Z', is_read: i % 4 === 3, is_archived: false })),
        { notification_id: 200, title: 'Archived item', type: 'status_update', is_read: false, is_archived: true },
        { notification_id: 201, title: 'Chat belongs in Messages', type: 'message', is_read: false, is_archived: false },
    ];

    const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="fixture"></div><script type="module">
        import RefreshRuntime from '/@react-refresh';
        RefreshRuntime.injectIntoGlobalHook(window);
        window.$RefreshReg$ = () => {};
        window.$RefreshSig$ = () => type => type;
        window.__vite_plugin_react_preamble_installed__ = true;
        await import('/@vite/client');
        await import('/tests/fixtures/notifications.tsx');
    </script></body></html>`;

    const intercept = async ({ requestId, request }) => {
        const url = new URL(request.url);
        if (url.pathname === '/__notification_review__') {
            await command('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/html' }], body: Buffer.from(fixture).toString('base64') });
            return;
        }
        const path = url.pathname.replace(/^\/api/, '');
        requests.push({ path, method: request.method });
        let body = [];
        let status = 200;
        if (request.method === 'GET' && /^\/notifications\/(me|user\/\d+)$/.test(path)) body = rows;
        else if (request.method === 'POST' && path.includes('/notifications/mark-all-read/')) {
            if (failMarkAll) { status = 500; body = { detail: 'Simulated failure' }; }
            else { rows = rows.map(n => ({ ...n, is_read: true })); body = { message: 'ok' }; }
        } else if (request.method === 'PATCH' && /^\/notifications\/\d+$/.test(path)) {
            const id = Number(path.split('/').at(-1));
            const patch = JSON.parse(request.postData || '{}');
            rows = rows.map(n => n.notification_id === id ? { ...n, ...patch } : n);
            body = rows.find(n => n.notification_id === id);
        } else if (/^\/users\/42$/.test(path)) body = activeUser;
        else if (path === '/auth/verify-session') body = { status: 'valid', role_id: activeUser.role_id, is_verified: true, is_profile_complete: true };
        else if (path.includes('/preferences')) body = {};
        else if (path.includes('/coverage')) body = {};
        await command('Fetch.fulfillRequest', { requestId, responseCode: status, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify(body ?? {})).toString('base64') });
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
    await command('Network.setBlockedURLs', { urls: ['*res.cloudinary.com*', '*unsplash.com*', '*tile.openstreetmap.org*'] });
    await command('Fetch.enable', { patterns: [{ urlPattern: '*://*/api/*' }, { urlPattern: '*://*/__notification_review__*' }] });
    const evaluate = async expression => {
        const response = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
        return response.result.value;
    };
    const waitFor = async (expression, label) => {
        for (let i = 0; i < 150; i++) { if (await evaluate(expression)) return; await delay(100); }
        throw new Error(`Timed out: ${label}; browser errors: ${browserErrors.join('; ')}`);
    };
    let currentWidth;
    const click = async expression => {
        const point = await evaluate(`(() => { const element=(${expression}); if (!element) throw new Error('Click target missing'); element.scrollIntoView({block:'nearest'}); const r=element.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}; })()`);
        if (currentWidth < 640) {
            await command('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, radiusX: 1, radiusY: 1 }] });
            await command('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        } else {
            await command('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
            await command('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
        }
    };
    const openPanel = async () => {
        await click(`Array.from(document.querySelectorAll('button[aria-haspopup="dialog"]')).find(b=>b.getClientRects().length)`);
        await waitFor(`!!document.querySelector('[data-notification-panel]:not([hidden])')`, 'panel opens');
        await evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
    };
    const panelButton = text => click(`Array.from(document.querySelectorAll('[data-notification-panel]:not([hidden]) button')).find(b=>b.textContent.toLowerCase().includes(${JSON.stringify(text.toLowerCase())}))`);
    const closePanel = async () => {
        await click(`document.querySelector('[data-notification-panel]:not([hidden]) button[title="Close notifications"], [data-notification-panel]:not([hidden]) button[aria-label="Close notifications"]')`);
        await waitFor(`!document.querySelector('[data-notification-panel]:not([hidden])')`, 'panel closes');
    };
    const notificationGets = () => requests.filter(r => r.method === 'GET' && /^\/notifications\/(me|user\/\d+)$/.test(r.path)).length;
    const markPosts = () => requests.filter(r => r.method === 'POST' && r.path.includes('mark-all-read')).length;
    const load = async (role, mode, width) => {
        currentWidth = width;
        rows = makeRows(); requests = []; failMarkAll = false;
        activeUser = { user_id: 42, name: 'Notification Reviewer', email: 'review@example.test', role_id: ({ resident: 1, subd: 2, brgy: 3, admin: 4 })[role], barangay_id: 1, subdivision_id: 1, status: 'Active', is_verified: true, is_profile_complete: true };
        await command('Emulation.setDeviceMetricsOverride', { width, height: 800, deviceScaleFactor: 1, mobile: width < 640 });
        await command('Emulation.setTouchEmulationEnabled', { enabled: width < 640 });
        await command('Page.navigate', { url: `${base}/__notification_review__?role=${role}&mode=${mode}` });
        await waitFor(`window.reviewReady && !!document.querySelector('button[aria-haspopup="dialog"]')`, `${role} mounts`);
        if (mode !== 'empty') await waitFor(`document.querySelector('[data-notification-panel]')?.textContent.includes('Notice 14')`, `${role} fetches all notifications`);
    };

    const cases = [['resident', 'navbar', 320], ['resident', 'home', 390], ['resident', 'settings', 390], ['resident', 'navbar', 768], ['resident', 'navbar', 1280], ['subd', 'navbar', 320], ['subd', 'navbar', 640], ['subd', 'navbar', 1280], ['brgy', 'navbar', 390], ['brgy', 'navbar', 768], ['brgy', 'navbar', 1280], ['admin', 'navbar', 320], ['admin', 'navbar', 1280]];
    for (const [role, mode, width] of cases) {
        await load(role, mode, width);
        await openPanel();
        assert.equal(markPosts(), 0, `${role}: opening does not mark unseen notifications as read`);
        const geometry = await evaluate(`(() => { const p=document.querySelector('[data-notification-panel]:not([hidden])'); const l=p.querySelector('[data-notification-list]'); const r=p.getBoundingClientRect(); return {left:r.left,right:r.right,bottom:r.bottom,overflow:p.scrollWidth>p.clientWidth,listOverflow:l.scrollWidth>l.clientWidth,scrollable:l.scrollHeight>l.clientHeight,count:l.querySelectorAll('h4').length,text:l.textContent}; })()`);
        assert(geometry.left >= -1 && geometry.right <= width + 1 && geometry.bottom <= 801, `${role}: panel fits ${width}px screen`);
        assert(!geometry.overflow && !geometry.listOverflow, `${role}: long text does not overflow horizontally`);
        assert(geometry.scrollable, `${role}: list scrolls independently`);
        assert(geometry.text.includes('Notice 14') && !geometry.text.includes('Archived item') && !geometry.text.includes('Chat belongs in Messages'), `${role}: complete active system list`);
        assert.equal(await evaluate(`document.querySelector('[data-notification-panel]').textContent.includes('View All Notifications')`), false);
        const listCenter = await evaluate(`(() => {const r=document.querySelector('[data-notification-panel]:not([hidden]) [data-notification-list]').getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
        if (width < 640) {
            await command('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...listCenter, radiusX: 1, radiusY: 1 }] });
            for (let step = 1; step <= 8; step++) {
                await command('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: listCenter.x, y: listCenter.y - step * 20, radiusX: 1, radiusY: 1 }] });
                await delay(30);
            }
            await command('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        } else {
            await command('Input.dispatchMouseEvent', { type: 'mouseWheel', ...listCenter, deltaX: 0, deltaY: 200 });
        }
        await waitFor(`document.querySelector('[data-notification-panel]:not([hidden]) [data-notification-list]').scrollTop > 0`, `${role}: native scrolling`);
        await evaluate(`window.reviewPanel=document.querySelector('[data-notification-panel]'); window.reviewList=reviewPanel.querySelector('[data-notification-list]'); reviewList.scrollTop=100;`);
        const initialGets = notificationGets();
        for (let repeat = 0; repeat < 3; repeat++) { await closePanel(); await openPanel(); }
        assert.equal(await evaluate(`document.querySelector('[data-notification-panel]')===window.reviewPanel && window.reviewList.scrollTop===100`), true, `${role}: panel identity and scroll survive reopening`);
        assert.equal(notificationGets(), initialGets, `${role}: reopen does not refetch`);
        failMarkAll = true;
        await panelButton('mark all read');
        await waitFor(`!!document.querySelector('[data-notification-panel] [role="alert"]')`, `${role}: failed mark feedback`);
        assert(rows.some(n => !n.is_read), `${role}: failed update preserves unread data`);
        failMarkAll = false;
        const beforePosts = markPosts();
        await panelButton('mark all read');
        await waitFor(`Array.from(document.querySelectorAll('[data-notification-panel] button')).some(b=>b.textContent.toLowerCase().includes('mark all read') && b.disabled)`, `${role}: successful mark all`);
        assert.equal(markPosts() - beforePosts, 1, `${role}: one mark-all request`);
        assert(rows.every(n => n.is_read), `${role}: mark-all saved`);
        assert.equal(await evaluate(`!!document.querySelector('[data-notification-panel]:not([hidden])')`), true, `${role}: tapping portal controls does not close it`);
        await closePanel(); await openPanel();
        assert.equal(await evaluate(`Array.from(document.querySelectorAll('[data-notification-panel] button')).some(b=>b.textContent.toLowerCase().includes('mark all read') && b.disabled)`), true, `${role}: mark-all control remains after reopening`);
        if (role !== 'resident') {
            await panelButton('unread (');
            assert.equal(await evaluate(`document.querySelector('[data-notification-list]').textContent.includes('You have read all notifications.')`), true, `${role}: unread filter reflects saved read state`);
            await panelButton('all (');
            assert.equal(await evaluate(`document.querySelector('[data-notification-list]').textContent.includes('Notice 14')`), true, `${role}: All filter retains notifications`);
        }
        if (role === 'brgy' && width === 390) {
            await mkdir(resolve('scratch/notification-review'), { recursive: true });
            const capture = await command('Page.captureScreenshot', { format: 'png' });
            await writeFile(resolve('scratch/notification-review/mobile-notifications.png'), Buffer.from(capture.data, 'base64'));
        }
        await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        await waitFor(`!document.querySelector('[data-notification-panel]:not([hidden])')`, `${role}: Escape closes`);
        assert.equal(await evaluate(`document.body.style.overflow`), '', `${role}: closing restores page scrolling`);
        if (width >= 640) {
            await openPanel();
            await command('Input.dispatchMouseEvent', { type: 'mousePressed', x: 2, y: 750, button: 'left', clickCount: 1 });
            await command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 2, y: 750, button: 'left', clickCount: 1 });
            await waitFor(`!document.querySelector('[data-notification-panel]:not([hidden])')`, `${role}: outside click dismisses`);
        }
        console.log(`PASS ${role} ${mode} ${width}px: full list, scroll, repeat reopen, stable controls, read updates, failed requests, no duplicate fetch/write`);

        await load(role, mode, width); await openPanel();
        await click(`document.querySelector('[data-notification-panel] [data-notification-list] h4')?.closest('[class*="cursor-pointer"]') || Array.from(document.querySelectorAll('[data-notification-list] button')).find(b=>b.textContent.includes('Notice 01'))`);
        await waitFor(`true`, 'click completes');
        for (let i = 0; i < 30 && !requests.some(r => r.method === 'PATCH'); i++) await delay(100);
        assert.equal(requests.filter(r => r.method === 'PATCH' && r.path === '/notifications/101').length, 1, `${role}: individual click updates read state once`);
        assert.equal(rows.find(n => n.notification_id === 101).is_read, true);
        if (role === 'subd' || role === 'brgy') {
            await waitFor(`!!document.querySelector('[aria-label="Notification details"]')`, `${role}: notification detail opens`);
            await click(`Array.from(document.querySelectorAll('[aria-label="Notification details"] button')).find(b=>b.textContent.includes('Open Related Page'))`);
            await waitFor(`window.reviewLocation === '/${role}/reports/128'`, `${role}: related page navigation`);
            assert.equal(requests.filter(r => r.method === 'PATCH' && r.path === '/notifications/101').length, 1, `${role}: details do not send a duplicate read receipt`);
        } else if (role === 'resident') {
            await waitFor(`window.reviewLocation === '/resident/reports/128'`, 'resident report navigation');
        } else {
            await panelButton('open report');
            await waitFor(`window.reviewLocation === '/admin/reports/128'`, 'admin report navigation');
        }
    }
    await load('resident', 'empty', 390); await openPanel();
    assert.equal(notificationGets(), 0, 'controlled empty list does not start a second notification fetch');
    assert.equal(await evaluate(`document.querySelector('[data-notification-panel]').textContent.includes('No notifications yet')`), true);

    await load('resident', 'home', 1280);
    await waitFor(`Array.from(document.querySelectorAll('h3')).some(h=>h.textContent.trim()==='Notifications')`, 'desktop resident sidebar');
    const sidebar = await evaluate(`(() => {const h=Array.from(document.querySelectorAll('h3')).find(h=>h.textContent.trim()==='Notifications'); const p=h.closest('[class*="h-[450px]"]'); const l=p.querySelector('[data-notification-list]'); return {text:p.textContent,scrollable:l.scrollHeight>l.clientHeight};})()`);
    assert(sidebar.text.includes('Notice 14') && !sidebar.text.includes('View All Notifications') && sidebar.scrollable, 'resident desktop sidebar shows complete scrollable list');
    assert.equal(browserErrors.length, 0, browserErrors.join('\n'));
    console.log('PASS resident controlled empty list and desktop sidebar; no browser runtime errors');
} finally {
    if (command) { try { await command('Browser.close'); } catch {} }
    socket?.close();
    browser.kill();
    // Only remove the isolated profile created by this test, after verifying its absolute parent and prefix.
    const resolvedProfile = resolve(profile);
    if (resolvedProfile.startsWith(resolve(tmpdir()) + '\\straysafe-notification-test-')) {
        await rm(resolvedProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
    }
}
