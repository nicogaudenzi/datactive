/** Apply one inline control change to a cloned query configuration. */
export function applyInlineQueryEdit(type, sourceQuery, field, value, {checked = true, measureColumns = []} = {}) {
  const query = structuredClone(sourceQuery);
  const multiMeasure = ["bar", "line", "area", "radar"].includes(type);

  if (multiMeasure && field === "dimension") {
    query.dimensions = [value];
  } else if (multiMeasure && field === "aggregation") {
    query.measures = (query.measures ?? []).map(measure => ({...measure, aggregation: value}));
  } else if (multiMeasure && field === "measure") {
    const selected = new Map((query.measures ?? []).map(measure => [measure.column, measure]));
    if (checked) selected.set(value, selected.get(value) ?? {column: value, aggregation: query.measures?.[0]?.aggregation ?? "sum"});
    else selected.delete(value);
    if (!selected.size) return {query, error: "empty-measures"};
    query.measures = [...selected.values()];
  } else {
    const fieldMap = {
      dimension: () => {
        if (type === "boxPlot") query.boxPlotDimension = value;
        else if (type === "violinPlot") { query.violinPlotDimension = value; query.columns = [value, query.violinPlotMeasure]; }
        else query.dimensions[0] = value;
      },
      dimension2: () => { query.dimensions[1] = value; },
      measure: () => {
        if (type === "boxPlot") query.boxPlotMeasure = value;
        else if (type === "violinPlot") { query.violinPlotMeasure = value; query.columns = [query.violinPlotDimension, value]; }
        else if (query.measures?.length) query.measures[0].column = value;
      },
      aggregation: () => { if (query.measures?.length) query.measures = query.measures.map(measure => ({...measure, aggregation: value})); if ("aggregation" in query) query.aggregation = value; },
      xColumn: () => { query.xColumn = value; },
      yColumn: () => { query.yColumn = value; },
      colorColumn: () => { if (value) { query.colorColumn = value; query.colorType = measureColumns.includes(value) ? "numeric" : "categorical"; } else { delete query.colorColumn; delete query.colorType; } },
      sizeColumn: () => { if (value) query.sizeColumn = value; else delete query.sizeColumn; },
      histogramColumn: () => { query.histogramColumn = value; delete query.columns; },
      bins: () => { query.bins = Number(value); },
      densityColumn: () => { query.densityColumn = value; query.columns = [value]; },
      series0: () => { query.series[0].measure = value; },
      series1: () => { query.series[1].measure = value; }
    };
    if (field === "tableColumn") {
      const columns = new Set(query.columns ?? []);
      if (checked) columns.add(value); else columns.delete(value);
      if (!columns.size) return {query, error: "empty-columns"};
      query.columns = [...columns];
    } else if (fieldMap[field]) fieldMap[field]();
    else return {query: structuredClone(sourceQuery), error: "unsupported-field"};
  }
  return {query, error: null};
}

/** Keep automatic titles derived from config while preserving intentional custom titles. */
export function titleAfterInlineEdit(visualization, generatedTitle) {
  const titleCustom = visualization.titleCustom ?? Boolean(visualization.title && visualization.title !== "New chart");
  return {...visualization, title: titleCustom ? visualization.title : generatedTitle, titleCustom};
}

/** Resolve Edit-panel title changes; an empty title returns the chart to automatic mode. */
export function titleAfterDialogEdit({currentTitle = "", currentTitleCustom, requestedTitle = "", generatedTitle}) {
  const currentCustom = currentTitleCustom ?? Boolean(currentTitle.trim() && currentTitle.trim() !== "New chart");
  const requested = requestedTitle.trim();
  const titleWasEdited = requested !== currentTitle.trim();
  const nextCustom = currentCustom ? Boolean(requested) : titleWasEdited && Boolean(requested);
  return {title: nextCustom ? requested : generatedTitle, titleCustom: nextCustom};
}
