import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterBreedSuggestions,
  getBreedsForAnimalType,
  DOG_BREEDS,
  CAT_BREEDS,
  COMMON_BREEDS_ALL,
} from '../src/resident/data/breeds.ts';

test('getBreedsForAnimalType returns appropriate breed lists', () => {
  assert.equal(getBreedsForAnimalType('dog'), DOG_BREEDS);
  assert.equal(getBreedsForAnimalType('cat'), CAT_BREEDS);
  assert.equal(getBreedsForAnimalType(null), COMMON_BREEDS_ALL);
  assert.equal(getBreedsForAnimalType('other'), COMMON_BREEDS_ALL);
});

test('filterBreedSuggestions returns full list when query is empty', () => {
  const dogResults = filterBreedSuggestions('dog', '');
  assert.ok(dogResults.length > 0);
  assert.ok(dogResults.includes('Aspin (Asong Pinoy)'));
  assert.ok(dogResults.includes('Shih Tzu'));

  const catResults = filterBreedSuggestions('cat', '');
  assert.ok(catResults.length > 0);
  assert.ok(catResults.includes('Puspin (Pusang Pinoy)'));
  assert.ok(catResults.includes('Persian'));
});

test('filterBreedSuggestions matches case-insensitively with prefix priority', () => {
  const results = filterBreedSuggestions('dog', 'shih');
  assert.equal(results[0], 'Shih Tzu');

  const aspResults = filterBreedSuggestions('dog', 'aspin');
  assert.equal(aspResults[0], 'Aspin (Asong Pinoy)');
});

test('filterBreedSuggestions returns empty array when no breed matches', () => {
  const results = filterBreedSuggestions('dog', 'xyznonexistent123');
  assert.equal(results.length, 0);
});
