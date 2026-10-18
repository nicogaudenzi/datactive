import test from 'node:test';
import assert from 'node:assert/strict';
import {serializeDashboard, parseDashboardImport, getDataSourceCompatibility} from '../src/dashboard/dashboard-persistence.js';

const visualization = {
  id: 'chart-1', type: 'histogram', title: 'Revenue distribution', titleMode: 'custom',
  query: {column: 'revenue', bins: 12}, layout: {x: 2, y: 1, w: 6, h: 5}
};
const dataSource = {type: 'csv', reference: '/data/sales.csv', expectedSchema: {columns: ['date', 'revenue']}};
const grid = {columns: 12, cellHeight: 80, margin: 8};

test('dashboard roundtrip preserves visualization configuration, titles and layout', () => {
  const exported = serializeDashboard({name: 'Sales', dataSource, visualizations: [visualization], grid});
  const imported = parseDashboardImport(JSON.stringify(exported));
  const exportedAgain = serializeDashboard({name: imported.metadata.name, dataSource: imported.dataSource, visualizations: imported.visualizations, grid: imported.settings.grid});
  assert.deepEqual(exportedAgain, exported);
});

test('export does not include dataset rows or transient filters', () => {
  const exported = serializeDashboard({dataSource, visualizations: [visualization], grid});
  assert.equal('rows' in exported, false);
  assert.equal('filters' in exported, false);
  assert.equal('activeFilters' in exported, false);
});

test('import rejects malformed and unsupported dashboard documents', () => {
  assert.throws(() => parseDashboardImport('{not json'), /valid JSON/);
  assert.throws(() => parseDashboardImport(JSON.stringify({schema: 'wrong', version: 1})), /Unrecognized dashboard document schema/);
  const bad = serializeDashboard({dataSource, visualizations: [visualization], grid});
  bad.visualizations[0].layout.w = 0;
  assert.throws(() => parseDashboardImport(JSON.stringify(bad)), /layout.w must be positive/);
});

test('rejects the obsolete layout-only export format instead of guessing its data source', () => {
  assert.throws(() => parseDashboardImport(JSON.stringify({version: 1, visualizations: [visualization]})), /Unrecognized dashboard document schema/);
});

test('data compatibility reports missing expected columns without changing the document', () => {
  assert.deepEqual(getDataSourceCompatibility(dataSource, ['date', 'revenue', 'country']), {
    compatible: true, missingColumns: [], message: 'The current dataset contains all expected columns.'
  });
  const result = getDataSourceCompatibility(dataSource, ['date']);
  assert.equal(result.compatible, false);
  assert.deepEqual(result.missingColumns, ['revenue']);
});

test('project roundtrip preserves transformations, annotations, overrides, and optional source CSV', () => {
  const processing = {
    transformations: [{id: 'trim-city', type: 'trim-text', column: 'city'}],
    annotations: {city: {description: 'Customer city'}},
    metadataOverrides: {city: {type: 'string', role: 'dimension'}}
  };
  const sourceData = {format: 'csv', name: 'sales.csv', text: 'city,revenue\nParis,42'};
  const exported = serializeDashboard({dataSource, visualizations: [visualization], grid, processing, sourceData});
  const imported = parseDashboardImport(JSON.stringify(exported));
  assert.deepEqual(imported.processing, processing);
  assert.deepEqual(imported.sourceData, sourceData);
  assert.deepEqual(imported.visualizations, [visualization]);
});

test('project without embedded source data retains a source reference and processing steps', () => {
  const processing = {transformations: [], annotations: {}, metadataOverrides: {revenue: {type: 'number', role: 'measure'}}};
  const exported = serializeDashboard({dataSource, visualizations: [visualization], grid, processing});
  assert.equal('sourceData' in exported, false);
  assert.deepEqual(exported.dataSource, dataSource);
  assert.deepEqual(parseDashboardImport(JSON.stringify(exported)).processing, processing);
});

