// Phase 1: mocked Admin account retirement and referral screen/print regression.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const base = process.env.PHASE1_ADMIN_TEST_URL || 'http://127.0.0.1:5173';
const chromeBin = process.env.CHROME_BIN || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile = await mkdtemp(join(tmpdir(), 'straysafe-admin-retirement-test-'));
const delay = ms => new Promise(r => setTimeout(r, ms));
const browser = spawn(chromeBin, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-background-networking', 'about:blank'], { windowsHide: true, stdio: 'ignore' });

const REPORT = { report_id: 5, user_id: 7, subdivision_id: 1, category_id: 4, status_id: 4, current_status_id: 4, reporter_name: 'Resident One',
    created_at: '2026-11-05T08:00:00', updated_at: '2026-11-05T09:00:00', latitude: 14.8018, longitude: 121.0028, landmark: 'Phase 1 Gate',
    description: 'Aggressive dog near the playground.', visibility: 'Private', media: [], comments: [], animal_type: 'Dog', animal_count: 1,
    endorsement_letter: { letter_id: 1, title: 'Endorsement for Report #5', letter_content: 'Aggressive dog', leader_name: 'Leader Santos' },
    history: [{ history_id: 2, report_status_id: 4, created_at: '2026-11-05T09:00:00', updater_name: 'Leader Santos',
        remarks: 'Referred to Barangay San Vicente by Leader Santos (phone call). Reason: Aggressive dog', media: [] }],
    disputes: [], merged_reports: [] };
let report = { ...REPORT, subdivision_name: 'Demo Subdivision', barangay_name: 'Demo Barangay', assigned_leader_name: 'Leader Demo',
    endorsement_letter: {letter_id: 1, leader_name: 'Leader Demo'} };
const users = [1, 2, 4, 3].map(role_id => ({user_id: 10 + role_id, role_id, name: `Demo role ${role_id}`, email: `role${role_id}@example.com`,
    phone: null, subdivision_id: 1, barangay_id: 1, barangay_name: 'Demo Barangay', city: 'Demo City', status:'Active',
    is_verified:true, is_head_officer: role_id === 3, position_name: role_id === 3 ? 'Barangay Captain' : null,
    created_at:'2026-11-01T08:00:00', invite_pending: role_id === 3}));
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
    const writes = [];
    const json = (body, status = 200) => ({ status, body });
    const answer = (url, method, postData) => {
        const path = url.pathname.replace(/^\/api/, '');
        if (method !== 'GET' && method !== 'OPTIONS') writes.push({method, path, payload: postData ? JSON.parse(postData) : null});
        if (path === '/auth/verify-session') return json({status:'valid', role_id:4, is_verified:true});
        if (path === '/users/positions/list') return json([{position_id:1, position_name:'Barangay Captain'}, {position_id:2, position_name:'Barangay Field Staff'}, {position_id:3, position_name:'Subdivision Secretary'}]);
        if (path === '/users/' || path === '/users') return json(users);
        if (path === '/users/admin-create') return json({user_id:88, invite_sent:true}, 200);
        if (path.startsWith('/users/')) return json(users.find(u => path.endsWith('/' + u.user_id)) || {});
        if (path === '/reports/5/referral') return json({referral_id:1, report_id:5, barangay_name:'Demo Barangay', referred_by_name:'Leader Demo', referred_at:'2026-11-05T09:00:00', reason:'Demo referral', contact_method:'call', report_status_id:4, final_outcome:null, updates:[]});
        if (path === '/reports/5') return json(report);
        if (path === '/reports/') return json([report]);
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
        } else if (message.method === 'Page.loadEventFired') pageLoads++;
        else if (message.method === 'Fetch.requestPaused') intercept(message.params).catch(error => {if (!error.message.includes('Invalid InterceptionId.')) browserErrors.push(error.message);});
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
        `try { localStorage.setItem('admin_user', JSON.stringify({ user_id: 9, name: 'Admin Reyes', role_id: 4, access_token: '${token}' })); } catch (e) {}` });

    const navigate = async path => {
        const before = pageLoads;
        await command('Page.navigate', {url:base + path});
        for (let i=0; pageLoads <= before && i<200; i++) await delay(100);
        assert.ok(pageLoads > before, 'new page loaded');
    };
    const click = async (selector, label) => {
        assert.equal(await evaluate(`(() => { const el=[...document.querySelectorAll(${JSON.stringify(selector)})].find(el=>el.textContent.trim().includes(${JSON.stringify(label)})); if(!el)return false;el.click();return true;})()`), true, `found ${label}`);
    };
    const setValue = (selector,value) => evaluate(`(() => {const el=document.querySelector(${JSON.stringify(selector)});const proto=el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);
    for(const width of [1280,390]) {
        await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<768});
        await navigate('/admin/users');
        await waitFor(`document.querySelector('tbody')?.innerText.includes('Demo role 1')`, 'supported accounts');
        assert.equal(await evaluate(`document.querySelector('tbody').innerText.includes('Demo role 3')`), false, 'historical accounts separated from default list');
        await click('button','Add New User');
        await waitFor(`!!document.querySelector('[data-account-form]')`, 'account form opens');
        assert.deepEqual(await evaluate(`[...document.querySelector('[aria-label="User Role"]').options].map(o=>o.value)`), ['1','2','4'], 'only supported roles may be provisioned');
        assert.equal(await evaluate(`/head officer|tactical command|Barangay Captain/i.test(document.querySelector('[data-account-form]').innerText)`),false,'no head designation controls');
        await setValue('[aria-label="User Role"]','2');
        await waitFor(`!!document.querySelector('[aria-label="Official designation"]')`, 'designation picker');
        assert.equal(await evaluate(`[...document.querySelector('[aria-label="Official designation"]').options].some(o=>/barangay|punong|tanod/i.test(o.textContent))`), false, 'old dynamic Barangay positions excluded');
        await setValue('[data-account-form] input[name="name"]','New Demo Leader');
        await setValue('[data-account-form] input[name="email"]',`new${width}@example.com`);
        await click('[data-account-form] button','Create User');
        await waitFor(`!document.querySelector('[data-account-form]')`, 'supported account submitted');
        const created=writes.find(w=>w.path==='/users/admin-create'&&w.payload.email===`new${width}@example.com`);
        assert.ok(created && created.payload.role_id===2 && created.payload.is_head_officer===false,'normal creation still works');
        await setValue('[aria-label="Filter users by role"]','3');
        await waitFor(`!!document.querySelector('[data-historical-accounts]') && document.querySelector('tbody')?.innerText.includes('Demo role 3')`, 'historical account readable');
        assert.equal(await evaluate(`document.querySelector('tbody').querySelectorAll('button').length`),0,'no edit/delete/invite/designate actions on historical rows');
        assert.equal(await evaluate(`document.querySelector('tbody').innerText.includes('Read-only history; sign-in unavailable')`),true,'history explicitly labelled');
        await setValue('[aria-label="Filter users by role"]','all');
        await waitFor(`document.querySelector('tbody')?.innerText.includes('Demo role 1')`, 'supported list restored');
        await evaluate(`(() => {const row=[...document.querySelectorAll('tbody tr')].find(el=>el.textContent.includes('Demo role 1'));row.querySelector('button').click();})()`);
        await click('button','Edit User');
        await waitFor(`!!document.querySelector('[data-account-form]')`, 'supported account edit form');
        assert.deepEqual(await evaluate(`[...document.querySelector('[aria-label="User Role"]').options].map(o=>o.value)`), ['1','2','4'], 'edit form cannot convert a supported account to role 3');
        await setValue('[data-account-form] input[name="name"]','Edited Demo Resident');
        await click('[data-account-form] button','Save Changes');
        await waitFor(`!document.querySelector('[data-account-form]')`, 'supported account edit submitted');
        assert.ok(writes.some(w=>w.method==='PUT'&&w.path==='/users/11'&&w.payload.role_id===1),'supported edit still works');
        console.log(`PASS ${width}px supported account creation, role/position choices and read-only Barangay history`);

        const saved='Historical saved custody wording <kept verbatim>.\n'+ 'Original letter text and prior transfer details. '.repeat(5);
        for(const [kind,letter] of [
            ['current-no-content',{letter_id:1,leader_name:'Leader Demo'}],
            ['current-whitespace',{letter_id:1,letter_content:'   ',leader_name:'Leader Demo'}],
            ['legacy-object',{letter_id:1,letter_content:saved,leader_name:'Leader Demo',issued_at:'2026-10-01T08:00:00'}],
            ['legacy-string',saved]
        ]) {
            report={...report,endorsement_letter:letter};
            await navigate('/admin/incidents/5');
            await waitFor(`/Barangay Referral Document/i.test(document.body.innerText)`,'referral details loaded');
            await click('button','View Official Document');
            await waitFor(`!!document.querySelector('#admin-endorsement-certificate')`,'referral preview');
            const preview=await evaluate(`document.querySelector('#admin-endorsement-certificate').textContent`);
            assert.ok(preview.includes('BARANGAY REFERRAL LETTER')&&preview.includes('outside StraySafe'),'neutral referral wrapper');
            assert.equal(/Custody Acknowledged|Digitally Certified|Endorsement Certified|Formal Municipal Record/i.test(preview),false,'no unrecorded signatures/certification');
            if(kind.startsWith('current')) {
                assert.ok(preview.includes('Referred by Demo Subdivision to Barangay Demo Barangay.'),'shared referral fallback');
                assert.equal(/custodial transfer|has undergone initial temporary holding|impounded animal|rabies watch|quarantine/i.test(preview),false,'current fallback does not invent custody');
                assert.ok(preview.includes('Report Date:'),'report creation date not labelled as letter issuance');
            } else assert.ok(preview.includes(saved),'saved letter is preserved verbatim, including line breaks and angle brackets');
            if(kind==='legacy-string') assert.ok(preview.includes('Not recorded'),'missing recorder is not inferred from the assigned handler');
            await evaluate(`(() => {[...document.querySelectorAll('button')].find(el=>el.textContent.includes('Print Referral')).click();for(const frame of document.querySelectorAll('iframe'))frame.contentWindow.print=()=>{};})()`);
            await waitFor(`!![...document.querySelectorAll('iframe')].find(f=>f.contentDocument?.querySelector('#admin-endorsement-certificate'))`,'print document generated');
            const printed=await evaluate(`[...document.querySelectorAll('iframe')].find(f=>f.contentDocument?.querySelector('#admin-endorsement-certificate')).contentDocument.querySelector('#admin-endorsement-certificate').textContent`);
            assert.equal(printed,preview,'print document matches the on-screen preview exactly');
            console.log(`PASS ${width}px ${kind}: accurate referral wrapper, preserved content and matching print output`);
        }
    }
    assert.equal(writes.some(w=>w.path.includes('assign-head') || w.payload?.role_id===3 || w.payload?.is_head_officer===true),false,'no retired account operations submitted');
    assert.equal(browserErrors.length,0,browserErrors.join('\n'));
    console.log('PASS Phase 1 browser regression; API calls mocked, print dialog suppressed, no uncaught errors');
} finally {
    if (command) { try { await command('Browser.close'); } catch {} }
    socket?.close();
    browser.kill();
    const resolvedProfile = resolve(profile);
    if (resolvedProfile.startsWith(resolve(tmpdir()) + '\\straysafe-admin-retirement-test-')) {
        await rm(resolvedProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
    }
}
