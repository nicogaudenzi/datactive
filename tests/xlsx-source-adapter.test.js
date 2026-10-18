import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import {XlsxSourceAdapter} from '../src/data/xlsx.js';
import {DataSourceRegistry} from '../src/data/data-source-registry.js';

function workbookFile(name = 'workbook.xlsx', sheets = {Data: [['Name', 'Code', 'Amount'], [' Mexico ', '001', 12], ['Canada', null, 0]], Other: [['Label'], ['second']]}) {
  const workbook = XLSX.utils.book_new();
  for (const [sheetName, matrix] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(matrix), sheetName);
  }
  const bytes = XLSX.write(workbook, {type: 'array', bookType: 'xlsx'});
  return {name, arrayBuffer: async () => bytes};
}

test('XLSX adapter returns raw worksheet values and source metadata', async () => {
  const adapter = new XlsxSourceAdapter();
  const result = await adapter.loadFile(workbookFile());
  assert.deepEqual(result.sheetNames, ['Data', 'Other']);
  assert.equal(result.selectedSheet, 'Data');
  assert.deepEqual(result.table.columns, ['Name', 'Code', 'Amount']);
  assert.deepEqual(result.table.rows, [
    {Name: ' Mexico ', Code: '001', Amount: 12},
    {Name: 'Canada', Code: null, Amount: 0}
  ]);
  assert.deepEqual(result.table.source, {type: 'xlsx', reference: 'workbook.xlsx', sheetName: 'Data'});
});

test('XLSX adapter can select a worksheet and rejects invalid workbook structures', async () => {
  const adapter = new XlsxSourceAdapter();
  const file = workbookFile();
  const other = await adapter.loadFile(file, {sheetName: 'Other'});
  assert.deepEqual(other.table.columns, ['Label']);
  assert.deepEqual(other.table.rows, [{Label: 'second'}]);
  await assert.rejects(adapter.loadFile(file, {sheetName: 'Missing'}), /was not found/);
  await assert.rejects(adapter.loadFile({name: 'notes.txt', arrayBuffer: async () => new ArrayBuffer(0)}), /supported Excel workbook/);
  await assert.rejects(adapter.loadFile({name: 'bad.xlsx', arrayBuffer: async () => new ArrayBuffer(0)}), /Could not read the Excel workbook/);
});

test('registry delegates XLSX file loading and worksheet options to its adapter', async () => {
  const registry = new DataSourceRegistry().register(new XlsxSourceAdapter());
  const result = await registry.loadFile('xlsx', workbookFile(), {sheetName: 'Other'});
  assert.equal(result.selectedSheet, 'Other');
  assert.deepEqual(result.table.columns, ['Label']);
});
