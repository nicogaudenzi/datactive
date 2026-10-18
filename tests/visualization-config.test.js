import test from 'node:test';
import assert from 'node:assert/strict';
import {validateVisualizationConfig} from '../src/dashboard/visualization-config.js';
import {createCanonicalDataset} from '../src/data/dataset-schema.js';

const dataset = createCanonicalDataset({
  columns: ['month', 'country', 'revenue', 'cost', 'units'],
  rows: [{month: 'Jan', country: 'MX', revenue: '10', cost: '5', units: '2'}]
});

const measure = (column = 'revenue', aggregation = 'sum') => [{column, aggregation}];
const geographicDataset = {...dataset, columnMetadata: {...dataset.columnMetadata, country: {...dataset.columnMetadata.country, geographicRole: 'country'}}};

test('valid chart configurations pass validation across common chart families', () => {
  const cases = [
    ['bar', {dimensions: ['month'], measures: [...measure('revenue'), ...measure('cost')]}],
    ['pie', {dimensions: ['country'], measures: measure()}],
    ['scatter', {xColumn: 'units', yColumn: 'revenue', colorColumn: 'country', sizeColumn: 'cost'}],
    ['histogram', {histogramColumn: 'revenue', bins: 10}],
    ['density', {densityColumn: 'revenue'}],
    ['heatmap', {dimensions: ['month', 'country'], measures: measure()}],
    ['combo', {dimensions: ['month'], aggregation: 'sum', series: [{measure: 'revenue', style: 'bar'}, {measure: 'cost', style: 'line'}]}],
    ['boxPlot', {boxPlotDimension: 'month', boxPlotMeasure: 'revenue'}],
    ['table', {columns: ['month', 'revenue']}]
  ];
  for (const [type, query] of cases) assert.equal(validateVisualizationConfig(type, query, dataset), '', `${type} should be valid`);
});

test('rejects missing or unknown columns rather than allowing a renderer to fail later', () => {
  assert.match(validateVisualizationConfig('bar', {dimensions: ['missing'], measures: measure()}, dataset), /Dimension 1.*current dataset/);
  assert.match(validateVisualizationConfig('scatter', {xColumn: 'month', yColumn: 'revenue'}, dataset), /X axis.*numeric/);
  assert.match(validateVisualizationConfig('table', {columns: ['month', 'unknown']}, dataset), /table column must exist/);
  assert.match(validateVisualizationConfig('unknown', {}, dataset), /Unknown chart type/);
});

test('rejects incompatible dimensions, duplicate dimensions, and duplicate combo measures', () => {
  assert.match(validateVisualizationConfig('heatmap', {dimensions: ['month', 'month'], measures: measure()}, dataset), /two different dimensions/);
  assert.match(validateVisualizationConfig('stackedBar', {dimensions: ['month', 'country'], measures: [{column: 'country', aggregation: 'sum'}]}, dataset), /numeric/);
  assert.match(validateVisualizationConfig('combo', {dimensions: ['month'], aggregation: 'sum', series: [{measure: 'revenue', style: 'bar'}, {measure: 'revenue', style: 'line'}]}, dataset), /two different measures/);
});

test('rejects invalid aggregation and out-of-range histogram bin counts', () => {
  assert.match(validateVisualizationConfig('bar', {dimensions: ['month'], measures: measure('revenue', 'median')}, dataset), /Aggregation/);
  assert.match(validateVisualizationConfig('histogram', {histogramColumn: 'revenue', bins: 101}, dataset), /between 2 and 100/);
});

test('rejects missing required values and empty table selections', () => {
  assert.match(validateVisualizationConfig('pie', {dimensions: ['country'], measures: []}, dataset), /at least one numeric measure/);
  assert.match(validateVisualizationConfig('table', {columns: []}, dataset), /at least one table column/);
  assert.match(validateVisualizationConfig('scatter', {xColumn: 'units'}, dataset), /Y axis/);
});


test('map chart requires a geographic role and valid numeric measure', () => {
  const query = {geographicColumn: 'country', mapId: 'north-america-countries', measureColumn: 'revenue', aggregation: 'sum', columns: ['country', 'revenue']};
  assert.equal(validateVisualizationConfig('map', query, geographicDataset), '');
  assert.match(validateVisualizationConfig('map', query, dataset), /geographic role/);
  assert.match(validateVisualizationConfig('map', {...query, measureColumn: 'month'}, geographicDataset), /numeric/);
  assert.match(validateVisualizationConfig('map', {...query, mapId: ''}, geographicDataset), /Choose a map/);
});
