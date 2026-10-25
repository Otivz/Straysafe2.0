import assert from 'node:assert/strict';
import { test } from 'node:test';
import { saveClaimEvidence } from '../src/utils/claimEvidence.ts';

const photo = name => new File(['test'], name, { type: 'image/png' });
const item = file => ({ file, documentType: 'additional_photo', label: file.name });
const url = file => `https://res.cloudinary.com/test/image/upload/claims/${file.name}`;

test('evidence is saved by report and pet instead of a stale cached claim ID', async () => {
    const file = photo('screenshot.png');
    let submitted;
    const result = await saveClaimEvidence({ reportId: 1, petId: 10, files: [item(file)], remarks: 'My pet' },
        async file => ({ url: url(file) }), async payload => { submitted = payload; return { claim_id: 52 }; }, new WeakMap());
    assert.deepEqual(submitted, { report_id: 1, pet_id: 10, remarks: 'My pet', additional_photos_url: url(file) });
    assert.equal(result.claim.claim_id, 52);
    assert.deepEqual(result.savedFiles, [file]);
});

test('all document types and multiple photos are saved together', async () => {
    const types = ['vaccine_card', 'vet_record', 'registration_record', 'additional_photo', 'additional_photo', 'evidence'];
    const files = types.map((documentType, i) => ({ file: photo(`file${i}.png`), documentType, label: documentType }));
    let submitted;
    await saveClaimEvidence({ reportId: 2, petId: 10, files, distinctiveMarkings: ' Left ear notch ' },
        async file => ({ url: url(file) }), async payload => { submitted = payload; return { claim_id: 52 }; }, new WeakMap());
    assert.equal(submitted.vaccine_card_url, url(files[0].file));
    assert.equal(submitted.vet_record_url, url(files[1].file));
    assert.equal(submitted.registration_record_url, url(files[2].file));
    assert.equal(submitted.additional_photos_url, `${url(files[3].file)},${url(files[4].file)}`);
    assert.equal(submitted.evidence_url, url(files[5].file));
    assert.equal(submitted.distinctive_markings, 'Left ear notch');
});

test('a failed server save keeps uploaded URLs for retry without another Cloudinary upload', async () => {
    const file = photo('retry.png');
    const uploaded = new WeakMap();
    const input = { reportId: 1, petId: 10, files: [item(file)] };
    let uploads = 0;
    const upload = async file => { uploads++; return { url: url(file) }; };
    await assert.rejects(saveClaimEvidence(input, upload, async () => { throw new Error('Server unavailable'); }, uploaded), /Server unavailable/);
    const result = await saveClaimEvidence(input, upload, async () => ({ claim_id: 53 }), uploaded);
    assert.equal(uploads, 1);
    assert.equal(result.claim.claim_id, 53);
    assert.equal(result.savedFiles[0], file);
});

test('partial uploads identify saved files and leave failed files available for retry', async () => {
    const saved = photo('saved.png');
    const failed = photo('failed.png');
    let submitted;
    const result = await saveClaimEvidence({ reportId: 1, petId: 10, files: [item(saved), item(failed)] },
        async file => { if (file === failed) throw new Error('Offline'); return { url: url(file) }; },
        async payload => { submitted = payload; return { claim_id: 53 }; }, new WeakMap());
    assert.deepEqual(result.savedFiles, [saved]);
    assert.deepEqual(result.errors, ['failed.png: Offline']);
    assert.equal(submitted.additional_photos_url, url(saved));
});

test('when every file fails, no empty claim is submitted', async () => {
    let saves = 0;
    const result = await saveClaimEvidence({ reportId: 1, petId: 10, files: [item(photo('failed.png'))] },
        async () => { throw new Error('Offline'); }, async () => { saves++; return { claim_id: 53 }; }, new WeakMap());
    assert.equal(saves, 0);
    assert.equal(result.claim, null);
    assert.deepEqual(result.savedFiles, []);
    assert.equal(result.errors.length, 1);
});

test('notes and distinctive markings can be saved without a file', async () => {
    let submitted;
    await saveClaimEvidence({ reportId: 1, petId: 10, files: [], distinctiveMarkings: 'White spot' },
        async () => assert.fail('No file should be uploaded'), async payload => { submitted = payload; return { claim_id: 53 }; }, new WeakMap());
    assert.equal(submitted.distinctive_markings, 'White spot');
});

test('missing server IDs are never treated as successful saves', async () => {
    await assert.rejects(saveClaimEvidence({ reportId: 1, petId: 10, files: [], remarks: 'Notes' },
        async () => assert.fail(), async () => ({}), new WeakMap()), /server did not return a saved claim/);
});

test('invalid report or pet IDs fail before uploading or writing', async () => {
    for (const [reportId, petId] of [[0, 10], [1, 0], [NaN, 10]]) {
        await assert.rejects(saveClaimEvidence({ reportId, petId, files: [item(photo('photo.png'))] },
            async () => assert.fail(), async () => assert.fail(), new WeakMap()), /valid report and registered pet/);
    }
});
