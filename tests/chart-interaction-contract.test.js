import test from 'node:test';
import assert from 'node:assert/strict';
import {applyChartInteraction, ChartInteraction, normalizeChartInteraction} from '../src/interactions/chart-interaction-contract.js';
import {FilterStore} from '../src/state/filter-store.js';
import {DataEngine} from '../src/engine/data-engine.js';

function setup() {
  const store = new FilterStore();
  const dataset = {columns: ['country', 'month', 'revenue'], rows: [
    {country: 'US', month: 'Jan', revenue: 10},
    {country: 'US', month: 'Feb', revenue: 20},
    {country: 'MX', month: 'Jan', revenue: 30},
    {country: 'CA', month: 'Mar', revenue: 40}
  ]};
  const engine = new DataEngine(dataset);
  store.subscribe(filters => engine.applyFilters(filters));
  return {store, engine};
}

test('category click adds a filter and clicking the same category toggles it off', () => {
  const {store, engine} = setup();
  assert.equal(applyChartInteraction(ChartInteraction.category('country', 'US'), store), true);
  assert.deepEqual(store.getFilters(), [{column: 'country', operator: 'equals', value: 'US'}]);
  assert.equal(engine.filteredRows().length, 2);
  applyChartInteraction(ChartInteraction.category('country', 'US'), store);
  assert.deepEqual(store.getFilters(), []);
  assert.equal(engine.filteredRows().length, 4);
});

test('categorical brush replaces selection and filters multiple categories', () => {
  const {store, engine} = setup();
  applyChartInteraction(ChartInteraction.categories('country', ['US', 'CA']), store);
  assert.deepEqual(store.getFilters()[0], {column: 'country', operator: 'in', value: ['US', 'CA']});
  assert.equal(engine.filteredRows().length, 3);
  applyChartInteraction(ChartInteraction.categories('country', ['MX']), store);
  assert.deepEqual(store.getFilters()[0].value, ['MX']);
  assert.equal(engine.filteredRows().length, 1);
});

test('numeric brush normalizes bounds and replaces existing filter', () => {
  const {store, engine} = setup();
  applyChartInteraction(ChartInteraction.numericRange('revenue', 35, 15), store);
  assert.deepEqual(store.getFilters()[0].value, [15, 35]);
  assert.deepEqual(engine.filteredRows().map(row => row.revenue), [20, 30]);
  applyChartInteraction(ChartInteraction.numericRange('revenue', 0, 100), store);
  assert.deepEqual(engine.filteredRows().map(row => row.revenue), [10, 20, 30, 40]);
});

test('compound selection applies all filters and clicking the same compound selection clears them', () => {
  const {store, engine} = setup();
  const compound = [ChartInteraction.category('country', 'US'), ChartInteraction.category('month', 'Jan')];
  applyChartInteraction(compound, store);
  assert.equal(store.getFilters().length, 2);
  assert.deepEqual(engine.filteredRows(), [{country: 'US', month: 'Jan', revenue: 10}]);
  applyChartInteraction(compound, store);
  assert.deepEqual(store.getFilters(), []);
  assert.equal(engine.filteredRows().length, 4);
});

test('explicit clear removes only the named filter', () => {
  const {store} = setup();
  applyChartInteraction(ChartInteraction.category('country', 'US'), store);
  applyChartInteraction(ChartInteraction.category('month', 'Jan'), store);
  applyChartInteraction(ChartInteraction.clear('country'), store);
  assert.deepEqual(store.getFilters(), [{column: 'month', operator: 'equals', value: 'Jan'}]);
});

test('filter-store subscription propagates interactions to other chart queries', () => {
  const {store, engine} = setup();
  let otherChartRows = engine.query({columns: ['country', 'revenue']});
  store.subscribe(filters => { engine.applyFilters(filters); otherChartRows = engine.query({columns: ['country', 'revenue']}); });
  applyChartInteraction(ChartInteraction.category('month', 'Jan'), store);
  assert.deepEqual(otherChartRows, [{country: 'US', revenue: 10}, {country: 'MX', revenue: 30}]);
  applyChartInteraction(ChartInteraction.clear('month'), store);
  assert.equal(otherChartRows.length, 4);
});

test('compound heatmap-style selection is atomic when payload validation fails', () => {
  const {store} = setup();
  const warnings = [];
  const ok = applyChartInteraction([
    ChartInteraction.category('country', 'US'),
    {column: 'month', operator: 'range', value: ['bad', 5]}
  ], store, (...args) => warnings.push(args));
  assert.equal(ok, false);
  assert.deepEqual(store.getFilters(), []);
  assert.equal(warnings.length, 1);
});

test('normalizer rejects unknown operators and sorts numeric range bounds', () => {
  assert.equal(normalizeChartInteraction({column: 'x', operator: 'magic', value: 1}), null);
  assert.deepEqual(normalizeChartInteraction({column: 'x', operator: 'range', value: [9, 2]}),
    {column: 'x', operator: 'range', value: [2, 9]});
});

test('map region click toggles its grouped source-value filter off on a repeated click', () => {
  const {store, engine} = setup();
  const region = {column: 'country', operator: 'in', value: ['US', 'USA'], toggle: true};
  applyChartInteraction(region, store);
  assert.deepEqual(store.getFilters(), [{column: 'country', operator: 'in', value: ['US', 'USA']}]);
  assert.equal(engine.filteredRows().length, 2);

  applyChartInteraction(region, store);
  assert.deepEqual(store.getFilters(), []);
  assert.equal(engine.filteredRows().length, 4);
});

test('map region click replaces a different active selection on the same column', () => {
  const {store} = setup();
  applyChartInteraction({column: 'country', operator: 'in', value: ['US'], toggle: true}, store);
  applyChartInteraction({column: 'country', operator: 'in', value: ['MX', 'MEX'], toggle: true}, store);
  assert.deepEqual(store.getFilters(), [{column: 'country', operator: 'in', value: ['MX', 'MEX']}]);
});
