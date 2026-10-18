import {validateCustomMapCollection} from '../maps/custom-map-document.js';

/**
 * Canonical, serializable dashboard document contract (D1).
 *
 * The document stores the complete reproducible workflow: source reference (and
 * optional embedded raw source data), preparation definitions, column annotations/overrides, and
 * visualization configuration/layout. Runtime objects and transient filters are excluded.
 */
export const DASHBOARD_DOCUMENT_SCHEMA = 'dashboard-builder/dashboard';
export const DASHBOARD_DOCUMENT_VERSION = 1;

/**
 * Build a versioned dashboard document without retaining mutable references.
 * `dataSource` describes how to identify/reconnect to data; it is not the data.
 */
export function createDashboardDocument({
  name = 'Untitled dashboard',
  dataSource,
  visualizations = [],
  grid = {columns: 12, cellHeight: 80, margin: 8},
  processing = {transformations: [], annotations: {}, metadataOverrides: {}},
  sourceData = null
} = {}) {
  return {
    schema: DASHBOARD_DOCUMENT_SCHEMA,
    version: DASHBOARD_DOCUMENT_VERSION,
    metadata: {name},
    dataSource: cloneJsonValue(dataSource),
    settings: {grid: cloneJsonValue(grid)},
    processing: cloneJsonValue(processing),
    ...(sourceData ? {sourceData: cloneJsonValue(sourceData)} : {}),
    visualizations: cloneJsonValue(visualizations)
  };
}

