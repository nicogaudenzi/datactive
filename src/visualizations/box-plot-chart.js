import * as d3 from "d3";
import {emitCategory, emitCategories, emitNumericRange, emitClear} from "../interactions/chart-interaction-contract.js";
import {observeChartResize} from "./chart-lifecycle.js";
import {cleanupChartLifecycle} from "./chart-lifecycle.js";

export class BoxPlotChart {
  constructor(container, visualization, {onFilter} = {}) {
    this.container = container;
    this.visualization = visualization;
    this.onFilter = onFilter;
    this.root = d3.select(container);
    this.svg = this.root.append("svg").attr("width", "100%").attr("height", "100%");
    observeChartResize(this, container);
  }

  renderData(data) {
    this.data = data;
    const dimension = this.visualization.query.boxPlotDimension;
    const measure = this.visualization.query.boxPlotMeasure;
    if (!dimension || !measure || !Array.isArray(data)) return;

    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width < 20 || height < 20) return;

    const margin = {top: 20, right: 24, bottom: 64, left: 58};
    const iw = Math.max(10, width - margin.left - margin.right);
    const ih = Math.max(10, height - margin.top - margin.bottom);

    this.root.selectAll("*").remove();
    this.svg = this.root.append("svg").attr("width", "100%").attr("height", "100%");
    const svg = this.svg
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "none");
    const chart = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const categories = data.map(row => String(row[dimension]));
    const stats = data.map(row => row[measure]).filter(Boolean);
    const allValues = stats.flatMap(stat => [
      stat.lowerWhisker,
      stat.q1,
      stat.median,
      stat.q3,
      stat.upperWhisker,
      ...(stat.outliers ?? [])
    ]).filter(Number.isFinite);

    if (!categories.length || !allValues.length) {
      chart.append("text")
        .attr("x", iw / 2)
        .attr("y", ih / 2)
        .attr("text-anchor", "middle")
        .attr("fill", "currentColor")
        .text("No data");
      return;
    }

    let domainMin = Math.min(...allValues);
    let domainMax = Math.max(...allValues);
    if (domainMin === domainMax) {
      const pad = Math.abs(domainMin) > 0 ? Math.abs(domainMin) * 0.05 : 1;
      domainMin -= pad;
      domainMax += pad;
    }

    const x = d3.scaleBand()
      .domain(categories)
      .range([0, iw])
      .padding(0.25);
    const y = d3.scaleLinear()
      .domain([domainMin, domainMax])
      .nice()
      .range([ih, 0]);

    chart.append("g")
      .attr("transform", `translate(0,${ih})`)
      .call(d3.axisBottom(x))
      .selectAll("text")
      .attr("transform", "rotate(-30)")
      .style("text-anchor", "end");
    chart.append("g").call(d3.axisLeft(y).ticks(6));

    this.addCategoryBrush(chart, x, categories, dimension, iw, ih);

    const color = "var(--primary)";
    const boxWidth = Math.min(48, x.bandwidth() * 0.72);

    for (const row of data) {
      const category = String(row[dimension]);
      const stat = row[measure];
      if (!stat) continue;
      const center = x(category) + x.bandwidth() / 2;
      const left = center - boxWidth / 2;

      chart.append("line")
        .attr("x1", center).attr("x2", center)
        .attr("y1", y(stat.upperWhisker)).attr("y2", y(stat.q3))
        .attr("stroke", color).attr("stroke-width", 1.5);
      chart.append("line")
        .attr("x1", center).attr("x2", center)
        .attr("y1", y(stat.q1)).attr("y2", y(stat.lowerWhisker))
        .attr("stroke", color).attr("stroke-width", 1.5);
      chart.append("line")
        .attr("x1", center - boxWidth * 0.3).attr("x2", center + boxWidth * 0.3)
        .attr("y1", y(stat.upperWhisker)).attr("y2", y(stat.upperWhisker))
        .attr("stroke", color).attr("stroke-width", 1.5);
      chart.append("line")
        .attr("x1", center - boxWidth * 0.3).attr("x2", center + boxWidth * 0.3)
        .attr("y1", y(stat.lowerWhisker)).attr("y2", y(stat.lowerWhisker))
        .attr("stroke", color).attr("stroke-width", 1.5);

      chart.append("rect")
        .attr("x", left)
        .attr("y", y(stat.q3))
        .attr("width", boxWidth)
        .attr("height", Math.max(1, y(stat.q1) - y(stat.q3)))
        .attr("fill", color)
        .attr("fill-opacity", 0.22)
        .attr("data-interaction-target", "category-click")
        .attr("stroke", color)
        .attr("stroke-width", 1.5)
        .style("cursor", "pointer")
        .on("click", () => this.onFilter?.({
          column: dimension,
          operator: "equals",
          value: category
        }));

      chart.append("line")
        .attr("x1", left).attr("x2", left + boxWidth)
        .attr("y1", y(stat.median)).attr("y2", y(stat.median))
        .attr("stroke", color).attr("stroke-width", 3)
        .style("pointer-events", "none");

      const outliers = chart.append("g").attr("class", "box-plot-outliers");
      outliers.selectAll("circle")
        .data(stat.outliers ?? [])
        .join("circle")
        .attr("cx", center)
        .attr("cy", value => y(value))
        .attr("r", 3)
        .attr("data-interaction-target", "category-click")
        .attr("fill", color)
        .attr("fill-opacity", 0.7)
        .style("cursor", "pointer")
        .on("click", () => this.onFilter?.({
          column: dimension,
          operator: "equals",
          value: category
        }));
    }

    const legend = svg.append("g")
      .attr("transform", `translate(${margin.left},${height - 13})`);
    legend.append("rect")
      .attr("x", 0).attr("y", -10)
      .attr("width", 12).attr("height", 10)
      .attr("fill", color).attr("fill-opacity", 0.22)
      .attr("stroke", color);
    legend.append("text")
      .attr("x", 18).attr("y", 0)
      .attr("font-size", 11)
      .attr("fill", "currentColor")
      .text(`${measure} · median, quartiles, 1.5 IQR whiskers`);
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

        if (!selected.length || (a <= 0.5 && b >= width - 0.5)) {
          emitClear(this.onFilter, column);
          return;
        }

        emitCategories(this.onFilter, column, selected);
      });

    const group = chart.append("g")
      .attr("class", "chart-brush chart-category-brush")
      .call(brush);
    group.select(".overlay").attr("fill", "transparent").attr("cursor", "crosshair");
    group.select(".selection").attr("fill", "var(--primary)").attr("fill-opacity", 0.22).attr("stroke", "var(--primary)");
    group.selectAll(".handle").attr("fill", "var(--primary)");
  }

  destroy() {
    cleanupChartLifecycle(this);
    this.svg.remove();
  }
}
