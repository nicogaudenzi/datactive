import {validateCanonicalDataset} from './dataset-schema.js';

const MAX_EXAMPLES = 5;

/**
 * Inspect a canonical dataset and return evidence-based findings without changing it.
 * Findings are review suggestions, never automatic corrections.
 */
export function findDataQualityIssues(input, options = {}) {
  const dataset = validateCanonicalDataset(input, {cloneRows: false});
  const findings = [];
  const maxExamples = Number.isInteger(options.maxExamples) && options.maxExamples > 0
    ? Math.min(options.maxExamples, 20) : MAX_EXAMPLES;

  for (const column of dataset.columns) {
    // Keep only the compact evidence each check needs. The previous pipeline
    // created several full-length arrays of row wrappers per column, which can
    // create large transient allocations on imported datasets.
    const typeCounts = {};
    const examples = {};
    const numericValues = [];
    const categoryItems = [];
    for (let rowIndex = 0; rowIndex < dataset.rows.length; rowIndex += 1) {
      const value = dataset.rows[rowIndex][column];
      if (isMissing(value)) continue;
      const type = classifyObservedType(value);
      typeCounts[type] = (typeCounts[type] ?? 0) + 1;
      if (type === 'string') categoryItems.push({rowIndex, value});
      if (type === 'number' || type === 'numeric-string') {
        const numericValue = Number(value);
        if (Number.isFinite(numericValue)) numericValues.push({rowIndex, value, numericValue});
      }
      const bucket = examples[type] ??= [];
      if (bucket.length < maxExamples && !bucket.some(example => Object.is(example.value, value))) bucket.push({rowIndex, value});
    }
    const observedTypes = Object.keys(typeCounts);

    if (observedTypes.length > 1 && hasMeaningfulTypeMixture(typeCounts)) {
      findings.push({
        id: `mixed-types:${column}`, type: 'mixed-types', severity: 'warning', column,
        message: `Column "${column}" contains multiple value types.`,
        evidence: {typeCounts, examples}
      });
    }

    for (const variant of findCategoryVariants(categoryItems)) {
      findings.push({
        id: `category-variants:${column}:${stableKey(variant.normalized)}`,
        type: 'category-variants', severity: 'review', column,
        message: `Values in "${column}" may represent the same category.`,
        evidence: {normalizedCandidate: variant.normalized, variants: variant.variants.slice(0, maxExamples)}
      });
    }

    // Outliers are a column-level pattern, not independent issues. Emitting one
    // finding per row can create tens of thousands of DOM nodes for large files
    // and make the browser unresponsive after parsing. Keep every affected row
    // index for inspection, but represent the pattern with a single finding.
    const outliers = findIqrOutliers(numericValues);
    if (outliers.length) {
      const first = outliers[0];
      findings.push({
        id: `numeric-outlier:${column}`, type: 'numeric-outlier', severity: 'review', column,
        message: `${outliers.length.toLocaleString()} value${outliers.length === 1 ? '' : 's'} in "${column}" fall outside the 1.5×IQR range.`,
        evidence: {
          rowIndex: first.rowIndex, value: first.value, numericValue: first.numericValue,
          rowIndices: outliers.map(item => item.rowIndex), outlierCount: outliers.length,
          examples: outliers.slice(0, maxExamples).map(({rowIndex, value, numericValue}) => ({rowIndex, value, numericValue})),
          method: '1.5×IQR'
        }
      });
    }
  }

  for (const duplicate of findDuplicateRows(dataset, maxExamples)) {
    findings.push({
      id: `duplicate-rows:${duplicate.rowIndices[0]}`, type: 'duplicate-rows', severity: 'warning',
      message: `Identical rows occur ${duplicate.rowIndices.length} times.`,
      evidence: {rowIndices: duplicate.rowIndices, sample: duplicate.sample}
    });
  }

  return {kind: 'data-quality-findings', version: 1, rowCount: dataset.rowCount, findingCount: findings.length, findings};
}

function isMissing(value) {
  return value == null || (typeof value === 'string' && value.trim() === '');
}

function classifyObservedType(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? 'number' : 'other';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'string') {
    const text = value.trim();
    if (/^\d{4}-\d{2}-\d{2}(?:$|[T\s])/.test(text) && Number.isFinite(Date.parse(text))) return 'date-string';
    if (text !== '' && Number.isFinite(Number(text))) return 'numeric-string';
    return 'string';
  }
  return 'other';
}

function hasMeaningfulTypeMixture(counts) {
  // Numeric primitives and numeric strings are useful to distinguish in findings,
  // but numeric strings alone are not treated as a conflicting semantic mixture.
  return Object.keys(counts).length > 1;
}

