import * as d3 from "d3";
import {emitCategory, emitCategories, emitNumericRange, emitClear} from "../interactions/chart-interaction-contract.js";
import {observeChartResize} from "./chart-lifecycle.js";
import {cleanupChartLifecycle} from "./chart-lifecycle.js";

export class HeatmapChart {
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
    const dimensions = this.visualization.query.dimensions ?? [];
    const measure = this.visualization.query.measures?.[0]?.column;
    const xDimension = dimensions[0];
    const yDimension = dimensions[1];
    if (!xDimension || !yDimension || !measure) return;

    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width < 20 || height < 20) return;

    const margin = {top: 28, right: 24, bottom: 62, left: 82};
    const iw = Math.max(10, width - margin.left - margin.right);
    const ih = Math.max(10, height - margin.top - margin.bottom);

    this.root.selectAll("*").remove();
    this.svg = this.root.append("svg").attr("width", "100%").attr("height", "100%");
    const svg = this.svg.attr("viewBox", `0 0 ${width} ${height}`).attr("preserveAspectRatio", "none");
    const chart = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const xCategories = [...new Set(data.map(row => String(row[xDimension])))];
    const yCategories = [...new Set(data.map(row => String(row[yDimension])))];
    const values = data.map(row => Number(row[measure])).filter(Number.isFinite);
    const max = d3.max(values) ?? 0;
    const min = d3.min(values) ?? 0;
    const domainMax = max === min ? max + 1 : max;
    const domainMin = min === max ? Math.min(0, min) : min;

    const x = d3.scaleBand().domain(xCategories).range([0, iw]).padding(0.04);
    const y = d3.scaleBand().domain(yCategories).range([0, ih]).padding(0.04);
    const color = d3.scaleSequential(d3.interpolateBlues).domain([domainMin, domainMax]);

    chart.append("g")
      .attr("transform", `translate(0,${ih})`)
      .call(d3.axisBottom(x))
      .selectAll("text")
      .attr("transform", "rotate(-30)")
      .style("text-anchor", "end");

    chart.append("g").call(d3.axisLeft(y));

    const cells = chart.selectAll(".heatmap-cell")
      .data(data.filter(row => Number.isFinite(Number(row[measure]))), row => `${row[xDimension]}\u0000${row[yDimension]}`)
      .join("rect")
      .attr("class", "heatmap-cell")
      .attr("x", row => x(String(row[xDimension])))
      .attr("y", row => y(String(row[yDimension])))
      .attr("width", x.bandwidth())
      .attr("height", y.bandwidth())
      .attr("fill", row => color(Number(row[measure])))
      .attr("stroke", "var(--panel)")
      .attr("stroke-width", 1)
      .style("cursor", "pointer")
      .on("click", (_, row) => {
        this.onFilter?.([
          {column: xDimension, operator: "equals", value: row[xDimension]},
          {column: yDimension, operator: "equals", value: row[yDimension]}
        ]);
      });

    cells.append("title")
      .text(row => `${row[yDimension]} — ${row[xDimension]}\n${measure}: ${formatValue(row[measure])}`);

    // Keep axis labels explicit and tied to the configured dimensions/measure.
    svg.append("text")
      .attr("class", "chart-axis-label")
      .attr("x", margin.left + iw / 2)
      .attr("y", height - 8)
      .attr("text-anchor", "middle")
      .attr("fill", "currentColor")
      .text(humanize(xDimension));

    svg.append("text")
      .attr("class", "chart-axis-label")
      .attr("transform", `translate(15,${margin.top + ih / 2}) rotate(-90)`)
      .attr("text-anchor", "middle")
      .attr("fill", "currentColor")
      .text(humanize(yDimension));

    // Numeric color legend. This intentionally does not use the categorical
    // ColorStore: heatmap color encodes magnitude, not category identity.
    const legendWidth = Math.min(180, iw * 0.32);
    const legendX = margin.left + iw - legendWidth;
    const legendY = 8;
    const gradientId = `heatmap-gradient-${this.visualization.id}`;
    const defs = svg.append("defs");
    const gradient = defs.append("linearGradient")
      .attr("id", gradientId)
      .attr("x1", "0%")
      .attr("x2", "100%");
    d3.range(0, 1.01, 0.1).forEach(t => {
      gradient.append("stop")
        .attr("offset", `${t * 100}%`)
        .attr("stop-color", color(domainMin + (domainMax - domainMin) * t));
    });

    svg.append("rect")
      .attr("x", legendX)
      .attr("y", legendY)
      .attr("width", legendWidth)
      .attr("height", 8)
      .attr("rx", 2)
      .attr("fill", `url(#${gradientId})`);
    svg.append("text").attr("x", legendX).attr("y", legendY - 4).attr("font-size", 10).attr("fill", "currentColor").text(humanize(measure));
    svg.append("text").attr("x", legendX).attr("y", legendY + 23).attr("font-size", 9).attr("fill", "currentColor").text(formatValue(domainMin));
    svg.append("text").attr("x", legendX + legendWidth).attr("y", legendY + 23).attr("text-anchor", "end").attr("font-size", 9).attr("fill", "currentColor").text(formatValue(domainMax));
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
