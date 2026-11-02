// Neighbor-to-Neighbor Lost Pet Sighting Ping (docs/01-system/LOST_PET_SIGHTING_PING.md). Run with local Vite:
// LOST_PETS_TEST_URL defaults to http://127.0.0.1:5175. The fixture answers all API requests in memory with synthetic
// data; this runner also blocks backend and external requests.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const base = process.env.LOST_PETS_TEST_URL || 'http://127.0.0.1:5175';
const chrome = process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const profilePrefix = join(tmpdir(), 'straysafe-lost-pets-');
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
        const navigate = async (query, ready) => {
            errors.length = 0;
            await command('Page.navigate', { url: `${base}/tests/fixtures/lostPets.html?${query}` });
            await waitFor(ready, query);
            await pause(300);
            assert.deepEqual(errors, [], query);
        };

        // Resident: there is no standalone alert list any more; without an alert id the page sends the resident home
        await navigate('page=resident-list', 'document.body.textContent.includes("Navigated away")');
        scenarios++;

        // Resident: alert card, tracking map, timeline (last known first, latest flagged, times kept apart)
        await navigate('page=resident-detail', '!!document.querySelector("[data-testid=sighting-timeline]")');
        for (const t of ['Bantay', 'Dog · Aspin · Brown with white socks', 'Red collar', 'Subdivision entrance', 'Lost Pet Tracking Map',
            'Each pin is a separate reported sighting, not a route.', 'Message the owner through StraySafe']) {
            assert((await text()).includes(t), `detail shows ${t}`);
        }
        const items = await evaluate('[...document.querySelectorAll("[data-testid=sighting-timeline] li")].map(li => li.textContent)');
        assert(items[0].includes('Last known location'), 'last known location first');
        assert(items[1].includes('Lot 15') && items[2].includes('Clubhouse'), 'sightings by reported time');
        assert(items[2].includes('Latest') && !items[1].includes('Latest'), 'latest submitted sighting flagged');
        assert(items[1].includes('Seen') && items[1].includes('submitted'), 'reported and submitted times both shown');
        assert.equal(await evaluate('document.querySelectorAll(".leaflet-marker-icon").length'), 3, 'last known + 2 sighting markers');
        assert.equal(await evaluate('document.querySelectorAll(".leaflet-overlay-pane path").length'), 0, 'pins are not joined into a route');
        assert(!(await text()).includes('Neighbor Ben'), 'neighbors see no reporter names');
        assert.equal(await evaluate('document.documentElement.scrollWidth > window.innerWidth + 2'), false, 'no horizontal overflow');
        scenarios++;

        // Spotted Here: pin on the map, consent before device location, accuracy confirmation, multipart submit
        await click(button('📍 Report a Sighting'));
        await waitFor('!!document.querySelector("[data-testid=spotted-here-form]")', 'form open');
        assert(await disabled('Submit sighting'), 'needs a pin first');
        await click(button('Use my current location'));
        assert((await text()).includes('device location once'), 'asks before using the device location');
        await click(button('Use the map instead'));
        await evaluate(`(() => { const m = document.querySelector("[data-testid=spotted-here-form] .leaflet-container"); const r = m.getBoundingClientRect();
            const o = { bubbles: true, cancelable: true, clientX: r.left + r.width / 2 + 20, clientY: r.top + r.height / 2 + 10, button: 0 };
            m.dispatchEvent(new MouseEvent("mousedown", o)); m.dispatchEvent(new MouseEvent("mouseup", o)); m.dispatchEvent(new MouseEvent("click", o)); })()`);
        await waitFor('document.body.textContent.includes("Pin set (map pin)")', 'pin placed by tapping the map');
        // The pin's own place name (looked up from its coordinates) fills the editable name; latitude/longitude shown with 6 decimals
        await waitFor('(document.querySelector("input[aria-label=\'Location name\']")?.value || "").startsWith("Near Synthetic Street")', 'place name filled from the pin');
        const pinLat = await evaluate('document.querySelector("[data-testid=pin-preview] [data-testid=pin-latitude]").textContent');
        const pinLng = await evaluate('document.querySelector("[data-testid=pin-preview] [data-testid=pin-longitude]").textContent');
        assert.match(pinLat, /^-?\d+\.\d{6}$/, 'latitude with 6 decimals'); assert.match(pinLng, /^-?\d+\.\d{6}$/, 'longitude with 6 decimals');
        assert.notEqual(pinLat, '14.801042', 'the pin, not the last known location');
        const autoName = await evaluate('document.querySelector("input[aria-label=\'Location name\']").value');
        assert.equal(autoName, `Near Synthetic Street ${Number(pinLat).toFixed(4)}, Test Phase, Test City`, 'name comes from this pin');
        assert((await text()).includes('Copy coordinates'), 'coordinates can be copied');
        const earlier = await evaluate('(() => { const d = new Date(Date.now() - 30 * 60000); const p = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; })()');
        await type('Sighting time', earlier);
        assert(await disabled('Submit sighting'), 'accuracy confirmation required');
        await click('document.querySelector("[aria-label=\'I confirm the sighting is accurate\']")');
        await click(button('Submit sighting'));
        await waitFor('document.body.textContent.includes("Thank you! Your sighting was sent")', 'sighting sent');
        const sent = await evaluate('window.lostRequests.find(r => r.method === "post" && r.path.endsWith("/sightings")).body');
        assert.equal(sent.location_source, 'map_pin'); assert.equal(sent.accuracy_confirmed, 'true'); assert.equal(sent.seen_at, earlier);
        assert(sent.client_request_id && sent.latitude && sent.longitude, 'pin and submission id sent');
        assert.equal(sent.location_label, autoName, 'the place name is saved with the sighting');
        assert.equal(Number(sent.latitude).toFixed(6), pinLat, 'the shown latitude is the saved one');
        // Sighting details: name, latitude and longitude of the chosen sighting
        await waitFor('[...document.querySelectorAll("button")].filter(b => b.textContent === "View details").length === 3', 'new sighting listed');
        await evaluate('[...document.querySelectorAll("[data-testid=sighting-timeline] li")].find(li => li.textContent.includes("Lot 15")).querySelector("button").click()');
        await waitFor('!!document.querySelector("[data-testid=sighting-detail]")', 'details open');
        const detail = await evaluate('document.querySelector("[data-testid=sighting-detail]").textContent');
        assert(detail.includes('Location: Lot 15') && detail.includes('Latitude: 14.801442') && detail.includes('Longitude: 121.003648'), `details show name and coordinates: ${detail}`);
        // Marker popup: the same information
        await evaluate('document.querySelectorAll("[aria-label=\'Lost pet tracking map\'] .leaflet-marker-icon")[1].click()');
        await waitFor('!!document.querySelector(".leaflet-popup [data-testid=pin-latitude]")', 'popup open');
        const popup = await evaluate('document.querySelector(".leaflet-popup").textContent');
        assert(/Latitude: -?\d+\.\d{6}/.test(popup) && /Longitude: -?\d+\.\d{6}/.test(popup) && popup.includes('Location:'), `popup shows coordinates: ${popup}`);
        scenarios++;

        // Leader: dashboard stats and lists
        await navigate('page=leader-list', '!!document.querySelector("[data-testid=lost-pet-stats]")');
        for (const t of ['Active lost pet alerts', 'Total sighting reports', 'Pets successfully reunited', 'Pending lost pet reports', 'Recent sightings', 'Lost pet reports without an alert', 'Resolved lost pet cases']) {
            assert((await text()).includes(t), `dashboard shows ${t}`);
        }
        scenarios++;

        // Leader: a requested alert is reviewed and broadcast
        await navigate('page=leader-detail', '!!document.querySelector("[data-testid=lost-pet-alert-view]")');
        assert((await text()).includes('Requested (waiting for the Subdivision Leader)'), 'requested state');
        assert(!(await text()).includes('📍 Report a Sighting'), 'no sightings before the broadcast');
        await click(button('Activate Neighborhood Alert'));
        await type('Message to residents', 'Please check your garages.');
        await click(button('Broadcast to residents'));
        await waitFor('document.body.textContent.includes("The neighborhood alert is live")', 'activated');
        const act = await evaluate('window.lostRequests.find(r => r.path === "/lost-pet-alerts/7/activate").body');
        assert.equal(act.leader_message, 'Please check your garages.');
        assert((await text()).includes('Neighbor Ben'), 'the leader sees reporter names');
        scenarios++;
    }
    assert.deepEqual(backendAttempts, [], 'no backend requests');
    console.log(JSON.stringify({ result: 'PASS', scenarios, widths: [390, 1280], backendRequests: 0 }));
} finally {
    socket?.close(); browser.kill(); await pause(500);
    assert(profile.startsWith(profilePrefix));
    await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
}
