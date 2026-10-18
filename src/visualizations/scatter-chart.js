import * as d3 from "d3";
import {emitCategory, emitCategories, emitNumericRange, emitClear} from "../interactions/chart-interaction-contract.js";
import {observeChartResize} from "./chart-lifecycle.js";
import {cleanupChartLifecycle} from "./chart-lifecycle.js";

export class ScatterChart {
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
    const xColumn = this.visualization.query.xColumn;
    const yColumn = this.visualization.query.yColumn;
    const colorColumn = this.visualization.query.colorColumn;
    const colorType = this.visualization.query.colorType ?? "numeric";
    const sizeColumn = this.visualization.query.sizeColumn;
    if (!xColumn || !yColumn) return;

    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width < 20 || height < 20) return;

    const margin = {top: 20, right: colorColumn ? 100 : 24, bottom: 54, left: 64};
    const iw = Math.max(10, width - margin.left - margin.right);
    const ih = Math.max(10, height - margin.top - margin.bottom);

    this.root.selectAll("*").remove();
    this.svg = this.root.append("svg").attr("width", "100%").attr("height", "100%");

    const svg = this.svg
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "none");

    const chart = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const points = data
      .map(row => ({
        row,
        x: Number(row[xColumn]),
        y: Number(row[yColumn]),
        color: colorColumn ? row[colorColumn] : null,
        size: sizeColumn ? Number(row[sizeColumn]) : null
      }))
      .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));

    const x = d3.scaleLinear()
      .domain(paddedDomain(d3.extent(points, point => point.x)))
      .nice()
      .range([0, iw]);
    const y = d3.scaleLinear()
      .domain(paddedDomain(d3.extent(points, point => point.y)))
      .nice()
      .range([ih, 0]);

    chart.append("g")
      .attr("transform", `translate(0,${ih})`)
      .call(d3.axisBottom(x).ticks(6));

    chart.append("g")
      .call(d3.axisLeft(y).ticks(5));

    chart.append("text")
      .attr("x", iw / 2)
      .attr("y", ih + 45)
      .attr("text-anchor", "middle")
      .attr("fill", "currentColor")
      .attr("font-size", 11)
      .text(xColumn);

    chart.append("text")
      .attr("transform", "rotate(-90)")
      .attr("x", -ih / 2)
      .attr("y", -46)
      .attr("text-anchor", "middle")
      .attr("fill", "currentColor")
      .attr("font-size", 11)
      .text(yColumn);

    let colorScale = null;
    let categoricalColorScale = null;
    if (colorColumn) {
      if (colorType === "categorical") {
        const categories = [...new Set(points.map(point => String(point.color ?? "")))];
        if (this.colorStore) {
          // Keep a real D3 ordinal scale here rather than a plain function.
          // The legend uses scale.domain(), while the ColorStore remains the
          // source of truth for the stable category -> color mapping.
          categoricalColorScale = d3.scaleOrdinal()
            .domain(categories)
            .range(categories.map(category =>
              this.colorStore.getDimensionColor(colorColumn, category)
            ));
        } else {
          categoricalColorScale = d3.scaleOrdinal()
            .domain(categories)
            .range(d3.schemeTableau10);
        }
      } else {
        const colorValues = points
          .map(point => Number(point.color))
          .filter(Number.isFinite);
        if (colorValues.length) {
          colorScale = d3.scaleSequential(d3.interpolateViridis)
            .domain(paddedColorDomain(d3.extent(colorValues)));
        }
      }
    }

    let sizeScale = null;
    if (sizeColumn) {
      const sizeValues = points
        .map(point => point.size)
        .filter(Number.isFinite);
      if (sizeValues.length) {
        sizeScale = d3.scaleSqrt()
          .domain(paddedSizeDomain(d3.extent(sizeValues)))
          .range([4, 18]);
      }
    }

    chart.selectAll("circle")
      .data(points)
      .join("circle")
      .attr("cx", point => x(point.x))
      .attr("cy", point => y(point.y))
      .attr("r", point => sizeScale && Number.isFinite(point.size) ? sizeScale(point.size) : 5)
      .attr("fill", point => {
        if (categoricalColorScale) return categoricalColorScale(String(point.color ?? ""));
        if (colorScale && Number.isFinite(Number(point.color))) return colorScale(Number(point.color));
        return "#60a5fa";
      })
      .attr("fill-opacity", 0.85)
      .attr("stroke", "#e5e7eb")
      .attr("stroke-width", 1)
      .style("cursor", "pointer")
      .append("title")
      .text(point => {
        const colorText = colorColumn && point.color !== null && point.color !== undefined && point.color !== ""
          ? `\n${colorColumn}: ${point.color}`
          : "";
        const sizeText = sizeColumn && Number.isFinite(point.size)
          ? `\n${sizeColumn}: ${point.size}`
          : "";
        return `${xColumn}: ${point.x}\n${yColumn}: ${point.y}${colorText}${sizeText}`;
      });

    chart.selectAll("circle")
      .on("click", (_, point) => this.onFilter?.({
        column: xColumn,
        operator: "equals",
        value: point.row[xColumn]
      }));

    if (colorScale) this.renderColorLegend(svg, colorScale, colorColumn, width, margin);
    this.addXBrush(chart, x, xColumn, iw, ih);

    if (categoricalColorScale) this.renderCategoricalLegend(svg, categoricalColorScale, colorColumn, width, margin);
  }

  addXBrush(chart, scale, column, width, height) {
    let group;
    const brush = d3.brushX()
      .extent([[0, height], [width, height + 28]])
      .on("end", event => {
        if (!event.selection || !event.sourceEvent) return;
        const [a, b] = event.selection;
        const domain = scale.domain();
        const low = scale.invert(a);
        const high = scale.invert(b);
        const min = Math.min(domain[0], domain[1]);
        const max = Math.max(domain[0], domain[1]);

        // Pointer coordinates can land fractionally inside the SVG extent even
        // when the user drags across the full overlay. Allow one pixel of slack.
        const pixelTolerance = Math.abs(scale.invert(width) - scale.invert(Math.max(0, width - 1)));
        if ((a <= 1 && b >= width - 1) || (low <= min + pixelTolerance && high >= max - pixelTolerance)) {
          // Clear the visual selection as well as the filter. Otherwise the full
          // extent remains selected and can intercept the next drag as a resize.
          group.call(brush.move, null);
          emitClear(this.onFilter, column);
          return;
        }

        emitNumericRange(this.onFilter, column, low, high);
      });

    group = chart.append("g")
      .attr("class", "chart-brush chart-x-brush")
      .call(brush);
    group.select(".overlay").attr("fill", "transparent").attr("cursor", "crosshair");
    group.select(".selection").attr("fill", "var(--primary)").attr("fill-opacity", 0.22).attr("stroke", "var(--primary)");
    group.selectAll(".handle").attr("fill", "var(--primary)");
  }

  renderColorLegend(svg, scale, label, width, margin) {
    const legendWidth = 14;
    const legendHeight = Math.min(150, Math.max(70, this.container.clientHeight - 100));
    const x = width - margin.right + 28;
    const y = margin.top + 8;
    const id = `scatter-gradient-${Math.random().toString(36).slice(2)}`;

    const defs = svg.append("defs");
    const gradient = defs.append("linearGradient")
      .attr("id", id)
      .attr("x1", "0%")
      .attr("x2", "0%")
      .attr("y1", "100%")
      .attr("y2", "0%");

    d3.range(0, 1.01, 0.1).forEach(t => {
      gradient.append("stop")
        .attr("offset", `${t * 100}%`)
        .attr("stop-color", scale(scale.domain()[0] + t * (scale.domain()[1] - scale.domain()[0])));
    });

    const legend = svg.append("g").attr("transform", `translate(${x},${y})`);
    legend.append("rect")
      .attr("width", legendWidth)
      .attr("height", legendHeight)
      .attr("fill", `url(#${id})`)
      .attr("stroke", "#e5e7eb");

    const legendScale = d3.scaleLinear()
      .domain(scale.domain())
      .range([legendHeight, 0]);

    legend.append("g")
      .attr("transform", `translate(${legendWidth},0)`)
      .call(d3.axisRight(legendScale).ticks(4));

    legend.append("text")
      .attr("transform", `translate(-10,${legendHeight / 2}) rotate(-90)`)
      .attr("text-anchor", "middle")
      .attr("fill", "currentColor")
      .attr("font-size", 10)
      .text(label);
  }

  renderCategoricalLegend(svg, scale, label, width, margin) {
    const legend = svg.append("g")
      .attr("transform", `translate(${width - margin.right + 10},${margin.top + 8})`);

    legend.append("text")
      .attr("fill", "currentColor")
      .attr("font-size", 10)
      .attr("font-weight", 600)
      .text(label);

    scale.domain().forEach((category, index) => {
      const item = legend.append("g")
        .attr("transform", `translate(0,${18 + index * 20})`);

      item.append("circle")
        .attr("cx", 5)
        .attr("cy", 0)
        .attr("r", 5)
        .attr("fill", scale(category))
        .attr("stroke", "#e5e7eb");

      item.append("text")
        .attr("x", 14)
        .attr("y", 4)
        .attr("fill", "currentColor")
        .attr("font-size", 10)
        .text(category || "(empty)");
    });
  }

  destroy() {
    cleanupChartLifecycle(this);
    this.svg.remove();
  }
}

function paddedDomain(extent) {
  let [min, max] = extent;
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) {
    const padding = Math.abs(min) * 0.1 || 1;
    return [min - padding, max + padding];
  }
  const padding = (max - min) * 0.08;
  return [min - padding, max + padding];
}

function paddedSizeDomain(extent) {
  let [min, max] = extent;
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) {
    const padding = Math.abs(min) * 0.1 || 1;
    return [min - padding, max + padding];
  }
  return [min, max];
}

function paddedColorDomain(extent) {
  let [min, max] = extent;
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) {
    const padding = Math.abs(min) * 0.1 || 1;
    return [min - padding, max + padding];
  }
  return [min, max];
}
