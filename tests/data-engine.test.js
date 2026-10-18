import test from 'node:test';
import assert from 'node:assert/strict';
import {DataEngine} from '../src/engine/data-engine.js';

function engineWith(rows) {
  return new DataEngine({columns: ['country', 'month', 'revenue', 'date'], rows});
}

const sampleRows = [
  {country: 'US', month: 'Jan', revenue: '10', date: '2026-01-01'},
  {country: 'US', month: 'Feb', revenue: '20', date: '2026-02-01'},
  {country: 'MX', month: 'Jan', revenue: '30', date: '2026-01-15'},
  {country: 'CA', month: 'Mar', revenue: '40', date: '2026-03-01'}
];

test('filters on different columns combine with AND and in selects any listed value', () => {
  const engine = engineWith(sampleRows);
  engine.applyFilters([
    {column: 'country', operator: 'in', value: ['US', 'MX']},
    {column: 'month', operator: 'equals', value: 'Jan'}
  ]);
  assert.deepEqual(engine.filteredRows().map(row => row.country), ['US', 'MX']);
});

test('equals and in compare non-null values consistently across string and number types', () => {
  const engine = engineWith([{kind: 1}, {kind: '2'}, {kind: null}, {kind: ''}]);
  engine.applyFilters([{column: 'kind', operator: 'equals', value: '1'}]);
  assert.deepEqual(engine.filteredRows(), [{kind: 1}]);
  engine.applyFilters([{column: 'kind', operator: 'in', value: [2]}]);
  assert.deepEqual(engine.filteredRows(), [{kind: '2'}]);
});

test('numeric ranges exclude null, undefined, empty strings, and non-numeric values rather than treating them as zero', () => {
  const engine = engineWith([
    {revenue: 0}, {revenue: '0'}, {revenue: ''}, {revenue: null}, {},
    {revenue: 'not-a-number'}, {revenue: -1}, {revenue: '2'}
  ]);
  engine.applyFilters([{column: 'revenue', operator: 'range', value: [0, 0]}]);
  assert.deepEqual(engine.filteredRows().map(row => row.revenue), [0, '0']);
});

test('numeric range endpoints are inclusive and reversed endpoints are not silently reinterpreted', () => {
  const engine = engineWith([{n: '1'}, {n: '2'}, {n: '3'}]);
  engine.applyFilters([{column: 'n', operator: 'range', value: [1, 2]}]);
  assert.deepEqual(engine.filteredRows().map(row => row.n), ['1', '2']);
  engine.applyFilters([{column: 'n', operator: 'range', value: [3, 1]}]);
  assert.deepEqual(engine.filteredRows(), []);
});

test('date ranges include both endpoints and exclude missing or invalid dates', () => {
  const engine = engineWith([
    {date: '2026-01-01'}, {date: '2026-01-02'}, {date: '2026-01-03'},
    {date: ''}, {date: null}, {date: 'not-a-date'}, {}
  ]);
  const start = Date.parse('2026-01-01T00:00:00Z');
  const end = Date.parse('2026-01-02T23:59:59Z');
  engine.applyFilters([{column: 'date', operator: 'dateRange', value: [start, end]}]);
  assert.deepEqual(engine.filteredRows().map(row => row.date), ['2026-01-01', '2026-01-02']);
});

test('empty datasets and queries with no matching rows return stable empty results', () => {
  const empty = engineWith([]);
  assert.deepEqual(empty.filteredRows(), []);
  assert.deepEqual(empty.query({columns: ['country', 'revenue']}), []);
  const engine = engineWith(sampleRows);
  engine.applyFilters([{column: 'country', operator: 'equals', value: 'ZZ'}]);
  assert.deepEqual(engine.filteredRows(), []);
  assert.deepEqual(engine.query({columns: ['country', 'revenue']}), []);
  assert.deepEqual(engine.query({dimensions: ['country'], measures: [{column: 'revenue', aggregation: 'sum'}]}), []);
});

test('aggregate-only query over an empty filtered result returns zero for supported numeric aggregations', () => {
  const engine = engineWith(sampleRows);
  engine.applyFilters([{column: 'country', operator: 'equals', value: 'ZZ'}]);
  assert.deepEqual(engine.query({measures: [
    {column: 'revenue', aggregation: 'sum'},
    {column: 'revenue', aggregation: 'average'}
  ]}), [{revenue: 0}]);
});

test('filtered rows are reused until the effective filter state changes', () => {
  let scans = 0;
  const rows = sampleRows.slice();
  const originalFilter = rows.filter.bind(rows);
  rows.filter = predicate => {
    scans++;
    return originalFilter(predicate);
  };
  const engine = new DataEngine({columns: ['country', 'month', 'revenue', 'date'], rows});

  engine.filteredRows();
  engine.filteredRows();
  engine.query({columns: ['country', 'revenue']});
  assert.equal(scans, 0, 'unfiltered queries should reuse the canonical rows without scanning or copying them');

  const filters = [{column: 'country', operator: 'equals', value: 'US'}];
  engine.applyFilters(filters);
  engine.filteredRows();
  engine.applyFilters([{column: 'country', operator: 'equals', value: 'US'}]);
  engine.filteredRows();
  assert.equal(scans, 1, 'reapplying the same filter should preserve the cached result');

  engine.applyFilters([{column: 'country', operator: 'equals', value: 'MX'}]);
  assert.deepEqual(engine.filteredRows().map(row => row.country), ['MX']);
  assert.equal(scans, 2, 'a changed filter must invalidate the cached result');
});

test('changing one filter while preserving unrelated filters invalidates the query cache correctly', () => {
  const engine = engineWith(sampleRows);
  engine.applyFilters([
    {column: 'country', operator: 'in', value: ['US', 'MX']},
    {column: 'month', operator: 'equals', value: 'Jan'}
  ]);
  assert.deepEqual(engine.filteredRows().map(row => row.country), ['US', 'MX']);

  engine.applyFilters([
    {column: 'country', operator: 'in', value: ['US', 'MX']},
    {column: 'month', operator: 'equals', value: 'Feb'}
  ]);
  assert.deepEqual(engine.filteredRows().map(row => row.country), ['US']);
});


test('histogram aggregation takes precedence over stale column projections', () => {
  const engine = engineWith(sampleRows);
  const result = engine.query({histogramColumn: 'revenue', bins: 4, columns: ['month']});
  assert.equal(result.column, 'revenue');
  assert.equal(result.bins.length, 4);
  assert.equal(result.bins.reduce((sum, bin) => sum + bin.count, 0), sampleRows.length);
  assert.deepEqual(result.domain, [10, 40]);
});


test('raw-row table queries reuse canonical row objects instead of projecting every cell', () => {
  const engine = engineWith(sampleRows);
  const rows = engine.query({columns: ['country', 'revenue'], rawRows: true});
  assert.equal(rows, sampleRows, 'unfiltered raw-row queries should reuse the original row array');
  assert.equal(rows[0], sampleRows[0], 'table rows should not be cloned');
});
