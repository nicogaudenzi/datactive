import test from 'node:test';
import assert from 'node:assert/strict';
import {createPerformanceMetrics} from '../src/performance/performance-metrics.js';

test('performance metrics record bounded, sanitized timing details without mutating snapshots', () => {
  let clock = 10;
  const metrics = createPerformanceMetrics({now: () => clock});
  const start = clock;
  clock = 15.5;
  const entry = metrics.record('filter', start, {rows: 147209, unsafe: {secret: true}, label: 'large dataset'});
  assert.equal(entry.name, 'filter');
  assert.equal(entry.durationMs, 5.5);
  assert.equal(entry.rows, 147209);
  assert.equal('unsafe' in entry, false);
  assert.deepEqual(metrics.snapshot(), [entry]);
  const snapshot = metrics.snapshot();
  snapshot[0].name = 'changed';
  assert.equal(metrics.snapshot()[0].name, 'filter');
});

test('performance metrics retain only the most recent 100 entries', () => {
  let clock = 0;
  const metrics = createPerformanceMetrics({now: () => clock});
  for (let index = 0; index < 105; index += 1) {
    clock += 1;
    metrics.record(`stage-${index}`, clock - 1);
  }
  const entries = metrics.snapshot();
  assert.equal(entries.length, 100);
  assert.equal(entries[0].name, 'stage-5');
  assert.equal(entries.at(-1).name, 'stage-104');
  metrics.clear();
  assert.deepEqual(metrics.snapshot(), []);
});
