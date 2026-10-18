import * as d3 from "d3";
import {emitCategory, emitCategories, emitNumericRange, emitClear} from "../interactions/chart-interaction-contract.js";
import {observeChartResize} from "./chart-lifecycle.js";
import {cleanupChartLifecycle} from "./chart-lifecycle.js";

export class HistogramChart {
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
    const column = data?.column ?? this.visualization.query.histogramColumn;
    const bins = data?.bins ?? [];
    const domain = data?.domain ?? [0, 1];
    if (!column) return;

    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width < 20 || height < 20) return;

    const margin = {top: 20, right: 20, bottom: 54, left: 54};
    const iw = Math.max(10, width - margin.left - margin.right);
    const ih = Math.max(10, height - margin.top - margin.bottom);

    this.root.selectAll("*").remove();
    this.svg = this.root.append("svg")
      .attr("width", "100%")
      .attr("height", "100%")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "none");

    const chart = this.svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3.scaleLinear().domain(domain).range([0, iw]);
    const maxCount = d3.max(bins, d => d.count) ?? 0;
    const y = d3.scaleLinear().domain([0, Math.max(1, maxCount)]).nice().range([ih, 0]);

    chart.append("g")
      .attr("transform", `translate(0,${ih})`)
      .call(d3.axisBottom(x).ticks(6));

    chart.append("g")
      .call(d3.axisLeft(y).ticks(5).tickFormat(d3.format("d")));

    chart.append("text")
      .attr("x", iw / 2)
      .attr("y", ih + 45)
      .attr("text-anchor", "middle")
      .attr("fill", "currentColor")
      .attr("font-size", 11)
      .text(column);

    chart.append("text")
      .attr("transform", "rotate(-90)")
      .attr("x", -ih / 2)
      .attr("y", -38)
      .attr("text-anchor", "middle")
      .attr("fill", "currentColor")
      .attr("font-size", 11)
      .text("Count");

    chart.selectAll("rect.histogram-bar")
      .data(bins)
      .join("rect")
      .attr("class", "histogram-bar")
      .attr("x", d => x(d.x0) + 1)
      .attr("y", d => y(d.count))
      .attr("width", d => Math.max(0, x(d.x1) - x(d.x0) - 2))
      .attr("height", d => ih - y(d.count))
      .attr("fill", "var(--primary)")
      .attr("fill-opacity", 0.78)
      .attr("stroke", "var(--panel)")
      .append("title")
      .text(d => `${column}: ${formatNumber(d.x0)} – ${formatNumber(d.x1)}\nCount: ${d.count}`);

    this.addRangeBrush(chart, x, domain, column, iw, ih);
  }

  addRangeBrush(chart, scale, domain, column, width, height) {
    const brush = d3.brushX()
      .extent([[0, height], [width, height + 28]])
      .on("end", event => {
        if (!event.selection || !event.sourceEvent) return;
        const [a, b] = event.selection;
        const low = Math.max(domain[0], Math.min(domain[1], scale.invert(a)));
        const high = Math.max(domain[0], Math.min(domain[1], scale.invert(b)));

        if (low <= domain[0] + 1e-9 && high >= domain[1] - 1e-9) {
          emitClear(this.onFilter, column);
          return;
        }

        this.onFilter?.({
          column,
          operator: "range",
          value: [Math.min(low, high), Math.max(low, high)]
        });
      });

    const group = chart.append("g")
      .attr("class", "chart-brush chart-x-brush histogram-brush")
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

function formatNumber(value) {
  return new Intl.NumberFormat(undefined, {maximumFractionDigits: 2}).format(value);
}
