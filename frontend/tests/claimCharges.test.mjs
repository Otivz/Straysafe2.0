// Manual cat claiming charge amount (docs/01-system/CLAIM_FEE_ASSESSMENT_RULES.md): pesos only, never negative,
// letters or empty; the server validates again.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assessmentSettled, parsePesoAmount } from '../src/utils/claimCharges.ts';

test('valid peso amounts', () => {
    assert.deepEqual(parsePesoAmount('250'), { value: 250, error: null });
    assert.deepEqual(parsePesoAmount(' 250.50 '), { value: 250.5, error: null });
    assert.deepEqual(parsePesoAmount('0'), { value: 0, error: null });
});

test('refused amounts', () => {
    for (const bad of ['', '   ', '-5', 'abc', '12a', '1e3', '1,000', '₱250', '10.555', '.5', '+5']) {
        const r = parsePesoAmount(bad);
        assert.equal(r.value, null, bad);
        assert.ok(r.error, bad);
    }
    assert.ok(parsePesoAmount('1000000.01').error, 'over the limit');
});

test('handover gate', () => {
    assert.equal(assessmentSettled(null), true);
    assert.equal(assessmentSettled({ status: 'Assessed', total_due: 250 }), false);
    assert.equal(assessmentSettled({ status: 'Assessed', total_due: 0 }), true);
    assert.equal(assessmentSettled({ status: 'Paid', total_due: 250 }), true);
});
