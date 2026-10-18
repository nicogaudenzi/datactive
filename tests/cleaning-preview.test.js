import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCleaningPreview} from '../src/data/preparation/cleaning-preview.js';

test('preview identifies changed values and affected columns without changing the input tables', () => {
  const before = {columns:['Region','Revenue'], rows:[{Region:' north ',Revenue:'100'},{Region:'South',Revenue:'50'}]};
  const after = {columns:['Region','Revenue'], rows:[{Region:'north',Revenue:'100'},{Region:'South',Revenue:'50'}]};
  const preview = buildCleaningPreview(before, after, {type:'trim-text',column:'Region'});
  assert.equal(preview.totalAffectedRows, 1);
  assert.equal(preview.totalChangedCells, 1);
  assert.deepEqual(preview.changedColumns, ['Region']);
  assert.deepEqual(preview.entries[0], {rowNumber:1,status:'changed',before:before.rows[0],after:after.rows[0],changedColumns:['Region']});
  assert.equal(before.rows[0].Region, ' north ');
});

test('preview reports derived columns as changes across affected rows', () => {
  const before = {columns:['Revenue'], rows:[{Revenue:'10'},{Revenue:'20'}]};
  const after = {columns:['Revenue','Double'], rows:[{Revenue:'10',Double:20},{Revenue:'20',Double:40}]};
  const preview = buildCleaningPreview(before, after, {type:'derive-column',targetColumn:'Double'});
  assert.deepEqual(preview.changedColumns, ['Double']);
  assert.equal(preview.totalAffectedRows, 2);
  assert.equal(preview.totalChangedCells, 2);
});

test('preview identifies removed rows including duplicate occurrences', () => {
  const before = {columns:['ID','Value'], rows:[{ID:1,Value:'a'},{ID:2,Value:'b'},{ID:2,Value:'b'}]};
  const after = {columns:['ID','Value'], rows:[{ID:1,Value:'a'},{ID:2,Value:'b'}]};
  const preview = buildCleaningPreview(before, after, {type:'remove-duplicate-rows'});
  assert.equal(preview.removedRows, 1);
  assert.equal(preview.entries.length, 1);
  assert.equal(preview.entries[0].status, 'removed');
  assert.equal(preview.entries[0].before.ID, 2);
});

test('preview caps displayed rows but retains total impact counts', () => {
  const before = {columns:['Value'], rows:Array.from({length:12},(_,i)=>({Value:String(i)}))};
  const after = {columns:['Value'], rows:before.rows.map(row=>({Value:`${row.Value}!`}))};
  const preview = buildCleaningPreview(before, after, {type:'trim-text'}, 4);
  assert.equal(preview.entries.length, 4);
  assert.equal(preview.totalAffectedRows, 12);
  assert.equal(preview.omittedRows, 8);
  assert.equal(preview.totalChangedCells, 12);
});

test('preview returns no affected rows when output is identical', () => {
  const table = {columns:['Value'], rows:[{Value:'same'}]};
  const preview = buildCleaningPreview(table, structuredClone(table), {type:'trim-text'});
  assert.equal(preview.totalAffectedRows, 0);
  assert.deepEqual(preview.changedColumns, []);
});
