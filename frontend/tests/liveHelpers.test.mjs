// The small pure helpers both live interfaces share: server dates, case references, error sentences (src/live/*).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fromServer, fromServerOrNull, toServer, toServerDate } from '../src/live/dates.ts';
import { caseRef, reportIdOf } from '../src/live/refs.ts';
import { detailOf } from '../src/live/detail.ts';

test('a naive server time becomes a UTC instant the screens can format, and an offset one is exact', () => {
  assert.equal(fromServer('2026-11-09T14:03:22+00:00'), '2026-11-09T14:03:22.000Z');
  assert.equal(fromServer('2026-11-09T14:03:22Z'), '2026-11-09T14:03:22.000Z');
  // no offset: read as this device's local wall clock, which is how the backend writes it
  const local = new Date(2026, 10, 9, 14, 3, 22);
  assert.equal(fromServer('2026-11-09T14:03:22'), local.toISOString());
  assert.equal(fromServer('2026-11-09 14:03:22'), local.toISOString());
});

test('empty and unreadable server times become empty, never "Invalid Date"', () => {
  assert.equal(fromServer(null), '');
  assert.equal(fromServer(undefined), '');
  assert.equal(fromServer(''), '');
  assert.equal(fromServer('not a date'), '');
  assert.equal(fromServerOrNull(''), null);
  assert.equal(fromServerOrNull('2026-11-09T14:03:22Z'), '2026-11-09T14:03:22.000Z');
});

test('a date without a time stays a date', () => {
  assert.equal(fromServer('2026-11-09'), '2026-11-09');
  assert.equal(toServerDate('2026-11-09'), '2026-11-09');
  assert.equal(toServer('2026-11-09'), '2026-11-09T00:00:00');
});

test('a time from a screen is written back as local wall-clock text, and round-trips', () => {
  const local = new Date(2026, 10, 9, 22, 5, 9);
  assert.equal(toServer(local), '2026-11-09T22:05:09');
  assert.equal(toServer(local.toISOString()), '2026-11-09T22:05:09');
  assert.equal(fromServer(toServer(local)), local.toISOString());
  assert.equal(toServer(''), null);
  assert.equal(toServer(null), null);
  assert.equal(toServer('garbage'), null);
});

test('a case reference is the year and the zero-padded report id, and reads back', () => {
  assert.equal(caseRef(158, '2026-03-02T01:00:00.000Z'), 'SS-2026-0158');
  assert.equal(caseRef(7, '2025-12-31T23:00:00.000Z'), 'SS-2025-0007');
  assert.equal(caseRef(12345, '2026-01-01T00:00:00Z'), 'SS-2026-12345');
  assert.match(caseRef(5, null), /^SS-\d{4}-0005$/);
  assert.equal(reportIdOf('SS-2026-0158'), 158);
  assert.equal(reportIdOf('SS-2026-12345'), 12345);
  assert.equal(reportIdOf('158'), 158);
  assert.equal(reportIdOf('SS-2026-0000'), null);
  assert.equal(reportIdOf('nonsense'), null);
  assert.equal(reportIdOf(''), null);
  assert.equal(reportIdOf(undefined), null);
});

test('the sentence for an API error is the server\'s own, whatever shape FastAPI gave it', () => {
  assert.equal(detailOf({ detail: 'This case is already closed.' }), 'This case is already closed.');
  assert.equal(detailOf({ detail: '  spaced  ' }), 'spaced');
  assert.equal(detailOf({ detail: [{ msg: 'Field required' }, { msg: 'Too short' }] }), 'Field required Too short');
  assert.equal(detailOf({ detail: { message: 'Locked.' } }), 'Locked.');
  assert.equal(detailOf({ detail: '' }), null);
  assert.equal(detailOf({}), null);
  assert.equal(detailOf(null), null);
  assert.equal(detailOf('text'), null);
});
