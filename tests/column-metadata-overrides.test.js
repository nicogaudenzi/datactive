import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanonicalDataset} from '../src/data/dataset-schema.js';
import {applyColumnMetadataOverrides, validateColumnMetadataOverrides} from '../src/data/column-metadata-overrides.js';

function sample() {
  return createCanonicalDataset({columns:['ID','Amount','When'], rows:[
    {ID:'001', Amount:'10', When:'2025-01-01'},
    {ID:'002', Amount:'20', When:'2025-01-02'}
  ]});
}

test('applies valid type and role overrides without modifying values', () => {
  const source = sample();
  const beforeRows = structuredClone(source.rows);
  const result = applyColumnMetadataOverrides(source, {
    ID: {type:'string', role:'identifier'},
    Amount: {type:'number', role:'measure'},
    When: {type:'date', role:'dimension'}
  });
  assert.equal(result.columnMetadata.ID.role, 'identifier');
  assert.equal(result.columnMetadata.Amount.type, 'number');
  assert.equal(result.columnMetadata.When.role, 'dimension');
  assert.deepEqual(result.rows, beforeRows);
  assert.deepEqual(source.rows, beforeRows);
});

test('ignores overrides for unknown columns and invalid enum values when applying', () => {
  const result = applyColumnMetadataOverrides(sample(), {
    Unknown: {type:'number', role:'measure'},
    ID: {type:'made-up', role:'identifier'}
  });
  assert.equal(result.columnMetadata.ID.type, 'number');
  assert.equal(result.columnMetadata.ID.role, 'identifier');
});

test('validates and retains only known columns and allowed metadata values for persistence', () => {
  const result = validateColumnMetadataOverrides(sample(), {
    ID: {type:'string', role:'identifier'},
    Unknown: {type:'number'},
    Amount: {role:'measure'}
  });
  assert.deepEqual(result, {ID:{type:'string', role:'identifier'}, Amount:{role:'measure'}});
});

test('preserves a geographic role independently of the general column role', () => {
  const source = sample();
  const overrides = validateColumnMetadataOverrides(source, {ID: {type: 'string', role: 'identifier', geographicRole: 'state-province'}});
  assert.deepEqual(overrides, {ID: {type: 'string', role: 'identifier', geographicRole: 'state-province'}});
  const result = applyColumnMetadataOverrides(source, overrides);
  assert.equal(result.columnMetadata.ID.geographicRole, 'state-province');
  assert.equal(result.columnMetadata.ID.role, 'identifier');
});

test('rejects invalid persisted override values', () => {
  assert.throws(() => validateColumnMetadataOverrides(sample(), {ID:{type:'currency'}}), /Invalid type override/);
  assert.throws(() => validateColumnMetadataOverrides(sample(), {ID:{role:'metric'}}), /Invalid role override/);
  assert.throws(() => validateColumnMetadataOverrides(sample(), {ID:{geographicRole:'planet'}}), /Invalid geographic role override/);
});
