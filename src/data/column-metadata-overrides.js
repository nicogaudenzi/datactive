import {validateCanonicalDataset} from './dataset-schema.js';

export const COLUMN_TYPES = Object.freeze(['number', 'date', 'string', 'boolean', 'unknown']);
export const COLUMN_ROLES = Object.freeze(['dimension', 'measure', 'identifier', 'ignore']);
export const COLUMN_GEOGRAPHIC_ROLES = Object.freeze(['country', 'state-province', 'county-district', 'city', 'postal-code', 'custom-region']);

/** Apply explicit user overrides to metadata without modifying source values. */
export function applyColumnMetadataOverrides(input, overrides = {}) {
  const dataset = validateCanonicalDataset(input);
  for (const column of dataset.columns) {
    const override = overrides?.[column];
    if (!override || typeof override !== 'object') continue;
    if (COLUMN_TYPES.includes(override.type)) dataset.columnMetadata[column].type = override.type;
    if (COLUMN_ROLES.includes(override.role)) dataset.columnMetadata[column].role = override.role;
    if (COLUMN_GEOGRAPHIC_ROLES.includes(override.geographicRole)) dataset.columnMetadata[column].geographicRole = override.geographicRole;
  }
  return validateCanonicalDataset(dataset);
}

/** Keep only valid, known-column overrides before persisting user settings. */
export function validateColumnMetadataOverrides(datasetInput, overrides) {
  const dataset = validateCanonicalDataset(datasetInput);
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) throw new TypeError('Column metadata overrides must be an object.');
  const result = {};
  for (const column of dataset.columns) {
    const value = overrides[column];
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const entry = {};
    if (value.type !== undefined) {
      if (!COLUMN_TYPES.includes(value.type)) throw new TypeError(`Invalid type override for "${column}".`);
      entry.type = value.type;
    }
    if (value.role !== undefined) {
      if (!COLUMN_ROLES.includes(value.role)) throw new TypeError(`Invalid role override for "${column}".`);
      entry.role = value.role;
    }
    if (value.geographicRole !== undefined) {
      if (!COLUMN_GEOGRAPHIC_ROLES.includes(value.geographicRole)) throw new TypeError(`Invalid geographic role override for "${column}".`);
      entry.geographicRole = value.geographicRole;
    }
    if (Object.keys(entry).length) result[column] = entry;
  }
  return result;
}
