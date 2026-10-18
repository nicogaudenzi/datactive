import test from 'node:test';
import assert from 'node:assert/strict';
import {getAllMaps, getCustomMapDetails, getMapDefinition, getMapGeometry, findDuplicateCustomMap, registerCustomMap, removeCustomMap, updateCustomMapProperties, serializeCustomMaps, restoreCustomMapCollection, saveCustomMaps, loadCustomMaps, CUSTOM_MAP_STORAGE_KEY} from '../../src/maps/map-catalog.js';

function geo(offset = 0) {
  return {type:'FeatureCollection',features:[
    {type:'Feature',properties:{region_code:'A',region_name:'Alpha',other:'Alpha label',group:'same'},geometry:{type:'Polygon',coordinates:[[[offset,0],[offset+1,0],[offset+1,1],[offset,1],[offset,0]]]}},
    {type:'Feature',properties:{region_code:'B',region_name:'Beta',other:'Beta label',group:'same'},geometry:{type:'Polygon',coordinates:[[[offset+2,0],[offset+3,0],[offset+3,1],[offset+2,1],[offset+2,0]]]}}
  ]};
}

test('custom catalog rejects duplicate GeoJSON and can update ID and label properties', () => {
  const source = geo(30);
  const map = registerCustomMap({name:'Catalog test custom map',geojson:source,idProperty:'region_code',labelProperty:'region_name'});
  assert.equal(findDuplicateCustomMap(source).id, map.id);
  assert.throws(() => registerCustomMap({name:'Duplicate copy',geojson:source,idProperty:'region_code',labelProperty:'region_name'}), /already in the catalog/);
  updateCustomMapProperties(map.id,{idProperty:'region_code',labelProperty:'other'});
  assert.equal(getMapDefinition(map.id).regions[0].name,'Alpha label');
  assert.equal(getCustomMapDetails(map.id).labelProperty,'other');
  assert.equal(getMapGeometry(map.id).features[0].properties.name,'Alpha label');
  assert.equal(removeCustomMap(map.id),true);
  assert.equal(getMapDefinition(map.id),null);
  assert.equal(getAllMaps().some(item => item.id === map.id),false);
});

test('custom catalog rejects ID property edits that produce duplicate IDs without changing existing map', () => {
  const source = geo(40);
  const map = registerCustomMap({name:'Catalog test validation',geojson:source,idProperty:'region_code',labelProperty:'region_name'});
  assert.throws(() => updateCustomMapProperties(map.id,{idProperty:'group',labelProperty:'region_name'}), /Duplicate region ID/);
  assert.equal(getMapDefinition(map.id).regions[0].id,'A');
  removeCustomMap(map.id);
});

test('custom catalog aliases are saved and used by exact geography matching', async () => {
  const {matchGeographicValue} = await import('../../src/maps/geography-matching.js');
  const source = geo(50);
  const map = registerCustomMap({name:'Alias test custom map',geojson:source,idProperty:'region_code',labelProperty:'region_name'});
  updateCustomMapProperties(map.id, {idProperty:'region_code', labelProperty:'region_name', aliasesByRegion:{A:['North Zone', 'N-Zone'], B:['South Zone']}});
  const definition = getMapDefinition(map.id);
  assert.equal(matchGeographicValue('north zone', definition).regionId, 'A');
  assert.equal(matchGeographicValue('N Zone', definition).regionId, 'A');
  assert.equal(matchGeographicValue('South Zone', definition).regionId, 'B');
  assert.deepEqual(getCustomMapDetails(map.id).aliasesByRegion.A, ['North Zone', 'N-Zone']);
  removeCustomMap(map.id);
});

test('conflicting custom aliases remain ambiguous instead of being guessed', async () => {
  const {matchGeographicValue} = await import('../../src/maps/geography-matching.js');
  const source = geo(60);
  const map = registerCustomMap({name:'Ambiguous alias test map',geojson:source,idProperty:'region_code',labelProperty:'region_name'});
  updateCustomMapProperties(map.id, {idProperty:'region_code', labelProperty:'region_name', aliasesByRegion:{A:['Central'], B:['central']}});
  assert.equal(matchGeographicValue('CENTRAL', getMapDefinition(map.id)).status, 'ambiguous');
  removeCustomMap(map.id);
});

