/** Create a reusable raw-table transformation that derives a new column. */
export function deriveColumn({name, sourceColumns, derive}) {
  if (typeof name !== 'string' || !name.trim()) throw new TypeError('Derived column name is required.');
  const sources = Array.isArray(sourceColumns) ? [...sourceColumns] : [sourceColumns];
  if (!sources.length || sources.some(source => typeof source !== 'string' || !source.trim())) throw new TypeError('Derived column sourceColumns must contain column names.');
  if (typeof derive !== 'function') throw new TypeError('Derived column derive must be a function.');
  return table => {
    const missing = sources.filter(source => !table.columns.includes(source));
    if (missing.length) throw new Error(`Cannot derive "${name}": missing source column${missing.length > 1 ? 's' : ''} ${missing.join(', ')}.`);
    if (table.columns.includes(name)) throw new Error(`Cannot derive "${name}": a column with that name already exists.`);
    return {
      ...table,
      columns: [...table.columns, name],
      rows: table.rows.map((row, index) => ({...row, [name]: derive(...sources.map(source => row[source]), row, index)}))
    };
  };
}
