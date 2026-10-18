import test from 'node:test';
import assert from 'node:assert/strict';
import {geographyStorageKey, loadGeographyConfiguration, saveGeographyConfiguration} from '../../src/maps/geography-persistence.js';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    values
  };
}

const configuration = {
  version: 1,
  mappings: [{mapId: 'custom-regions', column: 'Region', values: [
    {sourceValue: 'North', regionId: 'north-01'},
    {sourceValue: 'South', regionId: 'south-02'}
  ]}]
};

test('geography storage keys are stable and scoped to source identity and columns', () => {
  assert.equal(geographyStorageKey('sales.csv', ['Region', 'Revenue']), geographyStorageKey('sales.csv', ['Region', 'Revenue']));
  assert.notEqual(geographyStorageKey('sales.csv', ['Region']), geographyStorageKey('other.csv', ['Region']));
  assert.notEqual(geographyStorageKey('sales.csv', ['Region']), geographyStorageKey('sales.csv', ['Region', 'Revenue']));
});

test('geography mappings round-trip through persistent storage', () => {
  const storage = memoryStorage();
  const key = geographyStorageKey('sales.csv', ['Region', 'Revenue']);
  assert.equal(saveGeographyConfiguration(key, configuration, ['Region', 'Revenue'], storage), true);
  assert.deepEqual(loadGeographyConfiguration(key, ['Region', 'Revenue'], storage), configuration);
});

test('invalid saved mappings are removed and return an empty configuration', () => {
  const key = geographyStorageKey('sales.csv', ['Region']);
  const storage = memoryStorage({[key]: JSON.stringify({version: 99, mappings: []})});
  assert.deepEqual(loadGeographyConfiguration(key, ['Region'], storage), {version: 1, mappings: []});
  assert.equal(storage.getItem(key), null);
});

test('saving rejects unknown source columns without overwriting stored mappings', () => {
  const key = geographyStorageKey('sales.csv', ['Region']);
  const storage = memoryStorage({[key]: JSON.stringify(configuration)});
  assert.equal(saveGeographyConfiguration(key, configuration, ['Other'], storage), false);
  assert.equal(storage.getItem(key), JSON.stringify(configuration));
});

test('storage failures degrade safely', () => {
  const broken = {getItem() { throw new Error('blocked'); }, setItem() { throw new Error('full'); }, removeItem() { throw new Error('blocked'); }};
  const key = geographyStorageKey('sales.csv', ['Region']);
  assert.equal(saveGeographyConfiguration(key, configuration, null, broken), false);
  assert.deepEqual(loadGeographyConfiguration(key, ['Region'], broken), {version: 1, mappings: []});
});
