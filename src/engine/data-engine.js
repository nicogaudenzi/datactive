export class DataEngine {
  constructor(dataset) {
    this.dataset = dataset;
    this.filters = [];
    this.filteredRowsCache = null;
  }

  applyFilters(filters) {
    if (sameFilters(this.filters, filters)) return;

    this.filters = filters.map(filter => ({
      ...filter,
      value: Array.isArray(filter.value) ? [...filter.value] : filter.value
    }));
    this.filteredRowsCache = null;
  }

  filteredRows() {
    // With no active filters the canonical rows are already the complete result.
    // Avoid allocating a second array of every row during initial dashboard render.
    if (this.filters.length === 0) return this.dataset.rows;
    if (this.filteredRowsCache === null) {
      this.filteredRowsCache = this.dataset.rows.filter(row => this.filters.every(filter => matchesFilter(row, filter)));
    }
    return this.filteredRowsCache;
  }

  query(query) {
    const rows = this.filteredRows();

    // Histogram is an aggregate query, not a row projection. It must take
    // precedence over a stale `columns` field left by another chart type.
    if (query.histogramColumn) {
      return histogram(rows, query.histogramColumn, query.bins ?? 10, this.dataset.rows);
    }

    if (query.columns) {
      // TableChart only reads the selected fields; it can safely consume the
      // original row objects and render a bounded page. Avoid allocating a
      // second object for every cell row during large-file dashboard startup.
      if (query.rawRows === true) return rows;
      return rows.map(row => Object.fromEntries(
        query.columns.map(column => [column, row[column]])
      ));
    }

    if (query.boxPlotDimension && query.boxPlotMeasure) {
      return boxPlot(rows, query.boxPlotDimension, query.boxPlotMeasure);
    }

    if (query.xColumn && query.yColumn) {
      return rows.map(row => ({
        [query.xColumn]: row[query.xColumn],
        [query.yColumn]: row[query.yColumn],
        ...(query.colorColumn ? {[query.colorColumn]: row[query.colorColumn]} : {}),
        ...(query.sizeColumn ? {[query.sizeColumn]: row[query.sizeColumn]} : {})
      }));
    }

    const dimensions = query.dimensions ?? [];
    const measures = query.measures ?? (query.series ?? []).map(series => ({
      column: series.measure,
      aggregation: query.aggregation ?? "sum"
    }));

    if (!dimensions.length) {
      return [{
        ...Object.fromEntries(
          measures.map(measure => [
            measure.column,
            aggregate(rows.map(row => row[measure.column]), measure.aggregation)
          ])
        )
      }];
    }

    const groups = new Map();

    for (const row of rows) {
      const dimensionValues = dimensions.map(column => row[column]);
      const key = JSON.stringify(dimensionValues);

      if (!groups.has(key)) {
        groups.set(key, {
          dimensions: dimensionValues,
          values: Object.fromEntries(measures.map(measure => [measure.column, []]))
        });
      }

      const group = groups.get(key);
      for (const measure of measures) {
        group.values[measure.column].push(row[measure.column]);
      }
    }

    return [...groups.values()].map(group => ({
      ...Object.fromEntries(
        dimensions.map((column, index) => [column, group.dimensions[index]])
      ),
      ...Object.fromEntries(
        measures.map(measure => [
          measure.column,
          aggregate(group.values[measure.column], measure.aggregation)
        ])
      )
    }));
  }
}

function matchesFilter(row, filter) {
  const value = row[filter.column];

  switch (filter.operator) {
    case "equals":
      // CSV values are strings, while some visualizations may expose numeric
      // values. Normalize both sides so an interactive filter is based on the
      // actual value rather than the incidental JavaScript type.
      if (value == null || filter.value == null) return value === filter.value;
      return String(value) === String(filter.value);

    case "in":
      return Array.isArray(filter.value) && filter.value.some(candidate => sameFilterValue(value, candidate));

    case "range": {
      const number = finiteNumericValue(value);
      const start = Array.isArray(filter.value) ? finiteNumericValue(filter.value[0]) : NaN;
      const end = Array.isArray(filter.value) ? finiteNumericValue(filter.value[1]) : NaN;
      return Number.isFinite(number) && Number.isFinite(start) && Number.isFinite(end) &&
        number >= start && number <= end;
    }

    case "dateRange": {
      const time = Date.parse(value);
      const start = Number(filter.value[0]);
      const end = Number(filter.value[1]);
      return Number.isFinite(time) && time >= start && time <= end;
    }

    default:
      return true;
  }
}

