const ROW_REMOVING_TYPES = new Set(['remove-rows-missing', 'remove-duplicate-rows']);

const rowKey = row => JSON.stringify(row, Object.keys(row).sort());
const sameValue = (a, b) => Object.is(a, b);

/** Build a compact, table-friendly comparison of the rows affected by a proposed step. */
export function buildCleaningPreview(before, after, definition, limit = 10) {
  const columns = [...new Set([...before.columns, ...after.columns])];
  const removedByType = ROW_REMOVING_TYPES.has(definition.type) ||
    (definition.type === 'convert-to-date' && definition.onInvalid === 'remove-row');
  const entries = [];

  if (removedByType) {
    const remainingCounts = new Map();
    for (const row of after.rows) {
      const key = rowKey(row);
      remainingCounts.set(key, (remainingCounts.get(key) ?? 0) + 1);
    }
    before.rows.forEach((row, index) => {
      const key = rowKey(row);
      const count = remainingCounts.get(key) ?? 0;
      if (count > 0) remainingCounts.set(key, count - 1);
      else entries.push({rowNumber: index + 1, status: 'removed', before: row, after: null, changedColumns: []});
    });
  } else {
    const rowCount = Math.max(before.rows.length, after.rows.length);
    for (let index = 0; index < rowCount; index += 1) {
      const beforeRow = before.rows[index] ?? null;
      const afterRow = after.rows[index] ?? null;
      const changedColumns = columns.filter(column => !sameValue(beforeRow?.[column], afterRow?.[column]));
      if (changedColumns.length || !beforeRow || !afterRow) {
        entries.push({rowNumber: index + 1, status: !beforeRow ? 'added' : !afterRow ? 'removed' : 'changed', before: beforeRow, after: afterRow, changedColumns});
      }
    }
  }

  const changedColumns = [...new Set(entries.flatMap(entry => entry.changedColumns))];
  return {
    columns,
    entries: entries.slice(0, Math.max(0, limit)),
    totalAffectedRows: entries.length,
    totalChangedCells: entries.reduce((sum, entry) => sum + entry.changedColumns.length, 0),
    changedColumns,
    omittedRows: Math.max(0, entries.length - Math.max(0, limit)),
    removedRows: before.rows.length - after.rows.length
  };
}