test('custom map document contract preserves stable map/region IDs, selected properties, GeoJSON, and aliases', async () => {
  const {createCustomMapRecord, validateCustomMapRecord, createCustomMapCollection, validateCustomMapCollection} = await import('../../src/maps/custom-map-document.js');
  const source = geo(70);
  const map = registerCustomMap({name:'Portable map contract',geojson:source,idProperty:'region_code',labelProperty:'region_name'});
  updateCustomMapProperties(map.id, {idProperty:'region_code',labelProperty:'region_name',aliasesByRegion:{A:['North','N'],B:['South']}});
  const record = createCustomMapRecord(getCustomMapDetails(map.id));
  assert.equal(record.id, map.id);
  assert.deepEqual(record.regions.map(region => region.id), ['A','B']);
  assert.equal(record.idProperty, 'region_code');
  assert.equal(record.labelProperty, 'region_name');
  assert.deepEqual(record.aliasesByRegion.A, ['North','N']);
  const restored = validateCustomMapRecord(JSON.parse(JSON.stringify(record)));
  assert.deepEqual(restored, record);
  const collection = createCustomMapCollection([record]);
  assert.deepEqual(validateCustomMapCollection(JSON.parse(JSON.stringify(collection))), collection);
  assert.throws(() => createCustomMapCollection([record, record]), /Duplicate custom map id/);
  removeCustomMap(map.id);
});

test('custom map document contract rejects unsupported versions, invalid IDs, and aliases for unknown regions', async () => {
  const {createCustomMapRecord, validateCustomMapRecord} = await import('../../src/maps/custom-map-document.js');
  const source = geo(80);
  const map = registerCustomMap({name:'Invalid portable map contract',geojson:source,idProperty:'region_code',labelProperty:'region_name'});
  const record = createCustomMapRecord(getCustomMapDetails(map.id));
  assert.throws(() => validateCustomMapRecord({...record,version:99}), /Unsupported custom map document version/);
  assert.throws(() => validateCustomMapRecord({...record,aliasesByRegion:{UNKNOWN:['Alias']}}), /unknown region id/);
  assert.throws(() => validateCustomMapRecord({...record,regions:[...record.regions,{...record.regions[0]}]}), /Duplicate custom map region id/);
  removeCustomMap(map.id);
});


test('custom map catalog persistence restores stable IDs, selected properties, geometry, and aliases', () => {
  const source = geo(90);
  const map = registerCustomMap({name:'Persistent custom map',geojson:source,idProperty:'region_code',labelProperty:'region_name'});
  updateCustomMapProperties(map.id, {idProperty:'region_code',labelProperty:'other',aliasesByRegion:{A:['North Zone'],B:['South Zone']}});
  const collection = JSON.parse(JSON.stringify(serializeCustomMaps()));
  removeCustomMap(map.id);
  assert.equal(getMapDefinition(map.id), null);
  restoreCustomMapCollection(collection);
  assert.equal(getMapDefinition(map.id).id, map.id);
  assert.equal(getMapDefinition(map.id).regions[0].name, 'Alpha label');
  assert.equal(getCustomMapDetails(map.id).labelProperty, 'other');
  assert.deepEqual(getCustomMapDetails(map.id).aliasesByRegion, {A:['North Zone'],B:['South Zone']});
  assert.deepEqual(getMapGeometry(map.id).features.map(feature => feature.properties.regionId), ['A','B']);
  removeCustomMap(map.id);
});