function countBy(items, keyFn) {
  const counts = {};
  for (const item of items) {
    const key = keyFn(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function examplesByType(items, maxExamples) {
  const result = {};
  for (const item of items) {
    result[item.type] ??= [];
    if (result[item.type].length < maxExamples && !result[item.type].some(example => Object.is(example.value, item.value))) {
      result[item.type].push({rowIndex: item.rowIndex, value: item.value});
    }
  }
  return result;
}

function normalizeCategory(value) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase();
}

function findCategoryVariants(items) {
  const groups = new Map();
  for (const item of items) {
    if (typeof item.value !== 'string') continue;
    const normalized = normalizeCategory(item.value);
    if (!normalized) continue;
    const rawKey = item.value;
    if (!groups.has(normalized)) groups.set(normalized, new Map());
    const variants = groups.get(normalized);
    if (!variants.has(rawKey)) variants.set(rawKey, []);
    if (variants.get(rawKey).length < 100) variants.get(rawKey).push(item.rowIndex);
  }
  const result = [];
  for (const [normalized, variants] of groups) {
    if (variants.size < 2) continue;
    result.push({normalized, variants: [...variants].map(([value, rowIndices]) => ({value, rowIndices}))});
  }
  return result;
}

function findDuplicateRows(dataset, maxExamples) {
  // Avoid retaining a full JSON string for every row. On large CSVs, those keys
  // can be comparable in size to the source data and cause memory pressure.
  // Store compact fingerprints instead, then compare rows exactly within a
  // fingerprint bucket so hash collisions never create false duplicate reports.
  const groupsByHash = new Map();
  for (let index = 0; index < dataset.rows.length; index += 1) {
    const row = dataset.rows[index];
    const hash = fingerprintRow(row, dataset.columns);
    let bucket = groupsByHash.get(hash);
    if (!bucket) { bucket = []; groupsByHash.set(hash, bucket); }
    let group = bucket.find(candidate => rowsEqual(dataset.rows[candidate.firstIndex], row, dataset.columns));
    if (!group) {
      group = {firstIndex: index, rowIndices: [index]};
      bucket.push(group);
    } else {
      group.rowIndices.push(index);
    }
  }
  const duplicates = [];
  for (const bucket of groupsByHash.values()) {
    for (const group of bucket) {
      if (group.rowIndices.length < 2) continue;
      const sampleRow = dataset.rows[group.firstIndex];
      duplicates.push({
        rowIndices: group.rowIndices.slice(0, maxExamples),
        sample: Object.fromEntries(dataset.columns.map(column => [column, sampleRow[column] ?? null]))
      });
    }
  }
  return duplicates;
}

function fingerprintRow(row, columns) {
  // Two independent 32-bit hashes make buckets compact; exact equality is still
  // checked below, so the fingerprint is an index, not proof of equality.
  let first = 2166136261;
  let second = 0x9e3779b9;
  const feed = text => {
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      first = Math.imul(first ^ code, 16777619) >>> 0;
      second = Math.imul(second ^ code, 2246822519) >>> 0;
    }
    first = Math.imul(first ^ 31, 16777619) >>> 0;
    second = Math.imul(second ^ 31, 2246822519) >>> 0;
  };
  for (const column of columns) feed(JSON.stringify(canonicalValue(row[column])));
  return `${first.toString(16)}:${second.toString(16)}`;
}

function rowsEqual(left, right, columns) {
  for (const column of columns) {
    if (JSON.stringify(canonicalValue(left[column])) !== JSON.stringify(canonicalValue(right[column]))) return false;
  }
  return true;
}

function canonicalValue(value) {
  if (value === undefined) return {__qualityType: 'undefined'};
  if (typeof value === 'number' && !Number.isFinite(value)) return {__qualityType: 'number', value: String(value)};
  return {type: typeof value, value};
}

function findIqrOutliers(items) {
  if (items.length < 4) return [];
  const sorted = [...items].sort((a, b) => a.numericValue - b.numericValue);
  const q1 = quantile(sorted.map(item => item.numericValue), 0.25);
  const q3 = quantile(sorted.map(item => item.numericValue), 0.75);
  const iqr = q3 - q1;
  if (iqr === 0) return [];
  const low = q1 - 1.5 * iqr;
  const high = q3 + 1.5 * iqr;
  return items.filter(item => item.numericValue < low || item.numericValue > high);
}

function quantile(sortedValues, p) {
  const index = (sortedValues.length - 1) * p;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  return low === high ? sortedValues[low] : sortedValues[low] + (sortedValues[high] - sortedValues[low]) * (index - low);
}

function stableKey(value) {
  return encodeURIComponent(value).replace(/%/g, '_');
}
