import * as d3 from "d3";
import {emitCategory, emitCategories, emitNumericRange, emitClear} from "../interactions/chart-interaction-contract.js";
import {observeChartResize} from "./chart-lifecycle.js";
import {cleanupChartLifecycle} from "./chart-lifecycle.js";

export class ComboChart {
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
    const series = this.visualization.query.series ?? [];
    if (!dimension || series.length < 2) return;

    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width < 20 || height < 20) return;

    this.root.selectAll("*").remove();
    this.svg = this.root.append("svg")
      .attr("width", "100%")
      .attr("height", "100%")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "none");

    const margin = {top: 20, right: 24, bottom: 64, left: 58};
    const iw = Math.max(10, width - margin.left - margin.right);
    const ih = Math.max(10, height - margin.top - margin.bottom);
    const chart = this.svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const cats = data.map(row => String(row[dimension] ?? ""));
    const x = d3.scaleBand().domain(cats).range([0, iw]).padding(0.16);
    const max = d3.max(data, row => d3.max(series, s => Math.max(0, Number(row[s.measure]) || 0))) ?? 0;
    const y = d3.scaleLinear().domain([0, max || 1]).nice().range([ih, 0]);

    chart.append("g")
      .attr("transform", `translate(0,${ih})`)
      .call(d3.axisBottom(x))
      .selectAll("text")
      .attr("transform", "rotate(-30)")
      .style("text-anchor", "end");
    chart.append("g").call(d3.axisLeft(y).ticks(5));

    chart.append("text")
      .attr("class", "chart-axis-label")
      .attr("x", iw / 2)
      .attr("y", ih + 58)
      .attr("text-anchor", "middle")
      .attr("fill", "currentColor")
      .attr("font-size", 11)
      .text(humanize(dimension));

    chart.append("text")
      .attr("class", "chart-axis-label")
      .attr("transform", "rotate(-90)")
      .attr("x", -ih / 2)
      .attr("y", -42)
      .attr("text-anchor", "middle")
      .attr("fill", "currentColor")
      .attr("font-size", 11)
      .text(series.map(s => humanize(s.measure)).join(" / "));

    const lineSeries = series.filter(s => s.style === "line");
    const barSeries = series.filter(s => s.style === "bar");
    const barWidth = x.bandwidth() / Math.max(1, barSeries.length);

    barSeries.forEach((s, index) => {
      chart.selectAll(`.combo-bar-${index}`)
        .data(data)
        .join("rect")
        .attr("class", `combo-bar-${index}`)
        .attr("data-interaction-target", "category-click")
        .attr("x", row => x(String(row[dimension])) + index * barWidth)
        .attr("y", row => y(Math.max(0, Number(row[s.measure]) || 0)))
        .attr("width", Math.max(1, barWidth - 2))
        .attr("height", row => ih - y(Math.max(0, Number(row[s.measure]) || 0)))
        .attr("fill", () => this.measureColor(s.measure, index))
        .style("cursor", "pointer")
        .on("click", (_, row) => this.onFilter?.({
          column: dimension,
          operator: "equals",
          value: row[dimension]
        }));
    });

    lineSeries.forEach((s, index) => {
      const line = d3.line()
        .defined(row => Number.isFinite(Number(row[s.measure])))
        .x(row => x(String(row[dimension])) + x.bandwidth() / 2)
        .y(row => y(Number(row[s.measure]) || 0));

      chart.append("path")
        .datum(data)
        .attr("fill", "none")
        .attr("stroke", this.measureColor(s.measure, barSeries.length + index))
        .attr("stroke-width", 2.5)
        .attr("d", line);

      chart.selectAll(`.combo-point-${index}`)
        .data(data)
        .join("circle")
        .attr("class", `combo-point-${index}`)
        .attr("data-interaction-target", "category-click")
        .attr("cx", row => x(String(row[dimension])) + x.bandwidth() / 2)
        .attr("cy", row => y(Number(row[s.measure]) || 0))
        .attr("r", 3.5)
        .attr("fill", this.measureColor(s.measure, barSeries.length + index))
        .style("cursor", "pointer")
        .on("click", (_, row) => this.onFilter?.({
          column: dimension,
          operator: "equals",
          value: row[dimension]
        }))
        .append("title")
        .text(row => `${s.measure}: ${formatValue(row[s.measure])}`);
    });

    this.addCategoryBrush(chart, x, cats, dimension, iw, ih);
    this.addLegend(series, width, height, margin.left);
  }

  measureColor(measure, index) {
    return this.colorStore
      ? this.colorStore.getMeasureColor(measure)
      : d3.schemeTableau10[index % d3.schemeTableau10.length];
  }

  addLegend(series, width, height, left) {
    const legend = this.svg.append("g")
      .attr("transform", `translate(${left},${height - 14})`);
    let lx = 0;
    series.forEach((s, index) => {
      const item = legend.append("g").attr("transform", `translate(${lx},0)`);
      const color = this.measureColor(s.measure, index);
      if (s.style === "bar") {
        item.append("rect").attr("width", 10).attr("height", 10).attr("y", -9).attr("fill", color);
      } else {
        item.append("line")
          .attr("x1", 0).attr("x2", 11).attr("y1", -4).attr("y2", -4)
          .attr("stroke", color).attr("stroke-width", 2.5);
        item.append("circle").attr("cx", 5.5).attr("cy", -4).attr("r", 2.5).attr("fill", color);
      }
      item.append("text")
        .attr("x", 15)
        .attr("y", 0)
        .attr("font-size", 11)
        .attr("fill", "currentColor")
        .text(`${s.measure} (${s.style})`);
      lx += s.measure.length * 7 + s.style.length * 7 + 65;
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

        if (!selected.length || (a <= 0.5 && b >= width - 0.5)) {
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
    group.selectAll(".handle").attr("fill", "var(--primary)");
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
