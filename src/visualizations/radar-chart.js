import * as d3 from "d3";
import {emitCategory, emitCategories, emitNumericRange, emitClear} from "../interactions/chart-interaction-contract.js";
import {observeChartResize} from "./chart-lifecycle.js";
import {cleanupChartLifecycle} from "./chart-lifecycle.js";

export class RadarChart {
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
    const dimension = this.visualization.query.dimensions?.[0];
    const measures = this.visualization.query.measures ?? [];
    if (!dimension || !measures.length) return;

    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width < 40 || height < 40) return;

    this.root.selectAll("*").remove();
    const svg = this.root.append("svg")
      .attr("width", "100%")
      .attr("height", "100%")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet");

    const categories = [...new Set(data.map(row => String(row[dimension] ?? "")).filter(Boolean))];
    const validMeasures = measures.filter(measure => data.some(row => Number.isFinite(Number(row[measure.column]))));
    if (categories.length < 3 || !validMeasures.length) {
      svg.append("text").attr("x", width / 2).attr("y", height / 2)
        .attr("text-anchor", "middle").attr("fill", "currentColor")
        .text(categories.length < 3 ? "Radar charts need at least 3 categories" : "No numeric values to display");
      return;
    }

    const legendHeight = 24;
    const radius = Math.max(30, Math.min((width - 100) / 2, (height - 95 - legendHeight) / 2));
    const centerX = width / 2;
    const centerY = Math.max(radius + 35, (height - legendHeight) / 2 + 8);
    const maxValue = d3.max(data.flatMap(row => validMeasures.map(m => Number(row[m.column])).filter(Number.isFinite))) ?? 1;
    const scale = d3.scaleLinear().domain([0, maxValue > 0 ? maxValue : 1]).range([0, radius]).clamp(true);
    const angle = index => -Math.PI / 2 + index * (Math.PI * 2 / categories.length);
    const point = (index, value) => [centerX + Math.cos(angle(index)) * scale(Math.max(0, value)), centerY + Math.sin(angle(index)) * scale(Math.max(0, value))];

    const grid = svg.append("g").attr("class", "radar-grid");
    for (let level = 1; level <= 4; level++) {
      const r = radius * level / 4;
      grid.append("polygon").attr("points", categories.map((_, i) => `${centerX + Math.cos(angle(i)) * r},${centerY + Math.sin(angle(i)) * r}`).join(" "))
        .attr("fill", "none").attr("stroke", "currentColor").attr("stroke-opacity", 0.16);
      grid.append("text").attr("x", centerX + 4).attr("y", centerY - r + 12).attr("font-size", 9)
        .attr("fill", "currentColor").attr("opacity", 0.6).text(d3.format("~s")(maxValue * level / 4));
    }

    categories.forEach((category, index) => {
      const outerX = centerX + Math.cos(angle(index)) * radius;
      const outerY = centerY + Math.sin(angle(index)) * radius;
      svg.append("line").attr("x1", centerX).attr("y1", centerY).attr("x2", outerX).attr("y2", outerY)
        .attr("stroke", "currentColor").attr("stroke-opacity", 0.22);
      const labelRadius = radius + 17;
      const label = svg.append("text")
        .attr("x", centerX + Math.cos(angle(index)) * labelRadius)
        .attr("y", centerY + Math.sin(angle(index)) * labelRadius)
        .attr("text-anchor", Math.cos(angle(index)) > 0.25 ? "start" : Math.cos(angle(index)) < -0.25 ? "end" : "middle")
        .attr("dominant-baseline", Math.sin(angle(index)) > 0.35 ? "hanging" : Math.sin(angle(index)) < -0.35 ? "auto" : "middle")
        .attr("font-size", 11).attr("fill", "currentColor").style("cursor", "pointer")
        .text(category.length > 16 ? `${category.slice(0, 15)}…` : category)
        .on("click", () => this.onFilter?.({column: dimension, operator: "equals", value: category}));
      label.append("title").text(`Filter ${dimension}: ${category}`);
    });

    const line = d3.line().x(d => d[0]).y(d => d[1]).curve(d3.curveLinearClosed);
    validMeasures.forEach((measure, seriesIndex) => {
      const color = this.colorStore?.getMeasureColor(measure.column) ?? d3.schemeTableau10[seriesIndex % 10];
      const points = categories.map((category, index) => {
        const row = data.find(item => String(item[dimension] ?? "") === category);
        const value = Number(row?.[measure.column]);
        return point(index, Number.isFinite(value) ? value : 0);
      });
      svg.append("path").attr("d", line(points)).attr("fill", color).attr("fill-opacity", 0.12)
        .attr("stroke", color).attr("stroke-width", 2).attr("stroke-linejoin", "round");
      svg.selectAll(`.radar-dot-${seriesIndex}`).data(points).join("circle")
        .attr("cx", d => d[0]).attr("cy", d => d[1]).attr("r", 3.5).attr("fill", color)
        .append("title").text((_, index) => {
          const row = data.find(item => String(item[dimension] ?? "") === categories[index]);
          return `${measure.column} · ${categories[index]}: ${formatValue(row?.[measure.column])}`;
        });
    });

    const legendItems = validMeasures;
    const itemWidth = Math.min(150, (width - 24) / Math.max(1, legendItems.length));
    const totalLegendWidth = itemWidth * legendItems.length;
    const legend = svg.append("g").attr("transform", `translate(${Math.max(12, (width - totalLegendWidth) / 2)},${height - 20})`);
    legendItems.forEach((measure, index) => {
      const item = legend.append("g").attr("transform", `translate(${index * itemWidth},0)`);
      const color = this.colorStore?.getMeasureColor(measure.column) ?? d3.schemeTableau10[index % 10];
      item.append("line").attr("x1", 0).attr("x2", 16).attr("y1", 0).attr("y2", 0).attr("stroke", color).attr("stroke-width", 3);
      item.append("text").attr("x", 21).attr("y", 4).attr("font-size", 11).attr("fill", "currentColor").text(measure.column);
    });
  }

  destroy() {
    cleanupChartLifecycle(this);
    this.root.selectAll("*").remove();
  }
}

function formatValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? new Intl.NumberFormat(undefined, {maximumFractionDigits: 2}).format(number) : "—";
}
