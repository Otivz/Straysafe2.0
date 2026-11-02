// Run with local Vite: PHASE6TO8_TEST_URL defaults to http://127.0.0.1:5175.
// Manual Matching (owner-first pets), owner confirmation, repeat incidents, leader identity, owner notices, claims that
// aren't needed, and the observation timeline. The fixture answers all API requests in memory; this runner also blocks
// backend and external requests. No live data is used or changed.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const base = process.env.PHASE6TO8_TEST_URL || 'http://127.0.0.1:5175';
const chrome = process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const profilePrefix = join(tmpdir(), 'straysafe-phase6to8-');
const profile = await mkdtemp(profilePrefix);
const browser = spawn(chrome, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-background-networking', 'about:blank'],
{ windowsHide: true, stdio: 'ignore' });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
try {
    let port;
    for (let i = 0; i < 100; i++) {
        try { port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; }
        catch { await pause(100); }
    }
    assert(port, 'Chrome debugging port available');
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new`, { method: 'PUT' })).json();
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let id = 0;
    const pending = new Map();
    const errors = [];
    const backendAttempts = [];
    const command = (method, params = {}) => new Promise((resolve, reject) => {
        const requestId = ++id;
        const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(`${method} timed out`)); }, 20000);
        pending.set(requestId, { resolve, reject, timer });
        socket.send(JSON.stringify({ id: requestId, method, params }));
    });
    socket.onmessage = async event => {
        const message = JSON.parse(event.data);
        if (message.id) {
            const task = pending.get(message.id);
            if (task) {
                clearTimeout(task.timer); pending.delete(message.id);
                if (message.error) task.reject(new Error(message.error.message)); else task.resolve(message.result);
            }
        } else if (message.method === 'Runtime.exceptionThrown') {
            errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
        } else if (message.method === 'Fetch.requestPaused') {
            const request = message.params;
            const url = new URL(request.request.url);
            const backend = url.pathname.startsWith('/api/') || url.port === '8000';
            if (backend) backendAttempts.push(url.pathname);
            const block = backend || url.origin !== new URL(base).origin;
            await command(block ? 'Fetch.failRequest' : 'Fetch.continueRequest',
                block ? { requestId: request.requestId, errorReason: 'BlockedByClient' } : { requestId: request.requestId });
        }
    };
    await command('Page.enable'); await command('Runtime.enable');
    await command('Fetch.enable', { patterns: [{ urlPattern: 'http*://*/*', requestStage: 'Request' }] });
    const evaluate = async expression => {
        const response = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
        return response.result.value;
    };
    const waitFor = async (expression, label) => {
        for (let i = 0; i < 150; i++) { if (await evaluate(expression)) return; await pause(100); }
        throw new Error(`${label}: ${JSON.stringify(errors)}; ${await evaluate('document.body.innerText.slice(0, 600)')}`);
    };
    const click = async expression => assert(await evaluate(`(() => { const e = ${expression}; if (!e) return false; e.click(); return true; })()`), expression);
    const button = text => `[...document.querySelectorAll('button')].find(e => e.textContent.trim() === ${JSON.stringify(text)})`;
    const buttonIncl = text => `[...document.querySelectorAll('button')].find(e => e.textContent.includes(${JSON.stringify(text)}))`;
    // React-controlled inputs: set through the native setter so onChange fires
    const fill = async (selector, value) => assert(await evaluate(`(() => {
        const el = ${selector}; if (!el) return false;
        const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)});
        el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
        return true; })()`), selector);
    const requests = () => evaluate('window.fixtureRequests');
    const noOverflow = async label => assert(await evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), `${label}: no sideways scrolling`);

    let scenarios = 0;
    const runs = [[390, false], [1280, false], [390, true]];
    for (const [width, dark] of runs) {
        await command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
        const navigate = async query => {
            errors.length = 0;
            await command('Page.navigate', { url: `${base}/tests/fixtures/phase6to8.html?${query}${dark ? '&dark' : ''}` });
            await waitFor('document.querySelector("#fixture")?.textContent.length > 20', query);
            await pause(400);
            assert.deepEqual(errors, [], query);
            if (dark) assert(await evaluate('document.documentElement.classList.contains("dark")'), 'dark mode applied');
        };

        // Manual Matching: AI off banner, owner-first states, gated final actions, Send Confirmation, Escape closes
        await navigate('mode=matching');
        await waitFor('document.body.textContent.includes("AI Disabled · Manual Matching Mode")', 'AI status banner');
        await waitFor('document.body.textContent.includes("Registered pet")', 'registered-pet candidates');
        for (const [name, label] of [['Fresh', 'Compare & send confirmation'], ['Waiting', 'View request'], ['Confirmed', 'Final verification'], ['Declined', 'View details']]) {
            assert(await evaluate(`[...document.querySelectorAll('button')].some(b => b.textContent.trim() === ${JSON.stringify(label)})`), `${name}: ${label}`);
        }
        await noOverflow('matching list');
        await click(button('View request'));
        await waitFor('document.body.textContent.includes("Waiting for the owner")', 'awaiting state');
        assert.equal(await evaluate(`!!${buttonIncl('Confirm Verified Match')}`), false, 'no final action while awaiting the owner');
        await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        await waitFor('!document.querySelector("[role=dialog]")', 'Escape closes the comparison');
        await click(button('Final verification'));
        await waitFor(`!!${buttonIncl('Confirm Verified Match')} && !!${buttonIncl('Request Further Verification')}`, 'final actions after owner YES');
        assert(await evaluate('document.body.textContent.includes("That is his red collar")'), "owner's answer shown");
        await click(buttonIncl('Close'));
        await click(button('View details'));
        await waitFor('document.body.textContent.includes("can\'t be confirmed for this report")', 'owner rejected blocks the pet');
        assert.equal(await evaluate(`!!${buttonIncl('Confirm Verified Match')}`), false, 'no confirm after owner NO');
        await click(buttonIncl('Close'));
        await click(button('Compare & send confirmation'));
        await waitFor(`!!${button('Send Confirmation')}`, 'Send Confirmation offered');
        await click(button('Send Confirmation'));
        await waitFor(`window.fixtureRequests.some(r => r.path === '/manual-matching/pet-confirmations' && r.method === 'post')`, 'request sent');
        const sent = (await requests()).find(r => r.path === '/manual-matching/pet-confirmations' && r.method === 'post');
        assert.equal(sent.body.pet_id, 1); assert.equal(sent.body.report_id, 501);
        scenarios++;

        // Owner: both animals, YES needs a confirmation step
        await navigate('mode=owner');
        await waitFor('document.body.textContent.includes("Is this the animal you registered as your pet?")', 'owner question');
        assert(await evaluate('!!document.querySelector("img[alt^=\\"Reported animal\\"]") && !!document.querySelector("img[alt^=\\"Your registered pet\\"]")'), 'both photos');
        await noOverflow('owner request');
        await click(button('Yes, this is my pet'));
        await waitFor('document.querySelectorAll("[role=dialog]").length === 1', 'confirmation dialog');
        await click(`[...document.querySelectorAll('[role=dialog] button')].find(e => e.textContent.trim() === 'Yes, this is my pet')`);
        await waitFor(`window.fixtureRequests.some(r => r.path === '/pet-match-confirmations/90/respond')`, 'answer sent');
        assert.equal((await requests()).find(r => r.path === '/pet-match-confirmations/90/respond').body.answer, 'YES');
        scenarios++;

        // Repeat incidents and leader identity verification
        await navigate('mode=repeat');
        await waitFor('document.body.textContent.includes("1 other report about the pet under observation")', 'cross-report banner');
        await click(button('Log as repeat incident'));
        assert(await evaluate(`${button('Log repeat')}.disabled`), 'notes required');
        await fill('document.querySelector("textarea[aria-label=\\"Repeat incident notes\\"]")', 'Seen roaming again near the court.');
        await click(button('Log repeat'));
        await waitFor(`window.fixtureRequests.some(r => r.path === '/owner-followups/5/repeated-incidents')`, 'repeat logged');
        await click(button('Verify identity as handling leader'));
        await fill('document.querySelector("select[aria-label=\\"How you verified it\\"]")', 'In-Person Inspection');
        await fill('document.querySelector("textarea[aria-label=\\"Reason\\"]")', 'Same scar on the left ear, seen at the gate.');
        await click(button('Review verification'));
        await click(button('Yes, verify identity'));
        await waitFor(`window.fixtureRequests.some(r => r.path === '/leader-identity/matches/77')`, 'identity verified');
        await noOverflow('repeat and identity');
        scenarios++;

        await navigate('mode=repeat&offline');
        await waitFor('document.body.textContent.includes("Log a verbal warning (owner has no account)")', 'verbal warning for an owner without an account');
        scenarios++;

        // Owner notices: checkbox before acknowledging
        await navigate('mode=notices');
        await waitFor(`!!${button('Acknowledge notice')}`, 'notice');
        assert(await evaluate(`${button('Acknowledge notice')}.disabled`), 'disabled until the checkbox is ticked');
        await click('document.querySelector("section[aria-label=\\"Subdivision notices\\"] input[type=checkbox]")');
        await click(button('Acknowledge notice'));
        await waitFor(`window.fixtureRequests.some(r => r.path === '/warnings/3/acknowledge')`, 'acknowledged');
        assert.equal((await requests()).find(r => r.path === '/warnings/3/acknowledge').body.confirmed, true);
        await noOverflow('notices (long text)');
        scenarios++;

        // Claims nobody holds: owner answer and staff closure
        await navigate('mode=claim-owner');
        await waitFor('document.body.textContent.includes("Owner\'s latest answer: My pet is still missing")', 'owner answer shown');
        await click(button('My pet is home'));
        await waitFor(`window.fixtureRequests.some(r => r.path === '/claims/8/whereabouts')`, 'whereabouts sent');
        scenarios++;
        await navigate('mode=claim-staff');
        assert(await evaluate(`${button('Close claim as not needed')}.disabled`), 'reason required');
        await fill('document.querySelector("textarea[aria-label=\\"Reason to close the claim\\"]")', 'Owner says the dog is home.');
        await click(button('Close claim as not needed'));
        await waitFor('document.body.textContent.includes("Claim closed: not needed")', 'closed');
        scenarios++;

        // Timeline: observation entries, long content, rescue/adoption entries together; stage label
        await navigate('mode=timeline');
        for (const title of ['OBSERVATION STARTED', 'OBSERVATION EXTENDED', 'OBSERVATION ENDED']) {
            await waitFor(`document.body.textContent.toUpperCase().includes(${JSON.stringify(title)})`, title);
        }
        const upper = await evaluate('document.body.innerText.toUpperCase()');
        assert(upper.includes('RESCUE TEAM DISPATCHED') && upper.includes('ANIMAL ADOPTED'), 'rescue and adoption entries shown with the observation entries');
        assert(upper.includes('OBSERVATION UPDATE') && !upper.includes('MOVED TO HOLDING PLACE'),
            'a note during an owner observation is not titled as a move to a holding place');
        assert(await evaluate('document.body.textContent.includes("several times this week")'), 'long entry text kept');
        assert((await evaluate('window.fixtureStages.currentLabel')).startsWith('Under observation until'), 'stage label');
        await noOverflow('timeline with long content');
        scenarios++;
    }
    assert.deepEqual(backendAttempts, [], 'no backend requests');
    console.log(JSON.stringify({ result: 'PASS', scenarios, runs: runs.map(([w, d]) => `${w}px${d ? ' dark' : ''}`), backendRequests: 0 }));
} finally {
    socket?.close(); browser.kill(); await pause(500);
    assert(profile.startsWith(profilePrefix));
    await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
}
