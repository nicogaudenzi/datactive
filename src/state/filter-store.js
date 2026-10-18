export class FilterStore {
  constructor() {
    this.filters = [];
    this.listeners = new Set();
  }

  getFilters() {
    return [...this.filters];
  }

  setFilter(filter) {
    // Set/replace a filter. This method is deliberately NOT a toggle.
    // Interactive controls can emit the same value more than once; an identical
    // state is a no-op so subscribers don't rerender every chart unnecessarily.
    const existing = this.filters.find(item => item.column === filter.column);
    if (existing && sameFilter(existing, filter)) return;

    this.filters = [
      ...this.filters.filter(item => item.column !== filter.column),
      {...filter, value: Array.isArray(filter.value) ? [...filter.value] : filter.value}
    ];
    this.emit();
  }

  toggleFilter(filter) {
    const index = this.filters.findIndex(existing => existing.column === filter.column);

    if (index >= 0) {
      const existing = this.filters[index];
      const sameValue = Array.isArray(existing.value) && Array.isArray(filter.value)
        ? existing.value.length === filter.value.length &&
          existing.value.every(value => filter.value.includes(value))
        : existing.value === filter.value;

      if (existing.operator === filter.operator && sameValue) {
        this.filters = this.filters.filter((_, i) => i !== index);
        this.emit();
        return;
      }
    }

    this.setFilter(filter);
  }

  removeFilter(column) {
    const next = this.filters.filter(filter => filter.column !== column);
    if (next.length === this.filters.length) return;
    this.filters = next;
    this.emit();
  }

  clear() {
    if (this.filters.length === 0) return;
    this.filters = [];
    this.emit();
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    const filters = this.getFilters();
    for (const fn of this.listeners) {
      fn(filters);
    }
  }
}

function sameFilter(left, right) {
  if (left.operator !== right.operator) return false;
  if (!Array.isArray(left.value) || !Array.isArray(right.value)) {
    return left.value === right.value;
  }

  if (left.value.length !== right.value.length) return false;
  if (left.operator === "in") {
    return left.value.every(value => right.value.some(candidate => sameValue(value, candidate)));
  }
  return left.value.every((value, index) => value === right.value[index]);
}

function sameValue(left, right) {
  if (left == null || right == null) return left === right;
  return String(left) === String(right);
}
