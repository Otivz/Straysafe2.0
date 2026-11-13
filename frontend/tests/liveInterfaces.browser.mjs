// The connected Admin and Resident interfaces, driven in a real (headless) browser against the REAL backend code on a throwaway
// SQLite database (see _liveHarness.mjs). Run from the frontend folder:   node tests/liveInterfaces.browser.mjs
// It starts and stops its own API (port 8780) and Vite dev server (port 5190): it never uses port 8000 or 5173, never reads
// .env and never touches the configured MySQL database.
//
// What it proves, journey by journey: sign-in failures and wrong-role refusal, the dashboard and case list built from the server's
// own summaries, a case opened in full, the assessment, notes, follow-ups, warning and compliance, a referral, closing and reopening,
// session expiry and a lost connection; and for the resident: sign-in, My reports, filing a report, community notices, an
// ownership claim, a sighting and registering a new account with its emailed code.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ACCOUNTS, PASSWORD, apiLogin, delay, openBrowser, startStack } from './_liveHarness.mjs';

const ADMIN = '';
const RESIDENT = '/resident-app';
let passed = 0;
let skipped = 0;
const failures = [];
let page;
let stack;
let browser;

// For quick iteration on one journey: E2E_ONLY="resident: a report is filed|resident: a lost-pet" runs only the steps whose names
// contain one of the `|`-separated texts. The steps a chosen step depends on (a sign-in, state an earlier step created) must be
// chosen too; the full run, with the variable unset, is the one that counts.
const only = (process.env.E2E_ONLY ?? '').split('|').map((s) => s.trim()).filter(Boolean);

async function step(name, fn) {
  if (only.length > 0 && !only.some((o) => name.includes(o))) { skipped += 1; return; }
  try { await fn(); passed += 1; console.log(`[PASS] ${name}`); }
  catch (error) {
    failures.push(name);
    console.log(`[FAIL] ${name}\n       ${String(error.message).split('\n').filter(Boolean).slice(0, 4).join(' ')}`);
    try { console.log(`       page: ${(await page.path())}\n       text: ${(await page.text()).replace(/\s+/g, ' ').slice(0, 1600)}`); } catch { /* the page is gone */ }
    try {
      // What a person could have clicked or filled at the moment of failure (helps tell a wrong label from a form that never rendered).
      const controls = await page.evaluate(`(() => ({
        labels: [...document.querySelectorAll('label')].filter((l) => { const r = l.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).map((l) => l.innerText.replace(/\\s+/g, ' ').trim().slice(0, 36)),
        checked: [...document.querySelectorAll('input:checked')].map((i) => i.name + '=' + i.value),
        selects: [...document.querySelectorAll('select')].map((s) => s.id + ':' + [...s.options].map((o) => o.text.slice(0, 20)).join('|')),
        dialog: [...document.querySelectorAll('dialog[open],[role=dialog],[role=alertdialog]')].map((d) => d.innerText.replace(/\\s+/g, ' ').trim().slice(-700)).join(' || '),
        alerts: [...document.querySelectorAll('[role=alert]')].map((a) => a.innerText.replace(/\\s+/g, ' ').trim()).join(' | '),
      }))()`);
      console.log(`       checked: ${controls.checked.join(', ')}\n       selects: ${controls.selects.join(' ; ')}\n       labels: ${controls.labels.join(' | ').slice(0, 700)}`);
      if (controls.dialog) console.log(`       open dialog (end of its text): ${controls.dialog}`);
      if (controls.alerts) console.log(`       alerts on screen: ${controls.alerts}`);
    } catch { /* the page is gone */ }
    if (page?.errors.length) console.log(`       browser errors: ${page.errors.slice(-3).join(' | ').slice(0, 500)}`);
    throw error;
  }
}

async function signInAdmin(email, password) {
  await page.goto(`${ADMIN}/login`);
  await page.waitText('Welcome back');
  await page.fill('Email', email);
  await page.fill('Password', password);
  await page.click('Sign in', { selector: 'button[type=submit]' });
}

async function signInResident(email, password) {
  await page.goto(`${RESIDENT}/login`);
  await page.waitText('Welcome back');
  await page.fill('Email', email);
  await page.fill('Password', password);
  await page.click('Sign in', { selector: 'button[type=submit]' });
}

const ref = (id) => `SS-${new Date().getFullYear()}-${String(id).padStart(4, '0')}`;
// The seeded cases (backend/tests/e2e_server.py), in the order they were made: 1 nuisance, 2 safety, 3 injured, 4 lost pet, 5 found animal.
const SAFETY = 2;
const INJURED = 3;
const FOUND = 5;
const LOST = 4;
/** Scopes a helper to the open dialog (the page behind it can have a control of the same name). */
const DIALOG = `document.querySelector('dialog[open]')`;

/** Check the changed screens at both supported widths; optional screenshots contain only this run's synthetic fixtures. */
async function checkResponsive(name, screenshot = false) {
  try {
    for (const [form, width, height] of [['mobile', 390, 844], ['desktop', 1280, 900]]) {
      await page.command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: form === 'mobile' });
      await delay(200);
      const layout = await page.evaluate(`(() => ({
        viewport: innerWidth, document: document.documentElement.scrollWidth,
        overflowing: [...document.querySelectorAll('main *')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right > innerWidth + 1; }).slice(0, 5).map((el) => el.tagName + '.' + el.className),
      }))()`);
      assert(layout.document <= layout.viewport + 1, `${name} ${form} overflows: ${JSON.stringify(layout)}`);
      if (screenshot && form === 'mobile' && process.env.E2E_SCREENSHOT_DIR) {
        await mkdir(process.env.E2E_SCREENSHOT_DIR, { recursive: true });
        const { data } = await page.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        await writeFile(join(process.env.E2E_SCREENSHOT_DIR, `${name}-${form}.png`), Buffer.from(data, 'base64'));
      }
    }
  } finally {
    await page.command('Emulation.clearDeviceMetricsOverride');
  }
}
// Reports and records the lost-pet steps make, which later steps read (the full run creates them in this order)
let mochiReport = null;
let pepperReport = null;
let bruno = null;
// the Lost Pet end-to-end steps
let mochiAlert = null;
let lead = null;
let coordination = null;

