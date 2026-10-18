import test from 'node:test';
import assert from 'node:assert/strict';
import {BUILT_IN_MAPS, getBuiltInMap} from '../src/maps/builtin-maps.js';

test('country map keeps its stable region IDs', () => {
  const map = getBuiltInMap('north-america-countries');
  assert.equal(map.regionType, 'country');
  assert.deepEqual(map.regions.map(region => region.id), ['country-canada', 'country-mexico', 'country-united-states']);
  assert.equal(getBuiltInMap('unknown-map'), null);
});

test('M5 adds state and province maps with stable ISO-derived region IDs', () => {
  assert.equal(BUILT_IN_MAPS.length, 4);
  for (const [id, minimum] of [['us-states', 50], ['mexico-states', 30], ['canada-provinces', 13]]) {
    const map = getBuiltInMap(id);
    assert.equal(map.regionType, 'state-province');
    assert.ok(map.regions.length >= minimum, `${id} should include all expected regions`);
    assert.equal(new Set(map.regions.map(region => region.id)).size, map.regions.length);
    assert.ok(map.regions.every(region => region.aliases.length > 0));
  }
});
