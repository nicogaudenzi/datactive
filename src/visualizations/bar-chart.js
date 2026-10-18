import * as d3 from "d3";
import {emitCategory, emitCategories, emitNumericRange, emitClear} from "../interactions/chart-interaction-contract.js";
import {observeChartResize} from "./chart-lifecycle.js";
import {cleanupChartLifecycle} from "./chart-lifecycle.js";

export class BarChart {
  constructor(container, visualization, {onFilter, colorStore} = {}) {
    this.container = container;
    this.visualization = visualization;
    this.onFilter = onFilter;
    this.colorStore = colorStore;
    this.root = d3.select(container);
    this.svg = this.root.append("svg").attr("width", "100%").attr("height", "100%");
    observeChartResize(this, container);
  }

  renderData(data) {
    this.data = data;
    const dimension = this.visualization.query.dimensions?.[0];
    const measures = this.visualization.query.measures ?? [];
    if (!dimension || !measures.length) return;

    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width < 20 || height < 20) return;

    const margin = {top: 20, right: 24, bottom: 64, left: 58};
    const iw = Math.max(10, width - margin.left - margin.right);
    const ih = Math.max(10, height - margin.top - margin.bottom);

    // Keep the previous numeric values so matching bars can interpolate from
    // their last rendered value instead of always growing from zero.
    const previousValues = this.previousBarValues ?? new Map();
    const valueKey = (category, measure) => JSON.stringify([String(category), measure]);
    const nextValues = new Map();
    for (const row of data) {
      for (const measure of measures) {
        nextValues.set(valueKey(row[dimension], measure.column), Number(row[measure.column]) || 0);
      }
    }

    this.root.selectAll("*").remove();
    this.svg = this.root.append("svg").attr("width", "100%").attr("height", "100%");

    const svg = this.svg
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "none");
    const chart = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
    const cats = data.map(r => String(r[dimension]));
    const x0 = d3.scaleBand().domain(cats).range([0, iw]).padding(.16);
    const x1 = d3.scaleBand().domain(measures.map(m => m.column)).range([0, x0.bandwidth()]).padding(.08);
    const max = d3.max(data, r => d3.max(measures, m => Number(r[m.column]) || 0)) ?? 0;
    const y = d3.scaleLinear().domain([0, max || 1]).nice().range([ih, 0]);

    chart.append("g")
      .attr("transform", `translate(0,${ih})`)
      .call(d3.axisBottom(x0))
      .selectAll("text")
      .attr("transform", "rotate(-30)")
      .style("text-anchor", "end");
    chart.append("g").call(d3.axisLeft(y).ticks(5));

    const groups = chart.selectAll(".bar-group")
      .data(data)
      .join("g")
      .attr("class", "bar-group")
      .attr("transform", r => `translate(${x0(String(r[dimension]))},0)`);

    const bars = groups.selectAll("rect")
      .data(r => measures.map(m => ({row: r, measure: m.column, value: Number(r[m.column]) || 0})))
      .join("rect")
      .attr("x", d => x1(d.measure))
      // Start matching bars at their previous value, expressed on the new
      // scale. New categories/measures still enter from the baseline.
      .attr("y", d => y(previousValues.get(valueKey(d.row[dimension], d.measure)) ?? 0))
      .attr("width", x1.bandwidth())
      .attr("height", d => Math.max(0, ih - y(previousValues.get(valueKey(d.row[dimension], d.measure)) ?? 0)))
      .attr("data-interaction-target", "category-click")
      .attr("fill", d => this.colorStore
        ? this.colorStore.getMeasureColor(d.measure)
        : d3.schemeTableau10[measures.findIndex(m => m.column === d.measure) % d3.schemeTableau10.length])
      .style("cursor", "pointer")
      .on("click", (_, d) => this.onFilter?.({column: dimension, operator: "equals", value: d.row[dimension]}));

    bars.transition("bar-update")
      .duration(260)
      .ease(d3.easeCubicOut)
      .attr("y", d => y(d.value))
      .attr("height", d => Math.max(0, ih - y(d.value)));
    this.previousBarValues = nextValues;

    this.addCategoryBrush(chart, x0, cats, dimension, iw, ih);

    const legend = svg.append("g").attr("transform", `translate(${margin.left},${height - 14})`);
    let lx = 0;
    measures.forEach((m, i) => {
      const item = legend.append("g").attr("transform", `translate(${lx},0)`);
      item.append("rect").attr("width", 10).attr("height", 10).attr("y", -9).attr("fill", this.colorStore
        ? this.colorStore.getMeasureColor(m.column)
        : d3.schemeTableau10[i % d3.schemeTableau10.length]);
      item.append("text").attr("x", 15).attr("y", 0).attr("font-size", 11).attr("fill", "currentColor").text(m.column);
      lx += m.column.length * 7 + 45;
    });
  }

  addCategoryBrush(chart, scale, categories, column, width, height) {
    const brush = d3.brushX()
      .extent([[0, height], [width, height + 28]])
      .on("end", event => {
        if (!event.selection || !event.sourceEvent) return;
        const [a, b] = event.selection;
        const selected = categories.filter(category => {
          const center = scale(category) + scale.bandwidth() / 2;
          return center >= a && center <= b;
        });

        // A brush covering every category is semantically a full-range selection,
        // even if pointer rounding leaves it a fraction of a pixel short.
        const allCategoriesSelected = new Set(selected).size >= new Set(categories).size;
        if (!selected.length || allCategoriesSelected || (a <= 1 && b >= width - 1)) {
          emitClear(this.onFilter, column);
          return;
        }

        emitCategories(this.onFilter, column, selected);
      });

    const group = chart.append("g")
      .attr("class", "chart-brush chart-category-brush")
      .call(brush);

    group.select(".overlay")
      .attr("fill", "transparent")
      .attr("cursor", "crosshair");
    group.select(".selection")
      .attr("fill", "var(--primary)")
      .attr("fill-opacity", 0.22)
      .attr("stroke", "var(--primary)");
    group.selectAll(".handle")
      .attr("fill", "var(--primary)");
  }

  destroy() {
    cleanupChartLifecycle(this);
    this.svg.remove();
  }
}
