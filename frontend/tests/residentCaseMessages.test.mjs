// Case-message links and Home attention, using the actual Resident adapters/selectors/page with synthetic state.
// Vite runs in middleware mode with an empty environment directory: no listener, backend, browser or application database.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';

const frontendDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scratch = await mkdtemp(join(tmpdir(), 'straysafe-resident-messages-'));
let server;
let ad;
let selectors;
let Home;
let context;
before(async () => {
  server = await createServer({
    root: frontendDir, configFile: false, envDir: scratch, cacheDir: join(scratch, 'vite-cache'), mode: 'development',
    logLevel: 'silent', appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, watch: null },
  });
  ad = await server.ssrLoadModule('/src/resident/live/adapters.ts');
  selectors = await server.ssrLoadModule('/src/resident/data/selectors.ts');
  Home = (await server.ssrLoadModule('/src/resident/pages/HomePage.tsx')).default;
  context = (await server.ssrLoadModule('/src/resident/data/context.ts')).ResidentDataContext;
});
after(async () => {
  await server?.close();
  assert.equal(dirname(resolve(scratch)), resolve(tmpdir()));
  assert(basename(scratch).startsWith('straysafe-resident-messages-'));
  await rm(scratch, { recursive: true, force: true });
});

const lookup = { refOf: (id) => `SS-2026-${id}`, claimOfReport: () => undefined };
const apiThread = (over = {}) => ({
  thread_id: 45, kind: 'bridge', status: 'open', can_reply: true, ended_reason: null, report_id: 8, related_report_id: 11,
  my_report_id: 11, title: 'The animal you found may have an owner', subtitle: 'You, the owner and your Subdivision Leader',
  unread: 1, message_count: 0, last_at: '2026-11-12T10:00:00', created_at: '2026-11-12T09:00:00', last_text: 'The reports were linked.',
  people: [{ user_id: 7, role: 'owner', label: 'Pet owner', name: 'Rita', me: false, report_id: 8 },
    { user_id: 9, role: 'finder', label: 'Finder', name: 'Owen', me: true, report_id: 11 },
    { user_id: 2, role: 'leader', label: 'Subdivision Leader', name: 'Subdivision Leader', me: false, report_id: null }], ...over,
});
const thread = (over = {}) => ({ ...ad.conversationFromApi(apiThread()), ...over });
const stateFor = (conversations) => ({
  profile: { id: 9, name: 'Owen Finder' }, subdivisionName: 'Test subdivision', settings: {},
  claims: [1, 2, 3, 4].map((id) => ({ id: String(id), status: 'needs_info' })),
  ownershipRequests: [], reports: [], notices: [], pets: [], notifications: [], draft: null, conversations,
});
function home(state) {
  return renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries: ['/resident-app/home'] },
    React.createElement(context.Provider, { value: { state, local() {}, refreshConversations: async () => {} } }, React.createElement(Home))));
}

test('bridge/message/unlink notifications use thread ids, never an alert or report id', () => {
  for (const type of ['lost_found_bridge', 'case_message', 'lost_found_unlinked']) {
    const n = ad.notificationFromApi({ notification_id: 5, type, related_id: 45, title: 'Conversation updated', message: '', created_at: '2026-11-12T10:00:00', is_read: false }, lookup);
    assert.equal(n.to, '/conversations/45', type);
  }
});

test('a message notification without a thread opens Home rather than an invented report', () => {
  assert.equal(ad.notificationFromApi({ notification_id: 5, type: 'case_message', related_id: null, title: 'Message', created_at: '', is_read: false }, lookup).to, '/home');
});

test('conversation summary keeps only the participant labels and the resident own report reference', () => {
  const c = ad.conversationFromApi(apiThread({ last_at: null, people: [{ user_id: 2, role: 'leader', label: 'Subdivision Leader', name: 'Subdivision Leader', me: false, report_id: null, phone: 'not-a-public-field' }] }));
  assert.equal(c.id, '45');
  assert.equal(c.myReportNumber, 11);
  assert(c.lastAt.endsWith('Z'));
  assert.deepEqual(c.people, [{ id: '2', name: 'Subdivision Leader', label: 'Subdivision Leader', me: false }]);
  assert(!JSON.stringify(c).includes('not-a-public-field'));
  assert.equal(c.relatedReportNumber, undefined, 'the finder never receives a link into the owner private report');
});

test('every active unread conversation is attention; read and ended conversations are not tasks', () => {
  const conversations = [thread({ id: 'read', unread: 0 }), thread({ id: 'closed', status: 'closed', canReply: false }),
    ...[1, 2, 3, 4].map((id) => thread({ id: String(id), lastAt: `2026-11-12T0${id}:00:00Z` }))];
  assert.deepEqual(selectors.conversationAttention({ conversations }).map((c) => c.id), ['4', '3', '2', '1']);
  assert.deepEqual(selectors.conversationAttention({}), []);
});

test('Home shows the bridge ahead of existing attention items, without hiding the fourth conversation', () => {
  const html = home(stateFor([1, 2, 3, 4].map((id) => thread({ id: String(id), title: `Linked conversation ${id}` }))));
  assert(html.includes('Needs your attention'));
  assert(html.indexOf('Linked conversation 1') < html.indexOf('More information requested'));
  for (const id of [1, 2, 3, 4]) assert(html.includes(`/resident-app/conversations/${id}`), `conversation ${id} remains discoverable`);
});

test('after reading, Home drops the task while keeping a way to reopen the conversation', () => {
  const html = home(stateFor([thread({ unread: 0 })]));
  const beforeReports = html.slice(0, html.indexOf('Your reports'));
  assert(!beforeReports.includes('/resident-app/conversations/45'));
  assert(html.includes('Recent conversations'));
  assert(html.includes('/resident-app/conversations/45'));
});
