import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCustomGeoJSON, inspectCustomGeoJSONFeatures} from '../../src/maps/custom-geojson.js';

const polygon = (id, name, offset = 0) => ({type:'Feature', properties:{district_id:id, district_name:name}, geometry:{type:'Polygon',coordinates:[[[offset,0],[offset+1,0],[offset+1,1],[offset,1],[offset,0]]]}});
const collection = features => ({type:'FeatureCollection',features});

test('validates polygon FeatureCollections and discovers properties', () => {
  const result = validateCustomGeoJSON(JSON.stringify(collection([polygon('A','Alpha'), polygon('B','Beta',2)])));
  assert.equal(result.featureCount, 2);
  assert.deepEqual(result.propertyNames, ['district_id','district_name']);
  assert.deepEqual(result.bounds, [[0,0],[3,1]]);
});

test('rejects invalid JSON and non-FeatureCollection roots', () => {
  assert.throws(() => validateCustomGeoJSON('{no'), /not valid JSON/);
  assert.throws(() => validateCustomGeoJSON({type:'Feature',geometry:null}), /FeatureCollection/);
});

test('rejects empty, too large, and unsupported feature collections', () => {
  assert.throws(() => validateCustomGeoJSON(collection([])), /no features/);
  assert.throws(() => validateCustomGeoJSON(collection([polygon('A','A'), polygon('B','B')]), {maxFeatures:1}), /limit is 1/);
  assert.throws(() => validateCustomGeoJSON(collection([{type:'Feature',properties:{},geometry:{type:'Point',coordinates:[0,0]}}])), /expected Polygon or MultiPolygon/);
});

test('rejects out-of-range or insufficient coordinates', () => {
  const bad = polygon('A','A'); bad.geometry.coordinates[0][1] = [200, 0];
  assert.throws(() => validateCustomGeoJSON(collection([bad])), /invalid or insufficient coordinates/);
});

test('enforces the input byte limit', () => {
  assert.throws(() => validateCustomGeoJSON('{}', {maxBytes:1}), /size limit/);
});

test('reports missing and duplicate IDs and missing labels', () => {
  const geo = collection([polygon('A','Alpha'), polygon('A','',2), polygon('', 'Gamma',4)]);
  const report = inspectCustomGeoJSONFeatures(geo, 'district_id', 'district_name');
  assert.deepEqual(report.duplicateIds, ['A']);
  assert.deepEqual(report.missingIds, [3]);
  assert.equal(report.labelsMissing, 1);
});
