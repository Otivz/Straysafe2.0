// The in-app pet tag scanner keeps only StraySafe tag tokens (src/resident/lib/petTag.ts).
import assert from 'node:assert/strict';
import test from 'node:test';
import { tokenFromQr } from '../src/resident/lib/petTag.ts';

const T = 'Cq5Jnp2haBYZjlKdsbBIjA';

test('a tag link gives its token, whatever the address', () => {
  assert.equal(tokenFromQr(`https://heat-entirely-thanksgiving-under.trycloudflare.com/t/${T}`), T);
  assert.equal(tokenFromQr(`http://10.154.247.18:5173/t/${T}`), T);
  assert.equal(tokenFromQr(`  https://example.org/t/${T}/  `), T);
  assert.equal(tokenFromQr(`https://example.org/t/${T}?utm=x#y`), T);
});

test('anything else is not a pet tag', () => {
  for (const raw of [
    '', 'hello', T, `/t/${T}`, `ftp://example.org/t/${T}`, `javascript:alert(1)//t/${T}`,
    `https://example.org/resident-app/t/${T}`, `https://example.org/t/${T}/extra`, 'https://example.org/t/short',
    `https://example.org/t/${T}%2F..`, 'https://example.org/t/' + 'a'.repeat(40), `https://example.org/t/${T.slice(0, 10)}<b>`,
  ]) {
    assert.equal(tokenFromQr(raw), null, raw);
  }
});
