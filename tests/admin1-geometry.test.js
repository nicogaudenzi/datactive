import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {getBuiltInMap} from '../src/maps/builtin-maps.js';

for (const [mapId, file, expectedCount] of [
  ['us-states', 'us-states.json', 51],
  ['mexico-states', 'mexico-states.json', 32],
  ['canada-provinces', 'canada-provinces.json', 13]
]) {
  test(`${mapId} geometry covers all ${expectedCount} Admin 1 regions with source metadata`, async () => {
    const geo = JSON.parse(await readFile(new URL(`../src/maps/geometry/${file}`, import.meta.url), 'utf8'));
    const map = getBuiltInMap(mapId);
    assert.equal(geo.type, 'FeatureCollection');
    assert.equal(geo.features.length, expectedCount);
    assert.equal(geo.source.version, '5.1.1');
    assert.match(geo.source.license, /public domain/i);
    assert.deepEqual(geo.features.map(f => f.properties.regionId).sort(), map.regions.map(r => r.id).sort());
    for (const feature of geo.features) {
      assert.ok(['Polygon', 'MultiPolygon'].includes(feature.geometry.type));
      assert.ok(feature.properties.iso3166_2);
      assert.ok(feature.geometry.coordinates.flat(Infinity).every(Number.isFinite));
    }
  });
}
