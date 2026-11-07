// Run with Vite on port 5173: node frontend/tests/adminArchive.browser.mjs
// Holding Archive has been removed; its old URL redirects to incidents. Adoption Archive stays read only (banner, no action
// buttons), and the Admin report view shows the Barangay Referral instead of "Admit to holding", with no dispatch, pick-up
// or impound override. Phase 3 also checks supported status-only writes and historical status reads.
// Isolated Chrome profile and a mocked API; no live data.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const base = process.env.ARCHIVE_TEST_URL || 'http://127.0.0.1:5173';
const chromeBin = process.env.CHROME_BIN || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile = await mkdtemp(join(tmpdir(), 'straysafe-admin-archive-test-'));
const delay = ms => new Promise(r => setTimeout(r, ms));
const browser = spawn(chromeBin, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-background-networking', 'about:blank'], { windowsHide: true, stdio: 'ignore' });

const tenDaysAgo = new Date(Date.now() - 10 * 86400000).toISOString();
const ANIMAL = {
    holding_id: 1, report_id: 10, rescue_id: null, facility_id: 5, facility_name: 'Barangay Shelter', facility_type: 'barangay',
    subdivision_id: 1, barangay_id: 1, animal_type: 'Dog', animal_name: 'Brownie', breed: 'Aspin', color: 'Brown', estimated_size: 'Medium',
    facility_status: 2, facility_status_name: 'Healthy', kennel_slot: 'K1', medical_notes: null, intake_date: tenDaysAgo,
    facility_intake_date: tenDaysAgo, discharge_date: null, intake_staff_name: 'Staff Cruz', report_landmark: 'Phase 1 Gate',
    report_category: 'Roaming Animal', adoption_eligible: true, timeline: [], media: [],
};
const APPLICATION = { adoption_id: 1, holding_id: 3, applicant_id: 7, full_name: 'Maria Santos', address: 'Block 5', contact_no: '09123456789',
    reason: 'Loves dogs.', status: 'Pending', current_stage: 'Application', application_stage_status: 'Pending', case_owner_id: 42,
    case_owner_name: 'Head Reyes', certificate_number: null, animal_name: 'Bantay', animal_type: 'Dog', animal_breed: 'Aspin',
    created_at: '2026-10-21T08:00:00', updated_at: '2026-10-25T08:00:00', has_other_pets: false, is_certificate_sent: false,
    is_handed_over: false, staff_handed_over: false };
const REPORT = { report_id: 5, user_id: 7, subdivision_id: 1, category_id: 4, status_id: 4, current_status_id: 4, reporter_name: 'Resident One',
    created_at: '2026-11-05T08:00:00', updated_at: '2026-11-05T09:00:00', latitude: 14.8018, longitude: 121.0028, landmark: 'Phase 1 Gate',
    description: 'Aggressive dog near the playground.', visibility: 'Private', media: [], comments: [], animal_type: 'Dog', animal_count: 1,
    endorsement_letter: { letter_id: 1, title: 'Endorsement for Report #5', letter_content: 'Aggressive dog', leader_name: 'Leader Santos' },
    history: [{ history_id: 2, report_status_id: 4, created_at: '2026-11-05T09:00:00', updater_name: 'Leader Santos',
        remarks: 'Referred to Barangay San Vicente by Leader Santos (phone call). Reason: Aggressive dog', media: [] }],
    disputes: [], merged_reports: [] };
const REFERRAL = { referral_id: 1, report_id: 5, barangay_id: 1, barangay_name: 'San Vicente', referred_by_name: 'Leader Santos',
    referred_at: '2026-11-05T09:00:00', reason: 'Aggressive dog', reference_no: null, contact_method: 'call', final_outcome: null,
    report_status_id: 4, updates: [] };

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
    const staffReads = [];
    const holdingReads = [];
    const json = (body, status = 200) => ({ status, body });
    const answer = (url, method, postData) => {
        const path = url.pathname.replace(/^\/api/, '');
        if (path === '/users/') staffReads.push(path);
        if (path.startsWith('/holding/')) holdingReads.push(path);
        if (method !== 'GET' && method !== 'OPTIONS') {
            const body = JSON.parse(postData || '{}');
            writes.push({ method, path, body });
            if (method === 'PUT' && path === '/reports/5/status') {
                REPORT.status_id = body.status_id; REPORT.current_status_id = body.status_id;
                return json(REPORT);
            }
            throw new Error(`Unexpected mocked write: ${method} ${path}`);
        }
        if (path === '/auth/verify-session') return json({ status: 'valid', role_id: 4, is_verified: true });
        if (path === '/landmarks/jurisdictions') return json({ barangays: [{ barangay_id: 1, barangay_name: 'San Vicente' }], subdivisions: [{ subdivision_id: 1, subdivision_name: 'Selera Homes', barangay_id: 1 }] });
        if (path === '/holding/stay-limit') return json({ days: 7, default_days: 7, max_days: 90, is_default: true, can_edit: false });
        if (path === '/holding/') return json([ANIMAL]);
        if (path === '/holding/1') return json(ANIMAL);
        if (path === '/holding/metrics') return json({ total: 1, healthy: 1, need_treatment: 0, for_adoption: 0, overdue: 1 });
        if (path === '/landmarks') return json([{ landmark_id: 5, name: 'Barangay Shelter', is_holding_facility: true, barangay_id: 1, subdivision_id: null, latitude: 14.8069, longitude: 121.0039, status: 'Active' }]);
        if (path === '/adoptions/applications') return json([APPLICATION]);
        if (path === '/adoptions/1/case') return json({ adoption_id: 1, case_owner_id: 42, case_owner_name: 'Head Reyes', is_owner: true, can_claim: true, can_assign: true, assignments: [] });
        if (path === '/reports/5') return json(REPORT);
        if (path === '/reports/') return json([REPORT]);
        if (path === '/reports/5/referral') return json(REFERRAL);
        return json([]);
    };
    const intercept = async ({ requestId, request }) => {
        const url = new URL(request.url);
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
        } else if (message.method === 'Fetch.requestPaused') intercept(message.params).catch(error => browserErrors.push(error.message));
        else if (message.method === 'Runtime.exceptionThrown') browserErrors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    };
    await command('Page.enable');
    await command('Runtime.enable');
    await command('Emulation.setTimezoneOverride', { timezoneId: 'Asia/Manila' });
    await command('Fetch.enable', { patterns: [{ urlPattern: '*://*/api/*' }, { urlPattern: '*nominatim.openstreetmap.org*' }, { urlPattern: '*tile.openstreetmap.org*' }, { urlPattern: '*basemaps.cartocdn.com*' }, { urlPattern: '*res.cloudinary.com*' }] });
    const evaluate = async expression => {
        const response = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
        return response.result.value;
    };
    const waitFor = async (expression, label) => {
        for (let i = 0; i < 200; i++) { if (await evaluate(expression)) return; await delay(100); }
        throw new Error(`Timed out: ${label}; at ${await evaluate('location.pathname')}; errors: ${browserErrors.join('; ')}; banner=${await evaluate('!!document.querySelector("[data-archive-banner]")')}; text=${(await evaluate('document.body.innerText')).replace(/\s+/g, ' ').slice(0, 700)}`);
    };
    // Buttons a person can actually see (display:none, hidden ancestors and zero size excluded)
    const visibleButtons = () => evaluate(`[...document.querySelectorAll('button')].filter(b => b.offsetParent !== null && b.getClientRects().length).map(b => b.textContent.replace(/\\s+/g, ' ').trim())`);
    const token = 'test.' + Buffer.from(JSON.stringify({ user_id: 9, exp: 4102444800 })).toString('base64') + '.test';
    await command('Page.addScriptToEvaluateOnNewDocument', { source:
        `window.alert = () => {}; try { localStorage.setItem('admin_user', JSON.stringify({ user_id: 9, name: 'Admin Reyes', role_id: 4, access_token: '${token}' })); } catch (e) {}` });

    for (const width of [1280, 390]) {
        await command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 640 });

        // Holding Archive is removed; old bookmarks open incident reports without loading a holding list.
        const holdingBefore = holdingReads.length;
        await command('Page.navigate', { url: base + '/admin/holding-facility' });
        await waitFor(`location.pathname === '/admin/incidents' && !!document.querySelector('button[title="Direct Admin Action / Override"]')`, 'removed holding archive redirects');
        assert.equal(await evaluate(`!!document.querySelector('a[href="/admin/holding-facility"]')`), false, 'Holding Archive removed from desktop/mobile navigation');
        assert.equal(await evaluate(`!!document.querySelector('[data-archive-banner]')`), false, 'holding archive not mounted');
        assert.equal(holdingReads.length, holdingBefore, 'no holding page list/metrics loaded');
        console.log(`PASS ${width}px Holding Archive removed; old URL redirects to incidents; no holding fetch`);
        let buttons;

        // 2. Adoption archive
        await command('Page.navigate', { url: base + '/admin/adoptions' });
        await waitFor(`!!document.querySelector('[data-archive-banner]') && document.body.innerText.includes('Maria Santos')`, 'adoption archive list');
        buttons = await visibleButtons();
        for (const gone of ['Approve', 'Reject'])
            assert.equal(buttons.some(b => b.trim() === gone), false, `${width}px adoptions list: "${gone}" hidden (${buttons.join(' | ')})`);
        const hiddenMarked = await evaluate(`[...document.querySelectorAll('[data-archive-write]')].every(b => getComputedStyle(b).display === 'none')`);
        assert.equal(hiddenMarked, true, `${width}px adoptions: every marked action is hidden`);
        console.log(`PASS ${width}px /admin/adoptions: archive banner; Approve and Reject hidden`);

        // 3. Admin report view
        await command('Page.navigate', { url: base + '/admin/incidents/5' });
        await waitFor(`/Record Barangay update/i.test(document.body.innerText)`, 'loaded referral card on the admin report');
        const page = await evaluate(`document.body.innerText`);
        assert.equal(/Admit Animal to Holding/i.test(page), false, `${width}px report: no "Admit to holding"`);
        assert.match(page, /Record Barangay update/i, `${width}px report: admin can record a Barangay update`);
        assert.equal(/Official Escalation & Custodial Endorsement|Receiving Municipal Authority|transferring custody from/i.test(page), false, 'referral document does not invent a custody transfer');
        assert.match(page, /outside StraySafe/i, 'Barangay work is labelled external');
        assert.match(page, /K1/, 'recorded holding enclosure remains visible within the report');
        console.log(`PASS ${width}px /admin/incidents/5: referral card shown; no "Admit Animal to Holding"`);
    }

    // Direct Override offers no dispatch, pick-up or impound
    await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('Direct Override')).click()`);
    await waitFor(`!!document.querySelector('select option[value="11"]')`, 'override form');
    const options = await evaluate(`[...document.querySelector('select option[value="11"]').parentElement.options].map(o => o.textContent.trim())`);
    for (const gone of ['Rescue in Progress / Dispatched', 'Picked Up', 'Impounded']) assert.equal(options.includes(gone), false, `override: no "${gone}"`);
    assert.ok(options.includes('Referred to Barangay'), 'override: status 4 reads "Referred to Barangay"');
    console.log(`PASS Direct Override options: ${options.join(', ')}`);

    // The reports list has its own action picker and accepts old escalation bookmarks.
    await command('Page.navigate', { url: base + '/admin/incidents?status=Escalated%20to%20Barangay' });
    await waitFor(`!!document.querySelector('button[title="Direct Admin Action / Override"]')`, 'old status bookmark still finds the referred report');
    assert.equal(await evaluate(`document.querySelector('select option[value="Referred to Barangay"]').parentElement.value`), 'Referred to Barangay');
    await evaluate(`document.querySelector('button[title="Direct Admin Action / Override"]').click()`);
    await waitFor(`document.body.textContent.includes('Target Action & Status')`, 'list action picker');
    const actions = await evaluate(`document.querySelector('form').textContent`);
    for (const gone of ['Team Dispatched', 'Approved by Barangay', 'Picked Up', 'Impounded']) assert.equal(actions.includes(gone), false, `list action: no ${gone}`);
    assert.equal(await evaluate(`document.querySelector('form button[type="submit"]').disabled`), false, 'a permitted action is selected by default');
    console.log('PASS reports list: old Escalated bookmark works; retired statuses are not offered');

    REPORT.status_id = 7; REPORT.current_status_id = 7; REPORT.endorsement_letter = null;
    REPORT.history = [{ history_id: 7, report_status_id: 7, created_at: '2026-11-05T09:00:00',
        updater_name: 'Leader Santos', remarks: 'Owner observed at home; no holding intake recorded.', media: [] }];
    await command('Page.navigate', { url: base + '/admin/incidents/5' });
    await waitFor(`/OWNER OBSERVATION UPDATE/i.test(document.body.innerText)`, 'Admin observation audit event');
    assert.equal(/ADMITTED TO HOLDING PLACE|TRANSFERRED TO OBSERVATION/i.test(await evaluate('document.body.innerText')), false, 'Admin does not show status 7 as a physical transfer');
    console.log('PASS Admin status 7: owner observation, no invented custody transfer');

    assert.deepEqual(writes, [], 'no write requests were sent');
    // Each current action still submits status and remarks; none assigns an arbitrary responder.
    const fieldValue = (selector, value) => evaluate(`(() => {
        const e = document.querySelector(${JSON.stringify(selector)});
        Object.getOwnPropertyDescriptor(e.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLTextAreaElement.prototype, 'value').set.call(e, ${JSON.stringify(value)});
        e.dispatchEvent(new Event(e.tagName === 'SELECT' ? 'change' : 'input', {bubbles:true}));
    })()`);
    for (const width of [390, 1280]) {
        await command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 640 });
        for (const status of [2, 4, 7, 11, 3, 14]) {
            await command('Page.navigate', { url: base + '/admin/incidents/5' });
            await waitFor(`!![...document.querySelectorAll('button')].find(b => b.textContent.includes('Direct Override'))`, 'report override');
            await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('Direct Override')).click()`);
            await waitFor(`!!document.querySelector('form select option[value="11"]')`, 'detail status picker');
            const ids = await evaluate(`[...document.querySelector('form select').options].map(o => Number(o.value))`);
            assert.deepEqual(ids, [2, 4, 7, 11, 3, 14]);
            assert.equal(await evaluate(`document.querySelectorAll('form select').length`), 1, 'no dispatch personnel selector');
            await fieldValue('form select', String(status));
            await fieldValue('form textarea', 'Synthetic administrative reason');
            const before = writes.length;
            await evaluate(`document.querySelector('form button[type="submit"]').click()`);
            await waitFor(`!document.querySelector('form select option[value="11"]')`, 'override saved');
            assert.equal(writes.length, before + 1);
            assert.deepEqual(writes.at(-1), {method:'PUT',path:'/reports/5/status',body:{status_id:status,remarks:'Synthetic administrative reason'}});
        }
        for (const [label, status] of [['Under Investigation',16],['False Alarm / Dismissed',14]]) {
            await command('Page.navigate', { url: base + '/admin/incidents' });
            await waitFor(`!!document.querySelector('button[title="Direct Admin Action / Override"]')`, 'report list action');
            await evaluate(`document.querySelector('button[title="Direct Admin Action / Override"]').click()`);
            await waitFor(`!!document.querySelector('form textarea')`, 'list status picker');
            assert.equal(await evaluate(`document.querySelector('form').textContent.includes('Assign Rescue')`), false);
            await evaluate(`[...document.querySelectorAll('form div.cursor-pointer')].find(e => e.textContent.includes(${JSON.stringify(label)})).click()`);
            await fieldValue('form textarea', 'Synthetic list reason');
            const before = writes.length;
            await evaluate(`document.querySelector('form button[type="submit"]').click()`);
            await waitFor(`!document.querySelector('form textarea')`, 'list override saved');
            assert.equal(writes.length, before + 1);
            assert.deepEqual(writes.at(-1), {method:'PUT',path:'/reports/5/status',body:{status_id:status,remarks:'Synthetic list reason'}});
        }
    }
    for (const status of [5,6,8,13]) {
        REPORT.status_id = status; REPORT.current_status_id = status;
        REPORT.history = [{history_id:status,report_status_id:status,created_at:'2026-11-05T09:00:00',updater_name:'Synthetic historic recorder',remarks:'Synthetic saved history',media:[]}];
        await command('Page.navigate', {url:base+'/admin/incidents/5'});
        await waitFor(`document.body.textContent.includes('Synthetic saved history')`, `historical status ${status}`);
        await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('Direct Override')).click()`);
        await waitFor(`!!document.querySelector('form select option[value="11"]')`, 'current picker on historical report');
        assert.equal(await evaluate(`[...document.querySelector('form select').options].some(o => [5,6,8,13].includes(Number(o.value)))`), false);
    }
    assert.deepEqual(staffReads, [], 'no unused responder directory requests');
    assert.equal(browserErrors.length, 0, browserErrors.join('\n'));
    console.log('PASS 16 supported status-only writes mocked at 390/1280px; four historical status reads; no responder fetch/assignment; retired holding route and adoption archive sent no writes');
} finally {
    if (command) { try { await command('Browser.close'); } catch {} }
    socket?.close();
    browser.kill();
    const resolvedProfile = resolve(profile);
    if (resolvedProfile.startsWith(resolve(tmpdir()) + '\\straysafe-admin-archive-test-')) {
        await rm(resolvedProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
    }
}
