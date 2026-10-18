import * as d3 from "d3";
import {emitCategory, emitCategories, emitNumericRange, emitClear} from "../interactions/chart-interaction-contract.js";
import {observeChartResize} from "./chart-lifecycle.js";
import {cleanupChartLifecycle} from "./chart-lifecycle.js";

export class DensityChart {
  constructor(container, visualization, {onFilter} = {}) {
    this.container = container;
    this.visualization = visualization;
    this.onFilter = onFilter;
    this.root = d3.select(container);
    observeChartResize(this, container);
  }

  renderData(data) {
    this.data = data;
    const column = this.visualization.query.densityColumn;
    const values = (Array.isArray(data) ? data : [])
      .map(row => Number(row[column])).filter(Number.isFinite);
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width < 40 || height < 40) return;
    const margin = {top: 22, right: 22, bottom: 58, left: 62};
    const iw = Math.max(10, width - margin.left - margin.right);
    const ih = Math.max(10, height - margin.top - margin.bottom);
    this.root.selectAll("*").remove();
    const svg = this.root.append("svg").attr("width", "100%").attr("height", "100%")
      .attr("viewBox", `0 0 ${width} ${height}`).attr("preserveAspectRatio", "none");
    const chart = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
    if (!values.length) {
      chart.append("text").attr("x", iw / 2).attr("y", ih / 2).attr("text-anchor", "middle")
        .attr("fill", "currentColor").text("No numeric data");
      return;
    }
    let min = d3.min(values), max = d3.max(values);
    if (min === max) { const pad = Math.abs(min) * 0.05 || 1; min -= pad; max += pad; }
    const sd = d3.deviation(values) || (max - min) / 6;
    const bandwidth = Math.max(1.06 * sd * Math.pow(values.length, -0.2), (max - min) / 1000, Number.EPSILON);
    const pad = bandwidth * 3;
    const domain = [min - pad, max + pad];
    const samples = d3.range(121).map(i => domain[0] + (domain[1] - domain[0]) * i / 120);
    const gaussian = u => Math.exp(-0.5 * u * u) / Math.sqrt(2 * Math.PI);
    const density = samples.map(value => ({value, density: d3.mean(values, v => gaussian((value - v) / bandwidth)) / bandwidth}));
    const x = d3.scaleLinear().domain(domain).range([0, iw]);
    const y = d3.scaleLinear().domain([0, d3.max(density, d => d.density) || 1]).nice().range([ih, 0]);
    chart.append("g").attr("transform", `translate(0,${ih})`).call(d3.axisBottom(x).ticks(6));
    chart.append("g").call(d3.axisLeft(y).ticks(5));
    chart.append("text").attr("x", iw / 2).attr("y", ih + 44).attr("text-anchor", "middle")
      .attr("fill", "currentColor").attr("font-size", 11).text(column);
    chart.append("text").attr("transform", "rotate(-90)").attr("x", -ih / 2).attr("y", -43)
      .attr("text-anchor", "middle").attr("fill", "currentColor").attr("font-size", 11).text("Probability density");
    const area = d3.area().curve(d3.curveCatmullRom).x(d => x(d.value)).y0(ih).y1(d => y(d.density));
    chart.append("path").datum(density).attr("d", area).attr("fill", "var(--primary)")
      .attr("fill-opacity", 0.22).attr("stroke", "var(--primary)").attr("stroke-width", 2);
    chart.selectAll("circle.density-observation").data(values).join("circle")
      .attr("class", "density-observation").attr("cx", value => x(value)).attr("cy", ih + 1)
      .attr("r", 1.7).attr("fill", "var(--primary)").attr("fill-opacity", 0.45);
    chart.append("text").attr("x", iw).attr("y", 12).attr("text-anchor", "end")
      .attr("fill", "currentColor").attr("font-size", 10).text(`${values.length} observations · bandwidth ${formatNumber(bandwidth)}`);
    this.addRangeBrush(chart, x, domain, column, iw, ih);
  }

  addRangeBrush(chart, scale, domain, column, width, height) {
    const brush = d3.brushX().extent([[0, height], [width, height + 28]])
      .on("end", event => {
        if (!event.selection || !event.sourceEvent) return;
        const [a, b] = event.selection;
        const low = Math.max(domain[0], Math.min(domain[1], scale.invert(a)));
        const high = Math.max(domain[0], Math.min(domain[1], scale.invert(b)));
        if (low <= domain[0] + 1e-9 && high >= domain[1] - 1e-9) {
          emitClear(this.onFilter, column);
          return;
        }
        emitNumericRange(this.onFilter, column, low, high);
      });
    const group = chart.append("g").attr("class", "chart-brush chart-x-brush density-brush").call(brush);
    group.select(".overlay").attr("fill", "transparent").attr("cursor", "crosshair");
    group.select(".selection").attr("fill", "var(--primary)").attr("fill-opacity", 0.22).attr("stroke", "var(--primary)");
    group.selectAll(".handle").attr("fill", "var(--primary)");
  }

  destroy() {
    cleanupChartLifecycle(this);
    this.root.selectAll("*").remove();
  }
}
function formatNumber(value) { return new Intl.NumberFormat(undefined, {maximumFractionDigits: 3}).format(value); }
