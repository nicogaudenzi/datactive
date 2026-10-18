import test from 'node:test';
import assert from 'node:assert/strict';
import {DataSourceAdapter, validateRawTable} from '../src/data/data-source.js';
import {DataPreparationPipeline, createDefaultPreparationPipeline} from '../src/data/preparation/pipeline.js';

test('source adapter contract requires an implementation of load', async () => {
  assert.throws(() => new DataSourceAdapter('example'), /abstract contract/);
  class ExampleAdapter extends DataSourceAdapter {}
  const adapter = new ExampleAdapter('example');
  await assert.rejects(adapter.load('source.csv'), /must implement load/);
});

test('raw-table validation copies rows and columns without coercing values', () => {
  const original = {columns: ['Name', 'Value'], rows: [{Name: ' Mexico ', Value: ''}]};
  const table = validateRawTable(original);
  assert.deepEqual(table.columns, ['Name', 'Value']);
  assert.equal(table.rows[0].Name, ' Mexico ');
  assert.equal(table.rows[0].Value, '');
  assert.notEqual(table.rows, original.rows);
  assert.notEqual(table.rows[0], original.rows[0]);
});

test('raw-table validation rejects malformed adapter output', () => {
  assert.throws(() => validateRawTable(null), /raw table object/);
  assert.throws(() => validateRawTable({columns: 'Name', rows: []}), /columns must be an array/);
  assert.throws(() => validateRawTable({columns: ['Name'], rows: [null]}), /row 1 must be an object/);
});

test('default preparation pipeline preserves values and derives current dataset metadata', async () => {
  const raw = {columns: ['Country', 'Revenue', 'Date'], rows: [
    {Country: 'Mexico', Revenue: '12', Date: '2025-01-01'},
    {Country: 'México ', Revenue: '', Date: '2025-02-01'}
  ], source: {type: 'fixture', reference: 'memory'}};
  const dataset = await createDefaultPreparationPipeline().run(raw);
  assert.equal(dataset.rows[1].Country, 'México ');
  assert.equal(dataset.rows[1].Revenue, '');
  const {getMeasureColumns, getDateColumns, getDimensionColumns} = await import('../src/data/dataset-schema.js');
  assert.deepEqual(getMeasureColumns(dataset), ['Revenue']);
  assert.deepEqual(getDateColumns(dataset), ['Date']);
  assert.deepEqual(getDimensionColumns(dataset), ['Country', 'Date']);
  assert.equal(dataset.columnMetadata.Revenue.type, 'number');
  assert.equal(dataset.columnMetadata.Date.type, 'date');
});

test('preparation steps run in order and must return a valid raw table', async () => {
  const calls = [];
  const pipeline = new DataPreparationPipeline({steps: [
    async table => { calls.push('first'); return {...table, rows: table.rows.map(row => ({...row, Name: row.Name.trim()}))}; },
    async table => { calls.push('second'); return {...table, columns: [...table.columns, 'Flag'], rows: table.rows.map(row => ({...row, Flag: 'ok'}))}; }
  ]});
  const dataset = await pipeline.run({columns: ['Name'], rows: [{Name: ' x '}]});
  assert.deepEqual(calls, ['first', 'second']);
  assert.equal(dataset.rows[0].Name, 'x');
  assert.equal(dataset.rows[0].Flag, 'ok');
  assert.throws(() => new DataPreparationPipeline({steps: ['not a function']}), /array of functions/);
});

test('canonical dataset exposes a versioned contract and per-column quality metadata', async () => {
  const dataset = await createDefaultPreparationPipeline().run({
    columns: ['Country', 'Revenue', 'Date'],
    rows: [
      {Country: 'Mexico', Revenue: '12', Date: '2025-01-01'},
      {Country: '', Revenue: '', Date: '2025-02-01'}
    ],
    source: {type: 'fixture', reference: 'memory'}
  });
  assert.equal(dataset.kind, 'canonical-dataset');
  assert.equal(dataset.version, 1);
  assert.equal(dataset.rowCount, 2);
  assert.deepEqual(dataset.columnMetadata.Country, {type: 'string', role: 'dimension', nullable: true, missingCount: 1});
  assert.deepEqual(dataset.columnMetadata.Revenue, {type: 'number', role: 'measure', nullable: true, missingCount: 1});
  assert.equal(dataset.source.type, 'fixture');
});

test('canonical dataset validation rejects unsupported versions and inconsistent row counts', async () => {
  const {validateCanonicalDataset} = await import('../src/data/dataset-schema.js');
  const dataset = await createDefaultPreparationPipeline().run({columns: ['Value'], rows: [{Value: '1'}]});
  assert.throws(() => validateCanonicalDataset({...dataset, version: 99}), /Unsupported canonical dataset version/);
  assert.throws(() => validateCanonicalDataset({...dataset, rowCount: 2}), /rowCount must match/);
});

test('canonical dataset validation rejects duplicate columns and invalid metadata', async () => {
  const {validateCanonicalDataset} = await import('../src/data/dataset-schema.js');
  const dataset = await createDefaultPreparationPipeline().run({columns: ['Value'], rows: [{Value: '1'}]});
  assert.throws(() => validateCanonicalDataset({...dataset, columns: ['Value', 'Value']}), /columns must be unique/);
  assert.throws(() => validateCanonicalDataset({...dataset, columnMetadata: {...dataset.columnMetadata, Value: {...dataset.columnMetadata.Value, role: 'mystery'}}}), /invalid role/);
});

