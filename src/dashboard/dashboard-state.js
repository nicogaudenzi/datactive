import {validateVisualizationConfig} from "./visualization-config.js";

/**
 * Reconcile saved chart configurations against the currently prepared dataset.
 * A chart is retained only when its existing query remains valid; this keeps
 * schema changes from needlessly clearing unrelated dashboard content.
 */
export function reconcileDashboardVisualizations(savedVisualizations, dataset, validateConfig = validateVisualizationConfig) {
  if (!Array.isArray(savedVisualizations)) return {valid: [], removed: []};
  const valid = [];
  const removed = [];
  const seenIds = new Set();

  for (const visualization of savedVisualizations) {
    const title = visualization?.title || visualization?.id || "Untitled chart";
    let reason = "";
    if (!visualization || typeof visualization !== "object" || Array.isArray(visualization)) {
      reason = "The saved chart configuration is malformed.";
    } else if (typeof visualization.id !== "string" || !visualization.id.trim()) {
      reason = "The saved chart has no valid identifier.";
    } else if (seenIds.has(visualization.id)) {
      reason = "The saved dashboard contains a duplicate chart identifier.";
    } else {
      seenIds.add(visualization.id);
      reason = validateConfig(visualization.type, visualization.query, dataset);
    }

    if (reason) removed.push({title, reason});
    else valid.push(visualization);
  }
  return {valid, removed};
}

/** Parse the tab-scoped, versioned dashboard state. */
export function parseDashboardState(value) {
  if (value == null || value === "") return null;
  try {
    const state = JSON.parse(value);
    if (state?.version !== 1 || !Array.isArray(state.visualizations)) return null;
    return state;
  } catch {
    return null;
  }
}