test('custom map collection can save and load through a storage adapter and rejects invalid saved data safely', () => {
  const storage = new Map();
  const adapter = {getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value)};
  const source = geo(100);
  const map = registerCustomMap({name:'Storage adapter map',geojson:source,idProperty:'region_code',labelProperty:'region_name'});
  updateCustomMapProperties(map.id, {idProperty:'region_code',labelProperty:'region_name',aliasesByRegion:{A:['Northern'],B:['Southern']}});
  assert.equal(saveCustomMaps(adapter), true);
  const saved = JSON.parse(storage.get(CUSTOM_MAP_STORAGE_KEY));
  assert.equal(saved.maps.some(item => item.id === map.id), true);
  removeCustomMap(map.id);
  // Reinsert the saved payload using the injected storage and ensure it is restored.
  storage.set(CUSTOM_MAP_STORAGE_KEY, JSON.stringify(saved));
  assert.equal(loadCustomMaps(adapter), true);
  assert.equal(getMapDefinition(map.id)?.id, map.id);
  assert.deepEqual(getCustomMapDetails(map.id).aliasesByRegion.A, ['Northern']);
  storage.set(CUSTOM_MAP_STORAGE_KEY, '{invalid json');
  assert.equal(loadCustomMaps(adapter), false);
  assert.ok(getMapDefinition(map.id), 'invalid saved data must not clear the active catalog');
  removeCustomMap(map.id);
});

test('restoring an invalid custom-map collection is atomic and preserves the active catalog', async () => {
  const {createCustomMapRecord, createCustomMapCollection} = await import('../../src/maps/custom-map-document.js');
  const active = registerCustomMap({name:'Atomic restore active',geojson:geo(110),idProperty:'region_code',labelProperty:'region_name'});
  const candidate = createCustomMapRecord({
    definition:{version:1,id:'custom-should-not-appear',name:'Candidate map',regionType:'custom-region',regions:[{id:'A',name:'Alpha',aliases:[]},{id:'B',name:'Beta',aliases:[]}]},
    sourceGeoJSON:geo(120),idProperty:'region_code',labelProperty:'region_name'
  });
  const conflictsWithBuiltin = createCustomMapRecord({
    definition:{version:1,id:'us-states',name:'Invalid built-in conflict',regionType:'custom-region',regions:[{id:'A',name:'Alpha',aliases:[]},{id:'B',name:'Beta',aliases:[]}]},
    sourceGeoJSON:geo(130),idProperty:'region_code',labelProperty:'region_name'
  });
  assert.throws(() => restoreCustomMapCollection(createCustomMapCollection([candidate, conflictsWithBuiltin])), /conflicts with a built-in map/);
  assert.ok(getMapDefinition(active.id), 'the previous active catalog entry should remain');
  assert.equal(getMapDefinition('custom-should-not-appear'), null, 'no candidate entries should be committed');
  removeCustomMap(active.id);
});

test('catalog restore rejects duplicate geometry without partially replacing current maps', () => {
  const active = registerCustomMap({name:'Duplicate geometry atomic active',geojson:geo(140),idProperty:'region_code',labelProperty:'region_name'});
  const duplicateGeometryCollection = {
    schema:'datactive/custom-map-collection', version:1,
    maps:[
      {schema:'datactive/custom-map',version:1,id:'custom-dup-one',name:'One',sourceGeoJSON:geo(150),idProperty:'region_code',labelProperty:'region_name',aliasesByRegion:{},regions:[{id:'A',name:'Alpha',aliases:[]},{id:'B',name:'Beta',aliases:[]}]},
      {schema:'datactive/custom-map',version:1,id:'custom-dup-two',name:'Two',sourceGeoJSON:geo(150),idProperty:'region_code',labelProperty:'region_name',aliasesByRegion:{},regions:[{id:'A',name:'Alpha',aliases:[]},{id:'B',name:'Beta',aliases:[]}]}
    ]
  };
  assert.throws(() => restoreCustomMapCollection(duplicateGeometryCollection), /Duplicate custom map geometry/);
  assert.ok(getMapDefinition(active.id));
  assert.equal(getMapDefinition('custom-dup-one'), null);
  removeCustomMap(active.id);
});