/** Return an array of validation errors; an empty array means the document shape is valid. */
export function validateDashboardDocument(document) {
  const errors = [];
  if (!isRecord(document)) return ['Dashboard document must be an object.'];
  if (document.schema !== DASHBOARD_DOCUMENT_SCHEMA) errors.push('Unrecognized dashboard document schema.');
  if (document.version !== DASHBOARD_DOCUMENT_VERSION) errors.push(`Unsupported dashboard document version: ${document.version ?? '(missing)'}.`);
  if (!isRecord(document.metadata) || typeof document.metadata.name !== 'string' || !document.metadata.name.trim()) {
    errors.push('Dashboard metadata must include a non-empty name.');
  }
  if (!isRecord(document.dataSource)) {
    errors.push('Dashboard dataSource must describe the expected data source.');
  } else {
    if (typeof document.dataSource.type !== 'string' || !document.dataSource.type.trim()) errors.push('dataSource.type is required.');
    if (document.dataSource.reference != null && typeof document.dataSource.reference !== 'string') errors.push('dataSource.reference must be a string when provided.');
    if (document.dataSource.expectedSchema != null) {
      const expected = document.dataSource.expectedSchema;
      if (!isRecord(expected) || !Array.isArray(expected.columns) || expected.columns.some(column => typeof column !== 'string')) {
        errors.push('dataSource.expectedSchema.columns must be an array of column names.');
      }
    }
  }
  if (!isRecord(document.settings) || !isRecord(document.settings.grid)) {
    errors.push('Dashboard settings must include grid settings.');
  } else {
    const {columns, cellHeight, margin} = document.settings.grid;
    if (!Number.isInteger(columns) || columns < 1) errors.push('Grid columns must be a positive integer.');
    if (typeof cellHeight !== 'number' || !Number.isFinite(cellHeight) || cellHeight <= 0) errors.push('Grid cellHeight must be a positive number.');
    if (typeof margin !== 'number' || !Number.isFinite(margin) || margin < 0) errors.push('Grid margin must be a non-negative number.');
  }
  if (document.processing != null) {
    if (!isRecord(document.processing)) errors.push('processing must be an object.');
    else {
      if (document.processing.transformations != null && !Array.isArray(document.processing.transformations)) errors.push('processing.transformations must be an array.');
      if (document.processing.annotations != null && !isRecord(document.processing.annotations)) errors.push('processing.annotations must be an object.');
      if (document.processing.metadataOverrides != null && !isRecord(document.processing.metadataOverrides)) errors.push('processing.metadataOverrides must be an object.');
      if (document.processing.customMaps != null) {
        try { validateCustomMapCollection(document.processing.customMaps); }
        catch (error) { errors.push(`processing.customMaps is invalid: ${error.message}`); }
      }
      if (document.processing.geography != null) {
        const geography = document.processing.geography;
        if (!isRecord(geography)) errors.push('processing.geography must be an object.');
        else {
          if (geography.version !== 1) errors.push('processing.geography.version must be 1.');
          if (!Array.isArray(geography.mappings)) errors.push('processing.geography.mappings must be an array.');
          else {
            const targets = new Set();
            geography.mappings.forEach((mapping, index) => {
              if (!isRecord(mapping) || typeof mapping.mapId !== 'string' || !mapping.mapId.trim() || typeof mapping.column !== 'string' || !mapping.column.trim() || !Array.isArray(mapping.values)) {
                errors.push(`processing.geography.mappings[${index}] is invalid.`);
                return;
              }
              const target = `${mapping.mapId}\u0000${mapping.column}`;
              if (targets.has(target)) errors.push(`Duplicate geography mapping for map "${mapping.mapId}" and column "${mapping.column}".`);
              targets.add(target);
              const sources = new Set();
              mapping.values.forEach((entry, valueIndex) => {
                const validSource = isRecord(entry) && Object.hasOwn(entry, 'sourceValue') && (entry.sourceValue === null || ['string', 'number', 'boolean'].includes(typeof entry.sourceValue));
                if (!validSource || typeof entry.regionId !== 'string' || !entry.regionId.trim()) {
                  errors.push(`processing.geography.mappings[${index}].values[${valueIndex}] is invalid.`);
                } else {
                  const source = JSON.stringify(entry.sourceValue);
                  if (sources.has(source)) errors.push(`Duplicate source value in geography mapping for column "${mapping.column}".`);
                  sources.add(source);
                }
              });
            });
          }
        }
      }
      if (document.processing.customMaps != null && document.processing.geography?.mappings && Array.isArray(document.processing.customMaps.maps)) {
        const customMaps = new Map(document.processing.customMaps.maps.filter(map => map && typeof map.id === 'string').map(map => [map.id, map]));
        for (const mapping of document.processing.geography.mappings) {
          const customMap = customMaps.get(mapping?.mapId);
          if (!customMap) continue;
          const regionIds = new Set(Array.isArray(customMap.regions) ? customMap.regions.map(region => region?.id) : []);
          for (const value of Array.isArray(mapping.values) ? mapping.values : []) {
            if (typeof value?.regionId === 'string' && !regionIds.has(value.regionId)) errors.push(`Geography mapping for custom map "${mapping.mapId}" refers to unknown region id "${value.regionId}".`);
          }
        }
      }
    }
  }
  if (document.sourceData != null) {
    if (!isRecord(document.sourceData)) errors.push('sourceData must be an object when included.');
    else if (document.sourceData.format === 'csv') {
      if (typeof document.sourceData.text !== 'string' || !document.sourceData.text.trim()) errors.push('CSV sourceData must contain non-empty text.');
    } else if (document.sourceData.format === 'table') {
      const table = document.sourceData.table;
      if (!isRecord(table) || !Array.isArray(table.columns) || !Array.isArray(table.rows)) errors.push('Table sourceData must contain columns and rows.');
    } else errors.push('sourceData format must be csv or table.');
    if (isRecord(document.sourceData) && document.sourceData.name != null && typeof document.sourceData.name !== 'string') errors.push('sourceData.name must be a string when provided.');
  }
  if (!Array.isArray(document.visualizations)) {
    errors.push('Dashboard visualizations must be an array.');
  } else {
    const ids = new Set();
    document.visualizations.forEach((visualization, index) => {
      if (!isRecord(visualization)) {
        errors.push(`Visualization ${index + 1} must be an object.`);
        return;
      }
      if (typeof visualization.id !== 'string' || !visualization.id.trim()) errors.push(`Visualization ${index + 1} must have an id.`);
      else if (ids.has(visualization.id)) errors.push(`Duplicate visualization id: ${visualization.id}.`);
      else ids.add(visualization.id);
      if (typeof visualization.type !== 'string' || !visualization.type.trim()) errors.push(`Visualization ${index + 1} must have a type.`);
      if (typeof visualization.title !== 'string') errors.push(`Visualization ${index + 1} must have a title string.`);
      if (!isRecord(visualization.query)) errors.push(`Visualization ${index + 1} must have a query object.`);
      const layout = visualization.layout;
      if (!isRecord(layout)) errors.push(`Visualization ${index + 1} must have layout settings.`);
      else {
        for (const key of ['x', 'y', 'w', 'h']) {
          if (layout[key] != null && (!Number.isFinite(layout[key]) || !Number.isInteger(layout[key]))) {
            errors.push(`Visualization ${index + 1} layout.${key} must be an integer when provided.`);
          }
        }
        if (layout.w != null && layout.w < 1) errors.push(`Visualization ${index + 1} layout.w must be positive.`);
        if (layout.h != null && layout.h < 1) errors.push(`Visualization ${index + 1} layout.h must be positive.`);
      }
    });
  }
  return errors;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneJsonValue(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}
