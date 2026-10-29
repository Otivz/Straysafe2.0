// Run with Vite on port 5173: node frontend/tests/ownerWarnings.browser.mjs
// Owner follow-up Phase 5E screens: caution, Rabies Risk, repeated-report banners and the leader's identity check.
// Uses an isolated Chrome profile and intercepts every API call; no live data is changed.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const base = process.env.OWNER_WARNINGS_TEST_URL || 'http://127.0.0.1:5173';
const chromeBin = process.env.CHROME_BIN || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile = await mkdtemp(join(tmpdir(), 'straysafe-owner-warnings-test-'));
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
    let posts = [];
    const now = new Date();
    const iso = d => d.toISOString().slice(0, 19);
    const followUp = (contacts = [], id = 11, hasAccount = true) => ({
        followup_id: id, report_id: id === 11 ? 1 : 12, status: 'Observing', label: 'Under Observation', opened_at: iso(new Date(now - 3600e3)),
        due_at: iso(new Date(+now + 2 * 86400e3)), days_left: 2, is_due: false, extended: false, acknowledged: false,
        pet_name: 'Bantay', owner_user_id: hasAccount ? 21 : null, owner_has_account: hasAccount, owner_name: 'Olga Owner', contacts,
        caution: 'Take care: it was reported as Aggressive and it has High priority. You can escalate to the Barangay at any time instead of waiting for the observation to end.',
        unlogged_repeat_report_ids: contacts.some(c => c.related_report_id === 5) ? [] : [5],
    });
    const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="fixture"></div><script type="module">
        import RefreshRuntime from '/@react-refresh';
        RefreshRuntime.injectIntoGlobalHook(window);
        window.$RefreshReg$ = () => {};
        window.$RefreshSig$ = () => type => type;
        window.__vite_plugin_react_preamble_installed__ = true;
        await import('/@vite/client');
        await import('/tests/fixtures/ownerWarnings.tsx');
    </script></body></html>`;
    const intercept = async ({ requestId, request }) => {
        const url = new URL(request.url);
        let body = null;
        let contentType = 'application/json';
        if (url.pathname === '/__owner_warnings__') { body = fixture; contentType = 'text/html'; }
        else {
            const path = url.pathname.replace(/^\/api/, '');
            if (request.method === 'PATCH' && path === '/warnings/40/acknowledge') {
                posts.push({ path, body: {} });
                body = { warning_id: 40, report_id: 2, warning_level: 'Notice', violation_type: 'Free-Roaming Unleashed', description: 'Please paki tali po yung ating aso', status: 'Acknowledged', acknowledged_at: iso(now) };
            } else if (path === '/warnings/my-warnings') {
                body = [{ warning_id: 40, report_id: 2, warning_level: 'Notice', violation_type: 'Free-Roaming Unleashed', description: 'Please paki tali po yung ating aso', status: 'Pending', created_at: iso(now) },
                    { warning_id: 41, report_id: 99, warning_level: '1st Warning', violation_type: 'Other', description: 'another report', status: 'Pending', created_at: iso(now) }];
            } else if (path === '/owner-followups/by-report/2') {
                body = { followup_id: 30, report_id: 2, status: 'Observing', label: 'Under Observation', opened_at: iso(now), due_at: iso(new Date(+now + 2 * 86400e3)),
                    days_left: 2, is_due: false, extended: false, acknowledged: true, acknowledged_at: iso(now), pet_name: 'Rocky', my_updates: [] };
            } else if (request.method === 'POST' && path === '/claims/custody-answer') {
                posts.push({ path, body: JSON.parse(request.postData || '{}') });
                body = { report_id: 1, answer: JSON.parse(request.postData || '{}').answer };
            } else if (request.method === 'POST' && path === '/claims/77/close-not-needed') {
                posts.push({ path, body: {} });
                body = { claim_id: 77, status: 'Rejected', remarks: 'Not needed: the pet is home', closed_not_needed: true, animal_held: false };
            } else if (request.method === 'POST') {
                const sent = JSON.parse(request.postData || '{}');
                posts.push({ path, body: sent });
                if (path === '/owner-followups/11/contacts') body = followUp([{ contact_id: posts.length, contacted_at: iso(now), method: sent.method, note: sent.note, related_report_id: sent.related_report_id, contacted_by_name: 'Leo Leader' }]);
                else if (path === '/owner-followups/12/contacts') body = followUp([{ contact_id: 99, contacted_at: iso(now), method: sent.method, note: sent.note }], 12, false);
                else if (path === '/matches/3/leader-verify-identity') body = { match_id: 3, status: 'CONFIRMED_MATCH', owner_confirmation_status: 'LEADER_VERIFIED' };
                else throw new Error(`unexpected write: ${path}`);
            } else if (path === '/owner-followups/by-report/1') body = followUp();
            else if (path === '/owner-followups/by-report/12') body = followUp([], 12, false);
            else if (path === '/warnings/report/1') body = [{ warning_id: 1, report_id: 1, warning_level: 'Notice', violation_type: 'Free-Roaming Unleashed', status: 'Pending', created_at: iso(now) }];
            else if (path.startsWith('/warnings/report/')) body = [];
            else if (path.startsWith('/owner-followups/by-report/')) body = null;
            else if (path === '/owner-followups' && url.searchParams.get('pet_id') === '3') body = [{
                ...followUp([{ contact_id: 1, contacted_at: iso(now), method: 'Repeated incident', note: 'seen again', related_report_id: 5 },
                    { contact_id: 2, contacted_at: iso(now), method: 'Phone', note: 'Verbal warning: keep the dog inside' }]),
                status: 'Escalated', label: 'Escalated', closed_at: iso(now), closing_outcome: 'Escalated to the Barangay',
            }];
            else body = [];
        }
        await command('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: contentType }, { name: 'Access-Control-Allow-Origin', value: '*' }], body: Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)).toString('base64') });
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
    await command('Network.setBlockedURLs', { urls: ['*res.cloudinary.com*', '*unsplash.com*'] });
    await command('Fetch.enable', { patterns: [{ urlPattern: '*://*/api/*' }, { urlPattern: '*://*/__owner_warnings__*' }] });
    const evaluate = async expression => {
        const response = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
        return response.result.value;
    };
    const waitFor = async (expression, label) => {
        for (let i = 0; i < 150; i++) { if (await evaluate(expression)) return; await delay(100); }
        throw new Error(`Timed out: ${label}; errors: ${browserErrors.join("; ")}; posts: ${JSON.stringify(posts)}`);
    };
    const text = id => `(document.querySelector('[data-testid="${id}"]')?.textContent || '')`;
    const click = (id, label) => evaluate(`(() => {
        const b = Array.from(document.querySelectorAll('[data-testid="${id}"] button')).find(x => x.textContent.includes(${JSON.stringify(label)}));
        if (!b) return 'missing';
        b.click();
        return 'clicked';
    })()`);
    const setValue = (id, selector, value) => evaluate(`(() => {
        const el = document.querySelector('[data-testid="${id}"] ${selector}');
        const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
        setter.call(el, ${JSON.stringify(value)});
        el.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);

    for (const width of [390, 1280]) {
        posts = [];
        await command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 640 });
        await command('Page.navigate', { url: base + '/__owner_warnings__' });

        // caution while observing, and the repeated report on the observed report's card
        await waitFor(`${text('observing')}.includes('Take care: it was reported as Aggressive')`, 'caution banner on the observing card');
        await waitFor(`${text('observing')}.includes('was reported again during the observation') && ${text('observing')}.includes('Report #5')`, 'repeat banner on the card');
        assert.notEqual(await click('observing', 'Log as repeated incident'), 'missing', 'one-click log button');
        await waitFor(`!${text('observing')}.includes('Log as repeated incident') && ${text('observing')}.includes('Repeated incident')`, 'repeat banner goes once logged, the entry is in the log');
        const logged = posts.find(p => p.path === '/owner-followups/11/contacts');
        assert(logged && logged.body.method === 'Repeated incident' && logged.body.related_report_id === 5 && logged.body.note.length >= 3, 'logged as a repeated incident of Report #5');

        // one warning per incident: the observed report has its Notice; the logged repeat gets its own Issue action
        await waitFor(`${text('observing')}.includes('Report #1 · this report') && ${text('observing')}.includes('Notice · Free-Roaming Unleashed')`, 'the warning of the observed report is listed');
        await waitFor(`${text('observing')}.includes('Report #5 · repeated incident') && ${text('observing')}.includes('No warning for this incident')`, 'the repeat is listed without a warning');
        assert.notEqual(await click('observing', 'Issue warning'), 'missing', 'issue action for the repeat');
        const targets = await evaluate('window.warningTargets()');
        const t = targets.at(-1);
        assert(t && t.reportId === 5 && t.prefill.includes('Reported again during the observation in Report #5') && t.prefill.includes('under observation from'), `warning form opens for Report #5, prefilled: ${JSON.stringify(t)}`);

        // owner without an account: a verbal warning is a contact entry
        await waitFor(`${text('offline-owner')}.includes('Log verbal warning')`, 'verbal warning offered');
        assert.notEqual(await click('offline-owner', 'Log verbal warning'), 'missing', 'open verbal warning');
        await setValue('offline-owner', 'input[aria-label="What the owner was told"]', 'Keep the dog inside; next time it goes to the Barangay');
        assert.notEqual(await click('offline-owner', 'Log verbal warning'), 'missing', 'save verbal warning');
        await waitFor(`${text('offline-owner')}.includes('Verbal warning: Keep the dog inside')`, 'verbal warning in the log');
        const verbal = posts.find(p => p.path === '/owner-followups/12/contacts');
        assert(verbal && verbal.body.method === 'Phone' && verbal.body.note.startsWith('Verbal warning: '), 'saved as a Phone contact entry');

        // Rabies Risk: no start button, the reason and an escalation instead
        await waitFor(`${text('rabies')}.includes('A Rabies Risk report cannot be observed')`, 'Rabies Risk message');
        assert.equal(await evaluate(`${text('rabies')}.includes('Start 3-day observation')`), false, 'no start button on a Rabies Risk report');
        assert.equal(await evaluate(`${text('rabies')}.includes('Escalate to Barangay')`), true, 'escalation offered');

        // caution before the observation starts (Injured)
        await waitFor(`${text('caution-before-start')}.includes('it was reported as Injured') && ${text('caution-before-start')}.includes('Start 3-day observation')`, 'caution before start');

        // the new report's banner: log it on the observed report
        await waitFor(`${text('repeat-banner')}.includes('Bantay is under an owner follow-up on') && ${text('repeat-banner')}.includes('Report #1')`, 'banner on the new report');
        assert.notEqual(await click('repeat-banner', 'Log on Report #1'), 'missing', 'banner log button');
        await waitFor(`${text('repeat-banner')}.includes('Logged as a repeated incident on')`, 'banner shows it was logged');

        // leader's identity check: waiting before 24 hours, available after
        await waitFor(`${text('identity-waiting')}.includes('If there is still no answer by')`, 'waiting message before 24 hours');
        assert.equal(await evaluate(`${text('identity-waiting')}.includes('Confirm identity')`), false, 'no confirm button before 24 hours');
        assert.notEqual(await click('identity-ready', 'Confirm identity'), 'missing', 'confirm button after 24 hours');
        await waitFor(`${text('identity-ready')}.includes('Method: Photos and markings match')`, 'method shown');
        assert.equal(await evaluate(`Array.from(document.querySelectorAll('[data-testid="identity-ready"] button')).find(b => b.textContent.includes('Confirm and link')).disabled`), true, 'confirm disabled without a reason');
        await setValue('identity-ready', 'textarea', 'Same white blaze on the chest and torn left ear');
        assert.notEqual(await click('identity-ready', 'Confirm and link'), 'missing', 'confirm and link');
        await waitFor(`window.identityConfirmed() === 1`, 'the page is told the identity was confirmed');
        const sent = posts.find(p => p.path === '/matches/3/leader-verify-identity');
        assert(sent && sent.body.method === 'Photos and markings match' && sent.body.reason.includes('white blaze'), 'method and reason sent');

        const overflow = await evaluate(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
        assert(overflow <= 0, `no sideways scroll at ${width}px (overflow ${overflow})`);
        console.log(`PASS ${width}px: caution, Rabies Risk, repeat banners with one-click log, identity check wait and confirm, one warning per incident with prefill, verbal warning, no sideways scroll`);
    }
    // Pet record: the owner follow-up is in the Pet History (Phase 5F)
    await command('Page.navigate', { url: base + '/__owner_warnings__?view=pet' });
    await waitFor(`Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Pet History'))`, 'pet record loads');
    await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Pet History')).click()`);
    await waitFor(`document.body.textContent.includes('Owner follow-up (Report #1)')`, 'follow-up in the pet history');
    const history = await evaluate('document.body.textContent');
    assert(history.includes('Outcome: Escalated to the Barangay') && history.includes('Repeated incidents: Report #5') && history.includes('Verbal warnings: 1'),
        'the follow-up entry shows the outcome, the repeat and the verbal warning');
    console.log('PASS pet record: owner follow-up with its outcome, repeated incident and verbal warning in Pet History');

    // The owner's report page: the warning for this report is shown with the follow-up, acknowledged after ticking the box
    posts = [];
    await command('Page.navigate', { url: base + '/__owner_warnings__?view=owner' });
    await waitFor(`${text('owner')}.includes('Subdivision notices') && ${text('owner')}.includes('Please paki tali po yung ating aso')`, 'the warning shows on the report');
    assert.equal(await evaluate(`${text('owner')}.includes('another report')`), false, 'a warning about another report is not shown here');
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('[data-testid="owner"] button')).find(b => b.textContent.includes('Acknowledge notice')).disabled`), true, 'acknowledge needs the box ticked');
    await evaluate(`document.querySelector('[data-testid="owner"] input[type="checkbox"]').click()`);
    assert.notEqual(await click('owner', 'Acknowledge notice'), 'missing', 'acknowledge after ticking');
    await waitFor(`${text('owner')}.includes('You acknowledged this notice')`, 'acknowledged on the report');
    assert(posts.some(p => p.path === '/warnings/40/acknowledge'), 'the acknowledgement was sent for warning 40');
    console.log('PASS owner report page: the warning shows with the follow-up and is acknowledged after ticking the box');

    // Phase 6: the owner answers "home" instead of filing a claim; staff close an unneeded claim
    posts = [];
    await command('Page.navigate', { url: base + '/__owner_warnings__?view=custody' });
    await waitFor(`${text('custody')}.includes("Yes, it's home") && ${text('not-needed')}.includes('Nobody is holding this animal')`, 'custody views load');
    assert(await evaluate(`${text('not-needed')}.includes('The owner says Rocky is home.')`), 'the staff panel shows the owner answer');
    await setValue('custody', 'textarea', 'Came back this morning');
    assert.notEqual(await click('custody', "Yes, it's home"), 'missing', 'answer home');
    await waitFor(`${text('custody')}.includes('You said Rocky is home.')`, 'the answer is shown');
    const sentAnswer = posts.find(p => p.path === '/claims/custody-answer');
    assert(sentAnswer && sentAnswer.body.answer === 'home' && sentAnswer.body.pet_id === 3 && sentAnswer.body.note === 'Came back this morning', 'answer sent with the note');
    assert.notEqual(await click('not-needed', 'Close: not needed'), 'missing', 'close not needed');
    await waitFor(`window.closedClaims().length === 1`, 'the page gets the closed claim');
    assert(posts.some(p => p.path === '/claims/77/close-not-needed'), 'close request sent');
    console.log('PASS Phase 6: the owner says the pet is home (with a note); staff close an unneeded claim');

    // Activity Timeline: the observation's start, extension and end
    await command('Page.navigate', { url: base + '/__owner_warnings__?view=timeline' });
    await waitFor(`${text('timeline')}.includes('UNDER OBSERVATION')`, 'observation start in the timeline');
    const tl = await evaluate(text('timeline'));
    assert(tl.includes('observing whether the pet is kept confined until Nov 01, 2026'), 'the start says until when');
    assert(tl.includes('OBSERVATION EXTENDED') && tl.includes('until Nov 04, 2026'), 'the extension with its new date');
    assert(tl.includes('OBSERVATION ENDED') && tl.includes('The observation ended: Owner complied.'), 'the end with its outcome');
    assert(!tl.includes('ESCALATED TO BARANGAY'), 'not mistaken for an escalation');
    console.log('PASS Activity Timeline: under observation, extended and ended entries');

    assert.equal(browserErrors.length, 0, browserErrors.join('\n'));
    console.log('PASS no uncaught browser errors; all API requests mocked');
} finally {
    if (command) { try { await command('Browser.close'); } catch {} }
    socket?.close();
    browser.kill();
    // Only remove the isolated profile created by this test, after verifying its absolute parent and prefix.
    const resolvedProfile = resolve(profile);
    if (resolvedProfile.startsWith(resolve(tmpdir()) + '\\straysafe-owner-warnings-test-')) {
        await rm(resolvedProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
    }
}
