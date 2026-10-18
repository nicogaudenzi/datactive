import {getDimensionColumns, getMeasureColumns} from "../data/dataset-schema.js";
import {getMapDefinition} from "../maps/map-catalog.js";
const AGGREGATIONS = new Set(["sum", "average", "min", "max", "count"]);
const CHART_TYPES = new Set([
  "bar", "line", "area", "scatter", "table", "pie", "histogram", "density",
  "stackedBar", "boxPlot", "violinPlot", "heatmap", "treemap", "combo",
  "waterfall", "funnel", "radar", "map"
]);

/**
 * Validate the query shape used by the current chart editor against dataset metadata.
 * Returns an empty string when valid, otherwise a user-facing explanation.
 */
export function validateVisualizationConfig(type, query, dataset) {
  if (!CHART_TYPES.has(type)) return `Unknown chart type: ${type || "(empty)"}.`;
  if (!query || typeof query !== "object") return "Chart configuration is missing.";

  const columns = new Set(dataset?.columns ?? []);
  const dimensions = new Set(dataset ? getDimensionColumns(dataset) : []);
  const numeric = new Set(dataset ? getMeasureColumns(dataset) : []);
  const requireColumn = (column, allowed, label) => {
    if (!column || !columns.has(column)) return `${label} must be a column in the current dataset.`;
    if (allowed && !allowed.has(column)) return `${label} must use a compatible ${allowed === numeric ? "numeric" : "categorical/date"} column.`;
    return "";
  };
  const requireAggregation = aggregation => AGGREGATIONS.has(aggregation)
    ? ""
    : `Aggregation must be one of: ${[...AGGREGATIONS].join(", ")}.`;
  const requireMeasure = (measure, label = "Value") => {
    const columnError = requireColumn(measure?.column, numeric, label);
    if (columnError) return columnError;
    return requireAggregation(measure.aggregation);
  };
  const requireDimension = (column, label = "Dimension") => requireColumn(column, dimensions, label);

  if (type === "map") {
    const geographicColumn = query.geographicColumn;
    const columnError = requireColumn(geographicColumn, null, "Geographic column");
    if (columnError) return columnError;
    if (!dataset?.columnMetadata?.[geographicColumn]?.geographicRole) {
      return "Geographic column must have a geographic role assigned in Annotate.";
    }
    if (typeof query.mapId !== "string" || !query.mapId.trim()) return "Choose a map definition.";
    if (!getMapDefinition(query.mapId)) return "The selected map definition is not available.";
    if (query.measureColumn === geographicColumn) return "Choose a numeric value column different from the geographic column.";
    const measureError = requireColumn(query.measureColumn, numeric, "Map value");
    if (measureError) return measureError;
    return requireAggregation(query.aggregation);
  }

  if (type === "table") {
    const selected = query.columns;
    if (!Array.isArray(selected) || selected.length === 0) return "Select at least one table column.";
    if (selected.some(column => !columns.has(column))) return "Every selected table column must exist in the current dataset.";
    return "";
  }

  if (type === "scatter") {
    for (const [column, label] of [[query.xColumn, "X axis"], [query.yColumn, "Y axis"]]) {
      const error = requireColumn(column, numeric, label);
      if (error) return error;
    }
    if (query.colorColumn) {
      const error = requireColumn(query.colorColumn, null, "Color");
      if (error) return error;
    }
    if (query.sizeColumn) {
      const error = requireColumn(query.sizeColumn, numeric, "Size");
      if (error) return error;
    }
    return "";
  }

  if (type === "histogram" || type === "density") {
    const column = type === "histogram" ? query.histogramColumn : query.densityColumn;
    const error = requireColumn(column, numeric, "Value");
    if (error) return error;
    if (type === "histogram" && (!Number.isInteger(query.bins) || query.bins < 2 || query.bins > 100)) {
      return "Histogram bins must be an integer between 2 and 100.";
    }
    return "";
  }

  let dimensionColumns;
  let measures;
  if (type === "boxPlot") {
    dimensionColumns = [query.boxPlotDimension];
    measures = [{column: query.boxPlotMeasure, aggregation: "sum"}];
  } else if (type === "violinPlot") {
    dimensionColumns = [query.violinPlotDimension];
    measures = [{column: query.violinPlotMeasure, aggregation: "sum"}];
  } else if (type === "scatter") {
    return "";
  } else {
    dimensionColumns = query.dimensions;
    measures = query.measures;
  }

  const requiredDimensionCount = type === "heatmap" || type === "stackedBar" ? 2 : 1;
  if (!Array.isArray(dimensionColumns) || dimensionColumns.length < requiredDimensionCount) {
    return `This chart requires ${requiredDimensionCount} dimension${requiredDimensionCount === 1 ? "" : "s"}.`;
  }
  for (let index = 0; index < requiredDimensionCount; index += 1) {
    const error = requireDimension(dimensionColumns[index], `Dimension ${index + 1}`);
    if (error) return error;
  }
  if (requiredDimensionCount === 2 && dimensionColumns[0] === dimensionColumns[1]) {
    return "Choose two different dimensions.";
  }

  if (type === "combo") {
    if (!Array.isArray(query.series) || query.series.length !== 2) return "Combo charts require exactly two series.";
    const seriesColumns = query.series.map(series => series.measure);
    if (seriesColumns.some(column => !numeric.has(column))) return "Both combo series must use numeric columns.";
    if (seriesColumns[0] === seriesColumns[1]) return "Choose two different measures for the combo series.";
    if (query.series.some(series => !["bar", "line"].includes(series.style))) return "Each combo series must use Bar or Line style.";
    return requireAggregation(query.aggregation);
  }

  if (!Array.isArray(measures) || measures.length === 0) return "Select at least one numeric measure.";
  for (let index = 0; index < measures.length; index += 1) {
    const error = requireMeasure(measures[index], `Measure ${index + 1}`);
    if (error) return error;
  }
  if (["pie", "treemap", "waterfall", "funnel", "heatmap", "stackedBar", "boxPlot", "violinPlot"].includes(type) && measures.length !== 1) {
    return "This chart type requires exactly one numeric measure.";
  }
  return "";
}
