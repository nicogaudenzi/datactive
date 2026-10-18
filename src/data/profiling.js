import {validateCanonicalDataset} from './dataset-schema.js';

const MAX_EXAMPLES_PER_TYPE = 5;

/**
 * Profile a canonical dataset without modifying it. Profiling describes observed
 * values; it does not infer corrections or coerce values in the dataset itself.
 */
export function profileDataset(input) {
  // Profiling is read-only. Validate the schema once without cloning every row;
  // profileColumnValidated then scans the same rows without re-validating or
  // copying the entire dataset once per column.
  const dataset = validateCanonicalDataset(input, {cloneRows: false});
  const columns = dataset.columns.map(name => profileColumnValidated(dataset, name));
  return {
    kind: 'dataset-profile',
    version: 1,
    rowCount: dataset.rowCount,
    columnCount: dataset.columns.length,
    columns
  };
}

export function profileColumn(datasetInput, columnName) {
  const dataset = validateCanonicalDataset(datasetInput, {cloneRows: false});
  return profileColumnValidated(dataset, columnName);
}

function profileColumnValidated(dataset, columnName) {
  if (!dataset.columns.includes(columnName)) {
    throw new RangeError(`Cannot profile unknown column "${columnName}".`);
  }

  const values = dataset.rows;
  const typeDistribution = {missing: 0, number: 0, numericString: 0, dateString: 0, string: 0, boolean: 0, other: 0};
  const examples = Object.fromEntries(Object.keys(typeDistribution).map(type => [type, []]));
  const exampleKeys = Object.fromEntries(Object.keys(typeDistribution).map(type => [type, new Set()]));
  const distinct = new Set();
  const numericValues = [];
  const dateValues = [];
  let populatedCount = 0;

  for (const row of values) {
    const value = Object.hasOwn(row, columnName) ? row[columnName] : undefined;
    const type = classifyValue(value);
    typeDistribution[type] += 1;
    if (type !== 'missing' && examples[type].length < MAX_EXAMPLES_PER_TYPE) {
      const key = distinctKey(value);
      if (!exampleKeys[type].has(key)) {
        exampleKeys[type].add(key);
        examples[type].push(value);
      }
    }
    if (type === 'missing') continue;

    populatedCount += 1;
    distinct.add(distinctKey(value));
    if (type === 'number' || type === 'numericString') numericValues.push(Number(value));
    if (type === 'dateString') dateValues.push(value.trim());
  }

  const numericStats = numericValues.length ? summarizeNumbers(numericValues) : null;
  const dateStats = dateValues.length ? {min: dateValues.reduce((a, b) => a < b ? a : b), max: dateValues.reduce((a, b) => a > b ? a : b)} : null;
  const missingCount = typeDistribution.missing;

  return {
    name: columnName,
    inferredType: dataset.columnMetadata[columnName].type,
    suggestedRole: dataset.columnMetadata[columnName].role,
    rowCount: values.length,
    populatedCount,
    missingCount,
    missingPercent: values.length ? (missingCount / values.length) * 100 : 0,
    distinctCount: distinct.size,
    typeDistribution,
    examples,
    numericStats,
    dateStats
  };
}

function classifyValue(value) {
  if (value == null || (typeof value === 'string' && value.trim() === '')) return 'missing';
  if (typeof value === 'number') return Number.isFinite(value) ? 'number' : 'other';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'string') {
    if (isIsoDate(value)) return 'dateString';
    if (Number.isFinite(Number(value.trim()))) return 'numericString';
    return 'string';
  }
  return 'other';
}

function isIsoDate(value) {
  const text = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}(?:$|[T\s])/.test(text)) return false;
  const date = new Date(text);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === text.slice(0, 10);
}

function distinctKey(value) {
  if (typeof value === 'string') return `string:${value}`;
  if (typeof value === 'number' && Object.is(value, -0)) return 'number:-0';
  return `${typeof value}:${JSON.stringify(value)}`;
}

function summarizeNumbers(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((total, value) => total + value, 0);
  return {
    count: values.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: sum / values.length,
    median: percentile(sorted, 0.5)
  };
}

function percentile(sorted, p) {
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}