test('canonical dataset exposes metadata as the single source of column roles and types', async () => {
  const dataset = await createDefaultPreparationPipeline().run({
    columns: ['Measure', 'Mixed', 'Date', 'Empty'],
    rows: [
      {Measure: '10', Mixed: '10', Date: '2025-01-01', Empty: ''},
      {Measure: '20', Mixed: 'word', Date: '2025-02-01', Empty: ''}
    ]
  });
  assert.equal('numericColumns' in dataset, false);
  assert.equal('dateColumns' in dataset, false);
  assert.equal('dimensionColumns' in dataset, false);
  const {getMeasureColumns, getDateColumns, getDimensionColumns} = await import('../src/data/dataset-schema.js');
  assert.deepEqual(getMeasureColumns(dataset), ['Measure']);
  assert.deepEqual(getDateColumns(dataset), ['Date']);
  assert.deepEqual(getDimensionColumns(dataset), ['Mixed', 'Date']);
  assert.equal(dataset.columnMetadata.Empty.type, 'unknown');
  assert.equal(dataset.columnMetadata.Empty.role, 'ignore');
});

test('derived-column transformation is reusable and preserves source values', async () => {
  const {deriveColumn} = await import('../src/data/preparation/transforms.js');
  const dataset = await new DataPreparationPipeline({steps: [deriveColumn({
    name: 'Month', sourceColumns: 'Date', derive: value => value.slice(0, 7)
  })]}).run({columns: ['Date'], rows: [{Date: '2025-04-19'}]});
  assert.deepEqual(dataset.columns, ['Date', 'Month']);
  assert.deepEqual(dataset.rows, [{Date: '2025-04-19', Month: '2025-04'}]);
  assert.equal(dataset.columnMetadata.Month.type, 'string');
  const invalidStep = deriveColumn({name: 'X', sourceColumns: 'missing', derive: value => value});
  await assert.rejects(new DataPreparationPipeline({steps: [invalidStep]}).run({columns: ['Date'], rows: []}), /source column/);
});

test('serializable preparation definitions replay from raw input without mutating it', async () => {
  const {replayTransformationDefinitions, createTransformationProvenance} = await import('../src/data/preparation/transform-registry.js');
  const raw = {columns: ['Date', 'Value'], rows: [{Date: '2025-04-19', Value: ' 7 '}, {Date: '', Value: '9'}], source: {type: 'fixture'}};
  const snapshot = structuredClone(raw);
  const definitions = [{id: 'month-from-date', type: 'derive-month', sourceColumn: 'Date', targetColumn: 'Month'}];
  const first = replayTransformationDefinitions(raw, definitions);
  const second = replayTransformationDefinitions(raw, JSON.parse(JSON.stringify(definitions)));
  assert.deepEqual(raw, snapshot);
  assert.deepEqual(first.table, second.table);
  assert.deepEqual(first.table.columns, ['Date', 'Value', 'Month']);
  assert.deepEqual(first.table.rows.map(row => row.Month), ['2025-04', '']);
  assert.deepEqual(createTransformationProvenance(definitions), [{order: 1, id: 'month-from-date', type: 'derive-month', parameters: {sourceColumn: 'Date', targetColumn: 'Month'}}]);
});

test('preparation pipeline exposes ordered provenance and can rebuild after definitions change', async () => {
  const raw = {columns: ['Date', 'Value'], rows: [{Date: '2025-04-19', Value: '7'}]};
  const original = structuredClone(raw);
  const first = await new DataPreparationPipeline({definitions: [{id: 'month', type: 'derive-month', sourceColumn: 'Date', targetColumn: 'Month'}]}).run(raw);
  const second = await new DataPreparationPipeline().run(raw);
  assert.deepEqual(raw, original);
  assert.deepEqual(first.rows[0], {Date: '2025-04-19', Value: '7', Month: '2025-04'});
  assert.equal(first.preparation.transformations.length, 1);
  assert.equal(first.preparation.transformations[0].order, 1);
  assert.deepEqual(second.columns, ['Date', 'Value']);
  assert.deepEqual(second.preparation.transformations, []);
});

test('serializable transformations reject unknown types, duplicate ids, and missing source columns', async () => {
  const {validateTransformationDefinitions} = await import('../src/data/preparation/transform-registry.js');
  assert.throws(() => validateTransformationDefinitions([{id: 'x', type: 'unknown'}]), /Unsupported transformation type/);
  assert.throws(() => validateTransformationDefinitions([
    {id: 'x', type: 'derive-month', sourceColumn: 'Date', targetColumn: 'Month'},
    {id: 'x', type: 'derive-month', sourceColumn: 'Date', targetColumn: 'Month2'}
  ]), /Duplicate transformation id/);
  assert.throws(() => validateTransformationDefinitions([{id: 'x', type: 'derive-month', sourceColumn: 'Missing', targetColumn: 'Month'}], ['Date']), /missing column/);
});
