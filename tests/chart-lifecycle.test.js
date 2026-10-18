import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanupChartLifecycle, observeChartResize} from '../src/visualizations/chart-lifecycle.js';

class MockResizeObserver {
  static instances = [];

  constructor(callback) {
    this.callback = callback;
    this.disconnected = false;
    this.observed = null;
    MockResizeObserver.instances.push(this);
  }

  observe(target) { this.observed = target; }
  disconnect() { this.disconnected = true; }
  trigger() { this.callback([]); }
}

test('resize observer rerenders active chart and cleanup disconnects it and blocks late callbacks', () => {
  const originalResizeObserver = globalThis.ResizeObserver;
  globalThis.ResizeObserver = MockResizeObserver;
  MockResizeObserver.instances = [];

  try {
    const container = {};
    let renderCount = 0;
    const chart = {data: [{value: 1}], renderData() { renderCount += 1; }};

    observeChartResize(chart, container);
    const observer = chart.resizeObserver;
    assert.equal(observer.observed, container);
    assert.equal(chart.destroyed, false);

    observer.trigger();
    assert.equal(renderCount, 1);

    cleanupChartLifecycle(chart);
    assert.equal(chart.destroyed, true);
    assert.equal(observer.disconnected, true);
    assert.equal(chart.resizeObserver, null);

    observer.trigger();
    assert.equal(renderCount, 1, 'a late observer callback must not rerender a destroyed chart');
  } finally {
    if (originalResizeObserver === undefined) delete globalThis.ResizeObserver;
    else globalThis.ResizeObserver = originalResizeObserver;
  }
});

test('reinitializing resize observation disconnects the previous observer', () => {
  const originalResizeObserver = globalThis.ResizeObserver;
  globalThis.ResizeObserver = MockResizeObserver;
  MockResizeObserver.instances = [];

  try {
    const chart = {data: [], renderData() {}};
    observeChartResize(chart, {});
    const previousObserver = chart.resizeObserver;
    observeChartResize(chart, {});

    assert.equal(previousObserver.disconnected, true);
    assert.equal(chart.resizeObserver, MockResizeObserver.instances[1]);
    assert.equal(chart.destroyed, false);
  } finally {
    if (originalResizeObserver === undefined) delete globalThis.ResizeObserver;
    else globalThis.ResizeObserver = originalResizeObserver;
  }
});
