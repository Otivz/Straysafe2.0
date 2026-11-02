// Manual Matching display rules (docs/01-system/MANUAL_REPORT_MATCHING.md): actual values only, "Not Provided" for
// missing ones, never AI-detected values, and the record's saved method decides manual vs AI.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NOT_PROVIDED, isManualMatchRecord, petFields, reportFields, shown } from '../src/utils/manualMatchFields.ts';

const get = (fields, label) => fields.find((f) => f.label === label)?.value;

test('report fields come from what the reporter submitted', () => {
    const f = reportFields({
        report_id: 42, animal_type: 'Dog', animal_breed: 'Aspin', animal_color: 'Brown', estimated_size: 'Medium',
        description: 'Custody: Roaming | Pattern: Brindle | Markings: White left paw | Observed Conditions: Limping | Notes: Seen near the chapel at dawn',
        condition: 'Thin', landmark: 'Gate 3', initial_landmark: 'Chapel', created_at: '2026-10-30T08:15:00Z', animal_count: 1,
        // AI-detected values must never appear
        ai_possible_breed: 'Labrador', ai_dominant_color: 'Black',
    });
    assert.equal(get(f, 'Report ID'), '#42');
    assert.equal(get(f, 'Breed'), 'Aspin');
    assert.equal(get(f, 'Distinguishing marks'), 'White left paw · Pattern: Brindle');
    assert.equal(get(f, 'Original sighting location'), 'Chapel');
    assert.equal(get(f, 'Report description'), 'Seen near the chapel at dawn');
    assert.equal(get(f, 'Observed condition'), 'Thin · Limping');
    assert.equal(get(f, 'Custody (as reported)'), 'Roaming');
    assert.ok(get(f, 'Date and time reported') !== NOT_PROVIDED);
    assert.ok(!f.some((x) => /Labrador|Black/.test(x.value)), 'no AI-detected values');
});

test('missing report values show Not Provided, nothing is invented', () => {
    const f = reportFields({ report_id: 7, animal_type: 'unknown', animal_breed: null, animal_color: '', description: null });
    for (const label of ['Animal type', 'Breed', 'Color', 'Size', 'Distinguishing marks', 'Original sighting location',
        'Date and time reported', 'Report description', 'Observed condition']) {
        assert.equal(get(f, label), NOT_PROVIDED, label);
    }
    assert.equal(reportFields({ report_id: 8, description: 'Free text from the reporter' }).find((x) => x.label === 'Report description').value,
        'Free text from the reporter', 'unstructured text is kept as the description');
});

test('pet fields come from the registration record', () => {
    const f = petFields({ pet_id: 11, reference_code: 'ABC123', pet_name: 'Bantay', pet_type: 'Dog', breed: 'Aspin',
        color_markings: 'Brown with white socks', size_category: 'Medium', distinctive_markings: 'Red collar',
        registered_address: 'Blk 2 Lot 5', owner_name: 'Juan', notes: 'Friendly', gender: 'Male', estimated_age: '3 years', is_neutered: true });
    assert.equal(get(f, 'Pet ID'), 'P-00011 (ABC123)');
    assert.equal(get(f, "Owner's name"), 'Juan');
    assert.equal(get(f, 'Pet description'), 'Friendly');
    assert.equal(get(f, 'Neutered / spayed'), 'Yes');
    const empty = petFields({ pet_id: 12 });
    for (const label of ['Pet name', 'Breed', 'Color', 'Size', 'Distinguishing marks', 'Registered address', "Owner's name", 'Pet description']) {
        assert.equal(get(empty, label), NOT_PROVIDED, label);
    }
    assert.equal(empty.some((x) => x.label === 'Neutered / spayed'), false, 'unknown neuter status is not shown as No');
});

test('manual vs AI follows the saved record', () => {
    assert.equal(isManualMatchRecord({ matching_mode: 'manual' }), true);
    assert.equal(isManualMatchRecord({ ai_evidence: { engine: 'manual' } }), true);
    assert.equal(isManualMatchRecord({ matching_mode: 'ai', ai_evidence: { engine: 'gemini' } }), false);
    assert.equal(isManualMatchRecord(null), false);
    assert.equal(shown('  '), NOT_PROVIDED);
});
