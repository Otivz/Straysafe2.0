// Mocked responsive Observation UI regression: OBSERVATION_TEST_URL=http://127.0.0.1:5180 node frontend/tests/underObservation.browser.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const base = process.env.OBSERVATION_TEST_URL || 'http://127.0.0.1:5173';
const chromeBin = process.env.CHROME_BIN || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile = await mkdtemp(join(tmpdir(), 'straysafe-observation-test-'));
const delay = ms => new Promise(r => setTimeout(r, ms));
const browser = spawn(chromeBin, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-background-networking', 'about:blank'], { windowsHide: true, stdio: 'ignore' });

const LEADER_ID = 42;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const sections = ['active', 'active', 'for_second_warning', 'second_warning_issued', 'endorsed', 'resolved'];
const items = sections.map((workflow_section, i) => ({
    followup_id: i + 1, report_id: 101 + i, pet_id: null, animal_name: i === 0 ? 'Brownie with a long animal description' : `Animal ${i + 1}`,
    owner_id: 7, owner_name: i === 0 ? 'Resident With A Long Display Name' : 'Resident Demo', owner_phone: '000-000-0000', owner_address: 'Demo address',
    subdivision_id: 1, subdivision_name: 'Demo Subdivision', leader_id: 42, leader_name: 'Leader Demo',
    status: workflow_section === 'resolved' ? 'Complied' : 'Pending', workflow_section, duration_days: 3,
    due_at: '2026-11-08T08:00:00', created_at: '2026-11-05T08:00:00',
    report_photo: i === 0 ? 'https://res.cloudinary.com/demo/image/upload/dog.png' : null,
    report_landmark: 'Demo gate', report_animal_type: 'Dog', report_breed: 'Mixed', report_color: 'Brown',
    first_warning_date: '2026-11-05T08:00:00', first_warning_level: 'First Warning', first_warning_violation: 'Free-Roaming Unleashed',
    second_warning_date: workflow_section === 'second_warning_issued' ? '2026-11-06T08:00:00' : null,
    has_second_warning: workflow_section === 'second_warning_issued', is_eligible_for_second_warning: workflow_section === 'for_second_warning',
    is_eligible_for_endorsement: workflow_section === 'second_warning_issued',
    resolved_at: workflow_section === 'resolved' ? '2026-11-06T08:00:00' : null,
    endorsement_date: workflow_section === 'endorsed' ? '2026-11-06T08:00:00' : null,
    current_observation_day: i === 1 ? 2 : 1, observation_day_display: 'Day 1 of 3', remaining_time_display: '2 days remaining', progress_percent: 33,
    contact_logs: [], owner_updates: [], unreviewed_owner_updates_count: 0,
}));
const dashboard = { items, active_observation_count: 2, for_second_warning_count: 1, second_warning_issued_count: 1, endorsed_count: 1, resolved_count: 1 };
let dashboardMode = 'normal';
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

    let pageLoads = 0;
    const browserErrors = [];
    const calls = [];
    const json = (body, status = 200) => ({ body, status });
    const answer = (url, method) => {
        const path = url.pathname.replace(/^\/api/, '');
        calls.push({path, method});
        if (path === '/auth/verify-session') return json({status: 'valid', role_id: 2, is_verified: true});
        if (path === '/owner-followups/under-observation') {
            if (dashboardMode === 'error') return json({detail: 'Demo connection failure'}, 503);
            if (dashboardMode === 'empty') return json({...dashboard, items: [], active_observation_count: 0, for_second_warning_count: 0, second_warning_issued_count: 0, endorsed_count: 0, resolved_count: 0});
            return json(dashboard);
        }
        return json([]);
    };
    const intercept = async ({ requestId, request }) => {
        const url = new URL(request.url);
        if (url.hostname === 'res.cloudinary.com') {
            await command('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'image/png' }], body: PNG.toString('base64') });
            return;
        }
        const external = !url.pathname.startsWith('/api/');
        const { status, body } = external ? json({}) : answer(url, request.method, request.postData);
        await command('Fetch.fulfillRequest', { requestId, responseCode: status, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
            body: Buffer.from(JSON.stringify(body)).toString('base64') });
    };
    socket.onmessage = event => {
        const message = JSON.parse(event.data);
        if (message.id) {
            const task = pending.get(message.id);
            if (!task) return;
            clearTimeout(task.timer); pending.delete(message.id);
            message.error ? task.reject(new Error(JSON.stringify(message.error))) : task.resolve(message.result);
        } else if (message.method === 'Page.loadEventFired') pageLoads++;
        else if (message.method === 'Fetch.requestPaused') intercept(message.params).catch(error => {
            // Navigation can cancel a paused request before its mocked response is fulfilled.
            if (!error.message.includes('Invalid InterceptionId.')) browserErrors.push(error.message);
        });
        else if (message.method === 'Runtime.exceptionThrown') browserErrors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
        else if (message.method === 'Page.javascriptDialogOpening') { browserErrors.push('dialog: ' + message.params.message); command('Page.handleJavaScriptDialog', { accept: true }).catch(() => {}); }
    };
    await command('Page.enable');
    await command('Runtime.enable');
    await command('DOM.enable');
    await command('Emulation.setTimezoneOverride', { timezoneId: 'Asia/Manila' });
    await command('Fetch.enable', { patterns: [{ urlPattern: '*://*/api/*' }, { urlPattern: '*nominatim.openstreetmap.org*' }, { urlPattern: '*tile.openstreetmap.org*' }, { urlPattern: '*basemaps.cartocdn.com*' }, { urlPattern: '*res.cloudinary.com*' }] });
    const evaluate = async expression => {
        const response = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
        return response.result.value;
    };
    const waitFor = async (expression, label) => {
        for (let i = 0; i < 200; i++) { if (await evaluate(expression)) return; await delay(100); }
        throw new Error(`Timed out: ${label}; errors: ${browserErrors.join('; ')}`);
    };
    const text = () => evaluate(`document.body.innerText.replace(/\\s+/g, ' ')`);
    const clickText = (selector, label) => evaluate(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find(e => e.textContent.trim().toUpperCase().includes(${JSON.stringify(label.toUpperCase())})); if (!el) return false; el.click(); return true; })()`);
    const setValue = (selector, value) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); return true; })()`);

    const token = 'test.' + Buffer.from(JSON.stringify({ user_id: LEADER_ID, exp: 4102444800 })).toString('base64') + '.test';
    await command('Page.addScriptToEvaluateOnNewDocument', { source:
        `try { localStorage.setItem('staff_user', JSON.stringify({ user_id: ${LEADER_ID}, name: 'Leader Santos', role_id: 2, subdivision_id: 1, access_token: '${token}' })); } catch (e) {}` });
    await command('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

    const navigate = async () => {
        const beforeLoad = pageLoads;
        await command('Page.navigate', {url: base + '/subd/under-observation'});
        for (let i = 0; pageLoads <= beforeLoad && i < 200; i++) await delay(100);
        assert.ok(pageLoads > beforeLoad, 'new page finished loading');
    };
    const reload = async (width = 390) => {
        await command('Emulation.setDeviceMetricsOverride', {width, height: 900, deviceScaleFactor: 1, mobile: width < 768});
        await navigate();
        await waitFor(`document.querySelectorAll('[data-observation-case]').length === 6`, 'cases loaded');
    };
    
    for (const width of [320, 375, 390, 430, 640, 767, 768, 1024, 1280, 1536]) {
        await reload(width);
        const geometry = await evaluate(`(() => {
            const summary = document.querySelector('[data-observation-summary]');
            const rects = [...summary.children].map(el => el.getBoundingClientRect());
            const tabs = document.querySelector('[data-observation-tabs]');
            const controls = document.querySelector('[data-observation-controls]');
            const status = document.querySelector('#observation-status');
            const photo = document.querySelector('[data-case-photo]').getBoundingClientRect();
            return {columns: getComputedStyle(summary).gridTemplateColumns.split(' ').length,
                heights: rects.map(r => r.height), overflow: document.documentElement.scrollWidth > innerWidth + 1,
                mainOverflow: document.querySelector('main').scrollWidth > document.querySelector('main').clientWidth + 1,
                tabsFit: tabs.scrollWidth <= tabs.clientWidth + 1,
                tabsVisible: !!tabs.getClientRects().length, statusVisible: !!status.getClientRects().length,
                statusWidth: status.getBoundingClientRect().width, contentWidth: status.parentElement.getBoundingClientRect().width,
                controlsFit: controls.scrollWidth <= controls.clientWidth + 1,
                photoHeight: photo.height,
                touch: [...controls.querySelectorAll('button,select,input')].filter(el => el.getClientRects().length && el.getAttribute('aria-label') !== 'Clear search').every(el => el.getBoundingClientRect().height >= 36)
            };
        })()`);
        assert.equal(geometry.columns, width < 1024 ? 2 : 4, `${width}px summary columns`);
        assert.ok(Math.max(...geometry.heights) - Math.min(...geometry.heights) < 2, 'equal summary heights');
        if (width < 640) assert.ok(Math.max(...geometry.heights) <= 110, 'compact mobile summaries');
        assert.equal(geometry.overflow || geometry.mainOverflow, false, `${width}px page overflow`);
        assert.ok(geometry.tabsFit && geometry.controlsFit && geometry.touch, `${width}px usable tabs and controls`);
        assert.equal(geometry.statusVisible, width < 768, 'mobile status dropdown visibility');
        assert.equal(geometry.tabsVisible, width >= 768, 'desktop wrapping tabs visibility');
        if (width < 768) assert.ok(Math.abs(geometry.statusWidth - geometry.contentWidth) < 1, 'status dropdown spans the full width');
        assert.ok(geometry.photoHeight <= (width < 640 ? 80 : 96), 'compact photo');
        assert.equal(await evaluate(`document.querySelector('[role="progressbar"]').getAttribute('aria-valuenow')`), '33', 'actual elapsed progress shown');
        assert.equal(await evaluate(`!!document.querySelector('table') || [...document.querySelectorAll('[data-observation-controls] button')].some(el => ['Cards', 'Table'].includes(el.textContent.trim()))`), false, 'card-only layout has no table or view switcher');
        if (width === 1280) {
            const shot = await command('Page.captureScreenshot', {format:'png'});
            const path = join(tmpdir(), `straysafe-observation-${Date.now()}-1280.png`);
            await writeFile(path, Buffer.from(shot.data,'base64'));
            console.log('SCREENSHOT ' + path);
        }
        console.log(`PASS ${width}px: summaries, status filters, compact controls/photos and card-only layout`);
    }
    await reload();
    for (const [label, count] of [['Active Observation', 2], ['Warning & Escalation', 2], ['Referred to Barangay', 1], ['Resolved Cases', 1]]) {
        await clickText('[data-observation-summary] button', label);
        await waitFor(`document.querySelectorAll('[data-observation-case]').length === ${count}`, label + ' count');
        assert.ok(await evaluate(`document.querySelector('#observation-status').selectedOptions[0].textContent.includes(${JSON.stringify(label.replace('Resolved Cases', 'Resolved'))})`), 'summary updates the selected status');
    }
    for (const width of [390, 1280]) {
        await reload(width);
        for (const [value, label, count] of [['all', 'All Cases', 6], ['active', 'Active Observation', 2], ['for_second_warning', 'For Second Warning', 1], ['second_warning_issued', 'Second Warning Issued', 1], ['endorsed', 'Referred to Barangay', 1], ['resolved', 'Resolved', 1]]) {
            if (width < 768) await setValue('#observation-status', value);
            else await clickText('[data-observation-tabs] button', label);
            await waitFor(`document.querySelectorAll('[data-observation-case]').length === ${count}`, label + ' category filter');
            assert.equal(await evaluate(`document.querySelector('#observation-status').value`), value, 'shared category state stays synchronized');
        }
    }
    await reload();
    await setValue('#observation-status', 'warning_escalation');
    await waitFor(`document.querySelectorAll('[data-observation-case]').length === 2`, 'combined warning filter');
    await setValue('#observation-status', 'all');
    await setValue('input[aria-label="Search observation cases"]', 'Brownie');
    await waitFor(`document.querySelectorAll('[data-observation-case]').length === 1`, 'search animal');
    await evaluate(`document.querySelector('[aria-label="Clear search"]').click()`);
    await waitFor(`document.querySelectorAll('[data-observation-case]').length === 6`, 'search clears');
    await setValue('select[aria-label="Filter by observation day"]', '2');
    await waitFor(`document.querySelectorAll('[data-observation-case]').length === 1`, 'day filter');
    await setValue('select[aria-label="Filter by observation day"]', 'all');
    await setValue('input[aria-label="Search observation cases"]', 'no-such-case');
    await waitFor(`document.body.innerText.includes('No Cases Found')`, 'filtered empty state');
    await clickText('button', 'View All Cases');
    await waitFor(`document.querySelectorAll('[data-observation-case]').length === 6`, 'reset filters');
    const before = calls.filter(c => c.path === '/owner-followups/under-observation').length;
    await evaluate(`document.querySelector('[aria-label="Refresh records"]').click()`);
    await waitFor(`!document.querySelector('[aria-label="Refresh records"]').disabled`, 'refresh completes');
    assert.ok(calls.filter(c => c.path === '/owner-followups/under-observation').length > before, 'refresh re-fetches dashboard');
    await clickText('[data-observation-case="1"] button', 'View Details');
    await waitFor(`location.pathname.endsWith('/under-observation/1') && !document.querySelector('[data-observation-cases]') && !!document.querySelector('[title="Back to Under Observation"]')`, 'case details navigation');
    await reload();
    assert.equal(await clickText('[data-observation-case="3"] button', 'Issue Second Warning'), true);
    await waitFor(`!!document.querySelector('textarea')`, 'second warning dialog opens');
    await reload();
    await clickText('[data-observation-case="4"] button', 'Refer to Barangay');
    await waitFor(`!!document.querySelector('textarea')`, 'referral dialog opens');
    await reload();
    const screenshotPath = join(tmpdir(), `straysafe-observation-${Date.now()}-390.png`);
    await evaluate(`document.querySelector('main').scrollTop = 0`);
    const capture = await command('Page.captureScreenshot', {format:'png'});
    await writeFile(screenshotPath, Buffer.from(capture.data,'base64'));
    console.log('SCREENSHOT ' + screenshotPath);
    dashboardMode = 'empty';
    await navigate();
    await waitFor(`document.body.innerText.includes('No Cases Found')`, 'empty dashboard');
    dashboardMode = 'error';
    await navigate();
    await waitFor(`document.body.innerText.includes('Connection Issue')`, 'connection error state');
    assert.equal(browserErrors.length, 0, browserErrors.join('\n'));
    assert.equal(calls.some(c => c.method !== 'GET'), false, 'UI checks never submit workflow mutations');
    console.log('PASS all category/summary filters, search/reset, day filter, refresh, details, warning/referral dialogs and empty/error states; no workflow writes');
} finally {
    if (command) { try { await command('Browser.close'); } catch {} }
    socket?.close();
    browser.kill();
    const resolvedProfile = resolve(profile);
    if (resolvedProfile.startsWith(resolve(tmpdir()) + '\\straysafe-observation-test-')) {
        await rm(resolvedProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
    }
}
