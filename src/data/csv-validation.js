/** Validate the parsed CSV header without changing or normalizing its names. */
export function validateCsvColumns(columns) {
  if (!Array.isArray(columns) || !columns.length || columns.every(column => !String(column).trim())) {
    throw new Error('The CSV must contain a header row with at least one column.');
  }
  if (columns.some(column => typeof column !== 'string' || !column.trim())) {
    throw new Error('The CSV contains an empty column name.');
  }
  if (new Set(columns).size !== columns.length) {
    throw new Error('The CSV contains duplicate column names. Rename them before importing.');
  }
  return [...columns];
}
