/**
 * Shared contract for interactions emitted by visualization components.
 *
 * Chart components receive `onFilter(event)` and may emit one event or an array
 * of events for compound selections. Events use the existing FilterStore shape:
 *
 *   { column, operator: "equals", value }
 *   { column, operator: "in", value: [...] }
 *   { column, operator: "range", value: [min, max] }
 *   { column, operator: "dateRange", value: [startMs, endMs] }
 *   { column, operator: "clear", value: null }
 *
 * Click selections are toggles; `in` and `range` are brush/range replacements by default.
 * An `in` event may set `toggle: true` when it represents a click on a grouped category (such as a map region).
 * `clear` explicitly removes a column's active filter. This adapter validates
 * payloads at the shared boundary so individual charts don't need to know
 * about FilterStore implementation details.
 */
const VALID_OPERATORS = new Set(["equals", "in", "range", "dateRange", "clear"]);

export function normalizeChartInteraction(payload) {
  const events = Array.isArray(payload) ? payload : [payload];
  if (!events.length) return null;

  const normalized = [];
  for (const event of events) {
    if (!event || typeof event !== "object" || typeof event.column !== "string" || !event.column.trim()) {
      return null;
    }
    if (!VALID_OPERATORS.has(event.operator)) return null;

    if (event.operator === "clear") {
      normalized.push({column: event.column, operator: "clear", value: null});
      continue;
    }

    if (event.operator === "in") {
      if (!Array.isArray(event.value)) return null;
      normalized.push({...event, value: [...event.value]});
      continue;
    }

    if (event.operator === "range" || event.operator === "dateRange") {
      if (!Array.isArray(event.value) || event.value.length !== 2) return null;
      const start = Number(event.value[0]);
      const end = Number(event.value[1]);
      if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
      normalized.push({...event, value: [Math.min(start, end), Math.max(start, end)]});
      continue;
    }

    normalized.push({...event});
  }

  return Array.isArray(payload) ? normalized : normalized[0];
}

export const ChartInteraction = Object.freeze({
  category(column, value) {
    return {column, operator: "equals", value};
  },
  categories(column, values) {
    return {column, operator: "in", value: [...values]};
  },
  numericRange(column, min, max) {
    return {column, operator: "range", value: [Math.min(Number(min), Number(max)), Math.max(Number(min), Number(max))]};
  },
  dateRange(column, startMs, endMs) {
    return {column, operator: "dateRange", value: [Math.min(Number(startMs), Number(endMs)), Math.max(Number(startMs), Number(endMs))]};
  },
  clear(column) {
    return {column, operator: "clear", value: null};
  }
});

/** Small emission helpers used by chart renderers so interaction payloads share one vocabulary. */
export function emitCategory(onFilter, column, value) { onFilter?.(ChartInteraction.category(column, value)); }
export function emitCategories(onFilter, column, values) { onFilter?.(ChartInteraction.categories(column, values)); }
export function emitNumericRange(onFilter, column, min, max) { onFilter?.(ChartInteraction.numericRange(column, min, max)); }
export function emitDateRange(onFilter, column, startMs, endMs) { onFilter?.(ChartInteraction.dateRange(column, startMs, endMs)); }
export function emitClear(onFilter, column) { onFilter?.(ChartInteraction.clear(column)); }


/**
 * Applies normalized chart interactions to a FilterStore. Exported separately
 * from the app bootstrap so the interaction semantics can be unit-tested.
 */
export function applyChartInteraction(payload, filterStore, warn = console.warn) {
  const interaction = normalizeChartInteraction(payload);
  if (!interaction) {
    warn("Ignored invalid chart interaction payload:", payload);
    return false;
  }

  if (Array.isArray(interaction)) {
    const current = filterStore.getFilters();
    const same = interaction.every(next => current.some(existing =>
      existing.column === next.column && existing.operator === next.operator &&
      JSON.stringify(existing.value) === JSON.stringify(next.value)
    ));
    if (same) interaction.forEach(next => filterStore.removeFilter(next.column));
    else interaction.forEach(next => next.operator === "clear"
      ? filterStore.removeFilter(next.column)
      : filterStore.setFilter(next));
    return true;
  }

  if (interaction.operator === "clear") {
    filterStore.removeFilter(interaction.column);
    return true;
  }
  if (interaction.operator === "in") {
    const {toggle, ...filter} = interaction;
    if (toggle === true) filterStore.toggleFilter(filter);
    else filterStore.setFilter(filter);
    return true;
  }
  if (["range", "dateRange"].includes(interaction.operator)) {
    filterStore.setFilter(interaction);
    return true;
  }
  filterStore.toggleFilter(interaction);
  return true;
}
