import test from "node:test";
import assert from "node:assert/strict";
import {CHART_INTERACTION_REGISTRY, CHART_TYPES, getChartInteractionSpec, getChartTypesSupporting} from "../src/interactions/chart-interaction-registry.js";

const EXPECTED_RENDERERS = [
  "bar", "line", "area", "scatter", "table", "pie", "histogram", "density",
  "stackedBar", "boxPlot", "violinPlot", "heatmap", "treemap", "combo", "waterfall", "funnel", "radar", "map"
];

test("registry contains every currently implemented chart type", () => {
  assert.deepEqual([...CHART_TYPES].sort(), [...EXPECTED_RENDERERS].sort());
});

test("every registered chart has a label and at least one valid interaction", () => {
  const validIds = new Set(["category-click", "category-brush", "numeric-brush", "compound-category-click", "table-cell-click"]);
  for (const [type, spec] of Object.entries(CHART_INTERACTION_REGISTRY)) {
    assert.ok(spec.label, `${type} should have a human-readable label`);
    assert.ok(spec.interactions.length > 0, `${type} should declare at least one interaction`);
    for (const interaction of spec.interactions) {
      assert.ok(validIds.has(interaction.id), `${type} has unknown interaction ${interaction.id}`);
      assert.ok(interaction.input && interaction.emits && interaction.target, `${type}/${interaction.id} needs input, emits, and target metadata`);
    }
  }
});

test("registry lookup returns null for unknown types and supports interaction queries", () => {
  assert.equal(getChartInteractionSpec("not-a-chart"), null);
  assert.equal(getChartInteractionSpec("heatmap").interactions[0].id, "compound-category-click");
  assert.ok(getChartTypesSupporting("numeric-brush").includes("scatter"));
  assert.ok(!getChartTypesSupporting("numeric-brush").includes("table"));
});