function sameFilterValue(left, right) {
  if (left == null || right == null) return left === right;
  return String(left) === String(right);
}

// Number(null), Number("") and Number("   ") all evaluate to zero. Those
// values represent missing data here, not a numeric zero, so reject them
// before coercion while still supporting numeric strings from CSV adapters.
function finiteNumericValue(value) {
  if (value == null || typeof value === "boolean") return NaN;
  if (typeof value === "string" && value.trim() === "") return NaN;
  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
}

function aggregate(values, aggregation) {
  const numbers = values.map(Number).filter(Number.isFinite);

  switch (aggregation) {
    case "sum":
      return numbers.reduce((a, b) => a + b, 0);
    case "average":
      return numbers.length ? numbers.reduce((a, b) => a + b, 0) / numbers.length : 0;
    case "min":
      return numbers.length ? Math.min(...numbers) : 0;
    case "max":
      return numbers.length ? Math.max(...numbers) : 0;
    case "count":
      return values.length;
    default:
      throw new Error(`Unsupported aggregation: ${aggregation}`);
  }
}

function histogram(rows, column, binCount, allRows) {
  const values = rows.map(row => Number(row[column])).filter(Number.isFinite);
  const allValues = allRows.map(row => Number(row[column])).filter(Number.isFinite);
  if (!allValues.length) return {column, bins: [], domain: [0, 1]};

  let min = Math.min(...allValues);
  let max = Math.max(...allValues);
  if (min === max) {
    const pad = Math.abs(min) > 0 ? Math.abs(min) * 0.05 : 1;
    min -= pad;
    max += pad;
  }

  const bins = d3Bin(values, min, max, binCount);
  return {column, bins, domain: [min, max]};
}

function d3Bin(values, min, max, count) {
  const bins = Array.from({length: count}, (_, i) => ({
    x0: min + (max - min) * i / count,
    x1: min + (max - min) * (i + 1) / count,
    count: 0
  }));

  const width = (max - min) / count;
  for (const value of values) {
    const index = Math.min(count - 1, Math.max(0, Math.floor((value - min) / width)));
    bins[index].count += 1;
  }
  return bins;
}


function boxPlot(rows, dimension, measure) {
  const groups = new Map();

  for (const row of rows) {
    const category = String(row[dimension]);
    const value = Number(row[measure]);
    if (!Number.isFinite(value)) continue;
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(value);
  }

  return [...groups.entries()].map(([category, values]) => {
    values.sort((a, b) => a - b);
    const q1 = percentile(values, 0.25);
    const median = percentile(values, 0.5);
    const q3 = percentile(values, 0.75);
    const iqr = q3 - q1;
    const lowerFence = q1 - 1.5 * iqr;
    const upperFence = q3 + 1.5 * iqr;
    const nonOutliers = values.filter(value => value >= lowerFence && value <= upperFence);
    const lowerWhisker = nonOutliers.length ? Math.min(...nonOutliers) : q1;
    const upperWhisker = nonOutliers.length ? Math.max(...nonOutliers) : q3;
    const outliers = values.filter(value => value < lowerFence || value > upperFence);

    return {
      [dimension]: category,
      [measure]: {q1, median, q3, lowerWhisker, upperWhisker, outliers, count: values.length}
    };
  });
}

function percentile(sortedValues, p) {
  if (!sortedValues.length) return 0;
  if (sortedValues.length === 1) return sortedValues[0];
  const index = (sortedValues.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];
  const fraction = index - lower;
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * fraction;
}

function sameFilters(left, right) {
  if (left.length !== right.length) return false;
  return left.every((filter, index) => {
    const candidate = right[index];
    if (!candidate || filter.column !== candidate.column || filter.operator !== candidate.operator) return false;
    if (!Array.isArray(filter.value) || !Array.isArray(candidate.value)) {
      return filter.value === candidate.value;
    }
    return filter.value.length === candidate.value.length &&
      filter.value.every((value, valueIndex) => value === candidate.value[valueIndex]);
  });
}
