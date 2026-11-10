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
import { ACCOUNTS, PASSWORD, apiLogin, delay, openBrowser, startStack } from './_liveHarness.mjs';

const ADMIN = '/subd-admin';
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
/** Scopes a helper to the open dialog (the page behind it can have a control of the same name). */
const DIALOG = `document.querySelector('dialog[open]')`;

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
    // Five seeded cases are open: the nuisance, safety and lost-pet reports are new; the injured and found cases are under review.
    assert(counts.some((c) => /^3 New reports/.test(c)), `new reports: ${counts}`);
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

  await step('admin: an external referral is created, then updated with what the organisation said', async () => {
    await page.click('Actions & follow-ups', { selector: '[role=tab]' });
    await page.click('Create external referral');
    await page.waitText('Record who you contacted and why');
    await page.choose('Organization', 'City Veterinary Office');
    await page.fill('Reason for referral', 'A large dog showed aggression toward joggers and the owner is unknown; we need veterinary advice.');
    await page.click('Create referral', { selector: 'button[type=submit]' });
    await page.waitText('Referral to City Veterinary Office recorded');
    let saved = (await leaderApi.get(`/cases/${SAFETY}`)).body;
    assert.equal(saved.referrals.length, 1);
    assert.equal(saved.referrals[0].org_name, 'City Veterinary Office');
    await page.click('Record update');
    await page.waitText('What they told you');
    await page.choose('Referral status', 'Acknowledged');
    await page.fill('What they told you', 'They acknowledged the referral and will call back tomorrow morning.');
    await page.click('Record update', { selector: 'button[type=submit]' });
    await page.waitText('Coordination update recorded');
    saved = (await leaderApi.get(`/cases/${SAFETY}`)).body;
    assert.equal(saved.referrals[0].status, 'acknowledged');
    assert(JSON.stringify(saved.referrals[0]).includes('call back tomorrow morning'), 'what the organisation said is kept with the referral');
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
      await page.click('Publish as soon as it is ready', { selector: 'label' });             // the first group: lost-pet notices
      await page.click('Save rules');
      await page.waitText('Privacy and access rules saved');
      s = (await leaderApi.get('/cases/settings/1')).body;
      assert.deepEqual(s.publication, { lost_pet: 'immediate', found_animal: 'review' });

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
    await page.waitText('Animal safety concern · reported');                                 // "Aggressive" is read as a safety concern
    const text = await page.text();
    assert(!text.includes('Other animal concern · reported'), 'not mislabelled as something it is not');
    assert(text.includes('A final outcome was recorded'), 'and it shows as closed, with the neutral outcome wording');
  });

  await step('resident: a report is filed at a registered landmark, saved on the server and listed in My reports', async () => {
    await page.goto(`${RESIDENT}/report`);
    await page.waitText('What would you like to report?');
    await page.click('Animal nuisance');
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

  await step('resident: a lost-pet report waits for the Leader\'s review under the subdivision\'s setting, and every screen says so', async () => {
    // The seeded subdivision keeps the default publication setting (review, for lost-pet and for found-animal notices).
    await page.goto(`${RESIDENT}/report`);
    await page.waitText('What would you like to report?');
    await page.click('Lost pet');
    await page.waitText('About your pet');
    await page.waitText('An administrator reviews this before a notice is shown to neighbours');    // the note on the first step follows the setting
    await page.click('Dog', { selector: 'label' });
    await page.fill('Pet’s name', 'Biscuit');
    await page.fill('Describe your pet', 'Small tan puppy with a blue collar, very friendly and answers to Biscuit.');
    await page.click('Continue', { selector: 'button[type=submit]' });
    await page.waitText('Where was the animal?');
    await page.click('Selera Homes Main Entrance Gate', { selector: 'button' });
    await page.waitText('Pin placed, inside the reporting area');
    await page.click('Confirm location');
    await page.waitText('Review and submit');
    await page.waitText('Reviewed before sharing');
    assert(!(await page.text()).includes('Publish notice and submit'), 'no promise that the notice goes out at once');
    await page.click('Submit for review');
    await page.waitText('Please confirm to send the notice');                                         // consent is still asked for, worded for the review
    await page.click('I understand this notice and photo will be visible to my neighbours in Community once an administrator approves it', { selector: 'label' });
    await page.click('Submit for review');
    await page.waitText('An administrator reviews your notice');
    const text = await page.text();
    assert(text.includes('Report submitted') && !text.includes('Your notice is live'), 'the confirmation does not claim the notice is live');
    const owner = await apiLogin(stack.apiUrl, ACCOUNTS.resident, PASSWORD);
    const filed = (await owner.get('/reports/?mine=true')).body.find((r) => String(r.description).includes('Small tan puppy'));
    assert(filed, 'the lost-pet report is on the server');
    const alerts = (await owner.get('/lost-pet-alerts/mine')).body.results;
    assert.equal(alerts.find((a) => a.report_id === filed.report_id)?.status, 'requested', 'the notice was requested and is waiting for the Leader');
    const neighbour = await apiLogin(stack.apiUrl, ACCOUNTS.owner, PASSWORD);
    const active = (await neighbour.get('/lost-pet-alerts/active')).body.results;
    assert(!active.some((a) => a.report_id === filed.report_id), 'neighbours cannot see it before it is approved');
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
      await page.click('Found / unidentified animal');
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

  await step('resident: community shows the lost-pet notice, the found-animal notice and the safety advisory', async () => {
    await page.goto(`${RESIDENT}/community`);
    await page.waitText('Rabies vaccination reminder');
    const text = await page.text();
    assert(text.includes('Lost dog: ') || text.includes('Lost dog'), 'the lost-pet notice');
    assert(text.includes('Found: dog'), 'the found-animal notice');
  });

  await step('resident: an ownership claim on the found-animal notice is sent and its status is shown', async () => {
    await page.click('Found: dog', { selector: 'a', contains: true });
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
    await page.waitText('Rabies vaccination reminder');
    await page.click('Lost dog', { selector: 'a', contains: true });
    await page.waitText('I saw this pet');
    await page.click('I saw this pet');
    await page.waitText('Report a sighting');
    await page.click('Choose', { selector: 'button' });                                  // the place picker opens in a sheet
    await page.click('Selera Homes Main Entrance Gate', { selector: 'button' });
    await page.waitText('Pin placed, inside the reporting area');
    await page.click('Use this place');
    await page.fill('What did you see?', 'Sitting under a parked car near the carport, looked calm and well.');
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

  // The Leader now sees the claim from the Admin side
  await step('admin: the claim from the resident shows up on the case for the Leader to review', async () => {
    await page.clearSession();
    await signInAdmin(ACCOUNTS.leader, PASSWORD);
    await page.waitText('Needs your attention');
    await page.goto(`${ADMIN}/cases/${ref(5)}`);
    await page.waitText('Friendly brown dog'.slice(0, 8)).catch(() => undefined);
    await page.click('Assessment', { selector: '[role=tab]' });
    await page.waitText('Ownership claims');
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
    await page.goto(`${ADMIN}/cases/${ref(FOUND)}?tab=assessment`);
    await page.waitText('Ownership claims');
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
    await page.waitText('Accepting one does not confirm ownership');                  // and the screen no longer promises otherwise
    await page.clearSession();
    await signInResident(ACCOUNTS.resident, PASSWORD);
    await page.waitText('Selera Homes');
    await page.goto(`${RESIDENT}/claims/${claim.claim_id}`);
    await page.waitText('Your claim was approved');                                   // what the claimant sees
  });

  await step('admin: the lost-pet notice a resident asked for is published and neighbours see it; then the owner marks the pet home', async () => {
    const rita = await apiLogin(stack.apiUrl, ACCOUNTS.resident, PASSWORD);
    const filed = (await rita.get('/reports/?mine=true')).body.find((r) => String(r.description).includes('Small tan puppy'));
    const alert = (await rita.get('/lost-pet-alerts/mine')).body.results.find((a) => a.report_id === filed.report_id);
    assert.equal(alert.status, 'requested');
    await page.clearSession();
    await signInAdmin(ACCOUNTS.leader, PASSWORD);
    await page.waitText('Needs your attention');
    await page.goto(`${ADMIN}/community/alert-${alert.alert_id}/edit`);
    await page.waitText('Review and publish');
    await page.click('Review and publish', { selector: 'button[type=submit]' });
    await page.click('Publish notice');
    await page.waitText('Notice published');
    const owen = await apiLogin(stack.apiUrl, ACCOUNTS.owner, PASSWORD);
    assert((await owen.get('/lost-pet-alerts/active')).body.results.some((a) => a.alert_id === alert.alert_id), 'neighbours can see it now');

    await page.clearSession();
    await signInResident(ACCOUNTS.resident, PASSWORD);
    await page.waitText('Selera Homes');
    await page.goto(`${RESIDENT}/reports/${ref(filed.report_id)}/recovered`);
    await page.waitText('come home?');
    await page.click('A neighbour brought them back', { selector: 'label' });
    await page.click('Mark as recovered');
    await page.click('Yes, mark as recovered');
    await page.waitText('Biscuit is home');
    assert.equal((await rita.get(`/reports/${filed.report_id}`)).body.case_status, 'closed');
    assert(!(await owen.get('/lost-pet-alerts/active')).body.results.some((a) => a.alert_id === alert.alert_id), 'the notice is gone from Community');
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
