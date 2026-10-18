import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GEOGRAPHIC_ROLES,
  MAP_DATA_CONTRACT_VERSION,
  inspectGeographyMapping,
  validateGeographyConfiguration,
  validateMapDefinition
} from '../src/maps/map-data-contract.js';

const map = {
  version: MAP_DATA_CONTRACT_VERSION,
  id: 'example-countries',
  name: 'Example countries',
  regionType: 'country',
  regions: [
    {id: 'country-a', name: 'Country A', aliases: ['A']},
    {id: 'country-b', name: 'Country B', aliases: []}
  ]
};

test('geographic roles are independent of inferred data types and generic column roles', () => {
  assert.deepEqual(GEOGRAPHIC_ROLES, ['country', 'state-province', 'county-district', 'city', 'postal-code', 'custom-region']);
});

test('geography configuration roundtrips stable map and region IDs with typed source values', () => {
  const config = {
    version: 1,
    mappings: [{mapId: 'example-countries', column: 'Country', values: [
      {sourceValue: 'A', regionId: 'country-a'},
      {sourceValue: 2, regionId: 'country-b'}
    ]}]
  };
  assert.deepEqual(validateGeographyConfiguration(config, ['Country']), config);
});

test('geography configuration rejects unknown columns, duplicate targets and duplicate source values', () => {
  assert.throws(() => validateGeographyConfiguration({version: 1, mappings: [{mapId: 'map', column: 'missing', values: []}]}, ['Country']), /unknown column/);
  assert.throws(() => validateGeographyConfiguration({version: 1, mappings: [
    {mapId: 'map', column: 'Country', values: []},
    {mapId: 'map', column: 'Country', values: []}
  ]}), /Duplicate geography mapping/);
  assert.throws(() => validateGeographyConfiguration({version: 1, mappings: [{mapId: 'map', column: 'Country', values: [
    {sourceValue: 'A', regionId: 'a'}, {sourceValue: 'A', regionId: 'b'}
  ]}]}), /Duplicate source value/);
});

test('map definitions require unique stable region IDs and display names', () => {
  assert.deepEqual(validateMapDefinition(map), map);
  assert.throws(() => validateMapDefinition({...map, regions: [...map.regions, {id: 'country-a', name: 'Duplicate'}]}), /Duplicate map region id/);
});

test('mapping inspection reports unmapped and invalid-region values without silently guessing', () => {
  const report = inspectGeographyMapping(['A', 'B', 'C'], {
    mapId: 'example-countries', column: 'Country', values: [
      {sourceValue: 'A', regionId: 'country-a'},
      {sourceValue: 'B', regionId: 'missing-region'}
    ]
  }, map);
  assert.deepEqual(report, [
    {sourceValue: 'A', status: 'mapped', regionId: 'country-a'},
    {sourceValue: 'B', status: 'invalid-region', regionId: 'missing-region'},
    {sourceValue: 'C', status: 'unmapped', regionId: null}
  ]);
});
