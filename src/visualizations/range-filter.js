import * as d3 from "d3";
import {getMeasureColumns, getDateColumns} from "../data/dataset-schema.js";

export class RangeFilterWidget {
  constructor(container, dataset, filterStore) {
    this.container = container;
    this.dataset = dataset;
    this.filterStore = filterStore;
    this.controls = new Map();
    this.render();
  }

  render() {
    this.container.innerHTML = "";
    this.controls.clear();
    this.renderRanges(getMeasureColumns(this.dataset), "numeric");
    this.renderRanges(getDateColumns(this.dataset), "date");
  }

  renderRanges(columns, type) {
    for (const column of columns) {
      const values = this.dataset.rows
        .map(row => type === "date" ? Date.parse(row[column]) : Number(row[column]))
        .filter(Number.isFinite);

      if (!values.length) continue;

      const min = d3.min(values);
      const max = d3.max(values);
      const operator = type === "date" ? "dateRange" : "range";

      const row = document.createElement("div");
      row.className = "range-filter-row";
      row.innerHTML = `
        <div class="range-filter-header">
          <span class="range-filter-label">${esc(column)}</span>
          <span class="range-filter-values"></span>
        </div>
        <div class="range-filter-track"></div>
      `;

      const track = row.querySelector(".range-filter-track");
      const valueLabel = row.querySelector(".range-filter-values");
      const width = Math.max(220, this.container.clientWidth || 400);
      const height = 32;
      const margin = {left: 10, right: 10};

      const svg = d3.select(track)
        .append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("role", "img")
        .attr("aria-label", `${type === "date" ? "Date" : "Numeric"} range filter for ${column}`);

      const scale = type === "date"
        ? d3.scaleTime().domain([new Date(min), new Date(max)]).range([margin.left, width - margin.right])
        : d3.scaleLinear().domain([min, max]).range([margin.left, width - margin.right]);

      const clamp = value => Math.max(min, Math.min(max, value));

      const brush = d3.brushX()
        .extent([[margin.left, 7], [width - margin.right, height - 7]])
        .on("brush", event => {
          if (!event.selection) return;

          const next = event.selection.map(scale.invert);
          const low = clamp(Math.min(+next[0], +next[1]));
          const high = clamp(Math.max(+next[0], +next[1]));
          valueLabel.textContent = formatRange(low, high, type);
        })
        .on("end", event => {
          if (!event.selection || !event.sourceEvent) return;

          const next = event.selection.map(scale.invert);
          const low = clamp(Math.min(+next[0], +next[1]));
          const high = clamp(Math.max(+next[0], +next[1]));

          // A full-range selection means "no restriction" for this column.
          // Remove the filter instead of storing a redundant min..max filter,
          // so the active-filter list accurately reflects the actual filters.
          if (Math.abs(low - min) < 1e-9 && Math.abs(high - max) < 1e-9) {
            this.filterStore.removeFilter(column);
            return;
          }

          // IMPORTANT: only update application state once, at the end of the
          // gesture. Updating FilterStore from both `brush` and `end` causes
          // the second event to toggle the just-created filter back off.
          this.filterStore.setFilter({
            column,
            operator,
            value: [low, high]
          });
        });

      svg.append("line")
        .attr("x1", margin.left)
        .attr("x2", width - margin.right)
        .attr("y1", height / 2)
        .attr("y2", height / 2)
        .attr("stroke", "var(--border)")
        .attr("stroke-width", 6)
        .attr("stroke-linecap", "round");

      const brushGroup = svg.append("g")
        .attr("class", "range-brush")
        .call(brush)
        .call(g => g.select(".selection")
          .attr("fill", "var(--primary)")
          .attr("fill-opacity", 0.28)
          .attr("stroke", "var(--primary)"))
        .call(g => g.selectAll(".handle")
          .attr("fill", "var(--primary)"));

      this.container.appendChild(row);
      this.controls.set(column, {
        column,
        type,
        operator,
        min,
        max,
        scale,
        brush,
        brushGroup,
        valueLabel
      });
    }
  }

  update(filters) {
    for (const control of this.controls.values()) {
      const filter = filters.find(
        f => f.column === control.column && f.operator === control.operator
      );
      const low = filter ? Number(filter.value[0]) : control.min;
      const high = filter ? Number(filter.value[1]) : control.max;
      const start = Math.max(control.min, Math.min(control.max, low));
      const end = Math.max(control.min, Math.min(control.max, high));

      control.valueLabel.textContent = formatRange(start, end, control.type);

      const target = [control.scale(start), control.scale(end)];
      const current = d3.brushSelection(control.brushGroup.node());

      // Do not call brush.move if the visual brush is already at the requested
      // position. This is important while a user is dragging a handle: a
      // filter-store notification must not interrupt that gesture.
      if (current &&
          Math.abs(current[0] - target[0]) < 0.5 &&
          Math.abs(current[1] - target[1]) < 0.5) {
        continue;
      }

      control.brushGroup.call(control.brush.move, target);
    }
  }

  destroy() {
    this.container.innerHTML = "";
    this.controls.clear();
  }
}

function formatRange(start, end, type) {
  if (type === "date") return `${formatDate(start)} – ${formatDate(end)}`;
  return `${d3.format(",~g")(start)} – ${d3.format(",~g")(end)}`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  }).format(new Date(value));
}

function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