try {
  stack = await startStack();
  browser = await openBrowser(stack.webUrl);
  page = browser.page;
  const ids = await (await fetch(`${stack.apiUrl}/__e2e/ids`)).json();
  const leaderApi = await apiLogin(stack.apiUrl, ACCOUNTS.leader, PASSWORD);

  // ================================================================================================================= ADMIN
  await step('admin: a first visit to the sign-in page keeps the original wording, claims no session expired and checks no session', async () => {
    await page.goto(`${ADMIN}/login`);
    await page.waitText('Welcome back');
    await delay(1500);                                                       // long enough for a session check, if one were (wrongly) made
    const text = (await page.text()).replace(/\s+/g, ' ');
    assert(/operations portal/i.test(text) && /subdivision leaders/i.test(text) && text.includes('This login portal is restricted to authorized Subdivision Leaders'), 'the original Subdivision Leader wording');
    assert(!/session expired/i.test(text), 'no false "session expired" for a visitor who had no session');
    assert(!page.requests.some((u) => u.includes('/auth/verify-session')), 'there was nothing to verify, so the server was not asked');
  });

  await step('admin: a wrong password shows the server\'s own sentence and signs nobody in', async () => {
    await signInAdmin(ACCOUNTS.leader, 'not-the-password');
    await page.waitText('Invalid email or password');
    assert.equal(await page.evaluate('sessionStorage.getItem("access_token")'), null);
    assert(!(await page.path()).includes('/dashboard'));
  });

  await step('admin: a resident cannot use the Leader sign-in, and the session the server opened is closed again', async () => {
    await signInAdmin(ACCOUNTS.resident, PASSWORD);
    await page.waitText('This sign-in is for Subdivision Leaders');
    assert.equal(await page.evaluate('sessionStorage.getItem("access_token")'), null);
    assert.equal(await page.evaluate('localStorage.getItem("access_token")'), null);
  });

  await step('admin: the Leader signs in and the dashboard is built from the server\'s own case list', async () => {
    await signInAdmin(ACCOUNTS.leader, PASSWORD);
    await page.waitText('Needs your attention');
    await page.waitText('Selera Homes');
    const counts = await page.evaluate(`[...document.querySelectorAll('.sa-stat')].map((s) => s.innerText.replace(/\\s+/g, ' ').trim())`);
    // Five seeded cases are open. The nuisance and safety reports are new; the lost-pet report is not a report waiting for review (its notice is
    // published by itself); the injured and found cases are under review.
    assert(counts.some((c) => /^2 New reports/.test(c)), `new reports: ${counts}`);
    assert((await page.text()).includes('Missing and found animals'), 'the missing pet and the found animal are listed on their own, never as new reports to review');
    const attention = await page.evaluate(`document.querySelector('#attention')?.innerText || ''`);
    assert(!attention.includes(ref(LOST)), 'and it is not a task for being new');
    assert(counts.some((c) => /^5 Active cases/.test(c)), `active cases: ${counts}`);
    assert.equal(await page.evaluate('!!sessionStorage.getItem("access_token") && !!sessionStorage.getItem("staff_user")'), true);
    // What the Admin read from the server to build it (the case maps use the server's own reporting area, not a sample one)
    for (const path of ['/cases/summaries', '/cases/work-queue', '/reports/coverage-area']) assert(page.requests.some((u) => u.includes(path)), `the Admin asked the server for ${path}`);
  });

  await step('admin: the case list shows every case with its reference and a title made from the report', async () => {
    await page.goto(`${ADMIN}/cases`);
    await page.waitText('Dog causing a nuisance, Gate 2');
    const text = await page.text();
    for (const id of [1, 2, 3, 4, 5]) assert(text.includes(ref(id)), `case ${ref(id)} listed`);
    assert(text.includes('Missing dog, Near the clubhouse'));
    assert(text.includes('Found dog, Clubhouse'));
  });

  await step('admin: a case is read in full when it is opened (description, photo, reporter, history)', async () => {
    await page.click('Dog causing a nuisance, Gate 2', { selector: 'a' });
    await page.waitText('A brown dog barks all night near Gate 2.');
    await page.waitText('Rita Reporter');
    assert(await page.evaluate('!!document.querySelector(".sa-evgrid img")'), 'the stored photo is shown');
    await page.click('History', { selector: '[role=tab]' });
    await page.waitText('Report submitted');
    assert(!(await page.text()).includes('Initial report submitted'), 'the original submission is on the timeline once, not also as the server\'s own line');
  });

  await step('admin: the assessment is saved on the server and moves the case to Under review', async () => {
    await page.click('Assessment', { selector: '[role=tab]' });
    await page.waitText('Incident review');
    await page.click('Verified', { selector: 'label' });
    await page.fill('What the decision is based on', 'The guard heard the dog on three nights.');
    await page.click('Save assessment');
    await page.waitText('Assessment saved');
    const saved = (await leaderApi.get(`/cases/${ids.report}`)).body;
    assert.equal(saved.assessment.incident, 'verified');
    assert.equal(saved.assessment.incident_basis, 'The guard heard the dog on three nights.');
    assert.equal(saved.case_status, 'under_review');
  });

  await step('admin: an internal note is kept apart from the timeline residents can read', async () => {
    await page.click('Actions & follow-ups', { selector: '[role=tab]' });
    await page.click('Add internal note');
    await page.fill('Note', 'Spoke to the guard about the nightly barking.');
    await page.click('Add note', { selector: 'button[type=submit]' });
    await page.waitText('Note added to the case');
    const notes = (await leaderApi.get(`/cases/${ids.report}/notes`)).body.notes;
    assert.equal(notes[0].text, 'Spoke to the guard about the nightly barking.');
    const history = (await leaderApi.get(`/reports/${ids.report}`)).body.history.map((h) => h.remarks).join(' ');
    assert(!history.includes('Spoke to the guard'), 'the note is not on the resident-visible timeline');
  });

  await step('admin: a follow-up is scheduled and appears on the case', async () => {
    await page.click('Record follow-up');
    await page.fill('What needs to happen', 'Check the gate after dark');
    await page.click('Schedule follow-up', { selector: 'button[type=submit]' });
    await page.waitText('Follow-up scheduled');
    await page.waitText('Check the gate after dark');
    const queue = (await leaderApi.get('/cases/work-queue')).body;
    assert(queue.followups.some((f) => f.title === 'Check the gate after dark' && f.report_id === ids.report));
  });

  await step('admin: ownership is confirmed with a resident and evidence, and the server records it', async () => {
    await page.click('Assessment', { selector: '[role=tab]' });
    await page.waitText('Ownership status');
    await page.click('Confirmed', { selector: 'label' });
    await page.choose('Confirmed owner', 'Owen Owner');
    await page.click('Photos of the animal with the person', { selector: 'label' });
    await page.fill('Verification notes', 'The owner showed photos of the dog with his family.');
    await page.click('Save ownership');
    await page.waitText('Ownership review saved');
    const saved = (await leaderApi.get(`/cases/${ids.report}`)).body;
    assert.equal(saved.ownership.status, 'confirmed');
    assert.equal(saved.ownership.owner_name, 'Owen Owner');
    assert(saved.warning_eligibility.ok, `a warning is now possible: ${JSON.stringify(saved.warning_eligibility)}`);
  });

  await step('admin: a warning is issued under the confirmed policy, with the tier chosen by the server', async () => {
    await page.click('Actions & follow-ups', { selector: '[role=tab]' });
    await page.click('Issue warning');
    await page.fill('Warning details', 'The dog was off its leash at night near Gate 2. Please keep it inside your lot after dark.');
    await page.click('The violation is sufficiently established', { selector: 'label' });
    await page.click('Issue warning', { selector: 'button[type=submit]' });
    await page.waitText('Warning recorded under House Rules');
    const saved = (await leaderApi.get(`/cases/${ids.report}`)).body;
    assert.equal(saved.warnings.length, 1);
    assert.equal(saved.warnings[0].warning_level, '1st Warning');
    assert.equal(saved.warnings[0].policy_id, 'pol-1');
    assert.equal(saved.case_status, 'in_progress');
  });

  await step('admin: a compliance observation concludes the observation without closing the case', async () => {
    await page.click('Record compliance');
    await page.click('Compliant', { selector: 'label' });
    await page.fill('Notes', 'The dog was kept inside the lot for three nights.');
    await page.click('End the observation with this outcome', { selector: 'label' });
    await page.click('Record observation', { selector: 'button[type=submit]' });
    await page.waitText('Observation concluded');
    const saved = (await leaderApi.get(`/cases/${ids.report}`)).body;
    assert.equal(saved.warnings[0].concluded, 'compliant');
    assert.notEqual(saved.case_status, 'closed');
    const options = (await leaderApi.get(`/cases/${ids.report}/closure-options`)).body.options;
    assert(options.find((o) => o.disposition === 'owner_compliance').available, 'owner compliance can now be the outcome');
  });

  await step('admin: the case is closed with a documented outcome, and the closure is on the server', async () => {
    await page.click('Close case');
    await page.waitText('Final disposition');
    await page.click('Owner compliance verified', { selector: 'label' });
    await page.fill('Closure reason', 'The owner followed the warning and the concern stopped.');
    await page.click('I reviewed these', { selector: 'label' }).catch(() => undefined);
    await page.click('Review and close', { selector: 'button[type=submit]' });
    await page.click('Confirm and close case');
    await page.waitText('Reopen case');   // only a closed case offers it ("closed" alone would match the confirmation dialog's own sentence)
    const saved = (await leaderApi.get(`/cases/${ids.report}`)).body;
    assert.equal(saved.case_status, 'closed');
    assert.equal(saved.closure.disposition, 'owner_compliance');
    assert.equal(saved.closure.outcome, 'resolved');
  });

  await step('admin: a closed case can be reopened with a reason', async () => {
    await page.click('Reopen case');
    await page.fill('Reason', 'The dog was seen roaming again on Friday evening.');
    await page.click('Reopen case', { selector: 'button[type=submit]' });
    await page.waitText(`${ref(ids.report)} reopened`);   // the confirmation; "Under review" is already in the open dialog's own sentence
    const saved = (await leaderApi.get(`/cases/${ids.report}`)).body;
    assert.equal(saved.case_status, 'under_review');
    assert.equal(saved.reopened_count, 1);
  });

  await step('admin: a safety advisory is written and published to the community', async () => {
    await page.goto(`${ADMIN}/community/new`);
    await page.waitText('Notice');
    await page.click('Safety advisory', { selector: 'label' });
    await page.fill('Title', 'Dogs must be leashed in the park');
    await page.fill('Description', 'Please keep dogs on a leash in the park and common areas, for the safety of everyone.');
    await page.fill('General location', 'Near the clubhouse');
    await page.click('Review and publish', { selector: 'button[type=submit]' });
    await page.click('Publish notice');
    await page.waitText('Notice published');
    const feed = (await (await apiLogin(stack.apiUrl, ACCOUNTS.resident, PASSWORD)).get('/announcements/feed/resident/1')).body;
    assert(feed.some((a) => a.title === 'Dogs must be leashed in the park' && a.status === 'Published'), 'residents can read it');
  });

  // --------------------------------------------------------------------------------------- more Admin actions, on the safety case
  await step('admin: a case\'s priority is changed with a reason, and the server holds it', async () => {
    await page.goto(`${ADMIN}/cases/${ref(SAFETY)}`);
    await page.waitText('A big dog lunged at joggers by the clubhouse.');
    await page.click('More case actions');
    await page.click('Change priority', { selector: '[role=menuitem]' });
    await page.waitText('is currently normal priority');
    await page.click('Urgent', { selector: 'label' });
    await page.fill('Reason', 'A child was nearly bitten here yesterday evening.');
    await page.click('Change priority', { selector: 'button[type=submit]' });
    await page.waitText('Priority set to Urgent');
    assert.equal((await leaderApi.get(`/cases/${SAFETY}`)).body.priority, 'urgent');
  });

  await step('admin: Barangay assistance is created (other organisations are rejected), then updated with what the Barangay said', async () => {
    const nonBarangay = await leaderApi.post(`/cases/${SAFETY}/referrals`, {
      org_type: 'vet_office', org_name: 'City Veterinary Office', reason: 'Testing non-barangay referral rejection.', contact_method: 'phone', contacted: true,
    });
    assert.equal(nonBarangay.status, 422, 'only Barangay assistance is accepted for new referrals');
    await page.click('Actions & follow-ups', { selector: '[role=tab]' });
    await page.click('Ask the Barangay for help');
    await page.waitText('Record who you contacted and why');
    await page.waitText('Assistance partner: Barangay Hall — Peace & Order');
    await page.fill('Reason for referral', 'A large dog showed aggression toward joggers and the owner is unknown; we need Barangay assistance.');
    await page.click('Create referral', { selector: 'button[type=submit]' });
    await page.waitText('Referral to Barangay Hall — Peace & Order recorded');
    let saved = (await leaderApi.get(`/cases/${SAFETY}`)).body;
    assert.equal(saved.referrals.length, 1);
    assert.equal(saved.referrals[0].org_type, 'barangay');
    assert(saved.referrals[0].org_name.startsWith('Barangay '), `saved under the subdivision's Barangay: ${saved.referrals[0].org_name}`);
    await page.click('Record update');
    await page.waitText('What they told you');
    await page.choose('Referral status', 'Acknowledged');
    await page.fill('What they told you', 'They acknowledged the referral and will call back tomorrow morning.');
    await page.click('Record update', { selector: 'button[type=submit]' });
    await page.waitText('Coordination update recorded');
    saved = (await leaderApi.get(`/cases/${SAFETY}`)).body;
    assert.equal(saved.referrals[0].status, 'acknowledged');
    assert(JSON.stringify(saved.referrals[0]).includes('call back tomorrow morning'), 'what the Barangay said is kept with the referral');
  });

  await step('admin: owner coordination is recorded, and a follow-up is scheduled and then marked done', async () => {
    await page.click('Record owner coordination');
    await page.waitText('Who you spoke with');
    await page.fill('Who you spoke with', 'Owen Owner (neighbour)');
    await page.fill('What was discussed', 'He says the dog is not his, but he has seen it near the clubhouse most evenings.');
    await page.click('Record coordination', { selector: 'button[type=submit]' });
    await page.waitText('Owner coordination recorded');
    let saved = (await leaderApi.get(`/cases/${SAFETY}`)).body;
    assert.equal(saved.contacts.length, 1);
    assert(JSON.stringify(saved.contacts[0]).includes('Owen Owner (neighbour)'));
    await page.click('Record follow-up');
    await page.fill('What needs to happen', 'Walk the clubhouse path after 6 pm');
    await page.click('Schedule follow-up', { selector: 'button[type=submit]' });
    await page.waitText('Follow-up scheduled');
    await page.click('Mark done');
    await page.waitText('Mark follow-up as done');
    await page.fill('What happened', 'Walked the path twice; no dog was seen.');
    await page.click('Mark as done', { selector: 'button[type=submit]' });
    await page.waitText('Follow-up marked as done');
    saved = (await leaderApi.get(`/cases/${SAFETY}`)).body;
    const followUp = saved.followups.find((f) => f.title === 'Walk the clubhouse path after 6 pm');
    assert.equal(followUp?.status, 'done', JSON.stringify(saved.followups));
    assert.equal(followUp.completion_note, 'Walked the path twice; no dog was seen.');
  });

  await step('admin: a related report is linked, and unlinked again', async () => {
    await page.click('Overview', { selector: '[role=tab]' });
    await page.click('Link reports');
    await page.waitText('Group reports about the same concern without merging them.');
    await page.fill('Find a report', ref(INJURED));
    await page.click(ref(INJURED), { selector: 'label' });
    await page.click('Link selected', { selector: 'button[type=submit]' });
    await page.waitText('1 report linked');
    assert.equal((await leaderApi.get(`/cases/${SAFETY}`)).body.links.length, 1);
    await page.click('Unlink');
    await page.waitText('Unlink this report?');
    await page.click('Unlink report', { selector: 'button' });
    await page.waitText('Report unlinked');
    assert.equal((await leaderApi.get(`/cases/${SAFETY}`)).body.links.length, 0);
  });

  await step('admin: settings are saved on the server (a policy, the publication rules, the office phone and the notification choices)', async () => {
    const original = (await leaderApi.get('/cases/settings/1')).body;
    try {
      await page.goto(`${ADMIN}/settings?section=policies`);
      await page.waitText('Policy references');
      await page.click('Add policy', { selector: 'button' });
      await page.waitText('Add policy reference');
      await page.fill('Title', 'Barking after quiet hours');
      await page.fill('Where it is written', 'House Rules §4.2');
      await page.fill('Summary', 'Dogs must not bark continuously between 10 pm and 5 am.');
      await page.click('Confirmed', { selector: 'label' });
      await page.click('Add policy', { selector: 'button[type=submit]' });
      await page.waitText('Policy added');
      let s = (await leaderApi.get('/cases/settings/1')).body;
      const policy = s.policies.find((p) => p.title === 'Barking after quiet hours');
      assert(policy && policy.status === 'confirmed' && policy.observation_days === null && policy.applies_to.includes('nuisance'), JSON.stringify(s.policies));

      await page.goto(`${ADMIN}/settings?section=privacy`);
      await page.waitText('Community publication');
      await page.waitText('Published at once, always.');                                      // a missing pet's notice is not a choice any more
      await page.click('Publish as soon as it is ready', { selector: 'label' });             // the only group left: found-animal notices
      await page.click('Save rules');
      await page.waitText('Privacy and access rules saved');
      s = (await leaderApi.get('/cases/settings/1')).body;
      assert.equal(s.publication.found_animal, 'immediate');
      assert.equal(s.publication.lost_pet, original.publication.lost_pet, 'the old stored value is left as it was');
      assert.equal((await leaderApi.get('/cases/categories')).body.publication.lost_pet, 'immediate', 'what residents are told: published at once, whatever an older value says');

      await page.goto(`${ADMIN}/settings?section=profile`);
      await page.waitText('Subdivision profile');
      await page.fill('Office phone', '02 8999 0000');
      await page.click('Save profile');
      await page.waitText('Subdivision profile saved');
      assert.equal((await leaderApi.get('/cases/settings/1')).body.office.phone, '02 8999 0000');

      const before = JSON.stringify((await leaderApi.get('/notifications/preferences')).body);
      await page.goto(`${ADMIN}/settings?section=notifications`);
      await page.waitText('What to be notified about');
      await page.click('Follow-up reminders', { selector: '[role=switch], button[aria-label]' });
      await page.click('Save preferences');
      await page.waitText('Notification preferences saved');
      assert.notEqual(JSON.stringify((await leaderApi.get('/notifications/preferences')).body), before, 'the switch was saved');
    } finally {
      await leaderApi.put('/cases/settings/1', original);                                          // the later steps expect the seeded settings
    }
  });

  await step('admin: the Leader\'s own profile is saved on the server', async () => {
    await page.goto(`${ADMIN}/profile`);
    await page.waitText('Your profile');
    await page.fill('Phone', '09175550123');
    await page.click('Save profile');
    await page.waitText('Profile saved');
    assert.equal((await leaderApi.get(`/users/${ids.leader}`)).body.phone, '09175550123');
  });

  // ---------------------------------------------------------------------------------------------- session expiry / network
  await step('admin: a session the server will not renew sends the person back to sign in', async () => {
    // The shared client reads the token stored inside the staff session before the bare key, so both are spoiled; with the refresh
    // cookie gone as well the server cannot renew anything.
    await page.evaluate(`(() => {
      const raw = sessionStorage.getItem('staff_user');
      if (raw) { const u = JSON.parse(raw); u.access_token = 'not.a.token'; sessionStorage.setItem('staff_user', JSON.stringify(u)); }
      sessionStorage.setItem('access_token', 'not.a.token');
      return true;
    })()`);
    await page.command('Network.clearBrowserCookies');
    await page.goto(`${ADMIN}/cases/${ref(2)}`);
    // Either the dialog ("Your session has expired") when a request meets the 401, or the sign-in page's own notice ("Your session
    // expired") when the session check at start-up meets it first; both end the session and ask for a new sign-in.
    await page.waitFor('/session (has )?expired/i.test(document.body.innerText)', 'the expired-session message', 25000);
    assert(!(await page.text()).includes('lunged at joggers'), 'no case data is shown once the session is gone');
  });

  await step('admin: signing in again after expiry lands back in the app', async () => {
    await signInAdmin(ACCOUNTS.leader, PASSWORD);
    await page.waitText('Needs your attention');
  });

  await step('admin: with no connection the app says so instead of showing empty data, and recovers', async () => {
    await page.goto(`${ADMIN}/dashboard`);
    await page.waitText('Needs your attention');
    await page.offline(true);
    await page.click('Cases', { selector: 'a' });
    await page.waitText('Missing dog, Near the clubhouse');            // the list already loaded stays: nothing is thrown away when the network drops
    await page.click('Missing dog, Near the clubhouse', { selector: 'a' });
    await page.waitText('We couldn’t load this');                       // a case never opened in this session cannot be read: said plainly, never shown empty
    await page.waitText('Check your connection and try again');
    assert(!(await page.text()).includes('slipped out of the gate'), 'nothing is invented in place of the case');
    await page.offline(false);
    await page.click('Try again');
    await page.waitText('slipped out of the gate');                    // the same screen recovers once the connection is back
  });

  // ================================================================================================================ RESIDENT
  await page.goto(`${RESIDENT}/login`);      // a page of the app, so its storage can be cleared (also when E2E_ONLY skipped the Admin steps)
  await page.clearSession();

  await step('resident: a signed-out visit to a signed-in page lands on Welcome, and no sign-in page claims a session expired', async () => {
    await page.goto(`${RESIDENT}/home`);
    await page.waitText('Create an account');
    await delay(1500);
    assert.equal(await page.path(), `${RESIDENT}/welcome`);
    assert(!/session expired/i.test(await page.text()), 'no false "session expired" on Welcome');
    await page.goto(`${RESIDENT}/login`);
    await page.waitText('Welcome back');
    await delay(1000);
    assert(!/session expired/i.test(await page.text()), 'no false "session expired" on the sign-in page');
  });

  await step('resident: a wrong password shows the server\'s own sentence', async () => {
    await signInResident(ACCOUNTS.resident, 'not-the-password');
    await page.waitText('Invalid email or password');
    assert.equal(await page.evaluate('localStorage.getItem("access_token")'), null);
  });

  await step('resident: a Subdivision Leader cannot use the resident sign-in', async () => {
    await signInResident(ACCOUNTS.leader, PASSWORD);
    await page.waitText('This sign-in is for residents');
    assert.equal(await page.evaluate('localStorage.getItem("access_token")'), null);
  });

  await step('resident: signing in shows Home, and My reports lists only her own reports', async () => {
    await signInResident(ACCOUNTS.resident, PASSWORD);
    await page.waitText('Selera Homes');
    await page.goto(`${RESIDENT}/reports`);
    await page.waitText('A brown dog barks all night near Gate 2.');
    const text = await page.text();
    assert(text.includes('Lost pet: my dog') || text.includes('Lost pet:'), 'her lost-pet report');
    assert(!text.includes('A big dog lunged at joggers'), 'another resident\'s private report is never listed');
  });

  await step('resident: a report is opened in full with the subdivision\'s own timeline', async () => {
    await page.click('A brown dog barks all night near Gate 2.', { selector: 'a' });      // a report is listed by its title, with the reference beneath
    await page.waitText('Report received');       // the first entry of the Updates timeline, built from the server's own history
    await page.waitText('Under review');          // the status the Leader's assessment set
    assert(!(await page.text()).includes('Spoke to the guard'), 'staff notes never reach a resident');
  });

  await step('resident: a report filed before the case workflow keeps its older category and is named by the kind it is read as', async () => {
    await page.goto(`${RESIDENT}/reports`);
    await page.waitText('A brown dog barks all night near Gate 2.');
    await page.click('Closed');                                                                   // the older report was closed long ago
    await page.click('A large dog snapped at me near the park path last month.', { selector: 'a' });
    await page.waitText('Possibly dangerous animal · reported');                             // "Aggressive" is read as a safety concern, and named in a resident's words
    const text = await page.text();
    assert(!text.includes('Other animal report · reported'), 'not mislabelled as something it is not');
    assert(text.includes('A final outcome was recorded'), 'and it shows as closed, with the neutral outcome wording');
  });

  await step('resident: Report offers three choices, and "Report an animal" asks what is happening, then opens the existing form', async () => {
    await page.goto(`${RESIDENT}/report`);
    await page.waitText('What would you like to report?');
    await page.waitText('I saw an animal that may need attention.');
    let text = await page.text();
    for (const shown of ['Lost pet', 'My pet is missing.', 'Animal complaint', 'An animal is causing a problem.', 'Report an animal']) assert(text.includes(shown), `${shown} is offered`);
    for (const gone of ['Found / unidentified', 'Animal nuisance', 'Animal safety concern', 'Injured / distressed', 'Other animal concern']) assert(!text.includes(gone), `${gone} is no longer a choice`);
    await page.click('Report an animal');
    await page.waitText('What’s happening with the animal?');
    assert.equal(await page.path(), `${RESIDENT}/report/situation`);
    text = await page.text();
    for (const option of ['It looks lost or has no owner nearby', 'It is hurt or needs help', 'It may be dangerous', 'Something else, or I’m not sure']) assert(text.includes(option), `${option} is offered`);
    await page.click('It may be dangerous');
    await page.waitText('Stay safe.');                                                    // the safety concern's own form, as before
    await page.waitText('Step 1 of 4 · Possibly dangerous animal');
    await page.click('Back');
    await page.waitText('What’s happening with the animal?');                              // Back returns to the question, not past it
    await page.click('It is hurt or needs help');
    await page.waitText('Do not handle the animal.');
    await page.waitText('Can the animal move?');                                          // the injured animal's own extra question
    await page.click('Back');
    await page.waitText('What’s happening with the animal?');
    await page.click('It looks lost or has no owner nearby');
    await page.waitText('About the animal');                                              // the found-animal form: three steps, the photo on the first
    await page.waitText('Step 1 of 3 · Lost or stray animal');
    await page.click('Back');
    await page.waitText('What’s happening with the animal?');
    await page.click('Back');
    await page.waitText('What would you like to report?');
    await page.waitText('You have an unfinished report.');                                  // the draft is kept, as before
  });

  await step('resident: a report is filed at a registered landmark, saved on the server and listed in My reports', async () => {
    await page.goto(`${RESIDENT}/report`);
    await page.waitText('What would you like to report?');
    await page.click('Animal complaint');
    await page.waitText('What happened?');
    await page.click('Dog', { selector: 'label' });
    await page.fill('What happened?', 'A tan dog keeps knocking over the bins by Gate 3 every evening.');
    await page.click('Continue', { selector: 'button[type=submit]' });
    await page.waitText('Where was the animal?');
    await page.click('Selera Homes Main Entrance Gate', { selector: 'button' });     // a registered landmark: the server needs a pinned position
    await page.waitText('Pin placed, inside the reporting area');
    await page.click('Confirm location');
    await page.waitText('Add photos or video');
    await page.click('Continue without photos');
    await page.click('Submit report');
    await page.waitText('Report submitted');
    const mine = (await (await apiLogin(stack.apiUrl, ACCOUNTS.resident, PASSWORD)).get('/reports/?mine=true')).body;
    const filed = mine.find((r) => String(r.description).includes('knocking over the bins'));
    assert(filed, 'the report is on the server, under her own account');
    assert(Number(filed.latitude) > 14 && Number(filed.longitude) > 120, `with the landmark's pinned position: ${filed.latitude}, ${filed.longitude}`);
    await page.goto(`${RESIDENT}/reports`);
    await page.waitText('A tan dog keeps knocking over the bins by Gate 3 every evening.');
  });

  await step('resident: a lost-pet report is about a registered pet, and the report itself publishes its notice: nothing waits for the Leader', async () => {
    await page.goto(`${RESIDENT}/report`);
    await page.waitText('What would you like to report?');
    await page.click('Lost pet');
    await page.waitText('About your pet');
    await page.waitText('After you submit, a notice with your pet’s photo, description and the general area is visible to neighbours');    // the note says it goes out
    await page.waitText('Which pet is missing?');
    await page.waitText('Mochi’s registered profile');                       // her one registered pet is chosen for her, and its profile is read-only
    let text = await page.text();
    assert(text.includes('White and gold') && text.includes('Shih Tzu'), 'the profile is read from the registration');
    assert(!text.includes('Pet’s name') && !text.includes('Describe your pet'), 'nothing about the pet is typed again');
    assert(!text.includes('An administrator reviews this'), 'no review is promised');
    await page.fill('Anything else that may help?', 'Slipped out of the gate this morning. Answers to Mochi and loves the clubhouse lawn.');
    await page.click('Continue', { selector: 'button[type=submit]' });
    await page.waitText('Where was the animal?');
    await page.click('Selera Homes Main Entrance Gate', { selector: 'button' });
    await page.waitText('Pin placed, inside the reporting area');
    await page.click('Confirm location');
    await page.waitText('Review and submit');
    await page.waitText('Visible to neighbours');
    text = await page.text();
    assert(text.includes('Mochi'), 'the review names her pet');
    assert(!text.includes('Reviewed before sharing') && !text.includes('Submit for review'), 'nothing is held back for review');
    await page.click('Publish notice and submit');
    await page.waitText('Please confirm to publish the notice');                                     // consent is still asked for: the notice and photo become visible
    await page.click('I understand this notice and photo will be visible to my neighbours in Community.', { selector: 'label' });
    await page.click('Publish notice and submit');
    await page.waitText('Your notice is live');
    text = await page.text();
    assert(text.includes('Visible to neighbours') && !text.includes('administrator reviews'), 'the confirmation says the notice is visible to neighbours, not waiting for a review');
    const owner = await apiLogin(stack.apiUrl, ACCOUNTS.resident, PASSWORD);
    const pets = (await owner.get('/pets/')).body;
    const mochi = pets.find((p) => p.pet_name === 'Mochi');
    mochiReport = (await owner.get('/reports/?mine=true')).body.find((r) => String(r.description).includes('clubhouse lawn'));
    assert(mochiReport, 'the lost-pet report is on the server');
    assert.equal(mochiReport.pet_id, mochi.pet_id, 'and it names her registered pet');
    // the case, the notice and the pet's missing state were made in one step
    const alerts = (await owner.get('/lost-pet-alerts/mine')).body.results;
    const alert = alerts.find((a) => a.report_id === mochiReport.report_id);
    assert.equal(alert?.status, 'active', 'the notice is live as soon as the report is filed');
    assert.equal(mochi.status, 'Lost', 'the pet is marked missing in the registry');
    const neighbour = await apiLogin(stack.apiUrl, ACCOUNTS.owner, PASSWORD);
    assert((await neighbour.get('/lost-pet-alerts/active')).body.results.some((a) => a.report_id === mochiReport.report_id), 'neighbours see it at once');
    // nothing for the Leader to approve or acknowledge
    assert(!(await leaderApi.get('/lost-pet-alerts/all')).body.results.some((a) => a.status === 'requested'), 'no notice is waiting for review');
    assert(!(await leaderApi.get('/notifications/me')).body.some((n) => n.type === 'lost_pet_alert_request'), 'no request to approve was sent to the Leader');
    // What the Leader's own view of the case holds: the pet as it was when the report was filed, and that only the reporter linked it so far
    const seen = (await leaderApi.get(`/cases/${mochiReport.report_id}`)).body;
    assert.equal(seen.pet?.as_reported?.name, 'Mochi');
    assert(String(seen.pet.last_seen.as_filed.location).includes('Selera Homes Main Entrance Gate'), `where it was last seen is kept: ${seen.pet.last_seen.as_filed.location}`);
    assert.deepEqual([seen.identity.status, seen.identity.decided, seen.pet.linked_by_reporter], ['identified', false, true], 'linked by the reporter, not decided by anyone');
  });

  await step('resident: a pet that is already reported missing is not offered again, and the server refuses a second report for it', async () => {
    await page.goto(`${RESIDENT}/report`);
    await page.waitText('What would you like to report?');
    await page.click('Lost pet');
    await page.waitText('Each of your pets already has an active lost-pet report.');            // Mochi is her only pet so far
    await page.waitText('Already reported missing');
    assert.equal(await page.evaluate(`[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Continue')?.disabled`), true, 'there is nothing to continue with');
    await page.click('View report', { selector: 'a' });
    await page.waitText('Report received');                                                      // it leads to the report itself
    // the server refuses it as well, whatever a screen offers
    const rita = await apiLogin(stack.apiUrl, ACCOUNTS.resident, PASSWORD);
    const mochi = (await rita.get('/pets/')).body.find((p) => p.pet_name === 'Mochi');
    const lostCategory = (await rita.get('/cases/categories')).body.categories.find((c) => c.id === 'lost_pet');
    const again = await rita.post('/reports/', { category_id: lostCategory.category_id, animal_type: 'Dog', description: 'Asking a second time.', latitude: 14.8012, longitude: 121.004, landmark: 'Gate 2', animal_count: 1, pet_id: mochi.pet_id });
    assert.equal(again.status, 409, JSON.stringify(again.body));
    assert.equal(again.body.detail.code, 'LOST_REPORT_EXISTS');
    assert.equal(again.body.detail.report_id, mochiReport.report_id, 'and it points at the report that is already open');
    assert.equal((await rita.get('/reports/?mine=true')).body.filter((r) => r.pet_id === mochi.pet_id).length, 1, 'still one report for the pet');
  });

  await step('resident: when the Leader chooses to publish found-animal notices at once, the screens say so and the notice is live', async () => {
    const path = '/cases/settings/1';
    const original = (await leaderApi.get(path)).body;
    assert.equal(original.publication.found_animal, 'review', 'the seeded subdivision starts on the default');
    const saved = await leaderApi.put(path, { ...original, publication: { ...original.publication, found_animal: 'immediate' } });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    try {
      await page.goto(`${RESIDENT}/report`);                                  // a full page load, so the app reads the setting again
      await page.waitText('What would you like to report?');
      await page.click('Report an animal');
      await page.waitText('What’s happening with the animal?');
      await page.click('It looks lost or has no owner nearby');
      await page.waitText('About the animal');
      await page.waitText('After you submit, a notice with the animal');       // the first-step note now says the notice goes out
      await page.click('Cat', { selector: 'label' });
      await page.fill('Describe the animal and where you found it', 'Gray tabby cat with a torn left ear, found wandering near the playground.');
      await page.click('Continue', { selector: 'button[type=submit]' });
      await page.waitText('Where was the animal?');
      await page.click('Selera Homes Main Entrance Gate', { selector: 'button' });
      await page.waitText('Pin placed, inside the reporting area');
      await page.click('Confirm location');
      await page.waitText('Review and submit');
      await page.waitText('Visible to neighbours');
      await page.click('Publish notice and submit');
      await page.waitText('Please confirm to publish the notice');            // a notice that goes out at once needs her say-so first
      await page.click('I understand this notice and photo will be visible to my neighbours in Community.', { selector: 'label' });
      await page.click('Publish notice and submit');
      await page.waitText('Your notice is live');
      const owner = await apiLogin(stack.apiUrl, ACCOUNTS.resident, PASSWORD);
      const filed = (await owner.get('/reports/?mine=true')).body.find((r) => String(r.description).includes('torn left ear'));
      assert(filed, 'the found-animal report is on the server');
      const neighbour = await apiLogin(stack.apiUrl, ACCOUNTS.owner, PASSWORD);
      const active = (await neighbour.get('/lost-pet-alerts/active')).body.results;
      assert(active.some((a) => a.report_id === filed.report_id && a.alert_type === 'found_animal'), 'neighbours can see the notice');
    } finally {
      await leaderApi.put(path, original);                                     // later steps expect the default setting
    }
  });

  await step('resident: only the kinds of report the Leader accepts are offered, and "Report an animal" goes when all four of its kinds are off', async () => {
    const path = '/cases/settings/1';
    const original = (await leaderApi.get(path)).body;
    const switchOff = async (kinds) => {
      const saved = await leaderApi.put(path, { ...original, categories: { ...original.categories, ...Object.fromEntries(kinds.map((k) => [k, false])) } });
      assert.equal(saved.status, 200, JSON.stringify(saved.body));
      await page.goto(`${RESIDENT}/report`);                       // a full page load, so the app reads the settings again
      await page.waitText('What would you like to report?');
    };
    try {
      await switchOff(['injured']);
      await page.click('Report an animal');
      await page.waitText('What’s happening with the animal?');
      let text = await page.text();
      assert(text.includes('It looks lost or has no owner nearby') && text.includes('It may be dangerous') && text.includes('Something else, or I’m not sure'), 'the other three are offered');
      assert(!text.includes('It is hurt or needs help'), 'the switched-off kind is not offered');

      await switchOff(['found_animal', 'injured', 'safety', 'other']);
      text = await page.text();
      assert(text.includes('Lost pet') && text.includes('Animal complaint'), 'the rest of the screen remains');
      assert(!text.includes('Report an animal'), 'the parent goes when all four of its kinds are off');
      await page.goto(`${RESIDENT}/report/situation`);              // opened directly, the question has nothing to ask: the Report screen takes over
      await page.waitText('What would you like to report?');
      await page.goto(`${RESIDENT}/home`);
      await page.waitText('My pet is lost');
      assert(!(await page.text()).includes('I found an animal'), 'Home no longer offers the shortcut to a kind that is off');

      await switchOff(['lost_pet', 'nuisance']);
      text = await page.text();
      assert(text.includes('Report an animal') && !text.includes('Lost pet') && !text.includes('Animal complaint'), 'the other entries are hidden one by one');
    } finally {
      await leaderApi.put(path, original);                           // later steps expect every kind on
    }
  });

  await step('resident: a kind switched off while a report is being written is explained, nothing is filed, and what was written is kept', async () => {
    const path = '/cases/settings/1';
    const original = (await leaderApi.get(path)).body;
    const text = 'A white dog howls every night behind the clubhouse and keeps the whole street awake.';
    try {
      await page.goto(`${RESIDENT}/report`);
      await page.waitText('What would you like to report?');
      await page.click('Animal complaint');
      await page.waitText('What happened?');
      await page.click('Dog', { selector: 'label' });
      await page.fill('What happened?', text);
      await page.click('Continue', { selector: 'button[type=submit]' });
      await page.waitText('Where was the animal?');
      await page.click('Selera Homes Main Entrance Gate', { selector: 'button' });
      await page.waitText('Pin placed, inside the reporting area');
      await page.click('Confirm location');
      await page.waitText('Add photos or video');
      await page.click('Continue without photos');
      await page.waitText('Review and submit');
      const off = await leaderApi.put(path, { ...original, categories: { ...original.categories, nuisance: false } });   // the Leader switches the kind off while the review is open
      assert.equal(off.status, 200, JSON.stringify(off.body));
      await page.click('Submit report');
      await page.waitText('Your subdivision isn’t accepting this kind of report right now');
      assert((await page.text()).includes('What you wrote is kept'), 'it says her words are kept');
      const owner = await apiLogin(stack.apiUrl, ACCOUNTS.resident, PASSWORD);
      assert(!(await owner.get('/reports/?mine=true')).body.some((r) => String(r.description).includes('keeps the whole street awake')), 'nothing was filed');

      await page.click('Choose another type');
      await page.waitText('Your subdivision isn’t accepting that kind of report right now');
      assert(!(await page.text()).includes('Animal complaint'), 'the switched-off kind is no longer offered');
      await page.click('Report an animal');
      await page.waitText('What’s happening with the animal?');
      await page.click('Something else, or I’m not sure');
      await page.waitText('What happened?');
      const kept = await page.evaluate("document.querySelector('textarea').value");
      assert(String(kept).includes('keeps the whole street awake'), `what she wrote is still there: ${kept}`);
      await page.click('Continue', { selector: 'button[type=submit]' });
      await page.waitText('Where was the animal?');
      await page.waitText('Pin placed, inside the reporting area');           // the spot she chose is still chosen
      await page.click('Confirm location');
      await page.waitText('Add photos or video');
      await page.click('Continue without photos');
      await page.waitText('Review and submit');
      await page.click('Submit report');
      await page.waitText('Report submitted');
      const filed = (await owner.get('/reports/?mine=true')).body.find((r) => String(r.description).includes('keeps the whole street awake'));
      assert(filed, 'it is filed now');
      const other = (await owner.get('/cases/categories')).body.categories.find((c) => c.id === 'other');
      assert.equal(filed.category_id, other.category_id, 'under the kind she chose instead');
    } finally {
      await leaderApi.put(path, original);
    }
  });

  await step('resident: information is added to a report and kept in its case chat', async () => {
    await page.goto(`${RESIDENT}/reports/${ref(1)}/update`);
    await page.waitText('What would you like to add?');
    await page.fill('What would you like to add?', 'The dog was barking again at 2 am last night.');
    await page.click('Send to the subdivision', { selector: 'button[type=submit]' });
    await page.waitText('You added information');                                              // on the report's timeline now
    const rita = await apiLogin(stack.apiUrl, ACCOUNTS.resident, PASSWORD);
    const chat = (await rita.get(`/chat/reports/${ids.report}/messages`)).body;
    assert(chat.some((m) => m.message_text === 'The dog was barking again at 2 am last night.'), JSON.stringify(chat).slice(0, 300));
  });

  await step('resident: a pet is registered and then edited, and the server holds both', async () => {
    await page.goto(`${RESIDENT}/pets/new`);
    await page.waitText('Register a pet');
    await page.fill('Name', 'Bantay');
    await page.click('Dog', { selector: 'label' });
    await page.fill('Breed', 'Aspin');
    await page.fill('Colour or coat', 'Brown with a white chest');
    await page.click('Register pet', { selector: 'button[type=submit]' });
    await page.waitText('Bantay is registered');
    const rita = await apiLogin(stack.apiUrl, ACCOUNTS.resident, PASSWORD);
    let pet = (await rita.get('/pets/')).body.find((p) => p.pet_name === 'Bantay');
    assert(pet && pet.pet_type === 'Dog' && pet.breed === 'Aspin', JSON.stringify(pet));
    await page.goto(`${RESIDENT}/pets/${pet.pet_id}/edit`);
    await page.waitText('Edit pet');
    await page.fill('Colour or coat', 'Brown with a white chest and a torn left ear');
    await page.click('Save changes', { selector: 'button[type=submit]' });
    await page.waitText('Pet updated');
    pet = (await rita.get('/pets/')).body.find((p) => p.pet_name === 'Bantay');
    assert(String(pet.color_markings).includes('torn left ear'), JSON.stringify(pet));
  });

  await step('resident: the profile and the notification choices are saved on the server', async () => {
    const rita = await apiLogin(stack.apiUrl, ACCOUNTS.resident, PASSWORD);
    await page.goto(`${RESIDENT}/profile/edit`);
    await page.waitText('Edit profile');
    await page.waitText('This is the address you sign in with.');                               // no preview wording in the connected app
    assert(!(await page.text()).includes('In the real app'));
    await page.fill('Mobile number', '0917 555 0188');
    await page.fill('Street', 'Molave Street');                                                   // typed: the server has no street list
    await page.click('Save changes', { selector: 'button[type=submit]' });
    await page.waitText('Profile updated');
    const me = (await rita.get(`/users/${ids.resident}`)).body;
    assert.equal(String(me.phone).replace(/\D/g, ''), '09175550188');
    assert(String(me.address).includes('Molave Street'), me.address);

    const before = JSON.stringify((await rita.get('/notifications/preferences')).body);
    await page.goto(`${RESIDENT}/settings`);
    await page.waitText('What you hear about');
    await page.click('Email', { selector: 'button[role=switch]' });
    await page.click('Save changes');
    await page.waitText('Settings saved');
    assert.notEqual(JSON.stringify((await rita.get('/notifications/preferences')).body), before, 'the switch was saved');
  });

  await step('resident: community shows the lost-pet notice, the found-animal notice and the safety advisory, one kind at a time', async () => {
    await page.goto(`${RESIDENT}/community`);
    await page.waitText('Lost dog');                                                     // the lost pets come first
    await page.click('Found animals', { selector: 'button' });
    await page.waitText('Found dog');
    await page.click('Advisories', { selector: 'button' });
    await page.waitText('Rabies vaccination reminder');
  });

  await step('resident: an ownership claim on the found-animal notice is sent and its status is shown', async () => {
    await page.click('Found animals', { selector: 'button' });
    await page.click('Found dog', { selector: 'a', contains: true });
    await page.waitText('This may be my animal');
    await page.click('This may be my animal');
    await page.waitText('Claim this animal');
    await page.fill('How do you know it is yours?', 'That is my dog Bantay. He has a notch in his left ear and answers to his name.');
    await page.click('I understand the subdivision', { selector: 'label' });
    await page.click('Send claim for review');
    await page.waitText('Claim sent for review');
    const owner = await apiLogin(stack.apiUrl, ACCOUNTS.resident, PASSWORD);
    const mine = (await owner.get('/ownership-claims/mine')).body;
    assert.equal(mine.length, 1);
    assert.equal(mine[0].status, 'submitted');
  });

  await step('resident: a neighbour reports a sighting of the lost pet, and the notice counts it', async () => {
    await page.clearSession();
    await signInResident(ACCOUNTS.owner, PASSWORD);
    await page.waitText('Selera Homes');
    await page.goto(`${RESIDENT}/community`);
    // Mochi's card leads with her name (an older notice without a pet name is "Lost dog")
    await page.waitFor(`[...document.querySelectorAll('.rs-card__title')].some((t) => t.innerText.trim() === 'Mochi')`, 'Mochi\'s card');
    await page.evaluate(`[...document.querySelectorAll('a.rs-card')].find((a) => a.querySelector('.rs-card__title')?.innerText.trim() === 'Mochi').click()`);
    await page.waitText('I saw this pet');
    await page.click('I saw this pet');
    await page.waitText('What did you see?');                                             // the sighting form
    await page.click('Choose', { selector: 'button' });                                  // the place picker opens in a sheet
    await page.click('Selera Homes Main Entrance Gate', { selector: 'button' });
    await page.waitText('Pin placed, inside the reporting area');
    await page.click('Use this place');
    await page.fill('What did you see?', 'Sitting under a parked car near the clubhouse, looked calm and well.');
    await page.click('Share this sighting', { selector: 'button[type=submit]' });
    await page.waitText('Sighting shared');
    const alerts = (await (await apiLogin(stack.apiUrl, ACCOUNTS.resident, PASSWORD)).get('/lost-pet-alerts/mine')).body.results;
    assert(alerts.some((a) => a.sighting_count === 1), `the owner's notice counts one sighting: ${JSON.stringify(alerts.map((a) => a.sighting_count))}`);
  });

  await step('resident: a new resident registers, enters the code from the email and lands on Home', async () => {
    await page.clearSession();
    const email = 'nina@e2e-straysafe.com';
    const subdivisions = await (await fetch(`${stack.apiUrl}/auth/subdivisions`)).json();
    await page.goto(`${RESIDENT}/register`);
    await page.waitText('Create your account');
    await page.fill('Full name', 'Nina Newcomer');
    await page.fill('Email', email);
    await page.fill('Mobile number', '0917 555 0142');
    if (subdivisions.length > 1) await page.choose('Subdivision', 'Selera Homes');     // asked only when the server offers a choice
    await page.fill('Block and lot', 'Block 9, Lot 2');
    await page.fill('Street', 'Acacia Street');
    await page.fill('Password', PASSWORD);
    await page.fill('Confirm password', PASSWORD);
    await page.click('I agree to the terms of use', { selector: 'label' });
    await page.click('Create account', { selector: 'button[type=submit]' });
    await page.waitText('Verify your account');
    const { otp } = await (await fetch(`${stack.apiUrl}/__e2e/otp?email=${encodeURIComponent(email)}`)).json();
    assert(otp, 'the server issued a code');
    await page.fill('Verification code', otp);
    await page.click('Verify and continue', { selector: 'button[type=submit]' });
    await page.waitText('Your account is ready');
    await page.click('Continue');
    await page.waitText('Selera Homes');
    const nina = await apiLogin(stack.apiUrl, email, PASSWORD);
    assert(nina.user.access_token && !nina.user.requires_otp, 'the new resident is verified and signs in without another code');
  });

  await step('resident: with no registered pet, Lost pet says so and offers to register one; registering takes her straight back, and she can file at once without any approval', async () => {
    // Nina Newcomer, who registered in the step above, has no pet yet
    await page.goto(`${RESIDENT}/home`);
    await page.waitText('Register your pet first');                                // the Home shortcut says what is missing
    await page.goto(`${RESIDENT}/report`);
    await page.waitText('What would you like to report?');
    const text = await page.text();
    assert(text.includes('Lost pet') && text.includes('Register your pet first to report it missing.'), 'Lost pet is shown, switched off, with the reason');
    await page.click('Register a pet');                                            // the action beside the switched-off choice
    await page.waitText('Then you go straight back to your report');
    await page.fill('Name', 'Pepper');
    await page.click('Cat', { selector: 'label' });
    await page.fill('Colour or coat', 'Black with white paws');
    await page.click('Register pet', { selector: 'button[type=submit]' });
    await page.waitText('Pepper is registered');
    await page.waitText('Pepper’s registered profile');                            // back in the lost-pet report, with the new pet chosen
    await page.fill('Anything else that may help?', 'Pepper slipped out of the back door while the gate was open.');
    await page.click('Continue', { selector: 'button[type=submit]' });
    await page.waitText('Where was the animal?');
    await page.click('Selera Homes Main Entrance Gate', { selector: 'button' });
    await page.waitText('Pin placed, inside the reporting area');
    await page.click('Confirm location');
    await page.waitText('Review and submit');
    await page.click('Publish notice and submit');
    await page.waitText('Please confirm to publish the notice');
    await page.click('I understand this notice and photo will be visible to my neighbours in Community.', { selector: 'label' });
    await page.click('Publish notice and submit');
    await page.waitText('Your notice is live');
    const nina = await apiLogin(stack.apiUrl, 'nina@e2e-straysafe.com', PASSWORD);
    pepperReport = (await nina.get('/reports/?mine=true')).body.find((r) => String(r.description).includes('back door'));
    assert(pepperReport, 'filed at once, with no approval and no ownership check first');
    const seen = (await leaderApi.get(`/cases/${pepperReport.report_id}`)).body;
    assert.equal(seen.case_status, 'reported');
    assert.equal(seen.pet.registry.name, 'Pepper');
    assert.deepEqual([seen.pet.registration.declared_by_owner, seen.pet.registration.verified], [true, false], 'a registration is declared by its owner, never verified by itself');
    assert.equal(seen.ownership.status, 'unknown', 'filing a report confirms nothing about ownership');
  });

  // The Leader now sees the claim from the Admin side
  await step('admin: the claim from the resident shows up on the case for the Leader to review', async () => {
    await page.clearSession();
    await signInAdmin(ACCOUNTS.leader, PASSWORD);
    await page.waitText('Needs your attention');
    await page.goto(`${ADMIN}/cases/${ref(5)}`);
    await page.waitText('Friendly brown dog'.slice(0, 8)).catch(() => undefined);
    await page.waitText('says this is their pet');                       // a claim waiting for an answer is asked about where the Leader looks first
    assert.equal(await page.evaluate(`document.querySelectorAll('[role=tab]').length`), 0, 'a found animal is monitored from the start: no tabs and no Assessment');
    await page.waitText('Rita Reporter');
  });

  await step('admin: the claim is reviewed (more information asked for), the resident answers, and the claim is accepted', async () => {
    await page.click('Review claim');
    await page.waitText('Review ownership claim');
    await page.click('Ask for more information', { selector: 'label' });
    await page.fill('Verification notes', 'Please send a photo of the notch in his left ear and his vaccination card.', { within: DIALOG });     // the ownership form behind it has a field of the same name
    await page.click('Record decision', { selector: 'button[type=submit]' });
    await page.waitText('Claim review recorded');
    const rita = await apiLogin(stack.apiUrl, ACCOUNTS.resident, PASSWORD);
    let claim = (await rita.get('/ownership-claims/mine')).body[0];
    assert.equal(claim.status, 'needs_info');

    await page.clearSession();
    await signInResident(ACCOUNTS.resident, PASSWORD);
    await page.waitText('Selera Homes');
    await page.goto(`${RESIDENT}/claims/${claim.claim_id}`);
    await page.waitText('The subdivision needs a little more');
    await page.fill('Your reply', 'The notch is on his left ear, and his vaccination card says Bantay.');
    await page.click('Send reply');
    await page.waitText('Sent to the subdivision');
    claim = (await rita.get('/ownership-claims/mine')).body[0];
    assert.equal(claim.status, 'under_review');

    await page.clearSession();
    await signInAdmin(ACCOUNTS.leader, PASSWORD);
    await page.waitText('Needs your attention');
    await page.goto(`${ADMIN}/cases/${ref(FOUND)}`);
    await page.waitText('says this is their pet');
    await page.click('Review claim');
    await page.click('Accept the claim', { selector: 'label' });
    await page.fill('Verification notes', 'The marks and the vaccination card match the animal.', { within: DIALOG });
    await page.click('I compared distinguishing marks', { selector: 'label' });
    await page.click('Record decision', { selector: 'button[type=submit]' });
    await page.waitText('Claim review recorded');
    claim = (await rita.get('/ownership-claims/mine')).body[0];
    assert.equal(claim.status, 'accepted');
    // The server's rule: accepting a claim does not confirm ownership; the case stays "under review" until the Leader records that decision.
    assert.equal((await leaderApi.get(`/cases/${FOUND}`)).body.ownership.status, 'under_review');
    await page.click('Who does it belong to?', { selector: 'summary' });
    await page.waitText('Accepting one does not confirm ownership');                  // and the screen no longer promises otherwise
    await page.clearSession();
    await signInResident(ACCOUNTS.resident, PASSWORD);
    await page.waitText('Selera Homes');
    await page.goto(`${RESIDENT}/claims/${claim.claim_id}`);
    await page.waitText('Your claim was approved');                                   // what the claimant sees
  });

  await step('admin: a missing pet\'s page shows the animal, the owner to contact and when and where it was last seen first, with no tabs and no identity step', async () => {
    await page.clearSession();
    await signInAdmin(ACCOUNTS.leader, PASSWORD);
    await page.waitText('Needs your attention');
    await page.goto(`${ADMIN}/cases/${ref(mochiReport.report_id)}`);
    await page.waitText('Rita Reporter');
    let text = await page.text();
    for (const shown of ['Mochi', 'Shih Tzu', 'Rita Reporter', 'rita@e2e-straysafe.com', 'Selera Homes Main Entrance Gate', 'Open the pet record']) assert(text.includes(shown), `${shown} is shown`);
    assert(/last seen/i.test(text) && /owner/i.test(text), 'when it was last seen, and the owner to contact');
    assert(!text.includes('Identity confirmed'), 'a reporter naming her own pet is not a confirmed identity');
    assert.equal(await page.evaluate(`document.querySelectorAll('[role=tab]').length`), 0, 'no tabs, so no Assessment to record an identity decision on');

    // The owner edits the record after filing: the page still tells what the report was filed with, and says what changed
    const rita = await apiLogin(stack.apiUrl, ACCOUNTS.resident, PASSWORD);
    const mochi = (await rita.get('/pets/')).body.find((p) => p.pet_name === 'Mochi');
    const edited = await rita.put(`/pets/${mochi.pet_id}`, { color_markings: 'White and gold, with a pink bow' });
    assert.equal(edited.status, 200, JSON.stringify(edited.body));
    await page.goto(`${ADMIN}/cases/${ref(mochiReport.report_id)}`);
    await page.waitText('the record changed since this report: colour');
    text = await page.text();
    assert(!text.includes('pink bow'), 'it shows what the report was filed with, not the record as it is now');

    // Nobody decided the identity: the reporter's own link is only that
    const after = (await leaderApi.get(`/cases/${mochiReport.report_id}`)).body;
    assert.deepEqual([after.identity.status, after.identity.decided, after.pet.linked_by_reporter], ['identified', false, true], 'nobody decided the identity: the reporter\'s own link is only that');
  });

  await step('admin: an older missing-pet report with no registered pet still has its page, with nothing made up', async () => {
    await page.goto(`${ADMIN}/cases/${ref(LOST)}`);
    await page.waitText('Missing dog');
    const text = await page.text();
    assert(/reported by/i.test(text), 'the person who reported it is the one to talk to');
    assert(!text.includes('Open the pet record') && !/declared by the owner/i.test(text) && !text.includes('Registered owner'), 'nothing is made up for a pet that was never registered');
  });

  await step('admin: the Leader links a pet record the office entered to a resident, and nothing moves until the resident confirms', async () => {
    const office = await leaderApi.post('/pets/', { pet_name: 'Bruno', pet_type: 'Dog', breed: 'Aspin', color_markings: 'Brown with a white chest', emergency_contact_name: 'Mang Tony', emergency_contact_phone: '09170002222' });
    assert.equal(office.status, 200, JSON.stringify(office.body));
    bruno = office.body;
    assert.equal(bruno.owner_id, null, 'an office record has no owner account');
    await page.goto(`${ADMIN}/pets/${bruno.pet_id}`);
    await page.waitText('Entered by the office.');
    await page.waitText('No resident account is linked to this pet record.');
    await page.click('Link to a resident');
    await page.waitText('Ask the resident who owns Bruno to confirm it.');
    await page.fill('Find the resident', 'rita', { within: DIALOG });
    await page.click('Rita Reporter', { selector: 'label' });
    await page.fill('How did you check this is the owner?', 'short', { within: DIALOG });
    await page.click('Send request', { selector: 'button[type=submit]' });
    await page.waitText('Say how you checked that this resident is the owner');                    // refused before anything is sent
    const rita = await apiLogin(stack.apiUrl, ACCOUNTS.resident, PASSWORD);
    assert.equal((await rita.get('/pet-ownership/mine')).body.length, 0, 'no request was sent');
    await page.fill('How did you check this is the owner?', 'The phone number on the record is hers and she knows his tag.', { within: DIALOG });
    await page.click('Send request', { selector: 'button[type=submit]' });
    await page.waitText('Request sent to Rita Reporter');
    assert.equal((await leaderApi.get(`/pets/${bruno.pet_id}`)).body.owner_id, null, 'ownership has not moved: she has to say yes');
    const mine = (await rita.get('/pet-ownership/mine')).body;
    assert(mine.length === 1 && mine[0].pet_name === 'Bruno', JSON.stringify(mine));
  });

  await step('resident: the pet the office linked is added only when she says yes, and the report picker then offers each free pet as a card', async () => {
    await page.clearSession();
    await signInResident(ACCOUNTS.resident, PASSWORD);
    await page.waitText('Is Bruno your pet?');                                                      // Home asks too
    await page.goto(`${RESIDENT}/pets`);
    await page.waitText('Is Bruno your pet?');
    await page.waitText('Lena Leader linked this pet record to your account.');
    const rita = await apiLogin(stack.apiUrl, ACCOUNTS.resident, PASSWORD);
    assert(!(await rita.get('/pets/')).body.some((p) => p.pet_name === 'Bruno'), 'not hers before she says yes');
    await page.click('Yes, it’s mine');
    await page.waitText('Bruno is now in your pets');
    const bruno = (await rita.get('/pets/')).body.find((p) => p.pet_name === 'Bruno');
    assert.equal(bruno?.owner_id, ids.resident, 'hers now');
    // Mochi has an open lost-pet report; Bantay and Bruno are free
    await page.goto(`${RESIDENT}/report`);
    await page.waitText('What would you like to report?');
    await page.click('Lost pet');
    await page.waitText('Which pet is missing?');
    const text = await page.text();
    for (const shown of ['Mochi', 'Already reported missing', 'Bantay', 'Bruno']) assert(text.includes(shown), `${shown} is shown`);
    assert.equal(await page.evaluate(`document.querySelectorAll('input[name="missing-pet"]').length`), 2, 'the two free pets can be chosen');
    await page.click('Continue', { selector: 'button[type=submit]' });
    await page.waitText('Choose which pet is missing.');                                            // with a choice to make, nothing is picked for her
  });

  // =============================================================================================== LOST PET, END TO END
  // Mochi's notice is live (published by her report); a neighbour reported an ordinary sighting earlier. From here: the Community, a possible
  // recovery, how the owner and the neighbour get in touch, the Leader's part, the Barangay, and the two ways a pet is recorded as home.
  await step('resident: the Community overview is short, and its directory is searched and read a page at a time by the server', async () => {
    const rita = await apiLogin(stack.apiUrl, ACCOUNTS.resident, PASSWORD);
    mochiAlert = (await rita.get('/lost-pet-alerts/mine')).body.results.find((a) => a.report_id === mochiReport.report_id);
    assert.equal(mochiAlert?.status, 'active', 'Mochi\'s notice is live');
    await page.clearSession();
    await signInResident(ACCOUNTS.resident, PASSWORD);
    await page.waitText('Selera Homes');
    await page.goto(`${RESIDENT}/community`);
    await page.waitFor(`[...document.querySelectorAll('.rs-card__title')].some((t) => t.innerText.trim() === 'Mochi')`, 'Mochi\'s card, by her name');
    let text = await page.text();
    for (const shown of ['Lost pets', 'Found animals', 'Advisories']) assert(text.includes(shown), `${shown} is a tab of the overview`);
    assert(!text.includes('barks all night'), 'a private complaint is never in Community');
    assert(page.requests.some((u) => u.includes('/lost-pet-alerts/community/summary')), 'the overview asks for a short preview and the totals');
    await checkResponsive('community-overview', true);
    // one search box: it filters the list as you type, and offers the directory (searched by the server) for everything
    await page.fill('Search the Community', 'Pepper');
    await page.waitFor(`(() => { const t = [...document.querySelectorAll('.rs-card__title')].map((e) => e.innerText.trim()); return t.length === 1 && t[0] === 'Pepper'; })()`, 'only Pepper while searching');
    await page.click('Search all', { selector: 'a' });
    await page.waitFor(`/[0-9]+ notices?/.test(document.body.innerText)`, 'the directory to show how many notices it holds');
    assert((await page.path()).includes('/community/lost'), await page.path());
    assert(page.requests.some((u) => u.includes('/lost-pet-alerts/active') && u.includes('q=Pepper') && u.includes('alert_type=lost_pet')), 'the server did the searching');
    const titles = () => page.evaluate(`[...document.querySelectorAll('.rs-card__title')].map((e) => e.innerText.trim())`);
    await page.fill('Search lost pets', '');
    await page.waitFor(`[...document.querySelectorAll('.rs-card__title')].some((t) => t.innerText.trim() === 'Mochi')`, 'Mochi listed again');
    assert((await titles()).includes('Pepper'), 'Pepper\'s notice, published by her report, is listed too');
    await page.click('Cats', { selector: 'button' });
    await page.waitFor(`(() => { const t = [...document.querySelectorAll('.rs-card__title')].map((e) => e.innerText.trim()); return t.includes('Pepper') && !t.includes('Mochi'); })()`, 'the cats only');
    assert(!(await titles()).includes('Mochi'), 'the animal filter keeps the cat and drops the dogs');
    await checkResponsive('community-directory');
    // the list is bounded by the server, not by the screen
    const first = (await rita.get('/lost-pet-alerts/active?alert_type=lost_pet&limit=1')).body;
    assert(first.total >= 3 && first.results.length === 1, JSON.stringify([first.total, first.results.length]));
  });

  await step('resident: an ordinary sighting tells the owner and nothing else: no conversation, nothing for the Leader, and its notification opens the sightings', async () => {
    const rita = await apiLogin(stack.apiUrl, ACCOUNTS.resident, PASSWORD);
    const detail = (await rita.get(`/lost-pet-alerts/${mochiAlert.alert_id}`)).body;
    assert.deepEqual([detail.sightings.length, detail.sightings[0].sighting_type, detail.coordinations.length], [1, 'seen', 0]);
    assert.equal(detail.sightings[0].reported_by, 'A neighbor', 'the owner is not given the neighbour\'s name');
    assert(!JSON.stringify(detail).includes('Owen'), 'nor anything else that names the neighbour');
    assert.equal((await leaderApi.get('/cases/work-queue')).body.coordinations.length, 0, 'nothing for the Leader to do');
    const leaderNotes = (await leaderApi.get('/notifications/me')).body;
    assert(!leaderNotes.some((n) => n.type === 'lost_pet_leader' || n.type === 'lost_pet_secured'), 'the Leader was not asked for anything');
    assert((await rita.get('/notifications/me')).body.some((n) => n.type === 'lost_pet_sighting' && n.related_id === mochiAlert.alert_id), 'the owner was told');
    const history = (await leaderApi.get(`/reports/${mochiReport.report_id}`)).body.history.map((h) => String(h.remarks));
    assert(history.some((t) => /neighbor reported seeing the pet/i.test(t)), `the sighting is on the case activity: ${history}`);
    // the notification opens the sightings of HER notice (an alert's number is never read as a report's)
    await page.goto(`${RESIDENT}/notifications`);
    await page.waitText('Someone saw Mochi');
    await page.click('Someone saw Mochi', { selector: 'button' });
    await page.waitText('The most recent is at the top.');                               // only the sightings screen says this
    assert((await page.path()).endsWith(`/community/alert-${mochiAlert.alert_id}/sightings`), await page.path());
    assert(!(await page.text()).includes('Owen'), 'the sightings never name the neighbour');
  });

  await step('resident: a neighbour says she may have the pet safely; it is a possible recovery and never a recovery, and only the owner and the Leader can see it', async () => {
    await page.clearSession();
    await signInResident(ACCOUNTS.owner, PASSWORD);
    await page.waitText('Selera Homes');
    await page.goto(`${RESIDENT}/community/alert-${mochiAlert.alert_id}`);
    await page.waitText('I may have this pet safely with me');
    await page.click('I may have this pet safely with me');
    await page.waitText('Thank you for helping.');
    await page.click('Choose the place', { selector: 'button' });
    await page.click('Selera Homes Main Entrance Gate', { selector: 'button' });
    await page.waitText('Pin placed, inside the reporting area');
    await page.click('Use this place');
    await page.fill('What can you tell the owner?', 'A white and gold shih tzu came to my gate this morning. I gave it water and it is calm.');
    await page.fill('Where is it now?', 'In my carport with water and a blanket.');
    await page.click('Let us message each other in the app', { selector: 'label' });
    await page.click('Tell the owner', { selector: 'button[type=submit]' });
    await page.waitText('You may have this pet');
    let text = await page.text();
    assert(text.includes('You agreed to message Rita.'), 'she chose to message in the app; nothing is shared until the owner agrees too');
    assert(!text.includes('Rita Reporter') && !text.replace(/[^0-9]/g, '').includes('09175550188'), 'no surname and no phone number');

    const rita = await apiLogin(stack.apiUrl, ACCOUNTS.resident, PASSWORD);
    const detail = (await rita.get(`/lost-pet-alerts/${mochiAlert.alert_id}`)).body;
    lead = detail.sightings.find((s) => s.sighting_type === 'secured');
    assert(lead, 'recorded as a possible recovery');
    assert.equal(lead.reported_by, 'Owen', 'the owner is given the first name only');
    assert(lead.care_note.includes('carport'), 'and where the pet is being kept');
    assert.deepEqual([detail.status, detail.recovered_at], ['active', null], 'a possible recovery never marks the pet recovered');
    assert.notEqual((await rita.get(`/reports/${mochiReport.report_id}`)).body.case_status, 'closed');
    coordination = detail.coordinations[0];
    assert.deepEqual([coordination.you_are, coordination.mode, coordination.owner_consent, coordination.finder_consent], ['owner', 'none', false, true]);
    assert(!JSON.stringify(detail).includes('09179998888') && !JSON.stringify(detail).includes('Blk 7 Lot 3'), 'no phone number and no address');
    assert((await rita.get('/notifications/me')).body.some((n) => n.type === 'lost_pet_secured' && n.related_id === mochiAlert.alert_id), 'the owner was told');
    assert(!(await leaderApi.get('/notifications/me')).body.some((n) => n.type === 'lost_pet_leader'), 'a lead is not a task for the Leader');
    const nina = await apiLogin(stack.apiUrl, 'nina@e2e-straysafe.com', PASSWORD);
    const seenByNina = (await nina.get(`/lost-pet-alerts/${mochiAlert.alert_id}`)).body;
    assert(!seenByNina.sightings.some((s) => s.sighting_type === 'secured') && !JSON.stringify(seenByNina).includes('carport'), 'other neighbours never see a possible recovery or where the pet is kept');
    assert.equal((await rita.post(`/lost-pet-alerts/${mochiAlert.alert_id}/sightings`, {})).status, 422, 'a sighting still needs its pin and time');
  });

  await step('resident: the owner opens the notification, agrees to message, and the two exchange private messages the Leader cannot read', async () => {
    await page.clearSession();
    await signInResident(ACCOUNTS.resident, PASSWORD);
    await page.waitText('Selera Homes');
    await page.goto(`${RESIDENT}/notifications`);
    await page.waitText('Someone may have Mochi safely!');
    await page.click('Someone may have Mochi safely!', { selector: 'button' });
    await page.waitText('Someone may have your pet');
    assert((await page.path()).endsWith(`/community/alert-${mochiAlert.alert_id}`), await page.path());
    let text = await page.text();
    assert(text.includes('Only you and the Subdivision Leader see these.') && text.includes('In my carport with water and a blanket.'), 'the owner sees the report and where it is being kept');
    assert(text.includes('Owen agreed to message you.'), 'and that the neighbour agreed first');
    await page.click('Message Owen', { selector: 'button' });
    await page.waitText('You and Owen can message each other.');
    await checkResponsive('lost-pet-coordination', true);
    await page.fill('Write to Owen', 'Thank you! Is he wearing a pink collar? I can come over in ten minutes.');
    await page.click('Send', { selector: 'button[type=submit]' });
    await page.waitText('Is he wearing a pink collar?');
    const rita = await apiLogin(stack.apiUrl, ACCOUNTS.resident, PASSWORD);
    const owen = await apiLogin(stack.apiUrl, ACCOUNTS.owner, PASSWORD);
    coordination = (await rita.get(`/lost-pet-alerts/${mochiAlert.alert_id}`)).body.coordinations[0];
    assert.equal(coordination.mode, 'direct', 'both agreed');
    const path = `/lost-pet-alerts/coordinations/${coordination.coordination_id}/messages`;
    assert.equal((await rita.get(path)).body.results.length, 1);
    assert.equal((await owen.get(path)).body.results.length, 1, 'the neighbour reads it too');
    assert.equal((await leaderApi.get(path)).status, 404, 'the Leader does not read private messages');
    assert.equal((await (await apiLogin(stack.apiUrl, 'nina@e2e-straysafe.com', PASSWORD)).get(path)).status, 404, 'nobody else does');
    // either of them can ask the Leader to help instead, with no reason: messaging is then over
    await page.click('Ask the Subdivision Leader to help instead', { selector: 'button' });
    await page.waitText('Your Subdivision Leader is helping.');
    text = await page.text();
    assert(text.includes('You asked the Subdivision Leader to help you and Owen get in touch.'), 'she is told her request was made');
    assert(!text.includes('Write to Owen'), 'and the message box is closed');
    const after = (await rita.get(`/lost-pet-alerts/${mochiAlert.alert_id}`)).body.coordinations[0];
    assert.deepEqual([after.mode, after.mediation_requested, after.mediation_requested_by_you], ['leader', true, true]);
    assert.equal((await owen.post(path, { text: 'Hello?' })).status, 409, 'direct messaging stops once the Leader is asked');
    const again = await rita.post(`/lost-pet-alerts/coordinations/${coordination.coordination_id}/mediation`);
    assert.equal(again.status, 200, JSON.stringify(again.body));
    const asked = (await leaderApi.get('/notifications/me')).body.filter((n) => n.type === 'lost_pet_leader' && n.related_id === mochiReport.report_id);
    assert.equal(asked.length, 1, 'asking again reuses the request: the Leader is told once');
    assert.equal((await leaderApi.get('/cases/work-queue')).body.coordinations.length, 1, 'one actionable request');
    assert(!JSON.stringify((await leaderApi.get(`/cases/${mochiReport.report_id}`)).body).includes('pink collar'), 'the Leader still has not read the messages');
  });

  await step('admin: the Leader is asked for help, sees both people to call, records the contact and finishes the request, with no status steps to click', async () => {
    await page.clearSession();
    await signInAdmin(ACCOUNTS.leader, PASSWORD);
    await page.waitText('Needs your attention');
    let text = await page.text();
    assert(text.includes('Rita Reporter and Owen Owner asked you to help them get in touch'), 'the request is on the dashboard');
    assert(text.includes('waiting for your help to get in touch'), 'and in its opening sentence');
    await page.goto(`${ADMIN}/cases/${ref(mochiReport.report_id)}`);
    await page.waitText('asked you to help them get in touch');
    text = await page.text();
    for (const shown of ['Rita Reporter and Owen Owner asked you to help them get in touch', 'Direct messages between them are closed', 'Owen Owner may have Mochi safe with them', 'Mochi', 'Published', 'notified']) assert(text.includes(shown), `${shown} is shown`);
    assert(/Needs you · \d/.test(text), 'the one status says something needs the Leader');
    let digits = text.replace(/[^0-9]/g, '');
    assert(!digits.includes('09179998888'), 'the neighbour\'s number is not on the page until the Leader opens the request');
    await page.click('Help them', { selector: 'button' });
    await page.waitText('Contact them, write down what you did');
    text = await page.text();
    digits = text.replace(/[^0-9]/g, '');
    assert(digits.includes('09175550188') && digits.includes('09179998888'), 'both people\'s phone numbers are shown, now that one of them asked for help');
    assert(!text.includes('Start review') && !text.includes('Mark in progress'), 'there is no review or progress step to click for a missing pet');
    assert(!text.includes('Create notice'), 'the notice was published by the report: nothing to create or approve');
    assert(!text.includes('pink collar'), 'the Leader does not see the private messages');
    await checkResponsive('leader-lost-pet-case', true);
    // the Leader records the contact work with the existing contact log, then finishes the request
    await page.click('Write down what you did', { selector: 'button' });
    await page.waitText('Record a contact');
    await page.fill('Who you spoke with', 'Rita Reporter (owner) and Owen Owner (neighbour)', { within: DIALOG });
    await page.fill('What came of it', 'Called both. Owen keeps the dog in his carport and Rita is on her way to collect it.', { within: DIALOG });
    await page.click('Record contact', { selector: 'button[type=submit]' });
    await page.waitText('Contact recorded');
    assert((await leaderApi.get(`/cases/${mochiReport.report_id}`)).body.contacts.length >= 1, 'the contact is in the case\'s contact log');
    // the Leader decides whether the neighbour's report checks out
    await page.click('Review', { selector: 'button' });                                  // the possible recovery
    await page.waitText('Review this possible recovery');
    await page.click('It looks like the missing pet', { selector: 'label' });
    await page.fill('Note', 'Owen sent a photo and the collar matches.', { within: DIALOG });
    await page.click('Save review', { selector: 'button[type=submit]' });
    await page.waitText('Review saved');
    const reviewed = (await leaderApi.get(`/lost-pet-alerts/${mochiAlert.alert_id}`)).body.sightings.find((s) => s.sighting_type === 'secured');
    assert.deepEqual([reviewed.status, reviewed.reviewed_by], ['verified', 'Lena Leader'], 'who reviewed it and what they decided is kept');
    assert.equal((await leaderApi.get(`/lost-pet-alerts/${mochiAlert.alert_id}`)).body.status, 'active', 'a verified lead still does not recover the pet');
    if (!(await page.has('Mark as finished'))) await page.click('Help them', { selector: 'button' });
    await page.click('Mark as finished', { selector: 'button' });
    await page.waitText('Mark this request as finished');
    await page.fill('What was the result?', 'Both were reached; the owner is collecting the pet.', { within: DIALOG });
    await page.click('Mark as finished', { selector: 'button[type=submit]' });
    await page.waitText('Marked as finished');
    const done = (await leaderApi.get(`/lost-pet-alerts/${mochiAlert.alert_id}`)).body.coordinations[0];
    assert.deepEqual([done.status, done.resolution_note], ['resolved', 'Both were reached; the owner is collecting the pet.']);
    assert.equal((await leaderApi.get('/cases/work-queue')).body.coordinations.length, 0, 'it is no longer waiting for the Leader');
    await page.waitText('Nothing needs you right now');                                   // and the report is back to being monitored
    // the resident who asked sees that it is finished
    const owen = await apiLogin(stack.apiUrl, ACCOUNTS.owner, PASSWORD);
    assert((await owen.get('/notifications/me')).body.some((n) => n.type === 'lost_pet_coordination' && /finished helping/i.test(n.title)), 'both were told');
  });

  await step('admin: asking the Barangay for help is written down without claiming contact; only a recorded attempt counts as contact', async () => {
    await page.click('Ask for help', { selector: 'button' });
    await page.waitText('Choose the help you need');
    await page.click('Not yet', { selector: 'label' });
    await page.click('Write it down', { selector: 'button[type=submit]' });
    await page.waitText('is written down, but nobody has been contacted');
    let referral = (await leaderApi.get(`/cases/${mochiReport.report_id}`)).body.referrals[0];
    assert.equal(referral.status, 'to_contact', 'saving a referral is not proof the Barangay was contacted');
    assert.equal(referral.updates.length, 0, 'no contact is recorded');
    await page.goto(`${ADMIN}/dashboard`);
    await page.waitText('written down but nobody has contacted them yet');                // it is a task until someone makes the call
    await page.goto(`${ADMIN}/cases/${ref(mochiReport.report_id)}`);
    await page.click('Record contact', { selector: 'button' });
    await page.waitText('not contacted yet');
    await page.fill('Who you spoke with', 'Duty officer', { within: DIALOG });
    await page.choose('What came of it', 'Tried, no answer');
    await page.fill('What happened', 'Rang the hall twice at noon; nobody answered.', { within: DIALOG });
    await page.click('Record attempt', { selector: 'button[type=submit]' });
    await page.waitText('Contact attempt recorded');
    referral = (await leaderApi.get(`/cases/${mochiReport.report_id}`)).body.referrals[0];
    assert.deepEqual([referral.status, referral.contact_person], ['no_response', 'Duty officer'], 'the attempt, who and what came of it are recorded');
    assert.equal(referral.updates.length, 1);
  });

  await step('admin: the Leader records that the owner confirmed by phone: one operation resolves the notice, closes the case and restores the pet', async () => {
    assert(!(await page.has('Record the owner’s confirmation')), 'recovery is not offered on a report that is only being monitored');
    await page.click('Resolve this report', { selector: 'summary' });
    await page.click('Record the owner’s confirmation', { selector: 'button' });
    await page.waitText('Only the owner can say the pet is home.');
    await page.click('By phone', { selector: 'label' });
    await page.fill('Notes', 'She called me from the carport: Mochi is with her.', { within: DIALOG });
    await page.click('Rita Reporter told me that Mochi is home.', { selector: 'label' });
    await page.click('Record and close the case', { selector: 'button[type=submit]' });
    await page.waitText('The pet is home');
    const rita = await apiLogin(stack.apiUrl, ACCOUNTS.resident, PASSWORD);
    const owen = await apiLogin(stack.apiUrl, ACCOUNTS.owner, PASSWORD);
    const view = (await leaderApi.get(`/lost-pet-alerts/${mochiAlert.alert_id}`)).body;
    assert.deepEqual([view.status, view.close_outcome, view.recovery.source], ['closed', 'recovered', 'phone']);
    assert.deepEqual([view.recovery.recorded_by, view.recovery.confirmed_by], [ids.leader, ids.resident], 'the Leader recorded what the OWNER confirmed');
    assert.match(view.recovery.note, /Mochi is with her/);
    assert.equal((await leaderApi.get(`/cases/${mochiReport.report_id}`)).body.case_status, 'closed');
    assert.equal((await leaderApi.get(`/cases/${mochiReport.report_id}`)).body.closure.disposition, 'pet_recovered');
    assert.equal((await rita.get('/pets/')).body.find((p) => p.pet_name === 'Mochi').status, 'Active', 'the pet is back to Active in the registry');
    assert(!(await owen.get('/lost-pet-alerts/active')).body.results.some((a) => a.alert_id === mochiAlert.alert_id), 'the notice is gone from Community');
    const helperNotes = (await owen.get('/notifications/me')).body.filter((n) => n.type === 'lost_pet_recovered');
    assert.equal(helperNotes.length, 1, 'the neighbour who helped was thanked once');
    // asking again changes nothing and tells nobody again
    const countHistory = async () => (await leaderApi.get(`/reports/${mochiReport.report_id}`)).body.history.filter((h) => /Missing pet recovered/.test(String(h.remarks))).length;
    assert.equal(await countHistory(), 1);
    const twice = await leaderApi.post(`/lost-pet-alerts/${mochiAlert.alert_id}/record-recovery`, { source: 'in_person', note: 'A second try.' });
    assert.deepEqual([twice.status, twice.body.already], [200, true]);
    assert.equal(await countHistory(), 1, 'the history has one line');
    assert.equal((await owen.get('/notifications/me')).body.filter((n) => n.type === 'lost_pet_recovered').length, 1, 'nobody was told again');
    assert.equal((await leaderApi.get(`/lost-pet-alerts/${mochiAlert.alert_id}`)).body.recovery.source, 'phone', 'the first confirmation stands');
  });

  await step('resident: the owner confirms in the app that her pet is home, after an explicit confirmation: the same operation, recorded as hers', async () => {
    const nina = await apiLogin(stack.apiUrl, 'nina@e2e-straysafe.com', PASSWORD);
    const pepperAlert = (await nina.get('/lost-pet-alerts/mine')).body.results.find((a) => a.report_id === pepperReport.report_id);
    assert.equal(pepperAlert?.status, 'active', 'Pepper\'s notice was published by her report');
    await page.clearSession();
    await signInResident('nina@e2e-straysafe.com', PASSWORD);
    await page.waitText('Selera Homes');
    await page.goto(`${RESIDENT}/reports/${ref(pepperReport.report_id)}/recovered`);
    await page.waitText('come home?');
    await page.click('Came home on their own', { selector: 'label' });
    await page.click('Mark as recovered');
    await page.waitText('as recovered?');                                                            // the explicit confirmation
    assert.equal((await leaderApi.get(`/lost-pet-alerts/${pepperAlert.alert_id}`)).body.status, 'active', 'nothing is recorded until she confirms');
    await page.click('Yes, mark as recovered');
    await page.waitText('The notice was removed from Community and the report is closed');
    const view = (await leaderApi.get(`/lost-pet-alerts/${pepperAlert.alert_id}`)).body;
    assert.deepEqual([view.status, view.close_outcome, view.recovery.source], ['closed', 'recovered', 'owner_app']);
    assert.equal(view.recovery.recorded_by, view.recovery.confirmed_by, 'she confirmed it herself');
    assert.equal((await leaderApi.get(`/cases/${pepperReport.report_id}`)).body.case_status, 'closed');
    assert.equal((await nina.get('/pets/')).body.find((p) => p.pet_name === 'Pepper').status, 'Active');
    assert((await leaderApi.get('/notifications/me')).body.some((n) => n.type === 'lost_pet_leader' && n.related_id === pepperReport.report_id), 'the Leader was told, for information');
  });

  await step('a withdrawn report closes its notice as withdrawn and never as recovered; no sighting, lead or closure can record a recovery; a retried filing returns the first report', async () => {
    const rita = await apiLogin(stack.apiUrl, ACCOUNTS.resident, PASSWORD);
    const kiko = (await rita.post('/pets/', { pet_name: 'Kiko', pet_type: 'Cat', breed: 'Puspin', color_markings: 'Grey tabby', gender: 'Male', confirm_new_pet: true })).body;
    assert(kiko.pet_id, JSON.stringify(kiko));
    const lostCategory = (await rita.get('/cases/categories')).body.categories.find((c) => c.id === 'lost_pet');
    const filing = { category_id: lostCategory.category_id, animal_type: 'Cat', description: 'Kiko slipped out of the back door.', latitude: 14.8012, longitude: 121.004, landmark: 'Gate 2', animal_count: 1,
      pet_id: kiko.pet_id, last_seen_at: new Date(Date.now() - 3_600_000).toISOString().slice(0, 19), client_request_id: 'e2e-retry-kiko' };
    const first = await rita.post('/reports/', filing);
    assert.equal(first.status, 200, JSON.stringify(first.body));
    const retried = await rita.post('/reports/', filing);                                               // the answer was lost on the way, so it is sent again
    assert.equal(retried.body.report_id, first.body.report_id, 'the retry returns the first report');
    assert.equal((await rita.get('/reports/?mine=true')).body.filter((r) => r.pet_id === kiko.pet_id).length, 1, 'one report');
    const mine = (await rita.get('/lost-pet-alerts/mine')).body.results.filter((a) => a.report_id === first.body.report_id);
    assert.deepEqual([mine.length, mine[0].status], [1, 'active'], 'one notice, published once');
    assert.equal((await rita.post('/reports/', { ...filing, client_request_id: 'e2e-someone-else' })).status, 409, 'a different filing for the same pet is refused');
    // withdrawing is the reporter's own act
    const withdrawn = await rita.patch(`/reports/${first.body.report_id}/cancel`);
    assert.equal(withdrawn.status, 200, JSON.stringify(withdrawn.body));
    const kikoAlert = (await leaderApi.get(`/lost-pet-alerts/${mine[0].alert_id}`)).body;
    assert.deepEqual([kikoAlert.status, kikoAlert.close_outcome, kikoAlert.recovered_at], ['closed', 'withdrawn', null], 'withdrawn, not recovered');
    assert.equal((await leaderApi.get(`/cases/${first.body.report_id}`)).body.closure.disposition, 'withdrawn_by_reporter');
    assert.equal((await rita.get('/pets/')).body.find((p) => p.pet_name === 'Kiko').status, 'Active');
    // a Leader cannot close a missing pet as "recovered", or record a confirmation as if the owner had given it in the app
    const generic = await leaderApi.post(`/cases/${LOST}/close`, { disposition: 'pet_recovered', reason: 'The guard says it is home.', end_open_items: true });
    assert.equal(generic.status, 409, JSON.stringify(generic.body));
    assert.match(JSON.stringify(generic.body), /owner/i);
    const seeded = (await leaderApi.get('/lost-pet-alerts/all')).body.results.find((a) => a.report_id === LOST);
    assert.equal((await leaderApi.post(`/lost-pet-alerts/${seeded.alert_id}/record-recovery`, { source: 'owner_app' })).status, 422, 'a Leader can only record a phone or in-person confirmation');
    const owen = await apiLogin(stack.apiUrl, ACCOUNTS.owner, PASSWORD);
    assert.equal((await owen.post(`/lost-pet-alerts/${seeded.alert_id}/recovered`, {})).status, 403, 'and nobody else can confirm for the owner');
  });

  console.log(`\n${passed} steps passed${skipped ? ` (${skipped} skipped by E2E_ONLY: this is not a full run)` : ''}.`);
} catch (error) {
  console.log(`\n${passed} steps passed before the failure; first failure: ${failures[0] ?? error.message}`);
  process.exitCode = 1;
} finally {
  await delay(200);
  if (browser) await browser.close().catch(() => undefined);
  if (stack) await stack.stop();
  process.exit(process.exitCode ?? 0);
}
