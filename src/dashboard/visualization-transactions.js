/**
 * Transaction helpers for keeping dashboard widgets, renderer instances, and
 * the application's visualization registry in sync when chart setup fails.
 */
export function createVisualizationTransaction({
  visualization,
  createWidget,
  getContent,
  createRenderer,
  render,
  commit,
  rollbackWidget
}) {
  let widget;
  let content;
  let chart;

  try {
    widget = createWidget();
    if (!widget) throw new Error(`Could not create widget for ${visualization.id}`);

    content = getContent(widget);
    if (!content) throw new Error(`Could not find chart content for ${visualization.id}`);

    chart = createRenderer(content, visualization);
    render(chart, visualization);
    commit({visualization, chart, widget});
    return {visualization, chart, widget};
  } catch (error) {
    try { chart?.destroy(); } catch { /* Preserve the initialization error. */ }
    try { content?.replaceChildren(); } catch { /* The widget may already be detached. */ }
    try { if (widget) rollbackWidget(widget); } catch { /* Preserve the initialization error. */ }
    throw error;
  }
}

/**
 * Replace a chart renderer, restoring the prior configuration if the new
 * renderer cannot be constructed or rendered. If restoration also fails, the
 * caller is asked to remove the unusable widget and registry entry.
 */
export function replaceVisualizationTransaction({
  previousEntry,
  nextVisualization,
  content,
  createRenderer,
  render,
  commit,
  removeUnrecoverable
}) {
  let replacement;
  const previousVisualization = previousEntry.visualization;

  try {
    previousEntry.chart.destroy();
    content.replaceChildren();
    replacement = createRenderer(content, nextVisualization);
    render(replacement, nextVisualization);
    commit({visualization: nextVisualization, chart: replacement});
    return {visualization: nextVisualization, chart: replacement, recovered: false};
  } catch (error) {
    try { replacement?.destroy(); } catch { /* Continue rollback. */ }
    try { content.replaceChildren(); } catch { /* Continue rollback. */ }

    let restoredChart;
    try {
      restoredChart = createRenderer(content, previousVisualization);
      render(restoredChart, previousVisualization);
      commit({visualization: previousVisualization, chart: restoredChart});
      error.recovered = true;
    } catch (restoreError) {
      try { restoredChart?.destroy(); } catch { /* Continue removing the unusable widget. */ }
      try { content.replaceChildren(); } catch { /* Continue removing the unusable widget. */ }
      try { removeUnrecoverable(restoreError); } catch { /* Preserve the original failure. */ }
      error.recovered = false;
      error.restoreError = restoreError;
    }
    throw error;
  }
}
