import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDashboardState, reconcileDashboardVisualizations} from '../src/dashboard/dashboard-state.js';

const dataset = {columns: ['region', 'revenue']};
const charts = [
  {id: 'chart-1', type: 'bar', title: 'Revenue by region', query: {dimensions: ['region'], measures: [{column: 'revenue', aggregation: 'sum'}]}, layout: {x: 0, y: 0, w: 6, h: 5}},
  {id: 'chart-2', type: 'table', title: 'Derived column table', query: {columns: ['region', 'old_derived']}, layout: {x: 6, y: 0, w: 6, h: 5}}
];

function validate(type, query) {
  if (type === 'bar') return query.dimensions[0] === 'region' && query.measures[0].column === 'revenue' ? '' : 'Missing chart column.';
  if (type === 'table') return query.columns.every(column => dataset.columns.includes(column)) ? '' : 'Every selected table column must exist in the current dataset.';
  return 'Unsupported chart type.';
}

test('schema reconciliation preserves valid charts and removes only charts referencing removed columns', () => {
  const result = reconcileDashboardVisualizations(charts, dataset, validate);
  assert.deepEqual(result.valid.map(chart => chart.id), ['chart-1']);
  assert.equal(result.removed.length, 1);
  assert.equal(result.removed[0].title, 'Derived column table');
  assert.match(result.removed[0].reason, /column must exist/);
});

test('schema reconciliation rejects duplicate chart identifiers without dropping unrelated charts', () => {
  const result = reconcileDashboardVisualizations([charts[0], {...charts[0], title: 'Duplicate'}], dataset, validate);
  assert.deepEqual(result.valid.map(chart => chart.title), ['Revenue by region']);
  assert.match(result.removed[0].reason, /duplicate chart identifier/);
});

test('dashboard state parser accepts the current version and rejects malformed or unsupported state', () => {
  assert.deepEqual(parseDashboardState(JSON.stringify({version: 1, visualizations: charts})), {version: 1, visualizations: charts});
  assert.equal(parseDashboardState('{bad json'), null);
  assert.equal(parseDashboardState(JSON.stringify({version: 2, visualizations: charts})), null);
  assert.equal(parseDashboardState(JSON.stringify({version: 1, visualizations: {}})), null);
});
