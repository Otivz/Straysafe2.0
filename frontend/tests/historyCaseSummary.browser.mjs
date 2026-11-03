// Run with Vite on port 5173: node frontend/tests/historyCaseSummary.browser.mjs
// The real Subdivision and Barangay history pages keep summary, details and activity in accessible tabs.
// Uses an isolated Chrome profile and a mocked API (report 1 as recorded in
// Phase 0 of docs/03-development/audits/HISTORY_REPORT_DETAILS_AUDIT_2026-11-02.md); no live data is read or changed.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const base = process.env.HISTORY_TEST_URL || 'http://127.0.0.1:5173';
const chromeBin = process.env.CHROME_BIN || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile = await mkdtemp(join(tmpdir(), 'straysafe-history-summary-test-'));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const browser = spawn(chromeBin, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-background-networking', 'about:blank'], { windowsHide: true, stdio: 'ignore' });

const report1 = {
    report_id: 1, user_id: 7, subdivision_id: 1, category_id: 4, status_id: 11, current_status_id: 11,
    reporter_name: 'Resident One', created_at: '2026-11-02T19:11:24', updated_at: '2026-11-02T19:21:59',
    latitude: 14.8018, longitude: 121.0028, landmark: 'Phase 1 Gate', description: 'A dog is scattering trash.',
    visibility: 'Private', visible_to_residents: false, media: [], endorsement_letter: null, owner_return: null,
    comments: [{ comment_id: 1, report_id: 1, user_id: 2, comment: 'Owner was informed in person.', user_name: 'Leader Santos', created_at: '2026-11-02T19:18:00' }],
    comments_open: false, ai_photo_status: 'Likely Authentic', ai_photo_likelihood: 0.08, ai_photo_recommendation: 'Photo appears authentic.',
    animal_type: 'Dog', animal_breed: 'Aspin', ai_possible_breed: 'Aspin', animal_color: 'Tan and White',
    ai_coat_pattern: 'Bicolor', estimated_size: 'Medium', condition: 'Healthy', animal_count: 1,
    priority_level: 'Medium', ai_suggested_priority: 'Medium Priority',
    ai_suggested_priority_reason: 'The stray dog is causing a nuisance by scattering trash.',
    verified_by_name: null, verified_at: null, verification_notes: null,
    observation: { open: false, status: 'complied', due_at: '2026-11-05T11:16:56+00:00', extended: false, ended_at: '2026-11-02T11:22:00+00:00', outcome: 'the owner complied',
        started_at: '2026-11-02T11:16:56+00:00', extension_days: null, extension_reason: null, closed_by_name: 'Leader Santos' },
    issued_warnings: [{ warning_id: 1, warning_level: 'Notice', violation_type: 'Free-Roaming Unleashed', status: 'Issued', issued_at: '2026-11-02T19:16:30', issuer_name: 'Leader Santos', owner_phone: '09170000000' }],
    latest_warning: { warning_id: 1, warning_level: 'Notice', violation_type: 'Free-Roaming Unleashed', status: 'Issued', issued_at: '2026-11-02T19:16:30', issuer_name: 'Leader Santos', owner_phone: '09170000000' },
    pet_name: 'Baron', case_pet_name: 'Baron', matched_pet_record: { pet_id: 1, pet_name: 'Baron', breed: 'Aspin', owner_name: 'Emmanuel Vito Cruz', photo_url: 'https://res.cloudinary.com/demo/image/upload/v1/pets/baron.jpg' },
    disputes: [], merged_reports: [{ report_id: 3, landmark: 'Phase 2 Park' }],
    history: [
        { history_id: 1, report_status_id: 1, created_at: '2026-11-02T19:11:24', updater_name: 'Resident One', media: [] },
        { history_id: 2, report_status_id: 2, created_at: '2026-11-02T19:11:51', updater_name: 'Leader Santos', remarks: 'Checked on site.', media: [] },
        { history_id: 3, report_status_id: 7, created_at: '2026-11-02T19:16:56', updater_name: 'Leader Santos', media: [] },
        { history_id: 4, report_status_id: 11, created_at: '2026-11-02T19:21:59', updater_name: 'Leader Santos', remarks: 'The owner complied.', media: [] },
    ],
};

// A long case for the printout: many comments and five photos (one is a later evidence attachment, not printed)
const longReport = {
    ...report1, report_id: 2,
    media: [1, 2, 3, 4].map(i => ({ media_id: i, media_type: 'Image', file_url: `https://res.cloudinary.com/demo/image/upload/v1/reports/photo${i}.jpg` }))
        .concat([{ media_id: 5, media_type: 'Image', is_evidence: true, file_url: 'https://res.cloudinary.com/demo/image/upload/v1/reports/evidence.jpg' }]),
    comments: Array.from({ length: 36 }, (_, i) => ({ comment_id: 100 + i, report_id: 2, user_id: 2, user_name: i % 2 ? 'Leader Santos' : 'Resident One',
        created_at: `2026-11-02T19:${String(20 + Math.floor(i / 2)).padStart(2, '0')}:00`,
        comment: `Update ${i + 1}: the dog was seen near the gate again and the owner was reminded to keep it inside the yard.` })),
    observation: { open: false, status: 'complied', started_at: '2026-11-02T11:16:56+00:00', due_at: '2026-11-07T11:16:56+00:00', extended: true,
        extension_days: 2, extension_reason: 'Owner is in the hospital this week.', ended_at: '2026-11-02T11:22:00+00:00', outcome: 'the owner complied', closed_by_name: 'Leader Santos' },
    disputes: [{ dispute_id: 7, report_id: 2, resident_user_id: 9, resident_name: 'Pedro Dela Paz', dispute_reason: 'My neighbour lies about my dog.',
        status: 'Rejected', created_at: '2026-11-02T19:40:00', resolved_at: '2026-11-02T19:50:00', reviewer_name: 'Staff Cruz', reviewer_notes: 'Vaccination card does not match.' }],
};
// 1x1 PNG served for every image request
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
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let nextId = 0;
    const pending = new Map();
    command = (method, params = {}) => new Promise((resolve, reject) => {
        const id = ++nextId;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 20000);
        pending.set(id, { resolve, reject, timer });
        socket.send(JSON.stringify({ id, method, params }));
    });

    let roleId = 2;
    const browserErrors = [];
    const unexpectedCalls = new Set();
    const json = (body, status = 200) => ({ status, body });
    const printLogCalls = [];
    let printLogFails = false;
    let previewHtml = '';
    const PRINT_ROLES = { 2: ['Leader Santos', 'Subdivision Leader'], 3: ['Staff Cruz', 'Barangay Staff'], 4: ['Admin Reyes', 'Administrator'] };
    const answer = url => {
        const path = url.pathname.replace(/^\/api/, '');
        if (path === '/auth/verify-session') return json({ status: 'valid', role_id: roleId, is_verified: true });
        if (path === '/reports/1') return json(report1);
        if (path === '/reports/2') return json(longReport);
        if (/^\/reports\/\d+\/print-log$/.test(path)) {
            printLogCalls.push(path);
            if (printLogFails) return json({ detail: 'Server error' }, 500);
            const [name, role] = PRINT_ROLES[roleId];
            return json({ report_id: Number(path.split('/')[2]), printed_by: name, role, printed_at: '2026-11-02T20:05:00' });
        }
        if (path.startsWith('/rescue-requests')) return json({ detail: 'Not found' }, 404);
        if (!['/holding/', '/notifications/', '/notifications/unread-count'].includes(path)) unexpectedCalls.add(path);
        return json([]);
    };
    const intercept = async ({ requestId, request }) => {
        const url = new URL(request.url);
        if (url.hostname === 'res.cloudinary.com') {
            await command('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'image/png' }], body: PNG.toString('base64') });
            return;
        }
        if (url.pathname === '/__print_preview__') {
            await command('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/html' }], body: Buffer.from(previewHtml).toString('base64') });
            return;
        }
        const external = !url.pathname.startsWith('/api/');
        const { status, body } = external ? json({}) : answer(url);
        await command('Fetch.fulfillRequest', { requestId, responseCode: status,
            responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
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
    // Times are checked as a viewer in the Philippines sees them
    await command('Emulation.setTimezoneOverride', { timezoneId: 'Asia/Manila' });
    // Application API, the address lookup and map tiles are all answered here; nothing leaves the machine.
    await command('Fetch.enable', { patterns: [{ urlPattern: '*://*/api/*' }, { urlPattern: '*nominatim.openstreetmap.org*' }, { urlPattern: '*tile.openstreetmap.org*' }, { urlPattern: '*basemaps.cartocdn.com*' }, { urlPattern: '*res.cloudinary.com*' }, { urlPattern: '*://*/__print_preview__*' }] });
    const evaluate = async expression => {
        const response = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
        return response.result.value;
    };
    const waitFor = async (expression, label) => {
        for (let i = 0; i < 200; i++) { if (await evaluate(expression)) return; await delay(100); }
        throw new Error(`Timed out: ${label}; errors: ${browserErrors.join('; ')}`);
    };

    // A signed-in staff or admin session (fake token; the mocked API accepts it)
    const token = 'test.' + Buffer.from(JSON.stringify({ user_id: 42, exp: 4102444800 })).toString('base64') + '.test';
    const setSession = role => command('Page.addScriptToEvaluateOnNewDocument', { source:
        `try { localStorage.setItem('${role === 4 ? 'admin_user' : 'staff_user'}', JSON.stringify({ user_id: 42, name: 'Test Staff', role_id: ${role}, access_token: '${token}' })); } catch (e) {}` });

    for (const [role, path] of [[2, '/subd/history/1'], [3, '/brgy/history/1'], [4, '/admin/incidents/1']]) {
        roleId = role;
        const { identifier } = await setSession(role);
        for (const width of [1280, 390]) {
            await command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 640 });
            await command('Page.navigate', { url: base + path });
            await waitFor(`!!document.querySelector('[data-case-summary]')`, `${path} case summary`);
            const summary = await evaluate(`document.querySelector('[data-case-summary]').innerText.replace(/\\s+/g, ' ')`);
            assert.match(summary, /Incident Resolved/, `${path}: final outcome`);
            assert.match(summary, /Recorded by Leader Santos Remarks The owner complied\./, `${path}: recorded by`);
            assert.match(summary, /Verified by Leader Santos .* Notes Checked on site\. Taken from the case history\./, `${path}: verification from history`);
            assert.match(summary, /Breed Aspin Color Tan and White Coat pattern Bicolor AI Size Medium/, `${path}: animal`);
            assert.match(summary, /Priority Medium AI suggested Medium Priority/, `${path}: priority`);
            // Phase 3 case events
            assert.match(summary, /Status Owner complied Started Nov 2, 2026, 7:16 PM Ended Nov 2, 2026, 7:22 PM Closed by Leader Santos/, `${path}: owner observation`);
            assert.equal(await evaluate(`!!document.querySelector('[data-case-summary] [data-pet-photo]')`), true, `${path}: pet photo`);
            assert.match(summary, /Closed on Nov 2, 2026, 7:21 PM/, `${path}: closing time in the same clock as the observation`);
            assert.match(summary, /Issued 1 warning Latest Notice · Free-Roaming Unleashed/, `${path}: warning`);
            assert.match(summary, /Pet Baron Breed Aspin Owner Emmanuel Vito Cruz/, `${path}: pet and owner`);
            assert.doesNotMatch(summary, /0917/, `${path}: no owner phone`);
            // Phase 4
            assert.match(summary, /Residents see it Private/, `${path}: visibility`);
            assert.match(summary, /Result Likely Authentic Likelihood AI-made 8%/, `${path}: AI photo check`);
            assert.match(summary, /Comments \(1\) Leader Santos · Nov 2, 2026, 7:18 PM Owner was informed in person\. Comments are closed for this case\./i, `${path}: comments`);
            const mergedHref = await evaluate(`document.querySelector('[data-summary-section=linked] a')?.getAttribute('href')`);
            assert.equal(mergedHref, `${path.replace(/\/1$/, '')}/3`, `${path}: merged report links to this role's history page`);

            const isAdmin = path.startsWith('/admin');
            if (!isAdmin) {
                assert.equal(await evaluate(`document.querySelector('[role=tab][aria-selected=true]').textContent.trim()`), 'Summary', `${path}: summary opens first`);
                // Arrow keys activate each view and move focus; inactive content stays out of the reading order.
                await evaluate(`document.querySelector('[role=tab][aria-selected=true]').focus()`);
                await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight' });
                await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight' });
                await waitFor(`document.querySelector('[role=tab][aria-selected=true]')?.textContent.trim() === 'Report details'`, 'details tab');
                assert.equal(await evaluate(`document.activeElement.getAttribute('aria-selected')`), 'true', `${path}: keyboard focus follows the selected tab`);
                assert.equal(await evaluate(`document.querySelectorAll('[role=tabpanel]:not([hidden])').length`), 1, `${path}: one visible panel`);
            }
            const page = await evaluate(`document.querySelector('main').innerText`);
            if (isAdmin) {
                // Phase 5: the admin cards the panel replaces are gone (two showed invented text); admin tools stay
                for (const gone of ['Subdivision Field Verification Dossier', 'Protocol Compliant', 'Physical inspection confirmed presence',
                    'AI Vision Analysis', 'Animal Profile & Characteristics'])
                    assert.equal(page.toLowerCase().includes(gone.toLowerCase()), false, `${path}: "${gone}" removed`);
                assert.match(page, /Resident's Description/i, `${path}: description card kept`);
                assert.match(page, /A dog is scattering trash\./, `${path}: description text kept`);
                assert.match(page, /Direct Override/i, `${path}: admin actions kept`);
            } else {
                // The details grid keeps category, landmark and street, and no longer repeats the panel's fields
                for (const gone of ['Detected Animal Type', 'Dominant Color', 'Estimated Size', 'Animal Count'])
                    assert.equal(page.toLowerCase().includes(gone.toLowerCase()), false, `${path}: "${gone}" removed from the details grid`);
                assert.match(page, /Category\s+Roaming Animal/i, `${path}: category kept`);
                assert.match(page, /Landmark\s+Phase 1 Gate/i, `${path}: landmark kept`);
                assert.match(page, /A dog is scattering trash\./, `${path}: description kept`);
                assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true, `${path}: details fit at ${width}px`);
                if (process.env.SCREENSHOT_DIR) {
                    await evaluate(`document.querySelector('main').scrollTop = 0`);
                    const { writeFile } = await import('node:fs/promises');
                    await writeFile(join(process.env.SCREENSHOT_DIR, `${path.split('/')[1]}-${width}-details.png`), Buffer.from((await command('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
                }
                await evaluate(`[...document.querySelectorAll('[role=tab]')].find(t => t.textContent.trim() === 'Activity').click()`);
                await waitFor(`document.querySelector('main').innerText.includes('Activity timeline')`, 'activity tab');
                assert.match(await evaluate(`document.querySelector('[role=tabpanel]:not([hidden])').innerText`), /Incident Resolved/i, `${path}: existing timeline kept`);
                assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true, `${path}: activity fits at ${width}px`);
                // A programmatic click doesn't focus its target, so explicitly focus before checking Home.
                await evaluate(`document.querySelector('[role=tab][aria-selected=true]').focus()`);
                await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Home', code: 'Home' });
                await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Home', code: 'Home' });
                await waitFor(`!!document.querySelector('[data-case-summary]')`, 'summary restored');
            }

            // Admin keeps its existing management tools below the shared summary.
            const panelFirst = !isAdmin || await evaluate(`(() => {
                const panel = document.querySelector('[data-case-summary]').getBoundingClientRect().top;
                const next = [...document.querySelectorAll('main h3, main h4')].find(h => h.textContent.includes('Sighting Evidence'));
                return !!next && panel < next.getBoundingClientRect().top;
            })()`);
            assert.equal(panelFirst, true, `${path}: panel above the page's own cards at ${width}px`);
            assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true, `${path}: no sideways scroll at ${width}px`);
            if (process.env.SCREENSHOT_DIR) {
                await evaluate(`document.querySelector('main').scrollTop = 0`);
                await delay(300);
                const shot = await command('Page.captureScreenshot', { format: 'png' });
                const { writeFile } = await import('node:fs/promises');
                await writeFile(join(process.env.SCREENSHOT_DIR, `${path.split('/')[1]}-${width}.png`), Buffer.from(shot.data, 'base64'));
                await evaluate(`document.querySelector('[data-case-summary]').scrollIntoView({ block: 'end' })`);
                await delay(300);
                const end = await command('Page.captureScreenshot', { format: 'png' });
                await writeFile(join(process.env.SCREENSHOT_DIR, `${path.split('/')[1]}-${width}-end.png`), Buffer.from(end.data, 'base64'));
            }
            console.log(`PASS ${path} at ${width}px: Case Summary shown before the page's own cards, duplicates removed, page-specific content kept`);
        }
        await command('Page.removeScriptToEvaluateOnNewDocument', { identifier });
    }
    // Phase 6: Print / Save as PDF. The app prints from a hidden frame; the test keeps a copy of that frame's page,
    // counts the print() calls, then renders the copy to a real PDF with Chrome's print engine.
    await command('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    const printCases = [
        { role: 2, path: '/subd/history/2', fails: false, name: 'Leader Santos, Subdivision Leader' },
        { role: 3, path: '/brgy/history/1', fails: true, name: 'Test Staff, Barangay Staff' },
        { role: 4, path: '/admin/incidents/2', fails: false, name: 'Admin Reyes, Administrator' },
    ];
    for (const pc of printCases) {
        roleId = pc.role;
        printLogFails = pc.fails;
        const { identifier } = await setSession(pc.role);
        await command('Page.navigate', { url: base + pc.path });
        await waitFor(`!!document.querySelector('[data-print-case]')`, `${pc.path} print button`);
        await evaluate(`(() => {
            window.__print = { html: null, calls: 0 };
            new MutationObserver(changes => { for (const c of changes) for (const n of c.addedNodes) if (n.tagName === 'IFRAME') {
                if (n.contentWindow) n.contentWindow.print = () => { window.__print.calls++; };
                window.__print.html = n.contentDocument ? n.contentDocument.documentElement.outerHTML : null;
            } }).observe(document.body, { childList: true });
        })()`);
        const callsBefore = printLogCalls.length;
        await evaluate(`document.querySelector('[data-print-case]').click()`);
        await waitFor(`window.__print && window.__print.calls === 1`, `${pc.path} print dialog opened`);
        const html = await evaluate('window.__print.html');
        assert.equal(printLogCalls.length, callsBefore + 1, `${pc.path}: one print-log request`);
        const reportNo = pc.path.split('/').pop();
        const body = html.replace(/<style[\s\S]*?<\/style>/g, '');
        // A formal document: title, record details, numbered sections, signature lines, page header and footer
        assert.ok(body.includes('Animal Incident Case Record') && body.includes(`#${reportNo}`), `${pc.path}: title and report number`);
        for (const label of ['Report No.', 'Category', 'Date reported', 'Location', 'Roaming Animal', 'Phase 1 Gate'])
            assert.ok(body.includes(label), `${pc.path}: record details show "${label}"`);
        assert.match(body, /1\.<\/span> Case Outcome/, `${pc.path}: numbered sections`);
        assert.ok(body.includes('Prepared by') && body.includes('Noted by'), `${pc.path}: signature lines`);
        assert.ok(html.includes(`Printed by ${pc.name} · ${pc.fails ? '' : 'Nov 2, 2026, 8:05 PM'}`) && body.includes(pc.name),
            `${pc.path}: printed by ${pc.name}${pc.fails ? ' (browser fallback when the log fails)' : ''}`);
        assert.match(html, /size: letter portrait/, `${pc.path}: US Letter`);
        assert.match(html, /counter\(pages\)/, `${pc.path}: page numbers`);
        // Kept: outcome, verification, animal, priority, observation dates, warnings, pet and owner (with photo)
        for (const kept of ['Incident Resolved', 'The owner complied.', 'Leader Santos', 'Checked on site.', 'Tan and White', 'Medium Priority',
            'Owner complied', 'Free-Roaming Unleashed', 'Baron', 'Emmanuel Vito Cruz', 'pet-photo', 'Data Privacy Act of 2012', 'Not included in this printout'])
            assert.ok(body.includes(kept), `${pc.path}: keeps "${kept}"`);
        // Left out (developer, 2026-11-03)
        const left = [
            ['comments', /Update 1:|Owner was informed in person/],
            ['visibility', /Residents see it|Only the reporter and the officials/],
            ['AI photo check', /Likelihood AI-made|Photo appears authentic|Likely Authentic/],
            ['AI priority reason', /causing a nuisance by scattering trash/],
            ['incident photos', /reports\/photo\d|evidence\.jpg/],
            ['extension reason', /in the hospital/],
            ['dispute names, reasons and review notes', /Pedro Dela Paz|neighbour lies|Vaccination card does not match/],
            ['print button, sidebar, admin buttons, map', /data-print-case|HISTORY REPORTS|Logout|Direct Override|leaflet-container/i],
            ['phone numbers', /0917/],
        ];
        for (const [what, pattern] of left) assert.equal(pattern.test(body), false, `${pc.path}: ${what} left out`);
        if (reportNo === '2') {
            assert.match(body, /Disputes \(1\)[\s\S]*Rejected/, `${pc.path}: dispute count and status kept`);
            assert.match(body, /Extended<\/th><td>Yes, by 2 days/, `${pc.path}: extension length kept`);
        }

        // Render the printout as Chrome would print it
        previewHtml = html;
        await command('Page.navigate', { url: base + '/__print_preview__' });
        await waitFor(`document.readyState === 'complete' && !!document.querySelector('.case-record')`, 'print preview');
        await delay(300);
        const pdf = Buffer.from((await command('Page.printToPDF', { preferCSSPageSize: true, printBackground: true })).data, 'base64');
        const text = pdf.toString('latin1');
        const pages = (text.match(/\/Type\s*\/Page(?!s)/g) || []).length;
        assert.match(text, /\/MediaBox\s*\[\s*0\s+0\s+612\s+792\s*\]/, `${pc.path}: PDF pages are 8.5 x 11 in (612 x 792 pt)`);
        const expectPages = [1, 3];
        assert.ok(pages >= expectPages[0] && pages <= expectPages[1], `${pc.path}: ${pages} PDF pages (expected ${expectPages.join('-')})`);
        if (process.env.SCREENSHOT_DIR) {
            const { writeFile } = await import('node:fs/promises');
            await writeFile(join(process.env.SCREENSHOT_DIR, `print-${pc.path.split('/')[1]}-${reportNo}.pdf`), pdf);
        }
        console.log(`PASS print ${pc.path}: logged ${pc.fails ? '(log failed, printed anyway)' : 'once'}, printed by ${pc.name}, Letter, ${pages} page(s), excluded details absent`);
        await command('Page.removeScriptToEvaluateOnNewDocument', { identifier });
    }

    assert.equal(browserErrors.length, 0, browserErrors.join('\n'));
    console.log('PASS no uncaught browser errors; all API calls mocked' + (unexpectedCalls.size ? ` (also answered with []: ${[...unexpectedCalls].join(', ')})` : ''));
} finally {
    if (command) { try { await command('Browser.close'); } catch {} }
    socket?.close();
    browser.kill();
    // Only remove the isolated profile created by this test, after verifying its absolute parent and prefix.
    const resolvedProfile = resolve(profile);
    if (resolvedProfile.startsWith(resolve(tmpdir()) + '\\straysafe-history-summary-test-')) {
        await rm(resolvedProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
    }
}
