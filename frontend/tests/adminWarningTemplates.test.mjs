// Choosing a warning letter template (src/admin/lib/warningTemplates.ts). Pure logic: the Leader always chooses, only templates that
// fit the letter's level are offered, a universal template fits every level, and "default" is only a Suggested mark.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fitsLevel, templateOptionLabel, templatesForLevel } from '../src/admin/lib/warningTemplates.ts';

const tpl = (template_id, name, warning_level, extra = {}) => ({
  template_id, name, warning_level, status: 'active', is_default: false, current_version_number: 1, ...extra,
});
const universal = tpl(1, 'Standard letter', null, { is_default: true });
const second = tpl(2, 'Second warning & summons', '2nd Warning');
const first = tpl(3, 'First warning', '1st Warning');
const archived = tpl(4, 'Old universal', null, { status: 'archived' });
const all = [second, first, archived, universal];

test('a universal template fits every level; a level template only its own', () => {
  for (const level of ['Notice', '1st Warning', '2nd Warning', 'Final Notice / Escalation']) assert.ok(fitsLevel(universal, level), level);
  assert.ok(fitsLevel(second, '2nd Warning'));
  assert.ok(!fitsLevel(second, '1st Warning'));
  assert.ok(!fitsLevel(first, 'Notice'));
});

test('only active templates that fit the level are offered', () => {
  assert.deepEqual(templatesForLevel(all, '2nd Warning').map((t) => t.template_id), [1, 2]);
  assert.deepEqual(templatesForLevel(all, '1st Warning').map((t) => t.template_id), [1, 3]);
  assert.deepEqual(templatesForLevel(all, 'Notice').map((t) => t.template_id), [1]);
  assert.ok(!templatesForLevel(all, 'Notice').some((t) => t.status === 'archived'));
});

test('the suggested template is listed first, but nothing is chosen for the Leader', () => {
  const offered = templatesForLevel([second, universal], '2nd Warning');
  assert.equal(offered[0].template_id, 1);
  assert.equal(offered.length, 2, 'both fitting templates are offered; picking one is the Leader’s choice');
});

test('each option shows its level, and the default only as "Suggested"', () => {
  assert.equal(templateOptionLabel(universal), 'Standard letter (v1) · All levels · Suggested');
  assert.equal(templateOptionLabel(second), 'Second warning & summons (v1) · 2nd Warning');
});
