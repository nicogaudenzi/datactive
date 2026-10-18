import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCsvColumns} from '../src/data/csv-validation.js';
import {CsvSourceAdapter} from '../src/data/csv.js';
import {DataSourceRegistry} from '../src/data/data-source-registry.js';

test('CSV header validation preserves original names and accepts valid columns', () => {
  assert.deepEqual(validateCsvColumns([' Name ', 'Value']), [' Name ', 'Value']);
});

test('CSV header validation rejects missing, blank and duplicate column names', () => {
  assert.throws(() => validateCsvColumns([]), /header row/);
  assert.throws(() => validateCsvColumns(['', 'Value']), /empty column name/);
  assert.throws(() => validateCsvColumns(['', '']), /header row/);
  assert.throws(() => validateCsvColumns(['Value', 'Value']), /duplicate column names/);
});


test('CSV adapter loads URL content and returns raw strings without cleaning', async () => {
  const adapter = new CsvSourceAdapter({fetchImpl: async (url, options) => {
    assert.equal(url, 'https://example.test/data.csv');
    assert.equal(options.headers.Accept, 'text/csv,text/plain,*/*');
    return {ok: true, text: async () => 'Name,Value\n" Mexico ",001'};
  }});
  const result = await adapter.loadResource('https://example.test/data.csv');
  assert.equal(result.text, 'Name,Value\n" Mexico ",001');
  assert.deepEqual(result.table.columns, ['Name', 'Value']);
  assert.deepEqual(result.table.rows, [{Name: ' Mexico ', Value: '001'}]);
  assert.deepEqual(result.table.source, {type: 'csv', reference: 'https://example.test/data.csv'});
});

test('CSV adapter reads local files and validates HTTP errors', async () => {
  const adapter = new CsvSourceAdapter({fetchImpl: async () => ({ok: false, status: 404})});
  const fileResult = await adapter.loadFile({name: 'sample.csv', text: async () => 'A\n1'});
  assert.equal(fileResult.table.rows[0].A, '1');
  assert.equal(fileResult.text, 'A\n1');
  await assert.rejects(adapter.loadResource('https://example.test/missing.csv'), /HTTP 404/);
  assert.throws(() => adapter.loadText('A,A\n1,2'), /duplicate column names/);
});

test('source registry resolves adapters and rejects duplicate or unsupported types', async () => {
  const adapter = new CsvSourceAdapter({fetchImpl: async () => ({ok: true, text: async () => 'A\n1'})});
  const registry = new DataSourceRegistry().register(adapter);
  assert.equal(registry.get('csv'), adapter);
  assert.equal((await registry.load('csv', 'https://example.test/a.csv')).rows[0].A, '1');
  assert.throws(() => registry.register(new CsvSourceAdapter()), /already registered/);
  assert.throws(() => registry.get('xlsx'), /Unsupported data source type/);
});

test('CSV adapter owns URL normalization and suggested import filename', async () => {
  let requestedUrl;
  const adapter = new CsvSourceAdapter({fetchImpl: async url => {
    requestedUrl = url;
    return {ok: true, text: async () => 'Value\n001'};
  }});
  const result = await adapter.loadResource(' https://example.test/reports/monthly%20sales ');
  assert.equal(requestedUrl, 'https://example.test/reports/monthly%20sales');
  assert.equal(result.reference, requestedUrl);
  assert.equal(result.name, 'monthly sales.csv');
  await assert.rejects(adapter.loadResource('not a URL'), /valid URL/);
  await assert.rejects(adapter.loadResource('file:///tmp/data.csv'), /Only HTTP and HTTPS/);
});

test('CSV adapter validates local file type before reading it', async () => {
  const adapter = new CsvSourceAdapter();
  let read = false;
  await assert.rejects(adapter.loadFile({name: 'data.xlsx', type: '', text: async () => { read = true; return 'A\n1'; }}), /Choose a \.csv file/);
  assert.equal(read, false);
  const result = await adapter.loadFile({name: 'data.csv', type: '', text: async () => 'A\n1'});
  assert.equal(result.name, 'data.csv');
  assert.equal(result.table.rows[0].A, '1');
});


test('CSV adapter can avoid retaining the source text for large local files', async () => {
  const adapter = new CsvSourceAdapter();
  const result = await adapter.loadFile({name: 'large.csv', type: 'text/csv', text: async () => 'A,B\n1,2'}, {retainText: false});
  assert.equal(result.name, 'large.csv');
  assert.equal(Object.hasOwn(result, 'text'), false);
  assert.deepEqual(result.table.rows, [{A: '1', B: '2'}]);
});
