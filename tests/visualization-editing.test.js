import test from 'node:test';
import assert from 'node:assert/strict';
import {applyInlineQueryEdit, titleAfterDialogEdit, titleAfterInlineEdit} from '../src/dashboard/visualization-editing.js';

const edit = (type, query, field, value, options) => {
  const result = applyInlineQueryEdit(type, query, field, value, options);
  assert.equal(result.error, null);
  return result.query;
};

test('rapid successive inline edits compose on the latest query without dropping earlier changes', () => {
  let query = {dimensions: ['month'], measures: [{column: 'revenue', aggregation: 'sum'}]};
  query = edit('bar', query, 'dimension', 'country');
  query = edit('bar', query, 'measure', 'cost', {checked: true});
  query = edit('bar', query, 'aggregation', 'average');
  assert.deepEqual(query, {
    dimensions: ['country'],
    measures: [
      {column: 'revenue', aggregation: 'average'},
      {column: 'cost', aggregation: 'average'}
    ]
  });
});

test('inline and dialog editing retain the same canonical query shape for single-measure charts', () => {
  const initial = {dimensions: ['month'], measures: [{column: 'revenue', aggregation: 'sum'}]};
  const inlineQuery = edit('pie', initial, 'measure', 'profit');
  const dialogEquivalentQuery = {dimensions: ['month'], measures: [{column: 'profit', aggregation: 'sum'}]};
  assert.deepEqual(inlineQuery, dialogEquivalentQuery);
  assert.deepEqual(JSON.parse(JSON.stringify(inlineQuery)), dialogEquivalentQuery, 'canonical query remains JSON-serializable for persistence');
});

test('inline edit updates automatic titles but preserves custom titles', () => {
  const automatic = titleAfterInlineEdit({title: 'Revenue vs. Month', titleCustom: false}, 'Cost vs. Country');
  assert.deepEqual(automatic, {title: 'Cost vs. Country', titleCustom: false});

  const custom = titleAfterInlineEdit({title: 'Quarterly performance', titleCustom: true}, 'Cost vs. Country');
  assert.deepEqual(custom, {title: 'Quarterly performance', titleCustom: true});
});

test('dialog title edits support custom titles, unchanged automatic titles, and returning to automatic mode', () => {
  assert.deepEqual(titleAfterDialogEdit({currentTitle: 'Revenue vs. Month', currentTitleCustom: false, requestedTitle: 'Executive summary', generatedTitle: 'Cost vs. Country'}), {
    title: 'Executive summary', titleCustom: true
  });
  assert.deepEqual(titleAfterDialogEdit({currentTitle: 'Revenue vs. Month', currentTitleCustom: false, requestedTitle: 'Revenue vs. Month', generatedTitle: 'Cost vs. Country'}), {
    title: 'Cost vs. Country', titleCustom: false
  });
  assert.deepEqual(titleAfterDialogEdit({currentTitle: 'Executive summary', currentTitleCustom: true, requestedTitle: '', generatedTitle: 'Cost vs. Country'}), {
    title: 'Cost vs. Country', titleCustom: false
  });
});

test('rapid scatter edits preserve optional color and size selections independently', () => {
  let query = {xColumn: 'units', yColumn: 'revenue'};
  query = edit('scatter', query, 'colorColumn', 'country', {measureColumns: ['revenue', 'cost', 'units']});
  query = edit('scatter', query, 'sizeColumn', 'profit');
  query = edit('scatter', query, 'xColumn', 'cost');
  assert.deepEqual(query, {xColumn: 'cost', yColumn: 'revenue', colorColumn: 'country', colorType: 'categorical', sizeColumn: 'profit'});
});

test('histogram inline bin edits update the canonical query and preserve the selected value column', () => {
  let query = {histogramColumn: 'revenue', bins: 10};
  query = edit('histogram', query, 'bins', '24');
  assert.deepEqual(query, {histogramColumn: 'revenue', bins: 24});
  query = edit('histogram', query, 'bins', '7');
  assert.deepEqual(query, {histogramColumn: 'revenue', bins: 7});
  assert.equal(JSON.parse(JSON.stringify(query)).bins, 7);
});

test('histogram bin inline edits do not mutate the previous canonical query', () => {
  const original = {histogramColumn: 'profit', bins: 10};
  const updated = edit('histogram', original, 'bins', '32');
  assert.deepEqual(original, {histogramColumn: 'profit', bins: 10});
  assert.deepEqual(updated, {histogramColumn: 'profit', bins: 32});
});
