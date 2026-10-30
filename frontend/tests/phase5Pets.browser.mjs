// Run with local Vite: PHASE5_PETS_TEST_URL defaults to http://127.0.0.1:5174.
// The fixture answers all API requests in memory; this runner also blocks backend and external requests.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const base = process.env.PHASE5_PETS_TEST_URL || 'http://127.0.0.1:5174';
const chrome = process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const profilePrefix = join(tmpdir(), 'straysafe-phase5-pets-');
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
            const backend = url.pathname.startsWith('/api/');
            if (backend) backendAttempts.push(url.pathname);
            await command(backend || url.origin !== new URL(base).origin ? 'Fetch.failRequest' : 'Fetch.continueRequest',
                backend || url.origin !== new URL(base).origin
                    ? { requestId: request.requestId, errorReason: 'BlockedByClient' }
                    : { requestId: request.requestId });
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
        for (let i = 0; i < 150; i++) { if (await evaluate(`Boolean(${expression})`)) return; await pause(100); }
        throw new Error(`${label}: ${JSON.stringify(errors)}; ${await evaluate('document.body.innerText.slice(0, 450)')}`);
    };
    const click = async expression => assert(await evaluate(`(() => { const e = ${expression}; if (!e) return false; e.click(); return true; })()`), expression);
    const button = text => `[...document.querySelectorAll('button')].find(e => e.textContent.trim() === ${JSON.stringify(text)})`;
    const titled = title => `document.querySelector(${JSON.stringify(`button[title="${title}"]`)})`;


    let scenarios = 0;
    const navigate = async query => {
        errors.length = 0;
        await command('Page.navigate', { url: `${base}/tests/fixtures/phase5Pets.html?${query}` });
        await waitFor('document.querySelector("#fixture")?.textContent.length > 10', query);
        await pause(300);
        assert.deepEqual(errors, [], query);
    };
    const upload = async () => evaluate(`(() => {
        const input = document.querySelector('input[type=file][accept="image/*"]');
        const dt = new DataTransfer();dt.items.add(new File([new Uint8Array([1,2,3])], 'synthetic.jpg', {type:'image/jpeg'}));
        input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));return true;
    })()`);
    const setInput = async (selector,value) => evaluate(`(() => {
        const input=document.querySelector(${JSON.stringify(selector)});
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});
        input.dispatchEvent(new Event('input',{bubbles:true}));return true;
    })()`);
    for (const width of [390,1280]) {
        await command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
        await navigate('mode=guard');
        for (const verdict of ['none','offline','error','multi','one']) {
            await evaluate(`window.phase5.verdict=${JSON.stringify(verdict)}`);
            await click(button('Check synthetic photo'));
            await waitFor('!window.phase5.guard.checking && window.phase5.requests.length > 0','guard settled');
            assert.equal(await evaluate('window.phase5.guard.noAnimal'),verdict==='none');
            assert.equal(await evaluate('window.phase5.guard.blocked'),verdict==='multi');
            assert.equal(await evaluate('window.phase5.requests.at(-1).body.get("purpose")'),'pet');
            if (verdict==='multi') {
                assert(await evaluate('document.body.textContent.includes("Crop")'));
                await evaluate('window.phase5.guard.setOverride({confirmed:true,reason:"Only one pet visible"})');
                await waitFor('!window.phase5.guard.blocked','reasoned count override');
            }
            scenarios++;
        }
        await navigate('mode=staff&edit');
        await waitFor('document.querySelector("input[placeholder*=\\"White chest\\"]")','staff markings');
        assert.equal(await evaluate('document.querySelector("input[placeholder*=\\"White chest\\"]").value'),'');
        assert.equal(await evaluate('document.body.textContent.includes("Calculated Age")'),false);
        assert.equal(await evaluate('/10kg|25kg/.test(document.body.textContent)'),false);
        await evaluate('window.phase5.verdict="none"');await upload();
        await waitFor('window.phase5.requests.some(r=>r.path==="/reports/analyze-media")','staff photo analyzed');
        await click(`[...document.querySelectorAll('button')].find(e=>e.textContent.includes('Next: Owner Assignment'))`);
        await waitFor('document.body.textContent.includes("Please upload a clear photo")','no-animal save blocked');
        await evaluate('window.phase5.verdict="offline"');await upload();
        await pause(250);await click(`[...document.querySelectorAll('button')].find(e=>e.textContent.includes('Next: Owner Assignment'))`);
        await waitFor('document.body.textContent.includes("Registered Resident") || document.body.textContent.includes("Resident Account") || document.body.textContent.includes("Assign Owner")','offline permits owner assignment');
        scenarios+=2;
        await navigate('mode=match');
        await waitFor('document.body.textContent.includes("Physical Markings & Traits")','physical comparison');
        assert.equal(await evaluate('document.body.textContent.includes("Hidden custody sentinel")'),false);
        assert.equal(await evaluate('document.body.textContent.includes("Hidden encounter sentinel")'),false);
        assert(await evaluate('document.body.textContent.includes("Left ear scar")'));
        assert.equal(await evaluate('[...document.querySelectorAll("div")].some(e=>e.textContent.trim()==="AI")'),false);
        await click(`[...document.querySelectorAll('button')].find(e=>e.textContent.includes('Open Pet Claim #17'))`);
        await waitFor('document.querySelector("#route").textContent==="/subd/pet-claims?claim_id=17"','claim navigation');
        assert(await evaluate('window.phase5.closed'));scenarios++;
        for (const suffix of ['', '&brgy']) {
            await navigate(`mode=claims${suffix}`);
            await waitFor('document.querySelector("textarea") !== null','linked claim review');
            assert.equal(await evaluate('document.querySelector("textarea").value'),'');
            assert.equal(await evaluate('document.body.textContent.includes("I confirm this is my pet.")'),false);
            assert(await evaluate('document.body.textContent.includes("Pending Review")'));
            await evaluate(`(() => {
                const field=document.querySelector('textarea');
                Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,'Synthetic review draft');
                field.dispatchEvent(new Event('input',{bubbles:true}));return true;
            })()`);
            await evaluate('window.dispatchEvent(new Event("focus"))');await pause(450);
            assert.equal(await evaluate('document.querySelector("textarea").value'),'Synthetic review draft');
            await click(button('Back to Pet Claims'));
            await evaluate('window.dispatchEvent(new Event("focus"))');await pause(450);
            assert.equal(await evaluate('document.body.textContent.includes("Back to Pet Claims")'),false);
            scenarios++;
        }
        await navigate('mode=detail&adopted');
        await waitFor('document.body.textContent.includes("Synthetic pet")','pet detail');
        assert.equal(await evaluate('document.querySelector("[data-testid=pet-photo-check]")!==null'),false);
        assert(await evaluate('document.body.textContent.includes("Synthetic adopter")'));
        scenarios++;
        await navigate('mode=resident');
        await waitFor('document.body.textContent.includes("Synthetic pet")','resident pet list');
        await click(`[...document.querySelectorAll('button')].find(e=>e.textContent.includes('Register New Pet'))`);
        await waitFor('document.querySelector("input[placeholder=\\"e.g. Bruno\\"]")','resident form');
        assert.equal(await evaluate('/AI Powered|AI Analyzed|AI Recognition|Calculated Age|10kg|25kg/.test(document.body.textContent)'),false);
        assert.equal(await evaluate('document.body.textContent.includes("My pet has bitten") || document.body.textContent.includes("My pet chases")'),false);
        await setInput('input[placeholder="e.g. Bruno"]','Synthetic new pet');
        await setInput('input[placeholder="e.g. Aspin / Mixed"]','Manual breed');
        await evaluate('window.phase5.verdict="one"');await upload();await pause(300);
        assert.equal(await evaluate('document.querySelector("input[placeholder=\\"e.g. Aspin / Mixed\\"]").value'),'Manual breed');
        assert.equal(await evaluate('document.querySelector("input[placeholder*=\\"White chest\\"]").value'),'');
        assert.equal(await evaluate('window.phase5.requests.filter(r=>r.path==="/reports/analyze-media").at(-1).body.get("purpose")'),'pet');
        scenarios++;
        await navigate('mode=resident');
        await waitFor('document.body.textContent.includes("Synthetic pet")','resident list for editing');
        await click(`[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='View Profile')`);
        await waitFor('[...document.querySelectorAll("button")].some(e=>e.textContent.trim()==="Edit Pet")','resident edit action');
        await click(button('Edit Pet'));
        await waitFor('document.querySelector("input[placeholder*=\\"White chest\\"]")','resident edit form');
        assert.equal(await evaluate('document.querySelector("input[placeholder*=\\"White chest\\"]").value'),'');
        await click(button('Update Information'));
        await waitFor('window.phase5.requests.some(r=>r.method==="put" && r.path==="/pets/11")','resident save');
        const saved=await evaluate('window.phase5.requests.find(r=>r.method==="put" && r.path==="/pets/11").body');
        assert.equal(saved.declared_bite_history,true);assert.equal(saved.declared_chase_behavior,true);
        assert.equal(saved.birth_date,null);assert.equal(saved.estimated_age,null);
        scenarios++;
        console.log(`Width ${width}: ${scenarios} scenarios passed`);
    }
    assert.deepEqual(backendAttempts, [],'no live backend requests');
    console.log(JSON.stringify({result:'PASS',scenarios,widths:[390,1280],backendRequests:0}));
} finally {
    socket?.close();browser.kill();await pause(500);
    assert(profile.startsWith(profilePrefix));
    await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:200});
}
