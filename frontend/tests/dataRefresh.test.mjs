import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DATA_CHANGED_EVENT, DATA_CHANGED_STORAGE_KEY, isDataMutation, refreshScope, startAutoRefresh } from '../src/utils/dataRefresh.ts';

const wait = (ms = 20) => new Promise(resolve => setTimeout(resolve, ms));
function setup(refresh, options = {}) {
    const window = new EventTarget();
    const document = new EventTarget();
    let visible = true;
    let account = '1';
    const dispose = startAutoRefresh(refresh, { window, document, isVisible: () => visible, scope: () => account, intervalMs: 10000, debounceMs: 2, ...options });
    const change = (scope = '1') => window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT, { detail: { scope } }));
    return { window, document, dispose, change, hide: () => { visible = false; }, show: () => { visible = true; document.dispatchEvent(new Event('visibilitychange')); }, signOut: () => { account = null; } };
}

test('only changes to business records trigger refresh, including absolute and proxy URLs', () => {
    for (const url of ['/pets/1', '/reports/128/status', '/api/holding/1', 'http://localhost:8000/adoptions/1', '/claims/1', '/adoption-tasks/2/accept', '/pet-ownership/1/accept', '/report-returns/1']) assert.equal(isDataMutation('patch', url), true);
    for (const url of ['/auth/refresh', '/notifications/mark-all-read/1', '/chat/report/1/read', '/push/test']) assert.equal(isDataMutation('post', url), false);
    assert.equal(isDataMutation('get', '/reports/'), false);
    assert.equal(isDataMutation('options', '/pets/'), false);
    assert.equal(isDataMutation(undefined, undefined), false);
});

test('signals use the account id rather than the token', () => {
    const token = 'header.' + btoa(JSON.stringify({ sub: '21' })) + '.signature';
    assert.equal(refreshScope(token), '21');
    assert.equal(refreshScope(null), null);
    assert.equal(refreshScope('bad-token'), null);
});

test('save and focus bursts are coalesced without reloading the page', async () => {
    let calls = 0;
    const env = setup(() => { calls++; });
    try {
        env.change(); env.change(); env.window.dispatchEvent(new Event('focus'));
        await wait(); assert.equal(calls, 1);
    } finally { env.dispose(); }
});

test('hidden tabs wait and refresh immediately after becoming visible', async () => {
    let calls = 0;
    const env = setup(() => { calls++; });
    try {
        env.hide(); env.change(); await wait(); assert.equal(calls, 0);
        env.show(); await wait(); assert.equal(calls, 1);
    } finally { env.dispose(); }
});

test('a save during an in-flight read queues one follow-up instead of concurrent reads', async () => {
    let calls = 0;
    let finish;
    const env = setup(() => { calls++; return calls === 1 ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(); });
    try {
        env.change(); await wait(); assert.equal(calls, 1);
        env.change(); env.change(); await wait(); assert.equal(calls, 1);
        finish(); await wait(); assert.equal(calls, 2);
    } finally { env.dispose(); }
});

test('signals from another account and signed-out views cannot fetch', async () => {
    let calls = 0;
    const env = setup(() => { calls++; });
    try {
        env.change('2'); await wait(); assert.equal(calls, 0);
        env.signOut(); env.window.dispatchEvent(new Event('focus')); await wait(); assert.equal(calls, 0);
    } finally { env.dispose(); }
});

test('a change in another tab triggers a fresh authenticated read', async () => {
    let calls = 0;
    const env = setup(() => { calls++; });
    const stored = data => {
        const event = new Event('storage');
        Object.assign(event, { key: DATA_CHANGED_STORAGE_KEY, newValue: data });
        env.window.dispatchEvent(event);
    };
    try {
        stored('bad JSON'); stored(JSON.stringify({ scope: '2' })); await wait(); assert.equal(calls, 0);
        stored(JSON.stringify({ scope: '1' })); await wait(); assert.equal(calls, 1);
    } finally { env.dispose(); }
});

test('network restoration and interval updates refresh data changed elsewhere', async () => {
    let calls = 0;
    const env = setup(() => { calls++; }, { intervalMs: 30 });
    try {
        env.window.dispatchEvent(new Event('online')); await wait(); assert.equal(calls, 1);
        await wait(30); assert.ok(calls >= 2);
    } finally { env.dispose(); }
});

test('cleanup stops queued work, timers and listeners', async () => {
    let calls = 0;
    const env = setup(() => { calls++; }, { intervalMs: 10 });
    env.change(); env.dispose(); env.window.dispatchEvent(new Event('focus'));
    await wait(35); assert.equal(calls, 0);
});

test('a failed refresh can be retried on the next signal', async () => {
    let calls = 0;
    const errors = [];
    const env = setup(() => { calls++; if (calls === 1) throw new Error('Offline'); }, { onError: error => errors.push(error.message) });
    try {
        env.change(); await wait(); assert.deepEqual(errors, ['Offline']);
        env.change(); await wait(); assert.equal(calls, 2);
    } finally { env.dispose(); }
});
