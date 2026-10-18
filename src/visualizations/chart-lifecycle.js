/** Shared resize/lifecycle contract for responsive chart renderers. */
export function observeChartResize(chart, container) {
  chart.destroyed = false;
  chart.resizeObserver?.disconnect();
  chart.resizeObserver = new ResizeObserver(() => {
    if (!chart.destroyed && chart.data && typeof chart.renderData === "function") {
      chart.renderData(chart.data);
    }
  });
  chart.resizeObserver.observe(container);
}

/** Mark a renderer inactive before disconnecting observers to prevent late callbacks. */
export function cleanupChartLifecycle(chart) {
  chart.destroyed = true;
  chart.resizeObserver?.disconnect();
  chart.resizeObserver = null;
}
