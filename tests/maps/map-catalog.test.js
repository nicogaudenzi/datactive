import test from 'node:test';
import assert from 'node:assert/strict';
import {getAllMaps, getMapDefinition, getMapGeometry, registerCustomMap} from '../../src/maps/map-catalog.js';
import {buildMapChartModel} from '../../src/maps/map-chart-model.js';

const geojson = {type:'FeatureCollection', features:[
  {type:'Feature', properties:{code:'A', label:'Alpha'}, geometry:{type:'Polygon',coordinates:[[[0,0],[1,0],[1,1],[0,1],[0,0]]]}},
  {type:'Feature', properties:{code:'B', label:'Beta'}, geometry:{type:'Polygon',coordinates:[[[2,0],[3,0],[3,1],[2,1],[2,0]]]}}
]};

test('registers custom maps in the session catalog with stable IDs and normalized geometry properties', () => {
  const map = registerCustomMap({name:'Test Territories', geojson, idProperty:'code', labelProperty:'label'});
  assert.equal(map.id, 'custom-test-territories');
  assert.deepEqual(map.regions.map(region => region.id), ['A','B']);
  assert.equal(getMapDefinition(map.id).name, 'Test Territories');
  assert.equal(getMapGeometry(map.id).features[0].properties.regionId, 'A');
  assert.ok(getAllMaps().some(entry => entry.id === map.id));
});

test('avoids custom map ID collisions without overwriting earlier maps', () => {
  const firstGeoJSON = structuredClone(geojson);
  firstGeoJSON.features[0].geometry.coordinates[0] = [[5,0],[6,0],[6,1],[5,1],[5,0]];
  firstGeoJSON.features[1].geometry.coordinates[0] = [[7,0],[8,0],[8,1],[7,1],[7,0]];
  const first = registerCustomMap({name:'Collision Test', geojson:firstGeoJSON, idProperty:'code', labelProperty:'label'});
  const distinctGeoJSON = structuredClone(geojson);
  distinctGeoJSON.features[0].geometry.coordinates[0] = [[10,0],[11,0],[11,1],[10,1],[10,0]];
  distinctGeoJSON.features[1].geometry.coordinates[0] = [[12,0],[13,0],[13,1],[12,1],[12,0]];
  const second = registerCustomMap({name:'Collision Test', geojson:distinctGeoJSON, idProperty:'code', labelProperty:'label'});
  assert.notEqual(first.id, second.id);
  assert.equal(getMapDefinition(first.id).name, 'Collision Test');
});

test('rejects duplicate or missing IDs when registering a custom map', () => {
  assert.throws(() => registerCustomMap({name:'Bad map', geojson:{...geojson,features:[geojson.features[0], {...geojson.features[1],properties:{code:'A',label:'Duplicate'}}]}, idProperty:'code',labelProperty:'label'}), /Duplicate region ID/);
  assert.throws(() => registerCustomMap({name:'Bad map', geojson:{...geojson,features:[{...geojson.features[0],properties:{label:'Missing'}}]}, idProperty:'code',labelProperty:'label'}), /missing its selected ID/);
});

test('custom map can supply region aggregation model values through saved assignments', () => {
  const modelGeoJSON = structuredClone(geojson);
  modelGeoJSON.features[0].geometry.coordinates[0] = [[20,0],[21,0],[21,1],[20,1],[20,0]];
  modelGeoJSON.features[1].geometry.coordinates[0] = [[22,0],[23,0],[23,1],[22,1],[22,0]];
  const map = registerCustomMap({name:'Model Territories', geojson:modelGeoJSON, idProperty:'code', labelProperty:'label'});
  const model = buildMapChartModel({
    rows:[{territory:'Alpha',sales:10},{territory:'Beta',sales:20}], geographicColumn:'territory', measureColumn:'sales', aggregation:'sum', mapId:map.id,
    geographyConfiguration:{version:1,mappings:[{mapId:map.id,column:'territory',values:[{sourceValue:'Alpha',regionId:'A'},{sourceValue:'Beta',regionId:'B'}]}]}
  });
  assert.deepEqual(model.regions.map(region => region.value), [10,20]);
});
