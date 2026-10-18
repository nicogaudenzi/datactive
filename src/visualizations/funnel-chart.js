import * as d3 from "d3";
import {emitCategory, emitCategories, emitNumericRange, emitClear} from "../interactions/chart-interaction-contract.js";
import {observeChartResize} from "./chart-lifecycle.js";
import {cleanupChartLifecycle} from "./chart-lifecycle.js";

export class FunnelChart {
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

    // Keep the DataEngine's group order: funnel stages are semantic and should
    // not be sorted by value unless a future sorting option is introduced.
    const stages = data
      .map(row => ({
        category: String(row[dimension] ?? ""),
        value: Number(row[measure])
      }))
      .filter(row => row.category && Number.isFinite(row.value) && row.value >= 0);

    if (!stages.length) {
      this.svg.append("text")
        .attr("x", width / 2)
        .attr("y", height / 2)
        .attr("text-anchor", "middle")
        .attr("fill", "currentColor")
        .attr("opacity", 0.65)
        .text("No non-negative numeric values to display");
      return;
    }

    const maxValue = d3.max(stages, stage => stage.value) ?? 0;
    const firstValue = stages[0]?.value ?? 0;
    const margin = {top: 28, right: 24, bottom: 24, left: 24};
    const iw = Math.max(10, width - margin.left - margin.right);
    const ih = Math.max(10, height - margin.top - margin.bottom);
    const gap = Math.min(10, Math.max(4, ih / Math.max(12, stages.length * 8)));
    const stageHeight = Math.max(24, (ih - gap * (stages.length - 1)) / stages.length);
    const maxStageWidth = iw * 0.86;
    const center = width / 2;
    const widthScale = d3.scaleLinear()
      .domain([0, maxValue || 1])
      .range([iw * 0.18, maxStageWidth]);

    const chart = this.svg.append("g")
      .attr("transform", `translate(0,${margin.top})`);

    const nodes = chart.selectAll(".funnel-stage")
      .data(stages)
      .join("g")
      .attr("class", "funnel-stage")
      .attr("transform", (_, index) => `translate(0,${index * (stageHeight + gap)})`)
      .style("cursor", "pointer")
      .on("click", (_, stage) => this.onFilter?.({
        column: dimension,
        operator: "equals",
        value: stage.category
      }));

    nodes.each((stage, index, nodesArray) => {
      const group = d3.select(nodesArray[index]);
      const currentWidth = widthScale(stage.value);
      const nextWidth = index < stages.length - 1
        ? widthScale(stages[index + 1].value)
        : currentWidth * 0.82;
      const x1 = center - currentWidth / 2;
      const x2 = center + currentWidth / 2;
      const nx1 = center - nextWidth / 2;
      const nx2 = center + nextWidth / 2;
      const y1 = 0;
      const y2 = stageHeight;

      group.append("path")
        .attr("d", `M ${x1} ${y1} L ${x2} ${y1} L ${nx2} ${y2} L ${nx1} ${y2} Z`)
        .attr("fill", this.categoryColor(dimension, stage.category))
        .attr("fill-opacity", 0.84)
        .attr("stroke", "currentColor")
        .attr("stroke-opacity", 0.14);

      group.append("text")
        .attr("x", center)
        .attr("y", stageHeight / 2 - 4)
        .attr("text-anchor", "middle")
        .attr("fill", "currentColor")
        .attr("font-size", 12)
        .attr("font-weight", 600)
        .text(humanize(stage.category));

      group.append("text")
        .attr("x", center)
        .attr("y", stageHeight / 2 + 14)
        .attr("text-anchor", "middle")
        .attr("fill", "currentColor")
        .attr("font-size", 11)
        .attr("opacity", 0.82)
        .text(`${formatValue(stage.value)}${firstValue > 0 ? ` · ${formatPercent(stage.value / firstValue)}` : ""}`);

      group.append("title")
        .text(`${stage.category}\n${humanize(measure)}: ${formatValue(stage.value)}\n${firstValue > 0 ? `${formatPercent(stage.value / firstValue)} of first stage` : ""}`);
    });

    this.svg.append("text")
      .attr("x", center)
      .attr("y", height - 8)
      .attr("text-anchor", "middle")
      .attr("fill", "currentColor")
      .attr("font-size", 11)
      .attr("opacity", 0.65)
      .text(`${humanize(measure)} by ${humanize(dimension)}`);
  }

  categoryColor(column, category) {
    return this.colorStore
      ? this.colorStore.getDimensionColor(column, category)
      : "var(--primary)";
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

function formatPercent(value) {
  return new Intl.NumberFormat(undefined, {
    style: "percent",
    maximumFractionDigits: 1
  }).format(value);
}
