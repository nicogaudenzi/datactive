import {validateRawTable} from '../data-source.js';
import {parseExpression, evaluateExpression, expressionColumns} from './expression.js';

/** Serializable transformation definitions are the durable representation of preparation steps. */
export const TRANSFORMATION_TYPES = Object.freeze([
  'derive-month', 'derive-column', 'trim-text', 'normalize-case', 'replace-value',
  'fill-missing', 'convert-to-date', 'remove-rows-missing', 'remove-duplicate-rows'
]);

const isMissing = value => value == null || (typeof value === 'string' && value.trim() === '');
const clone = value => JSON.parse(JSON.stringify(value));

export function validateTransformationDefinitions(definitions, columns = null) {
  if (!Array.isArray(definitions)) throw new TypeError('Transformation definitions must be an array.');
  const known = columns ? new Set(columns) : null;
  const ids = new Set();
  return definitions.map((definition, index) => {
    if (!definition || typeof definition !== 'object' || Array.isArray(definition)) throw new TypeError(`Transformation ${index + 1} must be an object.`);
    const {id, type} = definition;
    if (typeof id !== 'string' || !id.trim()) throw new TypeError(`Transformation ${index + 1} requires an id.`);
    if (ids.has(id)) throw new TypeError(`Duplicate transformation id: ${id}.`);
    ids.add(id);
    if (!TRANSFORMATION_TYPES.includes(type)) throw new TypeError(`Unsupported transformation type: ${type}.`);
    if (type === 'derive-column') {
      requireNonEmpty(definition.targetColumn, 'targetColumn', id);
      if (known && known.has(definition.targetColumn)) throw new Error(`Transformation ${id} target column \"${definition.targetColumn}\" already exists.`);
      requireNonEmpty(definition.expression, 'expression', id);
      if (!['number', 'text', 'date'].includes(definition.resultType)) throw new TypeError(`Transformation ${id} resultType must be number, text, or date.`);
      const ast = parseExpression(definition.expression);
      for (const column of expressionColumns(ast)) requireColumn(column, 'expression column', id, known);
      known?.add(definition.targetColumn);
    } else if (type === 'derive-month') {
      requireColumn(definition.sourceColumn, 'sourceColumn', id, known);
      requireNonEmpty(definition.targetColumn, 'targetColumn', id);
      if (known && known.has(definition.targetColumn)) throw new Error(`Transformation ${id} target column "${definition.targetColumn}" already exists.`);
      known?.add(definition.targetColumn);
    } else if (['trim-text', 'normalize-case', 'replace-value', 'fill-missing', 'convert-to-date', 'remove-rows-missing'].includes(type)) {
      requireColumn(definition.column, 'column', id, known);
      if (type === 'normalize-case' && !['lower', 'upper'].includes(definition.mode)) throw new TypeError(`Transformation ${id} mode must be lower or upper.`);
      if (type === 'replace-value' && typeof definition.find !== 'string') throw new TypeError(`Transformation ${id} requires a string find value.`);
      if (type === 'replace-value' && typeof definition.replaceWith !== 'string') throw new TypeError(`Transformation ${id} requires a string replacement.`);
      if (type === 'fill-missing' && typeof definition.value !== 'string') throw new TypeError(`Transformation ${id} requires a string fill value.`);
      if (type === 'convert-to-date' && !['missing', 'keep', 'remove-row'].includes(definition.onInvalid)) throw new TypeError(`Transformation ${id} onInvalid must be missing, keep, or remove-row.`);
    } else if (type === 'remove-duplicate-rows') {
      if (definition.columns !== undefined && (!Array.isArray(definition.columns) || !definition.columns.length || definition.columns.some(column => typeof column !== 'string' || (known && !known.has(column))))) {
        throw new TypeError(`Transformation ${id} columns must be a non-empty list of known columns.`);
      }
    }
    return clone(definition);
  });
}

function requireNonEmpty(value, field, id) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`Transformation ${id} requires ${field}.`);
}
function requireColumn(value, field, id, known) {
  requireNonEmpty(value, field, id);
  if (known && !known.has(value)) throw new Error(`Transformation ${id} references missing column "${value}".`);
}

