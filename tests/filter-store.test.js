import test from 'node:test';
import assert from 'node:assert/strict';
import {FilterStore} from '../src/state/filter-store.js';

const country = value => ({column: 'country', operator: 'equals', value});
const month = value => ({column: 'month', operator: 'equals', value});

test('setFilter replaces only the filter for the same column and clones array values', () => {
  const store = new FilterStore();
  const values = ['US', 'CA'];
  store.setFilter({column: 'country', operator: 'in', value: values});
  store.setFilter(month('Jan'));
  store.setFilter({column: 'country', operator: 'in', value: ['MX']});
  values.push('MX');
  assert.deepEqual(store.getFilters(), [month('Jan'), {column: 'country', operator: 'in', value: ['MX']}]);
});

test('toggleFilter removes an identical selection and replaces a different selection', () => {
  const store = new FilterStore();
  store.toggleFilter(country('US'));
  store.toggleFilter(country('MX'));
  assert.deepEqual(store.getFilters(), [country('MX')]);
  store.toggleFilter(country('MX'));
  assert.deepEqual(store.getFilters(), []);
});

test('toggleFilter compares array selections independent of order', () => {
  const store = new FilterStore();
  store.toggleFilter({column: 'country', operator: 'in', value: ['US', 'CA']});
  store.toggleFilter({column: 'country', operator: 'in', value: ['CA', 'US']});
  assert.deepEqual(store.getFilters(), []);
});

test('removeFilter preserves other filters and does not emit when nothing changed', () => {
  const store = new FilterStore();
  let emissions = 0;
  store.subscribe(() => emissions++);
  store.setFilter(country('US'));
  store.setFilter(month('Jan'));
  const beforeRemove = emissions;
  store.removeFilter('missing');
  assert.equal(emissions, beforeRemove);
  store.removeFilter('country');
  assert.deepEqual(store.getFilters(), [month('Jan')]);
  assert.equal(emissions, beforeRemove + 1);
});

test('clear empties all filters and emits an empty snapshot', () => {
  const store = new FilterStore();
  const snapshots = [];
  store.subscribe(filters => snapshots.push(filters));
  store.setFilter(country('US'));
  store.setFilter(month('Jan'));
  store.clear();
  assert.deepEqual(store.getFilters(), []);
  assert.deepEqual(snapshots.at(-1), []);
});

test('subscribers receive snapshots and unsubscribe stops future notifications', () => {
  const store = new FilterStore();
  const snapshots = [];
  const unsubscribe = store.subscribe(filters => {
    snapshots.push(filters);
    filters.push({column: 'injected', operator: 'equals', value: true});
  });
  store.setFilter(country('US'));
  assert.deepEqual(store.getFilters(), [country('US')]);
  unsubscribe();
  store.setFilter(month('Jan'));
  assert.equal(snapshots.length, 1);
  assert.deepEqual(store.getFilters(), [country('US'), month('Jan')]);
});

test('setFilter does not notify subscribers when the effective filter is unchanged', () => {
  const store = new FilterStore();
  let emissions = 0;
  store.subscribe(() => emissions++);

  store.setFilter({column: 'country', operator: 'in', value: ['US', 'CA']});
  store.setFilter({column: 'country', operator: 'in', value: ['CA', 'US']});

  assert.equal(emissions, 1);
  assert.deepEqual(store.getFilters(), [{column: 'country', operator: 'in', value: ['US', 'CA']}]);
});

test('clear does not notify subscribers when the store is already empty', () => {
  const store = new FilterStore();
  let emissions = 0;
  store.subscribe(() => emissions++);
  store.clear();
  assert.equal(emissions, 0);
});
