import * as d3 from "d3";
import {emitCategory, emitCategories, emitNumericRange, emitClear} from "../interactions/chart-interaction-contract.js";
import {observeChartResize} from "./chart-lifecycle.js";
import {cleanupChartLifecycle} from "./chart-lifecycle.js";

export class AreaChart {
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
    const measures = this.visualization.query.measures ?? [];
    if (!dimension || !measures.length) return;

    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width < 20 || height < 20) return;

    const margin = {top: 20, right: 24, bottom: 54, left: 58};
    const iw = Math.max(10, width - margin.left - margin.right);
    const ih = Math.max(10, height - margin.top - margin.bottom);

    this.root.selectAll("*").remove();
    this.svg = this.root.append("svg").attr("width", "100%").attr("height", "100%");

    const svg = this.svg
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "none");

    const chart = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const categories = data.map(row => String(row[dimension]));
    const x = d3.scalePoint()
      .domain(categories)
      .range([0, iw])
      .padding(0.08);

    const max = d3.max(data, row =>
      d3.max(measures, measure => Number(row[measure.column]) || 0)
    ) ?? 0;

    const y = d3.scaleLinear()
      .domain([0, max || 1])
      .nice()
      .range([ih, 0]);

    chart.append("g")
      .attr("transform", `translate(0,${ih})`)
      .call(d3.axisBottom(x))
      .selectAll("text")
      .attr("transform", "rotate(-30)")
      .style("text-anchor", "end");

    chart.append("g")
      .call(d3.axisLeft(y).ticks(5));

    this.addCategoryBrush(chart, x, categories, dimension, iw, ih);


    measures.forEach((measure, index) => {
      const color = this.colorStore
        ? this.colorStore.getMeasureColor(measure.column)
        : d3.schemeTableau10[index % d3.schemeTableau10.length];
      const area = d3.area()
        .defined(row => Number.isFinite(Number(row[measure.column])))
        .x(row => x(String(row[dimension])))
        .y0(ih)
        .y1(row => y(Number(row[measure.column]) || 0));

      chart.append("path")
        .datum(data)
        .attr("fill", color)
        .attr("fill-opacity", 0.2)
        .attr("stroke", color)
        .attr("stroke-width", 2)
        .attr("d", area);

      chart.selectAll(`.area-point-${index}`)
        .data(data)
        .join("circle")
        .attr("class", `area-point-${index}`)
        .attr("cx", row => x(String(row[dimension])))
        .attr("cy", row => y(Number(row[measure.column]) || 0))
        .attr("r", 4)
        .attr("fill", color)
        .style("cursor", "pointer")
        .on("click", (_, row) => this.onFilter?.({
          column: dimension,
          operator: "equals",
          value: row[dimension]
        }));
    });

    const legend = svg.append("g")
      .attr("transform", `translate(${margin.left},${height - 10})`);

    let lx = 0;
    measures.forEach((measure, index) => {
      const item = legend.append("g").attr("transform", `translate(${lx},0)`);
      item.append("rect")
        .attr("x", 0)
        .attr("y", -10)
        .attr("width", 10)
        .attr("height", 10)
        .attr("fill", this.colorStore
          ? this.colorStore.getMeasureColor(measure.column)
          : d3.schemeTableau10[index % d3.schemeTableau10.length])
        .attr("fill-opacity", 0.65);
      item.append("text")
        .attr("x", 15)
        .attr("y", 0)
        .attr("font-size", 11)
        .attr("fill", "currentColor")
        .text(measure.column);
      lx += measure.column.length * 7 + 45;
    });
  }

  addCategoryBrush(chart, scale, categories, column, width, height) {
    const brush = d3.brushX()
      .extent([[0, height], [width, height + 28]])
      .on("end", event => {
        if (!event.selection || !event.sourceEvent) return;
        const [a, b] = event.selection;
        const selected = categories.filter(category => {
          const center = scale(category);
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
