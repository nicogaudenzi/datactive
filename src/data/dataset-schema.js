import {validateRawTable} from './data-source.js';

export const CANONICAL_DATASET_KIND = 'canonical-dataset';
export const CANONICAL_DATASET_VERSION = 1;

/** Build the stable, source-independent dataset contract consumed by the app. */
export function createCanonicalDataset(rawTable) {
  const table = validateRawTable(rawTable, {cloneRows: false, validateRows: false});
  const columns = [...table.columns];
  // Scan each cell once without allocating a values array and filtered copy per
  // column. This is significantly cheaper for wide, high-row-count imports.
  const stats = columns.map(() => ({present: 0, missingCount: 0, allNumeric: true, allDate: true}));
  for (const row of table.rows) {
    for (let index = 0; index < columns.length; index += 1) {
      const value = row[columns[index]];
      const missing = value == null || (typeof value === 'string' && value.trim() === '');
      const stat = stats[index];
      if (missing) { stat.missingCount += 1; continue; }
      stat.present += 1;
      if (!isNumericValue(value)) stat.allNumeric = false;
      if (!isDateValue(value)) stat.allDate = false;
    }
  }
  const columnMetadata = Object.fromEntries(columns.map((column, index) => {
    const stat = stats[index];
    const numeric = stat.present > 0 && stat.allNumeric;
    const date = !numeric && stat.present > 0 && stat.allDate;
    const type = numeric ? 'number' : date ? 'date' : stat.present === 0 ? 'unknown' : 'string';
    return [column, {type, role: type === 'number' ? 'measure' : type === 'unknown' ? 'ignore' : 'dimension', nullable: stat.missingCount > 0, missingCount: stat.missingCount}];
  }));
  return validateCanonicalDataset({
    kind: CANONICAL_DATASET_KIND,
    version: CANONICAL_DATASET_VERSION,
    source: table.source,
    rows: table.rows,
    columns,
    rowCount: table.rows.length,
    columnMetadata
  }, {cloneRows: false, validateRows: false});
}

export function validateCanonicalDataset(dataset, {cloneRows = true, validateRows = true} = {}) {
  if (!dataset || typeof dataset !== 'object' || Array.isArray(dataset)) throw new TypeError('Canonical dataset must be an object.');
  if (dataset.kind !== CANONICAL_DATASET_KIND) throw new TypeError(`Canonical dataset kind must be "${CANONICAL_DATASET_KIND}".`);
  if (dataset.version !== CANONICAL_DATASET_VERSION) throw new TypeError(`Unsupported canonical dataset version: ${dataset.version}.`);
  if (!Array.isArray(dataset.columns) || dataset.columns.some(column => typeof column !== 'string' || !column.trim())) throw new TypeError('Canonical dataset columns must be non-empty strings.');
  if (new Set(dataset.columns).size !== dataset.columns.length) throw new TypeError('Canonical dataset columns must be unique.');
  if (!Array.isArray(dataset.rows) || (validateRows && dataset.rows.some(row => !row || typeof row !== 'object' || Array.isArray(row)))) throw new TypeError('Canonical dataset rows must be an array of objects.');
  if (dataset.rowCount !== dataset.rows.length) throw new TypeError('Canonical dataset rowCount must match rows.length.');
  if (!dataset.columnMetadata || typeof dataset.columnMetadata !== 'object' || Array.isArray(dataset.columnMetadata)) throw new TypeError('Canonical dataset columnMetadata must be an object.');
  if (Object.keys(dataset.columnMetadata).length !== dataset.columns.length || dataset.columns.some(column => !Object.hasOwn(dataset.columnMetadata, column))) throw new TypeError('Canonical dataset metadata must describe every column exactly once.');
  for (const column of dataset.columns) {
    const metadata = dataset.columnMetadata[column];
    if (!metadata || !['number', 'date', 'string', 'boolean', 'unknown'].includes(metadata.type)) throw new TypeError(`Canonical dataset metadata for "${column}" has an invalid type.`);
    if (!['dimension', 'measure', 'identifier', 'ignore'].includes(metadata.role)) throw new TypeError(`Canonical dataset metadata for "${column}" has an invalid role.`);
    if (metadata.geographicRole != null && !['country', 'state-province', 'county-district', 'city', 'postal-code', 'custom-region'].includes(metadata.geographicRole)) throw new TypeError(`Canonical dataset metadata for "${column}" has an invalid geographic role.`);
    if (typeof metadata.nullable !== 'boolean' || !Number.isInteger(metadata.missingCount) || metadata.missingCount < 0 || metadata.missingCount > dataset.rowCount) throw new TypeError(`Canonical dataset metadata for "${column}" has invalid missing-value information.`);
  }
  return {
    kind: dataset.kind, version: dataset.version,
    ...(dataset.source ? {source: {...dataset.source}} : {}),
    rows: cloneRows ? dataset.rows.map(row => ({...row})) : dataset.rows, columns: [...dataset.columns], rowCount: dataset.rowCount,
    columnMetadata: Object.fromEntries(dataset.columns.map(column => [column, {...dataset.columnMetadata[column]}]))
  };
}

export function getColumnsByRole(dataset, role) {
  return dataset.columns.filter(column => dataset.columnMetadata[column]?.role === role);
}
export function getColumnsByType(dataset, type) {
  return dataset.columns.filter(column => dataset.columnMetadata[column]?.type === type);
}
export function getDimensionColumns(dataset) { return getColumnsByRole(dataset, 'dimension'); }
export function getMeasureColumns(dataset) { return getColumnsByRole(dataset, 'measure'); }
export function getDateColumns(dataset) { return getColumnsByType(dataset, 'date'); }

function isNumericValue(value) {
  if (value == null || (typeof value === 'string' && value.trim() === '')) return false;
  return Number.isFinite(Number(value));
}
function isDateValue(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  const text = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}(?:[T\s].*)?$/.test(text)) return false;
  const parsed = new Date(text);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text.slice(0, 10);
}
