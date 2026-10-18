/**
 * Declarative inventory of the interactions currently implemented by each chart.
 * Keep this registry aligned with the renderer code. Tests use it as the source
 * of truth for coverage; it describes current behavior, not planned behavior.
 *
 * Interaction kinds:
 * - category-click: click a mark to toggle an equality filter on one dimension
 * - category-brush: brush across categorical positions to apply an `in` filter;
 *   brushing the full extent clears that dimension's filter
 * - numeric-brush: brush an axis to apply a numeric `range`; full extent clears it
 * - compound-category-click: click a mark to toggle equality filters on 2 dimensions
 * - table-cell-click: click a non-empty cell to toggle an equality filter on its column
 */
const entry = (label, interactions, notes = "") => Object.freeze({
  label,
  interactions: Object.freeze(interactions.map(interaction => Object.freeze(interaction))),
  notes
});

export const CHART_INTERACTION_REGISTRY = Object.freeze({
  bar: entry("Bar", [
    {id: "category-click", input: "click", emits: "equals", target: "x-dimension"},
    {id: "category-brush", input: "brush", emits: "in-or-clear", target: "x-dimension"}
  ]),
  line: entry("Line", [
    {id: "category-click", input: "click", emits: "equals", target: "x-dimension"},
    {id: "category-brush", input: "brush", emits: "in-or-clear", target: "x-dimension"}
  ]),
  area: entry("Area", [
    {id: "category-click", input: "click", emits: "equals", target: "x-dimension"},
    {id: "category-brush", input: "brush", emits: "in-or-clear", target: "x-dimension"}
  ]),
  scatter: entry("Scatter", [
    {id: "category-click", input: "click", emits: "equals", target: "x-column"},
    {id: "numeric-brush", input: "brush", emits: "range-or-clear", target: "x-column"}
  ], "Point clicks filter by the point's X value; the brush filters the numeric X axis."),
  table: entry("Data table", [
    {id: "table-cell-click", input: "click", emits: "equals", target: "clicked-column"}
  ], "Empty cells are ignored; every non-empty cell is filterable."),
  pie: entry("Pie / Donut", [
    {id: "category-click", input: "click", emits: "equals", target: "dimension"}
  ], "The same renderer supports pie and donut presentation modes."),
  histogram: entry("Histogram", [
    {id: "numeric-brush", input: "brush", emits: "range-or-clear", target: "measure-column"}
  ]),
  density: entry("Density / KDE", [
    {id: "numeric-brush", input: "brush", emits: "range-or-clear", target: "density-column"}
  ]),
  stackedBar: entry("Stacked bar", [
    {id: "category-click", input: "click", emits: "equals", target: "stack-dimension"},
    {id: "category-brush", input: "brush", emits: "in-or-clear", target: "x-dimension"}
  ], "Clicking a stack filters by the stack dimension; the brush filters the X dimension."),
  boxPlot: entry("Box plot", [
    {id: "category-click", input: "click", emits: "equals", target: "category-dimension"},
    {id: "category-brush", input: "brush", emits: "in-or-clear", target: "category-dimension"}
  ], "Both the box and its outlier points filter by their category."),
  violinPlot: entry("Violin plot", [
    {id: "category-click", input: "click", emits: "equals", target: "category-dimension"},
    {id: "category-brush", input: "brush", emits: "in-or-clear", target: "category-dimension"}
  ]),
  heatmap: entry("Heatmap", [
    {id: "compound-category-click", input: "click", emits: "two-equals-or-clear", target: "x-and-y-dimensions"}
  ], "Clicking a cell applies filters for both dimensions as one compound selection."),
  treemap: entry("Treemap", [
    {id: "category-click", input: "click", emits: "equals", target: "dimension"}
  ]),
  combo: entry("Combo chart", [
    {id: "category-click", input: "click", emits: "equals", target: "x-dimension"},
    {id: "category-brush", input: "brush", emits: "in-or-clear", target: "x-dimension"}
  ], "Clicking either supported series mark filters by the X dimension."),
  waterfall: entry("Waterfall", [
    {id: "category-click", input: "click", emits: "equals", target: "category-dimension"},
    {id: "category-brush", input: "brush", emits: "in-or-clear", target: "category-dimension"}
  ]),
  funnel: entry("Funnel", [
    {id: "category-click", input: "click", emits: "equals", target: "stage-dimension"}
  ]),
  radar: entry("Radar", [
    {id: "category-click", input: "click", emits: "equals", target: "category-dimension"}
  ], "Category labels are clickable filter targets." ),
  map: entry("Choropleth map", [
    {id: "category-click", input: "click", emits: "in", target: "source values assigned to the region"}
  ], "Clicking a region filters all source values explicitly assigned to that region.")
});

export const CHART_TYPES = Object.freeze(Object.keys(CHART_INTERACTION_REGISTRY));

export function getChartInteractionSpec(type) {
  return CHART_INTERACTION_REGISTRY[type] ?? null;
}

export function getChartTypesSupporting(interactionId) {
  return CHART_TYPES.filter(type =>
    CHART_INTERACTION_REGISTRY[type].interactions.some(interaction => interaction.id === interactionId)
  );
}
