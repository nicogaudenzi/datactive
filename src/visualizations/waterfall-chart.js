import * as d3 from "d3";
import {emitCategory, emitCategories, emitNumericRange, emitClear} from "../interactions/chart-interaction-contract.js";
import {observeChartResize} from "./chart-lifecycle.js";
import {cleanupChartLifecycle} from "./chart-lifecycle.js";

export class WaterfallChart {
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

    const changes = data
      .map(row => ({
        category: String(row[dimension] ?? ""),
        value: Number(row[measure])
      }))
      .filter(row => row.category && Number.isFinite(row.value));

    if (!changes.length) {
      this.svg.append("text")
        .attr("x", width / 2)
        .attr("y", height / 2)
        .attr("text-anchor", "middle")
        .attr("fill", "currentColor")
        .attr("opacity", 0.65)
        .text("No numeric values to display");
      return;
    }

    let running = 0;
    const steps = changes.map(change => {
      const start = running;
      const end = running + change.value;
      running = end;
      return {
        ...change,
        start,
        end,
        low: Math.min(start, end),
        high: Math.max(start, end)
      };
    });

    const total = running;
    const items = [...steps, {
      category: "Total",
      value: total,
      start: 0,
      end: total,
      low: Math.min(0, total),
      high: Math.max(0, total),
      total: true
    }];

    const margin = {top: 20, right: 24, bottom: 76, left: 64};
    const iw = Math.max(10, width - margin.left - margin.right);
    const ih = Math.max(10, height - margin.top - margin.bottom);
    const chart = this.svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3.scaleBand()
      .domain(items.map(item => item.category))
      .range([0, iw])
      .padding(0.18);

    const minValue = Math.min(0, d3.min(items, item => item.low) ?? 0);
    const maxValue = Math.max(0, d3.max(items, item => item.high) ?? 0);
    const padding = (maxValue - minValue || 1) * 0.08;
    const y = d3.scaleLinear()
      .domain([minValue - padding, maxValue + padding])
      .nice()
      .range([ih, 0]);

    chart.append("g")
      .attr("transform", `translate(0,${ih})`)
      .call(d3.axisBottom(x))
      .selectAll("text")
      .attr("transform", "rotate(-30)")
      .style("text-anchor", "end");

    chart.append("g").call(d3.axisLeft(y).ticks(5));

    chart.append("line")
      .attr("x1", 0)
      .attr("x2", iw)
      .attr("y1", y(0))
      .attr("y2", y(0))
      .attr("stroke", "currentColor")
      .attr("stroke-opacity", 0.35)
      .attr("stroke-dasharray", "3 3");

    chart.append("text")
      .attr("class", "chart-axis-label")
      .attr("x", iw / 2)
      .attr("y", ih + 68)
      .attr("text-anchor", "middle")
      .attr("fill", "currentColor")
      .attr("font-size", 11)
      .text(humanize(dimension));

    chart.append("text")
      .attr("class", "chart-axis-label")
      .attr("transform", "rotate(-90)")
      .attr("x", -ih / 2)
      .attr("y", -46)
      .attr("text-anchor", "middle")
      .attr("fill", "currentColor")
      .attr("font-size", 11)
      .text(humanize(measure));

    // Connector lines show the running total from one change to the next.
    steps.slice(0, -1).forEach((step, index) => {
      const next = steps[index + 1];
      chart.append("line")
        .attr("x1", x(step.category) + x.bandwidth())
        .attr("x2", x(next.category))
        .attr("y1", y(step.end))
        .attr("y2", y(step.end))
        .attr("stroke", "currentColor")
        .attr("stroke-opacity", 0.35)
        .attr("stroke-dasharray", "3 3");
    });

    const nodes = chart.selectAll(".waterfall-bar")
      .data(items)
      .join("rect")
      .attr("class", "waterfall-bar")
      .attr("x", item => x(item.category))
      .attr("y", item => item.total ? y(Math.max(0, item.end)) : y(item.high))
      .attr("width", x.bandwidth())
      .attr("height", item => {
        if (item.total) return Math.abs(y(item.end) - y(0));
        return Math.max(1, Math.abs(y(item.high) - y(item.low)));
      })
      .attr("fill", item => item.total
        ? this.measureColor(measure)
        : item.value >= 0 ? "var(--primary)" : "#f87171")
      .attr("fill-opacity", item => item.total ? 0.95 : 0.82)
      .attr("stroke", "currentColor")
      .attr("stroke-opacity", 0.12)
      .style("cursor", item => item.total ? "default" : "pointer");

    nodes.filter(item => !item.total)
      .on("click", (_, item) => this.onFilter?.({
        column: dimension,
        operator: "equals",
        value: item.category
      }));

    nodes.append("title")
      .text(item => item.total
        ? `Total\n${humanize(measure)}: ${formatValue(item.value)}`
        : `${item.category}\nChange: ${formatSigned(item.value)}\nTotal: ${formatValue(item.end)}`);

    chart.selectAll(".waterfall-value")
      .data(items.filter(item => item.total || Math.abs(item.value) > 0))
      .join("text")
      .attr("class", "waterfall-value")
      .attr("x", item => x(item.category) + x.bandwidth() / 2)
      .attr("y", item => {
        const top = item.total ? Math.max(0, item.end) : item.high;
        return y(top) - 6;
      })
      .attr("text-anchor", "middle")
      .attr("font-size", 10)
      .attr("fill", "currentColor")
      .text(item => item.total ? formatValue(item.value) : formatSigned(item.value));

    this.addCategoryBrush(chart, x, steps.map(step => step.category), dimension, iw, ih);
    this.addLegend(measure, width, height, margin.left);
  }

  measureColor(measure) {
    return this.colorStore
      ? this.colorStore.getMeasureColor(measure)
      : "var(--primary)";
  }

  addLegend(measure, width, height, left) {
    const legend = this.svg.append("g")
      .attr("transform", `translate(${left},${height - 14})`);
    const entries = [
      {label: "Increase", fill: "var(--primary)"},
      {label: "Decrease", fill: "#f87171"},
      {label: "Total", fill: this.measureColor(measure)}
    ];

    let x = 0;
    for (const entry of entries) {
      const item = legend.append("g").attr("transform", `translate(${x},0)`);
      item.append("rect")
        .attr("width", 10)
        .attr("height", 10)
        .attr("y", -9)
        .attr("fill", entry.fill);
      item.append("text")
        .attr("x", 15)
        .attr("y", 0)
        .attr("font-size", 11)
        .attr("fill", "currentColor")
        .text(entry.label);
      x += entry.label.length * 7 + 48;
    }
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

function formatSigned(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value ?? "");
  const formatted = formatValue(Math.abs(number));
  return number > 0 ? `+${formatted}` : number < 0 ? `-${formatted}` : formatted;
}
