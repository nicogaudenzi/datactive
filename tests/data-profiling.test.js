import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanonicalDataset} from '../src/data/dataset-schema.js';
import {profileColumn, profileDataset} from '../src/data/profiling.js';

function dataset(columns, rows) {
  return createCanonicalDataset({columns, rows});
}

test('profiles dataset and columns with counts and inferred metadata', () => {
  const profile = profileDataset(dataset(['Country', 'Revenue'], [
    {Country: 'Mexico', Revenue: '10'},
    {Country: 'Canada', Revenue: '20'},
    {Country: 'Mexico', Revenue: ''}
  ]));
  assert.equal(profile.kind, 'dataset-profile');
  assert.equal(profile.version, 1);
  assert.equal(profile.rowCount, 3);
  assert.equal(profile.columnCount, 2);
  assert.equal(profile.columns[0].name, 'Country');
  assert.equal(profile.columns[0].distinctCount, 2);
  assert.equal(profile.columns[1].inferredType, 'number');
  assert.equal(profile.columns[1].missingCount, 1);
});

test('counts null, undefined, empty and whitespace-only cells as missing', () => {
  const profile = profileColumn(dataset(['Value'], [
    {Value: null}, {}, {Value: ''}, {Value: '   '}, {Value: 0}
  ]), 'Value');
  assert.equal(profile.rowCount, 5);
  assert.equal(profile.populatedCount, 1);
  assert.equal(profile.missingCount, 4);
  assert.equal(profile.missingPercent, 80);
  assert.equal(profile.typeDistribution.number, 1);
  assert.equal(profile.typeDistribution.missing, 4);
});

test('reports mixed value types and preserves examples of unexpected values', () => {
  const profile = profileColumn(dataset(['Amount'], [
    {Amount: '10'}, {Amount: 'oops'}, {Amount: 12}, {Amount: true}, {Amount: '  '}
  ]), 'Amount');
  assert.equal(profile.inferredType, 'string');
  assert.deepEqual(profile.typeDistribution, {
    missing: 1, number: 1, numericString: 1, dateString: 0, string: 1, boolean: 1, other: 0
  });
  assert.deepEqual(profile.examples.string, ['oops']);
  assert.deepEqual(profile.examples.numericString, ['10']);
  assert.equal(profile.numericStats.count, 2);
});

test('computes numeric count, min, max, mean and median from numeric values and numeric strings', () => {
  const profile = profileColumn(dataset(['Value'], [
    {Value: '1'}, {Value: 3}, {Value: '5'}, {Value: ''}
  ]), 'Value');
  assert.deepEqual(profile.numericStats, {count: 3, min: 1, max: 5, mean: 3, median: 3});
});

test('reports valid ISO date strings separately and provides date bounds', () => {
  const profile = profileColumn(dataset(['Date'], [
    {Date: '2025-03-02'}, {Date: '2025-01-01'}, {Date: 'not-a-date'}, {Date: ''}
  ]), 'Date');
  assert.equal(profile.typeDistribution.dateString, 2);
  assert.equal(profile.typeDistribution.string, 1);
  assert.deepEqual(profile.dateStats, {min: '2025-01-01', max: '2025-03-02'});
});

test('preserves exact categorical values when counting distinct values', () => {
  const profile = profileColumn(dataset(['Country'], [
    {Country: 'Mexico'}, {Country: 'México'}, {Country: 'mexico '}, {Country: 'Mexico'}, {Country: ''}
  ]), 'Country');
  assert.equal(profile.distinctCount, 3);
  assert.deepEqual(profile.examples.string, ['Mexico', 'México', 'mexico ']);
});

test('empty datasets and entirely missing columns return stable zero-value summaries', () => {
  const empty = profileColumn(dataset(['Empty'], []), 'Empty');
  assert.equal(empty.rowCount, 0);
  assert.equal(empty.missingPercent, 0);
  assert.equal(empty.distinctCount, 0);
  assert.equal(empty.numericStats, null);
  const missing = profileColumn(dataset(['Empty'], [{Empty: ''}, {}]), 'Empty');
  assert.equal(missing.missingCount, 2);
  assert.equal(missing.numericStats, null);
});

test('rejects requests to profile a column that does not exist', () => {
  assert.throws(() => profileColumn(dataset(['Known'], [{Known: 1}]), 'Unknown'), /unknown column/);
});

test('profiling does not mutate the canonical dataset or its values', () => {
  const source = {columns: ['Country', 'Value'], rows: [{Country: ' Mexico ', Value: '01'}, {Country: '', Value: 'bad'}]};
  const prepared = createCanonicalDataset(source);
  const before = structuredClone(prepared);
  profileDataset(prepared);
  assert.deepEqual(prepared, before);
  assert.equal(prepared.rows[0].Country, ' Mexico ');
  assert.equal(prepared.rows[0].Value, '01');
});

test('equivalent canonical datasets from different source adapters produce equivalent profiles', () => {
  const csvShaped = dataset(['Category', 'Value'], [
    {Category: 'A', Value: '2'}, {Category: 'B', Value: '4'}, {Category: '', Value: 'bad'}
  ]);
  const spreadsheetShaped = dataset(['Category', 'Value'], [
    {Category: 'A', Value: '2'}, {Category: 'B', Value: '4'}, {Category: '', Value: 'bad'}
  ]);
  assert.deepEqual(profileDataset(csvShaped), profileDataset(spreadsheetShaped));
});
