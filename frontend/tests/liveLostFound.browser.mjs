// The Leader's Lost & Found possible matches, driven in a real (headless) browser against the REAL backend code on a throwaway SQLite database
// (see _liveHarness.mjs). Run from the frontend folder (PowerShell), with PYTHON pointing at the project's virtual environment:
//     $env:PYTHON = '..\.venv\Scripts\python.exe'; node tests/liveLostFound.browser.mjs
// It starts and stops its own API (port 8781) and Vite dev server (port 5191): it never uses port 8000 or 5173, never reads .env and never touches the
// configured MySQL database. Every report and person in it is a synthetic fixture made by this run.
//
// What it proves: the background check suggests a match the moment a report is filed, and tells nobody but the Leader; the dashboard asks about it
// (not about a "new report"); the comparison shows why the two reports may match; nothing is linked, and no resident is told, until the Leader
// confirms; ruling out tells nobody and can be reviewed again; confirming links both reports (nothing merged), tells both residents and opens the way
// to get in touch; a missing pet and a found animal are "Under monitoring" with no Assessment tab, no status or priority to set; asking the Barangay
// is one choice and an optional note, and a referral that was only written down says nobody was contacted.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ACCOUNTS, PASSWORD, apiLogin, delay, openBrowser, startStack } from './_liveHarness.mjs';

let passed = 0;
const failures = [];
let page;
let stack;
let browser;

async function step(name, fn) {
  try { await fn(); passed += 1; console.log(`[PASS] ${name}`); }
  catch (error) {
    failures.push(name);
    console.log(`[FAIL] ${name}\n       ${String(error.message).split('\n').filter(Boolean).slice(0, 4).join(' ')}`);
    try { console.log(`       page: ${await page.path()}\n       text: ${(await page.text()).replace(/\s+/g, ' ').slice(0, 1800)}`); } catch { /* the page is gone */ }
    try {
      const dialog = await page.evaluate(`[...document.querySelectorAll('dialog[open]')].map((d) => d.innerText.replace(/\\s+/g, ' ').trim().slice(-900)).join(' || ')`);
      if (dialog) console.log(`       open dialog (end of its text): ${dialog}`);
    } catch { /* the page is gone */ }
    if (page?.errors.length) console.log(`       browser errors: ${page.errors.slice(-3).join(' | ').slice(0, 500)}`);
    throw error;
  }
}

/** Waits for some text, ignoring capitals (several labels are shown in capitals by the stylesheet). */
const seen = (text, timeoutMs = 20000) => page.waitFor(`document.body.innerText.toLowerCase().includes(${JSON.stringify(text.toLowerCase())})`, `the text “${text}”`, timeoutMs);
const unseen = (text, timeoutMs = 20000) => page.waitFor(`!document.body.innerText.toLowerCase().includes(${JSON.stringify(text.toLowerCase())})`, `“${text}” to go away`, timeoutMs);
const textOf = async () => (await page.text()).replace(/\s+/g, ' ');
const ref = (id) => `SS-${new Date().getFullYear()}-${String(id).padStart(4, '0')}`;
const DIALOG = `document.querySelector('dialog[open]')`;

async function signInAdmin(email, password) {
  await page.goto('/login');
  await page.waitText('Welcome back');
  await page.fill('Email', email);
  await page.fill('Password', password);
  await page.click('Sign in', { selector: 'button[type=submit]' });
  await page.waitFor("location.pathname === '/dashboard'", 'Admin sign-in');
}

async function signInResident(email, password) {
  await page.clearSession();
  await page.goto('/resident-app/login');
  await page.waitText('Welcome back');
  await page.fill('Email', email);
  await page.fill('Password', password);
  await page.click('Sign in', { selector: 'button[type=submit]' });
  await page.waitFor("location.pathname.endsWith('/home')", 'Home');
  await seen('Selera Homes');                                                      // Home has loaded (its sections depend on what the resident has)
}

