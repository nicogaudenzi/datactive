import test from 'node:test';
import assert from 'node:assert/strict';
import {DataEngine} from '../src/engine/data-engine.js';

const ROW_COUNT = 147_209;

function makeLargeDataset(count = ROW_COUNT) {
  const regions = ['North', 'South', 'East', 'West'];
  const rows = Array.from({length: count}, (_, index) => ({
    id: index + 1,
    region: regions[index % regions.length],
    amount: String((index % 997) + 1),
    year: String(2020 + (index % 5)),
    note: index % 17 === 0 ? '' : `record-${index + 1}`
  }));
  return {columns: ['id', 'region', 'amount', 'year', 'note'], rows};
}

test('large dataset regression preserves all rows and returns exact filter and aggregation results', {timeout: 30_000}, t => {
  const buildStarted = performance.now();
  const dataset = makeLargeDataset();
  const buildMs = performance.now() - buildStarted;
  const engine = new DataEngine(dataset);

  const unfilteredStarted = performance.now();
  const allRows = engine.query({columns: dataset.columns, rawRows: true});
  const unfilteredMs = performance.now() - unfilteredStarted;
  assert.equal(allRows, dataset.rows, 'unfiltered table query must reuse the canonical rows');
  assert.equal(allRows.length, ROW_COUNT, 'the full dataset must remain available');
  assert.equal(allRows[0].id, 1);
  assert.equal(allRows.at(-1).id, ROW_COUNT);

  const filterStarted = performance.now();
  engine.applyFilters([{column: 'region', operator: 'equals', value: 'North'}]);
  const northRows = engine.filteredRows();
  const filterMs = performance.now() - filterStarted;
  assert.equal(northRows.length, Math.ceil(ROW_COUNT / 4));
  assert.ok(northRows.every(row => row.region === 'North'));
  assert.equal(northRows[0].id, 1);

  const aggregateStarted = performance.now();
  const summary = engine.query({dimensions: ['region'], measures: [{column: 'amount', aggregation: 'sum'}]});
  const aggregateMs = performance.now() - aggregateStarted;
  assert.deepEqual(summary, [{region: 'North', amount: northRows.reduce((sum, row) => sum + Number(row.amount), 0)}]);

  engine.applyFilters([]);
  assert.equal(engine.filteredRows().length, ROW_COUNT, 'clearing filters must restore all rows');

  // Report measurements for comparison between developer machines without making
  // the test flaky by asserting absolute wall-clock thresholds.
  t.diagnostic(`large-dataset benchmark (${ROW_COUNT.toLocaleString()} rows): build=${buildMs.toFixed(1)}ms, unfiltered-query=${unfilteredMs.toFixed(1)}ms, filter=${filterMs.toFixed(1)}ms, aggregate=${aggregateMs.toFixed(1)}ms`);
});