/** Apply one serializable definition to a copied raw table. */
export function applyTransformationDefinition(input, definition) {
  const table = validateRawTable(input);
  const [validated] = validateTransformationDefinitions([definition], table.columns);
  const {type} = validated;
  if (type === 'derive-column') {
    const ast = parseExpression(validated.expression);
    const rows = table.rows.map(row => {
      const raw = evaluateExpression(ast, row);
      let value = raw;
      if (raw == null || (typeof raw === 'string' && raw.trim() === '')) value = '';
      else if (validated.resultType === 'number') { const n = Number(raw); value = Number.isFinite(n) ? n : ''; }
      else if (validated.resultType === 'date') { const normalized = normalizeDate(String(raw)); value = normalized ?? ''; }
      else value = String(raw);
      return {...row, [validated.targetColumn]: value};
    });
    return {...table, columns: [...table.columns, validated.targetColumn], rows};
  }
  if (type === 'derive-month') {
    const {sourceColumn: source, targetColumn: target} = validated;
    return {...table, columns: [...table.columns, target], rows: table.rows.map(row => ({...row, [target]: typeof row[source] === 'string' ? row[source].slice(0, 7) : ''}))};
  }
  if (type === 'trim-text') return {...table, rows: table.rows.map(row => ({...row, [validated.column]: typeof row[validated.column] === 'string' ? row[validated.column].trim() : row[validated.column]}))};
  if (type === 'normalize-case') return {...table, rows: table.rows.map(row => ({...row, [validated.column]: typeof row[validated.column] === 'string' ? (validated.mode === 'upper' ? row[validated.column].toUpperCase() : row[validated.column].toLowerCase()) : row[validated.column]}))};
  if (type === 'replace-value') return {...table, rows: table.rows.map(row => ({...row, [validated.column]: row[validated.column] === validated.find ? validated.replaceWith : row[validated.column]}))};
  if (type === 'fill-missing') return {...table, rows: table.rows.map(row => isMissing(row[validated.column]) ? {...row, [validated.column]: validated.value} : row)};
  if (type === 'convert-to-date') {
    const rows = [];
    for (const row of table.rows) {
      const value = row[validated.column];
      if (isMissing(value)) { rows.push({...row, [validated.column]: ''}); continue; }
      const normalized = normalizeDate(value);
      if (normalized !== null) { rows.push({...row, [validated.column]: normalized}); continue; }
      if (validated.onInvalid === 'keep') rows.push({...row});
      else if (validated.onInvalid === 'missing') rows.push({...row, [validated.column]: ''});
      // remove-row deliberately omits invalid values from the output.
    }
    return {...table, rows};
  }
  if (type === 'remove-rows-missing') return {...table, rows: table.rows.filter(row => !isMissing(row[validated.column]))};
  if (type === 'remove-duplicate-rows') {
    const keys = validated.columns ?? table.columns;
    const seen = new Set();
    const rows = table.rows.filter(row => {
      const key = JSON.stringify(keys.map(column => row[column] ?? null));
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return {...table, rows};
  }
  throw new TypeError(`Unsupported transformation type: ${type}.`);
}

export function replayTransformationDefinitions(rawInput, definitions = []) {
  let table = validateRawTable(rawInput, {cloneRows: false, validateRows: false});
  const validated = validateTransformationDefinitions(definitions);
  for (const definition of validated) table = applyTransformationDefinition(table, definition);
  return {table, definitions: validated};
}

export function createTransformationProvenance(definitions = []) {
  return validateTransformationDefinitions(definitions).map((definition, index) => ({
    order: index + 1, id: definition.id, type: definition.type,
    parameters: Object.fromEntries(Object.entries(definition).filter(([key]) => !['id', 'type'].includes(key)))
  }));
}

function normalizeDate(value) {
  if (typeof value !== 'string' && typeof value !== 'number' && !(value instanceof Date)) return null;
  const text = value instanceof Date ? value.toISOString() : String(value).trim();
  if (!text) return null;
  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp)) return null;
  const date = new Date(timestamp);
  // Date-only ISO values stay date-only; timestamps normalize to their UTC date.
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const iso = date.toISOString().slice(0, 10);
    if (iso !== text) return null;
    return text;
  }
  return date.toISOString().slice(0, 10);
}
