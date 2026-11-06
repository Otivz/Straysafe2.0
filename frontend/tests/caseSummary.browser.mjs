// Run with Vite on port 5173: node frontend/tests/caseSummary.browser.mjs
// History Case Summary panel: final outcome, verification (with the history fallback, F17), animal and priority.
// Uses an isolated Chrome profile and intercepts every API call; no live data is changed.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const base = process.env.CASE_SUMMARY_TEST_URL || 'http://127.0.0.1:5173';
const chromeBin = process.env.CHROME_BIN || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile = await mkdtemp(join(tmpdir(), 'straysafe-case-summary-test-'));
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
        await import('/tests/fixtures/caseSummary.tsx');
    </script></body></html>`;
    const intercept = async ({ requestId, request }) => {
        const html = new URL(request.url).pathname === '/__case_summary__';
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
    // Times are checked as a viewer in the Philippines sees them
    await command('Emulation.setTimezoneOverride', { timezoneId: 'Asia/Manila' });
    await command('Fetch.enable', { patterns: [{ urlPattern: '*://*/api/*' }, { urlPattern: '*://*/__case_summary__*' }, { urlPattern: '*res.cloudinary.com*' }] });
    const evaluate = async expression => {
        const response = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
        return response.result.value;
    };
    const waitFor = async (expression, label) => {
        for (let i = 0; i < 150; i++) { if (await evaluate(expression)) return; await delay(100); }
        throw new Error(`Timed out: ${label}; errors: ${browserErrors.join('; ')}`);
    };
    const caseText = name => evaluate(`document.querySelector('[data-case=${name}]').innerText.replace(/\\s+/g, ' ')`);
    // Heading as written (it is styled uppercase), then the rows and note as shown
    const section = (name, id) => evaluate(`(() => {
        const el = document.querySelector('[data-case=${name}] [data-summary-section=${id}]');
        if (!el) return '';
        return [el.querySelector('h4').textContent, ...[...el.children].slice(1).map(c => c.innerText)].join(' ').replace(/\\s+/g, ' ').trim();
    })()`);

    for (const width of [1280, 390]) {
        await command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 640 });
        await command('Page.navigate', { url: base + '/__case_summary__' });
        await waitFor(`document.querySelectorAll('[data-case-summary]').length === 6`, 'six panels');

        // Report 1: resolved; verification from the first Verified history entry because the fields are empty (F17)
        const r1 = await caseText('report1');
        assert.match(r1, /Case Summary Closed/);
        assert.match(await section('report1', 'outcome'), /Final outcome Status Incident Resolved Closed on Nov 2, 2026.*Recorded by Leader Santos Remarks The owner complied\./);
        const v1 = await section('report1', 'verification');
        assert.match(v1, /Verified by Leader Santos Verified on Nov 2, 2026, 7:11 PM/);
        assert.match(v1, /Notes Checked on site\./);
        assert.match(v1, /Taken from the case history\./);
        const a1 = await section('report1', 'animal');
        assert.match(a1, /Type Dog Count 1 animal Condition Healthy Breed Aspin Color Tan and White Coat pattern Bicolor AI Size Medium/);
        assert.doesNotMatch(a1, /Aspin · Aspin/, 'AI breed hidden when it agrees');
        assert.match(await section('report1', 'priority'), /Priority Medium AI suggested Medium Priority AI AI reason The stray dog is causing a nuisance by scattering trash\. The AI only suggests; officials set the priority\./);

        // Verified case: the verification fields win; AI disagreement shown; two animals; still open
        const v2 = await section('verified', 'verification');
        assert.match(v2, /Verified by Leader Reyes .* Notes Two dogs near the gate, one limping\./);
        assert.doesNotMatch(v2, /Taken from the case history/);
        assert.match(await section('verified', 'outcome'), /Current status Status Referred to Barangay Since Nov 1, 2026/);
        assert.match(await caseText('verified'), /Case Summary Open/);
        const a2 = await section('verified', 'animal');
        assert.match(a2, /Count 2 animals Condition Injured Breed Aspin · Labrador Mix AI Color Black · Dark Brown AI Size Large/);
        const p2 = await section('verified', 'priority');
        assert.match(p2, /Priority High$/);
        assert.doesNotMatch(p2, /AI/, 'no AI rows or note without an AI suggestion');

        // False alarm: the verification section becomes the dismissal record
        assert.match(await section('falseAlarm', 'verification'), /False Alarm \/ Dismissed Reason The animal is a neighbour’s pet inside its yard\. Decided by Leader Cruz Date Oct 30, 2026/);

        // Open report with nothing recorded: animal and priority hidden, verification says none
        assert.equal(await section('open', 'animal'), '', 'animal section hidden (type Unknown)');
        assert.equal(await section('open', 'priority'), '', 'priority section hidden');
        assert.match(await section('open', 'verification'), /No verification recorded for this report\./);
        assert.match(await section('open', 'outcome'), /Current status Status Reported Since Nov 2, 2026/);

        // Phase 3, report 1: observation complied, one warning, pet Baron; nothing else to show
        assert.match(await section('report1', 'observation'), /Owner observation Status Owner complied Started Nov 2, 2026, 7:16 PM Ended Nov 2, 2026, 7:22 PM Closed by Leader Santos$/);
        assert.doesNotMatch(await section('report1', 'observation'), /Extended/);
        assert.match(await section('report1', 'warnings'), /Warnings to the owner Issued 1 warning Latest Notice · Free-Roaming Unleashed Issued on Nov 2, 2026, 7:16 PM Issued by Leader Santos Status Issued/);
        assert.match(await section('report1', 'pet'), /Pet and owner Pet Baron Breed Aspin Owner Emmanuel Vito Cruz$/);
        for (const id of ['behavior', 'disputes', 'linked'])
            assert.equal(await section('report1', id), '', `report 1: ${id} section hidden`);

        // Phase 3, every event at once
        assert.match(await section('events', 'behavior'), /Behavior found Found Bite, Chasing Finding Bit a jogger on the leg; chases bicycles\. Verified by an official/);
        assert.match(await section('events', 'observation'), /Status Observing \(open\) Started Oct 20, 2026, 7:00 AM Due Oct 25, 2026, 7:00 AM Extended Yes, by 2 days Extension reason Owner is building a fence\.$/);
        assert.match(await section('events', 'warnings'), /Issued 2 warnings Latest Final Warning · Biting Incident Issued on Oct 22, 2026, 9:00 AM Issued by Leader Reyes Status Acknowledged/);
        const pet = await section('events', 'pet');
        assert.match(pet, /Pet Choco Breed Shih Tzu Mix Owner Maria Lopez Match confirmed by Staff Dela Cruz \(Barangay Staff\) Returned to Maria Lopez Returned on Oct 24, 2026, 3:30 PM How Handed over in person Reunion confirmed by The owner/);
        assert.equal(await evaluate(`document.querySelector('[data-case=events] [data-pet-photo]')?.getAttribute('src')`),
            'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_96/v1/pets/choco.jpg', 'pet photo shown as a small thumbnail');
        assert.equal(await evaluate(`document.querySelectorAll('[data-case=report1] [data-pet-photo]').length`), 0, 'no photo element without a photo');
        const eventsText = await caseText('events');
        assert.doesNotMatch(eventsText, /0917|Mabini/, 'owner phone and address never shown');
        const disputes = await section('events', 'disputes');
        assert.match(disputes, /^Disputes \(2\) /);
        assert.equal(await evaluate(`document.querySelectorAll('[data-case=events] [data-dispute]').length`), 2);
        assert.match(disputes, /Status Rejected Filed by Pedro Santos, Oct 23, 2026.* Pet Brownie Reason This is my dog, not Choco\. Reviewed by Staff Dela Cruz, Oct 24, 2026.* Review notes Vaccination card does not match\./);
        assert.match(disputes, /Status Pending Filed by Ana Reyes, Oct 24, 2026.* Reason Wrong location recorded\./);
        assert.match(await section('events', 'linked'), /Merged and split reports Merged reports #6 · Phase 2 Park #7 Split into 2 animal records/);
        assert.deepEqual(await evaluate(`[...document.querySelectorAll('[data-case=events] [data-summary-section=linked] a')].map(a => a.getAttribute('href'))`),
            ['/subd/history/6', '/subd/history/7']);

        // Phase 3, a merged duplicate that was also split from another report
        assert.match(await section('mergedChild', 'linked'), /Merged into #5 Merged by Leader Reyes Merged on Oct 20, 2026, 10:00 AM Merge notes Same dog, same street\. Split from #4/);
        assert.deepEqual(await evaluate(`[...document.querySelectorAll('[data-case=mergedChild] [data-summary-section=linked] a')].map(a => a.getAttribute('href'))`),
            ['/subd/history/5', '/subd/history/4']);

        // Phase 4: visibility decision, AI photo check, comments
        assert.match(await section('report1', 'visibility'), /Visibility Residents see it Private Only the reporter and the officials handling it can see this report\./);
        assert.match(await section('report1', 'ai-photo'), /AI photo check Result Likely Authentic Likelihood AI-made 8% Recommendation Photo appears authentic\. AI check, for reference only\./);
        assert.match(await section('report1', 'comments'), /^Comments \(0\) No comments on this report\.$/);
        assert.match(await section('events', 'visibility'), /Residents see it Public Decided by Leader Reyes Decided on Oct 20, 2026, 8:30 AM Reason Neighbours should watch for this dog\. Other residents can see/);
        assert.doesNotMatch(await section('events', 'visibility'), /Not public because|Needs review/);
        const ai = await section('events', 'ai-photo');
        assert.match(ai, /Result Uncertain Likelihood AI-made 42% Recommendation Please verify the authenticity of the uploaded photo\./);
        assert.doesNotMatch(ai, /json is skipped/, 'raw JSON details are not shown');
        assert.match(await section('falseAlarm', 'visibility'), /Residents see it Hidden Not public because Closed as a false alarm\./);
        assert.equal(await section('falseAlarm', 'ai-photo'), '', 'AI photo section hidden when the photo was not checked');
        const comments = await section('events', 'comments');
        assert.match(comments, /^Comments \(4\) /, 'blank comment skipped');
        assert.deepEqual(await evaluate(`[...document.querySelectorAll('[data-case=events] [data-comment]')].map(li => li.querySelectorAll('p')[1].textContent + (li.className.includes('ml-6') ? ' (reply)' : ''))`),
            ['Please keep Choco inside.', 'Thanks, the fence is fixed now. (reply)', 'Noted, thank you. (reply)', 'Saw it again near the park.'],
            'oldest first, replies (at any depth) under their thread');
        assert.match(comments, /Leader Reyes · Oct 20, 2026, 9:00 AM/);
        assert.match(comments, /Comments are closed for this case\.$/, 'a closed case (Claimed by Owner) says comments are closed');
        assert.match(await section('falseAlarm', 'comments'), /No comments on this report\./);

        // Layout: two columns on a wide panel, one on a phone; no sideways scroll
        const sideBySide = await evaluate(`(() => { const s = document.querySelectorAll('[data-case=report1] [data-summary-section]'); return s[0].getBoundingClientRect().top === s[1].getBoundingClientRect().top; })()`);
        assert.equal(sideBySide, width >= 640, `sections ${width >= 640 ? 'side by side' : 'stacked'} at ${width}px`);
        assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true, `no sideways scroll at ${width}px`);
        console.log(`PASS ${width}px: outcome, verification, dismissal, animal, priority, behavior, observation, warnings, pet and owner, disputes, merged and split, visibility, AI photo check, comments, no contact details`);
    }
    assert.equal(browserErrors.length, 0, browserErrors.join('\n'));
    console.log('PASS no uncaught browser errors; all application API calls mocked');
} finally {
    if (command) { try { await command('Browser.close'); } catch {} }
    socket?.close();
    browser.kill();
    // Only remove the isolated profile created by this test, after verifying its absolute parent and prefix.
    const resolvedProfile = resolve(profile);
    if (resolvedProfile.startsWith(resolve(tmpdir()) + '\\straysafe-case-summary-test-')) {
        await rm(resolvedProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
    }
}
