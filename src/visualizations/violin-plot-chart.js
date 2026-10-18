import * as d3 from "d3";
import {emitCategory, emitCategories, emitNumericRange, emitClear} from "../interactions/chart-interaction-contract.js";
import {observeChartResize} from "./chart-lifecycle.js";
import {cleanupChartLifecycle} from "./chart-lifecycle.js";

export class ViolinPlotChart {
  constructor(container, visualization, {onFilter, colorStore} = {}) {
    this.container = container;
    this.visualization = visualization;
    this.onFilter = onFilter;
    this.colorStore = colorStore;
    this.root = d3.select(container);
    observeChartResize(this, container);
  }

  renderData(data) {
    this.data = data;
    const dimension = this.visualization.query.violinPlotDimension;
    const measure = this.visualization.query.violinPlotMeasure;
    if (!dimension || !measure || !Array.isArray(data)) return;

    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width < 40 || height < 40) return;
    const margin = {top: 22, right: 22, bottom: 66, left: 62};
    const iw = Math.max(10, width - margin.left - margin.right);
    const ih = Math.max(10, height - margin.top - margin.bottom);
    this.root.selectAll("*").remove();
    const svg = this.root.append("svg").attr("width", "100%").attr("height", "100%")
      .attr("viewBox", `0 0 ${width} ${height}`).attr("preserveAspectRatio", "none");
    const chart = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const groups = new Map();
    for (const row of data) {
      const rawCategory = row[dimension];
      const rawValue = Number(row[measure]);
      if (rawCategory == null || !Number.isFinite(rawValue)) continue;
      const category = String(rawCategory);
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category).push(rawValue);
    }
    const categories = [...groups.keys()];
    const values = [...groups.values()].flat();
    if (!categories.length || !values.length) {
      chart.append("text").attr("x", iw / 2).attr("y", ih / 2).attr("text-anchor", "middle")
        .attr("fill", "currentColor").text("No numeric data");
      return;
    }
    let min = d3.min(values), max = d3.max(values);
    if (min === max) { const pad = Math.abs(min) * 0.05 || 1; min -= pad; max += pad; }
    const x = d3.scaleBand().domain(categories).range([0, iw]).padding(0.22);
    const y = d3.scaleLinear().domain([min, max]).nice().range([ih, 0]);
    chart.append("g").attr("transform", `translate(0,${ih})`).call(d3.axisBottom(x))
      .selectAll("text").attr("transform", "rotate(-30)").style("text-anchor", "end");
    chart.append("g").call(d3.axisLeft(y).ticks(6));
    chart.append("text").attr("x", iw / 2).attr("y", ih + margin.bottom - 5)
      .attr("text-anchor", "middle").attr("fill", "currentColor")
      .attr("font-size", 11).text(dimension);
    chart.append("text").attr("transform", "rotate(-90)").attr("x", -ih / 2).attr("y", -45)
      .attr("text-anchor", "middle").attr("fill", "currentColor")
      .attr("font-size", 11).text(measure);

    const samples = d3.range(41).map(i => min + (max - min) * i / 40);
    const bandwidth = Math.max((max - min) / 18, Number.EPSILON);
    const gaussian = u => Math.exp(-0.5 * u * u) / Math.sqrt(2 * Math.PI);
    const densities = categories.map(category => {
      const nums = groups.get(category);
      return {category, points: samples.map(value => [value, d3.mean(nums, n => gaussian((value - n) / bandwidth)) / bandwidth])};
    });
    const maxDensity = d3.max(densities, group => d3.max(group.points, point => point[1])) || 1;
    const halfWidth = d3.scaleLinear().domain([0, maxDensity]).range([0, Math.max(4, x.bandwidth() * 0.46)]);

    for (const group of densities) {
      const center = x(group.category) + x.bandwidth() / 2;
      const area = d3.area().curve(d3.curveCatmullRom).y(point => y(point[0]))
        .x0(point => center - halfWidth(point[1])).x1(point => center + halfWidth(point[1]));
      const color = this.colorStore?.getDimensionColor?.(dimension, group.category) ?? "var(--primary)";
      chart.append("path").datum(group.points).attr("d", area)
        .attr("data-interaction-target", "category-click")
        .attr("fill", color).attr("fill-opacity", 0.42).attr("stroke", color).attr("stroke-width", 1.3)
        .style("cursor", "pointer")
        .on("click", (event) => {
          event.stopPropagation();
          emitCategory(this.onFilter, dimension, group.category);
        })
        .append("title").text(`${group.category}: ${groups.get(group.category).length} observations`);
      chart.append("line").attr("x1", center - 3).attr("x2", center + 3)
        .attr("y1", y(d3.median(groups.get(group.category)))).attr("y2", y(d3.median(groups.get(group.category))))
        .attr("stroke", "currentColor").attr("stroke-width", 2).style("pointer-events", "none");
    }

    // Brush across the category axis to filter one or more violins.
    const brush = d3.brushX()
      .extent([[0, ih], [iw, ih + 28]])
      .on("end", event => {
        if (!event.selection || !event.sourceEvent) return;
        const [a, b] = event.selection;
        const selected = categories.filter(category => {
          const center = x(category) + x.bandwidth() / 2;
          return center >= a && center <= b;
        });

        if (!selected.length || (a <= 0.5 && b >= iw - 0.5)) {
          emitClear(this.onFilter, dimension);
          return;
        }
        emitCategories(this.onFilter, dimension, selected);
      });

    const brushGroup = chart.append("g")
      .attr("class", "chart-brush chart-category-brush")
      .call(brush);
    brushGroup.select(".overlay").attr("fill", "transparent").attr("cursor", "crosshair");
    brushGroup.select(".selection")
      .attr("fill", "var(--primary)").attr("fill-opacity", 0.22)
      .attr("stroke", "var(--primary)");
    brushGroup.selectAll(".handle").attr("fill", "var(--primary)");
  }

  destroy() {
    cleanupChartLifecycle(this);
    this.root.selectAll("*").remove();
  }
}
