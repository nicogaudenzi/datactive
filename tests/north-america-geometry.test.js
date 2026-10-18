import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {BUILT_IN_MAPS} from '../src/maps/builtin-maps.js';

const geometryPath = new URL('../src/maps/geometry/north-america-countries.json', import.meta.url);

function coordinateCount(value) {
  if (!Array.isArray(value)) return 0;
  if (value.length >= 2 && value.slice(0, 2).every(Number.isFinite)) return 1;
  return value.reduce((sum, child) => sum + coordinateCount(child), 0);
}

test('bundled North America GeoJSON covers each stable built-in country region', async () => {
  const geojson = JSON.parse(await readFile(geometryPath, 'utf8'));
  assert.equal(geojson.type, 'FeatureCollection');
  assert.equal(geojson.features.length, 3);
  const regionIds = geojson.features.map(feature => feature.properties.regionId).sort();
  assert.deepEqual(regionIds, BUILT_IN_MAPS[0].regions.map(region => region.id).sort());
  for (const feature of geojson.features) {
    assert.ok(['Polygon', 'MultiPolygon'].includes(feature.geometry.type), `${feature.properties.name} geometry type`);
    assert.ok(coordinateCount(feature.geometry.coordinates) > 20, `${feature.properties.name} should have real boundary detail`);
    assert.ok(feature.geometry.coordinates.flat(Infinity).every(Number.isFinite), `${feature.properties.name} coordinates should be numeric`);
  }
});

test('bundled geometry records Natural Earth provenance and public-domain terms', async () => {
  const geojson = JSON.parse(await readFile(geometryPath, 'utf8'));
  assert.match(geojson.source.dataset, /Natural Earth/i);
  assert.match(geojson.source.upstream, /^https:\/\/www\.naturalearthdata\.com\//);
  assert.match(geojson.source.license, /public domain/i);
});
