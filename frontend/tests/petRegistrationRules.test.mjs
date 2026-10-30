import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCoatPattern, composeCoatMarkings, calculateAge, approximateBirthDateFromAge } from '../src/utils/petAge.ts';
import { petClaimPath } from '../src/utils/petClaimLink.ts';

test('legacy pattern-only descriptions leave Specific Markings empty', () => {
    for (const [raw, pattern] of [['Tricolor coat', 'Tricolor'], ['Bicolor pattern', 'Bicolor'],
        ['Solid coat', 'Solid'], ['Tabby', 'Tabby'], ['Bicolor / Patched', 'Bicolor']]) {
        assert.deepEqual(parseCoatPattern(raw), { pattern, details: '' });
    }
});
test('empty and placeholder descriptions do not become markings', () => {
    for (const raw of [null, '', 'None', 'Unknown', 'N/A', 'No markings', 'Not specified', 'coat pattern']) {
        assert.deepEqual(parseCoatPattern(raw), { pattern: '', details: '' });
    }
});
test('real markings survive parsing and storage round trips', () => {
    for (const [pattern, details] of [['Tabby', 'scar on left ear'], ['Bicolor', 'white chest patch']]) {
        assert.deepEqual(parseCoatPattern(composeCoatMarkings(pattern, details)), { pattern, details });
    }
    assert.deepEqual(parseCoatPattern('Tricolor coat with scar on ear'), { pattern: 'Tricolor', details: 'scar on ear' });
    assert.deepEqual(parseCoatPattern('scar on left ear'), { pattern: 'Other', details: 'scar on left ear' });
});
test('unknown ages stay unknown instead of receiving a birth date', () => {
    assert.equal(approximateBirthDateFromAge('', ''), '');
    assert.equal(calculateAge(null, null), 'Unknown age');
});
test('filed claim links go only to the two staff claims pages', () => {
    assert.equal(petClaimPath(17, '/subd/report/1'), '/subd/pet-claims?claim_id=17');
    assert.equal(petClaimPath(17, '/brgy/report/1'), '/brgy/pet-claims?claim_id=17');
    for (const path of ['/admin/report/1', '/resident/pets', '/']) assert.equal(petClaimPath(17, path), null);
    assert.equal(petClaimPath(null, '/subd/report/1'), null);
});
