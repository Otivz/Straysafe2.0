// How a warning letter's text is laid out on screen (src/components/warningLetterBlocks.ts). It must match the PDF and the DOCX, so it
// runs the SAME cases as the backend (backend/tests/fixtures/warning_letter_blocks.json, also read by backend/tests/test_warning_rendering.py).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { bodyBlocks } from '../src/components/warningLetterBlocks.ts';

const here = dirname(fileURLToPath(import.meta.url));
const { cases } = JSON.parse(readFileSync(resolve(here, '../../backend/tests/fixtures/warning_letter_blocks.json'), 'utf8'));

for (const c of cases) {
  test(c.name, () => {
    const got = bodyBlocks(c.body, '', c.legacy).map((b) => (b.kind === 'section' ? { kind: b.kind, heading: b.heading, text: b.text } : { kind: b.kind, text: b.text }));
    assert.deepEqual(got, c.expected);
  });
}

test('the letter subject is added at the top when the text has no SUBJECT line', () => {
  const got = bodyBlocks('Dear Juan,', 'First Warning: Rule 6.3');
  assert.deepEqual(got[0], { kind: 'subject', text: 'First Warning: Rule 6.3' });
});