/** The screen must fit the width of a phone and of a desktop: nothing may push the page wider than the viewport. */
async function fits(name) {
  try {
    for (const [form, width, height] of [['mobile', 390, 844], ['desktop', 1280, 900]]) {
      await page.command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: form === 'mobile' });
      await delay(250);
      const layout = await page.evaluate(`(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth,
        overflowing: [...document.querySelectorAll('main *')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right > innerWidth + 1; }).slice(0, 5).map((el) => el.tagName + '.' + String(el.className).slice(0, 40)) }))()`);
      assert(layout.document <= layout.viewport + 1, `${name} ${form} overflows: ${JSON.stringify(layout)}`);
      if (form === 'mobile' && process.env.E2E_SCREENSHOT_DIR) {
        await mkdir(process.env.E2E_SCREENSHOT_DIR, { recursive: true });
        const { data } = await page.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        await writeFile(join(process.env.E2E_SCREENSHOT_DIR, `${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${form}.png`), Buffer.from(data, 'base64'));
      }
    }
  } finally { await page.command('Emulation.clearDeviceMetricsOverride'); }
}

try {
  stack = await startStack({ apiPort: 8781, webPort: 5191 });
  browser = await openBrowser(stack.webUrl);
  page = browser.page;
  const leaderApi = await apiLogin(stack.apiUrl, ACCOUNTS.leader, PASSWORD);
  const rita = await apiLogin(stack.apiUrl, ACCOUNTS.resident, PASSWORD);      // the owner of the missing pet
  const owen = await apiLogin(stack.apiUrl, ACCOUNTS.owner, PASSWORD);         // a neighbour who finds animals
  const categories = (await rita.get('/cases/categories')).body.categories;
  const categoryOf = (id) => categories.find((c) => c.id === id).category_id;

  let lostId;
  let strongId;     // the found report that matches strongly
  let weakId;       // another found dog that only might
  let bridgeId;
  let directId;
  const matches = async () => (await leaderApi.get('/lost-found/matches')).body;
  const matchFor = async (foundId) => (await matches()).find((m) => m.lost_report_id === lostId && m.found_report_id === foundId);
  const notificationsOf = async (who) => (await who.get('/notifications/me')).body;

  await step('filing a missing pet and then two found dogs: the background check suggests the matches and tells only the Leader (the other filing order is in the backend suite)', async () => {
    const pet = await rita.post('/pets/', { pet_name: 'Luna', pet_type: 'Dog', breed: 'Shih Tzu', color_markings: 'White and golden with a white chest', size_category: 'Small', gender: 'Female', confirm_new_pet: true });
    assert.equal(pet.status, 200, JSON.stringify(pet.body));
    const lost = await rita.post('/reports/', {
      category_id: categoryOf('lost_pet'), animal_type: 'Dog', animal_breed: 'Shih Tzu', animal_color: 'White and golden', estimated_size: 'Small', pet_id: pet.body.pet_id,
      description: 'Luna slipped out of the gate. She has a white chest and a red collar.', latitude: 14.8012, longitude: 121.004, landmark: 'Gate 2', animal_count: 1, client_request_id: 'e2e-luna',
    });
    assert.equal(lost.status, 200, JSON.stringify(lost.body));
    lostId = lost.body.report_id;
    const strong = await owen.post('/reports/', {
      category_id: categoryOf('found_animal'), animal_type: 'Dog', animal_color: 'White and golden', estimated_size: 'Small',
      description: 'A small white and golden dog with a white chest and a red collar, very friendly.', latitude: 14.8014, longitude: 121.0041, landmark: 'Gate 2', animal_count: 1,
    });
    assert.equal(strong.status, 200, JSON.stringify(strong.body));
    strongId = strong.body.report_id;
    const weak = await owen.post('/reports/', {
      category_id: categoryOf('found_animal'), animal_type: 'Dog', animal_color: 'White', estimated_size: 'Small', description: 'A white dog wandering around.', latitude: 14.8013, longitude: 121.0042, landmark: 'Gate 2', animal_count: 1,
    });
    assert.equal(weak.status, 200, JSON.stringify(weak.body));
    weakId = weak.body.report_id;
    const [a, b] = [await matchFor(strongId), await matchFor(weakId)];
    assert.deepEqual([a?.status, a?.level, b?.status], ['pending', 'strong', 'pending'], JSON.stringify(await matches()));
    assert(a.score > b.score, 'the better match scores higher');
    // nobody but the Leader was told: no link, no notification to either resident about a match
    assert.equal((await leaderApi.get(`/cases/${lostId}`)).body.links.length, 0, 'nothing is linked');
    for (const who of [rita, owen]) assert(!(await notificationsOf(who)).some((n) => /lost_found|lost_pet_secured|lost_pet_coordination/.test(n.type ?? '')), 'no resident was told about a possible match');
    assert((await notificationsOf(leaderApi)).some((n) => n.type === 'lost_found_review'), 'the Leader was told');
  });

  await step('leader: the dashboard asks about the possible matches (not about new reports), strongest first', async () => {
    await signInAdmin(ACCOUNTS.leader, PASSWORD);
    await seen('Possible matches to review (2)');
    const text = await textOf();
    assert(/2 possible matches between a missing pet and a found animal are waiting for you to confirm/i.test(text), 'the greeting says so');
    assert(text.includes('may be Luna'), 'a card names the two animals');
    assert(text.includes('Nothing is linked until you confirm it'), 'and says nothing is linked yet');
    assert(/strong match/i.test(text), 'the stronger one is marked');
    const buttons = await page.evaluate(`[...document.querySelectorAll('button')].filter((b) => b.innerText.trim() === 'Review match').length`);
    assert.equal(buttons, 2);
    // missing and found animals are monitored from the start: listed, never counted as new reports waiting for review
    assert(/missing and found animals/i.test(text), 'the monitored list is for both kinds');
    await fits('the dashboard');
  });

  await step('leader: the comparison says why they may match, and deciding later changes nothing', async () => {
    await page.click('Review match');
    await seen('Do these reports describe the same animal?');
    await seen('Why they may match');
    await page.waitFor(`!!${DIALOG}.querySelector('table')`, 'the comparison table to load');
    const dialog = await page.evaluate(`${DIALOG}.innerText.replace(/\\s+/g, ' ')`);
    assert(/same colours/i.test(dialog) && /white chest/i.test(dialog) && /same collar/i.test(dialog), `the reasons are given: ${dialog.slice(0, 600)}`);
    assert(/missing-pet report/i.test(dialog) && /found-animal report/i.test(dialog) && /distinguishing features/i.test(dialog) && /collar or tag/i.test(dialog), 'the two reports are compared row by row');
    assert(dialog.includes('Luna') && dialog.includes('Owen Owner'), 'it names the animal and the two residents');
    assert(dialog.includes('Gate 2'), 'and keeps place names as written');
    assert(/does not verify ownership and does not mark the pet recovered/i.test(dialog), 'it says what a link is not');
    await fits('the comparison');
    await page.click('Decide later');
    await page.waitFor(`!document.querySelector('dialog[open]')`, 'the dialog to close');
    assert.equal((await matchFor(strongId)).status, 'pending', 'still waiting');
    assert.equal((await leaderApi.get(`/cases/${lostId}`)).body.links.length, 0, 'still nothing linked');
  });

  await step('leader: "Not the same animal" rules the pair out and tells nobody; it can be reviewed again', async () => {
    // the weaker match is the second card
    await page.evaluate(`[...document.querySelectorAll('button')].filter((b) => b.innerText.trim() === 'Review match')[1].click()`);
    await seen('Do these reports describe the same animal?');
    await page.click('Not the same animal');
    await seen('Ruled out. Nobody was told.');
    await seen('Possible matches to review (1)');
    assert.equal((await matchFor(weakId)).status, 'rejected');
    for (const who of [rita, owen]) assert(!(await notificationsOf(who)).some((n) => /lost_found|lost_pet_secured|lost_pet_coordination/.test(n.type ?? '')), 'nobody was told');
    // the lost report keeps it, ruled out, so it is not suggested again, and it can be reviewed again from there
    await page.goto(`/cases/${ref(lostId)}`);
    await seen('Ruled out (1)');
    await page.click('Ruled out', { selector: 'summary' });
    await page.click('Review again');
    await seen('Ruled out as the same animal');
    await page.click('Review again', { within: DIALOG });
    await seen('Back in your list to review.');
    assert.equal((await matchFor(weakId)).status, 'pending');
  });

  await step('leader: confirming links the two reports, tells both residents and opens the way to get in touch; nothing is merged', async () => {
    await page.goto('/dashboard');
    await seen('Possible matches to review (2)');
    await page.click('Review match');                                    // the strongest is first
    await seen('Do these reports describe the same animal?');
    await page.click('Same animal: link them');
    await seen('Linked. Both residents were told.');
    const m = await matchFor(strongId);
    assert.equal(m.status, 'confirmed');
    const lost = (await leaderApi.get(`/cases/${lostId}`)).body;
    const found = (await leaderApi.get(`/cases/${strongId}`)).body;
    const bridge = lost.threads.find((t) => t.kind === 'bridge' && t.related_report_id === strongId);
    assert(bridge?.thread_id, 'linking immediately opens the owner/finder/Leader conversation');
    bridgeId = bridge.thread_id;
    assert.deepEqual([lost.links.map((l) => l.report_id), found.links.map((l) => l.report_id)], [[strongId], [lostId]], 'linked both ways');
    assert.notEqual(lost.case_status, 'closed', 'a link recovers nothing');
    assert.equal(lost.lost_pet.alert.recovered_at, null, 'and the pet is not marked home');
    assert((await notificationsOf(rita)).some((n) => n.type === 'lost_found_bridge' && n.related_id === bridgeId), 'the owner was told about the bridge');
    assert((await notificationsOf(owen)).some((n) => n.type === 'lost_found_bridge' && n.related_id === bridgeId), 'the finder was told about the bridge');
    // the weaker one is untouched, and the dashboard has one left
    assert.equal((await matchFor(weakId)).status, 'pending');
    await seen('Possible matches to review (1)');
  });

  await step('leader: a missing pet is one calm page: the animal first, one status, no tabs, no toolbar, and only what needs the Leader asked of them', async () => {
    await page.goto(`/cases/${ref(lostId)}`);
    await seen('Linked reports');
    const text = await textOf();
    // the animal, what happened and who to talk to come first
    for (const shown of ['Luna', 'Last seen', 'Luna slipped out of the gate', 'Owner', 'Rita Reporter']) assert(text.toLowerCase().includes(shown.toLowerCase()), `${shown} is shown`);
    assert(await page.evaluate(`!!document.querySelector('a[href^="tel:"]')`), 'the owner\'s phone number can be tapped');
    // no tabs, no assessment, no status or priority to set, no toolbar of competing actions
    assert.equal(await page.evaluate(`document.querySelectorAll('[role=tab]').length`), 0, 'no tabs');
    assert(!/assessment|change status|change priority|start review|mark in progress/i.test(text), 'no assessment or status steps');
    for (const b of ['Ask the Barangay', 'Record owner confirmation', 'More case actions']) assert(!(await page.has(b)), `no “${b}” at the top`);
    assert(!(await page.has('Add an update')) && !/save update/i.test(text), 'the activity writes itself: there is nothing to type in by hand');
    // the other possible match is what needs the Leader: one item, one strong button, said once
    assert(text.includes('Needs you · 1'), 'the one status says something needs the Leader');
    assert(text.toLowerCase().includes('needs you') && /may be Luna/.test(text), 'and the lane says what');
    assert.equal(await page.evaluate(`[...document.querySelectorAll('button')].filter((b) => b.innerText.trim() === 'Review match').length`), 1);
    const strong = await page.evaluate(`[...document.querySelectorAll('.sa-btn--primary')].filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).length`);
    assert(strong <= 1, `at most one strong button on the page (found ${strong})`);
    assert.equal(await page.evaluate(`document.querySelector('.sa-mc__chip').innerText.trim()`), 'Needs you · 1', 'the status is said once');
    // what is linked, and how the owner and the finder are getting in touch; occasional things are one line away, not on a toolbar
    assert(text.includes('Linked reports') && /found white/i.test(text) && /See why/.test(text), 'the linked found report is listed');
    assert(/Barangay/i.test(text) && /Not asked/.test(text) && /Ask for help/.test(text), 'asking the Barangay sits on its own tile, beside "Not asked"');
    assert(!(await page.has('Record the owner’s confirmation')), 'resolving the report is behind one line, not on the page');
    await page.click('Resolve this report', { selector: 'summary' });
    assert(await page.has('Record the owner’s confirmation'), 'the owner\'s confirmation is there when the Leader opens it');
    await fits('the missing-pet page');
  });

  await step('leader: a found animal is the same calm page, with the missing pet it was linked to and its ownership one line away', async () => {
    await page.goto(`/cases/${ref(strongId)}`);
    await seen('Linked reports');
    const text = await textOf();
    for (const shown of ['Found dog', 'Found', 'Reported by', 'Owen Owner', 'Luna']) assert(text.toLowerCase().includes(shown.toLowerCase()), `${shown} is shown`);
    assert.equal(await page.evaluate(`document.querySelector('.sa-mc__chip').innerText.trim()`), 'Under monitoring', 'monitored, and nothing is asked: its only match is already decided');
    assert.equal(await page.evaluate(`document.querySelectorAll('[role=tab]').length`), 0, 'no tabs');
    assert(!/assessment|start review/i.test(text), 'no assessment or status steps');
    assert(!(await page.has('Add an update')), 'the activity writes itself on a found animal too');
    assert(/owner of luna/i.test(text), 'the owner of the linked report is one of the people to talk to');
    assert(!(await page.has('Ownership status')), 'the ownership form is not on the page until it is opened');
    await page.click('Who does it belong to?', { selector: 'summary' });
    await seen('Ownership status');
    await fits('the found-animal page');
  });

  await step('leader: asking the Barangay is one choice, "not yet" unless the Leader says otherwise; the written-down call is then asked about until it is made', async () => {
    await page.goto(`/cases/${ref(lostId)}`);
    await seen('Ask for help');
    await page.click('Ask for help');
    await seen('What help do you need?');
    const options = await page.evaluate(`[...${DIALOG}.querySelectorAll('select')][0] ? [...[...${DIALOG}.querySelectorAll('select')].find((s) => [...s.options].some((o) => /searching/i.test(o.text))).options].map((o) => o.text) : []`);
    assert.equal(options.length, 6, options.join(' | '));
    assert.equal(await page.evaluate(`${DIALOG}.querySelector('input[name=contacted]:checked').value`), 'no', 'nobody is claimed to have been reached unless the Leader says so');
    assert(!(await page.evaluate(`${DIALOG}.innerText.includes('Related case')`)), 'the dialog does not repeat which report it is about');
    await page.choose('What help do you need?', 'Help searching');
    await page.click('Write it down');
    await seen('is written down, but nobody has been contacted');
    const referral = (await leaderApi.get(`/cases/${lostId}`)).body.referrals[0];
    assert.deepEqual([referral.status, referral.reason], ['to_contact', 'Help searching for the animal']);
    assert.equal((await leaderApi.get(`/cases/${lostId}`)).body.contacts.length, 0, 'saving a referral is not a contact');
    assert(await page.evaluate(`document.body.innerText.includes('Needs you · 2')`), 'it is now a second thing that needs the Leader');
  });

  await step('leader: each thing that needed the Leader is dealt with from where it is asked, and the report goes back to being monitored', async () => {
    await page.goto(`/cases/${ref(lostId)}`);
    await seen('Needs you · 2');
    // the possible match: ruled out from the lane
    await page.click('Review match');
    await seen('Do these reports describe the same animal?');
    await page.click('Not the same animal');
    await seen('Ruled out. Nobody was told.');
    assert.equal((await matchFor(weakId)).status, 'rejected');
    await seen('Needs you · 1');
    // the Barangay: the attempt is recorded from the lane
    await page.click('Record contact', { selector: 'button' });
    await seen('Record contact attempt');
    await page.fill('Who you spoke with', 'Duty officer', { within: DIALOG });
    await page.choose('What came of it', 'Tried, no answer');
    await page.fill('What happened', 'Rang the hall at noon; nobody answered.', { within: DIALOG });
    await page.click('Record attempt', { selector: 'button[type=submit]' });
    await seen('Contact attempt recorded');
    const referral = (await leaderApi.get(`/cases/${lostId}`)).body.referrals[0];
    assert.deepEqual([referral.status, referral.contact_person], ['no_response', 'Duty officer']);
    // nothing is left: the status is the resting one again
    await seen('Nothing needs you right now');
    const text = await textOf();
    assert.equal(await page.evaluate(`document.querySelector('.sa-mc__chip').innerText.trim()`), 'Under monitoring', 'back to being monitored');
    assert(!text.includes('Needs you'), 'and nothing is asked');
    assert.equal(await page.evaluate(`[...document.querySelectorAll('.sa-btn--primary')].filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).length`), 0, 'a calm page has no strong button');
    await page.goto('/dashboard');
    await seen('Missing and found animals');
    await unseen('Possible matches to review');
  });

  await step('leader: Contact the owner opens a real private conversation and sending records the activity automatically', async () => {
    await page.goto(`/cases/${ref(lostId)}`);
    await seen('Contact the owner');
    assert(!(await page.has('Log a contact')), 'the owner section offers communication, not a log form');
    await page.click('Contact the owner');
    await seen('Contact the owner');
    await page.fill('Message', 'Is Luna still missing? I can help coordinate.', { within: DIALOG });
    await page.click('Send message', { selector: 'button[type=submit]', within: DIALOG });
    await seen('Is Luna still missing? I can help coordinate.');
    const c = (await leaderApi.get(`/cases/${lostId}`)).body;
    directId = c.threads.find((t) => t.kind === 'direct')?.thread_id;
    assert(directId, 'a real conversation was created');
    assert(c.contacts.some((x) => x.method === 'message' && x.summary.includes('Is Luna still missing?')), 'the actual sent message was logged as contact');
    await fits('the owner conversation');
    await page.click('Close', { exact: true, within: DIALOG });
    await seen('Is Luna still missing? I can help coordinate.');
  });

  await step('resident owner: Home attention opens the Leader message, allows a reply and keeps the bridge separate', async () => {
    await signInResident(ACCOUNTS.resident, PASSWORD);
    await page.waitFor(`!!document.querySelector('a[href="/resident-app/conversations/${directId}"]')`, 'the direct conversation on Home');
    await page.evaluate(`document.querySelector('a[href="/resident-app/conversations/${directId}"]').click()`);
    await seen('Is Luna still missing? I can help coordinate.');
    assert(!(await textOf()).includes('A finder shared a group-only update.'), 'the private report conversation is separate');
    await page.fill('Write a message', 'Yes, please help me find Luna.');
    await page.click('Send message', { selector: 'button[type=submit]' });
    await seen('Yes, please help me find Luna.');
    await fits('the resident direct conversation');
    const view = (await rita.get(`/case-messages/${directId}`)).body;
    assert(view.messages.some((m) => m.body === 'Yes, please help me find Luna.'), 'the resident reply was saved');
    const finder = await owen.get(`/case-messages/${directId}`);
    assert.equal(finder.status, 404, 'the finder cannot access this private Leader/owner conversation');
  });

  await step('resident finder: the linked-report bridge appears in Home attention and opens a 1-to-1 conversation with the owner', async () => {
    await signInResident(ACCOUNTS.owner, PASSWORD);
    await page.waitFor(`!!document.querySelector('a[href="/resident-app/conversations/${bridgeId}"]')`, 'the linked-report bridge on finder Home');
    await page.evaluate(`document.querySelector('a[href="/resident-app/conversations/${bridgeId}"]').click()`);
    await seen('Direct conversation between owner and finder');
    const text = await textOf();
    assert(!text.includes('Is Luna still missing?') && !text.includes('Yes, please help me find Luna.'), 'old private messages are never copied into the bridge');
    await page.fill('Write a message', 'Hi Rita, I found a white dog near Gate 2 and can meet you.');
    await page.click('Send message', { selector: 'button[type=submit]' });
    await seen('Hi Rita, I found a white dog near Gate 2 and can meet you.');
    await fits('the resident communication bridge');
    const view = (await owen.get(`/case-messages/${bridgeId}`)).body;
    assert.deepEqual(view.people.map((p) => p.role).sort(), ['finder', 'owner']);
    assert(!JSON.stringify(view.people).includes('@') && !JSON.stringify(view.people).includes('0917'), 'participant summaries disclose no email or phone');
    assert.equal((await leaderApi.get(`/case-messages/${bridgeId}`)).status, 404, 'the Leader is not in the resident-to-resident bridge');
  });

  await step('leader: contacts the found-animal reporter individually (1-to-1) and it logs to Activity; unlink closes the resident-to-resident bridge while preserving its history', async () => {
    await page.clearSession();
    await signInAdmin(ACCOUNTS.leader, PASSWORD);
    await page.goto(`/cases/${ref(lostId)}`);
    await seen('Contact Owen');
    await page.click('Contact Owen');
    await seen('Contact Owen');
    await page.fill('Message', 'Thank you for reporting the found dog. The owner has been linked.', { within: DIALOG });
    await page.click('Send message', { selector: 'button[type=submit]', within: DIALOG });
    await seen('Thank you for reporting the found dog. The owner has been linked.');
    const foundDetail = (await leaderApi.get(`/cases/${strongId}`)).body;
    assert(foundDetail.contacts.some((x) => x.summary.includes('Thank you for reporting the found dog.')), '1-to-1 contact with reporter logs to the found report Activity');
    await page.click('Close', { exact: true, within: DIALOG });
    await page.click('Unlink', { exact: true });
    await seen('Unlink these reports?');
    await page.click('Unlink reports', { selector: 'button', within: DIALOG });
    await unseen('Unlink these reports?');
    assert.equal((await leaderApi.get(`/cases/${lostId}`)).body.links.length, 0);
    const old = (await owen.get(`/case-messages/${bridgeId}`)).body;
    assert.equal(old.can_reply, false, 'unlinked bridge is read-only');
    assert(old.messages.some((m) => m.body === 'Hi Rita, I found a white dog near Gate 2 and can meet you.'), 'the conversation history was preserved');
    assert.equal((await owen.post(`/case-messages/${bridgeId}/messages`, { body: 'stale reply' })).status, 409, 'stale clients cannot continue a closed bridge');
  });

  await step('leader: manual Link reports opens a new 1-to-1 bridge and it is immediately discoverable by the residents', async () => {
    await page.goto(`/cases/${ref(lostId)}`);
    await seen('Link a report');
    await page.click('Link a report');
    await page.fill('Find a report', ref(strongId), { within: DIALOG });
    await page.click(ref(strongId), { selector: 'label', contains: true, within: DIALOG });
    await page.click('Link selected', { selector: 'button[type=submit]', within: DIALOG });
    await seen('report linked');
    const c = (await leaderApi.get(`/cases/${lostId}`)).body;
    const active = c.threads.find((t) => t.kind === 'bridge' && t.related_report_id === strongId && t.status === 'open');
    assert(active && active.thread_id !== bridgeId, 'a fresh bridge opens; the old one stays closed');
    bridgeId = active.thread_id;
    await signInResident(ACCOUNTS.resident, PASSWORD);
    await page.waitFor(`!!document.querySelector('a[href="/resident-app/conversations/${bridgeId}"]')`, 'the new bridge on owner Home');
    await page.evaluate(`document.querySelector('a[href="/resident-app/conversations/${bridgeId}"]').click()`);
    await seen('Direct conversation between owner and finder');
    assert(!((await textOf()).includes('Hi Rita, I found a white dog near Gate 2 and can meet you.')), 'a relink does not copy old private conversation history');
  });

  console.log(`\n${passed} steps passed.`);
} catch (error) {
  console.log(`\n${passed} steps passed before the failure; first failure: ${failures[0] ?? error.message}`);
  process.exitCode = 1;
} finally {
  await delay(200);
  if (browser) await browser.close().catch(() => undefined);
  if (stack) await stack.stop();
  process.exit(process.exitCode ?? 0);
}