test('raw table CSV serialization quotes commas, quotes, and newlines', async () => {
  const {serializeRawTableToCsv} = await import('../src/dashboard/dashboard-persistence.js');
  assert.equal(serializeRawTableToCsv({columns: ['name', 'note'], rows: [{name: 'Doe, Jane', note: 'said "hi"\nagain'}]}), 'name,note\r\n"Doe, Jane","said ""hi""\nagain"');
});

test('project document accepts an embedded raw table for non-CSV sources', () => {
  const document = serializeDashboard({
    name: 'Excel project',
    dataSource: {type: 'xlsx', reference: 'metrics.xlsx', sheetName: 'Data', expectedSchema: {columns: ['Name', 'Amount']}},
    sourceData: {format: 'table', name: 'metrics.xlsx', sheetName: 'Data', table: {columns: ['Name', 'Amount'], rows: [{Name: 'A', Amount: 12}]}},
    visualizations: [], grid: {columns: 12, cellHeight: 80, margin: 8}
  });
  assert.equal(parseDashboardImport(JSON.stringify(document)).sourceData.table.rows[0].Amount, 12);
});


test('project roundtrip preserves geographic roles and manual region mappings', () => {
  const processing = {
    transformations: [],
    annotations: {State: {description: 'State name'}},
    metadataOverrides: {State: {type: 'string', role: 'dimension', geographicRole: 'state-province'}},
    geography: {version: 1, mappings: [{mapId: 'us-states', column: 'State', values: [
      {sourceValue: 'Calif.', regionId: 'US-CA'},
      {sourceValue: 'New York', regionId: 'US-NY'}
    ]}]}
  };
  const geoDataSource = {...dataSource, expectedSchema: {columns: ['date', 'revenue', 'State']}};
  const exported = serializeDashboard({dataSource: geoDataSource, visualizations: [visualization], grid, processing});
  const imported = parseDashboardImport(JSON.stringify(exported));
  assert.deepEqual(imported.processing, processing);
});

test('project validation rejects malformed geographic mapping entries', () => {
  const exported = serializeDashboard({dataSource, visualizations: [visualization], grid, processing: {
    transformations: [], annotations: {}, metadataOverrides: {},
    geography: {version: 1, mappings: []}
  }});
  exported.processing.geography.mappings.push({mapId: 'us-states', column: 'State', values: [{sourceValue: 'CA', regionId: ''}]});
  assert.throws(() => parseDashboardImport(JSON.stringify(exported)), /geography\.mappings\[0\]\.values\[0\] is invalid/);
});

test('project roundtrip preserves choropleth map chart configuration', () => {
  const mapVisualization = {
    id: 'map-1', type: 'map', title: 'Revenue by country map', titleCustom: true,
    query: {geographicColumn: 'country', mapId: 'north-america-countries', measureColumn: 'revenue', aggregation: 'sum', columns: ['country', 'revenue']},
    layout: {x: 0, y: 0, w: 6, h: 5}
  };
  const exported = serializeDashboard({dataSource: {...dataSource, expectedSchema: {columns: ['country', 'revenue']}}, visualizations: [mapVisualization], grid});
  assert.deepEqual(parseDashboardImport(JSON.stringify(exported)).visualizations, [mapVisualization]);
});


test('project roundtrip preserves custom map definitions, source GeoJSON, aliases, and mappings together', async () => {
  const {createCustomMapCollection, createCustomMapRecord} = await import('../src/maps/custom-map-document.js');
  const geojson = {type:'FeatureCollection',features:[
    {type:'Feature',properties:{code:'R1',label:'Region One'},geometry:{type:'Polygon',coordinates:[[[0,0],[1,0],[1,1],[0,1],[0,0]]]}}
  ]};
  const customMaps = createCustomMapCollection([createCustomMapRecord({
    definition:{version:1,id:'custom-project-map',name:'Project map',regionType:'custom-region',regions:[{id:'R1',name:'Region One',aliases:['One']}]},
    sourceGeoJSON:geojson,idProperty:'code',labelProperty:'label',aliasesByRegion:{R1:['One','First region']}
  })]);
  const processing = {transformations:[],annotations:{},metadataOverrides:{},customMaps,
    geography:{version:1,mappings:[{mapId:'custom-project-map',column:'region',values:[{sourceValue:'First region',regionId:'R1'}]}]}};
  const exported = serializeDashboard({dataSource:{...dataSource,expectedSchema:{columns:['region','value']}},visualizations:[],grid,processing});
  const imported = parseDashboardImport(JSON.stringify(exported));
  assert.deepEqual(imported.processing.customMaps, customMaps);
  assert.deepEqual(imported.processing.geography, processing.geography);
});

