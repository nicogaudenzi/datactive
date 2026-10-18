import * as d3 from "d3";
import {emitCategory, emitCategories, emitNumericRange, emitClear} from "../interactions/chart-interaction-contract.js";
import {observeChartResize} from "./chart-lifecycle.js";
import {cleanupChartLifecycle} from "./chart-lifecycle.js";

export class PieChart {
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
    const measure = this.visualization.query.measures?.[0];
    if (!dimension || !measure) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width < 20 || height < 20) return;

    this.root.selectAll("*").remove();
    this.svg = this.root.append("svg").attr("width", "100%").attr("height", "100%");
    const svg = this.svg.attr("viewBox", `0 0 ${width} ${height}`).attr("preserveAspectRatio", "none");
    const radius = Math.max(10, Math.min(width * 0.32, height * 0.38));
    const cx = width * 0.38;
    const cy = height * 0.48;
    const values = data.map(row => ({name: String(row[dimension]), value: Math.max(0, Number(row[measure.column]) || 0), row}));
    const total = d3.sum(values, d => d.value);
    const color = this.colorStore
      ? value => this.colorStore.getDimensionColor(dimension, value)
      : d3.scaleOrdinal().domain(values.map(d => d.name)).range(d3.schemeTableau10);
    const pie = d3.pie().sort(null).value(d => d.value);
    const arc = d3.arc().innerRadius(this.visualization.query.donut ? radius * 0.55 : 0).outerRadius(radius);

    svg.append("g").attr("transform", `translate(${cx},${cy})`)
      .selectAll("path").data(pie(values)).join("path")
      .attr("d", arc).attr("fill", d => color(d.data.name)).attr("stroke", "var(--panel)").attr("stroke-width", 2)
      .style("cursor", "pointer")
      .on("click", (_, d) => this.onFilter?.({column: dimension, operator: "equals", value: d.data.row[dimension]}));

    if (this.visualization.query.donut && total > 0) {
      svg.append("text").attr("x", cx).attr("y", cy - 4).attr("text-anchor", "middle").attr("font-size", 18).attr("font-weight", 700).text(d3.format(",.0f")(total));
      svg.append("text").attr("x", cx).attr("y", cy + 15).attr("text-anchor", "middle").attr("font-size", 11).attr("fill", "currentColor").text(measure.column);
    }

    const legend = svg.append("g").attr("transform", `translate(${Math.min(width * 0.67, width - 120)},${Math.max(18, height * 0.12)})`);
    values.forEach((d, i) => {
      const y = i * 22;
      const percent = total ? d.value / total : 0;
      const item = legend.append("g").attr("transform", `translate(0,${y})`);
      item.append("rect").attr("width", 10).attr("height", 10).attr("y", -9).attr("fill", color(d.name));
      item.append("text").attr("x", 15).attr("y", 0).attr("font-size", 11).attr("fill", "currentColor").text(`${d.name} (${d3.format(".1%")(percent)})`);
    });
  }

  destroy() {
    cleanupChartLifecycle(this);
    this.svg.remove();
  }
}
