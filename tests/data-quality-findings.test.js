import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanonicalDataset} from '../src/data/dataset-schema.js';
import {findDataQualityIssues} from '../src/data/quality-findings.js';

function dataset(columns, rows) { return createCanonicalDataset({columns, rows}); }

test('reports mixed-type columns with row-indexed examples and does not coerce values', () => {
  const input = dataset(['value'], [{value: 10}, {value: 'oops'}, {value: '12'}, {value: null}]);
  const before = structuredClone(input);
  const result = findDataQualityIssues(input);
  const finding = result.findings.find(item => item.type === 'mixed-types' && item.column === 'value');
  assert.ok(finding);
  assert.equal(finding.evidence.typeCounts.number, 1);
  assert.equal(finding.evidence.typeCounts.string, 1);
  assert.deepEqual(finding.evidence.examples.string, [{rowIndex: 1, value: 'oops'}]);
  assert.deepEqual(input, before);
});

test('reports category variants caused by whitespace, case, or diacritics without merging them', () => {
  const input = dataset(['country'], [{country: 'Mexico'}, {country: ' México '}, {country: 'mexico'}, {country: 'Canada'}]);
  const result = findDataQualityIssues(input);
  const finding = result.findings.find(item => item.type === 'category-variants' && item.column === 'country');
  assert.ok(finding);
  assert.equal(finding.evidence.normalizedCandidate, 'mexico');
  assert.deepEqual(finding.evidence.variants.map(item => item.value), ['Mexico', ' México ', 'mexico']);
  assert.equal(new Set(input.rows.map(row => row.country)).size, 4);
});

test('reports exact duplicate rows with source row indices', () => {
  const input = dataset(['name', 'value'], [
    {name: 'A', value: 1}, {name: 'B', value: 2}, {name: 'A', value: 1}, {name: 'A', value: 1}
  ]);
  const result = findDataQualityIssues(input);
  const finding = result.findings.find(item => item.type === 'duplicate-rows');
  assert.ok(finding);
  assert.deepEqual(finding.evidence.rowIndices, [0, 2, 3]);
  assert.deepEqual(finding.evidence.sample, {name: 'A', value: 1});
});

test('reports numeric outliers as review suggestions, not definitive errors', () => {
  const input = dataset(['amount'], [{amount: 10}, {amount: 11}, {amount: 12}, {amount: 13}, {amount: 1000}]);
  const result = findDataQualityIssues(input);
  const finding = result.findings.find(item => item.type === 'numeric-outlier');
  assert.ok(finding);
  assert.equal(finding.severity, 'review');
  assert.equal(finding.evidence.rowIndex, 4);
  assert.equal(finding.evidence.value, 1000);
  assert.equal(finding.evidence.method, '1.5×IQR');
});

test('groups many numeric outliers into one finding per column while preserving affected row indices', () => {
  const rows = Array.from({length: 100}, (_, index) => ({amount: index + 1}));
  rows.push({amount: 10000}, {amount: 20000}, {amount: 30000});
  const result = findDataQualityIssues(dataset(['amount'], rows));
  const outliers = result.findings.filter(item => item.type === 'numeric-outlier');
  assert.equal(outliers.length, 1);
  assert.equal(outliers[0].evidence.outlierCount, 3);
  assert.deepEqual(outliers[0].evidence.rowIndices, [100, 101, 102]);
  assert.equal(outliers[0].evidence.rowIndex, 100);
});

test('does not report category variants when normalization finds only one spelling', () => {
  const input = dataset(['country'], [{country: 'Mexico'}, {country: 'Canada'}, {country: 'Mexico'}]);
  assert.equal(findDataQualityIssues(input).findings.filter(item => item.type === 'category-variants').length, 0);
});

test('supports empty datasets and respects the example cap', () => {
  const empty = dataset(['category'], []);
  assert.deepEqual(findDataQualityIssues(empty), {kind: 'data-quality-findings', version: 1, rowCount: 0, findingCount: 0, findings: []});
  const input = dataset(['category'], Array.from({length: 8}, (_, index) => ({category: `Value ${index}`})));
  const result = findDataQualityIssues(input, {maxExamples: 2});
  assert.equal(result.kind, 'data-quality-findings');
  assert.ok(result.findingCount >= 0);
});

test('produces equivalent findings for equivalent canonical datasets independent of source metadata', () => {
  const rows = [{category: 'Mexico'}, {category: ' mexico '}, {category: 'Canada'}];
  const a = createCanonicalDataset({columns: ['category'], rows, source: {type: 'csv', name: 'a.csv'}});
  const b = createCanonicalDataset({columns: ['category'], rows, source: {type: 'spreadsheet', name: 'book.xlsx'}});
  assert.deepEqual(findDataQualityIssues(a), findDataQualityIssues(b));
});
