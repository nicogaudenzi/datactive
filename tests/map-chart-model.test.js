import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMapChartModel} from '../src/maps/map-chart-model.js';

const geographyConfiguration = {
  version: 1,
  mappings: [{mapId: 'north-america-countries', column: 'country', values: [
    {sourceValue: 'US', regionId: 'country-united-states'},
    {sourceValue: 'USA', regionId: 'country-united-states'},
    {sourceValue: 'Mexico', regionId: 'country-mexico'}
  ]}]
};

test('map chart model aggregates source rows into mapped regions', () => {
  const model = buildMapChartModel({
    rows: [
      {country: 'US', revenue: '10'},
      {country: 'USA', revenue: '5'},
      {country: 'Mexico', revenue: '7'},
      {country: 'Unknown', revenue: '90'}
    ],
    geographicColumn: 'country', measureColumn: 'revenue', aggregation: 'sum',
    mapId: 'north-america-countries', geographyConfiguration
  });
  assert.equal(model.regions.find(region => region.id === 'country-united-states').value, 15);
  assert.equal(model.regions.find(region => region.id === 'country-mexico').value, 7);
  assert.equal(model.regions.find(region => region.id === 'country-canada').value, null);
  assert.equal(model.unmappedValueCount, 1);
});

test('map chart model supports average, min, max, and count aggregations', () => {
  const args = {
    rows: [{country: 'US', revenue: '10'}, {country: 'USA', revenue: '4'}],
    geographicColumn: 'country', measureColumn: 'revenue', mapId: 'north-america-countries', geographyConfiguration
  };
  const value = aggregation => buildMapChartModel({...args, aggregation}).regions.find(region => region.id === 'country-united-states').value;
  assert.equal(value('average'), 7);
  assert.equal(value('min'), 4);
  assert.equal(value('max'), 10);
  assert.equal(value('count'), 2);
});

test('map chart model does not coerce blank or non-numeric measures to zero', () => {
  const model = buildMapChartModel({
    rows: [{country: 'US', revenue: ''}, {country: 'US', revenue: 'not reported'}],
    geographicColumn: 'country', measureColumn: 'revenue', aggregation: 'sum',
    mapId: 'north-america-countries', geographyConfiguration
  });
  assert.equal(model.regions.find(region => region.id === 'country-united-states').value, null);
});

test('zero remains a valid mapped value and is distinct from a region with no valid measure data', () => {
  const model = buildMapChartModel({
    rows: [{country: 'US', revenue: '0'}, {country: 'Mexico', revenue: 'not reported'}],
    geographicColumn: 'country', measureColumn: 'revenue', aggregation: 'sum',
    mapId: 'north-america-countries', geographyConfiguration
  });
  assert.equal(model.regions.find(region => region.id === 'country-united-states').value, 0);
  assert.equal(model.regions.find(region => region.id === 'country-mexico').value, null);
  assert.equal(model.mappedRegionCount, 1);
});
