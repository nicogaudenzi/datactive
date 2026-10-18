import * as d3 from "d3";
import {emitCategory, emitCategories, emitNumericRange, emitClear} from "../interactions/chart-interaction-contract.js";
import {observeChartResize} from "./chart-lifecycle.js";
import {cleanupChartLifecycle} from "./chart-lifecycle.js";

export class TreemapChart {
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
    const measure = this.visualization.query.measures?.[0]?.column;
    if (!dimension || !measure) return;

    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width < 20 || height < 20) return;

    this.root.selectAll("*").remove();
    this.svg = this.root.append("svg")
      .attr("width", "100%")
      .attr("height", "100%")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "none");

    const values = data
      .map(row => ({
        category: String(row[dimension] ?? ""),
        value: Number(row[measure])
      }))
      .filter(row => row.category && Number.isFinite(row.value) && row.value > 0);

    if (!values.length) {
      this.svg.append("text")
        .attr("x", width / 2)
        .attr("y", height / 2)
        .attr("text-anchor", "middle")
        .attr("fill", "currentColor")
        .attr("opacity", 0.65)
        .text("No positive values to display");
      return;
    }

    // The query normally already contains one row per dimension value. Keep
    // this aggregation here as a defensive measure for future query engines.
    const grouped = d3.rollups(values, rows => d3.sum(rows, row => row.value), row => row.category)
      .map(([category, value]) => ({category, value}));

    const hierarchy = d3.hierarchy({children: grouped})
      .sum(d => d.value ?? 0)
      .sort((a, b) => b.value - a.value);

    const margin = {top: 8, right: 8, bottom: 8, left: 8};
    const layoutWidth = Math.max(10, width - margin.left - margin.right);
    const layoutHeight = Math.max(10, height - margin.top - margin.bottom);

    d3.treemap()
      .size([layoutWidth, layoutHeight])
      .paddingInner(3)
      .round(true)(hierarchy);

    const chart = this.svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const nodes = chart.selectAll(".treemap-node")
      .data(hierarchy.leaves(), d => d.data.category)
      .join("g")
      .attr("class", "treemap-node")
      .attr("transform", d => `translate(${d.x0},${d.y0})`)
      .style("cursor", "pointer")
      .on("click", (_, d) => {
        this.onFilter?.({
          column: dimension,
          operator: "equals",
          value: d.data.category
        });
      });

    nodes.append("rect")
      .attr("width", d => Math.max(0, d.x1 - d.x0))
      .attr("height", d => Math.max(0, d.y1 - d.y0))
      .attr("rx", 3)
      .attr("fill", d => this.colorStore
        ? this.colorStore.getDimensionColor(dimension, d.data.category)
        : "currentColor")
      .attr("fill-opacity", 0.88)
      .attr("stroke", "var(--panel)")
      .attr("stroke-width", 1);

    nodes.append("title")
      .text(d => `${d.data.category}\n${humanize(measure)}: ${formatValue(d.data.value)}`);

    nodes.each(function(d) {
      const node = d3.select(this);
      const nodeWidth = d.x1 - d.x0;
      const nodeHeight = d.y1 - d.y0;
      if (nodeWidth < 55 || nodeHeight < 28) return;

      const label = node.append("text")
        .attr("x", 7)
        .attr("y", 17)
        .attr("fill", "white")
        .attr("font-size", 12)
        .attr("font-weight", 600)
        .style("pointer-events", "none");

      label.append("tspan").text(truncate(d.data.category, Math.max(8, Math.floor(nodeWidth / 7))));

      if (nodeHeight >= 45) {
        label.append("tspan")
          .attr("x", 7)
          .attr("dy", 16)
          .attr("font-size", 10)
          .attr("font-weight", 400)
          .text(formatValue(d.data.value));
      }
    });
  }

  destroy() {
    cleanupChartLifecycle(this);
    this.svg.remove();
  }
}

function humanize(value) {
  return String(value ?? "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, match => match.toUpperCase());
}

function formatValue(value) {
  const number = Number(value);
  return Number.isFinite(number)
    ? new Intl.NumberFormat(undefined, {maximumFractionDigits: 2}).format(number)
    : String(value ?? "");
}

function truncate(value, maxLength) {
  const text = String(value ?? "");
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(1, maxLength - 1))}…`;
}
