// Run with Vite on port 5173: node frontend/tests/adoptionDetails.browser.mjs
// Uses an isolated Chrome profile and intercepts every API call; no live data is changed.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const base = process.env.ADOPTION_DETAILS_TEST_URL || 'http://127.0.0.1:5173';
const chromeBin = process.env.CHROME_BIN || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile = await mkdtemp(join(tmpdir(), 'straysafe-adoption-details-test-'));
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
    const artifacts = resolve('scratch/adoption-ui-review');
    await mkdir(artifacts, { recursive: true });
    const screenshot = async name => { const result = await command('Page.captureScreenshot', {format:'png'}); await writeFile(join(artifacts, name+'.png'), Buffer.from(result.data,'base64')); };
    const requests = [];
    let stage = 'Certificate';
    let staffMode = false;
    let certificateMissing = false;
    let sent = false;
    const longName = 'Adopter ' + 'VeryLongFamilyName'.repeat(8);
    const number = 'SS-ADOPT-2026-' + 'LONGCERTIFICATE'.repeat(8);
    const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6hsAAAAASUVORK5CYII=';
    const application = () => ({ adoption_id: 1, holding_id: 3, applicant_id: 7, full_name: longName,
        address: 'Block 5 ' + 'LongStreetNameWithoutSpaces'.repeat(8), contact_no: '09123456789', reason: 'Mock application for layout testing.',
        status: stage === 'Application' ? 'Pending' : 'Approved', current_stage: stage, application_stage_status: stage === 'Certificate' ? 'Certificate_Ready' : 'Pending',
        case_owner_id: 42, case_owner_name: 'Test officer with a long name', certificate_number: certificateMissing ? null : number,
        animal_name: 'Rescued dog ' + 'LongAnimalName'.repeat(5), animal_type: 'Dog', animal_breed: 'Aspin', animal_photo: image,
        created_at: '2026-10-21T08:00:00', updated_at: '2026-10-25T08:00:00', has_other_pets: false,
        is_certificate_sent: sent, certificate_sent_at: sent ? '2026-10-25T09:00:00' : null,
        is_handed_over: false, staff_handed_over: false,
    });
    const assignments = ['Verification','Interview','Home_Visit'].map((task_type, i) => ({
        assignment_id: i + 1, task_type, adoption_id: 1, assigned_to: 43, assigned_to_name: longName,
        assigned_by_name: 'Test officer', assigned_at: '2026-10-22T08:00:00', completed_at: '2026-10-23T08:00:00',
        status: 'Completed', remarks: 'Historical assignment notes preserved.',
    }));
    const certificate = () => ({ certificate_id: 1, adoption_id: 1, certificate_number: number, issued_at: '2026-10-24T08:00:00',
        certificate_status: 'Draft', is_final: false, adopter_name: longName, animal_name: application().animal_name,
        animal_type: 'Dog', animal_breed: 'Aspin', animal_photo: image, captain_name: 'Test Captain', captain_signature_url: image,
        barangay_name: 'Test Barangay', municipality_city: 'Test City', province: 'Test Province', qr_code_url: image,
        verification_hash: 'mock-only', verify_url: 'https://example.invalid/certificate/mock-only' });
    const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="fixture"></div><script type="module">
        import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window);
        window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type;
        window.__vite_plugin_react_preamble_installed__ = true;
        await import('/@vite/client'); await import('/tests/fixtures/adoptionDetails.tsx');
    </script></body></html>`;
    const intercept = async ({ requestId, request }) => {
        const url = new URL(request.url);
        let body = [], responseCode = 200, contentType = 'application/json';
        const path = url.pathname.replace(/^\/api/, '');
        if (path === '/__adoption_details__') { body = fixture; contentType = 'text/html'; }
        else {
            requests.push({ path, method: request.method, data: request.postData });
            if (path === '/adoptions/applications') body = [application()];
            else if (path === '/adoptions/catalog') body = [];
            else if (path === '/adoptions/monitoring/dashboard') body = { items: [], summary: {} };
            else if (path === '/chat/adoptions/unread-counts') body = { counts: {}, total: 0 };
            else if (path === '/adoptions/1/case') body = { adoption_id: 1, case_owner_id: 42, case_owner_name: longName, is_owner: !staffMode, can_claim: false, can_assign: !staffMode, assignments };
            else if (path === '/adoptions/1/certificate') {
                if (certificateMissing) { responseCode = 404; body = { detail: 'Not issued' }; } else body = certificate();
            } else if (path === '/adoptions/1/certificate/send') { sent = true; body = { sent_at: '2026-10-25T09:00:00' }; }
            else if (path === '/adoptions/1/handover/proceed') { stage = 'Handover'; body = {}; }
            else if (path === '/adoptions/1/assignable-staff') body = [{ user_id: 43, name: 'Field officer', open_tasks: 1 }];
            else if (path === '/adoptions/1/assignments' && request.method === 'POST') body = {};
            else if (path === '/chat/adoptions/1') body = { thread_id: 1, adoption_id: 1, participants: [], messages: [] };
        }
        await command('Fetch.fulfillRequest', { requestId, responseCode, responseHeaders: [{ name: 'Content-Type', value: contentType }], body: Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)).toString('base64') });
    };
    socket.onmessage = event => {
        const message = JSON.parse(event.data);
        if (message.id) {
            const task = pending.get(message.id); if (!task) return;
            clearTimeout(task.timer); pending.delete(message.id);
            message.error ? task.reject(new Error(JSON.stringify(message.error))) : task.resolve(message.result);
        } else if (message.method === 'Fetch.requestPaused') intercept(message.params).catch(error => { if (!error.message.includes('Invalid InterceptionId')) browserErrors.push(error.message); });
        else if (message.method === 'Runtime.exceptionThrown') browserErrors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    };
    await command('Page.enable'); await command('Runtime.enable'); await command('Network.enable');
    await command('Network.setBlockedURLs', { urls: ['*api.qrserver.com*', '*res.cloudinary.com*', '*unsplash.com*'] });
    await command('Fetch.enable', { patterns: [{ urlPattern: '*://*/api/*' }, { urlPattern: '*://*/__adoption_details__*' }] });
    const evaluate = async expression => {
        const response = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
        return response.result.value;
    };
    const waitFor = async (expression, label) => {
        for (let i = 0; i < 150; i++) { if (await evaluate(`Boolean(${expression})`)) return; await delay(100); }
        throw new Error(`Timed out: ${label}; errors: ${browserErrors.join('; ')}; body: ${(await evaluate('document.body.innerText')).slice(0,1200)}`);
    };
    const click = label => evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.getClientRects().length && b.textContent.trim().includes(${JSON.stringify(label)})).click()`);
    const tab = id => evaluate(`document.getElementById('adoption-tab-${id}').click()`);
    const noOverflow = label => evaluate(`(() => { const main = document.querySelector('.adoption-detail-page'); if (!main) return 'No main'; const bad = [...main.querySelectorAll('*')].filter(e=>e.getClientRects().length && getComputedStyle(e).position !== 'absolute' && e.getBoundingClientRect().right > innerWidth+1 && !e.closest('[class*=overflow-x-auto]')).slice(0,4).map(e=>e.tagName+':'+e.className); return {main:main.scrollWidth-main.clientWidth,page:document.documentElement.scrollWidth-innerWidth,bad}; })()`).then(value=>{assert(value.main<=1 && value.page<=1, `${label} overflow: ${JSON.stringify(value)}`);});
    const load = async (width, query='') => {
        await command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 640 });
        await command('Page.navigate', { url: base + '/__adoption_details__' + query });
        await waitFor(`document.querySelector('#adoption-tab-overview[aria-selected=true]')`, 'overview');
    };
    for (const width of [320, 375, 390, 430, 768, 1280]) {
        stage = 'Certificate'; sent = false; staffMode = false;
        await load(width);
        assert.equal(await evaluate(`document.querySelector('#straysafe-adoption-certificate-root') === null`), true);
        await noOverflow(`${width} overview`);
        if ([320,1280].includes(width)) await screenshot(`overview-${width}`);
        await click('View Applicant Information');
        await waitFor(`document.querySelector('.adoption-applicant-dialog')`, 'applicant modal');
        const modalFits = await evaluate(`(() => {const d=document.querySelector('.adoption-applicant-dialog'); return d.scrollWidth<=d.clientWidth+1 && d.getBoundingClientRect().right<=innerWidth;})()`);
        assert(modalFits, `${width} applicant information fits`);
        await evaluate(`document.querySelector('[aria-label="Close applicant information"]').click()`);
        await tab('process');
        await waitFor(`document.querySelector('[data-testid=adoption-case-panel]')?.innerText.includes('Completed tasks')`, 'assignment panel');
        await noOverflow(`${width} process`);
        const lifecycle = await evaluate(`(() => {
            const list = document.querySelector('[aria-label="Adoption lifecycle stages"]');
            const panel = list?.parentElement;
            return { visible: !!list?.getClientRects().length, count: list?.children.length,
                overflow: panel ? panel.scrollWidth - panel.clientWidth : Infinity,
                scrollingTracks: panel ? [...panel.querySelectorAll('[class*=overflow-x-auto]')].filter(e=>e.getClientRects().length).length : -1 };
        })()`);
        assert(lifecycle.visible && lifecycle.count === 6 && lifecycle.overflow <= 1 && lifecycle.scrollingTracks === 0,
            `${width} lifecycle stages must fit without sideways scrolling: ${JSON.stringify(lifecycle)}`);
        assert.equal(await evaluate(`document.querySelector('#adoption-panel-process details')?.open ?? false`), false);
        await click('View Procedures & Subtasks');
        await waitFor(`document.querySelector('#adoption-panel-process').textContent.includes('Preserved Adoption Procedures & Subtasks')`, 'procedures');
        await noOverflow(`${width} procedures`);
        await evaluate(`Array.from(document.querySelectorAll('#adoption-panel-process summary')).find(s=>s.textContent.includes('Completed tasks')).click()`);
        await evaluate(`Array.from(document.querySelectorAll('#adoption-panel-process summary')).find(s=>s.textContent.includes('Assignment history')).click()`);
        assert.equal(await evaluate(`document.body.innerText.includes('Historical assignment notes preserved.')`), true);
        await tab('certificate');
        await waitFor(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('Preview Certificate') && !b.disabled)`, 'certificate metadata');
        await noOverflow(`${width} certificate card`);
        assert.equal(await evaluate(`document.querySelector('#straysafe-adoption-certificate-root') === null`), true);
        await click('Preview Certificate');
        await waitFor(`document.querySelector('.adoption-certificate-viewer #straysafe-adoption-certificate-root')`, 'official document');
        const fit = await evaluate(`(() => { const v=document.querySelector('.certificate-viewer-scroll'), p=document.querySelector('.certificate-scaled-space'); return {width:v.clientWidth, paper:p.getBoundingClientRect().width, height:v.clientHeight, content:v.scrollHeight}; })()`);
        assert(fit.paper<=fit.width, `${width} fits certificate`);
        assert(fit.content>=fit.height, 'document scroll area exists');
        assert.equal(await evaluate(`document.querySelector('#straysafe-adoption-certificate-root').textContent.includes(${JSON.stringify(number)})`), true);
        if (width === 390) {
            await screenshot('certificate-preview-390');
            await command('Emulation.setEmulatedMedia', {media:'print'});
            assert.equal(await evaluate(`getComputedStyle(document.querySelector('.certificate-viewer-toolbar')).display`), 'none');
            assert.equal(await evaluate(`getComputedStyle(document.getElementById('fixture')).display`), 'none');
            const pdf = await command('Page.printToPDF', { printBackground:true, paperWidth:8.27, paperHeight:11.69, preferCSSPageSize:true });
            const bytes = Buffer.from(pdf.data,'base64');
            assert(bytes.subarray(0,4).toString()==='%PDF');
            await writeFile(join(artifacts,'certificate-print-390.pdf'),bytes);
            await command('Emulation.setEmulatedMedia', {media:''});
        }
        const beforeZoom = await evaluate(`parseInt(document.querySelector('[aria-label="Certificate zoom"]').textContent)`);
        await evaluate(`document.querySelector('[aria-label="Zoom in"]').click()`);
        assert((await evaluate(`parseInt(document.querySelector('[aria-label="Certificate zoom"]').textContent)`)) > beforeZoom, 'zoom increases');
        await evaluate(`document.querySelector('[aria-label="Close certificate preview"]').click()`);
        await click('Print Certificate');
        await waitFor(`window.adoptionPrints > 0`, 'print waits for document');
        await command('Input.dispatchKeyEvent', {type:'keyDown', key:'Escape', code:'Escape', windowsVirtualKeyCode:27});
        await waitFor(`!document.querySelector('.adoption-certificate-viewer')`, 'escape closes viewer');
        assert.equal(await evaluate(`document.querySelector('#adoption-tab-certificate').getAttribute('aria-selected')`), 'true');
        console.log(`PASS ${width}px: no page overflow; tabs/procedures/assignment history; on-demand certificate fits, zooms, prints and closes`);
    }
    staffMode = false; stage = 'Certificate';
    await load(390); await tab('process');
    await waitFor(`Array.from(document.querySelectorAll('#adoption-panel-process button')).some(b=>b.textContent.trim()==='Assign')`, 'assign controls');
    await evaluate(`Array.from(document.querySelectorAll('#adoption-panel-process button')).find(b=>b.getClientRects().length && b.textContent.trim()==='Assign').click()`);
    await waitFor(`document.querySelector('select[aria-label="Staff for Handover"] option[value="43"]')`, 'assignable staff');
    await evaluate(`(() => {const select=document.querySelector('select[aria-label="Staff for Handover"]'); select.value='43'; select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await click('Assign task');
    await waitFor(`!document.querySelector('select[aria-label="Staff for Handover"]')`, 'assignment saved');
    assert(requests.some(r=>r.path==='/adoptions/1/assignments' && r.method==='POST' && JSON.parse(r.data).assigned_to===43));
    console.log('PASS existing assignment controls post the selected assignee through the same endpoint');
    // Read-only staff still have preview/print but cannot send or assign.
    staffMode = true; stage = 'Certificate'; sent = false;
    await load(390, '?staff=1'); await tab('certificate');
    await waitFor(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('Send Digital Certificate'))`, 'staff certificate controls');
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Send Digital Certificate')).disabled`), true);
    await tab('process');
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('#adoption-panel-process button')).filter(b=>b.textContent.trim()==='Assign').length`), 0);
    console.log('PASS staff permission restrictions preserved');
    staffMode = false; certificateMissing = true; stage = 'Application';
    await load(320); await tab('certificate');
    await waitFor(`document.body.innerText.includes('The certificate has not been issued yet.')`, 'missing certificate');
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Preview Certificate')).disabled`), true);
    console.log('PASS unissued certificate has no fabricated preview');
    certificateMissing = false; stage = 'Certificate';
    await load(390); await tab('certificate');
    await waitFor(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('Send Digital Certificate') && !b.disabled)`, 'send action');
    await click('Send Digital Certificate');
    await waitFor(`document.body.innerText.includes('Sent to adopter')`, 'delivery updated');
    assert(requests.some(r=>r.path==='/adoptions/1/certificate/send' && r.method==='POST'));
    await click('Proceed to Handover');
    await waitFor(`document.querySelector('#adoption-tab-process[aria-selected=true]')`, 'handover process opens');
    assert(requests.some(r=>r.path==='/adoptions/1/handover/proceed' && r.method==='POST'));
    console.log('PASS existing delivery and handover endpoints and state updates preserved');
    await evaluate(`document.getElementById('adoption-tab-process').focus()`);
    await command('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowLeft',code:'ArrowLeft',windowsVirtualKeyCode:37});
    await waitFor(`document.querySelector('#adoption-tab-overview[aria-selected=true]')`,'keyboard tabs');
    console.log('PASS keyboard tab navigation and print-only PDF rendering');
    assert.equal(browserErrors.length, 0, browserErrors.join('\n'));
    console.log('PASS no uncaught browser errors; every API mocked; no real records, messages, certificates or emails changed');
} finally {
    if (command) { try { await command('Browser.close'); } catch {} }
    socket?.close();
    browser.kill();
    // Only remove the isolated profile created by this test, after verifying its absolute parent and prefix.
    const resolvedProfile = resolve(profile);
    if (resolvedProfile.startsWith(resolve(tmpdir()) + '\\straysafe-adoption-details-test-')) {
        await rm(resolvedProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
    }
}
