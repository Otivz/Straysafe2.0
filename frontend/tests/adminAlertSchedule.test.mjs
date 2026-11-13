// When a notification alert goes out, as the Leader's alert window plans it (src/admin/data/alertSchedule.ts). The server (backend
// services/case_alerts.py) is the authority; these checks keep the window's preview the same plan it follows. Loaded by Vite; no browser, no network.
// Run from the frontend folder (PowerShell):   node --test tests/adminAlertSchedule.test.mjs
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const frontendDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scratch = await mkdtemp(join(tmpdir(), 'straysafe-alert-schedule-'));
after(() => rm(scratch, { recursive: true, force: true }));

let server;
let s;
before(async () => {
  server = await createServer({
    root: frontendDir, configFile: false, mode: 'development', envDir: scratch, cacheDir: join(scratch, '.vite'), logLevel: 'silent', appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, watch: null },
  });
  s = await server.ssrLoadModule('/src/admin/data/alertSchedule.ts');
});
after(async () => { await server?.close(); });

const NOW = new Date(2026, 10, 12, 15, 0, 0);                  // Thu, Nov 12, 2026, 3:00 PM on this machine
const at = (d, h, m) => new Date(2026, 10, d, h, m).getTime();
const words = (text) => text.replace(/ /g, ' ');           // newer ICU puts a narrow space before AM/PM
const draft = (over = {}) => ({ ...s.blankDraft(NOW), ...over });
const repeat = (over = {}) => draft({ mode: 'repeat', ...over });

test('send now and schedule once: exactly one send', () => {
  assert.deepEqual(s.plannedSends(draft(), NOW).map(Number), [NOW.getTime()]);
  assert.deepEqual(s.plannedSends(draft({ mode: 'later', at: '2026-11-13T07:00' }), NOW).map(Number), [at(13, 7, 0)]);
  assert.deepEqual(s.scheduleErrors(draft({ mode: 'later', at: '2026-11-12T14:00' }), NOW), ['Choose a time in the future.']);
});

test('every N minutes, hours or days: the first send at the start, then one every interval, until the end', () => {
  const sends = s.plannedSends(repeat({ every: '30', unit: 'minutes', until: 'resolved', latestEnd: '2026-11-12' }), NOW);
  assert.equal(sends[0].getTime(), NOW.getTime(), 'starting now, the first send goes out at once');
  assert.equal(sends[1].getTime() - sends[0].getTime(), 30 * 60e3);
  assert.equal(sends.at(-1).getTime(), at(12, 23, 30), '"until resolved" also ends at the end of its latest day');
  assert.equal(sends.length, 18);
  const hours = s.plannedSends(repeat({ every: '2', unit: 'hours', start: 'later', startAt: '2026-11-13T06:00', until: 'count', count: '3' }), NOW);
  assert.deepEqual(hours.map(Number), [at(13, 6, 0), at(13, 8, 0), at(13, 10, 0)]);
});

test('set times each day, from a later start, for a number of sends', () => {
  const sends = s.plannedSends(repeat({ repeat: 'times', times: ['18:00', '07:00'], start: 'later', startAt: '2026-11-12T16:00', until: 'count', count: '3' }), NOW);
  assert.deepEqual(sends.map((t) => s.toInputValue(t)), ['2026-11-12T18:00', '2026-11-13T07:00', '2026-11-13T18:00']);
});

test('safeguards, not presets: 5 minutes apart, every repeat ends within 60 days; a heavy schedule is named, never blocked', () => {
  const every = (over) => repeat({ repeat: 'every', unit: 'minutes', ...over });
  assert.deepEqual(s.scheduleErrors(every({ every: '4' }), NOW), ['Sends must be at least 5 minutes apart.']);
  assert.deepEqual(s.scheduleErrors(every({ every: '5' }), NOW), [], 'any interval from 5 minutes is accepted');
  assert.deepEqual(s.scheduleErrors(repeat({ repeat: 'times', times: [] }), NOW), ['Add at least one time of day.']);
  assert.deepEqual(s.scheduleErrors(every({ every: '30', until: 'date', untilAt: '2026-11-12T14:00' }), NOW), ['Choose an end after the start.']);
  assert.deepEqual(s.scheduleErrors(every({ every: '30', until: 'resolved', latestEnd: '2027-02-01' }), NOW), ['An alert can run for at most 60 days at once.']);
  assert.deepEqual(s.scheduleErrors(every({ every: '30', until: 'count', count: '0' }), NOW), ['Choose between 1 and 500 sends.']);
  const busy = s.plannedSends(every({ every: '15', until: 'resolved', latestEnd: '2026-11-20' }), NOW);
  assert.equal(s.firstDayCount(busy), 96);
  assert.ok(s.firstDayCount(busy) > s.HEAVY_PER_DAY, 'more than 12 in a day is named in the window');
  assert.deepEqual(s.scheduleErrors(every({ every: '15', until: 'resolved', latestEnd: '2026-11-20' }), NOW), [], '...but it can still be sent');
});

