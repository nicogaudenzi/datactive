import test from 'node:test';
import assert from 'node:assert/strict';
import {getFindingRowIndices} from '../src/data/data-inspection-view.js';

test('extracts and sorts row indices from category variant evidence', () => {
  const finding = {evidence: {variants: [{rowIndices: [5, 1]}, {rowIndices: [1, 3]}]}};
  assert.deepEqual(getFindingRowIndices(finding), [1, 3, 5]);
});

test('extracts row indices from mixed-type examples across observed types', () => {
  const finding = {evidence: {examples: {number: [{rowIndex: 2, value: 1}], string: [{rowIndex: 4, value: 'bad'}]}}};
  assert.deepEqual(getFindingRowIndices(finding), [2, 4]);
});

test('extracts duplicate and outlier rows and safely ignores malformed indices', () => {
  assert.deepEqual(getFindingRowIndices({evidence: {rowIndices: [4, -1, 2, 4, '3']}}), [2, 4]);
  assert.deepEqual(getFindingRowIndices({evidence: {rowIndex: 7}}), [7]);
  assert.deepEqual(getFindingRowIndices({evidence: {rowIndex: -1}}), []);
  assert.deepEqual(getFindingRowIndices(null), []);
});
