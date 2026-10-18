const PAGE_SIZE = 50;

export class TableChart {
  constructor(container, visualization, {onFilter} = {}) {
    this.container = container;
    this.visualization = visualization;
    this.onFilter = onFilter;
    this.data = [];
    this.page = 0;
    this.root = document.createElement("div");
    this.root.className = "data-table-wrapper";
    this.container.appendChild(this.root);
  }

  renderData(data) {
    this.data = Array.isArray(data) ? data : [];
    this.page = Math.min(this.page, Math.max(0, Math.ceil(this.data.length / PAGE_SIZE) - 1));
    this.renderPage();
  }

  renderPage() {
    const columns = this.visualization.query.columns ?? [];
    this.root.replaceChildren();

    if (!columns.length) {
      const empty = document.createElement("div");
      empty.className = "table-empty";
      empty.textContent = "No columns selected.";
      this.root.appendChild(empty);
      return;
    }

    if (!this.data.length) {
      const empty = document.createElement("div");
      empty.className = "table-empty";
      empty.textContent = "No rows match the active filters.";
      this.root.appendChild(empty);
      return;
    }

    const table = document.createElement("table");
    table.className = "data-table";
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    for (const column of columns) {
      const th = document.createElement("th");
      th.textContent = column;
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    const start = this.page * PAGE_SIZE;
    const visibleRows = this.data.slice(start, start + PAGE_SIZE);
    for (const row of visibleRows) {
      const tr = document.createElement("tr");
      for (const column of columns) {
        const td = document.createElement("td");
        const value = row[column];
        td.textContent = formatValue(value);
        td.title = "Click to filter by this value";
        td.addEventListener("click", () => {
          if (value == null || value === "") return;
          this.onFilter?.({column, operator: "equals", value});
        });
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    this.root.appendChild(table);

    const footer = document.createElement("div");
    footer.className = "data-table-pagination";
    const summary = document.createElement("span");
    const end = Math.min(this.data.length, start + visibleRows.length);
    summary.textContent = `Rows ${start + 1}–${end} of ${this.data.length.toLocaleString()}`;
    const previous = document.createElement("button");
    previous.type = "button";
    previous.textContent = "Previous";
    previous.disabled = this.page === 0;
    previous.addEventListener("click", () => { this.page -= 1; this.renderPage(); });
    const next = document.createElement("button");
    next.type = "button";
    next.textContent = "Next";
    next.disabled = start + visibleRows.length >= this.data.length;
    next.addEventListener("click", () => { this.page += 1; this.renderPage(); });
    footer.append(summary, previous, next);
    this.root.appendChild(footer);
  }

  destroy() {
    this.root.remove();
  }
}

function formatValue(value) {
  if (value == null) return "";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toLocaleString(undefined, {maximumFractionDigits: 2});
  return String(value);
}
