import * as d3 from "d3";
import {emitCategory, emitCategories, emitNumericRange, emitClear} from "../interactions/chart-interaction-contract.js";
import {observeChartResize} from "./chart-lifecycle.js";
import {cleanupChartLifecycle} from "./chart-lifecycle.js";

export class StackedBarChart {
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
    const dimensions = this.visualization.query.dimensions ?? [];
    const dimension = dimensions[0];
    const stackDimension = dimensions[1];
    const measure = this.visualization.query.measures?.[0];
    if (!dimension || !stackDimension || !measure) return;

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

    const categories = [...new Set(data.map(row => String(row[dimension])))];
    const stacks = [...new Set(data.map(row => String(row[stackDimension])))];
    const rowsByCategory = new Map(categories.map(category => [category, new Map()]));
    for (const row of data) {
      rowsByCategory.get(String(row[dimension]))?.set(String(row[stackDimension]), Number(row[measure.column]) || 0);
    }

    const x = d3.scaleBand().domain(categories).range([0, iw]).padding(.16);
    const series = stacks.map(stack => ({
      key: stack,
      values: categories.map(category => ({
        category,
        value: rowsByCategory.get(category)?.get(stack) ?? 0
      }))
    }));
    const max = d3.max(categories, category =>
      d3.sum(series, s => rowsByCategory.get(category)?.get(s.key) ?? 0)
    ) ?? 0;
    const y = d3.scaleLinear().domain([0, max || 1]).nice().range([ih, 0]);

    chart.append("g")
      .attr("transform", `translate(0,${ih})`)
      .call(d3.axisBottom(x))
      .selectAll("text")
      .attr("transform", "rotate(-30)")
      .style("text-anchor", "end");
    chart.append("g").call(d3.axisLeft(y).ticks(5));

    const color = this.colorStore
      ? value => this.colorStore.getDimensionColor(stackDimension, value)
      : d3.scaleOrdinal().domain(stacks).range(d3.schemeTableau10);

    for (const category of categories) {
      let cumulative = 0;
      const group = chart.append("g")
        .attr("class", "stacked-bar-group")
        .attr("transform", `translate(${x(category)},0)`);

      for (const stack of stacks) {
        const value = rowsByCategory.get(category)?.get(stack) ?? 0;
        const y0 = y(cumulative + value);
        const y1 = y(cumulative);
        cumulative += value;

        group.append("rect")
          .attr("x", 0)
          .attr("y", y0)
          .attr("width", x.bandwidth())
          .attr("height", Math.max(0, y1 - y0))
          .attr("fill", color(stack))
          .style("cursor", "pointer")
          .on("click", () => this.onFilter?.({
            column: stackDimension,
            operator: "equals",
            value: stack
          }));
      }
    }

    this.addCategoryBrush(chart, x, categories, dimension, iw, ih);

    const legend = svg.append("g").attr("transform", `translate(${margin.left},${height - 14})`);
    let lx = 0;
    stacks.forEach(stack => {
      const item = legend.append("g").attr("transform", `translate(${lx},0)`);
      item.append("rect")
        .attr("width", 10)
        .attr("height", 10)
        .attr("y", -9)
        .attr("fill", color(stack));
      item.append("text")
        .attr("x", 15)
        .attr("y", 0)
        .attr("font-size", 11)
        .attr("fill", "currentColor")
        .text(stack);
      lx += Math.max(35, stack.length * 7 + 30);
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
    group.selectAll(".handle")
      .attr("fill", "var(--primary)");
  }

  destroy() {
    cleanupChartLifecycle(this);
    this.svg.remove();
  }
}
