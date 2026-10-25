import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getPersonnelAvailability, getPersonnelCounts } from '../src/utils/personnelAvailability.ts';

test('the reported roster with one inactive responder has only one available officer', () => {
    const roster = [{ user_id: 4, status: 'Active' }, { user_id: 9, status: 'Inactive' }];
    assert.deepEqual(getPersonnelCounts(roster, () => false), { total: 2, available: 1, onMission: 0, offDuty: 1, onDuty: 1 });
});

test('active officers on missions are on duty but unavailable for dispatch', () => {
    assert.equal(getPersonnelAvailability({ status: 'Active' }, true), 'on_mission');
    assert.deepEqual(getPersonnelCounts([{ status: 'Active' }], () => true), { total: 1, available: 0, onMission: 1, offDuty: 0, onDuty: 1 });
});

test('an old assignment cannot make inactive or suspended accounts available or on duty', () => {
    for (const status of ['Inactive', 'Suspended', null, undefined, '']) {
        assert.equal(getPersonnelAvailability({ status }, false), 'off_duty');
        assert.equal(getPersonnelAvailability({ status }, true), 'off_duty');
    }
});

test('a roster status change updates availability while keeping the total unchanged', () => {
    const officer = { status: 'Active' };
    assert.equal(getPersonnelCounts([officer], () => false).available, 1);
    officer.status = 'Inactive';
    assert.deepEqual(getPersonnelCounts([officer], () => false), { total: 1, available: 0, onMission: 0, offDuty: 1, onDuty: 0 });
});

test('status matching handles case and incidental whitespace', () => {
    assert.equal(getPersonnelAvailability({ status: ' active ' }, false), 'available');
});

test('all filters partition the roster without counting a responder twice', () => {
    const roster = [{ status: 'Active', assigned: false }, { status: 'Active', assigned: true }, { status: 'Inactive', assigned: true }];
    const counts = getPersonnelCounts(roster, person => person.assigned);
    assert.equal(counts.available + counts.onMission + counts.offDuty, counts.total);
    assert.equal(counts.onDuty, counts.available + counts.onMission);
});

test('empty rosters have no available or on-duty personnel', () => {
    assert.deepEqual(getPersonnelCounts([], () => false), { total: 0, available: 0, onMission: 0, offDuty: 0, onDuty: 0 });
});
