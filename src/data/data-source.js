/** Common contract for data source adapters.
 * Adapters return raw tabular data; they must not clean or reinterpret values.
 */
export class DataSourceAdapter {
  constructor(type) {
    if (new.target === DataSourceAdapter) throw new TypeError('DataSourceAdapter is an abstract contract.');
    if (typeof type !== 'string' || !type.trim()) throw new TypeError('A data source type is required.');
    this.type = type;
  }

  async load(_reference) {
    throw new Error(`${this.type} adapter must implement load(reference).`);
  }
}

export function validateRawTable(table, {cloneRows = true, validateRows = true} = {}) {
  if (!table || typeof table !== 'object' || Array.isArray(table)) throw new TypeError('A data source must return a raw table object.');
  if (!Array.isArray(table.columns) || table.columns.some(column => typeof column !== 'string')) throw new TypeError('Raw table columns must be an array of strings.');
  if (!Array.isArray(table.rows)) throw new TypeError('Raw table rows must be an array.');
  if (validateRows) {
    for (const [index, row] of table.rows.entries()) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) throw new TypeError(`Raw table row ${index + 1} must be an object.`);
    }
  }
  return {
    columns: [...table.columns],
    rows: cloneRows ? table.rows.map(row => ({...row})) : table.rows,
    source: table.source ? {...table.source} : undefined
  };
}