test('what the window sends to the server', () => {
  assert.deepEqual(s.inputSchedule(draft()), { mode: 'now' });
  assert.deepEqual(s.inputSchedule(draft({ mode: 'later', at: '2026-11-13T07:00' })), { mode: 'later', at: '2026-11-13T07:00' });
  assert.deepEqual(s.inputSchedule(repeat({ every: '2', unit: 'hours', latestEnd: '2026-11-26' })),
    { mode: 'repeat', repeat: 'every', every: 2, unit: 'hours', startAt: null, until: 'resolved', latestEnd: '2026-11-26T23:59' });
  assert.deepEqual(s.inputSchedule(repeat({ repeat: 'times', times: ['07:00', '', '18:00'], start: 'later', startAt: '2026-11-13T06:00', until: 'count', count: '4' })),
    { mode: 'repeat', repeat: 'times', times: ['07:00', '18:00'], startAt: '2026-11-13T06:00', until: 'count', count: 4 });
});

test('an alert being changed opens as it was set; "N sends" counts what is left', () => {
  const alert = {
    id: '5', title: 't', message: 'm', includePhoto: true, destination: 'notice', audience: 'all', status: 'active', stopReason: null,
    schedule: { mode: 'repeat', repeat: 'every', everyMinutes: 120, times: [], startAt: new Date(2026, 10, 12, 9, 0).toISOString(), endKind: 'count', endAt: null, maxSends: 10 },
    nextSendAt: null, upcoming: [], sendsDone: 4, createdAt: '', createdBy: '', sends: [],
  };
  const d = s.draftFrom(alert, NOW);
  assert.deepEqual([d.mode, d.repeat, d.every, d.unit, d.start, d.until, d.count], ['repeat', 'every', '2', 'hours', 'now', 'count', '6']);
  const daily = s.draftFrom({ ...alert, schedule: { ...alert.schedule, repeat: 'times', everyMinutes: null, times: ['07:00', '18:00'], endKind: 'resolved', endAt: new Date(2026, 10, 26, 23, 59).toISOString() } }, NOW);
  assert.deepEqual([daily.repeat, daily.times, daily.until, daily.latestEnd], ['times', ['07:00', '18:00'], 'resolved', '2026-11-26']);
});

test('the words on the case page', () => {
  const sch = (over = {}) => ({ mode: 'repeat', repeat: 'every', everyMinutes: 30, times: [], startAt: NOW.toISOString(), endKind: 'resolved', endAt: new Date(2026, 10, 26, 23, 59).toISOString(), maxSends: null, ...over });
  assert.equal(s.cadence(sch(), NOW), 'Every 30 minutes');
  assert.equal(s.cadence(sch({ everyMinutes: 60 }), NOW), 'Every hour');
  assert.equal(s.cadence(sch({ everyMinutes: 180 }), NOW), 'Every 3 hours');
  assert.equal(s.cadence(sch({ everyMinutes: 1440 }), NOW), 'Every day');
  assert.equal(words(s.cadence(sch({ repeat: 'times', times: ['07:00', '18:00'] }), NOW)), 'Daily at 7:00 AM, 6:00 PM');
  assert.equal(s.cadence(sch({ mode: 'now' }), NOW), 'Once');
  assert.equal(s.ending(sch(), 'Luna is home', NOW), 'until Luna is home (by Nov 26)');
  assert.equal(s.ending(sch({ endKind: 'count', maxSends: 10 }), 'Luna is home', NOW), '10 sends in all');
  assert.equal(s.ending(sch({ mode: 'later' }), 'Luna is home', NOW), '', 'a one-time alert has no end to state');
  assert.equal(words(s.when(new Date(2026, 10, 12, 18, 0), NOW)), '6:00 PM', 'today: the time only');
  assert.equal(words(s.when(new Date(2026, 10, 13, 7, 0), NOW)), 'Fri, Nov 13, 7:00 AM');
});
