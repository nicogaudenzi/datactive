import test from 'node:test';
import assert from 'node:assert/strict';
import {DataSourceRegistry} from '../src/data/data-source-registry.js';

function adapter(type = 'fixture') {
  return {
    type,
    async load(reference) { return {columns: ['Value'], rows: [{Value: reference}]}; },
    async loadResource(reference) { return {table: await this.load(reference), text: String(reference)}; },
    async loadFile(file) { return {table: await this.load(file.name), text: await file.text()}; },
    loadText(text, reference) { return {columns: ['Value'], rows: [{Value: text}], source: {type, reference}}; }
  };
}

test('registry loads through the registered adapter without changing the table contract', async () => {
  const source = adapter();
  const registry = new DataSourceRegistry().register(source);
  assert.equal(registry.get('fixture'), source);
  assert.deepEqual(await registry.load('fixture', 'memory'), {columns: ['Value'], rows: [{Value: 'memory'}]});
  assert.deepEqual(await registry.loadResource('fixture', 'remote'), {table: {columns: ['Value'], rows: [{Value: 'remote'}]}, text: 'remote'});
  assert.deepEqual(await registry.loadFile('fixture', {name: 'local.csv', text: async () => 'raw'}), {table: {columns: ['Value'], rows: [{Value: 'local.csv'}]}, text: 'raw'});
  assert.deepEqual(registry.loadText('fixture', 'raw', 'inline'), {columns: ['Value'], rows: [{Value: 'raw'}], source: {type: 'fixture', reference: 'inline'}});
});

test('registry rejects duplicate registrations, unsupported types, and missing optional capabilities', () => {
  const registry = new DataSourceRegistry().register(adapter());
  assert.throws(() => registry.register(adapter()), /already registered/);
  assert.throws(() => registry.get('xlsx'), /Unsupported data source type/);
  const minimal = new DataSourceRegistry().register({type: 'minimal', async load() { return {}; }});
  assert.throws(() => minimal.loadFile('minimal', {}), /does not support local file imports/);
  assert.throws(() => minimal.loadResource('minimal', 'url'), /does not support loading resources/);
  assert.throws(() => minimal.loadText('minimal', 'text'), /does not support loading text/);
});