test('project validation rejects custom-map geography mappings to unknown stable region IDs', async () => {
  const {createCustomMapCollection, createCustomMapRecord} = await import('../src/maps/custom-map-document.js');
  const customMaps = createCustomMapCollection([createCustomMapRecord({
    definition:{version:1,id:'custom-project-map-validation',name:'Project map',regionType:'custom-region',regions:[{id:'R1',name:'Region One',aliases:[]}]},
    sourceGeoJSON:{type:'FeatureCollection',features:[{type:'Feature',properties:{code:'R1',label:'Region One'},geometry:{type:'Polygon',coordinates:[[[0,0],[1,0],[1,1],[0,1],[0,0]]]}}]},
    idProperty:'code',labelProperty:'label'
  })]);
  const exported = serializeDashboard({dataSource,visualizations:[],grid,processing:{transformations:[],annotations:{},metadataOverrides:{},customMaps,
    geography:{version:1,mappings:[{mapId:'custom-project-map-validation',column:'region',values:[{sourceValue:'X',regionId:'R1'}]}]}}});
  exported.processing.geography.mappings[0].values[0].regionId = 'MISSING';
  assert.throws(() => parseDashboardImport(JSON.stringify(exported)), /refers to unknown region id/);
});

test('JSON export/import keeps custom map identity and aliases stable over repeated round trips', async () => {
  const {createCustomMapCollection, createCustomMapRecord} = await import('../src/maps/custom-map-document.js');
  const geojson = {type:'FeatureCollection',features:[
    {type:'Feature',properties:{code:'west-01',label:'West'},geometry:{type:'Polygon',coordinates:[[[0,0],[2,0],[2,1],[0,1],[0,0]]]}}
  ]};
  const customMaps = createCustomMapCollection([createCustomMapRecord({
    definition:{version:1,id:'custom-stable-west-map',name:'West map',regionType:'custom-region',regions:[{id:'west-01',name:'West',aliases:['Western zone']}]},
    sourceGeoJSON:geojson,idProperty:'code',labelProperty:'label',aliasesByRegion:{'west-01':['Western zone','W-zone']}
  })]);
  const processing = {transformations:[],annotations:{},metadataOverrides:{},customMaps,
    geography:{version:1,mappings:[{mapId:'custom-stable-west-map',column:'region',values:[{sourceValue:'W-zone',regionId:'west-01'}]}]}};
  const first = serializeDashboard({dataSource:{...dataSource,expectedSchema:{columns:['region']}},visualizations:[],grid,processing});
  const second = parseDashboardImport(JSON.stringify(first));
  const third = parseDashboardImport(JSON.stringify(serializeDashboard({dataSource:second.dataSource,visualizations:second.visualizations,grid:second.settings.grid,processing:second.processing})));
  assert.equal(third.processing.customMaps.maps[0].id,'custom-stable-west-map');
  assert.equal(third.processing.customMaps.maps[0].regions[0].id,'west-01');
  assert.deepEqual(third.processing.customMaps.maps[0].aliasesByRegion['west-01'],['Western zone','W-zone']);
  assert.deepEqual(third.processing.geography.mappings[0].values,[{sourceValue:'W-zone',regionId:'west-01'}]);
});

test('older project documents without customMaps remain importable', () => {
  const exported = serializeDashboard({dataSource,visualizations:[visualization],grid,processing:{transformations:[],annotations:{},metadataOverrides:{}}});
  delete exported.processing.customMaps;
  const imported = parseDashboardImport(JSON.stringify(exported));
  assert.equal(Object.hasOwn(imported.processing,'customMaps'),false);
  assert.deepEqual(imported.visualizations,[visualization]);
});
