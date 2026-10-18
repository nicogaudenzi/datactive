import {createDashboardDocument, validateDashboardDocument} from './dashboard-document.js';

/** Create the portable document from the current in-memory dashboard state. */
export function serializeDashboard({name = 'Untitled dashboard', dataSource, visualizations, grid, processing, sourceData}) {
  const document = createDashboardDocument({name, dataSource, visualizations, grid, processing, sourceData});
  const errors = validateDashboardDocument(document);
  if (errors.length) throw new Error(`Cannot export dashboard: ${errors.join(' ')}`);
  return document;
}

/** Parse and validate an imported document without mutating the live dashboard. */
export function parseDashboardImport(text) {
  let payload;
  try { payload = JSON.parse(text); }
  catch { throw new Error('The selected file is not valid JSON.'); }

  const errors = validateDashboardDocument(payload);
  if (errors.length) throw new Error(errors.join(' '));
  return structuredClone(payload);
}

export function getDataSourceCompatibility(dataSource, datasetColumns) {
  const expected = dataSource?.expectedSchema?.columns;
  if (!Array.isArray(expected)) return {compatible: null, missingColumns: [], message: 'No expected column schema was recorded.'};
  const actual = new Set(datasetColumns);
  const missingColumns = expected.filter(column => !actual.has(column));
  return {
    compatible: missingColumns.length === 0,
    missingColumns,
    message: missingColumns.length ? `The current dataset is missing required columns: ${missingColumns.join(', ')}.` : 'The current dataset contains all expected columns.'
  };
}

/** Quote raw table values as CSV for a portable source-data payload. */
export function serializeRawTableToCsv(table) {
  const quote = value => {
    const text = value == null ? '' : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return [table.columns.map(quote).join(','), ...table.rows.map(row => table.columns.map(column => quote(row[column])).join(','))].join('\r\n');
}
