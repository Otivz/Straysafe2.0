// Run with Vite on port 5173: node frontend/tests/barangayReferral.browser.mjs
// Subdivision-only Phase 3a: the leader refers a case to the Barangay (no rescue request), records Barangay updates on
// the referral card, sees them labelled "Reported by Barangay" in the timeline, and lists referrals on /subd/endorsements.
// The retired holding and pet-claims pages redirect there. Isolated Chrome profile and a mocked API; no live data.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const base = process.env.REFERRAL_TEST_URL || 'http://127.0.0.1:5173';
const chromeBin = process.env.CHROME_BIN || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile = await mkdtemp(join(tmpdir(), 'straysafe-referral-test-'));
const delay = ms => new Promise(r => setTimeout(r, ms));
const browser = spawn(chromeBin, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-background-networking', 'about:blank'], { windowsHide: true, stdio: 'ignore' });

const LEADER_ID = 42;
const baseReport = {
    report_id: 5, user_id: 7, subdivision_id: 1, category_id: 4, reporter_name: 'Resident One', assigned_leader_id: LEADER_ID,
    assigned_leader_name: 'Leader Santos', created_at: '2026-11-05T08:00:00', updated_at: '2026-11-05T09:00:00',
    latitude: 14.8018, longitude: 121.0028, landmark: 'Phase 1 Gate', description: 'Aggressive dog near the playground.',
    visibility: 'Private', media: [], endorsement_letter: null, owner_return: null, comments: [], animal_type: 'Dog', animal_count: 1,
    pet_id: 3, pet_name: 'Brownie', custody_status: 'Sighting', facility_id: null, disputes: [], merged_reports: [],
};
const verified = { ...baseReport, status_id: 2, current_status_id: 2,
    history: [{ history_id: 1, report_status_id: 2, created_at: '2026-11-05T08:30:00', updater_name: 'Leader Santos', remarks: 'Checked on site.', media: [] }] };
const referredHistory = [...verified.history,
    { history_id: 2, report_status_id: 4, created_at: '2026-11-05T09:00:00', updater_name: 'Leader Santos',
      remarks: 'Referred to Barangay San Vicente by Leader Santos (phone call). Reason: Aggressive dog near the playground', media: [] }];
const referred = { ...baseReport, status_id: 4, current_status_id: 4, endorsement_letter: { letter_id: 1, title: 'Endorsement for Report #5' }, history: referredHistory };
const referral = {
    referral_id: 1, report_id: 5, barangay_id: 1, barangay_name: 'San Vicente', referred_by: LEADER_ID, referred_by_name: 'Leader Santos',
    referred_at: '2026-11-05T09:00:00', reason: 'Aggressive dog near the playground', reference_no: 'BRGY-0042', contact_method: 'call',
    final_outcome: null, outcome_date: null, outcome_note: null, report_status_id: 4, letter_title: 'Endorsement for Report #5',
    letter_file_url: 'https://res.cloudinary.com/demo/image/upload/v1/letters/letter.jpg',
    updates: [{ update_id: 1, update_type: 'held', source: 'barangay_reported', source_label: 'Reported by Barangay', update_date: '2026-11-05',
        note: 'The dog is in the barangay pound.', evidence_url: null, recorded_by_name: 'Leader Santos', recorded_at: '2026-11-05T10:00:00' }],
};
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

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
    const calls = [];
    let current = verified;
    let currentReferral = null;
    const json = (body, status = 200) => ({ status, body });
    const answer = (url, method, body) => {
        const path = url.pathname.replace(/^\/api/, '');
        calls.push({ method, path, body });
        if (path === '/auth/verify-session') return json({ status: 'valid', role_id: 2, is_verified: true });
        if (path === '/reports/5' && method === 'GET') return json(current);
        if (path === '/reports/5/media' && method === 'POST') return json({ media_id: 9, file_url: 'https://res.cloudinary.com/demo/image/upload/v1/letters/letter.jpg' });
        if (path === '/reports/5/status' && method === 'PATCH') { current = { ...referred, endorsement_letter: null }; return json(current); }
        if (path === '/reports/5/referral' && method === 'POST') { currentReferral = { ...referral, updates: [] }; current = referred; return json(currentReferral, 201); }
        if (path === '/reports/5/referral' && method === 'GET') return currentReferral ? json(currentReferral) : json({ detail: 'This report has not been referred to the Barangay.' }, 404);
        if (path === '/referrals/1/updates' && method === 'POST') {
            const b = JSON.parse(body || '{}');
            currentReferral = { ...currentReferral, updates: [...currentReferral.updates, { ...referral.updates[0], update_id: 2, update_type: b.update_type, note: b.note, update_date: b.update_date }] };
            return json(currentReferral, 201);
        }
        if (path === '/referrals/') return json(currentReferral ? [currentReferral] : []);
        if (path.startsWith('/rescue-requests')) return json([]);
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
        } else if (message.method === 'Fetch.requestPaused') intercept(message.params).catch(error => browserErrors.push(error.message));
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

    // 1. Refer a verified case: letter upload, status 4, referral record; no rescue request
    await command('Page.navigate', { url: base + '/subd/reports/5' });
    await waitFor(`[...document.querySelectorAll('button')].some(b => b.textContent.includes('REFER TO BARANGAY'))`, 'Refer to Barangay button');
    assert.equal((await text()).includes('ESCALATE TO BARANGAY'), false, 'old Escalate wording gone');
    await clickText('button', 'REFER TO BARANGAY');
    await waitFor(`!!document.querySelector('#escalation-contact-method')`, 'referral form');
    await setValue('#escalation-contact-method', 'visit');
    await setValue('#escalation-reference-no', 'BRGY-0042');
    await evaluate(`(() => { const t = [...document.querySelectorAll('textarea')].find(e => e.placeholder.includes('Why the Barangay')); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(t, 'Aggressive dog near the playground'); t.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
    const letter = join(profile, 'letter.png');
    await writeFile(letter, PNG);
    const { root } = await command('DOM.getDocument', { depth: -1 });
    const { nodeId } = await command('DOM.querySelector', { nodeId: root.nodeId, selector: '#endorsement-file-input-view' });
    await command('DOM.setFileInputFiles', { nodeId, files: [letter] });
    await waitFor(`[...document.querySelectorAll('button')].some(b => b.textContent.includes('RECORD REFERRAL') && !b.disabled)`, 'Record referral enabled');
    await clickText('button', 'RECORD REFERRAL');
    await waitFor(`document.body.innerText.includes('Barangay updates') || document.body.innerText.includes('BARANGAY UPDATES')`, 'referral card after referring');
    const post = calls.find(c => c.method === 'POST' && c.path === '/reports/5/referral');
    assert.ok(post, 'referral created');
    const sent = JSON.parse(post.body);
    assert.equal(sent.contact_method, 'visit');
    assert.equal(sent.reference_no, 'BRGY-0042');
    assert.equal(sent.reason, 'Aggressive dog near the playground');
    assert.ok(calls.some(c => c.method === 'PATCH' && c.path === '/reports/5/status' && JSON.parse(c.body).status_id === 4), 'status 4 set (keeps the observation side effects)');
    assert.equal(calls.some(c => c.method === 'POST' && c.path.startsWith('/rescue-requests')), false, 'no rescue request created');
    console.log('PASS refer to Barangay: letter, status 4, referral (visit, BRGY-0042); no rescue request');

    // 2. Record a Barangay update on the card
    await clickText('button', 'Record Barangay update');
    await waitFor(`!!document.querySelector('form select')`, 'update form');
    await evaluate(`(() => { const s = document.querySelector('form select'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, 'picked_up'); s.dispatchEvent(new Event('change', { bubbles: true }));
        const t = document.querySelector('form textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(t, 'Team picked it up at 3 PM'); t.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
    await clickText('form button[type=submit]', 'Save');
    await waitFor(`document.body.innerText.includes('Team picked it up at 3 PM')`, 'update shown');
    const upd = JSON.parse(calls.find(c => c.method === 'POST' && c.path === '/referrals/1/updates').body);
    assert.equal(upd.update_type, 'picked_up');
    assert.equal(upd.source, 'barangay_reported');
    const card = await text();
    assert.match(card, /Animal picked up/i, 'update type label');
    assert.match(card, /Reported by Barangay, recorded by Leader Santos/, 'update labelled external with recorder');
    assert.match(card, /Record outcome/i, 'outcome action while referred');
    console.log('PASS record Barangay update: labelled "Reported by Barangay, recorded by Leader Santos"');

    // 3. Timeline: the referral and the external update, never a holding event
    const page = await text();
    assert.match(page, /REFERRED TO BARANGAY/i, 'timeline: referred entry');
    assert.match(page, /REPORTED BY BARANGAY .{0,40}Reported by Barangay San Vicente on Nov 5, 2026: picked up the animal\. Team picked it up at 3 PM/i, 'timeline: external update entry');
    assert.equal(/ANIMAL ADMITTED|HOLDING/i.test(page.split('OFFICIAL AUDIT TRAIL')[1]?.split('COMMENTS & NOTES')[0] || ''), false, 'timeline: no holding event from a Barangay "held" update');
    console.log('PASS timeline shows "Referred to Barangay" and "Reported by Barangay" entries');

    // 4. Sidebar and the referrals page
    assert.equal(/Barangay Holding|Pet Claims/.test(page), false, 'sidebar: holding and pet claims removed');
    assert.match(page, /Barangay Referrals/i, 'sidebar: Barangay Referrals');
    await command('Page.navigate', { url: base + '/subd/endorsements' });
    await waitFor(`document.body.innerText.includes('REF-001')`, 'referral listed');
    const list = await text();
    assert.match(list, /Barangay San Vicente/, 'recipient');
    assert.match(list, /Open/, 'open status');
    console.log('PASS /subd/endorsements lists the referral (REF-001, Barangay San Vicente, Open)');

    // 5. Retired leader pages redirect
    for (const old of ['/subd/holding-facility', '/subd/pet-claims']) {
        await command('Page.navigate', { url: base + old });
        await waitFor(`location.pathname === '/subd/endorsements'`, `${old} redirect`);
    }
    console.log('PASS /subd/holding-facility and /subd/pet-claims redirect to Barangay Referrals');

    // 6. Phone width: the card fits
    await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await command('Page.navigate', { url: base + '/subd/reports/5' });
    await waitFor(`document.body.innerText.includes('Team picked it up at 3 PM')`, 'card at phone width');
    assert.equal(await evaluate(`document.documentElement.scrollWidth <= window.innerWidth + 1`), true, 'no horizontal scroll at 390px');
    console.log('PASS referral card at 390px without horizontal scroll');

    const realErrors = browserErrors.filter(e => !/dialog:/.test(e));
    assert.equal(realErrors.length, 0, realErrors.join('\n'));
    assert.equal(browserErrors.length, 0, 'no alert dialogs: ' + browserErrors.join('; '));
    console.log('PASS no uncaught browser errors; all API calls mocked');
} finally {
    if (command) { try { await command('Browser.close'); } catch {} }
    socket?.close();
    browser.kill();
    const resolvedProfile = resolve(profile);
    if (resolvedProfile.startsWith(resolve(tmpdir()) + '\\straysafe-referral-test-')) {
        await rm(resolvedProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
    }
}
