// Pet claiming fees (docs/01-system/CLAIM_FEE_ASSESSMENT_RULES.md). Run with local Vite:
// CLAIM_FEES_TEST_URL defaults to http://127.0.0.1:5175. The fixture answers all API requests in memory with synthetic
// data; this runner also blocks backend and external requests.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const base = process.env.CLAIM_FEES_TEST_URL || 'http://127.0.0.1:5175';
const chrome = process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const profilePrefix = join(tmpdir(), 'straysafe-claim-fees-');
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
    // React-controlled inputs: set through the native setter so React sees the change
    const type = async (label, value) => assert(await evaluate(`(() => {
        const e = document.querySelector(${JSON.stringify(`[aria-label="${label}"]`)}); if (!e) return false;
        const proto = e.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(e, ${JSON.stringify(value)});
        e.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`), label);
    const text = () => evaluate('document.body.textContent');
    const disabled = label => evaluate(`${button(label)}?.disabled === true`);
    const lastSettled = () => evaluate('window.feeSettled[window.feeSettled.length - 1]');
    const posted = () => evaluate('window.feeRequests.find(r => r.method === "post")?.body ?? null');

    let scenarios = 0;
    for (const width of [390, 1280]) {
        await command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
        const navigate = async query => {
            errors.length = 0;
            await command('Page.navigate', { url: `${base}/tests/fixtures/claimFees.html?${query}` });
            await waitFor('(document.querySelector("[data-testid=claim-assessment-panel], [data-testid=claim-fee-settings]")?.textContent.length > 20) && !document.body.textContent.includes("Loading claiming")', query);
            await pause(200);
            assert.deepEqual(errors, [], query);
        };

        // Dog: species label, RA 9482 range, total before confirmation, payment with OR, settled only after payment
        await navigate('mode=panel&species=Dog');
        assert((await text()).includes('Dog'), 'dog label');
        await click(button('Assess charges'));
        await waitFor('!!document.querySelector("[data-testid=assessment-form]")', 'assessment form');
        await type('Dog Impounding Fine amount', '1200');
        assert(await disabled('Review total'), 'above PHP 1,000 cannot be reviewed');
        assert((await text()).includes('must be within'), 'range message');
        await type('Dog Impounding Fine amount', '750');
        assert.equal(await evaluate('document.querySelector("[data-testid=assessment-total-preview]").textContent'), '₱750.00', 'total preview');
        await click(button('Review total'));
        await waitFor('!!document.querySelector("[data-testid=assessment-confirm]")', 'confirmation step');
        assert((await text()).includes('₱750.00'), 'total shown before confirming');
        assert.equal(await posted(), null, 'nothing saved before confirming');
        await click(button('Confirm assessment'));
        await waitFor('document.body.textContent.includes("Awaiting payment")', 'assessed');
        assert.equal(await lastSettled(), false, 'unpaid charges block the handover');
        assert((await text()).includes('CLM-00007') && (await text()).includes('P-00011'), 'breakdown reference and animal ID');
        await click(button('Record payment'));
        await waitFor('!!document.querySelector("[data-testid=payment-form]")', 'payment form');
        assert(await disabled('Confirm payment'), 'payment needs an OR number');
        await type('Official receipt number', 'OR-TEST-1');
        await type('Amount received', '700');
        assert(await disabled('Confirm payment'), 'amount must equal the total');
        await type('Amount received', '750');
        assert((await text()).includes('does not complete the handover'), 'payment does not complete the handover');
        await click(button('Confirm payment'));
        await waitFor('document.body.textContent.includes("OR / Ref. No. OR-TEST-1")', 'paid with receipt');
        assert.equal(await lastSettled(), true, 'paid charges allow the handover');
        assert.equal(await evaluate('window.feeRequests.some(r => r.path.includes("/claims/7/status"))'), false, 'no handover request');
        scenarios++;

        // Cat: staff type the claiming charge; nothing is pre-filled or computed
        await navigate('mode=panel&species=Cat');
        assert((await text()).includes('Cat Claiming Charge: entered by Barangay staff'), 'cat manual entry note');
        await click(button('Assess charges'));
        await waitFor('!!document.querySelector("[data-testid=cat-charge-form]")', 'cat charge form');
        assert.equal(await evaluate('document.querySelector("[aria-label=\'Cat claiming charge amount\']").value'), '', 'no default amount');
        assert.equal(await evaluate('!!document.querySelector("[aria-label=\'Dog Impounding Fine amount\']")'), false, 'no dog fine input for a cat');
        assert.equal(await evaluate('document.querySelector("[data-testid=assessment-total-preview]").textContent'), '₱0.00', 'nothing added automatically');
        assert(await disabled('Review total'), 'empty amount refused');
        await type('Charge description', 'Cat claiming charge');
        await type('Reason / basis', 'Barangay Resolution No. 5, s. 2026 (synthetic)');
        for (const bad of ['-5', 'abc', '12a', '10.555']) {
            await type('Cat claiming charge amount', bad);
            assert(await disabled('Review total'), `refused amount ${bad}`);
        }
        assert((await text()).includes('Use numbers only'), 'invalid amount message');
        await type('Cat claiming charge amount', '250.50');
        assert.equal(await evaluate('document.querySelector("[data-testid=assessment-total-preview]").textContent'), '₱250.50', 'total is the entered amount');
        await type('Reason / basis', '');
        assert(await disabled('Review total'), 'reason / basis required');
        await type('Reason / basis', 'Barangay Resolution No. 5, s. 2026 (synthetic)');
        await type('Charge description', '');
        assert(await disabled('Review total'), 'charge description required');
        await type('Charge description', 'Cat claiming charge');
        assert((await text()).includes('Assessed by') && (await text()).includes('Recorded automatically'), 'staff and date shown');
        await click(button('Review total'));
        await waitFor('!!document.querySelector("[data-testid=assessment-confirm]")', 'cat confirmation');
        assert((await text()).includes('₱250.50') && (await text()).includes('Reason / basis: Barangay Resolution'), 'confirm shows amount and basis');
        await click(button('Confirm assessment'));
        await waitFor('!!document.querySelector("[data-testid=cat-charge-breakdown]")', 'cat breakdown');
        const sent = await posted();
        assert.equal(sent.fine_amount, '250.50'); assert.equal(sent.charge_description, 'Cat claiming charge');
        assert.equal(sent.no_charge, false); assert.ok(sent.charge_basis.startsWith('Barangay Resolution'));
        assert((await text()).includes('entered manually by'), 'breakdown names the staff entry');
        assert.equal(await lastSettled(), false, 'unpaid cat charge blocks the handover');
        scenarios++;

        // Cat: no charge applies (reason required, no amount)
        await navigate('mode=panel&species=Cat');
        await click(button('Assess charges'));
        await click('document.querySelector("[aria-label=\'No claiming charge applies\']")');
        assert.equal(await evaluate('!!document.querySelector("[aria-label=\'Cat claiming charge amount\']")'), false, 'amount hidden');
        assert(await disabled('Review total'), 'reason required for no charge');
        await type('Reason / basis', 'No ordinance covers cat claiming (synthetic)');
        await click(button('Review total'));
        await click(button('Confirm assessment'));
        await waitFor('document.body.textContent.includes("No charge applicable")', 'no charge recorded');
        const none = await posted();
        assert.equal(none.no_charge, true); assert.equal(none.fine_amount, null);
        assert.equal(await lastSettled(), true, 'nothing owed');
        scenarios++;

        // Waiver needs a reason
        await navigate('mode=panel&species=Dog');
        await click(button('Assess charges'));
        await type('Dog Impounding Fine amount', '500');
        await click(button('Review total'));
        await click(button('Confirm assessment'));
        await waitFor('document.body.textContent.includes("Awaiting payment")', 'assessed for waiver');
        await click(button('Waive'));
        await type('Reason for the waiver', 'short');
        assert(await disabled('Confirm waiver'), 'short reason refused');
        await type('Reason for the waiver', 'Indigent owner, synthetic waiver reason');
        await click(button('Confirm waiver'));
        await waitFor('document.body.textContent.includes("Charges waived")', 'waived');
        assert.equal(await lastSettled(), true, 'waived charges allow the handover');
        scenarios++;

        // Subdivision Leader and resident: view only
        for (const v of ['leader', 'owner']) {
            await navigate(`mode=panel&species=Dog&viewer=${v}&paid`);
            assert((await text()).includes('OR / Ref. No. OR-TEST-1'), `${v} sees the payment`);
            assert.equal(await evaluate('[...document.querySelectorAll("button")].some(b => /Assess|Record payment|Adjust|Waive|Cancel/.test(b.textContent))'), false, `${v} has no actions`);
            assert.equal(await evaluate('window.feeRequests.some(r => r.path.endsWith("/quote"))'), false, `${v} does not request the quote`);
            scenarios++;
        }

        // Settings: dog fine fixed; no configured cat amount; fees only with a legal basis
        await navigate('mode=settings');
        assert((await text()).toLowerCase().includes('not editable here'), 'dog fine fixed');
        assert((await text()).includes('There is no default or configured cat amount'), 'cat charge is entered per assessment');
        assert.equal(await evaluate('!!document.querySelector("[aria-label=\'Cat Claiming Fine minimum\']")'), false, 'no cat fine schedule');
        await click('[...document.querySelectorAll("button")].find(e => e.textContent.trim() === "Configure")');
        await type('Impounding Fee minimum', '100');
        await type('Impounding Fee maximum', '100');
        assert(await disabled('Save'), 'legal basis required');
        await type('Impounding Fee legal basis', 'Synthetic Ordinance No. 1, Section 2');
        await click(button('Save'));
        await waitFor('document.body.textContent.includes("Synthetic Ordinance No. 1, Section 2") && !document.querySelector("[aria-label=\'Impounding Fee minimum\']")', 'fee saved');
        const saved = await posted();
        assert.equal(saved.fee_type, 'IMPOUNDING_FEE'); assert.equal(saved.species, null);
        scenarios++;
    }
    assert.deepEqual(backendAttempts, [], 'no backend requests');
    console.log(JSON.stringify({ result: 'PASS', scenarios, widths: [390, 1280], backendRequests: 0 }));
} finally {
    socket?.close(); browser.kill(); await pause(500);
    assert(profile.startsWith(profilePrefix));
    await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
}
